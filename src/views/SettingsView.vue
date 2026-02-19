<script setup>
import { ref, watch } from 'vue'
import { useUserStore } from '../stores/user'

const store = useUserStore()

const form = ref({
  name: '',
  phone: '',
  birthday: ''
})

// 🌟 獨立的鎖定開關
const isBirthdayLocked = ref(false)

// 監聽使用者資料
watch(() => store.userData, (newVal) => {
  if (newVal) {
    form.value.name = newVal.display_name || ''
    form.value.phone = newVal.phone || ''
    form.value.birthday = newVal.birthday || ''
    
    // 如果資料庫原本就有生日，直接上鎖！
    if (newVal.birthday) {
      isBirthdayLocked.value = true
    }
  }
}, { immediate: true })

const save = async () => {
  if (store.isLoading) return

  const payload = {
    name: form.value.name,
    phone: form.value.phone,
    birthday: form.value.birthday || null 
  }

  const result = await store.updateProfile(payload)
  
  if (result.success) {
    alert(result.message)
    
    // 🚀 關鍵：只要他這次有填生日存檔成功，前端直接切換開關，瞬間上鎖！
    if (form.value.birthday) {
      isBirthdayLocked.value = true
    }

    await store.initLiff() 
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
            v-if="!isBirthdayLocked"
            v-model="form.birthday" 
            type="date" 
          />
          
          <div v-else class="locked-display">
            {{ form.birthday }}
          </div>
          
          <p v-if="isBirthdayLocked" class="hint-text">🔒 生日已設定，如需修改請聯繫客服。</p>
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

/* 原本的輸入框樣式 */
.form-group input {
  width: 100%; padding: 12px; background: #1a1a1a; border: 1px solid #333;
  border-radius: 8px; color: #fff; font-size: 1rem; box-sizing: border-box;
}
.form-group input:focus { border-color: #D4AF37; outline: none; }

/* 🚀 鎖定後的純文字方塊樣式 */
.locked-display {
  width: 100%; 
  padding: 12px; 
  background: #0a0a0a; 
  border: 1px solid #222;
  border-radius: 8px; 
  color: #666; 
  font-size: 1rem;
  box-sizing: border-box;
  user-select: none; /* 防止反白選取 */
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