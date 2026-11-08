-- Meus Gastos — 023: O VENCIMENTO NO FIM DE SEMANA (08/11/2026, a pedido).
-- Como aplicar: Supabase → SQL Editor → cole este arquivo inteiro → Run.
--
-- O vencimento que o cadastro SUGERE (a data do aporte + o prazo, um dia antes se o cadastro diz) passava SEMPRE para a
-- segunda quando caía no sábado ou no domingo — o jeito da XP (05/06 + 12 meses vence em 07/06). O Nubank, não: ele vence
-- no fim de semana mesmo (as datas que o banco mostra, conferidas em 08/11/2026). Agora é do cadastro:
--   · inv_cadastro.vence_dia_util — true: o fim de semana vai para a segunda (a XP); false (o padrão): vence no dia (o
--     Nubank). Só muda a SUGESTÃO; o vencimento gravado em cada aporte é o que estiver no campo.

alter table public.inv_cadastro
  add column vence_dia_util boolean not null default false;
