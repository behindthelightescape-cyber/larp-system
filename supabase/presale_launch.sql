-- =====================================================================
-- 雙11預售：提早正式開賣（2026-11-09 決定）
-- 執行當下立刻開賣，結束時間不變（11/17 23:59）。
-- 會做：1. 刪掉所有測試訂單和它們發出的測試券  2. 訂單編號從 0001 重新開始
--       3. 關掉測試模式  4. 開賣時間改成現在
-- 只跑一次。跑之前若有「真的」訂單（is_test = false），第 1 步不會動到它們。
-- =====================================================================
begin;

-- 1. 測試資料：先刪券（只刪還沒用掉的），再刪訂單
delete from public.coupons c
using public.presale_orders o
where c.source_order_id = o.id and o.is_test and c.status = 'available';

delete from public.presale_orders o
where o.is_test
  and not exists (select 1 from public.coupons c where c.source_order_id = o.id); -- 有券被用掉的測試單留著，避免券找不到來源

-- 2. 沒有任何訂單了才把編號歸零（避免和真訂單撞號）
do $$
begin
  if not exists (select 1 from public.presale_orders) then
    perform setval('public.presale_order_no_seq', 1, false);
  end if;
end $$;

-- 3. 關測試模式
update public.presale_settings set test_mode = false, updated_at = now() where id = 1;

-- 4. 現在開賣
update public.presale_items set sale_start = now() where sale_start > now();

commit;

-- 確認
select (select test_mode from public.presale_settings) as test_mode,
       (select min(sale_start) from public.presale_items) as sale_start,
       (select max(sale_end) from public.presale_items) as sale_end,
       (select count(*) from public.presale_orders) as orders_left,
       (select count(*) from public.coupons where coupon_type = 'presale') as presale_coupons_left;
