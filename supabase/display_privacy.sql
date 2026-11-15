-- 電視掃碼／電視廣告權限收緊
-- 1. display_sessions：原本任何人（含未登入）都能讀寫全部玩家資料，且 Realtime 會把每筆掃碼廣播給所有連線的人
--    → 玩家只能寫自己的；管理員能讀全部（後台統計）；電視端只能用 session 編號查那一筆（RPC）
-- 2. display_ads：原本未登入也能新增／修改／刪除廣告 → 大家都能讀，只有管理員能改
-- 3. display_ads 加進 Realtime（後台改廣告，電視即時更新；原本沒加，所以一直沒生效）

-- ── display_sessions ──
-- 「自己」的判斷跟 users 表一致：登入資料裡的 line_user_id，或 line_<id>@line.invalid 這種信箱
drop policy if exists display_sessions_all on public.display_sessions;

drop policy if exists display_sessions_insert_self on public.display_sessions;
create policy display_sessions_insert_self on public.display_sessions
  for insert to authenticated
  with check (user_id = (auth.jwt() -> 'user_metadata' ->> 'line_user_id') or auth.email() = 'line_' || user_id || '@line.invalid');

drop policy if exists display_sessions_update_self on public.display_sessions;
create policy display_sessions_update_self on public.display_sessions
  for update to authenticated
  using (user_id = (auth.jwt() -> 'user_metadata' ->> 'line_user_id') or auth.email() = 'line_' || user_id || '@line.invalid')
  with check (user_id = (auth.jwt() -> 'user_metadata' ->> 'line_user_id') or auth.email() = 'line_' || user_id || '@line.invalid');

-- 玩家讀自己的（手機端 upsert 遇到同一筆時 Postgres 會檢查讀取權限）；管理員讀全部（後台統計）
drop policy if exists display_sessions_select on public.display_sessions;
create policy display_sessions_select on public.display_sessions
  for select to authenticated
  using (
    (auth.jwt() -> 'user_metadata' ->> 'line_user_id') is null
    or user_id = (auth.jwt() -> 'user_metadata' ->> 'line_user_id')
    or auth.email() = 'line_' || user_id || '@line.invalid'
  );

-- 電視端（未登入）：知道 session 編號（每次隨機 UUID）才查得到那一筆，且只限 1 小時內
create or replace function public.display_session_get(p_session text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select player_data from public.display_sessions
  where session_id = p_session
    and player_data is not null
    and created_at > now() - interval '1 hour'
  limit 1
$$;
revoke all on function public.display_session_get(text) from public;
grant execute on function public.display_session_get(text) to anon, authenticated;

-- 不再透過 Realtime 廣播玩家資料（改用電視自己的頻道通知＋上面的 RPC）
do $$ begin
  if exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'display_sessions') then
    alter publication supabase_realtime drop table public.display_sessions;
  end if;
end $$;

-- ── display_ads ──
drop policy if exists display_ads_all on public.display_ads;

drop policy if exists display_ads_read on public.display_ads;
create policy display_ads_read on public.display_ads
  for select to anon, authenticated
  using (true);

drop policy if exists display_ads_admin_write on public.display_ads;
create policy display_ads_admin_write on public.display_ads
  for all to authenticated
  using ((auth.jwt() -> 'user_metadata' ->> 'line_user_id') is null)
  with check ((auth.jwt() -> 'user_metadata' ->> 'line_user_id') is null);

do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'display_ads') then
    alter publication supabase_realtime add table public.display_ads;
  end if;
end $$;

select 'ok' as result;
