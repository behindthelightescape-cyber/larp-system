<script setup>
import { computed, onMounted, ref } from 'vue'
import { useUserStore } from '../stores/user'
import { supabase } from '../supabase'
import ReferralTreeModal from '../components/ReferralTreeModal.vue'

const showTreeModal = ref(false)
const store = useUserStore()
const isLoaded = ref(false)

const BRAND_LOGO = 'https://meee.com.tw/VInVFKh.png'

const MOCK_STATS = {
  historyCount: 0, daysJoined: 0, level: 1,
  points: 0, nextLevel: 1000, title: '載入中...'
}

const stats = computed(() => {
  if (store.userData) {
    const currentExp = store.userData.total_exp || 0
    const levelInfo = store.getLevelInfo
      ? store.getLevelInfo(currentExp)
      : { level: 1, title: '剛加入的冒險者', nextExp: 100 }
    const displayTitle = store.userData.current_title || levelInfo.title
    return {
      historyCount: store.history?.length || 0,
      daysJoined: store.daysJoined || 0,
      level: levelInfo.level,
      points: currentExp,
      nextLevel: levelInfo.nextExp,
      title: displayTitle,
      isTitleHidden: displayTitle === '無稱號'
    }
  }
  return MOCK_STATS
})

const expPercentage = computed(() =>
  Math.min((stats.value.points / stats.value.nextLevel) * 100, 100) + '%'
)

const closeLevelUpAnimation = () => { store.levelUpData = null }

const showTitleModal = ref(false)
const availableTitles = ref([])
const isLoadingTitles = ref(false)

const openTitleModal = async () => {
  if (!store.userData) return
  showTitleModal.value = true
  isLoadingTitles.value = true
  const currentLevel = store.userData?.level || 1
  const allLevelTitles = [
    '剛加入的冒險者', '不怕死的探險家', '主角光環的勇者',
    '平行宇宙開拓家', '穿越時空成癮者', '陽光開朗小萌新'
  ]
  let baseTitles = ['無稱號', ...allLevelTitles.slice(0, currentLevel)]
  try {
    const { data, error } = await supabase
      .from('user_achievements').select('achievements ( title )')
      .eq('user_id', store.userData.id)
    if (error) throw error
    if (data?.length > 0) {
      const achTitles = data.map(d => d.achievements?.title).filter(t => t)
      baseTitles = [...baseTitles, ...achTitles]
    }
  } catch (err) {
    console.error('撈取稱號庫失敗:', err)
  } finally {
    availableTitles.value = [...new Set(baseTitles)]
    isLoadingTitles.value = false
  }
}

const changeTitle = async (newTitle) => {
  try {
    const { error } = await supabase.from('users')
      .update({ current_title: newTitle }).eq('id', store.userData.id)
    if (error) throw error
    store.userData.current_title = newTitle
    showTitleModal.value = false
  } catch (err) {
    alert('更換稱號失敗，請稍後再試！')
  }
}

onMounted(() => { setTimeout(() => { isLoaded.value = true }, 100) })
</script>

<template>
  <div class="page-container">
    <div class="content-layer" :class="{ 'enter-active': isLoaded }">

      <!-- Brand -->
      <div class="brand-header fade-in-down">
        <img :src="BRAND_LOGO" class="brand-logo" alt="劇光燈 Spotlight" />
      </div>

      <!-- Hero Card -->
      <div class="hero-card-container fade-in-up delay-1">
        <div class="card-deco-top"></div>
        <div class="card-shine"></div>

        <div class="avatar-overlap">
          <div class="avatar-ring floating">
            <img
              :src="store.userData?.picture_url || store.lineProfile?.pictureUrl || 'https://meee.com.tw/D45hJIi.PNG'"
              class="avatar-img"
            />
          </div>
          <div class="lv-badge">
            <span class="lv-prefix">LV</span>
            <span class="lv-num">{{ stats.level }}</span>
          </div>
        </div>

        <div class="card-body">
          <h1 class="user-name">{{ store.userData?.display_name || '載入中...' }}</h1>

          <div
            class="user-title-box clickable"
            :class="{ 'is-hidden': stats.isTitleHidden }"
            @click="openTitleModal"
          >
            <span class="title-icon">✦</span>
            <span class="title-text">{{ stats.title }}</span>
            <span class="title-edit">✎</span>
          </div>

          <p class="user-uid">
            <span class="uid-label">UID</span>
            <span class="uid-val">{{ store.userData?.legacy_id || '000000' }}</span>
          </p>

          <div class="divider-line">
            <span class="divider-gem">◆</span>
          </div>

          <div class="stats-matrix">
            <div class="stat-cell">
              <span class="stat-num">{{ stats.daysJoined }}</span>
              <span class="stat-label">DAYS</span>
            </div>
            <div class="stat-divider"></div>
            <div class="stat-cell">
              <span class="stat-num highlight">{{ stats.historyCount }}</span>
              <span class="stat-label">GAMES</span>
            </div>
          </div>

          <div class="exp-section">
            <div class="exp-header">
              <span class="exp-label">EXP</span>
              <span class="exp-fraction">
                <span class="exp-cur">{{ stats.points }}</span>
                <span class="exp-sep"> / </span>
                <span class="exp-max">{{ stats.nextLevel }}</span>
              </span>
            </div>
            <div class="exp-bar-bg">
              <div class="exp-bar-fill" :style="{ width: expPercentage }">
                <div class="exp-shimmer"></div>
                <div class="exp-glare"></div>
              </div>
            </div>
          </div>
        </div>

        <div class="card-deco-bottom"></div>
      </div>

      <!-- 族譜入口 -->
      <div class="home-action-area fade-in-up delay-2">
        <button @click="showTreeModal = true" class="tree-entry-btn">
          <div class="tree-btn-deco-top"></div>
          <div class="tree-btn-inner">
            <div class="tree-btn-left">
              <div class="tree-btn-icon-wrap">
                <span class="tree-btn-icon">🌳</span>
              </div>
              <div class="tree-btn-text">
                <span class="tree-btn-title">宗門弟子族譜</span>
                <span class="tree-btn-sub">查看你推坑的弟子們</span>
              </div>
            </div>
            <div class="tree-btn-right">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M6 3l5 5-5 5" stroke="#D4AF37" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </div>
          </div>
          <div class="tree-btn-deco-bottom"></div>
        </button>
      </div>

    </div>

    <ReferralTreeModal :show="showTreeModal" @close="showTreeModal = false" />

    <Teleport to="body">

      <!-- 稱號 Modal -->
      <transition name="slide-up">
        <div v-if="showTitleModal" class="modal-overlay" @click.self="showTitleModal = false">
          <div class="title-modal">
            <div class="modal-handle"></div>
            <div class="modal-top-bar">
              <h3>✦ 更換個人稱號</h3>
              <button class="close-btn-icon" @click="showTitleModal = false">✕</button>
            </div>
            <div class="modal-body">
              <div v-if="isLoadingTitles" class="loading-text">
                <div class="spinner"></div>
                <span>正在翻找你的榮譽徽章...</span>
              </div>
              <div v-else class="title-list">
                <button
                  v-for="title in availableTitles"
                  :key="title"
                  class="title-option-btn"
                  :class="{ active: stats.title === title }"
                  @click="changeTitle(title)"
                >
                  <span class="title-btn-icon">{{ title === '無稱號' ? '○' : '🎖️' }}</span>
                  <span>{{ title }}</span>
                  <span v-if="stats.title === title" class="title-active-check">✔</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </transition>

      <!-- 晉級動畫 -->
      <transition name="epic-pop">
        <div v-if="store.levelUpData" class="epic-overlay">
          <div class="light-beams"></div>
          <div class="epic-content">
            <h4 class="epic-subtitle">RANK UP</h4>
            <h1 class="epic-title">晉級成功</h1>
            <div class="epic-emblem-box">
              <div class="emblem-glow"></div>
              <div class="emblem-text">LV.{{ store.levelUpData.level }}</div>
            </div>
            <p class="epic-new-title">解鎖全新榮耀稱號：<br>
              <span class="gold-text">{{ store.levelUpData.title }}</span>
            </p>
            <p class="epic-coupon-text">🎟️ 系統已將「尊榮升級專屬禮」派發至您的票券匣</p>
            <button class="epic-btn" @click="closeLevelUpAnimation">華麗收下</button>
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
  box-sizing: border-box; min-height: 100vh;
  background-color: transparent; color: #fff; overflow: hidden;
}
.content-layer {
  display: flex; flex-direction: column; align-items: center;
  padding: 0 20px 60px;
}

/* ── 進場動畫 ── */
.fade-in-down { opacity: 0; transform: translateY(-20px); transition: all 0.8s ease; }
.fade-in-up   { opacity: 0; transform: translateY(30px);  transition: all 0.8s cubic-bezier(0.2, 0.8, 0.2, 1); }
.enter-active .fade-in-down,
.enter-active .fade-in-up { opacity: 1; transform: translateY(0); }
.delay-1 { transition-delay: 0.2s; }
.delay-2 { transition-delay: 0.4s; }

/* ── Brand ── */
.brand-header { margin-bottom: 100px; }
.brand-logo {
  height: 88px; object-fit: contain;
  filter: drop-shadow(0 0 16px rgba(212,175,55,0.55));
}

/* ── Hero Card ── */
.hero-card-container {
  width: 100%; max-width: 620px;
  position: relative;
  background: rgba(18, 18, 18, 0.72);
  backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);
  border: 1px solid rgba(255,255,255,0.07);
  border-radius: 28px;
  box-shadow: 0 30px 70px rgba(0,0,0,0.65), inset 0 1px 0 rgba(255,255,255,0.05);
  display: flex; flex-direction: column; align-items: center;
  padding-bottom: 44px;
}

/* 頂部金線 */
.card-deco-top {
  position: absolute; top: 0; left: 12%; right: 12%;
  height: 2px;
  background: linear-gradient(90deg, transparent, #D4AF37 40%, #f5d77a 50%, #D4AF37 60%, transparent);
}
/* 底部細線 */
.card-deco-bottom {
  position: absolute; bottom: 0; left: 28%; right: 28%;
  height: 1px;
  background: linear-gradient(90deg, transparent, #3a3a3a, transparent);
}
/* 卡片光澤 */
.card-shine { display: none; }

/* ── 頭像 ── */
.avatar-overlap {
  position: absolute; top: -90px;
  display: flex; flex-direction: column; align-items: center;
  z-index: 10;
}
.avatar-ring {
  width: 176px; height: 176px;
  border-radius: 50%; padding: 5px;
  background: conic-gradient(from 0deg, #9e761c, #D4AF37, #f5d77a, #D4AF37, #9e761c 360deg);
  box-shadow: 0 0 0 1px rgba(0,0,0,0.5), 0 16px 40px rgba(0,0,0,0.7), 0 0 30px rgba(212,175,55,0.2);
}
.floating { animation: float 4s ease-in-out infinite; }
@keyframes float { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-8px); } }
.avatar-img {
  width: 100%; height: 100%;
  object-fit: cover; border-radius: 50%;
  border: 4px solid #111; background: #000;
}

/* LV badge */
.lv-badge {
  margin-top: -16px; z-index: 11;
  display: flex; align-items: baseline; gap: 3px;
  background: linear-gradient(135deg, #ffd84d, #D4AF37);
  padding: 5px 16px 5px 14px; border-radius: 14px;
  box-shadow: 0 4px 14px rgba(0,0,0,0.5), 0 0 10px rgba(212,175,55,0.3);
}
.lv-prefix { color: rgba(0,0,0,0.6); font-size: 0.72rem; font-weight: 900; letter-spacing: 1px; }
.lv-num    { color: #000; font-size: 1.1rem; font-weight: 900; letter-spacing: 0.5px; }

/* ── Card Body ── */
.card-body {
  width: 100%; box-sizing: border-box;
  padding: 148px 32px 12px;
  display: flex; flex-direction: column; align-items: center;
}

.user-name {
  font-size: 2.5rem; font-weight: 800; color: #fff;
  margin: 0 0 14px; text-align: center;
  text-shadow: 0 2px 12px rgba(0,0,0,0.7);
  letter-spacing: 1px; line-height: 1.15;
}

/* 稱號框 */
.user-title-box {
  display: inline-flex; align-items: center; gap: 8px;
  border: 1px solid rgba(212,175,55,0.5);
  background: rgba(212,175,55,0.06);
  padding: 7px 20px; border-radius: 10px;
  margin-bottom: 12px;
  transition: all 0.3s cubic-bezier(0.2, 0.8, 0.2, 1);
  cursor: pointer; min-width: 120px; justify-content: center;
  position: relative; overflow: hidden;
}
.user-title-box::before {
  content: '';
  position: absolute; inset: 0;
  background: linear-gradient(90deg, transparent, rgba(212,175,55,0.06), transparent);
  transform: translateX(-100%);
  transition: transform 0.5s ease;
}
.user-title-box:hover::before { transform: translateX(100%); }
.user-title-box:hover {
  background: rgba(212,175,55,0.14);
  box-shadow: 0 0 18px rgba(212,175,55,0.2);
  transform: translateY(-1px);
}
.user-title-box:active { transform: scale(0.97); }
.title-icon { color: #D4AF37; font-size: 0.65rem; opacity: 0.6; }
.title-text { font-size: 1rem; color: #D4AF37; letter-spacing: 1.5px; }
.title-edit { color: #D4AF37; font-size: 0.75rem; opacity: 0.4; margin-left: 2px; transition: opacity 0.2s; }
.user-title-box:hover .title-edit { opacity: 0.8; }
.user-title-box.is-hidden { border-color: rgba(255,255,255,0.1); background: rgba(255,255,255,0.03); }
.user-title-box.is-hidden .title-text,
.user-title-box.is-hidden .title-icon,
.user-title-box.is-hidden .title-edit { color: #555; }

/* UID */
.user-uid {
  display: inline-flex; align-items: center; gap: 8px;
  background: rgba(0,0,0,0.35);
  border: 1px solid rgba(212,175,55,0.25);
  border-radius: 20px; padding: 6px 18px;
  margin-top: 10px;
}
.uid-label {
  color: #666; font-size: 0.7rem; font-weight: 800;
  letter-spacing: 2px; text-transform: uppercase;
}
.uid-val {
  color: #D4AF37; font-size: 1rem; font-weight: 700;
  font-family: monospace; letter-spacing: 2px;
  text-shadow: 0 0 8px rgba(212,175,55,0.4);
}

/* 分隔線 */
.divider-line {
  width: 100%; margin: 28px 0;
  display: flex; align-items: center; gap: 0;
  position: relative;
}
.divider-line::before,
.divider-line::after {
  content: ''; flex: 1; height: 1px;
  background: linear-gradient(90deg, transparent, rgba(255,255,255,0.08));
}
.divider-line::after {
  background: linear-gradient(90deg, rgba(255,255,255,0.08), transparent);
}
.divider-gem { color: #D4AF37; font-size: 0.6rem; opacity: 0.4; margin: 0 12px; }

/* 統計 */
.stats-matrix {
  display: flex; align-items: center;
  width: 100%; justify-content: center;
  margin-bottom: 32px; gap: 0;
}
.stat-cell {
  flex: 1; display: flex; flex-direction: column;
  align-items: center; gap: 6px;
}
.stat-divider {
  width: 1px; height: 50px;
  background: linear-gradient(to bottom, transparent, rgba(255,255,255,0.1), transparent);
  margin: 0 16px;
}
.stat-num {
  font-size: 3rem; font-weight: 800; color: #fff; line-height: 1;
  letter-spacing: -1px;
}
.stat-num.highlight {
  color: #D4AF37;
  text-shadow: 0 0 20px rgba(212,175,55,0.4);
}
.stat-label {
  font-size: 0.75rem; color: #555; font-weight: 700;
  letter-spacing: 2.5px; text-transform: uppercase;
}

/* 經驗條 */
.exp-section { width: 100%; padding: 0 4px; box-sizing: border-box; }
.exp-header {
  display: flex; justify-content: space-between; align-items: baseline;
  margin-bottom: 10px;
}
.exp-label { color: #555; font-size: 0.75rem; font-weight: 700; letter-spacing: 2px; }
.exp-fraction { display: flex; align-items: baseline; gap: 2px; }
.exp-cur  { color: #D4AF37; font-size: 1rem; font-weight: 700; }
.exp-sep  { color: #444; font-size: 0.85rem; }
.exp-max  { color: #666; font-size: 0.85rem; }
.exp-bar-bg {
  width: 100%; height: 8px;
  background: #181818; border-radius: 4px; overflow: hidden;
  box-shadow: inset 0 1px 4px rgba(0,0,0,0.6);
}
.exp-bar-fill {
  height: 100%; border-radius: 4px;
  background: linear-gradient(90deg, #9e761c, #D4AF37, #f5d77a, #D4AF37, #9e761c);
  background-size: 200% 100%;
  transition: width 1.2s cubic-bezier(0.2, 0.8, 0.2, 1);
  position: relative; overflow: hidden;
  animation: exp-shimmer 3s linear infinite;
}
@keyframes exp-shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
.exp-glare {
  position: absolute; top: 0; left: 0; right: 0; height: 45%;
  background: rgba(255,255,255,0.22); border-radius: 4px 4px 0 0;
}
.exp-shimmer {
  position: absolute; inset: 0;
  background: linear-gradient(90deg, transparent 30%, rgba(255,255,255,0.15) 50%, transparent 70%);
  animation: shimmer-pass 2s ease-in-out infinite;
}
@keyframes shimmer-pass {
  0%   { transform: translateX(-100%); }
  100% { transform: translateX(200%); }
}

/* ── 族譜按鈕 ── */
.home-action-area {
  width: 100%; max-width: 620px;
  margin: 16px 0 0; box-sizing: border-box;
}
.tree-entry-btn {
  width: 100%; position: relative;
  background: rgba(18, 18, 18, 0.72);
  backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);
  border: 1px solid rgba(255,255,255,0.07);
  border-radius: 20px; padding: 0; cursor: pointer;
  box-shadow: 0 10px 30px rgba(0,0,0,0.4);
  transition: transform 0.3s cubic-bezier(0.2,0.8,0.2,1), box-shadow 0.3s, border-color 0.3s;
  overflow: hidden; text-align: left;
}
.tree-entry-btn:hover {
  transform: translateY(-3px);
  border-color: rgba(212,175,55,0.25);
  box-shadow: 0 16px 40px rgba(0,0,0,0.5), 0 0 24px rgba(212,175,55,0.08);
}
.tree-entry-btn:active { transform: scale(0.98); }
.tree-btn-deco-top {
  position: absolute; top: 0; left: 12%; right: 12%; height: 1px;
  background: linear-gradient(90deg, transparent, #D4AF37 40%, #f5d77a 50%, #D4AF37 60%, transparent);
}
.tree-btn-deco-bottom {
  position: absolute; bottom: 0; left: 30%; right: 30%; height: 1px;
  background: linear-gradient(90deg, transparent, #333, transparent);
}
.tree-btn-inner {
  display: flex; align-items: center;
  justify-content: space-between; padding: 18px 22px;
}
.tree-btn-left  { display: flex; align-items: center; gap: 16px; }
.tree-btn-icon-wrap {
  width: 46px; height: 46px; border-radius: 12px;
  background: rgba(212,175,55,0.08);
  border: 1px solid rgba(212,175,55,0.2);
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0; transition: background 0.2s;
}
.tree-entry-btn:hover .tree-btn-icon-wrap {
  background: rgba(212,175,55,0.14);
  border-color: rgba(212,175,55,0.35);
}
.tree-btn-icon  { font-size: 1.6rem; line-height: 1; }
.tree-btn-text  { display: flex; flex-direction: column; gap: 4px; }
.tree-btn-title { color: #D4AF37; font-size: 1.05rem; font-weight: 700; letter-spacing: 1px; }
.tree-btn-sub   { color: #555; font-size: 0.78rem; letter-spacing: 0.3px; }
.tree-btn-right {
  display: flex; align-items: center;
  opacity: 0.4; transition: opacity 0.2s, transform 0.2s;
}
.tree-entry-btn:hover .tree-btn-right { opacity: 1; transform: translateX(3px); }

/* ── 稱號 Modal ── */
.modal-overlay {
  position: fixed; inset: 0;
  background: rgba(0,0,0,0.88); z-index: 3000;
  display: flex; justify-content: center; align-items: flex-end;
  backdrop-filter: blur(6px);
}
.title-modal {
  width: 100%; max-width: 600px;
  height: 62vh;
  background: #111;
  border-radius: 24px 24px 0 0;
  border-top: 2px solid #D4AF37;
  display: flex; flex-direction: column;
  box-shadow: 0 -10px 40px rgba(0,0,0,0.8);
  overflow: hidden;
}
.modal-handle {
  width: 40px; height: 4px; border-radius: 2px;
  background: #333; margin: 12px auto 0; flex-shrink: 0;
}
.modal-top-bar {
  display: flex; justify-content: space-between; align-items: center;
  padding: 16px 24px 14px; border-bottom: 1px solid #1e1e1e; flex-shrink: 0;
}
.modal-top-bar h3 { margin: 0; color: #D4AF37; font-size: 1.1rem; letter-spacing: 1px; }
.close-btn-icon {
  background: rgba(255,255,255,0.07); border: none; color: #888;
  width: 32px; height: 32px; border-radius: 50%; cursor: pointer;
  display: flex; align-items: center; justify-content: center; font-size: 1rem;
  transition: 0.2s;
}
.close-btn-icon:hover { background: rgba(255,255,255,0.12); color: #fff; }
.modal-body {
  padding: 18px 20px 30px; overflow-y: auto; flex: 1;
  -webkit-overflow-scrolling: touch;
}
.title-list  { display: flex; flex-direction: column; gap: 10px; }
.title-option-btn {
  background: #161616; border: 1px solid #222; color: #ccc;
  padding: 16px 18px; border-radius: 12px; font-size: 1rem;
  text-align: left; cursor: pointer;
  display: flex; align-items: center; gap: 12px;
  transition: background 0.2s, border-color 0.2s;
  width: 100%;
}
.title-option-btn:hover { background: #1e1e1e; border-color: #444; }
.title-option-btn.active {
  background: rgba(212,175,55,0.1);
  border-color: rgba(212,175,55,0.5); color: #D4AF37; font-weight: 700;
}
.title-btn-icon  { font-size: 1.1rem; flex-shrink: 0; }
.title-active-check {
  margin-left: auto; color: #D4AF37; font-size: 0.9rem; font-weight: 900;
}
.loading-text {
  text-align: center; color: #666; padding: 40px 20px;
  display: flex; flex-direction: column; align-items: center; gap: 14px;
  font-size: 0.9rem;
}
.spinner {
  width: 32px; height: 32px;
  border: 3px solid rgba(212,175,55,0.15); border-top-color: #D4AF37;
  border-radius: 50%; animation: spin 1s linear infinite;
}
@keyframes spin { 100% { transform: rotate(360deg); } }

/* ── 晉級動畫 ── */
.epic-overlay {
  position: fixed; inset: 0;
  background: radial-gradient(circle at center, rgba(20,20,20,0.95) 0%, #000 100%);
  z-index: 99999; display: flex; justify-content: center; align-items: center;
  overflow: hidden;
}
.light-beams {
  position: absolute; top: 50%; left: 50%; width: 250vmax; height: 250vmax;
  background: repeating-conic-gradient(transparent 0deg 10deg, rgba(212,175,55,0.25) 15deg, transparent 20deg 30deg);
  transform: translate(-50%,-50%); animation: spin-slow 25s linear infinite;
  opacity: 0.7; mix-blend-mode: screen;
}
@keyframes spin-slow { 100% { transform: translate(-50%,-50%) rotate(360deg); } }
.epic-content { position: relative; z-index: 10; text-align: center; padding: 0 24px; }
.epic-subtitle { color: #888; letter-spacing: 8px; margin: 0 0 10px; font-size: 1.1rem; text-transform: uppercase; opacity: 0; animation: fade-slide-down 0.6s ease-out 0.2s forwards; }
.epic-title { font-size: 4.5rem; margin: 0; color: #fff; font-weight: 900; letter-spacing: 2px; opacity: 0; transform: scale(1.5); filter: blur(10px); animation: title-crash 0.6s cubic-bezier(0.215,0.61,0.355,1) 0.4s forwards; text-shadow: 0 0 10px rgba(212,175,55,0.8), 0 0 30px rgba(212,175,55,0.4); }
.epic-emblem-box { position: relative; width: 160px; height: 160px; margin: 40px auto; display: flex; justify-content: center; align-items: center; background: url('data:image/svg+xml;charset=UTF-8,%3csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"%3e%3cpolygon points="50,5 95,25 95,75 50,95 5,75 5,25" fill="%23181818" stroke="%23D4AF37" stroke-width="2"/%3e%3c/svg%3e') no-repeat center / contain; opacity: 0; animation: emblem-arrival 1s cubic-bezier(0.175,0.885,0.32,1.275) 0.6s forwards, float-epic 3s ease-in-out 1.6s infinite; }
.epic-emblem-box::after { content: ''; position: absolute; inset: -50px; border: 2px solid #D4AF37; border-radius: 50%; opacity: 0; scale: 0.5; animation: shockwave 0.8s ease-out 0.7s forwards; }
.emblem-glow { position: absolute; inset: -30px; background: radial-gradient(circle, rgba(212,175,55,0.8) 0%, transparent 70%); z-index: -1; animation: pulse-glow 2s infinite alternate 0.8s; opacity: 0; }
.emblem-text { font-size: 3rem; font-weight: 900; background: linear-gradient(135deg, #fff 0%, #fceabb 25%, #D4AF37 50%, #9e761c 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; filter: drop-shadow(0 2px 1px rgba(0,0,0,0.9)) drop-shadow(0 0 10px rgba(212,175,55,0.8)); position: relative; z-index: 20; }
.epic-new-title, .epic-coupon-text, .epic-btn { opacity: 0; animation: fade-slide-up 0.8s ease-out 1.2s forwards; }
.epic-new-title { font-size: 1.1rem; color: #ccc; margin-top: 30px; line-height: 1.6; }
.gold-text { font-size: 2rem; font-weight: 900; display: block; margin-top: 10px; background: linear-gradient(to right, #bf953f, #fcf6ba, #b38728, #fbf5b7, #aa771c); background-size: 200% auto; -webkit-background-clip: text; -webkit-text-fill-color: transparent; animation: shine-move 3s linear infinite; }
.epic-coupon-text { font-size: 0.9rem; color: #2ecc71; margin: 15px 0 40px; font-weight: bold; background: rgba(46,204,113,0.12); padding: 10px 20px; border-radius: 30px; display: inline-block; border: 1px solid rgba(46,204,113,0.3); animation-delay: 1.4s; }
.epic-btn { background: linear-gradient(135deg, #D4AF37, #f1c40f, #D4AF37); background-size: 200% auto; color: #000; font-size: 1.2rem; font-weight: bold; padding: 16px 50px; border: none; border-radius: 50px; cursor: pointer; box-shadow: 0 10px 30px rgba(212,175,55,0.3); transition: 0.3s; min-width: 200px; margin-bottom: 20px; animation-delay: 1.6s; }
.epic-btn:hover { transform: scale(1.05) translateY(-3px); box-shadow: 0 20px 40px rgba(212,175,55,0.5); }

@keyframes title-crash { 0% { opacity: 0; transform: scale(3); filter: blur(20px); } 80% { transform: scale(0.9); } 100% { opacity: 1; transform: scale(1); filter: blur(0); } }
@keyframes emblem-arrival { 0% { opacity: 0; transform: translateY(-200px) scale(0.5) rotate(-180deg); } 70% { transform: translateY(20px) scale(1.1) rotate(10deg); } 100% { opacity: 1; transform: translateY(0) scale(1) rotate(0deg); } }
@keyframes shockwave { 0% { opacity: 1; scale: 0.5; border-width: 10px; } 100% { opacity: 0; scale: 2.5; border-width: 0px; } }
@keyframes fade-slide-down { from { opacity: 0; transform: translateY(-20px); } to { opacity: 1; transform: translateY(0); } }
@keyframes fade-slide-up   { from { opacity: 0; transform: translateY(30px);  } to { opacity: 1; transform: translateY(0); } }
@keyframes shine-move   { to { background-position: 200% center; } }
@keyframes float-epic   { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-15px); } }
@keyframes pulse-glow   { 0% { opacity: 0.4; transform: scale(0.95); } 100% { opacity: 1; transform: scale(1.1); } }

/* modal 動畫 */
.slide-up-enter-active, .slide-up-leave-active { transition: all 0.35s cubic-bezier(0.2,0.8,0.2,1); }
.slide-up-enter-from, .slide-up-leave-to { opacity: 0; transform: translateY(100%); }
.epic-pop-enter-active, .epic-pop-leave-active { transition: opacity 0.3s ease; }
.epic-pop-enter-from, .epic-pop-leave-to { opacity: 0; }

@media (max-width: 480px) {
  .brand-header { margin-bottom: 60px; }
  .card-body { padding: 120px 20px 12px; }
  .avatar-ring { width: 148px; height: 148px; }
  .avatar-overlap { top: -74px; }
  .user-name { font-size: 2rem; }
  .stat-num { font-size: 2.4rem; }
  .home-action-area { margin: 12px 0 0; }
}
</style>