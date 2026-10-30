import { test } from 'node:test';
import assert from 'node:assert/strict';
import { agrupar, ordenarGrupos, planoClassificar, problemaDaEscolha, quantasPega } from '../src/lib/pendencias.js';

// Dados FICTÍCIOS.
const P = (id, data, estabelecimento, valor_centavos, cartao = 'XP') => ({ id, data, estabelecimento, descricao: estabelecimento, valor_centavos, cartao: cartao ? { nome: cartao } : null });
const pend = [
  P('1', '2026-08-22', 'PADARIA SOL', 1000),
  P('2', '2026-08-23', 'padaria sol', 1500),
  P('3', '2026-08-15', 'UBER *TRIP', 2000),
  P('4', '2026-08-29', 'UBER *EATS', 3000),
  P('5', '2026-08-10', 'SUSHI KAZU', 9000, null),
];

test('agrupar: um grupo por estabelecimento, sem diferenciar maiúscula; ordenar', () => {
  const g = agrupar(pend);
  assert.equal(g.length, 4);
  const pad = g.find((x) => x.chave === 'padaria sol');
  assert.equal(pad.total, 2500);
  assert.deepEqual(pad.itens.map((p) => p.id), ['2', '1']); // a mais nova primeiro
  assert.deepEqual(ordenarGrupos(g, 'compras').map((x) => x.chave)[0], 'padaria sol');
  assert.deepEqual(ordenarGrupos(g, 'total').map((x) => x.chave)[0], 'sushi kazu');
  assert.deepEqual(ordenarGrupos(g, 'data').map((x) => x.chave)[0], 'uber *eats');
});

test('quantasPega e o problema da palavra', () => {
  assert.equal(quantasPega('UBER', pend), 2);
  assert.equal(quantasPega('  ', pend), 0);
  const [uber] = agrupar(pend).filter((x) => x.chave === 'uber *trip');
  assert.equal(problemaDaEscolha(uber, { palavra: 'UBER' }), null);
  assert.match(problemaDaEscolha(uber, { palavra: 'TAXI' }), /não aparece/);
  assert.equal(problemaDaEscolha(uber, { palavra: '' }), null); // sem regra: só estas compras
});

test('planoClassificar: a regra pega os não escolhidos; o escolhido fica com a categoria dele', () => {
  const g = agrupar(pend);
  // UBER *TRIP → Transporte com a regra "UBER" (pegaria o EATS), mas o EATS foi escolhido como Delivery
  let plano = planoClassificar(g, { 'uber *trip': { categoriaId: 'transp', palavra: 'UBER' }, 'uber *eats': { categoriaId: 'deliv', palavra: '' } }, pend);
  assert.deepEqual(plano.passos.map((p) => [p.chave, p.ids]), [['uber *trip', ['3']], ['uber *eats', ['4']]]);
  assert.equal(plano.deOutros, 0);
  assert.equal(plano.regras, 1);
  // sem escolher o EATS, a regra o leva junto
  plano = planoClassificar(g, { 'uber *trip': { categoriaId: 'transp', palavra: 'UBER' } }, pend);
  assert.deepEqual(plano.passos[0].ids, ['3', '4']);
  assert.equal(plano.deOutros, 1);
  assert.equal(plano.lancamentos, 2);
  // sem categoria não conta
  assert.equal(planoClassificar(g, { 'sushi kazu': { categoriaId: '', palavra: 'SUSHI' } }, pend).passos.length, 0);
});
