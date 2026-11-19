-- Meus Gastos — 034: a CATEGORIA FIXA PARCELADA (19/11/2026, a opção B do mockup "Parcelamento da categoria fixa").
-- Como aplicar: Supabase → SQL Editor → cole este arquivo inteiro → Run.
--
-- O seguro do carro se paga em N parcelas por ano, não todo mês; pelo histórico o app achava que ele vinha todo mês e
-- previa a parcela para sempre. Na tabela "Categorias fixas" dos Gastos fixos, clicar no nome da categoria diz como ela é
-- paga: em quantas vezes, o mês da 1ª parcela e se renova todo ano (no mesmo mês). Com isso o previsto fica só nos meses do
-- parcelamento e a média é a parcela. Vazio (o padrão) = "pelo histórico", como antes. Sem estas colunas, a opção fica
-- apagada.

alter table public.categorias add column if not exists fixo_parcelas smallint check (fixo_parcelas between 1 and 60);
alter table public.categorias add column if not exists fixo_inicio date;
alter table public.categorias add column if not exists fixo_renova boolean not null default false;
