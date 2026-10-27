import { useCallback, useEffect, useMemo, useState } from 'react';
import CabecalhoPagina from '../components/CabecalhoPagina.jsx';
import SearchInput from '../components/SearchInput.jsx';
import SegmentedFiltro from '../components/SegmentedFiltro.jsx';
import SelectSimples from '../components/SelectSimples.jsx';
import SortableTh from '../components/SortableTh.jsx';
import ListaVazia from '../components/ListaVazia.jsx';
import { PageLoading } from '../components/Spinner.jsx';
import { Bolinha, BotaoEditar, Etiqueta, SeletorMes } from '../components/Comuns.jsx';
import ModalLancamento from './ModalLancamento.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { listarDoMes } from '../api/lancamentos.js';
import { listarCartoes, listarCategorias } from '../api/cadastros.js';
import { useSort } from '../lib/useSort.js';
import { brlCurto, formatBRL } from '../lib/dinheiro.js';
import { competenciaAtual, formatDate, nomeCompetencia } from '../lib/format.js';
import { lsGet, lsSet } from '../lib/storage.js';

const FILTRO_TIPO = [{ valor: '', rotulo: 'Todos' }, { valor: 'saida', rotulo: 'Gastos' }, { valor: 'entrada', rotulo: 'Entradas' }];
const ORIGENS = { cartao: 'Cartão', fixo: 'Fixo', manual: 'Avulso', entrada: 'Entrada' };
const FILTRO_ORIGEM = [{ value: '', label: 'Todas as origens' }, ...Object.entries(ORIGENS).map(([value, label]) => ({ value, label }))];
const LS_MES = 'lancamentos_mes';

// "Cartão · Nubank · 3/10"
function textoOrigem(l) {
  const partes = [ORIGENS[l.origem]];
  if (l.cartao) partes.push(l.cartao.nome);
  if (l.parcela_total) partes.push(`${l.parcela_atual}/${l.parcela_total}`);
  return partes.join(' · ');
}

// Valor com sinal: entrada em verde com "+", gasto em grafite.
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
  const [linhas, setLinhas] = useState(null);
  const [categorias, setCategorias] = useState([]);
  const [cartoes, setCartoes] = useState([]);
  const [busca, setBusca] = useState('');
  const [tipo, setTipo] = useState('');
  const [origem, setOrigem] = useState('');
  const [categoria, setCategoria] = useState('');
  const [modal, setModal] = useState(null); // { item } ou {} para novo

  // Cadastros (categorias e cartões) uma vez; os lançamentos a cada troca de mês.
  useEffect(() => {
    Promise.all([listarCategorias(), listarCartoes()])
      .then(([c, k]) => { setCategorias(c); setCartoes(k); })
      .catch((err) => toast.error(err.message));
  }, [toast]);

  const carregar = useCallback(async () => {
    setLinhas(null);
    try { setLinhas(await listarDoMes(comp)); } catch (err) { toast.error(err.message); setLinhas([]); }
  }, [comp, toast]);
  useEffect(() => { carregar(); }, [carregar]);

  const filtradas = useMemo(() => {
    if (!linhas) return [];
    const termo = busca.trim().toLocaleLowerCase('pt-BR');
    return linhas
      .filter((l) => !tipo || l.tipo === tipo)
      .filter((l) => !origem || l.origem === origem)
      .filter((l) => !categoria || (categoria === 'sem' ? !l.categoria_id : l.categoria_id === categoria))
      .filter((l) => !termo || `${l.descricao} ${l.estabelecimento ?? ''} ${l.obs ?? ''} ${l.categoria?.nome ?? ''}`
        .toLocaleLowerCase('pt-BR').includes(termo))
      // Campos planos para a ordenação (o `useSort` lê `linha[campo]`).
      .map((l) => ({ ...l, categoria_nome: l.categoria?.nome ?? '', origem_texto: textoOrigem(l), valor_ordem: l.tipo === 'entrada' ? l.valor_centavos : -l.valor_centavos }));
  }, [linhas, busca, tipo, origem, categoria]);

  const sort = useSort(filtradas, 'data', 'desc', 'lancamentos_ordem', 'criado_em', 'desc');

  const totais = useMemo(() => {
    const t = { entradas: 0, gastos: 0 };
    filtradas.forEach((l) => { if (l.tipo === 'entrada') t.entradas += l.valor_centavos; else t.gastos += l.valor_centavos; });
    return { ...t, saldo: t.entradas - t.gastos };
  }, [filtradas]);

  const opcoesCategoria = useMemo(() => [
    { value: '', label: 'Todas as categorias' },
    { value: 'sem', label: 'Sem categoria' },
    ...categorias.map((c) => ({ value: c.id, label: `${c.nome} · ${c.grupo.nome}` })),
  ], [categorias]);

  const filtrando = Boolean(busca || tipo || origem || categoria);
  const limpar = () => { setBusca(''); setTipo(''); setOrigem(''); setCategoria(''); };

  return (
    <div>
      <CabecalhoPagina
        titulo="Lançamentos"
        acoes={(
          <>
            <span className="hidden sm:block"><SeletorMes comp={comp} onChange={setComp} /></span>
            <button type="button" className="btn-primary" onClick={() => setModal({})}>
              <span className="sm:hidden">Novo</span><span className="hidden sm:inline">Novo lançamento</span>
            </button>
          </>
        )}
      />
      {/* No celular o mês fica fora da faixa do topo (não cabe ao lado do título). */}
      <div className="mt-4 flex justify-center sm:hidden"><SeletorMes comp={comp} onChange={setComp} /></div>

      <div className="mt-4 grid grid-cols-3 gap-2 sm:mt-6 sm:gap-4">
        <Kpi rotulo="Entradas" centavos={totais.entradas} tom="verde" />
        <Kpi rotulo="Gastos" centavos={totais.gastos} />
        <Kpi rotulo="Saldo" centavos={totais.saldo} tom={totais.saldo < 0 ? 'vermelho' : undefined} />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <SearchInput className="w-full sm:w-64" placeholder="Buscar descrição…" value={busca} onChange={(e) => setBusca(e.target.value)} />
        <SegmentedFiltro opcoes={FILTRO_TIPO} value={tipo} onChange={setTipo} ariaLabel="Tipo" />
        <SelectSimples className="w-full sm:w-44" value={origem} onChange={setOrigem} opcoes={FILTRO_ORIGEM} />
        <SelectSimples className="w-full sm:w-64" value={categoria} onChange={setCategoria} opcoes={opcoesCategoria} />
        {filtrando && <button type="button" className="text-sm font-medium text-gray-500 hover:text-gray-800" onClick={limpar}>Limpar filtros</button>}
      </div>

      <div className="mt-4">
        {!linhas ? <PageLoading /> : sort.sorted.length === 0 ? (
          <ListaVazia>
            {filtrando ? 'Nenhum lançamento com esses filtros.' : `Nenhum lançamento em ${nomeCompetencia(comp).toLowerCase()}.`}
          </ListaVazia>
        ) : (
          <>
            {/* Computador: tabela. */}
            <div className="card hidden overflow-x-auto md:block">
              <table className="w-full">
                <thead className="border-b border-gray-200 bg-gray-50">
                  <tr>
                    <SortableTh label="Data" field="data" sort={sort} className="w-[110px]" />
                    <SortableTh label="Descrição" field="descricao" sort={sort} />
                    <SortableTh label="Categoria" field="categoria_nome" sort={sort} />
                    <SortableTh label="Origem" field="origem_texto" sort={sort} />
                    <SortableTh label="Valor" field="valor_ordem" sort={sort} className="text-right" />
                    <th className="table-th w-[52px]" aria-label="Ações" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {sort.sorted.map((l) => (
                    <tr key={l.id} className="group/linha hover:bg-gray-50">
                      <td className="table-td">{formatDate(l.data)}</td>
                      <td className="table-td max-w-[360px] truncate" title={l.obs || undefined}>
                        <span className="text-gray-800">{l.descricao}</span>
                        {l.revisar && <span className="ml-2"><Etiqueta tom="ambar">Revisar</Etiqueta></span>}
                      </td>
                      <td className="table-td">
                        {l.categoria
                          ? <span className="inline-flex items-center gap-1.5"><Bolinha cor={l.categoria.grupo?.cor} />{l.categoria.nome}</span>
                          : <span className="text-gray-400">—</span>}
                      </td>
                      <td className="table-td text-gray-500">{l.origem_texto}</td>
                      <td className="table-td text-right"><Valor l={l} /></td>
                      <td className="table-td">
                        <span className="opacity-0 transition-opacity group-hover/linha:opacity-100 focus-within:opacity-100">
                          <BotaoEditar onClick={() => setModal({ item: l })} />
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Celular: lista (tocar abre para editar). */}
            <ul className="card divide-y divide-gray-100 md:hidden">
              {sort.sorted.map((l) => (
                <li key={l.id}>
                  <button type="button" onClick={() => setModal({ item: l })} className="flex w-full items-center gap-3 px-3 py-2.5 text-left active:bg-gray-100">
                    <Bolinha cor={l.categoria?.grupo?.cor} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-gray-800">{l.descricao}</span>
                      <span className="block truncate text-xs text-gray-500">
                        {formatDate(l.data).slice(0, 5)} · {l.categoria?.nome ?? 'Sem categoria'} · {l.origem_texto}
                      </span>
                    </span>
                    <span className="shrink-0 text-sm"><Valor l={l} /></span>
                  </button>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-right text-xs text-gray-500">{sort.sorted.length} lançamento(s)</p>
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
