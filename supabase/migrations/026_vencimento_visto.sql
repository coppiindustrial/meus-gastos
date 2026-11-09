-- Meus Gastos — 026: O VENCIMENTO VISTO (09/11/2026, a tela nova do Patrimônio).
-- Como aplicar: Supabase → SQL Editor → cole este arquivo inteiro → Run.
--
-- O bloco "Vencimentos" do Patrimônio tem o HISTÓRICO do que venceu (o valor do dia, o IR, o líquido e para onde foi). O
-- que venceu nos últimos 30 dias fica "PARA AVALIAR" — na linha "Agora" e no bloco — até você marcar que viu (decidiu o
-- que fazer com o dinheiro que voltou, conferiu o reaplicado):
--   · inv_aportes.vencimento_visto — true depois do "Visto" (no aporte que venceu). Sem a coluna, nada fica para avaliar.

alter table public.inv_aportes
  add column vencimento_visto boolean not null default false;
