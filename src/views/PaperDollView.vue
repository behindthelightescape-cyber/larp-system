<template>
  <div class="page-container">
    <div class="content-layer" :class="{ 'enter-active': isLoaded }">

      <!-- Header -->
      <div class="page-header fade-in-down">
        <div class="header-left">
          <div class="title-wrap">
            <span class="title-sub">SPOTLIGHT</span>
            <h2 class="page-title">燈燈造型室</h2>
          </div>
        </div>
        <div class="point-chip">
          <span class="point-icon">✦</span>
          <span class="point-val">{{ userExp }}</span>
          <span class="point-unit">pt</span>
        </div>
      </div>

      <!-- 角色舞台 -->
      <div class="stage-card fade-in-up delay-1" :style="{ background: currentBg }">
        <div class="card-deco-top"></div>
        <div class="stage-spotlight"></div>

        <!-- 換背景按鈕 -->
        <button class="bg-change-btn" @click="showBgModal = true">
          <ImageIcon :size="14" :stroke-width="1.8" /> 換背景
        </button>

        <div class="doll-stage">
          <!-- 披風在角色後面 -->
          <template v-if="equipped.cape && !equipped.cape.is_none">
            <img v-if="equipped.cape.img_url" class="layer-img layer-clothing" :src="equipped.cape.img_url" :alt="equipped.cape.name" />
            <span v-else class="emoji-overlay cape">{{ equipped.cape.emoji }}</span>
          </template>
          <!-- 底圖 -->
          <img class="layer-img" :src="baseImgUrl || 'https://meee.com.tw/hLmrwbm.png'" alt="角色底圖" />
          <!-- 其餘服裝圖層 -->
          <template v-for="slot in layerOrder.filter(s => s !== 'cape')" :key="slot">
            <img v-if="equipped[slot] && !equipped[slot].is_none && equipped[slot].img_url"
              class="layer-img layer-clothing"
              :src="equipped[slot].img_url"
              :alt="equipped[slot].name"
            />
            <span v-else-if="equipped[slot] && !equipped[slot].is_none && equipped[slot].emoji"
              class="emoji-overlay" :class="slot"
            >{{ equipped[slot].emoji }}</span>
          </template>
        </div>
        <div class="stage-shadow"></div>
        <div class="card-deco-bottom"></div>
      </div>

      <!-- 衣櫥面板 -->
      <div class="wardrobe-card fade-in-up delay-2">
        <div class="card-deco-top"></div>

        <!-- 分類 Tab -->
        <div class="category-tabs">
          <button
            v-for="cat in categories"
            :key="cat.key"
            class="cat-tab"
            :class="{ active: activeCategory === cat.key }"
            @click="activeCategory = cat.key"
          >
            <component :is="cat.icon" class="cat-icon" :size="22" :stroke-width="1.5" />
            <span class="cat-label">{{ cat.label }}</span>
            <span v-if="activeCategory === cat.key" class="cat-underline"></span>
          </button>
        </div>

        <div class="divider-line"><span class="divider-gem">◆</span></div>

        <!-- 服裝格子 -->
        <div class="item-grid">
          <button
            v-for="item in currentItems"
            :key="item.id"
            class="item-card"
            :class="{ selected: isSelected(item), locked: getItemState(item) === 'locked' }"
            @click="selectItem(item)"
          >
            <div class="item-thumb">
              <img v-if="item.img_url" :src="item.img_url" :alt="item.name" class="item-thumb-img" />
              <span v-else class="item-emoji">{{ getItemState(item) === 'locked' ? '🔒' : (item.emoji || '✦') }}</span>
              <div v-if="getItemState(item) === 'locked'" class="lock-veil"></div>
            </div>
            <span class="item-name">{{ item.name }}</span>
            <span v-if="getItemState(item) === 'purchasable'" class="item-price">{{ item.unlock_cost }} pt</span>
            <span v-else-if="getItemState(item) === 'claimable' && !item.is_none" class="item-badge claimable">領取</span>
            <span v-else-if="isSelected(item)" class="item-badge">✔</span>
          </button>
        </div>

        <div class="card-deco-bottom"></div>
      </div>

    </div>

    <!-- 換背景彈窗 -->
    <Teleport to="body">
      <transition name="slide-up">
        <div v-if="showBgModal" class="modal-overlay" @click.self="showBgModal = false">
          <div class="bg-modal">
            <div class="modal-handle"></div>
            <div class="modal-top-bar">
              <h3>✦ 選擇場景背景</h3>
              <button class="close-btn-icon" @click="showBgModal = false">✕</button>
            </div>
            <div class="bg-grid">
              <button
                v-for="bg in [noneBg, ...backgrounds]"
                :key="bg.id"
                class="bg-card"
                :class="{ active: bg.is_none ? activeBgId === null : activeBgId === bg.id, locked: getBgState(bg) === 'locked' }"
                @click="selectBg(bg)"
              >
                <div
                  class="bg-preview"
                  :style="bg.img_url
                    ? { backgroundImage: `url(${bg.img_url})`, backgroundSize: 'cover', backgroundPosition: 'center' }
                    : { background: 'linear-gradient(160deg,#1a1a1a,#2a2a2a)' }"
                >
                  <span v-if="getBgState(bg) === 'locked'" class="bg-card-lock">🔒</span>
                  <span v-if="activeBgId === bg.id" class="bg-card-check">✔</span>
                </div>
                <span class="bg-name">{{ bg.name }}</span>
                <span v-if="getBgState(bg) === 'purchasable'" class="bg-price">{{ bg.unlock_cost }} pt</span>
                <span v-else-if="getBgState(bg) === 'claimable'" class="bg-price claimable">免費領取</span>
              </button>
            </div>
          </div>
        </div>
      </transition>
    </Teleport>

    <!-- 鎖定道具彈窗 -->
    <Teleport to="body">
      <transition name="fade-pop">
        <div v-if="lockedItem" class="locked-overlay" @click.self="lockedItem = null">
          <div class="locked-modal">
            <div class="locked-thumb">
              <img v-if="lockedItem.img_url" :src="lockedItem.img_url" :alt="lockedItem.name" class="locked-img" />
              <span v-else class="locked-emoji">{{ lockedItem.emoji || '🔒' }}</span>
            </div>
            <h4 class="locked-name">{{ lockedItem.name }}</h4>
            <div class="locked-divider"><span class="divider-gem">◆</span></div>
            <p class="locked-label">取得方式</p>
            <p class="locked-obtain">{{ obtainDesc(lockedItem) }}</p>
            <button
              v-if="lockedItem.state === 'claimable'"
              class="locked-claim"
              :disabled="isClaiming"
              @click="claimItem(lockedItem)"
            >{{ isClaiming ? '領取中...' : '免費領取' }}</button>
            <button
              v-else-if="lockedItem.state === 'purchasable'"
              class="locked-claim"
              :disabled="isClaiming"
              @click="purchaseItem(lockedItem)"
            >{{ isClaiming ? '購買中...' : `花費 ${lockedItem.unlock_cost} pt 購買` }}</button>
            <button class="locked-close" @click="lockedItem = null">知道了</button>
          </div>
        </div>
      </transition>
    </Teleport>

  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, watch } from 'vue'
import { Smile, Crown, Shirt, Wind, Layers, Gem, Image as ImageIcon } from 'lucide-vue-next'
import { supabase } from '../supabase'
import { useUserStore } from '../stores/user'

const userStore = useUserStore()
const userId = computed(() => userStore.userData?.id ?? null)
const userExp = computed(() => userStore.userData?.total_exp ?? 0)

const isLoaded = ref(false)
const isPageLoading = ref(true)

// ── 分類 ──
const categories = [
  { key: 'expr',   label: '表情', icon: Smile },
  { key: 'hat',    label: '帽子', icon: Crown },
  { key: 'top',    label: '上衣', icon: Shirt },
  { key: 'cape',   label: '披風', icon: Wind },
  { key: 'bottom', label: '下身', icon: Layers },
  { key: 'acc',    label: '配件', icon: Gem },
]
const activeCategory = ref('hat')
const layerOrder = ['bottom', 'cape', 'top', 'acc', 'hat', 'expr']

// 各分類固定的「不裝備」選項（不來自 DB）
const noneItem = (category, label) => ({
  id: `none_${category}`, name: label, img_url: null,
  category, is_none: true, unlock_type: 'free',
})
const noneItems = {
  expr:   noneItem('expr',   '預設'),
  hat:    noneItem('hat',    '不戴'),
  top:    noneItem('top',    '不穿'),
  cape:   noneItem('cape',   '無'),
  bottom: noneItem('bottom', '不穿'),
  acc:    noneItem('acc',    '無'),
}

// ── 角色底圖 ──
const baseImgUrl = ref('')

// ── DB 資料 ──
const allItems      = ref([])   // wardrobe_items
const backgrounds   = ref([])   // wardrobe_backgrounds
const ownedItemIds  = ref(new Set())  // user_wardrobe
const ownedBgIds    = ref(new Set())  // user_wardrobe_backgrounds
const userScriptIds = ref(new Set())  // 玩過的 script id
const userAchIds    = ref(new Set())  // 達成的 achievement id

// ── 背景 ──
const showBgModal = ref(false)
const activeBgId  = ref(null)
const noneBg = { id: '__none__', name: '無', img_url: null, is_none: true, unlock_type: 'free' }
const currentBg   = computed(() => {
  const bg = backgrounds.value.find(b => b.id === activeBgId.value)
  return bg ? `url(${bg.img_url}) center/cover no-repeat` : 'linear-gradient(160deg,#0a0a0a,#1a1a1a)'
})

// ── 裝備狀態 ──
const equipped = reactive({
  expr: noneItems.expr, hat: noneItems.hat, top: noneItems.top,
  cape: noneItems.cape, bottom: noneItems.bottom, acc: noneItems.acc,
})

// ── 鎖定彈窗 ──
const lockedItem  = ref(null)
const isClaiming  = ref(false)

// ── 道具狀態判斷 ──
const getItemState = (item) => {
  if (item.is_none) return 'owned'
  if (ownedItemIds.value.has(item.id)) return 'owned'
  if (item.unlock_type === 'free') return 'claimable'
  if (item.unlock_type === 'points') return userExp.value >= item.unlock_cost ? 'purchasable' : 'locked'
  if (item.unlock_type === 'script') return userScriptIds.value.has(String(item.unlock_ref_id)) ? 'claimable' : 'locked'
  if (item.unlock_type === 'achievement') return userAchIds.value.has(item.unlock_ref_id) ? 'claimable' : 'locked'
  return 'locked'
}

const getBgState = (bg) => {
  if (bg.is_none) return 'owned'
  if (ownedBgIds.value.has(bg.id)) return 'owned'
  if (bg.unlock_type === 'free') return 'claimable'
  if (bg.unlock_type === 'points') return userExp.value >= bg.unlock_cost ? 'purchasable' : 'locked'
  if (bg.unlock_type === 'script') return userScriptIds.value.has(String(bg.unlock_ref_id)) ? 'claimable' : 'locked'
  if (bg.unlock_type === 'achievement') return userAchIds.value.has(bg.unlock_ref_id) ? 'claimable' : 'locked'
  return 'locked'
}

// ── 目前分類的道具清單（含 none 選項）──
const currentItems = computed(() => {
  const cat = activeCategory.value
  const dbItems = allItems.value.filter(i => i.category === cat)
  return [noneItems[cat], ...dbItems]
})

// ── 載入資料 ──
onMounted(async () => {
  await loadAll()
  setTimeout(() => { isLoaded.value = true }, 80)
})

const loadAll = async () => {
  isPageLoading.value = true
  await Promise.all([
    loadItems(),
    loadBackgrounds(),
    loadUserData(),
    loadBaseImage(),
  ])
  isPageLoading.value = false
}

const loadBaseImage = async () => {
  const { data } = await supabase
    .from('wardrobe_bases')
    .select('img_url')
    .eq('is_default', true)
    .eq('is_active', true)
    .single()
  if (data?.img_url) baseImgUrl.value = data.img_url
}

const loadItems = async () => {
  const { data } = await supabase
    .from('wardrobe_items')
    .select('*')
    .eq('is_active', true)
    .order('sort_order')
  if (data) allItems.value = data
}

const loadBackgrounds = async () => {
  const { data } = await supabase
    .from('wardrobe_backgrounds')
    .select('*')
    .eq('is_active', true)
    .order('sort_order')
  if (data) backgrounds.value = data
}

const loadUserData = async () => {
  if (!userId.value) return

  // 擁有的道具
  const { data: owned } = await supabase
    .from('user_wardrobe')
    .select('item_id')
    .eq('user_id', userId.value)
  if (owned) ownedItemIds.value = new Set(owned.map(r => r.item_id))

  // 擁有的背景
  const { data: ownedBg } = await supabase
    .from('user_wardrobe_backgrounds')
    .select('background_id')
    .eq('user_id', userId.value)
  if (ownedBg) ownedBgIds.value = new Set(ownedBg.map(r => r.background_id))

  // 玩過的劇本
  const { data: games } = await supabase
    .from('game_participants')
    .select('games(script_id)')
    .eq('user_id', userId.value)
  if (games) userScriptIds.value = new Set(games.map(r => String(r.games?.script_id)).filter(Boolean))

  // 達成的成就
  const { data: achs } = await supabase
    .from('user_achievements')
    .select('achievement_id')
    .eq('user_id', userId.value)
  if (achs) userAchIds.value = new Set(achs.map(r => r.achievement_id))

  // 讀取目前裝備
  const { data: eq } = await supabase
    .from('user_wardrobe_equipped')
    .select('equipped, background_id')
    .eq('user_id', userId.value)
    .single()

  if (eq) {
    activeBgId.value = eq.background_id ?? null
    const saved = eq.equipped ?? {}
    for (const cat of Object.keys(equipped)) {
      const itemId = saved[cat]
      if (!itemId) continue
      const found = allItems.value.find(i => i.id === itemId)
      if (found) equipped[cat] = found
    }
  }
}

// ── 儲存裝備 ──
const saveEquipped = async () => {
  if (!userId.value) return
  const equippedMap = {}
  for (const cat of Object.keys(equipped)) {
    if (!equipped[cat]?.is_none) equippedMap[cat] = equipped[cat]?.id ?? null
  }
  await supabase.from('user_wardrobe_equipped').upsert({
    user_id: userId.value,
    equipped: equippedMap,
    background_id: activeBgId.value,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id' })
}

// ── 領取 / 購買 ──
const claimItem = async (item) => {
  if (!userId.value || isClaiming.value) return
  isClaiming.value = true
  try {
    await supabase.from('user_wardrobe').insert({ user_id: userId.value, item_id: item.id })
    ownedItemIds.value = new Set([...ownedItemIds.value, item.id])
    equipped[item.category] = item
    await saveEquipped()
    lockedItem.value = null
  } catch (err) {
    alert('領取失敗：' + err.message)
  } finally {
    isClaiming.value = false
  }
}

const purchaseItem = async (item) => {
  if (!userId.value || isClaiming.value) return
  if (!confirm(`確定花費 ${item.unlock_cost} 點數購買「${item.name}」嗎？`)) return
  isClaiming.value = true
  try {
    await supabase.from('users').update({ total_exp: userExp.value - item.unlock_cost }).eq('id', userId.value)
    userStore.userData.total_exp -= item.unlock_cost
    await supabase.from('user_wardrobe').insert({ user_id: userId.value, item_id: item.id })
    ownedItemIds.value = new Set([...ownedItemIds.value, item.id])
    equipped[item.category] = item
    await saveEquipped()
    lockedItem.value = null
  } catch (err) {
    alert('購買失敗：' + err.message)
  } finally {
    isClaiming.value = false
  }
}

const claimBg = async (bg) => {
  if (!userId.value) return
  await supabase.from('user_wardrobe_backgrounds').insert({ user_id: userId.value, background_id: bg.id })
  ownedBgIds.value = new Set([...ownedBgIds.value, bg.id])
  activeBgId.value = bg.id
  await saveEquipped()
}

const purchaseBg = async (bg) => {
  if (!userId.value) return
  if (!confirm(`確定花費 ${bg.unlock_cost} 點數購買「${bg.name}」場景嗎？`)) return
  await supabase.from('users').update({ total_exp: userExp.value - bg.unlock_cost }).eq('id', userId.value)
  userStore.userData.total_exp -= bg.unlock_cost
  await supabase.from('user_wardrobe_backgrounds').insert({ user_id: userId.value, background_id: bg.id })
  ownedBgIds.value = new Set([...ownedBgIds.value, bg.id])
  activeBgId.value = bg.id
  await saveEquipped()
}

// ── 選擇道具 ──
const selectItem = (item) => {
  const state = getItemState(item)
  if (state === 'owned') {
    equipped[item.category] = item
    saveEquipped()
  } else {
    lockedItem.value = { ...item, state }
  }
}

const isSelected = (item) => equipped[activeCategory.value]?.id === item.id

// ── 選擇背景 ──
const selectBg = async (bg) => {
  if (bg.is_none) { activeBgId.value = null; await saveEquipped(); return }
  const state = getBgState(bg)
  if (state === 'owned') { activeBgId.value = bg.id; await saveEquipped() }
  else if (state === 'claimable') await claimBg(bg)
  else if (state === 'purchasable') await purchaseBg(bg)
}

// 未解鎖說明文字
const obtainDesc = (item) => {
  if (item.unlock_type === 'points') return `需要 ${item.unlock_cost} 點數`
  if (item.unlock_type === 'script') return '完成指定劇本後可領取'
  if (item.unlock_type === 'achievement') return '達成指定成就後可領取'
  return ''
}
</script>

<style scoped>
/* ── 基礎 ── */
.page-container {
  width: 100%; box-sizing: border-box; min-height: 100vh; color: #fff;
  display: grid;
  grid-template-columns: minmax(20px, 1fr) minmax(0, 480px) minmax(20px, 1fr);
}
.content-layer {
  grid-column: 2;
  display: flex; flex-direction: column; align-items: center;
  padding: 16px 0 80px; gap: 16px;
}

/* ── 進場動畫 ── */
.fade-in-down { opacity: 0; transform: translateY(-20px); transition: all 0.8s ease; }
.fade-in-up   { opacity: 0; transform: translateY(30px);  transition: all 0.8s cubic-bezier(0.2, 0.8, 0.2, 1); }
.enter-active .fade-in-down,
.enter-active .fade-in-up { opacity: 1; transform: translateY(0); }
.delay-1 { transition-delay: 0.15s; }
.delay-2 { transition-delay: 0.3s; }

/* ── Header ── */
.page-header {
  width: 100%; display: flex; align-items: center;
  justify-content: space-between; padding: 24px 4px 8px;
}
.title-wrap { display: flex; flex-direction: column; gap: 2px; align-items: flex-start; }
.title-sub {
  font-size: 0.65rem; font-weight: 700;
  letter-spacing: 4px; color: #D4AF37; opacity: 0.7;
}
.page-title {
  margin: 0; font-size: 1.8rem; font-weight: 900;
  letter-spacing: 3px;
  background: linear-gradient(135deg, #fff 0%, #fceabb 40%, #D4AF37 100%);
  -webkit-background-clip: text; -webkit-text-fill-color: transparent;
  background-clip: text;
}
.point-chip {
  display: flex; align-items: baseline; gap: 4px;
  background: rgba(212,175,55,0.1);
  border: 1px solid rgba(212,175,55,0.35);
  border-radius: 20px; padding: 6px 16px;
}
.point-icon { color: #D4AF37; font-size: 0.65rem; }
.point-val  { color: #D4AF37; font-size: 1.1rem; font-weight: 800; }
.point-unit { color: #9e761c; font-size: 0.72rem; }

/* ── 金線裝飾 ── */
.card-deco-top {
  position: absolute; top: 0; left: 12%; right: 12%; height: 2px;
  background: linear-gradient(90deg, transparent, #D4AF37 40%, #f5d77a 50%, #D4AF37 60%, transparent);
}
.card-deco-bottom {
  position: absolute; bottom: 0; left: 28%; right: 28%; height: 1px;
  background: linear-gradient(90deg, transparent, #3a3a3a, transparent);
}

/* ── 角色舞台 ── */
.stage-card {
  width: 100%; position: relative;
  background: rgba(18, 18, 18, 0.72);
  backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);
  border: 1px solid rgba(255,255,255,0.07);
  border-radius: 28px;
  box-shadow: 0 30px 70px rgba(0,0,0,0.65), inset 0 1px 0 rgba(255,255,255,0.05);
  display: flex; flex-direction: column; align-items: center;
  padding: 32px 24px 24px; overflow: hidden;
}
.stage-spotlight {
  position: absolute; top: -20px; left: 50%; transform: translateX(-50%);
  width: 280px; height: 280px;
  background: radial-gradient(circle, rgba(212,175,55,0.08) 0%, transparent 70%);
  pointer-events: none;
}
.doll-stage {
  position: relative; display: inline-block;
  filter: drop-shadow(0 8px 24px rgba(0,0,0,0.6));
}
.layer-img {
  display: block; width: 200px; height: auto;
}
.layer-clothing {
  position: absolute; top: 0; left: 0;
  width: 100%; height: 100%;
  object-fit: contain; pointer-events: none;
}
.emoji-overlay {
  position: absolute; left: 50%; transform: translateX(-50%);
  font-size: 2.2rem; line-height: 1;
  pointer-events: none; user-select: none;
  filter: drop-shadow(0 2px 6px rgba(0,0,0,0.7));
}
.emoji-overlay.expr   { top: 18%; }
.emoji-overlay.hat    { top: 2%; }
.emoji-overlay.top    { top: 38%; }
.emoji-overlay.cape   { top: 30%; left: 75%; transform: none; }
.emoji-overlay.bottom { top: 60%; }
.emoji-overlay.shoes  { top: 80%; }
.emoji-overlay.acc    { top: 48%; left: 72%; transform: none; }

.stage-shadow {
  width: 120px; height: 12px; margin-top: 12px;
  background: radial-gradient(ellipse, rgba(0,0,0,0.5) 0%, transparent 70%);
  border-radius: 50%;
}

/* ── 衣櫥面板 ── */
.wardrobe-card {
  width: 100%; position: relative;
  background: rgba(18, 18, 18, 0.72);
  backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);
  border: 1px solid rgba(255,255,255,0.07);
  border-radius: 28px;
  box-shadow: 0 20px 50px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.05);
  padding: 20px 20px 28px; overflow: hidden;
}

/* ── 分類 Tab ── */
.category-tabs {
  display: flex;
  scrollbar-width: none;
}
.category-tabs::-webkit-scrollbar { display: none; }

.cat-tab {
  flex: 1; position: relative;
  display: flex; flex-direction: column; align-items: center;
  gap: 4px; padding: 10px 4px;
  border-radius: 12px; border: none;
  background: transparent; color: #555;
  cursor: pointer; transition: color 0.2s;
}
.cat-tab.active { color: #D4AF37; }
.cat-icon  { display: block; width: 22px; height: 22px; flex-shrink: 0; }
.cat-label { font-size: 0.68rem; letter-spacing: 0.5px; }
.cat-underline {
  position: absolute; bottom: 0; left: 20%; right: 20%; height: 2px;
  background: linear-gradient(90deg, transparent, #D4AF37, transparent);
  border-radius: 1px;
}

/* 分隔線 */
.divider-line {
  display: flex; align-items: center;
  margin: 12px 0 16px; position: relative;
}
.divider-line::before,
.divider-line::after {
  content: ''; flex: 1; height: 1px;
  background: linear-gradient(90deg, transparent, rgba(255,255,255,0.06));
}
.divider-line::after {
  background: linear-gradient(90deg, rgba(255,255,255,0.06), transparent);
}
.divider-gem { color: #D4AF37; font-size: 0.55rem; opacity: 0.35; margin: 0 10px; }

/* ── 服裝格子 ── */
.item-grid {
  display: grid; grid-template-columns: repeat(3, 1fr);
  gap: 10px;
}

.item-card {
  display: flex; flex-direction: column; align-items: center;
  gap: 6px; padding: 0 0 10px;
  border-radius: 16px;
  border: 1px solid rgba(255,255,255,0.06);
  background: rgba(255,255,255,0.03);
  cursor: pointer; transition: all 0.2s cubic-bezier(0.2, 0.8, 0.2, 1);
  color: #ccc; overflow: hidden;
}
.item-card:active { transform: scale(0.95); }
.item-card.selected {
  border-color: rgba(212,175,55,0.5);
  background: rgba(212,175,55,0.08);
  box-shadow: 0 0 16px rgba(212,175,55,0.1);
}
.item-card.locked { opacity: 0.5; cursor: not-allowed; }

.item-thumb {
  width: 100%; aspect-ratio: 1;
  display: flex; align-items: center; justify-content: center;
  background: rgba(255,255,255,0.03);
  border-radius: 16px 16px 0 0;
  position: relative;
}
.item-emoji { font-size: 2.2rem; }
.item-thumb-img {
  width: 72%; height: 72%;
  object-fit: contain;
}

.lock-veil {
  position: absolute; inset: 0;
  background: rgba(0,0,0,0.2);
  border-radius: 16px 16px 0 0;
}

.item-name {
  font-size: 0.7rem; color: #888; text-align: center;
  padding: 0 4px; line-height: 1.3;
}
.item-price {
  font-size: 0.65rem; color: #D4AF37;
  background: rgba(212,175,55,0.12);
  border-radius: 6px; padding: 2px 7px;
  letter-spacing: 0.3px;
}
.item-badge {
  font-size: 0.7rem; color: #D4AF37; font-weight: 900;
}
.item-badge.claimable {
  font-size: 0.6rem; color: #5eff8a; font-weight: 700;
  background: rgba(94,255,138,0.1);
  border-radius: 6px; padding: 2px 7px;
}

/* ── 換背景按鈕 ── */
.bg-change-btn {
  position: absolute; top: 14px; right: 16px;
  display: flex; align-items: center; gap: 6px;
  background: rgba(0,0,0,0.45);
  border: 1px solid rgba(255,255,255,0.12);
  color: #ccc; font-size: 0.75rem;
  padding: 5px 12px; border-radius: 20px;
  cursor: pointer; z-index: 2;
  backdrop-filter: blur(6px);
  transition: border-color 0.2s, color 0.2s;
}
.bg-change-btn:hover { border-color: rgba(212,175,55,0.4); color: #D4AF37; }

/* 舞台背景 */
.stage-card { transition: background 0.5s ease; }

/* ── 換背景彈窗 ── */
.modal-overlay {
  position: fixed; inset: 0;
  background: rgba(0,0,0,0.85); z-index: 3000;
  display: flex; justify-content: center; align-items: flex-end;
  backdrop-filter: blur(6px);
}
.bg-modal {
  width: 100%; max-width: 600px;
  background: #111; border-radius: 24px 24px 0 0;
  border-top: 2px solid #D4AF37;
  box-shadow: 0 -10px 40px rgba(0,0,0,0.8);
  overflow: hidden;
}
.modal-handle {
  width: 40px; height: 4px; border-radius: 2px;
  background: #333; margin: 12px auto 0;
}
.modal-top-bar {
  display: flex; justify-content: space-between; align-items: center;
  padding: 16px 24px 14px; border-bottom: 1px solid #1e1e1e;
}
.modal-top-bar h3 { margin: 0; color: #D4AF37; font-size: 1.1rem; letter-spacing: 1px; }
.close-btn-icon {
  background: rgba(255,255,255,0.07); border: none; color: #888;
  width: 32px; height: 32px; border-radius: 50%; cursor: pointer;
  display: flex; align-items: center; justify-content: center; font-size: 1rem;
  transition: 0.2s;
}
.close-btn-icon:hover { background: rgba(255,255,255,0.12); color: #fff; }

.bg-grid {
  display: grid; grid-template-columns: repeat(3, 1fr);
  gap: 12px; padding: 20px 20px 36px;
}
.bg-card {
  display: flex; flex-direction: column; align-items: center; gap: 6px;
  background: none; border: none; cursor: pointer;
}
.bg-card.locked { opacity: 0.55; cursor: not-allowed; }
.bg-preview {
  width: 100%; aspect-ratio: 16/9;
  border-radius: 12px;
  border: 2px solid rgba(255,255,255,0.08);
  position: relative; overflow: hidden;
  transition: border-color 0.2s, transform 0.2s;
  display: flex; align-items: center; justify-content: center;
}
.bg-card.active .bg-preview {
  border-color: #D4AF37;
  box-shadow: 0 0 16px rgba(212,175,55,0.3);
}
.bg-card:not(.locked):active .bg-preview { transform: scale(0.95); }
.bg-card-lock { font-size: 1.2rem; }
.bg-card-check {
  position: absolute; bottom: 6px; right: 8px;
  color: #D4AF37; font-size: 0.9rem; font-weight: 900;
}
.bg-name { font-size: 0.75rem; color: #aaa; letter-spacing: 1px; }
.bg-price {
  font-size: 0.65rem; color: #D4AF37;
  background: rgba(212,175,55,0.12);
  border-radius: 6px; padding: 2px 7px;
}
.bg-price.claimable { color: #5eff8a; background: rgba(94,255,138,0.1); }

.slide-up-enter-active, .slide-up-leave-active { transition: all 0.35s cubic-bezier(0.2,0.8,0.2,1); }
.slide-up-enter-from, .slide-up-leave-to { opacity: 0; transform: translateY(100%); }

/* ── 鎖定彈窗 ── */
.locked-overlay {
  position: fixed; inset: 0; z-index: 4000;
  background: rgba(0,0,0,0.75);
  display: flex; align-items: center; justify-content: center;
  backdrop-filter: blur(4px);
}
.locked-modal {
  width: 260px;
  background: #111;
  border: 1px solid rgba(212,175,55,0.3);
  border-radius: 20px;
  padding: 28px 24px 20px;
  display: flex; flex-direction: column; align-items: center; gap: 8px;
  box-shadow: 0 20px 60px rgba(0,0,0,0.8), 0 0 30px rgba(212,175,55,0.08);
}
.locked-thumb { margin-bottom: 4px; }
.locked-img { width: 80px; height: 80px; object-fit: contain; filter: grayscale(0.6) opacity(0.7); }
.locked-emoji { font-size: 3rem; filter: grayscale(1) opacity(0.5); }
.locked-name {
  margin: 0; font-size: 1.1rem; font-weight: 800;
  color: #fff; letter-spacing: 1px;
}
.locked-divider {
  display: flex; align-items: center; width: 100%;
  margin: 4px 0;
}
.locked-divider::before,
.locked-divider::after {
  content: ''; flex: 1; height: 1px;
  background: linear-gradient(90deg, transparent, rgba(255,255,255,0.06));
}
.locked-divider::after {
  background: linear-gradient(90deg, rgba(255,255,255,0.06), transparent);
}
.locked-label {
  margin: 0; font-size: 0.68rem; color: #555;
  letter-spacing: 2px; text-transform: uppercase;
}
.locked-obtain {
  margin: 0; font-size: 0.9rem; color: #D4AF37;
  text-align: center; line-height: 1.5;
}
.locked-claim {
  width: 100%;
  background: rgba(212,175,55,0.15);
  border: 1px solid rgba(212,175,55,0.5);
  color: #D4AF37; font-size: 0.9rem; font-weight: 700;
  padding: 10px; border-radius: 12px; cursor: pointer;
  transition: background 0.2s;
}
.locked-claim:hover:not(:disabled) { background: rgba(212,175,55,0.28); }
.locked-claim:disabled { opacity: 0.5; cursor: not-allowed; }
.locked-close {
  margin-top: 6px; width: 100%;
  background: rgba(255,255,255,0.05);
  border: 1px solid rgba(255,255,255,0.08);
  color: #666; font-size: 0.85rem; font-weight: 600;
  padding: 9px; border-radius: 12px; cursor: pointer;
  transition: background 0.2s;
}
.locked-close:hover { background: rgba(255,255,255,0.08); color: #999; }

.fade-pop-enter-active, .fade-pop-leave-active { transition: all 0.2s ease; }
.fade-pop-enter-from, .fade-pop-leave-to { opacity: 0; transform: scale(0.92); }


/* ── RWD ── */
@media (max-width: 480px) {
  .content-layer { padding: 16px 16px 80px; gap: 12px; }
  .page-title { font-size: 1.3rem; }
  .layer-img { width: 160px; }
  .emoji-overlay { font-size: 1.8rem; }
  .item-grid { grid-template-columns: repeat(3, 1fr); gap: 8px; }
  .item-emoji { font-size: 1.8rem; }
  .cat-tab { padding: 6px 9px; }
  .cat-icon { font-size: 1.15rem; }
  .cat-label { font-size: 0.62rem; }
  .stage-card { padding: 20px 16px 16px; }
  .wardrobe-card { padding: 16px 14px 24px; }
}

@media (min-width: 600px) {
  .layer-img { width: 240px; }
  .item-grid { grid-template-columns: repeat(4, 1fr); }
  .emoji-overlay { font-size: 2.8rem; }
}

@media (min-width: 768px) {
  .page-container { grid-template-columns: minmax(20px, 1fr) minmax(0, 860px) minmax(20px, 1fr); }
  .content-layer { flex-direction: row; align-items: flex-start; flex-wrap: wrap; padding: 24px 0 80px; }
  .page-header { width: 100%; }
  .stage-card { width: 48%; flex-shrink: 0; position: sticky; top: 20px; }
  .wardrobe-card { width: 48%; }
  .fade-in-up, .fade-in-down { transition-delay: 0s !important; }
}
</style>
