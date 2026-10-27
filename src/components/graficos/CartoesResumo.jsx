import { useState } from 'react';
import BalaoGrafico, { posicaoBalao } from './BalaoGrafico.jsx';
import { COR_ENTRADAS, COR_GASTOS } from './Graficos.jsx';
import { COR_SALDO } from './GraficosVisao.jsx';
import { varCor } from '../../lib/varCor.js';
import { brlCurto, formatBRL } from '../../lib/dinheiro.js';
import { competenciaAtual, competenciaCurta, nomeCompetencia } from '../../lib/format.js';
import { mediaPorMes, variacao } from '../../lib/visaoGeral.js';

// OS CARTÕES DE INDICADOR com a curva dos meses — a opção C do mockup do resumo dos Lançamentos, com as
// setas da A. `CartaoKpi` é a peça genérica: ícone, rótulo, a variação, o número e a CURVA na base. O
// cartão sobe de leve no hover; na curva, o mês sob o cursor ganha a guia, o ponto e o balão, e clicar
// abre aquele mês. `compacto` é a versão menor da Visão geral (número menor, curva mais baixa, sem a
// régua dos meses — o mês está no balão).
//
// `CartoesResumo` (o topo dos Lançamentos) monta três deles: entradas, gastos e saldo; clicar filtra a
// grade pelo tipo (o saldo limpa o filtro).

export const ICONES = {
  entradas: <path d="M12 19V5M6 11l6-6 6 6" />,
  gastos: <path d="M12 5v14M6 13l6 6 6-6" />,
  saldo: <path d="M5 12h14M12 5v14" />,
  lancamentos: <path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01" />,
  mes: <><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M4 10h16M9 3v4M15 3v4" /></>,
};
export const CORES_KPI = { entradas: COR_ENTRADAS, gastos: COR_GASTOS, saldo: COR_SALDO };
// O ícone em PIXEL INTEIRO (caixa de 26, desenho de 14; 22 e 12 no compacto): com o `h-3.5` (0,875rem
// sobre a raiz de 87,5% = 12,25px) o desenho caía entre pixels e o "+" do saldo saía borrado e torto.
const ICONE = { normal: [26, 14], compacto: [22, 12] };
const W = 300; // a largura do desenho da curva (o SVG estica para o cartão)

// A variação em %, numa pílula verde (bom) ou vermelha (ruim). `sobeBom`: para entrada e saldo subir é
// bom; para gasto, não.
export function Variacao({ v, sobeBom, titulo = 'Contra o mês anterior' }) {
  if (v === null || v === undefined) return null;
  const bom = sobeBom ? v >= 0 : v <= 0;
  return (
    <span className={`inline-flex shrink-0 items-center gap-0.5 rounded-full px-[7px] py-[2px] text-[11px] font-semibold tabular-nums ${
      v === 0 ? 'bg-gray-100 text-gray-600' : bom ? 'bg-hx-dcfce7 text-hx-166534' : 'bg-hx-fee2e2 text-hx-991b1b'}`}
      title={titulo}>
      {v > 0 ? '▲' : v < 0 ? '▼' : ''} {Math.abs(v).toLocaleString('pt-BR')}%
    </span>
  );
}

// A variação de um saldo (que pode ser negativo): sobre o valor absoluto do anterior.
export const variacaoSaldo = (atual, antes) => (antes ? Math.round(((atual - antes) / Math.abs(antes)) * 100) : null);

// `serie`: [{ competencia, valor }] do mais antigo ao mais novo; o último é o ponto em destaque.
// `formatar(valor)`: o número no balão. `valor`/`valorCurto`: o que o cartão mostra (o curto, no celular).
// `variacao` + `sobeBom` (+ `tituloVariacao`): a pílula. `sub`: a linha de baixo. `onClicar`: o cartão
// inteiro; `onMes(comp)`: clicar na curva. `ativo`: o anel de "filtro ligado". `nota(i)`: rodapé do balão.
export function CartaoKpi({
  icone, cor, rotulo, valor, valorCurto, corValor = 'text-gray-900', variacao: v, sobeBom = true, tituloVariacao,
  sub, serie = [], formatar = formatBRL, onClicar, onMes, ativo = false, compacto = false, titulo, nota,
}) {
  const [hover, setHover] = useState(null); // { i, pos }
  const vals = serie.map((m) => m.valor);
  const temCurva = vals.length > 1;
  const [caixaIco, desenhoIco] = compacto ? ICONE.compacto : ICONE.normal;
  const H = compacto ? 34 : 54;
  const min = Math.min(0, ...vals);
  const max = Math.max(1, ...vals);
  const x = (i) => 6 + (i / Math.max(1, vals.length - 1)) * (W - 12);
  const y = (val) => H - 5 - ((val - min) / (max - min || 1)) * (H - (compacto ? 10 : 14));
  const pts = vals.map((val, i) => `${x(i).toFixed(1)},${y(val).toFixed(1)}`).join(' ');
  const gradId = `grad-${rotulo}-${compacto ? 'c' : 'n'}`;
  const pontoAtivo = hover ? hover.i : vals.length - 1;

  const mover = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const frac = (e.clientX - r.left) / r.width;
    const i = Math.max(0, Math.min(vals.length - 1, Math.round(frac * (vals.length - 1))));
    setHover({ i, pos: posicaoBalao(e, 230, 96) });
  };
  const mes = hover && serie[hover.i];
  const antesHover = hover && hover.i > 0 ? vals[hover.i - 1] : null;
  const vHover = hover && antesHover !== null ? (rotulo === 'Saldo' ? variacaoSaldo(vals[hover.i], antesHover) : variacao(vals[hover.i], antesHover)) : null;

  return (
    // O HOVER SÓ MEXE EM `transform` E `opacity` (a placa de vídeo faz sozinha): o cartão sobe 2px INTEIROS
    // e a sombra é uma camada própria que só ACENDE — animar `box-shadow` repintava o cartão a cada
    // quadro. A curva tem o seu `overflow-hidden`, para a sombra do cartão poder sair pelas bordas.
    <div role={onClicar ? 'button' : undefined} tabIndex={onClicar ? 0 : undefined} title={titulo}
      onClick={onClicar} onKeyDown={onClicar ? (e) => { if (e.key === 'Enter') onClicar(); } : undefined}
      className={`card group relative isolate flex min-w-0 flex-col !rounded-[10px] transition-[transform,border-color] duration-300 ease-[cubic-bezier(.2,.8,.2,1)] will-change-transform hover:-translate-y-[2px] hover:border-gray-300 motion-reduce:transition-none motion-reduce:hover:translate-y-0 ${
        onClicar ? 'cursor-pointer' : ''} ${ativo ? 'ring-2 ring-gray-800' : ''}`}>
      <span aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 rounded-[10px] opacity-0 shadow-[0_14px_30px_-10px_rgba(20,28,44,.22)] transition-opacity duration-300 ease-out group-hover:opacity-100" />
      <div className={`flex flex-col ${compacto ? 'gap-0.5 px-3 pt-2.5' : 'gap-1 px-3 pt-2.5 sm:px-4 sm:pt-3.5'}`}>
        <div className="flex items-center gap-2">
          <span className="hidden shrink-0 items-center justify-center sm:inline-flex"
            style={{ width: caixaIco, height: caixaIco, borderRadius: compacto ? 6 : 7, background: `color-mix(in srgb, ${cor} 14%, ${varCor('#ffffff', 'fundo')})`, color: cor }}>
            <svg viewBox="0 0 24 24" width={desenhoIco} height={desenhoIco} className="block shrink-0" fill="none" stroke="currentColor" strokeWidth="2.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{ICONES[icone]}</svg>
          </span>
          <span className={`truncate font-semibold ${compacto ? 'text-[11.5px] text-gray-600' : 'text-[10.5px] uppercase tracking-wide text-gray-500 sm:text-[12px] sm:normal-case sm:tracking-normal sm:text-gray-600'}`}>{rotulo}</span>
          <span className="flex-1" />
          <span className="hidden sm:inline-flex"><Variacao v={v} sobeBom={sobeBom} titulo={tituloVariacao} /></span>
        </div>
        <div className={`whitespace-nowrap font-semibold tabular-nums tracking-[-0.02em] ${corValor}`}>
          <span className="text-[15px] sm:hidden">{valorCurto ?? valor}</span>
          <span className={`hidden sm:inline ${compacto ? 'text-[18px]' : 'text-[22px]'}`}>{valor}</span>
        </div>
        {sub && <div className={`truncate text-gray-500 ${compacto ? 'text-[11px]' : 'hidden text-[11.5px] sm:block'}`}>{sub}</div>}
      </div>
      {/* A CURVA, na base do cartão. O SVG estica na largura (`preserveAspectRatio="none"`) com o traço
          sem escalar; o ponto é uma <div> numa caixa da MESMA altura do SVG (senão ele fica fora da reta). */}
      {temCurva ? (
        <div className={`${compacto ? 'mt-1' : 'mt-2'} hidden overflow-hidden rounded-b-[10px] sm:block`} onMouseMove={mover} onMouseLeave={() => setHover(null)}
          onClick={(e) => { if (hover && onMes) { e.stopPropagation(); onMes(serie[hover.i].competencia); } }}>
          <div className="relative" style={{ height: H }}>
            <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="block w-full overflow-visible" style={{ height: H }} aria-hidden="true">
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
          {!compacto && (
            <div className="flex justify-between px-2 pb-2 pt-0.5 text-[9.5px] text-gray-400">
              {serie.map((m, i) => (
                <span key={m.competencia} className={i === pontoAtivo && hover ? 'font-semibold text-gray-800' : ''}>{competenciaCurta(m.competencia).slice(0, 3)}</span>
              ))}
            </div>
          )}
        </div>
      ) : <div className={compacto ? 'h-2.5' : 'h-3.5'} />}
      {mes && (
        <BalaoGrafico pos={hover.pos} largura={230} titulo={nomeCompetencia(mes.competencia)}
          itens={[{ rotulo, valor: formatar(vals[hover.i]), cor }]}
          nota={[vHover !== null && `${vHover > 0 ? '+' : ''}${vHover}% sobre ${competenciaCurta(serie[hover.i - 1].competencia)}`,
            nota?.(hover.i), onMes && 'Clique para abrir o mês'].filter(Boolean).join(' · ')} />
      )}
    </div>
  );
}

const ROTULOS = { entradas: 'Entradas', gastos: 'Gastos', saldo: 'Saldo' };
const SOBE_E_BOM = { entradas: true, gastos: false, saldo: true };

// O TOPO DOS LANÇAMENTOS. `serie`: [{ competencia, entradas, gastos, saldo }] do mais antigo ao atual
// (o último é o da tela). `tipo`: o filtro de tipo da tela ('' | 'entrada' | 'saida'); `onTipo(t)` o troca.
export default function CartoesResumo({ serie, tipo, onTipo, onMes }) {
  const cartao = (chave, ativo, onClicar, titulo) => {
    const vals = serie.map((m) => m[chave]);
    const atual = vals[vals.length - 1];
    const antes = vals.length > 1 ? vals[vals.length - 2] : null;
    // A média só dos meses que têm o valor (o saldo: os que têm alguma entrada ou gasto), sem o mês em andamento.
    const m = mediaPorMes(serie, chave, { emAndamento: competenciaAtual(), presente: chave === 'saldo' ? (x) => x.entradas > 0 || x.gastos > 0 : undefined });
    return (
      <CartaoKpi key={chave} icone={chave} cor={CORES_KPI[chave]} rotulo={ROTULOS[chave]}
        valor={formatBRL(atual)} valorCurto={brlCurto(atual)}
        corValor={chave === 'entradas' ? 'text-green-700' : chave === 'saldo' && atual < 0 ? 'text-hx-c0393d' : 'text-gray-900'}
        variacao={antes === null ? null : chave === 'saldo' ? variacaoSaldo(atual, antes) : variacao(atual, antes)}
        sobeBom={SOBE_E_BOM[chave]} sub={m.meses ? `média de ${m.meses} ${m.meses === 1 ? 'mês' : 'meses'} ${formatBRL(m.media)}` : 'nada nos últimos meses'}
        serie={serie.map((m) => ({ competencia: m.competencia, valor: m[chave] }))}
        ativo={ativo} onClicar={onClicar} onMes={onMes} titulo={titulo} />
    );
  };
  return (
    <div className="grid grid-cols-3 gap-2 sm:gap-3.5">
      {cartao('entradas', tipo === 'entrada', () => onTipo(tipo === 'entrada' ? '' : 'entrada'), 'Clique para ver só entradas')}
      {cartao('gastos', tipo === 'saida', () => onTipo(tipo === 'saida' ? '' : 'saida'), 'Clique para ver só gastos')}
      {cartao('saldo', false, () => onTipo(''), 'Clique para ver entradas e gastos')}
    </div>
  );
}
