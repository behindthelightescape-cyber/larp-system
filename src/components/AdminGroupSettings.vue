<script setup>
import { ref, onMounted } from 'vue'
import { supabase } from '../supabase'

const rules = ref('')
const saving = ref(false)
const loading = ref(true)
const savedAt = ref(null)

onMounted(async () => {
  const { data } = await supabase
    .from('group_settings')
    .select('value, updated_at')
    .eq('key', 'join_rules')
    .single()

  if (data) {
    rules.value = data.value
    savedAt.value = data.updated_at
  }
  loading.value = false
})

const save = async () => {
  saving.value = true
  const now = new Date().toISOString()
  const { error } = await supabase
    .from('group_settings')
    .upsert({ key: 'join_rules', value: rules.value, updated_at: now })

  if (error) {
    alert('儲存失敗：' + error.message)
  } else {
    savedAt.value = now
  }
  saving.value = false
}

const formatDate = (iso) => {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('zh-TW')
}
</script>

<template>
  <div class="gs-wrap">
    <div class="gs-card">
      <div class="gs-header">
        <div>
          <h3 class="gs-title">群組歡迎規則</h3>
          <p class="gs-sub">新成員加入 LINE 群組時，自動發送此訊息</p>
        </div>
        <span class="gs-updated">上次更新：{{ formatDate(savedAt) }}</span>
      </div>

      <div v-if="loading" class="gs-loading">讀取中...</div>
      <template v-else>
        <textarea
          v-model="rules"
          class="gs-textarea"
          placeholder="輸入群組規則內容...&#10;&#10;例如：&#10;1. 請保持友善&#10;2. 禁止廣告與業配&#10;3. 遊玩後記得分享心得"
          rows="14"
        />
        <div class="gs-footer">
          <span class="gs-hint">支援換行，直接按 Enter 就好</span>
          <button class="btn-save" :disabled="saving" @click="save">
            {{ saving ? '儲存中...' : '儲存規則' }}
          </button>
        </div>
      </template>
    </div>

    <div class="gs-preview-card">
      <div class="gs-preview-label">Flex Message 預覽</div>
      <div class="gs-bubble">
        <div class="gs-bubble-header">
          <span class="gs-bubble-logo">SPOTLIGHT LARP</span>
          <span class="gs-bubble-tag">群組規則</span>
        </div>
        <div class="gs-bubble-body">
          <pre class="gs-bubble-text">{{ rules || '（尚未填入規則）' }}</pre>
        </div>
        <div class="gs-bubble-footer">
          <span class="gs-bubble-btn">開始冒險 ⚔️</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.gs-wrap { display: flex; gap: 24px; flex-wrap: wrap; align-items: flex-start; }

.gs-card {
  flex: 1; min-width: 300px;
  background: #111; border: 1px solid #222; border-radius: 12px;
  padding: 24px; display: flex; flex-direction: column; gap: 16px;
}
.gs-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; flex-wrap: wrap; }
.gs-title { margin: 0; color: #D4AF37; font-size: 1.1rem; }
.gs-sub { margin: 4px 0 0; color: #666; font-size: 0.85rem; }
.gs-updated { color: #444; font-size: 0.78rem; white-space: nowrap; flex-shrink: 0; }
.gs-loading { color: #666; padding: 20px 0; text-align: center; }

.gs-textarea {
  width: 100%; background: #1a1a1a; border: 1px solid #333;
  color: #ddd; border-radius: 8px; padding: 14px;
  font-size: 0.95rem; font-family: inherit; resize: vertical;
  box-sizing: border-box; line-height: 1.7; transition: border 0.2s;
}
.gs-textarea:focus { outline: none; border-color: #D4AF37; }

.gs-footer { display: flex; justify-content: space-between; align-items: center; }
.gs-hint { color: #555; font-size: 0.8rem; }
.btn-save {
  background: #D4AF37; color: #000; border: none;
  border-radius: 8px; padding: 10px 24px;
  font-weight: bold; font-size: 0.95rem; cursor: pointer; transition: 0.2s;
}
.btn-save:hover:not(:disabled) { background: #e5c358; }
.btn-save:disabled { opacity: 0.5; cursor: not-allowed; }

.gs-preview-card { width: 280px; flex-shrink: 0; }
.gs-preview-label { color: #555; font-size: 0.78rem; letter-spacing: 1px; text-transform: uppercase; margin-bottom: 10px; }

.gs-bubble { background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.5); }
.gs-bubble-header {
  background: #080808; padding: 10px 14px;
  display: flex; justify-content: space-between; align-items: center;
}
.gs-bubble-logo { color: #D4AF37; font-size: 0.7rem; font-weight: bold; letter-spacing: 1px; }
.gs-bubble-tag {
  background: #D4AF37; color: #080808;
  font-size: 0.7rem; font-weight: bold;
  padding: 3px 10px; border-radius: 20px;
}
.gs-bubble-body { background: #0d0d0d; padding: 16px 14px; min-height: 80px; }
.gs-bubble-text {
  color: #ddd; font-size: 0.82rem; line-height: 1.8;
  margin: 0; white-space: pre-wrap; word-break: break-word; font-family: inherit;
}
.gs-bubble-footer { background: #080808; padding: 10px 14px; text-align: center; border-top: 1px solid #1a1a1a; }
.gs-bubble-btn {
  background: #D4AF37; color: #080808;
  font-size: 0.78rem; font-weight: bold;
  padding: 7px 20px; border-radius: 6px; display: inline-block;
}
</style>
