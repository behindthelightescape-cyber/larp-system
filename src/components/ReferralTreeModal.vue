<script setup>
import { ref, onMounted, computed, defineComponent } from 'vue'
import { useUserStore } from '../stores/user'
import { supabase } from '../supabase'

// ── 遞迴樹節點元件（定義在 script setup 內才能正確使用）──
const TreeNodeVue = defineComponent({
  name: 'TreeNodeVue',
  props: { node: Object },
  components: {}, // 自我遞迴：Vue 3 會自動用 name 找自己
  setup(props) {
    const isExpanded = ref(true)
    const hasChildren = computed(() => props.node?.children?.length > 0)
    const isActive = computed(() => props.node?.total_exp > 0)
    const toggle = () => { if (hasChildren.value) isExpanded.value = !isExpanded.value }
    return { isExpanded, hasChildren, isActive, toggle, defaultSvgAvatar }
  },
  template: `
    <div class="t-node-wrap">
      <div class="t-node-col">
        <div
          class="t-card"
          :class="[node.isRoot ? 't-card-root' : '', isActive ? 't-card-active' : '']"
          @click="toggle"
        >
          <div class="t-avatar-wrap">
            <img :src="node.picture_url || defaultSvgAvatar" class="t-avatar" />
            <div v-if="node.isRoot" class="t-crown">👑</div>
            <div v-else class="t-status-dot" :class="isActive ? 'dot-active' : 'dot-pending'"></div>
          </div>
          <div class="t-info">
            <div class="t-name">{{ node.display_name?.slice(0, 7) }}{{ node.display_name?.length > 7 ? '…' : '' }}</div>
            <div class="t-meta">
              <span v-if="node.isRoot" class="t-badge t-badge-root">祖師</span>
              <span v-else class="t-badge">{{ node.generation }}代</span>
              <span class="t-lv">Lv.{{ node.level || 1 }}</span>
            </div>
          </div>
          <div v-if="hasChildren" class="t-toggle" :class="isExpanded ? 'expanded' : ''">▾</div>
        </div>
        <div v-if="hasChildren && isExpanded" class="t-vline-down"></div>
      </div>

      <div v-if="hasChildren && isExpanded" class="t-children-wrap">
        <div class="t-hline"></div>
        <div class="t-children-row">
          <div v-for="child in node.children" :key="child.id" class="t-child-col">
            <div class="t-vline-up"></div>
            <TreeNodeVue :node="child" />
          </div>
        </div>
      </div>
    </div>
  `
})

const defaultSvgAvatar = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='40' height='40'%3E%3Crect width='40' height='40' rx='20' fill='%23333'/%3E%3Ctext x='50%25' y='55%25' text-anchor='middle' dominant-baseline='middle' fill='%23888' font-size='16'%3E?%3C/text%3E%3C/svg%3E`

const props = defineProps({ show: Boolean })
const emit = defineEmits(['close'])
const store = useUserStore()

const isLoading = ref(true)
const viewMode = ref('flat')
const isFetchingPanorama = ref(false)

const master = ref(null)
const directDisciples = ref([])
const treeRoot = ref(null) // 全景圖用樹狀結構

const totalDisciples = computed(() => directDisciples.value.length)
const activeDisciples = computed(() => directDisciples.value.filter(d => d.total_exp > 0).length)

onMounted(async () => {
  if (store.userData) {
    viewMode.value = 'flat'
    await fetchDirectFamily()
  }
})

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

// 🚀 BFS 撈資料，再組裝成巢狀樹
const fetchPanoramaTree = async () => {
  if (!store.userData.my_referral_code) return alert('您還沒有解鎖推坑碼喔！')

  isFetchingPanorama.value = true
  viewMode.value = 'panorama'

  try {
    let currentLevelCodes = [store.userData.my_referral_code]
    let allDescendants = []
    let currentGeneration = 1

    while (currentLevelCodes.length > 0 && currentGeneration <= 10) {
      const { data } = await supabase
        .from('users')
        .select('id, display_name, level, total_exp, created_at, picture_url, my_referral_code, referred_by')
        .in('referred_by', currentLevelCodes)
        .order('created_at', { ascending: true })

      if (!data || data.length === 0) break

      allDescendants.push(...data.map(d => ({ ...d, generation: currentGeneration })))
      currentLevelCodes = [...new Set(data.map(d => d.my_referral_code).filter(Boolean))]
      currentGeneration++
    }

    // 組裝成巢狀樹結構
    const childrenMap = new Map()
    for (const u of allDescendants) {
      if (!childrenMap.has(u.referred_by)) childrenMap.set(u.referred_by, [])
      childrenMap.get(u.referred_by).push(u)
    }

    treeRoot.value = {
      id: 'root',
      display_name: store.userData.display_name || '我',
      level: store.userData.level,
      picture_url: store.userData.picture_url,
      total_exp: 1,
      generation: 0,
      isRoot: true,
      children: buildNestedTree(store.userData.my_referral_code, childrenMap)
    }

  } catch (error) {
    console.error('讀取全景圖失敗:', error)
    alert('讀取失敗，請稍後再試')
  } finally {
    isFetchingPanorama.value = false
  }
}

// 遞迴組裝巢狀結構
const buildNestedTree = (parentCode, childrenMap) => {
  const children = childrenMap.get(parentCode) ?? []
  return children.map(child => ({
    ...child,
    children: child.my_referral_code
      ? buildNestedTree(child.my_referral_code, childrenMap)
      : []
  }))
}

// 計算總後代數
const countDescendants = (node) => {
  if (!node.children?.length) return 0
  return node.children.length + node.children.reduce((sum, c) => sum + countDescendants(c), 0)
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

            <!-- ========== 原版列表 ========== -->
            <div v-if="viewMode === 'flat'" class="mode-flat">

              <div class="tree-section master-section">
                <h3 class="section-title">✨ 我的引路人</h3>
                <div v-if="master" class="user-card master-card">
                  <img :src="master.picture_url || defaultAvatar" class="avatar" />
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
                    🌌 宗門全景
                  </button>
                </div>

                <div v-if="directDisciples.length === 0" class="empty-text" style="padding: 30px 0;">
                  <div style="font-size: 2.5rem; margin-bottom: 10px;">🍃</div>
                  目前還沒有門徒...<br>趕快去分享你的推坑碼吧！
                </div>

                <div v-else class="disciples-list mt-3">
                  <div v-for="disciple in directDisciples" :key="disciple.id" class="user-card disciple-card">
                    <img :src="disciple.picture_url || defaultAvatar" class="avatar" />
                    <div class="user-info">
                      <span class="u-name">{{ disciple.display_name }}</span>
                      <span class="u-date">拜師日: {{ disciple.created_at.split('T')[0] }}</span>
                    </div>
                    <div class="status-badge" :class="disciple.total_exp > 0 ? 'status-active' : 'status-pending'">
                      {{ disciple.total_exp > 0 ? '🟢 已出師' : '⏳ 見習' }}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- ========== 全景樹狀圖 ========== -->
            <div v-else-if="viewMode === 'panorama'" class="mode-panorama">

              <button class="btn-back" @click="viewMode = 'flat'">⬅️ 返回列表</button>

              <div v-if="isFetchingPanorama" class="loading-state">
                <div style="font-size: 2rem; margin-bottom: 10px;">🔮</div>
                正在推演宗門血脈，請稍候...
              </div>

              <!-- 樹狀圖容器：橫向捲動 -->
              <div v-else class="panorama-scroll-wrap">
                <div class="tree-canvas">
                  <TreeNodeVue v-if="treeRoot" :node="treeRoot" />
                  <div v-else class="empty-text mt-3">哎呀，宗門尚未開枝散葉！</div>
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
/* ========== Modal 框架 ========== */
.tree-modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.88); z-index: 9999; display: flex; align-items: flex-end; justify-content: center; backdrop-filter: blur(6px); }
.tree-modal-content { background: #111; width: 100%; max-width: 600px; height: 88vh; border-radius: 24px 24px 0 0; border-top: 2px solid #D4AF37; display: flex; flex-direction: column; box-shadow: 0 -10px 40px rgba(0,0,0,0.8); }

.tree-header { padding: 18px 20px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #222; background: linear-gradient(180deg, #1a1a1a 0%, #111 100%); border-radius: 24px 24px 0 0; flex-shrink: 0; }
.tree-title { margin: 0; color: #D4AF37; font-size: 1.2rem; }
.close-btn { background: #222; border: none; color: #888; width: 32px; height: 32px; border-radius: 50%; font-size: 1rem; cursor: pointer; display: flex; align-items: center; justify-content: center; }
.close-btn:hover { background: #333; color: #fff; }

.tree-body { flex: 1; overflow-y: auto; padding: 16px; min-height: 0; }
.loading-state { text-align: center; color: #888; padding: 50px 0; }

/* ========== 原版列表樣式 ========== */
.tree-section { background: #161616; border: 1px solid #222; border-radius: 12px; padding: 15px; margin-bottom: 16px; }
.section-header-flex { display: flex; justify-content: space-between; align-items: center; border-bottom: 1px dashed #333; padding-bottom: 12px; }
.section-title { margin: 0 0 12px 0; color: #eee; font-size: 0.95rem; border-bottom: 1px dashed #333; padding-bottom: 8px; }
.user-card { display: flex; align-items: center; gap: 12px; background: #0a0a0a; padding: 12px; border-radius: 8px; border: 1px solid #222; }
.master-card { border-color: rgba(212,175,55,0.4); background: rgba(212,175,55,0.05); }
.avatar { width: 44px; height: 44px; border-radius: 50%; object-fit: cover; border: 1px solid #444; }
.user-info { display: flex; flex-direction: column; flex: 1; }
.u-name { color: #fff; font-weight: bold; font-size: 0.95rem; }
.u-level { color: #D4AF37; font-size: 0.78rem; margin-top: 3px; }
.u-date { color: #666; font-size: 0.78rem; margin-top: 3px; }
.gen-tag { background: rgba(212,175,55,0.2); color: #D4AF37; padding: 2px 5px; border-radius: 4px; font-size: 0.65rem; border: 1px solid rgba(212,175,55,0.4); }
.empty-text { text-align: center; color: #777; font-size: 0.9rem; padding: 10px 0; }
.stats-grid { display: flex; gap: 12px; }
.stat-box { flex: 1; background: #0a0a0a; border: 1px solid #222; padding: 14px; border-radius: 8px; text-align: center; }
.stat-num { font-size: 1.7rem; font-weight: bold; color: #D4AF37; margin-bottom: 4px; }
.stat-label { color: #888; font-size: 0.82rem; }
.disciples-list { display: flex; flex-direction: column; gap: 10px; }
.status-badge { padding: 4px 7px; border-radius: 4px; font-size: 0.72rem; font-weight: bold; white-space: nowrap; }
.status-active { background: rgba(46,204,113,0.1); color: #2ecc71; border: 1px solid rgba(46,204,113,0.3); }
.status-pending { background: rgba(241,196,15,0.1); color: #f1c40f; border: 1px solid rgba(241,196,15,0.3); }
.btn-panorama { background: linear-gradient(135deg, #2a1b4d 0%, #1a0b2e 100%); color: #b388ff; border: 1px solid #7c4dff; padding: 6px 12px; border-radius: 20px; font-size: 0.82rem; font-weight: bold; cursor: pointer; transition: 0.2s; box-shadow: 0 0 10px rgba(124,77,255,0.2); white-space: nowrap; }
.btn-panorama:hover { transform: translateY(-1px); box-shadow: 0 0 15px rgba(124,77,255,0.4); }
.btn-back { background: transparent; border: 1px solid #444; color: #aaa; padding: 7px 14px; border-radius: 8px; cursor: pointer; font-size: 0.88rem; margin-bottom: 14px; display: inline-block; }
.btn-back:hover { background: #222; color: #fff; }
.mt-3 { margin-top: 14px; }

/* ========== 全景圖捲動容器 ========== */
.mode-panorama { display: flex; flex-direction: column; height: 100%; }
.panorama-scroll-wrap {
  flex: 1;
  overflow: auto;             /* 雙向捲動 */
  -webkit-overflow-scrolling: touch;
  background: #0a0a0a;
  border: 1px solid #222;
  border-radius: 12px;
  padding: 24px 16px 40px;
}
.tree-canvas {
  display: inline-flex;       /* 讓內容撐開寬度，橫向可捲 */
  flex-direction: column;
  align-items: center;
  min-width: max-content;
}

/* ========== 樹節點元件樣式（全域，因為是動態 template）========== */
</style>

<!-- 樹節點的樣式需要用非 scoped 的方式，才能套用到遞迴子元件 -->
<style>
.t-node-wrap {
  display: flex;
  flex-direction: column;
  align-items: center;
}

/* 節點本體欄 */
.t-node-col {
  display: flex;
  flex-direction: column;
  align-items: center;
}

/* 卡片 */
.t-card {
  display: flex;
  align-items: center;
  gap: 8px;
  background: #161616;
  border: 1px solid #2a2a2a;
  border-radius: 12px;
  padding: 8px 10px;
  width: 130px;
  cursor: default;
  transition: border-color 0.2s, box-shadow 0.2s;
  position: relative;
  box-sizing: border-box;
}
.t-card-root {
  background: rgba(212,175,55,0.07);
  border-color: rgba(212,175,55,0.5);
  box-shadow: 0 0 14px rgba(212,175,55,0.15);
  width: 148px;
}
.t-card-active {
  border-color: rgba(46,204,113,0.25);
}
.t-card[style*="cursor"]:hover,
.t-card:active {
  border-color: rgba(212,175,55,0.4);
  box-shadow: 0 0 8px rgba(212,175,55,0.1);
}

/* 頭像 */
.t-avatar-wrap { position: relative; flex-shrink: 0; }
.t-avatar { width: 36px; height: 36px; border-radius: 50%; object-fit: cover; border: 1px solid #333; display: block; }
.t-card-root .t-avatar { width: 42px; height: 42px; border-color: #D4AF37; }
.t-crown { position: absolute; top: -8px; left: 50%; transform: translateX(-50%); font-size: 13px; line-height: 1; }
.t-status-dot { position: absolute; bottom: 1px; right: 1px; width: 9px; height: 9px; border-radius: 50%; border: 1.5px solid #111; }
.dot-active { background: #2ecc71; }
.dot-pending { background: #555; }

/* 文字 */
.t-info { flex: 1; min-width: 0; }
.t-name { color: #eee; font-size: 11px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.t-card-root .t-name { color: #D4AF37; font-size: 12px; }
.t-meta { display: flex; align-items: center; gap: 4px; margin-top: 3px; }
.t-badge { background: rgba(212,175,55,0.15); color: #D4AF37; border: 1px solid rgba(212,175,55,0.3); padding: 1px 5px; border-radius: 4px; font-size: 9px; }
.t-badge-root { background: rgba(212,175,55,0.25); }
.t-lv { color: #555; font-size: 9px; }

/* 展開按鈕 */
.t-toggle { color: #555; font-size: 14px; transition: transform 0.2s; line-height: 1; }
.t-toggle.expanded { transform: rotate(0deg); }
.t-toggle:not(.expanded) { transform: rotate(-90deg); }

/* ── 連接線 ── */
.t-vline-down {
  width: 2px;
  height: 20px;
  background: linear-gradient(to bottom, rgba(212,175,55,0.35), rgba(212,175,55,0.1));
}
.t-vline-up {
  width: 2px;
  height: 20px;
  background: linear-gradient(to bottom, rgba(212,175,55,0.1), rgba(212,175,55,0.35));
}

/* 水平線：子節點頂部的橫向連接 */
.t-children-wrap {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
}
.t-hline {
  /* 用 border-top 畫橫線，寬度由子節點撐開 */
  height: 1px;
  width: 100%;
  background: rgba(212,175,55,0.2);
  position: relative;
}
.t-children-row {
  display: flex;
  flex-direction: row;
  align-items: flex-start;
  gap: 12px;
  padding: 0 6px;
}
.t-child-col {
  display: flex;
  flex-direction: column;
  align-items: center;
}

/* 動畫 */
.slide-up-enter-active, .slide-up-leave-active { transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1); }
.slide-up-enter-from, .slide-up-leave-to { opacity: 0; transform: translateY(100%); }
</style>