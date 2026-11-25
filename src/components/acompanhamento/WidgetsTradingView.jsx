import { useEffect, useRef } from 'react';
import { simboloTradingView, useTemaEscuro } from '../rendaVariavel/WidgetTradingView.jsx';

// OS BLOCOS DO TRADINGVIEW no Acompanhamento (25/11/2026, o mockup "Acompanhamento das ações"): os widgets GRÁTIS deles,
// desenhados por eles (o app não recebe os números), com a marca à vista — o link embaixo é a condição. O MAPA DO MERCADO
// (o Ibovespa, o S&P 500 ou o Nasdaq 100 inteiros: centenas de ações que as fontes grátis do app não aguentariam cotar a cada
// minuto), a FITA DE COTAÇÕES, as NOTÍCIAS e o CALENDÁRIO ECONÔMICO. O tema segue o do app (trocar remonta o widget).

const BASE = 'https://s3.tradingview.com/external-embedding/';

function Embutido({ script, config, link, rotulo }) {
  const ref = useRef(null);
  const escuro = useTemaEscuro();
  const json = JSON.stringify({ ...config, colorTheme: escuro ? 'dark' : 'light', isTransparent: true, locale: 'br' });
  useEffect(() => {
    const caixa = ref.current;
    if (!caixa) return undefined;
    caixa.innerHTML = '';
    const alvo = document.createElement('div');
    alvo.className = 'tradingview-widget-container__widget';
    alvo.style.height = '100%';
    alvo.style.width = '100%';
    caixa.appendChild(alvo);
    const s = document.createElement('script');
    s.src = `${BASE}${script}`;
    s.type = 'text/javascript';
    s.async = true;
    s.innerHTML = json;
    caixa.appendChild(s);
    return () => { caixa.innerHTML = ''; };
  }, [script, json]);
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div ref={ref} className="tradingview-widget-container min-h-0 flex-1" />
      <div className="tradingview-widget-copyright shrink-0 pt-1.5 text-right text-[11px] text-gray-400">
        <a href={link} target="_blank" rel="noopener nofollow noreferrer" className="text-hx-2962ff hover:underline">{rotulo} por TradingView</a>
      </div>
    </div>
  );
}

// O MAPA DO MERCADO: `fonte` 'IBOV' | 'SPX500' | 'NASDAQ100'; agrupado por setor, o tamanho pelo valor de mercado
export const FONTES_MERCADO = [
  { key: 'IBOV', label: 'Ibovespa' },
  { key: 'SPX500', label: 'S&P 500' },
  { key: 'NASDAQ100', label: 'Nasdaq 100' },
];
export function MapaDoMercado({ fonte }) {
  return (
    <Embutido script="embed-widget-stock-heatmap.js" rotulo="Mapa do mercado"
      link={`https://br.tradingview.com/heatmap/stock/#%7B%22dataSource%22%3A%22${fonte}%22%7D`}
      config={{
        exchanges: [], dataSource: fonte, grouping: 'sector', blockSize: 'market_cap_basic', blockColor: 'change',
        symbolUrl: '', hasTopBar: false, isDataSetEnabled: false, isZoomEnabled: true, hasSymbolTooltip: true, isMonoSize: false,
        width: '100%', height: '100%',
      }} />
  );
}

// A FITA DE COTAÇÕES: os índices e os ativos da lista que aparecem (até 20)
export function FitaDeCotacoes({ itens }) {
  const symbols = [
    { proName: 'BMFBOVESPA:IBOV', title: 'Ibovespa' }, { proName: 'FOREXCOM:SPXUSD', title: 'S&P 500' },
    { proName: 'FX_IDC:USDBRL', title: 'Dólar' },
    ...itens.slice(0, 20).map((i) => ({ proName: simboloTradingView(i), title: i.ticker })),
  ];
  return (
    <Embutido script="embed-widget-ticker-tape.js" rotulo="Cotações" link="https://br.tradingview.com/markets/"
      config={{ symbols, showSymbolLogo: true, displayMode: 'adaptive' }} />
  );
}

export function NoticiasDoMercado() {
  return (
    <Embutido script="embed-widget-timeline.js" rotulo="Notícias" link="https://br.tradingview.com/news/"
      config={{ feedMode: 'market', market: 'stock', displayMode: 'regular', width: '100%', height: '100%' }} />
  );
}

export function CalendarioEconomico() {
  return (
    <Embutido script="embed-widget-events.js" rotulo="Calendário econômico" link="https://br.tradingview.com/economic-calendar/"
      config={{ importanceFilter: '0,1', countryFilter: 'br,us', width: '100%', height: '100%' }} />
  );
}
