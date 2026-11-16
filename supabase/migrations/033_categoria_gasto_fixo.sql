-- Meus Gastos — 033: a CATEGORIA QUE É GASTO FIXO (16/11/2026, o mockup "Fixos por categoria", as recomendadas).
-- Como aplicar: Supabase → SQL Editor → cole este arquivo inteiro → Run.
--
-- Marcar uma categoria (ou o grupo inteiro) como gasto fixo — o Streaming, o IPTU, o Seguro do carro, o IPVA — faz tudo o
-- que cai nela, venha do cartão, de boleto ou de onde for, contar como fixo: a tabela "Categorias fixas" embaixo dos fixos
-- lançados à mão, o "Já comprometido" e o "Custo fixo" da Visão geral. O PREVISTO de cada mês sai do histórico (o app
-- calcula); nada é gravado além desta marca. Sem esta coluna, as telas seguem como antes e a chave fica apagada.

alter table public.categorias add column if not exists gasto_fixo boolean not null default false;
