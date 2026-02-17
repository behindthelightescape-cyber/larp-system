<script setup>
import { onMounted } from 'vue'
import { useUserStore } from './stores/user'
import BottomNav from './components/BottomNav.vue'

const userStore = useUserStore()

onMounted(async () => {
  console.log('App 啟動，背景紋理載入...')
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

    <div class="page-content">
      <router-view v-slot="{ Component }">
        <transition name="fade" mode="out-in">
          <component :is="Component" />
        </transition>
      </router-view>
    </div>

    <BottomNav />
    
  </div>
</template>

<style>
/* === 全域重置 === */
:root {
  --bg-dark: #0a0a0a00;
  --gold-accent: #d4af37;
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

/* 1. 漸層層：舞台頂光 */
.gradient-layer {
  position: absolute;
  top: 0; left: 0; width: 100%; height: 100%;
  background: radial-gradient(
    circle at 50% -20%, 
    #332a00 0%, /* 頂部稍微帶一點暗金 */
    #111 40%, 
    #050505 100%
  );
}

/* 2. 🌟 花紋層：精品菱格紋 (CSS 繪製，絕對顯示) */
.pattern-layer {
  position: absolute;
  top: 0; left: 0; width: 100%; height: 100%;
  opacity: 0.35; /* 調整這裡可以改變花紋明顯度 (0.1 ~ 0.3) */
  
  /* 這是一種用 CSS 漸層交疊畫出的菱格紋 */
  background-image: 
    linear-gradient(135deg, #D4AF37 25%, transparent 25%), 
    linear-gradient(225deg, #D4AF37 25%, transparent 25%), 
    linear-gradient(45deg, #D4AF37 25%, transparent 25%), 
    linear-gradient(315deg, #D4AF37 25%, transparent 25%);
    
  background-position: 20px 0, 20px 0, 0 0, 0 0;
  background-size: 40px 40px; /* 控制格子大小 */
  background-repeat: repeat;
  
  /* 讓花紋融入背景，不要太突兀 */
  mix-blend-mode: overlay; 
  pointer-events: none;
}

/* 3. 噪點層 */
.noise-layer {
  position: absolute;
  top: 0; left: 0; width: 100%; height: 100%;
  opacity: 0.07;
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E");
  pointer-events: none;
}

/* 4. 粒子層 */
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