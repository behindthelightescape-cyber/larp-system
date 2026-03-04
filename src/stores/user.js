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

  // 🚀 精準等級與稱號計算機 
  const getLevelInfo = (exp) => {
    if (exp >= 2500) return { level: 6, title: '神級玩家', nextExp: 2500 }
    if (exp >= 1000) return { level: 5, title: '尊榮玩家', nextExp: 2500 }
    if (exp >= 500)  return { level: 4, title: '頂級玩家', nextExp: 1000 }
    if (exp >= 250)  return { level: 3, title: '黃金玩家', nextExp: 500 }
    if (exp >= 100)  return { level: 2, title: '白銀玩家', nextExp: 250 }
    return { level: 1, title: '青銅玩家', nextExp: 100 }
  }

  const userTitle = computed(() => {
    if (!userData.value) return '新手冒險者'
    return userData.value.current_title || getLevelInfo(userData.value.total_exp || 0).title
  })

  // ==========================================
  // 🚀 核心大腦：自動派發引擎 (Universal Reward Engine)
  // ==========================================
  const grantSystemRewards = async (targetUserId, eventType, conditionValue = null) => {
    try {
      // 1. 去中控台問：現在有哪些規則是「開啟」而且符合條件的？
      let query = supabase.from('system_rewards')
        .select('*')
        .eq('is_active', true)
        .eq('event_type', eventType)
      
      if (conditionValue !== null) {
        query = query.eq('condition_value', conditionValue)
      }

      const { data: rules, error } = await query
      if (error || !rules || rules.length === 0) return [] // 沒規則就提早下班

      const newCoupons = []
      const rewardTitles = []

      // 2. 把所有符合的規則印成實體票券 (支援數量 reward_qty)
      for (const rule of rules) {
        const qty = rule.reward_qty || 1
        const expiryDate = new Date()
        expiryDate.setDate(expiryDate.getDate() + (rule.valid_days || 30))

        for (let i = 0; i < qty; i++) {
          newCoupons.push({
            user_id: targetUserId,
            title: rule.reward_title,
            description: rule.reward_desc,
            status: 'available',
            expiry_date: expiryDate.toISOString()
          })
        }
        // 紀錄發了什麼，等一下要彈窗告訴玩家 (例如：$100 折價券 x2)
        rewardTitles.push(`${rule.reward_title}` + (qty > 1 ? ` (x${qty})` : ''))
      }

      // 3. 一次性把大禮包全部塞進玩家錢包
      if (newCoupons.length > 0) {
        const { error: insertErr } = await supabase.from('coupons').insert(newCoupons)
        if (insertErr) throw insertErr
      }

      return rewardTitles // 回傳獲得的獎勵清單
    } catch (err) {
      console.error(`發送 ${eventType} 獎勵失敗:`, err.message)
      return []
    }
  }


  // === 2. 動作 (Actions) ===

// 🌟 A. 啟動 LIFF (程式進入點)
  const initLiff = async () => {
    isLoading.value = true
    try {
      await liff.init({ liffId: '2009161687-icfQU9r6' }) 
      
      if (!liff.isLoggedIn()) {
        liff.login() 
        return
      }
      
      const profile = await liff.getProfile()
      lineProfile.value = profile
      
      await checkAndRegisterUser(profile)

      if (userData.value) {
        const correctLevelInfo = getLevelInfo(userData.value.total_exp || 0)
        if (userData.value.level !== correctLevelInfo.level) {
          const { error: updateErr } = await supabase.from('users').update({ level: correctLevelInfo.level }).eq('id', userData.value.id)
          if (!updateErr) userData.value.level = correctLevelInfo.level
        }
      }

      if (userData.value && userData.value.id) {
        await fetchUserExtraData(userData.value.id)
      }

      // ==========================================
      // 🚀 壽星專屬攔截器：打開 APP 的瞬間發放！
      // ==========================================
      if (userData.value && userData.value.birthday) {
        const today = new Date()
        const currentMonthIndex = today.getMonth() // 0-11
        const currentYear = today.getFullYear()
        
        // 計算「本月」與「下個月」(因為我們有提前預熱機制)
        const currentMonth = currentMonthIndex + 1
        const targetMonth = (currentMonthIndex + 1) % 12 + 1 
        const targetYear = currentMonthIndex === 11 ? currentYear + 1 : currentYear

        const bMonth = new Date(userData.value.birthday).getMonth() + 1

        // 判斷玩家是不是「本月壽星」或「下個月壽星」
        if (bMonth === currentMonth || bMonth === targetMonth) {
          // 決定要鎖定的年份 (如果是下個月壽星，鎖定的就是 targetYear)
          const claimYear = bMonth === targetMonth ? targetYear : currentYear

          // 檢查今年領過沒？
          if (userData.value.birthday_claimed_year !== claimYear) {
            console.log('🎂 捕捉到野生壽星！準備發放禮包...')
            
            // 呼叫自動派發引擎，依據他的等級發放生日禮！
            const grantedTitles = await grantSystemRewards(userData.value.id, 'birthday', userData.value.level)
            
            if (grantedTitles.length > 0) {
              // 更新領取鎖，防止他明天打開又領一次
              await supabase.from('users').update({ birthday_claimed_year: claimYear }).eq('id', userData.value.id)
              userData.value.birthday_claimed_year = claimYear
              
              // 重新抓取票券讓他畫面上馬上出現
              await fetchUserExtraData(userData.value.id)

              // 炸出華麗彈窗！
              alert(`🎉 祝尊榮的 LV.${userData.value.level} 玩家生日快樂！\n\n🎁 您的專屬生日大禮包已送達：\n- ` + grantedTitles.join('\n- ') + `\n\n請至票券夾查看，期待在劇光燈為您慶生！`)
            }
          }
        }
      }
      // ==========================================

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
    let { data: existingUser } = await supabase.from('users').select('*').eq('id', profile.userId).single()

    if (existingUser) {
      userData.value = existingUser
      isLoggedIn.value = true
    } else {
      let nextIdNumber = 1
      const { data: maxUsers } = await supabase.from('users').select('legacy_id').order('legacy_id', { ascending: false }).limit(1)
      if (maxUsers && maxUsers.length > 0 && maxUsers[0].legacy_id) {
        const currentMax = parseInt(maxUsers[0].legacy_id, 10)
        if (!isNaN(currentMax)) nextIdNumber = currentMax + 1 
      }
      
      const newLegacyId = String(nextIdNumber).padStart(8, '0')

      const { data: newUser, error: insertError } = await supabase
        .from('users')
        .insert([{ id: profile.userId, display_name: profile.displayName, picture_url: profile.pictureUrl, legacy_id: newLegacyId, level: 1, total_exp: 0 }])
        .select().single()

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

      const { data: historyData } = await supabase.from('game_participants').select(`id, exp_gained, comment, games ( play_time, gm_name, story_memory, branch_name, scripts ( title, cover_url ) )`).eq('user_id', userId).order('created_at', { ascending: false })

      if (historyData) {
        history.value = historyData.map(item => {
          const rawCover = item.games?.scripts?.cover_url;
          const finalCover = (rawCover && rawCover.trim() !== '') ? rawCover : 'https://images.unsplash.com/photo-1514467953502-5a7820e3efb4?w=600&q=80';
          return {
            id: item.id, title: item.games?.scripts?.title || '未知劇本', cover: finalCover,
            date: item.games?.play_time ? new Date(item.games.play_time).toLocaleString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).replace(/\//g, '-') : '未知時間',
            gm: item.games?.gm_name || '未知 GM', exp: item.exp_gained || 50, branch: item.games?.branch_name || '西門館1.0', story_memory: item.games?.story_memory || '' 
          }
        })
      }

      const { data: couponData } = await supabase.from('coupons').select('*').eq('user_id', userId).order('created_at', { ascending: false })
      coupons.value = couponData || []

    } catch (err) {
      console.error('❌ 額外資料讀取失敗:', err.message)
    }
  }

  // 🌟 D. 加入遊戲 (🚀 串接動態派發引擎！)
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

      // 1. 寫入參與紀錄
      await supabase.from('game_participants').insert([{ game_id: gameId, user_id: userData.value.id, exp_gained: earnedExp }])
      // 2. 更新總經驗值與等級
      await supabase.from('users').update({ total_exp: newTotalExp, level: newLevel }).eq('id', userData.value.id)

      // ==========================================
      // 🚀 核心 1：推坑分潤 - 呼叫引擎給老手發券
      // ==========================================
      if (currentExp === 0 && userData.value.referred_by) {
        const { data: referrer } = await supabase.from('users').select('id, display_name').eq('my_referral_code', userData.value.referred_by).single()
        if (referrer) {
          await grantSystemRewards(referrer.id, 'referral_veteran')
          console.log(`✅ 已自動呼叫引擎，將推坑獎勵塞給 ${referrer.display_name}！`)
        }
      }

      // ==========================================
      // 🚀 核心 2：升級大禮包 - 支援跳級與多重獎勵
      // ==========================================
      if (isLeveledUp) {
        let allGrantedTitles = []
        // 支援「跳級」：如果從 LV1 跳 LV3，會把 LV2 跟 LV3 的獎勵一起發給他！
        for (let lvl = currentLevelInfo.level + 1; lvl <= newLevel; lvl++) {
          const granted = await grantSystemRewards(userData.value.id, 'level_up', lvl)
          allGrantedTitles = allGrantedTitles.concat(granted)
        }

        let alertMsg = `🎉 恭喜升級！\n獲得經驗值 +${earnedExp} PT\n目前等級：LV.${newLevel}`
        if (allGrantedTitles.length > 0) {
          alertMsg += `\n\n🎁 獲得升級大禮包：\n- ` + allGrantedTitles.join('\n- ')
        }
        alert(alertMsg)

      } else {
        alert(`✅ 成功加入遊戲！\n獲得經驗值 +${earnedExp} PT`)
      }
      
      // 3. 更新本地狀態並刷新畫面
      userData.value.total_exp = newTotalExp
      userData.value.level = newLevel
      await fetchUserExtraData(userData.value.id)

    } catch (err) {
      console.error('加入遊戲失敗:', err.message)
    }
  }

  // 🌟 E. 更新個人資料 (🚀 串接動態派發引擎！)
  const updateProfile = async (formData) => {
    if (!userData.value) return { success: false, message: '尚未登入' }

    try {
      const isFirstTimeCompletingProfile = !userData.value.birthday && formData.birthday;

      const { data, error: updateError } = await supabase
        .from('users').update({ display_name: formData.name, phone: formData.phone, birthday: formData.birthday }).eq('id', userData.value.id).select().single()

      if (updateError) throw updateError
      userData.value = data

      // 🚀 核心 3：資料完善禮 - 呼叫引擎
      if (isFirstTimeCompletingProfile) {
        const grantedTitles = await grantSystemRewards(userData.value.id, 'profile_complete')
        await fetchUserExtraData(userData.value.id)
        
        let msg = '資料儲存成功！'
        if (grantedTitles.length > 0) {
          msg += `\n\n🎁 感謝完善資料，獲得：\n- ` + grantedTitles.join('\n- ')
        }
        return { success: true, message: msg }
      }

      return { success: true, message: '資料儲存成功' }
    } catch (err) {
      console.error('更新失敗:', err)
      return { success: false, message: err.message }
    }
  }

  return {
    lineProfile, userData, isLoggedIn, isLoading, error,
    history, coupons, daysJoined, userTitle, 
    initLiff, updateProfile, getLevelInfo
  }
})