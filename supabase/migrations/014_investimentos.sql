-- Meus Gastos — 014: os INVESTIMENTOS de cada conta (a carteira do Patrimônio, fase 8.B do plano "Patrimônio e
-- rentabilidade", 05/11/2026).
-- Como aplicar: Supabase → SQL Editor → cole este arquivo inteiro → Run.
--
-- Até aqui o rendimento era por CONTA (as fotos de `saldos` + os movimentos da 013). Agora cada título (o CDB, a LCI,
-- o Tesouro…) é cadastrado dentro de uma conta, com o que foi contratado (indexador e taxa), a liquidez e o
-- vencimento; o valor dele em cada data vai em `valores_investimento` (a "foto" do título), e o aporte e o resgate
-- ganham o investimento em que entraram (`movimentos_investimento.investimento_id`).
--   · O cadastro pede o "vale hoje" (a primeira foto): o que já estava aplicado antes do app. "Aplicado até hoje"
--     (opcional) é quanto saiu do bolso até ali — sem ele, o rendimento conta a partir do cadastro.
--   · As fotos antigas da CONTA ficam como estão (o histórico do gráfico); a conta passa a valer a soma dos títulos a
--     partir da primeira foto de um título dela (`lib/patrimonio.js`).
-- Nada aqui calcula imposto: o tipo só diz se é isento e se tem FGC.

create table public.investimentos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  conta_id uuid not null references public.contas (id) on delete cascade,
  nome text not null check (length(trim(nome)) > 0),
  tipo text not null default 'cdb' check (tipo in ('cdb', 'lci', 'lca', 'rdb', 'tesouro_selic', 'tesouro_ipca',
    'tesouro_prefixado', 'debenture', 'cri_cra', 'fundo', 'poupanca', 'outro')),
  indexador text check (indexador in ('cdi_pct', 'cdi_mais', 'ipca_mais', 'prefixado', 'selic_mais')),
  taxa numeric(9, 4),
  liquidez text not null default 'diaria' check (liquidez in ('diaria', 'vencimento', 'dias', 'carencia')),
  liquidez_dias integer check (liquidez_dias > 0),
  carencia_ate date,
  vencimento date,
  emissor text not null default '',
  aplicado_em date,
  aplicado_inicial_centavos bigint check (aplicado_inicial_centavos >= 0),
  observacao text not null default '',
  ativo boolean not null default true,
  ordem integer not null default 0,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index investimentos_conta on public.investimentos (conta_id);

-- O valor do título numa data (o que o app do banco mostra). Um por título e data: registrar de novo substitui.
create table public.valores_investimento (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  investimento_id uuid not null references public.investimentos (id) on delete cascade,
  data date not null,
  valor_centavos bigint not null check (valor_centavos >= 0),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (investimento_id, data)
);

alter table public.movimentos_investimento
  add column if not exists investimento_id uuid references public.investimentos (id) on delete cascade;
create index if not exists movimentos_investimento_investimento on public.movimentos_investimento (investimento_id, data);

do $$
declare t text;
begin
  foreach t in array array['investimentos', 'valores_investimento']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)', t || '_dono', t);
    execute format('grant select, insert, update, delete on table public.%I to authenticated', t);
    execute format('revoke all on table public.%I from anon', t);
    execute format('create trigger %I before update on public.%I for each row execute function public.tocar_atualizado_em()', t || '_atualizado_em', t);
  end loop;
end $$;
