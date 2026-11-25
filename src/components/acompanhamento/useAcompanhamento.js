import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import useRendaVariavel from '../rendaVariavel/useRendaVariavel.js';
import { lerAoVivo } from '../../api/rendaVariavel.js';
import { listarAcompanhamento, proximosEventos } from '../../api/acompanhamento.js';
import { INDICES, desdeDe, juntarLeitura, listaDoAcompanhamento, pregaoAberto } from '../../lib/acompanhamento.js';

// OS DADOS DO ACOMPANHAMENTO (25/11/2026): a renda variável de sempre (`useRendaVariavel`: os ativos, as posições e o que o
// painel do ativo pede), a lista (`rv_acompanhamento`, migration 037) e os PREÇOS AO VIVO da função `cotacoes` (a ação
// "ao_vivo", do Yahoo, SEM GRAVAR).
// O MINUTO: lê ao abrir e, depois, a cada minuto SÓ com a aba à vista e algum pregão aberto (B3 ou Nova York); ao voltar para
// a aba, se a última leitura tiver mais de um minuto. Uma chamada por minuto para todos (e não uma por ativo): no plano grátis
// do Supabase, um pregão inteiro com a tela aberta dá ~480 chamadas por dia. Cada leitura manda o `desde` de cada um e só
// recebe os pontos novos.
// O VALOR DE MERCADO (o tamanho do mapa) vem uma vez por sessão (`CAP`, em memória — nunca no navegador).
// AS SÉRIES DO PERÍODO (o % da semana, do mês… e o desempenho comparado) são pedidas quando a tela precisa e valem 10 minutos.
const MINUTO = 60 * 1000;
const VALE_SERIE = 10 * MINUTO;
const CAP = new Map(); // chave → valor de mercado em milhões (null = a fonte não deu)
const FUNCAO_VELHA = { v: false }; // a função publicada ainda não tem a ação "ao_vivo" (ver `lerVivo`)
export const FUNCAO_ANTIGA = 'publique de novo a função "cotacoes" no Supabase (a ação nova "ao_vivo")';

export default function useAcompanhamento() {
  const rv = useRendaVariavel();
  const [linhas, setLinhas] = useState(undefined); // undefined: carregando; null: falta a migration 037
  const carregarLinhas = useCallback(async () => {
    try { setLinhas(await listarAcompanhamento()); } catch { setLinhas(null); }
  }, []);
  useEffect(() => { carregarLinhas(); }, [carregarLinhas]);

  const lista = useMemo(() => (rv.carregando || linhas === undefined ? null : listaDoAcompanhamento(rv.ativos, linhas)), [rv.carregando, rv.ativos, linhas]);
  const visiveis = useMemo(() => (lista ?? []).filter((i) => i.aparece), [lista]);
  const chaves = useMemo(() => [...visiveis.map((i) => i.chave), ...INDICES.map((i) => i.chave)], [visiveis]);
  const chavesTxt = chaves.join(',');
  const mercados = useMemo(() => [...new Set(visiveis.map((i) => i.mercado)), 'B3', 'EUA'], [visiveis]);

  // ------------------------------------------------------------ o ao vivo
  const [vivo, setVivo] = useState({});
  const vivoRef = useRef({});
  const [lidoEm, setLidoEm] = useState(null);
  const lidoRef = useRef(0);
  const [lendo, setLendo] = useState(false);
  const [erroVivo, setErroVivo] = useState(null);
  const [caps, setCaps] = useState(() => Object.fromEntries(CAP));
  const emCurso = useRef(false);

  const lerVivo = useCallback(async () => {
    if (!chavesTxt || emCurso.current) return;
    if (FUNCAO_VELHA.v) { setErroVivo(FUNCAO_ANTIGA); return; }
    emCurso.current = true;
    setLendo(true);
    const lista1 = chavesTxt.split(',');
    const desde = desdeDe(Object.fromEntries(lista1.map((k) => [k, vivoRef.current[k]])));
    const perfil = lista1.some((k) => !k.startsWith('IDX:') && !CAP.has(k));
    const r = await lerAoVivo(lista1, '1d', desde, perfil);
    emCurso.current = false;
    setLendo(false);
    // A FUNÇÃO DE ANTES (sem a ação "ao_vivo") cai no "atualizar as cotações" e devolve { atualizados }: a tela para de
    // chamar (senão relia as cotações de todos os ativos a cada minuto) e pede para publicar a função de novo
    if (r && !r.erro && !r.itens && 'atualizados' in r) { FUNCAO_VELHA.v = true; setErroVivo(FUNCAO_ANTIGA); return; }
    if (r?.erro || !r?.itens) { setErroVivo(r?.erro ?? 'a função não respondeu'); return; }
    setErroVivo(null);
    const novo = { ...vivoRef.current };
    for (const [k, v] of Object.entries(r.itens)) {
      novo[k] = juntarLeitura(novo[k], v);
      if (perfil && !k.startsWith('IDX:') && !v?.erro) CAP.set(k, v.cap ?? null);
    }
    vivoRef.current = novo;
    setVivo(novo);
    if (perfil) setCaps(Object.fromEntries(CAP));
    lidoRef.current = Date.now();
    setLidoEm(r.lidoEm ?? new Date().toISOString());
  }, [chavesTxt]);

  useEffect(() => { lerVivo(); }, [lerVivo]);
  useEffect(() => {
    const aberto = () => mercados.some((m) => pregaoAberto(m));
    const t = setInterval(() => { if (document.visibilityState === 'visible' && aberto()) lerVivo(); }, MINUTO);
    const volta = () => { if (document.visibilityState === 'visible' && Date.now() - lidoRef.current > MINUTO) lerVivo(); };
    document.addEventListener('visibilitychange', volta);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', volta); };
  }, [lerVivo, mercados]);

  // ------------------------------------------------------------ as séries do período
  const [series, setSeries] = useState({}); // range → { itens, em, chaves }
  const pedindo = useRef(new Set());
  const pedirSerie = useCallback(async (range) => {
    if (!range || range === '1d' || !chavesTxt || FUNCAO_VELHA.v) return;
    const s = series[range];
    if (s && s.chaves === chavesTxt && Date.now() - s.em < VALE_SERIE) return;
    const id = `${range}|${chavesTxt}`;
    if (pedindo.current.has(id)) return;
    pedindo.current.add(id);
    const r = await lerAoVivo(chavesTxt.split(','), range);
    pedindo.current.delete(id);
    if (r && !r.erro && !r.itens && 'atualizados' in r) { FUNCAO_VELHA.v = true; return; }
    if (r?.erro || !r?.itens) return;
    setSeries((a) => ({ ...a, [range]: { itens: r.itens, em: Date.now(), chaves: chavesTxt } }));
  }, [chavesTxt, series]);

  // ------------------------------------------------------------ os próximos eventos (os da carteira)
  const [eventos, setEventos] = useState(undefined);
  useEffect(() => {
    let vale = true;
    proximosEventos(rv.hoje).then((e) => { if (vale) setEventos(e); }).catch(() => { if (vale) setEventos(null); });
    return () => { vale = false; };
  }, [rv.hoje]);

  const recarregar = useCallback(() => { carregarLinhas(); rv.carregar(); lerVivo(); setSeries({}); }, [carregarLinhas, rv, lerVivo]);

  return {
    rv, lista, visiveis, semMigration: linhas === null, carregando: lista === null,
    vivo, lidoEm, lendo, erroVivo, caps, series, pedirSerie, eventos, recarregar, carregarLinhas,
  };
}
