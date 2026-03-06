<script setup>
import { ref, computed, onMounted } from 'vue'
import { supabase } from '../supabase'

const BUCKET = 'display-ads'

// ── 廣告清單 ──
const ads       = ref([])
const isLoading = ref(true)
const preview   = ref(null)

// ── 新增表單 ──
const adType      = ref('video')   // 'video' | 'image' | 'text' | 'qr'
const newTitle    = ref('')
const urlInput    = ref('')        // 手動貼連結
const useUrl      = ref(false)     // true = 貼連結模式, false = 上傳模式
const fileInput   = ref(null)
const selectedFile = ref(null)
const textTitle   = ref('')
const textBody    = ref('')
const textAccent  = ref('#D4AF37')

const isSaving        = ref(false)
const uploadProgress  = ref(0)
const uploadError     = ref('')

const TYPE_OPTIONS = [
  { key: 'video', label: '影片', icon: '🎬' },
  { key: 'image', label: '圖片', icon: '🖼️' },
  { key: 'text',  label: '文字', icon: '📝' },
  { key: 'qr',   label: '掃描頁', icon: '📱' },
]
const acceptAttr = computed(() => adType.value === 'image' ? 'image/*' : 'video/*')
const needsMedia = computed(() => adType.value === 'video' || adType.value === 'image')

const onTypeChange = () => {
  selectedFile.value = null
  urlInput.value = ''
  uploadError.value = ''
  if (fileInput.value) fileInput.value.value = ''
}

const onFileChange = (e) => {
  const file = e.target.files[0]
  if (!file) return
  selectedFile.value = file
  if (!newTitle.value.trim())
    newTitle.value = file.name.replace(/\.[^/.]+$/, '')
}

// ── 載入廣告 ──
const loadAds = async () => {
  const { data } = await supabase
    .from('display_ads').select('*').order('order_index')
  if (data) ads.value = data
  isLoading.value = false
}

// ── 新增 ──
const addAd = async () => {
  if (!newTitle.value.trim()) return
  if (needsMedia.value && !selectedFile.value && !urlInput.value.trim()) return

  isSaving.value = true
  uploadProgress.value = 0
  uploadError.value = ''

  try {
    let contentUrl = urlInput.value.trim() || null

    // 上傳到 Storage（如果選了檔案）
    if (selectedFile.value) {
      const ext  = selectedFile.value.name.split('.').pop()
      const path = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(path, selectedFile.value, {
          cacheControl: '3600',
          onUploadProgress: (e) => {
            uploadProgress.value = Math.round((e.loaded / e.total) * 100)
          }
        })
      if (upErr) throw upErr
      const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(path)
      contentUrl = urlData.publicUrl
    }

    const maxOrder = ads.value.length
      ? Math.max(...ads.value.map(a => a.order_index)) + 1 : 0

    const row = {
      title:       newTitle.value.trim(),
      type:        adType.value,
      content_url: contentUrl,
      text_title:  adType.value === 'text' ? textTitle.value.trim() : null,
      text_body:   adType.value === 'text' ? textBody.value.trim()  : null,
      text_accent: adType.value === 'text' ? textAccent.value       : null,
      order_index: maxOrder,
    }
    const { error: dbErr } = await supabase.from('display_ads').insert(row)
    if (dbErr) throw dbErr

    // 清空
    newTitle.value = ''; urlInput.value = ''; selectedFile.value = null
    textTitle.value = ''; textBody.value = ''; textAccent.value = '#D4AF37'
    if (fileInput.value) fileInput.value.value = ''
    uploadProgress.value = 0
    await loadAds()
  } catch (err) {
    uploadError.value = err.message || '新增失敗'
  } finally {
    isSaving.value = false
  }
}

// ── 清單操作 ──
const toggleActive = async (ad) => {
  await supabase.from('display_ads').update({ is_active: !ad.is_active }).eq('id', ad.id)
  ad.is_active = !ad.is_active
}
const deleteAd = async (id) => {
  if (!confirm('確定要刪除？')) return
  await supabase.from('display_ads').delete().eq('id', id)
  if (preview.value === id) preview.value = null
  await loadAds()
}
const swap = async (indexA, indexB) => {
  const a = ads.value[indexA]; const b = ads.value[indexB]
  await Promise.all([
    supabase.from('display_ads').update({ order_index: b.order_index }).eq('id', a.id),
    supabase.from('display_ads').update({ order_index: a.order_index }).eq('id', b.id),
  ])
  await loadAds()
}

const typeLabel = (type) => TYPE_OPTIONS.find(t => t.key === type)?.label ?? type
const typeIcon  = (type) => TYPE_OPTIONS.find(t => t.key === type)?.icon ?? '📄'

onMounted(loadAds)
</script>

<template>
  <div class="da-root">

    <div class="da-top-bar">
      <a href="/#/display" target="_blank" class="da-link-btn">📺 開啟電視端</a>
    </div>

    <!-- ── 新增廣告 ── -->
    <div class="da-card">
      <h3 class="da-card-title">新增廣告</h3>

      <!-- 類型選擇 -->
      <div class="type-tabs">
        <button
          v-for="t in TYPE_OPTIONS" :key="t.key"
          class="type-tab"
          :class="{ active: adType === t.key }"
          @click="adType = t.key; onTypeChange()"
        >
          <span>{{ t.icon }}</span>
          <span>{{ t.label }}</span>
        </button>
      </div>

      <!-- 名稱 -->
      <input v-model="newTitle" class="da-input" placeholder="廣告名稱（後台識別用）" style="margin-bottom: 12px;" />

      <!-- 影片 / 圖片 -->
      <template v-if="needsMedia">
        <div class="source-toggle">
          <button :class="{ active: !useUrl }" @click="useUrl = false">上傳檔案</button>
          <button :class="{ active: useUrl  }" @click="useUrl = true">貼上連結</button>
        </div>

        <!-- 上傳 -->
        <template v-if="!useUrl">
          <div
            class="da-drop-zone"
            :class="{ 'has-file': selectedFile }"
            @click="fileInput.click()"
            @dragover.prevent
            @drop.prevent="e => { selectedFile = e.dataTransfer.files[0]; if (!newTitle.trim()) newTitle = selectedFile.name.replace(/\.[^/.]+$/, '') }"
          >
            <input ref="fileInput" type="file" :accept="acceptAttr" class="da-file-input" @change="onFileChange" />
            <template v-if="selectedFile">
              <span class="da-drop-icon">{{ adType === 'image' ? '🖼️' : '🎬' }}</span>
              <span class="da-drop-filename">{{ selectedFile.name }}</span>
              <span class="da-drop-size">{{ (selectedFile.size / 1024 / 1024).toFixed(1) }} MB</span>
            </template>
            <template v-else>
              <span class="da-drop-icon">＋</span>
              <span class="da-drop-label">點擊或拖曳{{ adType === 'image' ? '圖片' : '影片' }}至此</span>
              <span class="da-drop-hint">{{ adType === 'image' ? 'JPG、PNG、GIF、WebP' : 'MP4、WebM、MOV' }}</span>
              <span v-if="adType === 'image'" class="da-drop-hint">建議尺寸：1920 × 1080px（16:9 橫向）</span>
            </template>
          </div>
        </template>

        <!-- 連結 -->
        <template v-else>
          <input
            v-model="urlInput"
            class="da-input"
            :placeholder="adType === 'image' ? '圖片直連網址（JPG / PNG / GIF）' : '影片直連網址（MP4 / WebM）'"
          />
          <p v-if="adType === 'image'" class="da-media-hint">建議尺寸：1920 × 1080px（16:9 橫向），電視全版顯示</p>
        </template>

        <!-- 進度 -->
        <div v-if="isSaving && !useUrl" class="da-progress-wrap">
          <div class="da-progress-bar-fill" :style="{ width: uploadProgress + '%' }"></div>
          <span class="da-progress-label">{{ uploadProgress }}%</span>
        </div>
      </template>

      <!-- 文字類型 -->
      <template v-else-if="adType === 'text'">
        <input v-model="textTitle" class="da-input" placeholder="大標題" style="margin-bottom: 10px;" />
        <textarea v-model="textBody" class="da-textarea" placeholder="內文（可換行）" rows="3"></textarea>
        <div class="da-color-row">
          <label class="da-color-label">強調色</label>
          <input type="color" v-model="textAccent" class="da-color-input" />
          <span class="da-color-val">{{ textAccent }}</span>
        </div>
        <!-- 預覽 -->
        <div class="text-preview" :style="{ borderColor: textAccent + '66' }">
          <h2 class="tp-title" :style="{ color: textAccent }">{{ textTitle || '大標題預覽' }}</h2>
          <p class="tp-body">{{ textBody || '內文預覽...' }}</p>
        </div>
      </template>

      <!-- 掃描頁 -->
      <template v-else-if="adType === 'qr'">
        <div class="qr-type-hint">
          <span>📱</span>
          <div>
            <p>掃描頁會在輪播中顯示全版 QR Code，供玩家掃描登入。</p>
            <p>無需額外設定，直接新增即可。</p>
          </div>
        </div>
      </template>

      <p v-if="uploadError" class="da-error">⚠ {{ uploadError }}</p>

      <button
        class="da-add-btn"
        :disabled="isSaving || !newTitle.trim() || (needsMedia && !selectedFile && !urlInput.trim()) || (adType === 'text' && !textTitle.trim())"
        @click="addAd"
        style="margin-top: 14px;"
      >
        {{ isSaving ? '新增中...' : '＋ 新增' }}
      </button>
    </div>

    <!-- ── 播放清單 ── -->
    <div class="da-card">
      <h3 class="da-card-title">
        播放清單
        <span class="da-badge">{{ ads.filter(a => a.is_active).length }} / {{ ads.length }} 啟用</span>
      </h3>

      <div v-if="isLoading" class="da-state">載入中...</div>
      <div v-else-if="ads.length === 0" class="da-state">尚無廣告，請新增。</div>

      <div v-else class="da-list">
        <div
          v-for="(ad, i) in ads" :key="ad.id"
          class="da-item" :class="{ inactive: !ad.is_active }"
        >
          <div class="da-order-col">
            <button class="da-small-btn" :disabled="i === 0" @click="swap(i, i-1)">▲</button>
            <span class="da-order-num">{{ i + 1 }}</span>
            <button class="da-small-btn" :disabled="i === ads.length-1" @click="swap(i, i+1)">▼</button>
          </div>

          <div class="da-type-badge">{{ typeIcon(ad.type) }}</div>

          <div class="da-item-info">
            <span class="da-item-title">{{ ad.title }}</span>
            <span class="da-item-meta">
              {{ typeLabel(ad.type) }}
              <template v-if="ad.content_url || ad.video_url">
                · {{ (ad.content_url || ad.video_url).split('/').pop().slice(0, 40) }}
              </template>
              <template v-else-if="ad.type === 'text'">
                · {{ ad.text_title }}
              </template>
            </span>
          </div>

          <div class="da-item-actions">
            <button
              class="da-action-btn" :class="{ 'btn-active': ad.is_active }"
              @click="toggleActive(ad)"
            >{{ ad.is_active ? '✓ 啟用' : '✕ 停用' }}</button>
            <button
              v-if="ad.type === 'video' || ad.type === 'image'"
              class="da-action-btn" :class="{ 'btn-preview': preview === ad.id }"
              @click="preview = preview === ad.id ? null : ad.id"
            >{{ preview === ad.id ? '收起' : '預覽' }}</button>
            <button class="da-action-btn btn-danger" @click="deleteAd(ad.id)">刪除</button>
          </div>
        </div>

        <!-- 預覽 -->
        <transition name="preview-drop">
          <div v-if="preview" class="da-preview">
            <video v-if="ads.find(a => a.id === preview)?.type === 'video'"
              :key="preview" class="da-preview-media" controls autoplay muted
              :src="ads.find(a => a.id === preview)?.content_url || ads.find(a => a.id === preview)?.video_url"
            ></video>
            <img v-else
              class="da-preview-media"
              :src="ads.find(a => a.id === preview)?.content_url"
            />
          </div>
        </transition>
      </div>
    </div>

  </div>
</template>

<style scoped>
.da-root { display: flex; flex-direction: column; gap: 24px; }

.da-top-bar { display: flex; justify-content: flex-end; }
.da-link-btn {
  padding: 8px 18px; border-radius: 8px; font-size: 0.85rem; font-weight: 600;
  background: rgba(212,175,55,0.1); border: 1px solid rgba(212,175,55,0.3);
  color: #D4AF37; text-decoration: none; transition: background 0.2s;
}
.da-link-btn:hover { background: rgba(212,175,55,0.18); }

.da-card {
  background: #111; border: 1px solid #222; border-radius: 12px; padding: 22px 24px;
}
.da-card-title {
  font-size: 1rem; font-weight: 700; color: #ccc;
  margin: 0 0 18px; display: flex; align-items: center; gap: 10px;
}
.da-badge {
  font-size: 0.72rem; color: #555; background: #1a1a1a;
  border: 1px solid #2a2a2a; padding: 2px 10px; border-radius: 20px; margin-left: auto;
}

/* 類型 tabs */
.type-tabs { display: flex; gap: 6px; margin-bottom: 16px; flex-wrap: wrap; }
.type-tab {
  display: flex; align-items: center; gap: 6px;
  padding: 8px 16px; border-radius: 8px; border: 1px solid #252525;
  background: #0a0a0a; color: #555; font-size: 0.85rem; cursor: pointer;
  transition: all 0.15s;
}
.type-tab:hover { border-color: #444; color: #aaa; }
.type-tab.active { border-color: rgba(212,175,55,0.5); background: rgba(212,175,55,0.08); color: #D4AF37; }

/* 來源切換 */
.source-toggle {
  display: flex; gap: 0; margin-bottom: 12px;
  border: 1px solid #252525; border-radius: 8px; overflow: hidden; width: fit-content;
}
.source-toggle button {
  padding: 7px 18px; background: #0a0a0a; border: none; color: #555;
  font-size: 0.82rem; cursor: pointer; transition: all 0.15s;
}
.source-toggle button.active { background: #1e1e1e; color: #D4AF37; }

.da-input {
  width: 100%; box-sizing: border-box;
  background: #0a0a0a; border: 1px solid #2a2a2a; border-radius: 8px;
  padding: 10px 14px; color: #fff; font-size: 0.9rem; outline: none;
  transition: border-color 0.2s;
}
.da-input:focus { border-color: rgba(212,175,55,0.5); }

.da-textarea {
  width: 100%; box-sizing: border-box; resize: vertical;
  background: #0a0a0a; border: 1px solid #2a2a2a; border-radius: 8px;
  padding: 10px 14px; color: #fff; font-size: 0.9rem; outline: none;
  font-family: inherit; margin-bottom: 12px; transition: border-color 0.2s;
}
.da-textarea:focus { border-color: rgba(212,175,55,0.5); }

/* 拖拉上傳 */
.da-drop-zone {
  border: 2px dashed #2a2a2a; border-radius: 10px;
  padding: 28px 20px; text-align: center; cursor: pointer;
  display: flex; flex-direction: column; align-items: center; gap: 6px;
  margin-bottom: 10px; transition: border-color 0.2s, background 0.2s;
}
.da-drop-zone:hover { border-color: rgba(212,175,55,0.4); background: rgba(212,175,55,0.03); }
.da-drop-zone.has-file { border-color: rgba(212,175,55,0.5); background: rgba(212,175,55,0.05); }
.da-file-input { display: none; }
.da-drop-icon     { font-size: 1.8rem; line-height: 1; }
.da-drop-label    { font-size: 0.9rem; color: #888; }
.da-drop-hint     { font-size: 0.7rem; color: #444; }
.da-drop-filename { font-size: 0.88rem; color: #D4AF37; font-weight: 600; word-break: break-all; }
.da-drop-size     { font-size: 0.7rem; color: #555; }

/* 進度 */
.da-progress-wrap {
  position: relative; height: 6px; background: #1a1a1a;
  border-radius: 3px; overflow: hidden; margin-bottom: 8px;
}
.da-progress-bar-fill {
  height: 100%; background: #D4AF37; border-radius: 3px; transition: width 0.2s ease;
}
.da-progress-label {
  position: absolute; right: 0; top: -18px;
  font-size: 0.68rem; color: #D4AF37; font-family: monospace;
}

/* 顏色 */
.da-color-row { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
.da-color-label { font-size: 0.82rem; color: #777; }
.da-color-input { width: 36px; height: 36px; border: 1px solid #333; border-radius: 6px; cursor: pointer; padding: 2px; background: #0a0a0a; }
.da-color-val { font-size: 0.78rem; color: #555; font-family: monospace; }

/* 文字預覽 */
.text-preview {
  border: 1px solid rgba(212,175,55,0.2); border-radius: 10px;
  padding: 20px 24px; background: #0a0a0a;
}
.tp-title { font-size: 1.6rem; font-weight: 900; margin: 0 0 8px; }
.tp-body  { font-size: 0.9rem; color: #666; margin: 0; white-space: pre-line; line-height: 1.7; }

/* 掃描頁提示 */
.qr-type-hint {
  display: flex; gap: 14px; align-items: flex-start;
  background: rgba(255,255,255,0.03); border: 1px solid #1e1e1e;
  border-radius: 10px; padding: 16px 18px; font-size: 0.88rem;
}
.qr-type-hint span { font-size: 1.5rem; flex-shrink: 0; margin-top: 2px; }
.qr-type-hint p { color: #666; margin: 0 0 4px; line-height: 1.5; }
.qr-type-hint p:last-child { margin: 0; }

.da-media-hint { font-size: 0.72rem; color: #444; margin: 6px 0 0; letter-spacing: 0.3px; }
.da-error { font-size: 0.8rem; color: #f87171; margin: 6px 0 0; }
.da-add-btn {
  width: 100%; padding: 11px; border-radius: 8px; border: none;
  background: #D4AF37; color: #000; font-weight: 700; font-size: 0.95rem;
  cursor: pointer; transition: opacity 0.2s;
}
.da-add-btn:disabled { opacity: 0.35; cursor: not-allowed; }

/* 清單 */
.da-state { text-align: center; color: #444; padding: 30px 0; font-size: 0.9rem; }
.da-list  { display: flex; flex-direction: column; }
.da-item  {
  display: flex; align-items: center; gap: 12px;
  padding: 11px 0; border-bottom: 1px solid #1a1a1a; transition: opacity 0.2s;
}
.da-item:last-of-type { border-bottom: none; }
.da-item.inactive { opacity: 0.35; }

.da-order-col { display: flex; flex-direction: column; align-items: center; gap: 1px; flex-shrink: 0; }
.da-small-btn {
  background: none; border: 1px solid #252525; color: #555;
  width: 22px; height: 22px; border-radius: 4px; cursor: pointer; font-size: 0.6rem;
  display: flex; align-items: center; justify-content: center; transition: color 0.2s;
}
.da-small-btn:hover:not(:disabled) { color: #ccc; border-color: #555; }
.da-small-btn:disabled { opacity: 0.2; cursor: default; }
.da-order-num { font-size: 0.7rem; color: #444; font-family: monospace; padding: 2px 0; }

.da-type-badge { font-size: 1.2rem; flex-shrink: 0; width: 28px; text-align: center; }

.da-item-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.da-item-title { font-size: 0.92rem; color: #ccc; font-weight: 600; }
.da-item-meta  {
  font-size: 0.7rem; color: #333; font-family: monospace;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}

.da-item-actions { display: flex; gap: 5px; flex-shrink: 0; }
.da-action-btn {
  padding: 4px 11px; border-radius: 6px; border: 1px solid #2a2a2a;
  background: #151515; color: #555; font-size: 0.76rem; cursor: pointer;
  transition: all 0.15s;
}
.da-action-btn:hover        { color: #aaa; border-color: #444; }
.da-action-btn.btn-active   { color: #4ade80; border-color: rgba(74,222,128,0.3); }
.da-action-btn.btn-preview  { color: #D4AF37; border-color: rgba(212,175,55,0.3); }
.da-action-btn.btn-danger:hover { color: #f87171; border-color: rgba(248,113,113,0.3); }

.da-preview { padding: 14px 0 4px; border-top: 1px solid #1a1a1a; }
.da-preview-media { width: 100%; max-height: 260px; border-radius: 8px; background: #000; object-fit: contain; }

.preview-drop-enter-active { transition: opacity 0.3s ease, transform 0.3s ease; }
.preview-drop-leave-active { transition: opacity 0.2s ease; }
.preview-drop-enter-from   { opacity: 0; transform: translateY(-8px); }
.preview-drop-leave-to     { opacity: 0; }
</style>
