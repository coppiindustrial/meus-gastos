import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assinatura, decodificar, detectarFormato, lerComModelo, problemaDoModelo, sugerirColunas } from '../src/lib/modeloCsv.js';
import { lerFaturaComModelos } from '../src/lib/lerFatura.js';
import { criarClassificador } from '../src/lib/classificar.js';
import { competenciaDe } from '../src/lib/format.js';

// O CAMINHO INTEIRO DE UM BANCO NOVO (03/11/2026), sem o banco de dados: o arquivo de exemplo passa pelo assistente
// (o que ele detecta e sugere), o modelo "salvo" volta como a tabela o devolve (o `config` é jsonb), e a fatura do mês
// seguinte entra pelo importador — o modelo, o cartão, o vencimento, as linhas e a categoria das regras.
// Dados FICTÍCIOS: um banco "C6" inventado, salvo pelo Excel em Windows-1252, vírgula como separador, título antes do
// cabeçalho, o GASTO negativo, a parcela numa coluna e o total no fim.
const EXEMPLO = [
  'Fatura C6 Bank - outubro 2026',
  'Data,Descrição,Portador,Parcela,Valor',
  '"05/10/26","PADARIA SÃO JOSÉ","FULANO","Única","-23,50"',
  '"06/10/26","MAGAZINE EXEMPLO","FULANO","2/5","-150,00"',
  '"08/10/26","Pagamento recebido","FULANO","","1.200,00"',
  '"09/10/26","FARMÁCIA AÇAÍ","CICRANO","","-47,80"',
  'Total: -221,30',
].join('\r\n');
const SEGUINTE = [
  'Fatura C6 Bank - novembro 2026',
  'Data,Descrição,Portador,Parcela,Valor',
  '"03/11/26","MERCADO BOM PREÇO","FULANO","","-312,45"',
  '"06/11/26","MAGAZINE EXEMPLO","FULANO","3/5","-150,00"',
  '"07/11/26","Estorno","FULANO","","19,90"',
  'Total: -442,55',
].join('\r\n');
const bytes1252 = (texto) => new Uint8Array(Buffer.from(texto, 'latin1'));

test('banco novo: do arquivo de exemplo no assistente à fatura do mês seguinte no importador', () => {
  // passo 1: o texto pelos bytes (o UTF-8 não lê limpo → Windows-1252) e o que o assistente acha
  const texto = decodificar(bytes1252(EXEMPLO));
  assert.match(texto, /FARMÁCIA AÇAÍ/);
  const formato = detectarFormato(texto);
  assert.deepEqual([formato.separador, formato.linhaCabecalho, formato.ignorarNoFim], [',', 2, 1]);
  // passo 2: as colunas sugeridas (pelo nome do cabeçalho e pelo conteúdo), o sinal do gasto e a parcela
  const sugerido = sugerirColunas(texto, formato);
  assert.deepEqual(sugerido.colunas, { data: 0, estabelecimento: 1, portador: 2, parcela: 3, valor: 4 });
  assert.deepEqual([sugerido.data, sugerido.gasto, sugerido.parcela], ['dd/mm/aa', 'negativo', 'coluna']);
  // passo 3: a pessoa escolhe o vencimento pelo nome do arquivo; o modelo em vigor = colunas + o passo 1
  const cfg = { ...sugerido, vencimento: 'nome', separador: formato.separador, linhaCabecalho: formato.linhaCabecalho, ignorarNoFim: formato.ignorarNoFim };
  assert.equal(problemaDoModelo(texto, cfg), null);
  const exemplo = lerComModelo(texto, cfg);
  assert.deepEqual(exemplo.linhas.map((l) => [l.data, l.estabelecimento, l.valor_centavos, l.parcela_atual, l.parcela_total, l.portador]), [
    ['2026-10-05', 'PADARIA SÃO JOSÉ', 2350, null, null, 'FULANO'],
    ['2026-10-06', 'MAGAZINE EXEMPLO', 15000, 2, 5, 'FULANO'],
    ['2026-10-09', 'FARMÁCIA AÇAÍ', 4780, null, null, 'CICRANO'],
  ]);
  assert.deepEqual(exemplo.ignoradas.map((l) => l.estabelecimento), ['Pagamento recebido']);

  // salvar: o que o assistente manda (a assinatura do cabeçalho) e o que a tabela devolve
  const salvo = JSON.parse(JSON.stringify({
    id: 'c6', nome: 'C6 · fatura', tipo: 'fatura', cabecalho: assinatura(texto.split('\r\n')[1]), config: cfg,
    user_id: 'u', criado_em: '2026-11-03T12:00:00Z',
  }));
  assert.equal(salvo.cabecalho, 'data,descricao,portador,parcela,valor');
  const cartoes = [
    { id: 'nu', nome: 'Nubank', formato: 'nubank', dia_vencimento: 13, ativo: true },
    { id: 'c6c', nome: 'C6', formato: 'modelo', modelo_id: 'c6', dia_vencimento: 10, ativo: true },
  ];

  // o mês seguinte, em outro arquivo: reconhecido pelo cabeçalho, o cartão ligado ao modelo, o vencimento do nome
  const r = lerFaturaComModelos(decodificar(bytes1252(SEGUINTE)), 'c6-fatura-10-12-2026.csv', { modelos: [salvo], cartoes });
  assert.deepEqual([r.modelo.id, r.formato, r.cartao?.id, r.vencimento, competenciaDe(r.vencimento)], ['c6', 'modelo', 'c6c', '2026-12-10', '2026-12']);
  assert.deepEqual(r.linhas.map((l) => [l.estabelecimento, l.valor_centavos, l.parcela_atual]), [['MERCADO BOM PREÇO', 31245, null], ['MAGAZINE EXEMPLO', 15000, 3]]);
  assert.deepEqual(r.ignoradas.map((l) => [l.estabelecimento, l.valor_centavos]), [['Estorno', -1990]]);
  // a categoria sai das regras, como nas outras faturas (o acento do Windows-1252 chega inteiro à regra)
  const classificar = criarClassificador([{ palavra_chave: 'bom preço', categoria_id: 'mercado', prioridade: 1 }]);
  assert.deepEqual(r.linhas.map((l) => classificar(l.estabelecimento)?.categoria_id ?? null), ['mercado', null]);
  // sem data no nome: o dia do cartão depois da última compra
  assert.equal(lerFaturaComModelos(SEGUINTE, 'fatura.csv', { modelos: [salvo], cartoes }).vencimento, '2026-11-10');
  // os prontos não mudam com o modelo novo na lista
  const nu = lerFaturaComModelos('date,title,amount\n2026-08-05,Padaria,"53,90"', 'Nubank_2026-08-13.csv', { modelos: [salvo], cartoes });
  assert.deepEqual([nu.modelo.id, nu.cartao?.id], ['nubank', 'nu']);
});

test('modelo que não reconhece pelo cabeçalho: vale o do cartão da célula, ou o escolhido na hora', () => {
  const cfg = {
    separador: ',', linhaCabecalho: 2, ignorarNoFim: 1, colunas: { data: 0, estabelecimento: 1, portador: 2, parcela: 3, valor: 4 },
    data: 'dd/mm/aa', gasto: 'negativo', parcela: 'coluna', vencimento: 'dia',
  };
  const semCabecalho = { id: 'c6', nome: 'C6 · fatura', tipo: 'fatura', cabecalho: null, config: cfg };
  const cartoes = [{ id: 'c6c', nome: 'C6', formato: 'modelo', modelo_id: 'c6', dia_vencimento: 10, ativo: true }];
  // aberto pelo importador geral, ninguém o reconhece
  assert.throws(() => lerFaturaComModelos(SEGUINTE, 'f.csv', { modelos: [semCabecalho], cartoes }), (e) => e.naoReconhecido === true);
  // aberto pela célula do cartão: o modelo do cartão
  const r = lerFaturaComModelos(SEGUINTE, 'f.csv', { modelos: [semCabecalho], cartoes, inicial: { cartaoId: 'c6c', vencimento: '2026-12-10' } });
  assert.deepEqual([r.modelo.id, r.cartao?.id, r.vencimento, r.linhas.length], ['c6', 'c6c', '2026-12-10', 2]);
  // escolhido na hora ("Ler com o modelo…")
  const e = lerFaturaComModelos(SEGUINTE, 'f.csv', { modelos: [semCabecalho], cartoes, modeloId: 'c6' });
  assert.deepEqual([e.modelo.id, e.cartao?.id, e.vencimento], ['c6', 'c6c', '2026-11-10']);
});
