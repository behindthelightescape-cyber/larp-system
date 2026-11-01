<script setup>
// 讓上傳區塊支援「拖曳檔案進來」與「貼上圖片」（含 iPhone / iPad）。
// 用法：<ImageDropZone @file="f => handleX(f)"> 原本的上傳 UI </ImageDropZone>
import { ref } from 'vue'

const props = defineProps({ disabled: { type: Boolean, default: false } })
const emit = defineEmits(['file'])

const isOver = ref(false)
const pasteMsg = ref('')
let dragDepth = 0

const flash = (m, ms = 8000) => { pasteMsg.value = m; setTimeout(() => { if (pasteMsg.value === m) pasteMsg.value = '' }, ms) }

// 把來源轉成「已讀進記憶體」的 File。iPad / iPhone 拖曳或貼上時，
// 有時拿到的 File 還沒有內容（size 0），直接上傳會出現「No content provided」。
const materialize = async (src) => {
  if (!src) return null
  const buf = await src.arrayBuffer()
  if (!buf.byteLength) return null
  let type = src.type || 'image/png'
  let name = src.name && src.name.includes('.') ? src.name : `paste.${(type.split('/')[1] || 'png').replace('jpeg', 'jpg')}`
  return new File([buf], name, { type })
}

const describe = (f) => f ? `${f.name || '(無檔名)'}／${f.type || '無類型'}／${f.size} bytes` : '沒有檔案'

// 依序嘗試多個候選來源，取第一個有內容的圖片
const send = async (candidates) => {
  if (props.disabled) return
  const list = candidates.filter(Boolean)
  for (const c of list) {
    if (c.type && !String(c.type).startsWith('image/')) continue
    if (/heic|heif/i.test(c.type || '') || /\.(heic|heif)$/i.test(c.name || '')) { flash('不支援 HEIC，請改用 PNG'); return }
    try {
      const file = await materialize(c)
      if (file) { emit('file', file); return }
    } catch (err) { console.warn('讀取圖片失敗', err) }
  }
  flash(list.length ? `讀不到圖片內容（${list.map(describe).join('、')}），請改用「選擇圖片」` : '沒有讀到圖片')
}

// 拖進來的是圖片網址（例如從網頁拖圖）時，試著下載
const fetchUrl = async (url) => {
  try {
    if (!/^(https?:|blob:|data:)/.test(url)) return null
    const res = await fetch(url)
    if (!res.ok) return null
    const blob = await res.blob()
    return blob.type.startsWith('image/') ? blob : null
  } catch { return null }
}

const onDragEnter = () => { dragDepth++; isOver.value = true }
const onDragLeave = () => { dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) isOver.value = false }
const onDrop = async (e) => {
  dragDepth = 0
  isOver.value = false
  const dt = e.dataTransfer
  if (!dt) return
  // 事件結束後 dataTransfer 會被清空，所以先同步把所有候選拿出來
  const files = [...(dt.files || [])]
  const itemFiles = [...(dt.items || [])].filter(i => i.kind === 'file').map(i => i.getAsFile())
  const url = dt.getData('text/uri-list') || (dt.getData('text/html').match(/<img[^>]+src="([^"]+)"/i) || [])[1] || ''
  const candidates = [...files, ...itemFiles]
  if (url) candidates.push(await fetchUrl(url.split(/\r?\n/)[0].trim()))
  send(candidates)
}

// 在「貼上」框裡長按 → 貼上（iPhone），或 Ctrl/⌘+V（電腦）
const onPaste = (e) => {
  e.preventDefault()
  const cd = e.clipboardData
  const itemFiles = [...(cd?.items || [])].filter(i => i.kind === 'file').map(i => i.getAsFile())
  send([...itemFiles, ...(cd?.files || [])])
}

// 按鈕直接讀剪貼簿（Safari 會跳出「貼上」確認泡泡）
const pasteFromClipboard = async () => {
  if (!navigator.clipboard?.read) { flash('這個瀏覽器不支援，請在旁邊的框裡長按貼上'); return }
  try {
    for (const item of await navigator.clipboard.read()) {
      const type = item.types.find(t => t.startsWith('image/'))
      if (type) {
        const blob = await item.getType(type)
        send([new File([blob], `paste.${type.split('/')[1]}`, { type })])
        return
      }
    }
    flash('剪貼簿裡沒有圖片')
  } catch {
    flash('無法讀取剪貼簿，請在旁邊的框裡長按貼上')
  }
}
</script>

<template>
  <div
    class="drop-zone"
    :class="{ over: isOver && !disabled }"
    @dragenter.prevent="onDragEnter"
    @dragover.prevent
    @dragleave.prevent="onDragLeave"
    @drop.prevent="onDrop"
  >
    <slot />
    <div class="drop-tools">
      <button type="button" class="paste-btn" :disabled="disabled" @click="pasteFromClipboard">📋 貼上圖片</button>
      <div
        class="paste-box"
        contenteditable="true"
        inputmode="none"
        @paste="onPaste"
        @input="e => (e.target.textContent = '')"
      ></div>
      <span class="drop-hint">{{ pasteMsg || '也可以把圖片拖進這個區塊' }}</span>
    </div>
    <div v-if="isOver && !disabled" class="drop-overlay">放開以上傳</div>
  </div>
</template>

<style scoped>
.drop-zone { position: relative; border: 2px dashed transparent; border-radius: 12px; padding: 6px; transition: 0.15s; }
.drop-zone.over { border-color: #D4AF37; background: rgba(212, 175, 55, 0.08); }
.drop-tools { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-top: 8px; }
.paste-btn { background: #2a2a2a; color: #eee; border: 1px solid #444; border-radius: 8px; padding: 6px 12px; font-size: 0.82rem; cursor: pointer; }
.paste-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.paste-box { min-width: 120px; height: 30px; border: 1px dashed #555; border-radius: 8px; color: transparent; caret-color: #D4AF37; overflow: hidden; outline: none; }
.paste-box:empty::before { content: '長按這裡貼上'; color: #777; font-size: 0.78rem; line-height: 30px; padding-left: 8px; }
.paste-box:focus { border-color: #D4AF37; }
.drop-hint { color: #888; font-size: 0.78rem; }
.drop-overlay { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; background: rgba(0, 0, 0, 0.6); color: #D4AF37; font-weight: bold; border-radius: 12px; pointer-events: none; }
</style>
