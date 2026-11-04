import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { useNoCelular, useSlotTopo } from '../lib/celular.js';
import PainelMovel from '../components/movel/PainelMovel.jsx';
import FiltrosMovel, { Pilula } from '../components/movel/FiltrosMovel.jsx';
import { PERIODOS_FIXOS } from '../lib/periodo.js';
import CabecalhoPagina from '../components/CabecalhoPagina.jsx';
import ListaVazia from '../components/ListaVazia.jsx';
import Tooltip from '../components/Tooltip.jsx';
import MenuContexto from '../components/MenuContexto.jsx';
import { IconMais, IconSeta } from '../components/icons.jsx';
import { PageLoading } from '../components/Spinner.jsx';
import { Bolinha } from '../components/Comuns.jsx';
import { DivisorFaixa, FaixaProvider, LimparFiltros, Trilho } from '../components/filtros/FaixaFiltros.jsx';
import { BuscaFaixa, SegMulti, SegPeriodo, SegUnico } from '../components/filtros/Segmentos.jsx';
import GradeLancamentos from '../components/planilha/GradeLancamentos.jsx';
import CartoesResumo from '../components/graficos/CartoesResumo.jsx';
import ModalLancamento from './ModalLancamento.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { listarDoMes, listarPeriodo } from '../api/lancamentos.js';
import { listarResumoMensal } from '../api/resumo.js';
import { listarCartoes, listarCategorias } from '../api/cadastros.js';
import { brlCurto, formatBRL } from '../lib/dinheiro.js';
import { addMeses, competenciaAtual, competenciaCurta, formatDate, nomeCompetencia } from '../lib/format.js';
import { ORIGENS, ordenarLinhas, proximaOrdem, textoOrigem } from '../lib/planilha.js';
import { lsGet, lsSet } from '../lib/storage.js';
import { exportCsv } from '../lib/exportCsv.js';
import { mesesAte } from '../lib/resumo.js';
import { filtrar, resumoPeriodo } from '../lib/visaoGeral.js';
import { anosComDado, gruposPorMes, limitesDoPeriodo, mesDaLinhaNova, rotuloPeriodo } from '../lib/periodo.js';
import { casaTermo, outrosMeses } from '../lib/buscaLancamentos.js';
import useIndiceBusca from '../lib/useIndiceBusca.js';

const OPCOES_TIPO = [{ value: '', label: 'Todos' }, { value: 'saida', label: 'Gastos' }, { value: 'entrada', label: 'Entradas' }];
const OPCOES_ORIGEM = Object.entries(ORIGENS).map(([value, label]) => ({ value, label }));
const OPCOES_REVISAR = [{ value: '', label: 'Todos' }, { value: 'sim', label: 'Só os a revisar', chip: 'A revisar' }];
const LS_MES = 'lancamentos_mes';
const LS_ORDEM = 'lancamentos_ordem';
// AMPLIAR A TABELA (03/11/2026, opção A do mockup "Lançamentos · ampliar a tabela"): o ⤢ do grupo do cabeçalho
// esconde os cartões do resumo e a grade desce até o fim da janela; o ⤡ volta. Lembrado no navegador.
const LS_AMPLIADA = 'lancamentos_ampliada';
const IcoAmpliar = ({ reduzir }) => (
  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
    <path d={reduzir ? 'M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7' : 'M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7'} />
  </svg>
);
const lerOrdem = () => { try { return JSON.parse(lsGet(LS_ORDEM)) || null; } catch { return null; } };

// A ORDEM DA GRADE: a escolhida no cabeçalho (a seta de cada coluna; `ordenarLinhas`) ou a padrão — a data mais
// nova em cima (num período, o mês mais novo em cima). Ela é aplicada ao CARREGAR e ao CLICAR, e não se refaz
// sozinha depois (uma planilha não pula linhas enquanto se digita: corrigir um valor não manda a linha para outro lugar).
//
// O PERÍODO (04/11/2026, opção C do mockup "Lançamentos · procurar em todos os meses"): a pílula do mês também
// escolhe 3 / 12 meses, um ano ou o histórico (`SegPeriodo`, `lib/periodo.js`). Num período a grade agrupa por mês
// (a faixa presa com o mês e o quanto, e "Abrir o mês"), os cartões de cima somam o período e a linha nova entra em
// `mesDaLinhaNova`. Não é lembrado: a tela abre sempre no mês. O AVISO DOS OUTROS MESES (a opção B): com algo na
// busca, o que casa FORA do período, por mês (`outrosMeses`, sobre o índice de `useIndiceBusca`); o chip leva ao mês
// com a linha acesa. A BUSCA RÁPIDA (Ctrl+K, a opção D) abre esta tela pelo endereço: ?mes=&id= (a linha acesa),
// ?periodo=&busca= ou ?periodo=&cat= — lidos uma vez e tirados do endereço.

const Valor = ({ l }) => (
  <span className={`tabular-nums ${l.tipo === 'entrada' ? 'font-semibold text-green-700' : 'text-gray-800'}`}>
    {l.tipo === 'entrada' ? '+' : '−'} {formatBRL(l.valor_centavos)}
  </span>
);

// "Mais N em outros meses": um chip por mês (os 8 mais novos), e o histórico inteiro.
function AvisoOutrosMeses({ busca, indice, outros, rotulo, onMes, onTudo }) {
  if (!indice) return <p className="mt-2 text-[12px] text-gray-400">Procurando “{busca.trim()}” nos outros meses…</p>;
  if (!outros.total) return <p className="mt-2 text-[12px] text-gray-400">Só {rotulo}: nenhum outro mês tem “{busca.trim()}”.</p>;
  const vistos = outros.meses.slice(0, 8);
  const resto = outros.meses.length - vistos.length;
  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5 rounded-md border border-dashed border-gray-300 bg-white px-2.5 py-1.5 text-[12px] text-gray-600">
      <span>Mais <b className="font-semibold tabular-nums text-gray-900">{outros.total}</b> em outros meses:</span>
      {vistos.map((m) => (
        <button key={m.competencia} type="button" onClick={() => onMes(m.competencia)} title={`Abrir ${nomeCompetencia(m.competencia).toLowerCase()}`}
          className="rounded-full border border-gray-300 bg-gray-50 px-2 py-px text-[11.5px] tabular-nums text-gray-700 transition-colors hover:border-gray-400 hover:bg-gray-100 hover:text-gray-900">
          {competenciaCurta(m.competencia)}{m.n > 1 && <span className="text-gray-400"> · {m.n}</span>}
        </button>
      ))}
      {resto > 0 && <span className="text-gray-400">+{resto} {resto === 1 ? 'mês' : 'meses'}</span>}
      <button type="button" onClick={onTudo} className="ml-auto rounded px-1.5 py-0.5 font-medium text-gray-700 transition-colors hover:bg-gray-100 hover:text-gray-900">
        Ver em todo o histórico ›
      </button>
    </div>
  );
}

// ------------------------------------------------------------ o celular (só para ver, 04/11/2026)
// O mockup "Meus Gastos no celular": o mês na segunda linha do topo (‹ chip ›, o chip escolhe o mês ou um período), a
// busca em 16px (o iPhone não dá zoom), três números do período, a lista POR DIA (no mês) ou POR MÊS (num período) e,
// ao tocar, a FICHA do lançamento numa folha — só leitura. Sem "+ Novo" e sem a grade.
const diaSemana = (d) => ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'][new Date(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10))).getDay()];
const MESES_ABREV = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const tituloDia = (d) => `${d.slice(8, 10)} ${MESES_ABREV[Number(d.slice(5, 7)) - 1]} · ${diaSemana(d)}`;

function FichaMovel({ l, onFechar }) {
  const linha = (rot, val) => val ? <><div className="py-[10px] text-gray-500">{rot}</div><div className="min-w-0 break-words py-[10px] text-gray-900">{val}</div></> : null;
  return (
    <PainelMovel aberto={!!l} onFechar={onFechar} lado="baixo" rotulo="Lançamento" className="flex flex-col bg-white px-4 pt-2 shadow-xl">
      {l && (
        <>
          <div className="flex items-center gap-2 text-[12.5px] text-gray-500">
            <Bolinha cor={l.categoria?.grupo?.cor} />{l.categoria?.nome ?? 'Sem categoria'}{l.categoria?.grupo?.nome && <span className="text-gray-400">· {l.categoria.grupo.nome}</span>}
          </div>
          <div className="mt-0.5 text-[17px] font-bold text-gray-900">{l.descricao || '—'}</div>
          <div className={`mt-0.5 text-[26px] font-bold tabular-nums tracking-[-0.02em] ${l.tipo === 'entrada' ? 'text-green-700' : 'text-gray-900'}`}>
            {l.tipo === 'entrada' ? '+ ' : ''}{formatBRL(l.valor_centavos)}
            {l.valor_centavos < 0 && <span className="ml-2 rounded-[5px] bg-hx-dcfce7 px-1.5 py-0.5 align-middle text-[11px] font-semibold text-hx-166534">estorno</span>}
          </div>
          <div className="mt-2 grid grid-cols-[120px_1fr] border-t border-gray-100 text-[14px] [&>div]:border-b [&>div]:border-gray-100">
            {linha('Data', formatDate(l.data))}
            {linha('Conta no mês', nomeCompetencia(l.competencia))}
            {linha('Origem', textoOrigem(l))}
            {l.estabelecimento && l.estabelecimento !== l.descricao && linha('Na fatura', l.estabelecimento)}
            {linha('Observação', l.obs)}
            {l.revisar && linha('Situação', 'a revisar')}
          </div>
          <p className="mt-3 rounded-[10px] bg-gray-100 px-3 py-2.5 text-[12.5px] text-gray-500">Só leitura no celular. Para corrigir, abra no computador.</p>
        </>
      )}
    </PainelMovel>
  );
}

// O chip do topo abre esta folha: o mês (o ano em pílulas, os 12 meses) ou um período maior.
function EscolherPeriodoMovel({ aberto, onFechar, periodo, comp, anos, onEscolher }) {
  const [ano, setAno] = useState(Number(comp.slice(0, 4)));
  useEffect(() => { if (aberto) setAno(Number(comp.slice(0, 4))); }, [aberto, comp]);
  const hoje = competenciaAtual();
  return (
    <PainelMovel aberto={aberto} onFechar={onFechar} lado="baixo" rotulo="Escolher o mês" className="flex flex-col bg-white px-4 pt-2 shadow-xl">
      <span className="mb-2 text-[17px] font-bold text-gray-900">Mês</span>
      <div className="flex flex-wrap gap-[6px]">
        {[...new Set([...anos.map(Number), ano])].sort((a, b) => b - a).map((a) => <Pilula key={a} on={a === ano} onClick={() => setAno(a)}>{a}</Pilula>)}
      </div>
      <div className="mt-3 grid grid-cols-4 gap-[6px]">
        {MESES_ABREV.map((m, i) => {
          const c = `${ano}-${String(i + 1).padStart(2, '0')}`;
          const on = periodo === 'mes' && c === comp;
          return (
            <button key={m} type="button" onClick={() => { onEscolher('mes', c); onFechar(); }} aria-pressed={on}
              className={`toque h-[44px] rounded-[10px] border text-[14px] ${on ? 'inverte-no-escuro border-transparent bg-gray-800 font-semibold text-white'
                : c === hoje ? 'border-gray-500 font-semibold text-gray-900' : 'border-gray-300 text-gray-700 active:bg-gray-100'}`}>{m}</button>
          );
        })}
      </div>
      <div className="mb-[6px] mt-4 px-[2px] text-[11px] font-bold tracking-[.04em] text-gray-500">PERÍODO</div>
      <div className="flex flex-wrap gap-[6px]">
        {[...PERIODOS_FIXOS.map((p) => ({ value: p.value, label: p.label })), ...anos.map((a) => ({ value: `ano:${a}`, label: `Ano ${a}` })), { value: 'tudo', label: 'Todo o histórico' }].map((o) => (
          <Pilula key={o.value} on={periodo === o.value} onClick={() => { onEscolher(o.value, comp); onFechar(); }}>{o.label}</Pilula>
        ))}
      </div>
    </PainelMovel>
  );
}

export default function Lancamentos() {
  const toast = useToast();
  const movel = useNoCelular();
  const slotTopo = useSlotTopo();
  const [ficha, setFicha] = useState(null);
  const [filtrosMovel, setFiltrosMovel] = useState(false);
  const [periodoMovel, setPeriodoMovel] = useState(false);
  const [params, setParams] = useSearchParams();
  const [comp, setCompEstado] = useState(() => lsGet(LS_MES) || competenciaAtual());
  const setComp = (c) => { setCompEstado(c); lsSet(LS_MES, c); };
  const [periodo, setPeriodoEstado] = useState('mes');
  const mudarPeriodo = (p, c = comp) => { setPeriodoEstado(p); if (c !== comp) setComp(c); };
  const [ampliada, setAmpliadaEstado] = useState(() => lsGet(LS_AMPLIADA) === 'sim');
  const setAmpliada = (v) => { setAmpliadaEstado(v); lsSet(LS_AMPLIADA, v ? 'sim' : ''); };
  const [todas, setTodas] = useState(null); // as do período (e os rascunhos da grade), na ordem da tela
  const [categorias, setCategorias] = useState([]);
  const [cartoes, setCartoes] = useState([]);
  const [busca, setBusca] = useState('');
  const [tipo, setTipo] = useState('');
  const [origens, setOrigens] = useState([]);
  const [cats, setCats] = useState([]);
  const [revisar, setRevisar] = useState('');
  const [modal, setModal] = useState(null); // { item } ou {} para novo
  const [resumo, setResumo] = useState([]); // a view resumo_mensal (para a curva dos meses)
  const [irPara, setIrPara] = useState(null); // { id, n }: a linha que a grade acende
  const [ordem, setOrdemEstado] = useState(lerOrdem);
  const ordemRef = useRef(ordem);
  const noMes = periodo === 'mes';
  const ordenarPor = (col) => {
    const nova = proximaOrdem(ordemRef.current, col);
    ordemRef.current = nova;
    setOrdemEstado(nova);
    lsSet(LS_ORDEM, JSON.stringify(nova));
    setTodas((ts) => (ts ? ordenarLinhas(ts, nova, { porMes: !noMes }) : ts));
  };

  // O ENDEREÇO DA BUSCA RÁPIDA (?mes, ?id, ?periodo, ?busca, ?cat): aplicado e tirado do endereço. Abrir um lançamento
  // limpa os filtros (a linha tem de estar à vista).
  useEffect(() => {
    if (![...params.keys()].length) return;
    const mes = params.get('mes');
    const id = params.get('id');
    const p = params.get('periodo');
    if (id || params.has('busca') || params.has('cat')) { setBusca(''); setTipo(''); setOrigens([]); setCats([]); setRevisar(''); }
    if (mes) setComp(mes);
    if (mes || p) setPeriodoEstado(p || 'mes');
    if (params.has('busca')) setBusca(params.get('busca'));
    if (params.has('cat')) setCats([params.get('cat')]);
    if (id) setIrPara({ id, n: Date.now() });
    setParams({}, { replace: true });
  }, [params]);

  useEffect(() => {
    Promise.all([listarCategorias(), listarCartoes()])
      .then(([c, k]) => { setCategorias(c); setCartoes(k); })
      .catch((err) => toast.error(err.message));
  }, [toast]);

  const limites = useMemo(() => limitesDoPeriodo(periodo, comp), [periodo, comp]);
  const carregar = useCallback(async () => {
    try {
      const linhas = noMes ? await listarDoMes(comp) : await listarPeriodo(limites);
      setTodas(ordenarLinhas(linhas, ordemRef.current, { porMes: !noMes }));
    } catch (err) { toast.error(err.message); setTodas([]); }
  }, [noMes, comp, limites.de, limites.ate, toast]);
  useEffect(() => { setTodas(null); carregar(); }, [carregar]);
  useEffect(() => { listarResumoMensal().then(setResumo).catch((err) => toast.error(err.message)); }, [toast]);

  // Os filtros MENOS a busca e o tipo (o aviso dos outros meses os usa sobre o índice).
  const passaFiltros = useCallback((l) => (!origens.length || origens.includes(l.origem))
    && (!cats.length || cats.includes(l.categoria_id ?? 'sem'))
    && (!revisar || l.revisar), [origens, cats, revisar]);

  // Os filtros. Os RASCUNHOS da grade passam sempre: uma linha que se está digitando não pode sumir.
  // Os filtros MENOS o tipo: os cartões do resumo são um por tipo, e o tipo é escolhido clicando neles.
  const semTipo = useMemo(() => {
    if (!todas) return [];
    return todas.filter((l) => l.rascunho || (passaFiltros(l) && casaTermo(l, busca)));
  }, [todas, busca, passaFiltros]);
  const visiveis = useMemo(() => semTipo.filter((l) => l.rascunho || !tipo || l.tipo === tipo), [semTipo, tipo]);
  const gravadas = useMemo(() => visiveis.filter((l) => !l.rascunho), [visiveis]);
  const grupos = useMemo(() => (!noMes && !ordem ? gruposPorMes(visiveis) : null), [noMes, ordem, visiveis]);
  const gruposMovel = useMemo(() => (!noMes ? gruposPorMes(gravadas) : null), [noMes, gravadas]);

  // A SÉRIE DO RESUMO. No mês: os últimos 6 meses da view (com origem e categoria do filtro), e o mês da tela contado
  // da própria grade — ele muda na hora em que se edita, e respeita também a busca. Num PERÍODO: os meses do período
  // (até o mais novo com lançamento, ou hoje), contados da grade, e o total do período no número do cartão.
  const hoje = competenciaAtual();
  const { serie, totalPeriodo } = useMemo(() => {
    const doMes = (linhas) => {
      const t = { entradas: 0, gastos: 0 };
      linhas.forEach((l) => { if (!l.rascunho) t[l.tipo === 'entrada' ? 'entradas' : 'gastos'] += l.valor_centavos; });
      return { ...t, saldo: t.entradas - t.gastos };
    };
    if (noMes) {
      const r = resumoPeriodo(filtrar(resumo, { origens, cats }), mesesAte(comp, 6)).porMes;
      r[r.length - 1] = { ...r[r.length - 1], ...doMes(semTipo) };
      return { serie: r, totalPeriodo: null };
    }
    const comps = semTipo.filter((l) => !l.rascunho).map((l) => l.competencia).sort();
    const maisNovo = comps[comps.length - 1] ?? hoje;
    const de = limites.de ?? comps[0] ?? hoje;
    let ate = limites.ate ?? maisNovo;
    const teto = maisNovo > hoje ? maisNovo : hoje;
    if (ate > teto) ate = teto;
    const meses = [];
    for (let c = de; c <= ate && meses.length < 240; c = addMeses(c, 1)) meses.push(c);
    const s = meses.map((c) => ({ competencia: c, ...doMes(semTipo.filter((l) => l.competencia === c)) }));
    return { serie: s, totalPeriodo: doMes(semTipo) };
  }, [noMes, resumo, comp, origens, cats, semTipo, limites.de, limites.ate, hoje]);

  // As categorias do filtro, por grupo (na ordem do cadastro), com "Sem categoria" no topo.
  const opcoesCategoria = useMemo(() => {
    const grupos = [];
    categorias.forEach((c) => {
      let g = grupos.find((x) => x.titulo === c.grupo.nome);
      if (!g) { g = { titulo: c.grupo.nome, cor: c.grupo.cor, itens: [] }; grupos.push(g); }
      g.itens.push({ value: c.id, label: c.nome, grupo: c.grupo.nome });
    });
    grupos.forEach((g) => g.itens.sort((a, b) => a.label.localeCompare(b.label, 'pt-BR')));
    return [{ titulo: 'Geral', itens: [{ value: 'sem', label: 'Sem categoria' }] }, ...grupos];
  }, [categorias]);

  const anos = useMemo(() => anosComDado(resumo.map((r) => r.competencia), hoje), [resumo, hoje]);
  const compNovo = mesDaLinhaNova(periodo, comp, hoje);
  const rotulo = noMes ? `em ${nomeCompetencia(comp).toLowerCase()}` : periodo === 'tudo' ? 'no histórico' : periodo.startsWith('ano:') ? `em ${periodo.slice(4)}` : `nos ${rotuloPeriodo(periodo, comp)}`;

  // O AVISO DOS OUTROS MESES (a opção B): só com algo na busca e fora do histórico inteiro.
  const comBusca = Boolean(busca.trim()) && periodo !== 'tudo';
  const indice = useIndiceBusca(comBusca);
  const outros = useMemo(() => (comBusca && indice
    ? outrosMeses(indice, busca, limites, (l) => passaFiltros(l) && (!tipo || l.tipo === tipo))
    : { total: 0, meses: [] }), [comBusca, indice, busca, limites, passaFiltros, tipo]);
  const irParaMes = (c) => {
    const l = indice?.filter((x) => x.competencia === c && passaFiltros(x) && (!tipo || x.tipo === tipo) && casaTermo(x, busca))
      .sort((a, b) => String(b.data).localeCompare(String(a.data)))[0];
    mudarPeriodo('mes', c);
    if (l) setIrPara({ id: l.id, n: Date.now() });
  };

  const filtrando = Boolean(busca || tipo || origens.length || cats.length || revisar);
  const limpar = () => { setBusca(''); setTipo(''); setOrigens([]); setCats([]); setRevisar(''); };

  // O ▾ "MAIS AÇÕES" (30/10/2026, como nos Gastos fixos): o exportar mora nele; "Novo lançamento" fica à vista.
  const [mais, setMais] = useState(null); // o menu (posição)
  const maisAbertoNoClique = useRef(false);
  const abrirMais = (el) => {
    const r = el.getBoundingClientRect();
    const vazio = !gravadas.length;
    setMais({ x: r.right - 250, y: r.bottom + 4, titulo: 'Mais ações', itens: [
      { rotulo: noMes ? `Exportar ${nomeCompetencia(comp).toLowerCase()} (CSV)` : 'Exportar o período (CSV)', sub: 'o que está na tela, com os filtros e a ordem',
        desabilitado: vazio, motivo: vazio ? 'nada na tela' : undefined, onEscolher: exportar },
    ] });
  };

  // Exporta o que está na tela (período + filtros + ordem), no padrão do Excel em pt-BR.
  const exportar = () => exportCsv(noMes ? `lancamentos-${comp}` : `lancamentos-${limites.de ? `${limites.de}_a_${limites.ate}` : 'historico'}`,
    gravadas.map((l) => ({ ...l, origem_texto: textoOrigem(l), categoria_nome: l.categoria?.nome ?? '' })), [
      ...(noMes ? [] : [{ key: 'competencia', label: 'Mês', map: (l) => competenciaCurta(l.competencia) }]),
      { key: 'data', label: 'Data', tipo: 'data' },
      { key: 'descricao', label: 'Descrição' },
      { key: 'categoria_nome', label: 'Categoria' },
      { key: 'grupo', label: 'Grupo', map: (l) => l.categoria?.grupo?.nome ?? '' },
      { key: 'tipo', label: 'Tipo', map: (l) => (l.tipo === 'entrada' ? 'Entrada' : 'Gasto') },
      { key: 'origem_texto', label: 'Origem' },
      { key: 'valor', label: 'Valor', tipo: 'dinheiro', map: (l) => l.valor_centavos / 100 },
      { key: 'obs', label: 'Observação' },
    ]);

  if (movel) {
    const extras = (tipo ? 1 : 0) + (origens.length ? 1 : 0) + (cats.length ? 1 : 0) + (revisar ? 1 : 0);
    const totais = totalPeriodo ?? serie[serie.length - 1] ?? { entradas: 0, gastos: 0, saldo: 0 };
    const chip = noMes ? nomeCompetencia(comp) : rotuloPeriodo(periodo, comp);
    const andar = (n) => (periodo.startsWith('ano:') ? mudarPeriodo(`ano:${Number(periodo.slice(4)) + n}`) : mudarPeriodo(periodo, addMeses(comp, n)));
    const seta = (n) => (
      <button type="button" onClick={() => andar(n)} aria-label={n < 0 ? 'Antes' : 'Depois'} disabled={periodo === 'tudo'}
        className="toque toque-icone flex h-[36px] w-[34px] shrink-0 items-center justify-center rounded-[10px] border border-gray-300 bg-white text-gray-600 disabled:opacity-40">
        <svg viewBox="0 0 24 24" className="h-[15px] w-[15px]" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={n < 0 ? 'M15 6l-6 6 6 6' : 'M9 6l6 6-6 6'} /></svg>
      </button>
    );
    // OS GRUPOS DA LISTA: por dia no mês (a data da compra, a mais nova em cima), por mês num período.
    // A ordem do celular é sempre a padrão (a escolhida no cabeçalho da grade do computador espalharia os dias).
    const blocos = [];
    [...gravadas].sort((a, b) => (noMes ? 0 : String(b.competencia).localeCompare(String(a.competencia)))
      || String(b.data).localeCompare(String(a.data)) || String(b.criado_em ?? '').localeCompare(String(a.criado_em ?? ''))).forEach((l) => {
      const chave = noMes ? l.data : l.competencia;
      let b = blocos[blocos.length - 1];
      if (!b || b.chave !== chave) { b = { chave, itens: [], gastos: 0, entradas: 0 }; blocos.push(b); }
      b.itens.push(l);
      b[l.tipo === 'entrada' ? 'entradas' : 'gastos'] += l.valor_centavos;
    });
    const opcoesCatMovel = opcoesCategoria.flatMap((g) => g.itens.map((c) => ({ value: c.value, label: c.label, sub: g.titulo === 'Geral' ? undefined : g.titulo, cor: g.cor })));
    return (
      <div className="flex flex-col gap-3">
        {slotTopo && createPortal(
          <div className="flex items-center gap-1.5 px-3 pb-2.5">
            {seta(-1)}
            <button type="button" onClick={() => setPeriodoMovel(true)}
              className="toque flex h-[36px] min-w-0 flex-1 items-center justify-center gap-1.5 rounded-[10px] border border-gray-300 bg-white px-3 text-[14px] font-semibold text-gray-900">
              <span className="truncate">{chip}</span>
              <svg viewBox="0 0 24 24" className="h-[12px] w-[12px] shrink-0 text-gray-400" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
            </button>
            {seta(1)}
            <button type="button" onClick={() => setFiltrosMovel(true)} aria-label="Filtros"
              className="toque relative flex h-[36px] w-[40px] shrink-0 items-center justify-center rounded-[10px] border border-gray-300 bg-white text-gray-700">
              <svg viewBox="0 0 24 24" className="h-[16px] w-[16px]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M4 6h16M7 12h10M10 18h4" /></svg>
              {extras > 0 && <span className="absolute -right-1 -top-1 rounded-full bg-gray-800 px-1.5 text-[10.5px] leading-[17px] text-white inverte-no-escuro">{extras}</span>}
            </button>
          </div>,
          slotTopo,
        )}
        <label className="flex h-[42px] items-center gap-2 rounded-[10px] border border-gray-300 bg-white px-3 text-gray-400">
          <svg viewBox="0 0 24 24" className="h-[16px] w-[16px] shrink-0" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
          <input type="search" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Descrição, categoria ou obs."
            className="min-w-0 flex-1 border-0 bg-transparent p-0 text-[16px] text-gray-900 outline-none placeholder:text-gray-400 focus:ring-0" />
        </label>
        {comBusca && (
          <AvisoOutrosMeses busca={busca} indice={indice} outros={outros} rotulo={rotulo}
            onMes={irParaMes} onTudo={() => mudarPeriodo('tudo')} />
        )}
        <div className="grid grid-cols-3 gap-2">
          {[['Entradas', totais.entradas, 'text-green-700'], ['Gastos', totais.gastos, 'text-gray-900'], ['Saldo', totais.saldo, totais.saldo < 0 ? 'text-hx-c0393d' : 'text-gray-900']].map(([rot, v, cor]) => (
            <div key={rot} className="rounded-[10px] border border-gray-200 bg-white px-2.5 py-2">
              <div className="text-[10.5px] font-semibold uppercase tracking-wide text-gray-500">{rot}</div>
              <div className={`truncate text-[15px] font-bold tabular-nums ${cor}`}>{brlCurto(v)}</div>
            </div>
          ))}
        </div>
        {!todas ? <PageLoading /> : gravadas.length === 0 ? (
          <ListaVazia>{filtrando ? 'Nenhum lançamento com esses filtros.' : `Nenhum lançamento ${rotulo}.`}</ListaVazia>
        ) : blocos.map((b) => (
          <div key={b.chave}>
            <div className="flex items-baseline justify-between px-1 pb-1.5 pt-1 text-[11.5px] font-bold uppercase tracking-[.03em] text-gray-500">
              <span>{noMes ? tituloDia(b.chave) : nomeCompetencia(b.chave)}</span>
              <span className="normal-case tabular-nums tracking-normal">
                {b.entradas > 0 && <span className="text-green-700">+ {formatBRL(b.entradas)}{b.gastos ? ' · ' : ''}</span>}{b.gastos ? formatBRL(b.gastos) : ''}
              </span>
            </div>
            <ul className="overflow-hidden rounded-[12px] border border-gray-200 bg-white">
              {b.itens.map((l) => (
                <li key={l.id} className="border-t border-gray-100 first:border-t-0">
                  <button type="button" onClick={() => setFicha(l)} className="toque flex w-full items-center gap-3 px-3 py-2.5 text-left active:bg-gray-50">
                    <Bolinha cor={l.categoria?.grupo?.cor} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] text-gray-900">{l.descricao}</span>
                      <span className="block truncate text-[12px] text-gray-500">
                        {noMes ? '' : `${formatDate(l.data).slice(0, 5)} · `}{l.categoria?.nome ?? 'Sem categoria'} · {textoOrigem(l)}
                      </span>
                    </span>
                    <span className="shrink-0 text-[14px] font-semibold"><Valor l={l} /></span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
        <p className="px-2 text-center text-[11.5px] text-gray-400">{gravadas.length.toLocaleString('pt-BR')} lançamento(s){filtrando ? ' no filtro' : ''} {rotulo}. Lançar e corrigir ficam no computador.</p>
        <FichaMovel l={ficha} onFechar={() => setFicha(null)} />
        <EscolherPeriodoMovel aberto={periodoMovel} onFechar={() => setPeriodoMovel(false)} periodo={periodo} comp={comp} anos={anos}
          onEscolher={(p, c) => mudarPeriodo(p, c)} />
        <FiltrosMovel aberto={filtrosMovel} onFechar={() => setFiltrosMovel(false)}
          valor={{ tipo, origens, cats, revisar }} vazio={{ tipo: '', origens: [], cats: [], revisar: '' }}
          onAplicar={(v) => { setTipo(v.tipo); setOrigens(v.origens); setCats(v.cats); setRevisar(v.revisar); }}
          campos={[
            { tipo: 'unico', campo: 'tipo', rotulo: 'Tipo', opcoes: OPCOES_TIPO },
            { tipo: 'lista', campo: 'origens', rotulo: 'Origem', plural: 'origens', opcoes: OPCOES_ORIGEM },
            { tipo: 'lista', campo: 'cats', rotulo: 'Categoria', plural: 'categorias', opcoes: opcoesCatMovel },
            { tipo: 'unico', campo: 'revisar', rotulo: 'Revisar', opcoes: [{ value: '', label: 'Todos' }, { value: 'sim', label: 'Só a revisar' }] },
          ]} />
      </div>
    );
  }

  return (
    <div>
      <CabecalhoPagina
        titulo="Lançamentos"
        acoes={(
          <>
            {/* O GRUPO DO DRE (o mesmo dos Gastos fixos e do Importar): a caixa com o ▾ "Mais ações" (o exportar).
                Abre e fecha no mesmo botão: o mousedown anota se o menu estava aberto (ver Fixos.jsx). */}
            <div className="hidden overflow-hidden rounded-md border border-gray-300 bg-white md:inline-flex">
              <Tooltip label={ampliada ? 'Voltar ao resumo' : 'Ampliar a tabela'}>
                <button type="button" aria-label={ampliada ? 'Voltar ao resumo' : 'Ampliar a tabela'} aria-pressed={ampliada} onClick={() => setAmpliada(!ampliada)}
                  className={`flex h-9 w-[34px] items-center justify-center border-r border-gray-300 transition-colors hover:bg-gray-50 active:bg-gray-200 ${ampliada ? 'bg-gray-100 text-gray-900' : 'text-gray-600'}`}>
                  <IcoAmpliar reduzir={ampliada} />
                </button>
              </Tooltip>
              <Tooltip label="Mais ações">
                <button type="button" aria-label="Mais ações" aria-haspopup="menu" aria-expanded={!!mais}
                  onMouseDown={() => { maisAbertoNoClique.current = !!mais; }}
                  onClick={(e) => { if (maisAbertoNoClique.current || mais) { maisAbertoNoClique.current = false; setMais(null); } else abrirMais(e.currentTarget); }}
                  className={`flex h-9 w-[34px] items-center justify-center text-gray-600 transition-colors hover:bg-gray-50 active:bg-gray-200 ${mais ? 'bg-gray-100' : ''}`}>
                  <IconSeta className={`transition-transform duration-200 ease-out ${mais ? 'rotate-180' : ''}`} />
                </button>
              </Tooltip>
            </div>
            <button type="button" className="btn-primary" onClick={() => setModal({})}>
              <IconMais className="h-[11px] w-[11px]" />
              <span className="sm:hidden">Novo</span><span className="hidden sm:inline">Novo lançamento</span>
            </button>
          </>
        )}
      />

      {/* ampliada, os cartões saem só no computador (no celular não há o botão nem a grade) */}
      <div className={`mt-4 sm:mt-6 ${ampliada ? 'md:hidden' : ''}`}>
        <CartoesResumo serie={serie} total={totalPeriodo} tipo={tipo} onTipo={setTipo} onMes={(c) => mudarPeriodo('mes', c)} />
      </div>

      {/* A FAIXA DE FILTROS do Gestor: a busca e um trilho só, com o mês (ou o período) dentro dele. */}
      <FaixaProvider>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <BuscaFaixa className="w-full sm:w-[220px]" placeholder="Descrição, categoria ou obs." value={busca} onChange={(e) => setBusca(e.target.value)} />
          <Trilho>
            <SegPeriodo periodo={periodo} comp={comp} anos={anos} onChange={(p, c) => mudarPeriodo(p, c)} />
            <DivisorFaixa />
            <SegUnico id="tipo" rotulo="Tipo" opcoes={OPCOES_TIPO} value={tipo} onChange={setTipo} padrao="" largura={160} />
            <DivisorFaixa />
            <SegMulti id="origem" rotulo="Origem" plural="origens" opcoes={OPCOES_ORIGEM} value={origens} onChange={setOrigens} largura={190} />
            <DivisorFaixa />
            <SegMulti id="categoria" rotulo="Categoria" opcoes={opcoesCategoria} value={cats} onChange={setCats} largura={280} busca="Buscar categoria ou grupo" />
            <DivisorFaixa />
            <SegUnico id="revisar" rotulo="Revisar" opcoes={OPCOES_REVISAR} value={revisar} onChange={setRevisar} padrao="" largura={180} />
          </Trilho>
          <LimparFiltros ativo={filtrando} onClick={limpar} />
        </div>
      </FaixaProvider>
      {comBusca && (
        <AvisoOutrosMeses busca={busca} indice={indice} outros={outros} rotulo={rotulo}
          onMes={irParaMes} onTudo={() => mudarPeriodo('tudo')} />
      )}

      <div className="mt-4">
        {!todas ? <PageLoading /> : (
          <>
            {/* Computador: a grade de planilha (com a linha em branco no fim, mesmo sem lançamentos). */}
            <div className="hidden md:block">
              <GradeLancamentos linhas={visiveis} todas={todas} setTodas={setTodas} categorias={categorias} comp={compNovo} ordem={ordem} onOrdenar={ordenarPor} ateOFim={ampliada}
                grupos={grupos} onAbrirMes={(c) => mudarPeriodo('mes', c)} irPara={irPara}
                onAbrir={(l) => setModal({ item: l })} onRecarregar={carregar}
                onCategoriaCriada={(cat) => setCategorias((c) => (c.some((x) => x.id === cat.id) ? c : [...c, cat]))} />
              <p className="mt-2 text-right text-xs text-gray-500">
                {gravadas.length.toLocaleString('pt-BR')} lançamento(s){filtrando ? ' no filtro' : ''} {rotulo}
              </p>
            </div>

            {/* Celular: só leitura, em lista (tocar abre o formulário); num período, com o mês antes de cada grupo. */}
            <div className="md:hidden">
              {gravadas.length === 0 ? (
                <ListaVazia>{filtrando ? 'Nenhum lançamento com esses filtros.' : `Nenhum lançamento ${rotulo}.`}</ListaVazia>
              ) : (
                <ul className="card divide-y divide-gray-100">
                  {gravadas.map((l, i) => {
                    const g = gruposMovel?.get(i);
                    return (
                      <li key={l.id}>
                        {g && (
                          <div className="flex items-center justify-between bg-gray-50 px-3 py-1.5 text-[12px]">
                            <span className="font-semibold text-gray-800">{nomeCompetencia(g.competencia)}</span>
                            <span className="tabular-nums text-gray-600">{formatBRL(g.gastos)}</span>
                          </div>
                        )}
                        <button type="button" onClick={() => setModal({ item: l })} className="flex w-full items-center gap-3 px-3 py-2.5 text-left active:bg-gray-100">
                          <Bolinha cor={l.categoria?.grupo?.cor} />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm text-gray-800">{l.descricao}</span>
                            <span className="block truncate text-xs text-gray-500">
                              {formatDate(l.data).slice(0, 5)} · {l.categoria?.nome ?? 'Sem categoria'} · {textoOrigem(l)}
                            </span>
                          </span>
                          <span className="shrink-0 text-sm"><Valor l={l} /></span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </>
        )}
      </div>

      {modal && (
        <ModalLancamento lancamento={modal.item} compPadrao={compNovo} categorias={categorias} cartoes={cartoes}
          onFechar={() => setModal(null)} onSalvo={() => { setModal(null); carregar(); }} />
      )}
      <MenuContexto menu={mais} onFechar={() => setMais(null)} />
    </div>
  );
}
