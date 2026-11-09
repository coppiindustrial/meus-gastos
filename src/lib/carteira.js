// A CARTEIRA DO ZERO (07/11/2026, o mockup "Carteira por aportes", tabela A; migration 020). Funções puras, testadas em
// test/carteira.test.js. Valores em centavos; datas 'AAAA-MM-DD'.
//
// O modelo: o CADASTRO diz o que o investimento é (a taxa em % do CDI); o APORTE é o dinheiro que entrou; o RESGATE sai
// de um aporte. A ÚNICA CONTA: o valor de partida do aporte × (1 + CDI do dia × taxa) em cada dia útil desde a partida.
//   · dinheiro novo: a partida é o aporte (o valor aplicado, na data dele);
//   · já estava aplicado: a partida é o que o banco mostrava no dia em que você olhou (o aplicado = o total − o que já
//     tinha rendido).
// Nada de fotos, de "atualizar valores" ou de ajuste para fechar com um número digitado.
//
// O DIA DO BANCO (conferido no centavo com o Nubank e a XP em 07/11/2026; os números estão no teste):
//   · o valor de um dia tem o CDI dos dias úteis ANTES dele (o de sexta entra no sábado de madrugada);
//   · o aporte rende desde o próprio dia; o de SÁBADO, DOMINGO ou FERIADO começa no dia útil seguinte (sai sozinho do
//     calendário, que só tem os dias úteis). Até 08/11/2026 o de sábado ganhava o CDI de sexta, por um aporte de setembro
//     que só fechava com o banco assim; mas o depósito de sábado 07/11 no Nubank estava com o rendimento ZERO no domingo
//     08/11 à noite (o app dava um dia de CDI). A conta de setembro fecha também com o depósito na sexta 11/09;
//   · o Banco Central publica o CDI no dia útil seguinte: os dias de semana depois do último publicado vão com a taxa
//     dele (`projetado`).

const utc = (iso) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
export const maisDias = (iso, n) => new Date(utc(iso) + n * 86400000).toISOString().slice(0, 10);
export const diasEntre = (a, b) => Math.round((utc(b) - utc(a)) / 86400000);
const diaDaSemana = (iso) => new Date(utc(iso)).getUTCDay();
const p2 = (n) => String(n).padStart(2, '0');

export const TIPOS = [
  { value: 'cdb', label: 'CDB' }, { value: 'rdb', label: 'RDB' }, { value: 'lci', label: 'LCI (isenta)' },
  { value: 'lca', label: 'LCA (isenta)' }, { value: 'outro', label: 'Outro' },
];
export const nomeDoTipo = (t) => ({ cdb: 'CDB', rdb: 'RDB', lci: 'LCI', lca: 'LCA', outro: 'Outro' })[t] ?? t;
export const ehIsento = (tipo) => tipo === 'lci' || tipo === 'lca';
// O ÍNDICE (08/11/2026, migration 025): 'cdi' — a taxa é o % do CDI; 'pre' — prefixado, a taxa é o % ao ano; 'ipca' —
// IPCA + a taxa ao ano. Sem a coluna, 'cdi'.
export const INDEXADORES = [{ value: 'cdi', label: '% do CDI' }, { value: 'ipca', label: 'IPCA +' }, { value: 'pre', label: 'Prefixado' }];
const numTaxa = (taxa) => Number(taxa).toLocaleString('pt-BR', { maximumFractionDigits: 3 });
export const rotuloTaxa = (taxa, indexador = 'cdi') => (indexador === 'pre' ? `${numTaxa(taxa)}% ao ano`
  : indexador === 'ipca' ? `IPCA + ${numTaxa(taxa)}%` : `${numTaxa(taxa)}% do CDI`);

// ------------------------------------------------------------ o IR e o IOF
export const FAIXAS_IR = [{ ate: 180, aliquota: 0.225 }, { ate: 360, aliquota: 0.2 }, { ate: 720, aliquota: 0.175 }, { ate: Infinity, aliquota: 0.15 }];
export const aliquotaIR = (dias) => FAIXAS_IR.find((f) => dias <= f.ate).aliquota;
const IOF = [96, 93, 90, 86, 83, 80, 76, 73, 70, 66, 63, 60, 56, 53, 50, 46, 43, 40, 36, 33, 30, 26, 23, 20, 16, 13, 10, 6, 3];
export const aliquotaIOF = (dias) => (dias >= 30 ? 0 : IOF[Math.max(0, dias - 1)] / 100);
// O IOF E O IR EM CENTAVOS, CORTANDO A FRAÇÃO DE CENTAVO, como o banco (08/11/2026: o Nubank mostra o IR cortado — um
// rendimento de R$ 100,04 a 22,5% dá 22,509 e o banco cobra R$ 22,50; arredondando, o app dava 1 centavo a mais por
// aporte, e um investimento de 12 depósitos ficava 7 centavos acima). A conta é inteira (a alíquota em milésimos): no
// ponto flutuante, 3.640 × 0,225 dá 818,999… e o corte tiraria 1 centavo que não existe.
export function impostos(ganho, idade, aliquota) {
  const iof = idade !== null && idade < 30 ? Math.floor((ganho * Math.round(aliquotaIOF(idade) * 1000)) / 1000) : 0;
  const ir = Math.floor(((ganho - iof) * Math.round(aliquota * 1000)) / 1000);
  return { iof, ir };
}
// O DIA EM QUE O IOF ZERA: o 30º dia depois da data do aporte (a idade 30; até a 29ª, 96% … 3% do rendimento).
export const fimDoIOF = (desde) => maisDias(desde, 30);
// O IMPOSTO DE UM RESGATE (09/11/2026, a pedido): o valor digitado é o que SAI do aporte (bruto, o que se grava). Sai junto
// a mesma fração do rendimento (o aplicado e o rendido diminuem na mesma proporção), e o IOF e o IR são sobre ela, pela
// idade e alíquota da posição no dia. `valor` null = tudo. Devolve { sai, rendimento, iof, ir, chega, aliquotaIOF,
// semIOF: o imposto se fosse a partir do fim do IOF (o IR sobre o rendimento inteiro), fimIOF }.
export function impostoDoResgate(pos, valor = null) {
  if (!pos || pos.encerrado || !(pos.vale > 0)) return null;
  const sai = valor === null ? pos.vale : Math.min(valor, pos.vale);
  const rendimento = Math.max(0, Math.round(Math.max(0, pos.rendeu) * (sai / pos.vale)));
  const aliquota = pos.aliquota ?? 0;
  const { iof, ir } = impostos(rendimento, pos.idade, aliquota);
  const semIOF = iof ? impostos(rendimento, 30, aliquota).ir : null;
  return {
    sai, rendimento, iof, ir, chega: sai - iof - ir, aliquota, aliquotaIOF: iof ? aliquotaIOF(pos.idade) : 0,
    semIOF, fimIOF: iof && pos.partida?.desdeIR ? fimDoIOF(pos.partida.desdeIR) : null,
  };
}
// a próxima vez que a alíquota cai (no dia seguinte ao fim da faixa): { data, para } ou null (já na menor)
export function proximaQueda(desde, hoje) {
  const dias = diasEntre(desde, hoje);
  const f = FAIXAS_IR.find((x) => dias <= x.ate);
  if (f.ate === Infinity) return null;
  const para = FAIXAS_IR[FAIXAS_IR.indexOf(f) + 1].aliquota;
  return { data: maisDias(desde, f.ate + 1), para };
}

// ------------------------------------------------------------ o calendário do CDI
// `cdi`: [['AAAA-MM-DD', fração ao dia]] (a série 12 do Banco Central, só os dias úteis). Devolve a série mais os dias de
// semana depois do último publicado até `ate` (exclusive), com a taxa do último (`[d, r, true]`).
// Com `ipca` ({ 'AAAA-MM': fração do mês }, a série 433), cada dia ganha o IPCA DO DIA e se ele é projetado:
// `[d, r, proj, ipcaDia, ipcaProj]` — o IPCA do mês repartido pelos dias úteis dele, (1 + IPCA)^(1/du), para o mês fechar
// exatamente no índice; o mês ainda sem IPCA publicado vai com o último publicado (`ipcaProj`). Os dias úteis de um mês
// são os do calendário; nas pontas (antes do primeiro dia e depois do último), os dias de semana que faltam.
export function calendario(cdi, ate, ipca = null) {
  // cada dia COPIADO: o IPCA anota o dia, e a série que entrou é a mesma de outros calendários
  const cal = (cdi ?? []).map((e) => [...e]).sort((a, b) => (a[0] < b[0] ? -1 : 1));
  if (!cal.length || !ate) return cal;
  const [ult, r] = cal[cal.length - 1];
  for (let d = maisDias(ult, 1); d < ate; d = maisDias(d, 1)) {
    const s = diaDaSemana(d);
    if (s !== 0 && s !== 6) cal.push([d, r, true]);
  }
  if (ipca) comIpca(cal, ipca);
  return cal;
}
const ehDiaDeSemana = (d) => { const s = diaDaSemana(d); return s !== 0 && s !== 6; };
function comIpca(cal, ipca) {
  const meses = Object.keys(ipca).filter((m) => Number.isFinite(ipca[m])).sort();
  const ultimo = meses.length ? ipca[meses[meses.length - 1]] : null;
  const du = new Map();
  cal.forEach(([d]) => du.set(d.slice(0, 7), (du.get(d.slice(0, 7)) ?? 0) + 1));
  // as pontas: os dias de semana do primeiro mês antes do calendário e do último depois dele
  const primeiro = cal[0][0]; const fim = cal[cal.length - 1][0];
  for (let d = `${primeiro.slice(0, 7)}-01`; d < primeiro; d = maisDias(d, 1)) if (ehDiaDeSemana(d)) du.set(primeiro.slice(0, 7), du.get(primeiro.slice(0, 7)) + 1);
  for (let d = maisDias(fim, 1); d.slice(0, 7) === fim.slice(0, 7); d = maisDias(d, 1)) if (ehDiaDeSemana(d)) du.set(fim.slice(0, 7), du.get(fim.slice(0, 7)) + 1);
  cal.forEach((e) => {
    const m = e[0].slice(0, 7);
    const doMes = Number.isFinite(ipca[m]) ? ipca[m] : null;
    const taxa = doMes ?? ultimo;
    e[3] = taxa === null ? 0 : Math.pow(1 + taxa, 1 / du.get(m)) - 1;
    e[4] = doMes === null;
  });
}
// o índice do primeiro dia do calendário em `d` ou depois
function inicioNoCal(cal, d) {
  let lo = 0; let hi = cal.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (cal[m][0] < d) lo = m + 1; else hi = m; }
  return lo;
}
// O fator de `de` (inclusive) a `ate` (exclusive), dia útil a dia útil, pelo `indexador`: 'cdi' — 1 + CDI do dia × `taxa`%;
// 'pre' — (1 + `taxa`% ao ano)^(1/252); 'ipca' — (1 + IPCA do dia) × (1 + `taxa`% ao ano)^(1/252). { f, dias, proj }:
// `proj` = os dias com a taxa projetada (o CDI depois do último publicado; no IPCA+, também o mês sem IPCA).
export function fator(cal, de, ate, taxa, indexador = 'cdi') {
  let f = 1; let dias = 0; let proj = 0;
  if (!de || !ate || ate <= de) return { f, dias, proj };
  const t = Number(taxa) / 100;
  const anoDia = indexador === 'cdi' ? 1 : Math.pow(1 + t, 1 / 252);
  for (let i = inicioNoCal(cal, de); i < cal.length && cal[i][0] < ate; i += 1) {
    const e = cal[i];
    f *= indexador === 'pre' ? anoDia : indexador === 'ipca' ? (1 + (e[3] ?? 0)) * anoDia : 1 + e[1] * t;
    dias += 1;
    if (e[2] || (indexador === 'ipca' && e[4] !== false)) proj += 1;
  }
  return { f, dias, proj };
}
// O DIA ÚTIL ANTERIOR a `data` no calendário (o sábado → a sexta; a terça depois do feriado de segunda → a sexta): onde
// começa o aporte que "rende desde o dia útil anterior" (`rende_dia_antes`, migration 024 — o RDB Planejado do Nubank).
// Sem dia antes no calendário, a própria data.
export function diaUtilAntes(data, cal) {
  const i = inicioNoCal(cal ?? [], data);
  return i > 0 ? cal[i - 1][0] : data;
}
// sábado ou domingo: o aporte desse dia só rende a partir do dia útil seguinte (a prévia e o balão dizem)
export const fimDeSemana = (iso) => { const s = diaDaSemana(iso); return s === 0 || s === 6; };

// O VENCIMENTO SUGERIDO pelo cadastro `inv` (só preenche o campo do aporte): a data + o prazo (`prazo_meses`), um dia
// antes se o cadastro diz (`vence_dia_antes`). O FIM DE SEMANA DEPENDE DO BANCO (08/11/2026, migration 023): com
// `vence_dia_util`, o sábado ou o domingo vai para a segunda (a XP: 05/06 + 12 meses vence em 07/06); sem, vence no dia
// (o Nubank: as datas do banco caem no sábado e no domingo). Antes era sempre a segunda, e o Nubank saía um ou dois dias
// depois do que o banco mostra.
export function sugerirVencimento(data, inv) {
  const { prazo_meses: prazoMeses, vence_dia_antes: diaAntes, vence_dia_util: diaUtil } = inv ?? {};
  if (!data || !prazoMeses) return null;
  const y = +data.slice(0, 4); const m = +data.slice(5, 7) - 1 + Number(prazoMeses); const d = +data.slice(8, 10);
  const ano = y + Math.floor(m / 12); const mes = ((m % 12) + 12) % 12;
  const ultimo = new Date(Date.UTC(ano, mes + 1, 0)).getUTCDate();
  let v = `${ano}-${p2(mes + 1)}-${p2(Math.min(d, ultimo))}`;
  if (diaAntes) v = maisDias(v, -1);
  if (!diaUtil) return v;
  const s = diaDaSemana(v);
  if (s === 6) v = maisDias(v, 2); else if (s === 0) v = maisDias(v, 1);
  return v;
}

// O QUE JÁ RENDEU UM DEPÓSITO que já estava aplicado (08/11/2026, a pedido): o total do dia em que você olhou o banco
// menos o que ele era no começo — o total ÷ o fator do CDI desde o depósito, na taxa do investimento (o mesmo dia do
// banco do dinheiro novo: o depósito de fim de semana começa no dia útil seguinte). Vale para UM depósito: o saque parcial tira do
// aplicado e do rendimento na mesma proporção, então ele não muda a conta. O "Rendimento bruto" da tela do banco, não:
// ele soma também o que saiu junto com os saques (conferido com o Nubank em 08/11/2026: a conta fechou no centavo o IR
// que falta pagar). Com `diaAntes` (o banco contou desde o dia útil anterior), a conta começa nele. { rendeu, aplicado,
// f, ini } ou null sem o CDI desde o depósito.
export function rendeuDoDeposito({ total, deposito, lido, taxa, indexador = 'cdi', diaAntes = false }, cal) {
  if (!(total > 0) || !deposito || !lido || deposito > lido || !cal?.length) return null;
  if (cal[0][0] > deposito) return null;
  const ini = diaAntes ? diaUtilAntes(deposito, cal) : deposito;
  const { f } = fator(cal, ini, lido, taxa ?? 100, indexador ?? 'cdi');
  const aplicado = Math.round(total / f);
  return { rendeu: total - aplicado, aplicado, f, ini };
}

// ------------------------------------------------------------ um aporte
// A partida: { data (desde quando rende: o CDI dos dias úteis a partir dela), valor, aplicado, desdeIR (a idade, para o
// IR; null = sem a data) }. O REAPLICADO (`reaplicado_de`) começa no próprio vencimento, como qualquer aporte: o valor do
// de antes já tem o CDI dos dias úteis antes do vencimento. O dinheiro novo com `rende_dia_antes` começa no dia útil
// anterior (o IR segue pela data do aporte).
export function partidaDoAporte(ap, cal = []) {
  const valor = Number(ap.valor_centavos);
  if (ap.origem === 'antigo') {
    return { data: ap.data, valor, aplicado: valor - Number(ap.rendeu_antes_centavos ?? 0), desdeIR: ap.aplicado_em ?? null };
  }
  const data = ap.rende_dia_antes && !ap.reaplicado_de ? diaUtilAntes(ap.data, cal) : ap.data;
  return { data, valor, aplicado: valor, desdeIR: ap.data };
}

// A POSIÇÃO DE UM APORTE no `dia` (o valor tem o CDI dos dias úteis antes dele), com os eventos ATÉ `eventosAte`
// (inclusive; o padrão é o próprio dia): os resgates em ordem (cada um tira do valor e diminui o aplicado na mesma
// proporção) e o vencimento (o valor para no dia: volta para a conta ou, se o cadastro reaplica, vira um aporte novo —
// `reaplicacoesDevidas`). Devolve { vale, aplicado, rendeu, ir, iof,
// liquido, aliquota, idade, semData, encerrado: null | { data, motivo, valor }, saidas: [{ data, valor }], partida,
// conta: { de, f, dias, proj } (o trecho desde o último evento) }.
export function posicaoDoAporte(ap, inv, resgates, cal, dia, eventosAte = dia) {
  const p = partidaDoAporte(ap, cal);
  const taxa = inv?.taxa ?? 100;
  const idx = inv?.indexador ?? 'cdi';
  let base = p.valor; let de = p.data; let aplicado = p.aplicado;
  const saidas = [];
  let encerrado = null;
  const valorEm = (d) => base * fator(cal, de, d, taxa, idx).f;
  const eventos = [
    ...(resgates ?? []).filter((r) => r.data <= eventosAte).map((r) => ({ tipo: 'resgate', data: r.data < p.data ? p.data : r.data, r })),
    ...(ap.vencimento && ap.vencimento <= eventosAte ? [{ tipo: 'vencimento', data: ap.vencimento }] : []),
  ].sort((a, b) => (a.data < b.data ? -1 : a.data > b.data ? 1 : a.tipo === 'resgate' ? -1 : 1));
  for (const e of eventos) {
    const v = valorEm(e.data);
    if (e.tipo === 'vencimento' || e.r.tudo || Number(e.r.valor_centavos) >= Math.round(v)) {
      encerrado = { data: e.data, motivo: e.tipo === 'vencimento' ? 'vencimento' : 'resgate', valor: Math.round(v), aplicado: Math.round(aplicado) };
      saidas.push({ data: e.data, valor: Math.round(v) });
      break;
    }
    const x = Number(e.r.valor_centavos);
    aplicado *= (v - x) / v;
    base = v - x; de = e.data;
    saidas.push({ data: e.data, valor: x });
  }
  if (encerrado) {
    return { vale: 0, aplicado: 0, rendeu: 0, ir: 0, iof: 0, liquido: 0, aliquota: null, idade: null, semData: false, encerrado, saidas, partida: p, conta: null, exato: { vale: 0, aplicado: 0 } };
  }
  const conta = { de, ...fator(cal, de, dia, taxa, idx) };
  // `exato`: sem arredondar — o TOTAL do investimento soma os exatos e arredonda no fim, como o banco (arredondando cada
  // aporte, um total do Nubank dava 1 centavo a mais)
  const exato = { vale: base * conta.f, aplicado };
  const vale = Math.round(exato.vale);
  const apl = Math.round(aplicado);
  const rendeu = vale - apl;
  const semData = !p.desdeIR;
  const idade = semData ? null : diasEntre(p.desdeIR, dia);
  const aliquota = ehIsento(inv?.tipo) ? 0 : semData ? FAIXAS_IR[0].aliquota : aliquotaIR(idade);
  const ganho = Math.max(0, rendeu);
  const { iof, ir } = impostos(ganho, idade, aliquota);
  return { vale, aplicado: apl, rendeu, ir, iof, liquido: vale - ir - iof, aliquota, idade, semData, encerrado: null, saidas, partida: p, conta, exato };
}

// ------------------------------------------------------------ o vencimento: volta para a conta ou reaplica
// O QUE O VENCIMENTO DEVOLVE (a posição de um aporte encerrado pelo vencimento): o valor do dia, o IR e o IOF pela idade
// do aporte nesse dia, e o LÍQUIDO — o que volta para a conta ou o que o banco reaplica. null se não venceu.
export function noVencimento(inv, pos) {
  const e = pos?.encerrado;
  if (!e || e.motivo !== 'vencimento') return null;
  const ganho = Math.max(0, e.valor - e.aplicado);
  const desde = pos.partida?.desdeIR ?? null;
  const idade = desde ? diasEntre(desde, e.data) : null;
  const aliquota = ehIsento(inv?.tipo) ? 0 : idade === null ? FAIXAS_IR[0].aliquota : aliquotaIR(idade);
  const { iof, ir } = impostos(ganho, idade, aliquota);
  return { data: e.data, valor: e.valor, aplicado: e.aplicado, ir, iof, liquido: e.valor - ir - iof, aliquota, idade };
}

// O APORTE NOVO DE UMA REAPLICAÇÃO (o automático e o do botão "Reaplicar"): a data é o vencimento, o valor é o líquido
// (o IR recomeça: é uma aplicação nova) e o vencimento sai do prazo do cadastro. As colunas de `inv_aportes`.
export function aporteReaplicado(ap, inv, venc, { conferir = false } = {}) {
  return {
    investimento_id: inv.id, origem: 'novo', data: venc.data, valor_centavos: venc.liquido, rendeu_antes_centavos: 0, aplicado_em: null,
    vencimento: sugerirVencimento(venc.data, inv), reaplicado_de: ap.id, conferir,
  };
}

// AS REAPLICAÇÕES QUE FALTAM: cada aporte de um investimento que REAPLICA (`no_vencimento`), que venceu até hoje, que não
// foi marcado para não reaplicar e que ainda não virou outro. Só com o CDI desde a partida dele (sem ele, o valor do
// vencimento sairia errado). [{ ap, inv, venc, dados }] — `dados` já com "conferir".
export function reaplicacoesDevidas({ cadastro = [], aportes = [], resgates = [], cal = [], hoje }) {
  const invPorId = new Map(cadastro.map((i) => [i.id, i]));
  const jaVirou = new Set(aportes.map((a) => a.reaplicado_de).filter(Boolean));
  const out = [];
  aportes.forEach((ap) => {
    const inv = invPorId.get(ap.investimento_id);
    if (!inv || inv.no_vencimento !== 'reaplica' || !ap.vencimento || ap.vencimento > hoje || ap.nao_reaplicar || jaVirou.has(ap.id)) return;
    const p = partidaDoAporte(ap, cal);
    if (!cal.length || cal[0][0] > p.data) return;
    const rs = resgates.filter((r) => r.aporte_id === ap.id).sort((a, b) => (a.data < b.data ? -1 : 1));
    const venc = noVencimento(inv, posicaoDoAporte(ap, inv, rs, cal, hoje));
    if (!venc || venc.liquido <= 0) return;
    out.push({ ap, inv, venc, dados: aporteReaplicado(ap, inv, venc, { conferir: true }) });
  });
  return out;
}

// QUANDO O CADASTRO PASSA A REAPLICAR, o que já tinha vencido ANTES DE HOJE fica como voltou para a conta (o app não
// reaplica o passado sozinho; o "Reaplicar" da linha do encerrado continua lá): os ids para marcar `nao_reaplicar`.
export function vencidosAntesDeReaplicar(aportes, investimentoId, hoje) {
  const jaVirou = new Set(aportes.map((a) => a.reaplicado_de).filter(Boolean));
  return aportes.filter((a) => a.investimento_id === investimentoId && a.vencimento && a.vencimento < hoje && !a.nao_reaplicar && !jaVirou.has(a.id)).map((a) => a.id);
}

// ------------------------------------------------------------ a carteira
// Os totais de uma lista de aportes: o vale e o aplicado pelos EXATOS, arredondados no fim; o IR e o IOF, cada um a soma
// dos de cada aporte (09/11/2026: SEPARADOS — a tabela tem uma coluna para cada; antes o `ir` era os dois juntos).
export function somarPosicoes(lista) {
  let vale = 0; let aplicado = 0; let ir = 0; let iof = 0;
  lista.forEach((x) => { vale += x.pos.exato.vale; aplicado += x.pos.exato.aplicado; ir += x.pos.ir; iof += x.pos.iof; });
  const v = Math.round(vale); const a = Math.round(aplicado);
  return { aplicado: a, vale: v, rendeu: v - a, ir, iof, liquido: v - ir - iof };
}
const somar = somarPosicoes;
const ordemAporte = (a) => (a.origem === 'antigo' ? a.aplicado_em ?? a.data : a.data);

// A CARTEIRA DE HOJE: as instituições (na ordem do cadastro, `instituicoesEmOrdem`), os investimentos de cada uma (pela `ordem` e o nome) e os
// aportes de cada investimento (do mais antigo ao mais novo), cada um com a posição; os encerrados (vencidos ou resgatados
// inteiros) à parte. O investimento desativado sem aporte aberto não aparece.
export function montarCarteira({ cadastro = [], aportes = [], resgates = [], cdi = [], ipca = null, hoje }) {
  const cal = calendario(cdi, hoje, ipca);
  const porAporte = new Map();
  resgates.forEach((r) => { if (!porAporte.has(r.aporte_id)) porAporte.set(r.aporte_id, []); porAporte.get(r.aporte_id).push(r); });
  const invPorId = new Map(cadastro.map((i) => [i.id, i]));
  // `seguinte`: o aporte em que este virou no vencimento (reaplicado), se virou
  const seguintes = new Map(aportes.filter((a) => a.reaplicado_de).map((a) => [a.reaplicado_de, a]));
  const itens = aportes.filter((a) => invPorId.has(a.investimento_id)).map((ap) => {
    const inv = invPorId.get(ap.investimento_id);
    const rs = (porAporte.get(ap.id) ?? []).slice().sort((a, b) => (a.data < b.data ? -1 : 1));
    return { ap, inv, resgates: rs, pos: posicaoDoAporte(ap, inv, rs, cal, hoje), seguinte: seguintes.get(ap.id) ?? null };
  });
  const abertos = itens.filter((x) => !x.pos.encerrado);
  const grupos = instituicoesEmOrdem(cadastro).map((nome) => {
    const invs = investimentosEmOrdem(cadastro, nome)
      .map((inv) => {
        const aps = abertos.filter((x) => x.inv.id === inv.id).sort((a, b) => (ordemAporte(a.ap) < ordemAporte(b.ap) ? -1 : 1));
        const vence = aps.map((x) => x.ap.vencimento).filter(Boolean).sort()[0] ?? null;
        return { inv, aportes: aps, totais: somar(aps), proximoVencimento: vence };
      })
      .filter((x) => x.inv.ativo !== false || x.aportes.length);
    return { instituicao: nome, investimentos: invs, totais: somar(invs.flatMap((x) => x.aportes)) };
  }).filter((g) => g.investimentos.length);
  const encerrados = itens.filter((x) => x.pos.encerrado).sort((a, b) => (a.pos.encerrado.data < b.pos.encerrado.data ? 1 : -1));
  return { cal, grupos, itens, encerrados, total: somar(abertos), semTaxas: !cdi?.length && aportes.length > 0 };
}

// ------------------------------------------------------------ o mês a mês (o painel e os Indicadores)
const proximoMes = (c) => { const [y, m] = c.split('-').map(Number); return m === 12 ? `${y + 1}-01` : `${y}-${p2(m + 1)}`; };
const fimDoMes = (c) => maisDias(`${proximoMes(c)}-01`, -1);
// O fim de cada mês, do primeiro aporte até o mês de hoje: { competencia, total, aportado, rendimentoAcum, aportes
// (o que entrou), resgates (o que saiu: resgates e vencimentos), rendeu, pct }. O passado vale no 1º dia do mês seguinte
// (com todo o CDI do mês); o mês corrente, hoje. Rendeu = total − total do mês anterior − o que entrou + o que saiu; o % =
// rendeu ÷ o capital do mês: o total anterior + cada entrada (− cada saída) pesada pelos DIAS ÚTEIS do mês em que ficou
// aplicada (o aporte de 07/04 conta 18 dos 20 dias úteis de abril; com "metade", abril dava 1,86% contra 1,09% do CDI).
// `base`: esse capital (o Patrimônio compara o que rendeu com o que o CDI daria nele).
// O PASSADO PELA CONTA (09/11/2026, a tela nova do Patrimônio): o "já estava aplicado" COM A DATA DO DEPÓSITO entra no mês
// do depósito, com o que foi aplicado (o total − o que já tinha rendido), e até o dia em que você olhou o banco vale o
// número dele descontado o CDI de cada dia até lá (o fator do índice, `fator`). É o que AINDA ESTÁ aplicado: o depósito
// que teve saques aparece no passado só com o que sobrou. Sem a data do depósito, ele entra como dinheiro novo no mês em
// que você o lançou, com o total (como antes).
export function mesAMes({ cadastro = [], aportes = [], resgates = [], cdi = [], ipca = null, hoje }) {
  const cal = calendario(cdi, hoje, ipca);
  const invPorId = new Map(cadastro.map((i) => [i.id, i]));
  const rsDe = (id) => resgates.filter((r) => r.aporte_id === id).sort((a, b) => (a.data < b.data ? -1 : 1));
  const aps = aportes.filter((a) => invPorId.has(a.investimento_id));
  if (!aps.length) return [];
  const saidas = aps.flatMap((ap) => posicaoDoAporte(ap, invPorId.get(ap.investimento_id), rsDe(ap.id), cal, hoje).saidas);
  const comDeposito = (ap) => ap.origem === 'antigo' && !!ap.aplicado_em;
  const desde = (ap) => (comDeposito(ap) ? ap.aplicado_em : ap.data);
  const entradaDe = (ap) => (comDeposito(ap)
    ? { data: ap.aplicado_em, valor: Number(ap.valor_centavos) - Number(ap.rendeu_antes_centavos ?? 0) }
    : { data: partidaDoAporte(ap, cal).data, valor: Number(ap.valor_centavos) });
  const inicio = aps.map(desde).sort()[0].slice(0, 7);
  const atual = hoje.slice(0, 7);
  const out = [];
  let anterior = 0;
  for (let c = inicio; c <= atual; c = proximoMes(c)) {
    const corte = c === atual ? hoje : fimDoMes(c);
    const dia = c === atual ? hoje : maisDias(corte, 1);
    let soma = 0; let somaAplicado = 0;
    aps.filter((a) => desde(a) <= corte).forEach((ap) => {
      const inv = invPorId.get(ap.investimento_id);
      if (comDeposito(ap) && dia < ap.data) {
        // antes do dia em que você olhou o banco: o número dele, descontado o rendimento de cada dia útil até lá
        soma += Number(ap.valor_centavos) / fator(cal, dia, ap.data, inv.taxa ?? 100, inv.indexador ?? 'cdi').f;
        somaAplicado += Number(ap.valor_centavos) - Number(ap.rendeu_antes_centavos ?? 0);
        return;
      }
      const pos = posicaoDoAporte(ap, inv, rsDe(ap.id), cal, dia, corte);
      soma += pos.exato.vale; somaAplicado += pos.exato.aplicado;
    });
    const total = Math.round(soma); const aportado = Math.round(somaAplicado);
    const entradas = aps.filter((a) => desde(a).slice(0, 7) === c).map(entradaDe);
    const saidasMes = saidas.filter((s) => s.data.slice(0, 7) === c);
    const entrou = entradas.reduce((s, a) => s + a.valor, 0);
    const saiu = saidasMes.reduce((t, s) => t + s.valor, 0);
    const rendeu = total - anterior - entrou + saiu;
    // o peso de um movimento: os dias úteis do mês que ainda faltavam quando ele aconteceu
    const diasMes = fator(cal, `${c}-01`, dia, 100).dias;
    const peso = (d) => (diasMes ? fator(cal, d < `${c}-01` ? `${c}-01` : d, dia, 100).dias / diasMes : 0.5);
    const base = anterior + entradas.reduce((s, e) => s + e.valor * peso(e.data), 0) - saidasMes.reduce((s, e) => s + e.valor * peso(e.data), 0);
    out.push({ competencia: c, total, aportado, rendimentoAcum: total - aportado, aportes: entrou, resgates: saiu, rendeu, base, pct: base > 0 ? rendeu / base : null });
    anterior = total;
  }
  return out;
}

// ------------------------------------------------------------ o formulário do aporte
// Lê o pop-up "Lançar aporte" e devolve { dados } (as colunas de `inv_aportes`) ou { erro } com o que falta. `f`: { modo:
// 'novo' | 'antigo', investimento_id, data, valor, vencimento, lido, total, rendeu, aplicado_em } (datas 'AAAA-MM-DD' ou '',
// valores já em centavos ou null).
export function lerAporte(f, hoje) {
  if (!f.investimento_id) return { erro: 'Escolha o investimento.' };
  // o "rende desde o dia útil anterior" só vai quando ligado (sem a migration 024, o aporte de antes segue gravando)
  const diaAntes = f.diaAntes ? { rende_dia_antes: true } : {};
  if (f.modo === 'antigo') {
    if (!f.lido) return { erro: 'Falta o dia em que você olhou o banco.' };
    if (f.lido > hoje) return { erro: 'O dia em que você olhou o banco ainda não chegou.' };
    if (!f.total || f.total <= 0) return { erro: 'Falta quanto tem hoje no banco.' };
    const rendeu = f.rendeu ?? 0;
    if (rendeu < 0) return { erro: 'O rendimento não pode ser negativo.' };
    if (rendeu >= f.total) return { erro: 'O rendimento precisa ser menor que o total.' };
    if (f.aplicado_em && f.aplicado_em > f.lido) return { erro: 'A data do depósito não pode ser depois do dia em que você olhou o banco.' };
    if (f.vencimento && f.vencimento <= f.lido) return { erro: 'O vencimento precisa ser depois do dia em que você olhou o banco.' };
    return { dados: { investimento_id: f.investimento_id, origem: 'antigo', data: f.lido, valor_centavos: f.total, rendeu_antes_centavos: rendeu, aplicado_em: f.aplicado_em || null, vencimento: f.vencimento || null, ...diaAntes } };
  }
  if (!f.data) return { erro: 'Falta a data do aporte.' };
  if (f.data > hoje) return { erro: 'A data do aporte ainda não chegou.' };
  if (!f.valor || f.valor <= 0) return { erro: 'Falta o valor.' };
  if (f.vencimento && f.vencimento <= f.data) return { erro: 'O vencimento precisa ser depois do aporte.' };
  return { dados: { investimento_id: f.investimento_id, origem: 'novo', data: f.data, valor_centavos: f.valor, rendeu_antes_centavos: 0, aplicado_em: null, vencimento: f.vencimento || null, ...diaAntes } };
}

// O RESGATE de um aporte: { dados } (as colunas de `inv_resgates`) ou { erro }. `vale`: o que o aporte vale no dia.
export function lerResgate({ aporte, data, valor, tudo }, partidaData, vale, hoje) {
  if (!data) return { erro: 'Falta a data do resgate.' };
  if (data > hoje) return { erro: 'A data do resgate ainda não chegou.' };
  if (data < partidaData) return { erro: 'O resgate não pode ser antes do aporte.' };
  if (tudo) return { dados: { aporte_id: aporte, data, valor_centavos: null, tudo: true } };
  if (!valor || valor <= 0) return { erro: 'Falta o valor (ou marque "Tudo").' };
  if (valor >= vale) return { dados: { aporte_id: aporte, data, valor_centavos: null, tudo: true } };
  return { dados: { aporte_id: aporte, data, valor_centavos: valor, tudo: false } };
}

// ------------------------------------------------------------ o cadastro em tabela
// A ORDEM (09/11/2026, a opção A do mockup "Cadastro dos investimentos"): a INSTITUIÇÃO não tem tabela (é o texto do
// cadastro), então a ordem dela é a do PRIMEIRO investimento dela, a menor `ordem` (no empate, o nome: com tudo em 0,
// segue alfabética, como era). Arrastar no cadastro renumera os investimentos 1, 2, 3… na ordem da tela, e as
// instituições seguem. Os investimentos de cada uma pela `ordem` e o nome. Vale na carteira, no painel e no cadastro.
const porOrdem = (a, b) => (a.ordem ?? 0) - (b.ordem ?? 0) || a.nome.localeCompare(b.nome, 'pt-BR');
export function instituicoesEmOrdem(cadastro) {
  const menor = new Map();
  cadastro.forEach((i) => {
    const n = i.instituicao.trim();
    const o = i.ordem ?? 0;
    if (!menor.has(n) || o < menor.get(n)) menor.set(n, o);
  });
  return [...menor.keys()].sort((a, b) => menor.get(a) - menor.get(b) || a.localeCompare(b, 'pt-BR'));
}
export const investimentosEmOrdem = (cadastro, nome) => cadastro.filter((i) => i.instituicao.trim() === nome).sort(porOrdem);

// A `ordem` que o cadastro grava. `ids`: os investimentos na ordem da tela (os novos também). Se os que já existiam
// seguem na ordem de quando abriu, só os novos ganham ordem (depois da maior, na ordem da tela); se a ordem mudou,
// TODOS renumeram 1, 2, 3…. Devolve Map id → ordem só com o que muda (os novos sempre).
export function ordensDoCadastro(ids, cadastro) {
  const porId = new Map(cadastro.map((i) => [i.id, i]));
  const antes = instituicoesEmOrdem(cadastro).flatMap((n) => investimentosEmOrdem(cadastro, n).map((i) => i.id));
  const existentes = ids.filter((id) => porId.has(id));
  const igual = existentes.length === antes.length && existentes.every((id, k) => id === antes[k]);
  const out = new Map();
  if (igual) {
    let o = Math.max(0, ...cadastro.map((i) => i.ordem ?? 0));
    ids.forEach((id) => { if (!porId.has(id)) { o += 1; out.set(id, o); } });
    return out;
  }
  ids.forEach((id, k) => { const i = porId.get(id); if (!i || (i.ordem ?? 0) !== k + 1) out.set(id, k + 1); });
  return out;
}

// O ARRASTO DO CADASTRO. `ids`: a lista da tela como o `useListaArrastavel` devolve (`g:<grupo>` e `i:<investimento>`,
// com o arrastado no lugar novo); `arrastado`: o id que se move; `antes`: a lista de antes. Devolve { grupos: [id do
// grupo], linhas: [{ id, grupo }] } na ordem nova, ou null quando nada vale (o investimento acima da primeira instituição).
// O INVESTIMENTO fica no grupo do cabeçalho acima dele (é assim que ele muda de instituição). A INSTITUIÇÃO leva os
// investimentos dela junto; o hook só move o cabeçalho, então o lugar dela é decidido pelo bloco em que ele caiu:
// descendo, depois desse bloco; subindo, antes dele (acima de tudo = a primeira).
const semPrefixo = (x) => x.slice(2);
function investimentosPorGrupo(lista) {
  let g = null;
  const out = [];
  lista.forEach((x) => { if (x.startsWith('g:')) g = semPrefixo(x); else out.push({ id: semPrefixo(x), grupo: g }); });
  return out;
}
export function arrastoDoCadastro(ids, arrastado, antes) {
  const gruposAntes = antes.filter((x) => x.startsWith('g:'));
  if (arrastado.startsWith('g:')) {
    const pos = ids.indexOf(arrastado);
    let dono = null;
    for (let k = pos - 1; k >= 0; k -= 1) if (ids[k].startsWith('g:')) { dono = ids[k]; break; }
    const outros = gruposAntes.filter((g) => g !== arrastado);
    let at = 0;
    if (dono) at = outros.indexOf(dono) + (gruposAntes.indexOf(dono) > gruposAntes.indexOf(arrastado) ? 1 : 0);
    const grupos = [...outros.slice(0, at), arrastado, ...outros.slice(at)];
    return { grupos: grupos.map(semPrefixo), linhas: investimentosPorGrupo(antes) };
  }
  if (!ids[0]?.startsWith('g:')) return null;
  return { grupos: ids.filter((x) => x.startsWith('g:')).map(semPrefixo), linhas: investimentosPorGrupo(ids) };
}

export const linhaDoCadastro = (i) => ({
  id: i.id, novo: false, orig: i, nome: i.nome, instituicao: i.instituicao, tipo: i.tipo, taxa: String(i.taxa).replace('.', ','),
  resgate: i.resgate, prazo_meses: i.prazo_meses ? String(i.prazo_meses) : '', vence_dia_antes: !!i.vence_dia_antes,
  indexador: i.indexador ?? 'cdi', vence_dia_util: !!i.vence_dia_util, no_vencimento: i.no_vencimento ?? 'conta', ativo: i.ativo !== false, excluir: false,
});
export const linhaNovaDoCadastro = (id, instituicao) => ({
  id, novo: true, orig: null, nome: '', instituicao, tipo: 'cdb', taxa: '100', resgate: 'diaria', prazo_meses: '', vence_dia_antes: false,
  indexador: 'cdi', vence_dia_util: false, no_vencimento: 'conta', ativo: true, excluir: false,
});
export const linhaVaziaDoCadastro = (l) => l.novo && !l.nome.trim();
const lerTaxa = (t) => { const n = Number(String(t ?? '').replace(/\s|%/g, '').replace(',', '.')); return Number.isFinite(n) && n > 0 ? n : null; };
// As colunas de `inv_cadastro` de uma linha. O `no_vencimento` só vai quando é "reaplica" e o `vence_dia_util` quando é
// true (os padrões do banco): sem as migrations 022 e 023, o cadastro de antes segue gravando.
export function dadosDoCadastro(l) {
  return {
    nome: l.nome.trim(), instituicao: l.instituicao.trim(), tipo: l.tipo, taxa: lerTaxa(l.taxa), resgate: l.resgate,
    prazo_meses: l.prazo_meses ? Number(l.prazo_meses) : null, vence_dia_antes: !!l.vence_dia_antes, ativo: !!l.ativo,
    ...(l.no_vencimento === 'reaplica' ? { no_vencimento: 'reaplica' } : {}),
    ...(l.vence_dia_util ? { vence_dia_util: true } : {}),
    ...(l.indexador && l.indexador !== 'cdi' ? { indexador: l.indexador } : {}),
  };
}
// O que mudou numa linha que já existia ({} = nada).
export function diferencaDoCadastro(l) {
  if (l.novo) return dadosDoCadastro(l);
  const { no_vencimento: _nv, vence_dia_util: _du, indexador: _ix, ...d } = dadosDoCadastro(l); const o = l.orig; const out = {};
  Object.entries(d).forEach(([k, v]) => {
    const antes = k === 'taxa' ? Number(o.taxa) : k === 'prazo_meses' ? (o.prazo_meses ?? null) : k === 'ativo' ? o.ativo !== false : k === 'vence_dia_antes' ? !!o.vence_dia_antes : o[k];
    if (v !== antes) out[k] = v;
  });
  if ((l.no_vencimento ?? 'conta') !== (o.no_vencimento ?? 'conta')) out.no_vencimento = l.no_vencimento;
  if (!!l.vence_dia_util !== !!o.vence_dia_util) out.vence_dia_util = !!l.vence_dia_util;
  if ((l.indexador ?? 'cdi') !== (o.indexador ?? 'cdi')) out.indexador = l.indexador ?? 'cdi';
  return out;
}
// O primeiro problema das linhas que vão ser gravadas: { id, campo, motivo } ou null.
export function validarCadastro(linhas) {
  for (const l of linhas) {
    if (l.excluir || linhaVaziaDoCadastro(l)) continue;
    if (!l.nome.trim()) return { id: l.id, campo: 'nome', motivo: 'falta o nome de um investimento' };
    if (!l.instituicao.trim()) return { id: l.id, campo: 'instituicao', motivo: `falta a instituição de "${l.nome.trim()}"` };
    if (lerTaxa(l.taxa) === null) return { id: l.id, campo: 'taxa', motivo: `a taxa de "${l.nome.trim()}" não é um número` };
    if (l.no_vencimento === 'reaplica' && !l.prazo_meses) return { id: l.id, campo: 'prazo_meses', motivo: `"${l.nome.trim()}" reaplica: escolha em quanto tempo ele vence (é o prazo do aporte novo)` };
  }
  return null;
}
