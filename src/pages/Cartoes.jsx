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
import BalaoGrafico, { useBalao } from '../components/graficos/BalaoGrafico.jsx';
import AmpliadoCartao, { LegendaClicavel, marcaLegenda, useDestaque } from '../components/AmpliadoCartao.jsx';
import ImportarFatura from './ImportarFatura.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { contarUsoCartao, criarCartoesSugeridos, listarCartoes, salvarCartao } from '../api/cadastros.js';
import { listarFaturas } from '../api/faturas.js';
import { listarParcelasFuturas } from '../api/resumo.js';
import { CARTOES_SUGERIDOS } from '../lib/sugestoes.js';
import { ENSINAR_FORMATO, formatoDoValor, opcoesFormato, resumoDosCartoes, rotuloFormato, valorDoFormato } from '../lib/cartoes.js';
import AssistenteModelo from '../components/AssistenteModelo.jsx';
import { listarModelos } from '../api/modelos.js';
import { formatBRL, numeroK } from '../lib/dinheiro.js';
import { competenciaCurta, formatDate, nomeCompetencia, todayISO } from '../lib/format.js';
import { useNoCelular } from '../lib/celular.js';
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

// `modelos`: os modelos de importação do usuário (migration 011) — entram no "Como a fatura entra", com o "Ensinar
// um formato novo" (a ação no pé da lista) que abre o `AssistenteModelo`; o modelo salvo já fica escolhido (e na lista, até a tela recarregar).
function ModalCartao({ cartao, modelos, onFechar, onSalvo }) {
  const toast = useToast();
  const [form, setForm] = useState(() => cartao ?? { nome: '', dia_vencimento: 10, formato: 'manual', ativo: true });
  const [erros, setErros] = useState({});
  const [salvando, setSalvando] = useState(false);
  const [ensinando, setEnsinando] = useState(false);
  const [novos, setNovos] = useState([]);
  const todos = [...(modelos ?? []), ...novos];
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
          <SelectSimples value={valorDoFormato(form)} onChange={(v) => setForm({ ...form, ...formatoDoValor(v) })}
            opcoes={opcoesFormato(todos)} acao={{ rotulo: () => ENSINAR_FORMATO, onClick: () => setEnsinando(true) }} />
        </Campo>
        {ensinando && (
          <AssistenteModelo cartao={form} onFechar={() => setEnsinando(false)}
            onSalvo={(m) => { setNovos((ns) => [...ns, m]); setForm((f) => ({ ...f, formato: 'modelo', modelo_id: m.id })); setEnsinando(false); }} />
        )}
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

const IcoAmpliar = (p) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true" {...p}>
    <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
  </svg>
);

function BlocoCartao({ cartao: c, r, uso, modelo, onEditar, onImportar, onVer, onVerMes, onHistorico }) {
  // O GRÁFICO É A OPÇÃO D (03/11/2026): cada coluna com o número curto ("13,4k") e o mês embaixo; depois da linha
  // tracejada, as parcelas já compradas que vêm, hachuradas (`r.grafico`, de `lib/cartoes.js`).
  const maior = Math.max(1, ...r.grafico.map((s) => s.total));
  // ESTREITO (três blocos por linha): o número cheio não cabe na coluna — ficam só os MARCOS (a última fatura, a maior
  // e a primeira parcela que vem) e o mês vira a inicial. A largura é medida (o bloco muda com a janela).
  const graficoRef = useRef(null);
  const [colLarg, setColLarg] = useState(30);
  useEffect(() => {
    const el = graficoRef.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(() => setColLarg(el.clientWidth / Math.max(1, r.grafico.length)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [r.grafico.length]);
  const estreito = colLarg < 27; // a coluna (menos o vão de 3px) precisa dos ~24px de "14,8k"
  const marcos = useMemo(() => {
    const fats = r.grafico.filter((s) => s.tipo === 'fatura' && s.total);
    const maiorFat = fats.reduce((m, s) => (!m || s.total > m.total ? s : m), null);
    return new Set([r.ultima?.competencia, maiorFat?.comp, r.grafico.find((s) => s.tipo === 'parcelas' && s.total)?.comp].filter(Boolean));
  }, [r.grafico, r.ultima]);
  // O HOVER DAS COLUNAS (30/10/2026, a pedido): a do mês fica cheia e as outras recuam (o `esmaecido` dos gráficos),
  // e o balão diz o mês, o total, as compras e a diferença para a média; clicar abre os lançamentos do mês.
  const balao = useBalao(230, 120);
  const ativo = balao.ativo !== null ? r.grafico[balao.ativo] : null;
  // A LEGENDA CLICÁVEL (03/11/2026): a marca acende o seu tipo de coluna (hover) e o fixa (clique).
  const destaque = useDestaque();
  const apagada = (s) => destaque.atual && !({
    faturas: s.tipo === 'fatura' && s.total > 0, ultima: s.tipo === 'fatura' && s.comp === r.ultima?.competencia, parcelas: s.tipo === 'parcelas',
  }[destaque.atual]);
  const movel = useNoCelular();
  const icone = `inline-flex items-center justify-center rounded-[6px] border border-gray-200 text-gray-600 transition-colors hover:bg-gray-50 ${movel ? 'h-[36px] w-[36px]' : 'h-7 w-7'}`;
  return (
    <div className={`card flex flex-col gap-4 p-4 transition-[border-color,box-shadow] duration-150 hover:border-gray-300 hover:shadow-md ${c.ativo ? '' : 'opacity-60'}`}>
      <div className="flex items-start gap-3">
        <span className="mt-0.5 grid h-8 w-10 shrink-0 place-items-center rounded-[7px] bg-gray-100 text-gray-600"><IcoCartao className="h-5 w-5" /></span>
        {/* NO CELULAR (só para ver) o nome não abre o formulário, e o ↓ de importar sai. */}
        <button type="button" onClick={movel ? undefined : onEditar} className={`min-w-0 flex-1 text-left ${movel ? 'cursor-default' : ''}`} title={movel ? undefined : 'Editar o cartão'}>
          <span className="flex items-center gap-2">
            <span className="truncate text-[15px] font-semibold text-gray-900">{c.nome}</span>
            {!c.ativo && <Etiqueta>Inativo</Etiqueta>}
          </span>
          <span className="block truncate text-[11.5px] text-gray-500">vence dia {c.dia_vencimento} · {minuscula(rotuloFormato(c.formato, modelo))}</span>
        </button>
        <span className="flex shrink-0 gap-1">
          {r.proxima && c.formato !== 'manual' && !movel && (
            <Tooltip label={r.proxima.importada ? `A fatura de ${ddmm(r.proxima.vencimento)} já entrou — importar de novo` : `Importar a fatura de ${ddmm(r.proxima.vencimento)}`}>
              <button type="button" aria-label="Importar a fatura" onClick={onImportar} className={icone}><IcoImportar className="h-3.5 w-3.5" /></button>
            </Tooltip>
          )}
          {r.ultima && (
            <Tooltip label={`Ver os lançamentos de ${competenciaCurta(r.ultima.competencia)}`}>
              <button type="button" aria-label="Ver os lançamentos" onClick={onVer} className={icone}><IconAbrir className="h-3.5 w-3.5" /></button>
            </Tooltip>
          )}
          {r.faturas > 0 && (
            // por último, como o ⤢ dos blocos da Visão geral; só no computador: o painel é largo (no celular, como a
            // grade dos Lançamentos, não há)
            <span className="hidden md:inline-flex">
              <Tooltip label="O histórico do cartão (linha do tempo, ano × ano, por categoria)">
                <button type="button" aria-label="Ver o histórico do cartão" onClick={onHistorico} className={icone}><IcoAmpliar className="h-3.5 w-3.5" /></button>
              </Tooltip>
            </span>
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
        <div>
          <div ref={graficoRef} className="flex h-[84px] items-end gap-[3px] border-b border-gray-200" aria-label="Faturas e parcelas que vêm" onMouseLeave={balao.aoSair}>
            {r.grafico.map((s, i) => {
              const ultima = s.tipo === 'fatura' && s.comp === r.ultima?.competencia;
              const futura = s.tipo === 'parcelas';
              const hoje = futura && r.grafico[i - 1]?.tipo === 'fatura';
              const sob = balao.ativo === i;
              return (
                // A área de cada mês é a coluna INTEIRA (não só a barra): a de um mês baixo também se aponta.
                <button key={s.comp} type="button" aria-label={`${nomeCompetencia(s.comp)}: ${s.total ? formatBRL(s.total) : futura ? 'sem parcelas' : 'sem fatura'}${futura ? ' em parcelas já compradas' : ''}`}
                  onMouseMove={balao.aoMover(i)} onClick={() => !futura && s.total && onVerMes(s.comp)}
                  className={`flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-[3px] ${hoje ? 'ml-[3px] border-l border-dashed border-gray-300 pl-[3px]' : ''} ${!futura && s.total ? 'cursor-pointer' : 'cursor-default'} ${balao.esmaecido(i) ? 'opacity-40' : apagada(s) ? 'opacity-25' : ''} transition-opacity duration-150`}>
                  <span className={`whitespace-nowrap text-[10px] leading-none tabular-nums ${ultima ? 'font-semibold text-gray-800' : futura ? '' : 'text-gray-500'}`}
                    style={futura ? { color: 'var(--serie-gastos)' } : undefined}>
                    {s.total && (!estreito || marcos.has(s.comp)) ? numeroK(s.total) : ''}
                  </span>
                  <span className={`block w-full rounded-t-[2px] transition-colors duration-150 ${futura ? 'barra-parcelas' : ultima ? '' : sob ? 'bg-gray-500' : s.total ? 'bg-gray-300' : 'bg-gray-100'}`}
                    style={{ height: `${Math.max(s.total ? 3 : 2, Math.round((s.total / maior) * 62))}px`, ...(ultima ? { background: 'var(--serie-gastos)' } : {}) }} />
                </button>
              );
            })}
          </div>
          <div className="mt-1 flex gap-[3px] text-[10px] text-gray-400">
            {r.grafico.map((s, i) => (
              <span key={s.comp} className={`min-w-0 flex-1 text-center ${s.tipo === 'parcelas' && r.grafico[i - 1]?.tipo === 'fatura' ? 'ml-[3px] pl-[4px]' : ''} ${s.comp === r.ultima?.competencia ? 'font-semibold text-gray-700' : ''}`}>
                {estreito ? competenciaCurta(s.comp).slice(0, 1).toUpperCase() : competenciaCurta(s.comp).slice(0, 3)}
              </span>
            ))}
          </div>
          {r.grafico.some((s) => s.tipo === 'parcelas') && (
            <LegendaClicavel destaque={destaque} className="-ml-1.5 mt-1.5 !text-[10.5px]" itens={[
              { key: 'faturas', rotulo: 'faturas', marca: marcaLegenda('faturas') },
              { key: 'ultima', rotulo: 'última', marca: marcaLegenda('ultima') },
              { key: 'parcelas', rotulo: 'parcelas já compradas que vêm', marca: marcaLegenda('parcelas') },
            ]} />
          )}
        </div>
      )}
      {ativo && ativo.tipo === 'parcelas' && (
        <BalaoGrafico pos={balao.pos} largura={230} titulo={`Parcelas de ${nomeCompetencia(ativo.comp).toLowerCase()}`}
          itens={ativo.total ? [
            { rotulo: 'Já comprado', valor: formatBRL(ativo.total), cor: 'var(--serie-gastos)' },
            { rotulo: 'Compras', valor: String(ativo.qtd) },
          ] : [{ rotulo: 'Sem parcelas', valor: '—' }]}
          nota="Parcelas de compras que já estão nas faturas; a fatura do mês ainda terá as compras novas." />
      )}
      {ativo && ativo.tipo === 'fatura' && (
        <BalaoGrafico pos={balao.pos} largura={230} titulo={`Fatura de ${nomeCompetencia(ativo.comp).toLowerCase()}`}
          itens={ativo.total ? [
            { rotulo: 'Total', valor: formatBRL(ativo.total), cor: ativo.comp === r.ultima?.competencia ? 'var(--serie-gastos)' : undefined },
            { rotulo: 'Compras', valor: String(ativo.qtd) },
            ...(r.media ? [{ rotulo: 'Contra a média', valor: `${ativo.total >= r.media ? '+' : '−'} ${formatBRL(Math.abs(ativo.total - r.media))}` }] : []),
          ] : [{ rotulo: 'Sem fatura', valor: '—' }]}
          nota={ativo.total ? `Vence ${formatDate(ativo.vencimento)} · clique para ver os lançamentos` : undefined} />
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
  const [historico, setHistorico] = useState(null); // o cartão do `AmpliadoCartao` aberto
  const [criando, setCriando] = useState(false);
  const [mais, setMais] = useState(null);
  const maisAbertoNoClique = useRef(false);
  const hoje = todayISO();

  const carregar = useCallback(async () => {
    try {
      const [cartoes, faturas, parcelas, modelos] = await Promise.all([listarCartoes(), listarFaturas(), listarParcelasFuturas(), listarModelos().catch(() => null)]);
      setDados({ cartoes, faturas, parcelas, modelos: modelos ?? [] });
      const inativos = cartoes.filter((c) => !c.ativo);
      Promise.all(inativos.map((c) => contarUsoCartao(c.id).then((n) => [c.id, n]))).then((ps) => setUso((u) => ({ ...u, ...Object.fromEntries(ps) }))).catch(() => {});
    } catch (err) { toast.error(err.message); setDados({ cartoes: [], faturas: [], parcelas: [], modelos: [] }); }
  }, [toast]);
  useEffect(() => { carregar(); }, [carregar]);

  const cartoes = dados?.cartoes ?? null;
  const resumo = useMemo(() => (dados ? resumoDosCartoes({ ...dados, hoje }) : {}), [dados, hoje]);
  const modeloDe = (c) => (c.formato === 'modelo' ? dados?.modelos.find((m) => m.id === c.modelo_id) ?? null : null);
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
    { key: 'formato', label: 'Como a fatura entra', map: (c) => rotuloFormato(c.formato, modeloDe(c)) },
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
            <BlocoCartao key={c.id} cartao={c} r={resumo[c.id]} uso={uso[c.id]} modelo={modeloDe(c)}
              onEditar={() => setModal({ item: c })}
              onImportar={() => setImportar({ cartaoId: c.id, vencimento: resumo[c.id].proxima.vencimento })}
              onVer={() => verLancamentos(resumo[c.id].ultima.competencia)} onVerMes={verLancamentos} onHistorico={() => setHistorico(c.id)} />
          ))}
        </div>
      )}

      {historico && dados && (
        <AmpliadoCartao cartoes={dados.cartoes} cartaoId={historico} faturas={dados.faturas} parcelas={dados.parcelas} hoje={hoje}
          onClose={() => setHistorico(null)} onVerMes={verLancamentos} />
      )}
      {modal && <ModalCartao cartao={modal.item} modelos={dados?.modelos} onFechar={() => setModal(null)} onSalvo={() => { setModal(null); carregar(); }} />}
      {cadastro && <ModalCadastroCartoes cartoes={ordenados} modelos={dados?.modelos} uso={uso} onFechar={() => setCadastro(false)} onSalvo={() => { setCadastro(false); carregar(); }} />}
      {importar && <ImportarFatura cartoes={cartoes} inicial={importar} onFechar={() => setImportar(null)} onImportada={() => { setImportar(null); carregar(); }} />}
      <MenuContexto menu={mais} onFechar={() => setMais(null)} />
    </div>
  );
}
