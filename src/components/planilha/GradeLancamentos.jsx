import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import MenuContexto from '../MenuContexto.jsx';
import BordaCopia, { bordaDaCopia, medirCopia } from './BordaCopia.jsx';
import ModalCategoria from '../ModalCategoria.jsx';
import { Etiqueta } from '../Comuns.jsx';
import { IconSetaOrdenacao } from '../icons.jsx';
import { opcoesCategoria } from '../SelectBusca.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { useConfirmacao } from '../../context/ConfirmContext.jsx';
import {
  atualizarCampos, criarLancamentos, excluirLancamentos, restaurarLancamentos,
} from '../../api/lancamentos.js';
import {
  COLUNAS, colunaEditavel, descricaoDaEntrada, faixaDe, interpretar, ladrilhar, lerBloco, limparFaixa, naFaixa, planejarColagem, preencherAbaixo,
  resumoSelecao, textoDaFaixa, textoOrigem,
} from '../../lib/planilha.js';
import { formatBRL, valorParaCampo } from '../../lib/dinheiro.js';
import { competenciaAtual, formatDate, todayISO } from '../../lib/format.js';
import posicionarPopover from '../../lib/posicionarPopover.js';
import { copiarTexto } from '../../lib/copiar.js';
import {
  IcoAbrir, IcoAbaixo, IcoAcima, IcoColar, IcoCopiar, IcoDesfazer, IcoEtiqueta, IcoLimpar, IcoLixeira, IcoPreencher,
  IcoRefazer, IcoRevisado,
} from './iconesMenu.jsx';

// A GRADE DE LANÇAMENTOS COMO PLANILHA — a tabela D do mockup, no jeito da grade do DRE do Gestor
// (`components/dre/GradeDre.jsx` de lá). As contas puras moram em `lib/planilha.js`; aqui ficam o
// teclado, o mouse, o menu e a gravação.
//
// SELEÇÃO: `sel` é a célula ATIVA (onde se digita, e o canto de onde a faixa parte) e `ext` o outro
// canto; sem `ext` a seleção é uma célula só. Shift+setas, Shift+clique e arrastar o mouse estendem a
// faixa; clicar no número da linha pega a linha inteira, no cabeçalho a coluna inteira.
//
// O TECLADO É O DE UMA PLANILHA, e quem o ouve é a CAIXA (focável), não as células: setas andam,
// digitar começa a editar substituindo o valor, F2/Enter/duplo clique editam o que está lá, Enter
// grava e desce, Tab vai para a direita, Esc cancela, Delete limpa. Ctrl+C / Ctrl+V levam e trazem
// blocos do Excel, Ctrl+D preenche para baixo, Ctrl+Z / Ctrl+Y desfazem e refazem, Ctrl+Shift+=
// insere linha e Ctrl+− exclui as linhas da seleção. O botão direito (e Shift+F10) abre o menu.
//
// LINHAS NOVAS: há sempre uma linha em branco no fim (a "próxima linha" do Excel), e "Inserir linha"
// cria outra acima ou abaixo. Elas são RASCUNHOS (`rascunho: true`, só na tela) até terem data e valor;
// aí viram lançamento avulso (ou entrada, com "+" no valor) no mês que está na tela. Sair de um
// rascunho vazio o descarta.
//
// GRAVA CAMPO A CAMPO, otimista: a tela muda na hora e o banco vem atrás, numa FILA (uma gravação por
// vez, na ordem). Se o banco recusar, avisa e recarrega o mês. O DESFAZER guarda o antes e o depois de
// cada ação (campos, linhas criadas, linhas excluídas) desde que a tela abriu; excluir e desfazer
// devolve as linhas com o MESMO id, então o resto da pilha continua valendo.

const LARGURAS = { data: 104, descricao: undefined, categoria: 224, origem: 168, valor: 132, obs: 210 };
const C_CAT = COLUNAS.findIndex((c) => c.id === 'categoria');
const ULTIMA_COL = COLUNAS.length - 1;
const AZUL = 'var(--grade-sel)';
const norm = (s) => String(s ?? '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();
const plural = (n, um, varios) => `${n.toLocaleString('pt-BR')} ${n === 1 ? um : varios}`;
const vazio = (l) => !l.descricao && !l.valor_centavos && !l.categoria_id && !l.obs;

let seqRascunho = 0;

// O texto que vai para o campo ao editar o que já está na célula (F2, Enter, duplo clique).
function textoEdicao(l, c) {
  switch (COLUNAS[c].id) {
    case 'data': return l.data ? formatDate(l.data) : '';
    case 'valor': return l.valor_centavos ? valorParaCampo(l.valor_centavos) : '';
    case 'categoria': return '';
    default: return l[COLUNAS[c].campo] ?? '';
  }
}

// `linhas`: as da tela (filtradas, na ordem mostrada, com os rascunhos). `todas`/`setTodas`: a lista
// inteira do mês, que é da página (os indicadores e os filtros saem dela).
export default function GradeLancamentos({ linhas, todas, setTodas, categorias, comp, onAbrir, onRecarregar, onCategoriaCriada, ordem = null, onOrdenar }) {
  const toast = useToast();
  const todasRef = useRef(todas);
  todasRef.current = todas;
  const confirmar = useConfirmacao();
  const caixaRef = useRef(null);
  const [sel, setSel] = useState({ r: 0, c: 0 });
  const [ext, setExt] = useState(null);
  // Esc TIRA A SELEÇÃO (como na grade do DRE): nada aceso, sem a barra da soma. A célula de antes fica guardada
  // em `sel`; uma seta, Tab, Enter ou um clique a traz de volta (qualquer `setSel`/`setExt` novo a acende).
  const [apagada, setApagada] = useState(false);
  const apagando = useRef(false);
  useEffect(() => {
    if (apagando.current) { apagando.current = false; return; }
    setApagada(false);
  }, [sel, ext]);
  const [editor, setEditor] = useState(null);     // { r, c, texto, digitando }
  const [menu, setMenu] = useState(null);
  const [marcas, setMarcas] = useState(null);     // { alcance, fora: Map("r:c" → motivo) } — a última colagem
  const [selo, setSelo] = useState(null);         // "N células copiadas" (some sozinho)
  const [copia, setCopia] = useState(null);       // o bloco copiado (a borda que anda), com as medidas
  const [focada, setFocada] = useState(false);    // a grade tem o foco (a borda da cópia fica azul)
  const [pilha, setPilha] = useState({ desfazer: [], refazer: [] });
  const [criandoCat, setCriandoCat] = useState(null); // { nome, r0, r1 }
  const arrasto = useRef(null);                   // 'faixa' | 'preencher' | null
  const [alvoPreencher, setAlvoPreencher] = useState(null);
  const fila = useRef(Promise.resolve());

  // A última linha (n) é a linha em branco do fim; as reais e os rascunhos vão de 0 a n−1.
  const n = linhas.length;
  const faixa = faixaDe(sel, ext ?? sel);
  const multi = faixa.r0 !== faixa.r1 || faixa.c0 !== faixa.c1;
  const vis = !apagada; // a seleção aparece
  const catPorId = useMemo(() => new Map(categorias.map((c) => [c.id, c])), [categorias]);
  const comCategoria = useCallback((l) => ({ ...l, categoria: l.categoria_id ? catPorId.get(l.categoria_id) ?? l.categoria : null }), [catPorId]);
  const anoBase = Number(comp.slice(0, 4));

  // A seleção nunca passa da linha em branco (o filtro pode encolher a lista).
  useEffect(() => {
    if (sel.r > n) setSel((s) => ({ ...s, r: n }));
    if (ext && ext.r > n) setExt(null);
  }, [n, sel.r, ext]);

  // Sair de um RASCUNHO vazio o descarta (o "Inserir linha" que não foi usado).
  useEffect(() => {
    setTodas((todas) => {
      const ativo = linhas[sel.r]?.id;
      const sobra = todas.filter((l) => !l.rascunho || l.id === ativo || !vazio(l));
      return sobra.length === todas.length ? todas : sobra;
    });
  }, [sel.r]);

  // A célula ativa sempre à vista (o `scroll-padding` desconta o cabeçalho fixo).
  useLayoutEffect(() => {
    caixaRef.current?.querySelector(`[data-cel="${sel.r}:${sel.c}"]`)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [sel.r, sel.c]);

  // Trocar de mês tira a borda da cópia (as linhas são outras).
  useEffect(() => { setCopia(null); }, [comp]);

  useEffect(() => {
    if (!selo) return undefined;
    const t = setTimeout(() => setSelo(null), 2200);
    return () => clearTimeout(t);
  }, [selo]);

  const focar = () => caixaRef.current?.focus({ preventScroll: true });
  const enfileirar = (fn) => { fila.current = fila.current.then(fn, fn); return fila.current; };
  const falhou = (err) => { toast.error(err.message); onRecarregar(); };

  // ------------------------------------------------------------ gravar

  // Um rascunho novo, com a data e o tipo da linha de referência (a de cima, ou a última da tela).
  const novoRascunho = useCallback((ref, extra = {}) => {
    seqRascunho += 1;
    const tipo = ref?.tipo === 'entrada' ? 'entrada' : 'saida';
    const data = ref?.data ?? (comp === competenciaAtual() ? todayISO() : `${comp}-01`);
    return {
      id: `rascunho-${seqRascunho}`, rascunho: true, tipo, origem: tipo === 'entrada' ? 'entrada' : 'manual',
      data, competencia: comp, descricao: '', categoria_id: null, categoria: null, valor_centavos: null, obs: '', ...extra,
    };
  }, [comp]);

  const empilhar = (acao) => setPilha((p) => ({ desfazer: [...p.desfazer, acao].slice(-100), refazer: [] }));

  // Põe de volta linhas que saíram (o desfazer de uma exclusão, o refazer de uma criação), cada uma
  // antes da linha que estava depois dela.
  const reporLocal = (todas, registros) => {
    const t = [...todas];
    registros.forEach(({ linha, antesDe }) => {
      const i = antesDe ? t.findIndex((x) => x.id === antesDe) : -1;
      if (i >= 0) t.splice(i, 0, linha); else t.push(linha);
    });
    return t;
  };
  const vizinhos = (todas, ids) => ids.map((id) => {
    const i = todas.findIndex((x) => x.id === id);
    const prox = todas.slice(i + 1).find((x) => !ids.includes(x.id) && !x.rascunho);
    return { linha: todas[i], antesDe: prox?.id ?? null };
  });

  // APLICA mudanças [{ r, campo, valor }] (r de linha real, de rascunho ou além do fim = linha nova).
  // `entradas`: as linhas novas cujo valor veio com "+".
  const aplicar = useCallback((mudancas, rotulo, { entradas = new Set() } = {}) => {
    if (!mudancas.length) return;
    const porLinha = new Map();
    mudancas.forEach((m) => { if (!porLinha.has(m.r)) porLinha.set(m.r, {}); porLinha.get(m.r)[m.campo] = m.valor; });
    const edicoes = [];
    const rascunhos = [];
    let ref = linhas[n - 1];
    [...porLinha.keys()].sort((a, b) => a - b).forEach((r) => {
      const campos = porLinha.get(r);
      const l = linhas[r];
      if (l && !l.rascunho) {
        const antes = {};
        const depois = {};
        Object.entries(campos).forEach(([k, v]) => {
          if ((l[k] ?? null) !== (v ?? null)) { antes[k] = l[k] ?? null; depois[k] = v; }
        });
        if ('categoria_id' in depois) {
          antes.revisar = l.revisar;
          // numa entrada, a categoria escolhida dá a descrição (`descricaoDaEntrada`)
          const nova = descricaoDaEntrada({ tipo: l.tipo, descricao: 'descricao' in depois ? depois.descricao : l.descricao,
            catAntes: catPorId.get(l.categoria_id), catDepois: catPorId.get(depois.categoria_id) });
          if (nova) { if (!('descricao' in antes)) antes.descricao = l.descricao ?? null; depois.descricao = nova; }
        }
        if (Object.keys(depois).length) edicoes.push({ id: l.id, antes, depois });
        return;
      }
      let d = { ...(l ?? novoRascunho(ref)), ...campos };
      if (entradas.has(r)) d.tipo = 'entrada';
      // NUMA LINHA NOVA, A CATEGORIA DECIDE O TIPO (30/10/2026): escolher "Salário" faz dela uma entrada (antes a
      // lista só mostrava as do tipo da linha de cima). O "+" do valor manda mais: com ele, a categoria que não
      // combina sai.
      const cat = catPorId.get(d.categoria_id);
      if (cat && cat.grupo.tipo !== d.tipo) {
        if ('categoria_id' in campos && !entradas.has(r)) d.tipo = cat.grupo.tipo; else d.categoria_id = null;
      }
      d.origem = d.tipo === 'entrada' ? 'entrada' : 'manual';
      if ('categoria_id' in campos) {
        const nova = descricaoDaEntrada({ tipo: d.tipo, descricao: d.descricao, catAntes: catPorId.get(l?.categoria_id), catDepois: catPorId.get(d.categoria_id) });
        if (nova) d.descricao = nova;
      }
      d = comCategoria(d);
      rascunhos.push({ existente: !!l, d });
      ref = d;
    });
    if (!edicoes.length && !rascunhos.length) return;

    // 1) A tela muda na hora.
    const porId = new Map(edicoes.map((e) => [e.id, e]));
    setTodas((todas) => {
      let t = todas.map((x) => {
        const e = porId.get(x.id);
        if (e) return comCategoria({ ...x, ...e.depois, revisar: 'categoria_id' in e.depois ? false : x.revisar });
        const rr = rascunhos.find((q) => q.existente && q.d.id === x.id);
        return rr ? rr.d : x;
      });
      const novos = rascunhos.filter((q) => !q.existente).map((q) => q.d);
      if (novos.length) t = [...t, ...novos];
      return t;
    });

    // 2) O banco vem atrás. Rascunho com data e valor vira lançamento.
    const completos = rascunhos.map((q) => q.d).filter((d) => d.data && d.valor_centavos > 0);
    enfileirar(async () => {
      try {
        const [atualizadas, criadas] = await Promise.all([
          Promise.all(edicoes.map((e) => atualizarCampos(e.id, e.depois))),
          completos.length ? criarLancamentos(completos) : Promise.resolve([]),
        ]);
        const trocaRascunho = new Map(completos.map((d, i) => [d.id, criadas[i]]));
        const atual = new Map(atualizadas.map((l) => [l.id, l]));
        setTodas((todas) => todas.map((x) => atual.get(x.id) ?? trocaRascunho.get(x.id) ?? x));
        const partes = [];
        if (edicoes.length) partes.push({ tipo: 'campos', itens: edicoes });
        if (criadas.length) partes.push({ tipo: 'criar', ids: criadas.map((l) => l.id) });
        if (partes.length) empilhar({ rotulo, partes });
      } catch (err) { falhou(err); }
    });
  }, [linhas, n, catPorId, comCategoria, novoRascunho, setTodas]);

  // Desfazer e refazer: cada parte tem o seu caminho de volta. As partes andam em ordem inversa.
  const executarParte = async (parte, sentido) => {
    if (parte.tipo === 'campos') {
      const voltas = await Promise.all(parte.itens.map((e) => atualizarCampos(e.id, sentido === 'desfazer' ? e.antes : e.depois)));
      const m = new Map(voltas.map((l) => [l.id, l]));
      setTodas((todas) => todas.map((x) => m.get(x.id) ?? x));
      return parte;
    }
    // Criar e excluir são o inverso um do outro: tirar guarda onde cada linha estava, repor devolve lá.
    const tirar = (parte.tipo === 'criar') === (sentido === 'desfazer');
    if (tirar) {
      const registros = vizinhos(todasRef.current, parte.ids);
      await excluirLancamentos(parte.ids);
      setTodas((todas) => todas.filter((x) => !parte.ids.includes(x.id)));
      return { ...parte, registros };
    }
    const voltaram = await restaurarLancamentos(parte.registros.map((q) => q.linha));
    const m = new Map(voltaram.map((l) => [l.id, l]));
    setTodas((todas) => reporLocal(todas, parte.registros.map((q) => ({ ...q, linha: m.get(q.linha.id) ?? q.linha }))));
    return parte;
  };

  const andarPilha = (sentido) => {
    const de = sentido === 'desfazer' ? 'desfazer' : 'refazer';
    const para = sentido === 'desfazer' ? 'refazer' : 'desfazer';
    const acao = pilha[de][pilha[de].length - 1];
    if (!acao) return;
    setPilha((p) => ({ ...p, [de]: p[de].slice(0, -1) }));
    setMarcas(null);
    setCopia(null);
    enfileirar(async () => {
      try {
        const ordem = sentido === 'desfazer' ? [...acao.partes].reverse() : acao.partes;
        const feitas = [];
        for (const parte of ordem) feitas.push(await executarParte(parte, sentido));
        const partes = sentido === 'desfazer' ? feitas.reverse() : feitas;
        setPilha((p) => ({ ...p, [para]: [...p[para], { ...acao, partes }] }));
        toast.success(`${sentido === 'desfazer' ? 'Desfeito' : 'Refeito'}: ${acao.rotulo}.`);
      } catch (err) { falhou(err); }
    });
  };

  // ------------------------------------------------------------ ações

  const linhasReais = (f) => linhas.slice(f.r0, Math.min(f.r1, n - 1) + 1).filter((l) => l && !l.rascunho);

  // COPIAR (Ctrl+C e o menu): o bloco como o Excel lê, e a borda que anda em volta dele até o Esc, uma
  // edição ou um desfazer — como no DRE. É o keydown que copia, e não o evento `copy`: numa caixa que não
  // é campo de texto o navegador nem sempre o dispara.
  const copiar = async (f = faixa) => {
    const g = { ...f, r1: Math.min(f.r1, n - 1) };
    if (g.r1 < g.r0) return;
    const ok = await copiarTexto(textoDaFaixa(linhas, g));
    focar();
    if (!ok) { toast.error('O navegador não deixou copiar.'); return; }
    setCopia(medirCopia(caixaRef.current, g, 1));
    setSelo(`${plural((g.r1 - g.r0 + 1) * (g.c1 - g.c0 + 1), 'célula copiada', 'células copiadas')} · Ctrl+V cola aqui ou no Excel`);
  };

  const colarTexto = (texto, inicio = { r: faixa.r0, c: faixa.c0 }) => {
    const matriz = lerBloco(texto);
    if (!matriz.length || (matriz.length === 1 && matriz[0].length === 1 && !matriz[0][0])) return;
    // Numa seleção maior, o bloco se repete como no Excel (um valor só enche a seleção inteira). A linha
    // em branco do fim não conta como parte da seleção.
    const nLin = Math.max(1, Math.min(faixa.r1, n - 1) - faixa.r0 + 1);
    const plano = planejarColagem({ matriz: ladrilhar(matriz, nLin, faixa.c1 - faixa.c0 + 1), linhas, inicio, categorias, anoBase });
    const { mudancas, fora, entradas, alcance, foraDaGrade } = plano;
    setSel({ r: alcance.r0, c: alcance.c0 });
    setExt({ r: alcance.r1, c: alcance.c1 });
    setMarcas({ alcance, fora: new Map(fora.map((x) => [`${x.r}:${x.c}`, x.motivo])) });
    aplicar(mudancas, `colar ${plural(mudancas.length, 'célula', 'células')}`, { entradas });
    const ficou = fora.length + foraDaGrade;
    if (ficou) toast.info(`${plural(mudancas.length, 'célula colada', 'células coladas')} · ${ficou} de fora (passe o mouse nas hachuradas).`);
  };

  const colarDoMenu = async () => {
    try { colarTexto(await navigator.clipboard.readText()); } catch { toast.info('O navegador não liberou o que foi copiado: selecione a célula e use Ctrl+V.'); }
  };

  const preencher = (f = faixa) => {
    const g = { ...f, r1: Math.min(f.r1, n - 1) };
    if (g.r1 <= g.r0) return;
    const { mudancas, fora } = preencherAbaixo(linhas, g);
    setMarcas(fora.length ? { alcance: g, fora: new Map(fora.map((x) => [`${x.r}:${x.c}`, x.motivo])) } : null);
    aplicar(mudancas, `preencher ${plural(mudancas.length, 'célula', 'células')}`);
  };

  const limpar = () => {
    const g = { ...faixa, r1: Math.min(faixa.r1, n - 1) };
    if (g.r1 < g.r0) return;
    const { mudancas, presos } = limparFaixa(linhas, g);
    if (!mudancas.length && presos) { toast.info('Data e valor não ficam vazios: digite o valor certo por cima.'); return; }
    aplicar(mudancas, `limpar ${plural(mudancas.length, 'célula', 'células')}`);
  };

  const inserir = (onde) => {
    const r = onde === 'acima' ? faixa.r0 : Math.min(faixa.r1, n - 1);
    const ref = linhas[r] ?? linhas[n - 1];
    const d = novoRascunho(ref);
    setTodas((todas) => {
      if (!ref) return [...todas, d];
      const i = todas.findIndex((x) => x.id === ref.id);
      const t = [...todas];
      t.splice(onde === 'acima' ? i : i + 1, 0, d);
      return t;
    });
    const novoR = onde === 'acima' ? r : Math.min(r + 1, n);
    setSel({ r: novoR, c: 1 }); setExt(null); setMarcas(null);
  };

  const excluir = async () => {
    const alvo = linhasReais(faixa);
    const rascunhos = linhas.slice(faixa.r0, Math.min(faixa.r1, n - 1) + 1).filter((l) => l?.rascunho).map((l) => l.id);
    if (rascunhos.length) setTodas((todas) => todas.filter((x) => !rascunhos.includes(x.id)));
    if (!alvo.length) return;
    const ok = await confirmar({
      titulo: alvo.length === 1 ? 'Excluir este lançamento?' : `Excluir ${alvo.length} lançamentos?`,
      texto: alvo.length === 1 ? alvo[0].descricao : 'Dá para desfazer com Ctrl+Z enquanto a tela estiver aberta.',
      confirmar: 'Excluir', perigo: true,
    });
    focar();
    if (!ok) return;
    const ids = alvo.map((l) => l.id);
    const registros = vizinhos(todasRef.current, ids);
    setTodas((todas) => todas.filter((x) => !ids.includes(x.id)));
    setExt(null); setMarcas(null);
    enfileirar(async () => {
      try {
        await excluirLancamentos(ids);
        empilhar({ rotulo: `excluir ${plural(ids.length, 'lançamento', 'lançamentos')}`, partes: [{ tipo: 'excluir', ids, registros }] });
      } catch (err) { falhou(err); }
    });
  };

  const marcarRevisado = () => {
    const alvo = linhasReais(faixa).filter((l) => l.revisar);
    if (!alvo.length) return;
    const itens = alvo.map((l) => ({ id: l.id, antes: { revisar: true }, depois: { revisar: false } }));
    setTodas((todas) => todas.map((x) => (alvo.some((l) => l.id === x.id) ? { ...x, revisar: false } : x)));
    enfileirar(async () => {
      try {
        await Promise.all(itens.map((e) => atualizarCampos(e.id, e.depois)));
        empilhar({ rotulo: `marcar ${plural(itens.length, 'lançamento revisado', 'lançamentos revisados')}`, partes: [{ tipo: 'campos', itens }] });
      } catch (err) { falhou(err); }
    });
  };

  // A categoria escolhida vai para TODAS as linhas da seleção (as do tipo certo).
  const escolherCategoria = (id, r0 = faixa.r0, r1 = faixa.r1) => {
    const mudancas = [];
    const tipoCat = id ? catPorId.get(id)?.grupo.tipo : null;
    for (let r = r0; r <= r1; r++) {
      const l = linhas[r];
      if (l && !l.rascunho && tipoCat && l.tipo !== tipoCat) continue;
      if (!l && tipoCat === 'entrada') { mudancas.push({ r, campo: 'tipo', valor: 'entrada' }); }
      mudancas.push({ r, campo: 'categoria_id', valor: id });
    }
    const um = r0 === r1 && linhas[r0];
    aplicar(mudancas, um ? `categoria de “${linhas[r0].descricao || 'linha nova'}”` : `categoria de ${plural(r1 - r0 + 1, 'linha', 'linhas')}`);
  };

  // ------------------------------------------------------------ edição

  const comecarEdicao = (r, c, textoInicial) => {
    if (!colunaEditavel(c)) {
      if (COLUNAS[c].id === 'origem' && linhas[r] && !linhas[r].rascunho) toast.info('Cartão, parcela e mês se mudam no formulário: Shift+F2.');
      return;
    }
    setMarcas(null);
    setCopia(null);
    const l = linhas[r] ?? novoRascunho(linhas[n - 1]);
    setEditor({ r, c, texto: textoInicial ?? textoEdicao(l, c), digitando: textoInicial !== undefined });
  };

  const mover = (dr, dc, estender = false) => {
    const base = estender ? (ext ?? sel) : sel;
    const r = Math.max(0, Math.min(n, base.r + dr));
    const c = Math.max(0, Math.min(ULTIMA_COL, base.c + dc));
    if (estender) setExt({ r, c });
    else { setSel({ r, c }); setExt(null); }
  };

  // Grava o texto do campo. Devolve false se o texto não serve (o campo continua aberto).
  const gravarEditor = (texto, ed = editor) => {
    if (!ed) return true;
    const l = linhas[ed.r];
    const tipo = l?.tipo ?? 'saida';
    const ano = l?.data ? Number(l.data.slice(0, 4)) : anoBase;
    if (COLUNAS[ed.c].id === 'descricao' || COLUNAS[ed.c].id === 'obs') {
      if (!l && !texto.trim()) return true;
    }
    if (!texto.trim() && (COLUNAS[ed.c].id === 'data' || COLUNAS[ed.c].id === 'valor')) {
      if (!l || l.rascunho) return true;
      toast.info('Data e valor não ficam vazios.');
      return false;
    }
    const res = interpretar(ed.c, texto, { tipo, categorias, anoBase: ano });
    if (res.motivo) { toast.error(res.motivo); return false; }
    const mudancas = [{ r: ed.r, campo: res.campo, valor: res.valor }];
    const entradas = new Set(res.entrada && (!l || l.rascunho) ? [ed.r] : []);
    aplicar(mudancas, `${COLUNAS[ed.c].nome.toLowerCase()} de “${l?.descricao || 'linha nova'}”`, { entradas });
    return true;
  };

  const fecharEditor = (gravar, texto, depois) => {
    const ed = editor;
    if (gravar && !gravarEditor(texto)) return;
    setEditor(null);
    // Na linha em branco, Enter desce para a PRÓXIMA linha em branco (a de agora virou rascunho).
    if (depois && depois[0] === 1 && ed && ed.r >= n) { setSel({ r: n + 1, c: ed.c }); setExt(null); }
    else if (depois) mover(depois[0], depois[1]);
    setTimeout(focar, 0);
  };

  // ------------------------------------------------------------ teclado da caixa

  const teclar = (e) => {
    if (editor || menu) return;
    const k = e.key;
    const ctrl = e.ctrlKey || e.metaKey;
    if (ctrl && (k === 'z' || k === 'Z') && !e.shiftKey) { e.preventDefault(); andarPilha('desfazer'); return; }
    if (ctrl && (k === 'y' || k === 'Y' || ((k === 'z' || k === 'Z') && e.shiftKey))) { e.preventDefault(); andarPilha('refazer'); return; }
    if (k === 'Escape') {
      // Já sem seleção, o Esc segue para quem estiver em volta (um modal, por exemplo).
      if (apagada) return;
      e.preventDefault(); e.stopPropagation();
      if (ext) { apagando.current = true; setExt(null); }
      setMarcas(null); setSelo(null); setCopia(null); setApagada(true);
      return;
    }
    if (apagada) {
      // Sem seleção, só o que a traz de volta (na célula de antes); o resto não tem onde agir.
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab', 'Enter', 'F2', 'Home', 'End'].includes(k)) { e.preventDefault(); setApagada(false); }
      return;
    }
    if (ctrl && (k === 'c' || k === 'C')) { e.preventDefault(); copiar(); return; }
    if (ctrl && (k === 'd' || k === 'D')) { e.preventDefault(); preencher(); return; }
    if (ctrl && (k === 'a' || k === 'A')) { e.preventDefault(); setSel({ r: 0, c: 0 }); setExt({ r: Math.max(0, n - 1), c: ULTIMA_COL }); return; }
    if (ctrl && e.shiftKey && (k === '+' || k === '=')) { e.preventDefault(); inserir('acima'); return; }
    if (ctrl && (k === '-' || k === '_')) { e.preventDefault(); excluir(); return; }
    if ((e.shiftKey && k === 'F10') || k === 'ContextMenu') { e.preventDefault(); abrirMenuNaCelula(); return; }
    if (e.shiftKey && k === 'F2') { e.preventDefault(); const l = linhas[sel.r]; if (l && !l.rascunho) onAbrir(l); return; }
    const setas = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
    if (setas[k]) {
      e.preventDefault();
      let [dr, dc] = setas[k];
      if (ctrl) { dr *= 10000; dc *= 100; }
      mover(dr, dc, e.shiftKey);
      return;
    }
    if (k === 'Home' || k === 'End') {
      e.preventDefault();
      const alvo = ctrl ? { r: k === 'Home' ? 0 : n, c: sel.c } : { r: sel.r, c: k === 'Home' ? 0 : ULTIMA_COL };
      if (e.shiftKey) setExt(alvo); else { setSel(alvo); setExt(null); }
      return;
    }
    if (k === 'Tab') { e.preventDefault(); mover(0, e.shiftKey ? -1 : 1); return; }
    if (k === 'Enter' || k === 'F2') { e.preventDefault(); comecarEdicao(sel.r, sel.c); return; }
    if (k === 'Delete' || k === 'Backspace') { e.preventDefault(); limpar(); return; }
    if (k.length === 1 && !ctrl && !e.altKey) { e.preventDefault(); comecarEdicao(sel.r, sel.c, k); }
  };

  // ------------------------------------------------------------ mouse

  const aoPressionar = (e, r, c) => {
    if (e.button !== 0) return;
    e.preventDefault();
    focar();
    setMarcas(null);
    if (e.shiftKey) setExt({ r, c });
    else { setSel({ r, c }); setExt(null); arrasto.current = 'faixa'; }
  };
  const aoPassar = (r, c) => {
    if (arrasto.current === 'faixa') setExt({ r, c });
    else if (arrasto.current === 'preencher') setAlvoPreencher(Math.max(r, faixa.r1));
  };
  useEffect(() => {
    const soltar = () => {
      if (arrasto.current === 'preencher' && alvoPreencher != null && alvoPreencher > faixa.r1) {
        const g = { ...faixa, r1: Math.min(alvoPreencher, n - 1) };
        setSel({ r: g.r0, c: g.c0 });
        setExt({ r: g.r1, c: g.c1 });
        preencher(g);
      }
      arrasto.current = null;
      setAlvoPreencher(null);
    };
    window.addEventListener('mouseup', soltar);
    return () => window.removeEventListener('mouseup', soltar);
  });

  const selecionarLinhas = (e, r) => {
    e.preventDefault();
    focar();
    if (e.shiftKey) { setSel((s) => ({ r: s.r, c: 0 })); setExt({ r, c: ULTIMA_COL }); }
    else { setSel({ r, c: 0 }); setExt({ r, c: ULTIMA_COL }); }
  };
  const selecionarColuna = (c) => { focar(); setSel({ r: 0, c }); setExt({ r: Math.max(0, n - 1), c }); };

  // ------------------------------------------------------------ menu

  const itensMenu = () => {
    const reais = linhasReais(faixa);
    const nLin = Math.min(faixa.r1, n - 1) - faixa.r0 + 1;
    const celulas = Math.max(0, nLin) * (faixa.c1 - faixa.c0 + 1);
    const topo = pilha.desfazer[pilha.desfazer.length - 1];
    const prox = pilha.refazer[pilha.refazer.length - 1];
    const aRevisar = reais.filter((l) => l.revisar).length;
    const umaLinha = linhas[sel.r] && !linhas[sel.r].rascunho ? linhas[sel.r] : null;
    return [
      { rotulo: 'Copiar', icone: <IcoCopiar />, atalho: 'Ctrl+C', sub: multi ? `${plural(celulas, 'célula', 'células')}, para colar no Excel` : undefined, desabilitado: celulas === 0, motivo: celulas === 0 ? 'a linha em branco não tem o que copiar' : undefined, onEscolher: () => copiar() },
      { rotulo: 'Colar', icone: <IcoColar />, atalho: 'Ctrl+V', sub: 'um valor ou um bloco do Excel, a partir do canto de cima', onEscolher: colarDoMenu },
      nLin > 1
        ? { rotulo: 'Preencher para baixo', icone: <IcoPreencher />, atalho: 'Ctrl+D', sub: 'a primeira linha se repete nas de baixo', onEscolher: () => preencher() }
        : { rotulo: 'Preencher para baixo', icone: <IcoPreencher />, atalho: 'Ctrl+D', desabilitado: true, motivo: 'selecione duas linhas ou mais' },
      { rotulo: 'Limpar', icone: <IcoLimpar />, atalho: 'Delete', sub: 'descrição, categoria e observação', onEscolher: limpar },
      { sep: true },
      { rotulo: reais.length > 1 || nLin > 1 ? `Mudar a categoria de ${plural(nLin, 'linha', 'linhas')}…` : 'Mudar categoria…', icone: <IcoEtiqueta />, atalho: 'Enter', onEscolher: () => { setEditor({ r: faixa.r0, c: C_CAT, texto: '', digitando: false, r1: Math.max(faixa.r0, faixa.r1) }); } },
      aRevisar
        ? { rotulo: aRevisar === 1 ? 'Marcar como revisado' : `Marcar ${aRevisar} como revisados`, icone: <IcoRevisado />, onEscolher: marcarRevisado }
        : { rotulo: 'Marcar como revisado', icone: <IcoRevisado />, desabilitado: true, motivo: 'nada a revisar na seleção' },
      umaLinha
        ? { rotulo: 'Abrir no formulário', icone: <IcoAbrir />, atalho: 'Shift+F2', sub: 'tipo, cartão, parcela e mês', onEscolher: () => onAbrir(umaLinha) }
        : { rotulo: 'Abrir no formulário', icone: <IcoAbrir />, atalho: 'Shift+F2', desabilitado: true, motivo: 'a linha ainda não foi gravada' },
      { sep: true },
      { rotulo: 'Inserir linha acima', icone: <IcoAcima />, atalho: 'Ctrl+Shift+=', onEscolher: () => inserir('acima') },
      { rotulo: 'Inserir linha abaixo', icone: <IcoAbaixo />, onEscolher: () => inserir('abaixo') },
      reais.length
        ? { rotulo: reais.length === 1 ? 'Excluir o lançamento' : `Excluir ${reais.length} lançamentos`, icone: <IcoLixeira />, atalho: 'Ctrl+−', perigo: true, onEscolher: excluir }
        : { rotulo: 'Excluir', icone: <IcoLixeira />, atalho: 'Ctrl+−', desabilitado: true, motivo: 'nenhum lançamento gravado na seleção' },
      { sep: true },
      topo
        ? { rotulo: 'Desfazer', icone: <IcoDesfazer />, atalho: 'Ctrl+Z', sub: topo.rotulo, onEscolher: () => andarPilha('desfazer') }
        : { rotulo: 'Desfazer', icone: <IcoDesfazer />, atalho: 'Ctrl+Z', desabilitado: true, motivo: 'nada para desfazer' },
      prox
        ? { rotulo: 'Refazer', icone: <IcoRefazer />, atalho: 'Ctrl+Y', sub: prox.rotulo, onEscolher: () => andarPilha('refazer') }
        : { rotulo: 'Refazer', icone: <IcoRefazer />, atalho: 'Ctrl+Y', desabilitado: true, motivo: 'nada para refazer' },
    ];
  };

  const tituloMenu = () => {
    const nLin = faixa.r1 - faixa.r0 + 1;
    const nCol = faixa.c1 - faixa.c0 + 1;
    if (multi) return `Seleção · ${plural(nLin, 'linha', 'linhas')} × ${plural(nCol, 'coluna', 'colunas')}`;
    const l = linhas[sel.r];
    return `${COLUNAS[sel.c].nome} · ${l ? (l.descricao || 'linha nova') : 'linha em branco'}`;
  };

  const abrirMenu = (e, r, c) => {
    e.preventDefault();
    focar();
    if (!naFaixa(faixa, r, c)) { setSel({ r, c }); setExt(null); }
    setMenu({ x: e.clientX, y: e.clientY, pendente: true });
  };
  const abrirMenuNaCelula = () => {
    const el = caixaRef.current?.querySelector(`[data-cel="${sel.r}:${sel.c}"]`);
    const rc = el?.getBoundingClientRect();
    setMenu({ x: rc ? rc.left + 8 : 200, y: rc ? rc.bottom : 200, pendente: true });
  };
  // Os itens são montados DEPOIS da seleção assentar (o clique direito pode tê-la mudado).
  useEffect(() => {
    if (menu?.pendente) setMenu({ x: menu.x, y: menu.y, titulo: tituloMenu(), itens: itensMenu() });
  });

  // ------------------------------------------------------------ desenho

  const resumo = vis && multi ? resumoSelecao(linhas, { ...faixa, r1: Math.min(faixa.r1, n - 1) }) : null;
  const larguraTotal = 44 + Object.values(LARGURAS).reduce((s, w) => s + (w ?? 260), 0);
  const fPreencher = alvoPreencher != null && alvoPreencher > faixa.r1 ? { ...faixa, r0: faixa.r1 + 1, r1: alvoPreencher } : null;

  // As bordas da faixa são sombras por dentro de cada célula da borda — sem camada medida por cima.
  const sombraFaixa = (r, c, f) => {
    const s = [];
    if (r === f.r0) s.push(`inset 0 2px 0 ${AZUL}`);
    if (r === f.r1) s.push(`inset 0 -2px 0 ${AZUL}`);
    if (c === f.c0) s.push(`inset 2px 0 0 ${AZUL}`);
    if (c === f.c1) s.push(`inset -2px 0 0 ${AZUL}`);
    return s;
  };

  const celula = (l, r, c) => {
    const col = COLUNAS[c];
    const ativa = vis && sel.r === r && sel.c === c;
    const dentro = vis && multi && naFaixa(faixa, r, c);
    const motivoFora = marcas?.fora.get(`${r}:${c}`);
    const editando = editor && editor.r === r && editor.c === c;
    const sombras = [];
    if (multi && dentro) sombras.push(...sombraFaixa(r, c, faixa));
    if (ativa) sombras.push(`inset 0 0 0 2px ${AZUL}`);
    if (fPreencher && naFaixa(fPreencher, r, c)) sombras.push(`inset 0 0 0 1px ${AZUL}`);
    const fundo = motivoFora ? 'grade-hachura' : dentro && !ativa ? 'bg-hx-eff5ff' : '';
    let conteudo = null;
    if (l) {
      if (col.id === 'data') conteudo = <span className="tabular-nums">{l.data ? formatDate(l.data) : ''}</span>;
      else if (col.id === 'descricao') {
        conteudo = (
          <>
            <span className={`truncate ${l.descricao ? 'text-gray-800' : 'text-gray-400'}`}>{l.descricao || (l.rascunho ? 'descrição' : '—')}</span>
            {l.revisar && <span className="ml-2 shrink-0"><Etiqueta tom="ambar">Revisar</Etiqueta></span>}
          </>
        );
      } else if (col.id === 'categoria') {
        conteudo = l.categoria
          ? <><span className="mr-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: l.categoria.grupo?.cor }} /><span className="truncate">{l.categoria.nome}</span></>
          : <span className="text-gray-400">Sem categoria</span>;
      } else if (col.id === 'origem') conteudo = <span className="truncate text-gray-500">{l.rascunho ? (l.tipo === 'entrada' ? 'Entrada' : 'Avulso') : textoOrigem(l)}</span>;
      else if (col.id === 'valor') {
        conteudo = l.valor_centavos
          ? <span className={`ml-auto tabular-nums ${l.tipo === 'entrada' ? 'font-semibold text-green-700' : 'text-gray-800'}`}>{l.tipo === 'entrada' ? '+ ' : ''}{formatBRL(l.valor_centavos)}</span>
          : <span className="ml-auto text-gray-400">{l.rascunho ? 'falta o valor' : ''}</span>;
      } else conteudo = <span className="truncate text-gray-500">{l.obs}</span>;
    } else if (c === 1) {
      conteudo = <span className="text-gray-400">Digite para lançar…</span>;
    }
    const ultimaFaixa = vis && multi && r === faixa.r1 && c === faixa.c1 && !editor;
    return (
      <td key={c} data-cel={`${r}:${c}`} title={motivoFora || undefined}
        onMouseDown={(e) => aoPressionar(e, r, c)} onMouseEnter={() => aoPassar(r, c)}
        onDoubleClick={() => comecarEdicao(r, c)} onContextMenu={(e) => abrirMenu(e, r, c)}
        style={sombras.length ? { boxShadow: sombras.join(',') } : undefined}
        className={`relative h-8 cursor-cell select-none border-b border-r border-gray-200 p-0 text-[13px] last:border-r-0 ${fundo} ${ativa && multi ? 'bg-white' : ''}`}>
        <div className={`flex h-full items-center overflow-hidden whitespace-nowrap px-2.5 ${col.id === 'valor' ? 'justify-end' : ''}`}>
          {conteudo}
        </div>
        {editando && (
          <EditorCelula editor={editor} linha={l} categorias={categorias}
            onTexto={(texto) => setEditor((ed) => ({ ...ed, texto }))}
            onFechar={fecharEditor}
            onCategoria={(id, depois) => {
              escolherCategoria(id, editor.r, editor.r1 ?? editor.r);
              setEditor(null);
              if (depois) mover(depois[0], depois[1]);
              setTimeout(focar, 0);
            }}
            onCriarCategoria={(nome) => { setCriandoCat({ nome, r0: editor.r, r1: editor.r1 ?? editor.r }); setEditor(null); }} />
        )}
        <BordaCopia borda={bordaDaCopia(copia, r, c)} foco={focada} />
        {(ultimaFaixa || (!multi && ativa && !editor)) && (
          <span onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); arrasto.current = 'preencher'; }}
            title="Arraste para baixo para preencher"
            className="absolute -bottom-[4px] -right-[4px] z-10 h-[8px] w-[8px] cursor-crosshair border border-white"
            style={{ background: AZUL }} />
        )}
      </td>
    );
  };

  const tipoNovaCat = linhas[criandoCat?.r0]?.tipo ?? 'saida';

  return (
    <div>
      <div ref={caixaRef} tabIndex={0} onKeyDown={teclar}
        onFocus={() => setFocada(true)}
        onBlur={(e) => { if (!caixaRef.current?.contains(e.relatedTarget)) setFocada(false); }}
        // COLAR: o Ctrl+V segue para o evento `paste`, que é onde o navegador entrega o que foi copiado
        // (do Excel ou desta grade). Com um campo aberto, o texto vai para o campo.
        onPaste={(e) => {
          if (editor || apagada || (e.target !== caixaRef.current && e.target.closest?.('input, textarea'))) return;
          e.preventDefault();
          colarTexto(e.clipboardData?.getData('text/plain') ?? '');
        }}
        className="grade-lancamentos max-h-[calc(100vh-300px)] min-h-[260px] overflow-auto rounded-t-lg border border-gray-300 bg-white outline-none focus-visible:ring-0"
        style={{ scrollPaddingTop: 34, scrollPaddingLeft: 44 }}>
        <table className="table-fixed border-separate border-spacing-0" style={{ width: '100%', minWidth: larguraTotal }}>
          <colgroup>
            <col style={{ width: 44 }} />
            {COLUNAS.map((c) => <col key={c.id} style={LARGURAS[c.id] ? { width: LARGURAS[c.id] } : undefined} />)}
          </colgroup>
          <thead>
            <tr>
              <th className="sticky left-0 top-0 z-30 h-[33px] border-b border-r border-gray-300 bg-hx-f9fafb" aria-label="Linha" />
              {COLUNAS.map((col, c) => {
                const acesa = vis && c >= faixa.c0 && c <= faixa.c1;
                const ordenada = ordem?.col === col.id;
                // O TÍTULO seleciona a coluna (o jeito da planilha); a SETA ao lado ORDENA — ela aparece no hover
                // (apagada) e fica sempre à vista, escura, na coluna ordenada. A 3ª vez volta à ordem padrão.
                return (
                  <th key={col.id} onMouseDown={(e) => { e.preventDefault(); selecionarColuna(c); }}
                    style={acesa ? { boxShadow: `inset 0 -2px 0 ${AZUL}` } : undefined}
                    aria-sort={ordenada ? (ordem.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
                    className={`group/th sticky top-0 z-20 h-[33px] cursor-pointer select-none border-b border-r border-gray-300 px-2.5 text-left text-[11px] font-semibold uppercase tracking-wide last:border-r-0 ${
                      acesa ? 'bg-hx-eef2f7 text-gray-800' : ordenada ? 'bg-hx-f9fafb text-gray-800' : 'bg-hx-f9fafb text-gray-500'}`}>
                    <div className={`flex items-center gap-1 ${col.id === 'valor' ? 'flex-row-reverse' : ''}`}>
                      <span className="truncate">{col.nome}</span>
                      {onOrdenar && (
                        <button type="button" tabIndex={-1}
                          onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
                          onClick={(e) => { e.stopPropagation(); onOrdenar(col.id); }}
                          title={ordenada ? (ordem.dir === 'asc' ? 'Crescente · clique para inverter' : 'Decrescente · clique para inverter (ou voltar à ordem padrão)') : `Ordenar por ${col.nome.toLowerCase()}`}
                          aria-label={`Ordenar por ${col.nome.toLowerCase()}`}
                          className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-[4px] transition-[opacity,background-color] duration-150 hover:bg-gray-200 ${
                            ordenada ? 'text-gray-800 opacity-100' : 'text-gray-400 opacity-0 group-hover/th:opacity-100'}`}>
                          <IconSetaOrdenacao className="h-3.5 w-3.5" descendente={ordenada && ordem.dir === 'desc'} />
                        </button>
                      )}
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {[...linhas, null].map((l, r) => {
              const acesa = vis && r >= faixa.r0 && r <= faixa.r1;
              return (
                <tr key={l?.id ?? 'branco'} className={l?.rascunho || !l ? 'bg-hx-fbfcfd' : ''}>
                  <td onMouseDown={(e) => selecionarLinhas(e, r)} onContextMenu={(e) => { if (!naFaixa(faixa, r, 0)) selecionarLinhas(e, r); abrirMenu(e, r, 0); }}
                    style={acesa ? { boxShadow: `inset -2px 0 0 ${AZUL}` } : undefined}
                    className={`sticky left-0 z-10 h-8 cursor-pointer select-none border-b border-r border-gray-200 text-center text-[11px] tabular-nums ${
                      acesa ? 'bg-hx-eef2f7 font-semibold text-gray-800' : 'bg-hx-f9fafb text-gray-400'}`}>
                    {l ? (l.rascunho ? <span className="text-hx-15803d">novo</span> : r + 1) : '+'}
                  </td>
                  {COLUNAS.map((_, c) => celula(l, r, c))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* A BARRA DE STATUS sob a grade, como a do Excel e a do DRE: o que está selecionado e a conta. */}
      <div className="flex h-7 items-center gap-4 rounded-b-lg border border-t-0 border-gray-300 bg-hx-f9fafb px-3 text-[12px] tabular-nums text-gray-500">
        <span className="truncate">
          {selo ? <span className="text-hx-15803d">✓ {selo}</span>
            : 'Clique direito para mais ações · Ctrl+V cola do Excel · Ctrl+Z desfaz · no valor, =100+50 faz a conta'}
        </span>
        <span className="flex-1" />
        {resumo && (
          <>
            <span>{plural(resumo.celulas, 'célula', 'células')}</span>
            {resumo.nGastos > 0 && resumo.nEntradas > 0 ? (
              <>
                <span>Gastos <b className="font-semibold text-gray-800">{formatBRL(resumo.gastos)}</b></span>
                <span>Entradas <b className="font-semibold text-hx-15803d">{formatBRL(resumo.entradas)}</b></span>
              </>
            ) : (resumo.nGastos + resumo.nEntradas) > 0 && (() => {
              const soma = resumo.gastos + resumo.entradas;
              const qtd = resumo.nGastos + resumo.nEntradas;
              return (
                <>
                  <span>Média <b className="font-semibold text-gray-800">{formatBRL(Math.round(soma / qtd))}</b></span>
                  <button type="button" title="Copiar a soma"
                    onClick={() => navigator.clipboard?.writeText(valorParaCampo(soma)).then(() => setSelo('soma copiada'), () => {})}
                    className="-mx-1.5 rounded px-1.5 py-0.5 transition-colors hover:bg-gray-200">
                    Soma <b className="font-semibold text-gray-900">{formatBRL(soma)}</b>
                  </button>
                </>
              );
            })()}
          </>
        )}
      </div>

      <MenuContexto menu={menu?.pendente ? null : menu} onFechar={() => setMenu(null)} />

      {criandoCat && (
        <ModalCategoria tipo={tipoNovaCat} nomeInicial={criandoCat.nome}
          onFechar={() => { setCriandoCat(null); setTimeout(focar, 0); }}
          onSalvo={(cat) => {
            const { r0, r1 } = criandoCat;
            setCriandoCat(null);
            onCategoriaCriada(cat);
            // A lista de categorias da página ainda não tem a nova: grava direto pelo id.
            const mudancas = [];
            for (let r = r0; r <= r1; r++) if (!linhas[r] || linhas[r].rascunho || linhas[r].tipo === cat.grupo?.tipo) mudancas.push({ r, campo: 'categoria_id', valor: cat.id });
            aplicar(mudancas, `categoria “${cat.nome}”`);
            setTimeout(focar, 0);
          }} />
      )}
    </div>
  );
}

// ------------------------------------------------------------ o campo dentro da célula

function EditorCelula({ editor, linha, categorias, onTexto, onFechar, onCategoria, onCriarCategoria }) {
  const inputRef = useRef(null);
  const col = COLUNAS[editor.c];
  const ehCategoria = col.id === 'categoria';
  const [ativo, setAtivo] = useState(0);

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.focus();
    const fim = el.value.length;
    el.setSelectionRange(fim, fim);
  }, []);

  // As opções da categoria: as do tipo da linha, filtradas pelo que se digita (nome ou grupo). Numa linha NOVA
  // (rascunho ou a em branco) todas — de gasto e de entrada —, porque a categoria escolhida decide o tipo.
  const opcoes = useMemo(() => {
    if (!ehCategoria) return [];
    const tipo = linha && !linha.rascunho ? linha.tipo : (editor.texto.startsWith('+') ? 'entrada' : undefined);
    const t = norm(editor.texto);
    const lista = opcoesCategoria(categorias, { tipo, atual: linha?.categoria_id })
      .filter((o) => !t || norm(o.label).includes(t) || norm(o.grupo.nome).includes(t));
    return t ? lista : [{ value: null, label: 'Sem categoria' }, ...lista];
  }, [ehCategoria, categorias, editor.texto, linha]);
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
    // Começou digitando: as setas de cima e de baixo gravam e andam, como no Excel.
    if (editor.digitando && (k === 'ArrowUp' || k === 'ArrowDown')) {
      e.preventDefault();
      onFechar(true, e.currentTarget.value, [k === 'ArrowUp' ? -1 : 1, 0]);
    }
  };

  return (
    <>
      <input ref={inputRef} value={editor.texto} onChange={(e) => onTexto(e.target.value)} onKeyDown={teclas}
        onBlur={(e) => { if (!ehCategoria && !e.relatedTarget?.closest?.('[data-lista-cat]')) onFechar(true, e.target.value); }}
        onMouseDown={(e) => e.stopPropagation()}
        placeholder={ehCategoria ? (linha?.categoria?.nome ?? 'Buscar categoria') : ''}
        className={`absolute inset-0 z-20 h-full w-full border-0 bg-white px-2.5 text-[13px] text-gray-900 outline-none ${col.id === 'valor' ? 'text-right tabular-nums' : ''}`}
        style={{ boxShadow: `inset 0 0 0 2px ${AZUL}` }} />
      {ehCategoria && (
        <ListaCategorias ancora={inputRef} opcoes={opcoes} ativo={ativo} onAtivo={setAtivo} texto={editor.texto}
          onEscolher={(o) => onCategoria(o.value)} onCriar={() => onCriarCategoria(editor.texto.trim())}
          onFora={() => onFechar(false)} />
      )}
    </>
  );
}

// A lista da categoria sob a célula, portada ao body (a grade rola e recortaria uma lista `absolute`).
function ListaCategorias({ ancora, opcoes, ativo, onAtivo, texto, onEscolher, onCriar, onFora }) {
  const ref = useRef(null);
  const [pos, setPos] = useState(null);
  useLayoutEffect(() => {
    const el = ancora.current?.parentElement;
    if (el) setPos(posicionarPopover(el, { largura: Math.max(280, el.offsetWidth), altura: 340, alinhar: 'esquerda', gap: 2 }));
  }, [ancora]);
  useEffect(() => { ref.current?.querySelector(`[data-i="${ativo}"]`)?.scrollIntoView({ block: 'nearest' }); }, [ativo]);
  useEffect(() => {
    const fora = (e) => {
      if (ref.current?.contains(e.target) || ancora.current?.contains(e.target)) return;
      onFora();
    };
    document.addEventListener('mousedown', fora);
    return () => document.removeEventListener('mousedown', fora);
  }, [ancora, onFora]);
  if (!pos) return null;

  let grupoAnterior = null;
  return createPortal(
    <div ref={ref} data-lista-cat="" style={{ position: 'fixed', ...pos, width: Math.max(280, ancora.current?.parentElement?.offsetWidth ?? 280) }}
      onMouseDown={(e) => e.preventDefault()}
      className="z-[66] animate-pop-in rounded-[4px] border border-elevado bg-elevado p-1.5 shadow-[0_14px_34px_rgba(20,28,44,.15),0_3px_8px_rgba(20,28,44,.06)] sombra-popover">
      <div className="max-h-[280px] overflow-y-auto overflow-x-hidden scrollbar-thin">
        {opcoes.length === 0 && <p className="px-2.5 py-2 text-[12.5px] text-gray-400">Nenhuma categoria com esse nome.</p>}
        {opcoes.map((o, i) => {
          const titulo = o.grupo && o.grupo.nome !== grupoAnterior ? o.grupo : null;
          if (o.grupo) grupoAnterior = o.grupo.nome;
          return (
            <div key={o.value ?? 'sem'}>
              {titulo && (
                <div className="flex items-center gap-1.5 px-2.5 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                  <span className="h-2 w-2 rounded-full" style={{ background: titulo.cor }} />{titulo.nome}
                </div>
              )}
              <button type="button" data-i={i} onMouseEnter={() => onAtivo(i)} onClick={() => onEscolher(o)}
                className={`flex w-full items-center rounded-[2px] px-2.5 py-[6px] text-left text-[12.5px] ${i === ativo ? 'bg-hx-f4f5f7 text-gray-900' : 'text-gray-700'} ${o.value === null ? 'text-gray-500' : ''}`}>
                <span className="truncate">{o.label}</span>
              </button>
            </div>
          );
        })}
      </div>
      <div className="mt-1 border-t border-gray-100 pt-1">
        <button type="button" onClick={onCriar}
          className="flex w-full items-center gap-2 rounded-[2px] px-2.5 py-[6px] text-left text-[12.5px] font-medium text-gray-700 hover:bg-gray-100">
          <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-dashed border-gray-400 text-[11px] text-gray-500">+</span>
          <span className="truncate">{texto.trim() ? `Criar categoria “${texto.trim()}”` : 'Criar categoria nova'}</span>
        </button>
      </div>
    </div>,
    document.body,
  );
}
