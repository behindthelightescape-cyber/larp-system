<script setup>
import { ref, onMounted } from 'vue'
import { supabase } from '../supabase'

const senderName = ref('命運女神')
const senderIconUrl = ref('')
const isSavingSettings = ref(false)

const cards = ref([])
const isLoading = ref(true)
const showModal = ref(false)
const isEditing = ref(false)
const isUploading = ref(false)

const form = ref({
  id: null,
  card_number: 0,
  name: '',
  image_url: '',
  image_url_reversed: '',
  meaning_upright: '',
  meaning_reversed: '',
  is_active: true,
  sort_order: 0,
})

const loadSettings = async () => {
  const { data } = await supabase
    .from('group_settings')
    .select('key, value')
    .in('key', ['tarot_sender_name', 'tarot_sender_icon_url'])
  if (data) {
    const n = data.find(r => r.key === 'tarot_sender_name')
    const i = data.find(r => r.key === 'tarot_sender_icon_url')
    if (n) senderName.value = n.value
    if (i) senderIconUrl.value = i.value
  }
}

const saveSettings = async () => {
  isSavingSettings.value = true
  try {
    await Promise.all([
      supabase.from('group_settings').upsert({ key: 'tarot_sender_name', value: senderName.value }, { onConflict: 'key' }),
      supabase.from('group_settings').upsert({ key: 'tarot_sender_icon_url', value: senderIconUrl.value }, { onConflict: 'key' }),
    ])
    alert('設定已儲存')
  } catch (err) {
    alert('儲存失敗：' + err.message)
  } finally {
    isSavingSettings.value = false
  }
}

const fetchCards = async () => {
  isLoading.value = true
  const { data } = await supabase.from('tarot_cards').select('*').order('sort_order').order('card_number')
  cards.value = data || []
  isLoading.value = false
}

onMounted(() => Promise.all([loadSettings(), fetchCards()]))

// 把 File 旋轉 180° 後回傳新的 Blob
const rotateImage180 = (file) => new Promise((resolve, reject) => {
  const img = new Image()
  const url = URL.createObjectURL(file)
  img.onload = () => {
    const canvas = document.createElement('canvas')
    canvas.width  = img.width
    canvas.height = img.height
    const ctx = canvas.getContext('2d')
    ctx.translate(img.width / 2, img.height / 2)
    ctx.rotate(Math.PI)
    ctx.drawImage(img, -img.width / 2, -img.height / 2)
    URL.revokeObjectURL(url)
    canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('旋轉失敗')), file.type)
  }
  img.onerror = reject
  img.src = url
})

const handleImageUpload = async (event) => {
  const file = event.target.files[0]
  if (!file) return
  isUploading.value = true
  try {
    const ext  = file.name.split('.').pop()
    const base = `${Date.now()}_${Math.random().toString(36).substring(7)}`
    const nameUpright  = `${base}.${ext}`
    const nameReversed = `${base}_rev.${ext}`

    // 旋轉 180° 產生逆位圖
    const reversedBlob = await rotateImage180(file)

    // 兩張同時上傳
    const [upRes, revRes] = await Promise.all([
      supabase.storage.from('tarot').upload(nameUpright,  file),
      supabase.storage.from('tarot').upload(nameReversed, reversedBlob),
    ])
    if (upRes.error)  throw upRes.error
    if (revRes.error) throw revRes.error

    form.value.image_url          = supabase.storage.from('tarot').getPublicUrl(nameUpright).data.publicUrl
    form.value.image_url_reversed = supabase.storage.from('tarot').getPublicUrl(nameReversed).data.publicUrl
  } catch (err) {
    alert('上傳失敗：' + err.message)
  } finally {
    isUploading.value = false
    event.target.value = ''
  }
}

const openAdd = () => {
  isEditing.value = false
  form.value = {
    id: null,
    card_number: cards.value.length,
    name: '',
    image_url: '',
    image_url_reversed: '',
    meaning_upright: '',
    meaning_reversed: '',
    is_active: true,
    sort_order: cards.value.length,
  }
  showModal.value = true
}

const openEdit = (card) => {
  isEditing.value = true
  form.value = { ...card }
  showModal.value = true
}

const saveCard = async () => {
  if (!form.value.name) return alert('牌名必填')
  const payload = {
    card_number:        form.value.card_number,
    name:               form.value.name,
    image_url:          form.value.image_url,
    image_url_reversed: form.value.image_url_reversed,
    meaning_upright:    form.value.meaning_upright,
    meaning_reversed:   form.value.meaning_reversed,
    is_active:          form.value.is_active,
    sort_order:         form.value.sort_order,
  }
  try {
    if (isEditing.value) {
      const { error } = await supabase.from('tarot_cards').update(payload).eq('id', form.value.id)
      if (error) throw error
    } else {
      const { error } = await supabase.from('tarot_cards').insert([payload])
      if (error) throw error
    }
    showModal.value = false
    await fetchCards()
  } catch (err) {
    alert('儲存失敗：' + err.message)
  }
}

const deleteCard = async (id, name) => {
  if (!confirm(`確定刪除「${name}」？`)) return
  await supabase.from('tarot_cards').delete().eq('id', id)
  await fetchCards()
}

const toggleActive = async (card) => {
  await supabase.from('tarot_cards').update({ is_active: !card.is_active }).eq('id', card.id)
  card.is_active = !card.is_active
}
</script>

<template>
  <div class="tarot-admin">

    <!-- 人格設定 -->
    <div class="section-card">
      <h4 class="section-title">Bot 人格設定</h4>
      <div class="settings-grid">
        <div class="form-group">
          <label>抽牌時顯示名稱</label>
          <input v-model="senderName" type="text" class="admin-input" placeholder="命運女神" />
        </div>
        <div class="form-group">
          <label>頭貼圖片 URL</label>
          <input v-model="senderIconUrl" type="text" class="admin-input" placeholder="https://..." />
        </div>
        <div class="form-group preview-group">
          <label>預覽</label>
          <div class="sender-preview">
            <img v-if="senderIconUrl" :src="senderIconUrl" class="preview-avatar" />
            <div v-else class="preview-avatar-empty">?</div>
            <span class="preview-name">{{ senderName || '命運女神' }}</span>
          </div>
        </div>
      </div>
      <button class="btn btn-gold" :disabled="isSavingSettings" @click="saveSettings">
        {{ isSavingSettings ? '儲存中...' : '儲存設定' }}
      </button>
    </div>

    <!-- 牌庫管理 -->
    <div class="section-card">
      <div class="section-header">
        <h4 class="section-title">塔羅牌庫（{{ cards.filter(c => c.is_active).length }} / {{ cards.length }} 張啟用）</h4>
        <button class="btn btn-gold btn-small" @click="openAdd">+ 新增牌卡</button>
      </div>

      <div v-if="isLoading" class="loading-state">
        <div class="spinner"></div>
      </div>

      <div v-else class="card-grid">
        <div v-for="card in cards" :key="card.id" class="tarot-card" :class="{ inactive: !card.is_active }">
          <div class="card-img-wrap">
            <img v-if="card.image_url" :src="card.image_url" class="card-img" />
            <div v-else class="card-img-empty">無圖</div>
            <div class="card-number-badge">{{ card.card_number }}</div>
          </div>
          <div class="card-body">
            <div class="card-name">{{ card.name }}</div>
            <div class="card-meaning-preview" v-if="card.meaning_upright">
              正：{{ card.meaning_upright.slice(0, 30) }}{{ card.meaning_upright.length > 30 ? '...' : '' }}
            </div>
            <div class="card-meaning-preview reversed" v-if="card.meaning_reversed">
              逆：{{ card.meaning_reversed.slice(0, 30) }}{{ card.meaning_reversed.length > 30 ? '...' : '' }}
            </div>
            <div class="card-actions">
              <button class="action-btn" @click="toggleActive(card)">
                {{ card.is_active ? '停用' : '啟用' }}
              </button>
              <button class="action-btn edit" @click="openEdit(card)">編輯</button>
              <button class="action-btn delete" @click="deleteCard(card.id, card.name)">刪除</button>
            </div>
          </div>
        </div>
        <div v-if="cards.length === 0" class="empty-text">尚未建立任何牌卡</div>
      </div>
    </div>

    <!-- 編輯 Modal -->
    <Teleport to="body">
      <transition name="fade">
        <div v-if="showModal" class="modal-overlay" @click.self="showModal = false">
          <div class="modal-content">
            <div class="modal-header">
              <h3>{{ isEditing ? '編輯牌卡' : '新增牌卡' }}</h3>
              <button class="close-btn" @click="showModal = false">✕</button>
            </div>
            <div class="modal-body">

              <div class="form-row">
                <div class="form-group">
                  <label>牌號</label>
                  <input v-model.number="form.card_number" type="number" class="admin-input" min="0" max="21" />
                </div>
                <div class="form-group">
                  <label>牌名</label>
                  <input v-model="form.name" type="text" class="admin-input" placeholder="愚者" />
                </div>
              </div>

              <div class="form-group">
                <label>牌圖</label>
                <div class="upload-area">
                  <img v-if="form.image_url" :src="form.image_url" class="upload-preview" />
                  <div v-else class="upload-empty">尚未上傳</div>
                  <div>
                    <input type="file" id="tarotImg" accept="image/*" class="hidden-input" @change="handleImageUpload" :disabled="isUploading" />
                    <label for="tarotImg" class="upload-btn" :class="{ disabled: isUploading }">
                      {{ isUploading ? '上傳中...' : form.image_url ? '更換圖片' : '上傳圖片' }}
                    </label>
                  </div>
                </div>
              </div>

              <div class="form-group">
                <label>正位牌義</label>
                <textarea v-model="form.meaning_upright" class="admin-input" rows="4" placeholder="輸入正位牌義..."></textarea>
              </div>

              <div class="form-group">
                <label>逆位牌義</label>
                <textarea v-model="form.meaning_reversed" class="admin-input reversed-input" rows="4" placeholder="輸入逆位牌義..."></textarea>
              </div>

              <div class="form-group">
                <label>排序權重</label>
                <input v-model.number="form.sort_order" type="number" class="admin-input" />
              </div>

            </div>
            <div class="modal-footer">
              <button class="btn btn-outline" @click="showModal = false">取消</button>
              <button class="btn btn-gold" @click="saveCard" :disabled="isUploading">
                {{ isUploading ? '上傳中...' : '儲存' }}
              </button>
            </div>
          </div>
        </div>
      </transition>
    </Teleport>

  </div>
</template>

<style scoped>
.tarot-admin { display: flex; flex-direction: column; gap: 24px; }

.section-card { background: #151515; border: 1px solid #2a2a2a; border-radius: 12px; padding: 24px; }
.section-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
.section-title { color: #D4AF37; font-size: 0.95rem; font-weight: 700; margin: 0 0 20px 0; border-left: 4px solid #D4AF37; padding-left: 10px; }

.settings-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 16px; margin-bottom: 16px; }
.form-group { display: flex; flex-direction: column; gap: 8px; }
.form-group label { color: #aaa; font-size: 0.85rem; font-weight: bold; }
.admin-input { background: #222; border: 1px solid #444; color: #fff; border-radius: 8px; padding: 10px 12px; font-size: 0.9rem; width: 100%; box-sizing: border-box; }
.admin-input:focus { border-color: #D4AF37; outline: none; }
textarea.admin-input { resize: vertical; font-family: inherit; }
.reversed-input { border-color: #4a2a4a; }
.reversed-input:focus { border-color: #9b59b6; }

.sender-preview { display: flex; align-items: center; gap: 10px; background: #1a1a1a; border: 1px solid #333; border-radius: 8px; padding: 10px 14px; }
.preview-avatar { width: 36px; height: 36px; border-radius: 50%; object-fit: cover; }
.preview-avatar-empty { width: 36px; height: 36px; border-radius: 50%; background: #333; display: flex; align-items: center; justify-content: center; color: #666; font-size: 1rem; }
.preview-name { color: #fff; font-weight: bold; font-size: 0.9rem; }

.loading-state { display: flex; justify-content: center; padding: 40px; }
.spinner { width: 36px; height: 36px; border: 3px solid rgba(212,175,55,0.2); border-top-color: #D4AF37; border-radius: 50%; animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

.card-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 16px; }
.tarot-card { background: #111; border: 1px solid #2a2a2a; border-radius: 10px; overflow: hidden; transition: 0.2s; }
.tarot-card:hover { border-color: #444; }
.tarot-card.inactive { opacity: 0.45; }

.card-img-wrap { position: relative; height: 200px; background: #0a0a0a; }
.card-img { width: 100%; height: 100%; object-fit: cover; }
.card-img-empty { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; color: #333; font-size: 0.85rem; }
.card-number-badge { position: absolute; top: 8px; left: 8px; background: rgba(0,0,0,0.85); border: 1px solid #D4AF37; color: #D4AF37; font-size: 0.75rem; font-weight: bold; padding: 2px 8px; border-radius: 10px; }

.card-body { padding: 12px; }
.card-name { color: #fff; font-weight: bold; font-size: 0.95rem; margin-bottom: 6px; }
.card-meaning-preview { font-size: 0.75rem; color: #888; line-height: 1.4; margin-bottom: 3px; }
.card-meaning-preview.reversed { color: #7a5a8a; }

.card-actions { display: flex; gap: 6px; margin-top: 10px; }
.action-btn { flex: 1; padding: 6px 4px; border: 1px solid #444; background: #1a1a1a; color: #aaa; border-radius: 6px; font-size: 0.78rem; cursor: pointer; transition: 0.2s; }
.action-btn:hover { background: #2a2a2a; color: #fff; }
.action-btn.edit { border-color: #D4AF37; color: #D4AF37; }
.action-btn.edit:hover { background: rgba(212,175,55,0.1); }
.action-btn.delete { border-color: #552222; color: #e74c3c; }
.action-btn.delete:hover { background: #e74c3c; color: #fff; border-color: #e74c3c; }

.empty-text { color: #444; text-align: center; padding: 40px; font-size: 0.9rem; grid-column: 1/-1; }

/* Modal */
.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.8); z-index: 9999; display: flex; justify-content: center; align-items: center; backdrop-filter: blur(4px); }
.modal-content { background: #161616; width: 90%; max-width: 560px; max-height: 90vh; border-radius: 14px; display: flex; flex-direction: column; border: 1px solid #333; }
.modal-header { padding: 18px 24px; border-bottom: 1px solid #222; display: flex; justify-content: space-between; align-items: center; }
.modal-header h3 { margin: 0; color: #D4AF37; font-size: 1rem; }
.close-btn { background: none; border: none; color: #888; font-size: 1.1rem; cursor: pointer; }
.modal-body { padding: 24px; overflow-y: auto; flex: 1; display: flex; flex-direction: column; gap: 16px; }
.modal-footer { padding: 16px 24px; border-top: 1px solid #222; display: flex; justify-content: flex-end; gap: 12px; }

.form-row { display: grid; grid-template-columns: 1fr 2fr; gap: 14px; }

.upload-area { display: flex; align-items: center; gap: 16px; background: #1a1a1a; border: 1px dashed #444; border-radius: 8px; padding: 14px; }
.upload-preview { width: 80px; height: 120px; object-fit: cover; border-radius: 6px; border: 1px solid #333; }
.upload-empty { width: 80px; height: 120px; background: #111; border-radius: 6px; display: flex; align-items: center; justify-content: center; color: #444; font-size: 0.8rem; }
.hidden-input { display: none; }
.upload-btn { display: inline-block; background: #3498db; color: #fff; padding: 8px 16px; border-radius: 7px; font-size: 0.85rem; font-weight: bold; cursor: pointer; transition: 0.2s; }
.upload-btn:hover { background: #2980b9; }
.upload-btn.disabled { background: #444; cursor: not-allowed; color: #888; }

.btn { padding: 10px 20px; border: none; font-weight: bold; border-radius: 8px; cursor: pointer; transition: 0.2s; font-size: 0.9rem; }
.btn-gold { background: #D4AF37; color: #000; }
.btn-gold:hover { background: #e5c358; }
.btn-gold:disabled { background: #555; color: #888; cursor: not-allowed; }
.btn-outline { background: transparent; border: 1px solid #555; color: #ccc; }
.btn-outline:hover { background: #222; }
.btn-small { padding: 7px 14px; font-size: 0.85rem; }

.fade-enter-active, .fade-leave-active { transition: opacity 0.25s; }
.fade-enter-from, .fade-leave-to { opacity: 0; }

@media (max-width: 768px) {
  .settings-grid { grid-template-columns: 1fr; }
  .card-grid { grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); }
}
</style>
