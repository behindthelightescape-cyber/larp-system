-- =====================================================================
-- 雙 11 劇本預售票（2026-11-06）— 規格：WORDPRESS\spotlight-home\presale\SPEC.md
-- 整份執行一次即可（可重複執行）。執行後再部署 Edge Functions：npm run deploy:presale
-- 所有 presale_* 表都只給 Edge Function（service role）讀寫，前端一律走 Edge Function。
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. 設定（只有一列）：匯款帳號、測試模式
-- ---------------------------------------------------------------------
create table if not exists public.presale_settings (
  id            int primary key default 1 check (id = 1),
  bank_name     text,     -- 例：國泰世華
  bank_code     text,     -- 例：013
  account_no    text,
  account_name  text,     -- 戶名
  remit_note    text,     -- 匯款頁額外說明（選填）
  -- 測試模式：開賣前可以建單測試（無視 sale_start），建出的訂單標記 is_test。正式開賣前要關掉。
  test_mode     boolean not null default true,
  updated_at    timestamptz not null default now()
);
insert into public.presale_settings (id) values (1) on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- 2. 品項：id 直接用網站的代號（umbrella、acacia…）
-- ---------------------------------------------------------------------
create table if not exists public.presale_items (
  id            text primary key,
  script_name   text not null,
  title         text not null,
  price         int  not null check (price >= 0),  -- 現行單價（參與計算）
  later_price   int,                               -- 2/4 起票價（只給網站顯示）
  group_key     text,                              -- 路線，逗號分隔，例 'jianghu,hamster'
  image_url     text,
  coupon_title  text not null,
  coupon_desc   text,
  coupon_expiry_date timestamptz,                  -- null = 無期限
  is_active     boolean not null default true,
  sale_start    timestamptz,
  sale_end      timestamptz,
  sort_order    int not null default 0
);

create table if not exists public.presale_tiers (
  min_qty           int primary key check (min_qty >= 1),
  discount_per_item int not null check (discount_per_item >= 0)
);

-- 第一檔資料（SPEC §8）。重複執行會覆寫成規格上的數字。
insert into public.presale_items (id, script_name, title, price, later_price, group_key, coupon_title, coupon_desc, sale_start, sale_end, sort_order) values
  ('umbrella', '傘靈',           '《傘靈》預售票',           700,  800,  'jianghu,hamster', '雙11｜傘靈',           null, '2026-11-11 00:00+08', '2026-11-17 23:59:59+08', 1),
  ('acacia',   '相思骨',         '《相思骨》預售票',         750,  800,  'jianghu',         '雙11｜相思骨',         null, '2026-11-11 00:00+08', '2026-11-17 23:59:59+08', 2),
  ('snow',     '將雪',           '《將雪》預售票',           700,  800,  'jianghu',         '雙11｜將雪',           null, '2026-11-11 00:00+08', '2026-11-17 23:59:59+08', 3),
  ('bridge',   '二十四橋明月夜', '《二十四橋明月夜》預售票', 1400, 1400, 'jianghu',         '雙11｜二十四橋明月夜', null, '2026-11-11 00:00+08', '2026-11-17 23:59:59+08', 4),
  ('flower',   '花吃了那女孩',   '《花吃了那女孩》預售票',   750,  750,  'hamster',         '雙11｜花吃了那女孩',   null, '2026-11-11 00:00+08', '2026-11-17 23:59:59+08', 5),
  ('funeral',  '殯儀館',         '《殯儀館》預售票',         750,  850,  'hamster',         '雙11｜殯儀館',         null, '2026-11-11 00:00+08', '2026-11-17 23:59:59+08', 6),
  ('kanagawa', '神奈川醫院',     '《神奈川醫院》預售票',     800,  850,  'hamster',         '雙11｜神奈川醫院',     null, '2026-11-11 00:00+08', '2026-11-17 23:59:59+08', 7)
on conflict (id) do update set
  script_name = excluded.script_name, title = excluded.title, price = excluded.price, later_price = excluded.later_price,
  group_key = excluded.group_key, coupon_title = excluded.coupon_title,
  sale_start = excluded.sale_start, sale_end = excluded.sale_end, sort_order = excluded.sort_order;

update public.presale_items
set coupon_desc = '一張票＝一位玩家玩一場，台北館適用，無使用期限。同一場可用多張，不與其他優惠併用。預約時仍須依劇本規定付訂金（全團用票券者，訂金於遊戲當日退還）。'
where coupon_desc is null;

insert into public.presale_tiers (min_qty, discount_per_item) values (2, 50), (4, 100), (7, 150)
on conflict (min_qty) do update set discount_per_item = excluded.discount_per_item;

-- ---------------------------------------------------------------------
-- 3. 訂單
-- ---------------------------------------------------------------------
create sequence if not exists public.presale_order_no_seq;

create table if not exists public.presale_orders (
  id                uuid primary key default gen_random_uuid(),
  code              text not null unique,           -- 網址用，隨機 32 字元
  order_no          text not null unique,           -- 給人看，例 PS261111-0001
  user_id           text references public.users(id),
  items             jsonb not null,                 -- [{id,title,price}]，每本一列
  subtotal          int not null,
  discount          int not null,
  total             int not null,
  status            text not null default 'unclaimed'
                    check (status in ('unclaimed','awaiting_payment','reviewing','issued','cancelled','expired')),
  contact_name      text,
  contact_phone     text,
  contact_email     text,
  remit_date        date,
  remit_last5       text,
  remit_amount      int,
  remit_reported_at timestamptz,
  reviewed_at       timestamptz,
  reviewed_by       text,
  reject_reason     text,
  utm_source        text,
  utm_medium        text,
  utm_campaign      text,
  is_test           boolean not null default false,
  created_at        timestamptz not null default now(),
  claimed_at        timestamptz,
  pay_deadline      timestamptz
);
create index if not exists presale_orders_user_idx on public.presale_orders (user_id);
create index if not exists presale_orders_status_idx on public.presale_orders (status, created_at desc);

-- 建單限流（同 IP 每分鐘 ≤ 10 次）
create table if not exists public.presale_rate (
  ip  text not null,
  at  timestamptz not null default now()
);
create index if not exists presale_rate_idx on public.presale_rate (ip, at);

-- 全部只給 service role：開 RLS、不開任何 policy、收回前端權限
alter table public.presale_settings enable row level security;
alter table public.presale_items    enable row level security;
alter table public.presale_tiers    enable row level security;
alter table public.presale_orders   enable row level security;
alter table public.presale_rate     enable row level security;
revoke all on public.presale_settings, public.presale_items, public.presale_tiers, public.presale_orders, public.presale_rate from anon, authenticated;

-- ---------------------------------------------------------------------
-- 4. coupons：記錄來源訂單，同一訂單同一行不會發兩次
-- ---------------------------------------------------------------------
alter table public.coupons add column if not exists source_order_id uuid;
alter table public.coupons add column if not exists source_order_line int;
create unique index if not exists coupons_source_order_line_uniq
  on public.coupons (source_order_id, source_order_line) where source_order_id is not null;

-- 玩家（LINE 登入）不能自己新增預售券
drop policy if exists coupons_insert_auth on public.coupons;
create policy coupons_insert_auth on public.coupons for insert to authenticated
  with check (
    (auth.jwt() -> 'user_metadata' ->> 'line_user_id') is null
    or (coupon_type is distinct from 'presale' and source_order_id is null)
  );

-- 玩家不能修改預售券（只允許 redeem_my_coupon 的「available → used」），也不能把別的券改成預售券
create or replace function public.coupons_guard_presale()
returns trigger language plpgsql as $$
begin
  if (auth.jwt() -> 'user_metadata' ->> 'line_user_id') is null then
    return new; -- 後台帳號、service role
  end if;
  if new.coupon_type = 'presale' or new.source_order_id is not null then
    if old.coupon_type is distinct from 'presale' and old.source_order_id is null then
      raise exception '不能把票券改成預售券';
    end if;
  end if;
  if old.coupon_type = 'presale' or old.source_order_id is not null then
    if not (old.status = 'available' and new.status = 'used'
            and new.id = old.id and new.user_id is not distinct from old.user_id
            and new.title = old.title and new.description is not distinct from old.description
            and new.expiry_date is not distinct from old.expiry_date
            and new.coupon_type is not distinct from old.coupon_type
            and new.source_order_id is not distinct from old.source_order_id
            and new.source_order_line is not distinct from old.source_order_line) then
      raise exception '預售券不能修改';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists coupons_guard_presale on public.coupons;
create trigger coupons_guard_presale before update on public.coupons
  for each row execute function public.coupons_guard_presale();

-- ---------------------------------------------------------------------
-- 5. 確認並發券：同一個交易裡改狀態＋逐本發券。只有 service role 能呼叫。
-- ---------------------------------------------------------------------
create or replace function public.presale_approve(p_order_id uuid, p_admin text)
returns int language plpgsql security definer set search_path = public as $$
declare
  v_order presale_orders%rowtype;
  v_count int;
begin
  update presale_orders
  set status = 'issued', reviewed_at = now(), reviewed_by = p_admin, reject_reason = null
  where id = p_order_id and status = 'reviewing'
  returning * into v_order;
  if not found then
    raise exception '這張訂單不是「待查帳」狀態，無法發券';
  end if;

  insert into coupons (user_id, title, description, status, expiry_date, coupon_type, source_order_id, source_order_line)
  select v_order.user_id, pi.coupon_title, pi.coupon_desc, 'available', pi.coupon_expiry_date, 'presale',
         v_order.id, line.n::int
  from jsonb_array_elements(v_order.items) with ordinality as line(item, n)
  join presale_items pi on pi.id = line.item ->> 'id';
  get diagnostics v_count = row_count;

  if v_count <> jsonb_array_length(v_order.items) then
    raise exception '有品項找不到，已取消發券';
  end if;
  return v_count;
end $$;
revoke all on function public.presale_approve(uuid, text) from public, anon, authenticated;

-- 產生訂單編號（PSyyMMdd-0001，台灣日期）
create or replace function public.presale_next_order_no()
returns text language sql security definer set search_path = public as $$
  select 'PS' || to_char(now() at time zone 'Asia/Taipei', 'YYMMDD') || '-' || lpad(nextval('presale_order_no_seq')::text, 4, '0')
$$;
revoke all on function public.presale_next_order_no() from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 6. 排程：每小時把超過 24 小時沒認領的訂單改成 expired、清掉舊的限流紀錄
-- ---------------------------------------------------------------------
select cron.unschedule('presale-expire') where exists (select 1 from cron.job where jobname = 'presale-expire');
select cron.schedule('presale-expire', '7 * * * *', $$
  update public.presale_orders set status = 'expired'
  where status = 'unclaimed' and created_at < now() - interval '24 hours';
  delete from public.presale_rate where at < now() - interval '1 hour';
$$);
