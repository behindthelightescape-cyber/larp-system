-- =====================================================================
-- 推播相關設定（2026-11）：在 Supabase SQL Editor 整份貼上執行一次即可
-- 執行前請先部署 Edge Functions：birthday-push-sniper、admin-push、
--   scheduled-push-runner、auth-line
-- =====================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;


-- ---------------------------------------------------------------------
-- 1. 會員最後登入時間（auth-line 每次登入會更新）
-- ---------------------------------------------------------------------
alter table public.users add column if not exists last_login_at timestamptz;

-- 從 auth.users 補回既有登入時間（auth 帳號 email = line_<LINE userId 小寫>@line.invalid）
update public.users u
set last_login_at = a.last_sign_in_at
from auth.users a
where a.email = 'line_' || lower(u.id) || '@line.invalid'
  and a.last_sign_in_at is not null
  and (u.last_login_at is null or u.last_login_at < a.last_sign_in_at);


-- ---------------------------------------------------------------------
-- 2. 預約推播
-- ---------------------------------------------------------------------
create table if not exists public.scheduled_pushes (
  id              uuid primary key default gen_random_uuid(),
  title           text,
  message         text not null,
  target          jsonb not null,           -- 與 admin-push 的 target 相同格式
  send_at         timestamptz not null,
  status          text not null default 'pending'
                  check (status in ('pending', 'sending', 'sent', 'failed', 'cancelled')),
  estimated_count integer,                  -- 建立預約時的預估人數（實際人數在發送當下重新計算）
  result          jsonb,
  error_msg       text,
  push_log_id     uuid,
  created_by      text,
  created_by_name text,
  created_at      timestamptz not null default now(),
  sent_at         timestamptz
);
create index if not exists scheduled_pushes_due_idx on public.scheduled_pushes (send_at) where status = 'pending';

-- 只允許 Edge Function（service role）存取，前端一律透過 admin-push
alter table public.scheduled_pushes enable row level security;


-- ---------------------------------------------------------------------
-- 3. 推播紀錄：每次任務記內容與來源，並記錄每位收件人
-- ---------------------------------------------------------------------
alter table public.push_logs add column if not exists source text;          -- birthday / custom / scheduled
alter table public.push_logs add column if not exists message text;         -- 訊息內容（有 {缺少劇本} 時為範本）
alter table public.push_logs add column if not exists created_by_name text; -- 自訂 / 預約的發送人

update public.push_logs set source = 'birthday' where source is null and task_name like '%壽星%';

create table if not exists public.push_log_recipients (
  id         bigserial primary key,
  log_id     uuid not null references public.push_logs(id) on delete cascade,
  user_id    text not null references public.users(id) on delete cascade,
  status     text not null check (status in ('sent', 'failed')),
  message    text,          -- 個人化後的內容（跟範本不同時才存）
  created_at timestamptz not null default now()
);
create index if not exists push_log_recipients_log_idx on public.push_log_recipients (log_id);
create index if not exists push_log_recipients_user_idx on public.push_log_recipients (user_id, created_at desc);

alter table public.push_log_recipients enable row level security;
drop policy if exists push_log_recipients_admin_select on public.push_log_recipients;
create policy push_log_recipients_admin_select on public.push_log_recipients
  for select to authenticated
  using (((auth.jwt() -> 'user_metadata') ->> 'line_user_id') is null);


-- ---------------------------------------------------------------------
-- 4. 排程（重複執行前先移除同名排程，避免重複）
-- ---------------------------------------------------------------------
select cron.unschedule(jobname) from cron.job
where jobname in ('birthday-push-monthly', 'birthday-push-nov-2026-once', 'scheduled-push-runner');

-- 4a. 每月 1 號台灣 10:00 通知「下個月」壽星
select cron.schedule(
  'birthday-push-monthly',
  '0 2 1 * *',
  $$
  select net.http_post(
    url := 'https://cqbiozfappfwfcahtxfm.supabase.co/functions/v1/birthday-push-sniper',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{"trigger_by": "pg_cron"}'::jsonb
  );
  $$
);

-- 4b. 一次性補發：2026/11/1 台灣 10:05 通知「11 月（本月）」壽星，執行後自動移除
--     （如果執行這份 SQL 時已經過了 11/1 10:05，請改到後台手動處理，並刪掉這段）
select cron.schedule(
  'birthday-push-nov-2026-once',
  '5 2 1 11 *',
  $$
  select net.http_post(
    url := 'https://cqbiozfappfwfcahtxfm.supabase.co/functions/v1/birthday-push-sniper',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{"trigger_by": "pg_cron_once", "month_offset": 0}'::jsonb
  );
  select cron.unschedule('birthday-push-nov-2026-once');
  $$
);

-- 4c. 每 5 分鐘執行到期的預約推播
select cron.schedule(
  'scheduled-push-runner',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := 'https://cqbiozfappfwfcahtxfm.supabase.co/functions/v1/scheduled-push-runner',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);


-- ---------------------------------------------------------------------
-- 檢查
-- ---------------------------------------------------------------------
-- select jobname, schedule, active from cron.job;
-- select * from cron.job_run_details order by start_time desc limit 10;
-- select count(*) filter (where last_login_at is not null) from public.users;
