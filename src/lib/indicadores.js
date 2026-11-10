// AS CONTAS DOS INDICADORES (06/11/2026, o mockup aprovado "Indicadores e importações", opção A). Funções puras
// (test/indicadores.test.js). As séries chegam como [['AAAA-MM-DD', número]], o número como o Banco Central publica: a
// Selic, o CDI e o IPCA em % (13,75 = 13,75%), o dólar e o euro em R$.

export const ultimo = (s) => (s?.length ? s[s.length - 1] : null);

// As MUDANÇAS de uma série em degraus (a Selic meta): [{ data, valor }] — o primeiro ponto e cada troca de valor.
export function degraus(s) {
  const out = [];
  (s ?? []).forEach(([d, v]) => { if (!out.length || out[out.length - 1].valor !== v) out.push({ data: d, valor: v }); });
  return out;
}

const menosMeses = (iso, n) => {
  const [y, m, d] = iso.split('-').map(Number);
  const t = y * 12 + (m - 1) - n;
  const ano = Math.floor(t / 12); const mes = (t % 12) + 1;
  const ult = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  return `${ano}-${String(mes).padStart(2, '0')}-${String(Math.min(d, ult)).padStart(2, '0')}`;
};
// O ponto publicado até `data` (o último com data ≤ ela), ou null.
export function pontoEm(s, data) {
  let r = null;
  for (const p of s ?? []) { if (p[0] <= data) r = p; else break; }
  return r;
}
// A variação do último valor contra o de `meses` antes (o dólar em 12 meses: 0,029 = +2,9%), ou null.
export function variacaoEm(s, meses) {
  const u = ultimo(s);
  if (!u) return null;
  const a = pontoEm(s, menosMeses(u[0], meses));
  return a && a[1] ? u[1] / a[1] - 1 : null;
}
// A variação do último dia publicado contra o anterior.
export function variacaoNoDia(s) {
  if (!s || s.length < 2) return null;
  const [a, b] = s.slice(-2);
  return a[1] ? b[1] / a[1] - 1 : null;
}
// O último valor de cada mês: [{ competencia: 'AAAA-MM', valor }] (as curvinhas dos cartões).
export function porMes(s) {
  const m = new Map();
  (s ?? []).forEach(([d, v]) => m.set(d.slice(0, 7), v));
  return [...m.entries()].map(([competencia, valor]) => ({ competencia, valor }));
}
// O JURO REAL: quanto a Selic rende acima da inflação de 12 meses, (1 + Selic) ÷ (1 + IPCA) − 1. Entram em %, sai fração.
export const juroReal = (selic, ipca12) => (selic === null || selic === undefined || ipca12 === null || ipca12 === undefined
  ? null : (1 + selic / 100) / (1 + ipca12 / 100) - 1);

// A FOCUS por ano: { IPCA: { data, valores: [m, …] }, Selic: …, 'Câmbio': … } — a pesquisa MAIS NOVA de cada indicador, a
// mediana de cada ano pedido (null sem ela). `linhas`: as do Olinda ({ Indicador, Data, DataReferencia, Mediana }).
export function focusPorAno(linhas, anos) {
  const out = {};
  for (const ind of ['IPCA', 'Selic', 'Câmbio']) {
    const dela = (linhas ?? []).filter((l) => l.Indicador === ind);
    if (!dela.length) continue;
    const data = dela.reduce((m, l) => (l.Data > m ? l.Data : m), '');
    const v = {};
    dela.filter((l) => l.Data === data).forEach((l) => { v[String(l.DataReferencia)] = l.Mediana; });
    out[ind] = { data, valores: anos.map((a) => v[String(a)] ?? null) };
  }
  return out;
}

// SUA CARTEIRA × CDI × IPCA: cada mês FECHADO (antes de `mesAtual`) com o rendimento da carteira (`meses`, os de
// `rendimentoDasSeries`: o `pct` do mês, fração), o CDI do mês (`cdiMes`: { 'AAAA-MM': fração }) e o IPCA do mês (`ipca`:
// a série 433, em %). Devolve [{ competencia, carteira, cdi, ipca, real, doCdi }] — `real` = acima da inflação,
// `doCdi` = a carteira como % do CDI (1,02 = 102%).
export function carteiraContraIndices(meses, cdiMes, ipca, mesAtual) {
  const ipcaMes = {};
  (ipca ?? []).forEach(([d, v]) => { ipcaMes[d.slice(0, 7)] = v / 100; });
  return (meses ?? [])
    .filter((m) => m.competencia < mesAtual && m.pct !== null && m.pct !== undefined)
    .map((m) => {
      const cdi = cdiMes?.[m.competencia] ?? null;
      const i = ipcaMes[m.competencia] ?? null;
      return { competencia: m.competencia, carteira: m.pct, cdi, ipca: i, real: i === null ? null : (1 + m.pct) / (1 + i) - 1, doCdi: cdi ? m.pct / cdi : null };
    });
}

// A COTAÇÃO AO VIVO (10/11/2026, a pedido: "queria que atualizasse com mais frequência"): a PTAX do Banco Central sai UMA
// VEZ POR DIA (por volta das 13h; antes disso a de hoje não existe e o cartão mostrava a de ontem). O número de AGORA vem
// do câmbio comercial da AwesomeAPI (`api/indicadores.js`, relido a cada minuto pela tela), e a PTAX segue no histórico.
// `lerCotacaoAgora`: a resposta dela → { usd, eur } com { valor (R$), varDia (fração), quando ('AAAA-MM-DD HH:MM:SS',
// a hora de Brasília) } — o que vier sem número fica null.
export function lerCotacaoAgora(json) {
  const um = (x) => {
    const valor = Number(x?.bid); const varDia = Number(x?.pctChange) / 100;
    return Number.isFinite(valor) && valor > 0 && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(x?.create_date ?? '')
      ? { valor, varDia: Number.isFinite(varDia) ? varDia : null, quando: x.create_date } : null;
  };
  return { usd: um(json?.USDBRL), eur: um(json?.EURBRL) };
}
// A série da PTAX COM O PONTO DE AGORA: o valor ao vivo entra como o ponto do dia dele (no lugar da PTAX do mesmo dia, se
// já saiu); sem cotação ao vivo, a série como está.
export function comAgora(s, agora) {
  if (!agora) return s ?? [];
  const dia = agora.quando.slice(0, 10);
  return [...(s ?? []).filter(([d]) => d < dia), [dia, agora.valor]];
}
