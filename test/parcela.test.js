import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lerParcela } from '../src/lib/parcela.js';

test('formatos normais', () => {
  assert.deepEqual(lerParcela('3 de 10'), { atual: 3, total: 10 });
  assert.deepEqual(lerParcela('1/8'), { atual: 1, total: 8 });
  assert.equal(lerParcela('-'), null);
  assert.equal(lerParcela(''), null);
  assert.equal(lerParcela(null), null);
});

test('parcela que o Excel virou data em texto ("06/dez" era 6/12)', () => {
  assert.deepEqual(lerParcela('06/dez'), { atual: 6, total: 12 });
  assert.deepEqual(lerParcela('02/jun'), { atual: 2, total: 6 });
  assert.deepEqual(lerParcela('04/abr'), { atual: 4, total: 4 });
});

// Conferido contra a planilha: a compra "Amazonmktplc*Expressbr" está como 46363,0 na fatura de
// junho/2026 e como "9 de 12" na de agosto — logo, junho era 7 de 12.
test('parcela que o Excel virou número de série de data ("46363,0" = 07/12/2026)', () => {
  assert.deepEqual(lerParcela('46363,0'), { atual: 7, total: 12 });
  assert.deepEqual(lerParcela('46177'), { atual: 4, total: 6 });
});

test('recusa o impossível', () => {
  assert.equal(lerParcela('11 de 10'), null);
  assert.equal(lerParcela('0/5'), null);
  assert.equal(lerParcela('1/1'), null);
  assert.equal(lerParcela('abc'), null);
});
