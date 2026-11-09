-- Meus Gastos — 024: O APORTE QUE RENDE DESDE O DIA ÚTIL ANTERIOR (08/11/2026, a pedido).
-- Como aplicar: Supabase → SQL Editor → cole este arquivo inteiro → Run.
--
-- O aporte rende desde o próprio dia (o de fim de semana ou feriado, desde o dia útil seguinte). Alguns bancos contam um
-- dia a mais: o RDB Planejado do Nubank rende desde o dia útil ANTES da "Data da aplicação" (conferido em 08/11/2026 em
-- dois depósitos). O aporte ganha a opção:
--   · inv_aportes.rende_dia_antes — true: o rendimento começa no dia útil anterior à data do aporte (o IR continua pela
--     idade desde a data do aporte). No "já estava aplicado", vale para a conta do quanto já rendeu.

alter table public.inv_aportes
  add column rende_dia_antes boolean not null default false;
