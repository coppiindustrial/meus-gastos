import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import CabecalhoPagina from '../components/CabecalhoPagina.jsx';
import SeletorCategoria from '../components/SeletorCategoria.jsx';
import Checkbox from '../components/Checkbox.jsx';
import ListaVazia from '../components/ListaVazia.jsx';
import MenuContexto from '../components/MenuContexto.jsx';
import Tooltip from '../components/Tooltip.jsx';
import { PageLoading } from '../components/Spinner.jsx';
import { DivisorFaixa, FaixaProvider, LimparFiltros, Trilho } from '../components/filtros/FaixaFiltros.jsx';
import { BuscaFaixa, SegUnico } from '../components/filtros/Segmentos.jsx';
import { IconLista, IconSeta } from '../components/icons.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { listarCategorias } from '../api/cadastros.js';
import { classificarLancamentos, desclassificar, excluirRegra, listarPendencias, salvarRegra } from '../api/regras.js';
import { formatBRL } from '../lib/dinheiro.js';
import { formatDate } from '../lib/format.js';
import { lsGet, lsSet } from '../lib/storage.js';
import { exportCsv } from '../lib/exportCsv.js';
import { agrupar, fonteDe, nomeDe, ORDENS, ordenarGrupos, planoClassificar, problemaDaEscolha, quantasPega } from '../lib/pendencias.js';

// REVISAR PENDÊNCIAS (opção A do mockup "Revisar pendências · a tabela", 30/10/2026): os lançamentos importados (fatura
// ou extrato) que nenhuma regra classificou, UMA LINHA POR ESTABELECIMENTO, e a categoria escolhida NA PRÓPRIA LINHA
// (o `SeletorCategoria`) — sem modal. A coluna Regra já vem com o nome e diz quantas pendências pega; apagar o texto =
// só estas compras, sem regra. Escolher não grava: a linha fica marcada e "Classificar N" grava tudo de uma vez
// (`planoClassificar`, testado), com "Desfazer" para a última vez. Marcar várias e escolher uma categoria vale para todas.

const LS_ORDEM = 'pendencias_ordem';
// TIRAR A ESCOLHA (30/10/2026, a pedido): a primeira opção da lista desfaz a categoria escolhida na linha (para
// deixar para depois — por exemplo, quando falta criar o grupo antes).
const NENHUMA = [{ value: '-', label: 'Não classificar agora' }];
const daLista = (v) => (v === '-' ? '' : v); // o '-' só existe na lista: a linha sem escolha mostra o "Escolher…"
const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
const diaMes = (d) => formatDate(d).slice(0, 5);

export default function Pendencias() {
  const toast = useToast();
  const navigate = useNavigate();
  const [pendencias, setPendencias] = useState(null);
  const [categorias, setCategorias] = useState([]);
  const [escolhas, setEscolhas] = useState({}); // { chave: { categoriaId, palavra } } — só o que a pessoa mexeu
  const [marcadas, setMarcadas] = useState(() => new Set());
  const [busca, setBusca] = useState('');
  const [fonte, setFonte] = useState('');
  const [ordem, setOrdemEstado] = useState(() => (ORDENS.some((o) => o.value === lsGet(LS_ORDEM)) ? lsGet(LS_ORDEM) : 'compras'));
  const setOrdem = (v) => { setOrdemEstado(v); lsSet(LS_ORDEM, v); };
  const [salvando, setSalvando] = useState(false);
  const [ultimo, setUltimo] = useState(null); // { ids, regras, n } da última gravação, para o "Desfazer"
  const [mais, setMais] = useState(null);
  const maisAbertoNoClique = useRef(false);

  const carregar = useCallback(async () => {
    try {
      const [p, c] = await Promise.all([listarPendencias(), listarCategorias()]);
      setPendencias(p);
      setCategorias(c);
    } catch (err) { toast.error(err.message); setPendencias([]); }
  }, [toast]);
  useEffect(() => { carregar(); }, [carregar]);

  const todos = useMemo(() => agrupar(pendencias ?? []), [pendencias]);
  const opcoesFonte = useMemo(() => [{ value: '', label: 'Todas' },
    ...[...new Set((pendencias ?? []).map(fonteDe))].sort().map((f) => ({ value: f, label: f }))], [pendencias]);
  const t = busca.trim().toLocaleLowerCase('pt-BR');
  const grupos = useMemo(() => ordenarGrupos(todos, ordem)
    .filter((g) => (!t || g.chave.includes(t)) && (!fonte || g.itens.some((p) => fonteDe(p) === fonte))), [todos, ordem, t, fonte]);

  // A escolha de cada grupo: a da pessoa ou a de partida (sem categoria, a palavra = o nome).
  const escolhaDe = (g) => escolhas[g.chave] ?? { categoriaId: '', palavra: g.nome };
  const escolher = (chaves, campos) => setEscolhas((e) => {
    const n = { ...e };
    chaves.forEach((k) => { const g = todos.find((x) => x.chave === k); n[k] = { ...(e[k] ?? { categoriaId: '', palavra: g?.nome ?? '' }), ...campos }; });
    return n;
  });
  const todasEscolhas = useMemo(() => Object.fromEntries(todos.map((g) => [g.chave, escolhas[g.chave] ?? { categoriaId: '', palavra: g.nome }])), [todos, escolhas]);
  const plano = useMemo(() => planoClassificar(todos, todasEscolhas, pendencias ?? []), [todos, todasEscolhas, pendencias]);
  const nEscolhidos = plano.passos.length;
  const problemas = useMemo(() => new Map(plano.passos.map((p) => [p.chave, problemaDaEscolha(todos.find((g) => g.chave === p.chave), todasEscolhas[p.chave])]).filter(([, m]) => m)), [plano, todos, todasEscolhas]);

  const salvar = async () => {
    if (!nEscolhidos || salvando) return;
    if (problemas.size) {
      const [chave, motivo] = [...problemas][0];
      toast.error(`Não gravou — ${todos.find((g) => g.chave === chave)?.nome}: ${motivo}.`);
      return;
    }
    setSalvando(true);
    const feito = { ids: [], regras: [] };
    try {
      for (const p of plano.passos) {
        if (p.regra) feito.regras.push((await salvarRegra({ palavra_chave: p.regra, categoria_id: p.categoriaId })).id);
        await classificarLancamentos(p.ids, p.categoriaId);
        feito.ids.push(...p.ids);
      }
      toast.success(`${plural(feito.ids.length, 'lançamento classificado', 'lançamentos classificados')}${feito.regras.length ? ` · ${plural(feito.regras.length, 'regra nova', 'regras novas')}` : ''}.`);
    } catch (err) {
      toast.error(/duplicate|unique/i.test(err.message) ? 'Já existe uma regra com essa palavra-chave (veja em Regras de classificação).' : err.message);
    }
    setUltimo(feito.ids.length || feito.regras.length ? { ...feito, n: feito.ids.length } : null);
    setEscolhas({}); setMarcadas(new Set());
    await carregar();
    setSalvando(false);
  };

  const desfazer = async () => {
    if (!ultimo || salvando) return;
    setSalvando(true);
    try {
      await desclassificar(ultimo.ids);
      for (const id of ultimo.regras) await excluirRegra(id);
      toast.success(`Desfeito: ${plural(ultimo.n, 'lançamento voltou', 'lançamentos voltaram')} para a revisão.`);
      setUltimo(null);
    } catch (err) { toast.error(err.message); }
    await carregar();
    setSalvando(false);
  };

  const alternarMarca = (k) => setMarcadas((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const todasMarcadas = grupos.length > 0 && grupos.every((g) => marcadas.has(g.chave));
  const marcarTodas = () => setMarcadas(todasMarcadas ? new Set() : new Set(grupos.map((g) => g.chave)));

  const exportar = () => exportCsv('pendencias', [...(pendencias ?? [])], [
    { key: 'data', label: 'Data', tipo: 'data' },
    { key: 'estab', label: 'Estabelecimento', map: nomeDe },
    { key: 'fonte', label: 'Cartão / extrato', map: fonteDe },
    { key: 'valor', label: 'Valor', tipo: 'dinheiro', map: (p) => p.valor_centavos / 100 },
  ]);
  const abrirMais = (el) => {
    const r = el.getBoundingClientRect();
    const vazio = !pendencias?.length;
    setMais({ x: r.right - 250, y: r.bottom + 4, titulo: 'Mais ações', itens: [
      { rotulo: 'Exportar pendências (CSV)', sub: 'data, estabelecimento, cartão e valor', desabilitado: vazio, motivo: vazio ? 'nada a revisar' : undefined, onEscolher: exportar },
    ] });
  };
  const ICONE = 'flex h-9 items-center justify-center text-gray-600 transition-colors hover:bg-gray-50 active:bg-gray-200';
  const totalGeral = (pendencias ?? []).reduce((s, p) => s + p.valor_centavos, 0);
  const filtrando = Boolean(busca || fonte);
  const td = 'border-b border-gray-100 px-2 py-1.5';
  const th = 'sticky top-0 z-10 h-8 border-b border-gray-200 bg-hx-f9fafb px-2 text-left text-[10.5px] font-semibold uppercase tracking-wide text-gray-500';

  return (
    <div>
      <CabecalhoPagina titulo="Revisar pendências"
        acessorio={pendencias?.length > 0 && (
          <span className="hidden text-sm text-gray-500 sm:inline">
            {plural(pendencias.length, 'lançamento', 'lançamentos')} · {formatBRL(totalGeral)} · {plural(todos.length, 'estabelecimento', 'estabelecimentos')}
          </span>
        )}
        acoes={<>
          {/* O GRUPO DO DRE (o mesmo dos Fixos e do Importar): ☰ as regras e ▾ "Mais ações"; ao lado, o gesto do dia a dia. */}
          <div className="hidden overflow-hidden rounded-md border border-gray-300 bg-white md:inline-flex">
            <Tooltip label="Regras de classificação">
              <button type="button" aria-label="Regras de classificação" onClick={() => navigate('/cadastros/regras')} className={`${ICONE} w-[38px]`}>
                <IconLista className="h-4 w-4" />
              </button>
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
          <button type="button" className="btn-primary" onClick={salvar} disabled={!nEscolhidos || salvando}>
            {salvando ? 'Gravando…' : `Classificar ${nEscolhidos}`}
          </button>
        </>} />

      {!pendencias ? <PageLoading /> : todos.length === 0 ? (
        <div className="mt-6">
          <ListaVazia>Nada para revisar: todos os lançamentos importados têm categoria.</ListaVazia>
          {ultimo && (
            <p className="mt-3 text-[12.5px] text-gray-500">
              Classificou {plural(ultimo.n, 'lançamento', 'lançamentos')}. <button type="button" className="underline underline-offset-2 hover:text-gray-800" onClick={desfazer} disabled={salvando}>Desfazer</button>
            </p>
          )}
        </div>
      ) : (
        <>
          <FaixaProvider>
            <div className="mt-6 flex flex-wrap items-center gap-2">
              <BuscaFaixa className="w-full sm:w-[220px]" placeholder="Estabelecimento" value={busca} onChange={(e) => setBusca(e.target.value)} />
              <Trilho>
                <SegUnico id="fonte" rotulo="Cartão" opcoes={opcoesFonte} value={fonte} onChange={setFonte} padrao="" largura={170} />
                <DivisorFaixa />
                <SegUnico id="ordem" rotulo="Ordem" opcoes={ORDENS} value={ordem} onChange={setOrdem} padrao="compras" mostraPadrao largura={180} />
              </Trilho>
              <LimparFiltros ativo={filtrando} onClick={() => { setBusca(''); setFonte(''); }} />
            </div>
          </FaixaProvider>

          <div className="card mt-4 overflow-hidden">
            <div className="max-h-[calc(100vh-290px)] min-h-[200px] overflow-auto [scrollbar-gutter:stable]">
              <table className="w-full min-w-[980px] table-fixed border-separate border-spacing-0 text-[12.5px]">
                <colgroup>
                  <col style={{ width: 40 }} /><col /><col style={{ width: 220 }} /><col style={{ width: 104 }} />
                  <col style={{ width: 250 }} /><col style={{ width: 270 }} />
                </colgroup>
                <thead>
                  <tr>
                    <th className={`${th} text-center`}><Checkbox size="sm" checked={todasMarcadas} indeterminate={marcadas.size > 0} onChange={marcarTodas} title="Marcar todas" /></th>
                    <th className={th}>Estabelecimento</th><th className={th}>Compras</th><th className={`${th} text-right`}>Total</th>
                    <th className={th}>Categoria</th>
                    <th className={th} title="Quem tiver este texto no nome ganha a categoria — agora e nas próximas importações. Vazio = só estas compras.">Regra (palavra-chave)</th>
                  </tr>
                </thead>
                <tbody>
                  {grupos.map((g) => {
                    const e = escolhaDe(g);
                    const escolhido = !!e.categoriaId;
                    const problema = escolhido ? problemas.get(g.chave) : null;
                    const pega = quantasPega(e.palavra, pendencias);
                    const fontes = [...new Set(g.itens.map(fonteDe))].join(', ');
                    const marcada = marcadas.has(g.chave);
                    return (
                      <tr key={g.chave} className={marcada ? 'bg-blue-50' : escolhido ? 'bg-hx-f0fdf4' : 'hover:bg-hx-f9fafb'}>
                        <td className={`${td} text-center`} style={escolhido ? { boxShadow: 'inset 3px 0 0 #22c55e' } : undefined}>
                          <Checkbox size="sm" checked={marcada} onChange={() => alternarMarca(g.chave)} title={`Marcar ${g.nome}`} />
                        </td>
                        <td className={td}>
                          <span className="flex min-w-0 items-center gap-2">
                            <span className="truncate font-semibold text-gray-800" title={g.nome}>{g.nome}</span>
                            <span className="inline-grid h-[18px] min-w-[20px] shrink-0 place-items-center rounded-full bg-gray-100 px-1.5 text-[11px] font-semibold text-gray-600">{g.itens.length}</span>
                          </span>
                        </td>
                        <td className={`${td} truncate text-[11.5px] text-gray-500`}
                          title={g.itens.map((p) => `${diaMes(p.data)} · ${fonteDe(p)} · ${formatBRL(p.valor_centavos)}`).join('\n')}>
                          {g.itens.slice(0, 3).map((p) => diaMes(p.data)).join(' · ')}{g.itens.length > 3 && ` +${g.itens.length - 3}`} · {fontes}
                        </td>
                        <td className={`${td} text-right tabular-nums text-gray-800`}>{formatBRL(g.total)}</td>
                        <td className={td}>
                          <SeletorCategoria value={e.categoriaId} onChange={(v) => escolher([g.chave], { categoriaId: daLista(v) })} categorias={categorias} tipo="saida" extras={NENHUMA}
                            onCriada={() => listarCategorias().then(setCategorias).catch(() => {})} placeholder="Escolher…" className="!h-8 text-[12.5px]" />
                        </td>
                        <td className={td}>
                          <span className="flex items-center gap-2">
                            <input className={`input !h-8 min-w-0 flex-1 text-[12.5px] ${problema ? '!border-hx-e5484d' : ''}`} value={e.palavra}
                              placeholder="sem regra (só estas)" title={problema ?? undefined}
                              onChange={(ev) => escolher([g.chave], { palavra: ev.target.value })} />
                            <span className={`w-[52px] shrink-0 text-right text-[11px] ${problema ? 'text-hx-c0393d' : 'text-gray-500'}`}>
                              {problema ? 'não pega' : e.palavra.trim() ? <>pega <b className="text-gray-800">{pega}</b></> : '—'}
                            </span>
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                  {grupos.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-gray-400">Nada com esses filtros.</td></tr>}
                </tbody>
              </table>
            </div>

            {/* O RODAPÉ: com linhas marcadas, a barra de AÇÃO (uma categoria para todas); sem, o que vai ser gravado. */}
            {marcadas.size ? (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-blue-200 bg-blue-50 px-4 py-3">
                <span className="min-w-0 text-[12.5px] text-gray-700"><b className="font-semibold">{plural(marcadas.size, 'marcada', 'marcadas')}</b></span>
                <span className="flex-1" />
                <span className="w-[260px]">
                  <SeletorCategoria value={null} onChange={(v) => { escolher([...marcadas], { categoriaId: daLista(v) }); setMarcadas(new Set()); }} categorias={categorias} tipo="saida" extras={NENHUMA}
                    onCriada={() => listarCategorias().then(setCategorias).catch(() => {})} placeholder={`Categoria para as ${marcadas.size}…`} className="!h-8 text-[12.5px]" />
                </span>
                <button type="button" className="btn-secondary !h-8 !px-3 !text-[12.5px]" onClick={() => setMarcadas(new Set())}>Desmarcar</button>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-gray-200 bg-hx-f9fafb px-4 py-3">
                <span className="text-[12px] text-gray-500">
                  {nEscolhidos ? (
                    <><b className="font-semibold text-hx-166534">{plural(nEscolhidos, 'escolhida', 'escolhidas')}</b>
                      {` · ${plural(plano.lancamentos, 'lançamento', 'lançamentos')}`}
                      {plano.regras ? ` · ${plural(plano.regras, 'regra nova', 'regras novas')}` : ''}
                      {plano.deOutros ? ` · ${plano.deOutros} de outros estabelecimentos (a regra pega)` : ''} · ainda não gravado</>
                  ) : ultimo ? (
                    <>Classificou {plural(ultimo.n, 'lançamento', 'lançamentos')}. <button type="button" className="underline underline-offset-2 hover:text-gray-800" onClick={desfazer} disabled={salvando}>Desfazer</button></>
                  ) : 'Escolha a categoria na linha (ou marque várias). Nada é gravado até “Classificar”.'}
                </span>
                <span className="flex-1" />
                {nEscolhidos > 0 && <button type="button" className="btn-secondary" onClick={() => setEscolhas({})} disabled={salvando}>Limpar escolhas</button>}
                <button type="button" className="btn-primary" onClick={salvar} disabled={!nEscolhidos || salvando}>
                  {salvando ? 'Gravando…' : `Classificar ${nEscolhidos}`}
                </button>
              </div>
            )}
          </div>
        </>
      )}
      <MenuContexto menu={mais} onFechar={() => setMais(null)} />
    </div>
  );
}
