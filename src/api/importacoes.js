import { buscarTudo, exigir, supabase } from './supabase.js';
import { listarCartoes } from './cadastros.js';
import { competenciaParaBanco } from '../lib/format.js';

// O HISTÓRICO DE IMPORTAÇÕES (migration 007) e o que a tela Importar lê. Antes da migration, a tabela não
// existe: a leitura devolve null (a tela avisa) e o registro de uma importação nova é ignorado em silêncio
// — a importação em si nunca falha por causa dele.

const semTabela = (err) => /importacoes/.test(err?.message ?? '');
const mes = (d) => (d ? String(d).slice(0, 7) : null);

export async function listarImportacoes() {
  try {
    const linhas = await buscarTudo(() => supabase.from('importacoes')
      .select('*, cartao:cartoes(nome), fatura:faturas(id, vencimento)').order('criado_em', { ascending: false }).order('id'));
    return linhas.map((i) => ({ ...i, competencia: mes(i.competencia) }));
  } catch (err) {
    if (semTabela(err)) return null;
    throw err;
  }
}

// Grava uma importação no histórico. `dados`: { tipo, cartao_id?, fatura_id?, competencia? ('AAAA-MM'),
// periodo_de?, periodo_ate?, arquivo?, linhas?, total_centavos?, resumo?, desfazer? }.
export async function registrarImportacao(dados) {
  try {
    await exigir(supabase.from('importacoes').insert({
      ...dados,
      competencia: dados.competencia ? competenciaParaBanco(dados.competencia) : null,
    }));
    avisarMudanca();
    return true;
  } catch {
    return false;
  }
}

// Tudo o que a aba "Por mês" precisa: os cartões, as faturas (com a contagem de compras) e as importações
// do extrato (os períodos). `extratos` null = sem a tabela do histórico.
export async function carregarSituacao() {
  const [cartoes, faturas, importacoes] = await Promise.all([
    listarCartoes(),
    buscarTudo(() => supabase.from('faturas')
      .select('id, cartao_id, competencia, vencimento, importada_em, importado_de, total_centavos, lancamentos(count)').order('vencimento').order('id')),
    listarImportacoes(),
  ]);
  return {
    cartoes,
    faturas: faturas.map((f) => ({ ...f, competencia: mes(f.competencia), qtd: f.lancamentos?.[0]?.count ?? 0 })),
    importacoes,
    extratos: importacoes ? importacoes.filter((i) => i.tipo === 'extrato') : null,
  };
}

// DESFAZER. A fatura: apaga a fatura (os lançamentos dela vão junto, pela FK) e a linha do histórico. O
// extrato: apaga o que ele criou, devolve aos fixos corrigidos o valor e a data de antes, e apaga a linha.
export async function desfazerImportacao(imp) {
  if (imp.tipo === 'fatura' && imp.fatura_id) {
    await exigir(supabase.from('faturas').delete().eq('id', imp.fatura_id));
  } else if (imp.tipo === 'extrato' && imp.desfazer) {
    const { apagar = [], restaurar = [] } = imp.desfazer;
    for (let i = 0; i < apagar.length; i += 100) {
      await exigir(supabase.from('lancamentos').delete().in('id', apagar.slice(i, i + 100)));
    }
    for (const r of restaurar) {
      const { id, ...antes } = r;
      await exigir(supabase.from('lancamentos').update(antes).eq('id', id));
    }
  } else {
    throw new Error('Esta importação não pode ser desfeita daqui.');
  }
  await exigir(supabase.from('importacoes').delete().eq('id', imp.id));
  avisarMudanca();
}

// O número do menu ("Importar 2") se refaz quando uma importação entra ou sai.
export const EVENTO_IMPORTACOES = 'meusgastos:importacoes';
export function avisarMudanca() {
  window.dispatchEvent(new Event(EVENTO_IMPORTACOES));
}
