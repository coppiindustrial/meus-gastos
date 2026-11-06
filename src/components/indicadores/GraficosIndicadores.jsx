import { useLayoutEffect, useRef, useState } from 'react';
import BalaoGrafico, { useBalao } from '../graficos/BalaoGrafico.jsx';
import { pontoEm } from '../../lib/indicadores.js';

// OS GRÁFICOS DOS INDICADORES (06/11/2026, o mockup aprovado "Indicadores e importações", opção A): SVG desenhado na
// LARGURA MEDIDA da caixa (o texto não estica), as cores das séries do app e o balão do app no hover — a guia vertical
// e o valor de cada série naquela data. `GraficoLinhas`: linhas no tempo (a Selic em DEGRAUS, `degrau`), com a área entre
// duas séries (`area`: o juro real) e o último valor de cada uma na calha da direita. `ColunasMes`: uma coluna por mês
// (o IPCA de cada mês; a deflação em outra cor).

const MES3 = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const utc = (iso) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +(iso.slice(8, 10) || 15));
const dataBR = (iso) => (iso.length > 7 ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : `${MES3[+iso.slice(5, 7) - 1]}/${iso.slice(0, 4)}`);
const mesCurto = (iso) => `${MES3[+iso.slice(5, 7) - 1]}/${iso.slice(2, 4)}`;

function useCaixa(altMin) {
  const ref = useRef(null);
  const [tam, setTam] = useState({ w: 600, h: altMin });
  useLayoutEffect(() => {
    if (!ref.current) return undefined;
    const ro = new ResizeObserver(([e]) => setTam({ w: Math.max(260, e.contentRect.width), h: Math.max(altMin, e.contentRect.height) }));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, [altMin]);
  return [ref, tam];
}
// passos "redondos" para a grade: 1, 2, 2,5, 5 × 10^n
function passoRedondo(bruto) {
  const p = 10 ** Math.floor(Math.log10(bruto || 1));
  return [1, 2, 2.5, 5, 10].map((m) => m * p).find((x) => x >= bruto) ?? 10 * p;
}

// `series`: [{ key, rotulo, cor, pontos: [['AAAA-MM-DD', v]], degrau? }] · `formatar(v)`: o texto do valor ·
// `area`: [keyDeCima, keyDeBaixo] (a área entre as duas) · `formatarEixo(v)`.
export function GraficoLinhas({ series, formatar, formatarEixo = formatar, area = null, altMin = 180, mensal = false }) {
  const [ref, { w, h }] = useCaixa(altMin);
  const balao = useBalao(230, 120);
  const vivas = series.filter((s) => s.pontos?.length);
  if (!vivas.length) return <div ref={ref} className="flex h-full min-h-[120px] items-center justify-center text-[12.5px] text-gray-400">Sem os dados agora.</div>;
  const E = 52; const D = 104; const T = 12; const B = 24;
  const datas = vivas.flatMap((s) => s.pontos.map((p) => p[0])).sort();
  const x0 = utc(datas[0]); const x1 = utc(datas[datas.length - 1]);
  const vals = vivas.flatMap((s) => s.pontos.map((p) => p[1]));
  let lo = Math.min(...vals); let hi = Math.max(...vals);
  const passo = passoRedondo((hi - lo || Math.abs(hi) || 1) / 4);
  lo = Math.floor(lo / passo) * passo; hi = Math.ceil(hi / passo) * passo;
  if (hi === lo) hi = lo + passo;
  const X = (iso) => E + ((utc(iso) - x0) / (x1 - x0 || 1)) * (w - E - D);
  const Y = (v) => T + ((hi - v) / (hi - lo)) * (h - T - B);
  const caminho = (s) => s.pontos.map((p, i) => {
    if (!i) return `M${X(p[0]).toFixed(1)} ${Y(p[1]).toFixed(1)}`;
    return s.degrau ? `H${X(p[0]).toFixed(1)} V${Y(p[1]).toFixed(1)}` : `L${X(p[0]).toFixed(1)} ${Y(p[1]).toFixed(1)}`;
  }).join(' ') + (s.degrau ? ` H${X(datas[datas.length - 1]).toFixed(1)}` : '');
  const grade = [];
  for (let v = lo; v <= hi + 1e-9; v += passo) grade.push(v);
  // os meses embaixo: uns 6 rótulos
  const meses = [];
  for (let c = datas[0].slice(0, 7); c <= datas[datas.length - 1].slice(0, 7);) {
    meses.push(`${c}-01`);
    const [y, m] = c.split('-').map(Number);
    c = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
  }
  const cada = Math.max(1, Math.ceil(meses.length / Math.max(2, Math.floor((w - E - D) / 70))));
  // as pontas da direita: o último valor de cada série (afastadas quando se tocam)
  const pontas = vivas.map((s) => ({ s, v: s.pontos[s.pontos.length - 1][1] })).sort((a, b) => Y(a.v) - Y(b.v));
  pontas.forEach((p, i) => { p.y = Y(p.v) + 4; if (i && p.y - pontas[i - 1].y < 15) p.y = pontas[i - 1].y + 15; });
  // o hover: a data sob o cursor e o valor de cada série nela
  const ativo = balao.ativo?.data;
  const mover = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const fr = Math.max(0, Math.min(1, (e.clientX - r.left - E) / (w - E - D)));
    const alvo = new Date(x0 + fr * (x1 - x0)).toISOString().slice(0, 10);
    const d = datas.filter((x) => x <= alvo).pop() ?? datas[0];
    balao.aoMover({ data: d })(e);
  };
  let poligono = null;
  if (area) {
    const [a, b] = area.map((k) => vivas.find((s) => s.key === k));
    if (a && b) {
      const volta = [...b.pontos].reverse().map((p) => `L${X(p[0]).toFixed(1)} ${Y(p[1]).toFixed(1)}`).join(' ');
      poligono = `${caminho(a)} L${X(b.pontos[b.pontos.length - 1][0]).toFixed(1)} ${Y(b.pontos[b.pontos.length - 1][1]).toFixed(1)} ${volta.replace(/^L/, 'L')} Z`;
    }
  }
  return (
    <div ref={ref} className="relative h-full min-h-0">
      <svg width={w} height={h} className="block" role="img" aria-label={vivas.map((s) => s.rotulo).join(', ')}
        onMouseMove={mover} onMouseLeave={balao.aoSair}>
        {grade.map((v) => (
          <g key={v}>
            <line x1={E} x2={w - D} y1={Y(v)} y2={Y(v)} className="stroke-current text-gray-200" strokeDasharray="3 3" />
            <text x={E - 8} y={Y(v) + 4} textAnchor="end" className="fill-current text-[11px] text-gray-400">{formatarEixo(v)}</text>
          </g>
        ))}
        {poligono && <path d={poligono} style={{ fill: vivas.find((s) => s.key === area[0]).cor, fillOpacity: 0.08 }} />}
        {vivas.map((s) => <path key={s.key} d={caminho(s)} fill="none" strokeWidth="2.2" strokeLinejoin="round" style={{ stroke: s.cor }} />)}
        {meses.map((m, i) => (meses.length - 1 - i) % cada === 0 && (
          <text key={m} x={Math.max(E + 14, Math.min(w - D - 14, X(m)))} y={h - 7} textAnchor="middle" className="fill-current text-[11px] text-gray-400">{mesCurto(m)}</text>
        ))}
        {pontas.map((p) => (
          <text key={p.s.key} x={w - D + 8} y={p.y} className="text-[11.5px] font-semibold tabular-nums" style={{ fill: p.s.cor }}>{formatar(p.v)}</text>
        ))}
        {ativo && (
          <g>
            <line x1={X(ativo)} x2={X(ativo)} y1={T} y2={h - B} className="stroke-current text-gray-400" strokeDasharray="3 3" />
            {vivas.map((s) => { const p = pontoEm(s.pontos, ativo); return p && <circle key={s.key} cx={X(ativo)} cy={Y(p[1])} r="3.5" className="fill-current text-white" strokeWidth="2" style={{ stroke: s.cor }} />; })}
          </g>
        )}
      </svg>
      {ativo && (
        <BalaoGrafico pos={balao.pos} largura={230} titulo={mensal ? dataBR(ativo.slice(0, 7)) : dataBR(ativo)}
          itens={vivas.map((s) => { const p = pontoEm(s.pontos, ativo); return { rotulo: s.rotulo, valor: p ? formatar(p[1]) : '—', cor: s.cor }; })} />
      )}
    </div>
  );
}

// `pontos`: [['AAAA-MM', v]] · `formatar(v)` · `cor` / `corNegativo`.
export function ColunasMes({ pontos, formatar, cor, corNegativo, altMin = 170, destacarDesde = null }) {
  const [ref, { w, h }] = useCaixa(altMin);
  const balao = useBalao(200, 80);
  if (!pontos?.length) return <div ref={ref} className="flex h-full min-h-[120px] items-center justify-center text-[12.5px] text-gray-400">Sem os dados agora.</div>;
  const E = 40; const T = 18; const B = 24;
  const vals = pontos.map((p) => p[1]);
  const passo = passoRedondo((Math.max(...vals, 0) - Math.min(...vals, 0) || 1) / 4);
  const lo = Math.floor(Math.min(0, ...vals) / passo) * passo; const hi = Math.ceil(Math.max(0, ...vals) / passo) * passo || passo;
  const Y = (v) => T + ((hi - v) / (hi - lo)) * (h - T - B);
  const bw = (w - E - 6) / pontos.length;
  const grade = [];
  for (let v = lo; v <= hi + 1e-9; v += passo) grade.push(Math.round(v * 1000) / 1000);
  const i = balao.ativo?.i;
  return (
    <div ref={ref} className="relative h-full min-h-0">
      <svg width={w} height={h} className="block" role="img" aria-label="Cada mês" onMouseLeave={balao.aoSair}>
        {grade.map((v) => (
          <g key={v}>
            <line x1={E} x2={w - 6} y1={Y(v)} y2={Y(v)} className="stroke-current text-gray-200" strokeDasharray={v === 0 ? undefined : '3 3'} />
            <text x={E - 6} y={Y(v) + 4} textAnchor="end" className="fill-current text-[11px] text-gray-400">{formatar(v)}</text>
          </g>
        ))}
        {pontos.map(([c, v], k) => {
          const x = E + k * bw + bw * 0.18; const bwi = Math.max(2, bw * 0.64);
          const y = Y(Math.max(0, v)); const alt = Math.max(1, Math.abs(Y(v) - Y(0)));
          const claro = destacarDesde && c < destacarDesde;
          return (
            <g key={c} onMouseMove={balao.aoMover({ i: k })}>
              <rect x={E + k * bw} y={T} width={bw} height={h - T - B} fill="transparent" />
              <rect x={x} y={y} width={bwi} height={alt} rx="2" style={{ fill: v < 0 ? corNegativo : cor, opacity: i === undefined || i === k ? (claro ? 0.45 : 1) : 0.35 }} />
              {(c.slice(5, 7) === '01' || k === pontos.length - 1) && <text x={x + bwi / 2} y={h - 7} textAnchor="middle" className="fill-current text-[11px] text-gray-400">{mesCurto(`${c}-01`)}</text>}
            </g>
          );
        })}
      </svg>
      {i !== undefined && pontos[i] && <BalaoGrafico pos={balao.pos} largura={200} titulo={dataBR(pontos[i][0])} itens={[{ rotulo: pontos[i][1] < 0 ? 'Deflação' : 'Inflação', valor: formatar(pontos[i][1], true), cor: pontos[i][1] < 0 ? corNegativo : cor }]} />}
    </div>
  );
}
