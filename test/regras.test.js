import { test } from 'node:test';
import assert from 'node:assert/strict';
import { alteracoesRegras, diferencaRegra, nomesDistintos, prioridades, quemPega, totalAlteracoesRegras, usoDasRegras, validarRegras } from '../src/lib/regras.js';

// Dados FICTÍCIOS.
const R = (id, palavra_chave, categoria_id, prioridade, pos, extra = {}) => ({
  id, pos, novo: false, excluir: false, palavra_chave, categoria_id, ignorar: false,
  orig: { palavra_chave, categoria_id, ignorar: false, prioridade }, ...extra,
});
const regras = [R('a', 'BURGER', 'res', 5, 0), R('b', 'BURGER KING', 'del', 5, 1), R('c', 'POSTO', 'gas', 9, 2), R('d', 'LOJA VELHA', 'ves', 12, 3)];

test('nomesDistintos e usoDasRegras: a primeira decide; escondida e sem uso', () => {
  const nomes = nomesDistintos([
    { estabelecimento: 'BURGER KING 123', data: '2026-10-01' }, { estabelecimento: 'burger king 123', data: '2026-10-05' },
    { estabelecimento: 'SMASH BURGER', data: '2026-09-01' }, { estabelecimento: 'POSTO SHELL', data: '2026-08-01' }, { descricao: 'Sem estabelecimento', data: '2026-01-01' },
  ]);
  assert.equal(nomes.length, 4);
  assert.deepEqual(nomes[0], { nome: 'BURGER KING 123', n: 2, ultima: '2026-10-05' });
  const u = usoDasRegras(regras, nomes);
  assert.deepEqual(u.get('a'), { pegou: 3, ultima: '2026-10-05', pegaria: 0, aviso: null });
  assert.deepEqual(u.get('b').aviso, { tipo: 'escondida', por: 'a' });
  assert.equal(u.get('b').pegaria, 2);
  assert.deepEqual(u.get('d').aviso, { tipo: 'sem-uso' });
  assert.equal(u.get('c').pegou, 1);
});

test('quemPega: as do rascunho, na ordem', () => {
  assert.deepEqual(quemPega(regras, 'BURGER KING 9').map((r) => r.id), ['a', 'b']);
  assert.deepEqual(quemPega(regras, '  '), []);
});

test('prioridades: sem mexer na ordem, nada muda; mexendo, 1, 2, 3…', () => {
  assert.equal(totalAlteracoesRegras(alteracoesRegras(regras)), 0);
  const p0 = prioridades(regras);
  assert.equal(p0.get('a'), undefined);
  const trocada = [regras[1], regras[0], regras[2], regras[3]]; // KING sobe acima de BURGER
  const a = alteracoesRegras(trocada);
  assert.deepEqual(a.prioridades.get('b'), 1);
  assert.deepEqual(diferencaRegra(trocada[0], a.prioridades.get('b')), { prioridade: 1 });
  assert.deepEqual(a.mudadas.map((l) => l.id).sort(), ['a', 'b', 'c', 'd']); // 5,5,9,12 → 1,2,3,4
  // excluir uma não conta como mexer na ordem das outras
  const semC = regras.map((r) => (r.id === 'c' ? { ...r, excluir: true } : r));
  const b = alteracoesRegras(semC);
  assert.equal(b.mudadas.length, 0);
  assert.deepEqual(b.excluir.map((l) => l.id), ['c']);
  // a nova no fim vai depois da maior prioridade; a nova levada para o meio renumera tudo
  const nova = { id: 'n', novo: true, excluir: false, palavra_chave: 'UBER', categoria_id: 'app', ignorar: false, orig: null };
  assert.equal(prioridades([...regras, nova]).get('n'), 13);
  assert.equal(prioridades([...regras, nova]).get('a'), undefined);
  const noMeio = prioridades([regras[0], nova, regras[1], regras[2], regras[3]]);
  assert.equal(noMeio.get('n'), 2);
  assert.equal(noMeio.get('b'), 3);
});

test('diferencaRegra: categoria, ignorar e a nova; validarRegras', () => {
  assert.deepEqual(diferencaRegra({ ...regras[2], categoria_id: 'out' }), { categoria_id: 'out' });
  assert.deepEqual(diferencaRegra({ ...regras[2], ignorar: true }), { categoria_id: null, ignorar: true });
  const nova = { id: 'n', novo: true, excluir: false, palavra_chave: ' UBER ', categoria_id: 'app', ignorar: false, orig: null };
  assert.deepEqual(diferencaRegra(nova, 5), { palavra_chave: 'UBER', categoria_id: 'app', ignorar: false, prioridade: 5 });
  assert.equal(validarRegras(regras), null);
  assert.match(validarRegras([...regras, { ...nova, palavra_chave: 'posto' }]).motivo, /duas vezes/);
  assert.match(validarRegras([...regras, { ...nova, categoria_id: '' }]).motivo, /sem categoria/);
  assert.equal(validarRegras([...regras, { ...nova, palavra_chave: '', categoria_id: '' }]), null); // nova em branco não conta
});
