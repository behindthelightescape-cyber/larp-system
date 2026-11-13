// ═══════════════════════════════════════════════════════════════════════════
// 燈燈記群組成員 → 自動寫進公車管家的團員名單（省去妘兒手動 key 名字）
//
//   有人加入群組／在群組說話／按燈燈的按鈕 → line_group_members 記一筆（LINE 名稱、頭貼）
//   這個群組在公車管家找得到那團（一鍵成團後）→ 還沒寫過的人加進團員名單
//     ・同名的團員（妘兒先手動或截圖匯入的）→ 只補 LINE 帳號，不重複加
//     ・導遊（bus_editors）不加；取消、已結帳、已結束的團不加
//     ・退出群組只記在這裡，不會幫忙下車（下車牽涉退款，留給妘兒在 App 處理）
//   還沒成團時，同一群組 10 分鐘最多去公車管家找一次團
//   打「名單」→ 同步並列出燈燈認得的車友；沒在上面的按「我也在車上」
//
//   限制：燈燈進群前就在、而且一直沒說話的人抓不到（LINE 要認證帳號才能拿完整成員名單）
// ═══════════════════════════════════════════════════════════════════════════

import { appQuery, looksLikeBus, parseGroupName } from './bus.ts'
import { busAppReady, findAppGroup, addLineMembers, type AddResult } from './busapp.ts'

const env = (k: string) => Deno.env.get(k) || ''
const SUPABASE_URL = env('SUPABASE_URL')
const SERVICE_KEY = env('SUPABASE_SERVICE_ROLE_KEY')
const LINE_TOKEN = env('LINE_CHANNEL_TOKEN')
const RETRY_MS = 10 * 60_000

const dbHeaders = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' }
const dbGet = async (path: string) => (await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: dbHeaders })).json()
const dbPatch = (table: string, filter: string, payload: Record<string, unknown>) =>
  fetch(`${SUPABASE_URL}/rest/v1/${table}?${filter}`, { method: 'PATCH', headers: { ...dbHeaders, Prefer: 'return=minimal' }, body: JSON.stringify(payload) })
const dbUpsert = (table: string, payload: Record<string, unknown>) =>
  fetch(`${SUPABASE_URL}/rest/v1/${table}`, { method: 'POST', headers: { ...dbHeaders, Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(payload) })
const eq = (v: string) => `eq.${encodeURIComponent(v)}`

// LINE 群組成員的名稱、頭貼（不用認證帳號也能查單一成員）
async function lineProfile(groupId: string, userId: string): Promise<{ name: string; picture: string } | null> {
  const res = await fetch(`https://api.line.me/v2/bot/group/${groupId}/member/${userId}`, { headers: { Authorization: `Bearer ${LINE_TOKEN}` } })
  if (!res.ok) { console.warn('member profile', res.status); return null }
  const j = await res.json()
  return { name: String(j.displayName || '').trim(), picture: j.pictureUrl || '' }
}

// 導遊（bus_editors 會員編號）的 LINE userId：不加進團員名單
async function editorIds(): Promise<Set<string>> {
  const s = await dbGet('group_settings?key=eq.bus_editors&select=value&limit=1')
  const ids = String(s?.[0]?.value || '').split(/[,，\s]+/).map((x: string) => x.replace(/^#/, '').trim()).filter(Boolean)
  if (!ids.length) return new Set()
  const u = await dbGet(`users?legacy_id=in.(${ids.map(encodeURIComponent).join(',')})&select=id`)
  return new Set((Array.isArray(u) ? u : []).map((x: { id: string }) => x.id))
}

// ── 每個群組事件都呼叫：記人，必要時同步 ─────────────────────────────────────
// deno-lint-ignore no-explicit-any
export async function trackMembers(event: any): Promise<void> {
  const src = event.source || {}
  if (src.type !== 'group' || !src.groupId) return
  const groupId: string = src.groupId
  const now = new Date().toISOString()

  if (event.type === 'memberLeft') {
    for (const m of event.left?.members || []) {
      if (m.userId) await dbPatch('line_group_members', `group_id=${eq(groupId)}&line_user_id=${eq(m.userId)}`, { left_at: now })
    }
    return
  }

  if (event.type === 'postback' && String(event.postback?.data || '').startsWith('roster|')) return // rosterJoin 自己處理
  const joined = event.type === 'memberJoined'
  const userIds: string[] = joined
    ? (event.joined?.members || []).map((m: { userId?: string }) => m.userId).filter(Boolean)
    : (['message', 'postback'].includes(event.type) && src.userId ? [src.userId] : [])
  if (!userIds.length) return

  // 只記「公車群組」：名稱看得出是一車、綁過公車表、或已經對到公車管家的團；一般群組不記
  const grp = (await dbGet(`line_groups?group_id=${eq(groupId)}&select=group_name,sheet_row,sheet_code,app_group_id,app_sync_tried_at&limit=1`))?.[0]
  if (!grp || !(grp.app_group_id || grp.sheet_code || looksLikeBus(parseGroupName(grp.group_name || '')))) return

  let needSync = joined
  for (const uid of userIds) {
    const old = (await dbGet(`line_group_members?group_id=${eq(groupId)}&line_user_id=${eq(uid)}&select=display_name,last_seen_at,left_at,app_member_id&limit=1`))?.[0]
    const stale = !old || !old.display_name || old.left_at || joined || Date.now() - new Date(old.last_seen_at).getTime() > 10 * 60_000
    if (stale) {
      const p = (!old?.display_name || joined || old?.left_at) ? await lineProfile(groupId, uid) : null
      await dbUpsert('line_group_members', {
        group_id: groupId, line_user_id: uid, last_seen_at: now, left_at: null,
        ...(p?.name ? { display_name: p.name, picture_url: p.picture || null } : {}),
        ...(joined ? { joined_at: now } : {}),
      })
    }
    if (!old?.app_member_id) needSync = true
  }
  if (!needSync || !busAppReady()) return

  // 還沒對到團：10 分鐘最多找一次（新成員加入時不等）
  if (!grp.app_group_id && !joined && grp.app_sync_tried_at && Date.now() - new Date(grp.app_sync_tried_at).getTime() < RETRY_MS) return
  try { await syncGroup(groupId, grp) } catch (e) { console.error('busmembers sync:', e) }
}

type SyncResult = { ok: true; title: string; res: AddResult; known: number } | { ok: false; reason: string }

// deno-lint-ignore no-explicit-any
async function syncGroup(groupId: string, grp: any): Promise<SyncResult> {
  const gf = `group_id=${eq(groupId)}`
  await dbPatch('line_groups', gf, { app_sync_tried_at: new Date().toISOString() })

  let appId: string = grp.app_group_id || ''
  let title = ''
  if (!appId) {
    const q = appQuery(grp)
    if (!q) return { ok: false, reason: 'name' }
    const found = await findAppGroup({ script: q.script, date: q.date, time: q.time || undefined })
    if (!found.hit) return { ok: false, reason: found.many?.length ? 'many' : 'notfound' }
    appId = found.hit.id
    title = `《${found.hit.title}》${found.hit.date || ''}`
    await dbPatch('line_groups', gf, { app_group_id: appId })
  }

  const [rows, editors] = await Promise.all([
    dbGet(`line_group_members?${gf}&left_at=is.null&select=line_user_id,display_name,app_member_id`),
    editorIds(),
  ])
  const list = (Array.isArray(rows) ? rows : []).filter((r: { line_user_id: string }) => !editors.has(r.line_user_id))
  const people = list
    .filter((r: { display_name?: string; app_member_id?: string }) => r.display_name && !r.app_member_id)
    .map((r: { line_user_id: string; display_name: string }) => ({ lineUserId: r.line_user_id, name: r.display_name }))

  let res: AddResult = { added: [], linked: [], already: [], ids: {} }
  if (people.length) {
    try {
      res = await addLineMembers(appId, people)
    } catch (e) {
      // 那團在 App 裡被刪了 → 忘掉，下次重找
      if (/（404）/.test(String(e))) { await dbPatch('line_groups', gf, { app_group_id: null }); return { ok: false, reason: 'notfound' } }
      throw e
    }
    const at = new Date().toISOString()
    for (const [uid, mid] of Object.entries(res.ids)) {
      await dbPatch('line_group_members', `${gf}&line_user_id=${eq(uid)}`, { app_member_id: mid, app_synced_at: at })
    }
    console.log('busmembers', appId, 'added', res.added.length, 'linked', res.linked.length, res.skipped || '')
  }
  return { ok: true, title, res, known: list.length }
}

// ── 「名單」：大家都能看燈燈認得誰；沒在上面的按按鈕上車 ─────────────────────
//   順便同步到公車管家（已成團才會寫）；名單只列名字，不顯示付款狀態
const GOLD = '#D4AF37'
// deno-lint-ignore no-explicit-any
async function rosterFlex(groupId: string, note = ''): Promise<any> {
  const grp = (await dbGet(`line_groups?group_id=${eq(groupId)}&select=group_name,sheet_row,app_group_id,app_sync_tried_at&limit=1`))?.[0]
  let r: SyncResult | null = null
  if (grp && busAppReady()) {
    try { r = await syncGroup(groupId, grp) } catch (e) { console.error('名單 sync:', e) }
  }
  const [rows, editors] = await Promise.all([
    dbGet(`line_group_members?group_id=${eq(groupId)}&left_at=is.null&display_name=not.is.null&select=line_user_id,display_name,app_member_id,first_seen_at&order=first_seen_at.asc`),
    editorIds(),
  ])
  const list = (Array.isArray(rows) ? rows : []).filter((x: { line_user_id: string }) => !editors.has(x.line_user_id))
  const inApp = !!(r?.ok && !r.res.skipped)
  const status = r?.ok
    ? (r.res.skipped ? `公車管家：${r.res.skipped}，名單不再更新` : '✅ 已同步到公車管家')
    : '⏳ 還沒成團，成團後燈燈會自動把大家加進名單'
  const names = list.map((x: { display_name: string; app_member_id?: string }, i: number) => ({
    type: 'text', size: 'sm', wrap: true, color: '#dddddd', margin: 'sm',
    text: `${i + 1}. ${x.display_name}${inApp && !x.app_member_id ? '（下次同步）' : ''}`,
  }))
  return {
    type: 'flex', altText: `🚌 車友名單（${list.length} 位）`,
    contents: {
      type: 'bubble', size: 'kilo',
      body: {
        type: 'box', layout: 'vertical', backgroundColor: '#0d0d0d', paddingAll: '16px', spacing: 'none',
        contents: [
          ...(note ? [{ type: 'text', text: note, color: '#ffffff', weight: 'bold', size: 'sm', wrap: true, margin: 'none' }, { type: 'separator', color: '#262626', margin: 'md' }] : []),
          { type: 'text', text: `🚌 車友名單（${list.length} 位）`, color: GOLD, weight: 'bold', size: 'md', margin: note ? 'md' : 'none' },
          { type: 'text', text: status, color: '#888888', size: 'xxs', wrap: true, margin: 'xs' },
          ...(names.length ? names : [{ type: 'text', text: '燈燈還不認得任何車友', color: '#888888', size: 'sm', margin: 'md' }]),
          { type: 'text', text: '名單上沒有你？點下面按鈕上車 👇', color: '#bbbbbb', size: 'xs', wrap: true, margin: 'lg' },
        ],
      },
      footer: {
        type: 'box', layout: 'vertical', backgroundColor: '#080808', paddingAll: '12px',
        contents: [{
          type: 'button', style: 'primary', color: GOLD, height: 'sm',
          action: { type: 'postback', label: '我也在車上 🙋', data: 'roster|join', displayText: '我也在車上 🙋' },
        }],
      },
    },
  }
}

// 打「名單」
// deno-lint-ignore no-explicit-any
export async function rosterCommand(groupId: string): Promise<any> {
  return await rosterFlex(groupId)
}

// 按「我也在車上」：記下這個人、同步，回最新名單
// deno-lint-ignore no-explicit-any
export async function rosterJoin(groupId: string, userId: string): Promise<any> {
  if ((await editorIds()).has(userId)) return { type: 'text', text: '導遊不用上名單唷～😆' }
  const p = await lineProfile(groupId, userId)
  if (!p?.name) return { type: 'text', text: '😢 燈燈讀不到你的 LINE 名稱，等一下再試試看' }
  await dbUpsert('line_group_members', {
    group_id: groupId, line_user_id: userId, display_name: p.name, picture_url: p.picture || null,
    last_seen_at: new Date().toISOString(), left_at: null,
  })
  return await rosterFlex(groupId, `✅ ${p.name} 上車囉！`)
}
