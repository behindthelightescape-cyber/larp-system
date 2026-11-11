-- 雙11兩個新成就上架（2026-11-11）：江湖俠客、倉鼠試練通關者。傘靈兩邊都算。
-- 格式照「大魔法師」：condition_type='script'，玩過 script_ids 全部即可領取；獎勵先不設（燈燈新衣完成後再掛）。
-- 可重複執行：同名成就已存在就只更新條件與說明。
-- 劇本 id：7 二十四橋明月夜、23 神奈川醫院、33 將雪、46 相思骨、48 殯儀館、52 深夜酒館：傘靈、64 花吃了那女孩
insert into public.achievements (id, title, description, icon_url, condition_type, condition_value, reward_exp, reward_type, status)
select gen_random_uuid()::text, v.title, v.description, v.icon, 'script', v.cond, 0, 'none', 'active'
from (values
  ('江湖俠客',       '走完傘靈、相思骨、將雪、二十四橋明月夜，一趟江湖。', '⚔️', '{"script_ids":[52,46,33,7]}'::jsonb),
  ('倉鼠試練通關者', '闖過傘靈、花吃了那女孩、殯儀館、神奈川醫院，膽子夠大才算通關。', '🐹', '{"script_ids":[52,64,48,23]}'::jsonb)
) as v(title, description, icon, cond)
where not exists (select 1 from public.achievements a where a.title = v.title);

update public.achievements a set description = v.description, icon_url = v.icon, condition_value = v.cond
from (values
  ('江湖俠客',       '走完傘靈、相思骨、將雪、二十四橋明月夜，一趟江湖。', '⚔️', '{"script_ids":[52,46,33,7]}'::jsonb),
  ('倉鼠試練通關者', '闖過傘靈、花吃了那女孩、殯儀館、神奈川醫院，膽子夠大才算通關。', '🐹', '{"script_ids":[52,64,48,23]}'::jsonb)
) as v(title, description, icon, cond)
where a.title = v.title;

select id, title, icon_url, condition_value, status from public.achievements where title in ('大魔法師', '江湖俠客', '倉鼠試練通關者');
