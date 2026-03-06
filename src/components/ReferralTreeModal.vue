<script setup>
import { ref, onMounted, computed } from 'vue'
import { useUserStore } from '../stores/user'
import { supabase } from '../supabase'
import TreeNode from './TreeNode.vue'
import { GitBranch, Network, Sparkles, Shield, Swords, ArrowLeft, Loader2, Leaf, CheckCircle2, Clock, ScrollText } from 'lucide-vue-next'

const props = defineProps({ show: Boolean })
const emit = defineEmits(['close'])
const store = useUserStore()

const isLoading = ref(true)
const hasError = ref(false)
const viewMode = ref('flat')
const isFetchingPanorama = ref(false)

const master = ref(null)
const directDisciples = ref([])
const treeRoot = ref(null)

const defaultAvatar = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='40' height='40'%3E%3Crect width='40' height='40' rx='20' fill='%23333'/%3E%3Ctext x='50%25' y='55%25' text-anchor='middle' dominant-baseline='middle' fill='%23888' font-size='16'%3E?%3C/text%3E%3C/svg%3E`

const totalDisciples = computed(() => directDisciples.value.length)
const activeDisciples = computed(() => directDisciples.value.filter(d => d.total_exp > 0).length)

onMounted(async () => {
  if (store.userData) {
    viewMode.value = 'flat'
    await fetchDirectFamily()
  } else {
    isLoading.value = false
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
    hasError.value = true
  } finally {
    isLoading.value = false
  }
}

const fetchPanoramaTree = async () => {
  if (!store.userData.my_referral_code) {
    alert('您還沒有解鎖推坑碼喔！')
    return
  }

  isFetchingPanorama.value = true
  viewMode.value = 'panorama'
  treeRoot.value = null

  try {
    let currentLevelCodes = [store.userData.my_referral_code]
    const allDescendants = []
    let currentGeneration = 1

    while (currentLevelCodes.length > 0 && currentGeneration <= 10) {
      const { data, error } = await supabase
        .from('users')
        .select('id, display_name, level, total_exp, picture_url, my_referral_code, referred_by')
        .in('referred_by', currentLevelCodes)
        .order('created_at', { ascending: true })

      if (error) { console.error('Supabase error:', error); break }
      if (!data || data.length === 0) break

      allDescendants.push(...data.map(d => ({ ...d, generation: currentGeneration })))
      currentLevelCodes = [...new Set(data.map(d => d.my_referral_code).filter(Boolean))]
      currentGeneration++
    }

    const childrenMap = new Map()
    for (const u of allDescendants) {
      const key = u.referred_by
      if (!childrenMap.has(key)) childrenMap.set(key, [])
      childrenMap.get(key).push(u)
    }

    const buildNested = (parentCode) => {
      return (childrenMap.get(parentCode) ?? []).map(child => ({
        ...child,
        children: child.my_referral_code ? buildNested(child.my_referral_code) : []
      }))
    }

    treeRoot.value = {
      id: 'root',
      display_name: store.userData.display_name || '我',
      level: store.userData.level || 1,
      picture_url: store.userData.picture_url || null,
      total_exp: 1,
      generation: 0,
      isRoot: true,
      children: buildNested(store.userData.my_referral_code)
    }

  } catch (error) {
    console.error('讀取全景圖失敗:', error)
    alert('讀取失敗，請稍後再試')
  } finally {
    isFetchingPanorama.value = false
  }
}

const closeModal = () => emit('close')
</script>

<template>
  <Teleport to="body">
    <transition name="slide-up">
      <div v-if="show" class="tree-modal-overlay" @click.self="closeModal">
        <div class="tree-modal-content">

          <!-- Header（固定不捲動） -->
          <div class="tree-header">
            <h2 class="tree-title">
              <GitBranch v-if="viewMode === 'flat'" :size="18" :stroke-width="1.8" class="title-icon" />
              <Network v-else :size="18" :stroke-width="1.8" class="title-icon" />
              {{ viewMode === 'flat' ? '宗門直系族譜' : '宗門全景圖' }}
            </h2>
            <button class="close-btn" @click="closeModal">✕</button>
          </div>

          <!-- 全局 loading -->
          <div v-if="isLoading" class="loading-state">
            <Loader2 :size="28" :stroke-width="1.5" class="spin-icon" />
            <div style="margin-top:10px">讀取宗門卷宗中...</div>
          </div>

          <!-- 無資料 / 錯誤狀態 -->
          <div v-else-if="!store.userData || hasError" class="empty-full-state">
            <ScrollText :size="36" :stroke-width="1.2" class="empty-full-icon" />
            <div class="empty-full-text">{{ hasError ? '卷宗讀取失敗，請稍後再試' : '尚未登入，無法查閱族譜' }}</div>
          </div>

          <!-- 直系列表：可捲動 -->
          <div v-else-if="viewMode === 'flat'" class="tree-body">
            <div class="tree-section">
              <h3 class="section-title"><Sparkles :size="14" :stroke-width="1.8" class="sec-icon" /> 我的引路人</h3>
              <div v-if="master" class="user-card master-card">
                <img :src="master.picture_url || defaultAvatar" class="avatar" />
                <div class="user-info">
                  <span class="u-name">{{ master.display_name }}</span>
                  <span class="u-level">LV.{{ master.level }} 尊榮老手</span>
                </div>
              </div>
              <div v-else class="empty-text">您是開山祖師爺，沒有引路人！</div>
            </div>

            <div class="tree-section">
              <h3 class="section-title"><Shield :size="14" :stroke-width="1.8" class="sec-icon" /> 我的直系弟子</h3>
              <div class="stats-grid">
                <div class="stat-box">
                  <div class="stat-num">{{ totalDisciples }}</div>
                  <div class="stat-label">直系弟子</div>
                </div>
                <div class="stat-box">
                  <div class="stat-num" style="color:#2ecc71">{{ activeDisciples }}</div>
                  <div class="stat-label">已出師</div>
                </div>
              </div>
            </div>

            <div class="tree-section">
              <div class="section-header-flex">
                <h3 class="section-title" style="border:none;margin:0"><Swords :size="14" :stroke-width="1.8" class="sec-icon" /> 直系弟子列表</h3>
                <button v-if="directDisciples.length > 0" class="btn-panorama" @click="fetchPanoramaTree">
                  <Network :size="13" :stroke-width="1.8" class="btn-icon" /> 宗門全景
                </button>
              </div>
              <div v-if="directDisciples.length === 0" class="empty-text" style="padding:30px 0">
                <Leaf :size="36" :stroke-width="1.2" class="empty-icon" />
                <div style="margin-top:10px">目前還沒有門徒...<br>趕快去分享你的推坑碼吧！</div>
              </div>
              <div v-else class="disciples-list mt-3">
                <div v-for="d in directDisciples" :key="d.id" class="user-card">
                  <img :src="d.picture_url || defaultAvatar" class="avatar" />
                  <div class="user-info">
                    <span class="u-name">{{ d.display_name }}</span>
                    <span class="u-date">拜師日: {{ d.created_at.split('T')[0] }}</span>
                  </div>
                  <div class="status-badge" :class="d.total_exp > 0 ? 'status-active' : 'status-pending'">
                    <CheckCircle2 v-if="d.total_exp > 0" :size="11" :stroke-width="2" />
                    <Clock v-else :size="11" :stroke-width="2" />
                    {{ d.total_exp > 0 ? '已出師' : '見習' }}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- 全景圖：獨立佔滿剩餘高度，雙向捲動 -->
          <div v-else-if="viewMode === 'panorama'" class="panorama-mode">

            <!-- 全景 sub-header（固定） -->
            <div class="panorama-header">
              <button class="btn-back" @click="viewMode = 'flat'"><ArrowLeft :size="14" :stroke-width="2" class="btn-icon" /> 返回列表</button>
              <span class="panorama-hint">可上下左右滑動</span>
            </div>

            <!-- loading -->
            <div v-if="isFetchingPanorama" class="loading-state">
              <Loader2 :size="32" :stroke-width="1.5" class="spin-icon" />
              <div style="margin-top:10px">正在推演宗門血脈，請稍候...</div>
            </div>

            <!-- 雙向捲動畫布 -->
            <div v-else-if="treeRoot" class="panorama-scroll-wrap">
              <div class="tree-canvas">
                <TreeNode :node="treeRoot" />
              </div>
            </div>

            <div v-else class="loading-state">哎呀，宗門尚未開枝散葉！</div>
          </div>

        </div>
      </div>
    </transition>
  </Teleport>
</template>

<style scoped>
/* ── Modal 框架 ── */
.tree-modal-overlay {
  position: fixed; inset: 0;
  background: rgba(0,0,0,0.88);
  z-index: 9999;
  display: flex; align-items: flex-end; justify-content: center;
  backdrop-filter: blur(6px);
}
.tree-modal-content {
  background: #111;
  width: 100%; max-width: 600px;
  height: 88vh;
  border-radius: 24px 24px 0 0;
  border-top: 2px solid #D4AF37;
  /* 關鍵：flex column，讓子區塊自己管高度 */
  display: flex; flex-direction: column;
  box-shadow: 0 -10px 40px rgba(0,0,0,0.8);
  overflow: hidden; /* 防止子元素撐破圓角 */
}

/* ── Header（不捲動，固定在頂部） ── */
.tree-header {
  padding: 18px 20px;
  display: flex; justify-content: space-between; align-items: center;
  border-bottom: 1px solid #222;
  background: linear-gradient(180deg, #1a1a1a 0%, #111 100%);
  border-radius: 24px 24px 0 0;
  flex-shrink: 0; /* 不壓縮 */
}
.tree-title { margin: 0; color: #D4AF37; font-size: 1.2rem; display: flex; align-items: center; gap: 8px; }
.title-icon { flex-shrink: 0; }
.sec-icon { vertical-align: middle; margin-right: 2px; opacity: 0.85; }
.btn-icon { vertical-align: middle; }
.empty-icon { color: #444; display: block; margin: 0 auto; }
.status-badge { display: flex; align-items: center; gap: 4px; }
@keyframes spin { 100% { transform: rotate(360deg); } }
.spin-icon { color: #D4AF37; animation: spin 1.2s linear infinite; }
.close-btn {
  background: #222; border: none; color: #888;
  width: 32px; height: 32px; border-radius: 50%;
  font-size: 1rem; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
}

/* ── 直系列表：flex:1 撐滿剩餘，自己捲動 ── */
.tree-body {
  flex: 1;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  padding: 16px;
  min-height: 0; /* flex 子元素必須加，否則不會縮小 */
}
.loading-state {
  text-align: center; color: #888; padding: 50px 0; flex-shrink: 0;
  display: flex; flex-direction: column; align-items: center;
}
.empty-full-state {
  flex: 1; display: flex; flex-direction: column;
  align-items: center; justify-content: center; gap: 14px;
  padding: 40px 24px;
}
.empty-full-icon { color: #333; }
.empty-full-text { color: #555; font-size: 0.9rem; text-align: center; line-height: 1.6; }

/* ── 全景模式：佔滿剩餘高度，內部再分兩層 ── */
.panorama-mode {
  flex: 1;
  display: flex; flex-direction: column;
  min-height: 0; /* 同上，必要 */
  overflow: hidden;
}

/* 全景 sub-header */
.panorama-header {
  flex-shrink: 0;
  display: flex; align-items: center; justify-content: space-between;
  padding: 10px 16px;
  border-bottom: 1px solid #1e1e1e;
  background: #111;
}
.btn-back {
  background: transparent; border: 1px solid #333; color: #888;
  padding: 6px 14px; border-radius: 8px; cursor: pointer;
  font-size: 0.85rem; transition: 0.2s;
}
.btn-back:active { background: #1e1e1e; color: #fff; }
.panorama-hint { color: #333; font-size: 0.75rem; letter-spacing: 0.5px; }

/* 雙向捲動區：撐滿剩餘高度 */
.panorama-scroll-wrap {
  flex: 1;
  overflow: auto;              /* 雙向捲動 */
  -webkit-overflow-scrolling: touch;
  min-height: 0;               /* 必要：讓 flex:1 在 overflow 下正確縮放 */
  background: #0a0a0a;
  padding: 28px 20px 60px;     /* 底部多留空間，避免最後一層被截 */
}

/* 樹畫布：inline-flex 讓內容撐開寬度，橫向可捲 */
.tree-canvas {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  min-width: max-content;
}

/* ── 直系列表樣式 ── */
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
.empty-text { text-align: center; color: #777; font-size: 0.9rem; padding: 10px 0; }
.stats-grid { display: flex; gap: 12px; }
.stat-box { flex: 1; background: #0a0a0a; border: 1px solid #222; padding: 14px; border-radius: 8px; text-align: center; }
.stat-num { font-size: 1.7rem; font-weight: bold; color: #D4AF37; margin-bottom: 4px; }
.stat-label { color: #888; font-size: 0.82rem; }
.disciples-list { display: flex; flex-direction: column; gap: 10px; }
.status-badge { padding: 4px 7px; border-radius: 4px; font-size: 0.72rem; font-weight: bold; white-space: nowrap; }
.status-active { background: rgba(46,204,113,0.1); color: #2ecc71; border: 1px solid rgba(46,204,113,0.3); }
.status-pending { background: rgba(241,196,15,0.1); color: #f1c40f; border: 1px solid rgba(241,196,15,0.3); }
.btn-panorama { background: linear-gradient(135deg,#2a1b4d 0%,#1a0b2e 100%); color: #b388ff; border: 1px solid #7c4dff; padding: 6px 12px; border-radius: 20px; font-size: 0.82rem; font-weight: bold; cursor: pointer; white-space: nowrap; }
.mt-3 { margin-top: 14px; }

/* ── 進場動畫 ── */
.slide-up-enter-active, .slide-up-leave-active { transition: all 0.3s cubic-bezier(0.25,0.8,0.25,1); }
.slide-up-enter-from, .slide-up-leave-to { opacity: 0; transform: translateY(100%); }
</style>