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
      alert('解析失敗，請確認檔案格式')
    }
  }
  reader.readAsText(file)
}

const startMigration = async (data) => {
  const usersArray = Object.values(data)
  if (!confirm(`🚀 準備將 ${usersArray.length} 名玩家、票券與「所有歷程」完整轉生？`)) return

  isImporting.value = true
  importLog.value = '🛸 傳送陣啟動中...'

  try {
    // ==========================================
    // 1. 建立「虛擬場次」來收容所有舊歷程 (這招最神，不用對齊劇本庫)
    // ==========================================
    importLog.value = '1/4 建立舊紀錄專用虛擬場次...'
    const { data: virtualGame, error: vError } = await supabase.from('games').insert([{
      gm_name: '系統轉生',
      status: 'finished',
      is_finished: true,
      story_memory: '舊系統歷史紀錄集散地'
    }]).select().single()
    
    if (vError) throw vError

    // ==========================================
    // 2. 搬移玩家主資料
    // ==========================================
    importLog.value = '2/4 正在重建玩家檔案...'
    const usersToInsert = usersArray.map(u => ({
      id: u.scopedUserId,
      display_name: u.profile.displayName || '無名氏',
      legacy_id: u.profile.serialNumber,
      total_exp: u.profile.points || 0,
      level: parseInt(u.profile.level?.match(/\d+/)?.[0]) || 1,
      created_at: new Date(u.profile.createdAt.replace(/-/g, '/')).toISOString()
    }))

    const { error: userErr } = await supabase.from('users').upsert(usersToInsert)
    if (userErr) throw userErr

    // ==========================================
    // 3. 搬移優惠券 (全狀態保留)
    // ==========================================
    importLog.value = '3/4 正在還原票券時間軸...'
    const couponsToInsert = []
    const now = new Date()
    
    usersArray.forEach(u => {
      if (u.coupons && u.coupons.length > 0) {
        u.coupons.forEach(c => {
          let currentStatus = 'available'
          if (c.redeemedAt) {
            currentStatus = 'used'
          } else if (c.expireAt && new Date(c.expireAt.replace(/-/g, '/')) < now) {
            currentStatus = 'expired'
          }

          couponsToInsert.push({
            user_id: u.scopedUserId,
            title: c.name,
            description: c.description || '舊系統轉生票券',
            created_at: c.createdAt ? new Date(c.createdAt.replace(/-/g, '/')).toISOString() : new Date().toISOString(),
            expiry_date: c.expireAt ? new Date(c.expireAt.replace(/-/g, '/')).toISOString() : null,
            used_at: c.redeemedAt ? new Date(c.redeemedAt.replace(/-/g, '/')).toISOString() : null,
            status: currentStatus,
            coupon_type: 'discount'
          })
        })
      }
    })

    if (couponsToInsert.length > 0) {
      const chunkSize = 2000
      for (let i = 0; i < couponsToInsert.length; i += chunkSize) {
        const chunk = couponsToInsert.slice(i, i + chunkSize)
        const { error: couponErr } = await supabase.from('coupons').insert(chunk)
        if (couponErr) throw couponErr
      }
    }

    // ==========================================
    // 4. 搬移遊玩歷程 (無視新系統有沒有這本劇本，強制寫入！)
    // ==========================================
    importLog.value = '4/4 正在封印歷史戰績...'
    const participantsToInsert = []
    
    usersArray.forEach(u => {
      if (u.records && u.records.length > 0) {
        u.records.forEach(rec => {
          participantsToInsert.push({
            game_id: virtualGame.id, // 🎯 全部掛在這個虛擬大廳下面
            user_id: u.scopedUserId,
            exp_gained: rec.point || 0,
            // 🎯 絕招：把劇本名稱和 GM 塞進這裡，無視 scripts 表有沒有建檔！
            character_name: `[舊紀錄] ${rec.name}`, 
            comment: `GM: ${rec.host || '無'} | 地點: ${rec.branchName || '無'}`,
            created_at: new Date(rec.playTime.replace(/-/g, '/')).toISOString()
          })
        })
      }
    })

    if (participantsToInsert.length > 0) {
      const chunkSize = 2000 // 分批塞入，避免資料庫超載
      for (let i = 0; i < participantsToInsert.length; i += chunkSize) {
        const chunk = participantsToInsert.slice(i, i + chunkSize)
        const { error: pErr } = await supabase.from('game_participants').insert(chunk)
        if (pErr) throw pErr
      }
    }

    // ==========================================
    // 5. 完工慶祝
    // ==========================================
    importLog.value = `🎊 完美轉生！${usersArray.length} 名玩家、${couponsToInsert.length} 張票券、${participantsToInsert.length} 筆歷程已全數就位！`
    emit('update-stats')

  } catch (err) {
    console.error('遷徙失敗:', err)
    importLog.value = '❌ 轉生失敗：' + err.message
  } finally {
    isImporting.value = false
  }
}
</script>

<template>
  <div class="data-importer-container">
    <h3 style="color: #D4AF37;">🚢 劇光燈 2.0：諾亞方舟系統</h3>
    <p style="color: #888;">支援將舊系統提供的 JSON 會員檔案（含 EXP、票券、全歷程無損）全面無痛轉生。</p>
    
    <div style="margin-top: 20px;">
      <label class="btn btn-blue" style="cursor: pointer; display: inline-block;">
        📂 選擇外包給的 JSON 檔案
        <input type="file" accept=".json" style="display: none;" @change="handleJSONUpload">
      </label>
      <div v-if="isImporting" class="spinner-small" style="display: inline-block; margin-left: 15px; vertical-align: middle;"></div>
      <p style="color: #D4AF37; font-weight: bold; margin-top: 15px; background: #222; padding: 10px; border-radius: 6px;">
        {{ importLog }}
      </p>
    </div>
  </div>
</template>

<style scoped>
.data-importer-container { background: #111; padding: 25px; border-radius: 12px; border: 2px solid #D4AF37; }
.btn { padding: 12px 20px; border: none; font-weight: bold; border-radius: 8px; transition: 0.2s; background: #3498db; color: white; }
.btn:hover { background: #2980b9; }
.spinner-small { width: 20px; height: 20px; border: 2px solid rgba(212, 175, 55, 0.2); border-top-color: #D4AF37; border-radius: 50%; animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
</style>