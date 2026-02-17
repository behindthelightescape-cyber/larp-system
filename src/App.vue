<script setup>
import { ref, onMounted, computed } from 'vue'
import { supabase } from './supabase'

const MOCK_USER_ID = 'U_TEST_JOE_001'
const DEFAULT_AVATAR = 'https://meee.com.tw/D45hJIi.PNG' 

const user = ref({}) 
const coupons = ref([])
const history = ref([])
const loading = ref(true)
const saving = ref(false) 
const currentTab = ref('home')

const showModal = ref(false)
const modalType = ref('') 
const selectedItem = ref(null)

const editForm = ref({ display_name: '', phone: '', birthday: '' })

const fetchData = async () => {
  let { data: userData } = await supabase.from('users').select('*').eq('id', MOCK_USER_ID).single()
  if (userData) {
    user.value = userData
    editForm.value = {
      display_name: userData.display_name || '',
      phone: userData.phone || '',
      birthday: userData.birthday || ''
    }
  }
  let { data: userCoupons } = await supabase.from('coupons').select('*').eq('user_id', MOCK_USER_ID).order('created_at', { ascending: false })
  if (userCoupons) coupons.value = userCoupons
  let { data: records } = await supabase.from('game_participants')
    .select(`id, exp_gained, games ( play_time, gm_name, scripts ( title, cover_url, intro_text, extra_link ) )`)
    .eq('user_id', MOCK_USER_ID).order('created_at', { ascending: false })
  if (records) history.value = records
  loading.value = false
}

const saveProfile = async () => {
  saving.value = true
  const { error } = await supabase.from('users').update({
      display_name: editForm.value.display_name,
      phone: editForm.value.phone,
      birthday: editForm.value.birthday
    }).eq('id', MOCK_USER_ID)
  if (!error) {
    user.value.display_name = editForm.value.display_name
    user.value.phone = editForm.value.phone
    user.value.birthday = editForm.value.birthday
    alert('✅ 資料更新成功')
    currentTab.value = 'home'
  } else {
    alert('❌ 更新失敗')
  }
  saving.value = false
}

const openDetail = (item, type) => {
  selectedItem.value = item
  modalType.value = type
  showModal.value = true
}

const useTicket = () => {
  if(confirm(`確定要使用「${selectedItem.value.title}」嗎？`)) {
    alert('✅ 核銷成功！')
    showModal.value = false
  }
}

const validCoupons = computed(() => coupons.value.filter(c => c.status === 'available'))
const formatDate = (d) => d ? new Date(d).toLocaleDateString('zh-TW') : '無期限'
const daysJoined = computed(() => {
  if (!user.value.created_at) return 1
  const start = new Date(user.value.created_at); const now = new Date();
  return Math.ceil(Math.abs(now - start) / (1000 * 60 * 60 * 24))
})

onMounted(() => { fetchData() })
</script>

<template>
  <div class="luxury-bg"></div>
  
  <div class="app-container">
    
    <div v-if="loading" class="loading-view">
      <div class="gold-loader"></div>
      <p>LOADING...</p>
    </div>

    <div v-else class="content-view">
      
      <div v-if="currentTab === 'home'" class="page-home">
        
        <div class="hero-section">
          <div class="avatar-halo">
            <div class="avatar-border">
              <img :src="user.picture_url || DEFAULT_AVATAR" class="main-avatar" />
            </div>
          </div>
          
          <div class="user-info-center">
            <h1 class="user-name">{{ user.display_name }}</h1>
            <div class="user-id">ID: {{ user.id }}</div>
            <div class="title-badge">{{ user.title || '傳說中的冒險者' }}</div>
          </div>
        </div>

        <div class="dashboard-panel">
          <div class="exp-row">
            <div class="exp-labels">
              <span>LV.{{ user.level }}</span>
              <span>EXP {{ user.total_exp }} / {{ (Math.floor(user.total_exp/1000)+1)*1000 }}</span>
            </div>
            <div class="exp-track">
              <div class="exp-bar" :style="{ width: (user.total_exp % 1000) / 10 + '%' }"></div>
            </div>
          </div>

          <div class="stats-row">
            <div class="stat-item">
              <div class="stat-val">{{ daysJoined }}</div>
              <div class="stat-label">加入天數</div>
            </div>
            <div class="stat-sep"></div>
            <div class="stat-item">
              <div class="stat-val">{{ history.length }}</div>
              <div class="stat-label">冒險次數</div>
            </div>
          </div>
        </div>
      </div>

      <div v-if="currentTab === 'history'" class="page-list">
        <div class="section-header">冒險檔案</div>
        <div class="full-list">
          <div v-for="item in history" :key="item.id" class="list-item" @click="openDetail(item, 'history')">
            <div class="list-content">
              <div class="list-top-row">
                <span class="list-title">{{ item.games.scripts?.title }}</span>
                <span class="list-date">{{ formatDate(item.games.play_time) }}</span>
              </div>
              <div class="list-btm-row">
                <span class="list-gm">GM: {{ item.games.gm_name }}</span>
                <span class="list-exp">+{{ item.exp_gained }} EXP</span>
              </div>
            </div>
            <div class="list-arrow">›</div>
          </div>
          <div v-if="history.length === 0" class="empty-text">暫無紀錄</div>
        </div>
      </div>

      <div v-if="currentTab === 'wallet'" class="page-list">
        <div class="section-header">尊榮禮遇</div>
        <div class="full-list">
          <div v-for="c in validCoupons" :key="c.id" class="ticket-strip" @click="openDetail(c, 'coupon')">
            <div class="strip-icon">🎁</div>
            <div class="strip-info">
              <div class="strip-title">{{ c.title }}</div>
              <div class="strip-date">有效期至 {{ formatDate(c.expiry_date) }}</div>
            </div>
            <div class="strip-action">查看</div>
          </div>
          <div v-if="validCoupons.length === 0" class="empty-text">目前無可用優惠券</div>
        </div>
      </div>

      <div v-if="currentTab === 'settings'" class="page-form">
        <div class="section-header">檔案設定</div>
        <div class="full-form">
          <div class="form-row">
            <label>代號 (暱稱)</label>
            <input type="text" v-model="editForm.display_name" />
          </div>
          <div class="form-row">
            <label>通訊碼 (手機)</label>
            <input type="tel" v-model="editForm.phone" />
          </div>
          <div class="form-row">
            <label>登錄日 (生日)</label>
            <input type="date" v-model="editForm.birthday" />
          </div>
          <div class="form-action-area">
            <button class="gold-btn full-btn" @click="saveProfile" :disabled="saving">
              {{ saving ? 'UPDATING...' : '確認變更' }}
            </button>
          </div>
        </div>
      </div>

    </div>

    <div class="bottom-nav">
      <div class="nav-item" :class="{ active: currentTab === 'home' }" @click="currentTab='home'">
        <svg viewBox="0 0 24 24" class="nav-icon"><path fill="currentColor" d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/></svg>
        <span>首頁</span>
      </div>
      <div class="nav-item" :class="{ active: currentTab === 'history' }" @click="currentTab='history'">
        <svg viewBox="0 0 24 24" class="nav-icon"><path fill="currentColor" d="M13 3c-4.97 0-9 4.03-9 9H1l3.89 3.89.07.14L9 12H6c0-3.87 3.13-7 7-7s7 3.13 7 7-7 7-7 7c-1.93 0-3.68-.79-4.94-2.06l-1.42 1.42C8.27 19.99 10.51 21 13 21c4.97 0 9-4.03 9-9s-4.03-9-9-9zm-1 5v5l4.28 2.54.72-1.21-3.5-2.08V8H12z"/></svg>
        <span>歷程</span>
      </div>
      <div class="nav-item" :class="{ active: currentTab === 'wallet' }" @click="currentTab='wallet'">
        <svg viewBox="0 0 24 24" class="nav-icon"><path fill="currentColor" d="M20 4H4c-1.11 0-1.99.89-1.99 2L2 18c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V6c0-1.11-.89-2-2-2zm0 14H4v-6h16v6zm0-10H4V6h16v2z"/></svg>
        <span>票券</span>
      </div>
      <div class="nav-item" :class="{ active: currentTab === 'settings' }" @click="currentTab='settings'">
        <svg viewBox="0 0 24 24" class="nav-icon"><path fill="currentColor" d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.488.488 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 0 0-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/></svg>
        <span>設定</span>
      </div>
    </div>

    <div v-if="showModal" class="modal-overlay" @click="showModal = false">
      <div class="modal-content" @click.stop>
        
        <div v-if="modalType === 'history'">
          <h3 class="modal-header-title">{{ selectedItem.games.scripts?.title }}</h3>
          <div class="modal-info-grid">
            <div class="info-label">遊玩日期</div><div class="info-val">{{ formatDate(selectedItem.games.play_time) }}</div>
            <div class="info-label">GM</div><div class="info-val">{{ selectedItem.games.gm_name }}</div>
            <div class="info-label">EXP</div><div class="info-val gold-text">+{{ selectedItem.exp_gained }}</div>
          </div>
          <div class="modal-divider"></div>
          <div class="modal-desc">{{ selectedItem.games.scripts?.intro_text || '無詳細介紹' }}</div>
          <a v-if="selectedItem.games.scripts?.extra_link" :href="selectedItem.games.scripts.extra_link" target="_blank" class="gold-outline-btn">🔗 查看回憶連結</a>
        </div>

        <div v-if="modalType === 'coupon'">
          <h3 class="modal-header-title">{{ selectedItem.title }}</h3>
          <div class="modal-info-grid">
            <div class="info-label">狀態</div><div class="info-val gold-text">可使用</div>
            <div class="info-label">期限</div><div class="info-val">{{ formatDate(selectedItem.expiry_date) }}</div>
          </div>
          <div class="modal-divider"></div>
          <div class="modal-desc">{{ selectedItem.description || '憑此券可兌換優惠內容。' }}</div>
          <button class="gold-btn full-btn" @click="useTicket">立即兌換</button>
        </div>

        <button class="modal-close-icon" @click="showModal = false">✕</button>
      </div>
    </div>

  </div>
</template>

<style>
/* === 黑金變數系統 === */
:root {
  --gold-primary: #FFD700;
  --gold-dark: #C5A000;
  --gold-gradient: linear-gradient(135deg, #FFD700 0%, #FDB931 50%, #C5A000 100%);
  --bg-black: #000000;
  --text-white: #ffffff;
  --text-gray: #888888;
  --border-color: rgba(255, 215, 0, 0.2); /* 淡淡的金線 */
}

/* 全局重置 */
body { margin: 0; background: #000; font-family: 'Helvetica Neue', Arial, sans-serif; color: var(--text-white); overflow-x: hidden; }
* { box-sizing: border-box; }

/* 背景 */
.luxury-bg {
  position: fixed; top: 0; left: 0; width: 100%; height: 100%; z-index: -1;
  background: radial-gradient(circle at 50% 20%, #1a1a1a 0%, #000000 100%);
}

/* 🔥 滿版容器設定 (關鍵！) 🔥 */
.app-container { width: 100%; min-height: 100vh; position: relative; }
.content-view { 
  padding: 0; /* 移除左右留白 */
  padding-bottom: 90px; /* 留給底部選單 */
}

/* === 首頁：英雄區 (有留白) === */
.page-home { padding: 0 20px; /* 只有首頁需要左右留白才好看 */ }

.hero-section {
  display: flex; flex-direction: column; align-items: center; margin-top: 30px; margin-bottom: 30px;
}
.avatar-halo {
  position: relative;
  width: clamp(140px, 35vw, 180px); 
  height: clamp(140px, 35vw, 180px);
  border-radius: 50%; padding: 4px;
  background: var(--gold-gradient);
  box-shadow: 0 0 40px rgba(255, 215, 0, 0.3);
}
.avatar-border { width: 100%; height: 100%; background: #000; border-radius: 50%; padding: 4px; overflow: hidden; }
.main-avatar { width: 100%; height: 100%; border-radius: 50%; object-fit: cover; }

.user-info-center { text-align: center; margin-top: 15px; }
.user-name { 
  font-size: clamp(2rem, 6vw, 2.5rem); 
  font-weight: 800; margin: 0; 
  background: var(--gold-gradient); -webkit-background-clip: text; color: transparent;
}
.user-id { font-family: monospace; color: var(--text-gray); font-size: 0.9rem; margin: 5px 0; letter-spacing: 1px; }
.title-badge { 
  display: inline-block; margin-top: 8px; padding: 6px 15px; 
  border: 1px solid var(--gold-primary); color: var(--gold-primary); 
  font-size: 0.85rem; border-radius: 20px; letter-spacing: 1px;
}

/* 儀表板 */
.dashboard-panel {
  background: rgba(20, 20, 20, 0.5);
  border-radius: 16px; padding: 25px; border: 1px solid var(--border-color);
  margin-top: 20px;
}
.exp-row { margin-bottom: 25px; }
.exp-labels { display: flex; justify-content: space-between; color: var(--gold-primary); font-size: 0.9rem; margin-bottom: 8px; font-weight: bold; }
.exp-track { height: 8px; background: #333; border-radius: 4px; overflow: hidden; }
.exp-bar { height: 100%; background: var(--gold-gradient); box-shadow: 0 0 10px var(--gold-primary); }

.stats-row { display: flex; justify-content: space-around; align-items: center; }
.stat-item { text-align: center; }
.stat-val { font-size: clamp(1.8rem, 5vw, 2.2rem); font-weight: bold; color: #fff; }
.stat-label { font-size: 0.85rem; color: var(--text-gray); margin-top: 5px; }
.stat-sep { width: 1px; height: 40px; background: rgba(255,255,255,0.1); }

/* === 列表通用標題 (Sticky Header) === */
.section-header {
  padding: 15px 20px;
  background: rgba(0,0,0,0.9); backdrop-filter: blur(10px);
  position: sticky; top: 0; z-index: 10;
  font-size: 1.2rem; font-weight: bold; color: var(--gold-primary);
  border-bottom: 1px solid #222;
}

/* === 滿版列表樣式 (List Style) === */
.full-list { display: flex; flex-direction: column; }

.list-item {
  display: flex; align-items: center; justify-content: space-between;
  padding: 20px 20px;
  background: #000;
  border-bottom: 1px solid #222; /* 只有下邊線 */
  cursor: pointer; transition: background 0.2s;
}
.list-item:active { background: #111; }

.list-content { flex: 1; min-width: 0; margin-right: 15px; }
.list-top-row { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 6px; }
.list-title { font-size: 1.1rem; color: #fff; font-weight: bold; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 70%; text-align: left; }
.list-date { font-size: 0.8rem; color: var(--text-gray); }

.list-btm-row { display: flex; justify-content: space-between; font-size: 0.9rem; }
.list-gm { color: var(--text-gray); }
.list-exp { color: var(--gold-primary); font-weight: bold; }
.list-arrow { color: #444; font-size: 1.5rem; }

/* === 滿版票券條 (Ticket Strip) === */
.ticket-strip {
  display: flex; align-items: center; padding: 20px;
  border-bottom: 1px solid #222;
  background: #000; cursor: pointer;
}
.ticket-strip:active { background: #111; }
.strip-icon { font-size: 2rem; margin-right: 20px; filter: drop-shadow(0 0 5px var(--gold-primary)); }
.strip-info { flex: 1; min-width: 0; }
.strip-title { font-size: 1.1rem; color: var(--gold-primary); font-weight: bold; margin-bottom: 4px; }
.strip-date { font-size: 0.85rem; color: var(--text-gray); }
.strip-action { 
  padding: 6px 12px; border: 1px solid var(--gold-primary); color: var(--gold-primary); 
  border-radius: 20px; font-size: 0.8rem; 
}

/* === 滿版設定表單 === */
.full-form { padding: 0; }
.form-row { 
  display: flex; align-items: center; justify-content: space-between;
  padding: 20px; border-bottom: 1px solid #222; background: #000;
}
.form-row label { color: var(--text-gray); font-size: 1rem; width: 100px; }
.form-row input { 
  flex: 1; background: transparent; border: none; 
  color: #fff; text-align: right; font-size: 1rem; padding: 5px;
}
.form-row input:focus { outline: none; color: var(--gold-primary); }
.form-action-area { padding: 30px 20px; }

/* === 按鈕 === */
.gold-btn { width: 100%; background: var(--gold-gradient); border: none; padding: 15px; border-radius: 8px; color: #000; font-weight: 800; font-size: 1.1rem; cursor: pointer; }
.gold-btn:disabled { opacity: 0.6; }
.gold-outline-btn { display: block; text-align: center; border: 1px solid var(--gold-primary); color: var(--gold-primary); padding: 12px; border-radius: 8px; text-decoration: none; margin-top: 15px; }

/* === 底部選單 (RWD) === */
.bottom-nav {
  position: fixed; bottom: 0; left: 0; width: 100%; 
  height: clamp(60px, 15vw, 70px);
  background: rgba(10, 10, 10, 0.95); border-top: 1px solid #222;
  display: flex; justify-content: space-around; align-items: center; z-index: 100;
  backdrop-filter: blur(10px);
}
.nav-item {
  flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center;
  color: #555; transition: all 0.3s; cursor: pointer;
}
.nav-icon { width: clamp(24px, 6vw, 28px); height: clamp(24px, 6vw, 28px); margin-bottom: 4px; transition: fill 0.3s; }
.nav-item span { font-size: 0.7rem; }

.nav-item.active { color: var(--gold-primary); }
.nav-item.active .nav-icon { filter: drop-shadow(0 0 5px var(--gold-primary)); }

/* === 彈窗 (Modal) === */
.modal-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.85); z-index: 1000; display: flex; justify-content: center; align-items: center; padding: 20px; }
.modal-content { 
  width: 100%; max-width: 380px; background: #151515; 
  border: 1px solid var(--gold-primary); border-radius: 12px; 
  padding: 25px; position: relative; box-shadow: 0 0 30px rgba(0,0,0,0.8);
}
.modal-header-title { color: var(--gold-primary); margin: 0 0 20px 0; font-size: 1.4rem; text-align: center; border-bottom: 1px solid #333; padding-bottom: 15px; }
.modal-info-grid { display: grid; grid-template-columns: 80px 1fr; gap: 10px; font-size: 0.95rem; }
.info-label { color: var(--text-gray); }
.info-val { color: #fff; }
.gold-text { color: var(--gold-primary); font-weight: bold; }
.modal-divider { height: 1px; background: #333; margin: 20px 0; }
.modal-desc { color: #ccc; line-height: 1.6; font-size: 0.95rem; }
.modal-close-icon { position: absolute; top: 10px; right: 15px; background: none; border: none; color: #666; font-size: 1.5rem; cursor: pointer; }

/* Utility */
.empty-text { text-align: center; color: #666; margin-top: 50px; }
.loading-view { height: 100vh; display: flex; flex-direction: column; justify-content: center; align-items: center; color: var(--gold-primary); }
.gold-loader { width: 40px; height: 40px; border: 3px solid #333; border-top-color: var(--gold-primary); border-radius: 50%; animation: spin 1s linear infinite; margin-bottom: 15px; }
@keyframes spin { to { transform: rotate(360deg); } }
</style>