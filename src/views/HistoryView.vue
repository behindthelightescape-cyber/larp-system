<script setup>
import { ref, computed, onMounted } from 'vue'
import { useUserStore } from '../stores/user'
import { supabase } from '../supabase' 

const store = useUserStore()
const showModal = ref(false)
const selectedGame = ref({})

const DEFAULT_COVER = 'https://images.unsplash.com/photo-1514467953502-5a7820e3efb4?w=600'

onMounted(async () => {
  const currentUserId = store.userData?.id || store.userId
  
  if (!currentUserId) {
    console.error('小四警告：抓不到玩家 ID！你確定你登入了嗎？還是 store.userData 裡面沒有 id 欄位？')
    return
  }

try {
    const { data, error } = await supabase
      .from('game_participants')
      .select(`
        id,
        exp_gained,
        created_at,
        character_name,
        comment,  
        games (
          gm_name,
          play_time,
          story_memory,
          branch_name, 
          base_exp, /* 🚀 關鍵 1：把包廂的懸賞金也查出來當保險！ */
          scripts (
            title,
            cover_url
          )
        )
      `)
      .eq('user_id', currentUserId)
      .order('created_at', { ascending: false })

    if (error) throw error

    if (data) {
      store.history = data.map(record => {
        
        let finalBranch = '劇光燈' 
        
        if (record.games?.branch_name) {
          finalBranch = record.games.branch_name
        } else if (record.comment && record.comment.includes('地點:')) {
          finalBranch = record.comment.split('地點:')[1].split('|')[0].trim()
        }

        // 🚀 四哥的「智慧標題替換」邏輯！
        let rawTitle = record.games?.scripts?.title || record.character_name
        let finalTitle = rawTitle
        let finalMemory = record.games?.story_memory || ''

        // 1. 如果標題是空的，或是帶有「未知」，就拿手札來擋！
        if (!finalTitle || finalTitle.includes('未知')) {
          finalTitle = finalMemory || '神秘未知劇本'
        }

        // 2. 如果手札內容已經被拿去當標題了，心得區就清空，避免畫面上重複顯示兩次
        if (finalMemory === finalTitle) {
          finalMemory = ''
        } else if (rawTitle) {
          // 如果標題本身就是正式的 (例如長歌行)，手札就乖乖顯示手札
          finalMemory = record.games?.story_memory || ''
        }

        return {
          id: record.id,
          title: finalTitle, // 👈 換上算好的聰明標題
          cover: record.games?.scripts?.cover_url || DEFAULT_COVER,
          date: record.games?.play_time 
            ? new Date(record.games.play_time).toLocaleString('zh-TW', { 
                year: 'numeric', month: '2-digit', day: '2-digit', 
                hour: '2-digit', minute: '2-digit', hour12: false 
              }).replace(/\//g, '-') 
            : '未知時間',
          gm: record.games?.gm_name || '無名氏',
          exp: record.exp_gained || record.games?.base_exp || 0,
          story_memory: finalMemory, // 👈 換上算好的乾淨手札
          branch: finalBranch
        }
      })
    }
  } catch (e) {
    console.error('小四警告：撈取歷史紀錄炸了！', e)
  }
})

const displayList = computed(() => {
  return store.history
})

const openDetail = (game) => {
  selectedGame.value = game
  showModal.value = true
}
</script>

<template>
  <div class="page-container">
    <div class="header-area">
      <h2 class="page-title">冒險回憶</h2>
      <span class="count-badge">{{ displayList.length }} 場</span>
    </div>
    
    <div class="history-list">
      <div 
        v-for="item in displayList" 
        :key="item.id" 
        class="game-card" 
        @click="openDetail(item)"
      >
        <div class="cover-wrapper">
          <img :src="item.cover" class="game-cover" />
        </div>

        <div class="game-info">
          <h3 class="game-title line-clamp-1">{{ item.title }}</h3>
          <div class="meta-row">
            <span class="meta-date">{{ item.date }}</span>
            <span class="divider">|</span>
            <span class="meta-gm line-clamp-1">GM: {{ item.gm }}</span>
          </div>
        </div>

        <div class="arrow-icon">›</div>
      </div>
      
      <div class="spacer"></div>
    </div>

    <Teleport to="body">
      <transition name="pop">
        <div v-if="showModal" class="modal-overlay" @click.self="showModal = false">
          <div class="modal-content">
            
            <div class="modal-top-bar">
              <h3>回憶詳情</h3>
              <button class="close-btn-icon" @click="showModal = false">✕</button>
            </div>
            
            <div class="modal-scroll-area">
              <div class="modal-header-image">
                <img :src="selectedGame.cover" class="modal-cover"/>
                <div class="modal-gradient"></div>
                <h2 class="modal-title-overlay">{{ selectedGame.title }}</h2>
              </div>
              
              <div class="modal-body">
                <div class="info-grid">
                  <div class="info-item full-width">
                    <span class="label">帶場 GM</span>
                    <span class="value">{{ selectedGame.gm }}</span>
                  </div>
                  <div class="info-item">
                    <span class="label">遊玩日期</span>
                    <span class="value">{{ selectedGame.date }}</span>
                  </div>
                  <div class="info-item highlight">
                    <span class="label">獲得經驗</span>
                    <span class="value">+{{ selectedGame.exp }} PT</span>
                  </div>
                  <div class="info-item">
                    <span class="label">遊玩場館</span>
                    <span class="value">{{ selectedGame.branch }}</span>
                  </div>
                </div>

                <div v-if="selectedGame.story_memory" class="story-section">
                  <div class="section-header">
                    <span class="section-icon">📜</span>
                    <span class="section-title">劇本手札</span>
                  </div>
                  <div class="story-card">
                    <p class="story-text">{{ selectedGame.story_memory }}</p>
                  </div>
                </div>

                <div class="safe-zone"></div>
              </div>
            </div>
            
          </div>
        </div>
      </transition>
    </Teleport>
  </div>
</template>

<style scoped>
/* === 頁面基礎 === */
.page-container { 
  width: 100%;
  max-width: 800px; 
  margin: 0 auto;
  box-sizing: border-box;
  padding: 16px; 
  padding-bottom: 100px; 
  min-height: 100vh;
  background-color: transparent; 
  color: #fff;
}

.header-area {
  display: flex; align-items: center; justify-content: space-between;
  margin-bottom: 20px; padding: 0 4px;
  border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 12px;
}
.page-title { font-size: 1.5rem; font-weight: 700; color: #D4AF37; margin: 0; }
.count-badge { color: #888; font-size: 0.9rem; background: rgba(0,0,0,0.5); padding: 2px 10px; border-radius: 12px; }

/* === 列表卡片 === */
.game-card {
  display: flex; align-items: center; 
  background: #111; margin-bottom: 16px; padding: 12px; 
  border-radius: 16px; 
  border: 1px solid #222; 
  transition: all 0.2s ease; cursor: pointer;
  width: 100%; box-sizing: border-box; 
  height: 110px; 
  box-shadow: 0 4px 6px rgba(0,0,0,0.3);
}
.game-card:active { background: #222; transform: scale(0.98); }

.cover-wrapper {
  width: 65px; height: 86px; margin-right: 18px; 
  flex-shrink: 0; border-radius: 8px; overflow: hidden; border: 1px solid #333;
}
.game-cover { width: 100%; height: 100%; object-fit: cover; }

.game-info {
  flex: 1; display: flex; flex-direction: column; justify-content: center;
  min-width: 0; padding-right: 10px; height: 100%; 
}
.game-title { 
  margin: 0 0 10px 0; font-size: 1.15rem; color: #fff; font-weight: 600; line-height: 1.4;
}
.line-clamp-1 {
  display: -webkit-box; -webkit-line-clamp: 1; -webkit-box-orient: vertical;
  overflow: hidden; text-overflow: ellipsis; word-break: break-all;
}

.meta-row { font-size: 0.9rem; color: #999; display: flex; align-items: center; min-width: 0; }
.divider { margin: 0 10px; color: #444; flex-shrink: 0; }
.meta-date { flex-shrink: 0; font-family: monospace; letter-spacing: 0.5px; } 
.meta-gm { flex: 1; min-width: 0; }

.arrow-icon { color: #444; font-size: 1.8rem; padding-left: 10px; flex-shrink: 0; opacity: 0.5; }
.spacer { height: 50px; }

/* === 彈窗系統 === */
.modal-overlay {
  position: fixed; top: 0; left: 0; width: 100%; height: 100%;
  background: rgba(0,0,0,0.85); z-index: 3000; 
  display: flex; justify-content: center; align-items: flex-end; backdrop-filter: blur(5px);
}
.modal-content {
  background: #161616; width: 100%; max-width: 600px;
  border-radius: 24px 24px 0 0; border-top: 1px solid #333;
  overflow: hidden; display: flex; flex-direction: column;
  height: 85vh; box-shadow: 0 -10px 40px rgba(0,0,0,0.8);
}
.modal-top-bar {
  display: flex; justify-content: space-between; align-items: center;
  padding: 15px 25px; border-bottom: 1px solid #222; background: #161616; z-index: 10;
}
.modal-top-bar h3 { margin: 0; color: #fff; font-size: 1.1rem; }
.close-btn-icon {
  background: rgba(255,255,255,0.1); border: none; color: white;
  width: 32px; height: 32px; border-radius: 50%; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 1rem;
}
.modal-scroll-area { flex: 1; overflow-y: auto; -webkit-overflow-scrolling: touch; }
.modal-header-image { position: relative; height: 220px; width: 100%; flex-shrink: 0; }
.modal-cover { width: 100%; height: 100%; object-fit: cover; }
.modal-gradient {
  position: absolute; bottom: 0; left: 0; width: 100%; height: 100px;
  background: linear-gradient(to top, #161616, transparent);
}
.modal-title-overlay {
  position: absolute; bottom: 15px; left: 25px; right: 25px;
  margin: 0; color: #fff; font-size: 1.6rem; font-weight: bold;
  text-shadow: 0 2px 4px rgba(0,0,0,0.8); z-index: 2; line-height: 1.2;
}
.modal-body { padding: 25px; }
.info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 25px; }
.info-item.full-width { grid-column: span 2; }
.info-item { background: #222; padding: 12px; border-radius: 10px; display: flex; flex-direction: column; }
.info-item .label { font-size: 0.75rem; color: #888; margin-bottom: 4px; }
.info-item .value { font-size: 0.95rem; color: #eee; font-weight: 500; line-height: 1.4; }
.info-item.highlight .value { color: #D4AF37; font-weight: bold; }
.story-section { margin-top: 10px; }
.section-header { display: flex; align-items: center; margin-bottom: 10px; }
.section-icon { font-size: 1.1rem; margin-right: 6px; }
.section-title { font-size: 1rem; color: #D4AF37; font-weight: bold; }
.story-card {
  background: linear-gradient(145deg, #1f1f1f, #181818);
  border-left: 3px solid #D4AF37; padding: 15px 20px; border-radius: 4px; position: relative;
}
.story-text { color: #ddd; font-size: 0.95rem; line-height: 1.8; margin: 0; white-space: pre-wrap; font-family: serif; }
.safe-zone { height: 100px; width: 100%; }
.pop-enter-active, .pop-leave-active { transition: transform 0.3s ease; }
.pop-enter-from, .pop-leave-to { transform: translateY(100%); }
</style>