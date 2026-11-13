-- Meus Gastos — 029: a PERMISSÃO da função `cotacoes` (13/11/2026, a renda variável).
-- Como aplicar: Supabase → SQL Editor → cole este arquivo inteiro → Run.
--
-- A função lê os ativos e grava as cotações com a chave de serviço (`service_role`), que passa por cima do RLS mas precisa
-- do GRANT na tabela — a 027 só deu permissão ao `authenticated`, e a função respondia "permission denied for table
-- rv_ativos". Aqui, só o que ela usa: ler os ativos e gravar (inserir e atualizar) a última cotação e os fechamentos.

grant select on table public.rv_ativos to service_role;
grant select, insert, update on table public.rv_cotacoes to service_role;
grant select, insert, update on table public.rv_fechamentos to service_role;
