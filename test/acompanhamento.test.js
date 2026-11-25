import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  altasEBaixas, areasDasClasses, corDaVariacao, desdeDe, emPorcentoDoInicio, eventosSemRepetir, faixaDe, faixasDaEscala, juntarLeitura, listaDoAcompanhamento,
  mediaDasSeries, planoDoAcompanhamento, pregaoAberto, quandoDoPregao, squarify, tamanhos, variacao, variacoesDoPeriodo,
} from '../src/lib/acompanhamento.js';

// Dados FICTÍCIOS.
const ATIVOS = [
  { id: 'a1', ticker: 'KNCR11', mercado: 'B3', tipo: 'fii', nome: 'Kinea', ordem: 1, ativo: true },
  { id: 'a2', ticker: 'NVDA', mercado: 'EUA', tipo: 'acao_eua', nome: 'NVIDIA', ordem: 2, ativo: true },
  { id: 'a3', ticker: 'MU', mercado: 'EUA', tipo: 'acao_eua', nome: 'Micron', ordem: 1, ativo: true },
  { id: 'a4', ticker: 'OLD', mercado: 'EUA', tipo: 'acao_eua', nome: 'Velha', ordem: 3, ativo: false },
  { id: 'a5', ticker: 'MU', mercado: 'EUA', tipo: 'acao_eua', nome: 'Micron de novo', ordem: 9, ativo: true },
];
const LINHAS = [
  { id: 'l1', ticker: 'NVDA', mercado: 'EUA', aparece: false },
  { id: 'l2', ticker: 'PETR4', mercado: 'B3', tipo: 'acao_br', nome: 'Petrobras', aparece: true, ordem: 2 },
  { id: 'l3', ticker: 'MSFT', mercado: 'EUA', tipo: 'acao_eua', nome: 'Microsoft', aparece: true, ordem: 1 },
];

test('a lista: a carteira pela classe e pela ordem, sem os desativados nem repetidos; depois os acompanhados', () => {
  const l = listaDoAcompanhamento(ATIVOS, LINHAS);
  assert.deepEqual(l.map((i) => i.chave), ['EUA:MU', 'EUA:NVDA', 'B3:KNCR11', 'EUA:MSFT', 'B3:PETR4']);
  assert.equal(l.find((i) => i.chave === 'EUA:NVDA').aparece, false); // a linha esconde o da carteira
  assert.equal(l.find((i) => i.chave === 'EUA:NVDA').linhaId, 'l1');
  assert.equal(l.find((i) => i.chave === 'EUA:MU').aparece, true); // sem linha, aparece
  assert.equal(l.find((i) => i.chave === 'EUA:MU').nome, 'Micron'); // o primeiro cadastro vale
  assert.equal(l.find((i) => i.chave === 'B3:PETR4').deCarteira, false);
  assert.equal(l.find((i) => i.chave === 'B3:PETR4').classe, 'b3');
  assert.deepEqual(listaDoAcompanhamento(ATIVOS, null).map((i) => i.aparece), [true, true, true]); // sem a migration
});

test('o plano do pop-up: esconder e mostrar os da carteira, acompanhar, tirar e reordenar os de fora', () => {
  const antes = listaDoAcompanhamento(ATIVOS, LINHAS);
  assert.deepEqual(planoDoAcompanhamento(antes, antes), { criar: [], atualizar: [], apagar: [] }); // abrir não muda nada
  const itens = antes.map((i) => ({ ...i }));
  itens.find((i) => i.chave === 'EUA:MU').aparece = false; // esconder sem linha → cria
  itens.find((i) => i.chave === 'EUA:NVDA').aparece = true; // mostrar com linha → apaga
  itens.find((i) => i.chave === 'EUA:MSFT').tirar = true; // tirar → apaga
  itens.push({ chave: 'B3:VALE3', ticker: 'VALE3', mercado: 'B3', nome: 'Vale', tipo: 'acao_br', deCarteira: false, aparece: true, linhaId: null });
  const p = planoDoAcompanhamento(antes, itens);
  assert.deepEqual(p.criar, [
    { ticker: 'MU', mercado: 'EUA', nome: 'Micron', tipo: 'acao_eua', aparece: false, ordem: 0 },
    { ticker: 'VALE3', mercado: 'B3', nome: 'Vale', tipo: 'acao_br', aparece: true, ordem: 2 },
  ]);
  assert.deepEqual(p.apagar.sort(), ['l1', 'l3']);
  assert.deepEqual(p.atualizar, [{ id: 'l2', mudancas: { ordem: 1 } }]); // a PETR4 subiu para o 1º lugar
});

test('o pregão: aberto no horário da bolsa, fechado no fim de semana e à noite', () => {
  const em = (iso) => new Date(iso).getTime();
  assert.equal(pregaoAberto('B3', em('2026-11-25T14:00:00-03:00')), true);
  assert.equal(pregaoAberto('B3', em('2026-11-25T09:59:00-03:00')), false);
  assert.equal(pregaoAberto('B3', em('2026-11-25T18:10:00-03:00')), true); // a folga do fechamento
  assert.equal(pregaoAberto('B3', em('2026-11-25T18:20:00-03:00')), false);
  assert.equal(pregaoAberto('EUA', em('2026-11-25T09:31:00-05:00')), true);
  assert.equal(pregaoAberto('EUA', em('2026-11-28T12:00:00-05:00')), false); // sábado
  // antes da abertura, a cotação de Nova York é a do pregão de ontem
  const ontem16h = em('2026-11-24T16:00:00-05:00') / 1000;
  assert.equal(quandoDoPregao(ontem16h, 'EUA', em('2026-11-25T09:00:00-05:00')), 'em 24/11');
  assert.equal(quandoDoPregao(ontem16h, 'EUA', em('2026-11-24T20:00:00-05:00')), 'hoje');
});

test('a variação, a leitura que se junta e o desde', () => {
  assert.equal(variacao({ preco: 110, anterior: 100 }).toFixed(4), '0.1000');
  assert.equal(variacao({ preco: 110 }), null);
  const dia = (t) => String(Math.floor(t / 100));
  const antes = { preco: 10, anterior: 9, pontos: [[100, 9.5], [101, 10]] };
  const junta = juntarLeitura(antes, { preco: 11, anterior: 9, pontos: [[101, 10], [102, 11]] }, dia);
  assert.deepEqual(junta.pontos, [[100, 9.5], [101, 10], [102, 11]]);
  assert.equal(junta.preco, 11);
  assert.deepEqual(juntarLeitura(antes, { preco: 12, anterior: 11, pontos: [[200, 12]] }, dia).pontos, [[200, 12]]); // outro dia
  assert.equal(juntarLeitura(antes, { erro: 'x' }, dia), antes); // a falha fica com o de antes
  assert.deepEqual(desdeDe({ A: junta, B: { pontos: [] } }), { A: 102 });
});

test('o % do período: o dia pelo ao vivo; os outros desde o fechamento de antes, com o preço de agora', () => {
  const vivo = { A: { preco: 110, anterior: 100 }, B: { preco: 50, anterior: 50 } };
  const serie = { A: { anterior: 88, pontos: [[1, 90], [2, 105]] }, B: { pontos: [[1, 40], [2, 45]] } };
  assert.deepEqual(variacoesDoPeriodo(['A', 'C'], 'dia', vivo, serie), { A: 0.10000000000000009, C: null });
  const m = variacoesDoPeriodo(['A', 'B'], 'mes', vivo, serie);
  assert.equal(m.A.toFixed(4), (110 / 88 - 1).toFixed(4));
  assert.equal(m.B.toFixed(4), '0.2500'); // sem o anterior, o 1º ponto
});

test('os eventos sem repetir: do mesmo trimestre, o relido por último', () => {
  const ev = [
    { ativo_id: 'a', tipo: 'resultado', data: '2026-12-15', ano: 2026, trimestre: 1, atualizado_em: '2026-11-01' },
    { ativo_id: 'a', tipo: 'resultado', data: '2026-12-17', ano: 2026, trimestre: 1, atualizado_em: '2026-11-20' },
    { ativo_id: 'b', tipo: 'resultado', data: '2026-12-17', ano: 2026, trimestre: 1, atualizado_em: '2026-11-01' },
    { ativo_id: 'a', tipo: 'dividendo', data: '2026-12-01' },
    { ativo_id: 'c', tipo: 'resultado', data: '2027-01-02' },
  ];
  assert.deepEqual(eventosSemRepetir(ev).map((e) => `${e.ativo_id}${e.data}`), ['a2026-12-17', 'b2026-12-17', 'a2026-12-01', 'c2027-01-02']);
});

test('as altas e as baixas', () => {
  const r = altasEBaixas([{ p: 0.02 }, { p: -0.01 }, { p: null }, { p: 0.05 }, { p: -0.03 }, { p: 0 }], 1);
  assert.deepEqual(r.altas.map((i) => i.p), [0.05]);
  assert.deepEqual(r.baixas.map((i) => i.p), [-0.03]);
  assert.equal(r.sobem, 2); assert.equal(r.caem, 2);
});

test('o desempenho em % do início e a média por dia', () => {
  assert.deepEqual(emPorcentoDoInicio([[1, 0], [2, 50], [3, 75]]), [[2, 0], [3, 0.5]]);
  const dia = (t) => String(t);
  assert.deepEqual(mediaDasSeries([[[1, 0], [2, 0.1]], [[1, 0], [2, 0.3], [3, 0.4]]], dia), [[1, 0], [2, 0.2], [3, 0.4]]);
});

test('a legenda e a cor', () => {
  assert.equal(faixaDe(-0.04), 0);
  assert.equal(faixaDe(0.001), 3);
  assert.equal(faixaDe(0.02), 5);
  assert.equal(faixaDe(null), -1);
  assert.equal(corDaVariacao(0), 'rgb(62, 66, 75)');
  assert.notEqual(corDaVariacao(0.03), corDaVariacao(0.01));
  assert.equal(corDaVariacao(0.05), corDaVariacao(0.03)); // passa de 3%, a cor não muda
  // a escala do mês: ±12%, de 4 em 4
  assert.deepEqual(faixasDaEscala(0.12).map((f) => f.rotulo), ['−12%', '−8%', '−4%', '0%', '+4%', '+8%', '+12%']);
  assert.equal(faixaDe(0.07, 0.12), 5);
  assert.notEqual(corDaVariacao(0.05, 0.12), corDaVariacao(0.12, 0.12));
  assert.equal(corDaVariacao(0.2, 0.12), corDaVariacao(0.12, 0.12));
});

test('os tamanhos: a raiz do valor de mercado, a posição e igual', () => {
  const it = [{ chave: 'A' }, { chave: 'B' }, { chave: 'C' }];
  assert.deepEqual(tamanhos(it, 'mercado', { cap: { A: 400, B: 100 } }), { A: 20, B: 10, C: 20 }); // C pela mediana
  assert.deepEqual(tamanhos(it, 'posicao', { posicao: { A: 800, B: 400 } }), { A: 800, B: 400, C: 200 }); // C: ¼ da mediana
  assert.deepEqual(tamanhos(it, 'igual'), { A: 1, B: 1, C: 1 });
});

test('o treemap: cobre a caixa, sem sobra, e a área segue o tamanho', () => {
  const caixa = { x: 10, y: 20, w: 600, h: 300 };
  const r = squarify([{ id: 'a', v: 6 }, { id: 'b', v: 3 }, { id: 'c', v: 2 }, { id: 'd', v: 1 }, { id: 'z', v: 0 }], caixa);
  assert.equal(r.length, 4); // o zero fica de fora
  const area = r.reduce((s, q) => s + q.w * q.h, 0);
  assert.ok(Math.abs(area - 600 * 300) < 1e-6);
  for (const q of r) {
    assert.ok(q.x >= 10 - 1e-9 && q.y >= 20 - 1e-9 && q.x + q.w <= 610 + 1e-6 && q.y + q.h <= 320 + 1e-6);
    assert.ok(Math.abs((q.w * q.h) / (600 * 300) - q.v / 12) < 1e-6);
  }
  assert.deepEqual(squarify([], caixa), []);
});

test('as áreas das classes: proporcionais, com um mínimo para a pequena', () => {
  const r = areasDasClasses({ ext: 98, fii: 2, b3: 0 }, { x: 0, y: 0, w: 100, h: 100 }, 0.2);
  assert.deepEqual(r.map((a) => a.classe).sort(), ['ext', 'fii']);
  const fii = r.find((a) => a.classe === 'fii');
  assert.ok(Math.abs(fii.w * fii.h - 10000 * (0.2 / 1.18)) < 1e-6);
});
