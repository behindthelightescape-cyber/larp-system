<script setup>
// 後台：雙 11 預售訂單（查帳發券、退回、取消、匯款設定、統計）
import { ref, computed, onMounted } from 'vue'
import { supabase } from '../supabase'
import { PRESALE_STATUS, money, groupItems, ticketCount, extraCount } from '../utils/presaleApi'

const props = defineProps({ role: { type: String, default: 'admin' } })
const tab = ref('orders') // orders | settings | rules | stats
const rules = ref(null)
const statusFilter = ref('reviewing')
const orders = ref([])
const counts = ref({})
const loading = ref(false)
const errorMsg = ref('')
const notice = ref('')
const busy = ref('')
const settings = ref(null)
const stats = ref(null)
const statsTest = ref(false)

const FILTERS = [
  { key: 'reviewing', label: '待查帳' },
  { key: 'awaiting_payment', label: '待匯款' },
  { key: 'issued', label: '已發券' },
  { key: 'unclaimed', label: '未認領' },
  { key: 'cancelled', label: '已取消' },
  { key: 'expired', label: '已失效' },
  { key: '', label: '全部' },
]

// 只讀的動作連線失敗時自動重試一次（手機切回前景、網路一瞬間斷掉很常見）；發券、退回等寫入動作不重試
const READ_ACTIONS = ['list', 'stats', 'get_settings', 'get_items']
const invoke = async (body) => {
  let { data, error } = await supabase.functions.invoke('presale-admin', { body })
  if (error?.name === 'FunctionsFetchError' && READ_ACTIONS.includes(body.action)) {
    await new Promise((r) => setTimeout(r, 800))
    ;({ data, error } = await supabase.functions.invoke('presale-admin', { body }))
  }
  if (error?.name === 'FunctionsFetchError') {
    throw new Error(READ_ACTIONS.includes(body.action)
      ? '連線失敗，請確認網路後按「重新整理」'
      : '連線失敗，這個動作可能沒有完成：請按「重新整理」確認訂單狀態後再試')
  }
  if (error) {
    let msg = error.message
    try { msg = (await error.context.json()).error || msg } catch { /* ignore */ }
    throw new Error(msg)
  }
  return data
}

const fmt = (iso) => iso
  ? new Date(iso).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })
  : '--'

const loadOrders = async () => {
  loading.value = true
  errorMsg.value = ''
  try {
    const r = await invoke({ action: 'list', status: statusFilter.value })
    orders.value = r.orders
    counts.value = r.counts
  } catch (err) {
    errorMsg.value = err.message
  } finally {
    loading.value = false
  }
}
const setFilter = (k) => { statusFilter.value = k; loadOrders() }

const act = async (o, action, extra = {}) => {
  busy.value = o.id
  errorMsg.value = ''
  notice.value = ''
  try {
    const r = await invoke({ action, id: o.id, ...extra })
    if (action === 'approve') notice.value = `${o.order_no} 已發 ${r.issued} 張券。`
    if (action === 'reject') notice.value = `${o.order_no} 已退回。`
    if (action === 'cancel') notice.value = `${o.order_no} 已取消。`
    if (r.push_error) notice.value += `（LINE 通知失敗：${r.push_error}）`
    await loadOrders()
  } catch (err) {
    errorMsg.value = err.message
  } finally {
    busy.value = ''
  }
}
const approve = (o) => {
  if (!confirm(`確認已收到 ${o.order_no} 的匯款 ${money(o.total)}？\n會發 ${ticketCount(o)} 張預售券給 ${o.contact_name || '會員'}，並用 LINE 通知。`)) return
  act(o, 'approve')
}
const reject = (o) => {
  const reason = prompt(`退回 ${o.order_no}，請輸入原因（會用 LINE 通知玩家）：`, '查無此筆匯款，請確認匯款日期與帳號後五碼')
  if (reason === null) return
  if (!reason.trim()) { errorMsg.value = '請填寫退回原因'; return }
  act(o, 'reject', { reason })
}
const cancel = (o) => {
  if (!confirm(`確定取消 ${o.order_no}？取消後玩家不能再填匯款資料。`)) return
  act(o, 'cancel')
}

const amountMismatch = (o) => o.remit_amount != null && o.remit_amount !== o.total

// ── 設定 ──
const loadSettings = async () => {
  try { settings.value = (await invoke({ action: 'get_settings' })).settings }
  catch (err) { errorMsg.value = err.message }
}
const saveSettings = async () => {
  busy.value = 'settings'
  errorMsg.value = ''
  notice.value = ''
  try {
    settings.value = (await invoke({ action: 'save_settings', settings: settings.value })).settings
    notice.value = '設定已儲存。'
  } catch (err) {
    errorMsg.value = err.message
  } finally {
    busy.value = ''
  }
}

// ── 票券文字（使用規則）──
const loadRules = async () => {
  try {
    rules.value = (await invoke({ action: 'get_items' })).items
      .map((i) => ({ ...i, coupon_desc: i.coupon_desc ?? '', _orig: { t: i.coupon_title, d: i.coupon_desc ?? '' }, apply: true }))
  } catch (err) { errorMsg.value = err.message }
}
const TAGS = [['{劇本}', '劇本名'], ['{價格}', '預售價'], ['{漲價後}', '2/4 起價格']]
const fmtN = (n) => Number(n).toLocaleString('en-US')
const renderTag = (t, r) => (t || '').split('{劇本}').join(r.script_name)
  .split('{價格}').join(fmtN(r.price)).split('{漲價後}').join(fmtN(r.later_price ?? r.price))
// 在游標位置插入標籤（沒點過欄位就加在使用規則最後）
const lastField = ref(null)
const insertTag = (r, tag) => {
  const f = lastField.value?.r === r ? lastField.value : { r, key: 'coupon_desc', el: null }
  const el = f.el
  const v = r[f.key] || ''
  const pos = el ? el.selectionStart ?? v.length : v.length
  const end = el ? el.selectionEnd ?? pos : pos
  r[f.key] = v.slice(0, pos) + tag + v.slice(end)
  if (el) requestAnimationFrame(() => { el.focus(); el.setSelectionRange(pos + tag.length, pos + tag.length) })
}
const ruleDirty = (r) => r.coupon_title !== r._orig.t || r.coupon_desc !== r._orig.d
const applyAllRule = (src) => {
  if (!confirm(`把《${src.script_name}》的使用規則套用到全部劇本？（名稱也會一起套用；文字裡的「${src.script_name}」會換成 {劇本} 標籤，還要按各本的儲存才會生效）`)) return
  for (const r of rules.value) if (r !== src) {
    r.coupon_desc = src.coupon_desc.split(src.script_name).join('{劇本}')
    r.coupon_title = src.coupon_title.split(src.script_name).join('{劇本}')
  }
}
const saveRule = async (r) => {
  busy.value = 'rule-' + r.id
  errorMsg.value = ''
  notice.value = ''
  try {
    const res = await invoke({ action: 'save_item', id: r.id, coupon_title: r.coupon_title, coupon_desc: r.coupon_desc, apply_issued: r.apply })
    r._orig = { t: r.coupon_title.trim(), d: r.coupon_desc.trim() }
    r.coupon_title = r._orig.t
    r.coupon_desc = r._orig.d
    notice.value = `《${r.script_name}》已儲存${r.apply ? `，同時更新了 ${res.updated} 張已發出未使用的券` : '（之後發的券才會用新文字）'}。`
  } catch (err) {
    errorMsg.value = err.message
  } finally {
    busy.value = ''
  }
}

// ── 統計 ──
const loadStats = async () => {
  try { stats.value = await invoke({ action: 'stats', include_test: statsTest.value }) }
  catch (err) { errorMsg.value = err.message }
}
const funnelSteps = computed(() => {
  const f = stats.value?.funnel
  if (!f) return []
  const pct = (n) => (f.created ? `${Math.round((n / f.created) * 100)}%` : '–')
  return [
    { label: '建單', n: f.created, pct: '100%' },
    { label: '認領', n: f.claimed, pct: pct(f.claimed) },
    { label: '回填匯款', n: f.reported, pct: pct(f.reported) },
    { label: '發券', n: f.issued, pct: pct(f.issued) },
  ]
})

const switchTab = (t) => {
  tab.value = t
  errorMsg.value = ''
  notice.value = ''
  if (t === 'settings' && !settings.value) loadSettings()
  if (t === 'stats') loadStats()
  if (t === 'rules' && !rules.value) loadRules()
}

onMounted(() => { loadOrders(); loadSettings() })
</script>

<template>
  <div class="presale-admin">
    <div class="tabs">
      <button :class="{ active: tab === 'orders' }" @click="switchTab('orders')">訂單</button>
      <button v-if="props.role === 'admin'" :class="{ active: tab === 'settings' }" @click="switchTab('settings')">匯款設定</button>
      <button v-if="props.role === 'admin'" :class="{ active: tab === 'rules' }" @click="switchTab('rules')">票券規則</button>
      <button :class="{ active: tab === 'stats' }" @click="switchTab('stats')">統計</button>
    </div>

    <div v-if="settings?.test_mode" class="alert warn">
      目前是<b>測試模式</b>：開賣前也能建單（訂單標記「測試」）。正式開賣前請到「匯款設定」關掉。
    </div>
    <div v-if="settings && !settings.account_no" class="alert warn">還沒設定匯款帳號，玩家結帳後會看到「匯款帳號整理中」。</div>
    <div v-if="errorMsg" class="alert danger">{{ errorMsg }}</div>
    <div v-if="notice" class="alert success">{{ notice }}</div>

    <!-- 訂單 -->
    <template v-if="tab === 'orders'">
      <div class="filters">
        <button v-for="f in FILTERS" :key="f.key" :class="{ active: statusFilter === f.key }" @click="setFilter(f.key)">
          {{ f.label }}<span v-if="f.key && counts[f.key]" class="cnt">{{ counts[f.key] }}</span>
        </button>
        <button class="link" @click="loadOrders">重新整理</button>
      </div>

      <div v-if="loading" class="hint">讀取中…</div>
      <div v-else-if="!orders.length" class="hint">沒有訂單。</div>

      <div v-for="o in orders" :key="o.id" class="order">
        <div class="o-head">
          <b>{{ o.order_no }}</b>
          <span v-if="o.is_test" class="test">測試</span>
          <span class="status" :class="PRESALE_STATUS[o.status]?.cls">{{ PRESALE_STATUS[o.status]?.text }}</span>
          <span class="muted">建單 {{ fmt(o.created_at) }}</span>
        </div>
        <div class="o-grid">
          <div>
            <div class="lbl">會員</div>
            <div v-if="o.member">{{ o.member.display_name }} <span class="muted">#{{ o.member.legacy_id }}</span></div>
            <div v-else class="muted">（未認領）</div>
            <div v-if="o.contact_name" class="muted">{{ o.contact_name }}・{{ o.contact_phone }}<br />{{ o.contact_email }}</div>
          </div>
          <div>
            <div class="lbl">品項（{{ o.items.length }} 本<template v-if="(o.qty || 1) > 1"> × {{ o.qty }} 組</template><template v-if="extraCount(o.extra)">＋加購 {{ extraCount(o.extra) }} 張</template>＝{{ ticketCount(o) }} 張）</div>
            <div v-for="l in groupItems(o.items, o.qty || 1, o.extra)" :key="l.id">{{ l.title }}<template v-if="l.qty > 1"> × {{ l.qty }}</template></div>
          </div>
          <div>
            <div class="lbl">金額</div>
            <div>應付 <b class="gold">{{ money(o.total) }}</b></div>
            <div v-if="o.discount" class="muted">原價 {{ money(o.subtotal) }}・折 {{ money(o.discount) }}</div>
          </div>
          <div>
            <div class="lbl">匯款回報</div>
            <template v-if="o.remit_last5">
              <div>{{ o.remit_date }}・後五碼 <b>{{ o.remit_last5 }}</b></div>
              <div v-if="o.remit_amount != null" :class="{ danger: amountMismatch(o) }">金額 {{ money(o.remit_amount) }}<template v-if="amountMismatch(o)">（與應付不符）</template></div>
              <div class="muted">{{ fmt(o.remit_reported_at) }} 回報</div>
            </template>
            <div v-else class="muted">—</div>
            <div v-if="o.reject_reason" class="danger">退回原因：{{ o.reject_reason }}</div>
            <div v-if="o.reviewed_by" class="muted">{{ o.reviewed_by }}・{{ fmt(o.reviewed_at) }}</div>
          </div>
        </div>
        <div v-if="o.utm_source" class="muted">來源：{{ o.utm_source }} / {{ o.utm_medium || '-' }} / {{ o.utm_campaign || '-' }}<template v-if="o.utm_content"> / {{ o.utm_content }}</template></div>
        <div class="o-actions">
          <button v-if="o.status === 'reviewing'" class="btn gold" :disabled="busy === o.id" @click="approve(o)">確認並發券</button>
          <button v-if="o.status === 'reviewing'" class="btn dark" :disabled="busy === o.id" @click="reject(o)">退回</button>
          <button v-if="['unclaimed','awaiting_payment','reviewing'].includes(o.status)" class="btn link danger" :disabled="busy === o.id" @click="cancel(o)">取消訂單</button>
        </div>
      </div>
    </template>

    <!-- 匯款設定 -->
    <template v-if="tab === 'settings' && settings">
      <div class="card">
        <div class="form-row">
          <label>銀行名稱<input v-model="settings.bank_name" class="input" placeholder="例：國泰世華" /></label>
          <label>銀行代碼<input v-model="settings.bank_code" class="input small" placeholder="013" /></label>
        </div>
        <label>帳號<input v-model="settings.account_no" class="input" /></label>
        <label>戶名<input v-model="settings.account_name" class="input" /></label>
        <label>匯款頁補充說明（選填）<textarea v-model="settings.remit_note" class="input" rows="3"></textarea></label>
        <label class="check"><input v-model="settings.test_mode" type="checkbox" /> 測試模式（開賣前也能建單，訂單標記「測試」）</label>
        <button class="btn gold" :disabled="busy === 'settings'" @click="saveSettings">{{ busy === 'settings' ? '儲存中…' : '儲存' }}</button>
      </div>
      <p class="hint">品項、價格、折抵級距目前直接改資料庫（presale_items、presale_tiers）。</p>
    </template>

    <!-- 票券名稱與使用規則 -->
    <template v-if="tab === 'rules' && rules">
      <p class="hint">這裡的文字會寫進發給玩家的票券（名稱＋說明）。可以用標籤：<code>{劇本}</code> 劇本名、<code>{價格}</code> 預售價、<code>{漲價後}</code> 2/4 起價格，發券時會自動換成該本的內容。改完按該本的「儲存」。</p>
      <div v-for="r in rules" :key="r.id" class="card rule">
        <div class="o-head"><b class="gold">《{{ r.script_name }}》</b><span v-if="ruleDirty(r)" class="muted">（未儲存）</span></div>
        <label>票券名稱<input v-model="r.coupon_title" class="input" @focus="lastField = { r, key: 'coupon_title', el: $event.target }" /></label>
        <label>使用規則<textarea v-model="r.coupon_desc" class="input" rows="5" @focus="lastField = { r, key: 'coupon_desc', el: $event.target }"></textarea></label>
        <div class="tagbar">插入標籤：<button v-for="[t, n] in TAGS" :key="t" class="tag" @mousedown.prevent @click="insertTag(r, t)">{{ n }}</button></div>
        <div class="preview"><div class="lbl">玩家看到的樣子</div><b>{{ renderTag(r.coupon_title, r) }}</b><div>{{ renderTag(r.coupon_desc, r) }}</div></div>
        <label class="check"><input v-model="r.apply" type="checkbox" /> 同時更新已發出、還沒使用的券</label>
        <div class="o-actions">
          <button class="btn gold" :disabled="busy === 'rule-' + r.id || !ruleDirty(r)" @click="saveRule(r)">{{ busy === 'rule-' + r.id ? '儲存中…' : '儲存' }}</button>
          <button class="btn link" @click="applyAllRule(r)">把這段規則套用到全部劇本</button>
        </div>
      </div>
    </template>

    <!-- 統計 -->
    <template v-if="tab === 'stats'">
      <label class="check"><input v-model="statsTest" type="checkbox" @change="loadStats" /> 只看測試訂單</label>
      <div v-if="stats" class="stats">
        <div class="kpis">
          <div class="kpi"><div class="lbl">已發券營收</div><b>{{ money(stats.revenue) }}</b></div>
          <div class="kpi"><div class="lbl">已發券張數</div><b>{{ stats.tickets }}</b></div>
          <div class="kpi"><div class="lbl">平均客單價</div><b>{{ money(stats.avg_order) }}</b></div>
        </div>
        <h4>收款狀況</h4>
        <table v-if="stats.money" class="tbl">
          <tr><td>✅ 已付款（已發券）</td><td>{{ stats.money.paid.orders }} 單</td><td><b class="gold">{{ money(stats.money.paid.amount) }}</b></td></tr>
          <tr><td>🔍 已回報匯款，待查帳</td><td>{{ stats.money.reviewing.orders }} 單</td><td>{{ money(stats.money.reviewing.amount) }}</td></tr>
          <tr><td>⏳ 未付款（已認領）</td><td>{{ stats.money.unpaid.orders }} 單</td><td>{{ money(stats.money.unpaid.amount) }}</td></tr>
          <tr><td class="muted">未認領（沒登入 LINE）</td><td class="muted">{{ stats.money.unclaimed.orders }} 單</td><td class="muted">{{ money(stats.money.unclaimed.amount) }}</td></tr>
        </table>
        <h4>漏斗</h4>
        <table class="tbl"><tr v-for="s in funnelSteps" :key="s.label"><td>{{ s.label }}</td><td>{{ s.n }}</td><td class="muted">{{ s.pct }}</td></tr></table>
        <h4>每單本數（已發券）</h4>
        <table class="tbl"><tr v-for="(n, k) in stats.qty_dist" :key="k"><td>{{ k }} 本</td><td>{{ n }} 單</td></tr></table>
        <h4>每單組數（已發券）</h4>
        <table class="tbl">
          <tr v-for="(n, k) in stats.party_dist" :key="k"><td>{{ k }} 組</td><td>{{ n }} 單</td></tr>
          <tr v-if="!Object.keys(stats.party_dist || {}).length"><td class="muted">還沒有資料</td></tr>
        </table>
        <h4>UTM 來源（已發券）</h4>
        <table class="tbl">
          <tr v-for="(v, k) in stats.utm" :key="k"><td>{{ k }}</td><td>{{ v.orders }} 單</td><td>{{ money(v.revenue) }}</td></tr>
          <tr v-if="!Object.keys(stats.utm).length"><td class="muted">還沒有資料</td></tr>
        </table>
        <h4>每日建單</h4>
        <table class="tbl"><tr v-for="(n, d) in stats.by_day" :key="d"><td>{{ d }}</td><td>{{ n }}</td></tr></table>
      </div>
    </template>
  </div>
</template>

<style scoped>
.presale-admin { max-width: 980px; color: #ddd; }
.tabs, .filters { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 14px; align-items: center; }
.tabs button, .filters button:not(.link) { background: #1a1a1a; color: #aaa; border: 1px solid #333; border-radius: 8px; padding: 7px 14px; cursor: pointer; }
.tabs button.active, .filters button.active { background: #D4AF37; color: #000; border-color: #D4AF37; font-weight: bold; }
.cnt { margin-left: 6px; background: rgba(0,0,0,0.25); border-radius: 10px; padding: 0 7px; font-size: 0.8rem; }
.order { background: #111; border: 1px solid #222; border-radius: 12px; padding: 14px 16px; margin-bottom: 12px; display: flex; flex-direction: column; gap: 10px; }
.o-head { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
.o-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; font-size: 0.88rem; }
@media (max-width: 760px) { .o-grid { grid-template-columns: 1fr 1fr; } }
.lbl { color: #888; font-size: 0.78rem; margin-bottom: 3px; }
.o-actions { display: flex; gap: 8px; }
.status { font-size: 0.75rem; font-weight: 700; padding: 3px 10px; border-radius: 10px; }
.st-wait, .st-pay { background: rgba(241,196,15,0.12); color: #f1c40f; }
.st-review { background: rgba(52,152,219,0.12); color: #3498db; }
.st-done { background: rgba(46,204,113,0.12); color: #2ecc71; }
.st-off { background: #222; color: #888; }
.test { background: #8e44ad; color: #fff; font-size: 0.7rem; padding: 2px 8px; border-radius: 8px; }
.gold { color: #D4AF37; }
.muted { color: #777; font-size: 0.82rem; }
.danger { color: #e74c3c; }
.hint { color: #888; font-size: 0.85rem; }
.btn { padding: 8px 16px; border-radius: 8px; font-weight: bold; cursor: pointer; border: none; }
.btn.gold { background: #D4AF37; color: #000; }
.btn.dark { background: #2a2a2a; color: #eee; border: 1px solid #444; }
.btn:disabled { opacity: 0.5; cursor: not-allowed; }
.link { background: none; border: none; color: #888; cursor: pointer; text-decoration: underline; font-size: 0.85rem; }
.link.danger { color: #e74c3c; }
.alert { border-radius: 8px; padding: 10px 14px; margin-bottom: 12px; font-size: 0.9rem; }
.alert.danger { background: rgba(231,76,60,0.1); border: 1px solid rgba(231,76,60,0.4); color: #e74c3c; }
.alert.success { background: rgba(46,204,113,0.1); border: 1px solid rgba(46,204,113,0.4); color: #2ecc71; }
.alert.warn { background: rgba(241,196,15,0.08); border: 1px solid rgba(241,196,15,0.35); color: #f1c40f; }
.card { background: #111; border: 1px solid #222; border-radius: 12px; padding: 18px; display: flex; flex-direction: column; gap: 10px; max-width: 520px; }
.tagbar { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; color: #888; font-size: 0.82rem; }
.tag { background: #1d1d1d; color: #D4AF37; border: 1px solid #444; border-radius: 12px; padding: 3px 10px; font-size: 0.8rem; cursor: pointer; }
.preview { background: #0b0b0b; border: 1px dashed #333; border-radius: 8px; padding: 10px 12px; font-size: 0.88rem; color: #ccc; white-space: pre-wrap; line-height: 1.5; }
.preview b { color: #fff; display: block; margin-bottom: 4px; }
code { color: #D4AF37; }
.card.rule { margin-bottom: 12px; max-width: 640px; }
.form-row { display: flex; gap: 10px; }
.form-row label:first-child { flex: 1; }
label { display: flex; flex-direction: column; gap: 4px; color: #aaa; font-size: 0.85rem; }
label.check { flex-direction: row; align-items: center; gap: 8px; color: #ccc; }
.input { background: #0b0b0b; color: #eee; border: 1px solid #333; border-radius: 8px; padding: 9px 12px; font-size: 0.95rem; font-family: inherit; }
.input.small { width: 90px; }
.input:focus { outline: none; border-color: #D4AF37; }
.stats h4 { color: #D4AF37; margin: 18px 0 6px; }
.kpis { display: flex; gap: 12px; flex-wrap: wrap; margin-top: 10px; }
.kpi { background: #111; border: 1px solid #222; border-radius: 10px; padding: 12px 18px; min-width: 150px; }
.kpi b { font-size: 1.3rem; color: #D4AF37; }
.tbl { border-collapse: collapse; font-size: 0.9rem; }
.tbl td { padding: 5px 16px 5px 0; border-bottom: 1px solid #1d1d1d; }
</style>
