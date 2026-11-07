import {
  APP_ORIGINS, bankInfo, corsFor, db, getSettings, jsonRes, lineUserFrom, orderCreatedMsg, publicOrder, pushTo, UserError,
} from '../_shared/presale.ts'

// 玩家端（LIFF）預售訂單操作。Authorization: Bearer <LIFF access token>
// POST body:
//   { action: 'get',       code }                              → 結帳頁讀訂單（未認領或自己的）
//   { action: 'claim',     code, name, phone, email }          → 認領：綁定 LINE、轉 awaiting_payment、推播匯款資訊
//   { action: 'my_orders' }                                    → 我的訂單
//   { action: 'remit',     order_id, remit_date, last5, amount? } → 回填匯款資料、轉 reviewing

const UNCLAIMED_TTL = 24 * 3600e3
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

async function orderByCode(code: unknown) {
  const c = String(code ?? '').trim()
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(c)) throw new UserError('訂單連結不正確，請回官網重新結帳')
  const { data, error } = await db.from('presale_orders').select('*').eq('code', c).maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) throw new UserError('找不到這張訂單，請回官網重新結帳', 404)
  return data
}

// deno-lint-ignore no-explicit-any
function checkReadable(o: any, me: string) {
  if (o.user_id && o.user_id !== me) throw new UserError('這張訂單已經被其他帳號認領了', 403)
  if (o.status === 'cancelled') throw new UserError('這張訂單已取消')
  if (o.status === 'expired' || (o.status === 'unclaimed' && Date.parse(o.created_at) < Date.now() - UNCLAIMED_TTL)) {
    throw new UserError('這個結帳連結已失效（超過 24 小時），請回官網重新結帳')
  }
}

Deno.serve(async (req) => {
  const cors = corsFor(req, APP_ORIGINS)
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return jsonRes(cors, { error: 'Method not allowed' }, 405)

  try {
    const me = await lineUserFrom(req)
    // deno-lint-ignore no-explicit-any
    let body: any
    try { body = await req.json() } catch { throw new UserError('資料格式錯誤') }

    switch (body.action) {
      case 'get': {
        const o = await orderByCode(body.code)
        checkReadable(o, me)
        const settings = o.user_id ? await getSettings() : null
        return jsonRes(cors, { order: publicOrder(o), bank: settings ? bankInfo(settings) : null })
      }

      case 'claim': {
        const name = String(body.name ?? '').trim().slice(0, 50)
        const phone = String(body.phone ?? '').replace(/[\s-]/g, '').slice(0, 20)
        const email = String(body.email ?? '').trim().slice(0, 100)
        if (!name) throw new UserError('請填寫姓名')
        if (!/^\+?\d{8,15}$/.test(phone)) throw new UserError('請填寫正確的手機號碼')
        if (!EMAIL.test(email)) throw new UserError('請填寫正確的 Email')

        const o = await orderByCode(body.code)
        checkReadable(o, me)
        const settings = await getSettings()
        if (o.user_id === me) {
          // 已經認領過（重新整理）：直接回訂單，不重複推播
          return jsonRes(cors, { order: publicOrder(o), bank: bankInfo(settings) })
        }

        const { data: claimed, error } = await db.from('presale_orders')
          .update({
            user_id: me, status: 'awaiting_payment', claimed_at: new Date().toISOString(),
            contact_name: name, contact_phone: phone, contact_email: email,
          })
          .eq('id', o.id).eq('status', 'unclaimed').is('user_id', null)
          .select('*').maybeSingle()
        if (error) {
          if (error.code === '23503') throw new UserError('請先完成會員註冊再結帳')
          throw new Error(error.message)
        }
        if (!claimed) {
          // 同時有人搶先認領：重讀一次判斷是不是自己
          const again = await orderByCode(body.code)
          checkReadable(again, me)
          return jsonRes(cors, { order: publicOrder(again), bank: bankInfo(settings) })
        }

        // 會員資料只補空的：手機／Email 原本沒填才寫進去，已有的不覆寫；失敗不影響訂單
        try {
          const { data: priv } = await db.from('users_private').select('phone, email').eq('user_id', me).maybeSingle()
          const patch: Record<string, string> = {}
          if (!priv?.phone?.trim()) patch.phone = phone
          if (!priv?.email?.trim()) patch.email = email
          if (Object.keys(patch).length) {
            const { error: pe } = priv
              ? await db.from('users_private').update(patch).eq('user_id', me)
              : await db.from('users_private').insert({ user_id: me, ...patch })
            if (pe) console.error('補會員資料失敗', pe.message)
          }
        } catch (err) {
          console.error('補會員資料失敗', err)
        }

        const pushError = await pushTo(me, [orderCreatedMsg(claimed, settings)])
        return jsonRes(cors, { order: publicOrder(claimed), bank: bankInfo(settings), push_error: pushError })
      }

      case 'my_orders': {
        const { data, error } = await db.from('presale_orders').select('*')
          .eq('user_id', me).neq('status', 'expired').order('created_at', { ascending: false }).limit(50)
        if (error) throw new Error(error.message)
        const settings = await getSettings()
        return jsonRes(cors, { orders: (data ?? []).map(publicOrder), bank: bankInfo(settings) })
      }

      case 'remit': {
        const date = String(body.remit_date ?? '')
        const last5 = String(body.last5 ?? '').trim()
        const amountRaw = body.amount === '' || body.amount == null ? null : Number(body.amount)
        if (!/^[0-9a-f-]{36}$/i.test(String(body.order_id ?? ''))) throw new UserError('找不到這張訂單')
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || isNaN(Date.parse(date))) throw new UserError('請選擇匯款日期')
        if (Date.parse(date) > Date.now() + 86400e3) throw new UserError('匯款日期不能是未來')
        if (!/^\d{5}$/.test(last5)) throw new UserError('帳號後五碼要是 5 位數字')
        if (amountRaw !== null && (!Number.isInteger(amountRaw) || amountRaw <= 0 || amountRaw > 1_000_000)) {
          throw new UserError('匯款金額格式不正確')
        }

        const { data, error } = await db.from('presale_orders')
          .update({
            status: 'reviewing', remit_date: date, remit_last5: last5, remit_amount: amountRaw,
            remit_reported_at: new Date().toISOString(),
          })
          .eq('id', String(body.order_id ?? '')).eq('user_id', me).eq('status', 'awaiting_payment')
          .select('*').maybeSingle()
        if (error) throw new Error(error.message)
        if (!data) throw new UserError('這張訂單現在不能填寫匯款資料（可能已在查帳中）')
        return jsonRes(cors, { order: publicOrder(data) })
      }

      default:
        throw new UserError('未知的 action')
    }
  } catch (err) {
    if (err instanceof UserError) return jsonRes(cors, { error: err.message }, err.status)
    console.error('presale-member 失敗:', err)
    return jsonRes(cors, { error: '系統忙碌，請稍後再試' }, 500)
  }
})
