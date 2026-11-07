# 團務管理 API 規格 v1

> 版本：v1.0 草案（2026-11-08）
> 提供方：團務管理 app（Firebase）
> 使用方：LINE 群組機器人「燈燈群組小精靈」（larp-system `supabase/functions/line-webhook`）、劇光燈後台、日後其他工具
>
> 目的：團務 app 是揪團資料的唯一來源。機器人和後台都不自己存揪團資料，一律透過本 API 讀寫。

---

## 目錄

0. 名詞
1. 總則（網址、驗證、操作者、格式、時間、金額、版本相容）
2. 錯誤格式與錯誤碼
3. 共用機制（冪等、併發控制、分頁、搜尋）
4. 資料模型
5. API：劇本 `scripts`
6. API：場次 `sessions`
7. API：團員 `members`
8. API：繳費紀錄 `payments`
9. API：優惠／折抵 `discounts`
10. API：操作紀錄 `events`
11. API：設定 `settings`
12. Webhook（app → 機器人）
13. 提醒機制
14. 機器人指令對照表
15. 典型流程範例
16. Firebase 實作建議
17. 待決事項

---

## 0. 名詞

| 名詞 | 意思 |
|---|---|
| 場次 session | 一團。一個 LINE 群組同時間只會綁一個「進行中」的場次 |
| 團主 organizer | 開團的人，預設也是團員 |
| 團員 member | 報名這一團的人，不一定是劇光燈會員 |
| 候補 waitlist | 額滿後報名的人，有人退出時依序遞補 |
| 應繳 amount_due | 這個人這團要付多少（單價 − 個人優惠） |
| 繳費紀錄 payment | 一筆收款或退款。團員的繳費狀態由所有紀錄加總算出 |
| 操作者 actor | 誰做了這個動作（LINE 使用者、後台帳號、系統） |

---

## 1. 總則

### 1.1 網址

```
正式：https://<firebase-app>/api/v1
測試：https://<firebase-app-staging>/api/v1
```

- 版本號放在路徑（`/v1`）。有不相容的修改才開 `/v2`，`/v1` 至少保留到使用方全部改完。
- 只接受 HTTPS。

### 1.2 驗證

每個請求都要帶：

```
Authorization: Bearer <API_KEY>
```

- 每個使用方各發一把金鑰（機器人一把、後台一把），可以個別停用、換新。
- 金鑰綁「權限範圍 scopes」：

| scope | 可以做 |
|---|---|
| `scripts:read` | 讀劇本 |
| `scripts:write` | 改劇本（只給後台） |
| `sessions:read` | 讀場次、團員、繳費、紀錄 |
| `sessions:write` | 開團、改團、報名、記繳費、備註 |
| `sessions:admin` | 強制改狀態、刪除、改別人的繳費（後台） |
| `settings:write` | 改設定 |

- 機器人預設：`scripts:read sessions:read sessions:write`。
- 驗證失敗回 `401 UNAUTHENTICATED`；權限不足回 `403 FORBIDDEN`。

### 1.3 操作者（誰做的）

API 金鑰只代表「哪個系統」，實際是誰按的要另外帶，所有寫入請求都要帶，讀取可省略：

```
X-Actor-Type: line_user        # line_user | admin | system
X-Actor-Id:   U65a94308...      # LINE userId／後台帳號 id／system 名稱
X-Actor-Name: %E5%96%AC          # 顯示名稱，URL-encode（因為中文）
```

- 寫進 `events` 操作紀錄，也用來做權限判斷（例如「只有團主能改時間」，見 §6.9）。
- 缺少時回 `400 ACTOR_REQUIRED`。

### 1.4 格式

- 請求、回應都是 `application/json; charset=utf-8`。
- 欄位命名一律 `snake_case`。
- 成功回應：直接回資源本體，列表包在 `{ "data": [...], "next_cursor": ... }`。
- 回應會多帶 `warnings`（陣列，可能不存在）：成功但值得提醒的事，例如「男女比例不符」。使用方可以選擇顯示。

### 1.5 時間

- 一律 ISO 8601，帶時區：`2026-11-15T19:30:00+08:00`。
- 伺服器存 UTC 也可以，但**回應一律轉成 +08:00**，機器人不用自己轉。
- 只有日期的欄位用 `YYYY-MM-DD`，以台灣時間為準。

### 1.6 金額

- 一律新台幣**整數元**，不用小數，不用字串。

### 1.7 ID

- 所有 id 都是字串（Firestore 自動 id 即可），使用方不可假設格式。
- 另有給人看的短編號 `code`（例：`G261115-03`），可以拿來查詢，但不保證永久不變，程式要存 `id`。

### 1.8 相容性規則（很重要，方便日後加功能）

**提供方（app）承諾：**
1. 新增欄位、新增 API、新增 enum 值、新增 webhook 事件 → 直接在 v1 加，不算破壞。
2. 不會在 v1 裡刪欄位、改欄位意思、改型別。
3. 要淘汰的欄位先標 `deprecated`，至少保留 3 個月。

**使用方（機器人、後台）承諾：**
1. 看到不認得的欄位要忽略，不能報錯。
2. 看到不認得的 enum 值要有預設處理（例如狀態不認得就顯示原字串）。
3. 不認得的 webhook 事件回 `200` 後略過。

**擴充欄位：** 場次、團員、劇本都有 `extra` 物件（任意 key/value），臨時要記的東西先放這裡，確定要長期用再升格成正式欄位。

---

## 2. 錯誤格式與錯誤碼

```json
{
  "error": {
    "code": "SESSION_FULL",
    "message": "這團已經滿了（6/6），已幫你排入候補第 1 位",
    "details": { "capacity": 6, "joined": 6 },
    "request_id": "req_8f3a..."
  }
}
```

- `code`：給程式判斷，固定英文大寫。
- `message`：**給人看的繁體中文**，機器人可以直接貼到群組。
- `details`：額外資料，可能沒有。
- `request_id`：查 log 用。

| HTTP | code | 何時 |
|---|---|---|
| 400 | `VALIDATION_FAILED` | 欄位格式不對，`details.fields` 列出哪些欄位 |
| 400 | `ACTOR_REQUIRED` | 寫入請求沒帶操作者 |
| 401 | `UNAUTHENTICATED` | 沒帶或帶錯金鑰 |
| 403 | `FORBIDDEN` | 金鑰權限不足 |
| 403 | `NOT_ORGANIZER` | 這個動作只有團主（或後台）能做 |
| 404 | `SCRIPT_NOT_FOUND` | 找不到劇本 |
| 404 | `SESSION_NOT_FOUND` | 找不到場次 |
| 404 | `MEMBER_NOT_FOUND` | 這個人不在名單 |
| 409 | `GROUP_HAS_ACTIVE_SESSION` | 這個群組已經有進行中的團，`details.session_id` |
| 409 | `SCRIPT_AMBIGUOUS` | 劇本名稱對到多本，`details.candidates` |
| 409 | `SESSION_FULL` | 額滿（若有開候補，改成成功並回 `status: waitlist`，不會出現這個錯） |
| 409 | `SESSION_CLOSED` | 場次已取消／已結束，不能再改 |
| 409 | `ALREADY_JOINED` | 已經在名單（`POST members` 預設是冪等，不會回這個；見 §7.2） |
| 409 | `INVALID_TRANSITION` | 狀態不能這樣轉，例如已取消的團不能成團 |
| 409 | `VERSION_CONFLICT` | 併發衝突，見 §3.2 |
| 409 | `IDEMPOTENCY_CONFLICT` | 同一把冪等鍵帶了不同內容 |
| 422 | `TIME_IN_PAST` | 開團時間已經過了 |
| 422 | `TIME_CONFLICT` | 同館同時段已有其他場次（如果有做場地） |
| 429 | `RATE_LIMITED` | 太頻繁，看 `Retry-After` header |
| 500 | `INTERNAL` | 伺服器錯誤 |
| 503 | `UNAVAILABLE` | 暫時無法服務，可以重試 |

---

## 3. 共用機制

### 3.1 冪等（避免重複開團、重複記帳）

LINE 會重送 webhook，機器人可能因此打兩次同一個請求。所有 `POST` 都支援：

```
Idempotency-Key: <任意唯一字串，最長 128>
```

- 機器人用 LINE 的 `webhookEventId` 當鍵。
- 24 小時內同一把鍵、同樣內容 → 直接回第一次的結果（同樣 status code 和 body）。
- 同一把鍵、不同內容 → `409 IDEMPOTENCY_CONFLICT`。

### 3.2 併發控制

每個場次、團員都有 `version`（整數，每次修改 +1）。

- `PATCH` 可以帶 `If-Match: <version>`；版本不符回 `409 VERSION_CONFLICT`，`details.current` 附最新資料。
- 不帶 `If-Match` 就直接覆蓋（機器人一般操作可以不帶）。
- 報名、繳費這種「加一筆」的動作在伺服器端用 transaction 處理，不需要 `If-Match`。

### 3.3 分頁

列表 API 都用游標：

```
GET /sessions?limit=20&cursor=<上一頁的 next_cursor>
→ { "data": [...], "next_cursor": "eyJ..." }   // 沒有下一頁時 next_cursor 為 null
```

- `limit` 預設 20，上限 100。

### 3.4 展開關聯（減少來回）

`GET /sessions/{id}` 支援 `?expand=members,payments,script`，逗號分隔。機器人顯示名單時一次拿完。

---

## 4. 資料模型

### 4.1 Script 劇本

```json
{
  "id": "scr_umbrella",
  "title": "傘靈",
  "aliases": ["傘", "傘靈本"],
  "category": ["情感沉浸"],
  "tags": ["古風"],
  "cover_url": "https://...",
  "duration_minutes": 300,
  "players": {
    "min": 6,
    "max": 6,
    "male": 3,
    "female": 3,
    "cross_gender": true,
    "text": "3 男 3 女（可以反串）"
  },
  "price": 800,
  "price_rules": [
    { "id": "weekday", "label": "平日", "price": 750, "weekdays": [1,2,3,4] }
  ],
  "deposit": 200,
  "gm_required": 1,
  "is_active": true,
  "external_ids": { "larp_system_script_id": 42 },
  "extra": {},
  "updated_at": "2026-11-08T12:00:00+08:00"
}
```

| 欄位 | 說明 |
|---|---|
| `aliases` | 簡稱、常見打法，機器人比對名稱用 |
| `players.min/max` | 最少開團人數／滿團人數。固定人數的本兩個一樣 |
| `players.male/female` | 男女角色數，沒有限制就 `null` |
| `players.cross_gender` | 能不能反串 |
| `players.text` | 給人看的原始文字 |
| `price` | 每人預設單價 |
| `price_rules` | 選填。平日／假日／特殊日價格，開團時伺服器依日期挑一個；沒對到就用 `price` |
| `deposit` | 訂金（每團），沒有就 `null` |
| `external_ids.larp_system_script_id` | 對應劇光燈 `scripts.id`，日後串點數、成就用 |

### 4.2 Session 場次

```json
{
  "id": "ses_7Hk2...",
  "code": "G261115-03",
  "status": "recruiting",
  "script_id": "scr_umbrella",
  "script": { "title": "傘靈", "duration_minutes": 300 },
  "start_at": "2026-11-15T19:30:00+08:00",
  "end_at":   "2026-11-16T00:30:00+08:00",
  "venue": { "id": "taipei", "name": "台北館", "room": null },
  "capacity": 6,
  "min_players": 6,
  "price_per_person": 800,
  "deposit": 200,
  "payment_deadline": "2026-11-14T23:59:00+08:00",
  "waitlist_enabled": true,
  "organizer": { "member_id": "mem_01", "line_user_id": "U65a...", "display_name": "喬" },
  "line_group_id": "C1a2b3...",
  "title": null,
  "note": "現場有停車位",
  "visibility": "group",
  "counts": {
    "joined": 4, "waitlist": 1,
    "paid": 2, "partially_paid": 1, "unpaid": 1,
    "amount_due": 3100, "amount_paid": 1900
  },
  "reminders": [
    { "id": "rem_d1", "kind": "day_before", "at": "2026-11-14T20:00:00+08:00", "sent_at": null }
  ],
  "is_test": false,
  "extra": {},
  "version": 7,
  "created_at": "2026-11-08T15:02:11+08:00",
  "updated_at": "2026-11-08T16:40:00+08:00"
}
```

**`script` 是開團當下的快照**：日後劇本改名、改價，已開的團不受影響。

**狀態 `status`：**

```
recruiting（招募中）──成團──▶ confirmed（已成團）──結束──▶ completed（已結束）
     │   ▲                         │
     │   └──────取消成團────────────┘
     └──────────────▶ cancelled（已取消）◀──────────────┘
```

| 狀態 | 意思 | 算「進行中」 |
|---|---|---|
| `recruiting` | 開團招募中 | 是 |
| `confirmed` | 已確定成團（人數夠、店家確認） | 是 |
| `completed` | 已經玩完 | 否 |
| `cancelled` | 取消 | 否 |

- 「額滿」不是狀態，看 `counts.joined >= capacity`。
- 開場時間過了 6 小時還沒結束，系統自動轉 `completed`（可在設定調整）。
- 「進行中」的場次才佔用群組；結束或取消後，同一群組可以再開新團。

### 4.3 Member 團員

```json
{
  "id": "mem_01",
  "session_id": "ses_7Hk2...",
  "line_user_id": "U65a...",
  "larp_member_id": "00000002",
  "display_name": "喬",
  "nickname": null,
  "gender": "male",
  "role": "organizer",
  "status": "joined",
  "waitlist_position": null,
  "character": null,
  "payment": {
    "status": "partially_paid",
    "amount_due": 700,
    "amount_paid": 200,
    "balance": 500,
    "last_paid_at": "2026-11-09T10:00:00+08:00"
  },
  "discounts": [
    { "id": "dis_1", "type": "presale_coupon", "label": "預售券", "amount": 100, "ref": null, "note": null }
  ],
  "note": "要用預售券 1 張",
  "guest_of": null,
  "joined_at": "2026-11-08T15:02:11+08:00",
  "left_at": null,
  "extra": {},
  "version": 3
}
```

| 欄位 | 說明 |
|---|---|
| `line_user_id` | 從 LINE 報名就有。後台手動加的人可以是 `null` |
| `larp_member_id` | 劇光燈會員編號，有綁就填，沒綁 `null`（不影響報名） |
| `display_name` | 報名當下的 LINE 名稱 |
| `nickname` | 團主另外取的稱呼，顯示時優先用 |
| `gender` | `male` / `female` / `other` / `null`，用來檢查男女角色數 |
| `role` | `organizer` / `player` / `gm` |
| `status` | `joined` / `waitlist` / `left`（自己退出）/ `removed`（被團主移除） |
| `character` | 分配到的角色名，選填 |
| `guest_of` | 幫朋友報名時，填報名人的 member id（朋友沒有 LINE 也可以佔位） |

**繳費狀態 `payment.status`（伺服器算，不能直接寫）：**

| 狀態 | 條件 |
|---|---|
| `unpaid` | 已繳 = 0 且 應繳 > 0 |
| `partially_paid` | 0 < 已繳 < 應繳 |
| `paid` | 已繳 ≥ 應繳 |
| `waived` | 應繳 = 0（例如全額用券、免費） |
| `refunded` | 退出後全數退款 |
| `pending_review` | 本人回報已匯款、團主還沒確認（有開「回報」流程時才會出現） |

`amount_due = 場次單價 − 個人所有 discounts 加總`，最低 0。

### 4.4 Payment 繳費紀錄

```json
{
  "id": "pay_9x",
  "session_id": "ses_7Hk2...",
  "member_id": "mem_01",
  "kind": "payment",
  "amount": 200,
  "method": "transfer",
  "status": "confirmed",
  "remit_last5": "12345",
  "paid_at": "2026-11-09T10:00:00+08:00",
  "recorded_by": { "type": "line_user", "id": "U65a...", "name": "喬" },
  "confirmed_by": { "type": "line_user", "id": "U65a...", "name": "喬" },
  "note": "訂金",
  "voided_at": null,
  "void_reason": null,
  "created_at": "2026-11-09T10:01:00+08:00"
}
```

| 欄位 | 值 |
|---|---|
| `kind` | `payment` 收款／`refund` 退款（金額仍填正數） |
| `method` | `cash` / `transfer` / `line_pay` / `jkopay` / `coupon` / `other` |
| `status` | `pending`（本人回報待確認）/ `confirmed` / `void`（作廢） |

- 紀錄**只增不改**。打錯就「作廢」（`void`）再補一筆，帳才查得回來。
- 團員的已繳 = 所有 `confirmed` 的 payment − 所有 `confirmed` 的 refund。

### 4.5 Discount 優惠／折抵

| 欄位 | 說明 |
|---|---|
| `type` | `presale_coupon`（雙11預售券）/ `coupon`（會員票券）/ `promo`（活動折扣）/ `manual`（團主手動折） |
| `label` | 顯示文字 |
| `amount` | 折多少元 |
| `ref` | 對應的券號或代碼，選填。日後可以拿去劇光燈核銷 |
| `note` | 備註 |

### 4.6 Event 操作紀錄

```json
{
  "id": "evt_1",
  "session_id": "ses_7Hk2...",
  "type": "member.paid",
  "actor": { "type": "line_user", "id": "U65a...", "name": "喬" },
  "summary": "喬 記錄 小明 已繳 700 元（匯款）",
  "data": { "member_id": "mem_02", "payment_id": "pay_9x" },
  "created_at": "2026-11-09T10:01:00+08:00"
}
```

`type` 和 Webhook 事件名稱共用一套（見 §12.3）。

---

## 5. API：劇本 `scripts`

### 5.1 列出劇本
```
GET /scripts?active=true&category=情感沉浸&players=6&limit=50
```
| 參數 | 說明 |
|---|---|
| `active` | 預設 `true`，只列上架的 |
| `category` | 分類篩選 |
| `players` | 可容納這個人數的本（min ≤ n ≤ max） |
| `updated_since` | 只列這時間後改過的（同步用） |

### 5.2 取得單一劇本
```
GET /scripts/{id}
```

### 5.3 用名稱找劇本（機器人開團用）
```
GET /scripts/search?q=傘&limit=5
```
```json
{
  "data": [
    { "script": { ...Script }, "score": 1.0, "matched": "alias" },
    { "script": { ...Script }, "score": 0.6, "matched": "title_partial" }
  ],
  "exact": true
}
```
- `SCRIPT_AMBIGUOUS` 錯誤的 `details.candidates` 格式：`[{ "id": "...", "title": "...", "players": { "text": "..." } }]`，最多 13 筆（LINE 快速選單上限）。
- 比對順序：完全相同 title → 完全相同 alias → 開頭相同 → 包含 → 去空白／全半形後相同。
- `exact: true` 表示第一筆是完全命中，機器人可以直接用；否則列候選讓使用者選。

### 5.4 新增／修改劇本（後台）
```
POST  /scripts
PATCH /scripts/{id}
```
需要 `scripts:write`。

---

## 6. API：場次 `sessions`

### 6.1 開團
```
POST /sessions
Idempotency-Key: <webhookEventId>
```
```json
{
  "script_id": "scr_umbrella",
  "script_query": null,
  "start_at": "2026-11-15T19:30:00+08:00",
  "line_group_id": "C1a2b3...",
  "capacity": null,
  "price_per_person": null,
  "payment_deadline": null,
  "venue_id": null,
  "note": null,
  "organizer_joins": true,
  "organizer": { "line_user_id": "U65a...", "display_name": "喬", "gender": null },
  "is_test": false,
  "extra": {}
}
```
- `script_id` 和 `script_query` 擇一。給 `script_query`（例如使用者打的「傘」）時，伺服器自己搜尋：唯一命中就用，多筆回 `409 SCRIPT_AMBIGUOUS`，沒有回 `404 SCRIPT_NOT_FOUND`。
- `null` 的欄位用預設值：
  - `capacity` ← 劇本 `players.max`
  - `min_players` ← 劇本 `players.min`
  - `price_per_person` ← 依日期套 `price_rules`，否則劇本 `price`
  - `end_at` ← `start_at` + 劇本時長
  - `payment_deadline` ← 依設定（預設開場前一天 23:59）
  - `reminders` ← 依設定產生
- `organizer_joins: true`：團主自動成為第一位團員。
- 同群組已有進行中的團 → `409 GROUP_HAS_ACTIVE_SESSION`。
- 成功回 `201`，body 是完整 Session（含 `expand=members`）。

### 6.2 查場次
```
GET /sessions/{id}?expand=members,payments,script
GET /sessions/by-code/{code}
```

### 6.3 用 LINE 群組查目前的團（機器人最常用）
```
GET /line-groups/{groupId}/active-session?expand=members
```
- 有進行中的團 → `200` Session。
- 沒有 → `404 SESSION_NOT_FOUND`。

```
GET /line-groups/{groupId}/sessions?limit=10
```
這個群組開過的所有團（含已結束）。

### 6.4 列表／搜尋
```
GET /sessions?status=recruiting,confirmed&start_from=2026-11-01&start_to=2026-11-30&script_id=&organizer_line_user_id=&member_line_user_id=&is_test=false
```
- `member_line_user_id`：查某人報名的所有團（日後做「我的揪團」用）。
- 排序：預設 `start_at` 由近到遠，`?sort=-created_at` 可以改。

### 6.5 修改場次
```
PATCH /sessions/{id}
If-Match: 7
```
```json
{ "start_at": "2026-11-16T14:00:00+08:00", "note": "改到週日下午" }
```
- 可改：`start_at`、`end_at`、`capacity`、`min_players`、`price_per_person`、`deposit`、`payment_deadline`、`venue_id`、`title`、`note`、`waitlist_enabled`、`extra`。
- **不能用 PATCH 改 `status`**，要用 §6.6 的動作。
- 改 `start_at` 會自動重算提醒時間，並發出 `session.rescheduled` webhook。
- 改 `price_per_person` 會重算每個人的 `amount_due`，回應 `warnings` 會列出「已繳超過新應繳」的人。
- 改小 `capacity` 時，超出的人**不會**被踢掉，`warnings` 提醒團主處理。

### 6.6 狀態動作
```
POST /sessions/{id}/confirm     成團
POST /sessions/{id}/unconfirm   取消成團（回到招募）
POST /sessions/{id}/complete    結束
POST /sessions/{id}/cancel      取消
POST /sessions/{id}/reopen      重開（已取消 → 招募中，限後台）
```
body 都可以帶 `{ "reason": "人數不足" }`。
- `confirm` 時人數 < `min_players` 會成功，但回 `warnings`。
- `cancel` 後回應附 `refund_summary`：每個人已繳多少、要退多少，給團主參考。實際退款還是要用 §8 記。

### 6.7 換團主
```
POST /sessions/{id}/transfer-organizer
{ "member_id": "mem_02" }
```

### 6.8 刪除
```
DELETE /sessions/{id}
```
只限 `sessions:admin`，只給測試資料用。正式資料請用 `cancel`。

### 6.9 權限規則（伺服器判斷）

| 動作 | 誰可以 |
|---|---|
| 開團、報名自己、退出自己、給自己備註、回報自己已匯款 | 任何人 |
| 改場次、成團、取消、記別人繳費、改別人備註、移除別人、確認匯款 | 團主、`role=gm`、後台（`X-Actor-Type: admin`） |
| 作廢繳費紀錄、重開、刪除 | 後台 |

> 目前決定「誰都能開團」。之後要收緊（例如只有店員能開），只要改這張表，API 不用動。

---

## 7. API：團員 `members`

### 7.1 列出團員
```
GET /sessions/{id}/members?status=joined,waitlist
```
預設排序：團主 → 依報名時間 → 候補依順位。

### 7.2 報名（加入）
```
POST /sessions/{id}/members
Idempotency-Key: <webhookEventId>
```
```json
{
  "line_user_id": "U77b...",
  "display_name": "小明",
  "gender": null,
  "larp_member_id": null,
  "role": "player",
  "guest_of": null,
  "note": null
}
```
- **以 `line_user_id` 為準做 upsert**：已經在名單就回 `200`，`"created": false`；新加入回 `201`，`"created": true`。之前退出的人再報名，恢復成 `joined`（若已額滿就排候補）。
- 回應：
```json
{ "created": true, "member": { ...Member }, "session": { ...Session（不含 members，含最新 counts） } }
```
- 額滿且 `waitlist_enabled` → 成功，`status: "waitlist"`，附 `waitlist_position`。
- 額滿且沒開候補 → `409 SESSION_FULL`。
- 幫沒 LINE 的朋友報名：`line_user_id: null`，填 `display_name` 和 `guest_of`。
- 男女角色數超過時仍然成功，但回 `warnings`（劇本可以反串時不提醒）。

### 7.3 查單一團員
```
GET /sessions/{id}/members/{memberId}
GET /sessions/{id}/members/by-line/{lineUserId}
```

### 7.4 修改團員
```
PATCH /sessions/{id}/members/{memberId}
PATCH /sessions/{id}/members/by-line/{lineUserId}
```
```json
{ "note": "要用預售券 1 張", "nickname": "明", "gender": "male", "character": "傘靈", "role": "gm", "extra": {} }
```
不能直接改 `payment`、`status`，要分別用 §8 和 §7.5。

### 7.5 退出／移除
```
DELETE /sessions/{id}/members/{memberId}?reason=臨時有事
```
- 本人操作 → `status: left`；團主或後台操作 → `status: removed`。
- 資料不會刪，繳費紀錄保留。
- 有人退出且有候補 → 第一位候補自動遞補，回應附 `promoted`：
```json
{ "member": { ...離開的人 }, "promoted": { ...遞補的人，沒有就 null }, "session": { ...Session（含最新 counts） } }
```
同時發 `member.promoted` webhook，機器人可以在群組 @ 對方。

### 7.6 調整候補順序
```
POST /sessions/{id}/members/{memberId}/promote    直接從候補轉正（可超過人數上限）
POST /sessions/{id}/waitlist/reorder  { "member_ids": ["mem_05","mem_04"] }
```

### 7.7 批次（後台用）
```
POST /sessions/{id}/members:batch
{ "add": [ {...}, {...} ], "remove": ["mem_03"] }
```

---

## 8. API：繳費紀錄 `payments`

### 8.1 記一筆收款／退款
```
POST /sessions/{id}/members/{memberId}/payments
POST /sessions/{id}/members/by-line/{lineUserId}/payments
Idempotency-Key: <webhookEventId>
```
```json
{ "kind": "payment", "amount": null, "method": "transfer", "remit_last5": null, "paid_at": null, "status": "confirmed", "note": null }
```
- `amount: null` = **繳清目前餘額**（機器人「繳費 @小明」就是這樣用）。餘額是 0 時回 `200`，不新增紀錄，`warnings` 說明已繳清。
- `paid_at: null` = 現在。
- 本人回報匯款時 `status: "pending"`，團主確認後才算進已繳。團主或後台記錄時直接 `confirmed`。
- 回應：
```json
{ "payment": { ...Payment }, "member": { ...Member（含最新 payment 摘要） } }
```

### 8.2 確認／作廢
```
POST /sessions/{id}/payments/{paymentId}/confirm
POST /sessions/{id}/payments/{paymentId}/void   { "reason": "記錯人" }
```

### 8.3 查詢
```
GET /sessions/{id}/payments?member_id=&status=pending
```

### 8.4 收款摘要
```
GET /sessions/{id}/payment-summary
```
```json
{
  "amount_due": 4200, "amount_paid": 2800, "balance": 1400,
  "by_status": { "paid": 3, "partially_paid": 1, "unpaid": 2, "pending_review": 0 },
  "unpaid_members": [ { "member_id": "mem_04", "display_name": "小華", "line_user_id": "U...", "balance": 700 } ]
}
```
提醒時點名沒繳的人就是用這支。

---

## 9. API：優惠／折抵 `discounts`

```
POST   /sessions/{id}/members/{memberId}/discounts
DELETE /sessions/{id}/members/{memberId}/discounts/{discountId}
```
```json
{ "type": "presale_coupon", "label": "預售券", "amount": null, "ref": null, "note": "雙11 預售" }
```
- `type: presale_coupon` 或 `coupon` 且 `amount: null` → 折抵全額單價（一張券抵一人費用）。
- 新增或刪除後重算 `amount_due`，回最新 Member。
- 備註只是文字（例如「下次再補」）就用 §7.4 的 `note`；**會影響金額**的才用 discounts。

> 日後串接劇光燈核銷：`ref` 填劇光燈 `coupons.id`，機器人或後台核銷券時順便寫入。這次不做。

---

## 10. API：操作紀錄 `events`

```
GET /sessions/{id}/events?limit=50&type=member.*
```
- 時間由新到舊。
- 給後台看歷史、查帳，也是 webhook 的來源（每筆 event 都會照訂閱規則推送）。

---

## 11. API：設定 `settings`

```
GET   /settings
PATCH /settings     （settings:write）
```
```json
{
  "timezone": "Asia/Taipei",
  "default_payment_deadline": { "days_before": 1, "time": "23:59" },
  "reminders": [
    { "kind": "day_before",  "days_before": 1, "time": "20:00", "enabled": true },
    { "kind": "hours_before", "hours_before": 3, "enabled": true },
    { "kind": "payment_due", "hours_before_deadline": 12, "only_if_unpaid": true, "enabled": true }
  ],
  "auto_complete_after_hours": 6,
  "waitlist_enabled_default": true,
  "bank": { "bank_name": "", "bank_code": "", "account_no": "", "account_name": "" },
  "payment_methods": ["cash", "transfer", "line_pay"],
  "venues": [ { "id": "taipei", "name": "台北館", "rooms": [] } ]
}
```
單一場次可以用 `PATCH /sessions/{id}` 帶 `reminders` 覆蓋（例如這團不要提醒）。

---

## 12. Webhook（app → 機器人）

app 有事情要讓群組知道時（提醒時間到、後台改了時間、候補遞補），主動通知機器人。

### 12.1 訂閱
```
POST /webhooks
{ "url": "https://cqbiozfappfwfcahtxfm.supabase.co/functions/v1/group-session-hook", "events": ["reminder.due", "session.*", "member.promoted"], "description": "LINE 群組機器人" }
→ 201 { "id": "whk_1", "secret": "whsec_..." }    // secret 只在建立時回一次

GET    /webhooks
DELETE /webhooks/{id}
POST   /webhooks/{id}/test    送一筆 ping
```

### 12.2 送出格式
```
POST <訂閱的 url>
Content-Type: application/json
X-Webhook-Id: dlv_abc            // 每次送出唯一，重送時相同，接收方用來去重
X-Webhook-Timestamp: 1762588800  // Unix 秒
X-Webhook-Signature: v1=<hex>    // HMAC-SHA256(secret, timestamp + "." + body)
```
```json
{
  "id": "dlv_abc",
  "type": "reminder.due",
  "created_at": "2026-11-14T20:00:00+08:00",
  "session": { ...Session（含 line_group_id） },
  "data": { "reminder": { "id": "rem_d1", "kind": "day_before" }, "unpaid_members": [ ... ] },
  "actor": { "type": "system", "id": "scheduler", "name": "排程" },
  "via": "admin-backend"
}
```
- `via`：觸發這個變更的 API 金鑰名稱（例：`line-bot`、`admin-backend`、`scheduler`）。
- 接收方 10 秒內回 `2xx` 才算成功。
- 失敗重送：1 分、5 分、30 分、2 小時、6 小時，共 5 次。
- 接收方要驗簽章、拒絕 5 分鐘前的 timestamp、用 `X-Webhook-Id` 去重。
- **`via` 是機器人自己的金鑰（`line-bot`）時，機器人會略過**（`reminder.due` 除外）：那些事機器人當下已經在群組回覆過，不用再講一次。

### 12.3 事件列表

| 事件 | 何時 | 機器人預設反應 |
|---|---|---|
| `session.created` | 開團 | （機器人自己開的就略過） |
| `session.updated` | 改了欄位 | 不發話 |
| `session.rescheduled` | 改時間 | 群組公告新時間 |
| `session.confirmed` | 成團 | 群組公告成團 |
| `session.cancelled` | 取消 | 群組公告取消＋退款摘要 |
| `session.completed` | 結束 | 不發話（日後可發心得、成就連結） |
| `member.joined` | 報名 | 不發話 |
| `member.left` | 退出／移除 | 不發話 |
| `member.promoted` | 候補遞補 | 群組 @ 遞補的人 |
| `member.paid` | 繳費紀錄確認 | 不發話 |
| `payment.reported` | 本人回報匯款（pending） | 群組 @ 團主請他確認 |
| `payment.voided` | 繳費紀錄作廢 | 不發話 |
| `reminder.due` | 提醒時間到 | 群組發提醒＋點名未繳 |

「不發話」的事件可以先不訂閱，日後要用再加。

---

## 13. 提醒機制

- **時間由 app 管**：開團、改時間時依設定產生 `reminders`，排程到點發 `reminder.due` webhook。
- 機器人收到後用 LINE push 發到 `session.line_group_id`。
- 發成功後機器人回呼：
```
POST /sessions/{id}/reminders/{reminderId}/sent   { "sent_at": "...", "channel": "line_group" }
```
沒回呼的提醒，app 照 webhook 重送規則重試，避免漏發。
- 場次已取消或結束的提醒，app 不送。
- 備援：如果 app 一時沒做排程，機器人可以每小時呼叫一次 `GET /reminders/due?until=<now>` 拿到期的提醒自己發。兩種擇一，正式只開一種。

> 注意：push 會用到「燈燈群組小精靈」的訊息額度，回覆指令（reply）不算額度。

---

## 14. 機器人指令對照表

（機器人實作參考，指令文字之後可以調整，不影響 API）

| 群組裡打 | 呼叫 |
|---|---|
| `揪團 傘靈 11/15 19:30` | `POST /sessions`（`script_query`），多本時回候選卡片。沒寫日期也沒寫時間時當聊天、不回應 |
| `揪團 傘靈 11/15 19:30 6人 700元` | 同上，帶 `capacity`、`price_per_person` 覆蓋 |
| `團` / `本團` | `GET /line-groups/{gid}/active-session?expand=members` → 場次卡片 |
| `+1` / `報名` / 卡片按鈕 | `POST /sessions/{id}/members` |
| `+1 朋友小美` | 同上，`line_user_id: null`、`guest_of` = 自己 |
| `退出` / `-1` | `DELETE /sessions/{id}/members/by-line/{uid}` |
| `名單` | `GET /sessions/{id}?expand=members` → ✅已繳 ⬜未繳 ⏳待確認 ＋ 備註 |
| `繳費 @小明 @小華` | 對每個被 @ 的人 `POST .../by-line/{uid}/payments`（`amount: null`） |
| `繳費 @小明 300` | 同上，`amount: 300` |
| `我匯了 12345` | 本人 `POST .../payments`（`status: pending`、`remit_last5`） |
| `備註 用預售券1張` | `PATCH .../by-line/{自己}` `note` |
| `備註 @小明 用預售券1張` | `PATCH .../by-line/{小明}` `note` |
| `用券 @小明` | `POST .../discounts`（`presale_coupon`） |
| `未繳` | `GET /sessions/{id}/payment-summary` |
| `改時間 11/16 14:00` | `PATCH /sessions/{id}` `start_at` |
| `成團` / `取消團` / `結團` | `POST /sessions/{id}/confirm` / `cancel` / `complete` |
| `劇本 傘` | `GET /scripts/search?q=傘` → 劇本資訊卡 |

- 被 @ 的人：LINE 的 mention 會帶 `userId`；名稱用 LINE「取得群組成員資料」API 補。
- 所有寫入都帶 `Idempotency-Key: <webhookEventId>` 和操作者 header。
- API 錯誤的 `message` 直接回到群組。

---

## 15. 典型流程範例

### 15.1 開團 → 報名 → 繳費 → 提醒

```
喬：揪團 傘靈 11/15 19:30
 └ 機器人 POST /sessions {script_query:"傘靈", start_at:"2026-11-15T19:30:00+08:00", line_group_id:"C1..", organizer:{喬}}
 └ 201 → 機器人發揪團卡片：《傘靈》11/15(六) 19:30–00:30｜6 人｜每人 $800｜已報 1/6 [報名]

小明：+1
 └ POST /sessions/ses_1/members {line_user_id:"U77..", display_name:"小明"}
 └ 201 → 「小明 報名成功（2/6）」

喬：繳費 @小明
 └ POST /sessions/ses_1/members/by-line/U77../payments {amount:null, method:"transfer"}
 └ 201 → 「✅ 小明 已繳 $800」

小明：備註 用預售券1張
 └ PATCH /sessions/ses_1/members/by-line/U77.. {note:"用預售券1張"}

（11/14 20:00）
 app → webhook reminder.due {session, unpaid_members:[小華]}
 └ 機器人 push 到群組：「明天 19:30《傘靈》，還沒繳費：@小華」
 └ POST /sessions/ses_1/reminders/rem_d1/sent
```

### 15.2 劇本名稱不明確

```
喬：揪團 月 11/20 14:00
 └ POST /sessions {script_query:"月"} → 409 SCRIPT_AMBIGUOUS {candidates:[那一束月光, 二十四橋明月夜]}
 └ 機器人回快速選單（Quick Reply），按下後帶 script_id 重送
```

---

## 16. Firebase 實作建議

（給團務 app 開發參考，不是規格的一部分）

**Firestore 結構：**
```
scripts/{scriptId}
sessions/{sessionId}
sessions/{sessionId}/members/{memberId}
sessions/{sessionId}/payments/{paymentId}
sessions/{sessionId}/events/{eventId}
line_group_index/{groupId}        → { active_session_id }   // 保證一群組一個進行中的團
idempotency/{apiKeyId_key}        → { request_hash, status, body, expires_at }
webhooks/{webhookId}
webhook_deliveries/{deliveryId}
settings/global
api_keys/{keyId}                  → { hash, name, scopes, disabled }
```

**要用 transaction 的地方：**
- 開團：檢查並寫 `line_group_index`。
- 報名、退出：人數計算、候補遞補。
- 記帳：寫 payment 並更新 member 的 `payment` 摘要和 session 的 `counts`。

**其他：**
- API 用 Cloud Functions（HTTPS）＋ Express 或 Hono，路由照本文件。
- 排程（提醒、自動結束）用 Cloud Scheduler 每 5 分鐘掃一次到期的 reminders。
- Webhook 重送可以用 Cloud Tasks。
- API 金鑰只存雜湊值（SHA-256），比對時雜湊後比。
- 建議做一個 `GET /health`（不用驗證），回 `{ "ok": true, "version": "1.0.0" }`，機器人可以檢查連線。

---

## 17. 待決事項

| # | 問題 | 目前預設 |
|---|---|---|
| 1 | 開團權限要不要收緊 | 誰都能開（§6.9） |
| 2 | 要不要「本人回報匯款 → 團主確認」流程 | 有（`pending`），不想用的話團主直接記 `confirmed` 即可 |
| 3 | 價格是每人還是每團 | 每人 `price_per_person` |
| 4 | 訂金要不要獨立追蹤 | 只記在場次 `deposit`，收款時 `note: "訂金"`；之後需要再加 `payment.purpose` |
| 5 | 揪團結束後要不要自動寫進劇光燈場次紀錄、發點數 | 這次不做，用 `external_ids` 和 `larp_member_id` 先把關聯留著 |
| 6 | 同館同時段衝突檢查 | 有做場地才檢查，沒有就略過 |
| 7 | 預售券核銷是否串劇光燈 `coupons` | 這次只記 discount，不核銷 |
