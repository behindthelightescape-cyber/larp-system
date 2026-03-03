<script setup>
import { ref, watch, computed } from 'vue'
import { useUserStore } from '../stores/user'
import { supabase } from '../supabase'

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

// === 🤝 推薦碼專區狀態 ===
const myReferralCode = ref('')
const friendCodeInput = ref('')
const referredBy = ref('')
const isReferredLocked = ref(false)
const isGeneratingCode = ref(false)
const isBindingCode = ref(false)

// 🚀 新增：規則彈窗開關
const showRulesModal = ref(false)

// 🚀 新增：老手/新手判定引擎 (根據總經驗值)
const totalExp = computed(() => store.userData?.total_exp || 0)
const isNewbie = computed(() => totalExp.value === 0)

// 監聽使用者資料
watch(() => store.userData, (newVal) => {
  if (newVal) {
    form.value.name = newVal.display_name || ''
    form.value.phone = newVal.phone || ''
    form.value.birthday = newVal.birthday || ''
    if (newVal.birthday) isBirthdayLocked.value = true

    // 載入推薦碼資料
    myReferralCode.value = newVal.my_referral_code || ''
    referredBy.value = newVal.referred_by || ''
    if (newVal.referred_by) isReferredLocked.value = true
  }
}, { immediate: true })

// 💾 儲存個人資料
const save = async () => {
  if (store.isLoading) return
  if (!form.value.phone || form.value.phone.trim() === '') return alert('⚠️ 請填寫您的手機號碼喔！這是必填欄位。')
  if (form.value.phone.length < 8) return alert('⚠️ 請填寫有效的手機號碼格式喔！')

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

// 🎁 兌換官方行銷代碼
const redeemPromoCode = async () => {
  const code = promoCodeInput.value.trim().toUpperCase()
  if (!code) return alert('⚠️ 請輸入兌換碼喔！')
  if (!store.userData) return alert('⚠️ 請先確認登入狀態！')
  
  if (isRedeeming.value) return
  isRedeeming.value = true

  try {
    const { data: promoData, error: promoErr } = await supabase.from('promo_codes').select('*').eq('code', code).single()
    if (promoErr || !promoData) throw new Error('找不到此兌換碼，請確認是否有打錯字喔！')
    if (!promoData.is_active) throw new Error('此兌換碼活動已經結束或暫停囉！')
    if (promoData.max_uses > 0 && promoData.used_count >= promoData.max_uses) throw new Error('這組兌換碼已經被搶光了 😭')

    const { count: userUsedCount } = await supabase.from('coupons').select('*', { count: 'exact', head: true })
      .eq('user_id', store.userData.id).eq('source_promo_code', promoData.id)

    if (userUsedCount >= promoData.limit_per_user) throw new Error(`這組代碼每人最多領 ${promoData.limit_per_user} 次，你已經領滿囉！`)

    const expiryDate = new Date()
    expiryDate.setDate(expiryDate.getDate() + (promoData.valid_days || 30))

    const { error: insertErr } = await supabase.from('coupons').insert([{
      user_id: store.userData.id, title: promoData.title, description: promoData.description,
      status: 'available', expiry_date: expiryDate.toISOString(), source_promo_code: promoData.id 
    }])
    if (insertErr) throw insertErr

    await supabase.from('promo_codes').update({ used_count: promoData.used_count + 1 }).eq('id', promoData.id)

    alert(`🎉 兌換成功！已將【${promoData.title}】放入您的票券夾！`)
    promoCodeInput.value = '' 
    await store.initLiff() 

  } catch (err) {
    alert('❌ 兌換失敗：' + err.message)
  } finally {
    isRedeeming.value = false
  }
}

// 🚀 產生自己的專屬推薦碼 (加上老手防護)
const generateMyCode = async () => {
  if (isNewbie.value) return alert('🔒 萌新請先完成首場遊戲，獲得經驗值後才能解鎖推坑碼喔！')

  if (isGeneratingCode.value) return
  isGeneratingCode.value = true
  
  try {
    const randomCode = Math.random().toString(36).substring(2, 8).toUpperCase()
    const { error } = await supabase.from('users').update({ my_referral_code: randomCode }).eq('id', store.userData.id)
    if (error) throw error
    
    myReferralCode.value = randomCode
    alert('✅ 專屬推薦碼生成成功！趕快分享給朋友吧！')
    await store.initLiff()
  } catch (err) {
    alert('生成失敗，請稍後再試：' + err.message)
  } finally {
    isGeneratingCode.value = false
  }
}

// 🚀 複製自己的推薦碼
const copyMyCode = () => {
  if (!myReferralCode.value) return
  navigator.clipboard.writeText(myReferralCode.value)
    .then(() => alert('📋 推薦碼已複製到剪貼簿！'))
    .catch(() => alert('複製失敗，請手動選取複製'))
}

// 🚀 綁定朋友的推薦碼 (加上新手防護)
const bindFriendCode = async () => {
  if (!isNewbie.value) return alert('🚫 老司機別裝萌新啦！推坑碼僅限「首次遊玩前」綁定喔！')

  const code = friendCodeInput.value.trim().toUpperCase()
  if (!code) return alert('請輸入朋友的推薦碼！')
  if (code === myReferralCode.value) return alert('你不能輸入自己的推薦碼啦！')

  if (isBindingCode.value) return
  isBindingCode.value = true

  try {
    const { data: targetUser, error: searchErr } = await supabase
      .from('users')
      .select('id, display_name')
      .eq('my_referral_code', code)
      .single()

    if (searchErr || !targetUser) throw new Error('找不到這組推薦碼，請確認是否打錯！')

    const { error: updateErr } = await supabase
      .from('users')
      .update({ referred_by: code })
      .eq('id', store.userData.id)

    if (updateErr) throw updateErr

    // 發送新手迎新禮
    const expiryDate = new Date()
    expiryDate.setDate(expiryDate.getDate() + 30) 

    await supabase.from('coupons').insert([{
      user_id: store.userData.id,
      title: '🎁 新手推坑專屬 $50 折價券',
      description: `由【${targetUser.display_name || '老手'}】推薦入坑！憑此券首次遊玩可折抵 50 元。`,
      status: 'available',
      expiry_date: expiryDate.toISOString()
    }])

    alert(`✅ 成功綁定！你是由【${targetUser.display_name || '神秘玩家'}】推薦的！\n\n🎉 系統已自動發送一張【新手推坑 $50 折價券】到你的票券夾！快去看看吧！`)
    
    isReferredLocked.value = true
    referredBy.value = code
    await store.initLiff() 

  } catch (err) {
    alert('❌ 綁定失敗：' + err.message)
  } finally {
    isBindingCode.value = false
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
          <input v-if="!isBirthdayLocked" v-model="form.birthday" type="date" />
          <div v-else class="locked-display">{{ form.birthday }}</div>
          <p v-if="isBirthdayLocked" class="hint-text">🔒 生日已設定，如需修改請聯繫客服。</p>
          <p v-else class="hint-text" style="color: #D4AF37;">🎁 首次填寫生日並完善聯絡資訊，將獲得驚喜禮物！</p>
        </div>

        <button class="save-btn" @click="save">確認修改</button>

        <div class="divider"></div>

        <div class="promo-section">
          <h3 class="promo-title">🎁 官方活動代碼</h3>
          <p class="promo-desc">輸入官方發布的專屬活動代碼來獲取折價券！</p>
          
          <div class="promo-input-group">
            <input 
              v-model="promoCodeInput" 
              type="text" 
              placeholder="輸入兌換碼..." 
              class="promo-input"
              @keyup.enter="redeemPromoCode"
            />
            <button class="redeem-btn" @click="redeemPromoCode" :disabled="isRedeeming">
              {{ isRedeeming ? '兌換中...' : '兌換' }}
            </button>
          </div>
        </div>

        <div class="promo-section mt-4" style="border-color: rgba(212, 175, 55, 0.3);">
          
          <div class="promo-header-flex">
            <h3 class="promo-title" style="color: #D4AF37; margin: 0;">🤝 好友推坑計畫</h3>
            <button class="rules-btn" @click="showRulesModal = true">❓ 規則說明</button>
          </div>
          
          <p class="promo-desc mt-2">分享專屬碼給新手，當他們完成第一場遊戲，雙方都能獲得獎勵！</p>
          
          <div class="referral-box">
            <span class="ref-label">你的專屬推坑碼：</span>
            <div v-if="myReferralCode" class="ref-display-group">
              <span class="ref-code">{{ myReferralCode }}</span>
              <button class="ref-copy-btn" @click="copyMyCode">📋 複製</button>
            </div>
            <button v-else-if="!isNewbie" class="btn-generate" @click="generateMyCode" :disabled="isGeneratingCode">
              {{ isGeneratingCode ? '生成中...' : '✨ 點我生成專屬代碼' }}
            </button>
            <div v-else class="locked-display mt-2" style="border-color: #444; color: #888; text-align: center; font-size: 0.85rem; padding: 10px;">
              🔒 需完成首場遊戲後解鎖專屬碼
            </div>
          </div>

          <div style="margin-top: 15px;">
            <span class="ref-label">是朋友推薦你來的嗎？</span>
            
            <div v-if="isReferredLocked" class="locked-display mt-2" style="border-color: #D4AF37; color: #D4AF37; background: rgba(212, 175, 55, 0.05); text-align: center; font-weight: bold;">
              🤝 已綁定推坑老手：{{ referredBy }}
            </div>
            
            <div v-else-if="!isNewbie" class="locked-display mt-2" style="border-color: rgba(231, 76, 60, 0.3); color: #e74c3c; background: rgba(231, 76, 60, 0.05); text-align: center; font-size: 0.85rem; padding: 10px;">
              🚫 綁定失敗：推坑碼僅限「首次遊玩前」填寫！
            </div>
            
            <div v-else class="promo-input-group mt-2">
              <input 
                v-model="friendCodeInput" 
                type="text" 
                placeholder="輸入推坑碼，現領 $50..." 
                class="promo-input friend-input"
              />
              <button class="redeem-btn friend-btn" @click="bindFriendCode" :disabled="isBindingCode">
                綁定
              </button>
            </div>
          </div>
        </div>

    </div>

    <Teleport to="body">
      <transition name="fade">
        <div v-if="showRulesModal" class="modal-overlay" @click.self="showRulesModal = false">
          <div class="rules-modal-content">
            <div class="rules-header">
              <h3 style="color: #D4AF37; margin: 0;">🤝 推坑計畫規則說明</h3>
              <button class="close-btn-icon" @click="showRulesModal = false">✕</button>
            </div>
            
            <div class="rules-body">
              <div class="rule-item">
                <div class="rule-icon">🌱</div>
                <div class="rule-text">
                  <h4>誰可以填寫別人的推坑碼？</h4>
                  <p>必須是<strong style="color: #e74c3c;">從未遊玩過（經驗值為 0）</strong>的新手才能填寫。綁定後即可立即獲得 $50 迎新折價券！<br><span style="font-size: 0.8rem; color: #888;">(若已完成過首場遊戲，系統將自動關閉綁定功能，無法事後補填喔！)</span></p>
                </div>
              </div>

              <div class="rule-item">
                <div class="rule-icon">👑</div>
                <div class="rule-text">
                  <h4>誰可以產生自己的推坑碼？</h4>
                  <p>只要您<strong style="color: #D4AF37;">完成過至少一場遊戲</strong>，系統就會為您解鎖專屬的推坑碼，讓您可以分享給親朋好友。</p>
                </div>
              </div>

              <div class="rule-item">
                <div class="rule-icon">🎁</div>
                <div class="rule-text">
                  <h4>老手要怎麼拿到推坑獎勵？</h4>
                  <p>當您推薦的新手成功綁定您的代碼，並且來店裡<strong style="color: #D4AF37;">完成他們的第一場遊戲（掃描核銷獲得經驗值）</strong>後，系統就會自動發送一張 $100 折價券到您的票券夾中！</p>
                </div>
              </div>
            </div>
            
            <button class="rules-close-btn" @click="showRulesModal = false">我知道了</button>
          </div>
        </div>
      </transition>
    </Teleport>

  </div>
</template>

<style scoped>
.page-container { padding: 20px 20px 80px 20px; max-width: 600px; margin: 0 auto; }
.page-title { color: #fff; margin-bottom: 30px; font-size: 1.5rem; text-align: center; }

/* === 個人資料表單樣式 === */
.form-group { margin-bottom: 20px; }
.form-group label { display: block; color: #888; margin-bottom: 8px; font-size: 0.9rem; }
.form-group input { width: 100%; padding: 12px; background: #1a1a1a; border: 1px solid #333; border-radius: 8px; color: #fff; font-size: 1rem; box-sizing: border-box;}
.form-group input:focus { border-color: #D4AF37; outline: none; }

.locked-display { width: 100%; padding: 12px; background: #0a0a0a; border: 1px solid #222; border-radius: 8px; color: #666; font-size: 1rem; box-sizing: border-box; user-select: none; }
.hint-text { font-size: 0.8rem; color: #888; margin-top: 6px; margin-bottom: 0; }

.save-btn { width: 100%; padding: 15px; background: #D4AF37; color: #000; border: none; border-radius: 8px; font-weight: bold; font-size: 1rem; margin-top: 10px; cursor: pointer; transition: 0.2s;}
.save-btn:active { transform: scale(0.98); }

.divider { width: 100%; height: 1px; background: #333; margin: 40px 0; position: relative;}
.divider::after { content: '✦'; position: absolute; top: -10px; left: 50%; transform: translateX(-50%); background: #050505; padding: 0 10px; color: #555; font-size: 0.8rem;}

/* === 兌換碼/推薦碼專區樣式 === */
.promo-section { background: linear-gradient(145deg, #151515, #111); border: 1px solid #222; padding: 20px; border-radius: 12px; }

/* 🚀 Flexbox 標題列 */
.promo-header-flex { display: flex; justify-content: space-between; align-items: center; }

.promo-title { margin: 0; color: #eee; font-size: 1.1rem; }
.promo-desc { margin: 0 0 15px 0; font-size: 0.85rem; color: #888; line-height: 1.4;}

.promo-input-group { display: flex; gap: 10px; }
.promo-input { flex: 1; padding: 12px 15px; background: #0a0a0a; border: 1px dashed #444; border-radius: 8px; color: #D4AF37; font-size: 1.1rem; text-transform: uppercase; font-weight: bold; letter-spacing: 1px; transition: 0.3s; width: 100%; box-sizing: border-box;}
.promo-input:focus { border-color: #D4AF37; outline: none; border-style: solid; box-shadow: 0 0 10px rgba(212,175,55,0.1); }
.promo-input::placeholder { font-weight: normal; letter-spacing: normal; text-transform: none; color: #555; font-size: 0.95rem; }

.redeem-btn { background: #222; color: #D4AF37; border: 1px solid #D4AF37; padding: 0 20px; border-radius: 8px; font-weight: bold; font-size: 1rem; cursor: pointer; transition: 0.2s; white-space: nowrap; }
.redeem-btn:hover { background: rgba(212,175,55,0.1); transform: translateY(-2px); }
.redeem-btn:active { transform: translateY(0); }
.redeem-btn:disabled { background: #111; color: #555; border-color: #333; cursor: not-allowed; transform: none; }

/* 推薦碼特化樣式 */
.referral-box { background: #0a0a0a; border: 1px solid #222; padding: 15px; border-radius: 8px; margin-top: 10px;}
.ref-label { font-size: 0.85rem; color: #888; display: block; margin-bottom: 8px;}
.ref-display-group { display: flex; justify-content: space-between; align-items: center; background: #1a1a1a; padding: 10px 15px; border-radius: 6px; border: 1px dashed #D4AF37;}
.ref-code { font-size: 1.3rem; font-weight: 900; color: #D4AF37; letter-spacing: 2px; font-family: monospace;}
.ref-copy-btn { background: #222; color: #D4AF37; border: 1px solid #D4AF37; padding: 6px 12px; border-radius: 4px; font-size: 0.85rem; cursor: pointer; font-weight: bold; transition: 0.2s;}
.ref-copy-btn:hover { background: #D4AF37; color: black; }
.ref-copy-btn:active { transform: scale(0.95); }

.btn-generate { width: 100%; padding: 12px; background: rgba(212, 175, 55, 0.05); border: 1px solid #D4AF37; color: #D4AF37; border-radius: 8px; font-weight: bold; cursor: pointer; transition: 0.2s;}
.btn-generate:hover { background: rgba(212, 175, 55, 0.15); }

.friend-input { color: #D4AF37; border-color: #333; }
.friend-input:focus { border-color: #D4AF37; box-shadow: 0 0 10px rgba(212, 175, 55, 0.1); }
.friend-btn { color: #D4AF37; border-color: #D4AF37; }
.friend-btn:hover { background: rgba(212, 175, 55, 0.1); }

/* ❓ 規則按鈕 (已修正，不再用 absolute) */
.rules-btn { background: transparent; border: 1px solid #555; color: #aaa; border-radius: 20px; padding: 4px 10px; font-size: 0.75rem; cursor: pointer; transition: 0.2s; white-space: nowrap; }
.rules-btn:hover { color: #D4AF37; border-color: #D4AF37;}

/* === 📖 規則彈窗樣式 === */
.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.85); display: flex; justify-content: center; align-items: center; z-index: 9999; backdrop-filter: blur(5px); padding: 20px; }
.rules-modal-content { background: #161616; width: 100%; max-width: 450px; border-radius: 16px; border: 1px solid #333; box-shadow: 0 10px 40px rgba(0,0,0,0.8); display: flex; flex-direction: column; overflow: hidden; }
.rules-header { padding: 20px; background: #111; border-bottom: 1px solid #222; display: flex; justify-content: space-between; align-items: center; }
.close-btn-icon { background: none; border: none; color: #888; font-size: 1.2rem; cursor: pointer; }
.rules-body { padding: 20px; max-height: 60vh; overflow-y: auto; }
.rule-item { display: flex; gap: 15px; margin-bottom: 25px; }
.rule-icon { font-size: 2rem; flex-shrink: 0; }
.rule-text h4 { margin: 0 0 5px 0; color: #eee; font-size: 1rem; }
.rule-text p { margin: 0; color: #aaa; font-size: 0.9rem; line-height: 1.5; }
.rules-close-btn { width: calc(100% - 40px); margin: 0 20px 20px 20px; padding: 12px; background: #222; color: #fff; border: 1px solid #444; border-radius: 8px; font-weight: bold; cursor: pointer; }
.rules-close-btn:hover { background: #333; }

.mt-2 { margin-top: 8px; }
.mt-4 { margin-top: 25px; }

.fade-enter-active, .fade-leave-active { transition: opacity 0.3s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>