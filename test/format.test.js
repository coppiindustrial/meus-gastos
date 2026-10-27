import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addMeses, competenciaCurta, competenciaDe, competenciaParaBanco, formatDate, nomeCompetencia } from '../src/lib/format.js';

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
