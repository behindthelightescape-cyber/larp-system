# 劇光燈 Spotlight LARP 系統 — 技術文件

> 最後更新：2026-03-08｜版本：Vue 3.5.25 + Supabase + Vite

---

## 目錄

1. [專案概述](#1-專案概述)
2. [技術棧](#2-技術棧)
3. [資料庫架構](#3-資料庫架構)
4. [前端架構](#4-前端架構)
5. [頁面詳細說明](#5-頁面詳細說明)
6. [Pinia Store（核心邏輯）](#6-pinia-store核心邏輯)
7. [元件清單](#7-元件清單)
8. [LINE Webhook Edge Function](#8-line-webhook-edge-function)
9. [核心業務邏輯](#9-核心業務邏輯)
10. [UI 設計系統](#10-ui-設計系統)
11. [環境設定](#11-環境設定)
12. [部署流程](#12-部署流程)
13. [常見錯誤排查](#13-常見錯誤排查)

---

## 1. 專案概述

**劇光燈 Spotlight** 是一個為 LARP（Live Action Role Playing）設計的玩家社群管理平台。整合 LINE 官方帳號登入、Supabase 資料庫與 Vue 3 前端，提供完整的玩家生命週期管理。

**核心特色：**
- LINE LIFF 單點登入（無帳密）
- 自動派發獎勵引擎（生日禮、升級禮、推坑分潤）
- 角色紙娃娃換裝系統
- 成就系統與條件判定
- 管理後台完整儀表板
- 互動電視展示裝置（掃碼登場動畫）

---

## 2. 技術棧

### 前端
| 套件 | 版本 | 用途 |
|------|------|------|
| Vue 3 | 3.5.25 | 主框架 |
| Vue Router | 5.0.2 | 頁面路由（Hash 模式） |
| Pinia | 3.0.4 | 全域狀態管理 |
| Vite | 8.0.0-beta.13 | 建置工具 |
| Lucide Vue Next | 0.570.0 | SVG 圖示 |
| QRCode.vue | 3.8.0 | QR Code 生成 |
| JSZip | 3.10.1 | ZIP 匯出 |
| @line/liff | 2.27.3 | LINE 官方 SDK |

### 後端
| 服務 | 用途 |
|------|------|
| Supabase PostgreSQL | 主資料庫 |
| Supabase REST API | 前端直接存取（PostgREST） |
| Supabase Auth | 管理後台登入 |
| Supabase Realtime | 電視展示裝置即時更新 |
| Supabase Edge Functions (Deno) | LINE Webhook 處理 |
| Supabase Storage | 圖片上傳存放 |

---

## 3. 資料庫架構

### 3.1 `users` — 玩家主表

| 欄位 | 類型 | 說明 |
|------|------|------|
| id | text (PK) | LINE userId |
| display_name | varchar | 顯示名稱 |
| picture_url | text | LINE 頭貼 URL |
| legacy_id | varchar | 8 位流水號（00000001） |
| level | int | 當前等級（1-6） |
| total_exp | int | 累積經驗值 |
| current_title | varchar | 玩家選擇的稱號 |
| phone | varchar | 電話 |
| birthday | date | 生日 |
| birthday_claimed_year | int | 已領取生日禮的年份（防重發） |
| referred_by | varchar | 推薦人的推薦碼 |
| my_referral_code | varchar | 自己的推薦碼 |
| role | varchar | `player` / `manager` / `admin` |
| managed_branch | varchar | 管轄分館（manager 用） |
| created_at | timestamp | 註冊時間 |

**等級門檻與稱號（全系統統一）：**
```
EXP >= 2500 → LV.6 陽光開朗小萌新
EXP >= 1000 → LV.5 穿越時空成癮者
EXP >= 500  → LV.4 平行宇宙開拓家
EXP >= 250  → LV.3 主角光環的勇者
EXP >= 100  → LV.2 不怕死的探險家
EXP < 100   → LV.1 剛加入的冒險者
```

> 稱號定義在 `stores/user.js` `getLevelInfo()`，webhook（LINE 名片）與前端一致。
> 玩家若有自選稱號（`current_title`），顯示時優先使用自選稱號。

---

### 3.2 `games` — 遊戲場次表

| 欄位 | 類型 | 說明 |
|------|------|------|
| id | uuid (PK) | |
| script_id | uuid (FK) | 關聯劇本 |
| gm_name | varchar | 帶場 GM |
| play_time | timestamp | 遊玩時間 |
| branch_name | varchar | 場館名稱 |
| base_exp | int | 基礎經驗值 |
| status | varchar | `open` / `closed` / `finished` |
| story_memory | text | GM 劇本手札 |

---

### 3.3 `game_participants` — 玩家參與紀錄

| 欄位 | 類型 | 說明 |
|------|------|------|
| id | uuid (PK) | |
| game_id | uuid (FK) | |
| user_id | text (FK) | |
| exp_gained | int | 本場獲得 EXP |
| character_name | varchar | 扮演角色名 |
| comment | text | GM 備註 |

---

### 3.4 `coupons` — 票券表

| 欄位 | 類型 | 說明 |
|------|------|------|
| id | uuid (PK) | |
| user_id | text (FK) | |
| title | varchar | 票券名稱 |
| description | text | 使用說明 |
| status | varchar | `available` / `used` / `expired` |
| expiry_date | timestamp | 有效期限 |
| used_at | timestamp | 核銷時間 |

**自動派發觸發點：**
- `profile_complete`：首次完善個人資料（填生日）
- `level_up`：升級（含跳級多重派發）
- `birthday`：生日月份登入 App
- `referral_newbie`：推薦新手首場參賽
- `referral_veteran`：被推薦人完成首場，老手獲獎

---

### 3.5 `system_rewards` — 自動派發規則表

| 欄位 | 類型 | 說明 |
|------|------|------|
| id | uuid (PK) | |
| event_type | varchar | 事件類型 |
| condition_value | int/jsonb | 條件值（如 level=2） |
| reward_title | varchar | 派發的票券標題 |
| reward_desc | text | 票券說明 |
| valid_days | int | 效期天數（預設 30） |
| reward_qty | int | 派發張數 |
| is_active | boolean | 是否啟用 |

---

### 3.6 `scripts` — 劇本表

| 欄位 | 類型 | 說明 |
|------|------|------|
| id | uuid (PK) | |
| title | varchar | 劇本名稱 |
| description | text | 簡介 |
| cover_url | text | 封面圖 URL |
| tags | text | 標籤，逗號分隔（如：`冒險,推理`） |

---

### 3.7 `achievements` — 成就表

| 欄位 | 類型 | 說明 |
|------|------|------|
| id | uuid (PK) | |
| title | varchar | 成就名稱（同時是稱號） |
| description | text | 說明 |
| condition_type | varchar | `tag` / `script` |
| condition_value | jsonb | 條件詳細（見下方） |
| status | varchar | `active` / `ended` |

**condition_value 格式：**
```json
// Tag 型：玩過 N 場特定標籤的劇本
{ "tag": "冒險", "count": 3 }

// Script 型：玩過指定劇本清單中的所有劇本
{ "script_ids": ["uuid1", "uuid2", "uuid3"] }
```

---

### 3.8 `user_achievements` — 玩家成就達成記錄

| 欄位 | 類型 | 說明 |
|------|------|------|
| user_id | text | |
| achievement_id | uuid | |
| unlocked_at | timestamp | 解鎖時間 |

UNIQUE 約束：`(user_id, achievement_id)`

---

### 3.9 紙娃娃相關表

#### `wardrobe_bases` — 角色底圖
| 欄位 | 說明 |
|------|------|
| id | uuid |
| name | 名稱 |
| img_url | 底圖 URL |
| is_default | 是否為預設底圖 |
| is_active | 是否啟用 |
| sort_order | 排序 |

#### `wardrobe_items` — 服裝道具
| 欄位 | 說明 |
|------|------|
| id | uuid |
| category | `expr` / `hat` / `top` / `cape` / `bottom` / `acc` |
| name | 名稱 |
| img_url | 圖片 URL |
| emoji | 備用 emoji（無圖時顯示） |
| unlock_type | `free` / `points` / `script` / `achievement` |
| unlock_cost | 購買花費（pt） |
| is_active | 是否啟用 |
| sort_order | 排序 |

#### `wardrobe_backgrounds` — 舞台背景
與 `wardrobe_items` 結構相似，增加背景圖片管理。

#### `user_wardrobe` — 玩家擁有道具
```
user_id + item_id → 玩家已解鎖的道具 ID 清單
```

#### `user_wardrobe_equipped` — 玩家目前裝備
```json
{
  "user_id": "U123",
  "equipped": { "expr": "item-uuid", "hat": "item-uuid", ... },
  "background_id": "bg-uuid"
}
```

#### `wardrobe_none_defaults` — 「不裝備」預設圖層
| 欄位 | 說明 |
|------|------|
| category | 分類（PK） |
| img_url | 不裝備時疊加的預設圖片 |

> 用途：例如帽子選「不戴」時，仍在角色上疊加一張「無帽底圖」，維持視覺完整性。後台「🎭 預設圖」Tab 可設定。

---

### 3.10 其他資料表

| 表名 | 說明 |
|------|------|
| `display_sessions` | 電視展示裝置的 Session（掃碼觸發登場動畫） |
| `display_ads` | 電視廣告輪播內容（標題、描述、圖片） |
| `promo_codes` | 兌換碼（可連結到 system_rewards 派發） |
| `push_logs` | 自動派發歷程記錄 |
| `user_wardrobe_backgrounds` | 玩家已解鎖的背景清單 |

---

## 4. 前端架構

### 4.1 目錄結構

```
src/
├── main.js                      # 應用入口（Pinia + Router 掛載）
├── App.vue                      # 根元件（背景特效、全域 Loading）
├── supabase.js                  # Supabase 客戶端初始化
├── style.css                    # 全域樣式重置
│
├── router/
│   └── index.js                 # 路由配置（Hash 模式）
│
├── stores/
│   └── user.js                  # Pinia Store（核心狀態 + 所有業務邏輯）
│
├── views/                       # 頁面元件
│   ├── HomeView.vue             # 首頁
│   ├── HistoryView.vue          # 冒險回憶
│   ├── CouponView.vue           # 票券匣
│   ├── SettingsView.vue         # 個人設定
│   ├── AchievementsView.vue     # 成就系統
│   ├── PaperDollView.vue        # 燈燈造型室（換裝）
│   ├── AdminView.vue            # 管理後台
│   └── display/
│       ├── DisplayView.vue      # 互動電視展示
│       └── ScanView.vue         # 掃碼簽到
│
└── components/                  # 可重用元件
    ├── BottomNav.vue            # 底欄導航
    ├── HistoryCard.vue          # 遊戲紀錄卡片詳情
    ├── ReferralTreeModal.vue    # 推薦族譜彈窗
    ├── TreeNode.vue             # 族譜節點（遞迴）
    ├── MemberManager.vue        # 後台：會員管理
    ├── CouponManager.vue        # 後台：票券發送
    ├── GameManager.vue          # 後台：場次管理
    ├── ScriptManager.vue        # 後台：劇本管理
    ├── SessionManager.vue       # 後台：掃碼簽到管理
    ├── DataImporter.vue         # 後台：批量資料匯入
    ├── AnalyticsManager.vue     # 後台：數據分析
    ├── AdminAchievements.vue    # 後台：成就管理
    ├── AdminAutoRewards.vue     # 後台：自動派發規則
    ├── AdminPromoCodes.vue      # 後台：兌換碼管理
    ├── AdminPushLogs.vue        # 後台：派發日誌
    ├── AdminDisplayAds.vue      # 後台：電視廣告管理
    └── AdminPaperDoll.vue       # 後台：造型室管理
```

---

### 4.2 路由配置

| 路徑 | 元件 | 用途 | 底欄 |
|------|------|------|------|
| `/` | HomeView | 玩家首頁 | 顯示 |
| `/history` | HistoryView | 遊戲紀錄 | 顯示 |
| `/achievements` | AchievementsView | 成就清單 | 顯示 |
| `/coupons` | CouponView | 票券匣 | 顯示 |
| `/settings` | SettingsView | 個人設定 | 顯示 |
| `/paperdoll` | PaperDollView | 換裝造型室 | 顯示 |
| `/admin` | AdminView | 管理後台 | 隱藏 |
| `/display` | DisplayView | 互動電視 | 隱藏 |
| `/scan` | ScanView | 掃碼簽到 | 隱藏 |

> **注意：** 使用 Hash 模式（`createWebHashHistory`），所有路由以 `#` 開頭，適合 LIFF 環境。
> `/admin`、`/paperdoll`、`/display` 路徑可繞過 LINE LIFF 驗證直接存取。

---

### 4.3 App.vue — 根元件

**責任：**
- 全域背景特效（漸層、棋格紋、噪點、浮塵動畫）
- 全域 Loading 畫面（旋轉圈 + 文字）
- 頁面路由過場動畫（opacity fade-out-in）
- 底欄導航顯示控制

**LIFF 初始化判斷：**
```javascript
// /admin、/paperdoll、/display 路徑跳過 LIFF
if (window.location.hash.includes('#/admin') || ...) {
  userStore.isLoading = false
  return
}
// 開發模式跳過
if (import.meta.env.DEV) { ... }
// 正常流程
userStore.initLiff()
```

---

## 5. 頁面詳細說明

### 5.1 HomeView.vue — 首頁

**功能：**
- 顯示玩家資料卡（頭貼、等級、稱號）
- EXP 進度條（含下一級所需）
- 紙娃娃角色展示（點擊進入換裝）
- 統計數據（參賽場數、入會天數、推薦人數）
- 稱號選擇彈窗（可選等級稱號或成就稱號）
- 宗門弟子族譜入口（ReferralTreeModal）

**資料流：**
```
onMounted
├── loadDollData()      → wardrobe_bases + user_wardrobe_equipped + wardrobe_items
├── store.userData      → EXP、等級、稱號、頭貼
└── store.history       → 場數統計
```

---

### 5.2 PaperDollView.vue — 燈燈造型室

**功能：**
- 角色舞台：底圖 + 6 個服裝分類圖層疊加
- 分類 Tab 切換（表情、帽子、上衣、披風、下身、配件）
- 換背景彈窗（含「無背景」選項）
- 道具格子：縮圖 + 名稱 + 狀態標籤（領取/購買/已選）
- 道具鎖定詳情彈窗（取得方式說明）

**圖層疊加順序（從後到前）：**
```
cape → bottom → top → acc → hat → expr
```

**道具狀態判定（getItemState）：**
| 狀態 | 顯示 | 條件 |
|------|------|------|
| `owned` | 可選擇 | 已在 ownedItemIds 中，或 free |
| `claimable` | 領取 | 成就/劇本解鎖，且已達成條件 |
| `purchasable` | N pt | unlock_type=points 且未擁有 |
| `locked` | 🔒 | 尚未達成取得條件 |

**資料庫同步：**
```javascript
// 裝備儲存（is_none 時不存入 equippedMap）
user_wardrobe_equipped.upsert({
  equipped: { hat: 'item-uuid', ... },
  background_id: 'bg-uuid'
})
```

---

### 5.3 HistoryView.vue — 冒險回憶

**功能：**
- 列出所有遊戲參與記錄（倒序）
- 卡片顯示：劇本封面、名稱、日期、GM、EXP
- 點擊卡片開啟詳情彈窗（HistoryCard）

**查詢語法（Supabase 多層 join）：**
```sql
SELECT id, exp_gained, created_at, character_name, comment,
       games (gm_name, play_time, story_memory, branch_name, base_exp,
              scripts (title, cover_url))
FROM game_participants
WHERE user_id = ?
ORDER BY created_at DESC
```

**智能標題補全邏輯（若 DB 標題為空）：**
```
DB 標題有效 → 使用 DB 標題
DB 標題空   → 使用 story_memory 前幾字
兩者都空   → 顯示 '⚠️ 完全沒資料'
```

---

### 5.4 CouponView.vue — 票券匣

**功能：**
- 列出所有票券（可用優先排序）
- 核銷流程：確認彈窗 → UPDATE status='used'
- 票券詳情彈窗（效期、說明、流水號）

---

### 5.5 AchievementsView.vue — 成就系統

**功能：**
- 列出所有成就（進行中、可領取、已結束）
- 每個成就顯示進度條
- 點擊未解鎖成就顯示取得條件
- 一鍵領取（INSERT user_achievements）

**進度計算：**
```javascript
// Tag 型：查詢有該 tag 的劇本，數玩家參與次數
const matchedGames = history.filter(h => h.script?.tags?.includes(tag))
currentProgress = matchedGames.length

// Script 型：查玩家玩過的 script_id 集合，取交集
const playedIds = new Set(history.map(h => h.script_id))
currentProgress = script_ids.filter(id => playedIds.has(id)).length
```

---

### 5.6 AdminView.vue — 管理後台

**認證：** Supabase Auth Email + 密碼

**側邊欄模組：**

| 分組 | 模組 | 功能 |
|------|------|------|
| 縱覽 | 戰情大盤 | 統計卡（玩家數、場次、票券） |
| 縱覽 | 深度分析 | 圖表、轉換漏斗 |
| 場次 | 場次管理 | QR 掃碼簽到，批次加場 |
| 場次 | 遊戲開場 | 建立 games 場次 |
| 玩家 | 會員查詢 | 搜尋 + 編輯玩家資料 |
| 玩家 | 票券發送 | 手動派發票券 |
| 玩家 | 兌換碼 | 建立 promo_codes |
| 自動化 | 自動派發 | CRUD system_rewards 規則 |
| 自動化 | 派發日誌 | 查看推播記錄 |
| 展示 | 電視廣告 | 管理 display_ads 輪播 |
| 內容 | 劇本管理 | CRUD scripts |
| 內容 | 成就鑄造 | CRUD achievements |
| 內容 | 燈燈造型室 | 管理道具、背景、底圖、預設圖 |

---

### 5.7 DisplayView.vue — 互動電視展示

**功能：**
- 輪播廣告畫面（display_ads）
- 玩家掃碼後觸發「登場動畫」
- 顯示玩家資料卡（等級、EXP、道具）
- 數字計數動畫、BGM 淡入淡出

**掃碼觸發機制：**
```javascript
// 雙保險：Supabase Realtime 訂閱 + 2.5秒 polling
subscribeSession()  // postgres_changes on display_sessions
startPolling()      // setInterval 2500ms fallback

// 防止競態條件
let _showLock = false
const startShow = async (playerData) => {
  if (_showLock || phase === 'show') return
  _showLock = true
  // ... 執行動畫邏輯
  _showLock = false
}
```

---

### 5.8 ScanView.vue — 掃碼簽到

**功能：**
- 顯示玩家專屬 QR Code（含 gameId + userId）
- 掃碼後寫入 `display_sessions`，觸發電視展示動畫

---

## 6. Pinia Store（核心邏輯）

**檔案：** `src/stores/user.js`

### 6.1 狀態（State）

```javascript
const lineProfile    = ref(null)   // LINE 個人資料（displayName, pictureUrl）
const userData       = ref(null)   // Supabase users 表資料
const isLoggedIn     = ref(false)
const isLoading      = ref(true)   // 全域 Loading 旗標

const history        = ref([])     // 遊戲紀錄
const coupons        = ref([])     // 玩家票券
const daysJoined     = ref(0)      // 入會天數
```

---

### 6.2 initLiff() — 應用程式入口

```
1. liff.init({ liffId })
2. 未登入 → liff.login() 跳轉
3. 取得 LINE profile
4. checkAndRegisterUser()
5. 等級修正（DB level ≠ 計算值時同步）
6. fetchUserExtraData()
7. 生日攔截器
8. URL 帶 game_id 參數 → 自動加入遊戲
```

---

### 6.3 checkAndRegisterUser() — 登入與自動建檔

```
查詢 users WHERE id = lineUserId
├── 找到 → 載入資料
└── 找不到 → 建立新玩家
    ├── 查詢最大 legacy_id + 1（補零至 8 位）
    └── INSERT users (id, display_name, picture_url, legacy_id, level=1, total_exp=0)
```

---

### 6.4 joinGame(gameId) — 加入遊戲

```
1. 查詢 games（確認 status='open'）
2. 查詢 game_participants（確認未重複加入）
3. 計算新 EXP 與新等級
4. INSERT game_participants
5. UPDATE users (total_exp, level)
6. 觸發：推坑獎勵（首場）、升級大禮包（含跳級）
7. fetchUserExtraData() 刷新本地資料
```

---

### 6.5 grantSystemRewards() — 自動派發引擎

```javascript
grantSystemRewards(targetUserId, eventType, conditionValue, customExpiryDate)
```

```
1. 查詢 system_rewards（event_type=? AND condition_value=? AND is_active=true）
2. 對每條規則迴圈 reward_qty 次
3. 計算效期（custom 優先，否則 now + valid_days）
4. INSERT coupons (title, description, status='available', expiry_date)
5. 回傳派發的票券標題清單
```

---

### 6.6 生日禮物機制

```
1. 取得玩家 birthday 月份
2. 檢查當月或下月是否為生日月
3. 檢查 birthday_claimed_year 防重複
4. 計算生日月末：new Date(year, bMonth, 0, 23, 59, 59)
5. grantSystemRewards(userId, 'birthday', null, 月底日期)
6. UPDATE users SET birthday_claimed_year = claimYear
```

---

### 6.7 升級跳級支援

```javascript
// 範例：EXP 從 80 → 600（跳過 LV2、LV3，直升 LV4）
for (let lvl = oldLevel + 1; lvl <= newLevel; lvl++) {
  await grantSystemRewards(userId, 'level_up', lvl)
  // 會分別派發 LV2、LV3、LV4 的升級禮包
}
```

---

## 7. 元件清單

### 公開元件

| 元件 | 功能 |
|------|------|
| `BottomNav.vue` | 底欄導航（首頁/歷史/成就/票券/設定） |
| `HistoryCard.vue` | 遊戲紀錄卡片詳情彈窗（完整資訊 + 手札） |
| `ReferralTreeModal.vue` | 推薦族譜彈窗（遞迴樹狀結構） |
| `TreeNode.vue` | 族譜節點（可遞迴展開） |

### 管理後台元件

| 元件 | 功能 |
|------|------|
| `MemberManager.vue` | 玩家搜尋、編輯、手動調整 EXP/等級 |
| `CouponManager.vue` | 手動發券、核銷管理 |
| `GameManager.vue` | 場次批量建立 |
| `SessionManager.vue` | 場次簽到管理（QR Code 生成） |
| `ScriptManager.vue` | 劇本 CRUD（含圖片上傳） |
| `DataImporter.vue` | JSON 批量資料匯入 |
| `AnalyticsManager.vue` | 圖表統計分析 |
| `AdminAchievements.vue` | 成就建立（條件配置） |
| `AdminAutoRewards.vue` | 自動派發規則 CRUD |
| `AdminPromoCodes.vue` | 兌換碼管理 |
| `AdminPushLogs.vue` | 派發日誌查詢 |
| `AdminDisplayAds.vue` | 電視廣告輪播管理 |
| `AdminPaperDoll.vue` | 服裝道具、背景、底圖、預設圖管理 |

### AdminPaperDoll.vue — 主 Tab 說明

| Tab | 功能 |
|-----|------|
| 👗 服裝道具 | CRUD wardrobe_items（含圖片上傳） |
| 🖼 場景背景 | CRUD wardrobe_backgrounds |
| 🧍 角色底圖 | CRUD wardrobe_bases（設定預設底圖） |
| 🎭 預設圖 | 設定各分類「不裝備」時的疊加預設圖（wardrobe_none_defaults） |

---

## 8. LINE Webhook Edge Function

**檔案：** `supabase/functions/line-webhook/index.ts`
**Runtime：** Deno（Supabase Edge Functions）

### 8.1 支援指令

| 指令 | 說明 |
|------|------|
| `!我的名片` / `！我的名片` | 回傳冒險者名片 Flex Message |
| `!召喚` / `！召喚` | 回傳燈燈吉祥物造型 Flex Message |

### 8.2 名片內容

- 玩家名稱 + EXP
- LV + 稱號 badge
- 三欄數據：場冒險 / 天資歷 / 推坑人數
- 推薦碼 + 加入冒險按鈕（LIFF URL）

### 8.3 吉祥物內容

- 角色底圖（wardrobe_bases）
- 玩家已裝備道具圖層（wardrobe_items，依 SLOT_ORDER 疊加）
- 未裝備分類補上預設圖（wardrobe_none_defaults）
- 頁腳：玩家名稱 + 等級稱號

### 8.4 圖層疊加順序

```
cape → bottom → top → acc → hat → expr（最上層）
```

### 8.5 安全機制

```typescript
// HMAC-SHA256 簽名驗證
const key = await crypto.subtle.importKey('raw', encode(LINE_CHANNEL_SECRET), ...)
const sig = await crypto.subtle.sign('HMAC', key, encode(body))
const expected = btoa(String.fromCharCode(...new Uint8Array(sig)))
// 比對 x-line-signature header
```

### 8.6 環境變數

| 變數名 | 說明 |
|--------|------|
| `LINE_CHANNEL_SECRET` | LINE Bot Channel Secret（簽名驗證） |
| `LINE_CHANNEL_TOKEN` | LINE Bot Channel Access Token（回覆訊息） |
| `SUPABASE_URL` | Supabase 專案 URL |
| `SUPABASE_SERVICE_ROLE_KEY` | 完整 DB 讀寫（跳過 RLS） |

### 8.7 部署

```bash
npx supabase functions deploy line-webhook --no-verify-jwt --project-ref cqbiozfappfwfcahtxfm
```

---

## 9. 核心業務邏輯

### 9.1 新玩家完整流程

```
LINE 掃 LIFF 網址
  → 授權 LINE 個人資料
  → initLiff()
  → 查詢 users（無資料）
  → 自動建檔（legacy_id 流水號）
  → 填寫生日 → 派發「資料完善禮」
  → 掃 QR Code 加入首場遊戲
  → 升級（LV1→LV2）→ 派發「升級大禮包」
  → 推薦人獲得「推坑獎勵」
```

### 9.2 掃碼簽到電視動畫流程

```
玩家（ScanView）掃 Session QR Code
  → 寫入 display_sessions (player_data: {...})
  → DisplayView 偵測（Realtime 或 polling）
  → startShow(playerData)
  → 載入玩家道具圖層（loadDollForUser）
  → 登場動畫 + BGM 淡入
  → 多頁輪播（名片、道具展示...）
  → 動畫結束 → 產生新 Session → 繼續等待下一位
```

### 9.3 成就解鎖流程

```
AchievementsView 載入
  → 查詢所有成就 + 玩家遊戲歷史
  → 計算每個成就的 currentProgress
  → currentProgress >= target → canClaim = true
  → 點擊「領取」→ INSERT user_achievements
  → 成就名稱可作為稱號使用（HomeView 稱號選擇）
```

---

## 10. UI 設計系統

### 10.1 色彩

| 用途 | 顏色 |
|------|------|
| 品牌主色 | `#D4AF37`（金色） |
| 主背景 | `#000000` / `#0a0a0a` |
| 卡片背景 | `#111111` / `#161616` |
| 邊框 | `#222222` / `#333333` |
| 主文字 | `#ffffff` |
| 次要文字 | `#888888` / `#555555` |

### 10.2 動畫

| 效果 | 用途 | 時長 |
|------|------|------|
| fade-in-up | 卡片進場（由下往上） | 0.8s |
| fade-in-down | Header 進場（由上往下） | 0.8s |
| slide-up | 彈窗滑入 | 0.35s |
| pop | 元素彈出 | 0.3s |
| spin | Loading 旋轉 | 1s ∞ |
| shimmer | EXP 條光澤 | 2s ∞ |
| floatDust | 背景浮塵 | 40s ∞ |

### 10.3 響應式斷點

| 斷點 | 說明 |
|------|------|
| `< 360px` | 極小手機，縮小字體與圖片 |
| `< 480px` | 一般手機，單欄佈局 |
| `>= 600px` | 大手機/小平板，放大圖片 |
| `>= 768px` | 平板/桌機，兩欄佈局（造型室） |

### 10.4 背景特效層次

```
fixed-background（fixed，z-index: -1）
├── gradient-layer   金色頂部放射漸層
├── pattern-layer    菱格紋圖樣（overlay blend）
├── noise-layer      SVG 噪點（opacity 0.07）
└── dust-layer       浮動光點動畫
```

---

## 11. 環境設定

### 11.1 Supabase 連線

```javascript
// src/supabase.js
const supabaseUrl = 'https://cqbiozfappfwfcahtxfm.supabase.co'
const supabaseKey = 'sb_publishable_...'  // 匿名公開 Key
```

### 11.2 LINE LIFF

```
LIFF ID：2009161687-icfQU9r6
LIFF URL：https://liff.line.me/2009161687-icfQU9r6
```

### 11.3 開發環境

```bash
# 安裝依賴
npm install

# 啟動開發伺服器（自動跳過 LIFF 驗證）
npm run dev

# 生產編譯
npm run build
```

> 開發模式下，`import.meta.env.DEV === true`，App.vue 會自動跳過 LIFF 初始化，直接進入畫面。

---

## 12. 部署流程

### 12.1 前端

```bash
npm run build
# 產物在 dist/ 目錄
# 上傳至靜態主機（Vercel / Netlify / GitHub Pages）
```

Vite 設定了程式碼分割：
- `liff`：@line/liff SDK
- `vendor`：其他第三方套件
- `browser`：主應用程式

### 12.2 Edge Function

```bash
# 部署 LINE Webhook
npx supabase functions deploy line-webhook \
  --no-verify-jwt \
  --project-ref cqbiozfappfwfcahtxfm

# Secrets 在 Supabase Dashboard > Edge Functions > line-webhook > Secrets 設定
```

### 12.3 資料庫

1. 在 Supabase SQL Editor 執行建表 SQL
2. 設定 RLS（Row Level Security）
3. 執行 `node import.js` 匯入初始資料

**wardrobe_none_defaults 初始化：**
```sql
CREATE TABLE wardrobe_none_defaults (
  category text PRIMARY KEY,
  img_url   text
);

-- 帽子預設圖
INSERT INTO wardrobe_none_defaults (category, img_url)
VALUES ('hat', 'https://meee.com.tw/9huQORM.png');
```

---

## 13. 常見錯誤排查

| 問題 | 可能原因 | 解決方式 |
|------|---------|---------|
| 登入後白畫面 | LIFF 初始化失敗 | 確認 LIFF ID、LINE 登入狀態 |
| 票券不顯示 | RLS 規則阻擋 | 確認 `auth.uid() = user_id` 設定 |
| 自動派發不觸發 | 無匹配規則或 is_active=false | 後台「自動派發」Tab 確認規則 |
| 生日禮物沒派 | birthday 欄位為 null | 玩家需先填寫生日 |
| 掃碼動畫不觸發 | Realtime 未啟用 | polling 機制應自動接手（2.5 秒） |
| 道具不顯示 | img_url vs img 欄位名稱錯誤 | 確認使用 `.img_url` |
| LINE 名片 401 | Channel Secret 不符 | 確認 Supabase Secret 設定 |
| 換裝存不了 | user_wardrobe_equipped upsert 失敗 | 確認 onConflict: 'user_id' |
