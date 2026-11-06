import { test } from 'node:test';
import assert from 'node:assert/strict';
import { carteiraContraIndices, degraus, focusPorAno, juroReal, porMes, pontoEm, ultimo, variacaoEm, variacaoNoDia } from '../src/lib/indicadores.js';

// Dados FICTÍCIOS.
const selic = [['2026-06-17', 14.25], ['2026-06-18', 14.0], ['2026-06-19', 14.0], ['2026-08-06', 13.75], ['2026-08-07', 13.75]];
const dolar = [['2025-11-05', 5.0], ['2025-11-06', 5.1], ['2026-10-30', 5.4], ['2026-11-05', 5.45], ['2026-11-06', 5.5]];

test('a série em degraus, o último ponto e o ponto de uma data', () => {
  assert.deepEqual(degraus(selic), [{ data: '2026-06-17', valor: 14.25 }, { data: '2026-06-18', valor: 14 }, { data: '2026-08-06', valor: 13.75 }]);
  assert.deepEqual(ultimo(selic), ['2026-08-07', 13.75]);
  assert.equal(ultimo([]), null);
  assert.deepEqual(pontoEm(dolar, '2026-11-01'), ['2026-10-30', 5.4]);
  assert.equal(pontoEm(dolar, '2025-01-01'), null);
});

test('as variações: no dia e em 12 meses', () => {
  assert.ok(Math.abs(variacaoNoDia(dolar) - (5.5 / 5.45 - 1)) < 1e-12);
  assert.ok(Math.abs(variacaoEm(dolar, 12) - (5.5 / 5.1 - 1)) < 1e-12); // o de 06/11/2025
  assert.equal(variacaoEm([['2026-11-06', 5.5]], 12), null);
  assert.deepEqual(porMes(dolar).map((m) => [m.competencia, m.valor]), [['2025-11', 5.1], ['2026-10', 5.4], ['2026-11', 5.5]]);
});

test('o juro real e a Focus por ano (a pesquisa mais nova)', () => {
  assert.ok(Math.abs(juroReal(13.75, 4.58) - (1.1375 / 1.0458 - 1)) < 1e-12);
  assert.equal(juroReal(null, 4.58), null);
  const linhas = [
    { Indicador: 'IPCA', Data: '2026-10-30', DataReferencia: '2026', Mediana: 5.2 },
    { Indicador: 'IPCA', Data: '2026-10-30', DataReferencia: '2027', Mediana: 4.7 },
    { Indicador: 'IPCA', Data: '2026-10-23', DataReferencia: '2026', Mediana: 5.1 },
    { Indicador: 'Selic', Data: '2026-10-30', DataReferencia: '2026', Mediana: 13.5 },
  ];
  const f = focusPorAno(linhas, [2026, 2027, 2028]);
  assert.deepEqual(f.IPCA, { data: '2026-10-30', valores: [5.2, 4.7, null] });
  assert.deepEqual(f.Selic.valores, [13.5, null, null]);
  assert.equal(f['Câmbio'], undefined);
});

test('a carteira contra o CDI e o IPCA: só os meses fechados com rendimento', () => {
  const meses = [{ competencia: '2026-09', pct: 0.011 }, { competencia: '2026-10', pct: null }, { competencia: '2026-11', pct: 0.004 }];
  const r = carteiraContraIndices(meses, { '2026-09': 0.0105 }, [['2026-09-01', 0.48]], '2026-11');
  assert.equal(r.length, 1);
  assert.equal(r[0].competencia, '2026-09');
  assert.ok(Math.abs(r[0].real - (1.011 / 1.0048 - 1)) < 1e-12);
  assert.ok(Math.abs(r[0].doCdi - 0.011 / 0.0105) < 1e-12);
});
