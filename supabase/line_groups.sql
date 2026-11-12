-- =====================================================================
-- 燈燈被拉進／踢出的 LINE 群組紀錄（揪團第一步：認識群組）
-- 機器人被加進群組（join 事件）時記下群組編號、名稱、頭像；被踢出（leave）時記離開時間。
-- 只有後端（service role）讀寫。可重複執行。
-- =====================================================================

create table if not exists public.line_groups (
  group_id     text primary key,               -- LINE groupId（C 開頭）
  group_name   text,                           -- 加入當下的群組名稱
  picture_url  text,
  joined_at    timestamptz not null default now(),
  left_at      timestamptz,                    -- 被踢出時間；再被拉進來會清空
  updated_at   timestamptz not null default now()
);
alter table public.line_groups enable row level security;
revoke all on public.line_groups from anon, authenticated;
