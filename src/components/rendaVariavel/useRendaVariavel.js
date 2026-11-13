import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useToast } from '../../context/ToastContext.jsx';
import { atualizarCotacoes, listarRendaVariavel } from '../../api/rendaVariavel.js';
import { cotacaoAgora, dolarDiario } from '../../api/indicadores.js';
import { carteiraRV } from '../../lib/rendaVariavel.js';
import { todayISO } from '../../lib/format.js';

// OS DADOS DA RENDA VARIÁVEL (13/11/2026, migration 027), que a tela Renda variável e o Patrimônio dividem: os ativos, as
// operações, a última cotação de cada um (gravada pela função `cotacoes` do Supabase) e os fechamentos de cada dia; o dólar
// PTAX de cada dia (o sugerido nas operações do exterior e o de cada fim de mês) e o dólar comercial de agora (o valor de hoje
// do exterior; sem ele, a última PTAX).
// `dados === undefined`: carregando; `null`: falta a migration 027.
// A COTAÇÃO VELHA: ao abrir, se a mais nova tiver mais de 20 minutos, a tela pede à função que releia (o agendamento lê a
// cada 15 minutos no pregão; fora dele, a releitura só confirma o fechamento). Depois, relê a tabela a cada 5 minutos com a
// aba à vista.
const VELHA_MS = 20 * 60 * 1000;
export default function useRendaVariavel() {
  const toast = useToast();
  const [dados, setDados] = useState(undefined);
  const [ptax, setPtax] = useState(null);
  const [agora, setAgora] = useState(null);
  const [atualizando, setAtualizando] = useState(false);
  const [erroFuncao, setErroFuncao] = useState(null);
  const hoje = todayISO();
  const pediu = useRef(false);

  const carregar = useCallback(async () => {
    try { setDados(await listarRendaVariavel()); } catch (err) { toast.error(err.message); setDados({ ativos: [], operacoes: [], cotacoes: [], fechamentos: [] }); }
  }, [toast]);
  useEffect(() => { carregar(); }, [carregar]);
  useEffect(() => {
    const t = setInterval(() => { if (document.visibilityState === 'visible') carregar(); }, 5 * 60 * 1000);
    return () => clearInterval(t);
  }, [carregar]);

  // pede à função que releia agora; `avisar` = o clique no "Atualizar as cotações agora"
  const releer = useCallback(async (avisar = false) => {
    setAtualizando(true);
    const r = await atualizarCotacoes();
    setAtualizando(false);
    if (r?.erro) { setErroFuncao(r.erro); if (avisar) toast.error(`As cotações não atualizaram: ${r.erro}`); return; }
    setErroFuncao(null);
    if (avisar) toast.success(r?.falharam?.length ? `Cotações atualizadas; sem cotação: ${r.falharam.join(', ')}.` : 'Cotações atualizadas.');
    carregar();
  }, [carregar, toast]);
  useEffect(() => {
    if (!dados?.ativos?.length || pediu.current) return;
    pediu.current = true;
    const mais = dados.cotacoes.reduce((m, c) => (c.atualizado_em > m ? c.atualizado_em : m), '');
    const faltam = dados.ativos.some((a) => a.ativo !== false && !dados.cotacoes.some((c) => c.ativo_id === a.id));
    if (faltam || !mais || Date.now() - new Date(mais).getTime() > VELHA_MS) releer(false);
  }, [dados, releer]);

  // o dólar: a PTAX desde a operação mais antiga do exterior (e no mínimo 40 dias, para o sugerido de hoje) e o de agora
  const desde = useMemo(() => {
    if (!dados) return null;
    const usd = new Set(dados.ativos.filter((a) => a.moeda === 'USD').map((a) => a.id));
    const primeira = dados.operacoes.filter((o) => usd.has(o.ativo_id)).map((o) => o.data).sort()[0];
    const quarenta = new Date(Date.now() - 40 * 86400000).toISOString().slice(0, 10);
    return primeira && primeira < quarenta ? primeira : quarenta;
  }, [dados]);
  useEffect(() => {
    if (!desde) return undefined;
    let vivo = true;
    dolarDiario(desde).then((s) => { if (vivo && s?.length) setPtax(s); });
    return () => { vivo = false; };
  }, [desde]);
  useEffect(() => {
    let vivo = true;
    const ler = () => cotacaoAgora().then((c) => { if (vivo && c?.usd) setAgora(c.usd); });
    ler();
    const t = setInterval(() => { if (document.visibilityState === 'visible') ler(); }, 60000);
    return () => { vivo = false; clearInterval(t); };
  }, []);
  const dolar = agora?.valor ?? (ptax?.length ? ptax[ptax.length - 1][1] : null);

  const carteira = useMemo(() => (dados ? carteiraRV({ ativos: dados.ativos, operacoes: dados.operacoes, cotacoes: dados.cotacoes, dolar, hoje }) : null), [dados, dolar, hoje]);
  const temDolar = !!dolar || !dados?.ativos?.some((a) => a.moeda === 'USD');

  return {
    carregando: dados === undefined, semMigration: dados === null,
    ativos: dados?.ativos ?? [], operacoes: dados?.operacoes ?? [], cotacoes: dados?.cotacoes ?? [], fechamentos: dados?.fechamentos ?? [],
    carteira, ptax: ptax ?? [], dolar, dolarAoVivo: agora, temDolar, hoje,
    carregar, releer, atualizando, erroFuncao,
  };
}
