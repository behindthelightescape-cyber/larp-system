// deno-lint-ignore-file no-explicit-any
// ═══════════════════════════════════════════════════════════════════════════
// 揪團（團務管理 app）— LINE 群組機器人共用模組
// 規格：docs/group-session-api.md
//
// 資料全部在團務 app（Firebase），這裡只負責：解析群組指令 → 呼叫 API → 回卡片／文字。
// 使用者：line-webhook（指令）、team-hook（app 主動通知：提醒、改時間…）
//
// Secrets：
//   TEAM_API_URL         例 https://xxx.web.app/api/v1（沒設＝功能未連線）
//   TEAM_API_KEY         機器人專用金鑰（scopes: scripts:read sessions:read sessions:write）
//   TEAM_WEBHOOK_SECRET  team-hook 驗簽用（POST /webhooks 建立時拿到的 secret）
// ═══════════════════════════════════════════════════════════════════════════

const env = (k: string) => (globalThis as any).Deno?.env.get(k) || ''
const apiBase = () => env('TEAM_API_URL').replace(/\/+$/, '')
export const teamApiReady = () => !!(apiBase() && env('TEAM_API_KEY'))

const GOLD = '#D4AF37'

// ── API client ──────────────────────────────────────────────────────────────
export class TeamApiError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: any) {
    super(message)
  }
}

export type Actor = { type: 'line_user' | 'system'; id: string; name: string }

type CallOpts = { body?: unknown; actor?: Actor; idem?: string; query?: Record<string, string | number | undefined> }

export async function teamCall(method: string, path: string, opts: CallOpts = {}): Promise<any> {
  const headers: Record<string, string> = {
    'Authorization': `Bearer ${env('TEAM_API_KEY')}`,
    'Accept': 'application/json',
  }
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json'
  if (opts.actor) {
    headers['X-Actor-Type'] = opts.actor.type
    headers['X-Actor-Id'] = opts.actor.id
    headers['X-Actor-Name'] = encodeURIComponent(opts.actor.name)
  }
  if (opts.idem) headers['Idempotency-Key'] = opts.idem
  let url = apiBase() + path
  if (opts.query) {
    const q = new URLSearchParams()
    for (const [k, v] of Object.entries(opts.query)) if (v !== undefined && v !== '') q.set(k, String(v))
    const qs = q.toString()
    if (qs) url += (url.includes('?') ? '&' : '?') + qs
  }
  let res: Response
  try {
    res = await fetch(url, {
      method, headers,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      signal: AbortSignal.timeout(8000),
    })
  } catch (e) {
    console.error('team api network error', method, path, e)
    throw new TeamApiError(0, 'NETWORK', '團務系統暫時連不上，請稍後再試')
  }
  const text = await res.text()
  let json: any = null
  try { json = text ? JSON.parse(text) : null } catch { /* 非 JSON */ }
  if (!res.ok) {
    const e = json?.error
    console.error('team api error', method, path, res.status, text.slice(0, 300))
    throw new TeamApiError(res.status, e?.code || `HTTP_${res.status}`, e?.message || `團務系統錯誤（${res.status}）`, e?.details)
  }
  return json
}

const enc = encodeURIComponent

export const teamApi = {
  activeSession: async (groupId: string): Promise<any | null> => {
    try {
      return await teamCall('GET', `/line-groups/${enc(groupId)}/active-session`, { query: { expand: 'members' } })
    } catch (e) {
      if (e instanceof TeamApiError && e.status === 404) return null
      throw e
    }
  },
  searchScripts: (q: string) => teamCall('GET', '/scripts/search', { query: { q, limit: 5 } }),
  createSession: (body: any, actor: Actor, idem: string) => teamCall('POST', '/sessions', { body, actor, idem }),
  patchSession: (sid: string, body: any, actor: Actor) => teamCall('PATCH', `/sessions/${enc(sid)}`, { body, actor }),
  action: (sid: string, act: 'confirm' | 'cancel' | 'complete', body: any, actor: Actor, idem: string) =>
    teamCall('POST', `/sessions/${enc(sid)}/${act}`, { body, actor, idem }),
  join: (sid: string, body: any, actor: Actor, idem: string) =>
    teamCall('POST', `/sessions/${enc(sid)}/members`, { body, actor, idem }),
  leaveByLine: (sid: string, uid: string, actor: Actor, reason?: string) =>
    teamCall('DELETE', `/sessions/${enc(sid)}/members/by-line/${enc(uid)}`, { actor, query: { reason } }),
  leaveById: (sid: string, mid: string, actor: Actor, reason?: string) =>
    teamCall('DELETE', `/sessions/${enc(sid)}/members/${enc(mid)}`, { actor, query: { reason } }),
  patchMemberByLine: (sid: string, uid: string, body: any, actor: Actor) =>
    teamCall('PATCH', `/sessions/${enc(sid)}/members/by-line/${enc(uid)}`, { body, actor }),
  payByLine: (sid: string, uid: string, body: any, actor: Actor, idem: string) =>
    teamCall('POST', `/sessions/${enc(sid)}/members/by-line/${enc(uid)}/payments`, { body, actor, idem }),
  addDiscount: (sid: string, mid: string, body: any, actor: Actor, idem: string) =>
    teamCall('POST', `/sessions/${enc(sid)}/members/${enc(mid)}/discounts`, { body, actor, idem }),
  paymentSummary: (sid: string) => teamCall('GET', `/sessions/${enc(sid)}/payment-summary`),
  reminderSent: (sid: string, rid: string) =>
    teamCall('POST', `/sessions/${enc(sid)}/reminders/${enc(rid)}/sent`, {
      body: { sent_at: new Date().toISOString(), channel: 'line_group' },
      actor: { type: 'system', id: 'line-bot', name: '燈燈群組小精靈' },
    }),
}

// ── 時間 ────────────────────────────────────────────────────────────────────
const TPE = 8 * 3600_000
const WD = ['日', '一', '二', '三', '四', '五', '六']
const pad = (n: number) => String(n).padStart(2, '0')
const tpe = (iso: string | Date) => new Date(new Date(iso).getTime() + TPE) // 用 UTC getter 讀台灣時間

export const fmtDate = (iso: string) => {
  const d = tpe(iso)
  const y = d.getUTCFullYear() !== tpe(new Date()).getUTCFullYear() ? `${d.getUTCFullYear()}/` : '' // 不是今年才寫年份
  return `${y}${d.getUTCMonth() + 1}/${d.getUTCDate()}（${WD[d.getUTCDay()]}）`
}
export const fmtTime = (iso: string) => { const d = tpe(iso); return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}` }
export const fmtDT = (iso: string) => `${fmtDate(iso)} ${fmtTime(iso)}`
export const fmtRange = (a: string, b?: string | null) => {
  if (!b) return fmtDT(a)
  const sameDay = tpe(a).toISOString().slice(0, 10) === tpe(b).toISOString().slice(0, 10)
  return `${fmtDT(a)}–${sameDay ? '' : fmtDate(b) + ' '}${fmtTime(b)}`
}
export const money = (n: unknown) => (Number(n) || 0).toLocaleString('en-US')

const iso8 = (y: number, mo: number, d: number, h: number, mi: number) =>
  `${y}-${pad(mo)}-${pad(d)}T${pad(h)}:${pad(mi)}:00+08:00`

// 從一段文字裡抓日期、時間、人數、價格；剩下的當劇本名稱
// base：改時間時只給日期或只給時間，用原本的補
export type When = { start_at: string | null; error?: string; rest: string; capacity?: number; price?: number; hasDate: boolean; hasTime: boolean }

export function parseWhen(input: string, now = new Date(), base?: string): When {
  let s = ' ' + input.replace(/：/g, ':').replace(/／/g, '/') + ' '
  const today = tpe(now)
  let Y = today.getUTCFullYear(), M = 0, D = 0, hasDate = false, explicitYear = false
  let h = -1, mi = 0
  const take = (re: RegExp) => { const m = s.match(re); if (m) s = s.replace(m[0], ' '); return m }

  let m = take(/(?:^|\s)(?:(\d{4})[/\-年])?(\d{1,2})[/\-月](\d{1,2})日?(?=\s|$|[^\d])/)
  if (m) { if (m[1]) { Y = +m[1]; explicitYear = true } M = +m[2]; D = +m[3]; hasDate = true }
  if (!hasDate && (m = take(/(今天|今日|明天|明日|後天|大後天)/))) {
    const add = { 今天: 0, 今日: 0, 明天: 1, 明日: 1, 後天: 2, 大後天: 3 }[m[1]] as number
    const d = new Date(today.getTime() + add * 86400_000)
    Y = d.getUTCFullYear(); M = d.getUTCMonth() + 1; D = d.getUTCDate(); hasDate = true; explicitYear = true
  }
  if (!hasDate && (m = take(/(下個?)?(?:週|周|星期|禮拜)([一二三四五六日天])/))) {
    const target = '日一二三四五六'.indexOf(m[2] === '天' ? '日' : m[2])
    let add = (target - today.getUTCDay() + 7) % 7
    if (m[1]) add += 7
    const d = new Date(today.getTime() + add * 86400_000)
    Y = d.getUTCFullYear(); M = d.getUTCMonth() + 1; D = d.getUTCDate(); hasDate = true; explicitYear = true
  }

  let capacity: number | undefined, price: number | undefined
  if ((m = take(/(\d{1,2})\s*人/))) capacity = +m[1]
  if ((m = take(/\$\s*(\d{2,5})|(\d{2,5})\s*元/))) price = +(m[1] || m[2])

  let hasTime = false
  m = take(/(上午|早上|中午|下午|晚上)?\s*(\d{1,2})(?::(\d{2})|點(?:(半)|(\d{1,2})分?)?)/)
  if (m) {
    h = +m[2]; mi = m[3] ? +m[3] : m[4] ? 30 : m[5] ? +m[5] : 0; hasTime = true
    if ((m[1] === '下午' || m[1] === '晚上') && h < 12) h += 12
    if (m[1] === '中午' && h < 12 && h !== 12) h = h <= 2 ? h + 12 : h
  }
  const rest = s.replace(/\s+/g, ' ').trim()

  if (base) {
    const b = tpe(base)
    if (!hasDate) { Y = b.getUTCFullYear(); M = b.getUTCMonth() + 1; D = b.getUTCDate(); explicitYear = true }
    if (!hasTime) { h = b.getUTCHours(); mi = b.getUTCMinutes() }
  }
  const out: When = { start_at: null, rest, capacity, price, hasDate, hasTime }
  if (!hasDate && !base) return { ...out, error: '請寫日期，例如 11/15' }
  if (h < 0) return { ...out, error: '請寫時間，例如 19:30' }
  if (h > 23 || mi > 59) return { ...out, error: '時間格式不對，例如 19:30' }
  const valid = (y: number) => { const d = new Date(Date.UTC(y, M - 1, D)); return d.getUTCMonth() === M - 1 && d.getUTCDate() === D }
  if (!valid(Y)) return { ...out, error: '日期不存在，請再確認' }
  let at = iso8(Y, M, D, h, mi)
  // 沒寫年份、日期早就過了（超過 60 天，例如 12 月打 1/5）→ 當作明年；最近才過的當打錯，下面會擋
  if (!explicitYear && new Date(at).getTime() < now.getTime() - 60 * 86400_000 && valid(Y + 1)) at = iso8(Y + 1, M, D, h, mi)
  if (new Date(at).getTime() < now.getTime()) return { ...out, start_at: at, error: '這個時間已經過了' }
  return { ...out, start_at: at }
}

// ── 顯示 ────────────────────────────────────────────────────────────────────
const STATUS: Record<string, [string, string]> = {
  recruiting: ['招募中', GOLD],
  confirmed:  ['已成團', '#4caf50'],
  completed:  ['已結束', '#888888'],
  cancelled:  ['已取消', '#e05555'],
}
export const isOpen = (s: any) => s && (s.status === 'recruiting' || s.status === 'confirmed')

const row = (label: string, value: string) => ({
  type: 'box', layout: 'baseline', spacing: 'md',
  contents: [
    { type: 'text', text: label, size: 'sm', color: '#888888', flex: 2 },
    { type: 'text', text: value || '—', size: 'sm', color: '#eeeeee', flex: 6, wrap: true },
  ],
})
const btn = (label: string, data: string, displayText: string, primary: boolean) => ({
  type: 'box', layout: 'vertical', flex: 1,
  backgroundColor: primary ? GOLD : '#2a2a2a', cornerRadius: '8px',
  paddingTop: '10px', paddingBottom: '10px',
  action: { type: 'postback', label, data, displayText },
  contents: [{ type: 'text', text: label, size: 'sm', weight: 'bold', align: 'center', color: primary ? '#080808' : '#eeeeee' }],
})

export const scriptTitle = (s: any) => s?.script?.title || s?.title || '揪團'

export function sessionCard(s: any, headline = '揪團') {
  const c = s.counts || {}
  const joined = c.joined ?? (s.members || []).filter((m: any) => m.status === 'joined').length
  const cap = s.capacity
  const [stText, stColor] = STATUS[s.status] || [String(s.status || ''), '#888888']
  const people = `${joined}${cap ? '/' + cap : ''} 人` + (c.waitlist ? `・候補 ${c.waitlist}` : '') + (cap && joined >= cap ? '（已滿）' : '')
  const rows: any[] = [
    row('時間', fmtRange(s.start_at, s.end_at)),
    row('人數', people),
    row('費用', s.price_per_person != null ? `每人 $${money(s.price_per_person)}` : '—'),
  ]
  if (s.payment_deadline) rows.push(row('繳費期限', fmtDT(s.payment_deadline)))
  if (s.venue?.name) rows.push(row('地點', s.venue.name + (s.venue.room ? ` ${s.venue.room}` : '')))
  if (s.organizer?.display_name) rows.push(row('團主', s.organizer.display_name))
  if (s.note) rows.push(row('備註', s.note))
  if (c.amount_due) rows.push(row('收款', `$${money(c.amount_paid)} / $${money(c.amount_due)}`))

  const card: any = {
    type: 'flex',
    altText: `${headline}｜《${scriptTitle(s)}》${fmtDT(s.start_at)}｜${people}`,
    contents: {
      type: 'bubble', size: 'mega',
      styles: { header: { backgroundColor: '#080808' }, body: { backgroundColor: '#0d0d0d' }, footer: { backgroundColor: '#0d0d0d' } },
      header: {
        type: 'box', layout: 'horizontal', paddingAll: '14px', alignItems: 'center',
        contents: [
          { type: 'text', text: headline, size: 'xs', color: GOLD, weight: 'bold', flex: 1 },
          {
            type: 'box', layout: 'vertical', flex: 0, backgroundColor: stColor, cornerRadius: '20px',
            paddingTop: '3px', paddingBottom: '3px', paddingStart: '10px', paddingEnd: '10px',
            contents: [{ type: 'text', text: stText, size: 'xs', color: '#080808', weight: 'bold' }],
          },
        ],
      },
      body: {
        type: 'box', layout: 'vertical', paddingAll: '16px', spacing: 'sm',
        contents: [
          { type: 'text', text: `《${scriptTitle(s)}》`, size: 'xl', color: '#ffffff', weight: 'bold', wrap: true },
          { type: 'separator', color: '#2a2a2a', margin: 'md' },
          { type: 'box', layout: 'vertical', spacing: 'sm', margin: 'md', contents: rows },
        ],
      },
    },
  }
  if (isOpen(s)) {
    card.contents.footer = {
      type: 'box', layout: 'horizontal', paddingAll: '12px', spacing: 'sm',
      contents: [btn('報名 +1', `team|join|${s.id}`, '+1', true), btn('名單', `team|list|${s.id}`, '名單', false)],
    }
  }
  return card
}

const PAY: Record<string, string> = {
  paid: '✅', unpaid: '⬜', partially_paid: '🟡', pending_review: '⏳', waived: '🎟️', refunded: '↩️',
}
export const memberName = (m: any) => m.nickname || m.display_name || '（未命名）'

export function rosterText(s: any): string {
  const ms: any[] = s.members || []
  const joined = ms.filter(m => m.status === 'joined')
  const wait = ms.filter(m => m.status === 'waitlist').sort((a, b) => (a.waitlist_position ?? 0) - (b.waitlist_position ?? 0))
  const c = s.counts || {}
  const lines = [
    `《${scriptTitle(s)}》${fmtDT(s.start_at)}`,
    `報名 ${joined.length}${s.capacity ? '/' + s.capacity : ''}` + (c.amount_due ? `・已收 $${money(c.amount_paid)} / $${money(c.amount_due)}` : ''),
    '',
  ]
  joined.forEach((m, i) => {
    const p = m.payment || {}
    let pay = PAY[p.status] ?? `(${p.status ?? '?'})`
    if (p.status === 'partially_paid' || p.status === 'unpaid') pay += ` 差 $${money(p.balance ?? p.amount_due)}`
    const tags = [m.role === 'organizer' ? '團主' : m.role === 'gm' ? 'GM' : '', m.guest_of ? '朋友' : ''].filter(Boolean)
    lines.push(`${i + 1}. ${memberName(m)}${tags.length ? `（${tags.join('・')}）` : ''} ${pay}` + (m.note ? `｜${m.note}` : ''))
  })
  if (!joined.length) lines.push('還沒有人報名')
  if (wait.length) {
    lines.push('', '候補')
    wait.forEach((m, i) => lines.push(`${i + 1}. ${memberName(m)}` + (m.note ? `｜${m.note}` : '')))
  }
  lines.push('', '✅已繳 ⬜未繳 🟡部分 ⏳待確認 🎟️免繳')
  return lines.join('\n')
}

// textV2：{u0} 會變成真正的 @ 提及
export function mentionText(template: string, users: Record<string, string>) {
  const keys = Object.keys(users)
  if (!keys.length) return { type: 'text', text: template }
  const substitution: Record<string, unknown> = {}
  for (const k of keys) substitution[k] = { type: 'mention', mentionee: { type: 'user', userId: users[k] } }
  return { type: 'textV2', text: template, substitution }
}

// 名字裡如果有 { } 會被 textV2 當成變數，先換掉
const safe = (s: string) => String(s ?? '').replace(/[{}]/g, '')

// 把一串團員轉成「@A @B」：有 LINE id 的用真 @，沒有的寫名字
export function mentionList(members: any[], prefix = 'm') {
  const users: Record<string, string> = {}
  const parts = members.map((m, i) => {
    const uid = m.line_user_id
    if (uid) { const k = `${prefix}${i}`; users[k] = uid; return `{${k}}` }
    return safe(memberName(m))
  })
  return { text: parts.join(' '), users }
}

export const HELP = [
  '🎲 揪團指令',
  '',
  '揪團 傘靈 11/15 19:30',
  '　（可加：6人、700元；日期也可以寫 明天、週六）',
  '本團｜看這團資訊',
  '+1｜報名　　+1 小美｜幫朋友報名',
  '-1｜退出　　-1 小美｜幫朋友退出',
  '名單｜誰報了、誰繳了',
  '未繳｜還沒繳費的人',
  '我匯了 12345｜回報匯款（帳號後五碼）',
  '繳費 @小明｜團主記錄已繳（可加金額、現金）',
  '備註 用預售券1張｜給自己備註',
  '備註 @小明 內容｜幫別人備註',
  '用券 @小明｜用一張預售券折抵',
  '改時間 11/16 14:00',
  '成團｜取消團｜結團',
  '劇本 傘靈｜查劇本人數、價格',
].join('\n')

// ── 指令處理 ────────────────────────────────────────────────────────────────
export type TeamCtx = {
  reply: (replyToken: string, messages: unknown[]) => Promise<unknown>
  profileName: (groupId: string, userId: string) => Promise<string>
  now?: Date
}

type Mentionee = { index: number; length: number; type?: string; userId?: string }

const METHOD: [RegExp, string][] = [[/現金/, 'cash'], [/匯款|轉帳/, 'transfer'], [/line\s*pay/i, 'line_pay'], [/街口/, 'jkopay']]

// 回 true＝這則訊息是揪團指令且已處理（呼叫端就不要再做別的事）
export async function handleTeamEvent(event: any, ctx: TeamCtx): Promise<boolean> {
  const src = event.source || {}
  if (src.type !== 'group' || !src.groupId || !src.userId) return false
  const groupId: string = src.groupId
  const uid: string = src.userId
  const replyToken: string = event.replyToken
  const eventId: string = event.webhookEventId || `${uid}:${event.timestamp}`
  const now = ctx.now || new Date()

  let cmd = '', arg = '', mentionees: Mentionee[] = [], postSid = ''
  let postExtra: string[] = []

  if (event.type === 'postback') {
    const parts = String(event.postback?.data || '').split('|')
    if (parts[0] !== 'team') return false
    cmd = { join: '+1', leave: '-1', list: '名單', pick: '__pick' }[parts[1]] || ''
    if (!cmd) return false
    postSid = parts[2] || ''
    postExtra = parts.slice(2)
  } else if (event.type === 'message' && event.message?.type === 'text') {
    const raw: string = event.message.text || ''
    mentionees = (event.message.mention?.mentionees || []) as Mentionee[]
    // 把 @名字 從文字裡拿掉，剩下的才是參數
    let text = raw
    for (const mt of [...mentionees].sort((a, b) => b.index - a.index)) {
      text = text.slice(0, mt.index) + ' ' + text.slice(mt.index + mt.length)
    }
    text = text.trim().replace(/^[!！]\s*/, '')
    let m: RegExpMatchArray | null
    if ((m = text.match(/^([+＋]1)\s*([\s\S]*)$/))) { cmd = '+1'; arg = m[2] }
    else if ((m = text.match(/^([-－]1)\s*([\s\S]*)$/))) { cmd = '-1'; arg = m[2] }
    else if ((m = text.match(/^(\S+?)(?:\s+([\s\S]*))?$/))) { cmd = m[1]; arg = (m[2] || '').trim() }
    const ALIAS: Record<string, string> = {
      揪團: '揪團', 本團: '本團', 團: '本團', 報名: '+1', 退出: '-1', 名單: '名單',
      未繳: '未繳', 繳費: '繳費', 已繳: '繳費', 我匯了: '我匯了', 已匯款: '我匯了', 備註: '備註', 用券: '用券',
      改時間: '改時間', 成團: '成團', 取消團: '取消團', 結團: '結團', 劇本: '劇本', 揪團說明: '說明', 揪團指令: '說明',
    }
    // 允許黏在一起寫：揪團傘靈 11/15 19:30
    if (!ALIAS[cmd] && /^揪團\S/.test(cmd)) { arg = (cmd.slice(2) + ' ' + arg).trim(); cmd = '揪團' }
    if (cmd !== '+1' && cmd !== '-1') cmd = ALIAS[cmd] || ''
    if (!cmd) return false
  } else return false

  const say = (...msgs: unknown[]) => ctx.reply(replyToken, msgs)
  const text = (t: string) => ({ type: 'text', text: t })

  if (!teamApiReady()) {
    if (cmd === '說明') { await say(text('揪團功能還在準備中（團務系統尚未連線）')); return true }
    return false
  }

  const myName = await ctx.profileName(groupId, uid).catch(() => '') || '團員'
  const actor: Actor = { type: 'line_user', id: uid, name: myName }

  try {
    if (cmd === '說明') { await say(text(HELP)); return true }

    if (cmd === '劇本') {
      if (!arg) { await say(text('要查哪本？例如：劇本 傘靈')); return true }
      const r = await teamApi.searchScripts(arg)
      const list: any[] = (r?.data || []).map((x: any) => x.script || x)
      if (!list.length) { await say(text(`找不到「${arg}」`)); return true }
      const lines = list.slice(0, 5).map(sc => [
        `《${sc.title}》`,
        sc.players?.text ? `人數：${sc.players.text}` : (sc.players?.max ? `人數：${sc.players.min ?? sc.players.max}–${sc.players.max} 人` : ''),
        sc.duration_minutes ? `時長：約 ${Math.round(sc.duration_minutes / 6) / 10} 小時` : '',
        sc.price != null ? `每人：$${money(sc.price)}` : '',
        sc.category?.length ? `分類：${[].concat(sc.category).join('、')}` : '',
      ].filter(Boolean).join('\n'))
      await say(text(lines.join('\n\n')))
      return true
    }

    if (cmd === '揪團' || cmd === '__pick') {
      let body: any
      if (cmd === '__pick') {
        // team|pick|<script_id>|<start_at>|<capacity>|<price>
        const [scriptId, startAt, cap, price] = postExtra
        body = { script_id: scriptId, start_at: startAt, capacity: cap ? +cap : null, price_per_person: price ? +price : null }
      } else {
        const w = parseWhen(arg, now)
        // 「揪團」是常用字（例：揪團 有人要玩嗎），沒寫日期也沒寫時間就當聊天，不回應
        if (!w.hasDate && !w.hasTime) return false
        if (w.error) { await say(text(`${w.error}\n例如：揪團 傘靈 11/15 19:30`)); return true }
        if (!w.rest) { await say(text('要揪哪本？例如：揪團 傘靈 11/15 19:30')); return true }
        body = { script_query: w.rest, start_at: w.start_at, capacity: w.capacity ?? null, price_per_person: w.price ?? null }
      }
      body = { ...body, line_group_id: groupId, organizer_joins: true, organizer: { line_user_id: uid, display_name: myName } }
      try {
        const s = await teamApi.createSession(body, actor, eventId)
        await say(sessionCard(s, '🎲 揪團囉'))
      } catch (e) {
        if (e instanceof TeamApiError && e.code === 'SCRIPT_AMBIGUOUS' && Array.isArray(e.details?.candidates)) {
          const items = e.details.candidates.slice(0, 13).map((c: any) => ({
            type: 'action',
            action: {
              type: 'postback',
              label: String(c.title).slice(0, 20),
              data: ['team', 'pick', c.id, body.start_at, body.capacity ?? '', body.price_per_person ?? ''].join('|'),
              displayText: `揪團《${c.title}》`,
            },
          }))
          await say({ type: 'text', text: `${e.message}\n請選一本：`, quickReply: { items } })
          return true
        }
        if (e instanceof TeamApiError && e.code === 'GROUP_HAS_ACTIVE_SESSION') {
          const s = await teamApi.activeSession(groupId).catch(() => null)
          await say(text(e.message), ...(s ? [sessionCard(s, '這個群組目前的團')] : []))
          return true
        }
        throw e
      }
      return true
    }

    // 以下都需要「這個群組目前的團」；沒有團就安靜（避免一般群組打 +1 被回）
    const s = await teamApi.activeSession(groupId)
    if (!s || (postSid && postSid !== s.id)) {
      if (event.type === 'postback') await say(text('這團已經結束或取消了'))
      return event.type === 'postback'
    }
    const members: any[] = s.members || []
    const findLine = (u: string) => members.find(m => m.line_user_id === u && (m.status === 'joined' || m.status === 'waitlist'))
    const targets = mentionees.filter(mt => mt.type !== 'all')
    const nameOf = async (u: string) => { const m = findLine(u); return m ? memberName(m) : (await ctx.profileName(groupId, u).catch(() => '') || '團員') }

    if (cmd === '本團') { await say(sessionCard(s)); return true }
    if (cmd === '名單') { await say(text(rosterText(s))); return true }

    if (cmd === '+1') {
      const guest = arg.trim()
      const me = findLine(uid)
      const body = guest
        ? { line_user_id: null, display_name: guest, guest_of: me?.id ?? null, role: 'player' }
        : { line_user_id: uid, display_name: myName, role: 'player' }
      const r = await teamApi.join(s.id, body, actor, eventId)
      const mem = r.member || r
      const ss = r.session || s
      const c = ss.counts || {}
      const who = guest ? `${guest}（${myName} 的朋友）` : myName
      let msg: string
      if (r.created === false && mem.status === 'joined') msg = `${who} 已經在名單裡了`
      else if (mem.status === 'waitlist') msg = `${who} 排入候補第 ${mem.waitlist_position ?? '?'} 位（目前 ${c.joined ?? '?'}/${ss.capacity ?? '?'} 已滿）`
      else msg = `✅ ${who} 報名成功（${c.joined ?? '?'}/${ss.capacity ?? '?'}）`
      if (mem.payment?.amount_due) msg += `\n應繳 $${money(mem.payment.amount_due)}`
      await say(text(msg + warn(r)))
      return true
    }

    if (cmd === '-1') {
      const guest = arg.trim()
      let r: any
      if (guest) {
        const g = members.find(m => !m.line_user_id && memberName(m) === guest && (m.status === 'joined' || m.status === 'waitlist'))
        if (!g) { await say(text(`名單裡找不到「${guest}」`)); return true }
        r = await teamApi.leaveById(s.id, g.id, actor)
      } else {
        if (!findLine(uid)) { await say(text(`${myName} 不在名單裡`)); return true }
        r = await teamApi.leaveByLine(s.id, uid, actor)
      }
      const c = r.session?.counts || {}
      const out: unknown[] = [text(`👋 ${guest || myName} 已退出` + (c.joined != null ? `（${c.joined}/${r.session?.capacity ?? s.capacity}）` : ''))]
      if (r.promoted) {
        const ml = mentionList([r.promoted], 'p')
        out.push(mentionText(`🎉 候補遞補：${ml.text} 轉為正式報名！`, ml.users))
      }
      await say(...out)
      return true
    }

    if (cmd === '未繳') {
      const sum = await teamApi.paymentSummary(s.id)
      const un: any[] = sum.unpaid_members || []
      if (!un.length) { await say(text(`🎉 全部繳清（已收 $${money(sum.amount_paid)}）`)); return true }
      const ml = mentionList(un.map(u => ({ ...u, display_name: u.display_name })), 'u')
      const lines = un.map(u => `・${safe(u.display_name)} 差 $${money(u.balance)}`).join('\n')
      await say(mentionText(`還沒繳費（共差 $${money(sum.balance)}）：\n${lines}\n\n${ml.text}`, ml.users))
      return true
    }

    if (cmd === '繳費') {
      if (!targets.length) { await say(text('要記誰？例如：繳費 @小明\n（可加金額：繳費 @小明 300 現金）')); return true }
      const amt = arg.match(/\d{2,6}/)
      const method = METHOD.find(([re]) => re.test(arg))?.[1] || 'other'
      const lines: string[] = []
      let i = 0
      for (const t of targets) {
        i++
        if (!t.userId) { lines.push('⚠️ 有人沒辦法辨識（可能還沒加機器人好友），請對方自己 +1 再記'); continue }
        const nm = await nameOf(t.userId)
        try {
          const r = await teamApi.payByLine(s.id, t.userId, { kind: 'payment', amount: amt ? +amt[0] : null, method, status: 'confirmed' }, actor, `${eventId}:${i}`)
          const p = r.member?.payment || {}
          if (!r.payment) lines.push(`${nm} 本來就繳清了`)
          else lines.push(`${PAY[p.status] ?? '✅'} ${nm} 已繳 $${money(r.payment.amount)}` + (p.balance > 0 ? `，還差 $${money(p.balance)}` : ''))
        } catch (e) {
          if (!(e instanceof TeamApiError) || e.status === 0 || e.status >= 500) throw e
          lines.push(`⚠️ ${nm}：${e.message}`)
        }
      }
      await say(text(lines.join('\n')))
      return true
    }

    if (cmd === '我匯了') {
      const nums = arg.match(/\d+/g) || []
      const last5 = nums.find(n => n.length === 5) || null
      const amt = nums.find(n => n !== last5)
      const r = await teamApi.payByLine(s.id, uid, {
        kind: 'payment', amount: amt ? +amt : null, method: 'transfer', remit_last5: last5, status: 'pending',
      }, actor, eventId)
      const org = members.find(m => m.role === 'organizer')
      const amount = r.payment?.amount
      let tpl = `⏳ 收到 ${safe(myName)} 的匯款回報` + (amount ? ` $${money(amount)}` : '') + (last5 ? `（後五碼 ${last5}）` : '')
      const users: Record<string, string> = {}
      if (org?.line_user_id && org.line_user_id !== uid) { tpl += `\n{o0} 對帳後請打：繳費 @${safe(myName)}`; users.o0 = org.line_user_id }
      await say(mentionText(tpl, users))
      return true
    }

    if (cmd === '備註') {
      const note = arg.trim()
      if (!note) { await say(text('備註內容是？例如：備註 用預售券1張\n（打「備註 清除」可以清掉）')); return true }
      const value = /^(清除|刪除|清空)$/.test(note) ? null : note
      const who = targets.length ? targets : [{ userId: uid } as Mentionee]
      const lines: string[] = []
      for (const t of who) {
        if (!t.userId) continue
        const nm = t.userId === uid ? (findLine(uid) ? memberName(findLine(uid)) : myName) : await nameOf(t.userId)
        try {
          await teamApi.patchMemberByLine(s.id, t.userId, { note: value }, actor)
          lines.push(value ? `📝 ${nm}：${value}` : `📝 已清除 ${nm} 的備註`)
        } catch (e) {
          if (!(e instanceof TeamApiError) || e.status === 0 || e.status >= 500) throw e
          lines.push(`⚠️ ${nm}：${e.message}`)
        }
      }
      await say(text(lines.join('\n') || '沒有可以備註的人'))
      return true
    }

    if (cmd === '用券') {
      const who = targets.length ? targets : [{ userId: uid } as Mentionee]
      const lines: string[] = []
      let i = 0
      for (const t of who) {
        i++
        const mem = t.userId ? findLine(t.userId) : null
        if (!mem) { lines.push('⚠️ 名單裡找不到這個人，請先 +1'); continue }
        try {
          const r = await teamApi.addDiscount(s.id, mem.id, { type: 'presale_coupon', label: '預售券', amount: null, note: arg || null }, actor, `${eventId}:${i}`)
          const p = (r.member || r).payment || {}
          lines.push(`🎟️ ${memberName(mem)} 使用預售券，應繳變成 $${money(p.amount_due)}` + (p.balance > 0 ? `（還差 $${money(p.balance)}）` : ''))
        } catch (e) {
          if (!(e instanceof TeamApiError) || e.status === 0 || e.status >= 500) throw e
          lines.push(`⚠️ ${memberName(mem)}：${e.message}`)
        }
      }
      await say(text(lines.join('\n')))
      return true
    }

    if (cmd === '改時間') {
      const w = parseWhen(arg, now, s.start_at)
      if (!w.hasDate && !w.hasTime) { await say(text('改到什麼時候？例如：改時間 11/16 14:00')); return true }
      if (w.error) { await say(text(w.error)); return true }
      const r = await teamApi.patchSession(s.id, { start_at: w.start_at }, actor)
      await say(text(`🕒 時間改成 ${fmtDT(r.start_at || w.start_at!)}` + warn(r)))
      return true
    }

    if (cmd === '成團' || cmd === '取消團' || cmd === '結團') {
      const act = ({ 成團: 'confirm', 取消團: 'cancel', 結團: 'complete' } as const)[cmd]
      const r = await teamApi.action(s.id, act, arg ? { reason: arg } : {}, actor, eventId)
      const ss = r.session || r
      if (act === 'confirm') { await say(sessionCard(ss, '🎉 成團！')); return true }
      if (act === 'complete') { await say(text(`🏁《${scriptTitle(ss)}》結團，辛苦了！`)); return true }
      let msg = `❌《${scriptTitle(ss)}》已取消` + (arg ? `（${arg}）` : '')
      const rs: any[] = r.refund_summary || []
      const refunds = rs.filter(x => x.refund > 0 || x.amount_paid > 0)
      if (refunds.length) msg += '\n\n要退款：\n' + refunds.map(x => `・${x.display_name} $${money(x.refund ?? x.amount_paid)}`).join('\n')
      await say(text(msg))
      return true
    }
  } catch (e) {
    if (e instanceof TeamApiError) { await say(text(`⚠️ ${e.message}`)); return true }
    console.error('team handler error', e)
    await say(text('⚠️ 揪團功能出錯了，請稍後再試'))
    return true
  }
  return false
}

const warn = (r: any) => {
  const w: any[] = r?.warnings || []
  return w.length ? '\n\n' + w.map(x => `⚠️ ${typeof x === 'string' ? x : x.message}`).join('\n') : ''
}

// ── app 主動通知（team-hook 用）─────────────────────────────────────────────
// 回傳要推到群組的訊息；回 [] 表示這個事件不發話
export function webhookMessages(ev: any): unknown[] {
  const s = ev.session
  if (!s?.line_group_id) return []
  const type: string = ev.type
  if (ev.via === 'line-bot' && type !== 'reminder.due') return [] // 機器人當下已經回過
  const t = (x: string) => ({ type: 'text', text: x })

  if (type === 'reminder.due') {
    const kind = ev.data?.reminder?.kind
    const head = kind === 'day_before' ? '⏰ 明天揪團提醒'
      : kind === 'hours_before' ? '⏰ 今天揪團提醒'
      : kind === 'payment_due' ? '💰 繳費提醒' : '⏰ 揪團提醒'
    const c = s.counts || {}
    const un: any[] = ev.data?.unpaid_members || []
    let tpl = `${head}\n《${safe(scriptTitle(s))}》${fmtRange(s.start_at, s.end_at)}\n目前 ${c.joined ?? '?'}${s.capacity ? '/' + s.capacity : ''} 人`
    if (s.venue?.name) tpl += `｜${safe(s.venue.name)}`
    let users: Record<string, string> = {}
    if (un.length) {
      const ml = mentionList(un, 'u')
      users = ml.users
      tpl += `\n\n還沒繳費：${ml.text}`
      if (s.payment_deadline) tpl += `\n（繳費期限 ${fmtDT(s.payment_deadline)}）`
    }
    return [mentionText(tpl, users)]
  }
  if (type === 'session.rescheduled') return [t(`🕒 時間異動：《${scriptTitle(s)}》改成 ${fmtRange(s.start_at, s.end_at)}`)]
  if (type === 'session.confirmed') return [sessionCard(s, '🎉 成團！')]
  if (type === 'session.cancelled') return [t(`❌《${scriptTitle(s)}》已取消` + (ev.data?.reason ? `（${ev.data.reason}）` : ''))]
  if (type === 'member.promoted') {
    const m = ev.data?.member
    if (!m) return []
    const ml = mentionList([m], 'p')
    return [mentionText(`🎉 候補遞補：${ml.text} 轉為正式報名《${safe(scriptTitle(s))}》！`, ml.users)]
  }
  if (type === 'payment.reported') {
    const m = ev.data?.member, p = ev.data?.payment
    if (!m) return []
    return [t(`⏳ ${memberName(m)} 回報匯款` + (p?.amount ? ` $${money(p.amount)}` : '') + (p?.remit_last5 ? `（後五碼 ${p.remit_last5}）` : '') + '，請團主對帳')]
  }
  return []
}
