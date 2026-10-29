-- Meus Gastos — 008: a ORDEM dos gastos fixos (o arrastar do cadastro, 29/10/2026).
-- Como aplicar: Supabase → SQL Editor → cole este arquivo inteiro → Run.
--
-- O cadastro dos fixos ganhou a alça de arrastar (a mesma das listas do Gestor): a ordem escolhida vale para a
-- grade dos Gastos fixos, o menu "Lançar" e o aviso da Visão geral. Os fixos que já existem começam na ordem de
-- hoje (ativos primeiro, depois pelo dia e pelo nome). Fixo novo sem ordem vai para o fim.

alter table public.recorrencias add column ordem int;

update public.recorrencias r
set ordem = o.n
from (
  select id, row_number() over (partition by user_id order by ativa desc, dia_do_mes, descricao) - 1 as n
  from public.recorrencias
) o
where o.id = r.id;
