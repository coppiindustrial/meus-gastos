// O VALOR QUE ANDA SOZINHO (06/11/2026, o mockup aprovado "Valor pelo CDI": a carteira A, conferir C, Tesouro A).
// Funções puras (test/valorEstimado.test.js); valores em centavos, datas 'AAAA-MM-DD'.
//
// O app não lê o banco: o valor de um investimento é a última FOTO REAL (o "Atualizar valores"). Nos que rendem por uma
// taxa pública — % do CDI, CDI + taxa, Selic + taxa, IPCA + taxa e prefixado (o CDB, a LCI, a LCA, o RDB, o Tesouro Selic,
// o CRI/CRA) — o valor ANDA SOZINHO a partir dela, DIA ÚTIL A DIA ÚTIL, cada dia com a taxa daquele dia (as séries do
// Banco Central, `api/taxas.js`): valor de amanhã = (valor de hoje + o que entrou − o que saiu) × (1 + CDI do dia × %).
// Quando o CDI muda, a taxa nova vale dali em diante sobre o que já acumulou. O que é PREÇO DE MERCADO (o Tesouro IPCA+ e
// o prefixado, o fundo, a debênture) ou tem regra própria (a poupança) fica pelo "Atualizar valores".
// As FOTOS ESTIMADAS (`estimado: true`) que o app faz: no fim de cada mês ENTRE duas fotos reais (o caminho pela taxa,
// AJUSTADO para chegar na foto real seguinte — o erro se espalha pelos meses, pela fração dos dias úteis) e, DEPOIS da
// última foto real, no fim de cada mês e no dia seguinte ao último dia publicado (`ultimo: true` — "≈ pelo CDI até
// 05/11"). Com elas o mês a mês, o gráfico, o líquido e o painel seguem sem a foto de todo mês; a conferência com o banco
// é a cada 3 meses (`pendentesDeValor`).
// O DIA INTEIRO (06/11/2026, conferido com o banco: o aporte de 12/09 no RDB a 102,5% do CDI, R$ 360,18 de rendimento às
// 19h16 de 06/11, e o app dava R$ 350 — um dia a menos): o valor de um dia JÁ TEM o rendimento daquele dia, como o banco
// mostra. A FOTO de uma data tem o rendimento até ela (inclusive); o aporte rende desde o próprio dia; e o valor de HOJE
// já leva o rendimento de hoje — com a taxa do último dia publicado (o Banco Central publica o CDI de um dia no dia útil
// seguinte), como os dias de semana depois dele (`projetados`). O movimento no dia da foto já está nela.

// o que nunca anda sozinho: preço de mercado, regra própria ou sem rendimento
export const MANUAIS = ['tesouro_ipca', 'tesouro_prefixado', 'fundo', 'debenture', 'outro', 'poupanca', 'saldo'];
const num = (t) => (t === null || t === undefined || t === '' ? null : Number(t));

export function andaSozinho(inv) {
  if (!inv || MANUAIS.includes(inv.tipo)) return false;
  const t = num(inv.taxa);
  if (inv.indexador === 'cdi_pct' || inv.indexador === 'prefixado') return t > 0;
  return ['cdi_mais', 'selic_mais', 'ipca_mais'].includes(inv.indexador);
}
// "pelo CDI", "pela Selic"… — o que faz o valor andar
export const rotuloPeloIndice = (inv) => ({ cdi_pct: 'pelo CDI', cdi_mais: 'pelo CDI', selic_mais: 'pela Selic', ipca_mais: 'pelo IPCA', prefixado: 'pela taxa' })[inv?.indexador] ?? '';

const utc = (iso) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
const maisDias = (iso, n) => new Date(utc(iso) + n * 86400000).toISOString().slice(0, 10);
const fimDoMes = (c) => `${c}-${String(new Date(Date.UTC(+c.slice(0, 4), +c.slice(5, 7), 0)).getUTCDate()).padStart(2, '0')}`;
const proximoMes = (c) => { const [y, m] = c.split('-').map(Number); return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`; };
// os últimos dias dos meses ESTRITAMENTE entre `a` e `b`
export function finsDeMes(a, b) {
  const out = [];
  for (let c = a.slice(0, 7); c <= b.slice(0, 7); c = proximoMes(c)) { const f = fimDoMes(c); if (f > a && f < b) out.push(f); }
  return out;
}

// O calendário dos dias úteis é o da própria série: o CDI (ou a Selic, no "Selic + taxa"). `taxas`: o de `api/taxas.js`.
const calendarioDe = (inv, taxas) => ((inv.indexador === 'selic_mais' ? taxas?.selic : taxas?.cdi) ?? []);
const doAno = (t) => (1 + (t ?? 0) / 100) ** (1 / 252);
function ipcaDoMes(ipca, m) {
  if (!ipca) return 0;
  if (ipca[m] !== undefined) return ipca[m];
  const antes = Object.keys(ipca).filter((k) => k <= m).sort(); // o mês ainda sem o IPCA publicado: o último que saiu
  return antes.length ? ipca[antes[antes.length - 1]] : 0;
}
// O fator de um dia útil `[d, r]` (r: a taxa do dia da série) para o título.
function fatorDoDia(inv, [d, r], taxas, du, mesAberto) {
  const t = num(inv.taxa) ?? 0;
  switch (inv.indexador) {
    case 'cdi_pct': return 1 + r * (t / 100);
    case 'cdi_mais': case 'selic_mais': return (1 + r) * doAno(t);
    case 'prefixado': return doAno(t);
    case 'ipca_mais': {
      const m = d.slice(0, 7);
      const dias = m === mesAberto || !du[m] ? 21 : du[m]; // o mês que ainda corre: ~21 dias úteis
      return (1 + ipcaDoMes(taxas?.ipca, m)) ** (1 / dias) * doAno(t);
    }
    default: return 1;
  }
}
function preparar(inv, taxas) {
  const cal = calendarioDe(inv, taxas);
  const du = {};
  cal.forEach(([d]) => { const m = d.slice(0, 7); du[m] = (du[m] ?? 0) + 1; });
  return { cal, du, mesAberto: cal.length ? cal[cal.length - 1][0].slice(0, 7) : null };
}
const sinalDe = (m) => (m.tipo === 'resgate' ? -1 : 1) * Number(m.valor_centavos);

// O calendário com os dias de semana DEPOIS do último publicado, até `ate`, com a taxa dele (`[d, r, true]`: projetado).
function comProjetados(cal, ate) {
  if (!cal.length || !ate || ate <= cal[cal.length - 1][0]) return cal;
  const [ult, r] = cal[cal.length - 1];
  const extra = [];
  for (let d = maisDias(ult, 1); d <= ate; d = maisDias(d, 1)) {
    const sem = new Date(utc(d)).getUTCDay();
    if (sem !== 0 && sem !== 6) extra.push([d, r, true]);
  }
  return [...cal, ...extra];
}

// O caminho de `base` ({ data, valor }: o valor no FIM do dia, já com o rendimento dele) até o FIM de cada uma das
// `paradas` (datas), com os movimentos depois da base (o aporte rende desde o próprio dia). Devolve { [parada]: { valor,
// dias, liq, proj } } (`dias`: os dias úteis que renderam desde a base; `liq`: aplicações − resgates; `proj`: quantos dos
// dias foram com a taxa do último publicado).
function caminhar(inv, base, paradas, movs, taxas) {
  const { cal: serie, du, mesAberto } = preparar(inv, taxas);
  const ordem = [...paradas].sort();
  const cal = comProjetados(serie, ordem[ordem.length - 1]);
  const ms = movs.filter((m) => m.data > base.data).sort((a, b) => (a.data < b.data ? -1 : 1));
  let v = base.valor; let dias = 0; let j = 0; let liq = 0; let proj = 0;
  let i = cal.findIndex(([d]) => d > base.data);
  if (i < 0) i = cal.length;
  const out = {};
  for (const p of ordem) {
    while (i < cal.length && cal[i][0] <= p) {
      while (j < ms.length && ms[j].data <= cal[i][0]) { v += sinalDe(ms[j]); liq += sinalDe(ms[j]); j += 1; }
      v *= fatorDoDia(inv, cal[i], taxas, du, mesAberto);
      if (cal[i][2]) proj += 1;
      i += 1; dias += 1;
    }
    while (j < ms.length && ms[j].data <= p) { v += sinalDe(ms[j]); liq += sinalDe(ms[j]); j += 1; } // o de um dia sem taxa (sábado)
    out[p] = { valor: v, dias, liq, proj };
  }
  return out;
}

// AS FOTOS ESTIMADAS de todos os títulos que andam sozinhos. `valores`: as fotos REAIS; `hoje`: a estimativa vai até ele
// (o fim do dia). A última de cada título (`ultimo: true`, na data de hoje) leva { base: { data, valor }, ate (o último dia
// publicado), projetados (os dias depois dele, com a taxa dele — hoje, ao menos), dias, liquido (aplicações − resgates
// depois da base) }.
export function estimarValores({ investimentos = [], valores = [], movimentos = [], taxas, hoje }) {
  if (!taxas?.cdi?.length) return [];
  const out = [];
  for (const inv of investimentos) {
    if (inv.ativo === false || !andaSozinho(inv)) continue;
    const { cal } = preparar(inv, taxas);
    if (!cal.length) continue;
    const fotos = valores.filter((v) => v.investimento_id === inv.id && !v.estimado).sort((a, b) => (a.data < b.data ? -1 : 1));
    if (!fotos.length) continue;
    const movs = movimentos.filter((m) => m.investimento_id === inv.id);
    const foto = (f) => ({ data: f.data, valor: Number(f.valor_centavos) });
    // entre duas fotos reais: o fim de cada mês, pelo caminho AJUSTADO à foto seguinte
    for (let k = 0; k + 1 < fotos.length; k += 1) {
      const a = foto(fotos[k]); const b = foto(fotos[k + 1]);
      const fins = finsDeMes(a.data, b.data);
      if (!fins.length) continue;
      const c = caminhar(inv, a, [...fins, b.data], movs, taxas);
      const chegou = c[b.data].valor;
      const ajuste = chegou > 0 && b.valor > 0 ? b.valor / chegou : 1;
      const total = c[b.data].dias;
      fins.forEach((f) => out.push({ investimento_id: inv.id, data: f, valor_centavos: Math.round(c[f].valor * ajuste ** (total ? c[f].dias / total : 1)), estimado: true }));
    }
    // depois da última foto real: o fim de cada mês e HOJE (com o rendimento de hoje, pela taxa do último publicado)
    const u = foto(fotos[fotos.length - 1]);
    const ate = cal[cal.length - 1][0];
    if (ate < u.data) continue;
    const fim = hoje;
    if (fim <= u.data) continue;
    const fins = finsDeMes(u.data, fim);
    const c = caminhar(inv, u, [...fins, fim], movs, taxas);
    if (!c[fim].dias) continue;
    fins.forEach((f) => out.push({ investimento_id: inv.id, data: f, valor_centavos: Math.round(c[f].valor), estimado: true }));
    out.push({
      investimento_id: inv.id, data: fim, valor_centavos: Math.round(c[fim].valor), estimado: true, ultimo: true, base: u, ate,
      projetados: c[fim].proj, dias: c[fim].dias, liquido: c[fim].liq,
    });
  }
  return out;
}

// Do COMEÇO do dia `de` ao FIM do dia `dia` (o aporte de `de` visto em `dia`, com o rendimento dos dois): o `fatorDiario`
// até o dia seguinte.
export const fatorAteOFim = (inv, de, dia, taxas) => fatorDiario(inv, de, maisDias(dia, 1), taxas);

// O quanto R$ 1 em `de` vale em `ate` pelas taxas de CADA DIA (a estimativa do IR de cada depósito): os dias úteis de `de`
// a antes de `ate`; depois do último dia publicado, o último fator em cada dia de semana. null quando a série não cobre
// `de` ou o título não tem um índice com série (aí vale a conta pelo mês).
export function fatorDiario(inv, de, ate, taxas) {
  if (!de || !ate || ate <= de) return 1;
  if (!['cdi_pct', 'cdi_mais', 'selic_mais', 'prefixado', 'ipca_mais'].includes(inv?.indexador)) return null;
  const { cal, du, mesAberto } = preparar(inv, taxas);
  if (!cal.length || cal[0][0] > de) return null;
  let f = 1; let ultimo = null;
  for (const dia of cal) {
    if (dia[0] < de) continue;
    if (dia[0] >= ate) break;
    ultimo = fatorDoDia(inv, dia, taxas, du, mesAberto);
    f *= ultimo;
  }
  const fimSerie = cal[cal.length - 1][0];
  if (ate > maisDias(fimSerie, 1)) {
    const fd = ultimo ?? fatorDoDia(inv, cal[cal.length - 1], taxas, du, mesAberto);
    for (let d = maisDias(fimSerie, 1); d < ate; d = maisDias(d, 1)) {
      const sem = new Date(utc(d)).getUTCDay();
      if (sem !== 0 && sem !== 6 && d >= de) f *= fd;
    }
  }
  return f;
}

// O MOVIMENTO QUE OS VALORES NÃO TÊM (06/11/2026): a aplicação (ou o resgate) lançada DEPOIS de um valor e com a data
// ANTES dele — o valor foi registrado sem ela (a aplicação de junho lançada depois do valor de outubro: o app achava que
// o título tinha só o de outubro e dividia esse total entre os dois depósitos). Pela hora: o valor que não mudou desde
// antes de o movimento ser lançado (`atualizado_em` < `criado_em` dele). Devolve [{ mov, fotos }] (os valores afetados).
export function movimentosForaDosValores({ valores = [], movimentos = [] }) {
  const out = [];
  for (const m of movimentos) {
    if (!m.investimento_id || !m.criado_em) continue;
    const fotos = valores.filter((v) => v.investimento_id === m.investimento_id && !v.estimado && v.data > m.data
      && (v.atualizado_em ?? v.criado_em) && (v.atualizado_em ?? v.criado_em) < m.criado_em);
    if (fotos.length) out.push({ mov: m, fotos });
  }
  return out;
}
// Cada valor com o movimento somado: a aplicação CRESCIDA pela taxa de cada dia até a data do valor (sem a série, ou no que
// não anda sozinho, o valor puro); o resgate, tirado. Devolve [{ id, data, antes, valor_centavos }].
export function valoresComOMovimento({ mov, fotos, inv, taxas = null }) {
  return fotos.map((f) => {
    const fator = (taxas && andaSozinho(inv) ? fatorAteOFim(inv, mov.data, f.data, taxas) : null) ?? 1; // até o fim do dia da foto
    const delta = (mov.tipo === 'resgate' ? -1 : 1) * Number(mov.valor_centavos) * fator;
    return { id: f.id, data: f.data, antes: Number(f.valor_centavos), valor_centavos: Math.max(0, Math.round(Number(f.valor_centavos) + delta)) };
  });
}
