import { test } from 'node:test';
import assert from 'node:assert/strict';
import { carteiraRV, mesAMesRV, posicaoDoAtivo, precoDaOperacao, previaDaOperacao, proventosEm12Meses, proventosPorMes, totalDaOperacao, ultimoAte } from '../src/lib/rendaVariavel.js';

// Dados FICTÍCIOS.
const perto = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≠ ${b}`);
const fii = { id: 'f1', ticker: 'AAAA11', tipo: 'fii', mercado: 'B3', moeda: 'BRL', ordem: 0 };
const eua = { id: 'u1', ticker: 'XYZ', tipo: 'acao_eua', mercado: 'EUA', moeda: 'USD', ordem: 0 };
const op = (o) => ({ taxas_centavos: 0, retido_centavos: 0, ...o });

test('o total e o preço de uma operação', () => {
  assert.equal(totalDaOperacao(10, 104.35), 104350);
  assert.equal(totalDaOperacao(0.5, 101.2), 5060);
  assert.equal(precoDaOperacao({ quantidade: 10, valor_centavos: 104350 }), 104.35);
});

test('o preço médio leva as taxas e a venda sai pelo custo médio', () => {
  const ops = [
    op({ ativo_id: 'f1', tipo: 'compra', data: '2026-01-10', quantidade: 100, valor_centavos: 100000, taxas_centavos: 500 }), // 100 × R$ 10 + R$ 5
    op({ ativo_id: 'f1', tipo: 'compra', data: '2026-02-10', quantidade: 100, valor_centavos: 120000 }),                      // 100 × R$ 12
    op({ ativo_id: 'f1', tipo: 'venda', data: '2026-03-10', quantidade: 50, valor_centavos: 65000, taxas_centavos: 100 }),     // 50 × R$ 13 − R$ 1
  ];
  const p = posicaoDoAtivo(fii, ops, { cotacao: { preco: 12.5, variacao_dia: 0.01 }, hoje: '2026-04-01' });
  assert.equal(p.quantidade, 150);
  perto(p.precoMedio, 220500 / 200 / 100);          // o preço médio não muda com a venda: R$ 11,025
  perto(p.custoReais, 220500 * 0.75);
  const v = p.realizados[0];
  perto(v.recebido, 64900);
  perto(v.custo, 220500 * 0.25);
  perto(v.lucro, 64900 - 55125);
  perto(p.valorReais, 150 * 12.5 * 100);
  perto(p.resultado, 187500 - 165375);
  assert.equal(p.semCotacao, false);
});

test('o desdobramento multiplica a quantidade e o preço médio se ajusta; sem cotação, o preço da última operação', () => {
  const ops = [
    op({ ativo_id: 'f1', tipo: 'compra', data: '2026-01-10', quantidade: 10, valor_centavos: 40000 }),
    op({ ativo_id: 'f1', tipo: 'desdobramento', data: '2026-02-01', fator: 4 }),
  ];
  const p = posicaoDoAtivo(fii, ops, { hoje: '2026-03-01' });
  assert.equal(p.quantidade, 40);
  perto(p.precoMedio, 10);
  assert.equal(p.semCotacao, true);
  perto(p.preco, 10);                                 // o preço da compra, dividido pelo fator: a tela avisa "sem cotação"
  perto(p.valorReais, 40000);
  const lote = p.linhas.find((l) => l.op.tipo === 'compra').lote;
  assert.equal(lote.quantidade, 40);
});

test('no exterior: o custo pelo dólar de cada compra, o valor pelo de hoje, e a parte do câmbio', () => {
  const ops = [
    op({ ativo_id: 'u1', tipo: 'compra', data: '2026-09-02', quantidade: 10, valor_centavos: 100000, dolar: 5.0 }), // US$ 1.000 a R$ 5,00
    op({ ativo_id: 'u1', tipo: 'provento', data: '2026-10-01', valor_centavos: 200, retido_centavos: 60, provento: 'dividendo', dolar: 5.2 }),
  ];
  const p = posicaoDoAtivo(eua, ops, { cotacao: { preco: 110 }, dolar: 5.5, hoje: '2026-11-13' });
  perto(p.custoReais, 500000);
  perto(p.valorMoeda, 110000);
  perto(p.valorReais, 605000);
  perto(p.resMoedaPct, 0.1);                          // a ação subiu 10% em dólar
  perto(p.resPct, 0.21);                              // em reais, 21%
  perto(p.cambio, 1.21 / 1.1 - 1);                    // o dólar, 10%
  assert.equal(p.proventos.length, 1);
  perto(p.proventos[0].liquidoReais, 140 * 5.2);
  perto(proventosEm12Meses(p.proventos, '2026-11-13'), 728);
});

test('a carteira em faixas: o exterior, os FIIs e as ações; o vendido inteiro sai', () => {
  const vendido = { id: 'f2', ticker: 'BBBB11', tipo: 'fii', mercado: 'B3', moeda: 'BRL' };
  const novo = { id: 'a1', ticker: 'CCCC3', tipo: 'acao_br', mercado: 'B3', moeda: 'BRL', ativo: true };
  const ops = [
    op({ ativo_id: 'f1', tipo: 'compra', data: '2026-01-10', quantidade: 10, valor_centavos: 10000 }),
    op({ ativo_id: 'f2', tipo: 'compra', data: '2026-01-10', quantidade: 10, valor_centavos: 10000 }),
    op({ ativo_id: 'f2', tipo: 'venda', data: '2026-02-10', quantidade: 10, valor_centavos: 11000 }),
    op({ ativo_id: 'u1', tipo: 'compra', data: '2026-01-10', quantidade: 1, valor_centavos: 10000, dolar: 5 }),
  ];
  const c = carteiraRV({ ativos: [fii, vendido, eua, novo], operacoes: ops, cotacoes: [{ ativo_id: 'f1', preco: 11 }, { ativo_id: 'u1', preco: 120 }], dolar: 5, hoje: '2026-03-01' });
  assert.deepEqual(c.grupos.map((g) => [g.classe.id, g.posicoes.map((p) => p.ativo.ticker)]), [['ext', ['XYZ']], ['fii', ['AAAA11']], ['b3', ['CCCC3']]]);
  assert.deepEqual(c.vendidos.map((p) => p.ativo.ticker), ['BBBB11']);
  assert.equal(c.total.valor, 11000 + 60000);
  assert.equal(c.total.custo, 10000 + 50000);
  assert.equal(c.semCotacao, false);
});

test('os proventos por mês: o pago e o anunciado (a data depois de hoje)', () => {
  const ops = [
    op({ ativo_id: 'f1', tipo: 'compra', data: '2026-01-10', quantidade: 10, valor_centavos: 10000 }),
    op({ ativo_id: 'f1', tipo: 'provento', data: '2026-10-14', valor_centavos: 900, provento: 'rendimento' }),
    op({ ativo_id: 'f1', tipo: 'provento', data: '2026-11-14', valor_centavos: 950, provento: 'rendimento' }),
  ];
  const p = posicaoDoAtivo(fii, ops, { hoje: '2026-11-13' });
  const meses = proventosPorMes([p], ['2026-09', '2026-10', '2026-11']);
  assert.deepEqual(meses.map((m) => [m.total, m.totalAReceber]), [[0, 0], [900, 0], [950, 950]]);
  assert.equal(proventosEm12Meses(p.proventos, '2026-11-13'), 900);
});

test('o mês a mês: o valor no fim do mês pelo fechamento, o que entrou, o que saiu e a valorização', () => {
  const ops = [
    op({ ativo_id: 'f1', tipo: 'compra', data: '2026-09-10', quantidade: 10, valor_centavos: 10000 }),
    op({ ativo_id: 'f1', tipo: 'provento', data: '2026-10-14', valor_centavos: 90, provento: 'rendimento' }),
    op({ ativo_id: 'f1', tipo: 'venda', data: '2026-11-05', quantidade: 5, valor_centavos: 6000 }),
  ];
  const fechamentos = [{ ativo_id: 'f1', data: '2026-09-30', preco: 10.5 }, { ativo_id: 'f1', data: '2026-10-30', preco: 11 }];
  const m = mesAMesRV({ ativos: [fii], operacoes: ops, fechamentos, cotacoes: [{ ativo_id: 'f1', preco: 12 }], comps: ['2026-09', '2026-10', '2026-11'], hoje: '2026-11-13' });
  assert.deepEqual(m.map((x) => [x.competencia, x.total, x.entrou, x.saiu, x.proventos, x.valorizacao]), [
    ['2026-09', 10500, 10000, 0, 0, 500],
    ['2026-10', 11000, 0, 0, 90, 500],
    ['2026-11', 6000, 0, 6000, 0, 1000],            // 5 × R$ 12 = 60; 60 − 110 + 60 = +10
  ]);
  assert.equal(ultimoAte([['2026-01-01', 1], ['2026-02-01', 2]], '2026-01-31'), 1);
});

test('a prévia: a compra muda o preço médio; a venda dá o lucro; vender mais do que tem avisa', () => {
  const ops = [op({ ativo_id: 'u1', tipo: 'compra', data: '2026-09-02', quantidade: 10, valor_centavos: 100000, dolar: 5 })];
  const ctx = { cotacao: { preco: 110 }, dolar: 5.5, hoje: '2026-11-13' };
  const c = previaDaOperacao(eua, ops, { tipo: 'compra', data: '2026-11-13', quantidade: 10, valor_centavos: 110000, taxas_centavos: 0, dolar: 5.5 }, ctx);
  perto(c.depois.precoMedio, 105);
  perto(c.depois.custoMedioReais, (500000 + 605000) / 20 / 100);
  const v = previaDaOperacao(eua, ops, { tipo: 'venda', data: '2026-11-13', quantidade: 4, valor_centavos: 44000, taxas_centavos: 0, dolar: 5.5 }, ctx);
  perto(v.venda.lucro, 44000 * 5.5 - 500000 * 0.4);
  assert.equal(previaDaOperacao(eua, ops, { tipo: 'venda', data: '2026-11-13', quantidade: 11, valor_centavos: 1000, dolar: 5.5 }, ctx).excede, true);
});

test('no Patrimônio: o formato do mês a mês e a soma com a renda fixa', async () => {
  const { competenciasEntre, noFormatoDoPatrimonio, somarMeses } = await import('../src/lib/rendaVariavel.js');
  assert.deepEqual(competenciasEntre('2026-11', '2027-02'), ['2026-11', '2026-12', '2027-01', '2027-02']);
  const rv = noFormatoDoPatrimonio([
    { competencia: '2026-09', total: 10500, entrou: 10000, saiu: 0, proventos: 0, valorizacao: 500 },
    { competencia: '2026-10', total: 11000, entrou: 0, saiu: 0, proventos: 90, valorizacao: 500 },
  ]);
  assert.deepEqual(rv.map((m) => [m.aportes, m.rendeu, m.base, m.aportado, m.rendimentoAcum]), [[10000, 500, 10000, 10000, 500], [0, 500, 10500, 10000, 1000]]);
  perto(rv[1].pct, 590 / 10500);
  const rf = [{ competencia: '2026-10', total: 50000, aportes: 0, resgates: 0, rendeu: 500, base: 49500, aportado: 49000, rendimentoAcum: 1000 }];
  const s = somarMeses(rf, rv);
  assert.deepEqual(s.map((m) => [m.competencia, m.total, m.rendeu, m.valorizacao, m.proventos]), [['2026-09', 10500, 500, 500, 0], ['2026-10', 61000, 1000, 500, 90]]);
  perto(s[1].pct, 1090 / 60000);
});
