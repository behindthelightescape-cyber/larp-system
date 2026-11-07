// ═══════════════════════════════════════════════════════════════════════════
// 團務 app → 群組機器人 的 Webhook 接收端（規格 docs/group-session-api.md §12）
// 收到「提醒時間到」「改時間」「成團」「候補遞補」等事件 → 用燈燈群組小精靈推播到該團的 LINE 群組
//
// 部署：npm run deploy:webhook（和 line-webhook 一起）
// Secrets：TEAM_WEBHOOK_SECRET、TEAM_API_URL、TEAM_API_KEY、LINE_CHANNEL_TOKEN
// 需要先跑 supabase/team_bot.sql（去重用的表）
// ═══════════════════════════════════════════════════════════════════════════
import { teamApi, webhookMessages } from '../_shared/team.ts'

const SECRET = Deno.env.get('TEAM_WEBHOOK_SECRET') || ''
const LINE_CHANNEL_TOKEN = Deno.env.get('LINE_CHANNEL_TOKEN')!
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('')

async function sign(ts: string, body: string) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return hex(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${ts}.${body}`)))
}

// 固定時間比較，避免時間差攻擊
const safeEqual = (a: string, b: string) => {
  if (a.length !== b.length) return false
  let r = 0
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return r === 0
}

// 第一次看到這個 delivery id 回 true；重送的回 false
async function firstTime(id: string, type: string) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/team_webhook_deliveries`, {
    method: 'POST',
    headers: {
      apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json',
      Prefer: 'resolution=ignore-duplicates,return=representation',
    },
    body: JSON.stringify({ id, type }),
  })
  if (!res.ok) { console.error('dedupe insert failed', res.status, await res.text()); return true } // 去重壞掉時寧可重發
  const rows = await res.json()
  return Array.isArray(rows) && rows.length > 0
}

async function forget(id: string) {
  await fetch(`${SUPABASE_URL}/rest/v1/team_webhook_deliveries?id=eq.${encodeURIComponent(id)}`, {
    method: 'DELETE', headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
  })
}

const linePush = (to: string, messages: unknown[]) =>
  fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${LINE_CHANNEL_TOKEN}` },
    body: JSON.stringify({ to, messages }),
  })

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 })
  if (!SECRET) return new Response('webhook secret not set', { status: 503 })

  const body = await req.text()
  const ts = req.headers.get('x-webhook-timestamp') || ''
  const sig = (req.headers.get('x-webhook-signature') || '').replace(/^v1=/, '')
  const deliveryId = req.headers.get('x-webhook-id') || ''

  if (!ts || Math.abs(Date.now() / 1000 - Number(ts)) > 300) return new Response('stale timestamp', { status: 401 })
  if (!safeEqual(sig, await sign(ts, body))) return new Response('bad signature', { status: 401 })

  let ev: Record<string, any>
  try { ev = JSON.parse(body) } catch { return new Response('bad json', { status: 400 }) }
  const id = deliveryId || String(ev.id || '')
  console.log('team-hook', id, ev.type, ev.session?.id, 'via', ev.via)

  if (ev.type === 'ping') return Response.json({ ok: true })

  const messages = webhookMessages(ev)
  if (!messages.length) return Response.json({ ok: true, skipped: true })
  if (id && !(await firstTime(id, String(ev.type)))) return Response.json({ ok: true, duplicate: true })

  const res = await linePush(ev.session.line_group_id, messages)
  if (!res.ok) {
    const t = await res.text()
    console.error('line push failed', res.status, t)
    if (id) await forget(id) // 讓 app 重送時可以再試
    // 4xx（例如機器人已被踢出群組）重送也沒用，回 200 結束；5xx／429 回 502 讓 app 重送
    if (res.status >= 500 || res.status === 429) return new Response('line push failed', { status: 502 })
    return Response.json({ ok: false, line_status: res.status })
  }

  if (ev.type === 'reminder.due' && ev.data?.reminder?.id) {
    await teamApi.reminderSent(ev.session.id, ev.data.reminder.id).catch(e => console.error('reminderSent failed', e))
  }
  return Response.json({ ok: true })
})
