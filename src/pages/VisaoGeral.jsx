import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import CabecalhoPagina from '../components/CabecalhoPagina.jsx';
import { PageLoading } from '../components/Spinner.jsx';
import { DivisorFaixa, FaixaProvider, LimparFiltros, Trilho } from '../components/filtros/FaixaFiltros.jsx';
import SegmentoFiltro, { OpcaoMenu } from '../components/filtros/SegmentoFiltro.jsx';
import { SegMulti, SegUnico } from '../components/filtros/Segmentos.jsx';
import BalaoGrafico, { useBalao } from '../components/graficos/BalaoGrafico.jsx';
import { COR_ENTRADAS, COR_GASTOS } from '../components/graficos/Graficos.jsx';
import { BarrasGrupos, COR_ANTERIOR, COR_SALDO, ColunasEntradasGastos, RoscaOrigem } from '../components/graficos/GraficosVisao.jsx';
import LegendaSeries, { useDestaqueSeries } from '../components/graficos/LegendaSeries.jsx';
import Modal from '../components/Modal.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { contarPendencias, listarParcelasFuturas, listarResumoMensal } from '../api/resumo.js';
import { listarCategorias } from '../api/cadastros.js';
import { listarLancamentosDeFixos, listarRecorrencias } from '../api/fixos.js';
import { comprometidoPorMes } from '../lib/resumo.js';
import { situacaoDoMes } from '../lib/fixos.js';
import { anoAnterior, filtrar, gruposPorMes, periodo, resumoPeriodo, variacao } from '../lib/visaoGeral.js';
import { brlCurto, formatBRL } from '../lib/dinheiro.js';
import { addMeses, competenciaAtual, competenciaCurta, nomeCompetencia } from '../lib/format.js';
import { exportCsv } from '../lib/exportCsv.js';
import { lsGet, lsSet } from '../lib/storage.js';
import useLinhasAnimadas, { atributosLinha } from '../lib/useLinhasAnimadas.js';

// A VISÃO GERAL (tela inicial) — o Dashboard da planilha refeito no estilo do Gestor: não é a foto de
// um mês, é o retrato do período que os filtros escolhem. ANO e MESES funcionam como as segmentações
// da planilha (vários anos, vários meses); tipo, origem e categoria recortam por cima. As somas saem da
// view `resumo_mensal` (`lib/visaoGeral.js`); aqui só se escolhe o recorte e se desenha.
//
// A faixa "Agora" é o que a tela antiga (Resumo do mês) tinha de útil no dia a dia: o que falta
// revisar, os fixos ainda não lançados e o que já está comprometido em parcelas — sempre do mês ATUAL,
// sem depender dos filtros.

const MESES_CURTOS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const MESES_LONGOS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const ORIGENS = [['cartao', 'Cartão (faturas)'], ['fixo', 'Gastos fixos'], ['manual', 'Avulsos']];
const OPCOES_TIPO = [{ value: '', label: 'Todos' }, { value: 'saida', label: 'Gastos' }, { value: 'entrada', label: 'Entradas' }];
const OPCOES_ORIGEM = [...ORIGENS, ['entrada', 'Entradas']].map(([value, label]) => ({ value, label }));
const OPCOES_COMPARAR = [{ value: 'anterior', label: 'Ano anterior', chip: 'Comparar: ano anterior' }, { value: 'nada', label: 'Sem comparação', chip: 'Sem comparação' }];
const LS_COMPARAR = 'visao_comparar';
const ATALHOS = [['O ano todo', []], ['1º tri', [1, 2, 3]], ['2º tri', [4, 5, 6]], ['3º tri', [7, 8, 9]], ['4º tri', [10, 11, 12]]];

// "jan a out de 2026", "jul, set e nov de 2026", "2025 e 2026".
function textoPeriodo(anos, meses) {
  const a = [...anos].sort();
  const anosTxt = a.length > 1 ? `${a.slice(0, -1).join(', ')} e ${a[a.length - 1]}` : String(a[0]);
  if (!meses.length) return anosTxt;
  const m = [...meses].sort((x, y) => x - y);
  const seguidos = m.every((v, i) => i === 0 || v === m[i - 1] + 1);
  const nome = (v) => MESES_CURTOS[v - 1].toLowerCase();
  if (m.length === 1) return `${MESES_LONGOS[m[0] - 1]} de ${anosTxt}`;
  if (seguidos) return `${nome(m[0])} a ${nome(m[m.length - 1])} de ${anosTxt}`;
  return `${m.slice(0, -1).map(nome).join(', ')} e ${nome(m[m.length - 1])} de ${anosTxt}`;
}

// ------------------------------------------------------------ os segmentos de período

// ANO: vários, como a segmentação da planilha. No ano atual o segmento fica quieto (diz o ano).
function SegAnos({ anos, opcoes, onChange }) {
  const atual = Number(competenciaAtual().slice(0, 4));
  const padrao = anos.length === 1 && anos[0] === atual;
  const texto = [...anos].sort().join(', ');
  return (
    <SegmentoFiltro id="ano" rotulo="Ano" valor={padrao ? '' : `Ano: ${texto}`} textoQuieto={padrao ? `Ano: ${texto}` : undefined}
      largura={170} onLimpar={padrao ? undefined : () => onChange([atual])}>
      <div className="max-h-[300px] overflow-y-auto scrollbar-thin">
        {opcoes.map((a) => (
          <OpcaoMenu key={a} multi selecionada={anos.includes(a)}
            onClick={() => { const n = anos.includes(a) ? anos.filter((x) => x !== a) : [...anos, a]; if (n.length) onChange(n); }}>
            {String(a)}
          </OpcaoMenu>
        ))}
      </div>
      <p className="mx-[9px] mb-1 mt-1.5 text-[10.5px] leading-[14px] text-gray-400">Marque mais de um ano para somar os dois.</p>
    </SegmentoFiltro>
  );
}

// MESES: a grade de 12 botões da segmentação MÊS da planilha. Clique liga/desliga um mês, Shift+clique
// marca o intervalo desde o último clicado; nenhum marcado = o ano todo.
function MenuMeses({ meses, onChange, ultimo }) {
  const alternar = (m, e) => {
    if (e.shiftKey && ultimo.current) {
      const [a, b] = [Math.min(ultimo.current, m), Math.max(ultimo.current, m)];
      onChange([...new Set([...meses, ...Array.from({ length: b - a + 1 }, (_, i) => a + i)])]);
    } else onChange(meses.includes(m) ? meses.filter((x) => x !== m) : [...meses, m]);
    ultimo.current = m;
  };
  const igual = (lista) => lista.length === meses.length && lista.every((x) => meses.includes(x));
  return (
    <div className="p-1">
      <div className="mb-2 flex items-center justify-between text-[12px]">
        <span className="font-semibold text-gray-800">Meses</span>
        <span className="text-[11px] text-gray-400">Shift+clique: um intervalo</span>
      </div>
      <div className="grid grid-cols-4 gap-1">
        {MESES_CURTOS.map((nome, i) => {
          const sel = meses.includes(i + 1);
          return (
            <button key={nome} type="button" onClick={(e) => alternar(i + 1, e)} aria-pressed={sel}
              className={`rounded-[3px] border py-[7px] text-[12px] transition-colors ${sel ? 'border-gray-800 bg-gray-800 font-semibold text-white'
                : 'border-gray-200 text-gray-700 hover:bg-gray-100'}`}>
              {nome}
            </button>
          );
        })}
      </div>
      <div className="mt-2 flex flex-wrap gap-1">
        {ATALHOS.map(([rotulo, lista]) => (
          <button key={rotulo} type="button" onClick={() => onChange(lista)}
            className={`rounded-[3px] px-2 py-1 text-[11.5px] transition-colors ${igual(lista) ? 'bg-chip-ativo font-semibold text-chip-ativo' : 'bg-hx-f4f5f7 text-gray-600 hover:bg-gray-200'}`}>
            {rotulo}
          </button>
        ))}
      </div>
    </div>
  );
}

function SegMeses({ meses, onChange }) {
  const ultimo = useRef(null);
  const valor = !meses.length ? '' : meses.length === 1 ? MESES_LONGOS[meses[0] - 1].replace(/^./, (c) => c.toUpperCase())
    : textoPeriodo([0], meses).replace(/ de 0$/, '').replace(/^./, (c) => c.toUpperCase());
  return (
    <SegmentoFiltro id="meses" rotulo="Meses" valor={valor} textoQuieto="Meses: o ano todo" largura={260} alturaMenu={230}
      onLimpar={() => onChange([])}>
      <MenuMeses meses={meses} onChange={onChange} ultimo={ultimo} />
    </SegmentoFiltro>
  );
}

// ------------------------------------------------------------ peças da tela

function Kpi({ rotulo, valor, sub, cor, balao }) {
  const b = useBalao(270, 150);
  return (
    <div className="card min-w-0 px-4 py-3" onMouseMove={balao ? b.aoMover('k') : undefined} onMouseLeave={b.aoSair}>
      <div className="truncate text-[11px] font-semibold uppercase tracking-wide text-gray-600">{rotulo}</div>
      <div className={`mt-1 whitespace-nowrap text-lg font-semibold tabular-nums sm:text-[21px] ${cor ?? 'text-gray-900'} ${balao ? 'w-fit cursor-default rounded px-1.5 -mx-1.5 hover:bg-gray-100' : ''}`}>{valor}</div>
      {sub && <div className="mt-0.5 truncate text-xs text-gray-500">{sub}</div>}
      {balao && b.ativo && <BalaoGrafico pos={b.pos} largura={270} {...balao} />}
    </div>
  );
}

const Cartao = ({ children, className = '' }) => <section className={`card p-4 ${className}`}>{children}</section>;
const Titulo = ({ children }) => <h2 className="m-0 text-[10.5px] font-bold uppercase tracking-[0.06em] text-gray-500">{children}</h2>;

const IconAmpliar = () => (
  <svg viewBox="0 0 24 24" className="h-[15px] w-[15px]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
    <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
  </svg>
);

const IconChevron = ({ aberto }) => (
  <svg viewBox="0 0 24 24" className={`h-3 w-3 shrink-0 text-gray-400 transition-transform duration-150 ${aberto ? 'rotate-90' : ''}`} fill="none"
    stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M9 6l6 6-6 6" />
  </svg>
);

// GRUPO × MÊS: o "Gastos por tipo" da planilha aberto por mês. Cada grupo abre nas categorias (com a
// animação de recolher do DRE). A cor de fundo é a intensidade NA LINHA: o mês mais caro do grupo é o
// tom mais forte (uma rampa só, do azul dos gastos).
function TabelaGrupoMes({ grupos, comps, total, porMes, onExportar }) {
  const [abertos, setAbertos] = useState(new Set());
  const caixaRef = useRef(null);
  const todas = useMemo(() => grupos.flatMap((g) => [
    { id: `g:${g.id}`, tipo: 'grupo', g },
    ...g.categorias.map((c) => ({ id: `c:${g.id}:${c.id}`, tipo: 'cat', g, c })),
  ]), [grupos]);
  const visiveis = useMemo(() => todas.filter((x) => x.tipo === 'grupo' || abertos.has(x.g.id)), [todas, abertos]);
  const desenhadas = useLinhasAnimadas(todas, visiveis, caixaRef);
  const alternar = (id) => setAbertos((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const fundo = (v, max) => (v ? { background: `color-mix(in srgb, ${COR_GASTOS} ${Math.round(4 + 24 * (v / max) ** 2)}%, transparent)` } : undefined);
  const celulas = (item, forte) => {
    const max = Math.max(1, ...comps.map((c) => item.meses[c] ?? 0));
    return comps.map((c) => (
      <td key={c} className={`border-b border-r border-gray-100 px-2 text-right tabular-nums ${forte ? 'text-gray-800' : 'text-gray-600'}`} style={fundo(item.meses[c], max)}>
        {item.meses[c] ? Math.round(item.meses[c] / 100).toLocaleString('pt-BR') : <span className="text-gray-300">—</span>}
      </td>
    ));
  };
  return (
    <Cartao className="!p-0">
      <div className="flex items-center gap-2 px-4 pb-2.5 pt-3.5">
        <Titulo>Grupo × mês <span className="font-medium normal-case tracking-normal text-gray-400">· em reais · o tom mais forte é o mês mais caro de cada linha</span></Titulo>
        <span className="flex-1" />
        <button type="button" onClick={onExportar} className="text-xs font-medium text-gray-500 underline hover:text-gray-800">Exportar CSV</button>
      </div>
      <div ref={caixaRef} className="overflow-x-auto">
        <table className="w-full border-separate border-spacing-0 text-[12.5px]" style={{ minWidth: 300 + comps.length * 74 }}>
          <thead>
            <tr className="bg-hx-f9fafb">
              <th className="sticky left-0 z-10 border-b border-r border-gray-200 bg-hx-f9fafb px-3 py-2 text-left text-[10.5px] font-semibold uppercase tracking-wide text-gray-500">Grupo</th>
              {comps.map((c) => <th key={c} className="border-b border-r border-gray-100 px-2 py-2 text-right text-[10.5px] font-semibold uppercase tracking-wide text-gray-500">{comps.length > 12 ? competenciaCurta(c) : MESES_CURTOS[Number(c.slice(5)) - 1]}</th>)}
              <th className="border-b border-r border-gray-100 px-2 py-2 text-right text-[10.5px] font-semibold uppercase tracking-wide text-gray-500">Total</th>
              <th className="border-b border-gray-100 px-3 py-2 text-right text-[10.5px] font-semibold uppercase tracking-wide text-gray-500">Média</th>
            </tr>
          </thead>
          <tbody>
            {desenhadas.map(({ linha: x, estado }) => {
              const attrs = atributosLinha(x.id, estado);
              if (x.tipo === 'grupo') {
                const aberto = abertos.has(x.g.id);
                return (
                  <tr key={x.id} {...attrs} className="bg-white">
                    <td className="sticky left-0 z-10 h-8 border-b border-r border-gray-200 bg-white px-3">
                      <button type="button" onClick={() => alternar(x.g.id)} aria-expanded={aberto} className="flex max-w-[200px] items-center gap-2 text-left">
                        <IconChevron aberto={aberto} />
                        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: x.g.cor }} />
                        <span className="truncate font-semibold text-gray-800">{x.g.nome}</span>
                      </button>
                    </td>
                    {celulas(x.g, true)}
                    <td className="border-b border-r border-gray-100 bg-hx-f9fafb px-2 text-right font-semibold tabular-nums text-gray-900">{Math.round(x.g.total / 100).toLocaleString('pt-BR')}</td>
                    <td className="border-b border-gray-100 px-3 text-right tabular-nums text-gray-600">{Math.round(x.g.media / 100).toLocaleString('pt-BR')}</td>
                  </tr>
                );
              }
              return (
                <tr key={x.id} {...attrs} className="bg-white">
                  <td className="sticky left-0 z-10 h-8 border-b border-r border-gray-200 bg-white py-0 pl-[38px] pr-3"><span className="block max-w-[180px] truncate text-gray-600">{x.c.nome}</span></td>
                  {celulas(x.c, false)}
                  <td className="border-b border-r border-gray-100 bg-hx-f9fafb px-2 text-right tabular-nums text-gray-700">{Math.round(x.c.total / 100).toLocaleString('pt-BR')}</td>
                  <td className="border-b border-gray-100 px-3 text-right tabular-nums text-gray-500">{Math.round(x.c.media / 100).toLocaleString('pt-BR')}</td>
                </tr>
              );
            })}
            <tr className="bg-hx-f9fafb font-semibold">
              <td className="sticky left-0 z-10 h-8 border-r border-gray-200 bg-hx-f9fafb px-3 text-gray-800">Total de gastos</td>
              {comps.map((c) => <td key={c} className="border-r border-gray-100 px-2 text-right tabular-nums text-gray-900">{porMes[c] ? Math.round(porMes[c] / 100).toLocaleString('pt-BR') : '—'}</td>)}
              <td className="border-r border-gray-100 px-2 text-right tabular-nums text-gray-900">{Math.round(total / 100).toLocaleString('pt-BR')}</td>
              <td />
            </tr>
          </tbody>
        </table>
      </div>
    </Cartao>
  );
}

// ------------------------------------------------------------ a tela

export default function VisaoGeral() {
  const toast = useToast();
  const navigate = useNavigate();
  const anoAtual = Number(competenciaAtual().slice(0, 4));
  const [linhas, setLinhas] = useState(null);
  const [categorias, setCategorias] = useState([]);
  const [parcelas, setParcelas] = useState([]);
  const [pendencias, setPendencias] = useState(0);
  const [fixos, setFixos] = useState({ recs: [], lancs: [] });
  const [anos, setAnos] = useState([anoAtual]);
  const [meses, setMeses] = useState([]);
  const [tipo, setTipo] = useState('');
  const [origens, setOrigens] = useState([]);
  const [cats, setCats] = useState([]);
  const [comparar, setCompararEstado] = useState(() => lsGet(LS_COMPARAR) || 'anterior');
  const setComparar = (v) => { setCompararEstado(v); lsSet(LS_COMPARAR, v); };
  const [ampliado, setAmpliado] = useState(false);
  const ctrl = useDestaqueSeries();

  const carregar = useCallback(async () => {
    try {
      const [r, c, p, n, rec, lf] = await Promise.all([
        listarResumoMensal(), listarCategorias(), listarParcelasFuturas(), contarPendencias(), listarRecorrencias(), listarLancamentosDeFixos(),
      ]);
      setLinhas(r); setCategorias(c); setParcelas(p); setPendencias(n); setFixos({ recs: rec, lancs: lf });
    } catch (err) { toast.error(err.message); setLinhas([]); }
  }, [toast]);
  useEffect(() => { carregar(); }, [carregar]);

  const comps = useMemo(() => periodo(anos, meses), [anos, meses]);
  const filtradas = useMemo(() => filtrar(linhas ?? [], { tipo, origens, cats }), [linhas, tipo, origens, cats]);
  const r = useMemo(() => resumoPeriodo(filtradas, comps), [filtradas, comps]);
  const compsAnt = useMemo(() => anoAnterior(comps), [comps]);
  const rAnt = useMemo(() => (comparar === 'anterior' ? resumoPeriodo(filtradas, compsAnt) : null), [filtradas, compsAnt, comparar]);
  const grupos = useMemo(() => gruposPorMes(filtradas, comps, categorias), [filtradas, comps, categorias]);

  const opcoesAnos = useMemo(() => {
    const s = new Set((linhas ?? []).map((l) => Number(l.competencia.slice(0, 4))));
    s.add(anoAtual);
    return [...s].sort((a, b) => b - a);
  }, [linhas, anoAtual]);

  const opcoesCategoria = useMemo(() => {
    const gs = [];
    categorias.forEach((c) => {
      let g = gs.find((x) => x.titulo === c.grupo.nome);
      if (!g) { g = { titulo: c.grupo.nome, cor: c.grupo.cor, itens: [] }; gs.push(g); }
      g.itens.push({ value: c.id, label: c.nome, grupo: c.grupo.nome });
    });
    gs.forEach((g) => g.itens.sort((a, b) => a.label.localeCompare(b.label, 'pt-BR')));
    return [{ titulo: 'Geral', itens: [{ value: 'sem', label: 'Sem categoria' }] }, ...gs];
  }, [categorias]);

  // A faixa "Agora": sempre o mês atual, sem os filtros.
  const hoje = competenciaAtual();
  const fixosPendentes = useMemo(() => situacaoDoMes(fixos.recs, fixos.lancs.filter((l) => l.competencia === hoje), {}, hoje).filter((s) => !s.lancamento), [fixos, hoje]);
  const parcelasProx = useMemo(() => comprometidoPorMes(parcelas, hoje).find((c) => c.competencia === addMeses(hoje, 1)), [parcelas, hoje]);

  const filtrando = Boolean(!(anos.length === 1 && anos[0] === anoAtual) || meses.length || tipo || origens.length || cats.length);
  const limpar = () => { setAnos([anoAtual]); setMeses([]); setTipo(''); setOrigens([]); setCats([]); };
  const abrirMes = (comp) => { lsSet('lancamentos_mes', comp); navigate('/lancamentos'); };
  const alternarOrigem = (k) => setOrigens((o) => (o.includes(k) ? o.filter((x) => x !== k) : [...o, k]));

  if (!linhas) return (<div><CabecalhoPagina titulo="Visão geral" /><PageLoading /></div>);

  const textoPer = textoPeriodo(anos, meses);
  const anterior = rAnt ? Object.fromEntries(comps.map((c, i) => [c, rAnt.porMes[i].gastos])) : null;
  const mediaMes = (v) => (r.meses ? Math.round(v / r.meses) : 0);
  const gastosPorMes = Object.fromEntries(r.porMes.map((m) => [m.competencia, m.gastos]));
  const vsAnt = rAnt && rAnt.gastos ? variacao(r.gastos, rAnt.gastos) : null;
  const series = [
    { key: 'entradas', rotulo: 'Entradas', cor: COR_ENTRADAS },
    { key: 'gastos', rotulo: 'Gastos', cor: COR_GASTOS },
    { key: 'saldo', rotulo: 'Saldo', cor: COR_SALDO, forma: 'linha' },
    ...(anterior ? [{ key: 'anterior', rotulo: `Gastos um ano antes`, cor: COR_ANTERIOR, forma: 'tracejado' }] : []),
  ];

  const exportarTabela = () => exportCsv(`visao-geral-${comps[0]}-${comps[comps.length - 1]}`,
    grupos.flatMap((g) => [{ nivel: 'Grupo', nome: g.nome, ...g }, ...g.categorias.map((c) => ({ nivel: 'Categoria', nome: `${g.nome} / ${c.nome}`, ...c }))]), [
      { key: 'nivel', label: 'Nível' },
      { key: 'nome', label: 'Nome' },
      ...comps.map((c) => ({ key: c, label: competenciaCurta(c), tipo: 'dinheiro', map: (x) => (x.meses[c] ?? 0) / 100 })),
      { key: 'total', label: 'Total', tipo: 'dinheiro', map: (x) => x.total / 100 },
      { key: 'media', label: 'Média', tipo: 'dinheiro', map: (x) => x.media / 100 },
    ]);

  const grafico = (altura) => (
    <ColunasEntradasGastos meses={r.porMes} anterior={anterior} ctrl={ctrl} onMes={abrirMes} altura={altura} />
  );

  return (
    <div>
      <CabecalhoPagina titulo="Visão geral"
        acessorio={<span className="hidden text-sm text-gray-500 sm:inline">{textoPer.replace(/^./, (c) => c.toUpperCase())} · {r.meses} {r.meses === 1 ? 'mês' : 'meses'} com lançamentos</span>} />

      {/* Os filtros: o período (como as segmentações da planilha) e os recortes, no trilho do Gestor. */}
      <FaixaProvider>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Trilho>
            <SegAnos anos={anos} opcoes={opcoesAnos} onChange={setAnos} />
            <DivisorFaixa />
            <SegMeses meses={meses} onChange={setMeses} />
            <DivisorFaixa />
            <SegUnico id="tipo" rotulo="Tipo" opcoes={OPCOES_TIPO} value={tipo} onChange={setTipo} padrao="" largura={160} />
            <DivisorFaixa />
            <SegMulti id="origem" rotulo="Origem" plural="origens" opcoes={OPCOES_ORIGEM} value={origens} onChange={setOrigens} largura={200} />
            <DivisorFaixa />
            <SegMulti id="categoria" rotulo="Categoria" opcoes={opcoesCategoria} value={cats} onChange={setCats} largura={280} busca="Buscar categoria ou grupo" />
          </Trilho>
          <LimparFiltros ativo={filtrando} onClick={limpar} />
          <span className="flex-1" />
          <Trilho>
            <SegUnico id="comparar" rotulo="Comparar" opcoes={OPCOES_COMPARAR} value={comparar} onChange={setComparar} padrao="anterior" mostraPadrao largura={190} />
          </Trilho>
        </div>
      </FaixaProvider>

      {(pendencias > 0 || fixosPendentes.length > 0 || parcelasProx) && (
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md border border-gray-200 bg-white px-4 py-2.5 text-[13px] text-gray-700">
          <span className="font-semibold text-gray-800">Agora, em {MESES_LONGOS[Number(hoje.slice(5)) - 1]}:</span>
          {pendencias > 0 && (
            <span><b className="font-semibold text-gray-900">{pendencias}</b> lançamento(s) a revisar <Link to="/pendencias" className="font-medium text-hx-2563eb hover:underline">Revisar →</Link></span>
          )}
          {fixosPendentes.length > 0 && (
            <span title={fixosPendentes.map((s) => s.rec.descricao).join(', ')}>
              <b className="font-semibold text-gray-900">{fixosPendentes.length}</b> gasto(s) fixo(s) a lançar{' '}
              <Link to="/fixos" onClick={() => lsSet('fixos_mes', hoje)} className="font-medium text-hx-2563eb hover:underline">Lançar →</Link>
            </span>
          )}
          {parcelasProx && (
            <span><b className="font-semibold text-gray-900">{formatBRL(parcelasProx.total)}</b> já comprometidos em parcelas para {MESES_LONGOS[Number(addMeses(hoje, 1).slice(5)) - 1]}</span>
          )}
        </div>
      )}

      <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Kpi rotulo="Entradas" valor={formatBRL(r.entradas)} cor="text-green-700" sub={`média ${formatBRL(mediaMes(r.entradas))}/mês`} />
        <Kpi rotulo="Gastos" valor={formatBRL(r.gastos)} sub={`média ${formatBRL(mediaMes(r.gastos))}/mês`}
          balao={{
            titulo: `Gastos · ${textoPer}`,
            itens: ORIGENS.map(([k, rot]) => ({ rotulo: rot, valor: formatBRL(r.porOrigem[k]) })),
            nota: rAnt ? (vsAnt === null ? 'Sem gastos no mesmo período do ano anterior.'
              : `vs. o mesmo período do ano anterior: ${vsAnt > 0 ? '+' : ''}${vsAnt}% (${formatBRL(rAnt.gastos)}).`) : 'Cartão conta no mês da fatura.',
          }} />
        <Kpi rotulo="Saldo" valor={formatBRL(r.saldo)} cor={r.saldo < 0 ? 'text-hx-c0393d' : undefined}
          sub={r.entradas ? `${Math.round((r.saldo / r.entradas) * 100)}% das entradas` : 'sem entradas no período'} />
        <Kpi rotulo="Lançamentos" valor={r.qtd.toLocaleString('pt-BR')} sub={`${r.meses ? Math.round(r.qtd / r.meses) : 0} por mês`} />
        <Kpi rotulo="Mês mais caro" valor={r.maisCaro ? nomeCompetencia(r.maisCaro.competencia).replace(/ de \d+$/, '') : '—'}
          sub={r.maisCaro ? `${formatBRL(r.maisCaro.gastos)} em gastos` : 'nenhum gasto no período'} />
      </div>

      <Cartao className="mt-3">
        <div className="flex flex-wrap items-center gap-2">
          <Titulo>Entradas × gastos por mês</Titulo>
          <span className="flex-1" />
          <LegendaSeries series={series} ctrl={ctrl} />
          <button type="button" onClick={() => setAmpliado(true)} title="Ampliar"
            className="inline-flex h-7 w-7 items-center justify-center rounded-[4px] text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-800">
            <IconAmpliar />
          </button>
        </div>
        {grafico(240)}
      </Cartao>

      <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
        <Cartao>
          <div className="mb-3"><Titulo>Gastos por origem</Titulo></div>
          <RoscaOrigem itens={ORIGENS.map(([key, rotulo]) => ({ key, rotulo, valor: r.porOrigem[key] }))} marcadas={origens} onClicar={alternarOrigem} />
        </Cartao>
        <Cartao>
          <BarrasGrupos grupos={grupos} total={r.gastos} meses={textoPer} />
        </Cartao>
      </div>

      <div className="mt-3">
        {grupos.length
          ? <TabelaGrupoMes grupos={grupos} comps={comps} total={r.gastos} porMes={gastosPorMes} onExportar={exportarTabela} />
          : null}
      </div>

      {ampliado && (
        <Modal open onClose={() => setAmpliado(false)} title={`Entradas × gastos · ${textoPer}`} maxWidth="max-w-6xl">
          <div className="mb-2 flex justify-end"><LegendaSeries series={series} ctrl={ctrl} /></div>
          {grafico(380)}
          <div className="mt-4 max-h-[260px] overflow-auto rounded-md border border-gray-200">
            <table className="w-full text-[12.5px]">
              <thead className="sticky top-0 bg-hx-f9fafb">
                <tr>{['Mês', 'Entradas', 'Gastos', 'Saldo', ...(rAnt ? ['Gastos um ano antes', 'Variação'] : []), 'Lançamentos'].map((h, i) => (
                  <th key={h} className={`border-b border-gray-200 px-3 py-2 text-[10.5px] font-semibold uppercase tracking-wide text-gray-500 ${i ? 'text-right' : 'text-left'}`}>{h}</th>
                ))}</tr>
              </thead>
              <tbody>
                {r.porMes.filter((m) => m.temDado).map((m) => {
                  const ant = anterior?.[m.competencia] ?? 0;
                  const v = variacao(m.gastos, ant);
                  return (
                    <tr key={m.competencia} className="hover:bg-hx-f9fafb">
                      <td className="border-b border-gray-100 px-3 py-1.5 text-gray-800">{nomeCompetencia(m.competencia)}</td>
                      <td className="border-b border-gray-100 px-3 text-right tabular-nums text-green-700">{formatBRL(m.entradas)}</td>
                      <td className="border-b border-gray-100 px-3 text-right tabular-nums text-gray-900">{formatBRL(m.gastos)}</td>
                      <td className={`border-b border-gray-100 px-3 text-right tabular-nums ${m.saldo < 0 ? 'text-hx-c0393d' : 'text-gray-700'}`}>{formatBRL(m.saldo)}</td>
                      {rAnt && <td className="border-b border-gray-100 px-3 text-right tabular-nums text-gray-500">{ant ? formatBRL(ant) : '—'}</td>}
                      {rAnt && <td className="border-b border-gray-100 px-3 text-right tabular-nums text-gray-500">{v === null ? '—' : `${v > 0 ? '+' : ''}${v}%`}</td>}
                      <td className="border-b border-gray-100 px-3 text-right tabular-nums text-gray-500">{m.qtd}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-gray-400">Total: {brlCurto(r.gastos)} em gastos e {brlCurto(r.entradas)} em entradas.</p>
        </Modal>
      )}
    </div>
  );
}
