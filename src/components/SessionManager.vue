<script setup>
import { ref, onMounted, computed } from 'vue'
import { supabase } from '../supabase'
import QrcodeVue from 'qrcode.vue' // 🚀 引入 QR Code 生成器

const games = ref([])
const isLoading = ref(false)

const viewMode = ref('7days') 
const now = new Date()
now.setMinutes(now.getMinutes() - now.getTimezoneOffset())
const specificDate = ref(now.toISOString().split('T')[0]) 
const searchKeyword = ref('') 

// 🚀 新增：QR Code 彈窗控制狀態
const showQrModal = ref(false)
const selectedGameForQr = ref(null)

onMounted(async () => {
  await loadSessions()
})

// 卡片用的：只顯示 小時:分鐘 (自動轉當地時區)
const formatTime = (timeStr) => {
  if (!timeStr) return ''
  const d = new Date(timeStr)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

// 🚀 新增：彈窗用的：顯示 年-月-日 小時:分鐘 (自動轉當地時區)
const formatFullDateTime = (timeStr) => {
  if (!timeStr) return '未知時間'
  const d = new Date(timeStr)
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const min = String(d.getMinutes()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd} ${hh}:${min}`
}

const loadSessions = async () => {
  isLoading.value = true
  try {
    // 🚀 記得把 qr_payload 抓下來
    let query = supabase
      .from('games')
      .select(`
        id, play_time, gm_name, status, qr_payload,
        scripts ( title, cover_url, player_limit ),
        game_participants (
          users ( id, display_name, picture_url, legacy_id )
        )
      `)
      .order('play_time', { ascending: false })

    if (viewMode.value === '7days') {
      const past = new Date()
      past.setDate(past.getDate() - 7)
      query = query.gte('play_time', past.toISOString())
      
    } else if (viewMode.value === 'date') {
      const startOfDay = new Date(specificDate.value + 'T00:00:00')
      const endOfDay = new Date(specificDate.value + 'T23:59:59')
      query = query.gte('play_time', startOfDay.toISOString()).lte('play_time', endOfDay.toISOString())
    }

    const { data, error } = await query
    if (error) throw error
    games.value = data || []
    
  } catch (err) {
    console.error("時空傳輸失敗：", err)
    alert("資料庫連線異常：" + err.message)
  } finally {
    isLoading.value = false
  }
}

const setViewMode = (mode) => {
  viewMode.value = mode
  loadSessions()
}

const groupedGames = computed(() => {
  let filtered = games.value
  if (searchKeyword.value.trim()) {
    const kw = searchKeyword.value.trim().toLowerCase()
    filtered = filtered.filter(g => 
      g.gm_name.toLowerCase().includes(kw) || 
      (g.scripts && g.scripts.title.toLowerCase().includes(kw))
    )
  }

  const groups = {}
  filtered.forEach(game => {
    const dateStr = game.play_time ? game.play_time.split('T')[0] : '未知日期'
    if (!groups[dateStr]) groups[dateStr] = []
    groups[dateStr].push(game)
  })
  return groups
})



// 🚀 新增：點擊卡片打開 QR Code 彈窗
// 🚀 新增：點擊卡片打開 QR Code 彈窗 (撤除門神，所有場次皆可補掃！)
const openQrScanner = (game) => {
  selectedGameForQr.value = game
  showQrModal.value = true
}

// 🚀 幫玩家補經驗值的隱藏按鈕 (防呆用，可選)
// 🚀 終極防呆版：如果 qr_payload 沒存到，直接用 game.id 來生！
const generateQrUrl = (game) => {
  const targetId = game.qr_payload || game.id
  return `https://liff.line.me/2009161687-icfQU9r6?game_id=${targetId}`
}
</script>

<template>
  <div class="session-manager-container">
    <div class="header-flex">
      <h3 style="color: #D4AF37; margin: 0;">📅 場次監控大廳</h3>
      <button class="btn btn-gold btn-small" @click="loadSessions">🔄 刷新資料</button>
    </div>

    <div class="session-controls">
      <div class="control-group">
        <span style="color: #888; font-size: 0.9rem; font-weight: bold;">時間範圍：</span>
        <button class="filter-btn" :class="{ active: viewMode === '7days' }" @click="setViewMode('7days')">
          近 7 天與未來
        </button>
        
        <div class="date-picker-wrap" :class="{ active: viewMode === 'date' }">
          <button class="filter-btn" :class="{ active: viewMode === 'date' }" @click="setViewMode('date')">
            指定日期
          </button>
          <input 
            v-if="viewMode === 'date'" 
            v-model="specificDate" 
            type="date" 
            class="admin-input mini-date" 
            @change="loadSessions"
          >
        </div>
      </div>

      <div class="control-group search-group">
        <span style="color: #888; font-size: 0.9rem; font-weight: bold;">🔍 尋找：</span>
        <input 
          v-model="searchKeyword" 
          type="text" 
          class="admin-input search-input" 
          placeholder="過濾劇本名稱或 GM..."
        >
      </div>
    </div>

    <div v-if="isLoading" class="loading-state">
      <div class="spinner"></div> 載入時空資料中...
    </div>

    <div v-else class="timeline-container">
      <div v-if="Object.keys(groupedGames).length === 0" class="empty-state">
        這段時間內找不到任何場次紀錄喔！
      </div>

      <div v-for="(gamesOnDate, date) in groupedGames" :key="date" class="date-group">
        <div class="date-header">
          <span class="date-badge">{{ date }}</span>
          <span class="date-count">共 {{ gamesOnDate.length }} 場</span>
        </div>

        <div class="games-grid">
          <div 
            v-for="game in gamesOnDate" 
            :key="game.id" 
            class="game-card"
            @click="openQrScanner(game)"
            style="cursor: pointer;"
          >
            <div class="game-header">
              <img :src="game.scripts?.cover_url || 'https://via.placeholder.com/50'" class="game-cover">
              <div class="game-info">
                <div class="game-title">{{ game.scripts?.title || '未知劇本' }}</div>
                <div class="game-meta">
                  <span class="meta-item">🕒 {{ formatTime(game.play_time) }}</span>
                  <span class="meta-item">🎭 GM: {{ game.gm_name }}</span>
                </div>
              </div>
              <div class="status-dot" :class="game.status === 'open' ? 'active' : 'closed'" title="狀態"></div>
            </div>

            <div style="background: rgba(212,175,55,0.1); color: #D4AF37; font-size: 0.75rem; text-align: center; padding: 4px 0; font-weight: bold;">
              👆 點擊卡片顯示 QR Code 補掃
            </div>

            <div class="players-section">
              <div class="players-header">
                <span>👥 已掃碼入座玩家 ({{ game.game_participants?.length || 0 }} / {{ game.scripts?.player_limit || '?' }})</span>
              </div>
              
              <div class="players-list">
                <div v-if="!game.game_participants || game.game_participants.length === 0" class="no-players">
                  尚無玩家掃碼
                </div>
                
                <div v-for="p in game.game_participants" :key="p.users?.id" class="player-chip">
                  <img :src="p.users?.picture_url || 'https://via.placeholder.com/30'" class="player-avatar">
                  <div class="player-name-wrap">
                    <span class="p-name">{{ p.users?.display_name }}</span>
                    <span class="p-id">{{ p.users?.legacy_id }}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <Teleport to="body">
      <div v-if="showQrModal && selectedGameForQr" class="qr-modal-overlay" @click.self="showQrModal = false">
        <div class="qr-modal-content">
          <button class="close-btn" @click="showQrModal = false">✕</button>
          
          <h2 style="color: #D4AF37; margin-bottom: 5px;">{{ selectedGameForQr.scripts?.title || '未知劇本' }}</h2>
          <p style="color: #888; margin-top: 0; margin-bottom: 20px;">
            場次時間：{{ formatFullDateTime(selectedGameForQr.play_time) }}<br>
            負責 GM：{{ selectedGameForQr.gm_name || '未知 GM' }}
          </p>

          <div class="qr-box">
            <qrcode-vue 
              :value="generateQrUrl(selectedGameForQr)" 
              :size="250" 
              level="H" 
              class="qr-code-img"
            />
          </div>
          
          <p style="color: #ccc; margin-top: 20px; font-weight: bold;">
            請玩家使用 LINE 掃描上方條碼補登經驗值！
          </p>
          <div v-if="selectedGameForQr.status === 'closed'" style="color: #e74c3c; font-size: 0.85rem; margin-top: 10px;">
            ⚠️ 注意：此場次已關閉，但仍可提供漏掃玩家補掃。
          </div>
        </div>
      </div>
    </Teleport>

  </div>
</template>

<style scoped>
/* 原本的樣式完全保留 */
.session-manager-container { display: flex; flex-direction: column; gap: 20px; }
.header-flex { display: flex; justify-content: space-between; align-items: center; background: #111; padding: 20px; border-radius: 12px; border: 1px solid #222; }
.session-controls { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 15px; background: #1a1a1a; padding: 15px 20px; border-radius: 12px; border: 1px solid #333; }
.control-group { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.search-group { flex: 1; min-width: 250px; justify-content: flex-end; }
.filter-btn { background: #222; color: #aaa; border: 1px solid #444; padding: 8px 15px; border-radius: 6px; cursor: pointer; font-weight: bold; transition: 0.2s; }
.filter-btn:hover { background: #333; color: #fff; }
.filter-btn.active { background: #D4AF37; color: black; border-color: #D4AF37; }
.date-picker-wrap { display: flex; gap: 10px; align-items: center; }
.admin-input { padding: 8px 12px; background: #111; border: 1px solid #444; color: white; border-radius: 6px; font-size: 0.95rem; }
.admin-input:focus { border-color: #D4AF37; outline: none; }
.mini-date { padding: 6px 10px; }
.search-input { width: 100%; max-width: 300px; }
.btn { padding: 8px 15px; border: none; font-weight: bold; border-radius: 8px; cursor: pointer; transition: 0.2s; }
.btn-gold { background: #D4AF37; color: black; }
.btn-gold:hover { background: #e5c358; }
.btn-small { font-size: 0.85rem; }
.loading-state { text-align: center; color: #888; padding: 50px; }
.timeline-container { display: flex; flex-direction: column; gap: 30px; }
.date-header { display: flex; align-items: center; gap: 15px; margin-bottom: 15px; border-bottom: 1px dashed #333; padding-bottom: 10px; }
.date-badge { background: #222; color: #D4AF37; padding: 5px 15px; border-radius: 20px; font-weight: bold; font-size: 1.1rem; border: 1px solid #D4AF37; }
.date-count { color: #888; font-size: 0.9rem; }
.games-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 20px; }
.game-card { background: #151515; border: 1px solid #333; border-radius: 12px; overflow: hidden; transition: transform 0.2s; display: flex; flex-direction: column; }
.game-card:hover { border-color: #D4AF37; transform: translateY(-2px); box-shadow: 0 5px 15px rgba(212,175,55,0.2); }
.game-header { display: flex; gap: 15px; padding: 15px; background: #1a1a1a; border-bottom: 1px solid #222; position: relative; }
.game-cover { width: 50px; height: 70px; object-fit: cover; border-radius: 6px; border: 1px solid #444; }
.game-info { display: flex; flex-direction: column; justify-content: center; gap: 5px; flex: 1; }
.game-title { font-weight: bold; font-size: 1.1rem; color: #fff; }
.game-meta { display: flex; gap: 10px; font-size: 0.85rem; color: #aaa; }
.meta-item { background: #222; padding: 2px 6px; border-radius: 4px; border: 1px solid #333;}
.status-dot { position: absolute; top: 15px; right: 15px; width: 10px; height: 10px; border-radius: 50%; }
.status-dot.active { background: #2ecc71; box-shadow: 0 0 8px #2ecc71; }
.status-dot.closed { background: #e74c3c; }
.players-section { padding: 15px; background: #111; flex: 1; }
.players-header { font-size: 0.85rem; color: #888; margin-bottom: 10px; border-bottom: 1px dashed #333; padding-bottom: 5px; }
.no-players { font-size: 0.85rem; color: #555; font-style: italic; text-align: center; padding: 10px; }
.players-list { display: flex; flex-wrap: wrap; gap: 8px; }
.player-chip { display: flex; align-items: center; background: #222; border: 1px solid #333; border-radius: 20px; padding: 4px 10px 4px 4px; gap: 8px; transition: 0.2s;}
.player-chip:hover { border-color: #D4AF37; }
.player-avatar { width: 24px; height: 24px; border-radius: 50%; object-fit: cover; border: 1px solid #666; }
.player-name-wrap { display: flex; flex-direction: column; }
.p-name { font-size: 0.8rem; font-weight: bold; color: #ddd; white-space: nowrap; }
.p-id { font-size: 0.65rem; color: #D4AF37; font-family: monospace; line-height: 1; }
.spinner { width: 30px; height: 30px; border: 3px solid rgba(212, 175, 55, 0.2); border-top-color: #D4AF37; border-radius: 50%; animation: spin 1s linear infinite; margin: 0 auto 10px auto; }
@keyframes spin { to { transform: rotate(360deg); } }
.empty-state { text-align: center; padding: 40px; color: #666; background: #111; border-radius: 12px; border: 1px dashed #333; }

/* 🚀 QR Code 彈窗專屬樣式 */
.qr-modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.85); display: flex; justify-content: center; align-items: center; z-index: 9999; backdrop-filter: blur(5px); }
.qr-modal-content { background: #161616; padding: 40px; border-radius: 16px; border: 1px solid #D4AF37; text-align: center; position: relative; max-width: 400px; width: 90%; box-shadow: 0 10px 40px rgba(0,0,0,0.8); }
.qr-box { background: white; padding: 20px; border-radius: 12px; display: inline-block; box-shadow: 0 0 20px rgba(255,255,255,0.2); }
.qr-code-img { display: block; }
.close-btn { position: absolute; top: 15px; right: 15px; background: transparent; border: 1px solid #555; color: #ccc; width: 30px; height: 30px; border-radius: 50%; cursor: pointer; display: flex; justify-content: center; align-items: center; transition: 0.2s; }
.close-btn:hover { background: #333; color: white; border-color: #D4AF37; }

@media (max-width: 768px) {
  .search-group { justify-content: flex-start; }
  .search-input { max-width: 100%; }
}
</style>