-- Meus Gastos — 018: o VENCIMENTO DE CADA APORTE (06/11/2026, a pedido: "coloco a data e ponto final" — cada
-- instituição conta o prazo de um jeito, e a regra do investimento nem sempre bate).
-- Como aplicar: Supabase → SQL Editor → cole este arquivo inteiro → Run.
--
--   · `vencimento` no aporte feito pelo app (`movimentos_investimento`) e no de antes do app (`depositos_investimento`):
--     a data em que AQUELE aporte vence, digitada como o banco mostra. Vazia, vale a regra do investimento (o prazo de
--     cada aplicação, ou o vencimento dele).

alter table public.movimentos_investimento add column if not exists vencimento date;
alter table public.depositos_investimento add column if not exists vencimento date;
