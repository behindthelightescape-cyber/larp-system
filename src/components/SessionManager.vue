<script setup>
import { ref, onMounted, computed } from 'vue'
import { supabase } from '../supabase'

const games = ref([])
const isLoading = ref(false)

// === 🚀 企業級防爆查詢變數 ===
const viewMode = ref('7days') // 模式：'7days' (近7天與未來) 或 'date' (指定日期)

// 設定「指定日期」的預設值為今天 (YYYY-MM-DD)
const now = new Date()
now.setMinutes(now.getMinutes() - now.getTimezoneOffset())
const specificDate = ref(now.toISOString().split('T')[0]) 

const searchKeyword = ref('') // 畫面上的即時過濾器

onMounted(async () => {
  await loadSessions()
})

// === 1. 根據時間切片抓取資料 ===
const loadSessions = async () => {
  isLoading.value = true
  try {
    let query = supabase
      .from('games')
      .select(`
        id, play_time, gm_name, status,
        scripts ( title, cover_url, player_limit ),
        game_participants (
          users ( id, display_name, picture_url, legacy_id )
        )
      `)
      .order('play_time', { ascending: false })

    // 🚀 防爆邏輯：絕對不全抓，只抓特定時間範圍
    if (viewMode.value === '7days') {
      // 抓取：過去 7 天 ~ 未來的所有場次
      const past = new Date()
      past.setDate(past.getDate() - 7)
      query = query.gte('play_time', past.toISOString())
      
    } else if (viewMode.value === 'date') {
      // 抓取：指定的那一天 (00:00:00 ~ 23:59:59)
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

// 點擊切換模式
const setViewMode = (mode) => {
  viewMode.value = mode
  loadSessions()
}

// === 2. 前端即時過濾 + 日期分群 ===
const groupedGames = computed(() => {
  // 先用關鍵字過濾已抓下來的資料
  let filtered = games.value
  if (searchKeyword.value.trim()) {
    const kw = searchKeyword.value.trim().toLowerCase()
    filtered = filtered.filter(g => 
      g.gm_name.toLowerCase().includes(kw) || 
      (g.scripts && g.scripts.title.toLowerCase().includes(kw))
    )
  }

  // 再把過濾後的資料，按照日期分組裝箱
  const groups = {}
  filtered.forEach(game => {
    const dateStr = game.play_time ? game.play_time.split('T')[0] : '未知日期'
    if (!groups[dateStr]) groups[dateStr] = []
    groups[dateStr].push(game)
  })
  return groups
})

const formatTime = (timeStr) => {
  if (!timeStr) return ''
  const d = new Date(timeStr)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
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
          <div v-for="game in gamesOnDate" :key="game.id" class="game-card">
            
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
  </div>
</template>

<style scoped>
.session-manager-container { display: flex; flex-direction: column; gap: 20px; }
.header-flex { display: flex; justify-content: space-between; align-items: center; background: #111; padding: 20px; border-radius: 12px; border: 1px solid #222; }

/* 🚀 控制面板樣式 */
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

/* 日期標題 */
.date-header { display: flex; align-items: center; gap: 15px; margin-bottom: 15px; border-bottom: 1px dashed #333; padding-bottom: 10px; }
.date-badge { background: #222; color: #D4AF37; padding: 5px 15px; border-radius: 20px; font-weight: bold; font-size: 1.1rem; border: 1px solid #D4AF37; }
.date-count { color: #888; font-size: 0.9rem; }

/* 場次卡片網格 */
.games-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 20px; }

/* 單一場次卡片 */
.game-card { background: #151515; border: 1px solid #333; border-radius: 12px; overflow: hidden; transition: transform 0.2s; display: flex; flex-direction: column; }
.game-card:hover { border-color: #555; transform: translateY(-2px); box-shadow: 0 5px 15px rgba(0,0,0,0.5); }

.game-header { display: flex; gap: 15px; padding: 15px; background: #1a1a1a; border-bottom: 1px solid #222; position: relative; }
.game-cover { width: 50px; height: 70px; object-fit: cover; border-radius: 6px; border: 1px solid #444; }
.game-info { display: flex; flex-direction: column; justify-content: center; gap: 5px; flex: 1; }
.game-title { font-weight: bold; font-size: 1.1rem; color: #fff; }
.game-meta { display: flex; gap: 10px; font-size: 0.85rem; color: #aaa; }
.meta-item { background: #222; padding: 2px 6px; border-radius: 4px; border: 1px solid #333;}

/* 狀態綠點點 */
.status-dot { position: absolute; top: 15px; right: 15px; width: 10px; height: 10px; border-radius: 50%; }
.status-dot.active { background: #2ecc71; box-shadow: 0 0 8px #2ecc71; }
.status-dot.closed { background: #e74c3c; }

/* 玩家區塊 */
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

@media (max-width: 768px) {
  .search-group { justify-content: flex-start; }
  .search-input { max-width: 100%; }
}
</style>