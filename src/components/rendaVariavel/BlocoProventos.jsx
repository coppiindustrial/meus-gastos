import { useMemo, useState } from 'react';
import AbasPilula from '../AbasPilula.jsx';
import BalaoGrafico, { useBalao } from '../graficos/BalaoGrafico.jsx';
import LegendaSeries, { useDestaqueSeries } from '../graficos/LegendaSeries.jsx';
import { GradeEsq, ReguaMeses, formatoRotulo, posRotulo } from '../graficos/GraficosVisao.jsx';
import { TituloBloco } from '../patrimonio/BlocosPatrimonio.jsx';
import { CLASSE_GUIA, COR_ROTULO } from '../../lib/coresGrafico.js';
import { escalaLinear } from '../../lib/escala.js';
import { formatBRL } from '../../lib/dinheiro.js';
import { competenciaCurta, nomeCompetencia } from '../../lib/format.js';
import { lsGet, lsSet } from '../../lib/storage.js';
import { proventosPorMes } from '../../lib/rendaVariavel.js';

// OS PROVENTOS NO PATRIMÔNIO (13/11/2026, a pedido: "os proventos vão ficar melhor no Patrimônio"): o que os ativos da renda
// variável pagaram em cada mês, líquido e em reais, empilhado por ativo (o chrome do "Entradas × gastos": o eixo à esquerda,
// o número em cima de cada coluna, a guia e os outros meses a 40% no hover, o balão com cada ativo, a legenda que fixa); o
// ANUNCIADO (a data depois de hoje) vem hachurado. Em cima, os números: o recebido em 12 meses, a média dos últimos 6, o a
// receber e o rendimento dos FIIs (o último mês fechado × 12 ÷ o custo). A chave Gráfico | Ativo × mês (`patrimonio_proventos`).
const PALETA = ['var(--origem-fixo)', 'var(--serie-gastos)', 'var(--serie-entradas)', 'var(--serie-sobrou)', 'var(--origem-manual)', 'color-mix(in srgb, var(--origem-fixo) 55%, var(--serie-sobrou))'];
const frac = (x) => `${x * 100}%`;
const hachura = (cor) => `repeating-linear-gradient(135deg, ${cor} 0 3px, color-mix(in srgb, ${cor} 35%, transparent) 3px 6px)`;

export default function BlocoProventos({ posicoes, comps, hoje, textoPer }) {
  const [vista, setVistaEstado] = useState(() => (lsGet('patrimonio_proventos') === 'tabela' ? 'tabela' : 'grafico'));
  const setVista = (v) => { setVistaEstado(v); lsSet('patrimonio_proventos', v); };
  const ctrl = useDestaqueSeries();
  const balao = useBalao(240, 150);
  const comProv = posicoes.filter((p) => p.proventos.length);
  const tickers = comProv.map((p) => p.ativo.ticker);
  const cor = Object.fromEntries(tickers.map((t, i) => [t, PALETA[i % PALETA.length]]));
  const meses = useMemo(() => proventosPorMes(comProv, comps), [comProv, comps]);
  const mesHoje = hoje.slice(0, 7);
  const pagos = meses.filter((m) => m.competencia < mesHoje);
  const ult6 = pagos.slice(-6);
  const media = ult6.length ? ult6.reduce((s, m) => s + m.total, 0) / ult6.length : 0;
  const recebido12 = posicoes.reduce((s, p) => s + (p.proventos12 ?? 0), 0);
  const aReceber = posicoes.reduce((s, p) => s + p.proventos.filter((x) => x.aReceber).reduce((t, x) => t + x.liquidoReais, 0), 0);
  const quemAReceber = posicoes.filter((p) => p.proventos.some((x) => x.aReceber));
  // o rendimento dos FIIs: o que pagaram no último mês fechado × 12 ÷ o custo deles
  const fiis = posicoes.filter((p) => p.ativo.tipo === 'fii' && p.quantidade > 0);
  const ultimo = pagos[pagos.length - 1];
  const custoFii = fiis.reduce((s, p) => s + p.custoReais, 0);
  const pagoFii = ultimo ? fiis.reduce((s, p) => s + (ultimo.porAtivo[p.ativo.ticker] ?? 0), 0) : 0;
  const yieldFii = custoFii > 0 && pagoFii > 0 ? (pagoFii * 12) / custoFii : null;

  const numero = (rotulo, valor, sub) => (
    <div className="min-w-0 rounded-[8px] border border-gray-200 px-3 py-2">
      <div className="truncate text-[11.5px] font-semibold text-gray-600">{rotulo}</div>
      <div className="whitespace-nowrap text-[16px] font-semibold tabular-nums tracking-[-0.02em] text-gray-900">{valor}</div>
      <div className="truncate text-[11px] text-gray-500">{sub}</div>
    </div>
  );

  const max = Math.max(1, ...meses.map((m) => m.total));
  const esc = escalaLinear(max / 100);
  const fr = (c) => esc.fracao(Math.max(0, c) / 100);
  const rot = formatoRotulo(esc.marcas[esc.marcas.length - 1]); // o topo em reais; `rot` recebe centavos
  const sob = balao.ativo !== null ? meses.find((m) => m.competencia === balao.ativo) : null;

  return (
    <section className="card flex flex-col overflow-hidden p-5">
      <TituloBloco titulo="Proventos" sub={`o que a renda variável pagou, líquido e em reais · ${textoPer}`}
        extra={<AbasPilula abas={[{ key: 'grafico', label: 'Gráfico' }, { key: 'tabela', label: 'Ativo × mês' }]} valor={vista} onChange={setVista} variante="claro" altura={30} folga={2} />} />
      <div className="mb-3 grid grid-cols-2 gap-2 lg:grid-cols-4">
        {numero('Recebido em 12 meses', formatBRL(Math.round(recebido12)), 'líquido, já em reais')}
        {numero('Média por mês', formatBRL(Math.round(media)), ult6.length ? `nos últimos ${ult6.length} ${ult6.length === 1 ? 'mês' : 'meses'}` : 'sem mês fechado')}
        {numero('A receber', formatBRL(Math.round(aReceber)), quemAReceber.length ? quemAReceber.map((p) => p.ativo.ticker).join(', ') : 'nada anunciado')}
        {numero('Rendimento dos FIIs', yieldFii === null ? '—' : `${(yieldFii * 100).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}% a.a.`, 'o último mês × 12 ÷ o custo')}
      </div>
      {!comProv.length ? (
        <p className="py-6 text-center text-sm text-gray-400">Nenhum provento ainda. Eles entram pelo "Lançar operação" da Renda variável (o tipo Provento).</p>
      ) : vista === 'grafico' ? (
        <>
          <div className="min-h-[160px] flex-1 pt-4">
            <GradeEsq esc={esc}>
              <div className="absolute inset-0 flex gap-1.5" onMouseLeave={balao.aoSair}>
                {meses.map((m) => {
                  const pecas = tickers.filter((t) => m.porAtivo[t]);
                  return (
                    <button key={m.competencia} type="button" onMouseMove={balao.aoMover(m.competencia)} aria-label={`${nomeCompetencia(m.competencia)}: ${formatBRL(Math.round(m.total))}`}
                      className="relative h-full min-w-0 flex-1 cursor-default transition-opacity duration-100" style={{ opacity: balao.esmaecido(m.competencia) ? 0.4 : 1 }}>
                      {(() => {
                        let n = 0;
                        return pecas.map((t) => {
                          const v = m.porAtivo[t]; const a = m.aReceber[t] ?? 0;
                          const p = (
                            <span key={t} className="absolute left-[22%] right-[22%] rounded-[1.5px] transition-opacity duration-150"
                              style={{ bottom: `calc(${frac(fr(n))} + ${pecas.indexOf(t) * 2}px)`, height: `max(2px, ${frac(fr(n + v) - fr(n))})`, background: a ? hachura(cor[t]) : cor[t], opacity: ctrl.opSerie(t) }} />
                          );
                          n += v;
                          return p;
                        });
                      })()}
                      {m.total > 0 && <span className="absolute inset-x-[-8px] hidden text-center text-[9.5px] font-semibold tabular-nums sm:block" style={{ bottom: posRotulo(fr(m.total)), color: COR_ROTULO }}>{rot(Math.round(m.total))}</span>}
                      {balao.ativo === m.competencia && <span className={`${CLASSE_GUIA} left-1/2`} />}
                    </button>
                  );
                })}
              </div>
            </GradeEsq>
          </div>
          <ReguaMeses meses={meses} ativo={balao.ativo} />
          <LegendaSeries ctrl={ctrl} series={[...tickers.map((t) => ({ key: t, rotulo: t, cor: cor[t] })), ...(aReceber > 0 ? [{ key: '__ar', rotulo: 'anunciado, a receber', cor: 'var(--origem-manual)', forma: 'tracejado' }] : [])]} />
          {sob && (
            <BalaoGrafico pos={balao.pos} largura={240} titulo={`${nomeCompetencia(sob.competencia)}${sob.competencia === mesHoje ? ' · até hoje' : ''}`}
              itens={[...tickers.filter((t) => sob.porAtivo[t]).map((t) => ({ rotulo: `${t}${sob.aReceber[t] ? ' · a receber' : ''}`, valor: formatBRL(Math.round(sob.porAtivo[t])), cor: cor[t] })), { rotulo: 'Total', valor: formatBRL(Math.round(sob.total)) }]}
              nota={sob.total ? undefined : 'Nenhum provento neste mês.'} />
          )}
        </>
      ) : (
        <div className="min-h-0 flex-1 overflow-auto [scrollbar-gutter:stable]">
          <table className="w-full border-separate border-spacing-0 text-[12.5px] tabular-nums">
            <thead><tr>
              <th className="sticky left-0 top-0 z-10 border-b border-gray-200 bg-hx-f9fafb px-3 py-2 text-left text-[10.5px] font-semibold uppercase tracking-wide text-gray-500">Ativo</th>
              {meses.map((m) => <th key={m.competencia} className="sticky top-0 border-b border-gray-200 bg-hx-f9fafb px-2 py-2 text-right text-[10.5px] font-semibold uppercase tracking-wide text-gray-500">{competenciaCurta(m.competencia)}</th>)}
              <th className="sticky top-0 border-b border-gray-200 bg-hx-f9fafb px-3 py-2 text-right text-[10.5px] font-semibold uppercase tracking-wide text-gray-500">Total</th>
            </tr></thead>
            <tbody>
              {tickers.map((t) => (
                <tr key={t} className="hover:bg-[var(--gm-realce)]">
                  <td className="sticky left-0 border-b border-gray-100 bg-white px-3 py-2 font-semibold text-gray-900"><span className="mr-2 inline-block h-2 w-2 rounded-[2px]" style={{ background: cor[t] }} />{t}</td>
                  {meses.map((m) => <td key={m.competencia} className={`border-b border-gray-100 px-2 py-2 text-right ${m.aReceber[t] ? 'font-semibold text-amber-700' : m.porAtivo[t] ? 'text-gray-700' : 'text-gray-300'}`}>{m.porAtivo[t] ? formatBRL(Math.round(m.porAtivo[t])).replace('R$ ', '') : '—'}</td>)}
                  <td className="border-b border-gray-100 px-3 py-2 text-right font-semibold text-gray-900">{formatBRL(Math.round(meses.reduce((s, m) => s + (m.porAtivo[t] ?? 0), 0)))}</td>
                </tr>
              ))}
              <tr className="font-semibold">
                <td className="sticky left-0 border-t border-gray-200 bg-hx-f9fafb px-3 py-2 text-gray-800">Total</td>
                {meses.map((m) => <td key={m.competencia} className="border-t border-gray-200 bg-hx-f9fafb px-2 py-2 text-right text-gray-800">{m.total ? formatBRL(Math.round(m.total)).replace('R$ ', '') : '—'}</td>)}
                <td className="border-t border-gray-200 bg-hx-f9fafb px-3 py-2 text-right text-gray-900">{formatBRL(Math.round(meses.reduce((s, m) => s + m.total, 0)))}</td>
              </tr>
            </tbody>
          </table>
          <p className="mt-2 text-[11.5px] text-gray-400">Em âmbar, o anunciado e ainda não pago.</p>
        </div>
      )}
    </section>
  );
}
