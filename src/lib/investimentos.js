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
  // o dinheiro parado na conta corrente (migration 015): um investimento de liquidez diária, sem rendimento contratado
  { value: 'saldo', label: 'Saldo em conta', semIr: true, garantia: 'FGC' },
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
  // cada aplicação vence `prazo_meses` depois da data dela; `ao_vencer` 'reaplica' | 'volta' (migration 015)
  { value: 'por_aplicacao', label: 'Cada aplicação vence depois de…' },
];
export const AO_VENCER = [
  { value: 'reaplica', label: 'Reaplica sozinho' },
  { value: 'volta', label: 'Volta para a conta' },
];

const tipoDe = (t) => TIPOS_INVESTIMENTO.find((x) => x.value === t) ?? TIPOS_INVESTIMENTO[TIPOS_INVESTIMENTO.length - 1];
export const nomeTipoInvestimento = (t) => tipoDe(t).label;

// "Isento de IR · FGC", "IR regressivo · Tesouro Nacional", "IR do fundo" — o que o tipo diz.
export function impostoGarantia(tipo) {
  const t = tipoDe(tipo);
  if (t.value === 'outro') return '';
  if (t.semIr) return t.garantia;
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
// O prazo em palavras: 12 → "1 ano", 24 → "2 anos", 18 → "18 meses".
export const rotuloPrazo = (meses) => (meses % 12 === 0 ? `${meses / 12} ${meses === 12 ? 'ano' : 'anos'}` : `${meses} meses`);
// "diária", "no vencimento", "D+30", "carência até 03/2027", "a cada 2 anos".
export function rotuloLiquidez({ liquidez, liquidez_dias: dias, carencia_ate: ate, prazo_meses: prazo }) {
  if (liquidez === 'por_aplicacao') return prazo ? `a cada ${rotuloPrazo(prazo)}` : 'prazo por aplicação';
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
// `valores` e `movimentos` (opcionais): com eles, cada título traz também as aplicações e quando cada uma vence
// (`prazos`, de `aplicacoesComPrazo`) — o que a coluna Resgate e a ficha mostram no "cada aplicação vence".
export function carteira({ contas, investimentos = [], meses, hoje, ano = hoje.slice(0, 4), encerrados = false, valores = [], movimentos = [] }) {
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
        prazos: inv.liquidez === 'por_aplicacao' ? aplicacoesComPrazo({ inv, fotos: valores.filter((v) => v.investimento_id === inv.id), movimentos, hoje }) : null,
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
export const COLUNAS_TEXTO = ['nome', 'liquidez', 'vence', 'resgate'];
const chaves = {
  nome: (x) => x.inv.nome.toLocaleLowerCase('pt-BR'),
  // a coluna Resgate: o que sai quando quiser primeiro, depois pela data em que o dinheiro fica livre
  resgate: (x) => (x.diaria ? '0' : `1${x.prazos?.proximo?.vence ?? x.inv.vencimento ?? x.inv.carencia_ate ?? '9999-12-31'}`),
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

// ------------------------------------------------------------ o cadastro em tabela (06/11/2026, "Patrimônio do zero")
// O QUE O TIPO JÁ DIZ: escolher o tipo numa linha nova preenche o "rende" e o prazo (o Tesouro Selic já vem diário, a
// LCI no vencimento); o que a pessoa mudou à mão não é trocado.
const PADRAO = {
  cdb: { indexador: 'cdi_pct', taxa: '100', liquidez: 'diaria' },
  lci: { indexador: 'cdi_pct', taxa: '', liquidez: 'vencimento' },
  lca: { indexador: 'cdi_pct', taxa: '', liquidez: 'vencimento' },
  rdb: { indexador: 'cdi_pct', taxa: '100', liquidez: 'diaria' },
  tesouro_selic: { indexador: 'selic_mais', taxa: '', liquidez: 'diaria' },
  tesouro_ipca: { indexador: 'ipca_mais', taxa: '', liquidez: 'diaria' },
  tesouro_prefixado: { indexador: 'prefixado', taxa: '', liquidez: 'diaria' },
  debenture: { indexador: 'ipca_mais', taxa: '', liquidez: 'vencimento' },
  cri_cra: { indexador: 'ipca_mais', taxa: '', liquidez: 'vencimento' },
  fundo: { indexador: '', taxa: '', liquidez: 'dias' },
  poupanca: { indexador: '', taxa: '', liquidez: 'diaria' },
  saldo: { indexador: '', taxa: '', liquidez: 'diaria' },
  outro: { indexador: '', taxa: '', liquidez: 'diaria' },
};
export const padraoDoTipo = (tipo) => PADRAO[tipo] ?? PADRAO.outro;

// Uma linha da tabela a partir do investimento gravado (`vale`: o valor de hoje, só para mostrar — ele muda pelo
// "Atualizar valores"). Os números vão como TEXTO do campo (o que a pessoa digita).
const campoDe = (c) => (c === null || c === undefined ? '' : (Number(c) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const taxaDe = (t) => (t === null || t === undefined || t === '' ? '' : String(Number(t)).replace('.', ','));
export function linhaDoInvestimento(inv, vale = null) {
  return {
    id: inv.id, novo: false, excluir: false, orig: inv, conta_id: inv.conta_id, nome: inv.nome, tipo: inv.tipo,
    indexador: inv.indexador ?? '', taxa: taxaDe(inv.taxa), liquidez: inv.liquidez ?? 'diaria',
    liquidez_dias: inv.liquidez_dias ? String(inv.liquidez_dias) : '', carencia_ate: inv.carencia_ate ?? '', vencimento: inv.vencimento ?? '',
    prazo_meses: inv.prazo_meses ? String(inv.prazo_meses) : '', ao_vencer: inv.ao_vencer ?? 'reaplica',
    aplicado: campoDe(inv.aplicado_inicial_centavos), vale: vale === null ? '' : campoDe(vale),
    emissor: inv.emissor ?? '', observacao: inv.observacao ?? '', ativo: inv.ativo !== false,
  };
}
export function linhaNova(id, contaId) {
  return {
    id, novo: true, excluir: false, orig: null, conta_id: contaId, nome: '', tipo: 'cdb', ...padraoDoTipo('cdb'), liquidez_dias: '', carencia_ate: '',
    vencimento: '', prazo_meses: '', ao_vencer: 'reaplica', aplicado: '', vale: '', emissor: '', observacao: '', ativo: true,
  };
}

const lerTaxaTexto = (t) => {
  if (!String(t ?? '').trim()) return null;
  const n = Number(String(t).replace(/\s|%/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : NaN;
};
// O que a linha grava (os campos da tabela `investimentos`), já normalizado. `lerValor`: o `parseValor` do app (texto →
// centavos, null quando não lê).
export function dadosDaLinha(l, lerValor) {
  const ap = String(l.aplicado ?? '').trim() ? lerValor(l.aplicado) : null;
  return {
    conta_id: l.conta_id, nome: l.nome.trim(), tipo: l.tipo, indexador: l.indexador || null, taxa: l.indexador ? lerTaxaTexto(l.taxa) : null,
    liquidez: l.liquidez, liquidez_dias: l.liquidez === 'dias' ? Number(l.liquidez_dias) || null : null,
    carencia_ate: l.liquidez === 'carencia' ? l.carencia_ate || null : null,
    vencimento: l.liquidez === 'vencimento' || l.liquidez === 'diaria' ? l.vencimento || null : null,
    prazo_meses: l.liquidez === 'por_aplicacao' ? Number(l.prazo_meses) || null : null,
    ao_vencer: l.ao_vencer ?? 'reaplica', aplicado_inicial_centavos: ap, emissor: (l.emissor ?? '').trim(),
    observacao: (l.observacao ?? '').trim(), ativo: l.ativo !== false,
  };
}
// A diferença de uma linha gravada para o que está na tabela: { campo: valor novo } (vazio = nada mudou).
export function diferencaInvestimento(l, lerValor) {
  const d = dadosDaLinha(l, lerValor);
  if (l.novo) return d;
  const o = l.orig;
  const numero = (v) => (v === null || v === undefined || v === '' ? null : Number(v));
  const igual = (k) => {
    const a = d[k]; const b = o[k] ?? null;
    if (['taxa', 'aplicado_inicial_centavos', 'liquidez_dias', 'prazo_meses'].includes(k)) return numero(a) === numero(b);
    if (k === 'emissor' || k === 'observacao') return (a ?? '') === (b ?? '');
    if (k === 'ao_vencer') return a === (b ?? 'reaplica');
    if (k === 'ativo') return a === (b !== false);
    return (a ?? null) === b;
  };
  return Object.fromEntries(Object.keys(d).filter((k) => !igual(k)).map((k) => [k, d[k]]));
}
// A linha nova que ficou vazia (sem nome e sem valor) não conta: "Adicionar" sem preencher não atrapalha o salvar.
export const linhaVazia = (l) => l.novo && !l.nome.trim() && !String(l.vale ?? '').trim();
// O primeiro problema da tabela (o campo fica vermelho): { id, campo, motivo } ou null.
export function validarCadastro(linhas, lerValor) {
  for (const l of linhas) {
    if (l.excluir || linhaVazia(l)) continue;
    const nome = l.nome.trim() || 'o investimento novo';
    if (!l.nome.trim()) return { id: l.id, campo: 'nome', motivo: 'falta o nome de um investimento' };
    if (l.indexador && Number.isNaN(lerTaxaTexto(l.taxa))) return { id: l.id, campo: 'taxa', motivo: `a taxa de "${nome}" não é um número` };
    if (l.liquidez === 'por_aplicacao' && !(Number(l.prazo_meses) > 0)) return { id: l.id, campo: 'prazo', motivo: `falta o prazo de cada aplicação de "${nome}"` };
    if (l.liquidez === 'dias' && !(Number(l.liquidez_dias) > 0)) return { id: l.id, campo: 'prazo', motivo: `falta em quantos dias o resgate de "${nome}" cai` };
    if (String(l.aplicado ?? '').trim()) {
      const v = lerValor(l.aplicado);
      if (v === null || v < 0) return { id: l.id, campo: 'aplicado', motivo: `o valor aplicado de "${nome}" não é um valor` };
    }
    if (l.novo) {
      const v = String(l.vale ?? '').trim() ? lerValor(l.vale) : null;
      if (v === null || v < 0) return { id: l.id, campo: 'vale', motivo: `falta quanto "${nome}" vale hoje` };
    }
  }
  return null;
}

// ------------------------------------------------------------ o prazo de cada aplicação (o CDB de 2 anos que reaplica)
// As aplicações de um título e quando cada uma vence: a primeira é o que já estava aplicado no cadastro (o "valor
// aplicado", ou a primeira foto; a data é a da aplicação, se houver) e as outras, os aportes depois da primeira foto.
// O resgate sai das MAIS ANTIGAS (a primeira que entrou é a primeira que sai). Com `ao_vencer` 'reaplica', o vencimento
// que já passou ANDA mais um prazo (quantas vezes for preciso), sem virar resgate; com 'volta', fica o que venceu.
// Devolve { lotes: [{ data, valor, vence, renovacoes, vencida, frac, inicial }], proximo, prazo }.
const somaMeses = (iso, n) => {
  const [y, m, d] = iso.split('-').map(Number);
  const t = y * 12 + (m - 1) + n;
  const ano = Math.floor(t / 12); const mes = (t % 12) + 1;
  const ult = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  return `${ano}-${String(mes).padStart(2, '0')}-${String(Math.min(d, ult)).padStart(2, '0')}`;
};
export function aplicacoesComPrazo({ inv, fotos = [], movimentos = [], hoje }) {
  const fs = [...fotos].sort((a, b) => (a.data < b.data ? -1 : 1));
  const abre = fs[0];
  const inicial = inv.aplicado_inicial_centavos !== null && inv.aplicado_inicial_centavos !== undefined
    ? Number(inv.aplicado_inicial_centavos) : abre ? Number(abre.valor_centavos) : 0;
  const lotes = [];
  if (inicial > 0) lotes.push({ data: inv.aplicado_em || null, valor: inicial, inicial: true });
  movimentos.filter((m) => m.investimento_id === inv.id && (!abre || m.data > abre.data))
    .sort((a, b) => (a.data < b.data ? -1 : 1))
    .forEach((m) => {
      const v = Number(m.valor_centavos);
      if (m.tipo !== 'resgate') { lotes.push({ data: m.data, valor: v, inicial: false }); return; }
      let falta = v;
      for (const l of lotes) { if (falta <= 0) break; const tira = Math.min(l.valor, falta); l.valor -= tira; falta -= tira; }
    });
  const prazo = inv.liquidez === 'por_aplicacao' ? Number(inv.prazo_meses) || null : null;
  const vivos = lotes.filter((l) => l.valor > 0).map((l) => {
    if (!prazo || !l.data) return { ...l, vence: null, renovacoes: 0, vencida: false, frac: null };
    let vence = somaMeses(l.data, prazo);
    let renovacoes = 0;
    if (inv.ao_vencer !== 'volta') while (vence < hoje) { vence = somaMeses(vence, prazo); renovacoes += 1; }
    const comecou = renovacoes ? somaMeses(vence, -prazo) : l.data;
    const frac = Math.min(1, Math.max(0, diasEntre(comecou, hoje) / Math.max(1, diasEntre(comecou, vence))));
    return { ...l, vence, renovacoes, vencida: vence < hoje, frac };
  });
  const proximo = vivos.filter((l) => l.vence && !l.vencida).sort((a, b) => (a.vence < b.vence ? -1 : 1))[0] ?? null;
  return { lotes: vivos, proximo, prazo };
}

// ------------------------------------------------------------ o rendimento fora do normal (o aporte esquecido)
// No "Atualizar valores": um CDB que "rendeu" 21% num mês não rendeu, recebeu uma aplicação que não foi lançada (ou
// perdeu um resgate). O limite por mês depende do tipo — a renda fixa pós-fixada quase não oscila; o Tesouro IPCA+, o
// prefixado e os títulos marcados a mercado oscilam mais; o fundo e o "outro", mais ainda — e cresce com os meses entre
// as duas fotos. Devolve null (normal) ou { tipo: 'aporte' | 'resgate', valor (a sugestão, em R$ 100 redondos), pct }.
const LIMITES = { marcacao: { sobe: 0.05, desce: 0.05 }, livre: { sobe: 0.10, desce: 0.10 }, fixa: { sobe: 0.025, desce: 0.005 } };
const familia = (tipo) => (['tesouro_ipca', 'tesouro_prefixado', 'debenture', 'cri_cra'].includes(tipo) ? 'marcacao' : ['fundo', 'outro'].includes(tipo) ? 'livre' : 'fixa');
const ESPERADO_MES = 0.009; // ~ o CDI de um mês: o quanto se espera que tenha rendido de verdade
export function rendimentoForaDoNormal({ tipo, antes, novo, liquido = 0, dias }) {
  if (!(antes > 0) || novo === null || novo === undefined) return null;
  const meses = Math.max(1, (dias ?? 30) / 30);
  const rendeu = novo - antes - liquido;
  const base = antes + liquido / 2;
  if (!(base > 0)) return null;
  const pct = rendeu / base;
  const lim = LIMITES[familia(tipo)];
  const redondo = (c) => Math.max(10000, Math.round(c / 10000) * 10000);
  if (pct > lim.sobe * meses) return { tipo: 'aporte', valor: redondo(rendeu - base * ESPERADO_MES * meses), pct };
  if (pct < -lim.desce * meses) return { tipo: 'resgate', valor: redondo(-rendeu + base * ESPERADO_MES * meses), pct };
  return null;
}

// Os investimentos que pedem o valor do mês (o número do "Atualizar valores" e do menu): os ativos cuja última foto é
// de antes do fim do mês passado — virou o mês, todos pedem o valor do fim do mês que acabou.
export function pendentesDeValor({ investimentos = [], valores = [], hoje }) {
  const [y, m] = hoje.split('-').map(Number);
  const fimPassado = new Date(Date.UTC(y, m - 1, 0)).toISOString().slice(0, 10);
  const ultima = new Map();
  valores.forEach((v) => { if (!ultima.has(v.investimento_id) || v.data > ultima.get(v.investimento_id)) ultima.set(v.investimento_id, v.data); });
  return investimentos.filter((i) => i.ativo !== false && ultima.has(i.id) && ultima.get(i.id) < fimPassado);
}
