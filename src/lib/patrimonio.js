// O PATRIMÔNIO EM BLOCOS (09/11/2026, o mockup "Patrimônio · o grid de widgets"): as contas dos blocos da tela, puras e
// testadas em test/patrimonio.test.js, sobre a carteira de `lib/carteira.js` (`montarCarteira`, `mesAMes`) — o filtro
// da tela, o período dos gráficos de meses, os VENCIMENTOS (os próximos, pela conta, e o HISTÓRICO, com o que aconteceu),
// a linha do tempo deles, quando o dinheiro fica livre, o IR por alíquota e as próximas quedas, e cada investimento.
// Valores em centavos; datas 'AAAA-MM-DD'; competência 'AAAA-MM'.
import { calendario, diasEntre, maisDias, noVencimento, posicaoDoAporte, proximaQueda, sugerirVencimento } from './carteira.js';
import { addMeses, competenciaCurta } from './format.js';

const compDe = (iso) => iso.slice(0, 7);

// ------------------------------------------------------------ o filtro e o período
// O FILTRO DA TELA (instituição, tipo, investimento; vazio = todos): o cadastro que passa e os aportes e resgates dele.
export function filtrarCarteira({ cadastro = [], aportes = [], resgates = [] }, { insts = [], tipos = [], invs = [] } = {}) {
  if (!insts.length && !tipos.length && !invs.length) return { cadastro, aportes, resgates, filtrado: false };
  const cad = cadastro.filter((i) => (!insts.length || insts.includes(i.instituicao.trim()))
    && (!tipos.length || tipos.includes(i.tipo)) && (!invs.length || invs.includes(i.id)));
  const ids = new Set(cad.map((i) => i.id));
  const aps = aportes.filter((a) => ids.has(a.investimento_id));
  const apIds = new Set(aps.map((a) => a.id));
  return { cadastro: cad, aportes: aps, resgates: resgates.filter((r) => apIds.has(r.aporte_id)), filtrado: true };
}

// O PERÍODO DOS GRÁFICOS DE MESES: 'tudo' (desde o primeiro mês), '12m' (os 12 até o de hoje) ou um ano ('2026').
export function opcoesDePeriodo(meses) {
  const anos = [...new Set(meses.map((m) => m.competencia.slice(0, 4)))].sort().reverse();
  const desde = meses.length ? competenciaCurta(meses[0].competencia) : '';
  return [
    { value: 'tudo', label: 'Todo o histórico', chip: desde ? `Desde ${desde}` : 'Todo o histórico' },
    { value: '12m', label: '12 meses', chip: 'Últimos 12 meses' },
    ...anos.map((a) => ({ value: a, label: a })),
  ];
}
export function noPeriodo(meses, per) {
  if (per === '12m') return meses.slice(-12);
  if (/^\d{4}$/.test(per)) return meses.filter((m) => m.competencia.startsWith(per));
  return meses;
}
export const textoDoPeriodo = (meses) => (!meses.length ? '' : meses.length === 1 ? competenciaCurta(meses[0].competencia)
  : `${competenciaCurta(meses[0].competencia)} a ${competenciaCurta(meses[meses.length - 1].competencia)}`);

// ------------------------------------------------------------ os vencimentos
// OS PRÓXIMOS: cada aporte aberto com vencimento depois de hoje — o valor no dia pela conta (o CDI de hoje daqui para a
// frente, `calendario` até lá), o IR e o IOF pela idade, o líquido e o destino (volta para a conta, ou reaplica sozinho com
// o vencimento novo pelo cadastro). O HISTÓRICO: cada aporte que o vencimento encerrou — o valor do dia, o imposto, o
// líquido e para onde foi (o aporte novo, `seguinte`, quando reaplicou); nos 30 dias depois do vencimento ele fica PARA
// AVALIAR até ser marcado visto (`vencimento_visto`, migration 026 — sem a coluna, nada fica para avaliar).
// `itens`: os de `montarCarteira` ({ ap, inv, resgates, pos, seguinte }).
export const DIAS_PARA_AVALIAR = 30;
export function vencimentos({ itens = [], cdi = [], ipca = null, hoje }) {
  const abertos = itens.filter((x) => !x.pos.encerrado && x.ap.vencimento && x.ap.vencimento > hoje);
  const ate = abertos.reduce((m, x) => (x.ap.vencimento > m ? x.ap.vencimento : m), hoje);
  const cal = abertos.length ? calendario(cdi, maisDias(ate, 1), ipca) : [];
  const proximos = abertos.map((x) => {
    const v = noVencimento(x.inv, posicaoDoAporte(x.ap, x.inv, x.resgates ?? [], cal, x.ap.vencimento));
    const reaplica = x.inv.no_vencimento === 'reaplica' && !x.ap.nao_reaplicar;
    return {
      item: x, data: x.ap.vencimento, dias: diasEntre(hoje, x.ap.vencimento), valor: v?.valor ?? x.pos.vale,
      ir: v ? v.ir + v.iof : 0, liquido: v?.liquido ?? x.pos.vale, reaplica, novoVenc: reaplica ? sugerirVencimento(x.ap.vencimento, x.inv) : null,
    };
  }).sort((a, b) => (a.data < b.data ? -1 : a.data > b.data ? 1 : 0));
  const historico = itens.filter((x) => x.pos.encerrado?.motivo === 'vencimento').map((x) => {
    const v = noVencimento(x.inv, x.pos);
    const dias = diasEntre(x.pos.encerrado.data, hoje);
    return {
      item: x, data: x.pos.encerrado.data, dias, valor: v.valor, ir: v.ir + v.iof, liquido: v.liquido,
      seguinte: x.seguinte ?? null, conferir: !!x.seguinte?.conferir,
      avaliar: 'vencimento_visto' in x.ap && !x.ap.vencimento_visto && dias <= DIAS_PARA_AVALIAR,
    };
  }).sort((a, b) => (a.data < b.data ? 1 : a.data > b.data ? -1 : 0));
  return { proximos, historico };
}

// A LINHA DO TEMPO DOS VENCIMENTOS: de `antes` meses atrás até o último vencimento (pelo menos `minimo` meses à frente,
// no máximo `maximo` colunas), cada mês com o que já venceu, o que volta para a conta e o que reaplica (pelo valor do dia).
export function linhaDoTempoVencimentos({ proximos = [], historico = [] }, hoje, { antes = 3, minimo = 12, maximo = 30 } = {}) {
  const ini = addMeses(compDe(hoje), -antes);
  const ultimo = proximos.length ? compDe(proximos[proximos.length - 1].data) : compDe(hoje);
  let fim = ultimo > addMeses(compDe(hoje), minimo - 1) ? ultimo : addMeses(compDe(hoje), minimo - 1);
  if (fim > addMeses(ini, maximo - 1)) fim = addMeses(ini, maximo - 1);
  const meses = [];
  for (let c = ini; c <= fim; c = addMeses(c, 1)) {
    const prox = proximos.filter((p) => compDe(p.data) === c);
    const hist = historico.filter((h) => compDe(h.data) === c);
    meses.push({
      competencia: c, venceu: hist.reduce((s, h) => s + h.valor, 0),
      volta: prox.filter((p) => !p.reaplica).reduce((s, p) => s + p.valor, 0),
      reaplica: prox.filter((p) => p.reaplica).reduce((s, p) => s + p.valor, 0),
      quantos: prox.length + hist.length, hoje: c === compDe(hoje),
    });
  }
  return meses;
}

// ------------------------------------------------------------ quando o dinheiro fica livre
// O QUE DÁ PARA TIRAR ATÉ CADA DATA, somando: o que tem resgate a qualquer hora (hoje, pelo valor) e o que só sai no
// vencimento e volta para a conta (pelo líquido do dia). O que reaplica sozinho não fica livre. `abertos`: os itens
// abertos da carteira; `proximos`: os de `vencimentos`.
export const DEGRAUS_LIQUIDEZ = [['Hoje', 0], ['Em 30 dias', 30], ['Em 90 dias', 90], ['Em 6 meses', 182], ['Em 1 ano', 365]];
export function escadaDeLiquidez(abertos, proximos) {
  const livre = abertos.filter((x) => x.inv.resgate === 'diaria').reduce((s, x) => s + x.pos.vale, 0);
  const presos = proximos.filter((p) => p.item.inv.resgate !== 'diaria' && !p.reaplica);
  const degraus = DEGRAUS_LIQUIDEZ.map(([rotulo, dias]) => ({
    rotulo, dias, valor: livre + presos.filter((p) => p.dias <= dias).reduce((s, p) => s + p.liquido, 0),
  }));
  const depois = presos.filter((p) => p.dias > 365);
  if (depois.length) degraus.push({ rotulo: 'Quando tudo vencer', dias: depois[depois.length - 1].dias, valor: livre + presos.reduce((s, p) => s + p.liquido, 0) });
  return degraus;
}

// ------------------------------------------------------------ o IR
// O PATRIMÔNIO POR ALÍQUOTA (o valor de hoje e o imposto se resgatasse tudo; a isenta é a alíquota 0), da maior à menor.
export function irPorAliquota(abertos) {
  const m = new Map();
  abertos.forEach((x) => {
    const a = x.pos.aliquota ?? 0;
    const g = m.get(a) ?? { aliquota: a, vale: 0, ir: 0, aportes: 0 };
    g.vale += x.pos.vale; g.ir += x.pos.ir + x.pos.iof; g.aportes += 1;
    m.set(a, g);
  });
  return [...m.values()].sort((a, b) => b.aliquota - a.aliquota);
}
// AS PRÓXIMAS QUEDAS DO IR: cada aporte que ainda vai para uma alíquota menor, na data em que cai, com quanto de imposto
// isso tira sobre o que JÁ rendeu (a economia cresce até a data). O isento, o sem data e o que não rendeu ficam de fora.
export function proximasQuedas(abertos, hoje, n = 6) {
  return abertos.filter((x) => x.pos.aliquota > 0 && !x.pos.semData && x.pos.rendeu > 0)
    .map((x) => {
      const q = proximaQueda(x.pos.partida.desdeIR, hoje);
      return q && { data: q.data, item: x, de: x.pos.aliquota, para: q.para, economia: Math.round((x.pos.rendeu - x.pos.iof) * (x.pos.aliquota - q.para)) };
    })
    .filter(Boolean)
    .sort((a, b) => (a.data < b.data ? -1 : a.data > b.data ? 1 : b.economia - a.economia))
    .slice(0, n);
}

// ------------------------------------------------------------ cada investimento
// UMA LINHA POR INVESTIMENTO: os aportes abertos somados, o peso no total, o próximo vencimento e quanto rende AO ANO
// (a taxa equivalente: o vale ÷ o aplicado, pela idade média do dinheiro — o aplicado de cada aporte pesando a idade dele;
// abaixo de um mês, sem número).
export function porInvestimento(abertos, proximos, hoje) {
  const total = abertos.reduce((s, x) => s + x.pos.vale, 0);
  const m = new Map();
  abertos.forEach((x) => {
    const g = m.get(x.inv.id) ?? { inv: x.inv, aportes: 0, aplicado: 0, vale: 0, rendeu: 0, ir: 0, idadePeso: 0 };
    g.aportes += 1; g.aplicado += x.pos.aplicado; g.vale += x.pos.vale; g.rendeu += x.pos.rendeu; g.ir += x.pos.ir + x.pos.iof;
    g.idadePeso += x.pos.aplicado * Math.max(0, diasEntre(x.pos.partida.desdeIR ?? x.pos.partida.data, hoje));
    m.set(x.inv.id, g);
  });
  return [...m.values()].map((g) => {
    const anos = g.aplicado > 0 ? g.idadePeso / g.aplicado / 365 : 0;
    const prox = proximos.find((p) => p.item.inv.id === g.inv.id);
    return {
      ...g, peso: total ? g.vale / total : 0, proximoVencimento: prox?.data ?? null,
      aoAno: anos >= 1 / 12 && g.aplicado > 0 ? (g.vale / g.aplicado) ** (1 / anos) - 1 : null,
    };
  });
}
