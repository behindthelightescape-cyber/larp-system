<script setup>
import { ref, computed, onMounted } from 'vue'
import { supabase } from '../supabase'

const achievements = ref([])
const scriptsList = ref([]) 
const isLoading = ref(true)
const showModal = ref(false)
const isEditing = ref(false)

const form = ref({
  id: '',
  title: '',
  description: '',
  icon_url: '🏆', 
  condition_type: 'tag', 
  target_tag: '',
  target_count: 1,
  target_script_ids: [],
  reward_type: 'none',
  reward_exp: 0,
  reward_points: 0,
  reward_coupon_title: '',
  reward_coupon_desc: '',
  reward_coupon_valid_days: 30,
  status: 'active'
})

onMounted(async () => {
  await Promise.all([
    fetchAchievements(),
    fetchScripts() 
  ])
  isLoading.value = false
})

const fetchScripts = async () => {
  try {
    const { data, error } = await supabase.from('scripts').select('id, title, tags').order('created_at', { ascending: false })
    if (!error && data) scriptsList.value = data
  } catch (err) {
    console.error('抓取劇本清單失敗:', err)
  }
}

const fetchAchievements = async () => {
  try {
    const { data, error } = await supabase.from('achievements').select('*').order('created_at', { ascending: false })
    if (error) throw error
    achievements.value = data || []
  } catch (err) {
    console.error('讀取成就失敗:', err)
  }
}

const matchedScriptsByTag = computed(() => {
  if (!form.value.target_tag) return []
  const searchTag = form.value.target_tag.toLowerCase().trim()
  return scriptsList.value.filter(script => {
    if (!script.tags) return false
    return script.tags.toLowerCase().includes(searchTag)
  })
})

const getScriptNames = (ids) => {
  if (!ids || !Array.isArray(ids) || ids.length === 0) return '未指定劇本'
  const names = ids.map(id => {
    const found = scriptsList.value.find(s => s.id === id)
    return found ? found.title : '未知劇本'
  })
  return names.join(' + ') 
}

const toggleScript = (id) => {
  const idx = form.value.target_script_ids.indexOf(id)
  if (idx > -1) form.value.target_script_ids.splice(idx, 1) 
  else form.value.target_script_ids.push(id) 
}

const openAddModal = () => {
  isEditing.value = false
  form.value = {
    id: crypto.randomUUID(), 
    title: '', description: '', icon_url: '🏆', 
    condition_type: 'tag', target_tag: '', target_count: 1, target_script_ids: [],
    reward_type: 'none', reward_exp: 0, reward_points: 0, reward_coupon_title: '', reward_coupon_desc: '', reward_coupon_valid_days: 30,
    status: 'active' // 預設開放中
  }
  showModal.value = true
}

const openEditModal = (ach) => {
  isEditing.value = true
  
  let parsedTag = ''
  let parsedCount = 1
  let parsedScriptIds = []

  if (ach.condition_value) {
    if (ach.condition_type === 'tag') {
      parsedTag = ach.condition_value.tag || ''
      parsedCount = ach.condition_value.count || 1
    } else if (ach.condition_type === 'script') {
      parsedScriptIds = ach.condition_value.script_ids || 
                        (ach.condition_value.script_id ? [ach.condition_value.script_id] : [])
    }
  }

  form.value = { 
    id: ach.id, 
    title: ach.title, 
    description: ach.description || '', 
    icon_url: ach.icon_url || '🏆', 
    condition_type: ach.condition_type || 'tag', 
    target_tag: parsedTag,
    target_count: parsedCount,
    target_script_ids: parsedScriptIds,
    reward_type: ach.reward_type || 'none',
    reward_exp: ach.reward_exp || 0,
    reward_points: ach.reward_points || 0,
    reward_coupon_title: ach.reward_coupon_title || '',
    reward_coupon_desc: ach.reward_coupon_desc || '',
    reward_coupon_valid_days: ach.reward_coupon_valid_days || 30,
    status: ach.status || 'active'
  }
  showModal.value = true
}

const saveAchievement = async () => {
  if (!form.value.title) return alert('稱號名稱必填！')
  if (form.value.condition_type === 'tag') {
    if (!form.value.target_tag) return alert('請填寫目標標籤！')
    if (matchedScriptsByTag.value.length === 0) {
      if (!confirm('⚠️ 警告：目前沒有任何劇本符合這個標籤！確定要建立嗎？')) return
    }
  }
  if (form.value.condition_type === 'script' && form.value.target_script_ids.length === 0) return alert('請至少選擇一個指定劇本！')
  
  if (form.value.reward_type === 'coupon') {
    if (!form.value.reward_coupon_title) return alert('既然要送票券，票券標題不能是空的啦！')
    if (!form.value.reward_coupon_valid_days || form.value.reward_coupon_valid_days <= 0) return alert('票券有效天數必須大於 0！')
  }

  let finalConditionValue = {}
  if (form.value.condition_type === 'tag') {
    finalConditionValue = { tag: form.value.target_tag, count: form.value.target_count }
  } else if (form.value.condition_type === 'script') {
    finalConditionValue = { script_ids: form.value.target_script_ids }
  }

  const payload = {
    id: form.value.id,
    title: form.value.title,
    description: form.value.description,
    icon_url: form.value.icon_url,
    condition_type: form.value.condition_type,
    condition_value: finalConditionValue,
    reward_type: form.value.reward_type,
    reward_exp: form.value.reward_type === 'exp' ? form.value.reward_exp : 0,
    reward_points: form.value.reward_type === 'points' ? form.value.reward_points : 0,
    reward_coupon_title: form.value.reward_type === 'coupon' ? form.value.reward_coupon_title : null,
    reward_coupon_desc: form.value.reward_type === 'coupon' ? form.value.reward_coupon_desc : null,
    reward_coupon_valid_days: form.value.reward_type === 'coupon' ? form.value.reward_coupon_valid_days : null,
    status: form.value.status // 🚀 寫入狀態
  }

  try {
    if (isEditing.value) {
      const { error } = await supabase.from('achievements').update(payload).eq('id', form.value.id)
      if (error) throw error
      alert('✅ 成就更新成功！')
    } else {
      const { error } = await supabase.from('achievements').insert([payload])
      if (error) throw error
      alert('✅ 新成就建立成功！')
    }
    showModal.value = false
    await fetchAchievements()
  } catch (err) {
    alert('儲存失敗：' + err.message)
  }
}

const deleteAchievement = async (id, title) => {
  if (!confirm(`確定要刪除成就「${title}」嗎？`)) return
  
  try {
    // 1. 先嘗試溫柔地刪除
    const { error } = await supabase.from('achievements').delete().eq('id', id)
    
    // 2. 如果碰到「已經有人領取」的鐵板 (錯誤代碼 23503)
    if (error && error.code === '23503') {
      const forceDelete = confirm(`⚠️ 警告：這個成就已經有玩家（包括你自己）領取過了！\n\n如果繼續刪除，所有擁有此稱號的玩家將會【失去這個成就】（適合用來清除測試資料）。\n\n確定要「強制抹殺」嗎？`)
      
      if (forceDelete) {
        // 🚀 上帝模式啟動：先殺死所有關聯的玩家紀錄
        await supabase.from('user_achievements').delete().eq('achievement_id', id)
        // 🚀 再砍掉成就本體
        await supabase.from('achievements').delete().eq('id', id)
        
        alert('💥 強制抹殺成功！連同測試紀錄已徹底清除。')
        await fetchAchievements()
      }
      return // 結束流程
    } else if (error) {
      throw error // 其他未知的錯誤，丟給 catch 處理
    }
    
    // 如果一開始就沒有人領取，溫柔刪除成功
    alert('✅ 成就刪除成功！')
    await fetchAchievements()
    
  } catch (err) {
    alert('刪除失敗：' + err.message)
  }
}
</script>

<template>
  <div class="admin-achievements">
    <div class="manager-header">
      <h3 style="color: #eee; margin: 0;">🏆 成就與稱號鑄造廠</h3>
      <button class="btn btn-gold btn-small" @click="openAddModal">➕ 新增成就規則</button>
    </div>

    <div v-if="isLoading" class="loading-state"><div class="spinner"></div></div>
    
    <div v-else class="ach-grid">
      <div v-if="achievements.length === 0" style="color:#888; grid-column: 1/-1; text-align: center; padding: 40px;">目前還沒有任何成就，趕快建一個吧！</div>
      
      <div v-for="ach in achievements" :key="ach.id" class="ach-card" :class="{ 'is-ended': ach.status === 'ended', 'is-hidden': ach.status === 'hidden' }">
        <div class="ach-icon">{{ ach.icon_url || '🏆' }}</div>
        <div class="ach-info">
          <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 5px;">
            <h4 class="ach-title" style="margin: 0;">{{ ach.title }}</h4>
            <span v-if="ach.status === 'ended'" class="badge-ended">⏳ 已絕版</span>
            <span v-if="ach.status === 'hidden'" class="badge-hidden">👁️ 隱藏中</span>
          </div>
          <p class="ach-desc">{{ ach.description }}</p>
          <div class="ach-meta">
            <span class="meta-tag" v-if="ach.condition_type === 'tag'">
              🏷️ 標籤: {{ ach.condition_value?.tag }} x {{ ach.condition_value?.count }}
            </span>
            <span class="meta-tag" v-else-if="ach.condition_type === 'script'">
              📜 需通關: {{ getScriptNames(ach.condition_value?.script_ids) }}
            </span>

            <span class="meta-none" v-if="!ach.reward_type || ach.reward_type === 'none'">
              🎖️ 解鎖專屬稱號
            </span>
            <span class="meta-exp" v-else-if="ach.reward_type === 'exp'">
              ✨ +{{ ach.reward_exp }} EXP
            </span>
            <span class="meta-coupon" v-else-if="ach.reward_type === 'coupon'">
              🎟️ 送券: {{ ach.reward_coupon_title }} ({{ ach.reward_coupon_valid_days }}天)
            </span>
            <span class="meta-points" v-else-if="ach.reward_type === 'points'">
              💎 +{{ ach.reward_points }} 冒險點數
            </span>
          </div>
          <div class="ach-actions">
            <button class="action-btn edit" @click="openEditModal(ach)">編輯</button>
            <button class="action-btn delete" @click="deleteAchievement(ach.id, ach.title)">刪除</button>
          </div>
        </div>
      </div>
    </div>

    <Teleport to="body">
      <div v-if="showModal" class="modal-overlay" @click.self="showModal = false">
        <div class="modal-content">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <h3>{{ isEditing ? '✏️ 編輯成就規則' : '➕ 新增成就規則' }}</h3>
            <select v-model="form.status" class="admin-input" style="width: auto; border-color: #D4AF37; color: #D4AF37; font-weight: bold; background: rgba(212, 175, 55, 0.1);">
              <option value="active">🟢 開放獲取中</option>
              <option value="hidden">👁️ 隱藏（玩家不可見）</option>
              <option value="ended">🔴 限時已絕版</option>
            </select>
          </div>
          
          <div class="form-grid mt-3">
            <div class="form-group">
              <label>稱號名稱 (必填)</label>
              <input v-model="form.title" type="text" class="admin-input" placeholder="例如: 驚悚三部曲大師">
            </div>
            <div class="form-group">
              <label>圖示 (Emoji)</label>
              <input v-model="form.icon_url" type="text" class="admin-input" placeholder="👻">
            </div>
            
            <div class="form-group full">
              <label>達成條件說明給玩家看的 (必填)</label>
              <input v-model="form.description" type="text" class="admin-input" placeholder="例如: 成功通關《劇本A》與《劇本B》">
            </div>

            <div class="form-group full" style="border-top: 1px dashed #333; padding-top: 15px; margin-top: 5px;">
              <label style="color: #3498db;">⚙️ 達成條件：條件類型</label>
              <select v-model="form.condition_type" class="admin-input">
                <option value="tag">🏷️ 玩過特定標籤</option>
                <option value="script">📜 玩過指定劇本 (可複選)</option>
              </select>
            </div>

            <template v-if="form.condition_type === 'tag'">
              <div class="form-group">
                <label>目標標籤關鍵字</label>
                <input v-model="form.target_tag" type="text" class="admin-input" placeholder="例如: 恐怖 (輸入後下方會預覽)">
              </div>
              <div class="form-group">
                <label>需要達成的本數</label>
                <input v-model="form.target_count" type="number" class="admin-input" min="1">
              </div>
              
              <div class="form-group full" v-if="form.target_tag">
                <label style="color: #3498db; margin-bottom: 5px;">🔍 目前符合「{{ form.target_tag }}」的劇本 (共 {{ matchedScriptsByTag.length }} 本)</label>
                <div class="script-selector" style="background: #111; max-height: 150px;">
                  <span v-for="script in matchedScriptsByTag" :key="script.id" class="tag-btn" style="cursor: default; pointer-events: none;">
                    {{ script.title }}
                  </span>
                  <span v-if="matchedScriptsByTag.length === 0" style="color: #e74c3c; font-size: 0.9rem; padding: 5px;">
                    ⚠️ 找不到任何包含此標籤的劇本，請確認錯別字！
                  </span>
                </div>
              </div>
            </template>

            <template v-if="form.condition_type === 'script'">
              <div class="form-group full">
                <label>請選擇需通關的指定劇本 (點擊複選)</label>
                <div class="script-selector">
                  <button 
                    v-for="script in scriptsList" 
                    :key="script.id"
                    class="tag-btn script-btn"
                    :class="{ active: form.target_script_ids.includes(script.id) }"
                    @click.prevent="toggleScript(script.id)"
                  >
                    {{ script.title }}
                  </button>
                </div>
              </div>
            </template>

            <div class="form-group full" style="border-top: 1px dashed #333; padding-top: 15px; margin-top: 5px;">
              <label style="color: #D4AF37;">🎁 達成獎勵：獎勵類型</label>
              <div style="display: flex; gap: 10px; margin-bottom: 10px; flex-wrap: wrap;">
                <label class="radio-label">
                  <input type="radio" v-model="form.reward_type" value="none"> 🎖️ 純稱號(無獎勵)
                </label>
                <label class="radio-label">
                  <input type="radio" v-model="form.reward_type" value="exp"> 🌟 送經驗值
                </label>
                <label class="radio-label">
                  <input type="radio" v-model="form.reward_type" value="coupon"> 🎟️ 送專屬票券
                </label>
                <label class="radio-label">
                  <input type="radio" v-model="form.reward_type" value="points"> 💎 送冒險點數
                </label>
              </div>
            </div>

            <template v-if="form.reward_type === 'points'">
              <div class="form-group full">
                <label>贈送冒險點數數量</label>
                <input v-model="form.reward_points" type="number" class="admin-input" min="0">
              </div>
            </template>

            <template v-if="form.reward_type === 'exp'">
              <div class="form-group full">
                <label>贈送經驗值數量</label>
                <input v-model="form.reward_exp" type="number" class="admin-input" min="0">
              </div>
            </template>

            <template v-if="form.reward_type === 'coupon'">
              <div class="form-group full">
                <label>🎟️ 票券標題 (必填)</label>
                <input v-model="form.reward_coupon_title" type="text" class="admin-input" placeholder="例如: 驚悚大師 100元折價券">
              </div>
              <div class="form-group">
                <label>🎟️ 票券說明 (選填)</label>
                <input v-model="form.reward_coupon_desc" type="text" class="admin-input" placeholder="憑此券遊玩折抵 100 元">
              </div>
              <div class="form-group">
                <label>⏳ 有效期限 (天數)</label>
                <input v-model="form.reward_coupon_valid_days" type="number" class="admin-input" min="1" placeholder="例如: 30">
              </div>
            </template>

          </div>

          <div class="modal-footer mt-4">
            <button class="btn btn-outline" @click="showModal = false">取消</button>
            <button class="btn btn-gold" @click="saveAchievement">💾 儲存規則</button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
/* 樣式基本不變，新增了絕版標籤與半透明卡片特效 */
.manager-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; padding-bottom: 15px; border-bottom: 1px solid #222; }
.ach-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 15px; }
.ach-card { background: #151515; border: 1px solid #333; border-radius: 12px; padding: 20px; display: flex; gap: 15px; align-items: center; transition: all 0.3s;}
/* 🚀 絕版卡片樣式變暗 */
.ach-card.is-ended { opacity: 0.5; filter: grayscale(50%); border-color: #222; }
.ach-card.is-ended:hover { opacity: 0.8; }
.ach-card.is-hidden { opacity: 0.6; border-color: #2a2a3a; border-style: dashed; }
.ach-card.is-hidden:hover { opacity: 0.9; }

.ach-icon { font-size: 3rem; background: #222; width: 80px; height: 80px; display: flex; justify-content: center; align-items: center; border-radius: 12px; border: 1px solid #444; flex-shrink: 0;}
.ach-info { flex: 1; overflow: hidden; } 
.ach-title { color: #D4AF37; font-size: 1.2rem; }
/* 🚀 絕版小標籤 */
.badge-ended { background: rgba(231, 76, 60, 0.15); border: 1px solid #e74c3c; color: #e74c3c; padding: 2px 6px; border-radius: 4px; font-size: 0.75rem; font-weight: bold; white-space: nowrap;}
.badge-hidden { background: rgba(100, 100, 180, 0.15); border: 1px solid #6666cc; color: #9999ee; padding: 2px 6px; border-radius: 4px; font-size: 0.75rem; font-weight: bold; white-space: nowrap;}

.ach-desc { color: #aaa; font-size: 0.9rem; margin: 0 0 10px 0; line-height: 1.4;}
.ach-meta { display: flex; flex-direction: column; gap: 8px; font-size: 0.8rem; margin-bottom: 15px; }
.meta-tag { background: #222; padding: 4px 8px; border-radius: 4px; color: #ccc; width: fit-content; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%;}
.meta-none { background: rgba(255, 255, 255, 0.1); border: 1px solid #888; color: #bbb; padding: 4px 8px; border-radius: 4px; display: inline-block; width: fit-content; font-weight: bold;}
.meta-exp { background: rgba(52, 152, 219, 0.1); border: 1px solid #3498db; color: #3498db; padding: 4px 8px; border-radius: 4px; display: inline-block; width: fit-content; font-weight: bold;}
.meta-coupon { background: rgba(212, 175, 55, 0.15); border: 1px solid #D4AF37; color: #D4AF37; padding: 4px 8px; border-radius: 4px; display: inline-block; width: fit-content; font-weight: bold;}
.meta-points { background: rgba(46, 204, 113, 0.1); border: 1px solid #2ecc71; color: #2ecc71; padding: 4px 8px; border-radius: 4px; display: inline-block; width: fit-content; font-weight: bold;}
.ach-actions { display: flex; gap: 10px; }
.action-btn { flex: 1; padding: 6px; border: none; border-radius: 6px; font-weight: bold; cursor: pointer; font-size: 0.85rem; }
.action-btn.edit { background: #333; color: #fff; }
.action-btn.delete { background: #331111; color: #ff5555; }
.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.8); z-index: 9999; display: flex; justify-content: center; align-items: center; backdrop-filter: blur(5px); }
.modal-content { background: #161616; width: 90%; max-width: 600px; padding: 25px; border-radius: 16px; border: 1px solid #333; max-height: 90vh; overflow-y: auto; }
.form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; }
.form-group { display: flex; flex-direction: column; }
.form-group.full { grid-column: span 2; }
.form-group label { margin-bottom: 8px; color: #aaa; font-size: 0.9rem; font-weight: bold; }
.admin-input { padding: 12px; background: #222; border: 1px solid #444; color: white; border-radius: 8px; font-family: inherit; font-size: 1rem; }
.admin-input:focus { border-color: #D4AF37; outline: none;}
.script-selector { display: flex; flex-wrap: wrap; gap: 10px; padding: 10px; background: #111; border: 1px solid #333; border-radius: 8px; max-height: 200px; overflow-y: auto;}
.tag-btn { background: #1a1a1a; border: 1px solid #444; color: #888; padding: 8px 15px; border-radius: 20px; cursor: pointer; font-size: 0.85rem; transition: 0.2s; }
.tag-btn:hover { background: #222; border-color: #666; color: #ccc; }
.tag-btn.script-btn.active { border-color: #3498db; color: #3498db; background: rgba(52, 152, 219, 0.15); font-weight: bold; box-shadow: 0 0 10px rgba(52, 152, 219, 0.2);}
.radio-label { display: flex; align-items: center; gap: 5px; color: #eee; font-weight: bold; cursor: pointer; background: #222; padding: 10px 15px; border-radius: 8px; border: 1px solid #444; flex: 1; justify-content: center; text-align: center;}
.radio-label:has(input:checked) { border-color: #D4AF37; background: rgba(212, 175, 55, 0.1); color: #D4AF37;}
.radio-label input { display: none; } 
.modal-footer { display: flex; justify-content: flex-end; gap: 15px; }
.btn { padding: 10px 20px; font-weight: bold; border-radius: 8px; cursor: pointer; border: none; }
.btn-gold { background: #D4AF37; color: black; }
.btn-outline { background: transparent; border: 1px solid #555; color: #ccc; }
.mt-3 { margin-top: 15px; } .mt-4 { margin-top: 25px; }
.spinner { width: 30px; height: 30px; border: 3px solid rgba(212, 175, 55, 0.2); border-top-color: #D4AF37; border-radius: 50%; animation: spin 1s linear infinite; margin: 0 auto;}
@keyframes spin { to { transform: rotate(360deg); } }
</style>