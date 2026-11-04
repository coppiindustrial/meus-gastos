import { test } from 'node:test';
import assert from 'node:assert/strict';
import { casaPalavras, casaTermo, outrosMeses, palavras, resultadosBusca } from '../src/lib/buscaLancamentos.js';

// Dados FICTÍCIOS.
const L = [
  { id: 1, competencia: '2026-10', data: '2026-09-11', tipo: 'saida', origem: 'cartao', descricao: 'LOJA ALFA CENTRO', valor_centavos: 64437, categoria: { nome: 'Vestuário' }, cartao: { nome: 'Cartão Azul' } },
  { id: 2, competencia: '2026-09', data: '2026-08-11', tipo: 'saida', origem: 'cartao', descricao: 'LOJA ALFA CENTRO', valor_centavos: 64437, categoria: { nome: 'Vestuário' } },
  { id: 3, competencia: '2026-09', data: '2026-08-20', tipo: 'saida', origem: 'cartao', descricao: 'Padaria Beta', valor_centavos: 1290, categoria: { nome: 'Alimentação' } },
  { id: 4, competencia: '2026-06', data: '2026-06-01', tipo: 'entrada', origem: 'entrada', descricao: 'Salário', valor_centavos: 500000, categoria: { nome: 'Salário' } },
  { id: 5, competencia: '2026-06', data: '2026-06-10', tipo: 'saida', origem: 'manual', descricao: 'Presente', obs: 'aniversário da Ana', valor_centavos: 15000, categoria: null },
  { id: 6, competencia: '2026-03', data: '2026-03-02', tipo: 'saida', origem: 'manual', descricao: 'Lojinha', valor_centavos: 990, categoria: null },
];

test('casaTermo: o trecho, sem acento nem maiúscula, na descrição, na obs ou na categoria', () => {
  assert.equal(casaTermo(L[0], 'alfa'), true);
  assert.equal(casaTermo(L[0], 'vestuario'), true);
  assert.equal(casaTermo(L[4], 'ANIVERSARIO'), true);
  assert.equal(casaTermo(L[2], 'alfa'), false);
  assert.equal(casaTermo(L[2], '  '), true);
  assert.equal(casaTermo(L[5], 'loj'), true); // trecho no meio também (a régua da faixa)
});

test('outrosMeses: o que casa fora do período, por mês (o mais novo primeiro), com os outros filtros', () => {
  const r = outrosMeses(L, 'loj', { de: '2026-10', ate: '2026-10' });
  assert.deepEqual(r, { total: 2, meses: [{ competencia: '2026-09', n: 1 }, { competencia: '2026-03', n: 1 }] });
  const soCartao = outrosMeses(L, 'loj', { de: '2026-10', ate: '2026-10' }, (l) => l.origem === 'cartao');
  assert.deepEqual(soCartao, { total: 1, meses: [{ competencia: '2026-09', n: 1 }] });
  assert.deepEqual(outrosMeses(L, '', { de: '2026-10', ate: '2026-10' }), { total: 0, meses: [] });
  assert.deepEqual(outrosMeses(L, 'loj', { de: null, ate: null }), { total: 0, meses: [] });
});

test('palavras e casaPalavras: cada palavra no começo de uma palavra do texto; número em qualquer ponto', () => {
  assert.deepEqual(palavras('  Loja, Álfa! '), ['loja', 'alfa']);
  const t = 'LOJA ALFA CENTRO Vestuário 644,37';
  assert.equal(casaPalavras(t, palavras('alfa cen')), true);
  assert.equal(casaPalavras(t, palavras('lfa')), false); // não no meio da palavra
  assert.equal(casaPalavras(t, palavras('vestu')), true);
  assert.equal(casaPalavras(t, palavras('44')), true); // número: em qualquer ponto
  assert.equal(casaPalavras(t, palavras('644,37')), true);
  assert.equal(casaPalavras(t, palavras('alfa beta')), false); // todas as palavras
  assert.equal(casaPalavras(t, []), false);
});

test('resultadosBusca: os mais novos primeiro, o valor e o cartão contam, totais de todos', () => {
  const r = resultadosBusca(L, 'loja', 1);
  assert.equal(r.total, 2); // "Lojinha" não começa com "loja"
  assert.deepEqual(r.itens.map((l) => l.id), [1]);
  assert.equal(r.gastos, 128874);
  assert.equal(resultadosBusca(L, 'loj').total, 3);
  assert.deepEqual(resultadosBusca(L, '644,37').itens.map((l) => l.id), [1, 2]);
  assert.deepEqual(resultadosBusca(L, 'azul').itens.map((l) => l.id), [1]);
  const s = resultadosBusca(L, 'salario');
  assert.deepEqual([s.total, s.entradas, s.gastos], [1, 500000, 0]);
  assert.equal(resultadosBusca(L, '').total, 0);
});
