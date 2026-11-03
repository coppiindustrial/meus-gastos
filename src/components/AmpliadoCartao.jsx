import { useEffect, useMemo, useRef, useState } from 'react';
import Modal from './Modal.jsx';
import Tooltip from './Tooltip.jsx';
import AbasPilula from './AbasPilula.jsx';
import SelectSimples from './SelectSimples.jsx';
import Spinner from './Spinner.jsx';
import { Bolinha } from './Comuns.jsx';
import BalaoGrafico, { useBalao } from './graficos/BalaoGrafico.jsx';
import { IconMaximize, IconMinimize } from './icons.jsx';
import { listarDoCartao } from '../api/lancamentos.js';
import { listarCategorias } from '../api/cadastros.js';
import { PERIODOS, anoContraAno, anosComFatura, linhaDoTempo, porCategoria } from '../lib/historicoCartao.js';
import { formatBRL, numeroK } from '../lib/dinheiro.js';
import { competenciaCurta, formatDate, nomeCompetencia } from '../lib/format.js';
import { exportCsv } from '../lib/exportCsv.js';
import { useToast } from '../context/ToastContext.jsx';

// O HISTÓRICO DO CARTÃO (03/11/2026, mockup "Cartões · o ampliado do cartão", aprovado): o ⤢ do bloco abre o PAINEL
// dos ampliados (1280px e 90% da altura; tela cheia 96vw × 94vh; CSV), com o cartão e o período em cima e quatro
// vistas: LINHA DO TEMPO (todas as faturas do período com o número em cada coluna, a média tracejada, o ano embaixo e
// as parcelas que vêm hachuradas), ANO × ANO (dois anos lado a lado e a comparação no mesmo período), POR CATEGORIA
// (para onde foi o cartão e onde mais se comprou — lê os lançamentos do cartão) e TABELA. Contas puras em
// `lib/historicoCartao.js` (testadas). Clicar num mês (coluna ou linha) abre os lançamentos dele.

const BTN_ICONE = 'inline-flex h-[28px] w-[28px] items-center justify-center rounded-[4px] text-gray-400 transition hover:bg-gray-100 hover:text-gray-600';
const ABAS = [{ key: 'linha', label: 'Linha do tempo' }, { key: 'anos', label: 'Ano × ano' }, { key: 'categorias', label: 'Por categoria' }, { key: 'tabela', label: 'Tabela' }];
const MES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const TH = 'text-[10.5px] font-semibold uppercase tracking-[0.05em] text-gray-500';
const plural = (n, um, varios) => `${n.toLocaleString('pt-BR')} ${n === 1 ? um : varios}`;
const sinal = (v) => `${v >= 0 ? '+' : '−'} ${formatBRL(Math.abs(v))}`;

// A largura de cada coluna (medida): estreita, o número cheio não cabe.
function useLarguraColuna(n) {
  const ref = useRef(null);
  const [larg, setLarg] = useState(40);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(() => setLarg(el.clientWidth / Math.max(1, n)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [n]);
  return [ref, larg];
}

const Kpi = ({ rotulo, valor, sub }) => (
  <div className="min-w-0 rounded-lg bg-hx-f6f7f8 px-3 py-2.5">
    <div className={TH}>{rotulo}</div>
    <div className="mt-0.5 truncate text-[17px] font-semibold tabular-nums text-gray-900">{valor}</div>
    <div className="truncate text-[11.5px] text-gray-500">{sub}</div>
  </div>
);

const Legenda = ({ parcelas, media }) => (
  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11.5px] text-gray-500">
    <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-[2px] bg-gray-300" />faturas</span>
    <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-[2px]" style={{ background: 'var(--serie-gastos)' }} />última</span>
    {parcelas && <span className="inline-flex items-center gap-1.5"><span className="barra-parcelas h-2.5 w-2.5 rounded-[2px]" />parcelas já compradas que vêm</span>}
    {media && <span className="inline-flex items-center gap-1.5"><span className="w-4 border-t border-dashed border-gray-500" />média no período</span>}
  </div>
);

function LinhaDoTempo({ t, ultimaComp, onVerMes }) {
  const { colunas, anos, resumo } = t;
  const maior = Math.max(1, ...colunas.map((c) => c.total));
  const [ref, larg] = useLarguraColuna(colunas.length);
  const balao = useBalao(240, 130);
  const ativo = balao.ativo !== null ? colunas[balao.ativo] : null;
  const estreito = larg < 30;
  const marcos = new Set([ultimaComp, resumo.maior?.comp, colunas.find((c) => c.tipo === 'parcelas' && c.total)?.comp]);
  const mesDe = (comp) => (larg < 14 ? (comp.endsWith('-01') ? competenciaCurta(comp) : '') : estreito ? MES[Number(comp.slice(5, 7)) - 1][0].toUpperCase() : MES[Number(comp.slice(5, 7)) - 1]);
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="relative min-h-[220px] flex-1">
        <div ref={ref} className="absolute inset-x-0 bottom-[38px] top-0 flex items-end gap-[3px] border-b border-gray-200" onMouseLeave={balao.aoSair}>
          {resumo.media != null && (
            <div className="pointer-events-none absolute inset-x-0 border-t border-dashed border-gray-400" style={{ bottom: `calc(${resumo.media / maior} * (100% - 18px))` }}>
              <span className="absolute -top-[17px] left-0 bg-white pr-1.5 text-[11px] text-gray-500">média {numeroK(resumo.media)}</span>
            </div>
          )}
          {colunas.map((c, i) => {
            const futura = c.tipo === 'parcelas';
            const ultima = c.comp === ultimaComp && !futura;
            const hoje = futura && colunas[i - 1]?.tipo === 'fatura';
            return (
              <button key={c.comp} type="button" onMouseMove={balao.aoMover(i)} onClick={() => !futura && c.total && onVerMes(c.comp)}
                aria-label={`${nomeCompetencia(c.comp)}: ${c.total ? formatBRL(c.total) : 'sem fatura'}${futura ? ' em parcelas já compradas' : ''}`}
                className={`flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-[3px] transition-opacity duration-150 ${hoje ? 'ml-[3px] border-l border-dashed border-gray-300 pl-[3px]' : ''} ${!futura && c.total ? 'cursor-pointer' : 'cursor-default'} ${balao.esmaecido(i) ? 'opacity-40' : ''}`}>
                <span className={`whitespace-nowrap text-[10.5px] leading-none tabular-nums ${ultima ? 'font-semibold text-gray-800' : futura ? '' : 'text-gray-500'}`}
                  style={futura ? { color: 'var(--serie-gastos)' } : undefined}>
                  {c.total && (!estreito || marcos.has(c.comp)) ? numeroK(c.total) : ''}
                </span>
                <span className={`block w-full rounded-t-[3px] ${futura ? 'barra-parcelas' : ultima ? '' : c.total ? 'bg-gray-300' : 'bg-gray-100'}`}
                  style={{ height: `max(${c.total ? 3 : 2}px, calc(${c.total / maior} * (100% - 18px)))`, ...(ultima ? { background: 'var(--serie-gastos)' } : {}) }} />
              </button>
            );
          })}
        </div>
        <div className="absolute inset-x-0 bottom-[20px] flex gap-[3px] text-[10.5px] text-gray-400">
          {colunas.map((c, i) => (
            <span key={c.comp} className={`min-w-0 flex-1 truncate text-center ${c.tipo === 'parcelas' && colunas[i - 1]?.tipo === 'fatura' ? 'ml-[3px] pl-[4px]' : ''} ${c.comp === ultimaComp ? 'font-semibold text-gray-700' : ''}`}>{mesDe(c.comp)}</span>
          ))}
        </div>
        <div className="absolute inset-x-0 bottom-0 flex gap-[3px]">
          {anos.map((a) => (
            <span key={a.ano} className="min-w-0 truncate border-l border-gray-300 pl-1.5 text-[11px] font-semibold text-gray-500" style={{ flex: `${a.n} 1 0` }}>{a.ano}</span>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Legenda parcelas={!!resumo.parcelas} media={resumo.media != null} />
        <span className="flex-1" />
        <span className="text-[11.5px] text-gray-400">clique numa coluna = os lançamentos do mês</span>
      </div>
      {ativo && (
        <BalaoGrafico pos={balao.pos} largura={240} titulo={ativo.tipo === 'parcelas' ? `Parcelas de ${nomeCompetencia(ativo.comp).toLowerCase()}` : `Fatura de ${nomeCompetencia(ativo.comp).toLowerCase()}`}
          itens={!ativo.total ? [{ rotulo: ativo.tipo === 'parcelas' ? 'Sem parcelas' : 'Sem fatura', valor: '—' }] : ativo.tipo === 'parcelas' ? [
            { rotulo: 'Já comprado', valor: formatBRL(ativo.total), cor: 'var(--serie-gastos)' },
            { rotulo: 'Compras', valor: String(ativo.qtd) },
          ] : [
            { rotulo: 'Total', valor: formatBRL(ativo.total), cor: ativo.comp === ultimaComp ? 'var(--serie-gastos)' : undefined },
            { rotulo: 'Compras', valor: String(ativo.qtd) },
            ...(resumo.media ? [{ rotulo: 'Contra a média', valor: sinal(ativo.total - resumo.media) }] : []),
          ]}
          nota={ativo.tipo === 'parcelas' ? 'O que já foi parcelado; a fatura do mês ainda terá as compras novas.' : ativo.total ? `Vence ${formatDate(ativo.vencimento)} · clique para ver os lançamentos` : undefined} />
      )}
    </div>
  );
}

function AnoContraAno({ r, a, b, opcoesAno, setA, setB, onVerMes }) {
  const maior = Math.max(1, ...r.meses.flatMap((m) => [m.a, m.b, m.bFutura]));
  const balao = useBalao(240, 130);
  const ativo = balao.ativo !== null ? r.meses[balao.ativo] : null;
  const resA = r.anos[a];
  const resB = r.anos[b];
  const linha = (rotulo, x, y, forte) => (
    <tr className="border-b border-gray-100">
      <td className="py-2 text-gray-500">{rotulo}</td>
      <td className="py-2 text-right tabular-nums text-gray-700">{x}</td>
      <td className={`py-2 text-right tabular-nums ${forte ? 'font-semibold text-gray-900' : 'text-gray-700'}`}>{y}</td>
    </tr>
  );
  const v = r.mesmoPeriodo?.variacao;
  return (
    <div className="flex min-h-0 flex-1 gap-6">
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <div className="relative min-h-[220px] flex-1">
          <div className="absolute inset-x-0 bottom-[20px] top-0 flex items-end gap-2.5 border-b border-gray-200" onMouseLeave={balao.aoSair}>
            {r.meses.map((m, i) => {
              const valorB = m.b || m.bFutura;
              const futura = !m.b && m.bFutura > 0;
              return (
                <button key={m.mes} type="button" onMouseMove={balao.aoMover(i)} onClick={() => m.b && onVerMes(`${b}-${String(m.mes).padStart(2, '0')}`)}
                  aria-label={`${MES[i]}: ${a} ${formatBRL(m.a)}, ${b} ${formatBRL(valorB)}`}
                  className={`flex h-full min-w-0 flex-1 items-end gap-[3px] transition-opacity duration-150 ${m.b ? 'cursor-pointer' : 'cursor-default'} ${balao.esmaecido(i) ? 'opacity-40' : ''}`}>
                  {[{ v: m.a, cls: 'bg-gray-300', cor: 'text-gray-400' }, { v: valorB, cls: futura ? 'barra-parcelas' : '', cor: '', estilo: futura ? null : { background: 'var(--serie-gastos)' } }].map((x, k) => (
                    <span key={k} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-[3px]">
                      <span className={`whitespace-nowrap text-[10.5px] leading-none tabular-nums ${x.cor} ${k ? 'font-semibold' : ''}`} style={k ? { color: 'var(--serie-gastos)' } : undefined}>{x.v ? numeroK(x.v) : ''}</span>
                      <span className={`block w-full rounded-t-[3px] ${x.cls}`} style={{ height: `max(${x.v ? 3 : 0}px, calc(${x.v / maior} * (100% - 18px)))`, ...(x.estilo ?? {}) }} />
                    </span>
                  ))}
                </button>
              );
            })}
          </div>
          <div className="absolute inset-x-0 bottom-0 flex gap-2.5 text-[11px] text-gray-500">
            {r.meses.map((m) => <span key={m.mes} className="min-w-0 flex-1 text-center">{MES[m.mes - 1]}</span>)}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11.5px] text-gray-500">
          <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-[2px] bg-gray-300" />{a}</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-[2px]" style={{ background: 'var(--serie-gastos)' }} />{b}</span>
          {r.meses.some((m) => !m.b && m.bFutura) && <span className="inline-flex items-center gap-1.5"><span className="barra-parcelas h-2.5 w-2.5 rounded-[2px]" />{b} · parcelas que já vêm</span>}
        </div>
      </div>
      <aside className="flex w-[300px] shrink-0 flex-col gap-3">
        <div className="flex items-center gap-2">
          <SelectSimples compacto value={a} onChange={setA} opcoes={opcoesAno} className="w-[96px]" />
          <span className="text-[12px] text-gray-400">×</span>
          <SelectSimples compacto value={b} onChange={setB} opcoes={opcoesAno} className="w-[96px]" />
        </div>
        <table className="w-full text-[12.5px]">
          <thead><tr className="border-b border-gray-200"><th className={`${TH} py-1.5 text-left`} /><th className={`${TH} py-1.5 text-right`}>{a}</th><th className={`${TH} py-1.5 text-right`}>{b}</th></tr></thead>
          <tbody>
            {linha('Total', formatBRL(resA.total), formatBRL(resB.total), true)}
            {linha('Faturas', resA.faturas, resB.faturas)}
            {linha('Média por fatura', resA.media != null ? formatBRL(resA.media) : '—', resB.media != null ? formatBRL(resB.media) : '—')}
            {linha('Maior', resA.maior ? `${MES[resA.maior.mes - 1]} · ${numeroK(resA.maior.total)}` : '—', resB.maior ? `${MES[resB.maior.mes - 1]} · ${numeroK(resB.maior.total)}` : '—')}
            {r.mesmoPeriodo && linha(`Até ${MES[r.mesmoPeriodo.ateMes - 1]}`, formatBRL(r.mesmoPeriodo.a),
              v == null ? '—' : <span className={`font-semibold ${v > 0 ? 'text-hx-c0393d' : 'text-green-700'}`}>{v > 0 ? '+' : '−'}{Math.abs(Math.round(v * 100))}%</span>)}
          </tbody>
        </table>
        <p className="text-[11.5px] leading-relaxed text-gray-500">A variação compara o mesmo período (janeiro até o último mês com fatura de {b}).</p>
      </aside>
      {ativo && (
        <BalaoGrafico pos={balao.pos} largura={240} titulo={nomeCompetencia(`${b}-${String(ativo.mes).padStart(2, '0')}`).replace(` de ${b}`, '')}
          itens={[
            { rotulo: a, valor: ativo.a ? formatBRL(ativo.a) : '—' },
            { rotulo: ativo.b || !ativo.bFutura ? b : `${b} (parcelas)`, valor: ativo.b ? formatBRL(ativo.b) : ativo.bFutura ? formatBRL(ativo.bFutura) : '—', cor: 'var(--serie-gastos)' },
            ...(ativo.a && ativo.b ? [{ rotulo: 'Diferença', valor: sinal(ativo.b - ativo.a) }] : []),
          ]} />
      )}
    </div>
  );
}

function PorCategoria({ dados, periodoTexto }) {
  if (!dados) return <div className="flex flex-1 items-center justify-center"><Spinner className="h-5 w-5" /></div>;
  const topo = dados.categorias[0]?.total || 1;
  return (
    <div className="grid min-h-0 flex-1 grid-cols-1 gap-7 overflow-auto lg:grid-cols-2">
      <div className="min-w-0">
        <div className="mb-2 flex items-baseline gap-2"><span className={TH}>Onde o cartão vai</span><span className="text-[11.5px] text-gray-400">{periodoTexto} · {formatBRL(dados.total)}</span></div>
        {dados.categorias.map((c) => (
          <div key={c.id} className="grid grid-cols-[minmax(0,180px)_minmax(0,1fr)_96px_44px] items-center gap-2.5 border-b border-gray-100 py-1.5 text-[12.5px]" title={`${c.nome}: ${plural(c.qtd, 'compra', 'compras')}`}>
            <span className="flex min-w-0 items-center gap-2"><Bolinha cor={c.cor ?? '#9ca3af'} /><span className="truncate text-gray-800">{c.nome}</span></span>
            <span className="h-2 overflow-hidden rounded-full bg-gray-100"><span className="block h-full rounded-full" style={{ width: `${(c.total / topo) * 100}%`, background: c.cor ?? '#9ca3af' }} /></span>
            <span className="text-right tabular-nums text-gray-800">{formatBRL(c.total)}</span>
            <span className="text-right tabular-nums text-gray-500">{dados.total ? Math.round((c.total / dados.total) * 100) : 0}%</span>
          </div>
        ))}
        {!dados.categorias.length && <p className="py-6 text-center text-[12.5px] text-gray-500">Nenhuma compra no período.</p>}
      </div>
      <div className="min-w-0">
        <div className="mb-2 flex items-baseline gap-2"><span className={TH}>Onde mais comprou</span><span className="text-[11.5px] text-gray-400">os estabelecimentos</span></div>
        {dados.lojas.map((l) => (
          <div key={l.nome} className="grid grid-cols-[minmax(0,1fr)_52px_104px] items-center gap-2.5 border-b border-gray-100 py-1.5 text-[12.5px]">
            <span className="truncate font-mono text-[12px] text-gray-800" title={l.nome}>{l.nome}</span>
            <span className="text-right tabular-nums text-gray-500">{l.vezes}×</span>
            <span className="text-right tabular-nums text-gray-800">{formatBRL(l.total)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Tabela({ t, ultimaComp, onVerMes }) {
  const futuras = t.colunas.filter((c) => c.tipo === 'parcelas' && c.total);
  return (
    <div className="min-h-0 flex-1 overflow-auto [scrollbar-gutter:stable]">
      <table className="w-full text-[12.5px]">
        <thead className="sticky top-0 z-10 bg-white">
          <tr className="border-b border-gray-200">
            {['Mês', 'Vencimento', 'Compras', 'Total', 'Contra a média'].map((h, i) => <th key={h} className={`${TH} px-2 py-2 ${i > 1 ? 'text-right' : 'text-left'}`}>{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {t.linhas.map((l) => (
            <tr key={l.comp} onClick={() => onVerMes(l.comp)} className="cursor-pointer border-b border-gray-100 hover:bg-hx-f9fafb">
              <td className={`px-2 py-1.5 ${l.comp === ultimaComp ? 'font-semibold text-gray-900' : 'text-gray-800'}`}>{nomeCompetencia(l.comp)}</td>
              <td className="px-2 py-1.5 tabular-nums text-gray-500">{l.vencimento ? formatDate(l.vencimento) : '—'}</td>
              <td className="px-2 py-1.5 text-right tabular-nums text-gray-600">{l.qtd}</td>
              <td className="px-2 py-1.5 text-right tabular-nums text-gray-900">{formatBRL(l.total)}</td>
              <td className={`px-2 py-1.5 text-right tabular-nums ${l.difMedia > 0 ? 'text-hx-c0393d' : 'text-green-700'}`}>{l.difMedia == null ? '—' : sinal(l.difMedia)}</td>
            </tr>
          ))}
          {futuras.length > 0 && (
            <>
              <tr><td colSpan={5} className={`${TH} px-2 pb-1.5 pt-4`}>Parcelas que vêm (já compradas)</td></tr>
              {futuras.map((c) => (
                <tr key={c.comp} className="border-b border-gray-100">
                  <td className="px-2 py-1.5 text-gray-700">{nomeCompetencia(c.comp)}</td>
                  <td className="px-2 py-1.5 text-gray-400">—</td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-gray-600">{c.qtd}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums" style={{ color: 'var(--serie-gastos)' }}>{formatBRL(c.total)}</td>
                  <td className="px-2 py-1.5" />
                </tr>
              ))}
            </>
          )}
        </tbody>
      </table>
    </div>
  );
}

// `cartoes`: os do cadastro (os com fatura aparecem na troca). `faturas`/`parcelas`: todas (a tela já as tem).
export default function AmpliadoCartao({ cartoes, cartaoId: inicial, faturas, parcelas, hoje, onClose, onVerMes }) {
  const toast = useToast();
  const [cheio, setCheio] = useState(false);
  const [cartaoId, setCartaoId] = useState(inicial);
  const [aba, setAba] = useState('linha');
  const [periodo, setPeriodo] = useState('12');
  const doCartao = useMemo(() => faturas.filter((f) => f.cartao_id === cartaoId), [faturas, cartaoId]);
  const parcelasDoCartao = useMemo(() => parcelas.filter((p) => p.cartao_id === cartaoId), [parcelas, cartaoId]);
  const t = useMemo(() => linhaDoTempo({ faturas: doCartao, parcelas: parcelasDoCartao, periodo, hoje }), [doCartao, parcelasDoCartao, periodo, hoje]);
  const cartao = cartoes.find((c) => c.id === cartaoId);
  const comFatura = cartoes.filter((c) => faturas.some((f) => f.cartao_id === c.id));
  const ultimaComp = useMemo(() => {
    const vencidas = doCartao.filter((f) => f.vencimento.slice(0, 10) <= hoje).sort((x, y) => y.vencimento.localeCompare(x.vencimento));
    return vencidas[0]?.competencia ?? null;
  }, [doCartao, hoje]);

  // ANO × ANO: o mais novo com fatura e o anterior a ele.
  const anos = useMemo(() => anosComFatura(doCartao), [doCartao]);
  const [par, setPar] = useState(null);
  const b = par?.b && anos.includes(par.b) ? par.b : anos[0] ?? hoje.slice(0, 4);
  const a = par?.a && anos.includes(par.a) ? par.a : anos[1] ?? String(Number(b) - 1);
  const opcoesAno = useMemo(() => [...new Set([...anos, a, b])].sort().reverse().map((x) => ({ value: x, label: x })), [anos, a, b]);
  const r = useMemo(() => anoContraAno({ faturas: doCartao, parcelas: parcelasDoCartao, a, b }), [doCartao, parcelasDoCartao, a, b]);

  // POR CATEGORIA: os lançamentos do cartão no período, lidos só quando a aba abre.
  const desde = t.colunas.find((c) => c.tipo === 'fatura')?.comp ?? null;
  const [cats, setCats] = useState(null);
  const [categorias, setCategorias] = useState(null);
  useEffect(() => {
    if (aba !== 'categorias') return undefined;
    let vivo = true;
    setCats(null);
    (async () => {
      try {
        const [ls, cs] = await Promise.all([listarDoCartao(cartaoId, periodo === 'tudo' ? null : desde), categorias ?? listarCategorias()]);
        if (!vivo) return;
        if (!categorias) setCategorias(cs);
        setCats(porCategoria(ls, cs));
      } catch (err) { if (vivo) { toast.error(err.message); setCats({ total: 0, categorias: [], lojas: [] }); } }
    })();
    return () => { vivo = false; };
  }, [aba, cartaoId, periodo, desde]); // eslint-disable-line react-hooks/exhaustive-deps

  const periodoTexto = t.colunas.length ? `${competenciaCurta(desde ?? t.colunas[0].comp)} a ${competenciaCurta(t.colunas.filter((c) => c.tipo === 'fatura').pop()?.comp ?? t.colunas[0].comp)}` : '';
  const exportar = () => {
    const nome = `cartao-${(cartao?.nome ?? '').toLowerCase().replace(/\s+/g, '-')}`;
    if (aba === 'anos') {
      exportCsv(`${nome}-${a}-x-${b}`, r.meses, [
        { key: 'mes', label: 'Mês', map: (m) => MES[m.mes - 1] },
        { key: 'a', label: a, tipo: 'dinheiro', map: (m) => m.a / 100 },
        { key: 'b', label: b, tipo: 'dinheiro', map: (m) => m.b / 100 },
        { key: 'bFutura', label: `${b} (parcelas que vêm)`, tipo: 'dinheiro', map: (m) => (m.bFutura ? m.bFutura / 100 : '') },
      ]);
    } else if (aba === 'categorias') {
      if (!cats) return;
      exportCsv(`${nome}-categorias`, cats.categorias, [
        { key: 'nome', label: 'Categoria' },
        { key: 'qtd', label: 'Compras' },
        { key: 'total', label: 'Total', tipo: 'dinheiro', map: (c) => c.total / 100 },
      ]);
    } else {
      exportCsv(`${nome}-faturas`, t.colunas.filter((c) => c.total), [
        { key: 'comp', label: 'Mês', map: (c) => competenciaCurta(c.comp) },
        { key: 'tipo', label: 'Tipo', map: (c) => (c.tipo === 'fatura' ? 'Fatura' : 'Parcelas que vêm') },
        { key: 'vencimento', label: 'Vencimento', tipo: 'data' },
        { key: 'qtd', label: 'Compras' },
        { key: 'total', label: 'Total', tipo: 'dinheiro', map: (c) => c.total / 100 },
      ]);
    }
  };

  const acoes = (
    <>
      <button type="button" className="btn-secondary !h-[30px] !px-3 !text-[12.5px]" onClick={exportar}>Exportar CSV</button>
      <Tooltip label={cheio ? 'Sair da tela cheia' : 'Tela cheia'}>
        <button type="button" onClick={() => setCheio((c) => !c)} aria-label={cheio ? 'Sair da tela cheia' : 'Tela cheia'} className={BTN_ICONE}>
          {cheio ? <IconMinimize className="h-3.5 w-3.5" /> : <IconMaximize className="h-3.5 w-3.5" />}
        </button>
      </Tooltip>
    </>
  );
  const { resumo } = t;
  return (
    <Modal open onClose={onClose} title={`Histórico · ${cartao?.nome ?? ''}`} subtitulo={`vence dia ${cartao?.dia_vencimento ?? '—'} · ${plural(doCartao.length, 'fatura', 'faturas')} no app`}
      acoes={acoes} alturaCheia animarTamanho padding="p-0"
      maxWidth={cheio ? 'max-w-[96vw]' : 'max-w-[min(1280px,95vw)]'} altura={cheio ? 'h-[94vh]' : 'h-[90vh]'}>
      <div className="flex h-full min-h-0 flex-col gap-4 px-5 pb-4 pt-4">
        <div className="flex flex-wrap items-center gap-2.5">
          {comFatura.length > 1 && (
            <AbasPilula abas={comFatura.map((c) => ({ key: c.id, label: c.nome }))} valor={cartaoId} onChange={(id) => { setCartaoId(id); setPar(null); }} variante="claro" altura={30} folga={2} />
          )}
          {aba !== 'anos' && <AbasPilula abas={PERIODOS.map((p) => ({ key: p.value, label: p.label }))} valor={periodo} onChange={setPeriodo} variante="claro" altura={30} folga={2} />}
          <span className="flex-1" />
          <AbasPilula abas={ABAS} valor={aba} onChange={setAba} altura={30} folga={2} />
        </div>
        {aba !== 'anos' && (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi rotulo="No período" valor={formatBRL(resumo.total)} sub={`${plural(resumo.faturas, 'fatura', 'faturas')} · ${plural(resumo.compras, 'compra', 'compras')}`} />
            <Kpi rotulo="Média por fatura" valor={resumo.media != null ? formatBRL(resumo.media) : '—'} sub={periodoTexto} />
            <Kpi rotulo="Maior fatura" valor={resumo.maior ? formatBRL(resumo.maior.total) : '—'} sub={resumo.maior ? competenciaCurta(resumo.maior.comp) : ''} />
            <Kpi rotulo="Parcelas que vêm" valor={resumo.parcelas ? formatBRL(resumo.parcelas.total) : '—'} sub={resumo.parcelas ? `até ${competenciaCurta(resumo.parcelas.ate)}` : 'nenhuma'} />
          </div>
        )}
        {aba === 'linha' && <LinhaDoTempo t={t} ultimaComp={ultimaComp} onVerMes={onVerMes} />}
        {aba === 'anos' && <AnoContraAno r={r} a={a} b={b} opcoesAno={opcoesAno} setA={(x) => setPar({ a: x, b })} setB={(x) => setPar({ a, b: x })} onVerMes={onVerMes} />}
        {aba === 'categorias' && <PorCategoria dados={cats} periodoTexto={periodoTexto} />}
        {aba === 'tabela' && <Tabela t={t} ultimaComp={ultimaComp} onVerMes={onVerMes} />}
      </div>
    </Modal>
  );
}
