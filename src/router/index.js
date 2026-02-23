import { createRouter, createWebHashHistory } from 'vue-router'
import HomeView from '../views/HomeView.vue'
import HistoryView from '../views/HistoryView.vue'
import CouponView from '../views/CouponView.vue'
import SettingsView from '../views/SettingsView.vue'
import AdminView from '../views/AdminView.vue' // 這裡你已經乖乖引入了，很好！

const router = createRouter({
  history: createWebHashHistory(), // LIFF 建議用 Hash 模式比較不會雷
  routes: [
    { path: '/', component: HomeView },
    { path: '/history', component: HistoryView },
    { path: '/coupons', component: CouponView },
    { path: '/settings', component: SettingsView },
    // 🚀 小四特製：加上管理後台的秘密通道
    { path: '/admin', component: AdminView }
  ]
})

export default router