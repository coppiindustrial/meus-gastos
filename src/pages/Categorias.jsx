import { useCallback, useEffect, useMemo, useState } from 'react';
import CabecalhoPagina from '../components/CabecalhoPagina.jsx';
import Modal from '../components/Modal.jsx';
import SelectSimples from '../components/SelectSimples.jsx';
import SegmentedFiltro from '../components/SegmentedFiltro.jsx';
import Checkbox from '../components/Checkbox.jsx';
import { PageLoading } from '../components/Spinner.jsx';
import { Bolinha, BotaoEditar, BotaoExcluir, Campo, Etiqueta, RodapeForm } from '../components/Comuns.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { useConfirmacao } from '../context/ConfirmContext.jsx';
import {
  contarUsoCategoria, criarCategoriasSugeridas, excluirCategoria, excluirGrupo, listarCategorias, listarGrupos,
  salvarCategoria, salvarGrupo,
} from '../api/cadastros.js';
import { CORES_GRUPO, GRUPOS_SUGERIDOS } from '../lib/sugestoes.js';

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

function ModalCategoria({ categoria, grupos, onFechar, onSalvo }) {
  const toast = useToast();
  const [form, setForm] = useState(() => categoria ?? { nome: '', grupo_id: grupos[0]?.id ?? '', ativa: true });
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);
  const opcoes = grupos.map((g) => ({ value: g.id, label: `${g.nome} (${g.tipo === 'saida' ? 'gasto' : 'entrada'})` }));
  const enviar = async (e) => {
    e.preventDefault();
    if (!form.nome.trim()) { setErro('Informe o nome da categoria.'); return; }
    setSalvando(true);
    try {
      await salvarCategoria(form);
      toast.success(categoria?.id ? 'Categoria atualizada.' : 'Categoria criada.');
      onSalvo();
    } catch (err) {
      setErro(/duplicate|unique/i.test(err.message) ? 'Já existe uma categoria com esse nome.' : err.message);
    } finally { setSalvando(false); }
  };
  return (
    <Modal open onClose={onFechar} title={categoria?.id ? 'Editar categoria' : 'Nova categoria'} maxWidth="max-w-md">
      <form onSubmit={enviar} className="space-y-4">
        <Campo rotulo="Nome" erro={erro}>
          <input className="input" autoFocus value={form.nome} onChange={(e) => { setForm({ ...form, nome: e.target.value }); setErro(''); }} />
        </Campo>
        <Campo rotulo="Grupo">
          <SelectSimples value={form.grupo_id} onChange={(grupo_id) => setForm({ ...form, grupo_id })} opcoes={opcoes} />
        </Campo>
        <span className="flex items-center gap-2">
          <Checkbox checked={form.ativa} onChange={(e) => setForm({ ...form, ativa: e.target.checked })} title="Ativa" />
          <button type="button" className="text-sm text-gray-700" onClick={() => setForm({ ...form, ativa: !form.ativa })}>
            Ativa (aparece na hora de lançar)
          </button>
        </span>
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

export default function Categorias() {
  const toast = useToast();
  const confirmar = useConfirmacao();
  const [grupos, setGrupos] = useState(null);
  const [categorias, setCategorias] = useState([]);
  const [modal, setModal] = useState(null); // { tipo: 'grupo' | 'categoria', item }

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

  const porGrupo = useMemo(() => {
    const m = {};
    categorias.forEach((c) => { (m[c.grupo_id] ||= []).push(c); });
    return m;
  }, [categorias]);

  const fecharESalvar = () => { setModal(null); carregar(); };

  const apagarCategoria = async (c) => {
    const uso = await contarUsoCategoria(c.id).catch(() => 0);
    const ok = await confirmar({
      titulo: `Excluir a categoria "${c.nome}"?`,
      texto: uso > 0
        ? `${uso} lançamento(s) usam esta categoria e ficarão sem categoria. Se só não quer mais vê-la ao lançar, prefira desativar.`
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
        <div className="mt-6 grid items-start gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {grupos.map((g) => {
            const itens = porGrupo[g.id] ?? [];
            return (
              <section key={g.id} className="card overflow-hidden">
                <header className="flex items-center gap-2 border-b border-gray-200 bg-gray-50 px-4 py-2.5">
                  <Bolinha cor={g.cor} className="h-3 w-3" />
                  <h2 className="flex-1 truncate text-sm font-semibold text-gray-800">{g.nome}</h2>
                  <Etiqueta tom={g.tipo === 'saida' ? 'cinza' : 'verde'}>{g.tipo === 'saida' ? 'Gasto' : 'Entrada'}</Etiqueta>
                  <BotaoEditar titulo="Editar grupo" onClick={() => setModal({ tipo: 'grupo', item: g })} />
                  <BotaoExcluir titulo={itens.length ? 'Só dá para excluir grupo vazio' : 'Excluir grupo'}
                    disabled={itens.length > 0} onClick={() => apagarGrupo(g)} />
                </header>
                {itens.length === 0 ? (
                  <p className="px-4 py-3 text-sm text-gray-400">Nenhuma categoria neste grupo.</p>
                ) : (
                  <ul className="divide-y divide-gray-100">
                    {itens.map((c) => (
                      <li key={c.id} className="group/linha flex items-center gap-2 px-4 py-1.5">
                        <span className={`flex-1 truncate text-sm ${c.ativa ? 'text-gray-700' : 'text-gray-400 line-through'}`}>{c.nome}</span>
                        {!c.ativa && <Etiqueta>Inativa</Etiqueta>}
                        <span className="flex gap-1 md:opacity-0 md:transition-opacity md:group-hover/linha:opacity-100 md:focus-within:opacity-100">
                          <BotaoEditar onClick={() => setModal({ tipo: 'categoria', item: c })} />
                          <BotaoExcluir onClick={() => apagarCategoria(c)} />
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      )}

      {modal?.tipo === 'grupo' && <ModalGrupo grupo={modal.item} onFechar={() => setModal(null)} onSalvo={fecharESalvar} />}
      {modal?.tipo === 'categoria' && (
        <ModalCategoria categoria={modal.item} grupos={grupos} onFechar={() => setModal(null)} onSalvo={fecharESalvar} />
      )}
    </div>
  );
}
