import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  aplicacoesComPrazo, diferencaInvestimento, impostoGarantia, linhaDoInvestimento, linhaNova, padraoDoTipo, pendentesDeValor,
  rendimentoForaDoNormal, rotuloLiquidez, rotuloPrazo, validarCadastro,
} from '../src/lib/investimentos.js';
import { planoDosDepositos } from '../src/lib/impostoInvestimento.js';
import { calcularValor, parseValor } from '../src/lib/dinheiro.js';

// Dados FICTÍCIOS (06/11/2026, o Patrimônio "do zero").

test('o prazo de cada aplicação: vence N meses depois dela e, ao vencer, reaplica sozinho', () => {
  const inv = { id: 'cdb', liquidez: 'por_aplicacao', prazo_meses: 24, ao_vencer: 'reaplica', aplicado_inicial_centavos: 2000000, aplicado_em: '2024-03-12' };
  const fotos = [{ investimento_id: 'cdb', data: '2026-11-05', valor_centavos: 4830000 }];
  const movimentos = [
    { investimento_id: 'cdb', data: '2026-11-20', tipo: 'aporte', valor_centavos: 1000000 },
    { investimento_id: 'outro', data: '2026-11-21', tipo: 'aporte', valor_centavos: 999999 },
  ];
  const r = aplicacoesComPrazo({ inv, fotos, movimentos, hoje: '2026-12-01' });
  assert.equal(r.prazo, 24);
  assert.equal(r.lotes.length, 2);
  // a de 12/03/2024 venceu em 12/03/2026 e reaplicou: agora vence em 12/03/2028
  assert.deepEqual([r.lotes[0].vence, r.lotes[0].renovacoes, r.lotes[0].vencida], ['2028-03-12', 1, false]);
  assert.equal(r.lotes[1].vence, '2028-11-20');
  assert.equal(r.proximo.vence, '2028-03-12');
  // com "volta para a conta", a que venceu fica vencida
  const volta = aplicacoesComPrazo({ inv: { ...inv, ao_vencer: 'volta' }, fotos, movimentos, hoje: '2026-12-01' });
  assert.equal(volta.lotes[0].vencida, true);
  assert.equal(volta.proximo.vence, '2028-11-20');
});

test('o resgate sai das aplicações mais antigas; sem data, a aplicação não tem vencimento', () => {
  const inv = { id: 'x', liquidez: 'por_aplicacao', prazo_meses: 12, ao_vencer: 'reaplica', aplicado_inicial_centavos: null, aplicado_em: null };
  const fotos = [{ investimento_id: 'x', data: '2026-01-10', valor_centavos: 500000 }];
  const movimentos = [
    { investimento_id: 'x', data: '2026-02-01', tipo: 'aporte', valor_centavos: 300000 },
    { investimento_id: 'x', data: '2026-03-01', tipo: 'resgate', valor_centavos: 600000 },
  ];
  const r = aplicacoesComPrazo({ inv, fotos, movimentos, hoje: '2026-04-01' });
  assert.deepEqual(r.lotes.map((l) => [l.data, l.valor, l.vence]), [['2026-02-01', 200000, '2027-02-01']]);
  const sem = aplicacoesComPrazo({ inv, fotos, movimentos: [], hoje: '2026-04-01' });
  assert.deepEqual(sem.lotes.map((l) => [l.data, l.vence]), [[null, null]]);
});

test('o rendimento fora do normal sugere a aplicação (ou o resgate) que faltou', () => {
  // CDB de R$ 48.300 que "rendeu" R$ 10.500 num mês: foi uma aplicação de ~R$ 10.000
  const a = rendimentoForaDoNormal({ tipo: 'cdb', antes: 4830000, novo: 5880000, dias: 25 });
  assert.equal(a.tipo, 'aporte');
  assert.equal(a.valor, 1010000);
  // 0,8% num mês é normal
  assert.equal(rendimentoForaDoNormal({ tipo: 'cdb', antes: 4830000, novo: 4868640, dias: 30 }), null);
  // o Tesouro IPCA+ oscila: 4% não assusta
  assert.equal(rendimentoForaDoNormal({ tipo: 'tesouro_ipca', antes: 1000000, novo: 1040000, dias: 30 }), null);
  // a caixinha que caiu R$ 5.000: um resgate que não foi lançado
  const r = rendimentoForaDoNormal({ tipo: 'rdb', antes: 2214000, novo: 1714000, dias: 30 });
  assert.equal(r.tipo, 'resgate');
  assert.equal(r.valor, 520000);
  // com a aplicação lançada, fica normal
  assert.equal(rendimentoForaDoNormal({ tipo: 'cdb', antes: 4830000, novo: 5880000, liquido: 1000000, dias: 25 }), null);
});

test('o cadastro em tabela: o padrão do tipo, a diferença do que mudou e o primeiro problema', () => {
  assert.deepEqual(padraoDoTipo('tesouro_selic'), { indexador: 'selic_mais', taxa: '', liquidez: 'diaria' });
  const inv = { id: 'a', conta_id: 'nu', nome: 'CDB 2 anos', tipo: 'cdb', indexador: 'cdi_pct', taxa: '102.0000', liquidez: 'diaria', liquidez_dias: null,
    carencia_ate: null, vencimento: null, prazo_meses: null, ao_vencer: 'reaplica', aplicado_inicial_centavos: '4400000', emissor: '', observacao: '', ativo: true };
  const l = linhaDoInvestimento(inv);
  assert.equal(l.taxa, '102');
  assert.equal('aplicado' in l, false); // o cadastro não pede mais os valores: o dinheiro entra pelos depósitos
  assert.deepEqual(diferencaInvestimento(l), {});
  const mudou = { ...l, liquidez: 'por_aplicacao', prazo_meses: '24' };
  assert.deepEqual(diferencaInvestimento(mudou), { liquidez: 'por_aplicacao', prazo_meses: 24 });
  assert.equal(validarCadastro([mudou, { ...mudou, id: 'b', prazo_meses: '' }]).campo, 'prazo');
  const nova = linhaNova('n1', 'nu');
  assert.equal(validarCadastro([nova]), null); // vazia: não atrapalha
  // a linha nova com o nome já salva (sem "valor hoje"); o que grava não leva o aplicado
  assert.equal(validarCadastro([{ ...nova, nome: 'LCI' }]), null);
  assert.equal('aplicado_inicial_centavos' in diferencaInvestimento({ ...nova, nome: 'LCI' }), false);
});

test('os depósitos de antes: digitados (o depositado) ou colados (o que vale hoje), e o que mais gravam', () => {
  const comum = { hoje: '2026-11-06', lerValor: calcularValor };
  // DIGITADOS: cada um com a própria data como referência; o aplicado é a soma; no sem valor, a foto de hoje
  const d = planoDosDepositos({ ...comum, modo: 'depositado', semValor: true, linhas: [{ data: '2025-04-22', valor: '5.000,00' }, { data: '2025-09-10', valor: '=3000+200' }, { data: '', valor: '' }], estimativa: 894730 });
  assert.deepEqual(d.itens, [{ data: '2025-04-22', valor_centavos: 500000, referencia: '2025-04-22' }, { data: '2025-09-10', valor_centavos: 320000, referencia: '2025-09-10' }]);
  assert.equal(d.aplicado, 820000);
  assert.deepEqual(d.foto, { data: '2026-11-06', valor: 894730 }); // sem o "vale hoje": a estimativa pelo CDI
  assert.equal(planoDosDepositos({ ...comum, modo: 'depositado', semValor: true, linhas: [{ data: '2025-04-22', valor: '5.000,00' }], valeTexto: '5.400,00' }).foto.valor, 540000);
  // o que já tem valor não ganha foto; o aplicado só muda se mudou
  assert.equal(planoDosDepositos({ ...comum, modo: 'depositado', linhas: [{ data: '2025-04-22', valor: '5.000,00' }], aplicadoAntes: 500000 }).aplicado, undefined);
  // COLADOS (o que vale hoje): a referência é a data dos valores; o aplicado é o do banco, obrigatório no sem valor
  const h = planoDosDepositos({ ...comum, modo: 'hoje', referencia: '2026-11-05', semValor: true, linhas: [{ data: '2026-09-05', valor: '4.165,28' }], aplicadoTexto: '4.076,16' });
  assert.deepEqual(h.itens, [{ data: '2026-09-05', valor_centavos: 416528, referencia: '2026-11-05' }]);
  assert.deepEqual([h.aplicado, h.foto], [407616, { data: '2026-11-05', valor: 416528 }]);
  assert.match(planoDosDepositos({ ...comum, modo: 'hoje', referencia: '2026-11-05', semValor: true, linhas: [{ data: '2026-09-05', valor: '1,00' }] }).erro, /valor aplicado/);
  // os erros de cada linha
  assert.match(planoDosDepositos({ ...comum, modo: 'depositado', linhas: [{ data: '2025-04-22', valor: '' }] }).erro, /Falta o valor do 1º/);
  assert.match(planoDosDepositos({ ...comum, modo: 'depositado', linhas: [{ data: '', valor: '10' }] }).erro, /Falta a data do 1º/);
  assert.match(planoDosDepositos({ ...comum, modo: 'depositado', linhas: [{ data: '2025-04-22', valor: 'abc' }] }).erro, /não é um valor/);
  assert.match(planoDosDepositos({ ...comum, modo: 'hoje', referencia: '2026-08-01', linhas: [{ data: '2026-09-05', valor: '1,00' }], aplicadoTexto: '1,00' }).erro, /depois da data dos valores/);
});

test('os rótulos novos e os que pedem o valor do mês', () => {
  assert.equal(rotuloPrazo(24), '2 anos');
  assert.equal(rotuloPrazo(12), '1 ano');
  assert.equal(rotuloPrazo(18), '18 meses');
  assert.equal(rotuloLiquidez({ liquidez: 'por_aplicacao', prazo_meses: 24 }), 'a cada 2 anos');
  assert.equal(impostoGarantia('saldo'), 'FGC');
  const invs = [{ id: 'a', ativo: true }, { id: 'b', ativo: true }, { id: 'c', ativo: false }];
  const valores = [{ investimento_id: 'a', data: '2026-11-05' }, { investimento_id: 'b', data: '2026-11-30' }, { investimento_id: 'c', data: '2026-10-01' }];
  assert.deepEqual(pendentesDeValor({ investimentos: invs, valores, hoje: '2026-11-20' }).map((i) => i.id), []);
  assert.deepEqual(pendentesDeValor({ investimentos: invs, valores, hoje: '2026-12-02' }).map((i) => i.id), ['a']);
});
