import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import MenuContexto from '../MenuContexto.jsx';
import ModalCategoria from '../ModalCategoria.jsx';
import BordaCopia, { bordaDaCopia, medirCopia } from './BordaCopia.jsx';
import { ListaCategorias } from './GradeLancamentos.jsx';
import { opcoesCategoria } from '../SelectBusca.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { useConfirmacao } from '../../context/ConfirmContext.jsx';
import { atualizarRecorrencia, excluirRecorrencia, inserirRecorrencia, salvarRecorrencia } from '../../api/fixos.js';
import { COLUNAS_FIXO, editavel, interpretarFixo, mesCurto, padroesDoUltimo, textoFixo } from '../../lib/cadastroFixos.js';
import { faixaDe, ladrilhar, lerBloco, naFaixa } from '../../lib/planilha.js';
import { formatBRL, valorParaCampo } from '../../lib/dinheiro.js';
import { competenciaAtual, competenciaCurta } from '../../lib/format.js';
import { copiarTexto } from '../../lib/copiar.js';
import {
  IcoAtivar, IcoColar, IcoCopiar, IcoDesfazer, IcoEtiqueta, IcoLimpar, IcoLixeira, IcoPreencher, IcoRefazer,
} from './iconesMenu.jsx';

// O CADASTRO DOS GASTOS FIXOS EM LISTA (a vista "Cadastro" da tela): todos os fixos numa grade só, uma
// coluna por campo do modal — ativo, descrição, categoria, dia, valor padrão, começa e termina — para
// mudar vários de uma vez em vez de abrir um por um. O teclado é o da grade dos Lançamentos: setas, Shift
// estende, digitar edita, Enter grava e desce, Ctrl+C/V de e para o Excel (colar abaixo do fim CRIA
// fixos), Ctrl+D repete o de cima, Delete limpa (categoria e fim), Ctrl+Z/Y desfazem. A última linha
// cria um fixo novo (digite a descrição). Grava célula a célula (`atualizarRecorrencia`), otimista.
//
// "Último lançado" (só leitura) é o valor do lançamento mais recente de cada fixo, com ≠ quando difere do
// padrão; selecionando linhas, "Usar o último lançado como padrão" atualiza todas de uma vez. Mudar o
// padrão não mexe no que já foi lançado: vale para as próximas sugestões.
//
// `recs`: as recorrências mostradas (já filtradas). `setRecs`: a lista da página. `ultimos`:
// { recorrencia_id: { valor_centavos, competencia } }.

const AZUL = 'var(--grade-sel)';
const ULT = COLUNAS_FIXO.length - 1;
const C_ATIVA = 0;
const C_DESC = 1;
const C_CAT = 2;
const LARGURAS = [64, undefined, 220, 60, 128, 150, 96, 104];
const plural = (n, um, varios) => `${n.toLocaleString('pt-BR')} ${n === 1 ? um : varios}`;
const norm = (s) => String(s ?? '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();

export default function GradeCadastroFixos({ recs, setRecs, categorias, ultimos, onEditar, onCategoriaCriada, onRecarregar }) {
  const toast = useToast();
  const confirmar = useConfirmacao();
  const caixaRef = useRef(null);
  const n = recs.length;
  const [sel, setSel] = useState({ r: 0, c: C_DESC });
  const [ext, setExt] = useState(null);
  const [editor, setEditor] = useState(null); // { r, c, texto, digitando }
  const [menu, setMenu] = useState(null);
  const [pilha, setPilha] = useState({ desfazer: [], refazer: [] });
  const [copia, setCopia] = useState(null);
  const [selo, setSelo] = useState(null);
  const [focada, setFocada] = useState(false);
  const [criandoCat, setCriandoCat] = useState(null); // { nome, r0, r1 }
  const arrasto = useRef(false);
  const fechou = useRef(false);
  const fila = useRef(Promise.resolve());

  const faixa = faixaDe(sel, ext ?? sel);
  const multi = faixa.r0 !== faixa.r1 || faixa.c0 !== faixa.c1;
  const linhasInteiras = faixa.c0 === 0 && faixa.c1 === ULT;
  const recsDaFaixa = recs.slice(faixa.r0, Math.min(faixa.r1, n - 1) + 1);
  const catPorId = useMemo(() => new Map(categorias.map((c) => [c.id, c])), [categorias]);
  // A categoria (nome e cor) da linha pelo id; a recém-criada ainda não está na lista: fica a que a linha já tem.
  const comCategoria = (r) => {
    const c = r.categoria_id ? catPorId.get(r.categoria_id) : null;
    if (!c) return { ...r, categoria: r.categoria_id && r.categoria?.id === r.categoria_id ? r.categoria : null };
    return { ...r, categoria: { id: c.id, nome: c.nome, grupo: { nome: c.grupo.nome, cor: c.grupo.cor } } };
  };
  const focar = () => caixaRef.current?.focus({ preventScroll: true });
  const enfileirar = (fn) => { fila.current = fila.current.then(fn, fn); return fila.current; };
  const falhou = (err) => { toast.error(err.message); onRecarregar(); };
  const empilhar = (acao) => setPilha((p) => ({ desfazer: [...p.desfazer, acao].slice(-100), refazer: [] }));
  const trocar = (rows) => { const m = new Map(rows.map((x) => [x.id, x])); setRecs((rs) => rs.map((x) => (m.has(x.id) ? { ...x, ...m.get(x.id) } : x))); };

  useEffect(() => { if (sel.r > n) setSel((s) => ({ ...s, r: n })); }, [n, sel.r]);
  useLayoutEffect(() => {
    caixaRef.current?.querySelector(`[data-cel="${sel.r}:${sel.c}"]`)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [sel.r, sel.c]);
  useEffect(() => {
    if (!selo) return undefined;
    const t = setTimeout(() => setSelo(null), 2200);
    return () => clearTimeout(t);
  }, [selo]);

  // ------------------------------------------------------------ gravar

  // As mudanças: [{ r, campo, valor }] → uma edição por fixo (antes/depois), otimista, numa fila.
  const aplicar = (mudancas, rotulo) => {
    const porId = new Map();
    mudancas.forEach(({ r, campo, valor }) => {
      const rec = recs[r];
      if (!rec || rec[campo] === valor || (rec[campo] ?? null) === valor) return;
      const e = porId.get(rec.id) ?? { id: rec.id, antes: {}, depois: {} };
      e.antes[campo] = rec[campo] ?? null;
      e.depois[campo] = valor;
      porId.set(rec.id, e);
    });
    const itens = [...porId.values()];
    if (!itens.length) return;
    setCopia(null);
    setRecs((rs) => rs.map((x) => { const e = porId.get(x.id); return e ? comCategoria({ ...x, ...e.depois }) : x; }));
    enfileirar(async () => {
      try {
        trocar(await Promise.all(itens.map((e) => atualizarRecorrencia(e.id, e.depois))));
        empilhar({ rotulo, partes: [{ tipo: 'campos', itens }] });
      } catch (err) { falhou(err); }
    });
  };

  // Cria fixos (a linha nova ou o colar abaixo do fim). `dados`: [{ descricao, ...campos }].
  const criar = (dados, rotulo) => {
    if (!dados.length) return;
    enfileirar(async () => {
      try {
        const criados = [];
        for (const d of dados) {
          const novo = await salvarRecorrencia({
            categoria_id: null, valor_padrao_centavos: 0, dia_do_mes: 1, inicio: `${competenciaAtual()}-01`, fim: null, ativa: true, ...d,
          });
          criados.push(comCategoria(novo));
        }
        setRecs((rs) => [...rs, ...criados]);
        empilhar({ rotulo, partes: [{ tipo: 'criar', registros: criados }] });
        toast.success(criados.length === 1 ? `Gasto fixo “${criados[0].descricao}” criado.` : `${criados.length} gastos fixos criados.`);
      } catch (err) { falhou(err); }
    });
  };

  const executarParte = async (parte, sentido) => {
    if (parte.tipo === 'campos') {
      const lado = sentido === 'desfazer' ? 'antes' : 'depois';
      setRecs((rs) => rs.map((x) => { const e = parte.itens.find((i) => i.id === x.id); return e ? comCategoria({ ...x, ...e[lado] }) : x; }));
      trocar(await Promise.all(parte.itens.map((e) => atualizarRecorrencia(e.id, e[lado]))));
      return;
    }
    const ids = parte.registros.map((x) => x.id);
    if (sentido === 'desfazer') {
      for (const id of ids) await excluirRecorrencia(id);
      setRecs((rs) => rs.filter((x) => !ids.includes(x.id)));
    } else {
      const voltaram = [];
      for (const reg of parte.registros) voltaram.push(await inserirRecorrencia(reg));
      setRecs((rs) => [...rs, ...voltaram]);
    }
  };

  const andarPilha = (sentido) => {
    const de = sentido;
    const para = sentido === 'desfazer' ? 'refazer' : 'desfazer';
    const acao = pilha[de][pilha[de].length - 1];
    if (!acao) return;
    setPilha((p) => ({ ...p, [de]: p[de].slice(0, -1) }));
    setCopia(null);
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

  const textoFaixa = () => {
    const out = [];
    for (let r = faixa.r0; r <= Math.min(faixa.r1, n - 1); r++) {
      const cols = [];
      for (let c = faixa.c0; c <= faixa.c1; c++) cols.push(textoFixo(recs[r], c, { categorias, ultimos }));
      out.push(cols.join('\t'));
    }
    return out.join('\n');
  };

  const copiar = async () => {
    const texto = textoFaixa();
    if (!texto.replace(/[\t\n]/g, '')) { toast.info('Nada na seleção para copiar.'); return; }
    const ok = await copiarTexto(texto);
    focar();
    if (!ok) { toast.error('O navegador não deixou copiar.'); return; }
    setCopia(medirCopia(caixaRef.current, faixa, 1));
    const nCel = (Math.min(faixa.r1, n - 1) - faixa.r0 + 1) * (faixa.c1 - faixa.c0 + 1);
    setSelo(`${plural(nCel, 'célula copiada', 'células copiadas')} · Ctrl+V cola aqui ou no Excel`);
  };

  // COLAR: cada célula passa pelo `interpretarFixo` da sua coluna; abaixo do fim, cada linha com descrição
  // vira um fixo novo. Numa seleção maior, o bloco se repete (como no Excel).
  const colar = (texto) => {
    const bloco = lerBloco(texto);
    if (!bloco.length) return;
    const matriz = ladrilhar(bloco, Math.min(faixa.r1, n - 1) - faixa.r0 + 1, faixa.c1 - faixa.c0 + 1);
    const mudancas = [];
    const novos = [];
    const motivos = [];
    matriz.forEach((cols, i) => {
      const r = faixa.r0 + i;
      const novo = r >= n ? {} : null;
      cols.forEach((t, j) => {
        const c = faixa.c0 + j;
        if (c > ULT || !editavel(c)) return;
        if (!t && c === C_DESC) return;
        const res = interpretarFixo(c, t, { rec: novo ? null : recs[r], categorias });
        if (res.motivo) { if (t) motivos.push(res.motivo); return; }
        if (novo) novo[res.campo] = res.valor; else mudancas.push({ r, campo: res.campo, valor: res.valor });
      });
      if (novo) { if (novo.descricao) novos.push(novo); else if (cols.some(Boolean)) motivos.push('linha nova sem descrição'); }
    });
    if (motivos.length) toast.info(`${plural(motivos.length, 'célula ficou', 'células ficaram')} de fora: ${motivos[0]}${motivos.length > 1 ? '…' : '.'}`);
    aplicar(mudancas, `colar ${plural(mudancas.length, 'valor', 'valores')}`);
    criar(novos, `criar ${plural(novos.length, 'fixo', 'fixos')}`);
  };

  // Ctrl+D: a primeira linha da seleção desce para as outras (as colunas editáveis).
  const preencherAbaixo = () => {
    const r1 = Math.min(faixa.r1, n - 1);
    if (r1 <= faixa.r0) { toast.info('Selecione duas ou mais linhas: a primeira desce para as outras.'); return; }
    const base = recs[faixa.r0];
    const mudancas = [];
    for (let c = faixa.c0; c <= faixa.c1; c++) {
      const campo = COLUNAS_FIXO[c].campo;
      if (!campo || campo === 'descricao') continue;
      for (let r = faixa.r0 + 1; r <= r1; r++) mudancas.push({ r, campo, valor: base[campo] ?? null });
    }
    aplicar(mudancas, 'preencher abaixo');
  };

  // Delete: limpa o que pode ficar vazio (categoria e fim). Com as linhas inteiras selecionadas, exclui.
  const limpar = () => {
    if (linhasInteiras && recsDaFaixa.length) { excluir(recsDaFaixa); return; }
    const mudancas = [];
    for (let r = faixa.r0; r <= Math.min(faixa.r1, n - 1); r++) {
      if (naFaixa(faixa, r, C_CAT)) mudancas.push({ r, campo: 'categoria_id', valor: null });
      if (naFaixa(faixa, r, ULT)) mudancas.push({ r, campo: 'fim', valor: null });
    }
    if (!mudancas.length) { toast.info('Só a categoria e o "termina" ficam vazios. Para tirar o fixo, selecione a linha inteira (o número) e Delete.'); return; }
    aplicar(mudancas, 'limpar');
  };

  const excluir = async (lista) => {
    const ok = await confirmar({
      titulo: lista.length === 1 ? `Excluir o gasto fixo "${lista[0].descricao}"?` : `Excluir ${lista.length} gastos fixos?`,
      texto: 'Os lançamentos que eles já geraram continuam. Isto não se desfaz com Ctrl+Z — se só parou de pagar, prefira desativar ou pôr o "termina".',
      confirmar: 'Excluir', perigo: true,
    });
    focar();
    if (!ok) return;
    enfileirar(async () => {
      try {
        for (const r of lista) await excluirRecorrencia(r.id);
        const ids = new Set(lista.map((r) => r.id));
        setRecs((rs) => rs.filter((x) => !ids.has(x.id)));
        setExt(null);
        toast.success(lista.length === 1 ? 'Gasto fixo excluído.' : `${lista.length} gastos fixos excluídos.`);
      } catch (err) { falhou(err); }
    });
  };

  const alternarAtivo = (lista, valor) => {
    const alvo = valor ?? !lista[0]?.ativa;
    aplicar(lista.map((rec) => ({ r: recs.indexOf(rec), campo: 'ativa', valor: alvo })), alvo ? 'ativar' : 'desativar');
  };

  const usarUltimo = (lista) => {
    const itens = padroesDoUltimo(lista, ultimos);
    if (!itens.length) { toast.info('O padrão já é o último valor lançado.'); return; }
    aplicar(itens.map((e) => ({ r: recs.findIndex((x) => x.id === e.id), campo: 'valor_padrao_centavos', valor: e.depois })),
      itens.length === 1 ? 'usar o último lançado como padrão' : `padrão de ${itens.length} fixos`);
  };

  // ------------------------------------------------------------ edição e teclado

  const comecar = (r, c, texto) => {
    if (c === C_ATIVA) { if (r < n) alternarAtivo([recs[r]]); return; }
    if (!editavel(c)) { toast.info('O último lançado vem dos lançamentos; para mudar, use a aba Meses.'); return; }
    if (r >= n && c !== C_DESC) { setSel({ r, c: C_DESC }); setExt(null); toast.info('Comece pela descrição para criar o fixo.'); return; }
    fechou.current = false;
    setCopia(null);
    const inicial = c === C_CAT ? '' : (r < n ? textoFixo(recs[r], c, { categorias, ultimos }) : '');
    setEditor({ r, c, texto: texto ?? inicial, digitando: texto !== undefined, r1: Math.max(r, Math.min(faixa.r1, n - 1)) });
  };

  const mover = (dr, dc, estender = false) => {
    const base = estender ? (ext ?? sel) : sel;
    const r = Math.max(0, Math.min(n, base.r + dr));
    const c = Math.max(0, Math.min(ULT, base.c + dc));
    if (estender) setExt({ r, c }); else { setSel({ r, c }); setExt(null); }
  };

  const fecharEditor = (gravar, texto, depois) => {
    if (fechou.current || !editor) return;
    const ed = editor;
    if (gravar && ed.c !== C_CAT) {
      if (ed.r >= n) {
        if (String(texto).trim()) criar([{ descricao: String(texto).trim() }], 'criar fixo');
      } else {
        const res = interpretarFixo(ed.c, texto, { rec: recs[ed.r], categorias });
        if (res.motivo) { toast.error(`Não gravou: ${res.motivo}.`); return; }
        aplicar([{ r: ed.r, campo: res.campo, valor: res.valor }], `${COLUNAS_FIXO[ed.c].rotulo.toLowerCase()} de “${recs[ed.r].descricao}”`);
      }
    }
    fechou.current = true;
    setEditor(null);
    if (depois) mover(depois[0], depois[1]);
    setTimeout(focar, 0);
  };

  // A categoria escolhida vai para todas as linhas da seleção.
  const escolherCategoria = (id, depois) => {
    const ed = editor;
    const mudancas = [];
    for (let r = ed.r; r <= ed.r1; r++) if (r < n) mudancas.push({ r, campo: 'categoria_id', valor: id });
    aplicar(mudancas, mudancas.length === 1 ? `categoria de “${recs[ed.r].descricao}”` : `categoria de ${plural(mudancas.length, 'fixo', 'fixos')}`);
    fechou.current = true;
    setEditor(null);
    if (depois) mover(depois[0], depois[1]);
    setTimeout(focar, 0);
  };

  const teclar = (e) => {
    if (editor || menu) return;
    const k = e.key;
    const ctrl = e.ctrlKey || e.metaKey;
    if (ctrl && (k === 'z' || k === 'Z') && !e.shiftKey) { e.preventDefault(); andarPilha('desfazer'); return; }
    if (ctrl && (k === 'y' || k === 'Y' || ((k === 'z' || k === 'Z') && e.shiftKey))) { e.preventDefault(); andarPilha('refazer'); return; }
    if (ctrl && (k === 'a' || k === 'A')) { e.preventDefault(); setSel({ r: 0, c: 0 }); setExt({ r: Math.max(0, n - 1), c: ULT }); return; }
    if (ctrl && (k === 'c' || k === 'C')) { e.preventDefault(); copiar(); return; }
    if (ctrl && (k === 'd' || k === 'D')) { e.preventDefault(); preencherAbaixo(); return; }
    if ((e.shiftKey && k === 'F10') || k === 'ContextMenu') { e.preventDefault(); abrirMenuNaCelula(); return; }
    if (e.shiftKey && k === 'F2') { e.preventDefault(); if (recs[sel.r]) onEditar(recs[sel.r]); return; }
    const setas = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
    if (setas[k]) { e.preventDefault(); let [dr, dc] = setas[k]; if (ctrl) { dr *= 1000; dc *= 100; } mover(dr, dc, e.shiftKey); return; }
    if (k === 'Home' || k === 'End') { e.preventDefault(); const c = k === 'Home' ? 0 : ULT; if (e.shiftKey) setExt({ r: sel.r, c }); else { setSel({ r: sel.r, c }); setExt(null); } return; }
    if (k === 'Tab') { e.preventDefault(); mover(0, e.shiftKey ? -1 : 1); return; }
    if (k === 'Enter' || k === 'F2') { e.preventDefault(); comecar(sel.r, sel.c); return; }
    if (k === ' ' && sel.c === C_ATIVA) { e.preventDefault(); alternarAtivo(recsDaFaixa); return; }
    if (k === 'Delete' || k === 'Backspace') { e.preventDefault(); limpar(); return; }
    if (k === 'Escape') { setExt(null); setCopia(null); setSelo(null); return; }
    if (k.length === 1 && !ctrl && !e.altKey) {
      e.preventDefault();
      if (sel.c === C_ATIVA) { const res = interpretarFixo(C_ATIVA, k); if (!res.motivo) alternarAtivo(recsDaFaixa, res.valor); return; }
      comecar(sel.r, sel.c, k);
    }
  };

  useEffect(() => {
    const soltar = () => { arrasto.current = false; };
    window.addEventListener('mouseup', soltar);
    return () => window.removeEventListener('mouseup', soltar);
  }, []);

  // ------------------------------------------------------------ menu

  const itensMenu = () => {
    const lista = recsDaFaixa;
    const um = lista.length === 1;
    const rec = recs[sel.r];
    const difs = padroesDoUltimo(lista, ultimos).length;
    const topo = pilha.desfazer[pilha.desfazer.length - 1];
    const prox = pilha.refazer[pilha.refazer.length - 1];
    if (!lista.length) return [{ rotulo: 'Colar', icone: <IcoColar />, atalho: 'Ctrl+V', sub: 'linhas do Excel viram fixos novos', onEscolher: colarDoMenu }];
    return [
      { rotulo: 'Copiar', icone: <IcoCopiar />, atalho: 'Ctrl+C', onEscolher: () => copiar() },
      { rotulo: 'Colar', icone: <IcoColar />, atalho: 'Ctrl+V', sub: 'do Excel: cada coluna no seu campo', onEscolher: colarDoMenu },
      { rotulo: 'Preencher abaixo', icone: <IcoPreencher />, atalho: 'Ctrl+D', desabilitado: um, motivo: 'selecione duas ou mais linhas', onEscolher: preencherAbaixo },
      { rotulo: 'Limpar', icone: <IcoLimpar />, atalho: 'Delete', sub: 'categoria e termina', onEscolher: limpar },
      { sep: true },
      { rotulo: difs ? `Usar o último lançado como padrão${difs > 1 ? ` (${difs})` : ''}` : 'Usar o último lançado como padrão', icone: <IcoEtiqueta />,
        desabilitado: !difs, motivo: 'o padrão já é o último lançado', onEscolher: () => usarUltimo(lista) },
      { rotulo: lista[0].ativa ? (um ? 'Desativar' : `Desativar ${lista.length}`) : (um ? 'Ativar' : `Ativar ${lista.length}`), icone: <IcoAtivar />, atalho: 'Espaço',
        sub: lista[0].ativa ? 'some da grade de meses e das pendências' : 'volta a aparecer para lançar', onEscolher: () => alternarAtivo(lista) },
      { rotulo: `Editar “${rec?.descricao}” no formulário…`, icone: <IcoEtiqueta />, atalho: 'Shift+F2', desabilitado: !rec, onEscolher: () => onEditar(rec) },
      { rotulo: um ? 'Excluir o gasto fixo' : `Excluir ${lista.length} gastos fixos`, icone: <IcoLixeira />, perigo: true, sub: 'os lançamentos já feitos continuam', onEscolher: () => excluir(lista) },
      { sep: true },
      topo ? { rotulo: 'Desfazer', icone: <IcoDesfazer />, atalho: 'Ctrl+Z', sub: topo.rotulo, onEscolher: () => andarPilha('desfazer') }
        : { rotulo: 'Desfazer', icone: <IcoDesfazer />, atalho: 'Ctrl+Z', desabilitado: true, motivo: 'nada para desfazer' },
      prox ? { rotulo: 'Refazer', icone: <IcoRefazer />, atalho: 'Ctrl+Y', sub: prox.rotulo, onEscolher: () => andarPilha('refazer') }
        : { rotulo: 'Refazer', icone: <IcoRefazer />, atalho: 'Ctrl+Y', desabilitado: true, motivo: 'nada para refazer' },
    ];
  };
  const colarDoMenu = async () => { try { colar(await navigator.clipboard.readText()); } catch { toast.info('Use Ctrl+V com a célula selecionada.'); } };
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
      const lista = recsDaFaixa;
      setMenu({ x: menu.x, y: menu.y, titulo: lista.length > 1 ? `Seleção · ${plural(lista.length, 'fixo', 'fixos')}` : (lista[0]?.descricao ?? 'Linha nova'), itens: itensMenu() });
    }
  });

  // ------------------------------------------------------------ desenho

  const sombra = (r, c) => {
    const s = [];
    if (multi && naFaixa(faixa, r, c)) {
      if (r === faixa.r0) s.push(`inset 0 2px 0 ${AZUL}`);
      if (r === faixa.r1) s.push(`inset 0 -2px 0 ${AZUL}`);
      if (c === faixa.c0) s.push(`inset 2px 0 0 ${AZUL}`);
      if (c === faixa.c1) s.push(`inset -2px 0 0 ${AZUL}`);
    }
    if (sel.r === r && sel.c === c) s.push(`inset 0 0 0 2px ${AZUL}`);
    return s.length ? s.join(',') : undefined;
  };

  const celulaConteudo = (rec, c) => {
    const id = COLUNAS_FIXO[c].id;
    if (id === 'ativa') {
      return (
        <button type="button" role="switch" aria-checked={rec.ativa} title={rec.ativa ? 'Ativo: aparece para lançar todo mês. Clique para desativar.' : 'Inativo. Clique para ativar.'}
          onMouseDown={(e) => e.stopPropagation()} onClick={() => alternarAtivo([rec])}
          className={`relative inline-flex h-[16px] w-[28px] shrink-0 items-center rounded-full transition-colors duration-150 ${rec.ativa ? 'bg-hx-16a34a' : 'bg-gray-300'}`}>
          <span className={`absolute h-[12px] w-[12px] rounded-full bg-white shadow-sm transition-[left] duration-150 ${rec.ativa ? 'left-[14px]' : 'left-[2px]'}`} />
        </button>
      );
    }
    if (id === 'descricao') return <span className={`truncate ${rec.ativa ? 'text-gray-900' : 'text-gray-400'}`}>{rec.descricao}</span>;
    if (id === 'categoria') {
      return rec.categoria
        ? <><span className="mr-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: rec.categoria.grupo?.cor }} /><span className="truncate">{rec.categoria.nome}</span></>
        : <span className="text-gray-400">Sem categoria</span>;
    }
    if (id === 'dia') return <span className="tabular-nums">{rec.dia_do_mes}</span>;
    if (id === 'valor') return <span className="font-medium tabular-nums text-gray-900">{formatBRL(rec.valor_padrao_centavos)}</span>;
    if (id === 'ultimo') {
      const u = ultimos[rec.id];
      if (!u) return <span className="text-gray-300">—</span>;
      const difere = u.valor_centavos !== Number(rec.valor_padrao_centavos);
      return (
        <>
          <span className="tabular-nums text-gray-600" title={`Lançado em ${competenciaCurta(u.competencia)}`}>{formatBRL(u.valor_centavos)}</span>
          {difere && (
            <button type="button" onMouseDown={(e) => e.stopPropagation()} onClick={() => usarUltimo([rec])}
              title={`Diferente do padrão (${formatBRL(rec.valor_padrao_centavos)}). Clique para usar ${formatBRL(u.valor_centavos)} como padrão.`}
              className="ml-1.5 inline-flex h-[16px] w-[16px] shrink-0 items-center justify-center rounded-[4px] bg-hx-fef3c7 text-[11px] font-bold text-hx-92400e transition-[filter] hover:brightness-95">≠</button>
          )}
        </>
      );
    }
    if (id === 'inicio') return <span className="tabular-nums">{mesCurto(rec.inicio)}</span>;
    if (id === 'fim') return rec.fim ? <span className="tabular-nums">{mesCurto(rec.fim)}</span> : <span className="italic text-gray-400">sem fim</span>;
    return null;
  };

  const ativos = recs.filter((r) => r.ativa);
  const difsSel = padroesDoUltimo(recsDaFaixa, ultimos).length;
  const variasLinhas = recsDaFaixa.length > 1 || (linhasInteiras && recsDaFaixa.length);
  const tipoNovaCat = 'saida';

  return (
    <div>
      <div ref={caixaRef} tabIndex={0} onKeyDown={teclar}
        onFocus={() => setFocada(true)}
        onBlur={(e) => { if (!caixaRef.current?.contains(e.relatedTarget)) setFocada(false); }}
        onPaste={(e) => {
          if (editor || (e.target !== caixaRef.current && e.target.closest?.('input, textarea'))) return;
          e.preventDefault();
          colar(e.clipboardData?.getData('text/plain') ?? '');
        }}
        className="max-h-[calc(100vh-250px)] min-h-[200px] overflow-auto rounded-t-lg border border-gray-300 bg-white outline-none"
        style={{ scrollPaddingTop: 34 }}>
        <table className="w-full min-w-[980px] table-fixed border-separate border-spacing-0 text-[12.5px]">
          <colgroup><col style={{ width: 40 }} />{LARGURAS.map((w, i) => <col key={i} style={w ? { width: w } : undefined} />)}<col style={{ width: 40 }} /></colgroup>
          <thead>
            <tr>
              <th onMouseDown={(e) => { e.preventDefault(); focar(); setSel({ r: 0, c: 0 }); setExt({ r: Math.max(0, n - 1), c: ULT }); }}
                title="Selecionar tudo"
                className="sticky left-0 top-0 z-30 h-[33px] cursor-pointer border-b border-r border-gray-300 bg-hx-f9fafb transition-colors hover:bg-gray-200" />
              {COLUNAS_FIXO.map((col, c) => {
                const acesa = c >= faixa.c0 && c <= faixa.c1;
                return (
                  <th key={col.id}
                    onMouseDown={(e) => { e.preventDefault(); focar(); if (e.shiftKey) setExt({ r: Math.max(0, n - 1), c }); else { setSel({ r: 0, c }); setExt({ r: Math.max(0, n - 1), c }); } }}
                    title={col.campo ? `Clique para selecionar a coluna. ${col.id === 'ultimo' ? '' : 'Ctrl+V cola uma coluna do Excel.'}` : 'Só leitura: o valor do lançamento mais recente deste fixo.'}
                    style={acesa ? { boxShadow: `inset 0 -2px 0 ${AZUL}` } : undefined}
                    className={`sticky top-0 z-20 cursor-pointer select-none border-b border-r border-gray-300 px-2.5 text-[11px] font-semibold uppercase tracking-wide transition-colors duration-[120ms] hover:bg-gray-200 hover:text-gray-900 ${
                      col.direita ? 'text-right' : 'text-left'} ${acesa ? 'bg-hx-eef2f7 text-gray-800' : 'bg-hx-f9fafb text-gray-500'}`}>
                    {col.rotulo}
                  </th>
                );
              })}
              <th className="sticky top-0 z-20 border-b border-gray-300 bg-hx-f9fafb" />
            </tr>
          </thead>
          <tbody>
            {[...recs, null].map((rec, r) => {
              const novo = rec === null;
              const linhaAcesa = r >= faixa.r0 && r <= faixa.r1;
              return (
                <tr key={rec?.id ?? 'novo'} className="group/linha">
                  <td onMouseDown={(e) => { e.preventDefault(); focar(); if (e.shiftKey) { setSel((s) => ({ r: s.r, c: 0 })); setExt({ r, c: ULT }); } else { setSel({ r, c: 0 }); setExt({ r, c: ULT }); } }}
                    onContextMenu={(e) => abrirMenu(e, r, 0)}
                    className={`sticky left-0 z-10 h-8 cursor-pointer select-none border-b border-r border-gray-300 text-center text-[11px] tabular-nums transition-colors hover:bg-gray-200 ${
                      linhaAcesa ? 'bg-hx-dbe7fb text-hx-1d4ed8' : 'bg-hx-f9fafb text-gray-400'}`}>
                    {novo ? '+' : r + 1}
                  </td>
                  {COLUNAS_FIXO.map((col, c) => {
                    const editando = editor && editor.r === r && editor.c === c;
                    const acesa = multi && naFaixa(faixa, r, c) && !(sel.r === r && sel.c === c);
                    return (
                      <td key={col.id} data-cel={`${r}:${c}`}
                        onMouseDown={(e) => { if (e.button !== 0) return; e.preventDefault(); focar(); if (e.shiftKey) setExt({ r, c }); else { setSel({ r, c }); setExt(null); arrasto.current = true; } }}
                        onMouseEnter={() => { if (arrasto.current) setExt({ r, c }); }}
                        onDoubleClick={() => comecar(r, c)} onContextMenu={(e) => abrirMenu(e, r, c)}
                        style={{ boxShadow: sombra(r, c) }}
                        className={`relative h-8 cursor-cell select-none border-b border-r border-gray-100 px-2.5 ${col.direita ? 'text-right' : 'text-left'} ${
                          acesa ? 'bg-hx-eff5ff' : col.id === 'ultimo' ? 'bg-hx-fafafa' : ''} ${novo ? 'bg-hx-fcfcfd' : ''}`}>
                        <div className={`flex min-w-0 items-center ${col.direita ? 'justify-end' : ''}`}>
                          {novo
                            ? (c === C_DESC ? <span className="truncate italic text-gray-400">Novo gasto fixo — digite a descrição</span> : null)
                            : celulaConteudo(rec, c)}
                        </div>
                        <BordaCopia borda={bordaDaCopia(copia, r, c)} foco={focada} />
                        {editando && (
                          <EditorFixo editor={editor} rec={rec} categorias={categorias}
                            onTexto={(t) => setEditor((ed) => ({ ...ed, texto: t }))}
                            onFechar={fecharEditor} onCategoria={escolherCategoria}
                            onCriarCategoria={(nome) => { setCriandoCat({ nome, r0: editor.r, r1: editor.r1 }); setEditor(null); }} />
                        )}
                      </td>
                    );
                  })}
                  <td className="h-8 border-b border-gray-100 text-center">
                    {!novo && (
                      <button type="button" title={`Excluir “${rec.descricao}”`} onClick={() => excluir([rec])}
                        className="inline-flex h-6 w-6 items-center justify-center rounded-[4px] text-gray-400 opacity-0 transition-[opacity,background-color,color] duration-[120ms] hover:bg-hx-fdeaea hover:text-hx-c0393d focus:opacity-100 group-hover/linha:opacity-100">
                        <IcoLixeira />
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* A BARRA DE BAIXO: o total dos padrões; com várias linhas selecionadas, as ações em lote. */}
      <div className={`flex min-h-[32px] flex-wrap items-center gap-x-3 gap-y-1 rounded-b-lg border border-t-0 px-3 py-1 text-[12px] tabular-nums transition-colors duration-150 ${
        variasLinhas ? 'border-hx-bfdbfe bg-hx-eff5ff text-gray-700' : 'border-gray-300 bg-hx-f9fafb text-gray-500'}`}>
        {variasLinhas ? (
          <>
            <b className="font-semibold text-gray-900">{plural(recsDaFaixa.length, 'fixo selecionado', 'fixos selecionados')}</b>
            <span>padrão {formatBRL(recsDaFaixa.reduce((s, r) => s + Number(r.valor_padrao_centavos), 0))}</span>
            <span className="h-4 w-px bg-gray-300" />
            <BotaoBarra onClick={() => usarUltimo(recsDaFaixa)} desabilitado={!difsSel} titulo={difsSel ? `${difsSel} com o último lançado diferente do padrão` : 'O padrão já é o último lançado em todos'}>
              Usar o último lançado como padrão{difsSel ? ` (${difsSel})` : ''}
            </BotaoBarra>
            <BotaoBarra onClick={() => alternarAtivo(recsDaFaixa)}>{recsDaFaixa[0]?.ativa ? 'Desativar' : 'Ativar'}</BotaoBarra>
            <BotaoBarra onClick={() => excluir(recsDaFaixa)} perigo>Excluir</BotaoBarra>
          </>
        ) : (
          <span className="truncate">
            {plural(recs.length, 'gasto fixo', 'gastos fixos')} · <b className="font-semibold text-gray-800">{plural(ativos.length, 'ativo', 'ativos')}</b>
            {' '}· padrão dos ativos <b className="font-semibold text-gray-800">{formatBRL(ativos.reduce((s, r) => s + Number(r.valor_padrao_centavos), 0))}</b>/mês
          </span>
        )}
        <span className="flex-1" />
        {selo && <span className="text-hx-15803d">✓ {selo}</span>}
        {!selo && !variasLinhas && <span className="hidden truncate text-gray-400 lg:inline">Digite e Enter grava · Ctrl+V cola do Excel · Ctrl+D repete o de cima · o número seleciona a linha</span>}
      </div>
      <p className="mt-1.5 text-[11.5px] text-gray-400">Mudar o padrão não mexe no que já foi lançado: vale para as próximas sugestões.</p>

      <MenuContexto menu={menu?.pendente ? null : menu} onFechar={() => setMenu(null)} />

      {criandoCat && (
        <ModalCategoria tipo={tipoNovaCat} nomeInicial={criandoCat.nome}
          onFechar={() => { setCriandoCat(null); setTimeout(focar, 0); }}
          onSalvo={(cat) => {
            const { r0, r1 } = criandoCat;
            setCriandoCat(null);
            onCategoriaCriada(cat);
            const mudancas = [];
            for (let r = r0; r <= r1; r++) if (r < n) mudancas.push({ r, campo: 'categoria_id', valor: cat.id });
            // A lista de categorias ainda não tem a nova: o nome vem do próprio cadastro.
            setRecs((rs) => rs.map((x, i) => (i >= r0 && i <= r1 ? { ...x, categoria: { id: cat.id, nome: cat.nome, grupo: cat.grupo } } : x)));
            aplicar(mudancas, `categoria “${cat.nome}”`);
            setTimeout(focar, 0);
          }} />
      )}
    </div>
  );
}

function BotaoBarra({ children, onClick, desabilitado = false, perigo = false, titulo }) {
  return (
    <button type="button" onClick={onClick} disabled={desabilitado} title={titulo}
      className={`inline-flex h-[24px] items-center whitespace-nowrap rounded-[5px] border px-2.5 text-[12px] transition-colors duration-[120ms] disabled:opacity-50 ${
        perigo ? 'border-hx-f5c2c2 bg-white text-hx-c0393d hover:bg-hx-fdeaea' : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-100 active:bg-gray-200'}`}>
      {children}
    </button>
  );
}

// O campo dentro da célula. Na categoria, a lista da grade dos Lançamentos (busca, grupos, "criar").
function EditorFixo({ editor, rec, categorias, onTexto, onFechar, onCategoria, onCriarCategoria }) {
  const inputRef = useRef(null);
  const col = COLUNAS_FIXO[editor.c];
  const ehCategoria = col.id === 'categoria';
  const [ativo, setAtivo] = useState(0);

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.focus();
    const fim = el.value.length;
    el.setSelectionRange(fim, fim);
  }, []);

  const opcoes = useMemo(() => {
    if (!ehCategoria) return [];
    const t = norm(editor.texto);
    const lista = opcoesCategoria(categorias, { tipo: 'saida', atual: rec?.categoria_id })
      .filter((o) => !t || norm(o.label).includes(t) || norm(o.grupo.nome).includes(t));
    return t ? lista : [{ value: null, label: 'Sem categoria' }, ...lista];
  }, [ehCategoria, categorias, editor.texto, rec]);
  useEffect(() => { setAtivo(0); }, [editor.texto]);

  const teclas = (e) => {
    const k = e.key;
    e.stopPropagation();
    if (k === 'Escape') { e.preventDefault(); onFechar(false); return; }
    if (ehCategoria) {
      if (k === 'ArrowDown') { e.preventDefault(); setAtivo((i) => Math.min(i + 1, opcoes.length - 1)); return; }
      if (k === 'ArrowUp') { e.preventDefault(); setAtivo((i) => Math.max(i - 1, 0)); return; }
      if (k === 'Enter' || k === 'Tab') {
        e.preventDefault();
        const depois = k === 'Tab' ? [0, e.shiftKey ? -1 : 1] : [e.shiftKey ? -1 : 1, 0];
        if (opcoes[ativo]) onCategoria(opcoes[ativo].value, depois);
        else if (editor.texto.trim()) onCriarCategoria(editor.texto.trim());
        else onFechar(false, '', depois);
      }
      return;
    }
    if (k === 'Enter') { e.preventDefault(); onFechar(true, e.currentTarget.value, [e.shiftKey ? -1 : 1, 0]); return; }
    if (k === 'Tab') { e.preventDefault(); onFechar(true, e.currentTarget.value, [0, e.shiftKey ? -1 : 1]); return; }
    if (editor.digitando && (k === 'ArrowUp' || k === 'ArrowDown')) {
      e.preventDefault();
      onFechar(true, e.currentTarget.value, [k === 'ArrowUp' ? -1 : 1, 0]);
    }
  };

  const dica = { inicio: 'mm/aaaa', fim: 'mm/aaaa (vazio = sem fim)', dia: '1 a 31', valor: '0,00', descricao: 'Descrição' }[col.id] ?? '';
  return (
    <>
      <input ref={inputRef} value={editor.texto} onChange={(e) => onTexto(e.target.value)} onKeyDown={teclas}
        onBlur={(e) => { if (!ehCategoria && !e.relatedTarget?.closest?.('[data-lista-cat]')) onFechar(true, e.target.value); }}
        onMouseDown={(e) => e.stopPropagation()}
        inputMode={col.id === 'valor' || col.id === 'dia' ? 'decimal' : undefined}
        placeholder={ehCategoria ? (rec?.categoria?.nome ?? 'Buscar categoria') : dica}
        className={`absolute inset-0 z-20 h-full w-full border-0 bg-white px-2.5 text-[12.5px] text-gray-900 outline-none ${col.direita ? 'text-right tabular-nums' : ''}`}
        style={{ boxShadow: `inset 0 0 0 2px ${AZUL}` }} />
      {ehCategoria && (
        <ListaCategorias ancora={inputRef} opcoes={opcoes} ativo={ativo} onAtivo={setAtivo} texto={editor.texto}
          onEscolher={(o) => onCategoria(o.value)} onCriar={() => onCriarCategoria(editor.texto.trim())}
          onFora={() => onFechar(false)} />
      )}
    </>
  );
}
