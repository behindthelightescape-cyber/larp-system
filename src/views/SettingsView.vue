<script setup>
import { ref } from 'vue'
import { useUserStore } from '../stores/user'

const store = useUserStore()
const form = ref({
  phone: store.profile?.phone || '',
  birthday: store.profile?.birthday || '',
  name: store.profile?.display_name || ''
})

const save = () => {
  alert('資料儲存模擬成功！(需串接 Supabase Update)')
  // 之後這裡要呼叫 store.updateProfile(form.value)
}
</script>

<template>
  <div class="page-container">
    <h2 class="page-title">個人設定</h2>
    
    <div class="form-group">
      <label>顯示名稱</label>
      <input v-model="form.name" type="text" placeholder="怎麼稱呼你？" />
    </div>

    <div class="form-group">
      <label>手機號碼</label>
      <input v-model="form.phone" type="tel" placeholder="0912-345-678" />
    </div>

    <div class="form-group">
      <label>生日 (僅供壽星優惠使用)</label>
      <input v-model="form.birthday" type="date" />
    </div>

    <button class="save-btn" @click="save">確認修改</button>
  </div>
</template>

<style scoped>
.page-container { padding: 20px; }
.page-title { color: #fff; margin-bottom: 30px; font-size: 1.5rem; text-align: center; }

.form-group { margin-bottom: 20px; }
.form-group label { display: block; color: #888; margin-bottom: 8px; font-size: 0.9rem; }
.form-group input {
  width: 100%; padding: 12px; background: #1a1a1a; border: 1px solid #333;
  border-radius: 8px; color: #fff; font-size: 1rem;
}
.form-group input:focus { border-color: #D4AF37; outline: none; }

.save-btn {
  width: 100%; padding: 15px; background: #D4AF37; color: #000;
  border: none; border-radius: 8px; font-weight: bold; font-size: 1rem; margin-top: 20px;
  cursor: pointer;
}
.save-btn:active { opacity: 0.9; }
</style>