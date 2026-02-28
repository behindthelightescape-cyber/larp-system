import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import liff from '@line/liff'
import { supabase } from '../supabase'

export const useUserStore = defineStore('user', () => {
  // === 1. 狀態 (State) ===
  const lineProfile = ref(null) 
  const userData = ref(null)    
  const isLoggedIn = ref(false)
  const isLoading = ref(true)
  const error = ref(null)

  const history = ref([])
  const coupons = ref([])
 const daysJoined = ref(0)
  const levelUpData = ref(null) // 🚀 新增：用來觸發英雄聯盟升級動畫的資料包！

  

  // 🚀 四哥特製：精準等級與稱號計算機 (放在最上面，確保大家都認識它！)
  const getLevelInfo = (exp) => {
    if (exp >= 2500) return { level: 6, title: '陽光開朗小萌新', nextExp: 2500 }
    if (exp >= 1000) return { level: 5, title: '穿越時空成癮者', nextExp: 2500 }
    if (exp >= 500)  return { level: 4, title: '平行宇宙開拓家', nextExp: 1000 }
    if (exp >= 250)  return { level: 3, title: '主角光環的勇者', nextExp: 500 }
    if (exp >= 100)  return { level: 2, title: '不怕死的探險家', nextExp: 250 }
    return { level: 1, title: '剛加入的冒險者', nextExp: 100 }
  }

  // 🚀 計算屬性：稱號
  const userTitle = computed(() => {
    if (!userData.value) return '新手冒險者'
    return userData.value.current_title || getLevelInfo(userData.value.total_exp || 0).title
  })

  // === 2. 動作 (Actions) ===

  // 🌟 A. 啟動 LIFF (程式進入點)
  const initLiff = async () => {
    isLoading.value = true
    try {
      await liff.init({ liffId: '2009161687-icfQU9r6' }) // 請確認這是你正確的 LIFF ID
      
      if (!liff.isLoggedIn()) {
        liff.login() 
        return
      }
      
      const profile = await liff.getProfile()
      lineProfile.value = profile
      
      // 1. 檢查並註冊會員
      await checkAndRegisterUser(profile)

      // 🪞 裝上監視器：把抓到的資料印出來看看！
      console.log('🔍 自癒系統啟動中... 目前口袋的 EXP:', userData.value?.total_exp, ' / 資料庫寫的等級:', userData.value?.level)

      // 🚀 1.5 四哥的自癒系統
      if (userData.value) {
        const correctLevelInfo = getLevelInfo(userData.value.total_exp || 0)
        
        console.log(`🧮 計算機判定：他應該要是 LV.${correctLevelInfo.level}`)

        if (userData.value.level !== correctLevelInfo.level) {
          console.log(`🔧 抓到不同步！正在強制把資料庫等級改成 LV.${correctLevelInfo.level}...`)
          
          const { error: updateErr } = await supabase
            .from('users')
            .update({ level: correctLevelInfo.level })
            .eq('id', userData.value.id)
            
          if (updateErr) {
            console.error('❌ 自動校正失敗，是不是資料庫權限卡住了？', updateErr)
          } else {
            console.log('✅ 資料庫校正完畢！')
            userData.value.level = correctLevelInfo.level
          }
        } else {
          console.log('✨ 等級完全正確，不需要校正！')
        }
      }

      // 2. 會員確認後，抓取歷史與優惠券
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
      
      let nextIdNumber = 1
      const { data: maxUsers, error: maxErr } = await supabase
        .from('users')
        .select('legacy_id')
        .order('legacy_id', { ascending: false })
        .limit(1)

      if (!maxErr && maxUsers && maxUsers.length > 0 && maxUsers[0].legacy_id) {
        const currentMax = parseInt(maxUsers[0].legacy_id, 10)
        if (!isNaN(currentMax)) nextIdNumber = currentMax + 1 
      }
      
      const newLegacyId = String(nextIdNumber).padStart(8, '0')

      const { data: newUser, error: insertError } = await supabase
        .from('users')
        .insert([{
          id: profile.userId,
          display_name: profile.displayName,
          picture_url: profile.pictureUrl,
          legacy_id: newLegacyId,
          level: 1,
          total_exp: 0
        }])
        .select()
        .single()

      if (insertError) throw insertError
      
      userData.value = newUser
      isLoggedIn.value = true
      alert(`🎉 註冊成功！歡迎加入，您的專屬會員編號是：${newLegacyId}`)
    }
  }

  // 🌟 C. 抓取歷史與優惠券
  const fetchUserExtraData = async (userId) => {
    try {
      const joinDate = new Date(userData.value.created_at)
      const today = new Date()
      daysJoined.value = Math.ceil(Math.abs(today - joinDate) / (1000 * 60 * 60 * 24))

      const { data: historyData, error: historyErr } = await supabase
        .from('game_participants')
        .select(`
          id, exp_gained, comment,
          games ( play_time, gm_name, story_memory, branch_name, scripts ( title, cover_url ) )
        `)
        .eq('user_id', userId)
        .order('created_at', { ascending: false })

      if (historyErr) throw historyErr

      if (historyData) {
        history.value = historyData.map(item => {
          const rawCover = item.games?.scripts?.cover_url;
          const finalCover = (rawCover && rawCover.trim() !== '') ? rawCover : 'https://images.unsplash.com/photo-1514467953502-5a7820e3efb4?w=600&q=80';

          return {
            id: item.id,
            title: item.games?.scripts?.title || '未知劇本',
            cover: finalCover,
            date: item.games?.play_time 
              ? new Date(item.games.play_time).toLocaleString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).replace(/\//g, '-') 
              : '未知時間',
            gm: item.games?.gm_name || '未知 GM',
            exp: item.exp_gained || 50,
            branch: item.games?.branch_name || '西門館1.0',
            story_memory: item.games?.story_memory || '' 
          }
        })
      }

      const { data: couponData } = await supabase
        .from('coupons')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        
      coupons.value = couponData || []

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

      const earnedExp = game.base_exp || 0
      const currentExp = userData.value.total_exp || 0
      const newTotalExp = currentExp + earnedExp
      
      const currentLevelInfo = getLevelInfo(currentExp)
      const newLevelInfo = getLevelInfo(newTotalExp)
      
      let newLevel = newLevelInfo.level
      let isLeveledUp = newLevel > currentLevelInfo.level

      await supabase.from('game_participants').insert([{ 
        game_id: gameId, user_id: userData.value.id, exp_gained: earnedExp 
      }])
      
      await supabase.from('users').update({ 
        total_exp: newTotalExp, level: newLevel 
      }).eq('id', userData.value.id)

      if (isLeveledUp) {
         await supabase.from('coupons').insert([{
           user_id: userData.value.id,
           title: `🎉 LV.${newLevel} 尊榮升級禮`,
           description: `恭喜您升級到 LV.${newLevel}！這是一張專屬的升級折價券，感謝您對劇光燈的支持。`,
           status: 'available',
           expiry_date: new Date(new Date().setFullYear(new Date().getFullYear() + 1)).toISOString()
         }])
        
      } else {
         alert(`✅ 成功加入遊戲！\n獲得經驗值 +${earnedExp} PT`)
      }
      
      await fetchUserExtraData(userData.value.id)

    } catch (err) {
      console.error('加入遊戲失敗:', err.message)
    }
  }

  // 🌟 E. 更新個人資料 + 🚀 資料完善禮 (不再是生日禮)
  const updateProfile = async (formData) => {
    if (!userData.value) return { success: false, message: '尚未登入' }

    try {
      // 檢查是不是第一次填寫生日（代表他終於把資料填齊了）
      const isFirstTimeCompletingProfile = !userData.value.birthday && formData.birthday;

      const { data, error: updateError } = await supabase
        .from('users')
        .update({
          display_name: formData.name, phone: formData.phone, birthday: formData.birthday
        })
        .eq('id', userData.value.id)
        .select()
        .single()

      if (updateError) throw updateError
      userData.value = data

      // 🚀 驚喜邏輯：統一派發「資料完善禮」！
      if (isFirstTimeCompletingProfile) {
        const couponTitle = '🎁 會員資料完善禮 $50 折價券'
        const couponDesc = '感謝您完善會員資料！憑此券遊玩可折抵 $50。敬請期待您的專屬生日禮喔！'

        // 幫他把折價券印出來塞進錢包 (給個 3 個月的效期)
        const expiryDate = new Date()
        expiryDate.setMonth(expiryDate.getMonth() + 3)

        await supabase.from('coupons').insert([{
          user_id: userData.value.id,
          title: couponTitle,
          description: couponDesc,
          status: 'available',
          expiry_date: expiryDate.toISOString()
        }])
        
        // 🚀 重新抓取優惠券資料，讓他的票券夾立刻多出這張券
        await fetchUserExtraData(userData.value.id)
        
        return { success: true, message: `資料已更新！恭喜獲得：${couponTitle}！` }
      }

      return { success: true, message: '資料儲存成功' }
    } catch (err) {
      console.error('更新失敗:', err)
      return { success: false, message: err.message }
    }
  }

  // === 3. 匯出給 Vue 元件使用 ===
  return {
    lineProfile, userData, isLoggedIn, isLoading, error,
    history, coupons, daysJoined, userTitle, 
    initLiff, updateProfile, getLevelInfo
  }
})