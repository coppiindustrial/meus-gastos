import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  andaSozinho, estimarValores, fatorDiario, fatorDoAporte, finsDeMes, inicioDoRendimento, movimentosForaDosValores, valoresComOMovimento,
} from '../src/lib/valorEstimado.js';
import { estimarImposto } from '../src/lib/impostoInvestimento.js';
import { pendentesDeValor } from '../src/lib/investimentos.js';

// Dados FICTÍCIOS. Os dias úteis de 01/09 a 05/11/2026 (sem feriados): o "CDI" é 0,05% ao dia até 16/09 e 0,04% depois.
const diasUteis = (de, ate) => {
  const out = [];
  for (let t = Date.UTC(+de.slice(0, 4), +de.slice(5, 7) - 1, +de.slice(8, 10)); ; t += 86400000) {
    const d = new Date(t).toISOString().slice(0, 10);
    if (d > ate) break;
    const s = new Date(t).getUTCDay();
    if (s !== 0 && s !== 6) out.push(d);
  }
  return out;
};
const cal = diasUteis('2026-09-01', '2026-11-05');
const taxas = { cdi: cal.map((d) => [d, d <= '2026-09-16' ? 0.0005 : 0.0004]), selic: [], ipca: {} };
const n1 = cal.filter((d) => d <= '2026-09-16').length;
const n2 = cal.length - n1;
const cdb = { id: 'cdb', tipo: 'cdb', indexador: 'cdi_pct', taxa: '100.0000', ativo: true };
const hoje = '2026-11-06';

test('o que anda sozinho: o que rende por uma taxa pública; preço de mercado e regra própria, não', () => {
  assert.equal(andaSozinho(cdb), true);
  assert.equal(andaSozinho({ tipo: 'tesouro_selic', indexador: 'selic_mais', taxa: '0.05' }), true);
  assert.equal(andaSozinho({ tipo: 'lci', indexador: 'prefixado', taxa: '11' }), true);
  assert.equal(andaSozinho({ tipo: 'tesouro_ipca', indexador: 'ipca_mais', taxa: '6' }), false);
  assert.equal(andaSozinho({ tipo: 'fundo', indexador: 'cdi_pct', taxa: '100' }), false);
  assert.equal(andaSozinho({ tipo: 'cdb', indexador: 'cdi_pct', taxa: null }), false); // sem o %: não sabe quanto rende
  assert.equal(andaSozinho({ tipo: 'cdb', indexador: '' }), false);
  assert.deepEqual(finsDeMes('2026-09-01', '2026-11-06'), ['2026-09-30', '2026-10-31']);
});

test('o valor anda dia útil a dia útil, e a taxa nova vale sobre o que já acumulou', () => {
  const valores = [{ investimento_id: 'cdb', data: '2026-09-01', valor_centavos: 1000000 }];
  const est = estimarValores({ investimentos: [cdb], valores, taxas, hoje });
  const ult = est.find((e) => e.ultimo);
  assert.equal(ult.data, '2026-11-06'); // o dia seguinte ao último publicado
  assert.equal(ult.ate, '2026-11-05');
  assert.equal(ult.dias, n1 + n2);
  assert.equal(ult.valor_centavos, Math.round(1000000 * 1.0005 ** n1 * 1.0004 ** n2));
  // o fim de cada mês também ganha a foto estimada (o mês a mês segue sem a foto real)
  const set = est.find((e) => e.data === '2026-09-30');
  const nSet = cal.filter((d) => d < '2026-09-30').length;
  assert.equal(set.valor_centavos, Math.round(1000000 * 1.0005 ** n1 * 1.0004 ** (nSet - n1)));
  assert.ok(est.find((e) => e.data === '2026-10-31'));
  // 102,5% do CDI rende mais
  const mais = estimarValores({ investimentos: [{ ...cdb, taxa: '102.5' }], valores, taxas, hoje }).find((e) => e.ultimo);
  assert.ok(mais.valor_centavos > ult.valor_centavos);
});

test('a aplicação no meio rende desde o dia dela; o resgate sai', () => {
  const valores = [{ investimento_id: 'cdb', data: '2026-09-01', valor_centavos: 1000000 }];
  const movimentos = [
    { investimento_id: 'cdb', data: '2026-10-05', tipo: 'aporte', valor_centavos: 500000 },
    { investimento_id: 'cdb', data: '2026-10-20', tipo: 'resgate', valor_centavos: 200000 },
  ];
  const ult = estimarValores({ investimentos: [cdb], valores, movimentos, taxas, hoje }).find((e) => e.ultimo);
  const f = (de, ate) => cal.filter((d) => d >= de && d < ate).reduce((x, d) => x * (1 + (d <= '2026-09-16' ? 0.0005 : 0.0004)), 1);
  const esperado = ((1000000 * f('2026-09-01', '2026-10-05') + 500000) * f('2026-10-05', '2026-10-20') - 200000) * f('2026-10-20', '2026-11-06');
  assert.ok(Math.abs(ult.valor_centavos - esperado) <= 1);
});

test('entre duas fotos reais: os fins de mês pelo caminho, ajustados para chegar na foto seguinte', () => {
  const f = 1.0005 ** n1 * 1.0004 ** cal.filter((d) => d > '2026-09-16' && d < '2026-11-02').length;
  const real = Math.round(1000000 * f * 1.001); // o banco mostrou 0,1% a mais que o caminho
  const valores = [
    { investimento_id: 'cdb', data: '2026-09-01', valor_centavos: 1000000 },
    { investimento_id: 'cdb', data: '2026-11-02', valor_centavos: real },
  ];
  const est = estimarValores({ investimentos: [cdb], valores, taxas, hoje });
  const out = est.find((e) => e.data === '2026-10-31');
  const caminho = 1000000 * 1.0005 ** n1 * 1.0004 ** cal.filter((d) => d > '2026-09-16' && d < '2026-10-31').length;
  assert.ok(out.valor_centavos > caminho && out.valor_centavos <= Math.round(caminho * 1.001) + 1); // levou o ajuste (pela fração dos dias)
  // depois da última foto real, a estimativa parte dela
  const ult = est.find((e) => e.ultimo);
  assert.equal(ult.base.data, '2026-11-02');
  assert.equal(ult.valor_centavos, Math.round(real * 1.0004 ** cal.filter((d) => d >= '2026-11-02').length));
});

test('sem a série, encerrado ou de preço de mercado: nada estimado; o fator do IR pelo dia', () => {
  const valores = [{ investimento_id: 'cdb', data: '2026-09-01', valor_centavos: 1000000 }];
  assert.deepEqual(estimarValores({ investimentos: [cdb], valores, taxas: null, hoje }), []);
  assert.deepEqual(estimarValores({ investimentos: [{ ...cdb, ativo: false }], valores, taxas, hoje }), []);
  assert.deepEqual(estimarValores({ investimentos: [{ ...cdb, tipo: 'tesouro_prefixado', indexador: 'prefixado', taxa: '12' }], valores, taxas, hoje }), []);
  // a foto de hoje, sem taxa publicada depois dela: nada a estimar
  assert.deepEqual(estimarValores({ investimentos: [cdb], valores: [{ investimento_id: 'cdb', data: '2026-11-06', valor_centavos: 1 }], taxas, hoje }), []);
  assert.ok(Math.abs(fatorDiario(cdb, '2026-09-01', '2026-11-06', taxas) - 1.0005 ** n1 * 1.0004 ** n2) < 1e-12);
  assert.equal(fatorDiario({ ...cdb, indexador: '' }, '2026-09-01', '2026-11-06', taxas), null);
  assert.equal(fatorDiario(cdb, '2026-08-01', '2026-11-06', taxas), null); // a série não cobre o começo
});

test('a conferência: o que anda sozinho pede a cada 3 meses; o de preço de mercado, todo mês', () => {
  const invs = [cdb, { id: 'fundo', tipo: 'fundo', ativo: true }];
  const valores = [{ investimento_id: 'cdb', data: '2026-09-01' }, { investimento_id: 'fundo', data: '2026-09-30' }];
  assert.deepEqual(pendentesDeValor({ investimentos: invs, valores, hoje: '2026-11-06' }).map((i) => i.id), ['fundo']);
  assert.deepEqual(pendentesDeValor({ investimentos: invs, valores, hoje: '2026-12-02' }).map((i) => i.id), ['cdb', 'fundo']);
  // a foto estimada não conta como conferida
  assert.deepEqual(pendentesDeValor({ investimentos: [cdb], valores: [...valores, { investimento_id: 'cdb', data: '2026-11-30', estimado: true }], hoje: '2026-12-02' }).map((i) => i.id), ['cdb']);
});

test('a aplicação lançada depois do valor e com a data antes dele: o valor não a tem, e ganha ela crescida pela taxa', () => {
  const valores = [{ id: 'f1', investimento_id: 'cdb', data: '2026-10-11', valor_centavos: 2200000, criado_em: '2026-11-06T19:48:01Z', atualizado_em: '2026-11-06T19:48:01Z' }];
  const movimentos = [
    { id: 'a1', investimento_id: 'cdb', data: '2026-10-11', tipo: 'aporte', valor_centavos: 2200000, criado_em: '2026-11-06T19:48:00Z' }, // o "Cadastrar e aplicar"
    { id: 'a2', investimento_id: 'cdb', data: '2026-09-01', tipo: 'aporte', valor_centavos: 480000, criado_em: '2026-11-06T20:51:16Z' }, // lançada depois, com a data antes
  ];
  const fora = movimentosForaDosValores({ valores, movimentos });
  assert.deepEqual(fora.map((f) => [f.mov.id, f.fotos.map((x) => x.id)]), [['a2', ['f1']]]);
  // somada: crescida pela taxa de cada dia de 01/09 até 11/10 (o CDI fictício)
  const [novo] = valoresComOMovimento({ mov: fora[0].mov, fotos: fora[0].fotos, inv: cdb, taxas });
  const f = cal.filter((d) => d >= '2026-09-01' && d < '2026-10-11').reduce((x, d) => x * (1 + (d <= '2026-09-16' ? 0.0005 : 0.0004)), 1);
  assert.equal(novo.valor_centavos, Math.round(2200000 + 480000 * f));
  // depois de corrigido (o valor mudou depois do lançamento), não aparece mais
  assert.deepEqual(movimentosForaDosValores({ valores: [{ ...valores[0], atualizado_em: '2026-11-06T21:00:00Z' }], movimentos }), []);
  // o resgate tira; o que não anda sozinho entra pelo valor puro
  assert.equal(valoresComOMovimento({ mov: { ...movimentos[1], tipo: 'resgate' }, fotos: valores, inv: { tipo: 'fundo' }, taxas }).at(0).valor_centavos, 2200000 - 480000);
});

test('o dia do banco: o aporte de sábado rende o CDI de sexta; no sábado, o de sexta já entrou (projetado)', () => {
  // 12/09/2026 e 07/11/2026 são sábados; o CDI fictício vai até 05/11 (uma quinta) — o de sexta 06/11 ainda não saiu
  assert.equal(inicioDoRendimento(cdb, '2026-09-12', taxas), '2026-09-11');
  assert.equal(inicioDoRendimento(cdb, '2026-09-14', taxas), '2026-09-14');
  assert.equal(inicioDoRendimento(cdb, '2026-11-07', taxas), '2026-11-06'); // depois do publicado: o dia de semana antes
  const taxaDe = (d) => (d <= '2026-09-16' ? 0.0005 : 0.0004);
  const dias = [...cal.filter((d) => d >= '2026-09-11'), '2026-11-06']; // 06/11 vai com a taxa de 05/11
  const esperado = dias.reduce((x, d) => x * (1 + taxaDe(d)), 1);
  assert.ok(Math.abs(fatorDoAporte(cdb, '2026-09-12', '2026-11-07', taxas) - esperado) < 1e-12);
  // na sexta (a noite), o CDI da sexta ainda não entrou: o valor do dia tem os dias úteis ANTES dele
  const naSexta = dias.slice(0, -1).reduce((x, d) => x * (1 + taxaDe(d)), 1);
  assert.ok(Math.abs(fatorDoAporte(cdb, '2026-09-12', '2026-11-06', taxas) - naSexta) < 1e-12);
  // o valor que anda de uma foto: no sábado, com a sexta projetada
  const ult = estimarValores({ investimentos: [cdb], valores: [{ investimento_id: 'cdb', data: '2026-09-01', valor_centavos: 1000000 }], taxas, hoje: '2026-11-07' }).find((e) => e.ultimo);
  assert.deepEqual([ult.data, ult.projetados, ult.dias], ['2026-11-07', 1, n1 + n2 + 1]);
  assert.equal(ult.valor_centavos, Math.round(1000000 * 1.0005 ** n1 * 1.0004 ** (n2 + 1)));
  // e no IR de cada aporte (sem o "vale" da carteira, o aporte não é ajustado)
  const r = estimarImposto({
    inv: { ...cdb, aplicado_inicial_centavos: null }, fotos: [{ data: '2026-09-12', valor_centavos: 1800000 }], taxas, hoje: '2026-11-07',
    movimentos: [{ id: 'm1', investimento_id: 'cdb', data: '2026-09-12', tipo: 'aporte', valor_centavos: 1800000 }],
  });
  assert.equal(r.lotes[0].ganho, Math.round(1800000 * (esperado - 1)));
});
