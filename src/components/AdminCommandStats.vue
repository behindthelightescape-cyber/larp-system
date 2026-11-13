<script setup>
// 燈燈指令使用次數：讀 line_command_log（召喚、名片、占卜…），依指令／群組／玩家統計
import { ref, computed, onMounted } from 'vue'
import { supabase } from '../supabase'

const COMMANDS = ['召喚', '我的名片', '占卜', '我的師門', '版規', '這車', '公車文', '指令']
const RANGES = [
  { days: 7, label: '近 7 天' },
  { days: 30, label: '近 30 天' },
  { days: 0, label: '全部' },
]

const days = ref(7)
const loading = ref(true)
const errorMsg = ref('')
const logs = ref([])
const groupNames = ref({})
const users = ref({})

const load = async () => {
  loading.value = true
  errorMsg.value = ''
  const rows = []
  const PAGE = 1000
  for (let from = 0; ; from += PAGE) {
    let q = supabase.from('line_command_log').select('command, line_user_id, group_id, used_at')
      .order('used_at', { ascending: false }).range(from, from + PAGE - 1)
    if (days.value) q = q.gte('used_at', new Date(Date.now() - days.value * 86400_000).toISOString())
    const { data, error } = await q
    if (error) { errorMsg.value = '讀取失敗：' + error.message; break }
    rows.push(...data)
    if (data.length < PAGE) break
  }
  logs.value = rows

  const gids = [...new Set(rows.map(r => r.group_id).filter(Boolean))]
  if (gids.length) {
    const { data } = await supabase.from('line_groups').select('group_id, group_name').in('group_id', gids)
    groupNames.value = Object.fromEntries((data || []).map(g => [g.group_id, g.group_name]))
  }
  const uids = [...new Set(rows.map(r => r.line_user_id).filter(Boolean))]
  if (uids.length) {
    const { data } = await supabase.from('users').select('id, display_name, legacy_id').in('id', uids.slice(0, 500))
    users.value = Object.fromEntries((data || []).map(u => [u.id, u]))
  }
  loading.value = false
}

const setRange = (d) => { days.value = d; load() }
onMounted(load)

// 每個指令的次數、人數
const byCommand = computed(() => COMMANDS.map(c => {
  const rs = logs.value.filter(r => r.command === c)
  return { command: c, count: rs.length, people: new Set(rs.map(r => r.line_user_id)).size }
}))
const maxCount = computed(() => Math.max(1, ...byCommand.value.map(x => x.count)))

// 表格：key → 各指令次數
const table = (keyOf) => {
  const m = new Map()
  for (const r of logs.value) {
    const k = keyOf(r)
    if (!m.has(k)) m.set(k, { key: k, total: 0, ...Object.fromEntries(COMMANDS.map(c => [c, 0])) })
    const row = m.get(k); row.total++; row[r.command]++
  }
  return [...m.values()].sort((a, b) => b.total - a.total)
}
const byGroup = computed(() => table(r => r.group_id || '私訊').slice(0, 20))
const byUser = computed(() => table(r => r.line_user_id || '未知').slice(0, 20))

const groupLabel = (k) => k === '私訊' ? '（私訊官方帳號）' : (groupNames.value[k] || k.slice(0, 10) + '…')
const userLabel = (k) => {
  const u = users.value[k]
  if (!u) return '非會員（' + k.slice(-6) + '）'
  return `${u.display_name || '未命名'}${u.legacy_id ? '・' + u.legacy_id : ''}`
}
</script>

<template>
  <div class="cs-wrap">
    <div class="cs-card">
      <div class="cs-header">
        <div>
          <h3 class="cs-title">燈燈指令使用次數</h3>
          <p class="cs-sub">玩家在 LINE 打指令的次數（從開始記錄後累積）</p>
        </div>
        <div class="cs-ranges">
          <button v-for="r in RANGES" :key="r.days" :class="['cs-range', { on: days === r.days }]" @click="setRange(r.days)">{{ r.label }}</button>
        </div>
      </div>

      <div v-if="loading" class="cs-empty">讀取中...</div>
      <div v-else-if="errorMsg" class="cs-empty cs-err">{{ errorMsg }}</div>
      <template v-else>
        <div class="cs-bars">
          <div v-for="x in byCommand" :key="x.command" class="cs-bar-row">
            <span class="cs-cmd">{{ x.command }}</span>
            <div class="cs-bar"><div class="cs-fill" :style="{ width: (x.count / maxCount * 100) + '%' }"></div></div>
            <span class="cs-num">{{ x.count }} 次<small>・{{ x.people }} 人</small></span>
          </div>
        </div>

        <div v-if="!logs.length" class="cs-empty">這段時間還沒有人用</div>
        <template v-else>
          <h4 class="cs-h4">依群組（前 20）</h4>
          <div class="cs-scroll">
            <table class="cs-table">
              <thead><tr><th>群組</th><th>合計</th><th v-for="c in COMMANDS" :key="c">{{ c }}</th></tr></thead>
              <tbody>
                <tr v-for="r in byGroup" :key="r.key">
                  <td class="cs-name">{{ groupLabel(r.key) }}</td><td class="cs-total">{{ r.total }}</td>
                  <td v-for="c in COMMANDS" :key="c" :class="{ zero: !r[c] }">{{ r[c] }}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <h4 class="cs-h4">依玩家（前 20）</h4>
          <div class="cs-scroll">
            <table class="cs-table">
              <thead><tr><th>玩家</th><th>合計</th><th v-for="c in COMMANDS" :key="c">{{ c }}</th></tr></thead>
              <tbody>
                <tr v-for="r in byUser" :key="r.key">
                  <td class="cs-name">{{ userLabel(r.key) }}</td><td class="cs-total">{{ r.total }}</td>
                  <td v-for="c in COMMANDS" :key="c" :class="{ zero: !r[c] }">{{ r[c] }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </template>
      </template>
    </div>
  </div>
</template>

<style scoped>
.cs-wrap { max-width: 900px; margin-top: 24px; }
.cs-card { background: #111; border: 1px solid #222; border-radius: 12px; padding: 24px; display: flex; flex-direction: column; gap: 16px; }
.cs-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; flex-wrap: wrap; }
.cs-title { margin: 0; color: #D4AF37; font-size: 1.1rem; }
.cs-sub { margin: 4px 0 0; color: #666; font-size: 0.85rem; }
.cs-ranges { display: flex; gap: 6px; }
.cs-range { background: #1a1a1a; color: #888; border: 1px solid #2a2a2a; border-radius: 6px; padding: 6px 12px; cursor: pointer; font-size: 0.85rem; }
.cs-range.on { background: #D4AF37; color: #000; border-color: #D4AF37; font-weight: bold; }
.cs-empty { color: #666; text-align: center; padding: 16px 0; }
.cs-err { color: #e57373; }

.cs-bars { display: flex; flex-direction: column; gap: 8px; }
.cs-bar-row { display: grid; grid-template-columns: 80px 1fr 110px; align-items: center; gap: 10px; }
.cs-cmd { color: #eee; font-size: 0.9rem; }
.cs-bar { background: #1a1a1a; border-radius: 4px; height: 14px; overflow: hidden; }
.cs-fill { background: #D4AF37; height: 100%; border-radius: 4px; transition: width 0.3s; }
.cs-num { color: #ddd; font-size: 0.85rem; text-align: right; font-variant-numeric: tabular-nums; }
.cs-num small { color: #777; }

.cs-h4 { margin: 8px 0 0; color: #bbb; font-size: 0.95rem; }
.cs-scroll { overflow-x: auto; }
.cs-table { width: 100%; border-collapse: collapse; font-size: 0.82rem; font-variant-numeric: tabular-nums; }
.cs-table th { color: #777; font-weight: normal; text-align: right; padding: 6px 8px; border-bottom: 1px solid #222; white-space: nowrap; }
.cs-table th:first-child { text-align: left; }
.cs-table td { color: #ddd; text-align: right; padding: 6px 8px; border-bottom: 1px solid #1a1a1a; }
.cs-table td.cs-name { text-align: left; color: #eee; max-width: 260px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cs-table td.cs-total { color: #D4AF37; font-weight: bold; }
.cs-table td.zero { color: #333; }
</style>
