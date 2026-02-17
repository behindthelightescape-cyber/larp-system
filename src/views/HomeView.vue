<script setup>
import { computed } from 'vue'
import { useUserStore } from '../stores/user'

const store = useUserStore()

// 劇光燈 LOGO
const BRAND_LOGO = 'https://meee.com.tw/VInVFKh.png' 

const MOCK_STATS = {
  historyCount: 4,
  daysJoined: 188,
  level: 3,
  points: 491,
  nextLevel: 1000,
  title: '主角光環的勇者'
}

const stats = computed(() => {
  return store.history.length > 0 ? {
    historyCount: store.history.length,
    daysJoined: store.daysJoined,
    level: store.level,
    points: store.profile?.points || 0,
    nextLevel: (store.level + 1) * 1000,
    title: store.profile?.title || '尚未獲得稱號'
  } : MOCK_STATS
})

const expPercentage = computed(() => {
  return Math.min((stats.value.points / stats.value.nextLevel) * 100, 100) + '%'
})
</script>

<template>
  <div class="page-container background-fx">
    
    <div class="content-layer">
      <div class="brand-header">
        <img :src="BRAND_LOGO" class="brand-logo" alt="劇光燈 Spotlight" />
      </div>

      <section class="avatar-stage">
        <div class="avatar-container">
          <img :src="store.profile?.picture_url || 'https://meee.com.tw/D45hJIi.PNG'" class="main-avatar" />
          <div class="spotlight-glow"></div>
        </div>

        <div class="character-info">
          <h1 class="char-name">{{ store.profile?.display_name || '冒險者 喬' }}</h1>
          <div class="char-badges">
            <span class="badge-lv">LV.{{ stats.level }}</span>
            <span class="badge-title">{{ stats.title }}</span>
          </div>
          <p class="char-id">UID: {{ store.profile?.serial_number || '00002' }}</p>
        </div>
      </section>

      <section class="exp-container">
        <div class="exp-labels">
          <span class="exp-text">EXP</span>
          <span class="exp-nums">{{ stats.points }} / {{ stats.nextLevel }}</span>
        </div>
        <div class="exp-track">
          <div class="exp-fill" :style="{ width: expPercentage }">
            <div class="exp-shine"></div>
          </div>
        </div>
      </section>

      <section class="stats-grid">
        <div class="stat-item">
          <span class="stat-val">{{ stats.daysJoined }}</span>
          <span class="stat-key">加入天數</span>
        </div>
        <div class="stat-divider"></div>
        <div class="stat-item">
          <span class="stat-val">{{ stats.historyCount }}</span>
          <span class="stat-key">遊玩本數</span>
        </div>
      </section>
    </div>

  </div>
</template>

<style scoped>
/* === 全域容器 RWD + 背景特效 === */
.page-container { 
  width: 100%;
  max-width: 800px; 
  margin: 0 auto;
  box-sizing: border-box;
  min-height: 100vh;
  color: #fff;
  display: flex;
  flex-direction: column;
  align-items: center;
  
  /* ⚠️ 基礎背景色改為深灰黑，而非純黑，增加層次 */
  background-color: transparent;
  position: relative;
  overflow: hidden; /* 防止光暈溢出 */
}

/* === 🌟 背景魔法區 (Magic Background) === */

/* 1. 頂部金色聚光燈效果 */


/* 2. 微粒子紋理 (選配，增加細節質感) */


/* ⚠️ 內容層：確保內容浮在背景特效之上 */
.content-layer {
  position: relative;
  z-index: 1;
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 24px;
  padding-bottom: 100px; 
}

/* ... 以下為原本的樣式，未更動 ... */

/* 1. LOGO 區域 */
.brand-header {
  margin-bottom: 25px;
  width: 100%;
  display: flex;
  justify-content: center;
}

.brand-logo {
  height: 90px;
  object-fit: contain;
  filter: drop-shadow(0 0 10px rgba(212, 175, 55, 0.4));
}

/* 2. 角色舞台區 */
.avatar-stage {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-bottom: 30px;
  position: relative;
  width: 100%;
}

.avatar-container {
  width: 160px; 
  height: 160px;
  margin-bottom: 18px;
  position: relative;
  z-index: 2;
}

.main-avatar {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 50%;
  border: 4px solid #D4AF37;
  box-shadow: 0 0 25px rgba(0,0,0,0.9);
  position: relative;
  z-index: 3;
  background: #111;
}

.spotlight-glow {
  position: absolute;
  top: 50%; left: 50%;
  transform: translate(-50%, -50%);
  width: 220px; height: 220px;
  background: radial-gradient(circle, rgba(212,175,55,0.25) 0%, rgba(0,0,0,0) 70%);
  z-index: 1;
  border-radius: 50%;
  animation: pulse 4s infinite ease-in-out;
}

.character-info { text-align: center; }

.char-name {
  font-size: 2rem;
  font-weight: 700;
  color: #fff;
  margin: 0 0 10px 0;
  text-shadow: 0 2px 4px rgba(0,0,0,0.8);
}

.char-badges {
  display: flex;
  justify-content: center;
  gap: 10px;
  margin-bottom: 8px;
}

.badge-lv {
  background: #D4AF37; color: #000;
  font-weight: 900; font-size: 0.9rem;
  padding: 4px 10px; border-radius: 6px;
  font-family: 'Arial', sans-serif;
}

.badge-title {
  border: 1px solid #666; color: #ccc;
  font-size: 0.9rem; padding: 4px 10px; border-radius: 6px;
  background: rgba(0,0,0,0.5);
}

.char-id {
  font-size: 0.85rem; color: #555; margin: 0;
  font-family: monospace; letter-spacing: 1px;
}

/* 3. 經驗值條 */
.exp-container {
  width: 100%;
  max-width: 600px; 
  margin-bottom: 35px;
  box-sizing: border-box;
}

.exp-labels {
  display: flex; justify-content: space-between;
  font-size: 0.8rem; color: #888;
  margin-bottom: 8px; font-weight: bold;
}
.exp-nums { color: #D4AF37; }

.exp-track {
  width: 100%; height: 10px;
  background: #222; border-radius: 5px;
  overflow: hidden; border: 1px solid #333;
}

.exp-fill {
  height: 100%;
  background: linear-gradient(90deg, #aa8e39, #D4AF37);
  border-radius: 5px;
  position: relative;
  transition: width 0.5s ease;
}

.exp-shine {
  position: absolute; top: 0; right: 0; bottom: 0; width: 15px;
  background: rgba(255,255,255,0.4);
  filter: blur(3px);
  transform: skewX(-20deg);
}

/* 4. 數據儀表板 */
.stats-grid {
  display: flex;
  justify-content: center;
  align-items: center;
  width: 100%;
  max-width: 700px;
  background: #111;
  border-radius: 16px;
  padding: 25px 0;
  border: 1px solid #222;
  box-shadow: 0 4px 12px rgba(0,0,0,0.4);
}

.stat-item {
  flex: 1;
  text-align: center;
  display: flex; flex-direction: column;
}

.stat-val {
  font-size: 2rem;
  font-weight: 700;
  color: #fff;
  line-height: 1;
  margin-bottom: 6px;
}

.stat-key {
  font-size: 0.85rem;
  color: #666;
  text-transform: uppercase;
  letter-spacing: 1.5px;
}

.stat-divider {
  width: 1px; height: 40px;
  background: #333;
}

@keyframes pulse {
  0% { opacity: 0.5; transform: translate(-50%, -50%) scale(0.95); }
  50% { opacity: 0.8; transform: translate(-50%, -50%) scale(1.05); }
  100% { opacity: 0.5; transform: translate(-50%, -50%) scale(0.95); }
}

@media (max-width: 480px) {
  .content-layer { padding: 16px; }
  .avatar-container { width: 130px; height: 130px; }
  .char-name { font-size: 1.6rem; }
  .stat-val { font-size: 1.6rem; }
}
</style>