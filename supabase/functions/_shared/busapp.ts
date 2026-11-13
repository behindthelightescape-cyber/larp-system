// ═══════════════════════════════════════════════════════════════════════════
// 燈燈 × 公車管家 App（Firebase 專案 spotlight-bus-manager）
//
// 用妘兒（擁有者）的 refresh token 換 ID token，再用 Firestore REST API 讀寫。
// 權限跟她在 App 登入時一樣，由 Firestore 規則把關。
// 唯一會寫的：把 LINE 群組成員加進那團的團員名單（addLineMembers）—
//   只改 members、logs 兩欄，帶 updateTime 前提（App 同時存檔就重讀再試），不動其他欄位、不刪人、不改付款。
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

// ── 通知公版（照公車管家 App v2.3.1 的 DEFAULT_NOTIFICATION_TEMPLATES / noticeVars / fillNotice）──
// 妘兒在 App 設定裡改過的版本（settings.notificationTemplates）優先；沒改過才用這裡的預設。
const DEFAULT_TEMPLATES: Record<string, string> = {
  payment: `@All 各位！已滿團訂場惹🐱 那妘兒不免俗的要先來跟大家收個錢錢惹💗

再麻煩大家 LINE Pay 場地費
一個人 {{價格}}$ 給我！

{{LINE Pay 提示}}

如果沒有 LINE Pay 的可以轉帳到以下帳戶：
{{銀行代碼}}
{{銀行帳號}}

如果有要使用優惠券或早鳥務必轉帳前告知我喔！！！
非常感謝大家 💗

遲到將會壓縮到遊戲時間，若是遲到30分鐘將會沒收所有訂金並取消場次，還請注意。

遊戲地點：劇光燈（{{地址}}）
{{地圖網址}}

{{飲食提醒}}

現在也可以點店內的熱騰騰餐點啦！
菜單抵家：{{菜單網址}}

{{調酒提醒}}

🌸 公車禮儀注意事項 🌸
有鑑於近期有收到相關客訴，請大家互相尊重，不要對車友有肢體騷擾、言語騷擾。若收到客訴並查證屬實，將列入公車黑名單，不再提供幫組車服務；但仍歡迎自行組團來遊玩。

謝謝大家配合跟見諒 🌸`,
  reminder: `各位車友提醒一下～💗
《{{劇本名稱}}》{{日期}} {{時間}} 即將開場！

目前還有 {{未付款人數}} 位款項尚未確認，再麻煩有未付款的夥伴盡快完成匯款，若已匯款請私訊我協助核對。

謝謝大家！妘兒導遊等大家上車 🚍`,
  eve: `@All 明天就要發車啦！🚍💗

🎭 劇本：《{{劇本名稱}}》
📅 日期：{{日期}}
⏰ 開場時間：{{時間}}
📍 地點：劇光燈（{{地址}}）
{{地圖網址}}

記得準時抵達！遲到會壓縮遊戲時間；如有特殊狀況請提早私訊妘兒。
{{行前飲食提醒}}
{{行前調酒提醒}}
明天見啦～٩(ˊᗜˋ*)و`,
  paymentFoodNormal: `遊戲過程中可以飲食，也可以外食、叫外送，但建議先買好糧食直接帶來呦～`,
  paymentFoodRestricted: `⚠️ 此場遊戲流程不太方便吃東西，建議先吃飽再來，避免影響遊戲體驗喔！`,
  paymentAlcohol: `🍸 此場會提供調酒，開車的夥伴請勿飲酒，也可以自備飲料代替喔～`,
  eveFoodNormal: `🍽️ 這場可以邊玩邊吃，也可以外食、叫外送，記得先準備好糧食喔～`,
  eveFoodRestricted: `🍽️ 這場遊戲流程不太方便吃東西，建議先吃飽再來喔！`,
  eveAlcohol: `🍸 這場有調酒，開車的夥伴請勿飲酒，也可以自備飲料。`,
}
export type NoticeKind = 'payment' | 'reminder' | 'eve'
export const NOTICE_LABEL: Record<NoticeKind, string> = { payment: '收款通知', reminder: '催款', eve: '行前提醒' }

const s_ = (x: unknown) => String(x ?? '').trim()
const amt = (n: unknown) => Number(n || 0).toLocaleString('zh-TW')
const twDate = (iso: string) => { if (!iso) return '日期待定'; const [, m, d] = iso.split('-'); return `${+m}/${+d}` }
const htmlDate = (iso: string) => {
  if (!iso) return '日期待定'
  const wd = new Date(`${iso}T12:00:00+08:00`).getUTCDay()
  return `${twDate(iso)}（${'日一二三四五六'[wd]}）`
}
const hhmm = (raw: unknown) => {
  const v = s_(raw)
  const c = v.match(/^(\d{1,2}):(\d{1,2})(?::00)?$/)
  if (c && +c[1] <= 23 && +c[2] <= 59) return `${c[1].padStart(2, '0')}:${c[2].padStart(2, '0')}`
  const l = v.match(/^(\d{1,2})\.(0|5)?$/)
  if (l && +l[1] <= 23) return `${l[1].padStart(2, '0')}:${l[2] === '5' ? '30' : '00'}`
  return '時間待定'
}
// deno-lint-ignore no-explicit-any
const activeMembers = (g: any) => (g.members || []).filter((m: any) => m.role !== 'staff' && !m.leftAt)

// deno-lint-ignore no-explicit-any
export function renderNotice(kind: NoticeKind, g: any, st: any): string {
  const tpl = (k: string) => { const c = st?.notificationTemplates?.[k]; return typeof c === 'string' ? c : DEFAULT_TEMPLATES[k] }
  let raw = tpl(kind)
  // App 的相容處理：舊版收款公版寫死「可飲食」那句 → 換成 {{飲食提醒}}，且只留第一個
  const legacyFood = '遊戲過程中可以飲食，也可以外食、叫外送，但建議先買好糧食直接帶來呦～'
  if (kind === 'payment' && raw.includes(legacyFood)) {
    raw = raw.replace(legacyFood, '{{飲食提醒}}')
    let first = true
    raw = raw.replace(/\{\{飲食提醒\}\}/g, () => { if (first) { first = false; return '{{飲食提醒}}' } return '' })
  }
  const avoid = g.avoidEating === true
  const vars: Record<string, string> = {
    '劇本名稱': s_(g.title) || '劇本待定', '日期': htmlDate(g.date), '短日期': twDate(g.date),
    '時間': hhmm(g.time), '小時點': hhmm(g.time), '價格': amt(g.price),
    '未付款人數': String(activeMembers(g).filter((m: any) => m.paymentStatus !== 'paid').length),
    'LINE Pay 提示': st?.linePay || '請使用 LINE Pay 付款',
    '銀行代碼': st?.bankCode || '【請先設定銀行代碼】',
    '銀行帳號': st?.bankAccount || '【請先設定銀行帳號】',
    '地址': st?.address || '', '地圖網址': st?.mapUrl || '', '菜單網址': st?.menuUrl || '',
    '調酒提醒': g.hasAlcohol === true ? tpl('paymentAlcohol') : '',
    '飲食提醒': tpl(avoid ? 'paymentFoodRestricted' : 'paymentFoodNormal'),
    '行前飲食提醒': tpl(avoid ? 'eveFoodRestricted' : 'eveFoodNormal'),
    '行前調酒提醒': g.hasAlcohol === true ? tpl('eveAlcohol') : '',
  }
  const out = raw.replace(/\{\{([^{}]+)\}\}/g, (all, name) => Object.prototype.hasOwnProperty.call(vars, name) ? vars[name] : all)
  return out.replace(/\n[ \t]*\n[ \t]*\n+/g, '\n\n').trim()
}

// 文字裡的「@All」→ LINE 真的 tag 全部人（textV2 mention all）；文字有其他大括號就退回一般文字
export function noticeMessage(text: string) {
  if (!text.includes('@All') || /[{}]/.test(text)) return { type: 'text', text }
  return {
    type: 'textV2', text: text.replace(/@All/g, '{all}'),
    substitution: { all: { type: 'mention', mentionee: { type: 'all' } } },
  }
}

// 找出這個 LINE 群組對應的公車管家團：劇本名稱＋日期（＋時間），排除取消的
const normT = (x: string) => x.replace(/[\s　《》「」『』]/g, '').toLowerCase()
// deno-lint-ignore no-explicit-any
export async function findAppGroup(q: { script: string; date: string; time?: string }): Promise<{ hit?: any; many?: any[] }> {
  const s = normT(q.script)
  const all = (await listGroups()).filter(g => g.status !== 'cancelled' && g.date === q.date)
  const byTitle = all.filter(g => { const t = normT(s_(g.title)); return t && (t === s || t.includes(s) || s.includes(t)) })
  const byTime = q.time ? byTitle.filter(g => hhmm(g.time) === q.time) : byTitle
  const list = byTime.length ? byTime : byTitle
  return list.length === 1 ? { hit: list[0] } : { many: list }
}

// ── 寫入：LINE 群組成員 → 團員名單 ─────────────────────────────────────────────
// 直接改 Firestore 原始格式（不經 decode 再 encode），其他團員的欄位原封不動
// deno-lint-ignore no-explicit-any
const fsVal = (v: any): any =>
  v === null || v === undefined ? { nullValue: null }
  : typeof v === 'string' ? { stringValue: v }
  : typeof v === 'boolean' ? { booleanValue: v }
  : typeof v === 'number' ? (Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v })
  : { stringValue: String(v) }
// deno-lint-ignore no-explicit-any
const fsMap = (o: Record<string, any>) => ({ mapValue: { fields: Object.fromEntries(Object.entries(o).map(([k, v]) => [k, fsVal(v)])) } })
const normName = (x: string) => String(x || '').replace(/[\s　]/g, '').toLowerCase()

export type LinePerson = { lineUserId: string; name: string }
export type AddResult = { added: string[]; linked: string[]; already: string[]; ids: Record<string, string>; skipped?: string }

// 團的狀態不適合再加人：取消、已結帳（App 用團員名單算結帳簽章，結帳後加人會讓結帳變「過期」）、已經開場過
// deno-lint-ignore no-explicit-any
export function appGroupClosed(g: any): string {
  if (g.status === 'cancelled') return '這團已取消'
  if (g.settlement?.settledAt) return '這團已結帳'
  const today = new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10)
  if (typeof g.date === 'string' && g.date && g.date < today) return '這團已經結束'
  return ''
}

export async function addLineMembers(appGroupId: string, people: LinePerson[]): Promise<AddResult> {
  const url = `${DOCS}/${BASE}/groups/${encodeURIComponent(appGroupId)}`
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${await idToken()}` } })
    if (!res.ok) throw new Error(`讀取公車管家團務失敗（${res.status}）：${(await res.text()).slice(0, 150)}`)
    const doc = await res.json()
    const fields = doc.fields || {}
    const g = decodeFields(fields)
    const closed = appGroupClosed(g)
    if (closed) return { added: [], linked: [], already: [], ids: {}, skipped: closed }

    // deno-lint-ignore no-explicit-any
    const values: any[] = structuredClone(fields.members?.arrayValue?.values || [])
    // deno-lint-ignore no-explicit-any
    const logs: any[] = structuredClone(fields.logs?.arrayValue?.values || [])
    // deno-lint-ignore no-explicit-any
    const cur = () => values.map(v => decode(v) as any)
    const out: AddResult = { added: [], linked: [], already: [], ids: {} }
    for (const p of people) {
      const ms = cur()
      const mine = ms.find(m => m.lineUserId === p.lineUserId)
      if (mine) { out.already.push(p.name); out.ids[p.lineUserId] = mine.id; continue }
      // 妘兒已經手動或截圖匯入同名的人 → 補上 LINE 帳號就好，不重複加
      const i = ms.findIndex(m => !m.lineUserId && !m.leftAt && normName(m.name) === normName(p.name))
      if (i >= 0) {
        values[i].mapValue.fields.lineUserId = { stringValue: p.lineUserId }
        out.linked.push(p.name); out.ids[p.lineUserId] = ms[i].id; continue
      }
      const id = crypto.randomUUID()
      values.push(fsMap({
        id, name: p.name, role: 'player',
        amountDue: Number(g.price || 0), amountPaid: 0, paymentStatus: 'unpaid', paymentNote: '',
        joinedAt: new Date().toISOString(), leftAt: null, refundAmount: 0,
        lineUserId: p.lineUserId, addedBy: '燈燈',
      }))
      out.added.push(p.name); out.ids[p.lineUserId] = id
    }
    if (!out.added.length && !out.linked.length) return out
    const text = [
      out.added.length ? `燈燈從 LINE 群組加入 ${out.added.length} 位：${out.added.join('、')}` : '',
      out.linked.length ? `燈燈對上 LINE 帳號：${out.linked.join('、')}` : '',
    ].filter(Boolean).join('；')
    logs.push(fsMap({ id: crypto.randomUUID(), at: new Date().toISOString(), text }))

    const q = `updateMask.fieldPaths=members&updateMask.fieldPaths=logs&currentDocument.updateTime=${encodeURIComponent(doc.updateTime)}`
    const w = await fetch(`${url}?${q}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${await idToken()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: { members: { arrayValue: { values } }, logs: { arrayValue: { values: logs } } } }),
    })
    if (w.ok) return out
    const err = await w.text()
    // 讀完到寫入之間 App 剛好存檔 → 重讀再試
    if ((w.status === 400 || w.status === 409) && /FAILED_PRECONDITION|ABORTED|precondition/i.test(err)) { console.warn('addLineMembers: 團務剛被改過，重試', attempt + 1); continue }
    throw new Error(`寫入公車管家失敗（${w.status}）：${err.slice(0, 200)}`)
  }
  throw new Error('寫入公車管家失敗：團務一直在變動，等一下再試')
}

// deno-lint-ignore no-explicit-any
export const getAppGroup = (id: string): Promise<any | null> => getDoc(`groups/${encodeURIComponent(id)}`)
