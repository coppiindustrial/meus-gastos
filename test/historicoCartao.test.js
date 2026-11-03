import { test } from 'node:test';
import assert from 'node:assert/strict';
import { anoContraAno, anosComFatura, comprasDaLoja, linhaDoTempo, porCategoria } from '../src/lib/historicoCartao.js';

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
  // UM ANO: um ano passado vai de janeiro a dezembro, sem parcelas; o da fatura mais nova, até ela e as parcelas do ano
  const ano25 = linhaDoTempo({ faturas, parcelas, periodo: 'ano:2025', hoje: '2026-11-03' });
  assert.deepEqual([ano25.colunas[0].comp, ano25.colunas.length, ano25.resumo.total, ano25.resumo.faturas, ano25.resumo.parcelas], ['2025-01', 12, 300000, 2, null]);
  const ano26 = linhaDoTempo({ faturas, parcelas, periodo: 'ano:2026', hoje: '2026-11-03' });
  assert.deepEqual(ano26.colunas.map((c) => c.comp).slice(-3), ['2026-09', '2026-10', '2026-11']);
  assert.deepEqual([ano26.colunas.length, ano26.resumo.total, ano26.resumo.parcelas], [11, 850000, { total: 15000, ate: '2026-11' }]);
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
    { id: 1, data: '2026-10-02', categoria_id: 'm', estabelecimento: 'MERCADO BOM', valor_centavos: 5000 },
    { id: 2, data: '2026-10-09', categoria_id: 'm', estabelecimento: 'mercado  bom', valor_centavos: 3000 },
    { id: 3, data: '2026-10-05', categoria_id: 'r', estabelecimento: 'PIZZA', valor_centavos: 4000 },
    { id: 4, data: '2026-10-06', categoria_id: null, descricao: 'Ajuste', valor_centavos: 1000 },
  ], categorias, 2);
  assert.equal(r.total, 13000);
  assert.deepEqual(r.categorias.map((c) => [c.nome, c.total, c.qtd, c.cor]), [['Mercado', 8000, 2, '#0a0'], ['Restaurante', 4000, 1, '#f80'], ['Sem categoria', 1000, 1, null]]);
  assert.deepEqual(r.lojas.map((l) => [l.nome, l.vezes, l.total, l.ticket, l.ultima, l.categoriaId]),
    [['MERCADO BOM', 2, 8000, 4000, '2026-10-09', 'm'], ['PIZZA', 1, 4000, 4000, '2026-10-05', 'r']]);
});

test('comprasDaLoja: as parcelas da mesma compra contam uma vez; o IOF do mesmo dia entra na compra', () => {
  // o Claude: cada cobrança com o IOF (3,5%) numa linha à parte — 4 linhas, 2 compras
  const claude = comprasDaLoja([
    { id: 1, data: '2026-08-18', valor_centavos: 55000 }, { id: 2, data: '2026-08-18', valor_centavos: 1925 },
    { id: 3, data: '2026-09-18', valor_centavos: 1925 }, { id: 4, data: '2026-09-18', valor_centavos: 55000 },
  ]);
  assert.deepEqual(claude, [
    { data: '2026-09-18', total: 56925, iof: 1925, parcelas: null, linhas: 2 },
    { data: '2026-08-18', total: 56925, iof: 1925, parcelas: null, linhas: 2 },
  ]);
  // a Dell (Nubank: a data anda com a parcela): as parcelas 8 a 12 de 12, uma por fatura — 1 compra
  const dell = comprasDaLoja([8, 9, 10, 11, 12].map((p, i) => ({ id: p, data: `2026-0${i + 1}-06`, competencia: `2026-0${i + 2}-01`, valor_centavos: 123191, parcela_atual: p, parcela_total: 12 })));
  assert.deepEqual(dell, [{ data: '2026-01-06', total: 615955, iof: 0, parcelas: { de: 8, ate: 12, total: 12 }, linhas: 5 }]);
  // a Brooksfield (XP: a data da compra em todas): a 1ª parcela leva o resto da divisão (R$ 644,40, as outras R$ 644,37)
  // — 1 compra, parcelas 1 a 5; outra compra em 10x no mesmo mês, de outro valor, segue à parte
  const brooks = [1, 2, 3, 4, 5].map((p) => ({ id: p, data: '2026-05-11', competencia: `2026-${String(p + 5).padStart(2, '0')}-01`, valor_centavos: p === 1 ? 64440 : 64437, parcela_atual: p, parcela_total: 10 }));
  assert.deepEqual(comprasDaLoja(brooks), [{ data: '2026-05-11', total: 322188, iof: 0, parcelas: { de: 1, ate: 5, total: 10 }, linhas: 5 }]);
  const outra = { id: 9, data: '2026-05-20', competencia: '2026-06-01', valor_centavos: 15000, parcela_atual: 1, parcela_total: 10 };
  assert.deepEqual(comprasDaLoja([...brooks, outra]).map((c) => [c.total, c.parcelas.de, c.parcelas.ate]), [[15000, 1, 1], [322188, 1, 5]]);
  // a XP repete a data da compra em todas as parcelas: duas compras parceladas, não quatro
  const xp = comprasDaLoja([
    ...[1, 2, 3].map((p) => ({ id: `a${p}`, data: '2026-06-27', competencia: `2026-0${6 + p}-01`, valor_centavos: 84000, parcela_atual: p, parcela_total: 5 })),
    { id: 'b1', data: '2026-09-08', competencia: '2026-10-01', valor_centavos: 42500, parcela_atual: 1, parcela_total: 4 },
  ]);
  assert.deepEqual(xp.map((c) => [c.data, c.total, c.parcelas]), [['2026-09-08', 42500, { de: 1, ate: 1, total: 4 }], ['2026-06-27', 252000, { de: 1, ate: 3, total: 5 }]]);
  // duas compras no mesmo dia que não são IOF (uma não é 2,5–7% da outra) continuam duas
  assert.equal(comprasDaLoja([{ id: 1, data: '2026-09-29', valor_centavos: 1998 }, { id: 2, data: '2026-09-29', valor_centavos: 1897 }]).length, 2);
});
