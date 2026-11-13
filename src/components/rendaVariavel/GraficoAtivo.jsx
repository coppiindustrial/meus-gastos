import { useId, useLayoutEffect, useRef, useState } from 'react';
import BalaoGrafico, { useBalao } from '../graficos/BalaoGrafico.jsx';
import { COR_FALTOU } from '../graficos/GraficosVisao.jsx';
import { DICA } from '../../lib/coresGrafico.js';
import { escalaPreco, rotulosX } from '../../lib/graficoAtivo.js';

// O GRÁFICO DO PREÇO DE UM ATIVO (13/11/2026, os mockups "O gráfico do ativo" e "Desempenho, volume, dividendos e
// resultados"): SVG na LARGURA MEDIDA da caixa (o chrome dos Indicadores), o eixo à esquerda (calha de 56px), a LINHA com a
// área ou as VELAS (sobe na cor das entradas, cai no vermelho do "faltou"), o PREÇO MÉDIO EM DEGRAUS tracejado, as SUAS
// compras e vendas em cima da curva (▲ ▼), e à direita as etiquetas do último preço e do preço médio. Embaixo do preço, a
// FAIXA DOS EVENTOS da empresa — D o dividendo na data-ex (cheio quando você tinha cotas), E o resultado (a linha tracejada
// sobe até o preço), S o desdobramento; o próximo resultado, tracejado na calha da direita — e as BARRAS DO VOLUME (verdes no
// dia que subiu, vermelhas no que caiu). No 1D o eixo é o pregão inteiro (a curva para na hora de agora, o resto hachurado)
// com o fechamento de ontem tracejado. Hover: a guia do preço ao volume, o ponto e o balão que quem chama monta (`balaoDe`);
// num evento, o balão dele (`balaoDoEvento`). As contas moram em `lib/graficoAtivo.js`.
//
// `pontos`: [{ d0, d, o, h, l, c, v }] já na moeda da tela; no 1D, [{ t, o, h, l, c, v }] com `sessao` = { inicio, fim } (s).
// `pmDe(p)`: o preço médio daquele ponto (ou null); `marcas`: [{ j, op }] (as suas operações); `eventos`: [{ j, ev, cheio? }];
// `proximo`: o próximo resultado ({ data }) ou null; `volume`: as barras; `comEventos`: a faixa dos eventos.
// `op(k)`: a opacidade de cada tipo ('preco', 'compra', 'venda', 'pm', 'dividendo', 'resultado', 'desdobramento', 'volume' —
// o `opSerie` da legenda).

const E = 56; const D = 88; const T = 12; const B = 26;
const FAIXA_EV = 24; const ALT_VOL = 60; const VAO_VOL = 6;
const COR_SOBE = 'var(--serie-entradas)';
const COR_CAI = COR_FALTOU;
export const COR_MARCA = { compra: 'var(--serie-entradas)', venda: 'var(--origem-fixo)' };
export const COR_EVENTO = { dividendo: 'var(--serie-entradas)', resultado: 'var(--origem-fixo)', desdobramento: 'var(--origem-manual)' };
export const LETRA_EVENTO = { dividendo: 'D', resultado: 'E', desdobramento: 'S' };
const volumeCurto = (v) => (v >= 1e9 ? `${(v / 1e9).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} bi` : v >= 1e6 ? `${(v / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 0 })} mi` : v >= 1e3 ? `${(v / 1e3).toLocaleString('pt-BR', { maximumFractionDigits: 0 })} mil` : String(Math.round(v)));
const dataCurta = (d) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

function useCaixa(altMin) {
  const ref = useRef(null);
  const [tam, setTam] = useState({ w: 700, h: altMin });
  useLayoutEffect(() => {
    if (!ref.current) return undefined;
    const ro = new ResizeObserver(([e]) => setTam({ w: Math.max(280, e.contentRect.width), h: Math.max(altMin, e.contentRect.height) }));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, [altMin]);
  return [ref, tam];
}

// a marca redonda de um evento (a letra no meio); `vazia`: o contorno (o dividendo sem cotas, o próximo resultado)
function MarcaEvento({ x, y, tipo, vazia = false, tracejada = false, opacidade = 1, onMove, onLeave }) {
  const cor = COR_EVENTO[tipo];
  return (
    <g className="cursor-default transition-opacity duration-150" style={{ opacity: opacidade }} onMouseMove={onMove} onMouseLeave={onLeave}>
      <circle cx={x} cy={y} r="7.5" strokeWidth="1.5" strokeDasharray={tracejada ? '2.5 2' : undefined}
        className={vazia ? 'fill-current text-white' : ''} style={vazia ? { stroke: cor } : { fill: cor, stroke: cor }} />
      <text x={x} y={y + 3.3} textAnchor="middle" className="pointer-events-none text-[9.5px] font-bold" style={{ fill: vazia ? cor : '#fff' }}>{LETRA_EVENTO[tipo]}</text>
    </g>
  );
}

export default function GraficoAtivo({
  pontos, tipo = 'linha', per, sessao = null, anterior = null, pmDe = null, marcas = [], eventos = [], proximo = null,
  volume = false, comEventos = false, op = () => 1, cor, balaoDe, balaoDoEvento = null, altMin = 300,
}) {
  const [ref, { w, h }] = useCaixa(altMin);
  const balao = useBalao(280, 200);
  const gid = `ga${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  if (!pontos?.length) return <div ref={ref} className="h-full min-h-[260px]" />;

  const temVol = volume && pontos.some((p) => p.v);
  const faixaEv = comEventos ? FAIXA_EV : 0;
  const altVol = temVol ? ALT_VOL : 0;
  const iw = w - E - D;
  const ih = Math.max(120, h - T - B - faixaEv - (temVol ? altVol + VAO_VOL : 0));
  const yFaixa = T + ih + faixaEv / 2 + 1;
  const yVol0 = T + ih + faixaEv + (temVol ? VAO_VOL : 0);
  const yVol1 = yVol0 + altVol;
  const n = pontos.length;
  const intra = !!sessao;
  const frac = intra
    ? (p) => (p.t - sessao.inicio) / Math.max(1, sessao.fim - sessao.inicio)
    : (_p, j) => (tipo === 'velas' ? (j + 0.5) / n : n > 1 ? j / (n - 1) : 0.5);
  const X = (f) => E + f * iw;

  // a escala: os preços do período (as velas pela máxima e a mínima), o fechamento de ontem no 1D e o preço médio visível
  let lo = Infinity; let hi = -Infinity;
  pontos.forEach((p) => { const a = tipo === 'velas' ? p.l : p.c; const b = tipo === 'velas' ? p.h : p.c; if (a < lo) lo = a; if (b > hi) hi = b; });
  if (anterior) { lo = Math.min(lo, anterior); hi = Math.max(hi, anterior); }
  const pms = pmDe ? pontos.map((p) => pmDe(p)) : [];
  pms.forEach((v) => { if (v !== null && v !== undefined) { lo = Math.min(lo, v); hi = Math.max(hi, v); } });
  const esc = escalaPreco(lo, hi);
  const Y = (v) => T + (1 - esc.fracao(v)) * ih;
  // os números do eixo com as casas do passo (650 · 9,90 · 10,25); as etiquetas com duas
  const casasEixo = esc.passo >= 1 && Number.isInteger(esc.passo) ? 0 : Number.isInteger(Math.round(esc.passo * 1e6) / 1e5) ? 1 : 2;
  const formatarEixo = (v, etiqueta = false) => v.toLocaleString('pt-BR', { minimumFractionDigits: etiqueta ? 2 : casasEixo, maximumFractionDigits: etiqueta ? 2 : casasEixo });

  // o eixo X: no 1D, as horas do pregão (no horário de Brasília); senão, a virada do mês ou do ano, sem se encostarem
  const xs = [];
  if (intra) {
    const hora = (s) => new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' }).format(new Date(s * 1000));
    for (let s = Math.ceil(sessao.inicio / 3600) * 3600; s <= sessao.fim; s += 3600) xs.push({ x: X((s - sessao.inicio) / (sessao.fim - sessao.inicio)), texto: hora(s) });
  } else {
    let ult = -1e9;
    rotulosX(pontos, per).forEach((r) => { const x = X(frac(pontos[r.j], r.j)); if (x - ult >= 58 && x < w - D - 12) { xs.push({ x, texto: r.texto }); ult = x; } });
  }

  // a série
  let serie = null;
  if (tipo === 'linha') {
    const d = pontos.map((p, j) => `${j ? 'L' : 'M'}${X(frac(p, j)).toFixed(1)} ${Y(p.c).toFixed(1)}`).join('');
    const xi = X(frac(pontos[0], 0)).toFixed(1); const xf = X(frac(pontos[n - 1], n - 1)).toFixed(1);
    serie = (
      <g className="transition-opacity duration-150" style={{ opacity: op('preco') }}>
        <path d={`${d}L${xf} ${T + ih}L${xi} ${T + ih}Z`} fill={`url(#${gid})`} />
        <path d={d} fill="none" strokeWidth="1.75" strokeLinejoin="round" strokeLinecap="round" style={{ stroke: cor }} />
      </g>
    );
  } else {
    const vagas = intra ? Math.max(n, (sessao.fim - sessao.inicio) / 300) : n;
    const bw = Math.max(1, Math.min(9, (iw / vagas) * 0.62));
    serie = (
      <g className="transition-opacity duration-150" style={{ opacity: op('preco') }}>
        {pontos.map((p, j) => {
          const x = X(frac(p, j)); const c = p.c >= p.o ? COR_SOBE : COR_CAI;
          const yo = Y(p.o); const yc = Y(p.c);
          return (
            <g key={j} style={{ stroke: c, fill: c }}>
              <line x1={x} x2={x} y1={Y(p.h)} y2={Y(p.l)} strokeWidth="1" />
              <rect x={x - bw / 2} y={Math.min(yo, yc)} width={bw} height={Math.max(1, Math.abs(yc - yo))} rx={bw > 4 ? 1 : 0} strokeWidth="0" />
            </g>
          );
        })}
      </g>
    );
  }

  // o volume: a barra de cada ponto, na cor de quanto andou contra o ponto anterior
  let barrasVol = null;
  let maxVol = 0;
  if (temVol) {
    maxVol = Math.max(...pontos.map((p) => p.v ?? 0));
    const vagas = intra ? Math.max(n, (sessao.fim - sessao.inicio) / 300) : n;
    const bw = Math.max(1, Math.min(8, (iw / vagas) * 0.7));
    barrasVol = (
      <g className="transition-opacity duration-150" style={{ opacity: op('volume') }}>
        {pontos.map((p, j) => {
          if (!p.v) return null;
          const ant = j ? pontos[j - 1].c : (anterior ?? p.o);
          const alt = Math.max(1, (p.v / (maxVol || 1)) * altVol);
          return <rect key={j} x={X(frac(p, j)) - bw / 2} y={yVol1 - alt} width={bw} height={alt} style={{ fill: p.c >= ant ? COR_SOBE : COR_CAI }} opacity="0.5" />;
        })}
      </g>
    );
  }

  // o preço médio em degraus (some onde não havia cotas)
  let caminhoPm = '';
  if (pmDe) {
    let ligado = false;
    pontos.forEach((p, j) => {
      const v = pms[j];
      if (v === null || v === undefined) { ligado = false; return; }
      const x = X(frac(p, j)).toFixed(1); const y = Y(v).toFixed(1);
      caminhoPm += ligado ? `H${x}V${y}` : `M${x} ${y}`;
      ligado = true;
    });
    if (caminhoPm && ligado) caminhoPm += `H${X(frac(pontos[n - 1], n - 1)).toFixed(1)}`;
  }

  // as etiquetas da direita: o último preço (na cor da série) e o preço médio de hoje (tracejada); afastadas se se tocam
  const ultimo = pontos[n - 1];
  const etiquetas = [{ y: Y(ultimo.c), texto: formatarEixo(ultimo.c, true), cheia: true }];
  const pmHoje = pms.length ? pms[n - 1] : null;
  if (pmHoje !== null && pmHoje !== undefined) {
    let y = Y(pmHoje);
    if (Math.abs(y - etiquetas[0].y) < 21) y = etiquetas[0].y + (y >= etiquetas[0].y ? 21 : -21);
    etiquetas.push({ y, texto: `PM ${formatarEixo(pmHoje, true)}` });
  }

  const alvo = balao.ativo;
  const j0 = alvo?.j;
  const sob = j0 !== undefined && j0 !== null ? pontos[j0] : null;
  const mover = (e) => {
    const r = e.currentTarget.getBoundingClientRect(); // o retângulo do hover já começa depois da calha do eixo
    const f = (e.clientX - r.left) / (r.width || 1);
    let best = 0; let bd = Infinity;
    pontos.forEach((p, j) => { const dd = Math.abs(frac(p, j) - f); if (dd < bd) { bd = dd; best = j; } });
    balao.aoMover({ j: best })(e);
  };
  const moverEvento = (ev) => (e) => { e.stopPropagation(); balao.aoMover({ ev })(e); };
  const info = alvo?.ev ? balaoDoEvento?.(alvo.ev) : sob ? balaoDe(sob, j0, marcas.filter((m) => m.j === j0).map((m) => m.op), eventos.filter((m) => m.j === j0).map((m) => m.ev)) : null;
  const agora = intra ? X(frac(pontos[n - 1], n - 1)) : null;

  return (
    <div ref={ref} className="relative h-full min-h-0">
      <svg width={w} height={h} className="block select-none" role="img" aria-label="O preço do ativo no período">
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={cor} stopOpacity="0.2" /><stop offset="1" stopColor={cor} stopOpacity="0" />
          </linearGradient>
          <pattern id={`${gid}h`} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="2" height="6" className="fill-current text-gray-200" />
          </pattern>
        </defs>
        {esc.marcas.map((v) => (
          <g key={v}>
            <line x1={E} x2={w - D + 6} y1={Y(v)} y2={Y(v)} className="stroke-current text-gray-200" strokeDasharray="3 3" />
            <text x={E - 8} y={Y(v) + 3.5} textAnchor="end" className="fill-current text-[10.5px] tabular-nums text-gray-400">{formatarEixo(v)}</text>
          </g>
        ))}
        {(comEventos || temVol) && <line x1={E} x2={w - D + 6} y1={T + ih} y2={T + ih} className="stroke-current text-gray-300" />}
        {intra && agora < w - D - 2 && (
          <>
            <rect x={agora} y={T} width={w - D - agora} height={ih} fill={`url(#${gid}h)`} opacity="0.5" />
            {w - D - agora > 150 && <text x={(agora + w - D) / 2} y={T + ih / 2} textAnchor="middle" className="fill-current text-[11px] text-gray-400">o pregão segue</text>}
          </>
        )}
        {anterior && (
          <g>
            <line x1={E} x2={w - D + 6} y1={Y(anterior)} y2={Y(anterior)} className="stroke-current text-gray-400" strokeDasharray="2 3" />
            <text x={w - D + 10} y={Y(anterior) + 3.5} className="fill-current text-[10.5px] text-gray-400">ontem</text>
          </g>
        )}
        {/* o resultado: a linha tracejada do dia, do preço à faixa dos eventos */}
        {eventos.filter((m) => m.ev.tipo === 'resultado').map(({ j, ev }) => {
          const x = X(frac(pontos[j], j));
          return <line key={`l${ev.data}`} x1={x} x2={x} y1={T} y2={T + ih} strokeDasharray="2 4" className="transition-opacity duration-150" style={{ stroke: COR_EVENTO.resultado, opacity: 0.45 * op('resultado') }} />;
        })}
        {serie}
        {barrasVol}
        {temVol && (
          <>
            <text x={E - 8} y={yVol0 + 8} textAnchor="end" className="fill-current text-[10px] tabular-nums text-gray-400">{volumeCurto(maxVol)}</text>
            <text x={E - 8} y={yVol1} textAnchor="end" className="fill-current text-[10px] text-gray-400">vol.</text>
          </>
        )}
        {caminhoPm && <path d={caminhoPm} fill="none" strokeWidth="1.25" strokeDasharray="5 4" className="stroke-current text-gray-500 transition-opacity duration-150" style={{ opacity: op('pm') }} />}
        {marcas.map(({ j, op: o }) => {
          const p = pontos[j]; const x = X(frac(p, j));
          const estilo = { fill: COR_MARCA[o.tipo], opacity: op(o.tipo) };
          if (o.tipo === 'compra') { const y = Y(tipo === 'velas' ? p.l : p.c) + 8; return <path key={o.id} d={`M${x} ${y}l6 10h-12z`} strokeWidth="1.5" className="stroke-current text-white transition-opacity duration-150" style={estilo} />; }
          if (o.tipo === 'venda') { const y = Y(tipo === 'velas' ? p.h : p.c) - 8; return <path key={o.id} d={`M${x} ${y}l6 -10h-12z`} strokeWidth="1.5" className="stroke-current text-white transition-opacity duration-150" style={estilo} />; }
          return null;
        })}
        {xs.map((a) => <text key={`${a.x}`} x={a.x} y={h - 8} textAnchor="middle" className="fill-current text-[10.5px] text-gray-400">{a.texto}</text>)}
        {etiquetas.map((g) => (
          <g key={g.texto}>
            <rect x={w - D + 8} y={g.y - 10} width={D - 10} height="20" rx="4" strokeDasharray={g.cheia ? undefined : '3 2'}
              className={g.cheia ? '' : 'fill-current text-white'} style={g.cheia ? { fill: cor } : { stroke: DICA }} />
            <text x={w - D + 8 + (D - 10) / 2} y={g.y + 4} textAnchor="middle" className={`text-[11px] font-semibold tabular-nums ${g.cheia ? '' : 'fill-current text-gray-700'}`} style={g.cheia ? { fill: '#fff' } : undefined}>{g.texto}</text>
          </g>
        ))}
        {sob && (
          <g pointerEvents="none">
            <line x1={X(frac(sob, j0))} x2={X(frac(sob, j0))} y1={T} y2={temVol ? yVol1 : T + ih} className="stroke-current text-gray-400" strokeDasharray="3 3" />
            <circle cx={X(frac(sob, j0))} cy={Y(sob.c)} r="4" strokeWidth="2" className="stroke-current text-white" style={{ fill: cor }} />
          </g>
        )}
        <rect x={E} y={T} width={iw} height={ih} fill="transparent" onMouseMove={mover} onMouseLeave={balao.aoSair} />
        {temVol && <rect x={E} y={yVol0} width={iw} height={altVol} fill="transparent" onMouseMove={mover} onMouseLeave={balao.aoSair} />}
        {/* a faixa dos eventos por cima de tudo: o hover é dela */}
        {comEventos && eventos.map(({ j, ev, cheio }) => (
          <MarcaEvento key={`${ev.tipo}${ev.data}`} x={X(frac(pontos[j], j))} y={yFaixa} tipo={ev.tipo} vazia={ev.tipo === 'dividendo' && !cheio}
            opacidade={op(ev.tipo)} onMove={moverEvento(ev)} onLeave={balao.aoSair} />
        ))}
        {comEventos && proximo && (
          <g>
            <MarcaEvento x={w - D + 16} y={yFaixa} tipo="resultado" vazia tracejada opacidade={op('resultado')} onMove={moverEvento({ ...proximo, proximo: true })} onLeave={balao.aoSair} />
            <text x={w - D + 28} y={yFaixa + 3.5} className="pointer-events-none fill-current text-[10.5px] font-semibold tabular-nums text-gray-500">{dataCurta(proximo.data)}</text>
          </g>
        )}
      </svg>
      {info && <BalaoGrafico pos={balao.pos} largura={280} titulo={info.titulo} itens={info.itens} nota={info.nota}>{info.extra}</BalaoGrafico>}
    </div>
  );
}
