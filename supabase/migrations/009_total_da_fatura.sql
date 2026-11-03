-- Meus Gastos — 009: o TOTAL DA FATURA acompanha os lançamentos dela (03/11/2026).
-- Como aplicar: Supabase → SQL Editor → cole este arquivo inteiro → Run.
--
-- `faturas.total_centavos` era gravado uma vez, na importação. Excluir uma compra da fatura (pela grade dos
-- Lançamentos, pelo "Tirar do app" das regras de ignorar), mudar o valor dela ou trocá-la de fatura deixava o total
-- antigo — e a tela Cartões mostrava a fatura com o que já tinha saído (um pagamento excluído contava em dobro).
-- Agora um gatilho refaz o total da fatura (a de antes e a de depois) a cada lançamento que entra, sai ou muda.
-- A fatura apagada com os lançamentos (a FK em cascata) não tem mais o que atualizar: o UPDATE não acha a linha.
-- No fim, refaz o total de todas (em 03/11/2026 só a do Nubank de 13/10/2026 estava diferente).

create or replace function public.refazer_total_da_fatura()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') and old.fatura_id is not null then
    update public.faturas f
    set total_centavos = coalesce((select sum(l.valor_centavos) from public.lancamentos l where l.fatura_id = old.fatura_id), 0)
    where f.id = old.fatura_id;
  end if;
  if tg_op in ('INSERT', 'UPDATE') and new.fatura_id is not null
     and (tg_op = 'INSERT' or new.fatura_id is distinct from old.fatura_id) then
    update public.faturas f
    set total_centavos = coalesce((select sum(l.valor_centavos) from public.lancamentos l where l.fatura_id = new.fatura_id), 0)
    where f.id = new.fatura_id;
  end if;
  return null;
end;
$$;

drop trigger if exists lancamentos_total_da_fatura on public.lancamentos;
create trigger lancamentos_total_da_fatura
after insert or delete or update of valor_centavos, fatura_id on public.lancamentos
for each row execute function public.refazer_total_da_fatura();

update public.faturas f
set total_centavos = coalesce((select sum(l.valor_centavos) from public.lancamentos l where l.fatura_id = f.id), 0);
