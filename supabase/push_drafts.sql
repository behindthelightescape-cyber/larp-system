-- 推播草稿（2026-11-12）：存整個推播頁的狀態（對象、條件、對話框），只透過 admin-push（service role）讀寫
create table if not exists public.push_drafts (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  state           jsonb not null,
  created_by_name text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
alter table public.push_drafts enable row level security;
revoke all on public.push_drafts from anon, authenticated;
select count(*) as drafts from public.push_drafts;
