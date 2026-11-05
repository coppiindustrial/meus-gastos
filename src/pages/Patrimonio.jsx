import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import CabecalhoPagina from '../components/CabecalhoPagina.jsx';
import Modal from '../components/Modal.jsx';
import CampoData from '../components/CampoData.jsx';
import SelectSimples from '../components/SelectSimples.jsx';
import Checkbox from '../components/Checkbox.jsx';
import ListaVazia from '../components/ListaVazia.jsx';
import { PageLoading } from '../components/Spinner.jsx';
import { BotaoEditar, BotaoExcluir, Campo, Etiqueta, RodapeForm } from '../components/Comuns.jsx';
import BalaoGrafico, { useBalao } from '../components/graficos/BalaoGrafico.jsx';
import { COR_ENTRADAS } from '../components/graficos/Graficos.jsx';
import { useNoCelular } from '../lib/celular.js';
import { varCor } from '../lib/varCor.js';
import { useToast } from '../context/ToastContext.jsx';
import { useConfirmacao } from '../context/ConfirmContext.jsx';
import {
  excluirConta, excluirMovimento, excluirSaldo, listarContas, listarMovimentos, listarSaldos, registrarSaldos, salvarConta, salvarMovimentos,
} from '../api/patrimonio.js';
import { cdiMensal } from '../api/cdi.js';
import { rendimentoDoPeriodo, rendimentoPorMes, ultimoSaldoAte } from '../lib/patrimonio.js';
import { brlCurto, formatBRL, parseValor, valorParaCampo } from '../lib/dinheiro.js';
import { competenciaAtual, competenciaCurta, formatDate, nomeCompetencia, todayISO } from '../lib/format.js';

// PATRIMÔNIO E RENDIMENTO (05/11/2026, a fase A do plano "Patrimônio e rentabilidade"; migration 013): as contas, as
// FOTOS do saldo e, agora, os APORTES e RESGATES de cada uma — é o que separa o que você guardou do que rendeu
// (`rendimentoPorMes` em lib/patrimonio.js, testada). Os do Nubank vêm do extrato importado (a conta marcada com
// "recebe o extrato"); os das outras, do "Registrar o mês". O CDI do mês vem do Banco Central (`api/cdi.js`).
//   · Os números: o patrimônio, o que rendeu no último mês com duas fotos, o do ano (o % encadeado) e o aportado no ano.
//   · Os gráficos: quanto do patrimônio é dinheiro aportado e quanto é rendimento acumulado; o % de cada mês e o CDI.
//   · A tabela por conta; tocar na conta abre o histórico (fotos e movimentos).
// Sem a migration 013, a tela funciona como antes (só as fotos) e avisa o que falta.
const TIPOS = [
  { value: 'corrente', label: 'Conta corrente' },
  { value: 'investimento', label: 'Investimento' },
  { value: 'reserva', label: 'Reserva' },
  { value: 'outro', label: 'Outro' },
];
const nomeTipo = (t) => TIPOS.find((x) => x.value === t)?.label ?? t;
const COR_APORTADO = varCor('#94a3b8', 'fundo');
const COR_CDI = varCor('#6b7280', 'texto');
const pctTexto = (f, casas = 2) => (f === null || f === undefined ? '—' : `${(f * 100).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas })}%`);
const doCdi = (p, c) => (p !== null && c > 0 ? `${Math.round((p / c) * 100)}% do CDI` : null);
// O CDI do mês corrente vem PARCIAL (o que já correu dele): só os meses fechados se comparam.
const cdiFechado = (cdi, comp) => (cdi && comp < competenciaAtual() ? cdi[comp] : undefined);
const ultimoDiaDoMes = (comp) => { const [y, m] = comp.split('-').map(Number); return `${comp}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, '0')}`; };

function ModalConta({ conta, comMovimentos, onFechar, onSalvo }) {
  const toast = useToast();
  const [form, setForm] = useState(() => conta ?? { nome: '', tipo: 'investimento', instituicao: '', ativa: true, recebe_extrato: false });
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);
  const enviar = async (e) => {
    e.preventDefault();
    if (!form.nome.trim()) { setErro('Informe o nome da conta.'); return; }
    setSalvando(true);
    try {
      await salvarConta({ ...form, recebe_extrato: comMovimentos ? !!form.recebe_extrato : undefined });
      toast.success(conta?.id ? 'Conta atualizada.' : 'Conta criada.');
      onSalvo();
    } catch (err) {
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
          <button type="button" className="text-sm text-gray-700" onClick={() => setForm({ ...form, ativa: !form.ativa })}>Ativa (aparece ao registrar o mês)</button>
        </span>
        {comMovimentos && (
          <span className="flex items-start gap-2">
            <Checkbox checked={!!form.recebe_extrato} onChange={(e) => setForm({ ...form, recebe_extrato: e.target.checked })} title="Recebe o extrato" />
            <button type="button" className="text-left text-sm text-gray-700" onClick={() => setForm({ ...form, recebe_extrato: !form.recebe_extrato })}>
              Recebe os aportes e resgates do extrato do Nubank
              <span className="block text-xs text-gray-500">a aplicação e o resgate do RDB e o “dinheiro guardado” de cada extrato importado entram aqui. Uma conta só.</span>
            </button>
          </span>
        )}
        <p className="text-xs text-gray-500">Conta encerrada: registre o saldo 0 antes de desativar (o último saldo continua contando no patrimônio).</p>
        <RodapeForm onCancelar={onFechar} salvando={salvando} />
      </form>
    </Modal>
  );
}

// REGISTRAR O MÊS: a data e, por conta, o saldo (já com o último valor), os aportes e os resgates digitados — os que
// vieram do extrato desde a última foto aparecem prontos ao lado. O "Rendeu" sai na hora; negativo é sinal de que
// falta um aporte ou um resgate.
function ModalRegistrar({ contas, ultimos, movimentos, comMovimentos, onFechar, onSalvo }) {
  const toast = useToast();
  const ativas = contas.filter((c) => c.ativa);
  const hoje = todayISO();
  // Nos primeiros dias do mês, o saldo que importa é o do fim do mês que passou — a não ser que já haja foto depois dele
  // (aí a de hoje, senão o "Rendeu" não teria com o que comparar).
  const [data, setData] = useState(() => {
    const fimAnterior = ultimoDiaDoMes(addMesesLocal(hoje.slice(0, 7), -1));
    const jaTem = Object.values(ultimos).some((u) => u.data >= fimAnterior);
    return Number(hoje.slice(8, 10)) <= 5 && !jaTem ? fimAnterior : hoje;
  });
  const [valores, setValores] = useState(() => Object.fromEntries(ativas.map((c) => [c.id, {
    saldo: ultimos[c.id] ? valorParaCampo(ultimos[c.id].valor_centavos) : '', aporte: '', resgate: '',
  }])));
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);
  const muda = (id, campo, v) => { setValores((x) => ({ ...x, [id]: { ...x[id], [campo]: v } })); setErro(''); };
  // os movimentos que já estão gravados (do extrato) entre a última foto e a data
  const jaGravados = (c) => {
    const de = ultimos[c.id]?.data ?? '0000-00-00';
    const ms = (movimentos ?? []).filter((m) => m.conta_id === c.id && m.data > de && m.data <= data);
    return { n: ms.length, liquido: ms.reduce((s, m) => s + (m.tipo === 'resgate' ? -1 : 1) * Number(m.valor_centavos), 0) };
  };
  const num = (t) => (String(t ?? '').trim() ? parseValor(t) : 0);
  const rendeu = (c) => {
    const s = num(valores[c.id]?.saldo);
    const u = ultimos[c.id];
    if (s === null || !String(valores[c.id]?.saldo ?? '').trim() || !u || u.data >= data) return null;
    const a = num(valores[c.id].aporte);
    const r = num(valores[c.id].resgate);
    if (a === null || r === null) return null;
    return s - Number(u.valor_centavos) - jaGravados(c).liquido - a + r;
  };
  const enviar = async (e) => {
    e.preventDefault();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) { setErro('Informe a data.'); return; }
    const itens = [];
    const movs = [];
    for (const c of ativas) {
      const v = valores[c.id];
      if (String(v.saldo ?? '').trim()) {
        const s = parseValor(v.saldo);
        if (s === null) { setErro(`Saldo inválido em ${c.nome}.`); return; }
        itens.push({ conta_id: c.id, valor_centavos: s });
      }
      for (const [campo, tipo] of [['aporte', 'aporte'], ['resgate', 'resgate']]) {
        if (!String(v[campo] ?? '').trim()) continue;
        const x = parseValor(v[campo]);
        if (x === null || x < 0) { setErro(`Valor inválido em ${c.nome} (${campo}).`); return; }
        if (x > 0) movs.push({ conta_id: c.id, data, tipo, valor_centavos: x, descricao: 'Registrar o mês' });
      }
    }
    if (!itens.length) { setErro('Preencha ao menos um saldo.'); return; }
    setSalvando(true);
    try {
      await registrarSaldos(data, itens);
      if (movs.length) await salvarMovimentos(movs);
      toast.success(`${itens.length} saldo(s) registrados em ${formatDate(data)}${movs.length ? ` e ${movs.length} movimento(s)` : ''}.`);
      onSalvo();
    } catch (err) { toast.error(err.message); setSalvando(false); }
  };
  const th = 'pb-1.5 text-right text-[11px] font-semibold uppercase tracking-wide text-gray-500';
  return (
    <Modal open onClose={onFechar} title="Registrar o mês" maxWidth={comMovimentos ? 'max-w-3xl' : 'max-w-md'}>
      <form onSubmit={enviar} className="space-y-4">
        <Campo rotulo="Data do saldo">
          <CampoData value={data} onChange={setData} />
        </Campo>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className={`${th} text-left`}>Conta</th>
                <th className={th}>Saldo</th>
                {comMovimentos && <><th className={th}>Aportes</th><th className={th}>Resgates</th><th className={th}>Rendeu</th></>}
              </tr>
            </thead>
            <tbody>
              {ativas.map((c) => {
                const g = jaGravados(c);
                const r = comMovimentos ? rendeu(c) : null;
                return (
                  <tr key={c.id} className="align-top">
                    <td className="py-1.5 pr-3">
                      <span className="block truncate text-gray-800">{c.nome}</span>
                      <span className="block text-xs text-gray-500">{ultimos[c.id] ? `último: ${formatBRL(ultimos[c.id].valor_centavos)} em ${formatDate(ultimos[c.id].data)}` : 'sem saldo ainda'}</span>
                    </td>
                    <td className="py-1.5 pl-2">
                      <input className="input !w-36 text-right tabular-nums" inputMode="decimal" placeholder="0,00" value={valores[c.id]?.saldo ?? ''}
                        onChange={(e) => muda(c.id, 'saldo', e.target.value)} aria-label={`Saldo de ${c.nome}`} />
                    </td>
                    {comMovimentos && (
                      <>
                        <td className="py-1.5 pl-2">
                          <input className="input !w-28 text-right tabular-nums" inputMode="decimal" placeholder="0,00" value={valores[c.id]?.aporte ?? ''}
                            onChange={(e) => muda(c.id, 'aporte', e.target.value)} aria-label={`Aportes em ${c.nome}`} />
                          {g.n > 0 && <span className="mt-0.5 block text-right text-[11.5px] text-gray-500">{g.liquido >= 0 ? '+' : '−'}{formatBRL(Math.abs(g.liquido))} do extrato ({g.n})</span>}
                        </td>
                        <td className="py-1.5 pl-2">
                          <input className="input !w-28 text-right tabular-nums" inputMode="decimal" placeholder="0,00" value={valores[c.id]?.resgate ?? ''}
                            onChange={(e) => muda(c.id, 'resgate', e.target.value)} aria-label={`Resgates de ${c.nome}`} />
                        </td>
                        <td className={`whitespace-nowrap py-3 pl-3 text-right tabular-nums ${r === null ? 'text-gray-400' : r < 0 ? 'text-hx-c0393d' : 'text-green-700'}`}>
                          {r === null ? '—' : formatBRL(r)}
                        </td>
                      </>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-gray-500">
          Deixe em branco a conta que não quer atualizar. Saldo negativo: use o sinal de menos.
          {comMovimentos && ' Aportes e resgates: só os que NÃO vieram do extrato (os dele já estão somados). O "Rendeu" negativo quase sempre é um aporte ou resgate que faltou.'}
        </p>
        {erro && <p className="text-sm font-medium text-hx-dc2626">{erro}</p>}
        <RodapeForm onCancelar={onFechar} salvando={salvando} rotulo="Registrar" />
      </form>
    </Modal>
  );
}
function addMesesLocal(comp, n) {
  const [y, m] = comp.split('-').map(Number);
  const t = y * 12 + (m - 1) + n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`;
}

// QUANTO É SEU E QUANTO RENDEU: uma coluna por mês, o aportado embaixo e o rendimento acumulado em cima, o total no topo.
function ColunasAportado({ meses }) {
  const balao = useBalao(240, 120);
  const max = Math.max(1, ...meses.map((m) => m.total));
  const a = balao.ativo !== null ? meses[balao.ativo] : null;
  return (
    <div>
      <div className="flex h-[190px] items-end gap-1.5 border-b border-gray-200 pt-5" onMouseLeave={balao.aoSair}>
        {meses.map((m, i) => {
          const hA = (Math.max(0, m.aportado) / max) * 100;
          const hR = (Math.max(0, m.rendimentoAcum) / max) * 100;
          return (
            <div key={m.competencia} className="relative flex h-full min-w-0 flex-1 flex-col justify-end transition-opacity duration-100"
              style={{ opacity: balao.esmaecido(i) ? 0.4 : 1 }} onMouseMove={balao.aoMover(i)}>
              <span className="mb-0.5 hidden truncate text-center text-[9.5px] font-semibold tabular-nums text-gray-600 sm:block">{brlCurto(m.total).replace('R$ ', '')}</span>
              <div className="mx-auto w-full max-w-[44px]">
                <div className="rounded-t-[2px]" style={{ height: `${(hR / 100) * 150}px`, background: COR_ENTRADAS }} />
                <div style={{ height: `${(hA / 100) * 150}px`, background: COR_APORTADO }} />
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex gap-1.5 pt-1">
        {meses.map((m) => <span key={m.competencia} className="min-w-0 flex-1 text-center text-[10px] text-gray-500">{competenciaCurta(m.competencia).slice(0, 3)}</span>)}
      </div>
      {a && (
        <BalaoGrafico pos={balao.pos} largura={240} titulo={nomeCompetencia(a.competencia)} itens={[
          { rotulo: 'Patrimônio', valor: formatBRL(a.total) },
          { rotulo: 'Dinheiro aportado', valor: formatBRL(a.aportado), cor: COR_APORTADO },
          { rotulo: 'Rendimento acumulado', valor: formatBRL(a.rendimentoAcum), cor: COR_ENTRADAS },
        ]} />
      )}
    </div>
  );
}

// O RENDIMENTO DE CADA MÊS: a coluna é o % do mês, e o traço o CDI do mesmo mês.
function ColunasRendimento({ meses, cdi }) {
  const balao = useBalao(240, 120);
  const max = Math.max(0.002, ...meses.map((m) => Math.max(m.pct ?? 0, cdi?.[m.competencia] ?? 0))) * 1.15;
  const a = balao.ativo !== null ? meses[balao.ativo] : null;
  return (
    <div>
      <div className="flex h-[190px] items-end gap-1.5 border-b border-gray-200 pt-5" onMouseLeave={balao.aoSair}>
        {meses.map((m, i) => {
          const c = cdiFechado(cdi, m.competencia);
          return (
            <div key={m.competencia} className="relative flex h-full min-w-0 flex-1 flex-col justify-end transition-opacity duration-100"
              style={{ opacity: balao.esmaecido(i) ? 0.4 : 1 }} onMouseMove={balao.aoMover(i)}>
              {m.pct !== null && <span className="mb-0.5 hidden text-center text-[9.5px] font-semibold tabular-nums text-gray-600 sm:block">{(m.pct * 100).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}</span>}
              <div className="relative mx-auto w-full max-w-[44px]" style={{ height: `${(Math.max(0, m.pct ?? 0) / max) * 150}px` }}>
                <div className="absolute inset-0 rounded-t-[2px]" style={{ background: m.rendeu !== null && m.rendeu < 0 ? varCor('#e5484d', 'fundo') : COR_ENTRADAS, opacity: 0.85 }} />
              </div>
              {c !== undefined && m.pct !== null && (
                <span className="pointer-events-none absolute inset-x-0 border-t-2 border-dashed" style={{ bottom: `${(c / max) * 150}px`, borderColor: COR_CDI }} />
              )}
            </div>
          );
        })}
      </div>
      <div className="flex gap-1.5 pt-1">
        {meses.map((m) => <span key={m.competencia} className="min-w-0 flex-1 text-center text-[10px] text-gray-500">{competenciaCurta(m.competencia).slice(0, 3)}</span>)}
      </div>
      {a && (
        <BalaoGrafico pos={balao.pos} largura={240} titulo={nomeCompetencia(a.competencia)} itens={a.rendeu === null ? [] : [
          { rotulo: 'Rendeu', valor: `${formatBRL(a.rendeu)} · ${pctTexto(a.pct)}`, cor: COR_ENTRADAS },
          ...(cdiFechado(cdi, a.competencia) !== undefined ? [{ rotulo: 'CDI do mês', valor: pctTexto(cdi[a.competencia]), cor: COR_CDI }] : []),
          { rotulo: 'Aportes − resgates', valor: formatBRL(a.aportes - a.resgates) },
        ]} nota={a.rendeu === null ? 'Sem duas fotos para comparar neste mês.' : doCdi(a.pct, cdiFechado(cdi, a.competencia)) ?? undefined} />
      )}
    </div>
  );
}

export default function Patrimonio() {
  const toast = useToast();
  const confirmar = useConfirmacao();
  const movel = useNoCelular();
  const [contas, setContas] = useState(null);
  const [saldos, setSaldos] = useState([]);
  const [movimentos, setMovimentos] = useState([]); // null = falta a migration 013
  const [cdi, setCdi] = useState(null);
  const [modal, setModal] = useState(null); // { tipo: 'conta' | 'mes', item }
  const [aberta, setAberta] = useState(null); // conta com o histórico aberto

  const carregar = useCallback(async () => {
    try {
      const [c, s, m] = await Promise.all([listarContas(), listarSaldos(), listarMovimentos()]);
      setContas(c); setSaldos(s); setMovimentos(m);
    } catch (err) { toast.error(err.message); setContas([]); }
  }, [toast]);
  useEffect(() => { carregar(); }, [carregar]);

  const hoje = competenciaAtual();
  const anoAtual = hoje.slice(0, 4);
  const ultimos = useMemo(() => ultimoSaldoAte(saldos), [saldos]);
  const meses = useMemo(() => rendimentoPorMes(saldos, movimentos ?? [], hoje), [saldos, movimentos, hoje]);
  const primeiroMes = meses[0]?.competencia;
  useEffect(() => { if (primeiroMes) cdiMensal(primeiroMes).then(setCdi); }, [primeiroMes]);

  const atual = meses[meses.length - 1];
  const anterior = meses.length > 1 ? meses[meses.length - 2] : null;
  // O MÊS DE REFERÊNCIA: o último com duas fotos para comparar (no começo do mês, o atual ainda não tem a sua).
  const ref = movimentos === null ? null : [...meses].reverse().find((m) => m.rendeu !== null) ?? null;
  const doAno = meses.filter((m) => m.competencia.startsWith(anoAtual));
  const ano = movimentos === null ? { rendeu: null, pct: null, aportes: 0, resgates: 0, liquido: 0, meses: 0 } : rendimentoDoPeriodo(doAno);
  const cdiAno = cdi && movimentos !== null ? doAno.filter((m) => m.pct !== null && cdi[m.competencia] !== undefined && m.competencia < hoje)
    .reduce((f, m) => f * (1 + cdi[m.competencia]), 1) - 1 : null;
  const anoFechado = rendimentoDoPeriodo(doAno.filter((m) => m.competencia < hoje));
  const grafico = meses.slice(-12);
  // o % do ano de cada conta: os meses dela encadeados
  const pctAnoConta = (id) => {
    if (movimentos === null) return null;
    const ps = doAno.map((m) => m.porConta[id]?.pct).filter((p) => p !== null && p !== undefined);
    return ps.length ? ps.reduce((f, p) => f * (1 + p), 1) - 1 : null;
  };

  const apagarConta = async (c) => {
    const n = saldos.filter((s) => s.conta_id === c.id).length;
    const ok = await confirmar({ titulo: `Excluir a conta "${c.nome}"?`, texto: `Os ${n} saldo(s) e os aportes e resgates registrados nela também são apagados. Se a conta só foi encerrada, prefira desmarcar "Ativa".`, confirmar: 'Excluir', perigo: true });
    if (!ok) return;
    try { await excluirConta(c.id); toast.success('Conta excluída.'); carregar(); } catch (err) { toast.error(err.message); }
  };
  const apagarSaldo = async (s) => {
    if (!await confirmar({ titulo: 'Excluir este saldo?', texto: `${formatBRL(s.valor_centavos)} em ${formatDate(s.data)}.`, confirmar: 'Excluir', perigo: true })) return;
    try { await excluirSaldo(s.id); toast.success('Saldo excluído.'); carregar(); } catch (err) { toast.error(err.message); }
  };
  const apagarMovimento = async (m) => {
    if (!await confirmar({ titulo: `Excluir este ${m.tipo}?`, texto: `${formatBRL(m.valor_centavos)} em ${formatDate(m.data)}${m.origem === 'extrato' ? ' (veio do extrato: importar o mesmo extrato de novo o traz de volta)' : ''}.`, confirmar: 'Excluir', perigo: true })) return;
    try { await excluirMovimento(m.id); toast.success('Movimento excluído.'); carregar(); } catch (err) { toast.error(err.message); }
  };

  if (!contas) return (<div><CabecalhoPagina titulo="Patrimônio" /><PageLoading /></div>);
  const comMovimentos = movimentos !== null;
  const temAtiva = contas.some((c) => c.ativa);

  return (
    <div>
      <CabecalhoPagina titulo="Patrimônio"
        acoes={<>
          {contas.length > 0 && <button type="button" className="btn-secondary" onClick={() => setModal({ tipo: 'conta' })}>Nova conta</button>}
          <button type="button" className="btn-primary" onClick={() => setModal(temAtiva ? { tipo: 'mes' } : { tipo: 'conta' })}>
            {temAtiva ? 'Registrar o mês' : 'Nova conta'}
          </button>
        </>} />

      {contas.length === 0 ? (
        <div className="mt-6 max-w-2xl">
          <ListaVazia>
            Cadastre as contas que formam o seu patrimônio (conta corrente, investimentos, reserva…). Depois, todo mês, registre o
            saldo de cada uma e os aportes e resgates: o app separa o que você guardou do que rendeu.
          </ListaVazia>
        </div>
      ) : (
        <>
          {!comMovimentos && (
            <p className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-800">
              Falta aplicar a migration 013 (aportes e resgates). Até lá a tela mostra só os saldos: o rendimento precisa deles.
            </p>
          )}
          {/* OS NÚMEROS */}
          <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <div className="card px-4 py-3">
              <div className="text-[11px] font-medium uppercase tracking-wide text-gray-500">Patrimônio</div>
              <div className="mt-1 text-xl font-semibold tabular-nums text-gray-800">{formatBRL(atual?.total ?? 0)}</div>
              {anterior && <div className="mt-0.5 text-xs text-gray-500">{atual.total - anterior.total >= 0 ? '+' : ''}{brlCurto(atual.total - anterior.total)} no mês</div>}
            </div>
            <div className="card px-4 py-3">
              <div className="text-[11px] font-medium uppercase tracking-wide text-gray-500">{ref ? `Rendeu em ${competenciaCurta(ref.competencia)}` : 'Rendeu no mês'}</div>
              <div className={`mt-1 text-xl font-semibold tabular-nums ${ref?.rendeu < 0 ? 'text-hx-c0393d' : 'text-green-700'}`}>{ref ? formatBRL(ref.rendeu) : '—'}</div>
              <div className="mt-0.5 text-xs text-gray-500">{ref ? [pctTexto(ref.pct), doCdi(ref.pct, cdiFechado(cdi, ref.competencia))].filter(Boolean).join(' · ') : comMovimentos ? 'precisa de duas fotos e dos aportes' : 'precisa da migration 013'}</div>
            </div>
            <div className="card px-4 py-3">
              <div className="text-[11px] font-medium uppercase tracking-wide text-gray-500">Rendeu em {anoAtual}</div>
              <div className="mt-1 text-xl font-semibold tabular-nums text-green-700">{ano.rendeu !== null ? formatBRL(ano.rendeu) : '—'}</div>
              <div className="mt-0.5 text-xs text-gray-500">
                {ano.rendeu !== null ? [pctTexto(ano.pct), cdiAno ? doCdi(anoFechado.pct, cdiAno) : null, `${ano.meses} ${ano.meses === 1 ? 'mês' : 'meses'}`].filter(Boolean).join(' · ') : comMovimentos ? 'nenhum mês com duas fotos' : 'precisa da migration 013'}
              </div>
            </div>
            <div className="card px-4 py-3">
              <div className="text-[11px] font-medium uppercase tracking-wide text-gray-500">Aportado em {anoAtual}</div>
              <div className="mt-1 text-xl font-semibold tabular-nums text-gray-800">{comMovimentos ? formatBRL(ano.liquido) : '—'}</div>
              <div className="mt-0.5 text-xs text-gray-500">{comMovimentos ? `${formatBRL(ano.aportes)} aportados · ${formatBRL(ano.resgates)} resgatados` : 'precisa da migration 013'}</div>
            </div>
          </div>

          {/* OS GRÁFICOS */}
          {grafico.length > 0 && (
            <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
              <section className="card p-4">
                <h2 className="mb-1 text-sm font-semibold text-gray-800">{comMovimentos ? 'Quanto é seu e quanto rendeu' : 'Evolução do patrimônio'} <span className="text-[11.5px] font-normal text-gray-400">fim de cada mês</span></h2>
                {/* sem os movimentos (a migration 013) não dá para separar: a coluna inteira é o patrimônio */}
                <ColunasAportado meses={comMovimentos ? grafico : grafico.map((m) => ({ ...m, aportado: m.total, rendimentoAcum: 0 }))} />
                <div className="mt-2 flex flex-wrap gap-4 text-[11.5px] text-gray-600">
                  <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-[2px]" style={{ background: COR_APORTADO }} />Dinheiro aportado</span>
                  <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-[2px]" style={{ background: COR_ENTRADAS }} />Rendimento acumulado</span>
                  <span className="text-gray-400">aportado = a primeira foto de cada conta + os aportes − os resgates depois dela</span>
                </div>
              </section>
              {comMovimentos && <section className="card p-4">
                <h2 className="mb-1 text-sm font-semibold text-gray-800">Rendimento de cada mês <span className="text-[11.5px] font-normal text-gray-400">% e o CDI do mês</span></h2>
                <ColunasRendimento meses={grafico} cdi={cdi} />
                <div className="mt-2 flex flex-wrap gap-4 text-[11.5px] text-gray-600">
                  <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-[2px]" style={{ background: COR_ENTRADAS }} />Rendeu (%)</span>
                  {cdi && <span className="inline-flex items-center gap-1.5"><span className="w-3 border-t-2 border-dashed" style={{ borderColor: COR_CDI }} />CDI (Banco Central)</span>}
                </div>
              </section>}
            </div>
          )}

          {/* POR CONTA */}
          <div className="card mt-4 overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-gray-200 bg-gray-50">
                <tr>
                  <th className="table-th">Conta</th>
                  <th className="table-th text-right">Saldo</th>
                  {comMovimentos && <th className="table-th hidden text-right sm:table-cell">Aportes {ref ? `em ${competenciaCurta(ref.competencia)}` : ''}</th>}
                  <th className="table-th text-right">Rendeu {ref ? `em ${competenciaCurta(ref.competencia)}` : ''}</th>
                  <th className="table-th hidden text-right md:table-cell">Em {anoAtual}</th>
                  <th className="table-th hidden md:table-cell">Atualizado</th>
                  {!movel && <th className="table-th w-[84px]" aria-label="Ações" />}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {contas.map((c) => {
                  const u = ultimos[c.id];
                  const lc = ref?.porConta[c.id];
                  const pa = pctAnoConta(c.id);
                  const historico = [
                    ...saldos.filter((s) => s.conta_id === c.id).map((s) => ({ ...s, tipo: 'saldo' })),
                    ...(movimentos ?? []).filter((m) => m.conta_id === c.id),
                  ].sort((a, b) => b.data.localeCompare(a.data) || (a.tipo === 'saldo' ? -1 : 1));
                  return (
                    <Fragment key={c.id}>
                      <tr className="group/linha cursor-pointer hover:bg-gray-50" onClick={() => setAberta(aberta === c.id ? null : c.id)}>
                        <td className="table-td">
                          <span className={c.ativa ? 'font-medium text-gray-800' : 'text-gray-400'}>{c.nome}</span>
                          {!c.ativa && <span className="ml-2"><Etiqueta>Inativa</Etiqueta></span>}
                          <span className="block text-xs text-gray-500">{[nomeTipo(c.tipo), c.instituicao, c.recebe_extrato && 'aportes pelo extrato'].filter(Boolean).join(' · ')}</span>
                        </td>
                        <td className={`table-td text-right tabular-nums ${u && Number(u.valor_centavos) < 0 ? 'text-hx-c0393d' : ''}`}>{u ? formatBRL(u.valor_centavos) : '—'}</td>
                        {comMovimentos && <td className="table-td hidden text-right tabular-nums text-gray-600 sm:table-cell">{lc?.rendeu !== null && lc ? formatBRL(lc.aportes - lc.resgates) : '—'}</td>}
                        <td className="table-td text-right tabular-nums">
                          {lc?.rendeu !== null && lc ? (
                            <>
                              <span className={lc.rendeu < 0 ? 'text-hx-c0393d' : 'text-green-700'}>{formatBRL(lc.rendeu)}</span>
                              <span className="block text-xs text-gray-500">{pctTexto(lc.pct)}</span>
                            </>
                          ) : '—'}
                        </td>
                        <td className="table-td hidden text-right tabular-nums text-gray-600 md:table-cell">{pctTexto(pa, 1)}</td>
                        <td className="table-td hidden text-gray-500 md:table-cell">{u ? formatDate(u.data) : '—'}</td>
                        {!movel && (
                          <td className="table-td" onClick={(e) => e.stopPropagation()}>
                            <span className="flex justify-end gap-1 md:opacity-0 md:transition-opacity md:group-hover/linha:opacity-100 md:focus-within:opacity-100">
                              <BotaoEditar onClick={() => setModal({ tipo: 'conta', item: c })} />
                              <BotaoExcluir onClick={() => apagarConta(c)} />
                            </span>
                          </td>
                        )}
                      </tr>
                      {aberta === c.id && (
                        <tr>
                          <td colSpan={7} className="bg-gray-50 px-4 py-2">
                            {historico.length === 0 ? <span className="text-sm text-gray-500">Nenhum saldo registrado.</span> : (
                              <ul className="divide-y divide-gray-100">
                                {historico.map((h) => (
                                  <li key={`${h.tipo}${h.id}`} className="flex items-center gap-3 py-1 text-sm">
                                    <span className="w-24 shrink-0 text-gray-500">{formatDate(h.data)}</span>
                                    <span className="w-24 shrink-0">
                                      {h.tipo === 'saldo' ? <Etiqueta>saldo</Etiqueta> : <Etiqueta tom={h.tipo === 'aporte' ? 'verde' : 'ambar'}>{h.tipo}</Etiqueta>}
                                    </span>
                                    <span className="flex-1 tabular-nums text-gray-800">
                                      {h.tipo === 'resgate' ? '− ' : h.tipo === 'aporte' ? '+ ' : ''}{formatBRL(h.valor_centavos)}
                                      {h.tipo !== 'saldo' && <span className="ml-2 text-xs text-gray-400">{h.origem === 'extrato' ? 'do extrato' : 'à mão'}</span>}
                                    </span>
                                    {!movel && <BotaoExcluir titulo={h.tipo === 'saldo' ? 'Excluir este saldo' : `Excluir este ${h.tipo}`} onClick={() => (h.tipo === 'saldo' ? apagarSaldo(h) : apagarMovimento(h))} />}
                                  </li>
                                ))}
                              </ul>
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-gray-500">
            {movel ? 'Toque numa conta para ver o histórico. Registrar e corrigir ficam no computador.'
              : 'Clique numa conta para ver e corrigir o histórico (saldos, aportes e resgates). Rendeu = saldo − saldo anterior − aportes + resgates; o % é sobre o saldo anterior mais metade do aportado no mês.'}
          </p>
        </>
      )}

      {modal?.tipo === 'conta' && <ModalConta conta={modal.item} comMovimentos={comMovimentos} onFechar={() => setModal(null)} onSalvo={() => { setModal(null); carregar(); }} />}
      {modal?.tipo === 'mes' && (
        <ModalRegistrar contas={contas} ultimos={ultimos} movimentos={movimentos} comMovimentos={comMovimentos}
          onFechar={() => setModal(null)} onSalvo={() => { setModal(null); carregar(); }} />
      )}
    </div>
  );
}
