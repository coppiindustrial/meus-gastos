-- Meus Gastos — 032: o RESGATE PELO INVESTIMENTO (16/11/2026, a opção A do mockup "Resgatar pelo investimento").
-- Como aplicar: Supabase → SQL Editor → cole este arquivo inteiro → Run.
--
-- O "Resgatar" da linha do investimento reparte o valor entre os aportes (do mais antigo para o mais novo) e grava UM
-- RESGATE EM CADA APORTE alcançado, como sempre. O `lote` liga esses pedaços: o aporte mostra "parte do resgate de R$ X
-- (N aportes)" e excluir pergunta se apaga o pedido inteiro. Sem esta coluna, o resgate funciona igual, e cada pedaço se
-- exclui sozinho.

alter table public.inv_resgates add column if not exists lote uuid;
create index if not exists inv_resgates_lote on public.inv_resgates (lote) where lote is not null;
