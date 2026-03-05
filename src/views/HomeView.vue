<script setup>
import { ref, computed, onMounted } from 'vue'
import { supabase } from '../supabase'
import { useUserStore } from '../stores/user'

const store = useUserStore()
const isLoaded = ref(false)
const isClaiming = ref(false)
const achievements = ref([])
const scriptsList = ref([]) 
const userUnlockedIds = ref([]) 
const unlockedDates = ref({})   
const playedScriptsData = ref([])

const showDetailModal = ref(false)
const selectedAch = ref(null)
const showMissed = ref(false)

const loadAchievementData = async () => {
  try {
    const [achRes, userAchRes, scriptRes, historyRes] = await Promise.all([
      supabase.from('achievements').select('*').order('created_at', { ascending: false }),
      supabase.from('user_achievements').select('achievement_id, unlocked_at').eq('user_id', store.userData.id),
      supabase.from('scripts').select('id, title'),
      supabase.from('game_participants').select(`games ( script_id, scripts ( tags ) )`).eq('user_id', store.userData.id)
    ])

    if (achRes.data) achievements.value = achRes.data
    if (scriptRes.data) scriptsList.value = scriptRes.data

    if (userAchRes.data) {
      userUnlockedIds.value = userAchRes.data.map(a => a.achievement_id)
      userAchRes.data.forEach(a => {
        unlockedDates.value[a.achievement_id] = new Date(a.unlocked_at).toLocaleDateString('zh-TW')
      })
    }

    if (historyRes.data) {
      playedScriptsData.value = historyRes.data.map(h => ({
        script_id: h.games?.script_id,
        tags: h.games?.scripts?.tags || ''
      })).filter(s => s.script_id)
    }
  } catch (error) {
    console.error('成就載入失敗:', error)
  }
}

onMounted(async () => {
  if (!store.userData) return
  await loadAchievementData()
  isLoaded.value = true
})

const displayAchievements = computed(() => {
  return achievements.value.map(ach => {
    const isUnlocked = userUnlockedIds.value.includes(ach.id)
    const isEnded = ach.status === 'ended'
    
    let currentProgress = 0
    let targetProgress = 1
    let completedScriptIds = [] 

    if (ach.condition_type === 'tag') {
      targetProgress = ach.condition_value?.count || 1
      const targetTag = ach.condition_value?.tag?.toLowerCase() || ''
      currentProgress = playedScriptsData.value.filter(s => s.tags.toLowerCase().includes(targetTag)).length
      if (currentProgress > targetProgress) currentProgress = targetProgress 
    } else if (ach.condition_type === 'script') {
      const requiredIds = ach.condition_value?.script_ids || []
      targetProgress = requiredIds.length
      const playedIds = playedScriptsData.value.map(s => s.script_id)
      completedScriptIds = requiredIds.filter(id => playedIds.includes(id))
      currentProgress = completedScriptIds.length
    }

    if (isUnlocked) currentProgress = targetProgress

    const canClaim = !isUnlocked && !isEnded && (currentProgress >= targetProgress)

    return {
      ...ach,
      isUnlocked,
      isMissed: !isUnlocked && isEnded,
      canClaim,
      unlockedDate: isUnlocked ? unlockedDates.value[ach.id] : null,
      currentProgress,
      targetProgress,
      completedScriptIds
    }
  })
})

const activeAchievements = computed(() => displayAchievements.value.filter(a => !a.isMissed))
const missedAchievements = computed(() => displayAchievements.value.filter(a => a.isMissed))

const totalAchievable = computed(() => activeAchievements.value.length)
const unlockedCount = computed(() => userUnlockedIds.value.length)
const progressPercent = computed(() => totalAchievable.value === 0 ? 0 : Math.round((unlockedCount.value / totalAchievable.value) * 100))

const openDetail = (ach) => {
  selectedAch.value = ach
  showDetailModal.value = true
}

const getScriptName = (id) => {
  const found = scriptsList.value.find(s => s.id === id)
  return found ? found.title : '未知劇本'
}

const claimReward = async (ach) => {
  if (isClaiming.value) return
  isClaiming.value = true

  try {
    const { error: achErr } = await supabase.from('user_achievements').insert([{ user_id: store.userData.id, achievement_id: ach.id }])
    if (achErr) {
      if (achErr.code === '23505') return alert('這份榮耀你已經領取過囉！')
      throw achErr
    }

    let successMsg = `🎉 恭喜解鎖專屬稱號：【${ach.title}】！`

    if (ach.reward_type === 'coupon' && ach.reward_coupon_title) {
      const validDays = ach.reward_coupon_valid_days || 30
      const expiryDate = new Date()
      expiryDate.setDate(expiryDate.getDate() + validDays)
      await supabase.from('coupons').insert([{
        user_id: store.userData.id,
        title: ach.reward_coupon_title,
        description: ach.reward_coupon_desc || `🎉 解鎖成就【${ach.title}】專屬獎勵`,
        status: 'available',
        expiry_date: expiryDate.toISOString()
      }])
      successMsg += `\n🎟️ 獲得專屬票券，請至票券匣查看！`
    }

    if (ach.reward_type === 'exp' && ach.reward_exp > 0) {
      const currentExp = store.userData.total_exp || 0
      const newExp = currentExp + ach.reward_exp
      await supabase.from('users').update({ total_exp: newExp }).eq('id', store.userData.id)
      successMsg += `\n✨ 獲得成就獎勵：+${ach.reward_exp} 經驗值！`
    }

    alert(successMsg)
    showDetailModal.value = false
    await loadAchievementData()
  } catch (err) {
    alert('領取失敗，請聯絡館長：' + err.message)
  } finally {
    isClaiming.value = false
  }
}
</script>

<template>
  <div class="page-container">
    <div class="content-layer" :class="{ 'enter-active': isLoaded }">

      <!-- Header -->
      <div class="header-section fade-in-down">
        <div class="header-deco">✦</div>
        <h1 class="page-title">榮耀成就館</h1>
        <p class="page-subtitle">探索未知，銘刻你的專屬傳奇</p>

        <div class="progress-box">
          <div class="progress-top">
            <span class="progress-label">收集進度</span>
            <span class="progress-fraction">
              <span class="fraction-current">{{ unlockedCount }}</span>
              <span class="fraction-sep"> / </span>
              <span class="fraction-total">{{ totalAchievable }}</span>
            </span>
          </div>
          <div class="progress-bar-bg">
            <div class="progress-bar-fill" :style="{ width: progressPercent + '%' }">
              <div class="bar-glare"></div>
            </div>
          </div>
          <div class="progress-percent-label">{{ progressPercent }}% 完成</div>
        </div>
      </div>

      <!-- 成就列表 -->
      <div class="achievements-list fade-in-up delay-1">
        <div v-if="!isLoaded" class="loading-state">
          <div class="spinner"></div>
          <p>翻閱榮耀卷宗中...</p>
        </div>
        <div v-else-if="displayAchievements.length === 0" class="empty-state">
          館長正在準備全新的挑戰，敬請期待...
        </div>

        <div
          v-for="ach in activeAchievements"
          :key="ach.id"
          class="ach-card"
          :class="{ 'is-unlocked': ach.isUnlocked, 'is-ready': ach.canClaim }"
          @click="openDetail(ach)"
        >
          <!-- 左側狀態條 -->
          <div class="ach-side-bar"></div>

          <!-- 圖示 -->
          <div class="ach-icon-box">
            <span class="ach-icon">{{ ach.icon_url || '🏆' }}</span>
            <div v-if="ach.isUnlocked" class="unlocked-check">✔</div>
            <div v-if="ach.isUnlocked && ach.status === 'ended'" class="vintage-tag">典藏</div>
          </div>

          <!-- 內容 -->
          <div class="ach-content">
            <div class="ach-title-row">
              <h3 class="ach-title">{{ ach.title }}</h3>
              <span v-if="ach.canClaim" class="ready-chip">可領取</span>
            </div>
            <div v-if="ach.canClaim" class="claim-hint">🎁 達成條件！點擊領取獎勵</div>
            <div v-else-if="!ach.isUnlocked" class="progress-mini-wrap">
              <div class="progress-mini-bar-bg">
                <div class="progress-mini-fill" :style="{ width: Math.round((ach.currentProgress / ach.targetProgress) * 100) + '%' }"></div>
              </div>
              <span class="progress-mini-text">{{ ach.currentProgress }} / {{ ach.targetProgress }}</span>
            </div>
            <div v-else class="unlocked-date">解鎖於 {{ ach.unlockedDate }}</div>
          </div>

          <!-- 右箭頭 -->
          <div class="ach-arrow">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M5 2l5 5-5 5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </div>
        </div>

        <!-- 絕版收納區 -->
        <div v-if="missedAchievements.length > 0" class="missed-section">
          <div class="divider-header" @click="showMissed = !showMissed">
            <div class="divider-line"></div>
            <span class="divider-text">
              {{ showMissed ? '▲ 收起' : '▼ 展開' }} {{ missedAchievements.length }} 項已絕版遺憾
            </span>
            <div class="divider-line"></div>
          </div>

          <transition name="fade-slide">
            <div v-show="showMissed" class="missed-list">
              <div
                v-for="ach in missedAchievements"
                :key="ach.id"
                class="ach-card is-missed"
                @click="openDetail(ach)"
              >
                <div class="ach-side-bar"></div>
                <div class="ach-icon-box">
                  <span class="ach-icon">{{ ach.icon_url || '🏆' }}</span>
                  <div class="missed-badge">絕版</div>
                </div>
                <div class="ach-content">
                  <h3 class="ach-title">{{ ach.title }}</h3>
                  <span class="missed-hint">錯過的遺憾</span>
                </div>
                <div class="ach-arrow">
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <path d="M5 2l5 5-5 5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                </div>
              </div>
            </div>
          </transition>
        </div>
      </div>
    </div>

    <!-- 詳情彈窗 -->
    <Teleport to="body">
      <transition name="pop">
        <div v-if="showDetailModal && selectedAch" class="modal-overlay" @click.self="showDetailModal = false">
          <div class="detail-modal" :class="{ 'unlocked-glow': selectedAch.isUnlocked, 'ready-glow': selectedAch.canClaim }">
            <button class="modal-close-btn" @click="showDetailModal = false">✕</button>

            <!-- 彈窗 Header -->
            <div class="modal-header" :class="{ 'is-missed': selectedAch.isMissed }">
              <div class="modal-icon">{{ selectedAch.icon_url || '🏆' }}</div>
              <h2 class="modal-title">{{ selectedAch.title }}</h2>
              <div class="modal-status-row">
                <span v-if="selectedAch.isUnlocked" class="status-badge badge-unlocked">✅ 解鎖於 {{ selectedAch.unlockedDate }}</span>
                <span v-else-if="selectedAch.canClaim" class="status-badge badge-ready pulsing">✨ 任務達成，等待領取</span>
                <span v-else-if="selectedAch.isMissed" class="status-badge badge-missed">⏳ 已絕版</span>
                <span v-else class="status-badge badge-locked">🔒 尚未解鎖</span>
              </div>
            </div>

            <!-- 彈窗 Body -->
            <div class="modal-body">
              <div class="info-block">
                <div class="block-label">📜 傳奇卷宗</div>
                <p class="desc-text">{{ selectedAch.description }}</p>
              </div>

              <div class="info-block">
                <div class="block-label">🎯 任務進度</div>

                <div v-if="selectedAch.condition_type === 'tag'" class="condition-box">
                  <div class="condition-text">需通關標籤劇本：<span class="tag-highlight">「{{ selectedAch.condition_value?.tag }}」</span></div>
                  <div class="mission-bar-wrap">
                    <div class="mission-bar-info">
                      <span>當前進度</span>
                      <span class="gold-text">{{ selectedAch.currentProgress }} / {{ selectedAch.targetProgress }}</span>
                    </div>
                    <div class="progress-bar-bg" style="height:6px">
                      <div class="progress-bar-fill" :style="{ width: Math.round((selectedAch.currentProgress / selectedAch.targetProgress) * 100) + '%' }">
                        <div class="bar-glare"></div>
                      </div>
                    </div>
                  </div>
                </div>

                <div v-else-if="selectedAch.condition_type === 'script'" class="condition-box">
                  <div class="condition-text">需通關以下指定劇本：</div>
                  <div class="script-list">
                    <span
                      v-for="scriptId in selectedAch.condition_value?.script_ids"
                      :key="scriptId"
                      class="script-chip"
                      :class="{ completed: selectedAch.completedScriptIds.includes(scriptId) }"
                    >
                      {{ selectedAch.completedScriptIds.includes(scriptId) ? '✅' : '🔒' }}
                      {{ getScriptName(scriptId) }}
                    </span>
                  </div>
                  <div class="mission-bar-info" style="margin-top:10px">
                    <span>收集進度</span>
                    <span class="gold-text">{{ selectedAch.currentProgress }} / {{ selectedAch.targetProgress }}</span>
                  </div>
                </div>
              </div>

              <!-- 獎勵 / 領取 -->
              <div class="info-block">
                <button v-if="selectedAch.canClaim" class="claim-btn" @click="claimReward(selectedAch)" :disabled="isClaiming">
                  {{ isClaiming ? '領取中...' : '🎁 點擊領取專屬獎勵！' }}
                </button>
                <div v-else class="reward-preview">
                  <div class="block-label">🎁 獎勵預覽</div>
                  <div v-if="!selectedAch.reward_type || selectedAch.reward_type === 'none'" class="reward-row reward-title">
                    <span class="r-icon">🎖️</span> 專屬榮耀頭銜
                  </div>
                  <div v-else-if="selectedAch.reward_type === 'exp'" class="reward-row reward-exp">
                    <span class="r-icon">✨</span> 經驗值 +{{ selectedAch.reward_exp }} EXP
                  </div>
                  <div v-else-if="selectedAch.reward_type === 'coupon'" class="reward-row reward-coupon">
                    <span class="r-icon">🎟️</span>
                    <div>
                      <div class="reward-coupon-title">{{ selectedAch.reward_coupon_title }}</div>
                      <div class="reward-coupon-valid">領取後效期：{{ selectedAch.reward_coupon_valid_days }} 天</div>
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
/* ── 基礎 ── */
.page-container {
  width: 100%; max-width: 800px; margin: 0 auto;
  min-height: 100vh; padding-bottom: 100px;
  color: #fff; background: transparent;
}
.content-layer { padding: 36px 20px 0; }

/* 進場動畫 */
.fade-in-down { opacity: 0; transform: translateY(-20px); transition: all 0.8s ease; }
.fade-in-up   { opacity: 0; transform: translateY(30px);  transition: all 0.8s cubic-bezier(0.2, 0.8, 0.2, 1); }
.enter-active .fade-in-down,
.enter-active .fade-in-up { opacity: 1; transform: translateY(0); }
.delay-1 { transition-delay: 0.2s; }

/* ── Header ── */
.header-section { text-align: center; margin-bottom: 36px; }
.header-deco { color: #D4AF37; font-size: 1.2rem; letter-spacing: 8px; margin-bottom: 8px; opacity: 0.6; }
.page-title {
  font-size: 2.6rem; font-weight: 900; margin: 0 0 6px;
  color: #D4AF37;
  text-shadow: 0 0 30px rgba(212,175,55,0.35), 0 2px 8px rgba(0,0,0,0.8);
  letter-spacing: 3px;
}
.page-subtitle { color: #666; font-size: 0.95rem; margin: 0 0 28px; letter-spacing: 1px; }

/* 進度框 */
.progress-box {
  background: rgba(20,20,20,0.7);
  border: 1px solid rgba(212,175,55,0.2);
  border-radius: 16px;
  padding: 18px 22px;
  backdrop-filter: blur(12px);
  position: relative;
  overflow: hidden;
}
.progress-box::before {
  content: '';
  position: absolute; top: 0; left: 15%; right: 15%; height: 1px;
  background: linear-gradient(90deg, transparent, #D4AF37, transparent);
}
.progress-top {
  display: flex; justify-content: space-between; align-items: baseline;
  margin-bottom: 12px;
}
.progress-label { color: #777; font-size: 0.82rem; letter-spacing: 1.5px; text-transform: uppercase; }
.progress-fraction { display: flex; align-items: baseline; gap: 2px; }
.fraction-current { color: #D4AF37; font-size: 1.6rem; font-weight: 800; line-height: 1; }
.fraction-sep { color: #444; font-size: 1rem; }
.fraction-total { color: #888; font-size: 1rem; }
.progress-bar-bg {
  width: 100%; height: 8px; background: #1a1a1a;
  border-radius: 4px; overflow: hidden;
  box-shadow: inset 0 1px 4px rgba(0,0,0,0.6);
}
.progress-bar-fill {
  height: 100%;
  background: linear-gradient(90deg, #9e761c, #D4AF37, #f5d77a, #D4AF37);
  background-size: 200% 100%;
  border-radius: 4px;
  transition: width 1.2s cubic-bezier(0.2, 0.8, 0.2, 1);
  position: relative;
  animation: bar-shimmer 3s linear infinite;
}
@keyframes bar-shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
.bar-glare {
  position: absolute; top: 0; left: 0; right: 0; height: 50%;
  background: rgba(255,255,255,0.2); border-radius: 4px 4px 0 0;
}
.progress-percent-label { text-align: right; color: #555; font-size: 0.78rem; margin-top: 8px; letter-spacing: 0.5px; }

/* ── 成就卡片 ── */
.achievements-list { display: flex; flex-direction: column; gap: 10px; }

.ach-card {
  display: flex; align-items: center; gap: 0;
  background: rgba(22,22,22,0.85);
  border: 1px solid rgba(255,255,255,0.07);
  border-radius: 14px;
  overflow: hidden;
  cursor: pointer;
  transition: transform 0.2s cubic-bezier(0.2,0.8,0.2,1), border-color 0.2s, box-shadow 0.2s;
  position: relative;
}
.ach-card:hover {
  transform: translateY(-2px);
  border-color: rgba(212,175,55,0.25);
  box-shadow: 0 8px 24px rgba(0,0,0,0.4);
}
.ach-card:active { transform: scale(0.98); }

/* 已解鎖 */
.ach-card.is-unlocked {
  background: linear-gradient(135deg, rgba(28,24,10,0.9), rgba(20,20,20,0.9));
  border-color: rgba(212,175,55,0.25);
}
.ach-card.is-unlocked:hover { border-color: rgba(212,175,55,0.5); box-shadow: 0 8px 24px rgba(212,175,55,0.1); }

/* 可領取 */
.ach-card.is-ready {
  border-color: rgba(212,175,55,0.6);
  background: rgba(35,30,10,0.9);
  box-shadow: 0 0 20px rgba(212,175,55,0.15);
  animation: ready-pulse 2s ease-in-out infinite;
}
@keyframes ready-pulse {
  0%, 100% { box-shadow: 0 0 20px rgba(212,175,55,0.15); }
  50%       { box-shadow: 0 0 30px rgba(212,175,55,0.3); }
}

/* 絕版 */
.ach-card.is-missed { opacity: 0.45; filter: grayscale(80%); }
.ach-card.is-missed:hover { opacity: 0.65; filter: grayscale(50%); }

/* 左側色條 */
.ach-side-bar {
  width: 4px; align-self: stretch; flex-shrink: 0;
  background: #2a2a2a;
  transition: background 0.2s;
}
.is-unlocked .ach-side-bar { background: linear-gradient(to bottom, #D4AF37, #9e761c); }
.is-ready    .ach-side-bar { background: linear-gradient(to bottom, #f5d77a, #D4AF37); box-shadow: 0 0 8px #D4AF37; }
.is-missed   .ach-side-bar { background: #333; }

/* 圖示盒 */
.ach-icon-box {
  position: relative; flex-shrink: 0;
  width: 62px; height: 62px;
  display: flex; justify-content: center; align-items: center;
  margin: 0 4px;
}
.ach-icon { font-size: 2rem; line-height: 1; }
.unlocked-check {
  position: absolute; bottom: 4px; right: 4px;
  background: #2ecc71; color: #000;
  width: 18px; height: 18px; border-radius: 50%;
  display: flex; justify-content: center; align-items: center;
  font-size: 0.65rem; font-weight: 900;
  border: 2px solid #161616;
}
.vintage-tag {
  position: absolute; top: 4px; right: -2px;
  background: rgba(212,175,55,0.2); color: #D4AF37;
  border: 1px solid rgba(212,175,55,0.4);
  font-size: 0.55rem; padding: 1px 4px; border-radius: 3px;
  font-weight: bold; letter-spacing: 0.5px;
}
.missed-badge {
  position: absolute; bottom: 4px; right: 0;
  background: rgba(100,100,100,0.3); color: #666;
  border: 1px solid #444;
  font-size: 0.55rem; padding: 1px 4px; border-radius: 3px;
  font-weight: bold;
}

/* 文字內容 */
.ach-content { flex: 1; padding: 14px 10px; min-width: 0; }
.ach-title-row { display: flex; align-items: center; gap: 8px; margin-bottom: 5px; }
.ach-title {
  margin: 0; font-size: 1.05rem; font-weight: 700; color: #e8e8e8;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.is-unlocked .ach-title { color: #D4AF37; }
.is-missed   .ach-title { color: #888; }

.ready-chip {
  background: rgba(212,175,55,0.2); color: #D4AF37;
  border: 1px solid rgba(212,175,55,0.5);
  font-size: 0.7rem; padding: 2px 7px; border-radius: 10px;
  font-weight: bold; flex-shrink: 0;
  animation: pulse-chip 1.5s infinite;
}
@keyframes pulse-chip { 0%,100% { opacity: 1; } 50% { opacity: 0.6; } }

.claim-hint { color: #f1c40f; font-size: 0.82rem; font-weight: bold; }
.unlocked-date { color: #555; font-size: 0.78rem; }
.missed-hint { color: #555; font-size: 0.78rem; }

/* 進度條 mini */
.progress-mini-wrap { display: flex; align-items: center; gap: 8px; }
.progress-mini-bar-bg {
  flex: 1; height: 4px; background: #1e1e1e;
  border-radius: 2px; overflow: hidden;
}
.progress-mini-fill {
  height: 100%; background: linear-gradient(90deg, #555, #888);
  border-radius: 2px; transition: width 0.8s ease;
}
.progress-mini-text { color: #555; font-size: 0.75rem; white-space: nowrap; flex-shrink: 0; }

/* 箭頭 */
.ach-arrow { color: #333; padding: 0 16px; flex-shrink: 0; transition: color 0.2s, transform 0.2s; }
.ach-card:hover .ach-arrow { color: #888; transform: translateX(2px); }

/* ── 絕版區 ── */
.missed-section { margin-top: 20px; }
.divider-header {
  display: flex; align-items: center; gap: 12px;
  cursor: pointer; padding: 10px 0;
  opacity: 0.6; transition: opacity 0.2s;
}
.divider-header:hover { opacity: 1; }
.divider-line { flex: 1; height: 1px; background: #2a2a2a; }
.divider-text { color: #666; font-size: 0.82rem; font-weight: bold; white-space: nowrap; }
.missed-list { display: flex; flex-direction: column; gap: 10px; margin-top: 12px; }

/* ── 彈窗 ── */
.modal-overlay {
  position: fixed; inset: 0;
  background: rgba(0,0,0,0.88);
  z-index: 9999;
  display: flex; justify-content: center; align-items: flex-end;
  backdrop-filter: blur(8px);
}
.detail-modal {
  background: #111;
  width: 100%; max-width: 600px;
  max-height: 88vh;
  border-radius: 24px 24px 0 0;
  border-top: 2px solid rgba(212,175,55,0.4);
  display: flex; flex-direction: column;
  overflow: hidden;
  box-shadow: 0 -10px 40px rgba(0,0,0,0.8);
  position: relative;
}
.unlocked-glow { border-top-color: #D4AF37; box-shadow: 0 -10px 40px rgba(212,175,55,0.15); }
.ready-glow    { border-top-color: #f5d77a; box-shadow: 0 -10px 40px rgba(212,175,55,0.3); animation: ready-pulse 2s infinite; }

.modal-close-btn {
  position: absolute; top: 16px; right: 16px; z-index: 10;
  background: rgba(255,255,255,0.08); border: none; color: #888;
  width: 32px; height: 32px; border-radius: 50%;
  cursor: pointer; font-size: 1rem;
  display: flex; align-items: center; justify-content: center;
  transition: 0.2s;
}
.modal-close-btn:hover { background: rgba(255,255,255,0.15); color: #fff; }

/* 彈窗 header */
.modal-header {
  padding: 40px 24px 24px;
  text-align: center;
  background: linear-gradient(180deg, #1a1a1a 0%, #111 100%);
  border-bottom: 1px solid #1e1e1e;
  flex-shrink: 0;
}
.modal-header.is-missed { filter: grayscale(100%); }
.modal-icon {
  font-size: 4rem; margin-bottom: 14px; display: block;
  animation: float-icon 3s ease-in-out infinite;
}
@keyframes float-icon { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-8px); } }
.modal-title {
  margin: 0 0 14px; font-size: 1.7rem; font-weight: 900;
  color: #D4AF37; letter-spacing: 1.5px;
}
.modal-status-row { display: flex; justify-content: center; }

.status-badge {
  padding: 6px 18px; border-radius: 20px;
  font-size: 0.88rem; font-weight: bold; letter-spacing: 0.5px;
}
.badge-unlocked { background: rgba(46,204,113,0.12); color: #2ecc71; border: 1px solid rgba(46,204,113,0.3); }
.badge-locked   { background: rgba(255,255,255,0.07); color: #888; border: 1px solid #333; }
.badge-missed   { background: rgba(231,76,60,0.1); color: #e74c3c; border: 1px solid rgba(231,76,60,0.3); }
.badge-ready    { background: rgba(212,175,55,0.15); color: #f1c40f; border: 1px solid rgba(212,175,55,0.4); }
.pulsing        { animation: pulse-chip 1.5s infinite; }

/* 彈窗 body */
.modal-body {
  flex: 1; overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  padding: 22px 24px 36px;
  display: flex; flex-direction: column; gap: 20px;
}
.info-block {}
.block-label { color: #666; font-size: 0.82rem; letter-spacing: 1.5px; margin-bottom: 10px; text-transform: uppercase; }
.desc-text { color: #ccc; font-size: 0.95rem; line-height: 1.7; margin: 0; }

.condition-box {
  background: #0d0d0d; border: 1px solid #222;
  border-radius: 12px; padding: 16px;
  display: flex; flex-direction: column; gap: 10px;
}
.condition-text { color: #aaa; font-size: 0.9rem; }
.tag-highlight { color: #3498db; font-weight: bold; font-size: 1rem; }

.mission-bar-wrap { background: #141414; border: 1px solid #222; border-radius: 8px; padding: 12px; }
.mission-bar-info {
  display: flex; justify-content: space-between; align-items: center;
  font-size: 0.85rem; color: #888; margin-bottom: 8px;
}
.gold-text { color: #D4AF37; font-weight: bold; font-size: 1.05rem; }

.script-list { display: flex; flex-wrap: wrap; gap: 8px; }
.script-chip {
  background: rgba(255,255,255,0.04); border: 1px solid #2a2a2a;
  color: #888; padding: 7px 13px; border-radius: 8px;
  font-size: 0.85rem; display: flex; align-items: center; gap: 6px;
  transition: 0.2s;
}
.script-chip.completed {
  background: rgba(46,204,113,0.08); border-color: rgba(46,204,113,0.3);
  color: #eee; font-weight: 600;
}

/* 獎勵預覽 */
.reward-preview { background: #0d0d0d; border: 1px solid #222; border-radius: 12px; padding: 16px; }
.reward-row {
  display: flex; align-items: center; gap: 14px;
  font-size: 1rem; font-weight: bold; margin-top: 10px;
}
.r-icon { font-size: 1.6rem; }
.reward-title  { color: #ccc; }
.reward-exp    { color: #3498db; }
.reward-coupon { color: #D4AF37; }
.reward-coupon-title { font-weight: bold; font-size: 1rem; }
.reward-coupon-valid { color: #e67e22; font-size: 0.8rem; margin-top: 3px; }

/* 領取按鈕 */
.claim-btn {
  width: 100%;
  background: linear-gradient(135deg, #9e761c, #D4AF37, #f5d77a, #D4AF37, #9e761c);
  background-size: 300% 100%;
  color: #000; border: none;
  padding: 18px; border-radius: 14px;
  font-size: 1.15rem; font-weight: 900;
  cursor: pointer; letter-spacing: 0.5px;
  box-shadow: 0 6px 24px rgba(212,175,55,0.35);
  transition: transform 0.2s, box-shadow 0.2s;
  animation: bar-shimmer 3s linear infinite, pulse-chip 1.5s infinite;
}
.claim-btn:hover { transform: translateY(-3px); box-shadow: 0 10px 32px rgba(212,175,55,0.5); }
.claim-btn:active { transform: scale(0.97); }
.claim-btn:disabled { background: #2a2a2a; color: #555; cursor: not-allowed; animation: none; box-shadow: none; transform: none; }

/* ── 其他 ── */
.loading-state { text-align: center; color: #666; padding: 60px 20px; display: flex; flex-direction: column; align-items: center; gap: 16px; }
.loading-state p { margin: 0; font-size: 0.9rem; letter-spacing: 1px; }
.empty-state { text-align: center; color: #555; padding: 50px 20px; border: 1px dashed #222; border-radius: 14px; font-size: 0.95rem; }
.spinner {
  width: 40px; height: 40px;
  border: 3px solid rgba(212,175,55,0.15);
  border-top-color: #D4AF37;
  border-radius: 50%; animation: spin 1s linear infinite;
}
@keyframes spin { 100% { transform: rotate(360deg); } }

.mt-4 { margin-top: 20px; }

/* 動畫 */
.pop-enter-active, .pop-leave-active { transition: all 0.35s cubic-bezier(0.2, 0.8, 0.2, 1); }
.pop-enter-from, .pop-leave-to { opacity: 0; transform: translateY(100%); }
.fade-slide-enter-active, .fade-slide-leave-active { transition: all 0.3s ease; }
.fade-slide-enter-from, .fade-slide-leave-to { opacity: 0; transform: translateY(-8px); }
</style>