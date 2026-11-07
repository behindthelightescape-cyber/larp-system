-- =====================================================================
-- 揪團（團務 app 串接）— 群組機器人這邊需要的東西。規格：docs/group-session-api.md
-- 揪團資料本身都在團務 app（Firebase），這裡只放：
--   1. Webhook 去重（app 重送時不要在群組講兩次）
--   2. 功能開關 feature_team（預設關，在後台「LINE 功能開關」打開）
-- 可重複執行。
-- =====================================================================

create table if not exists public.team_webhook_deliveries (
  id           text primary key,          -- X-Webhook-Id
  type         text,
  received_at  timestamptz not null default now()
);
alter table public.team_webhook_deliveries enable row level security;
revoke all on public.team_webhook_deliveries from anon, authenticated;

insert into public.group_settings (key, value) values ('feature_team', 'false')
on conflict (key) do nothing;

-- 清掉 7 天前的去重紀錄
select cron.unschedule('team-webhook-dedupe-clean') where exists (select 1 from cron.job where jobname = 'team-webhook-dedupe-clean');
select cron.schedule('team-webhook-dedupe-clean', '17 4 * * *', $$
  delete from public.team_webhook_deliveries where received_at < now() - interval '7 days';
$$);
