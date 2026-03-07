const LINE_CHANNEL_SECRET  = Deno.env.get('LINE_CHANNEL_SECRET')!
const LINE_CHANNEL_TOKEN   = Deno.env.get('LINE_CHANNEL_TOKEN')!
const SUPABASE_URL         = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const LIFF_URL             = 'https://liff.line.me/2009161687-icfQU9r6'

// ── Supabase REST（不 import SDK，冷啟動更快）─────────────────────────────
const dbHeaders = {
  'apikey': SUPABASE_SERVICE_KEY,
  'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
  'Content-Type': 'application/json',
}

const dbGet = async (path: string) => {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: dbHeaders })
  return res.json()
}

const dbCount = async (table: string, filter: string): Promise<number> => {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/${table}?${filter}`,
    { headers: { ...dbHeaders, 'Prefer': 'count=exact', 'Range-Unit': 'items' } }
  )
  const range = res.headers.get('content-range') || ''
  return parseInt(range.split('/')[1] || '0', 10)
}

// ── LINE 簽名驗證 ──────────────────────────────────────────────────────────
const verifySignature = async (body: string, signature: string): Promise<boolean> => {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(LINE_CHANNEL_SECRET),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  )
  const sig      = await crypto.subtle.sign('HMAC', key, enc.encode(body))
  const expected = btoa(String.fromCharCode(...new Uint8Array(sig)))
  return expected === signature
}

// ── 等級計算 ───────────────────────────────────────────────────────────────
const getLevelInfo = (exp: number) => {
  if (exp >= 2500) return { level: 6, title: '神級玩家', nextExp: 2500 }
  if (exp >= 1000) return { level: 5, title: '尊榮玩家', nextExp: 2500 }
  if (exp >= 500)  return { level: 4, title: '頂級玩家', nextExp: 1000 }
  if (exp >= 250)  return { level: 3, title: '黃金玩家', nextExp: 500  }
  if (exp >= 100)  return { level: 2, title: '白銀玩家', nextExp: 250  }
  return               { level: 1, title: '青銅玩家', nextExp: 100  }
}

const GOLD = '#D4AF37'

// ── 組裝名片 Flex Message ─────────────────────────────────────────────────
const buildCard = (user: Record<string, unknown>, stats: { games: number; days: number; disciples: number }) => {
  const exp      = (user.total_exp as number) || 0
  const info     = getLevelInfo(exp)
  const level    = (user.level as number) || info.level
  const title    = (user.current_title as string) || info.title
  const accent   = GOLD
  const expPct   = Math.min(Math.round((exp / info.nextExp) * 100), 100)
  const filled   = Math.max(expPct, 1)
  const empty    = Math.max(100 - expPct, 1)
  const name     = (user.display_name as string) || '冒險者'
  const referral = user.my_referral_code as string | undefined

  return {
    type: 'flex',
    altText: `⚔️ ${name} 的冒險名片 | LV.${level} ${title}`,
    contents: {
      type: 'bubble',
      size: 'mega',
      styles: {
        header: { backgroundColor: '#080808' },
        body:   { backgroundColor: '#0d0d0d' },
      },
      header: {
        type: 'box', layout: 'vertical', paddingAll: '14px', paddingBottom: '6px',
        contents: [
          // 名字 + 右上角 EXP
          {
            type: 'box', layout: 'horizontal', alignItems: 'flex-end',
            contents: [
              {
                type: 'box', layout: 'vertical', paddingStart: '10px', flex: 1,
                contents: [
                  { type: 'text', text: name, size: 'xl', color: '#ffffff', weight: 'bold' },
                ],
              },
              { type: 'text', text: `EXP ${exp.toLocaleString()}`, size: 'sm', color: accent, weight: 'bold', align: 'end' },
            ],
          },
          // LV + 稱號 badge
          {
            type: 'box', layout: 'horizontal', backgroundColor: accent,
            paddingAll: '4px', paddingStart: '10px', paddingEnd: '10px', cornerRadius: '20px',
            margin: 'md', alignItems: 'center',
            contents: [
              { type: 'text', text: `LV.${level} ◆ ${title}`, size: 'xs', color: '#080808', weight: 'bold' },
            ],
          },
        ],
      },
      body: {
        type: 'box', layout: 'vertical', paddingAll: '14px', paddingTop: '8px', spacing: 'md',
        contents: [
          // 三欄數據
          {
            type: 'box', layout: 'horizontal',
            contents: [
              {
                type: 'box', layout: 'vertical', flex: 1, alignItems: 'center',
                contents: [
                  { type: 'text', text: String(stats.games),     size: 'xl', color: '#ffffff', weight: 'bold', align: 'center' },
                  { type: 'text', text: '場冒險', size: 'xxs', color: '#888888', align: 'center', margin: 'xs' },
                ],
              },
              { type: 'separator', color: '#333333' },
              {
                type: 'box', layout: 'vertical', flex: 1, alignItems: 'center',
                contents: [
                  { type: 'text', text: String(stats.days),      size: 'xl', color: '#ffffff', weight: 'bold', align: 'center' },
                  { type: 'text', text: '天資歷', size: 'xxs', color: '#888888', align: 'center', margin: 'xs' },
                ],
              },
              { type: 'separator', color: '#333333' },
              {
                type: 'box', layout: 'vertical', flex: 1, alignItems: 'center',
                contents: [
                  { type: 'text', text: String(stats.disciples), size: 'xl', color: '#ffffff', weight: 'bold', align: 'center' },
                  { type: 'text', text: '推坑人數', size: 'xxs', color: '#888888', align: 'center', margin: 'xs' },
                ],
              },
            ],
          },
          // 推薦碼 + 按鈕
          {
            type: 'box', layout: 'horizontal', backgroundColor: '#141414',
            cornerRadius: '8px', paddingAll: '10px', alignItems: 'center', spacing: 'md',
            contents: [
              {
                type: 'box', layout: 'vertical', flex: 1,
                contents: [
                  { type: 'text', text: '推薦碼', size: 'xxs', color: '#444444' },
                  { type: 'text', text: referral || '—', size: 'sm', color: accent, weight: 'bold' },
                ],
              },
              {
                type: 'box', layout: 'vertical', flex: 0,
                backgroundColor: accent, cornerRadius: '6px',
                paddingTop: '8px', paddingBottom: '8px', paddingStart: '14px', paddingEnd: '14px',
                action: { type: 'uri', uri: LIFF_URL },
                contents: [{ type: 'text', text: '加入冒險 ⚔️', size: 'xs', color: '#080808', weight: 'bold', align: 'center' }],
              },
            ],
          },
        ],
      },
    },
  }
}

// ── 組裝吉祥物 Flex Message ───────────────────────────────────────────────
const buildDollCard = (
  name: string,
  baseUrl: string,
  layers: { slot: string; url: string }[],
  level: number,
  title: string,
) => {
  const SLOT_ORDER = ['cape', 'bottom', 'top', 'acc', 'hat', 'expr']
  const orderedLayers = SLOT_ORDER
    .map(slot => layers.find(l => l.slot === slot))
    .filter((l): l is { slot: string; url: string } => !!l)

  const absLayer = (url: string) => ({
    type: 'box', layout: 'vertical',
    position: 'absolute', offsetTop: '0px', offsetStart: '0px',
    width: '100%', height: '100%',
    contents: [{ type: 'image', url, size: 'full', aspectRatio: '2:3', aspectMode: 'cover' }],
  })

  return {
    type: 'flex',
    altText: `✨ ${name} 的燈燈登場！`,
    contents: {
      type: 'bubble',
      size: 'kilo',
      styles: {
        header: { backgroundColor: '#080808' },
        body:   { backgroundColor: '#080808' },
        footer: { backgroundColor: '#080808' },
      },
      header: {
        type: 'box', layout: 'horizontal', paddingAll: '8px',
        alignItems: 'center',
        contents: [
          { type: 'text', text: 'SPOTLIGHT LARP', size: 'xs', color: GOLD, weight: 'bold', flex: 1 },
          {
            type: 'box', layout: 'vertical', flex: 0,
            backgroundColor: GOLD, cornerRadius: '6px',
            paddingTop: '7px', paddingBottom: '7px', paddingStart: '12px', paddingEnd: '12px',
            action: { type: 'uri', uri: LIFF_URL },
            contents: [{ type: 'text', text: '加入冒險 ⚔️', size: 'xs', color: '#080808', weight: 'bold' }],
          },
        ],
      },
      body: {
        type: 'box', layout: 'vertical', paddingAll: '0px',
        contents: [
          {
            type: 'box', layout: 'vertical', paddingAll: '0px',
            contents: [
              { type: 'image', url: baseUrl, size: 'full', aspectRatio: '2:3', aspectMode: 'cover' },
              ...orderedLayers.map(l => absLayer(l.url)),
            ],
          },
        ],
      },
      footer: {
        type: 'box', layout: 'vertical', paddingAll: '10px', spacing: 'xs',
        contents: [
          { type: 'text', text: `✨ ${name} 的燈燈`, size: 'sm', color: '#ffffff', weight: 'bold', align: 'center' },
          { type: 'text', text: `LV.${level} ◆ ${title}`, size: 'xxs', color: GOLD, align: 'center', margin: 'xs' },
        ],
      },
    },
  }
}

// ── LINE Reply ─────────────────────────────────────────────────────────────
const lineReply = (replyToken: string, messages: unknown[]) =>
  fetch('https://api.line.me/v2/bot/message/reply', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${LINE_CHANNEL_TOKEN}` },
    body: JSON.stringify({ replyToken, messages }),
  })

// ── 事件處理（背景執行）────────────────────────────────────────────────────
const handleEvents = async (events: Record<string, unknown>[]) => {
  for (const event of events) {
    console.log('event.type:', event.type)
    if (event.type !== 'message') continue
    const msg = event.message as Record<string, unknown>
    console.log('msg.type:', msg?.type, '| text:', msg?.text)
    if (msg?.type !== 'text') continue

    const text = (msg.text as string).trim()
    console.log('text:', JSON.stringify(text))

    const isCard   = text === '!我的名片' || text === '！我的名片'
    const isMascot = text === '!召喚'     || text === '！召喚'
    if (!isCard && !isMascot) continue

    const lineUserId = (event.source as Record<string, unknown>).userId as string
    const replyToken = event.replyToken as string
    console.log('lineUserId:', lineUserId)

    const users = await dbGet(`users?id=eq.${lineUserId}&limit=1`)
    const user = users?.[0]
    console.log('user found:', !!user)

    if (!user) {
      await lineReply(replyToken, [{
        type: 'text',
        text: '⚔️ 你還不是劇光燈的冒險者！\n\n點下方按鈕開始你的冒險吧！',
        quickReply: {
          items: [{ type: 'action', action: { type: 'uri', label: '立即加入', uri: LIFF_URL } }],
        },
      }])
      continue
    }

    // ── 名片 ──────────────────────────────────────────────────────────────
    if (isCard) {
      const [games, disciples] = await Promise.all([
        dbCount('game_participants', `user_id=eq.${lineUserId}`),
        user.my_referral_code
          ? dbCount('users', `referred_by=eq.${user.my_referral_code}`)
          : Promise.resolve(0),
      ])
      const days = Math.ceil(
        Math.abs(Date.now() - new Date(user.created_at).getTime()) / 86_400_000
      )
      const replyRes = await lineReply(replyToken, [buildCard(user, { games, days, disciples })])
      console.log('lineReply status:', replyRes.status, await replyRes.text())
    }

    // ── 召喚吉祥物 ────────────────────────────────────────────────────────
    if (isMascot) {
      const [basesData, equippedData, noneDefaultsData] = await Promise.all([
        dbGet('wardrobe_bases?is_default=eq.true&is_active=eq.true&limit=1'),
        dbGet(`user_wardrobe_equipped?user_id=eq.${lineUserId}&limit=1`),
        dbGet('wardrobe_none_defaults?select=category,img_url'),
      ])

      const baseUrl = basesData?.[0]?.img_url || 'https://meee.com.tw/hLmrwbm.png'
      const equippedMap: Record<string, string> = equippedData?.[0]?.equipped || {}
      const itemIds = Object.values(equippedMap).filter(Boolean)

      let layers: { slot: string; url: string }[] = []
      if (itemIds.length > 0) {
        const itemsData = await dbGet(
          `wardrobe_items?id=in.(${itemIds.join(',')})&select=id,category,img_url&is_active=eq.true`
        )
        layers = (itemsData || [])
          .filter((i: Record<string, unknown>) => i.img_url)
          .map((i: Record<string, unknown>) => ({
            slot: i.category as string,
            url:  i.img_url  as string,
          }))
      }

      // 補上「不裝備」預設圖層（該分類沒有裝備任何道具時）
      for (const nd of (noneDefaultsData || []) as { category: string; img_url: string }[]) {
        if (nd.img_url && !equippedMap[nd.category]) {
          layers.push({ slot: nd.category, url: nd.img_url })
        }
      }

      const name     = (user.display_name as string) || '冒險者'
      const exp      = (user.total_exp as number) || 0
      const info     = getLevelInfo(exp)
      const level    = (user.level as number) || info.level
      const title    = (user.current_title as string) || info.title
      const replyRes = await lineReply(replyToken, [buildDollCard(name, baseUrl, layers, level, title)])
      console.log('mascot reply status:', replyRes.status, await replyRes.text())
    }
  }
}

// ── 主 Handler ─────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 })

  const body      = await req.text()
  const signature = req.headers.get('x-line-signature') || ''

  const valid = await verifySignature(body, signature)
  console.log('sig_header:', signature.slice(0, 10), '| secret_len:', LINE_CHANNEL_SECRET.length, '| valid:', valid)
  if (!valid) {
    return new Response('Unauthorized', { status: 401 })
  }

  const { events = [] } = JSON.parse(body)

  await handleEvents(events)

  return new Response('OK', { status: 200 })
})
