import { test } from 'node:test';
import assert from 'node:assert/strict';
import { comprometidoPorMes, gastosPorGrupo, mediaAnterior, mesesAte, totaisPorMes } from '../src/lib/resumo.js';

// Linhas no formato da view resumo_mensal (valores fictícios).
const L = (competencia, tipo, origem, categoria_id, total_centavos, qtd = 1) => ({ competencia, tipo, origem, categoria_id, total_centavos, qtd });
const linhas = [
  L('2026-07', 'entrada', 'entrada', 'sal', 1000000),
  L('2026-07', 'saida', 'cartao', 'merc', 30000, 4),
  L('2026-07', 'saida', 'fixo', 'luz', 20000),
  L('2026-07', 'saida', 'manual', null, 5000),
  L('2026-08', 'saida', 'cartao', 'merc', 40000, 5),
  L('2026-06', 'saida', 'cartao', 'merc', '10000'), // o PostgREST pode devolver bigint como texto
];
const categorias = [
  { id: 'merc', nome: 'Mercado', grupo: { id: 'ali', nome: 'Alimentação', cor: '#f00' } },
  { id: 'luz', nome: 'Luz', grupo: { id: 'casa', nome: 'Casa', cor: '#0f0' } },
  { id: 'sal', nome: 'Salário', grupo: { id: 'renda', nome: 'Renda', cor: '#00f' } },
];

test('totais por mês separam entradas, gastos e origem', () => {
  const m = totaisPorMes(linhas);
  assert.deepEqual(m['2026-07'], { entradas: 1000000, gastos: 55000, cartao: 30000, fixo: 20000, manual: 5000, saldo: 945000 });
  assert.equal(m['2026-06'].gastos, 10000);
});

test('média dos meses anteriores ignora meses sem dado', () => {
  const m = totaisPorMes(linhas);
  assert.deepEqual(mediaAnterior(m, '2026-08', 3), { media: 32500, meses: 2 });
  assert.equal(mediaAnterior(m, '2026-06', 3), null);
});

test('meses até', () => {
  assert.deepEqual(mesesAte('2026-02', 3), ['2025-12', '2026-01', '2026-02']);
});

test('gastos por grupo e categoria, do maior para o menor, com "Sem categoria"', () => {
  const g = gastosPorGrupo(linhas, '2026-07', categorias);
  assert.deepEqual(g.map((x) => [x.nome, x.total]), [['Alimentação', 30000], ['Casa', 20000], ['Sem categoria', 5000]]);
  assert.equal(g[0].categorias[0].qtd, 4);
});

test('comprometido por mês soma as parcelas depois do mês escolhido', () => {
  const p = [
    { competencia: '2026-09', valor_centavos: 1000 },
    { competencia: '2026-09', valor_centavos: 500 },
    { competencia: '2026-10', valor_centavos: 1000 },
    { competencia: '2026-08', valor_centavos: 9999 },
  ];
  assert.deepEqual(comprometidoPorMes(p, '2026-08'), [
    { competencia: '2026-09', total: 1500, qtd: 2 },
    { competencia: '2026-10', total: 1000, qtd: 1 },
  ]);
});
