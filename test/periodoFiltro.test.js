import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compsDoPeriodo, ehPadrao, escolherAno, escolherMes, mesesDoPeriodo, periodoPadrao, textoDoPeriodo } from '../src/lib/periodoFiltro.js';

const base = periodoPadrao('2026-11-06');

test('o padrão é o ano todo do ano de hoje, com o trimestre, o semestre e o "até" no mês de hoje', () => {
  assert.deepEqual(base, { modo: 'ano', anos: [2026], meses: [], tri: 4, sem: 2, ate: 11 });
  assert.equal(ehPadrao(base, '2026-11-06'), true);
  assert.equal(ehPadrao({ ...base, anos: [2025] }, '2026-11-06'), false);
  assert.equal(compsDoPeriodo(base).length, 12);
  assert.equal(textoDoPeriodo(base), '2026');
});

test('cada tipo de período dá os seus meses e o seu texto', () => {
  assert.deepEqual(mesesDoPeriodo({ ...base, modo: 'tri', tri: 2 }), [4, 5, 6]);
  assert.equal(textoDoPeriodo({ ...base, modo: 'tri', tri: 2 }), '2º tri de 2026');
  assert.deepEqual(mesesDoPeriodo({ ...base, modo: 'sem', sem: 1 }), [1, 2, 3, 4, 5, 6]);
  assert.deepEqual(compsDoPeriodo({ ...base, modo: 'acum', ate: 3 }), ['2026-01', '2026-02', '2026-03']);
  assert.equal(textoDoPeriodo({ ...base, modo: 'acum', ate: 10 }), 'jan a out de 2026');
  assert.equal(textoDoPeriodo({ ...base, modo: 'mes', meses: [11] }), 'novembro de 2026');
  assert.equal(textoDoPeriodo({ ...base, modo: 'mes', meses: [7, 9, 11] }), 'jul, set e nov de 2026');
  assert.equal(textoDoPeriodo({ ...base, modo: 'mes', meses: [1, 2, 3] }), 'jan a mar de 2026');
  // vários anos somam, como antes
  assert.deepEqual(compsDoPeriodo({ ...base, modo: 'tri', tri: 1, anos: [2026, 2025] }), ['2025-01', '2025-02', '2025-03', '2026-01', '2026-02', '2026-03']);
  assert.equal(textoDoPeriodo({ ...base, anos: [2025, 2026] }), '2025 e 2026');
});

test('os 12 meses terminam no mês escolhido e atravessam o ano', () => {
  const p = { ...base, modo: '12m', ate: 10 };
  const c = compsDoPeriodo(p);
  assert.equal(c.length, 12);
  assert.equal(c[0], '2025-11');
  assert.equal(c[11], '2026-10');
  assert.equal(textoDoPeriodo(p), 'nov/25 a out/26');
  assert.equal(mesesDoPeriodo(p), null);
});

test('escolher meses e anos: clique, Shift (intervalo) e Ctrl (vários)', () => {
  assert.deepEqual(escolherMes([3], 5), [5]);
  assert.deepEqual(escolherMes([3], 6, { shift: true, ultimo: 3 }), [3, 4, 5, 6]);
  assert.deepEqual(escolherMes([3], 6, { ctrl: true }), [3, 6]);
  assert.deepEqual(escolherMes([3], 3, { ctrl: true }), [3]); // nunca fica sem nenhum
  assert.deepEqual(escolherAno([2026], 2025), [2025]);
  assert.deepEqual(escolherAno([2026], 2025, { ctrl: true }), [2025, 2026]);
  assert.deepEqual(escolherAno([2026], 2026, { ctrl: true }), [2026]);
});
