import { buscarTudo, exigir, supabase } from './supabase.js';

// O histórico da planilha (fase 2, JÁ IMPORTADO). O que entrou dela leva `importado_de = 'planilha'`: é o que o
// pop-up do histórico (`ModalPlanilha`) lê e o que o "desfazer" apaga. A importação em si (o `planilha.json`
// de `scripts/migrar-planilha.mjs` gravado pela tela "Importar histórico") saiu em 29/10/2026 com a tela: ela
// foi feita uma vez só. Se precisar de novo, está no histórico do git (`importarPlanilha`, `prepararImportacao`).
export const ORIGEM_PLANILHA = 'planilha';

// O que a planilha trouxe, para o pop-up do histórico dela (as contas em `resumirPlanilha`): os lançamentos com a
// marca, as faturas dela (com o cartão) e quantas regras.
export async function lerDaPlanilha() {
  const [linhas, faturas, regras] = await Promise.all([
    buscarTudo(() => supabase.from('lancamentos').select('origem, tipo, valor_centavos, competencia, fatura:faturas(arquivo)').eq('importado_de', ORIGEM_PLANILHA).order('id')),
    exigir(supabase.from('faturas').select('id, cartao:cartoes(nome)').eq('importado_de', ORIGEM_PLANILHA)),
    supabase.from('regras').select('id', { count: 'exact', head: true }).eq('importado_de', ORIGEM_PLANILHA),
  ]);
  return { linhas, faturas, regras: regras.count ?? 0 };
}

// Apaga só o que veio da planilha (as linhas das faturas vão junto com elas).
export async function desfazerImportacao() {
  // a linha do histórico de importações (migration 007; sem a tabela, o erro é ignorado)
  await supabase.from('importacoes').delete().eq('tipo', 'planilha');
  await exigir(supabase.from('lancamentos').delete().eq('importado_de', ORIGEM_PLANILHA));
  await exigir(supabase.from('faturas').delete().eq('importado_de', ORIGEM_PLANILHA));
  await exigir(supabase.from('regras').delete().eq('importado_de', ORIGEM_PLANILHA));
}
