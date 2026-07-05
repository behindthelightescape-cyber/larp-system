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

    // GET：讀取私人資料
    if (req.method === 'GET') {
      const { data, error } = await supabase
        .from('users')
        .select('phone, email, birthday')
        .eq('id', userId)
        .single()
      if (error) throw error
      return new Response(JSON.stringify(data), {
        headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    // POST：更新個人資料
    if (req.method === 'POST') {
      const { name, phone, birthday, email } = await req.json()

      if (!phone || phone.length < 8) throw new Error('請填寫有效的手機號碼')
      if (!email) throw new Error('請填寫電子郵件')
      if (name && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(name)) throw new Error('暱稱不能是 Email 格式')

      const isFirstProfile = !!(birthday)
      const { data: before } = await supabase
        .from('users')
        .select('birthday, birthday_claimed_year')
        .eq('id', userId)
        .single()

      const { data, error } = await supabase
        .from('users')
        .update({
          display_name: name,
          phone,
          birthday: birthday || null,
          email: email || null,
        })
        .eq('id', userId)
        .select()
        .single()
      if (error) throw error

      const firstTimeProfile = birthday && !before?.birthday

      return new Response(JSON.stringify({ ...data, firstTimeProfile }), {
        headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    throw new Error('不支援的方法')
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }
})
