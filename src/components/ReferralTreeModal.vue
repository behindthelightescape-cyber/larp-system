<script setup>
import { ref, onMounted, computed } from 'vue'
import { useUserStore } from '../stores/user'
import { supabase } from '../supabase'

const props = defineProps({ show: Boolean })
const emit = defineEmits(['close'])
const store = useUserStore()
const isLoading = ref(true)

const master = ref(null) 
const treeNodes = ref([]) // 🚀 改成動態樹狀節點陣列

// 戰力統計
const totalDisciples = computed(() => treeNodes.value.filter(n => n.depth === 0).length) // 直系徒弟數
const activeDisciples = computed(() => treeNodes.value.filter(n => n.depth === 0 && n.total_exp > 0).length)

onMounted(async () => {
  if (store.userData) await fetchInitialTree()
})

const fetchInitialTree = async () => {
  isLoading.value = true
  try {
    const myCode = store.userData.my_referral_code
    const masterCode = store.userData.referred_by

    // 1. 找師傅
    if (masterCode) {
      const { data: masterData } = await supabase
        .from('users')
        .select('display_name, level, picture_url')
        .eq('my_referral_code', masterCode)
        .single()
      if (masterData) master.value = masterData
    }

    // 2. 找直系徒弟 (Depth = 0)
    if (myCode) {
      const { data: disciplesData } = await supabase
        .from('users')
        // 🚀 注意：必須把他們的 my_referral_code 撈出來，才能繼續往下找徒孫！
        .select('id, display_name, level, total_exp, created_at, picture_url, my_referral_code')
        .eq('referred_by', myCode)
        .order('created_at', { ascending: false })
      
      if (disciplesData) {
        // 幫每個節點加上「樹狀控制狀態」
        treeNodes.value = disciplesData.map(d => ({
          ...d,
          depth: 0,              // 第幾代
          expanded: false,       // 是否已展開
          loaded: false,         // 是否已經去資料庫撈過徒孫
          isLoadingChildren: false,
          hasNoChildren: false   // 標記是不是沒有徒弟
        }))
      }
    }
  } catch (error) {
    console.error('讀取族譜失敗:', error)
  } finally {
    isLoading.value = false
  }
}

// 🚀 核心魔法：展開/收起徒孫 (Lazy Loading)
const toggleNode = async (node, index) => {
  // 如果已經展開，就把它「收起」 (把底下的子孫全部隱藏)
  if (node.expanded) {
    let removeCount = 0
    for (let i = index + 1; i < treeNodes.value.length; i++) {
      if (treeNodes.value[i].depth > node.depth) removeCount++
      else break // 遇到同輩或長輩就停止
    }
    treeNodes.value.splice(index + 1, removeCount)
    node.expanded = false
    return
  }

  // 如果還沒展開過，且沒有他自己的推坑碼 (代表他連第一場都沒玩完，不可能有徒弟)
  if (!node.my_referral_code) {
    node.hasNoChildren = true
    return alert(`【${node.display_name}】還是見習生，還沒解鎖收徒權限喔！`)
  }

  // 展開：去資料庫撈「他的徒弟」
  if (!node.loaded) {
    node.isLoadingChildren = true
    const { data: childrenData } = await supabase
      .from('users')
      .select('id, display_name, level, total_exp, created_at, picture_url, my_referral_code')
      .eq('referred_by', node.my_referral_code)
      .order('created_at', { ascending: false })

    node.isLoadingChildren = false
    node.loaded = true

    if (!childrenData || childrenData.length === 0) {
      node.hasNoChildren = true
      return // 沒徒弟就不展開
    }

    // 把徒孫加工，深度 + 1
    node.childrenData = childrenData.map(d => ({
      ...d, depth: node.depth + 1, expanded: false, loaded: false, isLoadingChildren: false, hasNoChildren: false
    }))
  }

  // 把徒孫「插隊」塞進陣列裡 (這會讓畫面看起來像樹狀圖展開)
  if (node.childrenData && node.childrenData.length > 0) {
    treeNodes.value.splice(index + 1, 0, ...node.childrenData)
    node.expanded = true
  }
}

const closeModal = () => emit('close')
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
              <h3 class="section-title">⚔️ 宗門血脈 (可點擊展開)</h3>
              
              <div v-if="treeNodes.length === 0" class="empty-text" style="padding: 30px 0;">
                <div style="font-size: 2.5rem; margin-bottom: 10px;">🍃</div>
                目前還沒有門徒...<br>趕快去分享你的推坑碼吧！
              </div>
              
              <div v-else class="tree-list">
                <transition-group name="list">
                  <div v-for="(node, index) in treeNodes" :key="node.id" 
                       class="tree-node-wrapper" 
                       :style="{ marginLeft: (node.depth * 25) + 'px' }">
                    
                    <div v-if="node.depth > 0" class="tree-branch">↳</div>

                    <div class="user-card disciple-card" :class="{ 'is-sub': node.depth > 0 }">
                      <img :src="node.picture_url || 'https://via.placeholder.com/50'" class="avatar" />
                      
                      <div class="user-info">
                        <span class="u-name">{{ node.display_name }} <span v-if="node.depth>0" class="gen-tag">{{ node.depth + 1 }}代</span></span>
                        <span class="u-date">拜師: {{ node.created_at.split('T')[0] }}</span>
                      </div>

                      <div class="action-area">
                        <div class="status-dot" :class="node.total_exp > 0 ? 'dot-active' : 'dot-pending'" :title="node.total_exp > 0 ? '已出師' : '見習中'"></div>
                        
                        <button 
                          class="expand-btn" 
                          :class="{ 'btn-expanded': node.expanded, 'btn-no-child': node.hasNoChildren }"
                          @click="toggleNode(node, index)"
                          :disabled="node.isLoadingChildren"
                        >
                          <span v-if="node.isLoadingChildren">⏳</span>
                          <span v-else-if="node.hasNoChildren">無徒</span>
                          <span v-else>{{ node.expanded ? '▼ 收起' : '▶ 展開' }}</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </transition-group>
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

/* 卡片與排版 */
.user-card { display: flex; align-items: center; gap: 12px; background: #0a0a0a; padding: 10px 12px; border-radius: 8px; border: 1px solid #222; position: relative;}
.master-card { border-color: rgba(212, 175, 55, 0.4); background: rgba(212, 175, 55, 0.05); }
.is-sub { background: #151515; border-color: #333; }
.avatar { width: 40px; height: 40px; border-radius: 50%; object-fit: cover; border: 1px solid #444; }
.user-info { display: flex; flex-direction: column; flex: 1; }
.u-name { color: #fff; font-weight: bold; font-size: 0.95rem; display: flex; align-items: center; gap: 6px;}
.u-level { color: #D4AF37; font-size: 0.8rem; font-weight: bold; margin-top: 4px; }
.u-date { color: #666; font-size: 0.75rem; margin-top: 4px; }

.gen-tag { background: rgba(212, 175, 55, 0.2); color: #D4AF37; padding: 2px 6px; border-radius: 4px; font-size: 0.65rem; border: 1px solid rgba(212, 175, 55, 0.4); }

.empty-text { text-align: center; color: #777; font-size: 0.9rem; padding: 10px 0; }

/* 戰力表 */
.stats-grid { display: flex; gap: 15px; }
.stat-box { flex: 1; background: #0a0a0a; border: 1px solid #222; padding: 15px; border-radius: 8px; text-align: center; }
.stat-num { font-size: 1.8rem; font-weight: bold; color: #D4AF37; margin-bottom: 5px; }
.stat-label { color: #888; font-size: 0.85rem; }

/* 🚀 樹狀結構專屬 CSS */
.tree-list { display: flex; flex-direction: column; gap: 8px; position: relative; }
.tree-node-wrapper { display: flex; align-items: center; transition: all 0.3s ease; position: relative; }
.tree-branch { color: #555; font-size: 1.2rem; margin-right: 8px; margin-left: -15px; font-weight: bold; }

.action-area { display: flex; align-items: center; gap: 10px; }
.status-dot { width: 10px; height: 10px; border-radius: 50%; }
.dot-active { background: #2ecc71; box-shadow: 0 0 8px #2ecc71; }
.dot-pending { background: #f1c40f; opacity: 0.5; }

.expand-btn { background: #222; border: 1px solid #444; color: #aaa; border-radius: 6px; padding: 4px 8px; font-size: 0.75rem; cursor: pointer; transition: 0.2s; white-space: nowrap; }
.expand-btn:hover:not(:disabled) { background: #333; color: #fff; border-color: #D4AF37; }
.btn-expanded { background: rgba(212, 175, 55, 0.1); color: #D4AF37; border-color: #D4AF37; }
.btn-no-child { background: #111; color: #555; border-color: #222; cursor: not-allowed; }

/* 動畫 */
.slide-up-enter-active, .slide-up-leave-active { transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1); }
.slide-up-enter-from, .slide-up-leave-to { opacity: 0; transform: translateY(100%); }
.list-enter-active, .list-leave-active { transition: all 0.3s ease; }
.list-enter-from, .list-leave-to { opacity: 0; transform: translateX(-20px); }
</style>