<script setup>
// 電視掃碼統計：每次有人掃電視 QR 都會在 display_sessions 留一筆（掃碼時間、玩家）
import { ref, computed, onMounted } from 'vue'
import { supabase } from '../supabase'

const RANGES = [
  { days: 7, label: '近 7 天' },
  { days: 30, label: '近 30 天' },
  { days: 0, label: '全部' },
]

const days = ref(30)
const loading = ref(true)
const errorMsg = ref('')
const rows = ref([])

const load = async () => {
  loading.value = true
  errorMsg.value = ''
  const out = []
  const PAGE = 1000
  for (let from = 0; ; from += PAGE) {
    let q = supabase.from('display_sessions')
      .select('created_at, user_id, name:player_data->>name')
      .not('player_data', 'is', null)
      .order('created_at', { ascending: false }).range(from, from + PAGE - 1)
    if (days.value) q = q.gte('created_at', new Date(Date.now() - days.value * 86400_000).toISOString())
    const { data, error } = await q
    if (error) { errorMsg.value = '讀取失敗：' + error.message; break }
    out.push(...data)
    if (data.length < PAGE) break
  }
  rows.value = out
  loading.value = false
}
const setRange = (d) => { days.value = d; load() }
onMounted(load)

// 台灣時間
const tw = (iso) => new Date(new Date(iso).getTime() + 8 * 3600_000)
const dayKey = (iso) => tw(iso).toISOString().slice(0, 10)

const total = computed(() => rows.value.length)
const people = computed(() => new Set(rows.value.map(r => r.user_id)).size)
const repeatPeople = computed(() => {
  const m = {}
  for (const r of rows.value) m[r.user_id] = (m[r.user_id] || 0) + 1
  return Object.values(m).filter(n => n > 1).length
})

// 每天幾次（近 7／30 天每天都列，含 0；全部則只列有掃的日子，最多 60 天）
const byDay = computed(() => {
  const m = {}
  for (const r of rows.value) { const k = dayKey(r.created_at); m[k] = (m[k] || 0) + 1 }
  let keys
  if (days.value) {
    keys = []
    for (let i = 0; i < days.value; i++) keys.push(dayKey(new Date(Date.now() - i * 86400_000).toISOString()))
  } else {
    keys = Object.keys(m).sort().reverse().slice(0, 60)
  }
  return keys.map(k => ({ day: k, label: `${+k.slice(5, 7)}/${+k.slice(8, 10)}（${'日一二三四五六'[new Date(k).getUTCDay()]}）`, n: m[k] || 0 }))
})
const maxDay = computed(() => Math.max(1, ...byDay.value.map(d => d.n)))

// 幾點最多人掃（0～23 時）
const byHour = computed(() => {
  const h = Array(24).fill(0)
  for (const r of rows.value) h[tw(r.created_at).getUTCHours()]++
  return h
})
const maxHour = computed(() => Math.max(1, ...byHour.value))

const recent = computed(() => rows.value.slice(0, 10).map(r => {
  const t = tw(r.created_at).toISOString()
  return { when: `${+t.slice(5, 7)}/${+t.slice(8, 10)} ${t.slice(11, 16)}`, name: r.name || '冒險者' }
}))
</script>

<template>
  <div class="ds-wrap">
    <div class="ds-card">
      <div class="ds-header">
        <div>
          <h3 class="ds-title">電視掃碼次數</h3>
          <p class="ds-sub">有人掃電視上的 QR、看完自己的冒險記錄，就算一次</p>
        </div>
        <div class="ds-ranges">
          <button v-for="r in RANGES" :key="r.days" :class="['ds-range', { on: days === r.days }]" @click="setRange(r.days)">{{ r.label }}</button>
        </div>
      </div>

      <div v-if="loading" class="ds-empty">讀取中...</div>
      <div v-else-if="errorMsg" class="ds-empty ds-err">{{ errorMsg }}</div>
      <template v-else>
        <div class="ds-kpis">
          <div class="ds-kpi"><span class="ds-kpi-num">{{ total }}</span><span class="ds-kpi-label">掃碼次數</span></div>
          <div class="ds-kpi"><span class="ds-kpi-num">{{ people }}</span><span class="ds-kpi-label">不同玩家</span></div>
          <div class="ds-kpi"><span class="ds-kpi-num">{{ repeatPeople }}</span><span class="ds-kpi-label">掃過 2 次以上</span></div>
        </div>

        <div v-if="!total" class="ds-empty">這段時間還沒有人掃</div>
        <template v-else>
          <h4 class="ds-h4">幾點最多人掃</h4>
          <div class="ds-hours">
            <div v-for="(n, h) in byHour" :key="h" class="ds-hour" :title="`${h} 點：${n} 次`">
              <div class="ds-hour-bar"><div class="ds-hour-fill" :style="{ height: (n / maxHour * 100) + '%' }"></div></div>
              <span class="ds-hour-label">{{ h % 3 === 0 ? h : '' }}</span>
            </div>
          </div>

          <div class="ds-cols">
            <div>
              <h4 class="ds-h4">每天</h4>
              <div class="ds-days">
                <div v-for="d in byDay" :key="d.day" class="ds-day-row">
                  <span class="ds-day-label">{{ d.label }}</span>
                  <div class="ds-bar"><div class="ds-fill" :style="{ width: (d.n / maxDay * 100) + '%' }"></div></div>
                  <span :class="['ds-day-n', { zero: !d.n }]">{{ d.n }}</span>
                </div>
              </div>
            </div>
            <div>
              <h4 class="ds-h4">最近掃碼</h4>
              <div class="ds-recent">
                <div v-for="(r, i) in recent" :key="i" class="ds-recent-row">
                  <span class="ds-when">{{ r.when }}</span><span class="ds-name">{{ r.name }}</span>
                </div>
              </div>
            </div>
          </div>
        </template>
      </template>
    </div>
  </div>
</template>

<style scoped>
.ds-wrap { max-width: 900px; margin-top: 24px; }
.ds-card { background: #111; border: 1px solid #222; border-radius: 12px; padding: 24px; display: flex; flex-direction: column; gap: 16px; }
.ds-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; flex-wrap: wrap; }
.ds-title { margin: 0; color: #D4AF37; font-size: 1.1rem; }
.ds-sub { margin: 4px 0 0; color: #666; font-size: 0.85rem; }
.ds-ranges { display: flex; gap: 6px; }
.ds-range { background: #1a1a1a; color: #888; border: 1px solid #2a2a2a; border-radius: 6px; padding: 6px 12px; cursor: pointer; font-size: 0.85rem; }
.ds-range.on { background: #D4AF37; color: #000; border-color: #D4AF37; font-weight: bold; }
.ds-empty { color: #666; text-align: center; padding: 16px 0; }
.ds-err { color: #e57373; }

.ds-kpis { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
.ds-kpi { background: #161616; border: 1px solid #222; border-radius: 10px; padding: 14px; display: flex; flex-direction: column; gap: 4px; }
.ds-kpi-num { color: #D4AF37; font-size: 1.8rem; font-weight: bold; font-variant-numeric: tabular-nums; line-height: 1; }
.ds-kpi-label { color: #888; font-size: 0.8rem; }

.ds-h4 { margin: 8px 0 8px; color: #bbb; font-size: 0.95rem; }

.ds-hours { display: grid; grid-template-columns: repeat(24, 1fr); gap: 3px; align-items: end; }
.ds-hour { display: flex; flex-direction: column; align-items: center; gap: 4px; }
.ds-hour-bar { width: 100%; height: 70px; background: #1a1a1a; border-radius: 3px; display: flex; align-items: flex-end; overflow: hidden; }
.ds-hour-fill { width: 100%; background: #D4AF37; border-radius: 3px 3px 0 0; transition: height 0.3s; }
.ds-hour-label { color: #666; font-size: 0.7rem; height: 1em; font-variant-numeric: tabular-nums; }

.ds-cols { display: grid; grid-template-columns: 3fr 2fr; gap: 24px; }
@media (max-width: 640px) { .ds-cols { grid-template-columns: 1fr; } }
.ds-days { display: flex; flex-direction: column; gap: 5px; max-height: 360px; overflow-y: auto; padding-right: 4px; }
.ds-day-row { display: grid; grid-template-columns: 82px 1fr 32px; align-items: center; gap: 8px; }
.ds-day-label { color: #aaa; font-size: 0.8rem; font-variant-numeric: tabular-nums; }
.ds-bar { background: #1a1a1a; border-radius: 4px; height: 10px; overflow: hidden; }
.ds-fill { background: #D4AF37; height: 100%; border-radius: 4px; transition: width 0.3s; }
.ds-day-n { color: #ddd; font-size: 0.85rem; text-align: right; font-variant-numeric: tabular-nums; }
.ds-day-n.zero { color: #333; }

.ds-recent { display: flex; flex-direction: column; }
.ds-recent-row { display: flex; gap: 12px; padding: 6px 0; border-bottom: 1px solid #1a1a1a; font-size: 0.85rem; }
.ds-when { color: #777; font-variant-numeric: tabular-nums; flex-shrink: 0; }
.ds-name { color: #eee; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
