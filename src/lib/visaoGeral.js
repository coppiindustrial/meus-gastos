import { addMeses } from './format.js';
import { matrizDoAno } from './fixos.js';

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
  // `porCartao`: a fatia de cada cartão dentro dos gastos de cartão (as linhas trazem `cartao_id` desde a migration 010;
  // antes dela, fica vazio e a rosca não divide).
  const t = { entradas: 0, gastos: 0, qtd: 0, porOrigem: { cartao: 0, fixo: 0, manual: 0 }, porCartao: {} };
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
      if (l.origem === 'cartao' && l.cartao_id) t.porCartao[l.cartao_id] = (t.porCartao[l.cartao_id] ?? 0) + v;
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

// A MÉDIA DO GASTO FIXO (02/11/2026, a pedido): a categoria que é sobretudo fixo (metade ou mais do valor vem de
// lançamentos de origem `fixo`) só tem média A PARTIR DO PRIMEIRO MÊS em que aparece no período — o condomínio de
// quem se mudou em maio não divide o ano desde janeiro. O gasto EVENTUAL continua dividido por todos os meses do
// período (`mesesDaMedia`): a festa de um mês pesa no ano inteiro, que é o que a média dele quer dizer.
// Devolve { media, meses, desde } (desde = o 1º mês, só no fixo que começou depois do período).
export function mediaDaCategoria(item, daMedia) {
  const nMedia = daMedia.length || 1;
  const soma = (ms) => ms.reduce((s, c) => s + (item.meses[c] ?? 0), 0);
  const fixo = item.fixo * 2 >= item.total && item.total > 0;
  const primeiro = Object.keys(item.meses).filter((c) => item.meses[c] > 0).sort()[0];
  if (!fixo || !primeiro || primeiro <= daMedia[0]) return { media: Math.round(soma(daMedia) / nMedia), meses: nMedia, desde: null };
  let ms = daMedia.filter((c) => c >= primeiro);
  if (!ms.length) ms = [primeiro]; // só no mês em andamento: é o que há
  return { media: Math.round(soma(ms) / ms.length), meses: ms.length, desde: primeiro };
}

// GASTOS POR GRUPO E POR MÊS no período: cada grupo com o total, o valor de cada mês e as categorias dele, cada uma
// com a média (`mediaDaCategoria`); a média do GRUPO é a soma das médias das categorias (fecha com o Total da tabela).
// Do maior para o menor. O que não tem categoria vira o grupo "Sem categoria". `emAndamento`: o mês atual (fora da
// média, ver `mediaPorMes`).
export function gruposPorMes(linhas, comps, categorias, emAndamento) {
  const dentro = new Set(comps);
  const cat = new Map(categorias.map((c) => [c.id, c]));
  const daMedia = mesesDaMedia(linhas, comps, emAndamento);
  const grupos = new Map();
  linhas.forEach((l) => {
    if (!dentro.has(l.competencia) || l.tipo !== 'saida') return;
    const c = cat.get(l.categoria_id);
    const gid = c?.grupo?.id ?? 'sem';
    if (!grupos.has(gid)) {
      grupos.set(gid, { id: gid, nome: c?.grupo?.nome ?? 'Sem categoria', cor: c?.grupo?.cor ?? '#9ca3af', total: 0, qtd: 0, meses: {}, qtdMeses: {}, categorias: new Map() });
    }
    const g = grupos.get(gid);
    const v = Number(l.total_centavos);
    g.total += v;
    g.qtd += Number(l.qtd);
    g.meses[l.competencia] = (g.meses[l.competencia] ?? 0) + v;
    g.qtdMeses[l.competencia] = (g.qtdMeses[l.competencia] ?? 0) + Number(l.qtd); // os lançamentos do mês (o balão do Grupo × mês)
    const cid = c?.id ?? 'sem';
    const k = g.categorias.get(cid) ?? { id: cid, nome: c?.nome ?? 'Sem categoria', total: 0, fixo: 0, qtd: 0, meses: {}, qtdMeses: {} };
    k.total += v;
    if (l.origem === 'fixo') k.fixo += v;
    k.qtd += Number(l.qtd);
    k.meses[l.competencia] = (k.meses[l.competencia] ?? 0) + v;
    k.qtdMeses[l.competencia] = (k.qtdMeses[l.competencia] ?? 0) + Number(l.qtd);
    g.categorias.set(cid, k);
  });
  return [...grupos.values()]
    .map((g) => {
      const cats = [...g.categorias.values()]
        .map((k) => { const m = mediaDaCategoria(k, daMedia); return { ...k, media: m.media, mesesMedia: m.meses, desde: m.desde }; })
        .sort((a, b) => b.total - a.total);
      return { ...g, media: cats.reduce((s, k) => s + k.media, 0), desde: cats.some((k) => k.desde) ? 'parcial' : null, categorias: cats };
    })
    .sort((a, b) => b.total - a.total);
}

// FORA DO NORMAL (03/11/2026, opção D do mockup "Visão geral · novos gráficos"): as categorias que mais fugiram do
// normal num mês. O MÊS é o último do período com lançamento (sem o em andamento quando há outro); o NORMAL de cada
// categoria é a média dela nos 12 meses ANTES dele, pela regra de toda média do app (`gruposPorMes`: o fixo desde que
// começou, o eventual dividido por todos os meses com dado — o IPTU de um mês não vira "normal" alto). Só fica o que
// mudou de verdade: a diferença de `minimo` (R$ 100) ou mais E de 20% do normal ou mais. Devolve null (nenhum mês) ou
// { mes, base: [comps], acima, abaixo } — os `limite` maiores de cada lado: [{ id, nome, grupo, cor, valor, normal,
// dif, nova, sumiu }] (`nova`: sem normal; `sumiu`: nada no mês).
export function foraDoNormal(linhas, comps, categorias, emAndamento, { minimo = 10000, limite = 6 } = {}) {
  const comDado = new Set(linhas.map((l) => l.competencia));
  let candidatos = comps.filter((c) => comDado.has(c));
  if (candidatos.length > 1) candidatos = candidatos.filter((c) => c !== emAndamento);
  const mes = candidatos[candidatos.length - 1];
  if (!mes) return null;
  const base = Array.from({ length: 12 }, (_, i) => addMeses(mes, -(12 - i))).filter((c) => comDado.has(c));
  const chave = (g, c) => `${g.id}|${c.id}`;
  const normais = new Map();
  gruposPorMes(linhas, base, categorias, null).forEach((g) => g.categorias.forEach((c) => normais.set(chave(g, c), { g, c })));
  const doMes = new Map();
  gruposPorMes(linhas, [mes], categorias, null).forEach((g) => g.categorias.forEach((c) => doMes.set(chave(g, c), { g, c })));
  const itens = [...new Set([...normais.keys(), ...doMes.keys()])].map((k) => {
    const { g, c } = doMes.get(k) ?? normais.get(k);
    const valor = doMes.get(k)?.c.total ?? 0;
    const normal = normais.get(k)?.c.media ?? 0;
    return { id: c.id, nome: c.nome, grupo: g.nome, cor: g.cor, valor, normal, dif: valor - normal, nova: !normal, sumiu: !valor };
  }).filter((x) => base.length && Math.abs(x.dif) >= minimo && (x.nova || Math.abs(x.dif) >= x.normal * 0.2));
  return {
    mes, base,
    acima: itens.filter((x) => x.dif > 0).sort((a, b) => b.dif - a.dif).slice(0, limite),
    abaixo: itens.filter((x) => x.dif < 0).sort((a, b) => a.dif - b.dif).slice(0, limite),
  };
}

// JÁ COMPROMETIDO (03/11/2026, opção C do mockup, em barras deitadas): o que cada mês daqui para a frente já tem para
// pagar antes de começar — as PARCELAS que vêm (a view `parcelas_futuras`: das faturas mais recentes de cada cartão) e
// os GASTOS FIXOS do mês (o lançado; senão a MÉDIA MÓVEL do fixo — "não teve" e fora da vigência não contam). Do mês
// atual até o da última parcela, com `minMeses` e `maxMeses`. Sempre do mês atual, sem os filtros.
// Devolve [{ competencia, parcelas, compras, fixos, total }].
//
// A MÉDIA MÓVEL (05/11/2026, a pedido: antes era o sugerido da grade, o ÚLTIMO lançado, e a luz de um mês valia para o
// ano inteiro): o mês que ainda não foi lançado conta a média dos últimos `JANELA_FIXOS` lançamentos do fixo até hoje
// (`mediaMovelDosFixos`); com menos, a dos que houver; sem nenhum (o fixo recém-cadastrado), o valor padrão. Ela anda
// sozinha: cada mês lançado entra na conta e o mais velho sai. O valor sugerido para LANÇAR (a tela dos fixos) continua o
// último lançado.
export const JANELA_FIXOS = 6;
export function mediaMovelDosFixos(lancamentos, hoje, janela = JANELA_FIXOS) {
  const por = new Map();
  lancamentos.forEach((l) => {
    if (!l.recorrencia_id || String(l.competencia).slice(0, 7) > hoje) return;
    if (!por.has(l.recorrencia_id)) por.set(l.recorrencia_id, []);
    por.get(l.recorrencia_id).push(l);
  });
  const out = new Map();
  por.forEach((ls, id) => {
    const ultimos = ls.sort((a, b) => String(b.competencia).localeCompare(String(a.competencia))).slice(0, janela);
    out.set(id, Math.round(ultimos.reduce((t, l) => t + Number(l.valor_centavos), 0) / ultimos.length));
  });
  return out;
}
const mesesEntre = (a, b) => (Number(b.slice(0, 4)) - Number(a.slice(0, 4))) * 12 + Number(b.slice(5, 7)) - Number(a.slice(5, 7));
export function jaComprometido({ parcelas = [], recorrencias = [], lancamentos = [], pulados = [], hoje, minMeses = 6, maxMeses = 12 }) {
  const porComp = new Map();
  parcelas.forEach((p) => {
    if (p.competencia < hoje) return;
    const x = porComp.get(p.competencia) ?? { valor: 0, compras: new Set() };
    x.valor += Number(p.valor_centavos);
    x.compras.add(p.lancamento_id);
    porComp.set(p.competencia, x);
  });
  const ultima = [...porComp.keys()].sort().pop();
  const n = Math.min(maxMeses, Math.max(minMeses, ultima ? mesesEntre(hoje, ultima) + 1 : 0));
  const fixosDe = fixosDoMes({ recorrencias, lancamentos, pulados, hoje });
  return Array.from({ length: n }, (_, i) => {
    const competencia = addMeses(hoje, i);
    const p = porComp.get(competencia);
    const fixos = fixosDe(competencia).valor;
    return { competencia, parcelas: p?.valor ?? 0, compras: p?.compras.size ?? 0, fixos, total: (p?.valor ?? 0) + fixos };
  });
}

// OS FIXOS DE UM MÊS (a régua do "Já comprometido"): o lançado; senão a média móvel do fixo (o padrão sem lançamento);
// "não teve" e fora da vigência não contam. Devolve (comp) => { valor, qtd } — `qtd`: os fixos que contam no mês.
export function fixosDoMes({ recorrencias = [], lancamentos = [], pulados = [], hoje }) {
  const matrizes = new Map();
  const media = mediaMovelDosFixos(lancamentos, hoje);
  return (comp) => {
    const ano = Number(comp.slice(0, 4));
    if (!matrizes.has(ano)) matrizes.set(ano, matrizDoAno(recorrencias, lancamentos, ano, hoje, pulados));
    const mz = matrizes.get(ano);
    const j = mz.comps.indexOf(comp);
    return mz.linhas.reduce((t, l) => {
      const c = l.celulas[j];
      if (c.estado === 'lancado') return { valor: t.valor + c.valor, qtd: t.qtd + 1 };
      if (c.estado !== 'pendente' && c.estado !== 'futuro') return t;
      return { valor: t.valor + (media.get(l.rec.id) ?? Number(l.rec.valor_padrao_centavos ?? c.sugerido ?? 0)), qtd: t.qtd + 1 };
    }, { valor: 0, qtd: 0 });
  };
}

// A RENDA MÉDIA: as entradas dos 12 meses fechados antes de `hoje` ÷ os meses com entrada (mês sem entrada lançada não é
// renda zero, a regra das médias do app). `resumo`: as linhas da `resumo_mensal`.
export function rendaMedia(resumo = [], hoje) {
  const desde = addMeses(hoje, -12);
  const entradas = new Map();
  resumo.forEach((r) => {
    if (r.tipo !== 'entrada' || r.competencia < desde || r.competencia >= hoje) return;
    entradas.set(r.competencia, (entradas.get(r.competencia) ?? 0) + Number(r.total_centavos));
  });
  const comEntrada = [...entradas.values()].filter((v) => v > 0);
  return comEntrada.length ? Math.round(comEntrada.reduce((s, v) => s + v, 0) / comEntrada.length) : 0;
}

// O CUSTO FIXO (09/11/2026, a opção A do mockup "Comprometido na Visão geral"): quanto os gastos fixos levam por mês — o
// PRÓXIMO mês pela régua do "Já comprometido" (a média móvel de cada fixo; o mês de hoje pode estar lançado só em parte), e o
// de hoje à parte. `historico`: o que os fixos custaram em cada um dos 12 meses fechados (a `resumo_mensal`, origem 'fixo';
// só os meses com fixo). Devolve { valor, qtd, competencia, hoje: { valor, qtd }, historico, renda, pctRenda }.
export function custoFixo({ recorrencias = [], lancamentos = [], pulados = [], resumo = [], hoje }) {
  const de = fixosDoMes({ recorrencias, lancamentos, pulados, hoje });
  const competencia = addMeses(hoje, 1);
  const prox = de(competencia);
  const desde = addMeses(hoje, -12);
  const porMes = new Map();
  resumo.forEach((r) => {
    if (r.tipo !== 'saida' || r.origem !== 'fixo' || r.competencia < desde || r.competencia >= hoje) return;
    porMes.set(r.competencia, (porMes.get(r.competencia) ?? 0) + Number(r.total_centavos));
  });
  const historico = [...porMes].filter(([, v]) => v > 0).sort(([a], [b]) => a.localeCompare(b)).map(([c, valor]) => ({ competencia: c, valor }));
  const renda = rendaMedia(resumo, hoje);
  return { valor: prox.valor, qtd: prox.qtd, competencia, hoje: de(hoje), historico, renda, pctRenda: renda ? prox.valor / renda : null };
}

// A variação em % (arredondada), ou null sem base para comparar.
export const variacao = (atual, antes) => (antes > 0 ? Math.round(((atual - antes) / antes) * 100) : null);

// JÁ COMPROMETIDO EM PARCELAS (09/11/2026, o mockup "Parcelas no resumo", opção A): na Visão geral (09/11/2026, a pedido: no Patrimônio não, não é da carteira) — o total das
// parcelas de cartão que ainda vão cair nas faturas (a view `parcelas_futuras`, das faturas mais recentes de cada cartão; a
// mesma conta das colunas hachuradas em Cartões), de `hoje` (competência 'AAAA-MM') em diante. `cartoes`: [{ id, nome }].
// `resumo` (a `resumo_mensal`): a RENDA MÉDIA = as entradas dos 12 meses fechados antes de hoje ÷ os meses com entrada (mês sem
// entrada lançada não é renda zero, a regra das médias do app). Devolve { total, parcelas, compras, ate, meses: [{ competencia,
// valor, porCartao: [{ nome, valor }] }], porCartao: [{ nome, valor }], renda, pctRenda } — `pctRenda` é o total ÷ a renda média
// (1 = um mês inteiro de renda); null sem entrada.
export function parcelasComprometidas({ parcelas = [], cartoes = [], resumo = [], hoje }) {
  const nome = new Map(cartoes.map((c) => [c.id, c.nome]));
  const vem = parcelas.filter((p) => p.competencia >= hoje);
  const porMes = new Map();
  const porCartao = new Map();
  const compras = new Set();
  let total = 0;
  vem.forEach((p) => {
    const v = Number(p.valor_centavos);
    const n = nome.get(p.cartao_id) ?? 'Cartão';
    total += v;
    compras.add(p.lancamento_id);
    porCartao.set(n, (porCartao.get(n) ?? 0) + v);
    const m = porMes.get(p.competencia) ?? new Map();
    m.set(n, (m.get(n) ?? 0) + v);
    porMes.set(p.competencia, m);
  });
  const ordenar = (mapa) => [...mapa].map(([n, valor]) => ({ nome: n, valor })).sort((a, b) => b.valor - a.valor);
  const meses = [...porMes.keys()].sort().map((competencia) => {
    const m = porMes.get(competencia);
    return { competencia, valor: [...m.values()].reduce((s, v) => s + v, 0), porCartao: ordenar(m) };
  });
  const renda = rendaMedia(resumo, hoje);
  return {
    total, parcelas: vem.length, compras: compras.size, ate: meses.length ? meses[meses.length - 1].competencia : null,
    meses, porCartao: ordenar(porCartao), renda, pctRenda: renda ? total / renda : null,
  };
}
