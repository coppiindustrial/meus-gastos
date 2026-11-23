import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  categoriasFixasDoMes, celulaDoMes, comoVem, custoFixoDoAno, mediaDaCategoria, comoVemDoResumo, faixaDeMeses, parcelaDoMes, ultimos12Meses, parcelamentoDa, perfilDaCategoria, previstoDoMes, seriesPorCategoria, tabelaCategoriasFixas,
} from '../src/lib/categoriasFixas.js';
import { custoFixo, jaComprometido } from '../src/lib/visaoGeral.js';
import { addMeses } from '../src/lib/format.js';

// Valores fictícios. Hoje = nov/2026.
const HOJE = '2026-11';
const sp = (s) => s.replace(/\s/g, ' '); // o formatBRL usa o espaço que não quebra
const serie = (pares) => new Map(pares);
const mesesDe = (de, ate) => { const out = []; for (let c = de; c <= ate; c = addMeses(c, 1)) out.push(c); return out; };

test('perfil: o que aparece todo mês é "mensal", pela média dos últimos 6 meses', () => {
  const s = serie(mesesDe('2025-11', '2026-10').map((c, i) => [c, i < 6 ? 9000 : 10000]));
  const p = perfilDaCategoria(s, HOJE);
  assert.equal(p.tipo, 'mensal');
  assert.equal(p.valor, 10000);
  assert.equal(previstoDoMes(p, s, '2027-03', HOJE), 10000);
  assert.equal(sp(comoVem(p)), 'todo mês · R$ 100,00');
});

test('perfil: com 6 meses ou mais pode faltar um (a fatura que atrasou); faltando dois, é sazonal', () => {
  const um = serie(mesesDe('2025-11', '2026-10').filter((c) => c !== '2026-04').map((c) => [c, 5000]));
  assert.equal(perfilDaCategoria(um, HOJE).tipo, 'mensal');
  const dois = serie(mesesDe('2025-11', '2026-10').filter((c) => c !== '2026-04' && c !== '2026-05').map((c) => [c, 5000]));
  assert.equal(perfilDaCategoria(dois, HOJE).tipo, 'sazonal');
});

test('perfil: a assinatura nova (desde ago) já é mensal; a de um mês só, não', () => {
  const nova = serie([['2026-08', 12990], ['2026-09', 12990], ['2026-10', 12990]]);
  assert.equal(perfilDaCategoria(nova, HOJE).tipo, 'mensal');
  assert.equal(perfilDaCategoria(serie([['2026-10', 12990]]), HOJE).tipo, 'sazonal');
  assert.equal(perfilDaCategoria(serie([['2025-06', 500]]), HOJE).tipo, 'sem');
  assert.equal(comoVem({ tipo: 'sem' }), 'nada nos últimos 12 meses');
});

test('sazonal: o previsto é o mesmo mês do ano anterior já fechado (até dois anos)', () => {
  // o IPTU em fevereiro; o IPVA em três cotas
  const iptu = serie([['2025-02', 300000], ['2026-02', 318000]]);
  const p = perfilDaCategoria(iptu, HOJE);
  assert.equal(p.tipo, 'sazonal');
  assert.equal(sp(comoVem(p)), 'fev · R$ 3.180,00');
  assert.equal(previstoDoMes(p, iptu, '2027-02', HOJE), 318000);
  assert.equal(previstoDoMes(p, iptu, '2027-03', HOJE), 0);
  // dez/27: dez/26 ainda não fechou → dez/25
  const seguro = serie([['2025-12', 41230], ['2026-01', 41230]]);
  assert.equal(previstoDoMes(perfilDaCategoria(seguro, HOJE), seguro, '2027-12', HOJE), 41230);
});

test('faixaDeMeses: faixas, a que vira o ano e várias', () => {
  assert.equal(faixaDeMeses([1, 2, 3]), 'jan a mar');
  assert.equal(faixaDeMeses([2]), 'fev');
  assert.equal(faixaDeMeses([1, 2, 3, 4, 5, 6, 7, 10, 11, 12]), 'out a jul');
  assert.equal(faixaDeMeses([1, 6, 9]), 'jan, jun e set');
  assert.equal(faixaDeMeses([1, 3, 5, 7]), '4 meses');
});

test('célula: no passado só o real; de hoje em diante, o previsto some à medida que o real e as parcelas entram', () => {
  const s = serie([...mesesDe('2025-11', '2026-10').map((c) => [c, 9480]), ['2026-11', 3490]]);
  const perfil = perfilDaCategoria(s, HOJE);
  assert.deepEqual(celulaDoMes({ serie: s, perfil, comp: '2026-10', hoje: HOJE }), { real: 9480, parc: 0, prev: 0, previsto: 0, total: 9480 });
  // o mês em andamento: veio o Spotify, falta a Netflix
  assert.deepEqual(celulaDoMes({ serie: s, perfil, comp: HOJE, hoje: HOJE }), { real: 3490, parc: 0, prev: 5990, previsto: 9480, total: 9480 });
  // veio mais do que o previsto: o total é o real
  const mais = new Map(s); mais.set(HOJE, 12000);
  assert.equal(celulaDoMes({ serie: mais, perfil, comp: HOJE, hoje: HOJE }).total, 12000);
  // a parcela que já está numa fatura abate do previsto
  assert.deepEqual(celulaDoMes({ serie: s, perfil, parcelas: 4000, comp: '2027-01', hoje: HOJE }), { real: 0, parc: 4000, prev: 5480, previsto: 9480, total: 9480 });
});

const CATS = [
  { id: 'iptu', nome: 'IPTU', gasto_fixo: true, ativa: true, grupo_id: 'casa', grupo: { id: 'casa', nome: 'Casa', tipo: 'saida', cor: '#f97316' } },
  { id: 'alug', nome: 'Aluguel', gasto_fixo: false, ativa: true, grupo_id: 'casa', grupo: { id: 'casa', nome: 'Casa', tipo: 'saida', cor: '#f97316' } },
  { id: 'stream', nome: 'Streaming', gasto_fixo: true, ativa: true, grupo_id: 'ass', grupo: { id: 'ass', nome: 'Assinaturas', tipo: 'saida', cor: '#8b5cf6' } },
  { id: 'seguro', nome: 'Seguro do carro', gasto_fixo: true, ativa: true, grupo_id: 'carro', grupo: { id: 'carro', nome: 'Carro', tipo: 'saida', cor: '#3b82f6' } },
  { id: 'velha', nome: 'Velha', gasto_fixo: true, ativa: false, grupo_id: 'ass', grupo: { id: 'ass', nome: 'Assinaturas', tipo: 'saida', cor: '#8b5cf6' } },
];
const lanc = (categoria_id, competencia, valor_centavos, descricao = 'x') => ({ categoria_id, competencia, valor_centavos, descricao, origem: 'cartao' });
const LANCS = [
  lanc('iptu', '2026-02', 318000),
  ...mesesDe('2025-11', '2026-10').map((c) => lanc('stream', c, 9480)),
  lanc('stream', HOJE, 3490, 'SPOTIFY'),
  // o seguro: 10 parcelas de nov/25 a ago/26... e a renovação em out/26
  ...mesesDe('2025-12', '2026-07').map((c) => lanc('seguro', c, 41230)),
  lanc('seguro', '2026-10', 41230), lanc('seguro', '2026-11', 41230),
];
const PARCELAS = [{ categoria_id: 'seguro', competencia: '2026-12', valor_centavos: 41230, descricao: 'SEGURO 3/10', lancamento_id: 's' },
  { categoria_id: 'seguro', competencia: '2027-01', valor_centavos: 41230, descricao: 'SEGURO 4/10', lancamento_id: 's' },
  { categoria_id: 'outra', competencia: '2027-01', valor_centavos: 10000, descricao: 'TV 2/5', lancamento_id: 't' }];

test('tabela: as marcadas e ativas, agrupadas na ordem das categorias, com o real, a parcela e o previsto', () => {
  const t = tabelaCategoriasFixas({ categorias: CATS, lancamentos: LANCS, parcelas: PARCELAS, ano: 2026, hoje: HOJE });
  assert.deepEqual(t.grupos.map((g) => [g.nome, g.categorias.map((c) => c.cat.nome)]), [['Casa', ['IPTU']], ['Assinaturas', ['Streaming']], ['Carro', ['Seguro do carro']]]);
  const stream = t.grupos[1].categorias[0];
  assert.equal(stream.celulas[10].real, 3490);
  assert.equal(stream.celulas[10].prev, 5990);
  assert.equal(stream.celulas[10].itens[0].descricao, 'SPOTIFY');
  const seguro = t.grupos[2].categorias[0];
  assert.equal(seguro.perfil.tipo, 'sazonal'); // 10 meses de 12
  assert.equal(seguro.celulas[11].parc, 41230); // dez: a parcela que já está numa fatura
  assert.equal(seguro.celulas[11].prev, 0);
  assert.equal(t.totais[1], 318000 + 9480 + 41230);
  const t27 = tabelaCategoriasFixas({ categorias: CATS, lancamentos: LANCS, parcelas: PARCELAS, ano: 2027, hoje: HOJE });
  assert.equal(t27.grupos[0].categorias[0].celulas[1].prev, 318000); // o IPTU de fev/27
  assert.equal(t27.grupos[2].categorias[0].celulas[7].total, 0); // ago/27: o seguro não teve em ago/26
});

test('média: a que vem todo mês pelos meses fechados com gasto; a anual pelo ano ÷ 12', () => {
  const t = tabelaCategoriasFixas({ categorias: CATS, lancamentos: LANCS, parcelas: PARCELAS, ano: 2026, hoje: HOJE });
  const [iptu, stream, seguro] = t.grupos.map((g) => g.categorias[0]);
  assert.deepEqual([stream.media, stream.regra], [9480, '10 meses']); // jan a out; nov ainda não fechou
  assert.deepEqual([iptu.media, iptu.regra], [26500, 'ano ÷ 12']); // 3.180,00 em fev
  assert.equal(seguro.ano, 10 * 41230); // jan a jul, out, nov e a parcela de dez
  assert.equal(seguro.media, Math.round((10 * 41230) / 12));
  assert.equal(t.grupos[2].media, seguro.media);
  assert.equal(t.media, 26500 + 9480 + seguro.media); // a soma das médias
  // o ano que vem: a mensal sem mês fechado vai pelo previsto
  const t27 = tabelaCategoriasFixas({ categorias: CATS, lancamentos: LANCS, parcelas: PARCELAS, ano: 2027, hoje: HOJE });
  assert.deepEqual([t27.grupos[1].categorias[0].media, t27.grupos[1].categorias[0].regra], [9480, 'previsto']);
  assert.deepEqual(mediaDaCategoria({ perfil: { tipo: 'sem', valor: 0 }, celulas: [], ano: 0, hoje: HOJE }), { media: 0, regra: '' });
});

test('custo fixo do ano: os fixos à mão + as categorias, mês a mês, e a média é a soma das médias', () => {
  const comps = mesesDe('2026-01', '2026-12');
  const cel = (estado, valor) => ({ estado, valor, sugerido: valor });
  const matriz = {
    comps,
    totais: Object.fromEntries(comps.map((c) => [c, c < HOJE ? 50000 : c === HOJE ? 30000 : 0])),
    linhas: [
      { media: 30000, celulas: comps.map((c) => (c <= HOJE ? cel('lancado', 30000) : cel('futuro', 30000))) },
      // a que não teve em dez e ainda falta lançar em nov
      { media: 20000, celulas: comps.map((c) => (c < HOJE ? cel('lancado', 20000) : c === HOJE ? cel('pendente', 21000) : cel('pulado', 20000))) },
    ],
  };
  const tabela = tabelaCategoriasFixas({ categorias: CATS, lancamentos: LANCS, parcelas: PARCELAS, ano: 2026, hoje: HOJE });
  const { linhas } = custoFixoDoAno({ matriz, tabela, hoje: HOJE });
  const [mao, cats, total] = linhas;
  assert.deepEqual(mao.celulas[9], { conhecido: 50000, falta: 0 });
  assert.deepEqual(mao.celulas[10], { conhecido: 30000, falta: 21000 }); // nov: o pendente
  assert.deepEqual(mao.celulas[11], { conhecido: 0, falta: 30000 }); // dez: o futuro; o "não teve" fica de fora
  assert.equal(mao.media, 50000);
  assert.deepEqual(cats.celulas[10], { conhecido: 3490 + 41230, falta: 5990 }); // nov: o Spotify + o seguro; falta o resto do streaming
  assert.deepEqual(cats.celulas[11], { conhecido: 41230, falta: 9480 }); // dez: a parcela do seguro + o streaming previsto
  assert.equal(cats.media, tabela.media);
  assert.deepEqual(total.celulas[11], { conhecido: 41230, falta: 39480 });
  assert.equal(total.media, 50000 + tabela.media);
});

test('no mês (Visão geral): o total das categorias com a parte das parcelas à parte', () => {
  const linhas = LANCS.map((l) => ({ ...l, valor: l.valor_centavos }));
  const de = categoriasFixasDoMes({ categorias: CATS, linhas, parcelas: PARCELAS, hoje: HOJE });
  const jan = de('2027-01');
  assert.equal(jan.valor, 9480 + 41230);
  assert.equal(jan.parcelas, 41230);
  assert.equal(jan.qtd, 2);
  assert.equal(jan.porCategoria[0].nome, 'Seguro do carro');
});

const RESUMO = [
  ...mesesDe('2025-11', '2026-10').map((c) => ({ competencia: c, tipo: 'saida', origem: 'cartao', categoria_id: 'stream', total_centavos: 9480 })),
  { competencia: '2026-02', tipo: 'saida', origem: 'manual', categoria_id: 'iptu', total_centavos: 318000 },
  // o fixo lançado à mão numa categoria marcada NÃO entra na conta dela (já está nos fixos)
  ...mesesDe('2025-11', '2026-10').map((c) => ({ competencia: c, tipo: 'saida', origem: 'fixo', categoria_id: 'stream', total_centavos: 100000 })),
  ...mesesDe('2025-11', '2026-10').map((c) => ({ competencia: c, tipo: 'entrada', origem: 'entrada', categoria_id: 'sal', total_centavos: 1000000 })),
];

test('jaComprometido: soma o previsto das categorias fixas, sem a parte que já está nas parcelas', () => {
  const r = jaComprometido({ parcelas: PARCELAS, categorias: CATS, resumo: RESUMO, hoje: HOJE, minMeses: 4 });
  const jan = r.find((m) => m.competencia === '2027-01');
  assert.equal(jan.parcelas, 41230 + 10000);
  assert.equal(jan.categorias, 9480); // o streaming; o seguro já está nas parcelas
  assert.equal(jan.total, 41230 + 10000 + 9480);
  const fev = jaComprometido({ categorias: CATS, resumo: RESUMO, hoje: HOJE, minMeses: 4 }).find((m) => m.competencia === '2027-02');
  assert.equal(fev.categorias, 9480 + 318000);
  // sem categorias marcadas, nada muda
  assert.equal(jaComprometido({ parcelas: PARCELAS, resumo: RESUMO, hoje: HOJE })[0].categorias, 0);
});

test('custoFixo: os fixos à mão mais as categorias fixas (com as parcelas delas); o histórico soma as duas', () => {
  const r = custoFixo({ resumo: RESUMO, categorias: CATS, parcelas: PARCELAS, hoje: HOJE });
  assert.equal(r.competencia, '2026-12');
  assert.equal(r.categorias, 9480 + 41230);
  assert.equal(r.valor, 9480 + 41230);
  assert.equal(r.qtd, 2);
  assert.equal(r.historico.find((h) => h.competencia === '2026-02').valor, 100000 + 9480 + 318000);
  assert.equal(r.historico.find((h) => h.competencia === '2026-03').valor, 100000 + 9480);
  // sem a marca, só os fixos à mão
  assert.equal(custoFixo({ resumo: RESUMO, hoje: HOJE }).historico.find((h) => h.competencia === '2026-02').valor, 100000);
});

test('comoVemDoResumo: a frase de cada categoria; a que só tem fixo à mão diz isso', () => {
  const r = [...RESUMO, { competencia: '2026-05', tipo: 'saida', origem: 'fixo', categoria_id: 'alug', total_centavos: 280000 }];
  const como = comoVemDoResumo(r, HOJE);
  assert.equal(sp(como.get('stream')), 'todo mês · R$ 94,80');
  assert.equal(sp(como.get('iptu')), 'fev · R$ 3.180,00');
  assert.equal(como.get('alug'), 'só o fixo lançado à mão');
  assert.equal(como.has('sal'), false);
});

test('seriesPorCategoria: soma por mês, aceita os três nomes do valor', () => {
  const s = seriesPorCategoria([{ categoria_id: 'a', competencia: '2026-01-01', valor: 1 }, { categoria_id: 'a', competencia: '2026-01', valor_centavos: 2 },
    { categoria_id: 'a', competencia: '2026-02', total_centavos: '3' }, { categoria_id: null, competencia: '2026-01', valor: 9 }]);
  assert.deepEqual([...s.get('a')], [['2026-01', 3], ['2026-02', 3]]);
});

// ------------------------------------------------------------ a categoria parcelada (migration 034)
const SEGURO = [['2026-03', 28456], ...mesesDe('2026-04', '2026-09').map((c) => [c, 28463]), ['2026-10', 31745]];
const catSeguro = (extra = {}) => ({
  id: 'seg', nome: 'Seguro', gasto_fixo: true, ativa: true, grupo: { id: 'g', nome: 'Carro', cor: '#000', tipo: 'saida' },
  fixo_parcelas: 8, fixo_inicio: '2026-03-01', fixo_renova: true, ...extra,
});

test('parcelaDoMes: qual parcela cai no mês; com renova, o ciclo volta a cada 12 meses', () => {
  const p = parcelamentoDa(catSeguro());
  assert.deepEqual(p, { n: 8, inicio: '2026-03', fim: '2026-10', renova: true });
  assert.deepEqual(['2026-02', '2026-03', '2026-10', '2026-11', '2027-02', '2027-03', '2027-10'].map((c) => parcelaDoMes(p, c)), [0, 1, 8, 0, 0, 1, 8]);
  const sem = parcelamentoDa(catSeguro({ fixo_renova: false }));
  assert.equal(parcelaDoMes(sem, '2027-03'), 0);
  assert.equal(parcelamentoDa(catSeguro({ fixo_parcelas: null })), null);
  assert.equal(parcelamentoDa(catSeguro({ fixo_parcelas: 24 })).renova, false); // renovar só com até 12
});

test('perfil parcelado: a parcela é a média das que caíram; o previsto só nos meses do parcelamento', () => {
  assert.equal(perfilDaCategoria(serie(SEGURO), HOJE).tipo, 'mensal'); // sem dizer, o histórico acha que é todo mês
  const pf = perfilDaCategoria(serie(SEGURO), HOJE, catSeguro());
  assert.equal(pf.tipo, 'parcelado');
  assert.equal(pf.valor, Math.round((28456 + 28463 * 6 + 31745) / 8));
  assert.deepEqual(pf.meses, [3, 4, 5, 6, 7, 8, 9, 10]);
  assert.deepEqual(['2026-11', '2026-12', '2027-01', '2027-03', '2027-10'].map((c) => previstoDoMes(pf, serie(SEGURO), c, HOJE)), [0, 0, 0, pf.valor, pf.valor]);
  assert.equal(comoVem(pf), '8× · mar a out · renova');
  assert.equal(comoVem(perfilDaCategoria(serie(SEGURO), HOJE, catSeguro({ fixo_renova: false }))), '8× · mar/26 a out/26');
  // sem nenhuma parcela ainda: o valor do histórico
  assert.equal(perfilDaCategoria(serie([]), HOJE, catSeguro()).valor, 0);
});

test('tabela parcelada: a parcela de cada mês, nada previsto depois da última, a média é a parcela; 2027 renova', () => {
  const lancs = SEGURO.map(([c, v]) => lanc('seg', c, v));
  const t = tabelaCategoriasFixas({ categorias: [catSeguro()], lancamentos: lancs, ano: 2026, hoje: HOJE });
  const c = t.grupos[0].categorias[0];
  assert.deepEqual(c.celulas.map((x) => x.parcela), [0, 0, 1, 2, 3, 4, 5, 6, 7, 8, 0, 0]);
  assert.equal(c.celulas[10].total, 0);
  assert.equal(c.celulas[11].total, 0);
  assert.deepEqual([c.media, c.regra], [c.perfil.valor, 'parcela de 8×']);
  assert.equal(c.como, '8× · mar a out · renova');
  const t27 = tabelaCategoriasFixas({ categorias: [catSeguro()], lancamentos: lancs, ano: 2027, hoje: HOJE });
  const c27 = t27.grupos[0].categorias[0];
  assert.deepEqual(c27.celulas.map((x) => x.prev), [0, 0, ...Array(8).fill(c.perfil.valor), 0, 0]);
  assert.equal(c27.media, c.perfil.valor);
  // sem renovar, 2027 fica vazio e sem média
  const t27s = tabelaCategoriasFixas({ categorias: [catSeguro({ fixo_renova: false })], lancamentos: lancs, ano: 2027, hoje: HOJE });
  assert.deepEqual([t27s.grupos[0].categorias[0].ano, t27s.grupos[0].categorias[0].media], [0, 0]);
});

test('no mês (Visão geral): a parcelada não entra depois da última parcela', () => {
  const linhas = SEGURO.map(([c, v]) => ({ categoria_id: 'seg', competencia: `${c}-01`, total_centavos: v }));
  const doMes = categoriasFixasDoMes({ categorias: [catSeguro()], linhas, hoje: HOJE });
  assert.equal(doMes('2026-12').valor, 0);
  assert.ok(doMes('2027-03').valor > 0);
  // pelo histórico (sem dizer o parcelamento), dezembro levava a média dos últimos 6 meses
  assert.equal(categoriasFixasDoMes({ categorias: [catSeguro({ fixo_parcelas: null })], linhas, hoje: HOJE })('2026-12').valor, Math.round((28463 * 5 + 31745) / 6));
});

test('os últimos 12 meses do pop-up: parcela, prevista, faltou, fora e, sem parcelamento, só o gasto', () => {
  const serie = new Map([['2026-02', 5000], ['2026-03', 28872], ['2026-04', 28872], ['2026-06', 28872]]);
  const p = { n: 4, inicio: '2026-03', renova: false };
  const hoje = '2026-06';
  const f = ultimos12Meses(serie, '2026-07', p);
  assert.equal(f.length, 12);
  assert.equal(f[0].comp, '2025-08');
  assert.equal(f[11].comp, '2026-07');
  const de = (c) => f.find((x) => x.comp === c);
  assert.equal(de('2026-02').estado, 'fora');
  assert.deepEqual([de('2026-03').estado, de('2026-03').parcela], ['parcela', 1]);
  assert.equal(de('2026-05').estado, 'faltou');
  assert.equal(de('2026-06').estado, 'parcela');
  assert.equal(de('2026-07').estado, 'vazio'); // depois da 4ª
  // a parcela de hoje que ainda não caiu
  assert.equal(ultimos12Meses(new Map(), hoje, p).find((x) => x.comp === hoje).estado, 'prevista');
  // pelo histórico
  const h = ultimos12Meses(serie, '2026-07', null);
  assert.equal(h.find((x) => x.comp === '2026-03').estado, 'gasto');
  assert.equal(h.find((x) => x.comp === '2026-05').estado, 'vazio');
});

test('custo fixo por grupo: os fixos à mão e as categorias do mesmo grupo juntos, na ordem das Categorias', () => {
  const comps = mesesDe('2026-01', '2026-12');
  const cel = (estado, valor) => ({ estado, valor, sugerido: valor });
  const matriz = {
    comps,
    linhas: [
      { media: 30000, celulas: comps.map((c) => (c <= HOJE ? cel('lancado', 30000) : cel('futuro', 30000))) }, // Casa
      { media: 20000, celulas: comps.map((c) => (c <= HOJE ? cel('lancado', 20000) : cel('futuro', 20000))) }, // sem categoria
    ],
    grupos: [{ id: 'casa', nome: 'Casa', cor: '#f97316', de: 0, ate: 0 }, { id: 'sem', nome: 'Sem categoria', cor: '#9ca3af', de: 1, ate: 1 }],
  };
  const tabela = tabelaCategoriasFixas({ categorias: CATS, lancamentos: LANCS, parcelas: PARCELAS, ano: 2026, hoje: HOJE });
  const { grupos, linhas } = custoFixoDoAno({ matriz, tabela, hoje: HOJE, categorias: CATS });
  assert.deepEqual(grupos.map((g) => g.id), ['casa', 'ass', 'carro', 'sem']);
  const casa = grupos[0];
  assert.equal(casa.mao.media, 30000);
  assert.equal(casa.cats.media, tabela.grupos[0].media); // o IPTU
  assert.equal(casa.total.media, 30000 + tabela.grupos[0].media);
  assert.deepEqual(casa.total.celulas[1], { conhecido: 30000 + 318000, falta: 0 }); // fev: o fixo + o IPTU
  assert.equal(grupos[1].mao, null); // Assinaturas: só categoria fixa
  assert.equal(grupos[3].cats, null); // o sem categoria: só fixo à mão
  // os grupos somam o total
  const total = linhas[2];
  comps.forEach((_, i) => {
    const soma = grupos.reduce((s, g) => s + g.total.celulas[i].conhecido + g.total.celulas[i].falta, 0);
    assert.equal(soma, total.celulas[i].conhecido + total.celulas[i].falta);
  });
  assert.equal(grupos.reduce((s, g) => s + g.total.media, 0), total.media);
});
