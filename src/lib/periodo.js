import { addMeses, competenciaCurta } from './format.js';

// O PERÍODO DOS LANÇAMENTOS (04/11/2026, opção C do mockup "Lançamentos · procurar em todos os meses"): a pílula do
// mês também escolhe um período maior. `periodo`:
//   'mes'       → só o mês da tela (`comp`), com o ‹ › de sempre;
//   '3m' | '12m'→ os 3 ou 12 meses que TERMINAM no mês da tela (andar com o mês e depois abrir o período);
//   'ano:AAAA'  → janeiro a dezembro do ano;
//   'tudo'      → o histórico inteiro.
// Funções puras, testadas em test/periodo.test.js.

export const PERIODOS_FIXOS = [
  { value: '3m', meses: 3, label: 'Últimos 3 meses' },
  { value: '12m', meses: 12, label: 'Últimos 12 meses' },
];

// { de, ate } em 'AAAA-MM' (null = sem limite).
export function limitesDoPeriodo(periodo, comp) {
  if (!periodo || periodo === 'mes') return { de: comp, ate: comp };
  const fixo = PERIODOS_FIXOS.find((p) => p.value === periodo);
  if (fixo) return { de: addMeses(comp, -(fixo.meses - 1)), ate: comp };
  if (periodo.startsWith('ano:')) {
    const ano = periodo.slice(4);
    return { de: `${ano}-01`, ate: `${ano}-12` };
  }
  return { de: null, ate: null };
}

// O texto da pílula: "3 meses até out/26", "Ano 2026", "Todo o histórico".
export function rotuloPeriodo(periodo, comp) {
  const fixo = PERIODOS_FIXOS.find((p) => p.value === periodo);
  if (fixo) return `${fixo.meses} meses até ${competenciaCurta(comp)}`;
  if (periodo?.startsWith('ano:')) return `Ano ${periodo.slice(4)}`;
  if (periodo === 'tudo') return 'Todo o histórico';
  return '';
}

// Uma linha "no período" (pela competência).
export const noPeriodo = (l, { de, ate }) => (!de || l.competencia >= de) && (!ate || l.competencia <= ate);

// O MÊS DA LINHA NOVA quando a tela mostra um período: o mês da tela nos períodos que terminam nele; no ano, o mês
// de hoje se for o ano corrente (senão dezembro, ou janeiro de um ano que ainda vem); no histórico, o de hoje.
export function mesDaLinhaNova(periodo, comp, hoje) {
  if (periodo?.startsWith('ano:')) {
    const ano = periodo.slice(4);
    if (ano === hoje.slice(0, 4)) return hoje;
    return ano < hoje.slice(0, 4) ? `${ano}-12` : `${ano}-01`;
  }
  if (periodo === 'tudo') return hoje;
  return comp;
}

// Os anos com dado (das competências que existem), do mais novo ao mais velho, com o de hoje sempre na lista.
export function anosComDado(comps, hoje) {
  const anos = new Set([hoje.slice(0, 4)]);
  comps.forEach((c) => { if (c) anos.add(String(c).slice(0, 4)); });
  return [...anos].sort().reverse();
}

// OS GRUPOS DA GRADE num período (a data mais nova em cima, por mês): o índice da 1ª linha de cada mês e o que o
// mês soma (só as gravadas — o rascunho não abre grupo nem conta). `linhas` já vem ordenada por competência.
export function gruposPorMes(linhas) {
  const grupos = new Map(); // índice da 1ª linha → { competencia, n, gastos, entradas }
  let atual = null;
  linhas.forEach((l, i) => {
    if (l.rascunho) return;
    if (!atual || atual.competencia !== l.competencia) {
      atual = { competencia: l.competencia, n: 0, gastos: 0, entradas: 0 };
      grupos.set(i, atual);
    }
    atual.n += 1;
    atual[l.tipo === 'entrada' ? 'entradas' : 'gastos'] += Number(l.valor_centavos) || 0;
  });
  return grupos;
}
