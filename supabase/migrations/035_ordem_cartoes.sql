-- Meus Gastos — 035: a ORDEM dos cartões (o arrastar do cadastro, 23/11/2026, o mockup "Cadastros com movimento").
-- Como aplicar: Supabase → SQL Editor → cole este arquivo inteiro → Run.
--
-- O cadastro dos cartões ganhou a alça ⠿ de arrastar (a mesma do cadastro dos investimentos e do das categorias): a ordem
-- escolhida vale na tela Cartões, nas colunas do Importar e nas listas de cartão. Os cartões que já existem começam na
-- ordem de hoje (ativos primeiro, depois pelo nome). Cartão novo sem ordem vai para o fim. Sem a coluna, a alça fica
-- apagada e a ordem segue a de antes.

alter table public.cartoes add column if not exists ordem int;

update public.cartoes c
set ordem = o.n
from (
  select id, row_number() over (partition by user_id order by ativo desc, nome) as n
  from public.cartoes
) o
where o.id = c.id and c.ordem is null;
