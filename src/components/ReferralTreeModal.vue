<script setup>
import { ref, onMounted, computed } from 'vue'
import { useUserStore } from '../stores/user'
import { supabase } from '../supabase'

const props = defineProps({ show: Boolean })
const emit = defineEmits(['close'])
const store = useUserStore()

// 狀態控制
const isLoading = ref(true)
const viewMode = ref('flat') // 'flat': 原版列表 | 'panorama': 全景樹狀圖
const isFetchingPanorama = ref(false)

// 原版資料
const master = ref(null) 
const directDisciples = ref([]) 

// 全景圖資料
const panoramaNodes = ref([])

// 戰力統計
const totalDisciples = computed(() => directDisciples.value.length)
const activeDisciples = computed(() => directDisciples.value.filter(d => d.total_exp > 0).length)

onMounted(async () => {
  if (store.userData) {
    viewMode.value = 'flat'
    await fetchDirectFamily()
  }
})

// 🚀 1. 抓取原版資料 (只抓直系)
const fetchDirectFamily = async () => {
  isLoading.value = true
  try {
    const myCode = store.userData.my_referral_code
    const masterCode = store.userData.referred_by

    if (masterCode) {
      const { data: masterData } = await supabase
        .from('users')
        .select('display_name, level, picture_url')
        .eq('my_referral_code', masterCode)
        .single()
      if (masterData) master.value = masterData
    }

    if (myCode) {
      const { data: disciplesData } = await supabase
        .from('users')
        .select('id, display_name, level, total_exp, created_at, picture_url')
        .eq('referred_by', myCode)
        .order('created_at', { ascending: false })
      
      if (disciplesData) directDisciples.value = disciplesData
    }
  } catch (error) {
    console.error('讀取直系族譜失敗:', error)
  } finally {
    isLoading.value = false
  }
}

// 🚀 2. 抓取全景圖資料 (無限代衍伸演算法)
const fetchPanoramaTree = async () => {
  if (!store.userData.my_referral_code) return alert('您還沒有解鎖推坑碼喔！')
  
  isFetchingPanorama.value = true
  viewMode.value = 'panorama' // 切換到全景模式

  try {
    let currentLevelCodes = [store.userData.my_referral_code]
    let allDescendants = []
    let currentGeneration = 1 // 第幾代

    // 透過 BFS (廣度優先搜尋) 一代一代往下撈，最多防呆撈 10 代
    while (currentLevelCodes.length > 0 && currentGeneration <= 10) {
      const { data } = await supabase
        .from('users')
        .select('id, display_name, level, total_exp, created_at, picture_url, my_referral_code, referred_by')
        .in('referred_by', currentLevelCodes)
        .order('created_at', { ascending: true })

      if (!data || data.length === 0) break

      // 把這代的人加入總表
      allDescendants.push(...data.map(d => ({ ...d, generation: currentGeneration })))
      
      // 收集有推坑碼的人，準備去撈他們的徒弟 (下一代)
      currentLevelCodes = data.map(d => d.my_referral_code).filter(Boolean)
      currentGeneration++
    }

    // 將扁平資料轉化為可渲染的「視覺化深度樹」
    panoramaNodes.value = buildVisualTree(store.userData.my_referral_code, allDescendants, 1)

  } catch (error) {
    console.error('讀取全景圖失敗:', error)
  } finally {
    isFetchingPanorama.value = false
  }
}

// 遞迴組裝視覺樹 (DFS 深度優先渲染)
const buildVisualTree = (parentCode, flatList, currentGen) => {
  let result = []
  const children = flatList.filter(u => u.referred_by === parentCode)
  
  for (const child of children) {
    result.push({ ...child, visualDepth: currentGen })
    // 如果他有自己的推坑碼，就去找他的徒弟
    if (child.my_referral_code) {
      const grandChildren = buildVisualTree(child.my_referral_code, flatList, currentGen + 1)
      result.push(...grandChildren)
    }
  }
  return result
}

const closeModal = () => emit('close')
</script>

<template>
  <Teleport to="body">
    <transition name="slide-up">
      <div v-if="show" class="tree-modal-overlay" @click.self="closeModal">
        <div class="tree-modal-content">
          
          <div class="tree-header">
            <h2 class="tree-title">
              {{ viewMode === 'flat' ? '🌳 宗門直系族譜' : '🌌 宗門全景圖' }}
            </h2>
            <button class="close-btn" @click="closeModal">✕</button>
          </div>

          <div v-if="isLoading" class="loading-state">讀取宗門卷宗中...</div>

          <div v-else class="tree-body">
            
            <div v-if="viewMode === 'flat'" class="mode-flat">
              
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
                <h3 class="section-title">🛡️ 我的直系戰力</h3>
                <div class="stats-grid">
                  <div class="stat-box">
                    <div class="stat-num">{{ totalDisciples }}</div>
                    <div class="stat-label">直系門徒</div>
                  </div>
                  <div class="stat-box">
                    <div class="stat-num" style="color: #2ecc71;">{{ activeDisciples }}</div>
                    <div class="stat-label">已出師</div>
                  </div>
                </div>
              </div>

              <div class="tree-section disciples-section">
                <div class="section-header-flex">
                  <h3 class="section-title" style="border: none; margin: 0;">⚔️ 直系門徒列表</h3>
                  <button v-if="directDisciples.length > 0" class="btn-panorama" @click="fetchPanoramaTree">
                    🌌 查看宗門全景
                  </button>
                </div>
                
                <div v-if="directDisciples.length === 0" class="empty-text" style="padding: 30px 0;">
                  <div style="font-size: 2.5rem; margin-bottom: 10px;">🍃</div>
                  目前還沒有門徒...<br>趕快去分享你的推坑碼吧！
                </div>
                
                <div v-else class="disciples-list mt-3">
                  <div v-for="disciple in directDisciples" :key="disciple.id" class="user-card disciple-card">
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

            <div v-else-if="viewMode === 'panorama'" class="mode-panorama">
              
              <button class="btn-back" @click="viewMode = 'flat'">
                ⬅️ 返回直系列表
              </button>

              <div v-if="isFetchingPanorama" class="loading-state">
                <div style="font-size: 2rem; margin-bottom: 10px;">🔮</div>
                正在推演宗門血脈，請稍候...
              </div>

              <div v-else class="panorama-container mt-3">
                <div class="panorama-root">
                  <img :src="store.userData?.picture_url || 'https://via.placeholder.com/50'" class="avatar root-avatar" />
                  <div class="root-name">【祖師爺】我</div>
                </div>

                <div class="panorama-tree-lines">
                  <div v-for="node in panoramaNodes" :key="node.id" 
                       class="panorama-node" 
                       :style="{ paddingLeft: (node.visualDepth * 25) + 'px' }">
                    
                    <div class="tree-line-icon" v-if="node.visualDepth > 0">↳</div>

                    <div class="user-card sub-card">
                      <img :src="node.picture_url || 'https://via.placeholder.com/50'" class="avatar-small" />
                      <div class="user-info">
                        <span class="u-name">
                          {{ node.display_name }}
                          <span class="gen-tag">{{ node.generation }}代</span>
                        </span>
                        <span class="u-level">LV.{{ node.level || 1 }}</span>
                      </div>
                    </div>

                  </div>
                </div>

                <div v-if="panoramaNodes.length === 0" class="empty-text mt-3">
                  哎呀，宗門似乎還沒有開枝散葉喔！
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
.close-btn { background: #222; border: none; color: #888; width: 32px; height: 32px; border-radius: 50%; font-size: 1rem; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: 0.2s;}
.close-btn:hover { background: #333; color: #fff; }

.tree-body { flex: 1; overflow-y: auto; padding: 20px; }
.loading-state { text-align: center; color: #888; padding: 50px 0; }

.tree-section { background: #161616; border: 1px solid #222; border-radius: 12px; padding: 15px; margin-bottom: 20px; }
.section-header-flex { display: flex; justify-content: space-between; align-items: center; border-bottom: 1px dashed #333; padding-bottom: 12px; }
.section-title { margin: 0 0 15px 0; color: #eee; font-size: 1rem; border-bottom: 1px dashed #333; padding-bottom: 8px; }

/* 卡片與排版 */
.user-card { display: flex; align-items: center; gap: 12px; background: #0a0a0a; padding: 12px; border-radius: 8px; border: 1px solid #222; }
.master-card { border-color: rgba(212, 175, 55, 0.4); background: rgba(212, 175, 55, 0.05); }
.avatar { width: 44px; height: 44px; border-radius: 50%; object-fit: cover; border: 1px solid #444; }
.avatar-small { width: 36px; height: 36px; border-radius: 50%; object-fit: cover; border: 1px solid #444; }
.user-info { display: flex; flex-direction: column; flex: 1; }
.u-name { color: #fff; font-weight: bold; font-size: 1rem; display: flex; align-items: center; gap: 6px; }
.u-level { color: #D4AF37; font-size: 0.8rem; font-weight: bold; margin-top: 4px; }
.u-date { color: #666; font-size: 0.8rem; margin-top: 4px; }

.gen-tag { background: rgba(212, 175, 55, 0.2); color: #D4AF37; padding: 2px 6px; border-radius: 4px; font-size: 0.65rem; border: 1px solid rgba(212, 175, 55, 0.4); }

.empty-text { text-align: center; color: #777; font-size: 0.9rem; padding: 10px 0; }

.stats-grid { display: flex; gap: 15px; }
.stat-box { flex: 1; background: #0a0a0a; border: 1px solid #222; padding: 15px; border-radius: 8px; text-align: center; }
.stat-num { font-size: 1.8rem; font-weight: bold; color: #D4AF37; margin-bottom: 5px; }
.stat-label { color: #888; font-size: 0.85rem; }

.disciples-list { display: flex; flex-direction: column; gap: 10px; }
.status-badge { padding: 4px 8px; border-radius: 4px; font-size: 0.75rem; font-weight: bold; }
.status-active { background: rgba(46, 204, 113, 0.1); color: #2ecc71; border: 1px solid rgba(46, 204, 113, 0.3); }
.status-pending { background: rgba(241, 196, 15, 0.1); color: #f1c40f; border: 1px solid rgba(241, 196, 15, 0.3); }

/* ================== 全景圖專區 ================== */
.btn-panorama { background: linear-gradient(135deg, #2a1b4d 0%, #1a0b2e 100%); color: #b388ff; border: 1px solid #7c4dff; padding: 6px 15px; border-radius: 20px; font-size: 0.85rem; font-weight: bold; cursor: pointer; transition: 0.2s; box-shadow: 0 0 10px rgba(124, 77, 255, 0.2); }
.btn-panorama:hover { transform: translateY(-2px); box-shadow: 0 0 15px rgba(124, 77, 255, 0.4); border-color: #b388ff; color: #fff;}

.btn-back { background: transparent; border: 1px solid #444; color: #aaa; padding: 8px 15px; border-radius: 8px; cursor: pointer; font-size: 0.9rem; transition: 0.2s; margin-bottom: 15px; }
.btn-back:hover { background: #222; color: #fff; }

.panorama-container { background: #0a0a0a; border: 1px solid #222; border-radius: 12px; padding: 20px; overflow-x: auto; }
.panorama-root { display: flex; flex-direction: column; align-items: flex-start; margin-bottom: 15px; padding-bottom: 15px; border-bottom: 1px dashed #333;}
.root-avatar { border: 2px solid #D4AF37; width: 60px; height: 60px; margin-bottom: 10px; }
.root-name { color: #D4AF37; font-weight: bold; font-size: 1.1rem; }

.panorama-tree-lines { display: flex; flex-direction: column; gap: 10px; }
.panorama-node { display: flex; align-items: center; position: relative; }
.tree-line-icon { color: #555; font-size: 1.2rem; margin-right: 10px; margin-left: -15px; font-weight: bold; }
.sub-card { background: #111; padding: 8px 12px; flex: 1; max-width: 300px; border-color: #333; }

.mt-3 { margin-top: 15px; }

/* 動畫 */
.slide-up-enter-active, .slide-up-leave-active { transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1); }
.slide-up-enter-from, .slide-up-leave-to { opacity: 0; transform: translateY(100%); }
</style>