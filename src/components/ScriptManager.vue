<script setup>
import { ref, reactive, onMounted, computed } from 'vue'
import { supabase } from '../supabase'

const emit = defineEmits(['update-stats'])

// === 預定義的 TAG 選項 ===
const TAG_OPTIONS = ['情感', '硬核', '陣營', '機制', '歡樂', '恐怖', '微恐', '還原', '古風', '現代', '架空', '日式']

// === 狀態變數 ===
const allScripts = ref([])
const searchQuery = ref('')
const isEditing = ref(false) // 現在是在「新增」還是「編輯」模式？
const isLoading = ref(false) // 儲存中的轉圈圈
const isUploading = ref(false) // 上傳圖片中的轉圈圈

// === 表單資料 (用 reactive 包起來比較好管理) ===
const formData = reactive({
  id: null,
  title: '',
  tags: '',
  cover_url: '',
  base_exp: 100,
  player_limit: '',
  intro_text: '',
  default_story_memory: ''
})

// 初始化載入
onMounted(async () => {
  await loadScripts()
})

// === 1. 讀取與搜尋劇本 ===
const loadScripts = async () => {
  const { data } = await supabase.from('scripts').select('*').order('id', { ascending: false })
  allScripts.value = data || []
}

// 前端即時過濾搜尋結果
const filteredScripts = computed(() => {
  if (!searchQuery.value.trim()) return allScripts.value
  const query = searchQuery.value.toLowerCase()
  return allScripts.value.filter(s => s.title.toLowerCase().includes(query))
})

// === 2. 表單操作邏輯 ===
// 點擊列表某個劇本進入編輯模式
const selectScriptToEdit = (script) => {
  isEditing.value = true
  // 把資料倒進表單裡
  Object.assign(formData, script)
  // 確保數字欄位是數字類型
  formData.base_exp = script.base_exp || 100
  // 滾動到表單位置
  document.querySelector('.script-form-section')?.scrollIntoView({ behavior: 'smooth' })
}

// 重置表單回到新增模式
const resetForm = () => {
  isEditing.value = false
  Object.assign(formData, {
    id: null, title: '', tags: '', cover_url: '', base_exp: 100, player_limit: '', intro_text: '', default_story_memory: ''
  })
}

// 儲存 (新增或更新)
const saveScript = async () => {
  if (!formData.title.trim()) return alert('劇本標題沒寫，是要演默劇嗎？')

  isLoading.value = true
  try {
    const payload = { ...formData }
    delete payload.id // id 不能更新，要拔掉

    let error
    if (isEditing.value && formData.id) {
      // 更新模式
      const res = await supabase.from('scripts').update(payload).eq('id', formData.id)
      error = res.error
    } else {
      // 新增模式
      const res = await supabase.from('scripts').insert([payload])
      error = res.error
    }

    if (error) throw error

    alert(isEditing.value ? '✅ 劇本更新成功！' : '🎉 新劇本建立成功！')
    resetForm()
    await loadScripts()
    emit('update-stats') // 通知大盤更新劇本數量

  } catch (err) {
    console.error('儲存失敗:', err)
    alert('存檔失敗，這鍋我不背：' + err.message)
  } finally {
    isLoading.value = false
  }
}

// === 3. TAG 點選邏輯 ===
const toggleTag = (tagName) => {
  let currentTags = formData.tags.split(',').map(t => t.trim()).filter(t => t)
  if (currentTags.includes(tagName)) {
    currentTags = currentTags.filter(t => t !== tagName) // 已存在就移除
  } else {
    currentTags.push(tagName) // 不存在就加入
  }
  formData.tags = currentTags.join(', ')
}

// === 🚀 4. 圖片上傳核心邏輯 (包含前端壓縮) ===
const fileInput = ref(null) // 綁定 input type="file"

const triggerFileUpload = () => {
  fileInput.value.click() // 觸發隱藏的檔案選擇框
}

const handleFileChange = async (event) => {
  const file = event.target.files[0]
  if (!file) return
  
  // 預覽 (用 ObjectURL 比較快)
  formData.cover_url = URL.createObjectURL(file) 
  isUploading.value = true

  try {
    // 1. 前端壓縮
    const compressedBlob = await compressImage(file)
    
    // 2. 上傳到 Supabase Storage (假設 bucket 叫 'covers')
    const fileName = `cover_${Date.now()}.jpg`
    const { error: uploadErr } = await supabase.storage.from('covers').upload(fileName, compressedBlob, {
      contentType: 'image/jpeg',
      upsert: true
    })
    if (uploadErr) throw uploadErr

    // 3. 取得公開網址並填回表單
    const { data } = supabase.storage.from('covers').getPublicUrl(fileName)
    formData.cover_url = data.publicUrl

  } catch (err) {
    console.error('圖片上傳失敗:', err)
    alert('圖片上傳失敗，請檢查你的 Supabase Storage 設定 (Bucket "covers" 是否存在且公開？)')
    formData.cover_url = '' // 失敗就清空預覽
  } finally {
    isUploading.value = false
  }
}

// Canvas 壓縮大法 (從舊版移植過來)
const compressImage = (file) => {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.src = URL.createObjectURL(file)
    img.onload = () => {
      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d')
      const maxW = 800 // 最大寬度限制在 800px
      let w = img.width
      let h = img.height
      if (w > maxW) {
        h *= maxW / w
        w = maxW
      }
      canvas.width = w
      canvas.height = h
      ctx.drawImage(img, 0, 0, w, h)
      // 轉成 JPEG, 品質 0.7
      canvas.toBlob((blob) => {
        if (blob) resolve(blob)
        else reject(new Error('Canvas compression failed'))
      }, 'image/jpeg', 0.7)
    }
    img.onerror = (err) => reject(err)
  })
}
</script>

<template>
  <div class="script-manager-container">
    
    <div class="script-list-section">
      <h3 class="section-title-gold">📜 劇本資料庫 (共 {{ allScripts.length }} 本)</h3>
      <input 
        v-model="searchQuery" 
        type="text" 
        class="admin-input mb-3" 
        placeholder="🔍 搜尋劇本名稱..." 
      />
      
      <div class="script-list-box">
        <div v-if="filteredScripts.length === 0" class="empty-list">找不到相符的劇本</div>
        <div 
          v-for="script in filteredScripts" 
          :key="script.id" 
          class="script-list-item"
          :class="{ 'active': formData.id === script.id }"
          @click="selectScriptToEdit(script)"
        >
          <img :src="script.cover_url || 'https://via.placeholder.com/40x60?text=No+Cover'" class="mini-cover">
          <div class="script-info">
            <div class="script-title">{{ script.title }}</div>
            <div class="script-meta">
              <span>{{ script.player_limit }}人</span> | 
              <span>EXP: {{ script.base_exp }}</span>
            </div>
          </div>
          <span v-if="formData.id === script.id" class="editing-badge">編輯中</span>
        </div>
      </div>
    </div>

    <div class="script-form-section form-section mt-4">
      <div class="form-header">
        <h3 class="section-title-gold" style="margin-bottom: 0;">
          {{ isEditing ? '📝 編輯劇本' : '✨ 新增劇本' }}
        </h3>
        <button v-if="isEditing" class="btn-mini-red" @click="resetForm">取消編輯 (回到新增模式)</button>
      </div>

      <input type="hidden" :value="formData.id">

      <div class="form-group">
        <label>劇本名稱 <span class="required">*</span></label>
        <input v-model="formData.title" type="text" class="admin-input" placeholder="請輸入劇本名稱">
      </div>

      <div class="form-group">
        <label>TAG 標籤 (點擊選擇或手動輸入)</label>
        <input v-model="formData.tags" type="text" class="admin-input mb-2" placeholder="例如: 情感, 古風 (用逗號分隔)">
        <div class="tag-container">
          <span 
            v-for="tag in TAG_OPTIONS" 
            :key="tag" 
            class="tag-badge" 
            :class="{ 'selected': formData.tags.includes(tag) }"
            @click="toggleTag(tag)"
          >
            {{ tag }}
          </span>
        </div>
      </div>
      
      <div class="form-group">
        <label>封面圖片</label>
        <input type="file" ref="fileInput" accept="image/*" style="display: none;" @change="handleFileChange">
        
        <div class="upload-area">
          <div class="url-input-group">
             <input v-model="formData.cover_url" type="text" class="admin-input" placeholder="圖片網址會自動產生..." readonly>
            <button class="btn btn-blue upload-btn" @click="triggerFileUpload" :disabled="isUploading">
              {{ isUploading ? '⏳ 處理中...' : '📤 上傳圖片' }}
            </button>
          </div>
          
          <transition name="fade">
            <div v-if="formData.cover_url" class="preview-box">
              <img :src="formData.cover_url" class="cover-preview">
              <div v-if="isUploading" class="uploading-overlay">壓縮上傳中...</div>
            </div>
          </transition>
        </div>
      </div>

      <div class="form-grid two-cols">
        <div class="form-group">
          <label>基礎 EXP</label>
          <input v-model.number="formData.base_exp" type="number" class="admin-input">
        </div>
        <div class="form-group">
          <label>人數配置</label>
          <input v-model="formData.player_limit" type="text" class="admin-input" placeholder="例如: 6人(3男3女)">
        </div>
      </div>

      <div class="form-group full">
        <label>劇本簡介</label>
        <textarea v-model="formData.intro_text" class="admin-input" rows="3" placeholder="請輸入簡介..."></textarea>
      </div>
      <div class="form-group full">
        <label>預設手札內容 (開場時會自動帶入)</label>
        <textarea v-model="formData.default_story_memory" class="admin-input" rows="3" placeholder="請輸入預設手札..."></textarea>
      </div>

      <div class="form-actions mt-4">
        <button class="btn btn-gold full-width save-btn" @click="saveScript" :disabled="isLoading || isUploading">
          <span v-if="isLoading">🔄 儲存中...</span>
          <span v-else>{{ isEditing ? '💾 更新劇本資料' : '✨ 確認新增劇本' }}</span>
        </button>
      </div>

    </div>

  </div>
</template>

<style scoped>
.script-manager-container { display: flex; flex-direction: column; gap: 20px; }
.section-title-gold { color: #D4AF37; margin-top: 0; margin-bottom: 15px; }
.mb-2 { margin-bottom: 10px; } .mb-3 { margin-bottom: 15px; } .mt-4 { margin-top: 25px; }
.required { color: #ff5555; }

/* 通用表單樣式 */
.form-section { background: #111; padding: 25px; border-radius: 12px; border: 1px solid #222; }
.admin-input { width: 100%; padding: 12px; background: #222; border: 1px solid #444; color: white; border-radius: 8px; font-size: 1rem; font-family: inherit; box-sizing: border-box; }
.admin-input:focus { border-color: #D4AF37; outline: none; }
.admin-input[readonly] { background: #1a1a1a; color: #666; cursor: not-allowed; }
textarea.admin-input { resize: vertical; }
.form-group { margin-bottom: 20px; }
.form-group label { display: block; margin-bottom: 8px; color: #aaa; font-size: 0.9rem; font-weight: bold; }
.form-grid.two-cols { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }

/* 列表區樣式 */
.script-list-box { background: #1a1a1a; border: 1px solid #333; border-radius: 8px; height: 250px; overflow-y: auto; }
.script-list-item { display: flex; gap: 15px; padding: 10px; border-bottom: 1px solid #2a2a2a; cursor: pointer; transition: 0.2s; align-items: center; }
.script-list-item:hover { background: #222; }
.script-list-item.active { background: rgba(212, 175, 55, 0.1); border-left: 3px solid #D4AF37; }
.mini-cover { width: 40px; height: 60px; object-fit: cover; border-radius: 4px; border: 1px solid #444; }
.script-info { flex: 1; }
.script-title { font-weight: bold; font-size: 1rem; color: #fff; }
.script-meta { font-size: 0.8rem; color: #888; margin-top: 4px; }
.editing-badge { background: #D4AF37; color: black; font-size: 0.7rem; padding: 2px 6px; border-radius: 4px; font-weight: bold; }
.empty-list { padding: 20px; text-align: center; color: #666; }

/* 表單header */
.form-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; padding-bottom: 15px; border-bottom: 1px solid #222; }

/* TAG 樣式 */
.tag-container { display: flex; gap: 8px; flex-wrap: wrap; }
.tag-badge { padding: 6px 12px; background: #222; border-radius: 20px; font-size: 0.85rem; cursor: pointer; border: 1px solid #444; transition: 0.2s; color: #aaa; }
.tag-badge:hover { border-color: #D4AF37; color: #D4AF37; }
.tag-badge.selected { background: #D4AF37; color: black; border-color: #D4AF37; font-weight: bold; }

/* 圖片上傳區樣式 */
.url-input-group { display: flex; gap: 10px; }
.upload-btn { white-space: nowrap; }
.preview-box { margin-top: 15px; position: relative; width: fit-content; }
.cover-preview { height: 200px; border-radius: 8px; border: 2px solid #D4AF37; object-fit: cover; }
.uploading-overlay { position: absolute; inset: 0; background: rgba(0,0,0,0.7); color: #D4AF37; display: flex; justify-content: center; align-items: center; font-weight: bold; border-radius: 8px; }

/* 按鈕樣式 */
.btn { padding: 12px 20px; border: none; font-weight: bold; border-radius: 8px; cursor: pointer; transition: 0.2s; }
.btn-gold { background: #D4AF37; color: black; }
.btn-gold:hover { background: #e5c358; }
.btn-blue { background: #3498db; color: white; }
.btn-blue:hover { background: #2980b9; }
.btn-mini-red { background: #331111; color: #ff5555; border: 1px solid #552222; padding: 6px 12px; border-radius: 6px; cursor: pointer; font-size: 0.85rem; }
.btn-mini-red:hover { background: #ff5555; color: white; }
.full-width { width: 100%; }
.save-btn { font-size: 1.1rem; padding: 15px; }
.save-btn:disabled { opacity: 0.6; cursor: not-allowed; }

.fade-enter-active, .fade-leave-active { transition: opacity 0.3s; }
.fade-enter-from, .fade-leave-to { opacity: 0; }

@media (max-width: 768px) {
  .form-grid.two-cols { grid-template-columns: 1fr; }
  .url-input-group { flex-direction: column; }
  .cover-preview { width: 100%; height: auto; max-height: 300px; }
}
</style>