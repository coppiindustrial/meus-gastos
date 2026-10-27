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

// ------------------------------------------------------------ a grade (edição como planilha)
// A grade grava CAMPO A CAMPO: só o que mudou vai para o banco. Escolher a categoria à mão tira o
// "Revisar" (alguém decidiu), a não ser que ele venha junto (o desfazer devolve o que era); os outros
// campos não mexem nele.
const doBanco = (l) => ({ ...l, competencia: l.competencia.slice(0, 7) });

export async function atualizarCampos(id, campos) {
  const dados = { ...campos };
  if ('categoria_id' in dados && !('revisar' in dados)) dados.revisar = false;
  if ('descricao' in dados) dados.descricao = String(dados.descricao ?? '').trim();
  if ('obs' in dados) dados.obs = String(dados.obs ?? '').trim();
  return doBanco(await exigir(supabase.from('lancamentos').update(dados).eq('id', id).select(COLUNAS).single()));
}

// Linhas novas da grade: avulso (ou entrada), sem cartão nem parcela, no mês que está na tela.
export async function criarLancamentos(lista) {
  const dados = lista.map((l) => ({
    tipo: l.tipo,
    origem: l.tipo === 'entrada' ? 'entrada' : 'manual',
    data: l.data,
    competencia: competenciaParaBanco(l.competencia),
    descricao: String(l.descricao ?? '').trim(),
    valor_centavos: l.valor_centavos,
    categoria_id: l.categoria_id || null,
    obs: String(l.obs ?? '').trim(),
  }));
  return (await exigir(supabase.from('lancamentos').insert(dados).select(COLUNAS))).map(doBanco);
}

// As linhas inteiras (para guardar no desfazer antes de excluir).
export async function buscarPorIds(ids) {
  return (await exigir(supabase.from('lancamentos').select('*').in('id', ids))).map(doBanco);
}

export function excluirLancamentos(ids) {
  return exigir(supabase.from('lancamentos').delete().in('id', ids));
}

// O DESFAZER de uma exclusão: as linhas voltam com o MESMO id (o resto da pilha do desfazer as acha),
// a mesma fatura, parcela e recorrência. Sai só o que veio de junção (categoria, cartão).
export async function restaurarLancamentos(registros) {
  const dados = registros.map(({ categoria, cartao, user_id, atualizado_em, ...l }) => ({
    ...l, competencia: competenciaParaBanco(l.competencia),
  }));
  return (await exigir(supabase.from('lancamentos').insert(dados).select(COLUNAS))).map(doBanco);
}
