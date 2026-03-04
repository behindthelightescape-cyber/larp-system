<script setup>
import { ref, onMounted } from 'vue'
import { supabase } from '../supabase'

const logs = ref([])
const isLoading = ref(true)
const isTriggering = ref(false)

onMounted(async () => {
  await fetchLogs()
})

const fetchLogs = async () => {
  isLoading.value = true
  try {
    const { data, error } = await supabase
      .from('push_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50) // 顯示最近 50 筆戰報
    
    if (error) throw error
    logs.value = data || []
  } catch (err) {
    console.error('讀取戰情紀錄失敗:', err)
  } finally {
    isLoading.value = false
  }
}

// 🚀 強制呼叫雲端狙擊手 (極致 Log 官方版)
const triggerManualPush = async () => {
  isTriggering.value = true
  console.log('--- 🛑 開始連線探測 ---')
  
  try {
    console.log('🎯 準備透過官方套件呼叫: birthday-push-sniper')
    
    // 用官方方法呼叫，它絕對不會抓錯網址跟 Key！
    const { data, error } = await supabase.functions.invoke('birthday-push-sniper', {
      method: 'POST',
      body: { trigger_by: 'admin_debug_test' }
    })

    console.log('📦 雲端回傳完整資料:', data)

    if (error) {
       console.error('📡 官方套件回報錯誤:', error)
       throw error
    }

    alert('✅ 連線成功！快去按 F12 的 Console 看看回傳了什麼！')
    
  } catch (err) {
    console.error('❌ 連線徹底失敗:', err)
    alert('連線失敗！\n請檢查 Supabase 後台是否有部署這支函數？\n錯誤細節: ' + err.message)
  } finally {
    isTriggering.value = false
  }
}

// 狀態標籤的顏色對應
const getStatusBadge = (status) => {
  const map = {
    'pending': { text: '⏳ 準備中', class: 'badge-warning' },
    'processing': { text: '🔄 發送中', class: 'badge-primary' },
    'completed': { text: '🟢 已完成', class: 'badge-success' },
    'failed': { text: '🔴 發送失敗', class: 'badge-danger' }
  }
  return map[status] || { text: status, class: 'badge-secondary' }
}

const formatDate = (dateString) => {
  if (!dateString) return '--'
  return new Date(dateString).toLocaleString('zh-TW', {
    month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
  })
}
</script>

<template>
  <div class="push-logs-manager">
    <div class="manager-header">
      <div>
        <h3 style="color: #eee; margin: 0;">📡 系統推播戰情監控中心</h3>
        <p style="color: #888; font-size: 0.85rem; margin-top: 5px;">監控全自動 LINE 推播狙擊手的執行狀況、成功率與封鎖率。</p>
      </div>
      <button class="btn btn-gold" @click="triggerManualPush" :disabled="isTriggering">
        {{ isTriggering ? '🚀 狙擊手出動中...' : '▶️ 手動啟動本月推播' }}
      </button>
    </div>

    <div v-if="isLoading" class="loading-state"><div class="spinner"></div></div>

    <div v-else-if="logs.length === 0" class="empty-state">
      <div style="font-size: 3rem; margin-bottom: 10px;">📭</div>
      <div style="color: #888;">目前還沒有任何推播戰報紀錄喔！</div>
    </div>

    <div v-else class="logs-container">
      <table class="admin-table">
        <thead>
          <tr>
            <th>建立時間</th>
            <th>推播任務名稱</th>
            <th>目標人數</th>
            <th>成功射擊</th>
            <th>失敗 (封鎖)</th>
            <th>執行狀態</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="log in logs" :key="log.id">
            <td style="color: #aaa;">{{ formatDate(log.created_at) }}</td>
            <td style="font-weight: bold; color: #eee;">{{ log.task_name }}</td>
            <td style="color: #3498db; font-weight: bold;">{{ log.target_count }}</td>
            <td style="color: #2ecc71; font-weight: bold;">{{ log.success_count }}</td>
            <td style="color: #e74c3c; font-weight: bold;">{{ log.fail_count }}</td>
            <td>
              <span class="status-badge" :class="getStatusBadge(log.status).class">
                {{ getStatusBadge(log.status).text }}
              </span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped>
.push-logs-manager { padding: 5px; }
.manager-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 25px; border-bottom: 1px solid #222; padding-bottom: 15px; }
.btn { padding: 10px 20px; border-radius: 8px; font-weight: bold; cursor: pointer; border: none; transition: 0.2s; white-space: nowrap; }
.btn-gold { background: #D4AF37; color: #000; }
.btn-gold:hover:not(:disabled) { background: #e5c358; transform: translateY(-2px); }
.btn-gold:disabled { background: #555; color: #888; cursor: not-allowed; }

.empty-state { text-align: center; padding: 60px 20px; background: #111; border-radius: 12px; border: 1px dashed #333; }
.logs-container { overflow-x: auto; background: #111; border-radius: 12px; border: 1px solid #222; }

.admin-table { width: 100%; border-collapse: collapse; text-align: left; }
.admin-table th { padding: 15px; background: #1a1a1a; color: #D4AF37; font-weight: bold; border-bottom: 1px solid #333; font-size: 0.9rem; white-space: nowrap; }
.admin-table td { padding: 15px; border-bottom: 1px solid #222; font-size: 0.95rem; }
.admin-table tbody tr:hover { background: #161616; }

.status-badge { padding: 6px 12px; border-radius: 20px; font-size: 0.8rem; font-weight: bold; }
.badge-warning { background: rgba(241, 196, 15, 0.1); color: #f1c40f; border: 1px solid rgba(241, 196, 15, 0.3); }
.badge-primary { background: rgba(52, 152, 219, 0.1); color: #3498db; border: 1px solid rgba(52, 152, 219, 0.3); }
.badge-success { background: rgba(46, 204, 113, 0.1); color: #2ecc71; border: 1px solid rgba(46, 204, 113, 0.3); }
.badge-danger { background: rgba(231, 76, 60, 0.1); color: #e74c3c; border: 1px solid rgba(231, 76, 60, 0.3); }
.badge-secondary { background: #333; color: #aaa; border: 1px solid #444; }

.spinner { width: 40px; height: 40px; border: 4px solid rgba(212,175,55,0.2); border-top-color: #D4AF37; border-radius: 50%; animation: spin 1s linear infinite; margin: 0 auto; }
@keyframes spin { to { transform: rotate(360deg); } }
</style>