import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'
import { notifyAdmins } from './notify.ts'

// 推播共用邏輯：篩選會員（resolveTarget）、發送（sendPush）、查額度（getQuota）。
// admin-push（後台立即發送 / 預約）與 scheduled-push-runner（排程執行）共用。

const PAGE_SIZE = 1000
const PARALLEL_PAGES = 6
const CHUNK_SIZE = 500
export const MAX_TEXT = 5000
const LINE_USER_ID = /^U[0-9a-f]{32}$/
export const MISSING_TAG = '{缺少劇本}'

export type Filter = {
  level_min?: number
  level_max?: number
  points_min?: number
  joined_after?: string   // YYYY-MM-DD
  joined_before?: string  // YYYY-MM-DD
  birthday_month?: number
  login_status?: 'logged_in' | 'never'  // 登入過 App / 從未登入
  last_login_after?: string             // 最後登入日期 >=（YYYY-MM-DD）
  last_login_before?: string            // 最後登入日期 <=
  play_count_min?: number
  play_count_max?: number
  last_played_after?: string   // 最後遊玩日期 >= （YYYY-MM-DD，台灣時間；從沒玩過的不算）
  last_played_before?: string  // 最後遊玩日期 <=
  played_scripts?: number[]     // 玩過其中至少 played_scripts_min 部（預設 1 = 任一）
  played_scripts_min?: number
  played_scripts_max?: number  // 最多玩過其中幾部（搭配 min=0 可篩「只玩過 0～1 部」）
  not_played_scripts?: number[] // 這些都沒玩過
  achievement_id?: string       // 成就差一點：還沒解鎖、只差 1～achievement_missing_max 部劇本
  achievement_missing_max?: number
  // 成就狀態：'' 或 missing＝差幾本（預設）；done＝已達成（玩過全部或已領）；unclaimed＝玩過全部但還沒領；claimed＝已領取
  achievement_mode?: '' | 'missing' | 'done' | 'unclaimed' | 'claimed'
  categories?: string[]         // 玩過其中任一類型
  branches?: string[]           // 去過其中任一分店
  has_coupon?: boolean          // 有未使用、未過期的票券
  exclude_presale_buyers?: boolean // 排除已買預售票（待匯款／待查帳／已發券）
  exclude_pushed_days?: number     // 排除最近 N 天（含今天，台灣日期）收過推播的人；1＝今天
}

// exclude_ids：在後台「瀏覽完整名單」手動排除的人（發送、預約到期時都會排除）
export type Target = ({ mode: 'ids'; ids: string[] } | ({ mode: 'filter' } & Filter)) & { exclude_ids?: string[] }

export const LINE_TOKEN = Deno.env.get('LINE_CHANNEL_ACCESS_TOKEN') ?? ''
export const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
)

const num = (v: unknown) => (v === '' || v === null || v === undefined || isNaN(Number(v)) ? null : Number(v))
const nonEmpty = <T>(a?: T[]) => (Array.isArray(a) && a.length > 0 ? a : null)

// 分頁抓完整張表（PostgREST 單次上限 1000 筆）：每輪平行抓 PARALLEL_PAGES 頁，直到某頁不滿為止
// build() 必須含 .order()，分頁結果才會穩定
// deno-lint-ignore no-explicit-any
async function fetchAll<T>(build: () => any, label: string): Promise<T[]> {
  const out: T[] = []
  for (let page = 0; ; page += PARALLEL_PAGES) {
    const batch = await Promise.all(
      Array.from({ length: PARALLEL_PAGES }, (_, k) => {
        const from = (page + k) * PAGE_SIZE
        return build().range(from, from + PAGE_SIZE - 1)
      }),
    )
    for (const { data, error } of batch) {
      if (error) throw new Error(`讀取${label}失敗: ${error.message}`)
      out.push(...(data ?? []))
      if (!data || data.length < PAGE_SIZE) return out
    }
  }
}

export async function getQuota() {
  const headers = { Authorization: `Bearer ${LINE_TOKEN}` }
  const [q, c] = await Promise.all([
    fetch('https://api.line.me/v2/bot/message/quota', { headers }).then((r) => r.json()),
    fetch('https://api.line.me/v2/bot/message/quota/consumption', { headers }).then((r) => r.json()),
  ])
  const limit = q.type === 'limited' ? Number(q.value) : null // null = 無上限
  const used = Number(c.totalUsage ?? 0)
  return { limit, used, remaining: limit === null ? null : Math.max(limit - used, 0) }
}

async function resolveIds(ids: string[]) {
  const unique = [...new Set((ids ?? []).map(String))]
  const out: string[] = []
  for (let i = 0; i < unique.length; i += PAGE_SIZE) {
    const { data, error } = await supabase
      .from('users').select('id').in('id', unique.slice(i, i + PAGE_SIZE)).eq('is_blocked', false)
    if (error) throw new Error(`讀取會員失敗: ${error.message}`)
    for (const r of data ?? []) if (LINE_USER_ID.test(r.id)) out.push(r.id)
  }
  return out
}

export type Resolved = {
  ids: string[]
  lastPlayed: Map<string, number> | null // 最後遊玩時間（預覽用；沒用到遊玩條件時為 null）
  missing: Map<string, number[]> | null  // 成就還缺的劇本 id（有選成就時才有）
}

async function resolveFilter(f: Filter): Promise<Resolved> {
  let lastPlayed: Map<string, number> | null = null
  let missing: Map<string, number[]> | null = null
  // 1. users 表本身的條件
  const levelMin = num(f.level_min), levelMax = num(f.level_max), pointsMin = num(f.points_min)
  const users = await fetchAll<{ id: string }>(() => {
    let q = supabase.from('users').select('id').eq('is_blocked', false).order('id')
    if (levelMin !== null) q = q.gte('level', levelMin)
    if (levelMax !== null) q = q.lte('level', levelMax)
    if (pointsMin !== null) q = q.gte('points', pointsMin)
    if (f.joined_after) q = q.gte('created_at', `${f.joined_after}T00:00:00+08:00`)
    if (f.joined_before) q = q.lte('created_at', `${f.joined_before}T23:59:59+08:00`)
    if (f.login_status === 'never') q = q.is('last_login_at', null)
    if (f.login_status === 'logged_in') q = q.not('last_login_at', 'is', null)
    if (f.last_login_after) q = q.gte('last_login_at', `${f.last_login_after}T00:00:00+08:00`)
    if (f.last_login_before) q = q.lte('last_login_at', `${f.last_login_before}T23:59:59+08:00`)
    return q
  }, '會員')
  let ids = users.map((u) => u.id).filter((id) => LINE_USER_ID.test(id))

  // 2. 生日月份
  const month = num(f.birthday_month)
  if (month !== null && month >= 1 && month <= 12) {
    const rows = await fetchAll<{ user_id: string; birthday: string }>(
      () => supabase.from('users_private').select('user_id, birthday').not('birthday', 'is', null).order('user_id'),
      '生日',
    )
    const set = new Set(rows.filter((r) => Number(String(r.birthday).slice(5, 7)) === month).map((r) => r.user_id))
    ids = ids.filter((id) => set.has(id))
  }

  // 3. 遊玩紀錄相關條件
  const playCountMin = num(f.play_count_min), playCountMax = num(f.play_count_max)
  const lastAfter = f.last_played_after ? Date.parse(`${f.last_played_after}T00:00:00+08:00`) : null
  const lastBefore = f.last_played_before ? Date.parse(`${f.last_played_before}T23:59:59+08:00`) : null
  const played = nonEmpty(f.played_scripts)?.map(Number)
  const playedMax = num(f.played_scripts_max)
  const playedMin = Math.max(0, num(f.played_scripts_min) ?? (playedMax !== null ? 0 : 1))
  const notPlayed = nonEmpty(f.not_played_scripts)?.map(Number)
  const categories = nonEmpty(f.categories)
  const branches = nonEmpty(f.branches)

  // 成就：條件是「玩過 script_ids 全部」
  let achScripts: number[] | null = null
  let achUnlocked = new Set<string>()
  const achMissingMax = Math.max(1, num(f.achievement_missing_max) ?? 1)
  const achMode = ['done', 'unclaimed', 'claimed'].includes(f.achievement_mode ?? '') ? f.achievement_mode : 'missing'
  if (f.achievement_id) {
    const { data: ach, error } = await supabase
      .from('achievements').select('condition_type, condition_value').eq('id', f.achievement_id).single()
    if (error || !ach) throw new Error('找不到這個成就')
    if (ach.condition_type !== 'script') throw new Error(`不支援的成就條件類型：${ach.condition_type}`)
    achScripts = (ach.condition_value?.script_ids ?? []).map(Number)
    const unlocked = await fetchAll<{ user_id: string }>(
      () => supabase.from('user_achievements').select('user_id').eq('achievement_id', f.achievement_id).order('id'),
      '成就解鎖紀錄',
    )
    achUnlocked = new Set(unlocked.map((r) => r.user_id))
  }

  const needPlays = playCountMin !== null || playCountMax !== null || lastAfter !== null ||
    lastBefore !== null || played || notPlayed || categories || branches || achScripts

  if (needPlays) {
    const rows = await fetchAll<{
      user_id: string
      created_at: string
      games: { play_time: string | null; branch_name: string | null; script_id: number | null; scripts: { category: string | null } | null } | null
    }>(
      () => supabase
        .from('game_participants')
        .select('user_id, created_at, games(play_time, branch_name, script_id, scripts(category))')
        .order('id'),
      '遊玩紀錄',
    )

    const lp = (lastPlayed = new Map<string, number>())
    type Stat = { count: number; last: number; scripts: Set<number>; cats: Set<string>; branches: Set<string> }
    const stats = new Map<string, Stat>()
    for (const r of rows) {
      let s = stats.get(r.user_id)
      if (!s) stats.set(r.user_id, (s = { count: 0, last: 0, scripts: new Set(), cats: new Set(), branches: new Set() }))
      s.count++
      const t = Date.parse(r.games?.play_time ?? r.created_at)
      if (t > s.last) s.last = t
      if (r.games?.script_id != null) s.scripts.add(Number(r.games.script_id))
      if (r.games?.branch_name) s.branches.add(r.games.branch_name)
      for (const c of (r.games?.scripts?.category ?? '').split(',')) if (c.trim()) s.cats.add(c.trim())
    }

    ids = ids.filter((id) => {
      const s = stats.get(id)
      const count = s?.count ?? 0
      if (playCountMin !== null && count < playCountMin) return false
      if (playCountMax !== null && count > playCountMax) return false
      if (lastAfter !== null && (!s || s.last < lastAfter)) return false
      if (lastBefore !== null && (!s || s.last > lastBefore)) return false
      if (played) {
        const n = played.filter((x) => s?.scripts.has(x)).length
        if (n < playedMin) return false
        if (playedMax !== null && n > playedMax) return false
      }
      if (notPlayed && notPlayed.some((x) => s?.scripts.has(x))) return false
      if (categories && !categories.some((c) => s?.cats.has(c))) return false
      if (branches && !branches.some((b) => s?.branches.has(b))) return false
      if (achScripts) {
        const claimed = achUnlocked.has(id)
        const miss = achScripts.filter((x) => !s?.scripts.has(x)).length
        if (achMode === 'claimed') { if (!claimed) return false }
        else if (achMode === 'done') { if (!claimed && miss > 0) return false }
        else if (achMode === 'unclaimed') { if (claimed || miss > 0) return false }
        else if (claimed || miss < 1 || miss > achMissingMax) return false
      }
      return true
    })
    for (const id of ids) { const s = stats.get(id); if (s?.last) lp.set(id, s.last) }
    if (achScripts && achMode === 'missing') {
      const m = (missing = new Map<string, number[]>())
      for (const id of ids) m.set(id, achScripts.filter((x) => !stats.get(id)?.scripts.has(x)))
    }
  }

  // 4. 持有未使用票券
  if (f.has_coupon === true) {
    const rows = await fetchAll<{ user_id: string }>(
      () => supabase.from('coupons').select('user_id').eq('status', 'available')
        .or(`expiry_date.is.null,expiry_date.gt.${new Date().toISOString()}`).order('id'),
      '票券',
    )
    const set = new Set(rows.map((r) => r.user_id))
    ids = ids.filter((id) => set.has(id))
  }

  // 5. 排除已買預售票
  if (f.exclude_presale_buyers === true) {
    const rows = await fetchAll<{ user_id: string | null }>(
      () => supabase.from('presale_orders').select('user_id').in('status', ['awaiting_payment', 'reviewing', 'issued'])
        .not('user_id', 'is', null).order('id'),
      '預售訂單',
    )
    const set = new Set(rows.map((r) => r.user_id))
    ids = ids.filter((id) => !set.has(id))
  }

  // 6. 排除最近收過推播（連續兩天推同一個人容易被封鎖）
  const pushedDays = num(f.exclude_pushed_days)
  if (pushedDays !== null && pushedDays >= 1) {
    const todayTw = new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10)
    const since = new Date(Date.parse(`${todayTw}T00:00:00+08:00`) - (pushedDays - 1) * 86400e3).toISOString()
    const rows = await fetchAll<{ user_id: string }>(
      () => supabase.from('push_log_recipients').select('user_id').eq('status', 'sent').gte('created_at', since).order('id'),
      '推播紀錄',
    )
    const set = new Set(rows.map((r) => r.user_id))
    ids = ids.filter((id) => !set.has(id))
  }

  return { ids, lastPlayed, missing }
}

export async function resolveTarget(target: Target): Promise<Resolved> {
  let r: Resolved
  if (target?.mode === 'ids') r = { ids: await resolveIds(target.ids), lastPlayed: null, missing: null }
  else if (target?.mode === 'filter') r = await resolveFilter(target)
  else throw new Error('target.mode 必須是 ids 或 filter')
  const ex = Array.isArray(target.exclude_ids) ? new Set(target.exclude_ids.map(String)) : null
  if (ex?.size) r.ids = r.ids.filter((id) => !ex.has(id))
  return r
}

/** 把成就缺少的劇本 id 轉成「《A》、《B》」 */
export async function missingTextFn(missing: Map<string, number[]> | null) {
  if (!missing) return (_id: string) => ''
  const all = [...new Set([...missing.values()].flat())]
  const { data } = await supabase.from('scripts').select('id, title').in('id', all)
  const map = new Map((data ?? []).map((s) => [Number(s.id), s.title as string]))
  return (id: string) => (missing.get(id) ?? []).map((x) => `《${map.get(x) ?? `#${x}`}》`).join('、')
}

export class PushError extends Error {}

// 圖片／圖文卡片（null = 純文字）
export type Media =
  | { kind: 'image'; image_url: string }
  | { kind: 'card'; image_url: string; aspect?: string; card_title: string; button_label?: string; button_url?: string }
  | null

const HTTPS_URL = /^https:\/\/\S+$/
const BUTTON_URL = /^(https:\/\/|line:\/\/|tel:)\S+$/
const ASPECT = /^\d{1,4}:\d{1,4}$/
const GOLD = '#D4AF37'

/** 整理前端傳來的 media，空的或 kind 不認得就當純文字 */
export function normalizeMedia(raw: unknown): Media {
  // deno-lint-ignore no-explicit-any
  const m = raw as any
  if (!m || (m.kind !== 'image' && m.kind !== 'card')) return null
  const image_url = String(m.image_url ?? '').trim()
  if (m.kind === 'image') return { kind: 'image', image_url }
  const aspect = ASPECT.test(String(m.aspect ?? '')) ? String(m.aspect) : '20:13'
  return {
    kind: 'card', image_url, aspect,
    card_title: String(m.card_title ?? '').trim(),
    button_label: String(m.button_label ?? '').trim() || undefined,
    button_url: String(m.button_url ?? '').trim() || undefined,
  }
}

/** 驗證訊息是否可發（不含對象），不合法就丟 PushError */
export function validateMessage(message: string, target: Target, media: Media = null) {
  if (!message && !media) throw new PushError('訊息不能空白')
  if (message.length > MAX_TEXT) throw new PushError(`訊息最多 ${MAX_TEXT} 字`)
  if (message.includes(MISSING_TAG) && !(target?.mode === 'filter' && target.achievement_id && !['done', 'unclaimed', 'claimed'].includes(target.achievement_mode ?? ''))) {
    throw new PushError(`訊息裡有 ${MISSING_TAG}，但沒有設定「成就差一點」條件`)
  }
  // 圖文卡片可以沒有圖（只有標題、內文、按鈕）；有填就要是 https
  if (media?.kind === 'image' && !HTTPS_URL.test(media.image_url)) throw new PushError('請先上傳圖片')
  if (media?.kind === 'card' && media.image_url && !HTTPS_URL.test(media.image_url)) throw new PushError('圖片網址不正確，請重新上傳')
  if (media?.kind === 'card') {
    if (!media.card_title) throw new PushError('圖文卡片需要標題')
    if (media.card_title.length > 60) throw new PushError('卡片標題最多 60 字')
    if (message.length > 1000) throw new PushError('圖文卡片的內文最多 1000 字')
    if (!!media.button_label !== !!media.button_url) throw new PushError('按鈕文字和連結要一起填')
    if (media.button_label && media.button_label.length > 20) throw new PushError('按鈕文字最多 20 字')
    if (media.button_url && !BUTTON_URL.test(media.button_url)) throw new PushError('按鈕連結要以 https:// 開頭')
  }
}

/** 組出要給 LINE 的 messages（同一次推播，不管幾個泡泡，每人都只算 1 則額度） */
export function buildMessages(text: string, media: Media): unknown[] {
  if (!media) return [{ type: 'text', text: text.slice(0, MAX_TEXT) }]
  if (media.kind === 'image') {
    const img = { type: 'image', originalContentUrl: media.image_url, previewImageUrl: media.image_url }
    return text ? [img, { type: 'text', text: text.slice(0, MAX_TEXT) }] : [img]
  }
  const body: unknown[] = [{ type: 'text', text: media.card_title, weight: 'bold', size: 'lg', color: '#ffffff', wrap: true }]
  if (text) body.push({ type: 'text', text, size: 'sm', color: '#cccccc', wrap: true, margin: 'md' })
  const bubble: Record<string, unknown> = {
    type: 'bubble',
    styles: { body: { backgroundColor: '#111111' }, footer: { backgroundColor: '#111111' } },
    ...(media.image_url ? {
      hero: {
        type: 'image', url: media.image_url, size: 'full', aspectRatio: media.aspect || '20:13', aspectMode: 'cover',
        ...(media.button_url ? { action: { type: 'uri', uri: media.button_url } } : {}),
      },
    } : {}),
    body: { type: 'box', layout: 'vertical', paddingAll: '16px', contents: body },
  }
  if (media.button_label && media.button_url) {
    bubble.footer = {
      type: 'box', layout: 'vertical', paddingAll: '12px',
      contents: [{
        type: 'button', style: 'primary', color: GOLD, height: 'sm',
        action: { type: 'uri', label: media.button_label, uri: media.button_url },
      }],
    }
  }
  const alt = (media.card_title + (text ? `｜${text}` : '')).replace(/\s+/g, ' ').slice(0, 400)
  return [{ type: 'flex', altText: alt, contents: bubble }]
}

// ── 多個對話框 ──
// 一次推播＝第一個對話框（message＋media，舊欄位）＋extra（第 2 個起）。
// LINE 一次最多 5 個訊息物件（「圖片＋文字」算 2 個），不管幾個，每人都只算 1 則額度。
export type Unit = { message: string; media: Media }
export const MAX_LINE_MESSAGES = 5

/** 整理前端傳來的 extra：[{ message, media }]，空的對話框丟掉 */
export function normalizeExtra(raw: unknown): Unit[] {
  if (!Array.isArray(raw)) return []
  return raw.slice(0, MAX_LINE_MESSAGES - 1)
    // deno-lint-ignore no-explicit-any
    .map((u: any) => ({ message: String(u?.message ?? '').trim(), media: normalizeMedia(u?.media) }))
    .filter((u) => u.message || u.media)
}

/** 驗證所有對話框，並確認總數不超過 LINE 上限 */
export function validateUnits(units: Unit[], target: Target) {
  if (!units.length) throw new PushError('訊息不能空白')
  units.forEach((u, i) => {
    try {
      validateMessage(u.message, target, u.media)
    } catch (e) {
      if (e instanceof PushError && units.length > 1) throw new PushError(`第 ${i + 1} 個對話框：${e.message}`)
      throw e
    }
  })
  const n = units.reduce((s, u) => s + buildMessages(u.message, u.media).length, 0)
  if (n > MAX_LINE_MESSAGES) throw new PushError(`一次最多 ${MAX_LINE_MESSAGES} 個對話框（「圖片＋文字」算 2 個），現在是 ${n} 個`)
}

/** 一行摘要（通知、紀錄用） */
export function unitSummary(u: Unit) {
  return u.media?.kind === 'card' ? `［圖文卡片］${u.media.card_title}${u.message ? `\n${u.message}` : ''}`
    : u.media?.kind === 'image' ? `［圖片］${u.message}` : u.message
}

/** 記錄一批收件人（寫入失敗只印 log，不影響發送） */
export async function recordRecipients(
  logId: string, userIds: string[], status: 'sent' | 'failed', personalized: string | null,
) {
  const rows = userIds.map((user_id) => ({ log_id: logId, user_id, status, message: personalized }))
  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
    const { error } = await supabase.from('push_log_recipients').insert(rows.slice(i, i + CHUNK_SIZE))
    if (error) console.error('寫入 push_log_recipients 失敗:', error.message)
  }
}

/** 篩選對象並發送，結果寫入 push_logs 與 push_log_recipients */
export async function sendPush(opts: {
  target: Target
  message: string
  taskName: string
  source: 'custom' | 'scheduled'
  createdByName?: string
  media?: Media
  extra?: unknown
}) {
  const message = (opts.message ?? '').trim()
  const media = normalizeMedia(opts.media)
  const extra = normalizeExtra(opts.extra)
  const units: Unit[] = [{ message, media }, ...extra]
  validateUnits(units, opts.target)

  const { ids, missing } = await resolveTarget(opts.target)
  if (ids.length === 0) throw new PushError('沒有符合條件的會員')

  const quota = await getQuota()
  if (quota.remaining !== null && ids.length > quota.remaining) {
    throw new PushError(`本月剩餘額度 ${quota.remaining} 則，不夠發給 ${ids.length} 人`)
  }

  // 依實際訊息內容分組：有 {缺少劇本} 時，缺同一組劇本的人一起發
  const missingText = await missingTextFn(missing)
  // 每個對話框都會代換
  const groups = new Map<string, { texts: string[]; ids: string[] }>()
  for (const id of ids) {
    const texts = units.map((u) => (u.message.includes(MISSING_TAG) ? u.message.replaceAll(MISSING_TAG, missingText(id)) : u.message))
    const key = JSON.stringify(texts)
    const g = groups.get(key)
    if (g) g.ids.push(id)
    else groups.set(key, { texts, ids: [id] })
  }
  const originalKey = JSON.stringify(units.map((u) => u.message))

  const base = { task_name: opts.taskName, status: 'processing', target_count: ids.length }
  const insertLog = (row: Record<string, unknown>) => supabase.from('push_logs').insert([row]).select().single()
  const full = { ...base, source: opts.source, message, created_by_name: opts.createdByName ?? null }
  let { data: log, error: logErr } = await insertLog({ ...full, media, extra: extra.length ? extra : null })
  // 還沒跑 push_extra.sql（沒有 extra 欄位）時：單一對話框退回舊格式；多個對話框直接報錯，不要只記一半
  if (logErr && !extra.length) ({ data: log, error: logErr } = await insertLog({ ...full, media }))
  if (logErr && !extra.length) ({ data: log, error: logErr } = await insertLog(full))
  if (logErr) ({ data: log, error: logErr } = await insertLog(base))
  if (logErr || !log) throw new Error(`寫入 push_logs 失敗: ${logErr?.message}`)

  let success = 0
  let fail = 0
  const errors: string[] = []
  for (const [key, { texts, ids: groupIds }] of groups) {
    const messages = units.flatMap((u, i) => buildMessages(texts[i], u.media))
    const personalized = key === originalKey ? null : texts.filter(Boolean).join('\n──\n')
    for (let i = 0; i < groupIds.length; i += CHUNK_SIZE) {
      const chunk = groupIds.slice(i, i + CHUNK_SIZE)
      const res = await fetch('https://api.line.me/v2/bot/message/multicast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${LINE_TOKEN}` },
        body: JSON.stringify({ to: chunk, messages }),
      })
      if (res.ok) {
        success += chunk.length
      } else {
        fail += chunk.length
        errors.push(`${chunk.length} 人發送失敗 LINE ${res.status}: ${await res.text()}`)
      }
      await recordRecipients(log.id, chunk, res.ok ? 'sent' : 'failed', personalized)
    }
  }

  await supabase.from('push_logs').update({
    success_count: success,
    fail_count: fail,
    status: fail > 0 ? 'failed' : 'completed',
    error_msg: errors.length ? errors.join(' | ').slice(0, 2000) : null,
    completed_at: new Date().toISOString(),
  }).eq('id', log.id)

  await notifyAdmins({
    source: opts.source,
    taskName: opts.taskName,
    createdByName: opts.createdByName,
    count: ids.length,
    success,
    fail,
    message: units.map(unitSummary).join('\n──\n'),
    error: errors.length ? errors.join(' | ') : null,
  })

  return { count: ids.length, success, fail, errors, logId: log.id as string }
}

/** 測試發送：只發給操作的人自己（不寫推播紀錄，但一樣會用掉 1 則額度）。{缺少劇本} 換成範例文字。 */
export async function sendTest(lineUserId: string, message: string, media: Media, extraRaw: unknown) {
  const units: Unit[] = [{ message: (message ?? '').trim(), media: normalizeMedia(media) }, ...normalizeExtra(extraRaw)]
  // 測試時不需要設定成就條件，用假的 target 讓 {缺少劇本} 通過檢查
  validateUnits(units, { mode: 'filter', achievement_id: 'test' } as Target)
  const sample = '《範例劇本A》、《範例劇本B》'
  const messages = units.flatMap((u) => buildMessages(u.message.replaceAll(MISSING_TAG, sample), u.media))
  const res = await fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${LINE_TOKEN}` },
    body: JSON.stringify({ to: lineUserId, messages }),
  })
  if (!res.ok) throw new PushError(`測試發送失敗（LINE ${res.status}）：${(await res.text()).slice(0, 300)}`)
  return { ok: true, count: messages.length }
}
