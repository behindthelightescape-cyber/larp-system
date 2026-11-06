<script setup>
// 我的預售訂單：#/orders — 看狀態、回填匯款資料、看退回原因
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { presaleMember, PRESALE_STATUS, money, groupItems } from '../utils/presaleApi'
import PresaleBankInfo from '../components/PresaleBankInfo.vue'

const router = useRouter()
const orders = ref([])
const bank = ref(null)
const loading = ref(true)
const errorMsg = ref('')
const forms = ref({})     // order.id → { remit_date, last5, amount }
const sending = ref('')
const formErr = ref({})

const today = () => new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10)

const load = async () => {
  loading.value = true
  errorMsg.value = ''
  try {
    const r = await presaleMember({ action: 'my_orders' })
    orders.value = r.orders
    bank.value = r.bank
    for (const o of r.orders) {
      if (!forms.value[o.id]) forms.value[o.id] = { remit_date: today(), last5: '', amount: '' }
    }
  } catch (err) {
    errorMsg.value = err.message
  } finally {
    loading.value = false
  }
}
onMounted(load)

const submitRemit = async (o) => {
  if (sending.value) return
  sending.value = o.id
  formErr.value[o.id] = ''
  try {
    const f = forms.value[o.id]
    const r = await presaleMember({ action: 'remit', order_id: o.id, remit_date: f.remit_date, last5: f.last5, amount: f.amount })
    Object.assign(o, r.order)
  } catch (err) {
    formErr.value[o.id] = err.message
  } finally {
    sending.value = ''
  }
}
</script>

<template>
  <div class="presale-page">
    <div class="head">
      <span class="sub">SPOTLIGHT 雙11預售</span>
      <h2>我的預售訂單</h2>
    </div>

    <div v-if="loading" class="card muted">讀取中…</div>
    <div v-else-if="errorMsg" class="card danger">{{ errorMsg }}</div>
    <div v-else-if="!orders.length" class="card muted">還沒有預售訂單。</div>

    <div v-for="o in orders" :key="o.id" class="card">
      <div class="top">
        <span class="no">{{ o.order_no }}<span v-if="o.is_test" class="test">測試</span></span>
        <span class="status" :class="PRESALE_STATUS[o.status]?.cls">{{ PRESALE_STATUS[o.status]?.text || o.status }}</span>
      </div>
      <div class="items">
        <span v-if="(o.qty || 1) > 1" class="party">{{ o.qty }} 人份</span>
        <span v-for="l in groupItems(o.items, o.qty || 1)" :key="l.id">{{ l.title }}<template v-if="l.qty > 1"> × {{ l.qty }}</template></span>
      </div>
      <div class="row total"><span>應付金額</span><span>{{ money(o.total) }}</span></div>

      <!-- 待確認：還沒填聯絡資料 -->
      <button v-if="o.status === 'unclaimed'" class="btn gold" @click="router.push({ path: '/checkout', query: { order: o.code } })">繼續結帳</button>

      <!-- 待匯款：匯款資訊＋回填表單 -->
      <template v-if="o.status === 'awaiting_payment'">
        <div v-if="o.reject_reason" class="reject">上次填寫的資料被退回：{{ o.reject_reason }}</div>
        <PresaleBankInfo :bank="bank" :total="o.total" />
        <div class="remit">
          <h4>匯款後填寫</h4>
          <label>匯款日期<input v-model="forms[o.id].remit_date" type="date" :max="today()" class="input" /></label>
          <label>帳號後五碼<input v-model.trim="forms[o.id].last5" inputmode="numeric" maxlength="5" class="input" placeholder="12345" /></label>
          <label>匯款金額（選填）<input v-model.trim="forms[o.id].amount" inputmode="numeric" class="input" :placeholder="String(o.total)" /></label>
          <p v-if="formErr[o.id]" class="danger">{{ formErr[o.id] }}</p>
          <button class="btn gold" :disabled="sending === o.id" @click="submitRemit(o)">{{ sending === o.id ? '送出中…' : '送出匯款資料' }}</button>
        </div>
      </template>

      <p v-if="o.status === 'reviewing'" class="info">已收到匯款資料（{{ o.remit_date }}・後五碼 {{ o.remit_last5 }}），查帳中，完成後會用 LINE 通知你。</p>
      <template v-if="o.status === 'issued'">
        <p class="info">票券已放進你的票券匣。</p>
        <button class="btn ghost" @click="router.push('/coupons')">打開票券匣</button>
      </template>
    </div>
  </div>
</template>

<style scoped>
.presale-page { max-width: 480px; margin: 0 auto; padding: 24px 16px 100px; color: #eee; display: flex; flex-direction: column; gap: 14px; }
.head .sub { font-size: 0.7rem; letter-spacing: 3px; color: #D4AF37; font-weight: 700; }
.head h2 { margin: 4px 0 0; font-size: 1.6rem; color: #fff; }
.card { background: rgba(18,18,18,0.85); border: 1px solid rgba(255,255,255,0.08); border-radius: 18px; padding: 18px; display: flex; flex-direction: column; gap: 10px; }
.top { display: flex; justify-content: space-between; align-items: center; }
.no { font-weight: 700; color: #fff; }
.test { margin-left: 8px; background: #8e44ad; color: #fff; font-size: 0.7rem; padding: 2px 8px; border-radius: 8px; }
.status { font-size: 0.78rem; font-weight: 700; padding: 3px 10px; border-radius: 10px; }
.st-wait, .st-pay { background: rgba(241,196,15,0.12); color: #f1c40f; }
.st-review { background: rgba(52,152,219,0.12); color: #3498db; }
.st-done { background: rgba(46,204,113,0.12); color: #2ecc71; }
.st-off { background: #222; color: #888; }
.party { color: #D4AF37; font-weight: 700; }
.items { display: flex; flex-wrap: wrap; gap: 4px 12px; font-size: 0.88rem; color: #ccc; }
.row { display: flex; justify-content: space-between; }
.row.total { font-weight: 800; color: #D4AF37; }
.remit { display: flex; flex-direction: column; gap: 8px; border-top: 1px solid rgba(255,255,255,0.08); padding-top: 12px; }
.remit h4 { margin: 0; color: #D4AF37; font-size: 0.95rem; }
label { display: flex; flex-direction: column; gap: 4px; font-size: 0.85rem; color: #aaa; }
.input { background: #0b0b0b; color: #eee; border: 1px solid #333; border-radius: 10px; padding: 10px 12px; font-size: 1rem; font-family: inherit; color-scheme: dark; }
.input:focus { outline: none; border-color: #D4AF37; }
.btn { border: none; border-radius: 12px; padding: 12px; font-size: 0.95rem; font-weight: 800; cursor: pointer; }
.btn.gold { background: #D4AF37; color: #000; }
.btn.gold:disabled { opacity: 0.5; }
.btn.ghost { background: transparent; border: 1px solid #444; color: #ccc; }
.reject { background: rgba(231,76,60,0.1); border: 1px solid rgba(231,76,60,0.4); color: #e74c3c; border-radius: 10px; padding: 10px 12px; font-size: 0.85rem; }
.info { margin: 0; font-size: 0.88rem; color: #bbb; line-height: 1.6; }
.muted { color: #888; }
.danger { color: #e74c3c; margin: 0; font-size: 0.85rem; }
</style>
