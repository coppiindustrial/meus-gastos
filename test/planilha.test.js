import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  descricaoDaEntrada, faixaDe, interpretar, ladrilhar, lerBloco, lerData, limparFaixa, ordenarLinhas, planejarColagem, preencherAbaixo, proximaOrdem, resumoSelecao, textoDaFaixa,
} from '../src/lib/planilha.js';

// Dados FICTÍCIOS. Colunas: 0 Data · 1 Descrição · 2 Categoria · 3 Origem · 4 Valor · 5 Observação.
const grupoG = { tipo: 'saida' };
const grupoE = { tipo: 'entrada' };
const categorias = [
  { id: 'merc', nome: 'Mercado', grupo: grupoG },
  { id: 'farm', nome: 'Farmácia / Saúde', grupo: grupoG },
  { id: 'sal', nome: 'Salário', grupo: grupoE },
];
const L = (id, data, descricao, categoria_id, valor_centavos, tipo = 'saida') => ({
  id, data, descricao, categoria_id, valor_centavos, tipo, origem: tipo === 'entrada' ? 'entrada' : 'manual', obs: '',
  categoria: categorias.find((c) => c.id === categoria_id) ?? null,
});
const linhas = [
  L('a', '2026-10-26', 'Feira', 'merc', 4600),
  L('b', '2026-10-25', 'Remédio', null, 3590),
  L('c', '2026-10-20', 'Pagamento', 'sal', 850000, 'entrada'),
];

test('descricaoDaEntrada: a categoria dá a descrição da entrada vazia; o que foi escrito fica', () => {
  const [merc, , sal] = categorias;
  const bonus = { id: 'bon', nome: 'Bônus', grupo: grupoE };
  assert.equal(descricaoDaEntrada({ tipo: 'entrada', descricao: '', catDepois: sal }), 'Salário');
  assert.equal(descricaoDaEntrada({ tipo: 'entrada', descricao: '  ', catDepois: sal }), 'Salário');
  // trocar a categoria troca a descrição que ela mesma tinha posto
  assert.equal(descricaoDaEntrada({ tipo: 'entrada', descricao: 'Salário', catAntes: sal, catDepois: bonus }), 'Bônus');
  // o que a pessoa escreveu não muda; gasto não muda; sem categoria não muda
  assert.equal(descricaoDaEntrada({ tipo: 'entrada', descricao: 'Pagamento empresa X', catAntes: sal, catDepois: bonus }), null);
  assert.equal(descricaoDaEntrada({ tipo: 'saida', descricao: '', catDepois: merc }), null);
  assert.equal(descricaoDaEntrada({ tipo: 'entrada', descricao: '', catDepois: null }), null);
});

test('lerData: com e sem ano, e o que não é data', () => {
  assert.equal(lerData('27/10', 2026), '2026-10-27');
  assert.equal(lerData('5/1/27', 2026), '2027-01-05');
  assert.equal(lerData('27/10/2025', 2026), '2025-10-27');
  assert.equal(lerData('2026-02-28', 2000), '2026-02-28');
  assert.equal(lerData('30/02', 2026), null);
  assert.equal(lerData('abc', 2026), null);
});

test('interpretar: valor com "+", categoria pelo nome e pelo tipo', () => {
  assert.deepEqual(interpretar(4, 'R$ 1.234,56'), { campo: 'valor_centavos', valor: 123456, entrada: false });
  assert.deepEqual(interpretar(4, '-35,90'), { campo: 'valor_centavos', valor: 3590, entrada: false });
  assert.equal(interpretar(4, '+100').entrada, true);
  assert.ok(interpretar(4, '0').motivo);
  assert.deepEqual(interpretar(2, 'farmacia / saude', { categorias }), { campo: 'categoria_id', valor: 'farm' });
  assert.deepEqual(interpretar(2, '', { categorias }), { campo: 'categoria_id', valor: null });
  // Salário é de entrada: numa linha de gasto não serve.
  assert.match(interpretar(2, 'Salário', { categorias, tipo: 'saida' }).motivo, /categoria de gasto/);
  assert.ok(interpretar(3, 'Cartão').motivo); // Origem não se edita
});

test('lerBloco: tabulação, quebra e a última quebra do Excel', () => {
  assert.deepEqual(lerBloco('a\tb\r\nc\td\r\n'), [['a', 'b'], ['c', 'd']]);
  assert.deepEqual(lerBloco('só um'), [['só um']]);
});

test('textoDaFaixa: o bloco como o Excel lê', () => {
  assert.equal(textoDaFaixa(linhas, faixaDe({ r: 0, c: 1 }, { r: 2, c: 4 })),
    'Feira\tMercado\tAvulso\t46,00\nRemédio\t\tAvulso\t35,90\nPagamento\tSalário\tEntrada\t+8500,00');
});

test('planejarColagem: cai a partir do canto, cria linhas novas e explica o que fica de fora', () => {
  const matriz = lerBloco('Mercado\tCartão\t12,00\nNada\t\t\n');
  const p = planejarColagem({ matriz, linhas, inicio: { r: 1, c: 2 }, categorias, anoBase: 2026 });
  assert.deepEqual(p.mudancas, [
    { r: 1, campo: 'categoria_id', valor: 'merc' },
    { r: 1, campo: 'valor_centavos', valor: 1200 },
  ]);
  // "Cartão" na Origem (não se edita) e "Nada" (não é categoria de entrada) ficam de fora.
  assert.equal(p.fora.length, 2);
  assert.deepEqual(p.alcance, { r0: 1, r1: 2, c0: 2, c1: 4 });

  // Abaixo da última linha: linhas novas, e o "+" no valor faz dela uma entrada.
  const novas = planejarColagem({ matriz: lerBloco('27/10\tBônus\tSalário\t\t+500'), linhas, inicio: { r: 3, c: 0 }, categorias, anoBase: 2026 });
  assert.ok(novas.entradas.has(3));
  assert.deepEqual(novas.mudancas.map((m) => m.campo), ['data', 'descricao', 'categoria_id', 'valor_centavos']);
  assert.equal(novas.fora.length, 0);
});

test('preencherAbaixo: repete a primeira linha, sem passar categoria entre tipos', () => {
  const { mudancas, fora } = preencherAbaixo(linhas, faixaDe({ r: 0, c: 2 }, { r: 2, c: 2 }));
  assert.deepEqual(mudancas, [{ r: 1, campo: 'categoria_id', valor: 'merc' }]);
  assert.equal(fora.length, 1);
});

test('limparFaixa: data e valor não esvaziam', () => {
  const { mudancas, presos } = limparFaixa(linhas, faixaDe({ r: 0, c: 0 }, { r: 0, c: 5 }));
  assert.deepEqual(mudancas, [{ r: 0, campo: 'descricao', valor: '' }, { r: 0, campo: 'categoria_id', valor: null }]);
  assert.equal(presos, 2);
});

test('resumoSelecao: gasto e entrada em totais separados', () => {
  const s = resumoSelecao(linhas, faixaDe({ r: 0, c: 3 }, { r: 2, c: 4 }));
  assert.deepEqual(s, { celulas: 6, gastos: 8190, entradas: 850000, nGastos: 2, nEntradas: 1 });
});

test('ladrilhar: um valor enche a seleção; um bloco se repete só em múltiplos', () => {
  assert.deepEqual(ladrilhar([['5']], 3, 2), [['5', '5'], ['5', '5'], ['5', '5']]);
  assert.deepEqual(ladrilhar([['a'], ['b']], 4, 1), [['a'], ['b'], ['a'], ['b']]);
  assert.deepEqual(ladrilhar([['a'], ['b']], 3, 1), [['a'], ['b']]);  // 3 não é múltiplo de 2: cola uma vez
  assert.deepEqual(ladrilhar([['a', 'b']], 1, 1), [['a', 'b']]);      // seleção menor: cola o bloco inteiro
});

test('ordenarLinhas e proximaOrdem: ordem pelo cabeçalho, empate no padrão, rascunhos no fim', () => {
  // Dados FICTÍCIOS.
  const L = (id, data, descricao, valor_centavos, extra = {}) => ({ id, data, descricao, valor_centavos, criado_em: `${data}T10:00:00Z`, origem: 'manual', ...extra });
  const ls = [
    L('a', '2026-09-03', 'Padaria', 1250, { categoria: { nome: 'Mercado' } }),
    L('b', '2026-09-10', 'Álcool gel', 900),
    L('c', '2026-09-05', 'mercado', 1250, { categoria: { nome: 'Casa' } }),
    { id: 'r', rascunho: true, data: '', descricao: '' },
  ];
  assert.deepEqual(ordenarLinhas(ls, null).map((l) => l.id), ['b', 'c', 'a', 'r']);
  assert.deepEqual(ordenarLinhas(ls, { col: 'descricao', dir: 'asc' }).map((l) => l.id), ['b', 'c', 'a', 'r']);
  assert.deepEqual(ordenarLinhas(ls, { col: 'valor', dir: 'desc' }).map((l) => l.id), ['c', 'a', 'b', 'r']); // empate: data mais nova
  assert.deepEqual(ordenarLinhas(ls, { col: 'categoria', dir: 'asc' }).map((l) => l.id), ['c', 'a', 'b', 'r']); // sem categoria no fim
  assert.deepEqual(proximaOrdem(null, 'valor'), { col: 'valor', dir: 'desc' });
  assert.deepEqual(proximaOrdem({ col: 'valor', dir: 'desc' }, 'valor'), { col: 'valor', dir: 'asc' });
  assert.equal(proximaOrdem({ col: 'valor', dir: 'asc' }, 'valor'), null);
  assert.deepEqual(proximaOrdem({ col: 'valor', dir: 'asc' }, 'data'), { col: 'data', dir: 'asc' });
});

test('interpretar: conta no valor, com e sem o "+" da entrada', () => {
  assert.deepEqual(interpretar(4, '=100+50'), { campo: 'valor_centavos', valor: 15000, entrada: false });
  assert.deepEqual(interpretar(4, '+=1000+500'), { campo: 'valor_centavos', valor: 150000, entrada: true });
  assert.deepEqual(interpretar(4, '+100+50'), { campo: 'valor_centavos', valor: 15000, entrada: true });
  assert.match(interpretar(4, '=100-250').motivo, /negativo/);
  assert.match(interpretar(4, '=abc').motivo, /nem uma conta/);
});
