import { Fragment, useEffect, useMemo, useState } from 'react';
import GridPersonalizavel from '../components/dashboard/GridPersonalizavel.jsx';
import CardAutoAltura from '../components/dashboard/CardAutoAltura.jsx';
import Tooltip from '../components/Tooltip.jsx';
import AbasPilula from '../components/AbasPilula.jsx';
import { DivisorFaixa, FaixaProvider, LimparFiltros, Trilho } from '../components/filtros/FaixaFiltros.jsx';
import { SegUnico } from '../components/filtros/Segmentos.jsx';
import { IconLapis } from '../components/icons.jsx';
import PainelAtivo from '../components/rendaVariavel/PainelAtivo.jsx';
import useAcompanhamento from '../components/acompanhamento/useAcompanhamento.js';
import ModalAcompanhar from '../components/acompanhamento/ModalAcompanhar.jsx';
import {
  AltasEBaixas, Bloco, CartoesIndices, CurvasDoDia, DesempenhoComparado, MapaDeCalor, ProximosEventos, RANGES_CMP, TabelaCotacoes,
} from '../components/acompanhamento/BlocosAcompanhamento.jsx';
import { CalendarioEconomico, FitaDeCotacoes, FONTES_MERCADO, MapaDoMercado, NoticiasDoMercado } from '../components/acompanhamento/WidgetsTradingView.jsx';
import { ESCALAS, INDICES, horaNaBolsa, pregaoAberto, quandoDoPregao, variacao, variacoesDoPeriodo } from '../lib/acompanhamento.js';
import { useMascararValores } from '../lib/ocultarValores.js';
import { lsGet, lsSet } from '../lib/storage.js';
import { useNoCelular } from '../lib/celular.js';

// O ACOMPANHAMENTO DAS AÇÕES (25/11/2026, o mockup "Acompanhamento das ações", aprovado): em Análises, o painel do MERCADO
// das suas ações — as da carteira e as que você só acompanha (o ✎ "O que acompanhar", `rv_acompanhamento`, migration 037) —
// no grid da Visão geral (`GridPersonalizavel`). Os blocos do app (os índices, o mapa de calor, as altas e baixas, o dia de
// cada um, o desempenho comparado, os próximos eventos e a tabela de cotações) e os do TradingView (o mapa do mercado
// inteiro, a fita, as notícias e o calendário econômico; grátis, com a marca deles). Os preços: a função `cotacoes`, a ação
// "ao_vivo" (o Yahoo, sem gravar), a cada minuto com a aba à vista e algum pregão aberto (`useAcompanhamento`). Clicar num
// ativo abre o gráfico dele (o `PainelAtivo` da renda variável). As contas em `lib/acompanhamento.js` (testada).

const PERIODOS = [
  { value: 'dia', label: 'Dia', range: '1d', txt: 'no dia' },
  { value: 'semana', label: 'Semana (5 pregões)', chip: 'Semana', range: '5d', txt: 'na semana' },
  { value: 'mes', label: 'Mês', range: '1mo', txt: 'no mês' },
  { value: 'ano', label: 'No ano', range: 'ytd', txt: 'no ano' },
  { value: '12m', label: '12 meses', range: '1y', txt: 'em 12 meses' },
];
const LISTAS = [
  { value: 'tudo', label: 'Tudo', chip: 'Lista: tudo' },
  { value: 'carteira', label: 'Só a carteira', chip: 'Carteira' },
  { value: 'acomp', label: 'Só acompanhando', chip: 'Acompanhando' },
];
const MERCADOS = [
  { value: 'tudo', label: 'B3 e EUA', chip: 'Mercado: tudo' },
  { value: 'B3', label: 'B3', chip: 'B3' },
  { value: 'EUA', label: 'EUA', chip: 'EUA' },
];
const CATALOGO = [
  { id: 'ac_indices', titulo: 'Índices', area: 'ac_numeros', x: 0, y: 0, w: 12, h: 4, alturaMedida: true, minPx: 300 },
  { id: 'ac_mapa', titulo: 'Mapa de calor · os seus', area: 'ac_graficos', x: 0, y: 4, w: 8, h: 13, minH: 8, minPx: 420 },
  { id: 'ac_altas', titulo: 'Maiores altas e baixas', area: 'ac_graficos', x: 8, y: 4, w: 4, h: 13, minH: 8, minPx: 280 },
  { id: 'ac_dia', titulo: 'O dia de cada um', area: 'ac_graficos', x: 0, y: 17, w: 8, h: 9, minH: 6, minPx: 360 },
  { id: 'ac_eventos', titulo: 'Próximos eventos', area: 'ac_listas', x: 8, y: 17, w: 4, h: 9, minH: 5, minPx: 280 },
  { id: 'ac_comparado', titulo: 'Desempenho comparado', area: 'ac_graficos', x: 0, y: 26, w: 7, h: 11, minH: 7, minPx: 420 },
  { id: 'ac_mercado', titulo: 'Mapa do mercado (TradingView)', area: 'ac_graficos', x: 7, y: 26, w: 5, h: 11, minH: 8, minPx: 320 },
  { id: 'ac_tabela', titulo: 'Tabela de cotações', area: 'ac_listas', x: 0, y: 37, w: 12, h: 9, minH: 5, minPx: 480, desligado: true },
  { id: 'ac_fita', titulo: 'Fita de cotações (TradingView)', area: 'ac_numeros', x: 0, y: 46, w: 12, h: 3, minH: 3, minPx: 320, desligado: true },
  { id: 'ac_noticias', titulo: 'Notícias (TradingView)', area: 'ac_listas', x: 0, y: 49, w: 6, h: 12, minH: 7, minPx: 300, desligado: true },
  { id: 'ac_calendario', titulo: 'Calendário econômico (TradingView)', area: 'ac_listas', x: 6, y: 49, w: 6, h: 12, minH: 7, minPx: 300, desligado: true },
];
const BLOCOS_MOVEL = [['ac_indices', null], ['ac_mapa', 360], ['ac_altas', 380], ['ac_dia', 420], ['ac_eventos', 320], ['ac_comparado', 320]];
const LS_OCULTAR = 'acomp_ocultar';
const lerLista = (chave) => { try { const v = JSON.parse(lsGet(chave) || '[]'); return Array.isArray(v) ? v.filter((x) => typeof x === 'string').slice(0, 6) : []; } catch { return []; } };
const ICONE = 'flex h-9 items-center justify-center text-gray-600 transition-colors hover:bg-gray-50 active:bg-gray-200';
const num = (v, c) => v.toLocaleString('pt-BR', { minimumFractionDigits: c, maximumFractionDigits: c });

export default function Acompanhamento() {
  const movel = useNoCelular();
  const d = useAcompanhamento();
  const { rv } = d;
  const [periodo, setPeriodo] = useState('dia');
  const [listaF, setListaF] = useState('tudo');
  const [mercadoF, setMercadoF] = useState('tudo');
  const [rangeCmp, setRangeCmpEstado] = useState(() => (RANGES_CMP.some((r) => r.key === lsGet('acomp_cmp_range')) ? lsGet('acomp_cmp_range') : '1mo'));
  const setRangeCmp = (v) => { setRangeCmpEstado(v); lsSet('acomp_cmp_range', v); };
  const [escolhidos, setEscolhidosEstado] = useState(() => lerLista('acomp_comparar'));
  const setEscolhidos = (v) => { setEscolhidosEstado(v); lsSet('acomp_comparar', JSON.stringify(v)); };
  const [fonte, setFonteEstado] = useState(() => (FONTES_MERCADO.some((f) => f.key === lsGet('acomp_mercado')) ? lsGet('acomp_mercado') : 'IBOV'));
  const setFonte = (v) => { setFonteEstado(v); lsSet('acomp_mercado', v); };
  const [modal, setModal] = useState(false);
  const [grafico, setGrafico] = useState(null);
  const [oculto, setOcultoEstado] = useState(() => lsGet(LS_OCULTAR) === 'sim');
  const [versao, setVersao] = useState(0);
  const alternarOculto = () => setOcultoEstado((o) => { lsSet(LS_OCULTAR, o ? '' : 'sim'); if (o) setVersao((v) => v + 1); return !o; });
  useMascararValores(oculto);
  // o relógio da faixa de cima ("Nova York 12:32") anda sozinho
  const [, setTique] = useState(0);
  useEffect(() => { const t = setInterval(() => setTique((x) => x + 1), 30000); return () => clearInterval(t); }, []);

  const per = PERIODOS.find((p) => p.value === periodo);
  const emDia = periodo === 'dia';
  // as séries que a tela precisa: o período da faixa (fora o dia) e o do desempenho comparado
  useEffect(() => { if (!emDia) d.pedirSerie(per.range); }, [emDia, per.range, d.pedirSerie]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { d.pedirSerie(rangeCmp); }, [rangeCmp, d.pedirSerie]); // eslint-disable-line react-hooks/exhaustive-deps

  const posicoes = useMemo(() => {
    const m = {};
    (rv.carteira?.posicoes ?? []).forEach((p) => { if (p.quantidade > 0 && p.valorReais > 0) m[`${p.ativo.mercado}:${p.ativo.ticker}`] = p.valorReais; });
    return m;
  }, [rv.carteira]);

  const filtrados = useMemo(() => d.visiveis.filter((i) => (listaF === 'tudo' || (listaF === 'carteira') === i.deCarteira)
    && (mercadoF === 'tudo' || i.mercado === mercadoF)), [d.visiveis, listaF, mercadoF]);
  const serieP = emDia ? null : d.series[per.range]?.itens ?? null;
  const itens = useMemo(() => {
    const ps = variacoesDoPeriodo(filtrados.map((i) => i.chave), periodo, d.vivo, serieP ?? {});
    return filtrados.map((i) => ({ ...i, nome: i.nome || d.vivo[i.chave]?.nome || '', v: d.vivo[i.chave], p: ps[i.chave], pDia: variacao(d.vivo[i.chave]) }));
  }, [filtrados, periodo, d.vivo, serieP]);
  const indices = INDICES.map((k) => {
    const v = d.vivo[k.chave];
    return {
      ...k, pontos: v?.pontos, anterior: v?.anterior, p: variacao(v), sub: quandoDoPregao(v?.quando, k.mercado),
      valor: !v?.preco ? '—' : k.unidade === 'R$' ? `R$ ${num(v.preco, 4)}` : `${num(v.preco, 0)} pts`,
    };
  });
  const comDia = itens.filter((i) => i.pDia !== null && i.pDia !== undefined);
  const media = { p: comDia.length ? comDia.reduce((s, i) => s + i.pDia, 0) / comDia.length : null, sobem: comDia.filter((i) => i.pDia > 0).length, caem: comDia.filter((i) => i.pDia < 0).length };
  const filtrando = listaF !== 'tudo' || mercadoF !== 'tudo';

  const abrir = (i) => setGrafico(i.ativoId ? { ativoId: i.ativoId } : { ticker: i.ticker, mercado: i.mercado, nome: i.nome, tipo: i.tipo });

  const renderWidget = (id) => {
    switch (id) {
      case 'ac_indices':
        return <div className="card !border-0 !bg-transparent !shadow-none"><CardAutoAltura id="ac_indices"><CartoesIndices indices={indices} media={media} /></CardAutoAltura></div>;
      case 'ac_mapa': return <MapaDeCalor itens={itens} caps={d.caps} posicoes={posicoes} periodoTxt={per.txt} emDia={emDia} escala={ESCALAS[periodo]} onAbrir={abrir} />;
      case 'ac_altas': return <AltasEBaixas itens={itens} periodoTxt={per.txt} onAbrir={abrir} />;
      case 'ac_dia': return <CurvasDoDia itens={itens} onAbrir={abrir} />;
      case 'ac_eventos': return <ProximosEventos eventos={d.eventos} itens={itens} hoje={rv.hoje} onAbrir={abrir} />;
      case 'ac_comparado':
        return <DesempenhoComparado itens={itens} serie={d.series[rangeCmp]?.itens ?? null} range={rangeCmp} setRange={setRangeCmp}
          escolhidos={escolhidos.filter((k) => itens.some((i) => i.chave === k))} setEscolhidos={setEscolhidos} />;
      case 'ac_tabela': return <TabelaCotacoes itens={itens} periodoTxt={per.txt} emDia={emDia} onAbrir={abrir} />;
      case 'ac_mercado':
        return (
          <Bloco titulo="Mapa do mercado" sub="o widget do TradingView" extra={<AbasPilula abas={FONTES_MERCADO} valor={fonte} onChange={setFonte} variante="claro" altura={26} folga={2} />}>
            <MapaDoMercado fonte={fonte} />
          </Bloco>
        );
      case 'ac_fita': return <section className="card h-full overflow-hidden px-3 py-2"><FitaDeCotacoes itens={itens} /></section>;
      case 'ac_noticias': return <Bloco titulo="Notícias" sub="as do mercado, do TradingView"><NoticiasDoMercado /></Bloco>;
      case 'ac_calendario': return <Bloco titulo="Calendário econômico" sub="Brasil e EUA, do TradingView"><CalendarioEconomico /></Bloco>;
      default: return null;
    }
  };

  // o pregão de cada bolsa, na faixa do título
  const b3 = pregaoAberto('B3'); const ny = pregaoAberto('EUA');
  const lido = d.lidoEm ? Math.max(0, Math.round((Date.now() - new Date(d.lidoEm).getTime()) / 1000)) : null;
  const acessorio = (
    <span className="hidden items-center gap-2 text-sm text-gray-500 sm:inline-flex">
      <span className={`h-[7px] w-[7px] rounded-full ${b3 || ny ? 'bg-green-600' : 'bg-gray-300'}`} />
      {b3 || ny ? 'Pregão aberto' : 'Pregões fechados'} · B3 {horaNaBolsa('B3').hhmm} · Nova York {horaNaBolsa('EUA').hhmm}
      {' · '}{d.erroVivo ? <span className="text-amber-700">a leitura falhou: {d.erroVivo}</span>
        : d.lendo && !d.lidoEm ? 'lendo…' : lido === null ? '' : lido < 60 ? `lido há ${lido} s` : `lido há ${Math.round(lido / 60)} min`}
    </span>
  );
  const acoes = (
    <div className="inline-flex overflow-hidden rounded-md border border-gray-300 bg-white">
      <Tooltip label="O que acompanhar">
        <button type="button" aria-label="O que acompanhar" onClick={() => setModal(true)} disabled={d.carregando} className={`${ICONE} w-[38px]`}><IconLapis className="h-3.5 w-3.5" /></button>
      </Tooltip>
    </div>
  );
  const filtros = (
    <FaixaProvider>
      <div className="flex flex-wrap items-center gap-2">
        <Trilho>
          <SegUnico id="lista" rotulo="Lista" opcoes={LISTAS} value={listaF} onChange={setListaF} padrao="tudo" largura={200} />
          <DivisorFaixa />
          <SegUnico id="mercado" rotulo="Mercado" opcoes={MERCADOS} value={mercadoF} onChange={setMercadoF} padrao="tudo" largura={180} />
          <DivisorFaixa />
          <SegUnico id="periodo" rotulo="Período" opcoes={PERIODOS} value={periodo} onChange={setPeriodo} padrao="dia" mostraPadrao largura={210} />
        </Trilho>
        <LimparFiltros ativo={filtrando || !emDia} onClick={() => { setListaF('tudo'); setMercadoF('tudo'); setPeriodo('dia'); }} />
        {d.semMigration && <span className="text-[12px] text-amber-700">Falta a migration 037: a tela mostra a carteira inteira, sem a lista do que acompanhar.</span>}
      </div>
    </FaixaProvider>
  );

  const painel = grafico && (
    <PainelAtivo alvo={grafico} posicoes={rv.carteira?.posicoes ?? []} operacoes={rv.operacoes} ptax={rv.ptax} dolar={rv.dolar} hoje={rv.hoje}
      onClose={() => setGrafico(null)} onOperar={null} onCadastrar={null} />
  );
  const pop = modal && d.lista && (
    <ModalAcompanhar lista={d.lista} semMigration={d.semMigration} onFechar={() => setModal(false)}
      onSalvo={() => { setModal(false); d.carregarLinhas(); }} />
  );

  if (movel) {
    return (
      <div className="flex flex-col gap-3">
        <span className="text-[13px] text-gray-500">{b3 || ny ? 'Pregão aberto' : 'Pregões fechados'} · {itens.length} ativos</span>
        {d.carregando ? <div className="py-16 text-center text-[13px] text-gray-400">Carregando…</div> : BLOCOS_MOVEL.map(([id, altura]) => (
          <div key={`${id}-${versao}`} style={altura ? { height: altura } : undefined} className={altura ? 'flex flex-col [&>*]:min-h-0 [&>*]:flex-1' : ''}>{renderWidget(id)}</div>
        ))}
        {painel}
      </div>
    );
  }
  return (
    <>
      <GridPersonalizavel escopo="acompanhamento_v1" titulo="Mercado" acessorio={acessorio} acoes={acoes}
        catalogo={CATALOGO} permitidos={CATALOGO} renderWidget={(id) => <Fragment key={`${id}-${versao}`}>{renderWidget(id)}</Fragment>}
        abaixo={filtros} pronto={!d.carregando} onAtualizar={d.recarregar} atualizando={d.lendo} oculto={oculto}
        onOcultar={alternarOculto} />
      {painel}
      {pop}
    </>
  );
}
