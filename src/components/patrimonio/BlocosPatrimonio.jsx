import { useMemo, useState } from 'react';
import AbasPilula from '../AbasPilula.jsx';
import { Etiqueta } from '../Comuns.jsx';
import BalaoGrafico, { useBalao } from '../graficos/BalaoGrafico.jsx';
import { GradeEsq, ReguaMeses, formatoRotulo, posRotulo } from '../graficos/GraficosVisao.jsx';
import LegendaSeries, { useDestaqueSeries } from '../graficos/LegendaSeries.jsx';
import { ESTADO, MEDIO } from '../dashboard/AvisoAgora.jsx';
import { COR_APORTADO } from './GraficoPatrimonio.jsx';
import { CLASSE_GUIA, COR_ROTULO } from '../../lib/coresGrafico.js';
import { escalaLinear } from '../../lib/escala.js';
import { varCor } from '../../lib/varCor.js';
import { brlCurto, formatBRL } from '../../lib/dinheiro.js';
import { formatDate, nomeCompetencia } from '../../lib/format.js';
import { rotuloTaxa } from '../../lib/carteira.js';
import { lsGet, lsSet } from '../../lib/storage.js';
import { useNoCelular } from '../../lib/celular.js';

// OS BLOCOS DO PATRIMÔNIO (09/11/2026, o mockup "Patrimônio · o grid de widgets"), no chrome da Visão geral: o card `p-5`,
// o título de 13px com o período em cinza, o eixo à esquerda, o número em cada coluna, o balão, a legenda que é controle.
// As contas são de `lib/patrimonio.js`; aqui só se desenha.

const COR_VOLTA = 'var(--serie-gastos)';
const COR_REAPLICA = 'var(--serie-sobrou)';
const COR_SAIU = 'var(--origem-fixo)';
const CORES_ALIQUOTA = { 0.225: varCor('#e5484d', 'fundo'), 0.2: varCor('#f59e0b', 'fundo'), 0.175: varCor('#9ca3af', 'fundo'), 0.15: varCor('#22c55e', 'fundo'), 0: varCor('#60a5fa', 'fundo') };
const aliqTexto = (a) => (a ? `${(a * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%` : 'isento');
const pctTexto = (f, casas = 0) => (f === null || f === undefined || !Number.isFinite(f) ? '—' : `${(f * 100).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas })}%`);
const dataCurta = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(2, 4)}`;
const quando = (dias) => (dias === 0 ? 'hoje' : dias === 1 ? 'amanhã' : dias <= 45 ? `em ${dias} dias` : dias < 365 ? `em ${Math.round(dias / 30.4)} meses`
  : `em ${(dias / 365).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} ${dias < 730 ? 'ano' : 'anos'}`);
const PILULA = 'inline-flex shrink-0 items-center gap-1 rounded-[4px] px-1.5 py-0.5 text-[11.5px] font-medium pilula-tom';
const LARG_VAGA = 46;
const frac = (x) => `${x * 100}%`;

// O cabeçalho de todo bloco: o título, o que ele mostra em cinza e o que fica à direita (`extra`).
export function TituloBloco({ titulo, sub, extra, children }) {
  return (
    <div className="mb-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
      <span className="text-[13px] font-semibold text-gray-800">{titulo}</span>
      {children}
      {sub && <span className="text-[11px] text-gray-400">{sub}</span>}
      {extra && <div className="ml-auto flex shrink-0 items-center gap-2 self-center">{extra}</div>}
    </div>
  );
}

// ------------------------------------------------------------ Agora
// O AVISO "AGORA" (a linha do widget Alertas, como na Visão geral): o que pede você — os vencimentos para avaliar e os
// reaplicados para conferir, em âmbar — e o que é só para saber, em cinza: o próximo vencimento e a próxima queda do IR.
export function AgoraPatrimonio({ historico, proximos, quedas, onHistorico, onProximos }) {
  const soLer = useNoCelular();
  const avaliar = historico.filter((h) => h.avaliar);
  const conferir = historico.filter((h) => h.conferir);
  const prox = proximos[0];
  const queda = quedas[0];
  const tom = avaliar.length || conferir.length ? MEDIO : null;
  const pilulas = (
    <>
      {avaliar.length > 0 && (
        <button type="button" onClick={onHistorico} className={PILULA} style={{ background: MEDIO.bg, color: MEDIO.cor }}
          title="Venceram nos últimos 30 dias: veja para onde foi o dinheiro e marque como visto.">
          {avaliar.length} {avaliar.length === 1 ? 'vencimento para avaliar' : 'vencimentos para avaliar'}
        </button>
      )}
      {conferir.length > 0 && (
        <button type="button" onClick={onHistorico} className={PILULA} style={{ background: MEDIO.bg, color: MEDIO.cor }}
          title="O app lançou o aporte novo sozinho: confira o valor com o banco no ✎ do aporte, em Investimentos.">
          {conferir.length} {conferir.length === 1 ? 'reaplicado para conferir' : 'reaplicados para conferir'}
        </button>
      )}
      {prox && (
        <button type="button" onClick={onProximos} className={PILULA} style={{ background: ESTADO.bg, color: ESTADO.cor }}
          title={`${prox.item.inv.nome}: ${prox.reaplica ? 'reaplica sozinho' : 'volta para a conta'} (${formatBRL(prox.liquido)} líquido, pela conta).`}>
          Próximo vencimento: {formatDate(prox.data).slice(0, 5)} · {prox.item.inv.nome} · {brlCurto(prox.valor)}
        </button>
      )}
      {queda && (
        <span className={`${PILULA} cursor-default`} style={{ background: ESTADO.bg, color: ESTADO.cor }}
          title={`Sobre o que já rendeu, o imposto cai ≈ ${formatBRL(queda.economia)}.`}>
          {queda.tipo === 'iof' ? `O IOF zera em ${formatDate(queda.data).slice(0, 5)} (${queda.item.inv.nome}, hoje ${aliqTexto(queda.de)})`
            : `O IR cai em ${formatDate(queda.data).slice(0, 5)} (${queda.item.inv.nome}, ${aliqTexto(queda.de)} → ${aliqTexto(queda.para)})`}
        </span>
      )}
    </>
  );
  if (soLer) return <div className="flex flex-wrap items-center gap-1.5 px-3 py-2.5">{pilulas}</div>;
  return (
    <div className="flex min-h-[58px] items-center px-5">
      <span className="shrink-0 text-[13px] font-semibold text-gray-800">Agora</span>
      <span className="mx-2.5 h-[18px] w-px shrink-0 bg-gray-200" />
      <div className="-ml-2.5 flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1 rounded-[10px] px-2.5 py-1 transition hover:bg-gray-50">
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-[7px]" style={{ background: (tom ?? ESTADO).bg, color: (tom ?? ESTADO).cor }}>
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            {tom ? <><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></> : <polyline points="20 6 9 17 4 12" />}
          </svg>
        </span>
        {!tom && <span className="text-[12px] text-gray-500">nada para avaliar —</span>}
        {pilulas}
      </div>
    </div>
  );
}

// ------------------------------------------------------------ vencimentos
// OS VENCIMENTOS: a LINHA DO TEMPO por mês (o que já venceu, o que volta para a conta e o que reaplica, com o número e a
// marca de hoje; clicar num mês filtra a lista) e a lista em duas abas — os PRÓXIMOS (o valor no dia pela conta, o IR, o
// líquido e o que acontece) e o HISTÓRICO (quanto venceu, o IR que o banco tirou e para onde foi o dinheiro; o que venceu
// nos últimos 30 dias fica "para avaliar" até o Visto). `cores`: a cor de cada instituição.
export function BlocoVencimentos({ venc, linha, aba, onAba, cores, comVisto, onVisto, onInvestimentos }) {
  const balao = useBalao(250, 120);
  const ctrl = useDestaqueSeries();
  const [mes, setMes] = useState(null);
  const [todos, setTodos] = useState(false);
  const total = (m) => m.venceu + m.volta + m.reaplica;
  const esc = escalaLinear(Math.max(1, ...linha.map(total)) / 100, 3);
  const fr = (c) => esc.fracao(Math.max(0, c) / 100);
  const rot = formatoRotulo(esc.marcas[esc.marcas.length - 1]);
  const i = balao.ativo;
  const a = i !== null ? linha[i] : null;
  const naAba = aba === 'hist' ? venc.historico : venc.proximos;
  const lista = mes ? naAba.filter((x) => x.data.slice(0, 7) === mes) : naAba;
  const visiveis = todos ? lista : lista.slice(0, 6);
  const avaliar = venc.historico.filter((h) => h.avaliar).length;
  const gridProx = 'grid grid-cols-[86px_minmax(0,1.5fr)_110px_90px_110px_minmax(0,1.4fr)_92px] items-center gap-3';
  const gridHist = 'grid grid-cols-[86px_minmax(0,1.4fr)_110px_90px_110px_minmax(0,1.8fr)_92px] items-center gap-3';
  return (
    <section className="card flex flex-col overflow-hidden p-5">
      <TituloBloco titulo="Vencimentos" sub={aba === 'hist' ? 'o que venceu, o IR que o banco tirou e para onde foi o dinheiro' : 'o valor no dia é a conta pelo CDI de hoje; no dia, volta para a conta ou reaplica (o cadastro diz)'}
        extra={<AbasPilula abas={[{ key: 'prox', label: 'Próximos', qtd: venc.proximos.length }, { key: 'hist', label: 'Histórico', qtd: venc.historico.length }]}
          valor={aba} onChange={(k) => { onAba(k); setTodos(false); }} variante="claro" altura={30} folga={2} />}>
        {avaliar > 0 && <Etiqueta tom="ambar">{avaliar} para avaliar</Etiqueta>}
      </TituloBloco>
      <div className="shrink-0">
        <div className="h-[150px] pt-4">
          <GradeEsq esc={esc}>
            <div className="pointer-events-none absolute inset-0 flex gap-1.5">
              {linha.map((m, k) => {
                const hP = fr(m.venceu); const hV = fr(m.venceu + m.volta) - hP; const hR = fr(total(m)) - fr(m.venceu + m.volta);
                const apagado = balao.esmaecido(k) || (mes && mes !== m.competencia);
                return (
                  <div key={m.competencia} className="h-full min-w-0 flex-1 transition-opacity duration-100" style={{ opacity: apagado ? 0.4 : 1 }}>
                    <div className="relative mx-auto h-full w-full" style={{ maxWidth: LARG_VAGA }}>
                      {m.venceu > 0 && <div className="absolute inset-x-[14%] bottom-0 transition-opacity duration-150" style={{ height: frac(hP), background: COR_APORTADO, opacity: ctrl.opSerie('venceu') }} />}
                      {m.volta > 0 && <div className="absolute inset-x-[14%] transition-opacity duration-150" style={{ bottom: frac(hP), height: frac(hV), background: COR_VOLTA, opacity: ctrl.opSerie('volta') }} />}
                      {m.reaplica > 0 && <div className="absolute inset-x-[14%] rounded-t-[2px] transition-opacity duration-150" style={{ bottom: frac(hP + hV), height: frac(hR), background: COR_REAPLICA, opacity: ctrl.opSerie('reaplica') }} />}
                      {total(m) > 0 && (
                        <span className="pointer-events-none absolute inset-x-[-8px] hidden text-center text-[9px] font-semibold tabular-nums sm:block" style={{ bottom: posRotulo(fr(total(m))), color: COR_ROTULO }}>{rot(total(m))}</span>
                      )}
                      {m.hoje && (
                        <span className="absolute -bottom-1 -top-2 left-1/2 border-l border-dashed" style={{ borderColor: MEDIO.cor }}>
                          <span className="absolute -left-3 -top-3 text-[9.5px] font-semibold" style={{ color: MEDIO.cor }}>hoje</span>
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            {a && <div className={CLASSE_GUIA} style={{ left: `${((i + 0.5) / linha.length) * 100}%` }} />}
            <div className="absolute inset-0 flex gap-1.5" onMouseLeave={balao.aoSair}>
              {linha.map((m, k) => (
                <button key={m.competencia} type="button" onMouseMove={balao.aoMover(k)} onClick={() => { setMes(mes === m.competencia ? null : m.competencia); setTodos(true); }}
                  aria-label={`${nomeCompetencia(m.competencia)}: ver os vencimentos do mês`} className="h-full min-w-0 flex-1 cursor-pointer" />
              ))}
            </div>
          </GradeEsq>
        </div>
        <ReguaMeses meses={linha} ativo={i} />
        {a && (
          <BalaoGrafico pos={balao.pos} largura={250} titulo={`${nomeCompetencia(a.competencia)} · ${a.quantos ? `${a.quantos} ${a.quantos === 1 ? 'vencimento' : 'vencimentos'}` : 'nada vence'}`}
            itens={[...(a.venceu ? [{ rotulo: 'Já venceu', valor: formatBRL(a.venceu), cor: COR_APORTADO }] : []),
              ...(a.volta ? [{ rotulo: 'Volta para a conta', valor: formatBRL(a.volta), cor: COR_VOLTA }] : []),
              ...(a.reaplica ? [{ rotulo: 'Reaplica sozinho', valor: formatBRL(a.reaplica), cor: COR_REAPLICA }] : [])]}
            nota={a.quantos ? 'Clique para ver só este mês.' : undefined} />
        )}
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <LegendaSeries borda={false} className="" ctrl={ctrl} series={[
            { key: 'volta', rotulo: 'Volta para a conta', cor: COR_VOLTA }, { key: 'reaplica', rotulo: 'Reaplica sozinho', cor: COR_REAPLICA }, { key: 'venceu', rotulo: 'Já venceu', cor: COR_APORTADO },
          ]} />
          <span className="flex-1" />
          {mes && (
            <button type="button" onClick={() => setMes(null)} className={`${PILULA}`} style={{ background: ESTADO.bg, color: ESTADO.cor }}>
              só {nomeCompetencia(mes).toLowerCase()} ✕
            </button>
          )}
        </div>
      </div>
      <div className="mt-3 min-h-0 flex-1 overflow-auto border-t border-gray-100 pt-2 [scrollbar-gutter:stable]">
        {aba === 'hist' && !venc.historico.length ? (
          <p className="py-6 text-center text-[13px] text-gray-500">
            Nada venceu ainda.{venc.proximos[0] ? ` O primeiro é em ${formatDate(venc.proximos[0].data)} (${venc.proximos[0].item.inv.nome}).` : ''} Quando vencer, ele aparece aqui com o que aconteceu, e fica "para avaliar" por 30 dias.
          </p>
        ) : !lista.length ? (
          <p className="py-6 text-center text-[13px] text-gray-500">{mes ? 'Nada neste mês.' : 'Nenhum aporte com vencimento.'}</p>
        ) : (
          <div className="min-w-[860px]">
            <div className={`${aba === 'hist' ? gridHist : gridProx} border-b border-gray-100 px-1 pb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.05em] text-gray-500`}>
              <span>{aba === 'hist' ? 'Venceu' : 'Vence'}</span><span>Investimento</span>
              <span className="text-right">{aba === 'hist' ? 'Valor' : 'Vale no dia ≈'}</span><span className="text-right">{aba === 'hist' ? 'IR pago' : 'IR ≈'}</span>
              <span className="text-right">{aba === 'hist' ? 'Líquido' : 'Líquido ≈'}</span><span>{aba === 'hist' ? 'Para onde foi' : 'O que acontece'}</span><span />
            </div>
            {visiveis.map((v) => (
              <div key={v.item.ap.id} className={`${aba === 'hist' ? gridHist : gridProx} rounded-[6px] px-1 py-[7px] text-[12.5px] transition-colors hover:bg-gray-50 ${v.avaliar ? 'bg-amber-50/40' : ''}`}>
                <span className="tabular-nums font-medium text-gray-800">{formatDate(v.data)}</span>
                <span className="min-w-0 truncate text-gray-700">
                  <span className="mr-2 inline-block h-2 w-2 rounded-full align-middle" style={{ background: cores[v.item.inv.instituicao.trim()] }} />
                  {v.item.inv.nome}<span className="ml-1.5 text-gray-400">{v.item.inv.instituicao}</span>
                </span>
                <span className="text-right tabular-nums text-gray-900">{formatBRL(v.valor)}</span>
                <span className="text-right tabular-nums text-gray-500">{formatBRL(v.ir)}</span>
                <span className="text-right font-medium tabular-nums text-gray-900">{formatBRL(v.liquido)}</span>
                {aba === 'hist' ? (
                  <span className="flex min-w-0 flex-wrap items-center gap-1.5">
                    <span className="truncate" style={{ color: v.seguinte ? COR_REAPLICA : COR_VOLTA }}>
                      {v.seguinte ? `reaplicado: um aporte novo de ${formatBRL(Number(v.seguinte.valor_centavos))}${v.seguinte.vencimento ? `, vence ${dataCurta(v.seguinte.vencimento)}` : ''}` : 'voltou para a conta'}
                    </span>
                    {v.conferir && <Etiqueta tom="ambar">conferir</Etiqueta>}
                  </span>
                ) : (
                  <span className="truncate" style={{ color: v.reaplica ? COR_REAPLICA : COR_VOLTA }}>
                    {v.reaplica ? `reaplica sozinho${v.novoVenc ? ` · o novo vence ${dataCurta(v.novoVenc)}` : ''}` : 'volta para a conta'}
                  </span>
                )}
                <span className="text-right">
                  {aba === 'hist' ? (
                    v.avaliar && comVisto ? (
                      <button type="button" onClick={() => onVisto(v.item.ap.id)} className={PILULA} style={{ background: MEDIO.bg, color: MEDIO.cor }}
                        title="Já viu o que aconteceu com este dinheiro: sai do &quot;para avaliar&quot;.">
                        Avaliar · visto
                      </button>
                    ) : v.item.ap.vencimento_visto ? <span className="text-[11.5px] text-gray-400">✓ visto</span> : null
                  ) : (
                    <span className={`whitespace-nowrap rounded-full px-2 py-px text-[11px] font-semibold ${v.dias <= 45 ? 'bg-amber-50 text-amber-700' : 'bg-gray-100 text-gray-600'}`}>{quando(v.dias)}</span>
                  )}
                </span>
              </div>
            ))}
          </div>
        )}
        <div className="mt-2 flex items-center gap-3">
          {lista.length > 6 && (
            <button type="button" onClick={() => setTodos(!todos)} className="text-[12px] font-medium text-gray-600 underline-offset-2 hover:text-gray-900 hover:underline">
              {todos ? 'Mostrar menos' : `Ver todos (${lista.length})`}
            </button>
          )}
          <span className="flex-1" />
          {onInvestimentos && <button type="button" onClick={onInvestimentos} className="text-[12px] font-medium text-gray-600 underline-offset-2 hover:text-gray-900 hover:underline">Ver os investimentos →</button>}
        </div>
      </div>
    </section>
  );
}

// ------------------------------------------------------------ o IR
// O IR E QUANDO ELE CAI: o patrimônio por alíquota (a barra e a legenda, que acendem juntas) e as próximas quedas, cada
// uma com quanto de imposto ela tira sobre o que já rendeu. O FIM DO IOF (09/11/2026) é uma queda também, com a marca âmbar.
export function BlocoIR({ grupos, quedas, total, irTotal, iofTotal = 0 }) {
  const [realce, setRealce] = useState(null);
  return (
    <section className="card flex flex-col overflow-hidden p-5">
      <TituloBloco titulo="O IR e quando ele cai" sub={`se resgatasse tudo hoje: ${formatBRL(irTotal)} de IR${iofTotal ? ` e ${formatBRL(iofTotal)} de IOF` : ''}`} />
      <div className="min-h-0 flex-1 overflow-auto">
        <div className="flex h-3 overflow-hidden rounded-full bg-gray-100" onMouseLeave={() => setRealce(null)}>
          {grupos.map((g) => (
            <div key={g.aliquota} onMouseEnter={() => setRealce(g.aliquota)} className="h-full transition-opacity duration-150"
              style={{ width: `${total ? (g.vale / total) * 100 : 0}%`, background: CORES_ALIQUOTA[g.aliquota] ?? CORES_ALIQUOTA[0], opacity: realce !== null && realce !== g.aliquota ? 0.3 : 1 }} />
          ))}
        </div>
        <div className="mt-2.5 grid grid-cols-2 gap-x-3 gap-y-1" onMouseLeave={() => setRealce(null)}>
          {grupos.map((g) => (
            <button key={g.aliquota} type="button" onMouseEnter={() => setRealce(g.aliquota)}
              className={`flex min-w-0 items-center gap-2 rounded-[6px] px-1.5 py-1 text-left text-[12px] transition-[background-color,opacity] ${realce === g.aliquota ? 'bg-gray-100' : 'hover:bg-gray-50'} ${realce !== null && realce !== g.aliquota ? 'opacity-50' : ''}`}>
              <span className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: CORES_ALIQUOTA[g.aliquota] ?? CORES_ALIQUOTA[0] }} />
              <b className="font-semibold text-gray-800">{aliqTexto(g.aliquota)}</b>
              <span className="min-w-0 truncate tabular-nums text-gray-500">{brlCurto(g.vale)} · IR {brlCurto(g.ir)}{g.iof ? ` · IOF ${brlCurto(g.iof)}` : ''}</span>
            </button>
          ))}
        </div>
        <div className="mb-1 mt-3 text-[10.5px] font-semibold uppercase tracking-[0.05em] text-gray-500">As próximas quedas</div>
        {!quedas.length ? <p className="py-2 text-[12.5px] text-gray-500">Nada cai de imposto daqui para a frente.</p> : (
          <ul className="divide-y divide-gray-100">
            {quedas.map((q) => (
              <li key={`${q.tipo}:${q.item.ap.id}`} className="grid grid-cols-[64px_minmax(0,1fr)_auto] items-center gap-2 py-1.5 text-[12.5px]">
                <span className="tabular-nums text-gray-700">{dataCurta(q.data)}</span>
                {q.tipo === 'iof' ? (
                  <span className="flex min-w-0 items-center gap-1.5 text-gray-800"><span className="truncate">{q.item.inv.nome}<span className="text-gray-400"> · o IOF zera (hoje {aliqTexto(q.de)})</span></span><Etiqueta tom="ambar">IOF</Etiqueta></span>
                ) : <span className="min-w-0 truncate text-gray-800">{q.item.inv.nome}<span className="text-gray-400"> · {aliqTexto(q.de)} → {aliqTexto(q.para)}</span></span>}
                <span className="whitespace-nowrap tabular-nums text-green-700" title="O imposto a menos sobre o que já rendeu (cresce até a data)">≈ −{formatBRL(q.economia)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

// ------------------------------------------------------------ quando o dinheiro fica livre
export function BlocoLiquidez({ degraus }) {
  const [sob, setSob] = useState(null);
  // o % e a barra sobre o ÚLTIMO degrau: o que vence volta com o rendimento até lá, e sobre o total de hoje passava de 100%
  const total = degraus[degraus.length - 1]?.valor ?? 0;
  return (
    <section className="card flex flex-col overflow-hidden p-5">
      <TituloBloco titulo="Quando o dinheiro fica livre" sub="o que dá para tirar até cada data, somando (o % é do último degrau)" />
      <ul className="min-h-0 flex-1 space-y-1 overflow-auto" onMouseLeave={() => setSob(null)}>
        {degraus.map((d, k) => (
          <li key={d.rotulo} onMouseEnter={() => setSob(k)}
            className={`grid grid-cols-[120px_minmax(0,1fr)_auto_40px] items-center gap-3 rounded-[7px] px-2 py-[7px] transition-[background-color,opacity] duration-150 ${sob === k ? 'bg-gray-100' : 'hover:bg-gray-50'} ${sob !== null && sob !== k ? 'opacity-50' : ''}`}>
            <span className="text-[12.5px] text-gray-800">{d.rotulo}</span>
            <span className="h-2.5 overflow-hidden rounded-full bg-gray-100">
              <span className="block h-full rounded-full transition-[width] duration-300 ease-out" style={{ width: `${total ? Math.min(100, (d.valor / total) * 100) : 0}%`, background: `linear-gradient(90deg, color-mix(in srgb, ${COR_VOLTA} 50%, transparent), ${COR_VOLTA})` }} />
            </span>
            <span className="whitespace-nowrap text-right text-[12.5px] font-medium tabular-nums text-gray-900">{formatBRL(d.valor)}</span>
            <span className="text-right text-[11.5px] tabular-nums text-gray-500">{total ? Math.round((d.valor / total) * 100) : 0}%</span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[11.5px] text-gray-500">Hoje é o que tem resgate a qualquer hora; o que só sai no vencimento entra no dia dele, pelo líquido. O que reaplica sozinho não fica livre.</p>
    </section>
  );
}

// ------------------------------------------------------------ o dinheiro que entrou e saiu
// AS BARRAS DIVERGENTES do "Saldo do mês" da Visão geral: o que entrou em cada mês PARA CIMA (os aportes) e o que saiu
// PARA BAIXO (os resgates e os vencimentos), com o número em cada uma.
export function EntrouSaiu({ meses, ctrl, onMes }) {
  const balao = useBalao(230, 110);
  const vals = meses.flatMap((m) => [m.aportes / 100, -m.resgates / 100]);
  const hi = Math.max(0, ...vals); const lo = Math.min(0, ...vals);
  const base = escalaLinear(Math.max(hi, -lo, 1), 3);
  const passo = base.marcas[1] ?? base.teto;
  const topo = Math.max(passo, Math.ceil(hi / passo) * passo);
  const fundo = -Math.ceil(-lo / passo) * passo;
  const marcas = []; for (let v = fundo; v <= topo; v += passo) marcas.push(v);
  const esc = { marcas, fracao: (v) => (v - fundo) / (topo - fundo) };
  const fr = (c) => esc.fracao(c / 100);
  const zero = esc.fracao(0);
  const rot = formatoRotulo(Math.max(topo, -fundo));
  const i = balao.ativo;
  const m = i !== null ? meses[i] : null;
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 pb-4 pt-4">
        <GradeEsq esc={esc}>
          <div className="pointer-events-none absolute inset-0 flex gap-1.5">
            {meses.map((mm, k) => (
              <div key={mm.competencia} className="h-full min-w-0 flex-1 transition-opacity duration-100" style={{ opacity: balao.esmaecido(k) ? 0.4 : 1 }}>
                <div className="relative mx-auto h-full w-full" style={{ maxWidth: LARG_VAGA }}>
                  {mm.aportes > 0 && (
                    <>
                      <div className="absolute left-[19%] right-[19%] rounded-t-[2px] transition-opacity duration-150" style={{ bottom: frac(zero), height: frac(fr(mm.aportes) - zero), background: COR_VOLTA, opacity: ctrl.opSerie('entrou') }} />
                      <span className="absolute inset-x-[-8px] hidden text-center text-[9px] font-semibold tabular-nums sm:block" style={{ bottom: `calc(${fr(mm.aportes) * 100}% + 3px)`, color: COR_ROTULO, opacity: ctrl.opSerie('entrou') < 1 ? 0.3 : 1 }}>{rot(mm.aportes)}</span>
                    </>
                  )}
                  {mm.resgates > 0 && (
                    <>
                      <div className="absolute left-[19%] right-[19%] rounded-b-[2px] transition-opacity duration-150" style={{ top: frac(1 - zero), height: frac(zero - fr(-mm.resgates)), background: COR_SAIU, opacity: ctrl.opSerie('saiu') }} />
                      <span className="absolute inset-x-[-8px] hidden text-center text-[9px] font-semibold tabular-nums sm:block" style={{ top: `calc(${(1 - fr(-mm.resgates)) * 100}% + 3px)`, color: COR_SAIU, opacity: ctrl.opSerie('saiu') < 1 ? 0.3 : 1 }}>−{rot(mm.resgates)}</span>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
          {m && <div className={CLASSE_GUIA} style={{ left: `${((i + 0.5) / meses.length) * 100}%` }} />}
          <div className="absolute inset-0 flex gap-1.5" onMouseLeave={balao.aoSair}>
            {meses.map((mm, k) => (
              <button key={mm.competencia} type="button" onMouseMove={balao.aoMover(k)} onClick={onMes ? () => onMes(mm.competencia) : undefined}
                aria-label={`${nomeCompetencia(mm.competencia)}: entrou ${formatBRL(mm.aportes)}, saiu ${formatBRL(mm.resgates)}`} className="h-full min-w-0 flex-1 cursor-default" />
            ))}
          </div>
        </GradeEsq>
      </div>
      <ReguaMeses meses={meses} ativo={i} />
      {m && (
        <BalaoGrafico pos={balao.pos} largura={230} titulo={nomeCompetencia(m.competencia)} itens={[
          { rotulo: 'Entrou', valor: m.aportes ? formatBRL(m.aportes) : '—', cor: COR_VOLTA },
          { rotulo: 'Saiu', valor: m.resgates ? formatBRL(m.resgates) : '—', cor: COR_SAIU },
          { rotulo: 'Aplicado no fim do mês', valor: formatBRL(m.aportado) },
        ]} />
      )}
    </div>
  );
}

// ------------------------------------------------------------ cada investimento
// A TABELA DOS INVESTIMENTOS: o peso na carteira, quanto rendeu, quanto rende por ano (a taxa equivalente) e o próximo
// vencimento. O título da coluna ORDENA (a 3ª vez volta ao padrão, o maior em cima), lembrado em `patrimonio_ordem`.
const COLUNAS_TAB = [
  { k: 'nome', rotulo: 'Investimento', v: (l) => l.inv.nome, esq: true },
  { k: 'taxa', rotulo: 'Rende', v: (l) => Number(l.inv.taxa), esq: true },
  { k: 'aplicado', rotulo: 'Aplicado', v: (l) => l.aplicado },
  { k: 'vale', rotulo: 'Vale hoje', v: (l) => l.vale },
  { k: 'rendeu', rotulo: 'Rendeu', v: (l) => l.rendeu },
  { k: 'peso', rotulo: 'Peso', v: (l) => l.vale, esq: true },
  { k: 'aoAno', rotulo: 'Ao ano ≈', v: (l) => l.aoAno ?? -1 },
  { k: 'venc', rotulo: 'Próximo venc.', v: (l) => l.proximoVencimento ?? '9999' },
];
const lerOrdem = () => { try { const o = JSON.parse(lsGet('patrimonio_ordem') ?? 'null'); return o && COLUNAS_TAB.some((c) => c.k === o.k) ? o : null; } catch { return null; } };
export function TabelaInvestimentos({ linhas, cores, onInvestimentos }) {
  const [ordem, setOrdemEstado] = useState(lerOrdem);
  const setOrdem = (o) => { setOrdemEstado(o); lsSet('patrimonio_ordem', o ? JSON.stringify(o) : ''); };
  const clicar = (k) => {
    if (!ordem || ordem.k !== k) setOrdem({ k, dir: k === 'nome' || k === 'venc' ? 1 : -1 });
    else if ((ordem.dir === -1) !== (k === 'nome' || k === 'venc')) setOrdem({ k, dir: -ordem.dir });
    else setOrdem(null);
  };
  const ordenadas = useMemo(() => {
    const col = COLUNAS_TAB.find((c) => c.k === ordem?.k) ?? COLUNAS_TAB[3];
    const dir = ordem ? ordem.dir : -1;
    return [...linhas].sort((a, b) => { const x = col.v(a); const y = col.v(b); return (x < y ? -1 : x > y ? 1 : 0) * dir; });
  }, [linhas, ordem]);
  const grade = 'grid grid-cols-[minmax(0,1.7fr)_120px_120px_120px_140px_minmax(0,1fr)_90px_100px] items-center gap-3';
  return (
    <section className="card flex flex-col overflow-hidden p-5">
      <TituloBloco titulo="Cada investimento" sub="o peso na carteira, quanto rendeu e quanto rende por ano (a taxa equivalente pela idade do dinheiro)"
        extra={onInvestimentos && <button type="button" onClick={onInvestimentos} className="text-[12px] font-medium text-gray-600 underline-offset-2 hover:text-gray-900 hover:underline">Ver os investimentos →</button>} />
      <div className="min-h-0 flex-1 overflow-auto">
        <div className="min-w-[900px]">
          <div className={`${grade} border-b border-gray-100 px-1 pb-1.5`}>
            {COLUNAS_TAB.map((c) => (
              <button key={c.k} type="button" onClick={() => clicar(c.k)}
                className={`text-[10.5px] font-semibold uppercase tracking-[0.05em] transition-colors hover:text-gray-800 ${ordem?.k === c.k ? 'text-gray-800' : 'text-gray-500'} ${c.esq ? 'text-left' : 'text-right'}`}>
                {c.rotulo}{ordem?.k === c.k ? (ordem.dir > 0 ? ' ↑' : ' ↓') : ''}
              </button>
            ))}
          </div>
          {ordenadas.map((l) => (
            <div key={l.inv.id} className={`${grade} rounded-[6px] px-1 py-2 text-[12.5px] transition-colors hover:bg-gray-50`}>
              <span className="min-w-0 truncate">
                <span className="mr-2 inline-block h-2 w-2 rounded-full align-middle" style={{ background: cores[l.inv.instituicao.trim()] }} />
                <span className="font-medium text-gray-900">{l.inv.nome}</span>
                <span className="ml-1.5 text-gray-400">{l.inv.instituicao} · {l.aportes} {l.aportes === 1 ? 'aporte' : 'aportes'}</span>
              </span>
              <span className="truncate text-gray-600">{rotuloTaxa(l.inv.taxa, l.inv.indexador)}</span>
              <span className="text-right tabular-nums text-gray-700">{formatBRL(l.aplicado)}</span>
              <span className="text-right font-medium tabular-nums text-gray-900">{formatBRL(l.vale)}</span>
              <span className="text-right tabular-nums text-green-700">+{formatBRL(l.rendeu)}<span className="ml-1 text-gray-400">{l.aplicado ? pctTexto(l.rendeu / l.aplicado, 1) : ''}</span></span>
              <span className="flex items-center gap-2">
                <span className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-gray-100"><span className="block h-full rounded-full" style={{ width: `${l.peso * 100}%`, background: cores[l.inv.instituicao.trim()] }} /></span>
                <span className="w-9 text-right text-[11.5px] tabular-nums text-gray-500">{pctTexto(l.peso)}</span>
              </span>
              <span className="text-right tabular-nums text-gray-700">{pctTexto(l.aoAno, 1)}</span>
              <span className="text-right tabular-nums text-gray-500">{l.proximoVencimento ? dataCurta(l.proximoVencimento) : '—'}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
