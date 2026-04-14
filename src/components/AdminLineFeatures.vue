<script setup>
import { ref, onMounted } from 'vue'
import { supabase } from '../supabase'

const saving = ref(false)
const loading = ref(true)
const saved = ref(false)

const FEATURES = [
  { key: 'feature_rules',  label: '版規',  desc: '新成員加入群組時自動發送版規訊息' },
  { key: 'feature_tarot',  label: '塔羅牌', desc: '開放成員在群組使用塔羅牌抽牌功能' },
  { key: 'feature_summon', label: '召喚',   desc: '開放成員使用召喚指令' },
  { key: 'feature_card',   label: '名片',   desc: '開放成員查詢或展示個人名片' },
]

const toggles = ref({})

onMounted(async () => {
  const keys = FEATURES.map(f => f.key)
  const { data } = await supabase
    .from('group_settings')
    .select('key, value')
    .in('key', keys)

  // 預設全部關閉
  keys.forEach(k => { toggles.value[k] = false })
  if (data) {
    data.forEach(row => {
      toggles.value[row.key] = row.value === 'true'
    })
  }
  loading.value = false
})

const saveAll = async () => {
  saving.value = true
  const now = new Date().toISOString()
  const rows = FEATURES.map(f => ({
    key: f.key,
    value: String(toggles.value[f.key] ?? false),
    updated_at: now,
  }))
  const { error } = await supabase.from('group_settings').upsert(rows, { onConflict: 'key' })
  if (error) {
    alert('儲存失敗：' + error.message)
  } else {
    saved.value = true
    setTimeout(() => { saved.value = false }, 2500)
  }
  saving.value = false
}
</script>

<template>
  <div class="lf-wrap">
    <div class="lf-card">
      <div class="lf-header">
        <div>
          <h3 class="lf-title">LINE 功能開關</h3>
          <p class="lf-sub">控制各項 LINE Bot 功能是否對群組開放</p>
        </div>
        <div class="lf-save-area">
          <span v-if="saved" class="lf-saved-hint">已儲存</span>
          <button class="btn-save" :disabled="saving || loading" @click="saveAll">
            {{ saving ? '儲存中...' : '儲存設定' }}
          </button>
        </div>
      </div>

      <div v-if="loading" class="lf-loading">讀取中...</div>

      <div v-else class="lf-list">
        <div v-for="feat in FEATURES" :key="feat.key" class="lf-row">
          <div class="lf-info">
            <span class="lf-label">{{ feat.label }}</span>
            <span class="lf-desc">{{ feat.desc }}</span>
          </div>
          <label class="lf-switch">
            <input type="checkbox" v-model="toggles[feat.key]" />
            <span class="lf-slider"></span>
          </label>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.lf-wrap { max-width: 640px; }

.lf-card {
  background: #111; border: 1px solid #222; border-radius: 12px;
  padding: 24px; display: flex; flex-direction: column; gap: 20px;
}

.lf-header {
  display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; flex-wrap: wrap;
}
.lf-title { margin: 0; color: #D4AF37; font-size: 1.1rem; }
.lf-sub   { margin: 4px 0 0; color: #666; font-size: 0.85rem; }
.lf-loading { color: #666; text-align: center; padding: 20px 0; }

.lf-list { display: flex; flex-direction: column; gap: 4px; }

.lf-row {
  display: flex; justify-content: space-between; align-items: center;
  padding: 16px 0; border-bottom: 1px solid #1e1e1e;
}
.lf-row:last-child { border-bottom: none; }

.lf-info { display: flex; flex-direction: column; gap: 4px; }
.lf-label { color: #eee; font-size: 0.95rem; font-weight: 600; }
.lf-desc  { color: #555; font-size: 0.82rem; }

/* Toggle Switch */
.lf-switch { position: relative; display: inline-block; width: 48px; height: 26px; flex-shrink: 0; }
.lf-switch input { opacity: 0; width: 0; height: 0; }
.lf-slider {
  position: absolute; inset: 0; cursor: pointer;
  background: #2a2a2a; border-radius: 26px; transition: 0.25s;
}
.lf-slider::before {
  content: ''; position: absolute;
  width: 20px; height: 20px; left: 3px; bottom: 3px;
  background: #555; border-radius: 50%; transition: 0.25s;
}
.lf-switch input:checked + .lf-slider { background: #1a3a1a; }
.lf-switch input:checked + .lf-slider::before {
  transform: translateX(22px); background: #4caf50;
}

.lf-save-area { display: flex; align-items: center; gap: 10px; }
.lf-saved-hint { color: #4caf50; font-size: 0.85rem; font-weight: 600; white-space: nowrap; }

.btn-save {
  background: #D4AF37; color: #000; border: none;
  border-radius: 8px; padding: 10px 24px;
  font-weight: bold; font-size: 0.95rem; cursor: pointer; transition: 0.2s;
  white-space: nowrap;
}
.btn-save:hover:not(:disabled) { background: #e5c358; }
.btn-save:disabled { opacity: 0.5; cursor: not-allowed; }
</style>
