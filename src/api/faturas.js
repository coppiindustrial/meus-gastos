import { buscarTudo, exigir, inserirEmLotes, supabase } from './supabase.js';
import { criarClassificador } from '../lib/classificar.js';
import { competenciaDe, competenciaParaBanco } from '../lib/format.js';

// Faturas de cartão e a importação do CSV (fase 3). A fatura é única por cartão + vencimento: a mesma
// fatura de novo só entra substituindo a anterior (que leva junto os lançamentos dela).

export async function listarFaturas() {
  const linhas = await exigir(supabase.from('faturas')
    .select('*, cartao:cartoes(id, nome), lancamentos(count)')
    .order('vencimento', { ascending: false }));
  return linhas.map((f) => ({ ...f, qtd: f.lancamentos?.[0]?.count ?? 0, competencia: f.competencia.slice(0, 7) }));
}

// A fatura já importada para este cartão e vencimento (ou null).
export async function faturaExistente(cartaoId, vencimento) {
  const linhas = await exigir(supabase.from('faturas')
    .select('id, arquivo, importado_de, importada_em, total_centavos, lancamentos(count)')
    .eq('cartao_id', cartaoId).eq('vencimento', vencimento));
  const f = linhas[0];
  return f ? { ...f, qtd: f.lancamentos?.[0]?.count ?? 0 } : null;
}

// SHA-256 do texto do arquivo (guardado na fatura, para reconhecer o mesmo arquivo depois).
export async function hashDoTexto(texto) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto));
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Todas as regras, na ordem de prioridade (para classificar as linhas da fatura).
export function listarRegrasParaClassificar() {
  return buscarTudo(() => supabase.from('regras').select('palavra_chave, categoria_id, prioridade, ignorar').order('prioridade').order('id'));
}

// Classifica as linhas lidas do CSV: cada uma ganha `categoria_id` (ou null → vai para Revisar), ou
// `ignorar: true` quando a regra que pega é de ignorar (essas não são gravadas).
export function classificarLinhas(linhas, regras) {
  const classificar = criarClassificador(regras);
  return linhas.map((l) => {
    const r = classificar(l.estabelecimento);
    return { ...l, categoria_id: r?.ignorar ? null : r?.categoria_id ?? null, ignorar: Boolean(r?.ignorar) };
  });
}

// Grava a fatura e os lançamentos. `substituirId`: a fatura anterior do mesmo cartão e vencimento,
// apagada antes (com os lançamentos dela, pela FK em cascata).
export async function importarFatura({ cartaoId, vencimento, arquivo, hash, linhas, substituirId }, aoAvancar) {
  if (substituirId) await exigir(supabase.from('faturas').delete().eq('id', substituirId));
  const competencia = competenciaParaBanco(competenciaDe(vencimento));
  const fatura = await exigir(supabase.from('faturas').insert({
    cartao_id: cartaoId,
    vencimento,
    competencia,
    arquivo,
    hash_arquivo: hash,
    total_centavos: linhas.reduce((s, l) => s + l.valor_centavos, 0),
  }).select('id').single());
  await inserirEmLotes('lancamentos', linhas.map((l) => ({
    tipo: 'saida',
    origem: 'cartao',
    data: l.data,
    competencia,
    descricao: l.estabelecimento,
    estabelecimento: l.estabelecimento,
    valor_centavos: l.valor_centavos,
    categoria_id: l.categoria_id,
    fatura_id: fatura.id,
    cartao_id: cartaoId,
    parcela_atual: l.parcela_atual,
    parcela_total: l.parcela_total,
    portador: l.portador,
    revisar: !l.categoria_id,
  })), aoAvancar);
  return fatura.id;
}

// O TOTAL GUARDADO de cada fatura volta a ser a soma dos lançamentos que ficaram nela (03/11/2026): tirar do app uma
// compra ignorada deixava a fatura (e a tela Cartões) com o total antigo.
export async function recalcularTotais(faturaIds) {
  const ids = [...new Set(faturaIds.filter(Boolean))];
  for (let i = 0; i < ids.length; i += 100) {
    const parte = ids.slice(i, i + 100);
    const linhas = await buscarTudo(() => supabase.from('lancamentos').select('id, fatura_id, valor_centavos').in('fatura_id', parte).order('id'));
    for (const id of parte) {
      const total = linhas.filter((l) => l.fatura_id === id).reduce((s, l) => s + Number(l.valor_centavos), 0);
      await exigir(supabase.from('faturas').update({ total_centavos: total }).eq('id', id));
    }
  }
}

// Apaga a fatura e os lançamentos dela.
export function excluirFatura(id) {
  return exigir(supabase.from('faturas').delete().eq('id', id));
}
