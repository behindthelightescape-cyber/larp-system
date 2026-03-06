<script setup>
import { ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { supabase } from '../../supabase'
import { useUserStore } from '../../stores/user'

const route     = useRoute()
const userStore = useUserStore()

const sessionId = route.query.s
const status    = ref('loading')  // 'loading' | 'success' | 'error'
const errorMsg  = ref('')

const sendToDisplay = async () => {
  try {
    if (!sessionId) throw new Error('無效的掃描連結')

    const user    = userStore.userData
    const profile = userStore.lineProfile
    if (!user) throw new Error('請先登入 LINE')

    const levelInfo = userStore.getLevelInfo(user.total_exp || 0)

    // 歷史場次 + 劇本名稱
    const { data: histData } = await supabase
      .from('game_participants')
      .select('games(scripts(title))')
      .eq('user_id', user.id)

    const scripts = (histData || [])
      .map(h => h.games?.scripts?.title)
      .filter(Boolean)

    // 弟子（被我推坑的人）
    let disciples    = []
    let discipleCount = 0
    if (user.my_referral_code) {
      const { data: refs } = await supabase
        .from('users')
        .select('display_name')
        .eq('referred_by', user.my_referral_code)
      disciples     = (refs || []).map(r => r.display_name)
      discipleCount = disciples.length
    }

    const playerData = {
      userId:       user.id,
      name:         user.display_name || profile?.displayName || '冒險者',
      title:        user.current_title || levelInfo.title,
      level:        user.level || levelInfo.level,
      exp:          user.total_exp || 0,
      nextExp:      levelInfo.nextExp,
      historyCount: scripts.length,
      daysJoined:   userStore.daysJoined,
      discipleCount,
      disciples,
      scripts,
    }

    const { error: dbErr } = await supabase
      .from('display_sessions')
      .upsert({ session_id: sessionId, user_id: user.id, player_data: playerData }, { onConflict: 'session_id' })

    if (dbErr) throw dbErr

    status.value = 'success'
  } catch (err) {
    console.error('sendToDisplay 失敗:', err)
    status.value = 'error'
    errorMsg.value = err.message
  }
}

// 等 userStore 完成 LIFF 初始化
watch(() => userStore.isLoading, (loading) => {
  if (loading) return
  if (userStore.isLoggedIn) sendToDisplay()
  else { status.value = 'error'; errorMsg.value = '登入失敗，請重新掃描' }
}, { immediate: true })
</script>

<template>
  <div class="scan-root">

    <div class="scan-bg">
      <div class="scan-glow"></div>
    </div>

    <div class="scan-card">

      <!-- Loading -->
      <template v-if="status === 'loading'">
        <div class="scan-spinner"></div>
        <p class="scan-title">連線中...</p>
        <p class="scan-sub">正在讀取你的冒險記錄</p>
      </template>

      <!-- Success -->
      <template v-else-if="status === 'success'">
        <div class="scan-icon success-icon">✦</div>
        <p class="scan-title">準備好了！</p>
        <p class="scan-name">{{ userStore.userData?.display_name }}</p>
        <p class="scan-sub">請看向電視螢幕</p>
        <div class="scan-deco-line"></div>
        <p class="scan-hint">你的冒險記錄正在電視上播放中</p>
      </template>

      <!-- Error -->
      <template v-else>
        <div class="scan-icon error-icon">✕</div>
        <p class="scan-title">出了點問題</p>
        <p class="scan-sub">{{ errorMsg }}</p>
        <p class="scan-hint">請重新掃描 QR Code</p>
      </template>

    </div>

  </div>
</template>

<style scoped>
.scan-root {
  min-height: 100vh;
  display: flex; align-items: center; justify-content: center;
  background: #060606; padding: 24px; box-sizing: border-box;
  position: relative; overflow: hidden;
}

.scan-bg {
  position: absolute; inset: 0; z-index: 0; pointer-events: none;
}
.scan-glow {
  position: absolute; top: -20%; left: 50%; transform: translateX(-50%);
  width: 600px; height: 600px; border-radius: 50%;
  background: radial-gradient(circle, rgba(212,175,55,0.08) 0%, transparent 65%);
}

.scan-card {
  position: relative; z-index: 1;
  width: 100%; max-width: 340px;
  background: rgba(12,12,12,0.9);
  border: 1px solid rgba(212,175,55,0.2);
  border-radius: 24px; padding: 48px 32px;
  display: flex; flex-direction: column; align-items: center; gap: 12px;
  box-shadow: 0 20px 60px rgba(0,0,0,0.6);
  backdrop-filter: blur(20px);
  text-align: center;
}

/* Spinner */
.scan-spinner {
  width: 44px; height: 44px; margin-bottom: 8px;
  border: 3px solid rgba(212,175,55,0.2);
  border-top-color: #D4AF37;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }

/* Icon */
.scan-icon {
  width: 56px; height: 56px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-size: 1.4rem; margin-bottom: 4px;
}
.success-icon {
  background: rgba(212,175,55,0.1);
  border: 1px solid rgba(212,175,55,0.35);
  color: #D4AF37;
  animation: icon-pop 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275) both;
}
.error-icon {
  background: rgba(248,113,113,0.08);
  border: 1px solid rgba(248,113,113,0.3);
  color: #f87171;
}
@keyframes icon-pop {
  0%  { transform: scale(0.4); opacity: 0; }
  100%{ transform: scale(1);   opacity: 1; }
}

.scan-title {
  font-size: 1.4rem; font-weight: 800; color: #fff; margin: 0;
  animation: fade-up 0.4s ease both;
}
.scan-name {
  font-size: 1.1rem; font-weight: 700; color: #D4AF37; margin: 0;
  animation: fade-up 0.4s ease 0.1s both;
}
.scan-sub {
  font-size: 0.85rem; color: #555; margin: 0; letter-spacing: 0.5px;
  animation: fade-up 0.4s ease 0.15s both;
}
.scan-deco-line {
  width: 60px; height: 1px;
  background: linear-gradient(90deg, transparent, rgba(212,175,55,0.4), transparent);
  margin: 4px 0;
  animation: fade-up 0.4s ease 0.2s both;
}
.scan-hint {
  font-size: 0.78rem; color: #333; margin: 0; letter-spacing: 0.5px;
  animation: fade-up 0.4s ease 0.25s both;
}

@keyframes fade-up {
  from { opacity: 0; transform: translateY(12px); }
  to   { opacity: 1; transform: translateY(0); }
}
</style>
