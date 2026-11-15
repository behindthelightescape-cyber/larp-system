<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { supabase } from '../../supabase'
import { DOLL_FRONT_LAYERS } from '../../config/paperdoll'

// ── OLED 防烙印：隨機像素位移 ──
let _lastSX = 0, _lastSY = 0
const nextShift = () => {
  let x, y
  do {
    x = parseFloat((Math.random() * 4 - 2).toFixed(1))
    y = parseFloat((Math.random() * 4 - 2).toFixed(1))
  } while (Math.abs(x - _lastSX) < 0.8 && Math.abs(y - _lastSY) < 0.8)
  _lastSX = x; _lastSY = y
  return `translate(${x}px,${y}px)`
}
const pixelShift = ref('translate(0px,0px)')
let burnTimer = null

// ── 音效（Web Audio API 合成）──
let audioCtx = null
const getCtx = () => {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)()
  if (audioCtx.state === 'suspended') audioCtx.resume()
  return audioCtx
}

const playArrival = () => {
  try {
    const ctx = getCtx()
    const t = ctx.currentTime

    // 低頻衝擊
    const bass = ctx.createOscillator()
    const bassG = ctx.createGain()
    bass.connect(bassG); bassG.connect(ctx.destination)
    bass.type = 'sine'
    bass.frequency.setValueAtTime(65, t)
    bass.frequency.exponentialRampToValueAtTime(28, t + 1.4)
    bassG.gain.setValueAtTime(0.55, t)
    bassG.gain.exponentialRampToValueAtTime(0.001, t + 1.6)
    bass.start(t); bass.stop(t + 1.6)

    // 上揚掃頻（魔法感）
    const sweep = ctx.createOscillator()
    const sweepG = ctx.createGain()
    const sweepF = ctx.createBiquadFilter()
    sweep.connect(sweepF); sweepF.connect(sweepG); sweepG.connect(ctx.destination)
    sweep.type = 'sawtooth'
    sweepF.type = 'lowpass'
    sweepF.frequency.setValueAtTime(180, t + 0.1)
    sweepF.frequency.exponentialRampToValueAtTime(3200, t + 1.1)
    sweep.frequency.setValueAtTime(210, t + 0.1)
    sweep.frequency.exponentialRampToValueAtTime(680, t + 1.3)
    sweepG.gain.setValueAtTime(0, t)
    sweepG.gain.linearRampToValueAtTime(0.13, t + 0.35)
    sweepG.gain.linearRampToValueAtTime(0, t + 2.0)
    sweep.start(t + 0.1); sweep.stop(t + 2.0)

    // 高頻閃光
    const spark = ctx.createOscillator()
    const sparkG = ctx.createGain()
    spark.connect(sparkG); sparkG.connect(ctx.destination)
    spark.type = 'sine'
    spark.frequency.setValueAtTime(1100, t + 0.9)
    spark.frequency.exponentialRampToValueAtTime(2600, t + 1.5)
    sparkG.gain.setValueAtTime(0, t + 0.9)
    sparkG.gain.linearRampToValueAtTime(0.07, t + 1.1)
    sparkG.gain.linearRampToValueAtTime(0, t + 2.0)
    spark.start(t + 0.9); spark.stop(t + 2.0)
  } catch (e) { console.warn('音效失敗', e) }
}

const playPage = () => {
  try {
    const ctx = getCtx()
    const t = ctx.currentTime
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    const filter = ctx.createBiquadFilter()
    osc.connect(filter); filter.connect(gain); gain.connect(ctx.destination)
    osc.type = 'sine'
    filter.type = 'bandpass'
    filter.frequency.value = 900
    osc.frequency.setValueAtTime(550, t)
    osc.frequency.exponentialRampToValueAtTime(1100, t + 0.22)
    gain.gain.setValueAtTime(0.055, t)
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.45)
    osc.start(t); osc.stop(t + 0.45)
  } catch (e) { console.warn('音效失敗', e) }
}

// 生日快樂歌（音樂盒音色），播的時候背景音樂先調小
const BIRTHDAY_TUNE = [
  // [半音（相對 C5）, 拍數]
  [-5, .75], [-5, .25], [-3, 1], [-5, 1], [0, 1], [-1, 2],
  [-5, .75], [-5, .25], [-3, 1], [-5, 1], [2, 1], [0, 2],
  [-5, .75], [-5, .25], [7, 1], [4, 1], [0, 1], [-1, 1], [-3, 2.5],
  [5, .75], [5, .25], [4, 1], [0, 1], [2, 1], [0, 3],
]
const playBirthday = () => {
  try {
    const ctx = getCtx()
    const beat = 0.36
    let t = ctx.currentTime + 0.15
    for (const [semi, beats] of BIRTHDAY_TUNE) {
      const f = 523.25 * Math.pow(2, semi / 12)
      for (const [mul, vol] of [[1, 0.16], [2, 0.05], [3, 0.02]]) {
        const o = ctx.createOscillator(), g = ctx.createGain()
        o.connect(g); g.connect(ctx.destination)
        o.type = 'sine'
        o.frequency.setValueAtTime(f * mul, t)
        g.gain.setValueAtTime(0, t)
        g.gain.linearRampToValueAtTime(vol, t + 0.015)
        g.gain.exponentialRampToValueAtTime(0.001, t + Math.max(beats * beat, 0.3) + 0.5)
        o.start(t); o.stop(t + beats * beat + 0.6)
      }
      t += beats * beat
    }
    const total = (t - ctx.currentTime) * 1000
    const before = bgm.volume
    bgm.volume = Math.min(before, 0.2)
    pageTimers.push(setTimeout(() => { if (phase.value === 'show') bgm.volume = before }, total + 300))
  } catch (e) { console.warn('音效失敗', e) }
}

// 壽星頁的彩帶
const CONFETTI_COLORS = ['#D4AF37', '#f5d76e', '#ff7aa2', '#7ad7ff', '#b98cff', '#ffffff']
const confetti = Array.from({ length: 70 }, (_, i) => ({
  id: i,
  left: Math.random() * 100,
  delay: Math.random() * 3.5,
  dur: 3.2 + Math.random() * 2.8,
  size: 8 + Math.random() * 10,
  color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
  spin: Math.random() > 0.5 ? 1 : -1,
  round: Math.random() > 0.7,
}))

const BRAND_LOGO    = 'https://meee.com.tw/VInVFKh.png'
const FALLBACK_BASE = 'https://meee.com.tw/hLmrwbm.png'
const DOLL_LAYER_ORDER = DOLL_FRONT_LAYERS // 披風另外畫在底圖後面

// 每頁停留毫秒數  0:登場 1:天數 2:場數 3:等級 4:EXP 5:弟子 6:總覽 7:壽星（只有壽星才播，接在登場後面）
const PAGE_DURATIONS = [3800, 3200, 4500, 3600, 3200, 3800, 8000, 11500]

const started     = ref(false)
const phase       = ref('waiting')  // 'waiting' | 'show'
const currentPage = ref(0)

const sessionId  = ref('')
const qrDataUrl  = ref('')
const player     = ref(null)
const dollBaseUrl = ref(FALLBACK_BASE)
const dollLayers  = ref({})
const dollBgStyle = ref({})

// ── 影片廣告 ──
const ads            = ref([])
const currentAdIndex = ref(0)
const currentAdData  = computed(() => {
  const ad = ads.value[currentAdIndex.value]
  if (!ad) return null
  return { ...ad, type: ad.type || 'video', resolvedUrl: ad.content_url || ad.video_url || null }
})

const loadAds = async () => {
  const { data } = await supabase
    .from('display_ads')
    .select('id, title, type, content_url, video_url, text_title, text_body, text_accent, order_index')
    .eq('is_active', true)
    .order('order_index')
  if (data) ads.value = data // 全部下架時也要清空
}

// 每換一次 +1：同一支廣告重播（只有一支、或互動播完回來）時 key 也會變，影片才會從頭重播
const adCycle = ref(0)

// 靜態廣告（圖片、文字、QR）計時自動換下一支；影片播完（@ended）或載入失敗（@error）換下一支
const SLIDE_MS = { image: 8000, text: 9000, qr: 15000 }
const VIDEO_MAX_MS = 10 * 60_000 // 影片卡住（網路斷、沒觸發 ended）的保底
let slideTimer = null
const clearSlideTimer = () => { if (slideTimer) { clearTimeout(slideTimer); slideTimer = null } }
const scheduleCurrentAd = () => {
  clearSlideTimer()
  const ad = currentAdData.value
  if (!ad || phase.value !== 'waiting') return
  slideTimer = setTimeout(nextAd, ad.type === 'video' ? VIDEO_MAX_MS : (SLIDE_MS[ad.type] || 8000))
}

const nextAd = () => {
  if (!ads.value.length) return
  currentAdIndex.value = (currentAdIndex.value + 1) % ads.value.length
  adCycle.value++
  scheduleCurrentAd()
}

// 影片網址失效：停一下再換（避免全部都壞時瘋狂連續切換）
const onVideoError = () => {
  clearSlideTimer()
  slideTimer = setTimeout(nextAd, 3000)
}

// 管理員改了播放清單，畫面端即時更新
let adsChannel = null
const subscribeAds = () => {
  adsChannel = supabase.channel('display-ads-watch')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'display_ads' }, async () => {
      await loadAds()
      currentAdIndex.value = 0
      adCycle.value++
      scheduleCurrentAd()
    })
    .subscribe()
}

// 偵測玩家掃碼：手機寫好資料後，對這台電視自己的頻道（display-scan-<session>）喊一聲 → 馬上去查
// 玩家資料不走 Realtime 廣播（以前整張表的變動會廣播給所有連線的人），只用 RPC 憑 session 編號查那一筆
const fetchSession = async () => {
  if (phase.value !== 'waiting' || !sessionId.value) return
  let { data, error } = await supabase.rpc('display_session_get', { p_session: sessionId.value })
  if (error) {
    // RPC 還沒建（SQL 還沒跑）時的舊查法，SQL 跑完就不會走到這裡
    const r = await supabase.from('display_sessions').select('player_data')
      .eq('session_id', sessionId.value).not('player_data', 'is', null).maybeSingle()
    data = r.data?.player_data
  }
  if (data && phase.value === 'waiting') startShow(data)
}

let sessionChannel = null
const subscribeSession = () => {
  if (sessionChannel) supabase.removeChannel(sessionChannel)
  sessionChannel = supabase.channel(`display-scan-${sessionId.value}`)
    .on('broadcast', { event: 'scanned' }, () => { fetchSession() })
    .subscribe()
}

// 輪詢保底（頻道沒連上時也查得到）
let pollTimer = null
const startPolling = () => {
  stopPolling()
  pollTimer = setInterval(() => {
    if (phase.value !== 'waiting') { stopPolling(); return }
    fetchSession()
  }, 2500)
}
const stopPolling = () => { if (pollTimer) { clearInterval(pollTimer); pollTimer = null } }



// count-up 顯示值
const displayLevel     = ref(0)
const displayGames     = ref(0)
const displayDays      = ref(0)
const displayExp       = ref(0)
const displayDisciples = ref(0)

// 粒子
const particles = Array.from({ length: 45 }, (_, i) => ({
  id: i,
  x:        Math.random() * 100,
  y:        Math.random() * 100,
  size:     Math.random() * 3 + 0.6,
  delay:    Math.random() * 12,
  duration: Math.random() * 14 + 10,
  gold:     Math.random() > 0.55
}))

// ── Count-up ──
const activeRafs = new Set()
const countUp = (target, refVal, duration = 1200) => {
  const start = Date.now()
  let handle
  const tick = () => {
    const t = Math.min((Date.now() - start) / duration, 1)
    refVal.value = Math.round(target * (1 - Math.pow(1 - t, 3)))
    if (t < 1) { handle = requestAnimationFrame(tick); activeRafs.add(handle) }
    else { refVal.value = target; activeRafs.delete(handle) }
  }
  handle = requestAnimationFrame(tick)
  activeRafs.add(handle)
}

// ── 紙娃娃載入 ──
// 畫面端沒登入（anon），讀不到 user_wardrobe_equipped（RLS 限本人），
// 所以掃碼的手機會先把穿搭圖片網址放進 player_data.doll；沒有才退回自己查（只拿得到預設底圖）。
const loadDollForUser = async (userId, doll) => {
  dollBaseUrl.value = FALLBACK_BASE
  dollLayers.value  = {}
  dollBgStyle.value = {}

  if (doll) {
    if (doll.base) dollBaseUrl.value = doll.base
    dollLayers.value = doll.layers || {}
    if (doll.bg) dollBgStyle.value = { backgroundImage: `url(${doll.bg})`, backgroundSize: 'cover', backgroundPosition: 'center' }
    return
  }

  const { data: base } = await supabase
    .from('wardrobe_bases').select('img_url')
    .eq('is_default', true).eq('is_active', true).single()
  if (base?.img_url) dollBaseUrl.value = base.img_url
  // 沒裝備的部位補預設圖（舊版手機沒送 doll 時用）
  const { data: noneDefaults } = await supabase.from('wardrobe_none_defaults').select('category, img_url')
  const defaults = Object.fromEntries((noneDefaults || []).filter(n => n.img_url).map(n => [n.category, n.img_url]))
  dollLayers.value = { ...defaults }

  if (!userId) return
  const { data: eq } = await supabase
    .from('user_wardrobe_equipped').select('equipped, background_id')
    .eq('user_id', userId).single()
  if (!eq) return

  if (eq.background_id) {
    const { data: bg } = await supabase
      .from('wardrobe_backgrounds').select('img_url')
      .eq('id', eq.background_id).single()
    if (bg?.img_url)
      dollBgStyle.value = { backgroundImage: `url(${bg.img_url})`, backgroundSize: 'cover', backgroundPosition: 'center' }
  }
  if (!eq.equipped) return
  const ids = Object.values(eq.equipped).filter(Boolean)
  if (!ids.length) return
  const { data: items } = await supabase
    .from('wardrobe_items').select('id, category, img_url').in('id', ids)
  if (!items) return
  const layers = { ...defaults }
  for (const [cat, id] of Object.entries(eq.equipped)) {
    const item = items.find(i => i.id === id)
    if (item?.img_url) layers[cat] = item.img_url
  }
  dollLayers.value = layers
}

// ── 換頁邏輯 ──
let pageTimers = []
const clearPageTimers = () => { pageTimers.forEach(clearTimeout); pageTimers = [] }

const goToPage = (nextPage) => {
  currentPage.value = nextPage
  if (nextPage === 7) playBirthday()
  else if (nextPage > 0) playPage()
  triggerPageAnimations(nextPage)
  schedulePage(nextPage)
}

// 這位玩家要播哪幾頁：數字是 0 的頁（新玩家的天數、場數、弟子）跳過
const pageSeq = ref([0, 1, 2, 3, 4, 5, 6])
const buildPageSeq = (p) => [
  0,
  ...(p.birthday ? [7] : []),
  ...(p.daysJoined > 0 ? [1] : []),
  ...(p.historyCount > 0 ? [2] : []),
  3, 4,
  ...(p.discipleCount > 0 ? [5] : []),
  6,
]
const pageNo = computed(() => pageSeq.value.indexOf(currentPage.value) + 1)

const schedulePage = (page) => {
  const next = pageSeq.value[pageSeq.value.indexOf(page) + 1]
  if (next === undefined) {
    // 全部播完，回到 waiting 並換新 session
    pageTimers.push(setTimeout(async () => {
      bgmFadeOut()
      phase.value = 'waiting'
      player.value = null
      currentPage.value = 0
      // 回到廣告：換下一支並重新計時（不然圖片／文字廣告會停住不動）
      nextAd()
      await generateSession()
      subscribeSession()
      startPolling()
    }, PAGE_DURATIONS[page]))
    return
  }
  pageTimers.push(setTimeout(() => goToPage(next), PAGE_DURATIONS[page]))
}

const triggerPageAnimations = (page) => {
  displayLevel.value = displayGames.value = displayDays.value = displayExp.value = displayDisciples.value = 0
  if (!player.value) return
  if (page === 1) countUp(player.value.daysJoined,      displayDays,      1400)
  if (page === 2) countUp(player.value.historyCount,    displayGames,     1400)
  if (page === 3) countUp(player.value.level,           displayLevel,     1200)
  if (page === 4) countUp(player.value.exp,             displayExp,       1600)
  if (page === 5) countUp(player.value.discipleCount,   displayDisciples, 1400)
}

// ── BGM ──
const bgm = new Audio('https://spotlightlarp.com/wp-content/uploads/2026/03/Neon_Bloom.mp3')
bgm.loop = true
bgm.volume = 0

const bgmFadeIn = () => {
  bgm.currentTime = 0
  bgm.play().catch(() => {})
  let v = 0
  const t = setInterval(() => {
    v = Math.min(v + 0.05, 0.75)
    bgm.volume = v
    if (v >= 0.75) clearInterval(t)
  }, 80)
}

const bgmFadeOut = () => {
  let v = bgm.volume
  const t = setInterval(() => {
    v = Math.max(v - 0.05, 0)
    bgm.volume = v
    if (v <= 0) { clearInterval(t); bgm.pause() }
  }, 80)
}

// ── 點擊啟動 ──
// ── 全螢幕 ──
// 瀏覽器規定要使用者點擊才能進全螢幕，所以在「點擊任意處開始」時進入；
// 中途跳出（按 Esc 等）可雙擊畫面或按 F 再進入。
const isFullscreen = ref(!!document.fullscreenElement)
const enterFullscreen = () => {
  const el = document.documentElement
  const req = el.requestFullscreen || el.webkitRequestFullscreen
  if (!document.fullscreenElement && req) Promise.resolve(req.call(el)).catch(() => {})
}
const toggleFullscreen = () => {
  if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {})
  else enterFullscreen()
}
const onFullscreenChange = () => { isFullscreen.value = !!document.fullscreenElement }
const onKeydown = (e) => { if (e.key === 'f' || e.key === 'F') toggleFullscreen() }

const handleStart = () => {
  started.value = true
  enterFullscreen()
  getCtx()
}

// ── 啟動展示 ──
let _showLock = false
const startShow = async (playerData) => {
  if (_showLock || phase.value === 'show') return
  _showLock = true
  stopPolling()
  clearPageTimers()
  clearSlideTimer()
  try {
    player.value = playerData
    pageSeq.value = buildPageSeq(playerData)
    await loadDollForUser(playerData.userId ?? null, playerData.doll)
    displayLevel.value = displayGames.value = displayDays.value = displayExp.value = 0
    currentPage.value = 0
    phase.value = 'show'
    playArrival()
    bgmFadeIn()
    schedulePage(0)
  } catch (err) {
    console.error('startShow 失敗:', err)
    phase.value = 'waiting'
    scheduleCurrentAd()
  } finally {
    _showLock = false
  }
}


// ── QR Code ──
const generateSession = async () => {
  sessionId.value = crypto.randomUUID()
  const liffState = encodeURIComponent(`#/scan?s=${sessionId.value}`)
  const url = `https://liff.line.me/2009161687-icfQU9r6?liff.state=${liffState}`
  try {
    const QRCode = (await import('qrcode')).default
    qrDataUrl.value = await QRCode.toDataURL(url, {
      width: 260, margin: 2, color: { dark: '#000', light: '#fff' }
    })
  } catch { qrDataUrl.value = '' }
}

// ── 時鐘 ──
const now = ref(new Date())
let clockTimer = null

onMounted(async () => {
  // 電視畫面整頁鎖住，不能上下滑
  document.documentElement.style.overflow = document.body.style.overflow = 'hidden'
  // audio unlock 改由 handleStart 處理
  document.addEventListener('fullscreenchange', onFullscreenChange)
  document.addEventListener('keydown', onKeydown)
  burnTimer = setInterval(() => {
    pixelShift.value = nextShift()
  }, 60000)
  await loadAds()
  scheduleCurrentAd()
  subscribeAds()
  await generateSession()
  subscribeSession()
  startPolling()
  clockTimer = setInterval(() => { now.value = new Date() }, 1000)
})
onUnmounted(() => {
  document.removeEventListener('fullscreenchange', onFullscreenChange)
  document.documentElement.style.overflow = document.body.style.overflow = ''
  document.removeEventListener('keydown', onKeydown)
  activeRafs.forEach(h => cancelAnimationFrame(h))
  activeRafs.clear()
  clearPageTimers()
  clearSlideTimer()
  stopPolling()
  if (adsChannel) supabase.removeChannel(adsChannel)
  if (sessionChannel) supabase.removeChannel(sessionChannel)
  clearInterval(clockTimer)
  clearInterval(burnTimer)
  audioCtx?.close()
  bgm.pause()
})

const timeStr = computed(() =>
  now.value.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', hour12: false })
)
const dateStr = computed(() =>
  now.value.toLocaleDateString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short' })
)
// 滿等：經驗值已經超過最後一級門檻（getLevelInfo 的 LV6 門檻還是 2500），不顯示「還差 -500 PT」
const isMaxLevel = computed(() => !!player.value && (!player.value.nextExp || player.value.exp >= player.value.nextExp))
const displayExpPct = computed(() => {
  if (!player.value) return 0
  if (isMaxLevel.value) return 100
  return Math.min((displayExp.value / player.value.nextExp) * 100, 100)
})
</script>

<template>
  <div class="tv-root" @dblclick="toggleFullscreen">
  <div v-if="started && !isFullscreen" class="fs-hint">雙擊畫面或按 F 進入全螢幕</div>
  <div class="tv-shift" :style="{ transform: pixelShift, transition: 'transform 2s ease' }">

    <!-- 粒子 -->
    <div class="particles" aria-hidden="true">
      <div
        v-for="p in particles" :key="p.id" class="particle"
        :class="{ 'particle-gold': p.gold }"
        :style="{
          left: p.x + '%', top: p.y + '%',
          width: p.size + 'px', height: p.size + 'px',
          animationDelay: p.delay + 's', animationDuration: p.duration + 's'
        }"
      />
    </div>

    <!-- Header -->
    <header class="tv-header">
      <img :src="BRAND_LOGO" class="tv-logo" alt="劇光燈 Spotlight" />
      <div class="tv-clock">
        <span class="clock-time">{{ timeStr }}</span>
        <span class="clock-date">{{ dateStr }}</span>
      </div>
    </header>

    <!-- ════════════ 啟動畫面 ════════════ -->
    <transition name="phase-fade">
      <div v-if="!started" class="start-overlay" @click="handleStart" key="start">
        <img :src="BRAND_LOGO" class="start-logo" alt="劇光燈" />
        <p class="start-prompt">點擊任意處開始</p>
      </div>
    </transition>

    <!-- ════════════ WAITING ════════════ -->
    <transition name="phase-fade">
      <div v-if="phase === 'waiting'" class="phase-wrap waiting-phase" key="waiting">

        <!-- 廣告內容（依類型渲染）-->
        <transition v-if="started" name="video-fade" mode="out-in">

          <!-- 🎬 影片 -->
          <video
            v-if="currentAdData?.type === 'video'"
            :key="'v-' + currentAdData.id + '-' + adCycle"
            class="ad-video"
            autoplay playsinline
            :src="currentAdData.resolvedUrl"
            @ended="nextAd"
            @error="onVideoError"
          ></video>

          <!-- 🖼 圖片 -->
          <img
            v-else-if="currentAdData?.type === 'image'"
            :key="'i-' + currentAdData.id + '-' + adCycle"
            class="ad-image"
            :src="currentAdData.resolvedUrl"
            :alt="currentAdData.title"
          />

          <!-- 📝 文字卡 -->
          <div
            v-else-if="currentAdData?.type === 'text'"
            :key="'t-' + currentAdData.id + '-' + adCycle"
            class="ad-text-slide"
          >
            <div class="ad-text-deco" :style="{ color: currentAdData.text_accent || '#D4AF37' }">◆</div>
            <h2 class="ad-text-title" :style="{ color: currentAdData.text_accent || '#D4AF37' }">
              {{ currentAdData.text_title }}
            </h2>
            <p class="ad-text-body">{{ currentAdData.text_body }}</p>
            <div class="ad-text-line" :style="{ background: `linear-gradient(90deg, transparent, ${currentAdData.text_accent || '#D4AF37'}, transparent)` }"></div>
          </div>

          <!-- 📱 QR 全版 -->
          <div
            v-else-if="currentAdData?.type === 'qr'"
            :key="'q-' + currentAdData.id + '-' + adCycle"
            class="ad-qr-slide"
          >
            <!-- 左側標語 -->
            <div class="ad-qr-left">
              <img :src="BRAND_LOGO" class="ad-qr-logo" alt="劇光燈" />
              <p class="ad-qr-eyebrow">SPOTLIGHT PLAYER</p>
              <h2 class="ad-qr-headline">掃描 QR Code<br/>查看你的冒險記錄</h2>
              <p class="ad-qr-desc">{{ currentAdData.title || '用 LINE 登入，解鎖你的專屬冒險總覽' }}</p>
              <div class="ad-qr-deco-line"></div>
            </div>

            <!-- 右側 QR -->
            <div class="ad-qr-right">
              <div class="ad-qr-frame">
                <div class="qr-corner tl"></div>
                <div class="qr-corner tr"></div>
                <div class="qr-corner bl"></div>
                <div class="qr-corner br"></div>
                <div class="qr-scan-line"></div>
                <img v-if="qrDataUrl" :src="qrDataUrl" class="qr-img" alt="QR Code" />
                <div v-else class="qr-placeholder"><span>產生中...</span></div>
              </div>
              <p class="ad-qr-hint">掃描以登入互動</p>
            </div>
          </div>

          <!-- 空廣告 -->
          <div v-else :key="'empty'" class="ad-no-content">
            <p class="no-content-hint">尚未設定廣告</p>
            <p class="no-content-sub">請至後台新增廣告素材</p>
          </div>

        </transition>

        <!-- QR Code 浮層（右下角，QR 全版廣告時隱藏）-->
        <div v-if="started && currentAdData?.type !== 'qr'" class="qr-float">
          <div class="qr-float-inner">
            <div class="qr-float-frame">
              <div class="qr-scan-line"></div>
              <img v-if="qrDataUrl" :src="qrDataUrl" class="qr-img" alt="QR Code" />
              <div v-else class="qr-placeholder"><span>產生中...</span></div>
            </div>
            <p class="qr-float-hint">掃描以登入互動</p>
          </div>
        </div>

      </div>
    </transition>

    <!-- ════════════ PAGES ════════════ -->
    <div v-if="phase === 'show'" class="phase-wrap page-root">
      <transition name="page-slide">
      <div :key="currentPage" class="page-slide-inner">

        <!-- ── PAGE 0：登場 ── -->
        <div v-if="currentPage === 0" class="page page-arrival">
          <div class="arrival-beams" aria-hidden="true"></div>
          <p class="arrival-eyebrow">PLAYER ARRIVED</p>
          <h1 class="arrival-name">{{ player?.name }}</h1>
          <div class="arrival-title">
            <span class="arrival-gem">✦</span>
            {{ player?.title }}
          </div>
        </div>

        <!-- ── PAGE 7：壽星（本月生日才有） ── -->
        <div v-if="currentPage === 7" class="page page-birthday">
          <div class="bday-confetti" aria-hidden="true">
            <i v-for="c in confetti" :key="c.id" :style="{
              left: c.left + '%', width: c.size + 'px', height: (c.round ? c.size : c.size * 0.45) + 'px',
              background: c.color, borderRadius: c.round ? '50%' : '2px',
              animationDelay: c.delay + 's', animationDuration: c.dur + 's', '--spin': c.spin,
            }"></i>
          </div>
          <div class="bday-cake">🎂</div>
          <p class="bday-eyebrow">HAPPY BIRTHDAY</p>
          <h1 class="bday-name">{{ player?.name }}</h1>
          <p class="bday-msg">{{ player?.birthday === 'today' ? '今天是你的生日！' : '這個月是你的壽星月！' }}</p>
          <p class="bday-sub">劇光燈全體祝您生日快樂</p>
        </div>

        <!-- ── PAGE 1：加入天數 ── -->
        <div v-if="currentPage === 1" class="page page-stat">
          <p class="stat-pre">你加入劇光燈已經</p>
          <div class="stat-big-wrap">
            <span class="stat-big">{{ displayDays }}</span>
            <span class="stat-unit">天了</span>
          </div>
          <p class="stat-post">感謝你一直在！</p>
          <div class="stat-deco-line"></div>
        </div>

        <!-- ── PAGE 2：遊玩場數 ── -->
        <div v-if="currentPage === 2" class="page page-games">
          <div class="games-left">
            <p class="stat-pre">你總共完成了</p>
            <div class="stat-big-wrap">
              <span class="stat-big gold">{{ displayGames }}</span>
              <span class="stat-unit">場冒險</span>
            </div>
            <p class="stat-post">每一場都是獨一無二的故事</p>
            <div class="stat-deco-line"></div>
          </div>

          <div class="games-ticker-wrap" v-if="player?.scripts?.length">
            <div class="ticker-fade-top"></div>
            <div class="ticker-fade-bottom"></div>
            <div
              class="ticker-track"
              :style="{ '--count': player.scripts.length }"
            >
              <div
                v-for="(title, i) in [...player.scripts, ...player.scripts]"
                :key="i" class="ticker-item"
              >
                <span class="ticker-num">{{ String(i % player.scripts.length + 1).padStart(2, '0') }}</span>
                {{ title }}
              </div>
            </div>
          </div>
        </div>

        <!-- ── PAGE 3：等級 ── -->
        <div v-if="currentPage === 3" class="page page-level">
          <p class="level-pre">你目前的冒險等級</p>
          <div class="level-emblem">
            <div class="emblem-glow"></div>
            <div class="emblem-hex"></div>
            <div class="emblem-content">
              <span class="emblem-lv">LV</span>
              <span class="emblem-num">{{ displayLevel }}</span>
            </div>
          </div>
          <p class="level-title">{{ player?.title }}</p>
        </div>

        <!-- ── PAGE 4：經驗值 ── -->
        <div v-if="currentPage === 4" class="page page-exp">
          <p class="exp-pre">{{ isMaxLevel ? '你的累積經驗值' : '距離下一個等級' }}</p>
          <div class="exp-display-num">
            <span class="exp-cur">{{ displayExp.toLocaleString() }}</span>
            <template v-if="!isMaxLevel">
              <span class="exp-slash">/</span>
              <span class="exp-max">{{ player?.nextExp?.toLocaleString() }}</span>
            </template>
            <span class="exp-unit">PT</span>
          </div>
          <div class="exp-bar-outer">
            <div class="exp-bar-inner" :style="{ width: displayExpPct + '%' }"></div>
            <span class="exp-pct-label">{{ isMaxLevel ? 'MAX' : Math.round(displayExpPct) + '%' }}</span>
          </div>
          <p v-if="isMaxLevel" class="exp-post">已達<strong>最高等級</strong>，你是真正的冒險傳奇！</p>
          <p v-else class="exp-post">
            還差 <strong>{{ (player?.nextExp - player?.exp).toLocaleString() }}</strong> PT 升級
          </p>
        </div>

        <!-- ── PAGE 5：弟子數量 ── -->
        <div v-if="currentPage === 5" class="page page-disciples">
          <p class="stat-pre">你已影響了</p>
          <div class="stat-big-wrap">
            <span class="stat-big">{{ displayDisciples }}</span>
            <span class="stat-unit">位冒險同伴</span>
          </div>
          <p class="stat-post">謝謝你把這份精彩帶給更多人</p>
          <div class="stat-deco-line" style="margin-bottom: 32px;"></div>
          <div v-if="player?.disciples?.length" class="disciples-tags">
            <span
              v-for="name in player.disciples"
              :key="name"
              class="disciple-tag"
            >{{ name }}</span>
          </div>
        </div>

        <!-- ── PAGE 6：結尾總覽 ── -->
        <div v-if="currentPage === 6" class="page page-finale" :style="dollBgStyle">
          <div class="finale-bg-overlay"></div>
          <div class="finale-beams"></div>

          <!-- 紙娃娃 -->
          <div class="finale-doll">
            <img v-if="dollLayers.cape" class="doll-clothing" :src="dollLayers.cape" alt="" />
            <img class="doll-base" :src="dollBaseUrl" alt="角色" />
            <template v-for="slot in DOLL_LAYER_ORDER" :key="slot">
              <img v-if="dollLayers[slot]" class="doll-clothing" :src="dollLayers[slot]" alt="" />
            </template>
          </div>

          <!-- 資訊卡 -->
          <div class="finale-card">
            <div class="finale-card-deco"></div>
            <p class="finale-eyebrow">{{ player?.birthday ? '🎂 BIRTHDAY STAR' : 'SPOTLIGHT PLAYER' }}</p>
            <h2 class="finale-name">{{ player?.name }}</h2>
            <p class="finale-title-text">{{ player?.title }}</p>
            <div class="finale-divider"><span>◆</span></div>
            <div class="finale-stats">
              <div class="fs-cell">
                <span class="fs-num">LV {{ player?.level }}</span>
                <span class="fs-label">LEVEL</span>
              </div>
              <div class="fs-div"></div>
              <div class="fs-cell">
                <span class="fs-num">{{ player?.historyCount }}</span>
                <span class="fs-label">GAMES</span>
              </div>
              <div class="fs-div"></div>
              <div class="fs-cell">
                <span class="fs-num">{{ player?.daysJoined }}</span>
                <span class="fs-label">DAYS</span>
              </div>
            </div>
          </div>
        </div>

      </div>
      </transition>
    </div>

    <!-- 頁碼點點（show 階段） -->
    <div v-if="phase === 'show'" class="page-dots" aria-hidden="true">
      <div
        v-for="pg in pageSeq" :key="pg"
        class="dot" :class="{ active: currentPage === pg }"
      ></div>
    </div>

    <!-- Footer -->
    <footer class="tv-footer">
      <span class="footer-session">SESSION {{ sessionId.slice(0, 8).toUpperCase() }}</span>
      <span class="footer-dot-sep"></span>
      <span class="footer-status" :class="phase === 'waiting' ? 'waiting' : 'show'">
        {{ phase === 'waiting' ? '等待玩家掃描...' : `第 ${pageNo} / ${pageSeq.length} 頁` }}
      </span>
    </footer>

  </div>
  </div>
</template>

<style scoped>
/* ── 根 ── */
.tv-root {
  /* 固定貼滿螢幕：App 外框底下留給選單的 80px 不會把頁面撐出捲軸 */
  position: fixed; inset: 0; z-index: 10;
  width: 100%; height: 100%; overflow: hidden;
  touch-action: none; overscroll-behavior: none;
  background: #000000;
  padding: 2px; box-sizing: border-box;
}
.tv-shift {
  width: 100%; height: 100%;
  background: #060606; color: #fff;
  display: flex; flex-direction: column;
  font-family: 'Helvetica Neue', 'Noto Sans TC', sans-serif;
  position: relative; user-select: none;
}

/* ── 啟動畫面 ── */
.start-overlay {
  position: absolute; inset: 0; z-index: 100;
  background: #000;
  display: flex; flex-direction: column;
  align-items: center; justify-content: center; gap: 40px;
  cursor: pointer;
}
.start-logo {
  height: 80px; object-fit: contain;
  filter: drop-shadow(0 0 24px rgba(212,175,55,0.5));
  animation: fade-up 0.8s ease both;
}
.fs-hint {
  position: fixed; left: 24px; bottom: 20px; z-index: 50;
  font-size: 0.8rem; letter-spacing: 1px; color: rgba(212,175,55,0.55);
  background: rgba(0,0,0,0.5); border: 1px solid rgba(212,175,55,0.2);
  border-radius: 999px; padding: 6px 14px; pointer-events: none;
}
.start-prompt {
  font-size: 1rem; letter-spacing: 6px; color: #D4AF37;
  margin: 0; opacity: 0.6;
  animation: start-blink 2s ease-in-out infinite, fade-up 0.8s ease 0.3s both;
}
@keyframes start-blink {
  0%, 100% { opacity: 0.3; }
  50%       { opacity: 0.8; }
}

/* ── 粒子 ── */
.particles { position: absolute; inset: 0; z-index: 1; pointer-events: none; overflow: hidden; }
.particle {
  position: absolute; border-radius: 50%;
  background: rgba(255,255,255,0.5);
  animation: particle-rise linear infinite;
}
.particle-gold { background: radial-gradient(circle, rgba(212,175,55,0.85), transparent); }
@keyframes particle-rise {
  0%   { transform: translateY(0) scale(1); opacity: 0; }
  15%  { opacity: 1; }
  85%  { opacity: 0.7; }
  100% { transform: translateY(-100px) scale(0.3); opacity: 0; }
}


/* ── Header ── */
.tv-header {
  position: relative; z-index: 20; flex-shrink: 0;
  display: flex; align-items: center; justify-content: space-between;
  padding: 18px 56px;
  border-bottom: 1px solid rgba(212,175,55,0.1);
  background: rgba(6,6,6,0.6); backdrop-filter: blur(20px);
}
.tv-logo {
  height: 76px; object-fit: contain;
  filter: drop-shadow(0 0 14px rgba(212,175,55,0.5));
}
.tv-clock { display: flex; flex-direction: column; align-items: flex-end; gap: 2px; }
.clock-time { font-size: 2rem; font-weight: 700; color: #D4AF37; letter-spacing: 4px; line-height: 1; font-variant-numeric: tabular-nums; }
.clock-date { font-size: 0.75rem; color: #555; letter-spacing: 1.5px; }

/* ── Phase 通用 ── */
.phase-wrap {
  flex: 1; position: relative; z-index: 10;
  display: flex; align-items: center; justify-content: center;
  overflow: hidden;
}
.page-root { align-items: stretch; }

/* ── WAITING ── */
/* ── WAITING：影片全版 ── */
.waiting-phase { padding: 0; }

.ad-video {
  position: absolute; inset: 0; width: 100%; height: 100%;
  object-fit: contain; z-index: 0; background: #000;
}
.ad-no-content {
  position: absolute; inset: 0; z-index: 0;
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px;
  background: radial-gradient(ellipse 60% 50% at 50% 50%, rgba(212,175,55,0.06) 0%, transparent 70%);
}
.no-content-hint { font-size: 1.2rem; color: #444; margin: 0; }
.no-content-sub  { font-size: 0.8rem; color: #2a2a2a; margin: 0; font-family: monospace; }

/* QR Code 浮層（右下角）*/
.qr-float {
  position: absolute; bottom: 28px; right: 28px; z-index: 20;
}
.qr-float-inner {
  display: flex; flex-direction: column; align-items: center; gap: 10px;
  background: rgba(0,0,0,0.65);
  backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px);
  border: 1px solid rgba(212,175,55,0.3);
  border-radius: 16px; padding: 14px;
  box-shadow: 0 8px 32px rgba(0,0,0,0.6);
}
.qr-float-frame {
  position: relative; width: clamp(130px, 18vmin, 240px); height: clamp(130px, 18vmin, 240px);
  background: #fff; border-radius: 10px;
  padding: 6px; box-sizing: border-box; overflow: hidden;
}
.qr-float-hint {
  font-size: clamp(0.72rem, 1.6vmin, 1.1rem); color: #D4AF37; letter-spacing: 1.5px; margin: 0;
}

/* 影片切換淡入淡出 */
.video-fade-enter-active { transition: opacity 0.5s ease; }
.video-fade-leave-active { transition: opacity 0.3s ease; }
.video-fade-enter-from, .video-fade-leave-to { opacity: 0; }

.qr-frame {
  position: relative; width: 268px; height: 268px;
  background: #fff; border-radius: 14px; padding: 10px; box-sizing: border-box;
  display: flex; align-items: center; justify-content: center; overflow: hidden;
}
.qr-corner { position: absolute; width: 22px; height: 22px; border-color: #D4AF37; border-style: solid; }
.qr-corner.tl { top: -3px; left: -3px;  border-width: 3px 0 0 3px; border-radius: 5px 0 0 0; }
.qr-corner.tr { top: -3px; right: -3px; border-width: 3px 3px 0 0; border-radius: 0 5px 0 0; }
.qr-corner.bl { bottom: -3px; left: -3px;  border-width: 0 0 3px 3px; border-radius: 0 0 0 5px; }
.qr-corner.br { bottom: -3px; right: -3px; border-width: 0 3px 3px 0; border-radius: 0 0 5px 0; }
.qr-scan-line {
  position: absolute; left: 12px; right: 12px; height: 2px;
  background: linear-gradient(90deg, transparent, rgba(212,175,55,0.9), transparent);
  box-shadow: 0 0 8px 2px rgba(212,175,55,0.5);
  animation: scan-sweep 2.8s ease-in-out infinite; z-index: 5;
}
@keyframes scan-sweep {
  0%   { top: 14px; opacity: 0; } 8% { opacity: 1; } 92% { opacity: 1; }
  100% { top: calc(100% - 14px); opacity: 0; }
}
.qr-img { width: 100%; height: 100%; border-radius: 8px; position: relative; z-index: 2; }
.qr-placeholder { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; color: #aaa; border: 2px dashed #ddd; border-radius: 8px; }
.qr-sub { font-size: 0.7rem; color: #333; letter-spacing: 1px; }

/* ════════ PAGES 共用 ════════ */
.page {
  position: absolute; inset: 0;
  display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  padding: 40px 80px; box-sizing: border-box;
}

/* ── PAGE 0：登場 ── */
.page-birthday {
  overflow: hidden;
  background: radial-gradient(ellipse 75% 60% at 50% 45%, rgba(255,122,162,0.14) 0%, rgba(212,175,55,0.08) 40%, transparent 75%);
}
.bday-confetti { position: absolute; inset: 0; pointer-events: none; z-index: 0; }
.bday-confetti i {
  position: absolute; top: -6%; display: block; opacity: 0.9;
  animation: bday-fall linear infinite both;
}
@keyframes bday-fall {
  0%   { transform: translate3d(0, 0, 0) rotate(0deg); }
  50%  { transform: translate3d(3vw, 55vh, 0) rotate(calc(var(--spin) * 360deg)); }
  100% { transform: translate3d(-2vw, 112vh, 0) rotate(calc(var(--spin) * 720deg)); }
}
.bday-cake {
  font-size: clamp(4rem, 16vmin, 11rem); line-height: 1; z-index: 1; margin-bottom: 2vmin;
  animation: bday-pop 0.9s cubic-bezier(0.175, 0.885, 0.32, 1.4) 0.1s both, bday-bob 2.4s ease-in-out 1s infinite;
}
@keyframes bday-pop { 0% { transform: scale(0) rotate(-20deg); opacity: 0; } 100% { transform: scale(1) rotate(0); opacity: 1; } }
@keyframes bday-bob { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-1.5vmin); } }
.bday-eyebrow {
  font-size: clamp(0.9rem, 2.4vmin, 1.6rem); font-weight: 800; letter-spacing: 0.6em; color: #ff9ab8;
  margin: 0 0 1.5vmin; z-index: 1; animation: fade-up 0.6s ease 0.5s both;
}
.bday-name {
  font-size: clamp(2.6rem, 11vmin, 8rem); font-weight: 900; line-height: 1.05; margin: 0 0 2.5vmin; z-index: 1;
  text-align: center; word-break: keep-all; overflow-wrap: anywhere;
  background: linear-gradient(135deg, #fff3c4 0%, #D4AF37 45%, #ff9ab8 100%);
  -webkit-background-clip: text; background-clip: text; color: transparent;
  animation: name-crash 0.8s cubic-bezier(0.215, 0.61, 0.355, 1) 0.7s both;
}
.bday-msg {
  font-size: clamp(1.3rem, 4.6vmin, 3.4rem); font-weight: 800; color: #fff; margin: 0 0 1.2vmin; z-index: 1;
  animation: fade-up 0.6s ease 1.3s both;
}
.bday-sub {
  font-size: clamp(1rem, 2.8vmin, 2rem); color: #c9b98a; margin: 0; z-index: 1;
  animation: fade-up 0.6s ease 1.7s both;
}

.page-arrival { background: radial-gradient(ellipse 80% 60% at 50% 40%, rgba(212,175,55,0.08) 0%, transparent 70%); }
.arrival-beams {
  position: absolute; inset: 0; pointer-events: none;
  background: repeating-conic-gradient(transparent 0deg 8deg, rgba(212,175,55,0.03) 8deg 10deg, transparent 10deg 18deg);
  animation: beams-rotate 25s linear infinite;
}
@keyframes beams-rotate { to { transform: rotate(360deg); } }
.arrival-eyebrow {
  font-size: 0.85rem; font-weight: 700; letter-spacing: 8px; color: #D4AF37; opacity: 0.55;
  margin: 0 0 20px; z-index: 1;
  animation: fade-up 0.6s ease 0.1s both;
}
.arrival-name {
  font-size: 7rem; font-weight: 900; line-height: 1; margin: 0 0 24px; z-index: 1;
  text-align: center;
  animation: name-crash 0.8s cubic-bezier(0.215, 0.61, 0.355, 1) 0.3s both;
}
@keyframes name-crash {
  0%  { opacity: 0; transform: scale(2.5); filter: blur(20px); }
  65% { transform: scale(0.95); }
  100%{ opacity: 1; transform: scale(1); filter: blur(0); }
}
.arrival-title {
  display: inline-flex; align-items: center; gap: 10px;
  border: 1px solid rgba(212,175,55,0.4); background: rgba(212,175,55,0.07);
  padding: 10px 26px; border-radius: 8px; z-index: 1;
  color: #D4AF37; font-size: 1.1rem; letter-spacing: 1.5px;
  animation: fade-up 0.6s ease 0.8s both;
}
.arrival-gem { font-size: 0.6rem; opacity: 0.6; }

/* ── PAGE 1 & 2：數字統計 ── */
.page-stat { gap: 0; }
.stat-pre {
  font-size: 1.1rem; color: #666; letter-spacing: 2px; margin: 0 0 24px;
  animation: fade-up 0.5s ease 0.1s both;
}
.stat-big-wrap {
  display: flex; align-items: baseline; gap: 16px; margin-bottom: 20px;
  animation: fade-up 0.6s ease 0.25s both;
}
.stat-big {
  font-size: 10rem; font-weight: 900; line-height: 1; letter-spacing: -4px;
  color: #fff; font-variant-numeric: tabular-nums;
}
.stat-big.gold {
  background: linear-gradient(135deg, #fceabb, #D4AF37, #9e761c);
  -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;
}
.stat-unit { font-size: 2.2rem; font-weight: 700; color: #555; letter-spacing: 2px; }
.stat-post {
  font-size: 1rem; color: #444; letter-spacing: 1.5px; margin: 0 0 36px;
  animation: fade-up 0.5s ease 0.5s both;
}
.stat-deco-line {
  width: 80px; height: 2px;
  background: linear-gradient(90deg, transparent, #D4AF37, transparent);
  animation: fade-up 0.5s ease 0.6s both;
}

/* ── PAGE 2：遊玩場數（含跑馬燈）── */
.page-games {
  flex-direction: row !important;
  align-items: center;
  gap: 80px;
  justify-content: center;
}
.games-left { display: flex; flex-direction: column; align-items: flex-start; flex-shrink: 0; }
.games-left .stat-pre,
.games-left .stat-post,
.games-left .stat-deco-line { animation: fade-up 0.5s ease both; }
.games-left .stat-pre       { animation-delay: 0.1s; }
.games-left .stat-big-wrap  { animation: fade-up 0.6s ease 0.25s both; }
.games-left .stat-post      { animation-delay: 0.5s; }
.games-left .stat-deco-line { animation-delay: 0.6s; }

.games-ticker-wrap {
  position: relative;
  height: 380px; width: 300px; flex-shrink: 0;
  overflow: hidden;
}
.ticker-fade-top, .ticker-fade-bottom {
  position: absolute; left: 0; right: 0; height: 80px; z-index: 2; pointer-events: none;
}
.ticker-fade-top    { top: 0;    background: linear-gradient(to bottom, #060606, transparent); }
.ticker-fade-bottom { bottom: 0; background: linear-gradient(to top,   #060606, transparent); }
.ticker-track {
  display: flex; flex-direction: column; gap: 10px;
  animation: ticker-up linear infinite;
  animation-duration: calc(var(--count, 8) * 2.4s);
}
@keyframes ticker-up {
  0%   { transform: translateY(0); }
  100% { transform: translateY(-50%); }
}
.ticker-item {
  display: flex; align-items: center; gap: 12px;
  padding: 11px 16px;
  background: rgba(255,255,255,0.03);
  border: 1px solid rgba(255,255,255,0.06);
  border-left: 2px solid rgba(212,175,55,0.3);
  border-radius: 8px;
  font-size: 0.95rem; color: #777;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.ticker-num { color: #333; font-size: 0.7rem; font-family: monospace; flex-shrink: 0; }

/* ── PAGE 5：弟子 ── */
.page-disciples { gap: 0; }
.disciples-tags {
  display: flex; flex-wrap: wrap; gap: 10px; justify-content: center;
  max-width: 600px;
  animation: fade-up 0.6s ease 0.6s both;
}
.disciple-tag {
  padding: 8px 20px;
  background: rgba(212,175,55,0.07);
  border: 1px solid rgba(212,175,55,0.25);
  border-radius: 20px;
  color: #D4AF37; font-size: 0.95rem; letter-spacing: 1px;
}

/* ── PAGE 3：等級 ── */
.page-level { gap: 0; }
.level-pre {
  font-size: 0.9rem; color: #666; letter-spacing: 3px; margin: 0 0 36px;
  animation: fade-up 0.5s ease 0.1s both;
}
.level-emblem {
  position: relative; display: flex; align-items: center; justify-content: center;
  width: 260px; height: 260px; margin-bottom: 32px;
  animation: emblem-drop 1s cubic-bezier(0.175, 0.885, 0.32, 1.275) 0.2s both;
}
@keyframes emblem-drop {
  0%  { opacity: 0; transform: translateY(-60px) scale(0.5); }
  70% { transform: translateY(10px) scale(1.05); }
  100%{ opacity: 1; transform: translateY(0) scale(1); }
}
.emblem-hex {
  position: absolute; inset: 0;
  background: url('data:image/svg+xml;charset=UTF-8,%3csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"%3e%3cpolygon points="50,4 96,27 96,73 50,96 4,73 4,27" fill="%23111" stroke="%23D4AF37" stroke-width="2"/%3e%3c/svg%3e') no-repeat center / contain;
}
.emblem-glow {
  position: absolute; inset: -40px;
  background: radial-gradient(circle, rgba(212,175,55,0.25) 0%, transparent 65%);
  animation: glow-pulse 2s ease-in-out infinite;
}
@keyframes glow-pulse { 0%,100% { opacity: 0.6; transform: scale(0.95); } 50% { opacity: 1; transform: scale(1.1); } }
.emblem-content {
  position: relative; z-index: 2; display: flex; flex-direction: column;
  align-items: center; justify-content: center; gap: 2px;
}
.emblem-lv  { font-size: 0.9rem; font-weight: 800; color: #888; letter-spacing: 3px; line-height: 1; }
.emblem-num {
  font-size: 4.5rem; font-weight: 900; line-height: 1;
  background: linear-gradient(135deg, #fff 0%, #fceabb 40%, #D4AF37 100%);
  -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;
  font-variant-numeric: tabular-nums;
}
.level-title {
  font-size: 1rem; color: #D4AF37; letter-spacing: 2px; margin: 0;
  animation: fade-up 0.5s ease 0.9s both;
}

/* ── PAGE 4：EXP ── */
.page-exp { gap: 0; }
.exp-pre {
  font-size: 0.9rem; color: #666; letter-spacing: 3px; margin: 0 0 28px;
  animation: fade-up 0.5s ease 0.1s both;
}
.exp-display-num {
  display: flex; align-items: baseline; gap: 10px; margin-bottom: 28px;
  animation: fade-up 0.6s ease 0.25s both;
}
.exp-cur  { font-size: 5rem; font-weight: 900; color: #D4AF37; line-height: 1; font-variant-numeric: tabular-nums; }
.exp-slash{ font-size: 1.5rem; color: #333; }
.exp-max  { font-size: 2rem; color: #444; font-variant-numeric: tabular-nums; }
.exp-unit { font-size: 1rem; color: #555; letter-spacing: 2px; margin-left: 4px; }
.exp-bar-outer {
  position: relative; width: 600px; height: 12px;
  background: #111; border-radius: 6px; overflow: hidden; margin-bottom: 16px;
  animation: fade-up 0.5s ease 0.4s both;
}
.exp-bar-inner {
  height: 100%; border-radius: 6px;
  background: linear-gradient(90deg, #9e761c, #D4AF37, #f5d77a, #D4AF37);
  background-size: 200% 100%; animation: shimmer-bar 3s linear infinite;
  transition: width 1.8s cubic-bezier(0.2, 0.8, 0.2, 1);
}
@keyframes shimmer-bar { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
.exp-pct-label {
  position: absolute; right: 10px; top: 50%; transform: translateY(-50%);
  font-size: 0.65rem; font-weight: 700; color: rgba(0,0,0,0.7);
}
.exp-post {
  font-size: 1rem; color: #555; margin: 0;
  animation: fade-up 0.5s ease 0.6s both;
}
.exp-post strong { color: #D4AF37; font-size: 1.3rem; }

/* ── PAGE 5：結尾總覽 ── */
.page-finale {
  flex-direction: row; gap: 60px; padding: 0; justify-content: center; align-items: center;
}
.finale-bg-overlay {
  position: absolute; inset: 0; z-index: 0;
  background: linear-gradient(to bottom, rgba(0,0,0,0.6) 0%, rgba(0,0,0,0.4) 50%, rgba(0,0,0,0.8) 100%);
}
.finale-beams {
  position: absolute; inset: 0; z-index: 0; pointer-events: none;
  background: repeating-conic-gradient(transparent 0deg 8deg, rgba(212,175,55,0.04) 8deg 10deg, transparent 10deg 18deg);
  animation: beams-rotate 30s linear infinite;
}
.finale-doll {
  position: relative; display: inline-block; flex-shrink: 0;
  z-index: 1; line-height: 0;
  filter: drop-shadow(0 0 40px rgba(212,175,55,0.2)) drop-shadow(0 30px 60px rgba(0,0,0,0.9));
  animation: doll-rise 1s cubic-bezier(0.2, 0.8, 0.2, 1) 0.1s both;
}
@keyframes doll-rise {
  0%  { opacity: 0; transform: translateY(80px); }
  100%{ opacity: 1; transform: translateY(0); }
}
.doll-base     { display: block; height: 500px; width: auto; }
.doll-clothing { position: absolute; top: 0; left: 0; width: 100%; height: 100%; object-fit: contain; pointer-events: none; }

.finale-card {
  position: relative; z-index: 1; flex-shrink: 0; max-width: 380px;
  background: rgba(10,10,10,0.8); border: 1px solid rgba(212,175,55,0.25);
  border-radius: 20px; padding: 32px 36px;
  backdrop-filter: blur(20px);
  box-shadow: 0 20px 60px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.04);
  animation: card-appear 0.8s cubic-bezier(0.2, 0.8, 0.2, 1) 0.4s both;
}
@keyframes card-appear {
  0%  { opacity: 0; transform: translateX(40px); }
  100%{ opacity: 1; transform: translateX(0); }
}
.finale-card-deco {
  position: absolute; top: 0; left: 15%; right: 15%; height: 2px;
  background: linear-gradient(90deg, transparent, #D4AF37 40%, #f5d77a 50%, #D4AF37 60%, transparent);
  border-radius: 1px;
}
.finale-eyebrow { font-size: 0.7rem; font-weight: 700; letter-spacing: 5px; color: #D4AF37; opacity: 0.5; margin: 0 0 10px; }
.finale-name    { font-size: 2.8rem; font-weight: 900; margin: 0 0 8px; line-height: 1.1; }
.finale-title-text { font-size: 0.95rem; color: #D4AF37; letter-spacing: 1.5px; margin: 0 0 20px; }
.finale-divider {
  display: flex; align-items: center; gap: 12px; margin-bottom: 20px;
  color: #D4AF37; font-size: 0.5rem; opacity: 0.3;
}
.finale-divider::before, .finale-divider::after {
  content: ''; flex: 1; height: 1px;
  background: linear-gradient(90deg, transparent, rgba(212,175,55,0.3));
}
.finale-divider::after { background: linear-gradient(90deg, rgba(212,175,55,0.3), transparent); }
.finale-stats { display: flex; align-items: center; }
.fs-cell { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 4px; }
.fs-div  { width: 1px; height: 36px; background: rgba(255,255,255,0.06); }
.fs-num  { font-size: 1.5rem; font-weight: 800; color: #fff; }
.fs-label{ font-size: 0.6rem; color: #555; font-weight: 700; letter-spacing: 2.5px; }

/* ── 頁碼點點 ── */
.page-dots {
  position: relative; z-index: 20; flex-shrink: 0;
  display: flex; justify-content: center; align-items: center; gap: 8px;
  padding: 10px 0;
}
.dot {
  width: 6px; height: 6px; border-radius: 3px;
  background: #222; transition: width 0.3s ease, background 0.3s ease;
}
.dot.active { width: 22px; background: #D4AF37; }

/* ── Footer ── */
.tv-footer {
  position: relative; z-index: 20; flex-shrink: 0;
  display: flex; align-items: center; gap: 12px;
  padding: 10px 56px;
  border-top: 1px solid rgba(255,255,255,0.03);
  background: rgba(6,6,6,0.6); backdrop-filter: blur(10px);
}
.footer-session { font-size: 0.62rem; color: #1e1e1e; font-family: monospace; letter-spacing: 2px; }
.footer-dot-sep { flex: 1; height: 1px; background: linear-gradient(90deg, rgba(255,255,255,0.02), transparent); }
.footer-status { font-size: 0.68rem; letter-spacing: 2px; }
.footer-status.waiting { color: #2a2a2a; }
.footer-status.show    { color: #555; }

/* ── 通用動畫 ── */
@keyframes fade-up {
  from { opacity: 0; transform: translateY(22px); }
  to   { opacity: 1; transform: translateY(0); }
}

/* ── Phase 切換（waiting ↔ show）── */
.phase-fade-enter-active { transition: opacity 0.5s ease; }
.phase-fade-leave-active { transition: opacity 0.3s ease; }
.phase-fade-enter-from, .phase-fade-leave-to { opacity: 0; }

/* ── 頁面容器 ── */
.page-root { overflow: hidden; position: relative; }
.page-slide-inner {
  position: absolute; inset: 0;
  display: flex; align-items: center; justify-content: center;
}

/* ── 廣告：圖片全版 ── */
.ad-image {
  position: absolute; inset: 0; width: 100%; height: 100%;
  object-fit: contain; z-index: 0; background: #000;
}

/* ── 廣告：文字卡 ──
   字級都跟著畫面大小走（vmin = 長寬較短的那邊），電視、直立螢幕、筆電都不會爆版 */
.ad-text-slide {
  position: absolute; inset: 0; z-index: 0;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 3.5vmin; padding: 8vmin 7vw; box-sizing: border-box;
  background: radial-gradient(ellipse 70% 60% at 50% 50%, rgba(10,10,10,0.95), #000);
}
.ad-text-deco { font-size: 2.4vmin; opacity: 0.6; animation: fade-up 0.5s ease both; }
.ad-text-title {
  font-size: clamp(2rem, 9vmin, 7.5rem); font-weight: 900; text-align: center; line-height: 1.2;
  margin: 0; letter-spacing: 0.04em; max-width: 100%;
  word-break: keep-all; overflow-wrap: anywhere; /* 中文標題只在空格斷行（「雙11預售票 限時開賣中」），沒空格又太長才硬斷 */
  animation: fade-up 0.6s ease 0.15s both;
}
.ad-text-body {
  font-size: clamp(1.1rem, 3.6vmin, 3rem); color: rgba(255,255,255,0.75); text-align: center;
  max-width: min(100%, 34em); line-height: 1.7; margin: 0;
  white-space: pre-line; overflow-wrap: anywhere; text-wrap: pretty;
  animation: fade-up 0.6s ease 0.3s both;
}
.ad-text-line {
  width: 16vmin; height: 2px;
  animation: fade-up 0.5s ease 0.45s both;
}
/* 橫的螢幕：左右各留出右下角浮動 QR 的寬度，文字才不會被 QR 蓋到（左右對稱才會置中）；直立的 QR 在文字下方，不用留 */
@media (min-aspect-ratio: 1/1) {
  .ad-text-slide { padding: 6vmin calc(clamp(130px, 18vmin, 240px) + 72px); }
}

/* ── 廣告：QR 左標語 + 右 QR（直立或偏方的螢幕改上下排）── */
.ad-qr-slide {
  --qr: min(46vmin, 520px);
  position: absolute; inset: 0; z-index: 0;
  display: flex; flex-direction: row; align-items: center; justify-content: center;
  gap: 7vw; padding: 6vmin 7vw; box-sizing: border-box;
  background: radial-gradient(ellipse 80% 70% at 30% 50%, rgba(212,175,55,0.06), transparent 60%), #000;
}
.ad-qr-left {
  flex: 0 1 auto; min-width: 0; max-width: 46vw;
  display: flex; flex-direction: column; align-items: flex-start; gap: 2.4vmin;
}
.ad-qr-logo {
  height: clamp(36px, 7vmin, 90px); object-fit: contain;
  filter: drop-shadow(0 0 14px rgba(212,175,55,0.4));
  animation: fade-up 0.5s ease 0.05s both;
}
.ad-qr-eyebrow {
  font-size: clamp(0.7rem, 1.6vmin, 1.2rem); font-weight: 700; letter-spacing: 0.6em;
  color: #D4AF37; opacity: 0.6; margin: 0;
  animation: fade-up 0.5s ease 0.15s both;
}
.ad-qr-headline {
  font-size: clamp(1.8rem, 7vmin, 6rem); font-weight: 900; line-height: 1.25; margin: 0;
  color: #fff; letter-spacing: 0.03em; word-break: keep-all;
  animation: fade-up 0.6s ease 0.25s both;
}
.ad-qr-desc {
  font-size: clamp(0.95rem, 2.6vmin, 2rem); color: #aaa; letter-spacing: 0.05em; margin: 0; line-height: 1.6;
  animation: fade-up 0.5s ease 0.4s both;
}
.ad-qr-deco-line {
  width: 12vmin; height: 2px;
  background: linear-gradient(90deg, #D4AF37, transparent);
  animation: fade-up 0.5s ease 0.5s both;
}
.ad-qr-right {
  flex-shrink: 0; display: flex; flex-direction: column; align-items: center; gap: 2.4vmin;
}
.ad-qr-frame {
  position: relative; width: var(--qr); height: var(--qr);
  background: #fff; border-radius: 14px; padding: calc(var(--qr) * 0.035); box-sizing: border-box; overflow: hidden;
  box-shadow: 0 0 60px rgba(212,175,55,0.12), 0 20px 60px rgba(0,0,0,0.6);
  animation: emblem-drop 0.8s cubic-bezier(0.175, 0.885, 0.32, 1.275) 0.3s both;
}
.ad-qr-hint {
  font-size: clamp(0.85rem, 2.2vmin, 1.6rem); color: #D4AF37; letter-spacing: 0.2em; margin: 0;
  animation: fade-up 0.5s ease 0.7s both;
}
@media (max-aspect-ratio: 5/4) {
  .ad-qr-slide { --qr: min(34vh, 70vw); flex-direction: column; gap: 3vh; padding: 4vh 6vw; }
  .ad-qr-left { align-items: center; text-align: center; max-width: 100%; }
  .ad-qr-deco-line { background: linear-gradient(90deg, transparent, #D4AF37, transparent); }
}

/* ── 換頁：舊頁往上飄走，新頁從下升起 ── */
.page-slide-enter-active {
  transition:
    opacity  0.6s cubic-bezier(0.22, 1, 0.36, 1),
    transform 0.6s cubic-bezier(0.22, 1, 0.36, 1);
  transition-delay: 0.08s;
}
.page-slide-leave-active {
  position: absolute; inset: 0;           /* 脫離 flow，不推動佈局 */
  transition:
    opacity  0.45s cubic-bezier(0.55, 0, 1, 0.45),
    transform 0.45s cubic-bezier(0.55, 0, 1, 0.45);
}
.page-slide-enter-from { opacity: 0; transform: translateY(55px) scale(0.98); }
.page-slide-leave-to   { opacity: 0; transform: translateY(-40px) scale(1.01); }
</style>
