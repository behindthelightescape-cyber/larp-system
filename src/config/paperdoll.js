// 燈燈造型室目前只開放給以下帳號（users.id = LINE userId）測試。
// 要全面開放時：把首頁與 PaperDollView 的 canOpenPaperDoll 檢查拿掉即可。
export const PAPERDOLL_TESTERS = [
  'U65a94308551ccd456aca5e903d98cefd', // 喬 #00000002
]

export const canOpenPaperDoll = (userId) => PAPERDOLL_TESTERS.includes(userId)

// ── 服裝分類（造型室、後台共用）──
// 修改時 supabase/functions/line-webhook/index.ts 的 SLOT_ORDER 也要一起改（Edge Function 無法 import 這裡）。
export const WARDROBE_CATEGORIES = [
  { key: 'expr',   label: '表情' },
  { key: 'hat',    label: '帽子' },
  { key: 'top',    label: '上衣' },
  { key: 'cape',   label: '披風' },
  { key: 'bottom', label: '下身' },
  { key: 'face',   label: '臉飾' }, // 眼鏡、面具
  { key: 'hand',   label: '手持' }, // 魔杖、武器
]

// 圖層順序（從後到前）。披風畫在底圖「後面」，其餘畫在底圖前面。
export const DOLL_BACK_LAYERS = ['cape']
export const DOLL_FRONT_LAYERS = ['bottom', 'top', 'hand', 'hat', 'expr', 'face']
