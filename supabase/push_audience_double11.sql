-- 建立受眾「雙11-中手未買」（2026-11-12）：LV2～3、總共 3～8 場、近 60 天有來、雙11 七本玩過 0～1 本；
-- 排除已買預售票、今天收過推播。重複執行會更新同名受眾。
with v as (select '雙11-中手未買'::text as name, jsonb_build_object(
  'mode', 'filter',
  'saved_on', '2026-11-12',
  'selected', '[]'::jsonb,
  'excluded', '[]'::jsonb,
  'filter', jsonb_build_object(
    'level_min', 2, 'level_max', 3, 'points_min', '',
    'joined_after', '', 'joined_before', '', 'birthday_month', '',
    'login_status', '', 'last_login_after', '', 'last_login_before', '',
    'play_count_min', 3, 'play_count_max', 8,
    'last_played_after', '2026-09-13', 'last_played_before', '',
    'played_scripts', '[52,46,33,7,64,48,23]'::jsonb, 'played_scripts_min', 0, 'played_scripts_max', 1,
    'not_played_scripts', '[]'::jsonb,
    'achievement_id', '', 'achievement_missing_max', '', 'achievement_mode', '',
    'categories', '[]'::jsonb, 'branches', '[]'::jsonb, 'has_coupon', false,
    'exclude_presale_buyers', true, 'exclude_pushed_days', 1
  )) as state)
, upd as (
  update public.push_audiences a set state = v.state, updated_at = now() from v where a.name = v.name returning a.id
)
insert into public.push_audiences (name, state, created_by_name)
select v.name, v.state, 'Claude' from v where not exists (select 1 from upd);
select name, updated_at from public.push_audiences order by updated_at desc;
