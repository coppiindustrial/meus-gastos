import { test } from 'node:test';
import assert from 'node:assert/strict';
import { brlCurto, formatBRL, parseValor, valorParaCampo } from '../src/lib/dinheiro.js';

test('parseValor lê os formatos de valor', () => {
  const casos = [
    ['1.234,56', 123456],
    ['1234,56', 123456],
    ['1234.56', 123456],
    ['R$ 59,90', 5990],
    ['R$ -2.998,73', -299873],
    ['-2.998,73', -299873],
    ['1,234.56', 123456],
    ['1.234', 123400],
    ['229', 22900],
    ['0,1', 10],
    ['  45  ', 4500],
    ['0,29', 29],
    ['1.005,15', 100515],
  ];
  for (const [texto, esperado] of casos) assert.equal(parseValor(texto), esperado, texto);
});

test('parseValor recusa o que não é número', () => {
  for (const texto of ['', 'abc', '12,3,4', 'R$', null, undefined]) assert.equal(parseValor(texto), null, String(texto));
});

test('formatação em reais a partir de centavos', () => {
  assert.equal(formatBRL(123456).replace(/\s/g, ' '), 'R$ 1.234,56');
  assert.equal(formatBRL(null), '—');
  assert.equal(brlCurto(85000), 'R$ 850');
  assert.equal(brlCurto(1230000), 'R$ 12,3 mil');
  assert.equal(brlCurto(-1230000), '-R$ 12,3 mil');
  assert.equal(brlCurto(120000000), 'R$ 1,2 mi');
  assert.equal(valorParaCampo(123456), '1234,56');
  assert.equal(valorParaCampo(5), '0,05');
});
