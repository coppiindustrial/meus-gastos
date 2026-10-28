import test from 'node:test';
import assert from 'node:assert/strict';
import { interpretarFixo, lerMes, padroesDoUltimo, textoFixo } from '../src/lib/cadastroFixos.js';

// Dados FICTÍCIOS.
const categorias = [
  { id: 'mor', nome: 'Moradia', ativa: true, grupo: { tipo: 'saida' } },
  { id: 'sal', nome: 'Salário', ativa: true, grupo: { tipo: 'entrada' } },
];
const C = { ativa: 0, descricao: 1, categoria: 2, dia: 3, valor: 4, ultimo: 5, inicio: 6, fim: 7 };

test('lerMes: os jeitos de escrever um mês', () => {
  assert.equal(lerMes('10/2026'), '2026-10');
  assert.equal(lerMes('1/26'), '2026-01');
  assert.equal(lerMes('2026-03'), '2026-03');
  assert.equal(lerMes('2026-03-01'), '2026-03');
  assert.equal(lerMes('15/08/2025'), '2025-08');
  assert.equal(lerMes('out/26'), '2026-10');
  assert.equal(lerMes('Março de 2027'), '2027-03');
  assert.equal(lerMes('13/2026'), null);
  assert.equal(lerMes('ontem'), null);
});

test('interpretarFixo: cada coluna, com os motivos de recusa', () => {
  assert.deepEqual(interpretarFixo(C.ativa, 'Não'), { campo: 'ativa', valor: false });
  assert.deepEqual(interpretarFixo(C.ativa, 'sim'), { campo: 'ativa', valor: true });
  assert.deepEqual(interpretarFixo(C.descricao, '  Luz '), { campo: 'descricao', valor: 'Luz' });
  assert.ok(interpretarFixo(C.descricao, '').motivo);
  assert.deepEqual(interpretarFixo(C.categoria, 'moradia', { categorias }), { campo: 'categoria_id', valor: 'mor' });
  assert.ok(interpretarFixo(C.categoria, 'Salário', { categorias }).motivo); // só categoria de gasto
  assert.deepEqual(interpretarFixo(C.categoria, '', { categorias }), { campo: 'categoria_id', valor: null });
  assert.deepEqual(interpretarFixo(C.dia, '31'), { campo: 'dia_do_mes', valor: 31 });
  assert.ok(interpretarFixo(C.dia, '32').motivo);
  assert.deepEqual(interpretarFixo(C.valor, '1.234,50'), { campo: 'valor_padrao_centavos', valor: 123450 });
  assert.deepEqual(interpretarFixo(C.valor, '0'), { campo: 'valor_padrao_centavos', valor: 0 });
  assert.ok(interpretarFixo(C.valor, '-5').motivo);
  assert.ok(interpretarFixo(C.ultimo, '10').motivo); // só leitura
  const rec = { inicio: '2026-03-01', fim: '2026-12-01' };
  assert.deepEqual(interpretarFixo(C.inicio, '01/2026', { rec }), { campo: 'inicio', valor: '2026-01-01' });
  assert.ok(interpretarFixo(C.inicio, '01/2027', { rec }).motivo);
  assert.ok(interpretarFixo(C.fim, '02/2026', { rec }).motivo);
  assert.deepEqual(interpretarFixo(C.fim, '', { rec }), { campo: 'fim', valor: null });
});

test('textoFixo e padroesDoUltimo', () => {
  const rec = { id: 'a', ativa: true, descricao: 'Aluguel', categoria_id: 'mor', dia_do_mes: 5, valor_padrao_centavos: 190000, inicio: '2024-01-01', fim: null };
  const ultimos = { a: { valor_centavos: 195000, competencia: '2026-10' } };
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6, 7].map((c) => textoFixo(rec, c, { categorias, ultimos })),
    ['sim', 'Aluguel', 'Moradia', '5', '1900,00', '1950,00', '01/2024', '']);
  assert.deepEqual(padroesDoUltimo([rec, { id: 'b', valor_padrao_centavos: 10 }], ultimos), [{ id: 'a', antes: 190000, depois: 195000 }]);
});
