-- Meus Gastos — 007: o HISTÓRICO DE IMPORTAÇÕES (a tela Importar, 28/10/2026).
-- Como aplicar: Supabase → SQL Editor → cole este arquivo inteiro → Run.
--
-- Cada importação (uma fatura, um extrato, o histórico da planilha) vira uma linha aqui: quando, o quê, o
-- arquivo, o período e o resultado. A aba "Histórico" lê daqui, e a coluna do EXTRATO na aba "Por mês" sai
-- dos períodos (`periodo_de`/`periodo_ate`) — o extrato não tinha registro nenhum de quando entrou.
-- `desfazer` guarda o que a importação do extrato criou e o que ela corrigiu (para o "Desfazer").
-- O fim do arquivo preenche o que já tinha sido importado antes desta tabela existir.

create table public.importacoes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  tipo text not null check (tipo in ('fatura', 'extrato', 'planilha')),
  cartao_id uuid references public.cartoes (id) on delete set null,
  fatura_id uuid references public.faturas (id) on delete set null,
  competencia date,
  periodo_de date,
  periodo_ate date,
  arquivo text not null default '',
  linhas int not null default 0,
  total_centavos bigint not null default 0,
  resumo text not null default '',
  desfazer jsonb,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create index importacoes_user_criado on public.importacoes (user_id, criado_em desc);

do $$
declare t text;
begin
  foreach t in array array['importacoes']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)', t || '_dono', t);
    execute format('grant select, insert, update, delete on table public.%I to authenticated', t);
    execute format('revoke all on table public.%I from anon', t);
    execute format('create trigger %I before update on public.%I for each row execute function public.tocar_atualizado_em()', t || '_atualizado_em', t);
  end loop;
end $$;

-- ------------------------------------------------------------ o que já tinha sido importado

-- As faturas importadas pelo app (as da planilha entram juntas, na linha da planilha abaixo).
insert into public.importacoes (user_id, tipo, cartao_id, fatura_id, competencia, arquivo, linhas, total_centavos, resumo, criado_em)
select f.user_id, 'fatura', f.cartao_id, f.id, f.competencia, f.arquivo,
       (select count(*) from public.lancamentos l where l.fatura_id = f.id),
       f.total_centavos,
       (select count(*) from public.lancamentos l where l.fatura_id = f.id) || ' compras',
       f.importada_em
from public.faturas f
where f.importado_de is distinct from 'planilha';

-- O extrato: uma importação por minuto em que as movimentações foram gravadas.
insert into public.importacoes (user_id, tipo, periodo_de, periodo_ate, linhas, total_centavos, resumo, criado_em)
select l.user_id, 'extrato', min(l.data), max(l.data), count(*), sum(l.valor_centavos),
       count(*) || ' movimentações gravadas', min(l.criado_em)
from public.lancamentos l
where l.importado_de = 'extrato'
group by l.user_id, date_trunc('minute', l.criado_em);

-- O histórico da planilha (fase 2): uma linha só.
insert into public.importacoes (user_id, tipo, periodo_de, periodo_ate, arquivo, linhas, total_centavos, resumo, criado_em)
select l.user_id, 'planilha', min(l.competencia), max(l.competencia), 'Gastos total.xlsx', count(*), sum(l.valor_centavos),
       count(*) || ' lançamentos · ' || (select count(*) from public.faturas f where f.user_id = l.user_id and f.importado_de = 'planilha') || ' faturas',
       min(l.criado_em)
from public.lancamentos l
where l.importado_de = 'planilha'
group by l.user_id;
