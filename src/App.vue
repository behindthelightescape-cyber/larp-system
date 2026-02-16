<script setup>
import { ref, onMounted, computed } from 'vue'
import { supabase } from './supabase'

// --- 資料設定 ---
const MOCK_USER_ID = 'U_TEST_JOE_001'
const DEFAULT_AVATAR = 'https://meee.com.tw/D45hJIi.PNG' 
const DEFAULT_COVER = 'https://meee.com.tw/VInVFKh.PNG'   

// --- 狀態變數 ---
const user = ref({}) 
const coupons = ref([])
const history = ref([])
const loading = ref(true)
const saving = ref(false) 
const currentTab = ref('home')
const expandedRecordId = ref(null) 

// 🔥 票券展開狀態控制
const expandedTicketId = ref(null)

const editForm = ref({ display_name: '', phone: '', birthday: '' })

// --- API 資料獲取 ---
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
    alert('✅ 資料更新成功！')
    currentTab.value = 'home'
  }
  saving.value = false
}

const toggleRecord = (id) => { expandedRecordId.value = expandedRecordId.value === id ? null : id }

// 🔥 票券折疊邏輯：跟冒險檔案一模一樣
const toggleTicket = (id) => {
  if (expandedTicketId.value === id) {
    expandedTicketId.value = null // 收合
  } else {
    expandedTicketId.value = id // 展開
  }
}

const useTicket = (c) => {
  if(confirm(`確定要核銷使用「${c.title}」嗎？`)) {
    alert('✅ 票券已核銷！')
    expandedTicketId.value = null // 核銷後自動收合
  }
}

// --- Computed & Helpers ---
const validCoupons = computed(() => coupons.value.filter(c => c.status === 'available'))
const historyCoupons = computed(() => coupons.value.filter(c => c.status !== 'available'))
const formatDate = (d) => d ? new Date(d).toLocaleDateString('zh-TW') : '無期限'
const daysJoined = computed(() => {
  if (!user.value.created_at) return 1
  const start = new Date(user.value.created_at); const now = new Date();
  return Math.ceil(Math.abs(now - start) / (1000 * 60 * 60 * 24))
})

onMounted(() => { fetchData() })
</script>

<template>
  <div class="bg-layer"></div>

  <div class="app-wrapper">
    <div class="app-container">
      
      <div v-if="loading" class="loading-screen">
        <div class="loader"></div><p>系統連線中...</p>
      </div>

      <div v-else class="content-area">
        <transition name="fade" mode="out-in">
          
          <div v-if="currentTab === 'home'" key="home" class="tab-page home-layout">
            <div class="top-logo-container">
               <img src="https://meee.com.tw/VInVFKh.PNG" alt="Brand Logo" class="top-logo" />
            </div>
            <div class="character-section">
              <div class="character-stage">
                <div class="avatar-wrapper">
                  <img :src="user.picture_url || DEFAULT_AVATAR" class="main-avatar" />
                </div>
              </div>
              <div class="character-info">
                <div class="name-row">
                  <span class="level-tag">LV.{{ user.level }}</span>
                  <h1 class="display-name">{{ user.display_name }}</h1>
                </div>
                <p class="member-id">ID: {{ user.id }}</p>
                <div class="title-badge"><span class="title-text">✨ 傳說中的劇本殺手 ✨</span></div>
                <div class="exp-container">
                  <div class="exp-text"><span>EXP</span><span>{{ user.total_exp }} / {{ (Math.floor(user.total_exp/1000)+1)*1000 }}</span></div>
                  <div class="progress-track"><div class="progress-bar" :style="{ width: (user.total_exp % 1000) / 10 + '%' }"></div></div>
                </div>
              </div>
            </div>
            <div class="section-separator"><div class="line"></div><div class="diamond"></div><div class="line"></div></div>
            <div class="stats-grid heavy-glass">
              <div class="stat-item"><span class="stat-val">{{ daysJoined }}</span><span class="stat-label">加入天數</span></div>
              <div class="stat-divider"></div>
              <div class="stat-item"><span class="stat-val">{{ history.length }}</span><span class="stat-label">劇本數量</span></div>
              <div class="stat-divider"></div>
              <div class="stat-item"><span class="stat-val">{{ validCoupons.length }}</span><span class="stat-label">持有票券</span></div>
            </div>
          </div>

          <div v-else-if="currentTab === 'settings'" key="settings" class="tab-page">
            <h2 class="page-title">個人設定 <small>PROFILE</small></h2>
            <div class="settings-form heavy-glass">
              <div class="form-group"><label>玩家暱稱</label><input v-model="editForm.display_name" type="text" /></div>
              <div class="form-group"><label>手機號碼</label><input v-model="editForm.phone" type="tel" /></div>
              <div class="form-group"><label>生日</label><input v-model="editForm.birthday" type="date" /><p class="hint">⚠️ 生日填寫後將無法隨意更改</p></div>
              <button class="save-btn" @click="saveProfile" :disabled="saving">{{ saving ? '儲存中...' : '確認修改' }}</button>
            </div>
          </div>

          <div v-else-if="currentTab === 'history'" key="history" class="tab-page">
            <h2 class="page-title">冒險檔案 <small>HISTORY</small></h2>
            <div class="timeline">
              <div v-for="record in history" :key="record.id" class="timeline-row">
                <div class="time-col">
                  <span class="date">{{ formatDate(record.games.play_time).split('/')[1] }}/{{ formatDate(record.games.play_time).split('/')[2] }}</span>
                  <span class="year">{{ formatDate(record.games.play_time).split('/')[0] }}</span>
                </div>
                <div class="line-col"><div class="dot"></div><div class="line"></div></div>
                <div class="info-col">
                  <div class="history-card heavy-glass" :class="{ expanded: expandedRecordId === record.id }" @click="toggleRecord(record.id)">
                    <div class="card-main">
                      <div class="thumb-col"><img :src="record.games.scripts?.cover_url || DEFAULT_COVER" class="script-thumb" /></div>
                      <div class="card-info-content">
                        <h3 class="script-title">{{ record.games.scripts?.title }}</h3>
                        <div class="gm-row"><span class="gm-label">GM:</span><span class="gm-value">{{ record.games.gm_name }}</span></div>
                        <div class="exp-row"><span class="exp-badge">+{{ record.exp_gained }} EXP</span></div>
                      </div>
                    </div>
                    <div v-if="expandedRecordId === record.id" class="card-details">
                      <div v-if="record.games.scripts?.intro_text" class="detail-quote">"{{ record.games.scripts.intro_text }}"</div>
                      <a v-if="record.games.scripts?.extra_link" :href="record.games.scripts.extra_link" target="_blank" class="detail-link-btn">🔗 查看回憶/連結</a>
                      <p v-if="!record.games.scripts?.intro_text && !record.games.scripts?.extra_link" class="detail-empty">本次冒險暫無額外紀錄</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div v-if="history.length===0" class="empty-state">尚無冒險紀錄</div>
          </div>

          <div v-else-if="currentTab === 'wallet'" key="wallet" class="tab-page">
            <h2 class="page-title">隨身票夾 <small>WALLET</small></h2>
            <div class="ticket-list">
              
              <div 
                v-for="c in validCoupons" 
                :key="c.id" 
                class="new-ticket active" 
                :class="{ 'is-expanded': expandedTicketId === c.id }"
                @click="toggleTicket(c.id)"
              >
                <div class="ticket-main-row">
                  <div class="ticket-left">
                    <div class="ticket-title">{{ c.title }}</div>
                    <div class="ticket-date">有效期至 {{ formatDate(c.expiry_date) }}</div>
                  </div>
                  
                  <div class="ticket-split"></div>
                  
                  <div class="ticket-right">
                    <span class="expand-icon">{{ expandedTicketId === c.id ? '▲' : '▼' }}</span>
                    <span class="click-text">{{ expandedTicketId === c.id ? 'CLOSE' : 'OPEN' }}</span>
                  </div>
                </div>

                <div v-if="expandedTicketId === c.id" class="ticket-expanded-area">
                  <div class="ticket-desc-box">
                    <p class="desc-title">詳細說明</p>
                    <p class="desc-content">{{ c.description }}</p>
                    <p class="ticket-id-tag">ID: {{ c.id.split('-')[0] }}</p>
                  </div>
                  <button class="confirm-use-btn" @click.stop="useTicket(c)">立即核銷使用</button>
                </div>

                <div class="notch notch-top"></div><div class="notch notch-bottom"></div>
              </div>

              <div v-if="historyCoupons.length > 0" class="divider">歷史紀錄</div>
              
              <div v-for="c in historyCoupons" :key="c.id" class="new-ticket used">
                 <div class="ticket-main-row">
                   <div class="ticket-left">
                    <div class="ticket-title">{{ c.title }}</div>
                    <div class="ticket-desc-short">{{ c.status === 'used' ? '已核銷兌換' : '票券已過期' }}</div>
                  </div>
                  <div class="ticket-split"></div>
                  <div class="ticket-right">
                    <span class="status-text">{{ c.status === 'used' ? 'USED' : 'EXP' }}</span>
                  </div>
                </div>
                <div class="notch notch-top"></div><div class="notch notch-bottom"></div>
              </div>

            </div>
          </div>
        </transition>
        
        <div class="version-tag">System V8.2</div>
      </div>

      <div class="bottom-nav-glass">
        <div class="nav-item" :class="{ active: currentTab === 'home' }" @click="currentTab='home'">
          <svg viewBox="0 0 24 24" class="nav-icon"><path fill="currentColor" d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/></svg>
        </div>
        <div class="nav-item" :class="{ active: currentTab === 'history' }" @click="currentTab='history'">
          <svg viewBox="0 0 24 24" class="nav-icon"><path fill="currentColor" d="M13 3c-4.97 0-9 4.03-9 9H1l3.89 3.89.07.14L9 12H6c0-3.87 3.13-7 7-7s7 3.13 7 7-7 7-7 7c-1.93 0-3.68-.79-4.94-2.06l-1.42 1.42C8.27 19.99 10.51 21 13 21c4.97 0 9-4.03 9-9s-4.03-9-9-9zm-1 5v5l4.28 2.54.72-1.21-3.5-2.08V8H12z"/></svg>
        </div>
        <div class="nav-item" :class="{ active: currentTab === 'wallet' }" @click="currentTab='wallet'">
          <svg viewBox="0 0 24 24" class="nav-icon"><path fill="currentColor" d="M20 4H4c-1.11 0-1.99.89-1.99 2L2 18c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V6c0-1.11-.89-2-2-2zm0 14H4v-6h16v6zm0-10H4V6h16v2z"/></svg>
          <span v-if="validCoupons.length" class="badge"></span>
        </div>
        <div class="nav-item" :class="{ active: currentTab === 'settings' }" @click="currentTab='settings'">
          <svg viewBox="0 0 24 24" class="nav-icon"><path fill="currentColor" d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.488.488 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 0 0-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/></svg>
        </div>
      </div>

    </div>
  </div>
</template>

<style>
/* =========================================
   全流體響應式核心設定 (Fluid Core)
   ========================================= */
:root {
  --primary: #ffd700;
  --bg-dark: #0f0f13;
  --glass-border: rgba(255, 255, 255, 0.15);
  --text-main: #ffffff;
  --card-width: 600px;
  
  --space-xs: clamp(4px, 1vw, 8px);
  --space-sm: clamp(8px, 2vw, 12px);
  --space-md: clamp(12px, 4vw, 20px);
  --space-lg: clamp(20px, 6vw, 35px);
  --space-xl: clamp(30px, 8vw, 50px);
}

* { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }

body { 
  margin: 0; background: #000; font-family: 'Helvetica Neue', Arial, sans-serif; 
  overflow-x: hidden; color: #fff; background-color: var(--bg-dark);
}
.bg-layer {
  position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; z-index: 0;
  background: url('https://images.unsplash.com/photo-1519608487953-e999c86e7455?q=80&w=1000&auto=format&fit=crop');
  background-size: cover; background-position: center; filter: brightness(0.4) blur(3px);
}
.app-wrapper { display: flex; justify-content: center; min-height: 100vh; }
.app-container {
  width: 100%; max-width: var(--card-width); position: relative; z-index: 1;
  display: flex; flex-direction: column; min-height: 100vh;
  box-shadow: 0 0 50px rgba(0,0,0,0.8); background: rgba(0,0,0,0.4); overflow-x: hidden;
}
.content-area { flex: 1; overflow-y: auto; padding: var(--space-md); padding-bottom: 120px; }
.heavy-glass {
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.1) 0%, rgba(255, 255, 255, 0.02) 100%);
  backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.2); box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.5); border-radius: 16px;
}

/* Home & UI Components */
.top-logo-container { text-align: center; margin-bottom: var(--space-md); margin-top: -20px; }
.top-logo { width: clamp(100px, 30vw, 150px); height: auto; filter: drop-shadow(0 0 15px rgba(255, 215, 0, 0.3)); }
.character-section { display: flex; flex-direction: column; align-items: center; }
.avatar-wrapper { 
  width: clamp(100px, 35vw, 160px); height: clamp(100px, 35vw, 160px); border-radius: 50%; 
  border: 3px solid rgba(255, 215, 0, 0.5); padding: 5px; background: rgba(0,0,0,0.3); backdrop-filter: blur(5px);
  margin-bottom: var(--space-md);
}
.main-avatar { width: 100%; height: 100%; border-radius: 50%; object-fit: cover; }
.character-info { text-align: center; width: 100%; }
.name-row { display: flex; align-items: center; justify-content: center; gap: 8px; margin-bottom: 8px; flex-wrap: wrap; }
.display-name { font-size: clamp(1.5rem, 6vw, 2.2rem); font-weight: 800; color: #fff; margin: 0; line-height: 1.2; }
.level-tag { background: var(--primary); color: #000; font-weight: 900; font-size: clamp(0.7rem, 2.5vw, 0.9rem); padding: 3px 8px; border-radius: 6px; flex-shrink: 0; }
.member-id { font-family: monospace; color: rgba(255, 255, 255, 0.5); font-size: clamp(0.75rem, 3vw, 0.9rem); margin: 0 0 var(--space-md) 0; letter-spacing: 1px; }
.title-badge { margin-bottom: var(--space-lg); }
.title-text { border: 1px solid rgba(255, 215, 0, 0.4); background: rgba(255, 215, 0, 0.1); color: #ffd700; padding: 6px 20px; border-radius: 20px; font-size: clamp(0.85rem, 3.5vw, 1rem); letter-spacing: 1px; }
.exp-container { width: 90%; max-width: 400px; margin: 0 auto; }
.exp-text { display: flex; justify-content: space-between; font-size: 0.8rem; color: #aaa; margin-bottom: 5px; }
.progress-track { height: 8px; background: rgba(255,255,255,0.1); border-radius: 4px; overflow: hidden; }
.progress-bar { height: 100%; background: var(--primary); width: 0%; transition: width 0.5s ease; box-shadow: 0 0 10px var(--primary); }
.stats-grid { display: flex; justify-content: space-evenly; align-items: center; padding: var(--space-lg) 0; margin: var(--space-lg) 0; }
.stat-item { display: flex; flex-direction: column; align-items: center; }
.stat-val { font-size: clamp(1.4rem, 7vw, 2.2rem); font-weight: 800; color: #fff; line-height: 1; margin-bottom: 5px; }
.stat-label { font-size: 0.75rem; color: #aaa; }
.stat-divider { width: 1px; height: 30px; background: rgba(255,255,255,0.15); }
.section-separator { display: flex; align-items: center; gap: 10px; margin: var(--space-lg) 0; opacity: 0.6; }
.section-separator .line { flex: 1; height: 1px; background: linear-gradient(90deg, transparent, rgba(255,255,255,0.5), transparent); }
.section-separator .diamond { width: 6px; height: 6px; background: var(--primary); transform: rotate(45deg); }

/* History */
.timeline { padding: 0; }
.timeline-row { display: flex; margin-bottom: var(--space-md); }
.time-col { width: clamp(40px, 12vw, 55px); text-align: right; padding-right: 10px; flex-shrink: 0; }
.time-col .date { font-weight: bold; font-size: clamp(0.9rem, 3.5vw, 1.2rem); display: block; color: #eee; }
.time-col .year { font-size: 0.7rem; color: #666; display: block; }
.line-col { width: 20px; position: relative; display: flex; justify-content: center; flex-shrink: 0; }
.line-col .dot { width: 10px; height: 10px; background: var(--primary); border-radius: 50%; z-index: 2; margin-top: 6px; box-shadow: 0 0 5px var(--primary); }
.line-col .line { position: absolute; top: 15px; bottom: -20px; width: 2px; background: rgba(255,255,255,0.1); }
.timeline-row:last-child .line { display: none; }
.info-col { flex: 1; padding-left: 10px; min-width: 0; }
.history-card { width: 100%; transition: all 0.3s; }
.card-main { display: flex; padding: var(--space-sm); gap: var(--space-sm); align-items: center; }
.thumb-col { width: clamp(50px, 15vw, 70px); height: clamp(50px, 15vw, 70px); border-radius: 8px; overflow: hidden; flex-shrink: 0; background: #000; border: 1px solid #333; }
.script-thumb { width: 100%; height: 100%; object-fit: cover; }
.card-info-content { flex: 1; display: flex; flex-direction: column; justify-content: center; align-items: flex-start; min-width: 0; }
.script-title { font-size: clamp(0.95rem, 4vw, 1.15rem); font-weight: bold; color: #fff; margin: 0 0 4px 0; display: -webkit-box; -webkit-line-clamp: 1; -webkit-box-orient: vertical; overflow: hidden; line-height: 1.3; text-align: left; }
.history-card.expanded .script-title { -webkit-line-clamp: unset; }
.gm-row { font-size: 0.8rem; color: #ccc; margin-bottom: 4px; display: flex; align-items: center; gap: 4px; }
.exp-row { width: 100%; display: flex; justify-content: space-between; align-items: center; }
.exp-badge { color: var(--primary); font-size: 0.85rem; font-weight: bold; }
.card-details { border-top: 1px solid rgba(255,255,255,0.1); padding: var(--space-md); background: rgba(0,0,0,0.2); }
.detail-quote { font-style: italic; color: #ddd; font-size: clamp(0.9rem, 3.5vw, 1rem); border-left: 3px solid var(--primary); padding-left: 10px; margin-bottom: 10px; }
.detail-link-btn { display: block; width: 100%; padding: 10px; background: rgba(255,255,255,0.1); border: 1px solid #555; border-radius: 8px; color: var(--primary); text-align: center; text-decoration: none; font-size: 0.9rem; }
.detail-empty { color: #666; font-size: 0.9rem; text-align: center; margin: 0; }

/* =========================================
   🔥 Wallet (Accordion Fixed - 冒險檔案風格)
   ========================================= */
.ticket-list { display: flex; flex-direction: column; gap: var(--space-md); }
.new-ticket { 
  display: flex; flex-direction: column; 
  position: relative; 
  background: rgba(30, 30, 35, 0.8); backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 12px;
  overflow: hidden; 
  transition: all 0.3s ease; 
  cursor: pointer;
}
.new-ticket.is-expanded { border-color: var(--primary); background: rgba(25, 25, 25, 0.95); box-shadow: 0 5px 20px rgba(0,0,0,0.5); }

/* 主內容區 (總是顯示) */
.ticket-main-row { display: flex; width: 100%; min-height: 100px; }
.ticket-left { flex: 1; padding: var(--space-md); display: flex; flex-direction: column; justify-content: center; min-width: 0; }
.ticket-title { font-size: clamp(1rem, 4.5vw, 1.3rem); font-weight: bold; color: var(--primary); margin-bottom: 4px; line-height: 1.2; }
.ticket-desc-short { font-size: clamp(0.8rem, 3.5vw, 0.9rem); color: #ccc; margin-bottom: 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ticket-date { font-size: 0.7rem; color: #666; }

.ticket-split { width: 1px; border-left: 1px dashed rgba(255,255,255,0.2); position: relative; margin: 10px 0; }

/* 右側：純指示，不當按鈕用 */
.ticket-right { width: clamp(70px, 20vw, 90px); display: flex; flex-direction: column; align-items: center; justify-content: center; background: rgba(255, 215, 0, 0.05); flex-shrink: 0; color: var(--primary); transition: background 0.3s; }
.new-ticket.is-expanded .ticket-right { background: rgba(255, 215, 0, 0.1); }
.expand-icon { font-size: 1.2rem; margin-bottom: 2px; }
.click-text { font-size: 0.7rem; font-weight: bold; opacity: 0.8; }

/* 展開區域 */
.ticket-expanded-area {
  padding: 0 var(--space-md) var(--space-md) var(--space-md);
  border-top: 1px solid rgba(255,255,255,0.1);
  animation: slideDown 0.3s ease;
}
@keyframes slideDown { from { opacity: 0; transform: translateY(-5px); } to { opacity: 1; transform: translateY(0); } }

.ticket-desc-box { margin: 15px 0; background: rgba(0,0,0,0.3); padding: 15px; border-radius: 8px; }
.desc-title { color: #888; font-size: 0.8rem; margin: 0 0 5px 0; }
.desc-content { color: #ddd; font-size: 1rem; line-height: 1.6; margin: 0; }
.ticket-id-tag { font-family: monospace; color: #555; text-align: right; font-size: 0.8rem; margin-top: 10px; }

/* 大顆確認按鈕 */
.confirm-use-btn {
  width: 100%; padding: 15px;
  background: var(--primary); border: none; border-radius: 8px;
  color: #000; font-weight: 800; font-size: 1.1rem;
  cursor: pointer; 
}
.confirm-use-btn:active { transform: scale(0.98); opacity: 0.9; }

/* 歷史樣式 */
.new-ticket.used { opacity: 0.6; cursor: default; }
.new-ticket.used .ticket-right { background: rgba(50, 50, 50, 0.3); color: #666; }
.status-text { font-weight: bold; color: #666; font-size: 1rem; transform: rotate(-15deg); border: 2px solid #666; padding: 3px; border-radius: 5px; opacity: 0.5; }

.notch { position: absolute; width: 16px; height: 16px; background: #0f0f13; border-radius: 50%; z-index: 2; border: 1px solid rgba(255,255,255,0.1); left: calc(100% - clamp(70px, 20vw, 90px)); transform: translateX(-50%); }
.notch-top { top: -9px; }
.notch-bottom { bottom: -9px; }

/* Version Tag (透明化) */
.version-tag {
  text-align: center; color: rgba(255, 255, 255, 0.25);
  font-size: 0.6rem; margin-top: 40px; margin-bottom: 20px; font-family: monospace;
}

/* Other UI */
.page-title { font-size: clamp(1.5rem, 6vw, 2rem); margin-bottom: var(--space-lg); color: #fff; }
.page-title small { font-size: 0.5em; color: var(--primary); margin-left: 8px; }
.settings-form { padding: var(--space-lg); }
.form-group { margin-bottom: var(--space-md); }
.form-group label { font-size: 0.9rem; margin-bottom: 5px; display: block; }
.form-group input { width: 100%; padding: 12px; background: rgba(0,0,0,0.3); border: 1px solid #444; border-radius: 8px; color: white; font-size: 1rem; }
.save-btn { width: 100%; padding: 15px; background: var(--primary); border-radius: 25px; border: none; font-size: 1.1rem; font-weight: bold; margin-top: 10px; cursor: pointer; }

.bottom-nav-glass {
  position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%);
  width: 90%; max-width: 400px; height: 60px;
  background: rgba(20, 20, 20, 0.9); backdrop-filter: blur(20px); 
  border: 1px solid rgba(255, 255, 255, 0.15); border-radius: 30px;
  display: flex; justify-content: space-evenly; align-items: center;
  z-index: 100; box-shadow: 0 10px 30px rgba(0,0,0,0.5);
  padding-bottom: env(safe-area-inset-bottom, 0px);
}
.nav-item { width: 50px; height: 100%; display: flex; align-items: center; justify-content: center; position: relative; color: #666; cursor: pointer; }
.nav-icon { width: 24px; height: 24px; }
.nav-item.active { color: var(--primary); }
.nav-item.active::after { content: ''; position: absolute; bottom: 8px; width: 4px; height: 4px; background: var(--primary); border-radius: 50%; }

.divider { text-align: center; color: #555; font-size: 0.9rem; margin: 35px 0 15px 0; position: relative; }
.divider::before { content:''; position: absolute; left: 0; top: 50%; width: 40%; height: 1px; background: #333; }
.divider::after { content:''; position: absolute; right: 0; top: 50%; width: 40%; height: 1px; background: #333; }
.loading-screen { height: 80vh; display: flex; flex-direction: column; align-items: center; justify-content: center; }
.loader { width: 40px; height: 40px; border: 3px solid rgba(255,255,255,0.1); border-top-color: var(--primary); border-radius: 50%; animation: spin 0.8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
.fade-enter-active, .fade-leave-active { transition: opacity 0.2s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>