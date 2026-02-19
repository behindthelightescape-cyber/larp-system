<script setup>
import { computed, onMounted, ref } from 'vue'
import { useUserStore } from '../stores/user'

const store = useUserStore()
const isLoaded = ref(false)

const BRAND_LOGO = 'https://meee.com.tw/VInVFKh.png' 

// 預設的假資料 (當網路很慢或是還沒登入時墊檔用)
const MOCK_STATS = {
  historyCount: 0,
  daysJoined: 0,
  level: 1,
  points: 0,
  nextLevel: 1000,
  title: '載入中...'
}

// 🚀 關鍵修正：全面改用 store.userData 與真實的資料庫欄位
const stats = computed(() => {
  // 只要確定有登入資料，就顯示真實數據 (不管有沒有玩過遊戲)
  if (store.userData) {
    return {
      historyCount: store.history?.length || 0,
      daysJoined: store.daysJoined || 0,
      level: store.userData.level || 1,
      points: store.userData.total_exp || 0, // 真實欄位叫 total_exp
      nextLevel: (store.userData.level || 1) * 1000,
      title: store.userTitle || '新手冒險者' // 使用 store 算好的稱號
    }
  }
  return MOCK_STATS
})

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
          
          <div class="user-title-box">
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
  /* 為了配合更大的頭像，這裡往下移更多 */
  padding-top: 0px;  
  
  padding-left: 24px;
  padding-right: 24px;
}

/* === 動畫 === */
.fade-in-down { opacity: 0; transform: translateY(-20px); transition: all 0.8s ease; }
.fade-in-up { opacity: 0; transform: translateY(30px); transition: all 0.8s cubic-bezier(0.2, 0.8, 0.2, 1); }
.enter-active .fade-in-down, .enter-active .fade-in-up { opacity: 1; transform: translateY(0); }
.delay-1 { transition-delay: 0.2s; }

/* === 1. LOGO === */
.brand-header { margin-bottom: 100px; /* 留更多空間給超級大頭像 */ }
.brand-logo { height: 85px; object-fit: contain; filter: drop-shadow(0 0 10px rgba(212, 175, 55, 0.6)); }

/* === 2. 英雄 ID 卡片 (核心調整區) === */
.hero-card-container {
  width: 100%; 
  
  /* 🚀 關鍵 1: 寬度加大到 620px (接近平板寬度) */
  max-width: 620px; 
  
  position: relative;
  background: rgba(20, 20, 20, 0.65);
  backdrop-filter: blur(15px);
  -webkit-backdrop-filter: blur(15px);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 28px;
  box-shadow: 0 25px 60px rgba(0, 0, 0, 0.6);
  display: flex; flex-direction: column; align-items: center;
  padding-bottom: 40px;
  
  /* RWD: 手機上寬度佔 92% */
  margin: 0 15px;
}

.card-deco-top {
  position: absolute; top: 0; left: 15%; right: 15%; height: 2px;
  background: linear-gradient(90deg, transparent, #D4AF37, transparent);
}
.card-deco-bottom {
  position: absolute; bottom: 0; left: 30%; right: 30%; height: 1px;
  background: linear-gradient(90deg, transparent, #555, transparent);
}

/* === 2.1 頭像 (超級大) === */
.avatar-overlap {
  position: absolute; 
  /* 🚀 關鍵 2: 往上推更多 (-85px)，浮出水面 */
  top: -85px; 
  display: flex; flex-direction: column; align-items: center;
  z-index: 10;
}

.avatar-ring {
  /* 🚀 關鍵 3: 尺寸加大到 170px (原本 140) */
  width: 170px; height: 170px;
  border-radius: 50%;
  padding: 6px;
  background: linear-gradient(135deg, #fcca30, #222);
  box-shadow: 0 15px 30px rgba(0,0,0,0.7);
}
.floating { animation: float 4s ease-in-out infinite; }
@keyframes float { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-8px); } }

.avatar-img {
  width: 100%; height: 100%; object-fit: cover; border-radius: 50%;
  border: 4px solid #1a1a1a;
  background: #000;
}

.lv-badge {
  margin-top: -18px; z-index: 11;
  background: #ffcf30; color: #000;
  font-weight: 900; 
  font-size: 1rem; /* 字體加大 */
  padding: 5px 16px; border-radius: 14px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.5);
  font-family: 'Arial', sans-serif;
  letter-spacing: 1px;
}

/* === 2.2 角色資訊 (防遮擋關鍵) === */
.card-body {
  width: 100%; box-sizing: border-box;
  
  /* 🚀 關鍵 4: Padding Top 加大到 140px！ */
  /* 這就是讓名字往下移、不被遮住的魔法數字 */
  padding: 140px 30px 10px 30px; 
  
  display: flex; flex-direction: column; align-items: center;
}

.user-name {
  /* 字體加大 */
  font-size: 2.4rem; 
  font-weight: 700; color: #fff; 
  margin: 0 0 12px 0;
  text-shadow: 0 2px 10px rgba(0,0,0,0.8);
  line-height: 1.1;
  text-align: center;
}

.user-title-box {
  border: 1px solid rgba(212, 175, 55, 0.692);
  background: rgba(212, 175, 55, 0.05);
  padding: 6px 18px; border-radius: 8px; 
  margin-bottom: 10px;
}
.title-text { font-size: 1rem; color: #D4AF37; letter-spacing: 1.5px; }

.user-uid {
  /* 1. 字體加大、加粗 */
  font-size: 1.1rem; 
  font-weight: bold;
  
  /* 2. 改成金色，不再是死氣沉沉的灰色 */
  color: #D4AF37; 
  
  /* 3. 字距拉開，更有科技感 */
  letter-spacing: 2px;
  font-family: monospace; /* 等寬字體，像編碼一樣 */
  
  /* 4. 加個帥氣的半透明黑底框 */
  background: rgba(0, 0, 0, 0.4);
  padding: 6px 18px;
  border-radius: 20px;
  border: 1px solid rgba(212, 175, 55, 0.4); /* 淡淡的金框 */
  
  /* 5. 增加一點發光效果 */
  text-shadow: 0 0 5px rgba(212, 175, 55, 0.5);
  
  margin-top: 12px; /* 跟上面的稱號拉開一點距離 */
}
.divider-line {
  width: 100%; height: 1px; background: rgba(255,255,255,0.08);
  margin: 30px 0;
}

/* === 2.3 數據矩陣 (字體加大) === */
.stats-matrix {
  display: flex; width: 100%; justify-content: center;
  margin-bottom: 35px;
}

.stat-cell {
  flex: 1; display: flex; flex-direction: column; align-items: center;
  position: relative;
}

.stat-gap { width: 50px; } 

/* 右側分隔線 */
.stat-cell:first-child::after {
  content: ''; position: absolute; right: -25px; top: 10%; height: 80%;
  width: 1px; background: rgba(255,255,255,0.1);
}

.stat-label { font-size: 0.8rem; color: #888; font-weight: bold; letter-spacing: 2px; margin-bottom: 8px; }
/* 數字超大 */
.stat-num { font-size: 2.8rem; font-weight: 700; color: #fff; line-height: 1; }
.stat-num.highlight { color: #D4AF37; text-shadow: 0 0 15px rgba(212, 175, 55, 0.4); }

/* === 2.4 經驗條 === */
.exp-section { width: 100%; padding: 0 15px; box-sizing: border-box; }
.exp-info { display: flex; justify-content: space-between; margin-bottom: 10px; font-size: 0.85rem; font-weight: bold; }
.exp-label { color: #666; letter-spacing: 1px; }
.exp-val { color: #ccc; }

.exp-bar-bg {
  width: 100%; height: 10px; background: #222;
  border-radius: 5px; overflow: hidden; position: relative;
  box-shadow: inset 0 1px 3px rgba(0,0,0,0.5);
}
.exp-bar-fill {
  height: 100%; background: linear-gradient(90deg, #fac421, #D4AF37);
  border-radius: 5px; position: relative;
  transition: width 1s ease;
}
.exp-glare {
  position: absolute; top: 0; left: 0; width: 100%; height: 50%;
  background: rgba(255,255,255,0.25);
}

/* === RWD 手機版微調 (針對小螢幕適配) === */
@media (max-width: 480px) {
  .brand-header { margin-bottom: 60px; }
  .hero-card-container { width: 95%; padding-bottom: 30px; }
  
  /* 手機上字體稍微收斂，但還是要大 */
  .user-name { font-size: 2rem; }
  .stat-num { font-size: 2.2rem; }
  
  /* 手機上 padding-top 也要夠，不然會遮住 */
  .card-body { padding-top: 110px; padding-left: 20px; padding-right: 20px; }
  
  /* 手機上頭像稍微縮小，避免佔據太多垂直空間 */
  .avatar-ring { width: 140px; height: 140px; }
  .avatar-overlap { top: -70px; }
  
  .stat-gap { width: 30px; }
  .stat-cell:first-child::after { right: -15px; }
}
</style>