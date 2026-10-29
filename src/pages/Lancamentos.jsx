import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import CabecalhoPagina from '../components/CabecalhoPagina.jsx';
import ListaVazia from '../components/ListaVazia.jsx';
import Tooltip from '../components/Tooltip.jsx';
import { IconMais, IconUpload } from '../components/icons.jsx';
import { PageLoading } from '../components/Spinner.jsx';
import { Bolinha } from '../components/Comuns.jsx';
import { DivisorFaixa, FaixaProvider, LimparFiltros, Trilho } from '../components/filtros/FaixaFiltros.jsx';
import { BuscaFaixa, SegMes, SegMulti, SegUnico } from '../components/filtros/Segmentos.jsx';
import GradeLancamentos from '../components/planilha/GradeLancamentos.jsx';
import CartoesResumo from '../components/graficos/CartoesResumo.jsx';
import ModalLancamento from './ModalLancamento.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { listarDoMes } from '../api/lancamentos.js';
import { listarResumoMensal } from '../api/resumo.js';
import { listarCartoes, listarCategorias } from '../api/cadastros.js';
import { formatBRL } from '../lib/dinheiro.js';
import { competenciaAtual, formatDate, nomeCompetencia } from '../lib/format.js';
import { ORIGENS, ordenarLinhas, proximaOrdem, textoOrigem } from '../lib/planilha.js';
import { lsGet, lsSet } from '../lib/storage.js';
import { exportCsv } from '../lib/exportCsv.js';
import { mesesAte } from '../lib/resumo.js';
import { filtrar, resumoPeriodo } from '../lib/visaoGeral.js';

const OPCOES_TIPO = [{ value: '', label: 'Todos' }, { value: 'saida', label: 'Gastos' }, { value: 'entrada', label: 'Entradas' }];
const OPCOES_ORIGEM = Object.entries(ORIGENS).map(([value, label]) => ({ value, label }));
const OPCOES_REVISAR = [{ value: '', label: 'Todos' }, { value: 'sim', label: 'Só os a revisar', chip: 'A revisar' }];
const LS_MES = 'lancamentos_mes';
const LS_ORDEM = 'lancamentos_ordem';
const lerOrdem = () => { try { return JSON.parse(lsGet(LS_ORDEM)) || null; } catch { return null; } };

// A ORDEM DA GRADE: a escolhida no cabeçalho (a seta de cada coluna; `ordenarLinhas`) ou a padrão — a data mais
// nova em cima. Ela é aplicada ao CARREGAR e ao CLICAR, e não se refaz sozinha depois (uma planilha não pula
// linhas enquanto se digita: corrigir um valor não manda a linha para outro lugar).

const Valor = ({ l }) => (
  <span className={`tabular-nums ${l.tipo === 'entrada' ? 'font-semibold text-green-700' : 'text-gray-800'}`}>
    {l.tipo === 'entrada' ? '+' : '−'} {formatBRL(l.valor_centavos)}
  </span>
);

export default function Lancamentos() {
  const toast = useToast();
  const [comp, setCompEstado] = useState(() => lsGet(LS_MES) || competenciaAtual());
  const setComp = (c) => { setCompEstado(c); lsSet(LS_MES, c); };
  const [todas, setTodas] = useState(null); // as do mês (e os rascunhos da grade), na ordem da tela
  const [categorias, setCategorias] = useState([]);
  const [cartoes, setCartoes] = useState([]);
  const [busca, setBusca] = useState('');
  const [tipo, setTipo] = useState('');
  const [origens, setOrigens] = useState([]);
  const [cats, setCats] = useState([]);
  const [revisar, setRevisar] = useState('');
  const [modal, setModal] = useState(null); // { item } ou {} para novo
  const [resumo, setResumo] = useState([]); // a view resumo_mensal (para a curva dos meses)
  const [ordem, setOrdemEstado] = useState(lerOrdem);
  const ordemRef = useRef(ordem);
  const ordenarPor = (col) => {
    const nova = proximaOrdem(ordemRef.current, col);
    ordemRef.current = nova;
    setOrdemEstado(nova);
    lsSet(LS_ORDEM, JSON.stringify(nova));
    setTodas((ts) => (ts ? ordenarLinhas(ts, nova) : ts));
  };

  useEffect(() => {
    Promise.all([listarCategorias(), listarCartoes()])
      .then(([c, k]) => { setCategorias(c); setCartoes(k); })
      .catch((err) => toast.error(err.message));
  }, [toast]);

  const carregar = useCallback(async () => {
    try { setTodas(ordenarLinhas(await listarDoMes(comp), ordemRef.current)); } catch (err) { toast.error(err.message); setTodas([]); }
  }, [comp, toast]);
  useEffect(() => { setTodas(null); carregar(); }, [carregar]);
  useEffect(() => { listarResumoMensal().then(setResumo).catch((err) => toast.error(err.message)); }, [toast]);

  // Os filtros. Os RASCUNHOS da grade passam sempre: uma linha que se está digitando não pode sumir.
  // Os filtros MENOS o tipo: os cartões do resumo são um por tipo, e o tipo é escolhido clicando neles.
  const semTipo = useMemo(() => {
    if (!todas) return [];
    const termo = busca.trim().toLocaleLowerCase('pt-BR');
    return todas.filter((l) => l.rascunho || (
      (!origens.length || origens.includes(l.origem))
      && (!cats.length || cats.includes(l.categoria_id ?? 'sem'))
      && (!revisar || l.revisar)
      && (!termo || `${l.descricao} ${l.estabelecimento ?? ''} ${l.obs ?? ''} ${l.categoria?.nome ?? ''}`.toLocaleLowerCase('pt-BR').includes(termo))
    ));
  }, [todas, busca, origens, cats, revisar]);
  const visiveis = useMemo(() => semTipo.filter((l) => l.rascunho || !tipo || l.tipo === tipo), [semTipo, tipo]);
  const gravadas = useMemo(() => visiveis.filter((l) => !l.rascunho), [visiveis]);

  // A SÉRIE DO RESUMO: os últimos 6 meses da view (com origem e categoria do filtro), e o mês da tela
  // contado da própria grade — ele muda na hora em que se edita, e respeita também a busca.
  const serie = useMemo(() => {
    const meses = mesesAte(comp, 6);
    const r = resumoPeriodo(filtrar(resumo, { origens, cats }), meses).porMes;
    const t = { entradas: 0, gastos: 0 };
    semTipo.forEach((l) => { if (!l.rascunho) t[l.tipo === 'entrada' ? 'entradas' : 'gastos'] += l.valor_centavos; });
    r[r.length - 1] = { ...r[r.length - 1], ...t, saldo: t.entradas - t.gastos };
    return r;
  }, [resumo, comp, origens, cats, semTipo]);

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

  const filtrando = Boolean(busca || tipo || origens.length || cats.length || revisar);
  const limpar = () => { setBusca(''); setTipo(''); setOrigens([]); setCats([]); setRevisar(''); };

  // Exporta o que está na tela (mês + filtros + ordem), no padrão do Excel em pt-BR.
  const exportar = () => exportCsv(`lancamentos-${comp}`, gravadas.map((l) => ({ ...l, origem_texto: textoOrigem(l), categoria_nome: l.categoria?.nome ?? '' })), [
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
            {/* O GRUPO DO DRE (o mesmo dos Gastos fixos e do Importar): os ícones numa caixa só, o nome no tooltip. */}
            <div className="hidden overflow-hidden rounded-md border border-gray-300 bg-white md:inline-flex">
              <Tooltip label={`Exportar ${nomeCompetencia(comp).toLowerCase()} (CSV)`}>
                <button type="button" aria-label="Exportar CSV" onClick={exportar} disabled={!gravadas.length}
                  className="flex h-9 w-[38px] items-center justify-center text-gray-600 transition-colors hover:bg-gray-50 active:bg-gray-200 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent">
                  <IconUpload className="h-4 w-4" />
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

      <div className="mt-4 sm:mt-6">
        <CartoesResumo serie={serie} tipo={tipo} onTipo={setTipo} onMes={setComp} />
      </div>

      {/* A FAIXA DE FILTROS do Gestor: a busca e um trilho só, com o mês dentro dele. */}
      <FaixaProvider>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <BuscaFaixa className="w-full sm:w-[220px]" placeholder="Descrição ou observação" value={busca} onChange={(e) => setBusca(e.target.value)} />
          <Trilho>
            <SegMes value={comp} onChange={setComp} />
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

      <div className="mt-4">
        {!todas ? <PageLoading /> : (
          <>
            {/* Computador: a grade de planilha (com a linha em branco no fim, mesmo sem lançamentos). */}
            <div className="hidden md:block">
              <GradeLancamentos linhas={visiveis} todas={todas} setTodas={setTodas} categorias={categorias} comp={comp} ordem={ordem} onOrdenar={ordenarPor}
                onAbrir={(l) => setModal({ item: l })} onRecarregar={carregar}
                onCategoriaCriada={(cat) => setCategorias((c) => (c.some((x) => x.id === cat.id) ? c : [...c, cat]))} />
              <p className="mt-2 text-right text-xs text-gray-500">
                {gravadas.length} lançamento(s){filtrando ? ' no filtro' : ` em ${nomeCompetencia(comp).toLowerCase()}`}
              </p>
            </div>

            {/* Celular: só leitura, em lista (tocar abre o formulário). */}
            <div className="md:hidden">
              {gravadas.length === 0 ? (
                <ListaVazia>{filtrando ? 'Nenhum lançamento com esses filtros.' : `Nenhum lançamento em ${nomeCompetencia(comp).toLowerCase()}.`}</ListaVazia>
              ) : (
                <ul className="card divide-y divide-gray-100">
                  {gravadas.map((l) => (
                    <li key={l.id}>
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
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
      </div>

      {modal && (
        <ModalLancamento lancamento={modal.item} compPadrao={comp} categorias={categorias} cartoes={cartoes}
          onFechar={() => setModal(null)} onSalvo={() => { setModal(null); carregar(); }} />
      )}
    </div>
  );
}
