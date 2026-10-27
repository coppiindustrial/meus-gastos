import { useCallback, useEffect, useMemo, useState } from 'react';
import CabecalhoPagina from '../components/CabecalhoPagina.jsx';
import Modal from '../components/Modal.jsx';
import SelectSimples from '../components/SelectSimples.jsx';
import Checkbox from '../components/Checkbox.jsx';
import ListaVazia from '../components/ListaVazia.jsx';
import { PageLoading } from '../components/Spinner.jsx';
import { BotaoEditar, BotaoExcluir, Campo, Etiqueta, RodapeForm } from '../components/Comuns.jsx';
import { ColunasMes, COR_ENTRADAS } from '../components/graficos/Graficos.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { useConfirmacao } from '../context/ConfirmContext.jsx';
import { excluirConta, excluirSaldo, listarContas, listarSaldos, registrarSaldos, salvarConta } from '../api/patrimonio.js';
import { evolucao, somar, ultimoSaldoAte } from '../lib/patrimonio.js';
import { brlCurto, formatBRL, parseValor, valorParaCampo } from '../lib/dinheiro.js';
import { competenciaAtual, formatDate, todayISO } from '../lib/format.js';

// PATRIMÔNIO: as contas e as fotos de saldo delas. O total de cada mês é a soma do último saldo de cada
// conta até o fim do mês (lib/patrimonio.js). Registrar é uma tela só: a data e um campo por conta,
// já com o último valor — basta corrigir o que mudou.
const TIPOS = [
  { value: 'corrente', label: 'Conta corrente' },
  { value: 'investimento', label: 'Investimento' },
  { value: 'reserva', label: 'Reserva' },
  { value: 'outro', label: 'Outro' },
];
const nomeTipo = (t) => TIPOS.find((x) => x.value === t)?.label ?? t;

function ModalConta({ conta, onFechar, onSalvo }) {
  const toast = useToast();
  const [form, setForm] = useState(() => conta ?? { nome: '', tipo: 'corrente', instituicao: '', ativa: true });
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);
  const enviar = async (e) => {
    e.preventDefault();
    if (!form.nome.trim()) { setErro('Informe o nome da conta.'); return; }
    setSalvando(true);
    try { await salvarConta(form); toast.success(conta?.id ? 'Conta atualizada.' : 'Conta criada.'); onSalvo(); } catch (err) {
      setErro(/duplicate|unique/i.test(err.message) ? 'Já existe uma conta com esse nome.' : err.message);
      setSalvando(false);
    }
  };
  return (
    <Modal open onClose={onFechar} title={conta?.id ? 'Editar conta' : 'Nova conta'} maxWidth="max-w-md">
      <form onSubmit={enviar} className="space-y-4">
        <Campo rotulo="Nome" erro={erro}>
          <input className="input" autoFocus value={form.nome} placeholder="Ex.: Conta Itaú, CDB XP" onChange={(e) => { setForm({ ...form, nome: e.target.value }); setErro(''); }} />
        </Campo>
        <Campo rotulo="Tipo">
          <SelectSimples value={form.tipo} onChange={(tipo) => setForm({ ...form, tipo })} opcoes={TIPOS} />
        </Campo>
        <Campo rotulo="Instituição (opcional)">
          <input className="input" value={form.instituicao} onChange={(e) => setForm({ ...form, instituicao: e.target.value })} />
        </Campo>
        <span className="flex items-center gap-2">
          <Checkbox checked={form.ativa} onChange={(e) => setForm({ ...form, ativa: e.target.checked })} title="Ativa" />
          <button type="button" className="text-sm text-gray-700" onClick={() => setForm({ ...form, ativa: !form.ativa })}>Ativa (aparece ao registrar saldos)</button>
        </span>
        <p className="text-xs text-gray-500">Conta encerrada: registre o saldo 0 antes de desativar (o último saldo continua contando no patrimônio).</p>
        <RodapeForm onCancelar={onFechar} salvando={salvando} />
      </form>
    </Modal>
  );
}

function ModalSaldos({ contas, ultimos, onFechar, onSalvo }) {
  const toast = useToast();
  const ativas = contas.filter((c) => c.ativa);
  const [data, setData] = useState(todayISO());
  const [valores, setValores] = useState(() => Object.fromEntries(ativas.map((c) => [c.id, ultimos[c.id] ? valorParaCampo(ultimos[c.id].valor_centavos) : ''])));
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);
  const enviar = async (e) => {
    e.preventDefault();
    const itens = [];
    for (const c of ativas) {
      const texto = valores[c.id]?.trim();
      if (!texto) continue; // conta deixada em branco não ganha foto nesta data
      const v = parseValor(texto);
      if (v === null) { setErro(`Valor inválido em ${c.nome}.`); return; }
      itens.push({ conta_id: c.id, valor_centavos: v });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) { setErro('Informe a data.'); return; }
    if (!itens.length) { setErro('Preencha ao menos um saldo.'); return; }
    setSalvando(true);
    try { await registrarSaldos(data, itens); toast.success(`${itens.length} saldo(s) registrados em ${formatDate(data)}.`); onSalvo(); } catch (err) { toast.error(err.message); setSalvando(false); }
  };
  return (
    <Modal open onClose={onFechar} title="Registrar saldos" maxWidth="max-w-md">
      <form onSubmit={enviar} className="space-y-4">
        <Campo rotulo="Data do saldo">
          <input className="input" type="date" value={data} onChange={(e) => setData(e.target.value)} />
        </Campo>
        <div className="space-y-2">
          {ativas.map((c) => (
            <label key={c.id} className="flex items-center gap-3">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm text-gray-800">{c.nome}</span>
                <span className="block text-xs text-gray-500">
                  {ultimos[c.id] ? `último: ${formatBRL(ultimos[c.id].valor_centavos)} em ${formatDate(ultimos[c.id].data)}` : 'sem saldo ainda'}
                </span>
              </span>
              <input className="input !w-36 text-right tabular-nums" inputMode="decimal" placeholder="0,00" value={valores[c.id] ?? ''}
                onChange={(e) => { setValores((v) => ({ ...v, [c.id]: e.target.value })); setErro(''); }} />
            </label>
          ))}
        </div>
        <p className="text-xs text-gray-500">Deixe em branco a conta que não quer atualizar. Saldo negativo: use o sinal de menos.</p>
        {erro && <p className="text-sm font-medium text-hx-dc2626">{erro}</p>}
        <RodapeForm onCancelar={onFechar} salvando={salvando} rotulo="Registrar" />
      </form>
    </Modal>
  );
}

export default function Patrimonio() {
  const toast = useToast();
  const confirmar = useConfirmacao();
  const [contas, setContas] = useState(null);
  const [saldos, setSaldos] = useState([]);
  const [modal, setModal] = useState(null); // { tipo: 'conta' | 'saldos', item }
  const [aberta, setAberta] = useState(null); // conta com o histórico aberto

  const carregar = useCallback(async () => {
    try {
      const [c, s] = await Promise.all([listarContas(), listarSaldos()]);
      setContas(c); setSaldos(s);
    } catch (err) { toast.error(err.message); setContas([]); }
  }, [toast]);
  useEffect(() => { carregar(); }, [carregar]);

  const ultimos = useMemo(() => ultimoSaldoAte(saldos), [saldos]);
  const atual = useMemo(() => somar(ultimos, contas ?? []), [ultimos, contas]);
  // Até o mês atual: o último saldo continua valendo nos meses sem foto nova.
  const meses = useMemo(() => evolucao(saldos, contas ?? [], competenciaAtual()).slice(-12), [saldos, contas]);
  const anterior = meses.length > 1 ? meses[meses.length - 2] : null;

  const apagarConta = async (c) => {
    const n = saldos.filter((s) => s.conta_id === c.id).length;
    const ok = await confirmar({ titulo: `Excluir a conta "${c.nome}"?`, texto: `Os ${n} saldo(s) registrados nela também são apagados. Se a conta só foi encerrada, prefira desmarcar "Ativa".`, confirmar: 'Excluir', perigo: true });
    if (!ok) return;
    try { await excluirConta(c.id); toast.success('Conta excluída.'); carregar(); } catch (err) { toast.error(err.message); }
  };
  const apagarSaldo = async (s) => {
    if (!await confirmar({ titulo: 'Excluir este saldo?', texto: `${formatBRL(s.valor_centavos)} em ${formatDate(s.data)}.`, confirmar: 'Excluir', perigo: true })) return;
    try { await excluirSaldo(s.id); toast.success('Saldo excluído.'); carregar(); } catch (err) { toast.error(err.message); }
  };

  if (!contas) return (<div><CabecalhoPagina titulo="Patrimônio" /><PageLoading /></div>);

  return (
    <div>
      <CabecalhoPagina titulo="Patrimônio"
        acoes={<>
          {contas.length > 0 && <button type="button" className="btn-secondary" onClick={() => setModal({ tipo: 'conta' })}>Nova conta</button>}
          <button type="button" className="btn-primary" onClick={() => setModal(contas.some((c) => c.ativa) ? { tipo: 'saldos' } : { tipo: 'conta' })}>
            {contas.some((c) => c.ativa) ? 'Registrar saldos' : 'Nova conta'}
          </button>
        </>} />

      {contas.length === 0 ? (
        <div className="mt-6 max-w-2xl">
          <ListaVazia>
            Cadastre as contas que formam o seu patrimônio (conta corrente, investimentos, reserva…). Depois, de tempos em
            tempos, registre o saldo de cada uma: o app soma e mostra a evolução mês a mês.
          </ListaVazia>
        </div>
      ) : (
        <>
          <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <div className="card col-span-2 px-4 py-3 lg:col-span-1">
              <div className="text-[11px] font-medium uppercase tracking-wide text-gray-500">Patrimônio</div>
              <div className="mt-1 text-xl font-semibold tabular-nums text-gray-800">{formatBRL(atual.total)}</div>
              {anterior && (
                <div className="mt-0.5 text-xs text-gray-500">
                  {meses[meses.length - 1].total - anterior.total >= 0 ? '+' : ''}{brlCurto(meses[meses.length - 1].total - anterior.total)} no mês
                </div>
              )}
            </div>
            {TIPOS.filter((t) => atual.porTipo[t.value] !== undefined).map((t) => (
              <div key={t.value} className="card min-w-0 px-4 py-3">
                <div className="truncate text-[11px] font-medium uppercase tracking-wide text-gray-500">{t.label}</div>
                <div className="mt-1 whitespace-nowrap text-lg font-semibold tabular-nums text-gray-800">{brlCurto(atual.porTipo[t.value])}</div>
              </div>
            ))}
          </div>

          {meses.length > 0 && (
            <section className="card mt-4 p-4">
              <h2 className="mb-3 text-sm font-semibold text-gray-800">Evolução do patrimônio</h2>
              <ColunasMes meses={meses} cor={COR_ENTRADAS} rotulo="Patrimônio" nota={(m) => `${m.contas} conta(s) com saldo`} />
            </section>
          )}

          <div className="card mt-4 overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-gray-200 bg-gray-50">
                <tr>
                  <th className="table-th">Conta</th>
                  <th className="table-th hidden sm:table-cell">Tipo</th>
                  <th className="table-th text-right">Último saldo</th>
                  <th className="table-th hidden md:table-cell">Em</th>
                  <th className="table-th w-[84px]" aria-label="Ações" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {contas.map((c) => {
                  const u = ultimos[c.id];
                  const historico = saldos.filter((s) => s.conta_id === c.id).sort((a, b) => b.data.localeCompare(a.data));
                  return [
                    <tr key={c.id} className="group/linha cursor-pointer hover:bg-gray-50" onClick={() => setAberta(aberta === c.id ? null : c.id)}>
                      <td className="table-td">
                        <span className={c.ativa ? 'font-medium text-gray-800' : 'text-gray-400'}>{c.nome}</span>
                        {c.instituicao && <span className="ml-2 text-xs text-gray-500">{c.instituicao}</span>}
                        {!c.ativa && <span className="ml-2"><Etiqueta>Inativa</Etiqueta></span>}
                      </td>
                      <td className="table-td hidden sm:table-cell">{nomeTipo(c.tipo)}</td>
                      <td className={`table-td text-right tabular-nums ${u && Number(u.valor_centavos) < 0 ? 'text-hx-c0393d' : ''}`}>{u ? formatBRL(u.valor_centavos) : '—'}</td>
                      <td className="table-td hidden text-gray-500 md:table-cell">{u ? formatDate(u.data) : '—'}</td>
                      <td className="table-td" onClick={(e) => e.stopPropagation()}>
                        <span className="flex justify-end gap-1 md:opacity-0 md:transition-opacity md:group-hover/linha:opacity-100 md:focus-within:opacity-100">
                          <BotaoEditar onClick={() => setModal({ tipo: 'conta', item: c })} />
                          <BotaoExcluir onClick={() => apagarConta(c)} />
                        </span>
                      </td>
                    </tr>,
                    aberta === c.id && (
                      <tr key={`${c.id}-h`}>
                        <td colSpan={5} className="bg-gray-50 px-4 py-2">
                          {historico.length === 0 ? <span className="text-sm text-gray-500">Nenhum saldo registrado.</span> : (
                            <ul className="divide-y divide-gray-100">
                              {historico.map((s) => (
                                <li key={s.id} className="flex items-center gap-3 py-1 text-sm">
                                  <span className="w-24 text-gray-500">{formatDate(s.data)}</span>
                                  <span className="flex-1 tabular-nums text-gray-800">{formatBRL(s.valor_centavos)}</span>
                                  <BotaoExcluir titulo="Excluir este saldo" onClick={() => apagarSaldo(s)} />
                                </li>
                              ))}
                            </ul>
                          )}
                        </td>
                      </tr>
                    ),
                  ];
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-gray-500">Clique numa conta para ver e corrigir o histórico de saldos.</p>
        </>
      )}

      {modal?.tipo === 'conta' && <ModalConta conta={modal.item} onFechar={() => setModal(null)} onSalvo={() => { setModal(null); carregar(); }} />}
      {modal?.tipo === 'saldos' && <ModalSaldos contas={contas} ultimos={ultimos} onFechar={() => setModal(null)} onSalvo={() => { setModal(null); carregar(); }} />}
    </div>
  );
}
