import { LINE_TOKEN, sendPush, supabase, type Target } from '../_shared/push.ts'
import { notifyAdmins } from '../_shared/notify.ts'

// 執行到期的預約推播（scheduled_pushes）。由 pg_cron 每 5 分鐘呼叫一次。
// 不接受任何參數，只會處理後台已建立、且時間已到的預約，所以不需要驗證呼叫者；
// 每筆預約先用 status 從 pending 改成 sending「搶」下來，重複呼叫也不會重複發送。

const MAX_PER_RUN = 5

Deno.serve(async () => {
  if (!LINE_TOKEN) return new Response(JSON.stringify({ error: '找不到 LINE_CHANNEL_ACCESS_TOKEN' }), { status: 500 })

  const { data: due, error } = await supabase
    .from('scheduled_pushes')
    .select('id')
    .eq('status', 'pending')
    .lte('send_at', new Date().toISOString())
    .order('send_at')
    .limit(MAX_PER_RUN)
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 })

  const results: unknown[] = []
  for (const { id } of due ?? []) {
    const { data: claimed } = await supabase
      .from('scheduled_pushes')
      .update({ status: 'sending' })
      .eq('id', id)
      .eq('status', 'pending')
      .select('id, title, message, target, created_by_name')
      .maybeSingle()
    if (!claimed) continue // 被別的執行搶走或已取消

    try {
      const r = await sendPush({
        target: claimed.target as Target,
        message: claimed.message,
        taskName: `[預約] ${claimed.title}`,
        source: 'scheduled',
        createdByName: claimed.created_by_name ?? undefined,
      })
      await supabase.from('scheduled_pushes').update({
        status: r.fail > 0 ? 'failed' : 'sent',
        result: { count: r.count, success: r.success, fail: r.fail },
        error_msg: r.errors.length ? r.errors.join('\n').slice(0, 2000) : null,
        push_log_id: r.logId,
        sent_at: new Date().toISOString(),
      }).eq('id', id)
      results.push({ id, ...r })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`預約 ${id} 發送失敗:`, msg)
      await supabase.from('scheduled_pushes').update({
        status: 'failed',
        error_msg: msg,
        sent_at: new Date().toISOString(),
      }).eq('id', id)
      // sendPush 在發送前就失敗（沒有對象、額度不足等）時，它不會通知，這裡補通知
      await notifyAdmins({
        source: 'scheduled',
        taskName: `[預約] ${claimed.title}`,
        createdByName: claimed.created_by_name,
        message: claimed.message,
        error: msg,
      })
      results.push({ id, error: msg })
    }
  }

  return new Response(JSON.stringify({ processed: results.length, results }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
