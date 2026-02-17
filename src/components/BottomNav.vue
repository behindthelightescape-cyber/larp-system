<script setup>
// 無需邏輯，純視覺輸出
</script>

<template>
  <nav class="bottom-nav">
    <router-link to="/" class="nav-item">
      <svg class="icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M3 9.75L12 3L21 9.75V21H15V15H9V21H3V9.75Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      <span class="label">首頁</span>
    </router-link>

    <router-link to="/history" class="nav-item">
      <svg class="icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M12 6V12L16 14" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      <span class="label">歷程</span>
    </router-link>

    <router-link to="/coupons" class="nav-item">
      <svg class="icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M2 10V6C2 4.89543 2.89543 4 4 4H20C21.1046 4 22 4.89543 22 6V10C20.8954 10 20 10.8954 20 12C20 13.1046 20.8954 14 22 14V18C22 19.1046 21.1046 20 20 20H4C2.89543 20 2 19.1046 2 18V14C3.10457 14 4 13.1046 4 12C4 10.8954 3.10457 10 2 10Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      <span class="label">票券</span>
    </router-link>

    <router-link to="/settings" class="nav-item">
      <svg class="icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 15C13.6569 15 15 13.6569 15 12C15 10.3431 13.6569 9 12 9C10.3431 9 9 10.3431 9 12C9 13.6569 10.3431 15 12 15Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M19.4 15C20.1 14.3 20.6 13.3 20.9 12.3L21.8 11.9C22.4 11.7 22.8 11.1 22.8 10.5C22.8 10.1 22.6 9.7 22.3 9.4C22 9.1 21.6 8.9 21.2 8.9L20.3 8.5C20 7.5 19.5 6.5 18.8 5.6L19.2 4.7C19.4 4.1 19.3 3.5 18.9 3.1C18.5 2.7 17.9 2.5 17.3 2.7L16.4 3.1C15.5 2.6 14.5 2.1 13.5 1.8L13.1 0.9C12.9 0.4 12.4 0 11.9 0C11.3 0 10.8 0.3 10.6 0.8L10.2 1.7C9.2 2 8.2 2.5 7.3 3L6.4 2.6C5.8 2.4 5.2 2.6 4.8 3C4.4 3.4 4.3 4 4.5 4.6L4.9 5.5C4.2 6.4 3.7 7.4 3.4 8.4L2.5 8.8C1.9 9 1.5 9.5 1.5 10.1C1.5 10.7 1.8 11.2 2.2 11.5L3.1 11.9C3.4 12.9 3.9 13.9 4.6 14.8L4.2 15.7C4 16.3 4.1 16.9 4.5 17.3C4.9 17.7 5.5 17.9 6.1 17.7L7 17.3C7.9 17.8 8.9 18.3 9.9 18.6L10.3 19.5C10.5 20 11 20.4 11.5 20.4C12.1 20.4 12.6 20.1 12.8 19.6L13.2 18.7C14.2 18.4 15.2 17.9 16.1 17.4L17 17.8C17.6 18 18.2 17.8 18.6 17.4C19 17 19.1 16.4 18.9 15.8L19.4 15ZM12 13C11.4 13 11 12.6 11 12C11 11.4 11.4 11 12 11C12.6 11 13 11.4 13 12C13 12.6 12.6 13 12 13Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      <span class="label">設定</span>
    </router-link>
  </nav>
</template>

<style scoped>
.bottom-nav {
  position: fixed;
  bottom: 0;
  left: 0;
  width: 100%;
  height: 70px; /* 稍微加高一點，比較大氣 */
  background-color: #000000; /* 極致黑 */
  border-top: 1px solid #1f1f1f; /* 很淡的分隔線 */
  display: flex;
  justify-content: space-around;
  align-items: center;
  z-index: 100;
  padding-bottom: env(safe-area-inset-bottom);
  box-shadow: 0 -5px 20px rgba(0,0,0,0.9); /* 上方陰影，讓它浮起來 */
}

.nav-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-decoration: none;
  color: #444; /* 未選中：很深的灰色，幾乎隱形但看得到 */
  width: 100%;
  height: 100%;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); /* 高級的過渡動畫 */
  position: relative;
}

.icon {
  width: 24px;
  height: 24px;
  margin-bottom: 4px;
  transition: transform 0.2s;
}

.label {
  font-size: 0.7rem;
  font-weight: 500;
  letter-spacing: 0.5px;
}

/* === 選中狀態 (Active) === */
.nav-item.router-link-active {
  color: #FFFFFF; /* 選中變純白 (Black & White Theme) */
}

/* 如果你想要一點點劇光燈的金，可以把上面的 #FFFFFF 改成 #D4AF37 */

.nav-item.router-link-active .icon {
  transform: translateY(-2px); /* 選中時微微上浮 */
  stroke-width: 2.5; /* 線條變粗 */
  filter: drop-shadow(0 0 8px rgba(255, 255, 255, 0.5)); /* 白色光暈 */
}
</style>