import { exigir, supabase } from './supabase.js';
import { CARTOES_SUGERIDOS, GRUPOS_SUGERIDOS } from '../lib/sugestoes.js';

// Grupos, categorias e cartões. O `user_id` não vai em nenhum insert: o banco preenche com quem está
// logado (`default auth.uid()`), e o RLS recusa qualquer outro.

// ------------------------------------------------------------ Grupos e categorias

export function listarGrupos() {
  return exigir(supabase.from('grupos').select('*').order('tipo', { ascending: false }).order('ordem').order('nome'));
}

// Categorias com o grupo junto (nome, tipo e cor), na ordem do grupo e depois da categoria.
export async function listarCategorias() {
  const linhas = await exigir(supabase.from('categorias').select('*, grupo:grupos(id, nome, tipo, cor, ordem)'));
  return linhas.sort((a, b) =>
    (a.grupo.tipo === b.grupo.tipo ? 0 : a.grupo.tipo === 'saida' ? -1 : 1)
    || a.grupo.ordem - b.grupo.ordem
    || a.ordem - b.ordem
    || a.nome.localeCompare(b.nome, 'pt-BR'));
}

export function salvarGrupo({ id, nome, tipo, cor, ordem }) {
  const dados = { nome: nome.trim(), tipo, cor, ordem: ordem ?? 0 };
  return exigir(id
    ? supabase.from('grupos').update(dados).eq('id', id).select().single()
    : supabase.from('grupos').insert(dados).select().single());
}

export function excluirGrupo(id) {
  return exigir(supabase.from('grupos').delete().eq('id', id));
}

export function salvarCategoria({ id, nome, grupo_id, ativa, ordem }) {
  const dados = { nome: nome.trim(), grupo_id, ativa: ativa ?? true, ordem: ordem ?? 0 };
  return exigir(id
    ? supabase.from('categorias').update(dados).eq('id', id).select().single()
    : supabase.from('categorias').insert(dados).select().single());
}

export function excluirCategoria(id) {
  return exigir(supabase.from('categorias').delete().eq('id', id));
}

// Quantos lançamentos usam a categoria (para avisar antes de excluir).
export async function contarUsoCategoria(id) {
  const { count, error } = await supabase.from('lancamentos').select('id', { count: 'exact', head: true }).eq('categoria_id', id);
  if (error) throw error;
  return count ?? 0;
}

// Cria a estrutura sugerida (lib/sugestoes.js). Só é oferecida com a tela vazia.
export async function criarCategoriasSugeridas() {
  const grupos = await exigir(supabase.from('grupos')
    .insert(GRUPOS_SUGERIDOS.map((g, i) => ({ nome: g.nome, tipo: g.tipo, cor: g.cor, ordem: i })))
    .select());
  const idDe = Object.fromEntries(grupos.map((g) => [g.nome, g.id]));
  const categorias = GRUPOS_SUGERIDOS.flatMap((g) => g.categorias.map((nome, i) => ({ nome, grupo_id: idDe[g.nome], ordem: i })));
  await exigir(supabase.from('categorias').insert(categorias));
}

// ------------------------------------------------------------ Cartões

export function listarCartoes() {
  return exigir(supabase.from('cartoes').select('*').order('ativo', { ascending: false }).order('nome'));
}

export function salvarCartao({ id, nome, dia_vencimento, formato, ativo }) {
  const dados = { nome: nome.trim(), dia_vencimento: Number(dia_vencimento), formato, ativo };
  return exigir(id
    ? supabase.from('cartoes').update(dados).eq('id', id).select().single()
    : supabase.from('cartoes').insert(dados).select().single());
}

export function excluirCartao(id) {
  return exigir(supabase.from('cartoes').delete().eq('id', id));
}

export async function contarUsoCartao(id) {
  const { count, error } = await supabase.from('lancamentos').select('id', { count: 'exact', head: true }).eq('cartao_id', id);
  if (error) throw error;
  return count ?? 0;
}

export function criarCartoesSugeridos() {
  return exigir(supabase.from('cartoes').insert(CARTOES_SUGERIDOS));
}
