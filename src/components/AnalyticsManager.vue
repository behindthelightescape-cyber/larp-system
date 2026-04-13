<script setup>
import { ref, computed, onMounted } from 'vue'
import { supabase } from '../supabase'

// ── Info Modal ──────────────────────────────────────────────────────────────
const infoModal = ref({ show: false, title: '', desc: '' })
const openInfo = (title, desc) => { infoModal.value = { show: true, title, desc } }

const INFO = {
  total:          { title: '總會員人數',          desc: '目前系統中所有已加入的會員總數。' },
  thisMonth:      { title: '本月新增',            desc: '本月（1 日至今）新加入的會員人數。' },
  lastMonth:      { title: '上月新增',            desc: '上個整月內新加入的會員人數。' },
  delta:          { title: '月增減',              desc: '本月新增人數與上月的差值。正數代表成長，負數代表衰退。' },
  referred:       { title: '推薦入會人數',        desc: '透過推薦碼加入的會員人數，代表玩家口碑傳播的效果。' },
  referredPct:    { title: '推薦佔比',            desc: '推薦入會佔總會員的比例。比例越高，代表玩家自發推廣能力越強。' },
  lv1:            { title: 'LV.1 剛加入的冒險者', desc: '尚未累積足夠 EXP 升級的新玩家，通常代表剛報名、還在探索階段。\n\n建議：強化首場體驗與後續回流引導。' },
  lv2:            { title: 'LV.2 不怕死的探險家', desc: '已累積 100 EXP，代表至少有一定的回流意願。\n\n這群人是最有機會晉升鐵粉的族群，值得重點維護。' },
  lv3plus:        { title: 'LV.3+ 主角光環以上',  desc: '累積 250 EXP 以上的忠實玩家，是品牌最核心的支持者，也是口碑傳播主力。\n\n建議：提供專屬福利維持忠誠度。' },
  played0:        { title: '0 本（潛水）',         desc: '加入後從未實際遊玩的會員。可能是被好奇心吸引，但還沒踏出第一步。\n\n建議：透過推播或優惠券引導首場報名。' },
  played1:        { title: '1 本（嚐鮮）',         desc: '只玩過一本的玩家。已有初次體驗，但尚未形成習慣。\n\n能否從嚐鮮轉為回流，是留客的最關鍵節點。' },
  played2_3:      { title: '2–3 本（回流）',       desc: '玩過 2 到 3 本，已展現回流意願，對 LARP 有基本認同感。\n\n此時建議提供成就、稱號等讓他有動力繼續。' },
  played4_5:      { title: '4–5 本（常客）',       desc: '玩過 4 到 5 本的穩定常客，黏著度高，是品牌口碑的重要支撐。' },
  played6plus:    { title: '6 本以上（鐵粉）',     desc: '最忠實的核心玩家，遊玩次數多，品牌認同度最高。\n\n建議重點維護，提供專屬福利或優先報名權。' },
  active6m:       { title: '半年內來過（活躍）',   desc: '最近半年內有遊玩紀錄的玩家，是目前最健康的活躍客群。\n\n此為活躍度基準，應盡量維持或提升此數字。' },
  inactive6m_1y:  { title: '超過半年（流失風險）', desc: '上次遊玩距今 6 個月到 1 年的玩家，有流失風險。\n\n建議：透過推播或個人化優惠券主動喚回。' },
  churned1y:      { title: '超過一年（沉睡老客）', desc: '超過 1 年未遊玩，已屬高流失群。可嘗試針對性的回歸活動，但喚回成本較高。' },
  churnSection:   { title: '退坑劇本警報（流失率）', desc: '流失率 = 以此劇本為最後遊玩紀錄、且超過半年未回流的玩家佔比。\n\n流失率高不代表劇本差，也可能是客群特性或時間點問題，需搭配評分等其他指標綜合判斷。\n\n僅統計總遊玩人次 > 20 之劇本，避免樣本偏差。' },
  scriptRank:     { title: '劇本搖錢樹排行榜',     desc: '以累計遊玩人次排名的熱門度排行。人次越高代表吸引力越強、帶客能力越好。\n\n已排除私團場次，僅統計公開場，數據較具參考性。' },
}

const isLoaded = ref(false)
const totalUsers = ref(0)
const levelStats = ref({ lv1: 0, lv2: 0, lv3: 0, lv4: 0, lv5: 0, lv6: 0 })
const analyticsStats = ref({ played_0: 0, played_1: 0, played_2_3: 0, played_4_5: 0, played_6_plus: 0 })
const recencyStats = ref({ active_6m: 0, inactive_6m_1y: 0, churned_1y_plus: 0 })
const growthStats = ref({ thisMonth: 0, lastMonth: 0 })
const referralCount = ref(0)
const allScriptsPop = ref([])
const churnScripts = ref([])
const archivedTitles = ref(new Set())
const hideArchived = ref(false)
const scriptSearch = ref('')
const isScriptListOpen = ref(true)

// 百分比字串，基數為總會員
const getPctStr = (num, base) => {
  const b = base ?? totalUsers.value
  if (!b) return '0%'
  return ((num / b) * 100).toFixed(1) + '%'
}

// 進度條寬度，回傳 0–100 數字
const barWidth = (num, base) => {
  const b = base ?? totalUsers.value
  if (!b) return 0
  return Math.min((num / b) * 100, 100)
}

const recencyTotal = computed(() =>
  recencyStats.value.active_6m + recencyStats.value.inactive_6m_1y + recencyStats.value.churned_1y_plus
)

const scriptMaxCount = computed(() =>
  allScriptsPop.value.length ? allScriptsPop.value[0].play_count : 1
)

const visibleScriptsPop = computed(() =>
  hideArchived.value ? allScriptsPop.value.filter(s => !archivedTitles.value.has(s.script_name)) : allScriptsPop.value
)
const visibleChurnScripts = computed(() =>
  hideArchived.value ? churnScripts.value.filter(s => !archivedTitles.value.has(s.final_script)) : churnScripts.value
)
const filteredScripts = computed(() => {
  if (!scriptSearch.value) return visibleScriptsPop.value
  return visibleScriptsPop.value.filter(s =>
    s.script_name.toLowerCase().includes(scriptSearch.value.toLowerCase())
  )
})

const growthDelta = computed(() => {
  const d = growthStats.value.thisMonth - growthStats.value.lastMonth
  return { val: d, up: d >= 0 }
})

onMounted(async () => {
  await loadAnalytics()
})

const loadAnalytics = async () => {
  isLoaded.value = false
  try {
    const now = new Date()
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString()

    const realUsers = () => supabase.from('users').select('*', { count: 'exact', head: true }).not('id', 'ilike', 'DUMMY_%')

    const [
      { count: total },
      { count: lv1 },
      { count: lv2 },
      { count: lv3 },
      { count: lv4 },
      { count: lv5 },
      { count: lv6 },
      { count: thisMonth },
      { count: lastMonth },
      { count: referred },
      { data: playData },
      { data: recencyData },
      { data: scriptData },
      { data: churnData },
      { data: archivedData },
    ] = await Promise.all([
      realUsers(),
      realUsers().eq('level', 1),
      realUsers().eq('level', 2),
      realUsers().eq('level', 3),
      realUsers().eq('level', 4),
      realUsers().eq('level', 5),
      realUsers().eq('level', 6),
      realUsers().gte('created_at', thisMonthStart),
      realUsers().gte('created_at', lastMonthStart).lt('created_at', thisMonthStart),
      realUsers().not('referred_by', 'is', null),
      supabase.from('player_analytics').select('*').single(),
      supabase.from('player_recency_analytics').select('*').single(),
      supabase.from('script_popularity_analytics').select('*'),
      supabase.from('churn_script_analytics').select('*').limit(10),
      supabase.from('scripts').select('title').eq('is_archived', true),
    ])

    archivedTitles.value = new Set((archivedData || []).map(s => s.title))

    totalUsers.value = total || 0
    levelStats.value = { lv1: lv1 || 0, lv2: lv2 || 0, lv3: lv3 || 0, lv4: lv4 || 0, lv5: lv5 || 0, lv6: lv6 || 0 }
    growthStats.value = { thisMonth: thisMonth || 0, lastMonth: lastMonth || 0 }
    referralCount.value = referred || 0
    if (playData) analyticsStats.value = playData
    if (recencyData) recencyStats.value = {
      active_6m:      recencyData.active_6m      || 0,
      inactive_6m_1y: recencyData.inactive_6m_1y || 0,
      churned_1y_plus: recencyData.churned_1y_plus || 0,
    }
    if (scriptData) allScriptsPop.value = scriptData
    if (churnData) churnScripts.value = churnData

  } catch (error) {
    console.error('深度分析讀取失敗', error)
  } finally {
    isLoaded.value = true
  }
}
</script>

<template>
  <div class="analytics-container">
    <div v-if="!isLoaded" class="loading-overlay">
      <div class="spinner"></div>
      <p style="color:#D4AF37; margin-top:10px;">大數據雲端運算中...</p>
    </div>

    <div v-else class="sections">

      <!-- 成長概況 -->
      <div class="section-card">
        <h4 class="section-title">成長概況</h4>
        <div class="growth-grid">
          <div class="growth-item" @click="openInfo(INFO.total.title, INFO.total.desc)">
            <div class="growth-val">{{ totalUsers.toLocaleString() }}</div>
            <div class="growth-label">總會員人數 <span class="info-icon">ⓘ</span></div>
          </div>
          <div class="growth-item" @click="openInfo(INFO.thisMonth.title, INFO.thisMonth.desc)">
            <div class="growth-val" style="color:#2ecc71;">+{{ growthStats.thisMonth }}</div>
            <div class="growth-label">本月新增 <span class="info-icon">ⓘ</span></div>
          </div>
          <div class="growth-item" @click="openInfo(INFO.lastMonth.title, INFO.lastMonth.desc)">
            <div class="growth-val" style="color:#888;">+{{ growthStats.lastMonth }}</div>
            <div class="growth-label">上月新增 <span class="info-icon">ⓘ</span></div>
          </div>
          <div class="growth-item" @click="openInfo(INFO.delta.title, INFO.delta.desc)">
            <div class="growth-val" :style="{ color: growthDelta.up ? '#2ecc71' : '#e74c3c' }">
              {{ growthDelta.up ? '+' : '' }}{{ growthDelta.val }}
            </div>
            <div class="growth-label">月增減 <span class="info-icon">ⓘ</span></div>
          </div>
          <div class="growth-item" @click="openInfo(INFO.referred.title, INFO.referred.desc)">
            <div class="growth-val" style="color:#D4AF37;">{{ referralCount.toLocaleString() }}</div>
            <div class="growth-label">推薦入會 <span class="info-icon">ⓘ</span></div>
          </div>
          <div class="growth-item" @click="openInfo(INFO.referredPct.title, INFO.referredPct.desc)">
            <div class="growth-val" style="color:#D4AF37;">{{ getPctStr(referralCount) }}</div>
            <div class="growth-label">推薦佔比 <span class="info-icon">ⓘ</span></div>
          </div>
        </div>
      </div>

      <!-- 玩家階級分佈 -->
      <div class="section-card">
        <h4 class="section-title">玩家階級分佈 <span class="base-text">基數 {{ totalUsers }} 人</span></h4>
        <div class="level-grid-6">
          <div v-for="row in [
            { lv: 1, key: 'lv1', name: '剛加入的冒險者', exp: '0–99',   color: '#95a5a6' },
            { lv: 2, key: 'lv2', name: '不怕死的探險家', exp: '100–249',  color: '#3498db' },
            { lv: 3, key: 'lv3', name: '主角光環的勇者', exp: '250–499',  color: '#2ecc71' },
            { lv: 4, key: 'lv4', name: '平行宇宙開拓家', exp: '500–999',  color: '#9b59b6' },
            { lv: 5, key: 'lv5', name: '穿越時空成癮者', exp: '1000–2499',color: '#e67e22' },
            { lv: 6, key: 'lv6', name: '陽光開朗小萌新', exp: '2500+',    color: '#D4AF37' },
          ]" :key="row.lv" class="level-card">
            <div class="lv-badge" :style="{ background: row.color + '22', color: row.color, border: '1px solid ' + row.color + '66' }">LV.{{ row.lv }}</div>
            <div class="lv-name">{{ row.name }}</div>
            <div class="lv-exp">EXP {{ row.exp }}</div>
            <div class="lv-count" :style="{ color: row.color }">{{ levelStats[row.key] }}<span class="unit">人</span></div>
            <div class="lv-bar-track"><div class="lv-bar-fill" :style="{ width: barWidth(levelStats[row.key]) + '%', background: row.color }"></div></div>
            <div class="lv-pct" :style="{ color: row.color }">{{ getPctStr(levelStats[row.key]) }}</div>
          </div>
        </div>
      </div>

      <!-- 黏著度 + 活躍度 -->
      <div class="two-col-grid">
        <div class="section-card">
          <h4 class="section-title" style="border-left-color:#2ecc71; color:#2ecc71;">黏著度（遊玩本數）</h4>
          <div class="bar-list">
            <div class="bar-row" v-for="row in [
              { label: '0 本（潛水）',     val: analyticsStats.played_0,                                   color: '#555',    info: INFO.played0 },
              { label: '1 本（嚐鮮）',     val: analyticsStats.played_1,                                   color: '#f1c40f', info: INFO.played1 },
              { label: '2–3 本（回流）',   val: analyticsStats.played_2_to_3 || analyticsStats.played_2_3, color: '#2ecc71', info: INFO.played2_3 },
              { label: '4–5 本（常客）',   val: analyticsStats.played_4_to_5 || analyticsStats.played_4_5, color: '#3498db', info: INFO.played4_5 },
              { label: '6 本以上（鐵粉）', val: analyticsStats.played_6_plus,                              color: '#e67e22', info: INFO.played6plus },
            ]" :key="row.label" style="cursor:pointer;" @click="openInfo(row.info.title, row.info.desc)">
              <div class="bar-label">{{ row.label }} <span class="info-icon">ⓘ</span></div>
              <div class="bar-track">
                <div class="bar-fill" :style="{ width: barWidth(row.val) + '%', background: row.color }"></div>
              </div>
              <div class="bar-stat" :style="{ color: row.color }">
                {{ row.val }} 人
                <span class="bar-pct">{{ getPctStr(row.val) }}</span>
              </div>
            </div>
          </div>
        </div>

        <div class="section-card">
          <h4 class="section-title" style="border-left-color:#e74c3c; color:#e74c3c;">活躍度（最後遊玩時間）</h4>
          <div class="bar-list">
            <div class="bar-row" v-for="row in [
              { label: '半年內來過（活躍）',   val: recencyStats.active_6m,       color: '#2ecc71', info: INFO.active6m },
              { label: '超過半年（流失風險）', val: recencyStats.inactive_6m_1y,  color: '#f1c40f', info: INFO.inactive6m_1y },
              { label: '超過一年（沉睡老客）', val: recencyStats.churned_1y_plus, color: '#e74c3c', info: INFO.churned1y },
            ]" :key="row.label" style="cursor:pointer;" @click="openInfo(row.info.title, row.info.desc)">
              <div class="bar-label">{{ row.label }} <span class="info-icon">ⓘ</span></div>
              <div class="bar-track">
                <div class="bar-fill" :style="{ width: barWidth(row.val, recencyTotal) + '%', background: row.color }"></div>
              </div>
              <div class="bar-stat" :style="{ color: row.color }">
                {{ row.val }} 人
                <span class="bar-pct">{{ getPctStr(row.val, recencyTotal) }}</span>
              </div>
            </div>
          </div>
          <div class="sub-note">* 僅統計有遊玩紀錄之玩家，基數 {{ recencyTotal }} 人</div>
        </div>
      </div>

      <!-- 退坑劇本警報 -->
      <div class="section-card churn-card">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0;">
          <h4 class="section-title" style="border-left-color:#e74c3c; color:#e74c3c; margin-bottom:0;">
            潛在退坑劇本警報（流失率排行）
            <button class="info-btn" @click.stop="openInfo(INFO.churnSection.title, INFO.churnSection.desc)">ⓘ</button>
          </h4>
          <button class="filter-archived-btn" :class="{ active: hideArchived }" @click="hideArchived = !hideArchived">
            {{ hideArchived ? '已隱藏下架劇本' : '含下架劇本' }}
          </button>
        </div>
        <p class="sub-note" style="margin-bottom:15px;">流失率高代表多數玩家玩完後超過半年未回流。僅統計總遊玩人次 &gt; 20 之劇本。</p>

        <div class="script-list">
          <div class="script-row header" style="background:#2a1111; color:#e74c3c; border-bottom-color:#442222;">
            <span class="rank-col">警報</span>
            <span class="name-col">最後遊玩劇本</span>
            <span class="churn-col">流失率</span>
            <span class="count-col">人數比</span>
          </div>
          <div v-for="(script, idx) in visibleChurnScripts" :key="idx" class="script-row" style="border-bottom-color:#331111;">
            <span class="rank-col">
              <span v-if="idx === 0" style="font-size:1.2rem;">🚨</span>
              <span v-else class="rank-num" style="color:#e74c3c;">{{ idx + 1 }}</span>
            </span>
            <span class="name-col" style="color:#ddd;">{{ script.final_script }}</span>
            <span class="churn-col">
              <div class="churn-bar-track">
                <div class="churn-bar-fill" :style="{ width: Math.min(script.churn_rate, 100) + '%' }"></div>
              </div>
              <span style="color:#e74c3c; font-weight:bold; font-size:0.95rem;">{{ script.churn_rate }}%</span>
            </span>
            <span class="count-col" style="color:#888; font-size:0.82rem;">{{ script.drop_off_count }} / {{ script.total_plays }}</span>
          </div>
          <div v-if="visibleChurnScripts.length === 0" class="empty-text">目前沒有明顯的退坑劇本，太棒了！</div>
        </div>
      </div>

      <!-- 劇本排行榜 -->
      <div class="section-card">
        <div class="rank-header" @click="isScriptListOpen = !isScriptListOpen">
          <h4 class="section-title" style="border-left-color:#9b59b6; color:#9b59b6; margin:0;">
            劇本搖錢樹排行榜（排除私團）
            <button class="info-btn" @click.stop="openInfo(INFO.scriptRank.title, INFO.scriptRank.desc)">ⓘ</button>
          </h4>
          <span class="toggle-icon">{{ isScriptListOpen ? '▲ 收起' : '▼ 展開' }}</span>
        </div>

        <transition name="fade-slide">
          <div v-if="isScriptListOpen" class="rank-content">
            <input v-model="scriptSearch" type="text" class="search-box" placeholder="搜尋劇本名稱...">
            <div class="script-rank-list">
              <div v-for="(script, idx) in filteredScripts" :key="idx" class="rank-row">
                <div class="rank-medal">
                  <span v-if="idx === 0">🥇</span>
                  <span v-else-if="idx === 1">🥈</span>
                  <span v-else-if="idx === 2">🥉</span>
                  <span v-else class="rank-num">{{ idx + 1 }}</span>
                </div>
                <div class="rank-name">{{ script.script_name }}</div>
                <div class="rank-bar-wrap">
                  <div class="rank-bar-track">
                    <div
                      class="rank-bar-fill"
                      :style="{ width: (script.play_count / scriptMaxCount * 100) + '%' }"
                    ></div>
                  </div>
                </div>
                <div class="rank-count">{{ script.play_count }}<span style="color:#666; font-size:0.78rem; margin-left:3px;">次</span></div>
              </div>
              <div v-if="filteredScripts.length === 0" class="empty-text">找不到「{{ scriptSearch }}」</div>
            </div>
          </div>
        </transition>
      </div>

      <button class="btn-refresh" @click="loadAnalytics">重新整理分析</button>
    </div>

    <!-- Info Modal -->
    <Teleport to="body">
      <div v-if="infoModal.show" class="info-overlay" @click.self="infoModal.show = false">
        <div class="info-modal">
          <button class="info-close" @click="infoModal.show = false">✕</button>
          <div class="info-modal-title">{{ infoModal.title }}</div>
          <div class="info-modal-desc">{{ infoModal.desc }}</div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.analytics-container { font-family: 'Segoe UI', sans-serif; }
.sections { display: flex; flex-direction: column; gap: 20px; }

/* 共用卡片 */
.section-card { background: #151515; padding: 24px; border-radius: 12px; border: 1px solid #2a2a2a; }
.section-title {
  margin: 0 0 18px 0;
  border-left: 4px solid #D4AF37; padding-left: 10px;
  color: #D4AF37; font-size: 0.95rem; font-weight: 700;
  letter-spacing: 0.5px; display: flex; align-items: baseline; gap: 8px;
}
.base-text { font-size: 0.78rem; color: #555; font-weight: normal; }
.sub-note { font-size: 0.78rem; color: #555; margin-top: 12px; }

/* 成長概況 */
.growth-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(110px, 1fr));
  gap: 12px;
}
.growth-item {
  background: #111; border: 1px solid #222; border-radius: 8px;
  padding: 14px 10px; text-align: center;
}
.growth-val { font-size: 1.6rem; font-weight: 900; color: #fff; line-height: 1; }
.growth-label { font-size: 0.72rem; color: #666; margin-top: 6px; }

/* 等級分佈 */
.level-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 14px; }
.level-card {
  background: #111; padding: 18px 16px; border-radius: 8px;
  border: 1px solid #222; display: flex; flex-direction: column; align-items: center; text-align: center;
}
.lv-badge { padding: 3px 12px; border-radius: 20px; font-weight: bold; font-size: 0.85rem; margin-bottom: 8px; color: #000; }
.lv1 { background: #95a5a6; }
.lv2 { background: #3498db; color: #fff; }
.lv3 { background: linear-gradient(135deg, #fcca30, #D4AF37); }
.lv-name { color: #666; font-size: 0.78rem; margin-bottom: 10px; }
.lv-count { font-size: 2rem; font-weight: 900; color: #fff; line-height: 1; }
.lv-count .unit { font-size: 0.85rem; color: #555; font-weight: normal; margin-left: 3px; }
.lv-bar-track { width: 100%; height: 4px; background: #222; border-radius: 2px; margin: 10px 0 6px; }
.lv-bar-fill { height: 100%; border-radius: 2px; transition: width 0.6s ease; }
.lv-pct { font-size: 0.85rem; color: #aaa; font-weight: bold; }
.lv-exp { font-size: 0.7rem; color: #444; margin-bottom: 8px; }
.level-grid-6 { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px; }
.card-info-hint { display: none; }

/* 兩欄 */
.two-col-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }

/* 進度條列表 */
.bar-list { display: flex; flex-direction: column; gap: 12px; }
.bar-row { display: grid; grid-template-columns: 150px 1fr 80px; align-items: center; gap: 10px; }
.bar-label { font-size: 0.82rem; color: #ccc; white-space: nowrap; }
.bar-track { height: 8px; background: #222; border-radius: 4px; overflow: hidden; }
.bar-fill { height: 100%; border-radius: 4px; transition: width 0.6s ease; }
.bar-stat { font-size: 0.85rem; font-weight: bold; text-align: right; white-space: nowrap; }
.bar-pct { font-size: 0.72rem; background: #222; padding: 1px 6px; border-radius: 8px; color: #888; margin-left: 4px; }

/* 退坑警報 */
.churn-card { border-color: #3a1a1a; background: #1a0f0f; }
.script-list { border: 1px solid #333; border-radius: 8px; background: #111; overflow: hidden; max-height: 320px; overflow-y: auto; }
.script-row { display: flex; padding: 10px 14px; border-bottom: 1px solid #222; align-items: center; gap: 8px; }
.script-row:last-child { border-bottom: none; }
.script-row.header { background: #1a1a1a; font-weight: bold; color: #888; position: sticky; top: 0; z-index: 2; border-bottom: 2px solid #333; font-size: 0.8rem; }
.rank-col { width: 44px; text-align: center; flex-shrink: 0; }
.name-col { flex: 1; font-size: 0.88rem; }
.churn-col { width: 130px; display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
.count-col { width: 70px; text-align: right; flex-shrink: 0; }
.churn-bar-track { flex: 1; height: 6px; background: #222; border-radius: 3px; overflow: hidden; }
.churn-bar-fill { height: 100%; background: #e74c3c; border-radius: 3px; transition: width 0.6s ease; }
.rank-num { color: #555; font-family: monospace; font-size: 1rem; }
.empty-text { padding: 24px; text-align: center; color: #555; font-size: 0.88rem; }

/* 劇本排行榜 */
.rank-header { display: flex; justify-content: space-between; align-items: center; cursor: pointer; }
.toggle-icon { color: #666; font-size: 0.82rem; }
.rank-content { margin-top: 18px; }
.search-box {
  width: 100%; padding: 10px 14px; background: #1a1a1a;
  border: 1px solid #333; color: #ddd; border-radius: 8px;
  font-size: 0.9rem; margin-bottom: 14px; box-sizing: border-box;
}
.search-box:focus { border-color: #9b59b6; outline: none; }
.script-rank-list { display: flex; flex-direction: column; gap: 6px; max-height: 480px; overflow-y: auto; }
.rank-row { display: grid; grid-template-columns: 44px 1fr 1fr 56px; align-items: center; gap: 10px; padding: 8px 4px; border-bottom: 1px solid #1e1e1e; }
.rank-row:last-child { border-bottom: none; }
.rank-medal { text-align: center; font-size: 1.1rem; }
.rank-name { font-size: 0.88rem; color: #ddd; }
.rank-bar-wrap { display: flex; align-items: center; }
.rank-bar-track { flex: 1; height: 6px; background: #222; border-radius: 3px; overflow: hidden; }
.rank-bar-fill { height: 100%; background: linear-gradient(90deg, #6c3483, #9b59b6); border-radius: 3px; transition: width 0.6s ease; }
.rank-count { text-align: right; font-weight: bold; color: #9b59b6; font-size: 1rem; }

/* Info 互動 */
.info-icon { font-size: 0.72rem; color: #555; cursor: pointer; margin-left: 4px; transition: color 0.2s; }
.info-icon:hover { color: #D4AF37; }
.info-btn {
  background: none; border: 1px solid #444; color: #555;
  border-radius: 50%; width: 20px; height: 20px; font-size: 0.7rem;
  cursor: pointer; display: inline-flex; align-items: center; justify-content: center;
  margin-left: 8px; flex-shrink: 0; transition: 0.2s; line-height: 1;
}
.info-btn:hover { border-color: #D4AF37; color: #D4AF37; }
.card-info-hint { font-size: 0.68rem; color: #444; margin-top: 8px; }
.growth-item { cursor: pointer; transition: border-color 0.2s; }
.growth-item:hover { border-color: #D4AF37; }
.level-card { cursor: pointer; transition: border-color 0.2s; }
.level-card:hover { border-color: #555; }

/* Info Modal */
.info-overlay {
  position: fixed; inset: 0; background: rgba(0,0,0,0.75);
  display: flex; justify-content: center; align-items: center;
  z-index: 10000; backdrop-filter: blur(4px);
}
.info-modal {
  background: #1a1a1a; border: 1px solid #333; border-radius: 14px;
  padding: 28px 28px 24px; max-width: 420px; width: 90%;
  position: relative; box-shadow: 0 10px 40px rgba(0,0,0,0.8);
}
.info-close {
  position: absolute; top: 14px; right: 14px;
  background: transparent; border: 1px solid #444; color: #888;
  width: 28px; height: 28px; border-radius: 50%; cursor: pointer;
  font-size: 0.85rem; display: flex; align-items: center; justify-content: center;
  transition: 0.2s;
}
.info-close:hover { background: #333; color: #fff; border-color: #D4AF37; }
.info-modal-title { color: #D4AF37; font-size: 1rem; font-weight: bold; margin-bottom: 14px; padding-right: 20px; }
.info-modal-desc { color: #bbb; font-size: 0.88rem; line-height: 1.8; white-space: pre-line; }

/* 篩選按鈕 */
.filter-archived-btn {
  background: transparent; border: 1px solid #444; color: #666;
  border-radius: 6px; padding: 5px 12px; font-size: 0.78rem;
  cursor: pointer; transition: 0.2s; white-space: nowrap; flex-shrink: 0;
}
.filter-archived-btn:hover { border-color: #888; color: #aaa; }
.filter-archived-btn.active { border-color: #D4AF37; color: #D4AF37; background: rgba(212,175,55,0.08); }

/* 按鈕 */
.btn-refresh {
  align-self: flex-start; background: #D4AF37; color: #000; border: none;
  border-radius: 8px; padding: 10px 22px; font-weight: bold;
  font-size: 0.9rem; cursor: pointer; transition: 0.2s;
}
.btn-refresh:hover { background: #e5c358; }

/* 動畫 */
.fade-slide-enter-active, .fade-slide-leave-active { transition: all 0.25s ease; }
.fade-slide-enter-from, .fade-slide-leave-to { opacity: 0; transform: translateY(-8px); }

/* Loading */
.loading-overlay { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 60px; }
.spinner { width: 40px; height: 40px; border: 4px solid rgba(212,175,55,0.2); border-top-color: #D4AF37; border-radius: 50%; animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

@media (max-width: 768px) {
  .two-col-grid { grid-template-columns: 1fr; }
  .bar-row { grid-template-columns: 1fr 1fr; grid-template-rows: auto auto; }
  .bar-label { grid-column: 1 / 3; }
  .rank-row { grid-template-columns: 36px 1fr 48px; }
  .rank-bar-wrap { display: none; }
}
</style>
