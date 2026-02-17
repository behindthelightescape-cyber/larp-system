<script setup>
import { onMounted } from 'vue'
import { useUserStore } from './stores/user'
import BottomNav from './components/BottomNav.vue'

const userStore = useUserStore()

onMounted(async () => {
  console.log('App 啟動，燈光師就位...')
  // 這裡之後放 LIFF init
  // await userStore.fetchProfile()
})
</script>

<template>
  <div class="app-layout">
    
    <div class="fixed-background">
      <div class="gradient-layer"></div>
      
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
  --bg-dark: rgba(20, 20, 20, 0);
  --gold-accent: #D4AF37;
}

body {
  margin: 0;
  background-color: var(--bg-dark); /* 預設底色 */
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
  z-index: -1; /* 放在最底層 */
  background-color: #000;
}

/* 1. 漸層層：模擬頂部打光 */
.gradient-layer {
  position: absolute;
  top: 0; left: 0; width: 100%; height: 100%;
  /* 這裡就是你要的漸層！ */
  /* 從上方(0% 0%) 的深灰色帶點金，漸變到下方的純黑 */
  background: radial-gradient(
    circle at 50% -20%, 
    #2a2a2a 0%, 
    #111 40%, 
    #000 100%
  );
  /* 如果想要更金一點，可以把 #2a2a2a 改成 #332a00 (暗金色) */
}

/* 2. 噪點層：增加磨砂質感 */
.noise-layer {
  position: absolute;
  top: 0; left: 0; width: 100%; height: 100%;
  opacity: 0.07; /* 淡淡的顆粒感 */
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E");
  pointer-events: none;
}

/* 3. 粒子層：漂浮的灰塵 */
.dust-layer {
  position: absolute;
  top: 0; left: 0; width: 100%; height: 100%;
  background-image: 
    radial-gradient(rgba(255,255,255,0.2) 1px, transparent 1px),
    radial-gradient(rgba(212,175,55,0.2) 1px, transparent 1px);
  background-size: 60px 60px, 40px 40px;
  background-position: 0 0, 20px 20px;
  opacity: 0.3; /* 調亮了一點，確保你看得到 */
  animation: floatDust 40s linear infinite;
}

@keyframes floatDust {
  from { transform: translateY(0); }
  to { transform: translateY(-30px); }
}

/* === 內容層 === */
.page-content {
  position: relative;
  z-index: 1;
  padding-bottom: 80px; /* 避開底部導航 */
}

/* === 過場動畫 === */
.fade-enter-active, .fade-leave-active {
  transition: opacity 0.3s ease;
}
.fade-enter-from, .fade-leave-to {
  opacity: 0;
}
</style>