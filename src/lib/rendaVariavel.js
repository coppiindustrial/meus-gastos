// A RENDA VARIÁVEL (13/11/2026, o mockup "Renda variável", tabela A): as contas, todas puras (testadas em
// `test/rendaVariavel.test.js`). O ativo é o que o `rv_ativos` diz; o que aconteceu com ele está no `rv_operacoes`; a cotação
// de hoje vem do `rv_cotacoes` (a função `cotacoes` do Supabase grava). DINHEIRO EM CENTAVOS: o total da operação, as taxas
// e o provento, na moeda do ativo; o custo e o valor em reais também em centavos. A cotação é um número na moeda (104,35).
//
// O PREÇO MÉDIO é o da corretora: o que se pagou com as taxas ÷ a quantidade. A VENDA tira do custo pela mesma proporção (o
// preço médio não muda) e o lucro dela = o que entrou em reais − o custo médio em reais das cotas vendidas. NO EXTERIOR o
// custo em reais vai pelo DÓLAR DE CADA COMPRA (a conta do IR), e o valor de hoje pelo dólar de hoje: por isso o resultado
// tem a parte da ação e a parte do câmbio. O DESDOBRAMENTO multiplica a quantidade pelo fator (o grupamento é o fator < 1);
// o dinheiro não muda, e o preço médio se ajusta sozinho. O PROVENTO não muda a posição: é o que entrou na conta.

export const TIPOS = {
  acao_br: { nome: 'Ação', mercado: 'B3', moeda: 'BRL', classe: 'b3' },
  fii: { nome: 'FII', mercado: 'B3', moeda: 'BRL', classe: 'fii' },
  bdr: { nome: 'BDR', mercado: 'B3', moeda: 'BRL', classe: 'b3' },
  etf_br: { nome: 'ETF', mercado: 'B3', moeda: 'BRL', classe: 'b3' },
  acao_eua: { nome: 'Ação', mercado: 'EUA', moeda: 'USD', classe: 'ext' },
  etf_eua: { nome: 'ETF', mercado: 'EUA', moeda: 'USD', classe: 'ext' },
};
// as faixas da tabela, nesta ordem; a cor é a da faixa (as das origens e séries do app)
export const CLASSES = [
  { id: 'ext', nome: 'Exterior', moeda: 'USD', mercado: 'EUA', cor: 'var(--serie-gastos)' },
  { id: 'fii', nome: 'FIIs', moeda: 'BRL', mercado: 'B3', cor: 'var(--origem-fixo)' },
  { id: 'b3', nome: 'Ações da B3', moeda: 'BRL', mercado: 'B3', cor: 'var(--serie-entradas)' },
];
export const nomeDoTipo = (tipo) => TIPOS[tipo]?.nome ?? tipo;
export const classeDoTipo = (tipo) => TIPOS[tipo]?.classe ?? 'b3';
export const emDolar = (ativo) => ativo?.moeda === 'USD';
export const NOME_PROVENTO = { rendimento: 'Rendimento', dividendo: 'Dividendo', jcp: 'JCP' };

const porData = (a, b) => (a.data < b.data ? -1 : a.data > b.data ? 1 : String(a.criado_em ?? '').localeCompare(String(b.criado_em ?? '')));
const num = (v) => (v === null || v === undefined || v === '' ? null : Number(v));

// O preço de uma compra ou venda, na moeda (o total ÷ a quantidade, sem as taxas)
export const precoDaOperacao = (op) => (num(op.quantidade) ? Number(op.valor_centavos) / 100 / Number(op.quantidade) : null);
// O total de uma compra ou venda em centavos, pelo que se digita (quantidade × preço), arredondado no fim
export const totalDaOperacao = (quantidade, preco) => Math.round(Number(quantidade) * Number(preco) * 100);

// ------------------------------------------------------------------ a posição de um ativo
// `cotacao` = { preco, variacao_dia, ... } ou null; `dolar` = reais por dólar hoje; `hoje` = 'AAAA-MM-DD'.
export function posicaoDoAtivo(ativo, operacoes, { cotacao = null, dolar = null, hoje } = {}) {
  const usd = emDolar(ativo);
  const ops = operacoes.filter((o) => o.ativo_id === ativo.id).sort(porData);
  let qtd = 0; let custoMoeda = 0; let custoReais = 0; let ultimoPreco = null;
  const realizados = []; const proventos = []; const linhas = [];
  ops.forEach((op) => {
    const cambio = usd ? num(op.dolar) ?? dolar ?? 0 : 1;
    if (op.tipo === 'compra') {
      const q = Number(op.quantidade); const bruto = Number(op.valor_centavos) + Number(op.taxas_centavos ?? 0);
      qtd += q; custoMoeda += bruto; custoReais += bruto * cambio; ultimoPreco = precoDaOperacao(op);
      linhas.push({ op, custoReais: bruto * cambio });
    } else if (op.tipo === 'venda') {
      const q = Math.min(Number(op.quantidade), qtd);
      const f = qtd > 0 ? q / qtd : 0;
      const custoSai = custoReais * f;
      const recebido = (Number(op.valor_centavos) - Number(op.taxas_centavos ?? 0)) * cambio;
      realizados.push({ data: op.data, quantidade: q, recebido, custo: custoSai, lucro: recebido - custoSai, op });
      custoMoeda -= custoMoeda * f; custoReais -= custoSai; qtd -= q; ultimoPreco = precoDaOperacao(op);
      if (qtd < 1e-9) { qtd = 0; custoMoeda = 0; custoReais = 0; }
      linhas.push({ op, recebido, lucro: recebido - custoSai });
    } else if (op.tipo === 'desdobramento' || op.tipo === 'grupamento') {
      qtd *= Number(op.fator);
      if (ultimoPreco) ultimoPreco /= Number(op.fator); // o preço de antes, na quantidade de depois
      linhas.push({ op });
    } else if (op.tipo === 'provento') {
      const liquidoMoeda = Number(op.valor_centavos) - Number(op.retido_centavos ?? 0);
      proventos.push({ data: op.data, tipo: op.provento, bruto: Number(op.valor_centavos), retido: Number(op.retido_centavos ?? 0), liquidoMoeda, liquidoReais: liquidoMoeda * cambio, aReceber: !!hoje && op.data > hoje, op });
      linhas.push({ op, liquidoReais: liquidoMoeda * cambio });
    }
  });
  // a cotação de hoje; sem ela, o preço da última compra ou venda (a tela avisa)
  const preco = cotacao?.preco ? Number(cotacao.preco) : ultimoPreco;
  const cambioHoje = usd ? dolar ?? 0 : 1;
  const valorMoeda = preco ? qtd * preco * 100 : 0;
  const valorReais = valorMoeda * cambioHoje;
  const resultado = valorReais - custoReais;
  const resPct = custoReais > 0 ? resultado / custoReais : null;
  const resMoedaPct = custoMoeda > 0 ? valorMoeda / custoMoeda - 1 : null;
  // o lote de cada compra (para a linha dela): a quantidade de hoje (com os desdobramentos de depois) e o resultado; com uma
  // venda depois dela, o lote já não é inteiro — a linha só mostra o que pagou
  linhas.forEach((l) => {
    if (l.op.tipo !== 'compra') return;
    const depois = ops.filter((o) => porData(o, l.op) > 0);
    if (depois.some((o) => o.tipo === 'venda')) return;
    const fator = depois.filter((o) => o.tipo === 'desdobramento' || o.tipo === 'grupamento').reduce((f, o) => f * Number(o.fator), 1);
    const valor = preco ? Number(l.op.quantidade) * fator * preco * 100 * cambioHoje : 0;
    l.lote = { quantidade: Number(l.op.quantidade) * fator, valor, resultado: valor - l.custoReais };
  });
  return {
    ativo, usd, quantidade: qtd, custoMoeda, custoReais,
    precoMedio: qtd > 0 ? custoMoeda / qtd / 100 : null,
    custoMedioReais: qtd > 0 ? custoReais / qtd / 100 : null,
    preco, semCotacao: !cotacao?.preco, variacaoDia: num(cotacao?.variacao_dia), cotacao,
    valorMoeda, valorReais, resultado, resPct, resMoedaPct,
    // a parte do câmbio no resultado em reais: (1 + total) ÷ (1 + na moeda) − 1
    cambio: usd && resPct !== null && resMoedaPct !== null ? (1 + resPct) / (1 + resMoedaPct) - 1 : null,
    realizados, proventos, linhas,
  };
}

// Os proventos já pagos nos 12 meses até hoje (de hoje − 1 ano exclusive até hoje), em reais
export function proventosEm12Meses(proventos, hoje) {
  const desde = `${Number(hoje.slice(0, 4)) - 1}${hoje.slice(4)}`;
  return proventos.filter((p) => p.data > desde && p.data <= hoje).reduce((s, p) => s + p.liquidoReais, 0);
}

// ------------------------------------------------------------------ a carteira, em faixas
// Os ativos com posição (quantidade > 0) ou sem nenhuma operação ainda (acabou de cadastrar) entram; os vendidos inteiros
// vão para `vendidos`. Os totais somam os valores EXATOS e arredondam no fim, como a carteira da renda fixa.
export function carteiraRV({ ativos, operacoes, cotacoes = [], dolar = null, hoje }) {
  const cot = Object.fromEntries(cotacoes.map((c) => [c.ativo_id, c]));
  const posicoes = ativos.map((a) => posicaoDoAtivo(a, operacoes, { cotacao: cot[a.id], dolar, hoje }))
    .map((p) => ({ ...p, proventos12: proventosEm12Meses(p.proventos, hoje) }));
  const temOps = new Set(operacoes.map((o) => o.ativo_id));
  const naCarteira = posicoes.filter((p) => p.quantidade > 0 || (!temOps.has(p.ativo.id) && p.ativo.ativo !== false));
  const vendidos = posicoes.filter((p) => p.quantidade === 0 && temOps.has(p.ativo.id));
  const somar = (lista) => {
    const t = lista.reduce((s, p) => ({ valor: s.valor + p.valorReais, custo: s.custo + p.custoReais, proventos: s.proventos + p.proventos12 }), { valor: 0, custo: 0, proventos: 0 });
    return { valor: Math.round(t.valor), custo: Math.round(t.custo), resultado: Math.round(t.valor - t.custo), resPct: t.custo > 0 ? (t.valor - t.custo) / t.custo : null, proventos: Math.round(t.proventos) };
  };
  const ordem = (a, b) => (a.ativo.ordem ?? 0) - (b.ativo.ordem ?? 0) || a.ativo.ticker.localeCompare(b.ativo.ticker);
  const grupos = CLASSES.map((c) => {
    const lista = naCarteira.filter((p) => classeDoTipo(p.ativo.tipo) === c.id).sort(ordem);
    return { classe: c, posicoes: lista, totais: somar(lista) };
  });
  const total = somar(naCarteira);
  return { grupos, total, vendidos, semCotacao: naCarteira.some((p) => p.quantidade > 0 && p.semCotacao), posicoes };
}

// ------------------------------------------------------------------ os proventos por mês (o bloco do Patrimônio)
// `comps` = as competências do período ('AAAA-MM'), em ordem. Cada mês: o que cada ativo pagou (líquido, em reais) e o que
// ainda vai pagar (a data depois de hoje: o anunciado).
export function proventosPorMes(posicoes, comps) {
  const meses = comps.map((c) => ({ competencia: c, porAtivo: {}, aReceber: {}, total: 0, totalAReceber: 0 }));
  const idx = Object.fromEntries(comps.map((c, i) => [c, i]));
  posicoes.forEach((p) => p.proventos.forEach((pv) => {
    const i = idx[pv.data.slice(0, 7)];
    if (i === undefined) return;
    const m = meses[i]; const tk = p.ativo.ticker;
    m.porAtivo[tk] = (m.porAtivo[tk] ?? 0) + pv.liquidoReais;
    m.total += pv.liquidoReais;
    if (pv.aReceber) { m.aReceber[tk] = (m.aReceber[tk] ?? 0) + pv.liquidoReais; m.totalAReceber += pv.liquidoReais; }
  }));
  return meses;
}

// ------------------------------------------------------------------ o mês a mês (o Patrimônio)
const fimDoMes = (comp) => { const [a, m] = comp.split('-').map(Number); const d = new Date(Date.UTC(a, m, 0)); return d.toISOString().slice(0, 10); };
// o último ponto de uma série [['AAAA-MM-DD', v]] até `ate` (inclusive); a série em ordem
export function ultimoAte(serie, ate) {
  let v = null;
  for (const [d, x] of serie ?? []) { if (d > ate) break; v = x; }
  return v;
}
// Cada competência: o valor no fim do mês (a quantidade desse dia × o último fechamento até ele × o dólar), o que entrou
// (as compras, em reais pelo dólar delas), o que saiu (as vendas), os proventos pagos e a VALORIZAÇÃO = o valor − o do mês
// anterior − o que entrou + o que saiu. O mês de hoje vale pela cotação e pelo dólar de agora. Sem fechamento no mês (o
// app ainda não tinha a cotação), o preço da última operação até ali.
export function mesAMesRV({ ativos, operacoes, fechamentos = [], cotacoes = [], dolarDia = [], dolar = null, comps, hoje }) {
  const cot = Object.fromEntries(cotacoes.map((c) => [c.ativo_id, c]));
  const fech = {};
  [...fechamentos].sort((a, b) => (a.data < b.data ? -1 : 1)).forEach((f) => { (fech[f.ativo_id] ??= []).push([f.data, Number(f.preco)]); });
  const mesHoje = hoje.slice(0, 7);
  let anterior = 0;
  return comps.map((comp) => {
    const ate = comp === mesHoje ? hoje : fimDoMes(comp);
    const dolarMes = comp === mesHoje && dolar ? dolar : ultimoAte(dolarDia, ate) ?? dolar ?? 0;
    let valor = 0; let entrou = 0; let saiu = 0; let proventos = 0;
    ativos.forEach((a) => {
      const usd = emDolar(a);
      const ops = operacoes.filter((o) => o.ativo_id === a.id && o.data <= ate).sort(porData);
      if (!ops.length) return;
      let qtd = 0; let ultimoPreco = null;
      ops.forEach((o) => {
        const c = usd ? num(o.dolar) ?? dolarMes : 1;
        const noMes = o.data.slice(0, 7) === comp;
        if (o.tipo === 'compra') { qtd += Number(o.quantidade); ultimoPreco = precoDaOperacao(o); if (noMes) entrou += (Number(o.valor_centavos) + Number(o.taxas_centavos ?? 0)) * c; }
        else if (o.tipo === 'venda') { qtd = Math.max(0, qtd - Number(o.quantidade)); ultimoPreco = precoDaOperacao(o); if (noMes) saiu += (Number(o.valor_centavos) - Number(o.taxas_centavos ?? 0)) * c; }
        else if (o.tipo === 'desdobramento' || o.tipo === 'grupamento') { qtd *= Number(o.fator); if (ultimoPreco) ultimoPreco /= Number(o.fator); }
        else if (o.tipo === 'provento' && noMes && o.data <= hoje) proventos += (Number(o.valor_centavos) - Number(o.retido_centavos ?? 0)) * c;
      });
      const preco = comp === mesHoje && cot[a.id]?.preco ? Number(cot[a.id].preco) : ultimoAte(fech[a.id], ate) ?? ultimoPreco ?? 0;
      valor += qtd * preco * 100 * (usd ? dolarMes : 1);
    });
    const valorizacao = valor - anterior - entrou + saiu;
    const linha = { competencia: comp, total: Math.round(valor), entrou: Math.round(entrou), saiu: Math.round(saiu), proventos: Math.round(proventos), valorizacao: Math.round(valorizacao) };
    anterior = valor;
    return linha;
  });
}

// ------------------------------------------------------------------ a prévia do lançar
// O que a operação nova faz com a posição: a quantidade, o preço médio (na moeda) e o custo médio em reais, antes e depois;
// na venda, o lucro pelo custo médio. `op` no formato da tabela (quantidade, valor_centavos, taxas_centavos, dolar, fator).
export function previaDaOperacao(ativo, operacoes, op, contexto) {
  const antes = posicaoDoAtivo(ativo, operacoes, contexto);
  const depois = posicaoDoAtivo(ativo, [...operacoes, { ...op, ativo_id: ativo.id, id: '__nova', criado_em: '9999' }], contexto);
  const venda = op.tipo === 'venda' ? depois.realizados[depois.realizados.length - 1] ?? null : null;
  return { antes, depois, venda, excede: op.tipo === 'venda' && Number(op.quantidade) > antes.quantidade + 1e-9 };
}

// ------------------------------------------------------------------ no Patrimônio
// As competências de `de` a `ate` ('AAAA-MM'), em ordem.
export function competenciasEntre(de, ate) {
  const out = [];
  let [a, m] = de.split('-').map(Number);
  const [a2, m2] = ate.split('-').map(Number);
  while (a < a2 || (a === a2 && m <= m2)) { out.push(`${a}-${String(m).padStart(2, '0')}`); m += 1; if (m > 12) { m = 1; a += 1; } }
  return out;
}
// O mês a mês da renda variável no FORMATO DO `mesAMes` da renda fixa: `rendeu` é a valorização (o patrimônio sobe e desce
// com as cotações), os proventos ficam à parte (são dinheiro que foi para a conta: não mudam o total), `base` = o total de
// antes + o que entrou, `pct` = (a valorização + os proventos) ÷ a base, `aportado` = o que entrou − o que saiu, acumulado.
export function noFormatoDoPatrimonio(rv) {
  let antes = 0; let aportado = 0;
  return rv.map((m) => {
    aportado += m.entrou - m.saiu;
    const base = antes + m.entrou;
    antes = m.total;
    return {
      competencia: m.competencia, total: m.total, aportes: m.entrou, resgates: m.saiu, rendeu: m.valorizacao, valorizacao: m.valorizacao,
      proventos: m.proventos, base, pct: base > 0 ? (m.valorizacao + m.proventos) / base : null, aportado, rendimentoAcum: m.total - aportado,
    };
  });
}
// A renda fixa e a variável somadas mês a mês (os dois no formato do `mesAMes`); o mês que só um deles tem soma zero do
// outro. O `pct` do mês junto conta os proventos.
export function somarMeses(rf, rv) {
  const a = Object.fromEntries(rf.map((m) => [m.competencia, m]));
  const b = Object.fromEntries(rv.map((m) => [m.competencia, m]));
  const z = (x, k) => Number(x?.[k] ?? 0);
  return [...new Set([...rf, ...rv].map((m) => m.competencia))].sort().map((c) => {
    const x = a[c]; const y = b[c];
    const rendeu = z(x, 'rendeu') + z(y, 'rendeu'); const proventos = z(y, 'proventos'); const base = z(x, 'base') + z(y, 'base');
    return {
      competencia: c, total: z(x, 'total') + z(y, 'total'), aportes: z(x, 'aportes') + z(y, 'aportes'), resgates: z(x, 'resgates') + z(y, 'resgates'),
      rendeu, valorizacao: z(y, 'valorizacao'), proventos, base, pct: base > 0 ? (rendeu + proventos) / base : null,
      aportado: z(x, 'aportado') + z(y, 'aportado'), rendimentoAcum: z(x, 'rendimentoAcum') + z(y, 'rendimentoAcum'),
    };
  });
}
