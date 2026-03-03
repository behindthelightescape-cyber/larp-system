<script setup>
import { ref, onMounted, computed } from 'vue'
import { supabase } from '../supabase'

const emit = defineEmits(['update-stats'])

const coupons = ref([])
const users = ref([])
const isLoading = ref(true)

// 表單狀態
const showModal = ref(false)
const isSubmitting = ref(false)
const searchUserQuery = ref('')

// 🚀 新增：控制目前在哪個發送模式
const activeSendMode = ref('single') // 'single' 或 'batch'

// 單點發送表單
const form = ref({
  user_id: '',
  title: '',
  description: '',
  valid_days: 30
})

// 🚀 批次導彈表單
const batchForm = ref({
  targetIds: '',
  title: '',
  description: '',
  valid_days: 30 // 改用天數，跟單點統一，這樣就不會出錯
})

onMounted(async () => {
  await Promise.all([
    fetchCoupons(),
    fetchUsers()
  ])
})

const fetchCoupons = async () => {
  isLoading.value = true
  try {
    const { data, error } = await supabase
      .from('coupons')
      .select(`
        *,
        users ( display_name, legacy_id )
      `)
      .order('created_at', { ascending: false })

    if (error) throw error
    coupons.value = data || []
  } catch (err) {
    console.error('讀取票券失敗:', err.message)
  } finally {
    isLoading.value = false
  }
}

const fetchUsers = async () => {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('id, display_name, legacy_id, phone')
      .order('legacy_id', { ascending: true })
    
    if (error) throw error
    users.value = data || []
  } catch (err) {
    console.error('讀取會員失敗:', err.message)
  }
}

const filteredUsers = computed(() => {
  if (!searchUserQuery.value) return users.value
  const kw = searchUserQuery.value.toLowerCase()
  return users.value.filter(u => 
    (u.display_name && u.display_name.toLowerCase().includes(kw)) || 
    (u.legacy_id && u.legacy_id.includes(kw))
  )
})

const safeFormatDate = (dateStr) => {
  if (!dateStr) return '無紀錄'
  try {
    const d = new Date(dateStr)
    if (isNaN(d.getTime())) return '時間格式異常'
    
    const yyyy = d.getFullYear()
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const dd = String(d.getDate()).padStart(2, '0')
    const hh = String(d.getHours()).padStart(2, '0')
    const min = String(d.getMinutes()).padStart(2, '0')
    
    return `${yyyy}-${mm}-${dd} ${hh}:${min}`
  } catch (err) {
    return '解析失敗'
  }
}

const openAddModal = () => {
  form.value = { user_id: '', title: '', description: '', valid_days: 30 }
  batchForm.value = { targetIds: '', title: '', description: '', valid_days: 30 }
  searchUserQuery.value = ''
  activeSendMode.value = 'single'
  showModal.value = true
}

// === 單點發送 (保持不變) ===
const sendCoupon = async () => {
  if (!form.value.user_id) return alert('請選擇要發送的玩家！')
  if (!form.value.title) return alert('請填寫票券標題！')
  if (form.value.valid_days <= 0) return alert('有效天數必須大於 0！')

  if (isSubmitting.value) return
  isSubmitting.value = true

  try {
    const expiryDate = new Date()
    expiryDate.setDate(expiryDate.getDate() + form.value.valid_days)

    const payload = {
      user_id: form.value.user_id,
      title: form.value.title,
      description: form.value.description,
      status: 'available',
      expiry_date: expiryDate.toISOString()
    }

    const { error } = await supabase.from('coupons').insert([payload])
    if (error) throw error

    alert('✅ 票券發送成功！')
    showModal.value = false
    await fetchCoupons()
    emit('update-stats')

  } catch (err) {
    alert('❌ 發送失敗：' + err.message)
  } finally {
    isSubmitting.value = false
  }
}

// === 🚀 批次導彈發送 (你的邏輯完美移植) ===
const issueBatchCoupons = async () => {
  if (!batchForm.value.title) return alert("標題都沒寫，你是想發送『國王的優惠券』嗎？")
  
  const ids = batchForm.value.targetIds.split(',').map(id => id.trim()).filter(id => id)
  if (ids.length === 0) return alert("你是要發給鬼嗎？對象名單是空的！")

  if (isSubmitting.value) return
  isSubmitting.value = true

  try {
    // 1. 抓取這批 Legacy ID 實體的使用者
    const { data: targetUsers, error: userErr } = await supabase
      .from('users')
      .select('id, legacy_id')
      .in('legacy_id', ids)

    if (userErr) throw userErr
    if (!targetUsers || targetUsers.length === 0) return alert("這些 ID 系統裡一個都找不到！")

    // 2. 計算效期 (統一用天數換算)
    const expiryDate = new Date()
    expiryDate.setDate(expiryDate.getDate() + (batchForm.value.valid_days || 30))

    // 3. 準備批次新增的資料
    const inserts = targetUsers.map(u => ({
      user_id: u.id,
      title: batchForm.value.title,
      description: batchForm.value.description,
      status: 'available',
      expiry_date: expiryDate.toISOString()
    }))

    // 4. 寫入資料庫
    const { error: insertErr } = await supabase.from('coupons').insert(inserts)
    if (insertErr) throw insertErr

    // 5. 找出哪些邊緣人 ID 打錯了
    const foundIds = targetUsers.map(u => u.legacy_id)
    const missingIds = ids.filter(id => !foundIds.includes(id))
    
    let msg = `✅ 成功精準發送給 ${targetUsers.length} 名玩家！\n`
    if (missingIds.length > 0) msg += `\n⚠️ 但找不到這些邊緣人，請檢查是否打錯：\n${missingIds.join(', ')}`
    
    alert(msg)

    showModal.value = false
    await fetchCoupons()
    emit('update-stats')

  } catch (error) {
    console.error("小四警告：系統炸了！", error)
    alert("伺服器炸了，這 bug 找四哥：" + error.message)
  } finally {
    isSubmitting.value = false
  }
}

const voidCoupon = async (coupon) => {
  if (!confirm(`確定要作廢這張票券嗎？\n玩家：${coupon.users?.display_name}\n標題：${coupon.title}`)) return

  try {
    const { error } = await supabase
      .from('coupons')
      .update({ status: 'expired' })
      .eq('id', coupon.id)
      
    if (error) throw error
    
    alert('✅ 票券已作廢！')
    await fetchCoupons()
    emit('update-stats')
  } catch (err) {
    alert('作廢失敗：' + err.message)
  }
}
</script>

<template>
  <div class="coupon-manager">
    <div class="manager-header">
      <h3 style="color: #eee; margin: 0;">🎟️ 票券派發與監控總機</h3>
      <button class="btn btn-gold btn-small" @click="openAddModal">🚀 啟動派發程序</button>
    </div>

    <div v-if="isLoading" class="loading-state">
      <div class="spinner"></div>
    </div>

    <div v-else class="table-container">
      <table class="admin-table">
        <thead>
          <tr>
            <th>發送日期</th>
            <th>擁有玩家</th>
            <th>票券名稱</th>
            <th>狀態</th>
            <th>到期日</th>
            <th>使用時間</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="coupons.length === 0">
            <td colspan="7" class="empty-text">目前系統內沒有任何票券紀錄。</td>
          </tr>
          <tr v-for="coupon in coupons" :key="coupon.id">
            <td class="date-cell">{{ safeFormatDate(coupon.created_at).substring(0, 10) }}</td>
            <td>
              <div class="user-cell">
                <span class="u-name">{{ coupon.users?.display_name || '未知玩家' }}</span>
                <span class="u-id">{{ coupon.users?.legacy_id }}</span>
              </div>
            </td>
            <td>
              <div class="coupon-title-cell">
                <strong style="color: #eee;">{{ coupon.title }}</strong>
                <span v-if="coupon.source_promo_code" class="source-tag" title="來自兌換碼活動">📢 活動</span>
                <span v-else class="source-tag manual" title="由管理員手動發放">🎯 派發</span>
              </div>
            </td>
            <td>
              <span class="status-badge" :class="coupon.status">
                {{ 
                  coupon.status === 'available' ? '🟢 可使用' : 
                  coupon.status === 'used' ? '🔴 已核銷' : '⚫ 已失效' 
                }}
              </span>
            </td>
            <td class="date-cell">{{ safeFormatDate(coupon.expiry_date).substring(0, 10) }}</td>
            <td class="date-cell">
              <span v-if="coupon.status === 'used'" style="color: #e74c3c;">
                {{ safeFormatDate(coupon.used_at) }}
              </span>
              <span v-else style="color: #555;">-</span>
            </td>
            <td>
              <button 
                v-if="coupon.status === 'available'" 
                class="btn-mini-red" 
                @click="voidCoupon(coupon)"
              >
                作廢
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <Teleport to="body">
      <div v-if="showModal" class="modal-overlay" @click.self="showModal = false">
        <div class="modal-content">
          
          <div class="modal-header-tabs">
            <button class="tab-btn" :class="{ active: activeSendMode === 'single' }" @click="activeSendMode = 'single'">🎯 單點發送</button>
            <button class="tab-btn" :class="{ active: activeSendMode === 'batch' }" @click="activeSendMode = 'batch'">🚀 批次導彈</button>
            <button class="close-btn-icon" @click="showModal = false">✕</button>
          </div>
          
          <div v-if="activeSendMode === 'single'" class="form-body">
            <p style="color: #888; font-size: 0.85rem; margin-top: 0;">直接搜尋並發送給單一玩家。</p>
            <div class="form-group">
              <label>🔍 尋找並選擇玩家 (必填)</label>
              <input v-model="searchUserQuery" type="text" class="admin-input search-input" placeholder="輸入名字或編號搜尋...">
              <select v-model="form.user_id" class="admin-input mt-2" size="4" style="height: auto; max-height: 120px;">
                <option value="" disabled>請選擇一名玩家...</option>
                <option v-for="user in filteredUsers" :key="user.id" :value="user.id">
                  [{{ user.legacy_id }}] {{ user.display_name }} ({{ user.phone || '無電話' }})
                </option>
              </select>
            </div>

            <div class="form-group mt-3">
              <label>🎟️ 票券標題 (必填)</label>
              <input v-model="form.title" type="text" class="admin-input" placeholder="例如: 營運長特別餽贈 $100 券">
            </div>

            <div class="form-group mt-3">
              <label>📝 票券說明 (選填)</label>
              <textarea v-model="form.description" class="admin-input" rows="2" placeholder="憑此券遊玩折抵..."></textarea>
            </div>

            <div class="form-group mt-3">
              <label>⏳ 效期 (天數)</label>
              <input v-model="form.valid_days" type="number" class="admin-input" min="1">
            </div>

            <div class="modal-footer mt-4">
              <button class="btn btn-outline" @click="showModal = false">取消</button>
              <button class="btn btn-gold" @click="sendCoupon" :disabled="isSubmitting">
                {{ isSubmitting ? '發送中...' : '🎯 確認發送' }}
              </button>
            </div>
          </div>

          <div v-if="activeSendMode === 'batch'" class="form-body">
            <p style="color: #e67e22; font-size: 0.85rem; margin-top: 0; font-weight: bold;">⚠️ 警告：這將會同時發送給多名玩家！</p>
            <div class="form-group">
              <label>🎯 目標玩家 ID (多筆請用「半形逗號」分隔)</label>
              <textarea v-model="batchForm.targetIds" class="admin-input" rows="3" placeholder="例如: 00000001, 00000002, 00000003"></textarea>
            </div>

            <div class="form-group mt-3">
              <label>🎟️ 票券標題 (必填)</label>
              <input v-model="batchForm.title" type="text" class="admin-input" placeholder="例如: 搬家補償金 500 元">
            </div>

            <div class="form-group mt-3">
              <label>📝 備註說明 (選填)</label>
              <input v-model="batchForm.description" type="text" class="admin-input" placeholder="行銷文案自己想">
            </div>

            <div class="form-group mt-3">
              <label>⏳ 效期 (天數)</label>
              <input v-model="batchForm.valid_days" type="number" class="admin-input" min="1">
            </div>

            <div class="modal-footer mt-4">
              <button class="btn btn-outline" @click="showModal = false">取消</button>
              <button class="btn btn-gold" @click="issueBatchCoupons" :disabled="isSubmitting" style="background: #e74c3c; color: white; border: none;">
                {{ isSubmitting ? '導彈發射中...' : '🚀 啟動群發導彈' }}
              </button>
            </div>
          </div>

        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.manager-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; padding-bottom: 15px; border-bottom: 1px solid #222; }
.loading-state { display: flex; justify-content: center; padding: 50px 0; }
.spinner { width: 40px; height: 40px; border: 4px solid rgba(212, 175, 55, 0.2); border-top-color: #D4AF37; border-radius: 50%; animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

.table-container { width: 100%; overflow-x: auto; background: #111; border: 1px solid #333; border-radius: 12px; }
.admin-table { width: 100%; border-collapse: collapse; min-width: 800px; }
.admin-table th, .admin-table td { padding: 15px; text-align: left; border-bottom: 1px solid #222; font-size: 0.95rem; }
.admin-table th { background: #1a1a1a; color: #aaa; font-weight: bold; position: sticky; top: 0; }
.admin-table tr:hover { background: #151515; }
.empty-text { text-align: center; color: #666; padding: 40px !important; font-style: italic; }

.user-cell { display: flex; flex-direction: column; }
.u-name { font-weight: bold; color: #ccc; }
.u-id { font-size: 0.75rem; color: #D4AF37; font-family: monospace; }
.date-cell { color: #888; font-family: monospace; font-size: 0.9rem;}

.coupon-title-cell { display: flex; align-items: center; gap: 8px; }
.source-tag { font-size: 0.65rem; background: rgba(52, 152, 219, 0.2); color: #3498db; padding: 2px 6px; border-radius: 4px; border: 1px solid rgba(52, 152, 219, 0.4); white-space: nowrap;}
.source-tag.manual { background: rgba(212, 175, 55, 0.1); color: #D4AF37; border-color: rgba(212, 175, 55, 0.3); }

.status-badge { padding: 4px 8px; border-radius: 6px; font-size: 0.8rem; font-weight: bold; display: inline-block; white-space: nowrap;}
.status-badge.available { background: rgba(46, 204, 113, 0.1); color: #2ecc71; border: 1px solid rgba(46, 204, 113, 0.3); }
.status-badge.used { background: rgba(231, 76, 60, 0.1); color: #e74c3c; border: 1px solid rgba(231, 76, 60, 0.3); }
.status-badge.expired { background: #222; color: #666; border: 1px solid #444; }

.btn { padding: 8px 15px; border: none; font-weight: bold; border-radius: 8px; cursor: pointer; transition: 0.2s; }
.btn-gold { background: #D4AF37; color: black; }
.btn-gold:hover { background: #e5c358; }
.btn-gold:disabled { background: #555; color: #888; cursor: not-allowed; }
.btn-small { font-size: 0.85rem; }
.btn-mini-red { background: transparent; color: #e74c3c; border: 1px solid #e74c3c; padding: 4px 8px; border-radius: 6px; cursor: pointer; font-size: 0.8rem; transition: 0.2s; }
.btn-mini-red:hover { background: #e74c3c; color: white; }
.btn-outline { background: transparent; border: 1px solid #555; color: #ccc; }

.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.85); display: flex; justify-content: center; align-items: center; z-index: 9999; backdrop-filter: blur(5px); padding: 20px;}
.modal-content { background: #161616; width: 100%; max-width: 500px; border-radius: 16px; border: 1px solid #333; box-shadow: 0 10px 40px rgba(0,0,0,0.8); display: flex; flex-direction: column;}

/* 🚀 彈窗 Tab 樣式 */
.modal-header-tabs { display: flex; border-bottom: 1px solid #333; position: relative; background: #111; border-radius: 16px 16px 0 0;}
.tab-btn { flex: 1; padding: 15px; background: transparent; border: none; color: #888; font-weight: bold; cursor: pointer; border-bottom: 3px solid transparent; transition: 0.2s;}
.tab-btn:hover { color: #ccc; background: #1a1a1a;}
.tab-btn.active { color: #D4AF37; border-bottom-color: #D4AF37; background: rgba(212,175,55,0.05);}
.close-btn-icon { position: absolute; right: 15px; top: 15px; background: none; border: none; color: #888; font-size: 1.2rem; cursor: pointer; }
.close-btn-icon:hover { color: white; }

.form-body { padding: 25px; }
.form-group { display: flex; flex-direction: column; }
.form-group label { margin-bottom: 8px; color: #aaa; font-size: 0.9rem; font-weight: bold; }
.admin-input { padding: 12px; background: #222; border: 1px solid #444; color: white; border-radius: 8px; font-family: inherit; font-size: 1rem; width: 100%; box-sizing: border-box;}
.admin-input:focus { border-color: #D4AF37; outline: none; }
.search-input { margin-bottom: 10px; border-style: dashed; }
.mt-2 { margin-top: 10px; } .mt-3 { margin-top: 15px; } .mt-4 { margin-top: 25px; }
.modal-footer { display: flex; justify-content: flex-end; gap: 15px; }
</style>