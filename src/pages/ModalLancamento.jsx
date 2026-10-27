import { useMemo, useState } from 'react';
import Modal from '../components/Modal.jsx';
import SelectSimples from '../components/SelectSimples.jsx';
import SelectBusca, { opcoesCategoria as opcoesDeCategorias } from '../components/SelectBusca.jsx';
import SegmentedFiltro from '../components/SegmentedFiltro.jsx';
import { Campo } from '../components/Comuns.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { useConfirmacao } from '../context/ConfirmContext.jsx';
import { excluirLancamento, salvarLancamento } from '../api/lancamentos.js';
import { parseValor, valorParaCampo } from '../lib/dinheiro.js';
import { addMeses, competenciaDe, nomeCompetencia, todayISO } from '../lib/format.js';

const TIPOS = [{ valor: 'saida', rotulo: 'Gasto' }, { valor: 'entrada', rotulo: 'Entrada' }];
const ORIGENS = [{ valor: 'manual', rotulo: 'Avulso' }, { valor: 'fixo', rotulo: 'Fixo' }, { valor: 'cartao', rotulo: 'Cartão' }];

// O mês em que o lançamento conta, sugerido pela data: gasto de CARTÃO cai na fatura, que vence no
// mês seguinte ao da compra (aproximação — a importação da fatura, na fase 3, usa o vencimento real).
const compSugerida = (data, origem) => {
  const c = competenciaDe(data || todayISO());
  return origem === 'cartao' ? addMeses(c, 1) : c;
};

// Formulário de lançamento (novo ou edição). `compPadrao`: o mês aberto na tela, para a data inicial.
export default function ModalLancamento({ lancamento, compPadrao, categorias, cartoes, onFechar, onSalvo }) {
  const toast = useToast();
  const confirmar = useConfirmacao();
  const editando = Boolean(lancamento?.id);
  const [form, setForm] = useState(() => {
    if (lancamento) {
      // Nulos do banco viram '' para os campos (e para a validação da parcela não ver "preenchido").
      const l = lancamento;
      return {
        ...l, valor: valorParaCampo(l.valor_centavos), categoria_id: l.categoria_id ?? '', cartao_id: l.cartao_id ?? '',
        parcela_atual: l.parcela_atual ?? '', parcela_total: l.parcela_total ?? '', obs: l.obs ?? '',
      };
    }
    const data = compPadrao === competenciaDe(todayISO()) ? todayISO() : `${compPadrao}-01`;
    return {
      tipo: 'saida', origem: 'manual', data, competencia: compPadrao, descricao: '', valor: '',
      categoria_id: '', cartao_id: '', parcela_atual: '', parcela_total: '', obs: '',
    };
  });
  // Enquanto a pessoa não escolhe o mês à mão, ele acompanha a data (e a origem).
  const [compManual, setCompManual] = useState(editando);
  const [erros, setErros] = useState({});
  const [salvando, setSalvando] = useState(false);

  const mudar = (campo, valor) => {
    setForm((f) => {
      const n = { ...f, [campo]: valor };
      if (campo === 'tipo' && valor === 'entrada') n.origem = 'entrada';
      if (campo === 'tipo' && valor === 'saida' && f.origem === 'entrada') n.origem = 'manual';
      if (campo === 'tipo') n.categoria_id = ''; // as categorias de gasto e de entrada são outras
      if (!compManual && (campo === 'data' || campo === 'origem' || campo === 'tipo')) n.competencia = compSugerida(n.data, n.origem);
      return n;
    });
    setErros((e) => ({ ...e, [campo]: undefined }));
  };

  const entrada = form.tipo === 'entrada';
  const cartao = !entrada && form.origem === 'cartao';

  // Só as categorias do tipo certo e ativas (mais a atual, se ela tiver sido desativada depois).
  const opcoesCategoria = useMemo(() => [
    { value: '', label: 'Sem categoria' },
    ...opcoesDeCategorias(categorias, { tipo: form.tipo, atual: form.categoria_id }),
  ], [categorias, form.tipo, form.categoria_id]);

  const opcoesCartao = cartoes
    .filter((c) => c.ativo || c.id === form.cartao_id)
    .map((c) => ({ value: c.id, label: c.nome }));

  // Meses oferecidos: um antes e três depois do mês da data.
  const opcoesMes = useMemo(() => {
    const base = competenciaDe(form.data || todayISO());
    const meses = [-1, 0, 1, 2, 3].map((d) => addMeses(base, d));
    if (!meses.includes(form.competencia)) meses.push(form.competencia);
    return meses.sort().map((m) => ({ value: m, label: nomeCompetencia(m) }));
  }, [form.data, form.competencia]);

  const enviar = async (e) => {
    e.preventDefault();
    const centavos = parseValor(form.valor);
    const pa = Number(form.parcela_atual);
    const pt = Number(form.parcela_total);
    const temParcela = cartao && (form.parcela_atual !== '' || form.parcela_total !== '');
    const novos = {
      valor: !(centavos > 0) && 'Informe um valor maior que zero.',
      data: !/^\d{4}-\d{2}-\d{2}$/.test(form.data || '') && 'Informe a data.',
      descricao: !form.descricao.trim() && 'Informe a descrição.',
      cartao_id: cartao && !form.cartao_id && 'Escolha o cartão.',
      parcela: temParcela && !(Number.isInteger(pa) && Number.isInteger(pt) && pa >= 1 && pt >= 2 && pa <= pt) && 'Parcela inválida (ex.: 3 de 10).',
    };
    setErros(novos);
    if (Object.values(novos).some(Boolean)) return;
    setSalvando(true);
    try {
      await salvarLancamento({
        ...form,
        valor_centavos: centavos,
        parcela_atual: temParcela ? pa : null,
        parcela_total: temParcela ? pt : null,
      });
      toast.success(editando ? 'Lançamento atualizado.' : 'Lançamento criado.');
      onSalvo();
    } catch (err) {
      toast.error(err.message);
      setSalvando(false);
    }
  };

  const apagar = async () => {
    if (!await confirmar({ titulo: 'Excluir este lançamento?', texto: form.descricao, confirmar: 'Excluir', perigo: true })) return;
    try {
      await excluirLancamento(form.id);
      toast.success('Lançamento excluído.');
      onSalvo();
    } catch (err) { toast.error(err.message); }
  };

  return (
    <Modal open onClose={onFechar} title={editando ? 'Editar lançamento' : 'Novo lançamento'} maxWidth="max-w-lg">
      <form onSubmit={enviar} className="space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <SegmentedFiltro opcoes={TIPOS} value={form.tipo} onChange={(v) => mudar('tipo', v)} ariaLabel="Tipo" />
          {!entrada && <SegmentedFiltro opcoes={ORIGENS} value={form.origem} onChange={(v) => mudar('origem', v)} ariaLabel="Origem" />}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Campo rotulo="Valor (R$)" erro={erros.valor}>
            <input className="input" inputMode="decimal" autoFocus placeholder="0,00" value={form.valor}
              onChange={(e) => mudar('valor', e.target.value)} />
          </Campo>
          <Campo rotulo="Data" erro={erros.data}>
            <input className="input" type="date" value={form.data} onChange={(e) => mudar('data', e.target.value)} />
          </Campo>
        </div>

        <Campo rotulo="Descrição" erro={erros.descricao}>
          <input className="input" value={form.descricao} placeholder={entrada ? 'Ex.: Salário' : 'Ex.: Dentista'}
            onChange={(e) => mudar('descricao', e.target.value)} />
        </Campo>

        <Campo rotulo="Categoria">
          <SelectBusca value={form.categoria_id ?? ''} onChange={(v) => mudar('categoria_id', v)} opcoes={opcoesCategoria} buscaPlaceholder="Buscar categoria ou grupo" />
        </Campo>

        {cartao && (
          <div className="grid grid-cols-2 gap-3">
            <Campo rotulo="Cartão" erro={erros.cartao_id}>
              <SelectSimples value={form.cartao_id ?? ''} onChange={(v) => mudar('cartao_id', v)} opcoes={opcoesCartao}
                placeholder={opcoesCartao.length ? 'Selecione…' : 'Cadastre um cartão'} />
            </Campo>
            <Campo rotulo="Parcela (opcional)" erro={erros.parcela}>
              <div className="flex items-center gap-2">
                <input className="input" inputMode="numeric" placeholder="3" value={form.parcela_atual ?? ''}
                  onChange={(e) => mudar('parcela_atual', e.target.value)} aria-label="Parcela atual" />
                <span className="text-sm text-gray-500">de</span>
                <input className="input" inputMode="numeric" placeholder="10" value={form.parcela_total ?? ''}
                  onChange={(e) => mudar('parcela_total', e.target.value)} aria-label="Total de parcelas" />
              </div>
            </Campo>
          </div>
        )}

        <Campo rotulo="Conta no mês">
          <SelectSimples value={form.competencia} opcoes={opcoesMes}
            onChange={(v) => { setCompManual(true); setForm((f) => ({ ...f, competencia: v })); }} />
          {cartao && <p className="mt-1 text-xs text-gray-500">Gasto de cartão conta no mês em que a fatura vence.</p>}
        </Campo>

        <Campo rotulo="Observação (opcional)">
          <textarea className="input min-h-[60px]" value={form.obs ?? ''} onChange={(e) => mudar('obs', e.target.value)} />
        </Campo>

        <div className="mt-5 flex items-center gap-2">
          {editando && <button type="button" className="btn-secondary !text-hx-c0393d" onClick={apagar}>Excluir</button>}
          <span className="flex-1" />
          <button type="button" className="btn-secondary" onClick={onFechar}>Cancelar</button>
          <button type="submit" className="btn-primary" disabled={salvando}>{salvando ? 'Salvando…' : 'Salvar'}</button>
        </div>
      </form>
    </Modal>
  );
}
