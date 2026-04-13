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
    if (exp >= 2500) return { level: 6, title: '陽光開朗小萌新', nextExp: 2500 }
    if (exp >= 1000) return { level: 5, title: '穿越時空成癮者', nextExp: 2500 }
    if (exp >= 500)  return { level: 4, title: '平行宇宙開拓家', nextExp: 1000 }
    if (exp >= 250)  return { level: 3, title: '主角光環的勇者', nextExp: 500 }
    if (exp >= 100)  return { level: 2, title: '不怕死的探險家', nextExp: 250 }
    return { level: 1, title: '剛加入的冒險者', nextExp: 100 }
  }

  const userTitle = computed(() => {
    if (!userData.value) return '新手冒險者'
    return userData.value.current_title || getLevelInfo(userData.value.total_exp || 0).title
  })

  // ==========================================
  // 🚀 核心大腦：自動派發引擎 (Universal Reward Engine)
  // ==========================================
  // ==========================================
  // 🚀 核心大腦：自動派發引擎 (加入自訂效期功能)
  // ==========================================
  const grantSystemRewards = async (targetUserId, eventType, conditionValue = null, customExpiryDate = null) => { // 🌟 多加一個參數
    try {
      let query = supabase.from('system_rewards').select('*').eq('is_active', true).eq('event_type', eventType)
      if (conditionValue !== null) query = query.eq('condition_value', conditionValue)

      const { data: rules, error } = await query
      if (error || !rules || rules.length === 0) return [] 

      const newCoupons = []
      const rewardTitles = []

      for (const rule of rules) {
        const qty = rule.reward_qty || 1
        
        // 🚀 效期判斷：如果有強制指定的日期就用指定的，不然就照系統設定的天數算
        let finalExpiry = customExpiryDate
        if (!finalExpiry) {
          const expiryDate = new Date()
          expiryDate.setDate(expiryDate.getDate() + (rule.valid_days || 30))
          finalExpiry = expiryDate.toISOString()
        }

        for (let i = 0; i < qty; i++) {
          newCoupons.push({
            user_id: targetUserId,
            title: rule.reward_title,
            description: rule.reward_desc,
            status: 'available',
            expiry_date: finalExpiry // 🌟 塞入最終決定的效期
          })
        }
        rewardTitles.push(`${rule.reward_title}` + (qty > 1 ? ` (x${qty})` : ''))
      }

      if (newCoupons.length > 0) {
        const { error: insertErr } = await supabase.from('coupons').insert(newCoupons)
        if (insertErr) throw insertErr
      }
      return rewardTitles
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
          // 檢查今年領過沒？
          if (userData.value.birthday_claimed_year !== claimYear) {
            console.log('🎂 捕捉到野生壽星！準備發放禮包...')
            
            // ==========================================
            // 🚀 神級邏輯：算出他生日月份的「最後一天 23:59:59」
            // 在 JS 中，new Date(年, 月, 0) 會自動推算出「上個月的最後一天」。
            // 因為我們的 bMonth 是 1~12，剛好等同於 JS 裡的「下個月的 Index」！
            // 所以 new Date(claimYear, bMonth, 0) 完美抓到該月月底！
            // ==========================================
            const endOfBirthdayMonth = new Date(claimYear, bMonth, 0, 23, 59, 59).toISOString()

            // 呼叫自動派發引擎，並強制塞入「月底過期」的指令！🌟
            const grantedTitles = await grantSystemRewards(userData.value.id, 'birthday', userData.value.level, endOfBirthdayMonth)
            
            if (grantedTitles.length > 0) {
              await supabase.from('users').update({ birthday_claimed_year: claimYear }).eq('id', userData.value.id)
              userData.value.birthday_claimed_year = claimYear
              await fetchUserExtraData(userData.value.id)

              alert(`🎉 祝尊榮的 LV.${userData.value.level} 玩家生日快樂！\n\n🎁 您的專屬生日大禮包已送達：\n- ` + grantedTitles.join('\n- ') + `\n\n票券效期至月底，期待在劇光燈為您慶生！`)
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
      const { data: maxUsers } = await supabase.from('users').select('legacy_id').filter('legacy_id', 'match', '^[0-9]').order('legacy_id', { ascending: false }).limit(1)
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
        // 查詢 L1 推薦人
        const { data: referrer } = await supabase.from('users').select('id, display_name, referred_by').eq('my_referral_code', userData.value.referred_by).single()
        if (referrer) {
          // L1：系統票券 + 點數
          await grantSystemRewards(referrer.id, 'referral_veteran')
          const { data: ruleL1 } = await supabase.from('referral_point_rules').select('*').eq('tier', 1).eq('is_active', true).single()
          if (ruleL1?.points > 0) {
            await grantPoints(referrer.id, ruleL1.points, 'referral_l1', userData.value.id, `${userData.value.display_name} 首場參賽`)
          }
          console.log(`✅ 已將推坑獎勵（票券+點數）給 ${referrer.display_name}`)

          // L2+：查詢師公
          if (referrer.referred_by) {
            const { data: grandReferrer } = await supabase.from('users').select('id, display_name').eq('my_referral_code', referrer.referred_by).single()
            if (grandReferrer) {
              const { data: ruleL2 } = await supabase.from('referral_point_rules').select('*').eq('tier', 2).eq('is_active', true).single()
              if (ruleL2?.points > 0) {
                await grantPoints(grandReferrer.id, ruleL2.points, 'referral_l2_plus', userData.value.id, `徒孫 ${userData.value.display_name} 首場參賽`)
              }
            }
          }
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

  // ==========================================
  // 🪙 點數引擎：新增/扣除點數 + 寫入流水帳
  // ==========================================
  const grantPoints = async (userId, delta, sourceType, sourceRef = null, note = null) => {
    try {
      await supabase.from('points_transactions').insert([{
        user_id: userId, delta, source_type: sourceType,
        source_ref: sourceRef, note,
      }])
      const { data: u } = await supabase.from('users').select('points').eq('id', userId).single()
      const newPoints = Math.max(0, (u?.points || 0) + delta)
      await supabase.from('users').update({ points: newPoints }).eq('id', userId)
      if (userId === userData.value?.id) userData.value.points = newPoints
    } catch (err) {
      console.error('grantPoints 失敗:', err.message)
    }
  }

  // 🌟 E. 更新個人資料 (🚀 串接動態派發引擎！)
  const updateProfile = async (formData) => {
    if (!userData.value) return { success: false, message: '尚未登入' }

    try {
      const isFirstTimeCompletingProfile = !userData.value.birthday && formData.birthday;

      const { data, error: updateError } = await supabase
        .from('users').update({ display_name: formData.name, phone: formData.phone, birthday: formData.birthday, email: formData.email || null }).eq('id', userData.value.id).select().single()

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
    initLiff, updateProfile, getLevelInfo, grantPoints, joinGame
  }
})