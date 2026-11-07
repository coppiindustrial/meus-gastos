// O IMPOSTO DE CADA DEPÓSITO (06/11/2026, o mockup aprovado "Depósitos em cascata e o valor líquido"; migration 016).
// Funções puras (test/impostoInvestimento.test.js); valores em centavos, datas 'AAAA-MM-DD'.
//
// O IR da renda fixa vai sobre o RENDIMENTO de cada depósito, pela idade dele: 22,5% até 180 dias, 20% até 360, 17,5%
// até 720 e 15% depois; nos primeiros 30 dias ainda há o IOF (que vem antes, sobre o rendimento). LCI, LCA, CRI/CRA e
// poupança são isentos; o fundo (come-cotas) e o "outro" ficam sem estimativa; o saldo em conta não rende.
// OS DEPÓSITOS de um título: os colados da lista do banco (`depositos_investimento`: a data e quanto vale numa data de
// referência) — ou, sem eles, o bloco do cadastro (o "valor aplicado" na data da aplicação) — e as aplicações feitas
// depois pelo app (os movimentos, com o valor exato). O resgate sai dos mais antigos.
// A ESTIMATIVA: quanto cada depósito rende sai do CDI de CADA DIA (a série 12, `taxas` — `fatorDiario` de
// lib/valorEstimado.js, 06/11/2026) desde a data dele, vezes a taxa contratada; sem a série diária, do CDI de cada mês;
// sem o CDI (IPCA+, prefixado), uma taxa média. Depois tudo é AJUSTADO ao que o
// investimento vale e ao que foi aplicado (o que o banco mostra): a soma dos depósitos fecha com os dois.

import { fatorDiario, inicioDoRendimento } from './valorEstimado.js';

export const FAIXAS_IR = [
  { ate: 180, aliquota: 0.225 },
  { ate: 360, aliquota: 0.2 },
  { ate: 720, aliquota: 0.175 },
  { ate: Infinity, aliquota: 0.15 },
];
export const aliquotaIR = (dias) => FAIXAS_IR.find((f) => dias <= f.ate).aliquota;
// O IOF regressivo: do 1º ao 29º dia (96% … 3%) sobre o rendimento; do 30º em diante, nada.
const IOF = [96, 93, 90, 86, 83, 80, 76, 73, 70, 66, 63, 60, 56, 53, 50, 46, 43, 40, 36, 33, 30, 26, 23, 20, 16, 13, 10, 6, 3];
export const aliquotaIOF = (dias) => (dias >= 30 ? 0 : IOF[Math.max(0, dias - 1)] / 100);

const ISENTOS = ['lci', 'lca', 'cri_cra', 'poupanca'];
const SEM_ESTIMATIVA = ['fundo', 'outro'];
export const ehIsento = (tipo) => ISENTOS.includes(tipo);

const utc = (iso) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
export const diasEntre = (a, b) => Math.round((utc(b) - utc(a)) / 86400000);
const maisDias = (iso, n) => new Date(utc(iso) + n * 86400000).toISOString().slice(0, 10);

// Quando a alíquota do depósito feito em `data` cai, a partir de `hoje`: { data, aliquota } (a nova) ou null (já 15%).
export function proximaQueda(data, hoje) {
  const idade = diasEntre(data, hoje);
  for (const [dia, aliquota] of [[181, 0.2], [361, 0.175], [721, 0.15]]) if (idade < dia) return { data: maisDias(data, dia), aliquota };
  return null;
}

const TAXA_PADRAO = 0.0085; // ~ o CDI de um mês, quando o mês não tem o dado (o corrente, ou sem a série)
// A taxa do mês `c` para o título: o CDI do mês (só os FECHADOS: o corrente vem parcial do Banco Central — usa o último
// fechado) vezes o % contratado; no "CDI + x" e no "Selic + x", o x ao ano dividido pelos meses.
function taxaDoMes(c, cdi, inv, mesDeHoje) {
  const fechados = cdi ? Object.keys(cdi).filter((k) => k < mesDeHoje).sort() : [];
  const base = cdi && c < mesDeHoje && cdi[c] !== undefined ? cdi[c] : fechados.length ? cdi[fechados[fechados.length - 1]] : TAXA_PADRAO;
  const taxa = inv.taxa === null || inv.taxa === undefined || inv.taxa === '' ? null : Number(inv.taxa);
  if (inv.indexador === 'cdi_pct') return base * (taxa ? taxa / 100 : 1);
  if (inv.indexador === 'cdi_mais' || inv.indexador === 'selic_mais') return base + (taxa ? taxa / 100 / 12 : 0);
  if (inv.indexador === 'prefixado' && taxa) return (1 + taxa / 100) ** (1 / 12) - 1;
  return TAXA_PADRAO; // IPCA+ e sem indexador: o ajuste ao total corrige o nível
}
const diasNoMes = (c) => new Date(Date.UTC(+c.slice(0, 4), +c.slice(5, 7), 0)).getUTCDate();
const proximoMes = (c) => { const [y, m] = c.split('-').map(Number); return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`; };
// O quanto R$ 1 aplicado em `de` vale em `ate`: os meses inteiros e a fração dos meses da ponta pelos dias corridos.
export function fatorDeCrescimento(de, ate, { cdi, inv, hoje, taxas = null }) {
  if (!de || !ate || ate <= de) return 1;
  if (taxas) { const d = fatorDiario(inv, de, ate, taxas); if (d !== null) return d; } // pelo dia, quando a série cobre
  const mesDeHoje = hoje.slice(0, 7);
  let f = 1;
  for (let c = de.slice(0, 7); c <= ate.slice(0, 7); c = proximoMes(c)) {
    const total = diasNoMes(c);
    const ini = c === de.slice(0, 7) ? Number(de.slice(8, 10)) : 1;
    const fim = c === ate.slice(0, 7) ? Number(ate.slice(8, 10)) : total + 1;
    if (fim > ini) f *= (1 + taxaDoMes(c, cdi, inv, mesDeHoje)) ** ((fim - ini) / total);
  }
  return f;
}

// O IMPOSTO DE UM TÍTULO hoje. `vale`/`aplicado`: o que ele vale e o que foi aplicado (os números da carteira — o ajuste
// final fecha com eles). Devolve { lotes: [{ data, dataAproximada, origem, fonte, depositado, vale, ganho, aliquota, ir, iof,
// liquido, proxima }], ganho, ir, iof, liquido, aliquotaMedia, isento, semEstimativa, proximaQueda } — `lotes` do mais
// novo ao mais antigo; `proximaQueda`: a primeira data em que o imposto cai, com o depósito e quanto cai.
export function estimarImposto({ inv, fotos = [], movimentos = [], depositos = [], cdi = null, taxas = null, hoje, vale, aplicado }) {
  const isento = ehIsento(inv.tipo) || inv.tipo === 'saldo';
  const semEstimativa = SEM_ESTIMATIVA.includes(inv.tipo);
  const fs = [...fotos].sort((a, b) => (a.data < b.data ? -1 : 1));
  const abre = fs[0];
  const ctx = { cdi, inv, hoje, taxas };
  const f = (de, ate) => fatorDeCrescimento(de, ate, ctx);

  // os depósitos que formam o título
  const lotes = [];
  let corte;
  if (depositos.length) {
    // OS DOIS NÚMEROS DO BANCO (07/11/2026, a migration 019): com o `rendimento_centavos` (o "Rendimento bruto" da tela do
    // depósito, no dia da referência), o que ainda está aplicado é o valor − o rendimento, EXATO — o saque parcial e o IR
    // retido nele já estão na conta do banco. O aporte assim fica FIXO: não entra no ajuste que fecha o resto com o título.
    depositos.forEach((d) => {
      const rend = d.rendimento_centavos === null || d.rendimento_centavos === undefined ? null : Number(d.rendimento_centavos);
      const valor = Number(d.valor_centavos);
      const principal = rend !== null ? valor - rend : d.referencia === d.data ? valor : null;
      lotes.push({ data: d.data, ref: d.referencia, valorRef: valor, origem: 'colado', fixo: rend !== null,
        fonte: { tipo: 'dep', id: d.id, data: d.data, valor, referencia: d.referencia, exato: principal !== null, principal, rendimento: rend, vencimento: d.vencimento || null } });
    });
    corte = depositos.reduce((m, d) => (d.referencia > m ? d.referencia : m), depositos[0].referencia);
  } else if (abre) {
    // AS APLICAÇÕES PELO APP ATÉ A PRIMEIRA FOTO são depósitos EXATOS (06/11/2026: o "Cadastrar e aplicar" grava a foto e a
    // aplicação no MESMO dia, e ela ficava de fora — o título feito pelo app caía em "faltam as datas"); o bloco do cadastro
    // (o "valor aplicado", ou a primeira foto) só leva o que SOBRA sem elas, e só ele pode ficar sem data.
    const iniciais = movimentos.filter((m) => m.investimento_id === inv.id && m.tipo !== 'resgate' && m.data <= abre.data);
    // sem o "valor aplicado" do cadastro, elas SÃO o aplicado: o que a foto tem a mais é rendimento (a de junho lançada depois)
    const somaIni = iniciais.reduce((s, m) => s + Number(m.valor_centavos), 0);
    const total = inv.aplicado_inicial_centavos !== null && inv.aplicado_inicial_centavos !== undefined ? Number(inv.aplicado_inicial_centavos) : iniciais.length ? somaIni : Number(abre.valor_centavos);
    const resto = total - somaIni;
    iniciais.forEach((m) => lotes.push({ data: m.data, principal: Number(m.valor_centavos), origem: 'aporte', fonte: { tipo: 'mov', id: m.id, data: m.data, valor: Number(m.valor_centavos), principal: Number(m.valor_centavos), exato: true, vencimento: m.vencimento || null } }));
    if (resto > 100) {
      lotes.push({ data: inv.aplicado_em || abre.data, dataAproximada: !inv.aplicado_em, principal: resto, origem: 'inicial',
        fonte: { tipo: 'inicial', data: inv.aplicado_em || abre.data, valor: resto, base: somaIni, exato: inv.aplicado_inicial_centavos !== null && inv.aplicado_inicial_centavos !== undefined } });
    }
    corte = abre.data;
  }
  const depois = movimentos.filter((m) => m.investimento_id === inv.id && corte && m.data > corte).sort((a, b) => (a.data < b.data ? -1 : 1));
  // o principal e o valor de cada um numa data
  // O DIA DO BANCO (07/11/2026, conferido no centavo — lib/valorEstimado.js): o valor numa data tem o CDI dos dias úteis
  // antes dela. O aporte rende desde `inicioDoRendimento` (o próprio dia, ou o dia útil antes dele no sábado, domingo ou
  // feriado). O colado é o que o banco mostrou na referência; o digitado como "o que foi depositado" (a referência é a
  // própria data) é o principal, como o aporte.
  const ini = (d) => (taxas ? inicioDoRendimento(inv, d, taxas) : d);
  lotes.forEach((l) => {
    l.frac = 1;
    if (l.origem === 'colado') l.principal = l.fixo ? l.fonte.principal : l.ref === l.data ? l.valorRef : l.valorRef / f(ini(l.data), l.ref);
  });
  const valorEm = (l, t) => {
    if (l.origem !== 'colado' || l.ref === l.data) return l.principal * f(ini(l.data), t);
    return t >= l.ref ? l.valorRef * f(l.ref, t) : l.valorRef / f(t, l.ref);
  };
  depois.forEach((m) => {
    const v = Number(m.valor_centavos);
    if (m.tipo !== 'resgate') { lotes.push({ data: m.data, principal: v, origem: 'aporte', frac: 1, fonte: { tipo: 'mov', id: m.id, data: m.data, valor: v, principal: v, exato: true, vencimento: m.vencimento || null } }); return; }
    let falta = v;
    for (const l of [...lotes].sort((a, b) => (a.data < b.data ? -1 : 1))) {
      if (falta <= 0 || l.data > m.data) continue;
      const tem = valorEm(l, m.data) * l.frac;
      if (tem <= 0) continue;
      const tira = Math.min(tem, falta);
      l.frac *= 1 - tira / tem;
      falta -= tira;
    }
  });
  const vivos = lotes.filter((l) => l.frac > 1e-6).map((l) => ({ ...l, v: valorEm(l, hoje) * l.frac, p: l.principal * l.frac }));

  // o ajuste: a soma fecha com o que o título vale e com o que foi aplicado — pelos aportes que NÃO são fixos. Os com os
  // dois números do banco ficam como o banco disse; o valor do banco de HOJE (o colado com a referência de hoje) também não
  // muda (07/11/2026: digitado o Vale hoje, a linha o mostrava reajustado) — só o rendimento dele leva a diferença.
  vivos.forEach((l) => { l.valorFixo = l.fixo || (l.origem === 'colado' && l.ref === hoje && l.ref !== l.data); });
  const soltos = vivos.filter((l) => !l.fixo);
  const fixos = vivos.filter((l) => l.fixo);
  const somaV = vivos.filter((l) => !l.valorFixo).reduce((s, l) => s + l.v, 0);
  const somaG = soltos.reduce((s, l) => s + (l.v - l.p), 0);
  const fixoV = vivos.filter((l) => l.valorFixo).reduce((s, l) => s + l.v, 0);
  const fixoG = fixos.reduce((s, l) => s + (l.v - l.p), 0);
  const kv = somaV > 0 && vale > 0 ? Math.max(0, vale - fixoV) / somaV : 1;
  const G = vale !== undefined && aplicado !== undefined ? vale - aplicado : somaG + fixoG;
  const kg = somaG > 0 ? (G - fixoG) / somaG : 0;
  const lista = vivos.map((l) => {
    const valeL = l.valorFixo ? l.v : l.v * kv;
    const ganho = l.fixo ? l.v - l.p : (l.v - l.p) * kg;
    const dias = Math.max(0, diasEntre(l.data, hoje));
    const iof = isento || semEstimativa ? 0 : Math.max(0, ganho) * aliquotaIOF(dias);
    const aliquota = isento ? 0 : aliquotaIR(dias);
    const ir = isento || semEstimativa ? 0 : Math.max(0, ganho - iof) * aliquota;
    return {
      data: l.data, dataAproximada: !!l.dataAproximada, origem: l.origem, fonte: l.fonte ?? null, inteiro: l.frac > 0.999999, dias,
      depositado: Math.round(valeL - ganho), vale: Math.round(valeL), ganho: Math.round(ganho),
      aliquota, ir: Math.round(ir), iof: Math.round(iof), liquido: Math.round(valeL - ir - iof),
      proxima: isento ? null : proximaQueda(l.data, hoje),
    };
  }).sort((a, b) => (a.data < b.data ? 1 : -1));
  const soma = (k) => lista.reduce((s, l) => s + l[k], 0);
  // SEM AS DATAS: o que já estava aplicado no cadastro, sem a data da aplicação nem a lista de depósitos, não tem idade —
  // o IR não se estima (dizer "R$ 0" enganaria: o rendimento existe, só não se sabe a alíquota de cada parte).
  const semDatas = !isento && !semEstimativa && G > 0 && lotes.some((l) => l.origem === 'inicial' && l.dataAproximada);
  if (semDatas) {
    return { lotes: lista, ganho: Math.round(G), ir: null, iof: null, liquido: null, aliquotaMedia: 0, isento, semEstimativa, semDatas, quedas: [], proximaQueda: null };
  }
  const ganho = soma('ganho');
  const ir = soma('ir');
  const iof = soma('iof');
  const quedas = lista.filter((l) => l.proxima && !semEstimativa && l.ganho > 0)
    .map((l) => ({ data: l.proxima.data, de: l.aliquota, para: l.proxima.aliquota, deposito: l.data, vale: l.vale, menos: Math.round(Math.max(0, l.ganho - l.iof) * (l.aliquota - l.proxima.aliquota)) }))
    .sort((a, b) => (a.data < b.data ? -1 : 1));
  return {
    lotes: lista, ganho, ir: semEstimativa ? null : ir, iof: semEstimativa ? null : iof,
    liquido: semEstimativa ? null : (vale ?? soma('vale')) - ir - iof,
    aliquotaMedia: ganho > 0 && !semEstimativa ? ir / ganho : 0, isento, semEstimativa, semDatas: false, quedas, proximaQueda: quedas[0] ?? null,
  };
}

// A LISTA COLADA da tela "Detalhes dos depósitos" do banco: uma por linha, a data ("05 SET 2026", "05/09/2026",
// "2026-09-05") e o valor ("R$ 4.165,28", "4165,28"). Devolve { itens: [{ data, valor_centavos }], ignoradas: [linhas] }.
const MESES = { jan: 1, fev: 2, mar: 3, abr: 4, mai: 5, jun: 6, jul: 7, ago: 8, set: 9, out: 10, nov: 11, dez: 12 };
export function lerDepositos(texto, lerValor) {
  const itens = [];
  const ignoradas = [];
  const linhas = String(texto ?? '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  // A tela do banco às vezes vem com a data e o valor em linhas separadas ("Feito em" / "05 SET 2026" / "R$ 4.165,28"):
  // junta tudo e acha os pares data → valor em ordem.
  const corrido = linhas.join(' ');
  // O VALOR precisa do "R$" ou dos centavos com vírgula: sem isso o "05" do "05 SET 2026" virava um valor antes de a data
  // ser lida.
  const re = /(?<d>\d{1,2})[\s/.-]+(?<m>[A-Za-zÀ-ÿ]{3}|\d{1,2})[\s/.-]+(?<a>\d{4})|(?<ia>\d{4})-(?<im>\d{2})-(?<id>\d{2})|R\$\s*(?<v1>-?[\d.]+(?:,\d{1,2})?)|(?<v2>-?\d[\d.]*,\d{2})/g;
  let data = null;
  let m;
  while ((m = re.exec(corrido))) {
    const g = m.groups;
    if (g.a || g.ia) {
      let d; let mes; let a;
      if (g.ia) { a = +g.ia; mes = +g.im; d = +g.id; } else {
        d = +g.d; a = +g.a;
        mes = /^\d+$/.test(g.m) ? +g.m : MESES[g.m.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '')];
      }
      if (mes >= 1 && mes <= 12 && d >= 1 && d <= 31) data = `${a}-${String(mes).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      continue;
    }
    const bruto = g.v1 ?? g.v2;
    if (bruto && data) {
      const v = lerValor(bruto);
      if (v !== null && v > 0) itens.push({ data, valor_centavos: v });
      data = null;
    }
  }
  if (!itens.length && linhas.length) ignoradas.push(...linhas);
  return { itens, ignoradas };
}

// OS DEPÓSITOS DE ANTES DO APP (06/11/2026, o mockup aprovado "Depósitos de antes": a TABELA digitada — o colar do banco
// só a preenche). `modo`: 'depositado' (o valor do dia de cada depósito: a `referencia` dele é a própria data, e o
// principal é o próprio valor) | 'hoje' (o que cada um vale em `referencia`, como a tela "Detalhes dos depósitos" do
// banco). `linhas`: [{ data, valor }] (o valor em texto; a linha vazia não conta). Devolve { itens: [{ data,
// valor_centavos, referencia }], soma, aplicado (o "valor aplicado" do título; `undefined` = não muda), foto ({ data, valor }
// — só no investimento SEM VALOR ainda: no 'hoje', a soma na data dos valores; no 'depositado', o "vale hoje" digitado, ou a
// `estimativa` pelo CDI, ou a própria soma) } ou { erro }. No 'depositado' o aplicado é a soma; no 'hoje', o que o banco
// mostra (`aplicadoTexto`, obrigatório no sem valor: sem ele o rendimento e o IR ficam zerados).
export function planoDosDepositos({ modo, linhas = [], referencia, hoje, semValor = false, aplicadoTexto, aplicadoAntes, valeTexto, estimativa = null, lerValor }) {
  const itens = [];
  for (let i = 0; i < linhas.length; i += 1) {
    const l = linhas[i];
    const temValor = String(l.valor ?? '').trim() !== '';
    if (!l.data && !temValor) continue;
    const n = `${i + 1}º aporte`;
    if (!l.data) return { erro: `Falta a data do ${n}.` };
    if (!temValor) return { erro: `Falta o valor do ${n}.` };
    if (l.data > hoje) return { erro: `A data do ${n} ainda não chegou.` };
    const v = lerValor(l.valor);
    if (v === null || !(v > 0)) return { erro: `O valor do ${n} não é um valor.` };
    if (modo === 'hoje' && referencia && l.data > referencia) return { erro: `O ${n} é depois da data dos valores (${referencia.split('-').reverse().join('/')}).` };
    itens.push({ data: l.data, valor_centavos: v, referencia: modo === 'hoje' ? referencia : l.data });
  }
  if (modo === 'hoje' && itens.length && !/^\d{4}-\d{2}-\d{2}$/.test(referencia ?? '')) return { erro: 'Informe a data dos valores.' };
  const soma = itens.reduce((t, x) => t + x.valor_centavos, 0);
  const antes = aplicadoAntes === null || aplicadoAntes === undefined ? null : Number(aplicadoAntes);
  let aplicado;
  if (modo === 'depositado') {
    if (itens.length && soma !== antes) aplicado = soma;
  } else {
    const txt = String(aplicadoTexto ?? '').trim();
    if (!txt) {
      if (semValor && itens.length) return { erro: 'Falta o valor aplicado que o banco mostra: sem ele, o rendimento e o IR ficam zerados.' };
    } else {
      const v = lerValor(txt);
      if (v === null || !(v >= 0)) return { erro: 'O valor aplicado não é um valor.' };
      if (v !== antes) aplicado = v;
    }
  }
  let foto = null;
  if (semValor && itens.length) {
    if (modo === 'hoje') foto = { data: referencia, valor: soma };
    else {
      const txt = String(valeTexto ?? '').trim();
      const v = txt ? lerValor(txt) : null;
      if (txt && (v === null || v < 0)) return { erro: 'O "vale hoje" não é um valor.' };
      foto = { data: hoje, valor: v ?? (estimativa ? Math.round(estimativa) : soma) };
    }
  }
  return { itens, soma, aplicado, foto };
}
