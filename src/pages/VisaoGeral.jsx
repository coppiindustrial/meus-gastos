import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import GridPersonalizavel from '../components/dashboard/GridPersonalizavel.jsx';
import CardAutoAltura from '../components/dashboard/CardAutoAltura.jsx';
import AvisoAgora from '../components/dashboard/AvisoAgora.jsx';
import { DivisorFaixa, FaixaProvider, LimparFiltros, Trilho } from '../components/filtros/FaixaFiltros.jsx';
import SegPeriodoFiltro from '../components/filtros/SegPeriodoFiltro.jsx';
import { SegMulti, SegUnico } from '../components/filtros/Segmentos.jsx';
import { CartaoKpi, CORES_KPI, variacaoSaldo } from '../components/graficos/CartoesResumo.jsx';
import { CartaoCustoFixo, CartaoParcelas } from '../components/graficos/CartoesComprometido.jsx';

import { COR_ENTRADAS, COR_GASTOS } from '../components/graficos/Graficos.jsx';
import {
  BarrasGrupos, COR_ANTERIOR, COR_FALTOU, COR_SALDO, COR_SOBROU, CORES_ORIGEM, ColunasEntradasGastos, ForaDoNormal, HACHURA_PARCELAS, JaComprometido,
  LinhasEntradasGastos, ORIGENS_MES, OrigemPorMes, RoscaOrigem, SaldoDoMes,
} from '../components/graficos/GraficosVisao.jsx';
import LegendaSeries, { useDestaqueSeries } from '../components/graficos/LegendaSeries.jsx';
import AmpliadoEntradasGastos from '../components/graficos/AmpliadoEntradasGastos.jsx';
import AmpliadoGrupos from '../components/graficos/AmpliadoGrupos.jsx';
import BlocoGrupoMes from '../components/graficos/TabelaGrupoMes.jsx';
import AbasPilula from '../components/AbasPilula.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { contarPendencias, listarParcelasFuturas, listarResumoMensal } from '../api/resumo.js';
import { listarCartoes, listarCategorias } from '../api/cadastros.js';
import { lancarFixo, listarLancamentosDeFixos, listarPulados, listarRecorrencias } from '../api/fixos.js';
import { comprometidoPorMes } from '../lib/resumo.js';
import { matrizDoAno, pendentesPorMes } from '../lib/fixos.js';
import {
  anoAnterior, filtrar, foraDoNormal, gruposPorMes, custoFixo, jaComprometido, mediaPorMes, parcelasComprometidas, resumoPeriodo, variacao,
} from '../lib/visaoGeral.js';
import { brlCurto, formatBRL } from '../lib/dinheiro.js';
import { addMeses, competenciaAtual, competenciaCurta, nomeCompetencia } from '../lib/format.js';
import { exportCsv } from '../lib/exportCsv.js';
import { lsGet, lsSet } from '../lib/storage.js';
import { animarIcone, useMascararValores } from '../lib/ocultarValores.js';
import { useNoCelular } from '../lib/celular.js';
import FiltrosMovel from '../components/movel/FiltrosMovel.jsx';
import { IconOlho } from '../components/icons.jsx';
import { varCor } from '../lib/varCor.js';
import { compsDoPeriodo, ehPadrao, mesesDoPeriodo, periodoDeAnosMeses, periodoPadrao, textoDoPeriodo } from '../lib/periodoFiltro.js';

// A VISÃO GERAL (tela inicial) — o Dashboard da planilha refeito no estilo do Gestor: não é a foto de
// um mês, é o retrato do período que os filtros escolhem. ANO e MESES funcionam como as segmentações
// da planilha (vários anos, vários meses); tipo, origem e categoria recortam por cima. As somas saem da
// view `resumo_mensal` (`lib/visaoGeral.js`); aqui só se escolhe o recorte e se desenha.
//
// O aviso "Agora" (no topo, no jeito do widget Alertas do Gestor — `AvisoAgora`) é o que a tela antiga
// (Resumo do mês) tinha de útil no dia a dia: o que falta revisar, os fixos ainda não lançados (do ano,
// até o mês atual, sem os "não teve") e o que já está comprometido em parcelas — sempre do mês ATUAL, sem
// depender dos filtros.

const ORIGENS = [['cartao', 'Cartão (faturas)'], ['fixo', 'Gastos fixos'], ['manual', 'Avulsos']];
const OPCOES_TIPO = [{ value: '', label: 'Todos' }, { value: 'saida', label: 'Gastos' }, { value: 'entrada', label: 'Entradas' }];
const OPCOES_ORIGEM = [...ORIGENS, ['entrada', 'Entradas']].map(([value, label]) => ({ value, label }));
const OPCOES_COMPARAR = [{ value: 'anterior', label: 'Ano anterior', chip: 'Comparar: ano anterior' }, { value: 'nada', label: 'Sem comparação', chip: 'Sem comparação' }];
const LS_COMPARAR = 'visao_comparar';
const LS_OCULTAR = 'visao_ocultar';

// O PERÍODO (06/11/2026, opção B do mockup "O filtro de período"): o segmento `SegPeriodoFiltro` (components/filtros) no
// lugar do Ano + Meses de antes — mês, trimestre, semestre, acumulado, ano e 12 meses; as contas em lib/periodoFiltro.js.

// ------------------------------------------------------------ peças da tela

const Titulo = ({ children }) => <h2 className="m-0 text-[10.5px] font-bold uppercase tracking-[0.06em] text-gray-500">{children}</h2>;

const IconAmpliar = () => (
  <svg viewBox="0 0 24 24" className="h-[15px] w-[15px]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
    <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
  </svg>
);

// O GRUPO × MÊS mora em `components/graficos/TabelaGrupoMes.jsx` (o bloco, a tabela com o hover e o ampliado).

// NO CELULAR (04/11/2026, opção A do mockup "Meus Gastos no celular"): sem o grid (nem "Personalizar"), os blocos numa
// ORDEM FIXA, um embaixo do outro, cada um na altura que serve à tela estreita (`null` = a altura do conteúdo). O
// grupo × mês fica de fora: a tabela larga não cabe, e o "Gastos por grupo" (com Categorias) diz o mesmo.
const BLOCOS_MOVEL = [
  ['vg_agora', null], ['vg_kpis', null], ['vg_meses', 300], ['vg_saldo', 240], ['vg_origem_mes', 270],
  ['vg_origem', 330], ['vg_comprometido', 380], ['vg_fora', null], ['vg_grupos', 470],
];

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
  // OS TRÊS DE 03/11/2026 (mockup "Visão geral · novos gráficos", opções A, C e D): a origem mês a mês logo abaixo do
  // saldo (os meses alinhados), o já comprometido ao lado e o fora do normal embaixo, na largura toda.
  { id: 'vg_origem_mes', titulo: 'Gastos por origem, mês a mês', area: 'vg_graficos', x: 0, y: 25, w: 8, h: 10, minH: 6, minPx: 420 },
  { id: 'vg_comprometido', titulo: 'Já comprometido', area: 'vg_graficos', x: 8, y: 25, w: 4, h: 10, minH: 6, minPx: 300 },
  { id: 'vg_fora', titulo: 'Fora do normal', area: 'vg_graficos', x: 0, y: 35, w: 12, h: 8, minH: 5, minPx: 320 },
  { id: 'vg_grupos', titulo: 'Gastos por grupo', area: 'vg_graficos', x: 0, y: 43, w: 12, h: 12, minH: 5, minPx: 360 },
  { id: 'vg_tabela', titulo: 'Grupo × mês', area: 'vg_tabelas', x: 0, y: 55, w: 12, h: 14, minH: 6, minPx: 520 },
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
  const [cartoes, setCartoes] = useState([]); // os nomes da fatia de cada cartão no "Gastos por origem"
  const [pendencias, setPendencias] = useState(0);
  const [fixos, setFixos] = useState({ recs: [], lancs: [], pulados: [] });
  const [per, setPer] = useState(() => periodoPadrao(competenciaAtual()));
  const anos = per.anos;
  const meses = useMemo(() => mesesDoPeriodo(per) ?? [], [per]);
  const [tipo, setTipo] = useState('');
  const [origens, setOrigens] = useState([]);
  const [cats, setCats] = useState([]);
  const [comparar, setCompararEstado] = useState(() => lsGet(LS_COMPARAR) || 'anterior');
  const setComparar = (v) => { setCompararEstado(v); lsSet(LS_COMPARAR, v); };
  const [forma, setFormaEstado] = useState(() => (FORMAS.some((f) => f.id === lsGet(LS_FORMA)) ? lsGet(LS_FORMA) : 'colunas'));
  const setForma = (v) => { setFormaEstado(v); lsSet(LS_FORMA, v); };
  // O OLHO (04/11/2026, o do Gestor): fechado, todo valor da tela vira "•••" (`useMascararValores`), lembrado no
  // navegador. Para MOSTRAR de novo os blocos REMONTAM (`versao` no `key`): o React não relê o texto que o "•••" trocou.
  const [oculto, setOcultoEstado] = useState(() => lsGet(LS_OCULTAR) === 'sim');
  const [versao, setVersao] = useState(0);
  const alternarOculto = () => setOcultoEstado((o) => {
    lsSet(LS_OCULTAR, o ? '' : 'sim');
    if (o) setVersao((v) => v + 1);
    return !o;
  });
  useMascararValores(oculto);
  const movel = useNoCelular();
  const [filtrosMovel, setFiltrosMovel] = useState(false);
  const [ampliado, setAmpliado] = useState(false);
  const [gruposAmpliado, setGruposAmpliado] = useState(false);
  const ctrl = useDestaqueSeries();
  const ctrlSaldo = useDestaqueSeries();
  const ctrlOrigemMes = useDestaqueSeries();
  const ctrlComprometido = useDestaqueSeries();

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const [r, c, p, n, rec, lf, pul, cts] = await Promise.all([
        listarResumoMensal(), listarCategorias(), listarParcelasFuturas(), contarPendencias(), listarRecorrencias(), listarLancamentosDeFixos(), listarPulados(),
        listarCartoes().catch(() => []),
      ]);
      setLinhas(r); setCategorias(c); setParcelas(p); setPendencias(n); setFixos({ recs: rec, lancs: lf, pulados: pul ?? [] }); setCartoes(cts);
    } catch (err) { toast.error(err.message); setLinhas((l) => l ?? []); } finally { setCarregando(false); }
  }, [toast]);
  useEffect(() => { carregar(); }, [carregar]);

  const comps = useMemo(() => compsDoPeriodo(per), [per]);
  const compsComDado = useMemo(() => new Set((linhas ?? []).map((l) => l.competencia)), [linhas]);
  const filtradas = useMemo(() => filtrar(linhas ?? [], { tipo, origens, cats }), [linhas, tipo, origens, cats]);
  const r = useMemo(() => resumoPeriodo(filtradas, comps), [filtradas, comps]);
  const compsAnt = useMemo(() => anoAnterior(comps), [comps]);
  const rAnt = useMemo(() => (comparar === 'anterior' ? resumoPeriodo(filtradas, compsAnt) : null), [filtradas, compsAnt, comparar]);
  const grupos = useMemo(() => gruposPorMes(filtradas, comps, categorias, competenciaAtual()), [filtradas, comps, categorias]);
  const fora = useMemo(() => foraDoNormal(filtradas, comps, categorias, competenciaAtual()), [filtradas, comps, categorias]);
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
  // JÁ COMPROMETIDO: como o "Agora", do mês atual em diante e sem os filtros; o NORMAL é a média dos gastos dos 12 meses
  // fechados antes dele (os da tela mudariam com os filtros).
  const comprometido = useMemo(() => jaComprometido({ parcelas, recorrencias: fixos.recs, lancamentos: fixos.lancs, pulados: fixos.pulados, hoje }), [parcelas, fixos, hoje]);
  // O QUE A RENDA JÁ TEM COMPROMETIDO (09/11/2026, a opção A do mockup "Comprometido na Visão geral"): o custo fixo por mês e
  // as parcelas de cartão que vêm — dois números da fileira, sem os filtros
  const custo = useMemo(() => custoFixo({ recorrencias: fixos.recs, lancamentos: fixos.lancs, pulados: fixos.pulados, resumo: linhas ?? [], hoje }), [fixos, linhas, hoje]);
  const parc = useMemo(() => parcelasComprometidas({ parcelas, cartoes, resumo: linhas ?? [], hoje }), [parcelas, cartoes, linhas, hoje]);
  const mediaNormal = useMemo(() => {
    const doze = Array.from({ length: 12 }, (_, i) => addMeses(hoje, i - 12));
    return mediaPorMes(resumoPeriodo(linhas ?? [], doze).porMes, 'gastos').media;
  }, [linhas, hoje]);

  const filtrando = Boolean(!ehPadrao(per, competenciaAtual()) || tipo || origens.length || cats.length);
  const limpar = () => { setPer(periodoPadrao(competenciaAtual())); setTipo(''); setOrigens([]); setCats([]); };
  const abrirMes = (comp) => { lsSet('lancamentos_mes', comp); navigate('/lancamentos'); };
  const alternarOrigem = (k) => setOrigens((o) => (o.includes(k) ? o.filter((x) => x !== k) : [...o, k]));

  const textoPer = textoDoPeriodo(per);
  // "UM ANO ANTES" SÓ COM DADO (05/11/2026): sem o ano anterior no app, a série era uma linha colada no zero e a legenda
  // a mostrava à toa.
  const anterior = rAnt && rAnt.porMes.some((m) => m.gastos > 0) ? Object.fromEntries(comps.map((c, i) => [c, rAnt.porMes[i].gastos])) : null;
  // AS MÉDIAS POR MÊS (`mediaPorMes`): só os meses em que o valor aparece — mês sem entrada cadastrada não
  // é "entrada zero" — e sem o mês em andamento quando há outros (pela metade, puxaria a média para baixo).
  const hojeComp = competenciaAtual();
  const mEnt = mediaPorMes(r.porMes, 'entradas', { emAndamento: hojeComp });
  const mGas = mediaPorMes(r.porMes, 'gastos', { emAndamento: hojeComp });
  // O saldo pode ser zero ou negativo: entra todo mês com lançamento (não só os "maiores que zero").
  const mSal = mediaPorMes(r.porMes, 'saldo', { emAndamento: hojeComp, presente: (m) => m.temDado });
  const textoMedia = (m) => (m.meses ? `média ${formatBRL(m.media)}/mês · ${m.meses} ${m.meses === 1 ? 'mês' : 'meses'}` : 'nada no período');
  const tituloMedia = (oQue) => `A média conta só os meses com ${oQue} lançados${r.porMes.some((m) => m.competencia === hojeComp) ? ', sem o mês atual (em andamento)' : ''}.`;
  const gastosPorMes = Object.fromEntries(r.porMes.map((m) => [m.competencia, m.gastos]));
  const comDado = r.porMes.filter((m) => m.temDado);
  const series = [
    { key: 'entradas', rotulo: 'Entradas', cor: COR_ENTRADAS },
    { key: 'gastos', rotulo: 'Gastos', cor: COR_GASTOS },
    // a linha do saldo do mês volta (29/10/2026, a pedido): o bloco "Saldo do mês" detalha, mas aqui ela ajuda a ler
    ...(forma !== 'acumulado' ? [{ key: 'saldo', rotulo: 'Saldo', cor: COR_SALDO, forma: 'linha' }] : []),
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
      return <LinhasEntradasGastos meses={porMes} anterior={ant} ctrl={ctrl} onMes={abrirMes} acumulado={forma === 'acumulado'} rotulosAte={rotulosAte} />;
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
        {/* o "Lançamentos" saiu (09/11/2026, a pedido) para o custo fixo e as parcelas */}
        <CartaoKpi compacto icone="mes" cor={varCor('#ca8a04', 'texto')} rotulo="Mês mais caro"
          valor={r.maisCaro ? nomeCompetencia(r.maisCaro.competencia).replace(/ de \d+$/, '') : '—'}
          sub={r.maisCaro ? `${formatBRL(r.maisCaro.gastos)} em gastos` : 'nenhum gasto no período'}
          serie={serieDe('gastos')} onMes={abrirMes} />
        <CartaoCustoFixo custo={custo} onClicar={() => navigate('/fixos')} />
        <CartaoParcelas parc={parc} onClicar={() => navigate('/cartoes')} />
      </div>
    </CardAutoAltura>
    </div>
  );

  // OS NÚMEROS NO CELULAR: seis, 2 × 3 (os quatro e, desde 09/11/2026, o custo fixo e as parcelas), e a média em número curto — o cheio
  // ("média R$ 43.564,83/mês") não cabia no cartão de meia largura.
  const mediaCurta = (m) => (m.meses ? `${brlCurto(m.media)}/mês` : 'nada no período');
  const kpisMovel = (
    <div className="grid grid-cols-2 gap-2">
      <CartaoKpi compacto icone="entradas" cor={CORES_KPI.entradas} rotulo="Entradas" valor={formatBRL(r.entradas)} valorCurto={brlCurto(r.entradas)} corValor="text-green-700"
        variacao={vsAnt(r.entradas, rAnt?.entradas)} sub={mediaCurta(mEnt)} serie={serieDe('entradas', true)} ativo={tipo === 'entrada'} onClicar={() => setTipo(tipo === 'entrada' ? '' : 'entrada')} />
      <CartaoKpi compacto icone="gastos" cor={CORES_KPI.gastos} rotulo="Gastos" valor={formatBRL(r.gastos)} valorCurto={brlCurto(r.gastos)}
        variacao={vsAnt(r.gastos, rAnt?.gastos)} sobeBom={false} sub={mediaCurta(mGas)} serie={serieDe('gastos', true)} ativo={tipo === 'saida'} onClicar={() => setTipo(tipo === 'saida' ? '' : 'saida')} />
      <CartaoKpi compacto icone="saldo" cor={CORES_KPI.saldo} rotulo="Saldo" valor={formatBRL(r.saldo)} valorCurto={brlCurto(r.saldo)}
        corValor={r.saldo < 0 ? 'text-hx-c0393d' : 'text-gray-900'} variacao={rAnt ? variacaoSaldo(r.saldo, rAnt.saldo) : null}
        sub={r.entradas ? `${Math.round((r.saldo / r.entradas) * 100)}% das entradas` : 'sem entradas'} serie={serieDe('saldo')} onClicar={() => setTipo('')} />
      <CartaoKpi compacto icone="mes" cor={varCor('#ca8a04', 'texto')} rotulo="Mês mais caro"
        valor={r.maisCaro ? nomeCompetencia(r.maisCaro.competencia).replace(/ de \d+$/, '') : '—'}
        sub={r.maisCaro ? `${brlCurto(r.maisCaro.gastos)} em gastos` : 'nenhum gasto'} serie={serieDe('gastos')} />
      <CartaoCustoFixo custo={custo} />
      <CartaoParcelas parc={parc} />
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
        // com a mesma calha — cada mês fica embaixo do seu. Os quatro números (sobrou, média, melhor e pior mês) saíram
        // em 29/10/2026: o cartão do Saldo nos indicadores já diz o total e a média.
        return (
          <section className="card flex flex-col overflow-hidden p-5">
            <div className="mb-1 flex items-baseline gap-3">
              <span className="text-[13px] font-semibold text-gray-800">Saldo do mês</span>
              <span className="text-[11px] text-gray-400">entradas − gastos · {textoPer}</span>
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
      case 'vg_origem_mes':
        // GASTOS POR ORIGEM, MÊS A MÊS (opção A): o chrome do "Saldo do mês", logo abaixo dele; a legenda isola a origem.
        return (
          <section className="card flex flex-col overflow-hidden p-5">
            <div className="mb-1 flex items-baseline gap-3">
              <span className="text-[13px] font-semibold text-gray-800">Gastos por origem, mês a mês</span>
              <span className="text-[11px] text-gray-400">{textoPer}{ctrlOrigemMes.fixas.length ? ' · na escala do que está marcado' : ''}</span>
            </div>
            <div className="min-h-0 flex-1"><OrigemPorMes meses={r.porMes} ctrl={ctrlOrigemMes} onMes={abrirMes} /></div>
            <LegendaSeries ctrl={ctrlOrigemMes} series={ORIGENS_MES.map(([key, rotulo]) => ({ key, rotulo, cor: CORES_ORIGEM[key] }))} />
          </section>
        );
      case 'vg_comprometido':
        // JÁ COMPROMETIDO (opção C, em barras deitadas): as parcelas que vêm e os fixos de cada mês daqui para a frente.
        return (
          <section className="card flex flex-col overflow-hidden p-5">
            <div className="mb-1 flex flex-wrap items-baseline gap-x-3">
              <span className="text-[13px] font-semibold text-gray-800">Já comprometido</span>
              <span className="text-[11px] text-gray-400">parcelas que vêm + gastos fixos</span>
            </div>
            <div className="min-h-0 flex-1 overflow-auto"><JaComprometido meses={comprometido} media={mediaNormal} ctrl={ctrlComprometido} /></div>
            <LegendaSeries ctrl={ctrlComprometido} series={[
              { key: 'fixos', rotulo: 'Gastos fixos', cor: CORES_ORIGEM.fixo },
              { key: 'parcelas', rotulo: 'Parcelas que vêm', cor: HACHURA_PARCELAS },
              { key: 'media', rotulo: 'Média dos gastos', cor: COR_ANTERIOR, forma: 'tracejado' },
            ]} />
          </section>
        );
      case 'vg_fora':
        // FORA DO NORMAL (opção D): o último mês fechado do período contra a média de cada categoria.
        return (
          <section className="card flex flex-col overflow-hidden p-5">
            <div className="mb-2 flex flex-wrap items-baseline gap-x-3">
              <span className="text-[13px] font-semibold text-gray-800">Fora do normal</span>
              {fora?.base.length > 0 && <span className="text-[11px] text-gray-400">{nomeCompetencia(fora.mes).toLowerCase()} contra a média de cada categoria nos {fora.base.length} {fora.base.length === 1 ? 'mês' : 'meses'} antes</span>}
            </div>
            <div className="min-h-0 flex-1 overflow-auto"><ForaDoNormal dados={fora} onMes={abrirMes} /></div>
          </section>
        );
      case 'vg_origem':
        return (
          <section className="card flex flex-col overflow-hidden">
            <div className="px-4 pt-4"><Titulo>Gastos por origem</Titulo></div>
            {/* A rosca mede esta caixa e escolhe o arranjo que cabe; só rola num bloco menor que o mínimo. */}
            <div className="min-h-0 flex-1 overflow-auto px-4 pb-3 pt-2">
              {/* Dentro de "Cartão (faturas)", a fatia de cada cartão (com a migration 010), do maior ao menor. */}
              <RoscaOrigem itens={ORIGENS.map(([key, rotulo]) => ({
                key, rotulo, valor: r.porOrigem[key], antes: rAnt?.porOrigem[key],
                partes: key === 'cartao' ? Object.entries(r.porCartao).filter(([, v]) => v > 0)
                  .map(([id, v]) => ({ key: id, rotulo: cartoes.find((c) => c.id === id)?.nome ?? 'Outro cartão', valor: v }))
                  .sort((a, b) => b.valor - a.valor) : undefined,
              }))} marcadas={origens} onClicar={alternarOrigem} />
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
          ? <BlocoGrupoMes grupos={grupos} comps={comps} total={r.gastos} porMes={gastosPorMes} periodo={textoPer} onMes={abrirMes} onExportar={exportarTabela} />
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
          <SegPeriodoFiltro per={per} onChange={setPer} hoje={competenciaAtual()} anos={opcoesAnos} comDado={compsComDado} />
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

  // A TELA NO CELULAR: o botão dos filtros (a folha de baixo, `FiltrosMovel`), o comparar e o olho na primeira
  // linha; os blocos na ordem fixa (`BLOCOS_MOVEL`). Os ampliados abrem em tela cheia (o `Modal` no celular).
  if (movel) {
    const extras = (tipo ? 1 : 0) + (origens.length ? 1 : 0) + (cats.length ? 1 : 0);
    const opcoesCatMovel = opcoesCategoria.flatMap((g) => g.itens.map((c) => ({ value: c.value, label: c.label, sub: g.titulo === 'Geral' ? undefined : g.titulo, cor: g.cor })));
    return (
      <>
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setFiltrosMovel(true)}
              className="toque flex h-[36px] min-w-0 items-center gap-2 rounded-[10px] border border-gray-300 bg-white px-3 text-[13.5px] font-semibold text-gray-800">
              <svg viewBox="0 0 24 24" className="h-[15px] w-[15px] shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M4 6h16M7 12h10M10 18h4" /></svg>
              <span className="truncate">{per.modo === 'ano' ? `${textoPer} · ano todo` : textoPer}</span>
              {extras > 0 && <span className="shrink-0 rounded-full bg-gray-800 px-1.5 text-[11px] leading-[18px] text-white inverte-no-escuro">+{extras}</span>}
            </button>
            <span className="flex-1" />
            <button type="button" onClick={() => setComparar(comparar === 'anterior' ? 'nada' : 'anterior')} aria-pressed={comparar === 'anterior'}
              aria-label={comparar === 'anterior' ? 'Comparando com o ano anterior' : 'Sem comparação'}
              className="toque toque-icone flex h-[36px] shrink-0 items-center gap-1.5 rounded-[10px] border border-gray-300 bg-white px-2.5 text-[13px] font-semibold text-gray-500 aria-pressed:text-gray-900">
              <svg viewBox="0 0 24 24" className="h-[16px] w-[16px]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M7 4 3 8l4 4M3 8h13M17 12l4 4-4 4M21 16H8" /></svg>
              {comparar === 'anterior' ? anos.map((a) => a - 1).sort().join(', ') : 'não'}
            </button>
            <button type="button" onClick={(e) => { animarIcone(e.currentTarget); alternarOculto(); }} aria-pressed={oculto}
              aria-label={oculto ? 'Mostrar os valores' : 'Ocultar os valores'}
              className="toque toque-icone flex h-[36px] w-[40px] shrink-0 items-center justify-center rounded-[10px] border border-gray-300 bg-white text-gray-600 aria-pressed:text-gray-900">
              <IconOlho fechado={oculto} className="h-[18px] w-[18px]" />
            </button>
          </div>
          {!linhas ? <div className="py-16 text-center text-[13px] text-gray-400">Carregando…</div> : BLOCOS_MOVEL.map(([id, altura]) => (
            <div key={`${id}-${versao}`} style={altura ? { height: altura } : undefined} className={altura ? 'flex flex-col [&>*]:min-h-0 [&>*]:flex-1' : ''}>
              {id === 'vg_kpis' ? kpisMovel : renderWidget(id)}
            </div>
          ))}
        </div>
        <FiltrosMovel aberto={filtrosMovel} onFechar={() => setFiltrosMovel(false)}
          valor={{ anos, meses, tipo, origens, cats }} vazio={{ anos: [anoAtual], meses: [], tipo: '', origens: [], cats: [] }}
          onAplicar={(v) => { setPer(periodoDeAnosMeses(per, v.anos, v.meses)); setTipo(v.tipo); setOrigens(v.origens); setCats(v.cats); }}
          mais={2} campos={[
            { tipo: 'pilulas', campo: 'anos', rotulo: 'Ano', multi: true, minimo: 1, opcoes: opcoesAnos.map((a) => ({ value: a, label: String(a) })) },
            { tipo: 'meses', campo: 'meses', rotulo: 'Meses' },
            { tipo: 'unico', campo: 'tipo', rotulo: 'Tipo', opcoes: OPCOES_TIPO },
            { tipo: 'lista', campo: 'origens', rotulo: 'Origem', plural: 'origens', opcoes: OPCOES_ORIGEM },
            { tipo: 'lista', campo: 'cats', rotulo: 'Categoria', plural: 'categorias', opcoes: opcoesCatMovel },
          ]} />
        {gruposAmpliado && (
          <AmpliadoGrupos onClose={() => setGruposAmpliado(false)} grupos={grupos} total={r.gastos} meses={textoPer}
            comps={comDado.map((m) => m.competencia)} anterior={gruposAnt} />
        )}
        {ampliado && (
          <AmpliadoEntradasGastos onClose={() => setAmpliado(false)} linhas={filtradas} comps={comps} textoPer={textoPer}
            comparar={comparar === 'anterior'} forma={forma} seletorForma={seletorForma} series={series} ctrl={ctrl}
            onMes={abrirMes} desenhar={graficoMeses} />
        )}
      </>
    );
  }

  return (
    <>
      <GridPersonalizavel escopo="visao_v5" titulo="Visão geral"
        acessorio={linhas && <span className="hidden text-sm text-gray-500 sm:inline">{textoPer.replace(/^./, (c) => c.toUpperCase())} · {r.meses} {r.meses === 1 ? 'mês' : 'meses'} com lançamentos</span>}
        catalogo={CATALOGO} permitidos={CATALOGO} renderWidget={(id) => <Fragment key={`${id}-${versao}`}>{renderWidget(id)}</Fragment>} abaixo={filtros}
        pronto={!!linhas} onAtualizar={carregar} atualizando={carregando} oculto={oculto} onOcultar={alternarOculto} />

      {/* O "Gastos por grupo" AMPLIADO: a lista inteira (grupos ou categorias) no painel do Gestor. */}
      {gruposAmpliado && (
        <AmpliadoGrupos onClose={() => setGruposAmpliado(false)} grupos={grupos} total={r.gastos} meses={textoPer}
          comps={comDado.map((m) => m.competencia)} anterior={gruposAnt} />
      )}

      {ampliado && (
        <AmpliadoEntradasGastos onClose={() => setAmpliado(false)} linhas={filtradas} comps={comps} textoPer={textoPer}
          comparar={comparar === 'anterior'} forma={forma} seletorForma={seletorForma} series={series} ctrl={ctrl}
          onMes={abrirMes} desenhar={graficoMeses} />
      )}
    </>
  );
}
