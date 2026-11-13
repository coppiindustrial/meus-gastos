import { useMemo, useRef, useState } from 'react';
import Tooltip from '../Tooltip.jsx';
import Toggle from '../Toggle.jsx';
import { Trilho as TrilhoFaixa, DivisorFaixa } from '../filtros/FaixaFiltros.jsx';
import BalaoGrafico, { useBalao } from '../graficos/BalaoGrafico.jsx';
import { Etiqueta } from '../Comuns.jsx';
import { CirculoMais, IconAplicar, IconExpandirTudo, IconLapis, IconLixeira, IconResgatar } from '../icons.jsx';
import useLinhasAnimadas, { atributosLinha } from '../../lib/useLinhasAnimadas.js';
import { formatBRL } from '../../lib/dinheiro.js';
import { formatDate } from '../../lib/format.js';
import { lsGet, lsSet } from '../../lib/storage.js';
import { NOME_PROVENTO, nomeDoTipo, precoDaOperacao } from '../../lib/rendaVariavel.js';

// A CARTEIRA DA RENDA VARIÁVEL (13/11/2026, a tabela A do mockup "Renda variável"): a mesma tabela de Investimentos, um nível
// acima. A CLASSE é a faixa (a barra da cor: Exterior, FIIs, Ações da B3) com os totais e a marca do mercado (aberto, com a
// hora da última cotação; fechado; ou âmbar, sem cotação nova há horas). O ATIVO recuado em duas linhas (o ticker e o nome;
// o tipo e quantas operações), e as OPERAÇÕES penduradas no trilho, como os aportes: a compra com o lote de hoje, a venda com
// o lucro, o desdobramento (os proventos não: ficam na coluna deles). Recolhe animado (`useLinhasAnimadas`, lembrado em `rv_fechadas`); no
// trilho do cabeçalho, "Exterior em US$" (o preço na moeda do ativo; `rv_usd`) e os Centavos (`rv_centavos`). As ações da
// linha no quadrado de 30px, só no hover: COMPRAR e VENDER no ativo, EDITAR e EXCLUIR na operação. O balão: na Cotação, o
// dia do ativo; no Resultado do exterior, quanto veio da ação e quanto do dólar.

const COLUNAS = [
  { id: 'nome', rotulo: 'Ativo · operação', esq: true },
  { id: 'qtd', rotulo: 'Qtd', largura: 64, desk: true },
  { id: 'pm', rotulo: 'Preço médio', largura: 124, desk: true },
  { id: 'cot', rotulo: 'Cotação', largura: 120 },
  { id: 'pos', rotulo: 'Posição', largura: 124 },
  { id: 'res', rotulo: 'Resultado', largura: 140 },
  { id: 'prov', rotulo: 'Proventos 12m', largura: 116, desk: true },
  { id: 'peso', rotulo: 'Na carteira', esq: true, largura: 112, desk: true },
];
// as larguras cabem numa tela de 1440 com a barra lateral aberta (a caixa mede ~1100): o nome fica com o resto
const LARGURA_ACOES = 76;
const LARGURA_MINIMA = 1080;
const RECUO_OP = 80;
const lerSet = (k) => { try { return new Set(JSON.parse(lsGet(k) ?? '[]')); } catch { return new Set(); } };
const sinal = (c) => (c > 0 ? '+' : c < 0 ? '−' : '');
const pct = (f, casas = 1) => (f === null || f === undefined || !Number.isFinite(f) ? '—' : `${sinal(f)}${Math.abs(f * 100).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas })}%`);
const corDe = (v) => (v < 0 ? 'text-hx-c0393d' : v > 0 ? 'text-green-700' : 'text-gray-500');
const qtdTexto = (q) => Number(q).toLocaleString('pt-BR', { maximumFractionDigits: 6 });
const moeda = (usd, v, casas = 2) => (v === null || v === undefined ? '—' : `${usd ? 'US$' : 'R$'} ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas })}`);
const hora = (iso) => new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' }).format(new Date(iso));

// o pregão aberto agora? B3 das 10h às 17h de Brasília; Nasdaq das 9h30 às 16h de Nova York (dias úteis; feriado não conta)
function pregaoAberto(mercado, agora = new Date()) {
  const fuso = mercado === 'EUA' ? 'America/New_York' : 'America/Sao_Paulo';
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: fuso, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(agora).map((x) => [x.type, x.value]));
  if (p.weekday === 'Sat' || p.weekday === 'Sun') return false;
  const m = Number(p.hour) * 60 + Number(p.minute);
  return mercado === 'EUA' ? m >= 570 && m < 960 : m >= 600 && m < 1020;
}
// a marca da faixa: aberto com a hora · fechado · âmbar quando a cotação não chega há mais de 1 hora no pregão
function MarcaMercado({ posicoes, mercado }) {
  const lidas = posicoes.map((p) => p.cotacao?.atualizado_em).filter(Boolean).sort();
  const ultima = lidas[lidas.length - 1];
  const aberto = pregaoAberto(mercado);
  const nome = mercado === 'EUA' ? 'Nasdaq' : 'B3';
  if (!ultima) return <Tooltip label="A cotação ainda não chegou: falta publicar a função das cotações?"><span><Etiqueta tom="ambar">sem cotação</Etiqueta></span></Tooltip>;
  const horas = (Date.now() - new Date(ultima).getTime()) / 3600000;
  if (aberto && horas > 1) return <Tooltip label={`${nome} aberta, mas a última cotação é de ${formatDate(ultima.slice(0, 10))} ${hora(ultima)}`}><span><Etiqueta tom="ambar">sem cotação nova há {Math.floor(horas)} h</Etiqueta></span></Tooltip>;
  return (
    <Tooltip label={aberto ? `${nome} aberta · atualiza a cada 15 min no pregão` : `${nome} fechada · a última cotação, de ${formatDate(ultima.slice(0, 10))}`}>
      <span className="inline-flex h-[20px] items-center gap-[5px] rounded-[6px] bg-gray-100 px-1.5 text-[11px] font-semibold text-gray-600">
        <span className={`h-[6px] w-[6px] rounded-full ${aberto ? 'bg-green-600' : 'bg-gray-400'}`} />{aberto ? hora(ultima) : 'fechada'}
      </span>
    </Tooltip>
  );
}

const ACAO_ICONE = 'grid h-[30px] w-[30px] shrink-0 place-items-center rounded-[7px] border border-gray-300 bg-white text-gray-600 transition-colors hover:bg-gray-50 hover:text-gray-900 active:bg-gray-200';
const BotaoLinha = ({ titulo, onClick, children, perigo = false }) => (
  <Tooltip label={titulo}>
    <button type="button" onClick={onClick} aria-label={titulo} className={`${ACAO_ICONE} ${perigo ? 'hover:!text-hx-c0393d' : ''}`}>{children}</button>
  </Tooltip>
);
const IconChevron = ({ aberto }) => (
  <svg viewBox="0 0 24 24" className={`h-[12px] w-[12px] shrink-0 text-gray-500 transition-[transform,color] duration-150 group-hover/seta:text-gray-800 ${aberto ? 'rotate-90' : ''}`} fill="none"
    stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
);
const Seta = ({ aberto, onClick, rotulo }) => (
  <button type="button" onClick={onClick} aria-expanded={aberto} aria-label={rotulo}
    className="group/seta flex h-[20px] w-[20px] shrink-0 items-center justify-center rounded-[4px] transition-colors hover:bg-gray-200"><IconChevron aberto={aberto} /></button>
);
const Trilho = ({ ultimo }) => (
  <>
    <span aria-hidden="true" className={`pointer-events-none absolute left-[40px] top-0 w-px bg-gray-300 ${ultimo ? 'h-1/2' : 'bottom-0'}`} />
    <span aria-hidden="true" className="pointer-events-none absolute left-[40px] top-1/2 h-px w-[30px] bg-gray-300" />
  </>
);
const Barrinha = ({ fracao, cor }) => (
  <span className="inline-flex items-center gap-1.5 tabular-nums">
    <span className="inline-block h-[5px] w-[44px] overflow-hidden rounded-full bg-gray-200"><span className="block h-full rounded-full" style={{ width: `${Math.min(100, Math.max(0, fracao * 100))}%`, background: cor }} /></span>
    {(fracao * 100).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%
  </span>
);

export default function TabelaRendaVariavel({ carteira, hoje, dolar, movel, acoes, inicio }) {
  const [centavos, setCentavosEstado] = useState(() => lsGet('rv_centavos') === '1');
  const setCentavos = (v) => { lsSet('rv_centavos', v ? '1' : '0'); setCentavosEstado(v); };
  const [emUsd, setEmUsdEstado] = useState(() => lsGet('rv_usd') !== '0');
  const setEmUsd = (v) => { lsSet('rv_usd', v ? '1' : '0'); setEmUsdEstado(v); };
  const reais = (c) => (centavos ? formatBRL(c) : `R$ ${Math.round(c / 100).toLocaleString('pt-BR')}`);
  const [fechadas, setFechadasEstado] = useState(() => lerSet('rv_fechadas'));
  const setFechadas = (f) => setFechadasEstado((antes) => { const n = f(antes); lsSet('rv_fechadas', JSON.stringify([...n])); return n; });
  const alternar = (id) => setFechadas((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const [sobLinha, setSobLinha] = useState(null);
  const balao = useBalao(290, 170);
  const caixaRef = useRef(null);
  const { grupos, total } = carteira;
  const temUsd = grupos.some((g) => g.posicoes.some((p) => p.usd));
  // o preço na moeda do ativo, ou em reais (pelo dólar de hoje)
  const preco = (p, v) => (p.usd && !emUsd ? moeda(false, v === null ? null : v * (dolar ?? 0)) : moeda(p.usd, v));

  const todas = useMemo(() => {
    const out = [];
    grupos.forEach((g) => {
      const gid = `g:${g.classe.id}`;
      out.push({ id: gid, tipo: 'grupo', g });
      if (!g.posicoes.length && acoes) out.push({ id: `v:${g.classe.id}`, tipo: 'vazio', g, pai: gid });
      g.posicoes.forEach((p) => {
        const iid = `i:${p.ativo.id}`;
        out.push({ id: iid, tipo: 'ativo', g, p, pai: gid });
        // a mais nova em cima; os PROVENTOS não entram no trilho (um FII paga todo mês: viravam dezenas de linhas) — moram na
        // coluna "Proventos 12m", na aba Operações e no bloco do Patrimônio
        const linhas = p.linhas.filter((l) => l.op.tipo !== 'provento').reverse();
        linhas.forEach((l, k) => out.push({ id: `o:${l.op.id}`, tipo: 'op', g, p, l, pai: gid, avo: iid, ultimo: !acoes && k === linhas.length - 1 }));
        if (acoes) out.push({ id: `n:${p.ativo.id}`, tipo: 'novo', g, p, pai: gid, avo: iid });
      });
    });
    return out;
  }, [grupos, acoes]);
  const visiveis = useMemo(() => todas.filter((l) => (!l.pai || !fechadas.has(l.pai)) && (!l.avo || !fechadas.has(l.avo))), [todas, fechadas]);
  const desenhadas = useLinhasAnimadas(todas, visiveis, caixaRef);
  const recolhiveis = grupos.map((g) => `g:${g.classe.id}`);
  const tudoFechado = recolhiveis.every((id) => fechadas.has(id));

  const th0 = 'sticky top-0 z-20 whitespace-nowrap border-b border-gray-200 bg-hx-f9fafb px-3 py-2 text-[10.5px] font-semibold uppercase tracking-wide text-gray-500';
  const desk = (c) => (c.desk && movel ? 'hidden' : '');
  const aceso = (id) => (sobLinha === id ? 'gm-acesa' : '');
  const numTd = 'px-3 text-right tabular-nums';
  const peso = (v) => (total.valor > 0 ? v / total.valor : 0);
  const acoesTd = (cls, filhos) => (!movel && (
    <td className={cls}>{filhos && <span className="flex justify-end gap-1 opacity-0 transition-opacity group-hover/linha:opacity-100 focus-within:opacity-100">{filhos}</span>}</td>
  ));

  // O BALÃO: o dia do ativo (na Cotação) ou de onde veio o resultado (no exterior)
  const info = (() => {
    const a = balao.ativo;
    if (!a) return null;
    const l = todas.find((x) => x.id === a.id);
    if (!l?.p) return null;
    const { p } = l;
    const c = p.cotacao;
    if (a.col === 'cot') {
      if (!c) return { titulo: p.ativo.ticker, itens: [{ rotulo: 'Sem cotação', valor: '—' }], nota: `Vale pelo preço da última operação (${moeda(p.usd, p.preco)}) até a cotação chegar.` };
      const v = (x) => moeda(p.usd, x === null || x === undefined ? null : Number(x));
      return {
        titulo: `${p.ativo.ticker} · ${p.ativo.mercado === 'EUA' ? 'Nasdaq' : 'B3'} · ${formatDate(c.cotado_em.slice(0, 10))} ${hora(c.cotado_em)}`,
        itens: [
          { rotulo: 'Abertura', valor: v(c.abertura) }, { rotulo: 'Máxima', valor: v(c.maxima) }, { rotulo: 'Mínima', valor: v(c.minima) },
          { rotulo: 'Fechamento anterior', valor: v(c.fechamento_anterior) },
          { rotulo: 'Agora', valor: `${v(c.preco)} · ${pct(p.variacaoDia, 2)}`, cor: (p.variacaoDia ?? 0) >= 0 ? 'var(--serie-entradas)' : '#c0393d' },
        ],
        nota: `A cotação chega a cada 15 minutos no pregão (${c.fonte === 'finnhub' ? 'Finnhub' : 'brapi'}).${p.usd ? ` Em reais, pelo dólar de agora (${(dolar ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 4 })}).` : ''}`,
      };
    }
    if (a.col === 'res' && p.usd) {
      return {
        titulo: `${p.ativo.ticker} · de onde veio o resultado`,
        itens: [
          { rotulo: 'Na ação, em dólar', valor: pct(p.resMoedaPct), cor: 'var(--serie-gastos)' },
          { rotulo: `No dólar (${(p.custoReais / p.custoMoeda).toLocaleString('pt-BR', { minimumFractionDigits: 4, maximumFractionDigits: 4 })} → ${(dolar ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 4, maximumFractionDigits: 4 })})`, valor: pct(p.cambio), cor: 'var(--serie-sobrou)' },
          { rotulo: 'Resultado em reais', valor: `${sinal(p.resultado)}${formatBRL(Math.abs(p.resultado))} · ${pct(p.resPct)}` },
        ],
        nota: 'O custo em reais vai pelo dólar de cada compra (a conta do IR): por isso o dólar subir também conta como ganho.',
      };
    }
    return null;
  })();
  const mover = (id, col) => (e) => balao.aoMover({ id, col })(e);

  const linha = ({ linha: l, estado }) => {
    const attrs = atributosLinha(l.id, estado);
    if (l.tipo === 'grupo') {
      const { g } = l;
      const aberto = !fechadas.has(l.id);
      const faixa = `border-b border-gray-200 bg-hx-f3f4f6 ${aceso(l.id)}`;
      const n = g.posicoes.length;
      return (
        <tr key={l.id} {...attrs} className="group/linha" onMouseEnter={() => setSobLinha(l.id)}>
          <td className={`relative h-[46px] cursor-pointer pl-3 pr-3 ${faixa}`} onClick={() => alternar(l.id)}>
            <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-0 w-[3px]" style={{ background: g.classe.cor }} />
            <span className="flex items-center gap-2">
              <Seta aberto={aberto} onClick={(e) => { e.stopPropagation(); alternar(l.id); }} rotulo={aberto ? `Recolher ${g.classe.nome}` : `Abrir ${g.classe.nome}`} />
              <span className="truncate text-[14px] font-semibold text-gray-900">{g.classe.nome}</span>
              <span className="shrink-0 text-[11.5px] font-normal text-gray-500">{n ? `${n} ${n === 1 ? 'ativo' : 'ativos'} · ${g.classe.moeda === 'USD' ? 'US$' : 'R$'}` : 'nenhum ativo'}</span>
            </span>
          </td>
          <td className={`${faixa} ${movel ? 'hidden' : ''}`} />
          <td className={`${faixa} ${movel ? 'hidden' : ''}`} />
          <td className={`${faixa} px-3 text-right`}>{n > 0 && <MarcaMercado posicoes={g.posicoes} mercado={g.classe.mercado} />}</td>
          <td className={`${faixa} ${numTd} text-[13.5px] font-semibold text-gray-900`}>{n ? reais(g.totais.valor) : ''}</td>
          <td className={`${faixa} ${numTd} font-semibold`}>{n ? <span className={corDe(g.totais.resultado)}>{sinal(g.totais.resultado)}{reais(Math.abs(g.totais.resultado))}</span> : ''}</td>
          <td className={`${faixa} ${numTd} font-semibold text-gray-700 ${movel ? 'hidden' : ''}`}>{g.totais.proventos ? reais(g.totais.proventos) : ''}</td>
          <td className={`${faixa} px-3 font-semibold text-gray-700 ${movel ? 'hidden' : ''}`}>{n ? <Barrinha fracao={peso(g.totais.valor)} cor={g.classe.cor} /> : ''}</td>
          {acoesTd(faixa)}
        </tr>
      );
    }
    if (l.tipo === 'vazio') {
      return (
        <tr key={l.id} {...attrs} className="group/add">
          <td colSpan={9} className="h-[34px] cursor-pointer border-b border-gray-100 py-0 pl-[30px] pr-3 text-[12.5px]" onClick={() => acoes.novoAtivo(l.g.classe.id)}>
            <span className="flex items-center gap-2 font-medium text-gray-500 transition-colors group-hover/add:text-gray-800"><CirculoMais borda="text-gray-400" />{l.g.classe.id === 'b3' ? 'a primeira ação da B3' : l.g.classe.id === 'fii' ? 'o primeiro FII' : 'o primeiro ativo do exterior'}</span>
          </td>
        </tr>
      );
    }
    if (l.tipo === 'ativo') {
      const { p, g } = l;
      const aberto = !fechadas.has(l.id);
      const td = `border-b border-gray-100 py-2 ${aceso(l.id)}`;
      const nOps = p.linhas.filter((x) => x.op.tipo !== 'provento').length;
      const temCorpo = nOps > 0 || !!acoes;
      return (
        <tr key={l.id} {...attrs} className="group/linha" onMouseEnter={() => setSobLinha(l.id)}>
          <td className={`relative pl-[30px] pr-3 ${td}`}>
            {temCorpo && aberto && <span aria-hidden="true" className="pointer-events-none absolute bottom-0 left-[40px] top-[30px] w-px bg-gray-300" />}
            <span className="flex items-start gap-1.5">
              {temCorpo ? <span className="mt-px"><Seta aberto={aberto} onClick={() => alternar(l.id)} rotulo={aberto ? `Fechar as operações de ${p.ativo.ticker}` : `Abrir as operações de ${p.ativo.ticker}`} /></span> : <span className="w-[20px] shrink-0" />}
              <span className="block min-w-0">
                <span className="flex items-center gap-1.5 text-[13px] font-medium text-gray-800">
                  <span className="truncate"><b className="font-semibold text-gray-900">{p.ativo.ticker}</b>{p.ativo.nome ? ` · ${p.ativo.nome}` : ''}</span>
                  {!nOps && <span className="shrink-0"><Etiqueta tom="ambar">sem operação</Etiqueta></span>}
                </span>
                <span className="block truncate text-[11.5px] text-gray-500">{nomeDoTipo(p.ativo.tipo)} · {p.ativo.mercado === 'EUA' ? 'EUA' : 'B3'}{p.ativo.corretora ? ` · ${p.ativo.corretora}` : ''}{nOps ? ` · ${nOps} ${nOps === 1 ? 'operação' : 'operações'}` : ''}</span>
              </span>
            </span>
          </td>
          <td className={`${td} ${numTd} text-gray-700 ${movel ? 'hidden' : ''}`}>{p.quantidade ? qtdTexto(p.quantidade) : '—'}</td>
          <td className={`${td} ${numTd} text-gray-700 ${movel ? 'hidden' : ''}`}>
            {preco(p, p.precoMedio)}
            {p.usd && p.custoMedioReais && <span className="block text-[11px] text-gray-400">{formatBRL(Math.round(p.custoMedioReais * 100))}</span>}
          </td>
          <td className={`${td} ${numTd} cursor-help`} onMouseMove={mover(l.id, 'cot')} onMouseLeave={balao.aoSair}>
            <span className={`underline decoration-gray-300 decoration-dotted underline-offset-[3px] ${p.semCotacao ? 'text-gray-400' : 'text-gray-800'}`}>{preco(p, p.preco)}</span>
            <span className={`block text-[11px] ${p.semCotacao ? 'text-amber-700' : corDe(p.variacaoDia ?? 0)}`}>{p.semCotacao ? 'sem cotação' : `${pct(p.variacaoDia, 2)} no dia`}</span>
          </td>
          <td className={`${td} ${numTd} font-semibold text-gray-900`}>
            {p.quantidade ? reais(p.valorReais) : <span className="font-normal text-gray-400">—</span>}
            {p.usd && p.quantidade > 0 && <span className="block text-[11px] font-normal text-gray-400">{moeda(true, p.valorMoeda / 100)}</span>}
          </td>
          <td className={`${td} ${numTd} ${p.usd ? 'cursor-help' : ''}`} onMouseMove={p.usd ? mover(l.id, 'res') : undefined} onMouseLeave={p.usd ? balao.aoSair : undefined}>
            {p.quantidade ? (<>
              <span className={`${corDe(p.resultado)} ${p.usd ? 'underline decoration-gray-300 decoration-dotted underline-offset-[3px]' : ''}`}>{sinal(p.resultado)}{reais(Math.abs(p.resultado))}</span>
              <span className="block text-[11.5px] text-gray-500">{pct(p.resPct)}{p.usd ? ' · câmbio' : ''}</span>
            </>) : null}
          </td>
          <td className={`${td} ${numTd} text-gray-700 ${movel ? 'hidden' : ''}`}>
            {p.proventos12 ? (<>{reais(p.proventos12)}<span className="block text-[11px] text-gray-400">{p.usd ? 'líquido' : `${((p.proventos12 / p.custoReais) * 100).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}% do custo`}</span></>) : <span className="text-gray-400">—</span>}
          </td>
          <td className={`${td} px-3 text-gray-700 ${movel ? 'hidden' : ''}`}>{p.quantidade ? <Barrinha fracao={peso(p.valorReais)} cor={g.classe.cor} /> : null}</td>
          {acoesTd(`${td} px-2`, acoes && (
            <>
              <BotaoLinha titulo={`Comprar ${p.ativo.ticker}`} onClick={() => acoes.operar(p.ativo, 'compra')}><IconAplicar /></BotaoLinha>
              {p.quantidade > 0 && <BotaoLinha titulo={`Vender ${p.ativo.ticker}`} onClick={() => acoes.operar(p.ativo, 'venda')}><IconResgatar /></BotaoLinha>}
            </>
          ))}
        </tr>
      );
    }
    if (l.tipo === 'op') {
      const { p, l: { op, lote, recebido, lucro, liquidoReais } } = l;
      const td = `h-[38px] border-b border-gray-100 py-1 text-[12.5px] ${aceso(l.id)}`;
      const dias = Math.max(0, Math.round((new Date(`${hoje}T12:00:00Z`) - new Date(`${op.data}T12:00:00Z`)) / 86400000));
      const futuro = op.data > hoje;
      const desc = op.tipo === 'compra' ? `compra · ${qtdTexto(op.quantidade)} ${Number(op.quantidade) === 1 ? 'cota' : 'cotas'} · ${dias} ${dias === 1 ? 'dia' : 'dias'}`
        : op.tipo === 'venda' ? `venda · ${qtdTexto(op.quantidade)} ${Number(op.quantidade) === 1 ? 'cota' : 'cotas'}`
        : op.tipo === 'provento' ? (NOME_PROVENTO[op.provento] ?? 'provento').toLowerCase()
        : `${op.tipo} · 1 para ${Number(op.fator).toLocaleString('pt-BR', { maximumFractionDigits: 4 })}`;
      const pOp = precoDaOperacao(op);
      return (
        <tr key={l.id} {...attrs} className="group/linha" onMouseEnter={() => setSobLinha(l.id)}>
          <td className={`relative pr-3 ${td}`}>
            <Trilho ultimo={l.ultimo} />
            <span className="flex flex-wrap items-baseline gap-x-2" style={{ paddingLeft: movel ? 56 : RECUO_OP }}>
              <span className="tabular-nums text-gray-700">{formatDate(op.data)}</span>
              <span className="text-[11.5px] text-gray-400">{desc}</span>
              {futuro && op.tipo === 'provento' && <span className="self-center"><Etiqueta tom="ambar">a receber</Etiqueta></span>}
            </span>
          </td>
          <td className={`${td} ${numTd} text-gray-700 ${movel ? 'hidden' : ''}`}>{op.quantidade ? qtdTexto(op.quantidade) : ''}</td>
          <td className={`${td} ${numTd} text-gray-700 ${movel ? 'hidden' : ''}`}>
            {pOp !== null && (p.usd && !emUsd ? moeda(false, pOp * Number(op.dolar ?? dolar ?? 0)) : moeda(p.usd, pOp))}
            {p.usd && op.dolar && op.tipo !== 'desdobramento' && op.tipo !== 'grupamento' && <span className="block text-[11px] text-gray-400">dólar {Number(op.dolar).toLocaleString('pt-BR', { minimumFractionDigits: 4 })}</span>}
          </td>
          <td className={td} />
          <td className={`${td} ${numTd} text-gray-700`}>
            {lote ? reais(lote.valor) : op.tipo === 'venda' ? <span className="text-gray-500">recebeu {reais(recebido)}</span> : null}
          </td>
          <td className={`${td} ${numTd}`}>
            {lote ? <><span className={corDe(lote.resultado)}>{sinal(lote.resultado)}{reais(Math.abs(lote.resultado))}</span></> : op.tipo === 'venda' ? <span className={corDe(lucro)}>{sinal(lucro)}{reais(Math.abs(lucro))}<span className="block text-[11px] text-gray-400">realizado</span></span> : null}
          </td>
          <td className={`${td} ${numTd} ${movel ? 'hidden' : ''}`}>
            {op.tipo === 'provento' && <span className={futuro ? 'text-amber-700' : 'text-green-700'}>+{reais(liquidoReais)}{Number(op.retido_centavos) > 0 && <span className="block text-[11px] text-gray-400">retido {moeda(p.usd, Number(op.retido_centavos) / 100)}</span>}</span>}
          </td>
          <td className={`${td} ${movel ? 'hidden' : ''}`} />
          {acoesTd(`${td} px-2`, acoes && (
            <>
              <BotaoLinha titulo="Editar a operação" onClick={() => acoes.editar(p.ativo, op)}><IconLapis className="h-[14px] w-[14px]" /></BotaoLinha>
              <BotaoLinha titulo="Excluir a operação" perigo onClick={() => acoes.excluir(p.ativo, op)}><IconLixeira className="h-[14px] w-[14px]" /></BotaoLinha>
            </>
          ))}
        </tr>
      );
    }
    // a linha de acrescentar
    return (
      <tr key={l.id} {...attrs} className="group/add">
        <td colSpan={9} className="relative h-[34px] cursor-pointer border-b border-gray-100 py-0 pr-3 text-[12.5px]" onClick={() => acoes.operar(l.p.ativo, 'compra')}>
          <Trilho ultimo />
          <span className="flex items-center gap-2 font-medium text-gray-500 transition-colors group-hover/add:text-gray-800" style={{ paddingLeft: RECUO_OP - 4 }}>
            <CirculoMais borda="text-gray-400" />operação em {l.p.ativo.ticker}
          </span>
        </td>
      </tr>
    );
  };

  const nAtivos = grupos.reduce((s, g) => s + g.posicoes.length, 0);
  return (
    <>
      <div className="flex shrink-0 flex-wrap items-center gap-2.5 px-4 pb-2.5 pt-3">
        {inicio}
        <span className="text-[11.5px] text-gray-400">{nAtivos} {nAtivos === 1 ? 'ativo' : 'ativos'} · a cotação é a última do pregão</span>
        <span className="flex-1" />
        {!movel && (
          <TrilhoFaixa className="shrink-0">
            {temUsd && (<>
              <span className="flex h-[24px] items-center gap-2 px-2">
                <button type="button" tabIndex={-1} aria-hidden="true" onClick={() => setEmUsd(!emUsd)} className="whitespace-nowrap text-[12px] font-medium text-gray-600">Exterior em US$</button>
                <Toggle compacto rotulo="Mostrar os preços do exterior em dólar" checked={emUsd} onChange={setEmUsd} />
              </span>
              <DivisorFaixa />
            </>)}
            <span className="flex h-[24px] items-center gap-2 px-2">
              <button type="button" tabIndex={-1} aria-hidden="true" onClick={() => setCentavos(!centavos)} className="whitespace-nowrap text-[12px] font-medium text-gray-600">Centavos</button>
              <Toggle compacto rotulo="Mostrar os centavos nos valores" checked={centavos} onChange={setCentavos} />
            </span>
          </TrilhoFaixa>
        )}
        {!movel && (
          <Tooltip label={tudoFechado ? 'Expandir tudo' : 'Recolher tudo'}>
            <button type="button" aria-label={tudoFechado ? 'Expandir tudo' : 'Recolher tudo'}
              className="inline-flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[6px] text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900"
              onClick={() => setFechadas(() => (tudoFechado ? new Set() : new Set(todas.filter((x) => x.tipo === 'grupo' || x.tipo === 'ativo').map((x) => x.id))))}>
              <IconExpandirTudo fechar={!tudoFechado} />
            </button>
          </Tooltip>
        )}
      </div>
      <div ref={caixaRef} className="min-h-0 overflow-x-auto" onMouseLeave={() => { balao.aoSair(); setSobLinha(null); }}>
        <table className={`w-full border-separate border-spacing-0 text-[13px] ${movel ? '' : 'table-fixed'}`} style={{ minWidth: movel ? 0 : LARGURA_MINIMA }}>
          {!movel && (
            <colgroup>
              {COLUNAS.map((c) => <col key={c.id} style={c.largura ? { width: c.largura } : undefined} />)}
              <col style={{ width: LARGURA_ACOES }} />
            </colgroup>
          )}
          <thead><tr>
            {COLUNAS.map((c) => <th key={c.id} className={`${th0} ${c.esq ? 'text-left' : 'text-right'} ${desk(c)}`}>{c.rotulo}</th>)}
            {!movel && <th className={th0} aria-label="Ações" />}
          </tr></thead>
          <tbody>
            {desenhadas.map(linha)}
            <tr data-segue="" className="font-semibold">
              <td className="h-10 border-t border-gray-200 bg-hx-f9fafb px-3 text-gray-800">Total</td>
              <td className={`border-t border-gray-200 bg-hx-f9fafb ${movel ? 'hidden' : ''}`} />
              <td className={`border-t border-gray-200 bg-hx-f9fafb ${movel ? 'hidden' : ''}`} />
              <td className="border-t border-gray-200 bg-hx-f9fafb" />
              <td className={`border-t border-gray-200 bg-hx-f9fafb ${numTd} text-gray-900`}>{reais(total.valor)}</td>
              <td className={`border-t border-gray-200 bg-hx-f9fafb ${numTd}`}>
                <span className={corDe(total.resultado)}>{sinal(total.resultado)}{reais(Math.abs(total.resultado))}</span>
                <span className="block text-[11.5px] font-normal text-gray-500">{pct(total.resPct)}</span>
              </td>
              <td className={`border-t border-gray-200 bg-hx-f9fafb ${numTd} text-gray-700 ${movel ? 'hidden' : ''}`}>{total.proventos ? reais(total.proventos) : '—'}</td>
              <td className={`border-t border-gray-200 bg-hx-f9fafb px-3 text-gray-700 ${movel ? 'hidden' : ''}`}>{total.valor ? '100%' : ''}</td>
              {!movel && <td className="border-t border-gray-200 bg-hx-f9fafb" />}
            </tr>
          </tbody>
        </table>
      </div>
      {!movel && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-gray-100 bg-hx-fafbfc px-4 py-2 text-[11.5px] text-gray-500">
          <span>Passe o mouse na <b className="font-semibold text-gray-700">Cotação</b> para ver o dia do ativo{temUsd ? <>, e no <b className="font-semibold text-gray-700">Resultado</b> do exterior para ver quanto veio da ação e quanto do dólar</> : ''}.</span>
        </div>
      )}
      {info && <BalaoGrafico pos={balao.pos} largura={290} titulo={info.titulo} itens={info.itens} nota={info.nota} />}
    </>
  );
}
