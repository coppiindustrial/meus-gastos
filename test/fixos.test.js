import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dataNoMes, recorrenciasDoHistorico, situacaoDoMes, ultimosPorRecorrencia, vigente } from '../src/lib/fixos.js';

const rec = (id, extra = {}) => ({ id, descricao: id, dia_do_mes: 5, ativa: true, inicio: '2026-04-01', fim: null, valor_padrao_centavos: 10000, ...extra });

test('vigência: ativa, depois do início e antes do fim', () => {
  assert.equal(vigente(rec('a'), '2026-04'), true);
  assert.equal(vigente(rec('a'), '2026-03'), false);
  assert.equal(vigente(rec('a', { fim: '2026-06-30' }), '2026-07'), false);
  assert.equal(vigente(rec('a', { fim: '2026-06-30' }), '2026-06'), true);
  assert.equal(vigente(rec('a', { ativa: false }), '2026-05'), false);
});

test('data no mês respeita o fim do mês', () => {
  assert.equal(dataNoMes('2026-02', 31), '2026-02-28');
  assert.equal(dataNoMes('2026-08', 10), '2026-08-10');
  assert.equal(dataNoMes('2026-08', 0), '2026-08-01');
});

test('situação do mês: lançado, sugerido pelo último valor ou pelo padrão', () => {
  const recs = [rec('luz', { dia_do_mes: 10 }), rec('net', { dia_do_mes: 1 }), rec('velha', { ativa: false })];
  const doMes = [{ recorrencia_id: 'net', valor_centavos: 14990 }];
  const ultimos = { luz: { valor_centavos: 30698, competencia: '2026-07' } };
  const s = situacaoDoMes(recs, doMes, ultimos, '2026-08');
  assert.deepEqual(s.map((x) => x.rec.id), ['net', 'luz']); // por dia; a inativa some
  assert.equal(s[0].lancamento.valor_centavos, 14990);
  assert.deepEqual([s[1].sugerido, s[1].base], [30698, 'valor de jul/26']);
  const semHistorico = situacaoDoMes([rec('nova')], [], {}, '2026-08');
  assert.deepEqual([semHistorico[0].sugerido, semHistorico[0].base], [10000, 'valor padrão']);
});

test('inativa que JÁ foi lançada no mês continua aparecendo', () => {
  const s = situacaoDoMes([rec('x', { ativa: false })], [{ recorrencia_id: 'x', valor_centavos: 1 }], {}, '2026-08');
  assert.equal(s.length, 1);
});

test('último valor antes do mês', () => {
  const l = [
    { recorrencia_id: 'luz', competencia: '2026-06', valor_centavos: 100 },
    { recorrencia_id: 'luz', competencia: '2026-07', valor_centavos: '200' },
    { recorrencia_id: 'luz', competencia: '2026-08', valor_centavos: 300 },
  ];
  assert.deepEqual(ultimosPorRecorrencia(l, '2026-08'), { luz: { valor_centavos: 200, competencia: '2026-07' } });
});

test('recorrências a partir do histórico: uma por descrição, com o valor mais recente', () => {
  const h = [
    { id: 1, descricao: 'Luz', competencia: '2026-04', data: '2026-04-01', valor_centavos: 19619, categoria_id: 'c1' },
    { id: 2, descricao: 'Luz', competencia: '2026-07', data: '2026-07-01', valor_centavos: 30698, categoria_id: 'c1' },
    { id: 3, descricao: 'Internet', competencia: '2026-05', data: '2026-05-01', valor_centavos: 14990, categoria_id: 'c2' },
  ];
  const r = recorrenciasDoHistorico(h);
  assert.deepEqual(r.map((x) => [x.descricao, x.valor_padrao_centavos, x.inicio, x.meses, x.ids.length]), [
    ['Internet', 14990, '2026-05-01', 1, 1],
    ['Luz', 30698, '2026-04-01', 2, 2],
  ]);
});
