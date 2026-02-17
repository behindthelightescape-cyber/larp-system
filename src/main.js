import { createApp } from 'vue'
import './style.css' // 如果你有裝 Tailwind 的話會有這行，沒有就不用管
import App from './App.vue'
import router from './router' // 引入我們剛剛寫的路由器
import { createPinia } from 'pinia' // 引入狀態管理器 (鳳梨酥)

const app = createApp(App)

// 順序很重要！先掛載，再 Mount
app.use(createPinia()) // 1. 告訴 Vue 我們要用 Pinia
app.use(router)        // 2. 告訴 Vue 我們要用 Router

app.mount('#app')      // 3. 啟動引擎