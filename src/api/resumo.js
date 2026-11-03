import { buscarTudo, supabase } from './supabase.js';

// Leituras da Visão geral: as views da migration 003 (as contas são do banco).
const mes = (linhas) => linhas.map((l) => ({ ...l, competencia: l.competencia.slice(0, 7) }));

// Com a migration 010 as linhas vêm também por CARTÃO (`cartao_id`, para a fatia de cada um no "Gastos por origem");
// sem ela, a coluna não existe e a leitura cai para a de antes (sem a divisão).
const COLUNAS_RESUMO = 'competencia, tipo, origem, categoria_id, grupo_id, qtd, total_centavos';
export async function listarResumoMensal() {
  const ler = (cols) => buscarTudo(() => supabase.from('resumo_mensal').select(cols)
    .order('competencia').order('tipo').order('origem').order('categoria_id'));
  try {
    return mes(await ler(`${COLUNAS_RESUMO}, cartao_id`));
  } catch (err) {
    if (!/cartao_id/.test(err.message ?? '')) throw err;
    return mes(await ler(COLUNAS_RESUMO));
  }
}

export async function listarParcelasFuturas() {
  return mes(await buscarTudo(() => supabase.from('parcelas_futuras')
    .select('lancamento_id, competencia, descricao, valor_centavos, parcela, parcela_total, cartao_id')
    .order('competencia').order('lancamento_id')));
}

export async function contarPendencias() {
  const { count, error } = await supabase.from('lancamentos').select('id', { count: 'exact', head: true }).eq('revisar', true);
  if (error) throw error;
  return count ?? 0;
}
