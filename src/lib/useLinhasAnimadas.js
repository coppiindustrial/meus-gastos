import { useEffect, useLayoutEffect, useMemo, useReducer, useRef } from 'react';

// RECOLHER E ABRIR GRUPOS DE UMA TABELA, ANIMANDO — copiado do DRE do Gestor (`lib/useLinhasAnimadas.js`
// de lá), sem o que era só do DRE. Hoje serve a tela de Categorias.
//
// A ANIMAÇÃO É DE DESLIZAR, NÃO DE ENCOLHER: só se animam `transform` e `opacity`, que a placa de vídeo
// faz sozinha, sem refazer o layout da tabela a cada quadro.
//   · ao RECOLHER, as linhas do grupo continuam no lugar e somem (opacidade), e as de baixo SOBEM por
//     cima delas; no fim o grupo é escondido e o `transform` desfeito no MESMO quadro, sem salto;
//   · ao ABRIR, as linhas do grupo entram aparecendo, e as de baixo partem de onde estavam e DESCEM.
// A altura de cada linha é MEDIDA (nunca suposta), e a CAIXA anima a altura junto, senão a borda de
// baixo saltaria de uma vez no fim. As linhas de um grupo recolhido não são destruídas, só escondidas
// (`hidden`): abrir é só mostrá-las.
//
// `todas`: as linhas da tabela, na ordem, cada uma com `id`. `visiveis`: as que estão abertas (memoizada
// por quem chama). Devolve `linhas`: todas, cada uma com o estado de desenho — 'aberta', 'saindo' (ainda
// à vista, sumindo; `inert`) ou 'fechada' (escondida). A animação é da Web Animations API, aplicada no
// `useLayoutEffect` sobre os `<tr data-linha>` da caixa.
//
// O FIM DO GESTO É UM COMMIT SÓ (um timer por gesto, nunca um por linha): com um por linha o React
// renderizava no meio deles e as linhas de baixo saltavam e voltavam (o "piscar" ao recolher).
export const MS_COLAPSO = 200;
const MS_REMOCAO = MS_COLAPSO + 40;

const semMovimento = () => typeof window !== 'undefined'
  && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export default function useLinhasAnimadas(todas, visiveis, caixaRef) {
  const agora = useMemo(() => new Set(visiveis.map((l) => l.id)), [visiveis]);
  const saindo = useRef(new Set());
  const timer = useRef(null);
  const anterior = useRef(null);
  const ordemAnterior = useRef([]);
  const decisao = useRef(null);
  const animacoes = useRef([]);
  const [, redesenhar] = useReducer((x) => x + 1, 0);

  // Quem anima é decidido no PRÓPRIO RENDER da mudança, comparando com a última pintura (senão a linha
  // que sai sumiria antes de o efeito trazê-la de volta). O primeiro render não anima.
  const antes = anterior.current;
  if (antes && antes !== agora && decisao.current?.agora !== agora) {
    const existe = new Set(todas.map((l) => l.id));
    const sai = new Set();
    const entra = new Set();
    ordemAnterior.current.forEach((id) => {
      if (antes.has(id) && !agora.has(id) && existe.has(id) && !saindo.current.has(id)) sai.add(id);
    });
    visiveis.forEach((l) => { if (!antes.has(l.id) && !saindo.current.has(l.id)) entra.add(l.id); });
    decisao.current = { agora, sai, entra, gesto: sai.size > 0 || entra.size > 0 };
  }
  const d = decisao.current?.agora === agora ? decisao.current : null;

  const linhas = todas.map((l) => {
    if (agora.has(l.id)) return { linha: l, estado: 'aberta' };
    if (d?.sai.has(l.id)) return { linha: l, estado: 'saindo' };
    if (saindo.current.has(l.id) && !d?.gesto) return { linha: l, estado: 'saindo' };
    return { linha: l, estado: 'fechada' };
  });

  useLayoutEffect(() => {
    const ant = anterior.current;
    anterior.current = agora;
    ordemAnterior.current = linhas.filter((x) => x.estado !== 'fechada').map((x) => x.linha.id);

    const desfazer = () => {
      for (const a of animacoes.current) {
        a.anim.cancel();
        if (a.el) { a.el.style.position = ''; a.el.style.zIndex = ''; }
        if (a.caixa) a.caixa.style.overflowY = '';
      }
      animacoes.current = [];
    };
    if (!timer.current && animacoes.current.length && (!ant || ant === agora)) desfazer();

    if (!ant || ant === agora) return;
    const dec = decisao.current?.agora === agora ? decisao.current : { sai: new Set(), entra: new Set() };
    decisao.current = null;
    for (const id of agora) saindo.current.delete(id);
    if (!dec.sai.size && !dec.entra.size) return;

    saindo.current = new Set(dec.sai);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      saindo.current = new Set();
      redesenhar();
    }, MS_REMOCAO);
    desfazer();
    const caixa = caixaRef?.current;
    if (!caixa || semMovimento()) return;

    // As leituras TODAS antes das escritas: ler depois de mexer no estilo refaria o layout a cada linha.
    const aVista = linhas.filter((x) => x.estado !== 'fechada').map((x) => x.linha.id);
    const opcoes = { duration: MS_COLAPSO, easing: 'ease-out', fill: 'both' };
    const els = aVista.map((id) => caixa.querySelector(`tr[data-linha="${CSS.escape(id)}"]`));
    const alturas = els.map((el) => (el ? el.getBoundingClientRect().height : 0));
    const hCaixa = caixa.getBoundingClientRect().height;
    const tabela = caixa.querySelector('table');
    const conteudo = tabela ? tabela.getBoundingClientRect().height : caixa.scrollHeight;
    const cabe = caixa.scrollHeight <= caixa.clientHeight + 1;
    const moldura = cabe ? hCaixa - conteudo : caixa.offsetHeight - caixa.clientHeight;
    const maxH = parseFloat(getComputedStyle(caixa).maxHeight);
    let s = 0;
    let e = 0;
    aVista.forEach((id, i) => {
      const el = els[i];
      if (!el) return;
      if (s || e) {
        el.style.position = 'relative';
        el.style.zIndex = '11';
        animacoes.current.push({ el, anim: el.animate([{ transform: `translateY(${-e}px)` }, { transform: `translateY(${-s}px)` }], opcoes) });
      }
      if (dec.sai.has(id)) {
        animacoes.current.push({ anim: el.animate([{ opacity: 1 }, { opacity: 0 }], opcoes) });
        s += alturas[i];
      } else if (dec.entra.has(id)) {
        animacoes.current.push({ anim: el.animate([{ opacity: 0 }, { opacity: 1 }], opcoes) });
        e += alturas[i];
      }
    });

    // A CAIXA ACOMPANHA O DESLIZE: a altura anima de onde estava até onde vai ficar. O `overflowY:
    // hidden` durante o gesto impede uma barra de rolagem de aparecer enquanto o conteúdo está maior.
    const maxInterno = Number.isFinite(maxH) ? maxH - moldura : Infinity;
    const inicio = Math.min(conteudo - e, maxInterno) + moldura;
    const fim = Math.min(conteudo - s, maxInterno) + moldura;
    if (Math.abs(inicio - fim) >= 0.5) {
      caixa.style.overflowY = 'hidden';
      animacoes.current.push({ caixa, anim: caixa.animate([{ height: `${inicio}px` }, { height: `${fim}px` }], opcoes) });
    }
  }); // roda a cada pintura: é ele que guarda a ordem desenhada

  useEffect(() => () => {
    clearTimeout(timer.current);
    for (const a of animacoes.current) a.anim.cancel();
  }, []);

  return linhas;
}

// Os atributos do `<tr>`: a âncora da animação, a linha escondida e a que está saindo (sem Tab nem clique).
export function atributosLinha(id, estado) {
  return {
    'data-linha': id,
    hidden: estado === 'fechada' || undefined,
    inert: estado === 'saindo' ? '' : undefined,
  };
}
