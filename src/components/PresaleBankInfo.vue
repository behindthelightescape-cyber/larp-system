<script setup>
// 預售匯款資訊卡（帳號可一鍵複製）
import { ref } from 'vue'
import { money } from '../utils/presaleApi'

const props = defineProps({ bank: Object, total: Number })
const copied = ref('')

const copy = async (key, text) => {
  try {
    await navigator.clipboard.writeText(String(text))
  } catch {
    const ta = document.createElement('textarea')
    ta.value = String(text)
    document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove()
  }
  copied.value = key
  setTimeout(() => { if (copied.value === key) copied.value = '' }, 1500)
}
</script>

<template>
  <div class="bank">
    <h3>匯款資訊</h3>
    <template v-if="props.bank?.account_no">
      <div class="line"><span>銀行</span><b>{{ props.bank.bank_name }}<template v-if="props.bank.bank_code">（{{ props.bank.bank_code }}）</template></b></div>
      <div class="line">
        <span>帳號</span><b>{{ props.bank.account_no }}</b>
        <button @click="copy('acc', props.bank.account_no)">{{ copied === 'acc' ? '已複製' : '複製' }}</button>
      </div>
      <div class="line"><span>戶名</span><b>{{ props.bank.account_name }}</b></div>
      <div class="line">
        <span>金額</span><b class="gold">{{ money(props.total) }}</b>
        <button @click="copy('amt', props.total)">{{ copied === 'amt' ? '已複製' : '複製' }}</button>
      </div>
      <p v-if="props.bank.remit_note" class="note">{{ props.bank.remit_note }}</p>
    </template>
    <p v-else class="note">匯款帳號整理中，我們會用 LINE 通知你。</p>
  </div>
</template>

<style scoped>
.bank { background: rgba(212,175,55,0.08); border: 1px solid rgba(212,175,55,0.35); border-radius: 18px; padding: 18px; display: flex; flex-direction: column; gap: 10px; }
h3 { margin: 0; color: #D4AF37; font-size: 1rem; }
.line { display: flex; align-items: center; gap: 10px; font-size: 0.95rem; color: #eee; }
.line span { color: #999; font-size: 0.82rem; width: 36px; flex-shrink: 0; }
.line b { flex: 1; word-break: break-all; }
.line b.gold { color: #D4AF37; font-size: 1.1rem; }
.line button { background: #222; color: #D4AF37; border: 1px solid #5a4a14; border-radius: 8px; padding: 4px 10px; font-size: 0.78rem; cursor: pointer; }
.note { margin: 0; color: #aaa; font-size: 0.82rem; line-height: 1.6; white-space: pre-wrap; }
</style>
