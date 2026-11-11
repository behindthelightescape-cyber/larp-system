-- 預約推播改成每小時整點檢查一次（原本每 5 分鐘）。2026-11-12
select cron.alter_job(
  (select jobid from cron.job where jobname = 'scheduled-push-runner'),
  schedule := '0 * * * *'
);
select jobname, schedule, active from cron.job where jobname = 'scheduled-push-runner';
