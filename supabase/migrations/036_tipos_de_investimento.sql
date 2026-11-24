-- Meus Gastos — 036: os TIPOS DE INVESTIMENTO da pessoa (24/11/2026, o mockup "Tipos de investimento", opção A com a
-- escolha da C).
-- Como aplicar: Supabase → SQL Editor → cole este arquivo inteiro → Run.
--
-- Os tipos prontos (CDB, RDB, LCI, LCA, Outro) seguem no `inv_cadastro.tipo`, com os impostos pela lei. Para o que ainda não
-- existe (CRA, CRI, Tesouro Selic, debênture incentivada…), a pessoa cadastra o tipo dela dizendo se ele paga o IR (a tabela
-- regressiva de 22,5% a 15%) e o IOF dos 30 primeiros dias. O investimento desse tipo fica com `tipo = 'outro'` e o
-- `tipo_id` apontando o tipo dela, que decide o nome e os impostos. O tipo em uso não sai (`on delete restrict`).
-- Sem esta migration, o cadastro segue só com os prontos.

create table if not exists public.inv_tipos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  nome text not null check (length(trim(nome)) > 0),
  paga_ir boolean not null default true,
  paga_iof boolean not null default true,
  ordem integer not null default 0,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (user_id, nome)
);

alter table public.inv_cadastro add column if not exists tipo_id uuid references public.inv_tipos (id) on delete restrict;
create index if not exists inv_cadastro_tipo on public.inv_cadastro (tipo_id);

do $$
declare t text;
begin
  foreach t in array array['inv_tipos']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)', t || '_dono', t);
    execute format('grant select, insert, update, delete on table public.%I to authenticated', t);
    execute format('revoke all on table public.%I from anon', t);
    execute format('create trigger %I before update on public.%I for each row execute function public.tocar_atualizado_em()', t || '_atualizado_em', t);
  end loop;
end $$;
