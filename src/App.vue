<script setup>
import { ref, onMounted, computed } from 'vue'
import { supabase } from './supabase'

// ⚠️ 繼續用那位測試員-喬
const MOCK_USER_ID = 'U_TEST_JOE_001'
const DEFAULT_AVATAR = 'https://meee.com.tw/D45hJIi.PNG' 
const DEFAULT_COVER = 'https://meee.com.tw/VInVFKh.PNG'   

const user = ref({}) 
const coupons = ref([])
const history = ref([])
const loading = ref(true)
const saving = ref(false) 
const currentTab = ref('home')
const expandedRecordId = ref(null) 

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
    alert('✅ 資料更新成功！')
    currentTab.value = 'home'
  }
  saving.value = false
}

const toggleRecord = (id) => { expandedRecordId.value = expandedRecordId.value === id ? null : id }
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
      <div v-if="loading" class="loading-screen"><div class="loader"></div><p>系統連線中...</p></div>
      <div v-else class="content-area">
        <transition name="fade" mode="out-in">
          
          <div v-if="currentTab === 'home'" key="home" class="tab-page home-layout">
            <div class="top-logo-container">
               <img src="https://meee.com.tw/VInVFKh.PNG" alt="Brand Logo" class="top-logo" />
            </div>
            <div class="character-section">
              <div class="character-stage">
                <div class="avatar-glow"></div>
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
                        <div class="header-row"><h3 class="script-title">{{ record.games.scripts?.title }}</h3></div>
                        <div class="gm-row"><span class="gm-label">GM:</span><span class="gm-value">{{ record.games.gm_name }}</span></div>
                        <div class="exp-row"><span class="exp-badge">+{{ record.exp_gained }} EXP</span><span class="expand-hint">{{ expandedRecordId === record.id ? '▲' : '▼' }}</span></div>
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
              <div v-for="c in validCoupons" :key="c.id" class="ticket active heavy-glass">
                <div class="ticket-hole-left"></div><div class="ticket-hole-right"></div>
                <div class="ticket-main">
                  <div class="ticket-icon">🎁</div>
                  <div class="ticket-info"><h4>{{ c.title }}</h4><p>{{ c.description }}</p><span class="expiry">有效期至 {{ formatDate(c.expiry_date) }}</span></div>
                </div>
                <button class="use-btn">使用</button>
              </div>
              <div v-if="historyCoupons.length > 0" class="divider">歷史紀錄</div>
              <div v-for="c in historyCoupons" :key="c.id" class="ticket used">
                <div class="ticket-main"><div class="ticket-info"><h4>{{ c.title }}</h4><p>{{ c.status === 'used' ? '已核銷' : '已過期' }}</p></div></div>
              </div>
            </div>
          </div>
        </transition>
        
        <div class="version-tag">System V7.0</div>
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
/* CSS Reset */
:root {
  --primary: #ffd700;
  --bg-dark: #0f0f13;
  --glass-border: rgba(255, 255, 255, 0.2); 
  --text-main: #ffffff;
  --card-width: 600px;
}

body { margin: 0; background: #000; font-family: 'Helvetica Neue', Arial, sans-serif; overflow-x: hidden; }

.bg-layer {
  position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; z-index: 0;
  background: url('https://images.unsplash.com/photo-1519608487953-e999c86e7455?q=80&w=1000&auto=format&fit=crop');
  background-size: cover; background-position: center;
  filter: brightness(0.4) blur(3px);
}

.app-wrapper { display: flex; justify-content: center; min-height: 100vh; }
.app-container {
  width: 100%; max-width: var(--card-width); position: relative; z-index: 1;
  display: flex; flex-direction: column; min-height: 100vh;
  box-shadow: 0 0 50px rgba(0,0,0,0.5); background: rgba(0,0,0,0.2);
  overflow-x: hidden;
}
.content-area { flex: 1; overflow-y: auto; padding: 20px; padding-bottom: 120px; }

/* Heavy Glass */
.heavy-glass {
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.15) 0%, rgba(255, 255, 255, 0.05) 100%);
  backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.3);
  box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.5);
  border-radius: 16px;
}

/* Timeline */
.timeline { padding: 0 5px; }
.timeline-row { display: flex; margin-bottom: 25px; }
.time-col { width: 50px; text-align: right; padding-right: 15px; display: flex; flex-direction: column; padding-top: 5px; }
.time-col .date { font-weight: bold; font-size: 1.2rem; color: #eee; }
.time-col .year { font-size: 0.8rem; color: #666; }
.line-col { position: relative; width: 20px; display: flex; justify-content: center; }
.line-col .dot { width: 12px; height: 12px; background: var(--primary); border-radius: 50%; box-shadow: 0 0 8px var(--primary); z-index: 2; margin-top: 10px; }
.line-col .line { position: absolute; top: 20px; bottom: -30px; width: 3px; background: rgba(255,255,255,0.1); }
.timeline-row:last-child .line { display: none; }
.info-col { flex: 1; padding-left: 5px; }

/* History Card */
.history-card { overflow: hidden; transition: all 0.3s ease; cursor: pointer; width: 100%; }
.history-card:active { transform: scale(0.98); background: rgba(255,255,255,0.2); }
.history-card.expanded { border-color: var(--primary); background: rgba(20,20,20,0.85); }
.card-main { display: flex; padding: 15px; gap: 12px; align-items: center;}
.thumb-col { width: 70px; height: 70px; border-radius: 10px; overflow: hidden; flex-shrink: 0; border: 1px solid #444; background: #000; }
.script-thumb { width: 100%; height: 100%; object-fit: cover; }
.card-info-content { flex: 1; display: flex; flex-direction: column; justify-content: center; min-width: 0; }
.header-row { margin-bottom: 4px; }
.script-title { margin: 0; font-size: 1.1rem; color: #fff; font-weight: bold; line-height: 1.3; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.gm-row { margin-bottom: 6px; font-size: 0.9rem; color: #ccc; display: flex; align-items: center; gap: 5px; }
.gm-label { color: #666; font-size: 0.75rem; text-transform: uppercase; }
.gm-value { font-weight: 500; }
.exp-row { display: flex; justify-content: space-between; align-items: center; }
.exp-badge { color: var(--primary); font-size: 0.95rem; font-weight: bold; }
.expand-hint { font-size: 0.8rem; color: #555; }
.card-details { border-top: 1px solid rgba(255,255,255,0.1); padding: 18px; background: rgba(0,0,0,0.2); animation: slideDown 0.3s ease; }
@keyframes slideDown { from { opacity: 0; transform: translateY(-5px); } to { opacity: 1; transform: translateY(0); } }
.detail-quote { font-style: italic; color: #ddd; font-size: 1rem; border-left: 3px solid var(--primary); padding-left: 12px; margin-bottom: 15px; line-height: 1.5; }
.detail-link-btn { display: block; width: 100%; padding: 12px; background: rgba(255,255,255,0.1); border: 1px solid #555; border-radius: 10px; color: var(--primary); text-align: center; text-decoration: none; font-size: 1rem; transition: background 0.2s; }
.detail-link-btn:hover { background: rgba(255,255,255,0.2); }
.detail-empty { color: #666; font-size: 0.9rem; text-align: center; margin: 0; }

/* Styles */
.top-logo-container { text-align: center; margin-bottom: 15px; margin-top: -50px; position: relative; z-index: 10; }
.top-logo { max-height: 130px; width: auto; filter: drop-shadow(0 0 15px rgba(255, 215, 0, 0.3)); }
.character-stage { display: flex; justify-content: center; align-items: center; margin-top: 15px; margin-bottom: 25px; position: relative; }

.avatar-wrapper { 
  width: clamp(120px, 35vw, 160px); 
  height: clamp(120px, 35vw, 160px); 
  border-radius: 50%; border: 4px solid rgba(255, 215, 0, 0.5); padding: 5px; box-shadow: 0 0 35px rgba(0,0,0,0.6); background: rgba(0,0,0,0.3); backdrop-filter: blur(5px); z-index: 2; overflow: hidden; 
}
.main-avatar { width: 100%; height: 100%; border-radius: 50%; object-fit: cover; }
.character-info { text-align: center; margin-bottom: 15px; }
.name-row { display: flex; align-items: center; justify-content: center; gap: 10px; margin-bottom: 12px; }
.display-name { 
  font-size: clamp(1.8rem, 6vw, 2.2rem); 
  font-weight: 800; color: #fff; margin: 0; text-shadow: 0 2px 10px rgba(0,0,0,0.5); 
}
.level-tag { background: var(--primary); color: #000; font-weight: 900; font-size: 0.9rem; padding: 4px 10px; border-radius: 6px; }

/* 🔥 Member ID Style 🔥 */
.member-id {
  font-family: monospace;
  color: rgba(255, 255, 255, 0.5);
  font-size: 0.85rem;
  margin: -5px 0 15px 0;
  letter-spacing: 1px;
}

.title-badge { margin-bottom: 25px; }
.title-text { display: inline-block; border: 1px solid rgba(255, 215, 0, 0.4); background: rgba(255, 215, 0, 0.1); color: #ffd700; padding: 6px 25px; border-radius: 20px; font-size: 1rem; letter-spacing: 1px; box-shadow: 0 0 15px rgba(255, 215, 0, 0.1); }
.exp-container { width: 100%; margin: 0 auto; }
.exp-text { display: flex; justify-content: space-between; font-size: 0.9rem; color: #aaa; margin-bottom: 6px; padding: 0 2px; }
.progress-track { height: 12px; background: rgba(255,255,255,0.1); border-radius: 6px; overflow: hidden; }
.progress-bar { height: 100%; background: var(--primary); box-shadow: 0 0 10px var(--primary); transition: width 0.5s ease; }

.section-separator { display: flex; align-items: center; justify-content: center; gap: 15px; margin: 35px 0; opacity: 0.6; }
.section-separator .line { flex: 1; height: 1px; background: linear-gradient(90deg, transparent, rgba(255,255,255,0.5), transparent); }
.section-separator .diamond { width: 8px; height: 8px; background: var(--primary); transform: rotate(45deg); box-shadow: 0 0 10px var(--primary); }

.stats-grid { display: flex; justify-content: space-around; align-items: center; padding: 25px 0; margin-bottom: 30px; flex-wrap: nowrap; }
.stat-item { display: flex; flex-direction: column; align-items: center; width: 32%; }
.stat-val { 
  font-size: clamp(1.5rem, 5vw, 2.2rem); 
  font-weight: 800; color: #fff; margin-bottom: 8px; 
}
.stat-label { font-size: 0.8rem; color: #aaa; white-space: nowrap; }
.stat-divider { width: 1px; height: 35px; background: rgba(255,255,255,0.1); }

.page-title { font-size: 1.8rem; margin-bottom: 30px; color: #fff; display: flex; align-items: baseline; gap: 12px; }
.page-title small { font-size: 0.9rem; color: var(--primary); font-weight: 300; letter-spacing: 2px; }

/* 底部導航 */
.bottom-nav-glass {
  position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%);
  width: calc(var(--card-width) - 40px);
  height: 60px;
  background: rgba(20, 20, 20, 0.9); backdrop-filter: blur(20px); border: 1px solid rgba(255, 255, 255, 0.15); border-radius: 30px;
  display: flex; justify-content: space-around; align-items: center;
  box-shadow: 0 10px 40px rgba(0,0,0,0.6); z-index: 100;
}
@media (max-width: 480px) { .bottom-nav-glass { width: 90%; } }

.nav-item { width: 40px; height: 40px; display: flex; align-items: center; justify-content: center; transition: all 0.3s; position: relative; cursor: pointer; color: #666; }
.nav-icon { width: 24px; height: 24px; transition: fill 0.3s; }
.nav-item.active { color: var(--primary); background: rgba(255, 215, 0, 0.1); border-radius: 50%; transform: translateY(-5px); }
.nav-item .badge { position: absolute; top: 8px; right: 8px; width: 8px; height: 8px; background: #ff4444; border-radius: 50%; }

.version-tag {
  text-align: center; color: #444; font-size: 0.6rem; margin-top: 30px;
}

.settings-form { padding: 30px; }
.form-group { margin-bottom: 25px; }
.form-group label { display: block; color: #aaa; margin-bottom: 10px; font-size: 1rem; }
.form-group input { width: 100%; padding: 15px; background: rgba(0,0,0,0.3); border: 1px solid #444; border-radius: 10px; color: white; font-size: 1.1rem; box-sizing: border-box; }
.form-group input:focus { outline: none; border-color: var(--primary); }
.hint { font-size: 0.9rem; color: #eab308; margin-top: 8px; }
.save-btn { width: 100%; padding: 18px; background: var(--primary); border: none; border-radius: 30px; color: #000; font-weight: bold; font-size: 1.1rem; cursor: pointer; margin-top: 15px; }
.save-btn:disabled { opacity: 0.7; cursor: not-allowed; }

/* 🔥 Ticket List Styles (Responsive) 🔥 */
.ticket-list { display: flex; flex-direction: column; gap: 20px; }
.ticket { position: relative; display: flex; align-items: center; overflow: hidden; padding: 5px 0; }
.ticket-hole-left, .ticket-hole-right { position: absolute; top: 50%; width: 24px; height: 24px; background: #0f0f13; border-radius: 50%; transform: translateY(-50%); z-index: 2; }
.ticket-hole-left { left: -12px; }
.ticket-hole-right { right: -12px; }
.ticket.active { border: 1px solid rgba(255, 215, 0, 0.3); } 
.ticket.active .ticket-icon { 
  font-size: clamp(2rem, 8vw, 2.5rem); /* icon 縮放 */
  padding: 0 15px 0 25px; 
  filter: drop-shadow(0 0 5px gold); 
}
.ticket-main { flex: 1; display: flex; align-items: center; padding: 25px 0; min-width: 0; }
.ticket-info { min-width: 0; /* 防止溢出 */ }
.ticket-info h4 { 
  margin: 0 0 8px 0; color: var(--primary); 
  font-size: clamp(1.1rem, 4vw, 1.3rem); /* 標題縮放 */
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.ticket-info p { 
  margin: 0; color: #ccc; 
  font-size: clamp(0.85rem, 3.5vw, 0.95rem); /* 內文縮放 */
}
.ticket-info .expiry { 
  font-size: 0.8rem; color: #666; display: block; margin-top: 10px; 
}
.use-btn { 
  background: var(--primary); border: none; padding: 10px 20px; 
  border-radius: 25px; font-weight: bold; margin-right: 20px; 
  font-size: clamp(0.9rem, 3vw, 1rem); /* 按鈕字體縮放 */
  cursor: pointer; flex-shrink: 0;
}
.ticket.used { opacity: 0.5; filter: grayscale(1); border: 1px solid #333; background: #1a1a1a; border-radius: 12px;}
.ticket.used .ticket-icon { display: none; }
.ticket.used .ticket-info { padding-left: 30px; }
.divider { text-align: center; color: #555; font-size: 0.9rem; margin: 35px 0 15px 0; position: relative; }
.divider::before { content:''; position: absolute; left: 0; top: 50%; width: 40%; height: 1px; background: #333; }
.divider::after { content:''; position: absolute; right: 0; top: 50%; width: 40%; height: 1px; background: #333; }
.loading-screen { height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; }
.loader { width: 50px; height: 50px; border: 4px solid rgba(255,255,255,0.1); border-top-color: var(--primary); border-radius: 50%; animation: spin 1s linear infinite; margin-bottom: 25px; }
@keyframes spin { to { transform: rotate(360deg); } }
.fade-enter-active, .fade-leave-active { transition: opacity 0.3s ease, transform 0.3s ease; }
.fade-enter-from { opacity: 0; transform: translateY(10px); }
.fade-leave-to { opacity: 0; transform: translateY(-10px); }
</style>