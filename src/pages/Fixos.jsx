import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import CabecalhoPagina from '../components/CabecalhoPagina.jsx';
import Modal from '../components/Modal.jsx';
import { CampoMes } from '../components/CampoData.jsx';
import SeletorCategoria from '../components/SeletorCategoria.jsx';
import Checkbox from '../components/Checkbox.jsx';
import ListaVazia from '../components/ListaVazia.jsx';
import { PageLoading } from '../components/Spinner.jsx';
import { Campo, RodapeForm } from '../components/Comuns.jsx';
import { DivisorFaixa, FaixaProvider, LimparFiltros, Trilho } from '../components/filtros/FaixaFiltros.jsx';
import { BuscaFaixa, SegMulti, SegUnico } from '../components/filtros/Segmentos.jsx';
import MatrizFixos from '../components/planilha/MatrizFixos.jsx';
import ModalCadastroFixos from '../components/ModalCadastroFixos.jsx';
import { MenuFixos } from '../components/dashboard/AvisoAgora.jsx';
import AbasPilula from '../components/AbasPilula.jsx';
import MenuContexto from '../components/MenuContexto.jsx';
import Tooltip from '../components/Tooltip.jsx';
import { IconLapis, IconSeta } from '../components/icons.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { listarCategorias } from '../api/cadastros.js';
import {
  criarRecorrenciasDoHistorico, listarFixosSemRecorrencia, listarLancamentosDeFixos, listarPulados, listarRecorrencias, salvarRecorrencia,
} from '../api/fixos.js';
import { matrizDoAno, pendentesPorMes, recorrenciasDoHistorico, ultimoLancado } from '../lib/fixos.js';
import { formatBRL, parseValor, valorParaCampo } from '../lib/dinheiro.js';
import { competenciaAtual, competenciaCurta } from '../lib/format.js';
import { exportCsv } from '../lib/exportCsv.js';
import { lsGet, lsSet } from '../lib/storage.js';

// GASTOS FIXOS como uma aba da planilha (a opção B do mockup): uma linha por gasto fixo e uma coluna por
// mês do ano (`MatrizFixos`). A célula a lançar vem com o valor sugerido (o do último mês lançado);
// digitar e dar Enter lança. O que falta lançar aparece duas vezes: no "Lançar N ▾" do cabeçalho (o menu
// por mês) e na linha "A lançar" da grade. As ações são as da grade (`ref`), com o mesmo desfazer.
//
// O CABEÇALHO É O DO DRE do Gestor (a opção A do mockup dos botões, 28/10/2026): os ícones de mexer na
// tela numa caixa só — ✎ o CADASTRO (todos os fixos num pop-up, `ModalCadastroFixos`) e ▾ "Mais ações"
// (exportar; criar é no cadastro) — e o gesto do dia a dia como o botão de destaque, "Lançar N ▾". O modal
// de UM fixo continua (clique no nome, botão direito ou Shift+F2).
const LS_ANO = 'fixos_ano';
const SEM_CATEGORIA = [{ value: '', label: 'Sem categoria' }];

function ModalRecorrencia({ rec, categorias, onFechar, onSalvo }) {
  const toast = useToast();
  const [form, setForm] = useState(() => (rec
    ? { ...rec, valor: valorParaCampo(rec.valor_padrao_centavos), categoria_id: rec.categoria_id ?? '', fim: rec.fim ?? '' }
    : { descricao: '', categoria_id: '', valor: '', dia_do_mes: 1, inicio: `${competenciaAtual()}-01`, fim: '', ativa: true }));
  const [erros, setErros] = useState({});
  const [salvando, setSalvando] = useState(false);
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
          <SeletorCategoria value={form.categoria_id} onChange={(v) => mudar('categoria_id', v)} categorias={categorias} tipo="saida"
            extras={SEM_CATEGORIA} placeholder="Sem categoria" />
        </Campo>
        <div className="grid grid-cols-2 gap-3">
          <Campo rotulo="Valor padrão (R$)" erro={erros.valor}>
            <input className="input" inputMode="decimal" value={form.valor} placeholder="0,00" onChange={(e) => mudar('valor', e.target.value)} />
          </Campo>
          <Campo rotulo="Dia do mês" erro={erros.dia_do_mes}>
            <input className="input" type="number" min="1" max="31" value={form.dia_do_mes} onChange={(e) => mudar('dia_do_mes', e.target.value)} />
          </Campo>
          <Campo rotulo="Começa em" erro={erros.inicio}>
            <CampoMes value={(form.inicio || '').slice(0, 7)} max={form.fim ? form.fim.slice(0, 7) : undefined} onChange={(v) => mudar('inicio', `${v}-01`)} />
          </Campo>
          <Campo rotulo="Termina em (opcional)" erro={erros.fim}>
            <CampoMes value={(form.fim || '').slice(0, 7)} min={(form.inicio || '').slice(0, 7) || undefined} vazio="sem fim" limpavel rotuloLimpar="Sem fim"
              onChange={(v) => mudar('fim', v ? `${v}-01` : '')} />
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

const OPCOES_SITUACAO = [{ value: 'ativos', label: 'Só os ativos', chip: 'Ativos' }, { value: '', label: 'Todos' }, { value: 'inativos', label: 'Só os inativos', chip: 'Inativos' }];
const semAcento = (s) => String(s || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

export default function Fixos() {
  const toast = useToast();
  const hoje = competenciaAtual();
  const anoAtual = Number(hoje.slice(0, 4));
  const [ano, setAnoEstado] = useState(() => Number(lsGet(LS_ANO)) || anoAtual);
  const setAno = (a) => { setAnoEstado(a); lsSet(LS_ANO, String(a)); };
  const [recs, setRecs] = useState(null);
  const [lancs, setLancs] = useState([]);
  const [pulados, setPulados] = useState([]); // os "não teve" (null: falta aplicar a migration 006)
  const [semRec, setSemRec] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [busca, setBusca] = useState('');
  const [cats, setCats] = useState([]);
  const [situacao, setSituacao] = useState('ativos');
  const [modo, setModo] = useState('valor');
  const [modal, setModal] = useState(null);
  const [cadastro, setCadastro] = useState(false);
  const [mais, setMais] = useState(null); // o menu "Mais ações" (posição)

  const carregar = useCallback(async () => {
    try {
      const [r, l, s, c, p] = await Promise.all([listarRecorrencias(), listarLancamentosDeFixos(), listarFixosSemRecorrencia(), listarCategorias(), listarPulados()]);
      setRecs(r); setLancs(l); setSemRec(s); setCategorias(c); setPulados(p);
    } catch (err) { toast.error(err.message); setRecs([]); }
  }, [toast]);
  useEffect(() => { carregar(); }, [carregar]);

  const filtrados = useMemo(() => {
    const t = semAcento(busca).trim();
    return (recs ?? []).filter((r) => (!situacao || (situacao === 'ativos' ? r.ativa : !r.ativa))
      && (!cats.length || cats.includes(r.categoria_id ?? 'sem'))
      && (!t || semAcento(`${r.descricao} ${r.categoria?.nome ?? ''}`).includes(t)));
  }, [recs, busca, situacao, cats]);
  const matriz = useMemo(() => matrizDoAno(filtrados, lancs, ano, hoje, pulados ?? []), [filtrados, lancs, ano, hoje, pulados]);
  const ultimos = useMemo(() => ultimoLancado(lancs), [lancs]);
  const setPuladosLista = useCallback((fn) => setPulados((ps) => fn(ps ?? [])), []);
  const matrizRef = useRef(null);
  const pendMes = useMemo(() => pendentesPorMes(matriz), [matriz]);
  const mesesPend = Object.keys(pendMes).sort().reverse();
  const pendAno = mesesPend.flatMap((c) => pendMes[c]);

  const opcoesAno = useMemo(() => {
    const s = new Set(lancs.map((l) => Number(l.competencia.slice(0, 4))));
    [anoAtual - 1, anoAtual, anoAtual + 1].forEach((a) => s.add(a));
    return [...s].sort((a, b) => b - a).map((a) => ({ value: a, label: String(a), chip: `Ano: ${a}` }));
  }, [lancs, anoAtual]);
  const opcoesCategoria = useMemo(() => {
    const gs = [];
    categorias.filter((c) => c.grupo.tipo === 'saida').forEach((c) => {
      let g = gs.find((x) => x.titulo === c.grupo.nome);
      if (!g) { g = { titulo: c.grupo.nome, cor: c.grupo.cor, itens: [] }; gs.push(g); }
      g.itens.push({ value: c.id, label: c.nome, grupo: c.grupo.nome });
    });
    return [{ titulo: 'Geral', itens: [{ value: 'sem', label: 'Sem categoria' }] }, ...gs];
  }, [categorias]);

  if (!recs) return (<div><CabecalhoPagina titulo="Gastos fixos" /><PageLoading /></div>);

  const sugeridas = recs.length === 0 ? recorrenciasDoHistorico(semRec) : [];
  const filtrando = Boolean(busca || cats.length || situacao !== 'ativos' || ano !== anoAtual);
  const limpar = () => { setBusca(''); setCats([]); setSituacao('ativos'); setAno(anoAtual); };

  // Exportar o ano: uma linha por fixo, o lançado em cada mês (vazio = não lançado), o total e a média.
  const exportar = () => exportCsv(`gastos-fixos-${ano}`, matriz.linhas.map((l) => ({ ...l, nome: l.rec.descricao, categoria: l.rec.categoria?.nome ?? '' })), [
    { key: 'nome', label: 'Gasto fixo' },
    { key: 'categoria', label: 'Categoria' },
    ...matriz.comps.map((c, i) => ({ key: c, label: competenciaCurta(c), tipo: 'dinheiro', map: (l) => (l.celulas[i].estado === 'lancado' ? l.celulas[i].valor / 100 : null) })),
    { key: 'total', label: 'Total', tipo: 'dinheiro', map: (l) => l.total / 100 },
    { key: 'media', label: 'Média', tipo: 'dinheiro', map: (l) => (l.media ?? 0) / 100 },
  ]);
  const abrirMais = (el) => {
    const r = el.getBoundingClientRect();
    // Criar um fixo é no cadastro (✎). O `motivo` só existe com o item desabilitado: o menu o mostra no
    // lugar do `sub` sempre que vem preenchido.
    const vazio = !matriz.linhas.length;
    setMais({ x: r.right - 230, y: r.bottom + 4, titulo: 'Mais ações', itens: [
      { rotulo: `Exportar ${ano} (CSV)`, sub: 'o lançado de cada fixo em cada mês', desabilitado: vazio, motivo: vazio ? 'nada no ano' : undefined, onEscolher: exportar },
    ] });
  };
  const ICONE = 'flex h-9 items-center justify-center text-gray-600 transition-colors hover:bg-gray-50 active:bg-gray-200';

  return (
    <div>
      <CabecalhoPagina titulo="Gastos fixos"
        acessorio={recs.length > 0 && <span className="text-sm text-gray-500">{recs.filter((r) => r.ativa).length} ativos</span>}
        acoes={<>
          {/* O GRUPO DO DRE: os ícones numa caixa só (o nome no tooltip), divisória entre eles. A caixa tem a
              altura do `.btn` (36px por dentro + a borda). */}
          <div className="inline-flex overflow-hidden rounded-md border border-gray-300 bg-white">
            <Tooltip label="Cadastro dos fixos">
              <button type="button" aria-label="Cadastro dos fixos" onClick={() => setCadastro(true)} className={`${ICONE} w-[38px]`}>
                <IconLapis className="h-3.5 w-3.5" />
              </button>
            </Tooltip>
            <Tooltip label="Mais ações">
              <button type="button" aria-label="Mais ações" aria-haspopup="menu" aria-expanded={!!mais}
                onClick={(e) => (mais ? setMais(null) : abrirMais(e.currentTarget))}
                className={`${ICONE} w-[28px] border-l border-gray-200 ${mais ? 'bg-gray-100' : ''}`}>
                <IconSeta className={`transition-transform duration-200 ease-out ${mais ? 'rotate-180' : ''}`} />
              </button>
            </Tooltip>
          </div>
          {/* O GESTO DO DIA A DIA: "Lançar N ▾" abre o menu por mês ("Lançar" e "Não teve" em cada fixo; no
              rodapé, "Lançar os N", que pede confirmação, e "Ver na grade"). Âmbar = falta fazer. */}
          {pendAno.length > 0 && (
            <MenuFixos meses={mesesPend} pendentes={pendMes} hoje={hoje} alinhar="direita"
              onLancar={(x) => matrizRef.current?.lancar([{ r: x.r, c: x.c }], { perguntar: false })}
              onPular={(x) => matrizRef.current?.pular([{ r: x.r, c: x.c }])}
              rodape={[
                { rotulo: pendAno.length === 1 ? 'Lançar com o valor sugerido' : `Lançar os ${pendAno.length} com o valor sugerido`, destaque: true,
                  onClick: () => matrizRef.current?.lancar(pendAno.map((x) => ({ r: x.r, c: x.c }))) },
                { rotulo: 'Ver na grade', onClick: () => matrizRef.current?.selecionar(Math.min(...pendAno.map((x) => x.c)), Math.max(...pendAno.map((x) => x.c))) },
              ]}>
              {(aberto) => (
                <span className="btn font-semibold hover:brightness-95 active:brightness-90" style={{ background: '#f59e0b', borderColor: '#d98a06', color: '#1f1600' }}>
                  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12l5 5 9-10" /></svg>
                  Lançar
                  <span className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-[5px] bg-black/15 px-1 text-[11px] font-bold tabular-nums">{pendAno.length}</span>
                  {/* A seta gira com o menu aberto, como a do ▾ ao lado. */}
                  <IconSeta className={`opacity-70 transition-transform duration-200 ease-out ${aberto ? 'rotate-180' : ''}`} />
                </span>
              )}
            </MenuFixos>
          )}
        </>} />

      {sugeridas.length > 0 && <DoHistorico sugeridas={sugeridas} categorias={categorias} onCriado={carregar} />}

      {recs.length > 0 && (
        <>
          <FaixaProvider>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <BuscaFaixa className="w-full sm:w-[200px]" placeholder="Gasto fixo" value={busca} onChange={(e) => setBusca(e.target.value)} />
              <Trilho>
                <SegUnico id="ano" rotulo="Ano" opcoes={opcoesAno} value={ano} onChange={setAno} padrao={anoAtual} mostraPadrao largura={150} />
                <DivisorFaixa />
                <SegMulti id="categoria" rotulo="Categoria" opcoes={opcoesCategoria} value={cats} onChange={setCats} largura={280} busca="Buscar categoria ou grupo" />
                <DivisorFaixa />
                <SegUnico id="situacao" rotulo="Situação" opcoes={OPCOES_SITUACAO} value={situacao} onChange={setSituacao} padrao="ativos" mostraPadrao largura={170} />
              </Trilho>
              <LimparFiltros ativo={filtrando} onClick={limpar} />
              <span className="flex-1" />
              {/* A troca Valor | Variação % é a `AbasPilula` do Gestor (a pílula desliza), na altura do trilho ao lado. */}
              <AbasPilula abas={[{ key: 'valor', label: 'Valor' }, { key: 'variacao', label: 'Variação %' }]} valor={modo} onChange={setModo}
                variante="claro" altura={31} folga={3} />
            </div>
          </FaixaProvider>

          <div className="mt-3">
            {matriz.linhas.length === 0
              ? <ListaVazia>Nenhum gasto fixo {filtrando ? 'com esses filtros' : `vigente em ${ano}`}.</ListaVazia>
              : <MatrizFixos ref={matrizRef} matriz={matriz} hoje={hoje} setLancs={setLancs} setPulados={setPuladosLista} pulosAtivos={pulados !== null}
                  modo={modo} onEditar={(rec) => setModal({ item: rec })} onRecarregar={carregar} />}
          </div>

        </>
      )}

      {recs.length === 0 && sugeridas.length === 0 && (
        <div className="mt-6 max-w-3xl"><ListaVazia>Nenhum gasto fixo cadastrado. Crie no cadastro (o ✎ no alto da tela).</ListaVazia></div>
      )}

      {cadastro && (
        <ModalCadastroFixos recs={recs} categorias={categorias} ultimos={ultimos} onFechar={() => setCadastro(false)}
          onSalvo={() => { setCadastro(false); carregar(); }} onCategoriaCriada={(cat) => setCategorias((cs) => [...cs, cat])} />
      )}
      <MenuContexto menu={mais} onFechar={() => setMais(null)} />
      {modal && <ModalRecorrencia rec={modal.item} categorias={categorias} onFechar={() => setModal(null)} onSalvo={() => { setModal(null); carregar(); }} />}
    </div>
  );
}
