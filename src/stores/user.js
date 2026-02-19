import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import liff from '@line/liff'
import { supabase } from '../supabase'

export const useUserStore = defineStore('user', () => {
  // === 1. 狀態 (State) ===
  const lineProfile = ref(null) // LINE 的頭像與名稱
  const userData = ref(null)    // Supabase 的基本資料 (代替你原本的 profile)
  const isLoggedIn = ref(false)
  const isLoading = ref(true)
  const error = ref(null)

  // 🚀 你原本的陣列，我幫你用 ref 裝回來了！
  const history = ref([])
  const coupons = ref([])
  const daysJoined = ref(0)

  // 🚀 計算屬性：稱號 (代替你原本寫死的 title)
  const userTitle = computed(() => {
    if (!userData.value) return '新手冒險者'
    return userData.value.level >= 3 ? '主角光環的勇者' : '探險家'
  })

  // === 2. 動作 (Actions) ===

  // 🌟 A. 啟動 LIFF (程式進入點)
  const initLiff = async () => {
    isLoading.value = true
    try {


     
      await liff.init({ liffId: '2009161687-icfQU9r6' })
     
      if (!liff.isLoggedIn()) {
      
        liff.login() // 沒登入踢去 LINE
        return
      }
      
      const profile = await liff.getProfile()
      lineProfile.value = profile
      
      // 1. 檢查並註冊會員
      await checkAndRegisterUser(profile)

      // 2. 🚀 會員確認後，執行你原本的抓取邏輯！拿真正的 ID 去查！
      if (userData.value && userData.value.id) {
        await fetchUserExtraData(userData.value.id)
      }

      // 3. 檢查是不是掃 QR Code 進來的
      const urlParams = new URLSearchParams(window.location.search)
      const gameId = urlParams.get('game_id')
      if (gameId) {
        await joinGame(gameId)
      }

    } catch (err) {
      console.error('LIFF 錯誤:', err)
      error.value = err.message
    } finally {
      isLoading.value = false
    }
  }

  // 🌟 B. 登入與註冊邏輯
  const checkAndRegisterUser = async (profile) => {
    let { data: existingUser } = await supabase
      .from('users')
      .select('*')
      .eq('id', profile.userId)
      .single()

    if (existingUser) {
      console.log('✅ 找到老會員:', existingUser.display_name)
        userData.value = existingUser
        isLoggedIn.value = true
    } else {
    console.log('✨ 查無此人，準備註冊新會員...')
      const randomId = Math.floor(100000 + Math.random() * 900000).toString()
      const { data: newUser, error: insertError } = await supabase
        .from('users')
        .insert([{
          id: profile.userId,
          display_name: profile.displayName,
          picture_url: profile.pictureUrl,
          legacy_id: randomId,
          level: 1,
          total_exp: 0
        }])
        .select()
        .single()

      if (insertError) throw insertError
      userData.value = newUser
      isLoggedIn.value = true
      alert(`歡迎！您的會員編號是 ${randomId}`)
    }
  }

  // 🌟 C. 抓取歷史與優惠券 (🚀 你原本的心血都在這裡！)
  const fetchUserExtraData = async (userId) => {
    console.log("🚀 開始整合抓取資料，真實玩家 ID:", userId)
    try {
      // 1. 計算加入天數
      const joinDate = new Date(userData.value.created_at)
      const today = new Date()
      daysJoined.value = Math.ceil(Math.abs(today - joinDate) / (1000 * 60 * 60 * 24))

      // 2. 抓取遊玩紀錄
      const { data: historyData } = await supabase
        .from('game_participants')
        .select(`
          id, exp_gained, comment,
          games ( play_time, gm_name, scripts ( title, cover_url ) )
        `)
        .eq('user_id', userId)
        .order('created_at', { ascending: false })

      if (historyData) {
        history.value = historyData.map(item => {
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
            exp: item.exp_gained || 100,
            branch: '台北旗艦館', 
            story_memory: item.comment 
          }
        })
      }

      // 3. 抓取優惠券
      const { data: couponData } = await supabase
        .from('coupons')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        
      coupons.value = couponData || []
      console.log(`✅ 優惠券讀取成功: 共 ${coupons.value.length} 筆`)

    } catch (err) {
      console.error('❌ 額外資料讀取失敗:', err.message)
    }
  }

  // 🌟 D. 加入遊戲 (掃碼觸發)
  const joinGame = async (gameId) => {
    if (!userData.value) return
    try {
      const { data: game } = await supabase.from('games').select('*').eq('id', gameId).single()
      if (!game || game.status !== 'open') return alert('這場遊戲已經結束或不存在囉！')

      const { data: existing } = await supabase.from('game_participants').select('*').eq('game_id', gameId).eq('user_id', userData.value.id).single()
      if (existing) return alert('你已經登記過這場遊戲囉！')

      await supabase.from('game_participants').insert([{ game_id: gameId, user_id: userData.value.id }])
      
      // 更新經驗值
      await supabase.from('users').update({ total_exp: (userData.value.total_exp || 0) + 100 }).eq('id', userData.value.id)
      
      alert(`✅ 成功加入遊戲！\n經驗值 +100`)
      
      // 重新抓取資料更新畫面
      await fetchUserExtraData(userData.value.id)

    } catch (err) {
      console.error('加入遊戲失敗:', err.message)
    }
  }

  // === 3. 匯出給 Vue 元件使用 ===
  return {
    lineProfile, userData, isLoggedIn, isLoading, error,
    history, coupons, daysJoined, userTitle, // 你原本的變數都在這
    initLiff
  }
})