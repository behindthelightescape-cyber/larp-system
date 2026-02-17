import { defineStore } from 'pinia'
import { supabase } from '../supabase'

export const useUserStore = defineStore('user', {
  state: () => ({
    // 使用者基本資料
    profile: {
      userId: null,
      display_name: '載入中...',
      picture_url: 'https://meee.com.tw/D45hJIi.PNG',
      serial_number: '---',
      title: '新手冒險者',
      points: 0
    },
    
    // 遊戲數據與優惠券
    history: [],
    coupons: [], // 🚀 優惠券放在這裡
    level: 1,
    daysJoined: 0,
    
    isLoading: false,
    error: null
  }),

  actions: {
    // 🌟 主導航抓取：抓取使用者所有相關資料
    async fetchUserData(userId = 'TEST_USER_001') {
      this.isLoading = true
      console.log("🚀 開始整合抓取資料，目標 ID:", userId);

      try {
        // --- 1. 抓取 Users 基本資料 ---
        const { data: userData, error: userError } = await supabase
          .from('users')
          .select('*')
          .eq('id', userId)
          .single()

        if (userError) throw userError

        if (userData) {
          this.profile = {
            userId: userData.id,
            display_name: userData.display_name || '無名氏',
            picture_url: userData.picture_url || 'https://meee.com.tw/D45hJIi.PNG',
            serial_number: userData.legacy_id || '無編號',
            title: userData.level >= 3 ? '主角光環的勇者' : '探險家', // 這裡可以做簡單邏輯
            points: userData.total_exp || 0
          }
          this.level = userData.level || 1
          
          // 計算加入天數
          const joinDate = new Date(userData.created_at)
          const today = new Date()
          this.daysJoined = Math.ceil(Math.abs(today - joinDate) / (1000 * 60 * 60 * 24))
        }

        // --- 2. 抓取遊玩紀錄 ---
        const { data: historyData, error: historyError } = await supabase
          .from('game_participants')
          .select(`
            id,
            exp_gained,
            games (
              play_time,
              gm_name,
              scripts ( title, cover_url )
            ),
            comment
          `)
          .eq('user_id', userId)
          .order('created_at', { ascending: false })

        if (historyError) throw historyError

        if (historyData) {
          this.history = historyData.map(item => {
            const rawCover = item.games?.scripts?.cover_url;
            const finalCover = (rawCover && rawCover.trim() !== '') 
              ? rawCover 
              : 'https://images.unsplash.com/photo-1514467953502-5a7820e3efb4?w=600&q=80';

            return {
              id: item.id,
              title: item.games?.scripts?.title || '未知劇本',
              cover: finalCover,
              date: item.games?.play_time ? item.games.play_time.split('T')[0] : '未知日期',
              gm: item.games?.gm_name || '未知 GM',
              exp: item.exp_gained,
              branch: '台北旗艦館', 
              story_memory: item.comment 
            }
          })
        }

        // --- 3. 抓取優惠券 (自動呼叫下面定義的 action) ---
        await this.fetchUserCoupons(userId)

      } catch (err) {
        console.error('❌ 資料讀取失敗:', err.message)
        this.error = err.message
      } finally {
        this.isLoading = false
      }
    },

    // 🌟 獨立抓取優惠券的方法
    async fetchUserCoupons(userId) {
      try {
        const { data: couponData, error: couponError } = await supabase
          .from('coupons')
          .select('*')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })

        if (couponError) throw couponError
        this.coupons = couponData || []
        console.log(`✅ 優惠券讀取成功: 共 ${this.coupons.length} 筆`)
      } catch (err) {
        console.error('❌ 優惠券讀取失敗:', err.message)
      }
    }
  }
})