import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lerExtrato, motivoIgnorar } from '../src/lib/lerExtrato.js';

// Dados FICTÍCIOS, no formato do CSV do extrato da conta do Nubank.
const CSV = [
  'Data,Valor,Identificador,Descrição',
  '02/09/2026,1000.00,id-1,Transferência recebida pelo Pix - FULANO DE TAL - •••.111.222-•• - BANCO X (0341) Agência: 1 Conta: 2-3',
  '02/09/2026,-500.00,id-2,Dinheiro guardado com resgate planejado',
  '04/09/2026,-149.90,id-3,Pagamento de boleto efetuado - PROVEDOR DE INTERNET LTDA',
  '04/09/2026,-360.00,id-4,"Transferência enviada pelo Pix - Personal Teste - •••.333.444-•• - BCO Y (0001) Agência: 1, Conta: 9"',
  '10/09/2026,-50.00,id-5,Aplicação RDB',
  '19/09/2026,-2481.55,id-6,Pagamento de fatura',
  '20/09/2026,-12.34,id-7,Algo que o banco inventou',
  '28/09/2026,2900.00,id-8,Resgate RDB',
].join('\n');

test('lê o extrato: data, valor com sinal, identificador, tipo e contraparte', () => {
  const l = lerExtrato(CSV);
  assert.equal(l.length, 8);
  assert.deepEqual(
    { data: l[2].data, v: l[2].valor_centavos, id: l[2].id_externo, tipo: l[2].tipo, c: l[2].contraparte, nome: l[2].nome },
    { data: '2026-09-04', v: -14990, id: 'id-3', tipo: 'boleto', c: 'PROVEDOR DE INTERNET LTDA', nome: 'Boleto · PROVEDOR DE INTERNET LTDA' },
  );
  assert.equal(l[0].contraparte, 'FULANO DE TAL');
  assert.equal(l[0].tipo, 'pix_recebido');
  assert.equal(l[3].contraparte, 'Personal Teste'); // descrição entre aspas, com vírgula dentro
  assert.equal(l[6].tipo, 'outro');
});

test('o que fica de fora: entradas, fatura, investimentos e regra de ignorar', () => {
  const l = lerExtrato(CSV);
  const ignora = (x) => x.contraparte === 'FULANO DE TAL';
  assert.deepEqual(l.map((x) => motivoIgnorar(x, ignora)), [
    'entrada (lançada à mão)', 'investimento', null, null, 'investimento', 'pagamento da fatura do cartão', null, 'investimento',
  ]);
});

test('formato errado e linha quebrada dão erro claro', () => {
  assert.throws(() => lerExtrato('date,title,amount\n2026-01-01,x,1'), /Formato não reconhecido/);
  assert.throws(() => lerExtrato('Data,Valor,Identificador,Descrição\nontem,1,a,b'), /Linha 2 ilegível/);
});
