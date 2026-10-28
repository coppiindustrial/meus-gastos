import { buscarTudo, supabase } from './supabase.js';

// Leituras da Visão geral: as views da migration 003 (as contas são do banco).
const mes = (linhas) => linhas.map((l) => ({ ...l, competencia: l.competencia.slice(0, 7) }));

export async function listarResumoMensal() {
  return mes(await buscarTudo(() => supabase.from('resumo_mensal')
    .select('competencia, tipo, origem, categoria_id, grupo_id, qtd, total_centavos')
    .order('competencia').order('tipo').order('origem').order('categoria_id')));
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
