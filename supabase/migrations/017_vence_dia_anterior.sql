-- Meus Gastos — 017: o PRAZO POR APLICAÇÃO que VENCE NO DIA ANTERIOR (06/11/2026).
-- Como aplicar: Supabase → SQL Editor → cole este arquivo inteiro → Run.
--
--   · `vence_dia_anterior`: no "prazo por aplicação", cada aplicação vence um dia ANTES de completar o prazo — o RDB do
--     Nubank aplicado em 03/06 com 6 meses vence em 02/12, e o de 11/10 em 10/04. Sem marcar, vence no mesmo dia do mês
--     (o CDB de 2 anos aplicado em 12/03 vence em 12/03).

alter table public.investimentos add column if not exists vence_dia_anterior boolean not null default false;
