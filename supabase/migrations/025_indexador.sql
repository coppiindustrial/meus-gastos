-- Meus Gastos — 025: O ÍNDICE DO INVESTIMENTO (08/11/2026, a pedido: LCI e LCA prefixadas e IPCA+).
-- Como aplicar: Supabase → SQL Editor → cole este arquivo inteiro → Run.
--
-- Até aqui todo investimento rendia "% do CDI" (a taxa era esse %). O cadastro ganha o índice:
--   · inv_cadastro.indexador — 'cdi' (o padrão: a taxa é o % do CDI) | 'pre' (prefixado: a taxa é o % ao ano) |
--     'ipca' (IPCA + a taxa ao ano). A conta é a mesma, dia útil a dia útil: o prefixado sobe (1 + taxa)^(1/252) por dia;
--     o IPCA+ sobe isso vezes o IPCA do mês repartido pelos dias úteis dele (o mês sem IPCA publicado vai com o último).

alter table public.inv_cadastro
  add column indexador text not null default 'cdi' check (indexador in ('cdi', 'pre', 'ipca'));
