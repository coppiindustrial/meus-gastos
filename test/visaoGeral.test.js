import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  anoAnterior, compsDoHistorico, filtrar, foraDoNormal, gruposPorMes, jaComprometido, mediaPorMes, periodo, resumoPeriodo, variacao,
} from '../src/lib/visaoGeral.js';

// Linhas no formato da view resumo_mensal (valores fictícios).
const L = (competencia, tipo, origem, categoria_id, total_centavos, qtd = 1) => ({ competencia, tipo, origem, categoria_id, total_centavos, qtd });
const linhas = [
  L('2026-07', 'entrada', 'entrada', 'sal', 1000000),
  L('2026-07', 'saida', 'cartao', 'merc', 30000, 4),
  L('2026-07', 'saida', 'fixo', 'luz', 20000),
  L('2026-08', 'saida', 'cartao', 'merc', '40000', 5), // bigint pode vir como texto
  L('2026-08', 'saida', 'manual', null, 5000),
  L('2025-07', 'saida', 'cartao', 'merc', 25000, 3),
];
const casa = { id: 'g1', nome: 'Casa', cor: '#0d9488' };
const alim = { id: 'g2', nome: 'Alimentação', cor: '#ea580c' };
const categorias = [
  { id: 'merc', nome: 'Mercado', grupo: alim },
  { id: 'luz', nome: 'Luz', grupo: casa },
  { id: 'sal', nome: 'Salário', grupo: { id: 'g3', nome: 'Renda', cor: '#15803d' } },
];

test('periodo: anos × meses, e sem meses é o ano todo', () => {
  assert.deepEqual(periodo([2026], [8, 7]), ['2026-07', '2026-08']);
  assert.equal(periodo([2026, 2025]).length, 24);
  assert.equal(periodo([2026, 2025])[0], '2025-01');
  assert.deepEqual(anoAnterior(['2026-07', '2026-08']), ['2025-07', '2025-08']);
});

test('filtrar: tipo, origem e categoria (com "sem")', () => {
  assert.equal(filtrar(linhas, { tipo: 'entrada' }).length, 1);
  assert.equal(filtrar(linhas, { origens: ['fixo', 'manual'] }).length, 2);
  assert.equal(filtrar(linhas, { cats: ['sem'] }).length, 1);
});

test('resumoPeriodo: totais, por origem, média pelos meses com dado e mês mais caro', () => {
  const r = resumoPeriodo(linhas, periodo([2026], [7, 8, 9]));
  assert.equal(r.entradas, 1000000);
  assert.equal(r.gastos, 95000);
  assert.equal(r.saldo, 905000);
  assert.equal(r.qtd, 12);
  assert.deepEqual(r.porOrigem, { cartao: 70000, fixo: 20000, manual: 5000 });
  assert.equal(r.meses, 2); // setembro não tem dado
  assert.equal(r.maisCaro.competencia, '2026-07');
  assert.equal(r.porMes[2].temDado, false);
  assert.equal(r.porMes[0].saldo, 950000);
  // cada mês também abre o gasto por origem (as colunas da ampliação)
  assert.deepEqual([r.porMes[1].cartao, r.porMes[1].fixo, r.porMes[1].manual], [40000, 0, 5000]);
  // sem o `cartao_id` (antes da migration 010), a fatia por cartão fica vazia
  assert.deepEqual(r.porCartao, {});
});

test('resumoPeriodo: a fatia de cada cartão dentro do "Cartão (faturas)" (migration 010)', () => {
  const comCartao = [
    { ...L('2026-07', 'saida', 'cartao', 'merc', 30000), cartao_id: 'xp' },
    { ...L('2026-07', 'saida', 'cartao', 'merc', 12000), cartao_id: 'nu' },
    { ...L('2026-08', 'saida', 'cartao', 'merc', 8000), cartao_id: 'xp' },
    { ...L('2026-08', 'saida', 'fixo', 'luz', 20000), cartao_id: null },
  ];
  const r = resumoPeriodo(comCartao, periodo([2026], [7, 8]));
  assert.deepEqual(r.porCartao, { xp: 38000, nu: 12000 });
  assert.equal(r.porOrigem.cartao, 50000);
});

test('compsDoHistorico: do primeiro ao último mês com dado, sem buracos', () => {
  const cs = compsDoHistorico(linhas);
  assert.equal(cs[0], '2025-07');
  assert.equal(cs[cs.length - 1], '2026-08');
  assert.equal(cs.length, 14);
  assert.deepEqual(compsDoHistorico([]), []);
});

test('gruposPorMes: grupo, categorias, meses e "Sem categoria"', () => {
  const g = gruposPorMes(linhas, periodo([2026], [7, 8]), categorias);
  assert.deepEqual(g.map((x) => x.nome), ['Alimentação', 'Casa', 'Sem categoria']);
  assert.deepEqual(g[0].meses, { '2026-07': 30000, '2026-08': 40000 });
  assert.equal(g[0].media, 35000);
  assert.equal(g[0].categorias[0].nome, 'Mercado');
  assert.equal(g[0].qtd, 9);
});

test('variacao: em %, e null sem base', () => {
  assert.equal(variacao(110, 100), 10);
  assert.equal(variacao(5, 0), null);
});

test('mediaPorMes: só os meses com o valor, e sem o mês em andamento quando há outros', () => {
  const porMes = [
    { competencia: '2026-08', entradas: 1000 },
    { competencia: '2026-09', entradas: 0 },     // sem entrada cadastrada: não entra
    { competencia: '2026-10', entradas: 200 },   // o mês em andamento: fora
  ];
  assert.deepEqual(mediaPorMes(porMes, 'entradas', { emAndamento: '2026-10' }), { media: 1000, meses: 1 });
  assert.deepEqual(mediaPorMes(porMes, 'entradas'), { media: 600, meses: 2 });
  // Sozinho no período, o mês em andamento entra (é o único que há).
  assert.deepEqual(mediaPorMes([porMes[2]], 'entradas', { emAndamento: '2026-10' }), { media: 200, meses: 1 });
  assert.deepEqual(mediaPorMes([porMes[1]], 'entradas'), { media: 0, meses: 0 });
});

test('gruposPorMes: o fixo que começou depois divide só a partir do 1º mês; o eventual, pelo período', () => {
  const ls = [
    L('2026-01', 'saida', 'cartao', 'merc', 10000),
    L('2026-02', 'saida', 'cartao', 'merc', 10000),
    L('2026-03', 'saida', 'cartao', 'merc', 10000),
    L('2026-04', 'saida', 'cartao', 'merc', 10000),
    L('2026-03', 'saida', 'fixo', 'luz', 20000), // o fixo começa em março
    L('2026-04', 'saida', 'fixo', 'luz', 20000),
    L('2026-02', 'saida', 'manual', 'festa', 40000), // eventual: um mês só
  ];
  const cats = [...categorias, { id: 'festa', nome: 'Festa', grupo: casa }];
  const g = gruposPorMes(ls, periodo([2026], [1, 2, 3, 4]), cats);
  const casaG = g.find((x) => x.nome === 'Casa');
  const luz = casaG.categorias.find((k) => k.id === 'luz');
  const festa = casaG.categorias.find((k) => k.id === 'festa');
  assert.deepEqual([luz.media, luz.mesesMedia, luz.desde], [20000, 2, '2026-03']); // 40000 / 2, não / 4
  assert.deepEqual([festa.media, festa.mesesMedia, festa.desde], [10000, 4, null]); // 40000 / 4
  assert.equal(casaG.media, 30000); // a soma das médias das categorias
  assert.equal(g.find((x) => x.nome === 'Alimentação').media, 10000);
});

test('gruposPorMes: a média do grupo não conta o mês em andamento', () => {
  const g = gruposPorMes(linhas, periodo([2026], [7, 8]), categorias, '2026-08');
  assert.equal(g[0].media, 30000); // Mercado: só julho (agosto em andamento)
  assert.equal(g[0].total, 70000);  // o total continua com os dois meses
});

test('foraDoNormal: o último mês fechado contra a média dos 12 antes; só o que mudou de verdade', () => {
  const cats = [
    { id: 'ele', nome: 'Eletrônicos', grupo: { id: 'g1', nome: 'Compras', cor: '#f00' } },
    { id: 'mer', nome: 'Mercado', grupo: { id: 'g2', nome: 'Alimentação', cor: '#0f0' } },
    { id: 'iptu', nome: 'IPTU', grupo: { id: 'g3', nome: 'Casa', cor: '#00f' } },
    { id: 'vin', nome: 'Vinícola', grupo: { id: 'g2', nome: 'Alimentação', cor: '#0f0' } },
  ];
  const ls = [];
  ['2026-07', '2026-08', '2026-09'].forEach((c) => { ls.push(L(c, 'saida', 'cartao', 'ele', 100000), L(c, 'saida', 'cartao', 'mer', 200000)); });
  ls.push(L('2026-08', 'saida', 'manual', 'iptu', 300000)); // um mês só: o normal é 300000 / 3
  ls.push(L('2026-10', 'saida', 'cartao', 'ele', 650000), L('2026-10', 'saida', 'cartao', 'mer', 205000), L('2026-10', 'saida', 'cartao', 'vin', 130000));
  ls.push(L('2026-11', 'saida', 'fixo', 'mer', 999999)); // o mês em andamento fica de fora
  const r = foraDoNormal(ls, periodo([2026]), cats, '2026-11');
  assert.equal(r.mes, '2026-10');
  assert.deepEqual(r.base, ['2026-07', '2026-08', '2026-09']);
  assert.deepEqual(r.acima.map((x) => [x.nome, x.dif, x.nova]), [['Eletrônicos', 550000, false], ['Vinícola', 130000, true]]);
  assert.deepEqual(r.abaixo.map((x) => [x.nome, x.valor, x.normal, x.sumiu]), [['IPTU', 0, 100000, true]]);
  // o Mercado mudou 5000 (menos de R$ 100): fica de fora; sem meses antes, nada a comparar
  assert.deepEqual(foraDoNormal(ls, ['2026-07'], cats, '2026-11'), { mes: '2026-07', base: [], acima: [], abaixo: [] });
  assert.equal(foraDoNormal([], periodo([2026]), cats, '2026-11'), null);
});

test('jaComprometido: as parcelas que vêm e os fixos de cada mês, do atual até a última parcela', () => {
  const parcelas = [
    { competencia: '2026-11', valor_centavos: 760000, lancamento_id: 'a' }, { competencia: '2026-11', valor_centavos: 1000, lancamento_id: 'b' },
    { competencia: '2027-01', valor_centavos: 540000, lancamento_id: 'a' }, { competencia: '2026-09', valor_centavos: 5, lancamento_id: 'c' },
  ];
  const recorrencias = [{ id: 'luz', descricao: 'Luz', dia_do_mes: 5, ativa: true, inicio: '2026-01', fim: null, valor_padrao_centavos: 20000 }];
  const lancamentos = [{ recorrencia_id: 'luz', competencia: '2026-10', valor_centavos: 22000 }];
  const r = jaComprometido({ parcelas, recorrencias, lancamentos, pulados: [{ recorrencia_id: 'luz', competencia: '2026-12' }], hoje: '2026-11', minMeses: 3 });
  assert.deepEqual(r.map((m) => [m.competencia, m.parcelas, m.compras, m.fixos, m.total]), [
    ['2026-11', 761000, 2, 22000, 783000], // o fixo pelo último lançado
    ['2026-12', 0, 0, 0, 0], // "não teve"
    ['2027-01', 540000, 1, 22000, 562000],
  ]);
  assert.equal(jaComprometido({ hoje: '2026-11' }).length, 6); // sem nada: o mínimo de meses
});
