-- 推播一次送多個對話框（2026-11-12）：第 2 個起的對話框存在 extra（[{message, media}]）
-- 先跑這支，再部署 admin-push、scheduled-push-runner（npm run deploy:push）
alter table public.push_logs        add column if not exists extra jsonb;
alter table public.scheduled_pushes add column if not exists extra jsonb;
select table_name, column_name from information_schema.columns
where column_name = 'extra' and table_name in ('push_logs', 'scheduled_pushes');
