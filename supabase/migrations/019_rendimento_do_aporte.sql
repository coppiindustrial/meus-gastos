-- Meus Gastos — 019: o RENDIMENTO DO BANCO em cada aporte de antes do app (07/11/2026, a opção B do mockup "Aportes com
-- os números do banco": o Valor Bruto e o Rendimento bruto da tela do depósito, digitados na linha do aporte).
-- Como aplicar: Supabase → SQL Editor → cole este arquivo inteiro → Run.
--
--   · `rendimento_centavos` em `depositos_investimento`: o "Rendimento bruto" que o banco mostrava na `referencia` (a
--     data), junto do `valor_centavos` (o "Valor Bruto" do mesmo dia). Com os dois, o que ainda está aplicado é o valor −
--     o rendimento, exato — o saque parcial e o IR retido nele já estão na conta do banco. Vazio, o rendimento do aporte
--     segue estimado pelo CDI desde a data dele, como antes.

alter table public.depositos_investimento add column if not exists rendimento_centavos bigint;
