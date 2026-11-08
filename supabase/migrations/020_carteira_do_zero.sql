-- Meus Gastos — 020: a CARTEIRA DO ZERO (07/11/2026, o mockup "Carteira por aportes", tabela A).
-- Como aplicar: Supabase → SQL Editor → cole este arquivo inteiro → Run.
--
-- Os investimentos recomeçam com TRÊS tabelas e uma conta só:
--   · inv_cadastro — o que o investimento É (nome, instituição, tipo, a taxa em % do CDI, se resgata a qualquer hora ou só
--     no vencimento e o prazo que SUGERE o vencimento do aporte). Não tem dinheiro.
--   · inv_aportes — o dinheiro que entrou. "Dinheiro novo" (origem 'novo'): a data e o valor aplicado. "Já estava
--     aplicado" (origem 'antigo'): o dia em que você olhou o banco, o total nesse dia e quanto ele já tinha rendido
--     (o aplicado é a diferença); a data do aporte (`aplicado_em`) é opcional, só para o IR. O vencimento é o digitado.
--   · inv_resgates — o que saiu de UM aporte (o valor, ou tudo).
-- O valor de hoje é calculado: o valor de partida × o CDI de cada dia útil × a taxa (`lib/carteira.js`). Nada mais.
--
-- As tabelas antigas (contas, saldos, investimentos, valores_investimento, movimentos_investimento,
-- depositos_investimento — migrations 006 a 019) FICAM PARADAS: o app não lê nem grava mais nelas. Uma migration futura
-- as apaga, depois de conferida a carteira nova.

create table public.inv_cadastro (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  nome text not null check (length(trim(nome)) > 0),
  instituicao text not null check (length(trim(instituicao)) > 0),
  tipo text not null default 'cdb' check (tipo in ('cdb', 'rdb', 'lci', 'lca', 'outro')),
  taxa numeric(7, 3) not null check (taxa > 0),                 -- em % do CDI (102,5 = 102,5% do CDI)
  resgate text not null default 'diaria' check (resgate in ('diaria', 'vencimento')),
  prazo_meses integer check (prazo_meses > 0),                  -- só sugere o vencimento do aporte
  vence_dia_antes boolean not null default false,               -- o RDB do Nubank: 03/06 + 6 meses vence em 02/12
  ativo boolean not null default true,
  ordem integer not null default 0,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create table public.inv_aportes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  investimento_id uuid not null references public.inv_cadastro (id) on delete cascade,
  origem text not null default 'novo' check (origem in ('novo', 'antigo')),
  data date not null,                                           -- novo: o dia do aporte · antigo: o dia em que leu o banco
  valor_centavos bigint not null check (valor_centavos > 0),    -- novo: o aplicado · antigo: o total no banco nesse dia
  rendeu_antes_centavos bigint not null default 0 check (rendeu_antes_centavos >= 0),
  aplicado_em date,                                             -- antigo: a data do aporte, para o IR (opcional)
  vencimento date,
  observacao text not null default '',
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  check (rendeu_antes_centavos < valor_centavos),
  check (origem = 'antigo' or (rendeu_antes_centavos = 0 and aplicado_em is null))
);
create index inv_aportes_investimento on public.inv_aportes (investimento_id, data);

create table public.inv_resgates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  aporte_id uuid not null references public.inv_aportes (id) on delete cascade,
  data date not null,
  valor_centavos bigint check (valor_centavos > 0),             -- null quando é tudo
  tudo boolean not null default false,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  check (tudo or valor_centavos is not null)
);
create index inv_resgates_aporte on public.inv_resgates (aporte_id, data);

do $$
declare t text;
begin
  foreach t in array array['inv_cadastro', 'inv_aportes', 'inv_resgates']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)', t || '_dono', t);
    execute format('grant select, insert, update, delete on table public.%I to authenticated', t);
    execute format('revoke all on table public.%I from anon', t);
    execute format('create trigger %I before update on public.%I for each row execute function public.tocar_atualizado_em()', t || '_atualizado_em', t);
  end loop;
end $$;
