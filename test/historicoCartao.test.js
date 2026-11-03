import { test } from 'node:test';
import assert from 'node:assert/strict';
import { anoContraAno, anosComFatura, linhaDoTempo, porCategoria } from '../src/lib/historicoCartao.js';

// Dados FICTÍCIOS.
const F = (competencia, total_centavos, qtd = 10) => ({ competencia, vencimento: `${competencia}-13`, total_centavos, qtd });
const faturas = [F('2025-03', 100000), F('2025-05', 200000), F('2026-01', 300000, 20), F('2026-10', 400000, 30), F('2026-05', 150000)];
const parcelas = [
  { competencia: '2026-11', valor_centavos: 10000, lancamento_id: 'a' },
  { competencia: '2026-11', valor_centavos: 5000, lancamento_id: 'b' },
  { competencia: '2027-01', valor_centavos: 10000, lancamento_id: 'a' },
];

test('linhaDoTempo: o período até a fatura mais nova (mês vazio = coluna vazia) e depois todas as parcelas', () => {
  const t = linhaDoTempo({ faturas, parcelas, periodo: '12', hoje: '2026-11-03' });
  assert.equal(t.colunas.length, 12 + 3);
  assert.equal(t.colunas[0].comp, '2025-11');
  assert.deepEqual(t.colunas.slice(-3).map((c) => [c.comp, c.tipo, c.total, c.qtd]),
    [['2026-11', 'parcelas', 15000, 2], ['2026-12', 'parcelas', 0, 0], ['2027-01', 'parcelas', 10000, 1]]);
  assert.deepEqual(t.anos, [{ ano: '2025', n: 2 }, { ano: '2026', n: 12 }, { ano: '2027', n: 1 }]);
  assert.deepEqual(t.resumo, { total: 850000, faturas: 3, compras: 60, media: 283333, maior: { comp: '2026-10', total: 400000 }, parcelas: { total: 25000, ate: '2027-01' } });
  assert.deepEqual(t.linhas.map((l) => [l.comp, l.difMedia]), [['2026-10', 116667], ['2026-05', -133333], ['2026-01', 16667]]);
  // todo o histórico começa na primeira fatura
  const tudo = linhaDoTempo({ faturas, parcelas: [], periodo: 'tudo', hoje: '2026-11-03' });
  assert.deepEqual([tudo.colunas[0].comp, tudo.colunas.length, tudo.resumo.faturas, tudo.resumo.parcelas], ['2025-03', 20, 5, null]);
});

test('anoContraAno: lado a lado, parcelas depois da última fatura e a comparação no mesmo período', () => {
  assert.deepEqual(anosComFatura(faturas), ['2026', '2025']);
  const r = anoContraAno({ faturas, parcelas, a: '2025', b: '2026' });
  assert.deepEqual(r.meses[4], { mes: 5, a: 200000, b: 150000, bFutura: 0 });
  assert.equal(r.meses[10].bFutura, 15000); // nov/26: ainda sem fatura, as parcelas que vêm
  assert.deepEqual(r.anos['2026'], { total: 850000, faturas: 3, media: 283333, maior: { mes: 10, total: 400000 } });
  assert.deepEqual(r.mesmoPeriodo, { ateMes: 10, a: 300000, b: 850000, variacao: (850000 - 300000) / 300000 });
});

test('porCategoria: as categorias do período e as lojas que mais pesaram (sem diferenciar maiúscula)', () => {
  const categorias = [{ id: 'm', nome: 'Mercado', grupo: { cor: '#0a0' } }, { id: 'r', nome: 'Restaurante', grupo: { cor: '#f80' } }];
  const r = porCategoria([
    { categoria_id: 'm', estabelecimento: 'MERCADO BOM', valor_centavos: 5000 },
    { categoria_id: 'm', estabelecimento: 'mercado  bom', valor_centavos: 3000 },
    { categoria_id: 'r', estabelecimento: 'PIZZA', valor_centavos: 4000 },
    { categoria_id: null, descricao: 'Ajuste', valor_centavos: 1000 },
  ], categorias, 2);
  assert.equal(r.total, 13000);
  assert.deepEqual(r.categorias.map((c) => [c.nome, c.total, c.qtd, c.cor]), [['Mercado', 8000, 2, '#0a0'], ['Restaurante', 4000, 1, '#f80'], ['Sem categoria', 1000, 1, null]]);
  assert.deepEqual(r.lojas, [{ nome: 'MERCADO BOM', vezes: 2, total: 8000 }, { nome: 'PIZZA', vezes: 1, total: 4000 }]);
});
