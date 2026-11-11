import {
  getQuota, missingTextFn, normalizeExtra, normalizeMedia, PushError, resolveTarget, sendPush, sendTest, supabase, validateUnits, LINE_TOKEN,
  type Media, type Target,
} from '../_shared/push.ts'

// 沒填紀錄標題時：卡片用卡片標題，其他用訊息前 20 字
const defaultTitle = (title: string | undefined, message: string, media: Media) =>
  (title ?? '').trim() ||
  (media?.kind === 'card' ? media.card_title : message.slice(0, 20)) ||
  (media?.kind === 'image' ? '（圖片）' : '')

// 後台自訂推播：發 LINE 訊息給指定會員或篩選出來的會員（批量廣告），可立即發送或預約。
// 只有 users.role 在 ALLOWED_ROLES 的人可以呼叫（要開放店長就加 'manager'）。
//
// POST body:
//   { action: 'quota' }                                     → 本月額度 / 已用
//   { action: 'preview', target }                           → 預計人數 + 前幾位名單
//   { action: 'send', target, message, media?, extra?, title? } → 立即發送（extra＝第 2 個起的對話框 [{message, media}]）
//   { action: 'schedule', target, message, title?, send_at } → 預約（send_at 為 ISO 時間）
//   { action: 'list_scheduled' }                            → 預約清單
//   { action: 'cancel', id }                                → 取消尚未發送的預約
//   { action: 'test_send', message, media?, extra? }        → 只發給自己看（不記紀錄，用掉 1 則額度）
//   { action: 'list_drafts' } / { action: 'save_draft', id?, name, state } / { action: 'delete_draft', id } → 草稿
// target:
//   { mode: 'ids', ids: string[] }   指定會員（users.id）
//   { mode: 'filter', ...Filter }    條件篩選（所有條件 AND）

const ALLOWED_ROLES = ['admin']

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

async function getCaller(req: Request) {
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (!token) return null
  const { data, error } = await supabase.auth.getUser(token)
  if (error || !data.user) return null
  // 後台帳號：users.id = auth uid；LINE 帳號：users.id = LINE user id
  const candidates = [data.user.id, data.user.user_metadata?.line_user_id].filter(Boolean)
  const { data: rows } = await supabase.from('users').select('id, display_name, role').in('id', candidates)
  const row = rows?.find((r) => ALLOWED_ROLES.includes(r.role))
  if (!row) return null
  // 測試發送要用 LINE user id（U 開頭）；後台帳號沒綁 LINE 時是 null
  const lineId = [data.user.user_metadata?.line_user_id, row.id].find((v) => typeof v === 'string' && /^U[0-9a-f]{32}$/.test(v)) ?? null
  return { ...row, lineId }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  if (!LINE_TOKEN) return json({ error: '找不到 LINE_CHANNEL_ACCESS_TOKEN' }, 500)

  const caller = await getCaller(req)
  if (!caller) return json({ error: '沒有權限' }, 403)
  const callerName = caller.display_name ?? caller.id

  let body: { action?: string; target?: Target; message?: string; title?: string; send_at?: string; id?: string; media?: unknown; extra?: unknown; name?: string; state?: unknown; test_legacy_id?: string }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'body 必須是 JSON' }, 400)
  }

  try {
    switch (body.action) {
      case 'quota':
        return json(await getQuota())

      case 'list_scheduled': {
        const { data, error } = await supabase
          .from('scheduled_pushes')
          .select('id, title, message, media, extra, send_at, status, estimated_count, result, error_msg, created_by_name, created_at, sent_at')
          .or(`status.in.(pending,sending),send_at.gte.${new Date(Date.now() - 30 * 86400e3).toISOString()}`)
          .order('send_at', { ascending: false })
          .limit(50)
        if (error) throw new Error(`讀取預約失敗: ${error.message}`)
        return json({ items: data ?? [] })
      }

      case 'cancel': {
        if (!body.id) return json({ error: '缺少 id' }, 400)
        const { data, error } = await supabase
          .from('scheduled_pushes')
          .update({ status: 'cancelled' })
          .eq('id', body.id)
          .eq('status', 'pending')
          .select('id')
        if (error) throw new Error(error.message)
        if (!data?.length) return json({ error: '這筆預約已經在發送或已結束，無法取消' }, 400)
        return json({ ok: true })
      }

      case 'test_send': {
        // 收件人：有填會員編號就發給那位會員（後台 Email 帳號沒有 LINE），沒填就發給自己的 LINE
        let to = caller.lineId
        let toName = callerName
        const legacy = String(body.test_legacy_id ?? '').trim()
        if (legacy) {
          const { data: u } = await supabase.from('users').select('id, display_name').eq('legacy_id', legacy).maybeSingle()
          if (!u || !/^U[0-9a-f]{32}$/.test(u.id)) return json({ error: `找不到會員編號 ${legacy} 的 LINE 帳號` }, 400)
          to = u.id
          toName = u.display_name ?? legacy
        }
        if (!to) return json({ error: '請先填「測試收件人」的會員編號（你的後台帳號沒有綁 LINE）' }, 400)
        return json({ ...(await sendTest(to, body.message ?? '', normalizeMedia(body.media), body.extra)), to_name: toName })
      }

      case 'list_drafts': {
        const { data, error } = await supabase.from('push_drafts')
          .select('id, name, state, created_by_name, updated_at').order('updated_at', { ascending: false }).limit(50)
        if (error) throw new Error(`讀取草稿失敗（請確認 push_drafts.sql 已執行）：${error.message}`)
        return json({ items: data ?? [] })
      }

      case 'save_draft': {
        const name = String(body.name ?? '').trim().slice(0, 60) || '未命名草稿'
        if (!body.state || typeof body.state !== 'object') return json({ error: '草稿內容是空的' }, 400)
        if (JSON.stringify(body.state).length > 200_000) return json({ error: '草稿太大' }, 400)
        const row = { name, state: body.state, created_by_name: callerName, updated_at: new Date().toISOString() }
        const q = body.id
          ? supabase.from('push_drafts').update(row).eq('id', body.id).select('id').maybeSingle()
          : supabase.from('push_drafts').insert([row]).select('id').single()
        const { data, error } = await q
        if (error) throw new Error(`儲存草稿失敗（請確認 push_drafts.sql 已執行）：${error.message}`)
        if (!data) return json({ error: '這份草稿已經被刪掉了，請另存新草稿' }, 400)
        return json({ ok: true, id: data.id })
      }

      case 'delete_draft': {
        if (!body.id) return json({ error: '缺少 id' }, 400)
        const { error } = await supabase.from('push_drafts').delete().eq('id', body.id)
        if (error) throw new Error(error.message)
        return json({ ok: true })
      }

      case 'preview': {
        if (!body.target) return json({ error: '缺少 target' }, 400)
        const { ids, lastPlayed, missing } = await resolveTarget(body.target)
        const missingText = await missingTextFn(missing)
        const { data: sample } = await supabase
          .from('users').select('id, display_name, legacy_id, level').in('id', ids.slice(0, 15))
        const fmt = (t?: number) => (t ? new Date(t + 8 * 3600 * 1000).toISOString().slice(0, 10) : null)
        return json({
          count: ids.length,
          sample: (sample ?? []).map(({ id, ...u }) => ({
            ...u,
            last_played: fmt(lastPlayed?.get(id)),
            missing: missing ? missingText(id) : null,
          })),
        })
      }

      case 'send': {
        if (!body.target) return json({ error: '缺少 target' }, 400)
        const message = (body.message ?? '').trim()
        const media = normalizeMedia(body.media)
        const title = defaultTitle(body.title, message, media)
        const r = await sendPush({
          target: body.target, message, media, extra: body.extra, taskName: `[自訂] ${title}`, source: 'custom', createdByName: callerName,
        })
        return json({ success: r.success, fail: r.fail, errors: r.errors })
      }

      case 'schedule': {
        if (!body.target) return json({ error: '缺少 target' }, 400)
        const message = (body.message ?? '').trim()
        const media = normalizeMedia(body.media)
        const extra = normalizeExtra(body.extra)
        validateUnits([{ message, media }, ...extra], body.target)
        const sendAt = Date.parse(body.send_at ?? '')
        if (isNaN(sendAt)) return json({ error: '預約時間格式錯誤' }, 400)
        if (sendAt < Date.now() + 60 * 1000) return json({ error: '預約時間至少要在 1 分鐘後' }, 400)
        if (sendAt > Date.now() + 90 * 86400e3) return json({ error: '最多只能預約 90 天內' }, 400)

        const { ids } = await resolveTarget(body.target)
        if (ids.length === 0) return json({ error: '沒有符合條件的會員' }, 400)

        const { data, error } = await supabase.from('scheduled_pushes').insert([{
          title: defaultTitle(body.title, message, media),
          message,
          media,
          ...(extra.length ? { extra } : {}),
          target: body.target,
          send_at: new Date(sendAt).toISOString(),
          estimated_count: ids.length,
          created_by: caller.id,
          created_by_name: callerName,
        }]).select('id').single()
        if (error) throw new Error(`建立預約失敗: ${error.message}`)
        return json({ ok: true, id: data.id, estimated_count: ids.length })
      }

      default:
        return json({ error: '未知的 action' }, 400)
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (err instanceof PushError) return json({ error: msg }, 400)
    console.error('admin-push 失敗:', msg)
    return json({ error: msg }, 500)
  }
})
