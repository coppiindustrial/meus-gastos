import { useMemo, useRef, useState } from 'react';
import Modal from '../Modal.jsx';
import Toggle from '../Toggle.jsx';
import Tooltip from '../Tooltip.jsx';
import CampoTicker from '../rendaVariavel/CampoTicker.jsx';
import { DivisorFaixa, Trilho as TrilhoFaixa } from '../filtros/FaixaFiltros.jsx';
import { CirculoMais, IconExpandirTudo, IconLixeira } from '../icons.jsx';
import { Alca, Seta } from '../PecasCadastro.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { useConfirmacao } from '../../context/ConfirmContext.jsx';
import { gravarAcompanhamento } from '../../api/acompanhamento.js';
import useLinhasAnimadas, { atributosLinha } from '../../lib/useLinhasAnimadas.js';
import { useListaArrastavel } from '../../lib/useListaArrastavel.js';
import { arrastoAgrupado } from '../../lib/arrastoAgrupado.js';
import { semAcento } from '../../lib/buscaLancamentos.js';
import { lsGet, lsSet } from '../../lib/storage.js';
import { CLASSES, TIPOS } from '../../lib/rendaVariavel.js';
import { chaveDe, planoDoAcompanhamento } from '../../lib/acompanhamento.js';

// O QUE ACOMPANHAR (25/11/2026, o mockup "Acompanhamento das ações", o pop-up do ✎): a tabela de formulário dos cadastros.
// EM TRÊS NÍVEIS (25/11/2026, a opção B do mockup "O que acompanhar · hierarquia", a pedido: "a mesma coisa das outras
// listas"): a FAIXA de cima (Da carteira · Só acompanhando), a CLASSE dentro dela (Exterior · FIIs · Ações da B3, a bolinha
// da cor; a classe sem nenhum não aparece) e os ativos; a seta recolhe cada nível, animado (`acomp_fechadas`). O tipo na
// linha é curto ("Ação", "FII"): os grupos dizem o resto. O interruptor "Aparece" também na faixa e na classe: liga ou
// desliga todos dela (pela metade com só alguns — o `misto` do `Toggle`). Desligar só esconde da tela (a carteira não muda;
// sai pelo cadastro dos ativos).
// ACOMPANHAR UMA AÇÃO é a linha "+" no fim de "Só acompanhando" (o "+ Adicionar" dos cadastros; o campo do cabeçalho saiu):
// abre a MESMA busca do cadastro dos ativos (`CampoTicker`, o Yahoo) na própria linha, e a escolhida vai para a classe dela.
// A alça ⠿ ordena os acompanhados DENTRO da classe (`arrastoAgrupado`); a ordem só muda se a pessoa arrastar (`reordenar`
// do `planoDoAcompanhamento`). O cabeçalho num trilho só, o dos cadastros: filtrar | Só os que aparecem | ⇕.
// "Salvar alterações (N)" grava só a diferença (testada). Sem a migration 037, só explica.

const TOPOS = [
  { id: 'cart', nome: 'Da carteira', deCarteira: true, cor: 'var(--serie-gastos)' },
  { id: 'fora', nome: 'Só acompanhando', deCarteira: false, cor: '#9ca3af' },
];
const CURTO = { acao_eua: 'Ação', etf_eua: 'ETF', fii: 'FII', acao_br: 'Ação', bdr: 'BDR', etf_br: 'ETF' };
const CHAVE_FECHADAS = 'acomp_fechadas';
const COLUNAS = 5;
const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
const lerFechadas = () => { try { return new Set(JSON.parse(lsGet(CHAVE_FECHADAS) || '[]')); } catch { return new Set(); } };
const ORDEM_CLASSE = Object.fromEntries(CLASSES.map((c, i) => [c.id, i]));
// os acompanhados na ordem da tela: pela classe, e dentro dela a ordem de antes
const agrupar = (ls) => [...ls.filter((i) => i.deCarteira), ...ls.filter((i) => !i.deCarteira)
  .map((i, k) => [i, k]).sort((a, b) => (ORDEM_CLASSE[a[0].classe] ?? 9) - (ORDEM_CLASSE[b[0].classe] ?? 9) || a[1] - b[1]).map(([i]) => i)];

export default function ModalAcompanhar({ lista, semMigration, onFechar, onSalvo }) {
  const toast = useToast();
  const confirmar = useConfirmacao();
  const [itens, setItens] = useState(() => agrupar(lista.map((i) => ({ ...i }))));
  const [mexeu, setMexeu] = useState(false); // arrastou: a ordem dos acompanhados vira a da lista
  const [filtro, setFiltro] = useState('');
  const [soAparece, setSoAparece] = useState(false);
  const [adicionando, setAdicionando] = useState(false);
  const [busca, setBusca] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [fechadas, setFechadasEstado] = useState(lerFechadas);
  const setFechadas = (f) => setFechadasEstado((antes) => { const n = typeof f === 'function' ? f(antes) : f; lsSet(CHAVE_FECHADAS, JSON.stringify([...n])); return n; });
  const caixaRef = useRef(null);
  const plano = useMemo(() => planoDoAcompanhamento(lista, itens, { reordenar: mexeu }), [lista, itens, mexeu]);
  const nMudancas = plano.criar.length + plano.atualizar.length + plano.apagar.length;
  const mudar = (chave, campo, valor) => setItens((ls) => ls.map((i) => (i.chave === chave ? { ...i, [campo]: valor } : i)));
  const alterada = (i) => {
    const a = lista.find((x) => x.chave === i.chave);
    return !a || a.aparece !== i.aparece || !!i.tirar;
  };
  const abrir = (...ids) => setFechadas((s) => { if (!ids.some((id) => s.has(id))) return s; const n = new Set(s); ids.forEach((id) => n.delete(id)); return n; });

  // escolher na busca: acompanha (o que já está na lista volta a aparecer); a nova vai para a classe dela
  const escolher = (it) => {
    const chave = chaveDe(it.mercado, it.ticker);
    const ja = itens.find((i) => i.chave === chave);
    setBusca('');
    setAdicionando(false);
    if (ja) {
      if (!ja.aparece || ja.tirar) { setItens((ls) => ls.map((i) => (i.chave === chave ? { ...i, aparece: true, tirar: false } : i))); return; }
      toast.info(`${it.ticker} já está ${ja.deCarteira ? 'na carteira' : 'na lista'}.`);
      return;
    }
    const tipo = TIPOS[it.tipo] ? it.tipo : it.mercado === 'EUA' ? 'acao_eua' : 'acao_br';
    const classe = TIPOS[tipo].classe;
    setItens((ls) => agrupar([...ls, { chave, ticker: it.ticker, mercado: it.mercado, nome: it.nome ?? '', tipo, classe, deCarteira: false, ativoId: null, aparece: true, linhaId: null, ordem: 0 }]));
    abrir('fora', `fora-${classe}`);
  };

  // AS LINHAS DA TELA: a faixa, as classes com algum ativo e os ativos; no fim de "Só acompanhando", o "+". Filtrando, tudo
  // aberto e a classe sem nenhum que case some.
  const t = semAcento(filtro).trim();
  const filtrando = !!t || soAparece;
  const casa = (i) => (!soAparece || (i.aparece && !i.tirar)) && (!t || semAcento(`${i.ticker} ${i.nome}`).includes(t));
  const linhas = useMemo(() => TOPOS.flatMap((top) => {
    const doTopo = itens.filter((i) => i.deCarteira === top.deCarteira);
    const rows = [{ id: `t:${top.id}`, tipo: 'topo', top, todos: doTopo.filter((i) => !i.tirar) }];
    CLASSES.forEach((c) => {
      const doC = doTopo.filter((i) => i.classe === c.id);
      const vistos = doC.filter(casa);
      if (!vistos.length) return;
      rows.push({ id: top.deCarteira ? `h:${c.id}` : `g:${c.id}`, tipo: 'classe', top, c, chaveG: `${top.id}-${c.id}`, todos: doC.filter((i) => !i.tirar) });
      vistos.forEach((i) => rows.push({ id: top.deCarteira ? `c:${i.chave}` : `i:${i.chave}`, tipo: 'item', top, c, chaveG: `${top.id}-${c.id}`, i }));
    });
    if (rows.length === 1) rows.push({ id: `v:${top.id}`, tipo: 'vazio', top });
    if (!top.deCarteira && !t) rows.push({ id: 'a:fora', tipo: 'add', top });
    return rows;
  }), [itens, t, soAparece]); // eslint-disable-line react-hooks/exhaustive-deps
  const abertas = useMemo(() => linhas.filter((x) => x.tipo === 'topo' || t
    || (!fechadas.has(x.top.id) && (x.tipo !== 'item' || !fechadas.has(x.chaveG)))), [linhas, fechadas, t]);
  const desenhadas = useLinhasAnimadas(linhas, abertas, caixaRef);
  const grupos = linhas.filter((x) => x.tipo === 'topo' || x.tipo === 'classe').map((x) => (x.tipo === 'topo' ? x.top.id : x.chaveG));
  const tudoAberto = grupos.every((g) => !fechadas.has(g));
  const alternar = (id) => setFechadas((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  // O ARRASTO: só os acompanhados, e só dentro da classe deles (a classe é o mercado e o tipo)
  const idsArrasto = linhas.filter((x) => !x.top.deCarteira && (x.tipo === 'classe' || x.tipo === 'item')).map((x) => x.id);
  const arrastado = useRef(null);
  const arrasto = useListaArrastavel({
    ids: idsArrasto,
    onReordenar: (ids) => {
      if (!arrastado.current || filtrando) return;
      const r = arrastoAgrupado(ids, arrastado.current, idsArrasto);
      if (!r) return;
      const porChave = new Map(itens.map((i) => [i.chave, i]));
      if (r.linhas.some(({ id, grupo }) => porChave.get(id)?.classe !== grupo)) return; // noutra classe: não vale
      const ordem = r.linhas.map(({ id }) => porChave.get(id)).filter(Boolean);
      setItens([...itens.filter((i) => i.deCarteira), ...ordem, ...itens.filter((i) => !i.deCarteira && !ordem.includes(i))]);
      setMexeu(true);
    },
  });
  const alca = (id) => {
    if (filtrando) return null;
    const p = arrasto.alcaProps(id);
    return { ...p, onDragStart: (e) => { arrastado.current = id; p.onDragStart(e); } };
  };

  const salvar = async () => {
    setSalvando(true);
    try {
      await gravarAcompanhamento(plano);
      toast.success('A lista do acompanhamento foi salva.');
      onSalvo();
    } catch (err) {
      toast.error(err.message);
      setSalvando(false);
    }
  };
  const fechar = async () => {
    if (nMudancas && !(await confirmar({ titulo: 'Descartar as alterações?', confirmar: 'Descartar', texto: `${plural(nMudancas, 'alteração não foi salva', 'alterações não foram salvas')}.` }))) return;
    onFechar();
  };

  // o interruptor de um grupo: ligado com todos, desligado com nenhum, pela metade com alguns; mudar vale para todos dele
  const toggleDoGrupo = (todos, rotulo, compacto) => {
    if (!todos.length) return <span className="flex h-8 items-center" />;
    const n = todos.filter((i) => i.aparece).length;
    const chaves = new Set(todos.map((i) => i.chave));
    return (
      <span className="flex h-8 items-center">
        <Toggle compacto={compacto} checked={n === todos.length} misto={n > 0 && n < todos.length} rotulo={rotulo}
          onChange={(v) => setItens((ls) => ls.map((i) => (chaves.has(i.chave) ? { ...i, aparece: v } : i)))} />
      </span>
    );
  };

  const linhaCls = (id, extra = '') => `group/linha transition-[opacity,transform] duration-200 ease-out ${arrasto.dragId === id ? '!opacity-40' : ''} ${extra}`;
  const td = 'border-b border-gray-100 px-2 py-1 align-middle';
  const desenhar = ({ linha: x, estado }) => {
    const attrs = atributosLinha(x.id, estado);
    const noArrasto = idsArrasto.includes(x.id) ? arrasto.itemProps(x.id) : {};
    if (x.tipo === 'topo') {
      const aberto = !!t || !fechadas.has(x.top.id);
      const n = x.todos.length;
      return (
        <tr key={x.id} {...attrs} className={linhaCls(x.id)}>
          <td colSpan={3} className="relative h-[42px] cursor-pointer border-b border-gray-200 bg-hx-f3f4f6 py-0 pl-2.5 pr-3" onClick={() => !t && alternar(x.top.id)}>
            <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-0 w-[3px]" style={{ background: x.top.cor }} />
            <span className="flex items-center gap-2">
              <Seta aberto={aberto} disabled={!!t} onClick={(e) => { e.stopPropagation(); alternar(x.top.id); }} rotulo={aberto ? `Recolher ${x.top.nome}` : `Abrir ${x.top.nome}`} />
              <span className="text-[14px] font-semibold text-gray-900">{x.top.nome}</span>
              <span className="truncate text-[12px] text-gray-500">
                {x.top.deCarteira ? `${plural(n, 'ativo', 'ativos')} · entram sozinhos; o cadastro dos ativos tira` : `${n ? plural(n, 'ativo', 'ativos') : 'nenhum'} · não estão na carteira`}
              </span>
            </span>
          </td>
          <td className="border-b border-gray-200 bg-hx-f3f4f6 px-2 py-0">{toggleDoGrupo(x.todos, `Todos de ${x.top.nome} aparecem`, false)}</td>
          <td className="border-b border-gray-200 bg-hx-f3f4f6" />
        </tr>
      );
    }
    if (x.tipo === 'classe') {
      const aberto = !!t || !fechadas.has(x.chaveG);
      const n = x.todos.length;
      return (
        <tr key={x.id} {...noArrasto} {...attrs} className={linhaCls(x.id)}>
          <td colSpan={3} className="h-[36px] cursor-pointer border-b border-gray-200 bg-hx-f9fafb py-0 pl-[30px] pr-3" onClick={() => !t && alternar(x.chaveG)}>
            <span className="flex items-center gap-2">
              <Seta aberto={aberto} disabled={!!t} onClick={(e) => { e.stopPropagation(); alternar(x.chaveG); }} rotulo={aberto ? `Recolher ${x.c.nome}` : `Abrir ${x.c.nome}`} />
              <span aria-hidden="true" className="h-[8px] w-[8px] shrink-0 rounded-full" style={{ background: x.c.cor }} />
              <span className="text-[13px] font-semibold text-gray-900">{x.c.nome}</span>
              <span className="whitespace-nowrap text-[11.5px] text-gray-500">{plural(n, 'ativo', 'ativos')} · {x.c.mercado} · {x.c.moeda === 'USD' ? 'US$' : 'R$'}</span>
            </span>
          </td>
          <td className="border-b border-gray-200 bg-hx-f9fafb px-2 py-0">{toggleDoGrupo(x.todos, `Todos de ${x.c.nome} aparecem`, true)}</td>
          <td className="border-b border-gray-200 bg-hx-f9fafb" />
        </tr>
      );
    }
    if (x.tipo === 'vazio') {
      return (
        <tr key={x.id} {...attrs}>
          <td colSpan={COLUNAS} className="border-b border-gray-100 py-2.5 pl-[48px] pr-3 text-[12.5px] text-gray-400">
            {filtrando ? 'Nenhum com esse filtro.' : x.top.deCarteira ? 'Nenhum ativo no cadastro.' : 'Nenhuma ação fora da carteira por enquanto.'}
          </td>
        </tr>
      );
    }
    if (x.tipo === 'add') {
      return (
        <tr key={x.id} {...attrs} className="transition-[opacity,transform] duration-200 ease-out">
          <td colSpan={COLUNAS} className="border-b border-gray-100 py-1 pl-[44px] pr-2">
            {adicionando ? (
              <span className="flex items-center gap-2.5 py-0.5"
                onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); setBusca(''); setAdicionando(false); } }}>
                <span className="px-2"><CirculoMais /></span>
                <span className="w-[300px]">
                  <CampoTicker value={busca} onChange={setBusca} onEscolher={escolher} autoFocus placeholder="o ticker ou o nome da empresa"
                    onBlur={() => { if (!busca.trim()) setAdicionando(false); }} />
                </span>
                <span className="text-[11.5px] text-gray-400">escolha na lista · Esc cancela</span>
              </span>
            ) : (
              <button type="button" onClick={() => { setFiltro(''); setSoAparece(false); setAdicionando(true); }}
                className="inline-flex items-center gap-2 rounded-[5px] px-2 py-1.5 text-[12.5px] font-medium text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900">
                <CirculoMais />Acompanhar uma ação
              </button>
            )}
          </td>
        </tr>
      );
    }
    const { i } = x;
    const fora = !x.top.deCarteira;
    return (
      <tr key={x.id} {...noArrasto} {...attrs}
        className={linhaCls(x.id, `hover:bg-hx-f9fafb ${i.tirar ? 'opacity-40' : !i.aparece ? 'opacity-60' : ''}`)}>
        <td className={`${td} pl-[44px]`} style={alterada(i) ? { boxShadow: 'inset 3px 0 0 #f59e0b' } : undefined}>
          <span className="flex items-center gap-1.5">
            <Alca props={fora ? alca(x.id) : null} rotulo="Arraste para mudar a ordem (dentro da classe)" />
            <span className="font-semibold text-gray-900">{i.ticker}</span>
          </span>
        </td>
        <td className={`${td} truncate text-gray-700`}>{i.nome || '—'}</td>
        <td className={`${td} text-gray-500`}>{CURTO[i.tipo] ?? i.tipo}{fora && !i.linhaId ? <span className="ml-1.5 text-[11px] text-hx-92400e">novo</span> : null}</td>
        <td className={td}><span className="flex h-8 items-center"><Toggle compacto checked={i.aparece && !i.tirar} disabled={i.tirar} onChange={(v) => mudar(i.chave, 'aparece', v)} rotulo={`${i.ticker} aparece na tela`} /></span></td>
        <td className={`${td} text-right`}>
          {fora && (
            <Tooltip label={i.tirar ? 'Não tirar' : 'Tirar da lista (ao salvar)'}>
              <button type="button" aria-label={i.tirar ? 'Não tirar' : `Tirar ${i.ticker}`}
                onClick={() => (i.linhaId ? mudar(i.chave, 'tirar', !i.tirar) : setItens((ls) => ls.filter((y) => y.chave !== i.chave)))}
                className={`inline-grid h-[28px] w-[28px] place-items-center rounded-[6px] transition-[opacity,color,background-color] hover:bg-hx-fdeaea hover:text-hx-c0393d focus-visible:opacity-100 ${i.tirar ? 'bg-hx-fdeaea text-hx-c0393d' : 'text-gray-400 opacity-0 group-hover/linha:opacity-100'}`}>
                <IconLixeira className="h-[14px] w-[14px]" />
              </button>
            </Tooltip>
          )}
        </td>
      </tr>
    );
  };

  // O CABEÇALHO NUM TRILHO SÓ, o dos cadastros: filtrar | Só os que aparecem | ⇕
  const SEG = 'inline-flex h-[25px] shrink-0 items-center gap-2 whitespace-nowrap rounded-[3px] px-2 text-[12.5px] transition-colors hover:bg-gray-200';
  const acoes = semMigration ? null : (
    <TrilhoFaixa className="mr-1 shrink-0">
      <label className={`${SEG} w-[200px] cursor-text text-gray-400 hover:bg-transparent`}>
        <svg viewBox="0 0 14 14" className="h-[14px] w-[14px] shrink-0" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
          <circle cx="6" cy="6" r="4.25" /><path d="M9.2 9.2L12 12" />
        </svg>
        <input className="min-w-0 flex-1 bg-transparent text-[12.5px] text-gray-800 outline-none placeholder:text-gray-400" placeholder="Filtrar a lista"
          aria-label="Filtrar a lista" value={filtro} onChange={(e) => setFiltro(e.target.value)} />
        {filtro && (
          <button type="button" onClick={() => setFiltro('')} aria-label="Limpar o filtro" className="shrink-0 rounded-[3px] p-0.5 text-gray-400 hover:bg-gray-200 hover:text-gray-700">
            <svg viewBox="0 0 14 14" className="h-[10px] w-[10px]" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M3.5 3.5l7 7M10.5 3.5l-7 7" /></svg>
          </button>
        )}
      </label>
      <DivisorFaixa />
      <label className={`${SEG} cursor-pointer text-gray-600 hover:text-gray-900`}>
        <Toggle compacto checked={soAparece} onChange={setSoAparece} rotulo="Só os que aparecem" />Só os que aparecem
      </label>
      <DivisorFaixa />
      <Tooltip label={t ? 'Filtrando, tudo fica aberto' : tudoAberto ? 'Recolher tudo' : 'Expandir tudo'}>
        <button type="button" aria-label={tudoAberto ? 'Recolher tudo' : 'Expandir tudo'} disabled={!!t}
          onClick={() => setFechadas(tudoAberto ? new Set(grupos) : new Set())}
          className={`${SEG} w-[30px] justify-center !px-0 text-gray-600 hover:text-gray-900 disabled:opacity-40 disabled:hover:bg-transparent`}>
          <IconExpandirTudo fechar={tudoAberto} />
        </button>
      </Tooltip>
    </TrilhoFaixa>
  );
  const nVisiveis = itens.filter((i) => i.aparece && !i.tirar).length;
  const th = 'h-8 border-b border-gray-200 bg-hx-f9fafb px-2 text-left text-[10.5px] font-semibold uppercase tracking-wide text-gray-500';

  return (
    <Modal open onClose={fechar} title="O que acompanhar" maxWidth="max-w-[1040px]" padding="p-0" acoes={acoes}
      subtitulo={semMigration ? 'falta a migration 037' : `${plural(nVisiveis, 'aparece', 'aparecem')} na tela · os da carteira entram sozinhos`}>
      {semMigration ? (
        <div className="space-y-2 px-5 py-6 text-[13px] text-gray-600">
          <p>Para acompanhar ações fora da carteira e esconder as da carteira, falta a <b>migration 037</b>.</p>
          <p className="text-gray-500">Supabase → SQL Editor → cole <code>supabase/migrations/037_acompanhamento.sql</code> → Run. Até lá, a tela mostra a carteira inteira.</p>
        </div>
      ) : (
        <div ref={caixaRef} className="max-h-[62vh] overflow-auto [scrollbar-gutter:stable]">
          <table className="w-full min-w-[820px] table-fixed border-separate border-spacing-0 text-[12.5px]">
            <colgroup><col style={{ width: 200 }} /><col /><col style={{ width: 120 }} /><col style={{ width: 90 }} /><col style={{ width: 48 }} /></colgroup>
            <thead className="sticky top-0 z-10">
              <tr><th className={`${th} pl-[67px]`}>Ticker</th><th className={th}>Nome</th><th className={th}>Tipo</th><th className={th}>Aparece</th><th className={th} aria-label="Tirar" /></tr>
            </thead>
            <tbody ref={arrasto.containerRef}>
              {desenhadas.map(desenhar)}
            </tbody>
          </table>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-gray-200 bg-hx-f9fafb px-4 py-3">
        <span className="text-[12px] text-gray-500">
          {nMudancas ? <><b className="font-semibold text-hx-92400e">{plural(nMudancas, 'alteração', 'alterações')}</b> · ainda não salvo</>
            : semMigration ? '' : filtrando ? 'Com o filtro ou "Só os que aparecem" a lista está parcial: a alça ⠿ não arrasta.'
              : 'Desligar só esconde da tela · a faixa e a classe ligam ou desligam todos delas · arraste pela ⠿ para ordenar os acompanhados'}
        </span>
        <span className="flex-1" />
        <button type="button" className="btn-secondary" onClick={fechar} disabled={salvando}>Cancelar</button>
        <button type="button" className="btn-primary" disabled={salvando || semMigration || !nMudancas} onClick={salvar}>
          {salvando ? 'Salvando…' : nMudancas ? `Salvar alterações (${nMudancas})` : 'Salvar alterações'}
        </button>
      </div>
    </Modal>
  );
}
