import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import BalaoGrafico, { useBalao } from '../graficos/BalaoGrafico.jsx';
import { COR_ENTRADAS } from '../graficos/Graficos.jsx';
import { CALHA_ESQ, COR_FALTOU, GradeEsq, ReguaMeses, formatoRotulo, posRotulo } from '../graficos/GraficosVisao.jsx';
import { CLASSE_GUIA, COR_ROTULO } from '../../lib/coresGrafico.js';
import { escalaLinear } from '../../lib/escala.js';
import { varCor } from '../../lib/varCor.js';
import { formatBRL } from '../../lib/dinheiro.js';
import { competenciaAtual, competenciaCurta, nomeCompetencia } from '../../lib/format.js';
import { cascataDoPatrimonio } from '../../lib/patrimonio.js';

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

// ------------------------------------------------------------ a evolução em cascata
// A EVOLUÇÃO EM CASCATA (09/11/2026, a opção B do mockup "Evolução do patrimônio em cascata", com a C na chave "Ano"):
// cada coluna é um DEGRAU que começa onde o anterior terminou — o aporte sobe em azul, o rendimento em verde, a saída desce
// em laranja (o rendimento negativo, em vermelho) — e a última é o patrimônio do fim do período, o aportado em cinza e o
// rendimento acumulado em verde. As contas são de `cascataDoPatrimonio` (lib/patrimonio.js):
//   · `modo` 'mes': só os meses com aporte ou saída, e os meses parados entre eles num degrau só ("9 meses / rendendo"),
//     as mesmas colunas do "Entrou e saiu"; 'ano': aportes, rendeu e saiu de cada ano;
//   · o fio tracejado liga o fim de um degrau ao começo do seguinte (meia vaga de cada lado, por cima do vão);
//   · a régua no mesmo arranjo das colunas, e a vaga MEDIDA encurta os rótulos no bloco estreito (como no "Entrou e saiu").
// `ctrl`: a legenda (séries 'entrou', 'rendeu', 'saiu', 'aportado').
const COR_APORTE = 'var(--serie-gastos)';
const COR_SAIDA = 'var(--origem-fixo)';
const PESO_PARADO = 0.8;
const VAO = 6;
const MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const ROTULO_ANO = { aportes: 'aportes', rendeu: 'rendeu', saiu: 'saiu' };

export function CascataPatrimonio({ meses, modo = 'mes', ctrl, auto = false }) {
  const balao = useBalao(260, 150);
  const cas = useMemo(() => cascataDoPatrimonio(meses, modo), [meses, modo]);
  const reguaRef = useRef(null);
  const [larg, setLarg] = useState(0);
  const tem = !!cas;
  useLayoutEffect(() => {
    const el = reguaRef.current;
    if (!el) return undefined;
    setLarg(el.clientWidth - CALHA_ESQ);
    const ro = new ResizeObserver(() => setLarg(el.clientWidth - CALHA_ESQ));
    ro.observe(el);
    return () => ro.disconnect();
  }, [tem]);
  if (!cas) return null;

  const hoje = competenciaAtual();
  const vagas = [...cas.colunas, { tipo: 'fim', id: 'fim', de: cas.fim.total, ate: cas.fim.total }];
  const peso = (v) => ({ flexGrow: v.tipo === 'parado' ? PESO_PARADO : 1, flexBasis: 0 });
  const pesos = vagas.reduce((s, v) => s + peso(v).flexGrow, 0);
  const u = larg > 0 ? (larg - VAO * (vagas.length - 1)) / pesos : Infinity;
  const curto = u < 34;
  const comNumero = u >= 24;
  const inicial = u < 19;
  // o alto de cada coluna: o maior ponto do degrau (o mês sobe o aporte e o rendimento antes de descer a saída)
  const alto = (v) => (v.tipo === 'mes' ? Math.max(v.de, v.de + v.entrou + Math.max(0, v.rendeu), v.ate) : Math.max(v.de, v.ate));
  const esc = escalaLinear(Math.max(1, ...vagas.map(alto)) / 100);
  const fr = (c) => esc.fracao(Math.max(0, c) / 100);
  const rot = formatoRotulo(esc.marcas[esc.marcas.length - 1]);
  const ativo = balao.ativo;
  const sob = ativo !== null ? vagas.find((v) => v.id === ativo) : null;

  // um pedaço do degrau, de um nível a outro (o menor visível tem 2px)
  const pedaco = (de, ate, cor, serie, k) => {
    const lo = Math.min(de, ate); const hi = Math.max(de, ate);
    return (
      <div key={k} className="absolute left-[19%] right-[19%] rounded-[1.5px] transition-opacity duration-150"
        style={{ bottom: frac(fr(lo)), height: `max(2px, ${frac(fr(hi) - fr(lo))})`, background: cor, opacity: ctrl.opSerie(serie) }} />
    );
  };
  const degrau = (v) => {
    if (v.tipo === 'inicio') return pedaco(0, v.ate, COR_APORTADO, 'aportado', 'i');
    if (v.tipo === 'fim') {
      const ap = Math.max(0, Math.min(cas.fim.total, cas.fim.aportado));
      return [pedaco(0, ap, COR_APORTADO, 'aportado', 'a'), cas.fim.total > ap && pedaco(ap, cas.fim.total, COR_ENTRADAS, 'rendeu', 'r')];
    }
    if (v.tipo === 'parado') return pedaco(v.de, v.ate, v.rendeu < 0 ? COR_FALTOU : COR_ENTRADAS, 'rendeu', 'r');
    if (v.tipo === 'aportes') return pedaco(v.de, v.ate, COR_APORTE, 'entrou', 'e');
    if (v.tipo === 'rendeu') return pedaco(v.de, v.ate, v.valor < 0 ? COR_FALTOU : COR_ENTRADAS, 'rendeu', 'r');
    if (v.tipo === 'saiu') return pedaco(v.de, v.ate, COR_SAIDA, 'saiu', 's');
    // o mês: sobe o aporte, sobe o rendimento, desce a saída e o rendimento negativo
    const out = [];
    let n = v.de;
    if (v.entrou > 0) { out.push(pedaco(n, n + v.entrou, COR_APORTE, 'entrou', 'e')); n += v.entrou; }
    if (v.rendeu > 0) { out.push(pedaco(n, n + v.rendeu, COR_ENTRADAS, 'rendeu', 'r')); n += v.rendeu; }
    if (v.saiu > 0) { out.push(pedaco(n, n - v.saiu, COR_SAIDA, 'saiu', 's')); n -= v.saiu; }
    if (v.rendeu < 0) out.push(pedaco(n, n + v.rendeu, COR_FALTOU, 'rendeu', 'n'));
    return out;
  };
  // o número em cima do degrau: o que fez ele mudar
  const texto = (v) => {
    if (v.tipo === 'fim' || v.tipo === 'inicio') return { t: rot(v.ate), forte: true };
    if (v.tipo === 'parado') return { t: `${v.rendeu < 0 ? '−' : '+'}${rot(Math.abs(v.rendeu))}`, cor: v.rendeu < 0 ? COR_FALTOU : COR_ENTRADAS };
    if (v.tipo === 'aportes') return { t: `+${rot(v.valor)}` };
    if (v.tipo === 'rendeu') return { t: `${v.valor < 0 ? '−' : '+'}${rot(Math.abs(v.valor))}`, cor: v.valor < 0 ? COR_FALTOU : COR_ENTRADAS };
    if (v.tipo === 'saiu') return { t: `−${rot(v.valor)}`, cor: COR_SAIDA };
    return v.entrou > 0 ? { t: `+${rot(v.entrou)}` } : { t: `−${rot(v.saiu)}`, cor: COR_SAIDA };
  };
  const fimNome = cas.fim.competencia === hoje ? 'hoje' : competenciaCurta(cas.fim.competencia);
  const mesCurto = (c) => { const n = MESES_CURTOS[Number(c.slice(5, 7)) - 1]; return inicial ? n[0] : n; };
  const anoTexto = (a) => (curto ? `’${a.slice(2)}` : a);

  const balaoDe = (v) => {
    if (v.tipo === 'fim') {
      return { titulo: cas.fim.competencia === hoje ? 'Hoje' : nomeCompetencia(cas.fim.competencia), itens: [
        { rotulo: 'Patrimônio', valor: formatBRL(cas.fim.total) },
        { rotulo: 'Dinheiro aportado', valor: formatBRL(cas.fim.aportado), cor: COR_APORTADO },
        { rotulo: 'Rendimento acumulado', valor: formatBRL(cas.fim.rendimento), cor: COR_ENTRADAS },
      ] };
    }
    if (v.tipo === 'inicio') return { titulo: 'Antes do período', itens: [{ rotulo: `Patrimônio antes de ${competenciaCurta(v.antesDe)}`, valor: formatBRL(v.ate), cor: COR_APORTADO }] };
    if (v.tipo === 'parado') {
      return { titulo: `${competenciaCurta(v.desde)}${v.n > 1 ? ` a ${competenciaCurta(v.ateMes)}` : ''} · sem aporte`, itens: [
        { rotulo: v.n > 1 ? `Rendeu nos ${v.n} meses` : 'Rendeu no mês', valor: formatBRL(v.rendeu), cor: v.rendeu < 0 ? COR_FALTOU : COR_ENTRADAS },
        { rotulo: 'Patrimônio no fim', valor: formatBRL(v.ate) },
      ] };
    }
    if (v.tipo === 'mes') {
      return { titulo: `${nomeCompetencia(v.m.competencia)}${v.m.competencia === hoje ? ' · até hoje' : ''}`, itens: [
        { rotulo: 'Patrimônio no fim do mês', valor: formatBRL(v.ate) },
        ...(v.entrou ? [{ rotulo: 'Entrou', valor: formatBRL(v.entrou), cor: COR_APORTE }] : []),
        { rotulo: 'Rendeu', valor: formatBRL(v.rendeu), cor: v.rendeu < 0 ? COR_FALTOU : COR_ENTRADAS },
        ...(v.saiu ? [{ rotulo: 'Saiu', valor: formatBRL(v.saiu), cor: COR_SAIDA }] : []),
      ] };
    }
    const nome = { aportes: 'Entrou', rendeu: 'Rendeu', saiu: 'Saiu' }[v.tipo];
    const cor = { aportes: COR_APORTE, rendeu: COR_ENTRADAS, saiu: COR_SAIDA }[v.tipo];
    return { titulo: `${nome} em ${v.anoDe}${v.meses < 12 ? ` (${v.meses} ${v.meses === 1 ? 'mês' : 'meses'})` : ''}`, itens: [
      { rotulo: nome, valor: formatBRL(v.valor), cor },
      { rotulo: `Patrimônio no fim de ${v.anoDe}`, valor: formatBRL(v.fimDoAno) },
    ] };
  };
  const b = sob ? balaoDe(sob) : null;

  return (
    <div className={auto ? 'flex h-full min-h-0 flex-col' : ''}>
      <div className={auto ? 'min-h-0 flex-1 pt-4' : 'h-[230px] pt-4'}>
        <GradeEsq esc={esc}>
          <div className="pointer-events-none absolute inset-0 flex gap-1.5">
            {vagas.map((v, k) => {
              const tx = texto(v);
              return (
                <div key={v.id} className="relative h-full min-w-0 transition-opacity duration-100" style={{ ...peso(v), opacity: balao.esmaecido(v.id) ? 0.4 : 1 }}>
                  {/* o fio que liga os degraus: do vão até o começo deste, e do fim deste até o próximo */}
                  {k > 0 && <span className="absolute left-[-6px] right-[81%] border-t border-dashed border-gray-400" style={{ bottom: frac(fr(v.de)) }} />}
                  {k < vagas.length - 1 && <span className="absolute left-[81%] right-0 border-t border-dashed border-gray-400" style={{ bottom: frac(fr(v.ate)) }} />}
                  {degrau(v)}
                  <span className={`absolute inset-x-[-8px] hidden text-center tabular-nums ${comNumero ? 'sm:block' : ''} ${tx.forte ? 'text-[10.5px] font-bold' : 'text-[9px] font-semibold'}`}
                    style={{ bottom: posRotulo(fr(alto(v))), color: tx.cor ?? COR_ROTULO }}>{tx.t}</span>
                  {ativo === v.id && <div className={`${CLASSE_GUIA} left-1/2`} />}
                </div>
              );
            })}
          </div>
          <div className="absolute inset-0 flex gap-1.5" onMouseLeave={balao.aoSair}>
            {vagas.map((v) => (
              <button key={v.id} type="button" onMouseMove={balao.aoMover(v.id)} style={peso(v)} aria-label={`${balaoDe(v).titulo}: ${formatBRL(v.ate)}`}
                className="h-full min-w-0 cursor-default" />
            ))}
          </div>
        </GradeEsq>
      </div>
      {/* a régua: o mesmo arranjo das colunas */}
      <div ref={reguaRef} className="flex gap-1.5 pt-1" style={{ paddingLeft: CALHA_ESQ }}>
        {vagas.map((v) => {
          const ativa = ativo === v.id ? 'font-semibold text-gray-800' : 'text-gray-500';
          let cima; let baixo = null; let italico = false;
          if (v.tipo === 'fim') cima = <span className="font-bold text-gray-800">{fimNome}</span>;
          else if (v.tipo === 'inicio') cima = 'antes';
          else if (v.tipo === 'parado') { italico = true; cima = curto ? `${v.n}m` : `${v.n} ${v.n === 1 ? 'mês' : 'meses'}`; if (!curto) baixo = 'rendendo'; }
          else if (v.tipo === 'mes') cima = mesCurto(v.m.competencia);
          else cima = curto ? ROTULO_ANO[v.tipo][0] : ROTULO_ANO[v.tipo];
          if (v.ano && v.tipo !== 'parado') baixo = <span className="font-semibold text-gray-600 not-italic">{anoTexto(v.anoDe)}</span>;
          return (
            <span key={v.id} className={`flex min-w-0 flex-col items-center whitespace-nowrap text-[10px] leading-[13px] ${italico ? 'text-[9.5px] italic text-gray-400' : ativa}`} style={peso(v)}
              title={v.tipo === 'parado' ? `${v.n} ${v.n === 1 ? 'mês' : 'meses'} sem aporte, só rendendo` : undefined}>
              <span>{cima}</span>
              {baixo && <span>{baixo}</span>}
            </span>
          );
        })}
      </div>
      {b && <BalaoGrafico pos={balao.pos} largura={260} titulo={b.titulo} itens={b.itens} />}
    </div>
  );
}
