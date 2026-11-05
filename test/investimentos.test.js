import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rendimentoDasSeries, seriesDoPatrimonio } from '../src/lib/patrimonio.js';
import {
  carteira, impostoGarantia, linhaMesAMes, liquidezDiaria, mesesDaGrade, ordenarCarteira, proximaOrdemCarteira, rotuloLiquidez,
  rotuloRende, vencimentoInfo,
} from '../src/lib/investimentos.js';

// Dados FICTÍCIOS. A conta "nu" tinha só as fotos dela até 05/11, quando os dois títulos foram cadastrados (a soma
// deles é a foto da conta nesse dia); a "xp" segue só com as fotos da conta.
const S = (conta_id, data, valor_centavos) => ({ conta_id, data, valor_centavos });
const V = (investimento_id, data, valor_centavos) => ({ investimento_id, data, valor_centavos });
const M = (investimento_id, conta_id, data, tipo, valor_centavos) => ({ investimento_id, conta_id, data, tipo, valor_centavos });
const saldos = [
  S('nu', '2026-09-30', 10000000), S('nu', '2026-10-27', 10100000), S('nu', '2026-11-05', 11150000),
  S('xp', '2026-10-31', 5000000), S('xp', '2026-11-30', 5040000),
];
const investimentos = [
  { id: 'cdb', conta_id: 'nu', nome: 'CDB X', tipo: 'cdb', ativo: true, aplicado_inicial_centavos: 6000000, liquidez: 'diaria', vencimento: null },
  { id: 'lci', conta_id: 'nu', nome: 'LCI Y', tipo: 'lci', ativo: true, aplicado_inicial_centavos: null, liquidez: 'vencimento', vencimento: '2027-08-15', aplicado_em: '2025-08-15' },
  { id: 'velho', conta_id: 'nu', nome: 'CDB antigo', tipo: 'cdb', ativo: false, liquidez: 'diaria' },
];
const valores = [
  V('cdb', '2026-11-05', 7000000), V('lci', '2026-11-05', 4150000),
  V('cdb', '2026-11-30', 7560000), V('lci', '2026-11-30', 4180000),
];
const movimentos = [
  M('cdb', 'nu', '2026-11-03', 'aporte', 1000000), // antes do cadastro: a foto da conta de 05/11 já o tinha
  M('cdb', 'nu', '2026-11-20', 'aporte', 500000),
  M('lci', 'nu', '2026-12-02', 'aporte', 100000), // depois da última foto
];
const meses = rendimentoDasSeries(seriesDoPatrimonio({ saldos, movimentos, investimentos, valores }), '2026-12');
const mes = (c) => meses.find((m) => m.competencia === c);

test('a conta vale pelas fotos dela até o primeiro título; depois, pela soma dos títulos', () => {
  assert.deepEqual(meses.map((m) => m.competencia), ['2026-09', '2026-10', '2026-11', '2026-12']);
  assert.equal(mes('2026-10').total, 10100000 + 5000000);
  assert.equal(mes('2026-10').porConta.nu.rendeu, 100000);
  // novembro: a conta ainda rende entre as fotos dela (27/10 → 05/11, com o aporte de 03/11), mas não entra no total
  assert.equal(mes('2026-11').porSerie['c:nu'].rendeu, 50000);
  assert.equal(mes('2026-11').porSerie['c:nu'].presente, false);
  assert.equal(mes('2026-11').total, 7560000 + 4180000 + 5040000);
});

test('o título rende já no mês do cadastro (a primeira foto contra a do fim do mês)', () => {
  const nov = mes('2026-11');
  assert.equal(nov.porSerie['i:cdb'].rendeu, 7560000 - 7000000 - 500000);
  assert.equal(nov.porSerie['i:cdb'].base, 7000000 + 250000);
  assert.equal(nov.porSerie['i:lci'].rendeu, 30000);
  assert.equal(nov.porConta.nu.rendeu, 50000 + 60000 + 30000);
  assert.equal(nov.porSerie['i:xp'], undefined);
  // o aplicado do CDB parte do "aplicado até hoje" do cadastro; o da LCI, da primeira foto
  assert.equal(nov.porSerie['i:cdb'].aportado, 6000000 + 500000);
  assert.equal(nov.porSerie['i:lci'].aportado, 4150000);
});

test('o aporte depois da última foto entra no valor e no aplicado, não no rendimento', () => {
  const dez = mes('2026-12');
  assert.equal(dez.porSerie['i:lci'].saldo, 4180000 + 100000);
  assert.equal(dez.porSerie['i:lci'].foto, 4180000);
  assert.equal(dez.porSerie['i:lci'].aportado, 4150000 + 100000);
  assert.equal(dez.porSerie['i:lci'].rendeu, null);
  assert.equal(dez.rendeu, null);
});

test('carteira: por conta, os títulos com vale, aplicado, rendeu e o % do ano; a conta sem título é uma linha só', () => {
  const contas = [{ id: 'nu', nome: 'Nubank' }, { id: 'xp', nome: 'XP' }];
  const [nu, xp] = carteira({ contas, investimentos, meses, hoje: '2026-12-10' });
  assert.deepEqual(nu.itens.map((x) => x.inv.id), ['cdb', 'lci']);
  assert.equal(nu.encerradosOcultos, 1);
  const cdb = nu.itens[0];
  assert.equal(cdb.vale, 7560000);
  assert.equal(cdb.aplicado, 6500000);
  assert.equal(cdb.rendeu, 1060000);
  assert.ok(Math.abs(cdb.pctAno - 60000 / 7250000) < 1e-12);
  assert.equal(cdb.diaria, true);
  assert.equal(nu.vale, 7560000 + 4280000);
  assert.equal(nu.rendeu, 1060000 + 30000);
  assert.equal(nu.itens[1].venc.meses, 8);
  assert.equal(xp.soConta, true);
  assert.equal(xp.vale, 5040000);
  assert.equal(xp.rendeu, 40000);
  // com os encerrados, o antigo aparece (sem valor nenhum)
  assert.equal(carteira({ contas, investimentos, meses, hoje: '2026-12-10', encerrados: true })[0].itens.length, 3);
});

test('ordenar dentro de cada conta: 1ª vez ordena, 2ª inverte, 3ª volta', () => {
  const contas = [{ id: 'nu', nome: 'Nubank' }];
  const g = carteira({ contas, investimentos, meses, hoje: '2026-12-10' });
  assert.deepEqual(ordenarCarteira(g, { col: 'vale', dir: 'asc' })[0].itens.map((x) => x.inv.id), ['lci', 'cdb']);
  assert.deepEqual(ordenarCarteira(g, { col: 'nome', dir: 'desc' })[0].itens.map((x) => x.inv.id), ['lci', 'cdb']);
  assert.deepEqual(proximaOrdemCarteira(null, 'vale'), { col: 'vale', dir: 'desc' });
  assert.deepEqual(proximaOrdemCarteira({ col: 'vale', dir: 'desc' }, 'vale'), { col: 'vale', dir: 'asc' });
  assert.equal(proximaOrdemCarteira({ col: 'vale', dir: 'asc' }, 'vale'), null);
  assert.deepEqual(proximaOrdemCarteira({ col: 'vale', dir: 'asc' }, 'nome'), { col: 'nome', dir: 'asc' });
});

test('mês a mês: o que rendeu em cada mês, o total, o % encadeado e a média pelos meses com dado', () => {
  const comps = mesesDaGrade(meses, '2026-12');
  assert.deepEqual(comps, ['2026-09', '2026-10', '2026-11', '2026-12']);
  const l = linhaMesAMes(meses, comps, (m) => m.porConta.nu);
  assert.equal(l.porMes['2026-09'], null);
  assert.equal(l.porMes['2026-10'].rendeu, 100000);
  assert.equal(l.total, 100000 + 140000);
  assert.equal(l.meses, 2);
  assert.equal(l.media, 120000);
  assert.ok(Math.abs(l.pct - ((1 + meses[1].porConta.nu.pct) * (1 + meses[2].porConta.nu.pct) - 1)) < 1e-12);
});

test('os rótulos do cadastro: o que rende, a liquidez, o imposto e o vencimento', () => {
  assert.equal(rotuloRende({ indexador: 'cdi_pct', taxa: 100 }), '100% do CDI');
  assert.equal(rotuloRende({ indexador: 'ipca_mais', taxa: '6.8' }), 'IPCA + 6,8%');
  assert.equal(rotuloRende({ indexador: 'prefixado', taxa: 13.2 }), '13,2% ao ano');
  assert.equal(rotuloRende({ indexador: null, taxa: null }), '');
  assert.equal(rotuloLiquidez({ liquidez: 'dias', liquidez_dias: 30 }), 'D+30');
  assert.equal(rotuloLiquidez({ liquidez: 'carencia', carencia_ate: '2027-03-01' }), 'carência até 03/2027');
  assert.equal(liquidezDiaria({ liquidez: 'carencia', carencia_ate: '2026-10-01' }, '2026-11-05'), true);
  assert.equal(liquidezDiaria({ liquidez: 'vencimento' }, '2026-11-05'), false);
  assert.equal(impostoGarantia('lci'), 'Isento de IR · FGC');
  assert.equal(impostoGarantia('tesouro_ipca'), 'IR regressivo · Tesouro Nacional');
  assert.equal(impostoGarantia('debenture'), 'IR regressivo · sem FGC');
  const v = vencimentoInfo('2027-11-05', '2026-11-05', '2025-11-05');
  assert.equal(v.meses, 12);
  assert.equal(v.perto, true);
  assert.ok(Math.abs(v.frac - 0.5) < 0.01);
  assert.equal(vencimentoInfo('2026-10-01', '2026-11-05').vencido, true);
  assert.equal(vencimentoInfo(null, '2026-11-05'), null);
});
