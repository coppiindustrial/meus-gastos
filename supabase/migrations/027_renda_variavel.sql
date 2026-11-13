-- Meus Gastos — 027: a RENDA VARIÁVEL (13/11/2026, o mockup "Renda variável", tabela A).
-- Como aplicar: Supabase → SQL Editor → cole este arquivo inteiro → Run.
--
-- Quatro tabelas:
--   · rv_ativos — o que o ativo É: o ticker, o nome, o tipo (ação da B3, FII, BDR, ETF, ação ou ETF dos EUA), o mercado
--     (B3 ou EUA) e a moeda dele (BRL ou USD), a corretora em texto. Não tem dinheiro.
--   · rv_operacoes — o que aconteceu com ele: COMPRA e VENDA (a quantidade, o total na moeda do ativo, as taxas e, no
--     exterior, o dólar do dia), PROVENTO (o valor bruto, o retido na fonte e o tipo: rendimento, dividendo, JCP) e
--     DESDOBRAMENTO / GRUPAMENTO (o fator: 4 = cada cota vira 4; 0,1 = dez viram uma). As contas (preço médio, custo em
--     reais, resultado) ficam em `lib/rendaVariavel.js`.
--   · rv_cotacoes — a última cotação de cada ativo. Quem grava é a função `cotacoes` do Supabase (a chave da brapi e a da
--     Finnhub ficam nos segredos dela); o app só lê.
--   · rv_fechamentos — o preço de fechamento de cada dia, também gravado pela função: o mês a mês do Patrimônio.
-- Dinheiro em CENTAVOS da moeda do ativo (o total da operação, as taxas, o provento); o preço da cotação em numeric, porque
-- a fonte o manda com mais casas.

create table public.rv_ativos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  ticker text not null check (ticker = upper(trim(ticker)) and length(ticker) between 1 and 12),
  nome text not null default '',
  tipo text not null check (tipo in ('acao_br', 'fii', 'bdr', 'etf_br', 'acao_eua', 'etf_eua')),
  mercado text not null check (mercado in ('B3', 'EUA')),
  moeda text not null check (moeda in ('BRL', 'USD')),
  corretora text not null default '',
  ativo boolean not null default true,
  ordem integer not null default 0,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (user_id, mercado, ticker),
  check ((mercado = 'EUA') = (moeda = 'USD')),
  check ((mercado = 'EUA') = (tipo in ('acao_eua', 'etf_eua')))
);

create table public.rv_operacoes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  ativo_id uuid not null references public.rv_ativos (id) on delete cascade,
  tipo text not null check (tipo in ('compra', 'venda', 'provento', 'desdobramento', 'grupamento')),
  data date not null,
  quantidade numeric(20, 8) check (quantidade > 0),             -- compra e venda (aceita fração: as corretoras dos EUA)
  valor_centavos bigint check (valor_centavos > 0),              -- compra/venda: quantidade × preço · provento: o bruto
  taxas_centavos bigint not null default 0 check (taxas_centavos >= 0),
  retido_centavos bigint not null default 0 check (retido_centavos >= 0), -- provento: o imposto retido na fonte
  dolar numeric(10, 4) check (dolar > 0),                        -- o exterior: reais por dólar no dia da operação
  provento text check (provento in ('rendimento', 'dividendo', 'jcp')),
  fator numeric(14, 6) check (fator > 0),                        -- desdobramento (> 1) e grupamento (< 1)
  observacao text not null default '',
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  check (tipo not in ('compra', 'venda') or (quantidade is not null and valor_centavos is not null)),
  check (tipo <> 'provento' or (valor_centavos is not null and provento is not null and retido_centavos < valor_centavos)),
  check (tipo not in ('desdobramento', 'grupamento') or fator is not null)
);
create index rv_operacoes_ativo on public.rv_operacoes (ativo_id, data);

create table public.rv_cotacoes (
  ativo_id uuid primary key references public.rv_ativos (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  preco numeric(18, 6) not null check (preco > 0),
  variacao_dia numeric(12, 8),                                   -- 0,021 = +2,1% sobre o fechamento anterior
  abertura numeric(18, 6),
  maxima numeric(18, 6),
  minima numeric(18, 6),
  fechamento_anterior numeric(18, 6),
  cotado_em timestamptz not null,                                -- a hora do negócio, pela fonte
  fonte text not null,                                           -- 'brapi' | 'finnhub'
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create table public.rv_fechamentos (
  ativo_id uuid not null references public.rv_ativos (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  data date not null,
  preco numeric(18, 6) not null check (preco > 0),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  primary key (ativo_id, data)
);

do $$
declare t text;
begin
  foreach t in array array['rv_ativos', 'rv_operacoes']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)', t || '_dono', t);
    execute format('grant select, insert, update, delete on table public.%I to authenticated', t);
    execute format('revoke all on table public.%I from anon', t);
    execute format('create trigger %I before update on public.%I for each row execute function public.tocar_atualizado_em()', t || '_atualizado_em', t);
  end loop;
  -- as cotações e os fechamentos: o app SÓ LÊ (quem grava é a função, com a chave de serviço, que passa por cima do RLS)
  foreach t in array array['rv_cotacoes', 'rv_fechamentos']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for select to authenticated using ((select auth.uid()) = user_id)', t || '_dono', t);
    execute format('grant select on table public.%I to authenticated', t);
    execute format('revoke all on table public.%I from anon', t);
    execute format('create trigger %I before update on public.%I for each row execute function public.tocar_atualizado_em()', t || '_atualizado_em', t);
  end loop;
end $$;
