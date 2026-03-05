<script setup>
import { ref, watch, computed } from 'vue'
import { useUserStore } from '../stores/user'
import { supabase } from '../supabase'

const store = useUserStore()

const form = ref({ name: '', phone: '', birthday: '' })
const isBirthdayLocked = ref(false)
const promoCodeInput = ref('')
const isRedeeming = ref(false)
const myReferralCode = ref('')
const friendCodeInput = ref('')
const referredBy = ref('')
const isReferredLocked = ref(false)
const isGeneratingCode = ref(false)
const isBindingCode = ref(false)
const showRulesModal = ref(false)

const totalExp = computed(() => store.userData?.total_exp || 0)
const isNewbie = computed(() => totalExp.value === 0)

watch(() => store.userData, (newVal) => {
  if (newVal) {
    form.value.name = newVal.display_name || ''
    form.value.phone = newVal.phone || ''
    form.value.birthday = newVal.birthday || ''
    if (newVal.birthday) isBirthdayLocked.value = true
    myReferralCode.value = newVal.my_referral_code || ''
    referredBy.value = newVal.referred_by || ''
    if (newVal.referred_by) isReferredLocked.value = true
  }
}, { immediate: true })

const save = async () => {
  if (store.isLoading) return
  if (!form.value.phone || form.value.phone.trim() === '') return alert('⚠️ 請填寫您的手機號碼喔！這是必填欄位。')
  if (form.value.phone.length < 8) return alert('⚠️ 請填寫有效的手機號碼格式喔！')
  const payload = { name: form.value.name, phone: form.value.phone, birthday: form.value.birthday || null }
  const result = await store.updateProfile(payload)
  if (result.success) {
    alert(result.message)
    if (form.value.birthday) isBirthdayLocked.value = true
    await store.initLiff()
  } else {
    alert('儲存失敗: ' + result.message)
  }
}

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

const copyMyCode = () => {
  if (!myReferralCode.value) return
  navigator.clipboard.writeText(myReferralCode.value)
    .then(() => alert('📋 推薦碼已複製到剪貼簿！'))
    .catch(() => alert('複製失敗，請手動選取複製'))
}

const bindFriendCode = async () => {
  if (!isNewbie.value) return alert('🚫 老司機別裝萌新啦！推坑碼僅限「首次遊玩前」綁定喔！')
  const code = friendCodeInput.value.trim().toUpperCase()
  if (!code) return alert('請輸入朋友的推薦碼！')
  if (code === myReferralCode.value) return alert('你不能輸入自己的推薦碼啦！')
  if (isBindingCode.value) return
  isBindingCode.value = true
  try {
    const { data: targetUser, error: searchErr } = await supabase.from('users').select('id, display_name').eq('my_referral_code', code).single()
    if (searchErr || !targetUser) throw new Error('找不到這組推薦碼，請確認是否打錯！')
    const { error: updateErr } = await supabase.from('users').update({ referred_by: code }).eq('id', store.userData.id)
    if (updateErr) throw updateErr
    const { data: rewards } = await supabase.from('system_rewards').select('*').eq('event_type', 'referral_newbie').eq('is_active', true)
    let grantedTitles = []
    if (rewards && rewards.length > 0) {
      const newCoupons = []
      for (const rule of rewards) {
        const qty = rule.reward_qty || 1
        const expiryDate = new Date()
        expiryDate.setDate(expiryDate.getDate() + (rule.valid_days || 30))
        const finalDesc = (rule.reward_desc || '').replace('{referrer}', targetUser.display_name || '熱心老手')
        for (let i = 0; i < qty; i++) {
          newCoupons.push({ user_id: store.userData.id, title: rule.reward_title, description: finalDesc, status: 'available', expiry_date: expiryDate.toISOString() })
        }
        grantedTitles.push(`${rule.reward_title}` + (qty > 1 ? ` (x${qty})` : ''))
      }
      if (newCoupons.length > 0) {
        const { error: insertErr } = await supabase.from('coupons').insert(newCoupons)
        if (insertErr) console.error('發送新手禮失敗:', insertErr)
      }
    }
    let alertMsg = `✅ 成功綁定！你是由【${targetUser.display_name || '神秘玩家'}】推薦的！`
    if (grantedTitles.length > 0) alertMsg += `\n\n🎉 系統已自動發送迎新大禮包：\n- ` + grantedTitles.join('\n- ') + `\n\n快去票券夾看看吧！`
    else alertMsg += `\n\n(目前官方暫無迎新派發活動，但您的綁定已成功紀錄！)`
    alert(alertMsg)
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

    <!-- Header -->
    <div class="page-header">
      <div class="header-deco">✦</div>
      <h2 class="page-title">個人設定</h2>
      <p class="page-subtitle">管理你的冒險者資料與推坑計畫</p>
    </div>

    <div v-if="store.isLoading" class="loading-state">
      <div class="spinner"></div>
      <span>載入中...</span>
    </div>

    <div v-else class="sections-wrap">

      <!-- ── 個人資料 ── -->
      <div class="setting-card">
        <div class="card-deco-top"></div>
        <div class="card-section-label">
          <span class="section-icon">👤</span>
          <span>個人資料</span>
        </div>

        <div class="form-group">
          <label class="field-label">顯示名稱</label>
          <input v-model="form.name" type="text" placeholder="怎麼稱呼你？" class="field-input" />
        </div>

        <div class="form-group">
          <label class="field-label">手機號碼 <span class="required-star">*</span></label>
          <input v-model="form.phone" type="tel" placeholder="0912-345-678" class="field-input" />
        </div>

        <div class="form-group">
          <label class="field-label">生日 <span class="field-note">（壽星優惠專用）</span></label>
          <input v-if="!isBirthdayLocked" v-model="form.birthday" type="date" class="field-input" />
          <div v-else class="locked-field">
            <span class="lock-icon">🔒</span>
            <span>{{ form.birthday }}</span>
          </div>
          <p v-if="isBirthdayLocked" class="hint-text">生日已設定，如需修改請聯繫客服。</p>
          <p v-else class="hint-text hint-gold">🎁 首次填寫生日並完善資料，將獲得驚喜禮物！</p>
        </div>

        <button class="save-btn" @click="save">
          <span>確認修改</span>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
      </div>

      <!-- 分隔 -->
      <div class="section-divider">
        <div class="div-line"></div>
        <span class="div-gem">◆</span>
        <div class="div-line"></div>
      </div>

      <!-- ── 官方活動代碼 ── -->
      <div class="setting-card">
        <div class="card-deco-top"></div>
        <div class="card-section-label">
          <span class="section-icon">🎁</span>
          <span>官方活動代碼</span>
        </div>
        <p class="card-desc">輸入官方發布的專屬活動代碼來獲取折價券！</p>

        <div class="code-input-row">
          <input
            v-model="promoCodeInput"
            type="text"
            placeholder="輸入兌換碼..."
            class="code-input"
            @keyup.enter="redeemPromoCode"
          />
          <button class="action-btn" @click="redeemPromoCode" :disabled="isRedeeming">
            {{ isRedeeming ? '兌換中...' : '兌換' }}
          </button>
        </div>
      </div>

      <!-- ── 好友推坑計畫 ── -->
      <div class="setting-card referral-card">
        <div class="card-deco-top gold-deco"></div>

        <div class="referral-card-header">
          <div class="card-section-label" style="border:none;padding:0;margin:0">
            <span class="section-icon">🤝</span>
            <span style="color:#D4AF37">好友推坑計畫</span>
          </div>
          <button class="rules-pill-btn" @click="showRulesModal = true">❓ 規則</button>
        </div>

        <p class="card-desc">分享專屬碼給新手，完成首場遊戲後雙方都能獲得獎勵！</p>

        <!-- 我的推坑碼 -->
        <div class="sub-block">
          <div class="sub-label">你的專屬推坑碼</div>

          <div v-if="myReferralCode" class="code-display-box">
            <div class="code-display-left">
              <span class="code-deco">◈</span>
              <span class="big-code">{{ myReferralCode }}</span>
            </div>
            <button class="copy-btn" @click="copyMyCode">📋 複製</button>
          </div>

          <button v-else-if="!isNewbie" class="generate-btn" @click="generateMyCode" :disabled="isGeneratingCode">
            <span>{{ isGeneratingCode ? '生成中...' : '✨ 點我生成專屬代碼' }}</span>
          </button>

          <div v-else class="locked-info-box">
            <span class="lock-icon">🔒</span>
            <span>需完成首場遊戲後解鎖</span>
          </div>
        </div>

        <!-- 綁定朋友碼 -->
        <div class="sub-block" style="margin-top:16px">
          <div class="sub-label">是朋友推薦你來的嗎？</div>

          <div v-if="isReferredLocked" class="bound-box">
            <span>🤝 已綁定推坑老手</span>
            <span class="bound-code">{{ referredBy }}</span>
          </div>

          <div v-else-if="!isNewbie" class="locked-info-box locked-red">
            <span>🚫</span>
            <span>推坑碼僅限首次遊玩前填寫</span>
          </div>

          <div v-else class="code-input-row">
            <input
              v-model="friendCodeInput"
              type="text"
              placeholder="輸入朋友的推坑碼..."
              class="code-input"
            />
            <button class="action-btn gold-btn" @click="bindFriendCode" :disabled="isBindingCode">
              {{ isBindingCode ? '綁定中...' : '綁定' }}
            </button>
          </div>
        </div>
      </div>

    </div>

    <!-- 規則說明 Modal -->
    <Teleport to="body">
      <transition name="slide-up">
        <div v-if="showRulesModal" class="modal-overlay" @click.self="showRulesModal = false">
          <div class="rules-modal">
            <div class="modal-handle"></div>
            <div class="rules-modal-header">
              <h3>🤝 推坑計畫規則說明</h3>
              <button class="modal-close-btn" @click="showRulesModal = false">✕</button>
            </div>
            <div class="rules-modal-body">
              <div class="rule-item">
                <div class="rule-icon-box">🌱</div>
                <div class="rule-text">
                  <h4>誰可以填寫別人的推坑碼？</h4>
                  <p>必須是<strong class="text-red">從未遊玩過（經驗值為 0）</strong>的新手才能填寫。綁定後即可立即獲得 $50 迎新折價券！<br>
                  <span class="text-dim">（若已完成過首場遊戲，系統將自動關閉綁定功能，無法事後補填喔！）</span></p>
                </div>
              </div>
              <div class="rule-item">
                <div class="rule-icon-box">👑</div>
                <div class="rule-text">
                  <h4>誰可以產生自己的推坑碼？</h4>
                  <p>只要您<strong class="text-gold">完成過至少一場遊戲</strong>，系統就會為您解鎖專屬的推坑碼。</p>
                </div>
              </div>
              <div class="rule-item">
                <div class="rule-icon-box">🎁</div>
                <div class="rule-text">
                  <h4>老手要怎麼拿到推坑獎勵？</h4>
                  <p>當您推薦的新手成功綁定您的代碼，並且<strong class="text-gold">完成他們的第一場遊戲（掃描核銷獲得經驗值）</strong>後，系統就會自動發送 $100 折價券到您的票券夾！</p>
                </div>
              </div>
            </div>
            <div class="rules-modal-footer">
              <button class="rules-confirm-btn" @click="showRulesModal = false">我知道了</button>
            </div>
          </div>
        </div>
      </transition>
    </Teleport>

  </div>
</template>

<style scoped>
/* ── 基礎 ── */
.page-container {
  padding: 32px 20px 100px;
  max-width: 600px; margin: 0 auto;
  color: #fff;
}

/* ── Header ── */
.page-header { text-align: center; margin-bottom: 32px; }
.header-deco { color: #D4AF37; font-size: 1rem; letter-spacing: 8px; opacity: 0.5; margin-bottom: 8px; }
.page-title {
  color: #D4AF37; margin: 0 0 6px;
  font-size: 2.2rem; font-weight: 900; letter-spacing: 3px;
  text-shadow: 0 0 24px rgba(212,175,55,0.3);
}
.page-subtitle { color: #555; font-size: 0.88rem; margin: 0; letter-spacing: 0.5px; }

/* loading */
.loading-state {
  display: flex; flex-direction: column; align-items: center;
  gap: 14px; padding: 60px 0; color: #666; font-size: 0.9rem;
}
.spinner {
  width: 34px; height: 34px;
  border: 3px solid rgba(212,175,55,0.15);
  border-top-color: #D4AF37;
  border-radius: 50%; animation: spin 1s linear infinite;
}
@keyframes spin { 100% { transform: rotate(360deg); } }

/* ── 卡片 ── */
.sections-wrap { display: flex; flex-direction: column; gap: 0; }

.setting-card {
  background: rgba(18,18,18,0.72);
  backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px);
  border: 1px solid rgba(255,255,255,0.07);
  border-radius: 20px;
  padding: 22px 20px 24px;
  position: relative;
  box-shadow: 0 12px 32px rgba(0,0,0,0.4);
}
.card-deco-top {
  position: absolute; top: 0; left: 20%; right: 20%; height: 1px;
  background: linear-gradient(90deg, transparent, rgba(255,255,255,0.12), transparent);
}
.gold-deco {
  background: linear-gradient(90deg, transparent, #D4AF37 40%, #f5d77a 50%, #D4AF37 60%, transparent);
}
.referral-card { border-color: rgba(212,175,55,0.18); }

/* 卡片 section label */
.card-section-label {
  display: flex; align-items: center; gap: 10px;
  font-size: 1rem; font-weight: 700; color: #ddd;
  letter-spacing: 0.5px;
  border-bottom: 1px solid rgba(255,255,255,0.06);
  padding-bottom: 14px; margin-bottom: 18px;
}
.section-icon { font-size: 1.2rem; }
.card-desc { color: #666; font-size: 0.85rem; line-height: 1.5; margin: 0 0 16px; }

/* ── 表單 ── */
.form-group { margin-bottom: 18px; }
.field-label {
  display: block; color: #777; font-size: 0.8rem;
  font-weight: 600; letter-spacing: 1px; text-transform: uppercase;
  margin-bottom: 8px;
}
.required-star { color: #e74c3c; }
.field-note { color: #555; font-size: 0.75rem; text-transform: none; letter-spacing: 0; font-weight: normal; }

.field-input {
  width: 100%; padding: 13px 16px;
  background: rgba(0,0,0,0.3);
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 10px; color: #fff; font-size: 1rem;
  box-sizing: border-box; transition: border-color 0.2s, box-shadow 0.2s;
  -webkit-appearance: none;
}
.field-input:focus {
  border-color: rgba(212,175,55,0.5); outline: none;
  box-shadow: 0 0 0 3px rgba(212,175,55,0.08);
}
.field-input::placeholder { color: #444; }

.locked-field {
  display: flex; align-items: center; gap: 10px;
  padding: 13px 16px;
  background: rgba(0,0,0,0.2); border: 1px solid rgba(255,255,255,0.05);
  border-radius: 10px; color: #555; font-size: 1rem;
}
.lock-icon { opacity: 0.5; }
.hint-text { font-size: 0.78rem; color: #555; margin: 6px 0 0; line-height: 1.4; }
.hint-gold { color: rgba(212,175,55,0.7) !important; }

/* 儲存按鈕 */
.save-btn {
  width: 100%; padding: 14px;
  background: linear-gradient(135deg, #9e761c, #D4AF37, #f5d77a, #D4AF37, #9e761c);
  background-size: 200% 100%;
  color: #000; border: none; border-radius: 12px;
  font-weight: 900; font-size: 1rem; cursor: pointer;
  display: flex; align-items: center; justify-content: center; gap: 8px;
  box-shadow: 0 4px 16px rgba(212,175,55,0.25);
  transition: transform 0.2s, box-shadow 0.2s;
  animation: btn-shimmer 4s linear infinite;
  margin-top: 4px;
}
.save-btn:hover { transform: translateY(-2px); box-shadow: 0 8px 24px rgba(212,175,55,0.35); }
.save-btn:active { transform: scale(0.98); }
@keyframes btn-shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }

/* 分隔 */
.section-divider {
  display: flex; align-items: center; gap: 12px;
  padding: 24px 0;
}
.div-line { flex: 1; height: 1px; background: rgba(255,255,255,0.05); }
.div-gem  { color: #D4AF37; font-size: 0.55rem; opacity: 0.3; }

/* ── 代碼輸入行 ── */
.code-input-row { display: flex; gap: 10px; }
.code-input {
  flex: 1; padding: 13px 16px;
  background: rgba(0,0,0,0.3);
  border: 1px dashed rgba(212,175,55,0.3);
  border-radius: 10px; color: #D4AF37;
  font-size: 1.05rem; font-weight: 700;
  text-transform: uppercase; letter-spacing: 1.5px;
  box-sizing: border-box; transition: 0.2s;
}
.code-input:focus {
  border-color: #D4AF37; border-style: solid; outline: none;
  box-shadow: 0 0 0 3px rgba(212,175,55,0.08);
}
.code-input::placeholder { color: #444; font-weight: normal; text-transform: none; letter-spacing: 0; font-size: 0.92rem; }

.action-btn {
  background: rgba(212,175,55,0.08); color: #D4AF37;
  border: 1px solid rgba(212,175,55,0.4);
  padding: 0 20px; border-radius: 10px;
  font-weight: 700; font-size: 0.95rem; cursor: pointer;
  white-space: nowrap; transition: 0.2s;
}
.action-btn:hover { background: rgba(212,175,55,0.18); border-color: #D4AF37; }
.action-btn:disabled { background: rgba(255,255,255,0.03); color: #444; border-color: #333; cursor: not-allowed; }
.gold-btn { background: rgba(212,175,55,0.1); }

/* ── 推薦碼區塊 ── */
.referral-card-header {
  display: flex; align-items: center; justify-content: space-between;
  border-bottom: 1px solid rgba(212,175,55,0.1);
  padding-bottom: 14px; margin-bottom: 14px;
}
.rules-pill-btn {
  background: transparent; border: 1px solid #444; color: #888;
  border-radius: 20px; padding: 4px 12px; font-size: 0.75rem;
  cursor: pointer; transition: 0.2s; white-space: nowrap;
}
.rules-pill-btn:hover { color: #D4AF37; border-color: #D4AF37; }

.sub-block {}
.sub-label {
  color: #666; font-size: 0.78rem; font-weight: 600;
  letter-spacing: 0.8px; text-transform: uppercase; margin-bottom: 10px;
}

/* 推坑碼展示 */
.code-display-box {
  display: flex; align-items: center; justify-content: space-between;
  background: rgba(212,175,55,0.04);
  border: 1px dashed rgba(212,175,55,0.4);
  border-radius: 12px; padding: 14px 18px;
}
.code-display-left { display: flex; align-items: center; gap: 10px; }
.code-deco { color: #D4AF37; opacity: 0.4; font-size: 1rem; }
.big-code { font-size: 1.5rem; font-weight: 900; color: #D4AF37; letter-spacing: 3px; font-family: monospace; text-shadow: 0 0 12px rgba(212,175,55,0.3); }
.copy-btn {
  background: rgba(212,175,55,0.1); border: 1px solid rgba(212,175,55,0.4);
  color: #D4AF37; padding: 7px 14px; border-radius: 8px;
  font-size: 0.85rem; font-weight: 700; cursor: pointer; transition: 0.2s;
  white-space: nowrap;
}
.copy-btn:hover { background: #D4AF37; color: #000; }
.copy-btn:active { transform: scale(0.95); }

.generate-btn {
  width: 100%; padding: 13px;
  background: rgba(212,175,55,0.05); border: 1px solid rgba(212,175,55,0.35);
  color: #D4AF37; border-radius: 10px; font-weight: 700; font-size: 0.95rem;
  cursor: pointer; transition: 0.2s;
}
.generate-btn:hover { background: rgba(212,175,55,0.12); }
.generate-btn:disabled { opacity: 0.5; cursor: not-allowed; }

.locked-info-box {
  display: flex; align-items: center; gap: 10px;
  background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.07);
  border-radius: 10px; padding: 12px 16px;
  color: #555; font-size: 0.88rem;
}
.locked-red {
  background: rgba(231,76,60,0.04); border-color: rgba(231,76,60,0.2); color: #c0392b;
}

.bound-box {
  display: flex; align-items: center; justify-content: space-between;
  background: rgba(212,175,55,0.05); border: 1px solid rgba(212,175,55,0.25);
  border-radius: 10px; padding: 12px 18px;
  color: #D4AF37; font-weight: 600; font-size: 0.92rem;
}
.bound-code { font-family: monospace; font-size: 1.1rem; font-weight: 900; letter-spacing: 2px; }

/* ── 規則 Modal ── */
.modal-overlay {
  position: fixed; inset: 0;
  background: rgba(0,0,0,0.88); z-index: 9999;
  display: flex; justify-content: center; align-items: flex-end;
  backdrop-filter: blur(6px);
}
.rules-modal {
  width: 100%; max-width: 600px;
  background: #111;
  border-radius: 24px 24px 0 0;
  border-top: 2px solid rgba(212,175,55,0.5);
  display: flex; flex-direction: column;
  max-height: 88vh; overflow: hidden;
  box-shadow: 0 -10px 40px rgba(0,0,0,0.8);
}
.modal-handle {
  width: 40px; height: 4px; border-radius: 2px;
  background: #2a2a2a; margin: 12px auto 0; flex-shrink: 0;
}
.rules-modal-header {
  display: flex; justify-content: space-between; align-items: center;
  padding: 16px 24px 14px; border-bottom: 1px solid #1e1e1e; flex-shrink: 0;
}
.rules-modal-header h3 { margin: 0; color: #D4AF37; font-size: 1.1rem; letter-spacing: 0.5px; }
.modal-close-btn {
  background: rgba(255,255,255,0.07); border: none; color: #888;
  width: 32px; height: 32px; border-radius: 50%; cursor: pointer;
  display: flex; align-items: center; justify-content: center; font-size: 1rem;
  transition: 0.2s;
}
.modal-close-btn:hover { background: rgba(255,255,255,0.14); color: #fff; }
.rules-modal-body { padding: 20px 24px; overflow-y: auto; flex: 1; }
.rules-modal-footer { padding: 12px 24px 28px; flex-shrink: 0; }

.rule-item { display: flex; gap: 16px; margin-bottom: 24px; }
.rule-item:last-child { margin-bottom: 0; }
.rule-icon-box {
  font-size: 1.8rem; flex-shrink: 0;
  width: 46px; height: 46px;
  background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08);
  border-radius: 10px; display: flex; align-items: center; justify-content: center;
}
.rule-text h4 { margin: 0 0 6px; color: #eee; font-size: 0.98rem; }
.rule-text p  { margin: 0; color: #888; font-size: 0.88rem; line-height: 1.6; }
.text-red  { color: #e74c3c; font-weight: 700; }
.text-gold { color: #D4AF37; font-weight: 700; }
.text-dim  { color: #555; font-size: 0.8rem; }

.rules-confirm-btn {
  width: 100%; padding: 14px;
  background: rgba(255,255,255,0.06); color: #aaa;
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 12px; font-weight: 700; font-size: 1rem; cursor: pointer;
  transition: 0.2s;
}
.rules-confirm-btn:hover { background: rgba(255,255,255,0.1); color: #fff; }

/* modal 動畫 */
.slide-up-enter-active, .slide-up-leave-active { transition: all 0.35s cubic-bezier(0.2,0.8,0.2,1); }
.slide-up-enter-from, .slide-up-leave-to { opacity: 0; transform: translateY(100%); }

/* ── RWD ── */

/* 小螢幕手機 (≤ 390px，例如 iPhone SE / 舊款 Android) */
@media (max-width: 390px) {
  .page-container { padding: 24px 14px 100px; }
  .page-title { font-size: 1.7rem; letter-spacing: 2px; }
  .setting-card { padding: 18px 14px 20px; border-radius: 16px; }

  /* 代碼輸入行在極小螢幕改直排 */
  .code-input-row { flex-direction: column; gap: 8px; }
  .action-btn { width: 100%; padding: 13px; }

  /* 推坑碼展示縮小 */
  .big-code { font-size: 1.2rem; letter-spacing: 2px; }
  .code-display-box { padding: 12px 14px; }
  .copy-btn { padding: 7px 10px; font-size: 0.78rem; }

  /* bound-box 改直排 */
  .bound-box { flex-direction: column; align-items: flex-start; gap: 4px; }
  .bound-code { font-size: 1rem; }

  /* 規則 icon 縮小 */
  .rule-icon-box { width: 38px; height: 38px; font-size: 1.4rem; flex-shrink: 0; }
  .rule-text h4 { font-size: 0.9rem; }
  .rule-text p  { font-size: 0.82rem; }
}

/* 一般手機 (391px ~ 480px) */
@media (min-width: 391px) and (max-width: 480px) {
  .page-title { font-size: 1.9rem; }
  .setting-card { padding: 20px 16px 22px; }
  .big-code { font-size: 1.35rem; }
}

/* 中型螢幕 (481px ~ 600px)：基本上就是設計稿尺寸，不需大幅修改 */
@media (min-width: 481px) and (max-width: 600px) {
  .page-container { padding: 28px 18px 100px; }
}

/* 平板 / 桌機 (> 600px)：讓卡片看起來更有質感，加點外邊距 */
@media (min-width: 601px) {
  .page-container { padding: 40px 24px 120px; }
  .page-title { font-size: 2.4rem; }
  .setting-card { padding: 26px 24px 28px; }
  .field-input { font-size: 1.05rem; }
  .big-code { font-size: 1.7rem; letter-spacing: 4px; }
  .save-btn { font-size: 1.05rem; padding: 15px; }
}
</style>