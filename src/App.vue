<script setup>
import { ref, onMounted, computed } from 'vue'
import { supabase } from './supabase'

// === 1. 資料定義 ===
const MOCK_USER_ID = 'U_TEST_JOE_001'
const DEFAULT_AVATAR = 'https://meee.com.tw/D45hJIi.PNG' 

const user = ref({}) 
const coupons = ref([])
const history = ref([])
const loading = ref(true)
const saving = ref(false) 
const currentTab = ref('home')

// 彈窗控制 (共用一個彈窗組件)
const showModal = ref(false)
const modalType = ref('') // 'history' 或 'coupon'
const selectedItem = ref(null)

const editForm = ref({ display_name: '', phone: '', birthday: '' })

// === 2. 核心邏輯 ===
const fetchData = async () => {
  // 抓使用者
  let { data: userData } = await supabase.from('users').select('*').eq('id', MOCK_USER_ID).single()
  if (userData) {
    user.value = userData
    editForm.value = {
      display_name: userData.display_name || '',
      phone: userData.phone || '',
      birthday: userData.birthday || ''
    }
  }
  // 抓優惠券
  let { data: userCoupons } = await supabase.from('coupons').select('*').eq('user_id', MOCK_USER_ID).order('created_at', { ascending: false })
  if (userCoupons) coupons.value = userCoupons
  // 抓歷程
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
    alert('✅ 設定已更新')
    currentTab.value = 'home'
  } else {
    alert('❌ 更新失敗')
  }
  saving.value = false
}

// 開啟彈窗
const openDetail = (item, type) => {
  selectedItem.value = item
  modalType.value = type
  showModal.value = true
}

const useTicket = () => {
  if(confirm(`確定要使用「${selectedItem.value.title}」嗎？`)) {
    alert('✅ 核銷成功！(模擬)')
    showModal.value = false
  }
}

// 計算屬性
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
  <div class="app-bg"></div>
  
  <div class="app-container">
    
    <div v-if="loading" class="loading-view">讀取資料中...</div>

    <div v-else class="content-view">
      
      <div v-if="currentTab === 'home'" class="page-home">
        <div class="profile-card glass-panel">
          <div class="avatar-row">
            <img :src="user.picture_url || DEFAULT_AVATAR" class="avatar" />
            <div class="avatar-info">
              <div class="user-name">{{ user.display_name }}</div>
              <div class="user-id">ID: {{ user.id }}</div>
              <div class="level-badge">LV.{{ user.level }} | {{ user.title || '新手冒險者' }}</div>
            </div>
          </div>
          
          <div class="exp-bar-box">
            <div class="exp-info">
              <span>EXP</span>
              <span>{{ user.total_exp }} / {{ (Math.floor(user.total_exp/1000)+1)*1000 }}</span>
            </div>
            <div class="exp-track">
              <div class="exp-fill" :style="{ width: (user.total_exp % 1000) / 10 + '%' }"></div>
            </div>
          </div>
        </div>

        <div class="stats-row glass-panel">
          <div class="stat-box">
            <div class="stat-num">{{ daysJoined }}</div>
            <div class="stat-label">加入天數</div>
          </div>
          <div class="stat-line"></div>
          <div class="stat-box">
            <div class="stat-num">{{ history.length }}</div>
            <div class="stat-label">遊玩本數</div>
          </div>
        </div>
      </div>

      <div v-if="currentTab === 'history'" class="page-list">
        <h2 class="page-title">冒險檔案</h2>
        <div class="list-container">
          <div v-for="item in history" :key="item.id" class="list-card glass-panel" @click="openDetail(item, 'history')">
            <div class="list-left">
              <div class="list-date">{{ formatDate(item.games.play_time) }}</div>
              <div class="list-title">{{ item.games.scripts?.title }}</div>
            </div>
            <div class="list-right">
              <div class="exp-gain">+{{ item.exp_gained }} EXP</div>
              <div class="gm-name">GM: {{ item.games.gm_name }}</div>
            </div>
          </div>
          <div v-if="history.length === 0" class="empty-text">尚無遊玩紀錄</div>
        </div>
      </div>

      <div v-if="currentTab === 'wallet'" class="page-list">
        <h2 class="page-title">優惠券</h2>
        <div class="list-container">
          <div v-for="c in validCoupons" :key="c.id" class="ticket-card glass-panel active" @click="openDetail(c, 'coupon')">
            <div class="ticket-icon">🎁</div>
            <div class="ticket-info">
              <div class="ticket-name">{{ c.title }}</div>
              <div class="ticket-date">有效期至：{{ formatDate(c.expiry_date) }}</div>
            </div>
            <div class="ticket-arrow">➜</div>
          </div>
          <div v-if="validCoupons.length === 0" class="empty-text">目前沒有可用的優惠券</div>
        </div>
      </div>

      <div v-if="currentTab === 'settings'" class="page-form">
        <h2 class="page-title">個人設定</h2>
        <div class="form-card glass-panel">
          <div class="input-group">
            <label>顯示名稱</label>
            <input type="text" v-model="editForm.display_name" />
          </div>
          <div class="input-group">
            <label>手機號碼</label>
            <input type="tel" v-model="editForm.phone" />
          </div>
          <div class="input-group">
            <label>生日</label>
            <input type="date" v-model="editForm.birthday" />
          </div>
          <button class="action-btn" @click="saveProfile" :disabled="saving">
            {{ saving ? '儲存中...' : '確認儲存' }}
          </button>
        </div>
      </div>

    </div>

    <div class="bottom-nav">
      <div class="nav-btn" :class="{ active: currentTab === 'home' }" @click="currentTab='home'">🏠<span class="nav-text">首頁</span></div>
      <div class="nav-btn" :class="{ active: currentTab === 'history' }" @click="currentTab='history'">📜<span class="nav-text">歷程</span></div>
      <div class="nav-btn" :class="{ active: currentTab === 'wallet' }" @click="currentTab='wallet'">🎟️<span class="nav-text">優惠券</span></div>
      <div class="nav-btn" :class="{ active: currentTab === 'settings' }" @click="currentTab='settings'">⚙️<span class="nav-text">設定</span></div>
    </div>

    <div v-if="showModal" class="modal-overlay" @click="showModal = false">
      <div class="modal-content glass-panel" @click.stop>
        
        <div v-if="modalType === 'history'">
          <h3 class="modal-title">{{ selectedItem.games.scripts?.title }}</h3>
          <div class="modal-row"><label>遊玩日期：</label><span>{{ formatDate(selectedItem.games.play_time) }}</span></div>
          <div class="modal-row"><label>帶場 GM：</label><span>{{ selectedItem.games.gm_name }}</span></div>
          <div class="modal-row"><label>獲得經驗：</label><span class="highlight">{{ selectedItem.exp_gained }} EXP</span></div>
          <hr class="modal-line">
          <p class="modal-desc">{{ selectedItem.games.scripts?.intro_text || '無詳細介紹' }}</p>
          <a v-if="selectedItem.games.scripts?.extra_link" :href="selectedItem.games.scripts.extra_link" target="_blank" class="modal-link-btn">查看回憶連結</a>
        </div>

        <div v-if="modalType === 'coupon'">
          <h3 class="modal-title">{{ selectedItem.title }}</h3>
          <div class="modal-row"><label>有效期限：</label><span>{{ formatDate(selectedItem.expiry_date) }}</span></div>
          <div class="modal-row"><label>票券狀態：</label><span class="highlight">可使用</span></div>
          <hr class="modal-line">
          <p class="modal-desc">{{ selectedItem.description || '憑此券可兌換優惠內容。' }}</p>
          <button class="action-btn full-width" @click="useTicket">立即兌換</button>
        </div>

        <button class="modal-close" @click="showModal = false">關閉</button>
      </div>
    </div>

  </div>
</template>

<style>
/* === 基礎設定 === */
:root {
  --gold: #ffcc00;
  --dark-bg: #121212;
  --panel-bg: rgba(30, 30, 30, 0.8);
  --text-white: #ffffff;
  --text-gray: #aaaaaa;
}

body { margin: 0; background-color: var(--dark-bg); font-family: sans-serif; color: var(--text-white); }
* { box-sizing: border-box; }

.app-bg {
  position: fixed; top: 0; left: 0; width: 100%; height: 100%; z-index: -1;
  background: linear-gradient(to bottom, #1a1a2e, #000000);
}

.app-container {
  max-width: 600px; margin: 0 auto; min-height: 100vh; position: relative;
}

.content-view { padding: 20px; padding-bottom: 90px; /* 留給底部導航 */ }

/* === 玻璃面板 (Glassmorphism) === */
.glass-panel {
  background: var(--panel-bg);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  padding: 15px;
  margin-bottom: 20px;
  box-shadow: 0 4px 6px rgba(0,0,0,0.3);
}

/* === 首頁樣式 === */
.profile-card { text-align: left; }
.avatar-row { display: flex; align-items: center; gap: 15px; margin-bottom: 15px; }
.avatar { width: 80px; height: 80px; border-radius: 50%; border: 2px solid var(--gold); object-fit: cover; }
.user-name { font-size: 1.5rem; font-weight: bold; color: var(--gold); }
.user-id { font-family: monospace; color: var(--text-gray); font-size: 0.9rem; margin-top: 4px; }
.level-badge { display: inline-block; background: rgba(255, 204, 0, 0.2); color: var(--gold); padding: 4px 10px; border-radius: 20px; font-size: 0.8rem; margin-top: 8px; border: 1px solid var(--gold); }

.exp-bar-box { margin-top: 10px; }
.exp-info { display: flex; justify-content: space-between; font-size: 0.9rem; margin-bottom: 5px; color: var(--text-gray); }
.exp-track { height: 8px; background: rgba(255,255,255,0.1); border-radius: 4px; overflow: hidden; }
.exp-fill { height: 100%; background: var(--gold); transition: width 0.5s; }

.stats-row { display: flex; justify-content: space-around; align-items: center; padding: 20px 0; }
.stat-box { text-align: center; }
.stat-num { font-size: 2rem; font-weight: bold; color: var(--text-white); }
.stat-label { font-size: 0.9rem; color: var(--text-gray); }
.stat-line { width: 1px; height: 40px; background: rgba(255,255,255,0.2); }

/* === 列表樣式 (歷程 & 優惠券) === */
.page-title { margin: 0 0 20px 0; font-size: 1.5rem; border-left: 4px solid var(--gold); padding-left: 10px; }

/* 歷程卡片 */
.list-card { display: flex; justify-content: space-between; align-items: center; cursor: pointer; transition: transform 0.1s; }
.list-card:active { transform: scale(0.98); background: rgba(255,255,255,0.1); }
.list-left { flex: 1; }
.list-date { font-size: 0.85rem; color: var(--text-gray); margin-bottom: 4px; }
.list-title { font-size: 1.1rem; font-weight: bold; color: var(--text-white); }
.list-right { text-align: right; min-width: 80px; }
.exp-gain { color: var(--gold); font-weight: bold; font-size: 1rem; }
.gm-name { font-size: 0.8rem; color: var(--text-gray); }

/* 優惠券卡片 */
.ticket-card { display: flex; align-items: center; cursor: pointer; border-left: 4px solid var(--gold); }
.ticket-icon { font-size: 2rem; margin-right: 15px; }
.ticket-info { flex: 1; }
.ticket-name { font-size: 1.2rem; font-weight: bold; margin-bottom: 5px; }
.ticket-date { font-size: 0.85rem; color: var(--text-gray); }
.ticket-arrow { color: var(--gold); font-size: 1.2rem; }

.empty-text { text-align: center; color: var(--text-gray); margin-top: 50px; }

/* === 設定頁表單 === */
.input-group { margin-bottom: 20px; }
.input-group label { display: block; margin-bottom: 8px; color: var(--text-gray); font-size: 0.9rem; }
.input-group input { width: 100%; padding: 12px; border-radius: 8px; border: 1px solid #444; background: #222; color: #fff; font-size: 1rem; }
.action-btn { width: 100%; padding: 15px; border: none; border-radius: 8px; background: var(--gold); color: #000; font-weight: bold; font-size: 1rem; cursor: pointer; }
.action-btn:disabled { opacity: 0.5; }

/* === 彈窗 (Modal) === */
.modal-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.8); display: flex; justify-content: center; align-items: center; z-index: 9999; padding: 20px; }
.modal-content { width: 100%; max-width: 400px; background: #222; border: 1px solid var(--gold); padding: 25px; }
.modal-title { margin-top: 0; color: var(--gold); font-size: 1.4rem; border-bottom: 1px solid #444; padding-bottom: 10px; margin-bottom: 15px; }
.modal-row { display: flex; justify-content: space-between; margin-bottom: 10px; font-size: 1rem; }
.highlight { color: var(--gold); font-weight: bold; }
.modal-line { border: 0; border-top: 1px dashed #444; margin: 15px 0; }
.modal-desc { color: #ccc; line-height: 1.6; margin-bottom: 20px; }
.modal-link-btn { display: block; text-align: center; color: var(--gold); border: 1px solid var(--gold); padding: 10px; border-radius: 8px; text-decoration: none; margin-bottom: 15px; }
.modal-close { width: 100%; background: #444; color: #fff; border: none; padding: 12px; border-radius: 8px; cursor: pointer; font-size: 1rem; }
.full-width { width: 100%; margin-bottom: 15px; }

/* === 底部導航 === */
.bottom-nav {
  position: fixed; bottom: 0; left: 0; width: 100%; height: 70px;
  background: #1a1a1a; border-top: 1px solid #333;
  display: flex; justify-content: space-around; align-items: center;
  z-index: 100;
}
.nav-btn { display: flex; flex-direction: column; align-items: center; color: #666; cursor: pointer; font-size: 1.5rem; }
.nav-text { font-size: 0.7rem; margin-top: 4px; }
.nav-btn.active { color: var(--gold); }

/* Loading */
.loading-view { height: 100vh; display: flex; justify-content: center; align-items: center; color: var(--gold); }
</style>