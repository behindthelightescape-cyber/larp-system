<script setup>
import { ref, computed, onMounted } from 'vue'
import { useUserStore } from '../stores/user'
import { supabase } from '../supabase'
import { Coins, History, ShoppingBag, TrendingUp, ArrowUpRight, Package, Ticket, Sparkles, Loader } from 'lucide-vue-next'

const store = useUserStore()
const activeTab = ref('history')
const isLoadingTx = ref(true)
const isLoadingShop = ref(true)
const isRedeeming = ref(null) // shop_item id currently redeeming

const balance = computed(() => store.userData?.points ?? 0)
const transactions = ref([])
const shopItems = ref([])

const SOURCE_LABELS = {
  qr_scan:        'QR 掃碼',
  achievement:    '成就獎勵',
  referral_l1:    '推薦徒弟首場',
  referral_l2_plus: '推薦徒孫首場',
  shop_redeem:    '商城兌換',
  admin_adjust:   '管理員調整',
}

const fetchTransactions = async () => {
  isLoadingTx.value = true
  const { data } = await supabase
    .from('points_transactions')
    .select('*')
    .eq('user_id', store.userData?.id)
    .order('created_at', { ascending: false })
  if (data) transactions.value = data
  isLoadingTx.value = false
}

const fetchShopItems = async () => {
  isLoadingShop.value = true
  const { data } = await supabase
    .from('shop_items')
    .select('*')
    .eq('is_active', true)
    .order('sort_order')
  if (data) shopItems.value = data
  isLoadingShop.value = false
}

const redeemItem = async (item) => {
  if (balance.value < item.cost) return
  if (item.stock !== null && item.stock <= 0) return alert('此商品已售罄')
  if (!confirm(`確定要使用 ${item.cost} 點兌換「${item.name}」嗎？`)) return

  isRedeeming.value = item.id
  try {
    // 扣點
    await store.grantPoints(store.userData.id, -item.cost, 'shop_redeem', item.id, `兌換 ${item.name}`)

    // 依類型發放獎勵
    if (item.type === 'wardrobe' && item.wardrobe_item_id) {
      await supabase.from('user_wardrobe').upsert({ user_id: store.userData.id, item_id: item.wardrobe_item_id })
    } else {
      // coupon / physical 都發票券
      const expiry = item.coupon_valid_days
        ? new Date(Date.now() + item.coupon_valid_days * 86400000).toISOString()
        : null
      await supabase.from('coupons').insert([{
        user_id: store.userData.id,
        title: item.coupon_title || item.name,
        description: item.coupon_desc || item.description,
        status: 'available',
        expiry_date: expiry,
      }])
    }

    // 更新庫存
    if (item.stock !== null) {
      await supabase.from('shop_items').update({ stock: item.stock - 1 }).eq('id', item.id)
      item.stock -= 1
    }

    alert(`✅ 兌換成功！${item.type === 'wardrobe' ? '道具已加入衣櫃' : '票券已發送至票券匣'}`)
    await fetchTransactions()
  } catch (err) {
    alert('兌換失敗：' + err.message)
  } finally {
    isRedeeming.value = null
  }
}

onMounted(async () => {
  await fetchTransactions()
  await fetchShopItems()
})
</script>

<template>
  <div class="page-container">

    <div class="header-area">
      <div class="title-wrap">
        <span class="title-sub">SPOTLIGHT</span>
        <h2 class="page-title">點數中心</h2>
      </div>
    </div>

    <!-- 餘額英雄區 -->
    <div class="balance-hero fade-in-up">
      <div class="balance-icon-wrap">
        <Coins :size="28" :stroke-width="1.5" />
      </div>
      <div class="balance-main">
        <div class="balance-number">{{ balance.toLocaleString() }}</div>
        <div class="balance-unit">冒險點數</div>
      </div>
    </div>

    <!-- Tab 切換 -->
    <div class="tab-bar fade-in-up">
      <button
        class="tab-btn"
        :class="{ active: activeTab === 'history' }"
        @click="activeTab = 'history'"
      >
        <History :size="15" :stroke-width="1.8" />
        <span>點數紀錄</span>
      </button>
      <button
        class="tab-btn"
        :class="{ active: activeTab === 'shop' }"
        @click="activeTab = 'shop'"
      >
        <ShoppingBag :size="15" :stroke-width="1.8" />
        <span>點數商城</span>
      </button>
    </div>

    <!-- 點數紀錄 -->
    <div v-if="activeTab === 'history'" class="tab-content fade-in-up">
      <div v-if="isLoadingTx" class="empty-state">
        <Loader :size="32" :stroke-width="1.5" class="empty-icon spin" />
      </div>
      <div v-else-if="transactions.length === 0" class="empty-state">
        <History :size="40" :stroke-width="1" class="empty-icon" />
        <p class="empty-title">尚無點數紀錄</p>
        <p class="empty-sub">掃描 QR、完成成就或推薦好友<br>都能獲得點數</p>
      </div>
      <template v-else>
        <div v-for="tx in transactions" :key="tx.id" class="tx-row" :class="tx.delta > 0 ? 'earn' : 'spend'">
          <div class="tx-icon-wrap">
            <TrendingUp v-if="tx.delta > 0" :size="16" :stroke-width="2" />
            <ArrowUpRight v-else :size="16" :stroke-width="2" />
          </div>
          <div class="tx-info">
            <span class="tx-note">{{ tx.note || SOURCE_LABELS[tx.source_type] || tx.source_type }}</span>
            <span class="tx-date">{{ tx.created_at?.split('T')[0] }}</span>
          </div>
          <div class="tx-delta">{{ tx.delta > 0 ? '+' : '' }}{{ tx.delta }} pt</div>
        </div>
      </template>
    </div>

    <!-- 點數商城 -->
    <div v-if="activeTab === 'shop'" class="tab-content fade-in-up">
      <div v-if="isLoadingShop" class="empty-state">
        <Loader :size="32" :stroke-width="1.5" class="empty-icon spin" />
      </div>
      <div v-else-if="shopItems.length === 0" class="empty-state">
        <ShoppingBag :size="40" :stroke-width="1" class="empty-icon" />
        <p class="empty-title">商城籌備中</p>
        <p class="empty-sub">即將推出點數兌換好物</p>
      </div>
      <template v-else>
        <div v-for="item in shopItems" :key="item.id" class="shop-item">
          <div class="shop-item-icon">
            <Sparkles v-if="item.type === 'wardrobe'" :size="20" :stroke-width="1.5" />
            <Ticket v-else-if="item.type === 'coupon'" :size="20" :stroke-width="1.5" />
            <Package v-else :size="20" :stroke-width="1.5" />
          </div>
          <div class="shop-item-info">
            <span class="shop-item-name">{{ item.name }}</span>
            <span class="shop-item-desc">{{ item.description }}</span>
            <span v-if="item.stock !== null" class="shop-item-stock">剩餘 {{ item.stock }} 件</span>
          </div>
          <div class="shop-item-right">
            <span class="shop-item-cost">{{ item.cost }} pt</span>
            <button
              class="redeem-btn"
              :disabled="balance < item.cost || (item.stock !== null && item.stock <= 0) || isRedeeming === item.id"
              @click="redeemItem(item)"
            >
              <Loader v-if="isRedeeming === item.id" :size="13" class="spin" />
              <span v-else-if="item.stock !== null && item.stock <= 0">售罄</span>
              <span v-else>兌換</span>
            </button>
          </div>
        </div>
      </template>
    </div>

    <div class="spacer"></div>
  </div>
</template>

<style scoped>
.page-container {
  width: 100%; max-width: 600px; margin: 0 auto;
  padding: 24px 20px 0; box-sizing: border-box;
  display: flex; flex-direction: column; gap: 16px;
}

/* ── Header ── */
.header-area {
  display: flex; align-items: flex-end;
  justify-content: space-between;
  padding-top: 8px;
}
.title-wrap { display: flex; flex-direction: column; gap: 2px; }
.title-sub {
  font-size: 0.68rem; letter-spacing: 3px;
  color: #D4AF37; opacity: 0.7;
}
.page-title {
  margin: 0; font-size: 1.7rem; font-weight: 900;
  color: #fff; letter-spacing: 1px;
}

/* ── 餘額英雄 ── */
.balance-hero {
  background: rgba(18,18,18,0.72);
  backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);
  border: 1px solid rgba(212,175,55,0.18);
  border-radius: 20px; padding: 28px 24px;
  display: flex; align-items: center; gap: 20px;
  box-shadow: 0 10px 30px rgba(0,0,0,0.4);
  position: relative; overflow: hidden;
}
.balance-hero::before {
  content: '';
  position: absolute; top: 0; left: 0; right: 0; height: 1px;
  background: linear-gradient(90deg, transparent, rgba(212,175,55,0.4), transparent);
}
.balance-icon-wrap {
  width: 56px; height: 56px; border-radius: 16px; flex-shrink: 0;
  background: rgba(212,175,55,0.1);
  border: 1px solid rgba(212,175,55,0.25);
  display: flex; align-items: center; justify-content: center;
  color: #D4AF37;
}
.balance-main { display: flex; flex-direction: column; gap: 2px; }
.balance-number {
  font-size: 2.8rem; font-weight: 900; color: #fff;
  letter-spacing: -1px; line-height: 1;
}
.balance-unit { font-size: 0.82rem; color: #888; letter-spacing: 1px; }

/* ── Tab Bar ── */
.tab-bar {
  display: flex; gap: 8px;
  background: rgba(18,18,18,0.6);
  border: 1px solid rgba(255,255,255,0.06);
  border-radius: 14px; padding: 5px;
}
.tab-btn {
  flex: 1; display: flex; align-items: center; justify-content: center; gap: 6px;
  padding: 10px; border-radius: 10px; border: none;
  background: transparent; color: #555;
  font-size: 0.88rem; font-weight: 600; cursor: pointer;
  transition: all 0.2s;
}
.tab-btn.active {
  background: rgba(212,175,55,0.12);
  border: 1px solid rgba(212,175,55,0.25);
  color: #D4AF37;
}

/* ── 點數紀錄 ── */
.tab-content { display: flex; flex-direction: column; gap: 10px; }

.tx-row {
  display: flex; align-items: center; gap: 14px;
  background: rgba(18,18,18,0.72);
  border: 1px solid rgba(255,255,255,0.06);
  border-radius: 14px; padding: 14px 16px;
}
.tx-icon-wrap {
  width: 36px; height: 36px; border-radius: 10px; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
}
.tx-row.earn .tx-icon-wrap { background: rgba(94,255,138,0.1); color: #5eff8a; }
.tx-row.spend .tx-icon-wrap { background: rgba(255,80,80,0.1); color: #ff6b6b; }
.tx-info { flex: 1; display: flex; flex-direction: column; gap: 3px; }
.tx-note { font-size: 0.9rem; color: #ddd; font-weight: 600; }
.tx-date { font-size: 0.75rem; color: #555; }
.tx-delta { font-size: 1rem; font-weight: 800; white-space: nowrap; }
.tx-row.earn .tx-delta { color: #5eff8a; }
.tx-row.spend .tx-delta { color: #ff6b6b; }

/* ── 商城 ── */
.shop-item {
  display: flex; align-items: center; gap: 14px;
  background: rgba(18,18,18,0.72);
  border: 1px solid rgba(255,255,255,0.06);
  border-radius: 16px; padding: 16px;
  transition: border-color 0.2s;
}
.shop-item:hover { border-color: rgba(212,175,55,0.2); }
.shop-item-icon {
  width: 44px; height: 44px; border-radius: 12px; flex-shrink: 0;
  background: rgba(212,175,55,0.08);
  border: 1px solid rgba(212,175,55,0.15);
  display: flex; align-items: center; justify-content: center;
  color: #D4AF37;
}
.shop-item-info { flex: 1; display: flex; flex-direction: column; gap: 4px; }
.shop-item-name { font-size: 0.95rem; font-weight: 700; color: #eee; }
.shop-item-desc { font-size: 0.78rem; color: #666; }
.shop-item-right { display: flex; flex-direction: column; align-items: flex-end; gap: 6px; }
.shop-item-cost { font-size: 0.9rem; font-weight: 800; color: #D4AF37; }
.redeem-btn {
  padding: 6px 14px; border-radius: 8px; border: none; cursor: pointer;
  background: rgba(212,175,55,0.15);
  border: 1px solid rgba(212,175,55,0.3);
  color: #D4AF37; font-size: 0.8rem; font-weight: 700;
  transition: all 0.2s;
}
.redeem-btn:hover:not(:disabled) {
  background: rgba(212,175,55,0.25);
  border-color: rgba(212,175,55,0.5);
}
.redeem-btn:disabled { opacity: 0.35; cursor: not-allowed; }

/* ── 空狀態 ── */
.empty-state {
  display: flex; flex-direction: column; align-items: center;
  padding: 48px 20px; gap: 10px;
}
.empty-icon { color: #333; }
.empty-title { color: #555; font-size: 1rem; font-weight: 700; margin: 0; }
.empty-sub { color: #444; font-size: 0.82rem; text-align: center; line-height: 1.7; margin: 0; }

.shop-item-stock { font-size: 0.72rem; color: #666; }

.spacer { height: 80px; }

.spin { animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

/* ── 進場動畫 ── */
.fade-in-up {
  opacity: 0; transform: translateY(16px);
  animation: fadeInUp 0.5s ease forwards;
}
@keyframes fadeInUp {
  to { opacity: 1; transform: translateY(0); }
}
</style>
