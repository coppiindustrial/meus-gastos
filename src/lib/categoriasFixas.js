import { addMeses, competenciaCurta } from './format.js';
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
// · 'parcelado' (19/11/2026, a opção B do mockup "Parcelamento da categoria fixa"; migration 034) — a pessoa disse como
//   paga: N vezes a partir de um mês, e se renova todo ano no mesmo mês. O seguro de 8 parcelas pelo histórico parecia
//   "todo mês" e o app o previa para sempre. O previsto vale só nos meses do parcelamento; o `valor` é a PARCELA: a média
//   das últimas N que caíram (até o mês de hoje), ou, sem nenhuma, o do histórico. `cat`: a categoria (com `fixo_parcelas`,
//   `fixo_inicio`, `fixo_renova`); sem parcelamento, o perfil sai do histórico como sempre.
export function perfilDaCategoria(serie = new Map(), hoje, cat = null) {
  const base = perfilDoHistorico(serie, hoje);
  const p = parcelamentoDa(cat);
  if (!p) return base;
  const pagas = [...serie.keys()].filter((c) => c <= hoje && (serie.get(c) ?? 0) > 0 && parcelaDoMes(p, c)).sort().slice(-p.n);
  const meses = Array.from({ length: Math.min(p.n, 12) }, (_, i) => Number(addMeses(p.inicio, i).slice(5, 7)));
  return { tipo: 'parcelado', valor: pagas.length ? media(pagas.map((c) => serie.get(c))) : base.valor, meses, ...p };
}

// O PARCELAMENTO que a pessoa disse: { n, inicio: 'AAAA-MM', fim: 'AAAA-MM' (a última do 1º ciclo), renova } ou null.
// Renovar só vale com até 12 parcelas (cada ciclo cabe num ano).
export function parcelamentoDa(cat) {
  const n = Number(cat?.fixo_parcelas ?? 0);
  if (!(n > 0) || !cat?.fixo_inicio) return null;
  const inicio = String(cat.fixo_inicio).slice(0, 7);
  return { n, inicio, fim: addMeses(inicio, n - 1), renova: !!cat.fixo_renova && n <= 12 };
}

const mesesEntre = (a, b) => {
  const [ya, ma] = a.split('-').map(Number);
  const [yb, mb] = b.split('-').map(Number);
  return (yb - ya) * 12 + (mb - ma);
};
// QUAL PARCELA cai no mês (1…n), ou 0 fora do parcelamento. Com `renova`, o ciclo recomeça a cada 12 meses do início.
export function parcelaDoMes(p, comp) {
  if (!p) return 0;
  const d = mesesEntre(p.inicio, comp);
  if (d < 0) return 0;
  const k = p.renova ? d % 12 : d;
  return k < p.n ? k + 1 : 0;
}

// O CICLO de agora (o "Como paga" mostra): o de hoje, ou o último que já começou; { de, ate } 'AAAA-MM'.
export function cicloAtual(p, hoje) {
  const d = mesesEntre(p.inicio, hoje);
  const de = p.renova && d > 0 ? addMeses(p.inicio, Math.floor(d / 12) * 12) : p.inicio;
  return { de, ate: addMeses(de, p.n - 1) };
}

// OS ÚLTIMOS 12 MESES do pop-up da categoria fixa (19/11/2026, a opção B do mockup "Categoria fixa · pop-up"): de 11 meses
// atrás até hoje, o que caiu em cada um e, com o parcelamento `p` (o do rascunho, ou null = pelo histórico), qual parcela é.
// `estado`: 'parcela' (caiu, numa parcela) · 'prevista' (parcela de hoje ou depois que ainda não caiu) · 'faltou' (parcela
// de um mês fechado sem gasto: o parcelamento não bate) · 'fora' (caiu fora das parcelas) · 'gasto' (caiu, sem
// parcelamento) · 'vazio'.
export function ultimos12Meses(serie = new Map(), hoje, p = null) {
  return Array.from({ length: 12 }, (_, i) => {
    const comp = addMeses(hoje, i - 11);
    const valor = Math.max(0, serie.get(comp) ?? 0);
    const parcela = parcelaDoMes(p, comp);
    const estado = !p ? (valor ? 'gasto' : 'vazio')
      : parcela ? (valor ? 'parcela' : comp >= hoje ? 'prevista' : 'faltou')
      : valor ? 'fora' : 'vazio';
    return { comp, valor, parcela, estado };
  });
}

// A SUGESTÃO para quem vai dizer o parcelamento: a última sequência de meses seguidos com gasto (até hoje) — o seguro de
// março a outubro dá 8 vezes a partir de março. { n, inicio } ou null.
export function sugestaoDeParcelamento(serie = new Map(), hoje) {
  const com = [...serie.keys()].filter((c) => c <= hoje && (serie.get(c) ?? 0) > 0).sort();
  if (!com.length) return null;
  let inicio = com[com.length - 1];
  while (com.includes(addMeses(inicio, -1))) inicio = addMeses(inicio, -1);
  return { n: Math.min(60, mesesEntre(inicio, com[com.length - 1]) + 1), inicio };
}

function perfilDoHistorico(serie, hoje) {
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
  if (perfil.tipo === 'parcelado') return parcelaDoMes(perfil, comp) ? perfil.valor : 0;
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
  if (perfil.tipo === 'parcelado') {
    return perfil.renova
      ? `${perfil.n}× · ${faixaDeMeses(perfil.meses)} · renova`
      : `${perfil.n}× · ${competenciaCurta(perfil.inicio)} a ${competenciaCurta(perfil.fim)}`;
  }
  if (perfil.tipo === 'mensal') return `todo mês · ${formatBRL(perfil.valor)}`;
  if (perfil.tipo === 'sazonal') return `${faixaDeMeses(perfil.meses)} · ${formatBRL(perfil.valor)}`;
  return 'nada nos últimos 12 meses';
}

// "Como vem" de cada categoria pela `resumo_mensal` (os dois cadastros): Map<categoria_id, texto>. A categoria que só tem
// fixo lançado à mão diz isso (ela já está na grade de cima dos Gastos fixos; marcar não muda nada nela).
// `categorias` (opcional): a parcelada diz o parcelamento, não o histórico.
export function comoVemDoResumo(resumo = [], hoje, categorias = []) {
  const out = new Map();
  const porId = new Map(categorias.map((c) => [c.id, c]));
  resumo.forEach((r) => { if (r.tipo === 'saida' && r.origem === 'fixo' && r.categoria_id) out.set(r.categoria_id, 'só o fixo lançado à mão'); });
  seriesPorCategoria(linhasDoResumo(resumo)).forEach((serie, id) => out.set(id, comoVem(perfilDaCategoria(serie, hoje, porId.get(id)))));
  return out;
}

// A CÉLULA de um mês: o que veio (`real`), a parcela que já está numa fatura (`parc`, das parcelas que vêm) e o que ainda
// falta do previsto (`prev`, tracejado). Nos meses passados, só o real. De hoje em diante, o total é o MAIOR entre o
// previsto e o que já se sabe (real + parcela): o previsto some à medida que o real entra.
// Na parcelada, `parcela` = qual parcela cai no mês (1…n; 0 fora) e `de` = n.
export function celulaDoMes({ serie = new Map(), perfil, parcelas = 0, comp, hoje }) {
  const real = serie.get(comp) ?? 0;
  const k = perfil?.tipo === 'parcelado' ? { parcela: parcelaDoMes(perfil, comp), de: perfil.n } : {};
  if (comp < hoje) return { real, parc: 0, prev: 0, previsto: 0, total: real, ...k };
  const previsto = previstoDoMes(perfil, serie, comp, hoje);
  const prev = Math.max(0, previsto - real - parcelas);
  return { real, parc: parcelas, prev, previsto, total: real + parcelas + prev, ...k };
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
    const perfil = perfilDaCategoria(serie, hoje, cat);
    const celulas = comps.map((comp) => ({
      comp,
      ...celulaDoMes({ serie, perfil, parcelas: parc.get(cat.id)?.get(comp)?.valor ?? 0, comp, hoje }),
      itens: itens.get(`${cat.id}|${comp}`) ?? [],
      parcelas: parc.get(cat.id)?.get(comp)?.itens ?? [],
    }));
    const total = soma(celulas.map((c) => c.total));
    g.categorias.push({ cat, perfil, serie, como: comoVem(perfil), celulas, ano: total, ...mediaDaCategoria({ perfil, celulas, ano: total, hoje }) });
  });
  grupos.forEach((g) => {
    g.totais = comps.map((_, i) => soma(g.categorias.map((c) => c.celulas[i].total)));
    g.ano = soma(g.totais);
    g.media = soma(g.categorias.map((c) => c.media));
  });
  const totais = comps.map((_, i) => soma(grupos.map((g) => g.totais[i])));
  return { comps, grupos, totais, ano: soma(totais), media: soma(grupos.map((g) => g.media)) };
}

// A MÉDIA POR MÊS de uma categoria fixa no ano (18/11/2026, a opção B do mockup "Média do custo fixo"):
// · a que vem TODO MÊS ('mensal') — a média dos meses FECHADOS do ano com gasto (o mês em andamento ainda não terminou);
//   sem nenhum fechado no ano (o ano que vem), o previsto dela;
// · a ANUAL ou de alguns meses (o IPTU, o IPVA, a manutenção) — o ano inteiro (o que veio + o previsto) ÷ 12: o quanto
//   separar por mês. Dividir pelos meses com gasto faria o IPVA de setembro valer por mês.
// Devolve { media, regra } — `regra` é o texto curto que a tabela mostra embaixo do número ('10 meses', 'ano ÷ 12', 'previsto').
// · a PARCELADA — a parcela (o total ÷ as vezes), quando o ano tem parcela; o ano sem nenhuma segue a régua de baixo.
export function mediaDaCategoria({ perfil, celulas = [], ano = 0, hoje }) {
  if (perfil?.tipo === 'parcelado' && celulas.some((c) => c.parcela)) return { media: perfil.valor, regra: `parcela de ${perfil.n}×` };
  if (perfil?.tipo === 'mensal') {
    const fechados = celulas.filter((c) => c.comp < hoje && c.real > 0).map((c) => c.real);
    if (fechados.length) return { media: media(fechados), regra: fechados.length === 1 ? '1 mês' : `${fechados.length} meses` };
    return { media: perfil.valor, regra: 'previsto' };
  }
  if (!ano) return { media: 0, regra: '' };
  return { media: Math.round(ano / 12), regra: 'ano ÷ 12' };
}

// O CUSTO FIXO TOTAL do ano (a faixa embaixo das duas tabelas dos Gastos fixos): os fixos lançados à mão (a matriz de
// `matrizDoAno`) + as categorias fixas (a tabela de `tabelaCategoriasFixas`), mês a mês. Cada célula é { conhecido, falta }:
// · fixos à mão — `conhecido` = o lançado; `falta`, de hoje em diante, o sugerido dos que ainda não foram lançados
//   (o "não teve" não conta);
// · categorias — `conhecido` = o que caiu + as parcelas que já estão numa fatura; `falta` = o previsto que falta.
// A média dos fixos à mão é a soma das médias de cada um (os meses lançados no ano); a das categorias, a da tabela; a do
// total, a soma das duas. Devolve { comps, linhas: [{ chave: 'mao' | 'cats' | 'total', nome, celulas: [12], media }] }.
export function custoFixoDoAno({ matriz, tabela, hoje }) {
  const comps = matriz?.comps ?? tabela?.comps ?? [];
  const mao = comps.map((comp, i) => ({
    conhecido: matriz?.totais?.[comp] ?? 0,
    falta: comp < hoje ? 0 : (matriz?.linhas ?? []).reduce((t, l) => {
      const c = l.celulas[i];
      return t + (c && (c.estado === 'pendente' || c.estado === 'futuro') ? Number(c.sugerido ?? 0) : 0);
    }, 0),
  }));
  const cats = comps.map((_, i) => (tabela?.grupos ?? []).reduce((t, g) => {
    g.categorias.forEach((c) => { const cel = c.celulas[i]; t.conhecido += cel.real + cel.parc; t.falta += cel.prev; });
    return t;
  }, { conhecido: 0, falta: 0 }));
  const mediaMao = (matriz?.linhas ?? []).reduce((t, l) => t + (l.media ?? 0), 0);
  const mediaCats = tabela?.media ?? 0;
  return {
    comps,
    linhas: [
      { chave: 'mao', nome: 'Fixos à mão', celulas: mao, media: mediaMao },
      { chave: 'cats', nome: 'Categorias fixas', celulas: cats, media: mediaCats },
      { chave: 'total', nome: 'Custo fixo total', celulas: comps.map((_, i) => ({ conhecido: mao[i].conhecido + cats[i].conhecido, falta: mao[i].falta + cats[i].falta })), media: mediaMao + mediaCats },
    ],
  };
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
  const perfis = new Map(fixas.map((c) => [c.id, perfilDaCategoria(series.get(c.id) ?? new Map(), hoje, c)]));
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
