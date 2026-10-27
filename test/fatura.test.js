import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lerFatura, pistaDoArquivo, vencimentoProvavel } from '../src/lib/lerFatura.js';
import { criarClassificador, regraPega } from '../src/lib/classificar.js';

// Dados FICTÍCIOS (o repositório é público): mesmo formato dos arquivos reais.
const NUBANK = [
  'date,title,amount',
  '2026-08-05,Padaria Exemplo,"53,90"',
  '2026-07-06,Loja Teste - Parcela 9/12,"208,25"',
  '2026-07-06,Pagamento recebido,"- 2.998,73"',
  '2026-07-29,Seguro Parc6,"1.284,63"',
].join('\n');

const PADRAO = [
  '﻿Data;Estabelecimento;Portador;Valor;Parcela',
  '08/04/2026;RESTAURANTE X;FULANO DE TAL;R$ 229,00;-',
  '01/07/2026;LOJA Y;FULANO DE TAL;R$ 63,90;1 de 10',
  '03/06/2026;Pagamento recebido;FULANO DE TAL;-R$ 3.070,55;-',
].join('\r\n');

test('Nubank: data ISO, valor com vírgula entre aspas, parcela no título, pagamento ignorado', () => {
  const r = lerFatura(NUBANK);
  assert.equal(r.formato, 'nubank');
  assert.equal(r.linhas.length, 3);
  assert.deepEqual(r.linhas[0], { data: '2026-08-05', estabelecimento: 'Padaria Exemplo', valor_centavos: 5390, parcela_atual: null, parcela_total: null, portador: null });
  assert.equal(r.linhas[1].estabelecimento, 'Loja Teste');
  assert.deepEqual([r.linhas[1].parcela_atual, r.linhas[1].parcela_total], [9, 12]);
  assert.equal(r.linhas[2].valor_centavos, 128463);
  assert.equal(r.ignoradas.length, 1);
  assert.equal(r.ignoradas[0].valor_centavos, -299873);
});

test('padrão (XP): BOM, CRLF, data BR, "R$", parcela "1 de 10", portador', () => {
  const r = lerFatura(PADRAO);
  assert.equal(r.formato, 'padrao');
  assert.equal(r.linhas.length, 2);
  assert.deepEqual(r.linhas[1], { data: '2026-07-01', estabelecimento: 'LOJA Y', valor_centavos: 6390, parcela_atual: 1, parcela_total: 10, portador: 'FULANO DE TAL' });
  assert.equal(r.ignoradas.length, 1);
});

test('formato desconhecido e linha quebrada dão erro claro', () => {
  assert.throws(() => lerFatura('a;b;c\n1;2;3'), /não reconhecido/);
  assert.throws(() => lerFatura('date,title,amount\nontem,Loja,"1,00"'), /Linha 2 ilegível/);
});

test('pista pelo nome do arquivo', () => {
  assert.deepEqual(pistaDoArquivo('Nubank_2026-08-13.csv'), { cartao: 'nubank', vencimento: '2026-08-13' });
  assert.deepEqual(pistaDoArquivo('Nubank_2026-08-13_convertida.csv'), { cartao: 'nubank', vencimento: '2026-08-13' });
  assert.deepEqual(pistaDoArquivo('Fatura2026-05-10.csv'), { cartao: 'xp', vencimento: '2026-05-10' });
  assert.deepEqual(pistaDoArquivo('extrato.csv'), { cartao: null, vencimento: null });
});

test('vencimento provável: o próximo dia de vencimento depois da última compra', () => {
  const l = (data) => ({ data });
  assert.equal(vencimentoProvavel([l('2026-07-06'), l('2026-08-05')], 13), '2026-08-13');
  assert.equal(vencimentoProvavel([l('2026-08-01')], 10), '2026-08-10');
  assert.equal(vencimentoProvavel([l('2026-08-15')], 10), '2026-09-10');
  assert.equal(vencimentoProvavel([l('2026-12-20')], 10), '2027-01-10');
  assert.equal(vencimentoProvavel([l('2026-01-31')], 31), '2026-02-28');
});

test('classificação: primeira regra por prioridade, sem diferenciar maiúscula, com curingas do Excel', () => {
  const classificar = criarClassificador([
    { palavra_chave: 'RESTAURANTE', categoria_id: 'rest', prioridade: 2 },
    { palavra_chave: 'POSTO', categoria_id: 'gas', prioridade: 1 },
    { palavra_chave: 'Dl*Uberrides', categoria_id: 'uber', prioridade: 3 },
    { palavra_chave: 'A?C', categoria_id: 'abc', prioridade: 4 },
  ]);
  assert.equal(classificar('Posto do Restaurante')?.categoria_id, 'gas');
  assert.equal(classificar('restaurante central')?.categoria_id, 'rest');
  assert.equal(classificar('Dl *Uberrides')?.categoria_id, 'uber');
  assert.equal(classificar('DL*UBERRIDES')?.categoria_id, 'uber');
  assert.equal(classificar('XABC')?.categoria_id, 'abc');
  assert.equal(classificar('Loja qualquer'), null);
  assert.equal(regraPega('mp*birden', 'MP *BIRDEN LTDA'), true);
  assert.equal(regraPega('A.B', 'AXB'), false); // ponto é literal, não curinga de regex
});
