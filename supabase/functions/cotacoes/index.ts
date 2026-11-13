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
// { erro } e o app segue com o que já guardou. A B3 leva o ".SA" no ticker.
type Vela = { t: number; o: number | null; h: number | null; l: number | null; c: number; v: number | null };
async function doYahoo(ticker: string, mercado: string, range: string, intervalo: string) {
  const simbolo = mercado === 'EUA' ? ticker : `${ticker}.SA`;
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(simbolo)}?range=${range}&interval=${intervalo}&includePrePost=false`;
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
  return { velas, meta: res.meta ?? {} };
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

    if (corpo?.acao === 'historico' || corpo?.acao === 'intradia') {
      if (!usuario) return resposta({ erro: 'só com o login' }, 401);
      const { data: ativo, error: e1 } = await admin.from('rv_ativos').select('id, user_id, ticker, mercado').eq('id', String(corpo.ativo_id ?? '')).eq('user_id', usuario).maybeSingle();
      if (e1) throw e1;
      if (!ativo) return resposta({ erro: 'ativo não encontrado' }, 404);
      if (corpo.acao === 'intradia') {
        const { velas, meta } = await doYahoo(ativo.ticker, ativo.mercado, '1d', '5m');
        const regular = meta.currentTradingPeriod?.regular ?? {};
        return resposta({ pontos: velas, anterior: ou(meta.chartPreviousClose) ?? ou(meta.previousClose), inicio: regular.start ?? null, fim: regular.end ?? null, fonte: 'yahoo' });
      }
      const range = ['1mo', '3mo', '1y', '5y', '10y', 'max'].includes(corpo.range) ? corpo.range : '10y';
      const { velas, meta } = await doYahoo(ativo.ticker, ativo.mercado, range, '1d');
      const off = Number(meta.gmtoffset ?? 0); // o dia no fuso da bolsa
      const porDia = new Map<string, Record<string, unknown>>();
      velas.forEach((x) => {
        const data = new Date((x.t + off) * 1000).toISOString().slice(0, 10);
        porDia.set(data, { ativo_id: ativo.id, user_id: ativo.user_id, data, preco: x.c, abertura: x.o, maxima: x.h, minima: x.l, volume: x.v });
      });
      const linhas = [...porDia.values()];
      await gravarFechamentos(admin, linhas);
      return resposta({ gravados: linhas.length, de: linhas[0]?.data ?? null, ate: linhas[linhas.length - 1]?.data ?? null, fonte: 'yahoo' });
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
