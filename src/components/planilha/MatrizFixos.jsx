import { useEffect, useLayoutEffect, useRef, useState } from 'react';
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
  const balao = useBalao(260, 120);

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
    if (k === 'Escape') { setExt(null); return; }
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

  const balaoCel = balao.ativo ? (() => { const [r, c] = balao.ativo.split(':').map(Number); return { linha: linhas[r], cel: celula(r, c) }; })() : null;
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

  // Resumo da barra de baixo: a seleção (soma do lançado) ou o mês atual.
  const selCelulas = multi ? celulasDa(faixa) : [];
  const somaSel = selCelulas.filter((x) => x.cel.estado === 'lancado').reduce((s, x) => s + x.cel.valor, 0);
  const pendHoje = colHoje >= 0 ? linhas.map((l) => l.celulas[colHoje]).filter((c) => c.estado === 'pendente') : [];
  const lancHoje = colHoje >= 0 ? linhas.map((l) => l.celulas[colHoje]).filter((c) => c.estado === 'lancado') : [];

  return (
    <div>
      <div ref={caixaRef} tabIndex={0} onKeyDown={teclar}
        onCopy={(e) => { if (editor) return; e.preventDefault(); e.clipboardData.setData('text/plain', textoFaixa()); toast.success('Copiado: cole no Excel.'); }}
        onPaste={(e) => { if (editor) return; e.preventDefault(); colar(e.clipboardData.getData('text/plain')); }}
        className="max-h-[calc(100vh-250px)] min-h-[200px] overflow-auto rounded-t-lg border border-gray-300 bg-white outline-none"
        style={{ scrollPaddingLeft: 210, scrollPaddingTop: 34 }}>
        <table className="w-full min-w-[1080px] table-fixed border-separate border-spacing-0 text-[12.5px]">
          <colgroup><col style={{ width: 210 }} />{comps.map((c) => <col key={c} />)}<col style={{ width: 84 }} /></colgroup>
          <thead>
            <tr>
              <th className="sticky left-0 top-0 z-30 h-[33px] border-b border-r border-gray-300 bg-hx-f9fafb px-3 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500">Gasto fixo</th>
              {comps.map((c, i) => {
                const acesa = i >= faixa.c0 && i <= faixa.c1;
                return (
                  <th key={c} style={acesa || i === colHoje ? { boxShadow: 'inset 0 -2px 0 var(--grade-sel)' } : undefined}
                    className={`sticky top-0 z-20 border-b border-r border-gray-300 px-2 text-right text-[11px] font-semibold uppercase tracking-wide ${
                      acesa || i === colHoje ? 'bg-hx-eef2f7 text-gray-800' : 'bg-hx-f9fafb text-gray-500'}`}>
                    {competenciaCurta(c).slice(0, 3)}
                  </th>
                );
              })}
              <th className="sticky top-0 z-20 border-b border-gray-300 bg-hx-f9fafb px-2 text-right text-[11px] font-semibold uppercase tracking-wide text-gray-500">Média</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l, r) => (
              <tr key={l.rec.id}>
                <td onContextMenu={(e) => abrirMenu(e, r, sel.c)} onDoubleClick={() => onEditar(l.rec)}
                  title="Clique duplo: editar o cadastro"
                  className={`sticky left-0 z-10 h-8 cursor-default select-none border-b border-r border-gray-300 px-3 ${r >= faixa.r0 && r <= faixa.r1 ? 'bg-hx-eef2f7' : 'bg-white'}`}>
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: l.rec.categoria?.grupo?.cor ?? '#9ca3af' }} />
                    <span className={`truncate ${l.rec.ativa ? 'text-gray-900' : 'text-gray-400'}`}>{l.rec.descricao}</span>
                    <span className="shrink-0 text-[11px] text-gray-400">dia {l.rec.dia_do_mes}</span>
                  </span>
                </td>
                {l.celulas.map((cel, c) => {
                  const chave = `${r}:${c}`;
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
                      : <span className={cel.antes !== null && cel.valor > cel.antes ? 'text-hx-b91c1c' : 'text-gray-800'}>{valorParaCampo(cel.valor).replace(/\B(?=(\d{3})+,)/g, '.')}</span>;
                  } else if (cel.estado === 'pendente') {
                    fundo = 'bg-hx-fffbeb';
                    conteudo = salvando ? <span className="text-gray-400">lançando…</span> : <span className="italic text-gray-400">{valorParaCampo(cel.sugerido)}</span>;
                  } else conteudo = <span className="text-gray-300">·</span>;
                  const editando = editor && editor.r === r && editor.c === c;
                  return (
                    <td key={cel.comp} data-cel={chave}
                      onMouseDown={(e) => { if (e.button !== 0) return; e.preventDefault(); focar(); if (e.shiftKey) setExt({ r, c }); else { setSel({ r, c }); setExt(null); arrasto.current = true; } }}
                      onMouseEnter={() => { if (arrasto.current) setExt({ r, c }); }}
                      onMouseMove={balao.aoMover(chave)} onMouseLeave={balao.aoSair}
                      onDoubleClick={() => comecar(r, c)} onContextMenu={(e) => abrirMenu(e, r, c)}
                      style={{ boxShadow: [sombra(r, c), cel.estado === 'pendente' && !sombra(r, c) ? 'inset 0 0 0 1px #fcd34d' : null].filter(Boolean).join(',') || undefined }}
                      className={`relative h-8 cursor-cell select-none border-b border-r border-gray-100 px-2 text-right tabular-nums ${fundo} ${
                        multi && naFaixa(faixa, r, c) && !(sel.r === r && sel.c === c) && cel.estado !== 'pendente' && cel.estado !== 'fora' ? 'bg-hx-eff5ff' : ''}`}>
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
                <td className="h-8 border-b border-gray-100 bg-hx-f9fafb px-2 text-right tabular-nums text-gray-500">{l.media ? valorParaCampo(l.media).replace(/\B(?=(\d{3})+,)/g, '.') : '—'}</td>
              </tr>
            ))}
            <tr className="font-semibold">
              <td className="sticky left-0 z-10 h-8 border-r border-gray-300 bg-hx-f9fafb px-3 text-gray-800">Total lançado</td>
              {comps.map((c) => (
                <td key={c} className="border-r border-gray-100 bg-hx-f9fafb px-2 text-right tabular-nums text-gray-900">
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

      {balaoCel && balaoCel.cel && !editor && (() => {
        const { linha, cel } = balaoCel;
        const titulo = `${linha.rec.descricao} · ${nomeCompetencia(cel.comp)}`;
        if (cel.estado === 'lancado') {
          const v = pct(cel.valor, cel.antes);
          return (
            <BalaoGrafico pos={balao.pos} largura={260} titulo={titulo}
              itens={[{ rotulo: 'Lançado', valor: formatBRL(cel.valor) }, ...(cel.antes !== null ? [{ rotulo: 'Mês anterior', valor: formatBRL(cel.antes) }] : [])]}
              nota={v ? `${v > 0 ? '+' : ''}${v}% sobre o mês anterior. Digite para corrigir o valor.` : 'Digite para corrigir o valor.'} />
          );
        }
        if (cel.estado === 'fora') return <BalaoGrafico pos={balao.pos} largura={260} titulo={titulo} nota="Fora da vigência deste gasto fixo." />;
        return (
          <BalaoGrafico pos={balao.pos} largura={260} titulo={titulo}
            itens={[{ rotulo: 'Sugerido', valor: formatBRL(cel.sugerido) }]}
            nota={`${cel.estado === 'pendente' ? 'A lançar' : 'Mês futuro'} (sugerido pelo ${cel.base}). Digite o valor e Enter, ou Ctrl+Enter com o sugerido.`} />
        );
      })()}
    </div>
  );
}

const IcoLimparFim = () => (
  <svg viewBox="0 0 24 24" className="h-[14px] w-[14px]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M5 12h10M15 6v12M19 6v12" />
  </svg>
);
