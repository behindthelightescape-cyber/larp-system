import {
  corsFor, db, getSettings, jsonRes, priceOf, SITE_ORIGINS, UserError, type Item, type Tier,
} from '../_shared/presale.ts'

// POST（免登入）：官網按「用 LINE 結帳」時呼叫。
// 輸入：{ "items": ["umbrella","acacia",...], "qty": 1, "utm": { "source","medium","campaign" } }
//   items 是劇本代號清單（1～7 本、不可重複）；qty 是幾人份（1～10，預設 1），每本都買 qty 張。
// 回傳：{ code, liff_url, order_no, qty, subtotal, discount, total }
// 金額一律用資料庫價格重算，不信任網站送來的任何價格。

const MAX_ITEMS = 7
const MAX_QTY = 10
const RATE_PER_MIN = 10

const randomCode = () => {
  const b = new Uint8Array(24)
  crypto.getRandomValues(b)
  return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') // 32 字元
}
const utmText = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 100) : null)

Deno.serve(async (req) => {
  const cors = corsFor(req, SITE_ORIGINS)
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return jsonRes(cors, { error: 'Method not allowed' }, 405)

  try {
    // 限流：同 IP 每分鐘最多 10 次
    const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'unknown'
    const { count } = await db.from('presale_rate').select('*', { count: 'exact', head: true })
      .eq('ip', ip).gte('at', new Date(Date.now() - 60e3).toISOString())
    if ((count ?? 0) >= RATE_PER_MIN) throw new UserError('操作太頻繁，請一分鐘後再試', 429)
    await db.from('presale_rate').insert({ ip })

    let body: { items?: unknown; qty?: unknown; utm?: Record<string, unknown> }
    try { body = await req.json() } catch { throw new UserError('資料格式錯誤') }

    const ids = Array.isArray(body.items) ? body.items.map((x) => String(x ?? '').trim()) : []
    if (ids.length === 0) throw new UserError('請至少選一本劇本')
    if (new Set(ids).size !== ids.length) throw new UserError('同一本劇本不能重複選，要買多張請改「人份」')
    if (ids.length > MAX_ITEMS) throw new UserError(`一次最多 ${MAX_ITEMS} 本`)
    const qty = body.qty === undefined || body.qty === null ? 1 : Number(body.qty)
    if (!Number.isInteger(qty) || qty < 1 || qty > MAX_QTY) throw new UserError(`人份要是 1～${MAX_QTY} 的整數`)

    const settings = await getSettings()
    const [{ data: rows, error: e1 }, { data: tiers, error: e2 }] = await Promise.all([
      db.from('presale_items').select('id, title, price, is_active, sale_start, sale_end').in('id', ids),
      db.from('presale_tiers').select('min_qty, discount_per_item'),
    ])
    if (e1 || e2) throw new Error((e1 ?? e2)!.message)

    const now = Date.now()
    const byId = new Map((rows ?? []).map((r) => [r.id, r]))
    const items: Item[] = []
    let beforeStart = false
    for (const id of ids) {
      const r = byId.get(id)
      if (!r || !r.is_active) throw new UserError(`找不到這本劇本或已下架：${id}`)
      if (r.sale_end && Date.parse(r.sale_end) < now) throw new UserError(`《${r.title}》預售已結束`)
      if (r.sale_start && Date.parse(r.sale_start) > now) {
        if (!settings.test_mode) throw new UserError('預售還沒開始，11/11 00:00 開賣')
        beforeStart = true
      }
      items.push({ id: r.id, title: r.title, price: r.price })
    }

    const price = priceOf(items, (tiers ?? []) as Tier[], qty)
    const { data: orderNo, error: e3 } = await db.rpc('presale_next_order_no')
    if (e3) throw new Error(e3.message)

    const code = randomCode()
    const utm = body.utm ?? {}
    const { error: e4 } = await db.from('presale_orders').insert({
      code, order_no: orderNo, items, qty, ...price, status: 'unclaimed',
      utm_source: utmText(utm.source ?? utm.utm_source),
      utm_medium: utmText(utm.medium ?? utm.utm_medium),
      utm_campaign: utmText(utm.campaign ?? utm.utm_campaign),
      is_test: settings.test_mode && beforeStart,
    })
    if (e4) throw new Error(e4.message)

    return jsonRes(cors, {
      code,
      liff_url: `https://liff.line.me/2009161687-icfQU9r6?order=${code}`,
      order_no: orderNo,
      qty,
      ...price,
    })
  } catch (err) {
    if (err instanceof UserError) return jsonRes(cors, { error: err.message }, err.status)
    console.error('presale-order-create 失敗:', err)
    return jsonRes(cors, { error: '建立訂單失敗，請稍後再試' }, 500)
  }
})
