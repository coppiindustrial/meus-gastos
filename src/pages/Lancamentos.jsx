import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
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
import { formatBRL } from '../lib/dinheiro.js';
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

export default function Lancamentos() {
  const toast = useToast();
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
