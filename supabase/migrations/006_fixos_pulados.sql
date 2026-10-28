-- Meus Gastos — 006: o mês em que um gasto fixo "NÃO TEVE".
-- Como aplicar: Supabase → SQL Editor → cole este arquivo inteiro → Run.
--
-- Sem isto, um fixo vigente que não existiu num mês (a academia nas férias, a conta que não veio) fica
-- "a lançar" para sempre na grade dos Gastos fixos. Marcar "Não teve" grava a recorrência + o mês aqui:
-- a célula sai das pendências e fica hachurada. Lançar um valor naquele mês (ou desfazer) apaga a marca.

create table public.fixos_pulados (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  recorrencia_id uuid not null references public.recorrencias (id) on delete cascade,
  competencia date not null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (recorrencia_id, competencia)
);

do $$
declare t text;
begin
  foreach t in array array['fixos_pulados']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)', t || '_dono', t);
    execute format('grant select, insert, update, delete on table public.%I to authenticated', t);
    execute format('revoke all on table public.%I from anon', t);
    execute format('create trigger %I before update on public.%I for each row execute function public.tocar_atualizado_em()', t || '_atualizado_em', t);
  end loop;
end $$;
