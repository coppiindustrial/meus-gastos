-- Meus Gastos — 022: O QUE ACONTECE NO VENCIMENTO (08/11/2026, a pedido).
-- Como aplicar: Supabase → SQL Editor → cole este arquivo inteiro → Run.
--
-- O cadastro do investimento diz se, no vencimento, o dinheiro VOLTA PARA A CONTA (como até hoje: o aporte encerra) ou
-- se o banco REAPLICA SOZINHO. Com "reaplica", no dia do vencimento o app grava um APORTE NOVO: a data é o vencimento, o
-- valor é o do dia menos o IR (o banco desconta ao reaplicar, então o IR do novo recomeça em 22,5%) e o vencimento sai
-- do prazo do cadastro. O novo nasce com "conferir": a pessoa confere com o banco e salva.
--   · inv_cadastro.no_vencimento — 'conta' (o padrão) | 'reaplica'.
--   · inv_aportes.reaplicado_de — o aporte que venceu e virou este (o manual "Reaplicar" também grava). Único: um aporte
--     vencido vira no máximo um novo, mesmo com duas telas abertas ao mesmo tempo.
--   · inv_aportes.conferir — o app criou e a pessoa ainda não conferiu.
--   · inv_aportes.nao_reaplicar — este, mesmo num investimento que reaplica, voltou para a conta (o reaplicado dele foi
--     excluído, ou ele já tinha vencido quando o cadastro passou a reaplicar): o app não o reaplica.

alter table public.inv_cadastro
  add column no_vencimento text not null default 'conta' check (no_vencimento in ('conta', 'reaplica'));

alter table public.inv_aportes
  add column reaplicado_de uuid references public.inv_aportes (id) on delete set null,
  add column conferir boolean not null default false,
  add column nao_reaplicar boolean not null default false;

create unique index inv_aportes_reaplicado_de on public.inv_aportes (reaplicado_de) where reaplicado_de is not null;
