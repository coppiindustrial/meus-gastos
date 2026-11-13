import { useEffect, useMemo, useState } from 'react';
import Modal from '../Modal.jsx';
import AbasPilula from '../AbasPilula.jsx';
import Toggle from '../Toggle.jsx';
import Tooltip from '../Tooltip.jsx';
import { Etiqueta } from '../Comuns.jsx';
import { Trilho, DivisorFaixa } from '../filtros/FaixaFiltros.jsx';
import LegendaSeries, { useDestaqueSeries } from '../graficos/LegendaSeries.jsx';
import { IconMaximize, IconMinimize } from '../icons.jsx';
import GraficoAtivo, { COR_MARCA } from './GraficoAtivo.jsx';
import WidgetTradingView from './WidgetTradingView.jsx';
import { buscarHistorico, fechamentosDoAtivo, intradiaDoAtivo } from '../../api/rendaVariavel.js';
import { dolarDiario } from '../../api/indicadores.js';
import { useNoCelular } from '../../lib/celular.js';
import { formatBRL } from '../../lib/dinheiro.js';
import { formatDate } from '../../lib/format.js';
import { lsGet, lsSet } from '../../lib/storage.js';
import { CLASSES, NOME_PROVENTO, classeDoTipo, nomeDoTipo, precoDaOperacao } from '../../lib/rendaVariavel.js';
import {
  PERIODOS, dolarEm, historicoDoPrecoMedio, historicoQueFalta, inicioDoPeriodo, marcasNoPeriodo, paraDesenho, precoMedioEm,
  velasDeFechamentos,
} from '../../lib/graficoAtivo.js';

// O PAINEL DO ATIVO (13/11/2026, o mockup "O gráfico do ativo", as duas abas): abre pelo ticker, pelo ícone do gráfico e pela
// curvinha do mês na carteira da Renda variável. É o painel dos ampliados (1280px, 90% da altura, tela cheia), com duas abas:
//   · MEU GRÁFICO (`GraficoAtivo`): o preço no período (1D · 1M · 3M · 6M · No ano · 1A · 5A · Tudo), em linha ou velas, com
//     AS SUAS OPERAÇÕES em cima da curva e o PREÇO MÉDIO em degraus; "Em R$" converte o exterior pelo dólar de cada dia (a
//     PTAX). Ao lado: a posição, o dia e as 52 semanas.
//   · AVANÇADO (`WidgetTradingView`): o gráfico do TradingView, com indicadores e ferramentas de desenho.
// O HISTÓRICO: os fechamentos guardados em `rv_fechamentos`; na PRIMEIRA vez (quase nada guardado) ou quando faltam os últimos
// dias, o painel pede à função `cotacoes` que traga do Yahoo (`buscarHistorico`) — uma vez por ativo por sessão: se o Yahoo
// recusar, segue com o que há e o rodapé avisa. O 1D (de 5 em 5 minutos) a função busca na hora, sem guardar, e o painel
// relê a cada 2 minutos.

const PEDIDOS = new Set(); // os ativos cujo histórico já foi pedido nesta sessão
const HORA_BR = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
const MES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const BTN_ICONE = 'inline-flex h-[28px] w-[28px] items-center justify-center rounded-[4px] text-gray-400 transition hover:bg-gray-100 hover:text-gray-600';
const num = (v, casas = 2) => Number(v).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
const pct = (f, casas = 2) => (f === null || f === undefined || !Number.isFinite(f) ? '—' : `${f > 0 ? '+' : f < 0 ? '−' : ''}${num(Math.abs(f * 100), casas)}%`);
const corDe = (v) => (v < 0 ? 'text-hx-c0393d' : v > 0 ? 'text-green-700' : 'text-gray-500');
const volumeCurto = (v) => (v >= 1e9 ? `${num(v / 1e9, 1)} bi` : v >= 1e6 ? `${num(v / 1e6, 1)} mi` : v >= 1e3 ? `${num(v / 1e3, 1)} mil` : String(v));
const ler = (k, padrao, validos) => { const v = lsGet(k); return validos.includes(v) ? v : padrao; };

export default function PainelAtivo({ posicao, operacoes, ptax, dolar, hoje, onClose, onOperar }) {
  const p = posicao;
  const { ativo } = p;
  const usd = !!p.usd;
  const movel = useNoCelular();
  const classe = CLASSES.find((c) => c.id === classeDoTipo(ativo.tipo));
  const cor = classe?.cor ?? 'var(--serie-gastos)';
  const [cheio, setCheio] = useState(false);
  const [aba, setAbaEstado] = useState(() => (movel ? 'meu' : ler('rv_grafico_aba', 'meu', ['meu', 'tv'])));
  const setAba = (v) => { setAbaEstado(v); lsSet('rv_grafico_aba', v); };
  const [per, setPerEstado] = useState(() => ler('rv_grafico_periodo', '1A', PERIODOS.map((x) => x.key)));
  const setPer = (v) => { setPerEstado(v); lsSet('rv_grafico_periodo', v); };
  const [tipo, setTipoEstado] = useState(() => ler('rv_grafico_tipo', 'linha', ['linha', 'velas']));
  const setTipo = (v) => { setTipoEstado(v); lsSet('rv_grafico_tipo', v); };
  const [verOps, setVerOps] = useState(true);
  const [verPm, setVerPm] = useState(true);
  const [brl, setBrl] = useState(false);
  const ctrl = useDestaqueSeries();
  const emReais = usd && brl;

  // ---- o histórico guardado (e o pedido ao Yahoo, se faltar)
  const [hist, setHist] = useState(null);
  const [buscando, setBuscando] = useState(false);
  const [aviso, setAviso] = useState(null);
  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const r = await fechamentosDoAtivo(ativo.id);
        if (!vivo) return;
        setHist(r);
        const falta = historicoQueFalta(r.linhas, hoje);
        if (!falta || PEDIDOS.has(ativo.id)) return;
        PEDIDOS.add(ativo.id);
        setBuscando(true);
        const b = await buscarHistorico(ativo.id, falta === 'inteiro' ? '10y' : '3mo');
        if (!vivo) return;
        if (b?.erro) { setAviso(`O histórico não veio (${b.erro}); o gráfico mostra o que já estava guardado.`); return; }
        const r2 = await fechamentosDoAtivo(ativo.id);
        if (vivo) setHist(r2);
      } catch (err) {
        if (vivo) setAviso(err?.message ?? 'O histórico não carregou.');
      } finally {
        if (vivo) setBuscando(false);
      }
    })();
    return () => { vivo = false; };
  }, [ativo.id, hoje]);

  // ---- o 1D: o pregão de hoje, relido a cada 2 minutos
  const [intra, setIntra] = useState(null);
  useEffect(() => {
    if (per !== '1D') return undefined;
    let vivo = true;
    const lerIntra = () => intradiaDoAtivo(ativo.id).then((r) => { if (vivo) setIntra(r); });
    lerIntra();
    const t = setInterval(() => { if (document.visibilityState === 'visible') lerIntra(); }, 120000);
    return () => { vivo = false; clearInterval(t); };
  }, [per, ativo.id]);

  // ---- o dólar de cada dia (o "Em R$" do exterior): a PTAX da tela, ou desde o começo do período
  const velas = useMemo(() => velasDeFechamentos(hist?.linhas), [hist]);
  const de = inicioDoPeriodo(per, hoje);
  const recorte = useMemo(() => (de ? velas.filter((x) => x.d >= de) : velas), [velas, de]);
  const [ptaxLonga, setPtaxLonga] = useState(null);
  const precisaDesde = emReais && recorte.length ? recorte[0].d : null;
  useEffect(() => {
    if (!precisaDesde || (ptax?.length && ptax[0][0] <= precisaDesde) || (ptaxLonga?.length && ptaxLonga[0][0] <= precisaDesde)) return undefined;
    let vivo = true;
    dolarDiario(precisaDesde).then((s) => { if (vivo && s?.length) setPtaxLonga(s); });
    return () => { vivo = false; };
  }, [precisaDesde, ptax, ptaxLonga]);
  const serieDolar = ptaxLonga?.length && (!ptax?.length || ptaxLonga[0][0] < ptax[0][0]) ? ptaxLonga : ptax;
  const fatorDe = (d) => (!emReais ? 1 : d >= hoje && dolar ? dolar : dolarEm(serieDolar, d) ?? dolar ?? 0);

  // ---- o que vai ao desenho
  const intradia = per === '1D';
  const { pontos, grupo } = useMemo(() => {
    if (intradia) {
      const k = emReais ? dolar ?? 0 : 1;
      const pts = (intra?.pontos ?? []).map((x) => ({ t: x.t, o: (x.o ?? x.c) * k, h: (x.h ?? x.c) * k, l: (x.l ?? x.c) * k, c: x.c * k }));
      return { pontos: pts, grupo: 'intra' };
    }
    const r = paraDesenho(recorte, tipo);
    if (!emReais) return r;
    return { ...r, pontos: r.pontos.map((x) => { const k = fatorDe(x.d); return { ...x, o: x.o * k, h: x.h * k, l: x.l * k, c: x.c * k }; }) };
  }, [intradia, intra, recorte, tipo, emReais, dolar, serieDolar]);
  const sessao = intradia && intra?.inicio && intra?.fim ? { inicio: intra.inicio, fim: intra.fim } : null;
  const anterior = intradia && intra?.anterior ? intra.anterior * (emReais ? dolar ?? 0 : 1) : null;

  const minhas = useMemo(() => operacoes.filter((o) => o.ativo_id === ativo.id), [operacoes, ativo.id]);
  const degraus = useMemo(() => historicoDoPrecoMedio(ativo, minhas), [ativo, minhas]);
  const pmDe = verPm && !intradia && degraus.length ? (x) => precoMedioEm(degraus, x.d, usd ? emReais : true) : null;
  const marcas = verOps && !intradia ? marcasNoPeriodo(minhas.filter((o) => o.data <= hoje), pontos) : [];

  // ---- os números de cima
  const sigla = emReais || !usd ? 'R$' : 'US$';
  const moeda = (v, casas = 2) => (v === null || v === undefined || !Number.isFinite(v) ? '—' : `${sigla} ${num(v, casas)}`);
  const c = p.cotacao;
  const precoAgora = (p.preco ?? 0) * (emReais ? dolar ?? 0 : 1);
  const antes = c?.fechamento_anterior ? Number(c.fechamento_anterior) * (emReais ? dolar ?? 0 : 1) : null;
  const variacaoDia = p.variacaoDia ?? (antes ? precoAgora / antes - 1 : null);
  const base = intradia ? anterior : pontos[0]?.c;
  const ultimoPonto = pontos[pontos.length - 1];
  const varPeriodo = base && ultimoPonto ? ultimoPonto.c / base - 1 : null;
  const nomePer = PERIODOS.find((x) => x.key === per)?.nome;

  // ---- o balão de cada ponto
  const balaoDe = (pt, j, ops) => {
    const titulo = grupo === 'intra' ? `hoje, ${HORA_BR.format(new Date(pt.t * 1000))}`
      : grupo === 'semana' ? `semana de ${formatDate(pt.d0)}`
        : grupo === 'mes' ? `${MES[Number(pt.d.slice(5, 7)) - 1]}/${pt.d.slice(0, 4)}` : formatDate(pt.d);
    const ref = j ? pontos[j - 1].c : grupo === 'intra' ? anterior : null;
    const itens = [{ rotulo: 'Fechamento', valor: moeda(pt.c), cor }];
    if (ref) itens.push({ rotulo: grupo === 'semana' ? 'Na semana' : grupo === 'mes' ? 'No mês' : grupo === 'intra' ? 'Desde o anterior' : 'No dia', valor: pct(pt.c / ref - 1) });
    if (tipo === 'velas') {
      itens.push({ rotulo: 'Abertura', valor: moeda(pt.o) });
      itens.push({ rotulo: 'Máxima · mínima', valor: `${num(pt.h)} · ${num(pt.l)}` });
    }
    if (emReais && grupo !== 'intra') itens.push({ rotulo: 'Dólar do dia (PTAX)', valor: `R$ ${num(fatorDe(pt.d), 4)}` });
    const pm = pmDe ? pmDe(pt) : null;
    if (pm) itens.push({ rotulo: 'Seu preço médio', valor: `${moeda(pm)} · ${pct(pt.c / pm - 1, 1)}` });
    const extra = ops.length ? (
      <div className="mt-1.5 space-y-0.5 border-t border-gray-100 pt-1.5 text-[11.5px] leading-[16px] text-gray-600">
        {ops.map((o) => <div key={o.id}>{textoDaOperacao(o, { usd, emReais, sigla })}</div>)}
      </div>
    ) : null;
    return { titulo, itens, extra };
  };

  // ---- ao lado: a posição, o dia e as 52 semanas
  const ano = useMemo(() => {
    const desde = inicioDoPeriodo('1A', hoje);
    const v = velas.filter((x) => x.d >= desde);
    if (!v.length) return null;
    return v.reduce((m, x) => ({ min: Math.min(m.min, x.l), max: Math.max(m.max, x.h) }), { min: Infinity, max: -Infinity });
  }, [velas, hoje]);
  const volume = [...velas].reverse().find((x) => x.v)?.v ?? null;
  const k = emReais ? dolar ?? 0 : 1;
  const posPct = (v) => (ano ? Math.max(0, Math.min(100, ((v - ano.min) / (ano.max - ano.min || 1)) * 100)) : 0);

  const series = [
    { key: 'preco', rotulo: emReais ? 'Preço em reais' : usd ? 'Preço em dólar' : 'Preço', cor, forma: 'linha' },
    ...(verOps && !intradia ? [
      { key: 'compra', rotulo: 'Compra', cor: COR_MARCA.compra },
      ...(minhas.some((o) => o.tipo === 'venda') ? [{ key: 'venda', rotulo: 'Venda', cor: COR_MARCA.venda }] : []),
      ...(minhas.some((o) => o.tipo === 'provento') ? [{ key: 'prov', rotulo: 'Provento', cor: COR_MARCA.provento }] : []),
    ] : []),
    ...(pmDe ? [{ key: 'pm', rotulo: 'Preço médio', cor: 'var(--origem-manual)', forma: 'tracejado' }] : []),
  ];

  const vazio = !intradia && !pontos.length;
  const carregandoTudo = !hist || (buscando && !velas.length);
  const acoesModal = (
    <Tooltip label={cheio ? 'Sair da tela cheia' : 'Tela cheia'}>
      <button type="button" onClick={() => setCheio((x) => !x)} aria-label={cheio ? 'Sair da tela cheia' : 'Tela cheia'} className={BTN_ICONE}>
        {cheio ? <IconMinimize className="h-3.5 w-3.5" /> : <IconMaximize className="h-3.5 w-3.5" />}
      </button>
    </Tooltip>
  );

  return (
    <Modal open onClose={onClose} title={`${ativo.ticker}${ativo.nome ? ` · ${ativo.nome}` : ''}`}
      subtitulo={`${nomeDoTipo(ativo.tipo)} · ${ativo.mercado === 'EUA' ? 'EUA' : 'B3'}${ativo.corretora ? ` · ${ativo.corretora}` : ''}`}
      acoes={acoesModal} alturaCheia animarTamanho padding="p-0" fecharNoBackdrop
      maxWidth={cheio ? 'max-w-[96vw]' : 'max-w-[min(1280px,95vw)]'} altura={cheio ? 'h-[94vh]' : 'h-[90vh]'}>
      <div className="flex h-full min-h-0 flex-col">
        {/* o preço e a troca de aba */}
        <div className="flex shrink-0 flex-wrap items-center gap-x-3.5 gap-y-1.5 px-5 pb-1 pt-4">
          <span className="text-[24px] font-semibold tabular-nums tracking-[-0.02em] text-gray-900">{moeda(precoAgora)}</span>
          {variacaoDia !== null && <span className={`text-[13px] font-semibold tabular-nums ${corDe(variacaoDia)}`}>{antes ? `${precoAgora - antes >= 0 ? '+' : '−'}${num(Math.abs(precoAgora - antes))} ` : ''}({pct(variacaoDia)}) hoje</span>}
          {aba === 'meu' && !intradia && varPeriodo !== null && <Etiqueta tom={varPeriodo >= 0 ? 'verde' : 'vermelho'}>{pct(varPeriodo, 1)} {nomePer}</Etiqueta>}
          {c?.cotado_em && <span className="text-[12px] text-gray-500">cotação de {formatDate(c.cotado_em.slice(0, 10))} {HORA_BR.format(new Date(c.cotado_em))}{usd && !emReais && dolar ? ` · em reais, ${formatBRL(Math.round(p.preco * dolar * 100))}` : ''}</span>}
          <span className="flex-1" />
          {!movel && <AbasPilula abas={[{ key: 'meu', label: 'Meu gráfico' }, { key: 'tv', label: 'Avançado' }]} valor={aba} onChange={setAba} altura={30} folga={2} />}
        </div>

        {aba === 'tv' ? (
          <div className="flex min-h-0 flex-1 flex-col px-5 pb-4 pt-3"><WidgetTradingView ativo={ativo} /></div>
        ) : (
          <>
            {/* o período, as marcas e a forma */}
            <div className="flex shrink-0 flex-wrap items-center gap-2 px-5 pb-1 pt-2.5">
              <AbasPilula abas={PERIODOS.map((x) => ({ key: x.key, label: x.rotulo }))} valor={per} onChange={setPer} variante="claro" altura={30} folga={2} />
              {!movel && (
                <Trilho className="shrink-0">
                  <span className="flex h-[24px] items-center gap-2 px-2">
                    <button type="button" tabIndex={-1} aria-hidden="true" onClick={() => setVerOps(!verOps)} className="whitespace-nowrap text-[12px] font-medium text-gray-600">Minhas operações</button>
                    <Toggle compacto rotulo="Mostrar as minhas operações no gráfico" checked={verOps} onChange={setVerOps} />
                  </span>
                  <DivisorFaixa />
                  <span className="flex h-[24px] items-center gap-2 px-2">
                    <button type="button" tabIndex={-1} aria-hidden="true" onClick={() => setVerPm(!verPm)} className="whitespace-nowrap text-[12px] font-medium text-gray-600">Preço médio</button>
                    <Toggle compacto rotulo="Mostrar o preço médio no gráfico" checked={verPm} onChange={setVerPm} />
                  </span>
                  {usd && (<>
                    <DivisorFaixa />
                    <span className="flex h-[24px] items-center gap-2 px-2">
                      <button type="button" tabIndex={-1} aria-hidden="true" onClick={() => setBrl(!brl)} className="whitespace-nowrap text-[12px] font-medium text-gray-600">Em R$</button>
                      <Toggle compacto rotulo="Mostrar o preço em reais, pelo dólar de cada dia" checked={brl} onChange={setBrl} />
                    </span>
                  </>)}
                </Trilho>
              )}
              <span className="flex-1" />
              <AbasPilula abas={[{ key: 'linha', label: 'Linha' }, { key: 'velas', label: 'Velas' }]} valor={tipo} onChange={setTipo} variante="claro" altura={30} folga={2} />
            </div>

            <div className={`mt-2 grid min-h-0 flex-1 grid-cols-1 overflow-auto border-t border-gray-100 ${movel ? '' : 'lg:grid-cols-[minmax(0,1fr)_256px] lg:overflow-visible'}`}>
              <div className="flex min-h-0 min-w-0 flex-col pr-1.5 pt-2.5">
                <div className={`relative min-h-[260px] ${movel ? 'h-[300px]' : 'h-[300px] lg:h-auto lg:flex-1'}`}>
                  {carregandoTudo || (intradia && !intra) ? (
                    <div className="flex h-full items-center justify-center text-[12.5px] text-gray-400">{buscando ? 'Buscando o histórico do ativo… (só na primeira vez)' : 'Carregando…'}</div>
                  ) : intradia && (intra?.erro || !pontos.length) ? (
                    <div className="flex h-full items-center justify-center px-6 text-center text-[12.5px] text-gray-400">{intra?.erro ? `O pregão de hoje não veio (${intra.erro}).` : 'Ainda sem negócios hoje.'}</div>
                  ) : vazio ? (
                    <div className="flex h-full items-center justify-center px-6 text-center text-[12.5px] text-gray-400">Sem preços neste período{aviso ? '' : ' ainda'}. {velas.length ? 'Tente um período maior.' : ''}</div>
                  ) : (
                    <GraficoAtivo pontos={pontos} tipo={tipo} per={per} sessao={sessao} anterior={anterior} pmDe={pmDe} marcas={marcas}
                      op={ctrl.opSerie} cor={cor} balaoDe={balaoDe} />
                  )}
                </div>
                {!carregandoTudo && !vazio && <LegendaSeries series={series} ctrl={ctrl} className="mx-4 mb-2 mt-1" />}
              </div>
              <aside className={`flex flex-col gap-4 bg-white px-4 py-3 text-[12px] tabular-nums ${movel ? 'border-t border-gray-100' : 'border-t border-gray-100 lg:overflow-auto lg:border-l lg:border-t-0'}`}>
                <Bloco titulo="Sua posição">
                  {p.quantidade > 0 ? (<>
                    <Linha r="Cotas" v={<b className="font-semibold text-gray-900">{p.quantidade.toLocaleString('pt-BR', { maximumFractionDigits: 6 })}</b>} />
                    <Linha r="Preço médio" v={usd && !emReais ? `US$ ${num(p.precoMedio)}` : formatBRL(Math.round((usd ? p.custoMedioReais : p.precoMedio) * 100))} />
                    <Linha r="Vale hoje" v={<b className="font-semibold text-gray-900">{formatBRL(Math.round(p.valorReais))}</b>} />
                    {usd && <Linha r="Em dólar" v={`US$ ${num(p.valorMoeda / 100)}`} />}
                    <Linha r="Resultado" v={<span className={corDe(p.resultado)}>{p.resultado >= 0 ? '+' : '−'}{formatBRL(Math.round(Math.abs(p.resultado)))} · {pct(p.resPct, 1)}</span>} />
                  </>) : <p className="text-gray-400">Nenhuma cota agora.{onOperar && <> <button type="button" className="font-medium text-gray-600 underline decoration-dotted underline-offset-2 hover:text-gray-900" onClick={() => onOperar(ativo)}>Lançar uma compra</button></>}</p>}
                </Bloco>
                <Bloco titulo="Hoje">
                  <Linha r="Abertura" v={c?.abertura ? num(Number(c.abertura) * k) : '—'} />
                  <Linha r="Máxima" v={c?.maxima ? num(Number(c.maxima) * k) : '—'} />
                  <Linha r="Mínima" v={c?.minima ? num(Number(c.minima) * k) : '—'} />
                  <Linha r="Fechamento anterior" v={antes ? num(antes) : '—'} />
                  {volume ? <Linha r="Volume" v={volumeCurto(volume)} /> : null}
                </Bloco>
                {ano && (
                  <Bloco titulo="52 semanas">
                    <div className="relative mb-1 mt-2 h-[6px] rounded-full bg-gray-200">
                      {p.precoMedio && <Tooltip label="O seu preço médio"><span className="absolute -top-[3px] h-[12px] border-l-2 border-dashed border-gray-400" style={{ left: `${posPct(p.precoMedio)}%` }} /></Tooltip>}
                      <span className="absolute -top-[4px] h-[14px] w-[2px] rounded-[1px] bg-gray-800" style={{ left: `calc(${posPct(p.preco ?? 0)}% - 1px)` }} />
                    </div>
                    <div className="flex justify-between text-[11px] text-gray-500"><span>{num(ano.min * k)}</span><span>{num(ano.max * k)}</span></div>
                    <p className="mt-1 text-[11px] leading-[15px] text-gray-400">a barra é o preço de hoje{p.precoMedio ? '; o tracejado, o seu preço médio' : ''}</p>
                  </Bloco>
                )}
              </aside>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1 border-t border-gray-100 bg-hx-fafbfc px-5 py-2 text-[11.5px] text-gray-500">
              <span>{aviso ?? (intradia ? 'De 5 em 5 minutos, buscado na hora (não fica guardado).' : grupo === 'semana' ? 'Velas semanais: no período longo, uma vela por semana.' : grupo === 'mes' ? 'Velas mensais: no período longo, uma vela por mês.' : 'O fechamento de cada dia.')}</span>
              <span className="flex-1" />
              <span>Fonte: <b className="font-semibold text-gray-700">Yahoo Finance</b> (o histórico){c?.fonte ? <> e <b className="font-semibold text-gray-700">{c.fonte === 'finnhub' ? 'Finnhub' : 'brapi'}</b> (a cotação)</> : ''}</span>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

const Bloco = ({ titulo, children }) => (
  <div>
    <h5 className="mb-1 text-[10.5px] font-semibold uppercase tracking-wide text-gray-400">{titulo}</h5>
    <dl className="grid grid-cols-[auto_1fr] gap-x-2.5 gap-y-0.5">{children}</dl>
  </div>
);
const Linha = ({ r, v }) => (<><dt className="text-gray-500">{r}</dt><dd className="m-0 text-right text-gray-700">{v}</dd></>);

// a frase de uma operação no balão do gráfico
function textoDaOperacao(o, { usd, emReais, sigla }) {
  const q = Number(o.quantidade ?? 0).toLocaleString('pt-BR', { maximumFractionDigits: 6 });
  const cotas = Number(o.quantidade) === 1 ? 'cota' : 'cotas';
  const preco = precoDaOperacao(o);
  const k = usd && emReais ? Number(o.dolar ?? 0) : 1;
  const valor = (v) => `${sigla} ${num(v)}`;
  if (o.tipo === 'compra') return <>▲ <b className="font-semibold text-gray-800">Compra</b> de {q} {cotas} a {valor(preco * k)}</>;
  if (o.tipo === 'venda') return <>▼ <b className="font-semibold text-gray-800">Venda</b> de {q} {cotas} a {valor(preco * k)}</>;
  if (o.tipo === 'provento') return <>● <b className="font-semibold text-gray-800">{NOME_PROVENTO[o.provento] ?? 'Provento'}</b> · {valor(((Number(o.valor_centavos) - Number(o.retido_centavos ?? 0)) / 100) * k)} líquido</>;
  return <>◆ <b className="font-semibold text-gray-800">{o.tipo === 'grupamento' ? 'Grupamento' : 'Desdobramento'}</b> · 1 para {Number(o.fator).toLocaleString('pt-BR', { maximumFractionDigits: 4 })}</>;
}
