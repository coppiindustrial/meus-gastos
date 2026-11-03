-- Meus Gastos — 010: a `resumo_mensal` também separa por CARTÃO (03/11/2026).
-- Como aplicar: Supabase → SQL Editor → cole este arquivo inteiro → Run.
--
-- O "Gastos por origem" da Visão geral mostra, dentro de "Cartão (faturas)", a fatia de cada cartão (XP, Nubank…),
-- com os mesmos filtros da tela (ano, meses, categoria). A coluna nova vai NO FIM (o `create or replace view` só aceita
-- assim) e entra no agrupamento: as linhas de cartão passam a vir uma por cartão. Quem lê a view só SOMA as linhas
-- (Visão geral, Categorias, Lançamentos), então os totais não mudam. Antes desta migration o front pede a view sem a
-- coluna e o "Gastos por origem" fica sem a divisão.

create or replace view public.resumo_mensal
with (security_invoker = on) as
select
  l.user_id,
  l.competencia,
  l.tipo,
  l.origem,
  l.categoria_id,
  c.grupo_id,
  count(*)::int as qtd,
  sum(l.valor_centavos)::bigint as total_centavos,
  l.cartao_id
from public.lancamentos l
left join public.categorias c on c.id = l.categoria_id
group by l.user_id, l.competencia, l.tipo, l.origem, l.categoria_id, c.grupo_id, l.cartao_id;

grant select on public.resumo_mensal to authenticated;
revoke all on public.resumo_mensal from anon;
