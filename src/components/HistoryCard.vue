<script setup>
import { ref, computed } from 'vue'
import { useUserStore } from '../stores/user'

const store = useUserStore()
const showModal = ref(false)
const selectedGame = ref({})

// === 🧪 小四特製：預覽用假資料 (當 Store 沒資料時會顯示這個) ===
const MOCK_HISTORY = [
  {
    id: 1,
    title: '不靠譜魔法指南',
    cover: 'https://images.unsplash.com/photo-1634152962476-4b8a00e1915c?auto=format&fit=crop&q=80&w=300&h=400', // 魔法書封面示意圖
    date: '2023-11-22',
    gm: '喬巴',
    exp: 100,
    branch: '台北旗艦館',
    location: '201 包廂',
    mvp: true // 假設你是 MVP
  },
  {
    id: 2,
    title: '那一束月光',
    cover: 'https://images.unsplash.com/photo-1534447677768-be436bb09401?auto=format&fit=crop&q=80&w=300&h=400', // 月光示意圖
    date: '2023-11-03',
    gm: '沙拉',
    exp: 6,
    branch: '台北旗艦館',
    location: '202 包廂',
    mvp: false
  },
  {
    id: 3,
    title: '二十四橋明月夜',
    cover: 'https://images.unsplash.com/photo-1528164344705-47542687000d?auto=format&fit=crop&q=80&w=300&h=400', // 古風示意圖
    date: '2023-10-28',
    gm: '丹尼+阿菊',
    exp: 135,
    branch: '台北旗艦館',
    location: '401 包廂',
    mvp: true
  },
  {
    id: 4,
    title: '光年之外',
    cover: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&q=80&w=300&h=400', // 科幻示意圖
    date: '2023-06-10',
    gm: '蓓蓓',
    exp: 65,
    branch: '台北旗艦館',
    location: '密室 - 作孽',
    mvp: false
  }
]

// 優先顯示 Store 的資料，如果沒有，就顯示假資料給你看 UI
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
          <div v-if="item.mvp" class="mvp-tag">MVP</div>
        </div>

        <div class="game-info">
          <h3 class="game-title">{{ item.title }}</h3>
          <div class="meta-row">
            <span class="icon">📅</span>
            <span class="meta-text">{{ item.date }}</span>
          </div>
          <div class="meta-row">
            <span class="icon">🎭</span>
            <span class="meta-text">GM: {{ item.gm }}</span>
          </div>
        </div>

        <div class="game-status">
          <div class="exp-badge">+{{ item.exp }} PT</div>
          <div class="arrow">›</div>
        </div>
      </div>
      
      <div class="loading-hint">
        到底了，沒有更多回憶囉...
      </div>
    </div>

    <transition name="pop">
      <div v-if="showModal" class="modal-overlay" @click.self="showModal = false">
        <div class="modal-content">
          <div class="modal-header">
            <img :src="selectedGame.cover" class="modal-cover"/>
            <button class="close-btn-icon" @click="showModal = false">✕</button>
          </div>
          
          <div class="modal-body">
            <h2 class="modal-title">{{ selectedGame.title }}</h2>
            <p class="modal-subtitle">{{ selectedGame.branch }} | {{ selectedGame.location }}</p>

            <div class="info-grid">
              <div class="info-item">
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
            </div>

            <p class="memory-text">
              這是一段難忘的旅程。你在此劇本中展現了非凡的推理能力與角色扮演技巧。
              <br><br>
              (這裡之後可以放玩家的文字心得)
            </p>
          </div>
        </div>
      </div>
    </transition>
  </div>
</template>

<style scoped>
/* 頁面基礎設定 */
.page-container { 
  padding: 20px; 
  padding-bottom: 100px; /* 避開底部導航 */
  min-height: 100vh;
  background: linear-gradient(180deg, #121212 0%, #000000 100%);
}

.header-area {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 25px;
  margin-top: 10px;
}

.page-title { 
  color: #fff; 
  font-size: 1.8rem; 
  font-weight: 700;
  letter-spacing: 1px;
  margin: 0;
}

.count-badge {
  background: rgba(212, 175, 55, 0.2);
  color: #D4AF37;
  padding: 4px 12px;
  border-radius: 20px;
  font-size: 0.9rem;
  border: 1px solid rgba(212, 175, 55, 0.4);
}

/* 卡片樣式 */
.game-card {
  display: flex; 
  align-items: center; 
  background: #1E1E1E;
  margin-bottom: 16px; 
  padding: 12px; 
  border-radius: 12px;
  border: 1px solid #2A2A2A; 
  transition: all 0.2s ease;
  position: relative;
  overflow: hidden;
}

.game-card:active { 
  transform: scale(0.98); 
  background: #252525;
}

/* 封面圖區域 */
.cover-wrapper {
  position: relative;
  width: 60px;
  height: 80px;
  flex-shrink: 0;
  margin-right: 15px;
}

.game-cover { 
  width: 100%; 
  height: 100%; 
  object-fit: cover; 
  border-radius: 6px; 
  filter: brightness(0.9);
}

.mvp-tag {
  position: absolute;
  bottom: -4px;
  left: 50%;
  transform: translateX(-50%);
  background: linear-gradient(45deg, #FFD700, #FFA500);
  color: #000;
  font-size: 0.6rem;
  font-weight: bold;
  padding: 2px 6px;
  border-radius: 4px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.5);
}

/* 中間資訊區 */
.game-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
}

.game-title { 
  margin: 0 0 6px 0; 
  font-size: 1rem; 
  color: #fff; 
  font-weight: 600;
  line-height: 1.4;
}

.meta-row {
  display: flex;
  align-items: center;
  font-size: 0.8rem;
  color: #888;
  margin-bottom: 2px;
}

.icon { margin-right: 6px; font-size: 0.9rem; }

/* 右側狀態區 */
.game-status {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  justify-content: space-between;
  height: 80px;
  padding-top: 4px;
  padding-bottom: 4px;
}

.exp-badge {
  color: #D4AF37;
  font-weight: bold;
  font-size: 0.9rem;
  background: rgba(212, 175, 55, 0.1);
  padding: 2px 6px;
  border-radius: 4px;
}

.arrow {
  color: #555;
  font-size: 1.5rem;
  line-height: 1;
}

.loading-hint {
  text-align: center;
  color: #444;
  font-size: 0.8rem;
  margin-top: 20px;
}

/* === 彈窗樣式 (Modal) === */
.modal-overlay {
  position: fixed; top: 0; left: 0; width: 100%; height: 100%;
  background: rgba(0,0,0,0.85); z-index: 200; 
  display: flex; justify-content: center; align-items: flex-end; /* 手機版通常從下面滑上來 */
}

.modal-content {
  background: #1A1A1A; 
  width: 100%; 
  max-width: 500px;
  border-radius: 20px 20px 0 0;
  border-top: 1px solid #333;
  overflow: hidden;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
}

.modal-header {
  position: relative;
  height: 200px;
}

.modal-cover { 
  width: 100%; 
  height: 100%; 
  object-fit: cover; 
  filter: brightness(0.8);
}

.close-btn-icon {
  position: absolute;
  top: 15px;
  right: 15px;
  background: rgba(0,0,0,0.5);
  border: 1px solid rgba(255,255,255,0.2);
  color: white;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  font-size: 1.2rem;
}

.modal-body {
  padding: 25px;
  background: #1A1A1A;
}

.modal-title { margin: 0; color: #fff; font-size: 1.5rem; }
.modal-subtitle { color: #888; font-size: 0.9rem; margin-top: 5px; margin-bottom: 20px; }

.info-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 15px;
  background: #252525;
  padding: 15px;
  border-radius: 12px;
  margin-bottom: 20px;
}

.info-item { display: flex; flex-direction: column; }
.info-item.highlight .value { color: #D4AF37; font-weight: bold; }
.info-item .label { font-size: 0.75rem; color: #666; margin-bottom: 4px; }
.info-item .value { font-size: 0.95rem; color: #ddd; }

.memory-text {
  color: #aaa;
  font-size: 0.9rem;
  line-height: 1.6;
  border-top: 1px solid #333;
  padding-top: 20px;
}

/* 動畫設定 */
.pop-enter-active, .pop-leave-active { transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1); }
.pop-enter-from, .pop-leave-to { transform: translateY(100%); opacity: 0; }
</style>