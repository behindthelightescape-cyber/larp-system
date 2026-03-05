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
  <div class="ps-root">

    <!-- 背景裝飾層 -->
    <div class="ps-bg-noise"></div>
    <div class="ps-bg-glow ps-bg-glow--top"></div>
    <div class="ps-bg-glow ps-bg-glow--bottom"></div>

    <div class="ps-wrap">

      <!-- ══ 頁首 ══ -->
      <header class="ps-header">
        <div class="ps-header__eyebrow">
          <span class="ps-eyebrow-line"></span>
          <span class="ps-eyebrow-text">ADVENTURE PROFILE</span>
          <span class="ps-eyebrow-line"></span>
        </div>
        <h1 class="ps-header__title">個人設定2</h1>
        <p class="ps-header__sub">管理你的冒險者資料與推坑計畫</p>
        <div class="ps-header__ornament">
          <span></span><span class="ps-diamond">◆</span><span></span>
        </div>
      </header>

      <!-- ══ 載入中 ══ -->
      <div v-if="store.isLoading" class="ps-loading">
        <div class="ps-loading__ring">
          <svg viewBox="0 0 44 44"><circle cx="22" cy="22" r="18" fill="none" stroke-width="2"/></svg>
        </div>
        <span>載入中…</span>
      </div>

      <!-- ══ 主體內容 ══ -->
      <div v-else class="ps-body">

        <!-- ─── 個人資料卡 ─── -->
        <section class="ps-card">
          <div class="ps-card__inner">
            <div class="ps-card__top-shimmer"></div>

            <div class="ps-section-head">
              <div class="ps-section-icon">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="8" r="4" stroke="currentColor" stroke-width="1.8"/>
                  <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
                </svg>
              </div>
              <span>個人資料</span>
            </div>

            <div class="ps-fields">
              <div class="ps-field">
                <label class="ps-field__label">顯示名稱</label>
                <div class="ps-input-wrap">
                  <input v-model="form.name" type="text" placeholder="怎麼稱呼你？" class="ps-input" />
                  <div class="ps-input-underline"></div>
                </div>
              </div>

              <div class="ps-field">
                <label class="ps-field__label">
                  手機號碼
                  <span class="ps-required">必填</span>
                </label>
                <div class="ps-input-wrap">
                  <input v-model="form.phone" type="tel" placeholder="0912-345-678" class="ps-input" />
                  <div class="ps-input-underline"></div>
                </div>
              </div>

              <div class="ps-field">
                <label class="ps-field__label">
                  生日
                  <span class="ps-field__note">壽星優惠專用</span>
                </label>
                <template v-if="!isBirthdayLocked">
                  <div class="ps-input-wrap">
                    <input v-model="form.birthday" type="date" class="ps-input ps-input--date" />
                    <div class="ps-input-underline"></div>
                  </div>
                  <p class="ps-hint ps-hint--gold">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z"/></svg>
                    首次填寫生日並完善資料，將獲得驚喜禮物！
                  </p>
                </template>
                <template v-else>
                  <div class="ps-locked-field">
                    <svg class="ps-lock-svg" width="14" height="14" viewBox="0 0 24 24" fill="none">
                      <rect x="3" y="11" width="18" height="11" rx="2" stroke="currentColor" stroke-width="1.8"/>
                      <path d="M7 11V7a5 5 0 0 1 10 0v4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
                    </svg>
                    <span>{{ form.birthday }}</span>
                  </div>
                  <p class="ps-hint">生日已設定，如需修改請聯繫客服。</p>
                </template>
              </div>
            </div>

            <button class="ps-save-btn" @click="save" :disabled="store.isLoading">
              <span class="ps-save-btn__label">確認修改</span>
              <div class="ps-save-btn__icon">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              </div>
            </button>
          </div>
        </section>

        <!-- ─── 分隔線 ─── -->
        <div class="ps-divider">
          <div class="ps-divider__track"></div>
          <div class="ps-divider__badge">
            <span>◈</span>
          </div>
          <div class="ps-divider__track"></div>
        </div>

        <!-- ─── 官方活動代碼卡 ─── -->
        <section class="ps-card">
          <div class="ps-card__inner">
            <div class="ps-card__top-shimmer"></div>

            <div class="ps-section-head">
              <div class="ps-section-icon">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <path d="M20 12V22H4V12" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
                  <path d="M22 7H2v5h20V7z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
                  <path d="M12 22V7M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7zM12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
                </svg>
              </div>
              <span>官方活動代碼</span>
            </div>

            <p class="ps-card__desc">輸入官方發布的專屬活動代碼來獲取折價券</p>

            <div class="ps-code-row">
              <div class="ps-code-input-wrap">
                <input
                  v-model="promoCodeInput"
                  type="text"
                  placeholder="輸入兌換碼…"
                  class="ps-code-input"
                  @keyup.enter="redeemPromoCode"
                />
              </div>
              <button class="ps-ghost-btn" @click="redeemPromoCode" :disabled="isRedeeming">
                <span>{{ isRedeeming ? '兌換中' : '兌換' }}</span>
                <span v-if="isRedeeming" class="ps-btn-dot-loader"><span></span><span></span><span></span></span>
              </button>
            </div>
          </div>
        </section>

        <!-- ─── 推坑計畫卡 ─── -->
        <section class="ps-card ps-card--gold">
          <div class="ps-card__inner">
            <div class="ps-card__top-shimmer ps-card__top-shimmer--gold"></div>

            <div class="ps-referral-header">
              <div class="ps-section-head ps-section-head--gold">
                <div class="ps-section-icon ps-section-icon--gold">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
                    <circle cx="9" cy="7" r="4" stroke="currentColor" stroke-width="1.8"/>
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
                  </svg>
                </div>
                <span>好友推坑計畫</span>
              </div>
              <button class="ps-rules-btn" @click="showRulesModal = true">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="1.8"/>
                  <path d="M12 16v-4M12 8h.01" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                </svg>
                規則說明
              </button>
            </div>

            <p class="ps-card__desc">分享專屬碼給新手，完成首場遊戲後雙方都能獲得獎勵！</p>

            <!-- 你的推坑碼 -->
            <div class="ps-sub-block">
              <div class="ps-sub-label">你的專屬推坑碼</div>

              <div v-if="myReferralCode" class="ps-code-display">
                <div class="ps-code-display__left">
                  <div class="ps-code-display__ring"></div>
                  <span class="ps-code-display__text">{{ myReferralCode }}</span>
                </div>
                <button class="ps-copy-btn" @click="copyMyCode">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                    <rect x="9" y="9" width="13" height="13" rx="2" stroke="currentColor" stroke-width="1.8"/>
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
                  </svg>
                  複製
                </button>
              </div>

              <button v-else-if="!isNewbie" class="ps-generate-btn" @click="generateMyCode" :disabled="isGeneratingCode">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
                  <path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                </svg>
                {{ isGeneratingCode ? '生成中…' : '點我生成專屬代碼' }}
              </button>

              <div v-else class="ps-locked-badge">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                  <rect x="3" y="11" width="18" height="11" rx="2" stroke="currentColor" stroke-width="1.8"/>
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
                </svg>
                需完成首場遊戲後解鎖
              </div>
            </div>

            <!-- 好友推薦 -->
            <div class="ps-sub-block ps-sub-block--spaced">
              <div class="ps-sub-label">是朋友推薦你來的嗎？</div>

              <div v-if="isReferredLocked" class="ps-bound-box">
                <div class="ps-bound-box__left">
                  <div class="ps-bound-icon">🤝</div>
                  <span>已綁定推坑老手</span>
                </div>
                <span class="ps-bound-code">{{ referredBy }}</span>
              </div>

              <div v-else-if="!isNewbie" class="ps-locked-badge ps-locked-badge--red">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="1.8"/>
                  <path d="M15 9l-6 6M9 9l6 6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
                </svg>
                推坑碼僅限首次遊玩前填寫
              </div>

              <div v-else class="ps-code-row">
                <div class="ps-code-input-wrap">
                  <input
                    v-model="friendCodeInput"
                    type="text"
                    placeholder="輸入朋友的推坑碼…"
                    class="ps-code-input"
                  />
                </div>
                <button class="ps-ghost-btn ps-ghost-btn--gold" @click="bindFriendCode" :disabled="isBindingCode">
                  <span>{{ isBindingCode ? '綁定中' : '綁定' }}</span>
                  <span v-if="isBindingCode" class="ps-btn-dot-loader ps-btn-dot-loader--gold"><span></span><span></span><span></span></span>
                </button>
              </div>
            </div>

          </div>
        </section>

        <!-- 底部留白 -->
        <div style="height:40px"></div>

      </div>
    </div>

    <!-- ══ 規則 Modal ══ -->
    <Teleport to="body">
      <Transition name="ps-modal">
        <div v-if="showRulesModal" class="ps-overlay" @click.self="showRulesModal = false">
          <div class="ps-modal">

            <div class="ps-modal__handle"></div>

            <div class="ps-modal__header">
              <div class="ps-modal__title">
                <span class="ps-modal__title-deco">◈</span>
                推坑計畫規則說明
              </div>
              <button class="ps-modal__close" @click="showRulesModal = false">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                  <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                </svg>
              </button>
            </div>

            <div class="ps-modal__body">
              <div class="ps-rule">
                <div class="ps-rule__icon">🌱</div>
                <div class="ps-rule__content">
                  <h4>誰可以填寫別人的推坑碼？</h4>
                  <p>必須是<em class="ps-em--red">從未遊玩過（經驗值為 0）</em>的新手才能填寫。綁定後即可立即獲得 $50 迎新折價券！</p>
                  <p class="ps-rule__note">若已完成過首場遊戲，系統將自動關閉綁定功能，無法事後補填喔！</p>
                </div>
              </div>

              <div class="ps-rule">
                <div class="ps-rule__icon">👑</div>
                <div class="ps-rule__content">
                  <h4>誰可以產生自己的推坑碼？</h4>
                  <p>只要您<em class="ps-em--gold">完成過至少一場遊戲</em>，系統就會為您解鎖專屬的推坑碼。</p>
                </div>
              </div>

              <div class="ps-rule">
                <div class="ps-rule__icon">🎁</div>
                <div class="ps-rule__content">
                  <h4>老手要怎麼拿到推坑獎勵？</h4>
                  <p>當您推薦的新手成功綁定您的代碼，並且<em class="ps-em--gold">完成他們的第一場遊戲（掃描核銷獲得經驗值）</em>後，系統就會自動發送 $100 折價券到您的票券夾！</p>
                </div>
              </div>
            </div>

            <div class="ps-modal__footer">
              <button class="ps-modal__confirm" @click="showRulesModal = false">我知道了</button>
            </div>

          </div>
        </div>
      </Transition>
    </Teleport>

  </div>
</template>

<style scoped>
/* ════════════════════════════════════════
   設計系統 tokens
════════════════════════════════════════ */
:root {
  --gold-100: #fff8e1;
  --gold-300: #f5d77a;
  --gold-500: #D4AF37;
  --gold-700: #9e761c;
  --red-400: #e05252;
  --surface-0: #0a0a0a;
  --surface-1: #111111;
  --surface-2: #181818;
  --surface-3: #222222;
  --border-subtle: rgba(255,255,255,0.06);
  --border-mid: rgba(255,255,255,0.1);
  --text-primary: #f0ece0;
  --text-secondary: #888;
  --text-dim: #444;
  --radius-card: 24px;
  --radius-input: 12px;
  --font-display: 'Noto Serif TC', 'Georgia', serif;
  --font-body: 'Noto Sans TC', 'PingFang TC', sans-serif;
}

/* ════════════════════════════════════════
   根容器 & 背景
════════════════════════════════════════ */
.ps-root {
  position: relative;
  min-height: 100vh;
  max-width: 560px;
  margin: 0 auto;
  padding: 0 16px 80px;
  box-sizing: border-box;
  color: var(--text-primary);
  font-family: var(--font-body);
  overflow-x: hidden;
  isolation: isolate;
}

.ps-bg-noise {
  position: fixed;
  inset: 0;
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.04'/%3E%3C/svg%3E");
  pointer-events: none;
  z-index: -2;
  opacity: 0.6;
}

.ps-bg-glow {
  position: fixed;
  left: 50%;
  transform: translateX(-50%);
  width: 400px;
  height: 300px;
  border-radius: 50%;
  pointer-events: none;
  z-index: -1;
}
.ps-bg-glow--top {
  top: -100px;
  background: radial-gradient(ellipse, rgba(212,175,55,0.06) 0%, transparent 70%);
}
.ps-bg-glow--bottom {
  bottom: -100px;
  background: radial-gradient(ellipse, rgba(212,175,55,0.04) 0%, transparent 70%);
}

/* ════════════════════════════════════════
   頁首
════════════════════════════════════════ */
.ps-wrap { width: 100%; }

.ps-header {
  text-align: center;
  padding: 48px 0 36px;
}

.ps-header__eyebrow {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  margin-bottom: 16px;
}
.ps-eyebrow-line {
  display: block;
  width: 36px;
  height: 1px;
  background: linear-gradient(90deg, transparent, rgba(212,175,55,0.4));
}
.ps-eyebrow-line:last-child {
  background: linear-gradient(90deg, rgba(212,175,55,0.4), transparent);
}
.ps-eyebrow-text {
  font-size: 0.65rem;
  font-weight: 700;
  letter-spacing: 4px;
  color: var(--gold-500);
  opacity: 0.7;
}

.ps-header__title {
  font-family: var(--font-display);
  font-size: 2.6rem;
  font-weight: 900;
  color: transparent;
  background: linear-gradient(160deg, var(--gold-300) 0%, var(--gold-500) 40%, var(--gold-700) 100%);
  -webkit-background-clip: text;
  background-clip: text;
  margin: 0 0 8px;
  letter-spacing: 2px;
  line-height: 1.1;
  filter: drop-shadow(0 0 20px rgba(212,175,55,0.25));
}

.ps-header__sub {
  font-size: 0.82rem;
  color: var(--text-secondary);
  margin: 0 0 20px;
  letter-spacing: 0.3px;
}

.ps-header__ornament {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}
.ps-header__ornament span:not(.ps-diamond) {
  display: block;
  width: 28px;
  height: 1px;
  background: rgba(212,175,55,0.25);
}
.ps-diamond {
  font-size: 0.5rem;
  color: var(--gold-500);
  opacity: 0.4;
}

/* ════════════════════════════════════════
   載入
════════════════════════════════════════ */
.ps-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  padding: 80px 0;
  color: var(--text-secondary);
  font-size: 0.88rem;
}
.ps-loading__ring {
  width: 40px;
  height: 40px;
}
.ps-loading__ring svg {
  width: 40px;
  height: 40px;
  animation: ps-spin 1.2s linear infinite;
  stroke: var(--gold-500);
  stroke-dasharray: 90;
  stroke-dashoffset: 60;
  stroke-linecap: round;
}
@keyframes ps-spin { 100% { transform: rotate(360deg); } }

/* ════════════════════════════════════════
   卡片
════════════════════════════════════════ */
.ps-body {
  display: flex;
  flex-direction: column;
  gap: 0;
}

.ps-card {
  position: relative;
  border-radius: var(--radius-card);
  border: 1px solid var(--border-subtle);
  overflow: hidden;
  box-shadow:
    0 1px 0 rgba(255,255,255,0.04) inset,
    0 20px 60px rgba(0,0,0,0.5),
    0 4px 16px rgba(0,0,0,0.3);
  background: linear-gradient(160deg, rgba(28,26,22,0.92) 0%, rgba(14,13,11,0.96) 100%);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  transition: box-shadow 0.3s;
}
.ps-card--gold {
  border-color: rgba(212,175,55,0.15);
  box-shadow:
    0 1px 0 rgba(212,175,55,0.08) inset,
    0 20px 60px rgba(0,0,0,0.5),
    0 0 40px rgba(212,175,55,0.04);
}

.ps-card__inner {
  padding: 24px 22px 26px;
}

.ps-card__top-shimmer {
  position: absolute;
  top: 0; left: 15%; right: 15%;
  height: 1px;
  background: linear-gradient(90deg, transparent, rgba(255,255,255,0.1), transparent);
}
.ps-card__top-shimmer--gold {
  background: linear-gradient(90deg, transparent, rgba(212,175,55,0.5) 30%, rgba(245,215,122,0.8) 50%, rgba(212,175,55,0.5) 70%, transparent);
  animation: ps-shimmer 4s ease-in-out infinite;
}
@keyframes ps-shimmer {
  0%, 100% { opacity: 0.6; }
  50% { opacity: 1; }
}

/* ════════════════════════════════════════
   Section head
════════════════════════════════════════ */
.ps-section-head {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 0.95rem;
  font-weight: 700;
  color: #ccc;
  letter-spacing: 0.5px;
  margin-bottom: 22px;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--border-subtle);
}
.ps-section-head--gold { color: var(--gold-300); }

.ps-section-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border-radius: 10px;
  background: rgba(255,255,255,0.04);
  border: 1px solid var(--border-mid);
  color: #aaa;
  flex-shrink: 0;
}
.ps-section-icon--gold {
  background: rgba(212,175,55,0.08);
  border-color: rgba(212,175,55,0.25);
  color: var(--gold-500);
}

/* ════════════════════════════════════════
   表單欄位
════════════════════════════════════════ */
.ps-fields { display: flex; flex-direction: column; gap: 20px; }

.ps-field {}

.ps-field__label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 1.5px;
  text-transform: uppercase;
  color: var(--text-secondary);
  margin-bottom: 10px;
}

.ps-required {
  font-size: 0.62rem;
  font-weight: 700;
  letter-spacing: 0.5px;
  text-transform: uppercase;
  color: var(--red-400);
  background: rgba(224, 82, 82, 0.1);
  border: 1px solid rgba(224, 82, 82, 0.3);
  padding: 1px 6px;
  border-radius: 4px;
}

.ps-field__note {
  font-size: 0.68rem;
  color: var(--text-dim);
  text-transform: none;
  letter-spacing: 0;
  font-weight: 400;
}

.ps-input-wrap { position: relative; }

.ps-input {
  width: 100%;
  padding: 14px 16px;
  background: rgba(0,0,0,0.35);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: var(--radius-input);
  color: var(--text-primary);
  font-size: 0.98rem;
  font-family: var(--font-body);
  box-sizing: border-box;
  transition: border-color 0.25s, background 0.25s;
  -webkit-appearance: none;
}
.ps-input:focus {
  outline: none;
  border-color: rgba(212,175,55,0.45);
  background: rgba(212,175,55,0.03);
  box-shadow: 0 0 0 4px rgba(212,175,55,0.06);
}
.ps-input::placeholder { color: rgba(255,255,255,0.2); }
.ps-input--date::-webkit-calendar-picker-indicator { filter: invert(0.3); }

.ps-input-underline {
  position: absolute;
  bottom: 0; left: 10%; right: 10%;
  height: 1px;
  background: linear-gradient(90deg, transparent, rgba(212,175,55,0.3), transparent);
  opacity: 0;
  transition: opacity 0.3s;
}
.ps-input:focus + .ps-input-underline { opacity: 1; }

.ps-locked-field {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 16px;
  background: rgba(0,0,0,0.2);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-input);
  color: rgba(255,255,255,0.35);
  font-size: 0.95rem;
}
.ps-lock-svg { opacity: 0.4; flex-shrink: 0; color: var(--text-dim); }

.ps-hint {
  font-size: 0.76rem;
  color: var(--text-dim);
  margin: 8px 0 0;
  line-height: 1.5;
  display: flex;
  align-items: flex-start;
  gap: 5px;
}
.ps-hint--gold {
  color: rgba(212,175,55,0.65);
}
.ps-hint svg { margin-top: 2px; flex-shrink: 0; }

/* ════════════════════════════════════════
   儲存按鈕
════════════════════════════════════════ */
.ps-save-btn {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 15px 22px;
  margin-top: 26px;
  background: linear-gradient(105deg, var(--gold-700) 0%, var(--gold-500) 35%, var(--gold-300) 50%, var(--gold-500) 65%, var(--gold-700) 100%);
  background-size: 250% 100%;
  color: #000;
  border: none;
  border-radius: 14px;
  font-weight: 900;
  font-size: 0.98rem;
  font-family: var(--font-body);
  letter-spacing: 0.5px;
  cursor: pointer;
  box-shadow: 0 6px 24px rgba(212,175,55,0.2), 0 2px 6px rgba(0,0,0,0.4);
  transition: transform 0.2s, box-shadow 0.2s, background-position 0.5s;
  animation: ps-btn-flow 5s linear infinite;
}
.ps-save-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 10px 32px rgba(212,175,55,0.3), 0 4px 10px rgba(0,0,0,0.4);
}
.ps-save-btn:active { transform: scale(0.98); }
.ps-save-btn:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }

.ps-save-btn__label { font-size: 1rem; }
.ps-save-btn__icon {
  width: 30px;
  height: 30px;
  background: rgba(0,0,0,0.12);
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
}

@keyframes ps-btn-flow {
  0% { background-position: 150% 0; }
  100% { background-position: -150% 0; }
}

/* ════════════════════════════════════════
   分隔線
════════════════════════════════════════ */
.ps-divider {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 28px 4px;
}
.ps-divider__track {
  flex: 1;
  height: 1px;
  background: linear-gradient(90deg, transparent, var(--border-subtle));
}
.ps-divider__track:last-child {
  background: linear-gradient(90deg, var(--border-subtle), transparent);
}
.ps-divider__badge {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 8px;
  border: 1px solid rgba(212,175,55,0.2);
  background: rgba(212,175,55,0.04);
  font-size: 0.6rem;
  color: var(--gold-500);
  opacity: 0.5;
}

/* ════════════════════════════════════════
   代碼輸入行
════════════════════════════════════════ */
.ps-card__desc {
  font-size: 0.82rem;
  color: var(--text-secondary);
  line-height: 1.6;
  margin: 0 0 18px;
}

.ps-code-row {
  display: flex;
  gap: 10px;
  align-items: stretch;
}

.ps-code-input-wrap {
  flex: 1;
  position: relative;
}

.ps-code-input {
  width: 100%;
  padding: 13px 16px;
  background: rgba(212,175,55,0.03);
  border: 1px dashed rgba(212,175,55,0.3);
  border-radius: var(--radius-input);
  color: var(--gold-300);
  font-size: 1rem;
  font-weight: 700;
  font-family: 'Courier New', monospace;
  text-transform: uppercase;
  letter-spacing: 2px;
  box-sizing: border-box;
  transition: border-color 0.2s, background 0.2s;
  -webkit-appearance: none;
}
.ps-code-input:focus {
  outline: none;
  border-color: var(--gold-500);
  border-style: solid;
  background: rgba(212,175,55,0.05);
  box-shadow: 0 0 0 4px rgba(212,175,55,0.07);
}
.ps-code-input::placeholder {
  color: rgba(255,255,255,0.2);
  font-weight: 400;
  text-transform: none;
  letter-spacing: 0;
  font-size: 0.85rem;
  font-family: var(--font-body);
}

.ps-ghost-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 0 20px;
  background: rgba(255,255,255,0.04);
  border: 1px solid var(--border-mid);
  border-radius: var(--radius-input);
  color: #aaa;
  font-size: 0.9rem;
  font-weight: 700;
  font-family: var(--font-body);
  letter-spacing: 0.3px;
  cursor: pointer;
  white-space: nowrap;
  transition: background 0.2s, border-color 0.2s, color 0.2s;
}
.ps-ghost-btn:hover {
  background: rgba(255,255,255,0.08);
  border-color: rgba(255,255,255,0.2);
  color: #fff;
}
.ps-ghost-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.ps-ghost-btn--gold {
  border-color: rgba(212,175,55,0.3);
  color: var(--gold-500);
}
.ps-ghost-btn--gold:hover {
  background: rgba(212,175,55,0.1);
  border-color: var(--gold-500);
  color: var(--gold-300);
}

/* dot loader */
.ps-btn-dot-loader {
  display: flex;
  align-items: center;
  gap: 3px;
}
.ps-btn-dot-loader span {
  display: block;
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: currentColor;
  animation: ps-dot 1s ease-in-out infinite;
}
.ps-btn-dot-loader span:nth-child(2) { animation-delay: 0.15s; }
.ps-btn-dot-loader span:nth-child(3) { animation-delay: 0.3s; }
@keyframes ps-dot {
  0%, 80%, 100% { transform: scale(0.5); opacity: 0.4; }
  40% { transform: scale(1); opacity: 1; }
}

/* ════════════════════════════════════════
   推薦碼卡片細節
════════════════════════════════════════ */
.ps-referral-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 14px;
  padding-bottom: 16px;
  border-bottom: 1px solid rgba(212,175,55,0.1);
}
.ps-referral-header .ps-section-head { margin-bottom: 0; padding-bottom: 0; border: none; }

.ps-rules-btn {
  display: flex;
  align-items: center;
  gap: 5px;
  background: transparent;
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 20px;
  color: var(--text-secondary);
  font-size: 0.72rem;
  font-family: var(--font-body);
  padding: 5px 12px;
  cursor: pointer;
  transition: 0.2s;
  white-space: nowrap;
}
.ps-rules-btn:hover { border-color: rgba(212,175,55,0.4); color: var(--gold-500); }

.ps-sub-block {}
.ps-sub-block--spaced { margin-top: 20px; }

.ps-sub-label {
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 1.5px;
  text-transform: uppercase;
  color: var(--text-dim);
  margin-bottom: 12px;
}

/* 推坑碼展示盒 */
.ps-code-display {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: linear-gradient(135deg, rgba(212,175,55,0.04), rgba(212,175,55,0.08));
  border: 1px solid rgba(212,175,55,0.3);
  border-radius: 14px;
  padding: 16px 18px;
  position: relative;
  overflow: hidden;
}
.ps-code-display::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(135deg, transparent 40%, rgba(212,175,55,0.04));
  pointer-events: none;
}
.ps-code-display__left {
  display: flex;
  align-items: center;
  gap: 12px;
}
.ps-code-display__ring {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--gold-500);
  box-shadow: 0 0 8px rgba(212,175,55,0.6), 0 0 20px rgba(212,175,55,0.3);
  animation: ps-pulse 2s ease-in-out infinite;
}
@keyframes ps-pulse {
  0%, 100% { box-shadow: 0 0 8px rgba(212,175,55,0.6), 0 0 20px rgba(212,175,55,0.3); }
  50% { box-shadow: 0 0 14px rgba(212,175,55,0.9), 0 0 30px rgba(212,175,55,0.5); }
}
.ps-code-display__text {
  font-family: 'Courier New', monospace;
  font-size: 1.6rem;
  font-weight: 900;
  color: var(--gold-300);
  letter-spacing: 4px;
  text-shadow: 0 0 16px rgba(212,175,55,0.4);
}

.ps-copy-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  background: rgba(212,175,55,0.1);
  border: 1px solid rgba(212,175,55,0.35);
  color: var(--gold-500);
  padding: 8px 14px;
  border-radius: 8px;
  font-size: 0.82rem;
  font-weight: 700;
  font-family: var(--font-body);
  cursor: pointer;
  transition: 0.2s;
  flex-shrink: 0;
}
.ps-copy-btn:hover { background: var(--gold-500); color: #000; border-color: var(--gold-500); }
.ps-copy-btn:active { transform: scale(0.95); }

.ps-generate-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  padding: 14px;
  background: rgba(212,175,55,0.04);
  border: 1px dashed rgba(212,175,55,0.35);
  border-radius: 12px;
  color: var(--gold-500);
  font-size: 0.92rem;
  font-weight: 700;
  font-family: var(--font-body);
  cursor: pointer;
  transition: 0.2s;
}
.ps-generate-btn:hover { background: rgba(212,175,55,0.1); border-style: solid; }
.ps-generate-btn:disabled { opacity: 0.5; cursor: not-allowed; }

.ps-locked-badge {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  background: rgba(255,255,255,0.02);
  border: 1px solid var(--border-subtle);
  border-radius: 10px;
  color: var(--text-dim);
  font-size: 0.85rem;
}
.ps-locked-badge--red {
  background: rgba(224,82,82,0.04);
  border-color: rgba(224,82,82,0.2);
  color: rgba(224,82,82,0.7);
}

.ps-bound-box {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: rgba(212,175,55,0.05);
  border: 1px solid rgba(212,175,55,0.2);
  border-radius: 12px;
  padding: 14px 18px;
}
.ps-bound-box__left {
  display: flex;
  align-items: center;
  gap: 10px;
  color: var(--gold-300);
  font-weight: 600;
  font-size: 0.9rem;
}
.ps-bound-icon {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(212,175,55,0.1);
  border-radius: 8px;
  font-size: 1rem;
  flex-shrink: 0;
}
.ps-bound-code {
  font-family: 'Courier New', monospace;
  font-size: 1.1rem;
  font-weight: 900;
  color: var(--gold-500);
  letter-spacing: 3px;
}

/* ════════════════════════════════════════
   規則 Modal
════════════════════════════════════════ */
.ps-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.85);
  z-index: 9000;
  display: flex;
  justify-content: center;
  align-items: flex-end;
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
}

.ps-modal {
  width: 100%;
  max-width: 560px;
  max-height: 90vh;
  background: linear-gradient(180deg, #161410 0%, #0e0d0b 100%);
  border-radius: 28px 28px 0 0;
  border-top: 1px solid rgba(212,175,55,0.35);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 0 -20px 60px rgba(0,0,0,0.7);
}

.ps-modal__handle {
  width: 40px;
  height: 4px;
  border-radius: 2px;
  background: rgba(255,255,255,0.1);
  margin: 14px auto 0;
  flex-shrink: 0;
}

.ps-modal__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 24px 14px;
  border-bottom: 1px solid rgba(255,255,255,0.05);
  flex-shrink: 0;
}
.ps-modal__title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-family: var(--font-display);
  font-size: 1rem;
  font-weight: 700;
  color: var(--gold-300);
  letter-spacing: 0.5px;
}
.ps-modal__title-deco { font-size: 0.75rem; opacity: 0.6; }

.ps-modal__close {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255,255,255,0.05);
  border: 1px solid var(--border-subtle);
  border-radius: 50%;
  color: var(--text-secondary);
  cursor: pointer;
  transition: 0.2s;
}
.ps-modal__close:hover { background: rgba(255,255,255,0.12); color: #fff; }

.ps-modal__body {
  padding: 22px 24px;
  overflow-y: auto;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 22px;
}

.ps-rule {
  display: flex;
  gap: 16px;
}
.ps-rule__icon {
  font-size: 1.6rem;
  width: 46px;
  height: 46px;
  background: rgba(255,255,255,0.03);
  border: 1px solid var(--border-subtle);
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.ps-rule__content {}
.ps-rule__content h4 {
  margin: 0 0 8px;
  color: #ddd;
  font-size: 0.92rem;
  font-weight: 700;
}
.ps-rule__content p {
  margin: 0 0 6px;
  color: var(--text-secondary);
  font-size: 0.85rem;
  line-height: 1.65;
}
.ps-rule__note {
  color: var(--text-dim) !important;
  font-size: 0.78rem !important;
}

.ps-em--red  { color: var(--red-400); font-style: normal; font-weight: 700; }
.ps-em--gold { color: var(--gold-500); font-style: normal; font-weight: 700; }

.ps-modal__footer {
  padding: 12px 24px 32px;
  flex-shrink: 0;
}
.ps-modal__confirm {
  width: 100%;
  padding: 14px;
  background: rgba(255,255,255,0.04);
  border: 1px solid var(--border-mid);
  border-radius: 14px;
  color: var(--text-secondary);
  font-size: 0.95rem;
  font-weight: 700;
  font-family: var(--font-body);
  cursor: pointer;
  transition: 0.2s;
  letter-spacing: 0.5px;
}
.ps-modal__confirm:hover { background: rgba(255,255,255,0.09); color: #fff; border-color: rgba(255,255,255,0.2); }

/* ════════════════════════════════════════
   Modal 動畫
════════════════════════════════════════ */
.ps-modal-enter-active,
.ps-modal-leave-active {
  transition: opacity 0.3s ease;
}
.ps-modal-enter-active .ps-modal,
.ps-modal-leave-active .ps-modal {
  transition: transform 0.35s cubic-bezier(0.16, 1, 0.3, 1);
}
.ps-modal-enter-from,
.ps-modal-leave-to {
  opacity: 0;
}
.ps-modal-enter-from .ps-modal,
.ps-modal-leave-to .ps-modal {
  transform: translateY(100%);
}

/* ════════════════════════════════════════
   RWD
════════════════════════════════════════ */
@media (max-width: 400px) {
  .ps-header__title { font-size: 2rem; }
  .ps-card__inner { padding: 20px 16px 22px; }
  .ps-code-row { flex-direction: column; }
  .ps-ghost-btn { padding: 13px; width: 100%; }
  .ps-code-display__text { font-size: 1.3rem; letter-spacing: 3px; }
  .ps-bound-box { flex-direction: column; align-items: flex-start; gap: 8px; }
}

@media (min-width: 560px) {
  .ps-root { padding-left: 24px; padding-right: 24px; }
  .ps-header__title { font-size: 3rem; }
  .ps-card__inner { padding: 28px 26px 30px; }
  .ps-code-display__text { font-size: 1.8rem; letter-spacing: 5px; }
}
</style>