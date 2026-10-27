import { test } from 'node:test';
import assert from 'node:assert/strict';
import { usoPorCategoria } from '../src/lib/usoCategorias.js';

// Linhas no formato da view resumo_mensal (valores fictícios).
const L = (competencia, categoria_id, total_centavos, qtd = 1) => ({ competencia, tipo: 'saida', origem: 'cartao', categoria_id, total_centavos, qtd });

test('usoPorCategoria: mês, 12 meses, média pelos meses com dado e último uso', () => {
  const linhas = [
    L('2026-10', 'merc', 30000, 3),
    L('2026-09', 'merc', '10000', 2), // o PostgREST pode devolver bigint como texto
    L('2026-08', 'luz', 20000),
    L('2025-01', 'luz', 5000),        // fora dos 12 meses: só conta para o último uso
    L('2026-10', null, 999),          // sem categoria: fica de fora
  ];
  const { uso, meses } = usoPorCategoria(linhas, '2026-10');
  assert.equal(meses, 3); // ago, set e out têm dado
  assert.deepEqual(uso.get('merc'), { noMes: 30000, qtd: 5, soma: 40000, media: 13333, ultimo: '2026-10' });
  assert.deepEqual(uso.get('luz'), { noMes: 0, qtd: 1, soma: 20000, media: 6667, ultimo: '2026-08' });
  assert.equal(uso.has(null), false);
});

test('usoPorCategoria: sem nenhum dado na janela, média zero', () => {
  const { uso, meses } = usoPorCategoria([L('2020-01', 'merc', 100)], '2026-10');
  assert.equal(meses, 0);
  assert.equal(uso.get('merc').media, 0);
  assert.equal(uso.get('merc').ultimo, '2020-01');
});

test('usoPorCategoria: o mês em andamento fica fora da média', () => {
  const { uso, meses } = usoPorCategoria([L('2026-10', 'merc', 300), L('2026-09', 'merc', 1000)], '2026-10', 12, '2026-10');
  assert.equal(meses, 1);
  assert.equal(uso.get('merc').media, 1000);
  assert.equal(uso.get('merc').soma, 1300); // a soma dos 12 meses continua com tudo
});
