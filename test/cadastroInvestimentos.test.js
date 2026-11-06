import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  aplicacoesComPrazo, diferencaInvestimento, impostoGarantia, linhaDoInvestimento, linhaNova, padraoDoTipo, pendentesDeValor,
  rendimentoForaDoNormal, rotuloLiquidez, rotuloPrazo, validarCadastro,
} from '../src/lib/investimentos.js';
import { planoDoColar } from '../src/lib/impostoInvestimento.js';
import { parseValor } from '../src/lib/dinheiro.js';

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

test('colar os depósitos: o valor aplicado do banco e, no investimento sem valor, a primeira foto', () => {
  // o investimento cadastrado agora (sem valor): a soma vira o valor de hoje, e o aplicado é obrigatório
  assert.deepEqual(planoDoColar({ semValor: true, soma: 8812519, aplicadoTexto: '82.094,56', aplicadoAntes: null, lerValor: parseValor }),
    { aplicado: 8209456, foto: 8812519 });
  assert.match(planoDoColar({ semValor: true, soma: 8812519, aplicadoTexto: '', aplicadoAntes: null, lerValor: parseValor }).erro, /valor aplicado/);
  // o que já tem valor: o aplicado só grava se mudou; vazio não mexe
  assert.deepEqual(planoDoColar({ semValor: false, soma: 100, aplicadoTexto: '820,94', aplicadoAntes: '82094', lerValor: parseValor }), { aplicado: undefined, foto: null });
  assert.deepEqual(planoDoColar({ semValor: false, soma: 100, aplicadoTexto: '', aplicadoAntes: 82094, lerValor: parseValor }), { aplicado: undefined, foto: null });
  assert.equal(planoDoColar({ semValor: false, soma: 100, aplicadoTexto: '900,00', aplicadoAntes: 82094, lerValor: parseValor }).aplicado, 90000);
  assert.match(planoDoColar({ semValor: false, soma: 100, aplicadoTexto: 'abc', aplicadoAntes: null, lerValor: parseValor }).erro, /não é um valor/);
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
