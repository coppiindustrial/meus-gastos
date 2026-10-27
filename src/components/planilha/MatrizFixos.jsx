import { Fragment, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import MenuContexto from '../MenuContexto.jsx';
import BalaoGrafico, { useBalao } from '../graficos/BalaoGrafico.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { useConfirmacao } from '../../context/ConfirmContext.jsx';
import { atualizarCampos, buscarPorIds, excluirLancamentos, restaurarLancamentos } from '../../api/lancamentos.js';
import { excluirRecorrencia, lancarFixo, salvarRecorrencia } from '../../api/fixos.js';
import { faixaDe, lerBloco, naFaixa } from '../../lib/planilha.js';
import { formatBRL, parseValor, valorParaCampo } from '../../lib/dinheiro.js';
import { addMeses, competenciaCurta, nomeCompetencia } from '../../lib/format.js';
import { lsSet } from '../../lib/storage.js';
import posicionarPopover from '../../lib/posicionarPopover.js';
import useEscape from '../../lib/useEscape.js';
import {
  IcoAbrir, IcoColar, IcoCopiar, IcoDesfazer, IcoEtiqueta, IcoLixeira, IcoRefazer, IcoRevisado,
} from './iconesMenu.jsx';

// A MATRIZ DOS GASTOS FIXOS (a opção B do mockup): uma linha por gasto fixo, uma coluna por mês do ano,
// como uma aba da planilha. As células saem de `matrizDoAno` (lib/fixos.js): lançado, a lançar (com o
// valor sugerido em cinza), futuro e fora da vigência (hachurado).
//
// O TECLADO É O DA GRADE DOS LANÇAMENTOS: setas andam, Shift estende a faixa, digitar edita, Enter grava
// e desce. Gravar numa célula A LANÇAR (ou futura) LANÇA o fixo naquele mês com o valor digitado; numa
// lançada, corrige o valor daquele lançamento. Ctrl+Enter lança todas as pendentes da seleção com o valor
// sugerido; Delete exclui os lançamentos da seleção; Ctrl+V cola valores do Excel; Ctrl+Z / Ctrl+Y
// desfazem e refazem (excluir e desfazer devolve o lançamento com o MESMO id). O botão direito (e
// Shift+F10) abre o menu; o da coluna do nome é o do cadastro.
//
// `matriz`: { comps, linhas, totais }. `setLancs`: a lista de lançamentos de fixos da página (a matriz
// é recalculada dela). `modo`: 'valor' | 'variacao'.

const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
const pct = (atual, antes) => (antes ? Math.round(((atual - antes) / antes) * 100) : null);

export default function MatrizFixos({ matriz, hoje, setLancs, modo, onEditar, onRecarregar }) {
  const toast = useToast();
  const confirmar = useConfirmacao();
  const navigate = useNavigate();
  const caixaRef = useRef(null);
  const { comps, linhas, totais } = matriz;
  const n = linhas.length;
  const colHoje = comps.indexOf(hoje);
  const [sel, setSel] = useState({ r: 0, c: Math.max(0, colHoje) });
  const [ext, setExt] = useState(null);
  const [editor, setEditor] = useState(null); // { r, c, texto }
  const [menu, setMenu] = useState(null);
  const [gravando, setGravando] = useState(new Set()); // "r|c" sendo lançadas
  const [pilha, setPilha] = useState({ desfazer: [], refazer: [] });
  const arrasto = useRef(false);
  const fechou = useRef(false); // o campo já gravou (Enter/Tab): o blur que vem depois não grava de novo
  const fila = useRef(Promise.resolve());
  const balao = useBalao(270, 150);
  const [destaque, setDestaque] = useState(null); // a marca da legenda acesa ('lancado', 'pendente'…)

  const faixa = faixaDe(sel, ext ?? sel);
  const multi = faixa.r0 !== faixa.r1 || faixa.c0 !== faixa.c1;
  const celula = (r, c) => linhas[r]?.celulas[c];
  const focar = () => caixaRef.current?.focus({ preventScroll: true });
  const enfileirar = (fn) => { fila.current = fila.current.then(fn, fn); return fila.current; };
  const falhou = (err) => {
    toast.error(/duplicate|unique/i.test(err.message) ? 'Este fixo já foi lançado neste mês.' : err.message);
    onRecarregar();
  };
  const empilhar = (acao) => setPilha((p) => ({ desfazer: [...p.desfazer, acao].slice(-100), refazer: [] }));
  const noMes = (l) => ({ ...l, competencia: String(l.competencia).slice(0, 7) });
  const enxuto = (l) => ({ id: l.id, recorrencia_id: l.recorrencia_id, competencia: String(l.competencia).slice(0, 7), data: l.data, valor_centavos: l.valor_centavos });

  useEffect(() => {
    if (sel.r > Math.max(0, n - 1)) setSel((s) => ({ ...s, r: Math.max(0, n - 1) }));
  }, [n, sel.r]);
  useLayoutEffect(() => {
    caixaRef.current?.querySelector(`[data-cel="${sel.r}:${sel.c}"]`)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [sel.r, sel.c]);

  // ------------------------------------------------------------ gravar

  // As mudanças: [{ r, c, valor }]. Célula lançada → corrige; a lançar ou futura → lança; fora → pula.
  const aplicar = (mudancas, rotulo) => {
    const corrigir = [];
    const lancar = [];
    let fora = 0;
    mudancas.forEach(({ r, c, valor }) => {
      const cel = celula(r, c);
      if (!cel) return;
      if (cel.estado === 'lancado') { if (cel.valor !== valor) corrigir.push({ id: cel.lancamento.id, antes: { valor_centavos: cel.valor }, depois: { valor_centavos: valor } }); }
      else if (cel.estado === 'fora') fora += 1;
      else lancar.push({ r, c, rec: linhas[r].rec, comp: cel.comp, valor });
    });
    if (fora) toast.info(`${plural(fora, 'célula está', 'células estão')} fora da vigência: ajuste o início ou o fim no cadastro (Shift+F2).`);
    if (!corrigir.length && !lancar.length) return;
    const m = new Map(corrigir.map((e) => [e.id, e.depois.valor_centavos]));
    if (corrigir.length) setLancs((ls) => ls.map((l) => (m.has(l.id) ? { ...l, valor_centavos: m.get(l.id) } : l)));
    setGravando((g) => new Set([...g, ...lancar.map((x) => `${x.r}|${x.c}`)]));
    enfileirar(async () => {
      try {
        await Promise.all(corrigir.map((e) => atualizarCampos(e.id, e.depois)));
        const criados = [];
        for (const x of lancar) criados.push(noMes(await lancarFixo(x.rec, x.comp, x.valor)));
        if (criados.length) setLancs((ls) => [...ls, ...criados.map(enxuto)]);
        const partes = [];
        if (corrigir.length) partes.push({ tipo: 'valor', itens: corrigir });
        if (criados.length) partes.push({ tipo: 'criar', registros: criados });
        empilhar({ rotulo, partes });
        if (criados.length) toast.success(criados.length === 1 ? `${lancar[0].rec.descricao} lançado em ${competenciaCurta(lancar[0].comp)}.` : `${criados.length} gastos fixos lançados.`);
      } catch (err) { falhou(err); } finally {
        setGravando((g) => { const s = new Set(g); lancar.forEach((x) => s.delete(`${x.r}|${x.c}`)); return s; });
      }
    });
  };

  const executarParte = async (parte, sentido) => {
    if (parte.tipo === 'valor') {
      const vals = parte.itens.map((e) => [e.id, (sentido === 'desfazer' ? e.antes : e.depois).valor_centavos]);
      await Promise.all(vals.map(([id, v]) => atualizarCampos(id, { valor_centavos: v })));
      const m = new Map(vals);
      setLancs((ls) => ls.map((l) => (m.has(l.id) ? { ...l, valor_centavos: m.get(l.id) } : l)));
      return;
    }
    const tirar = (parte.tipo === 'criar') === (sentido === 'desfazer');
    const ids = parte.registros.map((l) => l.id);
    if (tirar) {
      await excluirLancamentos(ids);
      setLancs((ls) => ls.filter((l) => !ids.includes(l.id)));
    } else {
      const voltaram = await restaurarLancamentos(parte.registros);
      setLancs((ls) => [...ls, ...voltaram.map(enxuto)]);
    }
  };

  const andarPilha = (sentido) => {
    const de = sentido === 'desfazer' ? 'desfazer' : 'refazer';
    const para = sentido === 'desfazer' ? 'refazer' : 'desfazer';
    const acao = pilha[de][pilha[de].length - 1];
    if (!acao) return;
    setPilha((p) => ({ ...p, [de]: p[de].slice(0, -1) }));
    enfileirar(async () => {
      try {
        const ordem = sentido === 'desfazer' ? [...acao.partes].reverse() : acao.partes;
        for (const parte of ordem) await executarParte(parte, sentido);
        setPilha((p) => ({ ...p, [para]: [...p[para], acao] }));
        toast.success(`${sentido === 'desfazer' ? 'Desfeito' : 'Refeito'}: ${acao.rotulo}.`);
      } catch (err) { falhou(err); }
    });
  };

  // ------------------------------------------------------------ ações

  const celulasDa = (f, estado) => {
    const out = [];
    for (let r = f.r0; r <= f.r1; r++) for (let c = f.c0; c <= f.c1; c++) { const cel = celula(r, c); if (cel && (!estado || cel.estado === estado)) out.push({ r, c, cel }); }
    return out;
  };

  const lancarPendentes = (f = faixa) => {
    const pend = celulasDa(f, 'pendente').filter((x) => x.cel.sugerido > 0);
    if (!pend.length) { toast.info('Nada a lançar na seleção (sem pendentes com valor sugerido).'); return; }
    aplicar(pend.map(({ r, c, cel }) => ({ r, c, valor: cel.sugerido })), `lançar ${plural(pend.length, 'fixo', 'fixos')}`);
  };

  const excluirLancados = async () => {
    const alvo = celulasDa(faixa, 'lancado');
    if (!alvo.length) return;
    const ok = await confirmar({
      titulo: alvo.length === 1 ? `Excluir o lançamento de ${linhas[alvo[0].r].rec.descricao} em ${competenciaCurta(alvo[0].cel.comp)}?` : `Excluir ${alvo.length} lançamentos de gastos fixos?`,
      texto: 'O mês volta a ficar "a lançar". Dá para desfazer com Ctrl+Z enquanto a tela estiver aberta.',
      confirmar: 'Excluir', perigo: true,
    });
    focar();
    if (!ok) return;
    const ids = alvo.map((x) => x.cel.lancamento.id);
    enfileirar(async () => {
      try {
        const registros = await buscarPorIds(ids);
        await excluirLancamentos(ids);
        setLancs((ls) => ls.filter((l) => !ids.includes(l.id)));
        empilhar({ rotulo: `excluir ${plural(ids.length, 'lançamento', 'lançamentos')}`, partes: [{ tipo: 'excluir', registros }] });
      } catch (err) { falhou(err); }
    });
  };

  const textoFaixa = () => {
    const out = [];
    for (let r = faixa.r0; r <= faixa.r1; r++) {
      const cols = [];
      for (let c = faixa.c0; c <= faixa.c1; c++) { const cel = celula(r, c); cols.push(cel?.estado === 'lancado' ? valorParaCampo(cel.valor) : ''); }
      out.push(cols.join('\t'));
    }
    return out.join('\n');
  };

  const colar = (texto) => {
    const matrizTxt = lerBloco(texto);
    const mudancas = [];
    let invalidos = 0;
    matrizTxt.forEach((cols, i) => cols.forEach((t, j) => {
      if (!t) return;
      const v = parseValor(t);
      const r = faixa.r0 + i;
      const c = faixa.c0 + j;
      if (r >= n || c > 11) return;
      if (!v) { invalidos += 1; return; }
      mudancas.push({ r, c, valor: Math.abs(v) });
    }));
    if (invalidos) toast.info(`${plural(invalidos, 'célula colada não é', 'células coladas não são')} valor e ficou de fora.`);
    aplicar(mudancas, `colar ${plural(mudancas.length, 'valor', 'valores')}`);
  };

  const encerrar = async (rec, comp) => {
    const fim = `${addMeses(comp, -1)}-01`;
    if (fim < rec.inicio) { toast.info('Este é o primeiro mês do gasto fixo: para tirá-lo, exclua o cadastro.'); return; }
    try {
      await salvarRecorrencia({ ...rec, fim });
      toast.success(`${rec.descricao} encerrado: o último mês é ${competenciaCurta(addMeses(comp, -1))}.`);
      onRecarregar();
    } catch (err) { toast.error(err.message); }
  };

  const excluirCadastro = async (rec) => {
    const ok = await confirmar({ titulo: `Excluir o gasto fixo "${rec.descricao}"?`, texto: 'Os lançamentos que ele já gerou continuam. Se só parou de pagar, prefira "Encerrar a partir de…".', confirmar: 'Excluir', perigo: true });
    if (!ok) return;
    try { await excluirRecorrencia(rec.id); toast.success('Gasto fixo excluído.'); onRecarregar(); } catch (err) { toast.error(err.message); }
  };

  // ------------------------------------------------------------ edição e teclado

  const comecar = (r, c, texto) => {
    const cel = celula(r, c);
    if (!cel) return;
    if (cel.estado === 'fora') { toast.info('Fora da vigência deste gasto fixo: ajuste o início ou o fim no cadastro (Shift+F2).'); return; }
    fechou.current = false;
    setEditor({ r, c, texto: texto ?? (cel.estado === 'lancado' ? valorParaCampo(cel.valor) : valorParaCampo(cel.sugerido)) });
  };
  const mover = (dr, dc, estender = false) => {
    const base = estender ? (ext ?? sel) : sel;
    const r = Math.max(0, Math.min(n - 1, base.r + dr));
    const c = Math.max(0, Math.min(11, base.c + dc));
    if (estender) setExt({ r, c }); else { setSel({ r, c }); setExt(null); }
  };
  const fecharEditor = (gravar, texto, depois) => {
    if (fechou.current) return;
    if (gravar) {
      const v = parseValor(texto);
      if (!v || v < 0) { toast.error(`"${texto}" não é um valor.`); return; }
      const ed = editor;
      aplicar([{ r: ed.r, c: ed.c, valor: v }], `${linhas[ed.r].rec.descricao} em ${competenciaCurta(comps[ed.c])}`);
    }
    fechou.current = true;
    setEditor(null);
    if (depois) mover(depois[0], depois[1]);
    setTimeout(focar, 0);
  };

  const teclar = (e) => {
    if (editor || menu || !n) return;
    const k = e.key;
    const ctrl = e.ctrlKey || e.metaKey;
    if (ctrl && k === 'Enter') { e.preventDefault(); lancarPendentes(); return; }
    if (ctrl && (k === 'z' || k === 'Z') && !e.shiftKey) { e.preventDefault(); andarPilha('desfazer'); return; }
    if (ctrl && (k === 'y' || k === 'Y' || ((k === 'z' || k === 'Z') && e.shiftKey))) { e.preventDefault(); andarPilha('refazer'); return; }
    if (ctrl && (k === 'a' || k === 'A')) { e.preventDefault(); setSel({ r: 0, c: 0 }); setExt({ r: n - 1, c: 11 }); return; }
    if ((e.shiftKey && k === 'F10') || k === 'ContextMenu') { e.preventDefault(); abrirMenuNaCelula(); return; }
    if (e.shiftKey && k === 'F2') { e.preventDefault(); onEditar(linhas[sel.r].rec); return; }
    const setas = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
    if (setas[k]) { e.preventDefault(); let [dr, dc] = setas[k]; if (ctrl) { dr *= 100; dc *= 100; } mover(dr, dc, e.shiftKey); return; }
    if (k === 'Home' || k === 'End') { e.preventDefault(); const c = k === 'Home' ? 0 : 11; if (e.shiftKey) setExt({ r: sel.r, c }); else { setSel({ r: sel.r, c }); setExt(null); } return; }
    if (k === 'Tab') { e.preventDefault(); mover(0, e.shiftKey ? -1 : 1); return; }
    if (k === 'Enter' || k === 'F2') { e.preventDefault(); comecar(sel.r, sel.c); return; }
    if (k === 'Delete' || k === 'Backspace') { e.preventDefault(); excluirLancados(); return; }
    if (k === 'Escape') { setExt(null); setDestaque(null); return; }
    if (/^[\d,.]$/.test(k) && !ctrl && !e.altKey) { e.preventDefault(); comecar(sel.r, sel.c, k); }
  };

  // ------------------------------------------------------------ mouse e menu

  useEffect(() => {
    const soltar = () => { arrasto.current = false; };
    window.addEventListener('mouseup', soltar);
    return () => window.removeEventListener('mouseup', soltar);
  }, []);

  const itensMenu = () => {
    const pend = celulasDa(faixa, 'pendente').filter((x) => x.cel.sugerido > 0).length;
    const lanc = celulasDa(faixa, 'lancado').length;
    const rec = linhas[sel.r]?.rec;
    const comp = comps[sel.c];
    const topo = pilha.desfazer[pilha.desfazer.length - 1];
    const prox = pilha.refazer[pilha.refazer.length - 1];
    return [
      pend
        ? { rotulo: pend === 1 ? 'Lançar com o valor sugerido' : `Lançar os ${pend} pendentes`, icone: <IcoRevisado />, atalho: 'Ctrl+Enter', sub: 'o valor do último mês lançado (ou o padrão)', onEscolher: () => lancarPendentes() }
        : { rotulo: 'Lançar com o valor sugerido', icone: <IcoRevisado />, atalho: 'Ctrl+Enter', desabilitado: true, motivo: 'nada a lançar na seleção' },
      { rotulo: 'Copiar', icone: <IcoCopiar />, atalho: 'Ctrl+C', sub: multi ? 'os valores lançados, para o Excel' : undefined, onEscolher: () => navigator.clipboard?.writeText(textoFaixa()).then(() => toast.success('Copiado.'), () => {}) },
      { rotulo: 'Colar', icone: <IcoColar />, atalho: 'Ctrl+V', sub: 'valores do Excel: lança ou corrige cada mês', onEscolher: async () => { try { colar(await navigator.clipboard.readText()); } catch { toast.info('Use Ctrl+V com a célula selecionada.'); } } },
      lanc
        ? { rotulo: lanc === 1 ? 'Excluir o lançamento' : `Excluir ${lanc} lançamentos`, icone: <IcoLixeira />, atalho: 'Delete', perigo: true, onEscolher: excluirLancados }
        : { rotulo: 'Excluir o lançamento', icone: <IcoLixeira />, atalho: 'Delete', desabilitado: true, motivo: 'nada lançado na seleção' },
      { sep: true },
      { rotulo: `Ver os lançamentos de ${competenciaCurta(comp)}`, icone: <IcoAbrir />, onEscolher: () => { lsSet('lancamentos_mes', comp); navigate('/lancamentos'); } },
      { rotulo: `Editar “${rec?.descricao}”…`, icone: <IcoEtiqueta />, atalho: 'Shift+F2', sub: 'nome, dia, categoria, valor padrão e vigência', onEscolher: () => onEditar(rec) },
      { rotulo: `Encerrar a partir de ${competenciaCurta(comp)}`, icone: <IcoLimparFim />, sub: `o último mês passa a ser ${competenciaCurta(addMeses(comp, -1))}`, onEscolher: () => encerrar(rec, comp) },
      { rotulo: 'Excluir o gasto fixo', icone: <IcoLixeira />, perigo: true, sub: 'os lançamentos já feitos continuam', onEscolher: () => excluirCadastro(rec) },
      { sep: true },
      topo ? { rotulo: 'Desfazer', icone: <IcoDesfazer />, atalho: 'Ctrl+Z', sub: topo.rotulo, onEscolher: () => andarPilha('desfazer') }
        : { rotulo: 'Desfazer', icone: <IcoDesfazer />, atalho: 'Ctrl+Z', desabilitado: true, motivo: 'nada para desfazer' },
      prox ? { rotulo: 'Refazer', icone: <IcoRefazer />, atalho: 'Ctrl+Y', sub: prox.rotulo, onEscolher: () => andarPilha('refazer') }
        : { rotulo: 'Refazer', icone: <IcoRefazer />, atalho: 'Ctrl+Y', desabilitado: true, motivo: 'nada para refazer' },
    ];
  };
  const abrirMenu = (e, r, c) => {
    e.preventDefault();
    focar();
    if (!naFaixa(faixa, r, c)) { setSel({ r, c }); setExt(null); }
    setMenu({ x: e.clientX, y: e.clientY, pendente: true });
  };
  const abrirMenuNaCelula = () => {
    const rc = caixaRef.current?.querySelector(`[data-cel="${sel.r}:${sel.c}"]`)?.getBoundingClientRect();
    setMenu({ x: rc ? rc.left + 8 : 200, y: rc ? rc.bottom : 200, pendente: true });
  };
  useEffect(() => {
    if (menu?.pendente) {
      const rec = linhas[sel.r]?.rec;
      setMenu({ x: menu.x, y: menu.y, titulo: multi ? `Seleção · ${plural(faixa.r1 - faixa.r0 + 1, 'fixo', 'fixos')} × ${plural(faixa.c1 - faixa.c0 + 1, 'mês', 'meses')}` : `${rec?.descricao} · ${competenciaCurta(comps[sel.c])}`, itens: itensMenu() });
    }
  });

  // ------------------------------------------------------------ desenho

  const sombra = (r, c) => {
    const s = [];
    const ativa = sel.r === r && sel.c === c;
    if (multi && naFaixa(faixa, r, c)) {
      if (r === faixa.r0) s.push('inset 0 2px 0 var(--grade-sel)');
      if (r === faixa.r1) s.push('inset 0 -2px 0 var(--grade-sel)');
      if (c === faixa.c0) s.push('inset 2px 0 0 var(--grade-sel)');
      if (c === faixa.c1) s.push('inset -2px 0 0 var(--grade-sel)');
    }
    if (ativa) s.push('inset 0 0 0 2px var(--grade-sel)');
    return s.length ? s.join(',') : undefined;
  };
  // O DESTAQUE DA LEGENDA: clicar num item acende as células daquele tipo e apaga o resto (como as
  // classes de custo do DRE). Clicar de novo, ou Esc na grade, desfaz.
  const casa = (cel) => (destaque === 'subiu' ? subiu(cel) : cel.estado === destaque);
  const apagada = (cel) => destaque && !casa(cel);

  // Resumo da barra de baixo: a seleção (soma do lançado) ou o mês atual.
  const selCelulas = multi ? celulasDa(faixa) : [];
  const somaSel = selCelulas.filter((x) => x.cel.estado === 'lancado').reduce((s, x) => s + x.cel.valor, 0);
  const doMes = (c) => linhas.map((l) => l.celulas[c]);
  const pendHoje = colHoje >= 0 ? doMes(colHoje).filter((c) => c.estado === 'pendente') : [];
  const lancHoje = colHoje >= 0 ? doMes(colHoje).filter((c) => c.estado === 'lancado') : [];
  const fmt = (v) => valorParaCampo(v).replace(/\B(?=(\d{3})+,)/g, '.');

  // O BALÃO, um só para a grade inteira: a chave diz de onde ele veio — célula ("c:r:c"), nome ("n:r"),
  // título de coluna ("h:c", "h:nome", "h:media"), média ("m:r") ou total do mês ("t:c").
  const balaoDe = (chave) => {
    const [tipo, a, b] = chave.split(':');
    if (tipo === 'c') {
      const linha = linhas[Number(a)];
      const cel = linha?.celulas[Number(b)];
      if (!cel) return null;
      const titulo = `${linha.rec.descricao} · ${nomeCompetencia(cel.comp)}`;
      if (cel.estado === 'lancado') {
        const v = pct(cel.valor, cel.antes);
        return { titulo, itens: [{ rotulo: 'Lançado', valor: formatBRL(cel.valor) }, ...(cel.antes !== null ? [{ rotulo: 'Mês anterior', valor: formatBRL(cel.antes) }] : [])],
          nota: v ? `${v > 0 ? '+' : ''}${v}% sobre o mês anterior. Digite para corrigir o valor.` : 'Digite para corrigir o valor.' };
      }
      if (cel.estado === 'fora') return { titulo, nota: 'Fora da vigência deste gasto fixo: o início ou o fim se ajustam no cadastro (clique no nome).' };
      return { titulo, itens: [{ rotulo: 'Sugerido', valor: formatBRL(cel.sugerido) }],
        nota: `${cel.estado === 'pendente' ? 'A lançar' : 'Mês futuro'} (sugerido pelo ${cel.base}). Digite o valor e Enter, ou Ctrl+Enter com o sugerido.` };
    }
    if (tipo === 'n') {
      const { rec } = linhas[Number(a)];
      return {
        titulo: rec.descricao,
        itens: [
          { rotulo: 'Categoria', valor: rec.categoria?.nome ?? 'Sem categoria', cor: rec.categoria?.grupo?.cor },
          { rotulo: 'Todo dia', valor: String(rec.dia_do_mes) },
          { rotulo: 'Valor padrão', valor: formatBRL(rec.valor_padrao_centavos) },
          { rotulo: 'Vigência', valor: `${competenciaCurta(rec.inicio.slice(0, 7))} → ${rec.fim ? competenciaCurta(rec.fim.slice(0, 7)) : 'sem fim'}` },
        ],
        nota: rec.ativa ? 'Clique para editar o cadastro.' : 'Inativo: não aparece para lançar. Clique para editar.',
      };
    }
    if (tipo === 'h' && a === 'nome') return { titulo: 'Gasto fixo', nota: 'Clique num nome para editar o cadastro (nome, dia, categoria, valor padrão e vigência). Clique aqui para selecionar tudo.' };
    if (tipo === 'h' && a === 'media') return { titulo: 'Média', nota: 'A média dos meses LANÇADOS no ano de cada gasto fixo (mês a lançar ou fora da vigência não entra). Passe o mouse num valor para ver o menor e o maior.' };
    if (tipo === 'h' || tipo === 't') {
      const c = Number(a);
      const cels = doMes(c);
      const lanc = cels.filter((x) => x.estado === 'lancado');
      const pend = cels.filter((x) => x.estado === 'pendente');
      const fut = cels.filter((x) => x.estado === 'futuro');
      const antes = c > 0 ? totais[comps[c - 1]] : 0;
      const v = pct(totais[comps[c]], antes);
      return {
        titulo: nomeCompetencia(comps[c]),
        itens: [
          { rotulo: `Lançado (${lanc.length})`, valor: formatBRL(totais[comps[c]]), cor: 'var(--serie-gastos)' },
          ...(pend.length ? [{ rotulo: `A lançar (${pend.length})`, valor: formatBRL(pend.reduce((s, x) => s + x.sugerido, 0)) }] : []),
          ...(fut.length ? [{ rotulo: `Previsto (${fut.length})`, valor: formatBRL(fut.reduce((s, x) => s + x.sugerido, 0)) }] : []),
        ],
        nota: [v !== null && totais[comps[c]] && `${v > 0 ? '+' : ''}${v}% sobre o mês anterior`, tipo === 'h' && 'Clique para selecionar o mês; Ctrl+Enter lança os pendentes'].filter(Boolean).join('. '),
      };
    }
    if (tipo === 'm') {
      const l = linhas[Number(a)];
      const lanc = l.celulas.filter((x) => x.estado === 'lancado');
      if (!lanc.length) return { titulo: `${l.rec.descricao} · média`, nota: 'Nenhum mês lançado neste ano.' };
      const menor = lanc.reduce((m, x) => (x.valor < m.valor ? x : m));
      const maior = lanc.reduce((m, x) => (x.valor > m.valor ? x : m));
      return {
        titulo: `${l.rec.descricao} · ${comps[0].slice(0, 4)}`,
        itens: [
          { rotulo: 'Média por mês', valor: formatBRL(l.media) },
          { rotulo: `Total (${lanc.length} ${lanc.length === 1 ? 'mês' : 'meses'})`, valor: formatBRL(l.total) },
          { rotulo: `Menor · ${competenciaCurta(menor.comp).slice(0, 3)}`, valor: formatBRL(menor.valor) },
          { rotulo: `Maior · ${competenciaCurta(maior.comp).slice(0, 3)}`, valor: formatBRL(maior.valor) },
        ],
        nota: maior.valor !== menor.valor ? `Variou ${pct(maior.valor, menor.valor)}% entre o menor e o maior mês.` : 'O mesmo valor em todos os meses lançados.',
      };
    }
    return null;
  };
  const conteudoBalao = balao.ativo && !editor && !menu ? balaoDe(balao.ativo) : null;
  const passa = (chave) => ({ onMouseMove: balao.aoMover(chave), onMouseLeave: balao.aoSair });

  return (
    <div>
      <LegendaFixos linhas={linhas} destaque={destaque} onDestaque={(d) => setDestaque((x) => (x === d ? null : d))} />
      <div ref={caixaRef} tabIndex={0} onKeyDown={teclar}
        onCopy={(e) => { if (editor) return; e.preventDefault(); e.clipboardData.setData('text/plain', textoFaixa()); toast.success('Copiado: cole no Excel.'); }}
        onPaste={(e) => { if (editor) return; e.preventDefault(); colar(e.clipboardData.getData('text/plain')); }}
        className="max-h-[calc(100vh-270px)] min-h-[200px] overflow-auto rounded-t-lg border border-gray-300 bg-white outline-none"
        style={{ scrollPaddingLeft: 210, scrollPaddingTop: 34 }}>
        <table className="w-full min-w-[1080px] table-fixed border-separate border-spacing-0 text-[12.5px]">
          <colgroup><col style={{ width: 210 }} />{comps.map((c) => <col key={c} />)}<col style={{ width: 84 }} /></colgroup>
          <thead>
            <tr>
              <th {...passa('h:nome')} onMouseDown={(e) => { e.preventDefault(); focar(); setSel({ r: 0, c: 0 }); setExt({ r: n - 1, c: 11 }); }}
                className="sticky left-0 top-0 z-30 h-[33px] cursor-pointer select-none border-b border-r border-gray-300 bg-hx-f9fafb px-3 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500 transition-colors duration-[120ms] hover:bg-gray-200 hover:text-gray-800">
                Gasto fixo
              </th>
              {comps.map((c, i) => {
                const acesa = i >= faixa.c0 && i <= faixa.c1;
                return (
                  <th key={c} {...passa(`h:${i}`)}
                    onMouseDown={(e) => { e.preventDefault(); focar(); if (e.shiftKey) setExt({ r: n - 1, c: i }); else { setSel({ r: 0, c: i }); setExt({ r: n - 1, c: i }); } }}
                    style={acesa || i === colHoje ? { boxShadow: 'inset 0 -2px 0 var(--grade-sel)' } : undefined}
                    className={`sticky top-0 z-20 cursor-pointer select-none border-b border-r border-gray-300 px-2 text-right text-[11px] font-semibold uppercase tracking-wide transition-colors duration-[120ms] hover:bg-gray-200 hover:text-gray-900 ${
                      acesa || i === colHoje ? 'bg-hx-eef2f7 text-gray-800' : 'bg-hx-f9fafb text-gray-500'}`}>
                    {competenciaCurta(c).slice(0, 3)}
                  </th>
                );
              })}
              <th {...passa('h:media')}
                className="sticky top-0 z-20 cursor-help border-b border-gray-300 bg-hx-f9fafb px-2 text-right text-[11px] font-semibold uppercase tracking-wide text-gray-500 transition-colors duration-[120ms] hover:bg-gray-200 hover:text-gray-800">
                Média
              </th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l, r) => (
              <tr key={l.rec.id}>
                <td onContextMenu={(e) => abrirMenu(e, r, sel.c)}
                  className={`sticky left-0 z-10 h-8 select-none border-b border-r border-gray-300 px-1.5 ${r >= faixa.r0 && r <= faixa.r1 ? 'bg-hx-eef2f7' : 'bg-white'}`}>
                  {/* O NOME É UM BOTÃO: o hover acende a caixa, sublinha o nome e mostra o lápis — diz que
                      clicar abre o cadastro (antes era um clique duplo que ninguém adivinhava). */}
                  <button type="button" onClick={() => onEditar(l.rec)} onMouseDown={(e) => e.stopPropagation()} {...passa(`n:${r}`)}
                    className="group/nome flex w-full min-w-0 items-center gap-2 rounded-[4px] px-1.5 py-[3px] text-left transition-colors duration-[120ms] hover:bg-gray-200/70 active:bg-gray-200">
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: l.rec.categoria?.grupo?.cor ?? '#9ca3af' }} />
                    <span className={`truncate decoration-gray-400 underline-offset-[3px] group-hover/nome:underline ${l.rec.ativa ? 'text-gray-900' : 'text-gray-400'}`}>{l.rec.descricao}</span>
                    <span className="shrink-0 text-[11px] text-gray-400">dia {l.rec.dia_do_mes}</span>
                    <svg viewBox="0 0 24 24" className="ml-auto h-3.5 w-3.5 shrink-0 text-gray-500 opacity-0 transition-opacity group-hover/nome:opacity-100" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M4 20h4L19 9l-4-4L4 16v4z" />
                    </svg>
                  </button>
                </td>
                {l.celulas.map((cel, c) => {
                  const chave = `c:${r}:${c}`;
                  const atual = c === colHoje;
                  const salvando = gravando.has(`${r}|${c}`);
                  let fundo = '';
                  let conteudo = null;
                  if (cel.estado === 'fora') fundo = 'grade-hachura';
                  else if (cel.estado === 'lancado') {
                    if (atual) fundo = 'bg-hx-f0fdf4';
                    const v = pct(cel.valor, cel.antes);
                    conteudo = modo === 'variacao'
                      ? (v === null ? <span className="text-gray-300">—</span> : <span className={v > 0 ? 'text-hx-b91c1c' : v < 0 ? 'text-hx-15803d' : 'text-gray-400'}>{v > 0 ? '+' : ''}{v}%</span>)
                      : <span className={subiu(cel) ? 'text-hx-b91c1c' : 'text-gray-800'}>{fmt(cel.valor)}</span>;
                  } else if (cel.estado === 'pendente') {
                    fundo = 'bg-hx-fffbeb';
                    conteudo = salvando ? <span className="text-gray-400">lançando…</span> : <span className="italic text-gray-400">{valorParaCampo(cel.sugerido)}</span>;
                  } else conteudo = <span className="text-gray-300">·</span>;
                  const editando = editor && editor.r === r && editor.c === c;
                  return (
                    <td key={cel.comp} data-cel={`${r}:${c}`}
                      onMouseDown={(e) => { if (e.button !== 0) return; e.preventDefault(); focar(); if (e.shiftKey) setExt({ r, c }); else { setSel({ r, c }); setExt(null); arrasto.current = true; } }}
                      onMouseEnter={() => { if (arrasto.current) setExt({ r, c }); }}
                      {...passa(chave)}
                      onDoubleClick={() => comecar(r, c)} onContextMenu={(e) => abrirMenu(e, r, c)}
                      style={{ boxShadow: [sombra(r, c), cel.estado === 'pendente' && !sombra(r, c) ? 'inset 0 0 0 1px #fcd34d' : null].filter(Boolean).join(',') || undefined }}
                      className={`relative h-8 cursor-cell select-none border-b border-r border-gray-100 px-2 text-right tabular-nums transition-opacity duration-150 hover:brightness-[.97] ${fundo} ${
                        multi && naFaixa(faixa, r, c) && !(sel.r === r && sel.c === c) && cel.estado !== 'pendente' && cel.estado !== 'fora' ? 'bg-hx-eff5ff' : ''} ${
                        apagada(cel) ? 'opacity-20' : ''}`}>
                      {conteudo}
                      {editando && (
                        <input autoFocus value={editor.texto} inputMode="decimal"
                          onChange={(e) => setEditor((ed) => ({ ...ed, texto: e.target.value }))}
                          onFocus={(e) => { const f = e.target.value.length; e.target.setSelectionRange(f, f); }}
                          onKeyDown={(e) => {
                            e.stopPropagation();
                            if (e.key === 'Escape') { e.preventDefault(); fecharEditor(false); }
                            else if (e.key === 'Enter') { e.preventDefault(); fecharEditor(true, e.currentTarget.value, [e.shiftKey ? -1 : 1, 0]); }
                            else if (e.key === 'Tab') { e.preventDefault(); fecharEditor(true, e.currentTarget.value, [0, e.shiftKey ? -1 : 1]); }
                          }}
                          onBlur={(e) => { if (editor) fecharEditor(true, e.target.value); }}
                          onMouseDown={(e) => e.stopPropagation()}
                          className="absolute inset-0 z-20 h-full w-full border-0 bg-white px-2 text-right text-[12.5px] tabular-nums text-gray-900 outline-none"
                          style={{ boxShadow: 'inset 0 0 0 2px var(--grade-sel)' }} />
                      )}
                    </td>
                  );
                })}
                <td {...passa(`m:${r}`)}
                  className="h-8 cursor-help border-b border-gray-100 bg-hx-f9fafb px-2 text-right tabular-nums text-gray-500 transition-colors duration-[120ms] hover:bg-gray-200 hover:text-gray-900">
                  {l.media ? fmt(l.media) : '—'}
                </td>
              </tr>
            ))}
            <tr className="font-semibold">
              <td className="sticky left-0 z-10 h-8 border-r border-gray-300 bg-hx-f9fafb px-3 text-gray-800">Total lançado</td>
              {comps.map((c, i) => (
                <td key={c} {...passa(`t:${i}`)}
                  className="cursor-help border-r border-gray-100 bg-hx-f9fafb px-2 text-right tabular-nums text-gray-900 transition-colors duration-[120ms] hover:bg-gray-200">
                  {totais[c] ? Math.round(totais[c] / 100).toLocaleString('pt-BR') : <span className="font-normal text-gray-300">—</span>}
                </td>
              ))}
              <td className="bg-hx-f9fafb" />
            </tr>
          </tbody>
        </table>
      </div>
      <div className="flex h-7 items-center gap-4 rounded-b-lg border border-t-0 border-gray-300 bg-hx-f9fafb px-3 text-[12px] tabular-nums text-gray-500">
        {colHoje >= 0 ? (
          <span className="truncate">
            {nomeCompetencia(hoje).replace(/ de \d+$/, '')}: <b className="font-semibold text-gray-800">{lancHoje.length} lançados</b>
            {pendHoje.length > 0 && <> · <b className="font-semibold text-hx-92400e">{pendHoje.length} a lançar</b> ({formatBRL(pendHoje.reduce((s, c) => s + c.sugerido, 0))} sugeridos)</>}
          </span>
        ) : <span className="truncate">Digite o valor e Enter para lançar · Ctrl+Enter lança os pendentes · botão direito para mais</span>}
        <span className="flex-1" />
        {multi && <span>{selCelulas.length} células · lançado <b className="font-semibold text-gray-800">{formatBRL(somaSel)}</b></span>}
      </div>

      <MenuContexto menu={menu?.pendente ? null : menu} onFechar={() => setMenu(null)} />

      {conteudoBalao && <BalaoGrafico pos={balao.pos} largura={270} {...conteudoBalao} />}
    </div>
  );
}

// "Subiu": lançado com valor maior que o do mês anterior (o número vermelho da grade).
const subiu = (cel) => cel.estado === 'lancado' && cel.antes !== null && cel.valor > cel.antes;

// ------------------------------------------------------------ a legenda (no jeito da do DRE)

// Cada marca da grade, com a amostra e quantas células há dela. Clicar DESTACA (as outras recuam).
const MARCAS = [
  { id: 'lancado', rotulo: 'Lançado', amostra: <span className="h-2.5 w-3 rounded-[2px] border border-hx-bbf7d0 bg-hx-f0fdf4" />, explica: 'Já lançado. Verde no mês atual; nos outros, o número sem fundo. Digite para corrigir.' },
  { id: 'pendente', rotulo: 'A lançar', amostra: <span className="h-2.5 w-3 rounded-[2px] border border-hx-fcd34d bg-hx-fffbeb" />, explica: 'Vigente e ainda sem lançamento. O cinza é o valor sugerido: o do último mês lançado (ou o padrão).' },
  { id: 'futuro', rotulo: 'Futuro', amostra: <span className="text-[13px] leading-none text-gray-400">·</span>, explica: 'Mês que ainda não chegou. Dá para lançar adiantado, digitando o valor.' },
  { id: 'fora', rotulo: 'Fora da vigência', amostra: <span className="grade-hachura h-2.5 w-3 rounded-[2px] border border-gray-200" />, explica: 'Antes do início, depois do fim ou inativo. Ajuste no cadastro (clique no nome).' },
  { id: 'subiu', rotulo: 'Subiu', amostra: <span className="text-[11px] font-bold leading-none text-hx-b91c1c">123</span>, explica: 'Lançado com valor maior que o do mês anterior.' },
];

const ATALHOS = [
  ['Digitar · Enter', 'lança o mês (ou corrige o valor lançado) e desce'],
  ['Ctrl+Enter', 'lança os pendentes da seleção com o valor sugerido'],
  ['Delete', 'exclui os lançamentos da seleção'],
  ['Setas · Tab', 'andam; Shift estende a seleção'],
  ['Ctrl+C · Ctrl+V', 'copia e cola valores (do Excel também)'],
  ['Ctrl+Z · Ctrl+Y', 'desfaz e refaz'],
  ['Shift+F2', 'edita o cadastro do gasto fixo'],
  ['Shift+F10', 'abre o menu da célula'],
];

function LegendaFixos({ linhas, destaque, onDestaque }) {
  const [pos, setPos] = useState(null);
  const [todos, setTodos] = useState(false);
  const btnRef = useRef(null);
  const popRef = useRef(null);
  const aberto = !!pos;
  const fechar = () => setPos(null);
  useEscape(aberto, fechar);
  useEffect(() => {
    if (!aberto) return undefined;
    const fora = (e) => { if (!popRef.current?.contains(e.target) && !btnRef.current?.contains(e.target)) fechar(); };
    document.addEventListener('mousedown', fora);
    window.addEventListener('resize', fechar);
    return () => { document.removeEventListener('mousedown', fora); window.removeEventListener('resize', fechar); };
  }, [aberto]);

  const todas = linhas.flatMap((l) => l.celulas);
  const conta = { subiu: todas.filter(subiu).length };
  MARCAS.forEach((m) => { if (m.id !== 'subiu') conta[m.id] = todas.filter((c) => c.estado === m.id).length; });

  return (
    <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-gray-600">
      {MARCAS.map((m) => (
        <button key={m.id} type="button" onClick={() => onDestaque(m.id)} aria-pressed={destaque === m.id}
          title={`${m.explica} Clique para destacar.`}
          className={`-mx-1 inline-flex items-center gap-1.5 whitespace-nowrap rounded-[3px] px-1 py-[1px] transition-colors duration-[120ms] ${
            destaque === m.id ? 'bg-gray-200 text-gray-900' : 'hover:bg-gray-100 hover:text-gray-800 active:bg-gray-200'}`}>
          {m.amostra}{m.rotulo}
          {m.id === 'pendente' && conta.pendente > 0 && <span className="text-gray-400">· {conta.pendente}</span>}
        </button>
      ))}
      {destaque && <button type="button" onClick={() => onDestaque(destaque)} className="text-[11.5px] text-gray-400 underline hover:text-gray-700">tirar o destaque</button>}
      <button ref={btnRef} type="button" aria-expanded={aberto} aria-haspopup="dialog"
        onClick={() => (aberto ? fechar() : setPos(posicionarPopover(btnRef.current, { largura: 360, altura: 460, alinhar: 'direita' })))}
        className={`ml-auto inline-flex h-[22px] items-center gap-1.5 whitespace-nowrap rounded-[4px] px-2 text-[11.5px] transition-colors duration-[120ms] ${
          aberto ? 'bg-gray-100 text-gray-800' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-800 active:bg-gray-200'}`}>
        <span aria-hidden="true" className="grid h-[13px] w-[13px] place-items-center rounded-full border border-current text-[8.5px] font-bold leading-none">i</span>
        Legenda
      </button>
      {aberto && createPortal(
        <div ref={popRef} role="dialog" aria-label="Legenda da grade" style={{ position: 'fixed', width: 360, ...pos }}
          className="z-[56] animate-pop-in rounded-[4px] border border-elevado bg-elevado px-3.5 py-3 text-[12px] leading-[1.45] text-gray-600 shadow-lg sombra-popover">
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400">Células</div>
          {MARCAS.map((m) => (
            <button key={m.id} type="button" onClick={() => { onDestaque(m.id); fechar(); }}
              className="group/leg -mx-1.5 flex w-[calc(100%+12px)] items-start gap-2 rounded-[3px] px-1.5 py-[3px] text-left transition-colors duration-[120ms] hover:bg-gray-100 hover:text-gray-900">
              <span className="mt-[3px] flex w-4 shrink-0 justify-center">{m.amostra}</span>
              <span className="min-w-0 flex-1"><b className="font-medium text-gray-800">{m.rotulo}</b> — {m.explica}<span className="text-gray-400"> · {conta[m.id]}</span></span>
              <span className="shrink-0 pt-px text-[10.5px] text-gray-400 opacity-0 transition-opacity group-hover/leg:opacity-100">destacar</span>
            </button>
          ))}
          <div className="mt-2.5 border-t border-gray-100 pt-2.5">
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400">Colunas e números</div>
            <p className="m-0 py-[3px]">Média = os meses lançados no ano ÷ quantos são. "Total lançado" soma o que já entrou em cada mês. Passe o mouse nos números e nos títulos dos meses para ver a conta.</p>
            <p className="m-0 py-[3px]">Clique no nome de um gasto fixo para editar o cadastro; no título de um mês, para selecionar a coluna inteira.</p>
          </div>
          <div className="mt-2.5 border-t border-gray-100 pt-2.5">
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400">Teclado</div>
            <button type="button" onClick={() => setTodos((t) => !t)}
              className="group/leg -mx-1.5 flex w-[calc(100%+12px)] items-start gap-2 rounded-[3px] px-1.5 py-[3px] text-left transition-colors hover:bg-gray-100 hover:text-gray-900">
              <span className="min-w-0 flex-1">Digite para lançar · Enter grava e desce · Ctrl+Enter lança os pendentes · Esc cancela</span>
              <span className="shrink-0 pt-px text-[10.5px] text-gray-400 opacity-0 transition-opacity group-hover/leg:opacity-100">{todos ? 'menos' : 'todos os atalhos'}</span>
            </button>
            {todos && (
              <div className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 pl-1">
                {ATALHOS.map(([k, o]) => <Fragment key={k}><span className="whitespace-nowrap font-medium text-gray-700">{k}</span><span>{o}</span></Fragment>)}
              </div>
            )}
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}

const IcoLimparFim = () => (
  <svg viewBox="0 0 24 24" className="h-[14px] w-[14px]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M5 12h10M15 6v12M19 6v12" />
  </svg>
);
