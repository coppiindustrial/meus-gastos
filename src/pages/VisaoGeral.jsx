import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import GridPersonalizavel from '../components/dashboard/GridPersonalizavel.jsx';
import CardAutoAltura from '../components/dashboard/CardAutoAltura.jsx';
import AvisoAgora from '../components/dashboard/AvisoAgora.jsx';
import { DivisorFaixa, FaixaProvider, LimparFiltros, Trilho } from '../components/filtros/FaixaFiltros.jsx';
import SegmentoFiltro, { OpcaoMenu } from '../components/filtros/SegmentoFiltro.jsx';
import { SegMulti, SegUnico } from '../components/filtros/Segmentos.jsx';
import { CartaoKpi, CORES_KPI, variacaoSaldo } from '../components/graficos/CartoesResumo.jsx';
import { COR_ENTRADAS, COR_GASTOS } from '../components/graficos/Graficos.jsx';
import {
  BarrasGrupos, COR_ANTERIOR, COR_FALTOU, COR_SALDO, COR_SOBROU, ColunasEntradasGastos, LinhasEntradasGastos, RoscaOrigem, SaldoDoMes,
} from '../components/graficos/GraficosVisao.jsx';
import LegendaSeries, { useDestaqueSeries } from '../components/graficos/LegendaSeries.jsx';
import Modal from '../components/Modal.jsx';
import AmpliadoEntradasGastos from '../components/graficos/AmpliadoEntradasGastos.jsx';
import AbasPilula from '../components/AbasPilula.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { contarPendencias, listarParcelasFuturas, listarResumoMensal } from '../api/resumo.js';
import { listarCategorias } from '../api/cadastros.js';
import { lancarFixo, listarLancamentosDeFixos, listarPulados, listarRecorrencias } from '../api/fixos.js';
import { comprometidoPorMes } from '../lib/resumo.js';
import { matrizDoAno, pendentesPorMes } from '../lib/fixos.js';
import { anoAnterior, filtrar, gruposPorMes, mediaPorMes, periodo, resumoPeriodo, variacao } from '../lib/visaoGeral.js';
import { brlCurto, formatBRL } from '../lib/dinheiro.js';
import { addMeses, competenciaAtual, competenciaCurta, nomeCompetencia } from '../lib/format.js';
import { exportCsv } from '../lib/exportCsv.js';
import { lsGet, lsSet } from '../lib/storage.js';
import useLinhasAnimadas, { atributosLinha } from '../lib/useLinhasAnimadas.js';
import { varCor } from '../lib/varCor.js';

// A VISÃO GERAL (tela inicial) — o Dashboard da planilha refeito no estilo do Gestor: não é a foto de
// um mês, é o retrato do período que os filtros escolhem. ANO e MESES funcionam como as segmentações
// da planilha (vários anos, vários meses); tipo, origem e categoria recortam por cima. As somas saem da
// view `resumo_mensal` (`lib/visaoGeral.js`); aqui só se escolhe o recorte e se desenha.
//
// O aviso "Agora" (no topo, no jeito do widget Alertas do Gestor — `AvisoAgora`) é o que a tela antiga
// (Resumo do mês) tinha de útil no dia a dia: o que falta revisar, os fixos ainda não lançados (do ano,
// até o mês atual, sem os "não teve") e o que já está comprometido em parcelas — sempre do mês ATUAL, sem
// depender dos filtros.

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
    <section className="card flex flex-col overflow-hidden !p-0">
      <div className="flex shrink-0 items-center gap-2 px-4 pb-2.5 pt-3.5">
        <Titulo>Grupo × mês <span className="font-medium normal-case tracking-normal text-gray-400">· em reais · o tom mais forte é o mês mais caro de cada linha</span></Titulo>
        <span className="flex-1" />
        <button type="button" onClick={onExportar} className="text-xs font-medium text-gray-500 underline hover:text-gray-800">Exportar CSV</button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
      <div ref={caixaRef}>
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
      </div>
    </section>
  );
}

// ------------------------------------------------------------ o catálogo do grid

// OS BLOCOS DA VISÃO GERAL no `GridPersonalizavel` (o grid do Dashboard Comercial do Gestor): cada um se
// arrasta, redimensiona, minimiza e liga/desliga em "Personalizar". `x/y/w/h` é a disposição padrão
// (12 colunas; uma linha = 22px + 16 de vão, a metade da do Gestor). Os números e a faixa "Agora" têm a ALTURA MEDIDA (crescem com o
// conteúdo); os gráficos têm `minPx`, o piso de largura em que ainda se leem.
const CATALOGO = [
  { id: 'vg_agora', titulo: 'Agora, no mês atual', area: 'vg_numeros', x: 0, y: 0, w: 12, h: 2, alturaMedida: true, minPx: 300 },
  { id: 'vg_kpis', titulo: 'Indicadores', area: 'vg_numeros', x: 0, y: 2, w: 12, h: 4, alturaMedida: true, minPx: 300 },
  { id: 'vg_meses', titulo: 'Entradas × gastos por mês', area: 'vg_graficos', x: 0, y: 6, w: 8, h: 10, minH: 7, minPx: 420 },
  { id: 'vg_origem', titulo: 'Gastos por origem', area: 'vg_graficos', x: 8, y: 6, w: 4, h: 19, minH: 6, minPx: 300 },
  { id: 'vg_saldo', titulo: 'Saldo do mês', area: 'vg_graficos', x: 0, y: 16, w: 8, h: 9, minH: 6, minPx: 420 },
  { id: 'vg_grupos', titulo: 'Gastos por grupo', area: 'vg_graficos', x: 0, y: 25, w: 12, h: 12, minH: 5, minPx: 360 },
  { id: 'vg_tabela', titulo: 'Grupo × mês', area: 'vg_tabelas', x: 0, y: 37, w: 12, h: 14, minH: 6, minPx: 520 },
];

// AS FORMAS DO "ENTRADAS × GASTOS": a escolha fica no próprio bloco (e lembrada no navegador).
const FORMAS = [
  { id: 'colunas', rotulo: 'Colunas', dica: 'Entradas (larga) e gastos (estreita, na frente) de cada mês' },
  { id: 'linhas', rotulo: 'Linhas', dica: 'As duas curvas no tempo, com a área embaixo' },
  { id: 'acumulado', rotulo: 'Acumulado', dica: 'Entradas e gastos somados ao longo do período' },
];
const LS_FORMA = 'visao_meses_forma';

// ------------------------------------------------------------ a tela

export default function VisaoGeral() {
  const toast = useToast();
  const navigate = useNavigate();
  const anoAtual = Number(competenciaAtual().slice(0, 4));
  const [linhas, setLinhas] = useState(null);
  const [carregando, setCarregando] = useState(false);
  const [categorias, setCategorias] = useState([]);
  const [parcelas, setParcelas] = useState([]);
  const [pendencias, setPendencias] = useState(0);
  const [fixos, setFixos] = useState({ recs: [], lancs: [], pulados: [] });
  const [anos, setAnos] = useState([anoAtual]);
  const [meses, setMeses] = useState([]);
  const [tipo, setTipo] = useState('');
  const [origens, setOrigens] = useState([]);
  const [cats, setCats] = useState([]);
  const [comparar, setCompararEstado] = useState(() => lsGet(LS_COMPARAR) || 'anterior');
  const setComparar = (v) => { setCompararEstado(v); lsSet(LS_COMPARAR, v); };
  const [forma, setFormaEstado] = useState(() => (FORMAS.some((f) => f.id === lsGet(LS_FORMA)) ? lsGet(LS_FORMA) : 'colunas'));
  const setForma = (v) => { setFormaEstado(v); lsSet(LS_FORMA, v); };
  const [ampliado, setAmpliado] = useState(false);
  const [gruposAmpliado, setGruposAmpliado] = useState(false);
  const ctrl = useDestaqueSeries();
  const ctrlSaldo = useDestaqueSeries();

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const [r, c, p, n, rec, lf, pul] = await Promise.all([
        listarResumoMensal(), listarCategorias(), listarParcelasFuturas(), contarPendencias(), listarRecorrencias(), listarLancamentosDeFixos(), listarPulados(),
      ]);
      setLinhas(r); setCategorias(c); setParcelas(p); setPendencias(n); setFixos({ recs: rec, lancs: lf, pulados: pul ?? [] });
    } catch (err) { toast.error(err.message); setLinhas((l) => l ?? []); } finally { setCarregando(false); }
  }, [toast]);
  useEffect(() => { carregar(); }, [carregar]);

  const comps = useMemo(() => periodo(anos, meses), [anos, meses]);
  const filtradas = useMemo(() => filtrar(linhas ?? [], { tipo, origens, cats }), [linhas, tipo, origens, cats]);
  const r = useMemo(() => resumoPeriodo(filtradas, comps), [filtradas, comps]);
  const compsAnt = useMemo(() => anoAnterior(comps), [comps]);
  const rAnt = useMemo(() => (comparar === 'anterior' ? resumoPeriodo(filtradas, compsAnt) : null), [filtradas, compsAnt, comparar]);
  const grupos = useMemo(() => gruposPorMes(filtradas, comps, categorias, competenciaAtual()), [filtradas, comps, categorias]);
  // O total de cada grupo e categoria no mesmo período um ano antes (a variação das barras por grupo).
  const gruposAnt = useMemo(() => {
    if (comparar !== 'anterior') return null;
    const m = new Map();
    gruposPorMes(filtradas, compsAnt, categorias).forEach((g) => {
      m.set(`g:${g.id}`, g.total);
      g.categorias.forEach((c) => m.set(`c:${g.id}:${c.id}`, c.total));
    });
    return m;
  }, [filtradas, compsAnt, categorias, comparar]);

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
  // Os fixos a lançar do ano até hoje (a mesma conta da linha "A lançar" da tela dos fixos).
  const fixosPendentes = useMemo(() => pendentesPorMes(matrizDoAno(fixos.recs, fixos.lancs, Number(hoje.slice(0, 4)), hoje, fixos.pulados)), [fixos, hoje]);
  const lancarDoAviso = async (rec, comp, valor) => {
    try {
      await lancarFixo(rec, comp, valor);
      toast.success(`${rec.descricao} lançado em ${competenciaCurta(comp)}.`);
      carregar();
    } catch (err) { toast.error(/duplicate|unique/i.test(err.message) ? 'Este fixo já foi lançado neste mês.' : err.message); carregar(); }
  };
  const parcelasProx = useMemo(() => comprometidoPorMes(parcelas, hoje).find((c) => c.competencia === addMeses(hoje, 1)), [parcelas, hoje]);

  const filtrando = Boolean(!(anos.length === 1 && anos[0] === anoAtual) || meses.length || tipo || origens.length || cats.length);
  const limpar = () => { setAnos([anoAtual]); setMeses([]); setTipo(''); setOrigens([]); setCats([]); };
  const abrirMes = (comp) => { lsSet('lancamentos_mes', comp); navigate('/lancamentos'); };
  const alternarOrigem = (k) => setOrigens((o) => (o.includes(k) ? o.filter((x) => x !== k) : [...o, k]));

  const textoPer = textoPeriodo(anos, meses);
  const anterior = rAnt ? Object.fromEntries(comps.map((c, i) => [c, rAnt.porMes[i].gastos])) : null;
  // AS MÉDIAS POR MÊS (`mediaPorMes`): só os meses em que o valor aparece — mês sem entrada cadastrada não
  // é "entrada zero" — e sem o mês em andamento quando há outros (pela metade, puxaria a média para baixo).
  const hojeComp = competenciaAtual();
  const mEnt = mediaPorMes(r.porMes, 'entradas', { emAndamento: hojeComp });
  const mGas = mediaPorMes(r.porMes, 'gastos', { emAndamento: hojeComp });
  const mQtd = mediaPorMes(r.porMes, 'qtd', { emAndamento: hojeComp });
  // O saldo pode ser zero ou negativo: entra todo mês com lançamento (não só os "maiores que zero").
  const mSal = mediaPorMes(r.porMes, 'saldo', { emAndamento: hojeComp, presente: (m) => m.temDado });
  const textoMedia = (m) => (m.meses ? `média ${formatBRL(m.media)}/mês · ${m.meses} ${m.meses === 1 ? 'mês' : 'meses'}` : 'nada no período');
  const tituloMedia = (oQue) => `A média conta só os meses com ${oQue} lançados${r.porMes.some((m) => m.competencia === hojeComp) ? ', sem o mês atual (em andamento)' : ''}.`;
  const gastosPorMes = Object.fromEntries(r.porMes.map((m) => [m.competencia, m.gastos]));
  const comDado = r.porMes.filter((m) => m.temDado);
  const series = [
    { key: 'entradas', rotulo: 'Entradas', cor: COR_ENTRADAS },
    { key: 'gastos', rotulo: 'Gastos', cor: COR_GASTOS },
    ...(anterior ? [{ key: 'anterior', rotulo: 'Um ano antes', cor: COR_ANTERIOR, forma: 'tracejado' }] : []),
  ];

  const exportarTabela = () => exportCsv(`visao-geral-${comps[0]}-${comps[comps.length - 1]}`,
    grupos.flatMap((g) => [{ nivel: 'Grupo', nome: g.nome, ...g }, ...g.categorias.map((c) => ({ nivel: 'Categoria', nome: `${g.nome} / ${c.nome}`, ...c }))]), [
      { key: 'nivel', label: 'Nível' },
      { key: 'nome', label: 'Nome' },
      ...comps.map((c) => ({ key: c, label: competenciaCurta(c), tipo: 'dinheiro', map: (x) => (x.meses[c] ?? 0) / 100 })),
      { key: 'total', label: 'Total', tipo: 'dinheiro', map: (x) => x.total / 100 },
      { key: 'media', label: 'Média', tipo: 'dinheiro', map: (x) => x.media / 100 },
    ]);

  // O mês a mês na forma escolhida, na altura de quem o contém (o bloco do grid, ou o ampliado — que passa
  // os SEUS meses: o período da tela ou o histórico inteiro).
  const graficoMeses = (porMes = r.porMes, ant = anterior, { rotulosAte } = {}) => {
    if (forma === 'linhas' || forma === 'acumulado') {
      return <LinhasEntradasGastos meses={porMes} anterior={ant} ctrl={ctrl} onMes={abrirMes} acumulado={forma === 'acumulado'} />;
    }
    return <ColunasEntradasGastos meses={porMes} anterior={ant} ctrl={ctrl} onMes={abrirMes} altura="auto" rotulosAte={rotulosAte} />;
  };
  // A troca de forma é a `AbasPilula` do Gestor (a pílula desliza), como as trocas dos widgets de lá.
  const seletorForma = (
    <AbasPilula abas={FORMAS.map((f) => ({ key: f.id, label: f.rotulo, aria: f.dica }))} valor={forma} onChange={setForma}
      variante="claro" altura={30} folga={2} />
  );

  // Os indicadores, no molde dos cartões dos Lançamentos (versão compacta): a curva é a do período.
  // A curva de entradas e de gastos pula o mês sem nenhum lançamento daquele tipo (pela mesma razão da média).
  const serieDe = (campo, soComValor = false) => comDado.filter((m) => !soComValor || m[campo] > 0).map((m) => ({ competencia: m.competencia, valor: m[campo] }));
  const vsAnt = (atual, antes) => (rAnt && antes ? variacao(atual, antes) : null);
  const tituloVs = 'Contra o mesmo período do ano anterior';
  // O `.card` por fora é o que o grid estica; a MEDIDA é do miolo, na altura natural (medir o card
  // esticado mediria a própria vaga, e o laço não fecharia — a regra do Gestor).
  const kpis = (
    <div className="card !border-0 !bg-transparent !shadow-none">
    <CardAutoAltura id="vg_kpis">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-[repeat(auto-fit,minmax(180px,1fr))]">
        <CartaoKpi compacto icone="entradas" cor={CORES_KPI.entradas} rotulo="Entradas" valor={formatBRL(r.entradas)} valorCurto={brlCurto(r.entradas)} corValor="text-green-700"
          variacao={vsAnt(r.entradas, rAnt?.entradas)} tituloVariacao={tituloVs} sub={textoMedia(mEnt)}
          serie={serieDe('entradas', true)} onMes={abrirMes} ativo={tipo === 'entrada'} onClicar={() => setTipo(tipo === 'entrada' ? '' : 'entrada')} titulo={`${tituloMedia('entradas')} Clique para ver só as entradas.`} />
        <CartaoKpi compacto icone="gastos" cor={CORES_KPI.gastos} rotulo="Gastos" valor={formatBRL(r.gastos)} valorCurto={brlCurto(r.gastos)}
          variacao={vsAnt(r.gastos, rAnt?.gastos)} sobeBom={false} tituloVariacao={tituloVs} sub={textoMedia(mGas)}
          serie={serieDe('gastos', true)} onMes={abrirMes} ativo={tipo === 'saida'} onClicar={() => setTipo(tipo === 'saida' ? '' : 'saida')} titulo={`${tituloMedia('gastos')} Clique para ver só os gastos.`} />
        <CartaoKpi compacto icone="saldo" cor={CORES_KPI.saldo} rotulo="Saldo" valor={formatBRL(r.saldo)} valorCurto={brlCurto(r.saldo)}
          corValor={r.saldo < 0 ? 'text-hx-c0393d' : 'text-gray-900'}
          variacao={rAnt ? variacaoSaldo(r.saldo, rAnt.saldo) : null} tituloVariacao={tituloVs}
          sub={[mSal.meses && `média ${formatBRL(mSal.media)}/mês`, r.entradas ? `${Math.round((r.saldo / r.entradas) * 100)}% das entradas` : 'sem entradas no período'].filter(Boolean).join(' · ')}
          serie={serieDe('saldo')} onMes={abrirMes} onClicar={() => setTipo('')} titulo="Clique para ver entradas e gastos" />
        <CartaoKpi compacto icone="lancamentos" cor={varCor('#6b7280', 'texto')} rotulo="Lançamentos" valor={r.qtd.toLocaleString('pt-BR')}
          variacao={vsAnt(r.qtd, rAnt?.qtd)} tituloVariacao={tituloVs} sub={`${mQtd.media.toLocaleString('pt-BR')} por mês`}
          serie={serieDe('qtd')} formatar={(v) => `${v.toLocaleString('pt-BR')} lançamentos`} onMes={abrirMes} />
        <CartaoKpi compacto icone="mes" cor={varCor('#ca8a04', 'texto')} rotulo="Mês mais caro"
          valor={r.maisCaro ? nomeCompetencia(r.maisCaro.competencia).replace(/ de \d+$/, '') : '—'}
          sub={r.maisCaro ? `${formatBRL(r.maisCaro.gastos)} em gastos` : 'nenhum gasto no período'}
          serie={serieDe('gastos')} onMes={abrirMes} />
      </div>
    </CardAutoAltura>
    </div>
  );

  const agora = (
    <div className="card">
    <CardAutoAltura id="vg_agora">
      <AvisoAgora hoje={hoje} pendentes={fixosPendentes} revisar={pendencias} parcelasProx={parcelasProx} onLancar={lancarDoAviso} />
    </CardAutoAltura>
    </div>
  );

  const renderWidget = (id) => {
    switch (id) {
      case 'vg_kpis': return kpis;
      case 'vg_agora': return agora;
      case 'vg_meses':
        return (
          // O CARD DO "ORÇADO × CONFIRMADO ANUAL" do Gestor (opção A do mockup de 28/10/2026): `p-5`, o
          // título de 13px com o período em cinza ao lado, as abas e o "ampliar" à direita, e a legenda
          // EMBAIXO do gráfico, separada dele por uma linha.
          <section className="card flex flex-col overflow-hidden p-5">
            <div className="mb-3 flex flex-wrap items-baseline gap-3">
              <span className="text-[13px] font-semibold text-gray-800">Entradas × gastos por mês</span>
              <span className="text-[11px] text-gray-400">{textoPer}</span>
              <div className="ml-auto flex shrink-0 items-center gap-2 self-center">
                {seletorForma}
                <button type="button" onClick={() => setAmpliado(true)} title="Ampliar"
                  className="inline-flex h-7 w-7 items-center justify-center rounded-[4px] text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-800">
                  <IconAmpliar />
                </button>
              </div>
            </div>
            <div className="min-h-0 flex-1">{graficoMeses()}</div>
            <LegendaSeries series={series} ctrl={ctrl} />
          </section>
        );
      case 'vg_saldo': {
        // O SALDO NUM BLOCO PRÓPRIO (opção A do mockup de 29/10/2026): logo abaixo das colunas e da mesma largura,
        // com a mesma calha — cada mês fica embaixo do seu. Os quatro números resumem o período.
        const melhor = comDado.reduce((a, m) => (!a || m.saldo > a.saldo ? m : a), null);
        const pior = comDado.reduce((a, m) => (!a || m.saldo < a.saldo ? m : a), null);
        const mesCurto = (m) => nomeCompetencia(m.competencia).replace(/ de \d+$/, '').toLowerCase().slice(0, 3);
        const num = (rot, valor, sub, cls = '') => (
          <div className="min-w-0">
            <div className="text-[10.5px] text-gray-400">{rot}</div>
            <div className={`text-[13.5px] font-bold tabular-nums ${cls || 'text-gray-900'}`}>{valor}</div>
            {sub && <div className="text-[11px] text-gray-400">{sub}</div>}
          </div>
        );
        return (
          <section className="card flex flex-col overflow-hidden p-5">
            <div className="mb-1 flex flex-wrap items-start gap-x-6 gap-y-2">
              <div className="flex items-baseline gap-3">
                <span className="text-[13px] font-semibold text-gray-800">Saldo do mês</span>
                <span className="text-[11px] text-gray-400">entradas − gastos · {textoPer}</span>
              </div>
              <div className="ml-auto flex flex-wrap gap-x-6 gap-y-1">
                {num(r.saldo >= 0 ? 'Sobrou no período' : 'Faltou no período', brlCurto(Math.abs(r.saldo)),
                  r.entradas ? `${Math.round((r.saldo / r.entradas) * 100)}% das entradas` : null, r.saldo < 0 ? 'text-hx-c0393d' : 'text-green-700')}
                {num('Média por mês', mSal.meses ? brlCurto(mSal.media) : '—', mSal.meses ? `${mSal.meses} ${mSal.meses === 1 ? 'mês' : 'meses'}` : null)}
                {melhor && num('Melhor mês', mesCurto(melhor), `${melhor.saldo >= 0 ? '+' : '−'}${brlCurto(Math.abs(melhor.saldo))}`)}
                {pior && comDado.length > 1 && num('Pior mês', mesCurto(pior), `${pior.saldo >= 0 ? '+' : '−'}${brlCurto(Math.abs(pior.saldo))}`)}
              </div>
            </div>
            <div className="min-h-0 flex-1">
              <SaldoDoMes meses={r.porMes} ctrl={ctrlSaldo} onMes={abrirMes} />
            </div>
            <LegendaSeries ctrl={ctrlSaldo} series={[
              { key: 'sobrou', rotulo: 'Sobrou', cor: COR_SOBROU },
              { key: 'faltou', rotulo: 'Faltou', cor: COR_FALTOU },
              { key: 'acumulado', rotulo: 'Acumulado no período', cor: COR_SALDO, forma: 'linha' },
            ]} />
          </section>
        );
      }
      case 'vg_origem':
        return (
          <section className="card flex flex-col overflow-hidden">
            <div className="px-4 pt-4"><Titulo>Gastos por origem</Titulo></div>
            {/* A rosca mede esta caixa e escolhe o arranjo que cabe; só rola num bloco menor que o mínimo. */}
            <div className="min-h-0 flex-1 overflow-auto px-4 pb-3 pt-2">
              <RoscaOrigem itens={ORIGENS.map(([key, rotulo]) => ({ key, rotulo, valor: r.porOrigem[key], antes: rAnt?.porOrigem[key] }))} marcadas={origens} onClicar={alternarOrigem} />
            </div>
          </section>
        );
      case 'vg_grupos':
        return (
          <section className="card flex flex-col overflow-hidden">
            <div className="min-h-0 flex-1 overflow-auto p-4"><BarrasGrupos grupos={grupos} total={r.gastos} meses={textoPer} comps={comDado.map((m) => m.competencia)} anterior={gruposAnt}
              onAmpliar={() => setGruposAmpliado(true)} /></div>
          </section>
        );
      case 'vg_tabela':
        return grupos.length
          ? <TabelaGrupoMes grupos={grupos} comps={comps} total={r.gastos} porMes={gastosPorMes} onExportar={exportarTabela} />
          : <section className="card p-4"><Titulo>Grupo × mês</Titulo><p className="mt-6 text-center text-sm text-gray-400">Nenhum gasto no período.</p></section>;
      default: return null;
    }
  };

  // Os filtros: o período (como as segmentações da planilha) e os recortes, no trilho do Gestor. Vão
  // ACIMA do grid (o `abaixo` do `GridPersonalizavel`), como a faixa do Dashboard Comercial.
  const filtros = (
    <FaixaProvider>
      <div className="flex flex-wrap items-center gap-2">
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
  );

  return (
    <>
      <GridPersonalizavel escopo="visao_v4" titulo="Visão geral"
        acessorio={linhas && <span className="hidden text-sm text-gray-500 sm:inline">{textoPer.replace(/^./, (c) => c.toUpperCase())} · {r.meses} {r.meses === 1 ? 'mês' : 'meses'} com lançamentos</span>}
        catalogo={CATALOGO} permitidos={CATALOGO} renderWidget={renderWidget} abaixo={filtros}
        pronto={!!linhas} onAtualizar={carregar} atualizando={carregando} />

      {/* O "Gastos por grupo" AMPLIADO: a lista inteira (grupos ou categorias), com tendência e variação. */}
      {gruposAmpliado && (
        <Modal open onClose={() => setGruposAmpliado(false)} title={`Gastos por grupo · ${textoPer}`} maxWidth="max-w-5xl">
          <div className="max-h-[70vh] overflow-auto pr-1">
            <BarrasGrupos grupos={grupos} total={r.gastos} meses={textoPer} comps={comDado.map((m) => m.competencia)} anterior={gruposAnt} semLimite />
          </div>
        </Modal>
      )}

      {ampliado && (
        <AmpliadoEntradasGastos onClose={() => setAmpliado(false)} linhas={filtradas} comps={comps} textoPer={textoPer}
          comparar={comparar === 'anterior'} forma={forma} seletorForma={seletorForma} series={series} ctrl={ctrl}
          onMes={abrirMes} desenhar={graficoMeses} />
      )}
    </>
  );
}
