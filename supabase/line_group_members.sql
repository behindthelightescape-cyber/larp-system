-- =====================================================================
-- 燈燈記群組成員，並自動寫進公車管家 App 的團員名單（省去妘兒手動 key 名字）
--   有人加入群組、或在群組說話 → 記一筆（LINE 名稱、頭貼、加入／退出時間）
--   這個群組在公車管家裡找得到那團（一鍵成團後）→ 名字寫進那團的團員名單
-- 只有後端（service role）寫；後台管理員可讀。可重複執行。
-- =====================================================================

create table if not exists public.line_group_members (
  group_id       text not null,
  line_user_id   text not null,
  display_name   text,
  picture_url    text,
  joined_at      timestamptz,          -- 看到加入事件的時間（燈燈進群前就在的人是 null）
  left_at        timestamptz,          -- 退出群組
  first_seen_at  timestamptz not null default now(),
  last_seen_at   timestamptz not null default now(),
  app_member_id  text,                 -- 寫進公車管家後，那位團員的 id
  app_synced_at  timestamptz,
  primary key (group_id, line_user_id)
);
create index if not exists line_group_members_user_idx on public.line_group_members (line_user_id);

alter table public.line_group_members enable row level security;
revoke all on public.line_group_members from anon;
drop policy if exists line_group_members_admin_select on public.line_group_members;
create policy line_group_members_admin_select on public.line_group_members
  for select to authenticated
  using (((auth.jwt() -> 'user_metadata') ->> 'line_user_id') is null);
grant select on public.line_group_members to authenticated;

-- 這個 LINE 群組對到公車管家的哪一團（找到一次就記住）
alter table public.line_groups add column if not exists app_group_id      text;
alter table public.line_groups add column if not exists app_sync_tried_at timestamptz; -- 上次去公車管家找團的時間（還沒成團時 10 分鐘最多找一次）
