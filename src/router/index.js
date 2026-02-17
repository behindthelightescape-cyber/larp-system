import { createRouter, createWebHashHistory } from 'vue-router'
import HomeView from '../views/HomeView.vue'
import HistoryView from '../views/HistoryView.vue'
import CouponView from '../views/CouponView.vue'
import SettingsView from '../views/SettingsView.vue'

const router = createRouter({
  history: createWebHashHistory(), // LIFF 建議用 Hash 模式比較不會雷
  routes: [
    { path: '/', component: HomeView },
    { path: '/history', component: HistoryView },
    { path: '/coupons', component: CouponView },
    { path: '/settings', component: SettingsView }
  ]
})

export default router