<script setup>
import { ref } from 'vue'
import { supabase } from '../supabase'

const emit = defineEmits(['update-stats'])

const searchQuery = ref('')
const searchResults = ref([])
const selectedMember = ref(null)
const memberCoupons = ref([])
const memberHistory = ref([])
const memberAchievements = ref([]) 
const isSearching = ref(false)

const showQuickGiftForm = ref(false)
const quickGiftTitle = ref('')
const quickGiftDate = ref('')
const quickGiftDesc = ref('')
const isSendingQuickGift = ref(false)

const searchMembers = async () => {
  if (!searchQuery.value.trim()) {
    searchResults.value = []
    return
  }
  isSearching.value = true
  try {
    const { data, error } = await supabase
      .from('users')
      // 🚀 擴充：把生日領取年份的鎖也一起抓下來！
      .select('id, display_name, legacy_id, picture_url, total_exp, level, created_at, last_birthday_year, birthday_claimed_year')
      .or(`display_name.ilike.%${searchQuery.value}%,legacy_id.ilike.%${searchQuery.value}%`)
      .limit(8)
    if (error) throw error
    searchResults.value = data || []
  } catch (error) {
    console.error('搜尋失敗:', error)
  } finally {
    isSearching.value = false
  }
}

const selectMember = async (user) => {
  selectedMember.value = user
  searchResults.value = [] 
  searchQuery.value = ''   
  showQuickGiftForm.value = false 

  const [couponsRes, historyRes, achieveRes] = await Promise.all([
    supabase.from('coupons').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
    supabase.from('game_participants')
      .select('created_at, character_name, games ( play_time, gm_name, story_memory, scripts ( title ) )')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false }),
    supabase.from('user_achievements')
      .select('unlocked_at, achievements(title)')
      .eq('user_id', user.id)
      .order('unlocked_at', { ascending: false })
  ])

  memberCoupons.value = couponsRes.data || []
  memberHistory.value = historyRes.data || []
  memberAchievements.value = achieveRes.data || []
}

// 🚀 新增：手動預先核銷本年度生日優惠
const preRedeemBirthday = async (user) => {
  const currentYear = new Date().getFullYear()

  // 防呆：檢查是不是已經核銷過了
  if (user.birthday_claimed_year === currentYear) {
    return alert(`⚠️ 【${user.display_name || '該玩家'}】的 ${currentYear} 年度生日禮已經是「已核銷 / 已領取」狀態囉！`)
  }

  // 二度確認，畢竟這按下去就沒有自動發券了
  const confirmMsg = `⚠️ 確定要在櫃檯預先核銷【${user.display_name || '該玩家'}】的 ${currentYear} 年度生日優惠嗎？\n\n執行後，系統將「強制跳過」這位玩家，今年絕對不會再自動發送生日推播與票券給他！`
  if (!confirm(confirmMsg)) return

  try {
    const { error } = await supabase
      .from('users')
      .update({
        last_birthday_year: currentYear,      // 鎖住推播狙擊手
        birthday_claimed_year: currentYear    // 鎖住 APP 領取攔截器
      })
      .eq('id', user.id)

    if (error) throw error

    alert(`✅ 預先核銷成功！已完美封鎖【${user.display_name || '該玩家'}】今年的自動生日發放系統。`)
    
    // 讓畫面上的資料即時更新 (不需要重整網頁)
    user.last_birthday_year = currentYear
    user.birthday_claimed_year = currentYear

  } catch (err) {
    alert('❌ 核銷失敗：' + err.message)
  }
}

const sendQuickGift = async () => {
  if (!quickGiftTitle.value) return alert('票券標題沒填，是要發空氣嗎？')
  isSendingQuickGift.value = true
  try {
    const newCoupon = {
      user_id: selectedMember.value.id,
      title: quickGiftTitle.value,
      description: quickGiftDesc.value,
      expiry_date: quickGiftDate.value || null,
      status: 'available',
      coupon_type: 'discount'
    }
    const { data, error } = await supabase.from('coupons').insert([newCoupon]).select()
    if (error) throw error
    alert('✅ 票券已精準投放！')
    if (data && data.length > 0) memberCoupons.value.unshift(data[0])
    quickGiftTitle.value = ''
    quickGiftDesc.value = ''
    quickGiftDate.value = ''
    showQuickGiftForm.value = false
    emit('update-stats')
  } catch (error) {
    alert('發送失敗: ' + error.message)
  } finally {
    isSendingQuickGift.value = false
  }
}

const redeemCoupon = async (coupon) => {
  if (!confirm(`⚠️ 確定要核銷這張「${coupon.title}」嗎？核銷後無法復原喔！`)) return 
  
  try {
    const { error } = await supabase
      .from('coupons')
      .update({ status: 'used' }) 
      .eq('id', coupon.id)

    if (error) throw error

    coupon.status = 'used'
    alert('✅ 核銷成功！')
    
    emit('update-stats') 
  } catch (error) {
    alert('核銷失敗：' + error.message)
  }
}

const deleteCoupon = async (couponId, couponTitle) => {
  if (!confirm(`⚠️ 確定要強制刪除「${couponTitle}」嗎？`)) return 
  try {
    await supabase.from('coupons').delete().eq('id', couponId)
    memberCoupons.value = memberCoupons.value.filter(c => c.id !== couponId)
    emit('update-stats')
  } catch (error) {
    alert('刪除失敗：' + error.message)
  }
}

const calculateDays = (dateString) => {
  if (!dateString) return 0
  return Math.floor((new Date() - new Date(dateString)) / (1000 * 60 * 60 * 24))
}
</script>

<template>
  <div class="member-manager-container">
    
    <div class="search-section">
      <h3 style="margin-top:0; color: #D4AF37;">🔍 玩家總部資料庫</h3>
      <div class="search-wrapper">
        <input v-model="searchQuery" @keyup.enter="searchMembers" type="text" class="admin-input search-input" placeholder="輸入玩家暱稱 或 ID (按 Enter 搜尋)..."/>
        <button class="btn btn-gold search-btn" @click="searchMembers">{{ isSearching ? '搜尋中...' : '搜尋' }}</button>
        <div v-if="searchResults.length > 0" class="search-results">
          <div v-for="user in searchResults" :key="user.id" class="search-item" @click="selectMember(user)">
            <img :src="user.picture_url || 'https://via.placeholder.com/40'" class="ms-avatar" />
            <div class="ms-info">
              <span class="ms-name">{{ user.display_name }}</span>
              <span class="ms-id">ID: {{ user.legacy_id || '無' }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div v-if="selectedMember" class="member-card">
      <div class="member-header">
        <img :src="selectedMember.picture_url || 'https://via.placeholder.com/80'" class="member-avatar" />
        <div class="member-title-area">
          <h2 class="m-name">{{ selectedMember.display_name }}</h2>
          <div class="m-badges">
            <span class="m-level">LV.{{ selectedMember.level || 1 }}</span>
            <span class="m-legacy-id">ID: {{ selectedMember.legacy_id || '---' }}</span>
          </div>
          <div v-if="memberAchievements.length > 0" class="achievements-wrap">
            <span v-for="ach in memberAchievements" :key="ach.achievements.title" class="ach-badge">
              🎖️ {{ ach.achievements.title }}
            </span>
          </div>
        </div>
      </div>

      <div class="member-stats">
        <div class="stat-box"><div class="stat-label">累積經驗</div><div class="stat-value">{{ selectedMember.total_exp || 0 }}</div></div>
        <div class="stat-box"><div class="stat-label">遊玩場次</div><div class="stat-value">{{ memberHistory.length }}</div></div>
        <div class="stat-box"><div class="stat-label">加入天數</div><div class="stat-value">{{ calculateDays(selectedMember.created_at) }} 天</div></div>
      </div>

      <div class="privilege-section">
        <p class="privilege-title">👑 櫃台特權操作區</p>
        <button 
          class="btn-outline-red" 
          @click="preRedeemBirthday(selectedMember)" 
          :disabled="selectedMember.birthday_claimed_year === new Date().getFullYear()"
        >
          {{ selectedMember.birthday_claimed_year === new Date().getFullYear() ? '✅ 今年壽星優惠已核銷/領取' : '🎂 在櫃檯預先核銷今年生日禮 (防系統重複發送)' }}
        </button>
      </div>

      <div class="details-grid">
        <div class="detail-column">
          <div class="section-header-flex">
            <h4 class="section-title-inline">🎟️ 擁有票券 ({{ memberCoupons.length }})</h4>
            <button class="btn-mini-gold" @click="showQuickGiftForm = !showQuickGiftForm">
              {{ showQuickGiftForm ? '✕ 取消' : '🎁 發送新券' }}
            </button>
          </div>
          <div v-if="showQuickGiftForm" class="quick-gift-mini-box">
            <div class="mini-form-row">
              <input v-model="quickGiftTitle" type="text" class="admin-input-mini" placeholder="票券標題 (如: 補償金)">
              <input v-model="quickGiftDate" type="date" class="admin-input-mini">
            </div>
            <input v-model="quickGiftDesc" type="text" class="admin-input-mini mt-2" placeholder="備註說明 (選填)">
            <button class="btn-mini-gold full-width mt-2" @click="sendQuickGift" :disabled="isSendingQuickGift" style="padding: 8px;">確認發送</button>
          </div>
          <div class="list-container mt-2">
            <div v-if="memberCoupons.length === 0" class="empty-list">沒有任何票券</div>
            <div v-for="coupon in memberCoupons" :key="coupon.id" class="list-item">
              <div class="list-info">
                <span style="color:#D4AF37; font-weight: bold;">{{ coupon.title }}</span>
                <span class="list-sub">效期: {{ coupon.expiry_date ? coupon.expiry_date.split('T')[0] : '無限期' }}</span>
              </div>

            <div class="coupon-actions">
                <button 
                  v-if="coupon.status === 'available'" 
                  class="btn-mini-green" 
                  @click="redeemCoupon(coupon)"
                >
                  ✔ 核銷
                </button>

                <span 
                  v-else
                  class="status-tag" 
                  :class="'status-' + coupon.status"
                >
                  {{ coupon.status === 'used' ? '已核銷' : '已過期' }}
                </span>

                <button class="btn-mini-red" @click="deleteCoupon(coupon.id, coupon.title)">✕</button>
              </div>
            </div>
          </div>
        </div>

        <div class="detail-column">
          <h4 class="section-title-inline mt-1" style="border-bottom: none;">📜 遊玩歷程 ({{ memberHistory.length }})</h4>
          <div class="list-container mt-2">
            <div v-if="memberHistory.length === 0" class="empty-list">尚無遊玩紀錄</div>
            <div v-for="history in memberHistory" :key="history.created_at" class="list-item">
              <div class="list-info">
                <span style="font-weight:bold; color:#fff;">
                 {{ history.games?.scripts?.title || history.character_name || history.games?.story_memory || '未知劇本' }}
                </span>
                <span class="list-sub">GM: {{ history.games?.gm_name || '無' }}</span>
              </div>
              <div style="font-size:0.85rem; color:#aaa;">
                {{ history.created_at ? history.created_at.split('T')[0] : '' }}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
    
    <div v-else class="empty-state">
      <div style="font-size: 3rem; margin-bottom: 10px;">🕵️‍♂️</div>
      <p style="color: #666;">請在上方輸入關鍵字搜尋玩家</p>
    </div>
  </div>
</template>

<style scoped>
.member-manager-container { display: flex; flex-direction: column; gap: 20px; }
.search-section { background: #111; padding: 25px; border-radius: 12px; border: 1px solid #222; }
.search-wrapper { position: relative; display: flex; gap: 10px; }
.admin-input { flex: 1; padding: 14px; background: #222; border: 1px solid #444; color: white; border-radius: 8px; font-size: 1rem; }
.admin-input:focus { border-color: #D4AF37; outline: none; }
.btn { padding: 12px 20px; border: none; font-weight: bold; border-radius: 8px; cursor: pointer; transition: 0.2s; white-space: nowrap; }
.btn-gold { background: #D4AF37; color: black; }
.search-results { position: absolute; top: 100%; left: 0; right: 100px; margin-top: 5px; background: #1a1a1a; border: 1px solid #444; border-radius: 8px; max-height: 300px; overflow-y: auto; z-index: 100; box-shadow: 0 10px 30px rgba(0,0,0,0.8); }
.search-item { padding: 12px 15px; cursor: pointer; border-bottom: 1px solid #333; display: flex; align-items: center; gap: 12px; }
.search-item:hover { background: #2a2a2a; }
.ms-avatar { width: 36px; height: 36px; border-radius: 50%; object-fit: cover; border: 1px solid #666; }
.ms-info { display: flex; flex-direction: column; }
.ms-name { font-weight: bold; font-size: 0.95rem; color: #fff; }
.ms-id { font-size: 0.8rem; color: #D4AF37; font-family: monospace; }
.member-card { background: #111; border-top: 4px solid #D4AF37; padding: 25px; border-radius: 12px; border: 1px solid #222; }
.member-header { display: flex; align-items: center; gap: 20px; margin-bottom: 25px; padding-bottom: 20px; border-bottom: 1px solid #222; }
.member-avatar { width: 80px; height: 80px; border-radius: 50%; border: 3px solid #D4AF37; object-fit: cover; }
.m-name { margin: 0; color: #fff; font-size: 1.8rem; }
.m-badges { display: flex; align-items: center; gap: 10px; margin-top: 8px; }
.m-level { background: #D4AF37; color: black; padding: 3px 8px; border-radius: 4px; font-weight: bold; font-size: 0.85rem; }
.m-legacy-id { color: #888; font-family: monospace; font-size: 0.9rem; background: #222; padding: 3px 8px; border-radius: 4px; border: 1px solid #333;}
.achievements-wrap { margin-top: 10px; display: flex; flex-wrap: wrap; gap: 8px; }
.ach-badge { background: #222; border: 1px solid #D4AF37; color: #D4AF37; padding: 4px 10px; border-radius: 20px; font-size: 0.8rem; font-weight: bold; box-shadow: 0 0 5px rgba(212, 175, 55, 0.2); }
.member-stats { display: flex; gap: 15px; flex-wrap: wrap; margin-bottom: 25px; }
.stat-box { background: #1a1a1a; padding: 15px; border-radius: 8px; flex: 1; min-width: 120px; border: 1px solid #222; text-align: center; }
.stat-label { font-size: 0.85rem; color: #888; margin-bottom: 5px; }
.stat-value { font-size: 1.5rem; font-weight: bold; color: #D4AF37; }

/* 🚀 櫃檯特權專區的霸氣紅邊框設計 */
.privilege-section { margin-bottom: 25px; padding: 15px; background: rgba(231, 76, 60, 0.05); border: 1px dashed rgba(231, 76, 60, 0.4); border-radius: 8px; }
.privilege-title { margin: 0 0 12px 0; color: #e74c3c; font-size: 0.9rem; font-weight: bold; }
.btn-outline-red { width: 100%; padding: 10px; background: transparent; border: 1px solid #e74c3c; color: #e74c3c; border-radius: 6px; font-weight: bold; cursor: pointer; transition: 0.2s; }
.btn-outline-red:hover:not(:disabled) { background: rgba(231, 76, 60, 0.15); }
.btn-outline-red:disabled { border-color: #444; color: #777; background: #222; cursor: not-allowed; }

.details-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 25px; }
.section-header-flex { display: flex; justify-content: space-between; align-items: center; border-bottom: 1px dashed #333; padding-bottom: 10px; }
.section-title-inline { color: #D4AF37; margin: 0; font-size: 1.1rem; }
.mt-1 { margin-top: 5px; } .mt-2 { margin-top: 10px; }
.quick-gift-mini-box { background: #1a1a1a; padding: 15px; border-radius: 8px; border: 1px solid #D4AF37; margin-top: 10px; }
.mini-form-row { display: flex; gap: 10px; }
.admin-input-mini { flex: 1; padding: 8px 10px; background: #222; border: 1px solid #444; color: white; border-radius: 6px; font-size: 0.85rem; }
.admin-input-mini:focus { border-color: #D4AF37; outline: none; }
.full-width { width: 100%; }
.btn-mini-gold { background: #D4AF37; color: black; border: none; padding: 4px 10px; border-radius: 4px; font-size: 0.8rem; font-weight: bold; cursor: pointer; }
.list-container { background: #151515; border-radius: 8px; overflow: hidden; border: 1px solid #222; max-height: 400px; overflow-y: auto;}
.list-item { padding: 15px; border-bottom: 1px solid #222; display: flex; justify-content: space-between; align-items: center; gap: 10px;}
.list-info { display: flex; flex-direction: column; gap: 4px; flex: 1; }
.list-sub { font-size: 0.85rem; color: #888; }
.empty-list { padding: 20px; text-align: center; color: #666; font-size: 0.9rem; }
.coupon-actions { display: flex; align-items: center; gap: 10px; }
.status-tag { padding: 4px 8px; border-radius: 4px; font-size: 0.75rem; font-weight: bold; white-space: nowrap; }
.status-available { background: rgba(46, 204, 113, 0.2); color: #2ecc71; border: 1px solid #2ecc71; }
.status-used { background: #222; color: #666; text-decoration: line-through; border: 1px solid #444; }
.status-expired { background: rgba(231, 76, 60, 0.2); color: #e74c3c; border: 1px solid #e74c3c; }
.btn-mini-red { background: #331111; color: #ff5555; border: 1px solid #552222; padding: 4px 8px; border-radius: 4px; font-size: 0.75rem; cursor: pointer; }
.btn-mini-green { background: #113311; color: #2ecc71; border: 1px solid #225522; padding: 4px 10px; border-radius: 4px; font-size: 0.8rem; font-weight: bold; cursor: pointer; transition: 0.2s;}
.btn-mini-green:hover { background: #225522; color: #55ff55; }
.empty-state { text-align: center; padding: 60px 20px; background: #111; border-radius: 12px; border: 1px dashed #333; }
@media (max-width: 768px) { .details-grid { grid-template-columns: 1fr; } .mini-form-row { flex-direction: column; } }
</style>