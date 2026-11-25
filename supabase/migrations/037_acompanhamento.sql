-- Meus Gastos — 037: a LISTA DO ACOMPANHAMENTO DAS AÇÕES (25/11/2026, o mockup "Acompanhamento das ações").
-- Como aplicar: Supabase → SQL Editor → cole este arquivo inteiro → Run.
--
-- A tela Acompanhamento (Análises) mostra os ativos da carteira (`rv_ativos`) e os que a pessoa só ACOMPANHA. Esta tabela
-- guarda as duas coisas, por ticker e mercado:
--   · a ação de FORA da carteira que a pessoa quer acompanhar (o nome e o tipo vêm da busca do cadastro, o Yahoo);
--   · o ativo da CARTEIRA que ela escondeu da tela (`aparece = false`). Sem linha, o da carteira aparece.
-- Nada aqui é dinheiro da pessoa: os preços vêm na hora da função `cotacoes` (a ação "ao_vivo") e não são gravados.
-- Sem esta migration, a tela mostra a carteira inteira e o "O que acompanhar" pede para aplicá-la.

create table if not exists public.rv_acompanhamento (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  ticker text not null check (length(trim(ticker)) > 0),
  mercado text not null check (mercado in ('B3', 'EUA')),
  nome text not null default '',
  tipo text not null default 'acao_br' check (tipo in ('acao_br', 'fii', 'bdr', 'etf_br', 'acao_eua', 'etf_eua')),
  aparece boolean not null default true,
  ordem integer not null default 0,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (user_id, mercado, ticker)
);

do $$
declare t text;
begin
  foreach t in array array['rv_acompanhamento']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)', t || '_dono', t);
    execute format('grant select, insert, update, delete on table public.%I to authenticated', t);
    execute format('revoke all on table public.%I from anon', t);
    execute format('create trigger %I before update on public.%I for each row execute function public.tocar_atualizado_em()', t || '_atualizado_em', t);
  end loop;
end $$;
