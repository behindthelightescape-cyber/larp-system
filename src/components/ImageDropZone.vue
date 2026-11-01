<script setup>
// 讓上傳區塊支援「拖曳檔案進來」與「貼上圖片」（含 iPhone / iPad）。
// 用法：<ImageDropZone @file="f => handleX(f)"> 原本的上傳 UI </ImageDropZone>
import { ref } from 'vue'

const props = defineProps({ disabled: { type: Boolean, default: false } })
const emit = defineEmits(['file'])

const isOver = ref(false)
const pasteMsg = ref('')
let dragDepth = 0

const flash = (m) => { pasteMsg.value = m; setTimeout(() => { if (pasteMsg.value === m) pasteMsg.value = '' }, 3000) }

const send = (file) => {
  if (props.disabled) return
  if (!file) { flash('沒有讀到圖片'); return }
  if (!String(file.type).startsWith('image/')) { flash('只能放圖片檔'); return }
  // iPhone 照片常是 HEIC，LINE 和多數瀏覽器顯示不了
  if (/heic|heif/i.test(file.type) || /\.(heic|heif)$/i.test(file.name || '')) { flash('不支援 HEIC，請改用 PNG'); return }
  // 剪貼簿來的圖片可能沒有檔名，補一個副檔名讓上傳路徑正確
  if (!file.name || !file.name.includes('.')) {
    const ext = (file.type.split('/')[1] || 'png').replace('jpeg', 'jpg')
    file = new File([file], `paste.${ext}`, { type: file.type })
  }
  emit('file', file)
}

const onDragEnter = () => { dragDepth++; isOver.value = true }
const onDragLeave = () => { dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) isOver.value = false }
const onDrop = (e) => {
  dragDepth = 0
  isOver.value = false
  send(e.dataTransfer?.files?.[0])
}

// 在「貼上」框裡長按 → 貼上（iPhone），或 Ctrl/⌘+V（電腦）
const onPaste = (e) => {
  e.preventDefault()
  const items = [...(e.clipboardData?.items || [])]
  const item = items.find(i => i.kind === 'file' && i.type.startsWith('image/'))
  send(item?.getAsFile() || e.clipboardData?.files?.[0])
}

// 按鈕直接讀剪貼簿（Safari 會跳出「貼上」確認泡泡）
const pasteFromClipboard = async () => {
  if (!navigator.clipboard?.read) { flash('這個瀏覽器不支援，請在旁邊的框裡長按貼上'); return }
  try {
    for (const item of await navigator.clipboard.read()) {
      const type = item.types.find(t => t.startsWith('image/'))
      if (type) {
        const blob = await item.getType(type)
        send(new File([blob], `paste.${type.split('/')[1]}`, { type }))
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
