import { Fragment, memo, useEffect, useMemo, useRef, useState } from 'react';
import Modal from './Modal.jsx';
import SelectSimples from './SelectSimples.jsx';
import Toggle from './Toggle.jsx';
import Tooltip from './Tooltip.jsx';
import { DivisorFaixa, Trilho as TrilhoFaixa } from './filtros/FaixaFiltros.jsx';
import { CirculoMais, IconExpandirTudo } from './icons.jsx';
import { Alca, Seta } from './PecasCadastro.jsx';
import { lsGet, lsSet } from '../lib/storage.js';
import { useToast } from '../context/ToastContext.jsx';
import { useConfirmacao } from '../context/ConfirmContext.jsx';
import { atualizarCategoria, atualizarGrupo, excluirCategoria, excluirGrupo, juntarCategoria, salvarCategoria, salvarGrupo, temGastoFixo } from '../api/cadastros.js';
import { comoVemDoResumo } from '../lib/categoriasFixas.js';
import { alteracoes, diferencaCategoria, diferencaGrupo, ficamNoGrupo, totalAlteracoes, validar } from '../lib/cadastroCategorias.js';
import { arrastoAgrupado } from '../lib/arrastoAgrupado.js';
import { CORES_GRUPO } from '../lib/sugestoes.js';
import { competenciaAtual } from '../lib/format.js';
import { useListaArrastavel } from '../lib/useListaArrastavel.js';
import useLinhasAnimadas, { atributosLinha } from '../lib/useLinhasAnimadas.js';

// O CADASTRO DAS CATEGORIAS NUM POP-UP (29/10/2026, opção A do mockup "Categorias · gerir mais fácil"): os grupos e as
// categorias embaixo, numa tabela de FORMULÁRIO. Renomeia, troca o grupo (move), a cor e o tipo do grupo, ativa;
// acrescenta, marca para excluir, e "Salvar alterações (N)" grava só a diferença (as contas em `lib/cadastroCategorias.js`).
// MARCANDO categorias, a barra de baixo vira a de ação: Mover para, Juntar em uma (os lançamentos, fixos e regras
// das outras passam para a que fica — feito ao salvar, com confirmação) e Desativar. Excluir uma categoria com
// lançamentos não dá: o caminho é juntar (ou desativar).
//
// NO JEITO DO CADASTRO DOS INVESTIMENTOS (23/11/2026, o mockup "Cadastros com movimento", a pedido: "deixe o mais próximo
// possível"):
//   · o GRUPO é a FAIXA (`bg-hx-f3f4f6`, a barra da cor dele na borda, o quadradinho da cor que abre as cores, o nome em
//     14px semibold), com a SETA de 20px que recolhe (animado; lembrado em `cadastro_categorias_recolhidos`) e, no fim de cada
//     grupo, "Adicionar categoria em X" (o "+ categoria" no hover da faixa saiu, a pedido); no cabeçalho do pop-up, UM
//     TRILHO SÓ: a busca | Só as ativas | ⇕ | Novo grupo (também na linha do fim — senão só rolando até lá);
//   · a ALÇA ⠿ (no hover, a de `PecasCadastro`) ARRASTA o grupo (com as categorias dele) ou a categoria — solta sob outra
//     faixa, ela muda de grupo (`useListaArrastavel` + `arrastoAgrupado`, a conta do cadastro dos investimentos). Os ▲▼
//     dos grupos saíram. Com busca ou "Só as ativas" a lista é parcial e a alça não arrasta;
//   · os CAMPOS QUIETOS (a tabela `.quieto`): só o texto até o hover da linha ou o foco; a caixa de marcar também só
//     aparece no hover (ou com alguma marcada);
//   · as colunas em GRUPOS (a categoria · uso · como conta).
//
// `qtd`: { categoria_id: lançamentos (todo o histórico) }. `regras`: { categoria_id: regras }.
//
// O GASTO FIXO (16/11/2026, o mockup "Fixos por categoria"; migration 033): a chave marca a categoria cujo gasto é fixo,
// venha de onde vier (o Streaming do cartão, o IPTU no boleto); a do GRUPO marca todas as dele (pela metade quando só
// algumas). Ao lado, o que o app entendeu do histórico (`comoVem`, pela `resumo` — a `resumo_mensal`). As marcadas
// aparecem nos Gastos fixos, no "Já comprometido" e no "Custo fixo". Só nos grupos de gasto.

const TIPOS = [{ value: 'saida', label: 'Gasto' }, { value: 'entrada', label: 'Entrada' }];
const SEM_033 = 'Para marcar o gasto fixo, aplique a migration 033 (supabase/migrations/033_categoria_gasto_fixo.sql) no SQL Editor do Supabase.';
const semAcento = (s) => String(s || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
let seq = 0;
const novoId = () => `novo-${Date.now().toString(36)}-${(seq += 1)}`;
const COLUNAS = 7;

// o que ficou recolhido é lembrado no navegador (só os ids). Buscando, tudo aparece aberto.
const LS_RECOLHIDOS = 'cadastro_categorias_recolhidos';
const lerRecolhidos = () => { try { return new Set(JSON.parse(lsGet(LS_RECOLHIDOS) || '[]')); } catch { return new Set(); } };

// `pos`: a posição ao abrir (a ordem só conta como alteração na lista que a pessoa mexeu — `ordens`).
const doGrupo = (g, pos) => ({ id: g.id, pos, novo: false, excluir: false, orig: g, nome: g.nome, tipo: g.tipo, cor: g.cor });
const daCategoria = (c, pos) => ({ id: c.id, pos, novo: false, excluir: false, juntarEm: null, orig: c, nome: c.nome, grupo_id: c.grupo_id, ativa: c.ativa, gasto_fixo: !!c.gasto_fixo });

// As categorias na ordem dos grupos (a lista já vem por grupo e ordem).
const rascunhoCats = (gruposBanco, categorias) => {
  const ordemG = new Map(gruposBanco.map((g, i) => [g.id, i]));
  return [...categorias].sort((a, b) => (ordemG.get(a.grupo_id) ?? 0) - (ordemG.get(b.grupo_id) ?? 0)).map(daCategoria);
};

export default function ModalCadastroCategorias({ grupos: gruposBanco, categorias, qtd = {}, regras = {}, resumo = [], onFechar, onSalvo }) {
  const toast = useToast();
  const confirmar = useConfirmacao();
  const [grupos, setGrupos] = useState(() => gruposBanco.map(doGrupo));
  const [cats, setCats] = useState(() => rascunhoCats(gruposBanco, categorias));
  const [busca, setBusca] = useState('');
  const [soAtivas, setSoAtivas] = useState(false);
  const [marcadas, setMarcadas] = useState(() => new Set());
  const [juntando, setJuntando] = useState(null); // o id da que fica, enquanto escolhe
  const [corAberta, setCorAberta] = useState(null);
  const [erro, setErro] = useState(null); // { id, campo }
  const [salvando, setSalvando] = useState(false);
  const [recolhidos, setRecolhidosEstado] = useState(lerRecolhidos);
  const setRecolhidos = (s) => { setRecolhidosEstado(s); lsSet(LS_RECOLHIDOS, JSON.stringify([...s])); };
  const abrirGrupo = (id) => { if (recolhidos.has(id)) { const n = new Set(recolhidos); n.delete(id); setRecolhidos(n); } };
  const alternarGrupo = (id) => { const n = new Set(recolhidos); if (n.has(id)) n.delete(id); else n.add(id); setRecolhidos(n); };
  const corpoRef = useRef(null);
  const comFixo = temGastoFixo(categorias);
  const hojeComp = competenciaAtual();
  const como = useMemo(() => comoVemDoResumo(resumo, hojeComp, categorias), [resumo, hojeComp, categorias]);

  // SALVAR NÃO FECHA (30/10/2026, a pedido): a tela recarrega e devolve o banco novo (`grupos`/`categorias`); o
  // rascunho recomeça dele, e a busca, o filtro, os recolhidos e a rolagem ficam como estavam.
  const primeira = useRef(true);
  useEffect(() => {
    if (primeira.current) { primeira.current = false; return; }
    setGrupos(gruposBanco.map(doGrupo));
    setCats(rascunhoCats(gruposBanco, categorias));
    setMarcadas(new Set()); setJuntando(null); setErro(null); setCorAberta(null);
  }, [gruposBanco, categorias]);

  const nomeDe = (id) => cats.find((c) => c.id === id)?.nome || 'a categoria';
  const t = semAcento(busca).trim();
  const filtrando = !!t || soAtivas;
  // As linhas da tabela: a faixa de cada grupo, as categorias dele (filtradas) e o "Adicionar categoria"; no fim, o "Novo
  // grupo". Buscando, o grupo cujo nome casa vem inteiro.
  const linhas = useMemo(() => [...grupos.flatMap((g) => {
    const doG = cats.filter((c) => c.grupo_id === g.id);
    const grupoCasa = t && semAcento(g.nome).includes(t);
    const itens = doG.filter((c) => (!soAtivas || c.ativa || c.novo) && (!t || grupoCasa || c.novo || semAcento(c.nome).includes(t)));
    if (t && !grupoCasa && !itens.length && !g.novo) return [];
    const fechado = !t && recolhidos.has(g.id);
    return [
      { id: `g:${g.id}`, tipo: 'grupo', grupo: g, n: ficamNoGrupo(cats, g.id).length, fechado },
      ...itens.map((c) => ({ id: `c:${c.id}`, tipo: 'cat', cat: c, grupo: g, fechado })),
      ...(filtrando || g.excluir ? [] : [{ id: `a:${g.id}`, tipo: 'add', grupo: g, fechado }]),
    ];
  }), ...(t ? [] : [{ id: 'fim', tipo: 'fim' }])], [grupos, cats, t, soAtivas, filtrando, recolhidos]);
  // RECOLHER ANIMADO (`useLinhasAnimadas`, o do DRE): as linhas de um grupo recolhido continuam montadas e escondidas, e
  // o grupo some/aparece deslizando. O arrasto vê TODAS as linhas.
  const abertas = useMemo(() => linhas.filter((x) => !((x.tipo === 'cat' || x.tipo === 'add') && x.fechado)), [linhas]);
  const desenhadas = useLinhasAnimadas(linhas, abertas, corpoRef);
  const tudoAberto = grupos.every((g) => !recolhidos.has(g.id));
  const alternarTudo = () => setRecolhidos(tudoAberto ? new Set(grupos.map((g) => g.id)) : new Set());

  // O ARRASTO: a lista que o hook move é a das faixas e das categorias; o `arrastoAgrupado` diz o que ficou (o grupo leva
  // as categorias dele; a categoria fica no grupo da faixa acima). A categoria que cai num grupo recolhido o abre.
  const idsArrasto = linhas.filter((x) => x.tipo === 'grupo' || x.tipo === 'cat').map((x) => x.id);
  const arrastado = useRef(null);
  const reordenar = (ids) => {
    if (!arrastado.current) return;
    const r = arrastoAgrupado(ids, arrastado.current, idsArrasto);
    if (!r) return;
    setGrupos((gs) => {
      const nova = r.grupos.map((id) => gs.find((g) => g.id === id)).filter(Boolean);
      return [...nova, ...gs.filter((g) => !nova.includes(g))];
    });
    setCats((cs) => {
      const porId = new Map(cs.map((c) => [c.id, c]));
      const vistas = new Set();
      const out = r.linhas.map(({ id, grupo }) => {
        const c = porId.get(id);
        if (!c) return null;
        vistas.add(id);
        return c.grupo_id === grupo ? c : { ...c, grupo_id: grupo };
      }).filter(Boolean);
      return [...out, ...cs.filter((c) => !vistas.has(c.id))];
    });
    const destino = r.linhas.find(({ id, grupo }) => recolhidos.has(grupo) && cats.find((c) => c.id === id)?.grupo_id !== grupo)?.grupo;
    if (destino) abrirGrupo(destino);
  };
  // o hook chama a versão da ÚLTIMA renderização (as linhas são memoizadas e guardam os ouvintes de quando se desenharam)
  const acoesLinha = useRef(null);
  const arrasto = useListaArrastavel({ ids: idsArrasto, onReordenar: (ids) => acoesLinha.current.reordenar(ids) });

  const alt = useMemo(() => alteracoes(grupos, cats), [grupos, cats]);
  const nAlt = totalAlteracoes(alt);
  const mudaGrupo = (id, campo, v) => { setGrupos((gs) => gs.map((g) => (g.id === id ? { ...g, [campo]: v } : g))); setErro(null); };
  const mudaCat = (id, campo, v) => { setCats((cs) => cs.map((c) => (c.id === id ? { ...c, [campo]: v } : c))); setErro(null); };
  // Mover para outro grupo: vai para o FIM dele (é o que se espera de "mover para"), que se abre se estava recolhido.
  const moverPara = (ids, grupoId) => {
    abrirGrupo(grupoId);
    setCats((cs) => {
      const vao = cs.filter((c) => ids.includes(c.id)).map((c) => ({ ...c, grupo_id: grupoId }));
      const ficam = cs.filter((c) => !ids.includes(c.id));
      const ultimo = ficam.map((c) => c.grupo_id).lastIndexOf(grupoId);
      const at = ultimo < 0 ? ficam.length : ultimo + 1;
      return [...ficam.slice(0, at), ...vao, ...ficam.slice(at)];
    });
  };
  const focar = (id) => setTimeout(() => {
    const el = corpoRef.current?.querySelector(`[data-nome="${id}"]`);
    el?.focus();
    el?.scrollIntoView({ block: 'nearest' });
  }, 40);
  const novaCategoria = (grupoId) => {
    const c = { id: novoId(), novo: true, excluir: false, juntarEm: null, orig: null, nome: '', grupo_id: grupoId, ativa: true, gasto_fixo: false };
    setCats((cs) => {
      const ultimo = cs.map((x) => x.grupo_id).lastIndexOf(grupoId);
      const at = ultimo < 0 ? cs.length : ultimo + 1;
      return [...cs.slice(0, at), c, ...cs.slice(at)];
    });
    setBusca(''); setSoAtivas(false); abrirGrupo(grupoId);
    focar(c.id);
  };
  const novoGrupo = () => {
    const usadas = new Set(grupos.map((g) => g.cor));
    const g = { id: novoId(), novo: true, excluir: false, orig: null, nome: '', tipo: 'saida', cor: CORES_GRUPO.find((c) => !usadas.has(c)) ?? CORES_GRUPO[0] };
    setGrupos((gs) => [...gs, g]);
    setBusca(''); setSoAtivas(false);
    focar(g.id);
  };
  const alternarMarca = (id) => setMarcadas((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const listaMarcadas = cats.filter((c) => marcadas.has(c.id));
  const desmarcar = () => { setMarcadas(new Set()); setJuntando(null); };

  const juntar = () => {
    const fica = juntando;
    setCats((cs) => cs.map((c) => (marcadas.has(c.id) && c.id !== fica ? { ...c, juntarEm: fica } : c)));
    desmarcar();
  };

  const fechar = async () => {
    if (nAlt && !(await confirmar({ titulo: 'Descartar as alterações?', texto: `${plural(nAlt, 'alteração ainda não foi salva', 'alterações ainda não foram salvas')}.`, confirmar: 'Descartar', perigo: true }))) return;
    onFechar();
  };

  const salvar = async () => {
    const problema = validar(grupos, cats);
    if (problema) {
      setErro(problema);
      abrirGrupo(cats.find((c) => c.id === problema.id)?.grupo_id);
      toast.error(`Não salvou — ${problema.motivo}.`);
      return;
    }
    const { gruposNovos, gruposMudados, gruposExcluir, catsNovas, catsMudadas, catsJuntar, catsExcluir, ordens } = alt;
    if (catsJuntar.length || catsExcluir.length || gruposExcluir.length) {
      const partes = [
        ...catsJuntar.map((c) => `"${c.nome}" junta em "${nomeDe(c.juntarEm)}"${qtd[c.id] ? ` (${plural(qtd[c.id], 'lançamento passa', 'lançamentos passam')})` : ''}`),
        ...catsExcluir.map((c) => `exclui "${c.nome}"${regras[c.id] ? (regras[c.id] === 1 ? ' e a regra dela' : ` e as ${regras[c.id]} regras dela`) : ''}`),
        ...gruposExcluir.map((g) => `exclui o grupo "${g.nome}"`),
      ];
      if (!(await confirmar({ titulo: 'Salvar estas alterações?', texto: `${partes.join('; ')}. Juntar e excluir não se desfazem.`, confirmar: 'Salvar', perigo: true }))) return;
    }
    setSalvando(true);
    try {
      // 1) os grupos novos (os ids deles só existem agora) e os mudados
      const real = new Map();
      for (const g of gruposNovos) real.set(g.id, (await salvarGrupo({ ...diferencaGrupo(g, ordens.grupo.get(g.id)) })).id);
      const idReal = (id) => real.get(id) ?? id;
      for (const g of gruposMudados) await atualizarGrupo(g.id, diferencaGrupo(g, ordens.grupo.get(g.id)));
      // 2) as categorias: novas, mudadas, juntadas (move tudo e apaga) e excluídas
      for (const c of catsNovas) await salvarCategoria(diferencaCategoria(c, ordens.categoria.get(c.id), idReal(c.grupo_id)));
      for (const c of catsMudadas) await atualizarCategoria(c.id, diferencaCategoria(c, ordens.categoria.get(c.id), idReal(c.grupo_id)));
      for (const c of catsJuntar) await juntarCategoria(c.id, c.juntarEm);
      for (const c of catsExcluir) await excluirCategoria(c.id);
      // 3) por último, os grupos que saem (já vazios)
      for (const g of gruposExcluir) await excluirGrupo(g.id);
      toast.success(nAlt === 1 ? 'Alteração salva.' : `${nAlt} alterações salvas.`);
    } catch (err) {
      toast.error(/duplicate|unique/i.test(err.message) ? 'Já existe uma categoria ou grupo com esse nome.' : err.message);
      // parte pode ter gravado: o rascunho recomeça do que ficou no banco
    }
    await onSalvo();
    setSalvando(false);
  };

  const opcoesGrupo = useMemo(() => grupos.filter((g) => !g.excluir).map((g) => ({ value: g.id, label: g.nome || '(grupo novo)' })), [grupos]);

  // AS LINHAS SÃO MEMOIZADAS (23/11/2026: recolher e abrir travavam — cada clique redesenhava as ~70 linhas, com o
  // seletor, as chaves e o campo de cada uma, no começo e de novo no fim da animação). Uma linha só se refaz quando
  // muda o que ela mostra; as ações vêm por esta REF, sempre as da última renderização (nada de closure velha), e o
  // arrasto entra com o `dragId` e a ordem (`chave`), que mudam os ouvintes dele.
  acoesLinha.current = {
    alternarGrupo, mudaGrupo, mudaCat, moverPara, alternarMarca, novaCategoria, reordenar,
    arrastar: (id) => { arrastado.current = id; },
    alternarCor: (id) => setCorAberta((a) => (a === id ? null : id)),
    tirarGrupoNovo: (id) => setGrupos((gs) => gs.filter((y) => y.id !== id)),
    tirarCatNova: (id) => setCats((cs) => cs.filter((y) => y.id !== id)),
    manterCat: (id) => setCats((cs) => cs.map((y) => (y.id === id ? { ...y, excluir: false, juntarEm: null } : y))),
    fixoDoGrupo: (id, valor) => setCats((cs) => {
      const doG = new Set(ficamNoGrupo(cs, id));
      return cs.map((c) => (doG.has(c) ? { ...c, gasto_fixo: valor } : c));
    }),
  };
  const doArrasto = { arrasto, arrastando: arrasto.dragId, chave: idsArrasto.join('|') };
  const visiveisN = cats.filter((c) => !c.excluir && !c.juntarEm).length;
  const algumaMarcada = marcadas.size > 0;

  // O CABEÇALHO DO POP-UP NUM TRILHO SÓ (23/11/2026, a opção A do mockup "Cadastros com movimento · cabeçalho", a pedido:
  // a busca, o "Novo grupo" e o ⇕ soltos "não se conversavam"): a busca sem caixa própria | Só as ativas | ⇕ | Novo grupo,
  // separados pelo divisor da faixa de filtros — a mesma altura (31px) e o mesmo cinza.
  const SEG = 'inline-flex h-[25px] shrink-0 items-center gap-2 whitespace-nowrap rounded-[3px] px-2 text-[12.5px] transition-colors hover:bg-gray-200';
  const acoes = (
    <TrilhoFaixa className="mr-1 shrink-0">
      <label className={`${SEG} w-[230px] cursor-text text-gray-400 hover:bg-transparent`}>
        <svg viewBox="0 0 14 14" className="h-[14px] w-[14px] shrink-0" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
          <circle cx="6" cy="6" r="4.25" /><path d="M9.2 9.2L12 12" />
        </svg>
        <input className="min-w-0 flex-1 bg-transparent text-[12.5px] text-gray-800 outline-none placeholder:text-gray-400" placeholder="Buscar categoria ou grupo"
          aria-label="Buscar categoria ou grupo" value={busca} onChange={(e) => setBusca(e.target.value)} />
        {busca && (
          <button type="button" onClick={() => setBusca('')} aria-label="Limpar a busca" className="shrink-0 rounded-[3px] p-0.5 text-gray-400 hover:bg-gray-200 hover:text-gray-700">
            <svg viewBox="0 0 14 14" className="h-[10px] w-[10px]" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M3.5 3.5l7 7M10.5 3.5l-7 7" /></svg>
          </button>
        )}
      </label>
      <DivisorFaixa />
      <label className={`${SEG} cursor-pointer text-gray-600 hover:text-gray-900`}>
        <Toggle compacto checked={soAtivas} onChange={setSoAtivas} rotulo="Só as ativas" />Só as ativas
      </label>
      <DivisorFaixa />
      <Tooltip label={t ? 'Buscando, tudo fica aberto' : tudoAberto ? 'Recolher tudo' : 'Expandir tudo'}>
        <button type="button" aria-label={tudoAberto ? 'Recolher tudo' : 'Expandir tudo'} onClick={alternarTudo} disabled={!!t}
          className={`${SEG} w-[30px] justify-center !px-0 text-gray-600 hover:text-gray-900 disabled:opacity-40 disabled:hover:bg-transparent`}>
          <IconExpandirTudo fechar={tudoAberto} />
        </button>
      </Tooltip>
      <DivisorFaixa />
      <button type="button" onClick={novoGrupo} className={`${SEG} font-semibold text-gray-800 hover:text-gray-900`}>
        <CirculoMais borda="text-gray-500" subir={false} />Novo grupo
      </button>
    </TrilhoFaixa>
  );

  const th = 'h-8 border-b border-gray-200 bg-hx-f9fafb px-2 text-left text-[10.5px] font-semibold uppercase tracking-wide text-gray-500';
  // a linha de cima do cabeçalho: os GRUPOS de colunas, com o traço embaixo (o dos investimentos)
  const thGrupo = (rotulo, n) => (
    <th colSpan={n} className="bg-hx-f9fafb px-2 pb-0 pt-2.5 text-left align-bottom">
      <span className="block border-b border-gray-300 pb-1 text-[10px] font-semibold uppercase tracking-[0.07em] text-gray-600">{rotulo || ' '}</span>
    </th>
  );

  return (
    <Modal open onClose={fechar} title="Cadastro das categorias" maxWidth="max-w-[min(1280px,96vw)]" padding="p-0" acoes={acoes}
      subtitulo={`${plural(grupos.filter((g) => !g.excluir).length, 'grupo', 'grupos')} · ${plural(visiveisN, 'categoria', 'categorias')} · o grupo dá a cor; as categorias recebem os lançamentos`}>
      <div ref={corpoRef} className="max-h-[calc(90vh-150px)] min-h-[240px] overflow-auto [scrollbar-gutter:stable]">
        <table className="quieto w-full min-w-[1130px] table-fixed border-separate border-spacing-0 text-[12.5px]">
          <colgroup>
            <col /><col style={{ width: 200 }} /><col style={{ width: 104 }} /><col style={{ width: 72 }} />
            <col style={{ width: 64 }} /><col style={{ width: 236 }} /><col style={{ width: 112 }} />
          </colgroup>
          <thead className="sticky top-0 z-10">
            <tr>{thGrupo('A categoria', 2)}{thGrupo('Uso', 2)}{thGrupo('Como conta', 2)}{thGrupo('', 1)}</tr>
            <tr>
              <th className={`${th} pl-[82px]`}>Nome</th><th className={`${th} pl-[19px]`}>Grupo / tipo</th>
              <th className={`${th} text-right`} title="Lançamentos em todo o histórico">Lançamentos</th><th className={`${th} text-right`}>Regras</th>
              <th className={th}>Ativa</th>
              <th className={th}>
                <Tooltip label="Tudo o que cai na categoria conta como gasto fixo (nos Gastos fixos e no Já comprometido); ao lado, como ela vem pelo histórico">
                  <span className="cursor-help">Gasto fixo</span>
                </Tooltip>
              </th>
              <th className={th} />
            </tr>
          </thead>
          <tbody ref={arrasto.containerRef}>
            {desenhadas.map(({ linha: x, estado }) => {
              if (x.tipo === 'grupo') {
                const g = x.grupo;
                const mudou = g.novo || (!g.excluir && Object.keys(diferencaGrupo(g, alt.ordens.grupo.get(g.id))).length > 0);
                const doG = ficamNoGrupo(cats, g.id);
                // UM FRAGMENT COM A CHAVE (não uma lista): numa lista sem chave o React casava pela posição, e o grupo que
                // mudava de lugar era desmontado e montado de novo — no meio do arrasto, a alça sumia da página.
                return (
                  <Fragment key={x.id}>
                  <LinhaGrupo id={x.id} g={g} estado={estado} n={x.n} fechado={x.fechado} buscando={!!t} filtrando={filtrando}
                    mudou={mudou} erroNome={erro?.id === g.id && erro.campo === 'nome'} comFixo={comFixo} corAberta={corAberta === g.id}
                    fixos={doG.filter((c) => c.gasto_fixo).length} doG={doG.length} {...doArrasto} acoes={acoesLinha} />
                  {corAberta === g.id && (
                    <tr>
                      <td colSpan={COLUNAS} className="border-b border-gray-100 bg-hx-f9fafb py-2 pl-[82px] pr-4">
                        <span className="flex items-start gap-3">
                          <span className="mt-1 shrink-0 text-[11.5px] text-gray-500">Cor de {g.nome || 'o grupo novo'}:</span>
                          {/* as 24 cores em duas linhas de 12 (as de antes em cima) */}
                          <span className="grid grid-cols-12 gap-2">
                          {CORES_GRUPO.map((cor) => {
                            // a cor de OUTRO grupo leva um pontinho (pode repetir, mas fica à vista)
                            const de = grupos.find((y) => y !== g && !y.excluir && y.cor === cor);
                            return (
                              <button key={cor} type="button" aria-label={`Cor ${cor}${de ? ` (em uso: ${de.nome})` : ''}`} title={de ? `Em uso: ${de.nome}` : undefined}
                                onClick={() => { mudaGrupo(g.id, 'cor', cor); setCorAberta(null); }}
                                className={`flex h-6 w-6 items-center justify-center rounded-md transition ${g.cor === cor ? 'ring-2 ring-gray-800 ring-offset-2' : 'hover:scale-110'}`} style={{ background: cor }}>
                                {de && <span className="h-[6px] w-[6px] rounded-full bg-white/70" aria-hidden="true" />}
                              </button>
                            );
                          })}
                          </span>
                        </span>
                      </td>
                    </tr>
                  )}
                  </Fragment>
                );
              }
              if (x.tipo === 'add') {
                return (
                  <tr key={x.id} {...atributosLinha(x.id, estado)} className="transition-[opacity,transform] duration-200 ease-out">
                    <td colSpan={COLUNAS} className="border-b border-gray-100 py-1 pl-[84px] pr-2">
                      <button type="button" onClick={() => novaCategoria(x.grupo.id)}
                        className="inline-flex items-center gap-2 rounded-[5px] px-2 py-1.5 text-[12.5px] font-medium text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900">
                        <CirculoMais />Adicionar categoria{x.grupo.nome.trim() ? ` em ${x.grupo.nome.trim()}` : ''}
                      </button>
                    </td>
                  </tr>
                );
              }
              if (x.tipo === 'fim') {
                return (
                  <tr key={x.id} {...atributosLinha(x.id, estado)} className="transition-[opacity,transform] duration-200 ease-out">
                    <td colSpan={COLUNAS} className="px-2 py-2.5">
                      <span className="flex items-center gap-2">
                        <button type="button" onClick={novoGrupo}
                          className="inline-flex items-center gap-2 rounded-[5px] px-2 py-1.5 text-[12.5px] font-semibold text-gray-700 transition-colors hover:bg-gray-100 hover:text-gray-900">
                          <CirculoMais borda="text-gray-500" />Novo grupo
                        </button>
                        <span className="text-[12px] leading-none text-gray-400">junta as categorias e dá a cor delas (Casa, Lazer, Renda…)</span>
                      </span>
                    </td>
                  </tr>
                );
              }
              const c = x.cat;
              const sai = c.excluir || !!c.juntarEm;
              const mudou = c.novo || (!sai && Object.keys(diferencaCategoria(c, alt.ordens.categoria.get(c.id))).length > 0);
              return (
                <LinhaCategoria key={x.id} id={x.id} c={c} estado={estado} tipoGrupo={x.grupo.tipo} marcada={marcadas.has(c.id)} algumaMarcada={algumaMarcada}
                  erroNome={erro?.id === c.id && erro.campo === 'nome'} filtrando={filtrando} mudou={mudou} n={qtd[c.id] ?? 0} nRegras={regras[c.id] ?? 0}
                  comFixo={comFixo} como={como.get(c.id)} opcoesGrupo={opcoesGrupo} nomeJunta={c.juntarEm ? nomeDe(c.juntarEm) : null}
                  {...doArrasto} acoes={acoesLinha} />
              );
            })}
            {!linhas.some((x) => x.tipo === 'grupo') && <tr><td colSpan={COLUNAS} className="px-4 py-8 text-center text-sm text-gray-400">Nada com “{busca.trim()}”.</td></tr>}
          </tbody>
        </table>
      </div>

      {/* O RODAPÉ: com categorias marcadas, a barra de AÇÃO (mover, juntar, desativar); sem, o resumo e o salvar. */}
      {listaMarcadas.length ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-blue-200 bg-blue-50 px-4 py-3">
          <span className="min-w-0 text-[12.5px] text-gray-700">
            <b className="font-semibold">{plural(listaMarcadas.length, 'marcada', 'marcadas')}</b>
            <span className="ml-1.5 text-gray-500">{listaMarcadas.slice(0, 3).map((c) => c.nome).join(' · ')}{listaMarcadas.length > 3 ? ` +${listaMarcadas.length - 3}` : ''}</span>
          </span>
          <span className="flex-1" />
          {juntando ? (
            <>
              <span className="text-[12.5px] text-gray-600">Fica:</span>
              <SelectSimples value={juntando} onChange={setJuntando} opcoes={listaMarcadas.map((c) => ({ value: c.id, label: c.nome }))} compacto className="w-[220px]" />
              <button type="button" className="btn-primary !h-8 !px-3 !text-[12.5px]" onClick={juntar}>Juntar {listaMarcadas.length}</button>
              <button type="button" className="btn-secondary !h-8 !px-3 !text-[12.5px]" onClick={() => setJuntando(null)}>Voltar</button>
            </>
          ) : (
            <>
              <SelectSimples value="" onChange={(v) => { moverPara([...marcadas], v); desmarcar(); }} opcoes={opcoesGrupo} placeholder="Mover para…" compacto className="w-[180px]" />
              <button type="button" className="btn-secondary !h-8 !px-3 !text-[12.5px]" disabled={listaMarcadas.length < 2}
                title={listaMarcadas.length < 2 ? 'Marque duas ou mais' : 'Os lançamentos, fixos e regras das outras passam para a que fica'}
                onClick={() => setJuntando([...listaMarcadas].sort((a, b) => (qtd[b.id] ?? 0) - (qtd[a.id] ?? 0))[0].id)}>Juntar em uma…</button>
              <button type="button" className="btn-secondary !h-8 !px-3 !text-[12.5px]"
                onClick={() => { const ativar = listaMarcadas.every((c) => !c.ativa); setCats((cs) => cs.map((c) => (marcadas.has(c.id) ? { ...c, ativa: ativar } : c))); desmarcar(); }}>
                {listaMarcadas.every((c) => !c.ativa) ? 'Ativar' : 'Desativar'}
              </button>
              <button type="button" onClick={desmarcar} className="text-[12px] text-gray-500 underline underline-offset-2 hover:text-gray-800">Desmarcar</button>
            </>
          )}
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-gray-200 bg-hx-f9fafb px-4 py-3">
          <span className="text-[12px] text-gray-500">
            {nAlt ? <><b className="font-semibold text-hx-92400e">{plural(nAlt, 'alteração', 'alterações')}</b> · ainda não salvo</>
              : filtrando ? 'Com a busca ou "Só as ativas" a lista está parcial: a alça ⠿ não arrasta.'
                : 'Arraste pela ⠿ para mudar a ordem ou o grupo (o grupo leva as categorias) · marque categorias para mover, juntar ou desativar várias'}
          </span>
          <span className="flex-1" />
          <button type="button" className="btn-secondary" onClick={fechar} disabled={salvando}>Cancelar</button>
          <button type="button" className="btn-primary" onClick={salvar} disabled={salvando || !nAlt}>
            {salvando ? 'Salvando…' : nAlt ? `Salvar alterações (${nAlt})` : 'Salvar alterações'}
          </button>
        </div>
      )}
    </Modal>
  );
}

// AS LINHAS DA TABELA, MEMOIZADAS: só se refazem quando um valor que elas mostram muda. O `arrasto` (um objeto novo a
// cada renderização) fica de fora da comparação — o que muda os ouvintes dele (`arrastando`, `chave`) está nela.
const igualSemArrasto = (a, b) => Object.keys(a).every((k) => k === 'arrasto' || a[k] === b[k]);
const TD = 'border-b border-gray-100 px-2 py-1.5 align-middle';
const TDG = 'h-[46px] border-b border-gray-200 bg-hx-f3f4f6 py-0';
const BORDA_ERRO = '!border-hx-e5484d';
// a alça com o "quem está sendo arrastado" (o `arrastoAgrupado` precisa saber se é um grupo ou uma categoria)
const alcaDe = (arrasto, acoes, id) => {
  const p = arrasto.alcaProps(id);
  return { ...p, onDragStart: (e) => { acoes.current.arrastar(id); p.onDragStart(e); } };
};
const linhaCls = (id, arrastando, extra = '') => `group/linha transition-[opacity,transform] duration-200 ease-out ${arrastando === id ? '!opacity-40' : ''} ${extra}`;

const LinhaGrupo = memo(({ id, g, estado, n, fechado, buscando, filtrando, mudou, erroNome, comFixo, corAberta, fixos, doG, arrastando, arrasto, acoes }) => {
  const todos = fixos === doG;
  const nome = g.nome || 'o grupo novo';
  return (
    <tr {...arrasto.itemProps(id)} {...atributosLinha(id, estado)} className={linhaCls(id, arrastando, g.excluir ? 'opacity-45' : '')}>
      <td className={`${TDG} relative pl-1.5 pr-2`} style={mudou && !g.excluir ? { boxShadow: 'inset 3px 0 0 #f59e0b' } : undefined}>
        {!(mudou && !g.excluir) && <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-0 w-[3px]" style={{ background: g.cor }} />}
        <span className="flex items-center gap-1">
          <Alca props={filtrando ? null : alcaDe(arrasto, acoes, id)} rotulo="Arraste para mudar a ordem dos grupos (as categorias vão junto)" />
          <Seta aberto={!fechado} onClick={() => acoes.current.alternarGrupo(g.id)} disabled={buscando} rotulo={fechado ? `Abrir ${nome}` : `Recolher ${nome}`} />
          <Tooltip label="Cor do grupo">
            <button type="button" onClick={() => acoes.current.alternarCor(g.id)} disabled={g.excluir} aria-label={`Cor de ${nome}`} aria-expanded={corAberta}
              className="mx-1 h-[14px] w-[14px] shrink-0 rounded-[4px] ring-1 ring-black/10 transition-transform hover:scale-125" style={{ background: g.cor }} />
          </Tooltip>
          <input data-nome={g.id} className={`input !h-8 !w-[280px] !px-2 text-[14px] font-semibold ${g.excluir ? 'line-through' : ''} ${erroNome ? BORDA_ERRO : ''}`} disabled={g.excluir}
            value={g.nome} placeholder="Nome do grupo" aria-label="Nome do grupo" onChange={(e) => acoes.current.mudaGrupo(g.id, 'nome', e.target.value)} />
          {g.novo && <span className="shrink-0 rounded-[4px] bg-hx-dcfce7 px-1.5 py-0.5 text-[11px] font-semibold text-hx-166534">novo grupo</span>}
          <span className="shrink-0 whitespace-nowrap pl-1 text-[11.5px] text-gray-500">{plural(n, 'categoria', 'categorias')}</span>
        </span>
      </td>
      <td className={`${TDG} px-1.5`}>
        <SelectSimples value={g.tipo} onChange={(v) => acoes.current.mudaGrupo(g.id, 'tipo', v)} opcoes={TIPOS} disabled={g.excluir} compacto />
      </td>
      <td className={TDG} colSpan={3} />
      <td className={`${TDG} px-2`}>
        {g.tipo === 'saida' && !g.excluir && n > 0 && (
          <span className="flex items-center gap-2 text-[11.5px] text-gray-500" title={comFixo ? 'Marca ou desmarca todas as categorias do grupo' : SEM_033}>
            <Toggle compacto checked={todos} misto={fixos > 0 && !todos} disabled={!comFixo} rotulo={`O grupo ${g.nome} é gasto fixo`}
              onChange={() => acoes.current.fixoDoGrupo(g.id, !todos)} />
            {todos ? 'o grupo inteiro' : fixos ? `${fixos} de ${doG}` : ''}
          </span>
        )}
      </td>
      <td className={`${TDG} pr-2`}>
        {/* o "+ categoria" que aparecia no hover saiu (23/11/2026, a pedido): a categoria nova entra pelo "Adicionar
            categoria em X", no fim do grupo */}
        <span className="flex items-center justify-end gap-0.5">
          <BotaoLixo marcado={g.excluir} bloqueado={n > 0 && !g.excluir} titulo={n > 0 ? 'Só sai o grupo vazio: mova as categorias antes' : g.excluir ? 'Não excluir' : g.novo ? 'Tirar o grupo novo' : 'Excluir o grupo (ao salvar)'}
            onClick={() => (g.novo ? acoes.current.tirarGrupoNovo(g.id) : acoes.current.mudaGrupo(g.id, 'excluir', !g.excluir))} />
        </span>
      </td>
    </tr>
  );
}, igualSemArrasto);

const LinhaCategoria = memo(({ id, c, estado, tipoGrupo, marcada, algumaMarcada, erroNome, filtrando, mudou, n, nRegras, comFixo, como, opcoesGrupo, nomeJunta, arrastando, arrasto, acoes }) => {
  const sai = c.excluir || !!c.juntarEm;
  return (
    // A classe de transição é obrigatória para o FLIP do arraste (os vizinhos deslizam).
    <tr {...arrasto.itemProps(id)} {...atributosLinha(id, estado)}
      className={linhaCls(id, arrastando, `${sai ? 'opacity-50' : ''} ${marcada ? 'bg-blue-50' : 'hover:bg-hx-f9fafb'}`)}>
      <td className={`${TD} pl-[44px]`} style={mudou && !sai ? { boxShadow: 'inset 3px 0 0 #f59e0b' } : undefined}>
        <span className="flex items-center gap-1">
          <span className="flex w-[18px] shrink-0 justify-center">
            {!c.novo && !sai && (
              <input type="checkbox" checked={marcada} onChange={() => acoes.current.alternarMarca(c.id)} aria-label={`Marcar ${c.nome}`}
                className={`h-3.5 w-3.5 cursor-pointer accent-gray-800 transition-opacity focus-visible:opacity-100 ${marcada || algumaMarcada ? '' : 'opacity-0 group-hover/linha:opacity-100'}`} />
            )}
          </span>
          <Alca props={filtrando || sai ? null : alcaDe(arrasto, acoes, id)} rotulo="Arraste para mudar a ordem (ou solte sob outro grupo)" />
          <input data-nome={c.id} className={`input !h-8 !px-2 text-[13px] font-medium ${sai ? 'line-through' : ''} ${!c.ativa && !sai ? 'text-gray-400' : ''} ${erroNome ? BORDA_ERRO : ''}`}
            disabled={sai} value={c.nome} placeholder="Nome da categoria" aria-label="Nome da categoria" onChange={(e) => acoes.current.mudaCat(c.id, 'nome', e.target.value)} />
          {nomeJunta && <span className="shrink-0 whitespace-nowrap rounded-[4px] bg-hx-fef3c7 px-1.5 py-0.5 text-[11px] font-semibold text-hx-92400e">junta em {nomeJunta}</span>}
          {c.novo && <span className="shrink-0 rounded-[4px] bg-hx-dcfce7 px-1.5 py-0.5 text-[11px] font-semibold text-hx-166534">nova</span>}
        </span>
      </td>
      <td className={`${TD} !px-1.5`}>
        {sai ? <span className="px-2 text-gray-400">—</span>
          : <SelectSimples value={c.grupo_id} onChange={(v) => acoes.current.moverPara([c.id], v)} opcoes={opcoesGrupo} compacto />}
      </td>
      <td className={`${TD} text-right tabular-nums text-gray-600`}>{n || <span className="text-gray-300">—</span>}</td>
      <td className={`${TD} text-right tabular-nums text-gray-500`}>{nRegras || <span className="text-gray-300">—</span>}</td>
      <td className={TD}><Toggle compacto checked={c.ativa} disabled={sai} onChange={(v) => acoes.current.mudaCat(c.id, 'ativa', v)} rotulo={`${c.nome} ativa`} /></td>
      <td className={`${TD} ${c.gasto_fixo && !sai ? 'bg-hx-fffbeb' : ''}`}>
        {tipoGrupo === 'saida' && (
          <span className="flex min-w-0 items-center gap-2" title={comFixo ? undefined : SEM_033}>
            <Toggle compacto checked={c.gasto_fixo} disabled={sai || !comFixo} onChange={(v) => acoes.current.mudaCat(c.id, 'gasto_fixo', v)} rotulo={`${c.nome} é gasto fixo`} />
            <span className={`truncate text-[11.5px] ${c.gasto_fixo && !sai ? 'text-hx-92400e' : 'text-gray-400'}`} title={como ? `Pelo histórico: ${como}` : undefined}>
              {como ?? (c.novo ? '' : 'sem gasto')}
            </span>
          </span>
        )}
      </td>
      <td className={`${TD} pr-2 text-right`}>
        <BotaoLixo marcado={sai} bloqueado={!sai && n > 0}
          titulo={sai ? 'Não excluir / não juntar' : n > 0 ? `Tem ${plural(n, 'lançamento', 'lançamentos')}: marque e junte com outra, ou desative` : 'Excluir (ao salvar)'}
          onClick={() => {
            if (c.novo) acoes.current.tirarCatNova(c.id);
            else if (sai) acoes.current.manterCat(c.id);
            else acoes.current.mudaCat(c.id, 'excluir', true);
          }} />
      </td>
    </tr>
  );
}, igualSemArrasto);

const Ico = ({ children }) => (
  <svg viewBox="0 0 24 24" className="h-[14px] w-[14px]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
);
function BotaoLixo({ marcado, bloqueado, titulo, onClick }) {
  return (
    <button type="button" onClick={onClick} disabled={bloqueado} title={titulo} aria-label={titulo}
      className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[4px] transition-colors duration-[120ms] disabled:cursor-not-allowed disabled:opacity-30 ${
        marcado ? 'bg-hx-fdeaea text-hx-c0393d' : 'text-gray-400 enabled:hover:bg-hx-fdeaea enabled:hover:text-hx-c0393d'}`}>
      {marcado ? <Ico><path d="M9 14L4 9l5-5" /><path d="M4 9h11a5 5 0 0 1 0 10h-3" /></Ico> : <Ico><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></Ico>}
    </button>
  );
}
