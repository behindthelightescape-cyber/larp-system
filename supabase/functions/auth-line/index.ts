import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

const verifyLineToken = async (token: string) => {
  const res = await fetch('https://api.line.me/v2/profile', {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error('LINE token 驗證失敗，請重新登入')
  return await res.json() as { userId: string; displayName: string; pictureUrl: string }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })

  try {
    const auth = req.headers.get('Authorization') ?? ''
    if (!auth.startsWith('Bearer ')) throw new Error('缺少 Authorization header')
    const lineToken = auth.slice(7)

    const lineProfile = await verifyLineToken(lineToken)
    const { userId: lineUserId, displayName, pictureUrl } = lineProfile

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const fakeEmail = `line_${lineUserId}@line.invalid`

    // 找或建立 auth.users 帳號
    const { error: createErr } = await supabase.auth.admin.createUser({
      email: fakeEmail,
      email_confirm: true,
      user_metadata: {
        line_user_id: lineUserId,
        display_name: displayName,
        picture_url: pictureUrl,
      },
    })

    if (createErr) {
      if (!createErr.message.toLowerCase().includes('already')) throw createErr

      // 帳號已存在 — 舊帳號可能沒有 line_user_id，找到後補寫 metadata
      const searchRes = await fetch(
        `${SUPABASE_URL}/auth/v1/admin/users?filter=${encodeURIComponent(lineUserId)}&per_page=5`,
        { headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` } }
      )
      if (searchRes.ok) {
        const { users: found = [] } = await searchRes.json() as { users?: Array<{ id: string; email: string; user_metadata?: Record<string, string> }> }
        const existing = found.find(u => u.email === fakeEmail)
        if (existing && !existing.user_metadata?.line_user_id) {
          await supabase.auth.admin.updateUserById(existing.id, {
            user_metadata: { line_user_id: lineUserId, display_name: displayName, picture_url: pictureUrl },
          })
        }
      }
    }

    // 產生 magic link，取出 hashed_token 給前端呼叫 verifyOtp
    const { data: linkData, error: linkErr } = await supabase.auth.admin.generateLink({
      type: 'magiclink',
      email: fakeEmail,
    })
    if (linkErr) throw linkErr

    const token_hash = linkData.properties.hashed_token

    return new Response(
      JSON.stringify({ token_hash, email: fakeEmail }),
      { headers: { ...CORS, 'Content-Type': 'application/json' } },
    )
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }
})
