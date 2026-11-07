import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aliquotaIOF, aliquotaIR, estimarImposto, fatorDeCrescimento, lerDepositos, proximaQueda } from '../src/lib/impostoInvestimento.js';
import { parseValor } from '../src/lib/dinheiro.js';

// Dados FICTÍCIOS. O CDI de 1% em todo mês, um título de 100% do CDI.
const cdi = Object.fromEntries(['2024-10', '2024-11', '2024-12', '2025-01', '2025-02', '2025-03', '2025-04', '2025-05', '2025-06', '2025-07', '2025-08', '2025-09',
  '2025-10', '2025-11', '2025-12', '2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10'].map((c) => [c, 0.01]));
const inv = { id: 'rdb', tipo: 'rdb', indexador: 'cdi_pct', taxa: 100, aplicado_inicial_centavos: 1000000, aplicado_em: null };
const hoje = '2026-11-06';

test('as tabelas: a alíquota pela idade, o IOF dos 30 dias e quando a alíquota cai', () => {
  assert.equal(aliquotaIR(180), 0.225);
  assert.equal(aliquotaIR(181), 0.2);
  assert.equal(aliquotaIR(720), 0.175);
  assert.equal(aliquotaIR(721), 0.15);
  assert.equal(aliquotaIOF(1), 0.96);
  assert.equal(aliquotaIOF(29), 0.03);
  assert.equal(aliquotaIOF(30), 0);
  assert.deepEqual(proximaQueda('2026-07-07', hoje), { data: '2027-01-04', aliquota: 0.2 });
  assert.deepEqual(proximaQueda('2024-12-06', hoje), { data: '2026-11-27', aliquota: 0.15 });
  assert.equal(proximaQueda('2023-01-01', hoje), null);
});

test('o crescimento pelo CDI: os meses inteiros e a fração das pontas', () => {
  const f = fatorDeCrescimento('2026-01-01', '2026-04-01', { cdi, inv, hoje });
  assert.ok(Math.abs(f - 1.01 ** 3) < 1e-9);
  assert.equal(fatorDeCrescimento('2026-05-01', '2026-05-01', { cdi, inv, hoje }), 1);
  // 120% do CDI rende mais
  assert.ok(fatorDeCrescimento('2026-01-01', '2026-04-01', { cdi, inv: { ...inv, taxa: 120 }, hoje }) > f);
});

test('os depósitos colados: cada um com a sua alíquota, e a soma fecha com o que o banco mostra', () => {
  const depositos = [
    { data: '2024-12-06', valor_centavos: 600000, referencia: '2026-11-05' }, // ~2 anos: 17,5%
    { data: '2026-09-05', valor_centavos: 500000, referencia: '2026-11-05' }, // ~2 meses: 22,5%
  ];
  const r = estimarImposto({ inv: { ...inv, aplicado_inicial_centavos: 1000000 }, fotos: [{ data: '2026-11-05', valor_centavos: 1100000 }], depositos, cdi, hoje, vale: 1100000, aplicado: 1000000 });
  assert.equal(r.lotes.length, 2);
  assert.equal(r.lotes[0].data, '2026-09-05'); // do mais novo ao mais antigo
  assert.equal(r.lotes[0].aliquota, 0.225);
  assert.equal(r.lotes[1].aliquota, 0.175);
  assert.ok(Math.abs(r.lotes.reduce((s, l) => s + l.vale, 0) - 1100000) <= 2);
  assert.ok(Math.abs(r.ganho - 100000) <= 2);
  assert.ok(r.lotes[1].ganho > r.lotes[0].ganho); // o antigo rendeu mais
  assert.ok(Math.abs(r.ir - (r.lotes[0].ir + r.lotes[1].ir)) <= 1);
  assert.equal(r.liquido, 1100000 - r.ir - r.iof);
  assert.equal(r.proximaQueda.deposito, '2024-12-06');
  assert.equal(r.proximaQueda.para, 0.15);
});

test('isento, fundo e a aplicação feita pelo app (com o resgate saindo do mais antigo)', () => {
  const fotos = [{ data: '2026-01-10', valor_centavos: 1000000 }];
  const lci = estimarImposto({ inv: { ...inv, tipo: 'lci' }, fotos, cdi, hoje, vale: 1080000, aplicado: 1000000 });
  assert.equal(lci.ir, 0);
  assert.equal(lci.liquido, 1080000);
  assert.equal(lci.isento, true);
  const fundo = estimarImposto({ inv: { ...inv, tipo: 'fundo' }, fotos, cdi, hoje, vale: 1080000, aplicado: 1000000 });
  assert.equal(fundo.semEstimativa, true);
  assert.equal(fundo.liquido, null);
  const movimentos = [
    { investimento_id: 'rdb', data: '2026-10-20', tipo: 'aporte', valor_centavos: 200000 },
    { investimento_id: 'rdb', data: '2026-10-25', tipo: 'resgate', valor_centavos: 300000 },
  ];
  const r = estimarImposto({ inv: { ...inv, aplicado_em: '2026-01-10' }, fotos, movimentos, cdi, hoje, vale: 990000, aplicado: 900000 });
  assert.deepEqual(r.lotes.map((l) => l.origem), ['aporte', 'inicial']);
  assert.ok(r.lotes[0].iof === 0 || r.lotes[0].dias < 30); // a de 20/10 tem 17 dias: paga IOF sobre o pouco que rendeu
  assert.ok(r.lotes[0].iof > 0);
});

test('sem a data da aplicação nem a lista de depósitos, o IR não se estima (não é zero)', () => {
  const r = estimarImposto({ inv: { ...inv, aplicado_em: null }, fotos: [{ data: '2026-11-05', valor_centavos: 1100000 }], cdi, hoje, vale: 1100000, aplicado: 1000000 });
  assert.equal(r.semDatas, true);
  assert.equal(r.ir, null);
  assert.equal(r.liquido, null);
  // com a data da aplicação, estima
  const c = estimarImposto({ inv: { ...inv, aplicado_em: '2025-03-01' }, fotos: [{ data: '2026-11-05', valor_centavos: 1100000 }], cdi, hoje, vale: 1100000, aplicado: 1000000 });
  assert.equal(c.semDatas, false);
  assert.ok(Math.abs(c.ir - 100000 * 0.175) <= 1);
});

test('a lista colada do banco: "Feito em 05 SET 2026 R$ 4.165,28", com a data e o valor em linhas separadas ou juntas', () => {
  const texto = 'Feito em\n05 SET 2026\nR$ 4.165,28\nFeito em 04 SET 2026  R$ 17.204,90\n06/12/2024 387,21\n2025-01-07 R$ 8.128,21';
  const { itens } = lerDepositos(texto, parseValor);
  assert.deepEqual(itens, [
    { data: '2026-09-05', valor_centavos: 416528 },
    { data: '2026-09-04', valor_centavos: 1720490 },
    { data: '2024-12-06', valor_centavos: 38721 },
    { data: '2025-01-07', valor_centavos: 812821 },
  ]);
  assert.equal(lerDepositos('nada aqui', parseValor).itens.length, 0);
});

test('o investimento feito pelo app: a aplicação do dia da primeira foto é o depósito (com a data), não "faltam as datas"', () => {
  // o "Cadastrar e aplicar": a foto e a aplicação no mesmo dia, sem "valor aplicado" nem "data da aplicação" no cadastro
  const novo = { ...inv, aplicado_inicial_centavos: null, aplicado_em: null };
  const fotos = [{ data: '2026-10-11', valor_centavos: 2200000 }];
  const movimentos = [{ investimento_id: 'rdb', data: '2026-10-11', tipo: 'aporte', valor_centavos: 2200000 }];
  const r = estimarImposto({ inv: novo, fotos, movimentos, cdi, hoje, vale: 2219551, aplicado: 2200000 });
  assert.equal(r.semDatas, false);
  assert.equal(r.lotes.length, 1);
  assert.equal(r.lotes[0].origem, 'aporte');
  assert.equal(r.lotes[0].data, '2026-10-11');
  assert.ok(r.iof > 0); // 26 dias: ainda paga o IOF
  assert.ok(Math.abs(r.ir - (19551 - r.iof) * 0.225) <= 1);
  // sem a aplicação no app, o mesmo cadastro continua sem as datas
  assert.equal(estimarImposto({ inv: novo, fotos, movimentos: [], cdi, hoje, vale: 2219551, aplicado: 2200000 }).semDatas, true);
});

test('sem o "valor aplicado", as aplicações até a primeira foto são o aplicado: o que a foto tem a mais é rendimento', () => {
  const novo = { ...inv, aplicado_inicial_centavos: null, aplicado_em: null };
  // a foto de 11/10 já com a aplicação de 01/06 crescida (27.000), as duas aplicações somam 26.800
  const fotos = [{ data: '2026-10-11', valor_centavos: 2700000 }];
  const movimentos = [
    { investimento_id: 'rdb', data: '2026-06-01', tipo: 'aporte', valor_centavos: 480000 },
    { investimento_id: 'rdb', data: '2026-10-11', tipo: 'aporte', valor_centavos: 2200000 },
  ];
  const r = estimarImposto({ inv: novo, fotos, movimentos, cdi, hoje, vale: 2720000, aplicado: 2680000 });
  assert.equal(r.semDatas, false);
  assert.deepEqual(r.lotes.map((l) => [l.data, l.origem]), [['2026-10-11', 'aporte'], ['2026-06-01', 'aporte']]);
  assert.ok(Math.abs(r.lotes.reduce((s, l) => s + l.depositado, 0) - 2680000) <= 2); // o depositado de cada um fecha com o aplicado
});

test('o aporte com os dois números do banco fica exato; os outros levam a diferença', () => {
  // dados FICTÍCIOS: o de 2024 com o Valor Bruto e o Rendimento bruto do banco, o de 2025 só com o valor
  const depositos = [
    { id: 'a', data: '2024-12-05', valor_centavos: 1426501, referencia: hoje, rendimento_centavos: 434868 },
    { id: 'b', data: '2025-05-07', valor_centavos: 50433, referencia: hoje },
  ];
  const r = estimarImposto({ inv: { ...inv, aplicado_inicial_centavos: null }, fotos: [{ data: hoje, valor_centavos: 1476934 }], depositos, cdi, hoje, vale: 1476934, aplicado: 1035000 });
  const a = r.lotes.find((l) => l.data === '2024-12-05');
  assert.deepEqual([a.vale, a.depositado, a.ganho, a.aliquota], [1426501, 991633, 434868, 0.175]); // como o banco disse
  assert.equal(a.fonte.principal, 991633);
  assert.equal(a.ir, Math.round(434868 * 0.175));
  const b = r.lotes.find((l) => l.data === '2025-05-07');
  assert.equal(b.vale, 1476934 - 1426501); // o valor de hoje do banco
  assert.equal(b.ganho, 1476934 - 1035000 - 434868); // o resto do rendimento
  // o valor do banco de HOJE não é reajustado, mesmo que o título valha outra coisa: só o rendimento leva a diferença
  const r2 = estimarImposto({ inv: { ...inv, aplicado_inicial_centavos: null }, fotos: [{ data: hoje, valor_centavos: 1500000 }], depositos, cdi, hoje, vale: 1500000, aplicado: 1035000 });
  assert.equal(r2.lotes.find((l) => l.data === '2025-05-07').vale, 50433);
  assert.equal(r2.lotes.find((l) => l.data === '2024-12-05').vale, 1426501);
});

test('com os números do banco de hoje, o aporte de hoje pelo app entra; o resgate de antes da referência, não', () => {
  // dados FICTÍCIOS: a lista com a referência de hoje (os números do banco digitados hoje) e um aporte de hoje pelo app
  const depositos = [{ id: 'a', data: '2024-12-05', valor_centavos: 1426501, referencia: hoje, rendimento_centavos: 434868 }];
  const movimentos = [
    { id: 'm1', investimento_id: inv.id, data: hoje, tipo: 'aporte', valor_centavos: 2700000 },
    { id: 'm2', investimento_id: inv.id, data: '2026-10-01', tipo: 'resgate', valor_centavos: 100000 },
  ];
  const vale = 1426501 + 2700000;
  const r = estimarImposto({ inv: { ...inv, aplicado_inicial_centavos: null }, fotos: [{ data: hoje, valor_centavos: vale }], movimentos, depositos, cdi, hoje, vale, aplicado: 991633 + 2700000 });
  assert.deepEqual(r.lotes.map((l) => [l.data, l.origem]), [[hoje, 'aporte'], ['2024-12-05', 'colado']]);
  assert.deepEqual([r.lotes[0].depositado, r.lotes[0].vale], [2700000, 2700000]);
  assert.equal(r.lotes[1].vale, 1426501); // o resgate de antes da referência já está nos números do banco
});
