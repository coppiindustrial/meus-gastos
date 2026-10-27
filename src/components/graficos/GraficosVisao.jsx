import { useState } from 'react';
import BalaoGrafico, { useBalao } from './BalaoGrafico.jsx';
import { COR_ENTRADAS, COR_GASTOS, CALHA, Grade } from './Graficos.jsx';
import { escalaLinear } from '../../lib/escala.js';
import { tomAno } from '../../lib/coresGrafico.js';
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

// `itens`: [{ key, rotulo, valor }] na ordem do maior peso; a cor é a rampa do azul dos gastos (a
// origem é parte de UM total, então é tom do mesmo azul, e o nome está sempre escrito na legenda).
// `marcadas`: as origens do filtro; clicar numa fatia (ou na linha da legenda) chama `onClicar(key)`.
export function RoscaOrigem({ itens, marcadas = [], onClicar }) {
  const balao = useBalao(220, 90);
  const total = itens.reduce((s, it) => s + it.valor, 0);
  const R = 62;
  const C = 2 * Math.PI * R;
  const cor = (i) => tomAno(COR_GASTOS, itens.length - 1 - i, itens.length);
  let acumulado = 0;
  const ativo = itens.find((it) => it.key === balao.ativo);
  const apagado = (k) => balao.esmaecido(k) || (marcadas.length > 0 && !marcadas.includes(k) && balao.ativo === null);
  return (
    <div className="flex flex-wrap items-center gap-5">
      <svg width="168" height="168" viewBox="0 0 168 168" className="shrink-0" onMouseLeave={balao.aoSair} role="img" aria-label="Gastos por origem">
        {total > 0 && itens.map((it, i) => {
          const frac = it.valor / total;
          const len = Math.max(0, frac * C - (itens.filter((x) => x.valor > 0).length > 1 ? 2.5 : 0));
          const desloc = -acumulado * C;
          acumulado += frac;
          if (!it.valor) return null;
          return (
            <circle key={it.key} r={R} cx="84" cy="84" fill="none" stroke={cor(i)} strokeWidth={balao.ativo === it.key ? 27 : 24}
              strokeDasharray={`${len} ${C - len}`} strokeDashoffset={desloc} transform="rotate(-90 84 84)"
              className="cursor-pointer transition-[opacity,stroke-width] duration-150" style={{ opacity: apagado(it.key) ? 0.35 : 1 }}
              onMouseMove={balao.aoMover(it.key)} onClick={() => onClicar?.(it.key)} />
          );
        })}
        {total === 0 && <circle r={R} cx="84" cy="84" fill="none" stroke={varCor('#f3f4f6', 'fundo')} strokeWidth="24" />}
        <text x="84" y="79" textAnchor="middle" className="fill-gray-500 text-[10.5px]">Total</text>
        <text x="84" y="96" textAnchor="middle" className="fill-gray-900 text-[13px] font-bold">{brlCurto(total)}</text>
      </svg>
      <ul className="min-w-[200px] flex-1 space-y-0.5">
        {itens.map((it, i) => (
          <li key={it.key}>
            <button type="button" onClick={() => onClicar?.(it.key)} onMouseEnter={(e) => balao.aoMover(it.key)(e)} onMouseLeave={balao.aoSair}
              className={`flex w-full items-center gap-2 rounded-[4px] px-1.5 py-1.5 text-left text-[12.5px] transition-opacity hover:bg-gray-50 ${apagado(it.key) ? 'opacity-50' : ''} ${marcadas.includes(it.key) ? 'bg-gray-100 font-semibold' : ''}`}>
              <span className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: cor(i) }} />
              <span className="min-w-0 flex-1 truncate text-gray-700">{it.rotulo}</span>
              <span className="tabular-nums text-gray-900">{formatBRL(it.valor)}</span>
              <span className="w-9 text-right text-[11.5px] tabular-nums text-gray-500">{total ? Math.round((it.valor / total) * 100) : 0}%</span>
            </button>
          </li>
        ))}
      </ul>
      {ativo && (
        <BalaoGrafico pos={balao.pos} largura={220} titulo={ativo.rotulo}
          itens={[{ rotulo: 'Gastos', valor: formatBRL(ativo.valor), cor: cor(itens.indexOf(ativo)) }]}
          nota={`${total ? Math.round((ativo.valor / total) * 100) : 0}% dos gastos do período. Clique para filtrar a tela por esta origem.`} />
      )}
    </div>
  );
}

// ------------------------------------------------------------ barras por grupo (e categorias)

// `grupos`: o `gruposPorMes`. Mostra os grupos; clicar num grupo ABRE as categorias dele (com "‹ Todos
// os grupos" para voltar); "Categorias" lista as maiores categorias de todos os grupos.
const MAX_CATEGORIAS = 12;

export function BarrasGrupos({ grupos, total, meses }) {
  const balao = useBalao(250, 150);
  const [modo, setModo] = useState('grupos');
  const [aberto, setAberto] = useState(null);
  const grupo = grupos.find((g) => g.id === aberto);
  let itens;
  if (grupo) itens = grupo.categorias.map((c) => ({ ...c, cor: grupo.cor, grupo }));
  else if (modo === 'categorias') {
    const todas = grupos.flatMap((g) => g.categorias.map((c) => ({ ...c, id: `${g.id}:${c.id}`, cor: g.cor, grupo: g }))).sort((a, b) => b.total - a.total);
    itens = todas.slice(0, MAX_CATEGORIAS);
    const resto = todas.slice(MAX_CATEGORIAS);
    if (resto.length) itens.push({ id: 'resto', nome: `Outras ${resto.length} categorias`, total: resto.reduce((s, c) => s + c.total, 0), qtd: resto.reduce((s, c) => s + c.qtd, 0), cor: varCor('#d1d5db', 'fundo'), resto: true });
  } else itens = grupos;
  const max = Math.max(1, ...itens.map((it) => it.total));
  const ativo = itens.find((it) => it.id === balao.ativo);

  const botao = (id, rotulo) => (
    <button type="button" onClick={() => { setModo(id); setAberto(null); }}
      className={`rounded-[3px] px-2 py-[3px] text-[11.5px] transition-colors ${modo === id && !grupo ? 'bg-chip-ativo font-semibold text-chip-ativo' : 'text-gray-600 hover:bg-gray-200'}`}>
      {rotulo}
    </button>
  );

  let nota;
  if (ativo && !ativo.resto) {
    const parte = `${total ? Math.round((ativo.total / total) * 100) : 0}% dos gastos · média ${formatBRL(ativo.media)}/mês`;
    nota = ativo.categorias ? `${parte}. Clique para abrir as categorias.` : `${parte} · ${ativo.qtd} lançamento(s).`;
  }

  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <h2 className="m-0 flex-1 text-[10.5px] font-bold uppercase tracking-[0.06em] text-gray-500">
          {grupo ? (
            <>
              <button type="button" onClick={() => setAberto(null)} className="normal-case tracking-normal text-gray-500 hover:text-gray-800">‹ Todos os grupos</button>
              <span className="mx-1.5 text-gray-300">/</span>{grupo.nome}
            </>
          ) : 'Gastos por grupo'}
        </h2>
        <span className="inline-flex h-[27px] items-center rounded-[6px] border border-gray-300 bg-hx-f6f7f8 p-[2px]">
          {botao('grupos', 'Grupos')}{botao('categorias', 'Categorias')}
        </span>
      </div>
      {itens.length === 0 ? <p className="py-6 text-center text-sm text-gray-400">Nenhum gasto no período.</p> : (
        <ul className="space-y-0.5" onMouseLeave={balao.aoSair}>
          {itens.map((it) => (
            <li key={it.id}>
              <button type="button" onMouseMove={balao.aoMover(it.id)}
                onClick={() => { if (it.categorias) setAberto(it.id); }}
                className={`grid w-full grid-cols-[minmax(0,10rem)_1fr_auto_2.5rem] items-center gap-3 rounded-[4px] px-1.5 py-[5px] text-left transition-opacity duration-150 hover:bg-gray-50 ${
                  balao.esmaecido(it.id) ? 'opacity-45' : ''} ${it.categorias ? 'cursor-pointer' : 'cursor-default'}`}>
                <span className="flex min-w-0 items-center gap-2 text-[12.5px] text-gray-700">
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: it.cor }} />
                  <span className="truncate">{it.nome}</span>
                </span>
                <span className="h-3 rounded-r-[4px] bg-gray-100">
                  <span className="block h-full rounded-r-[4px]" style={{ width: pct(it.total / max), background: grupo || modo === 'categorias' ? it.cor : COR_GASTOS }} />
                </span>
                <span className="whitespace-nowrap text-right text-[12.5px] tabular-nums text-gray-900">{formatBRL(it.total)}</span>
                <span className="text-right text-[11.5px] tabular-nums text-gray-500">{total ? Math.round((it.total / total) * 100) : 0}%</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {ativo && !ativo.resto && (
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

