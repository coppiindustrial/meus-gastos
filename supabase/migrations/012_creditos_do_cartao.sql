-- Meus Gastos — 012: os CRÉDITOS E ESTORNOS do cartão entram na fatura (03/11/2026).
-- Como aplicar: Supabase → SQL Editor → cole este arquivo inteiro → Run.
--
-- Até aqui todo valor negativo da fatura (pagamento, estorno, crédito) ficava de fora, como na planilha — e o total
-- da fatura ficava com as compras BRUTAS: a XP de outubro dava R$ 15.036,36 em vez dos R$ 14.073,56 do banco (três
-- estornos de fora). O pagamento continua de fora; o ESTORNO / CRÉDITO vira um lançamento de cartão com valor
-- NEGATIVO: o total da fatura (gatilho da 009), a `resumo_mensal` e as categorias já somam e passam a abater sozinhos.
--
-- O dinheiro continua positivo em todo o resto: o negativo só vale no gasto (`saida`) de origem `cartao`.

do $$
declare c text;
begin
  -- o check antigo (`valor_centavos > 0`) nasceu sem nome na 001: acha pelo texto e tira
  for c in
    select conname from pg_constraint
    where conrelid = 'public.lancamentos'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%valor_centavos > 0%'
  loop
    execute format('alter table public.lancamentos drop constraint %I', c);
  end loop;
end $$;

alter table public.lancamentos add constraint lancamentos_valor_check
  check (valor_centavos > 0 or (valor_centavos < 0 and tipo = 'saida' and origem = 'cartao'));
