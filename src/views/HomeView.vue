<script setup>
import { computed, onMounted, ref } from 'vue'
import { useUserStore } from '../stores/user'
import { supabase } from '../supabase'
import ReferralTreeModal from '../components/ReferralTreeModal.vue'
import { Users } from 'lucide-vue-next'

const showTreeModal = ref(false)
const store = useUserStore()
const isLoaded = ref(false)
const avatarError = ref(false)

const BRAND_LOGO = 'https://meee.com.tw/VInVFKh.png'
const FALLBACK_BASE = 'https://meee.com.tw/hLmrwbm.png'
const baseImgUrl = ref('')
const equippedBgUrl = ref('')
const dollLayers = ref({})
const dollLayerOrder = ['bottom', 'top', 'acc', 'hat', 'expr']

const stageBg = computed(() =>
  equippedBgUrl.value
    ? { backgroundImage: `url(${equippedBgUrl.value})`, backgroundSize: 'cover', backgroundPosition: 'center' }
    : { background: 'linear-gradient(170deg, #0f0c05 0%, #1a1507 40%, #0a0a0a 100%)' }
)

const loadDollData = async () => {
  const { data: baseData } = await supabase
    .from('wardrobe_bases')
    .select('img_url')
    .eq('is_default', true)
    .eq('is_active', true)
    .single()
  if (baseData?.img_url) baseImgUrl.value = baseData.img_url

  if (!store.userData?.id) return
  const { data: eq } = await supabase
    .from('user_wardrobe_equipped')
    .select('equipped, background_id')
    .eq('user_id', store.userData.id)
    .single()
  if (eq?.background_id) {
    const { data: bg } = await supabase
      .from('wardrobe_backgrounds')
      .select('img_url')
      .eq('id', eq.background_id)
      .single()
    if (bg?.img_url) equippedBgUrl.value = bg.img_url
  }

  const layers = {}

  const itemIds = eq?.equipped ? Object.values(eq.equipped).filter(Boolean) : []
  if (itemIds.length) {
    const { data: items } = await supabase
      .from('wardrobe_items')
      .select('id, category, img_url')
      .in('id', itemIds)
    if (items) {
      for (const [cat, id] of Object.entries(eq.equipped)) {
        const item = items.find(i => i.id === id)
        if (item?.img_url) layers[cat] = item.img_url
      }
    }
  }

  // 未裝備的槽位補上預設圖
  const { data: noneDefaults } = await supabase.from('wardrobe_none_defaults').select('category, img_url')
  if (noneDefaults) {
    for (const nd of noneDefaults) {
      if (nd.img_url && !layers[nd.category]) layers[nd.category] = nd.img_url
    }
  }

  dollLayers.value = layers
}

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

onMounted(() => {
  loadDollData()
  setTimeout(() => { isLoaded.value = true }, 100)
})
</script>

<template>
  <div class="page-container">

    <!-- 頂部 Header -->
    <header class="home-header">
      <img :src="BRAND_LOGO" class="header-logo" alt="劇光燈 Spotlight" />
    </header>

    <div class="content-layer" :class="{ 'enter-active': isLoaded }">

      <!-- 角色展示區（破框版） -->
      <div class="showcase-wrap fade-in-up delay-1">

        <!-- 頭貼（左，含等級 badge）懸浮於卡片上方 -->
        <div class="showcase-top-float">
          <div class="avatar-float-wrap">
            <div class="avatar-pill">
              <div class="avatar-small">
                <img
                  v-if="!avatarError && (store.userData?.picture_url || store.lineProfile?.pictureUrl)"
                  :src="store.userData?.picture_url || store.lineProfile?.pictureUrl"
                  class="avatar-img-small"
                  @error="avatarError = true"
                />
                <div v-else class="avatar-placeholder">
                  {{ (store.userData?.display_name || store.lineProfile?.displayName || '?')[0] }}
                </div>
              </div>
              <div class="avatar-lv-section">
                <span class="lv-prefix">LV</span>
                <span class="lv-num">{{ stats.level }}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- 燈燈破框而出，點擊進入換裝 -->
        <div class="showcase-doll-float" @click="$router.push('/paperdoll')">
          <div class="showcase-doll">
            <img v-if="dollLayers.cape" class="doll-layer doll-clothing" :src="dollLayers.cape" alt="" />
            <img class="doll-layer doll-base" :src="baseImgUrl || FALLBACK_BASE" alt="燈燈" />
            <template v-for="slot in dollLayerOrder" :key="slot">
              <img v-if="dollLayers[slot]" class="doll-layer doll-clothing" :src="dollLayers[slot]" alt="" />
            </template>
          </div>
          <div class="doll-edit-badge">換裝</div>
        </div>

        <!-- 縮短版卡片：只留背景 + 名字稱號 -->
        <div class="showcase-card" :style="stageBg">
          <div class="card-deco-top"></div>
          <div class="showcase-spotlight"></div>
          <div class="showcase-overlay">
            <h1 class="user-name">{{ store.userData?.display_name || store.lineProfile?.displayName || '未知玩家' }}</h1>
            <div
              class="user-title-box"
              :class="{ 'is-hidden': stats.isTitleHidden }"
              @click="openTitleModal"
            >
              <span class="title-icon">✦</span>
              <span class="title-text">{{ stats.title }}</span>
              <span class="title-edit">✎</span>
            </div>
          </div>
          <div class="card-deco-bottom"></div>
        </div>

      </div>

      <!-- UID -->
      <div class="uid-row fade-in-up delay-2">
        <span class="uid-label">UID</span>
        <span class="uid-val">{{ store.userData?.legacy_id || '000000' }}</span>
      </div>

      <!-- EXP + 數據卡 -->
      <div class="info-card fade-in-up delay-2">
        <div class="card-deco-top"></div>

        <div class="exp-section">
          <div class="exp-top-row">
            <span class="exp-label">EXPERIENCE</span>
            <span class="exp-to-next">
              還差 <strong>{{ Math.max(0, stats.nextLevel - stats.points) }}</strong> pt 升級
            </span>
          </div>
          <div class="exp-main-row">
            <span class="exp-cur-big">{{ stats.points }}</span>
            <span class="exp-sep">/</span>
            <span class="exp-max">{{ stats.nextLevel }} pt</span>
          </div>
          <div class="exp-bar-bg">
            <div class="exp-bar-fill" :style="{ width: expPercentage }">
              <div class="exp-shimmer"></div>
              <div class="exp-glare"></div>
            </div>
          </div>
          <div class="exp-bottom-row">
            <span class="exp-pct">{{ Math.round(parseFloat(expPercentage)) }}%</span>
            <span class="exp-lv-hint">LV {{ stats.level }} → LV {{ stats.level + 1 }}</span>
          </div>
        </div>

        <div class="divider-line"><span class="divider-gem">◆</span></div>

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

        <div class="card-deco-bottom"></div>
      </div>

      <!-- 族譜入口 -->
      <div class="home-action-area fade-in-up delay-3">
        <button @click="showTreeModal = true" class="tree-entry-btn">
          <div class="card-deco-top"></div>
          <div class="tree-btn-inner">
            <div class="tree-btn-left">
              <div class="tree-btn-icon-wrap">
                <Users :size="22" :stroke-width="1.5" class="tree-lucide-icon" />
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
          <div class="card-deco-bottom"></div>
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
  width: 100%;
  box-sizing: border-box; min-height: 100vh;
  background-color: transparent; color: #fff;
}
.content-layer {
  display: flex; flex-direction: column; align-items: stretch;
  padding: 74px 20px 80px; gap: 14px;
  max-width: 540px; margin: 0 auto;
}

/* ── 進場動畫 ── */
.fade-in-down { opacity: 0; transform: translateY(-20px); transition: all 0.8s ease; }
.fade-in-up   { opacity: 0; transform: translateY(30px);  transition: all 0.8s cubic-bezier(0.2, 0.8, 0.2, 1); }
.enter-active .fade-in-down,
.enter-active .fade-in-up { opacity: 1; transform: translateY(0); }
.delay-1 { transition-delay: 0.15s; }
.delay-2 { transition-delay: 0.3s; }
.delay-3 { transition-delay: 0.45s; }

/* ── Header ── */
.home-header {
  position: fixed; top: 0; left: 0; right: 0; z-index: 100;
  display: flex; align-items: center; justify-content: center;
  height: 60px; padding: 0 16px;
  background: rgba(10, 10, 10, 0.75);
  backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px);
  border-bottom: 1px solid rgba(212,175,55,0.2);
  box-shadow: 0 4px 24px rgba(0,0,0,0.4);
}
.header-logo {
  height: 70px; object-fit: contain;
  filter: drop-shadow(0 0 10px rgba(212,175,55,0.45));
}

/* ── 共用金線裝飾 ── */
.card-deco-top {
  position: absolute; top: 0; left: 12%; right: 12%; height: 2px;
  background: linear-gradient(90deg, transparent, #D4AF37 40%, #f5d77a 50%, #D4AF37 60%, transparent);
}
.card-deco-bottom {
  position: absolute; bottom: 0; left: 28%; right: 28%; height: 1px;
  background: linear-gradient(90deg, transparent, #3a3a3a, transparent);
}

/* ── 角色展示（破框版） ── */
.showcase-wrap {
  position: relative;
  width: 100%;
}

/* 頭貼 + 等級 badge：懸浮在卡片外，不被 overflow:hidden 截斷 */
.showcase-top-float {
  position: absolute;
  top: 16px; left: 0; right: 0;
  display: flex; justify-content: flex-start; align-items: center;
  padding: 0 22px;
  z-index: 10;
}

/* 頭貼 + LV pill 群組 */
.avatar-float-wrap {
  animation: avatar-float 3.5s ease-in-out infinite;
}
@keyframes avatar-float {
  0%, 100% { transform: translateY(0); }
  50%       { transform: translateY(-7px); }
}

/* 統一膠囊框：頭貼在左，LV 在右 */
.avatar-pill {
  display: flex; align-items: center;
  background: rgba(8,8,8,0.75);
  border: 1.5px solid rgba(212,175,55,0.55);
  border-radius: 32px;
  box-shadow: 0 4px 16px rgba(0,0,0,0.65);
  backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px);
}
.avatar-small {
  width: 50px; height: 50px; flex-shrink: 0;
  border-radius: 50%; overflow: hidden;
  margin: 4px;
}
.avatar-img-small { width: 100%; height: 100%; object-fit: cover; }
.avatar-placeholder {
  width: 100%; height: 100%;
  display: flex; align-items: center; justify-content: center;
  background: linear-gradient(135deg, #1e1a0e, #2a2210);
  color: #D4AF37; font-size: 1.2rem; font-weight: 800;
}

/* LV 區段：在膠囊右側 */
.avatar-lv-section {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  padding: 0 14px 0 10px; gap: 1px; pointer-events: none;
}
.lv-prefix { color: #888; font-size: 0.5rem; font-weight: 900; letter-spacing: 1.5px; line-height: 1; }
.lv-num    { color: #D4AF37; font-size: 1rem; font-weight: 900; line-height: 1; }

/* 燈燈：絕對定位，頭部露出卡片上方 */
.showcase-doll-float {
  position: absolute;
  top: 0; left: 50%;
  transform: translateX(-50%);
  z-index: 5;
  cursor: pointer;
}
.doll-edit-badge {
  position: absolute; bottom: 8px; right: 0;
  background: rgba(0,0,0,0.65);
  border: 1px solid rgba(212,175,55,0.5);
  border-radius: 20px; padding: 3px 12px;
  color: #D4AF37; font-size: 0.62rem; font-weight: 700; letter-spacing: 2px;
  backdrop-filter: blur(6px);
  white-space: nowrap;
  pointer-events: none;
}
.showcase-doll {
  display: grid;
  position: relative;
  width: 200px; aspect-ratio: 1;
  filter: drop-shadow(0 20px 48px rgba(0,0,0,0.9));
}
.doll-base {
  grid-area: 1 / 1;
  width: 100%; height: 100%;
  object-fit: contain;
}
.doll-clothing {
  grid-area: 1 / 1;
  width: 100%; height: 100%;
  object-fit: contain; pointer-events: none;
}

/* 縮短版卡片：留出頂部空間讓燈燈的身體進來 */
.showcase-card {
  margin-top: 200px;
  width: 100%; position: relative;
  border-radius: 24px; overflow: hidden;
  border: 1px solid rgba(255,255,255,0.08);
  box-shadow: 0 40px 80px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.06);
  background: linear-gradient(170deg, #0f0c05 0%, #1c1507 45%, #0a0a0a 100%);
  display: flex; flex-direction: column;
}

.showcase-spotlight {
  position: absolute; top: -40px; left: 50%; transform: translateX(-50%);
  width: 130%; height: 100%;
  background: radial-gradient(ellipse at top, rgba(212,175,55,0.1) 0%, transparent 65%);
  pointer-events: none;
}

/* overlay：頂部留空間給燈燈的下半身，名字在下方 */
.showcase-overlay {
  flex-shrink: 0; position: relative; z-index: 2;
  background: linear-gradient(to top, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0.7) 55%, transparent 100%);
  padding: 140px 24px 28px;
  display: flex; flex-direction: column; align-items: center; gap: 18px;
}
.user-name {
  margin: 0; font-size: 2.2rem; font-weight: 800; color: #fff;
  text-align: center; letter-spacing: 1px; line-height: 1.2;
  text-shadow: 0 2px 16px rgba(0,0,0,0.8);
}
.user-title-box {
  display: inline-flex; align-items: center; gap: 8px;
  border: 1px solid rgba(212,175,55,0.45);
  background: rgba(0,0,0,0.45); backdrop-filter: blur(8px);
  padding: 7px 20px; border-radius: 10px;
  cursor: pointer; transition: all 0.25s ease;
}
.user-title-box:hover { background: rgba(212,175,55,0.12); border-color: rgba(212,175,55,0.7); }
.user-title-box:active { transform: scale(0.97); }
.title-icon { color: #D4AF37; font-size: 0.6rem; opacity: 0.7; }
.title-text { font-size: 1rem; color: #D4AF37; letter-spacing: 1.5px; }
.title-edit { color: #D4AF37; font-size: 0.7rem; opacity: 0.35; transition: opacity 0.2s; }
.user-title-box:hover .title-edit { opacity: 0.8; }
.user-title-box.is-hidden { border-color: rgba(255,255,255,0.08); background: rgba(0,0,0,0.3); }
.user-title-box.is-hidden .title-text,
.user-title-box.is-hidden .title-icon,
.user-title-box.is-hidden .title-edit { color: #555; }

/* UID row */
.uid-row {
  width: 100%; box-sizing: border-box;
  display: flex; align-items: center; justify-content: center; gap: 10px;
  background: rgba(0,0,0,0.3);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 24px; padding: 14px 24px;
}
.uid-label { color: #555; font-size: 0.65rem; font-weight: 800; letter-spacing: 2px; }
.uid-val { color: #D4AF37; font-size: 1rem; font-weight: 700; font-family: monospace; letter-spacing: 3px; }

/* ── EXP + 數據卡 ── */
.info-card {
  width: 100%; position: relative;
  background: rgba(18,18,18,0.75);
  backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);
  border: 1px solid rgba(255,255,255,0.07);
  border-radius: 24px;
  box-shadow: 0 20px 50px rgba(0,0,0,0.5);
  padding: 24px 24px 20px; box-sizing: border-box;
}

/* 分隔線 */
.divider-line {
  width: 100%; margin: 20px 0;
  display: flex; align-items: center;
}
.divider-line::before,
.divider-line::after {
  content: ''; flex: 1; height: 1px;
  background: linear-gradient(90deg, transparent, rgba(255,255,255,0.06));
}
.divider-line::after { background: linear-gradient(90deg, rgba(255,255,255,0.06), transparent); }
.divider-gem { color: #D4AF37; font-size: 0.55rem; opacity: 0.35; margin: 0 12px; }

/* 統計 */
.stats-matrix {
  display: flex; align-items: center;
  width: 100%; justify-content: center;
}
.stat-cell {
  flex: 1; display: flex; flex-direction: column;
  align-items: center; gap: 5px;
}
.stat-divider {
  width: 1px; height: 44px;
  background: linear-gradient(to bottom, transparent, rgba(255,255,255,0.1), transparent);
  margin: 0 16px;
}
.stat-num {
  font-size: 2.6rem; font-weight: 800; color: #fff; line-height: 1; letter-spacing: -1px;
}
.stat-num.highlight { color: #D4AF37; text-shadow: 0 0 20px rgba(212,175,55,0.35); }
.stat-label { font-size: 0.7rem; color: #555; font-weight: 700; letter-spacing: 2.5px; }

/* 經驗條 */
.exp-section {
  width: 100%; padding: 16px 20px; box-sizing: border-box;
  background: rgba(212,175,55,0.04);
  border: 1px solid rgba(212,175,55,0.12);
  border-radius: 16px; margin-top: 4px;
}
.exp-top-row {
  display: flex; justify-content: space-between; align-items: center;
  margin-bottom: 8px;
}
.exp-label { color: #555; font-size: 0.62rem; font-weight: 700; letter-spacing: 3px; }
.exp-to-next { font-size: 0.72rem; color: #666; }
.exp-to-next strong { color: #D4AF37; font-weight: 800; }
.exp-main-row {
  display: flex; align-items: baseline; gap: 6px; margin-bottom: 12px;
}
.exp-cur-big { color: #D4AF37; font-size: 2rem; font-weight: 900; line-height: 1; letter-spacing: -1px; }
.exp-sep  { color: #333; font-size: 0.85rem; }
.exp-max  { color: #555; font-size: 0.85rem; }
.exp-bottom-row {
  display: flex; justify-content: space-between; align-items: center;
  margin-top: 8px;
}
.exp-pct { color: #D4AF37; font-size: 0.7rem; font-weight: 700; }
.exp-lv-hint { color: #444; font-size: 0.68rem; letter-spacing: 0.5px; }

.exp-bar-bg {
  width: 100%; height: 10px;
  background: #181818; border-radius: 5px; overflow: hidden;
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
  width: 100%; margin: 0; box-sizing: border-box;
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
.tree-lucide-icon { color: #D4AF37; }
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

/* ── RWD ── */
@media (max-width: 360px) {
  .content-layer { padding: 74px 14px 80px; gap: 10px; max-width: 100%; }
  .header-logo { height: 52px; }
  .showcase-doll { width: 160px; }
  .user-name { font-size: 1.6rem; }
  .stat-num { font-size: 2rem; }
  .exp-cur-big { font-size: 1.7rem; }
  .showcase-card { margin-top: 160px; }
  .showcase-top-float { top: 12px; padding: 0 14px; }
  .showcase-overlay { padding: 110px 16px 20px; }
}

@media (min-width: 480px) {
  .content-layer { padding: 74px 24px 80px; }
  .header-logo { height: 78px; }
  .showcase-doll { width: 220px; }
  .user-name { font-size: 2.2rem; }
  .stat-num { font-size: 2.6rem; }
  .exp-cur-big { font-size: 2.2rem; }
  .showcase-card { margin-top: 220px; }
  .showcase-overlay { padding: 150px 28px 32px; }
}
</style>