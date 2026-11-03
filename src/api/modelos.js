import { buscarTudo, exigir, supabase } from './supabase.js';
import { MODELOS_PRONTOS } from '../lib/modeloCsv.js';

// Os MODELOS DE IMPORTAÇÃO do usuário (migration 011; fase 1 do importador configurável): o formato de um CSV de banco
// ensinado uma vez. Os prontos (Nubank, XP) moram no código, em `MODELOS_PRONTOS`. Antes da migration a tabela não
// existe e `listarModelos` devolve null (a tela segue só com os prontos).

const semTabela = (err) => /modelos_importacao/.test(err?.message ?? '');

export async function listarModelos() {
  try {
    return await buscarTudo(() => supabase.from('modelos_importacao').select('id, nome, tipo, cabecalho, config').order('nome').order('id'));
  } catch (err) {
    if (semTabela(err)) return null;
    throw err;
  }
}

// Os prontos e os do usuário juntos (os do usuário primeiro: um formato ensinado vale mais que o palpite pronto).
export async function todosOsModelos() {
  const meus = await listarModelos();
  return [...(meus ?? []), ...MODELOS_PRONTOS];
}

export function salvarModelo({ id, nome, tipo = 'fatura', cabecalho, config }) {
  const dados = { nome: nome.trim(), tipo, cabecalho: cabecalho || null, config };
  return exigir(id
    ? supabase.from('modelos_importacao').update(dados).eq('id', id).select().single()
    : supabase.from('modelos_importacao').insert(dados).select().single());
}

export function excluirModelo(id) {
  return exigir(supabase.from('modelos_importacao').delete().eq('id', id));
}
