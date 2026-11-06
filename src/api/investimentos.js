import { buscarTudo, exigir, supabase } from './supabase.js';

// OS INVESTIMENTOS de cada conta (migration 014): o cadastro do título (`investimentos`), o valor dele em cada data
// (`valores_investimento`, um por título e data) e o aporte e o resgate em que ele entrou (`movimentos_investimento`
// com `investimento_id`). Sem a migration, `listarInvestimentos` devolve null e a tela segue só com as contas.

const semTabela = (err) => /investimentos|valores_investimento|investimento_id|schema cache|does not exist/i.test(err?.message ?? '');

// Os DEPÓSITOS de antes do cadastro (migration 016): [] sem a tabela (o IR fica pelo bloco do cadastro).
async function listarDepositos() {
  try {
    return await buscarTudo(() => supabase.from('depositos_investimento').select('id, investimento_id, data, valor_centavos, referencia').order('data').order('id'));
  } catch (err) {
    if (/depositos_investimento|schema cache|does not exist/i.test(err?.message ?? '')) return null;
    throw err;
  }
}

export async function listarInvestimentos() {
  try {
    const [invs, valores, depositos] = await Promise.all([
      exigir(supabase.from('investimentos').select('*').order('ordem').order('nome')),
      buscarTudo(() => supabase.from('valores_investimento').select('id, investimento_id, data, valor_centavos, criado_em, atualizado_em').order('data').order('id')),
      listarDepositos(),
    ]);
    return { investimentos: invs, valores, depositos: depositos ?? [], comDepositos: depositos !== null };
  } catch (err) {
    if (semTabela(err)) return null;
    throw err;
  }
}

// Substitui os depósitos de antes do cadastro de um título pela lista colada. `itens`: [{ data, valor_centavos }];
// `referencia`: a data dos valores (o dia em que o banco os mostrou).
export async function salvarDepositos(investimentoId, referencia, itens) {
  await exigir(supabase.from('depositos_investimento').delete().eq('investimento_id', investimentoId));
  if (itens.length) {
    // cada item pode ter a sua referência (o digitado como "o que foi depositado" leva a própria data — `planoDosDepositos`)
    await exigir(supabase.from('depositos_investimento').insert(itens.map((i) => ({ investimento_id: investimentoId, data: i.data, valor_centavos: i.valor_centavos, referencia: i.referencia ?? referencia }))));
  }
}

// `prazo_meses` e `ao_vencer` (a migration 015) faltavam aqui: o "prazo por aplicação" do cadastro não gravava (06/11/2026).
const CAMPOS = ['conta_id', 'nome', 'tipo', 'indexador', 'taxa', 'liquidez', 'liquidez_dias', 'carencia_ate', 'vencimento', 'prazo_meses',
  'ao_vencer', 'vence_dia_anterior', 'emissor', 'aplicado_em', 'aplicado_inicial_centavos', 'observacao', 'ativo'];
const limpar = (inv) => {
  const d = {};
  CAMPOS.forEach((k) => { if (inv[k] !== undefined) d[k] = inv[k] === '' && !['nome', 'emissor', 'observacao'].includes(k) ? null : inv[k]; });
  if (d.nome !== undefined) d.nome = d.nome.trim();
  if (d.emissor !== undefined) d.emissor = (d.emissor ?? '').trim();
  if (d.observacao !== undefined) d.observacao = (d.observacao ?? '').trim();
  if (d.liquidez && d.liquidez !== 'dias') d.liquidez_dias = null;
  if (d.liquidez && d.liquidez !== 'carencia') d.carencia_ate = null;
  if (d.liquidez && d.liquidez !== 'por_aplicacao') d.prazo_meses = null;
  if (d.indexador === null) d.taxa = null;
  return d;
};

// Cadastra o título com a primeira foto (o "vale hoje" em `data`). `comoAporte`: é uma aplicação nova — o valor
// também vira um aporte na mesma data (conta no "aportado no ano"; o rendimento não muda, a foto já o tem). SEM VALOR
// (o cadastro em tabela, 06/11/2026): só o título — o dinheiro entra depois, pelo Aplicar ou pelo Colar os depósitos.
export async function criarInvestimento(inv, { valor_centavos, data, comoAporte = false } = {}) {
  const novo = await exigir(supabase.from('investimentos').insert(limpar(inv)).select().single());
  if (valor_centavos === undefined || valor_centavos === null) return novo;
  try {
    await exigir(supabase.from('valores_investimento').insert({ investimento_id: novo.id, data, valor_centavos }));
    if (comoAporte && valor_centavos > 0) {
      await exigir(supabase.from('movimentos_investimento').insert({
        conta_id: novo.conta_id, investimento_id: novo.id, data, tipo: 'aporte', valor_centavos, descricao: 'Aplicação inicial', origem: 'manual',
      }));
    }
  } catch (err) {
    await supabase.from('investimentos').delete().eq('id', novo.id); // sem a foto o título não vale nada: desfaz
    throw err;
  }
  return novo;
}

// Muda o cadastro. Trocou de conta: os movimentos dele vão junto (o `conta_id` gravado acompanha o título).
export async function atualizarInvestimento(id, mudancas) {
  const d = limpar(mudancas);
  const salvo = await exigir(supabase.from('investimentos').update(d).eq('id', id).select().single());
  if (d.conta_id) await exigir(supabase.from('movimentos_investimento').update({ conta_id: d.conta_id }).eq('investimento_id', id));
  return salvo;
}

// Apaga o título, os valores e os movimentos dele (FK em cascata).
export function excluirInvestimento(id) {
  return exigir(supabase.from('investimentos').delete().eq('id', id));
}

// O valor de vários títulos numa data (o "Registrar o mês"). Mesmo título e mesma data: substitui.
// `itens`: [{ investimento_id, valor_centavos }]
export function registrarValores(data, itens) {
  if (!itens.length) return Promise.resolve();
  return exigir(supabase.from('valores_investimento')
    .upsert(itens.map((i) => ({ investimento_id: i.investimento_id, data, valor_centavos: i.valor_centavos })), { onConflict: 'investimento_id,data' }));
}

// Muda um valor (a data e quanto valia). Mesmo título e mesma data de outro valor: o banco recusa (o índice único).
export function atualizarValor(id, { data, valor_centavos }) {
  return exigir(supabase.from('valores_investimento').update({ data, valor_centavos }).eq('id', id).select().single());
}

export function excluirValor(id) {
  return exigir(supabase.from('valores_investimento').delete().eq('id', id));
}

// O aporte ou o resgate de um título (ou de uma conta sem títulos: `investimento_id` vazio). `encerrar`: o resgate de
// tudo — grava também o valor 0 na data e tira o título da lista (fica no histórico).
export async function lancarMovimento({ conta_id, investimento_id, data, tipo, valor_centavos, descricao = '' }, { encerrar = false } = {}) {
  // sem o título (a conta inteira), a coluna nem vai: assim o lançamento funciona também sem a migration 014
  await exigir(supabase.from('movimentos_investimento').insert({
    conta_id, ...(investimento_id ? { investimento_id } : {}), data, tipo, valor_centavos, descricao: descricao.trim(), origem: 'manual',
  }));
  if (encerrar && investimento_id) {
    await registrarValores(data, [{ investimento_id, valor_centavos: 0 }]);
    await exigir(supabase.from('investimentos').update({ ativo: false }).eq('id', investimento_id));
  }
}
