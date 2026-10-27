-- Meus Gastos — 005: importação do extrato da conta corrente.
-- Como aplicar: Supabase → SQL Editor → cole este arquivo inteiro → Run.

-- REGRA DE IGNORAR: além de "palavra-chave → categoria", a regra pode dizer "isto não é gasto" (as
-- transferências entre as suas contas, por exemplo). Regra de ignorar não tem categoria.
alter table public.regras alter column categoria_id drop not null;
alter table public.regras add column ignorar boolean not null default false;
alter table public.regras add constraint regras_categoria_ou_ignorar check (ignorar or categoria_id is not null);

-- O código que o banco dá a cada movimentação do extrato ("Identificador" no CSV do Nubank): é ele que
-- impede importar a mesma movimentação duas vezes (dois extratos que se sobrepõem, o mesmo arquivo de novo).
alter table public.lancamentos add column id_externo text;
create unique index lancamentos_id_externo_unico on public.lancamentos (user_id, id_externo) where id_externo is not null;
