import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  aliquotaIOF, aliquotaIR, calendario, dadosDoCadastro, impostos, diferencaDoCadastro, fator, fimDeSemana, lerAporte, lerResgate,
  linhaDoCadastro, mesAMes, montarCarteira, noVencimento, partidaDoAporte, posicaoDoAporte, proximaQueda, reaplicacoesDevidas,
  rendeuDoDeposito, somarPosicoes, sugerirVencimento, validarCadastro, vencidosAntesDeReaplicar,
} from '../src/lib/carteira.js';

// O CDI de cada dia útil de 01/04 a 05/11/2026 (a série 12 do Banco Central, dado público), como `api/taxas.js` entrega.
const CDI = JSON.parse(readFileSync(new URL('./fixtures/cdi-2026.json', import.meta.url), 'utf8')).map(([d, v]) => [d, Number(v) / 100]);
const HOJE = '2026-11-07'; // sábado: o último CDI publicado é o de quinta (05/11); o de sexta vai com a taxa dele
const cal = calendario(CDI, HOJE);
const novo = (data, valor, extra = {}) => ({ id: `${data}-${valor}`, investimento_id: 'i', origem: 'novo', data, valor_centavos: valor, rendeu_antes_centavos: 0, aplicado_em: null, vencimento: null, ...extra });
const inv = (taxa, extra = {}) => ({ id: 'i', nome: 'X', instituicao: 'Banco', tipo: 'cdb', taxa, resgate: 'diaria', ativo: true, ...extra });
const vale = (ap, i, dia, rs = []) => posicaoDoAporte(ap, i, rs, cal, dia).vale;

// AS REGRAS DO BANCO foram conferidas no centavo com os números reais do Nubank e da XP (07 e 08/11/2026); essa
// conferência fica em dados/conferencia-carteira.test.js, FORA DO GIT (o repositório é público). Aqui, as mesmas regras
// com valores inventados.
test('as regras do banco: o total arredonda no fim, o fim de semana começa no dia útil seguinte, o dia a dia útil', () => {
  // o TOTAL do investimento soma os aportes sem arredondar cada um, como o banco
  const i = inv(102.5);
  const aps = [novo('2026-06-03', 333333), novo('2026-09-12', 1234567), novo('2026-10-13', 777777)];
  const pos = aps.map((ap) => posicaoDoAporte(ap, i, [], cal, HOJE));
  const total = somarPosicoes(pos.map((p) => ({ pos: p }))).vale;
  assert.equal(total, Math.round(pos.reduce((s, p) => s + p.exato.vale, 0)));
  // o aporte de sábado ou domingo começa na segunda: vale o mesmo que o de segunda; o de sexta, um dia a mais
  assert.equal(vale(novo('2026-09-12', 1000000), i, HOJE), vale(novo('2026-09-14', 1000000), i, HOJE));
  assert.equal(vale(novo('2026-09-13', 1000000), i, HOJE), vale(novo('2026-09-14', 1000000), i, HOJE));
  assert.ok(vale(novo('2026-09-11', 1000000), i, HOJE) > vale(novo('2026-09-12', 1000000), i, HOJE));
  // a data de um dia a mais muda o valor: o dia útil entre os dois
  const d = vale(novo('2026-09-02', 1000000), inv(103), HOJE) - vale(novo('2026-09-03', 1000000), inv(103), HOJE);
  assert.ok(d > 0 && d < 1000000 * 0.001);
});

test('o dia do banco: sábado, domingo e feriado começam no dia útil seguinte', () => {
  // um depósito de sábado: rendimento zero no domingo; na terça, só o CDI de segunda
  const sab = novo('2026-11-07', 1000000);
  assert.equal(partidaDoAporte(sab).data, '2026-11-07');
  assert.equal(posicaoDoAporte(sab, inv(100), [], calendario(CDI, '2026-11-08'), '2026-11-08').vale, 1000000);
  const terca = posicaoDoAporte(sab, inv(100), [], calendario(CDI, '2026-11-10'), '2026-11-10');
  assert.deepEqual([terca.conta.dias, terca.vale], [1, Math.round(1000000 * (1 + 0.00050788))]);
  assert.deepEqual(['2026-11-06', '2026-11-07', '2026-11-08', '2026-11-09'].map(fimDeSemana), [false, true, true, false]);
  // o de sábado 10/10: a segunda 12/10 é feriado, começa em 13/10
  assert.equal(fator(cal, '2026-10-10', '2026-10-14', 100).dias, 1);
  assert.equal(fator(cal, '2026-10-11', '2026-10-14', 100).dias, 1); // só o 13/10
  // os dias depois do último publicado vão com a taxa dele (a sexta 06/11)
  const f = fator(cal, '2026-11-05', HOJE, 100);
  assert.deepEqual([f.dias, f.proj], [2, 1]);
  // sem as taxas o valor fica no da partida
  assert.equal(posicaoDoAporte(novo('2026-09-12', 1000000), inv(100), [], [], HOJE).vale, 1000000);
});

test('já estava aplicado: parte do total do banco, o aplicado é o total menos o que já rendeu', () => {
  const ap = { id: 'a', investimento_id: 'i', origem: 'antigo', data: HOJE, valor_centavos: 1000000, rendeu_antes_centavos: 200000, aplicado_em: '2025-01-10', vencimento: null };
  const hoje = posicaoDoAporte(ap, inv(100), [], cal, HOJE);
  assert.deepEqual([hoje.vale, hoje.aplicado, hoje.rendeu], [1000000, 800000, 200000]);
  assert.equal(hoje.aliquota, 0.175); // 666 dias
  assert.equal(hoje.ir, Math.round(200000 * 0.175));
  // na terça 10/11 já tem o CDI de segunda (o de sexta já estava no número do sábado)
  const terca = posicaoDoAporte(ap, inv(100), [], calendario(CDI, '2026-11-10'), '2026-11-10');
  assert.equal(terca.conta.dias, 1);
  assert.equal(terca.vale, Math.round(1000000 * (1 + 0.00050788)));
  // sem a data do aporte, o IR vai pelo maior
  const sem = posicaoDoAporte({ ...ap, aplicado_em: null }, inv(100), [], cal, HOJE);
  assert.equal(sem.semData, true);
  assert.equal(sem.aliquota, 0.225);
});

test('já estava aplicado: o que rendeu sai da conta do CDI desde o depósito, também depois de um saque', () => {
  // um depósito de R$ 10.000,00 em 07/04 a 101% do CDI: o que o banco mostraria hoje, e o que a conta acha que rendeu
  const dep = novo('2026-04-07', 1000000);
  const i = inv(101);
  const conta = (total, deposito, taxa = 101) => rendeuDoDeposito({ total, deposito, lido: HOJE, taxa }, cal);
  const semSaque = posicaoDoAporte(dep, i, [], cal, HOJE);
  const r = conta(semSaque.vale, '2026-04-07');
  assert.ok(Math.abs(r.aplicado - 1000000) <= 1);
  assert.equal(r.rendeu, semSaque.vale - r.aplicado);
  assert.equal(r.ini, '2026-04-07');
  // com um saque no meio, o banco soma ao "Rendimento bruto" o que saiu junto; a conta acha só o que ficou, como o app
  const saque = [{ aporte_id: dep.id, data: '2026-07-15', valor_centavos: 400000, tudo: false }];
  const comSaque = posicaoDoAporte(dep, i, saque, cal, HOJE);
  const r2 = conta(comSaque.vale, '2026-04-07');
  assert.ok(Math.abs(r2.rendeu - comSaque.rendeu) <= 1);
  assert.ok(r2.rendeu < semSaque.rendeu - Math.round(semSaque.rendeu * 0.3)); // o rendimento do que saiu não está ali
  // o depósito de sábado começa no dia útil seguinte, como o dinheiro novo (o 12/10 é feriado: o 13/10)
  assert.equal(conta(1000000, '2026-10-10').f, conta(1000000, '2026-10-13').f);
  // sem o CDI desde o depósito, sem a data, depois do dia em que olhou ou sem o total: não há conta
  assert.equal(conta(1000000, '2026-03-02'), null);
  assert.equal(conta(1000000, ''), null);
  assert.equal(conta(1000000, '2026-11-09'), null);
  assert.equal(conta(null, '2026-04-07'), null);
});

test('o IR e o IOF cortam a fração de centavo, como o banco (sem o erro do ponto flutuante)', () => {
  assert.deepEqual(impostos(10004, 60, 0.225), { iof: 0, ir: 2250 }); // 2250,9: o banco cobra 2250
  assert.deepEqual(impostos(3640, 60, 0.225), { iof: 0, ir: 819 }); // 819 exato (no ponto flutuante, 818,999…)
  assert.deepEqual(impostos(1000, 10, 0.225), { iof: 660, ir: 76 }); // IOF de 66%; o IR sobre os 340 que sobram (76,5)
  assert.deepEqual(impostos(10004, null, 0.225), { iof: 0, ir: 2250 }); // sem a data: sem IOF, o IR pelo maior
  assert.deepEqual(impostos(5000, 800, 0), { iof: 0, ir: 0 }); // isenta
  // a posição de um aporte usa a mesma conta
  const ap = { id: 'x', investimento_id: 'i', origem: 'antigo', data: HOJE, valor_centavos: 1010004, rendeu_antes_centavos: 10004, aplicado_em: '2026-09-01', vencimento: null };
  assert.deepEqual([posicaoDoAporte(ap, inv(100), [], cal, HOJE).ir, posicaoDoAporte(ap, inv(100), [], cal, HOJE).liquido], [2250, 1010004 - 2250]);
});

test('o IR, o IOF e as isentas', () => {
  assert.deepEqual([aliquotaIR(180), aliquotaIR(181), aliquotaIR(360), aliquotaIR(361), aliquotaIR(720), aliquotaIR(721)], [0.225, 0.2, 0.2, 0.175, 0.175, 0.15]);
  assert.deepEqual([aliquotaIOF(1), aliquotaIOF(27), aliquotaIOF(29), aliquotaIOF(30)], [0.96, 0.1, 0.03, 0]);
  const p = posicaoDoAporte(novo('2026-10-11', 1500000), inv(102.5), [], cal, HOJE); // 27 dias: IOF de 10%
  assert.equal(p.idade, 27);
  assert.equal(p.iof, Math.floor(p.rendeu * 0.1));
  assert.equal(p.ir, Math.floor((p.rendeu - p.iof) * 0.225));
  assert.equal(p.liquido, p.vale - p.ir - p.iof);
  const lci = posicaoDoAporte(novo('2026-04-07', 100000), inv(95, { tipo: 'lci' }), [], cal, HOJE);
  assert.equal(lci.ir, 0);
  assert.deepEqual(proximaQueda('2026-06-03', HOJE), { data: '2026-12-01', para: 0.2 });
  assert.equal(proximaQueda('2024-01-01', HOJE), null);
});

test('o resgate sai do aporte: o aplicado diminui na mesma proporção; tudo e o vencimento encerram', () => {
  const ap = novo('2026-06-03', 1000000);
  const i = inv(100);
  const antes = posicaoDoAporte(ap, i, [], cal, '2026-09-01');
  const r = posicaoDoAporte(ap, i, [{ aporte_id: ap.id, data: '2026-09-01', valor_centavos: 500000, tudo: false }], cal, '2026-09-01');
  assert.equal(r.vale, antes.vale - 500000);
  assert.equal(r.aplicado, Math.round(1000000 * ((antes.vale - 500000) / antes.vale)));
  assert.deepEqual(r.saidas, [{ data: '2026-09-01', valor: 500000 }]);
  // depois do resgate, o que ficou continua rendendo
  const depois = posicaoDoAporte(ap, i, [{ aporte_id: ap.id, data: '2026-09-01', valor_centavos: 500000, tudo: false }], cal, HOJE);
  assert.ok(depois.vale > r.vale);
  // tudo
  const tudo = posicaoDoAporte(ap, i, [{ aporte_id: ap.id, data: '2026-09-01', valor_centavos: null, tudo: true }], cal, HOJE);
  assert.equal(tudo.encerrado.motivo, 'resgate');
  assert.equal(tudo.encerrado.valor, antes.vale);
  assert.equal(tudo.vale, 0);
  // o vencimento: o valor para no dia e volta para a conta
  const venc = posicaoDoAporte({ ...ap, vencimento: '2026-10-01' }, i, [], cal, HOJE);
  assert.equal(venc.encerrado.motivo, 'vencimento');
  assert.equal(venc.encerrado.valor, posicaoDoAporte(ap, i, [], cal, '2026-10-01').vale);
  // um dia antes ainda está aberto
  assert.equal(posicaoDoAporte({ ...ap, vencimento: '2026-10-01' }, i, [], cal, '2026-09-30').encerrado, null);
});

test('o vencimento sugerido: o prazo, um dia antes se o cadastro diz, e o fim de semana como o banco faz', () => {
  const nubank = (prazo, antes = false) => ({ prazo_meses: prazo, vence_dia_antes: antes, vence_dia_util: false });
  const xp = (prazo, antes = false) => ({ prazo_meses: prazo, vence_dia_antes: antes, vence_dia_util: true });
  assert.equal(sugerirVencimento('2026-06-03', nubank(6, true)), '2026-12-02'); // o RDB Planejado
  assert.equal(sugerirVencimento('2026-09-12', nubank(6, true)), '2027-03-11');
  assert.equal(sugerirVencimento('2026-04-07', xp(12)), '2027-04-07');
  // 05/06/2027 é sábado: a XP vence na segunda, o Nubank no sábado mesmo
  assert.equal(sugerirVencimento('2026-06-05', xp(12)), '2027-06-07');
  assert.equal(sugerirVencimento('2026-06-05', nubank(12)), '2027-06-05');
  // um dia antes que cai no fim de semana: no Nubank fica (sábado e domingo); na XP vai para a segunda
  assert.equal(sugerirVencimento('2026-06-06', nubank(12, true)), '2027-06-05');
  assert.equal(sugerirVencimento('2026-06-07', nubank(12, true)), '2027-06-06');
  assert.equal(sugerirVencimento('2026-06-07', xp(12, true)), '2027-06-07');
  assert.equal(sugerirVencimento('2026-06-06', xp(12, true)), '2027-06-07');
  assert.equal(sugerirVencimento('2026-01-31', xp(1)), '2026-03-02'); // 28/02 é sábado
  assert.equal(sugerirVencimento('2026-01-31', nubank(1)), '2026-02-28');
  // sem o cadastro, sem o prazo ou sem a 023 (sem a coluna: vence no dia)
  assert.equal(sugerirVencimento('2026-04-07', nubank(null)), null);
  assert.equal(sugerirVencimento('2026-04-07', undefined), null);
  assert.equal(sugerirVencimento('2026-06-05', { prazo_meses: 12 }), '2027-06-05');
});

test('a carteira: por instituição, os investimentos e os aportes abertos; os encerrados à parte', () => {
  const cadastro = [
    { id: 'a', nome: 'RDB', instituicao: 'Nubank', tipo: 'rdb', taxa: 100, resgate: 'diaria', ativo: true, ordem: 0 },
    { id: 'b', nome: 'CDB', instituicao: 'XP', tipo: 'cdb', taxa: 100, resgate: 'vencimento', ativo: true, ordem: 0 },
    { id: 'c', nome: 'Velho', instituicao: 'XP', tipo: 'cdb', taxa: 100, resgate: 'diaria', ativo: false, ordem: 1 },
  ];
  const aportes = [
    { ...novo('2026-06-03', 100000), id: 1, investimento_id: 'a' },
    { ...novo('2026-04-07', 200000), id: 2, investimento_id: 'b', vencimento: '2026-10-07' },
    { ...novo('2026-08-13', 300000), id: 3, investimento_id: 'b', vencimento: '2027-08-13' },
  ];
  const c = montarCarteira({ cadastro, aportes, resgates: [], cdi: CDI, hoje: HOJE });
  assert.deepEqual(c.grupos.map((g) => g.instituicao), ['Nubank', 'XP']);
  assert.deepEqual(c.grupos[1].investimentos.map((x) => x.inv.nome), ['CDB']); // o desativado sem aporte não aparece
  assert.equal(c.grupos[1].investimentos[0].aportes.length, 1); // o de 07/04 venceu em 07/10
  assert.equal(c.encerrados.length, 1);
  assert.equal(c.grupos[1].investimentos[0].proximoVencimento, '2027-08-13');
  assert.equal(c.total.vale, c.grupos.reduce((s, g) => s + g.totais.vale, 0));
  assert.equal(c.total.rendeu, c.total.vale - c.total.aplicado);
});

test('o mês a mês: o total no fim de cada mês, o que entrou e saiu e o que rendeu', () => {
  const cadastro = [{ id: 'i', nome: 'X', instituicao: 'B', tipo: 'cdb', taxa: 100, resgate: 'diaria', ativo: true }];
  const aportes = [{ ...novo('2026-06-05', 1000000), id: 1 }, { ...novo('2026-08-13', 500000), id: 2, vencimento: '2026-10-13' }];
  const resgates = [{ aporte_id: 1, data: '2026-09-15', valor_centavos: 200000, tudo: false }];
  const m = mesAMes({ cadastro, aportes, resgates, cdi: CDI, hoje: HOJE });
  assert.deepEqual(m.map((x) => x.competencia), ['2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11']);
  assert.equal(m[0].aportes, 1000000);
  assert.equal(m[2].aportes, 500000);
  assert.equal(m[3].resgates, 200000);
  // o de 13/08 venceu em 13/10: sai com o valor do dia
  const venc = posicaoDoAporte(aportes[1], cadastro[0], [], cal, HOJE).encerrado.valor;
  assert.equal(m[4].resgates, venc);
  // o total do fim de julho é o aporte de junho com o CDI até 31/07
  assert.equal(m[1].total, posicaoDoAporte(aportes[0], cadastro[0], [], cal, '2026-08-01').vale);
  // a soma do que rendeu em cada mês fecha com o rendimento de hoje + o que saiu acima do aplicado
  const rendeuMeses = m.reduce((s, x) => s + x.rendeu, 0);
  const hoje = m[m.length - 1];
  assert.equal(rendeuMeses, hoje.total - (1500000 - 200000 - venc));
  assert.ok(m[1].pct > 0.004 && m[1].pct < 0.013);
  // o mês em que o dinheiro entra pesa só os dias úteis em que ele ficou aplicado: perto do CDI do mês, não o dobro
  assert.ok(m[0].pct > 0.009 && m[0].pct < 0.0125, `junho: ${m[0].pct}`);
});

test('o pop-up do aporte: o que falta e o que grava', () => {
  assert.equal(lerAporte({ modo: 'novo', investimento_id: '' }, HOJE).erro, 'Escolha o investimento.');
  assert.equal(lerAporte({ modo: 'novo', investimento_id: 'i', data: '2026-11-08', valor: 100 }, HOJE).erro, 'A data do aporte ainda não chegou.');
  assert.equal(lerAporte({ modo: 'novo', investimento_id: 'i', data: HOJE, valor: 100, vencimento: HOJE }, HOJE).erro, 'O vencimento precisa ser depois do aporte.');
  assert.deepEqual(lerAporte({ modo: 'novo', investimento_id: 'i', data: HOJE, valor: 100000, vencimento: '' }, HOJE).dados,
    { investimento_id: 'i', origem: 'novo', data: HOJE, valor_centavos: 100000, rendeu_antes_centavos: 0, aplicado_em: null, vencimento: null });
  assert.equal(lerAporte({ modo: 'antigo', investimento_id: 'i', lido: HOJE, total: 1000, rendeu: 1000 }, HOJE).erro, 'O rendimento precisa ser menor que o total.');
  assert.deepEqual(lerAporte({ modo: 'antigo', investimento_id: 'i', lido: HOJE, total: 1234567, rendeu: 234567, aplicado_em: '', vencimento: '' }, HOJE).dados,
    { investimento_id: 'i', origem: 'antigo', data: HOJE, valor_centavos: 1234567, rendeu_antes_centavos: 234567, aplicado_em: null, vencimento: null });
  // o resgate do valor inteiro (ou mais) é "tudo"
  assert.deepEqual(lerResgate({ aporte: 'a', data: HOJE, valor: 5000, tudo: false }, '2026-01-01', 5000, HOJE).dados, { aporte_id: 'a', data: HOJE, valor_centavos: null, tudo: true });
  assert.equal(lerResgate({ aporte: 'a', data: '2025-12-31', valor: 10, tudo: false }, '2026-01-01', 5000, HOJE).erro, 'O resgate não pode ser antes do aporte.');
});

test('o cadastro em tabela: a diferença e o que falta', () => {
  const orig = { id: 'x', nome: 'RDB', instituicao: 'Nubank', tipo: 'rdb', taxa: '102.500', resgate: 'vencimento', prazo_meses: 6, vence_dia_antes: true, ativo: true };
  const l = linhaDoCadastro(orig);
  assert.deepEqual(diferencaDoCadastro(l), {});
  assert.deepEqual(diferencaDoCadastro({ ...l, taxa: '103' }), { taxa: 103 });
  assert.deepEqual(diferencaDoCadastro({ ...l, prazo_meses: '' }), { prazo_meses: null });
  assert.equal(validarCadastro([{ ...l, taxa: 'abc' }]).campo, 'taxa');
  assert.equal(validarCadastro([{ ...l, instituicao: ' ' }]).campo, 'instituicao');
  assert.equal(validarCadastro([l]), null);
  // o que acontece no vencimento: 'conta' é o padrão (nem vai para o banco); "reaplica" pede o prazo
  assert.equal(l.no_vencimento, 'conta');
  assert.equal('no_vencimento' in dadosDoCadastro(l), false);
  assert.deepEqual(diferencaDoCadastro({ ...l, no_vencimento: 'reaplica' }), { no_vencimento: 'reaplica' });
  assert.deepEqual(diferencaDoCadastro(linhaDoCadastro({ ...orig, no_vencimento: 'reaplica' })), {});
  assert.deepEqual(diferencaDoCadastro({ ...linhaDoCadastro({ ...orig, no_vencimento: 'reaplica' }), no_vencimento: 'conta' }), { no_vencimento: 'conta' });
  assert.equal(validarCadastro([{ ...l, no_vencimento: 'reaplica', prazo_meses: '' }]).campo, 'prazo_meses');
  assert.equal(validarCadastro([{ ...l, no_vencimento: 'reaplica' }]), null);
  // o fim de semana: false é o padrão (nem vai para o banco, como o 'conta')
  assert.equal(l.vence_dia_util, false);
  assert.equal('vence_dia_util' in dadosDoCadastro(l), false);
  assert.equal(dadosDoCadastro({ ...l, vence_dia_util: true }).vence_dia_util, true);
  assert.deepEqual(diferencaDoCadastro({ ...l, vence_dia_util: true }), { vence_dia_util: true });
  assert.deepEqual(diferencaDoCadastro(linhaDoCadastro({ ...orig, vence_dia_util: true })), {});
  assert.deepEqual(diferencaDoCadastro({ ...linhaDoCadastro({ ...orig, vence_dia_util: true }), vence_dia_util: false }), { vence_dia_util: false });
});

test('o vencimento que reaplica: um aporte novo com o líquido do dia, o IR recomeça e o prazo do cadastro', () => {
  const i = inv(100, { no_vencimento: 'reaplica', prazo_meses: 3 });
  const ap = novo('2026-04-07', 1000000, { vencimento: '2026-10-07' });
  const devidas = reaplicacoesDevidas({ cadastro: [i], aportes: [ap], resgates: [], cal, hoje: HOJE });
  assert.equal(devidas.length, 1);
  const { venc, dados } = devidas[0];
  // o valor do dia do vencimento, menos o IR pela idade nesse dia (183 dias: 20%)
  const noDia = posicaoDoAporte({ ...ap, vencimento: null }, i, [], cal, '2026-10-07').vale;
  assert.equal(venc.valor, noDia);
  assert.equal(venc.aliquota, 0.2);
  assert.equal(venc.ir, Math.floor((noDia - 1000000) * 0.2));
  assert.deepEqual(dados, {
    investimento_id: 'i', origem: 'novo', data: '2026-10-07', valor_centavos: noDia - venc.ir, rendeu_antes_centavos: 0, aplicado_em: null,
    vencimento: '2027-01-07', reaplicado_de: ap.id, conferir: true,
  });
  // o novo é uma aplicação nova: o IR recomeça em 22,5% (31 dias), e o de antes vai para os encerrados com o `seguinte`
  const novoAp = { ...dados, id: 'n' };
  const c = montarCarteira({ cadastro: [i], aportes: [ap, novoAp], resgates: [], cdi: CDI, hoje: HOJE });
  assert.equal(c.encerrados.length, 1);
  assert.equal(c.encerrados[0].seguinte.id, 'n');
  const aberto = c.grupos[0].investimentos[0].aportes[0];
  assert.equal(aberto.pos.aplicado, venc.liquido);
  assert.equal(aberto.pos.aliquota, 0.225);
  // já virou, voltou para a conta, ainda não venceu, ou o cadastro devolve para a conta: nada a reaplicar
  assert.equal(reaplicacoesDevidas({ cadastro: [i], aportes: [ap, novoAp], cal, hoje: HOJE }).length, 0);
  assert.equal(reaplicacoesDevidas({ cadastro: [i], aportes: [{ ...ap, nao_reaplicar: true }], cal, hoje: HOJE }).length, 0);
  assert.equal(reaplicacoesDevidas({ cadastro: [i], aportes: [ap], cal, hoje: '2026-10-06' }).length, 0);
  assert.equal(reaplicacoesDevidas({ cadastro: [{ ...i, no_vencimento: 'conta' }], aportes: [ap], cal, hoje: HOJE }).length, 0);
  // sem o CDI desde a partida, espera (o valor do vencimento sairia errado)
  assert.equal(reaplicacoesDevidas({ cadastro: [i], aportes: [ap], cal: [], hoje: HOJE }).length, 0);
  // resgatado inteiro antes do vencimento: não venceu, não reaplica
  assert.equal(reaplicacoesDevidas({ cadastro: [i], aportes: [ap], resgates: [{ aporte_id: ap.id, data: '2026-08-03', valor_centavos: null, tudo: true }], cal, hoje: HOJE }).length, 0);
});

test('o vencimento que reaplica: na isenta o dinheiro segue rendendo igual, também num vencimento de sábado', () => {
  const i = inv(100, { tipo: 'lci', no_vencimento: 'reaplica', prazo_meses: 6 });
  const ap = novo('2026-04-07', 1000000, { vencimento: '2026-10-10' }); // 10/10/2026 é sábado
  const [{ venc, dados }] = reaplicacoesDevidas({ cadastro: [i], aportes: [ap], cal, hoje: HOJE });
  assert.equal(venc.ir, 0);
  assert.equal(dados.valor_centavos, venc.valor);
  // o reaplicado começa no próprio vencimento (o CDI de sexta já está no valor do de antes): sem render duas vezes
  assert.equal(partidaDoAporte(dados).data, '2026-10-10');
  const continuo = posicaoDoAporte({ ...ap, vencimento: null }, i, [], cal, HOJE).vale;
  const reaplicado = posicaoDoAporte({ ...dados, id: 'n' }, i, [], cal, HOJE).vale;
  assert.ok(Math.abs(reaplicado - continuo) <= 1, `${reaplicado} × ${continuo}`);
});

test('o vencimento: o líquido do dia (IR e IOF pela idade) e o que já tinha vencido quando o cadastro passou a reaplicar', () => {
  const i = inv(100);
  // vencido em 20 dias: IOF e 22,5%
  const curto = posicaoDoAporte(novo('2026-09-01', 1000000, { vencimento: '2026-09-21' }), i, [], cal, HOJE);
  const v = noVencimento(i, curto);
  assert.equal(v.idade, 20);
  assert.ok(v.iof > 0);
  assert.equal(v.liquido, v.valor - v.ir - v.iof);
  assert.equal(noVencimento(i, posicaoDoAporte(novo('2026-09-01', 1000000), i, [], cal, HOJE)), null);
  const aportes = [
    novo('2026-04-07', 100, { id: 'a', vencimento: '2026-10-07' }),
    novo('2026-04-07', 100, { id: 'b', vencimento: HOJE }), // vence hoje: esse ainda reaplica
    novo('2026-04-07', 100, { id: 'c', vencimento: '2026-08-07' }),
    novo('2026-08-07', 100, { id: 'd', reaplicado_de: 'c' }), // o "c" já virou o "d"
    novo('2026-04-07', 100, { id: 'e', vencimento: '2026-09-07', nao_reaplicar: true }),
  ];
  assert.deepEqual(vencidosAntesDeReaplicar(aportes, 'i', HOJE), ['a']);
});
