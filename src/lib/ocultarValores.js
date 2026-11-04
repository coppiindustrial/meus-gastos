import { useLayoutEffect } from 'react';

// OCULTAR VALORES (04/11/2026, a pedido: "o mesmo olho do Gestor", na Visão geral) — COPIADO do Gestor
// (`lib/celular.js` de lá: `useMascararValores` e `animarIcone`). Os blocos formatam número por vários caminhos
// (`formatBRL`, `brlCurto`, `numeroK`, percentuais soltos…) — esconder na origem seria frágil. Então o "•••" é posto
// NO QUE A TELA DESENHA: com o olho fechado, todo texto que é valor em reais, percentual, "p.p." ou um número com
// casas ("55,64", "1.234") vira "•••" ao aparecer — o `MutationObserver` pega o que o React põe ou troca, inclusive
// os balões e os ampliados (portados ao body). Contagens, anos e meses ficam. Para MOSTRAR de novo, quem usa
// REMONTA o conteúdo (o React não relê o texto do DOM).
const OCULTO = '•••';
const RX_VALORES = [
  /R\$\s?[−+-]?\(?\s?\d[\d.,]*\)?(?:\s?(?:mi|mil|bi)\b)?/g,
  /[−+-]?\d+(?:[.,]\d+)?\s?(?:mi|mil|bi)\b/g,
  /[−+-]?\d+(?:[.,]\d+)?\s?(?:%|p\.p\.)/g,
];
const RX_SO_NUMERO = /^\s*[−+-]?\(?(?:\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+,\d+)\)?\s*$/;
// O número partido do "%": no JSX `{pct}%` vira DOIS nós de texto ("3" e "%"), e nenhum deles sozinho é um
// percentual. Por isso o número no FIM de um nó, colado num nó seguinte que começa com "%", também some — olhado dos
// dois lados, porque o React pode trocar só o número depois.
const RX_NUMERO_FIM = /[−+-]?\d+(?:[.,]\d+)?\s*$/;
const comecaComPct = (no) => no?.nodeType === 3 && /^\s*%/.test(no.nodeValue);

export function mascararTexto(t) {
  const v = t.nodeValue;
  if (!v) return;
  if (comecaComPct(t)) {
    const p = t.previousSibling;
    if (p?.nodeType === 3 && RX_NUMERO_FIM.test(p.nodeValue)) p.nodeValue = p.nodeValue.replace(RX_NUMERO_FIM, OCULTO);
  }
  if (!/\d/.test(v)) return;
  let n = v;
  for (const rx of RX_VALORES) n = n.replace(rx, OCULTO);
  if (RX_SO_NUMERO.test(n)) n = OCULTO;
  if (comecaComPct(t.nextSibling)) n = n.replace(RX_NUMERO_FIM, OCULTO);
  if (n !== v) t.nodeValue = n;
}
function mascararArvore(raiz) {
  const w = document.createTreeWalker(raiz, NodeFilter.SHOW_TEXT);
  for (let t = w.nextNode(); t; t = w.nextNode()) mascararTexto(t);
}

export function useMascararValores(ativo) {
  useLayoutEffect(() => {
    if (!ativo) return undefined;
    mascararArvore(document.body);
    const obs = new MutationObserver((mudancas) => {
      for (const m of mudancas) {
        if (m.type === 'characterData') mascararTexto(m.target);
        for (const n of m.addedNodes) {
          if (n.nodeType === 3) mascararTexto(n);
          else if (n.nodeType === 1) mascararArvore(n);
        }
      }
    });
    obs.observe(document.body, { subtree: true, childList: true, characterData: true });
    return () => obs.disconnect();
  }, [ativo]);
}

// O OLHO PISCA ao alternar (`.icone-pisca` no `index.css`, a animação do Gestor). Tirar e repor a classe (com a
// leitura do `offsetWidth` no meio) recomeça a animação a cada clique.
export function animarIcone(el, classe = 'icone-pisca') {
  if (!el) return;
  el.classList.remove(classe);
  void el.offsetWidth; // eslint-disable-line no-void
  el.classList.add(classe);
}
