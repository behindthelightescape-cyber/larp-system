<script setup>
import { ref, watch } from 'vue'
import { useUserStore } from '../stores/user'
import { supabase } from '../supabase' // 🚀 記得引入 supabase，兌換碼需要它

const store = useUserStore()

// === 個人設定表單 ===
const form = ref({
  name: '',
  phone: '',
  birthday: ''
})
const isBirthdayLocked = ref(false)

// === 兌換碼專區狀態 ===
const promoCodeInput = ref('')
const isRedeeming = ref(false)

// 監聽使用者資料
watch(() => store.userData, (newVal) => {
  if (newVal) {
    form.value.name = newVal.display_name || ''
    form.value.phone = newVal.phone || ''
    form.value.birthday = newVal.birthday || ''
    
    if (newVal.birthday) {
      isBirthdayLocked.value = true
    }
  }
}, { immediate: true })

// 💾 儲存個人資料
const save = async () => {
  if (store.isLoading) return

  if (!form.value.phone || form.value.phone.trim() === '') {
    return alert('⚠️ 請填寫您的手機號碼喔！這是必填欄位。')
  }

  if (form.value.phone.length < 8) {
    return alert('⚠️ 請填寫有效的手機號碼格式喔！')
  }

  const payload = {
    name: form.value.name,
    phone: form.value.phone,
    birthday: form.value.birthday || null 
  }

  const result = await store.updateProfile(payload)
  
  if (result.success) {
    alert(result.message)
    if (form.value.birthday) isBirthdayLocked.value = true
    await store.initLiff() 
  } else {
    alert('儲存失敗: ' + result.message)
  }
}

// 🎁 兌換行銷代碼
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

    // 4. 驗證通過！開始發送票券
    const expiryDate = new Date()
    expiryDate.setDate(expiryDate.getDate() + (promoData.valid_days || 30))

    const { error: insertErr } = await supabase.from('coupons').insert([{
      user_id: store.userData.id,
      title: promoData.title,
      description: promoData.description,
      status: 'available',
      expiry_date: expiryDate.toISOString(),
      source_promo_code: promoData.id 
    }])

    if (insertErr) throw insertErr

    // 5. 更新大金庫的總消耗數量
    await supabase.from('promo_codes')
      .update({ used_count: promoData.used_count + 1 })
      .eq('id', promoData.id)

    // 6. 成功回饋
    alert(`🎉 兌換成功！已將【${promoData.title}】放入您的票券夾！`)
    promoCodeInput.value = '' 
    
    // 重新載入 store 的資料，讓他切換去票券夾時能立刻看到
    await store.initLiff() 

  } catch (err) {
    alert('❌ 兌換失敗：' + err.message)
  } finally {
    isRedeeming.value = false
  }
}
</script>

<template>
  <div class="page-container">
    <h2 class="page-title">個人設定</h2>
    
    <div v-if="store.isLoading" style="text-align: center; color: #888;">載入中...</div>
    
    <div v-else>
        <div class="form-group">
          <label>顯示名稱</label>
          <input v-model="form.name" type="text" placeholder="怎麼稱呼你？" />
        </div>

        <div class="form-group">
          <label>手機號碼 <span style="color: #e74c3c;">*</span></label>
          <input v-model="form.phone" type="tel" placeholder="0912-345-678" />
        </div>

        <div class="form-group">
          <label>生日 (僅供壽星優惠使用)</label>
          
          <input 
            v-if="!isBirthdayLocked"
            v-model="form.birthday" 
            type="date" 
          />
          
          <div v-else class="locked-display">
            {{ form.birthday }}
          </div>
          
          <p v-if="isBirthdayLocked" class="hint-text">🔒 生日已設定，如需修改請聯繫客服。</p>
          <p v-else class="hint-text" style="color: #D4AF37;">🎁 首次填寫生日並完善聯絡資訊，將獲得驚喜禮物！</p>
        </div>

        <button class="save-btn" @click="save">確認修改</button>

        <div class="divider"></div>

        <div class="promo-section">
          <h3 class="promo-title">🎁 領取活動獎勵</h3>
          <p class="promo-desc">輸入專屬活動代碼或好友推薦碼來獲取獎勵！</p>
          
          <div class="promo-input-group">
            <input 
              v-model="promoCodeInput" 
              type="text" 
              placeholder="輸入兌換碼..." 
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

    </div>
  </div>
</template>

<style scoped>
.page-container { padding: 20px 20px 80px 20px; max-width: 600px; margin: 0 auto; }
.page-title { color: #fff; margin-bottom: 30px; font-size: 1.5rem; text-align: center; }

/* === 個人資料表單樣式 === */
.form-group { margin-bottom: 20px; }
.form-group label { display: block; color: #888; margin-bottom: 8px; font-size: 0.9rem; }
.form-group input {
  width: 100%; padding: 12px; background: #1a1a1a; border: 1px solid #333;
  border-radius: 8px; color: #fff; font-size: 1rem; box-sizing: border-box;
}
.form-group input:focus { border-color: #D4AF37; outline: none; }

.locked-display {
  width: 100%; padding: 12px; background: #0a0a0a; border: 1px solid #222;
  border-radius: 8px; color: #666; font-size: 1rem; box-sizing: border-box;
  user-select: none; 
}
.hint-text { font-size: 0.8rem; color: #888; margin-top: 6px; margin-bottom: 0; }

.save-btn {
  width: 100%; padding: 15px; background: #D4AF37; color: #000;
  border: none; border-radius: 8px; font-weight: bold; font-size: 1rem; margin-top: 10px;
  cursor: pointer; transition: 0.2s;
}
.save-btn:active { transform: scale(0.98); }

/* === 分隔線 === */
.divider {
  width: 100%; height: 1px; background: #333; margin: 40px 0;
  position: relative;
}
.divider::after {
  content: '✦'; position: absolute; top: -10px; left: 50%; transform: translateX(-50%);
  background: #050505; padding: 0 10px; color: #555; font-size: 0.8rem;
}

/* === 🚀 兌換碼專區樣式 === */
.promo-section {
  background: linear-gradient(145deg, #151515, #111);
  border: 1px solid #222; padding: 20px; border-radius: 12px;
}
.promo-title { margin: 0 0 5px 0; color: #eee; font-size: 1.1rem; }
.promo-desc { margin: 0 0 15px 0; font-size: 0.85rem; color: #888; }

.promo-input-group { display: flex; gap: 10px; }
.promo-input { 
  flex: 1; padding: 12px 15px; background: #0a0a0a; border: 1px dashed #444; 
  border-radius: 8px; color: #D4AF37; font-size: 1.1rem; text-transform: uppercase; 
  font-weight: bold; letter-spacing: 1px; transition: 0.3s;
  width: 100%; box-sizing: border-box;
}
.promo-input:focus { border-color: #D4AF37; outline: none; border-style: solid; box-shadow: 0 0 10px rgba(212,175,55,0.1); }
.promo-input::placeholder { font-weight: normal; letter-spacing: normal; text-transform: none; color: #555; font-size: 0.95rem; }

.redeem-btn { 
  background: #222; color: #D4AF37; border: 1px solid #D4AF37; 
  padding: 0 20px; border-radius: 8px; font-weight: bold; font-size: 1rem; 
  cursor: pointer; transition: 0.2s; white-space: nowrap; 
}
.redeem-btn:hover { background: rgba(212,175,55,0.1); transform: translateY(-2px); }
.redeem-btn:active { transform: translateY(0); }
.redeem-btn:disabled { background: #111; color: #555; border-color: #333; cursor: not-allowed; transform: none; }
</style>