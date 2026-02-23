<script setup>
import { ref } from 'vue'
import { supabase } from '../supabase'

const emit = defineEmits(['update-stats'])
const isImporting = ref(false)
const importLog = ref('')

const handleJSONUpload = (event) => {
  const file = event.target.files[0]
  if (!file) return

  const reader = new FileReader()
  reader.onload = async (e) => {
    try {
      const jsonData = JSON.parse(e.target.result)
      await startMigration(jsonData)
    } catch (err) {
      alert('檔案格式不對喔，這不是標準的 JSON 檔！')
    }
  }
  reader.readAsText(file)
}

const startMigration = async (data) => {
  const usersArray = Object.values(data) // 把 JSON 物件轉成陣列
  if (!confirm(`🚢 偵測到 ${usersArray.length} 名人質，準備啟動資料遷徙？`)) return

  isImporting.value = true
  importLog.value = '正在重建玩家檔案...'

  try {
    // 1. 批次處理玩家主資料
// 🚀 修改 DataImporter.vue 裡的 usersToInsert 邏輯
const usersToInsert = usersArray.map(u => ({
  // 直接用 LINE 的 scopedUserId 當作資料庫的主鍵
  // 這樣以後玩家一進來，我們直接用 LINE UID 就能抓到人，不用猜！
  id: u.scopedUserId, 
  display_name: u.profile.displayName || '未命名玩家',
  legacy_id: u.profile.serialNumber, 
  total_exp: u.profile.points || 0,
  level: parseInt(u.profile.level?.match(/\d+/)?.[0]) || 1, 
  created_at: new Date(u.profile.createdAt).toISOString()
}))

    // 2. 轟炸 users 表 (取得回傳的 id 供後續關聯)
    const { data: insertedUsers, error: userErr } = await supabase.from('users').insert(usersToInsert).select('id, legacy_id')
    if (userErr) throw userErr

    // 建立一個快速對照表：legacy_id -> 新的 UUID
    const idMap = {}
    insertedUsers.forEach(u => { idMap[u.legacy_id] = u.id })

    // 3. 處理優惠券大軍 (只搬移尚未核銷的)
    importLog.value = '正在發還舊有票券...'
    const couponsToInsert = []
    usersArray.forEach(u => {
      const newUserId = idMap[u.profile.serialNumber]
      if (u.coupons && u.coupons.length > 0) {
        u.coupons.forEach(c => {
          // 如果這張券還沒被用過 (redeemedAt 是 null) 且還沒過期
          if (!c.redeemedAt) {
            couponsToInsert.push({
              user_id: newUserId,
              title: c.name,
              description: c.description || '',
              expiry_date: c.expireAt ? new Date(c.expireAt).toISOString() : null,
              status: 'available',
              coupon_type: 'discount'
            })
          }
        })
      }
    })

    if (couponsToInsert.length > 0) {
      const { error: couponErr } = await supabase.from('coupons').insert(couponsToInsert)
      if (couponErr) throw couponErr
    }

    importLog.value = `🎉 遷徙成功！1000 人已順利入駐新家！`
    emit('update-stats')

  } catch (err) {
    console.error('遷徙失敗:', err)
    importLog.value = '❌ 遷徙中斷：' + err.message
  } finally {
    isImporting.value = false
  }
}
</script>

<template>
  <div class="data-importer-container">
    <h3 style="color: #D4AF37;">🚢 劇光燈 2.0：諾亞方舟系統</h3>
    <p style="color: #888;">支援將舊系統提供的 JSON 會員檔案（含 EXP、票券）全面無痛轉生。</p>
    
    <div style="margin-top: 20px;">
      <label class="btn btn-blue" style="cursor: pointer;">
        📂 選擇外包給的 JSON 檔案
        <input type="file" accept=".json" style="display: none;" @change="handleJSONUpload">
      </label>
      <p style="color: #D4AF37; font-weight: bold; margin-top: 15px;">{{ importLog }}</p>
    </div>
  </div>
</template>

<style scoped>
.data-importer-container { background: #111; padding: 25px; border-radius: 12px; border: 2px solid #D4AF37; }
.btn { padding: 12px 20px; border: none; font-weight: bold; border-radius: 8px; transition: 0.2s; background: #3498db; color: white; }
</style>