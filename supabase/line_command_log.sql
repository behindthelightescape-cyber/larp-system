-- =====================================================================
-- 燈燈指令使用紀錄：有人打「召喚、我的名片、占卜、我的師門、版規、這車、公車文」就記一筆
-- 寫入：line-webhook（service role）；讀取：後台管理員（非 LINE 登入的帳號）。可重複執行。
-- =====================================================================

create table if not exists public.line_command_log (
  id           bigserial primary key,
  command      text not null,          -- 召喚、我的名片…
  line_user_id text,                   -- 打指令的人
  group_id     text,                   -- 群組（私訊為 null）
  used_at      timestamptz not null default now()
);
create index if not exists line_command_log_used_idx on public.line_command_log (used_at desc);
create index if not exists line_command_log_cmd_idx  on public.line_command_log (command, used_at desc);

alter table public.line_command_log enable row level security;
revoke all on public.line_command_log from anon;
drop policy if exists line_command_log_admin_select on public.line_command_log;
create policy line_command_log_admin_select on public.line_command_log
  for select to authenticated
  using (((auth.jwt() -> 'user_metadata') ->> 'line_user_id') is null);

-- 後台讀群組名稱用（只給管理員看）
drop policy if exists line_groups_admin_select on public.line_groups;
create policy line_groups_admin_select on public.line_groups
  for select to authenticated
  using (((auth.jwt() -> 'user_metadata') ->> 'line_user_id') is null);
grant select on public.line_groups to authenticated;
grant select on public.line_command_log to authenticated;
