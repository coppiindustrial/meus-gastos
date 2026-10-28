import { useLayoutEffect, useRef, useState } from 'react';
import BalaoGrafico, { useBalao } from './BalaoGrafico.jsx';
import AbasPilula from '../AbasPilula.jsx';
import Variacao from './Variacao.jsx';
import { COR_ENTRADAS, COR_GASTOS, CALHA, Grade } from './Graficos.jsx';
import { escalaLinear } from '../../lib/escala.js';
import { varCor } from '../../lib/varCor.js';
import { brlCurto, formatBRL } from '../../lib/dinheiro.js';
import { competenciaCurta, nomeCompetencia } from '../../lib/format.js';
import { variacao } from '../../lib/visaoGeral.js';

// OS GRÁFICOS DA VISÃO GERAL, no chrome do Gestor (os mockups A e B de gráficos): balão que segue o
// cursor, o resto recua quando um item está sob ele, legenda que é controle (`LegendaSeries`), valores
// escritos onde cabem e comparação com o mês anterior e com o mesmo mês do ano anterior.

export const COR_SALDO = varCor('#374151', 'texto');
export const COR_ANTERIOR = varCor('#9ca3af', 'texto');
const pct = (f) => `${f * 100}%`;
const sinal = (v) => (v === null ? '' : `${v > 0 ? '+' : ''}${v}%`);
const pulaNoCelular = (i, n) => (n > 6 && (n - 1 - i) % 2 === 1 ? 'max-sm:invisible' : '');

// ------------------------------------------------------------ entradas × gastos por mês

// `meses`: [{ competencia, entradas, gastos, saldo, temDado }]. `anterior`: { competencia → gastos do
// mesmo mês um ano antes } ou null (sem comparação). `ctrl`: o `useDestaqueSeries` da legenda.
// `onMes(comp)`: clicar num mês com dado. O saldo é uma LINHA no mesmo eixo (saldo negativo fica na
// base, com o ponto vermelho, e o valor certo no balão).
export function ColunasEntradasGastos({ meses, anterior, ctrl, onMes, altura = 230 }) {
  const balao = useBalao(250, 170);
  const n = meses.length;
  const valores = meses.flatMap((m) => [m.entradas, m.gastos, m.saldo, anterior?.[m.competencia] ?? 0]);
  const esc = escalaLinear(Math.max(1, ...valores) / 100);
  const fr = (c) => esc.fracao(Math.max(0, c) / 100);
  const x = (i) => ((i + 0.5) / n) * 100;
  const comRotulo = n <= 12;
  const ativo = balao.ativo !== null ? meses[balao.ativo] : null;

  // Uma linha por trecho contínuo de meses com dado (o mês vazio interrompe a linha).
  const trechos = (valor) => {
    const out = [];
    let atual = [];
    meses.forEach((m, i) => {
      const v = valor(m);
      if (v === null) { if (atual.length) out.push(atual); atual = []; return; }
      atual.push(`${x(i)},${100 - fr(v) * 100}`);
    });
    if (atual.length) out.push(atual);
    return out;
  };
  const linhaSaldo = trechos((m) => (m.temDado ? m.saldo : null));
  const linhaAnterior = anterior ? trechos((m) => anterior[m.competencia] ?? null) : [];

  const iAtivo = balao.ativo;
  const antesNaSerie = iAtivo > 0 && meses[iAtivo - 1].temDado ? meses[iAtivo - 1] : null;
  const notaAtivo = ativo && [
    antesNaSerie && `Gastos ${sinal(variacao(ativo.gastos, antesNaSerie.gastos))} vs. ${competenciaCurta(antesNaSerie.competencia)}`,
    anterior?.[ativo.competencia] > 0 && `${sinal(variacao(ativo.gastos, anterior[ativo.competencia]))} vs. ${competenciaCurta(`${Number(ativo.competencia.slice(0, 4)) - 1}${ativo.competencia.slice(4)}`)}`,
  ].filter(Boolean).join(' · ');

  // `altura="auto"`: o gráfico ocupa a altura que o bloco do grid da Visão geral tiver.
  const auto = altura === 'auto';
  return (
    <div className={auto ? 'flex h-full min-h-0 flex-col' : ''}>
      <div style={auto ? undefined : { height: altura }} className={`pt-4 ${auto ? 'min-h-0 flex-1' : ''}`}>
        <Grade esc={esc}>
          <div className="absolute inset-0 flex" onMouseLeave={balao.aoSair}>
            {meses.map((m, i) => {
              const topo = Math.max(fr(m.entradas), fr(m.gastos));
              return (
                <button key={m.competencia} type="button" onMouseMove={balao.aoMover(i)}
                  onClick={() => m.temDado && onMes?.(m.competencia)}
                  aria-label={`${nomeCompetencia(m.competencia)}: entradas ${formatBRL(m.entradas)}, gastos ${formatBRL(m.gastos)}`}
                  className={`relative flex h-full min-w-0 flex-1 justify-center rounded-[4px] transition-colors ${
                    balao.ativo === i ? 'bg-gray-900/[0.04]' : ''} ${m.temDado && onMes ? 'cursor-pointer' : 'cursor-default'}`}>
                  <span className={`flex h-full w-[64%] items-end justify-center gap-[2px] transition-opacity duration-150 ${balao.esmaecido(i) ? 'opacity-40' : ''}`}>
                    <span className="w-1/2 max-w-[18px] rounded-t-[4px] transition-opacity duration-150"
                      style={{ height: pct(fr(m.entradas)), background: COR_ENTRADAS, opacity: ctrl.opSerie('entradas') }} />
                    <span className="w-1/2 max-w-[18px] rounded-t-[4px] transition-opacity duration-150"
                      style={{ height: pct(fr(m.gastos)), background: COR_GASTOS, opacity: ctrl.opSerie('gastos') }} />
                  </span>
                  {/* O valor dos GASTOS em cima da coluna (acima da barra mais alta, para não cobrir a outra). */}
                  {comRotulo && m.gastos > 0 && (
                    <span className={`pointer-events-none absolute left-1/2 mb-0.5 hidden -translate-x-1/2 whitespace-nowrap text-[9.5px] font-semibold tabular-nums text-gray-700 transition-opacity sm:block ${balao.esmaecido(i) ? 'opacity-40' : ''}`}
                      style={{ bottom: pct(topo), opacity: ctrl.opSerie('gastos') < 1 ? 0.3 : undefined }}>
                      {brlCurto(m.gastos).replace('R$ ', '')}
                    </span>
                  )}
                  {!m.temDado && <span className="pointer-events-none absolute bottom-1 hidden text-[9.5px] text-gray-300 sm:block">sem dados</span>}
                </button>
              );
            })}
          </div>
          <svg className="pointer-events-none absolute inset-0 h-full w-full overflow-visible" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            {linhaAnterior.map((pts) => (
              <polyline key={`a${pts[0]}`} points={pts.join(' ')} fill="none" stroke={COR_ANTERIOR} strokeWidth="1.5" strokeDasharray="4 3"
                vectorEffect="non-scaling-stroke" style={{ opacity: ctrl.opSerie('anterior'), transition: 'opacity .15s' }} />
            ))}
            {linhaSaldo.map((pts) => (
              <polyline key={`s${pts[0]}`} points={pts.join(' ')} fill="none" stroke={COR_SALDO} strokeWidth="2" strokeLinejoin="round"
                vectorEffect="non-scaling-stroke" style={{ opacity: ctrl.opSerie('saldo'), transition: 'opacity .15s' }} />
            ))}
          </svg>
          {ativo?.temDado && ctrl.opSerie('saldo') === 1 && (
            <span className="pointer-events-none absolute h-[9px] w-[9px] -translate-x-1/2 translate-y-1/2 rounded-full border-2 border-white"
              style={{ left: `${x(iAtivo)}%`, bottom: pct(fr(ativo.saldo)), background: ativo.saldo < 0 ? varCor('#c0393d', 'texto') : COR_SALDO }} />
          )}
        </Grade>
      </div>
      <div className="mt-1 flex" style={{ paddingRight: CALHA }}>
        {meses.map((m, i) => (
          <div key={m.competencia} className={`flex min-w-0 flex-1 justify-center whitespace-nowrap text-[10.5px] ${
            balao.ativo === i ? 'font-semibold text-gray-800' : `text-gray-500 ${pulaNoCelular(i, n)}`}`}>
            {n > 12 ? competenciaCurta(m.competencia) : competenciaCurta(m.competencia).slice(0, 3)}
          </div>
        ))}
      </div>
      {ativo && (
        <BalaoGrafico pos={balao.pos} largura={250} titulo={nomeCompetencia(ativo.competencia)}
          itens={ativo.temDado ? [
            { rotulo: 'Entradas', valor: formatBRL(ativo.entradas), cor: COR_ENTRADAS },
            { rotulo: 'Gastos', valor: formatBRL(ativo.gastos), cor: COR_GASTOS },
            { rotulo: 'Saldo', valor: formatBRL(ativo.saldo), cor: COR_SALDO },
            ...(anterior ? [{ rotulo: `Gastos em ${Number(ativo.competencia.slice(0, 4)) - 1}`, valor: formatBRL(anterior[ativo.competencia] ?? 0), cor: COR_ANTERIOR }] : []),
          ] : []}
          nota={ativo.temDado ? [notaAtivo, onMes && 'Clique para ver os lançamentos do mês'].filter(Boolean).join('. ') : 'Nenhum lançamento neste mês.'} />
      )}
    </div>
  );
}

// ------------------------------------------------------------ as outras formas do mês a mês

// O balão e a régua dos meses que as três formas abaixo dividem com as colunas.
function rotuloMes(m, n) { return n > 12 ? competenciaCurta(m.competencia) : competenciaCurta(m.competencia).slice(0, 3); }
function ReguaMeses({ meses, ativo }) {
  return (
    <div className="mt-1 flex" style={{ paddingRight: CALHA }}>
      {meses.map((m, i) => (
        <div key={m.competencia} className={`flex min-w-0 flex-1 justify-center whitespace-nowrap text-[10.5px] ${
          ativo === i ? 'font-semibold text-gray-800' : `text-gray-500 ${pulaNoCelular(i, meses.length)}`}`}>
          {rotuloMes(m, meses.length)}
        </div>
      ))}
    </div>
  );
}

// LINHAS (mensal ou ACUMULADO): entradas e gastos como curvas com a área clara embaixo, o saldo do mês
// (no mensal) e o ano anterior tracejado. O acumulado soma mês a mês dentro do período: a distância
// entre as duas curvas no fim é o que sobrou no período.
export function LinhasEntradasGastos({ meses, anterior, ctrl, onMes, acumulado = false }) {
  const balao = useBalao(250, 170);
  const n = meses.length;
  const acum = (campo) => { let t = 0; return meses.map((m) => (m.temDado ? (t += m[campo]) : null)); };
  const ent = acumulado ? acum('entradas') : meses.map((m) => (m.temDado ? m.entradas : null));
  const gas = acumulado ? acum('gastos') : meses.map((m) => (m.temDado ? m.gastos : null));
  const sal = acumulado ? null : meses.map((m) => (m.temDado ? m.saldo : null));
  let tAnt = 0;
  const ant = anterior ? meses.map((m) => { const v = anterior[m.competencia] ?? 0; tAnt += v; return acumulado ? tAnt : (v || null); }) : null;
  const todos = [...ent, ...gas, ...(sal ?? []), ...(ant ?? [])].filter((v) => v !== null);
  const esc = escalaLinear(Math.max(1, ...todos) / 100);
  const fr = (c) => esc.fracao(Math.max(0, c) / 100);
  const x = (i) => ((i + 0.5) / n) * 100;
  const trechos = (vals) => {
    const out = [];
    let atual = [];
    vals.forEach((v, i) => {
      if (v === null) { if (atual.length) out.push(atual); atual = []; return; }
      atual.push([x(i), 100 - fr(v) * 100]);
    });
    if (atual.length) out.push(atual);
    return out;
  };
  const linha = (vals, cor, op, { tracejado, area, larg = 2 } = {}) => trechos(vals).map((pts) => (
    <g key={`${cor}${pts[0]}`} style={{ opacity: op, transition: 'opacity .15s' }}>
      {area && pts.length > 1 && <polygon points={`${pts[0][0]},100 ${pts.map((p) => p.join(',')).join(' ')} ${pts[pts.length - 1][0]},100`} fill={cor} fillOpacity=".1" />}
      <polyline points={pts.map((p) => p.join(',')).join(' ')} fill="none" stroke={cor} strokeWidth={larg} strokeLinejoin="round"
        strokeDasharray={tracejado ? '4 3' : undefined} vectorEffect="non-scaling-stroke" />
    </g>
  ));
  const i = balao.ativo;
  const m = i !== null ? meses[i] : null;
  const ponto = (vals, cor, chave) => (i !== null && vals?.[i] !== null && vals?.[i] !== undefined && ctrl.opSerie(chave) === 1 ? (
    <span key={chave} className="pointer-events-none absolute h-[9px] w-[9px] -translate-x-1/2 translate-y-1/2 rounded-full border-2 border-white"
      style={{ left: `${x(i)}%`, bottom: pct(fr(vals[i])), background: cor }} />
  ) : null);
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 pt-4">
        <Grade esc={esc}>
          <svg className="pointer-events-none absolute inset-0 h-full w-full overflow-visible" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            {ant && linha(ant, COR_ANTERIOR, ctrl.opSerie('anterior'), { tracejado: true, larg: 1.5 })}
            {linha(ent, COR_ENTRADAS, ctrl.opSerie('entradas'), { area: true })}
            {linha(gas, COR_GASTOS, ctrl.opSerie('gastos'), { area: true })}
            {sal && linha(sal, COR_SALDO, ctrl.opSerie('saldo'), { larg: 1.5 })}
          </svg>
          {i !== null && <span className="pointer-events-none absolute bottom-0 top-0 w-px border-l border-dashed border-gray-300" style={{ left: `${x(i)}%` }} />}
          {ponto(ent, COR_ENTRADAS, 'entradas')}{ponto(gas, COR_GASTOS, 'gastos')}{sal && ponto(sal, COR_SALDO, 'saldo')}
          <div className="absolute inset-0 flex" onMouseLeave={balao.aoSair}>
            {meses.map((mm, k) => (
              <button key={mm.competencia} type="button" onMouseMove={balao.aoMover(k)} onClick={() => mm.temDado && onMes?.(mm.competencia)}
                aria-label={nomeCompetencia(mm.competencia)}
                className={`h-full min-w-0 flex-1 ${mm.temDado && onMes ? 'cursor-pointer' : 'cursor-default'}`} />
            ))}
          </div>
        </Grade>
      </div>
      <ReguaMeses meses={meses} ativo={i} />
      {m && (
        <BalaoGrafico pos={balao.pos} largura={250} titulo={`${nomeCompetencia(m.competencia)}${acumulado ? ' · acumulado' : ''}`}
          itens={m.temDado ? [
            { rotulo: 'Entradas', valor: formatBRL(ent[i]), cor: COR_ENTRADAS },
            { rotulo: 'Gastos', valor: formatBRL(gas[i]), cor: COR_GASTOS },
            { rotulo: acumulado ? 'Sobrou até aqui' : 'Saldo', valor: formatBRL(ent[i] - gas[i]), cor: COR_SALDO },
            ...(ant ? [{ rotulo: `Gastos ${acumulado ? 'até aqui ' : ''}um ano antes`, valor: formatBRL(ant[i] ?? 0), cor: COR_ANTERIOR }] : []),
          ] : []}
          nota={m.temDado ? (onMes ? 'Clique para ver os lançamentos do mês' : undefined) : 'Nenhum lançamento neste mês.'} />
      )}
    </div>
  );
}

// SALDO DO MÊS: uma barra por mês, para CIMA (verde) quando sobrou e para BAIXO (vermelha) quando
// faltou, a partir da linha do zero. É a leitura que as colunas pareadas escondem: quanto sobrou.
export function SaldoMensal({ meses, onMes }) {
  const balao = useBalao(230, 120);
  const vals = meses.map((m) => (m.temDado ? m.saldo : 0));
  const maxPos = Math.max(0, ...vals);
  const maxNeg = Math.max(0, ...vals.map((v) => -v));
  const total = maxPos + maxNeg || 1;
  const zero = maxPos / total; // a fração da altura acima da linha do zero
  const comRotulo = meses.length <= 12;
  const i = balao.ativo;
  const m = i !== null ? meses[i] : null;
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="relative min-h-0 flex-1 pb-3 pt-5" style={{ paddingRight: CALHA }}>
        <div className="relative h-full">
          <div className="absolute left-0 right-0 border-t" style={{ top: pct(zero), borderColor: varCor('#9ca3af', 'borda') }} />
          <span className="absolute -translate-y-1/2 text-[10px] text-gray-500" style={{ top: pct(zero), right: -CALHA + 6 }}>R$ 0</span>
          <div className="absolute inset-0 flex" onMouseLeave={balao.aoSair}>
            {meses.map((mm, k) => {
              const v = vals[k];
              const pos = v >= 0;
              const h = (Math.abs(v) / total) * 100;
              return (
                <button key={mm.competencia} type="button" onMouseMove={balao.aoMover(k)} onClick={() => mm.temDado && onMes?.(mm.competencia)}
                  aria-label={`${nomeCompetencia(mm.competencia)}: saldo ${formatBRL(v)}`}
                  className={`relative h-full min-w-0 flex-1 rounded-[4px] transition-colors ${i === k ? 'bg-gray-900/[0.04]' : ''} ${mm.temDado && onMes ? 'cursor-pointer' : 'cursor-default'}`}>
                  {mm.temDado && v !== 0 && (
                    <span className={`absolute left-1/2 w-[46%] max-w-[26px] -translate-x-1/2 transition-opacity duration-150 ${pos ? 'rounded-t-[4px]' : 'rounded-b-[4px]'} ${balao.esmaecido(k) ? 'opacity-40' : ''}`}
                      style={pos ? { bottom: pct(1 - zero), height: `${h}%`, background: COR_ENTRADAS } : { top: pct(zero), height: `${h}%`, background: varCor('#e5484d', 'fundo') }} />
                  )}
                  {comRotulo && mm.temDado && v !== 0 && (
                    <span className={`pointer-events-none absolute left-1/2 hidden -translate-x-1/2 whitespace-nowrap text-[9.5px] font-semibold tabular-nums sm:block ${pos ? 'text-gray-700' : 'text-hx-c0393d'} ${balao.esmaecido(k) ? 'opacity-40' : ''}`}
                      style={pos ? { bottom: `calc(${pct(1 - zero)} + ${h}% + 2px)` } : { top: `calc(${pct(zero)} + ${h}% + 2px)` }}>
                      {brlCurto(v).replace('R$ ', '')}
                    </span>
                  )}
                  {!mm.temDado && <span className="pointer-events-none absolute bottom-0 left-1/2 hidden -translate-x-1/2 text-[9.5px] text-gray-300 sm:block">sem dados</span>}
                </button>
              );
            })}
          </div>
        </div>
      </div>
      <ReguaMeses meses={meses} ativo={i} />
      {m && (
        <BalaoGrafico pos={balao.pos} largura={230} titulo={nomeCompetencia(m.competencia)}
          itens={m.temDado ? [
            { rotulo: 'Entradas', valor: formatBRL(m.entradas), cor: COR_ENTRADAS },
            { rotulo: 'Gastos', valor: formatBRL(m.gastos), cor: COR_GASTOS },
            { rotulo: m.saldo >= 0 ? 'Sobrou' : 'Faltou', valor: formatBRL(Math.abs(m.saldo)) },
          ] : []}
          nota={m.temDado ? (m.entradas ? `${Math.round((m.saldo / m.entradas) * 100)}% das entradas. Clique para ver o mês.` : 'Sem entradas no mês.') : 'Nenhum lançamento neste mês.'} />
      )}
    </div>
  );
}

// ------------------------------------------------------------ rosca (gastos por origem)

// A ROSCA COM UMA COR POR ORIGEM (a opção A do mockup): azul, laranja e violeta, com um respiro entre as
// fatias. Passar o mouse numa fatia (ou na linha da legenda) a destaca e o CENTRO passa a contar aquela
// origem — sem balão por cima do gráfico. Clicar filtra a tela pela origem.
//
// `itens`: [{ key, rotulo, valor, antes? }] (`antes`: o mesmo período um ano antes, para a variação).
// `marcadas`: as origens do filtro.
export const CORES_ORIGEM = { cartao: 'var(--origem-cartao)', fixo: 'var(--origem-fixo)', manual: 'var(--origem-manual)' };
const corOrigem = (k) => CORES_ORIGEM[k] ?? COR_GASTOS;

// O DESENHO QUE CABE NO BLOCO (ele se redimensiona no grid): a rosca ao lado da legenda ou em cima dela, e a
// legenda completa (nome, valor, %, variação) ou compacta (uma linha só). Fica o arranjo com a MAIOR rosca, com
// um bônus para a legenda completa; abaixo de ROSCA_MIN o texto do centro não cabe e o bloco passa a rolar.
const ROSCA_MAX = 176;
const ROSCA_MIN = 104;
// altura MEDIDA de cada linha da legenda (com o vão entre elas) e a largura mínima que ela pede
const LEG = { completa: { alt: 53, larg: 200 }, compacta: { alt: 28, larg: 130 } };
const VAO_LADO = 20;
const VAO_CIMA = 8;

function arranjoRosca(w, h, n) {
  if (!w || !h) return { lado: true, D: ROSCA_MAX, compacta: false };
  const opcoes = [];
  for (const compacta of [false, true]) {
    const leg = LEG[compacta ? 'compacta' : 'completa'];
    const altLeg = leg.alt * n;
    if (h >= altLeg) opcoes.push({ lado: true, compacta, D: Math.min(ROSCA_MAX, h, w - leg.larg - VAO_LADO) });
    opcoes.push({ lado: false, compacta, D: Math.min(ROSCA_MAX, w, h - altLeg - VAO_CIMA) });
  }
  const nota = (o) => o.D + (o.compacta ? 0 : 28) + (o.lado ? 4 : 0);
  const melhor = opcoes.filter((o) => o.D >= ROSCA_MIN).sort((a, b) => nota(b) - nota(a))[0];
  return melhor ?? { lado: false, compacta: true, D: ROSCA_MIN };
}

// O tamanho útil da caixa que contém o gráfico (o pai: o miolo do bloco, sem o padding).
function useCaixaDoPai(ref) {
  const [t, setT] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const pai = ref.current?.parentElement;
    if (!pai) return undefined;
    const ro = new ResizeObserver(([e]) => {
      const w = Math.floor(e.contentRect.width);
      const h = Math.floor(e.contentRect.height);
      setT((x) => (x.w === w && x.h === h ? x : { w, h }));
    });
    ro.observe(pai);
    return () => ro.disconnect();
  }, [ref]);
  return t;
}

export function RoscaOrigem({ itens, marcadas = [], onClicar }) {
  const [ativo, setAtivo] = useState(null);
  const raizRef = useRef(null);
  const caixa = useCaixaDoPai(raizRef);
  const { lado, D, compacta } = arranjoRosca(caixa.w, caixa.h, itens.length);
  const total = itens.reduce((s, it) => s + it.valor, 0);
  const R = 66;
  const C = 2 * Math.PI * R;
  const comValor = itens.filter((x) => x.valor > 0).length;
  const pctDe = (v) => (total ? Math.round((v / total) * 100) : 0);
  const sel = itens.find((it) => it.key === ativo);
  const apagado = (k) => (ativo !== null && ativo !== k) || (ativo === null && marcadas.length > 0 && !marcadas.includes(k));
  // Rosca pequena: o texto do centro cresce no desenho (viewBox) para continuar legível na tela.
  const esc = Math.max(1, (ROSCA_MAX / D) * 0.8);
  const y = (d) => 88 + d * esc;
  const fs = (px) => ({ fontSize: px * esc });
  const larguraLegenda = lado ? caixa.w - D - VAO_LADO : caixa.w;
  let acumulado = 0;
  return (
    <div ref={raizRef} className={`flex min-h-full items-center ${lado ? 'flex-row' : 'flex-col justify-center'}`} style={{ gap: lado ? VAO_LADO : VAO_CIMA }}
      onMouseLeave={() => setAtivo(null)}>
      <svg width={D} height={D} viewBox="0 0 176 176" className="shrink-0 overflow-visible" role="img" aria-label="Gastos por origem">
        {total > 0 && itens.map((it) => {
          const frac = it.valor / total;
          const len = Math.max(0, frac * C - (comValor > 1 ? 3 : 0));
          const desloc = -acumulado * C;
          acumulado += frac;
          if (!it.valor) return null;
          return (
            <circle key={it.key} r={R} cx="88" cy="88" fill="none" stroke={corOrigem(it.key)} strokeWidth={ativo === it.key ? 27 : 21}
              strokeDasharray={`${len} ${C - len}`} strokeDashoffset={desloc} transform="rotate(-90 88 88)"
              className="cursor-pointer transition-[opacity,stroke-width] duration-200 ease-out" style={{ opacity: apagado(it.key) ? 0.3 : 1 }}
              onMouseEnter={() => setAtivo(it.key)} onClick={() => onClicar?.(it.key)} />
          );
        })}
        {total === 0 && <circle r={R} cx="88" cy="88" fill="none" stroke={varCor('#f3f4f6', 'fundo')} strokeWidth="21" />}
        {/* O CENTRO CONTA a fatia sob o cursor; sem cursor, o total. */}
        <text x="88" y={y(sel ? -14 : -8)} textAnchor="middle" className="fill-gray-500" style={fs(11)}>{sel ? sel.rotulo.replace(/ \(.*\)$/, '') : 'Total'}</text>
        {sel ? (
          <>
            <text x="88" y={y(8)} textAnchor="middle" className="fill-gray-900 font-bold" style={fs(19)}>{pctDe(sel.valor)}%</text>
            <text x="88" y={y(25)} textAnchor="middle" className="fill-gray-600" style={fs(11)}>{brlCurto(sel.valor)}</text>
          </>
        ) : (
          <text x="88" y={y(10)} textAnchor="middle" className="fill-gray-900 font-bold" style={fs(14)}>{brlCurto(total)}</text>
        )}
      </svg>
      <ul className={`min-w-0 ${lado ? 'flex-1' : 'w-full'} ${compacta ? 'space-y-0.5' : 'space-y-1'}`}>
        {itens.map((it) => {
          const v = it.antes ? variacao(it.valor, it.antes) : null;
          // COMPACTA: uma linha (cor, nome, valor quando há lugar, %); a variação fica no título.
          if (compacta) {
            return (
              <li key={it.key}>
                <button type="button" onClick={() => onClicar?.(it.key)} onMouseEnter={() => setAtivo(it.key)} onFocus={() => setAtivo(it.key)}
                  title={`${it.rotulo}: ${formatBRL(it.valor)} · clique para filtrar a tela por esta origem`}
                  className={`flex h-[26px] w-full items-center gap-2 rounded-[6px] px-2 text-left transition-[background-color,opacity] duration-150 ${
                    ativo === it.key ? 'bg-gray-100' : 'hover:bg-gray-50'} ${apagado(it.key) ? 'opacity-50' : ''} ${marcadas.includes(it.key) ? 'ring-1 ring-inset ring-gray-300' : ''}`}>
                  <span className="h-3.5 w-1 shrink-0 rounded-full" style={{ background: corOrigem(it.key) }} />
                  <span className="min-w-0 flex-1 truncate text-[12px] text-gray-800">{it.rotulo}</span>
                  {larguraLegenda >= 250 && <span className="whitespace-nowrap text-[11.5px] tabular-nums text-gray-500">{brlCurto(it.valor)}</span>}
                  <b className="w-9 shrink-0 text-right text-[12px] font-semibold tabular-nums text-gray-900">{pctDe(it.valor)}%</b>
                </button>
              </li>
            );
          }
          return (
            <li key={it.key}>
              <button type="button" onClick={() => onClicar?.(it.key)} onMouseEnter={() => setAtivo(it.key)} onFocus={() => setAtivo(it.key)}
                title="Clique para filtrar a tela por esta origem"
                className={`grid w-full grid-cols-[4px_minmax(0,1fr)_auto] items-center gap-2.5 rounded-[8px] px-2.5 py-[7px] text-left transition-[background-color,opacity] duration-150 ${
                  ativo === it.key ? 'bg-gray-100' : 'hover:bg-gray-50'} ${apagado(it.key) ? 'opacity-50' : ''} ${marcadas.includes(it.key) ? 'ring-1 ring-inset ring-gray-300' : ''}`}>
                <span className="h-[30px] w-1 rounded-full" style={{ background: corOrigem(it.key) }} />
                <span className="min-w-0">
                  <span className="block truncate text-[12.5px] text-gray-800">{it.rotulo}</span>
                  <span className="block text-[11.5px] tabular-nums text-gray-500">{formatBRL(it.valor)}</span>
                </span>
                <span className="flex flex-col items-end gap-[3px]">
                  <b className="text-[13px] font-semibold tabular-nums text-gray-900">{pctDe(it.valor)}%</b>
                  <Variacao v={v} sobeBom={false} titulo="Contra o mesmo período do ano anterior" />
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ------------------------------------------------------------ barras por grupo (e categorias)

// A curva miúda dos meses de um grupo (a coluna "tendência"). O último ponto tem a bolinha.
export function MiniCurva({ valores, cor, largura = 74, altura = 22 }) {
  if (valores.length < 2) return <span style={{ width: largura }} />;
  const max = Math.max(1, ...valores);
  const min = Math.min(...valores);
  const x = (i) => 2 + (i / (valores.length - 1)) * (largura - 4);
  const y = (v) => altura - 3 - ((v - min) / (max - min || 1)) * (altura - 7);
  const pts = valores.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  return (
    <svg width={largura} height={altura} viewBox={`0 0 ${largura} ${altura}`} className="block overflow-visible" aria-hidden="true">
      <polygon points={`${x(0)},${altura} ${pts} ${x(valores.length - 1)},${altura}`} fill={cor} fillOpacity=".14" />
      <polyline points={pts} fill="none" stroke={cor} strokeWidth="1.6" strokeLinejoin="round" />
      <circle cx={x(valores.length - 1)} cy={y(valores[valores.length - 1])} r="2.5" fill={cor} />
    </svg>
  );
}

// A largura de um elemento, medida (as colunas de tendência e variação só entram quando cabem).
function useLargura(ref) {
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return w;
}

// AS BARRAS POR GRUPO (a opção A do mockup): a barra na COR DO GRUPO, o valor, o %, a curva dos meses e
// a variação contra o mesmo período do ano anterior. O hover acende a linha e o balão lista as maiores
// categorias; clicar num grupo ABRE as categorias dele (com "‹ Todos os grupos" para voltar);
// "Categorias" lista as maiores de todos.
//
// QUANTAS LINHAS: as que CABEM no bloco (medido — o bloco se redimensiona no grid). Se tudo cabe, tudo
// aparece; se não, a última vaga vira um RESUMO quieto do resto ("+ 3 grupos menores · R$ … · 4%", com
// o balão listando quem são), e a lista inteira fica no AMPLIAR (`onAmpliar`). `semLimite`: o ampliado,
// que mostra tudo.
//
// `grupos`: o `gruposPorMes`. `comps`: os meses do período (a curva). `anterior`: Map de "g:<id>" e
// "c:<grupo>:<categoria>" → total um ano antes (sem ele, não há a coluna da variação).
const MAX_CATEGORIAS = 12;
const ALT_LINHA = 35; // a altura de uma linha antes da primeira medida

// Quantas linhas cabem na caixa que rola o bloco (o pai): a altura dela menos o padding, o cabeçalho e uma
// folga, dividida pela altura MEDIDA de uma linha.
function useLinhasQueCabem(caixaRef, cabecalhoRef, ativo) {
  const [cabem, setCabem] = useState(Infinity);
  useLayoutEffect(() => {
    const caixa = caixaRef.current?.parentElement;
    if (!ativo || !caixa) return undefined;
    const medir = () => {
      const cs = getComputedStyle(caixa);
      const util = caixa.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom)
        - (cabecalhoRef.current?.getBoundingClientRect().height ?? 40) - 8;
      const linha = caixaRef.current.querySelector('li')?.getBoundingClientRect().height || ALT_LINHA;
      const n = Math.max(3, Math.floor(util / (linha + 2)));
      setCabem((x) => (x === n ? x : n));
    };
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(caixa);
    return () => ro.disconnect();
  }, [caixaRef, cabecalhoRef, ativo]);
  return ativo ? cabem : Infinity;
}

const IconAmpliarBloco = () => (
  <svg viewBox="0 0 24 24" className="h-[15px] w-[15px]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
    <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
  </svg>
);

export function BarrasGrupos({ grupos, total, meses, comps = [], anterior = null, onAmpliar, semLimite = false }) {
  const balao = useBalao(250, 170);
  const caixaRef = useRef(null);
  const cabecalhoRef = useRef(null);
  const largura = useLargura(caixaRef);
  const [modo, setModo] = useState('grupos');
  const [aberto, setAberto] = useState(null);
  const cabem = useLinhasQueCabem(caixaRef, cabecalhoRef, !semLimite);
  const grupo = grupos.find((g) => g.id === aberto);
  let lista;
  if (grupo) lista = grupo.categorias.map((c) => ({ ...c, chave: `c:${grupo.id}:${c.id}`, cor: grupo.cor, grupo }));
  else if (modo === 'categorias') {
    lista = grupos.flatMap((g) => g.categorias.map((c) => ({ ...c, id: `${g.id}:${c.id}`, chave: `c:${g.id}:${c.id}`, cor: g.cor, grupo: g })))
      .sort((a, b) => b.total - a.total).slice(0, semLimite ? undefined : MAX_CATEGORIAS);
  } else lista = grupos.map((g) => ({ ...g, chave: `g:${g.id}` }));
  const sobra = lista.length > cabem;
  const itens = sobra ? lista.slice(0, cabem - 1) : lista;
  const resto = sobra ? lista.slice(cabem - 1) : [];
  const somaResto = resto.reduce((s2, x) => s2 + x.total, 0);
  const nomeResto = grupo || modo === 'categorias' ? ['categoria menor', 'categorias menores'] : ['grupo menor', 'grupos menores'];
  const max = Math.max(1, ...lista.map((it) => it.total));
  const ativo = itens.find((it) => it.id === balao.ativo);
  const comTendencia = largura >= 640 && comps.length > 1;
  const comVariacao = largura >= 560 && !!anterior;
  const colunas = `minmax(0,11rem) 1fr auto 2.6rem${comTendencia ? ' 74px' : ''}${comVariacao ? ' 4.2rem' : ''}`;

  let nota;
  if (balao.ativo === 'resto') nota = onAmpliar ? 'Clique para ampliar e ver a lista inteira.' : undefined;
  else if (ativo) {
    const parte = `${total ? Math.round((ativo.total / total) * 100) : 0}% dos gastos · média ${formatBRL(ativo.media)}/mês`;
    const v = anterior?.get(ativo.chave) ? variacao(ativo.total, anterior.get(ativo.chave)) : null;
    const vs = v === null ? '' : ` · ${v > 0 ? '+' : ''}${v}% sobre o ano anterior`;
    nota = ativo.categorias ? `${parte}${vs}. Clique para abrir as categorias.` : `${parte}${vs} · ${ativo.qtd} lançamento(s).`;
  }

  return (
    <div ref={caixaRef}>
      <div ref={cabecalhoRef} className="mb-2 flex items-center gap-2">
        <h2 className="m-0 flex-1 text-[10.5px] font-bold uppercase tracking-[0.06em] text-gray-500">
          {grupo ? (
            <>
              <button type="button" onClick={() => setAberto(null)} className="normal-case tracking-normal text-gray-500 hover:text-gray-800">‹ Todos os grupos</button>
              <span className="mx-1.5 text-gray-300">/</span>{grupo.nome}
            </>
          ) : 'Gastos por grupo'}
        </h2>
        {(comTendencia || comVariacao) && (
          <span className="hidden text-[11px] text-gray-400 sm:inline">{[comTendencia && 'tendência', comVariacao && 'vs. ano anterior'].filter(Boolean).join(' · ')}</span>
        )}
        <AbasPilula abas={[{ key: 'grupos', label: 'Grupos' }, { key: 'categorias', label: 'Categorias' }]} valor={modo}
          onChange={(m) => { setModo(m); setAberto(null); }} variante="claro" altura={30} folga={2} />
        {onAmpliar && (
          <button type="button" onClick={onAmpliar} title="Ampliar: a lista inteira"
            className="inline-flex h-7 w-7 items-center justify-center rounded-[4px] text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-800">
            <IconAmpliarBloco />
          </button>
        )}
      </div>
      {itens.length === 0 ? <p className="py-6 text-center text-sm text-gray-400">Nenhum gasto no período.</p> : (
        <ul className="space-y-0.5" onMouseLeave={balao.aoSair}>
          {itens.map((it) => {
            const v = anterior?.get(it.chave) ? variacao(it.total, anterior.get(it.chave)) : null;
            return (
              <li key={it.id}>
                <button type="button" onMouseMove={balao.aoMover(it.id)}
                  onClick={() => { if (it.categorias) setAberto(it.id); }}
                  style={{ gridTemplateColumns: colunas }}
                  className={`grid w-full items-center gap-3 rounded-[7px] px-2 py-[6px] text-left transition-[background-color,opacity] duration-150 ${
                    balao.ativo === it.id ? 'bg-gray-100' : 'hover:bg-gray-50'} ${balao.esmaecido(it.id) ? 'opacity-50' : ''} ${it.categorias ? 'cursor-pointer' : 'cursor-default'}`}>
                  <span className="flex min-w-0 items-center gap-2 text-[12.5px] text-gray-800">
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: it.cor }} />
                    <span className="truncate">{it.nome}</span>
                  </span>
                  {/* A barra na COR DO GRUPO, num degradê que nasce mais claro (a cor identifica; o
                      comprimento é o valor). */}
                  <span className="h-2.5 overflow-hidden rounded-full bg-gray-100">
                    <span className="block h-full rounded-full transition-[width] duration-300 ease-out"
                      style={{ width: pct(it.total / max), background: `linear-gradient(90deg, color-mix(in srgb, ${it.cor} 50%, transparent), ${it.cor})` }} />
                  </span>
                  <span className="whitespace-nowrap text-right text-[12.5px] font-medium tabular-nums text-gray-900">{formatBRL(it.total)}</span>
                  <span className="text-right text-[11.5px] tabular-nums text-gray-500">{total ? Math.round((it.total / total) * 100) : 0}%</span>
                  {comTendencia && <MiniCurva valores={comps.map((c) => it.meses?.[c] ?? 0)} cor={it.cor} />}
                  {comVariacao && <span className="flex justify-end"><Variacao v={v} sobeBom={false} titulo="Contra o mesmo período do ano anterior" /></span>}
                </button>
              </li>
            );
          })}
          {/* O RESUMO DO RESTO: uma linha quieta, no mesmo desenho das outras (barra cinza, sem curva). O
              balão diz quem são; clicar amplia. */}
          {resto.length > 0 && (
            <li>
              <button type="button" onMouseMove={balao.aoMover('resto')} onClick={onAmpliar}
                style={{ gridTemplateColumns: colunas }}
                className={`grid w-full items-center gap-3 rounded-[7px] px-2 py-[6px] text-left transition-[background-color,opacity] duration-150 ${
                  balao.ativo === 'resto' ? 'bg-gray-100' : 'hover:bg-gray-50'} ${balao.esmaecido('resto') ? 'opacity-50' : ''} ${onAmpliar ? 'cursor-pointer' : 'cursor-default'}`}>
                <span className="flex min-w-0 items-center gap-2 text-[12.5px] text-gray-500">
                  <span className="h-2 w-2 shrink-0 rounded-full border border-gray-400" />
                  <span className="truncate">+ {resto.length} {resto.length === 1 ? nomeResto[0] : nomeResto[1]}</span>
                </span>
                <span className="h-2.5 overflow-hidden rounded-full bg-gray-100">
                  <span className="block h-full rounded-full bg-gray-300" style={{ width: pct(Math.min(1, somaResto / max)) }} />
                </span>
                <span className="whitespace-nowrap text-right text-[12.5px] tabular-nums text-gray-600">{formatBRL(somaResto)}</span>
                <span className="text-right text-[11.5px] tabular-nums text-gray-500">{total ? Math.round((somaResto / total) * 100) : 0}%</span>
                {comTendencia && <span />}
                {comVariacao && <span />}
              </button>
            </li>
          )}
        </ul>
      )}
      {balao.ativo === 'resto' && resto.length > 0 && (
        <BalaoGrafico pos={balao.pos} largura={250} titulo={`${resto.length} ${nomeResto[1]} · ${meses}`}
          itens={[...resto.slice(0, 5).map((x) => ({ rotulo: x.nome, valor: formatBRL(x.total), cor: x.cor })),
            ...(resto.length > 5 ? [{ rotulo: `+ ${resto.length - 5} outros`, valor: formatBRL(resto.slice(5).reduce((s2, x) => s2 + x.total, 0)) }] : [])]}
          nota={nota} />
      )}
      {ativo && (
        <BalaoGrafico pos={balao.pos} largura={250} titulo={`${ativo.grupo && !grupo ? `${ativo.grupo.nome} · ` : ''}${ativo.nome} · ${meses}`}
          itens={ativo.categorias
            ? [...ativo.categorias.slice(0, 3).map((c) => ({ rotulo: c.nome, valor: formatBRL(c.total) })),
              ...(ativo.categorias.length > 3 ? [{ rotulo: `+ ${ativo.categorias.length - 3} categorias`, valor: formatBRL(ativo.categorias.slice(3).reduce((s, c) => s + c.total, 0)) }] : [])]
            : [{ rotulo: 'Gastos', valor: formatBRL(ativo.total), cor: ativo.cor }]}
          nota={nota} />
      )}
    </div>
  );
}
