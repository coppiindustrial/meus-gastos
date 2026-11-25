import { CLASSES, TIPOS, classeDoTipo } from './rendaVariavel.js';

// O ACOMPANHAMENTO DAS AÇÕES (25/11/2026, o mockup "Acompanhamento das ações"): as contas da tela, todas puras (testadas em
// `test/acompanhamento.test.js`). A LISTA = os ativos da carteira (`rv_ativos`, os ativos) + os que a pessoa só acompanha
// (`rv_acompanhamento`, migration 037); a linha da tabela com o ticker de um da carteira só diz se ele APARECE (sem linha,
// aparece). OS PREÇOS vêm da função `cotacoes` (a ação "ao_vivo", do Yahoo, sem gravar), por CHAVE: "EUA:NVDA", "B3:PETR4"
// e os índices "IDX:IBOV"…

export const chaveDe = (mercado, ticker) => `${mercado}:${String(ticker ?? '').trim().toUpperCase()}`;

// os índices da linha de cima (a chave da função e o nome na tela)
export const INDICES = [
  { chave: 'IDX:IBOV', nome: 'Ibovespa', unidade: 'pts', mercado: 'B3' },
  { chave: 'IDX:SPX', nome: 'S&P 500', unidade: 'pts', mercado: 'EUA' },
  { chave: 'IDX:NDX', nome: 'Nasdaq', unidade: 'pts', mercado: 'EUA' },
  { chave: 'IDX:USDBRL', nome: 'Dólar', unidade: 'R$', mercado: 'B3' },
];

const ORDEM_CLASSE = Object.fromEntries(CLASSES.map((c, i) => [c.id, i]));

// A LISTA DA TELA: a carteira primeiro (na ordem das classes e do cadastro), depois os acompanhados (na ordem deles). Dois
// cadastros com o mesmo ticker contam uma vez; o ativo desativado não entra.
export function listaDoAcompanhamento(ativos = [], linhas = []) {
  const porChave = new Map((linhas ?? []).map((l) => [chaveDe(l.mercado, l.ticker), l]));
  const vistos = new Set();
  const cart = [];
  for (const a of ativos) {
    if (a.ativo === false) continue;
    const chave = chaveDe(a.mercado, a.ticker);
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    const l = porChave.get(chave);
    cart.push({
      chave, ticker: a.ticker, mercado: a.mercado, nome: a.nome ?? '', tipo: a.tipo, classe: classeDoTipo(a.tipo),
      deCarteira: true, ativoId: a.id, aparece: l ? l.aparece !== false : true, linhaId: l?.id ?? null, ordem: Number(a.ordem ?? 0),
    });
  }
  cart.sort((x, y) => ORDEM_CLASSE[x.classe] - ORDEM_CLASSE[y.classe] || x.ordem - y.ordem || x.ticker.localeCompare(y.ticker));
  const acomp = (linhas ?? []).filter((l) => !vistos.has(chaveDe(l.mercado, l.ticker))).map((l) => {
    const tipo = TIPOS[l.tipo] ? l.tipo : l.mercado === 'EUA' ? 'acao_eua' : 'acao_br';
    return {
      chave: chaveDe(l.mercado, l.ticker), ticker: String(l.ticker).toUpperCase(), mercado: l.mercado, nome: l.nome ?? '', tipo,
      classe: classeDoTipo(tipo), deCarteira: false, ativoId: null, aparece: l.aparece !== false, linhaId: l.id, ordem: Number(l.ordem ?? 0),
    };
  }).sort((x, y) => x.ordem - y.ordem || x.ticker.localeCompare(y.ticker));
  return [...cart, ...acomp];
}

// O QUE O POP-UP GRAVA: compara o rascunho (`itens`, com `aparece` mexido, os novos sem `linhaId` e os tirados com
// `tirar`) com a lista de quando abriu. Volta { criar, atualizar, apagar }:
//  · da carteira: escondeu → cria (ou atualiza) a linha com `aparece: false`; voltou a mostrar → apaga a linha (sem linha,
//    aparece);
//  · de fora: novo → cria; mudou o aparece ou a ordem → atualiza; tirado → apaga.
// `reordenar` (25/11/2026, o pop-up agrupado pela classe): só quando a pessoa ARRASTOU a ordem vira a da lista (1, 2, 3…);
// sem isso, a de cada um fica como estava e o novo vai depois da maior — a lista agrupada pode sair noutra ordem que a
// gravada, e só abrir o pop-up não pode contar como alteração.
export function planoDoAcompanhamento(antes, itens, { reordenar = true } = {}) {
  const criar = []; const atualizar = []; const apagar = [];
  const era = new Map(antes.map((i) => [i.chave, i]));
  let ordem = 0;
  let fim = Math.max(0, ...antes.filter((i) => !i.deCarteira).map((i) => Number(i.ordem) || 0));
  for (const i of itens) {
    if (!i.deCarteira && !i.tirar) {
      if (reordenar) ordem += 1;
      else ordem = i.linhaId && era.has(i.chave) ? era.get(i.chave).ordem : (fim += 1);
    }
    const a = era.get(i.chave);
    if (i.deCarteira) {
      if (!a || a.aparece === i.aparece) continue;
      if (!i.aparece) {
        if (i.linhaId) atualizar.push({ id: i.linhaId, mudancas: { aparece: false } });
        else criar.push({ ticker: i.ticker, mercado: i.mercado, nome: i.nome, tipo: i.tipo, aparece: false, ordem: 0 });
      } else if (i.linhaId) apagar.push(i.linhaId);
      continue;
    }
    if (i.tirar) { if (i.linhaId) apagar.push(i.linhaId); continue; }
    if (!i.linhaId) { criar.push({ ticker: i.ticker, mercado: i.mercado, nome: i.nome, tipo: i.tipo, aparece: i.aparece, ordem }); continue; }
    const m = {};
    if (!a || a.aparece !== i.aparece) m.aparece = i.aparece;
    if (!a || a.ordem !== ordem) m.ordem = ordem;
    if (Object.keys(m).length) atualizar.push({ id: i.linhaId, mudancas: m });
  }
  return { criar, atualizar, apagar };
}

// ------------------------------------------------------------ o pregão
// Aberto = dia de semana e dentro do horário regular, na hora da bolsa (B3: 10h às 18h de Brasília; Nova York: 9h30 às 16h),
// com 15 minutos de folga depois do fim (o preço de fechamento chega um pouco depois). Feriado não entra: no feriado a tela
// lê e o preço não muda.
const HORARIO = { B3: ['America/Sao_Paulo', 10 * 60, 18 * 60], EUA: ['America/New_York', 9 * 60 + 30, 16 * 60] };
export function horaNaBolsa(mercado, agora = Date.now()) {
  const [tz] = HORARIO[mercado] ?? HORARIO.B3;
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(new Date(agora)).map((x) => [x.type, x.value]));
  return { semana: p.weekday, minutos: Number(p.hour) * 60 + Number(p.minute), hhmm: `${p.hour}:${p.minute}` };
}
// o DIA de um instante (em segundos) no fuso da bolsa: 'AAAA-MM-DD'
export function diaNaBolsa(segundos, mercado) {
  const [tz] = HORARIO[mercado] ?? HORARIO.B3;
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(segundos * 1000));
}
// "hoje" quando a última cotação é do pregão de hoje; senão, "em dd/mm" (antes da abertura vale o pregão de antes)
export function quandoDoPregao(segundos, mercado, agora = Date.now()) {
  if (!segundos) return 'hoje';
  const d = diaNaBolsa(segundos, mercado);
  return d === diaNaBolsa(agora / 1000, mercado) ? 'hoje' : `em ${d.slice(8, 10)}/${d.slice(5, 7)}`;
}
export function pregaoAberto(mercado, agora = Date.now()) {
  const [, de, ate] = HORARIO[mercado] ?? HORARIO.B3;
  const h = horaNaBolsa(mercado, agora);
  if (h.semana === 'Sat' || h.semana === 'Sun') return false;
  return h.minutos >= de && h.minutos < ate + 15;
}

// ------------------------------------------------------------ os preços
// a variação de um item lido (o preço contra o anterior); null sem os dois
export function variacao(item) {
  if (!item || !(item.preco > 0) || !(item.anterior > 0)) return null;
  return item.preco / item.anterior - 1;
}
// JUNTA a leitura de agora (só os pontos depois do `desde`) com a de antes. Um dia novo (o 1º ponto novo em outro dia da
// bolsa que o último guardado) recomeça a curva.
export function juntarLeitura(antes, nova, diaDe = (t) => new Date(t * 1000).toISOString().slice(0, 10)) {
  if (!nova || nova.erro) return antes ?? nova ?? null;
  if (!antes || antes.erro || !antes.pontos?.length) return nova;
  const ultimo = antes.pontos[antes.pontos.length - 1][0];
  const novos = (nova.pontos ?? []).filter((p) => p[0] > ultimo);
  if (novos.length && diaDe(novos[0][0]) !== diaDe(ultimo)) return nova;
  return { ...antes, ...nova, pontos: [...antes.pontos, ...novos] };
}
// o `desde` de cada chave (o último ponto guardado) para a próxima leitura
export const desdeDe = (vivo) => Object.fromEntries(Object.entries(vivo ?? {}).filter(([, v]) => v?.pontos?.length).map(([k, v]) => [k, v.pontos[v.pontos.length - 1][0]]));

// O % DE CADA UM NO PERÍODO: "dia" pela leitura ao vivo; os outros pela série do período (o fechamento de antes dele) com o
// preço de agora no lugar do último.
export function variacoesDoPeriodo(chaves, periodo, vivo = {}, serie = {}) {
  const out = {};
  for (const k of chaves) {
    const v = vivo[k];
    if (periodo === 'dia') { out[k] = variacao(v); continue; }
    const s = serie[k];
    const base = s?.anterior ?? s?.pontos?.[0]?.[1] ?? null;
    const preco = v?.preco ?? s?.preco ?? null;
    out[k] = base > 0 && preco > 0 ? preco / base - 1 : null;
  }
  return out;
}

// AS MAIORES ALTAS E BAIXAS: as `n` de cada lado (sem o que não tem variação); `sobem`/`caem` contam todos
export function altasEBaixas(itens, n = 5) {
  const com = itens.filter((i) => i.p !== null && i.p !== undefined);
  const ord = com.slice().sort((a, b) => b.p - a.p);
  return {
    altas: ord.filter((i) => i.p > 0).slice(0, n),
    baixas: ord.filter((i) => i.p < 0).reverse().slice(0, n),
    sobem: com.filter((i) => i.p > 0).length, caem: com.filter((i) => i.p < 0).length,
  };
}

// O DESEMPENHO COMPARADO: cada série em % desde o primeiro ponto (todos partem do zero)
export function emPorcentoDoInicio(pontos) {
  const p0 = pontos?.find((p) => p[1] > 0)?.[1];
  if (!p0) return [];
  return pontos.filter((p) => p[1] > 0).map(([t, c]) => [t, c / p0 - 1]);
}
// a média simples de várias séries em % ("os seus, na média"), ponto a ponto pelo DIA: cada dia, a média dos que têm dado
export function mediaDasSeries(series, diaDe = (t) => new Date(t * 1000).toISOString().slice(0, 10)) {
  const porDia = new Map();
  for (const s of series) {
    const vistos = new Map();
    for (const [t, v] of s) vistos.set(diaDe(t), [t, v]); // o último ponto do dia
    for (const [d, [t, v]] of vistos) {
      const a = porDia.get(d) ?? { t, soma: 0, n: 0 };
      a.soma += v; a.n += 1; a.t = Math.max(a.t, t);
      porDia.set(d, a);
    }
  }
  return [...porDia.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([, a]) => [a.t, a.soma / a.n]);
}

// OS PRÓXIMOS EVENTOS SEM REPETIR: o calendário de resultados da Finnhub às vezes muda a data, e o evento é guardado por
// ativo, tipo e DATA — a data velha fica. Do mesmo ativo, ano e trimestre fiscal, vale o relido por último (`atualizado_em`).
export function eventosSemRepetir(eventos) {
  const melhor = new Map();
  for (const e of eventos) {
    if (e.tipo !== 'resultado' || !e.ano || !e.trimestre) continue;
    const k = `${e.ativo_id}|${e.ano}|${e.trimestre}`;
    const a = melhor.get(k);
    if (!a || String(e.atualizado_em ?? '') > String(a.atualizado_em ?? '')) melhor.set(k, e);
  }
  return eventos.filter((e) => e.tipo !== 'resultado' || !e.ano || !e.trimestre || melhor.get(`${e.ativo_id}|${e.ano}|${e.trimestre}`) === e);
}

// ------------------------------------------------------------ o mapa de calor
// A ESCALA DA COR segue o período (25/11/2026: com ±3% no mês, quase tudo saía no vermelho ou no verde mais forte): o dia
// vai até ±3%, a semana ±6%, o mês ±12%, o ano e os 12 meses ±30% — a ponta de cada uma é a cor mais forte.
export const ESCALAS = { dia: 0.03, semana: 0.06, mes: 0.12, ano: 0.3, '12m': 0.3 };
const rotuloPct = (v) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.round(Math.abs(v) * 1000) / 10}%`.replace('.', ',');
// A LEGENDA: sete faixas da escala (o terço dela de cada lado, as pontas abertas); `faixaDe` dá o índice da faixa de um %.
export function faixasDaEscala(m = 0.03) {
  const t = m / 3;
  return [-3, -2, -1, 0, 1, 2, 3].map((k) => ({
    de: k === -3 ? -Infinity : (k - 0.5) * t, ate: k === 3 ? Infinity : (k + 0.5) * t, rotulo: rotuloPct(k * t), meio: k * t,
  }));
}
export const FAIXAS = faixasDaEscala(0.03);
export const faixaDe = (p, m = 0.03) => (p === null || p === undefined ? -1 : faixasDaEscala(m).findIndex((f) => p >= f.de && p < f.ate));
// A COR (a mesma nos dois temas: o bloco é escuro, como os mapas de mercado): o neutro perto do zero, o verde e o vermelho
// mais fortes até a ponta da escala; sem variação, o cinza mais claro.
const NEUTRO = [62, 66, 75]; const VERDE = [24, 150, 82]; const VERMELHO = [205, 55, 58];
export function corDaVariacao(p, m = 0.03) {
  if (p === null || p === undefined) return 'rgb(92, 96, 104)';
  const c = Math.max(-m, Math.min(m, p));
  if (Math.abs(c) < m / 60) return `rgb(${NEUTRO.join(', ')})`;
  const alvo = c > 0 ? VERDE : VERMELHO;
  const k = 0.3 + 0.7 * (Math.abs(c) / m);
  return `rgb(${NEUTRO.map((n, i) => Math.round(n + (alvo[i] - n) * k)).join(', ')})`;
}

// O TAMANHO de cada quadrado: 'mercado' = a RAIZ do valor de mercado (sem a raiz, a Apple engole o resto); 'posicao' = o
// valor da posição em reais (quem não tem posição ganha um quadrado pequeno, um quarto da mediana); 'igual' = todos iguais.
// O que não tem o número do modo vai pela mediana dos outros.
export function tamanhos(itens, modo, { cap = {}, posicao = {} } = {}) {
  const bruto = itens.map((i) => (modo === 'mercado' ? (cap[i.chave] > 0 ? Math.sqrt(cap[i.chave]) : null)
    : modo === 'posicao' ? (posicao[i.chave] > 0 ? posicao[i.chave] : null) : 1));
  const com = bruto.filter((v) => v > 0).sort((a, b) => a - b);
  const mediana = com.length ? com[Math.floor(com.length / 2)] : 1;
  const falta = modo === 'posicao' ? mediana / 4 : mediana;
  return Object.fromEntries(itens.map((i, k) => [i.chave, bruto[k] > 0 ? bruto[k] : falta]));
}

// O TREEMAP "SQUARIFIED" (Bruls, Huizing e van Wijk): os itens ({ v > 0 }) do maior ao menor, em filas que deixam os
// retângulos o mais perto possível de quadrados, dentro de { x, y, w, h }. Volta os itens com x, y, w, h.
export function squarify(itens, { x, y, w, h }) {
  const lista = itens.filter((i) => i.v > 0).sort((a, b) => b.v - a.v);
  const tot = lista.reduce((s, i) => s + i.v, 0);
  if (!lista.length || w <= 0 || h <= 0) return [];
  const esc = (w * h) / tot;
  const out = [];
  let resto = lista; let rx = x; let ry = y; let rw = w; let rh = h;
  while (resto.length) {
    const lado = Math.min(rw, rh);
    const pior = (fila) => {
      const s = fila.reduce((a, b) => a + b.v * esc, 0);
      const mx = Math.max(...fila.map((q) => q.v * esc)); const mn = Math.min(...fila.map((q) => q.v * esc));
      return Math.max((lado * lado * mx) / (s * s), (s * s) / (lado * lado * mn));
    };
    const fila = [resto[0]]; let i = 1;
    while (i < resto.length && pior([...fila, resto[i]]) <= pior(fila)) { fila.push(resto[i]); i += 1; }
    const s = fila.reduce((a, b) => a + b.v * esc, 0);
    if (rw >= rh) {
      const cw = Math.min(rw, s / rh); let cy = ry;
      fila.forEach((q, k) => { const qh = k === fila.length - 1 ? ry + rh - cy : (q.v * esc) / cw; out.push({ ...q, x: rx, y: cy, w: cw, h: qh }); cy += qh; });
      rx += cw; rw -= cw;
    } else {
      const ch = Math.min(rh, s / rw); let cx = rx;
      fila.forEach((q, k) => { const qw = k === fila.length - 1 ? rx + rw - cx : (q.v * esc) / ch; out.push({ ...q, x: cx, y: ry, w: qw, h: ch }); cx += qw; });
      ry += ch; rh -= ch;
    }
    resto = resto.slice(i);
  }
  return out;
}

// AS ÁREAS DAS CLASSES no bloco: cada classe com itens ganha um pedaço proporcional à soma dos tamanhos, mas no mínimo
// `minimo` (uma fração) — senão o FII de R$ 100 some ao lado da Apple. Volta [{ classe, x, y, w, h }] pelo squarify.
export function areasDasClasses(somas, caixa, minimo = 0.12) {
  const ids = Object.keys(somas).filter((k) => somas[k] > 0);
  const tot = ids.reduce((s, k) => s + somas[k], 0);
  if (!tot) return [];
  let pesos = ids.map((k) => Math.max(somas[k] / tot, minimo));
  const t2 = pesos.reduce((a, b) => a + b, 0);
  pesos = pesos.map((p) => p / t2);
  return squarify(ids.map((k, i) => ({ classe: k, v: pesos[i] })), caixa).map(({ classe, x, y, w, h }) => ({ classe, x, y, w, h }));
}
