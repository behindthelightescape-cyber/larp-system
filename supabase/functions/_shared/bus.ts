// ═══════════════════════════════════════════════════════════════════════════
// 燈燈 × 公車表單（Google Sheet「劇光燈 揪團清單」）
//
// 一個 LINE 群組綁定 Sheet 上的一列，之後在群組裡就能更新那一列：
//   綁定             用群組名稱（例「11/28 14:00 殺死巫師 @劇光燈」）找出對應的車次，按按鈕綁定
//   這車             看綁定的那列目前內容（大家都能用）
//   誠徵 1男 1女     改 F 欄（誠徵）
//   滿了             F 欄改成「已滿」
//   解除綁定         清掉 Z 欄代碼
//   日期 12/20       改 G 欄（日期）＋H 欄（星期），照日期重新排位置；也可以寫「日期 假日未定」
//   時間 14:00       改 I 欄；也可以寫「時間 白天」
//   開車 誠徵 2男 1女 公車表上還沒有這車 → 用群組名稱＋劇本資料庫新增一列（照日期插進去），並綁定
//
// 綁定方式：在那列的 Z 欄寫一個燈燈代碼（例「燈-7KQ2MX」），之後只認代碼，列怎麼移動都不會改錯格。
// App（公車管家）只讀到 N 欄、刪列的 GAS 只比對 A～L，Z 欄不影響它們。
//
// 權限：
//   Google 服務帳號（Secrets：GOOGLE_SA_EMAIL、GOOGLE_SA_KEY_B64），Sheet 要共用給它（編輯者）
//   會改 Sheet 的指令只有 group_settings.bus_editors 裡的會員編號（逗號分隔）能用
// ═══════════════════════════════════════════════════════════════════════════

import { parseWhen, fmtDT, fmtDate } from './team.ts'

const env = (k: string) => Deno.env.get(k) || ''
const SUPABASE_URL = env('SUPABASE_URL')
const SERVICE_KEY = env('SUPABASE_SERVICE_ROLE_KEY')

export const SHEET_ID = '10WjDhoTs2Zt0SiJvXenb9x9wUoajQEGNURpxrIa6Z8s'
export const SHEET_NAME = '劇光燈 揪團清單'
const RANGE = `'${SHEET_NAME}'!A1:Z400`
const FIRST_DATA_ROW = 3 // 第 1 列說明、第 2 列表頭
const COL = { title: 0, people: 2, price: 4, want: 5, date: 6, weekday: 7, time: 8, notes: 11, code: 25 } // Z = 25
const GOLD = '#D4AF37'

// ── Supabase REST ───────────────────────────────────────────────────────────
const dbHeaders = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' }
const dbGet = async (path: string) => (await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: dbHeaders })).json()
const dbPatch = (table: string, filter: string, payload: Record<string, unknown>) =>
  fetch(`${SUPABASE_URL}/rest/v1/${table}?${filter}`, {
    method: 'PATCH', headers: { ...dbHeaders, Prefer: 'return=minimal' }, body: JSON.stringify(payload),
  })

// ── Google 服務帳號 → access token（快取到過期前 5 分鐘）─────────────────────
let gToken = { value: '', exp: 0 }
export const sheetReady = () => !!(env('GOOGLE_SA_EMAIL') && env('GOOGLE_SA_KEY_B64'))

const b64url = (buf: ArrayBuffer | Uint8Array) => {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf)
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
const googleToken = async (): Promise<string> => {
  if (gToken.value && Date.now() < gToken.exp - 300_000) return gToken.value
  const pem = atob(env('GOOGLE_SA_KEY_B64'))
  const der = Uint8Array.from(atob(pem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '')), c => c.charCodeAt(0))
  const key = await crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign'])
  const now = Math.floor(Date.now() / 1000)
  const enc = (o: unknown) => b64url(new TextEncoder().encode(JSON.stringify(o)))
  const unsigned = `${enc({ alg: 'RS256', typ: 'JWT' })}.${enc({
    iss: env('GOOGLE_SA_EMAIL'), scope: 'https://www.googleapis.com/auth/spreadsheets',
    aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600,
  })}`
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(unsigned))
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${unsigned}.${b64url(sig)}` }),
  })
  const j = await res.json()
  if (!res.ok || !j.access_token) throw new Error(`Google 登入失敗：${j.error_description || j.error || res.status}`)
  gToken = { value: j.access_token, exp: Date.now() + (j.expires_in || 3600) * 1000 }
  return gToken.value
}

// ── 讀寫 Sheet ──────────────────────────────────────────────────────────────
export type BusRow = {
  row: number                 // 試算表列號（1 起算）
  cells: string[]             // A～Z 顯示文字
  title: string; want: string; date: string; time: string; code: string
}
const API = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values`

export async function readSheet(): Promise<BusRow[]> {
  const res = await fetch(`${API}/${encodeURIComponent(RANGE)}?valueRenderOption=FORMATTED_VALUE`, {
    headers: { Authorization: `Bearer ${await googleToken()}` },
  })
  if (!res.ok) throw new Error(`讀取公車表失敗（${res.status}）：${(await res.text()).slice(0, 200)}`)
  const values: string[][] = (await res.json()).values || []
  const out: BusRow[] = []
  values.forEach((r, i) => {
    const row = i + 1
    if (row < FIRST_DATA_ROW) return
    const cells = Array.from({ length: 26 }, (_, k) => String(r[k] ?? '').trim())
    if (!cells[COL.title] || cells[COL.title] === '劇本') return
    out.push({ row, cells, title: cells[COL.title], want: cells[COL.want], date: cells[COL.date], time: cells[COL.time], code: cells[COL.code] })
  })
  return out
}

async function writeCell(a1: string, value: string) {
  const range = `'${SHEET_NAME}'!${a1}`
  const res = await fetch(`${API}/${encodeURIComponent(range)}?valueInputOption=RAW`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${await googleToken()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ range, majorDimension: 'ROWS', values: [[value]] }),
  })
  if (!res.ok) throw new Error(`寫入公車表失敗（${res.status}）：${(await res.text()).slice(0, 200)}`)
}

// ── 比對：群組名稱 ↔ 車次 ────────────────────────────────────────────────────
const norm = (s: string) => s.replace(/[\s　《》「」『』]/g, '').toLowerCase()

// 「12/1、3」「11/30、12/2」→ [[12,1],[12,3]]…
export function parseDates(g: string): [number, number][] {
  const out: [number, number][] = []
  let month = 0
  for (const tok of g.replace(/／/g, '/').split(/[、,，\s]+/)) {
    let m = tok.match(/^(\d{1,2})\/(\d{1,2})/)
    if (m) { month = +m[1]; out.push([month, +m[2]]); continue }
    m = tok.match(/^(\d{1,2})$/)
    if (m && month) out.push([month, +m[1]])
  }
  return out
}
const hhmm = (t: string) => {
  const m = t.replace(/：/g, ':').match(/(\d{1,2}):(\d{2})/)
  return m ? `${m[1].padStart(2, '0')}:${m[2]}` : ''
}

// 群組名稱：「11/28 14:00 殺死巫師 @劇光燈」
// 還沒定的寫 XX：「XX/XX 傘靈」（日期未定）、「12/20 XX:XX 傘靈」（時間未定）
// start_at：有日期就有（沒時間先當 12:00，只用來排序）；tbd：名稱裡有 XX
export type GroupInfo = { start_at: string | null; script: string | null; hasDate: boolean; hasTime: boolean; tbd: boolean }
const PLACEHOLDER = /\S*[XxＸｘ]{2}\S*/g
export function parseGroupName(name: string): GroupInfo {
  const base = name.replace(/[@＠]\S+/g, ' ').replace(/[（(]\d+[)）]\s*$/, ' ')
  const tbd = /[XxＸｘ]{2}/.test(base)
  const cleaned = base.replace(PLACEHOLDER, ' ').replace(/\s+/g, ' ').trim()
  let w = parseWhen(cleaned)
  let hasTime = w.hasTime
  if (w.hasDate && !w.hasTime) { w = parseWhen(cleaned + ' 12:00'); hasTime = false }
  const hasDate = w.hasDate && !!w.start_at
  return { start_at: hasDate ? w.start_at : null, script: w.rest || null, hasDate, hasTime: hasDate && hasTime, tbd }
}
// 名稱看起來是一車（有日期，或用 XX 標未定）
export const looksLikeBus = (g: GroupInfo) => !!g.script && (g.hasDate || g.tbd)
export const whenText = (g: GroupInfo) =>
  !g.hasDate || !g.start_at ? '日期未定' : g.hasTime ? fmtDT(g.start_at) : `${fmtDate(g.start_at)} 時間未定`
export const describeGroup = (g: GroupInfo) => looksLikeBus(g)
  ? `📅 ${whenText(g)}《${g.script}》`
  : '（群組名稱裡沒看到日期時間，例如「11/27 13:00 劇本名」；還沒定可以寫「XX/XX 劇本名」）'


// 回傳候選：exact = 劇本、日期、時間都對；否則列出劇本對得上的（最多 4 個）
export function findCandidates(rows: BusRow[], g: GroupInfo): { exact: boolean; rows: BusRow[] } {
  if (!g.script) return { exact: false, rows: [] }
  const s = norm(g.script)
  const titleOk = (r: BusRow) => { const t = norm(r.title); return t === s || t.includes(s) || s.includes(t) }
  let mo = 0, d = 0, tm = ''
  if (g.hasDate && g.start_at) {
    const tpe = new Date(new Date(g.start_at).getTime() + 8 * 3600_000)
    mo = tpe.getUTCMonth() + 1; d = tpe.getUTCDate()
    tm = `${String(tpe.getUTCHours()).padStart(2, '0')}:${String(tpe.getUTCMinutes()).padStart(2, '0')}`
  }
  const byTitle = rows.filter(titleOk)
  const exact = g.hasDate
    ? byTitle.filter(r => parseDates(r.date).some(([a, b]) => a === mo && b === d) && (!g.hasTime || hhmm(r.time) === tm))
    : byTitle.filter(r => parseDates(r.date).length === 0) // 日期未定 ↔ 表上也沒寫確定日期的
  if (exact.length) return { exact: true, rows: exact.slice(0, 4) }
  return { exact: false, rows: byTitle.slice(0, 4) }
}

// 綁定按鈕帶的指紋：按下時那列的劇本／日期／時間還要一樣才綁
const rowKey = (r: BusRow) => {
  let h = 0
  for (const ch of `${r.title}|${r.date}|${r.time}`) h = (h * 31 + ch.charCodeAt(0)) | 0
  return (h >>> 0).toString(36)
}
const rowLabel = (r: BusRow) => `${r.title}｜${r.date}${r.cells[COL.weekday] ? `（${r.cells[COL.weekday].replace('星期', '')}）` : ''} ${r.time}`
const wantLabel = (w: string) => w ? `誠徵 ${w}` : '誠徵（空白）'

export function candidatesMessage(c: { exact: boolean; rows: BusRow[] }, g: GroupInfo) {
  if (!c.rows.length) {
    return { type: 'text', text: g.script
      ? `🔍 公車表上找不到《${g.script}》${whenText(g)} 這車，要新增可以打「開車 誠徵 2男 1女」`
      : '🔍 群組名稱裡沒看到劇本和日期時間，例如「11/28 14:00 殺死巫師 @劇光燈」' }
  }
  const head = c.exact ? '🚌 公車表上找到這車，是這個群組的嗎？' : '🚌 時間對不上，但有這些同劇本的車次：'
  return {
    type: 'flex', altText: '綁定公車表',
    contents: {
      type: 'bubble', size: 'mega',
      body: {
        type: 'box', layout: 'vertical', spacing: 'md', backgroundColor: '#0d0d0d', paddingAll: '16px',
        contents: [
          { type: 'text', text: head, color: GOLD, weight: 'bold', size: 'sm', wrap: true },
          ...c.rows.map(r => ({
            type: 'box', layout: 'vertical', spacing: 'xs', paddingTop: '6px',
            contents: [
              { type: 'text', text: rowLabel(r), color: '#ffffff', size: 'sm', wrap: true },
              { type: 'text', text: wantLabel(r.want) + (r.code ? `・已綁 ${r.code}` : ''), color: '#999999', size: 'xs', wrap: true },
              { type: 'button', style: 'primary', color: GOLD, height: 'sm',
                action: { type: 'postback', label: '綁定這車', data: `bus|bind|${r.row}|${rowKey(r)}`, displayText: `綁定 ${r.title} ${r.date} ${r.time}` } },
            ],
          })),
        ],
      },
    },
  }
}

// ── 權限 ─────────────────────────────────────────────────────────────────────
async function isEditor(lineUserId: string): Promise<boolean> {
  const s = await dbGet('group_settings?key=eq.bus_editors&select=value&limit=1')
  const ids = String(s?.[0]?.value || '').split(/[,，\s]+/).map((x: string) => x.replace(/^#/, '').trim()).filter(Boolean)
  if (!ids.length || !lineUserId) return false
  const u = await dbGet(`users?id=eq.${encodeURIComponent(lineUserId)}&select=legacy_id&limit=1`)
  return ids.includes(String(u?.[0]?.legacy_id || ''))
}

// ── 代碼 ─────────────────────────────────────────────────────────────────────
const newCode = () => {
  const A = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
  const r = crypto.getRandomValues(new Uint8Array(6))
  return '燈-' + Array.from(r, b => A[b % A.length]).join('')
}
const snapshot = (r: BusRow) => r.cells.slice(0, 12) // A～L，之後成團匯入時用來接 Firestore

// ── 開車：新增一列 ───────────────────────────────────────────────────────────
const SCRIPT_SHEET_GID = 1761985532 // 劇本資料庫分頁（用編號找，分頁改名也不怕）：A 名稱 B 類型 C 價格 D 人數 E 男女 F 反串(O/X) G 換裝(O/X) H 時長 I 備註 J 網址 K 封面
const BUS_SHEET_GID = 0
type Script = { title: string; genre: string; price: string; people: string; cross: string; costume: string; hours: string; url: string; cover: string }

// 分頁編號 → 分頁名稱（Sheets API 的範圍要用名稱）
let sheetTitles: Record<number, string> | null = null
async function sheetTitle(gid: number): Promise<string> {
  if (!sheetTitles) {
    const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}?fields=sheets.properties(sheetId,title)`, {
      headers: { Authorization: `Bearer ${await googleToken()}` },
    })
    if (!res.ok) throw new Error(`讀取分頁清單失敗（${res.status}）`)
    sheetTitles = {}
    for (const sh of (await res.json()).sheets || []) sheetTitles[sh.properties.sheetId] = sh.properties.title
  }
  const t = sheetTitles[gid]
  if (!t) throw new Error(`找不到編號 ${gid} 的分頁`)
  return t
}

async function readScripts(): Promise<Script[]> {
  const range = `'${(await sheetTitle(SCRIPT_SHEET_GID)).replace(/'/g, "''")}'!A2:K400`
  const res = await fetch(`${API}/${encodeURIComponent(range)}?valueRenderOption=FORMATTED_VALUE`, {
    headers: { Authorization: `Bearer ${await googleToken()}` },
  })
  if (!res.ok) throw new Error(`讀取劇本資料庫失敗（${res.status}）：${(await res.text()).slice(0, 120)}`)
  const values: string[][] = (await res.json()).values || []
  return values.map(r => r.map(x => String(x ?? '').trim())).filter(r => r[0]).map(r => ({
    title: r[0], genre: r[1] || '', price: r[2] || '', people: r[4] || '', cross: r[5] || '', costume: r[6] || '',
    hours: r[7] || '', url: r[9] || '', cover: r[10] || '',
  }))
}

// 劇本名稱：完全一樣優先；否則「包含」且只有一本才算（「二十四橋」→「二十四橋明月夜」）
function findScript(list: Script[], name: string): { hit?: Script; many?: Script[] } {
  const s = norm(name)
  const exact = list.find(x => norm(x.title) === s)
  if (exact) return { hit: exact }
  const part = list.filter(x => { const t = norm(x.title); return t.includes(s) || s.includes(t) })
  return part.length === 1 ? { hit: part[0] } : { many: part.slice(0, 6) }
}

const tpeParts = (iso: string) => {
  const d = new Date(new Date(iso).getTime() + 8 * 3600_000)
  return { mo: d.getUTCMonth() + 1, d: d.getUTCDate(), wd: d.getUTCDay(), hh: String(d.getUTCHours()).padStart(2, '0'), mi: String(d.getUTCMinutes()).padStart(2, '0') }
}
const WEEK = ['日', '一', '二', '三', '四', '五', '六']
export const normWant = (a: string) => a.trim().replace(/\s+/g, ' ').replace(/(\d+)\s*([男女])/g, '$1$2').replace(/([男女])\s*(?=\d)/g, '$1 ')

// 新的一列 A～N，格式照公車表現有的寫法
export function buildRow(sc: Script, g: GroupInfo, want: string): string[] {
  const t = g.hasDate && g.start_at ? tpeParts(g.start_at) : null
  return [
    sc.title, sc.genre, sc.people,
    sc.cross === 'O' ? '可以反串' : '不建議反串',
    sc.price, want,
    t ? `${t.mo}/${t.d}` : '日期未定', t ? `星期${WEEK[t.wd]}` : '', t && g.hasTime ? `${t.hh}:${t.mi}` : '',
    sc.hours,
    sc.costume === 'O' ? '有換裝' : '無換裝',
    '', sc.url, sc.cover,
  ]
}

// 沒寫年份的月/日 → 時間戳（比現在早 60 天以上的算明年）
function mdTime(mo: number, d: number, hm = '12:00', now = Date.now()): number {
  const y = new Date(now + 8 * 3600_000).getUTCFullYear()
  const iso = (yy: number) => `${yy}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}T${hm}:00+08:00`
  let ts = Date.parse(iso(y))
  if (ts < now - 60 * 86400_000) ts = Date.parse(iso(y + 1))
  return ts
}
// 表上每列的大概時間；讀不出日期的回傳 Infinity（排最後）
function rowTime(r: BusRow): number {
  const d = parseDates(r.date)[0]
  return d ? mdTime(d[0], d[1], hhmm(r.time) || '12:00') : Infinity
}
// 插在第一個比它晚（或沒日期）的列前面；都比它早、或它自己沒日期，就接在最後一列後面
function slotFor(rows: BusRow[], ts: number): number {
  const later = Number.isFinite(ts) ? rows.find(r => rowTime(r) > ts) : undefined
  if (later) return later.row
  return rows.length ? rows[rows.length - 1].row + 1 : FIRST_DATA_ROW
}
export function insertRowNumber(rows: BusRow[], g: GroupInfo): number {
  return slotFor(rows, g.hasDate && g.start_at ? new Date(g.start_at).getTime() : Infinity)
}

// 改了日期／時間後，把這列移到照日期排的位置（moveDimension 用移動前的列號）
async function reposition(code: string) {
  const rows = await readSheet()
  const self = rows.find(r => r.code === code)
  if (!self) return
  const target = slotFor(rows.filter(r => r !== self), rowTime(self))
  if (target === self.row || target === self.row + 1) return
  const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}:batchUpdate`, {
    method: 'POST', headers: { Authorization: `Bearer ${await googleToken()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ requests: [{ moveDimension: {
      source: { sheetId: BUS_SHEET_GID, dimension: 'ROWS', startIndex: self.row - 1, endIndex: self.row },
      destinationIndex: target - 1,
    } }] }),
  })
  if (!res.ok) throw new Error(`公車表移動列失敗（${res.status}）：${(await res.text()).slice(0, 200)}`)
}

async function writeCells(cells: [string, string][]) {
  const res = await fetch(`${API}:batchUpdate`, {
    method: 'POST', headers: { Authorization: `Bearer ${await googleToken()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ valueInputOption: 'RAW', data: cells.map(([a1, v]) => ({ range: `'${SHEET_NAME}'!${a1}`, values: [[v]] })) }),
  })
  if (!res.ok) throw new Error(`寫入公車表失敗（${res.status}）：${(await res.text()).slice(0, 200)}`)
}

// 「12/20」→「星期日」、「12/1、3」→「星期二、四」；讀不出日期就空白
export function weekdayText(dateText: string): string {
  const ds = parseDates(dateText)
  if (!ds.length) return ''
  return '星期' + ds.map(([mo, d]) => WEEK[new Date(mdTime(mo, d) + 8 * 3600_000).getUTCDay()]).join('、')
}

// ── 公車表哪些欄是公式 ─────────────────────────────────────────────────────
// header：表頭那格是公式（例如 ={"類型"; ARRAYFORMULA(...)} 整欄往下帶）→ 這欄任何一格都不能寫，寫了整欄會 #REF!
// perRow：資料列每格各自有公式 → 新增列時從隔壁列複製公式，不寫值
// 其他：手填欄，可以寫
type Layout = { header: Set<number>; perRow: Set<number>; headerText: string[] }
const LETTER = (c: number) => String.fromCharCode(65 + c)
async function readLayout(): Promise<Layout> {
  const range = `'${SHEET_NAME}'!A2:N12`
  const res = await fetch(`${API}/${encodeURIComponent(range)}?valueRenderOption=FORMULA`, {
    headers: { Authorization: `Bearer ${await googleToken()}` },
  })
  if (!res.ok) throw new Error(`讀取公車表公式失敗（${res.status}）`)
  const v: string[][] = (await res.json()).values || []
  const isF = (x: unknown) => typeof x === 'string' && x.startsWith('=')
  const header = new Set<number>(), perRow = new Set<number>()
  for (let c = 0; c < 14; c++) {
    if (isF(v[0]?.[c])) header.add(c)
    else if (v.slice(1).some(r => isF(r?.[c]))) perRow.add(c)
  }
  // 表頭文字（公式欄用 FORMATTED 讀不到，這裡只是給「公車表結構」顯示用）
  return { header, perRow, headerText: (v[0] || []).map(x => String(x ?? '')) }
}
const canWrite = (L: Layout, c: number) => !L.header.has(c) && !L.perRow.has(c)
export const MANUAL_COLS = [0, 5, 6, 8] // A 劇本、F 誠徵、G 日期、I 時間：一定是手填（是公式就不准開車）

async function insertRow(rowNum: number, values: string[], code: string, L: Layout) {
  const tok = await googleToken()
  const sheetsApi = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}:batchUpdate`
  // 1. 插入空白列（格式、下拉選單沿用上一列；插在第一筆資料時沿用下一列）
  const res = await fetch(sheetsApi, {
    method: 'POST', headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ requests: [{ insertDimension: {
      range: { sheetId: BUS_SHEET_GID, dimension: 'ROWS', startIndex: rowNum - 1, endIndex: rowNum },
      inheritFromBefore: rowNum > FIRST_DATA_ROW,
    } }] }),
  })
  if (!res.ok) throw new Error(`公車表插入新列失敗（${res.status}）：${(await res.text()).slice(0, 200)}`)
  // 2. 每列各自有公式的欄：從隔壁列複製公式
  if (L.perRow.size) {
    const src = rowNum > FIRST_DATA_ROW ? rowNum - 1 : rowNum + 1
    const res3 = await fetch(sheetsApi, {
      method: 'POST', headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ requests: [...L.perRow].map(c => ({ copyPaste: {
        source: { sheetId: BUS_SHEET_GID, startRowIndex: src - 1, endRowIndex: src, startColumnIndex: c, endColumnIndex: c + 1 },
        destination: { sheetId: BUS_SHEET_GID, startRowIndex: rowNum - 1, endRowIndex: rowNum, startColumnIndex: c, endColumnIndex: c + 1 },
        pasteType: 'PASTE_FORMULA',
      } })) }),
    })
    if (!res3.ok) throw new Error(`公車表複製公式失敗（${res3.status}）：${(await res3.text()).slice(0, 200)}`)
  }
  // 3. 只寫手填欄（有值的）和 Z 代碼；公式欄一格都不碰
  const data = values.map((v, c) => ({ v, c }))
    .filter(({ v, c }) => v !== '' && canWrite(L, c))
    .map(({ v, c }) => ({ range: `'${SHEET_NAME}'!${LETTER(c)}${rowNum}`, values: [[v]] }))
  data.push({ range: `'${SHEET_NAME}'!Z${rowNum}`, values: [[code]] })
  const res2 = await fetch(`${API}:batchUpdate`, {
    method: 'POST', headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ valueInputOption: 'RAW', data }),
  })
  if (!res2.ok) throw new Error(`公車表寫入新列失敗（${res2.status}）：${(await res2.text()).slice(0, 200)}`)
}

const groupKey = (name: string) => {
  let h = 0
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) | 0
  return (h >>> 0).toString(36)
}

function createPreview(sc: Script, g: GroupInfo, want: string, groupName: string, insertAt: number) {
  const v = buildRow(sc, g, want)
  const line = (k: string, val: string) => ({ type: 'box', layout: 'baseline', spacing: 'md', contents: [
    { type: 'text', text: k, color: '#888888', size: 'xs', flex: 2 },
    { type: 'text', text: val || '—', color: '#ffffff', size: 'sm', flex: 5, wrap: true },
  ] })
  return {
    type: 'flex', altText: `開車：${sc.title}`,
    contents: { type: 'bubble', size: 'mega', body: {
      type: 'box', layout: 'vertical', spacing: 'sm', backgroundColor: '#0d0d0d', paddingAll: '16px',
      contents: [
        { type: 'text', text: '🚌 要在公車表新增這車嗎？', color: GOLD, weight: 'bold', size: 'sm' },
        line('劇本', v[0]), line('日期', `${v[6]}${v[7] ? `（${v[7].replace('星期', '')}）` : ''} ${v[8] || '時間未定'}`), line('誠徵', v[5]),
        line('人數', v[2]), line('價格', v[4]), line('類型', v[1]), line('反串／換裝', `${v[3]}・${v[10]}`), line('時長', v[9]),
        { type: 'text', text: `會插在第 ${insertAt} 列（照日期排）`, color: '#666666', size: 'xxs', margin: 'md' },
        { type: 'button', style: 'primary', color: GOLD, height: 'sm', margin: 'md',
          action: { type: 'postback', label: '確定開車', data: `bus|create|${groupKey(groupName)}|${want}`, displayText: `確定開車 ${v[0]} ${v[6]} ${v[8]}` } },
      ],
    } },
  }
}

// ── 群組事件入口：處理了回傳 true ─────────────────────────────────────────────
type Ctx = { reply: (token: string, messages: unknown[]) => Promise<Response> }

export async function handleBusEvent(event: any, ctx: Ctx): Promise<boolean> {
  const src = event.source || {}
  if (src.type !== 'group' || !src.groupId) return false
  const groupId: string = src.groupId
  const uid: string = src.userId || ''
  const token: string = event.replyToken
  const say = (text: string) => ctx.reply(token, [{ type: 'text', text }])

  let cmd = '', arg = '', post: string[] = []
  if (event.type === 'postback') {
    post = String(event.postback?.data || '').split('|')
    if (post[0] !== 'bus') return false
    cmd = post[1]
  } else if (event.type === 'message' && event.message?.type === 'text') {
    const text = String(event.message.text || '').trim().replace(/^[!！]\s*/, '')
    let m: RegExpMatchArray | null
    if (/^(綁定|綁定公車|綁公車)$/.test(text)) cmd = 'find'
    else if (/^(這車|這台車|這班|公車)$/.test(text)) cmd = 'show'
    else if (/^(解除綁定|取消綁定)$/.test(text)) cmd = 'unbind'
    else if ((m = text.match(/^開車(?:\s+(?:誠徵|缺)?\s*(.*))?$/))) { cmd = 'create?'; arg = (m[1] || '').trim() }
    else if (/^(滿了|已滿|滿團)$/.test(text)) { cmd = 'want'; arg = '已滿' }
    else if (/^公車表結構$/.test(text)) cmd = 'layout'
    else if ((m = text.match(/^(?:日期|改日期)\s+(.+)$/))) { cmd = 'date'; arg = m[1].trim() }
    else if ((m = text.match(/^(?:時間|改時間)\s+(.+)$/))) { cmd = 'time'; arg = m[1].trim() }
    else if ((m = text.match(/^(?:誠徵|缺)\s*(.+)$/))) { cmd = 'want'; arg = m[1] }
    else return false
  } else return false

  if (!sheetReady()) { await say('燈燈還沒接上公車表（Google 服務帳號未設定）'); return true }

  // 「這車」大家都能看；其他要權限
  // 誠徵／滿了／日期／時間 是聊天常見的詞，不是導遊打的就當一般訊息放過；綁定／開車／解除綁定才回「只有導遊」
  if (cmd !== 'show' && !(await isEditor(uid))) {
    if (['want', 'date', 'time'].includes(cmd)) return false
    await say('這個指令只有導遊可以用喔 🙏')
    return true
  }

  const groupRow = (await dbGet(`line_groups?group_id=eq.${encodeURIComponent(groupId)}&select=group_name,sheet_code&limit=1`))?.[0]
  const code: string = groupRow?.sheet_code || ''

  try {
    if (cmd === 'find') {
      const name = groupRow?.group_name || ''
      const g = parseGroupName(name)
      const rows = await readSheet()
      await ctx.reply(token, [candidatesMessage(findCandidates(rows, g), g)])
      return true
    }

    if (cmd === 'layout') {
      const L = await readLayout()
      const names = ['劇本', '類型', '人數', '反串', '價格', '誠徵', '日期', '星期', '時間', '時長', '換裝', '備註', '網站', '封面']
      const lines = names.map((n, c) => `${LETTER(c)} ${n}：${L.header.has(c) ? '整欄公式（不寫）' : L.perRow.has(c) ? '每列公式（新增時複製）' : '手填'}`)
      await say('📋 公車表結構\n' + lines.join('\n'))
      return true
    }

    if (cmd === 'create?' || cmd === 'create') {
      const name: string = groupRow?.group_name || ''
      if (code) { await say(`這個群組已經綁了公車表（${code}），要開新車請先「解除綁定」`); return true }
      const g = parseGroupName(name)
      if (!looksLikeBus(g)) { await say('先把群組名稱改成「日期 時間 劇本」，例如「11/28 14:00 殺死巫師 @劇光燈」；還沒定的寫「XX/XX 殺死巫師」。改好再打「群組名稱」讓燈燈重讀'); return true }
      const want = normWant(cmd === 'create' ? post.slice(3).join('|') : arg)
      if (want.length > 30) { await say('誠徵太長了，例如：開車 誠徵 2男 1女'); return true }
      if (cmd === 'create' && post[2] !== groupKey(name)) { await say('群組名稱剛剛有變，請重打「開車」'); return true }
      const [rows, scripts] = await Promise.all([readSheet(), readScripts()])
      const dup = findCandidates(rows, g)
      if (dup.exact) { await ctx.reply(token, [{ type: 'text', text: '公車表上已經有這車了，直接綁定就好：' }, candidatesMessage(dup, g)]); return true }
      const f = findScript(scripts, g.script!)
      if (!f.hit) {
        await say(f.many?.length
          ? `劇本資料庫有好幾本像《${g.script}》：\n${f.many.map(x => '・' + x.title).join('\n')}\n請把群組名稱改成完整劇本名，再打「群組名稱」`
          : `劇本資料庫找不到《${g.script}》，請確認群組名稱的劇本名稱`)
        return true
      }
      const at = insertRowNumber(rows, g)
      if (cmd === 'create?') {
        const msgs: unknown[] = [createPreview(f.hit, g, want, name, at)]
        const tips: string[] = []
        if (!want) tips.push('還沒填誠徵：可以打「開車 誠徵 2男 1女」重來，或開完再打「誠徵 …」')
        if (!g.hasDate || !g.hasTime) tips.push('日期時間還沒定：開完之後打「日期 12/20」「時間 14:00」（或「日期 假日未定」「時間 白天」）')
        if (tips.length) msgs.push({ type: 'text', text: tips.map(t => '・' + t).join('\n') })
        await ctx.reply(token, msgs)
        return true
      }
      const layout = await readLayout()
      const bad = MANUAL_COLS.filter(c => !canWrite(layout, c))
      if (bad.length) { await say(`公車表的 ${bad.map(LETTER).join('、')} 欄是公式，燈燈不敢新增列，請先打「公車表結構」給工程師看`); return true }
      const c = newCode()
      await insertRow(at, buildRow(f.hit, g, want), c, layout)
      const created = (await readSheet()).find(x => x.code === c)
      if (!created) { await say('新增完找不到那一列，請打開公車表檢查 😢'); return true }
      await dbPatch('line_groups', `group_id=eq.${encodeURIComponent(groupId)}`, {
        sheet_code: c, sheet_row: snapshot(created), bound_at: new Date().toISOString(), bound_by: uid, updated_at: new Date().toISOString(),
      })
      await say(`✅ 已開車並綁定（第 ${created.row} 列）\n${rowLabel(created)}\n${wantLabel(created.want)}`)
      return true
    }

    if (cmd === 'bind') {
      const rowNum = +post[2], key = post[3]
      const rows = await readSheet()
      const r = rows.find(x => x.row === rowNum)
      if (!r || rowKey(r) !== key) { await say('公車表剛剛有變動，請重打「綁定」再選一次'); return true }
      if (r.code && r.code !== code) {
        // Z 欄有代碼但沒有任何群組在用（例如手動刪列、復原留下的）→ 當作空的，直接換成這個群組的
        const owner = await dbGet(`line_groups?sheet_code=eq.${encodeURIComponent(r.code)}&select=group_id&limit=1`)
        if (Array.isArray(owner) && owner.length) { await say(`這車已經綁了別的群組（${r.code}）。要換的話，先到那個群組打「解除綁定」，或直接清掉 Z 欄`); return true }
        r.code = ''
      }
      // 這個群組原本綁別列 → 先清掉舊的
      if (code && r.code !== code) {
        const old = rows.filter(x => x.code === code)
        for (const o of old) await writeCell(`Z${o.row}`, '')
      }
      const c = r.code || newCode()
      if (!r.code) await writeCell(`Z${r.row}`, c)
      await dbPatch('line_groups', `group_id=eq.${encodeURIComponent(groupId)}`, {
        sheet_code: c, sheet_row: snapshot(r), bound_at: new Date().toISOString(), bound_by: uid, updated_at: new Date().toISOString(),
      })
      await say(`✅ 已綁定\n${rowLabel(r)}\n${wantLabel(r.want)}\n\n之後在這裡打「誠徵 1男 1女」「滿了」「日期 12/20」「時間 14:00」，燈燈就會更新公車表`)
      return true
    }

    // 以下都需要已綁定
    if (!code) { await say('這個群組還沒綁公車表，先打「綁定」'); return true }
    const rows = await readSheet()
    const hits = rows.filter(x => x.code === code)
    if (hits.length === 0 && cmd === 'unbind') {
      await dbPatch('line_groups', `group_id=eq.${encodeURIComponent(groupId)}`, { sheet_code: null, updated_at: new Date().toISOString() })
      await say(`公車表上已經沒有 ${code} 這列了，已解除這個群組的綁定`)
      return true
    }
    if (hits.length === 0) { await say(`公車表上找不到這個群組的車次（${code}），可能已經成團移除，或 Z 欄被清掉了`); return true }
    if (hits.length > 1) { await say(`公車表上有 ${hits.length} 列都是 ${code}，燈燈不敢亂改，請先整理 Z 欄`); return true }
    const r = hits[0]

    if (cmd === 'show') {
      await say(`🚌 ${rowLabel(r)}\n${wantLabel(r.want)}`)
      return true
    }

    if (cmd === 'unbind') {
      await writeCell(`Z${r.row}`, '')
      await dbPatch('line_groups', `group_id=eq.${encodeURIComponent(groupId)}`, { sheet_code: null, updated_at: new Date().toISOString() })
      await say(`已解除綁定：${rowLabel(r)}`)
      return true
    }

    if (cmd === 'date' || cmd === 'time') {
      const v = arg.replace(/\s+/g, ' ').replace(/／/g, '/').replace(/：/g, ':')
      if (!v || v.length > 20) { await say(cmd === 'date' ? '格式：日期 12/20（或「日期 假日未定」）' : '格式：時間 14:00（或「時間 白天」）'); return true }
      const beforeLabel = rowLabel(r)
      const layout = await readLayout()
      const col = cmd === 'date' ? 6 : 8
      if (!canWrite(layout, col)) { await say(`公車表的 ${LETTER(col)} 欄是公式，燈燈不能改`); return true }
      if (cmd === 'date') {
        const cells: [string, string][] = [[`G${r.row}`, v]]
        if (canWrite(layout, 7)) cells.push([`H${r.row}`, weekdayText(v)]) // H 星期是公式就讓公式自己算
        await writeCells(cells)
      } else await writeCells([[`I${r.row}`, hhmm(v) || v]])
      await reposition(code)
      const after = (await readSheet()).find(x => x.code === code)
      if (after) {
        await dbPatch('line_groups', `group_id=eq.${encodeURIComponent(groupId)}`, { sheet_row: snapshot(after), updated_at: new Date().toISOString() })
      }
      await say(`✅ 公車表已更新\n${beforeLabel}\n→ ${after ? rowLabel(after) : '（重新讀取失敗，請看公車表）'}` +
        (after && after.row !== r.row ? `\n（照日期移到第 ${after.row} 列）` : '') +
        '\n\n燈燈小提醒：群組名稱也要記得改唷！')
      return true
    }

    if (cmd === 'want') {
      // 「1男1女」→「1男 1女」，跟表上的寫法一致
      const v = arg.trim().replace(/\s+/g, ' ').replace(/(\d+)\s*([男女])/g, '$1$2').replace(/([男女])\s*(?=\d)/g, '$1 ')
      if (!v || v.length > 30) { await say('格式：誠徵 1男 1女，或打「滿了」'); return true }
      const before = r.want
      if (!canWrite(await readLayout(), 5)) { await say('公車表的 F 欄是公式，燈燈不能改'); return true }
      await writeCell(`F${r.row}`, v)
      await dbPatch('line_groups', `group_id=eq.${encodeURIComponent(groupId)}`, {
        sheet_row: snapshot({ ...r, cells: r.cells.map((x, i) => i === COL.want ? v : x) }), updated_at: new Date().toISOString(),
      })
      await say(`✅ 公車表已更新\n${rowLabel(r)}\n誠徵 ${before || '（空白）'} → ${v}`)
      return true
    }
  } catch (e) {
    console.error('bus error:', e)
    await say('燈燈改公車表的時候出錯了 😢 ' + String((e as Error).message || e).slice(0, 80))
    return true
  }
  return false
}
