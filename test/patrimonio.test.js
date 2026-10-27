import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evolucao, somar, ultimoSaldoAte } from '../src/lib/patrimonio.js';

const contas = [{ id: 'cc', tipo: 'corrente' }, { id: 'inv', tipo: 'investimento' }];
const saldos = [
  { conta_id: 'cc', data: '2026-06-10', valor_centavos: 100000 },
  { conta_id: 'cc', data: '2026-08-05', valor_centavos: 150000 },
  { conta_id: 'inv', data: '2026-07-31', valor_centavos: '500000' }, // bigint pode vir como texto
  { conta_id: 'cc', data: '2026-06-20', valor_centavos: -20000 },    // cheque especial
];

test('a foto mais recente de cada conta até a data', () => {
  const f = ultimoSaldoAte(saldos, '2026-07-31');
  assert.equal(f.cc.valor_centavos, -20000);
  assert.equal(f.inv.data, '2026-07-31');
  assert.equal(ultimoSaldoAte(saldos, '2026-06-01').cc, undefined);
});

test('soma por tipo, com saldo negativo', () => {
  assert.deepEqual(somar(ultimoSaldoAte(saldos), contas), { total: 650000, porTipo: { corrente: 150000, investimento: 500000 } });
});

test('evolução: o saldo vale até a próxima foto; conta sem foto ainda não entra', () => {
  const e = evolucao(saldos, contas);
  assert.deepEqual(e.map((m) => [m.competencia, m.total, m.contas]), [
    ['2026-06', -20000, 1],
    ['2026-07', 480000, 2],
    ['2026-08', 650000, 2],
  ]);
  assert.equal(evolucao(saldos, contas, '2026-10').length, 5); // repete o último saldo até outubro
  assert.deepEqual(evolucao([], contas), []);
});
