<script setup>
import { ref, computed, nextTick, onMounted, onUnmounted, watch } from 'vue'
import { supabase } from '../../supabase'

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

const BRAND_LOGO    = 'https://meee.com.tw/VInVFKh.png'
const FALLBACK_BASE = 'https://meee.com.tw/hLmrwbm.png'
const DOLL_LAYER_ORDER = ['bottom', 'top', 'acc', 'hat', 'expr']

// 每頁停留毫秒數  0:登場 1:天數 2:場數 3:等級 4:EXP 5:弟子 6:總覽
const PAGE_DURATIONS = [3800, 3200, 4500, 3600, 3200, 3800, 8000]

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
const videoEl        = ref(null)
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
  if (data?.length) ads.value = data
}

const nextAd = () => {
  if (!ads.value.length) return
  currentAdIndex.value = (currentAdIndex.value + 1) % ads.value.length
}

// 靜態廣告（圖片、文字、QR）計時自動換下一支
let slideTimer = null
const clearSlideTimer = () => { if (slideTimer) { clearTimeout(slideTimer); slideTimer = null } }
const startSlideTimer = (ms) => { clearSlideTimer(); slideTimer = setTimeout(nextAd, ms) }

watch(currentAdData, (ad) => {
  clearSlideTimer()
  if (!ad) return
  if (ad.type === 'image') startSlideTimer(8000)
  else if (ad.type === 'text') startSlideTimer(7000)
  else if (ad.type === 'qr') startSlideTimer(15000)
  // video: @ended 事件處理
}, { immediate: true })

// 管理員改了播放清單，電視端即時更新
let adsChannel = null
const subscribeAds = () => {
  adsChannel = supabase.channel('display-ads-watch')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'display_ads' }, async () => {
      await loadAds()
      currentAdIndex.value = 0
    })
    .subscribe()
}

// 偵測玩家掃碼，收到對應 session 就啟動展示
let sessionChannel = null
const subscribeSession = () => {
  sessionChannel = supabase.channel('display-session-watch')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'display_sessions' },
      (payload) => {
        const row = payload.new
        if (row?.session_id === sessionId.value && row?.player_data) {
          startShow(row.player_data)
        }
      }
    )
    .subscribe()
}

// 輪詢保底（以防 Realtime 未啟用或 RLS 擋住事件）
let pollTimer = null
const startPolling = () => {
  stopPolling()
  pollTimer = setInterval(async () => {
    if (phase.value !== 'waiting') { stopPolling(); return }
    const { data } = await supabase
      .from('display_sessions')
      .select('player_data')
      .eq('session_id', sessionId.value)
      .not('player_data', 'is', null)
      .maybeSingle()
    if (data?.player_data) {
      startShow(data.player_data)
    }
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
const countUp = (target, refVal, duration = 1200) => {
  const start = Date.now()
  const tick = () => {
    const t = Math.min((Date.now() - start) / duration, 1)
    refVal.value = Math.round(target * (1 - Math.pow(1 - t, 3)))
    if (t < 1) requestAnimationFrame(tick)
    else refVal.value = target
  }
  requestAnimationFrame(tick)
}

// ── 紙娃娃載入 ──
const loadDollForUser = async (userId) => {
  dollBaseUrl.value = FALLBACK_BASE
  dollLayers.value  = {}
  dollBgStyle.value = {}

  const { data: base } = await supabase
    .from('wardrobe_bases').select('img_url')
    .eq('is_default', true).eq('is_active', true).single()
  if (base?.img_url) dollBaseUrl.value = base.img_url

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
  const layers = {}
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
  if (nextPage > 0) playPage()
  triggerPageAnimations(nextPage)
  schedulePage(nextPage)
}

const schedulePage = (page) => {
  if (page >= PAGE_DURATIONS.length) {
    // 全部播完，回到 waiting 並換新 session
    pageTimers.push(setTimeout(async () => {
      bgmFadeOut()
      phase.value = 'waiting'
      player.value = null
      currentPage.value = 0
      sessionChannel?.unsubscribe()
      await generateSession()
      subscribeSession()
      startPolling()
    }, 1000))
    return
  }
  pageTimers.push(setTimeout(() => goToPage(page + 1), PAGE_DURATIONS[page]))
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
const handleStart = () => {
  started.value = true
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
    await loadDollForUser(playerData.userId ?? null)
    displayLevel.value = displayGames.value = displayDays.value = displayExp.value = 0
    currentPage.value = 0
    phase.value = 'show'
    playArrival()
    bgmFadeIn()
    schedulePage(0)
  } catch (err) {
    console.error('startShow 失敗:', err)
    phase.value = 'waiting'
    if (ads.value.length) startSlideTimer(8000)
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
  // audio unlock 改由 handleStart 處理
  burnTimer = setInterval(() => {
    pixelShift.value = nextShift()
  }, 60000)
  await loadAds()
  subscribeAds()
  await generateSession()
  subscribeSession()
  startPolling()
  clockTimer = setInterval(() => { now.value = new Date() }, 1000)
})
onUnmounted(() => {
  clearPageTimers()
  clearSlideTimer()
  stopPolling()
  adsChannel?.unsubscribe()
  sessionChannel?.unsubscribe()
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
const expPct = computed(() =>
  player.value ? Math.min((player.value.exp / player.value.nextExp) * 100, 100) : 0
)
const displayExpPct = computed(() =>
  player.value ? Math.min((displayExp.value / player.value.nextExp) * 100, 100) : 0
)
</script>

<template>
  <div class="tv-root">
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
            :key="'v-' + currentAdData.id"
            ref="videoEl"
            class="ad-video"
            autoplay playsinline
            :src="currentAdData.resolvedUrl"
            @ended="nextAd"
          ></video>

          <!-- 🖼 圖片 -->
          <img
            v-else-if="currentAdData?.type === 'image'"
            :key="'i-' + currentAdData.id"
            class="ad-image"
            :src="currentAdData.resolvedUrl"
            :alt="currentAdData.title"
          />

          <!-- 📝 文字卡 -->
          <div
            v-else-if="currentAdData?.type === 'text'"
            :key="'t-' + currentAdData.id"
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
            :key="'q-' + currentAdData.id"
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
              <p class="ad-qr-hint">掃描以 LINE 登入</p>
            </div>
          </div>

          <!-- 空廣告 -->
          <div v-else :key="'empty'" class="ad-no-content">
            <p class="no-content-hint">尚未設定廣告</p>
            <p class="no-content-sub">請至後台新增廣告素材</p>
          </div>

        </transition>

        <!-- 影片資訊疊層 -->
        <div v-if="started && currentAdData && ads.length > 1" class="ad-progress-overlay">
          <div
            v-for="(ad, i) in ads" :key="ad.id"
            class="ad-prog-bar"
            :class="{ active: i === currentAdIndex, past: i < currentAdIndex }"
          >
            <div v-if="i === currentAdIndex" class="ad-prog-fill"></div>
          </div>
        </div>

        <!-- QR Code 浮層（右下角，QR 全版廣告時隱藏）-->
        <div v-if="started && currentAdData?.type !== 'qr'" class="qr-float">
          <div class="qr-float-inner">
            <div class="qr-float-frame">
              <div class="qr-scan-line"></div>
              <img v-if="qrDataUrl" :src="qrDataUrl" class="qr-img" alt="QR Code" />
              <div v-else class="qr-placeholder"><span>產生中...</span></div>
            </div>
            <p class="qr-float-hint">掃描以 LINE 登入</p>
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
          <p class="exp-pre">距離下一個等級</p>
          <div class="exp-display-num">
            <span class="exp-cur">{{ displayExp.toLocaleString() }}</span>
            <span class="exp-slash">/</span>
            <span class="exp-max">{{ player?.nextExp.toLocaleString() }}</span>
            <span class="exp-unit">PT</span>
          </div>
          <div class="exp-bar-outer">
            <div class="exp-bar-inner" :style="{ width: displayExpPct + '%' }"></div>
            <span class="exp-pct-label">{{ Math.round(displayExpPct) }}%</span>
          </div>
          <p class="exp-post">
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
            <p class="finale-eyebrow">SPOTLIGHT PLAYER</p>
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
        v-for="i in PAGE_DURATIONS.length" :key="i"
        class="dot" :class="{ active: currentPage === i - 1 }"
      ></div>
    </div>

    <!-- Footer -->
    <footer class="tv-footer">
      <span class="footer-session">SESSION {{ sessionId.slice(0, 8).toUpperCase() }}</span>
      <span class="footer-dot-sep"></span>
      <span class="footer-status" :class="phase === 'waiting' ? 'waiting' : 'show'">
        {{ phase === 'waiting' ? '等待玩家掃描...' : `第 ${currentPage + 1} / ${PAGE_DURATIONS.length} 頁` }}
      </span>
    </footer>

  </div>
  </div>
</template>

<style scoped>
/* ── 根 ── */
.tv-root {
  width: 100vw; height: 100vh; overflow: hidden;
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

/* 頂部影片進度條（多支影片才顯示）*/
.ad-progress-overlay {
  position: absolute; top: 0; left: 0; right: 0; z-index: 10;
  display: flex; gap: 4px; padding: 14px 16px 0;
}
.ad-prog-bar {
  flex: 1; height: 3px; border-radius: 2px;
  background: rgba(255,255,255,0.2); overflow: hidden; position: relative;
}
.ad-prog-bar.past { background: rgba(255,255,255,0.55); }
.ad-prog-fill {
  position: absolute; inset: 0; background: #fff;
  transform-origin: left; transform: scaleX(0);
  /* 動態 duration 由影片 @ended 控制，這裡用長一點的值保底 */
  animation: prog-fill 120s linear forwards;
}
@keyframes prog-fill { to { transform: scaleX(1); } }

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
  position: relative; width: 160px; height: 160px;
  background: #fff; border-radius: 10px;
  padding: 6px; box-sizing: border-box; overflow: hidden;
}
.qr-float-hint {
  font-size: 0.72rem; color: #D4AF37; letter-spacing: 1.5px; margin: 0;
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

/* ── 廣告：文字卡 ── */
.ad-text-slide {
  position: absolute; inset: 0; z-index: 0;
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 24px;
  padding: 80px;
  background: radial-gradient(ellipse 70% 60% at 50% 50%, rgba(10,10,10,0.95), #000);
}
.ad-text-deco { font-size: 1.2rem; opacity: 0.6; animation: fade-up 0.5s ease both; }
.ad-text-title {
  font-size: 4.5rem; font-weight: 900; text-align: center; line-height: 1.1;
  margin: 0; letter-spacing: 2px;
  animation: fade-up 0.6s ease 0.15s both;
}
.ad-text-body {
  font-size: 1.6rem; color: rgba(255,255,255,0.65); text-align: center;
  max-width: 800px; line-height: 1.7; margin: 0;
  animation: fade-up 0.6s ease 0.3s both;
}
.ad-text-line {
  width: 120px; height: 2px;
  animation: fade-up 0.5s ease 0.45s both;
}

/* ── 廣告：QR 左標語 + 右 QR ── */
.ad-qr-slide {
  position: absolute; inset: 0; z-index: 0;
  display: flex; flex-direction: row; align-items: center; justify-content: center;
  gap: 100px; padding: 60px 100px; box-sizing: border-box;
  background: radial-gradient(ellipse 80% 70% at 30% 50%, rgba(212,175,55,0.06), transparent 60%), #000;
}
.ad-qr-left {
  flex: 1; display: flex; flex-direction: column; align-items: flex-start; gap: 20px;
}
.ad-qr-logo {
  height: 52px; object-fit: contain;
  filter: drop-shadow(0 0 14px rgba(212,175,55,0.4));
  animation: fade-up 0.5s ease 0.05s both;
}
.ad-qr-eyebrow {
  font-size: 0.8rem; font-weight: 700; letter-spacing: 8px;
  color: #D4AF37; opacity: 0.5; margin: 0;
  animation: fade-up 0.5s ease 0.15s both;
}
.ad-qr-headline {
  font-size: 3.8rem; font-weight: 900; line-height: 1.2; margin: 0;
  color: #fff; letter-spacing: 1px;
  animation: fade-up 0.6s ease 0.25s both;
}
.ad-qr-desc {
  font-size: 1rem; color: #555; letter-spacing: 1px; margin: 0; max-width: 420px;
  animation: fade-up 0.5s ease 0.4s both;
}
.ad-qr-deco-line {
  width: 80px; height: 2px;
  background: linear-gradient(90deg, #D4AF37, transparent);
  animation: fade-up 0.5s ease 0.5s both;
}
.ad-qr-right {
  flex-shrink: 0; display: flex; flex-direction: column; align-items: center; gap: 20px;
}
.ad-qr-frame {
  position: relative; width: 280px; height: 280px;
  background: #fff; border-radius: 14px; padding: 10px; box-sizing: border-box; overflow: hidden;
  box-shadow: 0 0 60px rgba(212,175,55,0.12), 0 20px 60px rgba(0,0,0,0.6);
  animation: emblem-drop 0.8s cubic-bezier(0.175, 0.885, 0.32, 1.275) 0.3s both;
}
.ad-qr-hint {
  font-size: 0.85rem; color: #D4AF37; letter-spacing: 2px; margin: 0;
  animation: fade-up 0.5s ease 0.7s both;
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
