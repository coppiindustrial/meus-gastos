-- Meus Gastos — 015: o PRAZO DE CADA APLICAÇÃO e o SALDO EM CONTA (o Patrimônio "do zero", 06/11/2026).
-- Como aplicar: Supabase → SQL Editor → cole este arquivo inteiro → Run.
--
--   · liquidez 'por_aplicacao': cada aplicação vence `prazo_meses` depois da data dela (o CDB de 2 anos em que cada
--     aporte tem o seu prazo). `ao_vencer`: 'reaplica' (renova sozinha por mais um prazo, sem voltar para a conta)
--     ou 'volta' (o dinheiro volta para a conta e o pedaço sai do investimento).
--   · tipo 'saldo': o dinheiro parado na conta corrente, como um investimento de liquidez diária (a conta corrente
--     deixa de ser um caso à parte).

alter table public.investimentos drop constraint if exists investimentos_liquidez_check;
alter table public.investimentos add constraint investimentos_liquidez_check
  check (liquidez in ('diaria', 'vencimento', 'dias', 'carencia', 'por_aplicacao'));

alter table public.investimentos drop constraint if exists investimentos_tipo_check;
alter table public.investimentos add constraint investimentos_tipo_check
  check (tipo in ('cdb', 'lci', 'lca', 'rdb', 'tesouro_selic', 'tesouro_ipca', 'tesouro_prefixado', 'debenture', 'cri_cra',
    'fundo', 'poupanca', 'saldo', 'outro'));

alter table public.investimentos add column if not exists prazo_meses integer check (prazo_meses > 0);
alter table public.investimentos add column if not exists ao_vencer text not null default 'reaplica'
  check (ao_vencer in ('reaplica', 'volta'));
