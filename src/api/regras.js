import { buscarTudo, exigir, supabase } from './supabase.js';
import { regraPega } from '../lib/classificar.js';

// Regras de classificação e as pendências (lançamentos de cartão sem categoria).

export function listarRegras() {
  return buscarTudo(() => supabase.from('regras')
    .select('*, categoria:categorias(id, nome, grupo:grupos(nome, cor))')
    .order('prioridade').order('id'));
}

// Regra nova vai para o FIM da lista (como uma linha nova na aba Regras da planilha): só decide
// quando nenhuma das anteriores pega.
async function proximaPrioridade() {
  const [ultima] = await exigir(supabase.from('regras').select('prioridade').order('prioridade', { ascending: false }).limit(1));
  return (ultima?.prioridade ?? 0) + 1;
}

// `ignorar`: a regra diz "isto não é gasto" (sem categoria) — usada no extrato da conta (migration 005).
export async function salvarRegra({ id, palavra_chave, categoria_id, prioridade, ignorar = false }) {
  const dados = { palavra_chave: palavra_chave.trim(), categoria_id: ignorar ? null : categoria_id, ignorar };
  if (id) {
    if (prioridade !== undefined && prioridade !== '') dados.prioridade = Number(prioridade);
    return exigir(supabase.from('regras').update(dados).eq('id', id).select().single());
  }
  dados.prioridade = await proximaPrioridade();
  return exigir(supabase.from('regras').insert(dados).select().single());
}

export function excluirRegra(id) {
  return exigir(supabase.from('regras').delete().eq('id', id));
}

// ------------------------------------------------------------ Pendências

export function listarPendencias() {
  return buscarTudo(() => supabase.from('lancamentos')
    .select('id, data, competencia, descricao, estabelecimento, valor_centavos, parcela_atual, parcela_total, cartao:cartoes(nome)')
    .eq('revisar', true)
    .order('data', { ascending: false }).order('id'));
}

// Dá a categoria a estes lançamentos e os tira de Revisar. Em lotes de 100: os ids vão na URL.
export async function classificarLancamentos(ids, categoriaId) {
  for (let i = 0; i < ids.length; i += 100) {
    await exigir(supabase.from('lancamentos').update({ categoria_id: categoriaId, revisar: false }).in('id', ids.slice(i, i + 100)));
  }
}

// Cria a regra e aplica nas pendências que ela pega (todas, não só as do estabelecimento escolhido).
// Devolve quantas pendências foram classificadas.
export async function criarRegraEAplicar(palavra, categoriaId, pendencias) {
  await salvarRegra({ palavra_chave: palavra, categoria_id: categoriaId });
  const ids = pendencias.filter((p) => regraPega(palavra, p.estabelecimento || p.descricao)).map((p) => p.id);
  await classificarLancamentos(ids, categoriaId);
  return ids.length;
}
