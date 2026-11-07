-- =====================================================================
-- 假的團務 API（supabase/functions/team-mock-api）用的表＋提醒排程
-- 真的團務 app 上線後：改 TEAM_API_URL、跑最下面「拆除」那段、刪掉 team-mock-api。
-- 可重複執行。
-- =====================================================================

create table if not exists public.team_mock_sessions (
  id            text primary key,
  line_group_id text not null,
  status        text not null,
  data          jsonb not null,
  version       int  not null default 1,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists team_mock_sessions_group_idx on public.team_mock_sessions (line_group_id, status);

create table if not exists public.team_mock_idem (
  key         text primary key,
  status      int not null,
  body        jsonb,
  created_at  timestamptz not null default now()
);

alter table public.team_mock_sessions enable row level security;
alter table public.team_mock_idem     enable row level security;
revoke all on public.team_mock_sessions, public.team_mock_idem from anon, authenticated;

-- 每 5 分鐘：送到期的提醒、開場 6 小時後自動結團、清舊的冪等紀錄
select cron.unschedule('team-mock-tick') where exists (select 1 from cron.job where jobname = 'team-mock-tick');
select cron.schedule('team-mock-tick', '*/5 * * * *', $$
  select net.http_post(
    url := 'https://cqbiozfappfwfcahtxfm.supabase.co/functions/v1/team-mock-api/_tick',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  delete from public.team_mock_idem where created_at < now() - interval '1 day';
$$);

-- ── 拆除（真的 API 上線後再跑）───────────────────────────────────────────
-- select cron.unschedule('team-mock-tick');
-- drop table public.team_mock_sessions, public.team_mock_idem;
