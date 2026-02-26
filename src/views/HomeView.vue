<script setup>
import { computed, onMounted, ref } from 'vue'
import { useUserStore } from '../stores/user'
import { supabase } from '../supabase'

const store = useUserStore()
const isLoaded = ref(false)

const BRAND_LOGO = 'https://meee.com.tw/VInVFKh.png' 

// 預設的假資料
const MOCK_STATS = {
  historyCount: 0,
  daysJoined: 0,
  level: 1,
  points: 0,
  nextLevel: 1000,
  title: '載入中...'
}

// 🚀 1. 在 stats 裡面新增一個隱藏判定
// 🚀 1. 在 stats 裡面動態計算下一級的門檻
const stats = computed(() => {
  if (store.userData) {
    const currentExp = store.userData.total_exp || 0
    // 呼叫我們剛剛在 store 寫好的計算機！
    const levelInfo = store.getLevelInfo ? store.getLevelInfo(currentExp) : { level: 1, title: '剛加入的冒險者', nextExp: 100 }
    
    // 如果玩家沒有手動換稱號，就顯示他目前等級對應的稱號！
    let displayTitle = store.userData.current_title || levelInfo.title

    return {
      historyCount: store.history?.length || 0,
      daysJoined: store.daysJoined || 0,
      level: levelInfo.level, // 👈 精準等級
      points: currentExp,
      nextLevel: levelInfo.nextExp, // 👈 精準的下一級門檻 (100, 250, 500...)
      title: displayTitle,
      isTitleHidden: displayTitle === '無稱號'
    }
  }
  return MOCK_STATS
})
  

// 🚀 2. 在 openTitleModal 裡面把「無稱號」加進清單
const openTitleModal = async () => {
  if (!store.userData) return
  showTitleModal.value = true
  isLoadingTitles.value = true
  
  // 預設給一個「無稱號」跟「新手」保底
  availableTitles.value = ['無稱號', '新手冒險者'] 

  try {
    const { data, error } = await supabase
      .from('user_achievements')
      .select('achievements ( title )')
      .eq('user_id', store.userData.id)

    if (error) throw error

    if (data && data.length > 0) {
      const titles = data.map(d => d.achievements?.title).filter(t => t)
      // 🎯 利用 Set 確保不重複，並且把無稱號固定在第一個！
      availableTitles.value = [...new Set(['無稱號', '新手冒險者', ...titles])]
    }
  } catch (err) {
    console.error('撈取稱號庫失敗:', err)
  } finally {
    isLoadingTitles.value = false
  }
}

const changeTitle = async (newTitle) => {
  try {
    // 1. 寫回資料庫
    const { error } = await supabase
      .from('users')
      .update({ current_title: newTitle })
      .eq('id', store.userData.id)
    
    if (error) throw error

    // 2. 更新畫面與 Store
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
    </Teleport>

  </div>
</template>

<style scoped>
/* === 頁面基礎 === */
.page-container { 
  width: 100%; max-width: 800px; margin: 0 auto;
  box-sizing: border-box; min-height: 100vh;
  background-color: transparent; 
  color: #fff; overflow: hidden;
}

.content-layer {
  display: flex; flex-direction: column; align-items: center;
  padding-top: 0px;  
  padding-left: 24px;
  padding-right: 24px;
}

/* === 動畫 === */
.fade-in-down { opacity: 0; transform: translateY(-20px); transition: all 0.8s ease; }
.fade-in-up { opacity: 0; transform: translateY(30px); transition: all 0.8s cubic-bezier(0.2, 0.8, 0.2, 1); }
.enter-active .fade-in-down, .enter-active .fade-in-up { opacity: 1; transform: translateY(0); }
.delay-1 { transition-delay: 0.2s; }

/* === LOGO === */
.brand-header { margin-bottom: 100px; }
.brand-logo { height: 85px; object-fit: contain; filter: drop-shadow(0 0 10px rgba(212, 175, 55, 0.6)); }

/* === 英雄 ID 卡片 === */
.hero-card-container {
  width: 100%; max-width: 620px; position: relative;
  background: rgba(20, 20, 20, 0.65);
  backdrop-filter: blur(15px); -webkit-backdrop-filter: blur(15px);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 28px; box-shadow: 0 25px 60px rgba(0, 0, 0, 0.6);
  display: flex; flex-direction: column; align-items: center;
  padding-bottom: 40px; margin: 0 15px;
}
.card-deco-top { position: absolute; top: 0; left: 15%; right: 15%; height: 2px; background: linear-gradient(90deg, transparent, #D4AF37, transparent); }
.card-deco-bottom { position: absolute; bottom: 0; left: 30%; right: 30%; height: 1px; background: linear-gradient(90deg, transparent, #555, transparent); }

/* === 頭像 === */
.avatar-overlap { position: absolute; top: -85px; display: flex; flex-direction: column; align-items: center; z-index: 10; }
.avatar-ring { width: 170px; height: 170px; border-radius: 50%; padding: 6px; background: linear-gradient(135deg, #fcca30, #222); box-shadow: 0 15px 30px rgba(0,0,0,0.7); }
.floating { animation: float 4s ease-in-out infinite; }
@keyframes float { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-8px); } }
.avatar-img { width: 100%; height: 100%; object-fit: cover; border-radius: 50%; border: 4px solid #1a1a1a; background: #000; }
.lv-badge { margin-top: -18px; z-index: 11; background: #ffcf30; color: #000; font-weight: 900; font-size: 1rem; padding: 5px 16px; border-radius: 14px; box-shadow: 0 4px 12px rgba(0,0,0,0.5); font-family: 'Arial', sans-serif; letter-spacing: 1px; }

/* === 角色資訊 === */
.card-body { width: 100%; box-sizing: border-box; padding: 140px 30px 10px 30px; display: flex; flex-direction: column; align-items: center; }
.user-name { font-size: 2.4rem; font-weight: 700; color: #fff; margin: 0 0 12px 0; text-shadow: 0 2px 10px rgba(0,0,0,0.8); line-height: 1.1; text-align: center; }

/* === 🚀 稱號框本體 (純淨置中版) === */
.user-title-box { 
  border: 1px solid rgba(212, 175, 55, 0.692); 
  background: rgba(212, 175, 55, 0.05); 
  padding: 6px 24px; 
  border-radius: 8px; 
  margin-bottom: 10px; 
  transition: all 0.3s cubic-bezier(0.2, 0.8, 0.2, 1);
  display: inline-flex; 
  justify-content: center; 
  align-items: center;
  min-width: 120px;
}
.user-title-box.clickable { cursor: pointer; }
.user-title-box.clickable:hover { 
  background: rgba(212, 175, 55, 0.2); 
  box-shadow: 0 0 15px rgba(212, 175, 55, 0.3); 
  transform: scale(1.05); 
}
.user-title-box.clickable:active { transform: scale(0.95); }

.title-text { 
  font-size: 1rem; 
  color: #D4AF37; 
  letter-spacing: 1.5px; 
  text-align: center;
  margin: 0;
  transition: all 0.3s;
}

/* 🚀 選擇「無稱號」時的低調狀態 */
.user-title-box.is-hidden {
  border-color: rgba(255, 255, 255, 0.15);
  background: rgba(0, 0, 0, 0.4);
}
.user-title-box.is-hidden .title-text {
  color: #777; 
  font-size: 0.9rem; 
}
.user-title-box.is-hidden.clickable:hover {
  background: rgba(255, 255, 255, 0.1);
  box-shadow: 0 0 10px rgba(255, 255, 255, 0.05);
  border-color: rgba(255, 255, 255, 0.3);
}

.user-uid { font-size: 1.1rem; font-weight: bold; color: #D4AF37; letter-spacing: 2px; font-family: monospace; background: rgba(0, 0, 0, 0.4); padding: 6px 18px; border-radius: 20px; border: 1px solid rgba(212, 175, 55, 0.4); text-shadow: 0 0 5px rgba(212, 175, 55, 0.5); margin-top: 12px; }
.divider-line { width: 100%; height: 1px; background: rgba(255,255,255,0.08); margin: 30px 0; }

/* === 數據矩陣 === */
.stats-matrix { display: flex; width: 100%; justify-content: center; margin-bottom: 35px; }
.stat-cell { flex: 1; display: flex; flex-direction: column; align-items: center; position: relative; }
.stat-gap { width: 50px; } 
.stat-cell:first-child::after { content: ''; position: absolute; right: -25px; top: 10%; height: 80%; width: 1px; background: rgba(255,255,255,0.1); }
.stat-label { font-size: 0.8rem; color: #888; font-weight: bold; letter-spacing: 2px; margin-bottom: 8px; }
.stat-num { font-size: 2.8rem; font-weight: 700; color: #fff; line-height: 1; }
.stat-num.highlight { color: #D4AF37; text-shadow: 0 0 15px rgba(212, 175, 55, 0.4); }

/* === 經驗條 === */
.exp-section { width: 100%; padding: 0 15px; box-sizing: border-box; }
.exp-info { display: flex; justify-content: space-between; margin-bottom: 10px; font-size: 0.85rem; font-weight: bold; }
.exp-label { color: #666; letter-spacing: 1px; }
.exp-val { color: #ccc; }
.exp-bar-bg { width: 100%; height: 10px; background: #222; border-radius: 5px; overflow: hidden; position: relative; box-shadow: inset 0 1px 3px rgba(0,0,0,0.5); }
.exp-bar-fill { height: 100%; background: linear-gradient(90deg, #fac421, #D4AF37); border-radius: 5px; position: relative; transition: width 1s ease; }
.exp-glare { position: absolute; top: 0; left: 0; width: 100%; height: 50%; background: rgba(255,255,255,0.25); }

/* === 彈窗專屬 CSS === */
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
@keyframes spin { to { transform: rotate(360deg); } }
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
</style>