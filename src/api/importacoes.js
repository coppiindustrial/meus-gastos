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

// O EXTRATO ANTIGO (30/10/2026): o que foi importado antes do histórico (a migration 007 o preencheu SEM o
// `desfazer`) é achado pela marca do extrato e pelo minuto em que foi gravado — a 007 juntou cada importação
// assim. Devolve os ids. Os fixos que ele corrigiu (lançados à mão antes) não entram: ficam com o valor do extrato.
export async function idsDoExtratoAntigo(imp) {
  const fim = new Date(Math.floor(Date.parse(imp.criado_em) / 60000) * 60000 + 60000).toISOString();
  const linhas = await buscarTudo(() => supabase.from('lancamentos').select('id').eq('importado_de', 'extrato')
    .gte('criado_em', imp.criado_em).lt('criado_em', fim).order('id'));
  return linhas.map((l) => l.id);
}

// O QUE UMA IMPORTAÇÃO TROUXE (06/11/2026, o "Ver" do Histórico): a fatura, os lançamentos dela; o extrato, os que ele
// CRIOU (o `desfazer.apagar`, ou os do minuto em que o antigo foi gravado) e os fixos que ele CORRIGIU (`desfazer.restaurar`).
// Devolve { criados, corrigidos }, pela data.
const COLUNAS_VER = 'id, data, competencia, tipo, origem, descricao, estabelecimento, valor_centavos, categoria_id, recorrencia_id, parcela_atual, parcela_total, categoria:categorias(nome)';
async function porIds(ids) {
  const out = [];
  for (let i = 0; i < ids.length; i += 100) out.push(...await exigir(supabase.from('lancamentos').select(COLUNAS_VER).in('id', ids.slice(i, i + 100))));
  return out.sort((a, b) => (a.data < b.data ? -1 : a.data > b.data ? 1 : 0));
}
export async function lancamentosDaImportacao(imp) {
  if (imp.tipo === 'fatura') {
    if (!imp.fatura_id) return { criados: [], corrigidos: [] };
    const criados = await buscarTudo(() => supabase.from('lancamentos').select(COLUNAS_VER).eq('fatura_id', imp.fatura_id).order('data').order('id'));
    return { criados, corrigidos: [] };
  }
  const ids = imp.desfazer?.apagar ?? await idsDoExtratoAntigo(imp);
  const corrigidos = (imp.desfazer?.restaurar ?? []).map((r) => r.id);
  return { criados: await porIds(ids), corrigidos: await porIds(corrigidos) };
}

// DESFAZER / EXCLUIR. A fatura: apaga a fatura (os lançamentos dela vão junto, pela FK) e a linha do histórico. O
// extrato (QUALQUER um, não só o último — 30/10/2026): apaga o que ele criou, devolve aos fixos corrigidos o valor e
// a data de antes, e apaga a linha; o antigo, sem o `desfazer`, apaga o que `idsDoExtratoAntigo` achar.
export async function desfazerImportacao(imp) {
  if (imp.tipo === 'fatura' && imp.fatura_id) {
    await exigir(supabase.from('faturas').delete().eq('id', imp.fatura_id));
  } else if (imp.tipo === 'extrato') {
    const { apagar = await idsDoExtratoAntigo(imp), restaurar = [], movimentos = [] } = imp.desfazer ?? {};
    // os aportes e resgates que o extrato gravou no Patrimônio (migration 013) saem junto
    for (let i = 0; i < movimentos.length; i += 100) {
      await exigir(supabase.from('movimentos_investimento').delete().in('id', movimentos.slice(i, i + 100)));
    }
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
