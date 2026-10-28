import { addMeses } from './format.js';

// AS CONTAS DA VISÃO GERAL (a tela inicial, o "Dashboard" da planilha refeito): tudo sobre as linhas
// da view `resumo_mensal` (mês × tipo × origem × categoria, já somadas no banco), recortadas pelos
// filtros da tela — ANO e MESES, como as segmentações da planilha, mais tipo, origem e categoria.
// Funções puras, testadas em test/visaoGeral.test.js. Competência 'AAAA-MM'; valores em centavos.

const p2 = (n) => String(n).padStart(2, '0');

// As competências do período: cada ano escolhido × os meses escolhidos (nenhum = o ano todo).
export function periodo(anos, meses = []) {
  const ms = meses.length ? [...meses].sort((a, b) => a - b) : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  return [...anos].sort().flatMap((a) => ms.map((m) => `${a}-${p2(m)}`));
}

// As linhas que passam nos filtros que NÃO são de período. `cats` aceita 'sem' (sem categoria).
export function filtrar(linhas, { tipo = '', origens = [], cats = [] } = {}) {
  return linhas.filter((l) => (!tipo || l.tipo === tipo)
    && (!origens.length || origens.includes(l.origem))
    && (!cats.length || cats.includes(l.categoria_id ?? 'sem')));
}

// Os totais do período e a série por mês. A MÉDIA divide pelos meses que têm algum lançamento (mês
// sem dado nenhum é futuro ou anterior ao histórico, não mês sem gasto).
export function resumoPeriodo(linhas, comps) {
  const dentro = new Set(comps);
  const mes = Object.fromEntries(comps.map((c) => [c, { competencia: c, entradas: 0, gastos: 0, cartao: 0, fixo: 0, manual: 0, qtd: 0, temDado: false }]));
  const t = { entradas: 0, gastos: 0, qtd: 0, porOrigem: { cartao: 0, fixo: 0, manual: 0 } };
  linhas.forEach((l) => {
    if (!dentro.has(l.competencia)) return;
    const v = Number(l.total_centavos);
    const m = mes[l.competencia];
    m.temDado = true;
    m.qtd += Number(l.qtd);
    t.qtd += Number(l.qtd);
    if (l.tipo === 'entrada') { m.entradas += v; t.entradas += v; }
    else {
      m.gastos += v; t.gastos += v;
      if (t.porOrigem[l.origem] !== undefined) { t.porOrigem[l.origem] += v; m[l.origem] += v; }
    }
  });
  const porMes = comps.map((c) => ({ ...mes[c], saldo: mes[c].entradas - mes[c].gastos }));
  const comDado = porMes.filter((m) => m.temDado);
  const maisCaro = comDado.reduce((a, m) => (!a || m.gastos > a.gastos ? m : a), null);
  return {
    ...t,
    saldo: t.entradas - t.gastos,
    meses: comDado.length,
    porMes,
    maisCaro: maisCaro && maisCaro.gastos > 0 ? maisCaro : null,
  };
}

// TODO O HISTÓRICO (a troca da ampliação do "Entradas × gastos", que substituiu a tela Evolução mensal):
// do primeiro ao último mês com lançamento, sem buracos — o mês vazio do meio entra, como "sem dados".
export function compsDoHistorico(linhas) {
  const cs = linhas.map((l) => l.competencia).sort();
  if (!cs.length) return [];
  const out = [];
  for (let c = cs[0]; c <= cs[cs.length - 1]; c = addMeses(c, 1)) out.push(c);
  return out;
}

// Os mesmos meses um ano antes (para "Comparar com o ano anterior").
export const anoAnterior = (comps) => comps.map((c) => addMeses(c, -12));

// A MÉDIA POR MÊS, com as duas regras que valem em toda média do app:
//   · só entram os meses em que o valor APARECE (`presente`, por padrão "maior que zero"): mês sem
//     nenhuma entrada cadastrada não é "entrada zero", é entrada que não foi lançada (ou ainda não veio);
//   · o mês EM ANDAMENTO (`emAndamento`, o mês atual) fica de fora quando há outros: pela metade, ele
//     puxaria a média para baixo. Sozinho no período, ele entra — é o único que há.
// `porMes`: [{ competencia, [campo] }]. Devolve { media, meses } (meses = quantos entraram na conta).
export function mediaPorMes(porMes, campo, { emAndamento, presente = (m) => m[campo] > 0 } = {}) {
  let base = porMes.filter(presente);
  if (base.length > 1) base = base.filter((m) => m.competencia !== emAndamento);
  if (!base.length) return { media: 0, meses: 0 };
  return { media: Math.round(base.reduce((s, m) => s + m[campo], 0) / base.length), meses: base.length };
}

// Os meses que contam para a média de um grupo ou categoria: os do período que têm ALGUM lançamento
// (num mês com dado, o grupo que não aparece gastou zero mesmo), menos o mês em andamento quando há outros.
export function mesesDaMedia(linhas, comps, emAndamento) {
  const dentro = new Set(comps);
  let meses = [...new Set(linhas.filter((l) => dentro.has(l.competencia)).map((l) => l.competencia))];
  if (meses.length > 1) meses = meses.filter((c) => c !== emAndamento);
  return meses;
}

// GASTOS POR GRUPO E POR MÊS no período: cada grupo com o total, a média (pelos `mesesDaMedia`), o valor
// de cada mês e as categorias dele (idem). Do maior para o menor. O que não tem categoria vira o grupo
// "Sem categoria". `emAndamento`: o mês atual (fora da média, ver `mediaPorMes`).
export function gruposPorMes(linhas, comps, categorias, emAndamento) {
  const dentro = new Set(comps);
  const cat = new Map(categorias.map((c) => [c.id, c]));
  const daMedia = mesesDaMedia(linhas, comps, emAndamento);
  const nMedia = daMedia.length || 1;
  const media = (item) => Math.round(daMedia.reduce((s, c) => s + (item.meses[c] ?? 0), 0) / nMedia);
  const grupos = new Map();
  linhas.forEach((l) => {
    if (!dentro.has(l.competencia) || l.tipo !== 'saida') return;
    const c = cat.get(l.categoria_id);
    const gid = c?.grupo?.id ?? 'sem';
    if (!grupos.has(gid)) {
      grupos.set(gid, { id: gid, nome: c?.grupo?.nome ?? 'Sem categoria', cor: c?.grupo?.cor ?? '#9ca3af', total: 0, qtd: 0, meses: {}, categorias: new Map() });
    }
    const g = grupos.get(gid);
    const v = Number(l.total_centavos);
    g.total += v;
    g.qtd += Number(l.qtd);
    g.meses[l.competencia] = (g.meses[l.competencia] ?? 0) + v;
    const cid = c?.id ?? 'sem';
    const k = g.categorias.get(cid) ?? { id: cid, nome: c?.nome ?? 'Sem categoria', total: 0, qtd: 0, meses: {} };
    k.total += v;
    k.qtd += Number(l.qtd);
    k.meses[l.competencia] = (k.meses[l.competencia] ?? 0) + v;
    g.categorias.set(cid, k);
  });
  return [...grupos.values()]
    .map((g) => ({
      ...g,
      media: media(g),
      categorias: [...g.categorias.values()]
        .map((k) => ({ ...k, media: media(k) }))
        .sort((a, b) => b.total - a.total),
    }))
    .sort((a, b) => b.total - a.total);
}

// A variação em % (arredondada), ou null sem base para comparar.
export const variacao = (atual, antes) => (antes > 0 ? Math.round(((atual - antes) / antes) * 100) : null);
