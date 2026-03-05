<script setup>
import { computed, onMounted, ref } from 'vue'
import { useUserStore } from '../stores/user'
import { supabase } from '../supabase'
import { ref } from 'vue'
import ReferralTreeModal from '../components/ReferralTreeModal.vue' // 引入族譜彈窗

const showTreeModal = ref(false) // 控制彈窗開關

const store = useUserStore()
const isLoaded = ref(false)

const BRAND_LOGO = 'https://meee.com.tw/VInVFKh.png' 

const MOCK_STATS = {
  historyCount: 0,
  daysJoined: 0,
  level: 1,
  points: 0,
  nextLevel: 1000,
  title: '載入中...'
}

const stats = computed(() => {
  if (store.userData) {
    const currentExp = store.userData.total_exp || 0
    const levelInfo = store.getLevelInfo ? store.getLevelInfo(currentExp) : { level: 1, title: '剛加入的冒險者', nextExp: 100 }
    
    let displayTitle = store.userData.current_title || levelInfo.title

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

// 🚀 關閉超燃晉級動畫
const closeLevelUpAnimation = () => {
  store.levelUpData = null
}

// 🚀 升級版：把「等級解鎖稱號」與「成就稱號」完美合體！
const openTitleModal = async () => {
  if (!store.userData) return
  showTitleModal.value = true
  isLoadingTitles.value = true
  
  // 1. 依照目前的真實等級，發放對應的階級稱號！
  const currentLevel = store.userData?.level || 1
  const allLevelTitles = [
    '剛加入的冒險者', '不怕死的探險家', '主角光環的勇者', 
    '平行宇宙開拓家', '穿越時空成癮者', '陽光開朗小萌新'
  ]
  const unlockedLevelTitles = allLevelTitles.slice(0, currentLevel)

  // 2. 預設清單放入：無稱號 + 已解鎖的等級稱號
  let baseTitles = ['無稱號', ...unlockedLevelTitles] 

  try {
    // 3. 去資料庫撈取額外的「特殊成就稱號」
    const { data, error } = await supabase
      .from('user_achievements')
      .select('achievements ( title )')
      .eq('user_id', store.userData.id)

    if (error) throw error

    if (data && data.length > 0) {
      const achTitles = data.map(d => d.achievements?.title).filter(t => t)
      baseTitles = [...baseTitles, ...achTitles]
    }
  } catch (err) {
    console.error('撈取稱號庫失敗:', err)
  } finally {
    // 4. 利用 Set 去除重複，完美呈現給玩家
    availableTitles.value = [...new Set(baseTitles)]
    isLoadingTitles.value = false
  }
}

const changeTitle = async (newTitle) => {
  try {
    const { error } = await supabase
      .from('users')
      .update({ current_title: newTitle })
      .eq('id', store.userData.id)
    
    if (error) throw error

    store.userData.current_title = newTitle
    showTitleModal.value = false
  } catch (err) {
    alert('更換稱號失敗，請稍後再試！')
  }
}

const showTitleModal = ref(false)
const availableTitles = ref([])
const isLoadingTitles = ref(false)

const expPercentage = computed(() => {
  return Math.min((stats.value.points / stats.value.nextLevel) * 100, 100) + '%'
})

onMounted(() => {
  setTimeout(() => {
    isLoaded.value = true
  }, 100)
})
</script>

<template>
  <div class="page-container">
    
    <div class="content-layer" :class="{ 'enter-active': isLoaded }">
      
      <div class="brand-header fade-in-down">
        <img :src="BRAND_LOGO" class="brand-logo" alt="劇光燈 Spotlight" />
      </div>

      <div class="hero-card-container fade-in-up delay-1">
        <div class="card-deco-top"></div>

        <div class="avatar-overlap">
          <div class="avatar-ring floating">
            <img :src="store.userData?.picture_url || store.lineProfile?.pictureUrl || 'https://meee.com.tw/D45hJIi.PNG'" class="avatar-img" />
          </div>
          <div class="lv-badge">LV.{{ stats.level }}</div>
        </div>

        <div class="card-body">
          <h1 class="user-name">{{ store.userData?.display_name || '載入中...' }}</h1>
          
          <div 
            class="user-title-box clickable" 
            :class="{ 'is-hidden': stats.isTitleHidden }" 
            @click="openTitleModal"
          >
            <span class="title-text">{{ stats.title }}</span>
          </div>
          
          <p class="user-uid">UID: {{ store.userData?.legacy_id || '000000' }}</p>

          <div class="divider-line"></div>

          <div class="stats-matrix">
            <div class="stat-cell">
              <span class="stat-label">DAYS</span>
              <span class="stat-num">{{ stats.daysJoined }}</span>
            </div>
            <div class="stat-gap"></div>
            <div class="stat-cell border-left">
              <span class="stat-label">GAMES</span>
              <span class="stat-num highlight">{{ stats.historyCount }}</span>
            </div>
          </div>

          <div class="exp-section">
            <div class="exp-info">
              <span class="exp-label">EXP PROGRESS</span>
              <span class="exp-val">{{ stats.points }} / {{ stats.nextLevel }}</span>
            </div>
            <div class="exp-bar-bg">
              <div class="exp-bar-fill" :style="{ width: expPercentage }">
                <div class="exp-glare"></div>
              </div>
            </div>
          </div>

        </div>
        <div class="card-deco-bottom"></div>
      </div>
    </div>
    <div class="home-action-area" style="margin: 20px 0;">
  <button 
    @click="showTreeModal = true" 
    class="tree-entry-btn"
  >
    <span class="btn-icon">🌳</span>
    <div class="btn-text">
      <span class="btn-title">宗門血脈族譜</span>
      <span class="btn-sub">查看我的推坑帝國與獎勵</span>
    </div>
    <span class="btn-arrow">➔</span>
  </button>
</div>

<ReferralTreeModal :show="showTreeModal" @close="showTreeModal = false" />

    <Teleport to="body">
      <transition name="pop">
        <div v-if="showTitleModal" class="modal-overlay" @click.self="showTitleModal = false">
          <div class="modal-content title-modal">
            
            <div class="modal-top-bar">
              <h3>更換個人稱號</h3>
              <button class="close-btn-icon" @click="showTitleModal = false">✕</button>
            </div>
            
            <div class="modal-body">
              <div v-if="isLoadingTitles" class="loading-text">
                <div class="spinner"></div>
                正在翻找你的榮譽徽章...
              </div>
              <div v-else class="title-list">
                <button 
                  v-for="title in availableTitles" 
                  :key="title"
                  class="title-option-btn"
                  :class="{ active: stats.title === title }"
                  @click="changeTitle(title)"
                >
                  <span v-if="title !== '無稱號'">🎖️ </span>{{ title }}
                </button>
              </div>
            </div>

          </div>
        </div>
      </transition>

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
            
            <p class="epic-new-title">解鎖全新榮耀稱號：<br><span class="gold-text">{{ store.levelUpData.title }}</span></p>
            <p class="epic-coupon-text">🎟️ 系統已將「尊榮升級專屬禮」派發至您的票券匣</p>
            
            <button class="epic-btn" @click="closeLevelUpAnimation">華麗收下</button>
          </div>
        </div>
      </transition>
    </Teleport>

  </div>
</template>

<style scoped>
/* (你原本的全部樣式保留，我們只在最下面補上動畫的 CSS) */
.page-container { width: 100%; max-width: 800px; margin: 0 auto; box-sizing: border-box; min-height: 100vh; background-color: transparent; color: #fff; overflow: hidden; }
.content-layer { display: flex; flex-direction: column; align-items: center; padding-top: 0px; padding-left: 24px; padding-right: 24px; }
.fade-in-down { opacity: 0; transform: translateY(-20px); transition: all 0.8s ease; }
.fade-in-up { opacity: 0; transform: translateY(30px); transition: all 0.8s cubic-bezier(0.2, 0.8, 0.2, 1); }
.enter-active .fade-in-down, .enter-active .fade-in-up { opacity: 1; transform: translateY(0); }
.delay-1 { transition-delay: 0.2s; }
.brand-header { margin-bottom: 100px; }
.brand-logo { height: 85px; object-fit: contain; filter: drop-shadow(0 0 10px rgba(212, 175, 55, 0.6)); }
.hero-card-container { width: 100%; max-width: 620px; position: relative; background: rgba(20, 20, 20, 0.65); backdrop-filter: blur(15px); -webkit-backdrop-filter: blur(15px); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 28px; box-shadow: 0 25px 60px rgba(0, 0, 0, 0.6); display: flex; flex-direction: column; align-items: center; padding-bottom: 40px; margin: 0 15px; }
.card-deco-top { position: absolute; top: 0; left: 15%; right: 15%; height: 2px; background: linear-gradient(90deg, transparent, #D4AF37, transparent); }
.card-deco-bottom { position: absolute; bottom: 0; left: 30%; right: 30%; height: 1px; background: linear-gradient(90deg, transparent, #555, transparent); }
.avatar-overlap { position: absolute; top: -85px; display: flex; flex-direction: column; align-items: center; z-index: 10; }
.avatar-ring { width: 170px; height: 170px; border-radius: 50%; padding: 6px; background: linear-gradient(135deg, #fcca30, #222); box-shadow: 0 15px 30px rgba(0,0,0,0.7); }
.floating { animation: float 4s ease-in-out infinite; }
@keyframes float { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-8px); } }
.avatar-img { width: 100%; height: 100%; object-fit: cover; border-radius: 50%; border: 4px solid #1a1a1a; background: #000; }
.lv-badge { margin-top: -18px; z-index: 11; background: #ffcf30; color: #000; font-weight: 900; font-size: 1rem; padding: 5px 16px; border-radius: 14px; box-shadow: 0 4px 12px rgba(0,0,0,0.5); font-family: 'Arial', sans-serif; letter-spacing: 1px; }
.card-body { width: 100%; box-sizing: border-box; padding: 140px 30px 10px 30px; display: flex; flex-direction: column; align-items: center; }
.user-name { font-size: 2.4rem; font-weight: 700; color: #fff; margin: 0 0 12px 0; text-shadow: 0 2px 10px rgba(0,0,0,0.8); line-height: 1.1; text-align: center; }
.user-title-box { border: 1px solid rgba(212, 175, 55, 0.692); background: rgba(212, 175, 55, 0.05); padding: 6px 24px; border-radius: 8px; margin-bottom: 10px; transition: all 0.3s cubic-bezier(0.2, 0.8, 0.2, 1); display: inline-flex; justify-content: center; align-items: center; min-width: 120px; }
.user-title-box.clickable { cursor: pointer; }
.user-title-box.clickable:hover { background: rgba(212, 175, 55, 0.2); box-shadow: 0 0 15px rgba(212, 175, 55, 0.3); transform: scale(1.05); }
.user-title-box.clickable:active { transform: scale(0.95); }
.title-text { font-size: 1rem; color: #D4AF37; letter-spacing: 1.5px; text-align: center; margin: 0; transition: all 0.3s; }
.user-title-box.is-hidden { border-color: rgba(255, 255, 255, 0.15); background: rgba(0, 0, 0, 0.4); }
.user-title-box.is-hidden .title-text { color: #777; font-size: 0.9rem; }
.user-title-box.is-hidden.clickable:hover { background: rgba(255, 255, 255, 0.1); box-shadow: 0 0 10px rgba(255, 255, 255, 0.05); border-color: rgba(255, 255, 255, 0.3); }
.user-uid { font-size: 1.1rem; font-weight: bold; color: #D4AF37; letter-spacing: 2px; font-family: monospace; background: rgba(0, 0, 0, 0.4); padding: 6px 18px; border-radius: 20px; border: 1px solid rgba(212, 175, 55, 0.4); text-shadow: 0 0 5px rgba(212, 175, 55, 0.5); margin-top: 12px; }
.divider-line { width: 100%; height: 1px; background: rgba(255,255,255,0.08); margin: 30px 0; }
.stats-matrix { display: flex; width: 100%; justify-content: center; margin-bottom: 35px; }
.stat-cell { flex: 1; display: flex; flex-direction: column; align-items: center; position: relative; }
.stat-gap { width: 50px; } 
.stat-cell:first-child::after { content: ''; position: absolute; right: -25px; top: 10%; height: 80%; width: 1px; background: rgba(255,255,255,0.1); }
.stat-label { font-size: 0.8rem; color: #888; font-weight: bold; letter-spacing: 2px; margin-bottom: 8px; }
.stat-num { font-size: 2.8rem; font-weight: 700; color: #fff; line-height: 1; }
.stat-num.highlight { color: #D4AF37; text-shadow: 0 0 15px rgba(212, 175, 55, 0.4); }
.exp-section { width: 100%; padding: 0 15px; box-sizing: border-box; }
.exp-info { display: flex; justify-content: space-between; margin-bottom: 10px; font-size: 0.85rem; font-weight: bold; }
.exp-label { color: #666; letter-spacing: 1px; }
.exp-val { color: #ccc; }
.exp-bar-bg { width: 100%; height: 10px; background: #222; border-radius: 5px; overflow: hidden; position: relative; box-shadow: inset 0 1px 3px rgba(0,0,0,0.5); }
.exp-bar-fill { height: 100%; background: linear-gradient(90deg, #fac421, #D4AF37); border-radius: 5px; position: relative; transition: width 1s ease; }
.exp-glare { position: absolute; top: 0; left: 0; width: 100%; height: 50%; background: rgba(255,255,255,0.25); }
.modal-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.85); z-index: 3000; display: flex; justify-content: center; align-items: flex-end; backdrop-filter: blur(5px); }
.title-modal { height: 60vh; background: #161616; width: 100%; max-width: 600px; border-radius: 24px 24px 0 0; border-top: 1px solid #D4AF37; display: flex; flex-direction: column; }
.modal-top-bar { display: flex; justify-content: space-between; align-items: center; padding: 20px 25px; border-bottom: 1px solid #222; }
.modal-top-bar h3 { margin: 0; color: #D4AF37; font-size: 1.2rem; }
.close-btn-icon { background: rgba(255,255,255,0.1); border: none; color: white; width: 32px; height: 32px; border-radius: 50%; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 1rem; }
.modal-body { padding: 25px; overflow-y: auto; flex: 1; -webkit-overflow-scrolling: touch; }
.title-list { display: flex; flex-direction: column; gap: 12px; }
.title-option-btn { background: #1a1a1a; border: 1px solid #333; color: #ccc; padding: 18px; border-radius: 12px; font-size: 1.05rem; text-align: left; cursor: pointer; transition: 0.2s; display: flex; align-items: center; gap: 10px; }
.title-option-btn:hover { background: #222; border-color: #555; }
.title-option-btn.active { background: rgba(212, 175, 55, 0.15); border: 1px solid #D4AF37; color: #D4AF37; font-weight: bold; box-shadow: inset 0 0 10px rgba(212,175,55,0.1); }
.loading-text { text-align: center; color: #888; padding: 40px; display: flex; flex-direction: column; align-items: center; gap: 15px;}
.spinner { width: 30px; height: 30px; border: 3px solid rgba(212, 175, 55, 0.2); border-top-color: #D4AF37; border-radius: 50%; animation: spin 1s linear infinite; }
.pop-enter-active, .pop-leave-active { transition: transform 0.3s cubic-bezier(0.2, 0.8, 0.2, 1); }
.pop-enter-from, .pop-leave-to { transform: translateY(100%); }

@media (max-width: 480px) {
  .brand-header { margin-bottom: 60px; }
  .hero-card-container { width: 95%; padding-bottom: 30px; }
  .user-name { font-size: 2rem; }
  .stat-num { font-size: 2.2rem; }
  .card-body { padding-top: 110px; padding-left: 20px; padding-right: 20px; }
  .avatar-ring { width: 140px; height: 140px; }
  .avatar-overlap { top: -70px; }
  .stat-gap { width: 30px; }
  .stat-cell:first-child::after { right: -15px; }
}

/* =========================================
   💥 SS 級炸裂晉級動畫專屬 CSS (四哥強化版)
========================================= */

/* 1. 背景層：更強烈的旋轉光束 */
.epic-overlay { position: fixed; inset: 0; background: radial-gradient(circle at center, rgba(20,20,20,0.95) 0%, #000 100%); z-index: 99999; display: flex; justify-content: center; align-items: center; overflow: hidden; perspective: 1000px; }
.light-beams { 
  position: absolute; top: 50%; left: 50%; width: 250vmax; height: 250vmax; 
  /* 🚀 關鍵修正：換成 repeating，360度自動補滿 12 條漸層聖光！ */
  background: repeating-conic-gradient(
    transparent 0deg 10deg, 
    rgba(212, 175, 55, 0.25) 15deg, 
    transparent 20deg 30deg
  ); 
  transform: translate(-50%, -50%); 
  animation: spin-slow 25s linear infinite; 
  opacity: 0.7; 
  mix-blend-mode: screen; 
}

@keyframes spin-slow { 100% { transform: translate(-50%, -50%) rotate(360deg); } }

/* 2. 內容容器：確保在最上層 */
.epic-content { position: relative; z-index: 10; text-align: center; }

/* 3. 文字依序進場：磅！磅！磅！ */
.epic-subtitle { color: #888; font-family: 'Arial Black', sans-serif; letter-spacing: 8px; margin: 0 0 10px 0; font-size: 1.1rem; text-transform: uppercase; opacity: 0; animation: fade-slide-down 0.6s ease-out 0.2s forwards; }
.epic-title { font-size: 4.5rem; margin: 0; color: #fff; font-weight: 900; line-height: 1.1; text-transform: uppercase; letter-spacing: 2px; opacity: 0; transform: scale(1.5); filter: blur(10px); animation: title-crash 0.6s cubic-bezier(0.215, 0.610, 0.355, 1.000) 0.4s forwards; /* text-shadow 用多層堆疊做出厚重感 */ text-shadow: 0 0 10px rgba(212, 175, 55, 0.8), 0 0 30px rgba(212, 175, 55, 0.4), 0 5px 15px #000; }

/* 4. 徽章核心：增加衝擊波與核心光芒 */
.epic-emblem-box { position: relative; width: 160px; height: 160px; margin: 40px auto; display: flex; justify-content: center; align-items: center; background: url('data:image/svg+xml;charset=UTF-8,%3csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"%3e%3cpolygon points="50,5 95,25 95,75 50,95 5,75 5,25" fill="%23181818" stroke="%23D4AF37" stroke-width="2" vector-effect="non-scaling-stroke"/%3e%3c/svg%3e') no-repeat center center; background-size: contain; opacity: 0; /* 核心進場動畫 */ animation: emblem-arrival 1s cubic-bezier(0.175, 0.885, 0.32, 1.275) 0.6s forwards, float-epic 3s ease-in-out 1.6s infinite; }
.epic-emblem-box::after { /* 💥 衝擊波特效層 */ content: ''; position: absolute; inset: -50px; border: 2px solid #D4AF37; border-radius: 50%; opacity: 0; scale: 0.5; animation: shockwave 0.8s ease-out 0.7s forwards; }
.emblem-glow { position: absolute; inset: -30px; background: radial-gradient(circle, rgba(212,175,55,0.8) 0%, rgba(212,175,55,0) 70%); z-index: -1; animation: pulse-glow 2s infinite alternate 0.8s; opacity: 0; }
/* 🚀 強化版數字：白金鑲金立體質感 */
.emblem-text { 
  font-size: 3rem; /* 稍微加大一點點 */
  font-weight: 1000; /* 用最粗的字重 */
  margin-top: 5px; /* 微調位置讓視覺置中 */
  
  /* 🌟 1. 更亮的金屬漸層：從亮白金過渡到深黃金 */
  background: linear-gradient(135deg, #ffffff 0%, #fceabb 25%, #D4AF37 50%, #9e761c 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;

  /* 🌟 2. 多重濾鏡堆疊：製造立體邊緣與輝光 */
  filter: 
    /* 第一層：緊貼的深色陰影，製造硬邊立體感 */
    drop-shadow(0 2px 1px rgba(0,0,0,0.9)) 
    /* 第二層：中間的金色輝光，讓它與背景分離 */
    drop-shadow(0 0 10px rgba(212, 175, 55, 0.8))
    /* 第三層：外圍的亮白光暈，製造爆發感 */
    drop-shadow(0 0 20px rgba(255, 255, 255, 0.4));

  /* 確保它在最上層 */
  position: relative;
  z-index: 20;
}
/* 5. 底部資訊依序浮現 */
.epic-new-title, .epic-coupon-text, .epic-btn { opacity: 0; animation: fade-slide-up 0.8s ease-out 1.2s forwards; }
.epic-new-title { font-size: 1.1rem; color: #ccc; margin-top: 30px; line-height: 1.6; }

/* 6. 金色稱號：加上金屬流光質感 */
.gold-text { font-size: 2rem; font-weight: 900; display: block; margin-top: 10px; padding: 5px; color: #D4AF37; /* 🌟 金屬流光特效 */ background: linear-gradient(to right, #bf953f, #fcf6ba, #b38728, #fbf5b7, #aa771c); background-size: 200% auto; -webkit-background-clip: text; -webkit-text-fill-color: transparent; animation: shine-move 3s linear infinite; text-shadow: 0 0 20px rgba(212, 175, 55, 0.3); }

.epic-coupon-text { font-size: 0.9rem; color: #2ecc71; margin-top: 15px; margin-bottom: 40px; font-weight: bold; background: rgba(46, 204, 113, 0.15); padding: 10px 20px; border-radius: 30px; display: inline-block; border: 1px solid rgba(46, 204, 113, 0.3); animation-delay: 1.4s; }

.epic-btn { background: linear-gradient(135deg, #D4AF37, #f1c40f, #D4AF37); background-size: 200% auto; color: #000; font-size: 1.2rem; font-weight: bold; padding: 16px 50px; border: none; border-radius: 50px; cursor: pointer; box-shadow: 0 10px 30px rgba(212, 175, 55, 0.3), inset 0 2px 2px rgba(255,255,255,0.5); transition: 0.3s; width: auto; min-width: 200px; margin-bottom: 20px; animation-delay: 1.6s; }
.epic-btn:hover { transform: scale(1.05) translateY(-3px); box-shadow: 0 20px 40px rgba(212, 175, 55, 0.5); background-position: right center; }
.tree-entry-btn {
  width: 100%;
  background: linear-gradient(135deg, #1a1a1a 0%, #0d0d0d 100%);
  border: 1px solid #D4AF37;
  border-radius: 12px;
  padding: 15px 20px;
  display: flex;
  align-items: center;
  gap: 15px;
  cursor: pointer;
  transition: 0.3s;
  box-shadow: 0 4px 15px rgba(212, 175, 55, 0.1);
  text-align: left;
}
.tree-entry-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(212, 175, 55, 0.2);
  background: linear-gradient(135deg, #222 0%, #111 100%);
}
.btn-icon { font-size: 2rem; }
.btn-text { display: flex; flex-direction: column; flex: 1; }
.btn-title { color: #D4AF37; font-size: 1.1rem; font-weight: bold; margin-bottom: 4px; }
.btn-sub { color: #888; font-size: 0.8rem; }
.btn-arrow { color: #D4AF37; font-size: 1.2rem; }
/* ================= 動畫關鍵影格定義 ================= */
@keyframes title-crash { 0% { opacity: 0; transform: scale(3); filter: blur(20px); } 80% { transform: scale(0.9); } 100% { opacity: 1; transform: scale(1); filter: blur(0); } }
@keyframes emblem-arrival { 0% { opacity: 0; transform: translateY(-200px) scale(0.5) rotate(-180deg); } 70% { transform: translateY(20px) scale(1.1) rotate(10deg); } 100% { opacity: 1; transform: translateY(0) scale(1) rotate(0deg); } }
@keyframes shockwave { 0% { opacity: 1; scale: 0.5; border-width: 10px; } 100% { opacity: 0; scale: 2.5; border-width: 0px; } }
@keyframes fade-slide-down { from { opacity: 0; transform: translateY(-20px); } to { opacity: 1; transform: translateY(0); } }
@keyframes fade-slide-up { from { opacity: 0; transform: translateY(30px); } to { opacity: 1; transform: translateY(0); } }
@keyframes shine-move { to { background-position: 200% center; } }
@keyframes float-epic { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-15px); } }
@keyframes pulse-glow { 0% { opacity: 0.4; transform: scale(0.95); } 100% { opacity: 1; transform: scale(1.1); } }
.epic-pop-enter-active, .epic-pop-leave-active { transition: opacity 0.3s ease; }
.epic-pop-enter-from, .epic-pop-leave-to { opacity: 0; }
</style>