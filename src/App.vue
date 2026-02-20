<script setup>
import { onMounted } from 'vue'
import { RouterView } from 'vue-router'
import { useUserStore } from './stores/user'
import BottomNav from './components/BottomNav.vue'

const userStore = useUserStore()

onMounted(() => {
  // 小四特製：發射導彈，此時 userStore.isLoading 會保持 true 直到全劇終
  userStore.initLiff()
  console.log('App 啟動，小四正在強迫 LINE 交出資料...')
})
</script>

<template>
  <div class="app-layout">
    
    <div class="fixed-background">
      <div class="gradient-layer"></div>
      <div class="pattern-layer"></div>
      <div class="noise-layer"></div>
      <div class="dust-layer"></div>
    </div>

    <div v-if="userStore.isLoading" class="global-loading-screen">
      <div class="spinner"></div>
      <p class="loading-text">連線至劇光燈主機中...</p>
    </div>

    <div v-else class="page-content">
      <router-view v-slot="{ Component }">
        <transition name="fade" mode="out-in">
          <component :is="Component" />
        </transition>
      </router-view>
    </div>

    <BottomNav v-if="!userStore.isLoading" />
    
  </div>
</template>

<style>
/* === 全域重置 === */
:root {
  --bg-dark: #0a0a0a00;
  --gold-accent: #0f0d05;
}

body {
  margin: 0;
  background-color: var(--bg-dark);
  color: #fff;
  font-family: 'Noto Sans TC', sans-serif;
  -webkit-font-smoothing: antialiased;
  overflow-x: hidden;
}

.app-layout {
  min-height: 100vh;
  position: relative;
}

/* === 🌟 背景特效核心 === */
.fixed-background {
  position: fixed;
  top: 0; left: 0; width: 100%; height: 100%;
  z-index: -1;
  background-color: #000;
}

.gradient-layer {
  position: absolute;
  top: 0; left: 0; width: 100%; height: 100%;
  background: radial-gradient(
    circle at 50% -20%, 
    #ffd20a36 0%, 
    #111 40%, 
    #050505 100%
  );
}

.pattern-layer {
  position: absolute;
  top: 0; left: 0; width: 100%; height: 100%;
  opacity: 0.6; 
  background-image: 
    linear-gradient(135deg, #D4AF37 25%, transparent 25%), 
    linear-gradient(225deg, #D4AF37 25%, transparent 25%), 
    linear-gradient(45deg, #D4AF37 25%, transparent 25%), 
    linear-gradient(315deg, #D4AF37 25%, transparent 25%);
  background-position: 20px 0, 20px 0, 0 0, 0 0;
  background-size: 40px 40px; 
  background-repeat: repeat;
  mix-blend-mode: overlay; 
  pointer-events: none;
}

.noise-layer {
  position: absolute;
  top: 0; left: 0; width: 100%; height: 100%;
  opacity: 0.07;
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E");
  pointer-events: none;
}

.dust-layer {
  position: absolute;
  top: 0; left: 0; width: 100%; height: 100%;
  background-image: 
    radial-gradient(rgba(255,255,255,0.2) 1px, transparent 1px),
    radial-gradient(rgba(212,175,55,0.2) 1px, transparent 1px);
  background-size: 60px 60px, 40px 40px;
  background-position: 0 0, 20px 20px;
  opacity: 0.3; 
  animation: floatDust 40s linear infinite;
  pointer-events: none;
}

@keyframes floatDust {
  from { transform: translateY(0); }
  to { transform: translateY(-30px); }
}

/* === 🚀 小四新增的 Loading 畫面樣式 === */
.global-loading-screen {
  position: absolute;
  top: 0; left: 0; width: 100%; height: 100vh;
  display: flex; flex-direction: column; 
  justify-content: center; align-items: center;
  z-index: 9999;
}

.spinner {
  width: 50px; height: 50px;
  border: 4px solid rgba(212, 175, 55, 0.3);
  border-top-color: #D4AF37;
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin-bottom: 20px;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.loading-text {
  color: #D4AF37;
  font-size: 1.1rem;
  letter-spacing: 2px;
  animation: pulse 1.5s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 0.6; }
  50% { opacity: 1; }
}

/* === 內容層 === */
.page-content {
  position: relative;
  z-index: 1;
  padding-bottom: 80px;
}

/* === 過場動畫 === */
.fade-enter-active, .fade-leave-active { transition: opacity 0.3s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>