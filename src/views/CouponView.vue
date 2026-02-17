<script setup>
import { ref } from 'vue'
import { useUserStore } from '../stores/user'

const store = useUserStore()

// === 控制彈窗 ===
const showDetailModal = ref(false)
const showConfirmModal = ref(false)
const selectedCoupon = ref({})

// === 假資料 ===
const coupons = ref([
  {
    id: 1,
    title: '劇本折抵券 $100',
    desc: '1. 本券適用於台北旗艦館所有劇本。\n2. 平假日皆可使用，但在特殊節日（如跨年、春節）需補差額。\n3. 不可與其他優惠併用，亦不可兌換現金。\n4. 請於結帳前出示此畫面，由工作人員核銷。\n5. 若誤觸核銷按鈕，恕不補發，請小心操作。\n6. 本公司保有最終修改與解釋權力。\n7. (測試長度) 請往下滑...請往下滑...按鈕藏在最深處，只有看完故事的人才配擁有寶藏。',
    expiry: '2025-12-31',
    status: 'active',
    type: 'discount',
    code: 'LARP-2025-8888'
  },
  {
    id: 2,
    title: '免費飲品兌換券',
    desc: '憑此券可至櫃檯兌換「劇光特調」一杯。限當日使用完畢。',
    expiry: '2024-06-30',
    status: 'used',
    type: 'gift',
    code: 'DRINK-FREE-001',
    used_at: '2024-05-20 19:30'
  },
  {
    id: 3,
    title: 'MVP 專屬紀念徽章',
    desc: '恭喜獲得 MVP！憑此券領取實體徽章一枚。',
    expiry: '2025-10-10',
    status: 'active',
    type: 'gift',
    code: 'MVP-BADGE-007'
  }
])

const openDetail = (coupon) => {
  selectedCoupon.value = coupon
  showDetailModal.value = true
}

const handleRedeemClick = () => {
  showDetailModal.value = false
  showConfirmModal.value = true
}

const confirmRedeem = () => {
  console.log(`核銷票券: ${selectedCoupon.value.title}`)
  const index = coupons.value.findIndex(c => c.id === selectedCoupon.value.id)
  if (index !== -1) {
    coupons.value[index].status = 'used'
    coupons.value[index].used_at = new Date().toLocaleString()
  }
  showConfirmModal.value = false
  alert('核銷成功！請出示畫面給工作人員。')
}
</script>

<template>
  <div class="page-container">
    <div class="header-area">
      <h2 class="page-title">我的票券</h2>
      <span class="count-badge">{{ coupons.filter(c => c.status === 'active').length }} 張可用</span>
    </div>

    <div class="coupon-list">
      <div 
        v-for="coupon in coupons" 
        :key="coupon.id" 
        class="coupon-ticket"
        :class="{ 'is-used': coupon.status === 'used' }"
        @click="openDetail(coupon)"
      >
        <div class="ticket-left">
          <div class="punch-hole-top"></div>
          <div class="punch-hole-bottom"></div>
        </div>
        <div class="ticket-main">
          <div class="ticket-title">{{ coupon.title }}</div>
          <div class="ticket-expiry" v-if="coupon.status === 'active'">
            效期至: {{ coupon.expiry }}
          </div>
          <div class="ticket-expiry" v-else>
            已於 {{ coupon.used_at }} 核銷
          </div>
        </div>
        <div class="ticket-right">
          <button v-if="coupon.status === 'active'" class="use-btn">使用</button>
          <div v-else class="used-stamp">已核銷</div>
        </div>
      </div>
    </div>

    <transition name="pop">
      <div v-if="showDetailModal" class="modal-overlay" @click.self="showDetailModal = false">
        <div class="modal-content detail-mode">
          
          <div class="modal-header">
            <h3>票券詳情</h3>
            <button class="close-btn-icon" @click="showDetailModal = false">✕</button>
          </div>
          
          <div class="detail-scroll-area">
            <div class="detail-content-wrapper">
              <div class="detail-icon-large">
                {{ selectedCoupon.type === 'discount' ? '🎟️' : '🎁' }}
              </div>
              <h2 class="detail-title">{{ selectedCoupon.title }}</h2>
              <p class="detail-code">NO. {{ selectedCoupon.code }}</p>
              <div class="detail-divider"></div>
              
              <div class="detail-desc">
                <h4>使用說明</h4>
                <p class="desc-text">{{ selectedCoupon.desc }}</p>
              </div>
              
              <p class="expiry-text">有效期限：{{ selectedCoupon.expiry }}</p>
            </div>

            <div class="detail-footer-scroll">
              <button 
                v-if="selectedCoupon.status === 'active'" 
                class="action-btn"
                @click="handleRedeemClick"
              >
                立即使用
              </button>
              <button 
                v-else 
                class="action-btn disabled" 
                disabled
              >
                此票券已失效
              </button>
            </div>
            
            <div class="safe-zone"></div>
          </div>
            
        </div>
      </div>
    </transition>

    <transition name="fade">
      <div v-if="showConfirmModal" class="modal-overlay confirm-overlay" @click.self="showConfirmModal = false">
        <div class="confirm-box">
          <div class="confirm-icon">⚠️</div>
          <h3>確定要核銷嗎？</h3>
          <p>請出示給工作人員確認。<br>一旦核銷將無法復原！</p>
          <div class="confirm-actions">
            <button class="btn-cancel" @click="showConfirmModal = false">取消</button>
            <button class="btn-confirm" @click="confirmRedeem">確認核銷</button>
          </div>
        </div>
      </div>
    </transition>
  </div>
</template>

<style scoped>
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
  display: flex; justify-content: space-between; align-items: center;
  margin-bottom: 20px; padding: 0 4px;
  border-bottom: 1px solid rgba(255,255,255,0.1);
  padding-bottom: 12px;
}
.page-title { font-size: 1.5rem; font-weight: 700; color: #D4AF37; margin: 0; }
.count-badge { font-size: 0.9rem; color: #888; background: rgba(0,0,0,0.5); padding: 4px 10px; border-radius: 20px; }

/* 票券卡片 */
.coupon-ticket {
  display: flex;
  background: linear-gradient(145deg, #222, #1a1a1a);
  height: 90px;
  margin-bottom: 16px;
  border-radius: 12px;
  position: relative;
  overflow: hidden;
  box-shadow: 0 4px 8px rgba(0,0,0,0.3);
  border: 1px solid #333;
  transition: transform 0.2s;
  cursor: pointer;
}
.coupon-ticket:active { transform: scale(0.98); }

.ticket-left {
  width: 24px; background: #D4AF37; position: relative; flex-shrink: 0;
  border-right: 2px dashed #333;
}
.punch-hole-top, .punch-hole-bottom {
  position: absolute; width: 16px; height: 16px; background-color: #050505;
  border-radius: 50%; left: 16px; z-index: 2;
}
.punch-hole-top { top: -8px; }
.punch-hole-bottom { bottom: -8px; }

.ticket-main {
  flex: 1; padding: 10px 15px; padding-left: 20px;
  display: flex; flex-direction: column; justify-content: center;
}
.ticket-title { font-size: 1.1rem; font-weight: bold; color: #fff; margin-bottom: 5px; }
.ticket-expiry { font-size: 0.8rem; color: #888; }

.ticket-right { width: 90px; display: flex; align-items: center; justify-content: center; }
.use-btn {
  background: transparent; color: #D4AF37; border: 1px solid #D4AF37;
  padding: 6px 16px; border-radius: 20px; font-weight: bold; font-size: 0.9rem;
}
.coupon-ticket.is-used { filter: grayscale(1); opacity: 0.6; }
.coupon-ticket.is-used .ticket-left { background: #555; }
.used-stamp {
  border: 2px solid #fff; color: #fff; padding: 5px; 
  font-weight: bold; font-size: 0.8rem; transform: rotate(-15deg); opacity: 0.8;
}

/* === 彈窗設定 === */
.modal-overlay {
  position: fixed; top: 0; left: 0; width: 100%; height: 100%;
  background: rgba(0,0,0,0.85); 
  z-index: 3000;
  display: flex; justify-content: center; align-items: flex-end;
  backdrop-filter: blur(5px);
}

.modal-content.detail-mode {
  width: 100%; max-width: 600px;
  background: #1a1a1a;
  border-radius: 20px 20px 0 0;
  border-top: 1px solid #333;
  
  /* Flex 佈局，讓 header 固定，身體捲動 */
  display: flex; flex-direction: column;
  height: 85vh; /* 高度固定 */
  box-shadow: 0 -10px 40px rgba(0,0,0,0.8);
}

.modal-header {
  display: flex; justify-content: space-between; align-items: center;
  padding: 20px 25px 10px 25px;
  flex-shrink: 0;
  border-bottom: 1px solid #222;
}
.modal-header h3 { margin: 0; color: #fff; }
.close-btn-icon { background: none; border: none; color: #888; font-size: 1.5rem; cursor: pointer; }

/* 🚀 內容捲動區 */
.detail-scroll-area {
  flex: 1; 
  overflow-y: auto; 
  padding: 0 25px;
  
  /* 捲動滑順 */
  -webkit-overflow-scrolling: touch;
}

.detail-content-wrapper { text-align: center; padding-top: 20px; }

.detail-icon-large { font-size: 3rem; margin-bottom: 10px; }
.detail-title { color: #D4AF37; margin: 5px 0; font-size: 1.5rem; }
.detail-code { color: #666; font-family: monospace; letter-spacing: 1px; font-size: 1rem; margin-bottom: 20px; }
.detail-divider { height: 1px; background: #333; margin: 15px 0; }
.detail-desc { text-align: left; color: #ccc; font-size: 0.95rem; line-height: 1.6; background: #222; padding: 15px; border-radius: 8px; }
.desc-text { white-space: pre-wrap; margin: 0; }
.expiry-text { color: #666; font-size: 0.8rem; margin-top: 20px; margin-bottom: 10px; }

/* 🚀 按鈕區塊 (現在在捲動區內) */
.detail-footer-scroll {
  margin-top: 20px;
}

.action-btn {
  width: 100%; padding: 16px; border-radius: 12px; border: none;
  font-size: 1.1rem; font-weight: bold; cursor: pointer;
  background: #D4AF37; color: #000;
  box-shadow: 0 4px 15px rgba(212, 175, 55, 0.4);
}
.action-btn:active { transform: scale(0.98); }
.action-btn.disabled { background: #444; color: #888; box-shadow: none; cursor: not-allowed; }

/* 🚀 安全氣囊：保證滑到底部時，按鈕下面有空間 */
.safe-zone {
  height: 80px; 
  width: 100%;
}

/* Double Check */
.modal-overlay.confirm-overlay { align-items: center; z-index: 3100; }
.confirm-box {
  background: #222; width: 80%; max-width: 320px;
  padding: 25px; border-radius: 16px; text-align: center;
  border: 1px solid #444; box-shadow: 0 10px 30px rgba(0,0,0,0.8);
}
.confirm-icon { font-size: 3rem; margin-bottom: 10px; }
.confirm-box h3 { color: #fff; margin: 0 0 10px 0; }
.confirm-box p { color: #aaa; font-size: 0.9rem; margin: 0 0 20px 0; line-height: 1.5; }
.confirm-actions { display: flex; gap: 10px; }
.confirm-actions button { flex: 1; padding: 12px; border-radius: 8px; border: none; font-weight: bold; cursor: pointer; }
.btn-cancel { background: #333; color: #fff; }
.btn-confirm { background: #D4AF37; color: #000; }

.pop-enter-active, .pop-leave-active { transition: transform 0.3s ease; }
.pop-enter-from, .pop-leave-to { transform: translateY(100%); }
.fade-enter-active, .fade-leave-active { transition: opacity 0.2s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>