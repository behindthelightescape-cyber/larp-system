<script setup>
import { ref, onMounted, computed } from 'vue'
import { supabase } from '../supabase'

const rewards = ref([])
const isLoading = ref(true)
const showEditModal = ref(false)
const isSubmitting = ref(false)

const editingReward = ref(null)

onMounted(async () => {
  await fetchRewards()
})

const fetchRewards = async () => {
  isLoading.value = true
  try {
    const { data, error } = await supabase
      .from('system_rewards')
      .select('*')
      .order('event_type', { ascending: true })
      .order('condition_value', { ascending: true })
    
    if (error) throw error
    rewards.value = data || []
  } catch (err) {
    console.error('抓取規則失敗:', err)
  } finally {
    isLoading.value = false
  }
}

const groupedRewards = computed(() => {
  const groups = {
    level_up: { name: '🏆 稱號升等獎勵', items: [] },
    birthday: { name: '🎂 階梯式壽星專屬禮', items: [] },
    referral: { name: '🤝 師徒裂變獎勵', items: [] },
    mission: { name: '🎯 任務與特殊禮', items: [] }
  }

  rewards.value.forEach(item => {
    if (item.event_type === 'level_up') {
      groups.level_up.items.push(item)
    } else if (item.event_type === 'birthday') {
      groups.birthday.items.push(item)
    } else if (item.event_type.startsWith('referral')) {
      groups.referral.items.push(item)
    } else {
      groups.mission.items.push(item)
    }
  })
  return groups
})

// 🚀 新增規則：開啟空白表單
const openAddModal = () => {
  editingReward.value = {
    is_new: true, // 標記這是新規則
    event_type: 'level_up',
    condition_value: 1,
    reward_title: '',
    reward_desc: '',
    valid_days: 30,
    reward_qty: 1,
    is_active: true
  }
  showEditModal.value = true
}

const openEdit = (reward) => {
  editingReward.value = { ...reward, is_new: false }
  if (!editingReward.value.reward_qty) editingReward.value.reward_qty = 1 
  showEditModal.value = true
}

// 🚀 儲存規則 (會自動判斷是新增還是修改)
const saveReward = async () => {
  if (!editingReward.value.reward_title) return alert('票券標題不能留空喔！')
  if (isSubmitting.value) return
  isSubmitting.value = true

  try {
    const payload = {
      event_type: editingReward.value.event_type,
      condition_value: ['level_up', 'birthday'].includes(editingReward.value.event_type) ? editingReward.value.condition_value : null,
      reward_title: editingReward.value.reward_title,
      reward_desc: editingReward.value.reward_desc,
      valid_days: editingReward.value.valid_days,
      reward_qty: editingReward.value.reward_qty,
      is_active: editingReward.value.is_active,
      updated_at: new Date().toISOString()
    }

    let error;
    if (editingReward.value.is_new) {
      // 新增
      const res = await supabase.from('system_rewards').insert([payload])
      error = res.error
    } else {
      // 修改
      const res = await supabase.from('system_rewards').update(payload).eq('id', editingReward.value.id)
      error = res.error
    }

    if (error) throw error

    alert(editingReward.value.is_new ? '✅ 新規則建立成功！' : '✅ 規則更新成功！')
    showEditModal.value = false
    await fetchRewards()
  } catch (err) {
    alert('儲存失敗：' + err.message)
  } finally {
    isSubmitting.value = false
  }
}

// 刪除規則
const deleteReward = async () => {
  if (!confirm('確定要刪除這條派發規則嗎？（建議用「關閉」功能保留歷史設定即可）')) return
  try {
    const { error } = await supabase.from('system_rewards').delete().eq('id', editingReward.value.id)
    if (error) throw error
    alert('🗑️ 已刪除規則')
    showEditModal.value = false
    await fetchRewards()
  } catch (err) {
    alert('刪除失敗：' + err.message)
  }
}

const toggleActive = async (reward) => {
  try {
    const { error } = await supabase.from('system_rewards').update({ is_active: !reward.is_active }).eq('id', reward.id)
    if (error) throw error
    await fetchRewards()
  } catch (err) {
    alert('操作失敗')
  }
}

const translateEvent = (type) => {
  const map = {
    'level_up': '稱號升等',
    'profile_complete': '資料完善',
    'referral_newbie': '推坑新手禮',
    'referral_veteran': '老手推坑獎',
    'birthday': '壽星生日禮'
  }
  return map[type] || type
}
</script>

<template>
  <div class="auto-rewards-manager">
    <div class="manager-header">
      <div>
        <h3 style="color: #eee; margin: 0;">⚙️ 全自動派發規則中控台</h3>
        <p style="color: #888; font-size: 0.85rem; margin-top: 5px;">同一條件下可以設定多組規則，系統會自動打包成「大禮包」一次發送！</p>
      </div>
      <button class="btn btn-gold btn-small" @click="openAddModal">➕ 新增派發規則</button>
    </div>

    <div v-if="isLoading" class="loading-state"><div class="spinner"></div></div>

    <div v-else class="groups-container">
      <div v-for="(group, key) in groupedRewards" :key="key" class="reward-group">
        <h4 class="group-title">{{ group.name }}</h4>
        
        <div class="reward-grid">
          <div v-for="item in group.items" :key="item.id" class="reward-card" :class="{ 'inactive': !item.is_active }">
            <div class="card-header">
              <div class="event-badge">
                {{ translateEvent(item.event_type) }}
                <span v-if="item.condition_value"> (LV.{{ item.condition_value }})</span>
              </div>
              <label class="switch">
                <input type="checkbox" :checked="item.is_active" @change="toggleActive(item)">
                <span class="slider round"></span>
              </label>
            </div>

            <div class="card-body">
              <div class="reward-title">{{ item.reward_title }}</div>
              <p class="reward-desc">{{ item.reward_desc || '無說明' }}</p>
              <div class="reward-meta" style="display: flex; justify-content: space-between;">
                <span>⏳ 效期: {{ item.valid_days }} 天</span>
                <span style="color: #3498db;">🎟️ 數量: {{ item.reward_qty || 1 }} 張</span> 
              </div>
            </div>

            <div class="card-footer">
              <button class="edit-btn" @click="openEdit(item)">📝 修改規則</button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <Teleport to="body">
      <div v-if="showEditModal" class="modal-overlay" @click.self="showEditModal = false">
        <div class="modal-content">
          <h3 style="color: #D4AF37; margin-top: 0;">
            {{ editingReward.is_new ? '➕ 新增派發規則' : '🛠️ 編輯自動派發規則' }}
          </h3>

          <div v-if="editingReward.is_new" style="display: flex; gap: 15px;" class="mt-4">
            <div class="form-group" style="flex: 2;">
              <label>🎯 觸發事件</label>
              <select v-model="editingReward.event_type" class="admin-input">
                <option value="level_up">稱號升等 (需設定等級)</option>
                <option value="birthday">壽星生日禮 (需設定等級)</option>
                <option value="profile_complete">資料完善禮</option>
                <option value="referral_newbie">推坑新手禮</option>
                <option value="referral_veteran">老手推坑獎</option>
              </select>
            </div>
            <div class="form-group" style="flex: 1;" v-if="['level_up', 'birthday'].includes(editingReward.event_type)">
              <label>📈 觸發等級</label>
              <input v-model="editingReward.condition_value" type="number" class="admin-input" min="1" max="6">
            </div>
          </div>
          <p v-else style="color: #888; font-size: 0.9rem;">
            事件：{{ translateEvent(editingReward.event_type) }} 
            <span v-if="editingReward.condition_value"> (LV.{{ editingReward.condition_value }})</span>
          </p>

          <div class="form-group" :class="{ 'mt-3': editingReward.is_new, 'mt-4': !editingReward.is_new }">
            <label>🎟️ 派發票券標題</label>
            <input v-model="editingReward.reward_title" type="text" class="admin-input" placeholder="例如: 🎁 免費飲料兌換券">
          </div>

          <div class="form-group mt-3">
            <label>📝 票券詳細說明</label>
            <textarea v-model="editingReward.reward_desc" class="admin-input" rows="3" placeholder="玩家在票券詳情中看到的內容"></textarea>
          </div>

          <div style="display: flex; gap: 15px;" class="mt-3">
            <div class="form-group" style="flex: 1;">
              <label>🎟️ 發送數量 (張)</label>
              <input v-model="editingReward.reward_qty" type="number" class="admin-input" min="1">
            </div>
            <div class="form-group" style="flex: 1;">
              <label>⏳ 領取後效期 (天)</label>
              <input v-model="editingReward.valid_days" type="number" class="admin-input" min="1">
            </div>
          </div>

          <div class="form-group mt-3">
            <label>🟢 啟用此自動派發功能</label>
            <select v-model="editingReward.is_active" class="admin-input">
              <option :value="true">開啟 (自動發送)</option>
              <option :value="false">關閉 (暫停發送)</option>
            </select>
          </div>

          <div class="modal-footer mt-4" style="justify-content: space-between;">
            <button v-if="!editingReward.is_new" class="btn btn-outline" style="color: #e74c3c; border-color: #e74c3c;" @click="deleteReward">🗑️ 刪除</button>
            <div v-else></div> <div style="display: flex; gap: 15px;">
              <button class="btn btn-outline" @click="showEditModal = false">取消</button>
              <button class="btn btn-gold" @click="saveReward" :disabled="isSubmitting">
                {{ isSubmitting ? '儲存中...' : '💾 確認儲存' }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
/* 樣式不變 */
.auto-rewards-manager { padding: 5px; }
.manager-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 30px; border-bottom: 1px solid #222; padding-bottom: 15px; }
.btn-small { padding: 8px 15px; font-size: 0.9rem; white-space: nowrap; }
.reward-group { margin-bottom: 40px; }
.group-title { color: #D4AF37; font-size: 1.2rem; margin-bottom: 20px; padding-left: 10px; border-left: 4px solid #D4AF37; }
.reward-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 20px; }
.reward-card { background: #151515; border: 1px solid #333; border-radius: 12px; display: flex; flex-direction: column; overflow: hidden; transition: 0.3s; }
.reward-card.inactive { opacity: 0.6; filter: grayscale(50%); }
.reward-card:hover { border-color: #555; transform: translateY(-3px); }
.card-header { padding: 15px; background: #111; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px dashed #333; }
.event-badge { background: rgba(212,175,55,0.1); color: #D4AF37; padding: 4px 10px; border-radius: 6px; font-size: 0.8rem; font-weight: bold; border: 1px solid rgba(212,175,55,0.2); }
.card-body { padding: 20px; flex: 1; }
.reward-title { color: #fff; font-weight: bold; font-size: 1.1rem; margin-bottom: 8px; }
.reward-desc { color: #888; font-size: 0.85rem; line-height: 1.5; margin-bottom: 15px; }
.reward-meta { font-size: 0.8rem; color: #D4AF37; font-weight: bold; }
.card-footer { padding: 15px; background: #111; border-top: 1px solid #222; }
.edit-btn { width: 100%; padding: 8px; background: #222; color: #eee; border: 1px solid #444; border-radius: 6px; cursor: pointer; font-weight: bold; transition: 0.2s; }
.edit-btn:hover { background: #D4AF37; color: #000; border-color: #D4AF37; }
.switch { position: relative; display: inline-block; width: 44px; height: 22px; }
.switch input { opacity: 0; width: 0; height: 0; }
.slider { position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background-color: #333; transition: .4s; }
.slider:before { position: absolute; content: ""; height: 16px; width: 16px; left: 3px; bottom: 3px; background-color: white; transition: .4s; }
input:checked + .slider { background-color: #2ecc71; }
input:checked + .slider:before { transform: translateX(22px); }
.slider.round { border-radius: 34px; }
.slider.round:before { border-radius: 50%; }
.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.85); z-index: 9999; display: flex; justify-content: center; align-items: center; backdrop-filter: blur(5px); padding: 20px;}
.modal-content { background: #161616; width: 100%; max-width: 500px; padding: 30px; border-radius: 16px; border: 1px solid #333; max-height: 90vh; overflow-y: auto;}
.form-group label { display: block; color: #888; margin-bottom: 8px; font-size: 0.9rem; font-weight: bold;}
.admin-input { width: 100%; padding: 12px; background: #222; border: 1px solid #444; color: white; border-radius: 8px; box-sizing: border-box; }
.admin-input:focus { border-color: #D4AF37; outline: none; }
.modal-footer { display: flex; justify-content: flex-end; gap: 15px; }
.btn { padding: 10px 20px; border-radius: 8px; font-weight: bold; cursor: pointer; border: none; }
.btn-gold { background: #D4AF37; color: #000; }
.btn-gold:disabled { background: #555; color: #888; cursor: not-allowed;}
.btn-outline { background: transparent; border: 1px solid #555; color: #ccc; }
.btn-outline:hover { background: #333; }
.mt-3 { margin-top: 15px; } .mt-4 { margin-top: 25px; }
.spinner { width: 30px; height: 30px; border: 3px solid rgba(212,175,55,0.2); border-top-color: #D4AF37; border-radius: 50%; animation: spin 1s linear infinite; margin: 0 auto; }
@keyframes spin { to { transform: rotate(360deg); } }
</style>