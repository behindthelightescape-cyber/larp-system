// 玩家端呼叫 presale-member（用 LIFF access token 驗證身分）
import liff from '@line/liff'

const EDGE_BASE = 'https://cqbiozfappfwfcahtxfm.supabase.co/functions/v1'

export async function presaleMember(body) {
  const token = liff.getAccessToken()
  if (!token) throw new Error('請先登入 LINE')
  const res = await fetch(`${EDGE_BASE}/presale-member`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `系統錯誤（${res.status}）`)
  return data
}

export const PRESALE_STATUS = {
  unclaimed:        { text: '待確認', cls: 'st-wait' },
  awaiting_payment: { text: '待匯款', cls: 'st-pay' },
  reviewing:        { text: '查帳中', cls: 'st-review' },
  issued:           { text: '已發券', cls: 'st-done' },
  cancelled:        { text: '已取消', cls: 'st-off' },
  expired:          { text: '已失效', cls: 'st-off' },
}

export const money = (n) => `$${Number(n || 0).toLocaleString('en-US')}`

// 同一本買多張時合併成「× N」
export const groupItems = (items = []) => {
  const m = new Map()
  for (const i of items) {
    const g = m.get(i.id)
    if (g) g.qty++
    else m.set(i.id, { ...i, qty: 1 })
  }
  return [...m.values()]
}
