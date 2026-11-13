// AS CONTAS DO GRÁFICO DO ATIVO (13/11/2026, o mockup "O gráfico do ativo", a aba Meu gráfico): o período, as velas por dia,
// semana ou mês, a escala do preço, o PREÇO MÉDIO AO LONGO DO TEMPO (em degraus, na base de cotas de hoje) e onde cada
// operação cai no gráfico. Puras, testadas em `test/graficoAtivo.test.js`; o desenho mora em
// `components/rendaVariavel/GraficoAtivo.jsx`.
//
// Os preços vêm de `rv_fechamentos` (o Yahoo pela função `cotacoes`, o histórico; o agendamento, o dia de hoje). O Yahoo
// ajusta o passado aos DESDOBRAMENTOS (o preço de antes dividido pelo fator), então o preço médio também vai na base de
// hoje: o de antes de um desdobramento é dividido pelos fatores que vieram depois.

const num = (v) => (v === null || v === undefined || v === '' ? null : Number(v));
const porData = (a, b) => (a.data < b.data ? -1 : a.data > b.data ? 1 : String(a.criado_em ?? '').localeCompare(String(b.criado_em ?? '')));

// OS PERÍODOS são as células da FAIXA DE DESEMPENHO (13/11/2026, a opção B do mockup "Desempenho, volume, dividendos e
// resultados": a faixa É o período — cada célula diz quanto o ativo andou nele e, clicada, troca o gráfico). O "Desde o
// início" desenha um ponto por mês desde a estreia na bolsa (lido na hora); o 1 dia, o pregão de hoje de 5 em 5 minutos.
export const PERIODOS = [
  { key: '1D', rotulo: '1 dia', nome: 'hoje' },
  { key: '1S', rotulo: '1 semana', dias: 7, nome: 'em 1 semana' },
  { key: '1M', rotulo: '1 mês', meses: 1, nome: 'em 1 mês' },
  { key: '3M', rotulo: '3 meses', meses: 3, nome: 'em 3 meses' },
  { key: '6M', rotulo: '6 meses', meses: 6, nome: 'em 6 meses' },
  { key: '1A', rotulo: '1 ano', meses: 12, nome: 'em 1 ano' },
  { key: '5A', rotulo: '5 anos', meses: 60, nome: 'em 5 anos' },
  { key: 'tudo', rotulo: 'Desde o início', nome: 'desde a estreia' },
];

// o primeiro dia do período ('AAAA-MM-DD'), ou null no "Desde o início" (e no 1D, que não lê os fechamentos)
export function inicioDoPeriodo(per, hoje) {
  if (per === 'YTD') return `${hoje.slice(0, 4)}-01-01`;
  const p = PERIODOS.find((x) => x.key === per);
  if (p?.dias) return new Date(Date.parse(`${hoje}T12:00:00Z`) - p.dias * 86400000).toISOString().slice(0, 10);
  if (!p?.meses) return null;
  const [a, m, d] = hoje.split('-').map(Number);
  const alvo = new Date(Date.UTC(a, m - 1 - p.meses, 1));
  const ultimoDia = new Date(Date.UTC(alvo.getUTCFullYear(), alvo.getUTCMonth() + 1, 0)).getUTCDate();
  alvo.setUTCDate(Math.min(d, ultimoDia));
  return alvo.toISOString().slice(0, 10);
}

// as linhas de `rv_fechamentos` em velas; sem a abertura, a máxima e a mínima (antes da migration 030, ou o dia que só o
// agendamento leu), a vela é o fechamento
export function velasDeFechamentos(linhas) {
  return (linhas ?? []).map((r) => {
    const c = Number(r.preco);
    const o = num(r.abertura) ?? c;
    return { d: r.data, o, h: Math.max(num(r.maxima) ?? c, o, c), l: Math.min(num(r.minima) ?? c, o, c), c, v: num(r.volume) };
  }).filter((x) => x.c > 0);
}

// junta os dias por semana (a segunda é o começo) ou por mês: a abertura do primeiro, o fechamento do último, a máxima e a
// mínima de todos. `d0` é o primeiro dia do grupo e `d` o último (o balão e as marcas das operações usam os dois).
const semanaDe = (d) => Math.floor((Date.parse(`${d}T00:00:00Z`) / 86400000 + 3) / 7);
export function agrupar(velas, modo) {
  const chave = modo === 'mes' ? (d) => d.slice(0, 7) : semanaDe;
  const out = [];
  let atual = null;
  velas.forEach((x) => {
    const k = chave(x.d);
    if (!atual || atual.k !== k) {
      atual = { k, d0: x.d, d: x.d, o: x.o, h: x.h, l: x.l, c: x.c, v: x.v };
      out.push(atual);
    } else {
      atual.d = x.d; atual.c = x.c; atual.h = Math.max(atual.h, x.h); atual.l = Math.min(atual.l, x.l);
      atual.v = x.v === null || atual.v === null ? null : atual.v + x.v;
    }
  });
  return out.map(({ k: _k, ...r }) => r);
}

// o que vai ao desenho: a LINHA usa todos os dias; as VELAS, que somem abaixo de ~2px, viram semanais acima de 300 dias e
// mensais acima de 400 semanas
export function paraDesenho(velas, tipo) {
  if (tipo !== 'velas' || velas.length <= 300) return { pontos: velas.map((x) => ({ ...x, d0: x.d })), grupo: 'dia' };
  const sem = agrupar(velas, 'semana');
  if (sem.length <= 400) return { pontos: sem, grupo: 'semana' };
  return { pontos: agrupar(velas, 'mes'), grupo: 'mes' };
}

// a escala do PREÇO, como nos sites de investimento: não começa no zero e vai do menor ao maior com um respiro de 6% (a
// curva ocupa a altura); as MARCAS são os números redondos (1, 2, 2,5, 5 × 10ⁿ) que caem dentro
const PASSOS = [1, 2, 2.5, 5, 10];
export function escalaPreco(min, max, alvo = 5) {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return { lo: 0, hi: 1, passo: 1, marcas: [0, 1], fracao: (v) => v };
  const folga = (max - min) * 0.06 || Math.abs(max) * 0.01 || 1;
  const a = min - folga; const b = max + folga;
  const bruto = (b - a) / alvo;
  const base = 10 ** Math.floor(Math.log10(bruto));
  const passo = PASSOS.find((p) => p * base >= bruto - 1e-12) * base;
  const marcas = [];
  for (let k = Math.ceil(a / passo); k * passo <= b + 1e-9; k += 1) marcas.push(Number((k * passo).toFixed(10)));
  return { lo: a, hi: b, passo, marcas, fracao: (v) => (v - a) / (b - a) };
}

// O PREÇO MÉDIO AO LONGO DO TEMPO: um degrau a cada operação que o muda ({ d, pm, pmReais, qtd }; pm na moeda do ativo,
// pmReais pelo dólar de cada compra, como em `posicaoDoAtivo`). Sem cotas, pm = null (o degrau some). O de antes de um
// desdobramento vai dividido pelo fator, para ficar na escala do preço ajustado.
export function historicoDoPrecoMedio(ativo, operacoes) {
  const usd = ativo?.moeda === 'USD';
  const ops = operacoes.filter((o) => o.ativo_id === ativo.id).sort(porData);
  let qtd = 0; let custo = 0; let custoReais = 0;
  const degraus = [];
  ops.forEach((op) => {
    const cambio = usd ? num(op.dolar) ?? 0 : 1;
    if (op.tipo === 'compra') {
      const bruto = Number(op.valor_centavos) + Number(op.taxas_centavos ?? 0);
      qtd += Number(op.quantidade); custo += bruto; custoReais += bruto * cambio;
    } else if (op.tipo === 'venda') {
      const q = Math.min(Number(op.quantidade), qtd);
      const f = qtd > 0 ? q / qtd : 0;
      custo -= custo * f; custoReais -= custoReais * f; qtd -= q;
      if (qtd < 1e-9) { qtd = 0; custo = 0; custoReais = 0; }
    } else if (op.tipo === 'desdobramento' || op.tipo === 'grupamento') {
      qtd *= Number(op.fator);
    } else return;
    const pm = qtd > 0 ? custo / qtd / 100 : null;
    const pmReais = qtd > 0 ? custoReais / qtd / 100 : null;
    if (degraus.length && degraus[degraus.length - 1].d === op.data) degraus.pop(); // duas no mesmo dia: vale a última
    degraus.push({ d: op.data, pm, pmReais, qtd, op });
  });
  // a base de hoje: dividir pelos fatores dos desdobramentos que vieram DEPOIS de cada degrau
  const fatores = ops.filter((o) => o.tipo === 'desdobramento' || o.tipo === 'grupamento');
  return degraus.map(({ op, ...g }) => {
    const f = fatores.filter((s) => porData(s, op) > 0).reduce((t, s) => t * Number(s.fator), 1);
    return { ...g, pm: g.pm === null ? null : g.pm / f, pmReais: g.pmReais === null ? null : g.pmReais / f };
  });
}
// o preço médio que valia no fim do dia `d` (null antes da primeira compra ou sem cotas)
export function precoMedioEm(degraus, d, emReais = false) {
  let v = null;
  for (const g of degraus) { if (g.d > d) break; v = emReais ? g.pmReais : g.pm; }
  return v;
}

// ONDE CADA OPERAÇÃO CAI: o ponto que contém a data dela (de `d0` a `d`); a do dia sem pregão (o provento do sábado) vai
// ao ponto seguinte; a de depois do último ponto (o provento anunciado) fica de fora
export function marcasNoPeriodo(operacoes, pontos) {
  if (!pontos.length) return [];
  const marcas = [];
  operacoes.forEach((op) => {
    if (op.data < pontos[0].d0 || op.data > pontos[pontos.length - 1].d) return;
    const j = pontos.findIndex((p) => op.data <= p.d);
    if (j >= 0) marcas.push({ j, op });
  });
  return marcas;
}

// os candidatos a rótulo do eixo X (quem desenha tira os que se encostam): até 30 pontos, o dia; no 5A e no Tudo, a virada
// do ano; senão, a virada do mês (janeiro com o ano)
const MES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
export function rotulosX(pontos, per) {
  const n = pontos.length;
  const out = [];
  const anos = per === '5A' || per === 'tudo';
  for (let j = 0; j < n; j += 1) {
    const d = pontos[j].d0 ?? pontos[j].d;
    const ant = j ? pontos[j - 1].d : null;
    const mes = MES[Number(d.slice(5, 7)) - 1];
    if (n <= 30 && !anos) { if (j % Math.max(1, Math.ceil(n / 6)) === 0) out.push({ j, texto: `${Number(d.slice(8, 10))} ${mes}` }); }
    else if (anos) { if (ant && ant.slice(0, 4) !== d.slice(0, 4)) out.push({ j, texto: d.slice(0, 4) }); }
    else if (ant && ant.slice(0, 7) !== d.slice(0, 7)) out.push({ j, texto: d.slice(5, 7) === '01' ? `${mes} ${d.slice(2, 4)}` : mes });
  }
  return out;
}

// O HISTÓRICO QUE FALTA: 'inteiro' (quase nada guardado: o ativo novo, ou antes do primeiro pedido), 'recente' (o último
// guardado tem mais de 5 dias: o agendamento falhou ou o ativo ficou desligado) ou null
export function historicoQueFalta(linhas, hoje) {
  if (!linhas?.length || linhas.length < 150) return 'inteiro';
  const ultimo = linhas[linhas.length - 1].data;
  const dias = (Date.parse(`${hoje}T00:00:00Z`) - Date.parse(`${ultimo}T00:00:00Z`)) / 86400000;
  return dias > 5 ? 'recente' : null;
}

// o dólar do dia `d` numa série PTAX [[data, valor]] (o último até ele; antes do primeiro, o primeiro)
export function dolarEm(ptax, d) {
  if (!ptax?.length) return null;
  let lo = 0; let hi = ptax.length - 1;
  if (d < ptax[0][0]) return ptax[0][1];
  while (lo < hi) { const m = (lo + hi + 1) >> 1; if (ptax[m][0] <= d) lo = m; else hi = m - 1; }
  return ptax[lo][1];
}

// ------------------------------------------------------------ a faixa de desempenho e os eventos (migration 031)

// QUANTO O ATIVO ANDOU EM CADA PERÍODO da faixa: o preço de agora contra o último fechamento ATÉ o primeiro dia do período (o
// do pregão antes, se o dia não teve). O 1 dia é contra o fechamento anterior; o "Desde o início", contra a estreia na bolsa
// (o evento 'estreia'). Sem histórico até o começo do período (o ativo é mais novo, ou o Yahoo não trouxe), null ("—").
export function desempenho({ velas, preco = null, anterior = null, estreia = null, hoje }) {
  const agora = preco ?? velas[velas.length - 1]?.c ?? null;
  const out = {};
  PERIODOS.forEach((p) => {
    if (!agora) { out[p.key] = null; return; }
    if (p.key === '1D') {
      const ant = anterior ?? (velas.length > 1 ? (velas[velas.length - 1].d >= hoje ? velas[velas.length - 2].c : velas[velas.length - 1].c) : null);
      out[p.key] = ant ? agora / ant - 1 : null;
      return;
    }
    if (p.key === 'tudo') { out[p.key] = estreia ? agora / estreia - 1 : null; return; }
    const de = inicioDoPeriodo(p.key, hoje);
    let base = null;
    for (const v of velas) { if (v.d > de) break; base = v.c; }
    out[p.key] = base ? agora / base - 1 : null;
  });
  return out;
}

// OS EVENTOS NO GRÁFICO: o dividendo (a data-ex), o desdobramento e o resultado com a data da divulgação (o 'periodo', o fim
// do trimestre que veio sem a data, fica de fora), cada um no ponto que contém a data — como as operações
export function eventosNoPeriodo(eventos, pontos) {
  const doGrafico = (eventos ?? []).filter((e) => (e.tipo === 'dividendo' || e.tipo === 'desdobramento' || e.tipo === 'resultado') && e.hora !== 'periodo');
  return marcasNoPeriodo(doGrafico.map((e) => ({ ...e, id: `${e.tipo}:${e.data}` })), pontos).map(({ j, op }) => ({ j, ev: op }));
}
// o próximo resultado (a data de hoje em diante, ainda sem o divulgado)
export function proximoResultado(eventos, hoje) {
  return (eventos ?? []).filter((e) => e.tipo === 'resultado' && e.hora !== 'periodo' && e.data >= hoje && num(e.valor) === null)
    .sort((a, b) => (a.data < b.data ? -1 : 1))[0] ?? null;
}
// os últimos resultados divulgados, o mais novo primeiro: um por trimestre fiscal (o com a data da divulgação vale sobre o
// do fim do trimestre)
export function ultimosResultados(eventos, n = 4) {
  const porTri = new Map();
  (eventos ?? []).filter((e) => e.tipo === 'resultado' && num(e.valor) !== null).forEach((e) => {
    const k = e.ano && e.trimestre ? `${e.ano}-${e.trimestre}` : e.data;
    const ja = porTri.get(k);
    if (!ja || (ja.hora === 'periodo' && e.hora !== 'periodo')) porTri.set(k, e);
  });
  return [...porTri.values()].sort((a, b) => ((a.ano ?? 0) - (b.ano ?? 0)) || ((a.trimestre ?? 0) - (b.trimestre ?? 0)) || (a.data < b.data ? -1 : 1)).reverse().slice(0, n);
}
// os dividendos: o último, a soma dos 12 meses até hoje (por ação) e o rendimento sobre o preço de agora
export function resumoDosDividendos(eventos, hoje, preco) {
  const divs = (eventos ?? []).filter((e) => e.tipo === 'dividendo' && e.data <= hoje).sort((a, b) => (a.data < b.data ? -1 : 1));
  if (!divs.length) return null;
  const desde = inicioDoPeriodo('1A', hoje);
  const em12 = divs.filter((e) => e.data > desde).reduce((s, e) => s + Number(e.valor), 0);
  return { ultimo: divs[divs.length - 1], em12, rendimento: preco && em12 ? em12 / preco : null, quantos12: divs.filter((e) => e.data > desde).length };
}
// AS COTAS NA DATA-EX: quem tinha a ação no fim do pregão ANTERIOR recebe — o `qtd` do último degrau antes do dia
export function cotasAntesDe(degraus, d) {
  let q = 0;
  for (const g of degraus) { if (g.d >= d) break; q = g.qtd; }
  return q;
}
// O DESDOBRAMENTO QUE FALTA LANÇAR: o da empresa (Yahoo) depois da primeira compra, sem um desdobramento ou grupamento seu a
// até 10 dias dele — sem lançar, a quantidade de cotas do app fica errada
export function desdobramentosSemOperacao(eventos, operacoes) {
  const compras = operacoes.filter((o) => o.tipo === 'compra').map((o) => o.data).sort();
  if (!compras.length) return [];
  const dias = (a, b) => Math.abs(Date.parse(`${a}T12:00:00Z`) - Date.parse(`${b}T12:00:00Z`)) / 86400000;
  return (eventos ?? []).filter((e) => e.tipo === 'desdobramento' && e.data > compras[0]
    && !operacoes.some((o) => (o.tipo === 'desdobramento' || o.tipo === 'grupamento') && dias(o.data, e.data) <= 10));
}
