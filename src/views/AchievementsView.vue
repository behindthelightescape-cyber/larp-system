<script setup>
import { ref, computed, onMounted } from 'vue'
import { supabase } from '../supabase'
import { useUserStore } from '../stores/user'

const store = useUserStore()
const isLoaded = ref(false)
const achievements = ref([])
const scriptsList = ref([]) 
const userUnlockedIds = ref([]) 
const unlockedDates = ref({})   

// 🚀 新增：裝載玩家真實玩過的劇本 ID 與標籤
const playedScriptsData = ref([])

const showDetailModal = ref(false)
const selectedAch = ref(null)

onMounted(async () => {
  if (!store.userData) return
  
  try {
    // 1. 一次抓下四大天王：成就、玩家解鎖紀錄、全店劇本庫、以及【玩家的遊玩歷史】
    const [achRes, userAchRes, scriptRes, historyRes] = await Promise.all([
      supabase.from('achievements').select('*').order('created_at', { ascending: false }),
      supabase.from('user_achievements').select('achievement_id, unlocked_at').eq('user_id', store.userData.id),
      supabase.from('scripts').select('id, title'),
      // 🚀 精準抓取他玩過的所有劇本 ID 與標籤
      supabase.from('game_participants').select(`
        games ( script_id, scripts ( tags ) )
      `).eq('user_id', store.userData.id)
    ])

    if (achRes.data) achievements.value = achRes.data
    if (scriptRes.data) scriptsList.value = scriptRes.data

    if (userAchRes.data) {
      userUnlockedIds.value = userAchRes.data.map(a => a.achievement_id)
      userAchRes.data.forEach(a => {
        unlockedDates.value[a.achievement_id] = new Date(a.unlocked_at).toLocaleDateString('zh-TW')
      })
    }

    // 🚀 解析遊玩歷史，建立進度比對資料庫
    if (historyRes.data) {
      playedScriptsData.value = historyRes.data.map(h => ({
        script_id: h.games?.script_id,
        tags: h.games?.scripts?.tags || ''
      })).filter(s => s.script_id) // 過濾掉空資料
    }

  } catch (error) {
    console.error('成就載入失敗:', error)
  } finally {
    isLoaded.value = true
  }
})

// 🚀 計算核心：幫每個成就計算目前的「進度 (Progress)」
const displayAchievements = computed(() => {
  return achievements.value.map(ach => {
    const isUnlocked = userUnlockedIds.value.includes(ach.id)
    const isEnded = ach.status === 'ended'
    
    let currentProgress = 0
    let targetProgress = 1
    let completedScriptIds = [] // 用來裝「已經玩過的指定劇本」

    if (ach.condition_type === 'tag') {
      targetProgress = ach.condition_value?.count || 1
      const targetTag = ach.condition_value?.tag?.toLowerCase() || ''
      // 計算他玩過的劇本裡，有幾個包含這個標籤
      currentProgress = playedScriptsData.value.filter(s => s.tags.toLowerCase().includes(targetTag)).length
      if (currentProgress > targetProgress) currentProgress = targetProgress // 封頂限制
    } 
    else if (ach.condition_type === 'script') {
      const requiredIds = ach.condition_value?.script_ids || []
      targetProgress = requiredIds.length
      // 檢查他玩過的劇本 ID 裡，命中了幾個指定劇本
      const playedIds = playedScriptsData.value.map(s => s.script_id)
      completedScriptIds = requiredIds.filter(id => playedIds.includes(id))
      currentProgress = completedScriptIds.length
    }

    // 如果已經解鎖了，直接把進度條拉滿！
    if (isUnlocked) currentProgress = targetProgress

    return {
      ...ach,
      isUnlocked,
      isMissed: !isUnlocked && isEnded,
      unlockedDate: isUnlocked ? unlockedDates.value[ach.id] : null,
      currentProgress,
      targetProgress,
      completedScriptIds
    }
  })
})

const totalAch = computed(() => achievements.value.length)
const unlockedCount = computed(() => userUnlockedIds.value.length)
const progressPercent = computed(() => totalAch.value === 0 ? 0 : Math.round((unlockedCount.value / totalAch.value) * 100))

const openDetail = (ach) => {
  selectedAch.value = ach
  showDetailModal.value = true
}

// 翻譯單一劇本名稱
const getScriptName = (id) => {
  const found = scriptsList.value.find(s => s.id === id)
  return found ? found.title : '未知劇本'
}
</script>

<template>
  <div class="page-container">
    <div class="content-layer" :class="{ 'enter-active': isLoaded }">
      
      <div class="header-section fade-in-down">
        <h1 class="page-title">榮耀成就館</h1>
        <p class="page-subtitle">探索未知，銘刻你的專屬傳奇</p>
        
        <div class="progress-box">
          <div class="progress-info">
            <span>全館收集進度</span>
            <span class="gold-text">{{ unlockedCount }} / {{ totalAch }} ({{ progressPercent }}%)</span>
          </div>
          <div class="progress-bar-bg">
            <div class="progress-bar-fill" :style="{ width: progressPercent + '%' }"></div>
          </div>
        </div>
      </div>

      <div class="achievements-list fade-in-up delay-1">
        <div v-if="!isLoaded" class="loading-state"><div class="spinner"></div></div>
        <div v-else-if="displayAchievements.length === 0" class="empty-state">館長正在準備全新的挑戰，敬請期待...</div>

        <div 
          v-for="ach in displayAchievements" 
          :key="ach.id" 
          class="ach-card clickable"
          :class="{ 'is-unlocked': ach.isUnlocked, 'is-missed': ach.isMissed }"
          @click="openDetail(ach)"
        >
          <div v-if="ach.isMissed" class="missed-stamp">已絕版</div>
          
          <div class="ach-icon-box">
            <div class="icon">{{ ach.icon_url || '🏆' }}</div>
            <div v-if="ach.isUnlocked" class="unlocked-check">✔️</div>
          </div>
          
          <div class="ach-content">
            <h3 class="ach-title">{{ ach.title }}</h3>
            <p v-if="!ach.isUnlocked && !ach.isMissed" class="click-hint">進度：{{ ach.currentProgress }} / {{ ach.targetProgress }} ➔</p>
            <p v-else class="click-hint">點擊查看詳情 ➔</p>
          </div>
        </div>
      </div>
    </div>

    <Teleport to="body">
      <transition name="pop">
        <div v-if="showDetailModal && selectedAch" class="modal-overlay" @click.self="showDetailModal = false">
          <div class="modal-content detail-modal" :class="{ 'unlocked-glow': selectedAch.isUnlocked }">
            
            <button class="close-btn" @click="showDetailModal = false">✕</button>

            <div class="detail-header" :class="{ 'is-missed': selectedAch.isMissed }">
              <div class="detail-icon">{{ selectedAch.icon_url || '🏆' }}</div>
              <h2 class="detail-title">{{ selectedAch.title }}</h2>
              
              <div class="detail-status">
                <span v-if="selectedAch.isUnlocked" class="badge-unlocked">✅ 解鎖於 {{ selectedAch.unlockedDate }}</span>
                <span v-else-if="selectedAch.isMissed" class="badge-missed">⏳ 已絕版 (無法獲取)</span>
                <span v-else class="badge-locked">🔒 尚未解鎖</span>
              </div>
            </div>

            <div class="detail-body">
              <div class="info-block">
                <h4>📜 傳奇卷宗</h4>
                <p class="desc-text">{{ selectedAch.description }}</p>
              </div>

              <div class="info-block">
                <h4>🎯 任務進度</h4>
                
                <div v-if="selectedAch.condition_type === 'tag'" class="condition-box flex-column">
                  <div style="color: #ccc;">需通關以下標籤劇本：<span class="target-highlight">「{{ selectedAch.condition_value?.tag }}」</span></div>
                  
                  <div class="mission-progress-container mt-2">
                    <div class="mission-info">
                      <span>當前進度</span>
                      <span class="gold-text" style="font-size: 1.1rem;">{{ selectedAch.currentProgress }} <span style="font-size: 0.8rem; color: #888;">/ {{ selectedAch.targetProgress }}</span></span>
                    </div>
                    <div class="progress-bar-bg" style="height: 6px;">
                      <div class="progress-bar-fill" :style="{ width: Math.round((selectedAch.currentProgress / selectedAch.targetProgress) * 100) + '%' }"></div>
                    </div>
                  </div>
                </div>

                <div v-else-if="selectedAch.condition_type === 'script'" class="condition-box flex-column">
                  <div style="color: #ccc; margin-bottom: 8px;">需成功通關以下指定劇本：</div>
                  
                  <div class="script-badge-container">
                    <span 
                      v-for="scriptId in selectedAch.condition_value?.script_ids" 
                      :key="scriptId" 
                      class="script-badge"
                      :class="{ 'completed': selectedAch.completedScriptIds.includes(scriptId) }"
                    >
                      <span v-if="selectedAch.completedScriptIds.includes(scriptId)" style="color: #2ecc71;">✅</span>
                      <span v-else style="color: #666;">🔒</span> 
                      {{ getScriptName(scriptId) }}
                    </span>
                  </div>
                  
                  <div class="mission-info mt-2" style="width: 100%;">
                    <span>搜集進度</span>
                    <span class="gold-text">{{ selectedAch.currentProgress }} / {{ selectedAch.targetProgress }}</span>
                  </div>
                </div>
              </div>

              <div class="info-block">
                <h4>🎁 解鎖獎勵</h4>
                <div class="reward-box">
                  <div v-if="!selectedAch.reward_type || selectedAch.reward_type === 'none'" class="reward-item none">
                    <span class="r-icon">🎖️</span> 專屬榮耀頭銜 (無額外獎勵)
                  </div>
                  <div v-else-if="selectedAch.reward_type === 'exp'" class="reward-item exp">
                    <span class="r-icon">✨</span> 經驗值 +{{ selectedAch.reward_exp }} EXP
                  </div>
                  <div v-else-if="selectedAch.reward_type === 'coupon'" class="reward-item coupon">
                    <span class="r-icon">🎟️</span> 
                    <div>
                      <div style="font-weight: bold;">{{ selectedAch.reward_coupon_title }}</div>
                      <div style="font-size: 0.8rem; color: #e67e22; margin-top: 2px;">有效期限：{{ selectedAch.reward_coupon_valid_days }} 天</div>
                    </div>
                  </div>
                </div>
              </div>

            </div>
          </div>
        </div>
      </transition>
    </Teleport>
  </div>
</template>

<style scoped>
/* 頁面基礎樣式保持不變 */
.page-container { width: 100%; max-width: 800px; margin: 0 auto; min-height: 100vh; padding-bottom: 80px; color: #fff; background: transparent; }
.content-layer { padding: 30px 20px; }
.fade-in-down { opacity: 0; transform: translateY(-20px); transition: all 0.8s ease; }
.fade-in-up { opacity: 0; transform: translateY(30px); transition: all 0.8s cubic-bezier(0.2, 0.8, 0.2, 1); }
.enter-active .fade-in-down, .enter-active .fade-in-up { opacity: 1; transform: translateY(0); }
.delay-1 { transition-delay: 0.2s; }

.header-section { text-align: center; margin-bottom: 30px; }
.page-title { font-size: 2.2rem; font-weight: 900; color: #D4AF37; margin: 0 0 5px 0; text-shadow: 0 0 15px rgba(212,175,55,0.4); letter-spacing: 2px;}
.page-subtitle { color: #888; font-size: 0.95rem; margin-bottom: 25px; }

.progress-box { background: rgba(20,20,20,0.8); border: 1px solid #333; padding: 15px 20px; border-radius: 12px; backdrop-filter: blur(10px); }
.progress-info { display: flex; justify-content: space-between; font-size: 0.9rem; font-weight: bold; margin-bottom: 10px; color: #aaa; }
.gold-text { color: #D4AF37; font-weight: bold; }
.progress-bar-bg { width: 100%; height: 8px; background: #222; border-radius: 4px; overflow: hidden; box-shadow: inset 0 1px 3px rgba(0,0,0,0.5);}
.progress-bar-fill { height: 100%; background: linear-gradient(90deg, #D4AF37, #f1c40f); border-radius: 4px; transition: width 1s cubic-bezier(0.2, 0.8, 0.2, 1); box-shadow: 0 0 10px rgba(212,175,55,0.5); }

.achievements-list { display: flex; flex-direction: column; gap: 12px; }
.ach-card { display: flex; align-items: center; gap: 15px; background: rgba(26,26,26,0.8); border: 1px solid #333; padding: 12px 18px; border-radius: 12px; position: relative; overflow: hidden; transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1); cursor: pointer; }
.ach-card::before { content: ''; position: absolute; left: 0; top: 0; bottom: 0; width: 4px; background: #444; }
.ach-card.clickable:hover { background: rgba(35,35,35,0.9); transform: translateY(-2px); border-color: #555; }
.ach-card.clickable:active { transform: translateY(1px) scale(0.98); }

.ach-card.is-unlocked { background: linear-gradient(145deg, rgba(30,26,10,0.9), rgba(20,20,20,0.9)); border-color: rgba(212,175,55,0.3); }
.ach-card.is-unlocked::before { background: #D4AF37; box-shadow: 0 0 10px #D4AF37; }
.ach-card.is-unlocked.clickable:hover { border-color: #D4AF37; box-shadow: 0 4px 15px rgba(212,175,55,0.2); }

.ach-card.is-missed { opacity: 0.5; filter: grayscale(100%); }
.missed-stamp { position: absolute; right: 10px; top: 10px; border: 2px solid #888; color: #888; padding: 2px 8px; font-size: 0.7rem; font-weight: bold; transform: rotate(15deg); border-radius: 4px; }

.ach-icon-box { position: relative; width: 50px; height: 50px; background: #111; border: 1px solid #333; border-radius: 10px; display: flex; justify-content: center; align-items: center; flex-shrink: 0; font-size: 1.8rem; }
.ach-card.is-unlocked .ach-icon-box { border-color: #D4AF37; background: rgba(212,175,55,0.1); }
.unlocked-check { position: absolute; bottom: -5px; right: -5px; background: #2ecc71; color: #000; font-size: 0.6rem; width: 18px; height: 18px; display: flex; justify-content: center; align-items: center; border-radius: 50%; border: 2px solid #1a1a1a; font-weight: bold; }

.ach-content { flex: 1; display: flex; justify-content: space-between; align-items: center; }
.ach-title { margin: 0; font-size: 1.1rem; color: #eee; font-weight: bold; }
.ach-card.is-unlocked .ach-title { color: #D4AF37; }
.click-hint { margin: 0; font-size: 0.8rem; color: #888; font-weight: bold; }
.ach-card:hover .click-hint { color: #aaa; }

.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.85); z-index: 9999; display: flex; justify-content: center; align-items: center; backdrop-filter: blur(8px); padding: 20px; }
.detail-modal { background: #161616; width: 100%; max-width: 400px; border-radius: 20px; border: 1px solid #333; position: relative; overflow: hidden; box-shadow: 0 20px 50px rgba(0,0,0,0.8); }
.unlocked-glow { border-color: rgba(212, 175, 55, 0.5); box-shadow: 0 0 30px rgba(212,175,55,0.15), 0 20px 50px rgba(0,0,0,0.8); }

.close-btn { position: absolute; top: 15px; right: 15px; background: rgba(255,255,255,0.1); border: none; color: white; width: 32px; height: 32px; border-radius: 50%; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 1rem; z-index: 10; transition: 0.2s; }
.close-btn:hover { background: rgba(255,255,255,0.2); transform: scale(1.1); }

.detail-header { padding: 40px 20px 20px; text-align: center; background: linear-gradient(180deg, rgba(30,30,30,1) 0%, rgba(22,22,22,1) 100%); border-bottom: 1px solid #222; }
.detail-header.is-missed { filter: grayscale(100%); }
.detail-icon { font-size: 4rem; margin-bottom: 15px; filter: drop-shadow(0 5px 15px rgba(0,0,0,0.5)); animation: float 3s ease-in-out infinite; }
@keyframes float { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-8px); } }
.detail-title { margin: 0 0 15px 0; font-size: 1.6rem; color: #D4AF37; font-weight: 900; letter-spacing: 1px;}

.badge-unlocked { background: rgba(46, 204, 113, 0.15); color: #2ecc71; padding: 6px 15px; border-radius: 20px; font-size: 0.85rem; font-weight: bold; border: 1px solid rgba(46, 204, 113, 0.3); }
.badge-locked { background: rgba(255, 255, 255, 0.1); color: #aaa; padding: 6px 15px; border-radius: 20px; font-size: 0.85rem; font-weight: bold; }
.badge-missed { background: rgba(231, 76, 60, 0.15); color: #e74c3c; padding: 6px 15px; border-radius: 20px; font-size: 0.85rem; font-weight: bold; border: 1px solid rgba(231, 76, 60, 0.3); }

.detail-body { padding: 25px 20px; display: flex; flex-direction: column; gap: 20px; }
.info-block h4 { margin: 0 0 10px 0; color: #888; font-size: 0.9rem; letter-spacing: 1px; }
.desc-text { margin: 0; color: #eee; line-height: 1.5; font-size: 0.95rem; }

.condition-box { background: #111; border: 1px solid #222; padding: 15px; border-radius: 12px; display: flex; align-items: center; gap: 12px; font-size: 0.9rem; }
.condition-box.flex-column { flex-direction: column; align-items: flex-start; gap: 8px;}
.target-highlight { color: #3498db; font-weight: bold; font-size: 1.05rem; }

/* 🚀 新增：任務進度條樣式 */
.mission-progress-container { width: 100%; background: #1a1a1a; padding: 10px; border-radius: 8px; border: 1px solid #333;}
.mission-info { display: flex; justify-content: space-between; align-items: center; font-size: 0.85rem; color: #aaa; margin-bottom: 6px; }

/* 🚀 新增：劇本點亮系統樣式 */
.script-badge-container { display: flex; flex-wrap: wrap; gap: 8px; width: 100%; }
.script-badge { background: rgba(255,255,255,0.05); border: 1px solid #333; color: #888; padding: 6px 12px; border-radius: 8px; font-size: 0.85rem; transition: 0.3s; display: flex; align-items: center; gap: 5px;}
.script-badge.completed { background: rgba(46, 204, 113, 0.1); border-color: #2ecc71; color: #fff; font-weight: bold; box-shadow: 0 0 10px rgba(46, 204, 113, 0.2);}

.mt-2 { margin-top: 10px; }

.reward-box { background: #111; border: 1px solid #222; padding: 15px; border-radius: 12px; }
.reward-item { display: flex; align-items: center; gap: 12px; font-size: 0.95rem; font-weight: bold; }
.r-icon { font-size: 1.5rem; }
.reward-item.none { color: #ccc; }
.reward-item.exp { color: #3498db; }
.reward-item.coupon { color: #D4AF37; }

.pop-enter-active, .pop-leave-active { transition: all 0.3s cubic-bezier(0.2, 0.8, 0.2, 1); }
.pop-enter-from, .pop-leave-to { opacity: 0; transform: scale(0.9) translateY(20px); }
.spinner { width: 40px; height: 40px; border: 4px solid rgba(212, 175, 55, 0.2); border-top-color: #D4AF37; border-radius: 50%; animation: spin 1s linear infinite; margin: 50px auto; }
.empty-state { text-align: center; color: #666; padding: 40px 20px; border: 1px dashed #333; border-radius: 12px; }
</style>