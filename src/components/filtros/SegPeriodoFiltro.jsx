import { useRef } from 'react';
import SegmentoFiltro from './SegmentoFiltro.jsx';
import {
  MODOS_PERIODO, compsDoPeriodo, ehPadrao, escolherAno, escolherMes, mesesDoPeriodo, periodoPadrao, textoDoPeriodo,
} from '../../lib/periodoFiltro.js';

// O SEGMENTO DO PERÍODO (06/11/2026, opção B do mockup "O filtro de período"): no trilho, o lugar do Ano + Meses de
// antes. O menu tem os TIPOS numa coluna à esquerda (o que cada um faz embaixo do nome) e, ao lado, o ANO (Ctrl+clique
// soma mais um) e a grade do tipo: os 12 meses (Mês, Acumulado e 12 meses), os 4 trimestres, os 2 semestres, os anos. Os
// meses sem lançamento ficam apagados (`comDado`: as competências com algum lançamento). No rodapé, o período em
// palavras e "O ano todo" (o padrão). As contas em lib/periodoFiltro.js (testadas).
const CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const BOTAO = 'rounded-[4px] border text-[12px] transition-colors';
const SEL = 'border-gray-800 bg-gray-800 font-semibold text-white';
const FAIXA = 'border-transparent bg-chip-ativo font-medium text-chip-ativo';
const LIVRE = 'border-gray-200 text-gray-700 hover:bg-gray-100';
const APAGADO = 'border-gray-100 text-gray-300';

export default function SegPeriodoFiltro({ id = 'periodo', per, onChange, hoje, anos: opcoesAnos, comDado }) {
  const ultimo = useRef(null);
  const padrao = ehPadrao(per, hoje);
  const texto = textoDoPeriodo(per);
  const temDado = (m) => !comDado || per.anos.some((a) => comDado.has(`${a}-${String(m).padStart(2, '0')}`));
  const muda = (n) => onChange({ ...per, ...n });
  const anoMaisNovo = Math.max(...per.anos);

  const gradeMeses = () => {
    const sel = per.modo === 'mes' ? new Set(mesesDoPeriodo(per)) : new Set();
    return (
      <div className="grid grid-cols-4 gap-1">
        {CURTOS.map((nome, i) => {
          const m = i + 1;
          const tem = temDado(m);
          let cls = tem ? LIVRE : APAGADO;
          if (per.modo === 'mes' && sel.has(m)) cls = SEL;
          if ((per.modo === 'acum' || per.modo === '12m') && m === per.ate) cls = SEL;
          else if (per.modo === 'acum' && m < per.ate) cls = FAIXA;
          else if (per.modo === '12m' && m < per.ate) cls = FAIXA;
          return (
            <button key={nome} type="button" aria-pressed={cls === SEL}
              onClick={(e) => {
                if (per.modo === 'mes') { muda({ meses: escolherMes(per.meses, m, { shift: e.shiftKey, ctrl: e.ctrlKey || e.metaKey, ultimo: ultimo.current }) }); ultimo.current = m; }
                else muda({ ate: m });
              }}
              className={`${BOTAO} py-[7px] ${cls}`}>{nome}</button>
          );
        })}
      </div>
    );
  };
  const dica = {
    mes: 'Clique: um mês · Shift+clique: um intervalo · Ctrl+clique: vários',
    acum: 'Clique no mês em que termina (começa em janeiro)',
    '12m': `Clique no último mês: os 12 terminam nele (em ${anoMaisNovo})`,
    tri: '', sem: '', ano: 'Ctrl+clique soma mais de um ano',
  }[per.modo];

  return (
    <SegmentoFiltro id={id} rotulo="Período" valor={padrao ? '' : `Período: ${texto}`} textoQuieto={padrao ? `Período: ${texto}` : undefined}
      largura={448} alturaMenu={360} larguraValor={240} onLimpar={padrao ? undefined : () => onChange(periodoPadrao(hoje))}>
      <div className="p-1">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-gray-400">Período</span>
          <span className="text-[11px] text-gray-400">{compsDoPeriodo(per).length} {compsDoPeriodo(per).length === 1 ? 'mês' : 'meses'}</span>
        </div>
        <div className="flex gap-3">
          {/* os tipos, à esquerda */}
          <div className="flex w-[124px] shrink-0 flex-col gap-0.5 border-r border-gray-100 pr-2">
            {MODOS_PERIODO.map((m) => (
              <button key={m.id} type="button" aria-pressed={per.modo === m.id}
                onClick={() => muda({ modo: m.id, ...(m.id === 'mes' && !per.meses.length ? { meses: [per.ate] } : {}) })}
                className={`rounded-[5px] px-2 py-1.5 text-left transition-colors ${per.modo === m.id ? 'bg-chip-ativo text-chip-ativo' : 'text-gray-700 hover:bg-gray-100'}`}>
                <span className="block text-[12.5px] font-semibold leading-tight">{m.rotulo}</span>
                <span className={`block text-[10.5px] leading-tight ${per.modo === m.id ? 'opacity-80' : 'text-gray-400'}`}>{m.dica}</span>
              </button>
            ))}
          </div>
          {/* o ano e a grade, ao lado */}
          <div className="min-w-0 flex-1">
            {per.modo !== 'ano' && (
              <div className="mb-2 flex flex-wrap items-center gap-1">
                <span className="mr-1 text-[11px] text-gray-400">Ano</span>
                {opcoesAnos.map((a) => (
                  <button key={a} type="button" aria-pressed={per.anos.includes(a)} onClick={(e) => muda({ anos: escolherAno(per.anos, a, { ctrl: e.ctrlKey || e.metaKey }) })}
                    className={`rounded-[4px] px-2 py-1 text-[12px] font-semibold transition-colors ${per.anos.includes(a) ? 'bg-chip-ativo text-chip-ativo' : 'text-gray-600 hover:bg-gray-100'}`}>{a}</button>
                ))}
              </div>
            )}
            {(per.modo === 'mes' || per.modo === 'acum' || per.modo === '12m') && gradeMeses()}
            {per.modo === 'tri' && (
              <div className="grid grid-cols-2 gap-1">
                {[1, 2, 3, 4].map((t) => {
                  const tem = [1, 2, 3].some((k) => temDado((t - 1) * 3 + k));
                  return <button key={t} type="button" onClick={() => muda({ tri: t })} className={`${BOTAO} py-2.5 ${per.tri === t ? SEL : tem ? LIVRE : APAGADO}`}>{t}º trimestre<span className="block text-[10.5px] font-normal opacity-70">{CURTOS[(t - 1) * 3]} a {CURTOS[t * 3 - 1]}</span></button>;
                })}
              </div>
            )}
            {per.modo === 'sem' && (
              <div className="grid grid-cols-2 gap-1">
                {[1, 2].map((s) => {
                  const tem = [1, 2, 3, 4, 5, 6].some((k) => temDado((s - 1) * 6 + k));
                  return <button key={s} type="button" onClick={() => muda({ sem: s })} className={`${BOTAO} py-3 ${per.sem === s ? SEL : tem ? LIVRE : APAGADO}`}>{s}º semestre<span className="block text-[10.5px] font-normal opacity-70">{s === 1 ? 'jan a jun' : 'jul a dez'}</span></button>;
                })}
              </div>
            )}
            {per.modo === 'ano' && (
              <div className="grid grid-cols-2 gap-1">
                {opcoesAnos.map((a) => (
                  <button key={a} type="button" onClick={(e) => muda({ anos: escolherAno(per.anos, a, { ctrl: e.ctrlKey || e.metaKey }) })}
                    className={`${BOTAO} py-2.5 ${per.anos.includes(a) ? SEL : LIVRE}`}>{a}<span className="block text-[10.5px] font-normal opacity-70">o ano todo</span></button>
                ))}
              </div>
            )}
            <p className="mt-2 text-[10.5px] leading-[14px] text-gray-400">{dica ? `${dica} · ` : ''}Meses sem lançamento ficam apagados.</p>
          </div>
        </div>
        <div className="-mx-1 mt-2 flex items-center gap-2 border-t border-gray-100 px-2 pt-2">
          <span className="min-w-0 flex-1 truncate text-[12px] text-gray-600">{texto.replace(/^./, (c) => c.toUpperCase())}</span>
          {!padrao && (
            <button type="button" onClick={() => onChange(periodoPadrao(hoje))}
              className="rounded-[4px] border border-gray-200 px-2 py-1 text-[11.5px] font-semibold text-gray-600 transition-colors hover:bg-gray-100">O ano todo</button>
          )}
        </div>
      </div>
    </SegmentoFiltro>
  );
}
