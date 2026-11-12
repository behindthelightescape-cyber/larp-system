<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { supabase } from '../supabase'

const MAX_TEXT = 5000
const CATEGORIES = ['情感沉浸', '推理還原', '歡樂有趣', '驚悚恐怖', '機制陣營']

// 對象模式：'filter' 條件篩選（批量廣告）/ 'pick' 指定會員
const mode = ref('filter')

// --- 指定會員 ---
const searchQuery = ref('')
const searchResults = ref([])
const isSearching = ref(false)
const selected = ref([]) // [{ id, display_name, legacy_id, level }]
const pasteIds = ref('')
const pasteMsg = ref('')

// --- 條件篩選 ---
const emptyFilter = () => ({
  level_min: '', level_max: '', points_min: '',
  joined_after: '', joined_before: '', birthday_month: '',
  login_status: '', last_login_after: '', last_login_before: '',
  play_count_min: '', play_count_max: '',
  last_played_after: '', last_played_before: '',
  played_scripts: [], played_scripts_min: '', played_scripts_max: '', not_played_scripts: [],
  achievement_id: '', achievement_missing_max: '', achievement_mode: '',
  categories: [], branches: [], has_coupon: false,
  exclude_presale_buyers: false, exclude_pushed_days: '',
})
const MISSING_TAG = '{缺少劇本}'
const filter = ref(emptyFilter())
const scripts = ref([]) // [{ id, title, is_archived }]
const branchList = ref([])
const achievements = ref([]) // [{ id, title, script_ids }]
const scriptSearch = ref({ played_scripts: '', not_played_scripts: '' })
const SCRIPT_PICKERS = [
  { field: 'played_scripts', label: '玩過（任一）' },
  { field: 'not_played_scripts', label: '沒玩過（全部都沒玩過）' },
]

// --- 訊息（多個對話框）---
// LINE 一次推播最多 5 個訊息物件：純文字＝1、圖文卡片＝1、圖片＝1、圖片下方有文字再＋1。
// 不管幾個對話框，每人都只算 1 則額度。第 1 個對話框送 message／media，第 2 個起送 extra。
const MAX_BUBBLES = 5
const title = ref('')

// 對話框格式：'text' 純文字 / 'image' 圖片＋文字 / 'card' 圖文卡片
const MSG_KINDS = [
  { key: 'text', label: '純文字' },
  { key: 'image', label: '圖片＋文字' },
  { key: 'card', label: '圖文卡片' },
]
const LIFF_URL = 'https://liff.line.me/2009161687-icfQU9r6'
const CARD_TEXT_MAX = 1000
let blockSeq = 0
const newBlock = () => ({
  key: ++blockSeq, kind: 'text', text: '',
  image_url: '', aspect: '20:13', uploading: false, // aspect：卡片大圖比例，上傳時依圖片尺寸自動設定
  card: { title: '', button_label: '', button_url: '' },
})
const blocks = ref([newBlock()])
const textMaxOf = (b) => (b.kind === 'card' ? CARD_TEXT_MAX : MAX_TEXT)
const lineCountOf = (b) => (b.kind === 'image' && b.text.trim() ? 2 : 1)
const bubbleCount = computed(() => blocks.value.reduce((n, b) => n + lineCountOf(b), 0))
const canAddBlock = computed(() => bubbleCount.value < MAX_BUBBLES)
const addBlock = () => { if (canAddBlock.value) blocks.value.push(newBlock()) }
const removeBlock = (i) => {
  blocks.value.splice(i, 1)
  if (!blocks.value.length) blocks.value.push(newBlock())
}
const moveBlock = (i, d) => {
  const j = i + d
  if (j < 0 || j >= blocks.value.length) return
  const a = blocks.value
  ;[a[i], a[j]] = [a[j], a[i]]
}

// 上傳前先縮圖並轉成 JPEG（最寬 1600px）：LINE 預覽圖上限 1MB，縮過才不會被擋
const compressImage = (file) => new Promise((resolve, reject) => {
  const img = new Image()
  img.onload = () => {
    const scale = Math.min(1, 1600 / img.width)
    const w = Math.round(img.width * scale)
    const h = Math.round(img.height * scale)
    const canvas = document.createElement('canvas')
    canvas.width = w; canvas.height = h
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#ffffff' // 透明 PNG 轉 JPEG 時墊白底
    ctx.fillRect(0, 0, w, h)
    ctx.drawImage(img, 0, 0, w, h)
    URL.revokeObjectURL(img.src)
    canvas.toBlob(b => (b ? resolve({ blob: b, w, h }) : reject(new Error('圖片轉檔失敗'))), 'image/jpeg', 0.85)
  }
  img.onerror = () => reject(new Error('讀不到這張圖片'))
  img.src = URL.createObjectURL(file)
})

const uploadImage = async (b, e) => {
  const file = e.target.files?.[0]
  e.target.value = ''
  if (!file) return
  if (!file.type.startsWith('image/')) { errorMsg.value = '請選擇圖片檔'; return }
  b.uploading = true
  errorMsg.value = ''
  try {
    const { blob, w, h } = await compressImage(file)
    if (blob.size > 1024 * 1024) throw new Error('圖片壓縮後還是超過 1MB，請換一張小一點的圖')
    // LINE 卡片大圖高度不能超過寬度的 3 倍
    b.aspect = `${w}:${Math.min(h, w * 3)}`
    const filePath = `push/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.jpg`
    const { error } = await supabase.storage.from('wardrobe').upload(filePath, blob, { contentType: 'image/jpeg' })
    if (error) throw error
    b.image_url = supabase.storage.from('wardrobe').getPublicUrl(filePath).data.publicUrl
  } catch (err) {
    errorMsg.value = `上傳失敗：${err.message}`
  } finally {
    b.uploading = false
  }
}

const useLiffButton = (b) => {
  b.card.button_url = LIFF_URL
  if (!b.card.button_label.trim()) b.card.button_label = '打開劇光燈'
}

const buttonUrlValid = (b) => !b.card.button_url || /^(https:\/\/|line:\/\/|tel:)\S+$/.test(b.card.button_url.trim())
const buttonPaired = (b) => !!b.card.button_label.trim() === !!b.card.button_url.trim()

// 送給 admin-push 的 media（純文字 = null）
const mediaOf = (b) => {
  if (b.kind === 'image') return { kind: 'image', image_url: b.image_url }
  if (b.kind === 'card') {
    return {
      kind: 'card', image_url: b.image_url, aspect: b.aspect,
      card_title: b.card.title.trim(),
      button_label: b.card.button_label.trim(),
      button_url: b.card.button_url.trim(),
    }
  }
  return null
}
// 第 1 個對話框走舊欄位 message／media，其餘放 extra
const buildContent = () => {
  const [first, ...rest] = blocks.value.map((b) => ({ message: b.text, media: mediaOf(b) }))
  return { message: first.message, media: first.media, extra: rest }
}

// 單一對話框是否完整
const blockReady = (b) => {
  if (b.text.length > textMaxOf(b)) return false
  if (b.kind === 'text') return !!b.text.trim()
  if (b.uploading) return false
  if (b.kind === 'image') return !!b.image_url
  return !!b.card.title.trim() && buttonPaired(b) && buttonUrlValid(b) // 圖文卡片：圖片選填
}
// 訊息內容是否完整（不含對象）
const contentReady = computed(() => blocks.value.every(blockReady) && bubbleCount.value <= MAX_BUBBLES)

// --- 狀態 ---
const quota = ref(null) // { limit, used, remaining }
const previewCount = ref(null)
const previewSample = ref([])
const isPreviewing = ref(false)
const isSending = ref(false)
const showConfirm = ref(false)
const result = ref(null)
const errorMsg = ref('')

const invoke = async (body) => {
  const { data, error } = await supabase.functions.invoke('admin-push', { body })
  if (error) {
    let msg = error.message
    try { msg = (await error.context.json()).error || msg } catch { /* ignore */ }
    throw new Error(msg)
  }
  return data
}

const loadQuota = async () => {
  try { quota.value = await invoke({ action: 'quota' }) }
  catch (err) { errorMsg.value = `讀取額度失敗：${err.message}` }
}

const loadOptions = async () => {
  const [{ data: s }, { data: g }, { data: a }] = await Promise.all([
    supabase.from('scripts').select('id, title, is_archived').order('title'),
    supabase.from('games').select('branch_name').not('branch_name', 'is', null)
      .order('play_time', { ascending: false }).limit(1000),
    supabase.from('achievements').select('id, title, condition_type, condition_value, status')
      .eq('condition_type', 'script').order('title'),
  ])
  achievements.value = (a || []).map(x => ({
    id: x.id,
    title: x.title,
    inactive: x.status !== 'active',
    script_ids: x.condition_value?.script_ids || [],
  }))
  scripts.value = s || []
  branchList.value = [...new Set((g || []).map(x => x.branch_name))].sort()
}

onMounted(() => { loadQuota(); loadOptions() })

// ===== 指定會員 =====
let searchTimer = null
watch(searchQuery, (kw) => {
  clearTimeout(searchTimer)
  const q = kw.trim().replace(/[,()%*\\]/g, '')
  if (!q) { searchResults.value = []; return }
  searchTimer = setTimeout(async () => {
    isSearching.value = true
    const { data, error } = await supabase
      .from('users')
      .select('id, display_name, legacy_id, level')
      .or(`display_name.ilike.%${q}%,legacy_id.ilike.%${q}%`)
      .limit(20)
    isSearching.value = false
    searchResults.value = error ? [] : (data || [])
  }, 300)
})

const selectedIds = computed(() => new Set(selected.value.map(u => u.id)))
const addUser = (u) => { if (!selectedIds.value.has(u.id)) selected.value.push(u) }
const removeUser = (id) => { selected.value = selected.value.filter(u => u.id !== id) }

const addPasted = async () => {
  const list = [...new Set(pasteIds.value.split(/[\s,，、]+/).map(s => s.trim()).filter(Boolean))]
  if (list.length === 0) return
  const found = []
  for (let i = 0; i < list.length; i += 200) {
    const { data, error } = await supabase
      .from('users')
      .select('id, display_name, legacy_id, level')
      .in('legacy_id', list.slice(i, i + 200))
    if (error) { pasteMsg.value = `查詢失敗：${error.message}`; return }
    found.push(...(data || []))
  }
  found.forEach(addUser)
  const foundSet = new Set(found.map(u => u.legacy_id))
  const missing = list.filter(x => !foundSet.has(x))
  pasteMsg.value = `已加入 ${found.length} 人` + (missing.length ? `，找不到：${missing.join('、')}` : '')
  pasteIds.value = ''
}

// ===== 條件篩選 =====
const scriptTitle = (id) => scripts.value.find(x => x.id === id)?.title ?? `#${id}`
const scriptOptions = (field) => {
  const kw = scriptSearch.value[field].trim().toLowerCase()
  const chosen = new Set(filter.value[field])
  return scripts.value
    .filter(x => !chosen.has(x.id) && (!kw || (x.title || '').toLowerCase().includes(kw)))
    .slice(0, 8)
}
const addScript = (field, id) => {
  if (!filter.value[field].includes(id)) filter.value[field].push(id)
  scriptSearch.value[field] = ''
}
const removeScript = (field, id) => { filter.value[field] = filter.value[field].filter(x => x !== id) }
const toggleIn = (field, v) => {
  const arr = filter.value[field]
  filter.value[field] = arr.includes(v) ? arr.filter(x => x !== v) : [...arr, v]
}

// 台灣時間 N 天前的 YYYY-MM-DD
const daysAgo = (n) => new Date(Date.now() + 8 * 3600e3 - n * 86400e3).toISOString().slice(0, 10)
const LAST_PLAYED_PRESETS = [
  { label: '30 天內有來', after: 30 },
  { label: '3 個月內有來', after: 90 },
  { label: '半年內有來', after: 180 },
  { label: '一年內有來', after: 365 },
  { label: '超過 3 個月沒來', before: 90 },
  { label: '超過半年沒來', before: 180 },
  { label: '超過 1 年沒來', before: 365 },
]
const applyPreset = (p) => {
  filter.value.last_played_after = p.after ? daysAgo(p.after) : ''
  filter.value.last_played_before = p.before ? daysAgo(p.before) : ''
}
const clearLastPlayed = () => { filter.value.last_played_after = ''; filter.value.last_played_before = '' }
const resetFilter = () => { filter.value = emptyFilter() }
// 選「從未登入」時，最後登入日期沒有意義，清掉避免篩出 0 人
watch(() => filter.value.login_status, (v) => {
  if (v === 'never') { filter.value.last_login_after = ''; filter.value.last_login_before = '' }
})

// 雙11 七本（傘靈、相思骨、將雪、二十四橋、花吃、殯儀館、神奈川）
const DOUBLE11_SCRIPTS = [52, 46, 33, 7, 64, 48, 23]
const useDouble11Scripts = () => { filter.value.played_scripts = [...DOUBLE11_SCRIPTS] }
const selectedAchievement = computed(() => achievements.value.find(a => a.id === filter.value.achievement_id))
const insertMissingTag = () => { blocks.value[0].text += MISSING_TAG }
const useAchievementTemplate = () => {
  const a = selectedAchievement.value
  if (!a) return
  blocks.value[0].text = `🔮 你離【${a.title}】成就只差一步了！

只要再玩 ${MISSING_TAG} 就能解鎖，快揪團來劇光燈完成收集吧！`
}
const useClaimTemplate = () => {
  const a = selectedAchievement.value
  if (!a) return
  blocks.value[0].text = `🏆 恭喜！你已經達成【${a.title}】成就！

打開劇光燈 App 的成就頁，按「領取」就能把它收進你的收藏。`
}
// 確認視窗用：把 {缺少劇本} 換成抽樣第一位的內容
const exampleOf = (text) => {
  const ex = previewSample.value.find(u => u.missing)?.missing
  return ex ? text.replaceAll(MISSING_TAG, ex) : text
}
const hasMissingTag = computed(() => blocks.value.some(b => b.text.includes(MISSING_TAG)))
const tagWithoutAchievement = computed(() =>
  hasMissingTag.value && !(mode.value === 'filter' && filter.value.achievement_id && !filter.value.achievement_mode)
)

// ===== 完整名單：瀏覽、排除 =====
const excludedIds = ref([])           // 手動排除的會員 id（存進草稿、預約時一起帶）
const excludedSet = computed(() => new Set(excludedIds.value))
const showList = ref(false)
const listLoading = ref(false)
const listUsers = ref([])             // [{ id, display_name, legacy_id, level, last_played, missing }]
const listTruncated = ref(false)
const listQuery = ref('')
const listPage = ref(0)
const LIST_PAGE = 100
let excludedAtOpen = ''
const listFiltered = computed(() => {
  const q = listQuery.value.trim().toLowerCase()
  if (!q) return listUsers.value
  return listUsers.value.filter(u => (u.display_name || '').toLowerCase().includes(q) || (u.legacy_id || '').includes(q))
})
const listPageCount = computed(() => Math.max(1, Math.ceil(listFiltered.value.length / LIST_PAGE)))
const listRows = computed(() => listFiltered.value.slice(listPage.value * LIST_PAGE, (listPage.value + 1) * LIST_PAGE))
watch(listQuery, () => { listPage.value = 0 })
const openList = async () => {
  showList.value = true
  excludedAtOpen = JSON.stringify(excludedIds.value)
  listLoading.value = true; listQuery.value = ''; listPage.value = 0
  try {
    const r = await invoke({ action: 'preview_list', target: buildTarget() })
    listUsers.value = r.users || []
    listTruncated.value = !!r.truncated
  } catch (err) {
    errorMsg.value = err.message; showList.value = false
  } finally { listLoading.value = false }
}
const toggleExclude = (id) => {
  excludedIds.value = excludedSet.value.has(id) ? excludedIds.value.filter(x => x !== id) : [...excludedIds.value, id]
}
const excludeShown = () => {
  const add = listFiltered.value.map(u => u.id).filter(id => !excludedSet.value.has(id))
  excludedIds.value = [...excludedIds.value, ...add]
}
const clearExcluded = () => { excludedIds.value = [] }
const closeList = () => {
  showList.value = false
  if (JSON.stringify(excludedIds.value) !== excludedAtOpen) preview() // 排除名單有變就重算人數
}

const isSet = (v) => (Array.isArray(v) ? v.length > 0 : v !== '' && v !== false && v !== null)
const activeFilterCount = computed(() => Object.values(filter.value).filter(isSet).length)

const buildTarget = () => {
  if (mode.value === 'pick') return { mode: 'ids', ids: selected.value.map(u => u.id) }
  const target = { mode: 'filter' }
  for (const [k, v] of Object.entries(filter.value)) if (isSet(v)) target[k] = v
  if (excludedIds.value.length) target.exclude_ids = [...excludedIds.value]
  return target
}

// ===== 預估 / 發送 =====
watch([mode, selected, filter], () => {
  previewCount.value = null
  previewSample.value = []
  result.value = null
}, { deep: true })

const preview = async () => {
  errorMsg.value = ''
  if (mode.value === 'pick' && selected.value.length === 0) {
    errorMsg.value = '請先加入至少一位會員'
    return
  }
  isPreviewing.value = true
  try {
    const res = await invoke({ action: 'preview', target: buildTarget() })
    previewCount.value = res.count
    previewSample.value = res.sample || []
  } catch (err) {
    errorMsg.value = err.message
  } finally {
    isPreviewing.value = false
  }
}

const overQuota = computed(() =>
  quota.value?.remaining != null && previewCount.value != null && previewCount.value > quota.value.remaining
)

const canSend = computed(() =>
  previewCount.value > 0 && contentReady.value && !overQuota.value && !isSending.value && !tagWithoutAchievement.value
)

// ===== 發送方式：立即 / 預約 =====
const sendMode = ref('now') // 'now' | 'schedule'
// datetime-local 的值（台灣時間 YYYY-MM-DDTHH:mm），預設明天 12:00
const twNow = () => new Date(Date.now() + 8 * 3600e3).toISOString()
const defaultSendAt = () => `${new Date(Date.now() + 8 * 3600e3 + 86400e3).toISOString().slice(0, 10)}T12:00`
const sendAt = ref(defaultSendAt())
const minSendAt = computed(() => twNow().slice(0, 16))
const sendAtIso = computed(() => (sendAt.value ? `${sendAt.value}:00+08:00` : ''))
const sendAtValid = computed(() => {
  const t = Date.parse(sendAtIso.value)
  return !isNaN(t) && t > Date.now() + 60e3
})
const sendAtLabel = computed(() => sendAt.value.replace('T', ' '))

const canSubmit = computed(() => canSend.value && (sendMode.value === 'now' || sendAtValid.value))

const resetMessage = () => {
  title.value = ''
  blocks.value = [newBlock()]
  draftId.value = null; draftName.value = ''
}

const send = async () => {
  showConfirm.value = false
  isSending.value = true
  errorMsg.value = ''
  try {
    if (sendMode.value === 'schedule') {
      const r = await invoke({
        action: 'schedule', target: buildTarget(), title: title.value, send_at: sendAtIso.value, ...buildContent(),
      })
      result.value = { scheduled: true, at: sendAtLabel.value, count: r.estimated_count }
      resetMessage()
      await loadScheduled()
    } else {
      result.value = await invoke({
        action: 'send', target: buildTarget(), title: title.value, ...buildContent(),
      })
      if (result.value.fail === 0) resetMessage()
      await loadQuota()
    }
  } catch (err) {
    errorMsg.value = err.message
  } finally {
    isSending.value = false
  }
}

// ===== 預約清單 =====
const scheduled = ref([])
const loadScheduled = async () => {
  try { scheduled.value = (await invoke({ action: 'list_scheduled' })).items }
  catch (err) { console.error('讀取預約失敗', err) }
}
const cancelScheduled = async (item) => {
  if (!window.confirm(`確定取消「${item.title}」的預約？`)) return
  try {
    await invoke({ action: 'cancel', id: item.id })
    await loadScheduled()
  } catch (err) {
    errorMsg.value = err.message
  }
}
const fmtTime = (iso) => iso
  ? new Date(iso).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })
  : '--'
const SCHEDULE_STATUS = {
  pending: { text: '⏳ 等待發送', cls: 'badge-warning' },
  sending: { text: '🔄 發送中', cls: 'badge-primary' },
  sent: { text: '🟢 已發送', cls: 'badge-success' },
  failed: { text: '🔴 失敗', cls: 'badge-danger' },
  cancelled: { text: '已取消', cls: 'badge-secondary' },
}
onMounted(loadScheduled)

// ===== 草稿 =====
// 存整個頁面的狀態：對象、條件、標題、對話框（不含上傳中的狀態）
const drafts = ref([])
const draftId = ref(null)   // 目前載入的草稿；再按「存草稿」會覆蓋這份
const draftName = ref('')
const draftBusy = ref(false)
const notice = ref('')
const loadDrafts = async () => {
  try { drafts.value = (await invoke({ action: 'list_drafts' })).items }
  catch (err) { console.warn('讀取草稿失敗:', err.message) }
}
const snapshot = () => ({
  mode: mode.value, filter: filter.value, selected: selected.value, title: title.value, excluded: excludedIds.value,
  blocks: blocks.value.map(({ key, uploading, ...b }) => b),
})
const saveDraft = async (asNew = false) => {
  draftBusy.value = true; errorMsg.value = ''; notice.value = ''
  try {
    const name = draftName.value.trim() || title.value.trim() || blocks.value[0].text.trim().slice(0, 20) || blocks.value[0].card.title.trim() || '未命名草稿'
    const r = await invoke({ action: 'save_draft', id: asNew ? null : draftId.value, name, state: snapshot() })
    draftId.value = r.id; draftName.value = name
    notice.value = `已存草稿「${name}」`
    await loadDrafts()
  } catch (err) { errorMsg.value = err.message } finally { draftBusy.value = false }
}
const openDraft = (d) => {
  if (!confirm(`載入草稿「${d.name}」？目前頁面上沒存的內容會被取代。`)) return
  const st = d.state || {}
  mode.value = st.mode || 'filter'
  filter.value = { ...emptyFilter(), ...(st.filter || {}) }
  selected.value = st.selected || []
  excludedIds.value = st.excluded || []
  title.value = st.title || ''
  blocks.value = (st.blocks?.length ? st.blocks : [{}]).map(b => ({ ...newBlock(), ...b, card: { ...newBlock().card, ...(b.card || {}) }, key: ++blockSeq, uploading: false }))
  draftId.value = d.id; draftName.value = d.name
  notice.value = `已載入草稿「${d.name}」，記得重新「計算人數」再發送`
  window.scrollTo({ top: 0, behavior: 'smooth' })
}
const deleteDraft = async (d) => {
  if (!confirm(`刪除草稿「${d.name}」？`)) return
  try {
    await invoke({ action: 'delete_draft', id: d.id })
    if (draftId.value === d.id) { draftId.value = null; draftName.value = '' }
    await loadDrafts()
  } catch (err) { errorMsg.value = err.message }
}
const newDraft = () => {
  if (!confirm('清空目前的訊息，開始新的推播？')) return
  resetMessage(); draftId.value = null; draftName.value = ''
}
onMounted(loadDrafts)

// ===== 已存受眾 =====
// 存「對象」：模式、篩選條件、指定名單、排除名單。
// 最後遊玩／最後登入的日期是「相對」的（例如近 60 天）：載入時依存檔後過了幾天往後平移；入會日期不動。
const audiences = ref([])
const audienceId = ref('')
const audienceBusy = ref(false)
const loadAudiences = async () => {
  try { audiences.value = (await invoke({ action: 'list_audiences' })).items }
  catch (err) { console.warn('讀取受眾失敗:', err.message) }
}
const twToday = () => new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10)
const SHIFT_FIELDS = ['last_played_after', 'last_played_before', 'last_login_after', 'last_login_before']
const shiftDate = (d, days) => new Date(Date.parse(`${d}T00:00:00Z`) + days * 86400e3).toISOString().slice(0, 10)
const saveAudience = async (asNew = false) => {
  const cur = audiences.value.find(a => a.id === audienceId.value)
  const name = (asNew || !cur)
    ? prompt('受眾名稱：', cur && asNew ? `${cur.name}（複製）` : '')
    : cur.name
  if (name === null) return
  if (!asNew && cur && !confirm(`用目前畫面上的對象條件覆蓋受眾「${cur.name}」？`)) return
  audienceBusy.value = true; errorMsg.value = ''; notice.value = ''
  try {
    const state = { mode: mode.value, filter: filter.value, selected: selected.value, excluded: excludedIds.value, saved_on: twToday() }
    const r = await invoke({ action: 'save_audience', id: asNew ? null : (audienceId.value || null), name, state })
    await loadAudiences()
    audienceId.value = r.id
    notice.value = `已存受眾「${name.trim() || '未命名受眾'}」`
  } catch (err) { errorMsg.value = err.message } finally { audienceBusy.value = false }
}
const applyAudience = () => {
  const a = audiences.value.find(x => x.id === audienceId.value)
  if (!a) return
  const st = a.state || {}
  const f = { ...emptyFilter(), ...(st.filter || {}) }
  const days = st.saved_on ? Math.round((Date.parse(twToday()) - Date.parse(st.saved_on)) / 86400e3) : 0
  let shifted = false
  if (days > 0) for (const k of SHIFT_FIELDS) if (f[k]) { f[k] = shiftDate(f[k], days); shifted = true }
  mode.value = st.mode || 'filter'
  filter.value = f
  selected.value = st.selected || []
  excludedIds.value = st.excluded || []
  notice.value = `已套用受眾「${a.name}」` + (shifted ? `；最後遊玩／登入日期已往後平移 ${days} 天` : '') + '，請按「計算人數」'
}
const deleteAudience = async () => {
  const a = audiences.value.find(x => x.id === audienceId.value)
  if (!a || !confirm(`刪除受眾「${a.name}」？`)) return
  try {
    await invoke({ action: 'delete_audience', id: a.id })
    audienceId.value = ''
    await loadAudiences()
  } catch (err) { errorMsg.value = err.message }
}
onMounted(loadAudiences)

// ===== 測試發送：只發給自己 =====
const isTesting = ref(false)
// 測試收件人：會員編號（後台 Email 帳號沒有 LINE，要指定一個會員帳號收），記在這台瀏覽器
const testLegacyId = ref(localStorage.getItem('pushTestLegacyId') || '')
watch(testLegacyId, (v) => localStorage.setItem('pushTestLegacyId', v.trim()))
const testSend = async () => {
  isTesting.value = true; errorMsg.value = ''; notice.value = ''
  try {
    const r = await invoke({ action: 'test_send', test_legacy_id: testLegacyId.value.trim(), ...buildContent() })
    notice.value = `測試訊息已發給 ${r.to_name}（${r.count} 個對話框，用掉 1 則額度）`
    await loadQuota()
  } catch (err) { errorMsg.value = err.message } finally { isTesting.value = false }
}
</script>

<template>
  <div class="push-msg">
    <div class="manager-header">
      <div>
        <h3 style="color: #eee; margin: 0;">✉️ 自訂推播</h3>
        <p class="hint">發 LINE 訊息給篩選出來的會員或指定會員。每發給 1 人用掉 1 則額度，已封鎖的會員會自動略過。</p>
      </div>
      <div class="quota" v-if="quota">
        <div class="quota-label">本月額度</div>
        <div class="quota-value">
          <template v-if="quota.limit === null">無上限（已用 {{ quota.used }}）</template>
          <template v-else>剩 <b>{{ quota.remaining }}</b> / {{ quota.limit }}</template>
        </div>
      </div>
    </div>

    <!-- 草稿 -->
    <section class="card">
      <div class="filter-head">
        <h4 style="margin: 0;">📝 草稿</h4>
        <button class="link" @click="newDraft">開新推播</button>
      </div>
      <div class="row" style="margin: 8px 0 0;">
        <input v-model="draftName" class="input" style="flex: 1; min-width: 180px;" placeholder="草稿名稱（不填就用標題或第一段文字）" maxlength="60" />
        <button class="btn btn-dark" :disabled="draftBusy" @click="saveDraft(false)">{{ draftId ? '儲存（覆蓋）' : '存草稿' }}</button>
        <button v-if="draftId" class="btn btn-dark" :disabled="draftBusy" @click="saveDraft(true)">另存新草稿</button>
      </div>
      <div v-if="draftId" class="hint">正在編輯草稿「{{ draftName }}」</div>
      <ul v-if="drafts.length" class="draft-list">
        <li v-for="d in drafts" :key="d.id" :class="{ current: d.id === draftId }">
          <span class="draft-name" @click="openDraft(d)">{{ d.name }}</span>
          <span class="muted small">{{ fmtTime(d.updated_at) }}<template v-if="d.created_by_name"> · {{ d.created_by_name }}</template></span>
          <button class="link" @click="openDraft(d)">載入</button>
          <button class="link danger" @click="deleteDraft(d)">刪除</button>
        </li>
      </ul>
      <div v-else class="hint">還沒有草稿。</div>
    </section>

    <!-- 1. 對象 -->
    <section class="card">
      <h4>1. 選擇對象</h4>
      <div class="audience-bar">
        <select v-model="audienceId" class="input" style="flex: 1; min-width: 180px;">
          <option value="">— 已存受眾 —</option>
          <option v-for="a in audiences" :key="a.id" :value="a.id">{{ a.name }}</option>
        </select>
        <button class="btn btn-dark" :disabled="!audienceId" @click="applyAudience">套用</button>
        <button class="btn btn-dark" :disabled="audienceBusy" @click="saveAudience(false)">{{ audienceId ? '更新這個受眾' : '存成受眾' }}</button>
        <button v-if="audienceId" class="btn btn-dark" :disabled="audienceBusy" @click="saveAudience(true)">另存</button>
        <button v-if="audienceId" class="link danger" @click="deleteAudience">刪除</button>
      </div>
      <div class="tabs">
        <button :class="{ active: mode === 'filter' }" @click="mode = 'filter'">條件篩選</button>
        <button :class="{ active: mode === 'pick' }" @click="mode = 'pick'">指定會員</button>
      </div>

      <!-- 條件篩選 -->
      <div v-if="mode === 'filter'" class="filters">
        <div class="filter-head">
          <span class="hint">所有條件同時成立才會被選中，沒填的條件不限制。</span>
          <button class="link" @click="resetFilter">清除全部條件</button>
        </div>

        <fieldset>
          <legend>會員資料</legend>
          <div class="row">
            <label>等級
              <span class="range">
                <input v-model="filter.level_min" type="number" min="1" class="input small" placeholder="最低" />～
                <input v-model="filter.level_max" type="number" min="1" class="input small" placeholder="最高" />
              </span>
            </label>
            <label>點數至少
              <input v-model="filter.points_min" type="number" min="0" class="input small" placeholder="不限" />
            </label>
            <label>生日月份
              <select v-model="filter.birthday_month" class="input small">
                <option value="">不限</option>
                <option v-for="m in 12" :key="m" :value="m">{{ m }} 月</option>
              </select>
            </label>
          </div>
          <div class="row">
            <label>加入會員日期
              <span class="range">
                <input v-model="filter.joined_after" type="date" class="input date" />～
                <input v-model="filter.joined_before" type="date" class="input date" />
              </span>
            </label>
            <label class="check">
              <input v-model="filter.has_coupon" type="checkbox" /> 有未使用的票券
            </label>
          </div>
          <div class="row">
            <label>App 登入
              <select v-model="filter.login_status" class="input" style="width: 140px;">
                <option value="">不限</option>
                <option value="logged_in">登入過</option>
                <option value="never">從未登入</option>
              </select>
            </label>
            <label v-if="filter.login_status !== 'never'">最後登入日期
              <span class="range">
                <input v-model="filter.last_login_after" type="date" class="input date" />～
                <input v-model="filter.last_login_before" type="date" class="input date" />
              </span>
            </label>
          </div>
        </fieldset>

        <fieldset>
          <legend>遊玩紀錄</legend>
          <div class="row">
            <label>最後遊玩日期
              <span class="range">
                <input v-model="filter.last_played_after" type="date" class="input date" />～
                <input v-model="filter.last_played_before" type="date" class="input date" />
              </span>
            </label>
          </div>
          <div class="presets">
            <button v-for="p in LAST_PLAYED_PRESETS" :key="p.label" @click="applyPreset(p)">{{ p.label }}</button>
            <button class="link" @click="clearLastPlayed">清除</button>
          </div>
          <p class="hint" style="margin-top: -6px;">設定最後遊玩日期時，從沒玩過的會員不會被選中。</p>
          <div class="row">
            <label>遊玩次數
              <span class="range">
                <input v-model="filter.play_count_min" type="number" min="0" class="input small" placeholder="最少" />～
                <input v-model="filter.play_count_max" type="number" min="0" class="input small" placeholder="最多" />
              </span>
            </label>
          </div>
          <div v-if="branchList.length" class="group">
            <div class="group-label">去過的分店（任一）</div>
            <label v-for="b in branchList" :key="b" class="check">
              <input type="checkbox" :checked="filter.branches.includes(b)" @change="toggleIn('branches', b)" /> {{ b }}
            </label>
          </div>
          <div class="group">
            <div class="group-label">玩過的類型（任一）</div>
            <label v-for="c in CATEGORIES" :key="c" class="check">
              <input type="checkbox" :checked="filter.categories.includes(c)" @change="toggleIn('categories', c)" /> {{ c }}
            </label>
          </div>
        </fieldset>

        <fieldset>
          <legend>成就</legend>
          <div class="row">
            <label>成就
              <select v-model="filter.achievement_id" class="input" style="min-width: 220px;">
                <option value="">不限</option>
                <option v-for="a in achievements" :key="a.id" :value="a.id">
                  {{ a.title }}（{{ a.script_ids.length }} 部）{{ a.inactive ? '・未啟用' : '' }}
                </option>
              </select>
            </label>
            <label v-if="filter.achievement_id">狀態
              <select v-model="filter.achievement_mode" class="input">
                <option value="">差一點（還沒達成）</option>
                <option value="unclaimed">已達成、還沒領取</option>
                <option value="done">已達成（不論領沒領）</option>
                <option value="claimed">已領取</option>
              </select>
            </label>
            <label v-if="filter.achievement_id && !filter.achievement_mode">還差
              <select v-model="filter.achievement_missing_max" class="input small">
                <option value="">1 部</option>
                <option v-for="n in [2, 3, 4, 5]" :key="n" :value="n">1～{{ n }} 部</option>
              </select>
            </label>
          </div>
          <div v-if="selectedAchievement" class="hint">
            條件劇本：{{ selectedAchievement.script_ids.map(scriptTitle).join('、') }}<br />
            <template v-if="!filter.achievement_mode">已解鎖的人會自動排除。訊息裡可以放 <code>{{ MISSING_TAG }}</code>，每個人會看到自己還缺的劇本。</template>
            <template v-else-if="filter.achievement_mode === 'unclaimed'">玩過全部條件劇本、但還沒到成就頁按「領取」的人。</template>
            <template v-else-if="filter.achievement_mode === 'done'">玩過全部條件劇本，或已經領取的人。</template>
            <template v-else>已經在成就頁按過「領取」的人。</template>
          </div>
        </fieldset>

        <fieldset>
          <legend>劇本</legend>
          <div class="script-pickers">
            <div v-for="p in SCRIPT_PICKERS" :key="p.field">
              <div class="group-label">{{ p.label }}</div>
              <input v-model="scriptSearch[p.field]" class="input" placeholder="搜尋劇本名稱" />
              <ul v-if="scriptSearch[p.field]" class="results small">
                <li v-for="x in scriptOptions(p.field)" :key="x.id" @click="addScript(p.field, x.id)">
                  {{ x.title }} <span v-if="x.is_archived" class="muted">（已下架）</span>
                </li>
              </ul>
              <div class="chips">
                <span class="chip" v-for="id in filter[p.field]" :key="id">
                  {{ scriptTitle(id) }} <button @click="removeScript(p.field, id)" aria-label="移除">×</button>
                </span>
              </div>
              <button v-if="p.field === 'played_scripts'" class="link" @click="useDouble11Scripts">選雙11 七本</button>
              <label v-if="p.field === 'played_scripts' && filter.played_scripts.length > 1" class="min-row">
                玩過其中
                <input v-model="filter.played_scripts_min" type="number" min="0" :max="filter.played_scripts.length" class="input tiny" :placeholder="filter.played_scripts_max !== '' ? '0' : '1'" />
                ～
                <input v-model="filter.played_scripts_max" type="number" min="0" :max="filter.played_scripts.length" class="input tiny" placeholder="不限" />
                部
              </label>
            </div>
          </div>
          <p class="hint">例：新劇本上線，推給「玩過前作」但「還沒玩過新作」的人。</p>
        </fieldset>

        <fieldset>
          <legend>排除</legend>
          <div class="row">
            <label class="check">
              <input v-model="filter.exclude_presale_buyers" type="checkbox" /> 已買雙11預售票（待匯款／待查帳／已發券）
            </label>
            <label>最近收過推播
              <select v-model="filter.exclude_pushed_days" class="input" style="width: 150px;">
                <option value="">不排除</option>
                <option :value="1">今天收過</option>
                <option :value="2">近 2 天收過</option>
                <option :value="3">近 3 天收過</option>
                <option :value="7">近 7 天收過</option>
              </select>
            </label>
          </div>
          <p class="hint">連續兩天推同一個人容易被封鎖，建議至少排除「今天收過」。</p>
        </fieldset>

        <p v-if="activeFilterCount === 0" class="hint warn">目前沒有任何條件，會發給全部會員。</p>
      </div>

      <!-- 指定會員 -->
      <div v-else>
        <input v-model="searchQuery" class="input" placeholder="搜尋暱稱或會員編號" />
        <div v-if="isSearching" class="hint">搜尋中…</div>
        <ul v-else-if="searchResults.length" class="results">
          <li v-for="u in searchResults" :key="u.id" @click="addUser(u)" :class="{ added: selectedIds.has(u.id) }">
            <span>{{ u.display_name || '(無暱稱)' }}</span>
            <span class="muted">#{{ u.legacy_id }} · LV{{ u.level }}</span>
            <span class="add">{{ selectedIds.has(u.id) ? '已加入' : '＋ 加入' }}</span>
          </li>
        </ul>

        <details class="paste">
          <summary>一次貼上多個會員編號</summary>
          <textarea v-model="pasteIds" class="input" rows="3" placeholder="用空白、逗號或換行分隔，例如：00000012, 00000345"></textarea>
          <button class="btn btn-dark" @click="addPasted">加入</button>
          <span class="hint">{{ pasteMsg }}</span>
        </details>

        <div class="chips" v-if="selected.length">
          <span class="chip" v-for="u in selected" :key="u.id">
            {{ u.display_name || u.legacy_id }}
            <button @click="removeUser(u.id)" aria-label="移除">×</button>
          </span>
          <button class="link" @click="selected = []">全部清除</button>
        </div>
        <div v-else class="hint">還沒有加入任何會員</div>
      </div>

      <div class="preview-row">
        <button class="btn btn-dark" @click="preview" :disabled="isPreviewing">
          {{ isPreviewing ? '計算中…' : '計算人數' }}
        </button>
        <span v-if="previewCount !== null" class="count">
          預計發送 <b>{{ previewCount }}</b> 人
          <span v-if="overQuota" class="danger">（超過本月剩餘額度）</span>
        </span>
      </div>
      <div v-if="mode === 'filter' && (previewCount !== null || excludedIds.length)" class="list-tools">
        <button class="btn btn-dark" @click="openList">📋 瀏覽完整名單</button>
        <template v-if="excludedIds.length">
          <span class="muted">已手動排除 <b>{{ excludedIds.length }}</b> 人</span>
          <button class="link danger" @click="clearExcluded(); preview()">清除排除</button>
        </template>
      </div>
      <div v-if="previewSample.length" class="sample">
        <div class="group-label">名單抽樣（前 {{ previewSample.length }} 位）</div>
        <span v-for="u in previewSample" :key="u.legacy_id" class="sample-item">
          {{ u.display_name || '(無暱稱)' }}
          <span class="muted">#{{ u.legacy_id }} · LV{{ u.level }}<template v-if="u.last_played"> · 最後 {{ u.last_played }}</template><template v-if="u.missing"> · 缺 {{ u.missing }}</template></span>
        </span>
      </div>
    </section>

    <!-- 2. 訊息 -->
    <section class="card">
      <h4>2. 訊息內容</h4>
      <p class="hint" style="margin-top: -6px;">
        一次最多 {{ MAX_BUBBLES }} 個對話框（「圖片＋文字」算 2 個），目前 <b :class="{ danger: bubbleCount > MAX_BUBBLES }">{{ bubbleCount }}</b> 個。
        不管幾個，每人都只算 1 則額度。
      </p>

      <input v-model="title" class="input" placeholder="紀錄標題（選填，只顯示在推播監控）" maxlength="40" />

      <div v-if="mode === 'filter' && filter.achievement_id" class="tag-bar">
        <template v-if="!filter.achievement_mode">
        <button class="btn-chip" @click="insertMissingTag">插入 {{ MISSING_TAG }}（第 1 個對話框）</button>
        <button class="btn-chip" @click="useAchievementTemplate">套用成就範本</button>
        </template>
        <button v-else-if="filter.achievement_mode === 'unclaimed'" class="btn-chip" @click="useClaimTemplate">套用「提醒領取」範本</button>
      </div>

      <div v-for="(b, i) in blocks" :key="b.key" class="block">
        <div class="block-head">
          <span class="block-no">對話框 {{ i + 1 }}</span>
          <div class="tabs small">
            <button v-for="k in MSG_KINDS" :key="k.key" :class="{ active: b.kind === k.key }" @click="b.kind = k.key">{{ k.label }}</button>
          </div>
          <div class="block-tools" v-if="blocks.length > 1">
            <button class="link" :disabled="i === 0" @click="moveBlock(i, -1)" title="往上">↑</button>
            <button class="link" :disabled="i === blocks.length - 1" @click="moveBlock(i, 1)" title="往下">↓</button>
            <button class="link danger" @click="removeBlock(i)">刪除</button>
          </div>
        </div>

        <!-- 圖片 -->
        <div v-if="b.kind !== 'text'" class="media-box">
          <label class="btn btn-dark upload-btn" :class="{ disabled: b.uploading }">
            {{ b.uploading ? '上傳中…' : (b.image_url ? '換一張圖片' : '上傳圖片') }}
            <input type="file" accept="image/*" hidden :disabled="b.uploading" @change="uploadImage(b, $event)" />
          </label>
          <span class="hint"><template v-if="b.kind === 'card'">圖片選填，不放就是「標題＋內文＋按鈕」。</template>JPG／PNG 都可以，會自動縮到 1600px 寬。</span>
          <button v-if="b.image_url" class="link" @click="b.image_url = ''">移除</button>
        </div>

        <!-- 卡片欄位 -->
        <template v-if="b.kind === 'card'">
          <input v-model="b.card.title" class="input" placeholder="卡片標題（必填）" maxlength="60" />
          <div class="row" style="margin: 0;">
            <label style="flex: 1; min-width: 140px;">按鈕文字
              <input v-model="b.card.button_label" class="input" placeholder="例：立即預約" maxlength="20" />
            </label>
            <label style="flex: 2; min-width: 220px;">按鈕連結
              <input v-model="b.card.button_url" class="input" placeholder="https://…" />
            </label>
          </div>
          <div class="presets" style="margin-top: 6px;">
            <button @click="useLiffButton(b)">連到劇光燈 App</button>
          </div>
          <div v-if="!buttonPaired(b)" class="hint danger">按鈕文字和連結要一起填，或都不填（不要按鈕）。</div>
          <div v-else-if="!buttonUrlValid(b)" class="hint danger">連結要以 https:// 開頭。</div>
        </template>

        <textarea v-model="b.text" class="input" rows="5"
          :placeholder="b.kind === 'text' ? '輸入要發送的訊息' : b.kind === 'image' ? '圖片下方的文字（選填）' : '卡片內文（選填）'"></textarea>
        <div class="hint" :class="{ danger: b.text.length > textMaxOf(b) }">
          {{ b.text.length }} / {{ textMaxOf(b) }}
          <span v-if="b.kind === 'text' && !b.text.trim()" class="danger">・這個對話框是空的，請填內容或刪除</span>
        </div>
      </div>

      <button class="btn btn-dark add-block" :disabled="!canAddBlock" @click="addBlock">
        ＋ 新增對話框<span v-if="!canAddBlock" class="muted">（已達 {{ MAX_BUBBLES }} 個上限）</span>
      </button>
      <div v-if="tagWithoutAchievement" class="hint danger">訊息裡有 {{ MISSING_TAG }}，但沒有設定「成就差一點」條件。</div>

      <!-- 預覽 -->
      <div class="lp-preview">
        <div class="group-label">LINE 預覽（示意）</div>
        <template v-for="b in blocks" :key="b.key">
          <div v-if="b.kind === 'text'" class="lp-bubble">{{ b.text || '（空白）' }}</div>
          <template v-else-if="b.kind === 'image'">
            <img v-if="b.image_url" :src="b.image_url" class="lp-img" alt="" />
            <div v-else class="lp-bubble muted">（圖片）</div>
            <div v-if="b.text.trim()" class="lp-bubble">{{ b.text }}</div>
          </template>
          <div v-else class="lp-card">
            <img v-if="b.image_url" :src="b.image_url" class="lp-card-hero" :style="{ aspectRatio: b.aspect.replace(':', '/') }" alt="" />
            <div class="lp-card-body">
              <div class="lp-card-title">{{ b.card.title || '（卡片標題）' }}</div>
              <div v-if="b.text.trim()" class="lp-card-text">{{ b.text }}</div>
            </div>
            <div v-if="b.card.button_label" class="lp-card-btn">{{ b.card.button_label }}</div>
          </div>
        </template>
      </div>
    </section>

    <!-- 3. 發送方式 -->
    <section class="card">
      <h4>3. 發送時間</h4>
      <div class="tabs">
        <button :class="{ active: sendMode === 'now' }" @click="sendMode = 'now'">立即發送</button>
        <button :class="{ active: sendMode === 'schedule' }" @click="sendMode = 'schedule'">預約發送</button>
      </div>
      <div v-if="sendMode === 'schedule'" class="row">
        <label>發送時間（台灣時間）
          <input v-model="sendAt" type="datetime-local" :min="minSendAt" class="input" style="width: 230px; color-scheme: dark;" />
        </label>
      </div>
      <p v-if="sendMode === 'schedule'" class="hint">
        系統每小時整點檢查一次，會在你選的時間之後的第一個整點送出（例：選 14:30，15:00 左右送出；選 15:00，15:00 送出）。名單會在發送當下依條件重新計算，人數可能跟現在略有不同。
        <span v-if="sendAt && !sendAtValid" class="danger">請選擇 1 分鐘後的時間。</span>
      </p>
    </section>

    <div v-if="errorMsg" class="alert danger">{{ errorMsg }}</div>
    <div v-if="result?.scheduled" class="alert success">
      已預約：{{ result.at }} 發送，目前預估 {{ result.count }} 人。可以在下方「預約清單」取消。
    </div>
    <div v-else-if="result" class="alert" :class="result.fail ? 'danger' : 'success'">
      發送完成：成功 {{ result.success }} 人<span v-if="result.fail">，失敗 {{ result.fail }} 人</span>
      <div v-for="e in result.errors" :key="e" class="muted">{{ e }}</div>
    </div>

    <div v-if="notice" class="alert success">{{ notice }}</div>
    <div class="test-row">
      <label>測試收件人（會員編號）
        <input v-model="testLegacyId" class="input" style="width: 140px;" placeholder="例：00000002" inputmode="numeric" maxlength="12" />
      </label>
      <button class="btn btn-dark test-btn" :disabled="!contentReady || isTesting" @click="testSend">
        {{ isTesting ? '發送中…' : '📱 先發給這位看看' }}
      </button>
    </div>
    <button class="btn btn-gold send" :disabled="!canSubmit" @click="showConfirm = true">
      <template v-if="isSending">{{ sendMode === 'schedule' ? '預約中…' : '發送中…' }}</template>
      <template v-else-if="previewCount === null">請先計算人數</template>
      <template v-else-if="sendMode === 'schedule'">預約 {{ sendAtLabel }} 發送給 {{ previewCount }} 人</template>
      <template v-else>發送給 {{ previewCount }} 人</template>
    </button>

    <!-- 預約清單 -->
    <section class="card" style="margin-top: 24px;">
      <div class="filter-head">
        <h4 style="margin: 0;">📅 預約清單</h4>
        <button class="link" @click="loadScheduled">重新整理</button>
      </div>
      <div v-if="!scheduled.length" class="hint">目前沒有預約（只顯示近 30 天）。</div>
      <table v-else class="sched-table">
        <thead>
          <tr><th>發送時間</th><th>標題</th><th>人數</th><th>狀態</th><th></th></tr>
        </thead>
        <tbody>
          <tr v-for="s in scheduled" :key="s.id">
            <td>{{ fmtTime(s.send_at) }}</td>
            <td>
              <div><span v-if="s.media" class="muted">{{ s.media.kind === 'card' ? '🃏 ' : '🖼️ ' }}</span>{{ s.title }}<span v-if="s.extra?.length" class="muted">（{{ s.extra.length + 1 }} 個對話框）</span></div>
              <div class="muted msg-snippet" :title="s.message">{{ s.message }}</div>
              <div v-if="s.error_msg" class="danger" style="font-size: 0.8rem;">{{ s.error_msg }}</div>
            </td>
            <td>
              <template v-if="s.result">{{ s.result.success }}<span class="muted"> / {{ s.result.count }}</span></template>
              <template v-else><span class="muted">約</span> {{ s.estimated_count }}</template>
            </td>
            <td><span class="status-badge" :class="SCHEDULE_STATUS[s.status]?.cls">{{ SCHEDULE_STATUS[s.status]?.text ?? s.status }}</span></td>
            <td><button v-if="s.status === 'pending'" class="link danger" @click="cancelScheduled(s)">取消</button></td>
          </tr>
        </tbody>
      </table>
    </section>

    <!-- 完整名單 -->
    <div v-if="showList" class="modal-mask" @click.self="closeList">
      <div class="modal list-modal">
        <div class="filter-head">
          <h4 style="margin: 0;">📋 完整名單</h4>
          <button class="link" @click="closeList">關閉</button>
        </div>
        <div v-if="listLoading" class="hint">讀取中…</div>
        <template v-else>
          <p class="hint">
            符合條件 <b>{{ listUsers.length }}</b> 人，已排除 <b>{{ excludedIds.length }}</b> 人，
            實際發送 <b>{{ listUsers.filter(u => !excludedSet.has(u.id)).length }}</b> 人。
            <span v-if="listTruncated" class="danger">名單超過 5000 人，只列出前 5000 位。</span>
          </p>
          <div class="row" style="margin: 0 0 8px;">
            <input v-model="listQuery" class="input" style="flex: 1; min-width: 160px;" placeholder="搜尋暱稱或會員編號" />
            <button class="btn btn-dark" :disabled="!listFiltered.length" @click="excludeShown">排除{{ listQuery ? '搜尋結果' : '全部' }}（{{ listFiltered.length }}）</button>
            <button class="btn btn-dark" :disabled="!excludedIds.length" @click="clearExcluded">清除全部排除</button>
          </div>
          <ul class="results list-rows">
            <li v-for="u in listRows" :key="u.id" :class="{ excluded: excludedSet.has(u.id) }">
              <span>{{ u.display_name || '(無暱稱)' }}</span>
              <span class="muted">#{{ u.legacy_id }} · LV{{ u.level }}<template v-if="u.last_played"> · 最後 {{ u.last_played }}</template><template v-if="u.missing"> · 缺 {{ u.missing }}</template></span>
              <button class="link" :class="{ danger: !excludedSet.has(u.id) }" style="margin-left: auto;" @click="toggleExclude(u.id)">
                {{ excludedSet.has(u.id) ? '恢復' : '排除' }}
              </button>
            </li>
            <li v-if="!listRows.length" class="muted">沒有符合的會員</li>
          </ul>
          <div v-if="listPageCount > 1" class="pager">
            <button class="link" :disabled="listPage === 0" @click="listPage--">上一頁</button>
            <span class="muted">{{ listPage + 1 }} / {{ listPageCount }}</span>
            <button class="link" :disabled="listPage >= listPageCount - 1" @click="listPage++">下一頁</button>
          </div>
          <div class="modal-actions">
            <button class="btn btn-gold" @click="closeList">完成</button>
          </div>
        </template>
      </div>
    </div>

    <!-- 確認視窗 -->
    <div v-if="showConfirm" class="modal-mask" @click.self="showConfirm = false">
      <div class="modal">
        <h4>{{ sendMode === 'schedule' ? '確認預約' : '確認發送' }}</h4>
        <p v-if="sendMode === 'schedule'">將在 <b>{{ sendAtLabel }}</b> 發給約 <b>{{ previewCount }}</b> 人（會用掉同樣數量的額度）。</p>
        <p v-else>將發給 <b>{{ previewCount }}</b> 人，會用掉 {{ previewCount }} 則額度<span v-if="quota?.remaining != null">（發送後剩 {{ quota.remaining - previewCount }} 則）</span>。</p>
        <p class="hint">共 {{ blocks.length }} 個對話框（LINE 訊息 {{ bubbleCount }} 個）<template v-if="hasMissingTag">，以下是第一位收到的範例</template>：</p>
        <div class="confirm-blocks">
          <div v-for="(b, i) in blocks" :key="b.key" class="confirm-block">
            <div class="muted">#{{ i + 1 }} {{ MSG_KINDS.find(k => k.key === b.kind).label }}<template v-if="b.kind === 'card'">「{{ b.card.title }}」<template v-if="b.card.button_label">，按鈕「{{ b.card.button_label }}」→ {{ b.card.button_url }}</template></template></div>
            <img v-if="b.kind !== 'text' && b.image_url" :src="b.image_url" class="confirm-img" alt="" />
            <pre v-if="b.text.trim()" class="msg-preview">{{ exampleOf(b.text) }}</pre>
          </div>
        </div>
        <p class="hint warn">LINE 訊息送出後無法收回。</p>
        <div class="modal-actions">
          <button class="btn btn-dark" @click="showConfirm = false">取消</button>
          <button class="btn btn-gold" @click="send">{{ sendMode === 'schedule' ? '確定預約' : '確定發送' }}</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.push-msg { padding: 5px; max-width: 860px; }
.sched-table { width: 100%; border-collapse: collapse; font-size: 0.9rem; }
.sched-table th { text-align: left; color: #D4AF37; padding: 8px; border-bottom: 1px solid #333; white-space: nowrap; font-weight: normal; }
.sched-table td { padding: 10px 8px; border-bottom: 1px solid #1d1d1d; color: #ddd; vertical-align: top; }
.msg-snippet { max-width: 360px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.status-badge { padding: 4px 10px; border-radius: 20px; font-size: 0.78rem; font-weight: bold; white-space: nowrap; }
.badge-warning { background: rgba(241, 196, 15, 0.1); color: #f1c40f; border: 1px solid rgba(241, 196, 15, 0.3); }
.badge-primary { background: rgba(52, 152, 219, 0.1); color: #3498db; border: 1px solid rgba(52, 152, 219, 0.3); }
.badge-success { background: rgba(46, 204, 113, 0.1); color: #2ecc71; border: 1px solid rgba(46, 204, 113, 0.3); }
.badge-danger { background: rgba(231, 76, 60, 0.1); color: #e74c3c; border: 1px solid rgba(231, 76, 60, 0.3); }
.badge-secondary { background: #333; color: #aaa; border: 1px solid #444; }
.manager-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 20px; margin-bottom: 20px; border-bottom: 1px solid #222; padding-bottom: 15px; }
.hint { color: #888; font-size: 0.85rem; margin-top: 6px; }
.hint.warn { color: #f1c40f; }
.muted { color: #777; font-size: 0.85rem; }
.danger { color: #e74c3c; }

.quota { background: #111; border: 1px solid #333; border-radius: 10px; padding: 10px 16px; text-align: right; white-space: nowrap; }
.quota-label { color: #888; font-size: 0.8rem; }
.quota-value { color: #eee; }
.quota-value b { color: #D4AF37; font-size: 1.2rem; }

.card { background: #111; border: 1px solid #222; border-radius: 12px; padding: 18px; margin-bottom: 16px; }
.card h4 { color: #D4AF37; margin: 0 0 12px; }

.tabs { display: flex; gap: 8px; margin-bottom: 14px; }
.tabs button { background: #1a1a1a; color: #aaa; border: 1px solid #333; border-radius: 8px; padding: 8px 16px; cursor: pointer; }
.tabs button.active { background: #D4AF37; color: #000; border-color: #D4AF37; font-weight: bold; }
.tabs.small button { padding: 4px 10px; font-size: 0.8rem; }

.input { width: 100%; box-sizing: border-box; background: #0b0b0b; color: #eee; border: 1px solid #333; border-radius: 8px; padding: 9px 12px; font-size: 0.95rem; margin-top: 6px; font-family: inherit; }
.input:focus { outline: none; border-color: #D4AF37; }
.input.small { width: 100px; }
.input.date { width: 155px; color-scheme: dark; }
.input.tiny { width: 64px; margin: 0 4px; padding: 5px 8px; }
.min-row { color: #ccc; font-size: 0.85rem; display: flex; align-items: center; margin-top: 8px; }
.tag-bar { display: flex; gap: 8px; margin-top: 8px; }
.btn-chip { background: #1a1a1a; color: #D4AF37; border: 1px solid #5a4a14; border-radius: 14px; padding: 4px 12px; font-size: 0.8rem; cursor: pointer; }
.btn-chip:hover { background: #241f0d; }
code { background: #222; padding: 1px 5px; border-radius: 4px; color: #D4AF37; }

/* 篩選 */
.filters fieldset { border: 1px solid #222; border-radius: 10px; padding: 12px 14px 14px; margin: 0 0 12px; }
.filters legend { color: #D4AF37; font-size: 0.9rem; padding: 0 6px; }
.filter-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
.filter-head .hint { margin: 0; }
.row { display: flex; flex-wrap: wrap; gap: 18px; align-items: flex-end; margin-bottom: 10px; }
.row > label:not(.check) { color: #ccc; font-size: 0.9rem; display: flex; flex-direction: column; }
.range { display: flex; align-items: center; gap: 6px; color: #666; }
.check { color: #ccc; font-size: 0.9rem; display: inline-flex; align-items: center; gap: 6px; margin-right: 14px; cursor: pointer; padding-bottom: 8px; }
.group { margin-bottom: 8px; }
.group-label { color: #999; font-size: 0.85rem; margin-bottom: 6px; }
.presets { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; margin-bottom: 10px; }
.presets button:not(.link) { background: #1a1a1a; color: #ccc; border: 1px solid #333; border-radius: 14px; padding: 4px 12px; font-size: 0.8rem; cursor: pointer; }
.presets button:not(.link):hover { border-color: #D4AF37; color: #D4AF37; }
.script-pickers { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
@media (max-width: 640px) { .script-pickers { grid-template-columns: 1fr; } }

/* 指定會員 */
.results { list-style: none; padding: 0; margin: 8px 0 0; border: 1px solid #222; border-radius: 8px; max-height: 260px; overflow-y: auto; }
.results li { display: flex; gap: 10px; align-items: center; padding: 10px 12px; border-bottom: 1px solid #1d1d1d; cursor: pointer; color: #ddd; }
.results li:hover { background: #181818; }
.results li.added { opacity: 0.5; }
.results .add { margin-left: auto; color: #D4AF37; font-size: 0.85rem; }
.results.small li { padding: 7px 10px; font-size: 0.9rem; }
.paste { margin-top: 12px; color: #aaa; }
.paste summary { cursor: pointer; font-size: 0.9rem; }
.paste .btn { margin-top: 8px; margin-right: 10px; }

.chips { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; align-items: center; }
.chip { background: #222; color: #eee; border-radius: 16px; padding: 4px 6px 4px 12px; font-size: 0.85rem; display: inline-flex; align-items: center; gap: 4px; }
.chip button { background: none; border: none; color: #888; cursor: pointer; font-size: 1rem; line-height: 1; }
.chip button:hover { color: #e74c3c; }
.link { background: none; border: none; color: #888; cursor: pointer; text-decoration: underline; font-size: 0.85rem; }

/* 預估 */
.preview-row { display: flex; align-items: center; gap: 14px; margin-top: 16px; padding-top: 14px; border-top: 1px solid #1d1d1d; }
.count { color: #ddd; }
.count b { color: #3498db; font-size: 1.2rem; }
.sample { margin-top: 12px; display: flex; flex-wrap: wrap; gap: 6px 16px; color: #ddd; font-size: 0.9rem; }
.sample .group-label { flex-basis: 100%; margin: 0; }

.btn { padding: 10px 20px; border-radius: 8px; font-weight: bold; cursor: pointer; border: none; transition: 0.2s; white-space: nowrap; }
.btn-gold { background: #D4AF37; color: #000; }
.btn-gold:hover:not(:disabled) { background: #e5c358; }
.btn-gold:disabled, .btn-dark:disabled { background: #444; color: #888; cursor: not-allowed; }
.btn-dark { background: #2a2a2a; color: #eee; border: 1px solid #444; }
.btn-dark:hover:not(:disabled) { background: #333; }
.send { width: 100%; padding: 14px; font-size: 1rem; }

.alert { border-radius: 8px; padding: 12px 14px; margin-bottom: 14px; }
.alert.danger { background: rgba(231, 76, 60, 0.1); border: 1px solid rgba(231, 76, 60, 0.4); color: #e74c3c; }
.alert.success { background: rgba(46, 204, 113, 0.1); border: 1px solid rgba(46, 204, 113, 0.4); color: #2ecc71; }

.modal-mask { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.75); display: flex; align-items: center; justify-content: center; z-index: 1000; padding: 20px; }
.modal { background: #151515; border: 1px solid #333; border-radius: 12px; padding: 22px; width: 100%; max-width: 480px; color: #ddd; }
.modal h4 { color: #D4AF37; margin: 0 0 10px; }
.msg-preview { background: #0b0b0b; border: 1px solid #2a2a2a; border-radius: 8px; padding: 12px; white-space: pre-wrap; word-break: break-word; max-height: 240px; overflow-y: auto; font-family: inherit; font-size: 0.9rem; }
.media-box { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin: 10px 0 4px; }
.media-box .hint { margin: 0; }
.upload-btn { display: inline-block; }
.upload-btn.disabled { opacity: 0.5; cursor: wait; }
.lp-preview { margin-top: 14px; padding: 14px; background: #7494c0; border-radius: 10px; max-width: 320px; }
.lp-preview .group-label { color: #fff; }
.lp-img { width: 100%; border-radius: 12px; display: block; }
.lp-bubble { margin-top: 8px; background: #fff; color: #111; border-radius: 14px; padding: 8px 12px; font-size: 0.85rem; white-space: pre-wrap; word-break: break-word; }
.lp-card { background: #111; border-radius: 14px; overflow: hidden; }
.lp-card-hero { width: 100%; object-fit: cover; display: block; }
.lp-card-body { padding: 14px 16px; }
.lp-card-title { color: #fff; font-weight: bold; font-size: 1rem; }
.lp-card-text { color: #ccc; font-size: 0.82rem; margin-top: 8px; white-space: pre-wrap; word-break: break-word; }
.lp-card-btn { margin: 0 12px 12px; background: #D4AF37; color: #fff; text-align: center; border-radius: 8px; padding: 8px; font-size: 0.85rem; font-weight: bold; }
.confirm-img { max-width: 100%; max-height: 180px; border-radius: 8px; display: block; margin: 6px 0 10px; }
.block { border: 1px solid #262626; border-radius: 10px; padding: 12px; margin-top: 12px; background: #101010; }
.block-head { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 6px; }
.block-no { color: #D4AF37; font-weight: bold; font-size: 0.9rem; }
.block-head .tabs { margin: 0; }
.block-tools { margin-left: auto; display: flex; gap: 8px; }
.block-tools .link:disabled { opacity: 0.3; cursor: default; }
.add-block { margin-top: 12px; width: 100%; }
.lp-preview > * + * { margin-top: 8px; }
.confirm-blocks { max-height: 50vh; overflow-y: auto; }
.confirm-block { border-top: 1px solid #222; padding-top: 8px; margin-top: 8px; }
.draft-list { list-style: none; padding: 0; margin: 10px 0 0; border: 1px solid #222; border-radius: 8px; max-height: 220px; overflow-y: auto; }
.draft-list li { display: flex; gap: 10px; align-items: center; padding: 8px 12px; border-bottom: 1px solid #1d1d1d; color: #ddd; }
.draft-list li.current { background: rgba(212, 175, 55, 0.08); }
.draft-name { cursor: pointer; flex: 1; }
.draft-name:hover { color: #D4AF37; }
.small { font-size: 0.8rem; }
.test-row { display: flex; align-items: flex-end; gap: 10px; flex-wrap: wrap; margin-bottom: 10px; color: #aaa; font-size: 0.85rem; }
.test-row .test-btn { flex: 1; padding: 12px; }
.list-tools { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin-top: 12px; }
.list-modal { max-width: 640px; }
.list-rows { max-height: 55vh; }
.list-rows li { cursor: default; }
.list-rows li.excluded { opacity: 0.45; text-decoration: line-through; }
.list-rows li.excluded .link { text-decoration: none; }
.pager { display: flex; justify-content: center; gap: 14px; align-items: center; margin-top: 8px; }
.pager .link:disabled { opacity: 0.3; cursor: default; }
.audience-bar { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; margin: 0 0 14px; padding-bottom: 14px; border-bottom: 1px solid #1d1d1d; }
.modal-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 16px; }
</style>
