<script setup>
import { ref, onMounted } from 'vue'
import { supabase } from '../supabase'
import QRCode from 'qrcode'

const LIFF_URL = 'https://liff.line.me/2009161687-icfQU9r6'

const activeTab = ref('qr')

// ── QR 碼 ──────────────────────────────────────────
const qrCodes = ref([])
const qrLoading = ref(true)
const showQrModal = ref(false)
const qrForm = ref({ label: '', points: 10, is_single_use: true, expires_at: '' })
const qrImages = ref({})
const qrSaving = ref(false)

const fetchQrCodes = async () => {
  qrLoading.value = true
  const { data } = await supabase.from('point_qr_codes').select('*, users(display_name)').order('created_at', { ascending: false })
  if (data) qrCodes.value = data
  qrLoading.value = false
}

const generateQrImage = async (id) => {
  const url = `${LIFF_URL}?point_qr=${id}`
  qrImages.value[id] = await QRCode.toDataURL(url, { width: 200, margin: 2 })
}

const saveQr = async () => {
  if (!qrForm.value.points || qrForm.value.points < 1) return alert('請填寫點數')
  qrSaving.value = true
  const { error } = await supabase.from('point_qr_codes').insert([{
    label: qrForm.value.label || null,
    points: Number(qrForm.value.points),
    is_single_use: qrForm.value.is_single_use,
    expires_at: qrForm.value.expires_at || null,
  }])
  qrSaving.value = false
  if (error) return alert('建立失敗：' + error.message)
  showQrModal.value = false
  qrForm.value = { label: '', points: 10, is_single_use: true, expires_at: '' }
  await fetchQrCodes()
}

const deleteQr = async (id) => {
  if (!confirm('確定刪除這張 QR 碼？')) return
  await supabase.from('point_qr_codes').delete().eq('id', id)
  await fetchQrCodes()
}

// ── 分潤規則 ────────────────────────────────────────
const referralRules = ref([])
const ruleSaving = ref(false)

const fetchRules = async () => {
  const { data } = await supabase.from('referral_point_rules').select('*').order('tier')
  if (data) referralRules.value = data
}

const saveRule = async (rule) => {
  ruleSaving.value = true
  await supabase.from('referral_point_rules')
    .upsert({ tier: rule.tier, points: Number(rule.points), grant_coupon: rule.grant_coupon, is_active: rule.is_active }, { onConflict: 'tier' })
  ruleSaving.value = false
  alert('✅ 已儲存')
}

// ── 商城管理 ────────────────────────────────────────
const shopItems = ref([])
const shopLoading = ref(true)
const showShopModal = ref(false)
const isShopEditing = ref(false)
const wardrobeItems = ref([])

const defaultShopForm = () => ({
  id: crypto.randomUUID(),
  name: '', description: '',
  type: 'coupon',
  cost: 100, stock: null,
  img_url: '',
  is_active: true, sort_order: 0,
  coupon_title: '', coupon_desc: '', coupon_valid_days: 30,
  wardrobe_item_id: '',
})
const shopForm = ref(defaultShopForm())

const fetchShopItems = async () => {
  shopLoading.value = true
  const { data } = await supabase.from('shop_items').select('*').order('sort_order')
  if (data) shopItems.value = data
  shopLoading.value = false
}

const fetchWardrobeItems = async () => {
  const { data } = await supabase.from('wardrobe_items').select('id, name, category').eq('is_active', true).order('sort_order')
  if (data) wardrobeItems.value = data
}

const openShopAdd = () => {
  isShopEditing.value = false
  shopForm.value = defaultShopForm()
  showShopModal.value = true
}

const openShopEdit = (item) => {
  isShopEditing.value = true
  shopForm.value = { ...item, stock: item.stock ?? null }
  showShopModal.value = true
}

const saveShopItem = async () => {
  if (!shopForm.value.name.trim()) return alert('請填寫商品名稱')
  if (!shopForm.value.cost || shopForm.value.cost < 1) return alert('請填寫點數售價')

  const payload = {
    id: shopForm.value.id,
    name: shopForm.value.name.trim(),
    description: shopForm.value.description,
    type: shopForm.value.type,
    cost: Number(shopForm.value.cost),
    stock: shopForm.value.stock !== null && shopForm.value.stock !== '' ? Number(shopForm.value.stock) : null,
    img_url: shopForm.value.img_url || null,
    is_active: shopForm.value.is_active,
    sort_order: Number(shopForm.value.sort_order) || 0,
    coupon_title: shopForm.value.type !== 'wardrobe' ? shopForm.value.coupon_title || null : null,
    coupon_desc: shopForm.value.type !== 'wardrobe' ? shopForm.value.coupon_desc || null : null,
    coupon_valid_days: shopForm.value.type !== 'wardrobe' ? Number(shopForm.value.coupon_valid_days) || null : null,
    wardrobe_item_id: shopForm.value.type === 'wardrobe' ? shopForm.value.wardrobe_item_id || null : null,
  }

  const { error } = isShopEditing.value
    ? await supabase.from('shop_items').update(payload).eq('id', shopForm.value.id)
    : await supabase.from('shop_items').insert([payload])

  if (error) return alert('儲存失敗：' + error.message)
  showShopModal.value = false
  await fetchShopItems()
}

const deleteShopItem = async (id) => {
  if (!confirm('確定刪除此商品？')) return
  await supabase.from('shop_items').delete().eq('id', id)
  await fetchShopItems()
}

const toggleShopActive = async (item) => {
  await supabase.from('shop_items').update({ is_active: !item.is_active }).eq('id', item.id)
  item.is_active = !item.is_active
}

onMounted(async () => {
  await Promise.all([fetchQrCodes(), fetchRules(), fetchShopItems(), fetchWardrobeItems()])
})
</script>

<template>
  <div class="points-admin">

    <!-- Tab 列 -->
    <div class="tab-bar">
      <button v-for="t in [
        { key: 'qr',      label: 'QR 點數碼' },
        { key: 'referral', label: '分潤規則' },
        { key: 'shop',    label: '商城管理' },
      ]" :key="t.key"
        class="tab-btn" :class="{ active: activeTab === t.key }"
        @click="activeTab = t.key"
      >{{ t.label }}</button>
    </div>

    <!-- ════ QR 點數碼 ════ -->
    <template v-if="activeTab === 'qr'">
      <div class="manager-header">
        <h3>QR 點數碼管理</h3>
        <button class="btn btn-gold btn-small" @click="showQrModal = true">＋ 新增 QR 碼</button>
      </div>

      <div v-if="qrLoading" class="loading-state"><div class="spinner"></div></div>
      <div v-else-if="qrCodes.length === 0" class="empty-state">尚無 QR 碼</div>
      <div v-else class="qr-list">
        <div v-for="qr in qrCodes" :key="qr.id" class="qr-card" :class="{ used: qr.used_by }">
          <div class="qr-img-wrap">
            <img v-if="qrImages[qr.id]" :src="qrImages[qr.id]" class="qr-img" />
            <button v-else class="btn btn-ghost btn-small" @click="generateQrImage(qr.id)">顯示 QR</button>
          </div>
          <div class="qr-info">
            <div class="qr-label">{{ qr.label || '（未命名）' }}</div>
            <div class="qr-points">{{ qr.points }} 點</div>
            <div class="qr-meta">
              {{ qr.is_single_use ? '一次性' : '多次使用' }}
              <span v-if="qr.expires_at">・效期至 {{ qr.expires_at.split('T')[0] }}</span>
            </div>
            <div v-if="qr.used_by" class="qr-used-by">已被 {{ qr.users?.display_name || qr.used_by }} 使用</div>
          </div>
          <div class="qr-actions">
            <button class="action-btn delete" @click="deleteQr(qr.id)">刪除</button>
          </div>
        </div>
      </div>

      <!-- 新增 QR Modal -->
      <Teleport to="body">
        <div v-if="showQrModal" class="modal-overlay" @click.self="showQrModal = false">
          <div class="modal-content" style="max-width:420px;">
            <h3 style="color:#eee; margin:0 0 20px;">＋ 新增 QR 點數碼</h3>
            <div class="form-group">
              <label>標籤／用途說明</label>
              <input v-model="qrForm.label" class="admin-input" placeholder="例如：開幕活動特別碼" />
            </div>
            <div class="form-group">
              <label>點數（必填）</label>
              <input v-model="qrForm.points" type="number" min="1" class="admin-input" />
            </div>
            <div class="form-group">
              <label>使用方式</label>
              <select v-model="qrForm.is_single_use" class="admin-input">
                <option :value="true">一次性（掃完失效）</option>
                <option :value="false">多次使用</option>
              </select>
            </div>
            <div class="form-group">
              <label>有效期限（選填）</label>
              <input v-model="qrForm.expires_at" type="date" class="admin-input" />
            </div>
            <div style="display:flex; gap:10px; justify-content:flex-end; margin-top:20px;">
              <button class="btn btn-ghost" @click="showQrModal = false">取消</button>
              <button class="btn btn-gold" :disabled="qrSaving" @click="saveQr">
                {{ qrSaving ? '建立中...' : '建立' }}
              </button>
            </div>
          </div>
        </div>
      </Teleport>
    </template>

    <!-- ════ 分潤規則 ════ -->
    <template v-if="activeTab === 'referral'">
      <div class="manager-header">
        <h3>推薦分潤規則設定</h3>
      </div>
      <p style="color:#666; font-size:0.85rem; margin:0 0 20px;">徒弟或徒孫首次參賽時，師父/師公自動獲得點數。</p>

      <div class="rule-list">
        <div v-for="rule in referralRules" :key="rule.tier" class="rule-card">
          <div class="rule-header">
            <span class="rule-tier">
              {{ rule.tier === 1 ? '直接徒弟（L1）首場' : '徒孫及以後（L2+）首場' }}
            </span>
            <label class="toggle-wrap">
              <input type="checkbox" v-model="rule.is_active" />
              <span>啟用</span>
            </label>
          </div>
          <div class="rule-body">
            <div class="form-group">
              <label>給師父的點數</label>
              <input v-model="rule.points" type="number" min="0" class="admin-input" />
            </div>
            <div v-if="rule.tier === 1" class="form-group">
              <label>同時派發票券</label>
              <select v-model="rule.grant_coupon" class="admin-input">
                <option :value="true">是（依「自動派發」referral_veteran 規則）</option>
                <option :value="false">否</option>
              </select>
            </div>
          </div>
          <div style="display:flex; justify-content:flex-end;">
            <button class="btn btn-gold btn-small" :disabled="ruleSaving" @click="saveRule(rule)">儲存</button>
          </div>
        </div>
      </div>
    </template>

    <!-- ════ 商城管理 ════ -->
    <template v-if="activeTab === 'shop'">
      <div class="manager-header">
        <h3>點數商城管理</h3>
        <button class="btn btn-gold btn-small" @click="openShopAdd">＋ 新增商品</button>
      </div>

      <div v-if="shopLoading" class="loading-state"><div class="spinner"></div></div>
      <div v-else-if="shopItems.length === 0" class="empty-state">尚無商品</div>
      <div v-else class="shop-grid">
        <div v-for="item in shopItems" :key="item.id" class="shop-card" :class="{ inactive: !item.is_active }">
          <div class="shop-card-header">
            <span class="shop-type-badge" :class="item.type">
              {{ item.type === 'coupon' ? '票券' : item.type === 'wardrobe' ? '道具' : '實體' }}
            </span>
            <span class="shop-card-cost">{{ item.cost }} pt</span>
          </div>
          <div class="shop-card-name">{{ item.name }}</div>
          <div class="shop-card-desc">{{ item.description }}</div>
          <div v-if="item.stock !== null" class="shop-card-stock">庫存：{{ item.stock }}</div>
          <div class="item-actions">
            <button class="action-btn toggle" @click="toggleShopActive(item)">
              {{ item.is_active ? '🟢 上架' : '🔴 下架' }}
            </button>
            <button class="action-btn edit" @click="openShopEdit(item)">編輯</button>
            <button class="action-btn delete" @click="deleteShopItem(item.id)">刪除</button>
          </div>
        </div>
      </div>

      <!-- 商品 Modal -->
      <Teleport to="body">
        <div v-if="showShopModal" class="modal-overlay" @click.self="showShopModal = false">
          <div class="modal-content">
            <h3 style="color:#eee; margin:0 0 20px;">{{ isShopEditing ? '編輯商品' : '新增商品' }}</h3>
            <div class="form-grid">
              <div class="form-group">
                <label>商品名稱</label>
                <input v-model="shopForm.name" class="admin-input" placeholder="例如：折扣票券" />
              </div>
              <div class="form-group">
                <label>類型</label>
                <select v-model="shopForm.type" class="admin-input">
                  <option value="coupon">票券（兌換後發至票券匣）</option>
                  <option value="wardrobe">紙娃娃道具（兌換後加入衣櫃）</option>
                  <option value="physical">實體商品（兌換後發兌換票）</option>
                </select>
              </div>
              <div class="form-group full">
                <label>說明</label>
                <input v-model="shopForm.description" class="admin-input" placeholder="商品說明" />
              </div>
              <div class="form-group">
                <label>售價（點數）</label>
                <input v-model="shopForm.cost" type="number" min="1" class="admin-input" />
              </div>
              <div class="form-group">
                <label>庫存（空白＝無限量）</label>
                <input v-model="shopForm.stock" type="number" min="0" class="admin-input" placeholder="不填則無限量" />
              </div>
              <div class="form-group">
                <label>排序</label>
                <input v-model="shopForm.sort_order" type="number" class="admin-input" />
              </div>
              <div class="form-group">
                <label>上架狀態</label>
                <select v-model="shopForm.is_active" class="admin-input">
                  <option :value="true">上架中</option>
                  <option :value="false">下架</option>
                </select>
              </div>

              <!-- 紙娃娃道具 -->
              <template v-if="shopForm.type === 'wardrobe'">
                <div class="form-group full">
                  <label>對應道具</label>
                  <select v-model="shopForm.wardrobe_item_id" class="admin-input">
                    <option value="">請選擇道具...</option>
                    <option v-for="wi in wardrobeItems" :key="wi.id" :value="wi.id">
                      {{ wi.name }}（{{ wi.category }}）
                    </option>
                  </select>
                </div>
              </template>

              <!-- 票券 / 實體 -->
              <template v-else>
                <div class="form-group full">
                  <label>派發票券標題</label>
                  <input v-model="shopForm.coupon_title" class="admin-input" placeholder="例如：九折優惠券" />
                </div>
                <div class="form-group full">
                  <label>票券說明</label>
                  <input v-model="shopForm.coupon_desc" class="admin-input" placeholder="使用說明、注意事項..." />
                </div>
                <div class="form-group">
                  <label>票券效期（天）</label>
                  <input v-model="shopForm.coupon_valid_days" type="number" min="1" class="admin-input" />
                </div>
              </template>
            </div>

            <div style="display:flex; gap:10px; justify-content:flex-end; margin-top:20px;">
              <button class="btn btn-ghost" @click="showShopModal = false">取消</button>
              <button class="btn btn-gold" @click="saveShopItem">
                {{ isShopEditing ? '儲存' : '新增' }}
              </button>
            </div>
          </div>
        </div>
      </Teleport>
    </template>

  </div>
</template>

<style scoped>
.points-admin { display: flex; flex-direction: column; gap: 20px; }

/* ── Tab 列 ── */
.tab-bar {
  display: flex; gap: 6px; flex-wrap: wrap;
  background: #0d0d0d; border: 1px solid #222;
  border-radius: 12px; padding: 5px;
}
.tab-btn {
  flex: 1; min-width: 100px; padding: 9px 14px;
  border: none; border-radius: 8px; cursor: pointer;
  background: transparent; color: #666;
  font-size: 0.85rem; font-weight: 600; transition: all 0.2s;
}
.tab-btn.active { background: rgba(212,175,55,0.12); border: 1px solid rgba(212,175,55,0.25); color: #D4AF37; }

/* ── 共用 ── */
.manager-header { display: flex; align-items: center; justify-content: space-between; }
.manager-header h3 { margin: 0; color: #eee; }
.loading-state { display: flex; justify-content: center; padding: 40px; }
.spinner { width: 30px; height: 30px; border: 3px solid rgba(212,175,55,0.3); border-top-color: #D4AF37; border-radius: 50%; animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
.empty-state { text-align: center; padding: 40px; color: #444; }

.form-group { display: flex; flex-direction: column; gap: 6px; }
.form-group label { font-size: 0.82rem; color: #888; }
.form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
.form-group.full { grid-column: 1 / -1; }
.admin-input {
  background: #1a1a1a; border: 1px solid #333; color: #eee;
  border-radius: 8px; padding: 9px 12px; font-size: 0.9rem;
  outline: none; transition: border-color 0.2s;
}
.admin-input:focus { border-color: #D4AF37; }

.btn { padding: 10px 18px; border-radius: 8px; border: none; cursor: pointer; font-size: 0.88rem; font-weight: 700; transition: all 0.2s; }
.btn-gold { background: rgba(212,175,55,0.15); border: 1px solid rgba(212,175,55,0.4); color: #D4AF37; }
.btn-gold:hover:not(:disabled) { background: rgba(212,175,55,0.25); }
.btn-gold:disabled { opacity: 0.4; cursor: not-allowed; }
.btn-ghost { background: transparent; border: 1px solid #333; color: #888; }
.btn-small { padding: 7px 14px; font-size: 0.8rem; }

.item-actions { display: flex; gap: 8px; margin-top: 10px; }
.action-btn { padding: 5px 12px; border-radius: 6px; border: none; cursor: pointer; font-size: 0.78rem; font-weight: 700; }
.action-btn.toggle { background: rgba(255,255,255,0.04); color: #888; }
.action-btn.edit { background: rgba(212,175,55,0.1); color: #D4AF37; }
.action-btn.delete { background: rgba(255,80,80,0.1); color: #ff6b6b; }

.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.85); z-index: 9999; display: flex; justify-content: center; align-items: center; backdrop-filter: blur(6px); }
.modal-content { background: #111; border: 1px solid #2a2a2a; border-radius: 16px; padding: 28px; width: 560px; max-width: 95vw; max-height: 90vh; overflow-y: auto; display: flex; flex-direction: column; gap: 16px; }

/* ── QR ── */
.qr-list { display: flex; flex-direction: column; gap: 12px; }
.qr-card {
  display: flex; gap: 16px; align-items: center;
  background: #111; border: 1px solid #222; border-radius: 12px; padding: 16px;
}
.qr-card.used { opacity: 0.5; }
.qr-img-wrap { flex-shrink: 0; }
.qr-img { width: 80px; height: 80px; border-radius: 8px; }
.qr-info { flex: 1; display: flex; flex-direction: column; gap: 4px; }
.qr-label { font-size: 0.95rem; font-weight: 700; color: #eee; }
.qr-points { font-size: 1.2rem; font-weight: 900; color: #D4AF37; }
.qr-meta { font-size: 0.78rem; color: #666; }
.qr-used-by { font-size: 0.78rem; color: #888; margin-top: 4px; }
.qr-actions { flex-shrink: 0; }

/* ── 分潤規則 ── */
.rule-list { display: flex; flex-direction: column; gap: 16px; }
.rule-card { background: #111; border: 1px solid #222; border-radius: 14px; padding: 20px; display: flex; flex-direction: column; gap: 16px; }
.rule-header { display: flex; align-items: center; justify-content: space-between; }
.rule-tier { font-size: 0.95rem; font-weight: 700; color: #D4AF37; }
.rule-body { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
.toggle-wrap { display: flex; align-items: center; gap: 8px; color: #888; font-size: 0.85rem; cursor: pointer; }

/* ── 商城 ── */
.shop-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 14px; }
.shop-card { background: #111; border: 1px solid #222; border-radius: 14px; padding: 16px; display: flex; flex-direction: column; gap: 8px; }
.shop-card.inactive { opacity: 0.45; }
.shop-card-header { display: flex; justify-content: space-between; align-items: center; }
.shop-type-badge { font-size: 0.7rem; font-weight: 700; padding: 3px 8px; border-radius: 6px; }
.shop-type-badge.coupon { background: rgba(94,255,138,0.1); color: #5eff8a; }
.shop-type-badge.wardrobe { background: rgba(212,175,55,0.1); color: #D4AF37; }
.shop-type-badge.physical { background: rgba(100,180,255,0.1); color: #64b4ff; }
.shop-card-cost { font-size: 1rem; font-weight: 800; color: #D4AF37; }
.shop-card-name { font-size: 0.95rem; font-weight: 700; color: #eee; }
.shop-card-desc { font-size: 0.8rem; color: #666; }
.shop-card-stock { font-size: 0.78rem; color: #888; }

</style>
