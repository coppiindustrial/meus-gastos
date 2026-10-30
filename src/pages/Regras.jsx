import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import CabecalhoPagina from '../components/CabecalhoPagina.jsx';
import SeletorCategoria from '../components/SeletorCategoria.jsx';
import Checkbox from '../components/Checkbox.jsx';
import Toggle from '../components/Toggle.jsx';
import Tooltip from '../components/Tooltip.jsx';
import MenuContexto from '../components/MenuContexto.jsx';
import { PageLoading } from '../components/Spinner.jsx';
import { Bolinha } from '../components/Comuns.jsx';
import { DivisorFaixa, FaixaProvider, LimparFiltros, Trilho } from '../components/filtros/FaixaFiltros.jsx';
import { BuscaFaixa, SegMulti, SegUnico } from '../components/filtros/Segmentos.jsx';
import { IconGrip, IconMais, IconSeta, IconSetaOrdenacao } from '../components/icons.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { useConfirmacao } from '../context/ConfirmContext.jsx';
import { listarCategorias } from '../api/cadastros.js';
import { atualizarRegra, classificarLancamentos, criarRegra, excluirRegra, listarNomesClassificaveis, listarPendencias, listarRegras } from '../api/regras.js';
import { criarClassificador, regraPega } from '../lib/classificar.js';
import { alteracoesRegras, diferencaRegra, nomesDistintos, quemPega, totalAlteracoesRegras, usoDasRegras, validarRegras } from '../lib/regras.js';
import { competenciaCurta } from '../lib/format.js';
import { lsGet, lsSet } from '../lib/storage.js';
import { exportCsv } from '../lib/exportCsv.js';
import { useListaArrastavel } from '../lib/useListaArrastavel.js';

// REGRAS DE CLASSIFICAÇÃO (a aba "Regras" da planilha): a primeira regra, na ordem, cuja palavra-chave aparece no
// nome do estabelecimento dá a categoria (ou diz "ignorar": não é gasto). Vale para o que se importa daqui em diante.
//
// A TELA (30/10/2026, opção A do mockup "Regras · overhaul"): a TABELA DE FORMULÁRIO do cadastro dos fixos e do das
// categorias — a ordem é a alça ⠿ (arrastar = mudar a prioridade), a palavra e a categoria são campos, marcar várias
// muda a categoria ou exclui, e "Salvar alterações (N)" grava só a diferença (`lib/regras.js`, testada). Duas colunas
// só de leitura: PEGOU (quantos lançamentos do histórico ela classificaria, e o último) e o AVISO ("escondida por #N"
// quando uma regra antes dela sempre pega os mesmos nomes; "sem uso"). O ⌕ abre o TESTE de um nome. "Agrupar por
// categoria" mostra a mesma tabela por categoria (sem arrastar: agrupada, a ordem não se vê).

const IGNORAR = '__ignorar';
const EXTRAS_IGNORAR = [{ value: IGNORAR, label: 'Ignorar — não é gasto' }];
const OPCOES_TIPO = [{ value: '', label: 'Todas' }, { value: 'categoria', label: 'Com categoria' }, { value: 'ignorar', label: 'Ignorar' }];
const OPCOES_USO = [{ value: '', label: 'Todas' }, { value: 'sem-uso', label: 'Sem uso' }, { value: 'escondida', label: 'Escondidas' }];
const LS_AGRUPAR = 'regras_agrupar';
// ORDENAR PELO CABEÇALHO (30/10/2026, a pedido): clicar no título ordena a VISTA (a 1ª vez crescente — "Pegou" do
// maior para o menor —, a 2ª inverte, a 3ª volta); o "#" volta à ordem das regras. Ordenada, a alça não arrasta:
// a prioridade continua a do "#". A escolha fica lembrada no navegador.
const LS_ORDEM = 'regras_ordem';
const ROTULO_ORDEM = { palavra: 'palavra-chave', categoria: 'categoria', pegou: 'uso' };
const lerOrdem = () => { try { const o = JSON.parse(lsGet(LS_ORDEM)); return ROTULO_ORDEM[o?.col] ? o : null; } catch { return null; } };
const semAcento = (x) => String(x ?? '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
let seq = 0;
const daRegra = (r, pos) => ({
  id: r.id, pos, novo: false, excluir: false, orig: r,
  palavra_chave: r.palavra_chave, categoria_id: r.categoria_id ?? '', ignorar: !!r.ignorar,
});

// O título de uma coluna que ordena: a seta fica à vista na coluna ordenada e aparece no hover nas outras.
function Titulo({ col, ordem, onOrdenar, title, direita = false, children }) {
  const ativa = col ? ordem?.col === col : !ordem;
  return (
    <button type="button" onClick={() => onOrdenar(col)} title={title}
      className={`group/tit inline-flex items-center gap-1 uppercase tracking-wide transition-colors hover:text-gray-800 ${direita ? 'w-full justify-end' : ''} ${ativa && col ? 'text-gray-800' : ''}`}>
      {children}
      {col && (
        <IconSetaOrdenacao descendente={ativa && ordem.dir === 'desc'}
          className={`h-3 w-3 transition-opacity ${ativa ? 'opacity-100' : 'opacity-0 group-hover/tit:opacity-60'}`} />
      )}
    </button>
  );
}

export default function Regras() {
  const toast = useToast();
  const confirmar = useConfirmacao();
  const [regras, setRegras] = useState(null); // as do banco, na ordem
  const [linhas, setLinhas] = useState([]); // o rascunho, na ordem da tela
  const [categorias, setCategorias] = useState([]);
  const [nomes, setNomes] = useState(null); // os nomes do histórico, para o uso
  const [busca, setBusca] = useState('');
  const [cats, setCats] = useState([]);
  const [tipo, setTipo] = useState('');
  const [usoF, setUsoF] = useState('');
  const [agrupar, setAgruparEstado] = useState(() => lsGet(LS_AGRUPAR) === 'sim');
  const setAgrupar = (v) => { setAgruparEstado(v); lsSet(LS_AGRUPAR, v ? 'sim' : ''); };
  const [ordem, setOrdemEstado] = useState(lerOrdem);
  const ordenar = (col) => {
    const primeira = col === 'pegou' ? 'desc' : 'asc';
    const nova = !col ? null : ordem?.col !== col ? { col, dir: primeira } : ordem.dir === primeira ? { col, dir: primeira === 'asc' ? 'desc' : 'asc' } : null;
    setOrdemEstado(nova);
    lsSet(LS_ORDEM, JSON.stringify(nova));
  };
  const [testando, setTestando] = useState(false);
  const [teste, setTeste] = useState('');
  const [marcadas, setMarcadas] = useState(() => new Set());
  const [erro, setErro] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const [mais, setMais] = useState(null);
  const maisAbertoNoClique = useRef(false);
  const caixaRef = useRef(null);

  const carregar = useCallback(async () => {
    try {
      const [r, c] = await Promise.all([listarRegras(), listarCategorias()]);
      setRegras(r);
      setLinhas(r.map(daRegra));
      setCategorias(c);
      setMarcadas(new Set()); setErro(null);
    } catch (err) { toast.error(err.message); setRegras([]); }
    listarNomesClassificaveis().then((ls) => setNomes(nomesDistintos(ls))).catch(() => setNomes([]));
  }, [toast]);
  useEffect(() => { carregar(); }, [carregar]);

  // O USO (do que está GRAVADO: a ordem do banco), refeito só quando as regras ou os nomes mudam.
  const uso = useMemo(() => (regras && nomes ? usoDasRegras(regras, nomes) : null), [regras, nomes]);
  const maxPegou = useMemo(() => (uso ? Math.max(1, ...[...uso.values()].map((u) => u.pegou)) : 1), [uso]);
  const nSemUso = uso ? [...uso.values()].filter((u) => u.aviso?.tipo === 'sem-uso').length : 0;
  const nEscondidas = uso ? [...uso.values()].filter((u) => u.aviso?.tipo === 'escondida').length : 0;

  const catPorId = useMemo(() => new Map(categorias.map((c) => [c.id, c])), [categorias]);
  const posicao = useMemo(() => new Map(linhas.filter((l) => !l.excluir).map((l, i) => [l.id, i + 1])), [linhas]);
  const palavraDe = (id) => linhas.find((l) => l.id === id)?.palavra_chave ?? '';
  const alt = useMemo(() => alteracoesRegras(linhas), [linhas]);
  const nAlt = totalAlteracoesRegras(alt);

  // Os filtros. A busca procura na palavra, na categoria e TESTA a regra contra o texto ("qual regra pega X").
  const t = busca.trim().toLowerCase();
  const filtrando = Boolean(t || cats.length || tipo || usoF);
  const filtradas = useMemo(() => linhas.filter((l) => {
    if (l.novo) return true;
    if (t && !(l.palavra_chave.toLowerCase().includes(t) || catPorId.get(l.categoria_id)?.nome.toLowerCase().includes(t)
      || (l.ignorar && 'ignorar'.includes(t)) || regraPega(l.palavra_chave, busca.trim()))) return false;
    if (cats.length && !cats.includes(l.ignorar ? IGNORAR : l.categoria_id)) return false;
    if (tipo && (tipo === 'ignorar') !== l.ignorar) return false;
    if (usoF && uso?.get(l.id)?.aviso?.tipo !== usoF) return false;
    return true;
  }), [linhas, t, busca, cats, tipo, usoF, uso, catPorId]);
  const visiveis = useMemo(() => {
    if (!ordem) return filtradas;
    const chave = {
      palavra: (l) => semAcento(l.palavra_chave),
      categoria: (l) => (l.ignorar ? '\uffff' : semAcento(catPorId.get(l.categoria_id)?.nome ?? '\ufffe')),
      pegou: (l) => uso?.get(l.id)?.pegou ?? -1,
    }[ordem.col];
    const sinal = ordem.dir === 'desc' ? -1 : 1;
    const reais = filtradas.filter((l) => !l.novo).sort((a, b) => {
      const x = chave(a);
      const y = chave(b);
      const d = typeof x === 'number' ? x - y : x.localeCompare(y, 'pt-BR');
      return d ? d * sinal : (posicao.get(a.id) ?? 0) - (posicao.get(b.id) ?? 0);
    });
    return [...reais, ...filtradas.filter((l) => l.novo)];
  }, [filtradas, ordem, uso, catPorId, posicao]);

  // Agrupada: por categoria, na ordem do cadastro; "Ignorar" no fim. Cada grupo mantém a ordem das regras.
  const grupos = useMemo(() => {
    if (!agrupar) return null;
    const m = new Map();
    visiveis.forEach((l) => {
      const k = l.ignorar ? IGNORAR : l.categoria_id || 'sem';
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(l);
    });
    const ordem = [...categorias.map((c) => c.id), 'sem', IGNORAR];
    return [...m.entries()].sort((a, b) => ordem.indexOf(a[0]) - ordem.indexOf(b[0]));
  }, [agrupar, visiveis, categorias]);

  const arrasto = useListaArrastavel({
    ids: linhas.map((l) => l.id),
    onReordenar: (ids) => setLinhas((ls) => ids.map((id) => ls.find((l) => l.id === id)).filter(Boolean)),
  });
  const podeArrastar = !filtrando && !agrupar && !ordem;

  const muda = (ids, campos) => { setLinhas((ls) => ls.map((l) => (ids.includes(l.id) ? { ...l, ...campos } : l))); setErro(null); };
  const daLista = (v) => (v === IGNORAR ? { ignorar: true, categoria_id: '' } : { ignorar: false, categoria_id: v ?? '' });

  const novaRegra = () => {
    seq += 1;
    const id = `novo-${seq}`;
    setLinhas((ls) => [...ls, { id, pos: Infinity, novo: true, excluir: false, orig: null, palavra_chave: '', categoria_id: '', ignorar: false }]);
    setBusca(''); setCats([]); setTipo(''); setUsoF(''); setAgrupar(false);
    setTimeout(() => {
      const el = caixaRef.current?.querySelector(`[data-palavra="${id}"]`);
      el?.scrollIntoView({ block: 'nearest' });
      el?.focus();
    }, 60);
  };

  const descartar = async () => {
    if (nAlt && !(await confirmar({ titulo: 'Descartar as alterações?', texto: `${plural(nAlt, 'alteração ainda não foi salva', 'alterações ainda não foram salvas')}.`, confirmar: 'Descartar', perigo: true }))) return;
    setLinhas((regras ?? []).map(daRegra)); setMarcadas(new Set()); setErro(null);
  };

  const salvar = async () => {
    const problema = validarRegras(linhas);
    if (problema) { setErro(problema); toast.error(`Não salvou — ${problema.motivo}.`); return; }
    if (alt.excluir.length && !(await confirmar({
      titulo: 'Salvar estas alterações?',
      texto: `Exclui ${plural(alt.excluir.length, 'regra', 'regras')} (${alt.excluir.slice(0, 4).map((l) => `"${l.orig.palavra_chave}"`).join(', ')}${alt.excluir.length > 4 ? '…' : ''}). Os lançamentos já classificados não mudam.`,
      confirmar: 'Salvar', perigo: true,
    }))) return;
    setSalvando(true);
    try {
      for (const l of alt.excluir) await excluirRegra(l.id);
      for (const l of alt.mudadas) await atualizarRegra(l.id, diferencaRegra(l, alt.prioridades.get(l.id)));
      for (const l of alt.novas) await criarRegra(diferencaRegra(l, alt.prioridades.get(l.id)));
      toast.success(nAlt === 1 ? 'Alteração salva.' : `${nAlt} alterações salvas.`);
    } catch (err) {
      toast.error(/duplicate|unique/i.test(err.message) ? 'Já existe uma regra com essa palavra-chave.' : err.message);
    }
    await carregar();
    setSalvando(false);
  };

  // "Aplicar nas pendências agora": as regras GRAVADAS classificam o que está a revisar (as de ignorar ficam de fora).
  const aplicarNasPendencias = async () => {
    try {
      const pend = await listarPendencias();
      const classificar = criarClassificador((regras ?? []).filter((r) => !r.ignorar));
      const porCat = new Map();
      pend.forEach((p) => { const r = classificar(p.estabelecimento || p.descricao); if (r) porCat.set(r.categoria_id, [...(porCat.get(r.categoria_id) ?? []), p.id]); });
      const n = [...porCat.values()].reduce((s, ids) => s + ids.length, 0);
      if (!n) { toast.info(pend.length ? `Nenhuma das ${pend.length} pendências é pega pelas regras.` : 'Nada a revisar.'); return; }
      if (!(await confirmar({ titulo: `Classificar ${plural(n, 'pendência', 'pendências')}?`, texto: `As regras gravadas dão categoria a ${n} de ${pend.length} lançamentos a revisar.`, confirmar: 'Classificar' }))) return;
      for (const [cat, ids] of porCat) await classificarLancamentos(ids, cat);
      toast.success(`${plural(n, 'lançamento classificado', 'lançamentos classificados')}.`);
    } catch (err) { toast.error(err.message); }
  };

  const exportar = () => exportCsv('regras', linhas.filter((l) => !l.novo), [
    { key: 'ordem', label: 'Ordem', map: (l) => posicao.get(l.id) ?? '' },
    { key: 'palavra_chave', label: 'Palavra-chave' },
    { key: 'categoria', label: 'Categoria', map: (l) => (l.ignorar ? 'Ignorar' : catPorId.get(l.categoria_id)?.nome ?? '') },
    { key: 'pegou', label: 'Pegou (lançamentos)', map: (l) => uso?.get(l.id)?.pegou ?? '' },
    { key: 'aviso', label: 'Aviso', map: (l) => ({ 'sem-uso': 'sem uso', escondida: 'escondida' })[uso?.get(l.id)?.aviso?.tipo] ?? '' },
  ]);
  const abrirMais = (el) => {
    const r = el.getBoundingClientRect();
    setMais({ x: r.right - 270, y: r.bottom + 4, titulo: 'Mais ações', itens: [
      { rotulo: 'Aplicar nas pendências agora', sub: 'as regras gravadas classificam o que está a revisar', onEscolher: aplicarNasPendencias },
      { rotulo: 'Exportar regras (CSV)', sub: 'ordem, palavra, categoria e uso', onEscolher: exportar },
    ] });
  };

  // As categorias do filtro, por grupo, com "Ignorar" no topo.
  const opcoesCategoria = useMemo(() => {
    const gs = [];
    categorias.filter((c) => c.grupo.tipo === 'saida').forEach((c) => {
      let g = gs.find((x) => x.titulo === c.grupo.nome);
      if (!g) { g = { titulo: c.grupo.nome, cor: c.grupo.cor, itens: [] }; gs.push(g); }
      g.itens.push({ value: c.id, label: c.nome, grupo: c.grupo.nome });
    });
    return [{ titulo: 'Geral', itens: [{ value: IGNORAR, label: 'Ignorar' }] }, ...gs];
  }, [categorias]);

  const resultadoTeste = useMemo(() => (testando ? quemPega(linhas, teste) : []), [testando, linhas, teste]);
  const alternarMarca = (id) => setMarcadas((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const todasMarcadas = visiveis.length > 0 && visiveis.every((l) => marcadas.has(l.id));

  const ICONE = 'flex h-9 items-center justify-center text-gray-600 transition-colors hover:bg-gray-50 active:bg-gray-200';
  const th = 'sticky top-0 z-10 h-8 border-b border-gray-200 bg-hx-f9fafb px-2 text-left text-[10.5px] font-semibold uppercase tracking-wide text-gray-500';
  const td = 'border-b border-gray-100 px-2 py-1';
  const borda = (id, campo) => (erro?.id === id && erro.campo === campo ? '!border-hx-e5484d' : '');
  const nomeCat = (l) => (l.ignorar ? 'Ignorar' : catPorId.get(l.categoria_id)?.nome);

  const linha = (l) => {
    const u = uso?.get(l.id);
    const marcada = marcadas.has(l.id);
    const mudou = l.novo || (!l.excluir && Object.keys(diferencaRegra(l, alt.prioridades.get(l.id))).length > 0);
    return (
      <tr key={l.id} {...arrasto.itemProps(l.id)}
        className={`transition-[opacity,transform] duration-200 ease-out ${l.excluir ? 'opacity-50' : ''} ${marcada ? 'bg-blue-50' : 'hover:bg-hx-f9fafb'} ${arrasto.dragId === l.id ? '!opacity-40' : ''}`}>
        <td className={`${td} text-center`} style={mudou ? { boxShadow: 'inset 3px 0 0 #f59e0b' } : undefined}>
          {!l.novo && !l.excluir && <Checkbox size="sm" checked={marcada} onChange={() => alternarMarca(l.id)} title={`Marcar ${l.palavra_chave}`} />}
        </td>
        <td className={`${td} !px-0`}>
          {podeArrastar && !l.excluir ? (
            <span {...arrasto.alcaProps(l.id)} title="Arraste para mudar a ordem (a primeira que pega decide)"
              className="mx-auto flex h-7 w-5 cursor-grab items-center justify-center rounded-[4px] text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 active:cursor-grabbing"><IconGrip /></span>
          ) : <span className="mx-auto flex h-7 w-5 items-center justify-center text-gray-200"><IconGrip /></span>}
        </td>
        <td className={`${td} text-right tabular-nums text-gray-400`}>{l.excluir ? '' : posicao.get(l.id)}</td>
        <td className={td}>
          <input data-palavra={l.id} className={`input !h-8 font-mono text-[12px] ${l.excluir ? 'line-through' : ''} ${borda(l.id, 'palavra')}`} disabled={l.excluir}
            value={l.palavra_chave} placeholder="Palavra-chave" onChange={(e) => muda([l.id], { palavra_chave: e.target.value })} />
        </td>
        <td className={td}>
          {l.excluir ? <span className="px-2 text-gray-400">{nomeCat(l) ?? '—'}</span> : (
            <span className={borda(l.id, 'categoria') ? 'block rounded-md ring-1 ring-hx-e5484d' : ''}>
              <SeletorCategoria value={l.ignorar ? IGNORAR : l.categoria_id} onChange={(v) => muda([l.id], daLista(v))} categorias={categorias} tipo="saida"
                extras={EXTRAS_IGNORAR} placeholder="Categoria…" className="!h-8 text-[12.5px]"
                onCriada={() => listarCategorias().then(setCategorias).catch(() => {})} />
            </span>
          )}
        </td>
        <td className={`${td} whitespace-nowrap text-[11.5px] text-gray-500`}>
          {l.novo ? '—' : !u ? <span className="text-gray-300">…</span> : u.pegou ? (
            <span className="flex items-center gap-2">
              <span className="inline-block h-1.5 w-[64px] shrink-0 overflow-hidden rounded-full bg-gray-100"><span className="block h-full rounded-full bg-gray-400" style={{ width: `${Math.max(4, (u.pegou / maxPegou) * 100)}%` }} /></span>
              <span className="tabular-nums">{u.pegou}{u.ultima ? ` · ${competenciaCurta(u.ultima.slice(0, 7))}` : ''}</span>
            </span>
          ) : <span className="tabular-nums text-gray-400">0</span>}
        </td>
        <td className={`${td} text-[11.5px]`}>
          {!l.novo && u?.aviso?.tipo === 'escondida' && (
            <span className="inline-flex max-w-full items-center truncate rounded-[4px] bg-hx-fef3c7 px-1.5 py-0.5 font-semibold text-hx-92400e"
              title={`Os ${u.pegaria} lançamentos que ela pegaria já são pegos pela regra #${posicao.get(u.aviso.por)} antes dela. Arraste-a para cima, ou exclua.`}>
              escondida por #{posicao.get(u.aviso.por)} {palavraDe(u.aviso.por)}
            </span>
          )}
          {!l.novo && u?.aviso?.tipo === 'sem-uso' && (
            <span className="inline-flex rounded-[4px] bg-gray-100 px-1.5 py-0.5 font-semibold text-gray-500" title="Nenhum lançamento do histórico tem um nome que ela pegue.">sem uso</span>
          )}
        </td>
        <td className={`${td} text-right`}>
          <button type="button" title={l.excluir ? 'Não excluir' : 'Excluir (ao salvar)'}
            onClick={() => (l.novo ? setLinhas((ls) => ls.filter((x) => x.id !== l.id)) : muda([l.id], { excluir: !l.excluir }))}
            className={`inline-flex h-7 w-7 items-center justify-center rounded-[4px] transition-colors ${l.excluir ? 'bg-hx-fdeaea text-hx-c0393d' : 'text-gray-400 hover:bg-hx-fdeaea hover:text-hx-c0393d'}`}>
            <svg viewBox="0 0 24 24" className="h-[14px] w-[14px]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              {l.excluir ? <><path d="M9 14L4 9l5-5" /><path d="M4 9h11a5 5 0 0 1 0 10h-3" /></> : <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />}
            </svg>
          </button>
        </td>
      </tr>
    );
  };

  return (
    <div>
      <CabecalhoPagina titulo="Regras de classificação"
        acessorio={regras && (
          <span className="hidden text-sm text-gray-500 sm:inline">
            {plural(regras.length, 'regra', 'regras')}{uso ? ` · ${nSemUso} sem uso · ${plural(nEscondidas, 'escondida', 'escondidas')}` : ''}
          </span>
        )}
        acoes={<>
          {/* O GRUPO DO DRE: ⌕ o teste de um nome e ▾ "Mais ações"; ao lado, "+ Nova regra". */}
          <div className="hidden overflow-hidden rounded-md border border-gray-300 bg-white md:inline-flex">
            <Tooltip label="Testar um nome de loja">
              <button type="button" aria-label="Testar um nome de loja" aria-pressed={testando} onClick={() => setTestando((v) => !v)} className={`${ICONE} w-[38px] ${testando ? 'bg-gray-100' : ''}`}>
                <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>
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
          <button type="button" className="btn-primary" onClick={novaRegra} disabled={!regras}><IconMais className="h-[11px] w-[11px]" />Nova regra</button>
        </>} />

      {!regras ? <PageLoading /> : (
        <>
          <FaixaProvider>
            <div className="mt-6 flex flex-wrap items-center gap-2">
              <BuscaFaixa className="w-full sm:w-[260px]" placeholder="Palavra, categoria ou nome de loja" value={busca} onChange={(e) => setBusca(e.target.value)} />
              <Trilho>
                <SegMulti id="categoria" rotulo="Categoria" opcoes={opcoesCategoria} value={cats} onChange={setCats} largura={280} busca="Buscar categoria ou grupo" />
                <DivisorFaixa />
                <SegUnico id="tipo" rotulo="Tipo" opcoes={OPCOES_TIPO} value={tipo} onChange={setTipo} padrao="" largura={170} />
                <DivisorFaixa />
                <SegUnico id="uso" rotulo="Uso" opcoes={OPCOES_USO} value={usoF} onChange={setUsoF} padrao="" largura={160} />
                <DivisorFaixa />
                <label className="flex h-full cursor-pointer items-center gap-2 px-3 text-[12.5px] text-gray-600">
                  <Toggle compacto rotulo="Agrupar por categoria" checked={agrupar} onChange={setAgrupar} /> Agrupar
                </label>
              </Trilho>
              <LimparFiltros ativo={filtrando} onClick={() => { setBusca(''); setCats([]); setTipo(''); setUsoF(''); }} />
            </div>
          </FaixaProvider>

          {testando && (
            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-green-200 bg-green-50 px-4 py-2.5 text-[12.5px]">
              <b className="text-green-700">Testar</b>
              <input autoFocus className="input !h-8 w-[280px] text-[12.5px]" placeholder="Um nome como vem na fatura: DL *UBERRIDES" value={teste} onChange={(e) => setTeste(e.target.value)} />
              {teste.trim() && (resultadoTeste.length ? (
                <span className="text-gray-700">
                  → pega a regra <b className="font-mono">#{posicao.get(resultadoTeste[0].id)} {resultadoTeste[0].palavra_chave}</b> →{' '}
                  {resultadoTeste[0].ignorar ? <b>ignorar</b> : <span className="inline-flex items-center gap-1"><Bolinha cor={catPorId.get(resultadoTeste[0].categoria_id)?.grupo?.cor} /><b>{nomeCat(resultadoTeste[0]) ?? 'sem categoria'}</b></span>}
                  {resultadoTeste.length > 1 && <span className="ml-2 text-gray-500">também pegariam, depois dela: {resultadoTeste.slice(1, 4).map((r) => `#${posicao.get(r.id)} ${r.palavra_chave}`).join(' · ')}{resultadoTeste.length > 4 ? '…' : ''}</span>}
                </span>
              ) : <span className="text-gray-500">nenhuma regra pega este nome — ele iria para Revisar pendências.</span>)}
              <span className="flex-1" />
              <span className="text-[11.5px] text-gray-500">conta a ordem da tela (com o que ainda não foi salvo)</span>
            </div>
          )}

          <div className="card mt-4 overflow-hidden">
            <div ref={caixaRef} className="max-h-[calc(100vh-215px)] min-h-[240px] overflow-auto [scrollbar-gutter:stable]">
              <table className="w-full min-w-[1000px] table-fixed border-separate border-spacing-0 text-[12.5px]">
                <colgroup>
                  <col style={{ width: 40 }} /><col style={{ width: 30 }} /><col style={{ width: 52 }} /><col style={{ width: 280 }} />
                  <col style={{ width: 270 }} /><col style={{ width: 170 }} /><col /><col style={{ width: 44 }} />
                </colgroup>
                <thead>
                  <tr>
                    <th className={`${th} text-center`}><Checkbox size="sm" checked={todasMarcadas} indeterminate={marcadas.size > 0} onChange={() => setMarcadas(todasMarcadas ? new Set() : new Set(visiveis.filter((l) => !l.novo && !l.excluir).map((l) => l.id)))} title="Marcar todas" /></th>
                    <th className={th} aria-label="Ordem" />
                    <th className={`${th} text-right`}><Titulo col={null} ordem={ordem} onOrdenar={ordenar} title="A ordem das regras: a primeira que pega decide" direita>#</Titulo></th>
                    <th className={th}><Titulo col="palavra" ordem={ordem} onOrdenar={ordenar} title="Em qualquer parte do nome, sem diferenciar maiúscula. * = qualquer coisa, ? = um caractere.">Palavra-chave</Titulo></th>
                    <th className={th}><Titulo col="categoria" ordem={ordem} onOrdenar={ordenar}>Categoria</Titulo></th>
                    <th className={th}><Titulo col="pegou" ordem={ordem} onOrdenar={ordenar} title="Quantos lançamentos do histórico ela classificaria hoje (pela ordem gravada), e o último">Pegou</Titulo></th>
                    <th className={th}>Aviso</th><th className={th} />
                  </tr>
                </thead>
                <tbody ref={arrasto.containerRef}>
                  {grupos ? grupos.map(([k, ls]) => {
                    const cat = catPorId.get(k);
                    const total = ls.reduce((s, l) => s + (uso?.get(l.id)?.pegou ?? 0), 0);
                    return (
                      <Fragment key={k}>
                        <tr>
                          <td colSpan={8} className="border-b border-gray-200 bg-hx-f6f7f8 px-3 py-2">
                            <span className="flex items-center gap-2">
                              {k === IGNORAR ? <span className="h-2.5 w-2.5 rounded-full bg-gray-400" /> : <Bolinha cor={cat?.grupo?.cor} />}
                              <b className="text-[13px] text-gray-800">{k === IGNORAR ? 'Ignorar' : cat?.nome ?? 'Sem categoria'}</b>
                              <span className="text-[11.5px] text-gray-500">{plural(ls.length, 'regra', 'regras')}{uso ? ` · ${plural(total, 'lançamento', 'lançamentos')}` : ''}{cat ? ` · ${cat.grupo.nome}` : k === IGNORAR ? ' · não é gasto' : ''}</span>
                            </span>
                          </td>
                        </tr>
                        {ls.map(linha)}
                      </Fragment>
                    );
                  }) : visiveis.map(linha)}
                  {visiveis.length === 0 && <tr><td colSpan={8} className="px-4 py-8 text-center text-sm text-gray-400">Nenhuma regra com esses filtros.</td></tr>}
                </tbody>
              </table>
            </div>

            {marcadas.size ? (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-blue-200 bg-blue-50 px-4 py-3">
                <span className="text-[12.5px] text-gray-700"><b className="font-semibold">{plural(marcadas.size, 'marcada', 'marcadas')}</b></span>
                <span className="flex-1" />
                <span className="w-[260px]">
                  <SeletorCategoria value={null} onChange={(v) => { muda([...marcadas], daLista(v)); setMarcadas(new Set()); }} categorias={categorias} tipo="saida"
                    extras={EXTRAS_IGNORAR} placeholder="Mudar a categoria…" className="!h-8 text-[12.5px]" />
                </span>
                <button type="button" className="btn-secondary !h-8 !px-3 !text-[12.5px]" onClick={() => { muda([...marcadas], { excluir: true }); setMarcadas(new Set()); }}>Excluir</button>
                <button type="button" onClick={() => setMarcadas(new Set())} className="text-[12px] text-gray-500 underline underline-offset-2 hover:text-gray-800">Desmarcar</button>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-gray-200 bg-hx-f9fafb px-4 py-3">
                <span className="text-[12px] text-gray-500">
                  {nAlt ? <><b className="font-semibold text-hx-92400e">{plural(nAlt, 'alteração', 'alterações')}</b> · ainda não salvo · o que já foi classificado não muda</>
                    : podeArrastar ? 'Arraste ⠿ para mudar a ordem: a primeira regra que pega o nome decide.'
                      : ordem ? <>Ordenada por {ROTULO_ORDEM[ordem.col]}: a prioridade é a do #, e não se arrasta. <button type="button" className="underline underline-offset-2 hover:text-gray-800" onClick={() => ordenar(null)}>Voltar à ordem das regras</button></>
                        : 'Com filtro ou agrupada, a ordem não se arrasta.'}
                </span>
                <span className="flex-1" />
                {nAlt > 0 && <button type="button" className="btn-secondary" onClick={descartar} disabled={salvando}>Descartar</button>}
                <button type="button" className="btn-primary" onClick={salvar} disabled={salvando || !nAlt}>
                  {salvando ? 'Salvando…' : nAlt ? `Salvar alterações (${nAlt})` : 'Salvar alterações'}
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
