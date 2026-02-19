<script setup>
import { ref, computed, onMounted } from 'vue'
import { useUserStore } from '../stores/user'
// 小四提醒：記得引入你的 supabase client，路徑自己對好
import { supabase } from '../utils/supabase' 

const store = useUserStore()
const showModal = ref(false)
const selectedGame = ref({})

// 🚀 圖片備用邏輯：定義一個統一的預設封面
const DEFAULT_COVER = 'https://images.unsplash.com/photo-1514467953502-5a7820e3efb4?w=600'

// 🚀 確保組件掛載時去抓真實資料，並把巢狀物件攤平
onMounted(async () => {
  // 假設 store 裡面有存目前登入玩家的 ID
  const currentUserId = store.userId || '這裡放測試用的_legacy_id_或_uuid'

  if (store.history.length === 0) {
    try {
      // 小四特製：跨表關聯查詢 (game_participants -> games -> scripts)
      const { data, error } = await supabase
        .from('game_participants')
        .select(`
          id,
          exp_gained,
          created_at,
          games (
            gm_name,
            play_time,
            story_memory,
            scripts (
              title,
              cover_url
            )
          )
        `)
        .eq('user_id', currentUserId)
        .order('created_at', { ascending: false })

      if (error) throw error

      // 將 Supabase 囉嗦的巢狀結構，洗成你 Template 要的扁平格式
      if (data) {
        store.history = data.map(record => ({
          id: record.id,
          title: record.games?.scripts?.title || '未知的神秘劇本',
          cover: record.games?.scripts?.cover_url || DEFAULT_COVER,
          date: record.games?.play_time ? record.games.play_time.split('T')[0] : '未知時間',
          gm: record.games?.gm_name || '無名氏',
          exp: record.exp_gained || 0,
          story_memory: record.games?.story_memory || '', // 這裡就是你要的手札！
          branch: '劇光燈本館' // 之後如果要擴展可以從 DB 抓
        }))
      }
    } catch (e) {
      console.error('撈取歷史紀錄炸了：', e)
    }
  }
})

// 🚀 優先顯示從 Supabase 抓回來的真實資料
const displayList = computed(() => {
  return store.history
})

const openDetail = (game) => {
  selectedGame.value = game
  showModal.value = true
}
</script>


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

/* === 列表卡片 (重點修正區) === */
.game-card {
  display: flex; align-items: center; 
  background: #111; margin-bottom: 16px; padding: 12px; 
  border-radius: 16px; /* 圓角稍微加大一點，比較潤 */
  border: 1px solid #222; 
  transition: all 0.2s ease; cursor: pointer;
  width: 100%; box-sizing: border-box; 
  
  /* 🚀 高度稍微加高，讓整體更大氣 */
  height: 110px; 
  
  box-shadow: 0 4px 6px rgba(0,0,0,0.3);
}
.game-card:active { background: #222; transform: scale(0.98); }

.cover-wrapper {
  /* 🚀 圖片變大！原本 50x70 -> 改為 65x86 */
  width: 65px; 
  height: 86px; 
  margin-right: 18px; /* 距離文字遠一點，比較不擠 */
  flex-shrink: 0; 
  border-radius: 8px; 
  overflow: hidden; 
  border: 1px solid #333;
}
.game-cover { width: 100%; height: 100%; object-fit: cover; }

.game-info {
  flex: 1; display: flex; flex-direction: column; justify-content: center;
  min-width: 0; padding-right: 10px;
  height: 100%; /* 確保內容垂直置中 */
}

/* 🚀 標題修正 */
.game-title { 
  margin: 0 0 10px 0; /* 增加與下面日期的距離，填補空白 */
  font-size: 1.15rem; /* 字體加大 */
  color: #fff; 
  font-weight: 600; 
  line-height: 1.4;
}
.line-clamp-1 {
  display: -webkit-box; -webkit-line-clamp: 1; -webkit-box-orient: vertical;
  overflow: hidden; text-overflow: ellipsis; word-break: break-all;
}

/* 🚀 日期與GM 修正 */
.meta-row { 
  font-size: 0.9rem; /* 字體稍微加大 */
  color: #999; /* 顏色稍微亮一點，對比度好一點 */
  display: flex; align-items: center; min-width: 0; 
}
.divider { margin: 0 10px; color: #444; flex-shrink: 0; }
.meta-date { flex-shrink: 0; font-family: monospace; letter-spacing: 0.5px; } /* 日期用等寬字型比較整齊 */
.meta-gm { flex: 1; min-width: 0; }

.arrow-icon { color: #444; font-size: 1.8rem; padding-left: 10px; flex-shrink: 0; opacity: 0.5; }
.spacer { height: 50px; }

/* === 彈窗系統 (維持不變) === */
.modal-overlay {
  position: fixed; top: 0; left: 0; width: 100%; height: 100%;
  background: rgba(0,0,0,0.85); 
  z-index: 3000; 
  display: flex; justify-content: center; align-items: flex-end; 
  backdrop-filter: blur(5px);
}
.modal-content {
  background: #161616; width: 100%; max-width: 600px;
  border-radius: 24px 24px 0 0; border-top: 1px solid #333;
  overflow: hidden; display: flex; flex-direction: column;
  height: 85vh; box-shadow: 0 -10px 40px rgba(0,0,0,0.8);
}
.modal-top-bar {
  display: flex; justify-content: space-between; align-items: center;
  padding: 15px 25px; border-bottom: 1px solid #222;
  background: #161616; z-index: 10;
}
.modal-top-bar h3 { margin: 0; color: #fff; font-size: 1.1rem; }
.close-btn-icon {
  background: rgba(255,255,255,0.1); border: none; color: white;
  width: 32px; height: 32px; border-radius: 50%;
  cursor: pointer; display: flex; align-items: center; justify-content: center;
  font-size: 1rem;
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

