import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MODELOS_PRONTOS, assinatura, decodificar, detectarFormato, lerComModelo, lerDataNoFormato, reconhecerModelo, separarParcela,
  sugerirColunas, vencimentoDoNome,
} from '../src/lib/modeloCsv.js';

// Dados FICTÍCIOS: um banco "Inter" inventado, com título antes do cabeçalho, a parcela no texto e o total no fim.
const INTER = [
  'Fatura do cartão - Outubro 2026',
  'Data Lançamento;Descrição;Categoria;Tipo;Valor',
  '02/10/2026;POSTO IPIRANGA CENTRO;Transporte;Compra à vista;"R$ 210,45"',
  '05/10/2026;LOJA MOVEIS (Parcela 3 de 10);Casa;Compra parcelada;"R$ 189,90"',
  '07/10/2026;SPOTIFY;Assinaturas;Compra internacional;"R$ 21,90"',
  '10/10/2026;PAGAMENTO FATURA;Pagamento;Pagamento;"-R$ 4.120,30"',
  '12/10/2026;RESTAURANTE SABOR;Restaurantes;Compra à vista;"R$ 1.096,00"',
  'Total da fatura;R$ 1.518,25',
].join('\r\n');
const CONFIG_INTER = {
  separador: ';', linhaCabecalho: 2, ignorarNoFim: 1, colunas: { data: 0, estabelecimento: 1, valor: 4, parcela: null, portador: null },
  data: 'dd/mm/aaaa', gasto: 'positivo', parcela: 'texto', vencimento: 'dia',
};

test('lerComModelo: cabeçalho na linha 2, total no fim, parcela no texto e o pagamento de fora', () => {
  const r = lerComModelo(INTER, CONFIG_INTER);
  assert.equal(r.linhas.length, 4);
  assert.deepEqual(r.linhas[1], { data: '2026-10-05', estabelecimento: 'LOJA MOVEIS', valor_centavos: 18990, parcela_atual: 3, parcela_total: 10, portador: null });
  assert.equal(r.linhas[3].valor_centavos, 109600);
  assert.deepEqual(r.ignoradas.map((l) => [l.estabelecimento, l.valor_centavos]), [['PAGAMENTO FATURA', -412030]]);
  // um banco que manda o GASTO negativo: o sinal se inverte (e o pagamento, positivo lá, fica de fora)
  // (o pagamento vem com "-R$": a primeira troca não o pega, a segunda o deixa positivo)
  const negativo = INTER.replace(/"R\$ /g, '"-R$ ').replace('"-R$ 4.120,30"', '"R$ 4.120,30"');
  const r2 = lerComModelo(negativo, { ...CONFIG_INTER, gasto: 'negativo' });
  assert.equal(r2.linhas.length, 4);
  assert.equal(r2.linhas[0].valor_centavos, 21045);
  assert.equal(r2.ignoradas.length, 1);
  // linha que não lê dá erro com o número dela no arquivo
  assert.throws(() => lerComModelo(INTER.replace('02/10/2026', 'ontem'), CONFIG_INTER), /Linha 3 ilegível/);
});

test('separarParcela: os jeitos de escrever a parcela no texto (e os que não são parcela)', () => {
  assert.deepEqual(separarParcela('Amazon - Parcela 9/12'), { nome: 'Amazon', parcela: { atual: 9, total: 12 } });
  assert.deepEqual(separarParcela('LOJA MOVEIS (Parcela 3 de 10)'), { nome: 'LOJA MOVEIS', parcela: { atual: 3, total: 10 } });
  assert.deepEqual(separarParcela('LOJA X PARC 03/10'), { nome: 'LOJA X', parcela: { atual: 3, total: 10 } });
  assert.equal(separarParcela('Seguro Parc6').parcela, null);
  assert.equal(separarParcela('Parcela de Natal').parcela, null);
  assert.equal(separarParcela('Loja 24/7').parcela, null);
});

test('datas nos formatos do modelo (e as que não existem)', () => {
  assert.equal(lerDataNoFormato('2026-10-05', 'aaaa-mm-dd'), '2026-10-05');
  assert.equal(lerDataNoFormato('05/10/26', 'dd/mm/aa'), '2026-10-05');
  assert.equal(lerDataNoFormato('10/05/2026', 'mm/dd/aaaa'), '2026-10-05');
  assert.equal(lerDataNoFormato('05-10-2026', 'dd-mm-aaaa'), '2026-10-05');
  assert.equal(lerDataNoFormato('31/02/2026', 'dd/mm/aaaa'), null);
  assert.equal(lerDataNoFormato('05/10/2026 14:32', 'dd/mm/aaaa'), '2026-10-05'); // com hora
});

test('reconhecerModelo: pelo cabeçalho (sem acento, espaço nem maiúscula), os prontos e os do usuário', () => {
  const inter = { id: 'i', nome: 'Inter · fatura', cabecalho: assinatura('Data Lançamento;Descrição;Categoria;Tipo;Valor'), config: CONFIG_INTER };
  assert.equal(inter.cabecalho, 'datalancamento;descricao;categoria;tipo;valor');
  assert.equal(reconhecerModelo(INTER, [...MODELOS_PRONTOS, inter])?.id, 'i');
  assert.equal(reconhecerModelo('date,title,amount\n2026-08-05,Padaria,"53,90"', [...MODELOS_PRONTOS, inter])?.id, 'nubank');
  assert.equal(reconhecerModelo('a;b;c\n1;2;3', [...MODELOS_PRONTOS, inter]), null);
});

test('vencimentoDoNome: a data no nome do arquivo', () => {
  assert.equal(vencimentoDoNome('Inter_2026-10-15.csv'), '2026-10-15');
  assert.equal(vencimentoDoNome('fatura 15-10-2026.csv'), '2026-10-15');
  assert.equal(vencimentoDoNome('fatura-outubro.csv'), null);
});

test('detectarFormato e sugerirColunas: o que o assistente já propõe', () => {
  const f = detectarFormato(INTER);
  assert.deepEqual([f.separador, f.colunas, f.linhaCabecalho, f.ignorarNoFim], [';', 5, 2, 1]);
  const s = sugerirColunas(INTER, f);
  assert.deepEqual(s.colunas, { data: 0, estabelecimento: 1, valor: 4, parcela: null, portador: null });
  assert.deepEqual([s.data, s.gasto, s.parcela], ['dd/mm/aaaa', 'positivo', 'texto']);
  // o que ele sugere lê o arquivo igual ao modelo feito à mão
  assert.deepEqual(lerComModelo(INTER, s), lerComModelo(INTER, CONFIG_INTER));
  // e para o CSV do Nubank, chega no modelo pronto
  const nu = 'date,title,amount\n2026-08-05,Padaria Exemplo,"53,90"\n2026-07-06,Loja Teste - Parcela 9/12,"208,25"';
  const sn = sugerirColunas(nu, detectarFormato(nu));
  assert.deepEqual([sn.separador, sn.colunas.data, sn.colunas.estabelecimento, sn.colunas.valor, sn.data, sn.parcela], [',', 0, 1, 2, 'aaaa-mm-dd', 'texto']);
});

test('decodificar: UTF-8 quando lê limpo, senão Windows-1252 (o CSV do Excel)', () => {
  const utf8 = new TextEncoder().encode('Descrição;Valor');
  assert.equal(decodificar(utf8), 'Descrição;Valor');
  const w1252 = Uint8Array.from([0x44, 0x65, 0x73, 0x63, 0x72, 0x69, 0xe7, 0xe3, 0x6f]); // "Descrição" no Windows-1252
  assert.equal(decodificar(w1252), 'Descrição');
});
