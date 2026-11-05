import { buscarTudo, exigir, supabase } from './supabase.js';

// Contas (corrente, investimento, reserva…) e as fotos de saldo delas (tabela `saldos`, única por conta + data).

export function listarContas() {
  return exigir(supabase.from('contas').select('*').order('ativa', { ascending: false }).order('tipo').order('nome'));
}

// `recebe_extrato` (migration 013): UMA conta recebe os aportes e resgates do extrato do Nubank — marcar esta
// desmarca as outras. Sem a migration, o campo não vai (a conta salva como antes).
export async function salvarConta({ id, nome, tipo, instituicao, ativa, recebe_extrato }) {
  const dados = { nome: nome.trim(), tipo, instituicao: instituicao?.trim() ?? '', ativa };
  if (recebe_extrato !== undefined) dados.recebe_extrato = !!recebe_extrato;
  if (dados.recebe_extrato) {
    const q = supabase.from('contas').update({ recebe_extrato: false }).eq('recebe_extrato', true);
    await exigir(id ? q.neq('id', id) : q);
  }
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

// ------------------------------------------------------------ os APORTES e RESGATES (migration 013)
const semTabela = (err) => /movimentos_investimento|recebe_extrato|schema cache|does not exist/i.test(err?.message ?? '');

// Todos os movimentos; null sem a migration 013 (a tela diz que ela falta e segue só com as fotos). Com a 014, cada um
// traz o investimento em que entrou; sem ela, a leitura cai para a antiga.
const COLS_MOV = 'id, conta_id, data, tipo, valor_centavos, descricao, origem, id_externo';
export async function listarMovimentos() {
  const ler = (cols) => buscarTudo(() => supabase.from('movimentos_investimento').select(cols).order('data').order('id'));
  try {
    return await ler(`${COLS_MOV}, investimento_id`);
  } catch (err) {
    if (/investimento_id/i.test(err?.message ?? '')) {
      try { return await ler(COLS_MOV); } catch (e2) { if (semTabela(e2)) return null; throw e2; }
    }
    if (semTabela(err)) return null;
    throw err;
  }
}

// Os digitados no "Registrar o mês": [{ conta_id, data, tipo, valor_centavos, descricao? }].
export function salvarMovimentos(itens) {
  if (!itens.length) return Promise.resolve([]);
  return exigir(supabase.from('movimentos_investimento').insert(itens.map((m) => ({ ...m, origem: 'manual' }))).select('id'));
}

export function excluirMovimento(id) {
  return exigir(supabase.from('movimentos_investimento').delete().eq('id', id));
}

// A conta que recebe os movimentos do extrato (null: nenhuma marcada, ou sem a migration).
export async function contaDoExtrato() {
  try {
    const l = await exigir(supabase.from('contas').select('id, nome').eq('recebe_extrato', true).limit(1));
    return l[0] ?? null;
  } catch (err) {
    if (semTabela(err)) return null;
    throw err;
  }
}

// Quais destes identificadores do banco já viraram movimento (em lotes de 100: vão na URL).
export async function movimentosJaGravados(ids) {
  const achados = new Set();
  for (let i = 0; i < ids.length; i += 100) {
    const l = await exigir(supabase.from('movimentos_investimento').select('id_externo').in('id_externo', ids.slice(i, i + 100)));
    l.forEach((x) => achados.add(x.id_externo));
  }
  return achados;
}

// Grava os movimentos de um extrato (`movimentosDoExtrato`); o mesmo identificador não entra duas vezes. Devolve os ids
// criados (o "Desfazer" do histórico das importações os apaga).
export async function gravarMovimentosDoExtrato(movs) {
  if (!movs.length) return [];
  const l = await exigir(supabase.from('movimentos_investimento')
    .upsert(movs, { onConflict: 'user_id,id_externo', ignoreDuplicates: true }).select('id'));
  return l.map((x) => x.id);
}

export function excluirMovimentos(ids) {
  return ids.length ? exigir(supabase.from('movimentos_investimento').delete().in('id', ids)) : Promise.resolve();
}
