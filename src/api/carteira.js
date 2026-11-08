import { buscarTudo, exigir, supabase } from './supabase.js';

// A CARTEIRA DO ZERO (07/11/2026, migration 020): o cadastro dos investimentos (`inv_cadastro`), os aportes
// (`inv_aportes`) e os resgates de cada aporte (`inv_resgates`). As contas ficam em `lib/carteira.js`.
// Sem a migration, `listarCarteira` devolve null e a tela pede para aplicá-la.

const semTabela = (err) => /inv_cadastro|inv_aportes|inv_resgates|schema cache|does not exist/i.test(err?.message ?? '');

export async function listarCarteira() {
  try {
    const [cadastro, aportes, resgates] = await Promise.all([
      exigir(supabase.from('inv_cadastro').select('*').order('ordem').order('nome')),
      buscarTudo(() => supabase.from('inv_aportes').select('*').order('data').order('id')),
      buscarTudo(() => supabase.from('inv_resgates').select('*').order('data').order('id')),
    ]);
    return { cadastro, aportes, resgates };
  } catch (err) {
    if (semTabela(err)) return null;
    throw err;
  }
}

// ------------------------------------------------------------ o cadastro
export const criarInvestimento = (dados) => exigir(supabase.from('inv_cadastro').insert(dados).select().single());
export const atualizarInvestimento = (id, mudancas) => exigir(supabase.from('inv_cadastro').update(mudancas).eq('id', id).select().single());
export const excluirInvestimento = (id) => exigir(supabase.from('inv_cadastro').delete().eq('id', id));

// ------------------------------------------------------------ os aportes
export const criarAporte = (dados) => exigir(supabase.from('inv_aportes').insert(dados).select().single());
export const atualizarAporte = (id, mudancas) => exigir(supabase.from('inv_aportes').update(mudancas).eq('id', id).select().single());
// excluir o aporte leva os resgates dele (a FK em cascata)
export const excluirAporte = (id) => exigir(supabase.from('inv_aportes').delete().eq('id', id));

// ------------------------------------------------------------ os resgates
export const criarResgate = (dados) => exigir(supabase.from('inv_resgates').insert(dados).select().single());
export const excluirResgate = (id) => exigir(supabase.from('inv_resgates').delete().eq('id', id));
