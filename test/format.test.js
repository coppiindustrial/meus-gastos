import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addMeses, competenciaCurta, competenciaDe, competenciaParaBanco, formatDate, mascaraData, nomeCompetencia } from '../src/lib/format.js';

test('competência', () => {
  assert.equal(competenciaDe('2026-08-13'), '2026-08');
  assert.equal(competenciaParaBanco('2026-08'), '2026-08-01');
  assert.equal(addMeses('2026-11', 2), '2027-01');
  assert.equal(addMeses('2026-01', -1), '2025-12');
  assert.equal(addMeses('2026-05', 0), '2026-05');
  assert.equal(addMeses('2026-03', -15), '2024-12');
  assert.equal(nomeCompetencia('2026-10'), 'Outubro de 2026');
  assert.equal(competenciaCurta('2026-03'), 'mar/26');
});

test('formatDate não passa a data pelo fuso', () => {
  assert.equal(formatDate('2026-08-01'), '01/08/2026');
  assert.equal(formatDate(null), '—');
});

test('o campo de data que se digita: as barras entram sozinhas e a barra digitada fecha a parte', () => {
  assert.equal(mascaraData('11042027'), '11/04/2027');
  assert.equal(mascaraData('1104'), '11/04');
  assert.equal(mascaraData('11/042'), '11/04/2');
  assert.equal(mascaraData('11/'), '11/');
  assert.equal(mascaraData('11/04/'), '11/04/');
  assert.equal(mascaraData('1/4/27'), '1/4/27');
  assert.equal(mascaraData('11-04-2027'), '11/04/2027');
  assert.equal(mascaraData('ab12c'), '12');
  assert.equal(mascaraData(''), '');
});
