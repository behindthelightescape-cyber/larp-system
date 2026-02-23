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
  if (!confirm(`🚀 準備將 ${usersArray.length} 名玩家、稱號與歷程完整轉生？`)) return

  isImporting.value = true
  importLog.value = '🛸 傳送陣啟動中...'

  try {
    // 0. 抓出目前所有的劇本對照表
    const { data: allScripts } = await supabase.from('scripts').select('id, title')
    const scriptMap = {}
    allScripts.forEach(s => { scriptMap[s.title] = s.id })

    // ==========================================
    // 1. 搬移玩家主資料
    // ==========================================
    importLog.value = '1/5 正在重建玩家檔案...'
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
    // 2. 搬移成就 / 稱號系統
    // ==========================================
    importLog.value = '2/5 正在還原榮譽稱號...'
    const uniqueAchievements = {}
    const userAchievementsToInsert = []

    usersArray.forEach(u => {
      u.achievements?.forEach(a => {
        if (!uniqueAchievements[a.name]) {
          uniqueAchievements[a.name] = { id: a.name, title: a.name, reward_exp: a.bonusPoint || 0 }
        }
        userAchievementsToInsert.push({
          user_id: u.scopedUserId,
          achievement_id: a.name,
          unlocked_at: new Date(a.createdAt.replace(/-/g, '/')).toISOString()
        })
      })
    })

    const achievementsToInsert = Object.values(uniqueAchievements)
    if (achievementsToInsert.length > 0) {
      await supabase.from('achievements').upsert(achievementsToInsert)
    }
    if (userAchievementsToInsert.length > 0) {
      for (let i = 0; i < userAchievementsToInsert.length; i += 2000) {
        await supabase.from('user_achievements').insert(userAchievementsToInsert.slice(i, i + 2000))
      }
    }

    // ==========================================
    // 3. 搬移優惠券 (全狀態保留)
    // ==========================================
    importLog.value = '3/5 正在還原票券時間軸...'
    const couponsToInsert = []
    const now = new Date()
    
    usersArray.forEach(u => {
      u.coupons?.forEach(c => {
        let currentStatus = 'available'
        if (c.redeemedAt) {
          currentStatus = 'used'
        } else if (c.expireAt && new Date(c.expireAt.replace(/-/g, '/')) < now) {
          currentStatus = 'expired'
        }
        couponsToInsert.push({
          user_id: u.scopedUserId,
          title: c.name,
          description: c.description || '舊系統票券',
          created_at: c.createdAt ? new Date(c.createdAt.replace(/-/g, '/')).toISOString() : new Date().toISOString(),
          expiry_date: c.expireAt ? new Date(c.expireAt.replace(/-/g, '/')).toISOString() : null,
          used_at: c.redeemedAt ? new Date(c.redeemedAt.replace(/-/g, '/')).toISOString() : null,
          status: currentStatus,
          coupon_type: 'discount'
        })
      })
    })

    if (couponsToInsert.length > 0) {
      for (let i = 0; i < couponsToInsert.length; i += 2000) {
        await supabase.from('coupons').insert(couponsToInsert.slice(i, i + 2000))
      }
    }

    // ==========================================
    // 4. 完美搬移遊玩歷程 (原汁原味，不加任何前綴)
    // ==========================================
    importLog.value = '4/5 正在精準對齊歷史戰績...'
    const gamesToInsert = []
    const participantsToInsert = []
    
    usersArray.forEach(u => {
      u.records?.forEach(rec => {
        const gameId = crypto.randomUUID() 
        const scriptId = scriptMap[rec.name] || null
        
        gamesToInsert.push({
          id: gameId,
          script_id: scriptId,
          gm_name: rec.host || '無 GM',
          play_time: new Date(rec.playTime.replace(/-/g, '/')).toISOString(),
          status: 'finished',
          is_finished: true,
          story_memory: rec.name // 🚀 直接存原本的劇本名字
        })

        participantsToInsert.push({
          game_id: gameId,
          user_id: u.scopedUserId,
          exp_gained: rec.point || 0,
          character_name: rec.name, // 🚀 直接存原本的劇本名字
          comment: `地點: ${rec.branchName || '無'}`,
          created_at: new Date(rec.createdAt.replace(/-/g, '/')).toISOString()
        })
      })
    })

    for (let i = 0; i < gamesToInsert.length; i += 2000) {
      await supabase.from('games').insert(gamesToInsert.slice(i, i + 2000))
    }
    for (let i = 0; i < participantsToInsert.length; i += 2000) {
      await supabase.from('game_participants').insert(participantsToInsert.slice(i, i + 2000))
    }

    // ==========================================
    // 5. 完工慶祝
    // ==========================================
    importLog.value = `🎊 完美轉生！玩家、稱號、票券、歷程已全數無損歸位！`
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
    <h3 style="color: #D4AF37;">🚢 劇光燈 2.0：終極諾亞方舟</h3>
    <p style="color: #888;">全自動對齊劇本庫、完美還原榮譽稱號與時空票券。</p>
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