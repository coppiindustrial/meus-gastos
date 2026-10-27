import { buscarTudo, exigir, supabase } from './supabase.js';

// Contas (corrente, investimento, reserva…) e as fotos de saldo delas (tabela `saldos`, única por conta + data).

export function listarContas() {
  return exigir(supabase.from('contas').select('*').order('ativa', { ascending: false }).order('tipo').order('nome'));
}

export function salvarConta({ id, nome, tipo, instituicao, ativa }) {
  const dados = { nome: nome.trim(), tipo, instituicao: instituicao?.trim() ?? '', ativa };
  return exigir(id
    ? supabase.from('contas').update(dados).eq('id', id).select().single()
    : supabase.from('contas').insert(dados).select().single());
}

// Apaga a conta e todo o histórico de saldos dela (FK em cascata).
export function excluirConta(id) {
  return exigir(supabase.from('contas').delete().eq('id', id));
}

export function listarSaldos() {
  return buscarTudo(() => supabase.from('saldos').select('id, conta_id, data, valor_centavos').order('data').order('id'));
}

// Registra os saldos de várias contas numa data. Mesma conta e mesma data: substitui o valor anterior.
// `itens`: [{ conta_id, valor_centavos }]
export function registrarSaldos(data, itens) {
  if (!itens.length) return Promise.resolve();
  return exigir(supabase.from('saldos')
    .upsert(itens.map((i) => ({ conta_id: i.conta_id, data, valor_centavos: i.valor_centavos })), { onConflict: 'conta_id,data' }));
}

export function excluirSaldo(id) {
  return exigir(supabase.from('saldos').delete().eq('id', id));
}
