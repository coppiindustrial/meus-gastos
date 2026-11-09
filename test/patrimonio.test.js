import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { calendario, fator, mesAMes, montarCarteira, posicaoDoAporte } from '../src/lib/carteira.js';
import {
  escadaDeLiquidez, filtrarCarteira, irPorAliquota, linhaDoTempoVencimentos, noPeriodo, opcoesDePeriodo, porInvestimento, proximasQuedas,
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
