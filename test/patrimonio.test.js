import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { calendario, fator, mesAMes, montarCarteira, posicaoDoAporte } from '../src/lib/carteira.js';
import {
  cascataDoPatrimonio, escadaDeLiquidez, filtrarCarteira, parcelasComprometidas, irPorAliquota, linhaDoTempoVencimentos, mesesComMovimento, noPeriodo, opcoesDePeriodo, porInvestimento, proximasQuedas,
  textoDoPeriodo, vencimentos,
} from '../src/lib/patrimonio.js';

// O CDI de cada dia útil de 01/04 a 05/11/2026 (dado público). Os valores dos aportes são inventados.
const CDI = JSON.parse(readFileSync(new URL('./fixtures/cdi-2026.json', import.meta.url), 'utf8')).map(([d, v]) => [d, Number(v) / 100]);
const HOJE = '2026-11-07';
const cal = calendario(CDI, HOJE);
const cad = (id, extra = {}) => ({ id, nome: id.toUpperCase(), instituicao: 'Banco A', tipo: 'cdb', taxa: 100, resgate: 'diaria', ativo: true, ordem: 0, ...extra });
const ap = (id, inv, data, valor, extra = {}) => ({ id, investimento_id: inv, origem: 'novo', data, valor_centavos: valor, rendeu_antes_centavos: 0, aplicado_em: null, vencimento: null, ...extra });

test('o mês a mês: o "já estava aplicado" com a data do depósito começa no depósito, pelo CDI de trás para frente', () => {
  const cadastro = [cad('a')];
  // no banco hoje: R$ 10.500, dos quais R$ 500 já rendidos; depositado em 04/05
  const antigo = ap('x', 'a', HOJE, 1050000, { origem: 'antigo', rendeu_antes_centavos: 50000, aplicado_em: '2026-05-04' });
  const m = mesAMes({ cadastro, aportes: [antigo], resgates: [], cdi: CDI, hoje: HOJE });
  assert.equal(m[0].competencia, '2026-05');
  assert.equal(m[0].aportes, 1000000); // entra no mês do depósito, com o que foi aplicado
  assert.deepEqual(m.slice(1).map((x) => x.aportes), [0, 0, 0, 0, 0, 0]);
  // o fim de maio é o número do banco descontado o CDI de 01/06 até hoje
  assert.equal(m[0].total, Math.round(1050000 / fator(cal, '2026-06-01', HOJE, 100).f));
  assert.equal(m[m.length - 1].total, 1050000);
  assert.ok(m.every((x) => x.aportado === 1000000));
  // a soma do que rendeu em cada mês é o que o banco diz que já rendeu
  assert.equal(m.reduce((s, x) => s + x.rendeu, 0), 50000);
  assert.ok(m[2].base > 0 && m[2].pct > 0.008 && m[2].pct < 0.013);
  // sem a data do depósito, ele entra no mês em que você olhou, com o total (como antes)
  const semData = mesAMes({ cadastro, aportes: [{ ...antigo, aplicado_em: null }], resgates: [], cdi: CDI, hoje: HOJE });
  assert.deepEqual(semData.map((x) => [x.competencia, x.aportes]), [['2026-11', 1050000]]);
});

test('o filtro e o período da tela', () => {
  const dados = {
    cadastro: [cad('a'), cad('b', { instituicao: 'Banco B', tipo: 'lci' }), cad('c', { instituicao: ' Banco B ' })],
    aportes: [ap('1', 'a', '2026-05-04', 100), ap('2', 'b', '2026-05-04', 200), ap('3', 'c', '2026-05-04', 300)],
    resgates: [{ id: 'r', aporte_id: '2', data: '2026-06-01', valor_centavos: 10, tudo: false }],
  };
  assert.equal(filtrarCarteira(dados, {}).filtrado, false);
  const b = filtrarCarteira(dados, { insts: ['Banco B'] });
  assert.deepEqual([b.cadastro.map((i) => i.id), b.aportes.map((a) => a.id), b.resgates.length], [['b', 'c'], ['2', '3'], 1]);
  assert.deepEqual(filtrarCarteira(dados, { insts: ['Banco B'], tipos: ['cdb'] }).aportes.map((a) => a.id), ['3']);
  assert.deepEqual(filtrarCarteira(dados, { invs: ['a'] }).resgates, []);
  const meses = ['2025-11', '2025-12', '2026-01', '2026-02'].map((competencia) => ({ competencia }));
  assert.deepEqual(opcoesDePeriodo(meses).map((o) => o.value), ['tudo', '12m', '2026', '2025']);
  assert.equal(opcoesDePeriodo(meses)[0].chip, 'Desde nov/25');
  assert.deepEqual(noPeriodo(meses, '2025').map((m) => m.competencia), ['2025-11', '2025-12']);
  assert.equal(noPeriodo(meses, '12m').length, 4);
  assert.equal(textoDoPeriodo(meses), 'nov/25 a fev/26');
});

test('os vencimentos: os próximos pela conta, o histórico com o destino e o "para avaliar"', () => {
  const cadastro = [cad('a', { resgate: 'vencimento' }), cad('r', { no_vencimento: 'reaplica', prazo_meses: 12, tipo: 'rdb' })];
  const aportes = [
    // venceu em 15/10 e voltou para a conta (23 dias antes de hoje: para avaliar, com a coluna da 026)
    ap('v1', 'a', '2026-04-07', 1000000, { vencimento: '2026-10-15', vencimento_visto: false }),
    // venceu em 01/09, reaplicou: o novo nasceu "conferir"; já passou dos 30 dias
    ap('v2', 'r', '2026-04-07', 500000, { vencimento: '2026-09-01', vencimento_visto: false }),
    ap('n2', 'r', '2026-09-01', 540000, { reaplicado_de: 'v2', vencimento: '2027-09-01', conferir: true }),
    // vence em 01/06/2027 e volta para a conta
    ap('p1', 'a', '2026-06-01', 2000000, { vencimento: '2027-06-01' }),
  ];
  const c = montarCarteira({ cadastro, aportes, resgates: [], cdi: CDI, hoje: HOJE });
  const v = vencimentos({ itens: c.itens, cdi: CDI, hoje: HOJE });
  assert.deepEqual(v.historico.map((h) => [h.item.ap.id, h.data, h.avaliar, !!h.seguinte, h.conferir]),
    [['v1', '2026-10-15', true, false, false], ['v2', '2026-09-01', false, true, true]]);
  assert.equal(v.historico[0].liquido, v.historico[0].valor - v.historico[0].ir);
  assert.ok(v.historico[0].ir > 0);
  // sem a coluna da 026, nada fica para avaliar
  const sem = montarCarteira({ cadastro, aportes: aportes.map(({ vencimento_visto: _v, ...a }) => a), resgates: [], cdi: CDI, hoje: HOJE });
  assert.equal(vencimentos({ itens: sem.itens, cdi: CDI, hoje: HOJE }).historico[0].avaliar, false);
  // os próximos: o valor no dia passa do de hoje (o CDI de hoje até lá); o reaplicado tem o vencimento novo
  assert.deepEqual(v.proximos.map((p) => [p.item.ap.id, p.data, p.reaplica]), [['p1', '2027-06-01', false], ['n2', '2027-09-01', true]]);
  const hojeP1 = c.itens.find((x) => x.ap.id === 'p1').pos.vale;
  assert.ok(v.proximos[0].valor > hojeP1);
  assert.equal(v.proximos[0].liquido, v.proximos[0].valor - v.proximos[0].ir);
  assert.equal(v.proximos[1].novoVenc, '2028-09-01');
  assert.equal(v.proximos[0].dias, 206);
  // a linha do tempo: 3 meses atrás até o último vencimento, e pelo menos 12 meses à frente (até out/27)
  const linha = linhaDoTempoVencimentos(v, HOJE);
  assert.equal(linha[0].competencia, '2026-08');
  assert.equal(linha[linha.length - 1].competencia, '2027-10');
  assert.equal(linha.find((m) => m.competencia === '2026-10').venceu, v.historico[0].valor);
  assert.equal(linha.find((m) => m.competencia === '2027-06').volta, v.proximos[0].valor);
  assert.equal(linha.find((m) => m.competencia === '2027-09').reaplica, v.proximos[1].valor);
  assert.equal(linha.filter((m) => m.hoje).map((m) => m.competencia)[0], '2026-11');
  assert.equal(linhaDoTempoVencimentos(v, HOJE, { maximo: 6 }).length, 6);
});

test('quando o dinheiro fica livre, o IR por alíquota, as quedas e cada investimento', () => {
  const cadastro = [cad('d'), cad('t', { resgate: 'vencimento' }), cad('l', { tipo: 'lci' })];
  const aportes = [
    ap('d1', 'd', '2026-04-07', 1000000), // resgate a qualquer hora: livre hoje
    ap('t1', 't', '2026-05-04', 2000000, { vencimento: '2026-12-01' }), // só no vencimento, em 24 dias
    ap('t2', 't', '2026-06-01', 3000000, { vencimento: '2027-12-01' }), // depois de um ano
    ap('l1', 'l', '2026-10-08', 500000), // isenta, há 30 dias (sem IOF)
  ];
  const c = montarCarteira({ cadastro, aportes, resgates: [], cdi: CDI, hoje: HOJE });
  const abertos = c.itens.filter((x) => !x.pos.encerrado);
  const v = vencimentos({ itens: c.itens, cdi: CDI, hoje: HOJE });
  const esc = escadaDeLiquidez(abertos, v.proximos);
  const livre = abertos.filter((x) => x.inv.resgate === 'diaria').reduce((s, x) => s + x.pos.vale, 0);
  assert.equal(esc[0].valor, livre);
  assert.equal(esc[1].valor, livre + v.proximos[0].liquido); // em 30 dias, o de 01/12
  assert.equal(esc[4].valor, esc[1].valor); // em 1 ano, nada mais
  assert.equal(esc[esc.length - 1].rotulo, 'Quando tudo vencer');
  assert.equal(esc[esc.length - 1].valor, livre + v.proximos[0].liquido + v.proximos[1].liquido);
  // o IR: a isenta na alíquota 0; o total fecha com o da carteira
  const ir = irPorAliquota(abertos);
  assert.deepEqual(ir.map((g) => g.aliquota), [0.225, 0.2, 0]);
  assert.equal(ir.find((g) => g.aliquota === 0).ir, 0);
  assert.equal(ir.reduce((s, g) => s + g.vale, 0), c.total.vale);
  assert.equal(ir.reduce((s, g) => s + g.ir, 0), c.total.ir);
  // as quedas, pela data: o de 01/06 vai de 22,5% a 20% em 29/11 (181 dias); os de abril e maio, a 17,5% em 2027
  const q = proximasQuedas(abertos, HOJE);
  assert.deepEqual([q[0].item.ap.id, q[0].data, q[0].de, q[0].para], ['t2', '2026-11-29', 0.225, 0.2]);
  assert.deepEqual(q.map((x) => x.item.ap.id), ['t2', 'd1', 't1']);
  assert.ok(q.every((x) => x.data > HOJE && x.para < x.de && x.economia > 0));
  assert.ok(!q.some((x) => x.item.inv.tipo === 'lci'));
  // cada investimento: o peso fecha em 1, o próximo vencimento, a taxa ao ano perto do CDI do ano (~14%)
  const linhas = porInvestimento(abertos, v.proximos, HOJE);
  assert.ok(Math.abs(linhas.reduce((s, l) => s + l.peso, 0) - 1) < 1e-9);
  const t = linhas.find((l) => l.inv.id === 't');
  assert.deepEqual([t.aportes, t.proximoVencimento], [2, '2026-12-01']);
  const d = linhas.find((l) => l.inv.id === 'd');
  assert.ok(d.aoAno > 0.12 && d.aoAno < 0.16, `ao ano: ${d.aoAno}`);
  assert.equal(linhas.find((l) => l.inv.id === 'l').aoAno, null); // menos de um mês: sem número
  assert.equal(posicaoDoAporte(aportes[0], cadastro[0], [], cal, HOJE).vale, d.vale);
});

test('as quedas: o fim do IOF entra como uma queda, também na isenta', () => {
  const cadastro = [cad('d'), cad('l', { tipo: 'lci' })];
  const aportes = [ap('d1', 'd', '2026-10-11', 1000000), ap('l1', 'l', '2026-10-20', 500000), ap('d2', 'd', '2026-06-03', 800000)];
  const c = montarCarteira({ cadastro, aportes, resgates: [], cdi: CDI, hoje: HOJE });
  const abertos = c.itens.filter((x) => !x.pos.encerrado);
  const q = proximasQuedas(abertos, HOJE);
  const iof = q.filter((x) => x.tipo === 'iof');
  assert.deepEqual(iof.map((x) => [x.item.ap.id, x.data, x.de, x.para]), [['d1', '2026-11-10', 0.1, 0], ['l1', '2026-11-19', 0.4, 0]]);
  const d1 = abertos.find((x) => x.ap.id === 'd1').pos;
  assert.equal(iof[0].economia, d1.iof + d1.ir - Math.floor(d1.rendeu * 0.225));
  assert.equal(iof[1].economia, abertos.find((x) => x.ap.id === 'l1').pos.iof); // a LCI: o IOF inteiro
  assert.deepEqual(q.map((x) => x.data), [...q.map((x) => x.data)].sort()); // pela data, junto das do IR
  assert.ok(q.some((x) => x.tipo === 'ir'));
  // o IR por alíquota: o IR e o IOF separados, fechando com a carteira
  const g = irPorAliquota(abertos);
  assert.equal(g.reduce((s, x) => s + x.iof, 0), c.total.iof);
});

test('o dinheiro que entrou e saiu: só os meses com movimento, a quebra com os vazios e o ano no primeiro de cada um', () => {
  const m = (competencia, aportes = 0, resgates = 0) => ({ competencia, aportes, resgates });
  const meses = [m('2024-12', 100), m('2025-01', 50), m('2025-02'), m('2025-03'), m('2025-04', 0, 30), m('2025-05'), m('2026-01', 10), m('2026-02')];
  const r = mesesComMovimento(meses);
  assert.deepEqual(r.map((x) => (x.tipo === 'quebra' ? `/${x.vazios}` : `${x.id}${x.ano ? '*' : ''}`)), ['2024-12*', '2025-01*', '/2', '2025-04', '/8', '2026-01*']);
  assert.equal(r.find((x) => x.id === '2025-04').k, 4);
  assert.deepEqual(mesesComMovimento([m('2026-01'), m('2026-02')]), []);
});

test('a evolução em cascata: os meses com aporte, os parados num degrau, por ano e o começo do período', () => {
  // o total, o que entrou, o que saiu e o que rendeu (= total − anterior − entrou + saiu), como o `mesAMes` dá
  let ant = 0;
  const m = (competencia, total, aportes = 0, resgates = 0) => {
    const r = { competencia, total, aportes, resgates, rendeu: total - ant - aportes + resgates, aportado: 0, rendimentoAcum: 0 };
    ant = total; return r;
  };
  const meses = [m('2025-11', 1000, 1000), m('2025-12', 1010), m('2026-01', 1020), m('2026-02', 2030, 1000), m('2026-03', 1540, 0, 500)];
  meses[4].aportado = 1500; meses[4].rendimentoAcum = 40;
  const c = cascataDoPatrimonio(meses);
  assert.deepEqual(c.colunas.map((x) => `${x.tipo}:${x.de}→${x.ate}${x.ano ? '*' : ''}`), ['mes:0→1000*', 'parado:1000→1020', 'mes:1020→2030*', 'mes:2030→1540']);
  const p = c.colunas[1];
  assert.deepEqual([p.n, p.rendeu, p.desde, p.ateMes], [2, 20, '2025-12', '2026-01']);
  assert.equal(p.ano, false); // dez/25 é do ano do mês antes dele: o ano só vem com jan
  assert.deepEqual(c.fim, { competencia: '2026-03', total: 1540, aportado: 1500, rendimento: 40 });
  const a = cascataDoPatrimonio(meses, 'ano');
  assert.deepEqual(a.colunas.map((x) => `${x.tipo}:${x.valor}:${x.de}→${x.ate}${x.ano ? '*' : ''}`),
    ['aportes:1000:0→1000*', 'rendeu:10:1000→1010', 'aportes:1000:1010→2010*', 'rendeu:30:2010→2040', 'saiu:500:2040→1540']);
  // o período que começa depois: a coluna do começo, do zero até o patrimônio de antes
  const depois = cascataDoPatrimonio(meses.slice(2));
  assert.deepEqual(depois.colunas.slice(0, 2).map((x) => `${x.tipo}:${x.de}→${x.ate}`), ['inicio:0→1010', 'parado:1010→1020']);
  assert.equal(cascataDoPatrimonio([]), null);
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
