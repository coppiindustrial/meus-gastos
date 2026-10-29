import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mesesDoAno, pendenciasAgora, periodoDasLinhas, resumirPlanilha, unirPeriodos, vencimentoNoMes } from '../src/lib/importacoes.js';

// Dados FICTÍCIOS.
const nubank = { id: 'nu', nome: 'Nubank', dia_vencimento: 13, ativo: true };
const xp = { id: 'xp', nome: 'XP', dia_vencimento: 10, ativo: true };
const velho = { id: 'vl', nome: 'Antigo', dia_vencimento: 5, ativo: false };
const F = (cartao_id, competencia, extra = {}) => ({ id: `${cartao_id}${competencia}`, cartao_id, competencia, vencimento: `${competencia}-10`, importada_em: `${competencia}-04T18:00:00Z`, qtd: 40, total_centavos: 100000, ...extra });
const faturas = [
  F('nu', '2026-07', { importado_de: 'planilha' }), F('nu', '2026-08'), F('nu', '2026-09'),
  F('xp', '2026-08'), F('xp', '2026-09'), F('xp', '2026-10'),
  F('vl', '2026-02'),
];
const E = (de, ate, criado_em) => ({ periodo_de: de, periodo_ate: ate, criado_em });
const extratos = [E('2026-08-01', '2026-08-30', '2026-09-01T10:00:00Z'), E('2026-09-02', '2026-09-29', '2026-10-02T08:00:00Z'), E('2026-10-01', '2026-10-20', '2026-10-21T09:00:00Z')];
const hoje = '2026-10-28';
const tabela = mesesDoAno({ ano: 2026, hoje, cartoes: [xp, nubank, velho], faturas, extratos });
const linha = (comp) => tabela.linhas.find((l) => l.comp === comp);

test('vencimentoNoMes: o dia do cartão, sem passar do fim do mês', () => {
  assert.equal(vencimentoNoMes('2026-10', 13), '2026-10-13');
  assert.equal(vencimentoNoMes('2026-02', 31), '2026-02-28');
});

test('colunas: um cartão por coluna (por nome) e o extrato no fim', () => {
  assert.deepEqual(tabela.colunas.map((c) => c.key), ['vl', 'nu', 'xp', 'extrato']);
  assert.equal(tabela.linhas[0].comp, '2026-12');
  assert.equal(tabela.linhas.length, 12);
});

test('fatura: importada, da planilha, falta (já venceu), futura e antes de existir', () => {
  assert.equal(linha('2026-09').celulas.nu.estado, 'ok');
  assert.equal(linha('2026-07').celulas.nu.planilha, true);
  assert.equal(linha('2026-07').celulas.nu.data, null);
  assert.deepEqual(linha('2026-10').celulas.nu, { estado: 'falta', vence: '2026-10-13', pendente: true });
  assert.deepEqual(linha('2026-11').celulas.nu, { estado: 'futuro', vence: '2026-11-13' });
  assert.equal(linha('2026-06').celulas.nu.estado, 'na');
  // cartão inativo: depois da última fatura, "—" (não é pendência)
  assert.equal(linha('2026-05').celulas.vl.estado, 'na');
});

test('extrato: mês inteiro, mês em andamento parcial e meses antes do primeiro', () => {
  assert.equal(linha('2026-08').celulas.extrato.estado, 'ok');
  // 30/08 → 02/09 é um buraco de fim de semana: a folga junta, e setembro fica inteiro
  assert.equal(linha('2026-09').celulas.extrato.estado, 'ok');
  assert.equal(linha('2026-09').celulas.extrato.data, '2026-10-02T08:00:00Z');
  const out = linha('2026-10').celulas.extrato;
  assert.equal(out.estado, 'parcial');
  assert.equal(out.ate, '2026-10-20');
  assert.equal(out.faltamDias, 8);
  assert.equal(out.pendente, undefined); // o mês corrente não deve ainda
  assert.equal(linha('2026-07').celulas.extrato.estado, 'na');
  assert.equal(linha('2026-11').celulas.extrato.estado, 'futuro');
});

test('extrato: mês passado sem nada (depois do primeiro) é pendência; sem a tabela, a coluna some', () => {
  const t = mesesDoAno({ ano: 2026, hoje: '2026-12-05', cartoes: [], faturas: [], extratos });
  assert.deepEqual(t.linhas.find((l) => l.comp === '2026-11').celulas.extrato, { estado: 'falta', pendente: true });
  // outubro parou em 20/10 e o mês acabou: parcial que conta
  assert.equal(t.linhas.find((l) => l.comp === '2026-10').celulas.extrato.pendente, true);
  assert.deepEqual(mesesDoAno({ ano: 2026, hoje, cartoes: [nubank], faturas, extratos: null }).colunas.map((c) => c.key), ['nu']);
});

test('faltam: por linha e no total; o número do menu olha o ano e o mês anterior', () => {
  assert.equal(linha('2026-10').faltam, 1); // a fatura do Nubank (o extrato do mês corrente não conta)
  assert.equal(tabela.faltam, 1);
  assert.equal(pendenciasAgora({ hoje, cartoes: [xp, nubank, velho], faturas, extratos }), 1);
  // em janeiro, dezembro do ano anterior ainda conta
  const jan = pendenciasAgora({ hoje: '2027-01-02', cartoes: [nubank], faturas, extratos: null });
  assert.equal(jan, 1); // dez/2026 sem fatura do Nubank (out e nov já são do ano passado: só na tabela)
});

test('unirPeriodos e periodoDasLinhas', () => {
  assert.equal(unirPeriodos([E('2026-01-01', '2026-01-10'), E('2026-01-20', '2026-01-31')]).length, 2);
  assert.equal(unirPeriodos([E('2026-01-01', '2026-01-10'), E('2026-01-13', '2026-01-31')]).length, 1);
  assert.deepEqual(periodoDasLinhas([{ data: '2026-10-05' }, { data: '2026-10-01' }]), { de: '2026-10-01', ate: '2026-10-05' });
});

test('resumirPlanilha: por origem, por mês e a conferência no formato do planilha.json', () => {
  // Dados FICTÍCIOS.
  const linhas = [
    { origem: 'cartao', tipo: 'saida', valor_centavos: 1000, competencia: '2026-02-01', fatura: { arquivo: 'Nubank_2026-02-13.csv' } },
    { origem: 'cartao', tipo: 'saida', valor_centavos: '500', competencia: '2026-02-01', fatura: { arquivo: 'Nubank_2026-02-13.csv' } },
    { origem: 'fixo', tipo: 'saida', valor_centavos: 300, competencia: '2026-01-01' },
    { origem: 'manual', tipo: 'saida', valor_centavos: 200, competencia: '2026-01-01' },
    { origem: 'entrada', tipo: 'entrada', valor_centavos: 9000, competencia: '2026-01-01' },
  ];
  const r = resumirPlanilha(linhas, [{ cartao: { nome: 'Nubank' } }, { cartao: { nome: 'XP' } }, { cartao: { nome: 'Nubank' } }]);
  assert.equal(r.qtd, 5);
  assert.deepEqual(r.porOrigem.cartao, { qtd: 2, total: 1500 });
  assert.equal(r.gastos, 2000);
  assert.equal(r.entradas, 9000);
  assert.deepEqual([r.de, r.ate], ['2026-01', '2026-02']);
  assert.deepEqual(r.porMes[0], { comp: '2026-01', cartao: 0, fixo: 300, manual: 200, entrada: 9000, qtd: 3 });
  assert.deepEqual(r.conferencia.porFatura['Nubank_2026-02-13.csv'], { linhas: 2, total: 1500 });
  assert.deepEqual(r.conferencia.entradas, { linhas: 1, total: 9000 });
  assert.deepEqual(r.cartoes, { Nubank: 2, XP: 1 });
});
