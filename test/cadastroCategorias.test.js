import { test } from 'node:test';
import assert from 'node:assert/strict';
import { alteracoes, diferencaCategoria, ordens, reorganizar, totalAlteracoes, validar } from '../src/lib/cadastroCategorias.js';

// Dados FICTÍCIOS.
const G = (id, nome, ordem, extra = {}) => ({ id, nome, tipo: 'saida', cor: '#111', novo: false, excluir: false, orig: { nome, tipo: 'saida', cor: '#111', ordem }, ...extra });
const C = (id, nome, grupo_id, ordem, extra = {}) => ({ id, nome, grupo_id, ativa: true, novo: false, excluir: false, juntarEm: null, orig: { nome, grupo_id, ativa: true, ordem }, ...extra });
const grupos = [G('a', 'Alimentação', 0), G('b', 'Casa', 1)];
const cats = [C('m', 'Mercado', 'a', 0), C('r', 'Restaurante', 'a', 1), C('l', 'Luz', 'b', 0)];

test('sem mudança, nada a salvar', () => {
  assert.equal(totalAlteracoes(alteracoes(grupos, cats)), 0);
  assert.equal(validar(grupos, cats), null);
});

test('reorganizar: arrastar para baixo de outro cabeçalho muda o grupo; a ordem segue a tela', () => {
  const r = reorganizar(['g:a', 'c:r', 'g:b', 'c:m', 'c:l'], cats);
  assert.deepEqual(r.map((c) => `${c.id}:${c.grupo_id}`), ['r:a', 'm:b', 'l:b']);
  const a = alteracoes(grupos, r);
  // Restaurante subiu (ordem 0), Mercado mudou de grupo, Luz desceu (ordem 1)
  assert.deepEqual(a.catsMudadas.map((c) => c.id).sort(), ['l', 'm', 'r']);
  assert.deepEqual(diferencaCategoria(r[1], a.ordens.categoria.get('m')), { grupo_id: 'b' }); // continua a 1ª
  // acima do primeiro cabeçalho = no primeiro grupo
  assert.equal(reorganizar(['c:l', 'g:a', 'c:m', 'c:r', 'g:b'], cats)[0].grupo_id, 'a');
});

test('juntar e excluir saem da ordem e do grupo; linha nova em branco não conta', () => {
  const r = [C('m', 'Mercado', 'a', 0, { juntarEm: 'r' }), C('r', 'Restaurante', 'a', 1), C('l', 'Luz', 'b', 0),
    { id: 'n1', nome: '', grupo_id: 'b', ativa: true, novo: true, excluir: false, juntarEm: null, orig: null }];
  const a = alteracoes(grupos, r);
  assert.deepEqual(a.catsJuntar.map((c) => c.id), ['m']);
  assert.equal(ordens(grupos, r).categoria.get('r'), 0);
  assert.equal(a.catsNovas.length, 0);
  assert.equal(totalAlteracoes(a), 2); // juntar Mercado + Restaurante subiu para 0
});

test('validar: nome vazio, repetido (sem diferenciar maiúscula) e grupo que sai com categoria', () => {
  assert.equal(validar(grupos, [...cats, C('x', ' mercado ', 'b', 1)]).motivo, 'a categoria "Mercado" aparece duas vezes');
  assert.match(validar([G('a', '', 0), grupos[1]], cats).motivo, /sem nome/);
  assert.match(validar([grupos[0], { ...grupos[1], excluir: true }], cats).motivo, /ainda tem categorias/);
  // grupo vazio pode sair; a categoria juntada não conta como "dentro"
  assert.equal(validar([grupos[0], { ...grupos[1], excluir: true }], [cats[0], cats[1], { ...cats[2], juntarEm: 'm' }]), null);
});
