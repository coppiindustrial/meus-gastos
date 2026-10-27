import { test } from 'node:test';
import assert from 'node:assert/strict';
import { anoAnterior, filtrar, gruposPorMes, periodo, resumoPeriodo, variacao } from '../src/lib/visaoGeral.js';

// Linhas no formato da view resumo_mensal (valores fictícios).
const L = (competencia, tipo, origem, categoria_id, total_centavos, qtd = 1) => ({ competencia, tipo, origem, categoria_id, total_centavos, qtd });
const linhas = [
  L('2026-07', 'entrada', 'entrada', 'sal', 1000000),
  L('2026-07', 'saida', 'cartao', 'merc', 30000, 4),
  L('2026-07', 'saida', 'fixo', 'luz', 20000),
  L('2026-08', 'saida', 'cartao', 'merc', '40000', 5), // bigint pode vir como texto
  L('2026-08', 'saida', 'manual', null, 5000),
  L('2025-07', 'saida', 'cartao', 'merc', 25000, 3),
];
const casa = { id: 'g1', nome: 'Casa', cor: '#0d9488' };
const alim = { id: 'g2', nome: 'Alimentação', cor: '#ea580c' };
const categorias = [
  { id: 'merc', nome: 'Mercado', grupo: alim },
  { id: 'luz', nome: 'Luz', grupo: casa },
  { id: 'sal', nome: 'Salário', grupo: { id: 'g3', nome: 'Renda', cor: '#15803d' } },
];

test('periodo: anos × meses, e sem meses é o ano todo', () => {
  assert.deepEqual(periodo([2026], [8, 7]), ['2026-07', '2026-08']);
  assert.equal(periodo([2026, 2025]).length, 24);
  assert.equal(periodo([2026, 2025])[0], '2025-01');
  assert.deepEqual(anoAnterior(['2026-07', '2026-08']), ['2025-07', '2025-08']);
});

test('filtrar: tipo, origem e categoria (com "sem")', () => {
  assert.equal(filtrar(linhas, { tipo: 'entrada' }).length, 1);
  assert.equal(filtrar(linhas, { origens: ['fixo', 'manual'] }).length, 2);
  assert.equal(filtrar(linhas, { cats: ['sem'] }).length, 1);
});

test('resumoPeriodo: totais, por origem, média pelos meses com dado e mês mais caro', () => {
  const r = resumoPeriodo(linhas, periodo([2026], [7, 8, 9]));
  assert.equal(r.entradas, 1000000);
  assert.equal(r.gastos, 95000);
  assert.equal(r.saldo, 905000);
  assert.equal(r.qtd, 12);
  assert.deepEqual(r.porOrigem, { cartao: 70000, fixo: 20000, manual: 5000 });
  assert.equal(r.meses, 2); // setembro não tem dado
  assert.equal(r.maisCaro.competencia, '2026-07');
  assert.equal(r.porMes[2].temDado, false);
  assert.equal(r.porMes[0].saldo, 950000);
});

test('gruposPorMes: grupo, categorias, meses e "Sem categoria"', () => {
  const g = gruposPorMes(linhas, periodo([2026], [7, 8]), categorias);
  assert.deepEqual(g.map((x) => x.nome), ['Alimentação', 'Casa', 'Sem categoria']);
  assert.deepEqual(g[0].meses, { '2026-07': 30000, '2026-08': 40000 });
  assert.equal(g[0].media, 35000);
  assert.equal(g[0].categorias[0].nome, 'Mercado');
  assert.equal(g[0].qtd, 9);
});

test('variacao: em %, e null sem base', () => {
  assert.equal(variacao(110, 100), 10);
  assert.equal(variacao(5, 0), null);
});
