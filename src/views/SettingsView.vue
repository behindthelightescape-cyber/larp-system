<script setup>
import { ref, watch, computed } from 'vue'
import { useUserStore } from '../stores/user'

const store = useUserStore()

const form = ref({
  name: '',
  phone: '',
  birthday: ''
})

// 🌟 強化版判斷：嚴格檢查字串是不是空的或 null
const isBirthdaySet = computed(() => {
  const bday = store.userData?.birthday
  // 只要有字串且不是空的，就判定為「已設定」
  return bday !== null && bday !== undefined && bday !== ''
})

watch(() => store.userData, (newVal) => {
  if (newVal) {
    form.value.name = newVal.display_name || ''
    form.value.phone = newVal.phone || ''
    form.value.birthday = newVal.birthday || ''
  }
}, { immediate: true })

const save = async () => {
  if (store.isLoading) return

  // 避免空字串存進資料庫報錯，沒填就轉成 null
  const payload = {
    name: form.value.name,
    phone: form.value.phone,
    birthday: form.value.birthday || null 
  }

  const result = await store.updateProfile(payload)
  
  if (result.success) {
    alert(result.message)
    await store.initLiff() // 儲存完重新整理資料
  } else {
    alert('儲存失敗: ' + result.message)
  }
}
</script>

<template>
  <div class="page-container">
    <h2 class="page-title">個人設定</h2>
    
    <div v-if="store.isLoading" style="text-align: center; color: #888;">載入中...</div>
    
    <div v-else>
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
          <input 
            v-model="form.birthday" 
            type="date" 
            :disabled="isBirthdaySet"
            :readonly="isBirthdaySet"
            :class="{ 'disabled-input': isBirthdaySet }"
          />
          <p v-if="isBirthdaySet" class="hint-text">🔒 生日已設定，如需修改請聯繫客服。</p>
          <p v-else class="hint-text" style="color: #D4AF37;">🎁 首次填寫生日將獲得驚喜禮物！</p>
        </div>

        <button class="save-btn" @click="save">確認修改</button>
    </div>
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

/* 🚀 鎖死狀態樣式強化：阻止一切點擊行為 */
.disabled-input {
  background: #0a0a0a !important;
  color: #666 !important;
  cursor: not-allowed !important;
  border-color: #222 !important;
  pointer-events: none; /* 直接讓滑鼠/手指點擊無效 */
}

.hint-text {
  font-size: 0.8rem;
  color: #888;
  margin-top: 6px;
  margin-bottom: 0;
}

.save-btn {
  width: 100%; padding: 15px; background: #D4AF37; color: #000;
  border: none; border-radius: 8px; font-weight: bold; font-size: 1rem; margin-top: 20px;
  cursor: pointer;
}
.save-btn:active { opacity: 0.9; }
</style>

<template>
  <div class="page-container">
    <h2 class="page-title">個人設定</h2>
    
    <div v-if="store.isLoading" style="text-align: center; color: #888;">載入中...</div>
    
    <div v-else>
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