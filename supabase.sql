-- Штаб: база для синхронизации проектов между устройствами.
-- Выполните один раз: Supabase → SQL Editor → New query → вставьте весь текст → Run.
-- Повторный запуск безопасен: ничего не удалит.

-- 1. Таблица: каждый проект и карта — отдельная запись пользователя
create table if not exists public.docs (
  user_id    uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  id         text        not null,
  data       jsonb       not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

-- 2. Доступ: каждый видит и меняет только свои записи
alter table public.docs enable row level security;

drop policy if exists docs_select_own on public.docs;
drop policy if exists docs_insert_own on public.docs;
drop policy if exists docs_update_own on public.docs;
drop policy if exists docs_delete_own on public.docs;

create policy docs_select_own on public.docs for select to authenticated using ((select auth.uid()) = user_id);
create policy docs_insert_own on public.docs for insert to authenticated with check ((select auth.uid()) = user_id);
create policy docs_update_own on public.docs for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy docs_delete_own on public.docs for delete to authenticated using ((select auth.uid()) = user_id);

revoke all on public.docs from anon;
grant select, insert, update, delete on public.docs to authenticated;

-- 3. Мгновенная доставка изменений на другие устройства
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'docs'
  ) then
    alter publication supabase_realtime add table public.docs;
  end if;
end $$;

-- 4. Лёгкая проверка «я жив» для ежедневного пинга (не даёт бесплатному проекту уснуть, данных не раскрывает)
create or replace function public.ping()
returns text
language sql
security definer
set search_path = ''
as $$ select 'ok'::text $$;

revoke all on function public.ping() from public;
grant execute on function public.ping() to anon, authenticated;
