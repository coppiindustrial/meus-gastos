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
  const mes = Object.fromEntries(comps.map((c) => [c, { competencia: c, entradas: 0, gastos: 0, qtd: 0, temDado: false }]));
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
      if (t.porOrigem[l.origem] !== undefined) t.porOrigem[l.origem] += v;
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

// Os mesmos meses um ano antes (para "Comparar com o ano anterior").
export const anoAnterior = (comps) => comps.map((c) => addMeses(c, -12));

// GASTOS POR GRUPO E POR MÊS no período: cada grupo com o total, a média (pelos meses com dado no
// período), o valor de cada mês e as categorias dele (idem). Do maior para o menor. O que não tem
// categoria vira o grupo "Sem categoria".
export function gruposPorMes(linhas, comps, categorias) {
  const dentro = new Set(comps);
  const cat = new Map(categorias.map((c) => [c.id, c]));
  const mesesComDado = new Set(linhas.filter((l) => dentro.has(l.competencia)).map((l) => l.competencia)).size || 1;
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
      media: Math.round(g.total / mesesComDado),
      categorias: [...g.categorias.values()]
        .map((k) => ({ ...k, media: Math.round(k.total / mesesComDado) }))
        .sort((a, b) => b.total - a.total),
    }))
    .sort((a, b) => b.total - a.total);
}

// A variação em % (arredondada), ou null sem base para comparar.
export const variacao = (atual, antes) => (antes > 0 ? Math.round(((atual - antes) / antes) * 100) : null);
