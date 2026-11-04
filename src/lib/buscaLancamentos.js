import { valorParaCampo } from './dinheiro.js';
import { noPeriodo } from './periodo.js';

// A BUSCA NOS LANÇAMENTOS (04/11/2026, opções C + B + D do mockup "Lançamentos · procurar em todos os meses"):
//   · `casaTermo` — a busca da faixa (o trecho, sem acento nem maiúscula, na descrição, no estabelecimento, na
//     observação ou na categoria); a grade e o aviso "mais N em outros meses" usam a MESMA régua;
//   · `outrosMeses` — o aviso: o que casa FORA do período da tela, por mês;
//   · `palavras` / `casaPalavras` / `resultadosBusca` — a busca rápida (Ctrl+K), na régua do buscador do Gestor:
//     cada palavra no COMEÇO de uma palavra do texto (dígitos em qualquer ponto), o valor incluído.
// Funções puras, testadas em test/buscaLancamentos.test.js.

export const semAcento = (s) => String(s ?? '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

const textoDe = (l) => `${l.descricao ?? ''} ${l.estabelecimento ?? ''} ${l.obs ?? ''} ${l.categoria?.nome ?? ''}`;

export function casaTermo(l, termo) {
  const t = semAcento(termo).trim();
  return !t || semAcento(textoDe(l)).includes(t);
}

// O que casa com `termo` fora de `limites` ({ de, ate }), contado por mês (o mais novo primeiro). `filtro(l)`: os
// outros filtros da tela (tipo, origem, categoria, revisar), para o número bater com o que a grade mostraria.
export function outrosMeses(indice, termo, limites, filtro = () => true) {
  if (!semAcento(termo).trim()) return { total: 0, meses: [] };
  const porMes = new Map();
  let total = 0;
  indice.forEach((l) => {
    if (noPeriodo(l, limites) || !filtro(l) || !casaTermo(l, termo)) return;
    total += 1;
    porMes.set(l.competencia, (porMes.get(l.competencia) ?? 0) + 1);
  });
  const meses = [...porMes].map(([competencia, n]) => ({ competencia, n })).sort((a, b) => b.competencia.localeCompare(a.competencia));
  return { total, meses };
}

// ------------------------------------------------------------ a busca rápida (Ctrl+K)

export const palavras = (q) => semAcento(q).split(/[^a-z0-9]+/).filter(Boolean).slice(0, 6);

// Cada palavra da busca no começo de uma palavra do texto (um número, em qualquer ponto dele).
export function casaPalavras(texto, tokens) {
  if (!tokens.length) return false;
  const ws = semAcento(texto).split(/[^a-z0-9]+/).filter(Boolean);
  return tokens.every((t) => (/^[0-9]+$/.test(t) ? ws.some((w) => w.includes(t)) : ws.some((w) => w.startsWith(t))));
}

// O texto em que a busca rápida procura: o da faixa, a origem (o cartão) e o VALOR como se digita ("644,37").
export const textoDaBusca = (l) => `${textoDe(l)} ${l.cartao?.nome ?? ''} ${valorParaCampo(Math.abs(Number(l.valor_centavos) || 0))}`;

// Os lançamentos que casam, do mais novo ao mais velho: { total, gastos, entradas, itens } — `itens` são os
// primeiros `limite`; os totais contam todos.
export function resultadosBusca(indice, q, limite = 8) {
  const tokens = palavras(q);
  if (!tokens.length) return { total: 0, gastos: 0, entradas: 0, itens: [] };
  const achados = indice.filter((l) => casaPalavras(textoDaBusca(l), tokens));
  achados.sort((a, b) => String(b.data ?? '').localeCompare(String(a.data ?? '')) || String(b.competencia).localeCompare(String(a.competencia)));
  let gastos = 0;
  let entradas = 0;
  achados.forEach((l) => { if (l.tipo === 'entrada') entradas += Number(l.valor_centavos) || 0; else gastos += Number(l.valor_centavos) || 0; });
  return { total: achados.length, gastos, entradas, itens: achados.slice(0, limite) };
}
