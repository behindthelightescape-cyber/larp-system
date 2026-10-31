import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

// 推播發送後通知管理員（LINE）。通知對象存在 group_settings.push_notify_user_ids（逗號分隔的 users.id）。
// 通知失敗只印 log，不影響推播本身。每則通知會用掉 1 則 LINE 額度。

const LINE_USER_ID = /^U[0-9a-f]{32}$/
const SOURCE_TEXT: Record<string, string> = { birthday: '🎂 生日自動推播', custom: '✉️ 自訂推播', scheduled: '📅 預約推播' }

const db = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '')

const twTime = () =>
  new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })

export type NotifyInfo = {
  source: 'birthday' | 'custom' | 'scheduled'
  taskName: string
  createdByName?: string | null
  count?: number
  success?: number
  fail?: number
  message?: string | null
  error?: string | null   // 整個任務失敗的原因
  note?: string | null    // 其他說明，例如「本月沒有需要通知的壽星」
}

export async function notifyAdmins(info: NotifyInfo) {
  try {
    const token = Deno.env.get('LINE_CHANNEL_ACCESS_TOKEN')
    if (!token) return
    const { data } = await db.from('group_settings').select('value').eq('key', 'push_notify_user_ids').maybeSingle()
    const to = String(data?.value ?? '').split(',').map((s) => s.trim()).filter((s) => LINE_USER_ID.test(s))
    if (to.length === 0) return

    const failed = Boolean(info.error) || (info.fail ?? 0) > 0
    const lines = [
      failed ? '⚠️ 推播有問題，請確認' : '📣 推播已發出',
      `類型：${SOURCE_TEXT[info.source] ?? info.source}`,
      `任務：${info.taskName}`,
    ]
    if (info.createdByName) lines.push(`發送人：${info.createdByName}`)
    if (info.count != null) {
      lines.push(`對象：${info.count} 人（成功 ${info.success ?? 0}${info.fail ? `／失敗 ${info.fail}` : ''}）`)
    }
    if (info.note) lines.push(info.note)
    if (info.error) lines.push(`原因：${info.error.slice(0, 300)}`)
    lines.push(`時間：${twTime()}`)
    if (info.message) {
      const m = info.message.length > 300 ? `${info.message.slice(0, 300)}…` : info.message
      lines.push('', '內容：', m)
    }

    const res = await fetch('https://api.line.me/v2/bot/message/multicast', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ to, messages: [{ type: 'text', text: lines.join('\n').slice(0, 5000) }] }),
    })
    if (!res.ok) console.error('管理員通知失敗:', res.status, await res.text())
  } catch (err) {
    console.error('管理員通知失敗:', err instanceof Error ? err.message : err)
  }
}
