import { useCallback, useEffect, useMemo, useState } from 'react';
import CabecalhoPagina from '../components/CabecalhoPagina.jsx';
import Modal from '../components/Modal.jsx';
import SelectSimples from '../components/SelectSimples.jsx';
import SearchInput from '../components/SearchInput.jsx';
import ListaVazia from '../components/ListaVazia.jsx';
import { PageLoading } from '../components/Spinner.jsx';
import { Bolinha, BotaoEditar, BotaoExcluir, Campo, RodapeForm } from '../components/Comuns.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { useConfirmacao } from '../context/ConfirmContext.jsx';
import { listarCategorias } from '../api/cadastros.js';
import { excluirRegra, listarRegras, salvarRegra } from '../api/regras.js';
import { regraPega } from '../lib/classificar.js';

// REGRAS DE CLASSIFICAÇÃO (a aba "Regras" da planilha): a primeira regra, na ordem, cuja palavra-chave
// aparece no nome do estabelecimento dá a categoria. Vale para as faturas importadas daqui em diante;
// os lançamentos já gravados não mudam quando a regra muda.

function ModalRegra({ regra, categorias, onFechar, onSalvo }) {
  const toast = useToast();
  const [form, setForm] = useState(() => regra ?? { palavra_chave: '', categoria_id: '' });
  const [teste, setTeste] = useState('');
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);
  const opcoes = categorias.filter((c) => c.grupo.tipo === 'saida' && (c.ativa || c.id === form.categoria_id))
    .map((c) => ({ value: c.id, label: `${c.nome} · ${c.grupo.nome}` }));
  const enviar = async (e) => {
    e.preventDefault();
    if (!form.palavra_chave.trim() || !form.categoria_id) { setErro('Informe a palavra-chave e a categoria.'); return; }
    setSalvando(true);
    try {
      await salvarRegra(form);
      toast.success(regra?.id ? 'Regra atualizada.' : 'Regra criada.');
      onSalvo();
    } catch (err) {
      setErro(/duplicate|unique/i.test(err.message) ? 'Já existe uma regra com essa palavra-chave.' : err.message);
      setSalvando(false);
    }
  };
  return (
    <Modal open onClose={onFechar} title={regra?.id ? 'Editar regra' : 'Nova regra'} maxWidth="max-w-md">
      <form onSubmit={enviar} className="space-y-4">
        <Campo rotulo="Palavra-chave" erro={erro}>
          <input className="input" autoFocus value={form.palavra_chave} onChange={(e) => { setForm({ ...form, palavra_chave: e.target.value }); setErro(''); }} />
          <p className="mt-1 text-xs text-gray-500">Em qualquer parte do nome, sem diferenciar maiúsculas. <code>*</code> = qualquer coisa, <code>?</code> = um caractere.</p>
        </Campo>
        <Campo rotulo="Categoria">
          <SelectSimples value={form.categoria_id} onChange={(categoria_id) => setForm({ ...form, categoria_id })} opcoes={opcoes} />
        </Campo>
        {regra?.id && (
          <Campo rotulo="Prioridade (menor decide primeiro)">
            <input className="input w-28" type="number" value={form.prioridade} onChange={(e) => setForm({ ...form, prioridade: e.target.value })} />
          </Campo>
        )}
        <Campo rotulo="Testar com um nome de estabelecimento">
          <input className="input" value={teste} placeholder="Ex.: DL *UBERRIDES" onChange={(e) => setTeste(e.target.value)} />
          {teste && form.palavra_chave.trim() && (
            <p className={`mt-1 text-xs font-medium ${regraPega(form.palavra_chave.trim(), teste) ? 'text-green-700' : 'text-gray-500'}`}>
              {regraPega(form.palavra_chave.trim(), teste) ? 'A regra pega este nome.' : 'A regra não pega este nome.'}
            </p>
          )}
        </Campo>
        <RodapeForm onCancelar={onFechar} salvando={salvando} />
      </form>
    </Modal>
  );
}

export default function Regras() {
  const toast = useToast();
  const confirmar = useConfirmacao();
  const [regras, setRegras] = useState(null);
  const [categorias, setCategorias] = useState([]);
  const [busca, setBusca] = useState('');
  const [modal, setModal] = useState(null);

  const carregar = useCallback(async () => {
    try {
      const [r, c] = await Promise.all([listarRegras(), listarCategorias()]);
      setRegras(r);
      setCategorias(c);
    } catch (err) { toast.error(err.message); setRegras([]); }
  }, [toast]);
  useEffect(() => { carregar(); }, [carregar]);

  // A busca procura na palavra-chave, na categoria E testa a regra contra o texto (achar "qual regra pega X").
  const filtradas = useMemo(() => {
    const t = busca.trim().toLowerCase();
    if (!t) return regras ?? [];
    return (regras ?? []).filter((r) => r.palavra_chave.toLowerCase().includes(t)
      || r.categoria?.nome.toLowerCase().includes(t) || regraPega(r.palavra_chave, busca.trim()));
  }, [regras, busca]);

  const apagar = async (r) => {
    if (!await confirmar({ titulo: `Excluir a regra "${r.palavra_chave}"?`, texto: 'Os lançamentos já classificados não mudam.', confirmar: 'Excluir', perigo: true })) return;
    try { await excluirRegra(r.id); toast.success('Regra excluída.'); carregar(); } catch (err) { toast.error(err.message); }
  };

  return (
    <div>
      <CabecalhoPagina titulo="Regras de classificação"
        acessorio={regras && <span className="text-sm text-gray-500">{regras.length}</span>}
        acoes={<button type="button" className="btn-primary" onClick={() => setModal({})}>Nova regra</button>} />
      <div className="mt-4 max-w-4xl">
        <SearchInput className="w-full sm:w-80" placeholder="Buscar palavra, categoria ou nome…" value={busca} onChange={(e) => setBusca(e.target.value)} />
        <div className="mt-3">
          {!regras ? <PageLoading /> : filtradas.length === 0 ? <ListaVazia>Nenhuma regra{busca ? ' com essa busca' : ''}.</ListaVazia> : (
            <div className="card overflow-x-auto">
              <table className="w-full">
                <thead className="border-b border-gray-200 bg-gray-50">
                  <tr>
                    <th className="table-th w-[70px] text-right">Ordem</th>
                    <th className="table-th">Palavra-chave</th>
                    <th className="table-th">Categoria</th>
                    <th className="table-th w-[84px]" aria-label="Ações" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filtradas.map((r) => (
                    <tr key={r.id} className="group/linha hover:bg-gray-50">
                      <td className="table-td text-right tabular-nums text-gray-500">{r.prioridade}</td>
                      <td className="table-td font-mono text-[13px] text-gray-800">{r.palavra_chave}</td>
                      <td className="table-td">
                        <span className="inline-flex items-center gap-1.5"><Bolinha cor={r.categoria?.grupo?.cor} />{r.categoria?.nome ?? '—'}</span>
                      </td>
                      <td className="table-td">
                        <span className="flex justify-end gap-1 md:opacity-0 md:transition-opacity md:group-hover/linha:opacity-100 md:focus-within:opacity-100">
                          <BotaoEditar onClick={() => setModal({ item: r })} />
                          <BotaoExcluir onClick={() => apagar(r)} />
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
      {modal && <ModalRegra regra={modal.item} categorias={categorias} onFechar={() => setModal(null)} onSalvo={() => { setModal(null); carregar(); }} />}
    </div>
  );
}
