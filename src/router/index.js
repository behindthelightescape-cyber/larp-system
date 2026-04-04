import { createRouter, createWebHashHistory } from 'vue-router'
import HomeView from '../views/HomeView.vue'
import HistoryView from '../views/HistoryView.vue'
import CouponView from '../views/CouponView.vue'
import SettingsView from '../views/SettingsView.vue'
import AdminView from '../views/AdminView.vue' 
import AchievementsView from '../views/AchievementsView.vue'
import PaperDollView from '../views/PaperDollView.vue'
import PointsView from '../views/PointsView.vue'

const router = createRouter({
  history: createWebHashHistory(), // LIFF 建議用 Hash 模式比較不會雷
  routes: [
    { path: '/', component: HomeView },
    { path: '/history', component: HistoryView },
    { path: '/coupons', component: CouponView },
    { path: '/settings', component: SettingsView },
   {
      path: '/achievements',
      name: 'achievements',
      component: AchievementsView
    },
    // 🚀 小四特製：加上管理後台的秘密通道
    { path: '/admin', component: AdminView },
    // 造型室素材準備中，暫時封鎖 (重新開放時改回 component: PaperDollView)
    { path: '/paperdoll', redirect: '/' },
    // 點數取得機制尚未定案，暫時封鎖 (重新開放時改回 component: PointsView)
    { path: '/points', redirect: '/' },
    
    // === 互動裝置 ===
    { path: '/display', component: () => import('../views/display/DisplayView.vue'), meta: { hideNav: true } },
    { path: '/scan',    component: () => import('../views/display/ScanView.vue'),    meta: { hideNav: true } },

    // 🚀 四哥除錯神丹：攔截所有 LINE 帶來的奇怪網址，強制把玩家踢回首頁！
    { path: '/:pathMatch(.*)*', redirect: '/' }
  ]
})

export default router