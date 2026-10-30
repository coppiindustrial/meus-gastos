import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import CabecalhoPagina from '../components/CabecalhoPagina.jsx';
import Modal from '../components/Modal.jsx';
import SelectSimples from '../components/SelectSimples.jsx';
import Toggle from '../components/Toggle.jsx';
import Tooltip from '../components/Tooltip.jsx';
import MenuContexto from '../components/MenuContexto.jsx';
import ModalCadastroCartoes from '../components/ModalCadastroCartoes.jsx';
import { PageLoading } from '../components/Spinner.jsx';
import { Campo, Etiqueta, RodapeForm } from '../components/Comuns.jsx';
import { IconAbrir, IconLapis, IconMais, IconSeta } from '../components/icons.jsx';
import ImportarFatura from './ImportarFatura.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { contarUsoCartao, criarCartoesSugeridos, listarCartoes, salvarCartao } from '../api/cadastros.js';
import { listarFaturas } from '../api/faturas.js';
import { listarParcelasFuturas } from '../api/resumo.js';
import { CARTOES_SUGERIDOS } from '../lib/sugestoes.js';
import { FORMATOS, resumoDosCartoes, rotuloFormato } from '../lib/cartoes.js';
import { formatBRL } from '../lib/dinheiro.js';
import { competenciaCurta, formatDate, todayISO } from '../lib/format.js';
import { lsSet } from '../lib/storage.js';
import { exportCsv } from '../lib/exportCsv.js';

// CARTÕES (30/10/2026, opção A do mockup "Cartões · overhaul"): UM BLOCO POR CARTÃO com o que se quer saber dele — a
// última fatura (↗ os lançamentos do mês), a próxima (vence em quantos dias; já entrou ou falta importar, com o ↓ que
// abre o importador da fatura), as parcelas que ainda vêm (a view `parcelas_futuras`), a média por fatura e as faturas
// dos últimos 12 meses. Contas puras em `lib/cartoes.js` (testadas). O cabeçalho é o grupo do DRE: ✎ o CADASTRO
// (`ModalCadastroCartoes`, a tabela de formulário) e ▾ Mais ações; "+ Novo cartão" é o formulário de um.

const minuscula = (s) => s.charAt(0).toLowerCase() + s.slice(1);
const ddmm = (iso) => formatDate(iso).slice(0, 5);
const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
const IcoImportar = (p) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}>
    <path d="M12 4v11M7 10l5 5 5-5" /><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
  </svg>
);
const IcoCartao = ({ className }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
    <rect x="2" y="5" width="20" height="14" rx="2.5" /><line x1="2" y1="10" x2="22" y2="10" /><line x1="6" y1="15" x2="10" y2="15" />
  </svg>
);

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
    <Modal open onClose={onFechar} title={cartao?.id ? `Editar ${cartao.nome}` : 'Novo cartão'} maxWidth="max-w-md">
      <form onSubmit={enviar} className="space-y-4">
        <Campo rotulo="Nome" erro={erros.nome}>
          <input className="input" autoFocus value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
        </Campo>
        <Campo rotulo="Dia do vencimento da fatura" erro={erros.dia}>
          <input className="input w-28" inputMode="numeric" value={form.dia_vencimento}
            onChange={(e) => setForm({ ...form, dia_vencimento: e.target.value.replace(/\D/g, '').slice(0, 2) })} />
        </Campo>
        <Campo rotulo="Como a fatura entra">
          <SelectSimples value={form.formato} onChange={(formato) => setForm({ ...form, formato })} opcoes={FORMATOS} />
        </Campo>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-700">
          <Toggle compacto checked={form.ativo} onChange={(ativo) => setForm({ ...form, ativo })} rotulo="Ativo" /> Ativo (aparece na hora de lançar e de importar)
        </label>
        <RodapeForm onCancelar={onFechar} salvando={salvando} />
      </form>
    </Modal>
  );
}

// Um número do bloco: rótulo pequeno em cima, o valor, e a linha de baixo.
const Numero = ({ rotulo, valor, sub }) => (
  <div className="min-w-0">
    <div className="text-[10.5px] font-semibold uppercase tracking-wide text-gray-500">{rotulo}</div>
    <div className="mt-0.5 truncate text-[16px] font-semibold tabular-nums text-gray-900">{valor}</div>
    <div className="mt-0.5 truncate text-[11.5px] text-gray-500">{sub}</div>
  </div>
);

function BlocoCartao({ cartao: c, r, uso, onEditar, onImportar, onVer }) {
  const maior = Math.max(1, ...r.serie.map((s) => s.total));
  const icone = 'inline-flex h-7 w-7 items-center justify-center rounded-[6px] border border-gray-200 text-gray-600 transition-colors hover:bg-gray-50';
  return (
    <div className={`card flex flex-col gap-4 p-4 ${c.ativo ? '' : 'opacity-60'}`}>
      <div className="flex items-start gap-3">
        <span className="mt-0.5 grid h-8 w-10 shrink-0 place-items-center rounded-[7px] bg-gray-100 text-gray-600"><IcoCartao className="h-5 w-5" /></span>
        <button type="button" onClick={onEditar} className="min-w-0 flex-1 text-left" title="Editar o cartão">
          <span className="flex items-center gap-2">
            <span className="truncate text-[15px] font-semibold text-gray-900">{c.nome}</span>
            {!c.ativo && <Etiqueta>Inativo</Etiqueta>}
          </span>
          <span className="block truncate text-[11.5px] text-gray-500">vence dia {c.dia_vencimento} · {minuscula(rotuloFormato(c.formato))}</span>
        </button>
        <span className="flex shrink-0 gap-1">
          {r.proxima && c.formato !== 'manual' && (
            <Tooltip label={r.proxima.importada ? `A fatura de ${ddmm(r.proxima.vencimento)} já entrou — importar de novo` : `Importar a fatura de ${ddmm(r.proxima.vencimento)}`}>
              <button type="button" aria-label="Importar a fatura" onClick={onImportar} className={icone}><IcoImportar className="h-3.5 w-3.5" /></button>
            </Tooltip>
          )}
          {r.ultima && (
            <Tooltip label={`Ver os lançamentos de ${competenciaCurta(r.ultima.competencia)}`}>
              <button type="button" aria-label="Ver os lançamentos" onClick={onVer} className={icone}><IconAbrir className="h-3.5 w-3.5" /></button>
            </Tooltip>
          )}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-3">
        <Numero rotulo="Última fatura" valor={r.ultima ? formatBRL(r.ultima.total) : '—'}
          sub={r.ultima ? `${competenciaCurta(r.ultima.competencia)} · ${plural(r.ultima.qtd, 'compra', 'compras')}` : 'nenhuma ainda'} />
        {r.proxima ? (
          <Numero rotulo="Próxima" valor={ddmm(r.proxima.vencimento)}
            sub={<>{r.proxima.dias === 0 ? 'vence hoje' : `vence em ${plural(r.proxima.dias, 'dia', 'dias')}`} · {r.proxima.importada
              ? <span className="font-medium text-green-700">já entrou</span>
              : <span className="font-medium text-hx-92400e">{c.formato === 'manual' ? 'lançada à mão' : 'a importar'}</span>}</>} />
        ) : <Numero rotulo="Próxima" valor="—" sub="desativado" />}
        <Numero rotulo="Parcelas que vêm" valor={r.parcelas ? formatBRL(r.parcelas.total) : '—'}
          sub={r.parcelas ? `até ${competenciaCurta(r.parcelas.ate)} · ${plural(r.parcelas.compras, 'compra', 'compras')}` : 'nenhuma'} />
        {c.ativo
          ? <Numero rotulo="Média por fatura" valor={r.media != null ? formatBRL(r.media) : '—'} sub="nos últimos 12 meses" />
          : <Numero rotulo="Lançamentos" valor={uso ?? '…'} sub="no histórico" />}
      </div>

      {c.ativo && (
        <div className="flex h-12 items-end gap-[3px]" aria-label="Faturas dos últimos 12 meses">
          {r.serie.map((s) => (
            <span key={s.comp} title={`${competenciaCurta(s.comp)} · ${s.total ? formatBRL(s.total) : 'sem fatura'}`}
              className={`flex-1 rounded-t-[2px] ${s.comp === r.ultima?.competencia ? '' : s.total ? 'bg-gray-300' : 'bg-gray-100'}`}
              style={{ height: `${Math.max(4, (s.total / maior) * 100)}%`, ...(s.comp === r.ultima?.competencia ? { background: 'var(--serie-gastos)' } : {}) }} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function Cartoes() {
  const toast = useToast();
  const navigate = useNavigate();
  const [dados, setDados] = useState(null); // { cartoes, faturas, parcelas }
  const [uso, setUso] = useState({}); // { cartaoId: lançamentos } (dos inativos, e de todos ao abrir o cadastro)
  const [modal, setModal] = useState(null); // { item } ou {} para novo
  const [cadastro, setCadastro] = useState(false);
  const [importar, setImportar] = useState(null); // { cartaoId, vencimento }
  const [criando, setCriando] = useState(false);
  const [mais, setMais] = useState(null);
  const maisAbertoNoClique = useRef(false);
  const hoje = todayISO();

  const carregar = useCallback(async () => {
    try {
      const [cartoes, faturas, parcelas] = await Promise.all([listarCartoes(), listarFaturas(), listarParcelasFuturas()]);
      setDados({ cartoes, faturas, parcelas });
      const inativos = cartoes.filter((c) => !c.ativo);
      Promise.all(inativos.map((c) => contarUsoCartao(c.id).then((n) => [c.id, n]))).then((ps) => setUso((u) => ({ ...u, ...Object.fromEntries(ps) }))).catch(() => {});
    } catch (err) { toast.error(err.message); setDados({ cartoes: [], faturas: [], parcelas: [] }); }
  }, [toast]);
  useEffect(() => { carregar(); }, [carregar]);

  const cartoes = dados?.cartoes ?? null;
  const resumo = useMemo(() => (dados ? resumoDosCartoes({ ...dados, hoje }) : {}), [dados, hoje]);
  const ordenados = useMemo(() => (cartoes ? [...cartoes].sort((a, b) => Number(b.ativo) - Number(a.ativo) || a.nome.localeCompare(b.nome, 'pt-BR')) : []), [cartoes]);

  const abrirCadastro = async () => {
    const ps = await Promise.all((cartoes ?? []).map((c) => contarUsoCartao(c.id).then((n) => [c.id, n]).catch(() => [c.id, 0])));
    setUso(Object.fromEntries(ps));
    setCadastro(true);
  };
  const criarSugeridos = async () => {
    setCriando(true);
    try { await criarCartoesSugeridos(); toast.success('Cartões criados.'); carregar(); } catch (err) { toast.error(err.message); }
    setCriando(false);
  };
  const verLancamentos = (comp) => { lsSet('lancamentos_mes', comp); navigate('/lancamentos'); };

  const exportar = () => exportCsv('cartoes', ordenados, [
    { key: 'nome', label: 'Cartão' },
    { key: 'dia_vencimento', label: 'Vence dia' },
    { key: 'formato', label: 'Como a fatura entra', map: (c) => rotuloFormato(c.formato) },
    { key: 'ativo', label: 'Ativo', map: (c) => (c.ativo ? 'sim' : 'não') },
    { key: 'ultima', label: 'Última fatura', tipo: 'dinheiro', map: (c) => (resumo[c.id]?.ultima ? resumo[c.id].ultima.total / 100 : null) },
    { key: 'parcelas', label: 'Parcelas que vêm', tipo: 'dinheiro', map: (c) => (resumo[c.id]?.parcelas ? resumo[c.id].parcelas.total / 100 : null) },
  ]);
  const abrirMais = (el) => {
    const r = el.getBoundingClientRect();
    setMais({ x: r.right - 250, y: r.bottom + 4, titulo: 'Mais ações', itens: [
      { rotulo: 'Exportar cartões (CSV)', sub: 'cadastro, última fatura e parcelas', desabilitado: !ordenados.length, onEscolher: exportar },
      { rotulo: 'Importar faturas…', sub: 'a tela Importar', onEscolher: () => navigate('/importar') },
    ] });
  };
  const ICONE = 'flex h-9 items-center justify-center text-gray-600 transition-colors hover:bg-gray-50 active:bg-gray-200';
  const nAtivos = (cartoes ?? []).filter((c) => c.ativo).length;

  return (
    <div>
      <CabecalhoPagina titulo="Cartões"
        acessorio={cartoes?.length > 0 && <span className="hidden text-sm text-gray-500 sm:inline">{plural(nAtivos, 'ativo', 'ativos')}{cartoes.length > nAtivos ? ` · ${cartoes.length - nAtivos} inativo${cartoes.length - nAtivos > 1 ? 's' : ''}` : ''}</span>}
        acoes={cartoes?.length > 0 && <>
          {/* O GRUPO DO DRE (o mesmo dos Fixos e das Categorias): ✎ o cadastro em pop-up e ▾ "Mais ações". */}
          <div className="hidden overflow-hidden rounded-md border border-gray-300 bg-white md:inline-flex">
            <Tooltip label="Cadastro dos cartões">
              <button type="button" aria-label="Cadastro dos cartões" onClick={abrirCadastro} className={`${ICONE} w-[38px]`}><IconLapis className="h-3.5 w-3.5" /></button>
            </Tooltip>
            <Tooltip label="Mais ações">
              <button type="button" aria-label="Mais ações" aria-haspopup="menu" aria-expanded={!!mais}
                onMouseDown={() => { maisAbertoNoClique.current = !!mais; }}
                onClick={(e) => { if (maisAbertoNoClique.current || mais) { maisAbertoNoClique.current = false; setMais(null); } else abrirMais(e.currentTarget); }}
                className={`${ICONE} w-[28px] border-l border-gray-200 ${mais ? 'bg-gray-100' : ''}`}>
                <IconSeta className={`transition-transform duration-200 ease-out ${mais ? 'rotate-180' : ''}`} />
              </button>
            </Tooltip>
          </div>
          <button type="button" className="btn-primary" onClick={() => setModal({})}><IconMais className="h-[11px] w-[11px]" />Novo cartão</button>
        </>} />

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
        <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {ordenados.map((c) => (
            <BlocoCartao key={c.id} cartao={c} r={resumo[c.id]} uso={uso[c.id]}
              onEditar={() => setModal({ item: c })}
              onImportar={() => setImportar({ cartaoId: c.id, vencimento: resumo[c.id].proxima.vencimento })}
              onVer={() => verLancamentos(resumo[c.id].ultima.competencia)} />
          ))}
        </div>
      )}

      {modal && <ModalCartao cartao={modal.item} onFechar={() => setModal(null)} onSalvo={() => { setModal(null); carregar(); }} />}
      {cadastro && <ModalCadastroCartoes cartoes={ordenados} uso={uso} onFechar={() => setCadastro(false)} onSalvo={() => { setCadastro(false); carregar(); }} />}
      {importar && <ImportarFatura cartoes={cartoes} inicial={importar} onFechar={() => setImportar(null)} onImportada={() => { setImportar(null); carregar(); }} />}
      <MenuContexto menu={mais} onFechar={() => setMais(null)} />
    </div>
  );
}
