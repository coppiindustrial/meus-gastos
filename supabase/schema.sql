-- Meus Gastos: estrutura do banco no Supabase (mesmo desenho do app de treino: uma tabela genérica "records").
-- Como usar: no painel do Supabase, abra "SQL Editor", cole este arquivo inteiro e clique em "Run".
-- Pode rodar mais de uma vez sem problema.

create table if not exists public.records (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null,
  id text not null,
  updated_at bigint not null,
  deleted boolean not null default false,
  data jsonb not null default '{}'::jsonb,
  synced_at timestamptz not null default now(),
  primary key (user_id, kind, id)
);

create index if not exists records_user_synced_idx on public.records (user_id, synced_at);

-- Cada pessoa só enxerga e altera os próprios dados.
alter table public.records enable row level security;

drop policy if exists "records_select_own" on public.records;
create policy "records_select_own" on public.records
  for select using (auth.uid() = user_id);

drop policy if exists "records_insert_own" on public.records;
create policy "records_insert_own" on public.records
  for insert with check (auth.uid() = user_id);

drop policy if exists "records_update_own" on public.records;
create policy "records_update_own" on public.records
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "records_delete_own" on public.records;
create policy "records_delete_own" on public.records
  for delete using (auth.uid() = user_id);

-- Marca a hora em que cada registro chegou ao servidor (usada para baixar só o que mudou).
create or replace function public.records_touch()
returns trigger
language plpgsql
as $$
begin
  new.synced_at := clock_timestamp();
  return new;
end;
$$;

drop trigger if exists records_touch on public.records;
create trigger records_touch
  before insert or update on public.records
  for each row execute function public.records_touch();

-- Libera a tabela só para quem está logado (necessário quando "Automatically expose new tables" está desligado).
grant select, insert, update, delete on table public.records to authenticated;
