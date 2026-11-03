-- 名前の一覧を Supabase 側に持ち、全端末で共有する。
-- Supabase の SQL Editor でそのまま実行してください（supabase/schema.sql を既に実行済みの前提）。

create table if not exists public.members (
  id          bigint generated always as identity primary key,
  name        text not null,
  active      boolean not null default true,  -- false ＝ 一覧から外した（他端末にも反映）
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (name)
);

create index if not exists members_active_idx on public.members (active);
create index if not exists members_updated_at_idx on public.members (updated_at);

-- updated_at の自動更新（schema.sql の set_updated_at() を使う）
drop trigger if exists trg_members_updated_at on public.members;
create trigger trg_members_updated_at
  before update on public.members
  for each row execute function public.set_updated_at();

-- RLS：ログイン無しの運用に合わせて anon に全操作を許可
alter table public.members enable row level security;

do $$
declare op text;
declare pol text;
begin
  for op in select unnest(array['select','insert','update','delete']) loop
    pol := format('members_%s_anon', op);
    execute format('drop policy if exists %I on public.members;', pol);
    if op = 'select' then
      execute format(
        'create policy %I on public.members for select to anon using (true);',
        pol
      );
    elsif op = 'insert' then
      execute format(
        'create policy %I on public.members for insert to anon with check (true);',
        pol
      );
    elsif op = 'update' then
      execute format(
        'create policy %I on public.members for update to anon using (true) with check (true);',
        pol
      );
    else
      execute format(
        'create policy %I on public.members for delete to anon using (true);',
        pol
      );
    end if;
  end loop;
end$$;
