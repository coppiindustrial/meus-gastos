import { useCallback, useEffect, useMemo, useState } from 'react';
import CabecalhoPagina from '../components/CabecalhoPagina.jsx';
import Modal from '../components/Modal.jsx';
import SelectSimples from '../components/SelectSimples.jsx';
import Checkbox from '../components/Checkbox.jsx';
import ListaVazia from '../components/ListaVazia.jsx';
import { PageLoading } from '../components/Spinner.jsx';
import { Bolinha, BotaoEditar, BotaoExcluir, Campo, Etiqueta, RodapeForm, SeletorMes } from '../components/Comuns.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { useConfirmacao } from '../context/ConfirmContext.jsx';
import { listarCategorias } from '../api/cadastros.js';
import {
  criarRecorrenciasDoHistorico, excluirRecorrencia, lancarFixo, listarFixosSemRecorrencia, listarLancamentosDeFixos,
  listarRecorrencias, salvarRecorrencia,
} from '../api/fixos.js';
import { recorrenciasDoHistorico, situacaoDoMes, ultimosPorRecorrencia } from '../lib/fixos.js';
import { formatBRL, parseValor, valorParaCampo } from '../lib/dinheiro.js';
import { competenciaAtual, competenciaCurta, formatDate, nomeCompetencia } from '../lib/format.js';
import { lsGet, lsSet } from '../lib/storage.js';

// GASTOS FIXOS: o cadastro das contas que se repetem todo mês e, para o mês escolhido, a lista do que
// falta lançar — com o valor sugerido (o do último mês) editável e "Lançar" com um clique.
const LS_MES = 'fixos_mes';

function ModalRecorrencia({ rec, categorias, onFechar, onSalvo }) {
  const toast = useToast();
  const [form, setForm] = useState(() => (rec
    ? { ...rec, valor: valorParaCampo(rec.valor_padrao_centavos), categoria_id: rec.categoria_id ?? '', fim: rec.fim ?? '' }
    : { descricao: '', categoria_id: '', valor: '', dia_do_mes: 1, inicio: `${competenciaAtual()}-01`, fim: '', ativa: true }));
  const [erros, setErros] = useState({});
  const [salvando, setSalvando] = useState(false);
  const opcoes = [{ value: '', label: 'Sem categoria' },
    ...categorias.filter((c) => c.grupo.tipo === 'saida' && (c.ativa || c.id === form.categoria_id)).map((c) => ({ value: c.id, label: `${c.nome} · ${c.grupo.nome}` }))];
  const mudar = (campo, valor) => { setForm((f) => ({ ...f, [campo]: valor })); setErros((e) => ({ ...e, [campo]: undefined })); };

  const enviar = async (e) => {
    e.preventDefault();
    const centavos = parseValor(form.valor);
    const dia = Number(form.dia_do_mes);
    const novos = {
      descricao: !form.descricao.trim() && 'Informe a descrição.',
      valor: !(centavos >= 0) && 'Informe o valor (pode ser 0 se varia muito).',
      dia_do_mes: !(Number.isInteger(dia) && dia >= 1 && dia <= 31) && 'Dia entre 1 e 31.',
      inicio: !/^\d{4}-\d{2}-\d{2}$/.test(form.inicio || '') && 'Informe o início.',
      fim: form.fim && form.fim < form.inicio && 'O fim é antes do início.',
    };
    setErros(novos);
    if (Object.values(novos).some(Boolean)) return;
    setSalvando(true);
    try {
      await salvarRecorrencia({ ...form, valor_padrao_centavos: centavos });
      toast.success(rec?.id ? 'Gasto fixo atualizado.' : 'Gasto fixo criado.');
      onSalvo();
    } catch (err) { toast.error(err.message); setSalvando(false); }
  };

  return (
    <Modal open onClose={onFechar} title={rec?.id ? 'Editar gasto fixo' : 'Novo gasto fixo'} maxWidth="max-w-md">
      <form onSubmit={enviar} className="space-y-4">
        <Campo rotulo="Descrição" erro={erros.descricao}>
          <input className="input" autoFocus value={form.descricao} placeholder="Ex.: Luz" onChange={(e) => mudar('descricao', e.target.value)} />
        </Campo>
        <Campo rotulo="Categoria">
          <SelectSimples value={form.categoria_id} onChange={(v) => mudar('categoria_id', v)} opcoes={opcoes} />
        </Campo>
        <div className="grid grid-cols-2 gap-3">
          <Campo rotulo="Valor padrão (R$)" erro={erros.valor}>
            <input className="input" inputMode="decimal" value={form.valor} placeholder="0,00" onChange={(e) => mudar('valor', e.target.value)} />
          </Campo>
          <Campo rotulo="Dia do mês" erro={erros.dia_do_mes}>
            <input className="input" type="number" min="1" max="31" value={form.dia_do_mes} onChange={(e) => mudar('dia_do_mes', e.target.value)} />
          </Campo>
          <Campo rotulo="Começa em" erro={erros.inicio}>
            <input className="input" type="date" value={form.inicio} onChange={(e) => mudar('inicio', e.target.value)} />
          </Campo>
          <Campo rotulo="Termina em (opcional)" erro={erros.fim}>
            <input className="input" type="date" value={form.fim} onChange={(e) => mudar('fim', e.target.value)} />
          </Campo>
        </div>
        <p className="-mt-1 text-xs text-gray-500">O valor sugerido a cada mês é o do mês anterior; o padrão vale para o primeiro.</p>
        <span className="flex items-center gap-2">
          <Checkbox checked={form.ativa} onChange={(e) => mudar('ativa', e.target.checked)} title="Ativo" />
          <button type="button" className="text-sm text-gray-700" onClick={() => mudar('ativa', !form.ativa)}>Ativo (aparece para lançar todo mês)</button>
        </span>
        <RodapeForm onCancelar={onFechar} salvando={salvando} />
      </form>
    </Modal>
  );
}

// Sem nenhum fixo cadastrado: oferece criar a partir do que já foi lançado como "fixo" (a planilha).
function DoHistorico({ sugeridas, categorias, onCriado }) {
  const toast = useToast();
  const [criando, setCriando] = useState(false);
  const nomeCat = (id) => categorias.find((c) => c.id === id)?.nome ?? 'Sem categoria';
  const criar = async () => {
    setCriando(true);
    try { await criarRecorrenciasDoHistorico(sugeridas); toast.success('Gastos fixos criados.'); onCriado(); } catch (err) { toast.error(err.message); setCriando(false); }
  };
  return (
    <div className="card mt-4 max-w-3xl p-5 text-sm text-gray-700">
      <h2 className="text-base font-semibold text-gray-800">Criar a partir do histórico</h2>
      <p className="mt-1">Estes gastos fixos já foram lançados (vieram da planilha). Criando o cadastro, eles passam a ser sugeridos todo mês, e os meses passados ficam ligados a eles.</p>
      <ul className="mt-3 divide-y divide-gray-100 rounded-md border border-gray-200">
        {sugeridas.map((s) => (
          <li key={s.descricao} className="flex items-center gap-3 px-3 py-2">
            <span className="flex-1 font-medium text-gray-800">{s.descricao}</span>
            <span className="hidden text-gray-500 sm:inline">{nomeCat(s.categoria_id)}</span>
            <span className="text-gray-500">{s.meses} {s.meses === 1 ? 'mês' : 'meses'}</span>
            <span className="tabular-nums">{formatBRL(s.valor_padrao_centavos)}</span>
          </li>
        ))}
      </ul>
      <button type="button" className="btn-primary mt-4" onClick={criar} disabled={criando}>{criando ? 'Criando…' : 'Criar estes gastos fixos'}</button>
    </div>
  );
}

export default function Fixos() {
  const toast = useToast();
  const confirmar = useConfirmacao();
  const [comp, setCompEstado] = useState(() => lsGet(LS_MES) || competenciaAtual());
  const setComp = (c) => { setCompEstado(c); lsSet(LS_MES, c); };
  const [recs, setRecs] = useState(null);
  const [lancs, setLancs] = useState([]);
  const [semRec, setSemRec] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [valores, setValores] = useState({}); // valor digitado por recorrência (texto)
  const [lancando, setLancando] = useState(null);
  const [modal, setModal] = useState(null);

  const carregar = useCallback(async () => {
    try {
      const [r, l, s, c] = await Promise.all([listarRecorrencias(), listarLancamentosDeFixos(), listarFixosSemRecorrencia(), listarCategorias()]);
      setRecs(r); setLancs(l); setSemRec(s); setCategorias(c);
    } catch (err) { toast.error(err.message); setRecs([]); }
  }, [toast]);
  useEffect(() => { carregar(); }, [carregar]);

  const situacao = useMemo(() => situacaoDoMes(
    recs ?? [], lancs.filter((l) => l.competencia === comp), ultimosPorRecorrencia(lancs, comp), comp,
  ), [recs, lancs, comp]);
  const pendentes = situacao.filter((s) => !s.lancamento);
  const valorDe = (s) => (valores[s.rec.id] !== undefined ? parseValor(valores[s.rec.id]) : s.sugerido);

  const lancar = async (lista) => {
    const invalidas = lista.filter((s) => !(valorDe(s) > 0));
    if (invalidas.length) { toast.error(`Informe o valor de: ${invalidas.map((s) => s.rec.descricao).join(', ')}.`); return; }
    setLancando(lista.length === 1 ? lista[0].rec.id : 'todos');
    try {
      for (const s of lista) await lancarFixo(s.rec, comp, valorDe(s));
      toast.success(lista.length === 1 ? `${lista[0].rec.descricao} lançado.` : `${lista.length} gastos fixos lançados.`);
      setValores({});
      await carregar();
    } catch (err) {
      toast.error(/duplicate|unique/i.test(err.message) ? 'Este fixo já foi lançado neste mês.' : err.message);
      await carregar();
    } finally { setLancando(null); }
  };

  const apagar = async (r) => {
    const ok = await confirmar({ titulo: `Excluir o gasto fixo "${r.descricao}"?`, texto: 'Os lançamentos que ele já gerou continuam. Se só parou de pagar, prefira desmarcar "Ativo" ou pôr a data de término.', confirmar: 'Excluir', perigo: true });
    if (!ok) return;
    try { await excluirRecorrencia(r.id); toast.success('Gasto fixo excluído.'); carregar(); } catch (err) { toast.error(err.message); }
  };

  if (!recs) return (<div><CabecalhoPagina titulo="Gastos fixos" /><PageLoading /></div>);

  const sugeridas = recs.length === 0 ? recorrenciasDoHistorico(semRec) : [];
  const total = situacao.reduce((s, x) => s + (x.lancamento ? Number(x.lancamento.valor_centavos) : 0), 0);

  return (
    <div>
      <CabecalhoPagina titulo="Gastos fixos"
        acoes={<>
          <span className="hidden sm:block"><SeletorMes comp={comp} onChange={setComp} /></span>
          <button type="button" className="btn-primary" onClick={() => setModal({})}><span className="sm:hidden">Novo</span><span className="hidden sm:inline">Novo gasto fixo</span></button>
        </>} />
      <div className="mt-4 flex justify-center sm:hidden"><SeletorMes comp={comp} onChange={setComp} /></div>

      {sugeridas.length > 0 && <DoHistorico sugeridas={sugeridas} categorias={categorias} onCriado={carregar} />}

      {recs.length > 0 && (
        <section className="card mt-4 max-w-4xl overflow-hidden">
          <header className="flex flex-wrap items-center gap-2 border-b border-gray-200 px-4 py-2.5">
            <h2 className="flex-1 text-sm font-semibold text-gray-800">Fixos de {nomeCompetencia(comp).toLowerCase()}</h2>
            <span className="text-xs text-gray-500">{situacao.length - pendentes.length} de {situacao.length} lançados · {formatBRL(total)}</span>
            {pendentes.length > 1 && (
              <button type="button" className="btn-primary !py-1" onClick={() => lancar(pendentes)} disabled={!!lancando}>
                {lancando === 'todos' ? 'Lançando…' : `Lançar os ${pendentes.length} pendentes`}
              </button>
            )}
          </header>
          {situacao.length === 0 ? <p className="px-4 py-3 text-sm text-gray-500">Nenhum gasto fixo vigente neste mês.</p> : (
            <ul className="divide-y divide-gray-100">
              {situacao.map((s) => (
                <li key={s.rec.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-2.5">
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5 text-sm text-gray-800"><Bolinha cor={s.rec.categoria?.grupo?.cor} />{s.rec.descricao}</span>
                    <span className="block text-xs text-gray-500">
                      dia {s.rec.dia_do_mes}{s.rec.categoria ? ` · ${s.rec.categoria.nome}` : ''}{!s.lancamento && ` · sugerido pelo ${s.base}`}
                    </span>
                  </span>
                  {s.lancamento ? (
                    <>
                      <span className="text-sm tabular-nums text-gray-800">{formatBRL(s.lancamento.valor_centavos)}</span>
                      <Etiqueta tom="verde">Lançado {formatDate(s.lancamento.data).slice(0, 5)}</Etiqueta>
                    </>
                  ) : (
                    <>
                      <input className="input !w-28 !py-1.5 text-right tabular-nums" inputMode="decimal" aria-label={`Valor de ${s.rec.descricao}`}
                        value={valores[s.rec.id] ?? valorParaCampo(s.sugerido)} onChange={(e) => setValores((v) => ({ ...v, [s.rec.id]: e.target.value }))} />
                      <button type="button" className="btn-secondary !py-1.5" onClick={() => lancar([s])} disabled={!!lancando}>
                        {lancando === s.rec.id ? 'Lançando…' : 'Lançar'}
                      </button>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {recs.length > 0 && (
        <section className="mt-6 max-w-4xl">
          <h2 className="mb-2 text-sm font-semibold text-gray-800">Cadastro</h2>
          <div className="card overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-gray-200 bg-gray-50">
                <tr>
                  <th className="table-th">Gasto fixo</th>
                  <th className="table-th hidden sm:table-cell">Categoria</th>
                  <th className="table-th text-right">Padrão</th>
                  <th className="table-th">Dia</th>
                  <th className="table-th hidden md:table-cell">Vigência</th>
                  <th className="table-th w-[84px]" aria-label="Ações" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {recs.map((r) => (
                  <tr key={r.id} className="group/linha hover:bg-gray-50">
                    <td className="table-td">
                      <span className={r.ativa ? 'text-gray-800' : 'text-gray-400'}>{r.descricao}</span>
                      {!r.ativa && <span className="ml-2"><Etiqueta>Inativo</Etiqueta></span>}
                    </td>
                    <td className="table-td hidden sm:table-cell">{r.categoria?.nome ?? '—'}</td>
                    <td className="table-td text-right tabular-nums">{formatBRL(r.valor_padrao_centavos)}</td>
                    <td className="table-td">{r.dia_do_mes}</td>
                    <td className="table-td hidden md:table-cell text-gray-500">
                      desde {competenciaCurta(r.inicio.slice(0, 7))}{r.fim ? ` até ${competenciaCurta(r.fim.slice(0, 7))}` : ''}
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
        </section>
      )}

      {recs.length === 0 && sugeridas.length === 0 && (
        <div className="mt-6 max-w-3xl"><ListaVazia>Nenhum gasto fixo cadastrado. Use “Novo gasto fixo”.</ListaVazia></div>
      )}

      {modal && <ModalRecorrencia rec={modal.item} categorias={categorias} onFechar={() => setModal(null)} onSalvo={() => { setModal(null); carregar(); }} />}
    </div>
  );
}
