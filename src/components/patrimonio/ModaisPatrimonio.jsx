import { useMemo, useState } from 'react';
import Modal from '../Modal.jsx';
import CampoData from '../CampoData.jsx';
import SelectSimples from '../SelectSimples.jsx';
import SelectBusca from '../SelectBusca.jsx';
import Checkbox from '../Checkbox.jsx';
import AbasPilula from '../AbasPilula.jsx';
import { BotaoExcluir, Campo, Etiqueta, RodapeForm } from '../Comuns.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { useConfirmacao } from '../../context/ConfirmContext.jsx';
import { excluirMovimento, excluirSaldo, registrarSaldos, salvarConta } from '../../api/patrimonio.js';
import {
  atualizarInvestimento, criarInvestimento, excluirInvestimento, excluirValor, lancarMovimento, registrarValores,
} from '../../api/investimentos.js';
import {
  INDEXADORES, LIQUIDEZ, TIPOS_INVESTIMENTO, impostoGarantia, nomeTipoInvestimento, rotuloRende,
} from '../../lib/investimentos.js';
import { formatBRL, parseValor, valorParaCampo } from '../../lib/dinheiro.js';
import { addMeses, formatDate, todayISO } from '../../lib/format.js';

// OS POP-UPS DO PATRIMÔNIO (05/11/2026, o desenho aprovado "Investimentos no Patrimônio"): a conta, o investimento
// (cadastrado uma vez), o aporte / resgate (o gesto do dia a dia: o investimento, a data e o valor) e o "Registrar o
// mês" (quanto cada investimento vale hoje, com o "Rendeu" ao vivo). A conta e o investimento trazem o HISTÓRICO
// (fotos e movimentos), onde se corrige o que entrou errado.

const TIPOS_CONTA = [
  { value: 'corrente', label: 'Conta corrente' },
  { value: 'investimento', label: 'Investimento' },
  { value: 'reserva', label: 'Reserva' },
  { value: 'outro', label: 'Outro' },
];
export const nomeTipoConta = (t) => TIPOS_CONTA.find((x) => x.value === t)?.label ?? t;
const ultimoDiaDoMes = (comp) => { const [y, m] = comp.split('-').map(Number); return `${comp}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, '0')}`; };
const vazio = (t) => !String(t ?? '').trim();
const taxaParaCampo = (t) => (t === null || t === undefined ? '' : String(Number(t)).replace('.', ','));
const lerTaxa = (t) => {
  if (vazio(t)) return null;
  const n = Number(String(t).replace(/\s|%/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : NaN;
};
const doisCampos = 'grid gap-3 sm:grid-cols-2';

// O histórico de uma série: as fotos e os movimentos, do mais novo ao mais antigo, cada um com o seu ✕.
function Historico({ fotos, movimentos, onExcluirFoto, onExcluirMov }) {
  const linhas = [
    ...fotos.map((f) => ({ ...f, tipo: 'foto' })),
    ...movimentos.map((m) => ({ ...m })),
  ].sort((a, b) => b.data.localeCompare(a.data) || (a.tipo === 'foto' ? -1 : 1));
  if (!linhas.length) return <p className="text-sm text-gray-500">Nada registrado ainda.</p>;
  return (
    <ul className="max-h-[260px] divide-y divide-gray-100 overflow-auto rounded-md border border-gray-200">
      {linhas.map((h) => (
        <li key={`${h.tipo}${h.id}`} className="flex items-center gap-3 px-3 py-1 text-sm">
          <span className="w-[84px] shrink-0 tabular-nums text-gray-500">{formatDate(h.data)}</span>
          <span className="w-[72px] shrink-0">
            {h.tipo === 'foto' ? <Etiqueta>valor</Etiqueta> : <Etiqueta tom={h.tipo === 'aporte' ? 'verde' : 'ambar'}>{h.tipo}</Etiqueta>}
          </span>
          <span className="min-w-0 flex-1 truncate tabular-nums text-gray-800">
            {h.tipo === 'resgate' ? '− ' : h.tipo === 'aporte' ? '+ ' : ''}{formatBRL(h.valor_centavos)}
            {h.tipo !== 'foto' && <span className="ml-2 text-xs text-gray-400">{h.origem === 'extrato' ? 'do extrato' : h.descricao || 'à mão'}</span>}
          </span>
          <BotaoExcluir titulo={h.tipo === 'foto' ? 'Excluir este valor' : `Excluir este ${h.tipo}`} onClick={() => (h.tipo === 'foto' ? onExcluirFoto(h) : onExcluirMov(h))} />
        </li>
      ))}
    </ul>
  );
}

function useApagar(onMudou) {
  const toast = useToast();
  const confirmar = useConfirmacao();
  return {
    foto: async (f, conta) => {
      if (!await confirmar({ titulo: 'Excluir este valor?', texto: `${formatBRL(f.valor_centavos)} em ${formatDate(f.data)}.`, confirmar: 'Excluir', perigo: true })) return;
      try { await (conta ? excluirSaldo(f.id) : excluirValor(f.id)); toast.success('Valor excluído.'); onMudou(); } catch (err) { toast.error(err.message); }
    },
    mov: async (m) => {
      if (!await confirmar({ titulo: `Excluir este ${m.tipo}?`, texto: `${formatBRL(m.valor_centavos)} em ${formatDate(m.data)}${m.origem === 'extrato' ? ' (veio do extrato: importar o mesmo extrato de novo o traz de volta)' : ''}.`, confirmar: 'Excluir', perigo: true })) return;
      try { await excluirMovimento(m.id); toast.success('Movimento excluído.'); onMudou(); } catch (err) { toast.error(err.message); }
    },
  };
}

// ------------------------------------------------------------ a conta
export function ModalConta({ conta, comMovimentos, temInvestimentos, saldos = [], movimentos = [], onFechar, onSalvo, onMudou }) {
  const toast = useToast();
  const [form, setForm] = useState(() => conta ?? { nome: '', tipo: 'investimento', instituicao: '', ativa: true, recebe_extrato: false });
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);
  const apagar = useApagar(onMudou);
  const enviar = async (e) => {
    e.preventDefault();
    if (!form.nome.trim()) { setErro('Informe o nome da conta.'); return; }
    setSalvando(true);
    try {
      await salvarConta({ ...form, recebe_extrato: comMovimentos && !temInvestimentos ? !!form.recebe_extrato : undefined });
      toast.success(conta?.id ? 'Conta atualizada.' : 'Conta criada.');
      onSalvo();
    } catch (err) {
      setErro(/duplicate|unique/i.test(err.message) ? 'Já existe uma conta com esse nome.' : err.message);
      setSalvando(false);
    }
  };
  return (
    <Modal open onClose={onFechar} title={conta?.id ? 'Editar conta' : 'Nova conta'} maxWidth={conta?.id ? 'max-w-xl' : 'max-w-md'}>
      <form onSubmit={enviar} className="space-y-4">
        <Campo rotulo="Nome" erro={erro}>
          <input className="input" autoFocus value={form.nome} placeholder="Ex.: Conta Nubank, XP Investimentos" onChange={(e) => { setForm({ ...form, nome: e.target.value }); setErro(''); }} />
        </Campo>
        <div className={doisCampos}>
          <Campo rotulo="Tipo">
            <SelectSimples value={form.tipo} onChange={(tipo) => setForm({ ...form, tipo })} opcoes={TIPOS_CONTA} />
          </Campo>
          <Campo rotulo="Instituição (opcional)">
            <input className="input" value={form.instituicao ?? ''} onChange={(e) => setForm({ ...form, instituicao: e.target.value })} />
          </Campo>
        </div>
        <span className="flex items-center gap-2">
          <Checkbox checked={form.ativa} onChange={(e) => setForm({ ...form, ativa: e.target.checked })} title="Ativa" />
          <button type="button" className="text-sm text-gray-700" onClick={() => setForm({ ...form, ativa: !form.ativa })}>Ativa (aparece ao registrar o mês)</button>
        </span>
        {comMovimentos && !temInvestimentos && (
          <span className="flex items-start gap-2">
            <Checkbox checked={!!form.recebe_extrato} onChange={(e) => setForm({ ...form, recebe_extrato: e.target.checked })} title="Recebe o extrato" />
            <button type="button" className="text-left text-sm text-gray-700" onClick={() => setForm({ ...form, recebe_extrato: !form.recebe_extrato })}>
              Recebe os aportes e resgates do extrato do Nubank
              <span className="block text-xs text-gray-500">a aplicação e o resgate do RDB de cada extrato importado entram aqui. Uma conta só, e só enquanto ela não tem investimentos cadastrados.</span>
            </button>
          </span>
        )}
        {conta?.id && (
          <div>
            <span className="label">Histórico da conta {temInvestimentos && <span className="font-normal text-gray-400">· as fotos de antes dos investimentos</span>}</span>
            <Historico fotos={saldos} movimentos={movimentos} onExcluirFoto={(f) => apagar.foto(f, true)} onExcluirMov={apagar.mov} />
          </div>
        )}
        <p className="text-xs text-gray-500">Conta encerrada: registre o saldo 0 (ou o resgate de cada investimento) antes de desativar.</p>
        <RodapeForm onCancelar={onFechar} salvando={salvando} />
      </form>
    </Modal>
  );
}

// ------------------------------------------------------------ o investimento
// `inv`: o que se edita (null = novo); `contaInicial`: a conta já escolhida (o "+" da linha da conta).
export function ModalInvestimento({ inv, contaInicial, contas, valores = [], movimentos = [], onFechar, onSalvo, onMudou, z }) {
  const toast = useToast();
  const confirmar = useConfirmacao();
  const novo = !inv?.id;
  const hoje = todayISO();
  const ativas = contas.filter((c) => c.ativa || c.id === inv?.conta_id);
  const [f, setF] = useState(() => (inv ? {
    ...inv, taxa: taxaParaCampo(inv.taxa), indexador: inv.indexador ?? '', liquidez_dias: inv.liquidez_dias ? String(inv.liquidez_dias) : '',
    carencia_ate: inv.carencia_ate ?? '', vencimento: inv.vencimento ?? '', aplicado_em: inv.aplicado_em ?? '',
    aplicado_inicial: inv.aplicado_inicial_centavos === null || inv.aplicado_inicial_centavos === undefined ? '' : valorParaCampo(inv.aplicado_inicial_centavos),
  } : {
    nome: '', conta_id: contaInicial?.id ?? (ativas.length === 1 ? ativas[0].id : ''), tipo: 'cdb', indexador: 'cdi_pct', taxa: '', liquidez: 'diaria', liquidez_dias: '',
    carencia_ate: '', vencimento: '', emissor: '', aplicado_em: '', aplicado_inicial: '', observacao: '', ativo: true, vale: '', data: hoje, comoAporte: false,
  }));
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);
  const muda = (k, v) => { setF((x) => ({ ...x, [k]: v })); setErro(''); };
  const apagar = useApagar(onMudou);

  const enviar = async (e) => {
    e.preventDefault();
    if (!f.nome.trim()) { setErro('Dê um nome ao investimento (como você o reconhece).'); return; }
    if (!f.conta_id) { setErro('Escolha a conta (onde ele está).'); return; }
    const taxa = f.indexador ? lerTaxa(f.taxa) : null;
    if (Number.isNaN(taxa)) { setErro('Taxa inválida: use só o número (ex.: 100 para 100% do CDI, 6,8 para IPCA + 6,8%).'); return; }
    const dias = f.liquidez === 'dias' ? Number(f.liquidez_dias) : null;
    if (f.liquidez === 'dias' && !(dias > 0)) { setErro('Informe em quantos dias o resgate cai (D+N).'); return; }
    const aplicadoInicial = vazio(f.aplicado_inicial) ? null : parseValor(f.aplicado_inicial);
    if (!vazio(f.aplicado_inicial) && (aplicadoInicial === null || aplicadoInicial < 0)) { setErro('"Aplicado até hoje" inválido.'); return; }
    const dados = {
      conta_id: f.conta_id, nome: f.nome, tipo: f.tipo, indexador: f.indexador || null, taxa, liquidez: f.liquidez, liquidez_dias: dias,
      carencia_ate: f.liquidez === 'carencia' ? f.carencia_ate || null : null, vencimento: f.vencimento || null, emissor: f.emissor ?? '',
      aplicado_em: f.aplicado_em || null, aplicado_inicial_centavos: aplicadoInicial, observacao: f.observacao ?? '', ativo: f.ativo !== false,
    };
    let vale = null;
    if (novo) {
      vale = parseValor(f.vale);
      if (vazio(f.vale) || vale === null || vale < 0) { setErro('Informe quanto ele vale hoje (o valor que o app do banco mostra).'); return; }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(f.data)) { setErro('Informe a data do valor.'); return; }
    }
    setSalvando(true);
    try {
      const salvo = novo
        ? await criarInvestimento(dados, { valor_centavos: vale, data: f.data, comoAporte: !!f.comoAporte })
        : await atualizarInvestimento(inv.id, dados);
      toast.success(novo ? `${salvo.nome} cadastrado.` : 'Investimento atualizado.');
      onSalvo(salvo);
    } catch (err) { setErro(err.message); setSalvando(false); }
  };
  const excluir = async () => {
    const ok = await confirmar({
      titulo: `Excluir "${inv.nome}"?`, perigo: true, confirmar: 'Excluir',
      texto: `Os ${valores.length} valor(es) e ${movimentos.length} movimento(s) dele também são apagados. Se ele só venceu ou foi resgatado, prefira desmarcar "Ativo": ele sai da lista e o rendimento continua no histórico.`,
    });
    if (!ok) return;
    try { await excluirInvestimento(inv.id); toast.success('Investimento excluído.'); onSalvo(null); } catch (err) { toast.error(err.message); }
  };

  const sel = (k, opcoes, props = {}) => <SelectSimples value={f[k] ?? ''} onChange={(v) => muda(k, v)} opcoes={opcoes} {...props} />;
  const imposto = impostoGarantia(f.tipo);
  return (
    <Modal open onClose={onFechar} title={novo ? 'Novo investimento' : 'Editar investimento'} maxWidth="max-w-2xl" z={z}
      subtitulo={novo ? 'Cadastre uma vez; depois, aportes e o registro do mês fazem o resto.' : [nomeTipoInvestimento(inv.tipo), rotuloRende(inv)].filter(Boolean).join(' · ')}>
      <form onSubmit={enviar} className="space-y-4">
        <Campo rotulo="Nome">
          <input className="input" autoFocus={novo} value={f.nome} placeholder="Ex.: CDB Nubank, Tesouro IPCA+ 2035" onChange={(e) => muda('nome', e.target.value)} />
        </Campo>
        <div className={doisCampos}>
          <Campo rotulo="Conta (onde ele está)">{sel('conta_id', ativas.map((c) => ({ value: c.id, label: c.nome })), { placeholder: 'Escolha a conta' })}</Campo>
          <Campo rotulo="Tipo">{sel('tipo', TIPOS_INVESTIMENTO.map((t) => ({ value: t.value, label: t.label })))}</Campo>
        </div>
        <div className={doisCampos}>
          <Campo rotulo="Rende">{sel('indexador', INDEXADORES)}</Campo>
          {f.indexador ? (
            <Campo rotulo={f.indexador === 'cdi_pct' ? 'Taxa (% do CDI)' : f.indexador === 'prefixado' ? 'Taxa (% ao ano)' : 'Taxa (% ao ano, além do índice)'}>
              <input className="input text-right tabular-nums" inputMode="decimal" value={f.taxa} placeholder={f.indexador === 'cdi_pct' ? '100' : '6,5'} onChange={(e) => muda('taxa', e.target.value)} />
            </Campo>
          ) : <span />}
        </div>
        <div className={doisCampos}>
          <Campo rotulo="Liquidez">{sel('liquidez', LIQUIDEZ)}</Campo>
          {f.liquidez === 'dias' ? (
            <Campo rotulo="O resgate cai em (dias)">
              <input className="input text-right tabular-nums" inputMode="numeric" value={f.liquidez_dias} placeholder="30" onChange={(e) => muda('liquidez_dias', e.target.value.replace(/\D/g, ''))} />
            </Campo>
          ) : f.liquidez === 'carencia' ? (
            <Campo rotulo="Carência até"><CampoData value={f.carencia_ate} onChange={(v) => muda('carencia_ate', v)} /></Campo>
          ) : <span />}
        </div>
        <div className={doisCampos}>
          <Campo rotulo="Vencimento"><CampoData value={f.vencimento} onChange={(v) => muda('vencimento', v)} vazio="sem vencimento" /></Campo>
          <Campo rotulo="Emissor (o banco que emitiu)">
            <input className="input" value={f.emissor ?? ''} placeholder="Ex.: Banco A (pode não ser a corretora)" onChange={(e) => muda('emissor', e.target.value)} />
          </Campo>
        </div>
        {imposto && (
          <p className="flex items-center gap-2 rounded-md border border-dashed border-gray-300 px-3 py-2 text-[13px] text-gray-600">
            {imposto}<span className="ml-auto text-[11.5px] text-gray-400">pelo tipo · o app não calcula imposto</span>
          </p>
        )}
        {novo && (
          <div className="rounded-md border border-gray-200 p-3">
            <div className={doisCampos}>
              <Campo rotulo="Vale hoje">
                <input className="input text-right tabular-nums" inputMode="decimal" value={f.vale} placeholder="0,00" onChange={(e) => muda('vale', e.target.value)} />
              </Campo>
              <Campo rotulo="Em"><CampoData value={f.data} onChange={(v) => muda('data', v)} max={hoje} /></Campo>
            </div>
            <span className="mt-3 flex items-start gap-2">
              <Checkbox checked={!!f.comoAporte} onChange={(e) => muda('comoAporte', e.target.checked)} title="Aplicação nova" />
              <button type="button" className="text-left text-sm text-gray-700" onClick={() => muda('comoAporte', !f.comoAporte)}>
                É uma aplicação nova
                <span className="block text-xs text-gray-500">o valor entra também como aporte nesta data (conta no "aportado no ano"). Deixe desmarcado para o que você já tinha antes do app.</span>
              </button>
            </span>
          </div>
        )}
        <div>
          <span className="label">Opcionais</span>
          <div className={doisCampos}>
            <Campo rotulo="Aplicado até hoje (do seu bolso)">
              <input className="input text-right tabular-nums" inputMode="decimal" value={f.aplicado_inicial} placeholder={novo ? 'o "valor aplicado" do banco' : '—'} onChange={(e) => muda('aplicado_inicial', e.target.value)} />
            </Campo>
            <Campo rotulo="Data da aplicação"><CampoData value={f.aplicado_em} onChange={(v) => muda('aplicado_em', v)} max={hoje} /></Campo>
          </div>
          <p className="mt-1 text-xs text-gray-500">Sem o "aplicado até hoje", o rendimento conta a partir do cadastro (o valor de hoje vira o aplicado).</p>
        </div>
        <Campo rotulo="Observação">
          <input className="input" value={f.observacao ?? ''} placeholder="Ex.: reserva de emergência" onChange={(e) => muda('observacao', e.target.value)} />
        </Campo>
        {!novo && (
          <>
            <span className="flex items-start gap-2">
              <Checkbox checked={f.ativo !== false} onChange={(e) => muda('ativo', e.target.checked)} title="Ativo" />
              <button type="button" className="text-left text-sm text-gray-700" onClick={() => muda('ativo', f.ativo === false)}>
                Ativo
                <span className="block text-xs text-gray-500">desmarque quando ele vencer ou for resgatado inteiro: sai da lista e do "Registrar o mês", e o histórico fica.</span>
              </button>
            </span>
            <div>
              <span className="label">Histórico</span>
              <Historico fotos={valores} movimentos={movimentos} onExcluirFoto={(x) => apagar.foto(x, false)} onExcluirMov={apagar.mov} />
            </div>
          </>
        )}
        {erro && <p className="text-sm font-medium text-hx-dc2626">{erro}</p>}
        <div className="flex items-center gap-2 pt-1">
          {!novo && <button type="button" className="text-[13px] font-medium text-hx-c0393d hover:underline" onClick={excluir}>Excluir investimento</button>}
          <span className="flex-1" />
          <button type="button" className="btn-secondary" onClick={onFechar}>Cancelar</button>
          <button type="submit" className="btn-primary" disabled={salvando}>{salvando ? 'Salvando…' : novo ? 'Cadastrar' : 'Salvar'}</button>
        </div>
      </form>
    </Modal>
  );
}

// ------------------------------------------------------------ o aporte / resgate
// `inicial`: { inv?, conta?, tipo }. `grupos`: a carteira (para a lista agrupada por conta e o "fica com R$ X aplicados").
export function ModalMovimento({ inicial, grupos, contas, onFechar, onSalvo, onNovoInvestimento, z }) {
  const toast = useToast();
  const hoje = todayISO();
  const [tipo, setTipo] = useState(inicial?.tipo ?? 'aporte');
  const [alvo, setAlvo] = useState(inicial?.inv ? `i:${inicial.inv.id}` : inicial?.conta ? `c:${inicial.conta.id}` : '');
  const [data, setData] = useState(hoje);
  const [valor, setValor] = useState('');
  const [descricao, setDescricao] = useState('');
  const [encerrar, setEncerrar] = useState(false);
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);

  // a lista: os títulos ativos de cada conta; a conta sem títulos entra ela mesma
  const opcoes = useMemo(() => grupos.flatMap((g) => (g.soConta
    ? (g.conta.ativa === false ? [] : [{ value: `c:${g.conta.id}`, label: `${g.conta.nome} (a conta inteira)`, grupo: { nome: g.conta.nome, cor: g.cor } }])
    : g.itens.filter((x) => x.inv.ativo !== false).map((x) => ({
      value: `i:${x.inv.id}`, label: [x.inv.nome, rotuloRende(x.inv)].filter(Boolean).join(' · '), grupo: { nome: g.conta.nome, cor: g.cor },
    })))), [grupos]);
  const escolhido = useMemo(() => {
    if (alvo.startsWith('i:')) {
      for (const g of grupos) { const x = g.itens.find((i) => `i:${i.inv.id}` === alvo); if (x) return { x, conta: g.conta }; }
    }
    if (alvo.startsWith('c:')) { const g = grupos.find((y) => `c:${y.conta.id}` === alvo); if (g) return { conta: g.conta, g }; }
    return null;
  }, [alvo, grupos]);
  const v = vazio(valor) ? null : parseValor(valor);
  const aplicadoDepois = escolhido?.x && v ? escolhido.x.aplicado + (tipo === 'resgate' ? -v : v) : null;

  const enviar = async (e) => {
    e.preventDefault();
    if (!escolhido) { setErro('Escolha o investimento.'); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) { setErro('Informe a data.'); return; }
    if (v === null || !(v > 0)) { setErro('Informe o valor.'); return; }
    setSalvando(true);
    try {
      await lancarMovimento({
        conta_id: escolhido.conta.id, investimento_id: escolhido.x?.inv.id ?? null, data, tipo, valor_centavos: v, descricao,
      }, { encerrar: tipo === 'resgate' && encerrar && !!escolhido.x });
      toast.success(`${tipo === 'aporte' ? 'Aporte' : 'Resgate'} de ${formatBRL(v)} ${tipo === 'aporte' ? 'em' : 'de'} ${escolhido.x?.inv.nome ?? escolhido.conta.nome}${encerrar && tipo === 'resgate' ? ' · encerrado' : ''}.`);
      onSalvo();
    } catch (err) { setErro(err.message); setSalvando(false); }
  };

  return (
    <Modal open onClose={onFechar} title={tipo === 'aporte' ? 'Novo aporte' : 'Novo resgate'} maxWidth="max-w-md" z={z}>
      <form onSubmit={enviar} className="space-y-4">
        <AbasPilula abas={[{ key: 'aporte', label: 'Aporte' }, { key: 'resgate', label: 'Resgate' }]} valor={tipo} onChange={(t) => { setTipo(t); setErro(''); }}
          variante="claro" cheia altura={32} folga={2} />
        <Campo rotulo="Investimento">
          <SelectBusca value={alvo} onChange={(x) => { setAlvo(x); setErro(''); }} opcoes={opcoes} placeholder="Escolha o investimento" buscaPlaceholder="Buscar investimento"
            acao={onNovoInvestimento ? { rotulo: () => 'Novo investimento', onClick: () => onNovoInvestimento((novo) => setAlvo(`i:${novo.id}`)) } : undefined} />
        </Campo>
        <div className={doisCampos}>
          <Campo rotulo="Data"><CampoData value={data} onChange={setData} max={hoje} /></Campo>
          <Campo rotulo="Valor">
            <input className="input text-right tabular-nums" inputMode="decimal" value={valor} placeholder="0,00" autoFocus={!!inicial?.inv || !!inicial?.conta}
              onChange={(e) => { setValor(e.target.value); setErro(''); }} />
          </Campo>
        </div>
        <Campo rotulo="Observação (opcional)">
          <input className="input" value={descricao} placeholder={tipo === 'aporte' ? 'Ex.: 13º, sobra de outubro' : 'Ex.: compra do carro'} onChange={(e) => setDescricao(e.target.value)} />
        </Campo>
        {tipo === 'resgate' && escolhido?.x && (
          <span className="flex items-start gap-2">
            <Checkbox checked={encerrar} onChange={(e) => setEncerrar(e.target.checked)} title="Resgatei tudo" />
            <button type="button" className="text-left text-sm text-gray-700" onClick={() => setEncerrar(!encerrar)}>
              Resgatei tudo
              <span className="block text-xs text-gray-500">o valor dele fica 0 nesta data e ele sai da lista (o histórico e o que rendeu ficam).</span>
            </button>
          </span>
        )}
        {aplicadoDepois !== null && (
          <p className="rounded-md bg-hx-f9fafb px-3 py-2 text-[12.5px] text-gray-600">
            Depois {tipo === 'aporte' ? 'deste aporte' : 'deste resgate'} o {escolhido.x.inv.nome} fica com <b className="font-semibold text-gray-800">{formatBRL(aplicadoDepois)}</b> aplicados.
            {' '}O valor de hoje dele já soma o {tipo}; o rendimento se acerta quando você registrar o mês.
          </p>
        )}
        {erro && <p className="text-sm font-medium text-hx-dc2626">{erro}</p>}
        <RodapeForm onCancelar={onFechar} salvando={salvando} rotulo={tipo === 'aporte' ? 'Lançar o aporte' : 'Lançar o resgate'} />
      </form>
    </Modal>
  );
}

// ------------------------------------------------------------ registrar o mês
// Uma linha por investimento ativo (agrupados por conta) e uma por conta sem investimentos: o valor de antes, os
// aportes − resgates desde ele (com o "+ aporte" que lança ali mesmo), o valor de hoje e o "Rendeu" na hora — vermelho
// avisa que falta lançar um aporte ou um resgate.
export function ModalRegistrar({ grupos, saldos, valores, movimentos, onFechar, onSalvo, onMovimento }) {
  const toast = useToast();
  const hoje = todayISO();
  const ultimaAte = (fotos, ate) => fotos.filter((f) => f.data <= ate).reduce((m, f) => (!m || f.data > m.data ? f : m), null);
  const linhas = useMemo(() => grupos.filter((g) => g.conta.ativa !== false).map((g) => ({
    g,
    itens: g.soConta
      ? [{ chave: `c:${g.conta.id}`, nome: g.conta.nome, conta: true, fotos: saldos.filter((s) => s.conta_id === g.conta.id), movs: movimentos.filter((m) => m.conta_id === g.conta.id && !m.investimento_id) }]
      : g.itens.filter((x) => x.inv.ativo !== false).map((x) => ({
        chave: `i:${x.inv.id}`, nome: x.inv.nome, inv: x.inv, fotos: valores.filter((v) => v.investimento_id === x.inv.id), movs: movimentos.filter((m) => m.investimento_id === x.inv.id),
      })),
  })).filter((l) => l.itens.length), [grupos, saldos, valores, movimentos]);
  const todasFotos = linhas.flatMap((l) => l.itens.flatMap((i) => i.fotos));
  // Nos primeiros dias do mês, o valor que importa é o do fim do mês que passou — a não ser que já haja foto depois dele.
  const [data, setData] = useState(() => {
    const fimAnterior = ultimoDiaDoMes(addMeses(hoje.slice(0, 7), -1));
    const jaTem = todasFotos.some((f) => f.data >= fimAnterior);
    return Number(hoje.slice(8, 10)) <= 5 && !jaTem ? fimAnterior : hoje;
  });
  const [campos, setCampos] = useState({});
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);

  const calc = (i) => {
    const antes = ultimaAte(i.fotos.filter((f) => f.data < data), data);
    const ms = i.movs.filter((m) => m.data > (antes?.data ?? '0000-00-00') && m.data <= data);
    const liq = ms.reduce((s, m) => s + (m.tipo === 'resgate' ? -1 : 1) * Number(m.valor_centavos), 0);
    const t = campos[i.chave];
    const novo = vazio(t) ? null : parseValor(t);
    return { antes, liq, n: ms.length, novo, rendeu: novo !== null && antes ? novo - Number(antes.valor_centavos) - liq : null };
  };
  const enviar = async (e) => {
    e.preventDefault();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) { setErro('Informe a data.'); return; }
    const invs = []; const contas = [];
    for (const l of linhas) {
      for (const i of l.itens) {
        const t = campos[i.chave];
        if (vazio(t)) continue;
        const v = parseValor(t);
        if (v === null || (!i.conta && v < 0)) { setErro(`Valor inválido em ${i.nome}.`); return; }
        if (i.conta) contas.push({ conta_id: l.g.conta.id, valor_centavos: v }); else invs.push({ investimento_id: i.inv.id, valor_centavos: v });
      }
    }
    if (!invs.length && !contas.length) { setErro('Preencha ao menos um valor.'); return; }
    setSalvando(true);
    try {
      await registrarValores(data, invs);
      await registrarSaldos(data, contas);
      toast.success(`${invs.length + contas.length} valor(es) registrados em ${formatDate(data)}.`);
      onSalvo();
    } catch (err) { toast.error(err.message); setSalvando(false); }
  };
  const th = 'sticky top-0 z-10 border-b border-gray-200 bg-hx-f9fafb px-3 py-2 text-right text-[10.5px] font-semibold uppercase tracking-wide text-gray-500';
  return (
    <Modal open onClose={onFechar} title="Registrar o mês" subtitulo="Quanto cada investimento vale nesta data — o valor que o app do banco mostra." maxWidth="max-w-4xl">
      <form onSubmit={enviar} className="space-y-4">
        <div className="flex flex-wrap items-end gap-4">
          <Campo rotulo="Data do valor" className="w-[200px]"><CampoData value={data} onChange={setData} max={hoje} /></Campo>
          <p className="min-w-[240px] flex-1 pb-2 text-xs text-gray-500">Deixe em branco o que não quer atualizar agora. Um aporte esquecido aparece como rendimento: o "+ aporte" da linha lança ali mesmo.</p>
        </div>
        <div className="max-h-[56vh] overflow-auto rounded-md border border-gray-200">
          <table className="w-full border-separate border-spacing-0 text-[13px]">
            <thead>
              <tr>
                <th className={`${th} text-left`}>Investimento</th>
                <th className={th}>Valia</th>
                <th className={th}>Aportes − resgates</th>
                <th className={th}>Vale hoje</th>
                <th className={th}>Rendeu</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((l) => (
                <FragmentoConta key={l.g.conta.id} l={l} calc={calc} campos={campos}
                  onCampo={(k, t) => { setCampos((c) => ({ ...c, [k]: t })); setErro(''); }} onMovimento={onMovimento} />
              ))}
            </tbody>
          </table>
        </div>
        {erro && <p className="text-sm font-medium text-hx-dc2626">{erro}</p>}
        <RodapeForm onCancelar={onFechar} salvando={salvando} rotulo="Registrar" />
      </form>
    </Modal>
  );
}

function FragmentoConta({ l, calc, campos, onCampo, onMovimento }) {
  return (
    <>
      {!l.g.soConta && (
        <tr><td colSpan={5} className="border-b border-gray-100 bg-hx-f9fafb px-3 py-1.5 text-[12.5px] font-semibold text-gray-700">
          <span className="mr-2 inline-block h-2 w-2 rounded-full align-middle" style={{ background: l.g.cor }} />{l.g.conta.nome}
        </td></tr>
      )}
      {l.itens.map((i) => {
        const c = calc(i);
        return (
          <tr key={i.chave} className="align-top">
            <td className={`border-b border-gray-100 py-2 pr-3 ${l.g.soConta ? 'pl-3' : 'pl-7'}`}>
              <span className="block max-w-[260px] truncate font-medium text-gray-800">
                {l.g.soConta && <span className="mr-2 inline-block h-2 w-2 rounded-full align-middle" style={{ background: l.g.cor }} />}{i.nome}
              </span>
              {i.conta && <span className="block text-[11.5px] text-gray-500">a conta inteira (sem investimentos cadastrados)</span>}
            </td>
            <td className="border-b border-gray-100 px-3 py-2 text-right tabular-nums text-gray-600">
              {c.antes ? <>{formatBRL(c.antes.valor_centavos)}<span className="block text-[11.5px] text-gray-400">{formatDate(c.antes.data)}</span></> : <span className="text-gray-400">—</span>}
            </td>
            <td className="border-b border-gray-100 px-3 py-2 text-right tabular-nums">
              {c.liq ? <span className={c.liq > 0 ? 'text-green-700' : 'text-amber-700'}>{c.liq > 0 ? '+' : '−'}{formatBRL(Math.abs(c.liq))}</span> : <span className="text-gray-400">—</span>}
              {onMovimento && (
                <button type="button" onClick={() => onMovimento(i.inv ? { inv: i.inv, tipo: 'aporte' } : { conta: l.g.conta, tipo: 'aporte' })}
                  className="block w-full text-right text-[11.5px] font-medium text-gray-500 hover:text-gray-800 hover:underline">+ aporte</button>
              )}
            </td>
            <td className="border-b border-gray-100 px-3 py-1.5 text-right">
              <input className="input !h-8 !w-36 text-right tabular-nums" inputMode="decimal" placeholder="em branco" value={campos[i.chave] ?? ''}
                onChange={(e) => onCampo(i.chave, e.target.value)} aria-label={`Valor de hoje de ${i.nome}`} />
            </td>
            <td className={`whitespace-nowrap border-b border-gray-100 px-3 py-2 text-right tabular-nums ${c.rendeu === null ? 'text-gray-400' : c.rendeu < 0 ? 'text-hx-c0393d' : 'text-green-700'}`}>
              {c.rendeu === null ? '—' : formatBRL(c.rendeu)}
            </td>
          </tr>
        );
      })}
    </>
  );
}
