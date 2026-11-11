# 回覆妘兒：燈燈群組小精靈 × 公車管家（Firestore）免費串接

日期：2026-11-11｜回覆對象：2026-11-10 交接單

## 結論

照交接單的方向做：**不另開 API，在既有 Supabase `line-webhook` 裡加一個 Firestore adapter**，直接透過 Cloud Firestore REST API 讀寫公車管家的原資料。Firestore 仍是唯一資料來源，Supabase 不存團務資料。

機器人這邊的指令處理已經寫好（揪團、+1、名單、繳費、備註、用券……），原本是對 `/api/v1` 呼叫；現在只要把「呼叫 API」那一層換成「讀寫 Firestore」，指令流程不用重寫。

## 1. 費用

- Supabase：沿用 `larp-system` 現有專案，不建新專案、不開任何附加功能。（**請鼻鼻到 Supabase 後台 Billing 頁再確認一次方案是 Free**，我這邊看不到帳務頁。）
- Firebase：只用 Spark 方案本來就免費的兩樣——**Authentication（Email/密碼登入）**和 **Cloud Firestore**。不用 Cloud Functions、不用 Cloud Run、不需要 Blaze。
  - Spark 每日額度：Firestore 讀 5 萬、寫 2 萬。一個指令大約讀 1～3 次、寫 0～1 次，正常使用遠低於額度。
- LINE：第一階段**只用 Reply（回覆）**，不主動推播。Reply 不計入免費則數。
  - 注意：推播到群組是「群組人數 × 則數」計算，一場 6 人的團推一次提醒就算 6 則。自動提醒等確認額度後再談。

## 2. 授權方式（建議）

**建議用「Firebase Authentication 專用機器人帳號 + Security Rules 限定範圍」**，不用服務帳戶：

1. 妘兒在 Firebase 後台 → Authentication → 新增一個使用者，例如 `line-bot@spotlightlarp.com`，設一組長密碼。
2. 這組帳密**只存進 Supabase Edge Function Secrets**（由鼻鼻自己用指令設定，不貼在對話、不進 Git）。
3. 機器人每次用這組帳號換一張 1 小時有效的登入憑證（ID token），用它呼叫 Firestore REST API，**所以 Security Rules 會照常把關**。
4. 妘兒在 Firestore Rules 加一段，只讓這個機器人帳號讀寫「團務」那一個集合，其他資料（例如 283 場歷史統計的 settings）一律不能碰：

```
// 範例，實際要依現有 rules 合併；BOT_UID 換成機器人帳號的 UID
match /users/{ownerUid}/groups/{groupId} {
  allow read, write: if request.auth != null
    && (request.auth.uid == ownerUid || request.auth.uid == 'BOT_UID');
}
```

不用服務帳戶的原因：服務帳戶會**繞過 Security Rules**，權限是整個 Firestore，範圍太大。

## 3. 需要妘兒提供

已從 v2.3.1 程式碼確認：工作區固定是程式裡寫死的唯一擁有者（`OWNER_UID`），路徑 `users/{OWNER_UID}/groups/{groupId}`，這部分不用再提供。

1. **現有的 Firestore 規則**（Firebase 後台 → Firestore → 規則，整段複製；壓縮檔裡沒有 `firestore.rules`）。我要先看現在的規則，再提出最小的修改。
2. **機器人帳號的 UID**（建好帳號後在 Authentication 列表上看得到）。
3. **劇本人數**：v2.3.1 的劇本清單 `script-data.js` 是 10/19 的離線快照，只有「名稱＋原價」，**沒有人數**，也還沒串即時 Google Sheet。機器人可以先讀同一份快照（名稱、價格），人數由開團的人自己打（例如「揪團 傘靈 11/15 19:30 6人」）。若要自動帶人數，需要 Sheet 有人數欄並提供公開網址。

## 4. 寫入衝突（上線前一定要處理）

- 機器人這邊：每次寫入都帶 Firestore 的 `updateTime` 前置條件，文件被別人改過就重讀重算再寫（樂觀鎖）。兩個人同時 +1 不會超賣、不會漏名。
- **網頁那邊需要妘兒改**：v2.3.1 的 `store()` 用 `setDoc` 整份覆寫團務文件。網頁雖然有 `onSnapshot` 即時更新列表，但「表單開著、機器人剛好寫入、再按儲存」時，網頁會用表單打開時的那份舊資料把機器人的 +1、繳費蓋掉。建議：
  - group 文件加一個 `rev`（版本號）欄位，`store('groups', …)` 改用 `runTransaction`：讀最新文件，`rev` 跟表單打開時不同就提示「資料已被更新，請重新開啟」，相同才寫入並 `rev+1`。機器人寫入也遵守同一個 `rev`。
  - 程式裡處理 Sheet 匯入時已經有 `runTransaction` 的寫法，可以照抄。
- 在網頁改好之前，機器人只開「查詢」類指令（本團、名單、未繳），寫入類指令先關閉。

## 5. 資料對應（初稿，拿到程式碼後確認）

| 機器人 | 公車管家 Firestore |
|---|---|
| 場次 session | `users/{ownerUid}/groups/{groupId}` |
| 群組綁定 | group 文件新增 `lineGroupId` 欄位（新欄位，不動舊欄位） |
| 團員 | group 文件裡的 `members` 陣列；新增 `lineUserId` 欄位對應 LINE 身分 |
| 已繳 | `paymentStatus:'paid'`、`amountPaid`、`paidAt`（照網頁收款表單同樣的規則寫，結帳給小黑的算法不變） |
| 用券／優惠 | 只寫 `paymentNote`，**不自動改 `amountDue`**；實收金額由團主「繳費 @人 金額」記，跟網頁一樣用實收算，不會重複扣 |
| 備註／用券 | `paymentNote` 或新增 `note` 欄位（待確認） |
| 狀態 | 程式裡看到 `recruiting`、`confirmed`、`cancelled`、`closed`；需妘兒確認 `recruiting` 在列表、儀表板、結帳的顯示都正常 |
| 人數上限 | `expectedHeadcount`（候補＝超過這個數字的人） |
| 團員欄位 | 照現有格式新增：`id`、`name`、`role:'player'`、`amountDue`（＝團價）、`amountPaid:0`、`paymentStatus:'unpaid'`、`paymentNote`、`joinedAt`、`leftAt:null`、`refundAmount:0` |
| 操作紀錄 | 每次寫入同時在 `logs` 加一筆（例：「LINE：小明 +1」），網頁看得到是機器人改的 |
| 重送去重 | LINE `webhookEventId` 記在 Supabase 的去重表（只存事件編號，不存團務） |

- 日期時間：機器人開的團一律寫精確日期時間；**不改寫既有的文字日期**（如「12/1、2、3」「白天」）。這類舊團機器人只顯示原文字。
- 不碰：`settings/main` 的 `historicalBusTripsV1`（283 場歷史）、舊團名單、結帳給小黑。

## 6. 第一階段指令

| 指令 | 說明 | 寫入？ |
|---|---|---|
| 揪團說明 | 指令列表 | 否 |
| 本團／名單／未繳 | 查這個群組綁定的團 | 否 |
| 劇本 關鍵字 | 查劇本（讀 Google Sheet） | 否 |
| 揪團 劇本 日期 時間 | 開團並綁定這個群組 | 是 |
| +1／-1 | 報名／退出（含候補遞補） | 是 |
| 繳費 @人 [金額] | 團主記款 | 是 |
| 我匯了 後五碼 | 玩家回報，待團主確認 | 是 |
| 備註／用券 | 記在團員身上 | 是 |
| 成團／取消團／結團／改時間 | 團主操作 | 是 |

**先不做**：自動推播提醒、對外 REST API、`/webhooks`、劇本寫入。

## 7. 實作與驗收順序

1. 拿到第 3 節的資料 → 對照程式碼和 rules，確認欄位對應。
2. 寫 Firestore adapter（只讀）→ 用 `is_test` 測試團驗證查詢。
3. 妘兒改網頁寫入方式 → 開寫入指令 → 跑交接單「安全與一致性驗收」整份清單，附測試紀錄。
4. 都過了才在正式群組打開「揪團」開關。
