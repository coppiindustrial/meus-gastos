import { test } from 'node:test';
import assert from 'node:assert/strict';
import { anosComDado, gruposPorMes, limitesDoPeriodo, mesDaLinhaNova, noPeriodo, rotuloPeriodo } from '../src/lib/periodo.js';
import { ordenarLinhas } from '../src/lib/planilha.js';

// Dados FICTÍCIOS.

test('limitesDoPeriodo: o mês, os N meses que terminam no mês da tela, o ano e o histórico', () => {
  assert.deepEqual(limitesDoPeriodo('mes', '2026-10'), { de: '2026-10', ate: '2026-10' });
  assert.deepEqual(limitesDoPeriodo('3m', '2026-10'), { de: '2026-08', ate: '2026-10' });
  assert.deepEqual(limitesDoPeriodo('12m', '2026-02'), { de: '2025-03', ate: '2026-02' });
  assert.deepEqual(limitesDoPeriodo('ano:2025', '2026-10'), { de: '2025-01', ate: '2025-12' });
  assert.deepEqual(limitesDoPeriodo('tudo', '2026-10'), { de: null, ate: null });
});

test('rotuloPeriodo e noPeriodo', () => {
  assert.equal(rotuloPeriodo('3m', '2026-10'), '3 meses até out/26');
  assert.equal(rotuloPeriodo('ano:2026', '2026-10'), 'Ano 2026');
  assert.equal(rotuloPeriodo('tudo', '2026-10'), 'Todo o histórico');
  assert.equal(rotuloPeriodo('mes', '2026-10'), '');
  assert.equal(noPeriodo({ competencia: '2026-09' }, { de: '2026-08', ate: '2026-10' }), true);
  assert.equal(noPeriodo({ competencia: '2026-11' }, { de: '2026-08', ate: '2026-10' }), false);
  assert.equal(noPeriodo({ competencia: '2019-01' }, { de: null, ate: null }), true);
});

test('mesDaLinhaNova: o mês da tela; no ano corrente, hoje; noutro ano, dezembro (ou janeiro do que vem); no histórico, hoje', () => {
  assert.equal(mesDaLinhaNova('mes', '2026-06', '2026-11'), '2026-06');
  assert.equal(mesDaLinhaNova('12m', '2026-06', '2026-11'), '2026-06');
  assert.equal(mesDaLinhaNova('ano:2026', '2026-06', '2026-11'), '2026-11');
  assert.equal(mesDaLinhaNova('ano:2025', '2026-06', '2026-11'), '2025-12');
  assert.equal(mesDaLinhaNova('ano:2027', '2026-06', '2026-11'), '2027-01');
  assert.equal(mesDaLinhaNova('tudo', '2026-06', '2026-11'), '2026-11');
});

test('anosComDado: os anos das competências, o de hoje sempre, do mais novo ao mais velho', () => {
  assert.deepEqual(anosComDado(['2026-01', '2025-12', '2026-05', null], '2026-11'), ['2026', '2025']);
  assert.deepEqual(anosComDado([], '2027-01'), ['2027']);
});

test('gruposPorMes: um grupo antes da 1ª linha de cada mês, com quantos e quanto; o rascunho não conta', () => {
  const ls = [
    { id: 1, competencia: '2026-10', tipo: 'saida', valor_centavos: 1000 },
    { id: 2, competencia: '2026-10', tipo: 'entrada', valor_centavos: 5000 },
    { id: 3, competencia: '2026-10', tipo: 'saida', valor_centavos: -200 }, // estorno: abate
    { id: 4, competencia: '2026-09', tipo: 'saida', valor_centavos: 700 },
    { id: 'r', rascunho: true, competencia: '2026-10', tipo: 'saida', valor_centavos: 999 },
  ];
  const g = gruposPorMes(ls);
  assert.deepEqual([...g.keys()], [0, 3]);
  assert.deepEqual(g.get(0), { competencia: '2026-10', n: 3, gastos: 800, entradas: 5000 });
  assert.deepEqual(g.get(3), { competencia: '2026-09', n: 1, gastos: 700, entradas: 0 });
});

test('ordenarLinhas porMes: no padrão, o mês mais novo em cima (a compra do cartão vai no mês da fatura); com coluna, o período inteiro', () => {
  const ls = [
    { id: 'a', competencia: '2026-09', data: '2026-09-20', valor_centavos: 100 },
    { id: 'b', competencia: '2026-10', data: '2026-09-25', valor_centavos: 300 }, // cartão: comprou em setembro, fatura de outubro
    { id: 'c', competencia: '2026-10', data: '2026-10-02', valor_centavos: 50 },
    { id: 'r', rascunho: true, competencia: '2026-10', data: '2026-10-30' },
  ];
  assert.deepEqual(ordenarLinhas(ls, null, { porMes: true }).map((l) => l.id), ['c', 'b', 'a', 'r']);
  assert.deepEqual(ordenarLinhas(ls, null).map((l) => l.id), ['c', 'b', 'a', 'r']);
  assert.deepEqual(ordenarLinhas(ls, { col: 'valor', dir: 'desc' }, { porMes: true }).map((l) => l.id), ['b', 'a', 'c', 'r']);
  const ls2 = [
    { id: 'x', competencia: '2026-09', data: '2026-10-01' }, // data mais nova, mês mais velho
    { id: 'y', competencia: '2026-10', data: '2026-09-28' },
  ];
  assert.deepEqual(ordenarLinhas(ls2, null, { porMes: true }).map((l) => l.id), ['y', 'x']);
  assert.deepEqual(ordenarLinhas(ls2, null).map((l) => l.id), ['x', 'y']);
});
