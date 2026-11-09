-- 雙11預售：2/4 起票價（later_price，只給網站顯示「2/4 起」比價和券面 {漲價後}，不影響預售售價）
-- 2026-11-10：花吃了那女孩 750 → 800、二十四橋明月夜 1400 → 1600
update public.presale_items set later_price = 800  where id = 'flower';
update public.presale_items set later_price = 1600 where id = 'bridge';
select id, script_name, price, later_price from public.presale_items order by sort_order;
