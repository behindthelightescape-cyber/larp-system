// ═══════════════════════════════════════════════════════════════════════════
// 劇光燈 Spotlight — LINE Webhook（Supabase Edge Function）
//
// 觸發時機：玩家在 LINE 官方帳號傳送特定指令
//   !我的名片 ／ ！我的名片  →  回傳冒險者名片 Flex Message
//   !召喚     ／ ！召喚      →  回傳燈燈吉祥物造型 Flex Message
//
// 部署指令：
//   npx supabase functions deploy line-webhook --no-verify-jwt --project-ref <project-ref>
// ═══════════════════════════════════════════════════════════════════════════

// ── 環境變數（在 Supabase Dashboard > Edge Functions > Secrets 設定）──────
const LINE_CHANNEL_SECRET  = Deno.env.get('LINE_CHANNEL_SECRET')!        // LINE Bot Channel Secret，用於驗證簽名
const LINE_CHANNEL_TOKEN   = Deno.env.get('LINE_CHANNEL_TOKEN')!         // LINE Bot Channel Access Token，用於回覆訊息
const SUPABASE_URL         = Deno.env.get('SUPABASE_URL')!               // Supabase 專案 URL
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!  // Service Role Key，有完整 DB 讀寫權限（跳過 RLS）
const LIFF_URL             = 'https://liff.line.me/2009161687-icfQU9r6'  // LIFF 入口，用於名片與吉祥物卡的「加入冒險」按鈕

// ── Supabase REST 輔助（不 import SDK，冷啟動更快）────────────────────────
// 所有 DB 請求共用的 Header
const dbHeaders = {
  'apikey': SUPABASE_SERVICE_KEY,
  'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
  'Content-Type': 'application/json',
}

// 通用 GET：傳入 PostgREST 路徑（含 query string），回傳 JSON 陣列
const dbGet = async (path: string) => {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: dbHeaders })
  return res.json()
}

// 通用 POST：新增一筆資料
const dbInsert = (table: string, payload: Record<string, unknown>) =>
  fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: { ...dbHeaders, 'Prefer': 'return=minimal' },
    body: JSON.stringify(payload),
  })

// 計數查詢：利用 content-range header 取得符合條件的總筆數
// 範例：dbCount('game_participants', 'user_id=eq.U123') → 回傳該玩家的遊戲次數
const dbCount = async (table: string, filter: string): Promise<number> => {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/${table}?${filter}`,
    { headers: { ...dbHeaders, 'Prefer': 'count=exact', 'Range-Unit': 'items' } }
  )
  const range = res.headers.get('content-range') || ''
  // content-range 格式為 "0-9/42"，取斜線後的總數
  return parseInt(range.split('/')[1] || '0', 10)
}

// ── LINE 簽名驗證 ──────────────────────────────────────────────────────────
// LINE 每次 Webhook 都會附上 x-line-signature header
// 用 HMAC-SHA256 + Channel Secret 對 body 簽名，確認請求來自 LINE 官方，防止偽造
const verifySignature = async (body: string, signature: string): Promise<boolean> => {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(LINE_CHANNEL_SECRET),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  )
  const sig      = await crypto.subtle.sign('HMAC', key, enc.encode(body))
  const expected = btoa(String.fromCharCode(...new Uint8Array(sig))) // 轉成 Base64 與 header 比對
  return expected === signature
}

// ── 等級計算 ───────────────────────────────────────────────────────────────
// 根據累積 EXP 回傳等級資訊（level、稱號、下一級所需 EXP）
// nextExp 用於計算 EXP 進度百分比
const getLevelInfo = (exp: number) => {
  if (exp >= 2500) return { level: 6, title: '陽光開朗小萌新', nextExp: 2500 }
  if (exp >= 1000) return { level: 5, title: '穿越時空成癮者', nextExp: 2500 }
  if (exp >= 500)  return { level: 4, title: '平行宇宙開拓家', nextExp: 1000 }
  if (exp >= 250)  return { level: 3, title: '主角光環的勇者', nextExp: 500  }
  if (exp >= 100)  return { level: 2, title: '不怕死的探險家', nextExp: 250  }
  return               { level: 1, title: '剛加入的冒險者', nextExp: 100  }
}

// 品牌主色（金色）
const GOLD = '#D4AF37'

// ── 組裝「冒險者名片」Flex Message ────────────────────────────────────────
// 觸發指令：!我的名片
// 顯示玩家名稱、等級稱號、EXP、參加場數、資歷天數、推坑人數、推薦碼
const buildCard = (user: Record<string, unknown>, stats: { games: number; days: number; disciples: number }) => {
  const exp      = (user.total_exp as number) || 0
  const info     = getLevelInfo(exp)
  const level    = (user.level as number) || info.level          // 優先用 DB 儲存的 level，沒有才用計算值
  const title    = (user.current_title as string) || info.title  // 優先用玩家選擇的稱號
  const accent   = GOLD
  const expPct   = Math.min(Math.round((exp / info.nextExp) * 100), 100) // EXP 進度百分比（上限 100%）
  const filled   = Math.max(expPct, 1)       // 進度條已填滿寬度（最小 1，避免 flex 為 0 報錯）
  const empty    = Math.max(100 - expPct, 1) // 進度條空白寬度
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
          // LV + 稱號 badge（金色膠囊）
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
          // 三欄數據：場冒險 / 天資歷 / 推坑人數
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
          // 推薦碼 + 「加入冒險」按鈕（點擊開啟 LIFF）
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

// ── 組裝「燈燈吉祥物」Flex Message ────────────────────────────────────────
// 觸發指令：!召喚
// 顯示角色底圖 + 依裝備順序疊加服裝圖層，底部顯示名稱與等級
const buildDollCard = (
  name: string,
  baseUrl: string,
  layers: { slot: string; url: string }[], // 已收集好的服裝圖層清單（含不裝備預設圖）
  level: number,
  title: string,
) => {
  // 服裝疊加順序（從後到前）：披風最底、表情最頂
  const SLOT_ORDER = ['cape', 'bottom', 'top', 'acc', 'hat', 'expr']
  const orderedLayers = SLOT_ORDER
    .map(slot => layers.find(l => l.slot === slot))
    .filter((l): l is { slot: string; url: string } => !!l)

  // 建立絕對定位的圖層 box，覆蓋在底圖上方
  // 每個服裝圖片都需要跟底圖一樣大小才能正確對齊
  const absLayer = (url: string) => ({
    type: 'box', layout: 'vertical',
    position: 'absolute', offsetTop: '0px', offsetStart: '0px',
    width: '100%', height: '100%',
    contents: [{ type: 'image', url, size: 'full', aspectRatio: '1:1', aspectMode: 'cover' }],
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
          // 右上角「加入冒險」按鈕
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
        // 角色底圖 + 服裝圖層疊加區
        type: 'box', layout: 'vertical', paddingAll: '0px',
        contents: [
          {
            type: 'box', layout: 'vertical', paddingAll: '0px',
            contents: [
              // 角色底圖（最底層）
              { type: 'image', url: baseUrl, size: 'full', aspectRatio: '1:1', aspectMode: 'cover' },
              // 服裝圖層（絕對定位，依序疊加在底圖上方）
              ...orderedLayers.map(l => absLayer(l.url)),
            ],
          },
        ],
      },
      footer: {
        // 玩家名稱 + 等級稱號
        type: 'box', layout: 'vertical', paddingAll: '10px', spacing: 'xs',
        contents: [
          { type: 'text', text: `✨ ${name} 的燈燈`, size: 'sm', color: '#ffffff', weight: 'bold', align: 'center' },
          { type: 'text', text: `LV.${level} ◆ ${title}`, size: 'xxs', color: GOLD, align: 'center', margin: 'xs' },
        ],
      },
    },
  }
}

// ── 組裝「群組規則」Flex Message ───────────────────────────────────────────
// 觸發時機：memberJoined 事件（有人加入群組）
// 從 group_settings 表讀取規則內容後組裝 Flex 回傳
const buildRulesCard = (rulesText: string) => ({
  type: 'flex',
  altText: '劇光燈群組規則',
  contents: {
    type: 'bubble',
    size: 'mega',
    styles: {
      header: { backgroundColor: '#080808' },
      body:   { backgroundColor: '#0d0d0d' },
      footer: { backgroundColor: '#080808' },
    },
    header: {
      type: 'box', layout: 'horizontal', paddingAll: '12px', alignItems: 'center',
      contents: [
        { type: 'text', text: 'SPOTLIGHT LARP', size: 'xs', color: GOLD, weight: 'bold', flex: 1 },
        {
          type: 'box', layout: 'vertical', flex: 0,
          backgroundColor: GOLD, cornerRadius: '20px',
          paddingTop: '4px', paddingBottom: '4px', paddingStart: '12px', paddingEnd: '12px',
          contents: [{ type: 'text', text: '群組規則', size: 'xs', color: '#080808', weight: 'bold' }],
        },
      ],
    },
    body: {
      type: 'box', layout: 'vertical', paddingAll: '16px',
      contents: [
        { type: 'text', text: rulesText || '歡迎加入劇光燈！', color: '#dddddd', size: 'sm', wrap: true },
      ],
    },
    footer: {
      type: 'box', layout: 'vertical', paddingAll: '12px',
      contents: [
        {
          type: 'box', layout: 'vertical',
          backgroundColor: GOLD, cornerRadius: '8px',
          paddingTop: '10px', paddingBottom: '10px',
          action: { type: 'uri', uri: LIFF_URL },
          contents: [{ type: 'text', text: '開始冒險 ⚔️', size: 'sm', color: '#080808', weight: 'bold', align: 'center' }],
        },
      ],
    },
  },
})

// ── LINE 回覆訊息 ──────────────────────────────────────────────────────────
// 使用 replyToken 回覆，每個 token 只能用一次且有時效限制
const lineReply = (replyToken: string, messages: unknown[]) =>
  fetch('https://api.line.me/v2/bot/message/reply', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${LINE_CHANNEL_TOKEN}` },
    body: JSON.stringify({ replyToken, messages }),
  })

// ── 事件處理 ───────────────────────────────────────────────────────────────
// 逐一處理 LINE 傳來的 events 陣列
// 只處理文字訊息（type=message, message.type=text）
// 非指令文字直接跳過，不做任何回應
const handleEvents = async (events: Record<string, unknown>[]) => {
  // 一次撈所有功能開關，減少 DB 請求次數
  const featureKeys = ['feature_rules', 'feature_tarot', 'feature_summon', 'feature_card']
  const featuresData = await dbGet(`group_settings?key=in.(${featureKeys.join(',')})&select=key,value`)
  const features: Record<string, boolean> = {}
  featureKeys.forEach(k => { features[k] = true }) // 預設全部開啟（DB 沒設定時維持原本行為）
  if (Array.isArray(featuresData)) {
    for (const row of featuresData as { key: string; value: string }[]) {
      features[row.key] = row.value === 'true'
    }
  }
  console.log('features:', features)

  for (const event of events) {
    console.log('event.type:', event.type)

    // ── 有人加入群組：發送群組規則 ─────────────────────────────────────────
    if (event.type === 'memberJoined') {
      if (!features['feature_rules']) {
        console.log('feature_rules is off, skip')
        continue
      }
      const replyToken = event.replyToken as string
      const settingsData = await dbGet('group_settings?key=eq.join_rules&limit=1')
      const rulesText = (settingsData?.[0]?.value as string) || '歡迎加入劇光燈！'
      const replyRes = await lineReply(replyToken, [buildRulesCard(rulesText)])
      console.log('memberJoined reply status:', replyRes.status, await replyRes.text())
      continue
    }

    if (event.type !== 'message') continue
    const msg = event.message as Record<string, unknown>
    console.log('msg.type:', msg?.type, '| text:', msg?.text)
    if (msg?.type !== 'text') continue

    const text = (msg.text as string).trim()
    console.log('text:', JSON.stringify(text))

    // 支援全形驚嘆號（！）與半形（!）
    const isCard   = text === '我的名片'
    const isMascot = text === '召喚'
    const isTarot  = text === '占卜'

    // 群組訊息且非指令 → 存進 group_messages
    const source = event.source as Record<string, unknown>
    if (source.type === 'group' && !isCard && !isMascot && !isTarot) {
      dbInsert('group_messages', {
        line_user_id: source.userId as string,
        group_id:     source.groupId as string,
        message:      text,
        sent_at:      new Date((event.timestamp as number)).toISOString(),
      })
    }

    if (!isCard && !isMascot && !isTarot) continue

    const lineUserId = (event.source as Record<string, unknown>).userId as string
    const replyToken = event.replyToken as string
    console.log('lineUserId:', lineUserId)

    // 查詢玩家資料（users 表的 id 就是 LINE userId）
    const users = await dbGet(`users?id=eq.${lineUserId}&limit=1`)
    const user = users?.[0]
    console.log('user found:', !!user)

    // 尚未加入的玩家：給提示訊息 + 快速回覆按鈕引導加入
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

    // ── 名片指令：回傳冒險者名片 ──────────────────────────────────────────
    if (isCard && !features['feature_card']) {
      console.log('feature_card is off, skip')
      continue
    }
    if (isCard) {
      // 並行查詢：遊戲次數 + 推薦人數（若無推薦碼則直接給 0）
      const [games, disciples] = await Promise.all([
        dbCount('game_participants', `user_id=eq.${lineUserId}`),
        user.my_referral_code
          ? dbCount('users', `referred_by=eq.${user.my_referral_code}`)
          : Promise.resolve(0),
      ])
      // 計算加入天數（從 created_at 到現在，無條件進位）
      const days = Math.ceil(
        Math.abs(Date.now() - new Date(user.created_at).getTime()) / 86_400_000
      )
      const replyRes = await lineReply(replyToken, [buildCard(user, { games, days, disciples })])
      console.log('lineReply status:', replyRes.status, await replyRes.text())
    }

    // ── 召喚指令：回傳燈燈吉祥物造型 ─────────────────────────────────────
    if (isMascot && !features['feature_summon']) {
      console.log('feature_summon is off, skip')
      continue
    }
    if (isMascot) {
      // 並行查詢：角色底圖、玩家裝備紀錄、各分類「不裝備」預設圖設定
      const [basesData, equippedData, noneDefaultsData] = await Promise.all([
        dbGet('wardrobe_bases?is_default=eq.true&is_active=eq.true&limit=1'),
        dbGet(`user_wardrobe_equipped?user_id=eq.${lineUserId}&limit=1`),
        dbGet('wardrobe_none_defaults?select=category,img_url'),
      ])

      // 找不到底圖時 fallback 到預設角色圖
      const baseUrl = basesData?.[0]?.img_url || 'https://meee.com.tw/hLmrwbm.png'
      // equippedMap 格式：{ hat: 'item-uuid', top: 'item-uuid', ... }
      // 未裝備的分類不會出現在 key 中（is_none 時不儲存）
      const equippedMap: Record<string, string> = equippedData?.[0]?.equipped || {}
      const itemIds = Object.values(equippedMap).filter(Boolean) // 過濾掉 null 值

      // 查詢已裝備道具的圖片 URL
      let layers: { slot: string; url: string }[] = []
      if (itemIds.length > 0) {
        const itemsData = await dbGet(
          `wardrobe_items?id=in.(${itemIds.join(',')})&select=id,category,img_url&is_active=eq.true`
        )
        layers = (itemsData || [])
          .filter((i: Record<string, unknown>) => i.img_url) // 只保留有圖片的道具
          .map((i: Record<string, unknown>) => ({
            slot: i.category as string,
            url:  i.img_url  as string,
          }))
      }

      // 補上「不裝備」預設圖層
      // 若某分類沒有裝備任何道具（不在 equippedMap 中），
      // 且後台 wardrobe_none_defaults 有設定預設圖，就補一層疊在角色上
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

    // ── 抽塔羅指令 ────────────────────────────────────────────────────────────
    if (isTarot && !features['feature_tarot']) {
      console.log('feature_tarot is off, skip')
      continue
    }
    if (isTarot) {
      // 並行撈牌庫 + bot 人格設定
      const [cardsData, settingsData] = await Promise.all([
        dbGet('tarot_cards?is_active=eq.true&select=name,image_url,image_url_reversed,meaning_upright,meaning_reversed'),
        dbGet('group_settings?key=in.(tarot_sender_name,tarot_sender_icon_url)&select=key,value'),
      ])

      if (!cardsData || cardsData.length === 0) {
        await lineReply(replyToken, [{ type: 'text', text: '命運的牌庫尚未建立，請稍候...' }])
        continue
      }

      // 隨機抽一張牌 + 隨機正/逆位
      const card      = cardsData[Math.floor(Math.random() * cardsData.length)]
      const reversed  = Math.random() < 0.5
      const meaning   = reversed ? card.meaning_reversed : card.meaning_upright
      const cardImage = reversed ? (card.image_url_reversed || card.image_url) : card.image_url
      const direction = reversed ? '逆位' : '正位'
      const dirColor  = reversed ? '#9b59b6' : '#D4AF37'

      // 讀取 sender 設定
      const nameRow = (settingsData || []).find((r: Record<string, string>) => r.key === 'tarot_sender_name')
      const iconRow = (settingsData || []).find((r: Record<string, string>) => r.key === 'tarot_sender_icon_url')
      const senderName = nameRow?.value || '命運女神'
      const senderIcon = iconRow?.value || ''

      const flexMsg: Record<string, unknown> = {
        type: 'flex',
        altText: `${card.name}（${direction}）— ${meaning?.slice(0, 30) || ''}`,
        sender: { name: senderName, ...(senderIcon ? { iconUrl: senderIcon } : {}) },
        contents: {
          type: 'bubble',
          size: 'kilo',
          styles: {
            header: { backgroundColor: '#0a0608' },
            body:   { backgroundColor: '#0d0a10' },
            footer: { backgroundColor: '#0a0608' },
          },
          header: {
            type: 'box', layout: 'horizontal', paddingAll: '12px', alignItems: 'center',
            contents: [
              { type: 'text', text: 'TAROT', size: 'xs', color: dirColor, weight: 'bold', flex: 1, letterSpacing: '3px' },
              {
                type: 'box', layout: 'vertical', flex: 0,
                backgroundColor: dirColor, cornerRadius: '10px',
                paddingTop: '3px', paddingBottom: '3px', paddingStart: '10px', paddingEnd: '10px',
                contents: [{ type: 'text', text: direction, size: 'xs', color: '#000', weight: 'bold' }],
              },
            ],
          },
          ...(cardImage ? {
            hero: {
              type: 'image',
              url: cardImage,
              size: 'full',
              aspectRatio: '2:3',
              aspectMode: 'cover',
            },
          } : {}),
          body: {
            type: 'box', layout: 'vertical', paddingAll: '16px', spacing: 'sm',
            contents: [
              { type: 'text', text: card.name, size: 'lg', color: dirColor, weight: 'bold', align: 'center' },
              { type: 'separator', color: '#2a2a2a', margin: 'md' },
              {
                type: 'text',
                text: meaning || '牌義尚未填寫',
                size: 'sm', color: '#cccccc', wrap: true, lineSpacing: '6px', margin: 'md',
              },
            ],
          },
          footer: {
            type: 'box', layout: 'vertical', paddingAll: '10px',
            contents: [
              { type: 'text', text: `由 ${senderName} 為你揭示`, size: 'xxs', color: '#444', align: 'center' },
            ],
          },
        },
      }

      const tarotRes = await lineReply(replyToken, [flexMsg])
      console.log('tarot reply status:', tarotRes.status, await tarotRes.text())
    }
  }
}

// ── 主 Handler ─────────────────────────────────────────────────────────────
// Supabase Edge Function 入口點
// 1. 只接受 POST（LINE Webhook 固定用 POST）
// 2. 驗證 LINE 簽名，防止偽造請求
// 3. 解析 events 並交給 handleEvents 處理
// 4. 立即回 200 OK（LINE 要求 30 秒內回應）
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
