import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import CabecalhoPagina from '../components/CabecalhoPagina.jsx';
import Modal from '../components/Modal.jsx';
import SegmentedFiltro from '../components/SegmentedFiltro.jsx';
import ModalCategoria from '../components/ModalCategoria.jsx';
import { PageLoading } from '../components/Spinner.jsx';
import { Bolinha, BotaoAcao, BotaoEditar, BotaoExcluir, Campo, Etiqueta, RodapeForm } from '../components/Comuns.jsx';
import { DivisorFaixa, FaixaProvider, LimparFiltros, Trilho } from '../components/filtros/FaixaFiltros.jsx';
import { BuscaFaixa, SegMes, SegUnico } from '../components/filtros/Segmentos.jsx';
import { IconExpandirTudo, IconMais } from '../components/icons.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { useConfirmacao } from '../context/ConfirmContext.jsx';
import {
  contarUsoCategoria, criarCategoriasSugeridas, excluirCategoria, excluirGrupo, listarCategorias, listarGrupos,
  salvarGrupo,
} from '../api/cadastros.js';
import { listarResumoMensal } from '../api/resumo.js';
import { CORES_GRUPO, GRUPOS_SUGERIDOS } from '../lib/sugestoes.js';
import { usoPorCategoria } from '../lib/usoCategorias.js';
import { formatBRL } from '../lib/dinheiro.js';
import { competenciaAtual, competenciaCurta } from '../lib/format.js';
import { lsGet, lsSet } from '../lib/storage.js';
import useLinhasAnimadas, { atributosLinha } from '../lib/useLinhasAnimadas.js';

const TIPOS = [{ valor: 'saida', rotulo: 'Gasto' }, { valor: 'entrada', rotulo: 'Entrada' }];

function ModalGrupo({ grupo, onFechar, onSalvo }) {
  const toast = useToast();
  const [form, setForm] = useState(() => grupo ?? { nome: '', tipo: 'saida', cor: CORES_GRUPO[0] });
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);
  const enviar = async (e) => {
    e.preventDefault();
    if (!form.nome.trim()) { setErro('Informe o nome do grupo.'); return; }
    setSalvando(true);
    try {
      await salvarGrupo(form);
      toast.success(grupo?.id ? 'Grupo atualizado.' : 'Grupo criado.');
      onSalvo();
    } catch (err) {
      setErro(/duplicate|unique/i.test(err.message) ? 'Já existe um grupo com esse nome.' : err.message);
    } finally { setSalvando(false); }
  };
  return (
    <Modal open onClose={onFechar} title={grupo?.id ? 'Editar grupo' : 'Novo grupo'} maxWidth="max-w-md">
      <form onSubmit={enviar} className="space-y-4">
        <Campo rotulo="Nome" erro={erro}>
          <input className="input" autoFocus value={form.nome} onChange={(e) => { setForm({ ...form, nome: e.target.value }); setErro(''); }} />
        </Campo>
        <Campo rotulo="Tipo">
          <SegmentedFiltro opcoes={TIPOS} value={form.tipo} onChange={(tipo) => setForm({ ...form, tipo })} ariaLabel="Tipo do grupo" />
        </Campo>
        <Campo rotulo="Cor">
          <div className="flex flex-wrap gap-2">
            {CORES_GRUPO.map((cor) => (
              <button key={cor} type="button" onClick={() => setForm({ ...form, cor })} aria-label={`Cor ${cor}`}
                className={`h-7 w-7 rounded-md transition ${form.cor === cor ? 'ring-2 ring-gray-800 ring-offset-2' : 'hover:scale-110'}`}
                style={{ background: cor }} />
            ))}
          </div>
        </Campo>
        <RodapeForm onCancelar={onFechar} salvando={salvando} />
      </form>
    </Modal>
  );
}

// Tela vazia: mostra a estrutura sugerida e cria tudo com um clique.
function Sugestao({ onCriado }) {
  const toast = useToast();
  const [criando, setCriando] = useState(false);
  const criar = async () => {
    setCriando(true);
    try {
      await criarCategoriasSugeridas();
      toast.success('Categorias criadas. Ajuste o que quiser.');
      onCriado();
    } catch (err) {
      toast.error(err.message);
      setCriando(false);
    }
  };
  return (
    <div className="card mt-6 p-5">
      <h2 className="text-base font-semibold text-gray-800">Começar com a estrutura sugerida</h2>
      <p className="mt-1 text-sm text-gray-600">
        As categorias da sua planilha, organizadas em grupos. Depois de criadas, você pode renomear, mover,
        desativar ou excluir qualquer uma.
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {GRUPOS_SUGERIDOS.map((g) => (
          <div key={g.nome} className="rounded-md border border-gray-200 px-3 py-2.5">
            <div className="flex items-center gap-2 text-sm font-semibold text-gray-800">
              <Bolinha cor={g.cor} /> {g.nome}
              {g.tipo === 'entrada' && <Etiqueta tom="verde">Entrada</Etiqueta>}
            </div>
            <div className="mt-1 text-[12.5px] leading-relaxed text-gray-500">{g.categorias.join(' · ')}</div>
          </div>
        ))}
      </div>
      <button type="button" className="btn-primary mt-5" onClick={criar} disabled={criando}>
        {criando ? 'Criando…' : 'Criar categorias sugeridas'}
      </button>
    </div>
  );
}

// A TELA COMO PLANILHA AGRUPADA (a opção A do mockup): uma tabela só, um grupo por faixa recolhível,
// e em cada categoria o uso dela — lançamentos nos 12 meses, o total no mês escolhido (com a barra do
// tamanho dele perto da maior), a média por mês e o último mês em que apareceu. Os números saem da view
// `resumo_mensal` (`lib/usoCategorias.js`).
const OPCOES_TIPO = [{ value: '', label: 'Todos' }, { value: 'saida', label: 'Gastos' }, { value: 'entrada', label: 'Entradas' }];
const OPCOES_SITUACAO = [{ value: '', label: 'Todas' }, { value: 'ativas', label: 'Só as ativas', chip: 'Ativas' }, { value: 'inativas', label: 'Só as inativas', chip: 'Inativas' }];
const LS_RECOLHIDOS = 'categorias_recolhidos';
const lerRecolhidos = () => { try { return new Set(JSON.parse(lsGet(LS_RECOLHIDOS) || '[]')); } catch { return new Set(); } };
const semAcento = (s) => String(s || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

const IconChevron = ({ aberto }) => (
  <svg viewBox="0 0 24 24" className={`h-3.5 w-3.5 text-gray-500 transition-transform duration-150 ${aberto ? 'rotate-90' : ''}`} fill="none"
    stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M9 6l6 6-6 6" />
  </svg>
);

// O total do mês com a barrinha: o comprimento é relativo à MAIOR categoria da tela.
function TotalComBarra({ centavos, maximo, cor, entrada }) {
  if (!centavos) return <span className="text-gray-300">—</span>;
  return (
    <span className="flex items-center gap-2.5">
      <span className="h-[6px] min-w-0 flex-1 overflow-hidden rounded-full bg-gray-100">
        <span className="block h-full rounded-full" style={{ width: `${Math.max(3, (centavos / maximo) * 100)}%`, background: cor }} />
      </span>
      <span className={`w-[92px] shrink-0 text-right tabular-nums ${entrada ? 'text-green-700' : 'text-gray-800'}`}>{formatBRL(centavos)}</span>
    </span>
  );
}

export default function Categorias() {
  const toast = useToast();
  const confirmar = useConfirmacao();
  const [grupos, setGrupos] = useState(null);
  const [categorias, setCategorias] = useState([]);
  const [resumo, setResumo] = useState([]);
  const [modal, setModal] = useState(null); // { tipo: 'grupo' | 'categoria', item }
  const [busca, setBusca] = useState('');
  const [tipo, setTipo] = useState('');
  const [situacao, setSituacao] = useState('');
  const [comp, setComp] = useState(competenciaAtual);
  const [recolhidos, setRecolhidosEstado] = useState(lerRecolhidos);
  const setRecolhidos = (s) => { setRecolhidosEstado(s); lsSet(LS_RECOLHIDOS, JSON.stringify([...s])); };

  const carregar = useCallback(async () => {
    try {
      const [g, c] = await Promise.all([listarGrupos(), listarCategorias()]);
      setCategorias(c);
      setGrupos(g);
    } catch (err) {
      toast.error(err.message);
      setGrupos([]);
    }
  }, [toast]);
  useEffect(() => { carregar(); }, [carregar]);
  // O uso vem à parte: a tela abre com o cadastro e os números chegam em seguida.
  useEffect(() => { listarResumoMensal().then(setResumo).catch((err) => toast.error(err.message)); }, [toast]);

  const { uso } = useMemo(() => usoPorCategoria(resumo, comp), [resumo, comp]);

  // Os grupos com as categorias que passam nos filtros. Buscando, o grupo cujo NOME casa vem inteiro.
  const blocos = useMemo(() => {
    if (!grupos) return [];
    const t = semAcento(busca).trim();
    return grupos
      .filter((g) => !tipo || g.tipo === tipo)
      .map((g) => {
        const doGrupo = categorias.filter((c) => c.grupo_id === g.id);
        const grupoCasa = t && semAcento(g.nome).includes(t);
        const itens = doGrupo.filter((c) => (!situacao || (situacao === 'ativas' ? c.ativa : !c.ativa))
          && (!t || grupoCasa || semAcento(c.nome).includes(t)));
        const soma = (campo) => itens.reduce((s, c) => s + (uso.get(c.id)?.[campo] ?? 0), 0);
        return { grupo: g, itens, total: doGrupo.length, qtd: soma('qtd'), noMes: soma('noMes'), media: soma('media') };
      })
      .filter((b) => b.itens.length || (!t && !situacao));
  }, [grupos, categorias, uso, busca, tipo, situacao]);

  const maximo = useMemo(() => Math.max(1, ...categorias.map((c) => uso.get(c.id)?.noMes ?? 0)), [categorias, uso]);
  const filtrando = Boolean(busca || tipo || situacao || comp !== competenciaAtual());
  const limpar = () => { setBusca(''); setTipo(''); setSituacao(''); setComp(competenciaAtual()); };
  // Buscando, tudo aparece aberto (o que casou não pode ficar escondido num grupo recolhido).
  const aberto = (g) => !!busca.trim() || !recolhidos.has(g.id);
  const tudoAberto = blocos.every((b) => !recolhidos.has(b.grupo.id));
  const alternarTudo = () => setRecolhidos(tudoAberto ? new Set(blocos.map((b) => b.grupo.id)) : new Set());
  const alternar = (id) => { const s = new Set(recolhidos); if (s.has(id)) s.delete(id); else s.add(id); setRecolhidos(s); };

  // As linhas da tabela numa lista só (grupo, as categorias dele, ou o aviso de grupo vazio), para o
  // recolher e abrir ANIMAR como no DRE do Gestor: as de um grupo fechado ficam montadas e escondidas.
  const todasLinhas = useMemo(() => blocos.flatMap((b) => [
    { id: `g:${b.grupo.id}`, tipo: 'grupo', bloco: b },
    ...b.itens.map((c) => ({ id: `c:${c.id}`, tipo: 'categoria', categoria: c, bloco: b })),
    ...(b.itens.length ? [] : [{ id: `v:${b.grupo.id}`, tipo: 'vazio', bloco: b }]),
  ]), [blocos]);
  const abertas = useMemo(() => todasLinhas.filter((x) => x.tipo === 'grupo' || aberto(x.bloco.grupo)),
    [todasLinhas, recolhidos, busca]);
  const caixaRef = useRef(null);
  const desenhadas = useLinhasAnimadas(todasLinhas, abertas, caixaRef);

  const fecharESalvar = () => { setModal(null); carregar(); };

  const apagarCategoria = async (c) => {
    const n = await contarUsoCategoria(c.id).catch(() => 0);
    const ok = await confirmar({
      titulo: `Excluir a categoria "${c.nome}"?`,
      texto: n > 0
        ? `${n} lançamento(s) usam esta categoria e ficarão sem categoria. Se só não quer mais vê-la ao lançar, prefira desativar.`
        : 'Nenhum lançamento usa esta categoria.',
      confirmar: 'Excluir',
      perigo: true,
    });
    if (!ok) return;
    try {
      await excluirCategoria(c.id);
      toast.success('Categoria excluída.');
      carregar();
    } catch (err) { toast.error(err.message); }
  };

  const apagarGrupo = async (g) => {
    const ok = await confirmar({ titulo: `Excluir o grupo "${g.nome}"?`, texto: 'O grupo está vazio.', confirmar: 'Excluir', perigo: true });
    if (!ok) return;
    try {
      await excluirGrupo(g.id);
      toast.success('Grupo excluído.');
      carregar();
    } catch (err) { toast.error(err.message); }
  };

  const vazio = grupos && grupos.length === 0;
  const mesCurto = competenciaCurta(comp);

  return (
    <div>
      <CabecalhoPagina
        titulo="Categorias e grupos"
        acoes={!vazio && grupos && (
          <>
            <button type="button" className="btn-secondary" onClick={() => setModal({ tipo: 'grupo' })}>Novo grupo</button>
            <button type="button" className="btn-primary" onClick={() => setModal({ tipo: 'categoria' })}>Nova categoria</button>
          </>
        )}
      />
      {!grupos ? <PageLoading /> : vazio ? <Sugestao onCriado={carregar} /> : (
        <>
          <FaixaProvider>
            <div className="mt-6 flex flex-wrap items-center gap-2">
              <BuscaFaixa className="w-full sm:w-[220px]" placeholder="Categoria ou grupo" value={busca} onChange={(e) => setBusca(e.target.value)} />
              <Trilho>
                <SegUnico id="tipo" rotulo="Tipo" opcoes={OPCOES_TIPO} value={tipo} onChange={setTipo} padrao="" largura={160} />
                <DivisorFaixa />
                <SegUnico id="situacao" rotulo="Situação" opcoes={OPCOES_SITUACAO} value={situacao} onChange={setSituacao} padrao="" largura={180} />
                <DivisorFaixa />
                <SegMes value={comp} onChange={setComp} />
              </Trilho>
              <LimparFiltros ativo={filtrando} onClick={limpar} />
              <span className="flex-1" />
              <button type="button" onClick={alternarTudo}
                className="inline-flex h-[31px] items-center gap-1.5 rounded-[6px] border border-gray-300 bg-hx-f6f7f8 px-2.5 text-[12px] font-medium text-gray-600 transition-colors hover:bg-gray-200 hover:text-gray-800">
                <IconExpandirTudo fechar={tudoAberto} />
                {tudoAberto ? 'Recolher tudo' : 'Expandir tudo'}
              </button>
            </div>
          </FaixaProvider>

          <div ref={caixaRef} className="card mt-4 overflow-x-auto">
            <table className="w-full min-w-[760px] table-fixed border-separate border-spacing-0">
              <colgroup>
                <col /><col style={{ width: 110 }} /><col style={{ width: 230 }} /><col style={{ width: 130 }} /><col style={{ width: 100 }} /><col style={{ width: 96 }} />
              </colgroup>
              <thead>
                <tr className="bg-hx-f9fafb">
                  <th className="table-th border-b border-gray-200">Categoria</th>
                  <th className="table-th border-b border-gray-200 text-right">Lançamentos</th>
                  <th className="table-th border-b border-gray-200 text-right">Total em {mesCurto}</th>
                  <th className="table-th border-b border-gray-200 text-right">Média / mês</th>
                  <th className="table-th border-b border-gray-200 text-right">Último uso</th>
                  <th className="table-th border-b border-gray-200" aria-label="Ações" />
                </tr>
              </thead>
              <tbody>
                {blocos.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-6 text-center text-sm text-gray-400">Nenhuma categoria com esses filtros.</td></tr>
                )}
                {desenhadas.map(({ linha: x, estado }) => {
                  const { grupo: g, total, qtd, noMes, media } = x.bloco;
                  const entrada = g.tipo === 'entrada';
                  const attrs = atributosLinha(x.id, estado);
                  if (x.tipo === 'grupo') {
                    const abre = aberto(g);
                    return (
                      <tr key={x.id} {...attrs} className="group/linha bg-hx-f6f7f8">
                        <td className="border-b border-gray-200 px-3 py-2">
                          <button type="button" onClick={() => alternar(g.id)} aria-expanded={abre}
                            className="flex min-w-0 items-center gap-2 text-left">
                            <IconChevron aberto={abre} />
                            <Bolinha cor={g.cor} className="h-3 w-3" />
                            <span className="truncate text-[13.5px] font-semibold text-gray-800">{g.nome}</span>
                            {entrada && <Etiqueta tom="verde">Entrada</Etiqueta>}
                            <span className="shrink-0 text-xs text-gray-400">{total} {total === 1 ? 'categoria' : 'categorias'}</span>
                          </button>
                        </td>
                        <td className="border-b border-gray-200 px-3 text-right text-[13px] font-semibold tabular-nums text-gray-700">{qtd || '—'}</td>
                        <td className="border-b border-gray-200 px-3 text-right text-[13px] font-semibold tabular-nums">
                          <span className={entrada ? 'text-green-700' : 'text-gray-800'}>{noMes ? formatBRL(noMes) : '—'}</span>
                        </td>
                        <td className="border-b border-gray-200 px-3 text-right text-[13px] font-semibold tabular-nums text-gray-700">{media ? formatBRL(media) : '—'}</td>
                        <td className="border-b border-gray-200" />
                        <td className="border-b border-gray-200 pr-2">
                          <span className="flex justify-end gap-1 md:opacity-0 md:transition-opacity md:group-hover/linha:opacity-100 md:focus-within:opacity-100">
                            <BotaoAcao titulo={`Nova categoria em ${g.nome}`} onClick={() => setModal({ tipo: 'categoria', item: { nome: '', grupo_id: g.id, ativa: true } })}>
                              <IconMais className="h-[13px] w-[13px]" />
                            </BotaoAcao>
                            <BotaoEditar titulo="Editar grupo" onClick={() => setModal({ tipo: 'grupo', item: g })} />
                            <BotaoExcluir titulo={total ? 'Só dá para excluir grupo vazio' : 'Excluir grupo'} disabled={total > 0} onClick={() => apagarGrupo(g)} />
                          </span>
                        </td>
                      </tr>
                    );
                  }
                  if (x.tipo === 'vazio') {
                    return (
                      <tr key={x.id} {...attrs} className="bg-white">
                        <td colSpan={6} className="border-b border-gray-100 py-2 pl-[46px] text-[13px] text-gray-400">Nenhuma categoria neste grupo.</td>
                      </tr>
                    );
                  }
                  const c = x.categoria;
                  const u = uso.get(c.id);
                  return (
                    <tr key={x.id} {...attrs} className="group/linha bg-white hover:bg-hx-f9fafb">
                      <td className="border-b border-gray-100 py-[7px] pl-[46px] pr-3">
                        <span className="flex min-w-0 items-center gap-2">
                          <span className={`truncate text-[13px] ${c.ativa ? 'text-gray-700' : 'text-gray-400 line-through'}`}>{c.nome}</span>
                          {!c.ativa && <Etiqueta>Inativa</Etiqueta>}
                        </span>
                      </td>
                      <td className="border-b border-gray-100 px-3 text-right text-[13px] tabular-nums text-gray-600">{u?.qtd || <span className="text-gray-300">—</span>}</td>
                      <td className="border-b border-gray-100 px-3 text-[13px]">
                        <TotalComBarra centavos={u?.noMes ?? 0} maximo={maximo} cor={g.cor} entrada={entrada} />
                      </td>
                      <td className="border-b border-gray-100 px-3 text-right text-[13px] tabular-nums text-gray-600">{u?.media ? formatBRL(u.media) : <span className="text-gray-300">—</span>}</td>
                      <td className="border-b border-gray-100 px-3 text-right text-[12.5px] text-gray-500">{u?.ultimo ? competenciaCurta(u.ultimo) : <span className="text-gray-300">nunca</span>}</td>
                      <td className="border-b border-gray-100 pr-2">
                        <span className="flex justify-end gap-1 md:opacity-0 md:transition-opacity md:group-hover/linha:opacity-100 md:focus-within:opacity-100">
                          <BotaoEditar onClick={() => setModal({ tipo: 'categoria', item: c })} />
                          <BotaoExcluir onClick={() => apagarCategoria(c)} />
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-right text-xs text-gray-500">
            Lançamentos e média contam os 12 meses até {mesCurto} (a média, só os meses que têm algum lançamento).
          </p>
        </>
      )}

      {modal?.tipo === 'grupo' && <ModalGrupo grupo={modal.item} onFechar={() => setModal(null)} onSalvo={fecharESalvar} />}
      {modal?.tipo === 'categoria' && (
        <ModalCategoria categoria={modal.item} grupos={grupos} onFechar={() => setModal(null)} onSalvo={fecharESalvar} />
      )}
    </div>
  );
}
