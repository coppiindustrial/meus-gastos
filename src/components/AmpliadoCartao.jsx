import { useEffect, useMemo, useRef, useState } from 'react';
import Modal from './Modal.jsx';
import Tooltip from './Tooltip.jsx';
import AbasPilula from './AbasPilula.jsx';
import SelectSimples from './SelectSimples.jsx';
import Spinner from './Spinner.jsx';
import { Bolinha } from './Comuns.jsx';
import BalaoGrafico, { useBalao } from './graficos/BalaoGrafico.jsx';
import MenuContexto from './MenuContexto.jsx';
import { IconMaximize, IconMinimize, IconSeta } from './icons.jsx';
import { BuscaFaixa } from './filtros/Segmentos.jsx';
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

// O DESTAQUE (03/11/2026, a pedido): a LEGENDA é clicável e os CARTÕES DE RESUMO acendem no hover, como no DRE — passar
// o mouse num deles (ou numa marca) acende aquele tipo no gráfico e apaga o resto; clicar FIXA (clicar de novo solta).
// `useDestaque` dá o tipo em vigor (o do hover, senão o fixado) e as mãos para os dois.
export function useDestaque() {
  const [fixo, setFixo] = useState(null);
  const [previa, setPrevia] = useState(null);
  return {
    atual: previa ?? fixo,
    fixo,
    alternar: (k) => setFixo((f) => (f === k ? null : k)),
    previa: setPrevia,
    limpar: () => { setFixo(null); setPrevia(null); },
  };
}

const Kpi = ({ rotulo, valor, sub, destaque, chave }) => {
  const ligado = destaque && chave && destaque.atual === chave;
  const props = destaque && chave ? {
    onMouseEnter: () => destaque.previa(chave), onMouseLeave: () => destaque.previa(null), onClick: () => destaque.alternar(chave),
    'aria-pressed': destaque.fixo === chave, title: destaque.fixo === chave ? 'Destacado no gráfico · clique para soltar' : 'Destacar no gráfico',
  } : {};
  const Tag = chave && destaque ? 'button' : 'div';
  return (
    <Tag type={Tag === 'button' ? 'button' : undefined} {...props}
      className={`min-w-0 rounded-lg border px-3 py-2.5 text-left transition-[background-color,border-color,box-shadow] duration-150 hover:border-gray-300 hover:bg-hx-eef2f7 hover:shadow-sm ${
        ligado ? 'border-gray-400 bg-hx-eef2f7' : 'border-transparent bg-hx-f6f7f8'}`}>
      <div className={TH}>{rotulo}</div>
      <div className="mt-0.5 truncate text-[17px] font-semibold tabular-nums text-gray-900">{valor}</div>
      <div className="truncate text-[11.5px] text-gray-500">{sub}</div>
    </Tag>
  );
};

// A legenda clicável: `itens` [{ key, rotulo, marca }]; com `destaque`, cada marca acende o seu tipo (hover) e fixa (clique).
export function LegendaClicavel({ itens, destaque, className = '' }) {
  return (
    <div className={`flex flex-wrap items-center gap-x-1 gap-y-1 text-[11.5px] text-gray-500 ${className}`}>
      {itens.map((it) => {
        const ligado = destaque.atual === it.key;
        const apagado = destaque.atual && !ligado;
        return (
          <button key={it.key} type="button" onClick={() => destaque.alternar(it.key)}
            onMouseEnter={() => destaque.previa(it.key)} onMouseLeave={() => destaque.previa(null)}
            aria-pressed={destaque.fixo === it.key} title={destaque.fixo === it.key ? 'Clique para soltar o destaque' : `Destacar: ${it.rotulo}`}
            className={`inline-flex items-center gap-1.5 rounded-[5px] px-1.5 py-0.5 transition-[opacity,background-color,color] duration-150 hover:bg-gray-100 ${
              ligado ? 'bg-gray-100 font-medium text-gray-800' : ''} ${apagado ? 'opacity-50' : ''}`}>
            {it.marca}{it.rotulo}
          </button>
        );
      })}
    </div>
  );
}
const MARCA = {
  faturas: <span className="h-2.5 w-2.5 rounded-[2px] bg-gray-300" />,
  ultima: <span className="h-2.5 w-2.5 rounded-[2px]" style={{ background: 'var(--serie-gastos)' }} />,
  parcelas: <span className="barra-parcelas h-2.5 w-2.5 rounded-[2px]" />,
  media: <span className="w-4 border-t border-dashed border-gray-500" />,
};
export const marcaLegenda = (k) => MARCA[k];

// O que cada destaque acende numa coluna da linha do tempo (as outras ficam apagadas).
const acende = (d, c, ultimaComp, maiorComp) => ({
  faturas: c.tipo === 'fatura' && c.total > 0,
  ultima: c.comp === ultimaComp && c.tipo === 'fatura',
  parcelas: c.tipo === 'parcelas',
  maior: c.comp === maiorComp,
  media: false,
}[d]);

function LinhaDoTempo({ t, ultimaComp, onVerMes, destaque }) {
  const { colunas, anos, resumo } = t;
  const d = destaque.atual;
  const apagada = (c) => d && !acende(d, c, ultimaComp, resumo.maior?.comp);
  const mediaAcesa = d === 'media';
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
            <div className={`pointer-events-none absolute inset-x-0 z-[1] border-t border-dashed transition-colors duration-150 ${mediaAcesa ? 'border-gray-700' : 'border-gray-400'}`}
              style={{ bottom: `calc(${resumo.media / maior} * (100% - 18px))` }}>
              <span className={`absolute -top-[17px] left-0 bg-white pr-1.5 text-[11px] ${mediaAcesa ? 'font-semibold text-gray-800' : 'text-gray-500'}`}>média {numeroK(resumo.media)}</span>
            </div>
          )}
          {colunas.map((c, i) => {
            const futura = c.tipo === 'parcelas';
            const ultima = c.comp === ultimaComp && !futura;
            const hoje = futura && colunas[i - 1]?.tipo === 'fatura';
            return (
              <button key={c.comp} type="button" onMouseMove={balao.aoMover(i)} onClick={() => !futura && c.total && onVerMes(c.comp)}
                aria-label={`${nomeCompetencia(c.comp)}: ${c.total ? formatBRL(c.total) : 'sem fatura'}${futura ? ' em parcelas já compradas' : ''}`}
                className={`flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-[3px] transition-opacity duration-150 ${hoje ? 'ml-[3px] border-l border-dashed border-gray-300 pl-[3px]' : ''} ${!futura && c.total ? 'cursor-pointer' : 'cursor-default'} ${balao.esmaecido(i) || apagada(c) || (mediaAcesa && balao.ativo === null) ? 'opacity-30' : ''}`}>
                <span className={`whitespace-nowrap text-[10.5px] leading-none tabular-nums ${ultima ? 'font-semibold text-gray-800' : futura ? '' : 'text-gray-500'}`}
                  style={futura ? { color: 'var(--serie-gastos)' } : undefined}>
                  {c.total && (!estreito || marcos.has(c.comp) || (d && !apagada(c) && !mediaAcesa)) ? numeroK(c.total) : ''}
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
        <LegendaClicavel destaque={destaque} className="-ml-1.5" itens={[
          { key: 'faturas', rotulo: 'faturas', marca: MARCA.faturas },
          { key: 'ultima', rotulo: 'última', marca: MARCA.ultima },
          ...(resumo.parcelas ? [{ key: 'parcelas', rotulo: 'parcelas já compradas que vêm', marca: MARCA.parcelas }] : []),
          ...(resumo.media != null ? [{ key: 'media', rotulo: 'média no período', marca: MARCA.media }] : []),
        ]} />
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
  const destaque = useDestaque(); // 'a' | 'b' | 'parcelas'
  const d = destaque.atual;
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
                  {[{ v: m.a, cls: 'bg-gray-300', cor: 'text-gray-400', tipo: 'a' }, { v: valorB, cls: futura ? 'barra-parcelas' : '', cor: '', estilo: futura ? null : { background: 'var(--serie-gastos)' }, tipo: futura ? 'parcelas' : 'b' }].map((x, k) => (
                    <span key={k} className={`flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-[3px] transition-opacity duration-150 ${d && d !== x.tipo ? 'opacity-25' : ''}`}>
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
        <LegendaClicavel destaque={destaque} className="-ml-1.5" itens={[
          { key: 'a', rotulo: a, marca: MARCA.faturas },
          { key: 'b', rotulo: b, marca: MARCA.ultima },
          ...(r.meses.some((m) => !m.b && m.bFutura) ? [{ key: 'parcelas', rotulo: `${b} · parcelas que já vêm`, marca: MARCA.parcelas }] : []),
        ]} />
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

// POR CATEGORIA (03/11/2026, ampliado a pedido): as duas listas têm o hover das tabelas. "Onde o cartão vai" ganhou a
// MÉDIA POR FATURA de cada categoria (o total ÷ as faturas do período, a mesma base do número lá de cima) e o clique,
// que filtra as lojas. "Onde mais comprou" mostra TODAS as lojas, com busca e ordem, a categoria, as COMPRAS (não as
// linhas da fatura: as parcelas de uma compra e o IOF contam uma vez — `comprasDaLoja`), o ticket médio e a última;
// clicar na loja abre as compras dela.
const ORDENS_LOJA = [{ value: 'total', label: 'Maior total' }, { value: 'vezes', label: 'Mais compras' }, { value: 'ultima', label: 'Mais recente' }];
const LINHA = 'border-b border-gray-100 transition-colors hover:bg-hx-f9fafb';
function PorCategoria({ dados, periodoTexto, nFaturas }) {
  const [cat, setCat] = useState(null);
  const [busca, setBusca] = useState('');
  const [ordem, setOrdem] = useState('total');
  const [aberta, setAberta] = useState(null);
  const lojas = useMemo(() => {
    if (!dados) return [];
    const t = busca.trim().toLocaleUpperCase('pt-BR');
    const ls = dados.lojas.filter((l) => (!cat || (l.categoriaId ?? 'sem') === cat) && (!t || l.chave.includes(t)));
    const por = { total: (a, b) => b.total - a.total, vezes: (a, b) => b.vezes - a.vezes || b.total - a.total, ultima: (a, b) => String(b.ultima).localeCompare(String(a.ultima)) }[ordem];
    return [...ls].sort(por);
  }, [dados, cat, busca, ordem]);
  if (!dados) return <div className="flex flex-1 items-center justify-center"><Spinner className="h-5 w-5" /></div>;
  const topo = dados.categorias[0]?.total || 1;
  const catPorId = new Map(dados.categorias.map((c) => [c.id, c]));
  const filtro = cat && catPorId.get(cat);
  return (
    <div className="grid min-h-0 flex-1 grid-cols-1 gap-7 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:grid-rows-[minmax(0,1fr)]">
      <div className="flex min-h-0 min-w-0 flex-col">
        <div className="mb-2 flex items-baseline gap-2"><span className={TH}>Onde o cartão vai</span><span className="truncate text-[11.5px] text-gray-400">{periodoTexto} · {formatBRL(dados.total)}</span></div>
        <div className={`grid grid-cols-[minmax(0,1fr)_minmax(40px,90px)_96px_84px_36px] gap-2.5 border-b border-gray-200 pb-1.5 ${TH}`}>
          <span>Categoria</span><span /><span className="text-right">Total</span><span className="text-right" title={`o total ÷ as ${nFaturas} faturas do período`}>Média/fatura</span><span className="text-right">%</span>
        </div>
        <div className="min-h-0 flex-1 overflow-auto [scrollbar-gutter:stable]">
          {dados.categorias.map((c) => (
            <button key={c.id} type="button" onClick={() => setCat(cat === c.id ? null : c.id)} title={`${c.nome}: ${plural(c.qtd, 'lançamento', 'lançamentos')} · clique para ver as lojas dela`}
              className={`grid w-full grid-cols-[minmax(0,1fr)_minmax(40px,90px)_96px_84px_36px] items-center gap-2.5 py-1.5 text-left text-[12.5px] ${LINHA} ${cat === c.id ? 'bg-hx-eef2f7' : ''}`}>
              <span className="flex min-w-0 items-center gap-2"><Bolinha cor={c.cor ?? '#9ca3af'} /><span className={`truncate ${cat === c.id ? 'font-semibold text-gray-900' : 'text-gray-800'}`}>{c.nome}</span></span>
              <span className="h-2 overflow-hidden rounded-full bg-gray-100"><span className="block h-full rounded-full" style={{ width: `${(c.total / topo) * 100}%`, background: c.cor ?? '#9ca3af' }} /></span>
              <span className="text-right tabular-nums text-gray-800">{formatBRL(c.total)}</span>
              <span className="text-right tabular-nums text-gray-600">{nFaturas ? formatBRL(Math.round(c.total / nFaturas)) : '—'}</span>
              <span className="text-right tabular-nums text-gray-500">{dados.total ? Math.round((c.total / dados.total) * 100) : 0}%</span>
            </button>
          ))}
          {!dados.categorias.length && <p className="py-6 text-center text-[12.5px] text-gray-500">Nenhuma compra no período.</p>}
        </div>
      </div>
      <div className="flex min-h-0 min-w-0 flex-col">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <span className={TH}>Onde mais comprou</span>
          <span className="text-[11.5px] text-gray-400">{plural(lojas.length, 'loja', 'lojas')}</span>
          {filtro && (
            <button type="button" onClick={() => setCat(null)} className="inline-flex items-center gap-1.5 rounded-full border border-gray-300 bg-hx-eef2f7 px-2 py-0.5 text-[11.5px] font-medium text-gray-700 hover:bg-gray-100" title="Ver as lojas de todas as categorias">
              <Bolinha cor={filtro.cor ?? '#9ca3af'} />{filtro.nome}<span aria-hidden="true">✕</span>
            </button>
          )}
          <span className="flex-1" />
          <BuscaFaixa className="w-[200px]" placeholder="Buscar loja" value={busca} onChange={(e) => setBusca(e.target.value)} />
          <SelectSimples compacto value={ordem} onChange={setOrdem} opcoes={ORDENS_LOJA} className="w-[140px]" />
        </div>
        <div className={`grid grid-cols-[minmax(0,1fr)_minmax(0,150px)_58px_92px_70px_100px] gap-2.5 border-b border-gray-200 pb-1.5 ${TH}`}>
          <span>Loja</span><span>Categoria</span><span className="text-right">Compras</span><span className="text-right">Ticket médio</span><span className="text-right">Última</span><span className="text-right">Total</span>
        </div>
        <div className="min-h-0 flex-1 overflow-auto [scrollbar-gutter:stable]">
          {lojas.map((l) => {
            const c = catPorId.get(l.categoriaId ?? 'sem');
            const abre = aberta === l.chave;
            return (
              <div key={l.chave} className={abre ? 'bg-hx-f9fafb' : ''}>
                <button type="button" onClick={() => setAberta(abre ? null : l.chave)} aria-expanded={abre}
                  className={`grid w-full grid-cols-[minmax(0,1fr)_minmax(0,150px)_58px_92px_70px_100px] items-center gap-2.5 py-1.5 text-left text-[12.5px] ${LINHA}`}>
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span className={`shrink-0 text-[9px] text-gray-400 transition-transform duration-150 ${abre ? 'rotate-90' : ''}`} aria-hidden="true">▶</span>
                    <span className="truncate font-mono text-[12px] text-gray-800" title={l.nome}>{l.nome}</span>
                    {l.parcelada && <span className="shrink-0 rounded-[4px] bg-gray-100 px-1 text-[10px] font-semibold text-gray-500">parcelada</span>}
                  </span>
                  <span className="flex min-w-0 items-center gap-1.5 text-gray-600"><Bolinha cor={c?.cor ?? '#9ca3af'} /><span className="truncate">{c?.nome ?? 'Sem categoria'}</span></span>
                  <span className="text-right tabular-nums text-gray-600">{l.vezes}×</span>
                  <span className="text-right tabular-nums text-gray-600">{formatBRL(l.ticket)}</span>
                  <span className="text-right tabular-nums text-gray-500">{l.ultima ? formatDate(l.ultima).slice(0, 5) + '/' + String(l.ultima).slice(2, 4) : '—'}</span>
                  <span className="text-right tabular-nums text-gray-900">{formatBRL(l.total)}</span>
                </button>
                {abre && (
                  <div className="border-b border-gray-200 py-1.5 pl-5 pr-1">
                    {l.compras.map((k, i) => (
                      <div key={i} className="grid grid-cols-[76px_minmax(0,1fr)_100px] items-center gap-2.5 py-1 text-[12px] text-gray-600">
                        <span className="tabular-nums">{formatDate(k.data)}</span>
                        <span className="truncate">
                          {k.parcelas ? `parcelas ${k.parcelas.de === k.parcelas.ate ? k.parcelas.de : `${k.parcelas.de} a ${k.parcelas.ate}`} de ${k.parcelas.total} no período` : 'à vista'}
                          {k.iof ? ` · com IOF de ${formatBRL(k.iof)}` : ''}
                        </span>
                        <span className="text-right tabular-nums text-gray-800">{formatBRL(k.total)}</span>
                      </div>
                    ))}
                    {l.iof > 0 && <p className="pt-1 text-[11px] text-gray-400">O IOF vem numa linha à parte na fatura e aqui entra no valor da compra.</p>}
                  </div>
                )}
              </div>
            );
          })}
          {!lojas.length && <p className="py-6 text-center text-[12.5px] text-gray-500">{busca || cat ? 'Nenhuma loja com esse filtro.' : 'Nenhuma compra no período.'}</p>}
        </div>
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
  const [aba, setAbaEstado] = useState('linha');
  const [periodo, setPeriodo] = useState('12');
  const [anoSel, setAnoSel] = useState(null); // o ano do período "Ano" (o menu da própria pílula)
  const [menuAno, setMenuAno] = useState(null);
  const periodosRef = useRef(null);
  const anoAbertoNoClique = useRef(false);
  const destaque = useDestaque(); // o da linha do tempo (a legenda e os cartões de resumo)
  const setAba = (x) => { setAbaEstado(x); destaque.limpar(); };
  const doCartao = useMemo(() => faturas.filter((f) => f.cartao_id === cartaoId), [faturas, cartaoId]);
  const parcelasDoCartao = useMemo(() => parcelas.filter((p) => p.cartao_id === cartaoId), [parcelas, cartaoId]);
  const anos = useMemo(() => anosComFatura(doCartao), [doCartao]);
  // UM ANO (03/11/2026): a pílula "Ano ▾" abre o MENU dos anos com fatura (o `MenuContexto`, como o "Mais ações");
  // escolhido, ela mostra o ano ("2026 ▾"). O mais novo, se o escolhido não é do cartão.
  const anoDoPeriodo = anos.includes(anoSel) ? anoSel : anos[0] ?? hoje.slice(0, 4);
  const periodoConta = periodo === 'ano' ? `ano:${anoDoPeriodo}` : periodo;
  const t = useMemo(() => linhaDoTempo({ faturas: doCartao, parcelas: parcelasDoCartao, periodo: periodoConta, hoje }), [doCartao, parcelasDoCartao, periodoConta, hoje]);
  const cartao = cartoes.find((c) => c.id === cartaoId);
  const comFatura = cartoes.filter((c) => faturas.some((f) => f.cartao_id === c.id));
  const ultimaComp = useMemo(() => {
    const vencidas = doCartao.filter((f) => f.vencimento.slice(0, 10) <= hoje).sort((x, y) => y.vencimento.localeCompare(x.vencimento));
    return vencidas[0]?.competencia ?? null;
  }, [doCartao, hoje]);

  // ANO × ANO: o mais novo com fatura e o anterior a ele.
  const [par, setPar] = useState(null);
  const b = par?.b && anos.includes(par.b) ? par.b : anos[0] ?? hoje.slice(0, 4);
  const a = par?.a && anos.includes(par.a) ? par.a : anos[1] ?? String(Number(b) - 1);
  const opcoesAno = useMemo(() => [...new Set([...anos, a, b])].sort().reverse().map((x) => ({ value: x, label: x })), [anos, a, b]);
  const r = useMemo(() => anoContraAno({ faturas: doCartao, parcelas: parcelasDoCartao, a, b }), [doCartao, parcelasDoCartao, a, b]);

  // POR CATEGORIA: os lançamentos do cartão no período, lidos só quando a aba abre.
  const desde = t.colunas.find((c) => c.tipo === 'fatura')?.comp ?? null;
  const ate = periodo === 'ano' ? t.colunas.filter((c) => c.tipo === 'fatura').pop()?.comp ?? null : null;
  const [cats, setCats] = useState(null);
  const [categorias, setCategorias] = useState(null);
  useEffect(() => {
    if (aba !== 'categorias') return undefined;
    let vivo = true;
    setCats(null);
    (async () => {
      try {
        const [ls, cs] = await Promise.all([listarDoCartao(cartaoId, periodo === 'tudo' ? null : desde, ate), categorias ?? listarCategorias()]);
        if (!vivo) return;
        if (!categorias) setCategorias(cs);
        setCats(porCategoria(ls, cs));
      } catch (err) { if (vivo) { toast.error(err.message); setCats({ total: 0, categorias: [], lojas: [] }); } }
    })();
    return () => { vivo = false; };
  }, [aba, cartaoId, periodo, desde, ate]); // eslint-disable-line react-hooks/exhaustive-deps

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
        { key: 'qtd', label: 'Lançamentos' },
        { key: 'total', label: 'Total', tipo: 'dinheiro', map: (c) => c.total / 100 },
        { key: 'media', label: 'Média por fatura', tipo: 'dinheiro', map: (c) => (t.resumo.faturas ? Math.round(c.total / t.resumo.faturas) / 100 : '') },
      ]);
      exportCsv(`${nome}-lojas`, cats.lojas, [
        { key: 'nome', label: 'Loja' },
        { key: 'vezes', label: 'Compras' },
        { key: 'ticket', label: 'Ticket médio', tipo: 'dinheiro', map: (l) => l.ticket / 100 },
        { key: 'ultima', label: 'Última', tipo: 'data' },
        { key: 'total', label: 'Total', tipo: 'dinheiro', map: (l) => l.total / 100 },
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
  // O clique em "Ano" abre o menu dos anos (de novo com ele aberto, fecha); os outros períodos trocam direto.
  const escolherPeriodo = (k) => {
    if (k !== 'ano') { setPeriodo(k); return; }
    if (anoAbertoNoClique.current || menuAno) { anoAbertoNoClique.current = false; setMenuAno(null); return; }
    const el = [...(periodosRef.current?.querySelectorAll('button') ?? [])].pop();
    const rr = el?.getBoundingClientRect();
    if (!rr) return;
    const nDoAno = (x) => doCartao.filter((f) => f.competencia.startsWith(x)).length;
    setMenuAno({ x: rr.left, y: rr.bottom + 4, titulo: 'Ano', itens: anos.map((x) => ({
      rotulo: x, sub: `${plural(nDoAno(x), 'fatura', 'faturas')}${periodo === 'ano' && x === anoDoPeriodo ? ' · o da tela' : ''}`,
      onEscolher: () => { setAnoSel(x); setPeriodo('ano'); },
    })) });
  };
  const { resumo } = t;
  return (
    <Modal open onClose={onClose} title={`Histórico · ${cartao?.nome ?? ''}`} subtitulo={`vence dia ${cartao?.dia_vencimento ?? '—'} · ${plural(doCartao.length, 'fatura', 'faturas')} no app`}
      acoes={acoes} alturaCheia animarTamanho padding="p-0"
      maxWidth={cheio ? 'max-w-[96vw]' : 'max-w-[min(1280px,95vw)]'} altura={cheio ? 'h-[94vh]' : 'h-[90vh]'}>
      <MenuContexto menu={menuAno} onFechar={() => setMenuAno(null)} />
      <div className="flex h-full min-h-0 flex-col gap-4 px-5 pb-4 pt-4">
        <div className="flex flex-wrap items-center gap-2.5">
          {comFatura.length > 1 && (
            <AbasPilula abas={comFatura.map((c) => ({ key: c.id, label: c.nome }))} valor={cartaoId} onChange={(id) => { setCartaoId(id); setPar(null); }} variante="claro" altura={30} folga={2} />
          )}
          {aba !== 'anos' && (
            <span ref={periodosRef} className="inline-flex" onMouseDown={() => { anoAbertoNoClique.current = !!menuAno; }}>
              <AbasPilula variante="claro" altura={30} folga={2} valor={periodo} onChange={escolherPeriodo}
                abas={PERIODOS.map((p) => (p.value !== 'ano' ? { key: p.value, label: p.label } : {
                  key: 'ano', aria: 'Escolher o ano',
                  label: <span className="inline-flex items-center gap-1.5">{periodo === 'ano' ? anoDoPeriodo : 'Ano'}<IconSeta className={`text-gray-400 transition-transform duration-200 ${menuAno ? 'rotate-180' : ''}`} /></span>,
                }))} />
            </span>
          )}
          <span className="flex-1" />
          <AbasPilula abas={ABAS} valor={aba} onChange={setAba} altura={30} folga={2} />
        </div>
        {aba !== 'anos' && (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {/* Na linha do tempo, cada cartão acende o seu tipo no gráfico; nas outras abas, só o hover. */}
            <Kpi rotulo="No período" valor={formatBRL(resumo.total)} sub={`${plural(resumo.faturas, 'fatura', 'faturas')} · ${plural(resumo.compras, 'lançamento', 'lançamentos')}`}
              destaque={aba === 'linha' ? destaque : null} chave="faturas" />
            <Kpi rotulo="Média por fatura" valor={resumo.media != null ? formatBRL(resumo.media) : '—'} sub={periodoTexto}
              destaque={aba === 'linha' && resumo.media != null ? destaque : null} chave="media" />
            <Kpi rotulo="Maior fatura" valor={resumo.maior ? formatBRL(resumo.maior.total) : '—'} sub={resumo.maior ? competenciaCurta(resumo.maior.comp) : ''}
              destaque={aba === 'linha' && resumo.maior ? destaque : null} chave="maior" />
            <Kpi rotulo="Parcelas que vêm" valor={resumo.parcelas ? formatBRL(resumo.parcelas.total) : '—'} sub={resumo.parcelas ? `até ${competenciaCurta(resumo.parcelas.ate)}` : 'nenhuma'}
              destaque={aba === 'linha' && resumo.parcelas ? destaque : null} chave="parcelas" />
          </div>
        )}
        {aba === 'linha' && <LinhaDoTempo t={t} ultimaComp={ultimaComp} onVerMes={onVerMes} destaque={destaque} />}
        {aba === 'anos' && <AnoContraAno r={r} a={a} b={b} opcoesAno={opcoesAno} setA={(x) => setPar({ a: x, b })} setB={(x) => setPar({ a, b: x })} onVerMes={onVerMes} />}
        {aba === 'categorias' && <PorCategoria key={`${cartaoId}:${periodoConta}`} dados={cats} periodoTexto={periodoTexto} nFaturas={resumo.faturas} />}
        {aba === 'tabela' && <Tabela t={t} ultimaComp={ultimaComp} onVerMes={onVerMes} />}
      </div>
    </Modal>
  );
}
