// ═══════════════════════════════════════════════════════════════════════════
// 燈燈 × 公車表單（Google Sheet「劇光燈 揪團清單」）
//
// 一個 LINE 群組綁定 Sheet 上的一列，之後在群組裡就能更新那一列：
//   綁定             用群組名稱（例「11/28 14:00 殺死巫師 @劇光燈」）找出對應的車次，按按鈕綁定
//   這車             看綁定的那列目前內容（大家都能用）
//   誠徵 1男 1女     改 F 欄（誠徵）
//   滿了             F 欄改成「已滿」
//   解除綁定         清掉 Z 欄代碼
//
// 綁定方式：在那列的 Z 欄寫一個燈燈代碼（例「燈-7KQ2MX」），之後只認代碼，列怎麼移動都不會改錯格。
// App（公車管家）只讀到 N 欄、刪列的 GAS 只比對 A～L，Z 欄不影響它們。
//
// 權限：
//   Google 服務帳號（Secrets：GOOGLE_SA_EMAIL、GOOGLE_SA_KEY_B64），Sheet 要共用給它（編輯者）
//   會改 Sheet 的指令只有 group_settings.bus_editors 裡的會員編號（逗號分隔）能用
// ═══════════════════════════════════════════════════════════════════════════

import { parseWhen, fmtDT } from './team.ts'

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

export type GroupInfo = { start_at: string | null; script: string | null }
export function parseGroupName(name: string): GroupInfo {
  const cleaned = name.replace(/[@＠]\S+/g, ' ').replace(/[（(]\d+[)）]\s*$/, ' ').trim()
  const w = parseWhen(cleaned)
  const ok = w.hasDate && w.hasTime && !!w.start_at
  return { start_at: ok ? w.start_at : null, script: (ok && w.rest) ? w.rest : null }
}

// 回傳候選：exact = 劇本、日期、時間都對；否則列出劇本對得上的（最多 4 個）
export function findCandidates(rows: BusRow[], g: GroupInfo): { exact: boolean; rows: BusRow[] } {
  if (!g.script) return { exact: false, rows: [] }
  const s = norm(g.script)
  const titleOk = (r: BusRow) => { const t = norm(r.title); return t === s || t.includes(s) || s.includes(t) }
  let mo = 0, d = 0, tm = ''
  if (g.start_at) {
    const tpe = new Date(new Date(g.start_at).getTime() + 8 * 3600_000)
    mo = tpe.getUTCMonth() + 1; d = tpe.getUTCDate()
    tm = `${String(tpe.getUTCHours()).padStart(2, '0')}:${String(tpe.getUTCMinutes()).padStart(2, '0')}`
  }
  const byTitle = rows.filter(titleOk)
  const exact = byTitle.filter(r => parseDates(r.date).some(([a, b]) => a === mo && b === d) && hhmm(r.time) === tm)
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
      ? `🔍 公車表上找不到《${g.script}》${g.start_at ? ` ${fmtDT(g.start_at)}` : ''} 這車`
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
    else if (/^(滿了|已滿|滿團)$/.test(text)) { cmd = 'want'; arg = '已滿' }
    else if ((m = text.match(/^(?:誠徵|缺)\s*(.+)$/))) { cmd = 'want'; arg = m[1] }
    else return false
  } else return false

  if (!sheetReady()) { await say('燈燈還沒接上公車表（Google 服務帳號未設定）'); return true }

  // 「這車」大家都能看；其他要權限
  if (cmd !== 'show' && !(await isEditor(uid))) {
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

    if (cmd === 'bind') {
      const rowNum = +post[2], key = post[3]
      const rows = await readSheet()
      const r = rows.find(x => x.row === rowNum)
      if (!r || rowKey(r) !== key) { await say('公車表剛剛有變動，請重打「綁定」再選一次'); return true }
      if (r.code && r.code !== code) { await say(`這車已經綁了別的群組（${r.code}）。要換的話，先到那個群組打「解除綁定」，或直接清掉 Z 欄`); return true }
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
      await say(`✅ 已綁定\n${rowLabel(r)}\n${wantLabel(r.want)}\n\n之後在這裡打「誠徵 1男 1女」或「滿了」，燈燈就會更新公車表`)
      return true
    }

    // 以下都需要已綁定
    if (!code) { await say('這個群組還沒綁公車表，先打「綁定」'); return true }
    const rows = await readSheet()
    const hits = rows.filter(x => x.code === code)
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

    if (cmd === 'want') {
      // 「1男1女」→「1男 1女」，跟表上的寫法一致
      const v = arg.trim().replace(/\s+/g, ' ').replace(/(\d+)\s*([男女])/g, '$1$2').replace(/([男女])\s*(?=\d)/g, '$1 ')
      if (!v || v.length > 30) { await say('格式：誠徵 1男 1女，或打「滿了」'); return true }
      const before = r.want
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
