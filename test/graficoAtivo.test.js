import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  inicioDoPeriodo, velasDeFechamentos, agrupar, paraDesenho, escalaPreco, historicoDoPrecoMedio, precoMedioEm,
  marcasNoPeriodo, rotulosX, historicoQueFalta, dolarEm,
} from '../src/lib/graficoAtivo.js';

// dados FICTÍCIOS
const ativo = { id: 'a', moeda: 'USD' };
const op = (o) => ({ ativo_id: 'a', taxas_centavos: 0, ...o });

test('inicioDoPeriodo: meses para trás, o fim do mês curto e o ano', () => {
  assert.equal(inicioDoPeriodo('1M', '2026-11-13'), '2026-10-13');
  assert.equal(inicioDoPeriodo('6M', '2026-11-13'), '2026-05-13');
  assert.equal(inicioDoPeriodo('1A', '2026-11-13'), '2025-11-13');
  assert.equal(inicioDoPeriodo('1M', '2026-03-31'), '2026-02-28');
  assert.equal(inicioDoPeriodo('YTD', '2026-11-13'), '2026-01-01');
  assert.equal(inicioDoPeriodo('tudo', '2026-11-13'), null);
});

test('velasDeFechamentos: sem a abertura, a máxima e a mínima, a vela é o fechamento', () => {
  const v = velasDeFechamentos([{ data: '2026-11-12', preco: '10.5' }, { data: '2026-11-13', preco: 11, abertura: 10.8, maxima: 11.2, minima: 10.6, volume: 300 }]);
  assert.deepEqual(v[0], { d: '2026-11-12', o: 10.5, h: 10.5, l: 10.5, c: 10.5, v: null });
  assert.deepEqual(v[1], { d: '2026-11-13', o: 10.8, h: 11.2, l: 10.6, c: 11, v: 300 });
});

test('agrupar por semana: começa na segunda, abertura do primeiro e fechamento do último', () => {
  const dias = [
    { d: '2026-11-05', o: 1, h: 2, l: 0.5, c: 1.5, v: 1 }, // quinta
    { d: '2026-11-06', o: 1.5, h: 3, l: 1.4, c: 2, v: 2 }, // sexta
    { d: '2026-11-09', o: 2, h: 2.2, l: 1.8, c: 2.1, v: 3 }, // segunda: semana nova
  ];
  const s = agrupar(dias, 'semana');
  assert.equal(s.length, 2);
  assert.deepEqual(s[0], { d0: '2026-11-05', d: '2026-11-06', o: 1, h: 3, l: 0.5, c: 2, v: 3 });
  assert.equal(agrupar(dias, 'mes').length, 1);
});

test('paraDesenho: a linha com todos os dias; as velas semanais acima de 300 dias', () => {
  const dias = Array.from({ length: 320 }, (_, i) => {
    const d = new Date(Date.UTC(2025, 0, 1) + i * 86400000).toISOString().slice(0, 10);
    return { d, o: 1, h: 1, l: 1, c: 1, v: null };
  });
  assert.equal(paraDesenho(dias, 'linha').pontos.length, 320);
  const v = paraDesenho(dias, 'velas');
  assert.equal(v.grupo, 'semana');
  assert.ok(v.pontos.length < 50);
});

test('escalaPreco: números redondos em volta do preço, sem começar no zero', () => {
  const e = escalaPreco(612.4, 801.2);
  assert.ok(e.lo <= 612.4 && e.hi >= 801.2 && e.lo > 0);
  assert.deepEqual(e.marcas, [650, 700, 750, 800]);
  assert.equal(e.fracao(e.lo), 0);
  assert.equal(e.fracao(e.hi), 1);
  const f = escalaPreco(9.81, 10.12); // um FII parado
  assert.ok(f.passo < 1 && f.marcas.length >= 3);
});

test('historicoDoPrecoMedio: compra, venda pelo custo médio, desdobramento e a base de hoje', () => {
  const ops = [
    op({ id: 1, tipo: 'compra', data: '2026-03-10', quantidade: 2, valor_centavos: 100000, dolar: 5 }), // 2 a US$ 500
    op({ id: 2, tipo: 'compra', data: '2026-07-22', quantidade: 2, valor_centavos: 140000, dolar: 6 }), // 2 a US$ 700
    op({ id: 3, tipo: 'venda', data: '2026-09-15', quantidade: 1, valor_centavos: 80000, dolar: 5.5 }),
    op({ id: 4, tipo: 'desdobramento', data: '2026-10-01', fator: 2 }),
    op({ id: 5, tipo: 'provento', data: '2026-10-21', valor_centavos: 100 }),
  ];
  const h = historicoDoPrecoMedio(ativo, ops);
  assert.equal(h.length, 4); // o provento não muda o preço médio
  // antes do desdobramento, dividido por 2 (a base de cotas de hoje)
  assert.equal(h[0].pm, 250);
  assert.equal(h[1].pm, 300);
  assert.equal(h[1].pmReais, (100000 * 5 + 140000 * 6) / 4 / 100 / 2);
  assert.equal(h[2].pm, 300); // a venda não muda o preço médio
  assert.equal(h[2].qtd, 3);
  assert.equal(h[3].pm, 300);
  assert.equal(h[3].qtd, 6);
  assert.equal(precoMedioEm(h, '2026-03-09'), null);
  assert.equal(precoMedioEm(h, '2026-05-01'), 250);
  assert.equal(precoMedioEm(h, '2026-11-13'), 300);
});

test('historicoDoPrecoMedio: vendeu tudo, o degrau some', () => {
  const h = historicoDoPrecoMedio(ativo, [
    op({ id: 1, tipo: 'compra', data: '2026-01-05', quantidade: 1, valor_centavos: 1000, dolar: 5 }),
    op({ id: 2, tipo: 'venda', data: '2026-02-05', quantidade: 1, valor_centavos: 1200, dolar: 5 }),
  ]);
  assert.equal(precoMedioEm(h, '2026-03-01'), null);
});

test('marcasNoPeriodo: o dia sem pregão vai ao ponto seguinte; a semana contém o dia; o futuro fica de fora', () => {
  const pontos = [{ d0: '2026-11-05', d: '2026-11-06' }, { d0: '2026-11-09', d: '2026-11-13' }];
  const m = marcasNoPeriodo([
    { id: 1, data: '2026-11-06' }, { id: 2, data: '2026-11-07' }, { id: 3, data: '2026-11-11' },
    { id: 4, data: '2026-11-20' }, { id: 5, data: '2026-11-01' },
  ], pontos);
  assert.deepEqual(m.map((x) => [x.op.id, x.j]), [[1, 0], [2, 1], [3, 1]]);
});

test('rotulosX: a virada do mês, janeiro com o ano; no 5A, o ano', () => {
  const p = ['2025-12-30', '2025-12-31', '2026-01-02', '2026-01-05', '2026-02-02'].map((d) => ({ d, d0: d }));
  const muitos = [...Array(40)].map(() => ({ d: '2025-12-01', d0: '2025-12-01' })).concat(p);
  assert.deepEqual(rotulosX(muitos, '1A').map((x) => x.texto), ['jan 26', 'fev']);
  assert.deepEqual(rotulosX(muitos, '5A').map((x) => x.texto), ['2026']);
});

test('historicoQueFalta: quase nada guardado, o recente atrasado ou nada', () => {
  assert.equal(historicoQueFalta([], '2026-11-13'), 'inteiro');
  const linhas = Array.from({ length: 200 }, (_, i) => ({ data: new Date(Date.UTC(2026, 0, 1) + i * 86400000).toISOString().slice(0, 10) }));
  assert.equal(historicoQueFalta(linhas, '2026-11-13'), 'recente');
  assert.equal(historicoQueFalta(linhas, linhas[199].data), null);
});

test('dolarEm: o último até o dia', () => {
  const ptax = [['2026-11-10', 5.3], ['2026-11-11', 5.31], ['2026-11-13', 5.32]];
  assert.equal(dolarEm(ptax, '2026-11-12'), 5.31);
  assert.equal(dolarEm(ptax, '2026-11-13'), 5.32);
  assert.equal(dolarEm(ptax, '2026-11-01'), 5.3);
});

// ------------------------------------------------------------ a faixa de desempenho e os eventos
import {
  desempenho, eventosNoPeriodo, proximoResultado, ultimosResultados, resumoDosDividendos, cotasAntesDe, desdobramentosSemOperacao,
} from '../src/lib/graficoAtivo.js';

test('inicioDoPeriodo: a semana são 7 dias corridos', () => {
  assert.equal(inicioDoPeriodo('1S', '2026-11-13'), '2026-11-06');
});

test('desempenho: contra o último fechamento até o começo; o dia contra o anterior; o início contra a estreia', () => {
  const velas = [
    { d: '2025-11-12', c: 50 }, { d: '2026-10-13', c: 80 }, { d: '2026-11-05', c: 90 }, { d: '2026-11-12', c: 98 }, { d: '2026-11-13', c: 100 },
  ];
  const r = desempenho({ velas, preco: 100, anterior: 98, estreia: 2, hoje: '2026-11-13' });
  assert.equal(r['1D'], 100 / 98 - 1);
  assert.equal(r['1S'], 100 / 90 - 1); // o de 06/11 não existe: vale o de 05/11
  assert.equal(r['1M'], 100 / 80 - 1);
  assert.equal(r['1A'], 1); // 50 → 100
  assert.equal(r['5A'], null); // não há histórico até 2021
  assert.equal(r.tudo, 49);
  assert.equal(desempenho({ velas, hoje: '2026-11-13' }).tudo, null); // sem a estreia
});

const eventos = [
  { tipo: 'dividendo', data: '2026-09-29', valor: 0.15 },
  { tipo: 'resultado', data: '2026-09-23', hora: 'amc', valor: 33.42, estimado: 32.56, ano: 2026, trimestre: 4 },
  { tipo: 'resultado', data: '2026-09-30', hora: 'periodo', valor: 33.42, estimado: 32.56, ano: 2026, trimestre: 4 },
  { tipo: 'resultado', data: '2026-06-30', hora: 'periodo', valor: 25.11, estimado: 21.4, ano: 2026, trimestre: 3 },
  { tipo: 'resultado', data: '2026-12-15', hora: 'amc', valor: null, estimado: 39.37, ano: 2027, trimestre: 1 },
  { tipo: 'dividendo', data: '2025-09-29', valor: 0.115 },
  { tipo: 'estreia', data: '1984-06-01', valor: 0.94 },
];

test('eventosNoPeriodo: o fim do trimestre sem data não vai ao gráfico; o futuro também não', () => {
  const pontos = [{ d0: '2026-09-21', d: '2026-09-25' }, { d0: '2026-09-28', d: '2026-10-02' }];
  const m = eventosNoPeriodo(eventos, pontos);
  assert.deepEqual(m.map((x) => [x.ev.tipo, x.ev.data, x.j]), [['dividendo', '2026-09-29', 1], ['resultado', '2026-09-23', 0]]);
});

test('proximoResultado e ultimosResultados: um por trimestre, o com a data vale', () => {
  assert.equal(proximoResultado(eventos, '2026-11-13').data, '2026-12-15');
  const u = ultimosResultados(eventos);
  assert.deepEqual(u.map((x) => [x.trimestre, x.hora]), [[4, 'amc'], [3, 'periodo']]);
});

test('resumoDosDividendos: o último, os 12 meses e o rendimento', () => {
  const r = resumoDosDividendos(eventos, '2026-11-13', 100);
  assert.equal(r.ultimo.data, '2026-09-29');
  assert.equal(r.em12, 0.15); // o de 29/09/2025 já saiu dos 12 meses
  assert.equal(r.rendimento, 0.0015);
});

test('cotasAntesDe: quem tinha no fim do pregão anterior à data-ex', () => {
  const degraus = [{ d: '2026-03-10', qtd: 2 }, { d: '2026-09-29', qtd: 3 }];
  assert.equal(cotasAntesDe(degraus, '2026-09-29'), 2); // a compra no próprio dia não recebe
  assert.equal(cotasAntesDe(degraus, '2026-03-10'), 0);
  assert.equal(cotasAntesDe(degraus, '2026-10-01'), 3);
});

test('desdobramentosSemOperacao: o da empresa depois da primeira compra, sem o seu', () => {
  const ev = [{ tipo: 'desdobramento', data: '2026-06-10', valor: 2 }, { tipo: 'desdobramento', data: '2020-01-10', valor: 3 }];
  assert.equal(desdobramentosSemOperacao(ev, [{ tipo: 'compra', data: '2026-03-10' }]).length, 1);
  assert.equal(desdobramentosSemOperacao(ev, [{ tipo: 'compra', data: '2026-03-10' }, { tipo: 'desdobramento', data: '2026-06-12', fator: 2 }]).length, 0);
});
