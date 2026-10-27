import { useEffect, useState } from 'react';
import Modal from './Modal.jsx';
import SelectSimples from './SelectSimples.jsx';
import Checkbox from './Checkbox.jsx';
import { Campo, RodapeForm } from './Comuns.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { listarGrupos, salvarCategoria } from '../api/cadastros.js';

// NOVA/EDITAR CATEGORIA. Mora aqui (e não só na tela de Categorias) porque também é aberto de DENTRO
// do seletor de categoria — classificando o extrato, um lançamento ou uma pendência, a categoria que
// falta é criada ali mesmo, sem sair da tela.
//
// `grupos`: opcional (sem ele, o modal busca). `tipo`: só os grupos de gasto ou de entrada.
// `nomeInicial`: o que foi digitado na busca. `onSalvo(categoria)` recebe a categoria gravada com o
// `grupo` junto (no formato de `listarCategorias`), para quem chamou já poder mostrá-la e escolhê-la.
export default function ModalCategoria({ categoria, grupos: gruposProp, tipo, nomeInicial = '', onFechar, onSalvo }) {
  const toast = useToast();
  const [grupos, setGrupos] = useState(gruposProp ?? null);
  const [form, setForm] = useState(() => categoria ?? { nome: nomeInicial, grupo_id: '', ativa: true });
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (gruposProp) return;
    listarGrupos().then(setGrupos).catch((err) => toast.error(err.message));
  }, [gruposProp, toast]);

  const disponiveis = (grupos ?? []).filter((g) => !tipo || g.tipo === tipo);
  // Sem grupo escolhido ainda: o primeiro da lista.
  useEffect(() => {
    if (!form.grupo_id && disponiveis[0]) setForm((f) => ({ ...f, grupo_id: disponiveis[0].id }));
  }, [disponiveis, form.grupo_id]);

  const opcoes = disponiveis.map((g) => ({ value: g.id, label: tipo ? g.nome : `${g.nome} (${g.tipo === 'saida' ? 'gasto' : 'entrada'})` }));

  const enviar = async (e) => {
    e.preventDefault();
    if (!form.nome.trim()) { setErro('Informe o nome da categoria.'); return; }
    if (!form.grupo_id) { setErro('Escolha o grupo.'); return; }
    setSalvando(true);
    try {
      const salva = await salvarCategoria(form);
      toast.success(categoria?.id ? 'Categoria atualizada.' : `Categoria "${salva.nome}" criada.`);
      onSalvo({ ...salva, grupo: (grupos ?? []).find((g) => g.id === salva.grupo_id) });
    } catch (err) {
      setErro(/duplicate|unique/i.test(err.message) ? 'Já existe uma categoria com esse nome (pode estar inativa).' : err.message);
      setSalvando(false);
    }
  };

  return (
    <Modal open onClose={onFechar} title={categoria?.id ? 'Editar categoria' : 'Nova categoria'} maxWidth="max-w-md">
      <form onSubmit={enviar} className="space-y-4">
        <Campo rotulo="Nome" erro={erro}>
          <input className="input" autoFocus value={form.nome} onChange={(e) => { setForm({ ...form, nome: e.target.value }); setErro(''); }} />
        </Campo>
        <Campo rotulo="Grupo">
          <SelectSimples value={form.grupo_id} onChange={(grupo_id) => setForm({ ...form, grupo_id })} opcoes={opcoes}
            placeholder={grupos ? 'Selecione…' : 'Carregando…'} />
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
