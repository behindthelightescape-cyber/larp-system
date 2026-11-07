-- =====================================================================
-- 雙11預售：加購單張（SPEC-extra.md，2026-11-07）
-- 傘靈最多 +1、殯儀館最多 +2；滿 6 組才能加購（檢查在 presale-order-create）。
-- 可重複執行。
-- =====================================================================

alter table public.presale_items  add column if not exists max_extra int not null default 0 check (max_extra >= 0);
alter table public.presale_orders add column if not exists extra jsonb not null default '{}'::jsonb;

update public.presale_items set max_extra = 1 where id = 'umbrella';
update public.presale_items set max_extra = 2 where id = 'funeral';

-- 確認並發券：每本 qty 張，再接著發加購的票
create or replace function public.presale_approve(p_order_id uuid, p_admin text)
returns int language plpgsql security definer set search_path = public as $$
declare
  v_order presale_orders%rowtype;
  v_n     int;
  v_count int;
  v_extra int;
  v_want  int;
begin
  update presale_orders
  set status = 'issued', reviewed_at = now(), reviewed_by = p_admin, reject_reason = null
  where id = p_order_id and status = 'reviewing'
  returning * into v_order;
  if not found then
    raise exception '這張訂單不是「待查帳」狀態，無法發券';
  end if;

  v_n := jsonb_array_length(v_order.items);

  -- 組：每本發 qty 張；source_order_line＝(第幾本−1)×qty＋第幾組
  insert into coupons (user_id, title, description, status, expiry_date, coupon_type, source_order_id, source_order_line)
  select v_order.user_id, pi.coupon_title, pi.coupon_desc, 'available', pi.coupon_expiry_date, 'presale',
         v_order.id, ((line.n - 1) * v_order.qty + k)::int
  from jsonb_array_elements(v_order.items) with ordinality as line(item, n)
  join presale_items pi on pi.id = line.item ->> 'id'
  cross join generate_series(1, v_order.qty) as k;
  get diagnostics v_count = row_count;

  if v_count <> v_n * v_order.qty then
    raise exception '有品項找不到，已取消發券';
  end if;

  -- 加購：source_order_line 從 本數×qty＋1 往下編，不會跟組的撞號
  insert into coupons (user_id, title, description, status, expiry_date, coupon_type, source_order_id, source_order_line)
  select v_order.user_id, pi.coupon_title, pi.coupon_desc, 'available', pi.coupon_expiry_date, 'presale',
         v_order.id, (v_n * v_order.qty + row_number() over (order by e.key, k))::int
  from jsonb_each_text(coalesce(v_order.extra, '{}'::jsonb)) as e(key, value)
  join presale_items pi on pi.id = e.key
  cross join generate_series(1, e.value::int) as k;
  get diagnostics v_extra = row_count;

  select coalesce(sum(value::int), 0) into v_want from jsonb_each_text(coalesce(v_order.extra, '{}'::jsonb));
  if v_extra <> v_want then
    raise exception '加購品項找不到，已取消發券';
  end if;

  return v_count + v_extra;
end $$;
revoke all on function public.presale_approve(uuid, text) from public, anon, authenticated;

select id, max_extra from public.presale_items order by sort_order;
