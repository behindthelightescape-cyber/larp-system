<script setup>
import { ref, computed, onMounted } from 'vue'
import { supabase } from '../supabase'

// ── 主 Tab ──
const mainTab = ref('items') // 'items' | 'backgrounds' | 'base'

// ── 道具 ──
const items = ref([])
const scriptsList = ref([])
const achievementsList = ref([])
const isLoading = ref(true)
const isUploading = ref(false)
const showModal = ref(false)
const isEditing = ref(false)
const activeCategory = ref('all')

// ── 背景 ──
const backgrounds = ref([])
const bgLoading = ref(false)
const isBgUploading = ref(false)
const showBgModal = ref(false)
const isBgEditing = ref(false)

const defaultBgForm = () => ({
  id: crypto.randomUUID(),
  name: '',
  img_url: '',
  unlock_type: 'points',
  unlock_cost: 100,
  unlock_ref_id: '',
  sort_order: 0,
  is_active: true,
})
const bgForm = ref(defaultBgForm())

const categories = [
  { key: 'all',    label: '全部' },
  { key: 'expr',   label: '表情' },
  { key: 'hat',    label: '帽子' },
  { key: 'top',    label: '上衣' },
  { key: 'cape',   label: '披風' },
  { key: 'bottom', label: '下身' },
  { key: 'acc',    label: '配件' },
]

const defaultForm = () => ({
  id: crypto.randomUUID(),
  name: '',
  category: 'hat',
  img_url: '',
  unlock_type: 'points',
  unlock_cost: 100,
  unlock_ref_id: '',
  sort_order: 0,
  is_active: true,
})

const form = ref(defaultForm())

// ── 角色底圖 ──
const bases = ref([])
const isBasesLoading = ref(false)
const isBaseUploading = ref(false)
const showBaseModal = ref(false)
const isBaseEditing = ref(false)

const defaultBaseForm = () => ({
  id: crypto.randomUUID(),
  name: '',
  img_url: '',
  is_default: false,
  is_active: true,
  sort_order: 0,
})
const baseForm = ref(defaultBaseForm())

const fetchBases = async () => {
  isBasesLoading.value = true
  const { data } = await supabase.from('wardrobe_bases').select('*').order('sort_order')
  if (data) bases.value = data
  isBasesLoading.value = false
}

const openAddBase = () => {
  isBaseEditing.value = false
  baseForm.value = defaultBaseForm()
  showBaseModal.value = true
}

const openEditBase = (base) => {
  isBaseEditing.value = true
  baseForm.value = { ...base }
  showBaseModal.value = true
}

const handleBaseUpload = async (event) => {
  const file = event.target.files[0]
  if (!file) return
  isBaseUploading.value = true
  try {
    const ext = file.name.split('.').pop()
    const filePath = `base_${Date.now()}_${Math.random().toString(36).substring(7)}.${ext}`
    const { error: uploadError } = await supabase.storage.from('wardrobe').upload(filePath, file)
    if (uploadError) throw uploadError
    const { data } = supabase.storage.from('wardrobe').getPublicUrl(filePath)
    baseForm.value.img_url = data.publicUrl
  } catch (err) {
    alert('圖片上傳失敗：' + err.message)
  } finally {
    isBaseUploading.value = false
    event.target.value = ''
  }
}

const saveBase = async () => {
  if (!baseForm.value.name.trim()) return alert('角色名稱必填！')
  if (!baseForm.value.img_url) return alert('請上傳角色底圖！')
  try {
    const payload = {
      id: baseForm.value.id,
      name: baseForm.value.name.trim(),
      img_url: baseForm.value.img_url,
      is_default: baseForm.value.is_default,
      is_active: baseForm.value.is_active,
      sort_order: Number(baseForm.value.sort_order) || 0,
    }
    if (isBaseEditing.value) {
      const { error } = await supabase.from('wardrobe_bases').update(payload).eq('id', baseForm.value.id)
      if (error) throw error
    } else {
      const { error } = await supabase.from('wardrobe_bases').insert([payload])
      if (error) throw error
    }
    // 如果設為預設，同步把其他角色取消預設
    if (baseForm.value.is_default) {
      await supabase.from('wardrobe_bases')
        .update({ is_default: false })
        .neq('id', baseForm.value.id)
    }
    alert('✅ 儲存成功！')
    showBaseModal.value = false
    await fetchBases()
  } catch (err) {
    alert('儲存失敗：' + err.message)
  }
}

const setDefault = async (base) => {
  await supabase.from('wardrobe_bases').update({ is_default: false }).neq('id', base.id)
  await supabase.from('wardrobe_bases').update({ is_default: true }).eq('id', base.id)
  bases.value.forEach(b => { b.is_default = b.id === base.id })
}

const toggleBaseActive = async (base) => {
  const { error } = await supabase.from('wardrobe_bases').update({ is_active: !base.is_active }).eq('id', base.id)
  if (!error) base.is_active = !base.is_active
}

const deleteBase = async (base) => {
  if (base.is_default) return alert('預設角色無法刪除，請先設定其他角色為預設。')
  if (!confirm(`確定要刪除角色「${base.name}」嗎？`)) return
  const { error } = await supabase.from('wardrobe_bases').delete().eq('id', base.id)
  if (error) return alert('刪除失敗：' + error.message)
  await fetchBases()
}

onMounted(async () => {
  await Promise.all([fetchItems(), fetchScripts(), fetchAchievements(), fetchBackgrounds(), fetchBases()])
  isLoading.value = false
})

const fetchItems = async () => {
  const { data, error } = await supabase
    .from('wardrobe_items')
    .select('*')
    .order('category')
    .order('sort_order')
  if (!error) items.value = data || []
}

const fetchScripts = async () => {
  const { data } = await supabase.from('scripts').select('id, title').order('title')
  if (data) scriptsList.value = data
}

const fetchAchievements = async () => {
  const { data } = await supabase.from('achievements').select('id, title').eq('status', 'active').order('title')
  if (data) achievementsList.value = data
}

const filteredItems = computed(() =>
  activeCategory.value === 'all'
    ? items.value
    : items.value.filter(i => i.category === activeCategory.value)
)

const unlockLabel = (item) => {
  if (item.unlock_type === 'free')        return '免費'
  if (item.unlock_type === 'points')      return `${item.unlock_cost} pt`
  if (item.unlock_type === 'script') {
    const s = scriptsList.value.find(s => String(s.id) === String(item.unlock_ref_id))
    return `劇本：${s?.title ?? item.unlock_ref_id}`
  }
  if (item.unlock_type === 'achievement') {
    const a = achievementsList.value.find(a => a.id === item.unlock_ref_id)
    return `成就：${a?.title ?? item.unlock_ref_id}`
  }
  return '-'
}

const openAdd = () => {
  isEditing.value = false
  form.value = defaultForm()
  showModal.value = true
}

const openEdit = (item) => {
  isEditing.value = true
  form.value = { ...item }
  showModal.value = true
}

const save = async () => {
  if (!form.value.name.trim()) return alert('道具名稱必填！')
  if (form.value.unlock_type === 'points' && !form.value.unlock_cost) return alert('請填寫點數售價！')
  if (['script', 'achievement'].includes(form.value.unlock_type) && !form.value.unlock_ref_id) return alert('請選擇對應的劇本或成就！')

  const payload = {
    id:             form.value.id,
    name:           form.value.name.trim(),
    category:       form.value.category,
    img_url:        form.value.img_url.trim() || null,
    unlock_type:    form.value.unlock_type,
    unlock_cost:    form.value.unlock_type === 'points' ? Number(form.value.unlock_cost) : null,
    unlock_ref_id:  ['script', 'achievement'].includes(form.value.unlock_type) ? form.value.unlock_ref_id : null,
    sort_order:     Number(form.value.sort_order) || 0,
    is_active:      form.value.is_active,
  }

  try {
    if (isEditing.value) {
      const { error } = await supabase.from('wardrobe_items').update(payload).eq('id', form.value.id)
      if (error) throw error
      alert('✅ 道具更新成功！')
    } else {
      const { error } = await supabase.from('wardrobe_items').insert([payload])
      if (error) throw error
      alert('✅ 道具新增成功！')
    }
    showModal.value = false
    await fetchItems()
  } catch (err) {
    alert('儲存失敗：' + err.message)
  }
}

const toggleActive = async (item) => {
  const { error } = await supabase
    .from('wardrobe_items')
    .update({ is_active: !item.is_active })
    .eq('id', item.id)
  if (!error) item.is_active = !item.is_active
}

const handleFileUpload = async (event) => {
  const file = event.target.files[0]
  if (!file) return
  isUploading.value = true
  try {
    const ext = file.name.split('.').pop()
    const filePath = `${Date.now()}_${Math.random().toString(36).substring(7)}.${ext}`
    const { error: uploadError } = await supabase.storage.from('wardrobe').upload(filePath, file)
    if (uploadError) throw uploadError
    const { data } = supabase.storage.from('wardrobe').getPublicUrl(filePath)
    form.value.img_url = data.publicUrl
  } catch (err) {
    alert('圖片上傳失敗：' + err.message)
  } finally {
    isUploading.value = false
    event.target.value = ''
  }
}

// ── 背景 functions ──
const fetchBackgrounds = async () => {
  bgLoading.value = true
  const { data } = await supabase.from('wardrobe_backgrounds').select('*').order('sort_order')
  if (data) backgrounds.value = data
  bgLoading.value = false
}

const openAddBg = () => {
  isBgEditing.value = false
  bgForm.value = defaultBgForm()
  showBgModal.value = true
}

const openEditBg = (bg) => {
  isBgEditing.value = true
  bgForm.value = { ...bg }
  showBgModal.value = true
}

const handleBgUpload = async (event) => {
  const file = event.target.files[0]
  if (!file) return
  isBgUploading.value = true
  try {
    const ext = file.name.split('.').pop()
    const filePath = `bg_${Date.now()}_${Math.random().toString(36).substring(7)}.${ext}`
    const { error: uploadError } = await supabase.storage.from('wardrobe').upload(filePath, file)
    if (uploadError) throw uploadError
    const { data } = supabase.storage.from('wardrobe').getPublicUrl(filePath)
    bgForm.value.img_url = data.publicUrl
  } catch (err) {
    alert('圖片上傳失敗：' + err.message)
  } finally {
    isBgUploading.value = false
    event.target.value = ''
  }
}

const saveBg = async () => {
  if (!bgForm.value.name.trim()) return alert('背景名稱必填！')
  if (!bgForm.value.img_url) return alert('請上傳背景圖片！')
  if (bgForm.value.unlock_type === 'points' && !bgForm.value.unlock_cost) return alert('請填寫點數售價！')

  const payload = {
    id:           bgForm.value.id,
    name:         bgForm.value.name.trim(),
    img_url:      bgForm.value.img_url,
    unlock_type:  bgForm.value.unlock_type,
    unlock_cost:  bgForm.value.unlock_type === 'points' ? Number(bgForm.value.unlock_cost) : null,
    unlock_ref_id: ['script', 'achievement'].includes(bgForm.value.unlock_type) ? bgForm.value.unlock_ref_id : null,
    sort_order:   Number(bgForm.value.sort_order) || 0,
    is_active:    bgForm.value.is_active,
  }

  try {
    if (isBgEditing.value) {
      const { error } = await supabase.from('wardrobe_backgrounds').update(payload).eq('id', bgForm.value.id)
      if (error) throw error
      alert('✅ 背景更新成功！')
    } else {
      const { error } = await supabase.from('wardrobe_backgrounds').insert([payload])
      if (error) throw error
      alert('✅ 背景新增成功！')
    }
    showBgModal.value = false
    await fetchBackgrounds()
  } catch (err) {
    alert('儲存失敗：' + err.message)
  }
}

const toggleBgActive = async (bg) => {
  const { error } = await supabase.from('wardrobe_backgrounds').update({ is_active: !bg.is_active }).eq('id', bg.id)
  if (!error) bg.is_active = !bg.is_active
}

const deleteBg = async (bg) => {
  if (!confirm(`確定要刪除背景「${bg.name}」嗎？`)) return
  const { error } = await supabase.from('wardrobe_backgrounds').delete().eq('id', bg.id)
  if (error) return alert('刪除失敗：' + error.message)
  alert('✅ 刪除成功！')
  await fetchBackgrounds()
}

const deleteItem = async (item) => {
  if (!confirm(`確定要刪除「${item.name}」嗎？`)) return
  try {
    const { error } = await supabase.from('wardrobe_items').delete().eq('id', item.id)
    if (error && error.code === '23503') {
      if (!confirm('⚠️ 已有玩家擁有此道具，強制刪除會清除所有玩家的該道具紀錄，確定嗎？')) return
      await supabase.from('user_wardrobe').delete().eq('item_id', item.id)
      await supabase.from('wardrobe_items').delete().eq('id', item.id)
      alert('💥 強制刪除成功！')
    } else if (error) {
      throw error
    } else {
      alert('✅ 刪除成功！')
    }
    await fetchItems()
  } catch (err) {
    alert('刪除失敗：' + err.message)
  }
}
</script>

<template>
  <div class="admin-paperdoll">

    <!-- 主 Tab -->
    <div class="main-tabs">
      <button class="main-tab" :class="{ active: mainTab === 'items' }" @click="mainTab = 'items'">👗 服裝道具</button>
      <button class="main-tab" :class="{ active: mainTab === 'backgrounds' }" @click="mainTab = 'backgrounds'">🖼 場景背景</button>
      <button class="main-tab" :class="{ active: mainTab === 'base' }" @click="mainTab = 'base'">🧍 角色底圖</button>
    </div>

    <!-- ════ 服裝道具 ════ -->
    <template v-if="mainTab === 'items'">

    <div class="manager-header">
      <h3 style="color: #eee; margin: 0;">服裝道具管理</h3>
      <button class="btn btn-gold btn-small" @click="openAdd">➕ 新增道具</button>
    </div>

    <!-- 分類篩選 -->
    <div class="cat-filter">
      <button
        v-for="cat in categories"
        :key="cat.key"
        class="cat-btn"
        :class="{ active: activeCategory === cat.key }"
        @click="activeCategory = cat.key"
      >{{ cat.label }}</button>
    </div>

    <div v-if="isLoading" class="loading-state"><div class="spinner"></div></div>

    <div v-else-if="filteredItems.length === 0" class="empty-state">
      目前沒有道具，點右上角新增吧！
    </div>

    <div v-else class="item-grid">
      <div v-for="item in filteredItems" :key="item.id" class="item-card" :class="{ inactive: !item.is_active }">

        <div class="item-thumb">
          <img v-if="item.img_url" :src="item.img_url" :alt="item.name" />
          <span v-else class="thumb-placeholder">？</span>
          <span class="cat-badge">{{ categories.find(c => c.key === item.category)?.label }}</span>
        </div>

        <div class="item-body">
          <div class="item-name">{{ item.name }}</div>
          <div class="item-unlock">
            <span v-if="item.unlock_type === 'free'"        class="tag tag-free">免費</span>
            <span v-else-if="item.unlock_type === 'points'" class="tag tag-points">{{ item.unlock_cost }} pt</span>
            <span v-else-if="item.unlock_type === 'script'" class="tag tag-script">劇本解鎖</span>
            <span v-else-if="item.unlock_type === 'achievement'" class="tag tag-ach">成就解鎖</span>
            <span class="unlock-detail">{{ unlockLabel(item) }}</span>
          </div>
          <div class="item-meta">排序 {{ item.sort_order }}</div>
        </div>

        <div class="item-actions">
          <button class="action-btn toggle" @click="toggleActive(item)">
            {{ item.is_active ? '🟢 上架' : '🔴 下架' }}
          </button>
          <button class="action-btn edit" @click="openEdit(item)">編輯</button>
          <button class="action-btn delete" @click="deleteItem(item)">刪除</button>
        </div>

      </div>
    </div>

    <!-- 新增/編輯 Modal -->
    <Teleport to="body">
      <div v-if="showModal" class="modal-overlay" @click.self="showModal = false">
        <div class="modal-content">

          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px;">
            <h3 style="margin:0; color:#eee;">{{ isEditing ? '✏️ 編輯道具' : '➕ 新增道具' }}</h3>
            <select v-model="form.is_active" class="admin-input" style="width:auto; border-color:#D4AF37; color:#D4AF37; font-weight:bold; background:rgba(212,175,55,0.1);">
              <option :value="true">🟢 上架中</option>
              <option :value="false">🔴 下架</option>
            </select>
          </div>

          <div class="form-grid">

            <div class="form-group">
              <label>道具名稱（必填）</label>
              <input v-model="form.name" type="text" class="admin-input" placeholder="例如：紳士帽" />
            </div>

            <div class="form-group">
              <label>分類</label>
              <select v-model="form.category" class="admin-input">
                <option value="expr">表情</option>
                <option value="hat">帽子</option>
                <option value="top">上衣</option>
                <option value="cape">披風</option>
                <option value="bottom">下身</option>
                <option value="acc">配件</option>
              </select>
            </div>

            <div class="form-group full">
              <label>道具圖片</label>
              <div class="upload-wrapper">
                <div class="image-preview-box">
                  <img v-if="form.img_url" :src="form.img_url" class="preview-img" />
                  <div v-else class="no-image-text">尚未上傳<br><span>400 × 600 px 透明底 PNG</span></div>
                </div>
                <div class="upload-controls">
                  <input type="file" id="wardrobeUpload" accept="image/*" class="hidden-file-input" @change="handleFileUpload" :disabled="isUploading" />
                  <label for="wardrobeUpload" class="upload-btn" :class="{ disabled: isUploading }">
                    <span v-if="isUploading">⏳ 上傳中...</span>
                    <span v-else-if="form.img_url">🔄 更換圖片</span>
                    <span v-else>📁 選擇圖片</span>
                  </label>
                  <p v-if="form.img_url" class="upload-url">{{ form.img_url }}</p>
                </div>
              </div>
            </div>

            <div class="form-group">
              <label>排序（數字小的排前面）</label>
              <input v-model="form.sort_order" type="number" class="admin-input" min="0" />
            </div>

            <!-- 解鎖條件 -->
            <div class="form-group full" style="border-top:1px dashed #333; padding-top:15px; margin-top:5px;">
              <label style="color:#D4AF37;">🔓 解鎖條件</label>
              <div style="display:flex; gap:10px; flex-wrap:wrap; margin-top:8px;">
                <label class="radio-label"><input type="radio" v-model="form.unlock_type" value="free" /> 免費取得</label>
                <label class="radio-label"><input type="radio" v-model="form.unlock_type" value="points" /> 點數購買</label>
                <label class="radio-label"><input type="radio" v-model="form.unlock_type" value="script" /> 劇本解鎖</label>
                <label class="radio-label"><input type="radio" v-model="form.unlock_type" value="achievement" /> 成就解鎖</label>
              </div>
            </div>

            <div v-if="form.unlock_type === 'points'" class="form-group full">
              <label>所需點數</label>
              <input v-model="form.unlock_cost" type="number" class="admin-input" min="1" placeholder="例如：150" />
            </div>

            <div v-if="form.unlock_type === 'script'" class="form-group full">
              <label>指定劇本（完成後可領取）</label>
              <select v-model="form.unlock_ref_id" class="admin-input">
                <option value="">請選擇劇本...</option>
                <option v-for="s in scriptsList" :key="s.id" :value="String(s.id)">{{ s.title }}</option>
              </select>
            </div>

            <div v-if="form.unlock_type === 'achievement'" class="form-group full">
              <label>指定成就（達成後可領取）</label>
              <select v-model="form.unlock_ref_id" class="admin-input">
                <option value="">請選擇成就...</option>
                <option v-for="a in achievementsList" :key="a.id" :value="a.id">{{ a.title }}</option>
              </select>
            </div>

          </div>

          <div style="display:flex; gap:10px; justify-content:flex-end; margin-top:24px;">
            <button class="btn" style="background:#222; color:#888; border:1px solid #333;" @click="showModal = false">取消</button>
            <button class="btn btn-gold" @click="save">{{ isEditing ? '儲存變更' : '建立道具' }}</button>
          </div>

        </div>
      </div>
    </Teleport>

    </template>
    <!-- ════ 服裝道具 end ════ -->

    <!-- ════ 場景背景 ════ -->
    <template v-if="mainTab === 'backgrounds'">

      <div class="manager-header">
        <h3 style="color: #eee; margin: 0;">場景背景管理</h3>
        <button class="btn btn-gold btn-small" @click="openAddBg">➕ 新增背景</button>
      </div>

      <div v-if="bgLoading" class="loading-state"><div class="spinner"></div></div>

      <div v-else-if="backgrounds.length === 0" class="empty-state">
        目前沒有背景，點右上角新增吧！
      </div>

      <div v-else class="bg-grid">
        <div v-for="bg in backgrounds" :key="bg.id" class="bg-card" :class="{ inactive: !bg.is_active }">
          <div class="bg-thumb">
            <img :src="bg.img_url" :alt="bg.name" />
          </div>
          <div class="item-body">
            <div class="item-name">{{ bg.name }}</div>
            <div class="item-unlock">
              <span v-if="bg.unlock_type === 'free'"        class="tag tag-free">免費</span>
              <span v-else-if="bg.unlock_type === 'points'" class="tag tag-points">{{ bg.unlock_cost }} pt</span>
              <span v-else-if="bg.unlock_type === 'script'" class="tag tag-script">劇本解鎖</span>
              <span v-else-if="bg.unlock_type === 'achievement'" class="tag tag-ach">成就解鎖</span>
            </div>
            <div class="item-meta">排序 {{ bg.sort_order }}</div>
          </div>
          <div class="item-actions">
            <button class="action-btn toggle" @click="toggleBgActive(bg)">{{ bg.is_active ? '🟢 上架' : '🔴 下架' }}</button>
            <button class="action-btn edit" @click="openEditBg(bg)">編輯</button>
            <button class="action-btn delete" @click="deleteBg(bg)">刪除</button>
          </div>
        </div>
      </div>

      <!-- 背景 Modal -->
      <Teleport to="body">
        <div v-if="showBgModal" class="modal-overlay" @click.self="showBgModal = false">
          <div class="modal-content">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px;">
              <h3 style="margin:0; color:#eee;">{{ isBgEditing ? '✏️ 編輯背景' : '➕ 新增背景' }}</h3>
              <select v-model="bgForm.is_active" class="admin-input" style="width:auto; border-color:#D4AF37; color:#D4AF37; font-weight:bold; background:rgba(212,175,55,0.1);">
                <option :value="true">🟢 上架中</option>
                <option :value="false">🔴 下架</option>
              </select>
            </div>

            <div class="form-grid">
              <div class="form-group">
                <label>背景名稱（必填）</label>
                <input v-model="bgForm.name" type="text" class="admin-input" placeholder="例如：深海" />
              </div>
              <div class="form-group">
                <label>排序</label>
                <input v-model="bgForm.sort_order" type="number" class="admin-input" min="0" />
              </div>

              <div class="form-group full">
                <label>背景圖片（建議 800 × 600 px）</label>
                <div class="upload-wrapper">
                  <div class="image-preview-box" style="width:160px; height:100px;">
                    <img v-if="bgForm.img_url" :src="bgForm.img_url" class="preview-img" />
                    <div v-else class="no-image-text">尚未上傳<br><span>建議 800 × 600 px</span></div>
                  </div>
                  <div class="upload-controls">
                    <input type="file" id="bgUpload" accept="image/*" class="hidden-file-input" @change="handleBgUpload" :disabled="isBgUploading" />
                    <label for="bgUpload" class="upload-btn" :class="{ disabled: isBgUploading }">
                      <span v-if="isBgUploading">⏳ 上傳中...</span>
                      <span v-else-if="bgForm.img_url">🔄 更換圖片</span>
                      <span v-else>📁 選擇圖片</span>
                    </label>
                    <p v-if="bgForm.img_url" class="upload-url">{{ bgForm.img_url }}</p>
                  </div>
                </div>
              </div>

              <div class="form-group full" style="border-top:1px dashed #333; padding-top:15px; margin-top:5px;">
                <label style="color:#D4AF37;">🔓 解鎖條件</label>
                <div style="display:flex; gap:10px; flex-wrap:wrap; margin-top:8px;">
                  <label class="radio-label"><input type="radio" v-model="bgForm.unlock_type" value="free" /> 免費</label>
                  <label class="radio-label"><input type="radio" v-model="bgForm.unlock_type" value="points" /> 點數購買</label>
                  <label class="radio-label"><input type="radio" v-model="bgForm.unlock_type" value="script" /> 劇本解鎖</label>
                  <label class="radio-label"><input type="radio" v-model="bgForm.unlock_type" value="achievement" /> 成就解鎖</label>
                </div>
              </div>

              <div v-if="bgForm.unlock_type === 'points'" class="form-group full">
                <label>所需點數</label>
                <input v-model="bgForm.unlock_cost" type="number" class="admin-input" min="1" />
              </div>
              <div v-if="bgForm.unlock_type === 'script'" class="form-group full">
                <label>指定劇本</label>
                <select v-model="bgForm.unlock_ref_id" class="admin-input">
                  <option value="">請選擇劇本...</option>
                  <option v-for="s in scriptsList" :key="s.id" :value="String(s.id)">{{ s.title }}</option>
                </select>
              </div>
              <div v-if="bgForm.unlock_type === 'achievement'" class="form-group full">
                <label>指定成就</label>
                <select v-model="bgForm.unlock_ref_id" class="admin-input">
                  <option value="">請選擇成就...</option>
                  <option v-for="a in achievementsList" :key="a.id" :value="a.id">{{ a.title }}</option>
                </select>
              </div>
            </div>

            <div style="display:flex; gap:10px; justify-content:flex-end; margin-top:24px;">
              <button class="btn" style="background:#222; color:#888; border:1px solid #333;" @click="showBgModal = false">取消</button>
              <button class="btn btn-gold" @click="saveBg">{{ isBgEditing ? '儲存變更' : '建立背景' }}</button>
            </div>
          </div>
        </div>
      </Teleport>

    </template>
    <!-- ════ 場景背景 end ════ -->

    <!-- ════ 角色底圖 ════ -->
    <template v-if="mainTab === 'base'">
      <div class="manager-header">
        <h3 style="color: #eee; margin: 0;">角色底圖管理</h3>
        <button class="btn btn-gold btn-small" @click="openAddBase">➕ 新增角色</button>
      </div>

      <div v-if="isBasesLoading" class="loading-state"><div class="spinner"></div></div>

      <div v-else-if="bases.length === 0" class="empty-state">
        目前沒有角色，點右上角新增吧！
      </div>

      <div v-else class="base-grid">
        <div v-for="base in bases" :key="base.id" class="base-card" :class="{ inactive: !base.is_active }">
          <div class="base-thumb-wrap">
            <img v-if="base.img_url" :src="base.img_url" :alt="base.name" />
            <div v-else class="no-image-text">尚未上傳</div>
            <span v-if="base.is_default" class="default-badge">預設</span>
          </div>
          <div class="item-body">
            <div class="item-name">{{ base.name }}</div>
            <div class="item-meta">排序 {{ base.sort_order }}</div>
          </div>
          <div class="item-actions">
            <button
              class="action-btn toggle"
              :style="base.is_default ? 'color:#D4AF37;' : ''"
              :disabled="base.is_default"
              @click="!base.is_default && setDefault(base)"
            >{{ base.is_default ? '⭐ 預設中' : '設為預設' }}</button>
            <button class="action-btn toggle" @click="toggleBaseActive(base)">{{ base.is_active ? '🟢 上架' : '🔴 下架' }}</button>
            <button class="action-btn edit" @click="openEditBase(base)">編輯</button>
            <button class="action-btn delete" @click="deleteBase(base)">刪除</button>
          </div>
        </div>
      </div>

      <!-- 新增/編輯 Modal -->
      <Teleport to="body">
        <div v-if="showBaseModal" class="modal-overlay" @click.self="showBaseModal = false">
          <div class="modal-content">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px;">
              <h3 style="margin:0; color:#eee;">{{ isBaseEditing ? '✏️ 編輯角色' : '➕ 新增角色' }}</h3>
              <select v-model="baseForm.is_active" class="admin-input" style="width:auto; border-color:#D4AF37; color:#D4AF37; font-weight:bold; background:rgba(212,175,55,0.1);">
                <option :value="true">🟢 上架中</option>
                <option :value="false">🔴 下架</option>
              </select>
            </div>

            <div class="form-grid">
              <div class="form-group">
                <label>角色名稱（必填）</label>
                <input v-model="baseForm.name" type="text" class="admin-input" placeholder="例如：燈燈" />
              </div>
              <div class="form-group">
                <label>排序</label>
                <input v-model="baseForm.sort_order" type="number" class="admin-input" min="0" />
              </div>

              <div class="form-group full">
                <label>角色底圖（建議 400 × 600 px 透明底 PNG）</label>
                <div class="upload-wrapper">
                  <div class="image-preview-box" style="width:80px; height:120px;">
                    <img v-if="baseForm.img_url" :src="baseForm.img_url" class="preview-img" />
                    <div v-else class="no-image-text">尚未上傳</div>
                  </div>
                  <div class="upload-controls">
                    <input type="file" id="baseModalUpload" accept="image/*" class="hidden-file-input" @change="handleBaseUpload" :disabled="isBaseUploading" />
                    <label for="baseModalUpload" class="upload-btn" :class="{ disabled: isBaseUploading }">
                      <span v-if="isBaseUploading">⏳ 上傳中...</span>
                      <span v-else-if="baseForm.img_url">🔄 更換圖片</span>
                      <span v-else>📁 選擇圖片</span>
                    </label>
                    <p v-if="baseForm.img_url" class="upload-url">{{ baseForm.img_url }}</p>
                  </div>
                </div>
              </div>

              <div class="form-group full">
                <label class="radio-label">
                  <input type="checkbox" v-model="baseForm.is_default" />
                  設為預設角色（前台換裝頁面顯示此角色）
                </label>
              </div>
            </div>

            <div style="display:flex; gap:10px; justify-content:flex-end; margin-top:24px;">
              <button class="btn" style="background:#222; color:#888; border:1px solid #333;" @click="showBaseModal = false">取消</button>
              <button class="btn btn-gold" @click="saveBase">{{ isBaseEditing ? '儲存變更' : '建立角色' }}</button>
            </div>
          </div>
        </div>
      </Teleport>

    </template>
    <!-- ════ 角色底圖 end ════ -->

  </div>
</template>

<style scoped>
.admin-paperdoll { display: flex; flex-direction: column; gap: 20px; }

/* ── 主 Tab ── */
.main-tabs { display: flex; gap: 8px; border-bottom: 1px solid #222; padding-bottom: 12px; }
.main-tab {
  padding: 8px 20px; border-radius: 10px; font-size: 0.9rem; font-weight: 600;
  border: 1px solid #333; background: #1a1a1a; color: #666; cursor: pointer; transition: 0.2s;
}
.main-tab.active { background: rgba(212,175,55,0.12); border-color: #D4AF37; color: #D4AF37; }

.manager-header {
  display: flex; justify-content: space-between; align-items: center;
  margin-bottom: 4px;
}

/* 分類篩選 */
.cat-filter { display: flex; gap: 8px; flex-wrap: wrap; }
.cat-btn {
  padding: 6px 16px; border-radius: 20px; font-size: 0.85rem;
  border: 1px solid #333; background: #1a1a1a; color: #888; cursor: pointer;
  transition: 0.2s;
}
.cat-btn.active { background: rgba(212,175,55,0.15); border-color: #D4AF37; color: #D4AF37; }

/* 道具格 */
.item-grid {
  display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 14px;
}
.item-card {
  background: #161616; border: 1px solid #2a2a2a; border-radius: 14px;
  overflow: hidden; display: flex; flex-direction: column;
  transition: border-color 0.2s;
}
.item-card:hover { border-color: #444; }
.item-card.inactive { opacity: 0.45; }

.item-thumb {
  aspect-ratio: 4/3; background: #111;
  display: flex; align-items: center; justify-content: center;
  position: relative;
}
.item-thumb img { width: 100%; height: 100%; object-fit: contain; }
.thumb-placeholder { font-size: 2rem; color: #333; }
.cat-badge {
  position: absolute; top: 6px; left: 6px;
  background: rgba(0,0,0,0.7); color: #888;
  font-size: 0.65rem; padding: 2px 7px; border-radius: 8px;
}

.item-body { padding: 10px 12px; flex: 1; display: flex; flex-direction: column; gap: 5px; }
.item-name { font-size: 0.95rem; color: #eee; font-weight: 600; }
.item-unlock { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.item-meta { font-size: 0.72rem; color: #555; }

.tag { font-size: 0.65rem; padding: 2px 7px; border-radius: 6px; font-weight: 700; }
.tag-free   { background: rgba(46,204,113,0.15); color: #2ecc71; }
.tag-points { background: rgba(212,175,55,0.15); color: #D4AF37; }
.tag-script { background: rgba(52,152,219,0.15); color: #3498db; }
.tag-ach    { background: rgba(155,89,182,0.15); color: #9b59b6; }
.unlock-detail { font-size: 0.72rem; color: #666; }

.item-actions {
  display: flex; gap: 6px; padding: 10px 12px;
  border-top: 1px solid #222;
}
.action-btn {
  flex: 1; padding: 5px 0; border-radius: 8px; font-size: 0.75rem;
  border: none; cursor: pointer; transition: 0.15s;
}
.action-btn.toggle { background: #1a1a1a; color: #888; font-size: 0.68rem; }
.action-btn.toggle:hover { background: #252525; }
.action-btn.edit   { background: rgba(52,152,219,0.15); color: #3498db; }
.action-btn.edit:hover { background: rgba(52,152,219,0.25); }
.action-btn.delete { background: rgba(231,76,60,0.12); color: #e74c3c; }
.action-btn.delete:hover { background: rgba(231,76,60,0.22); }

.empty-state { color: #555; text-align: center; padding: 60px 20px; }
.loading-state { display: flex; justify-content: center; padding: 60px; }

/* ── 背景格子 ── */
.bg-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 14px; }
.bg-card { background: #161616; border: 1px solid #2a2a2a; border-radius: 14px; overflow: hidden; display: flex; flex-direction: column; }
.bg-card.inactive { opacity: 0.45; }
.bg-thumb { aspect-ratio: 4/3; background: #111; overflow: hidden; }
.bg-thumb img { width: 100%; height: 100%; object-fit: cover; }

/* Modal 沿用後台既有樣式，這裡補 form-grid */
.form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
.form-group { display: flex; flex-direction: column; gap: 6px; }
.form-group.full { grid-column: 1 / -1; }
.form-group label { font-size: 0.82rem; color: #888; }
.radio-label { display: flex; align-items: center; gap: 6px; color: #ccc; font-size: 0.88rem; cursor: pointer; }

/* ── 圖片上傳 ── */
.upload-wrapper {
  display: flex; align-items: center; gap: 20px;
  background: #1a1a1a; padding: 15px; border-radius: 8px;
  border: 1px dashed #444;
}
.image-preview-box {
  width: 120px; height: 90px; flex-shrink: 0;
  background: #111; border-radius: 8px; overflow: hidden;
  display: flex; align-items: center; justify-content: center;
  border: 1px solid #333;
}
.preview-img { width: 100%; height: 100%; object-fit: contain; }
.no-image-text { color: #555; font-size: 0.75rem; text-align: center; line-height: 1.5; }
.no-image-text span { font-size: 0.65rem; color: #444; }
.upload-controls { flex: 1; display: flex; flex-direction: column; gap: 8px; }
.hidden-file-input { display: none; }
.upload-btn {
  display: inline-block; background: #3498db; color: white;
  padding: 8px 16px; border-radius: 8px; font-weight: bold;
  cursor: pointer; transition: 0.2s; font-size: 0.85rem;
  width: fit-content;
}
.upload-btn:hover { background: #2980b9; }
.upload-btn.disabled { background: #555; cursor: not-allowed; }
.upload-url { margin: 0; font-size: 0.65rem; color: #666; word-break: break-all; }

/* ── 共用 Modal ── */
.modal-overlay {
  position: fixed; inset: 0; background: rgba(0,0,0,0.85); z-index: 9999;
  display: flex; justify-content: center; align-items: center;
  backdrop-filter: blur(5px);
}
.modal-content {
  background: #161616; width: 90%; max-width: 620px;
  padding: 25px; border-radius: 16px;
  border: 1px solid #333; max-height: 90vh; overflow-y: auto;
}

/* ── 共用表單 ── */
.admin-input {
  width: 100%; padding: 12px; background: #222;
  border: 1px solid #444; color: white;
  border-radius: 8px; box-sizing: border-box;
  font-family: inherit; font-size: 1rem;
  transition: border 0.2s;
}
.admin-input:focus { border-color: #D4AF37; outline: none; }

/* ── 共用按鈕 ── */
.btn {
  padding: 10px 20px; font-weight: bold;
  border-radius: 8px; cursor: pointer; border: none;
}
.btn-gold { background: #D4AF37; color: black; }
.btn-gold:hover { background: #e5c358; }
.btn-small { padding: 8px 14px; font-size: 0.85rem; }

/* ── Spinner ── */
.spinner {
  width: 30px; height: 30px;
  border: 3px solid rgba(212,175,55,0.2); border-top-color: #D4AF37;
  border-radius: 50%; animation: spin 1s linear infinite; margin: 0 auto;
}
@keyframes spin { to { transform: rotate(360deg); } }

/* ── 角色底圖 ── */
.base-grid {
  display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 14px;
}
.base-card {
  background: #161616; border: 1px solid #2a2a2a; border-radius: 14px;
  overflow: hidden; display: flex; flex-direction: column; transition: border-color 0.2s;
}
.base-card:hover { border-color: #444; }
.base-card.inactive { opacity: 0.45; }
.base-thumb-wrap {
  aspect-ratio: 2/3; background: repeating-conic-gradient(#1a1a1a 0% 25%, #111 0% 50%) 0 0 / 12px 12px;
  display: flex; align-items: center; justify-content: center;
  position: relative; overflow: hidden;
}
.base-thumb-wrap img { width: 100%; height: 100%; object-fit: contain; }
.default-badge {
  position: absolute; top: 6px; right: 6px;
  background: rgba(212,175,55,0.85); color: #000;
  font-size: 0.65rem; font-weight: 800;
  padding: 2px 8px; border-radius: 8px; letter-spacing: 1px;
}
</style>
