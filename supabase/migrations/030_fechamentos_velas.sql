-- Meus Gastos — 030: as VELAS dos fechamentos (13/11/2026, o gráfico do ativo da renda variável).
-- Como aplicar: Supabase → SQL Editor → cole este arquivo inteiro → Run.
--
-- O gráfico do ativo (o painel que abre pelo ticker na Renda variável) desenha a linha OU as velas. Para as velas, cada dia
-- precisa da abertura, da máxima e da mínima, além do fechamento (`preco`) que a 027 já guardava; o volume vai junto. A
-- função `cotacoes` preenche: o histórico inteiro de uma vez (o Yahoo Finance, a ação "historico") e o dia de hoje a cada
-- leitura do agendamento (a brapi e a Finnhub já mandam a abertura, a máxima e a mínima do dia). Sem estas colunas, o
-- gráfico mostra só a linha.

alter table public.rv_fechamentos
  add column if not exists abertura numeric(18, 6),
  add column if not exists maxima numeric(18, 6),
  add column if not exists minima numeric(18, 6),
  add column if not exists volume bigint;
