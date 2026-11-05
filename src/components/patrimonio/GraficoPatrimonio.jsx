import { useState } from 'react';
import AbasPilula from '../AbasPilula.jsx';
import BalaoGrafico, { useBalao } from '../graficos/BalaoGrafico.jsx';
import LegendaSeries, { useDestaqueSeries } from '../graficos/LegendaSeries.jsx';
import { COR_ENTRADAS } from '../graficos/Graficos.jsx';
import { COR_FALTOU, GradeEsq, ReguaMeses, formatoRotulo, posRotulo } from '../graficos/GraficosVisao.jsx';
import { CLASSE_GUIA, COR_ROTULO } from '../../lib/coresGrafico.js';
import { escalaLinear } from '../../lib/escala.js';
import { varCor } from '../../lib/varCor.js';
import { formatBRL } from '../../lib/dinheiro.js';
import { competenciaAtual, nomeCompetencia } from '../../lib/format.js';

// O GRÁFICO DO PATRIMÔNIO (05/11/2026, o "comum às três" do mockup "Patrimônio · a tabela"): o card do "Entradas ×
// gastos" da Visão geral — `p-5`, título de 13px com o período em cinza, as formas à direita, o eixo à ESQUERDA
// (`GradeEsq`), o número em cada coluna, e no hover a guia tracejada, os outros meses a 40% e o balão; a legenda
// EMBAIXO é controle (passar acende a série, clicar fixa).
//   · COLUNAS: quanto do patrimônio é dinheiro aportado (embaixo) e quanto é rendimento acumulado (em cima);
//   · % DO MÊS × CDI: o rendimento de cada mês e, tracejado, o CDI do mesmo mês (só os meses fechados: o do mês
//     corrente vem parcial do Banco Central).
export const COR_APORTADO = varCor('#94a3b8', 'fundo');
export const COR_CDI = varCor('#6b7280', 'texto');
const LARG_VAGA = 46;
const pctTexto = (f, casas = 2) => (f === null || f === undefined ? '—' : `${(f * 100).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas })}%`);
export const cdiFechado = (cdi, comp) => (cdi && comp < competenciaAtual() ? cdi[comp] : undefined);
const frac = (x) => `${x * 100}%`;

function Vagas({ meses, balao, children, extra = '' }) {
  return (
    <div className={`absolute inset-0 flex gap-1.5 ${extra}`}>
      {meses.map((m, i) => (
        <div key={m.competencia} className="h-full min-w-0 flex-1 transition-opacity duration-100" style={{ opacity: balao.esmaecido(i) ? 0.4 : 1 }}>
          <div className="relative mx-auto h-full w-full" style={{ maxWidth: LARG_VAGA }}>{children(m, i)}</div>
        </div>
      ))}
    </div>
  );
}
function Alvos({ meses, balao, rotulo }) {
  return (
    <div className="absolute inset-0 flex gap-1.5" onMouseLeave={balao.aoSair}>
      {meses.map((m, i) => (
        <button key={m.competencia} type="button" onMouseMove={balao.aoMover(i)} aria-label={rotulo(m)} className="h-full min-w-0 flex-1 cursor-default" />
      ))}
    </div>
  );
}
const numero = (bottom, texto, apagado) => (
  <span className="pointer-events-none absolute inset-x-[-8px] hidden text-center text-[9px] font-semibold tabular-nums transition-opacity duration-150 sm:block"
    style={{ bottom, color: COR_ROTULO, opacity: apagado ? 0.3 : 1 }}>{texto}</span>
);

function ColunasAportado({ meses, ctrl, comMovimentos }) {
  const balao = useBalao(250, 130);
  const esc = escalaLinear(Math.max(1, ...meses.map((m) => m.total)) / 100);
  const fr = (c) => esc.fracao(Math.max(0, c) / 100);
  const rot = formatoRotulo(esc.marcas[esc.marcas.length - 1]);
  const i = balao.ativo;
  const a = i !== null ? meses[i] : null;
  return (
    <div>
      <div className="h-[230px] pt-4">
        <GradeEsq esc={esc}>
          <Vagas meses={meses} balao={balao}>
            {(m) => {
              const ap = comMovimentos ? Math.max(0, Math.min(m.total, m.aportado)) : m.total;
              return (
                <>
                  <div className="absolute inset-x-0 bottom-0 transition-opacity duration-150" style={{ height: frac(fr(ap)), background: COR_APORTADO, opacity: ctrl.opSerie('aportado') }} />
                  <div className="absolute inset-x-0 rounded-t-[2px] transition-opacity duration-150"
                    style={{ bottom: frac(fr(ap)), height: frac(fr(m.total) - fr(ap)), background: COR_ENTRADAS, opacity: ctrl.opSerie('rendimento') }} />
                </>
              );
            }}
          </Vagas>
          <Vagas meses={meses} balao={balao} extra="pointer-events-none">
            {(m) => m.total > 0 && numero(posRotulo(fr(m.total)), rot(m.total))}
          </Vagas>
          {a && <div className={CLASSE_GUIA} style={{ left: `${((i + 0.5) / meses.length) * 100}%` }} />}
          <Alvos meses={meses} balao={balao} rotulo={(m) => `${nomeCompetencia(m.competencia)}: ${formatBRL(m.total)}`} />
        </GradeEsq>
      </div>
      <ReguaMeses meses={meses} />
      {a && (
        <BalaoGrafico pos={balao.pos} largura={250} titulo={nomeCompetencia(a.competencia)} itens={[
          { rotulo: 'Patrimônio', valor: formatBRL(a.total) },
          ...(comMovimentos ? [
            { rotulo: 'Dinheiro aportado', valor: formatBRL(a.aportado), cor: COR_APORTADO },
            { rotulo: 'Rendimento acumulado', valor: formatBRL(a.rendimentoAcum), cor: COR_ENTRADAS },
          ] : []),
        ]} nota={comMovimentos ? (a.rendeu !== null ? `Rendeu ${formatBRL(a.rendeu)} no mês (${pctTexto(a.pct)})` : 'Sem duas fotos para comparar neste mês.') : 'O valor no fim do mês.'} />
      )}
    </div>
  );
}

function ColunasPct({ meses, cdi, ctrl }) {
  const balao = useBalao(250, 140);
  // em pontos-base (0,87% = 87): a escala do app é de números inteiros
  const bp = (f) => Math.round((f ?? 0) * 10000);
  const esc = escalaLinear(Math.max(1, ...meses.map((m) => Math.max(bp(m.pct), bp(cdiFechado(cdi, m.competencia))))));
  const fr = (f) => esc.fracao(Math.max(0, bp(f)));
  const i = balao.ativo;
  const a = i !== null ? meses[i] : null;
  const cA = a ? cdiFechado(cdi, a.competencia) : undefined;
  return (
    <div>
      <div className="h-[230px] pt-4">
        <GradeEsq esc={esc} rotulo={(v) => `${(v / 100).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`}>
          <Vagas meses={meses} balao={balao}>
            {(m) => {
              const c = cdiFechado(cdi, m.competencia);
              const neg = m.rendeu !== null && m.rendeu < 0;
              return (
                <>
                  {m.pct !== null && (
                    <div className="absolute rounded-t-[2px] transition-opacity duration-150"
                      style={{ left: '12%', right: '12%', bottom: 0, height: neg ? '3px' : frac(fr(m.pct)), background: neg ? COR_FALTOU : COR_ENTRADAS, opacity: ctrl.opSerie('rendeu') }} />
                  )}
                  {c !== undefined && m.pct !== null && (
                    <span className="pointer-events-none absolute inset-x-[-2px] border-t-2 border-dashed transition-opacity duration-150"
                      style={{ bottom: frac(fr(c)), borderColor: COR_CDI, opacity: ctrl.opSerie('cdi') }} />
                  )}
                  {m.pct === null && <span className="pointer-events-none absolute inset-x-[-12px] bottom-1 hidden text-center text-[9.5px] text-gray-300 sm:block">—</span>}
                </>
              );
            }}
          </Vagas>
          <Vagas meses={meses} balao={balao} extra="pointer-events-none">
            {(m) => m.pct !== null && numero(posRotulo(fr(m.pct)), (m.pct * 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }), ctrl.opSerie('rendeu') < 1)}
          </Vagas>
          {a && <div className={CLASSE_GUIA} style={{ left: `${((i + 0.5) / meses.length) * 100}%` }} />}
          <Alvos meses={meses} balao={balao} rotulo={(m) => `${nomeCompetencia(m.competencia)}: ${pctTexto(m.pct)}`} />
        </GradeEsq>
      </div>
      <ReguaMeses meses={meses} />
      {a && (
        <BalaoGrafico pos={balao.pos} largura={250} titulo={nomeCompetencia(a.competencia)} itens={a.rendeu === null ? [] : [
          { rotulo: 'Rendeu', valor: `${formatBRL(a.rendeu)} · ${pctTexto(a.pct)}`, cor: COR_ENTRADAS },
          ...(cA !== undefined ? [{ rotulo: 'CDI do mês', valor: pctTexto(cA), cor: COR_CDI }] : []),
          { rotulo: 'Aportes − resgates', valor: formatBRL(a.aportes - a.resgates) },
        ]} nota={a.rendeu === null ? 'Sem duas fotos para comparar neste mês.'
          : cA ? `${Math.round((a.pct / cA) * 100)}% do CDI` : a.competencia >= competenciaAtual() ? 'O CDI do mês em andamento ainda não fechou.' : undefined} />
      )}
    </div>
  );
}

// `meses`: os do `rendimentoDasSeries` (os últimos 12). `cdi`: { 'AAAA-MM': fração } ou null.
export default function GraficoPatrimonio({ meses, cdi, comMovimentos }) {
  const [forma, setForma] = useState('colunas');
  const ctrlCol = useDestaqueSeries();
  const ctrlPct = useDestaqueSeries();
  const pct = comMovimentos && forma === 'pct';
  const periodo = meses.length > 1 ? `${nomeCompetencia(meses[0].competencia).toLowerCase()} a ${nomeCompetencia(meses[meses.length - 1].competencia).toLowerCase()}` : 'fim de cada mês';
  return (
    <section className="card flex flex-col overflow-hidden p-5">
      <div className="mb-3 flex flex-wrap items-baseline gap-3">
        <span className="text-[13px] font-semibold text-gray-800">{!comMovimentos ? 'Evolução do patrimônio' : pct ? 'Rendimento de cada mês' : 'Quanto é seu e quanto rendeu'}</span>
        <span className="text-[11px] text-gray-400">{pct ? 'o % do mês e o CDI' : `fim de cada mês · ${periodo}`}</span>
        {comMovimentos && (
          <div className="ml-auto flex shrink-0 items-center self-center">
            <AbasPilula abas={[{ key: 'colunas', label: 'Colunas' }, { key: 'pct', label: '% do mês × CDI' }]} valor={forma} onChange={setForma}
              variante="claro" altura={30} folga={2} />
          </div>
        )}
      </div>
      {pct ? <ColunasPct meses={meses} cdi={cdi} ctrl={ctrlPct} /> : <ColunasAportado meses={meses} ctrl={ctrlCol} comMovimentos={comMovimentos} />}
      {comMovimentos && (pct ? (
        <LegendaSeries ctrl={ctrlPct} series={[
          { key: 'rendeu', rotulo: 'Rendeu no mês (%)', cor: COR_ENTRADAS },
          ...(cdi ? [{ key: 'cdi', rotulo: 'CDI do mês (Banco Central)', cor: COR_CDI, forma: 'tracejado' }] : []),
        ]} />
      ) : (
        <LegendaSeries ctrl={ctrlCol} series={[
          { key: 'aportado', rotulo: 'Dinheiro aportado', cor: COR_APORTADO },
          { key: 'rendimento', rotulo: 'Rendimento acumulado', cor: COR_ENTRADAS },
        ]} />
      ))}
    </section>
  );
}
