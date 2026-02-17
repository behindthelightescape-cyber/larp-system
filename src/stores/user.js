import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { supabase } from '../supabase' // 你的 supabase 設定檔

export const useUserStore = defineStore('user', () => {
  const profile = ref(null)
  const history = ref([])
  const coupons = ref([])
  const loading = ref(false)

  // 假的 LIFF ID，之後換真的
  const lineUserId = ref('U_TEST_JOE_001') 

  // 1. 抓個資
  const fetchProfile = async () => {
    loading.value = true
    // 這裡假設你已經建好 profiles 表
    let { data } = await supabase.from('users').select('*').eq('id', lineUserId.value).single()
    profile.value = data
    loading.value = false
  }

  // 2. 抓歷程 (這裡幫你做資料正規化，以後頁面只管顯示)
  const fetchHistory = async () => {
    let { data } = await supabase.from('game_participants')
      .select(`
        id, exp_gained, 
        games ( play_time, gm_name, scripts ( title, cover_url ) )
      `)
      .eq('user_id', lineUserId.value)
      .order('created_at', { ascending: false })
      
    // 轉成乾淨的格式
    history.value = data.map(r => ({
      id: r.id,
      title: r.games?.scripts?.title || '未知劇本',
      cover: r.games?.scripts?.cover_url || 'https://placeholder.com/cover.png',
      date: new Date(r.games?.play_time).toLocaleDateString(),
      gm: r.games?.gm_name || 'GM',
      exp: r.exp_gained
    }))
  }

  // 3. 抓優惠券
  const fetchCoupons = async () => {
    let { data } = await supabase.from('coupons')
      .select('*')
      .eq('user_id', lineUserId.value)
    coupons.value = data
  }

  // 計算屬性
  const level = computed(() => profile.value ? Math.floor(profile.value.total_exp / 1000) + 1 : 1)
  const daysJoined = computed(() => {
    if (!profile.value?.created_at) return 0
    const diff = new Date() - new Date(profile.value.created_at)
    return Math.floor(diff / (1000 * 60 * 60 * 24))
  })

  return { 
    profile, history, coupons, loading, 
    fetchProfile, fetchHistory, fetchCoupons, 
    level, daysJoined 
  }
})