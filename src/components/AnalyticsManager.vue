<script setup>
import { ref, computed, onMounted } from 'vue'
import { supabase } from '../supabase'

const isLoaded = ref(false)
const totalUsers = ref(0) 

const levelStats = ref({ lv1: 0, lv2: 0, lv3Plus: 0 })
const analyticsStats = ref({
  played_0: 0, played_1: 0, played_2_3: 0, played_4_5: 0, played_6_plus: 0
})

// 🚀 新增：活躍度與劇本排行榜狀態
const recencyStats = ref({ active_6m: 0, inactive_6m_1y: 0, churned_1y_plus: 0 })
const allScriptsPop = ref([])
const scriptSearch = ref('')
const isScriptListOpen = ref(false)

// 🚀 計算百分比的小工具
const getPercent = (num) => {
  if (totalUsers.value === 0) return '0%'
  return ((num / totalUsers.value) * 100).toFixed(1) + '%'
}

// 🚀 劇本排行榜搜尋過濾器
const filteredScripts = computed(() => {
  if (!scriptSearch.value) return allScriptsPop.value
  return allScriptsPop.value.filter(s => 
    s.script_name.toLowerCase().includes(scriptSearch.value.toLowerCase())
  )
})

onMounted(async () => {
  await loadAnalytics()
})

const loadAnalytics = async () => {
  isLoaded.value = false
  try {
    // 1. 總人數
    const { count } = await supabase.from('users').select('*', { count: 'exact', head: true })
    totalUsers.value = count || 0

    // 2. 算等級
    const { count: lv1 } = await supabase.from('users').select('*', { count: 'exact', head: true }).eq('level', 1)
    const { count: lv2 } = await supabase.from('users').select('*', { count: 'exact', head: true }).eq('level', 2)
    const { count: lv3 } = await supabase.from('users').select('*', { count: 'exact', head: true }).gte('level', 3)
    levelStats.value = { lv1: lv1 || 0, lv2: lv2 || 0, lv3Plus: lv3 || 0 }

    // 3. 算漏斗
    const { data: playData } = await supabase.from('player_analytics').select('*').single()
    if (playData) analyticsStats.value = playData

    // 4. 🚀 算活躍度 (最後遊玩時間)
    const { data: recencyData } = await supabase.from('player_recency_analytics').select('*').single()
    if (recencyData) {
      recencyStats.value = {
        active_6m: recencyData.active_6m || 0,
        inactive_6m_1y: recencyData.inactive_6m_1y || 0,
        churned_1y_plus: recencyData.churned_1y_plus || 0
      }
    }

    // 5. 🚀 抓取劇本搖錢樹排行榜
    const { data: scriptData } = await supabase.from('script_popularity_analytics').select('*')
    if (scriptData) allScriptsPop.value = scriptData

  } catch (error) {
    console.error("深度分析讀取失敗", error)
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

    <div v-else>
      <div class="level-stats-section">
        <h4 class="section-title">👑 玩家階級分佈 <span class="base-text">(基數: {{ totalUsers }} 人)</span></h4>
        <div class="level-grid">
          <div class="level-card">
            <div class="lv-badge lv1">LV.1</div>
            <div class="lv-name">新手探險家</div>
            <div class="lv-count">{{ levelStats.lv1 }} <span class="unit">人</span><div class="percent-text">{{ getPercent(levelStats.lv1) }}</div></div>
          </div>
          <div class="level-card">
            <div class="lv-badge lv2">LV.2</div>
            <div class="lv-name">資深老玩家</div>
            <div class="lv-count" style="color:#3498db;">{{ levelStats.lv2 }} <span class="unit">人</span><div class="percent-text" style="color:rgba(52, 152, 219, 0.8);">{{ getPercent(levelStats.lv2) }}</div></div>
          </div>
          <div class="level-card">
            <div class="lv-badge lv3">LV.3+</div>
            <div class="lv-name">主角光環勇者 (VVIP)</div>
            <div class="lv-count" style="color:#D4AF37;">{{ levelStats.lv3Plus }} <span class="unit">人</span><div class="percent-text" style="color:rgba(212, 175, 55, 0.8);">{{ getPercent(levelStats.lv3Plus) }}</div></div>
          </div>
        </div>
      </div>

      <div class="two-col-grid mt-4">
        <div class="level-stats-section">
          <h4 class="section-title" style="border-left-color: #2ecc71; color: #2ecc71;">🎯 黏著度 (遊玩本數)</h4>
          <div class="compact-list">
            <div class="list-row"><span class="r-label">0 本 (潛水)</span><span class="r-val">{{ analyticsStats.played_0 }} 人 <span class="r-pct">{{ getPercent(analyticsStats.played_0) }}</span></span></div>
            <div class="list-row"><span class="r-label">1 本 (嚐鮮)</span><span class="r-val">{{ analyticsStats.played_1 }} 人 <span class="r-pct">{{ getPercent(analyticsStats.played_1) }}</span></span></div>
            <div class="list-row"><span class="r-label" style="color:#2ecc71;">2~3 本 (回流)</span><span class="r-val" style="color:#2ecc71;">{{ analyticsStats.played_2_to_3 || analyticsStats.played_2_3 }} 人 <span class="r-pct">{{ getPercent(analyticsStats.played_2_to_3 || analyticsStats.played_2_3) }}</span></span></div>
            <div class="list-row"><span class="r-label" style="color:#3498db;">4~5 本 (常客)</span><span class="r-val" style="color:#3498db;">{{ analyticsStats.played_4_to_5 || analyticsStats.played_4_5 }} 人 <span class="r-pct">{{ getPercent(analyticsStats.played_4_to_5 || analyticsStats.played_4_5) }}</span></span></div>
            <div class="list-row"><span class="r-label" style="color:#e67e22; font-weight:bold;">6 本以上 (鐵粉)</span><span class="r-val" style="color:#e67e22;">{{ analyticsStats.played_6_plus }} 人 <span class="r-pct">{{ getPercent(analyticsStats.played_6_plus) }}</span></span></div>
          </div>
        </div>

        <div class="level-stats-section">
          <h4 class="section-title" style="border-left-color: #e74c3c; color: #e74c3c;">⏰ 活躍度 (最後遊玩時間)</h4>
          <div class="compact-list">
            <div class="list-row"><span class="r-label" style="color:#2ecc71; font-weight:bold;">🟢 半年內來過 (活躍)</span><span class="r-val" style="color:#2ecc71;">{{ recencyStats.active_6m }} 人 <span class="r-pct">{{ getPercent(recencyStats.active_6m) }}</span></span></div>
            <div class="list-row"><span class="r-label" style="color:#f1c40f;">🟡 超過半年 (流失風險)</span><span class="r-val" style="color:#f1c40f;">{{ recencyStats.inactive_6m_1y }} 人 <span class="r-pct">{{ getPercent(recencyStats.inactive_6m_1y) }}</span></span></div>
            <div class="list-row"><span class="r-label" style="color:#e74c3c;">🔴 超過一年 (沉睡老客)</span><span class="r-val" style="color:#e74c3c;">{{ recencyStats.churned_1y_plus }} 人 <span class="r-pct">{{ getPercent(recencyStats.churned_1y_plus) }}</span></span></div>
            <div style="font-size: 0.8rem; color: #666; margin-top: 15px; text-align: right;">*註：僅統計有遊玩紀錄之玩家</div>
          </div>
        </div>
      </div>

      <div class="level-stats-section mt-4">
        <div class="rank-header" @click="isScriptListOpen = !isScriptListOpen">
          <h4 class="section-title" style="border-left-color: #9b59b6; color: #9b59b6; margin: 0;">📜 劇本搖錢樹排行榜 (排除私團)</h4>
          <span class="toggle-icon">{{ isScriptListOpen ? '▲ 收起' : '▼ 點擊展開' }}</span>
        </div>
        
        <transition name="fade-slide">
          <div v-if="isScriptListOpen" class="rank-content">
            <input v-model="scriptSearch" type="text" class="admin-input search-box" placeholder="🔍 輸入劇本名稱搜尋...">
            
            <div class="script-list">
              <div class="script-row header">
                <span class="rank-col">排名</span>
                <span class="name-col">劇本名稱</span>
                <span class="count-col">累計人次</span>
              </div>
              <div v-for="(script, idx) in filteredScripts" :key="idx" class="script-row">
                <span class="rank-col">
                  <span v-if="idx === 0" class="medal gold">🥇</span>
                  <span v-else-if="idx === 1" class="medal silver">🥈</span>
                  <span v-else-if="idx === 2" class="medal bronze">🥉</span>
                  <span v-else class="rank-num">{{ idx + 1 }}</span>
                </span>
                <span class="name-col">{{ script.script_name }}</span>
                <span class="count-col highlight-num">{{ script.play_count }} <span style="font-size:0.8rem; color:#888;">次</span></span>
              </div>
              <div v-if="filteredScripts.length === 0" class="empty-text">找不到包含「{{ scriptSearch }}」的劇本</div>
            </div>
          </div>
        </transition>
      </div>

      <button class="btn btn-gold mt-4" style="width: 200px;" @click="loadAnalytics">🔄 重新整理分析</button>
    </div>
  </div>
</template>

<style scoped>
.mt-4 { margin-top: 30px; }
.level-stats-section { background: #151515; padding: 25px; border-radius: 12px; border: 1px solid #333; }
.section-title { margin-bottom: 15px; border-left: 4px solid #D4AF37; padding-left: 10px; display: flex; align-items: baseline;}
.base-text { font-size: 0.8rem; color: #888; font-weight: normal; margin-left: 10px; }

.level-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 15px; }
.level-card { background: #111; padding: 20px; border-radius: 8px; border: 1px solid #222; display: flex; flex-direction: column; align-items: center; text-align: center; }
.lv-badge { padding: 4px 12px; border-radius: 20px; font-weight: bold; font-size: 0.9rem; margin-bottom: 10px; color: #000; }
.lv1 { background: #95a5a6; }
.lv2 { background: #3498db; color: #fff; }
.lv3 { background: linear-gradient(135deg, #fcca30, #D4AF37); }
.lv-name { color: #888; font-size: 0.85rem; margin-bottom: 15px; }
.lv-count { font-size: 2.2rem; font-weight: 900; color: #fff; line-height: 1; display: flex; flex-direction: column; align-items: center; }
.lv-count .unit { font-size: 0.9rem; color: #666; font-weight: normal; margin-top: 5px; }
.percent-text { font-size: 1.1rem; font-weight: bold; margin-top: 5px; color: #aaa; background: rgba(0,0,0,0.3); padding: 2px 10px; border-radius: 12px;}

/* 🚀 兩欄式排版與清單設計 */
.two-col-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
.compact-list { display: flex; flex-direction: column; gap: 10px; }
.list-row { display: flex; justify-content: space-between; align-items: center; padding: 12px 15px; background: #1a1a1a; border-radius: 8px; border: 1px solid #222; }
.r-label { color: #ccc; font-weight: 500; }
.r-val { color: #fff; font-weight: bold; font-size: 1.1rem; display: flex; align-items: center; gap: 10px;}
.r-pct { font-size: 0.85rem; background: #333; padding: 2px 8px; border-radius: 10px; color: #aaa; }

/* 🚀 排行榜專屬設計 */
.rank-header { display: flex; justify-content: space-between; align-items: center; cursor: pointer; padding-bottom: 5px;}
.toggle-icon { color: #888; font-size: 0.9rem; }
.rank-content { margin-top: 20px; }
.admin-input.search-box { width: 100%; padding: 12px; background: #222; border: 1px solid #444; color: white; border-radius: 8px; margin-bottom: 15px; }
.admin-input.search-box:focus { border-color: #9b59b6; outline: none; }
.script-list { max-height: 400px; overflow-y: auto; border: 1px solid #333; border-radius: 8px; background: #111; }
.script-row { display: flex; padding: 12px 15px; border-bottom: 1px solid #222; align-items: center; }
.script-row:last-child { border-bottom: none; }
.script-row.header { background: #1a1a1a; font-weight: bold; color: #888; position: sticky; top: 0; z-index: 2; border-bottom: 2px solid #333;}
.rank-col { width: 60px; text-align: center; font-weight: bold; }
.name-col { flex: 1; color: #eee; font-weight: 500; padding: 0 10px; }
.count-col { width: 100px; text-align: right; }
.medal { font-size: 1.3rem; }
.rank-num { color: #666; font-family: monospace; font-size: 1.1rem; }
.highlight-num { color: #9b59b6; font-size: 1.2rem; font-weight: bold; }
.empty-text { padding: 30px; text-align: center; color: #666; }

.fade-slide-enter-active, .fade-slide-leave-active { transition: all 0.3s ease; }
.fade-slide-enter-from, .fade-slide-leave-to { opacity: 0; transform: translateY(-10px); }

.btn { padding: 12px 20px; border: none; font-weight: bold; border-radius: 8px; cursor: pointer; transition: 0.2s; }
.btn-gold { background: #D4AF37; color: black; }
.btn-gold:hover { background: #e5c358; }
.loading-overlay { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 50px; }
.spinner { width: 40px; height: 40px; border: 4px solid rgba(212, 175, 55, 0.2); border-top-color: #D4AF37; border-radius: 50%; animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

@media (max-width: 768px) {
  .two-col-grid { grid-template-columns: 1fr; }
}
</style>