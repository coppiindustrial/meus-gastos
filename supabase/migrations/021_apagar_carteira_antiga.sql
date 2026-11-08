-- Meus Gastos — 021: APAGA AS TABELAS DA CARTEIRA ANTIGA (08/11/2026, com o OK do usuário, depois de conferida a
-- carteira do zero da migration 020).
-- Como aplicar: Supabase → SQL Editor → cole este arquivo inteiro → Run.
--
-- O app não lê nem grava nelas desde a 020: contas e saldos (a 001; a 013 acrescentou o `recebe_extrato`),
-- movimentos_investimento (013), investimentos e valores_investimento (014), depositos_investimento (016) — a 020 dizia
-- "006 a 019", mas foram estas. Nenhuma view nem outra tabela depende delas. Os índices, as políticas e os gatilhos de
-- cada uma vão junto; a função do `atualizado_em` é de todas as tabelas e FICA.
-- Uma cópia do que havia nelas (39 linhas) ficou em dados/backup-carteira-antiga-2026-11-08.json, fora do git.
--
-- SEM `cascade`, de propósito: se algo inesperado ainda depender de uma delas, o Run para com erro em vez de levar
-- junto o que não devia. Da folha para a raiz (quem aponta para quem sai primeiro).

drop table if exists public.depositos_investimento;
drop table if exists public.valores_investimento;
drop table if exists public.movimentos_investimento;
drop table if exists public.investimentos;
drop table if exists public.saldos;
drop table if exists public.contas;
