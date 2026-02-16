import { createClient } from '@supabase/supabase-js'
import fs from 'fs'

// ⚠️ 請填入你的 Supabase 網址與 Key
// 注意：這裡必須用 Service Role Key (因為要寫入資料)，去 Supabase > Settings > API 找 secret 那把
const supabaseUrl = 'https://cqbiozfappfwfcahtxfm.supabase.co' 
const supabaseKey = 'sb_publishable_usai8S5HF6AGB61bCsrRJQ_R7HjUFUV' 

const supabase = createClient(supabaseUrl, supabaseKey)

const rawData = JSON.parse(fs.readFileSync('mock_data.json', 'utf-8'))

async function runImport() {
  console.log('🚀 開始模擬匯入舊資料...')

  for (const [userId, userData] of Object.entries(rawData)) {
    const p = userData.profile
    console.log(`處理會員: ${p.displayName} (${userId})`)

    // 1. 建立會員 (Users)
    const { error: uErr } = await supabase.from('users').upsert({
      id: userId,
      display_name: p.displayName,
      legacy_id: p.serialNumber,
      level: parseInt(p.level.match(/\d+/)?.[0] || 1), // 抓出 LV 後面的數字
      total_exp: p.points, // 先暫時用舊積分當作經驗值
      created_at: new Date(p.createdAt).toISOString()
    })
    if (uErr) console.error('❌ User Error:', uErr)

    // 2. 建立劇本與紀錄 (Records)
    if (userData.records) {
      for (const rec of userData.records) {
        // 先確保劇本存在 (如果沒有就自動建)
        let { data: script } = await supabase.from('scripts').select('id').eq('title', rec.name).single()
        
        if (!script) {
          const { data: newScript } = await supabase.from('scripts').insert({ title: rec.name }).select().single()
          script = newScript
        }

        // 寫入遊玩紀錄
        const { data: game } = await supabase.from('games').insert({
          script_id: script.id,
          gm_name: rec.host,
          play_time: new Date(rec.playTime).toISOString(),
          is_finished: true
        }).select().single()

        await supabase.from('game_participants').insert({
          game_id: game.id,
          user_id: userId,
          exp_gained: rec.point || 100
        })
      }
    }

    // 3. 建立優惠券 (Coupons)
    if (userData.coupons) {
      const coupons = userData.coupons.map(c => ({
        user_id: userId,
        title: c.name,
        description: c.description,
        status: c.redeemedAt ? 'used' : (c.expireAt && new Date(c.expireAt) < new Date() ? 'expired' : 'available'),
        expiry_date: c.expireAt ? new Date(c.expireAt).toISOString() : null,
        used_at: c.redeemedAt ? new Date(c.redeemedAt).toISOString() : null,
        created_at: new Date(c.createdAt).toISOString()
      }))
      await supabase.from('coupons').insert(coupons)
    }
  }
  console.log('✅ 資料匯入完成！')
}

runImport()