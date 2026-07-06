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
      → 回傳 token_hash
  → supabase.auth.verifyOtp({ token_hash, type: 'magiclink' })
      → 設定 authenticated session（in-memory，不儲存）
  → checkAndRegisterUser：查 users 表 / 首次訪問則 INSERT
  → loadPrivateProfile：透過 my-profile Edge Function 讀取私人資料
```

### 重要設定

```javascript
// src/supabase.js
export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})
```

- `persistSession: false`：session 不存 localStorage，避免 stale session 干擾 RLS role
- `autoRefreshToken: false`：不自動更新 token（LIFF 每次開啟都重新認證）

---

## 資料庫安全（RLS 政策）

> **核心原則：anon 不得存取任何用戶資料，所有操作需通過 LINE → auth-line 認證**

### `users` 表

| Policy | Role | 操作 | 條件 |
|---|---|---|---|
| `users_select_auth` | authenticated | SELECT | `true`（全部可見，不含 phone/email/birthday ⚠️） |
| `users_insert_self` | authenticated | INSERT | `jwt.line_user_id = id` |
| `users_update_auth` | authenticated | UPDATE | `jwt.line_user_id = id` OR `jwt.line_user_id IS NULL`（admin） |

> ⚠️ **已知問題：** `phone`、`email`、`birthday` 欄位仍在 `users` 表中，authenticated 用戶可透過 REST API 讀取。  
> **待辦：** DROP 這三欄，資料已遷移至 `users_private`，但需同步修改 MemberManager 和 userData.birthday 生日禮邏輯。

### `users_private` 表

敏感欄位（phone、email、birthday）存放處。**只能透過 Edge Function 存取，不開放 REST API 直接查詢。**

存取方式：`GET/POST /functions/v1/my-profile`（帶 LINE token）

### `coupons` 表

| Policy | Role | 操作 | 條件 |
|---|---|---|---|
| `coupons_select_auth` | authenticated | SELECT | `jwt.line_user_id = user_id` OR `jwt.line_user_id IS NULL`（admin） |
| `coupons_insert_auth` | authenticated | INSERT | `true` |
| `coupons_delete_auth` | authenticated | DELETE | `jwt.line_user_id = user_id` OR `jwt.line_user_id IS NULL`（admin） |

### `user_achievements` 表

| Policy | Role | 操作 | 條件 |
|---|---|---|---|
| `ua_select_own` | authenticated | SELECT | `jwt.line_user_id = user_id` |
| `ua_insert_own` | authenticated | INSERT | `jwt.line_user_id = user_id` |

### RLS 未啟用的表（所有人可讀寫）

`achievements`、`game_participants`、`scripts`、`games`、`shop_items` 等目前無 RLS，PostgREST 開放存取。未來有需要再加。

---

## Edge Functions

所有 Edge Functions 都設定 `verify_jwt = false`，由函式自行驗證 LINE token。

| Function | 用途 | 驗證方式 |
|---|---|---|
| `auth-line` | LINE token → Supabase authenticated session | 驗 LINE token → 建立 / 找 auth.users → 回傳 token_hash |
| `my-profile` | 讀寫私人資料（phone/email/birthday） | 驗 LINE token → 用 SERVICE_ROLE key 存取 users_private |

### 部署指令

```bash
supabase functions deploy auth-line --no-verify-jwt
supabase functions deploy my-profile --no-verify-jwt
```

> **注意：** 一定要帶 `--no-verify-jwt`，否則 Supabase gateway 會在函式執行前就驗 JWT，LINE token 會被擋下（HTTP 401）。

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

## 已知問題 / 待辦

- [ ] `users` 表的 `phone`、`email`、`birthday` 欄位需 DROP，改由 `users_private` + Edge Function 供應
  - 影響：`userData.birthday` 生日禮邏輯、MemberManager 生日欄位
- [ ] `role` 欄位在 `users` 表，authenticated 用戶可查詢 `role=eq.admin` 找出管理員帳號
  - 低風險（LINE 社群內部用戶），但完整方案是將 role 移至 `users_private`

---

## 資料庫備份

RLS 大改前有建立 git tag：

```bash
git tag backup-before-auth-rls
```

如需回溯，切換到此 tag 並重新套用原本的 SQL。
