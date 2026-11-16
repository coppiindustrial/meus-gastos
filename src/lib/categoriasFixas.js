import { addMeses } from './format.js';
import { formatBRL } from './dinheiro.js';

// AS CATEGORIAS QUE SÃO GASTO FIXO (16/11/2026, o mockup "Fixos por categoria", as recomendadas; migration 033).
// Marcar uma categoria (ou o grupo) faz tudo o que cai nela contar como fixo, venha do cartão, de boleto ou de onde for:
// o Streaming, o IPTU, o Seguro do carro, o IPVA. Nada se lança: o PREVISTO de cada mês sai do histórico, e some quando o
// real entra. Os fixos lançados à mão (origem 'fixo') ficam de fora destas contas — eles têm a tabela deles e o "Já
// comprometido" já os soma; contar aqui seria contar duas vezes.
//
// As entradas destas funções são LINHAS { categoria_id, competencia, valor } — o valor pode vir como `valor`,
// `valor_centavos` (os lançamentos) ou `total_centavos` (a `resumo_mensal`) — e as PARCELAS que vêm (a view
// `parcelas_futuras`, com `categoria_id`). `hoje` é a competência 'AAAA-MM' de hoje.

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const valorDe = (x) => Number(x.valor ?? x.valor_centavos ?? x.total_centavos ?? 0);
const media = (vs) => (vs.length ? Math.round(vs.reduce((s, v) => s + v, 0) / vs.length) : 0);

// As categorias marcadas que contam: de gasto e ativas.
export const categoriasFixas = (categorias = []) => categorias.filter((c) => c.gasto_fixo && c.ativa !== false && c.grupo?.tipo !== 'entrada');

// As linhas da `resumo_mensal` que contam: os gastos que não são fixo lançado à mão.
export const linhasDoResumo = (resumo = []) => resumo.filter((r) => r.tipo === 'saida' && r.origem !== 'fixo' && r.categoria_id);

// A SÉRIE de cada categoria: Map<categoria_id, Map<competência, valor>>. `ids`: só estas (um Set), ou todas.
export function seriesPorCategoria(linhas = [], ids = null) {
  const out = new Map();
  linhas.forEach((l) => {
    if (!l.categoria_id || (ids && !ids.has(l.categoria_id))) return;
    const comp = String(l.competencia).slice(0, 7);
    if (!out.has(l.categoria_id)) out.set(l.categoria_id, new Map());
    const s = out.get(l.categoria_id);
    s.set(comp, (s.get(comp) ?? 0) + valorDe(l));
  });
  return out;
}

// COMO A CATEGORIA VEM, pelos 12 meses FECHADOS antes de hoje (contados a partir do primeiro mês em que ela aparece, para
// a assinatura nova não parecer "de vez em quando"):
// · 'mensal' — aparece em todo mês da janela (com 6 meses ou mais, pode faltar um: a fatura que atrasou). O previsto é a
//   MÉDIA dos últimos `JANELA_MEDIA` meses com gasto (a régua da média móvel dos fixos).
// · 'sazonal' — o resto (o IPTU em fevereiro, o IPVA em três cotas, o seguro em 10 parcelas). O previsto de cada mês é o
//   MESMO MÊS DO ANO ANTERIOR (o mais recente já fechado; até dois anos para trás).
// · 'sem' — nada nos últimos 12 meses.
// Devolve { tipo, valor, meses } — `valor`: o previsto do mensal, ou a média dos meses com gasto no sazonal; `meses`: os
// números (1–12) dos meses com gasto na janela.
export const JANELA_MEDIA = 6;
export function perfilDaCategoria(serie = new Map(), hoje) {
  const fechados = Array.from({ length: 12 }, (_, i) => addMeses(hoje, i - 12));
  const tem = (c) => (serie.get(c) ?? 0) > 0;
  const primeiro = fechados.find(tem);
  if (!primeiro) return { tipo: 'sem', valor: 0, meses: [] };
  const janela = fechados.filter((c) => c >= primeiro);
  const com = janela.filter(tem);
  const meses = [...new Set(com.map((c) => Number(c.slice(5, 7))))].sort((a, b) => a - b);
  const falta = janela.length - com.length;
  if (janela.length >= 2 && falta <= (janela.length >= 6 ? 1 : 0)) {
    return { tipo: 'mensal', valor: media(com.slice(-JANELA_MEDIA).map((c) => serie.get(c))), meses };
  }
  return { tipo: 'sazonal', valor: media(com.map((c) => serie.get(c))), meses };
}

// O PREVISTO de um mês (de hoje em diante) pelo perfil.
export function previstoDoMes(perfil, serie = new Map(), comp, hoje) {
  if (perfil.tipo === 'mensal') return perfil.valor;
  if (perfil.tipo !== 'sazonal') return 0;
  for (let k = 1; k <= 2; k += 1) {
    const antes = addMeses(comp, -12 * k);
    if (antes < hoje) return Math.max(0, serie.get(antes) ?? 0);
  }
  return 0;
}

// "jan a mar", "fev", "out a jul" (a faixa que vira o ano), "jan, jun e set"; com mais de três pedaços, "N meses".
export function faixaDeMeses(meses = []) {
  const ms = [...new Set(meses)].sort((a, b) => a - b);
  if (!ms.length) return '';
  const pedacos = [];
  ms.forEach((m) => {
    const ult = pedacos[pedacos.length - 1];
    if (ult && ult[1] === m - 1) ult[1] = m; else pedacos.push([m, m]);
  });
  if (pedacos.length > 1 && pedacos[0][0] === 1 && pedacos[pedacos.length - 1][1] === 12) {
    const fim = pedacos.pop();
    pedacos[0] = [fim[0], pedacos[0][1]];
  }
  if (pedacos.length > 3) return `${ms.length} meses`;
  const txt = pedacos.map(([a, b]) => (a === b ? MESES[a - 1] : `${MESES[a - 1]} a ${MESES[b - 1]}`));
  return txt.length === 1 ? txt[0] : `${txt.slice(0, -1).join(', ')} e ${txt[txt.length - 1]}`;
}

// O que o app entendeu do histórico, numa frase: "todo mês · R$ 94,80", "fev · R$ 3.180,00".
export function comoVem(perfil) {
  if (perfil.tipo === 'mensal') return `todo mês · ${formatBRL(perfil.valor)}`;
  if (perfil.tipo === 'sazonal') return `${faixaDeMeses(perfil.meses)} · ${formatBRL(perfil.valor)}`;
  return 'nada nos últimos 12 meses';
}

// "Como vem" de cada categoria pela `resumo_mensal` (os dois cadastros): Map<categoria_id, texto>. A categoria que só tem
// fixo lançado à mão diz isso (ela já está na grade de cima dos Gastos fixos; marcar não muda nada nela).
export function comoVemDoResumo(resumo = [], hoje) {
  const out = new Map();
  resumo.forEach((r) => { if (r.tipo === 'saida' && r.origem === 'fixo' && r.categoria_id) out.set(r.categoria_id, 'só o fixo lançado à mão'); });
  seriesPorCategoria(linhasDoResumo(resumo)).forEach((serie, id) => out.set(id, comoVem(perfilDaCategoria(serie, hoje))));
  return out;
}

// A CÉLULA de um mês: o que veio (`real`), a parcela que já está numa fatura (`parc`, das parcelas que vêm) e o que ainda
// falta do previsto (`prev`, tracejado). Nos meses passados, só o real. De hoje em diante, o total é o MAIOR entre o
// previsto e o que já se sabe (real + parcela): o previsto some à medida que o real entra.
export function celulaDoMes({ serie = new Map(), perfil, parcelas = 0, comp, hoje }) {
  const real = serie.get(comp) ?? 0;
  if (comp < hoje) return { real, parc: 0, prev: 0, previsto: 0, total: real };
  const previsto = previstoDoMes(perfil, serie, comp, hoje);
  const prev = Math.max(0, previsto - real - parcelas);
  return { real, parc: parcelas, prev, previsto, total: real + parcelas + prev };
}

// As parcelas que vêm, por categoria e mês: Map<categoria_id, Map<comp, { valor, itens }>>.
function parcelasPorCategoria(parcelas = [], ids) {
  const out = new Map();
  parcelas.forEach((p) => {
    if (!ids.has(p.categoria_id)) return;
    const comp = String(p.competencia).slice(0, 7);
    if (!out.has(p.categoria_id)) out.set(p.categoria_id, new Map());
    const m = out.get(p.categoria_id);
    const x = m.get(comp) ?? { valor: 0, itens: [] };
    x.valor += Number(p.valor_centavos);
    x.itens.push(p);
    m.set(comp, x);
  });
  return out;
}

// A TABELA "CATEGORIAS FIXAS" dos Gastos fixos: as marcadas, agrupadas na ordem das Categorias, uma coluna por mês do ano.
// `lancamentos`: os das categorias (sem os fixos à mão — `listarLancamentosDasCategorias`), que também dão o balão.
// Devolve { comps, grupos: [{ id, nome, cor, totais: [12], ano, categorias: [{ cat, perfil, como, celulas: [12], ano }] }],
// totais: [12], ano } — cada célula { comp, real, parc, prev, previsto, total, itens, parcelas }; `ano` = a soma das células.
export function tabelaCategoriasFixas({ categorias = [], lancamentos = [], parcelas = [], ano, hoje }) {
  const fixas = categoriasFixas(categorias);
  const ids = new Set(fixas.map((c) => c.id));
  const series = seriesPorCategoria(lancamentos, ids);
  const itens = new Map();
  lancamentos.forEach((l) => {
    if (!ids.has(l.categoria_id)) return;
    const chave = `${l.categoria_id}|${String(l.competencia).slice(0, 7)}`;
    if (!itens.has(chave)) itens.set(chave, []);
    itens.get(chave).push(l);
  });
  const parc = parcelasPorCategoria(parcelas, ids);
  const comps = Array.from({ length: 12 }, (_, i) => `${ano}-${String(i + 1).padStart(2, '0')}`);
  const soma = (vs) => vs.reduce((s, v) => s + v, 0);
  const grupos = [];
  fixas.forEach((cat) => {
    const gid = cat.grupo?.id ?? cat.grupo_id;
    let g = grupos.find((x) => x.id === gid);
    if (!g) { g = { id: gid, nome: cat.grupo?.nome ?? '', cor: cat.grupo?.cor ?? '#9ca3af', categorias: [] }; grupos.push(g); }
    const serie = series.get(cat.id) ?? new Map();
    const perfil = perfilDaCategoria(serie, hoje);
    const celulas = comps.map((comp) => ({
      comp,
      ...celulaDoMes({ serie, perfil, parcelas: parc.get(cat.id)?.get(comp)?.valor ?? 0, comp, hoje }),
      itens: itens.get(`${cat.id}|${comp}`) ?? [],
      parcelas: parc.get(cat.id)?.get(comp)?.itens ?? [],
    }));
    g.categorias.push({ cat, perfil, como: comoVem(perfil), celulas, ano: soma(celulas.map((c) => c.total)) });
  });
  grupos.forEach((g) => {
    g.totais = comps.map((_, i) => soma(g.categorias.map((c) => c.celulas[i].total)));
    g.ano = soma(g.totais);
  });
  const totais = comps.map((_, i) => soma(grupos.map((g) => g.totais[i])));
  return { comps, grupos, totais, ano: soma(totais) };
}

// AS CATEGORIAS FIXAS NUM MÊS (o "Já comprometido" e o "Custo fixo" da Visão geral). `linhas`: as da `resumo_mensal` que
// contam (`linhasDoResumo`). Devolve (comp) => { valor, parcelas, qtd, porCategoria: [{ id, nome, valor, previsto }] } —
// `valor` é o total das categorias no mês COM as parcelas delas; `parcelas`, a parte que já está nas parcelas que vêm
// (o "Já comprometido" a tira, porque as parcelas já têm a barra delas); `qtd`, as categorias com valor.
export function categoriasFixasDoMes({ categorias = [], linhas = [], parcelas = [], hoje }) {
  const fixas = categoriasFixas(categorias);
  const ids = new Set(fixas.map((c) => c.id));
  const series = seriesPorCategoria(linhas, ids);
  const parc = parcelasPorCategoria(parcelas, ids);
  const perfis = new Map(fixas.map((c) => [c.id, perfilDaCategoria(series.get(c.id) ?? new Map(), hoje)]));
  return (comp) => {
    const out = { valor: 0, parcelas: 0, qtd: 0, porCategoria: [] };
    fixas.forEach((c) => {
      const cel = celulaDoMes({ serie: series.get(c.id) ?? new Map(), perfil: perfis.get(c.id), parcelas: parc.get(c.id)?.get(comp)?.valor ?? 0, comp, hoje });
      if (!cel.total) return;
      out.valor += cel.total;
      out.parcelas += cel.parc;
      out.qtd += 1;
      out.porCategoria.push({ id: c.id, nome: c.nome, valor: cel.total, previsto: cel.prev });
    });
    out.porCategoria.sort((a, b) => b.valor - a.valor);
    return out;
  };
}
