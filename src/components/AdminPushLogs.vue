<script setup>
import { ref, onMounted, watch } from 'vue'
import { supabase } from '../supabase'

const PAGE = 50

const SOURCES = {
  birthday: { text: '🎂 生日', cls: 'src-birthday' },
  custom: { text: '✉️ 自訂', cls: 'src-custom' },
  scheduled: { text: '📅 預約', cls: 'src-scheduled' },
}
const STATUS = {
  pending: { text: '⏳ 準備中', cls: 'badge-warning' },
  processing: { text: '🔄 發送中', cls: 'badge-primary' },
  completed: { text: '🟢 已完成', cls: 'badge-success' },
  failed: { text: '🔴 有失敗', cls: 'badge-danger' },
}

const logs = ref([])
const isLoading = ref(true)
const hasMore = ref(false)
const sourceFilter = ref('') // '' | birthday | custom | scheduled
const loadError = ref('')

// 依會員查詢
const memberQuery = ref('')
const memberMatches = ref([])
const member = ref(null) // { id, display_name, legacy_id }

// 展開明細
const expandedId = ref(null)
const recipients = ref([])
const recipientsLoading = ref(false)
const recipientSearch = ref('')

const isTriggering = ref(false)

// ---- 發送通知對象（group_settings.push_notify_user_ids）----
const NOTIFY_KEY = 'push_notify_user_ids'
const notifyUsers = ref([]) // [{ id, display_name, legacy_id }]
const notifyQuery = ref('')
const notifyMatches = ref([])
const notifyMsg = ref('')

const loadNotify = async () => {
  const { data } = await supabase.from('group_settings').select('value').eq('key', NOTIFY_KEY).maybeSingle()
  const ids = String(data?.value || '').split(',').map(s => s.trim()).filter(Boolean)
  if (!ids.length) { notifyUsers.value = []; return }
  const { data: users } = await supabase.from('users').select('id, display_name, legacy_id').in('id', ids)
  notifyUsers.value = users || []
}
const saveNotify = async (list) => {
  const { error } = await supabase.from('group_settings').upsert({
    key: NOTIFY_KEY, value: list.map(u => u.id).join(','), updated_at: new Date().toISOString(),
  })
  if (error) { notifyMsg.value = `儲存失敗：${error.message}`; return }
  notifyUsers.value = list
  notifyMsg.value = '已儲存'
  setTimeout(() => { notifyMsg.value = '' }, 2000)
}
const addNotify = (u) => {
  notifyQuery.value = ''
  notifyMatches.value = []
  if (!/^U[0-9a-f]{32}$/.test(u.id)) { notifyMsg.value = '這個帳號不是 LINE 會員，收不到通知'; return }
  if (notifyUsers.value.some(x => x.id === u.id)) return
  saveNotify([...notifyUsers.value, u])
}
const removeNotify = (id) => saveNotify(notifyUsers.value.filter(u => u.id !== id))

let notifyTimer = null
watch(notifyQuery, (kw) => {
  clearTimeout(notifyTimer)
  const q = kw.trim().replace(/[,()%*\\]/g, '')
  if (!q) { notifyMatches.value = []; return }
  notifyTimer = setTimeout(async () => {
    const { data } = await supabase
      .from('users').select('id, display_name, legacy_id')
      .or(`display_name.ilike.%${q}%,legacy_id.ilike.%${q}%`).limit(8)
    notifyMatches.value = data || []
  }, 300)
})

// ---- 生日推播文案與自動發送開關（group_settings）----
// 預設文案要和 supabase/functions/birthday-push-sniper/index.ts 保持一致
const BDAY_KEYS = { next: 'birthday_msg_next', current: 'birthday_msg_current', auto: 'birthday_auto_enabled' }
const MONTH_TAG = '{月}'
const BDAY_DEFAULTS = {
  next: `🎉 {月}月壽星請提前出列！\n\n為了讓您有充足的時間揪團，專屬您的【階梯式生日大禮包】已經提前派發囉！最高可享『免費暢玩』！\n\n現在立刻點擊下方選單打開「成就系統」，系統就會自動把禮物塞進您的票券夾！趕快來劇光燈預約生日局吧！🎂`,
  current: `🎉 {月}月壽星生日快樂！\n\n專屬您的【階梯式生日大禮包】已經準備好囉！最高可享『免費暢玩』！票券效期到本月底，別錯過了！\n\n現在立刻點擊下方選單打開「成就系統」，系統就會自動把禮物塞進您的票券夾！趕快來劇光燈預約生日局吧！🎂`,
}
const BDAY_LABELS = { next: '下個月壽星（每月 1 號自動發送）', current: '本月壽星（手動補發用）' }
const bdayOpen = ref(false)
const bdayTab = ref('next') // next | current
const bdayText = ref({ next: '', current: '' })
const bdaySaved = ref({ next: '', current: '' })
const bdayAuto = ref(true)
const bdayMsg = ref('')
const bdayBusy = ref(false)

// 以台灣時間算出「下個月／本月」是幾月，給預覽用
const twMonth = (offset) => (new Date(Date.now() + 8 * 3600 * 1000).getUTCMonth() + offset) % 12 + 1
const bdayPreview = (key) => (bdayText.value[key] || '').replaceAll(MONTH_TAG, String(twMonth(key === 'next' ? 1 : 0)))
const bdayDirty = (key) => bdayText.value[key] !== bdaySaved.value[key]
const flashBday = (m) => { bdayMsg.value = m; setTimeout(() => { if (bdayMsg.value === m) bdayMsg.value = '' }, 3000) }

const loadBday = async () => {
  const { data } = await supabase.from('group_settings').select('key, value').in('key', Object.values(BDAY_KEYS))
  const get = (k) => (data || []).find(r => r.key === k)?.value
  for (const key of ['next', 'current']) {
    const v = (get(BDAY_KEYS[key]) || '').trim() || BDAY_DEFAULTS[key]
    bdayText.value[key] = v
    bdaySaved.value[key] = v
  }
  bdayAuto.value = get(BDAY_KEYS.auto) !== 'off'
}
const saveBdaySetting = async (key, value) => {
  const { error } = await supabase.from('group_settings').upsert({ key, value, updated_at: new Date().toISOString() })
  if (error) throw error
}
const saveBdayText = async (key) => {
  const text = bdayText.value[key].trim()
  if (!text) { flashBday('文案不能是空的'); return }
  if (text.length > 5000) { flashBday('LINE 單則訊息最多 5000 字'); return }
  bdayBusy.value = true
  try {
    await saveBdaySetting(BDAY_KEYS[key], text)
    bdayText.value[key] = text
    bdaySaved.value[key] = text
    flashBday('已儲存，下次發送會用這份文案')
  } catch (err) { flashBday(`儲存失敗：${err.message}`) } finally { bdayBusy.value = false }
}
const resetBdayText = (key) => {
  if (!window.confirm('要把編輯框換回系統預設文案嗎？（還沒儲存，按「儲存」才會生效）')) return
  bdayText.value[key] = BDAY_DEFAULTS[key]
}
const toggleBdayAuto = async () => {
  const next = !bdayAuto.value
  const msg = next
    ? '要開啟每月 1 號 10:00 自動發送生日推播嗎？'
    : '要關閉每月自動發送嗎？\n關閉後每月 1 號不會發送（你會收到一則通知提醒），需要時再手動執行。'
  if (!window.confirm(msg)) return
  bdayBusy.value = true
  try {
    await saveBdaySetting(BDAY_KEYS.auto, next ? 'on' : 'off')
    bdayAuto.value = next
    flashBday(next ? '已開啟自動發送' : '已關閉自動發送')
  } catch (err) { flashBday(`儲存失敗：${err.message}`) } finally { bdayBusy.value = false }
}
// 把目前編輯框的內容（含月份代入）發給「發送通知對象」，在手機上確認實際樣子
const testBday = async (key) => {
  if (!notifyUsers.value.length) { flashBday('請先在上方設定發送通知對象，測試訊息會發給他們'); return }
  const names = notifyUsers.value.map(u => u.display_name || u.legacy_id).join('、')
  if (!window.confirm(`要把這份文案發給 ${names} 測試嗎？\n會用掉 ${notifyUsers.value.length} 則額度（另加 1 則發送通知）。`)) return
  bdayBusy.value = true
  try {
    const { data, error } = await supabase.functions.invoke('admin-push', {
      body: {
        action: 'send',
        target: { mode: 'ids', ids: notifyUsers.value.map(u => u.id) },
        message: bdayPreview(key),
        title: '生日文案測試',
      },
    })
    if (error) {
      let m = error.message
      try { m = (await error.context.json()).error || m } catch { /* ignore */ }
      throw new Error(m)
    }
    flashBday(data?.fail ? `測試發送有失敗：${data.fail} 人` : '測試訊息已發出，請看 LINE')
    await fetchLogs()
  } catch (err) { flashBday(`測試失敗：${err.message}`) } finally { bdayBusy.value = false }
}

const formatDate = (s) => s
  ? new Date(s).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })
  : '--'

const fetchLogs = async (append = false) => {
  isLoading.value = true
  loadError.value = ''
  try {
    const from = append ? logs.value.length : 0
    let rows
    if (member.value) {
      // 某位會員收過的推播
      let q = supabase
        .from('push_log_recipients')
        .select('status, message, push_logs!inner(*)')
        .eq('user_id', member.value.id)
        .order('created_at', { ascending: false })
        .range(from, from + PAGE - 1)
      if (sourceFilter.value) q = q.eq('push_logs.source', sourceFilter.value)
      const { data, error } = await q
      if (error) throw error
      rows = (data || []).map(r => ({ ...r.push_logs, my_status: r.status, my_message: r.message }))
    } else {
      let q = supabase.from('push_logs').select('*').order('created_at', { ascending: false }).range(from, from + PAGE - 1)
      if (sourceFilter.value) q = q.eq('source', sourceFilter.value)
      const { data, error } = await q
      if (error) throw error
      rows = data || []
    }
    logs.value = append ? [...logs.value, ...rows] : rows
    hasMore.value = rows.length === PAGE
  } catch (err) {
    console.error('讀取推播紀錄失敗:', err)
    loadError.value = `讀取失敗：${err.message}（如果剛更新系統，請確認 setup_push.sql 已執行）`
  } finally {
    isLoading.value = false
  }
}

onMounted(() => { fetchLogs(); loadNotify(); loadBday() })
watch(sourceFilter, () => { expandedId.value = null; fetchLogs() })

// ---- 會員搜尋 ----
let memberTimer = null
watch(memberQuery, (kw) => {
  clearTimeout(memberTimer)
  const q = kw.trim().replace(/[,()%*\\]/g, '')
  if (!q) { memberMatches.value = []; return }
  memberTimer = setTimeout(async () => {
    const { data } = await supabase
      .from('users').select('id, display_name, legacy_id')
      .or(`display_name.ilike.%${q}%,legacy_id.ilike.%${q}%`).limit(8)
    memberMatches.value = data || []
  }, 300)
})
const pickMember = (u) => {
  member.value = u
  memberQuery.value = ''
  memberMatches.value = []
  expandedId.value = null
  fetchLogs()
}
const clearMember = () => { member.value = null; expandedId.value = null; fetchLogs() }

// ---- 展開收件人 ----
const toggleExpand = async (log) => {
  if (expandedId.value === log.id) { expandedId.value = null; return }
  expandedId.value = log.id
  recipients.value = []
  recipientSearch.value = ''
  recipientsLoading.value = true
  const all = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from('push_log_recipients')
      .select('status, message, users(display_name, legacy_id)')
      .eq('log_id', log.id)
      .order('id')
      .range(from, from + 999)
    if (error) { console.error(error); break }
    all.push(...(data || []))
    if (!data || data.length < 1000) break
  }
  recipients.value = all
  recipientsLoading.value = false
}

const filteredRecipients = (list) => {
  const kw = recipientSearch.value.trim().toLowerCase()
  if (!kw) return list
  return list.filter(r =>
    (r.users?.display_name || '').toLowerCase().includes(kw) || (r.users?.legacy_id || '').includes(kw))
}

// ---- 手動執行生日推播 ----
const triggerManualPush = async (key) => {
  if (bdayDirty(key)) { alert('文案有修改還沒儲存，請先儲存或還原，再發送。'); return }
  const month = twMonth(key === 'next' ? 1 : 0)
  if (!window.confirm(`確定要現在發送給「${month} 月壽星」嗎？\n會使用目前儲存的文案；今年已收過生日推播的人不會重複收到。`)) return
  isTriggering.value = true
  try {
    const { data, error } = await supabase.functions.invoke('birthday-push-sniper', {
      method: 'POST',
      body: { trigger_by: 'admin_manual', month_offset: key === 'next' ? 1 : 0 },
    })
    if (error) throw error
    alert(`✅ ${data?.message || '執行完成'}${data?.success != null ? `：成功 ${data.success} 人，失敗 ${data.fail} 人` : ''}`)
    await fetchLogs()
  } catch (err) {
    alert('執行失敗：' + err.message)
  } finally {
    isTriggering.value = false
  }
}
</script>

<template>
  <div class="push-logs-manager">
    <div class="manager-header">
      <div>
        <h3 style="color: #eee; margin: 0;">📡 推播紀錄</h3>
        <p class="hint">所有 LINE 推播（生日自動推播、自訂、預約）的發送紀錄。點一列可以看訊息內容與收件人。</p>
      </div>
    </div>

    <div class="notify-card">
      <div class="notify-head bday-head" @click="bdayOpen = !bdayOpen">
        <span>🎂 生日推播設定</span>
        <span class="status-badge" :class="bdayAuto ? 'badge-success' : 'badge-secondary'">{{ bdayAuto ? '每月自動發送：開' : '每月自動發送：關' }}</span>
        <span class="hint" style="margin: 0;">編輯文案、測試發送、手動補發</span>
        <span class="muted" style="margin-left: auto;">{{ bdayOpen ? '▲ 收起' : '▼ 展開' }}</span>
      </div>
      <div v-if="bdayOpen" class="bday-body">
        <div class="chips">
          <button v-for="(label, key) in BDAY_LABELS" :key="key" :class="{ active: bdayTab === key }" @click="bdayTab = key">
            {{ label }}<template v-if="bdayDirty(key)"> ・未儲存</template>
          </button>
        </div>
        <div class="bday-grid">
          <div>
            <div class="label">文案（<code>{{ MONTH_TAG }}</code> 會換成月份）</div>
            <textarea v-model="bdayText[bdayTab]" class="input bday-text" rows="10"></textarea>
            <div class="muted small">{{ bdayText[bdayTab].length }} / 5000 字</div>
          </div>
          <div>
            <div class="label">預覽（會員收到的樣子，以 {{ twMonth(bdayTab === 'next' ? 1 : 0) }} 月為例）</div>
            <pre class="msg bday-preview">{{ bdayPreview(bdayTab) }}</pre>
          </div>
        </div>
        <div class="bday-actions">
          <button class="btn btn-gold" :disabled="bdayBusy || !bdayDirty(bdayTab)" @click="saveBdayText(bdayTab)">💾 儲存文案</button>
          <button class="btn btn-dark" :disabled="bdayBusy" @click="testBday(bdayTab)">📱 發給通知對象測試</button>
          <button class="btn btn-dark" :disabled="bdayBusy" @click="resetBdayText(bdayTab)">↺ 換回預設文案</button>
          <span class="spacer"></span>
          <button class="btn btn-dark" :disabled="bdayBusy" @click="toggleBdayAuto">{{ bdayAuto ? '⏸️ 關閉每月自動發送' : '▶️ 開啟每月自動發送' }}</button>
          <button class="btn btn-dark" :disabled="isTriggering || bdayBusy" @click="triggerManualPush(bdayTab)">
            {{ isTriggering ? '發送中...' : `🚀 立即發送給 ${twMonth(bdayTab === 'next' ? 1 : 0)} 月壽星` }}
          </button>
        </div>
        <div v-if="bdayMsg" class="small" style="color: #D4AF37; margin-top: 8px;">{{ bdayMsg }}</div>
        <div class="hint">
          每月 1 號 10:00 會自動用「下個月壽星」文案發給下個月生日的會員。同一位會員一年只會收到一次生日推播。<br />
          修改文案後建議先按「發給通知對象測試」，在手機上確認再儲存。
        </div>
      </div>
    </div>

    <div class="notify-card">
      <div class="notify-head">
        <span>📬 發送通知對象</span>
        <span class="hint" style="margin: 0;">每次推播發出（含生日自動推播、失敗）都會用 LINE 通知這些人，每則通知用掉 1 則額度。</span>
      </div>
      <div class="notify-body">
        <span v-for="u in notifyUsers" :key="u.id" class="n-chip">
          {{ u.display_name || '(無暱稱)' }} <span class="muted">#{{ u.legacy_id }}</span>
          <button @click="removeNotify(u.id)" aria-label="移除">×</button>
        </span>
        <span v-if="!notifyUsers.length" class="muted small">尚未設定，不會發通知</span>
        <div class="member-search small-search">
          <input v-model="notifyQuery" class="input" placeholder="＋ 加入：輸入暱稱或編號" />
          <ul v-if="notifyMatches.length" class="dropdown">
            <li v-for="u in notifyMatches" :key="u.id" @click="addNotify(u)">
              {{ u.display_name || '(無暱稱)' }} <span class="muted">#{{ u.legacy_id }}</span>
            </li>
          </ul>
        </div>
        <span v-if="notifyMsg" class="small" style="color: #D4AF37;">{{ notifyMsg }}</span>
      </div>
    </div>

    <div class="toolbar">
      <div class="chips">
        <button :class="{ active: sourceFilter === '' }" @click="sourceFilter = ''">全部</button>
        <button v-for="(s, key) in SOURCES" :key="key" :class="{ active: sourceFilter === key }" @click="sourceFilter = key">{{ s.text }}</button>
      </div>
      <div class="member-search">
        <div v-if="member" class="member-pill">
          👤 {{ member.display_name || '(無暱稱)' }} #{{ member.legacy_id }} 收過的推播
          <button @click="clearMember" aria-label="清除">×</button>
        </div>
        <template v-else>
          <input v-model="memberQuery" class="input" placeholder="查某位會員收過的推播：輸入暱稱或編號" />
          <ul v-if="memberMatches.length" class="dropdown">
            <li v-for="u in memberMatches" :key="u.id" @click="pickMember(u)">
              {{ u.display_name || '(無暱稱)' }} <span class="muted">#{{ u.legacy_id }}</span>
            </li>
          </ul>
        </template>
      </div>
    </div>

    <div v-if="loadError" class="alert">{{ loadError }}</div>

    <div v-if="isLoading && !logs.length" class="loading-state"><div class="spinner"></div></div>

    <div v-else-if="logs.length === 0" class="empty-state">
      <div style="font-size: 3rem; margin-bottom: 10px;">📭</div>
      <div style="color: #888;">{{ member ? '這位會員還沒收過推播' : '目前沒有推播紀錄' }}</div>
    </div>

    <div v-else class="logs-container">
      <table class="admin-table">
        <thead>
          <tr>
            <th>時間</th>
            <th>類型</th>
            <th>任務</th>
            <th v-if="!member">人數</th>
            <th v-if="!member">成功</th>
            <th v-if="!member">失敗</th>
            <th>{{ member ? '送達' : '狀態' }}</th>
          </tr>
        </thead>
        <tbody>
          <template v-for="log in logs" :key="log.id">
            <tr class="row" :class="{ open: expandedId === log.id }" @click="toggleExpand(log)">
              <td class="nowrap muted">{{ formatDate(log.created_at) }}</td>
              <td><span v-if="SOURCES[log.source]" class="src" :class="SOURCES[log.source].cls">{{ SOURCES[log.source].text }}</span><span v-else class="muted">—</span></td>
              <td>
                <div class="task">{{ log.task_name }}</div>
                <div v-if="log.created_by_name" class="muted small">發送人：{{ log.created_by_name }}</div>
              </td>
              <template v-if="!member">
                <td class="num blue">{{ log.target_count ?? '-' }}</td>
                <td class="num green">{{ log.success_count ?? '-' }}</td>
                <td class="num red">{{ log.fail_count ?? '-' }}</td>
                <td><span class="status-badge" :class="STATUS[log.status]?.cls || 'badge-secondary'">{{ STATUS[log.status]?.text || log.status }}</span></td>
              </template>
              <td v-else>
                <span class="status-badge" :class="log.my_status === 'sent' ? 'badge-success' : 'badge-danger'">{{ log.my_status === 'sent' ? '已送達' : '失敗' }}</span>
              </td>
            </tr>

            <tr v-if="expandedId === log.id" class="detail-row">
              <td :colspan="member ? 4 : 7">
                <div class="detail">
                  <div class="detail-col">
                    <div class="label">訊息內容</div>
                    <pre class="msg">{{ (member && log.my_message) || log.message || '（這筆是舊紀錄，沒有保存內容）' }}</pre>
                    <div v-if="log.error_msg" class="err">錯誤：{{ log.error_msg }}</div>
                  </div>
                  <div v-if="!member" class="detail-col">
                    <div class="label">
                      收件人（{{ recipients.length }}）
                      <input v-if="recipients.length > 10" v-model="recipientSearch" class="input mini" placeholder="搜尋" @click.stop />
                    </div>
                    <div v-if="recipientsLoading" class="muted">載入中…</div>
                    <div v-else-if="!recipients.length" class="muted">沒有收件人明細（舊紀錄或無對象）</div>
                    <ul v-else class="recipients">
                      <li v-for="(r, i) in filteredRecipients(recipients)" :key="i" :title="r.message || ''">
                        <span :class="r.status === 'sent' ? 'green' : 'red'">{{ r.status === 'sent' ? '✓' : '✗' }}</span>
                        {{ r.users?.display_name || '(無暱稱)' }} <span class="muted">#{{ r.users?.legacy_id }}</span>
                        <span v-if="r.message" class="muted small">・個人化</span>
                      </li>
                    </ul>
                  </div>
                </div>
              </td>
            </tr>
          </template>
        </tbody>
      </table>
      <div v-if="hasMore" class="more">
        <button class="btn btn-dark" :disabled="isLoading" @click="fetchLogs(true)">{{ isLoading ? '載入中…' : '載入更多' }}</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.push-logs-manager { padding: 5px; }
.manager-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 20px; margin-bottom: 18px; border-bottom: 1px solid #222; padding-bottom: 15px; }
.hint { color: #888; font-size: 0.85rem; margin-top: 5px; }
.muted { color: #777; }
.small { font-size: 0.8rem; }
.nowrap { white-space: nowrap; }
.green { color: #2ecc71; }
.red { color: #e74c3c; }
.blue { color: #3498db; }

.btn { padding: 10px 20px; border-radius: 8px; font-weight: bold; cursor: pointer; border: none; transition: 0.2s; white-space: nowrap; }
.btn-gold { background: #D4AF37; color: #000; }
.btn-gold:hover:not(:disabled) { background: #e5c358; }
.btn-gold:disabled, .btn-dark:disabled { background: #555; color: #888; cursor: not-allowed; }
.btn-dark { background: #2a2a2a; color: #eee; border: 1px solid #444; }

.toolbar { display: flex; flex-wrap: wrap; gap: 12px; justify-content: space-between; align-items: center; margin-bottom: 14px; }
.chips { display: flex; gap: 6px; flex-wrap: wrap; }
.chips button { background: #1a1a1a; color: #aaa; border: 1px solid #333; border-radius: 16px; padding: 6px 14px; cursor: pointer; font-size: 0.85rem; }
.chips button.active { background: #D4AF37; color: #000; border-color: #D4AF37; font-weight: bold; }

.member-search { position: relative; width: 340px; max-width: 100%; }
.input { width: 100%; box-sizing: border-box; background: #0b0b0b; color: #eee; border: 1px solid #333; border-radius: 8px; padding: 8px 12px; font-size: 0.9rem; font-family: inherit; }
.input:focus { outline: none; border-color: #D4AF37; }
.input.mini { width: 140px; padding: 3px 8px; font-size: 0.8rem; margin-left: 8px; }
.dropdown { position: absolute; z-index: 10; left: 0; right: 0; top: 100%; margin: 4px 0 0; padding: 0; list-style: none; background: #151515; border: 1px solid #333; border-radius: 8px; }
.dropdown li { padding: 8px 12px; cursor: pointer; color: #ddd; font-size: 0.9rem; }
.dropdown li:hover { background: #222; }
.member-pill { background: #1f1a08; border: 1px solid #5a4a14; color: #D4AF37; border-radius: 8px; padding: 8px 12px; font-size: 0.9rem; display: flex; justify-content: space-between; align-items: center; }
.member-pill button { background: none; border: none; color: #D4AF37; font-size: 1.1rem; cursor: pointer; }

.alert { background: rgba(231, 76, 60, 0.1); border: 1px solid rgba(231, 76, 60, 0.4); color: #e74c3c; border-radius: 8px; padding: 10px 14px; margin-bottom: 14px; }
.empty-state { text-align: center; padding: 60px 20px; background: #111; border-radius: 12px; border: 1px dashed #333; }
.logs-container { overflow-x: auto; background: #111; border-radius: 12px; border: 1px solid #222; }

.admin-table { width: 100%; border-collapse: collapse; text-align: left; }
.admin-table th { padding: 13px 15px; background: #1a1a1a; color: #D4AF37; font-weight: bold; border-bottom: 1px solid #333; font-size: 0.88rem; white-space: nowrap; }
.admin-table td { padding: 12px 15px; border-bottom: 1px solid #222; font-size: 0.92rem; vertical-align: top; }
.row { cursor: pointer; }
.row:hover, .row.open { background: #161616; }
.task { color: #eee; font-weight: bold; }
.num { font-weight: bold; }

.src { padding: 3px 10px; border-radius: 12px; font-size: 0.78rem; white-space: nowrap; }
.src-birthday { background: rgba(231, 76, 160, 0.12); color: #ff7eb6; }
.src-custom { background: rgba(212, 175, 55, 0.12); color: #D4AF37; }
.src-scheduled { background: rgba(52, 152, 219, 0.12); color: #5dade2; }

.status-badge { padding: 5px 11px; border-radius: 20px; font-size: 0.78rem; font-weight: bold; white-space: nowrap; }
.badge-warning { background: rgba(241, 196, 15, 0.1); color: #f1c40f; border: 1px solid rgba(241, 196, 15, 0.3); }
.badge-primary { background: rgba(52, 152, 219, 0.1); color: #3498db; border: 1px solid rgba(52, 152, 219, 0.3); }
.badge-success { background: rgba(46, 204, 113, 0.1); color: #2ecc71; border: 1px solid rgba(46, 204, 113, 0.3); }
.badge-danger { background: rgba(231, 76, 60, 0.1); color: #e74c3c; border: 1px solid rgba(231, 76, 60, 0.3); }
.badge-secondary { background: #333; color: #aaa; border: 1px solid #444; }

.detail-row td { background: #0d0d0d; }
.detail { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
@media (max-width: 800px) { .detail { grid-template-columns: 1fr; } }
.label { color: #999; font-size: 0.82rem; margin-bottom: 6px; display: flex; align-items: center; }
.msg { background: #0b0b0b; border: 1px solid #2a2a2a; border-radius: 8px; padding: 12px; white-space: pre-wrap; word-break: break-word; margin: 0; font-family: inherit; font-size: 0.88rem; color: #ddd; max-height: 300px; overflow-y: auto; }
.err { color: #e74c3c; font-size: 0.82rem; margin-top: 8px; white-space: pre-wrap; }
.recipients { list-style: none; margin: 0; padding: 0; max-height: 300px; overflow-y: auto; border: 1px solid #222; border-radius: 8px; }
.recipients li { padding: 6px 10px; border-bottom: 1px solid #1a1a1a; font-size: 0.86rem; color: #ddd; }
.more { text-align: center; padding: 14px; }

.notify-card { background: #111; border: 1px solid #222; border-radius: 12px; padding: 12px 16px; margin-bottom: 16px; }
.notify-head { display: flex; flex-wrap: wrap; gap: 10px; align-items: baseline; color: #D4AF37; font-weight: bold; margin-bottom: 10px; }
.notify-head .hint { font-weight: normal; }
.bday-head { cursor: pointer; align-items: center; margin-bottom: 0; }
.bday-body { margin-top: 12px; }
.bday-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-top: 12px; }
.bday-text { resize: vertical; min-height: 220px; line-height: 1.5; }
.bday-preview { min-height: 220px; max-height: 400px; }
.bday-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; align-items: center; }
.bday-actions .btn { padding: 8px 14px; font-size: 0.85rem; }
.spacer { flex: 1; }
@media (max-width: 800px) { .bday-grid { grid-template-columns: 1fr; } }
.notify-body { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.n-chip { background: #222; color: #eee; border-radius: 16px; padding: 4px 6px 4px 12px; font-size: 0.85rem; display: inline-flex; align-items: center; gap: 4px; }
.n-chip button { background: none; border: none; color: #888; cursor: pointer; font-size: 1rem; }
.n-chip button:hover { color: #e74c3c; }
.small-search { width: 240px; }

.spinner { width: 40px; height: 40px; border: 4px solid rgba(212,175,55,0.2); border-top-color: #D4AF37; border-radius: 50%; animation: spin 1s linear infinite; margin: 40px auto; }
@keyframes spin { to { transform: rotate(360deg); } }
</style>
