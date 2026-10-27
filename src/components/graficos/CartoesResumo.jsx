import { useState } from 'react';
import BalaoGrafico, { posicaoBalao } from './BalaoGrafico.jsx';
import { COR_ENTRADAS, COR_GASTOS } from './Graficos.jsx';
import { COR_SALDO } from './GraficosVisao.jsx';
import { varCor } from '../../lib/varCor.js';
import { brlCurto, formatBRL } from '../../lib/dinheiro.js';
import { competenciaCurta, nomeCompetencia } from '../../lib/format.js';
import { variacao } from '../../lib/visaoGeral.js';

// O RESUMO NO TOPO DOS LANÇAMENTOS (a opção C do mockup, com as setas da A): três cartões — entradas,
// gastos e saldo — com a variação contra o mês anterior e a CURVA dos últimos meses na base. O cartão
// sobe de leve no hover; na curva, o mês sob o cursor ganha a guia, o ponto e o balão, e clicar abre
// aquele mês. Clicar no resto do cartão filtra a grade pelo tipo (o saldo limpa o filtro).
//
// `serie`: [{ competencia, entradas, gastos, saldo }] do mais antigo ao atual (o último é o da tela).

const SETAS = {
  entradas: <path d="M12 19V5M6 11l6-6 6 6" />,
  gastos: <path d="M12 5v14M6 13l6 6 6-6" />,
  saldo: <path d="M5 12h14M12 5v14" />,
};
// O ícone em PIXEL INTEIRO (caixa de 26, desenho de 14): com o `h-3.5` (0,875rem sobre a raiz de 87,5%
// = 12,25px) o desenho caía entre pixels e o "+" do saldo saía borrado e fora do centro.
const ICONE = 14;
const CORES = { entradas: COR_ENTRADAS, gastos: COR_GASTOS, saldo: COR_SALDO };
const ROTULOS = { entradas: 'Entradas', gastos: 'Gastos', saldo: 'Saldo' };
// Para quem subir é bom: entrada e saldo sim, gasto não.
const SOBE_E_BOM = { entradas: true, gastos: false, saldo: true };
const W = 300; // a largura do desenho da curva (o SVG estica para o cartão)
const H = 54;

function Variacao({ v, sobeBom }) {
  if (v === null) return null;
  const bom = sobeBom ? v >= 0 : v <= 0;
  return (
    <span className={`inline-flex shrink-0 items-center gap-0.5 rounded-full px-[7px] py-[2px] text-[11px] font-semibold tabular-nums ${
      v === 0 ? 'bg-gray-100 text-gray-600' : bom ? 'bg-hx-dcfce7 text-hx-166534' : 'bg-hx-fee2e2 text-hx-991b1b'}`}
      title="Contra o mês anterior">
      {v > 0 ? '▲' : v < 0 ? '▼' : ''} {Math.abs(v).toLocaleString('pt-BR')}%
    </span>
  );
}

function Cartao({ chave, serie, ativo: filtroAtivo, onFiltrar, onMes }) {
  const [hover, setHover] = useState(null); // { i, pos }
  const cor = CORES[chave];
  const vals = serie.map((m) => m[chave]);
  const atual = vals[vals.length - 1];
  const antes = vals.length > 1 ? vals[vals.length - 2] : null;
  const v = antes === null ? null : chave === 'saldo'
    ? (antes ? Math.round(((atual - antes) / Math.abs(antes)) * 100) : null)
    : variacao(atual, antes);
  const media = Math.round(vals.reduce((s, x) => s + x, 0) / Math.max(1, vals.length));

  const min = Math.min(0, ...vals);
  const max = Math.max(1, ...vals);
  const x = (i) => 6 + (i / Math.max(1, vals.length - 1)) * (W - 12);
  const y = (val) => H - 6 - ((val - min) / (max - min || 1)) * (H - 14);
  const pts = vals.map((val, i) => `${x(i).toFixed(1)},${y(val).toFixed(1)}`).join(' ');
  const gradId = `grad-${chave}`;
  const pontoAtivo = hover ? hover.i : vals.length - 1;

  const mover = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const frac = (e.clientX - r.left) / r.width;
    const i = Math.max(0, Math.min(vals.length - 1, Math.round(frac * (vals.length - 1))));
    setHover({ i, pos: posicaoBalao(e, 230, 96) });
  };
  const mes = hover && serie[hover.i];
  const antesHover = hover && hover.i > 0 ? vals[hover.i - 1] : null;
  const vHover = hover && antesHover !== null ? (chave === 'saldo'
    ? (antesHover ? Math.round(((vals[hover.i] - antesHover) / Math.abs(antesHover)) * 100) : null)
    : variacao(vals[hover.i], antesHover)) : null;

  return (
    // O HOVER SÓ MEXE EM `transform` E `opacity` (a placa de vídeo faz sozinha): o cartão sobe 2px INTEIROS
    // (o -0,5 do Tailwind dava 1,75px e o texto tremia ao re-rasterizar) e a sombra é uma camada própria
    // que só ACENDE — animar `box-shadow` repintava o cartão a cada quadro, e era o "duro" do gesto. A
    // curva tem o seu `overflow-hidden`, para a sombra do cartão poder sair pelas bordas.
    <div role="button" tabIndex={0} onClick={onFiltrar} onKeyDown={(e) => { if (e.key === 'Enter') onFiltrar(); }}
      title={chave === 'saldo' ? 'Clique para ver entradas e gastos' : `Clique para ver só ${ROTULOS[chave].toLowerCase()}`}
      className={`card group relative isolate flex min-w-0 cursor-pointer flex-col !rounded-[10px] transition-[transform,border-color] duration-300 ease-[cubic-bezier(.2,.8,.2,1)] will-change-transform hover:-translate-y-[2px] hover:border-gray-300 motion-reduce:transition-none motion-reduce:hover:translate-y-0 ${
        filtroAtivo ? 'ring-2 ring-gray-800' : ''}`}>
      <span aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 rounded-[10px] opacity-0 shadow-[0_14px_30px_-10px_rgba(20,28,44,.22)] transition-opacity duration-300 ease-out group-hover:opacity-100" />
      <div className="flex flex-col gap-1 px-3 pt-2.5 sm:px-4 sm:pt-3.5">
        <div className="flex items-center gap-2">
          <span className="hidden h-[26px] w-[26px] shrink-0 items-center justify-center rounded-[7px] sm:inline-flex"
            style={{ background: `color-mix(in srgb, ${cor} 14%, ${varCor('#ffffff', 'fundo')})`, color: cor }}>
            <svg viewBox="0 0 24 24" width={ICONE} height={ICONE} className="block shrink-0" fill="none" stroke="currentColor" strokeWidth="2.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{SETAS[chave]}</svg>
          </span>
          <span className="truncate text-[10.5px] font-semibold uppercase tracking-wide text-gray-500 sm:text-[12px] sm:normal-case sm:tracking-normal sm:text-gray-600">{ROTULOS[chave]}</span>
          <span className="flex-1" />
          <span className="hidden sm:inline-flex"><Variacao v={v} sobeBom={SOBE_E_BOM[chave]} /></span>
        </div>
        <div className={`whitespace-nowrap font-semibold tabular-nums tracking-[-0.02em] ${
          chave === 'entradas' ? 'text-green-700' : chave === 'saldo' && atual < 0 ? 'text-hx-c0393d' : 'text-gray-900'}`}>
          <span className="text-[15px] sm:hidden">{brlCurto(atual)}</span>
          <span className="hidden text-[22px] sm:inline">{formatBRL(atual)}</span>
        </div>
        <div className="hidden truncate text-[11.5px] text-gray-500 sm:block">média de {vals.length} meses {formatBRL(media)}</div>
      </div>
      {/* A CURVA, na base do cartão. O SVG estica na largura (`preserveAspectRatio="none"`) com o traço
          sem escalar; o ponto é uma <div>, para continuar redondo — e mora numa caixa da MESMA altura do
          SVG (54px): medido contra a caixa de fora, que tem os meses embaixo, o ponto ficava acima da reta. */}
      <div className="mt-2 hidden overflow-hidden rounded-b-[10px] sm:block" onMouseMove={mover} onMouseLeave={() => setHover(null)}
        onClick={(e) => { if (hover) { e.stopPropagation(); onMes(serie[hover.i].competencia); } }}>
        <div className="relative h-[54px]">
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="block h-[54px] w-full overflow-visible" aria-hidden="true">
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={cor} stopOpacity=".22" />
              <stop offset="1" stopColor={cor} stopOpacity="0" />
            </linearGradient>
          </defs>
          <polygon points={`${x(0)},${H} ${pts} ${x(vals.length - 1)},${H}`} fill={`url(#${gradId})`} />
          <polyline points={pts} fill="none" stroke={cor} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          {hover && <line x1={x(hover.i)} x2={x(hover.i)} y1="0" y2={H} stroke={varCor('#d1d5db', 'borda')} strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />}
        </svg>
        <span className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white transition-[left,top,width,height] duration-150 ease-out"
          style={{ left: `${(x(pontoAtivo) / W) * 100}%`, top: `${(y(vals[pontoAtivo]) / H) * 100}%`, width: hover ? 10 : 8, height: hover ? 10 : 8, background: cor }} />
        </div>
        <div className="flex justify-between px-2 pb-2 pt-0.5 text-[9.5px] text-gray-400">
          {serie.map((m, i) => (
            <span key={m.competencia} className={i === pontoAtivo && hover ? 'font-semibold text-gray-800' : ''}>{competenciaCurta(m.competencia).slice(0, 3)}</span>
          ))}
        </div>
      </div>
      {mes && (
        <BalaoGrafico pos={hover.pos} largura={230} titulo={nomeCompetencia(mes.competencia)}
          itens={[{ rotulo: ROTULOS[chave], valor: formatBRL(vals[hover.i]), cor }]}
          nota={[vHover !== null && `${vHover > 0 ? '+' : ''}${vHover}% sobre ${competenciaCurta(serie[hover.i - 1].competencia)}`, 'Clique para abrir o mês'].filter(Boolean).join(' · ')} />
      )}
    </div>
  );
}

// `tipo`: o filtro de tipo da tela ('' | 'entrada' | 'saida'); `onTipo(t)` o troca.
export default function CartoesResumo({ serie, tipo, onTipo, onMes }) {
  return (
    <div className="grid grid-cols-3 gap-2 sm:gap-3.5">
      <Cartao chave="entradas" serie={serie} ativo={tipo === 'entrada'} onFiltrar={() => onTipo(tipo === 'entrada' ? '' : 'entrada')} onMes={onMes} />
      <Cartao chave="gastos" serie={serie} ativo={tipo === 'saida'} onFiltrar={() => onTipo(tipo === 'saida' ? '' : 'saida')} onMes={onMes} />
      <Cartao chave="saldo" serie={serie} ativo={false} onFiltrar={() => onTipo('')} onMes={onMes} />
    </div>
  );
}
