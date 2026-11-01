import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'
import { notifyAdmins } from '../_shared/notify.ts'

// 每月 1 號由 pg_cron 呼叫；後台「戰情室」也可手動觸發。
// 通知「下個月」生日的會員，讓他們提前打開成就系統（LIFF）領生日禮（領取邏輯在 src/stores/user.js）。
// 防重複：發送成功後把 users.last_birthday_year 設為目標年份，同一年不會再推第二次。

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
}

const PAGE_SIZE = 1000   // PostgREST 單次回傳上限
const CHUNK_SIZE = 500   // LINE multicast 單次上限
const LINE_USER_ID = /^U[0-9a-f]{32}$/

// 文案存在 group_settings，後台「推播監控」可編輯；沒設定時用下面的預設文案。
// 前端 src/components/AdminPushLogs.vue 有同一份預設文案，修改時兩邊一起改。
const SETTING_NEXT = 'birthday_msg_next'       // 下個月壽星（每月 1 號自動）
const SETTING_CURRENT = 'birthday_msg_current' // 本月壽星（補發）
const SETTING_AUTO = 'birthday_auto_enabled'   // 'off' = 關閉每月自動發送
const MONTH_TAG = '{月}'
const DEFAULT_NEXT = `🎉 {月}月壽星請提前出列！\n\n為了讓您有充足的時間揪團，專屬您的【階梯式生日大禮包】已經提前派發囉！最高可享『免費暢玩』！\n\n現在立刻點擊下方選單打開「成就系統」，系統就會自動把禮物塞進您的票券夾！趕快來劇光燈預約生日局吧！🎂`
const DEFAULT_CURRENT = `🎉 {月}月壽星生日快樂！\n\n專屬您的【階梯式生日大禮包】已經準備好囉！最高可享『免費暢玩』！票券效期到本月底，別錯過了！\n\n現在立刻點擊下方選單打開「成就系統」，系統就會自動把禮物塞進您的票券夾！趕快來劇光燈預約生日局吧！🎂`

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const LINE_TOKEN = Deno.env.get('LINE_CHANNEL_ACCESS_TOKEN')
  if (!LINE_TOKEN) return json({ error: '找不到 LINE_CHANNEL_ACCESS_TOKEN 環境變數！' }, 500)

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  )

  // body.month_offset：1 = 下個月壽星（預設，每月排程用）；0 = 本月壽星（補發用）
  // body.trigger_by：'pg_cron' 開頭 = 自動排程；其他 = 後台手動
  let monthOffset = 1
  let isAuto = false
  try {
    const body = await req.json()
    if (body?.month_offset === 0) monthOffset = 0
    isAuto = String(body?.trigger_by ?? '').startsWith('pg_cron')
  } catch { /* 沒帶 body 就用預設 */ }

  // 後台可調整的設定（group_settings）：文案、自動發送開關
  const { data: settingRows } = await supabase
    .from('group_settings').select('key, value').in('key', [SETTING_NEXT, SETTING_CURRENT, SETTING_AUTO])
  const setting = (k: string) => (settingRows ?? []).find((r) => r.key === k)?.value as string | undefined

  // 以台灣時間判斷月份（Edge Function 跑在 UTC）
  const tw = new Date(Date.now() + 8 * 60 * 60 * 1000)
  const currentMonthIndex = tw.getUTCMonth() // 0-11
  const targetMonthIndex = currentMonthIndex + monthOffset // 0-12
  const targetMonth = targetMonthIndex % 12 + 1 // 1-12
  const targetYear = tw.getUTCFullYear() + (targetMonthIndex > 11 ? 1 : 0)
  const taskName = monthOffset === 0
    ? `${targetYear}年${targetMonth}月 壽星當月推播`
    : `${targetYear}年${targetMonth}月 壽星提前預熱推播`
  const template = (monthOffset === 0 ? setting(SETTING_CURRENT) : setting(SETTING_NEXT))?.trim() ||
    (monthOffset === 0 ? DEFAULT_CURRENT : DEFAULT_NEXT)
  const messageText = template.replaceAll(MONTH_TAG, String(targetMonth))

  // 自動排程被後台關掉時不發送（後台手動執行不受影響）
  if (isAuto && setting(SETTING_AUTO) === 'off') {
    console.log(`⏸️ ${taskName}：自動發送已關閉，略過`)
    await notifyAdmins({ source: 'birthday', taskName, note: '生日自動推播已在後台關閉，這次沒有發送。需要的話請到後台手動執行。' })
    return json({ message: '自動發送已關閉，未發送', task: taskName })
  }

  const insertLog = (row: Record<string, unknown>) =>
    supabase.from('push_logs').insert([row]).select().single()
  let { data: logData, error: logErr } = await insertLog(
    { task_name: taskName, status: 'processing', source: 'birthday', message: messageText },
  )
  // 還沒跑 setup_push.sql（沒有 source / message 欄位）時退回舊格式，不擋推播
  if (logErr) ({ data: logData, error: logErr } = await insertLog({ task_name: taskName, status: 'processing' }))
  if (logErr || !logData) return json({ error: `寫入 push_logs 失敗: ${logErr?.message}` }, 500)
  const logId = logData.id

  const finishLog = (fields: Record<string, unknown>) =>
    supabase.from('push_logs')
      .update({ ...fields, completed_at: new Date().toISOString() })
      .eq('id', logId)

  try {
    // 1. 生日在 users_private（date 型別，格式 YYYY-MM-DD）
    const birthdayUserIds: string[] = []
    for (let from = 0; ; from += PAGE_SIZE) {
      const { data, error } = await supabase
        .from('users_private')
        .select('user_id, birthday')
        .not('birthday', 'is', null)
        .order('user_id')
        .range(from, from + PAGE_SIZE - 1)
      if (error) throw new Error(`讀取 users_private 失敗: ${error.message}`)
      for (const row of data ?? []) {
        if (Number(String(row.birthday).slice(5, 7)) === targetMonth) birthdayUserIds.push(row.user_id)
      }
      if (!data || data.length < PAGE_SIZE) break
    }

    // 2. 排除封鎖、今年已推過的人
    const targetIds: string[] = []
    for (let i = 0; i < birthdayUserIds.length; i += PAGE_SIZE) {
      const { data, error } = await supabase
        .from('users')
        .select('id')
        .in('id', birthdayUserIds.slice(i, i + PAGE_SIZE))
        .eq('is_blocked', false)
        .or(`last_birthday_year.neq.${targetYear},last_birthday_year.is.null`)
      if (error) throw new Error(`讀取 users 失敗: ${error.message}`)
      for (const u of data ?? []) if (LINE_USER_ID.test(u.id)) targetIds.push(u.id)
    }

    console.log(`🎯 ${taskName}：${targetIds.length} 人`)

    if (targetIds.length === 0) {
      await finishLog({ target_count: 0, success_count: 0, fail_count: 0, status: 'completed' })
      await notifyAdmins({ source: 'birthday', taskName, count: 0, note: `${targetMonth}月沒有需要通知的壽星（或今年都已推過）` })
      return json({ message: `${targetMonth}月無目標或已全數發送`, task: taskName })
    }

    // 3. 分批 multicast，每批成功就立刻上鎖，避免重跑時重複推送
    let successCount = 0
    let failCount = 0
    const errors: string[] = []

    for (let i = 0; i < targetIds.length; i += CHUNK_SIZE) {
      const chunk = targetIds.slice(i, i + CHUNK_SIZE)
      const lineRes = await fetch('https://api.line.me/v2/bot/message/multicast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${LINE_TOKEN}` },
        body: JSON.stringify({
          to: chunk,
          messages: [{ type: 'text', text: messageText }],
        }),
      })

      // 收件人明細（寫入失敗不影響發送）
      const { error: recErr } = await supabase.from('push_log_recipients').insert(
        chunk.map((user_id) => ({ log_id: logId, user_id, status: lineRes.ok ? 'sent' : 'failed' })),
      )
      if (recErr) console.error('寫入 push_log_recipients 失敗:', recErr.message)

      if (lineRes.ok) {
        successCount += chunk.length
        const { error } = await supabase.from('users')
          .update({ last_birthday_year: targetYear })
          .in('id', chunk)
        if (error) errors.push(`上鎖失敗: ${error.message}`)
      } else {
        failCount += chunk.length
        const msg = `第 ${i / CHUNK_SIZE + 1} 批 LINE ${lineRes.status}: ${await lineRes.text()}`
        console.error(msg)
        errors.push(msg)
      }
    }

    await finishLog({
      target_count: targetIds.length,
      success_count: successCount,
      fail_count: failCount,
      status: failCount > 0 ? 'failed' : 'completed',
      error_msg: errors.length ? errors.join('\n').slice(0, 2000) : null,
    })

    await notifyAdmins({
      source: 'birthday', taskName, count: targetIds.length, success: successCount, fail: failCount,
      message: messageText, error: errors.length ? errors.join(' | ') : null,
    })

    return json({ message: '發送完成', task: taskName, success: successCount, fail: failCount })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('🔥 生日推播失敗:', msg)
    await finishLog({ status: 'failed', error_msg: msg })
    await notifyAdmins({ source: 'birthday', taskName, error: msg })
    return json({ error: msg }, 500)
  }
})
