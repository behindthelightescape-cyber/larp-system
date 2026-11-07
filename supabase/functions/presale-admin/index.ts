import {
  APP_ORIGINS, corsFor, db, getSettings, issuedMsg, jsonRes, pushTo, rejectedMsg, UserError,
} from '../_shared/presale.ts'

// 後台預售訂單管理。users.role 在 ALLOWED_ROLES 的人可以呼叫；改匯款設定（save_settings）只限 admin。
// POST body:
//   { action: 'list', status? }               → 訂單列表（status 不填＝全部，不含 expired）＋各狀態筆數
//   { action: 'approve', id }                 → reviewing → issued，同一個交易逐本發券，再推播
//   { action: 'reject', id, reason }          → reviewing → awaiting_payment，附原因、推播
//   { action: 'cancel', id }                  → 未發券的訂單 → cancelled
//   { action: 'get_settings' } / { action: 'save_settings', settings }
//   { action: 'stats' }                       → 統計

const ALLOWED_ROLES = ['admin', 'manager']
const UUID = /^[0-9a-f-]{36}$/i

async function getCaller(req: Request) {
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (!token) return null
  const { data, error } = await db.auth.getUser(token)
  if (error || !data.user) return null
  const candidates = [data.user.id, data.user.user_metadata?.line_user_id].filter(Boolean)
  const { data: rows } = await db.from('users').select('id, display_name, role').in('id', candidates)
  return rows?.find((r) => ALLOWED_ROLES.includes(r.role)) ?? null
}

const twDate = (iso: string) => new Date(Date.parse(iso) + 8 * 3600e3).toISOString().slice(0, 10)

Deno.serve(async (req) => {
  const cors = corsFor(req, APP_ORIGINS)
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return jsonRes(cors, { error: 'Method not allowed' }, 405)

  try {
    const caller = await getCaller(req)
    if (!caller) throw new UserError('沒有權限', 403)
    const callerName = caller.display_name ?? caller.id
    // deno-lint-ignore no-explicit-any
    let body: any
    try { body = await req.json() } catch { throw new UserError('body 必須是 JSON') }
    const id = String(body.id ?? '')
    const needId = () => { if (!UUID.test(id)) throw new UserError('缺少訂單 id') }

    switch (body.action) {
      case 'list': {
        let q = db.from('presale_orders').select('*').order('created_at', { ascending: false }).limit(500)
        if (body.status) q = q.eq('status', String(body.status))
        else q = q.neq('status', 'expired')
        const { data, error } = await q
        if (error) throw new Error(error.message)
        const ids = [...new Set((data ?? []).map((o) => o.user_id).filter(Boolean))]
        const { data: users } = ids.length
          ? await db.from('users').select('id, display_name, legacy_id').in('id', ids)
          : { data: [] }
        const um = new Map((users ?? []).map((u) => [u.id, u]))
        const { data: all } = await db.from('presale_orders').select('status')
        const counts: Record<string, number> = {}
        for (const r of all ?? []) counts[r.status] = (counts[r.status] ?? 0) + 1
        return jsonRes(cors, {
          orders: (data ?? []).map((o) => ({ ...o, member: o.user_id ? um.get(o.user_id) ?? null : null })),
          counts,
        })
      }

      case 'approve': {
        needId()
        const { data: n, error } = await db.rpc('presale_approve', { p_order_id: id, p_admin: callerName })
        if (error) throw new UserError(error.message)
        const { data: o } = await db.from('presale_orders').select('*').eq('id', id).single()
        const pushError = o?.user_id ? await pushTo(o.user_id, [issuedMsg(o, n as number)]) : null
        return jsonRes(cors, { ok: true, issued: n, push_error: pushError })
      }

      case 'reject': {
        needId()
        const reason = String(body.reason ?? '').trim().slice(0, 200)
        if (!reason) throw new UserError('請填寫退回原因')
        const { data: o, error } = await db.from('presale_orders')
          .update({ status: 'awaiting_payment', reject_reason: reason, reviewed_at: new Date().toISOString(), reviewed_by: callerName })
          .eq('id', id).eq('status', 'reviewing').select('*').maybeSingle()
        if (error) throw new Error(error.message)
        if (!o) throw new UserError('這張訂單不是「待查帳」狀態')
        const pushError = o.user_id ? await pushTo(o.user_id, [rejectedMsg(o)]) : null
        return jsonRes(cors, { ok: true, push_error: pushError })
      }

      case 'cancel': {
        needId()
        const { data: o, error } = await db.from('presale_orders')
          .update({ status: 'cancelled', reviewed_at: new Date().toISOString(), reviewed_by: callerName })
          .eq('id', id).in('status', ['unclaimed', 'awaiting_payment', 'reviewing']).select('id').maybeSingle()
        if (error) throw new Error(error.message)
        if (!o) throw new UserError('已發券或已結束的訂單不能取消')
        return jsonRes(cors, { ok: true })
      }

      case 'get_settings':
        return jsonRes(cors, { settings: await getSettings() })

      case 'save_settings': {
        if (caller.role !== 'admin') throw new UserError('匯款設定只有系統總管可以修改', 403)
        const s = body.settings ?? {}
        const txt = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 200) : null)
        const { error } = await db.from('presale_settings').update({
          bank_name: txt(s.bank_name), bank_code: txt(s.bank_code), account_no: txt(s.account_no),
          account_name: txt(s.account_name), remit_note: txt(s.remit_note),
          test_mode: !!s.test_mode, updated_at: new Date().toISOString(),
        }).eq('id', 1)
        if (error) throw new Error(error.message)
        return jsonRes(cors, { ok: true, settings: await getSettings() })
      }

      case 'stats': {
        const { data, error } = await db.from('presale_orders')
          .select('status, items, qty, total, utm_source, created_at, claimed_at, remit_reported_at, is_test')
          .eq('is_test', !!body.include_test ? true : false)
        if (error) throw new Error(error.message)
        const rows = data ?? []
        const issued = rows.filter((r) => r.status === 'issued')
        const revenue = issued.reduce((s, r) => s + r.total, 0)
        const bucket = (n: number) => (n <= 1 ? '1' : n <= 3 ? '2–3' : n <= 6 ? '4–6' : '7+')
        const qtyDist: Record<string, number> = { '1': 0, '2–3': 0, '4–6': 0, '7+': 0 }
        for (const r of issued) qtyDist[bucket(r.items.length)]++
        const partyDist: Record<string, number> = {}
        for (const r of issued) partyDist[String(r.qty ?? 1)] = (partyDist[String(r.qty ?? 1)] ?? 0) + 1
        const utm: Record<string, { orders: number; revenue: number }> = {}
        for (const r of issued) {
          const k = r.utm_source || '（無）'
          utm[k] ??= { orders: 0, revenue: 0 }
          utm[k].orders++
          utm[k].revenue += r.total
        }
        // 金額依狀態：已付款＝已發券；待查帳＝玩家回報已匯款但還沒確認；未付款＝已認領還沒匯款；未認領＝網站建單後沒登入 LINE
        const sumOf = (st: string) => {
          const rs = rows.filter((r) => r.status === st)
          return { orders: rs.length, amount: rs.reduce((s, r) => s + r.total, 0) }
        }
        const money = {
          paid: sumOf('issued'),
          reviewing: sumOf('reviewing'),
          unpaid: sumOf('awaiting_payment'),
          unclaimed: sumOf('unclaimed'),
        }
        const byDay: Record<string, number> = {}
        for (const r of rows) byDay[twDate(r.created_at)] = (byDay[twDate(r.created_at)] ?? 0) + 1
        return jsonRes(cors, {
          funnel: {
            created: rows.length,
            claimed: rows.filter((r) => r.claimed_at).length,
            reported: rows.filter((r) => r.remit_reported_at).length,
            issued: issued.length,
          },
          revenue,
          money,
          tickets: issued.reduce((s, r) => s + r.items.length * (r.qty ?? 1), 0),
          avg_order: issued.length ? Math.round(revenue / issued.length) : 0,
          qty_dist: qtyDist,
          party_dist: partyDist,
          utm,
          by_day: byDay,
        })
      }

      default:
        throw new UserError('未知的 action')
    }
  } catch (err) {
    if (err instanceof UserError) return jsonRes(cors, { error: err.message }, err.status)
    console.error('presale-admin 失敗:', err)
    return jsonRes(cors, { error: err instanceof Error ? err.message : String(err) }, 500)
  }
})
