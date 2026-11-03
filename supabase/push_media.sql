-- 推播支援圖片／圖文卡片（2026-11-03）
-- media 格式：
--   null                                         純文字
--   { kind: 'image', image_url }                 圖片＋文字（文字可省略）
--   { kind: 'card', image_url, aspect, card_title, button_label?, button_url? }  圖文卡片
alter table public.scheduled_pushes add column if not exists media jsonb;
alter table public.push_logs add column if not exists media jsonb;
