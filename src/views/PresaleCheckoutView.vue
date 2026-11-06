<script setup>
// 雙 11 預售結帳頁：#/checkout?order=<code>
// 官網建單 → 轉 LIFF → 這裡確認明細、填聯絡資料（認領）→ 顯示匯款資訊
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useUserStore } from '../stores/user'
import { presaleMember, money, groupItems, ticketCount } from '../utils/presaleApi'
import PresaleBankInfo from '../components/PresaleBankInfo.vue'

const route = useRoute()
const router = useRouter()
const store = useUserStore()

const order = ref(null)
const bank = ref(null)
const loading = ref(true)
const submitting = ref(false)
const errorMsg = ref('')
const form = ref({ name: '', phone: '', email: '' })

const code = computed(() => String(route.query.order || ''))
const lines = computed(() => groupItems(order.value?.items, order.value?.qty || 1))
const claimed = computed(() => order.value && order.value.status !== 'unclaimed')

const load = async () => {
  loading.value = true
  errorMsg.value = ''
  try {
    if (!code.value) throw new Error('缺少訂單代碼，請回官網重新結帳')
    const r = await presaleMember({ action: 'get', code: code.value })
    order.value = r.order
    bank.value = r.bank
  } catch (err) {
    errorMsg.value = err.message
  } finally {
    loading.value = false
  }
}

onMounted(async () => {
  const u = store.userData || {}
  form.value = { name: '', phone: u.phone || '', email: u.email || '' }
  await load()
})

const submit = async () => {
  if (submitting.value) return
  submitting.value = true
  errorMsg.value = ''
  try {
    const r = await presaleMember({ action: 'claim', code: code.value, ...form.value })
    order.value = r.order
    bank.value = r.bank
    window.scrollTo({ top: 0, behavior: 'smooth' })
  } catch (err) {
    errorMsg.value = err.message
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="presale-page">
    <div class="head">
      <span class="sub">SPOTLIGHT 雙11預售</span>
      <h2>{{ claimed ? '訂單已成立' : '確認訂單' }}</h2>
    </div>

    <div v-if="loading" class="card muted">讀取訂單中…</div>

    <div v-else-if="!order" class="card">
      <p class="danger">{{ errorMsg }}</p>
      <button class="btn ghost" @click="router.push('/orders')">查看我的訂單</button>
    </div>

    <template v-else>
      <div v-if="order.is_test" class="test-tag">測試訂單</div>

      <!-- 明細 -->
      <div class="card">
        <div class="row small"><span>訂單編號</span><span>{{ order.order_no }}</span></div>
        <div v-if="(order.qty || 1) > 1" class="row small"><span>人份</span><span>{{ order.qty }} 人份（每本 {{ order.qty }} 張）</span></div>
        <div class="divider"></div>
        <div v-for="l in lines" :key="l.id" class="row">
          <span>{{ l.title }}<b v-if="l.qty > 1"> × {{ l.qty }}</b></span>
          <span>{{ money(l.price * l.qty) }}</span>
        </div>
        <div class="divider"></div>
        <div class="row small"><span>原價小計（{{ ticketCount(order) }} 張）</span><span>{{ money(order.subtotal) }}</span></div>
        <div v-if="order.discount" class="row small"><span>多本折抵</span><span class="ok">−{{ money(order.discount) }}</span></div>
        <div class="row total"><span>應付金額</span><span>{{ money(order.total) }}</span></div>
      </div>

      <!-- 未認領：填聯絡資料 -->
      <div v-if="!claimed" class="card">
        <h3>聯絡資料</h3>
        <label>姓名<input v-model.trim="form.name" class="input" maxlength="50" placeholder="匯款人或訂購人姓名" /></label>
        <label>手機<input v-model.trim="form.phone" class="input" inputmode="tel" maxlength="20" placeholder="09xxxxxxxx" /></label>
        <label>Email<input v-model.trim="form.email" class="input" type="email" maxlength="100" /></label>
        <p class="hint">票券會放進這個 LINE 帳號的票券匣。同行朋友要用時，由你在現場用自己的 LINE 核銷。</p>
        <p v-if="errorMsg" class="danger">{{ errorMsg }}</p>
        <button class="btn gold" :disabled="submitting" @click="submit">{{ submitting ? '送出中…' : `確認訂購 ${money(order.total)}` }}</button>
      </div>

      <!-- 已認領：匯款資訊 -->
      <template v-else>
        <PresaleBankInfo v-if="order.status === 'awaiting_payment'" :bank="bank" :total="order.total" />
        <div class="card">
          <p v-if="order.status === 'awaiting_payment'">匯款後，請到「我的訂單」填寫匯款日期與帳號後五碼，我們查帳後會把票券放進你的票券匣，並用 LINE 通知你。</p>
          <p v-else-if="order.status === 'reviewing'">已收到你的匯款資料，查帳中。</p>
          <p v-else-if="order.status === 'issued'">票券已經放進你的票券匣了。</p>
          <button class="btn gold" @click="router.push('/orders')">{{ order.status === 'awaiting_payment' ? '填寫匯款資料' : '我的訂單' }}</button>
        </div>
      </template>
    </template>
  </div>
</template>

<style scoped>
.presale-page { max-width: 480px; margin: 0 auto; padding: 24px 16px 100px; color: #eee; display: flex; flex-direction: column; gap: 14px; }
.head .sub { font-size: 0.7rem; letter-spacing: 3px; color: #D4AF37; font-weight: 700; }
.head h2 { margin: 4px 0 0; font-size: 1.6rem; color: #fff; }
.card { background: rgba(18,18,18,0.85); border: 1px solid rgba(255,255,255,0.08); border-radius: 18px; padding: 18px; display: flex; flex-direction: column; gap: 8px; }
.card h3 { margin: 0 0 4px; color: #D4AF37; font-size: 1rem; }
.card p { margin: 0; line-height: 1.6; font-size: 0.9rem; }
.row { display: flex; justify-content: space-between; gap: 12px; font-size: 0.95rem; }
.row.small { font-size: 0.82rem; color: #999; }
.row.total { font-size: 1.15rem; font-weight: 800; color: #D4AF37; margin-top: 4px; }
.divider { height: 1px; background: rgba(255,255,255,0.08); margin: 4px 0; }
label { display: flex; flex-direction: column; gap: 4px; font-size: 0.85rem; color: #aaa; }
.input { background: #0b0b0b; color: #eee; border: 1px solid #333; border-radius: 10px; padding: 10px 12px; font-size: 1rem; font-family: inherit; }
.input:focus { outline: none; border-color: #D4AF37; }
.btn { border: none; border-radius: 12px; padding: 13px; font-size: 1rem; font-weight: 800; cursor: pointer; margin-top: 6px; }
.btn.gold { background: #D4AF37; color: #000; }
.btn.gold:disabled { opacity: 0.5; }
.btn.ghost { background: transparent; border: 1px solid #444; color: #ccc; }
.hint { color: #888; font-size: 0.8rem !important; }
.muted { color: #888; }
.danger { color: #e74c3c; }
.ok { color: #5eff8a; }
.test-tag { align-self: flex-start; background: #8e44ad; color: #fff; font-size: 0.75rem; font-weight: 700; padding: 3px 10px; border-radius: 10px; }
</style>
