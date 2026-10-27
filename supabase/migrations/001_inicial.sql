-- Meus Gastos — 001: tabelas do modelo de dados (PLANO.md, seção 3) com RLS por usuário.
-- Como aplicar: Supabase → SQL Editor → cole este arquivo inteiro → Run. Migrations são
-- append-only: nunca edite uma já aplicada; mudança nova vai num arquivo 002, 003…
--
-- Regras:
--   · todo registro tem `user_id` (default = quem está logado) e só o dono lê e grava (RLS);
--   · valores em CENTAVOS (bigint, positivo); a direção vem de `tipo`;
--   · competência é `date` no dia 1 do mês.

-- A tabela genérica da primeira versão (offline-first) saiu: os dados vivem nas tabelas abaixo.
drop table if exists public.records cascade;
drop function if exists public.records_touch();

-- Carimba `atualizado_em` em todo UPDATE.
create or replace function public.tocar_atualizado_em()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.atualizado_em := now();
  return new;
end;
$$;

-- ------------------------------------------------------------ Cadastros

create table public.grupos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  nome text not null,
  tipo text not null check (tipo in ('saida', 'entrada')),
  ordem int not null default 0,
  cor text not null default '#6b7280',
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (user_id, nome)
);

create table public.categorias (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  grupo_id uuid not null references public.grupos (id) on delete restrict,
  nome text not null,
  ordem int not null default 0,
  ativa boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (user_id, nome)
);

-- Palavra-chave no nome do estabelecimento → categoria. A primeira que bate (menor prioridade) vence.
create table public.regras (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  palavra_chave text not null,
  categoria_id uuid not null references public.categorias (id) on delete cascade,
  prioridade int not null default 0,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (user_id, palavra_chave)
);

create table public.cartoes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  nome text not null,
  dia_vencimento int not null check (dia_vencimento between 1 and 31),
  formato text not null default 'manual' check (formato in ('nubank', 'xp', 'manual')),
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (user_id, nome)
);

-- ------------------------------------------------------------ Movimento

create table public.faturas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  cartao_id uuid not null references public.cartoes (id) on delete restrict,
  vencimento date not null,
  competencia date not null check (extract(day from competencia) = 1),
  arquivo text not null default '',
  hash_arquivo text not null default '',
  total_centavos bigint not null default 0,
  importada_em timestamptz not null default now(),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (user_id, cartao_id, vencimento)
);

create table public.recorrencias (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  descricao text not null,
  categoria_id uuid references public.categorias (id) on delete set null,
  valor_padrao_centavos bigint not null check (valor_padrao_centavos >= 0),
  dia_do_mes int not null default 1 check (dia_do_mes between 1 and 31),
  inicio date not null,
  fim date,
  ativa boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

-- A tabela central (a aba "Base" da planilha).
create table public.lancamentos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  tipo text not null check (tipo in ('saida', 'entrada')),
  origem text not null check (origem in ('cartao', 'fixo', 'manual', 'entrada')),
  data date not null,
  competencia date not null check (extract(day from competencia) = 1),
  descricao text not null default '',
  estabelecimento text,
  valor_centavos bigint not null check (valor_centavos > 0),
  categoria_id uuid references public.categorias (id) on delete set null,
  fatura_id uuid references public.faturas (id) on delete cascade,
  cartao_id uuid references public.cartoes (id) on delete set null,
  parcela_atual int,
  parcela_total int,
  portador text,
  recorrencia_id uuid references public.recorrencias (id) on delete set null,
  revisar boolean not null default false,
  obs text not null default '',
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  check ((parcela_atual is null) = (parcela_total is null)),
  check (parcela_atual is null or (parcela_atual between 1 and parcela_total))
);

create index lancamentos_user_competencia_idx on public.lancamentos (user_id, competencia);
create index lancamentos_fatura_idx on public.lancamentos (fatura_id);
create index lancamentos_categoria_idx on public.lancamentos (categoria_id);
create index lancamentos_revisar_idx on public.lancamentos (user_id) where revisar;

-- ------------------------------------------------------------ Patrimônio

create table public.contas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  nome text not null,
  tipo text not null check (tipo in ('corrente', 'investimento', 'reserva', 'outro')),
  instituicao text not null default '',
  ativa boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (user_id, nome)
);

-- Foto do saldo de uma conta numa data (informada por você). Pode ser negativo (cheque especial).
create table public.saldos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  conta_id uuid not null references public.contas (id) on delete cascade,
  data date not null,
  valor_centavos bigint not null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (conta_id, data)
);

-- ------------------------------------------------------------ RLS, permissões e gatilhos (todas)

do $$
declare
  t text;
begin
  foreach t in array array['grupos', 'categorias', 'regras', 'cartoes', 'faturas', 'recorrencias', 'lancamentos', 'contas', 'saldos']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)', t || '_dono', t);
    execute format('grant select, insert, update, delete on table public.%I to authenticated', t);
    execute format('revoke all on table public.%I from anon', t);
    execute format('create trigger %I before update on public.%I for each row execute function public.tocar_atualizado_em()', t || '_atualizado_em', t);
  end loop;
end;
$$;
