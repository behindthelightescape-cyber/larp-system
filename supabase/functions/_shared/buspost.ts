// ═══════════════════════════════════════════════════════════════════════════
// 「公車文」Flex 版：一眼看完所有招募中的車
//   第 1 張：標題、地點、網站版／Excel 版按鈕
//   中間：清單，一行一車（日期 星期 時間｜劇本｜誠徵），依月份分段；點劇本開劇本介紹
//   最後：時間未定的車＋注意事項＋私訊妘兒
// 資料：公車表（Google Sheet）；開頭結尾的連結、注意事項讀公車管家 App 的自訂公版（讀不到用預設）
// ═══════════════════════════════════════════════════════════════════════════

import { readSheet, parseDates, type BusRow } from './bus.ts'
import { busAppReady, getSettings } from './busapp.ts'

const GOLD = '#D4AF37'
const BG = '#0d0d0d'
const ROWS_PER_CARD = 13
const DEFAULT_SITE = 'https://bus.spotlightlarp.com/'
const DEFAULT_EXCEL = 'https://pse.is/7nw2wg'
const DEFAULT_LINE = 'https://line.me/ti/p/PEm5W3XwX8' // 公車表開頭寫的妘兒 LINE
const DEFAULT_NOTES = [
  '滿團訂場後會收取全額費用，發車前三天仍無匯款視為跳車',
  '臨時下車請告知妘兒並尋找替補，出發前兩天仍找不到替補不退款',
  '要使用優惠請提前跟妘兒導遊說',
]

const isFull = (w: string) => /^(已滿|滿團|額滿|無缺額|已成團)/.test(w.trim())
const wantText = (w: string) => {
  const t = w.trim().replace(/^(?:誠徵|徵求|徵|缺)\s*/, '').replace(/(\d+)\s+(?=男|女)/g, '$1').replace(/(男|女)\s+(?=\d)/g, '$1')
  return t ? `缺${t}` : '名額待確認'
}
const isUrl = (x: string) => /^https?:\/\//.test(x || '')

// 一行一車
function rowBox(r: BusRow, dated: boolean) {
  const wd = (r.cells[7] || '').replace('星期', '')
  const site = r.cells[12]
  const left = dated ? `${r.date}${wd ? ' ' + wd : ''}` : (r.date || '未定')
  return {
    type: 'box', layout: 'horizontal', spacing: 'sm', paddingTop: '5px', paddingBottom: '5px',
    ...(isUrl(site) ? { action: { type: 'uri', label: r.title.slice(0, 20), uri: site } } : {}),
    contents: [
      { type: 'text', text: left, size: 'xs', color: '#bbbbbb', flex: 5, wrap: true },
      { type: 'text', text: r.time || '—', size: 'xs', color: '#bbbbbb', flex: 3 },
      { type: 'text', text: r.title, size: 'sm', color: '#ffffff', flex: 8, wrap: true, weight: 'bold' },
      { type: 'text', text: wantText(r.want), size: 'xs', color: GOLD, flex: 5, align: 'end', wrap: true },
    ],
  }
}
const sep = { type: 'separator', color: '#262626' }
const monthHead = (m: string) => ({ type: 'text', text: m, size: 'xs', color: GOLD, weight: 'bold', margin: 'lg' })

function listCard(title: string, items: unknown[], footer?: unknown[]) {
  return {
    type: 'bubble', size: 'giga',
    header: { type: 'box', layout: 'vertical', backgroundColor: '#080808', paddingAll: '14px',
      contents: [{ type: 'text', text: title, color: GOLD, weight: 'bold', size: 'md' }] },
    body: { type: 'box', layout: 'vertical', backgroundColor: BG, paddingAll: '14px', spacing: 'none', contents: items },
    ...(footer ? { footer: { type: 'box', layout: 'vertical', backgroundColor: '#080808', paddingAll: '12px', spacing: 'sm', contents: footer } } : {}),
  }
}
const btn = (label: string, uri: string, primary = false) => ({
  type: 'button', height: 'sm', style: primary ? 'primary' : 'secondary', color: primary ? GOLD : '#2a2a2a',
  action: { type: 'uri', label, uri },
})

export async function busPostMessages(): Promise<unknown[]> {
  const rows = (await readSheet()).filter(r => !isFull(r.want))
  // 開頭結尾：讀 App 自訂公版裡的連結和注意事項（讀不到就用預設）
  let site = DEFAULT_SITE, excel = DEFAULT_EXCEL, notes = DEFAULT_NOTES
  if (busAppReady()) {
    try {
      const st = await getSettings()
      const head = String(st?.notificationTemplates?.busHeader || '')
      const s1 = head.match(/網站版[^h]*(https?:\/\/\S+)/), s2 = head.match(/Excel版[^h]*(https?:\/\/\S+)/)
      if (s1) site = s1[1]
      if (s2) excel = s2[1]
      const foot = String(st?.notificationTemplates?.busFooter || '')
      const pts = [...foot.matchAll(/^\s*\d+\.\s*(.+)$/gm)].map(m => m[1].trim())
      if (pts.length) notes = pts
    } catch (e) { console.error('buspost settings:', e) }
  }

  const dated = rows.filter(r => parseDates(r.date).length > 0)
  const undated = rows.filter(r => parseDates(r.date).length === 0)
  const tpe = new Date(Date.now() + 8 * 3600_000)
  const today = `${tpe.getUTCMonth() + 1}/${tpe.getUTCDate()}`

  // 第 1 張：封面
  const cover = {
    type: 'bubble', size: 'giga',
    body: { type: 'box', layout: 'vertical', backgroundColor: BG, paddingAll: '20px', spacing: 'md', contents: [
      { type: 'text', text: '🚌 劇光燈 Spotlight 旅行團', color: GOLD, weight: 'bold', size: 'lg', wrap: true },
      { type: 'text', text: '這個許願池不用投幣，就可以願望成真ㄛ！\n想玩的劇本快來私訊妘兒許願～', color: '#dddddd', size: 'sm', wrap: true },
      sep,
      { type: 'text', text: `🎟️ 招募中 ${rows.length} 車（${today} 更新）`, color: '#ffffff', size: 'sm', wrap: true },
      { type: 'text', text: '📍 地點皆在劇光燈（康定路30巷6號）', color: '#bbbbbb', size: 'xs', wrap: true },
      { type: 'text', text: '👉 往左滑看全部車次，點劇本名看介紹', color: '#888888', size: 'xs', wrap: true },
    ] },
    footer: { type: 'box', layout: 'vertical', backgroundColor: '#080808', paddingAll: '12px', spacing: 'sm', contents: [
      btn('網站版（圖文並茂）', site, true), btn('Excel 版（一目了然）', excel),
    ] },
  }

  // 中間：有日期的車，依月份分段，每張最多 ROWS_PER_CARD 車
  const cards: unknown[] = []
  let items: unknown[] = [], count = 0, month = '', first = ''
  const flush = () => {
    if (!items.length) return
    cards.push(listCard(`🗓️ ${first}${month && month !== first ? `～${month}` : ''}`, items))
    items = []; count = 0; first = ''
  }
  // 平均分：27 車 → 3 張 × 9 車（不要最後一張只剩 1 車）
  const perCard = Math.ceil(dated.length / Math.max(1, Math.ceil(dated.length / ROWS_PER_CARD)))
  for (const r of dated) {
    const m = `${parseDates(r.date)[0][0]} 月`
    if (count >= perCard) flush()
    if (!first) first = m
    if (m !== month || !items.length) { items.push(monthHead(m)); month = m }
    else items.push(sep)
    items.push(rowBox(r, true))
    count++
  }
  flush()

  // 最後：時間未定＋注意事項
  const lastItems: unknown[] = []
  if (undated.length) {
    lastItems.push(monthHead('時間未定的車車'))
    undated.forEach((r, i) => { if (i) lastItems.push(sep); lastItems.push(rowBox(r, false)) })
  }
  lastItems.push({ type: 'text', text: '📝 注意事項', color: GOLD, weight: 'bold', size: 'xs', margin: 'xl' })
  notes.forEach((n, i) => lastItems.push({ type: 'text', text: `${i + 1}. ${n}`, color: '#bbbbbb', size: 'xxs', wrap: true, margin: 'sm' }))
  cards.push(listCard(undated.length ? '🗝️ 時間未定＆注意事項' : '📝 注意事項', lastItems, [btn('私訊妘兒上車 🙋', DEFAULT_LINE, true)]))

  // 一組最多 12 張，一次回覆最多 5 則
  const all = [cover, ...cards]
  const out: unknown[] = []
  for (let i = 0; i < all.length && out.length < 5; i += 12) {
    out.push({ type: 'flex', altText: `🚌 劇光燈公車表：招募中 ${rows.length} 車`, contents: { type: 'carousel', contents: all.slice(i, i + 12) } })
  }
  return out
}
