import { useCallback, useEffect, useState } from 'react';
import CabecalhoPagina from '../components/CabecalhoPagina.jsx';
import Modal from '../components/Modal.jsx';
import SelectSimples from '../components/SelectSimples.jsx';
import Checkbox from '../components/Checkbox.jsx';
import { PageLoading } from '../components/Spinner.jsx';
import { BotaoEditar, BotaoExcluir, Campo, Etiqueta, RodapeForm } from '../components/Comuns.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { useConfirmacao } from '../context/ConfirmContext.jsx';
import { contarUsoCartao, criarCartoesSugeridos, excluirCartao, listarCartoes, salvarCartao } from '../api/cadastros.js';
import { CARTOES_SUGERIDOS } from '../lib/sugestoes.js';

// Como a fatura do cartão entra no app (a importação chega na fase 3).
const FORMATOS = [
  { value: 'nubank', label: 'Importa o CSV do Nubank' },
  { value: 'xp', label: 'Importa o CSV da XP' },
  { value: 'manual', label: 'Lançamento manual' },
];
const rotuloFormato = (f) => FORMATOS.find((x) => x.value === f)?.label ?? f;
// Só a primeira letra ("Importa o CSV do Nubank" → "importa o CSV do Nubank").
const minuscula = (s) => s.charAt(0).toLowerCase() + s.slice(1);

function ModalCartao({ cartao, onFechar, onSalvo }) {
  const toast = useToast();
  const [form, setForm] = useState(() => cartao ?? { nome: '', dia_vencimento: 10, formato: 'manual', ativo: true });
  const [erros, setErros] = useState({});
  const [salvando, setSalvando] = useState(false);
  const enviar = async (e) => {
    e.preventDefault();
    const dia = Number(form.dia_vencimento);
    const novos = {
      nome: !form.nome.trim() && 'Informe o nome do cartão.',
      dia: !(Number.isInteger(dia) && dia >= 1 && dia <= 31) && 'Dia entre 1 e 31.',
    };
    setErros(novos);
    if (novos.nome || novos.dia) return;
    setSalvando(true);
    try {
      await salvarCartao(form);
      toast.success(cartao?.id ? 'Cartão atualizado.' : 'Cartão criado.');
      onSalvo();
    } catch (err) {
      setErros({ nome: /duplicate|unique/i.test(err.message) ? 'Já existe um cartão com esse nome.' : err.message });
    } finally { setSalvando(false); }
  };
  return (
    <Modal open onClose={onFechar} title={cartao?.id ? 'Editar cartão' : 'Novo cartão'} maxWidth="max-w-md">
      <form onSubmit={enviar} className="space-y-4">
        <Campo rotulo="Nome" erro={erros.nome}>
          <input className="input" autoFocus value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
        </Campo>
        <Campo rotulo="Dia do vencimento da fatura" erro={erros.dia}>
          <input className="input w-28" type="number" min="1" max="31" inputMode="numeric" value={form.dia_vencimento}
            onChange={(e) => setForm({ ...form, dia_vencimento: e.target.value })} />
        </Campo>
        <Campo rotulo="Como a fatura entra">
          <SelectSimples value={form.formato} onChange={(formato) => setForm({ ...form, formato })} opcoes={FORMATOS} />
        </Campo>
        <span className="flex items-center gap-2">
          <Checkbox checked={form.ativo} onChange={(e) => setForm({ ...form, ativo: e.target.checked })} title="Ativo" />
          <button type="button" className="text-sm text-gray-700" onClick={() => setForm({ ...form, ativo: !form.ativo })}>
            Ativo (aparece na hora de lançar)
          </button>
        </span>
        <RodapeForm onCancelar={onFechar} salvando={salvando} />
      </form>
    </Modal>
  );
}

export default function Cartoes() {
  const toast = useToast();
  const confirmar = useConfirmacao();
  const [cartoes, setCartoes] = useState(null);
  const [modal, setModal] = useState(null); // { item } ou {} para novo
  const [criando, setCriando] = useState(false);

  const carregar = useCallback(async () => {
    try { setCartoes(await listarCartoes()); } catch (err) { toast.error(err.message); setCartoes([]); }
  }, [toast]);
  useEffect(() => { carregar(); }, [carregar]);

  const criarSugeridos = async () => {
    setCriando(true);
    try { await criarCartoesSugeridos(); toast.success('Cartões criados.'); carregar(); } catch (err) { toast.error(err.message); }
    setCriando(false);
  };

  const apagar = async (c) => {
    const uso = await contarUsoCartao(c.id).catch(() => 0);
    if (uso > 0) {
      await confirmar({
        titulo: 'Este cartão tem lançamentos',
        texto: `${uso} lançamento(s) estão ligados ao ${c.nome}. Em vez de excluir, desmarque "Ativo" para ele sair das opções.`,
        confirmar: 'Entendi',
      });
      return;
    }
    if (!await confirmar({ titulo: `Excluir o cartão ${c.nome}?`, texto: 'Ele não tem lançamentos.', confirmar: 'Excluir', perigo: true })) return;
    try { await excluirCartao(c.id); toast.success('Cartão excluído.'); carregar(); } catch (err) { toast.error(err.message); }
  };

  return (
    <div>
      <CabecalhoPagina titulo="Cartões"
        acoes={cartoes?.length > 0 && <button type="button" className="btn-primary" onClick={() => setModal({})}>Novo cartão</button>} />
      {!cartoes ? <PageLoading /> : cartoes.length === 0 ? (
        <div className="card mt-6 max-w-xl p-5">
          <h2 className="text-base font-semibold text-gray-800">Cadastrar os cartões da planilha</h2>
          <ul className="mt-2 space-y-1 text-sm text-gray-600">
            {CARTOES_SUGERIDOS.map((c) => (
              <li key={c.nome}>
                <strong className="font-semibold text-gray-800">{c.nome}</strong> · vence dia {c.dia_vencimento} · {minuscula(rotuloFormato(c.formato))}
                {!c.ativo && ' · inativo'}
              </li>
            ))}
          </ul>
          <div className="mt-4 flex gap-2">
            <button type="button" className="btn-primary" onClick={criarSugeridos} disabled={criando}>{criando ? 'Criando…' : 'Criar estes cartões'}</button>
            <button type="button" className="btn-secondary" onClick={() => setModal({})}>Cadastrar outro</button>
          </div>
        </div>
      ) : (
        <div className="card mt-6 max-w-3xl overflow-x-auto">
          <table className="w-full">
            <thead className="border-b border-gray-200 bg-gray-50">
              <tr>
                <th className="table-th">Cartão</th>
                <th className="table-th">Vencimento</th>
                <th className="table-th">Como a fatura entra</th>
                <th className="table-th w-[84px]" aria-label="Ações" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {cartoes.map((c) => (
                <tr key={c.id} className="hover:bg-gray-50">
                  <td className="table-td">
                    <span className={`font-medium ${c.ativo ? 'text-gray-800' : 'text-gray-400'}`}>{c.nome}</span>
                    {!c.ativo && <span className="ml-2"><Etiqueta>Inativo</Etiqueta></span>}
                  </td>
                  <td className="table-td">dia {c.dia_vencimento}</td>
                  <td className="table-td">{rotuloFormato(c.formato)}</td>
                  <td className="table-td">
                    <span className="flex justify-end gap-1">
                      <BotaoEditar onClick={() => setModal({ item: c })} />
                      <BotaoExcluir onClick={() => apagar(c)} />
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {modal && <ModalCartao cartao={modal.item} onFechar={() => setModal(null)} onSalvo={() => { setModal(null); carregar(); }} />}
    </div>
  );
}
