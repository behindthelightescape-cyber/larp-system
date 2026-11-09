-- 雙11預售：訂單多記 utm_content（行銷用來分同平台的不同篇，例如 segment、lastday）
-- 先跑這支，再 npm run deploy:presale（新版建單會寫這個欄位，欄位不存在會建單失敗）
alter table public.presale_orders add column if not exists utm_content text;
select column_name from information_schema.columns where table_name = 'presale_orders' and column_name like 'utm_%' order by 1;
