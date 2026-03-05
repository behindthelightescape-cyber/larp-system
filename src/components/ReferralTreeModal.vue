<script setup>
import { ref, onMounted, computed } from 'vue'
import { useUserStore } from '../stores/user'
import { supabase } from '../supabase'

const props = defineProps({
  show: Boolean
})
const emit = defineEmits(['close'])

const store = useUserStore()
const isLoading = ref(true)

// 宗門資料
const master = ref(null) // 師傅
const disciples = ref([]) // 徒弟們

// 計算屬性
const totalDisciples = computed(() => disciples.value.length)
const activeDisciples = computed(() => disciples.value.filter(d => d.total_exp > 0).length) // 已經玩過 (有經驗值) 的徒弟

onMounted(async () => {
  if (store.userData) {
    await fetchFamilyTree()
  }
})

const fetchFamilyTree = async () => {
  isLoading.value = true
  try {
    const myCode = store.userData.my_referral_code
    const masterCode = store.userData.referred_by

    // 1. 找師傅 (如果我有填別人的碼)
    if (masterCode) {
      const { data: masterData } = await supabase
        .from('users')
        .select('display_name, level, picture_url')
        .eq('my_referral_code', masterCode)
        .single()
      if (masterData) master.value = masterData
    }

    // 2. 找徒弟 (如果我有自己的碼，就去撈誰填了我的碼)
    if (myCode) {
      const { data: disciplesData } = await supabase
        .from('users')
        .select('id, display_name, level, total_exp, created_at, picture_url')
        .eq('referred_by', myCode)
        .order('created_at', { ascending: false })
      
      if (disciplesData) disciples.value = disciplesData
    }
  } catch (error) {
    console.error('讀取族譜失敗:', error)
  } finally {
    isLoading.value = false
  }
}

const closeModal = () => {
  emit('close')
}
</script>

<template>
  <Teleport to="body">
    <transition name="slide-up">
      <div v-if="show" class="tree-modal-overlay" @click.self="closeModal">
        <div class="tree-modal-content">
          
          <div class="tree-header">
            <h2 class="tree-title">🌳 宗門血脈族譜</h2>
            <button class="close-btn" @click="closeModal">✕</button>
          </div>

          <div v-if="isLoading" class="loading-state">讀取宗門卷宗中...</div>

          <div v-else class="tree-body">
            
            <div class="tree-section master-section">
              <h3 class="section-title">✨ 我的引路人</h3>
              <div v-if="master" class="user-card master-card">
                <img :src="master.picture_url || 'https://via.placeholder.com/50'" class="avatar" />
                <div class="user-info">
                  <span class="u-name">{{ master.display_name }}</span>
                  <span class="u-level">LV.{{ master.level }} 尊榮老手</span>
                </div>
              </div>
              <div v-else class="empty-text">您是開山祖師爺，沒有引路人！</div>
            </div>

            <div class="tree-section self-section">
              <h3 class="section-title">🛡️ 我的宗門戰力</h3>
              <div class="stats-grid">
                <div class="stat-box">
                  <div class="stat-num">{{ totalDisciples }}</div>
                  <div class="stat-label">門徒總數</div>
                </div>
                <div class="stat-box">
                  <div class="stat-num" style="color: #2ecc71;">{{ activeDisciples }}</div>
                  <div class="stat-label">已出師 (為您賺取獎勵)</div>
                </div>
              </div>
            </div>

            <div class="tree-section disciples-section">
              <h3 class="section-title">⚔️ 桃李滿天下 (門徒列表)</h3>
              
              <div v-if="disciples.length === 0" class="empty-text" style="padding: 30px 0;">
                <div style="font-size: 2.5rem; margin-bottom: 10px;">🍃</div>
                目前還沒有門徒...<br>趕快去「個人設定」分享你的推坑碼吧！
              </div>
              
              <div v-else class="disciples-list">
                <div v-for="disciple in disciples" :key="disciple.id" class="user-card disciple-card">
                  <img :src="disciple.picture_url || 'https://via.placeholder.com/50'" class="avatar" />
                  <div class="user-info">
                    <span class="u-name">{{ disciple.display_name }}</span>
                    <span class="u-date">拜師日: {{ disciple.created_at.split('T')[0] }}</span>
                  </div>
                  <div class="status-badge" :class="disciple.total_exp > 0 ? 'status-active' : 'status-pending'">
                    {{ disciple.total_exp > 0 ? '🟢 已出師' : '⏳ 見習中' }}
                  </div>
                </div>
              </div>
            </div>

          </div>
        </div>
      </div>
    </transition>
  </Teleport>
</template>

<style scoped>
.tree-modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.85); z-index: 9999; display: flex; align-items: flex-end; justify-content: center; backdrop-filter: blur(5px); }
.tree-modal-content { background: #111; width: 100%; max-width: 600px; height: 85vh; border-radius: 24px 24px 0 0; border-top: 2px solid #D4AF37; display: flex; flex-direction: column; box-shadow: 0 -10px 40px rgba(0,0,0,0.8); }

.tree-header { padding: 20px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #222; background: linear-gradient(180deg, #1a1a1a 0%, #111 100%); border-radius: 24px 24px 0 0; }
.tree-title { margin: 0; color: #D4AF37; font-size: 1.3rem; }
.close-btn { background: #222; border: none; color: #888; width: 32px; height: 32px; border-radius: 50%; font-size: 1rem; cursor: pointer; display: flex; align-items: center; justify-content: center; }

.tree-body { flex: 1; overflow-y: auto; padding: 20px; }
.loading-state { text-align: center; color: #888; padding: 50px 0; }

.tree-section { background: #161616; border: 1px solid #222; border-radius: 12px; padding: 15px; margin-bottom: 20px; }
.section-title { margin: 0 0 15px 0; color: #eee; font-size: 1rem; border-bottom: 1px dashed #333; padding-bottom: 8px; }

.user-card { display: flex; align-items: center; gap: 12px; background: #0a0a0a; padding: 12px; border-radius: 8px; border: 1px solid #222; }
.master-card { border-color: rgba(212, 175, 55, 0.4); background: rgba(212, 175, 55, 0.05); }
.avatar { width: 44px; height: 44px; border-radius: 50%; object-fit: cover; border: 1px solid #444; }
.user-info { display: flex; flex-direction: column; flex: 1; }
.u-name { color: #fff; font-weight: bold; font-size: 1rem; }
.u-level { color: #D4AF37; font-size: 0.8rem; font-weight: bold; margin-top: 4px; }
.u-date { color: #666; font-size: 0.8rem; margin-top: 4px; }

.empty-text { text-align: center; color: #777; font-size: 0.9rem; padding: 10px 0; }

.stats-grid { display: flex; gap: 15px; }
.stat-box { flex: 1; background: #0a0a0a; border: 1px solid #222; padding: 15px; border-radius: 8px; text-align: center; }
.stat-num { font-size: 1.8rem; font-weight: bold; color: #D4AF37; margin-bottom: 5px; }
.stat-label { color: #888; font-size: 0.85rem; }

.disciples-list { display: flex; flex-direction: column; gap: 10px; }
.disciple-card { transition: 0.2s; }
.disciple-card:hover { background: #1a1a1a; }
.status-badge { padding: 4px 8px; border-radius: 4px; font-size: 0.75rem; font-weight: bold; }
.status-active { background: rgba(46, 204, 113, 0.1); color: #2ecc71; border: 1px solid rgba(46, 204, 113, 0.3); }
.status-pending { background: rgba(241, 196, 15, 0.1); color: #f1c40f; border: 1px solid rgba(241, 196, 15, 0.3); }

/* 動畫 */
.slide-up-enter-active, .slide-up-leave-active { transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1); }
.slide-up-enter-from, .slide-up-leave-to { opacity: 0; transform: translateY(100%); }
</style>