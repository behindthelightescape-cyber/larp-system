<script setup>
import { ref, onMounted } from 'vue'
import { supabase } from '../supabase'

const emit = defineEmits(['update-stats'])

const scripts = ref([])
const isLoading = ref(true)
const showModal = ref(false)
const isEditing = ref(false)
const isUploading = ref(false) 

// 黃金標準分類陣列
const PLAY_STYLES = ['歡樂有趣', '情感沉浸', '機制陣營', '驚悚恐怖', '推理還原']
const SETTINGS = ['現代', '古風', '日式', '民國', '科幻', '奇幻']
const EXTRA_TAGS = ['新手友善', '換裝演繹', '微恐', '喝酒本', '硬核燒腦', '城市限定']

// 🚀 表單資料 (全部改成陣列型態支援多選！)
const form = ref({
  id: null,
  title: '',
  cover_url: '',
  player_limit: '', 
  duration: 4,      
  base_exp: 100,    
  selected_play_styles: [], // 👈 裝玩法的陣列
  selected_settings: [],    // 👈 裝背景的陣列
  selected_tags: [],        // 👈 裝標籤的陣列
  intro_text: '',
  default_story_memory: ''
})

onMounted(async () => {
  await fetchScripts()
})

const fetchScripts = async () => {
  isLoading.value = true
  try {
    const { data, error } = await supabase.from('scripts').select('*').order('created_at', { ascending: false })
    if (error) throw error
    scripts.value = data || []
  } catch (err) {
    console.error('讀取劇本失敗:', err)
  } finally {
    isLoading.value = false
  }
}

// 圖片上傳系統
// 🚀 全新上傳系統：直接對準你們原本就有的 covers 倉庫！
const handleFileUpload = async (event) => {
  const file = event.target.files[0]
  if (!file) return

  isUploading.value = true
  try {
    const fileExt = file.name.split('.').pop()
    const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`
    const filePath = `${fileName}` 

    // 1. 上傳到你們原本的 covers 倉庫
    const { error: uploadError } = await supabase.storage
      .from('covers') // 👈 已經幫你改成 covers 了！
      .upload(filePath, file)

    if (uploadError) throw uploadError

    // 2. 取得公開網址並塞進表單
    const { data } = supabase.storage.from('covers').getPublicUrl(filePath) // 👈 這裡也改了！
    form.value.cover_url = data.publicUrl

  } catch (error) {
    alert('圖片上傳失敗：' + error.message)
    console.error(error)
  } finally {
    isUploading.value = false
    event.target.value = '' 
  }
}

const openAddModal = () => {
  isEditing.value = false
  form.value = {
    id: null, title: '', cover_url: '', player_limit: '', duration: 4, base_exp: 100,
    selected_play_styles: [], selected_settings: [], selected_tags: [], intro_text: '', default_story_memory: ''
  }
  showModal.value = true
}

const openEditModal = (script) => {
  isEditing.value = true
  
  // 🚀 智慧解析：把資料庫的字串拆散，塞回三個不同的按鈕區塊
  let dbPlayStyles = []
  if (script.category) {
    dbPlayStyles = script.category.split(',').filter(t => t.trim())
  }

  let dbSettings = []
  let dbTags = []
  if (script.tags) {
    const tagArray = script.tags.split(',').filter(t => t.trim())
    dbSettings = tagArray.filter(t => SETTINGS.includes(t))
    dbTags = tagArray.filter(t => !SETTINGS.includes(t)) // 剩下的都是標籤
  }

  form.value = {
    id: script.id,
    title: script.title,
    cover_url: script.cover_url || '',
    player_limit: script.player_limit || '',
    duration: script.duration || 4,
    base_exp: script.base_exp || 100,
    selected_play_styles: dbPlayStyles,
    selected_settings: dbSettings,
    selected_tags: dbTags,
    intro_text: script.intro_text || '',
    default_story_memory: script.default_story_memory || ''
  }
  showModal.value = true
}

const saveScript = async () => {
  if (!form.value.title) return alert('劇本名稱必填！')
  if (form.value.selected_play_styles.length === 0) return alert('至少選擇一個🎭玩法類型！')

  // 🚀 智慧打包：存進資料庫時組裝回去
  const finalCategory = form.value.selected_play_styles.join(',')
  const finalTags = [...form.value.selected_settings, ...form.value.selected_tags].filter(t => t).join(',')

  const payload = {
    title: form.value.title,
    cover_url: form.value.cover_url,
    player_limit: form.value.player_limit,
    duration: form.value.duration,
    base_exp: form.value.base_exp,
    category: finalCategory, // 裝玩法
    tags: finalTags,         // 裝背景+特色
    intro_text: form.value.intro_text,
    default_story_memory: form.value.default_story_memory
  }

  try {
    if (isEditing.value) {
      const { error } = await supabase.from('scripts').update(payload).eq('id', form.value.id)
      if (error) throw error
      alert('✅ 劇本更新成功！')
    } else {
      const { error } = await supabase.from('scripts').insert([payload])
      if (error) throw error
      alert('✅ 新劇本建檔成功！')
    }
    showModal.value = false
    await fetchScripts()
    emit('update-stats') 
  } catch (err) {
    console.error('儲存失敗:', err)
    alert('儲存失敗：' + err.message)
  }
}

const deleteScript = async (id, title) => {
  if (!confirm(`確定要刪除劇本「${title}」嗎？這可能會影響相關的遊玩紀錄喔！`)) return
  try {
    const { error } = await supabase.from('scripts').delete().eq('id', id)
    if (error) throw error
    alert('🗑️ 刪除成功！')
    await fetchScripts()
    emit('update-stats')
  } catch (err) {
    alert('刪除失敗：' + err.message)
  }
}

// 🚀 通用開關：用來點擊按鈕時切換勾選狀態
const toggleArrayItem = (type, item) => {
  let targetArray;
  if (type === 'play') targetArray = form.value.selected_play_styles
  else if (type === 'setting') targetArray = form.value.selected_settings
  else targetArray = form.value.selected_tags

  const idx = targetArray.indexOf(item)
  if (idx > -1) targetArray.splice(idx, 1) // 有就移除
  else targetArray.push(item)              // 沒有就加入
}
</script>

<template>
  <div class="script-manager">
    <div class="manager-header">
      <h3 style="color: #eee; margin: 0;">📜 現存劇本資料庫</h3>
      <button class="btn btn-gold btn-small" @click="openAddModal">➕ 新增劇本</button>
    </div>

    <div v-if="isLoading" class="loading-state">
      <div class="spinner"></div>
      <p>資料庫讀取中...</p>
    </div>

    <div v-else class="script-grid">
      <div v-for="script in scripts" :key="script.id" class="script-card">
        <div class="script-cover-wrapper">
          <img :src="script.cover_url || 'https://images.unsplash.com/photo-1514467953502-5a7820e3efb4?w=600'" class="script-cover" />
          <div class="script-cat-badge">{{ script.category ? script.category.split(',')[0] : '未分類' }}</div>
        </div>
        <div class="script-info">
          <h4 class="script-title">{{ script.title }}</h4>
          <p class="script-meta">👥 {{ script.player_limit || '未知人數' }} | ⏳ {{ script.duration || '?' }} 小時</p>
          <p class="script-tags">
            {{ [script.category, script.tags].filter(x => x).join(',').split(',').slice(0, 4).join(' • ') }}
            <span v-if="[script.category, script.tags].filter(x => x).join(',').split(',').length > 4">...</span>
          </p>
          <div class="script-actions">
            <button class="action-btn edit" @click="openEditModal(script)">編輯</button>
            <button class="action-btn delete" @click="deleteScript(script.id, script.title)">刪除</button>
          </div>
        </div>
      </div>
    </div>

    <Teleport to="body">
      <transition name="fade">
        <div v-if="showModal" class="modal-overlay" @click.self="showModal = false">
          <div class="modal-content script-modal">
            <div class="modal-header">
              <h3>{{ isEditing ? '✏️ 編輯劇本' : '➕ 新增劇本' }}</h3>
              <button class="close-btn" @click="showModal = false">✕</button>
            </div>
            
            <div class="modal-body form-grid">
              
              <div class="form-group full">
                <label>劇本名稱 (必填)</label>
                <input v-model="form.title" type="text" class="admin-input" placeholder="輸入劇本名稱...">
              </div>

              <div class="form-group full">
                <label>封面圖片</label>
                <div class="upload-wrapper">
                  <div class="image-preview-box">
                    <img v-if="form.cover_url" :src="form.cover_url" class="preview-img" />
                    <div v-else class="no-image-text">尚未上傳圖片<br><span style="font-size: 0.8rem; color:#666;">建議比例 3:4</span></div>
                  </div>
                  
                  <div class="upload-controls">
                    <input type="file" id="coverUpload" accept="image/*" class="hidden-file-input" @change="handleFileUpload" :disabled="isUploading" />
                    <label for="coverUpload" class="upload-btn" :class="{'disabled': isUploading}">
                      <span v-if="isUploading">⏳ 上傳中...</span>
                      <span v-else-if="form.cover_url">🔄 更換圖片</span>
                      <span v-else>📁 從電腦選擇圖片</span>
                    </label>
                  </div>
                </div>
              </div>

              <div class="form-group">
                <label>玩家人數結構</label>
                <input v-model="form.player_limit" type="text" class="admin-input" placeholder="例如: 3男3女 (可反串)">
              </div>

              <div class="form-group">
                <label>預計時長 (小時)</label>
                <input v-model="form.duration" type="number" class="admin-input" placeholder="例如: 4">
              </div>

              <div class="form-group full">
                <label>🎭 玩法類型 (可複選)</label>
                <div class="tag-selector">
                  <button 
                    v-for="style in PLAY_STYLES" 
                    :key="style"
                    class="tag-btn play-style"
                    :class="{ active: form.selected_play_styles.includes(style) }"
                    @click="toggleArrayItem('play', style)"
                  >
                    {{ style }}
                  </button>
                </div>
              </div>

              <div class="form-group full">
                <label>⛩️ 故事背景 (可複選)</label>
                <div class="tag-selector">
                  <button 
                    v-for="bg in SETTINGS" 
                    :key="bg"
                    class="tag-btn setting"
                    :class="{ active: form.selected_settings.includes(bg) }"
                    @click="toggleArrayItem('setting', bg)"
                  >
                    {{ bg }}
                  </button>
                </div>
              </div>

              <div class="form-group full">
                <label>🏷️ 特色標籤 (可複選)</label>
                <div class="tag-selector">
                  <button 
                    v-for="tag in EXTRA_TAGS" 
                    :key="tag"
                    class="tag-btn extra"
                    :class="{ active: form.selected_tags.includes(tag) }"
                    @click="toggleArrayItem('tag', tag)"
                  >
                    {{ tag }}
                  </button>
                </div>
              </div>

              <div class="form-group full">
                <label>基礎經驗值 (EXP)</label>
                <input v-model="form.base_exp" type="number" class="admin-input" placeholder="預設 100">
              </div>

              <div class="form-group full">
                <label>劇本簡介 (無雷)</label>
                <textarea v-model="form.intro_text" class="admin-input" rows="3" placeholder="輸入劇本簡介，吸引玩家..."></textarea>
              </div>

              <div class="form-group full">
                <label>📜 預設手札 (供開場系統帶入用)</label>
                <textarea v-model="form.default_story_memory" class="admin-input" rows="3" placeholder="例如: 恭喜各位還原了當年的慘案..."></textarea>
              </div>

            </div>
            
            <div class="modal-footer">
              <button class="btn btn-outline" @click="showModal = false">取消</button>
              <button class="btn btn-gold" @click="saveScript" :disabled="isUploading">
                {{ isUploading ? '上傳中請稍候...' : '💾 儲存劇本檔案' }}
              </button>
            </div>
          </div>
        </div>
      </transition>
    </Teleport>
  </div>
</template>

<style scoped>
/* 頂部列與清單網格 */
.manager-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; padding-bottom: 15px; border-bottom: 1px solid #222; }
.loading-state { text-align: center; padding: 50px; color: #888; }
.spinner { width: 40px; height: 40px; border: 4px solid rgba(212, 175, 55, 0.2); border-top-color: #D4AF37; border-radius: 50%; animation: spin 1s linear infinite; margin: 0 auto 15px auto;}
@keyframes spin { to { transform: rotate(360deg); } }

.script-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 20px; }
.script-card { background: #111; border: 1px solid #222; border-radius: 12px; overflow: hidden; display: flex; flex-direction: column; transition: transform 0.2s; }
.script-card:hover { transform: translateY(-5px); border-color: #333; box-shadow: 0 10px 20px rgba(0,0,0,0.5); }
.script-cover-wrapper { position: relative; height: 280px; width: 100%; }
.script-cover { width: 100%; height: 100%; object-fit: cover; }
.script-cat-badge { position: absolute; top: 10px; right: 10px; background: rgba(0,0,0,0.8); border: 1px solid #D4AF37; color: #D4AF37; padding: 4px 10px; font-size: 0.8rem; font-weight: bold; border-radius: 6px; backdrop-filter: blur(4px); }

.script-info { padding: 15px; display: flex; flex-direction: column; flex: 1; }
.script-title { margin: 0 0 8px 0; color: #fff; font-size: 1.1rem; }
.script-meta { font-size: 0.85rem; color: #888; margin: 0 0 8px 0; }
.script-tags { font-size: 0.75rem; color: #aaa; margin: 0 0 15px 0; line-height: 1.5; }
.script-actions { margin-top: auto; display: flex; gap: 10px; }
.action-btn { flex: 1; padding: 8px; border: none; border-radius: 6px; font-weight: bold; cursor: pointer; font-size: 0.85rem; transition: 0.2s; }
.action-btn.edit { background: #222; color: #ccc; border: 1px solid #444; }
.action-btn.edit:hover { background: #333; color: #fff; }
.action-btn.delete { background: #331111; color: #ff5555; border: 1px solid #552222; }
.action-btn.delete:hover { background: #ff5555; color: white; }

/* 彈窗樣式 */
.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.8); z-index: 9999; display: flex; justify-content: center; align-items: center; backdrop-filter: blur(5px); }
.modal-content { background: #161616; width: 90%; max-width: 650px; max-height: 90vh; border-radius: 16px; display: flex; flex-direction: column; border: 1px solid #333; box-shadow: 0 20px 50px rgba(0,0,0,0.8); }
.modal-header { padding: 20px 25px; border-bottom: 1px solid #222; display: flex; justify-content: space-between; align-items: center; }
.modal-header h3 { margin: 0; color: #D4AF37; }
.close-btn { background: transparent; border: none; color: #888; font-size: 1.2rem; cursor: pointer; }
.modal-body { padding: 25px; overflow-y: auto; flex: 1; }
.modal-footer { padding: 20px 25px; border-top: 1px solid #222; display: flex; justify-content: flex-end; gap: 15px; }

/* 表單網格 */
.form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
.form-group { display: flex; flex-direction: column; }
.form-group.full { grid-column: span 2; }
.form-group label { margin-bottom: 8px; color: #aaa; font-size: 0.9rem; font-weight: bold; }
.admin-input { width: 100%; padding: 12px; background: #222; border: 1px solid #444; color: white; border-radius: 8px; font-size: 1rem; font-family: inherit;}
.admin-input:focus { border-color: #D4AF37; outline: none; }
textarea.admin-input { resize: vertical; }

/* 圖片上傳區塊 */
.upload-wrapper { display: flex; align-items: center; gap: 20px; background: #1a1a1a; padding: 15px; border-radius: 8px; border: 1px dashed #444; }
.image-preview-box { width: 90px; height: 120px; background: #111; border-radius: 6px; border: 1px solid #333; display: flex; justify-content: center; align-items: center; overflow: hidden; flex-shrink: 0; }
.preview-img { width: 100%; height: 100%; object-fit: cover; }
.no-image-text { color: #555; font-size: 0.8rem; text-align: center; line-height: 1.4; }
.upload-controls { flex: 1; display: flex; flex-direction: column; align-items: flex-start; }
.hidden-file-input { display: none; }
.upload-btn { background: #3498db; color: white; padding: 10px 20px; border-radius: 8px; font-weight: bold; cursor: pointer; transition: 0.2s; display: inline-block; }
.upload-btn:hover { background: #2980b9; box-shadow: 0 4px 10px rgba(52, 152, 219, 0.4); }
.upload-btn.disabled { background: #555; cursor: not-allowed; color: #888; box-shadow: none; }

/* 🚀 特色標籤選擇器 (三色變形版) */
.tag-selector { display: flex; flex-wrap: wrap; gap: 10px; }
.tag-btn { background: #1a1a1a; border: 1px solid #444; color: #888; padding: 8px 15px; border-radius: 20px; cursor: pointer; font-size: 0.85rem; transition: 0.2s; }
.tag-btn:hover { background: #222; border-color: #666; color: #ccc; }

/* 金色 (玩法) */
.tag-btn.play-style.active { border-color: #D4AF37; color: #D4AF37; background: rgba(212, 175, 55, 0.15); font-weight: bold;}
/* 藍色 (背景) */
.tag-btn.setting.active { border-color: #3498db; color: #3498db; background: rgba(52, 152, 219, 0.15); font-weight: bold;}
/* 綠色 (特色) */
.tag-btn.extra.active { border-color: #2ecc71; color: #2ecc71; background: rgba(46, 204, 113, 0.15); font-weight: bold;}

.btn { padding: 10px 20px; border: none; font-weight: bold; border-radius: 8px; cursor: pointer; transition: 0.2s; }
.btn-gold { background: #D4AF37; color: black; }
.btn-gold:hover { background: #e5c358; }
.btn-gold:disabled { background: #555; color: #888; cursor: not-allowed; }
.btn-outline { background: transparent; border: 1px solid #555; color: #ccc; }
.btn-outline:hover { background: #222; color: #fff; }
.btn-small { padding: 8px 15px; font-size: 0.9rem; }

.fade-enter-active, .fade-leave-active { transition: opacity 0.3s; }
.fade-enter-from, .fade-leave-to { opacity: 0; }

@media (max-width: 768px) {
  .form-grid { grid-template-columns: 1fr; }
  .form-group.full { grid-column: span 1; }
  .script-grid { grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); }
  .script-cover-wrapper { height: 220px; }
  .upload-wrapper { flex-direction: column; align-items: flex-start; }
}
</style>