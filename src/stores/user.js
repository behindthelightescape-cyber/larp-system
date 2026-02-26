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
      
// 🚀 四哥特製：精準等級與稱號計算機
  const getLevelInfo = (exp) => {
    if (exp >= 2500) return { level: 6, title: '陽光開朗小萌新', nextExp: 2500 }
    if (exp >= 1000) return { level: 5, title: '穿越時空成癮者', nextExp: 2500 }
    if (exp >= 500)  return { level: 4, title: '平行宇宙開拓家', nextExp: 1000 }
    if (exp >= 250)  return { level: 3, title: '主角光環的勇者', nextExp: 500 }
    if (exp >= 100)  return { level: 2, title: '不怕死的探險家', nextExp: 250 }
    return { level: 1, title: '剛加入的冒險者', nextExp: 100 }
  }

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
      
      // 🚀 1. 抓取目前資料庫裡「最大」的會員編號
      let nextIdNumber = 1
      const { data: maxUsers, error: maxErr } = await supabase
        .from('users')
        .select('legacy_id')
        .order('legacy_id', { ascending: false }) // 由大排到小
        .limit(1) // 只抓最大的一個

      if (!maxErr && maxUsers && maxUsers.length > 0 && maxUsers[0].legacy_id) {
        // 將字串 (例如 "00001000") 轉成純數字 (1000)
        const currentMax = parseInt(maxUsers[0].legacy_id, 10)
        if (!isNaN(currentMax)) {
          nextIdNumber = currentMax + 1 // 號碼牌往後排一號
        }
      }
      
      // 🚀 2. 把數字轉回 8 碼的字串 (例如 1001 會變成 "00001001")
      // (如果你喜歡 6 碼就改成 padStart(6, '0'))
      const newLegacyId = String(nextIdNumber).padStart(8, '0')

      // 🚀 3. 執行正式註冊
      const { data: newUser, error: insertError } = await supabase
        .from('users')
        .insert([{
          id: profile.userId,
          display_name: profile.displayName,
          picture_url: profile.pictureUrl,
          legacy_id: newLegacyId, // 塞入最新的流水號！
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

  // 🌟 C. 抓取歷史與優惠券 (🚀 你原本的心血都在這裡！)
// 🌟 C. 抓取歷史與優惠券 (🚀 四哥搶救大作戰版)
  const fetchUserExtraData = async (userId) => {
    console.log("🚀 開始整合抓取資料，真實玩家 ID:", userId)
    try {
      // 1. 計算加入天數
      const joinDate = new Date(userData.value.created_at)
      const today = new Date()
      daysJoined.value = Math.ceil(Math.abs(today - joinDate) / (1000 * 60 * 60 * 24))

      // 2. 抓取遊玩紀錄
      const { data: historyData, error: historyErr } = await supabase
        .from('game_participants')
        .select(`
          id, exp_gained, comment,
          games ( 
            play_time, 
            gm_name, 
            story_memory, 
            branch_name,
            scripts ( title, cover_url ) 
          )
        `) // 🚀 修正 1：把 story_memory 加進查詢清單！
        .eq('user_id', userId)
        .order('created_at', { ascending: false })

      if (historyErr) throw historyErr

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
            // 🚀 修正 2：升級成完整時間格式 (年月日時分)
            date: item.games?.play_time 
              ? new Date(item.games.play_time).toLocaleString('zh-TW', { 
                  year: 'numeric', month: '2-digit', day: '2-digit', 
                  hour: '2-digit', minute: '2-digit', hour12: false 
                }).replace(/\//g, '-') 
              : '未知時間',
            gm: item.games?.gm_name || '未知 GM',
            exp: item.exp_gained || 50,
            // 🚀 直接抓取資料庫的正式場館欄位，如果沒有就預設西門館1.0
            branch: item.games?.branch_name || '西門館1.0', // 既然都要搬家了，統一叫本館就好
            // 🚀 修正 3：對準正確的欄位！是 games 裡面的 story_memory！
            story_memory: item.games?.story_memory || '' 
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
// 🌟 D. 加入遊戲 (掃碼觸發)
 // 🌟 D. 加入遊戲 (掃碼觸發) - 🚀 Phase 2 升級與送券完全體！
  const joinGame = async (gameId) => {
    if (!userData.value) return
    try {
      // 1. 抓出這場遊戲的資料與懸賞金 (base_exp)
      const { data: game } = await supabase.from('games').select('*').eq('id', gameId).single()
      if (!game || game.status !== 'open') return alert('這場遊戲已經結束或不存在囉！')

      const { data: existing } = await supabase.from('game_participants').select('*').eq('game_id', gameId).eq('user_id', userData.value.id).single()
      if (existing) return alert('你已經登記過這場遊戲囉！')

      // 🚀 2. 動態抓取真正的經驗值！(如果是 135，這裡就會是 135)
      const earnedExp = game.base_exp || 0
      const currentExp = userData.value.total_exp || 0
      const currentLevel = userData.value.level || 1
      
      // 🚀 3. 算好加入這場遊戲後，總經驗值會變多少 (精準加上 135！)
      const newTotalExp = currentExp + earnedExp
      
      // 🚀 4. 升級判定雷達啟動！(每 1000 分升一級)
      // 🚀 4. 升級判定雷達啟動！(套用最新 LV1 ~ LV6 階梯)
      const currentLevelInfo = getLevelInfo(currentExp)
      const newLevelInfo = getLevelInfo(newTotalExp)
      
      let newLevel = newLevelInfo.level
      // 如果算出來的新等級，大於原本的等級，就是升級啦！
      let isLeveledUp = newLevel > currentLevelInfo.level

      // 5. 寫入車票 (單場紀錄：確實寫入 135)
      await supabase.from('game_participants').insert([{ 
        game_id: gameId, 
        user_id: userData.value.id,
        exp_gained: earnedExp 
      }])
      
      // 6. 更新玩家的「總經驗值」與「新等級」
      await supabase.from('users').update({ 
        total_exp: newTotalExp, // 👈 兇手伏法！這裡現在是動態的總和了！
        level: newLevel 
      }).eq('id', userData.value.id)

      // 🚀 7. 驚喜派券系統：如果有升級，偷偷塞一張優惠券到他的背包！
      if (isLeveledUp) {
         await supabase.from('coupons').insert([{
           user_id: userData.value.id,
           title: `🎉 LV.${newLevel} 尊榮升級禮`,
           description: `恭喜您升級到 LV.${newLevel}！這是一張專屬的升級折價券，感謝您對劇光燈的支持。`,
           status: 'available',
           expiry_date: new Date(new Date().setFullYear(new Date().getFullYear() + 1)).toISOString()
         }])
         
         alert(`✅ 成功加入遊戲！獲得 +${earnedExp} PT\n\n🎊 狂賀！您已升級至 LV.${newLevel}！\n🎟️ 系統已自動發送「尊榮升級禮」至您的票券匣，請前往查看！`)
      } else {
         alert(`✅ 成功加入遊戲！\n獲得經驗值 +${earnedExp} PT`)
      }
      
      // 重新抓取資料更新畫面
      await fetchUserExtraData(userData.value.id)

    } catch (err) {
      console.error('加入遊戲失敗:', err.message)
    }
  }
  // 🌟 核心 Action：更新個人資料 + 發放生日填寫禮
  const updateProfile = async (formData) => {
    if (!userData.value) return { success: false, message: '尚未登入' }

    try {
      // 1. 檢查是否是第一次填寫生日 (原本是 null 且現在有值)
      const isFirstTimeBirthday = !userData.value.birthday && formData.birthday;

      // 2. 更新 Supabase
      const { data, error: updateError } = await supabase
        .from('users')
        .update({
          display_name: formData.name,
          phone: formData.phone,
          birthday: formData.birthday
        })
        .eq('id', userData.value.id)
        .select()
        .single()

      if (updateError) throw updateError

      // 更新本地狀態
      userData.value = data

      // 3. 🚀 驚喜邏輯：如果是第一次填生日，自動發券！
      if (isFirstTimeBirthday) {
        await supabase.from('coupons').insert([{
          user_id: userData.value.id,
          title: '🎂 資料完善禮',
          description: '感謝您完善個人資料，本券可折抵劇本費用50元。',
          status: 'available',
          // 設定一年後過期
          expiry_date: new Date(new Date().setFullYear(new Date().getFullYear() + 1)).toISOString()
        }])
        return { success: true, message: '資料已更新，恭喜獲得生日驚喜券！' }
      }

      return { success: true, message: '資料儲存成功' }
    } catch (err) {
      console.error('更新失敗:', err)
      return { success: false, message: err.message }
    }
  }

  
  // === 3. 匯出給 Vue 元件使用 ===
  return {
    lineProfile, 
    userData, 
    isLoggedIn, 
    isLoading, 
    error,
    history, 
    coupons, 
    daysJoined, 
    userTitle, 
    initLiff,
    updateProfile,
    getLevelInfo
  }
})