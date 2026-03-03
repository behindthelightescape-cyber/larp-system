<script setup>
import { ref, computed } from 'vue'
import { useUserStore } from '../stores/user'
import { supabase } from '../supabase'

const store = useUserStore()

const promoCodeInput = ref('')
const isRedeeming = ref(false)

// 過濾並排序：可用的排前面，過期的/已使用的排後面
const sortedCoupons = computed(() => {
  return [...store.coupons].sort((a, b) => {
    if (a.status === 'available' && b.status !== 'available') return -1
    if (a.status !== 'available' && b.status === 'available') return 1
    return new Date(b.created_at) - new Date(a.created_at)
  })
})

const formatDate = (dateStr) => {
  if (!dateStr) return '無期限'
  const d = new Date(dateStr)
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

// 🚀 核心印鈔邏輯：玩家輸入兌換碼
const redeemPromoCode = async () => {
  const code = promoCodeInput.value.trim().toUpperCase()
  if (!code) return alert('⚠️ 請輸入兌換碼喔！')
  if (!store.userData) return alert('⚠️ 請先確認登入狀態！')
  
  if (isRedeeming.value) return
  isRedeeming.value = true

  try {
    // 1. 去金庫尋找這張兌換碼
    const { data: promoData, error: promoErr } = await supabase
      .from('promo_codes')
      .select('*')
      .eq('code', code)
      .single()

    if (promoErr || !promoData) throw new Error('找不到此兌換碼，請確認是否有打錯字喔！')
    
    // 2. 狀態與庫存檢查
    if (!promoData.is_active) throw new Error('此兌換碼活動已經結束或暫停囉！')
    if (promoData.max_uses > 0 && promoData.used_count >= promoData.max_uses) {
      throw new Error('手腳太慢啦！這組兌換碼已經被搶光了 😭')
    }

    // 3. 玩家個人領取上限檢查 (防白嫖機制)
    const { count: userUsedCount, error: countErr } = await supabase
      .from('coupons')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', store.userData.id)
      .eq('source_promo_code', promoData.id)

    if (userUsedCount >= promoData.limit_per_user) {
      throw new Error(`這組代碼每人最多只能領 ${promoData.limit_per_user} 次，你已經領滿囉！`)
    }

    // 4. 驗證通過！開始印鈔票發給玩家！
    const expiryDate = new Date()
    expiryDate.setDate(expiryDate.getDate() + (promoData.valid_days || 30))

    const { error: insertErr } = await supabase.from('coupons').insert([{
      user_id: store.userData.id,
      title: promoData.title,
      description: promoData.description,
      status: 'available',
      expiry_date: expiryDate.toISOString(),
      source_promo_code: promoData.id // 🚀 記錄來源，防刷機制的核心
    }])

    if (insertErr) throw insertErr

    // 5. 更新大金庫的總消耗數量
    await supabase.from('promo_codes')
      .update({ used_count: promoData.used_count + 1 })
      .eq('id', promoData.id)

    // 6. 成功回饋與重整畫面
    alert(`🎉 兌換成功！已將【${promoData.title}】放入您的票券夾！`)
    promoCodeInput.value = '' // 清空輸入框
    
    // 呼叫大腦重新去資料庫撈最新的票券，讓畫面瞬間生出那張券
    // (注意：你原本的 user.js 如果沒有把 fetchUserExtraData export 出來，可以直接重跑 initLiff，或者我們用更聰明的方法)
    window.location.reload() // 為了保證狀態最乾淨，這裡先用重整。稍後整理 EXP 引擎時我們會把它優化成無感刷新。

  } catch (err) {
    alert('❌ 兌換失敗：' + err.message)
  } finally {
    isRedeeming.value = false
  }
}
</script>

<template>
  <div class="page-container">
    <div class="header-section">
      <h2 class="page-title">我的票券夾</h2>
      <p class="page-subtitle">結帳時請主動出示給工作人員核銷喔！</p>
    </div>
    
    <div v-if="store.isLoading" class="loading-state">
      <div class="spinner"></div>
    </div>
    
    <div v-else class="content-wrapper">
      
      <div class="promo-code-box">
        <h3 class="promo-title">🎁 領取活動獎勵</h3>
        <div class="input-group">
          <input 
            v-model="promoCodeInput" 
            type="text" 
            placeholder="請輸入兌換碼..." 
            class="promo-input"
            @keyup.enter="redeemPromoCode"
          />
          <button 
            class="redeem-btn" 
            @click="redeemPromoCode"
            :disabled="isRedeeming"
          >
            {{ isRedeeming ? '兌換中...' : '兌換' }}
          </button>
        </div>
      </div>

      <div v-if="sortedCoupons.length === 0" class="empty-state">
        目前口袋空空如也，多參加活動來獲取折價券吧！
      </div>

      <div class="coupon-list">
        <div 
          v-for="coupon in sortedCoupons" 
          :key="coupon.id" 
          class="coupon-card"
          :class="coupon.status"
        >
          <div class="coupon-left">
            <div class="coupon-icon">🎟️</div>
          </div>
          <div class="coupon-right">
            <h3 class="coupon-name">{{ coupon.title }}</h3>
            <p class="coupon-desc">{{ coupon.description }}</p>
            <div class="coupon-meta">
              <span class="expiry-date">效期至：{{ formatDate(coupon.expiry_date) }}</span>
              <span class="status-badge" v-if="coupon.status === 'used'">已使用</span>
              <span class="status-badge expired" v-else-if="coupon.status === 'expired'">已過期</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.page-container { padding: 20px 20px 100px 20px; max-width: 600px; margin: 0 auto; }
.header-section { text-align: center; margin-bottom: 25px; }
.page-title { color: #D4AF37; margin: 0 0 5px 0; font-size: 1.8rem; font-weight: 900; letter-spacing: 1px;}
.page-subtitle { color: #888; font-size: 0.9rem; margin: 0; }

.loading-state { display: flex; justify-content: center; padding: 50px 0; }
.spinner { width: 40px; height: 40px; border: 4px solid rgba(212, 175, 55, 0.2); border-top-color: #D4AF37; border-radius: 50%; animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

/* 🚀 兌換碼區塊樣式 */
.promo-code-box { background: linear-gradient(145deg, #1a1a1a, #111); border: 1px solid #333; padding: 20px; border-radius: 16px; margin-bottom: 25px; box-shadow: 0 5px 20px rgba(0,0,0,0.5); }
.promo-title { margin: 0 0 15px 0; color: #eee; font-size: 1.1rem; }
.input-group { display: flex; gap: 10px; }
.promo-input { flex: 1; padding: 12px 15px; background: #222; border: 1px solid #444; border-radius: 8px; color: #fff; font-size: 1rem; text-transform: uppercase; font-weight: bold; letter-spacing: 1px; transition: 0.3s;}
.promo-input:focus { border-color: #D4AF37; outline: none; box-shadow: 0 0 10px rgba(212,175,55,0.2); }
.promo-input::placeholder { font-weight: normal; letter-spacing: normal; text-transform: none; color: #666;}
.redeem-btn { background: #D4AF37; color: black; border: none; padding: 0 25px; border-radius: 8px; font-weight: bold; font-size: 1rem; cursor: pointer; transition: 0.2s; white-space: nowrap; }
.redeem-btn:hover { background: #f1c40f; transform: translateY(-2px); }
.redeem-btn:active { transform: translateY(0); }
.redeem-btn:disabled { background: #555; color: #888; cursor: not-allowed; transform: none; }

.empty-state { text-align: center; color: #666; padding: 40px 20px; border: 1px dashed #333; border-radius: 12px; background: #111; }

.coupon-list { display: flex; flex-direction: column; gap: 15px; }
.coupon-card { display: flex; background: #1a1a1a; border: 1px solid #333; border-radius: 12px; overflow: hidden; position: relative; transition: 0.3s; }
.coupon-card.available { border-color: #D4AF37; background: linear-gradient(135deg, rgba(30,26,10,0.8), rgba(26,26,26,0.9)); box-shadow: 0 5px 15px rgba(212,175,55,0.1); }
.coupon-card.used, .coupon-card.expired { opacity: 0.5; filter: grayscale(100%); }

.coupon-left { background: #111; padding: 20px; display: flex; align-items: center; justify-content: center; border-right: 1px dashed #444; position: relative; }
.coupon-card.available .coupon-left { background: rgba(212,175,55,0.1); border-right-color: rgba(212,175,55,0.3); }
.coupon-left::before, .coupon-left::after { content: ''; position: absolute; right: -8px; width: 16px; height: 16px; background: #050505; border-radius: 50%; border: 1px solid #333; z-index: 1; }
.coupon-left::before { top: -9px; border-top: none; border-left: none; transform: rotate(45deg); }
.coupon-left::after { bottom: -9px; border-bottom: none; border-right: none; transform: rotate(225deg); }
.coupon-card.available .coupon-left::before, .coupon-card.available .coupon-left::after { border-color: #D4AF37; }

.coupon-icon { font-size: 2rem; }

.coupon-right { padding: 15px; flex: 1; display: flex; flex-direction: column; justify-content: center; }
.coupon-name { margin: 0 0 5px 0; font-size: 1.1rem; color: #eee; }
.coupon-card.available .coupon-name { color: #D4AF37; font-weight: bold; }
.coupon-desc { margin: 0 0 10px 0; font-size: 0.85rem; color: #aaa; line-height: 1.4; }
.coupon-meta { display: flex; justify-content: space-between; align-items: center; font-size: 0.8rem; font-weight: bold; }
.expiry-date { color: #888; }
.coupon-card.available .expiry-date { color: #e67e22; }

.status-badge { background: #333; color: #fff; padding: 3px 8px; border-radius: 4px; font-size: 0.7rem; }
.status-badge.expired { background: #331111; color: #e74c3c; border: 1px solid #552222; }
</style>