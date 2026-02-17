<script setup>
import { ref, computed } from 'vue'
import { useUserStore } from '../stores/user'

const store = useUserStore()
const showModal = ref(false)
const selectedGame = ref({})

// === 假資料 ===
const MOCK_HISTORY = [
  { 
    id: 1, 
    title: '不靠譜魔法指南：關於我轉生變成史萊姆去學魔法這檔事', 
    cover: 'https://images.unsplash.com/photo-1634152962476-4b8a00e1915c?w=300', 
    date: '2023-11-22', 
    gm: '喬巴、丹尼、阿菊、佑宥、路人A', 
    exp: 100, 
    branch: '台北旗艦館',
    story_memory: '致 親愛的魔法學徒：\n\n雖然你們最後把圖書館炸了，但不得不說，這是歷代以來最精彩的一次爆炸。' 
  },
  { 
    id: 2, 
    title: '那一束月光', 
    cover: 'https://images.unsplash.com/photo-1534447677768-be436bb09401?w=300', 
    date: '2023-11-03', 
    gm: '沙拉', 
    exp: 6, 
    branch: '台北旗艦館',
    story_memory: '月光灑落之時，我們終將重逢。感謝你演繹出了最深情的那個瞬間。'
  },
  { 
    id: 3, 
    title: '二十四橋明月夜', 
    cover: 'https://images.unsplash.com/photo-1528164344705-47542687000d?w=300', 
    date: '2023-10-28', 
    gm: '丹尼', 
    exp: 135, 
    branch: '台北旗艦館',
    story_memory: null 
  },
  { 
    id: 4, 
    title: '光年之外', 
    cover: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=300', 
    date: '2023-06-10', 
    gm: '蓓蓓', 
    exp: 65, 
    branch: '台北旗艦館',
    story_memory: '系統提示：你的邏輯迴路運作正常。'
  }
]

// 優先顯示 Store 的資料
const displayList = computed(() => {
  return store.history.length > 0 ? store.history : MOCK_HISTORY
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
                    <span class="value">{{ selectedGame.branch || '劇光燈本館' }}</span>
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