import { useEffect, useRef, useState } from 'react';

// A ABA AVANÇADO DO GRÁFICO DO ATIVO (13/11/2026, o mockup "O gráfico do ativo"): o widget "Advanced Chart" do TradingView —
// velas, volume, indicadores, ferramentas de desenho, do minuto a décadas —, desenhado POR ELES (o app não recebe os números,
// então aqui não há as suas operações nem o preço médio). Grátis com a marca deles à vista: o link embaixo é a condição.
// O tema acompanha o do app (`data-tema` no <html>); trocar de tema remonta o widget. A B3 vai como "BMFBOVESPA:TICKER";
// os EUA, só o ticker (o TradingView acha a bolsa).

const SCRIPT = 'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js';

function useTemaEscuro() {
  const ler = () => document.documentElement.getAttribute('data-tema') === 'escuro';
  const [escuro, setEscuro] = useState(ler);
  useEffect(() => {
    const mo = new MutationObserver(() => setEscuro(ler()));
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-tema'] });
    return () => mo.disconnect();
  }, []);
  return escuro;
}

export const simboloTradingView = (ativo) => (ativo.mercado === 'EUA' ? ativo.ticker : `BMFBOVESPA:${ativo.ticker}`);

export default function WidgetTradingView({ ativo }) {
  const ref = useRef(null);
  const escuro = useTemaEscuro();
  const simbolo = simboloTradingView(ativo);
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
    s.src = SCRIPT;
    s.type = 'text/javascript';
    s.async = true;
    s.innerHTML = JSON.stringify({
      autosize: true, symbol: simbolo, interval: 'D', timezone: 'America/Sao_Paulo', theme: escuro ? 'dark' : 'light', style: '1',
      locale: 'br', allow_symbol_change: false, withdateranges: true, hide_side_toolbar: false, details: false, calendar: false,
      backgroundColor: escuro ? '#1c1c1c' : '#ffffff', gridColor: escuro ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.06)',
      support_host: 'https://www.tradingview.com',
    });
    caixa.appendChild(s);
    return () => { caixa.innerHTML = ''; };
  }, [simbolo, escuro]);
  const link = `https://br.tradingview.com/symbols/${ativo.mercado === 'EUA' ? ativo.ticker : `BMFBOVESPA-${ativo.ticker}`}/`;
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div ref={ref} className="tradingview-widget-container min-h-0 flex-1" />
      <div className="tradingview-widget-copyright shrink-0 px-1 pt-1.5 text-right text-[11px] text-gray-400">
        <a href={link} target="_blank" rel="noopener nofollow noreferrer" className="text-[#2962ff] hover:underline">Gráfico de {ativo.ticker} por TradingView</a>
      </div>
    </div>
  );
}
