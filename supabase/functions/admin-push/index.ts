import {
  getQuota, missingTextFn, PushError, resolveTarget, sendPush, supabase, validateMessage, LINE_TOKEN,
  type Target,
} from '../_shared/push.ts'

// 後台自訂推播：發 LINE 訊息給指定會員或篩選出來的會員（批量廣告），可立即發送或預約。
// 只有 users.role 在 ALLOWED_ROLES 的人可以呼叫（要開放店長就加 'manager'）。
//
// POST body:
//   { action: 'quota' }                                     → 本月額度 / 已用
//   { action: 'preview', target }                           → 預計人數 + 前幾位名單
//   { action: 'send', target, message, title? }             → 立即發送
//   { action: 'schedule', target, message, title?, send_at } → 預約（send_at 為 ISO 時間）
//   { action: 'list_scheduled' }                            → 預約清單
//   { action: 'cancel', id }                                → 取消尚未發送的預約
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
  return rows?.find((r) => ALLOWED_ROLES.includes(r.role)) ?? null
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  if (!LINE_TOKEN) return json({ error: '找不到 LINE_CHANNEL_ACCESS_TOKEN' }, 500)

  const caller = await getCaller(req)
  if (!caller) return json({ error: '沒有權限' }, 403)
  const callerName = caller.display_name ?? caller.id

  let body: { action?: string; target?: Target; message?: string; title?: string; send_at?: string; id?: string }
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
          .select('id, title, message, send_at, status, estimated_count, result, error_msg, created_by_name, created_at, sent_at')
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
        const title = (body.title ?? '').trim() || message.slice(0, 20)
        const r = await sendPush({
          target: body.target, message, taskName: `[自訂] ${title}`, source: 'custom', createdByName: callerName,
        })
        return json({ success: r.success, fail: r.fail, errors: r.errors })
      }

      case 'schedule': {
        if (!body.target) return json({ error: '缺少 target' }, 400)
        const message = (body.message ?? '').trim()
        validateMessage(message, body.target)
        const sendAt = Date.parse(body.send_at ?? '')
        if (isNaN(sendAt)) return json({ error: '預約時間格式錯誤' }, 400)
        if (sendAt < Date.now() + 60 * 1000) return json({ error: '預約時間至少要在 1 分鐘後' }, 400)
        if (sendAt > Date.now() + 90 * 86400e3) return json({ error: '最多只能預約 90 天內' }, 400)

        const { ids } = await resolveTarget(body.target)
        if (ids.length === 0) return json({ error: '沒有符合條件的會員' }, 400)

        const { data, error } = await supabase.from('scheduled_pushes').insert([{
          title: (body.title ?? '').trim() || message.slice(0, 20),
          message,
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
