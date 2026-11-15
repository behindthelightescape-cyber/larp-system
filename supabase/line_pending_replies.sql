-- =====================================================================
-- 燈燈漏回的「工作」訊息（公車表指令、車友名單）
--   回覆時 LINE 說 replyToken 失效 → 原本要說的話存這裡
--   同一個群組下一次有人說話／點按鈕／加入 → 用那次的新 token 補回（不用 push，不花額度）
--   超過 2 小時沒補到就不補了。名片、占卜等娛樂指令不存。
-- 只有後端（service role）讀寫。可重複執行。
-- =====================================================================

create table if not exists public.line_pending_replies (
  id            bigserial primary key,
  group_id      text not null,
  messages      jsonb not null,           -- 原本要回的 LINE 訊息陣列
  tag           text,                     -- bus / roster / rosterJoin
  created_at    timestamptz not null default now(),
  delivered_at  timestamptz
);
create index if not exists line_pending_replies_group_idx
  on public.line_pending_replies (group_id, created_at) where delivered_at is null;

alter table public.line_pending_replies enable row level security;
revoke all on public.line_pending_replies from anon, authenticated;
