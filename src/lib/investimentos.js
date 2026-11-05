import { addMeses } from './format.js';

// OS INVESTIMENTOS (05/11/2026, fase 8.B do plano "Patrimônio e rentabilidade"; migration 014): cada título (o CDB, a
// LCI, o Tesouro…) cadastrado dentro de uma conta. Aqui, as contas puras (test/investimentos.test.js): os nomes do que
// foi contratado, a liquidez, o vencimento e a CARTEIRA — a tabela do Patrimônio, agrupada por conta — e o MÊS A MÊS.
// O rendimento de cada um sai do `rendimentoDasSeries` (lib/patrimonio.js), série `i:<id>`; a conta sem título é a
// série `c:<id>`. Nada aqui calcula imposto: o tipo só diz se é isento e quem garante.

// ------------------------------------------------------------ o cadastro
export const TIPOS_INVESTIMENTO = [
  { value: 'cdb', label: 'CDB', garantia: 'FGC' },
  { value: 'lci', label: 'LCI', isento: true, garantia: 'FGC' },
  { value: 'lca', label: 'LCA', isento: true, garantia: 'FGC' },
  { value: 'rdb', label: 'RDB / caixinha', garantia: 'FGC' },
  { value: 'tesouro_selic', label: 'Tesouro Selic', garantia: 'Tesouro Nacional' },
  { value: 'tesouro_ipca', label: 'Tesouro IPCA+', garantia: 'Tesouro Nacional' },
  { value: 'tesouro_prefixado', label: 'Tesouro prefixado', garantia: 'Tesouro Nacional' },
  { value: 'debenture', label: 'Debênture' },
  { value: 'cri_cra', label: 'CRI / CRA', isento: true },
  { value: 'fundo', label: 'Fundo', ir: 'IR do fundo' },
  { value: 'poupanca', label: 'Poupança', isento: true, garantia: 'FGC' },
  { value: 'outro', label: 'Outro' },
];
export const INDEXADORES = [
  { value: '', label: 'Não informado' },
  { value: 'cdi_pct', label: '% do CDI' },
  { value: 'cdi_mais', label: 'CDI + taxa' },
  { value: 'ipca_mais', label: 'IPCA + taxa' },
  { value: 'prefixado', label: 'Prefixado' },
  { value: 'selic_mais', label: 'Selic + taxa' },
];
export const LIQUIDEZ = [
  { value: 'diaria', label: 'Diária' },
  { value: 'vencimento', label: 'No vencimento' },
  { value: 'dias', label: 'Em alguns dias (D+N)' },
  { value: 'carencia', label: 'Carência até uma data' },
];

const tipoDe = (t) => TIPOS_INVESTIMENTO.find((x) => x.value === t) ?? TIPOS_INVESTIMENTO[TIPOS_INVESTIMENTO.length - 1];
export const nomeTipoInvestimento = (t) => tipoDe(t).label;

// "Isento de IR · FGC", "IR regressivo · Tesouro Nacional", "IR do fundo" — o que o tipo diz.
export function impostoGarantia(tipo) {
  const t = tipoDe(tipo);
  if (t.value === 'outro') return '';
  return [t.isento ? 'Isento de IR' : t.ir ?? 'IR regressivo', t.garantia ?? 'sem FGC'].join(' · ');
}

const num = (v, casas = 2) => Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: casas });
// O que foi contratado: "100% do CDI", "CDI + 1,5%", "IPCA + 6,8%", "13,2% ao ano", "Selic + 0,1%". '' sem o indexador.
export function rotuloRende({ indexador, taxa }) {
  const temTaxa = taxa !== null && taxa !== undefined && taxa !== '';
  switch (indexador) {
    case 'cdi_pct': return temTaxa ? `${num(taxa)}% do CDI` : '% do CDI';
    case 'cdi_mais': return temTaxa ? `CDI + ${num(taxa)}%` : 'CDI + taxa';
    case 'ipca_mais': return temTaxa ? `IPCA + ${num(taxa)}%` : 'IPCA + taxa';
    case 'prefixado': return temTaxa ? `${num(taxa)}% ao ano` : 'prefixado';
    case 'selic_mais': return temTaxa ? `Selic + ${num(taxa)}%` : 'Selic';
    default: return '';
  }
}

const mesAno = (iso) => `${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
// "diária", "no vencimento", "D+30", "carência até 03/2027".
export function rotuloLiquidez({ liquidez, liquidez_dias: dias, carencia_ate: ate }) {
  if (liquidez === 'vencimento') return 'no vencimento';
  if (liquidez === 'dias') return dias ? `D+${dias}` : 'em alguns dias';
  if (liquidez === 'carencia') return ate ? `carência até ${mesAno(ate)}` : 'com carência';
  return 'diária';
}
// Dá para resgatar hoje (a diária, e a de carência que já passou).
export const liquidezDiaria = (inv, hoje) => inv.liquidez === 'diaria' || (inv.liquidez === 'carencia' && !!inv.carencia_ate && inv.carencia_ate <= hoje);

const diasEntre = (a, b) => Math.round((Date.UTC(+b.slice(0, 4), +b.slice(5, 7) - 1, +b.slice(8, 10)) - Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10))) / 86400000);
// O VENCIMENTO de hoje: { dias, meses, vencido, perto (até 12 meses), frac (o tempo que já passou, de `inicio` ao
// vencimento; null sem início) } — null sem vencimento.
export function vencimentoInfo(vencimento, hoje, inicio) {
  if (!vencimento) return null;
  const dias = diasEntre(hoje, vencimento);
  const meses = (Number(vencimento.slice(0, 4)) - Number(hoje.slice(0, 4))) * 12 + Number(vencimento.slice(5, 7)) - Number(hoje.slice(5, 7));
  let frac = null;
  if (inicio && inicio < vencimento) frac = Math.min(1, Math.max(0, diasEntre(inicio, hoje) / diasEntre(inicio, vencimento)));
  return { dias, meses, vencido: dias < 0, perto: dias >= 0 && meses <= 12, frac };
}

// ------------------------------------------------------------ a carteira (a tabela A do Patrimônio)
// `meses`: o `rendimentoDasSeries` até o mês de hoje. Por conta (na ordem de `contas`), os títulos dela com o que vale
// hoje (a última foto + o aportado depois dela), o aplicado (o início + aportes − resgates), o que rendeu desde o
// cadastro, o % do ano (os meses encadeados), a curva dos últimos 12 meses e o vencimento. A conta sem título é uma
// linha só (a série dela). `encerrados`: mostrar os desativados (o resgate de tudo). Os totais somam o que aparece.
export function carteira({ contas, investimentos = [], meses, hoje, ano = hoje.slice(0, 4), encerrados = false }) {
  const ult = meses[meses.length - 1];
  const doAno = meses.filter((m) => m.competencia.startsWith(ano));
  const ultimos12 = meses.slice(-12);
  const linhaDaSerie = (id) => {
    const s = ult?.porSerie[id];
    if (!s) return null;
    const ps = doAno.map((m) => m.porSerie[id]?.pct).filter((p) => p !== null && p !== undefined);
    const curva = ultimos12.filter((m) => m.porSerie[id]?.presente).map((m) => ({ competencia: m.competencia, valor: m.porSerie[id].saldo, rendeu: m.porSerie[id].rendeu, pct: m.porSerie[id].pct }));
    const rendeu = s.saldo - s.aportado;
    return {
      vale: s.saldo, foto: s.foto, data: s.data, aplicado: s.aportado, rendeu, pct: s.aportado > 0 ? rendeu / s.aportado : null,
      pctAno: ps.length ? ps.reduce((f, p) => f * (1 + p), 1) - 1 : null, curva,
      mes: s.rendeu === null ? null : { rendeu: s.rendeu, pct: s.pct, competencia: ult.competencia },
    };
  };
  const ultMesCom = (id) => [...meses].reverse().find((m) => m.porSerie[id]?.rendeu !== null && m.porSerie[id]?.rendeu !== undefined);
  return contas.map((c) => {
    const dela = investimentos.filter((i) => i.conta_id === c.id);
    const itens = dela.filter((i) => encerrados || i.ativo !== false).map((inv) => {
      const l = linhaDaSerie(`i:${inv.id}`);
      const ref = ultMesCom(`i:${inv.id}`);
      // o começo da barrinha do prazo: a data da aplicação, ou o mês da primeira foto
      const primeiro = meses.find((m) => m.porSerie[`i:${inv.id}`]);
      const inicio = inv.aplicado_em || (primeiro ? `${primeiro.competencia}-01` : null);
      return {
        inv, ...(l ?? { vale: 0, foto: 0, data: null, aplicado: 0, rendeu: 0, pct: null, pctAno: null, curva: [], mes: null }),
        semValor: !l, ultimoMes: ref ? { competencia: ref.competencia, ...ref.porSerie[`i:${inv.id}`] } : null,
        venc: vencimentoInfo(inv.vencimento, hoje, inicio), diaria: liquidezDiaria(inv, hoje),
      };
    });
    const soma = (k) => itens.reduce((s, x) => s + (x[k] ?? 0), 0);
    if (!dela.length) {
      const l = linhaDaSerie(`c:${c.id}`);
      return { conta: c, itens, soConta: true, vale: l?.vale ?? 0, aplicado: l?.aplicado ?? 0, rendeu: l?.rendeu ?? 0, pct: l?.pct ?? null, pctAno: l?.pctAno ?? null, curva: l?.curva ?? [], data: l?.data ?? null, encerradosOcultos: 0 };
    }
    const aplicado = soma('aplicado');
    const rendeu = soma('rendeu');
    const curvaConta = ultimos12.filter((m) => m.porConta[c.id]).map((m) => ({ competencia: m.competencia, valor: m.porConta[c.id].saldo }));
    const psConta = doAno.map((m) => m.porConta[c.id]?.pct).filter((p) => p !== null && p !== undefined);
    return {
      conta: c, itens, soConta: false, vale: soma('vale'), aplicado, rendeu, pct: aplicado > 0 ? rendeu / aplicado : null,
      pctAno: psConta.length ? psConta.reduce((f, p) => f * (1 + p), 1) - 1 : null, curva: curvaConta,
      encerradosOcultos: encerrados ? 0 : dela.filter((i) => i.ativo === false).length,
    };
  });
}

// A ORDEM DENTRO DE CADA CONTA pela seta do cabeçalho (a dos Lançamentos: 1ª vez ordena, 2ª inverte, 3ª volta).
// `ordem`: { col, dir } ou null. Texto e vencimento começam do menor; os números, do maior.
export const COLUNAS_TEXTO = ['nome', 'liquidez', 'vence'];
const chaves = {
  nome: (x) => x.inv.nome.toLocaleLowerCase('pt-BR'),
  liquidez: (x) => (x.diaria ? 0 : x.inv.liquidez === 'dias' ? 1 : x.inv.liquidez === 'carencia' ? 2 : 3),
  vence: (x) => x.inv.vencimento ?? '9999-12-31',
  aplicado: (x) => x.aplicado,
  vale: (x) => x.vale,
  rendeu: (x) => x.rendeu,
  ano: (x) => x.pctAno ?? -Infinity,
};
export function ordenarCarteira(grupos, ordem) {
  if (!ordem || !chaves[ordem.col]) return grupos;
  const k = chaves[ordem.col];
  const s = ordem.dir === 'asc' ? 1 : -1;
  return grupos.map((g) => ({
    ...g,
    itens: [...g.itens].sort((a, b) => {
      const x = k(a); const y = k(b);
      return (typeof x === 'string' ? x.localeCompare(y, 'pt-BR') : x - y) * s;
    }),
  }));
}
export function proximaOrdemCarteira(atual, col) {
  const prim = COLUNAS_TEXTO.includes(col) ? 'asc' : 'desc';
  const seg = prim === 'asc' ? 'desc' : 'asc';
  if (!atual || atual.col !== col) return { col, dir: prim };
  if (atual.dir === prim) return { col, dir: seg };
  return null;
}

// ------------------------------------------------------------ o mês a mês (a vista B)
// Os meses que a tabela mostra: os 12 que terminam em `ate`, a partir do primeiro com dado.
export function mesesDaGrade(meses, ate) {
  const desde = addMeses(ate, -11);
  return meses.map((m) => m.competencia).filter((c) => c >= desde && c <= ate);
}
// Uma linha (conta ou título) no mês a mês: o que rendeu e o % de cada mês, o total, o % do período (encadeado) e a
// média (pelos meses que têm o que dizer).
export function linhaMesAMes(meses, comps, ler) {
  const porMes = {};
  let total = 0; let fator = 1; let n = 0;
  comps.forEach((c) => {
    const m = meses.find((x) => x.competencia === c);
    const l = m ? ler(m) : null;
    if (!l || l.rendeu === null || l.rendeu === undefined) { porMes[c] = null; return; }
    porMes[c] = { rendeu: l.rendeu, pct: l.pct, saldo: l.saldo, aportes: l.aportes, resgates: l.resgates };
    total += l.rendeu; n += 1;
    if (l.pct !== null && l.pct !== undefined) fator *= 1 + l.pct;
  });
  return { porMes, total: n ? total : null, pct: n ? fator - 1 : null, media: n ? total / n : null, mediaPct: n ? (fator ** (1 / n)) - 1 : null, meses: n };
}
