-- Meus Gastos — 011: os MODELOS DE IMPORTAÇÃO (03/11/2026, fase 1 do importador configurável).
-- Como aplicar: Supabase → SQL Editor → cole este arquivo inteiro → Run.
--
-- Até aqui cada banco era código (o CSV do Nubank e o da XP escritos em `lib/lerFatura.js`) e o cartão só aceitava
-- 'nubank', 'xp' ou 'manual': um cartão novo dependia de programar. Um MODELO é o formato de um CSV ensinado uma vez
-- (no assistente da fase 2): o separador, a linha do cabeçalho, o que é cada coluna, o formato da data e do valor,
-- onde vem a parcela, como achar o vencimento. `cabecalho` é a assinatura que reconhece o arquivo sozinho (a linha
-- do cabeçalho em minúsculas, sem acento e sem espaço). Nubank e XP continuam no código, como modelos PRONTOS.
--
-- O cartão ganha o formato 'modelo' e o `modelo_id` (excluir o modelo deixa o cartão sem ele: volta a "manual" na tela).

create table public.modelos_importacao (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  nome text not null,
  tipo text not null default 'fatura' check (tipo in ('fatura', 'extrato')),
  cabecalho text,
  config jsonb not null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (user_id, nome)
);

alter table public.cartoes drop constraint if exists cartoes_formato_check;
alter table public.cartoes add constraint cartoes_formato_check check (formato in ('nubank', 'xp', 'manual', 'modelo'));
alter table public.cartoes add column modelo_id uuid references public.modelos_importacao (id) on delete set null;

do $$
declare t text;
begin
  foreach t in array array['modelos_importacao']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)', t || '_dono', t);
    execute format('grant select, insert, update, delete on table public.%I to authenticated', t);
    execute format('revoke all on table public.%I from anon', t);
    execute format('create trigger %I before update on public.%I for each row execute function public.tocar_atualizado_em()', t || '_atualizado_em', t);
  end loop;
end $$;
