# 劇光燈 LARP 系統 — 開發指南

## 系統架構

| 層級 | 技術 |
|---|---|
| 前端 | Vue 3 + Vite + Pinia（Hash Router） |
| 後端 | Supabase（PostgreSQL + PostgREST + Edge Functions） |
| 認證 | LINE LIFF → auth-line Edge Function → Supabase Auth |
| 部署 | Vercel（前端）+ Supabase（後端 + Edge Functions） |

---

## 認證流程

```
用戶開啟 LINE App
  → LIFF 初始化（liff.init）
  → liff.getProfile() 取得 LINE profile
  → 呼叫 auth-line Edge Function（帶 LINE access token）
      → Edge Function 驗證 LINE token
      → 在 auth.users 建立 / 找到對應帳號（email: line_U...@line.invalid）
        ⚠️ 若帳號已存在，createUser 失敗但 message 含 "already" → 靜默忽略
        ⚠️ 已存在帳號的 user_metadata 不會被更新，原始 line_user_id 保留
      → 回傳 token_hash
  → supabase.auth.verifyOtp({ token_hash, type: 'magiclink' })
      → 設定 authenticated session（存 localStorage）
  → checkAndRegisterUser：查 users 表 / 首次訪問則 INSERT
  → loadPrivateProfile：透過 my-profile Edge Function 讀取私人資料
```

### 重要設定

```javascript
// src/supabase.js
export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: true, autoRefreshToken: false },
})
```

- `persistSession: true`：session 存 localStorage，admin 重整頁面後不需重新登入
- `autoRefreshToken: false`：不自動更新 token（LIFF 每次開啟都重新認證）

---

## 資料庫安全（RLS 政策）

> **核心原則：用戶只能讀寫自己的資料，admin（`line_user_id IS NULL`）可存取全部**

### `users` 表

| Policy | 操作 | 條件 |
|---|---|---|
| `users_select_auth` | SELECT | `jwt.line_user_id = id` OR `jwt.line_user_id IS NULL`（admin）|
| `users_insert_self` | INSERT | `jwt.line_user_id = id` |
| `users_update_auth` | UPDATE | `jwt.line_user_id = id` OR `jwt.line_user_id IS NULL`（admin）|

> ⚠️ **注意：** `phone`、`email` 欄位仍在 `users` 表（`birthday` 已 DROP）。已遷移至 `users_private`，但欄位尚未清除。

### Admin 帳號識別

Admin 以 email/password 登入，其 `users.id` **必須與 Supabase auth UUID 一致**，`fetchAdminProfile` 用 `session.user.id` 查詢：

```
auth.users.id == users.id（admin/manager 帳號的要求）
```

若不一致（如老舊手動建立的帳號），需執行：

```sql
-- 查出 auth UUID
SELECT id FROM auth.users WHERE email = '管理員email@gmail.com';

-- 更新 users.id（確認無 FK 參照後）
UPDATE users SET id = 'auth-uuid-here' WHERE display_name = '管理員名稱';
```

### `users_private` 表

敏感欄位（phone、email、birthday）存放處。

| 存取方式 | 說明 |
|---|---|
| 一般用戶 | 只能透過 `my-profile` Edge Function（帶 LINE token）讀寫 |
| Admin 後台 | `private_admin_all` 政策允許 `line_user_id IS NULL` 直接存取 |

### `coupons` 表

| Policy | 操作 | 條件 |
|---|---|---|
| `coupons_select_auth` | SELECT | `jwt.line_user_id = user_id` OR admin |
| `coupons_insert_auth` | INSERT | `true` |
| `coupons_update_own` | UPDATE | `jwt.line_user_id = user_id`（用戶自行核銷）|
| `coupons_update_admin` | UPDATE | admin（`line_user_id IS NULL`，可作廢任何票券）|
| `coupons_delete_auth` | DELETE | `jwt.line_user_id = user_id` OR admin |

> 用戶核銷走 `redeem_my_coupon` RPC（不直接 UPDATE），防止玩家自行把 `used` 改回 `available`。

### RLS 未啟用的表（完全開放）

`game_participants`、`games`、`scripts`、`achievements` 等無 RLS，PostgREST 開放存取。

---

## RPC 函數（SECURITY DEFINER）

繞過 RLS、以 DB owner 身份執行，**不可讓一般用戶取得超出自身範圍的資料**。

### `get_user_by_referral_code(p_code text)`

查詢任意用戶的推薦碼（只回傳 id、display_name、referred_by）。  
**用途：** `joinGame` 和 `bindFriendCode` 中查詢推薦人，繞過 `users_select_auth`。

### `sync_my_exp()`

從 `game_participants` 重新計算 `total_exp` 並更新 `users` 表。  
**用途：** 自動修復 `joinGame` 中 `users.update()` 無聲失敗導致的 exp 偏差。

- 從 JWT 取 `line_user_id`，只能修復自己的 exp（非 LINE 用戶會 EXCEPTION）
- 只在計算值 > 現有值時才 UPDATE（不會覆蓋管理員手動加的 exp）
- 由 `fetchUserExtraData` 每次登入後自動比對，偏差時呼叫

```javascript
// stores/user.js — fetchUserExtraData 內的自動修復邏輯
const gpSum = historyData.reduce((sum, item) => sum + (item.exp_gained || 0), 0)
if (gpSum > (userData.value?.total_exp || 0)) {
  const { data: syncData } = await supabase.rpc('sync_my_exp')
  if (syncData?.[0]) {
    userData.value.total_exp = syncData[0].new_total_exp
    userData.value.level = syncData[0].new_level
  }
}
```

### `redeem_my_coupon(p_coupon_id bigint)`

玩家自行核銷票券的安全入口。  
**用途：** `CouponView.vue` 的「確認核銷」按鈕，取代直接 UPDATE `coupons` 表。

- 驗證票券屬於當前 LINE 用戶（`user_id = line_user_id`）
- 只允許 `available` → `used`（不可逆，防止玩家自行復原已核銷票券）
- 過期票券也無法核銷
- 若驗證失敗拋出 EXCEPTION，前端顯示錯誤

### `use_promo_code(p_code text)`

原子化兌換碼驗證與計數。  
**用途：** `stores/user.js redeemPromoCode` 中，取代非原子的 `used_count + 1` 更新。

- `SELECT FOR UPDATE` 鎖住該 row，避免同時兌換超過 `max_uses`
- 驗證 `is_active` 和 `max_uses`，失敗拋出 EXCEPTION
- 原子執行 `used_count = used_count + 1`
- 回傳兌換碼資料（JSON）

> ⚠️ `use_promo_code` 在 per-user 次數限制**之後**呼叫（`redeemPromoCode` 先 client-side 檢查每人上限，再呼叫 RPC 驗證全域 max_uses）。

---

## Edge Functions

所有 Edge Functions 都設定 `verify_jwt = false`（`config.toml`），由函式自行驗證 LINE token。

| Function | 用途 | 驗證方式 |
|---|---|---|
| `auth-line` | LINE token → Supabase authenticated session | 驗 LINE token → 建 / 找 auth.users → 回傳 token_hash |
| `my-profile` | 讀寫私人資料（phone/email/birthday） | 驗 LINE token → 用 SERVICE_ROLE key 存取 users_private |

### 部署指令

```bash
supabase functions deploy auth-line --no-verify-jwt
supabase functions deploy my-profile --no-verify-jwt
```

> `--no-verify-jwt` 必加，否則 Supabase gateway 會在函式執行前驗 JWT，LINE token 會被擋（HTTP 401）。

---

## Admin 後台

- 路由：`/#/admin`
- 認證：Supabase Auth **email / password**（與 LINE 認證分開）
- 存取：App.vue 偵測到 `#/admin` 時跳過 LIFF 初始化，AdminView 自行處理登入

> **為什麼不走 LIFF？** Vue Router 使用 Hash Mode（`#/admin`），LIFF login() redirect 後 hash 會遺失，admin 會被導向首頁。

### Admin 的 RLS 識別方式

Admin 透過 email/password 登入，JWT 中**沒有** `user_metadata.line_user_id`，因此 RLS 以 `IS NULL` 判斷：

```sql
(auth.jwt()->'user_metadata'->>'line_user_id') IS NULL
```

### fetchAdminProfile

登入後用 `session.user.id`（Supabase auth UUID）查詢 `users` 表，取得 `role` 和 `managed_branch`：

```javascript
const { data } = await supabase
  .from('users')
  .select('role, managed_branch, display_name')
  .eq('id', currentSession.user.id)   // auth UUID = users.id（需保持一致）
  .single()
```

`managed_branch` 控制 GameManager / SessionManager 顯示哪個館的場次：
- `'ALL'`：看全部
- `'西門館2.0'` 等：只看對應館

---

## 路由繞過規則（App.vue）

```javascript
if (window.location.hash.includes('#/admin') || window.location.hash.includes('#/display')) {
  userStore.isLoading = false
  return  // 跳過 LIFF 初始化
}
```

| 路由 | 原因 |
|---|---|
| `#/admin` | LIFF redirect 會遺失 hash；admin 有獨立登入機制 |
| `#/display` | 公開展示螢幕，不需要 LINE 登入 |

---

## Supabase 專案共用說明

本系統與 **spot-point** 共用同一個 Supabase 專案：

| 應用 | auth.users | 自訂資料表 |
|---|---|---|
| LINE app（本系統）| `line_U...@line.invalid` 格式帳號 | `public.users` |
| spot-point | Google OAuth 真實 email | `spot.profiles` |

各自查詢時需篩選：
```sql
-- spot-point 篩除 LINE 假帳號
WHERE email NOT LIKE '%@line.invalid'
-- 或
WHERE app_metadata->>'provider' = 'google'
```

LINE app 不需要篩選（每個 session JWT 已帶 `line_user_id`，RLS 自動限制範圍）。

---

## 已知問題 / 待辦

- [ ] `users` 表的 `phone`、`email` 欄位尚未 DROP（`birthday` 已 DROP），資料已在 `users_private`
  - 待確認無任何 SELECT 查詢還在抓這兩欄後再 DROP
- [ ] `role` 欄位在 `users` 表，authenticated 用戶可查詢 `role=eq.admin` 找出管理員帳號
  - 低風險（LINE 社群內部用戶），完整方案是將 role 移至 `users_private`
- [ ] `grantPoints` 給第三方用戶（如推薦人）依賴 admin bypass（`line_user_id IS NULL`），但一般用戶執行 `joinGame` 時 JWT 有 `line_user_id`，UPDATE 會被 RLS 擋掉
  - 現象：`points_transactions` 有寫入，但 `users.points` 餘額不更新
  - 根本修法：改用 Edge Function（service role）或 SECURITY DEFINER RPC 處理第三方扣點
- [ ] `ScanView.vue` 徒弟數（`discipleCount`）永遠為 0
  - 原因：`users` 表 SELECT `WHERE referred_by = my_referral_code` 被 `users_select_auth` 擋住
  - 修法：改用 SECURITY DEFINER RPC 查詢徒弟列表
- [ ] `AchievementsView.vue` 成就獎勵直接 UPDATE `users.total_exp` 和 `users.points`
  - `users_update_auth` 允許用戶更新自己的 row，技術上用戶可繞過前端直接打 API 竄改數值
  - `points` 更新完全繞過 `points_transactions` 流水帳
  - 修法：改用 SECURITY DEFINER RPC 處理成就獎勵發放
- [ ] `PointsView.vue` 商城庫存競態條件（`shop_items.stock - 1` 非原子）且購買流程非原子
  - 目前商城路由已封鎖（`redirect: '/'`），開放前需先修正

---

## 資料庫備份

RLS 大改前有建立 git tag：

```bash
git tag backup-before-auth-rls
```
