-- 推播「已存受眾」（2026-11-12）：存對象模式、篩選條件、指定名單、排除名單；只透過 admin-push（service role）讀寫
create table if not exists public.push_audiences (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  state           jsonb not null,
  created_by_name text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
alter table public.push_audiences enable row level security;
revoke all on public.push_audiences from anon, authenticated;
select count(*) as audiences from public.push_audiences;
