-- Meus Gastos — 002: marca de onde veio cada registro importado.
-- Como aplicar: Supabase → SQL Editor → cole este arquivo inteiro → Run.
--
-- `importado_de` = 'planilha' nos registros trazidos da planilha antiga (fase 2). É o que permite
-- conferir os totais e DESFAZER a importação (apagar só o que veio dela) sem tocar no que foi
-- lançado à mão. Nulo = criado no app.

alter table public.lancamentos add column importado_de text;
alter table public.faturas add column importado_de text;
alter table public.regras add column importado_de text;

create index lancamentos_importado_de_idx on public.lancamentos (user_id, importado_de) where importado_de is not null;
