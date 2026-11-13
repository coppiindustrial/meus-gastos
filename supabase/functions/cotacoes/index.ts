// Meus Gastos — a função COTACOES (13/11/2026, a renda variável; migration 027).
//
// Busca a cotação de cada ativo cadastrado em `rv_ativos` e grava a última em `rv_cotacoes` e o preço do dia em
// `rv_fechamentos` (gravado de novo a cada leitura: depois do pregão, ele É o fechamento). A B3 vem da brapi.dev, os EUA da
// Finnhub; as chaves ficam nos SEGREDOS do Supabase (BRAPI_TOKEN, FINNHUB_TOKEN), nunca no repositório (que é público).
//
// Quem chama:
//   · o AGENDAMENTO (pg_cron, migration 028), a cada 15 min no pregão, com o cabeçalho `x-segredo` = COTACOES_SEGREDO:
//     atualiza os ativos de todo mundo;
//   · o APP, com o login da pessoa (o cabeçalho Authorization do supabase-js): atualiza só os ativos dela.
//     { "acao": "consultar", "ticker": "MU", "mercado": "EUA" } não grava nada: devolve o nome e o preço (o cadastro do
//     ativo confere o ticker antes de salvar).
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
      fechamentos.push({ ativo_id: a.id, user_id: a.user_id, data: diaDoPregao(c.cotado_em, a.mercado), preco: c.preco });
    }
    if (cotacoes.length) {
      const r1 = await admin.from('rv_cotacoes').upsert(cotacoes, { onConflict: 'ativo_id' });
      if (r1.error) throw r1.error;
      const r2 = await admin.from('rv_fechamentos').upsert(fechamentos, { onConflict: 'ativo_id,data' });
      if (r2.error) throw r2.error;
    }
    return resposta({ atualizados: cotacoes.length, falharam });
  } catch (e) {
    return resposta({ erro: String((e as Error)?.message ?? e) }, 500);
  }
});
