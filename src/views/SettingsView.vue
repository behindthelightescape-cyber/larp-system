<script setup>
import { ref, watch, computed } from 'vue'
import { useUserStore } from '../stores/user'

const store = useUserStore()

const form = ref({
  name: '',
  phone: '',
  birthday: ''
})

// 🌟 新增：專門記住「資料庫原本的生日」
const originalBirthday = ref(null)

// 監聽使用者資料載入
watch(() => store.userData, (newVal) => {
  if (newVal) {
    form.value.name = newVal.display_name || ''
    form.value.phone = newVal.phone || ''
    form.value.birthday = newVal.birthday || ''
    
    // 🌟 關鍵：把資料庫真實的生日存進快照裡
    originalBirthday.value = newVal.birthday 
  }
}, { immediate: true })

// 🌟 判斷邏輯：只要快照裡面有生日，就無情上鎖！
const isBirthdaySet = computed(() => {
  return !!originalBirthday.value && originalBirthday.value.trim() !== ''
})

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
    // 儲存成功後，強制重新抓取資料，並更新快照
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

/* 鎖死狀態 */
.disabled-input {
  background: #0a0a0a !important;
  color: #666 !important;
  cursor: not-allowed !important;
  border-color: #222 !important;
  pointer-events: none !important; /* 絕對禁止點擊 */
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