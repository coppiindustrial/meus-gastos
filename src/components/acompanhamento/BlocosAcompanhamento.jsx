import { useLayoutEffect, useMemo, useState } from 'react';
import AbasPilula from '../AbasPilula.jsx';
import MenuContexto from '../MenuContexto.jsx';
import BalaoGrafico, { posicaoBalao } from '../graficos/BalaoGrafico.jsx';
import { useDestaqueSeries } from '../graficos/LegendaSeries.jsx';
import { CartaoKpi } from '../graficos/CartoesResumo.jsx';
import { varCor } from '../../lib/varCor.js';
import {
  altasEBaixas, areasDasClasses, corDaVariacao, emPorcentoDoInicio, eventosSemRepetir, faixaDe, faixasDaEscala, mediaDasSeries, squarify, tamanhos,
} from '../../lib/acompanhamento.js';
import { CLASSES } from '../../lib/rendaVariavel.js';
import { lsGet, lsSet } from '../../lib/storage.js';

// OS BLOCOS DO ACOMPANHAMENTO (25/11/2026, o mockup "Acompanhamento das ações"): o desenho; as contas em
// `lib/acompanhamento.js` (testada). `itens` = os da lista que aparecem, cada um com `v` (a leitura ao vivo: preço, anterior,
// pontos do dia), `p` (o % do período escolhido na faixa de filtros) e `pDia`. Clicar num ativo chama `onAbrir(item)`, que
// abre o gráfico do ativo (o `PainelAtivo` da renda variável).

const CLASSE = Object.fromEntries(CLASSES.map((c) => [c.id, c]));
export const pctTxt = (p, c = 2) => (p === null || p === undefined || !Number.isFinite(p) ? '—'
  : `${p > 0.00005 ? '+' : p < -0.00005 ? '−' : ''}${Math.abs(p * 100).toLocaleString('pt-BR', { minimumFractionDigits: c, maximumFractionDigits: c })}%`);
export const corTexto = (p) => (p === null || p === undefined ? 'text-gray-400' : p > 0.00005 ? 'text-green-700' : p < -0.00005 ? 'text-hx-c0393d' : 'text-gray-500');
const num = (v, c = 2) => v.toLocaleString('pt-BR', { minimumFractionDigits: c, maximumFractionDigits: c });
export const precoTxt = (i, v = i?.v?.preco) => (v === null || v === undefined ? '—' : `${i.mercado === 'EUA' ? 'US$' : 'R$'} ${num(v)}`);
const volumeTxt = (v) => (v === null || v === undefined ? '—' : v >= 1e9 ? `${num(v / 1e9, 1)} bi` : v >= 1e6 ? `${num(v / 1e6, 1)} mi` : v >= 1e3 ? `${num(v / 1e3, 0)} mil` : String(v));

// a caixa medida (os desenhos que dependem da largura e da altura de verdade)
// (um REF DE FUNÇÃO no estado: o elemento pode ser trocado — o grid remonta o bloco —, e o observador segue o novo)
function useCaixa() {
  const [el, setEl] = useState(null);
  const [tam, setTam] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    if (!el) return undefined;
    const medir = () => setTam((a) => { const w = Math.round(el.clientWidth); const h = Math.round(el.clientHeight); return a.w === w && a.h === h ? a : { w, h }; });
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, [el]);
  return [setEl, tam];
}
// uma preferência de tela lembrada no navegador
function useLembrado(chave, padrao, validos) {
  const [v, setV] = useState(() => { const x = lsGet(chave); return validos.includes(x) ? x : padrao; });
  return [v, (n) => { setV(n); lsSet(chave, n); }];
}

export function Bloco({ titulo, sub, extra, children, className = '' }) {
  return (
    <section className={`card flex h-full flex-col overflow-hidden p-5 ${className}`}>
      <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <span className="text-[13px] font-semibold text-gray-800">{titulo}</span>
        {sub && <span className="text-[11px] text-gray-400">{sub}</span>}
        {extra && <span className="ml-auto flex items-center gap-2">{extra}</span>}
      </div>
      <div className="min-h-0 flex-1">{children}</div>
    </section>
  );
}

// A CURVA DO DIA (ou do período): o tracejado é o fechamento de antes; sobe = verde, desce = vermelho
export function Curva({ pontos, anterior, className = 'h-10 w-full' }) {
  const vals = (pontos ?? []).map((p) => p[1]);
  if (vals.length < 2) return <div className={`${className} flex items-center justify-center text-[10.5px] text-gray-300`}>sem a curva</div>;
  const ref = anterior > 0 ? anterior : vals[0];
  const lo = Math.min(ref, ...vals); const hi = Math.max(ref, ...vals); const sp = hi - lo || 1;
  const y = (v) => 3 + (1 - (v - lo) / sp) * 34;
  const pts = vals.map((v, i) => `${((i / (vals.length - 1)) * 100).toFixed(2)},${y(v).toFixed(2)}`).join(' ');
  const sobe = vals[vals.length - 1] >= ref;
  return (
    <svg viewBox="0 0 100 40" preserveAspectRatio="none" className={className} aria-hidden="true">
      <line x1="0" x2="100" y1={y(ref)} y2={y(ref)} className="text-gray-300" stroke="currentColor" strokeDasharray="2 2.5" vectorEffect="non-scaling-stroke" />
      <polyline points={pts} fill="none" className={sobe ? 'text-green-600' : 'text-hx-c0393d'} stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

// ------------------------------------------------------------ os índices (a linha de cima)
// OS CARTÕES DOS OUTROS PAINÉIS (25/11/2026, a pedido: "mais semelhante às de outras telas"): o `CartaoKpi compacto` dos
// Indicadores e do Patrimônio — o ícone, a pílula da variação, o número, a curva do dia na base com a área, o fechamento
// anterior tracejado e, no hover, o cartão que sobe, a guia, o ponto e o balão com a hora. Sobe = verde, desce = vermelho.
const COR_SOBE = varCor('#16a34a', 'texto');
const COR_DESCE = varCor('#c0393d', 'texto');
const COR_NEUTRA = varCor('#9ca3af', 'texto');
const corDoP = (p) => (p === null || p === undefined ? COR_NEUTRA : p >= 0 ? COR_SOBE : COR_DESCE);
const pilula = (p) => (p === null || p === undefined ? null : Math.round(p * 10000) / 100);
const horaTxt = (t) => {
  const d = new Date(t * 1000);
  return `${d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} · ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
};
const ICONE_INDICE = { 'IDX:USDBRL': 'dolar' };

export function CartoesIndices({ indices, media }) {
  const total = media.sobem + media.caem;
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-[repeat(auto-fit,minmax(180px,1fr))]">
      {indices.map((k) => {
        const pts = k.pontos ?? [];
        const fmt = (v) => (k.unidade === 'R$' ? `R$ ${num(v, 4)}` : `${num(v, 0)} pts`);
        return (
          <CartaoKpi key={k.chave} compacto icone={ICONE_INDICE[k.chave] ?? 'tendencia'} cor={corDoP(k.p)} rotulo={k.nome}
            valor={k.valor} variacao={pilula(k.p)} tituloVariacao="Contra o fechamento anterior"
            sub={k.anterior > 0 ? `${k.sub} · antes ${fmt(k.anterior)}` : k.sub}
            serie={pts.map(([, c]) => ({ valor: c }))} base={k.anterior > 0 ? k.anterior : null} formatar={fmt}
            tituloBalao={(i) => horaTxt(pts[i][0])}
            nota={(i) => (k.anterior > 0 ? `${pctTxt(pts[i][1] / k.anterior - 1)} sobre o fechamento anterior` : null)} />
        );
      })}
      <CartaoKpi compacto icone="mapa" cor={corDoP(media.p)} rotulo="Os seus, na média" valor={pctTxt(media.p)}
        corValor={corTexto(media.p)} sub={total ? `no dia · ${total} com cotação` : 'no dia'}
        rodape={(
          <div className="mt-auto flex items-center gap-2 px-3 pb-3 pt-2 text-[11px] tabular-nums text-gray-500">
            <span className="text-green-700">{media.sobem} sobem</span>
            <span className="flex h-[6px] flex-1 overflow-hidden rounded-full bg-gray-100">
              <span className="bg-green-600" style={{ width: `${total ? (media.sobem / total) * 100 : 0}%` }} />
              <span className="flex-1 bg-hx-c0393d" style={{ opacity: media.caem ? 1 : 0 }} />
            </span>
            <span className="text-hx-c0393d">{media.caem} caem</span>
          </div>
        )} />
    </div>
  );
}

// ------------------------------------------------------------ o mapa de calor
const TAMANHOS = [{ key: 'mercado', label: 'Valor de mercado' }, { key: 'posicao', label: 'Sua posição' }, { key: 'igual', label: 'Igual' }];
const LARG_BALAO = 250;
export function MapaDeCalor({ itens, caps, posicoes, periodoTxt, emDia, escala = 0.03, onAbrir }) {
  const faixas = faixasDaEscala(escala);
  const [modo, setModo] = useLembrado('acomp_tamanho', 'mercado', TAMANHOS.map((t) => t.key));
  const [ref, tam] = useCaixa();
  const [faixa, setFaixa] = useState(null);
  const [previa, setPrevia] = useState(null);
  const [hover, setHover] = useState(null); // { chave, pos }
  const ativa = previa ?? faixa;
  const CAB = 22; const VAO = 6;
  const { grupos, quadros } = useMemo(() => {
    if (!tam.w || !tam.h || !itens.length) return { grupos: [], quadros: [] };
    const t = tamanhos(itens, modo, { cap: caps, posicao: posicoes });
    const somas = {};
    itens.forEach((i) => { somas[i.classe] = (somas[i.classe] ?? 0) + t[i.chave]; });
    const areas = areasDasClasses(somas, { x: 0, y: 0, w: tam.w, h: tam.h });
    const gs = []; let qs = [];
    for (const a of areas) {
      const doG = itens.filter((i) => i.classe === a.classe);
      const com = doG.filter((i) => i.p !== null && i.p !== undefined);
      gs.push({ ...a, nome: CLASSE[a.classe]?.nome, cor: CLASSE[a.classe]?.cor, p: com.length ? com.reduce((s, i) => s + i.p, 0) / com.length : null });
      const dentro = { x: a.x + (a.x > 0 ? VAO / 2 : 0), y: a.y + CAB + (a.y > 0 ? VAO / 2 : 0), w: a.w - (a.x > 0 ? VAO / 2 : 0) - (a.x + a.w < tam.w - 1 ? VAO / 2 : 0), h: a.h - CAB - (a.y > 0 ? VAO / 2 : 0) - (a.y + a.h < tam.h - 1 ? VAO / 2 : 0) };
      // o squarify pesa pelo `v`, e o item já tem um `v` (a leitura ao vivo): pesa só a chave e junta o item depois
      const porChave = new Map(doG.map((i) => [i.chave, i]));
      qs = qs.concat(squarify(doG.map((i) => ({ chave: i.chave, v: t[i.chave] })), dentro).map(({ chave, x, y, w, h }) => ({ ...porChave.get(chave), x, y, w, h })));
      gs[gs.length - 1].topo = dentro.y - CAB; gs[gs.length - 1].esq = dentro.x; gs[gs.length - 1].larg = dentro.w;
    }
    return { grupos: gs, quadros: qs };
  }, [itens, modo, caps, posicoes, tam.w, tam.h]);
  const h = hover && quadros.find((q) => q.chave === hover.chave);

  return (
    <Bloco titulo="Mapa de calor · os seus" sub={`a cor é o % ${periodoTxt} · o tamanho, ${TAMANHOS.find((t) => t.key === modo).label.toLowerCase()}`}
      extra={<AbasPilula abas={TAMANHOS} valor={modo} onChange={setModo} variante="claro" altura={26} folga={2} />}>
      <div className="flex h-full flex-col">
        <div ref={ref} className="relative min-h-[160px] flex-1 overflow-hidden" onMouseLeave={() => setHover(null)}>
          {grupos.map((g) => (
            <div key={g.classe} className="pointer-events-none absolute flex h-[22px] items-center gap-1.5 truncate text-[10.5px] font-semibold uppercase tracking-[0.06em] text-gray-500"
              style={{ left: g.esq, top: g.topo, width: g.larg }}>
              <span className="h-[11px] w-[3px] shrink-0 rounded-sm" style={{ background: g.cor }} />{g.nome}
              <span className={`normal-case tracking-normal ${corTexto(g.p)}`}>{pctTxt(g.p)}</span>
            </div>
          ))}
          {quadros.map((q) => {
            const area = q.w * q.h;
            const fs = area > 26000 ? 20 : area > 9000 ? 15 : area > 3600 ? 12.5 : 10.5;
            const apagado = ativa !== null && faixaDe(q.p, escala) !== ativa;
            return (
              <button key={q.chave} type="button" onClick={() => onAbrir(q)}
                onMouseMove={(e) => setHover({ chave: q.chave, pos: posicaoBalao(e, LARG_BALAO, 190) })}
                aria-label={`${q.ticker}: ${pctTxt(q.p)} ${periodoTxt}`}
                className="absolute flex flex-col items-center justify-center overflow-hidden rounded-[2px] text-white outline-none transition-opacity duration-150 hover:z-[2] hover:outline hover:outline-2 hover:-outline-offset-2 hover:outline-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
                style={{ left: q.x + 1, top: q.y + 1, width: Math.max(0, q.w - 2), height: Math.max(0, q.h - 2), background: corDaVariacao(q.p, escala), opacity: apagado ? 0.18 : 1 }}>
                {q.w > 26 && q.h > 16 && <span className="max-w-full truncate px-1 font-bold leading-tight" style={{ fontSize: fs }}>{q.ticker}</span>}
                {q.w > 44 && q.h > 34 && <span className="font-medium opacity-90 tabular-nums" style={{ fontSize: Math.max(10, fs - 3) }}>{pctTxt(q.p)}</span>}
                {!q.deCarteira && q.w > 30 && q.h > 24 && <span aria-hidden="true" className="absolute right-1 top-1 h-[6px] w-[6px] rounded-full border-[1.3px] border-white/80" />}
              </button>
            );
          })}
          {!itens.length && <p className="pt-10 text-center text-[12.5px] text-gray-400">Nada para mostrar: cadastre ativos ou escolha o que acompanhar (✎).</p>}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-1 border-t border-gray-100 pt-2" onMouseLeave={() => setPrevia(null)}>
          <span className="mr-1 text-[11px] text-gray-400">Legenda</span>
          {faixas.map((f, i) => (
            <button key={f.rotulo} type="button" onMouseEnter={() => setPrevia(i)} onClick={() => setFaixa((x) => (x === i ? null : i))}
              aria-pressed={faixa === i} title={faixa === i ? 'Clique para soltar' : `Acender só os de ${f.rotulo}`}
              className={`h-[22px] min-w-[46px] rounded-[3px] px-2 text-[11px] font-semibold text-white transition-opacity ${faixa === i ? 'ring-2 ring-gray-400 ring-offset-1' : ''}`}
              style={{ background: corDaVariacao(f.meio, escala), opacity: ativa !== null && ativa !== i ? 0.4 : 1 }}>{f.rotulo}</button>
          ))}
          <span className="flex-1" />
          <span className="inline-flex items-center gap-1.5 text-[11px] text-gray-400"><span className="h-[6px] w-[6px] rounded-full border-[1.3px] border-gray-400" />só acompanhando</span>
        </div>
      </div>
      {h && (
        <BalaoGrafico pos={hover.pos} largura={LARG_BALAO} titulo={`${h.ticker} · ${h.nome || h.v?.nome || ''}`}
          itens={[
            { rotulo: 'Preço', valor: precoTxt(h) },
            { rotulo: emDia ? 'No dia' : `No período (${periodoTxt.replace(/^n[oa] /, '')})`, valor: pctTxt(h.p) },
            ...(!emDia ? [{ rotulo: 'No dia', valor: pctTxt(h.pDia) }] : []),
            ...(h.v?.maxima ? [{ rotulo: 'Máx. · mín. do dia', valor: `${num(h.v.maxima)} · ${num(h.v.minima)}` }] : []),
          ]}
          nota={`${h.deCarteira ? 'Na carteira' : 'Só acompanhando'} · clique para abrir o gráfico`}>
          <Curva pontos={h.v?.pontos} anterior={h.v?.anterior} className="mt-1.5 h-10 w-full" />
        </BalaoGrafico>
      )}
    </Bloco>
  );
}

// ------------------------------------------------------------ as maiores altas e baixas
export function AltasEBaixas({ itens, periodoTxt, onAbrir }) {
  const r = altasEBaixas(itens, 5);
  const mx = Math.max(0.0001, ...itens.map((i) => Math.abs(i.p ?? 0)));
  const lado = (rotulo, lista, cor) => (
    <div>
      <div className="mb-1 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-gray-400">{rotulo}</div>
      {!lista.length && <p className="py-1.5 text-[12px] text-gray-400">nenhum</p>}
      {lista.map((i) => (
        <button key={i.chave} type="button" onClick={() => onAbrir(i)}
          className="grid h-[28px] w-full grid-cols-[76px_minmax(0,1fr)_64px] items-center gap-2.5 rounded-[4px] px-1 text-left text-[12.5px] transition-colors hover:bg-gray-50">
          <span className="flex items-center gap-1.5 font-semibold text-gray-900">{i.ticker}{!i.deCarteira && <span className="h-[6px] w-[6px] rounded-full border-[1.3px] border-gray-400" />}</span>
          <span className="h-[7px] overflow-hidden rounded-[2px] bg-gray-100"><span className="block h-full rounded-[2px]" style={{ width: `${(Math.abs(i.p) / mx) * 100}%`, background: cor }} /></span>
          <span className={`text-right font-semibold tabular-nums ${corTexto(i.p)}`}>{pctTxt(i.p)}</span>
        </button>
      ))}
    </div>
  );
  return (
    <Bloco titulo="Maiores altas e baixas" sub={periodoTxt}>
      <div className="flex h-full flex-col gap-3 overflow-auto">
        {lado('Sobem', r.altas, corDaVariacao(0.03))}
        {lado('Caem', r.baixas, corDaVariacao(-0.03))}
        <div className="mt-auto flex items-center gap-2 border-t border-gray-100 pt-2 text-[11.5px] text-gray-500">
          <span>{r.sobem} sobem</span>
          <span className="flex h-[6px] flex-1 overflow-hidden rounded-full bg-gray-100">
            <span style={{ width: `${r.sobem + r.caem ? (r.sobem / (r.sobem + r.caem)) * 100 : 0}%`, background: corDaVariacao(0.03) }} />
            <span className="flex-1" style={{ background: r.caem ? corDaVariacao(-0.03) : 'transparent' }} />
          </span>
          <span>{r.caem} caem</span>
        </div>
      </div>
    </Bloco>
  );
}

// ------------------------------------------------------------ o dia de cada um
const ORDENS_DIA = [{ key: 'sua', label: 'A sua' }, { key: 'altas', label: 'Mais altas' }, { key: 'baixas', label: 'Mais baixas' }];
export function CurvasDoDia({ itens, onAbrir }) {
  const [ordem, setOrdem] = useLembrado('acomp_dia_ordem', 'sua', ORDENS_DIA.map((o) => o.key));
  const lista = ordem === 'sua' ? itens : itens.slice().sort((a, b) => ((ordem === 'altas' ? -1 : 1) * ((a.pDia ?? -9) - (b.pDia ?? -9))));
  return (
    <Bloco titulo="O dia de cada um" sub="de 5 em 5 minutos · o tracejado é o fechamento de ontem"
      extra={<AbasPilula abas={ORDENS_DIA} valor={ordem} onChange={setOrdem} variante="claro" altura={26} folga={2} />}>
      <div className="grid h-full auto-rows-min grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-2 overflow-auto">
        {lista.map((i) => (
          <button key={i.chave} type="button" onClick={() => onAbrir(i)}
            className="flex flex-col gap-0.5 rounded-[6px] border border-gray-200 px-2.5 pb-1.5 pt-2 text-left transition-colors hover:border-gray-300 hover:bg-gray-50">
            <span className="flex items-baseline gap-1.5">
              <span className="text-[12.5px] font-semibold text-gray-900">{i.ticker}</span>
              {!i.deCarteira && <span className="h-[6px] w-[6px] self-center rounded-full border-[1.3px] border-gray-400" />}
              <span className={`ml-auto text-[12px] font-semibold tabular-nums ${corTexto(i.pDia)}`}>{pctTxt(i.pDia)}</span>
            </span>
            <span className="text-[11px] tabular-nums text-gray-500">{precoTxt(i)}</span>
            <Curva pontos={i.v?.pontos} anterior={i.v?.anterior} className="mt-0.5 h-11 w-full" />
          </button>
        ))}
      </div>
    </Bloco>
  );
}

// ------------------------------------------------------------ o desempenho comparado
export const RANGES_CMP = [{ key: '5d', label: '5 dias' }, { key: '1mo', label: '1 mês' }, { key: '6mo', label: '6 meses' }, { key: 'ytd', label: 'No ano' }, { key: '1y', label: '1 ano' }];
const CORES_CMP = ['var(--serie-gastos)', 'var(--origem-fixo)', 'var(--serie-sobrou)', 'var(--serie-entradas)', '#d946ef', '#0891b2'];
const CALHA_ESQ = 44; const CALHA_DIR = 64;
export function DesempenhoComparado({ itens, serie, range, setRange, escolhidos, setEscolhidos }) {
  const [ref, tam] = useCaixa();
  const ctrl = useDestaqueSeries();
  const [menu, setMenu] = useState(null);
  const [guia, setGuia] = useState(null); // { x, pos, t }
  const series = useMemo(() => {
    if (!serie) return [];
    const em = (k) => emPorcentoDoInicio(serie[k]?.pontos ?? []);
    const dos = itens.map((i) => em(i.chave)).filter((s) => s.length > 1);
    const out = [];
    if (dos.length) out.push({ key: 'media', rotulo: 'Os seus, na média', classe: 'text-gray-800', larg: 2.4, pontos: mediaDasSeries(dos) });
    [['IDX:IBOV', 'Ibovespa', '5 4'], ['IDX:SPX', 'S&P 500', '2 3']].forEach(([k, rotulo, dash]) => {
      const p = em(k);
      if (p.length > 1) out.push({ key: k, rotulo, classe: 'text-gray-400', larg: 1.5, dash, pontos: p });
    });
    escolhidos.forEach((k, n) => {
      const i = itens.find((x) => x.chave === k);
      const p = em(k);
      if (i && p.length > 1) out.push({ key: k, rotulo: i.ticker, cor: CORES_CMP[n % CORES_CMP.length], larg: 1.7, pontos: p, item: i, tirar: true });
    });
    return out;
  }, [serie, itens, escolhidos]);

  const W = Math.max(0, tam.w); const H = Math.max(0, tam.h);
  const todos = series.flatMap((s) => s.pontos);
  const t0 = Math.min(...todos.map((p) => p[0])); const t1 = Math.max(...todos.map((p) => p[0]));
  let lo = Math.min(0, ...todos.map((p) => p[1])); let hi = Math.max(0, ...todos.map((p) => p[1]));
  const passo = [0.005, 0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1].find((s) => (hi - lo) / s <= 5) ?? 1;
  lo = Math.floor(lo / passo) * passo; hi = Math.ceil(hi / passo) * passo || passo;
  const x = (t) => CALHA_ESQ + ((t - t0) / (t1 - t0 || 1)) * (W - CALHA_ESQ - CALHA_DIR);
  const y = (v) => 8 + (1 - (v - lo) / (hi - lo || 1)) * (H - 30);
  const marcas = []; for (let v = lo; v <= hi + 1e-9; v += passo) marcas.push(v);
  // o nome e o valor no fim de cada linha, sem encostar um no outro
  const fins = series.map((s) => ({ key: s.key, y: y(s.pontos[s.pontos.length - 1][1]) })).sort((a, b) => a.y - b.y);
  for (let i = 1; i < fins.length; i += 1) if (fins[i].y - fins[i - 1].y < 13) fins[i].y = fins[i - 1].y + 13;
  const datas = t1 > t0 ? [0, 0.25, 0.5, 0.75, 1].map((f) => t0 + f * (t1 - t0)) : [];
  const dataTxt = (t) => { const d = new Date(t * 1000); return range === '5d' ? d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit' }) : d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', ...(range === '1y' ? { year: '2-digit' } : {}) }); };
  const noPonto = (s, t) => { let ultimo = null; for (const p of s.pontos) { if (p[0] <= t) ultimo = p; else break; } return ultimo; };
  const mover = (e) => {
    if (!series.length) return;
    const r = e.currentTarget.getBoundingClientRect();
    const px = Math.max(CALHA_ESQ, Math.min(W - CALHA_DIR, e.clientX - r.left));
    const t = t0 + ((px - CALHA_ESQ) / (W - CALHA_ESQ - CALHA_DIR || 1)) * (t1 - t0);
    setGuia({ x: px, t, pos: posicaoBalao(e, 220, 40 + series.length * 20) });
  };
  const livres = itens.filter((i) => !escolhidos.includes(i.chave));

  return (
    <Bloco titulo="Desempenho comparado" sub="em %, todos partindo do zero"
      extra={<AbasPilula abas={RANGES_CMP} valor={range} onChange={setRange} variante="claro" altura={26} folga={2} />}>
      <div className="flex h-full flex-col">
        <div ref={ref} className="relative min-h-[140px] flex-1" onMouseMove={mover} onMouseLeave={() => setGuia(null)}>
          {!serie ? <p className="pt-10 text-center text-[12.5px] text-gray-400">Buscando as séries…</p> : !series.length ? <p className="pt-10 text-center text-[12.5px] text-gray-400">Sem série para o período.</p> : W > 0 && (
            <svg width={W} height={H} className="block" aria-hidden="true">
              {marcas.map((v) => (
                <g key={v}>
                  <line x1={CALHA_ESQ} x2={W - CALHA_DIR} y1={y(v)} y2={y(v)} className={Math.abs(v) < 1e-9 ? 'text-gray-300' : 'text-gray-100'} stroke="currentColor" strokeDasharray={Math.abs(v) < 1e-9 ? '' : '2 3'} />
                  <text x={CALHA_ESQ - 6} y={y(v) + 3.5} textAnchor="end" className="fill-gray-400 text-[10.5px]">{pctTxt(v, passo < 0.01 ? 1 : 0)}</text>
                </g>
              ))}
              {datas.map((t, i) => <text key={i} x={x(t)} y={H - 6} textAnchor={i === 0 ? 'start' : i === datas.length - 1 ? 'end' : 'middle'} className="fill-gray-400 text-[10.5px]">{dataTxt(t)}</text>)}
              {series.map((s) => (
                <g key={s.key} className={s.classe} style={{ color: s.cor, opacity: ctrl.opSerie(s.key) }}>
                  <polyline points={s.pontos.map((p) => `${x(p[0]).toFixed(1)},${y(p[1]).toFixed(1)}`).join(' ')} fill="none" stroke="currentColor" strokeWidth={s.larg} strokeDasharray={s.dash} strokeLinejoin="round" />
                  <text x={W - CALHA_DIR + 6} y={fins.find((f) => f.key === s.key).y + 3.5} className="text-[11px] font-semibold" fill="currentColor">{pctTxt(s.pontos[s.pontos.length - 1][1], 1)}</text>
                </g>
              ))}
              {guia && <line x1={guia.x} x2={guia.x} y1={8} y2={H - 22} className="text-gray-400" stroke="currentColor" strokeDasharray="3 3" />}
            </svg>
          )}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-1 border-t border-gray-100 pt-2" onMouseLeave={() => ctrl.setHover(null)}>
          {series.map((s) => (
            <span key={s.key} className={`inline-flex items-center rounded-[4px] text-[11px] transition-colors ${ctrl.fixas.includes(s.key) ? 'bg-gray-100 font-semibold text-gray-800' : 'text-gray-600 hover:bg-gray-50'}`}
              style={{ opacity: ctrl.opSerie(s.key) < 1 ? 0.55 : 1 }}>
              <button type="button" onMouseEnter={() => ctrl.setHover(s.key)} onClick={() => ctrl.alternar(s.key)} aria-pressed={ctrl.fixas.includes(s.key)}
                className="inline-flex items-center gap-1.5 px-1.5 py-0.5">
                <span className={`w-3.5 shrink-0 border-t-2 ${s.dash ? 'border-dashed' : ''} ${s.classe ?? ''}`} style={{ borderColor: s.cor ?? 'currentColor' }} />{s.rotulo}
              </button>
              {s.tirar && <button type="button" aria-label={`Tirar ${s.rotulo} da comparação`} onClick={() => setEscolhidos(escolhidos.filter((k) => k !== s.key))} className="pr-1.5 text-gray-400 hover:text-gray-700">✕</button>}
            </span>
          ))}
          {escolhidos.length < CORES_CMP.length && livres.length > 0 && (
            <button type="button" className="inline-flex items-center gap-1 rounded-[4px] border border-dashed border-gray-300 px-2 py-0.5 text-[11px] text-gray-500 hover:border-gray-400 hover:text-gray-800"
              onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); setMenu({ x: r.left, y: r.bottom + 4, titulo: 'Comparar', itens: livres.map((i) => ({ rotulo: i.ticker, sub: i.nome || undefined, onEscolher: () => setEscolhidos([...escolhidos, i.chave]) })) }); }}>
              + comparar
            </button>
          )}
        </div>
      </div>
      <MenuContexto menu={menu} onFechar={() => setMenu(null)} />
      {guia && series.length > 0 && (
        <BalaoGrafico pos={guia.pos} largura={220} titulo={new Date(guia.t * 1000).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })}
          itens={series.map((s) => { const p = noPonto(s, guia.t); return { rotulo: s.rotulo, valor: p ? pctTxt(p[1]) : '—', cor: s.cor ?? (s.key === 'media' ? '#6b7280' : '#9ca3af') }; })} />
      )}
    </Bloco>
  );
}

// ------------------------------------------------------------ os próximos eventos
const SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
function quando(data, hoje) {
  const d = Date.UTC(+data.slice(0, 4), +data.slice(5, 7) - 1, +data.slice(8, 10));
  const h = Date.UTC(+hoje.slice(0, 4), +hoje.slice(5, 7) - 1, +hoje.slice(8, 10));
  const n = Math.round((d - h) / 86400000);
  return n === 0 ? 'hoje' : n === 1 ? 'amanhã' : n < 7 ? SEMANA[new Date(d).getUTCDay()] : `em ${n} dias`;
}
export function ProximosEventos({ eventos, itens, hoje, onAbrir }) {
  const porAtivo = new Map(itens.filter((i) => i.ativoId).map((i) => [i.ativoId, i]));
  const lista = eventosSemRepetir((eventos ?? []).filter((e) => porAtivo.has(e.ativo_id))).slice(0, 14);
  return (
    <Bloco titulo="Próximos eventos" sub="resultados e datas-ex dos da carteira">
      {eventos === undefined ? <p className="text-[12.5px] text-gray-400">Carregando…</p>
        : eventos === null ? <p className="text-[12.5px] text-gray-400">Os eventos pedem a migration 031 (a do gráfico do ativo).</p>
          : !lista.length ? <p className="text-[12.5px] leading-relaxed text-gray-400">Nenhum resultado nem data-ex à frente. Os eventos de cada ativo chegam com o gráfico dele (o histórico do Yahoo e, nos EUA, o calendário de resultados).</p>
            : (
              <div className="h-full overflow-auto">
                {lista.map((e) => {
                  const i = porAtivo.get(e.ativo_id);
                  const resultado = e.tipo === 'resultado';
                  const moeda = i.mercado === 'EUA' ? 'US$' : 'R$';
                  return (
                    <button key={`${e.ativo_id}${e.tipo}${e.data}`} type="button" onClick={() => onAbrir(i)}
                      className="grid w-full grid-cols-[58px_22px_minmax(0,1fr)] items-center gap-2.5 border-b border-gray-100 py-2 text-left text-[12.5px] last:border-0 hover:bg-gray-50">
                      <span className="leading-tight text-gray-600">{e.data.slice(8, 10)}/{e.data.slice(5, 7)}<br /><span className="text-[11px] text-gray-400">{quando(e.data, hoje)}</span></span>
                      <span className={`inline-grid h-[20px] w-[20px] place-items-center rounded-[4px] text-[11px] font-bold text-white ${resultado ? 'bg-[var(--serie-sobrou)]' : 'bg-hx-ca8a04'}`}>{resultado ? 'E' : 'D'}</span>
                      <span className="min-w-0">
                        <b className="font-semibold text-gray-900">{i.ticker}</b> <span className="text-gray-600">{resultado ? 'divulga o resultado' : 'data-ex do provento'}</span>
                        <span className="block truncate text-[11.5px] text-gray-400">
                          {resultado
                            ? [e.hora === 'bmo' ? 'antes da abertura' : e.hora === 'amc' ? 'depois do fechamento' : null, e.estimado ? `esperado: ${moeda} ${num(Number(e.estimado))} por ação` : null].filter(Boolean).join(' · ') || 'a data do calendário'
                            : e.valor ? `${moeda} ${num(Number(e.valor), Number(e.valor) < 0.1 ? 4 : 2)} por ${i.classe === 'fii' ? 'cota' : 'ação'} · tem direito quem tiver no dia útil antes` : 'tem direito quem tiver no dia útil antes'}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
    </Bloco>
  );
}

// ------------------------------------------------------------ a tabela de cotações
export function TabelaCotacoes({ itens, periodoTxt, emDia, onAbrir }) {
  const th = 'sticky top-0 z-[1] bg-white pb-1.5 pt-0.5 text-[10.5px] font-semibold uppercase tracking-wide text-gray-400';
  return (
    <Bloco titulo="Tabela de cotações" sub={`${itens.length} ativos`}>
      <div className="h-full overflow-auto">
        <table className="w-full text-[12.5px] tabular-nums">
          <thead><tr>
            <th className={`${th} text-left`}>Ticker</th><th className={`${th} text-left`}>Nome</th><th className={`${th} text-right`}>Preço</th>
            <th className={`${th} text-right`}>Dia</th>{!emDia && <th className={`${th} text-right`}>{periodoTxt.replace(/^n[oa]s? /, '')}</th>}
            <th className={`${th} text-right`}>Máx.</th><th className={`${th} text-right`}>Mín.</th><th className={`${th} text-right`}>Volume</th>
          </tr></thead>
          <tbody>
            {itens.map((i) => (
              <tr key={i.chave} onClick={() => onAbrir(i)} className="cursor-pointer border-t border-gray-100 hover:bg-gray-50">
                <td className="py-1.5 font-semibold text-gray-900">{i.ticker}</td>
                <td className="max-w-[220px] truncate py-1.5 text-gray-600">{i.nome || i.v?.nome || '—'}</td>
                <td className="py-1.5 text-right font-medium text-gray-800">{precoTxt(i)}</td>
                <td className={`py-1.5 text-right font-medium ${corTexto(i.pDia)}`}>{pctTxt(i.pDia)}</td>
                {!emDia && <td className={`py-1.5 text-right font-medium ${corTexto(i.p)}`}>{pctTxt(i.p)}</td>}
                <td className="py-1.5 text-right text-gray-500">{i.v?.maxima ? num(i.v.maxima) : '—'}</td>
                <td className="py-1.5 text-right text-gray-500">{i.v?.minima ? num(i.v.minima) : '—'}</td>
                <td className="py-1.5 text-right text-gray-500">{volumeTxt(i.v?.volume)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Bloco>
  );
}
