<script setup>
// ─────────────────────────────────────────
//  依賴
// ─────────────────────────────────────────
import { ref, watch, computed, onUnmounted } from 'vue'
import { useUserStore } from '../stores/user'
import { supabase } from '../supabase'
import { User, Gift, Lock, Ticket, UserPlus, UserCheck, HelpCircle, Copy, Sparkles, Ban, Sprout, Crown, Loader2, Link2, QrCode, Download, ScanLine } from 'lucide-vue-next'
import QrcodeVue from 'qrcode.vue'
import jsQR from 'jsqr'

// ─────────────────────────────────────────
//  Store
// ─────────────────────────────────────────
const store = useUserStore()

// ─────────────────────────────────────────
//  個人資料
// ─────────────────────────────────────────
const form = ref({ name: '', phone: '', birthday: '', email: '' })
const isBirthdayLocked = ref(false)
const isSaving = ref(false)

// 提前宣告，watch immediate 執行時才能正確賦值
const myReferralCode   = ref('')
const referredBy       = ref('')
const isReferredLocked = ref(false)

watch(
  () => store.userData,
  (val) => {
    if (!val) return
    form.value.name     = val.display_name || ''
    form.value.phone    = val.phone        || ''
    form.value.birthday = val.birthday     || ''
    form.value.email    = val.email        || ''
    if (val.birthday)         isBirthdayLocked.value  = true
    if (val.my_referral_code) myReferralCode.value    = val.my_referral_code
    if (val.referred_by)    { referredBy.value        = val.referred_by; isReferredLocked.value = true }
    if (urlRefCode && !val.referred_by && (val.total_exp || 0) === 0 && !friendCodeInput.value) {
      friendCodeInput.value = urlRefCode
    }
  },
  { immediate: true }
)

const save = () => withLoading(isSaving, async () => {
  const phone = form.value.phone?.trim()
  if (!phone)           return alert('⚠️ 請填寫您的手機號碼喔！這是必填欄位。')
  if (phone.length < 8) return alert('⚠️ 請填寫有效的手機號碼格式喔！')
  const email = form.value.email?.trim()
  if (!email) return alert('⚠️ 請填寫您的電子郵件喔！這是必填欄位。')

  const result = await store.updateProfile({
    name:     form.value.name,
    phone,
    birthday: form.value.birthday || null,
    email:    email,
  })

  if (result.success) {
    alert(result.message)
    if (form.value.birthday) isBirthdayLocked.value = true
    await store.initLiff()
  } else {
    alert('儲存失敗：' + result.message)
  }
})

// ─────────────────────────────────────────
//  工具：統一 loading 狀態控制
// ─────────────────────────────────────────
async function withLoading(flagRef, fn) {
  if (flagRef.value) return
  flagRef.value = true
  try {
    await fn()
  } catch (err) {
    alert('❌ 操作失敗：' + err.message)
  } finally {
    flagRef.value = false
  }
}

// ─────────────────────────────────────────
//  官方活動代碼
// ─────────────────────────────────────────
const promoCodeInput = ref('')
const isRedeeming    = ref(false)

const redeemPromoCode = () => withLoading(isRedeeming, async () => {
  const code = promoCodeInput.value.trim().toUpperCase()
  if (!code)           return alert('⚠️ 請輸入兌換碼喔！')
  if (!store.userData) return alert('⚠️ 請先確認登入狀態！')

  const { data: promo, error: promoErr } =
    await supabase.from('promo_codes').select('*').eq('code', code).single()
  if (promoErr || !promo)
    throw new Error('找不到此兌換碼，請確認是否有打錯字喔！')
  if (!promo.is_active)
    throw new Error('此兌換碼活動已經結束或暫停囉！')
  if (promo.max_uses > 0 && promo.used_count >= promo.max_uses)
    throw new Error('這組兌換碼已經被搶光了 😭')

  let countQuery = supabase
    .from('coupons').select('*', { count: 'exact', head: true })
    .eq('user_id', store.userData.id)
    .eq('source_promo_code', promo.id)
  if (promo.reuse_after_redeem) countQuery = countQuery.eq('status', 'available')
  const { count: used } = await countQuery
  if (used >= promo.limit_per_user)
    throw new Error(`這組代碼每人最多領 ${promo.limit_per_user} 次，你已經領滿囉！`)

  const expiry = new Date()
  expiry.setDate(expiry.getDate() + (promo.valid_days || 30))

  const { error: insertErr } = await supabase.from('coupons').insert([{
    user_id:           store.userData.id,
    title:             promo.title,
    description:       promo.description,
    status:            'available',
    expiry_date:       expiry.toISOString(),
    source_promo_code: promo.id,
  }])
  if (insertErr) throw insertErr

  await supabase.from('promo_codes')
    .update({ used_count: promo.used_count + 1 }).eq('id', promo.id)

  alert(`🎉 兌換成功！已將【${promo.title}】放入您的票券夾！`)
  promoCodeInput.value = ''
  await store.initLiff()
})

// ─────────────────────────────────────────
//  推坑計畫
// ─────────────────────────────────────────
const friendCodeInput  = ref('')
const isGeneratingCode = ref(false)
const isBindingCode    = ref(false)
const showRulesModal   = ref(false)
const showQrModal      = ref(false)

const LIFF_URL   = 'https://liff.line.me/2009161687-icfQU9r6'
const shareLink  = computed(() => myReferralCode.value ? `${LIFF_URL}?ref=${myReferralCode.value}` : '')
const urlRefCode = new URLSearchParams(window.location.search).get('ref')?.toUpperCase() || ''

const totalExp = computed(() => store.userData?.total_exp || 0)
const isNewbie = computed(() => totalExp.value === 0)

const generateMyCode = () => withLoading(isGeneratingCode, async () => {
  if (isNewbie.value)
    return alert('🔒 萌新請先完成首場遊戲，獲得經驗值後才能解鎖推坑碼喔！')

  const code = Math.random().toString(36).substring(2, 8).toUpperCase()
  const { error } = await supabase
    .from('users').update({ my_referral_code: code }).eq('id', store.userData.id)
  if (error) throw error

  myReferralCode.value = code
  alert('✅ 專屬推薦碼生成成功！趕快分享給朋友吧！')
  await store.initLiff()
})

const copyMyCode = () => {
  if (!myReferralCode.value) return
  navigator.clipboard.writeText(myReferralCode.value)
    .then(() => alert('📋 推薦碼已複製到剪貼簿！'))
    .catch(() => alert('複製失敗，請手動選取複製'))
}

const copyShareLink = () => {
  if (!shareLink.value) return
  const text = `🎭 加入劇光燈 LARP！

我在玩劇光燈桌遊 LARP，快來跟我一起冒險吧！
用我的推坑碼「${myReferralCode.value}」加入，新手可以立刻獲得 $50 折價券喔！

👉 點我加入：${shareLink.value}`
  navigator.clipboard.writeText(text)
    .then(() => alert('📋 分享訊息已複製！直接貼給朋友吧～'))
    .catch(() => alert('複製失敗，請手動選取複製'))
}

const downloadQr = () => {
  const canvas = document.querySelector('#qr-canvas canvas')
  if (!canvas) return
  const link = document.createElement('a')
  link.download = `劇光燈推坑碼-${myReferralCode.value}.png`
  link.href = canvas.toDataURL('image/png')
  link.click()
}

// ─────────────────────────────────────────
//  掃碼綁定推坑碼（給新手用）
// ─────────────────────────────────────────
const showRefScanner = ref(false)
const refVideoRef    = ref(null)
const refCanvasRef   = ref(null)
let refStream = null
let refRafId  = null

const openRefScanner = async () => {
  showRefScanner.value = true
  await new Promise(r => setTimeout(r, 100))
  try {
    refStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
    refVideoRef.value.srcObject = refStream
    await refVideoRef.value.play()
    tickRefScan()
  } catch (err) {
    alert('無法開啟相機：' + (err?.message || err))
    closeRefScanner()
  }
}

const closeRefScanner = () => {
  cancelAnimationFrame(refRafId)
  if (refStream) { refStream.getTracks().forEach(t => t.stop()); refStream = null }
  showRefScanner.value = false
}

const tickRefScan = () => {
  const video  = refVideoRef.value
  const canvas = refCanvasRef.value
  if (!video || !canvas || !showRefScanner.value) return
  if (video.readyState === video.HAVE_ENOUGH_DATA) {
    canvas.width  = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    ctx.drawImage(video, 0, 0)
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
    const code = jsQR(imageData.data, canvas.width, canvas.height)
    if (code?.data) { handleRefScanResult(code.data); return }
  }
  refRafId = requestAnimationFrame(tickRefScan)
}

const handleRefScanResult = (raw) => {
  closeRefScanner()
  let code = ''
  try {
    const url = new URL(raw)
    code = url.searchParams.get('ref') || ''
  } catch {
    // 不是 URL，嘗試直接當推坑碼（4-10 位英數）
  }
  if (!code) {
    const match = raw.trim().match(/^[A-Z0-9]{4,10}$/i)
    code = match ? raw.trim().toUpperCase() : ''
  }
  if (!code) return alert('這個 QR 碼不含推坑碼喔，請掃老手的推坑 QR 碼！')
  friendCodeInput.value = code.toUpperCase()
  alert(`✅ 已帶入推坑碼「${friendCodeInput.value}」，確認後請點「綁定」！`)
}

onUnmounted(closeRefScanner)

const bindFriendCode = () => withLoading(isBindingCode, async () => {
  if (!isNewbie.value)
    return alert('🚫 老司機別裝萌新啦！推坑碼僅限「首次遊玩前」綁定喔！')

  const code = friendCodeInput.value.trim().toUpperCase()
  if (!code)                        return alert('請輸入朋友的推薦碼！')
  if (code === myReferralCode.value) return alert('你不能輸入自己的推薦碼啦！')

  const { data: target, error: searchErr } = await supabase
    .from('users').select('id, display_name')
    .eq('my_referral_code', code).single()
  if (searchErr || !target) throw new Error('找不到這組推薦碼，請確認是否打錯！')

  const { error: updateErr } = await supabase
    .from('users').update({ referred_by: code }).eq('id', store.userData.id)
  if (updateErr) throw updateErr

  // 發送新手禮
  const { data: rewards } = await supabase
    .from('system_rewards').select('*')
    .eq('event_type', 'referral_newbie').eq('is_active', true)

  let grantedTitles = []
  if (rewards?.length > 0) {
    const coupons = rewards.flatMap((rule) => {
      const qty    = rule.reward_qty || 1
      const expiry = new Date()
      expiry.setDate(expiry.getDate() + (rule.valid_days || 30))
      const desc = (rule.reward_desc || '').replace('{referrer}', target.display_name || '熱心老手')
      grantedTitles.push(rule.reward_title + (qty > 1 ? ` (x${qty})` : ''))
      return Array.from({ length: qty }, () => ({
        user_id:     store.userData.id,
        title:       rule.reward_title,
        description: desc,
        status:      'available',
        expiry_date: expiry.toISOString(),
      }))
    })
    const { error: insertErr } = await supabase.from('coupons').insert(coupons)
    if (insertErr) console.error('發送新手禮失敗:', insertErr)
  }

  const rewardMsg = grantedTitles.length
    ? `\n\n🎉 系統已自動發送迎新大禮包：\n- ${grantedTitles.join('\n- ')}\n\n快去票券夾看看吧！`
    : '\n\n(目前官方暫無迎新派發活動，但您的綁定已成功紀錄！)'

  alert(`✅ 成功綁定！你是由【${target.display_name || '神秘玩家'}】推薦的！${rewardMsg}`)
  isReferredLocked.value = true
  referredBy.value = code
  await store.initLiff()
})
</script>

<template>
  <div class="page-container">

    <!-- ── 頁首 ── -->
    <header class="page-header">
      <div class="title-wrap">
        <span class="title-sub">SPOTLIGHT</span>
        <h1 class="page-title">個人設定</h1>
      </div>
    </header>

    <!-- ── 載入中 ── -->
    <div v-if="store.isLoading" class="loading-state">
      <Loader2 :size="36" :stroke-width="1.5" class="spin-icon" />
      <span>載入中…</span>
    </div>

    <!-- ── 主體 ── -->
    <div v-else class="sections-wrap">

      <!-- 個人資料 -->
      <section class="card">
        <div class="card-shimmer"></div>
        <div class="section-head">
          <User :size="17" :stroke-width="1.8" class="section-icon" />
          <span>個人資料</span>
        </div>

        <div class="form-fields">
          <div class="field-group">
            <label class="field-label">顯示名稱</label>
            <input v-model="form.name" type="text" placeholder="怎麼稱呼你？" class="field-input" />
          </div>

          <div class="field-group">
            <label class="field-label">
              手機號碼
              <span class="badge-required">必填</span>
            </label>
            <input v-model="form.phone" type="tel" inputmode="tel"
                   placeholder="0912-345-678" class="field-input" />
          </div>

          <div class="field-group">
            <label class="field-label">
              電子郵件
              <span class="badge-required">必填</span>
            </label>
            <input v-model="form.email" type="email" inputmode="email"
                   placeholder="example@email.com" class="field-input" />
          </div>

          <div class="field-group">
            <label class="field-label">
              生日
              <span class="field-note">壽星優惠專用</span>
            </label>
            <template v-if="!isBirthdayLocked">
              <input v-model="form.birthday" type="date" class="field-input field-input--date" />
              <p class="field-hint field-hint--gold"><Gift :size="13" :stroke-width="1.8" class="hint-icon" /> 首次填寫生日並完善資料，將獲得驚喜禮物！</p>
            </template>
            <template v-else>
              <div class="locked-field">
                <Lock :size="15" :stroke-width="1.8" class="lock-icon" />
                <span>{{ form.birthday }}</span>
              </div>
              <p class="field-hint">生日已設定，如需修改請聯繫客服。</p>
            </template>
          </div>
        </div>

        <button class="save-btn" @click="save" :disabled="store.isLoading || isSaving">
          <span>確認修改</span>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" stroke-width="1.8"
                  stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
      </section>

      <!-- 分隔 -->
      <div class="section-divider" aria-hidden="true">
        <span class="div-line"></span>
        <span class="div-gem">◆</span>
        <span class="div-line"></span>
      </div>

      <!-- 官方活動代碼 -->
      <section class="card">
        <div class="card-shimmer"></div>
        <div class="section-head">
          <Ticket :size="17" :stroke-width="1.8" class="section-icon" />
          <span>官方活動代碼</span>
        </div>
        <p class="card-desc">輸入官方發布的專屬活動代碼來獲取折價券！</p>
        <div class="code-row">
          <input
            v-model="promoCodeInput"
            type="text"
            inputmode="text"
            placeholder="輸入兌換碼…"
            class="code-input"
            @keyup.enter="redeemPromoCode"
          />
          <button class="action-btn" @click="redeemPromoCode" :disabled="isRedeeming">
            {{ isRedeeming ? '兌換中…' : '兌換' }}
          </button>
        </div>
      </section>

      <!-- 推坑計畫 -->
      <section class="card card--gold">
        <div class="card-shimmer card-shimmer--gold"></div>

        <div class="referral-head">
          <div class="section-head section-head--gold">
            <UserPlus :size="17" :stroke-width="1.8" class="section-icon" />
            <span>好友推坑計畫</span>
          </div>
          <button class="rules-btn" @click="showRulesModal = true">
            <HelpCircle :size="13" :stroke-width="1.8" /> 規則
          </button>
        </div>

        <p class="card-desc">分享專屬碼給新手，完成首場遊戲後雙方都能獲得獎勵！</p>

        <!-- 你的推坑碼 -->
        <div class="sub-block">
          <div class="sub-label">你的專屬推坑碼</div>

          <div v-if="myReferralCode" class="code-display">
            <div class="code-display__left">
              <span class="code-dot"></span>
              <span class="code-text">{{ myReferralCode }}</span>
            </div>
            <button class="copy-btn" @click="copyMyCode"><Copy :size="13" :stroke-width="1.8" /> 複製碼</button>
          </div>
          <div v-if="myReferralCode" class="share-actions">
            <button class="share-btn" @click="copyShareLink">
              <Link2 :size="13" :stroke-width="1.8" /> 複製連結
            </button>
            <button class="share-btn share-btn--qr" @click="showQrModal = true">
              <QrCode :size="13" :stroke-width="1.8" /> QR 碼
            </button>
          </div>

          <button v-else-if="!isNewbie" class="generate-btn"
                  @click="generateMyCode" :disabled="isGeneratingCode">
            <template v-if="isGeneratingCode">生成中…</template>
            <template v-else><Sparkles :size="14" :stroke-width="1.8" /> 點我生成專屬代碼</template>
          </button>

          <div v-else class="status-badge">
            <Lock :size="14" :stroke-width="1.8" />
            <span>需完成首場遊戲後解鎖</span>
          </div>
        </div>

        <!-- 填寫朋友推坑碼 -->
        <div class="sub-block sub-block--spaced">
          <div class="sub-label">是朋友推薦你來的嗎？</div>

          <div v-if="isReferredLocked" class="bound-box">
            <span style="display:flex;align-items:center;gap:6px"><UserCheck :size="15" :stroke-width="1.8" /> 已綁定推坑老手</span>
            <span class="bound-code">{{ referredBy }}</span>
          </div>

          <div v-else-if="!isNewbie" class="status-badge status-badge--red">
            <Ban :size="14" :stroke-width="1.8" />
            <span>推坑碼僅限首次遊玩前填寫</span>
          </div>

          <div v-else class="code-row">
            <input
              v-model="friendCodeInput"
              type="text"
              inputmode="text"
              placeholder="輸入朋友的推坑碼…"
              class="code-input"
            />
            <button class="action-btn action-btn--scan" @click="openRefScanner" title="掃描老手的 QR 碼">
              <ScanLine :size="16" :stroke-width="1.8" />
            </button>
            <button class="action-btn action-btn--gold"
                    @click="bindFriendCode" :disabled="isBindingCode">
              {{ isBindingCode ? '綁定中…' : '綁定' }}
            </button>
          </div>
        </div>
      </section>

    </div><!-- /sections-wrap -->

    <!-- ── QR 碼 Modal ── -->
    <Teleport to="body">
      <Transition name="slide-up">
        <div v-if="showQrModal" class="modal-overlay" @click.self="showQrModal = false">
          <div class="qr-modal" role="dialog" aria-label="推坑 QR 碼">
            <div class="modal-handle"></div>
            <div class="modal-header">
              <h2 class="modal-title"><QrCode :size="16" :stroke-width="1.8" class="title-icon" /> 分享推坑連結</h2>
              <button class="modal-close" @click="showQrModal = false">✕</button>
            </div>
            <div class="qr-body">
              <p class="qr-hint">將 QR 碼或連結傳給朋友，<br>他們掃碼後會自動帶入你的推坑碼！</p>
              <div class="qr-canvas-wrap" id="qr-canvas">
                <QrcodeVue
                  :value="shareLink"
                  :size="200"
                  level="M"
                  :margin="2"
                  foreground="#D4AF37"
                  background="#111111"
                />
              </div>
              <div class="qr-code-label">{{ myReferralCode }}</div>
              <div class="qr-url">{{ shareLink }}</div>
              <div class="qr-actions">
                <button class="share-action-btn" @click="copyShareLink">
                  <Link2 :size="15" :stroke-width="1.8" /> 複製連結
                </button>
                <button class="share-action-btn share-action-btn--gold" @click="downloadQr">
                  <Download :size="15" :stroke-width="1.8" /> 下載圖片
                </button>
              </div>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- ── 掃碼綁定 Overlay ── -->
    <Teleport to="body">
      <div v-if="showRefScanner" class="ref-scanner-overlay">
        <video ref="refVideoRef" class="ref-scanner-video" playsinline muted></video>
        <canvas ref="refCanvasRef" style="display:none"></canvas>
        <div class="ref-scanner-frame">
          <div class="ref-scanner-line"></div>
        </div>
        <p class="ref-scanner-hint">將老手的 QR 碼對準框框內</p>
        <button class="ref-scanner-close" @click="closeRefScanner">✕ 取消</button>
      </div>
    </Teleport>

    <!-- ── 規則 Modal ── -->
    <Teleport to="body">
      <Transition name="slide-up">
        <div v-if="showRulesModal" class="modal-overlay" @click.self="showRulesModal = false">
          <div class="rules-modal" role="dialog" aria-modal="true" aria-label="推坑計畫規則說明">
            <div class="modal-handle" aria-hidden="true"></div>

            <div class="modal-header">
              <h2 class="modal-title"><UserPlus :size="16" :stroke-width="1.8" class="title-icon" /> 推坑計畫規則說明</h2>
              <button class="modal-close" @click="showRulesModal = false" aria-label="關閉">✕</button>
            </div>

            <div class="modal-body">
              <div class="rule-item">
                <div class="rule-icon"><Sprout :size="22" :stroke-width="1.5" /></div>
                <div class="rule-content">
                  <h3>誰可以填寫別人的推坑碼？</h3>
                  <p>必須是<strong class="text-red">從未遊玩過（經驗值為 0）</strong>的新手才能填寫。綁定後即可立即獲得 $50 迎新折價券！</p>
                  <p class="text-dim">（若已完成過首場遊戲，系統將自動關閉綁定功能，無法事後補填喔！）</p>
                </div>
              </div>
              <div class="rule-item">
                <div class="rule-icon"><Crown :size="22" :stroke-width="1.5" /></div>
                <div class="rule-content">
                  <h3>誰可以產生自己的推坑碼？</h3>
                  <p>只要您<strong class="text-gold">完成過至少一場遊戲</strong>，系統就會為您解鎖專屬的推坑碼。</p>
                </div>
              </div>
              <div class="rule-item">
                <div class="rule-icon"><Gift :size="22" :stroke-width="1.5" /></div>
                <div class="rule-content">
                  <h3>老手要怎麼拿到推坑獎勵？</h3>
                  <p>當您推薦的新手成功綁定您的代碼，並且<strong class="text-gold">完成他們的第一場遊戲（掃描核銷獲得經驗值）</strong>後，系統就會自動發送 $100 折價券到您的票券夾！</p>
                </div>
              </div>
            </div>

            <div class="modal-footer">
              <button class="modal-confirm" @click="showRulesModal = false">我知道了</button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

  </div>
</template>

<style scoped>
/* ══════════════════════════════════════
   Design Tokens
══════════════════════════════════════ */
.page-container {
  --gold:         #D4AF37;
  --gold-light:   #f5d77a;
  --gold-dark:    #9e761c;
  --gold-dim:     rgba(212,175,55,0.12);
  --gold-border:  rgba(212,175,55,0.3);

  --surface:      rgba(18,17,14,0.88);
  --border:       rgba(255,255,255,0.07);
  --text-main:    #e8e3d6;
  --text-muted:   #666;
  --text-dim:     #444;
  --red:          #e05252;

  --radius-card:  20px;
  --radius-btn:   12px;
  --radius-input: 12px;
  --touch:        48px;   /* 手機最小觸控高度 */
}

/* ══════════════════════════════════════
   根容器
══════════════════════════════════════ */
.page-container {
  max-width: 600px;
  margin: 0 auto;
  padding: 28px 20px 100px;
  box-sizing: border-box;
  color: var(--text-main);
  font-family: 'Noto Sans TC', 'PingFang TC', sans-serif;
}
@media (min-width: 480px) {
  .page-container { padding-left: 28px; padding-right: 28px; }
}

/* ══════════════════════════════════════
   頁首
══════════════════════════════════════ */
.page-header {
  display: flex; align-items: flex-end; justify-content: space-between;
  padding: 0 0 14px 4px;
  border-bottom: 1px solid rgba(255,255,255,0.08);
  margin-bottom: 28px;
}
.title-wrap { display: flex; flex-direction: column; gap: 2px; }
.title-sub {
  font-size: 0.62rem; font-weight: 700;
  letter-spacing: 4px; color: var(--gold); opacity: 0.7;
}
.page-title {
  font-size: 1.8rem; font-weight: 900; margin: 0; letter-spacing: 3px;
  background: linear-gradient(135deg, #fff 0%, #fceabb 40%, #D4AF37 100%);
  -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;
}

/* ══════════════════════════════════════
   載入中
══════════════════════════════════════ */
.loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  padding: 60px 0;
  color: var(--text-muted);
  font-size: .9rem;
}
@keyframes spin { to { transform: rotate(360deg); } }
.spin-icon { color: var(--gold); animation: spin 1.2s linear infinite; }

/* ══════════════════════════════════════
   卡片
══════════════════════════════════════ */
.sections-wrap { display: flex; flex-direction: column; gap: 0; }

.card {
  position: relative;
  background: var(--surface);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1px solid var(--border);
  border-radius: var(--radius-card);
  padding: 22px 18px 24px;
  overflow: hidden;
  box-shadow: 0 12px 40px rgba(0,0,0,0.45);
}
.card--gold { border-color: rgba(212,175,55,0.18); margin-top: 24px; }

.card-shimmer {
  position: absolute;
  top: 0; left: 20%; right: 20%;
  height: 1px;
  background: linear-gradient(90deg, transparent, rgba(255,255,255,0.1), transparent);
}
.card-shimmer--gold {
  background: linear-gradient(90deg, transparent, var(--gold) 40%, var(--gold-light) 50%, var(--gold) 60%, transparent);
  animation: shimmer 4s ease-in-out infinite;
}
@keyframes shimmer { 0%,100% { opacity:.6 } 50% { opacity:1 } }

@media (min-width: 480px) { .card { padding: 24px 22px 26px; } }

/* ══════════════════════════════════════
   Section head
══════════════════════════════════════ */
.section-head {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 1rem;
  font-weight: 700;
  color: #ccc;
  letter-spacing: .5px;
  border-bottom: 1px solid var(--border);
  padding-bottom: 14px;
  margin-bottom: 20px;
}
.section-head--gold { color: var(--gold-light); }
.section-icon { flex-shrink: 0; color: #aaa; }
.section-head--gold .section-icon { color: var(--gold-light); }
.hint-icon { vertical-align: middle; margin-right: 2px; }
.lock-icon { opacity: .45; flex-shrink: 0; }
.title-icon { flex-shrink: 0; }
.modal-title { display: flex; align-items: center; gap: 8px; }
.rules-btn { display: flex; align-items: center; gap: 5px; }
.copy-btn { display: flex; align-items: center; gap: 6px; }
.generate-btn { display: flex; align-items: center; justify-content: center; gap: 6px; }
.rule-icon { color: var(--gold); }

.card-desc { color: var(--text-muted); font-size: .85rem; line-height: 1.55; margin: 0 0 16px; }

/* ══════════════════════════════════════
   表單欄位
══════════════════════════════════════ */
.form-fields { display: flex; flex-direction: column; gap: 20px; }

.field-label {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  font-size: .74rem;
  font-weight: 700;
  letter-spacing: 1.2px;
  text-transform: uppercase;
  color: var(--text-muted);
  margin-bottom: 8px;
}
.badge-required {
  font-size: .62rem;
  font-weight: 700;
  letter-spacing: .5px;
  text-transform: uppercase;
  color: var(--red);
  background: rgba(224,82,82,.1);
  border: 1px solid rgba(224,82,82,.28);
  padding: 1px 6px;
  border-radius: 4px;
}
.field-note { font-size: .7rem; color: var(--text-dim); text-transform: none; letter-spacing: 0; font-weight: 400; }

/* 確保所有輸入框手機觸控高度 ≥ 48px */
.field-input {
  width: 100%;
  min-height: var(--touch);
  padding: 12px 16px;
  background: rgba(0,0,0,0.3);
  border: 1px solid rgba(255,255,255,0.09);
  border-radius: var(--radius-input);
  color: var(--text-main);
  font-size: 1rem;
  font-family: inherit;
  box-sizing: border-box;
  transition: border-color .2s, box-shadow .2s;
  -webkit-appearance: none;
}
.field-input:focus {
  outline: none;
  border-color: rgba(212,175,55,0.45);
  box-shadow: 0 0 0 3px rgba(212,175,55,0.07);
}
.field-input::placeholder { color: rgba(255,255,255,0.22); }
.field-input--date::-webkit-calendar-picker-indicator { filter: invert(.35); }

.locked-field {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: var(--touch);
  padding: 12px 16px;
  background: rgba(0,0,0,0.18);
  border: 1px solid var(--border);
  border-radius: var(--radius-input);
  color: rgba(255,255,255,0.35);
  font-size: .95rem;
  box-sizing: border-box;
}
.lock-icon { opacity: .4; }

.field-hint { font-size: .77rem; color: var(--text-dim); margin: 7px 0 0; line-height: 1.45; }
.field-hint--gold { color: rgba(212,175,55,0.65); }

/* ══════════════════════════════════════
   儲存按鈕
══════════════════════════════════════ */
.save-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  min-height: var(--touch);
  margin-top: 22px;
  padding: 13px 20px;
  background: linear-gradient(130deg, var(--gold-dark), var(--gold) 40%, var(--gold-light) 55%, var(--gold) 70%, var(--gold-dark));
  background-size: 220% 100%;
  color: #000;
  font-size: 1rem;
  font-weight: 900;
  font-family: inherit;
  border: none;
  border-radius: var(--radius-btn);
  cursor: pointer;
  box-shadow: 0 4px 18px rgba(212,175,55,0.2);
  animation: btn-flow 5s linear infinite;
  transition: transform .2s, box-shadow .2s;
}
.save-btn:hover  { transform: translateY(-2px); box-shadow: 0 8px 26px rgba(212,175,55,0.3); }
.save-btn:active { transform: scale(.98); }
.save-btn:disabled { opacity: .5; cursor: not-allowed; transform: none; animation: none; }
@keyframes btn-flow { 0% { background-position: 150% 0; } 100% { background-position: -150% 0; } }

/* ══════════════════════════════════════
   分隔線
══════════════════════════════════════ */
.section-divider { display: flex; align-items: center; gap: 12px; padding: 24px 0; }
.div-line { flex: 1; height: 1px; background: rgba(255,255,255,0.05); }
.div-gem  { font-size: .5rem; color: var(--gold); opacity: .3; }

/* ══════════════════════════════════════
   代碼輸入行
══════════════════════════════════════ */
.code-row { display: flex; gap: 10px; }

/* 極小螢幕直排 */
@media (max-width: 360px) {
  .code-row { flex-direction: column; }
  .action-btn { width: 100%; }
}

.code-input {
  flex: 1;
  min-height: var(--touch);
  padding: 12px 16px;
  background: rgba(0,0,0,0.3);
  border: 1px dashed var(--gold-border);
  border-radius: var(--radius-input);
  color: var(--gold-light);
  font-size: 1rem;
  font-weight: 700;
  font-family: 'Courier New', monospace;
  text-transform: uppercase;
  letter-spacing: 1.5px;
  box-sizing: border-box;
  transition: border-color .2s, box-shadow .2s;
  -webkit-appearance: none;
}
.code-input:focus {
  outline: none;
  border-style: solid;
  border-color: var(--gold);
  box-shadow: 0 0 0 3px rgba(212,175,55,0.07);
}
.code-input::placeholder {
  color: rgba(255,255,255,0.22);
  font-weight: 400;
  text-transform: none;
  letter-spacing: 0;
  font-size: .88rem;
  font-family: inherit;
}

.action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: var(--touch);
  padding: 0 20px;
  background: var(--gold-dim);
  border: 1px solid var(--gold-border);
  border-radius: var(--radius-btn);
  color: var(--gold);
  font-size: .95rem;
  font-weight: 700;
  font-family: inherit;
  cursor: pointer;
  white-space: nowrap;
  transition: background .2s, border-color .2s;
}
.action-btn:hover   { background: rgba(212,175,55,0.2); border-color: var(--gold); }
.action-btn:disabled { background: rgba(255,255,255,0.03); color: #444; border-color: #333; cursor: not-allowed; }
.action-btn--gold   { background: rgba(212,175,55,0.1); }
.action-btn--scan   { padding: 0 12px; background: rgba(255,255,255,0.03); border-color: #444; color: #888; flex-shrink: 0; }
.action-btn--scan:hover { background: rgba(255,255,255,0.08); color: #fff; }

/* ══════════════════════════════════════
   推坑計畫
══════════════════════════════════════ */
.referral-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 14px;
  padding-bottom: 14px;
  border-bottom: 1px solid rgba(212,175,55,0.1);
}
.referral-head .section-head { border: none; padding: 0; margin: 0; }

.rules-btn {
  min-height: 38px;
  padding: 0 12px;
  background: transparent;
  border: 1px solid #333;
  border-radius: 20px;
  color: #666;
  font-size: .75rem;
  font-family: inherit;
  cursor: pointer;
  white-space: nowrap;
  flex-shrink: 0;
  transition: .2s;
}
.rules-btn:hover { color: var(--gold); border-color: var(--gold-border); }

.sub-block {}
.sub-block--spaced { margin-top: 18px; }
.sub-label {
  font-size: .72rem;
  font-weight: 700;
  letter-spacing: 1px;
  text-transform: uppercase;
  color: var(--text-dim);
  margin-bottom: 10px;
}

.code-display {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  background: rgba(212,175,55,0.04);
  border: 1px dashed var(--gold-border);
  border-radius: 14px;
  padding: 14px 16px;
}
.code-display__left { display: flex; align-items: center; gap: 10px; min-width: 0; }

.code-dot {
  width: 8px; height: 8px;
  border-radius: 50%;
  background: var(--gold);
  box-shadow: 0 0 8px rgba(212,175,55,0.6);
  flex-shrink: 0;
  animation: pulse 2s ease-in-out infinite;
}
@keyframes pulse {
  0%,100% { box-shadow: 0 0 6px rgba(212,175,55,0.6); }
  50%      { box-shadow: 0 0 14px rgba(212,175,55,0.9); }
}

.code-text {
  font-family: 'Courier New', monospace;
  font-size: clamp(1.2rem, 5vw, 1.55rem);
  font-weight: 900;
  color: var(--gold-light);
  letter-spacing: 3px;
  text-shadow: 0 0 12px rgba(212,175,55,0.3);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.copy-btn {
  min-height: 40px;
  padding: 0 14px;
  background: rgba(212,175,55,0.1);
  border: 1px solid var(--gold-border);
  border-radius: 8px;
  color: var(--gold);
  font-size: .85rem;
  font-weight: 700;
  font-family: inherit;
  cursor: pointer;
  white-space: nowrap;
  flex-shrink: 0;
  transition: .2s;
}
.copy-btn:hover  { background: var(--gold); color: #000; }
.copy-btn:active { transform: scale(.95); }

.generate-btn {
  width: 100%;
  min-height: var(--touch);
  padding: 12px;
  background: rgba(212,175,55,0.05);
  border: 1px dashed var(--gold-border);
  border-radius: var(--radius-input);
  color: var(--gold);
  font-size: .95rem;
  font-weight: 700;
  font-family: inherit;
  cursor: pointer;
  transition: .2s;
}
.generate-btn:hover    { background: rgba(212,175,55,0.12); border-style: solid; }
.generate-btn:disabled { opacity: .5; cursor: not-allowed; }

.status-badge {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  background: rgba(255,255,255,0.02);
  border: 1px solid var(--border);
  border-radius: var(--radius-input);
  color: var(--text-dim);
  font-size: .88rem;
}
.status-badge--red {
  background: rgba(224,82,82,0.04);
  border-color: rgba(224,82,82,0.2);
  color: rgba(224,82,82,0.75);
}

.bound-box {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
  background: rgba(212,175,55,0.05);
  border: 1px solid rgba(212,175,55,0.22);
  border-radius: var(--radius-input);
  padding: 13px 18px;
  color: var(--gold-light);
  font-weight: 600;
  font-size: .9rem;
}
.bound-code {
  font-family: 'Courier New', monospace;
  font-size: 1.05rem;
  font-weight: 900;
  letter-spacing: 2px;
  color: var(--gold);
}

.share-actions {
  display: flex;
  gap: 8px;
  margin-top: 10px;
}
.share-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  min-height: 40px;
  padding: 0 10px;
  background: rgba(255,255,255,0.03);
  border: 1px solid #333;
  border-radius: 10px;
  color: #aaa;
  font-size: .82rem;
  font-weight: 600;
  font-family: inherit;
  cursor: pointer;
  transition: .2s;
}
.share-btn:hover        { background: rgba(255,255,255,0.07); color: #fff; border-color: #555; }
.share-btn--qr          { background: rgba(212,175,55,0.05); border-color: var(--gold-border); color: var(--gold); }
.share-btn--qr:hover    { background: rgba(212,175,55,0.15); border-color: var(--gold); }

/* QR Modal */
.qr-modal {
  width: 100%;
  max-width: 500px;
  background: #111;
  border-radius: 24px 24px 0 0;
  border-top: 2px solid rgba(212,175,55,0.4);
  padding-bottom: env(safe-area-inset-bottom, 20px);
}
.qr-body {
  padding: 0 28px 28px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
}
.qr-hint {
  margin: 0;
  font-size: .85rem;
  color: #888;
  text-align: center;
  line-height: 1.6;
}
.qr-canvas-wrap {
  padding: 16px;
  background: #111;
  border-radius: 16px;
  border: 1px solid rgba(212,175,55,0.25);
  display: flex;
  align-items: center;
  justify-content: center;
}
.qr-code-label {
  font-family: 'Courier New', monospace;
  font-size: 1.4rem;
  font-weight: 900;
  letter-spacing: 4px;
  color: var(--gold-light);
}
.qr-url {
  font-size: .72rem;
  color: #555;
  word-break: break-all;
  text-align: center;
  padding: 0 8px;
}
.qr-actions {
  display: flex;
  gap: 10px;
  width: 100%;
}
.share-action-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 48px;
  border-radius: 12px;
  border: 1px solid #333;
  background: rgba(255,255,255,0.04);
  color: #aaa;
  font-size: .9rem;
  font-weight: 700;
  font-family: inherit;
  cursor: pointer;
  transition: .2s;
}
.share-action-btn:hover          { background: rgba(255,255,255,0.08); color: #fff; }
.share-action-btn--gold          { background: rgba(212,175,55,0.1); border-color: var(--gold-border); color: var(--gold); }
.share-action-btn--gold:hover    { background: var(--gold); color: #000; }

/* 掃碼 Overlay */
.ref-scanner-overlay {
  position: fixed; inset: 0; z-index: 10000;
  background: #000;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
}
.ref-scanner-video { width: 100%; height: 100%; object-fit: cover; }
.ref-scanner-frame {
  position: absolute;
  width: 220px; height: 220px;
  border: 2px solid var(--gold);
  border-radius: 12px;
  box-shadow: 0 0 0 9999px rgba(0,0,0,0.55);
  overflow: hidden;
}
.ref-scanner-line {
  position: absolute; top: 0; left: 0; right: 0;
  height: 2px; background: var(--gold); opacity: 0.8;
  animation: ref-scan-move 1.8s linear infinite;
}
@keyframes ref-scan-move { 0% { top: 0; } 50% { top: calc(100% - 2px); } 100% { top: 0; } }
.ref-scanner-hint {
  position: absolute; bottom: 140px;
  color: #fff; font-size: .9rem; text-align: center;
  text-shadow: 0 1px 4px rgba(0,0,0,0.8);
  margin: 0;
}
.ref-scanner-close {
  position: absolute; bottom: 70px;
  padding: 12px 32px; border-radius: 24px;
  background: rgba(255,255,255,0.15); border: 1px solid rgba(255,255,255,0.3);
  color: #fff; font-size: .95rem; font-weight: 700; font-family: inherit; cursor: pointer;
}

/* ══════════════════════════════════════
   Modal
══════════════════════════════════════ */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.85);
  z-index: 9999;
  display: flex;
  justify-content: center;
  align-items: flex-end;
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
}

.rules-modal {
  width: 100%;
  max-width: 600px;
  max-height: 88svh;
  background: #111;
  border-radius: 24px 24px 0 0;
  border-top: 2px solid rgba(212,175,55,0.4);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 0 -10px 40px rgba(0,0,0,0.8);
  /* iOS 劉海安全區 */
  padding-bottom: env(safe-area-inset-bottom, 0px);
}

.modal-handle {
  width: 40px; height: 4px;
  border-radius: 2px;
  background: #2a2a2a;
  margin: 12px auto 0;
  flex-shrink: 0;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 14px 20px;
  border-bottom: 1px solid #1e1e1e;
  flex-shrink: 0;
}
.modal-title { font-size: 1rem; font-weight: 700; color: var(--gold-light); margin: 0; }

.modal-close {
  /* 觸控區放大到 48×48 */
  display: flex;
  align-items: center;
  justify-content: center;
  width: var(--touch); height: var(--touch);
  margin: -8px -8px -8px 0;
  background: rgba(255,255,255,0.06);
  border: none;
  border-radius: 50%;
  color: #666;
  font-size: .9rem;
  cursor: pointer;
  transition: .2s;
}
.modal-close:hover { background: rgba(255,255,255,0.14); color: #fff; }

.modal-body {
  padding: 20px;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 22px;
}

.rule-item { display: flex; gap: 14px; }

.rule-icon {
  font-size: 1.5rem;
  width: 44px; height: 44px;
  background: rgba(255,255,255,0.04);
  border: 1px solid var(--border);
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.rule-content h3 { margin: 2px 0 8px; color: #ddd; font-size: .95rem; font-weight: 700; }
.rule-content p  { margin: 0 0 6px; color: #777; font-size: .86rem; line-height: 1.6; }

.text-red  { color: var(--red);  font-weight: 700; }
.text-gold { color: var(--gold); font-weight: 700; }
.text-dim  { color: #444; font-size: .8rem !important; }

.modal-footer { padding: 12px 20px 20px; flex-shrink: 0; }
.modal-confirm {
  width: 100%;
  min-height: var(--touch);
  background: rgba(255,255,255,0.05);
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: var(--radius-btn);
  color: #888;
  font-size: .95rem;
  font-weight: 700;
  font-family: inherit;
  cursor: pointer;
  transition: .2s;
}
.modal-confirm:hover { background: rgba(255,255,255,0.1); color: #fff; }

/* ══════════════════════════════════════
   Modal 動畫
══════════════════════════════════════ */
.slide-up-enter-active,
.slide-up-leave-active      { transition: opacity .3s ease; }
.slide-up-enter-active .rules-modal,
.slide-up-leave-active .rules-modal { transition: transform .35s cubic-bezier(.2,.8,.2,1); }
.slide-up-enter-from,
.slide-up-leave-to          { opacity: 0; }
.slide-up-enter-from .rules-modal,
.slide-up-leave-to .rules-modal     { transform: translateY(100%); }
</style>