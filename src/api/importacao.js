import { exigir, supabase } from './supabase.js';
import { competenciaParaBanco } from '../lib/format.js';

// Importação do histórico da planilha (fase 2). O JSON vem de `scripts/migrar-planilha.mjs` e traz
// NOMES (de categoria e de cartão); aqui eles viram ids. Tudo o que entra leva `importado_de`, para
// a conferência e para o "desfazer".
export const ORIGEM_PLANILHA = 'planilha';
const LOTE = 500;

const chave = (s) => String(s ?? '').trim().toLocaleLowerCase('pt-BR');

// O PostgREST devolve no máximo 1000 linhas por consulta: lê de 1000 em 1000.
async function buscarTudo(montar) {
  const tudo = [];
  for (let de = 0; ; de += 1000) {
    const pagina = await exigir(montar().range(de, de + 999));
    tudo.push(...pagina);
    if (pagina.length < 1000) return tudo;
  }
}

async function inserirEmLotes(tabela, linhas, aoAvancar) {
  for (let i = 0; i < linhas.length; i += LOTE) {
    await exigir(supabase.from(tabela).insert(linhas.slice(i, i + LOTE)));
    aoAvancar?.(Math.min(i + LOTE, linhas.length));
  }
}

// Confere o arquivo contra os cadastros: o que não tem categoria ou cartão correspondente.
export function prepararImportacao(dados, categorias, cartoes) {
  if (dados?.formato !== 'meus-gastos/planilha@1') throw new Error('Este arquivo não é o JSON gerado pelo scripts/migrar-planilha.mjs.');
  const catPorNome = new Map(categorias.map((c) => [chave(c.nome), c]));
  const cartaoPorNome = new Map(cartoes.map((c) => [chave(c.nome), c]));
  const nomesCategoria = new Set([
    ...dados.regras.map((r) => r.categoria),
    ...dados.faturas.flatMap((f) => f.lancamentos.map((l) => l.categoria)),
    ...dados.lancamentos.map((l) => l.categoria),
  ].filter(Boolean));
  return {
    catPorNome,
    cartaoPorNome,
    categoriasFaltando: [...nomesCategoria].filter((n) => !catPorNome.has(chave(n))).sort(),
    cartoesFaltando: [...new Set(dados.faturas.map((f) => f.cartao))].filter((n) => !cartaoPorNome.has(chave(n))),
    totalCartao: dados.faturas.reduce((s, f) => s + f.lancamentos.length, 0),
  };
}

// Grava tudo. `aoAvancar(texto)` recebe o andamento para a tela mostrar.
export async function importarPlanilha(dados, prep, aoAvancar) {
  const idCategoria = (nome) => (nome ? prep.catPorNome.get(chave(nome))?.id ?? null : null);

  aoAvancar('Regras de classificação…');
  const regras = dados.regras
    .filter((r) => idCategoria(r.categoria))
    .map((r) => ({ palavra_chave: r.palavra_chave, categoria_id: idCategoria(r.categoria), prioridade: r.prioridade, importado_de: ORIGEM_PLANILHA }));
  // Regra com a mesma palavra-chave já cadastrada no app fica como está.
  await exigir(supabase.from('regras').upsert(regras, { onConflict: 'user_id,palavra_chave', ignoreDuplicates: true }));

  aoAvancar('Faturas…');
  const faturas = await exigir(supabase.from('faturas').insert(dados.faturas.map((f) => ({
    cartao_id: prep.cartaoPorNome.get(chave(f.cartao)).id,
    vencimento: f.vencimento,
    competencia: competenciaParaBanco(f.competencia),
    arquivo: f.arquivo,
    hash_arquivo: `${ORIGEM_PLANILHA}:${f.arquivo}`,
    total_centavos: f.lancamentos.reduce((s, l) => s + l.valor_centavos, 0),
    importado_de: ORIGEM_PLANILHA,
  }))).select('id, arquivo, cartao_id, competencia'));
  const faturaPorArquivo = new Map(faturas.map((f) => [f.arquivo, f]));

  const doCartao = dados.faturas.flatMap((f) => {
    const fat = faturaPorArquivo.get(f.arquivo);
    return f.lancamentos.map((l) => ({
      tipo: 'saida',
      origem: 'cartao',
      data: l.data,
      competencia: fat.competencia,
      descricao: l.estabelecimento,
      estabelecimento: l.estabelecimento,
      valor_centavos: l.valor_centavos,
      categoria_id: idCategoria(l.categoria),
      fatura_id: fat.id,
      cartao_id: fat.cartao_id,
      parcela_atual: l.parcela_atual,
      parcela_total: l.parcela_total,
      portador: l.portador,
      revisar: !idCategoria(l.categoria),
      importado_de: ORIGEM_PLANILHA,
    }));
  });
  await inserirEmLotes('lancamentos', doCartao, (n) => aoAvancar(`Lançamentos de cartão… ${n} de ${doCartao.length}`));

  aoAvancar('Fixos, manuais e entradas…');
  await inserirEmLotes('lancamentos', dados.lancamentos.map((l) => ({
    tipo: l.tipo,
    origem: l.origem,
    data: l.data,
    competencia: competenciaParaBanco(l.competencia),
    descricao: l.descricao,
    valor_centavos: l.valor_centavos,
    categoria_id: idCategoria(l.categoria),
    revisar: false,
    importado_de: ORIGEM_PLANILHA,
  })));
}

// O que JÁ está no banco vindo da planilha, no mesmo formato da `conferencia` do JSON.
export async function conferirImportado() {
  const [linhas, regras] = await Promise.all([
    buscarTudo(() => supabase.from('lancamentos').select('origem, valor_centavos, fatura:faturas(arquivo)').eq('importado_de', ORIGEM_PLANILHA).order('id')),
    supabase.from('regras').select('id', { count: 'exact', head: true }).eq('importado_de', ORIGEM_PLANILHA),
  ]);
  const vazio = () => ({ linhas: 0, total: 0 });
  const c = { porFatura: {}, fixos: vazio(), manuais: vazio(), entradas: vazio(), regras: regras.count ?? 0 };
  linhas.forEach((l) => {
    const alvo = l.origem === 'cartao' ? (c.porFatura[l.fatura?.arquivo] ||= vazio())
      : l.origem === 'fixo' ? c.fixos : l.origem === 'manual' ? c.manuais : c.entradas;
    alvo.linhas += 1;
    alvo.total += Number(l.valor_centavos);
  });
  return { ...c, quantidade: linhas.length };
}

// Apaga só o que veio da planilha (as linhas das faturas vão junto com elas).
export async function desfazerImportacao() {
  await exigir(supabase.from('lancamentos').delete().eq('importado_de', ORIGEM_PLANILHA));
  await exigir(supabase.from('faturas').delete().eq('importado_de', ORIGEM_PLANILHA));
  await exigir(supabase.from('regras').delete().eq('importado_de', ORIGEM_PLANILHA));
}
