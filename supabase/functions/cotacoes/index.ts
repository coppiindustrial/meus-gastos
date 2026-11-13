// Meus Gastos — a função COTACOES (13/11/2026, a renda variável; migration 027).
//
// Busca a cotação de cada ativo cadastrado em `rv_ativos` e grava a última em `rv_cotacoes` e o preço do dia em
// `rv_fechamentos` (gravado de novo a cada leitura: depois do pregão, ele É o fechamento; com a abertura, a máxima e a mínima
// do dia — migration 030). A B3 vem da brapi.dev, os EUA da
// Finnhub; as chaves ficam nos SEGREDOS do Supabase (BRAPI_TOKEN, FINNHUB_TOKEN), nunca no repositório (que é público).
//
// Quem chama:
//   · o AGENDAMENTO (pg_cron, migration 028), a cada 15 min no pregão, com o cabeçalho `x-segredo` = COTACOES_SEGREDO:
//     atualiza os ativos de todo mundo;
//   · o APP, com o login da pessoa (o cabeçalho Authorization do supabase-js): atualiza só os ativos dela.
//     { "acao": "consultar", "ticker": "MU", "mercado": "EUA" } não grava nada: devolve o nome e o preço (o cadastro do
//     ativo confere o ticker antes de salvar).
//     { "acao": "historico", "ativo_id": "…", "range": "10y" } busca o fechamento de cada dia no YAHOO FINANCE (não oficial,
//     sem chave: os dois mercados, anos de histórico) e grava em `rv_fechamentos`, com a abertura, a máxima, a mínima e o
//     volume (migration 030) — o gráfico do ativo pede na primeira vez e quando faltam dias.
//     { "acao": "intradia", "ativo_id": "…" } o pregão de hoje de 5 em 5 minutos, também do Yahoo, sem gravar (o "1D").
//     { "acao": "buscar", "q": "nvidia" } PROCURA pelo nome ou pelo ticker na busca do Yahoo (os dois mercados: as bolsas dos
//     EUA e a B3), para o cadastro achar o ativo sem saber a sigla; não grava nada.
//     { "acao": "avulso", "ticker": "NVDA", "mercado": "EUA" } o GRÁFICO DE UMA AÇÃO FORA DO CADASTRO (o seletor do painel), sem
//     gravar: os fechamentos de 10 anos, os dividendos, os desdobramentos e a estreia (Yahoo), os resultados (Finnhub, nos EUA)
//     e a cotação de agora. O "intradia" e o "mensal" também aceitam o ticker e o mercado no lugar do ativo_id.
//     { "acao": "mensal", "ativo_id": "…" } um ponto por mês desde a estreia na bolsa (o "Desde o início"), sem gravar.
//     { "acao": "eventos", "ativo_id": "…" } relê os EVENTOS (migration 031): os dividendos e desdobramentos do último ano
//     (Yahoo), a estreia e, nos EUA, os resultados da Finnhub (o calendário e as surpresas). O "historico" já faz isso junto.
// Publicar: Supabase → Edge Functions → Deploy a new function → "cotacoes", colar este arquivo, e DESLIGAR o "Verify JWT"
// (a função confere sozinha: o segredo do agendamento ou o login da pessoa).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-segredo',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const resposta = (corpo: unknown, status = 200) => new Response(JSON.stringify(corpo), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

type Cotacao = { preco: number; variacao_dia: number | null; abertura: number | null; maxima: number | null; minima: number | null; fechamento_anterior: number | null; cotado_em: string; fonte: string; nome?: string };
const ou = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v !== 0 ? v : null);

async function daBrapi(ticker: string): Promise<Cotacao | null> {
  const token = Deno.env.get('BRAPI_TOKEN');
  if (!token) throw new Error('falta o segredo BRAPI_TOKEN');
  const r = await fetch(`https://brapi.dev/api/quote/${encodeURIComponent(ticker)}?token=${token}`);
  if (!r.ok) return null;
  const q = (await r.json())?.results?.[0];
  const preco = ou(q?.regularMarketPrice);
  if (!preco) return null;
  const pct = ou(q.regularMarketChangePercent);
  return {
    preco, variacao_dia: pct === null ? null : pct / 100, abertura: ou(q.regularMarketOpen), maxima: ou(q.regularMarketDayHigh),
    minima: ou(q.regularMarketDayLow), fechamento_anterior: ou(q.regularMarketPreviousClose),
    cotado_em: q.regularMarketTime ? new Date(q.regularMarketTime).toISOString() : new Date().toISOString(), fonte: 'brapi',
    nome: q.longName || q.shortName || undefined,
  };
}

async function daFinnhub(ticker: string, comNome = false): Promise<Cotacao | null> {
  const token = Deno.env.get('FINNHUB_TOKEN');
  if (!token) throw new Error('falta o segredo FINNHUB_TOKEN');
  const r = await fetch(`https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(ticker)}&token=${token}`);
  if (!r.ok) return null;
  const q = await r.json();
  const preco = ou(q?.c);
  if (!preco) return null; // a Finnhub responde 0 para o ticker que não existe
  let nome: string | undefined;
  if (comNome) {
    const p = await fetch(`https://finnhub.io/api/v1/stock/profile2?symbol=${encodeURIComponent(ticker)}&token=${token}`);
    if (p.ok) nome = (await p.json())?.name || undefined;
  }
  return {
    preco, variacao_dia: ou(q.dp) === null ? null : q.dp / 100, abertura: ou(q.o), maxima: ou(q.h), minima: ou(q.l),
    fechamento_anterior: ou(q.pc), cotado_em: q.t ? new Date(q.t * 1000).toISOString() : new Date().toISOString(), fonte: 'finnhub', nome,
  };
}

// ------------------------------------------------------------ o Yahoo Finance (o histórico do gráfico do ativo)
// O endpoint do gráfico do Yahoo, o mesmo que o site deles usa. NÃO É OFICIAL: pode mudar ou recusar; aí a ação devolve
// { erro } e o app segue com o que já guardou. A B3 leva o ".SA" no ticker. Na mesma leitura vêm os DIVIDENDOS (a data-ex e
// o valor por ação) e os DESDOBRAMENTOS (o fator), que vão para `rv_eventos` (migration 031).
type Vela = { t: number; o: number | null; h: number | null; l: number | null; c: number; v: number | null };
type Evento = Record<string, unknown>;
async function doYahoo(ticker: string, mercado: string, range: string, intervalo: string, eventos = false) {
  const simbolo = mercado === 'EUA' ? ticker : `${ticker}.SA`;
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(simbolo)}?range=${range}&interval=${intervalo}&includePrePost=false${eventos ? '&events=div%7Csplit' : ''}`;
  const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', Accept: 'application/json' } });
  if (!r.ok) throw new Error(`o Yahoo respondeu ${r.status}`);
  const res = (await r.json())?.chart?.result?.[0];
  if (!res?.timestamp?.length) throw new Error('o Yahoo não tem histórico deste ticker');
  const q = res.indicators?.quote?.[0] ?? {};
  const velas: Vela[] = [];
  res.timestamp.forEach((t: number, i: number) => {
    const c = ou(q.close?.[i]);
    if (!c) return;
    velas.push({ t, o: ou(q.open?.[i]), h: ou(q.high?.[i]), l: ou(q.low?.[i]), c, v: typeof q.volume?.[i] === 'number' ? Math.round(q.volume[i]) : null });
  });
  const meta = res.meta ?? {};
  // o dia no fuso da bolsa
  const dia = (t: number) => new Date((t + Number(meta.gmtoffset ?? 0)) * 1000).toISOString().slice(0, 10);
  const divs = Object.values(res.events?.dividends ?? {})
    .map((x) => ({ data: dia((x as { date: number }).date), valor: Number((x as { amount: number }).amount) }))
    .filter((x) => x.valor > 0);
  const splits = Object.values(res.events?.splits ?? {})
    .map((x) => { const s = x as { date: number; numerator: number; denominator: number }; return { data: dia(s.date), valor: s.denominator ? s.numerator / s.denominator : 0 }; })
    .filter((x) => x.valor > 0 && x.valor !== 1);
  return { velas, meta, dia, divs, splits };
}
// grava os fechamentos; sem a migration 030 (as colunas das velas), grava só o preço
async function gravarFechamentos(admin: ReturnType<typeof createClient>, linhas: Record<string, unknown>[]) {
  for (let i = 0; i < linhas.length; i += 500) {
    const lote = linhas.slice(i, i + 500);
    let r = await admin.from('rv_fechamentos').upsert(lote, { onConflict: 'ativo_id,data' });
    if (r.error && /abertura|maxima|minima|volume|column/i.test(r.error.message)) {
      r = await admin.from('rv_fechamentos').upsert(lote.map(({ ativo_id, user_id, data, preco }) => ({ ativo_id, user_id, data, preco })), { onConflict: 'ativo_id,data' });
    }
    if (r.error) throw r.error;
  }
}
// grava os eventos; o RESULTADO um a um e sem os campos vazios: o calendário traz o esperado sem o divulgado, e o vazio não
// pode apagar o que as "surpresas" já tinham preenchido
async function gravarEventos(admin: ReturnType<typeof createClient>, linhas: Evento[]) {
  const inteiros = linhas.filter((l) => l.tipo !== 'resultado');
  for (let i = 0; i < inteiros.length; i += 500) {
    const r = await admin.from('rv_eventos').upsert(inteiros.slice(i, i + 500), { onConflict: 'ativo_id,tipo,data' });
    if (r.error) throw r.error;
  }
  for (const l of linhas.filter((x) => x.tipo === 'resultado')) {
    const limpo = Object.fromEntries(Object.entries(l).filter(([, v]) => v !== null && v !== undefined));
    const r = await admin.from('rv_eventos').upsert(limpo, { onConflict: 'ativo_id,tipo,data' });
    if (r.error) throw r.error;
  }
}
// OS RESULTADOS de uma ação dos EUA na Finnhub. O plano grátis (testado em 13/11/2026 com a MU): o CALENDÁRIO só traz os
// próximos (a data, 'bmo'/'amc', o lucro por ação e a receita esperados); as SURPRESAS, os 4 últimos trimestres (o divulgado
// e o esperado pelo ano e trimestre fiscal, sem a data). Então: grava o calendário e, nos guardados do mesmo ano e trimestre,
// o divulgado das surpresas. Devolve as surpresas (a tabela do painel mostra os trimestres de antes do app).
async function lerResultadosFinnhub(ticker: string) {
  const token = Deno.env.get('FINNHUB_TOKEN');
  if (!token) throw new Error('falta o segredo FINNHUB_TOKEN');
  const t = encodeURIComponent(ticker);
  const de = new Date(Date.now() - 120 * 86400000).toISOString().slice(0, 10);
  const ate = new Date(Date.now() + 200 * 86400000).toISOString().slice(0, 10);
  const ler = async (url: string) => { const r = await fetch(url); return r.ok ? r.json() : null; };
  const cal: Record<string, unknown>[] = (await ler(`https://finnhub.io/api/v1/calendar/earnings?symbol=${t}&from=${de}&to=${ate}&token=${token}`))?.earningsCalendar ?? [];
  const sur: Record<string, unknown>[] = (await ler(`https://finnhub.io/api/v1/stock/earnings?symbol=${t}&token=${token}`)) ?? [];
  const doCalendario = cal.filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(String(x.date ?? ''))).map((x) => ({
    tipo: 'resultado', data: x.date, hora: String(x.hour ?? ''),
    valor: ou(x.epsActual), estimado: ou(x.epsEstimate), receita: ou(x.revenueActual), receita_estimada: ou(x.revenueEstimate),
    ano: x.year ?? null, trimestre: x.quarter ?? null,
  }));
  return { doCalendario, sur: Array.isArray(sur) ? sur : [] };
}
// os resultados de uma ação FORA DO CADASTRO, sem gravar: o calendário e, no mesmo trimestre, o divulgado das surpresas; as
// surpresas que sobram com a data do fim do trimestre (`hora` 'periodo'), como as guardadas
function resultadosSemGravar(doCalendario: Evento[], sur: Record<string, unknown>[]) {
  const linhas = doCalendario.map((l) => ({ ...l }));
  for (const x of sur) {
    const l = linhas.find((g) => g.ano === x.year && g.trimestre === x.quarter);
    if (l) { if (ou(x.actual) !== null) { l.valor = ou(x.actual); l.estimado = ou(x.estimate) ?? l.estimado; } continue; }
    if (/^\d{4}-\d{2}-\d{2}$/.test(String(x.period ?? '')) && ou(x.actual) !== null) {
      linhas.push({ tipo: 'resultado', data: x.period, hora: 'periodo', valor: ou(x.actual), estimado: ou(x.estimate), ano: x.year ?? null, trimestre: x.quarter ?? null });
    }
  }
  return linhas;
}
async function resultadosDaFinnhub(admin: ReturnType<typeof createClient>, ativo: { id: string; user_id: string; ticker: string }) {
  const { doCalendario, sur } = await lerResultadosFinnhub(ativo.ticker);
  const linhas: Evento[] = doCalendario.map((l) => ({ ativo_id: ativo.id, user_id: ativo.user_id, ...l }));
  await gravarEventos(admin, linhas);
  if (Array.isArray(sur) && sur.length) {
    const { data: guardados } = await admin.from('rv_eventos').select('data, ano, trimestre, valor').eq('ativo_id', ativo.id).eq('tipo', 'resultado');
    for (const g of guardados ?? []) {
      const s = sur.find((x) => x.year === g.ano && x.quarter === g.trimestre);
      const divulgado = s ? ou(s.actual) : null;
      if (divulgado !== null && Number(g.valor) !== divulgado) {
        await admin.from('rv_eventos').update({ valor: divulgado, estimado: ou(s!.estimate) }).eq('ativo_id', ativo.id).eq('tipo', 'resultado').eq('data', g.data);
      }
    }
    // o trimestre que nenhum guardado pegou (os de antes do app): entra com a data do FIM DO TRIMESTRE e `hora` 'periodo' —
    // a data não é a da divulgação, então o gráfico não o marca; só a tabela dos últimos resultados o mostra
    const soltos = sur.filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(String(x.period ?? '')) && ou(x.actual) !== null
      && !(guardados ?? []).some((g) => g.ano === x.year && g.trimestre === x.quarter && g.data !== x.period));
    await gravarEventos(admin, soltos.map((x) => ({
      ativo_id: ativo.id, user_id: ativo.user_id, tipo: 'resultado', data: x.period, hora: 'periodo',
      valor: ou(x.actual), estimado: ou(x.estimate), ano: x.year ?? null, trimestre: x.quarter ?? null,
    })));
  }
  return (Array.isArray(sur) ? sur : []).map((x) => ({ ano: x.year, trimestre: x.quarter, periodo: x.period, valor: ou(x.actual), estimado: ou(x.estimate) }));
}
function eventosDoYahoo(ativo: { id: string; user_id: string }, divs: { data: string; valor: number }[], splits: { data: string; valor: number }[]): Evento[] {
  return [
    ...divs.map((x) => ({ ativo_id: ativo.id, user_id: ativo.user_id, tipo: 'dividendo', data: x.data, valor: x.valor })),
    ...splits.map((x) => ({ ativo_id: ativo.id, user_id: ativo.user_id, tipo: 'desdobramento', data: x.data, valor: x.valor })),
  ];
}

// A BUSCA DO CADASTRO (13/11/2026): a do Yahoo, pelo nome ou pelo ticker ("nvidia" → NVDA, "maxi renda" → MXRF11). Fica só o
// que o app cadastra — as bolsas dos EUA e a B3 (o ".SA"), ação ou ETF; sai o mercado fracionário e os outros sufixos da B3
// (PETR4F, MXRF11Q), os futuros e as outras bolsas. O TIPO é um palpite que o cadastro mostra e a pessoa troca: na B3, o
// "FII" no nome, o BDR pelo final (32 a 35, 39), o ETF pelo tipo ou pelo "índice" no nome; nos EUA, ação ou ETF.
const BOLSAS_EUA: Record<string, string> = { NMS: 'Nasdaq', NGM: 'Nasdaq', NCM: 'Nasdaq', NAS: 'Nasdaq', NYQ: 'NYSE', NYS: 'NYSE', ASE: 'NYSE American', PCX: 'NYSE Arca', BTS: 'Cboe' };
async function buscarNoYahoo(q: string) {
  const url = `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=16&newsCount=0&listsCount=0&lang=pt-BR&region=BR`;
  const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', Accept: 'application/json' } });
  if (!r.ok) throw new Error(`o Yahoo respondeu ${r.status}`);
  const quotes: Record<string, unknown>[] = (await r.json())?.quotes ?? [];
  const out: Record<string, unknown>[] = [];
  for (const x of quotes) {
    const simbolo = String(x.symbol ?? '');
    const tipoY = String(x.quoteType ?? '');
    if (tipoY !== 'EQUITY' && tipoY !== 'ETF') continue;
    const nome = String(x.longname || x.shortname || '').replace(/\s+/g, ' ').trim();
    if (x.exchange === 'SAO') {
      const ticker = simbolo.replace(/\.SA$/, '');
      if (!/^[A-Z]{4}\d{1,2}$/.test(ticker)) continue; // o fracionário (PETR4F) e os outros sufixos ficam de fora
      const fim = Number(ticker.slice(4));
      const tipo = /^FII\b|imobili/i.test(`${x.shortname ?? ''} ${nome}`) ? 'fii'
        : [32, 33, 34, 35, 39].includes(fim) ? 'bdr'
          : tipoY === 'ETF' || /índice|indice|\bETF\b/i.test(nome) ? 'etf_br' : 'acao_br';
      out.push({ ticker, nome, mercado: 'B3', tipo, bolsa: 'B3' });
    } else if (BOLSAS_EUA[String(x.exchange)] && /^[A-Z][A-Z.-]{0,9}$/.test(simbolo)) {
      out.push({ ticker: simbolo, nome, mercado: 'EUA', tipo: tipoY === 'ETF' ? 'etf_eua' : 'acao_eua', bolsa: BOLSAS_EUA[String(x.exchange)] });
    }
  }
  return out.slice(0, 10);
}

const buscar = (mercado: string, ticker: string, comNome = false) => (mercado === 'EUA' ? daFinnhub(ticker, comNome) : daBrapi(ticker));
// o dia do pregão, no fuso da bolsa (o fechamento de "hoje" para quem olha do Brasil à noite ainda é o de hoje lá)
const diaDoPregao = (iso: string, mercado: string) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: mercado === 'EUA' ? 'America/New_York' : 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso));

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });

  // quem chamou: o agendamento (o segredo) ou a pessoa (o login)
  let usuario: string | null = null;
  const segredo = Deno.env.get('COTACOES_SEGREDO');
  const doAgendamento = !!segredo && req.headers.get('x-segredo') === segredo;
  if (!doAgendamento) {
    const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
    const { data, error } = await admin.auth.getUser(jwt);
    if (error || !data?.user) return resposta({ erro: 'sem permissão' }, 401);
    usuario = data.user.id;
  }
  const corpo = await req.json().catch(() => ({}));

  try {
    if (corpo?.acao === 'consultar') {
      const ticker = String(corpo.ticker ?? '').trim().toUpperCase();
      const mercado = corpo.mercado === 'EUA' ? 'EUA' : 'B3';
      if (!ticker) return resposta({ erro: 'falta o ticker' }, 400);
      const c = await buscar(mercado, ticker, true);
      return resposta(c ? { ticker, mercado, nome: c.nome ?? '', preco: c.preco, variacao_dia: c.variacao_dia } : { ticker, mercado, naoAchou: true });
    }

    if (corpo?.acao === 'buscar') {
      if (!usuario) return resposta({ erro: 'só com o login' }, 401);
      const q = String(corpo.q ?? '').trim().slice(0, 60);
      if (q.length < 2) return resposta({ itens: [] });
      return resposta({ itens: await buscarNoYahoo(q) });
    }

    // UMA AÇÃO FORA DO CADASTRO: o ticker e o mercado no lugar do ativo_id; nada é gravado
    const deFora = !corpo?.ativo_id && corpo?.ticker && ['avulso', 'intradia', 'mensal'].includes(corpo?.acao);
    if (deFora) {
      if (!usuario) return resposta({ erro: 'só com o login' }, 401);
      const ticker = String(corpo.ticker).trim().toUpperCase().slice(0, 12);
      const mercado = corpo.mercado === 'EUA' ? 'EUA' : 'B3';
      if (corpo.acao === 'intradia') {
        const { velas, meta } = await doYahoo(ticker, mercado, '1d', '5m');
        const regular = meta.currentTradingPeriod?.regular ?? {};
        return resposta({ pontos: velas, anterior: ou(meta.chartPreviousClose) ?? ou(meta.previousClose), inicio: regular.start ?? null, fim: regular.end ?? null, fonte: 'yahoo' });
      }
      if (corpo.acao === 'mensal') {
        const { velas, dia } = await doYahoo(ticker, mercado, 'max', '1mo');
        return resposta({ pontos: velas.map((x) => ({ data: dia(x.t), preco: x.c, abertura: x.o, maxima: x.h, minima: x.l, volume: x.v })), fonte: 'yahoo' });
      }
      const [diario, mensal, cotacao, res] = await Promise.all([
        doYahoo(ticker, mercado, '10y', '1d', true),
        doYahoo(ticker, mercado, 'max', '1mo').catch(() => null),
        buscar(mercado, ticker, true).catch(() => null),
        mercado === 'EUA' ? lerResultadosFinnhub(ticker).catch(() => null) : Promise.resolve(null),
      ]);
      const porDia = new Map<string, Record<string, unknown>>();
      diario.velas.forEach((x) => { const data = diario.dia(x.t); porDia.set(data, { data, preco: x.c, abertura: x.o, maxima: x.h, minima: x.l, volume: x.v }); });
      const eventos: Evento[] = [
        ...diario.divs.map((x) => ({ tipo: 'dividendo', data: x.data, valor: x.valor, hora: '' })),
        ...diario.splits.map((x) => ({ tipo: 'desdobramento', data: x.data, valor: x.valor, hora: '' })),
        ...(mensal?.velas.length ? [{ tipo: 'estreia', data: mensal.dia(mensal.velas[0].t), valor: mensal.velas[0].c, hora: '' }] : []),
        ...(res ? resultadosSemGravar(res.doCalendario, res.sur) : []),
      ];
      const { nome: nomeFonte, ...c } = cotacao ?? ({} as Cotacao);
      return resposta({
        ticker, mercado, nome: nomeFonte || String(diario.meta.longName || diario.meta.shortName || ''),
        fechamentos: [...porDia.values()], eventos, cotacao: cotacao ? c : null, fonte: 'yahoo',
      });
    }

    if (['historico', 'intradia', 'mensal', 'eventos'].includes(corpo?.acao)) {
      if (!usuario) return resposta({ erro: 'só com o login' }, 401);
      const { data: ativo, error: e1 } = await admin.from('rv_ativos').select('id, user_id, ticker, mercado').eq('id', String(corpo.ativo_id ?? '')).eq('user_id', usuario).maybeSingle();
      if (e1) throw e1;
      if (!ativo) return resposta({ erro: 'ativo não encontrado' }, 404);
      if (corpo.acao === 'intradia') {
        const { velas, meta } = await doYahoo(ativo.ticker, ativo.mercado, '1d', '5m');
        const regular = meta.currentTradingPeriod?.regular ?? {};
        return resposta({ pontos: velas, anterior: ou(meta.chartPreviousClose) ?? ou(meta.previousClose), inicio: regular.start ?? null, fim: regular.end ?? null, fonte: 'yahoo' });
      }
      if (corpo.acao === 'mensal') { // o "Desde o início": um ponto por mês desde a estreia, sem gravar
        const { velas, dia } = await doYahoo(ativo.ticker, ativo.mercado, 'max', '1mo');
        return resposta({ pontos: velas.map((x) => ({ data: dia(x.t), preco: x.c, abertura: x.o, maxima: x.h, minima: x.l, volume: x.v })), fonte: 'yahoo' });
      }
      // OS EVENTOS: os dividendos e os desdobramentos (Yahoo), a estreia e, nos EUA, os resultados (Finnhub); sem a 031, avisa
      const atualizarEventos = async (divs: { data: string; valor: number }[], splits: { data: string; valor: number }[]) => {
        try {
          const linhas = eventosDoYahoo(ativo, divs, splits);
          const m = await doYahoo(ativo.ticker, ativo.mercado, 'max', '1mo').catch(() => null);
          if (m?.velas.length) linhas.push({ ativo_id: ativo.id, user_id: ativo.user_id, tipo: 'estreia', data: m.dia(m.velas[0].t), valor: m.velas[0].c });
          await gravarEventos(admin, linhas);
          const surpresas = ativo.mercado === 'EUA' ? await resultadosDaFinnhub(admin, ativo).catch(() => []) : [];
          return { eventos: linhas.length, surpresas };
        } catch (e) {
          const m = String((e as Error)?.message ?? e);
          return { erroEventos: /rv_eventos|does not exist|schema cache/i.test(m) ? 'falta a migration 031' : m };
        }
      };
      if (corpo.acao === 'eventos') { // a releitura de cada dia: o último ano do Yahoo e os resultados
        const y = await doYahoo(ativo.ticker, ativo.mercado, '1y', '1d', true);
        return resposta(await atualizarEventos(y.divs, y.splits));
      }
      const range = ['1mo', '3mo', '1y', '5y', '10y', 'max'].includes(corpo.range) ? corpo.range : '10y';
      const { velas, dia, divs, splits } = await doYahoo(ativo.ticker, ativo.mercado, range, '1d', true);
      const porDia = new Map<string, Record<string, unknown>>();
      velas.forEach((x) => {
        const data = dia(x.t);
        porDia.set(data, { ativo_id: ativo.id, user_id: ativo.user_id, data, preco: x.c, abertura: x.o, maxima: x.h, minima: x.l, volume: x.v });
      });
      const linhas = [...porDia.values()];
      await gravarFechamentos(admin, linhas);
      const ev = await atualizarEventos(divs, splits);
      return resposta({ gravados: linhas.length, de: linhas[0]?.data ?? null, ate: linhas[linhas.length - 1]?.data ?? null, fonte: 'yahoo', ...ev });
    }

    let consulta = admin.from('rv_ativos').select('id, user_id, ticker, mercado').eq('ativo', true);
    if (usuario) consulta = consulta.eq('user_id', usuario);
    const { data: ativos, error } = await consulta;
    if (error) throw error;

    // um pedido por ticker, mesmo que dois cadastros tenham o mesmo
    const unicos = new Map<string, { ticker: string; mercado: string }>();
    (ativos ?? []).forEach((a) => unicos.set(`${a.mercado}:${a.ticker}`, { ticker: a.ticker, mercado: a.mercado }));
    const lidos = new Map<string, Cotacao | null>();
    for (const [chave, a] of unicos) {
      try { lidos.set(chave, await buscar(a.mercado, a.ticker)); } catch (e) { lidos.set(chave, null); console.error(chave, String(e)); }
    }

    const cotacoes = []; const fechamentos = []; const falharam: string[] = [];
    for (const a of ativos ?? []) {
      const c = lidos.get(`${a.mercado}:${a.ticker}`);
      if (!c) { falharam.push(a.ticker); continue; }
      const { nome: _nome, ...linha } = c;
      cotacoes.push({ ativo_id: a.id, user_id: a.user_id, ...linha });
      fechamentos.push({ ativo_id: a.id, user_id: a.user_id, data: diaDoPregao(c.cotado_em, a.mercado), preco: c.preco, abertura: c.abertura, maxima: c.maxima, minima: c.minima });
    }
    if (cotacoes.length) {
      const r1 = await admin.from('rv_cotacoes').upsert(cotacoes, { onConflict: 'ativo_id' });
      if (r1.error) throw r1.error;
      await gravarFechamentos(admin, fechamentos);
    }
    return resposta({ atualizados: cotacoes.length, falharam });
  } catch (e) {
    return resposta({ erro: String((e as Error)?.message ?? e) }, 500);
  }
});
