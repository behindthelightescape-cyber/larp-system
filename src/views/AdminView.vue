<script setup>
import { ref, onMounted } from 'vue'
import { supabase } from '../supabase'
import MemberManager from '../components/MemberManager.vue'
import CouponManager from '../components/CouponManager.vue'
import GameManager from '../components/GameManager.vue'
import ScriptManager from '../components/ScriptManager.vue' 
import SessionManager from '../components/SessionManager.vue' 
import DataImporter from '../components/DataImporter.vue'

const session = ref(null)
const isLoading = ref(true)
const currentTab = ref('dashboard')
const isSidebarOpen = ref(window.innerWidth > 768) 

const stats = ref({ members: 0, scripts: 0, games: 0, coupons: 0 })
const email = ref('')
const password = ref('')

// 🚀 核心新增：用來裝管理員的權限與管轄場館
const adminProfile = ref({
  role: 'player',
  managed_branch: '載入中...'
})

onMounted(async () => {
  const { data } = await supabase.auth.getSession()
  session.value = data.session

  supabase.auth.onAuthStateChange((_event, _session) => {
    session.value = _session
    if (_session) {
      fetchAdminProfile(_session.user.id) // 登入成功，去查他的權限
    } else {
      adminProfile.value = { role: 'player', managed_branch: '無權限' }
    }
  })

  if (session.value) {
    fetchAdminProfile(session.value.user.id)
  } else {
    isLoading.value = false
  }
})

// 🚀 核心新增：去 users 表查這個管理員歸哪家店管
const fetchAdminProfile = async (userId) => {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('role, managed_branch, display_name')
      .eq('id', userId)
      .single()

    if (data) {
      adminProfile.value = {
        name: data.display_name || 'Admin',
        role: data.role || 'manager', // 預設給個店長
        managed_branch: data.managed_branch || '西門館1.0' // 預設西門館
      }
    }
  } catch (err) {
    console.error('抓取權限失敗:', err)
  } finally {
    loadDashboardStats()
    isLoading.value = false
  }
}

const loginWithEmail = async () => {
  if (!email.value || !password.value) return alert('帳號密碼都沒填，你是想通靈登入嗎？')
  isLoading.value = true // 登入時轉圈圈
  const { error } = await supabase.auth.signInWithPassword({ email: email.value, password: password.value })
  if (error) {
    alert('登入失敗：' + error.message)
    isLoading.value = false
  }
}

const logout = async () => {
  await supabase.auth.signOut()
  session.value = null
}

const loadDashboardStats = async () => {
  try {
    // 🚀 未來這裡可以根據 adminProfile.value.managed_branch 來過濾數據
    // 如果是 ALL 就全抓，如果是 西門館2.0 就只抓 2.0 的數據
    const { count: usersCount } = await supabase.from('users').select('*', { count: 'exact', head: true })
    stats.value.members = usersCount || 0
    const { count: scriptsCount } = await supabase.from('scripts').select('*', { count: 'exact', head: true })
    stats.value.scripts = scriptsCount || 0
    const { count: gamesCount } = await supabase.from('games').select('*', { count: 'exact', head: true })
    stats.value.games = gamesCount || 0
    const { count: couponsCount } = await supabase.from('coupons').select('*', { count: 'exact', head: true }).eq('status', 'available')
    stats.value.coupons = couponsCount || 0
  } catch (error) {
    console.error("小四警告：抓不到數據啦！", error)
  }
}

const changeTab = (tabName) => {
  currentTab.value = tabName
  if (window.innerWidth <= 768) {
    isSidebarOpen.value = false
  }
}
</script>

<template>
  <div v-if="isLoading" class="admin-layout center-content">
    <div class="spinner"></div>
    <h2 style="color: #D4AF37; margin-top: 20px;">權限驗證與連線中...</h2>
  </div>

  <div v-else-if="!session" class="admin-layout center-content">
    <form @submit.prevent="loginWithEmail" class="login-box">
      <h1 style="color: #D4AF37; text-align: center;">劇光燈中控台</h1>
      <p style="text-align: center; color: #888;">請輸入管理員權限憑證</p>
      <div style="width: 100%; margin-bottom: 20px; margin-top: 20px;">
        <input v-model="email" type="email" placeholder="管理員 Email" class="admin-input" autocomplete="username" required />
        <input v-model="password" type="password" placeholder="登入密碼" class="admin-input" style="margin-top: 15px;" autocomplete="current-password" required />
      </div>
      <button type="submit" class="btn btn-gold">🔐 確認登入</button>
    </form>
  </div>

  <div v-else class="admin-wrapper">
    <div v-if="isSidebarOpen" class="sidebar-overlay" @click="isSidebarOpen = false"></div>

    <aside class="sidebar" :class="{ 'collapsed': !isSidebarOpen }">
      <div class="sidebar-header">
        <h2 class="brand-title">劇光燈 LARP</h2>
        <button class="mobile-close-btn" @click="isSidebarOpen = false">✕</button>
      </div>

      <nav class="side-nav">
        <button class="nav-btn" :class="{ active: currentTab === 'dashboard' }" @click="changeTab('dashboard')">
          <span class="icon">📊</span> 戰情大盤
        </button>
        <button class="nav-btn" :class="{ active: currentTab === 'game' }" @click="changeTab('game')">
          <span class="icon">⚡</span> 批次開場
        </button>
        <button class="nav-btn" :class="{ active: currentTab === 'session' }" @click="changeTab('session')">
          <span class="icon">📅</span> 場次大廳
        </button>
        <button class="nav-btn" :class="{ active: currentTab === 'member' }" @click="changeTab('member')">
          <span class="icon">👥</span> 會員查詢
        </button>
        <button class="nav-btn" :class="{ active: currentTab === 'coupon' }" @click="changeTab('coupon')">
          <span class="icon">🎟️</span> 票券發送
        </button>
        <button class="nav-btn" :class="{ active: currentTab === 'script' }" @click="changeTab('script')">
          <span class="icon">📜</span> 劇本管理
        </button>
      </nav>

      <div class="sidebar-footer">
        <div class="admin-profile">
          <div class="admin-avatar">👑</div>
          <div class="admin-info">
            <span class="admin-name">{{ adminProfile.name }} ({{ adminProfile.role === 'admin' ? '系統總管' : '店長' }})</span>
            <span class="admin-email">{{ session.user.email }}</span>
            <span style="color: #D4AF37; font-size: 0.8rem; margin-top: 4px; font-weight: bold;">
              📍 管轄: {{ adminProfile.managed_branch === 'ALL' ? '全部場館 (上帝視角)' : adminProfile.managed_branch }}
            </span>
          </div>
        </div>
        <button class="btn btn-red btn-small" @click="logout" style="width: 100%;">登出系統</button>
      </div>
    </aside>

    <main class="main-content">
      <header class="top-header">
        <div style="display: flex; align-items: center; gap: 15px;">
          <button class="menu-toggle-btn" @click="isSidebarOpen = !isSidebarOpen">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M3 12h18M3 6h18M3 18h18" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
          <h2 class="page-title">
            {{ 
              currentTab === 'dashboard' ? '戰情大盤' : 
              currentTab === 'session' ? '場次大廳 (掃碼監控)' :  
              currentTab === 'member' ? '玩家總部 (資料查詢)' : 
              currentTab === 'coupon' ? '發送票券 (導彈系統)' : 
              currentTab === 'game' ? '批次開場' : '劇本管理' 
            }}
          </h2>
        </div>
      </header>

      <div v-show="currentTab === 'dashboard'" class="panel active">
        <div class="big-stat-grid">
          <div class="dash-stat-card"><div class="dash-stat-label">總召喚師</div><div class="dash-stat-number">{{ stats.members }}</div></div>
          <div class="dash-stat-card"><div class="dash-stat-label">現存劇本</div><div class="dash-stat-number">{{ stats.scripts }}</div></div>
          <div class="dash-stat-card"><div class="dash-stat-label">累計開場</div><div class="dash-stat-number">{{ stats.games }}</div></div>
          <div class="dash-stat-card"><div class="dash-stat-label">流通票券</div><div class="dash-stat-number">{{ stats.coupons }}</div></div>
        </div>
        <button class="btn btn-gold" style="width: 200px;" @click="loadDashboardStats">🔄 手動更新數據</button>
        <hr style="border-color: #222; margin: 40px 0;">
        <DataImporter @update-stats="loadDashboardStats" />
      </div>

      <div v-show="currentTab === 'member'" class="panel active">
        <MemberManager />
      </div>

      <div v-show="currentTab === 'coupon'" class="panel active">
        <CouponManager @update-stats="loadDashboardStats" />
      </div>

      <div v-show="currentTab === 'session'" class="panel active">
        <SessionManager :branch="adminProfile.managed_branch" />
      </div>

      <div v-show="currentTab === 'game'" class="panel active">
        <GameManager :branch="adminProfile.managed_branch" @update-stats="loadDashboardStats" />
      </div>

      <div v-show="currentTab === 'script'" class="panel active">
        <ScriptManager @update-stats="loadDashboardStats" />
      </div>
    </main>
  </div>
</template>

<style scoped>
/* 原本的 CSS 完全不變，保留你的完美排版 */
.admin-layout { position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; z-index: 9999; background-color: #050505; color: white; font-family: 'Segoe UI', sans-serif; }
.center-content { display: flex; flex-direction: column; justify-content: center; align-items: center; }
.login-box { border: 1px solid #333; width: 100%; max-width: 380px; padding: 40px; border-radius: 12px; background: #111; box-shadow: 0 10px 30px rgba(0,0,0,0.8); }
.admin-input { width: 100%; padding: 14px; background: #222; border: 1px solid #444; color: white; border-radius: 8px; box-sizing: border-box; font-size: 1rem; transition: border 0.3s; }
.admin-input:focus { border-color: #D4AF37; outline: none; }
.admin-wrapper { position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; z-index: 9999; display: flex; background-color: #0a0a0a; color: white; overflow: hidden; }
.sidebar { width: 260px; background-color: #111; border-right: 1px solid #222; display: flex; flex-direction: column; flex-shrink: 0; transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); z-index: 1000; }
.sidebar.collapsed { margin-left: -260px; }
.sidebar-header { padding: 25px 20px; border-bottom: 1px solid #222; display: flex; align-items: center; justify-content: space-between; }
.brand-title { color: #D4AF37; margin: 0; font-size: 1.2rem; font-weight: 800; letter-spacing: 1px; }
.mobile-close-btn { display: none; background: transparent; border: none; color: #888; font-size: 1.5rem; cursor: pointer; }
.side-nav { flex: 1; padding: 20px 15px; display: flex; flex-direction: column; gap: 8px; overflow-y: auto; }
.nav-btn { background: transparent; border: none; color: #888; text-align: left; padding: 12px 15px; border-radius: 8px; font-size: 1rem; cursor: pointer; transition: all 0.2s; display: flex; align-items: center; }
.nav-btn .icon { margin-right: 12px; font-size: 1.1rem; }
.nav-btn:hover { background: #1a1a1a; color: #ddd; }
.nav-btn.active { background: rgba(212, 175, 55, 0.1); color: #D4AF37; border-right: 3px solid #D4AF37; border-radius: 8px 0 0 8px; }
.sidebar-footer { padding: 20px; border-top: 1px solid #222; background: #0c0c0c; }
.admin-profile { display: flex; align-items: center; margin-bottom: 15px; }
.admin-avatar { width: 40px; height: 40px; background: #222; border: 1px solid #D4AF37; border-radius: 50%; display: flex; justify-content: center; align-items: center; font-size: 1.2rem; margin-right: 12px; }
.admin-info { display: flex; flex-direction: column; overflow: hidden; }
.admin-name { font-weight: bold; font-size: 0.9rem; }
.admin-email { color: #666; font-size: 0.75rem; white-space: nowrap; text-overflow: ellipsis; overflow: hidden; }
.main-content { flex: 1; display: flex; flex-direction: column; overflow-y: auto; transition: all 0.3s ease; min-width: 0; }
.top-header { padding: 20px 30px; border-bottom: 1px solid #222; background: #0a0a0a; position: sticky; top: 0; z-index: 10; display: flex; align-items: center; }
.menu-toggle-btn { background: #1a1a1a; border: 1px solid #333; color: #D4AF37; padding: 8px; border-radius: 6px; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: 0.2s; }
.menu-toggle-btn:hover { background: #222; border-color: #D4AF37; }
.page-title { margin: 0; font-size: 1.5rem; color: #eee; }
.panel { padding: 30px; }
.big-stat-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 20px; margin-bottom: 30px; }
.dash-stat-card { background: linear-gradient(145deg, #151515, #111); border: 1px solid #222; border-top: 2px solid #D4AF37; padding: 25px; border-radius: 12px; box-shadow: 0 4px 15px rgba(0,0,0,0.3); }
.dash-stat-number { font-size: 3.5rem; font-weight: 900; color: #fff; margin: 10px 0; }
.dash-stat-label { color: #D4AF37; font-weight: bold; font-size: 0.9rem; letter-spacing: 1px; }
.btn { padding: 12px 20px; border: none; font-weight: bold; border-radius: 8px; cursor: pointer; transition: 0.2s; }
.btn-gold { background: #D4AF37; color: black; width: 100%; }
.btn-gold:hover { background: #e5c358; }
.btn-red { background: #331111; color: #ff5555; border: 1px solid #552222; }
.btn-red:hover { background: #ff5555; color: white; }
.btn-small { padding: 8px 12px; font-size: 0.85rem; }
.spinner { width: 40px; height: 40px; border: 4px solid rgba(212, 175, 55, 0.2); border-top-color: #D4AF37; border-radius: 50%; animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
@media (max-width: 768px) {
  .sidebar { position: fixed; left: 0; top: 0; height: 100%; box-shadow: 10px 0 30px rgba(0,0,0,0.8); }
  .sidebar.collapsed { transform: translateX(-100%); margin-left: 0; }
  .mobile-close-btn { display: block; }
  .panel { padding: 15px; }
  .top-header { padding: 15px 20px; }
  .page-title { font-size: 1.2rem; }
}
.sidebar-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.6); backdrop-filter: blur(2px); z-index: 999; }
</style>