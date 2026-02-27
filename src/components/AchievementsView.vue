<script setup>
import { ref, computed, onMounted } from 'vue'
import { supabase } from '../supabase'
import { useUserStore } from '../stores/user'

const store = useUserStore()
const isLoaded = ref(false)
const achievements = ref([])
const userUnlockedIds = ref([]) // 裝玩家已經解鎖的成就 ID
const unlockedDates = ref({})   // 裝解鎖時間

// 🚀 啟動時抓取資料
onMounted(async () => {
  if (!store.userData) return
  
  try {
    // 1. 抓取世界上所有的成就規則
    const { data: allAch } = await supabase.from('achievements').select('*').order('created_at', { ascending: false })
    
    // 2. 抓取這個玩家「已經解鎖」的紀錄
    const { data: myAch } = await supabase
      .from('user_achievements')
      .select('achievement_id, unlocked_at')
      .eq('user_id', store.userData.id)

    if (allAch) achievements.value = allAch
    if (myAch) {
      userUnlockedIds.value = myAch.map(a => a.achievement_id)
      myAch.forEach(a => {
        unlockedDates.value[a.achievement_id] = new Date(a.unlocked_at).toLocaleDateString('zh-TW')
      })
    }
  } catch (error) {
    console.error('成就載入失敗:', error)
  } finally {
    isLoaded.value = true
  }
})

// 🚀 計算屬性：幫成就分類並加上狀態
const displayAchievements = computed(() => {
  return achievements.value.map(ach => {
    const isUnlocked = userUnlockedIds.value.includes(ach.id)
    const isEnded = ach.status === 'ended'
    
    return {
      ...ach,
      isUnlocked,
      // 如果還沒解鎖，而且已經絕版了，那就是錯過了 (Missed)
      isMissed: !isUnlocked && isEnded,
      unlockedDate: isUnlocked ? unlockedDates.value[ach.id] : null
    }
  })
})

const totalAch = computed(() => achievements.value.length)
const unlockedCount = computed(() => userUnlockedIds.value.length)
const progressPercent = computed(() => totalAch.value === 0 ? 0 : Math.round((unlockedCount.value / totalAch.value) * 100))

</script>

<template>
  <div class="page-container">
    <div class="content-layer" :class="{ 'enter-active': isLoaded }">
      
      <div class="header-section fade-in-down">
        <h1 class="page-title">榮耀成就館</h1>
        <p class="page-subtitle">探索未知，銘刻你的專屬傳奇</p>
        
        <div class="progress-box">
          <div class="progress-info">
            <span>收集進度</span>
            <span class="gold-text">{{ unlockedCount }} / {{ totalAch }} ({{ progressPercent }}%)</span>
          </div>
          <div class="progress-bar-bg">
            <div class="progress-bar-fill" :style="{ width: progressPercent + '%' }"></div>
          </div>
        </div>
      </div>

      <div class="achievements-list fade-in-up delay-1">
        <div v-if="!isLoaded" class="loading-state"><div class="spinner"></div></div>
        
        <div v-else-if="displayAchievements.length === 0" class="empty-state">
          館長正在準備全新的挑戰，敬請期待...
        </div>

        <div 
          v-for="ach in displayAchievements" 
          :key="ach.id" 
          class="ach-card"
          :class="{ 'is-unlocked': ach.isUnlocked, 'is-missed': ach.isMissed }"
        >
          <div v-if="ach.isMissed" class="missed-stamp">已絕版</div>
          
          <div class="ach-icon-box">
            <div class="icon">{{ ach.icon_url || '🏆' }}</div>
            <div v-if="ach.isUnlocked" class="unlocked-check">✔️</div>
          </div>
          
          <div class="ach-content">
            <h3 class="ach-title">{{ ach.title }}</h3>
            <p class="ach-desc">{{ ach.description }}</p>
            
            <div class="ach-footer">
              <div class="reward-tag">
                <span v-if="ach.reward_type === 'exp'" class="tag-exp">✨ +{{ ach.reward_exp }} EXP</span>
                <span v-else-if="ach.reward_type === 'coupon'" class="tag-coupon">🎟️ 專屬折價券</span>
                <span v-else class="tag-none">🎖️ 專屬稱號</span>
              </div>
              
              <div class="status-text">
                <span v-if="ach.isUnlocked" class="text-gold">解鎖於 {{ ach.unlockedDate }}</span>
                <span v-else-if="ach.isMissed" class="text-gray">錯過的遺憾</span>
                <span v-else class="text-lock">🔒 尚未達成</span>
              </div>
            </div>
          </div>
        </div>
      </div>

    </div>
  </div>
</template>

<style scoped>
/* === 頁面基礎與動畫 (延續你的高質感黑金風) === */
.page-container { width: 100%; max-width: 800px; margin: 0 auto; min-height: 100vh; padding-bottom: 80px; color: #fff; background: transparent; }
.content-layer { padding: 30px 20px; }
.fade-in-down { opacity: 0; transform: translateY(-20px); transition: all 0.8s ease; }
.fade-in-up { opacity: 0; transform: translateY(30px); transition: all 0.8s cubic-bezier(0.2, 0.8, 0.2, 1); }
.enter-active .fade-in-down, .enter-active .fade-in-up { opacity: 1; transform: translateY(0); }
.delay-1 { transition-delay: 0.2s; }

/* === 頂部區域 === */
.header-section { text-align: center; margin-bottom: 30px; }
.page-title { font-size: 2.2rem; font-weight: 900; color: #D4AF37; margin: 0 0 5px 0; text-shadow: 0 0 15px rgba(212,175,55,0.4); letter-spacing: 2px;}
.page-subtitle { color: #888; font-size: 0.95rem; margin-bottom: 25px; }

/* === 進度條 === */
.progress-box { background: rgba(20,20,20,0.8); border: 1px solid #333; padding: 15px 20px; border-radius: 12px; backdrop-filter: blur(10px); }
.progress-info { display: flex; justify-content: space-between; font-size: 0.9rem; font-weight: bold; margin-bottom: 10px; color: #aaa; }
.gold-text { color: #D4AF37; }
.progress-bar-bg { width: 100%; height: 8px; background: #222; border-radius: 4px; overflow: hidden; }
.progress-bar-fill { height: 100%; background: linear-gradient(90deg, #D4AF37, #f1c40f); border-radius: 4px; transition: width 1s cubic-bezier(0.2, 0.8, 0.2, 1); box-shadow: 0 0 10px rgba(212,175,55,0.5); }

/* === 成就卡片列表 === */
.achievements-list { display: flex; flex-direction: column; gap: 15px; }
.ach-card { display: flex; gap: 15px; background: rgba(26,26,26,0.9); border: 1px solid #333; padding: 18px; border-radius: 16px; position: relative; overflow: hidden; transition: 0.3s; }
.ach-card::before { content: ''; position: absolute; left: 0; top: 0; bottom: 0; width: 4px; background: #444; }

/* ✨ 解鎖狀態的卡片：發出金色光芒 */
.ach-card.is-unlocked { background: linear-gradient(145deg, rgba(30,26,10,0.95), rgba(20,20,20,0.95)); border-color: rgba(212,175,55,0.4); box-shadow: 0 5px 15px rgba(0,0,0,0.5); }
.ach-card.is-unlocked::before { background: #D4AF37; box-shadow: 0 0 10px #D4AF37; }

/* ☠️ 絕版未解鎖狀態：黑白灰階 */
.ach-card.is-missed { opacity: 0.6; filter: grayscale(100%); }
.missed-stamp { position: absolute; right: 10px; top: 10px; border: 2px solid #888; color: #888; padding: 2px 8px; font-size: 0.7rem; font-weight: bold; transform: rotate(15deg); border-radius: 4px; }

/* 圖示區 */
.ach-icon-box { position: relative; width: 65px; height: 65px; background: #111; border: 1px solid #333; border-radius: 12px; display: flex; justify-content: center; align-items: center; flex-shrink: 0; font-size: 2.2rem; }
.ach-card.is-unlocked .ach-icon-box { border-color: #D4AF37; background: rgba(212,175,55,0.1); }
.unlocked-check { position: absolute; bottom: -5px; right: -5px; background: #2ecc71; color: #000; font-size: 0.7rem; width: 20px; height: 20px; display: flex; justify-content: center; align-items: center; border-radius: 50%; border: 2px solid #1a1a1a; font-weight: bold; }

/* 文字內容區 */
.ach-content { flex: 1; display: flex; flex-direction: column; justify-content: center; }
.ach-title { margin: 0 0 5px 0; font-size: 1.15rem; color: #eee; }
.ach-card.is-unlocked .ach-title { color: #D4AF37; font-weight: bold; }
.ach-desc { margin: 0 0 12px 0; font-size: 0.85rem; color: #aaa; line-height: 1.4; }

/* 底部獎勵與狀態 */
.ach-footer { display: flex; justify-content: space-between; align-items: flex-end; }
.reward-tag span { font-size: 0.75rem; font-weight: bold; padding: 3px 8px; border-radius: 6px; }
.tag-exp { background: rgba(52, 152, 219, 0.15); color: #3498db; border: 1px solid rgba(52, 152, 219, 0.3); }
.tag-coupon { background: rgba(230, 126, 34, 0.15); color: #e67e22; border: 1px solid rgba(230, 126, 34, 0.3); }
.tag-none { background: rgba(255, 255, 255, 0.1); color: #ccc; border: 1px solid #555; }

.status-text { font-size: 0.8rem; font-weight: bold; }
.text-gold { color: #D4AF37; }
.text-lock { color: #666; }
.text-gray { color: #555; text-decoration: line-through; }

.spinner { width: 40px; height: 40px; border: 4px solid rgba(212, 175, 55, 0.2); border-top-color: #D4AF37; border-radius: 50%; animation: spin 1s linear infinite; margin: 50px auto; }
@keyframes spin { to { transform: rotate(360deg); } }
.empty-state { text-align: center; color: #666; padding: 40px 20px; border: 1px dashed #333; border-radius: 12px; }
</style>