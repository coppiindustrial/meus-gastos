-- Meus Gastos — 013: os APORTES e RESGATES dos investimentos (o rendimento do Patrimônio, fase A do plano
-- "Patrimônio e rentabilidade", 05/11/2026).
-- Como aplicar: Supabase → SQL Editor → cole este arquivo inteiro → Run.
--
-- Até aqui a conta só tinha as FOTOS do saldo (`saldos`): a diferença de um mês para o outro misturava o que foi
-- aportado com o que rendeu. Com os movimentos de cada conta, rendimento = saldo de agora − saldo de antes − aportes
-- + resgates (`lib/patrimonio.js`).
--   · `origem` 'extrato': veio do extrato do Nubank (a aplicação e o resgate do RDB, o "dinheiro guardado"), com o
--     identificador do banco em `id_externo` — importar o mesmo extrato de novo não duplica;
--   · `origem` 'manual': digitado no "Registrar o mês" (as outras corretoras).
-- `contas.recebe_extrato`: a conta que recebe os movimentos de investimento do extrato importado (uma só).

create table public.movimentos_investimento (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  conta_id uuid not null references public.contas (id) on delete cascade,
  data date not null,
  tipo text not null check (tipo in ('aporte', 'resgate')),
  valor_centavos bigint not null check (valor_centavos > 0),
  descricao text not null default '',
  origem text not null default 'manual' check (origem in ('manual', 'extrato')),
  id_externo text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (user_id, id_externo)
);
create index movimentos_investimento_conta_data on public.movimentos_investimento (conta_id, data);

alter table public.contas add column if not exists recebe_extrato boolean not null default false;

do $$
declare t text;
begin
  foreach t in array array['movimentos_investimento']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)', t || '_dono', t);
    execute format('grant select, insert, update, delete on table public.%I to authenticated', t);
    execute format('revoke all on table public.%I from anon', t);
    execute format('create trigger %I before update on public.%I for each row execute function public.tocar_atualizado_em()', t || '_atualizado_em', t);
  end loop;
end $$;
