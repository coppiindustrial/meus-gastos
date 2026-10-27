import { exigir, supabase } from './supabase.js';
import { competenciaParaBanco } from '../lib/format.js';

// Lançamentos (a tabela central). Valores em centavos, competência como 'AAAA-MM' no front.

const COLUNAS = '*, categoria:categorias(id, nome, grupo:grupos(id, nome, cor, tipo)), cartao:cartoes(id, nome)';

// Os lançamentos que contam numa competência ('AAAA-MM').
export async function listarDoMes(comp) {
  const linhas = await exigir(supabase.from('lancamentos').select(COLUNAS)
    .eq('competencia', competenciaParaBanco(comp))
    .order('data', { ascending: false }));
  return linhas.map((l) => ({ ...l, competencia: l.competencia.slice(0, 7) }));
}

// Grava um lançamento. Entrada sempre tem origem 'entrada' e não tem cartão nem parcela.
export function salvarLancamento(l) {
  const entrada = l.tipo === 'entrada';
  const cartao = !entrada && l.origem === 'cartao';
  const dados = {
    tipo: l.tipo,
    origem: entrada ? 'entrada' : l.origem,
    data: l.data,
    competencia: competenciaParaBanco(l.competencia),
    descricao: l.descricao.trim(),
    estabelecimento: l.estabelecimento?.trim() || null,
    valor_centavos: l.valor_centavos,
    categoria_id: l.categoria_id || null,
    cartao_id: cartao ? l.cartao_id || null : null,
    parcela_atual: cartao && l.parcela_total ? l.parcela_atual : null,
    parcela_total: cartao && l.parcela_total ? l.parcela_total : null,
    obs: l.obs?.trim() || '',
    // Lançado ou editado à mão: alguém decidiu a categoria, não há o que revisar.
    revisar: false,
  };
  return exigir(l.id
    ? supabase.from('lancamentos').update(dados).eq('id', l.id).select().single()
    : supabase.from('lancamentos').insert(dados).select().single());
}

export function excluirLancamento(id) {
  return exigir(supabase.from('lancamentos').delete().eq('id', id));
}
