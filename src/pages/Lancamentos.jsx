import { useCallback, useEffect, useMemo, useState } from 'react';
import CabecalhoPagina from '../components/CabecalhoPagina.jsx';
import ListaVazia from '../components/ListaVazia.jsx';
import { PageLoading } from '../components/Spinner.jsx';
import { Bolinha } from '../components/Comuns.jsx';
import { DivisorFaixa, FaixaProvider, LimparFiltros, Trilho } from '../components/filtros/FaixaFiltros.jsx';
import { BuscaFaixa, SegMes, SegMulti, SegUnico } from '../components/filtros/Segmentos.jsx';
import GradeLancamentos from '../components/planilha/GradeLancamentos.jsx';
import ModalLancamento from './ModalLancamento.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { listarDoMes } from '../api/lancamentos.js';
import { listarCartoes, listarCategorias } from '../api/cadastros.js';
import { brlCurto, formatBRL } from '../lib/dinheiro.js';
import { competenciaAtual, formatDate, nomeCompetencia } from '../lib/format.js';
import { ORIGENS, textoOrigem } from '../lib/planilha.js';
import { lsGet, lsSet } from '../lib/storage.js';
import { exportCsv } from '../lib/exportCsv.js';

const OPCOES_TIPO = [{ value: '', label: 'Todos' }, { value: 'saida', label: 'Gastos' }, { value: 'entrada', label: 'Entradas' }];
const OPCOES_ORIGEM = Object.entries(ORIGENS).map(([value, label]) => ({ value, label }));
const OPCOES_REVISAR = [{ value: '', label: 'Todos' }, { value: 'sim', label: 'Só os a revisar', chip: 'A revisar' }];
const LS_MES = 'lancamentos_mes';

// A ordem da grade: a data mais nova em cima e, no mesmo dia, o último criado primeiro. Depois de
// carregar ela não se refaz sozinha (uma planilha não pula linhas enquanto se digita).
const ordenar = (linhas) => [...linhas].sort((a, b) => b.data.localeCompare(a.data) || String(b.criado_em).localeCompare(String(a.criado_em)));

const Valor = ({ l }) => (
  <span className={`tabular-nums ${l.tipo === 'entrada' ? 'font-semibold text-green-700' : 'text-gray-800'}`}>
    {l.tipo === 'entrada' ? '+' : '−'} {formatBRL(l.valor_centavos)}
  </span>
);

// No celular os três cartões dividem 375px: o valor vai abreviado ("R$ 18,5 mil"), o cheio no resto.
function Kpi({ rotulo, centavos, tom }) {
  const cor = tom === 'verde' ? 'text-green-700' : tom === 'vermelho' ? 'text-hx-c0393d' : 'text-gray-800';
  return (
    <div className="card min-w-0 px-3 py-2.5 sm:px-4 sm:py-3">
      <div className="truncate text-[10.5px] font-medium uppercase tracking-wide text-gray-500 sm:text-xs">{rotulo}</div>
      <div className={`mt-1 whitespace-nowrap font-semibold tabular-nums ${cor}`}>
        <span className="text-[15px] sm:hidden">{brlCurto(centavos)}</span>
        <span className="hidden text-xl sm:inline">{formatBRL(centavos)}</span>
      </div>
    </div>
  );
}

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

  useEffect(() => {
    Promise.all([listarCategorias(), listarCartoes()])
      .then(([c, k]) => { setCategorias(c); setCartoes(k); })
      .catch((err) => toast.error(err.message));
  }, [toast]);

  const carregar = useCallback(async () => {
    try { setTodas(ordenar(await listarDoMes(comp))); } catch (err) { toast.error(err.message); setTodas([]); }
  }, [comp, toast]);
  useEffect(() => { setTodas(null); carregar(); }, [carregar]);

  // Os filtros. Os RASCUNHOS da grade passam sempre: uma linha que se está digitando não pode sumir.
  const visiveis = useMemo(() => {
    if (!todas) return [];
    const termo = busca.trim().toLocaleLowerCase('pt-BR');
    return todas.filter((l) => l.rascunho || (
      (!tipo || l.tipo === tipo)
      && (!origens.length || origens.includes(l.origem))
      && (!cats.length || cats.includes(l.categoria_id ?? 'sem'))
      && (!revisar || l.revisar)
      && (!termo || `${l.descricao} ${l.estabelecimento ?? ''} ${l.obs ?? ''} ${l.categoria?.nome ?? ''}`.toLocaleLowerCase('pt-BR').includes(termo))
    ));
  }, [todas, busca, tipo, origens, cats, revisar]);
  const gravadas = useMemo(() => visiveis.filter((l) => !l.rascunho), [visiveis]);

  const totais = useMemo(() => {
    const t = { entradas: 0, gastos: 0 };
    gravadas.forEach((l) => { if (l.tipo === 'entrada') t.entradas += l.valor_centavos; else t.gastos += l.valor_centavos; });
    return { ...t, saldo: t.entradas - t.gastos };
  }, [gravadas]);

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
            <button type="button" className="btn-secondary hidden md:inline-flex" onClick={exportar} disabled={!gravadas.length}>Exportar CSV</button>
            <button type="button" className="btn-primary" onClick={() => setModal({})}>
              <span className="sm:hidden">Novo</span><span className="hidden sm:inline">Novo lançamento</span>
            </button>
          </>
        )}
      />

      <div className="mt-4 grid grid-cols-3 gap-2 sm:mt-6 sm:gap-4">
        <Kpi rotulo="Entradas" centavos={totais.entradas} tom="verde" />
        <Kpi rotulo="Gastos" centavos={totais.gastos} />
        <Kpi rotulo="Saldo" centavos={totais.saldo} tom={totais.saldo < 0 ? 'vermelho' : undefined} />
      </div>

      {/* A FAIXA DE FILTROS do Gestor: a busca e um trilho só, com o mês dentro dele. */}
      <FaixaProvider>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <BuscaFaixa className="w-full sm:w-[220px]" placeholder="Descrição ou observação" value={busca} onChange={(e) => setBusca(e.target.value)} />
          <Trilho className="max-w-full overflow-x-auto">
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
              <GradeLancamentos linhas={visiveis} todas={todas} setTodas={setTodas} categorias={categorias} comp={comp}
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
