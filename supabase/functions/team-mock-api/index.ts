// deno-lint-ignore-file no-explicit-any
// ═══════════════════════════════════════════════════════════════════════════
// 假的團務 API（照 docs/group-session-api.md 做機器人用得到的部分）
// 用途：真的團務 app（Firebase）還沒好之前，先讓群組機器人在 LINE 上能實際操作、調整流程。
// 真的 API 好了以後：把 TEAM_API_URL 換掉，這支和 team_mock_* 表就可以刪。
//
// 資料：team_mock_sessions（整團一筆 JSON）、team_mock_idem（冪等）
// 劇本：讀劇光燈 scripts 表；價格用 presale_items（有的話），其他先用 DEFAULT_PRICE
// 提醒：pg_cron 每 5 分鐘打 /_tick → 到期就簽章送 webhook 給 team-hook
//
// 部署：npm run deploy:team-mock
// ═══════════════════════════════════════════════════════════════════════════

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const API_KEY = Deno.env.get('TEAM_API_KEY') || ''
const WEBHOOK_SECRET = Deno.env.get('TEAM_WEBHOOK_SECRET') || ''
const HOOK_URL = `${SUPABASE_URL}/functions/v1/team-hook`
const DEFAULT_PRICE = 700

// ── DB ──────────────────────────────────────────────────────────────────────
const H = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' }
const db = async (method: string, path: string, body?: unknown, prefer?: string) => {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method, headers: { ...H, ...(prefer ? { Prefer: prefer } : {}) }, body: body === undefined ? undefined : JSON.stringify(body),
  })
  const t = await res.text()
  if (!res.ok) throw new Error(`db ${method} ${path} ${res.status} ${t}`)
  return t ? JSON.parse(t) : null
}

// ── 小工具 ──────────────────────────────────────────────────────────────────
const err = (status: number, code: string, message: string, details?: any) =>
  Response.json({ error: { code, message, details } }, { status })
const OPEN = ['recruiting', 'confirmed']
const send = (r: any, status = 200) => r instanceof Response ? r : Response.json(r, { status })
const rid = () => crypto.randomUUID().replace(/-/g, '').slice(0, 10)
const TPE = 8 * 3600_000
const toTpeIso = (ms: number) => {
  const d = new Date(ms + TPE)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}T${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:00+08:00`
}
// 台灣時間某天的 hh:mm（dayOffset 相對 iso 那天）
const tpeAt = (iso: string, dayOffset: number, hh: number, mm: number) => {
  const d = new Date(new Date(iso).getTime() + TPE)
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + dayOffset, hh, mm) - TPE
}

// ── 劇本 ────────────────────────────────────────────────────────────────────
let scriptCache: { at: number; list: any[] } | null = null
async function scripts(): Promise<any[]> {
  if (scriptCache && Date.now() - scriptCache.at < 60_000) return scriptCache.list
  const [rows, presale] = await Promise.all([
    db('GET', 'scripts?select=id,title,player_limit,duration,category,cover_url,is_archived&order=id'),
    db('GET', 'presale_items?select=script_name,price,later_price'),
  ])
  const priceOf: Record<string, number> = {}
  for (const p of presale || []) priceOf[p.script_name] = p.later_price ?? p.price
  const list = (rows || []).filter((r: any) => !r.is_archived && r.title).map((r: any) => {
    const text = String(r.player_limit || '')
    const male = +(text.match(/(\d+)\s*男/)?.[1] || 0) || null
    const female = +(text.match(/(\d+)\s*女/)?.[1] || 0) || null
    const total = male || female ? (male || 0) + (female || 0) : +(text.match(/\d+/)?.[0] || 0) || 6
    return {
      id: `scr_${r.id}`, title: r.title, aliases: [],
      category: String(r.category || '').split(',').map((s: string) => s.trim()).filter(Boolean),
      cover_url: r.cover_url || null,
      duration_minutes: r.duration ? r.duration * 60 : 240,
      players: { min: total, max: total, male, female, cross_gender: /可以反串/.test(text), text: text || `${total} 人` },
      price: priceOf[r.title] ?? DEFAULT_PRICE,
      is_active: true,
      external_ids: { larp_system_script_id: r.id },
    }
  })
  scriptCache = { at: Date.now(), list }
  return list
}
const norm = (s: string) => String(s || '').replace(/[\s《》「」『』]/g, '').toLowerCase()
async function searchScripts(q: string) {
  const list = await scripts()
  const n = norm(q)
  const exact = list.filter(s => norm(s.title) === n)
  if (exact.length) return { exact: true, list: exact }
  const starts = list.filter(s => norm(s.title).startsWith(n))
  const has = list.filter(s => norm(s.title).includes(n) && !starts.includes(s))
  return { exact: false, list: [...starts, ...has] }
}

// ── 場次 ────────────────────────────────────────────────────────────────────
const loadByGroup = async (gid: string) =>
  (await db('GET', `team_mock_sessions?line_group_id=eq.${encodeURIComponent(gid)}&status=in.(recruiting,confirmed)&order=created_at.desc&limit=1`))?.[0]?.data || null
const load = async (id: string) => (await db('GET', `team_mock_sessions?id=eq.${encodeURIComponent(id)}`))?.[0]?.data || null

function recompute(s: any) {
  for (const m of s.members) {
    const disc = (m.discounts || []).reduce((a: number, d: any) => a + (d.amount || 0), 0)
    const due = Math.max(0, (s.price_per_person || 0) - disc)
    const mine = s.payments.filter((p: any) => p.member_id === m.id)
    const paid = mine.filter((p: any) => p.status === 'confirmed').reduce((a: number, p: any) => a + (p.kind === 'refund' ? -p.amount : p.amount), 0)
    const pending = mine.some((p: any) => p.status === 'pending')
    const status = due === 0 ? 'waived' : paid >= due ? 'paid' : pending ? 'pending_review' : paid > 0 ? 'partially_paid' : 'unpaid'
    m.payment = { status, amount_due: due, amount_paid: paid, balance: Math.max(0, due - paid) }
  }
  let wp = 0
  for (const m of s.members) m.waitlist_position = m.status === 'waitlist' ? ++wp : null
  const j = s.members.filter((m: any) => m.status === 'joined')
  s.counts = {
    joined: j.length, waitlist: wp,
    paid: j.filter((m: any) => m.payment.status === 'paid' || m.payment.status === 'waived').length,
    partially_paid: j.filter((m: any) => m.payment.status === 'partially_paid').length,
    unpaid: j.filter((m: any) => ['unpaid', 'pending_review'].includes(m.payment.status)).length,
    amount_due: j.reduce((a: number, m: any) => a + m.payment.amount_due, 0),
    amount_paid: j.reduce((a: number, m: any) => a + m.payment.amount_paid, 0),
  }
  s.updated_at = new Date().toISOString()
}

function schedule(s: any) {
  const start = new Date(s.start_at).getTime()
  const old: Record<string, any> = Object.fromEntries((s.reminders || []).map((r: any) => [r.kind, r]))
  const mk = (kind: string, at: number) => ({ id: old[kind]?.id || `rem_${rid()}`, kind, at: toTpeIso(at), sent_at: null, delivered_at: null })
  s.reminders = [mk('day_before', tpeAt(s.start_at, -1, 20, 0)), mk('hours_before', start - 3 * 3600_000)]
  s.end_at = toTpeIso(start + (s.script.duration_minutes || 240) * 60_000)
  s.payment_deadline = toTpeIso(tpeAt(s.start_at, -1, 23, 59))
}

const view = (s: any, withMembers = true) => {
  const { payments: _p, ...rest } = s
  if (!withMembers) delete (rest as any).members
  return rest
}

async function insert(s: any) {
  await db('POST', 'team_mock_sessions', { id: s.id, line_group_id: s.line_group_id, status: s.status, data: s, version: s.version })
}
// 讀 → 改 → 用 version 寫回；有人同時改就重來（避免兩人同時 +1 互蓋）
async function mutate(id: string, fn: (s: any) => Response | any): Promise<Response | any> {
  for (let i = 0; i < 6; i++) {
    const row = (await db('GET', `team_mock_sessions?id=eq.${encodeURIComponent(id)}`))?.[0]
    if (!row) return err(404, 'SESSION_NOT_FOUND', '找不到這團')
    const s = row.data
    const out = fn(s)
    if (out instanceof Response) return out
    recompute(s)
    s.version = row.version + 1
    const saved = await db('PATCH', `team_mock_sessions?id=eq.${encodeURIComponent(id)}&version=eq.${row.version}`,
      { data: s, status: s.status, version: s.version, updated_at: new Date().toISOString() }, 'return=representation')
    if (saved?.length) return typeof out === 'function' ? out(s) : out
    await new Promise(r => setTimeout(r, 50 + Math.random() * 150))
  }
  return err(503, 'UNAVAILABLE', '太多人同時操作，請再試一次')
}

// ── Webhook（提醒）───────────────────────────────────────────────────────────
const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('')
async function sendWebhook(payload: any) {
  const body = JSON.stringify(payload)
  const ts = String(Math.floor(Date.now() / 1000))
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(WEBHOOK_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = hex(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${ts}.${body}`)))
  const res = await fetch(HOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Webhook-Id': payload.id, 'X-Webhook-Timestamp': ts, 'X-Webhook-Signature': `v1=${sig}` },
    body,
  })
  console.log('webhook', payload.type, payload.session?.id, res.status, (await res.text()).slice(0, 200))
  return res.ok
}

const unpaidOf = (s: any) => s.members.filter((m: any) => m.status === 'joined' && m.payment?.balance > 0)
  .map((m: any) => ({ member_id: m.id, display_name: m.nickname || m.display_name, line_user_id: m.line_user_id, balance: m.payment.balance }))

async function tick(force?: string) {
  const rows = await db('GET', 'team_mock_sessions?status=in.(recruiting,confirmed)&select=id,data')
  const now = Date.now()
  const done: string[] = []
  for (const row of rows || []) {
    const s = row.data
    // 開場 6 小時後自動結束
    if (new Date(s.start_at).getTime() + 6 * 3600_000 < now) {
      await mutate(s.id, (x: any) => { x.status = 'completed' })
      done.push(`${s.id} auto-complete`)
      continue
    }
    const due = (s.reminders || []).filter((r: any) => !r.delivered_at && (force === s.id ? r.kind === 'hours_before' : new Date(r.at).getTime() <= now))
    // 太晚開的團：時間已過的提醒只送最後一個
    for (const r of due.slice(-1)) {
      const ok = await sendWebhook({
        id: `dlv_${r.id}_${force === s.id ? rid() : 'auto'}`, type: 'reminder.due', created_at: new Date().toISOString(),
        session: view(s, false), data: { reminder: { id: r.id, kind: r.kind }, unpaid_members: unpaidOf(s) },
        actor: { type: 'system', id: 'scheduler', name: '排程' }, via: 'scheduler',
      })
      if (ok) done.push(`${s.id} ${r.kind}`)
    }
    if (due.length && force !== s.id) {
      await mutate(s.id, (x: any) => { for (const r of x.reminders) if (due.some((d: any) => d.id === r.id)) r.delivered_at = new Date().toISOString() })
    }
  }
  return done
}

// ── 路由 ────────────────────────────────────────────────────────────────────
async function route(req: Request, path: string, url: URL): Promise<Response> {
  const method = req.method
  const body = method === 'GET' || method === 'DELETE' ? null : await req.json().catch(() => ({}))
  const actor = {
    type: req.headers.get('x-actor-type') || 'system',
    id: req.headers.get('x-actor-id') || '',
    name: decodeURIComponent(req.headers.get('x-actor-name') || ''),
  }
  if (method !== 'GET' && !actor.id) return err(400, 'ACTOR_REQUIRED', '缺少操作者')
  let m: RegExpMatchArray | null

  // 冪等
  const ikey = req.headers.get('idempotency-key')
  const idemId = ikey && method === 'POST' ? `${ikey}|${path}` : null
  if (idemId) {
    const hit = (await db('GET', `team_mock_idem?key=eq.${encodeURIComponent(idemId)}`))?.[0]
    if (hit) return Response.json(hit.body, { status: hit.status })
  }
  const done = async (b: any, status = 200) => {
    if (idemId) await db('POST', 'team_mock_idem', { key: idemId, status, body: b }, 'resolution=ignore-duplicates')
    return Response.json(b, { status })
  }

  if (path === '/scripts/search' && method === 'GET') {
    const r = await searchScripts(url.searchParams.get('q') || '')
    const limit = +(url.searchParams.get('limit') || 5)
    return Response.json({ data: r.list.slice(0, limit).map(s => ({ script: s, score: r.exact ? 1 : 0.5 })), exact: r.exact })
  }
  if (path === '/scripts' && method === 'GET') return Response.json({ data: await scripts(), next_cursor: null })

  if ((m = path.match(/^\/line-groups\/([^/]+)\/active-session$/)) && method === 'GET') {
    const s = await loadByGroup(decodeURIComponent(m[1]))
    return s ? Response.json(view(s)) : err(404, 'SESSION_NOT_FOUND', '這個群組沒有進行中的團')
  }

  if (path === '/sessions' && method === 'POST') {
    let sc: any
    if (body.script_id) sc = (await scripts()).find(s => s.id === body.script_id)
    else {
      const r = await searchScripts(body.script_query || '')
      if (!r.exact && r.list.length > 1) {
        return err(409, 'SCRIPT_AMBIGUOUS', `「${body.script_query}」對到 ${r.list.length} 本劇本`,
          { candidates: r.list.slice(0, 13).map(c => ({ id: c.id, title: c.title, players: { text: c.players.text } })) })
      }
      sc = r.list[0]
    }
    if (!sc) return err(404, 'SCRIPT_NOT_FOUND', `找不到劇本「${body.script_query || body.script_id}」`)
    if (!body.start_at || isNaN(new Date(body.start_at).getTime())) return err(400, 'VALIDATION_FAILED', '時間格式不對')
    if (new Date(body.start_at).getTime() < Date.now()) return err(422, 'TIME_IN_PAST', '這個時間已經過了')
    if (await loadByGroup(body.line_group_id)) return err(409, 'GROUP_HAS_ACTIVE_SESSION', '這個群組已經有進行中的團了，要先「結團」或「取消團」才能再揪')
    const id = `ses_${rid()}`
    const d = new Date(new Date(body.start_at).getTime() + TPE)
    const s: any = {
      id, code: `G${String(d.getUTCFullYear()).slice(2)}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}-${id.slice(-3)}`,
      status: 'recruiting', script_id: sc.id, script: { title: sc.title, duration_minutes: sc.duration_minutes },
      start_at: toTpeIso(new Date(body.start_at).getTime()),
      capacity: body.capacity ?? sc.players.max, min_players: Math.min(sc.players.min, body.capacity ?? sc.players.max),
      price_per_person: body.price_per_person ?? sc.price, deposit: null, waitlist_enabled: true,
      venue: null, organizer: null, line_group_id: body.line_group_id, title: null, note: body.note ?? null,
      members: [], payments: [], is_test: true, extra: {}, version: 1, created_at: new Date().toISOString(),
    }
    schedule(s)
    if (body.organizer_joins !== false && body.organizer) {
      const mid = `mem_${rid()}`
      s.members.push({ id: mid, line_user_id: body.organizer.line_user_id, display_name: body.organizer.display_name, role: 'organizer', status: 'joined', discounts: [], note: null, joined_at: new Date().toISOString() })
      s.organizer = { member_id: mid, ...body.organizer }
    }
    recompute(s)
    await insert(s)
    return done(view(s), 201)
  }

  if (!(m = path.match(/^\/sessions\/([^/]+)(\/.*)?$/))) return err(404, 'NOT_FOUND', `沒有這個 API：${method} ${path}`)
  const sid = decodeURIComponent(m[1])
  const sub = m[2] || ''
  const isOrg = (s: any) => s.members.some((x: any) => x.line_user_id === actor.id && (x.role === 'organizer' || x.role === 'gm') && x.status === 'joined')
  const closedErr = () => err(409, 'SESSION_CLOSED', '這團已經結束或取消了')
  const closed = (s: any) => !OPEN.includes(s.status)

  if (sub === '' && method === 'GET') { const s = await load(sid); return s ? Response.json(view(s)) : err(404, 'SESSION_NOT_FOUND', '找不到這團') }

  if (sub === '' && method === 'PATCH') {
    return send(await mutate(sid, (s: any) => {
      if (closed(s)) return closedErr()
      if (!isOrg(s)) return err(403, 'NOT_ORGANIZER', '只有團主可以修改這團')
      if (body.start_at && new Date(body.start_at).getTime() < Date.now()) return err(422, 'TIME_IN_PAST', '這個時間已經過了')
      for (const k of ['start_at', 'capacity', 'min_players', 'price_per_person', 'note', 'title', 'waitlist_enabled', 'extra']) if (k in body) s[k] = body[k]
      if (body.start_at) { s.start_at = toTpeIso(new Date(body.start_at).getTime()); schedule(s) }
      return (x: any) => view(x)
    }))
  }

  if ((m = sub.match(/^\/(confirm|unconfirm|cancel|complete)$/)) && method === 'POST') {
    const act = m[1]
    const r = await mutate(sid, (s: any) => {
      if (closed(s)) return closedErr()
      if (!isOrg(s)) return err(403, 'NOT_ORGANIZER', '只有團主可以這樣做')
      if (act === 'confirm' && s.status === 'confirmed') return err(409, 'INVALID_TRANSITION', '這團已經成團了')
      if (act === 'unconfirm' && s.status !== 'confirmed') return err(409, 'INVALID_TRANSITION', '這團還沒成團')
      s.status = { confirm: 'confirmed', unconfirm: 'recruiting', cancel: 'cancelled', complete: 'completed' }[act]
      if (body?.reason) s.extra = { ...s.extra, [`${act}_reason`]: body.reason }
      return (x: any) => ({
        session: view(x, false),
        refund_summary: act === 'cancel' ? x.members.filter((y: any) => y.payment?.amount_paid > 0)
          .map((y: any) => ({ member_id: y.id, display_name: y.nickname || y.display_name, amount_paid: y.payment.amount_paid, refund: y.payment.amount_paid })) : undefined,
        warnings: act === 'confirm' && x.counts.joined < x.min_players ? [`人數還不到 ${x.min_players} 人（目前 ${x.counts.joined}）`] : [],
      })
    })
    return r instanceof Response ? r : done(r)
  }

  if (sub === '/members' && method === 'POST') {
    const r = await mutate(sid, (s: any) => {
      if (closed(s)) return closedErr()
      let mem = body.line_user_id ? s.members.find((x: any) => x.line_user_id === body.line_user_id) : null
      let created = false
      const full = s.members.filter((x: any) => x.status === 'joined').length >= s.capacity
      if (full && !s.waitlist_enabled && !(mem && OPEN.includes(mem.status))) return err(409, 'SESSION_FULL', '這團已經滿了')
      if (mem && (mem.status === 'joined' || mem.status === 'waitlist')) { /* 已在名單 */ }
      else if (mem) { mem.status = full ? 'waitlist' : 'joined'; mem.left_at = null; mem.joined_at = new Date().toISOString(); created = true }
      else {
        mem = {
          id: `mem_${rid()}`, line_user_id: body.line_user_id ?? null, display_name: body.display_name || '（未命名）',
          role: body.role || 'player', guest_of: body.guest_of ?? null, gender: body.gender ?? null,
          status: full ? 'waitlist' : 'joined', discounts: [], note: body.note ?? null, joined_at: new Date().toISOString(),
        }
        s.members.push(mem); created = true
      }
      // 等候補的順序照報名時間：把剛加入候補的人移到最後
      if (created && mem.status === 'waitlist') { s.members = s.members.filter((x: any) => x !== mem); s.members.push(mem) }
      const id = mem.id
      return (x: any) => ({ created, member: x.members.find((y: any) => y.id === id), session: view(x, false) })
    })
    return r instanceof Response ? r : done(r, r.created ? 201 : 200)
  }

  if ((m = sub.match(/^\/members\/(by-line\/)?([^/]+)(\/.*)?$/))) {
    const byLine = !!m[1]
    const ident = decodeURIComponent(m[2])
    const rest = m[3] || ''
    const pick = (s: any) => s.members.find((x: any) =>
      (byLine ? x.line_user_id === ident : x.id === ident) && (x.status === 'joined' || x.status === 'waitlist'))
    const selfOf = (s: any, mem: any) => mem.line_user_id === actor.id ||
      (mem.guest_of && s.members.find((x: any) => x.id === mem.guest_of)?.line_user_id === actor.id)

    if (rest === '' && method === 'DELETE') {
      return send(await mutate(sid, (s: any) => {
        if (closed(s)) return closedErr()
        const mem = pick(s)
        if (!mem) return err(404, 'MEMBER_NOT_FOUND', '這個人不在名單裡')
        const self = selfOf(s, mem)
        if (!self && !isOrg(s)) return err(403, 'NOT_ORGANIZER', '只有團主可以移除別人')
        if (mem.role === 'organizer') return err(409, 'INVALID_TRANSITION', '團主不能退出，要先換團主或「取消團」')
        const wasJoined = mem.status === 'joined'
        mem.status = self ? 'left' : 'removed'
        mem.left_at = new Date().toISOString()
        let promotedId: string | null = null
        if (wasJoined) {
          const p = s.members.find((x: any) => x.status === 'waitlist')
          if (p) { p.status = 'joined'; promotedId = p.id }
        }
        const id = mem.id
        return (x: any) => ({ member: x.members.find((y: any) => y.id === id), promoted: promotedId ? x.members.find((y: any) => y.id === promotedId) : null, session: view(x, false) })
      }))
    }

    if (rest === '' && method === 'PATCH') {
      const r = await mutate(sid, (s: any) => {
        const mem = pick(s)
        if (!mem) return err(404, 'MEMBER_NOT_FOUND', '這個人不在名單裡，請先 +1')
        if (!selfOf(s, mem) && !isOrg(s)) return err(403, 'NOT_ORGANIZER', '只有團主可以改別人的資料')
        for (const k of ['note', 'nickname', 'gender', 'character', 'extra']) if (k in body) mem[k] = body[k]
        if ('role' in body && isOrg(s) && body.role !== 'organizer') mem.role = body.role
        const id = mem.id
        return (x: any) => x.members.find((y: any) => y.id === id)
      })
      return r instanceof Response ? r : Response.json(r)
    }

    if (rest === '/payments' && method === 'POST') {
      const r = await mutate(sid, (s: any) => {
        const mem = pick(s)
        if (!mem) return err(404, 'MEMBER_NOT_FOUND', '這個人不在名單裡，請先 +1')
        const pending = body.status === 'pending'
        if (pending && !selfOf(s, mem)) return err(403, 'FORBIDDEN', '只能回報自己的匯款')
        if (!pending && !isOrg(s)) return err(403, 'NOT_ORGANIZER', '只有團主可以記錄繳費')
        const amount = body.amount ?? mem.payment?.balance ?? 0
        if (!amount) return () => ({ payment: null, member: mem, warnings: ['已經繳清了'] })
        // 團主記「繳清」時，把這個人待確認的回報一起轉成確認，不重複算
        if (!pending) for (const p of s.payments) if (p.member_id === mem.id && p.status === 'pending') p.status = 'void'
        const pay = {
          id: `pay_${rid()}`, session_id: s.id, member_id: mem.id, kind: body.kind || 'payment', amount,
          method: body.method || 'other', status: pending ? 'pending' : 'confirmed', remit_last5: body.remit_last5 ?? null,
          paid_at: body.paid_at || new Date().toISOString(), recorded_by: actor, confirmed_by: pending ? null : actor,
          note: body.note ?? null, created_at: new Date().toISOString(),
        }
        s.payments.push(pay)
        const id = mem.id
        return (x: any) => ({ payment: pay, member: x.members.find((y: any) => y.id === id) })
      })
      return r instanceof Response ? r : done(r, r.payment ? 201 : 200)
    }

    if (rest === '/discounts' && method === 'POST') {
      const r = await mutate(sid, (s: any) => {
        const mem = pick(s)
        if (!mem) return err(404, 'MEMBER_NOT_FOUND', '這個人不在名單裡，請先 +1')
        if (!selfOf(s, mem) && !isOrg(s)) return err(403, 'NOT_ORGANIZER', '只有團主可以幫別人用券')
        const already = (mem.discounts || []).reduce((a: number, d: any) => a + d.amount, 0)
        const amount = body.amount ?? Math.max(0, s.price_per_person - already)
        if (!amount) return err(409, 'VALIDATION_FAILED', '這個人已經不用付錢了')
        mem.discounts = [...(mem.discounts || []), { id: `dis_${rid()}`, type: body.type || 'manual', label: body.label || '折抵', amount, ref: body.ref ?? null, note: body.note ?? null }]
        const id = mem.id
        return (x: any) => ({ member: x.members.find((y: any) => y.id === id) })
      })
      return r instanceof Response ? r : done(r, 201)
    }
  }

  if (sub === '/payment-summary' && method === 'GET') {
    const s = await load(sid)
    if (!s) return err(404, 'SESSION_NOT_FOUND', '找不到這團')
    const un = unpaidOf(s)
    return Response.json({
      amount_due: s.counts.amount_due, amount_paid: s.counts.amount_paid,
      balance: un.reduce((a: number, x: any) => a + x.balance, 0), unpaid_members: un,
    })
  }

  if ((m = sub.match(/^\/reminders\/([^/]+)\/sent$/)) && method === 'POST') {
    const rId = m[1]
    const r = await mutate(sid, (s: any) => {
      const rem = (s.reminders || []).find((x: any) => x.id === rId)
      if (rem) { rem.sent_at = body?.sent_at || new Date().toISOString(); rem.delivered_at ||= rem.sent_at }
      return () => ({ ok: true })
    })
    return r instanceof Response ? r : Response.json(r)
  }

  return err(404, 'NOT_FOUND', `假 API 還沒做：${method} ${path}`)
}

Deno.serve(async (req) => {
  const url = new URL(req.url)
  const path = url.pathname.replace(/^.*?\/team-mock-api/, '').replace(/^\/api\/v1/, '') || '/'

  if (path === '/health') return Response.json({ ok: true, version: 'mock-1', mock: true })
  // 排程：不用金鑰（只會送已到期的提醒）；?force=<session_id> 立刻送一次提醒（測試用，要金鑰）
  if (path === '/_tick') {
    const force = url.searchParams.get('force') || undefined
    if (force && req.headers.get('authorization') !== `Bearer ${API_KEY}`) return err(401, 'UNAUTHENTICATED', '金鑰錯誤')
    if (!WEBHOOK_SECRET) return err(503, 'UNAVAILABLE', 'TEAM_WEBHOOK_SECRET 沒設')
    return Response.json({ ok: true, sent: await tick(force) })
  }

  if (!API_KEY || req.headers.get('authorization') !== `Bearer ${API_KEY}`) return err(401, 'UNAUTHENTICATED', '金鑰錯誤')
  try {
    return await route(req, path, url)
  } catch (e) {
    console.error('mock api error', e)
    return err(500, 'INTERNAL', '假 API 出錯了：' + String((e as Error).message || e).slice(0, 200))
  }
})
