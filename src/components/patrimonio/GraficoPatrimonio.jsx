import BalaoGrafico, { useBalao } from '../graficos/BalaoGrafico.jsx';
import { COR_ENTRADAS } from '../graficos/Graficos.jsx';
import { COR_FALTOU, GradeEsq, ReguaMeses, formatoRotulo, posRotulo } from '../graficos/GraficosVisao.jsx';
import { CLASSE_GUIA, COR_ROTULO } from '../../lib/coresGrafico.js';
import { escalaLinear } from '../../lib/escala.js';
import { varCor } from '../../lib/varCor.js';
import { formatBRL } from '../../lib/dinheiro.js';
import { competenciaAtual, nomeCompetencia } from '../../lib/format.js';

// OS GRÁFICOS DE MESES DO PATRIMÔNIO, no chrome do "Entradas × gastos" da Visão geral: o eixo à ESQUERDA (`GradeEsq`), o
// número em cada coluna, e no hover a guia tracejada, os outros meses a 40% e o balão; a legenda embaixo (no bloco) é
// controle (`ctrl`, o `useDestaqueSeries`: passar acende a série, clicar fixa).
//   · `ColunasAportado`: quanto do patrimônio é dinheiro aportado (embaixo) e quanto é rendimento acumulado (em cima);
//   · `ColunasRendeu` (09/11/2026, a tela nova): quanto rendeu em REAIS em cada mês e, tracejado, o que o CDI (ou o
//     IPCA) daria no mesmo dinheiro — o capital do mês (`base`, de `mesAMes`) vezes o índice do mês;
//   · `ColunasPct`: o rendimento de cada mês em % e, tracejado, o índice do mesmo mês (só os meses fechados).
// `auto`: o gráfico ocupa a altura de quem o contém (o bloco do grid); sem ele, 230px.
export const COR_APORTADO = varCor('#94a3b8', 'fundo');
export const COR_CDI = varCor('#6b7280', 'texto');
const LARG_VAGA = 46;
const pctTexto = (f, casas = 2) => (f === null || f === undefined ? '—' : `${(f * 100).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas })}%`);
export const cdiFechado = (cdi, comp) => (cdi && comp < competenciaAtual() ? cdi[comp] : undefined);
const frac = (x) => `${x * 100}%`;
// o mês em andamento (só parte do rendimento) vai hachurado
const HACHURA_RENDEU = 'repeating-linear-gradient(135deg, color-mix(in srgb, var(--serie-entradas) 55%, transparent) 0 3px, transparent 3px 6px)';

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
function Alvos({ meses, balao, rotulo, onMes }) {
  return (
    <div className="absolute inset-0 flex gap-1.5" onMouseLeave={balao.aoSair}>
      {meses.map((m, i) => (
        <button key={m.competencia} type="button" onMouseMove={balao.aoMover(i)} onClick={onMes ? () => onMes(m.competencia) : undefined} aria-label={rotulo(m)}
          className={`h-full min-w-0 flex-1 ${onMes ? 'cursor-pointer' : 'cursor-default'}`} />
      ))}
    </div>
  );
}
const numero = (bottom, texto, apagado) => (
  <span className="pointer-events-none absolute inset-x-[-8px] hidden text-center text-[9px] font-semibold tabular-nums transition-opacity duration-150 sm:block"
    style={{ bottom, color: COR_ROTULO, opacity: apagado ? 0.3 : 1 }}>{texto}</span>
);
// a caixa do gráfico: a altura fixa, ou a do bloco (`auto`)
function Caixa({ auto, children, regua }) {
  return (
    <div className={auto ? 'flex h-full min-h-0 flex-col' : ''}>
      <div className={auto ? 'min-h-0 flex-1 pt-4' : 'h-[230px] pt-4'}>{children}</div>
      {regua}
    </div>
  );
}

export function ColunasAportado({ meses, ctrl, comMovimentos = true, auto = false, onMes }) {
  const balao = useBalao(250, 150);
  // SÓ UMA SÉRIE FIXADA, NA ESCALA DELA (como os gastos por origem da Visão geral): o rendimento sozinho some perto do
  // aportado; fixado, ele ganha o eixo inteiro.
  const so = ctrl.fixas.length === 1 ? ctrl.fixas[0] : null;
  const alto = (m) => (so === 'rendimento' ? Math.max(0, m.rendimentoAcum) : so === 'aportado' ? m.aportado : m.total);
  const esc = escalaLinear(Math.max(1, ...meses.map(alto)) / 100);
  const fr = (c) => esc.fracao(Math.max(0, c) / 100);
  const rot = formatoRotulo(esc.marcas[esc.marcas.length - 1]);
  const i = balao.ativo;
  const a = i !== null ? meses[i] : null;
  return (
    <Caixa auto={auto} regua={<ReguaMeses meses={meses} ativo={i} />}>
      <GradeEsq esc={esc}>
        <Vagas meses={meses} balao={balao}>
          {(m) => {
            const ap = so === 'rendimento' ? 0 : comMovimentos ? Math.max(0, Math.min(m.total, m.aportado)) : m.total;
            const topo = so === 'aportado' ? ap : so === 'rendimento' ? Math.max(0, m.rendimentoAcum) : m.total;
            return (
              <>
                {so !== 'rendimento' && <div className="absolute inset-x-0 bottom-0 transition-opacity duration-150" style={{ height: frac(fr(ap)), background: COR_APORTADO, opacity: ctrl.opSerie('aportado') }} />}
                {so !== 'aportado' && (
                  <div className="absolute inset-x-0 rounded-t-[2px] transition-opacity duration-150"
                    style={{ bottom: frac(fr(ap)), height: frac(Math.max(0, fr(topo) - fr(ap))), background: COR_ENTRADAS, opacity: ctrl.opSerie('rendimento') }} />
                )}
              </>
            );
          }}
        </Vagas>
        <Vagas meses={meses} balao={balao} extra="pointer-events-none">
          {(m) => alto(m) > 0 && numero(posRotulo(fr(alto(m))), rot(alto(m)))}
        </Vagas>
        {a && <div className={CLASSE_GUIA} style={{ left: `${((i + 0.5) / meses.length) * 100}%` }} />}
        <Alvos meses={meses} balao={balao} onMes={onMes} rotulo={(m) => `${nomeCompetencia(m.competencia)}: ${formatBRL(m.total)}`} />
      </GradeEsq>
      {a && (
        <BalaoGrafico pos={balao.pos} largura={250} titulo={`${nomeCompetencia(a.competencia)}${a.competencia === competenciaAtual() ? ' · até hoje' : ''}`} itens={[
          { rotulo: 'Patrimônio', valor: formatBRL(a.total) },
          ...(comMovimentos ? [
            { rotulo: 'Dinheiro aportado', valor: formatBRL(a.aportado), cor: COR_APORTADO },
            { rotulo: 'Rendimento acumulado', valor: formatBRL(a.rendimentoAcum), cor: COR_ENTRADAS },
            ...(a.aportes ? [{ rotulo: 'Entrou no mês', valor: formatBRL(a.aportes) }] : []),
            ...(a.resgates ? [{ rotulo: 'Saiu no mês', valor: formatBRL(a.resgates) }] : []),
          ] : []),
        ]} nota={comMovimentos ? (a.rendeu !== null ? `Rendeu ${formatBRL(a.rendeu)} no mês (${pctTexto(a.pct)})` : undefined) : 'O valor no fim do mês.'} />
      )}
    </Caixa>
  );
}

// `indice`: { 'AAAA-MM': fração } do índice (o CDI ou o IPCA de cada mês) ou null (sem comparação); `refRotulo`: 'CDI' | 'IPCA'.
export function ColunasRendeu({ meses, indice, refRotulo = 'CDI', ctrl, auto = false, onMes }) {
  const balao = useBalao(260, 160);
  const hoje = competenciaAtual();
  // o que o índice daria no mesmo dinheiro (o capital do mês × o índice); o mês corrente, só com o índice que já saiu
  const daria = (m) => (indice && indice[m.competencia] !== undefined && m.base > 0 ? Math.round(m.base * indice[m.competencia]) : null);
  const vals = meses.flatMap((m) => [Math.max(0, m.rendeu ?? 0), ...(ctrl.opSerie('ref') > 0.2 ? [daria(m) ?? 0] : [])]);
  const esc = escalaLinear(Math.max(1, ...vals) / 100);
  const fr = (c) => esc.fracao(Math.max(0, c) / 100);
  const rot = formatoRotulo(esc.marcas[esc.marcas.length - 1]);
  const i = balao.ativo;
  const a = i !== null ? meses[i] : null;
  const dA = a ? daria(a) : null;
  return (
    <Caixa auto={auto} regua={<ReguaMeses meses={meses} ativo={i} />}>
      <GradeEsq esc={esc}>
        <Vagas meses={meses} balao={balao}>
          {(m) => {
            const neg = (m.rendeu ?? 0) < 0;
            const d = daria(m);
            return (
              <>
                {m.rendeu !== null && (
                  <div className="absolute rounded-t-[2px] transition-opacity duration-150"
                    style={{ left: '12%', right: '12%', bottom: 0, height: neg ? '3px' : frac(fr(m.rendeu)), opacity: ctrl.opSerie('rendeu'),
                      ...(m.competencia === hoje && !neg ? { backgroundImage: HACHURA_RENDEU, boxShadow: `inset 0 0 0 1px ${COR_ENTRADAS}` } : { background: neg ? COR_FALTOU : COR_ENTRADAS }) }} />
                )}
                {d !== null && (
                  <span className="pointer-events-none absolute inset-x-[-2px] border-t-2 border-dashed transition-opacity duration-150"
                    style={{ bottom: frac(fr(d)), borderColor: COR_CDI, opacity: ctrl.opSerie('ref') }} />
                )}
              </>
            );
          }}
        </Vagas>
        <Vagas meses={meses} balao={balao} extra="pointer-events-none">
          {(m) => (m.rendeu ?? 0) > 0 && numero(posRotulo(fr(m.rendeu)), rot(m.rendeu), ctrl.opSerie('rendeu') < 1)}
        </Vagas>
        {a && <div className={CLASSE_GUIA} style={{ left: `${((i + 0.5) / meses.length) * 100}%` }} />}
        <Alvos meses={meses} balao={balao} onMes={onMes} rotulo={(m) => `${nomeCompetencia(m.competencia)}: rendeu ${formatBRL(m.rendeu ?? 0)}`} />
      </GradeEsq>
      {a && (
        <BalaoGrafico pos={balao.pos} largura={260} titulo={`${nomeCompetencia(a.competencia)}${a.competencia === hoje ? ' · em andamento' : ''}`} itens={a.rendeu === null ? [] : [
          { rotulo: 'Rendeu', valor: formatBRL(a.rendeu), cor: COR_ENTRADAS },
          { rotulo: 'No mês', valor: pctTexto(a.pct) },
          ...(indice && indice[a.competencia] !== undefined ? [{ rotulo: `${refRotulo} do mês`, valor: `${pctTexto(indice[a.competencia])} · daria ${formatBRL(dA ?? 0)}`, cor: COR_CDI }] : []),
        ]} nota={indice && indice[a.competencia] !== undefined && a.pct !== null ? `${Math.round((a.pct / indice[a.competencia]) * 100)}% do ${refRotulo}`
          : indice ? `O ${refRotulo} do mês ainda não saiu.` : undefined} />
      )}
    </Caixa>
  );
}

// `indice`/`refRotulo` como no `ColunasRendeu` (o padrão: o CDI de `cdi`, só os meses fechados).
export function ColunasPct({ meses, cdi, indice, refRotulo = 'CDI', ctrl, auto = false, onMes }) {
  const balao = useBalao(250, 140);
  const refDe = (comp) => (indice !== undefined ? (indice && comp < competenciaAtual() ? indice[comp] : undefined) : cdiFechado(cdi, comp));
  // em pontos-base (0,87% = 87): a escala do app é de números inteiros
  const bp = (f) => Math.round((f ?? 0) * 10000);
  const esc = escalaLinear(Math.max(1, ...meses.map((m) => Math.max(bp(m.pct), bp(refDe(m.competencia))))));
  const fr = (f) => esc.fracao(Math.max(0, bp(f)));
  const i = balao.ativo;
  const a = i !== null ? meses[i] : null;
  const cA = a ? refDe(a.competencia) : undefined;
  return (
    <Caixa auto={auto} regua={<ReguaMeses meses={meses} ativo={i} />}>
      <GradeEsq esc={esc} rotulo={(v) => `${(v / 100).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`}>
        <Vagas meses={meses} balao={balao}>
          {(m) => {
            const c = refDe(m.competencia);
            const neg = m.rendeu !== null && m.rendeu < 0;
            return (
              <>
                {m.pct !== null && (
                  <div className="absolute rounded-t-[2px] transition-opacity duration-150"
                    style={{ left: '12%', right: '12%', bottom: 0, height: neg ? '3px' : frac(fr(m.pct)), background: neg ? COR_FALTOU : COR_ENTRADAS, opacity: ctrl.opSerie('rendeu') }} />
                )}
                {c !== undefined && m.pct !== null && (
                  <span className="pointer-events-none absolute inset-x-[-2px] border-t-2 border-dashed transition-opacity duration-150"
                    style={{ bottom: frac(fr(c)), borderColor: COR_CDI, opacity: ctrl.opSerie('ref') }} />
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
        <Alvos meses={meses} balao={balao} onMes={onMes} rotulo={(m) => `${nomeCompetencia(m.competencia)}: ${pctTexto(m.pct)}`} />
      </GradeEsq>
      {a && (
        <BalaoGrafico pos={balao.pos} largura={250} titulo={nomeCompetencia(a.competencia)} itens={a.rendeu === null ? [] : [
          { rotulo: 'Rendeu', valor: `${formatBRL(a.rendeu)} · ${pctTexto(a.pct)}`, cor: COR_ENTRADAS },
          ...(cA !== undefined ? [{ rotulo: `${refRotulo} do mês`, valor: pctTexto(cA), cor: COR_CDI }] : []),
          { rotulo: 'Aportes − resgates', valor: formatBRL(a.aportes - a.resgates) },
        ]} nota={a.rendeu === null ? undefined
          : cA ? `${Math.round((a.pct / cA) * 100)}% do ${refRotulo}` : a.competencia >= competenciaAtual() ? `O ${refRotulo} do mês em andamento ainda não fechou.` : undefined} />
      )}
    </Caixa>
  );
}
