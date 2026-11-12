-- 可以用燈燈改公車表的導遊（會員編號，逗號分隔）：00000002 喬、00000015 妘兒
insert into public.group_settings (key, value) values ('bus_editors', '00000002,00000015')
on conflict (key) do update set value = excluded.value;
