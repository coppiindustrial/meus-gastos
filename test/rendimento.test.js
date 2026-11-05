import { test } from 'node:test';
import assert from 'node:assert/strict';
import { movimentosDoExtrato, rendimentoDoPeriodo, rendimentoPorMes } from '../src/lib/patrimonio.js';

// Dados FICTÍCIOS. Duas contas de investimento com fotos no fim de cada mês.
const S = (conta_id, data, valor_centavos) => ({ conta_id, data, valor_centavos });
const M = (conta_id, data, tipo, valor_centavos) => ({ conta_id, data, tipo, valor_centavos });
const saldos = [
  S('nu', '2026-08-31', 10000000), S('nu', '2026-09-30', 10700000), S('nu', '2026-10-31', '11300000'),
  S('xp', '2026-09-30', 5000000), S('xp', '2026-10-31', 5040000),
];
const movs = [
  M('nu', '2026-09-10', 'aporte', 600000), // set: 100.000 → 107.000 com 6.000 aportados = 1.000 de rendimento
  M('nu', '2026-10-05', 'aporte', 800000), M('nu', '2026-10-20', 'resgate', 300000), // out: líquido 5.000; 107.000 → 113.000 = 1.000
  M('nu', '2026-08-15', 'aporte', 999999), // antes da 1ª foto: não conta
];

test('rendimentoPorMes: rendeu = saldo − saldo de antes − (aportes − resgates) entre as fotos', () => {
  const r = rendimentoPorMes(saldos, movs, '2026-10');
  assert.deepEqual(r.map((m) => m.competencia), ['2026-08', '2026-09', '2026-10']);
  // agosto: só a primeira foto — abre a conta, sem rendimento
  assert.equal(r[0].rendeu, null);
  assert.equal(r[0].aportado, 10000000);
  // setembro: o nu rendeu 1.000; a xp só abriu (a 1ª foto dela)
  assert.equal(r[1].porConta.nu.rendeu, 100000);
  assert.equal(r[1].porConta.nu.aportes, 600000);
  assert.equal(r[1].porConta.xp.rendeu, null);
  assert.equal(r[1].rendeu, 100000);
  assert.equal(r[1].total, 15700000);
  // a base do % = o saldo de antes + metade do líquido aportado: 100.000 + 3.000
  assert.equal(r[1].base, 10300000);
  assert.ok(Math.abs(r[1].pct - 100000 / 10300000) < 1e-12);
  // outubro: nu 113.000 − 107.000 − 5.000 = 1.000; xp 50.400 − 50.000 = 400
  assert.equal(r[2].porConta.nu.rendeu, 100000);
  assert.equal(r[2].porConta.nu.resgates, 300000);
  assert.equal(r[2].porConta.xp.rendeu, 40000);
  assert.equal(r[2].rendeu, 140000);
  assert.equal(r[2].aportes, 800000);
  assert.equal(r[2].resgates, 300000);
  // aportado acumulado: as primeiras fotos (100.000 + 50.000) + 6.000 + 5.000 = 161.000; o resto rendeu
  assert.equal(r[2].aportado, 16100000);
  assert.equal(r[2].rendimentoAcum, 16340000 - 16100000);
});

test('rendimentoPorMes: mês sem foto nova não tem rendimento; a foto antiga continua no total', () => {
  const r = rendimentoPorMes([S('nu', '2026-08-31', 100000), S('nu', '2026-10-31', 103000)], [], '2026-11');
  assert.deepEqual(r.map((m) => [m.competencia, m.total, m.rendeu]), [['2026-08', 100000, null], ['2026-09', 100000, null], ['2026-10', 103000, 3000], ['2026-11', 103000, null]]);
  assert.deepEqual(rendimentoPorMes([], []), []);
});

test('rendimentoDoPeriodo: soma o que rendeu, encadeia o % e soma os aportes', () => {
  const r = rendimentoPorMes(saldos, movs, '2026-10');
  const p = rendimentoDoPeriodo(r);
  assert.equal(p.rendeu, 240000);
  assert.equal(p.meses, 2);
  assert.equal(p.aportes, 1400000);
  assert.equal(p.liquido, 1100000);
  assert.ok(Math.abs(p.pct - ((1 + r[1].pct) * (1 + r[2].pct) - 1)) < 1e-12);
  assert.deepEqual(rendimentoDoPeriodo([r[0]]), { rendeu: null, pct: null, aportes: 0, resgates: 0, liquido: 0, meses: 0 });
});

test('movimentosDoExtrato: a aplicação (débito) é aporte, o resgate (crédito) é resgate; o resto fica de fora', () => {
  const plano = [
    { acao: 'ignorar', motivo: 'investimento', linha: { data: '2026-10-03', valor_centavos: -250000, id_externo: 'a1', descricao_original: 'Aplicação RDB' } },
    { acao: 'ignorar', motivo: 'investimento', linha: { data: '2026-10-09', valor_centavos: 80000, id_externo: 'a2', descricao_original: 'Resgate RDB' } },
    { acao: 'ignorar', motivo: 'pagamento da fatura do cartão', linha: { data: '2026-10-10', valor_centavos: -500000, id_externo: 'a3' } },
    { acao: 'avulso', linha: { data: '2026-10-11', valor_centavos: -1000, id_externo: 'a4' } },
  ];
  assert.deepEqual(movimentosDoExtrato(plano, 'nu'), [
    { conta_id: 'nu', data: '2026-10-03', tipo: 'aporte', valor_centavos: 250000, descricao: 'Aplicação RDB', origem: 'extrato', id_externo: 'a1' },
    { conta_id: 'nu', data: '2026-10-09', tipo: 'resgate', valor_centavos: 80000, descricao: 'Resgate RDB', origem: 'extrato', id_externo: 'a2' },
  ]);
});
