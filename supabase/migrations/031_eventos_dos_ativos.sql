-- Meus Gastos — 031: os EVENTOS dos ativos da renda variável (13/11/2026, o mockup "Desempenho, volume, dividendos e
-- resultados", a opção B).
-- Como aplicar: Supabase → SQL Editor → cole este arquivo inteiro → Run.
--
-- O que a EMPRESA fez (não as suas operações, que moram em `rv_operacoes`), para o gráfico do ativo marcar:
--   · 'dividendo'     — a data-ex e o valor por ação (`valor`), do Yahoo, com todo o histórico;
--   · 'desdobramento' — a data e o fator (`valor`: 2 = cada cota virou duas; < 1 é grupamento), do Yahoo;
--   · 'resultado'     — a data da divulgação (`hora`: 'bmo' antes da abertura, 'amc' depois do fechamento), o lucro por ação
--                       divulgado (`valor`, null até sair) e o esperado (`estimado`), a receita (`receita`, `receita_estimada`)
--                       e o trimestre (`ano`, `trimestre`), da Finnhub — o plano grátis só dá os PRÓXIMOS; o que passa fica
--                       guardado aqui e o divulgado chega pelas "surpresas" (o mesmo ano e trimestre);
--   · 'estreia'       — o primeiro fechamento do ativo na bolsa (`valor`), para o "Desde o início" da faixa de desempenho.
-- Quem grava é a função `cotacoes` (a chave de serviço); o app só lê.

create table public.rv_eventos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  ativo_id uuid not null references public.rv_ativos (id) on delete cascade,
  tipo text not null check (tipo in ('dividendo', 'desdobramento', 'resultado', 'estreia')),
  data date not null,
  valor numeric(20, 8),
  estimado numeric(20, 8),
  receita numeric(22, 2),
  receita_estimada numeric(22, 2),
  hora text not null default '',
  ano integer,
  trimestre integer,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (ativo_id, tipo, data)
);
create index rv_eventos_ativo on public.rv_eventos (ativo_id, data);

alter table public.rv_eventos enable row level security;
create policy rv_eventos_dono on public.rv_eventos for select to authenticated using ((select auth.uid()) = user_id);
grant select on table public.rv_eventos to authenticated;
revoke all on table public.rv_eventos from anon;
grant select, insert, update, delete on table public.rv_eventos to service_role;
create trigger rv_eventos_atualizado_em before update on public.rv_eventos for each row execute function public.tocar_atualizado_em();
