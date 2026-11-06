-- Meus Gastos — 016: os DEPÓSITOS de cada investimento (o IR em cascata, 06/11/2026).
-- Como aplicar: Supabase → SQL Editor → cole este arquivo inteiro → Run.
--
-- O IR da renda fixa vai sobre o rendimento de CADA depósito, pela idade dele (22,5% até 180 dias, 20% até 360, 17,5%
-- até 720 e 15% depois). As aplicações feitas pelo app já são movimentos com a data e o valor; o que já estava aplicado
-- antes do cadastro entra aqui, como o banco mostra na lista de depósitos: a DATA de cada um e quanto ele VALE numa
-- data de referência (`referencia`, a do valor que o banco mostrou). O depositado e o rendimento de cada um o app
-- estima pelo CDI (`lib/impostoInvestimento.js`). Colar a lista de novo substitui a anterior.

create table public.depositos_investimento (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  investimento_id uuid not null references public.investimentos (id) on delete cascade,
  data date not null,
  valor_centavos bigint not null check (valor_centavos > 0),
  referencia date not null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index depositos_investimento_inv on public.depositos_investimento (investimento_id, data);

do $$
declare t text;
begin
  foreach t in array array['depositos_investimento']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)', t || '_dono', t);
    execute format('grant select, insert, update, delete on table public.%I to authenticated', t);
    execute format('revoke all on table public.%I from anon', t);
    execute format('create trigger %I before update on public.%I for each row execute function public.tocar_atualizado_em()', t || '_atualizado_em', t);
  end loop;
end $$;
