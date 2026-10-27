-- Meus Gastos — 004: um gasto fixo só pode ser lançado UMA vez por mês.
-- Como aplicar: Supabase → SQL Editor → cole este arquivo inteiro → Run.
--
-- Protege o botão "Lançar" (e o "Lançar todos") contra o clique duplo e contra duas abas abertas:
-- o segundo lançamento da mesma recorrência na mesma competência é recusado pelo banco.

create unique index lancamentos_recorrencia_mes_unico
  on public.lancamentos (recorrencia_id, competencia)
  where recorrencia_id is not null;
