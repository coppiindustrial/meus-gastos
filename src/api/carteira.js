import { buscarTudo, exigir, supabase } from './supabase.js';

// A CARTEIRA DO ZERO (07/11/2026, migration 020): o cadastro dos investimentos (`inv_cadastro`), os aportes
// (`inv_aportes`) e os resgates de cada aporte (`inv_resgates`). As contas ficam em `lib/carteira.js`.
// Sem a migration, `listarCarteira` devolve null e a tela pede para aplicá-la.

const semTabela = (err) => /inv_cadastro|inv_aportes|inv_resgates|schema cache|does not exist/i.test(err?.message ?? '');

// OS TIPOS DA PESSOA (24/11/2026, migration 036, `inv_tipos`): cada investimento chega com o tipo próprio dele em
// `tipo_proprio` ({ id, nome, paga_ir, paga_iof } ou null), que decide o nome e os impostos (`pagaIR`/`pagaIOF` em
// lib/carteira.js). Sem a 036, `tipos` é null e todo investimento segue pelo tipo pronto.
export async function listarTipos() {
  try {
    return await exigir(supabase.from('inv_tipos').select('*').order('ordem').order('nome'));
  } catch (err) {
    if (/inv_tipos|schema cache|does not exist/i.test(err?.message ?? '')) return null;
    throw err;
  }
}

export async function listarCarteira() {
  try {
    const [cadastro, aportes, resgates, tipos] = await Promise.all([
      exigir(supabase.from('inv_cadastro').select('*').order('ordem').order('nome')),
      buscarTudo(() => supabase.from('inv_aportes').select('*').order('data').order('id')),
      buscarTudo(() => supabase.from('inv_resgates').select('*').order('data').order('id')),
      listarTipos(),
    ]);
    const porId = new Map((tipos ?? []).map((t) => [t.id, t]));
    return { cadastro: cadastro.map((i) => ({ ...i, tipo_proprio: (i.tipo_id && porId.get(i.tipo_id)) || null })), aportes, resgates, tipos };
  } catch (err) {
    if (semTabela(err)) return null;
    throw err;
  }
}

export const criarTipo = (dados) => exigir(supabase.from('inv_tipos').insert(dados).select().single());
export const atualizarTipo = (id, mudancas) => exigir(supabase.from('inv_tipos').update(mudancas).eq('id', id).select().single());
export const excluirTipo = (id) => exigir(supabase.from('inv_tipos').delete().eq('id', id));

// ------------------------------------------------------------ o cadastro
export const criarInvestimento = (dados) => exigir(supabase.from('inv_cadastro').insert(dados).select().single());
export const atualizarInvestimento = (id, mudancas) => exigir(supabase.from('inv_cadastro').update(mudancas).eq('id', id).select().single());
export const excluirInvestimento = (id) => exigir(supabase.from('inv_cadastro').delete().eq('id', id));

// ------------------------------------------------------------ os aportes
export const criarAporte = (dados) => exigir(supabase.from('inv_aportes').insert(dados).select().single());
export const atualizarAporte = (id, mudancas) => exigir(supabase.from('inv_aportes').update(mudancas).eq('id', id).select().single());
// excluir o aporte leva os resgates dele (a FK em cascata)
export const excluirAporte = (id) => exigir(supabase.from('inv_aportes').delete().eq('id', id));
// o aporte que venceu e voltou para a conta, mesmo num investimento que reaplica (migration 022)
export const marcarNaoReaplicar = (ids) => (ids.length ? exigir(supabase.from('inv_aportes').update({ nao_reaplicar: true }).in('id', ids)) : null);
// o vencimento que você já viu (o "Visto" do histórico do Patrimônio; migration 026)
export const marcarVencimentoVisto = (ids) => (ids.length ? exigir(supabase.from('inv_aportes').update({ vencimento_visto: true }).in('id', ids)) : null);
// A REAPLICAÇÃO AUTOMÁTICA: grava o aporte novo; o índice único de `reaplicado_de` recusa o repetido (duas telas abertas
// ao mesmo tempo) — devolve false nesse caso, em vez de erro.
export async function gravarReaplicacao(dados) {
  const { error } = await supabase.from('inv_aportes').insert(dados);
  if (!error) return true;
  if (error.code === '23505') return false;
  throw new Error(error.message);
}

// ------------------------------------------------------------ os resgates
export const criarResgate = (dados) => exigir(supabase.from('inv_resgates').insert(dados).select().single());
export const atualizarResgate = (id, mudancas) => exigir(supabase.from('inv_resgates').update(mudancas).eq('id', id).select().single());
export const excluirResgate = (id) => exigir(supabase.from('inv_resgates').delete().eq('id', id));
// O RESGATE PELO INVESTIMENTO: um resgate em cada aporte, gravados juntos (uma requisição só: entra tudo ou nada) e ligados
// pelo `lote` (migration 032). Sem a coluna, grava sem ela. Devolve { semLote } quando gravou sem o lote.
export async function criarResgates(linhas) {
  const { error } = await supabase.from('inv_resgates').insert(linhas);
  if (!error) return { semLote: false };
  if (!/lote|column|schema cache/i.test(error.message ?? '')) throw new Error(error.message);
  await exigir(supabase.from('inv_resgates').insert(linhas.map(({ lote: _l, ...r }) => r)));
  return { semLote: true };
}
// o pedido inteiro (todos os pedaços do mesmo lote)
export const excluirLote = (lote) => exigir(supabase.from('inv_resgates').delete().eq('lote', lote));
