<script setup>
import { ref } from 'vue'
import { supabase } from '../supabase'

const emit = defineEmits(['update-stats'])

const batchTargetIds = ref('')
const batchGiftTitle = ref('')
const batchGiftDate = ref('')
const batchGiftDesc = ref('')
const isSendingBatch = ref(false)

const issueBatchCoupons = async () => {
  if (!batchGiftTitle.value) return alert("標題都沒寫，你是想發送『國王的優惠券』嗎？")
  
  const ids = batchTargetIds.value.split(',').map(id => id.trim()).filter(id => id)
  if (ids.length === 0) return alert("你是要發給鬼嗎？對象名單是空的！")

  isSendingBatch.value = true
  try {
    const { data: users, error: userErr } = await supabase.from('users').select('id, legacy_id').in('legacy_id', ids)
    if (userErr) throw userErr
    if (!users || users.length === 0) return alert("這些 ID 系統裡一個都找不到！")

    const inserts = users.map(u => ({
      user_id: u.id,
      title: batchGiftTitle.value,
      description: batchGiftDesc.value,
      expiry_date: batchGiftDate.value || null,
      status: 'available',
      coupon_type: 'discount'
    }))

    const { error: insertErr } = await supabase.from('coupons').insert(inserts)
    if (insertErr) throw insertErr

    const foundIds = users.map(u => u.legacy_id)
    const missingIds = ids.filter(id => !foundIds.includes(id))
    
    let msg = `✅ 成功精準發送給 ${users.length} 名玩家！\n`
    if (missingIds.length > 0) msg += `⚠️ 找不到這些邊緣人：${missingIds.join(', ')}`
    alert(msg)

    batchTargetIds.value = ''
    batchGiftTitle.value = ''
    batchGiftDesc.value = ''
    batchGiftDate.value = ''
    emit('update-stats') // 呼叫 Admin 更新儀表板

  } catch (error) {
    console.error("小四警告：系統炸了！", error)
    alert("伺服器炸了，這 bug 我來處理。")
  } finally {
    isSendingBatch.value = false
  }
}
</script>

<template>
  <div class="quick-gift-box">
    <h3 style="margin-top:0; color: #D4AF37;">🎯 精準導彈發券系統</h3>
    
    <div class="form-group">
      <label>目標玩家 (請輸入 ID，多筆請用「半形逗號」分隔)</label>
      <input v-model="batchTargetIds" type="text" class="admin-input" placeholder="例如: VIP001, 123456">
    </div>
    
    <div class="form-grid">
      <div class="form-group">
        <label>票券標題</label>
        <input v-model="batchGiftTitle" type="text" class="admin-input" placeholder="例如: 搬家補償金 500 元">
      </div>
      <div class="form-group">
        <label>到期日 (可留白)</label>
        <input v-model="batchGiftDate" type="date" class="admin-input">
      </div>
      <div class="form-group full">
        <label>備註說明</label>
        <input v-model="batchGiftDesc" type="text" class="admin-input" placeholder="行銷文案自己想">
      </div>
    </div>
    
    <button class="btn btn-gold mt-3" @click="issueBatchCoupons" :disabled="isSendingBatch">
      {{ isSendingBatch ? '🚀 導彈發射中，請稍後...' : '🚀 啟動發送程序' }}
    </button>
  </div>
</template>

<style scoped>
.quick-gift-box { background: #111; padding: 25px; border-radius: 12px; margin-bottom: 25px; border: 1px dashed #D4AF37; }
.form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 15px; }
.form-group { margin-bottom: 15px; display: flex; flex-direction: column; }
.form-group.full { grid-column: span 2; }
.form-group label { margin-bottom: 8px; color: #aaa; font-size: 0.9rem; font-weight: bold; }
.admin-input { width: 100%; padding: 14px; background: #222; border: 1px solid #444; color: white; border-radius: 8px; font-size: 1rem; }
.admin-input:focus { border-color: #D4AF37; outline: none; }
.btn { padding: 12px 20px; border: none; font-weight: bold; border-radius: 8px; cursor: pointer; transition: 0.2s; }
.btn-gold { background: #D4AF37; color: black; width: 100%; }
.mt-3 { margin-top: 15px; }
@media (max-width: 768px) {
  .form-grid { grid-template-columns: 1fr; gap: 10px; }
  .form-group.full { grid-column: span 1; }
}
</style>