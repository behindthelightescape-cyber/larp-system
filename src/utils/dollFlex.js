// 燈燈造型卡 Flex Message（造型室「分享」用）
// 版面和 supabase/functions/line-webhook/index.ts 的 buildDollCard（！召喚）一致，修改時兩邊一起改。
import { DOLL_BACK_LAYERS, DOLL_FRONT_LAYERS } from '../config/paperdoll'

const GOLD = '#D4AF37'
const LIFF_URL = 'https://liff.line.me/2009161687-icfQU9r6'
const SCENE_FRAME_URL = 'https://larp-system.vercel.app/flex/spacer-4x3.png' // 沒背景時撐出 4:3 場景的透明圖

// 過濾 email 格式的名稱，避免外流個資
const safeName = (n) => {
  const s = String(n || '').trim()
  return (!s || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) ? '冒險者' : s
}

/**
 * @param {object} p
 * @param {string} p.name      玩家名稱
 * @param {string} p.baseUrl   燈燈底圖
 * @param {Record<string,string>} p.layerUrls  {分類: 圖片網址}，只放有圖的分類
 * @param {number} p.level
 * @param {string} p.title
 * @param {string|null} p.bgUrl  場景背景（800×600）
 */
export const buildDollFlex = ({ name, baseUrl, layerUrls, level, title, bgUrl = null }) => {
  const displayName = safeName(name)
  const sceneLayer = (url) => ({
    type: 'box', layout: 'vertical',
    position: 'absolute', offsetBottom: '0px', offsetStart: '27%',
    width: '46%',
    contents: [{ type: 'image', url, size: 'full', aspectRatio: '2:3', aspectMode: 'cover' }],
  })
  const pick = (slots) => slots.map(s => layerUrls[s]).filter(Boolean).map(sceneLayer)

  const dollArea = [
    { type: 'image', url: bgUrl || SCENE_FRAME_URL, size: 'full', aspectRatio: '4:3', aspectMode: 'cover' },
    ...pick(DOLL_BACK_LAYERS),
    sceneLayer(baseUrl),
    ...pick(DOLL_FRONT_LAYERS),
  ]
  const scene = { type: 'box', layout: 'vertical', paddingAll: '0px', contents: dollArea }
  if (!bgUrl) scene.background = { type: 'linearGradient', angle: '170deg', startColor: '#0f0c05', centerColor: '#1a1507', endColor: '#0a0a0a' }

  return {
    type: 'flex',
    altText: `✨ ${displayName} 的燈燈登場！`,
    contents: {
      type: 'bubble',
      size: 'kilo',
      styles: {
        header: { backgroundColor: '#080808' },
        body:   { backgroundColor: '#080808' },
        footer: { backgroundColor: '#080808' },
      },
      header: {
        type: 'box', layout: 'horizontal', paddingAll: '8px', alignItems: 'center',
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
      body: { type: 'box', layout: 'vertical', paddingAll: '0px', contents: [scene] },
      footer: {
        type: 'box', layout: 'vertical', paddingAll: '10px', spacing: 'xs',
        contents: [
          { type: 'text', text: `✨ ${displayName} 的燈燈`, size: 'sm', color: '#ffffff', weight: 'bold', align: 'center' },
          { type: 'text', text: `LV.${level} ◆ ${title}`, size: 'xxs', color: GOLD, align: 'center', margin: 'xs' },
        ],
      },
    },
  }
}
