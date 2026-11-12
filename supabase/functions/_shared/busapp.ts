// ═══════════════════════════════════════════════════════════════════════════
// 燈燈 × 公車管家 App（Firebase 專案 spotlight-bus-manager）— 只讀
//
// 用妘兒（擁有者）的 refresh token 換 ID token，再用 Firestore REST API 讀資料。
// 權限跟她在 App 登入時一樣，由 Firestore 規則把關；燈燈這邊只讀不寫。
// Secrets：BUS_REFRESH_TOKEN
// 資料位置：users/{OWNER_UID}/settings/main（通知公版、銀行帳號…）、users/{OWNER_UID}/groups/{id}（成團後的團）
// ═══════════════════════════════════════════════════════════════════════════

const env = (k: string) => Deno.env.get(k) || ''
const FIREBASE_API_KEY = 'AIzaSyDg1CM2za1E-Kgh4K4GTvbysROsIT2jlqY' // Web App 公開設定，不是私密金鑰
const PROJECT = 'spotlight-bus-manager'
export const OWNER_UID = 'zlmbKCc9D3PAgw76qahemIdDlsc2'
const DOCS = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`
const BASE = `users/${OWNER_UID}`

export const busAppReady = () => !!env('BUS_REFRESH_TOKEN')

let idTok = { value: '', uid: '', exp: 0 }
async function idToken(): Promise<string> {
  if (idTok.value && Date.now() < idTok.exp - 300_000) return idTok.value
  const res = await fetch(`https://securetoken.googleapis.com/v1/token?key=${FIREBASE_API_KEY}`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: env('BUS_REFRESH_TOKEN') }),
  })
  const j = await res.json()
  if (!res.ok || !j.id_token) throw new Error(`公車管家登入失敗：${j.error?.message || res.status}`)
  if (j.user_id !== OWNER_UID) throw new Error('公車管家登入的不是擁有者帳號')
  idTok = { value: j.id_token, uid: j.user_id, exp: Date.now() + (+j.expires_in || 3600) * 1000 }
  return idTok.value
}

// Firestore REST 的值格式 → 一般 JS 值
// deno-lint-ignore no-explicit-any
function decode(v: any): any {
  if (!v || typeof v !== 'object') return null
  if ('stringValue' in v) return v.stringValue
  if ('integerValue' in v) return Number(v.integerValue)
  if ('doubleValue' in v) return v.doubleValue
  if ('booleanValue' in v) return v.booleanValue
  if ('nullValue' in v) return null
  if ('timestampValue' in v) return v.timestampValue
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(decode)
  if ('mapValue' in v) return decodeFields(v.mapValue.fields || {})
  return null
}
// deno-lint-ignore no-explicit-any
const decodeFields = (f: Record<string, any>) => Object.fromEntries(Object.entries(f).map(([k, v]) => [k, decode(v)]))

// deno-lint-ignore no-explicit-any
async function getDoc(path: string): Promise<any | null> {
  const res = await fetch(`${DOCS}/${BASE}/${path}`, { headers: { Authorization: `Bearer ${await idToken()}` } })
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`讀取公車管家失敗（${res.status}）：${(await res.text()).slice(0, 150)}`)
  return decodeFields((await res.json()).fields || {})
}

// deno-lint-ignore no-explicit-any
export async function listGroups(): Promise<any[]> {
  const out = []
  let page = ''
  for (let i = 0; i < 10; i++) {
    const url = `${DOCS}/${BASE}/groups?pageSize=300${page ? `&pageToken=${encodeURIComponent(page)}` : ''}`
    const res = await fetch(url, { headers: { Authorization: `Bearer ${await idToken()}` } })
    if (!res.ok) throw new Error(`讀取公車管家團務失敗（${res.status}）：${(await res.text()).slice(0, 150)}`)
    const j = await res.json()
    for (const d of j.documents || []) out.push({ id: String(d.name).split('/').pop(), ...decodeFields(d.fields || {}) })
    if (!j.nextPageToken) break
    page = j.nextPageToken
  }
  return out
}

export const getSettings = () => getDoc('settings/main')

// 「公車管家檢查」：只回報讀得到什麼，不顯示帳號全文
export async function busAppCheck(): Promise<string> {
  const [s, groups] = await Promise.all([getSettings(), listGroups()])
  const today = new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10)
  const upcoming = groups.filter(g => g.status !== 'cancelled' && typeof g.date === 'string' && g.date >= today)
  const custom = Object.keys(s?.notificationTemplates || {})
  const NAMES: Record<string, string> = {
    payment: '收款通知', reminder: '催款', eve: '行前提醒', receipt: '已收款回覆', settlement: '結帳文',
    busHeader: '公車文開頭', busFooter: '公車文結尾',
  }
  const mask = (x: unknown) => { const t = String(x || ''); return t ? `有（末 ${t.slice(-3)}）` : '空白' }
  return [
    '🔗 公車管家連線正常（只讀）',
    `團務：共 ${groups.length} 團，今天以後 ${upcoming.length} 團`,
    `銀行代碼：${s?.bankCode ? '有' : '空白'}｜帳號：${mask(s?.bankAccount)}`,
    `LINE Pay 提示：${s?.linePay ? '有' : '空白'}｜地址：${s?.address ? '有' : '空白'}`,
    `自訂過的公版：${custom.length ? custom.map(k => NAMES[k] || k).join('、') : '（都用預設）'}`,
  ].join('\n')
}
