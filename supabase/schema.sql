-- 棚卸しアシスタント Supabase スキーマ
-- CLAUDE.md「データの形（案）」を元に作成
-- ログインなしの前提：匿名（anon）ロールから読み書きできるようにする
-- Supabase SQL Editor で丸ごと実行してください

-- =========================================================
-- 拡張
-- =========================================================
create extension if not exists "pgcrypto";

-- =========================================================
-- 発注先
-- =========================================================
create table if not exists public.suppliers (
  id          bigint generated always as identity primary key,
  name        text not null,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (name)
);

create index if not exists suppliers_sort_order_idx on public.suppliers (sort_order);

-- =========================================================
-- 品目
-- =========================================================
create table if not exists public.items (
  id              bigint generated always as identity primary key,
  name            text    not null,
  reading         text    not null default '',           -- ひらがなの読み（検索用）
  supplier_id     bigint  not null references public.suppliers(id) on delete restrict,
  sheet_order     integer not null default 0,            -- 業者の用紙上の並び順
  spec            text,                                   -- 規格
  unit            text    not null,                       -- 箱／缶／本／P／kg／g／cs／枚／尾／コ
  is_weight       boolean not null default false,         -- 小数で量る品目か
  pack_qty        integer,                                -- 入数
  unit_price      numeric(12,2),                          -- 単価（税抜/税込は stocktakes.tax_mode に従う）
  active          boolean not null default true,
  is_provisional  boolean not null default false,         -- 保管庫で仮登録したもの
  last_month_qty  numeric(14,3),                          -- 先月の数量（見直し機能で使用）
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (supplier_id, name)
);

create index if not exists items_supplier_sheet_idx on public.items (supplier_id, sheet_order);
create index if not exists items_reading_idx on public.items (reading);
create index if not exists items_active_idx on public.items (active);

-- =========================================================
-- 棚卸し（月ごと）
-- =========================================================
create table if not exists public.stocktakes (
  id          bigint generated always as identity primary key,
  month       text    not null,                            -- 例: '2026-11'
  status      text    not null default 'open'
              check (status in ('open','closed')),
  tax_mode    text    not null default 'excluded'
              check (tax_mode in ('included','excluded')),
  tax_rate    numeric(5,2) not null default 8,             -- 食品は 8%
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (month)
);

-- =========================================================
-- 入力の記録（1 入力 = 1 行）
-- 合計は「最後の set 以降の add の和」をアプリ側で計算する
-- =========================================================
create table if not exists public.count_entries (
  id            bigint generated always as identity primary key,
  client_uid    text    not null,                          -- 端末側で生成する一意キー（二重送信防止）
  stocktake_id  bigint  not null references public.stocktakes(id) on delete cascade,
  item_id       bigint  not null references public.items(id)      on delete cascade,
  qty           numeric(14,3) not null,
  mode          text    not null check (mode in ('set','add')),
  counted_by    text    not null default '',
  device_id     text    not null default '',
  counted_at    timestamptz not null,                      -- 端末で入力した時刻
  synced_at     timestamptz not null default now(),
  unique (client_uid)
);

create index if not exists count_entries_stock_item_idx
  on public.count_entries (stocktake_id, item_id, counted_at);
create index if not exists count_entries_synced_idx
  on public.count_entries (synced_at);

-- =========================================================
-- ラベル写真（保管庫で撮った段ボールの写真）
-- =========================================================
create table if not exists public.label_photos (
  id            bigint generated always as identity primary key,
  stocktake_id  bigint not null references public.stocktakes(id) on delete cascade,
  image_path    text   not null,                           -- Supabase Storage のパス
  status        text   not null default 'pending'
                check (status in ('pending','read','registered')),
  result_json   jsonb,                                      -- Claude の読み取り結果
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists label_photos_stock_idx on public.label_photos (stocktake_id);
create index if not exists label_photos_status_idx on public.label_photos (status);

-- =========================================================
-- Claude による見直しの指摘
-- =========================================================
create table if not exists public.review_findings (
  id            bigint generated always as identity primary key,
  stocktake_id  bigint not null references public.stocktakes(id) on delete cascade,
  item_id       bigint references public.items(id) on delete set null,
  reason        text   not null,
  suggestion    text   not null default '',
  status        text   not null default 'unconfirmed'
                check (status in ('unconfirmed','fixed','ok')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists review_findings_stock_idx on public.review_findings (stocktake_id);
create index if not exists review_findings_status_idx on public.review_findings (status);

-- =========================================================
-- updated_at 自動更新トリガ
-- =========================================================
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

do $$
declare t text;
begin
  for t in select unnest(array[
    'suppliers','items','stocktakes','label_photos','review_findings'
  ]) loop
    execute format(
      'drop trigger if exists trg_%1$s_updated_at on public.%1$s;
       create trigger trg_%1$s_updated_at
         before update on public.%1$s
         for each row execute function public.set_updated_at();',
      t
    );
  end loop;
end$$;

-- =========================================================
-- Row Level Security
-- ログイン無しの運用：匿名ロール（anon）に全操作を許可する
-- ※現場利用者のみが知る URL と Supabase の anon key で保護する前提
-- =========================================================
alter table public.suppliers       enable row level security;
alter table public.items           enable row level security;
alter table public.stocktakes      enable row level security;
alter table public.count_entries   enable row level security;
alter table public.label_photos    enable row level security;
alter table public.review_findings enable row level security;

do $$
declare
  tbl text;
  op  text;
  pol text;
begin
  for tbl in select unnest(array[
    'suppliers','items','stocktakes','count_entries','label_photos','review_findings'
  ]) loop
    for op in select unnest(array['select','insert','update','delete']) loop
      pol := format('%s_%s_anon', tbl, op);
      execute format('drop policy if exists %I on public.%I;', pol, tbl);
      if op = 'select' then
        execute format(
          'create policy %I on public.%I for select to anon using (true);',
          pol, tbl
        );
      elsif op = 'insert' then
        execute format(
          'create policy %I on public.%I for insert to anon with check (true);',
          pol, tbl
        );
      elsif op = 'update' then
        execute format(
          'create policy %I on public.%I for update to anon using (true) with check (true);',
          pol, tbl
        );
      else
        execute format(
          'create policy %I on public.%I for delete to anon using (true);',
          pol, tbl
        );
      end if;
    end loop;
  end loop;
end$$;

-- =========================================================
-- （任意）Storage バケット：ラベル写真用
-- Supabase ダッシュボードの Storage で手動作成でも可
-- =========================================================
-- insert into storage.buckets (id, name, public)
--   values ('label-photos','label-photos', false)
--   on conflict (id) do nothing;
