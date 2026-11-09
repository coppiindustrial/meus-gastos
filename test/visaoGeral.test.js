import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  anoAnterior, compsDoHistorico, custoFixo, filtrar, foraDoNormal, gruposPorMes, jaComprometido, mediaMovelDosFixos, mediaPorMes, parcelasComprometidas, periodo, resumoPeriodo, variacao,
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

test('jaComprometido: o fixo não lançado conta a MÉDIA MÓVEL dos últimos 6 lançamentos; o novo, o padrão', () => {
  const rec = (id, padrao) => ({ id, descricao: id, dia_do_mes: 1, ativa: true, inicio: '2026-01', fim: null, valor_padrao_centavos: padrao });
  const recorrencias = [rec('luz', 20000), rec('novo', 50000)];
  // a luz de jan a out: 100, 100, 100, 100, 200, 200, 200, 300, 300, 600 → os 6 últimos (mai a out) dão 300
  const valores = [10000, 10000, 10000, 10000, 20000, 20000, 20000, 30000, 30000, 60000];
  const lancamentos = valores.map((v, i) => ({ recorrencia_id: 'luz', competencia: `2026-${String(i + 1).padStart(2, '0')}`, valor_centavos: v }));
  assert.equal(mediaMovelDosFixos(lancamentos, '2026-11').get('luz'), 30000);
  assert.equal(mediaMovelDosFixos(lancamentos, '2026-11', 3).get('luz'), 40000);
  assert.equal(mediaMovelDosFixos(lancamentos, '2026-07').get('luz'), 15000); // só o que veio até hoje (jan a jul: os 6 últimos)
  const r = jaComprometido({ recorrencias, lancamentos, hoje: '2026-11', minMeses: 2 });
  assert.deepEqual(r.map((m) => m.fixos), [30000 + 50000, 30000 + 50000]); // a luz pela média, o novo pelo padrão
  // lançado o mês, ele conta pelo lançado e entra na média dos seguintes
  const comNov = [...lancamentos, { recorrencia_id: 'luz', competencia: '2026-11', valor_centavos: 24000 }];
  const r2 = jaComprometido({ recorrencias, lancamentos: comNov, hoje: '2026-11', minMeses: 2 });
  // dez: a média de jun a nov — (200 + 200 + 300 + 300 + 600 + 240) / 6 = 306,67
  assert.deepEqual(r2.map((m) => m.fixos), [24000 + 50000, 30667 + 50000]);
});

test('já comprometido em parcelas: só as que vêm, por mês e por cartão, e o peso na renda média', () => {
  const cartoes = [{ id: 'c1', nome: 'Cartão A' }, { id: 'c2', nome: 'Cartão B' }];
  const parcelas = [
    { lancamento_id: 'l1', competencia: '2026-11', valor_centavos: 9999, cartao_id: 'c1' }, // já na fatura do mês: fora
    { lancamento_id: 'l1', competencia: '2026-12', valor_centavos: 10000, cartao_id: 'c1' },
    { lancamento_id: 'l1', competencia: '2027-01', valor_centavos: 10000, cartao_id: 'c1' },
    { lancamento_id: 'l2', competencia: '2026-12', valor_centavos: 30000, cartao_id: 'c2' },
    { lancamento_id: 'l3', competencia: '2027-03', valor_centavos: 5000, cartao_id: 'c2' },
  ];
  const resumo = [
    { competencia: '2025-11', tipo: 'entrada', total_centavos: 999999 }, // 13 meses antes: fora
    { competencia: '2025-12', tipo: 'entrada', total_centavos: 100000 },
    { competencia: '2026-06', tipo: 'entrada', total_centavos: 60000 },
    { competencia: '2026-06', tipo: 'entrada', total_centavos: 40000 },
    { competencia: '2026-06', tipo: 'saida', total_centavos: 70000 },
    { competencia: '2026-12', tipo: 'entrada', total_centavos: 999999 }, // o mês de hoje em diante: fora
  ];
  const r = parcelasComprometidas({ parcelas, cartoes, resumo, hoje: '2026-12' });
  assert.equal(r.total, 55000);
  assert.equal(r.parcelas, 4);
  assert.equal(r.compras, 3);
  assert.equal(r.ate, '2027-03');
  assert.deepEqual(r.meses.map((m) => [m.competencia, m.valor]), [['2026-12', 40000], ['2027-01', 10000], ['2027-03', 5000]]);
  assert.deepEqual(r.meses[0].porCartao, [{ nome: 'Cartão B', valor: 30000 }, { nome: 'Cartão A', valor: 10000 }]);
  assert.deepEqual(r.porCartao, [{ nome: 'Cartão B', valor: 35000 }, { nome: 'Cartão A', valor: 20000 }]);
  // a renda média: dois meses com entrada (dez/25 e jun/26), 100.000 cada
  assert.equal(r.renda, 100000);
  assert.equal(r.pctRenda, 0.55);
  // sem parcelas nem entradas
  const v = parcelasComprometidas({ hoje: '2026-12' });
  assert.deepEqual([v.total, v.ate, v.renda, v.pctRenda], [0, null, 0, null]);
});

test('custoFixo: o próximo mês pela média móvel, o de hoje à parte, o histórico dos fixos e o peso na renda', () => {
  const rec = (id, padrao, extra = {}) => ({ id, descricao: id, dia_do_mes: 1, ativa: true, inicio: '2026-01', fim: null, valor_padrao_centavos: padrao, ...extra });
  const recorrencias = [rec('luz', 20000), rec('aluguel', 300000), rec('antigo', 9999, { fim: '2026-06' })];
  const lancamentos = [
    { recorrencia_id: 'luz', competencia: '2026-09', valor_centavos: 20000 },
    { recorrencia_id: 'luz', competencia: '2026-10', valor_centavos: 30000 },
    { recorrencia_id: 'aluguel', competencia: '2026-10', valor_centavos: 300000 },
    { recorrencia_id: 'aluguel', competencia: '2026-11', valor_centavos: 310000 }, // novembro: só o aluguel lançado
  ];
  const resumo = [
    { competencia: '2026-09', tipo: 'saida', origem: 'fixo', total_centavos: 20000 },
    { competencia: '2026-10', tipo: 'saida', origem: 'fixo', total_centavos: 330000 },
    { competencia: '2026-10', tipo: 'saida', origem: 'cartao', total_centavos: 999999 }, // não é fixo
    { competencia: '2026-11', tipo: 'saida', origem: 'fixo', total_centavos: 310000 }, // o mês de hoje: fora do histórico
    { competencia: '2026-10', tipo: 'entrada', origem: 'entrada', total_centavos: 1000000 },
  ];
  const r = custoFixo({ recorrencias, lancamentos, resumo, hoje: '2026-11' });
  // dezembro: a luz pela média (25.000) e o aluguel pela média (305.000); o que terminou em junho não conta
  assert.equal(r.competencia, '2026-12');
  assert.equal(r.valor, 330000);
  assert.equal(r.qtd, 2);
  // novembro: o aluguel lançado (310.000) e a luz a lançar pela média (25.000)
  assert.deepEqual(r.hoje, { valor: 335000, qtd: 2 });
  assert.deepEqual(r.historico, [{ competencia: '2026-09', valor: 20000 }, { competencia: '2026-10', valor: 330000 }]);
  assert.equal(r.renda, 1000000);
  assert.equal(r.pctRenda, 0.33);
  assert.equal(custoFixo({ hoje: '2026-11' }).pctRenda, null);
});
