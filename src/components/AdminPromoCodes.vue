<script setup>
import { ref, onMounted } from 'vue'
import { supabase } from '../supabase'
import QrcodeVue from 'qrcode.vue'

const LIFF_BASE = 'https://liff.line.me/2009161687-icfQU9r6'
const showQrModal = ref(false)
const qrItem = ref(null)

const openQr = (item) => {
  qrItem.value = item
  showQrModal.value = true
}

const qrUrl = () => qrItem.value
  ? `${LIFF_BASE}?promo_code=${encodeURIComponent(qrItem.value.code)}`
  : ''

const promoCodes = ref([])
const isLoading = ref(true)
const showModal = ref(false)

const form = ref({
  id: '',
  code: '',
  title: '',
  description: '',
  valid_days: 30,
  max_uses: 0,
  limit_per_user: 1,
  reuse_after_redeem: false,
  is_active: true
})

onMounted(async () => {
  await fetchPromoCodes()
})

const fetchPromoCodes = async () => {
  isLoading.value = true
  try {
    const { data, error } = await supabase
      .from('promo_codes')
      .select('*')
      .order('created_at', { ascending: false })
      
    if (error) throw error
    promoCodes.value = data || []
  } catch (err) {
    console.error('抓取兌換碼失敗:', err)
  } finally {
    isLoading.value = false
  }
}

const openAddModal = () => {
  form.value = {
    id: '', code: '', title: '', description: '',
    valid_days: 30, max_uses: 0, limit_per_user: 1, reuse_after_redeem: false, is_active: true
  }
  showModal.value = true
}

const savePromoCode = async () => {
  if (!form.value.code || !form.value.title) return alert('兌換碼和標題是必填的喔！')
  
  // 自動把兌換碼轉大寫，並去掉空白，避免玩家輸入錯誤
  const cleanCode = form.value.code.toUpperCase().trim()

  const payload = {
    code: cleanCode,
    title: form.value.title,
    description: form.value.description,
    valid_days: form.value.valid_days,
    max_uses: form.value.max_uses,
    limit_per_user: form.value.limit_per_user,
    reuse_after_redeem: form.value.reuse_after_redeem,
    is_active: form.value.is_active
  }

  try {
    const { error } = await supabase.from('promo_codes').insert([payload])
    
    if (error) {
      if (error.code === '23505') return alert(`❌ 儲存失敗：兌換碼「${cleanCode}」已經存在囉！請換一個代碼。`)
      throw error
    }
    
    alert('✅ 兌換碼建立成功！')
    showModal.value = false
    await fetchPromoCodes()
  } catch (err) {
    alert('儲存失敗：' + err.message)
  }
}

// 🚀 一鍵切換兌換碼狀態 (緊急暫停或重新開放)
const toggleStatus = async (codeItem) => {
  const newStatus = !codeItem.is_active
  const actionName = newStatus ? '開放' : '暫停'
  if (!confirm(`確定要【${actionName}】兌換碼 ${codeItem.code} 嗎？`)) return

  try {
    const { error } = await supabase
      .from('promo_codes')
      .update({ is_active: newStatus })
      .eq('id', codeItem.id)
      
    if (error) throw error
    await fetchPromoCodes()
  } catch (err) {
    alert('狀態切換失敗：' + err.message)
  }
}

// 刪除兌換碼 (如果有玩家領過會擋住)
const deletePromoCode = async (id, codeStr) => {
  if (!confirm(`確定要刪除兌換碼「${codeStr}」嗎？`)) return
  
  try {
    const { error } = await supabase.from('promo_codes').delete().eq('id', id)
    
    if (error && error.code === '23503') {
      alert('❌ 刪除失敗：已經有玩家使用過這個兌換碼了！\n\n💡 建議：點擊「暫停」按鈕把它關閉就好，這樣才不會影響已經發出去的票券關聯！')
      return
    } else if (error) {
      throw error
    }
    
    alert('✅ 兌換碼刪除成功！')
    await fetchPromoCodes()
  } catch (err) {
    alert('刪除失敗：' + err.message)
  }
}
</script>

<template>
  <div class="admin-promo-codes">
    <div class="manager-header">
      <h3 style="color: #eee; margin: 0;">🎟️ 萬用兌換碼印鈔機</h3>
      <button class="btn btn-gold btn-small" @click="openAddModal">➕ 發行新兌換碼</button>
    </div>

    <div v-if="isLoading" class="loading-state"><div class="spinner"></div></div>
    
    <div v-else class="code-grid">
      <div v-if="promoCodes.length === 0" class="empty-state" style="grid-column: 1/-1;">
        目前沒有發行任何兌換碼，趕快來辦個行銷活動吧！
      </div>
      
      <div v-for="item in promoCodes" :key="item.id" class="code-card" :class="{ 'is-inactive': !item.is_active }">
        <div class="code-header">
          <div class="code-string">{{ item.code }}</div>
          <div class="status-badge" :class="item.is_active ? 'active' : 'inactive'">
            {{ item.is_active ? '🟢 兌換中' : '🔴 已暫停' }}
          </div>
        </div>
        
        <div class="code-info">
          <h4 class="code-title">{{ item.title }}</h4>
          <p class="code-desc">{{ item.description }}</p>
          
          <div class="code-meta-grid">
            <div class="meta-item">
              <span class="meta-label">已兌換 / 總量</span>
              <span class="meta-value highlight">
                {{ item.used_count }} / {{ item.max_uses === 0 ? '無限' : item.max_uses }}
              </span>
            </div>
            <div class="meta-item">
              <span class="meta-label">每人限領</span>
              <span class="meta-value">{{ item.limit_per_user }} 次</span>
            </div>
            <div class="meta-item">
              <span class="meta-label">領取後效期</span>
              <span class="meta-value">{{ item.valid_days }} 天</span>
            </div>
            <div class="meta-item" style="grid-column: span 3;">
              <span class="meta-label">核銷後可再領</span>
              <span class="meta-value" :style="{ color: item.reuse_after_redeem ? '#2ecc71' : '#888' }">
                {{ item.reuse_after_redeem ? '是' : '否' }}
              </span>
            </div>
          </div>
        </div>
        
        <div class="code-actions">
          <button class="action-btn qr" @click="openQr(item)">QR Code</button>
          <button class="action-btn toggle" @click="toggleStatus(item)">
            {{ item.is_active ? '暫停活動' : '重新開放' }}
          </button>
          <button class="action-btn delete" @click="deletePromoCode(item.id, item.code)">刪除</button>
        </div>
      </div>
    </div>

    <Teleport to="body">
      <div v-if="showQrModal && qrItem" class="modal-overlay" @click.self="showQrModal = false">
        <div class="modal-content" style="max-width: 340px; text-align: center;">
          <h3 style="color: #D4AF37; margin-top: 0;">{{ qrItem.code }}</h3>
          <p style="color: #888; font-size: 0.85rem; margin-bottom: 20px;">玩家用 LINE 掃描後自動兌換</p>
          <div class="qr-box">
            <QrcodeVue :value="qrUrl()" :size="240" level="M" />
          </div>
          <p class="qr-url-text">{{ qrUrl() }}</p>
          <button class="btn btn-outline" style="margin-top: 16px; width: 100%;" @click="showQrModal = false">關閉</button>
        </div>
      </div>
    </Teleport>

    <Teleport to="body">
      <div v-if="showModal" class="modal-overlay" @click.self="showModal = false">
        <div class="modal-content">
          <h3 style="color: #D4AF37; margin-top: 0;">➕ 發行行銷兌換碼</h3>
          
          <div class="form-grid mt-3">
            <div class="form-group full">
              <label>🎟️ 玩家輸入的代碼 (英文/數字，會自動轉大寫)</label>
              <input v-model="form.code" type="text" class="admin-input huge-input" placeholder="例如: VIP888, HALLOWEEN2025">
            </div>

            <div class="form-group full" style="border-top: 1px dashed #333; padding-top: 15px;">
              <label>🎁 兌換後的票券標題</label>
              <input v-model="form.title" type="text" class="admin-input" placeholder="例如: 萬聖節搞鬼專屬 50 元折價券">
            </div>
            
            <div class="form-group full">
              <label>📝 票券詳細說明</label>
              <textarea v-model="form.description" class="admin-input" rows="2" placeholder="憑此券於萬聖節期間遊玩折抵 50 元..."></textarea>
            </div>

            <div class="form-group">
              <label>⏳ 領取後有效天數</label>
              <input v-model="form.valid_days" type="number" class="admin-input" min="1">
            </div>

            <div class="form-group">
              <label>📦 總發行數量 (0 = 無限量)</label>
              <input v-model="form.max_uses" type="number" class="admin-input" min="0">
            </div>

            <div class="form-group">
              <label>👤 每人限領次數 (防刷機制)</label>
              <input v-model="form.limit_per_user" type="number" class="admin-input" min="1">
            </div>
            
            <div class="form-group">
              <label>🔁 核銷後可再領</label>
              <select v-model="form.reuse_after_redeem" class="admin-input">
                <option :value="false">否，領過就算（預設）</option>
                <option :value="true">是，核銷後可再領一張</option>
              </select>
            </div>

            <div class="form-group">
              <label>🟢 立即開放兌換</label>
              <select v-model="form.is_active" class="admin-input">
                <option :value="true">是，立刻生效</option>
                <option :value="false">否，先存著不開放</option>
              </select>
            </div>
          </div>

          <div class="modal-footer mt-4">
            <button class="btn btn-outline" @click="showModal = false">取消</button>
            <button class="btn btn-gold" @click="savePromoCode">🖨️ 印鈔發行！</button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.manager-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; padding-bottom: 15px; border-bottom: 1px solid #222; }
.code-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 15px; }
.code-card { background: #151515; border: 1px solid #333; border-radius: 12px; display: flex; flex-direction: column; overflow: hidden; transition: 0.3s; }
.code-card:hover { border-color: #555; transform: translateY(-2px); box-shadow: 0 5px 15px rgba(0,0,0,0.5); }
.code-card.is-inactive { opacity: 0.6; filter: grayscale(50%); border-color: #222; }

.code-header { background: #111; padding: 15px; border-bottom: 1px dashed #333; display: flex; justify-content: space-between; align-items: center; }
.code-string { font-size: 1.4rem; font-weight: 900; color: #D4AF37; letter-spacing: 2px; font-family: monospace;}
.status-badge { font-size: 0.75rem; font-weight: bold; padding: 4px 8px; border-radius: 4px; }
.status-badge.active { background: rgba(46, 204, 113, 0.1); color: #2ecc71; border: 1px solid rgba(46, 204, 113, 0.3); }
.status-badge.inactive { background: rgba(231, 76, 60, 0.1); color: #e74c3c; border: 1px solid rgba(231, 76, 60, 0.3); }

.code-info { padding: 15px; flex: 1; }
.code-title { margin: 0 0 5px 0; font-size: 1.1rem; color: #eee; }
.code-desc { margin: 0 0 15px 0; font-size: 0.85rem; color: #aaa; line-height: 1.4; }

.code-meta-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; background: #1a1a1a; padding: 10px; border-radius: 8px; border: 1px solid #222; }
.meta-item { display: flex; flex-direction: column; align-items: center; gap: 4px; }
.meta-label { font-size: 0.7rem; color: #888; }
.meta-value { font-size: 0.9rem; font-weight: bold; color: #ccc; }
.meta-value.highlight { color: #3498db; }

.code-actions { display: flex; gap: 1px; background: #222; }
.action-btn { flex: 1; padding: 10px; border: none; font-weight: bold; cursor: pointer; font-size: 0.85rem; transition: 0.2s; background: #111;}
.action-btn.toggle { color: #f1c40f; }
.action-btn.toggle:hover { background: #222; color: #fff;}
.action-btn.delete { color: #e74c3c; }
.action-btn.delete:hover { background: #331111; color: #ff5555;}
.action-btn.qr { color: #3498db; }
.action-btn.qr:hover { background: #112233; color: #5dade2; }
.qr-box { display: flex; justify-content: center; background: #fff; padding: 16px; border-radius: 12px; }
.qr-url-text { font-size: 0.7rem; color: #555; word-break: break-all; margin-top: 12px; }

.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.8); z-index: 9999; display: flex; justify-content: center; align-items: center; backdrop-filter: blur(5px); }
.modal-content { background: #161616; width: 90%; max-width: 500px; padding: 25px; border-radius: 16px; border: 1px solid #333; max-height: 90vh; overflow-y: auto; }
.form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; }
.form-group { display: flex; flex-direction: column; }
.form-group.full { grid-column: span 2; }
.form-group label { margin-bottom: 8px; color: #aaa; font-size: 0.85rem; font-weight: bold; }
.admin-input { padding: 12px; background: #222; border: 1px solid #444; color: white; border-radius: 8px; font-family: inherit; font-size: 1rem; }
.admin-input:focus { border-color: #D4AF37; outline: none;}
.huge-input { font-size: 1.5rem; font-weight: 900; letter-spacing: 2px; color: #D4AF37; text-align: center; text-transform: uppercase;}

.modal-footer { display: flex; justify-content: flex-end; gap: 15px; }
.btn { padding: 10px 20px; font-weight: bold; border-radius: 8px; cursor: pointer; border: none; }
.btn-gold { background: #D4AF37; color: black; }
.btn-outline { background: transparent; border: 1px solid #555; color: #ccc; }
.mt-3 { margin-top: 15px; } .mt-4 { margin-top: 25px; }
.spinner { width: 30px; height: 30px; border: 3px solid rgba(212, 175, 55, 0.2); border-top-color: #D4AF37; border-radius: 50%; animation: spin 1s linear infinite; margin: 0 auto;}
@keyframes spin { to { transform: rotate(360deg); } }
.empty-state { text-align: center; padding: 40px; color: #666; background: #111; border-radius: 12px; border: 1px dashed #333; }
</style>