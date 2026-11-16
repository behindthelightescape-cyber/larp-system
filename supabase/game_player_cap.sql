-- 場次掃碼人數上限：掃滿劇本人數就自動關閉；後台按「重新開放」後不再限人數
-- 人數從 scripts.player_limit 文字算：「3 男 3 女」→ 6、「7 ~ 10 人」→ 10、「3~4 男 4 女」→ 8（浮動取最高）

alter table public.games add column if not exists no_cap boolean not null default false;

create or replace function public.player_cap(t text) returns int
language plpgsql immutable as $$
declare
  s text;
  m text[];
  total int := 0;
  x text;
begin
  if t is null then return null; end if;
  -- 範圍取最高：3~4、7 - 8、14 至 20
  s := regexp_replace(t, '(\d+)\s*[~～－—至到-]\s*(\d+)', '\2', 'g');
  -- 有寫「N 人」就以總人數為準
  m := regexp_match(s, '(\d+)\s*人');
  if m is not null then return m[1]::int; end if;
  -- 否則把各角色人數加總（3 男 3 女 1 ？）
  for x in select (regexp_matches(s, '\d+', 'g'))[1] loop
    total := total + x::int;
  end loop;
  return nullif(total, 0);
end $$;

create or replace function public.game_participants_cap() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  g record;
  cap int;
  n int;
begin
  select gm.id, gm.status, gm.no_cap, sc.player_limit
    into g
    from games gm left join scripts sc on sc.id = gm.script_id
   where gm.id = new.game_id
   for update of gm;
  if not found then return new; end if;

  if g.status = 'closed' then
    raise exception 'GAME_CLOSED';
  end if;
  -- 只管開放中的場次（匯入舊資料的 finished 場次不受影響）
  if g.status is distinct from 'open' then return new; end if;

  if exists (select 1 from game_participants where game_id = new.game_id and user_id = new.user_id) then
    raise exception 'ALREADY_JOINED';
  end if;

  if g.no_cap then return new; end if;
  cap := player_cap(g.player_limit);
  if cap is null then return new; end if;

  select count(*) into n from game_participants where game_id = new.game_id;
  if n >= cap then
    raise exception 'GAME_FULL';
  end if;
  if n + 1 >= cap then
    update games set status = 'closed' where id = new.game_id;
  end if;
  return new;
end $$;

drop trigger if exists game_participants_cap on public.game_participants;
create trigger game_participants_cap
  before insert on public.game_participants
  for each row execute function public.game_participants_cap();

-- 確認解析結果（每種寫法各一列）
select player_limit, public.player_cap(player_limit) as cap, count(*) as scripts
  from public.scripts group by player_limit order by 2 nulls first;
