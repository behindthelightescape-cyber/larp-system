// 燈燈造型室目前只開放給以下帳號（users.id = LINE userId）測試。
// 要全面開放時：把首頁與 PaperDollView 的 canOpenPaperDoll 檢查拿掉即可。
export const PAPERDOLL_TESTERS = [
  'U65a94308551ccd456aca5e903d98cefd', // 喬 #00000002
]

export const canOpenPaperDoll = (userId) => PAPERDOLL_TESTERS.includes(userId)
