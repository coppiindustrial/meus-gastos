import { buscarTudo, exigir, supabase } from './supabase.js';

// A RENDA VARIÁVEL (13/11/2026, migration 027): os ativos (`rv_ativos`), as operações (`rv_operacoes`), a última cotação
// (`rv_cotacoes`) e os fechamentos de cada dia (`rv_fechamentos`), que a função `cotacoes` do Supabase grava. As contas em
// `lib/rendaVariavel.js`. Sem a migration, `listarRendaVariavel` devolve null e a tela pede para aplicá-la.

const semTabela = (err) => /rv_ativos|rv_operacoes|rv_cotacoes|rv_fechamentos|schema cache|does not exist/i.test(err?.message ?? '');

// OS FECHAMENTOS desde a operação mais antiga (o mês a mês do Patrimônio) e no mínimo os últimos 45 dias (a curvinha do mês
// na carteira): o histórico inteiro, que o gráfico do ativo traz do Yahoo (anos por ativo), é lido só no painel dele
// (`fechamentosDoAtivo`).
const DIAS_CURVINHA = 45;
export async function listarRendaVariavel() {
  try {
    const [ativos, operacoes, cotacoes] = await Promise.all([
      exigir(supabase.from('rv_ativos').select('*').order('ordem').order('ticker')),
      buscarTudo(() => supabase.from('rv_operacoes').select('*').order('data').order('criado_em')),
      exigir(supabase.from('rv_cotacoes').select('*')),
    ]);
    const minimo = new Date(Date.now() - DIAS_CURVINHA * 86400000).toISOString().slice(0, 10);
    const primeira = operacoes[0]?.data;
    const desde = primeira && primeira < minimo ? primeira : minimo;
    const fechamentos = await buscarTudo(() => supabase.from('rv_fechamentos').select('ativo_id, data, preco').gte('data', desde).order('data').order('ativo_id'));
    return { ativos, operacoes, cotacoes, fechamentos };
  } catch (err) {
    if (semTabela(err)) return null;
    throw err;
  }
}

// ------------------------------------------------------------ os ativos
export const criarAtivo = (dados) => exigir(supabase.from('rv_ativos').insert(dados).select().single());
export const atualizarAtivo = (id, mudancas) => exigir(supabase.from('rv_ativos').update(mudancas).eq('id', id).select().single());
export const excluirAtivo = (id) => exigir(supabase.from('rv_ativos').delete().eq('id', id));

// ------------------------------------------------------------ as operações
export const criarOperacao = (dados) => exigir(supabase.from('rv_operacoes').insert(dados).select().single());
export const atualizarOperacao = (id, mudancas) => exigir(supabase.from('rv_operacoes').update(mudancas).eq('id', id).select().single());
export const excluirOperacao = (id) => exigir(supabase.from('rv_operacoes').delete().eq('id', id));

// ------------------------------------------------------------ as cotações (a função do Supabase)
// Sem a função publicada (ou sem as chaves), volta { erro } e a tela segue com a última cotação gravada.
async function chamar(corpo) {
  try {
    const { data, error } = await supabase.functions.invoke('cotacoes', { body: corpo });
    if (error) return { erro: error.message ?? 'a função das cotações não respondeu' };
    return data ?? {};
  } catch (err) {
    return { erro: err?.message ?? 'a função das cotações não respondeu' };
  }
}
// relê as cotações dos ativos da pessoa agora (o "Atualizar as cotações agora" e a abertura da tela, se a última for velha)
export const atualizarCotacoes = () => chamar({});
// confere um ticker antes de cadastrar: { nome, preco } ou { naoAchou: true }
export const consultarTicker = (ticker, mercado) => chamar({ acao: 'consultar', ticker, mercado });

// ------------------------------------------------------------ o gráfico do ativo (o painel que abre pelo ticker)
// Os fechamentos guardados de UM ativo, com as velas (migration 030; sem ela, só o preço).
export async function fechamentosDoAtivo(ativoId) {
  const ler = (campos) => buscarTudo(() => supabase.from('rv_fechamentos').select(campos).eq('ativo_id', ativoId).order('data'));
  try {
    return { velas: true, linhas: await ler('data, preco, abertura, maxima, minima, volume') };
  } catch (err) {
    if (!/abertura|maxima|minima|volume|column/i.test(err?.message ?? '')) throw err;
    return { velas: false, linhas: await ler('data, preco') };
  }
}
// a função busca o histórico no Yahoo e grava: { gravados, de, ate } ou { erro }
export const buscarHistorico = (ativoId, range = '10y') => chamar({ acao: 'historico', ativo_id: ativoId, range });
// o pregão de hoje de 5 em 5 minutos (não fica guardado): { pontos: [{ t, o, h, l, c }], anterior, inicio, fim } ou { erro }
export const intradiaDoAtivo = (ativoId) => chamar({ acao: 'intradia', ativo_id: ativoId });
