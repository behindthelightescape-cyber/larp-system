import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

// 雙 11 預售票共用邏輯（presale-catalog / presale-order-create / presale-member / presale-admin）
// 規格：WORDPRESS\spotlight-home\presale\SPEC.md

export const db = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
)
const LINE_TOKEN = Deno.env.get('LINE_CHANNEL_ACCESS_TOKEN') ?? ''
export const LIFF_URL = 'https://liff.line.me/2009161687-icfQU9r6'
const GOLD = '#D4AF37'

// ── CORS ────────────────────────────────────────────────────────────────
// 網站呼叫的（catalog、order-create）只允許官網；LIFF／後台呼叫的允許會員系統網域。
export const SITE_ORIGINS = ['https://spotlightlarp.com', 'https://www.spotlightlarp.com', 'http://localhost:8881']
export const APP_ORIGINS = ['https://larp-system.vercel.app', 'http://localhost:5173']

export function corsFor(req: Request, allowed: string[]) {
  const origin = req.headers.get('Origin') ?? ''
  return {
    'Access-Control-Allow-Origin': allowed.includes(origin) ? origin : allowed[0],
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Vary': 'Origin',
  }
}

export const jsonRes = (cors: Record<string, string>, body: unknown, status = 200, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json', ...extra } })

// 給玩家看的錯誤（400），其他錯誤一律 500
export class UserError extends Error {
  status: number
  constructor(msg: string, status = 400) { super(msg); this.status = status }
}

// ── 價格 ────────────────────────────────────────────────────────────────
export type Item = { id: string; title: string; price: number }
export type Tier = { min_qty: number; discount_per_item: number }

/**
 * 級距看「不同劇本的本數 n」，每一份都折：
 * total ＝（各本單價合計 − 每本折扣 × n）× qty
 */
export function priceOf(items: Item[], tiers: Tier[], qty = 1) {
  const n = items.length
  const perSet = items.reduce((s, i) => s + i.price, 0)
  const tier = [...tiers].sort((a, b) => b.min_qty - a.min_qty).find((t) => n >= t.min_qty)
  const perSetDiscount = Math.min(perSet, (tier?.discount_per_item ?? 0) * n)
  return { subtotal: perSet * qty, discount: perSetDiscount * qty, total: (perSet - perSetDiscount) * qty }
}

export async function getSettings() {
  const { data, error } = await db.from('presale_settings').select('*').eq('id', 1).single()
  if (error) throw new Error(`讀取預售設定失敗: ${error.message}`)
  return data as {
    bank_name: string | null; bank_code: string | null; account_no: string | null
    account_name: string | null; remit_note: string | null; test_mode: boolean
  }
}

export const bankInfo = (s: Awaited<ReturnType<typeof getSettings>>) => ({
  bank_name: s.bank_name, bank_code: s.bank_code, account_no: s.account_no,
  account_name: s.account_name, remit_note: s.remit_note,
})

// ── 玩家登入：LIFF access token → LINE userId ───────────────────────────
export async function lineUserFrom(req: Request): Promise<string> {
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (!token) throw new UserError('請先登入', 401)
  const res = await fetch('https://api.line.me/v2/profile', { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) throw new UserError('LINE 登入已過期，請重新開啟頁面', 401)
  return (await res.json()).userId as string
}

// ── 給玩家看的訂單內容（不含內部欄位）────────────────────────────────────
// deno-lint-ignore no-explicit-any
export const publicOrder = (o: any) => ({
  id: o.id, code: o.code, order_no: o.order_no, status: o.status, items: o.items, qty: o.qty ?? 1,
  subtotal: o.subtotal, discount: o.discount, total: o.total,
  contact_name: o.contact_name, contact_phone: o.contact_phone, contact_email: o.contact_email,
  remit_date: o.remit_date, remit_last5: o.remit_last5, remit_amount: o.remit_amount,
  remit_reported_at: o.remit_reported_at, reject_reason: o.reject_reason,
  created_at: o.created_at, claimed_at: o.claimed_at, reviewed_at: o.reviewed_at, is_test: o.is_test,
})

// ── LINE 推播（單人）────────────────────────────────────────────────────
const nt = (n: number) => `$${n.toLocaleString('en-US')}`

/** 品項彙總：每本 × 人份（舊格式若同一本重複出現也會合併） */
export function itemLines(items: Item[], perQty = 1) {
  const m = new Map<string, { title: string; price: number; qty: number }>()
  for (const i of items) {
    const g = m.get(i.id)
    if (g) g.qty += perQty
    else m.set(i.id, { title: i.title, price: i.price, qty: perQty })
  }
  return [...m.values()]
}

const row = (label: string, value: string, bold = false) => ({
  type: 'box', layout: 'horizontal', margin: 'sm',
  contents: [
    { type: 'text', text: label, size: 'sm', color: '#aaaaaa', flex: 0, wrap: true },
    { type: 'text', text: value, size: 'sm', color: bold ? GOLD : '#ffffff', align: 'end', weight: bold ? 'bold' : 'regular', wrap: true },
  ],
})

// 按鈕：uri＝開網頁（金色主按鈕），copy＝複製文字到剪貼簿（LINE clipboard action，次要按鈕）
type Btn = { label: string; uri: string } | { label: string; copy: string }

function card(altText: string, title: string, body: unknown[], button?: Btn | Btn[]) {
  const buttons = button ? (Array.isArray(button) ? button : [button]) : []
  return {
    type: 'flex', altText: altText.slice(0, 400),
    contents: {
      type: 'bubble',
      styles: { body: { backgroundColor: '#111111' }, footer: { backgroundColor: '#111111' } },
      body: {
        type: 'box', layout: 'vertical', paddingAll: '18px',
        contents: [
          { type: 'text', text: 'SPOTLIGHT 雙11預售', size: 'xs', color: GOLD, weight: 'bold' },
          { type: 'text', text: title, size: 'lg', color: '#ffffff', weight: 'bold', margin: 'sm', wrap: true },
          { type: 'separator', margin: 'md', color: '#333333' },
          ...body,
        ],
      },
      ...(buttons.length ? {
        footer: {
          type: 'box', layout: 'vertical', paddingAll: '12px',
          spacing: 'sm',
          contents: buttons.map((b) => 'copy' in b
            ? { type: 'button', style: 'secondary', height: 'sm', action: { type: 'clipboard', label: b.label, clipboardText: b.copy } }
            : { type: 'button', style: 'primary', color: GOLD, height: 'sm', action: { type: 'uri', label: b.label, uri: b.uri } }),
        },
      } : {}),
    },
  }
}

// deno-lint-ignore no-explicit-any
export function orderCreatedMsg(o: any, s: Awaited<ReturnType<typeof getSettings>>) {
  const qty = o.qty ?? 1
  const lines = itemLines(o.items, qty).map((l) => row(`${l.title}${l.qty > 1 ? ` × ${l.qty}` : ''}`, nt(l.price * l.qty)))
  const bank = [s.bank_name, s.bank_code ? `(${s.bank_code})` : ''].filter(Boolean).join(' ')
  return card(`訂單已成立 ${o.order_no}，應付 ${nt(o.total)}`, '訂單已成立 🎫', [
    row('訂單編號', o.order_no),
    ...(qty > 1 ? [row('人份', `${qty} 人份（每本 ${qty} 張）`)] : []),
    { type: 'box', layout: 'vertical', margin: 'md', contents: lines },
    ...(o.discount ? [row('多本折抵', `−${nt(o.discount)}`)] : []),
    row('應付金額', nt(o.total), true),
    { type: 'separator', margin: 'md', color: '#333333' },
    { type: 'text', text: '請匯款至', size: 'sm', color: '#aaaaaa', margin: 'md' },
    { type: 'text', text: `${bank}\n帳號 ${s.account_no ?? '（尚未設定）'}\n戶名 ${s.account_name ?? ''}`, size: 'sm', color: '#ffffff', wrap: true, margin: 'xs' },
    { type: 'text', text: '匯款後請到「我的訂單」填寫匯款日期與帳號後五碼。', size: 'xs', color: '#888888', wrap: true, margin: 'md' },
  ], [
    ...(s.account_no ? [{ label: '複製匯款帳號', copy: s.account_no.replace(/[\s-]/g, '') }] : []),
    { label: '複製金額', copy: String(o.total) },
    { label: '填寫匯款資料', uri: `${LIFF_URL}?goto=orders` },
  ])
}

// deno-lint-ignore no-explicit-any
export function rejectedMsg(o: any) {
  return card(`訂單 ${o.order_no} 匯款資料需要重新填寫`, '匯款資料需要重新填寫', [
    row('訂單編號', o.order_no),
    { type: 'text', text: `原因：${o.reject_reason || '（未填）'}`, size: 'sm', color: '#ffffff', wrap: true, margin: 'md' },
  ], { label: '重新填寫', uri: `${LIFF_URL}?goto=orders` })
}

// deno-lint-ignore no-explicit-any
export function issuedMsg(o: any, count: number) {
  return card(`你買的 ${count} 張預售票已經放進帳戶了`, '票已經放進你的帳戶了 🎉', [
    row('訂單編號', o.order_no),
    { type: 'text', text: `${count} 張預售票已放進票券匣。同行朋友要用時，由你在現場用自己的 LINE 核銷即可。`, size: 'sm', color: '#ffffff', wrap: true, margin: 'md' },
  ], { label: '打開票券匣', uri: `${LIFF_URL}?goto=coupons` })
}

/** 推播給單一會員；失敗只回傳錯誤字串，不影響主流程 */
export async function pushTo(userId: string, messages: unknown[]): Promise<string | null> {
  if (!LINE_TOKEN) return '找不到 LINE_CHANNEL_ACCESS_TOKEN'
  try {
    const res = await fetch('https://api.line.me/v2/bot/message/push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${LINE_TOKEN}` },
      body: JSON.stringify({ to: userId, messages }),
    })
    if (res.ok) return null
    const t = await res.text()
    console.error('預售推播失敗', res.status, t)
    return `LINE ${res.status}: ${t}`.slice(0, 500)
  } catch (err) {
    return err instanceof Error ? err.message : String(err)
  }
}
