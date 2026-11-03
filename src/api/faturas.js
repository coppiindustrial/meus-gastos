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

// A fatura já importada para este cartão e vencimento (ou null). `creditos`: os estornos/créditos que ela já tem
// (valor negativo, migration 012) — para o "Acrescentar só os créditos que faltam".
export async function faturaExistente(cartaoId, vencimento) {
  const linhas = await exigir(supabase.from('faturas')
    .select('id, arquivo, importado_de, importada_em, total_centavos, lancamentos(count)')
    .eq('cartao_id', cartaoId).eq('vencimento', vencimento));
  const f = linhas[0];
  if (!f) return null;
  const creditos = await exigir(supabase.from('lancamentos').select('data, estabelecimento, valor_centavos').eq('fatura_id', f.id).lt('valor_centavos', 0));
  return { ...f, qtd: f.lancamentos?.[0]?.count ?? 0, creditos };
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
  await inserirEmLotes('lancamentos', linhas.map((l) => doCartao(l, { competencia, faturaId: fatura.id, cartaoId })), aoAvancar);
  return fatura.id;
}

// A linha lida (compra, ou o CRÉDITO com valor negativo — migration 012) como lançamento da fatura.
const doCartao = (l, { competencia, faturaId, cartaoId }) => ({
  tipo: 'saida',
  origem: 'cartao',
  data: l.data,
  competencia,
  descricao: l.estabelecimento,
  estabelecimento: l.estabelecimento,
  valor_centavos: l.valor_centavos,
  categoria_id: l.categoria_id,
  fatura_id: faturaId,
  cartao_id: cartaoId,
  parcela_atual: l.parcela_atual,
  parcela_total: l.parcela_total,
  portador: l.portador,
  revisar: !l.categoria_id,
});

// ACRESCENTAR SÓ OS CRÉDITOS QUE FALTAM (03/11/2026): a fatura importada antes da 012 ficou sem os estornos; grava só
// eles nela, sem substituir nada (as categorias que você mudou ficam). O total se refaz pelo gatilho da 009.
// Sem a migration 012, o banco recusa o valor negativo: o erro diz o que falta.
export async function acrescentarCreditos({ faturaId, cartaoId, vencimento, linhas }) {
  const competencia = competenciaParaBanco(competenciaDe(vencimento));
  try {
    await inserirEmLotes('lancamentos', linhas.map((l) => doCartao(l, { competencia, faturaId, cartaoId })));
  } catch (err) {
    throw /valor|check/i.test(err.message) ? new Error('Falta aplicar a migration 012 no Supabase (SQL Editor) para gravar os créditos.') : err;
  }
}

// O TOTAL GUARDADO de cada fatura volta a ser a soma dos lançamentos que ficaram nela (03/11/2026): tirar do app uma
// compra ignorada deixava a fatura (e a tela Cartões) com o total antigo. Com a migration 009 o gatilho do banco já
// faz isto a cada lançamento que sai ou muda (também pela grade); daqui fica a garantia de antes dela.
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
