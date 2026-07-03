import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    })
  }

  try {
    const { imageData, fileName } = await req.json()
    if (!imageData || !fileName) {
      return new Response(JSON.stringify({ error: '缺少參數' }), { status: 400 })
    }

    // base64 → Uint8Array
    const base64 = imageData.replace(/^data:image\/\w+;base64,/, '')
    const binary = atob(base64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

    const { error: uploadErr } = await supabase.storage
      .from('exports')
      .upload(fileName, bytes, { contentType: 'image/png', upsert: true })

    if (uploadErr) throw uploadErr

    const { data } = supabase.storage.from('exports').getPublicUrl(fileName)

    return new Response(JSON.stringify({ publicUrl: data.publicUrl }), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    })
  }
})
