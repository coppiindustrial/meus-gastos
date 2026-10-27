-- Meus Gastos — 003: as contas do Resumo do mês e da Evolução moram no banco (regra de ouro do Gestor).
-- Como aplicar: Supabase → SQL Editor → cole este arquivo inteiro → Run.
--
-- `security_invoker = on` em toda VIEW: sem ele a view roda com o dono dela e IGNORA o RLS.

-- Totais por mês (competência), tipo, origem e categoria. O front soma o que precisar (mês, grupo,
-- origem, evolução) a partir daqui, sem trazer os lançamentos um a um.
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
  sum(l.valor_centavos)::bigint as total_centavos
from public.lancamentos l
left join public.categorias c on c.id = l.categoria_id
group by l.user_id, l.competencia, l.tipo, l.origem, l.categoria_id, c.grupo_id;

-- PARCELAS FUTURAS: o que já está comprometido nos próximos meses. Para cada compra parcelada da
-- FATURA MAIS RECENTE de cada cartão ("3 de 10"), as parcelas que faltam (4..10), uma por mês depois
-- da competência daquela fatura. Nada é gravado: quando a próxima fatura chega, ela vira a mais
-- recente e a projeção se refaz sozinha.
create or replace view public.parcelas_futuras
with (security_invoker = on) as
with ultima as (
  select distinct on (f.cartao_id) f.id, f.cartao_id, f.competencia
  from public.faturas f
  order by f.cartao_id, f.vencimento desc
)
select
  l.user_id,
  l.id as lancamento_id,
  l.cartao_id,
  (u.competencia + make_interval(months => k))::date as competencia,
  l.descricao,
  l.valor_centavos,
  l.parcela_atual + k as parcela,
  l.parcela_total,
  l.categoria_id
from public.lancamentos l
join ultima u on u.id = l.fatura_id
cross join lateral generate_series(1, l.parcela_total - l.parcela_atual) as k
where l.parcela_total is not null and l.parcela_atual < l.parcela_total;

grant select on public.resumo_mensal, public.parcelas_futuras to authenticated;
revoke all on public.resumo_mensal, public.parcelas_futuras from anon;
