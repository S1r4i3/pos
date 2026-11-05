-- =====================================================================
--  RestoPOS — Initial database schema (Supabase / PostgreSQL 15+)
-- =====================================================================
--  HOW TO RUN
--    Supabase Dashboard → SQL Editor → New query → paste this whole file
--    → Run.  (Or: `supabase db push` if you use the Supabase CLI.)
--
--  WHAT THIS FILE CREATES
--    1. Extensions, enums (fixed lists of values) and helper functions
--    2. Tables for: organisations & outlets, staff & roles, menu, tables,
--       customers, orders & billing, KOT/KDS, payments, inventory, audit
--    3. Triggers that keep data consistent automatically
--       (audit fields, GST maths, table status, stock deduction, dues)
--    4. Row Level Security (RLS) — every role sees only what it may see
--    5. Realtime + Storage (images) setup
--
--  DESIGN RULES
--    * Every business table carries org_id or outlet_id, so one owner's
--      data can never mix with another owner's.
--    * Money uses numeric(12,2) (never float). All amounts are in ₹.
--    * Orders, KOTs and payments are written ONLY through secure database
--      functions (added in Phases 3–4). The browser can read them (if its
--      role allows) but cannot edit totals, discounts or payments directly.
--    * Item names/prices are copied onto the order at the time of sale, so
--      changing the menu later never changes old bills.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. Extensions & schemas
-- ---------------------------------------------------------------------
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;   -- PIN hashing

-- "private" holds internal helper functions. Supabase does NOT expose this
-- schema through its API, so the browser can never call these directly.
create schema if not exists private;

-- ---------------------------------------------------------------------
-- 1. Enums
-- ---------------------------------------------------------------------
create type public.app_role            as enum ('owner','manager','cashier','waiter','kitchen');
create type public.food_type           as enum ('veg','non_veg','egg');
create type public.order_type          as enum ('dine_in','takeaway','delivery');
create type public.order_status        as enum ('open','billed','settled','cancelled');
create type public.order_item_status   as enum ('active','void');
create type public.kot_status          as enum ('new','preparing','ready','served','cancelled');
create type public.table_status        as enum ('free','occupied','bill_printed');
create type public.discount_type       as enum ('flat','percent');
create type public.payment_mode        as enum ('cash','upi','card','due','loyalty','other');
create type public.stock_movement_type as enum ('opening','purchase','sale','sale_reversal','wastage','adjustment');
create type public.purchase_status     as enum ('draft','received','cancelled');

-- ---------------------------------------------------------------------
-- 2. Generic trigger: audit fields (created_at/by, updated_at/by)
--    The browser cannot fake created_by — it is always the logged-in user.
-- ---------------------------------------------------------------------
create or replace function private.set_audit_fields()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    new.created_at := now();
    new.created_by := coalesce(auth.uid(), new.created_by);
  else
    new.created_at := old.created_at;
    new.created_by := old.created_by;
  end if;
  new.updated_at := now();
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  return new;
end $$;

-- For append-only tables (only created_at / created_by)
create or replace function private.set_created_fields()
returns trigger language plpgsql as $$
begin
  new.created_at := now();
  new.created_by := coalesce(auth.uid(), new.created_by);
  return new;
end $$;

-- =====================================================================
-- 3. ORGANISATION, OUTLETS, TAX, STAFF
-- =====================================================================

-- One row per business (the owner's account). An owner can run many outlets.
create table public.organizations (
  id                        uuid primary key default gen_random_uuid(),
  name                      text not null check (char_length(name) between 2 and 120),
  owner_id                  uuid not null references auth.users(id),
  phone                     text,
  email                     text,
  -- loyalty programme (simple): earn X% of bill as points, 1 point = ₹ point_value
  loyalty_enabled           boolean not null default false,
  loyalty_earn_percent      numeric(5,2) not null default 0 check (loyalty_earn_percent between 0 and 100),
  loyalty_point_value       numeric(8,2) not null default 1 check (loyalty_point_value > 0),
  loyalty_min_redeem_points numeric(12,2) not null default 0 check (loyalty_min_redeem_points >= 0),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid references auth.users(id) on delete set null default auth.uid(),
  updated_by  uuid references auth.users(id) on delete set null
);
create index organizations_owner_idx on public.organizations(owner_id);

create table public.outlets (
  id                     uuid primary key default gen_random_uuid(),
  org_id                 uuid not null references public.organizations(id) on delete cascade,
  name                   text not null check (char_length(name) between 2 and 120),
  -- short code used in invoice numbers, e.g. "MG1" → MG1/2627/000123
  code                   text not null check (code ~ '^[A-Z0-9]{1,4}$'),
  outlet_type            text not null default 'restaurant'
                         check (outlet_type in ('restaurant','cafe','cloud_kitchen','qsr','bar','other')),
  address_line1          text,
  address_line2          text,
  city                   text,
  state                  text,
  state_code             text check (state_code is null or state_code ~ '^[0-9]{2}$'),  -- GST state code, e.g. 36 = Telangana
  pincode                text check (pincode is null or pincode ~ '^[1-9][0-9]{5}$'),
  phone                  text,
  email                  text,
  gstin                  text check (gstin is null or gstin ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$'),
  fssai_no               text check (fssai_no is null or fssai_no ~ '^[0-9]{14}$'),
  logo_url               text,
  -- tax & charges
  prices_include_tax     boolean not null default false,  -- true = menu prices already include GST
  service_charge_enabled boolean not null default false,  -- service charge must be optional for the guest
  service_charge_rate    numeric(5,2) not null default 0 check (service_charge_rate between 0 and 20),
  -- business day: sales after midnight but before this hour count for the previous day
  day_start_hour         smallint not null default 4 check (day_start_hour between 0 and 23),
  timezone               text not null default 'Asia/Kolkata',
  -- receipt
  receipt_header         text,
  receipt_footer         text default 'Thank you! Visit again.',
  printer_paper_width    smallint not null default 80 check (printer_paper_width in (58,80)),
  is_active              boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid references auth.users(id) on delete set null default auth.uid(),
  updated_by  uuid references auth.users(id) on delete set null,
  unique (org_id, code),
  unique (id, org_id)            -- lets child tables use a safe composite foreign key
);
create index outlets_org_idx on public.outlets(org_id);

-- GST slabs. Restaurants usually: 5% (2.5 + 2.5) or 18% (9 + 9).
create table public.tax_groups (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  name        text not null,
  cgst_rate   numeric(5,2) not null default 0 check (cgst_rate between 0 and 50),
  sgst_rate   numeric(5,2) not null default 0 check (sgst_rate between 0 and 50),
  total_rate  numeric(5,2) generated always as (cgst_rate + sgst_rate) stored,
  is_default  boolean not null default false,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid references auth.users(id) on delete set null default auth.uid(),
  updated_by  uuid references auth.users(id) on delete set null,
  unique (org_id, name),
  unique (id, org_id)
);
create unique index tax_groups_one_default on public.tax_groups(org_id) where is_default;

-- Staff: everyone who works for the organisation, including the owner.
create table public.staff_members (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  user_id     uuid references auth.users(id) on delete set null,  -- their login (null = no login, e.g. helper)
  full_name   text not null check (char_length(full_name) between 1 and 80),
  phone       text,
  email       text,
  role        public.app_role not null,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid references auth.users(id) on delete set null default auth.uid(),
  updated_by  uuid references auth.users(id) on delete set null,
  unique (org_id, user_id),
  unique (id, org_id)
);
create index staff_members_user_idx on public.staff_members(user_id) where is_active;
create index staff_members_org_idx  on public.staff_members(org_id);

-- Which outlets a staff member works at (owners automatically see all).
create table public.staff_outlets (
  staff_id    uuid not null,
  outlet_id   uuid not null,
  org_id      uuid not null,
  created_at  timestamptz not null default now(),
  created_by  uuid references auth.users(id) on delete set null default auth.uid(),
  primary key (staff_id, outlet_id),
  foreign key (staff_id, org_id)  references public.staff_members(id, org_id) on delete cascade,
  foreign key (outlet_id, org_id) references public.outlets(id, org_id)       on delete cascade
);
create index staff_outlets_outlet_idx on public.staff_outlets(outlet_id);

-- Cashier PINs. Hashed with bcrypt. NO policies → invisible to the browser.
-- Only server code (service role) and secure functions can read it.
create table public.staff_pins (
  staff_id         uuid primary key references public.staff_members(id) on delete cascade,
  pin_hash         text not null,
  failed_attempts  smallint not null default 0,
  locked_until     timestamptz,
  updated_at       timestamptz not null default now()
);

-- Registered POS devices (tablets/counters). PIN login only works on a
-- device that an owner/manager has registered — stops PIN guessing from
-- random computers.
create table public.pos_devices (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null,
  outlet_id     uuid not null,
  name          text not null,
  token_hash    text not null unique,      -- sha256 of the secret stored on the device
  last_seen_at  timestamptz,
  is_active     boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid references auth.users(id) on delete set null default auth.uid(),
  updated_by  uuid references auth.users(id) on delete set null,
  foreign key (outlet_id, org_id) references public.outlets(id, org_id) on delete cascade
);
create index pos_devices_outlet_idx on public.pos_devices(outlet_id);

-- Atomic running numbers (order no, KOT no, invoice no). No policies.
create table public.outlet_counters (
  outlet_id    uuid not null references public.outlets(id) on delete cascade,
  counter_key  text not null,          -- 'order' | 'kot' | 'invoice'
  period       text not null,          -- '2026-11-05' for daily, '2627' for financial year
  last_value   integer not null default 0,
  primary key (outlet_id, counter_key, period)
);

-- =====================================================================
-- 4. RLS HELPER FUNCTIONS
--    Return the org/outlet ids the logged-in user may access. Policies use
--    "outlet_id in (select private.my_outlet_ids(...))" which Postgres
--    evaluates once per query → fast even on big report queries.
-- =====================================================================
create or replace function private.my_org_ids(p_roles public.app_role[] default null)
returns setof uuid language sql stable security definer set search_path = '' as $$
  select sm.org_id
  from public.staff_members sm
  where sm.user_id = auth.uid()
    and sm.is_active
    and (p_roles is null or sm.role = any(p_roles));
$$;

create or replace function private.my_outlet_ids(p_roles public.app_role[] default null)
returns setof uuid language sql stable security definer set search_path = '' as $$
  select o.id
  from public.staff_members sm
  join public.outlets o on o.org_id = sm.org_id
  where sm.user_id = auth.uid()
    and sm.is_active
    and (p_roles is null or sm.role = any(p_roles))
    and (sm.role = 'owner'
         or exists (select 1 from public.staff_outlets so
                    where so.staff_id = sm.id and so.outlet_id = o.id));
$$;

-- The current user's role in an organisation (null if not a member)
create or replace function private.my_role(p_org uuid)
returns public.app_role language sql stable security definer set search_path = '' as $$
  select sm.role from public.staff_members sm
  where sm.org_id = p_org and sm.user_id = auth.uid() and sm.is_active
  limit 1;
$$;

-- Used inside the secure order/billing functions (Phase 3+):
-- raises an error unless the user has one of the roles at this outlet.
create or replace function private.assert_outlet_role(p_outlet uuid, p_roles public.app_role[])
returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if not exists (select 1 from private.my_outlet_ids(p_roles) x where x = p_outlet) then
    raise exception 'Permission denied for this outlet' using errcode = '42501';
  end if;
end $$;

-- Business date for an outlet (respects day_start_hour and timezone)
create or replace function private.business_date(p_outlet uuid, p_ts timestamptz default now())
returns date language sql stable security definer set search_path = '' as $$
  select ((p_ts at time zone o.timezone) - make_interval(hours => o.day_start_hour))::date
  from public.outlets o where o.id = p_outlet;
$$;

-- Indian financial year label: 5 Nov 2026 → '2627'
create or replace function private.financial_year(p_date date)
returns text language sql immutable as $$
  select case when extract(month from p_date) >= 4
              then to_char(p_date, 'YY') || to_char(p_date + interval '1 year', 'YY')
              else to_char(p_date - interval '1 year', 'YY') || to_char(p_date, 'YY')
         end;
$$;

-- Next running number, safe even when 5 cashiers bill at the same second
create or replace function private.next_counter(p_outlet uuid, p_key text, p_period text)
returns integer language sql volatile security definer set search_path = '' as $$
  insert into public.outlet_counters as c (outlet_id, counter_key, period, last_value)
  values (p_outlet, p_key, p_period, 1)
  on conflict (outlet_id, counter_key, period)
  do update set last_value = c.last_value + 1
  returning last_value;
$$;

-- =====================================================================
-- 5. MENU
-- =====================================================================

-- Kitchen sections that get their own KOT (e.g. "Main Kitchen", "Bar", "Tandoor")
create table public.kitchen_stations (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null,
  outlet_id   uuid not null,
  name        text not null,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid references auth.users(id) on delete set null default auth.uid(),
  updated_by  uuid references auth.users(id) on delete set null,
  unique (outlet_id, name),
  unique (id, outlet_id),
  foreign key (outlet_id, org_id) references public.outlets(id, org_id) on delete cascade
);

-- Menu is shared by all outlets of an organisation; prices/stock can differ per outlet.
create table public.menu_categories (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 60),
  color       text,                       -- button colour on POS, e.g. '#F97316'
  sort_order  integer not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid references auth.users(id) on delete set null default auth.uid(),
  updated_by  uuid references auth.users(id) on delete set null,
  unique (org_id, name),
  unique (id, org_id)
);

-- Which kitchen station prints KOTs for a category at a given outlet
create table public.outlet_category_stations (
  outlet_id    uuid not null,
  category_id  uuid not null,
  station_id   uuid not null,
  org_id       uuid not null,
  primary key (outlet_id, category_id),
  foreign key (outlet_id, org_id)     references public.outlets(id, org_id)          on delete cascade,
  foreign key (category_id, org_id)   references public.menu_categories(id, org_id)  on delete cascade,
  foreign key (station_id, outlet_id) references public.kitchen_stations(id, outlet_id) on delete cascade
);

create table public.menu_items (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations(id) on delete cascade,
  category_id   uuid not null,
  tax_group_id  uuid,
  name          text not null check (char_length(name) between 1 and 100),
  short_code    text check (short_code is null or short_code ~ '^[A-Za-z0-9]{1,10}$'),  -- type "PBM" → Paneer Butter Masala
  description   text,
  food_type     public.food_type not null default 'veg',
  image_url     text,
  base_price    numeric(10,2) not null default 0 check (base_price >= 0),  -- used when item has no variants
  hsn_sac_code  text not null default '996331',   -- SAC for restaurant services
  sort_order    integer not null default 0,
  is_active     boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid references auth.users(id) on delete set null default auth.uid(),
  updated_by  uuid references auth.users(id) on delete set null,
  unique (id, org_id),
  foreign key (category_id, org_id)  references public.menu_categories(id, org_id) on delete restrict,
  foreign key (tax_group_id, org_id) references public.tax_groups(id, org_id)      on delete restrict
);
create index menu_items_org_cat_idx on public.menu_items(org_id, category_id);
create index menu_items_tax_idx     on public.menu_items(tax_group_id);
create unique index menu_items_short_code_uq on public.menu_items(org_id, lower(short_code)) where short_code is not null;

-- Half/Full, Small/Medium/Large …
create table public.item_variants (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null,
  item_id     uuid not null,
  name        text not null check (char_length(name) between 1 and 40),
  price       numeric(10,2) not null check (price >= 0),
  sort_order  integer not null default 0,
  is_default  boolean not null default false,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid references auth.users(id) on delete set null default auth.uid(),
  updated_by  uuid references auth.users(id) on delete set null,
  unique (item_id, name),
  unique (id, org_id),
  foreign key (item_id, org_id) references public.menu_items(id, org_id) on delete cascade
);
create index item_variants_item_idx on public.item_variants(item_id);

-- Add-on groups: "Extra toppings" (choose 0–3), "Choice of bread" (choose exactly 1)
create table public.addon_groups (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  name        text not null,
  min_select  smallint not null default 0 check (min_select >= 0),
  max_select  smallint check (max_select is null or max_select >= 1),  -- null = no limit
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid references auth.users(id) on delete set null default auth.uid(),
  updated_by  uuid references auth.users(id) on delete set null,
  unique (org_id, name),
  unique (id, org_id),
  check (max_select is null or min_select <= max_select)
);

create table public.addons (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null,
  group_id    uuid not null,
  name        text not null,
  price       numeric(10,2) not null default 0 check (price >= 0),
  food_type   public.food_type not null default 'veg',
  sort_order  integer not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid references auth.users(id) on delete set null default auth.uid(),
  updated_by  uuid references auth.users(id) on delete set null,
  unique (group_id, name),
  foreign key (group_id, org_id) references public.addon_groups(id, org_id) on delete cascade
);
create index addons_group_idx on public.addons(group_id);

create table public.item_addon_groups (
  item_id         uuid not null,
  addon_group_id  uuid not null,
  org_id          uuid not null,
  sort_order      integer not null default 0,
  primary key (item_id, addon_group_id),
  foreign key (item_id, org_id)        references public.menu_items(id, org_id)   on delete cascade,
  foreign key (addon_group_id, org_id) references public.addon_groups(id, org_id) on delete cascade
);
create index item_addon_groups_group_idx on public.item_addon_groups(addon_group_id);

-- Per-outlet price / visibility / out-of-stock for an item
create table public.outlet_item_overrides (
  outlet_id     uuid not null,
  item_id       uuid not null,
  org_id        uuid not null,
  price         numeric(10,2) check (price is null or price >= 0),  -- null = use base price
  is_listed     boolean not null default true,    -- false = this outlet doesn't sell it
  is_available  boolean not null default true,    -- false = "out of stock" today
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid references auth.users(id) on delete set null default auth.uid(),
  updated_by  uuid references auth.users(id) on delete set null,
  primary key (outlet_id, item_id),
  foreign key (outlet_id, org_id) references public.outlets(id, org_id)    on delete cascade,
  foreign key (item_id, org_id)   references public.menu_items(id, org_id) on delete cascade
);
create index outlet_item_overrides_item_idx on public.outlet_item_overrides(item_id);

-- Per-outlet price / out-of-stock for a variant
create table public.outlet_variant_overrides (
  outlet_id     uuid not null,
  variant_id    uuid not null,
  org_id        uuid not null,
  price         numeric(10,2) check (price is null or price >= 0),
  is_available  boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid references auth.users(id) on delete set null default auth.uid(),
  updated_by  uuid references auth.users(id) on delete set null,
  primary key (outlet_id, variant_id),
  foreign key (outlet_id, org_id)  references public.outlets(id, org_id)       on delete cascade,
  foreign key (variant_id, org_id) references public.item_variants(id, org_id) on delete cascade
);
create index outlet_variant_overrides_variant_idx on public.outlet_variant_overrides(variant_id);

-- =====================================================================
-- 6. FLOOR & TABLES
-- =====================================================================
create table public.areas (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null,
  outlet_id   uuid not null,
  name        text not null,                -- "AC Hall", "Garden", "Rooftop"
  sort_order  integer not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid references auth.users(id) on delete set null default auth.uid(),
  updated_by  uuid references auth.users(id) on delete set null,
  unique (outlet_id, name),
  unique (id, outlet_id),
  foreign key (outlet_id, org_id) references public.outlets(id, org_id) on delete cascade
);

create table public.dining_tables (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null,
  outlet_id         uuid not null,
  area_id           uuid not null,
  name              text not null,              -- "T1", "G4"
  seats             smallint not null default 4 check (seats between 1 and 50),
  shape             text not null default 'square' check (shape in ('square','round','rectangle')),
  pos_x             integer not null default 0, -- layout position on the floor plan
  pos_y             integer not null default 0,
  sort_order        integer not null default 0,
  status            public.table_status not null default 'free',  -- kept up to date by triggers
  current_order_id  uuid,                       -- FK added after orders table
  occupied_since    timestamptz,
  is_active         boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid references auth.users(id) on delete set null default auth.uid(),
  updated_by  uuid references auth.users(id) on delete set null,
  unique (outlet_id, name),
  foreign key (outlet_id, org_id)  references public.outlets(id, org_id) on delete cascade,
  foreign key (area_id, outlet_id) references public.areas(id, outlet_id) on delete restrict
);
create index dining_tables_outlet_idx on public.dining_tables(outlet_id, area_id);

-- =====================================================================
-- 7. CUSTOMERS & LOYALTY
-- =====================================================================
create table public.customers (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organizations(id) on delete cascade,
  name            text,
  phone           text not null check (phone ~ '^[0-9]{10}$'),
  email           text,
  gstin           text check (gstin is null or gstin ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$'),  -- for B2B bills
  address         text,
  birthday        date,
  anniversary     date,
  notes           text,
  loyalty_points  numeric(12,2) not null default 0,
  total_spent     numeric(12,2) not null default 0,
  visit_count     integer not null default 0,
  last_visit_at   timestamptz,
  due_balance     numeric(12,2) not null default 0,   -- unpaid credit across bills
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid references auth.users(id) on delete set null default auth.uid(),
  updated_by  uuid references auth.users(id) on delete set null,
  unique (org_id, phone),
  unique (id, org_id)
);
create index customers_name_idx on public.customers(org_id, lower(name));

-- =====================================================================
-- 8. ORDERS, BILLING, KOT, PAYMENTS
-- =====================================================================
create table public.orders (
  id                     uuid primary key default gen_random_uuid(),
  org_id                 uuid not null,
  outlet_id              uuid not null,
  order_no               integer not null,           -- resets every business day: #1, #2 …
  business_date          date not null,
  order_type             public.order_type not null,
  status                 public.order_status not null default 'open',
  parent_order_id        uuid references public.orders(id) on delete set null,  -- set when a bill is split
  -- customer (copied onto the bill)
  customer_id            uuid,
  customer_name          text,
  customer_phone         text,
  customer_gstin         text,
  delivery_address       text,
  delivery_platform      text,             -- 'own', 'swiggy', 'zomato' …
  platform_order_ref     text,
  pax                    smallint check (pax is null or pax between 1 and 200),
  waiter_id              uuid references public.staff_members(id) on delete set null,
  cashier_id             uuid references public.staff_members(id) on delete set null,
  notes                  text,
  -- money (all calculated by private.recalc_order — never typed by the browser)
  subtotal               numeric(12,2) not null default 0,
  discount_type          public.discount_type,
  discount_value         numeric(12,2) not null default 0 check (discount_value >= 0),
  discount_amount        numeric(12,2) not null default 0,
  discount_reason        text,
  service_charge_rate    numeric(5,2)  not null default 0 check (service_charge_rate between 0 and 20),
  service_charge_amount  numeric(12,2) not null default 0,
  taxable_amount         numeric(12,2) not null default 0,
  cgst_amount            numeric(12,2) not null default 0,
  sgst_amount            numeric(12,2) not null default 0,
  total_tax              numeric(12,2) not null default 0,
  round_off              numeric(6,2)  not null default 0,
  grand_total            numeric(12,2) not null default 0,
  paid_amount            numeric(12,2) not null default 0,
  due_amount             numeric(12,2) not null default 0,
  -- GST invoice (assigned when the bill is printed)
  invoice_no             text check (invoice_no is null or char_length(invoice_no) <= 16),
  invoice_seq            integer,
  financial_year         text,
  print_count            integer not null default 0,
  billed_at              timestamptz,
  billed_by              uuid references auth.users(id) on delete set null,
  settled_at             timestamptz,
  settled_by             uuid references auth.users(id) on delete set null,
  cancelled_at           timestamptz,
  cancelled_by           uuid references auth.users(id) on delete set null,
  cancel_reason          text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid references auth.users(id) on delete set null default auth.uid(),
  updated_by  uuid references auth.users(id) on delete set null,
  unique (outlet_id, business_date, order_no),
  unique (outlet_id, invoice_no),
  foreign key (outlet_id, org_id)   references public.outlets(id, org_id)   on delete restrict,
  foreign key (customer_id, org_id) references public.customers(id, org_id) on delete restrict,
  check (status <> 'cancelled' or cancel_reason is not null),
  check (order_type <> 'delivery' or delivery_platform is not null or delivery_address is not null or customer_phone is not null)
);
create index orders_outlet_date_idx   on public.orders(outlet_id, business_date);
create index orders_outlet_status_idx on public.orders(outlet_id, status) where status in ('open','billed');
create index orders_customer_idx      on public.orders(customer_id) where customer_id is not null;
create index orders_waiter_idx        on public.orders(waiter_id);
create index orders_cashier_idx       on public.orders(cashier_id);
create index orders_parent_idx        on public.orders(parent_order_id) where parent_order_id is not null;
create index orders_settled_at_idx    on public.orders(outlet_id, settled_at);

alter table public.dining_tables
  add constraint dining_tables_current_order_fk
  foreign key (current_order_id) references public.orders(id) on delete set null;
create index dining_tables_current_order_idx on public.dining_tables(current_order_id) where current_order_id is not null;

-- Tables an order sits on (more than one = merged tables)
create table public.order_tables (
  order_id    uuid not null references public.orders(id) on delete cascade,
  table_id    uuid not null references public.dining_tables(id) on delete restrict,
  outlet_id   uuid not null references public.outlets(id) on delete cascade,
  created_at  timestamptz not null default now(),
  created_by  uuid references auth.users(id) on delete set null default auth.uid(),
  primary key (order_id, table_id)
);
create index order_tables_table_idx on public.order_tables(table_id);

create table public.kots (
  id              uuid primary key default gen_random_uuid(),
  outlet_id       uuid not null references public.outlets(id) on delete cascade,
  order_id        uuid not null references public.orders(id) on delete cascade,
  station_id      uuid references public.kitchen_stations(id) on delete set null,
  kot_no          integer not null,          -- resets daily
  business_date   date not null,
  -- copies so the kitchen screen needs nothing from the (priced) order
  order_no        integer not null,
  order_type      public.order_type not null,
  table_label     text,                      -- "T4 + T5"
  waiter_name     text,
  notes           text,
  status          public.kot_status not null default 'new',
  started_at      timestamptz,
  ready_at        timestamptz,
  served_at       timestamptz,
  cancelled_at    timestamptz,
  cancel_reason   text,
  print_count     integer not null default 0,
  printed_at      timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid references auth.users(id) on delete set null default auth.uid(),
  updated_by  uuid references auth.users(id) on delete set null,
  unique (outlet_id, business_date, kot_no)
);
create index kots_order_idx         on public.kots(order_id);
create index kots_outlet_status_idx on public.kots(outlet_id, status, created_at) where status in ('new','preparing','ready');
create index kots_station_idx       on public.kots(station_id);

create table public.order_items (
  id                    uuid primary key default gen_random_uuid(),
  order_id              uuid not null references public.orders(id) on delete cascade,
  outlet_id             uuid not null references public.outlets(id) on delete cascade,
  item_id               uuid references public.menu_items(id) on delete set null,
  variant_id            uuid references public.item_variants(id) on delete set null,
  kot_id                uuid references public.kots(id) on delete set null,
  -- snapshots (bill never changes if the menu changes)
  item_name             text not null,
  variant_name          text,
  category_id           uuid references public.menu_categories(id) on delete set null,
  category_name         text,
  food_type             public.food_type not null default 'veg',
  hsn_sac_code          text,
  quantity              numeric(10,3) not null check (quantity > 0),
  unit_price            numeric(10,2) not null check (unit_price >= 0),
  addons_price          numeric(10,2) not null default 0 check (addons_price >= 0),   -- per unit
  line_total            numeric(12,2) generated always as (round(quantity * (unit_price + addons_price), 2)) stored,
  cgst_rate             numeric(5,2) not null default 0,
  sgst_rate             numeric(5,2) not null default 0,
  -- filled by private.recalc_order
  discount_share        numeric(12,2) not null default 0,
  service_charge_share  numeric(12,2) not null default 0,
  taxable_value         numeric(12,2) not null default 0,
  cgst_amount           numeric(12,2) not null default 0,
  sgst_amount           numeric(12,2) not null default 0,
  notes                 text,                       -- "less spicy", "no onion"
  status                public.order_item_status not null default 'active',
  void_reason           text,
  voided_at             timestamptz,
  voided_by             uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid references auth.users(id) on delete set null default auth.uid(),
  updated_by  uuid references auth.users(id) on delete set null,
  check (status <> 'void' or void_reason is not null)
);
create index order_items_order_idx    on public.order_items(order_id);
create index order_items_outlet_idx   on public.order_items(outlet_id, created_at);
create index order_items_item_idx     on public.order_items(item_id);
create index order_items_variant_idx  on public.order_items(variant_id);
create index order_items_kot_idx      on public.order_items(kot_id);
create index order_items_category_idx on public.order_items(category_id);

create table public.order_item_addons (
  id             uuid primary key default gen_random_uuid(),
  order_item_id  uuid not null references public.order_items(id) on delete cascade,
  outlet_id      uuid not null references public.outlets(id) on delete cascade,
  addon_id       uuid references public.addons(id) on delete set null,
  addon_name     text not null,
  price          numeric(10,2) not null default 0,
  quantity       smallint not null default 1 check (quantity > 0),
  created_at     timestamptz not null default now()
);
create index order_item_addons_item_idx  on public.order_item_addons(order_item_id);
create index order_item_addons_addon_idx on public.order_item_addons(addon_id);

-- What the kitchen sees (no prices)
create table public.kot_items (
  id             uuid primary key default gen_random_uuid(),
  kot_id         uuid not null references public.kots(id) on delete cascade,
  outlet_id      uuid not null references public.outlets(id) on delete cascade,
  order_item_id  uuid references public.order_items(id) on delete set null,
  item_name      text not null,
  variant_name   text,
  addons_text    text,                -- "Extra cheese, Jalapeño"
  food_type      public.food_type not null default 'veg',
  quantity       numeric(10,3) not null,  -- negative = cancelled after sending
  notes          text,
  status         public.kot_status not null default 'new',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid references auth.users(id) on delete set null default auth.uid(),
  updated_by  uuid references auth.users(id) on delete set null
);
create index kot_items_kot_idx        on public.kot_items(kot_id);
create index kot_items_order_item_idx on public.kot_items(order_item_id);
create index kot_items_outlet_idx     on public.kot_items(outlet_id);

create table public.payments (
  id                 uuid primary key default gen_random_uuid(),
  outlet_id          uuid not null references public.outlets(id) on delete cascade,
  order_id           uuid not null references public.orders(id) on delete restrict,
  customer_id        uuid references public.customers(id) on delete set null,
  mode               public.payment_mode not null,
  amount             numeric(12,2) not null check (amount > 0),
  reference          text,                         -- UPI txn id / card last 4 digits
  is_refund          boolean not null default false,
  is_due_settlement  boolean not null default false, -- customer paying an old credit bill
  business_date      date not null,
  note               text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid references auth.users(id) on delete set null default auth.uid(),
  updated_by  uuid references auth.users(id) on delete set null,
  check (not (mode = 'due' and (is_refund or is_due_settlement)))
);
create index payments_order_idx       on public.payments(order_id);
create index payments_outlet_date_idx on public.payments(outlet_id, business_date, mode);
create index payments_customer_idx    on public.payments(customer_id) where customer_id is not null;

-- Who did what to an order: discount, void, cancel, reprint, transfer, merge, split
create table public.order_events (
  id          bigint generated always as identity primary key,
  outlet_id   uuid not null references public.outlets(id) on delete cascade,
  order_id    uuid not null references public.orders(id) on delete cascade,
  event_type  text not null check (event_type in
               ('created','items_added','kot_sent','item_void','discount','service_charge',
                'billed','reprint','settled','cancelled','reopened','table_transfer',
                'table_merge','split','payment_added','payment_removed','customer_set')),
  reason      text,
  payload     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  created_by  uuid references auth.users(id) on delete set null default auth.uid()
);
create index order_events_order_idx  on public.order_events(order_id);
create index order_events_outlet_idx on public.order_events(outlet_id, event_type, created_at);

create table public.loyalty_transactions (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.organizations(id) on delete cascade,
  customer_id  uuid not null references public.customers(id) on delete cascade,
  order_id     uuid references public.orders(id) on delete set null,
  points       numeric(12,2) not null check (points <> 0),   -- + earn, − redeem
  txn_type     text not null check (txn_type in ('earn','redeem','reverse','adjust')),
  note         text,
  created_at   timestamptz not null default now(),
  created_by   uuid references auth.users(id) on delete set null default auth.uid()
);
create index loyalty_txn_customer_idx on public.loyalty_transactions(customer_id, created_at);
create index loyalty_txn_order_idx    on public.loyalty_transactions(order_id);

-- =====================================================================
-- 9. INVENTORY
-- =====================================================================
create table public.vendors (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organizations(id) on delete cascade,
  name            text not null,
  contact_person  text,
  phone           text,
  email           text,
  gstin           text,
  address         text,
  is_active       boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid references auth.users(id) on delete set null default auth.uid(),
  updated_by  uuid references auth.users(id) on delete set null,
  unique (org_id, name),
  unique (id, org_id)
);

create table public.raw_materials (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  name        text not null,
  unit        text not null check (unit in ('kg','g','l','ml','pcs','dozen','packet','box','bottle','can')),
  category    text,                                   -- "Dairy", "Vegetables", "Meat"
  min_stock   numeric(14,3) not null default 0 check (min_stock >= 0),   -- low-stock alert level
  avg_cost    numeric(12,4) not null default 0 check (avg_cost >= 0),    -- ₹ per unit
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid references auth.users(id) on delete set null default auth.uid(),
  updated_by  uuid references auth.users(id) on delete set null,
  unique (org_id, name),
  unique (id, org_id)
);

-- Current stock per outlet (kept up to date by trigger from stock_movements)
create table public.outlet_stock (
  outlet_id        uuid not null,
  raw_material_id  uuid not null,
  org_id           uuid not null,
  quantity         numeric(14,3) not null default 0,
  min_stock        numeric(14,3) check (min_stock is null or min_stock >= 0),  -- null = use material default
  updated_at       timestamptz not null default now(),
  primary key (outlet_id, raw_material_id),
  foreign key (outlet_id, org_id)       references public.outlets(id, org_id)       on delete cascade,
  foreign key (raw_material_id, org_id) references public.raw_materials(id, org_id) on delete cascade
);
create index outlet_stock_material_idx on public.outlet_stock(raw_material_id);

-- Every stock change, ever (append-only ledger)
create table public.stock_movements (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null,
  outlet_id        uuid not null,
  raw_material_id  uuid not null,
  movement_type    public.stock_movement_type not null,
  quantity         numeric(14,3) not null check (quantity <> 0),   -- + in, − out
  unit_cost        numeric(12,4),
  reason           text,                                    -- wastage reason etc.
  ref_type         text,                                    -- 'order' | 'purchase'
  ref_id           uuid,
  business_date    date not null,
  created_at       timestamptz not null default now(),
  created_by       uuid references auth.users(id) on delete set null default auth.uid(),
  foreign key (outlet_id, org_id)       references public.outlets(id, org_id)       on delete cascade,
  foreign key (raw_material_id, org_id) references public.raw_materials(id, org_id) on delete restrict,
  check (movement_type <> 'wastage' or (quantity < 0 and reason is not null))
);
create index stock_movements_outlet_idx   on public.stock_movements(outlet_id, business_date, movement_type);
create index stock_movements_material_idx on public.stock_movements(raw_material_id, created_at);
create index stock_movements_ref_idx      on public.stock_movements(ref_type, ref_id);

create table public.purchases (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null,
  outlet_id     uuid not null,
  vendor_id     uuid,
  bill_no       text,
  bill_date     date not null default current_date,
  status        public.purchase_status not null default 'draft',
  subtotal      numeric(12,2) not null default 0,
  tax_amount    numeric(12,2) not null default 0,
  total_amount  numeric(12,2) not null default 0,
  paid_amount   numeric(12,2) not null default 0 check (paid_amount >= 0),
  notes         text,
  received_at   timestamptz,
  received_by   uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid references auth.users(id) on delete set null default auth.uid(),
  updated_by  uuid references auth.users(id) on delete set null,
  unique (id, outlet_id),
  foreign key (outlet_id, org_id) references public.outlets(id, org_id)  on delete cascade,
  foreign key (vendor_id, org_id) references public.vendors(id, org_id)  on delete restrict
);
create index purchases_outlet_idx on public.purchases(outlet_id, bill_date);
create index purchases_vendor_idx on public.purchases(vendor_id);

create table public.purchase_items (
  id               uuid primary key default gen_random_uuid(),
  purchase_id      uuid not null,
  outlet_id        uuid not null,
  org_id           uuid not null,
  raw_material_id  uuid not null,
  quantity         numeric(14,3) not null check (quantity > 0),
  unit_cost        numeric(12,4) not null check (unit_cost >= 0),
  tax_rate         numeric(5,2) not null default 0 check (tax_rate between 0 and 40),
  line_total       numeric(12,2) generated always as (round(quantity * unit_cost * (1 + tax_rate / 100), 2)) stored,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid references auth.users(id) on delete set null default auth.uid(),
  updated_by  uuid references auth.users(id) on delete set null,
  foreign key (purchase_id, outlet_id)  references public.purchases(id, outlet_id)  on delete cascade,
  foreign key (raw_material_id, org_id) references public.raw_materials(id, org_id) on delete restrict
);
create index purchase_items_purchase_idx on public.purchase_items(purchase_id);
create index purchase_items_material_idx on public.purchase_items(raw_material_id);

-- Recipe: 1 × "Paneer Butter Masala (Full)" uses 0.200 kg paneer, 0.050 kg butter …
-- variant_id null = applies to all variants that have no recipe of their own.
create table public.recipe_items (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null,
  item_id          uuid not null,
  variant_id       uuid,
  raw_material_id  uuid not null,
  quantity         numeric(12,4) not null check (quantity > 0),   -- in the raw material's unit
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid references auth.users(id) on delete set null default auth.uid(),
  updated_by  uuid references auth.users(id) on delete set null,
  foreign key (item_id, org_id)         references public.menu_items(id, org_id)    on delete cascade,
  foreign key (variant_id, org_id)      references public.item_variants(id, org_id) on delete cascade,
  foreign key (raw_material_id, org_id) references public.raw_materials(id, org_id) on delete restrict
);
create unique index recipe_items_uq on public.recipe_items(item_id, variant_id, raw_material_id) nulls not distinct;
create index recipe_items_material_idx on public.recipe_items(raw_material_id);
create index recipe_items_variant_idx  on public.recipe_items(variant_id);

-- =====================================================================
-- 10. AUDIT LOG (owner-only view of sensitive changes)
-- =====================================================================
create table public.audit_logs (
  id          bigint generated always as identity primary key,
  org_id      uuid,
  table_name  text not null,
  record_id   text,
  action      text not null check (action in ('INSERT','UPDATE','DELETE')),
  old_data    jsonb,
  new_data    jsonb,
  changed_by  uuid,
  changed_at  timestamptz not null default now()
);
create index audit_logs_org_idx on public.audit_logs(org_id, changed_at desc);

create or replace function private.log_audit()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_row   jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  v_org   uuid;
begin
  v_org := coalesce((v_row ->> 'org_id')::uuid,
                    case when tg_table_name = 'organizations' then (v_row ->> 'id')::uuid end,
                    (select o.org_id from public.outlets o where o.id = (v_row ->> 'outlet_id')::uuid));
  -- skip no-op updates
  if tg_op = 'UPDATE' and (to_jsonb(old) - 'updated_at' - 'updated_by') = (to_jsonb(new) - 'updated_at' - 'updated_by') then
    return new;
  end if;
  insert into public.audit_logs (org_id, table_name, record_id, action, old_data, new_data, changed_by)
  values (v_org, tg_table_name,
          coalesce(v_row ->> 'id', v_row ->> 'staff_id', v_row ->> 'item_id', v_row ->> 'variant_id'),
          tg_op,
          case when tg_op <> 'INSERT' then to_jsonb(old) end,
          case when tg_op <> 'DELETE' then to_jsonb(new) end,
          auth.uid());
  return coalesce(new, old);
end $$;

-- =====================================================================
-- 11. BUSINESS LOGIC TRIGGERS & FUNCTIONS
-- =====================================================================

-- 11a. GST / discount / service charge calculation for one order.
--      Called by the order functions every time items or discounts change.
--
--  For each active line:
--    discount_share = line_total × (order discount ÷ subtotal)
--    base           = line_total − discount_share         (prices exclusive of GST)
--                   = (line_total − discount_share) ÷ (1 + GST%)   (prices inclusive)
--    service charge = base × SC%
--    taxable_value  = base + service charge
--    CGST / SGST    = taxable_value × rate
--  Order totals are the sums of the lines; grand total is rounded to the rupee.
create or replace function private.recalc_order(p_order uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_o      public.orders%rowtype;
  v_incl   boolean;
  v_sub    numeric(12,2);
  v_disc   numeric(12,2);
  v_raw    numeric(14,2);
begin
  select * into v_o from public.orders where id = p_order for update;
  if not found then raise exception 'Order not found'; end if;
  if v_o.status not in ('open','billed') then
    raise exception 'Order % is % and cannot be changed', v_o.order_no, v_o.status;
  end if;

  select prices_include_tax into v_incl from public.outlets where id = v_o.outlet_id;

  select coalesce(sum(line_total), 0) into v_sub
  from public.order_items where order_id = p_order and status = 'active';

  v_disc := case v_o.discount_type
              when 'percent' then round(v_sub * least(v_o.discount_value, 100) / 100, 2)
              when 'flat'    then least(v_o.discount_value, v_sub)
              else 0 end;

  -- void lines carry nothing
  update public.order_items
     set discount_share = 0, service_charge_share = 0, taxable_value = 0, cgst_amount = 0, sgst_amount = 0
   where order_id = p_order and status = 'void';

  update public.order_items oi
     set discount_share       = c.d,
         service_charge_share = c.sc,
         taxable_value        = c.base + c.sc,
         cgst_amount          = round((c.base + c.sc) * oi.cgst_rate / 100, 2),
         sgst_amount          = round((c.base + c.sc) * oi.sgst_rate / 100, 2)
    from (
      select x.id, x.d, x.base, round(x.base * v_o.service_charge_rate / 100, 2) as sc
      from (
        select i.id, i.d,
               round(case when v_incl
                          then (i.line_total - i.d) / (1 + (i.cgst_rate + i.sgst_rate) / 100)
                          else (i.line_total - i.d) end, 2) as base
        from (
          select id, line_total, cgst_rate, sgst_rate,
                 case when v_sub > 0 then round(line_total * v_disc / v_sub, 2) else 0 end as d
          from public.order_items
          where order_id = p_order and status = 'active'
        ) i
      ) x
    ) c
   where oi.id = c.id;

  update public.orders o
     set subtotal              = t.sub,
         discount_amount       = t.disc,
         service_charge_amount = t.sc,
         taxable_amount        = t.taxable,
         cgst_amount           = t.cgst,
         sgst_amount           = t.sgst,
         total_tax             = t.cgst + t.sgst,
         grand_total           = round(t.taxable + t.cgst + t.sgst, 0),
         round_off             = round(t.taxable + t.cgst + t.sgst, 0) - (t.taxable + t.cgst + t.sgst)
    from (
      select coalesce(sum(line_total), 0)           as sub,
             coalesce(sum(discount_share), 0)       as disc,
             coalesce(sum(service_charge_share), 0) as sc,
             coalesce(sum(taxable_value), 0)        as taxable,
             coalesce(sum(cgst_amount), 0)          as cgst,
             coalesce(sum(sgst_amount), 0)          as sgst
      from public.order_items where order_id = p_order and status = 'active'
    ) t
   where o.id = p_order;
end $$;

-- 11b. Recompute a customer's total outstanding credit
create or replace function private.refresh_customer_due(p_customer uuid)
returns void language sql security definer set search_path = '' as $$
  update public.customers c
     set due_balance = coalesce((select sum(o.due_amount) from public.orders o
                                 where o.customer_id = c.id and o.status = 'settled'), 0)
   where c.id = p_customer;
$$;

-- 11c. Recompute paid / due on an order from its payments
create or replace function private.refresh_order_payments(p_order uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_paid numeric(12,2);
  v_cust uuid;
begin
  select coalesce(sum(case when p.is_refund then -p.amount else p.amount end), 0)
    into v_paid
    from public.payments p
   where p.order_id = p_order and p.mode <> 'due';

  update public.orders o
     set paid_amount = v_paid,
         due_amount  = case when o.status = 'settled' then greatest(o.grand_total - v_paid, 0) else 0 end
   where o.id = p_order
  returning o.customer_id into v_cust;

  if v_cust is not null then perform private.refresh_customer_due(v_cust); end if;
end $$;

create or replace function private.on_payment_change()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform private.refresh_order_payments(coalesce(new.order_id, old.order_id));
  if tg_op = 'UPDATE' and new.order_id <> old.order_id then
    perform private.refresh_order_payments(old.order_id);
  end if;
  return null;
end $$;

-- 11d. Stock in/out for a settled (or un-settled) order using recipes.
--      p_sign = -1 deducts (sale), +1 puts back (bill cancelled after settle)
create or replace function private.apply_stock_for_order(p_order uuid, p_sign integer)
returns void language plpgsql security definer set search_path = '' as $$
begin
  insert into public.stock_movements
    (org_id, outlet_id, raw_material_id, movement_type, quantity, unit_cost, ref_type, ref_id, business_date)
  select o.org_id, o.outlet_id, r.raw_material_id,
         case when p_sign < 0 then 'sale' else 'sale_reversal' end::public.stock_movement_type,
         p_sign * sum(r.quantity * oi.quantity),
         max(rm.avg_cost), 'order', o.id, o.business_date
  from public.orders o
  join public.order_items oi on oi.order_id = o.id and oi.status = 'active'
  join public.recipe_items r on r.item_id = oi.item_id
       and (r.variant_id = oi.variant_id
            or (r.variant_id is null and not exists (
                  select 1 from public.recipe_items r2
                  where r2.item_id = oi.item_id and r2.variant_id = oi.variant_id)))
  join public.raw_materials rm on rm.id = r.raw_material_id
  where o.id = p_order
  group by o.org_id, o.outlet_id, r.raw_material_id, o.id, o.business_date
  having sum(r.quantity * oi.quantity) <> 0;
end $$;

-- 11e. Keep outlet_stock in sync with the stock ledger
create or replace function private.on_stock_movement()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.outlet_stock as s (outlet_id, raw_material_id, org_id, quantity)
  values (new.outlet_id, new.raw_material_id, new.org_id, new.quantity)
  on conflict (outlet_id, raw_material_id)
  do update set quantity = s.quantity + excluded.quantity, updated_at = now();
  return null;
end $$;

-- 11f. When an order changes status: table status, stock, customer stats, loyalty
create or replace function private.on_order_status_change()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_org     public.organizations%rowtype;
  v_points  numeric(12,2);
begin
  if new.status = old.status then return null; end if;

  -- table colour on the floor plan
  if new.status = 'open' then
    update public.dining_tables set status = 'occupied' where current_order_id = new.id;
  elsif new.status = 'billed' then
    update public.dining_tables set status = 'bill_printed' where current_order_id = new.id;
  elsif new.status in ('settled','cancelled') then
    update public.dining_tables
       set status = 'free', current_order_id = null, occupied_since = null
     where current_order_id = new.id;
  end if;

  -- bill settled → deduct stock, update customer, earn loyalty
  if new.status = 'settled' then
    perform private.apply_stock_for_order(new.id, -1);
    perform private.refresh_order_payments(new.id);

    if new.customer_id is not null then
      update public.customers
         set visit_count = visit_count + 1,
             total_spent = total_spent + new.grand_total,
             last_visit_at = now()
       where id = new.customer_id;

      select * into v_org from public.organizations where id = new.org_id;
      if v_org.loyalty_enabled and v_org.loyalty_earn_percent > 0 then
        v_points := round(new.grand_total * v_org.loyalty_earn_percent / 100 / v_org.loyalty_point_value, 2);
        if v_points > 0 then
          insert into public.loyalty_transactions (org_id, customer_id, order_id, points, txn_type)
          values (new.org_id, new.customer_id, new.id, v_points, 'earn');
          update public.customers set loyalty_points = loyalty_points + v_points where id = new.customer_id;
        end if;
      end if;
    end if;
  end if;

  -- a settled bill is cancelled later → put everything back
  if old.status = 'settled' and new.status = 'cancelled' then
    perform private.apply_stock_for_order(new.id, 1);
    if new.customer_id is not null then
      update public.customers
         set visit_count = greatest(visit_count - 1, 0),
             total_spent = total_spent - new.grand_total
       where id = new.customer_id;

      select coalesce(sum(points), 0) into v_points
        from public.loyalty_transactions
       where order_id = new.id and txn_type in ('earn','redeem');
      if v_points <> 0 then
        insert into public.loyalty_transactions (org_id, customer_id, order_id, points, txn_type, note)
        values (new.org_id, new.customer_id, new.id, -v_points, 'reverse', 'Bill cancelled');
        update public.customers set loyalty_points = loyalty_points - v_points where id = new.customer_id;
      end if;
      perform private.refresh_customer_due(new.customer_id);
    end if;
  end if;

  return null;
end $$;

-- 11g. Seating / un-seating an order on a table
create or replace function private.on_order_table_change()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_status public.order_status;
begin
  if tg_op = 'INSERT' then
    select status into v_status from public.orders where id = new.order_id;
    update public.dining_tables
       set status = case when v_status = 'billed' then 'bill_printed' else 'occupied' end::public.table_status,
           current_order_id = new.order_id,
           occupied_since = coalesce(occupied_since, now())
     where id = new.table_id;
  else
    update public.dining_tables
       set status = 'free', current_order_id = null, occupied_since = null
     where id = old.table_id and current_order_id = old.order_id;
  end if;
  return null;
end $$;

-- 11h. Safety: the organisation owner's staff row cannot be demoted/disabled/deleted
create or replace function private.protect_owner_staff()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_owner uuid;
begin
  select owner_id into v_owner from public.organizations where id = old.org_id;
  if old.user_id = v_owner then
    if tg_op = 'DELETE' then
      -- allowed only when the whole organisation is being deleted
      if exists (select 1 from public.organizations where id = old.org_id) then
        raise exception 'The owner cannot be removed';
      end if;
      return old;
    end if;
    if new.role <> 'owner' or not new.is_active or new.user_id is distinct from old.user_id then
      raise exception 'The owner cannot be demoted or disabled';
    end if;
  end if;
  return coalesce(new, old);
end $$;

-- =====================================================================
-- 12. ATTACH TRIGGERS
-- =====================================================================

-- audit fields on every table that has updated_at + updated_by
do $$
declare r record;
begin
  for r in
    select c.table_name
    from information_schema.columns c
    where c.table_schema = 'public' and c.column_name = 'updated_by'
    group by c.table_name
  loop
    execute format('create trigger set_audit_fields before insert or update on public.%I
                    for each row execute function private.set_audit_fields()', r.table_name);
  end loop;
end $$;

-- created_at/by only on append-only tables
create trigger set_created_fields before insert on public.order_events
  for each row execute function private.set_created_fields();
create trigger set_created_fields before insert on public.stock_movements
  for each row execute function private.set_created_fields();
create trigger set_created_fields before insert on public.loyalty_transactions
  for each row execute function private.set_created_fields();
create trigger set_created_fields before insert on public.staff_outlets
  for each row execute function private.set_created_fields();
create trigger set_created_fields before insert on public.order_tables
  for each row execute function private.set_created_fields();

-- audit log on sensitive tables
do $$
declare t text;
begin
  foreach t in array array['organizations','outlets','tax_groups','staff_members','staff_outlets',
                           'menu_items','item_variants','outlet_item_overrides','outlet_variant_overrides',
                           'payments','purchases','pos_devices','recipe_items']
  loop
    execute format('create trigger log_audit after insert or update or delete on public.%I
                    for each row execute function private.log_audit()', t);
  end loop;
end $$;

create trigger on_payment_change after insert or update or delete on public.payments
  for each row execute function private.on_payment_change();

create trigger on_stock_movement after insert on public.stock_movements
  for each row execute function private.on_stock_movement();

create trigger on_order_status_change after update of status on public.orders
  for each row execute function private.on_order_status_change();

create trigger on_order_table_change after insert or delete on public.order_tables
  for each row execute function private.on_order_table_change();

create trigger protect_owner_staff before update or delete on public.staff_members
  for each row execute function private.protect_owner_staff();

-- =====================================================================
-- 13. ONBOARDING FUNCTION (called once after the owner signs up)
-- =====================================================================
create or replace function public.create_organization(
  p_org_name     text,
  p_owner_name   text,
  p_outlet_name  text,
  p_outlet_code  text,
  p_phone        text default null,
  p_city         text default null,
  p_state        text default null,
  p_state_code   text default null,
  p_gstin        text default null,
  p_fssai_no     text default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid    uuid := auth.uid();
  v_email  text;
  v_org    uuid;
  v_outlet uuid;
begin
  if v_uid is null then
    raise exception 'You must be signed in' using errcode = '28000';
  end if;
  if exists (select 1 from public.organizations where owner_id = v_uid) then
    raise exception 'This account already has a restaurant set up';
  end if;

  select email into v_email from auth.users where id = v_uid;

  insert into public.organizations (name, owner_id, phone, email)
  values (trim(p_org_name), v_uid, p_phone, v_email)
  returning id into v_org;

  insert into public.staff_members (org_id, user_id, full_name, phone, email, role)
  values (v_org, v_uid, trim(p_owner_name), p_phone, v_email, 'owner');

  insert into public.outlets (org_id, name, code, phone, city, state, state_code, gstin, fssai_no)
  values (v_org, trim(p_outlet_name), upper(trim(p_outlet_code)), p_phone, p_city, p_state,
          p_state_code, nullif(upper(trim(p_gstin)), ''), nullif(trim(p_fssai_no), ''))
  returning id into v_outlet;

  insert into public.tax_groups (org_id, name, cgst_rate, sgst_rate, is_default) values
    (v_org, 'GST 5%',  2.5, 2.5, true),
    (v_org, 'GST 18%', 9,   9,   false),
    (v_org, 'No Tax',  0,   0,   false);

  insert into public.areas (org_id, outlet_id, name) values (v_org, v_outlet, 'Main Hall');

  return v_org;
end $$;

-- =====================================================================
-- 14. VIEWS
-- =====================================================================
-- security_invoker = the view obeys the caller's RLS
create view public.v_low_stock with (security_invoker = true) as
select s.outlet_id, s.raw_material_id, rm.name, rm.unit, rm.category,
       s.quantity, coalesce(s.min_stock, rm.min_stock) as min_stock
from public.outlet_stock s
join public.raw_materials rm on rm.id = s.raw_material_id
where rm.is_active and s.quantity <= coalesce(s.min_stock, rm.min_stock);

-- =====================================================================
-- 15. ROW LEVEL SECURITY
-- =====================================================================
-- Turn RLS on for every table. A table with RLS on and no matching policy
-- returns NOTHING — that's the safe default.
do $$
declare r record;
begin
  for r in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', r.tablename);
  end loop;
end $$;

grant usage on schema private to authenticated;
grant execute on all functions in schema private to authenticated;

-- ---------- organisation / outlets / staff ----------
create policy org_select on public.organizations for select to authenticated
  using (id in (select private.my_org_ids()));
create policy org_update on public.organizations for update to authenticated
  using (id in (select private.my_org_ids('{owner}')))
  with check (id in (select private.my_org_ids('{owner}')));

create policy outlets_select on public.outlets for select to authenticated
  using (id in (select private.my_outlet_ids()));
create policy outlets_insert on public.outlets for insert to authenticated
  with check (org_id in (select private.my_org_ids('{owner}')));
create policy outlets_update on public.outlets for update to authenticated
  using (id in (select private.my_outlet_ids('{owner,manager}')))
  with check (id in (select private.my_outlet_ids('{owner,manager}')));
create policy outlets_delete on public.outlets for delete to authenticated
  using (org_id in (select private.my_org_ids('{owner}')));

create policy tax_groups_select on public.tax_groups for select to authenticated
  using (org_id in (select private.my_org_ids()));
create policy tax_groups_write on public.tax_groups for all to authenticated
  using (org_id in (select private.my_org_ids('{owner}')))
  with check (org_id in (select private.my_org_ids('{owner}')));

create policy staff_select on public.staff_members for select to authenticated
  using (org_id in (select private.my_org_ids()));
-- owner can manage anyone; manager can manage cashier/waiter/kitchen only
create policy staff_insert on public.staff_members for insert to authenticated
  with check (
    (org_id in (select private.my_org_ids('{owner}')) and role <> 'owner')
    or (org_id in (select private.my_org_ids('{manager}')) and role in ('cashier','waiter','kitchen')));
create policy staff_update on public.staff_members for update to authenticated
  using (
    org_id in (select private.my_org_ids('{owner}'))
    or (org_id in (select private.my_org_ids('{manager}')) and role in ('cashier','waiter','kitchen')))
  with check (
    org_id in (select private.my_org_ids('{owner}'))
    or (org_id in (select private.my_org_ids('{manager}')) and role in ('cashier','waiter','kitchen')));
create policy staff_delete on public.staff_members for delete to authenticated
  using (org_id in (select private.my_org_ids('{owner}')));

create policy staff_outlets_select on public.staff_outlets for select to authenticated
  using (org_id in (select private.my_org_ids()));
create policy staff_outlets_write on public.staff_outlets for all to authenticated
  using (org_id in (select private.my_org_ids('{owner,manager}')))
  with check (outlet_id in (select private.my_outlet_ids('{owner,manager}')));

create policy pos_devices_all on public.pos_devices for all to authenticated
  using (outlet_id in (select private.my_outlet_ids('{owner,manager}')))
  with check (outlet_id in (select private.my_outlet_ids('{owner,manager}')));

-- staff_pins, outlet_counters: no policies on purpose (server-only)

-- ---------- menu (organisation-wide) ----------
do $$
declare t text;
begin
  foreach t in array array['menu_categories','menu_items','item_variants','addon_groups',
                           'addons','item_addon_groups','recipe_items']
  loop
    execute format('create policy %1$s_select on public.%1$I for select to authenticated
                    using (org_id in (select private.my_org_ids()))', t);
    execute format('create policy %1$s_write on public.%1$I for all to authenticated
                    using (org_id in (select private.my_org_ids(''{owner,manager}'')))
                    with check (org_id in (select private.my_org_ids(''{owner,manager}'')))', t);
  end loop;
end $$;

-- ---------- outlet-level master data ----------
do $$
declare t text;
begin
  foreach t in array array['outlet_item_overrides','outlet_variant_overrides','kitchen_stations',
                           'outlet_category_stations','areas','dining_tables']
  loop
    execute format('create policy %1$s_select on public.%1$I for select to authenticated
                    using (outlet_id in (select private.my_outlet_ids()))', t);
    execute format('create policy %1$s_write on public.%1$I for all to authenticated
                    using (outlet_id in (select private.my_outlet_ids(''{owner,manager}'')))
                    with check (outlet_id in (select private.my_outlet_ids(''{owner,manager}'')))', t);
  end loop;
end $$;

-- ---------- orders (read-only for the browser; writes via secure functions) ----------
do $$
declare t text;
begin
  foreach t in array array['orders','order_items','order_item_addons','order_tables']
  loop
    execute format('create policy %1$s_select on public.%1$I for select to authenticated
                    using (outlet_id in (select private.my_outlet_ids(''{owner,manager,cashier,waiter}'')))', t);
  end loop;
  -- kitchen staff see KOTs (no prices) — everyone at the outlet can
  foreach t in array array['kots','kot_items']
  loop
    execute format('create policy %1$s_select on public.%1$I for select to authenticated
                    using (outlet_id in (select private.my_outlet_ids()))', t);
  end loop;
end $$;

create policy payments_select on public.payments for select to authenticated
  using (outlet_id in (select private.my_outlet_ids('{owner,manager,cashier}')));
create policy order_events_select on public.order_events for select to authenticated
  using (outlet_id in (select private.my_outlet_ids('{owner,manager}')));

-- ---------- customers ----------
create policy customers_select on public.customers for select to authenticated
  using (org_id in (select private.my_org_ids('{owner,manager,cashier}')));
create policy customers_insert on public.customers for insert to authenticated
  with check (org_id in (select private.my_org_ids('{owner,manager,cashier}')));
-- balances (points, spent, due) are protected by a column-level grant below
create policy customers_update on public.customers for update to authenticated
  using (org_id in (select private.my_org_ids('{owner,manager,cashier}')))
  with check (org_id in (select private.my_org_ids('{owner,manager,cashier}')));
create policy customers_delete on public.customers for delete to authenticated
  using (org_id in (select private.my_org_ids('{owner}')));
create policy loyalty_select on public.loyalty_transactions for select to authenticated
  using (org_id in (select private.my_org_ids('{owner,manager,cashier}')));

-- ---------- inventory ----------
do $$
declare t text;
begin
  foreach t in array array['vendors','raw_materials']
  loop
    execute format('create policy %1$s_select on public.%1$I for select to authenticated
                    using (org_id in (select private.my_org_ids(''{owner,manager,kitchen}'')))', t);
    execute format('create policy %1$s_write on public.%1$I for all to authenticated
                    using (org_id in (select private.my_org_ids(''{owner,manager}'')))
                    with check (org_id in (select private.my_org_ids(''{owner,manager}'')))', t);
  end loop;
end $$;

create policy outlet_stock_select on public.outlet_stock for select to authenticated
  using (outlet_id in (select private.my_outlet_ids('{owner,manager,kitchen}')));
create policy outlet_stock_update on public.outlet_stock for update to authenticated   -- only min_stock (column grant)
  using (outlet_id in (select private.my_outlet_ids('{owner,manager}')))
  with check (outlet_id in (select private.my_outlet_ids('{owner,manager}')));
create policy stock_movements_select on public.stock_movements for select to authenticated
  using (outlet_id in (select private.my_outlet_ids('{owner,manager}')));

-- purchases: editable while draft; "receive" happens via a secure function (Phase 5)
create policy purchases_select on public.purchases for select to authenticated
  using (outlet_id in (select private.my_outlet_ids('{owner,manager}')));
create policy purchases_insert on public.purchases for insert to authenticated
  with check (outlet_id in (select private.my_outlet_ids('{owner,manager}')) and status = 'draft');
create policy purchases_update on public.purchases for update to authenticated
  using (outlet_id in (select private.my_outlet_ids('{owner,manager}')) and status = 'draft')
  with check (outlet_id in (select private.my_outlet_ids('{owner,manager}')) and status in ('draft','cancelled'));
create policy purchases_delete on public.purchases for delete to authenticated
  using (outlet_id in (select private.my_outlet_ids('{owner,manager}')) and status = 'draft');

create policy purchase_items_select on public.purchase_items for select to authenticated
  using (outlet_id in (select private.my_outlet_ids('{owner,manager}')));
create policy purchase_items_write on public.purchase_items for all to authenticated
  using (outlet_id in (select private.my_outlet_ids('{owner,manager}'))
         and exists (select 1 from public.purchases p where p.id = purchase_id and p.status = 'draft'))
  with check (outlet_id in (select private.my_outlet_ids('{owner,manager}'))
         and exists (select 1 from public.purchases p where p.id = purchase_id and p.status = 'draft'));

-- ---------- audit ----------
create policy audit_logs_select on public.audit_logs for select to authenticated
  using (org_id in (select private.my_org_ids('{owner}')));

-- ---------------------------------------------------------------------
-- Column-level protection: the browser must never edit these columns,
-- even on rows it is allowed to update. Triggers/functions still can.
-- ---------------------------------------------------------------------
revoke all on public.staff_pins, public.outlet_counters, public.audit_logs from anon, authenticated;
grant select on public.audit_logs to authenticated;

revoke update on public.customers from authenticated;
grant update (name, phone, email, gstin, address, birthday, anniversary, notes)
  on public.customers to authenticated;

revoke update on public.outlet_stock from authenticated;
grant update (min_stock) on public.outlet_stock to authenticated;

revoke insert, update, delete on public.organizations from authenticated;
grant update (name, phone, email, loyalty_enabled, loyalty_earn_percent, loyalty_point_value,
              loyalty_min_redeem_points) on public.organizations to authenticated;

revoke update on public.dining_tables from authenticated;
grant update (area_id, name, seats, shape, pos_x, pos_y, sort_order, is_active)
  on public.dining_tables to authenticated;

revoke update on public.purchases from authenticated;
grant update (vendor_id, bill_no, bill_date, status, subtotal, tax_amount, total_amount,
              paid_amount, notes) on public.purchases to authenticated;

-- anonymous visitors get nothing at all
revoke all on all tables in schema public from anon;

-- only signed-in users may call the onboarding function
revoke execute on function public.create_organization(text,text,text,text,text,text,text,text,text,text) from public, anon;
grant  execute on function public.create_organization(text,text,text,text,text,text,text,text,text,text) to authenticated;

-- =====================================================================
-- 16. REALTIME (POS ⇄ waiter app ⇄ kitchen screen)
-- =====================================================================
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table
      public.orders, public.order_items, public.order_tables,
      public.kots, public.kot_items, public.dining_tables,
      public.outlet_item_overrides, public.outlet_variant_overrides;
  end if;
end $$;

-- =====================================================================
-- 17. STORAGE (logos & item photos)
--     Files are stored as  media/<org_id>/<anything>.jpg
-- =====================================================================
do $$
begin
  if exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('media', 'media', true, 2097152, array['image/png','image/jpeg','image/webp'])
    on conflict (id) do nothing;

    execute $p$create policy media_read on storage.objects for select to authenticated
      using (bucket_id = 'media' and (storage.foldername(name))[1] in
             (select x::text from private.my_org_ids() x))$p$;
    execute $p$create policy media_insert on storage.objects for insert to authenticated
      with check (bucket_id = 'media' and (storage.foldername(name))[1] in
             (select x::text from private.my_org_ids('{owner,manager}') x))$p$;
    execute $p$create policy media_update on storage.objects for update to authenticated
      using (bucket_id = 'media' and (storage.foldername(name))[1] in
             (select x::text from private.my_org_ids('{owner,manager}') x))$p$;
    execute $p$create policy media_delete on storage.objects for delete to authenticated
      using (bucket_id = 'media' and (storage.foldername(name))[1] in
             (select x::text from private.my_org_ids('{owner,manager}') x))$p$;
  end if;
end $$;

-- ✅ Done. Next: Phase 1 adds the sign-up / login screens and calls
--    public.create_organization() to set up the first outlet.
