import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

const verifyLineToken = async (token: string): Promise<string> => {
  const res = await fetch('https://api.line.me/v2/profile', {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error('LINE token 驗證失敗，請重新登入')
  const profile = await res.json()
  return profile.userId
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })

  try {
    const auth = req.headers.get('Authorization') ?? ''
    if (!auth.startsWith('Bearer ')) throw new Error('缺少 Authorization')
    const lineToken = auth.slice(7)

    const userId = await verifyLineToken(lineToken)
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

    // GET：讀取私人資料（從 users_private）
    if (req.method === 'GET') {
      const { data, error } = await supabase
        .from('users_private')
        .select('phone, email, birthday')
        .eq('user_id', userId)
        .single()
      // PGRST116 = 還沒填資料的新用戶，視為全 null
      if (error && error.code !== 'PGRST116') throw error
      return new Response(
        JSON.stringify(data ?? { phone: null, email: null, birthday: null }),
        { headers: { ...CORS, 'Content-Type': 'application/json' } },
      )
    }

    // POST：更新個人資料
    if (req.method === 'POST') {
      const { name, phone, birthday, email } = await req.json()

      if (!phone || phone.length < 8) throw new Error('請填寫有效的手機號碼')
      if (!email) throw new Error('請填寫電子郵件')
      if (name && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(name)) throw new Error('暱稱不能是 Email 格式')

      // 查舊的 birthday（判斷是否第一次填）
      const { data: beforePrivate } = await supabase
        .from('users_private')
        .select('birthday')
        .eq('user_id', userId)
        .single()

      // 更新 display_name（在 users table）
      const { data: publicData, error: userError } = await supabase
        .from('users')
        .update({ display_name: name })
        .eq('id', userId)
        .select()
        .single()
      if (userError) throw userError

      // 更新 phone / email / birthday（在 users_private table）
      const { error: privateError } = await supabase
        .from('users_private')
        .upsert({ user_id: userId, phone, email: email || null, birthday: birthday || null })
      if (privateError) throw privateError

      const firstTimeProfile = !!(birthday && !beforePrivate?.birthday)

      return new Response(
        JSON.stringify({
          ...publicData,
          phone,
          email: email || null,
          birthday: birthday || null,
          firstTimeProfile,
        }),
        { headers: { ...CORS, 'Content-Type': 'application/json' } },
      )
    }

    throw new Error('不支援的方法')
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }
})
