import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { lsGet } from './storage.js';

// A ORDEM SALVA MESCLADA COM A PADRÃO, que é o par do `aoSoltar` de quem grava: id que não existe
// mais é descartado (um card removido do app não pode segurar uma vaga) e card NOVO entra no FIM
// (sem isto ele simplesmente não apareceria para quem já tinha uma ordem gravada — o mesmo defeito
// que a visibilidade de coluna do molde TanStack já registra).
//
// Mora aqui porque as TRÊS fichas com cards arrastáveis precisam dela — Orçamento, Cliente e
// Contato —, e ela já existia duas vezes (uma extraída em `ClienteFicha`, outra inline no `useState`
// do `OrcamentoDetalhe`). A terceira cópia é como as três divergem.
export function lerOrdemCards(chave, padrao) {
  let salvo = [];
  try { salvo = JSON.parse(lsGet(chave)) || []; } catch { salvo = []; }
  const valida = salvo.filter((id) => padrao.includes(id));
  return [...valida, ...padrao.filter((id) => !valida.includes(id))];
}

// Reordenar uma lista por arrasto, com FANTASMA e transição FLIP — o mecanismo que a ficha do
// orçamento estreou nos cards da coluna direita (estilo HubSpot) e que agora serve também os
// critérios de ordenação do Kanban.
//
// Ele vivia inline em `OrcamentoDetalhe.jsx`. Saiu de lá porque as duas listas precisam da MESMA
// sensação — o fantasma inclinado, os vizinhos deslizando — e porque cada detalhe abaixo é uma
// armadilha que já custou tempo uma vez; pagá-la de novo numa segunda cópia é desperdício, e
// divergir é o que acontece no primeiro ajuste feito só de um lado.
//
// O que ele NÃO faz: não guarda a ordem. A lista é sempre do chamador (`ids`), e toda mudança sai
// por `onReordenar`. É o que permite servir tanto um estado local com localStorage (a ficha) quanto
// um valor controlado que vem do pai (o painel de ordenação).
//
// Uso:
//   const arrasto = useListaArrastavel({ ids, onReordenar: setOrdem, aoSoltar, seletorFantasma: '.card' });
//   <div ref={arrasto.containerRef}>
//     {ids.map((id) => (
//       <div key={id} {...arrasto.itemProps(id)} className={arrasto.dragId === id ? 'opacity-40' : ''}>
//         <span {...arrasto.alcaProps(id)}>⠿</span>
//       </div>
//     ))}
//   </div>
//
// O item PRECISA de uma classe de transição (`transition-transform duration-200 ease-out` ou
// equivalente): o FLIP zera `style.transition` no fim para devolver a animação para a folha de
// estilo. Sem classe, o delta volta seco e não há suavidade nenhuma.
// O FANTASMA sozinho, para quem tem lógica de posição própria e só quer a mesma sensação de
// arraste. É o caso da lista de itens padrão do checklist da Engenharia: ela é de DOIS níveis
// (item e subitem, com reordenação só entre irmãos) e tem linha de inserção própria, coisas que o
// hook abaixo não modela — mas o fantasma tem de ser o mesmo, senão o app ensina duas texturas de
// arraste para o mesmo gesto.
//
// Devolve o clone (ou null), para quem chama removê-lo no `dragend`.
//
// DIFERENÇAS DA CÓPIA (Meus Gastos, 29/10/2026): a linha pode ser um <tr> (o cadastro dos fixos) — solto no body
// ele não se desenha, então vai dentro de uma tabela da mesma largura, com as larguras das células copiadas; e o
// fundo do fantasma é o do cartão em volta (no tema escuro o branco fixo de lá virava um retângulo claro).
export function fantasmaDeArraste(e, seletor = '[data-arrasto]') {
  const alvo = e.currentTarget.closest(seletor);
  if (!alvo || !e.dataTransfer) return null;
  const fundo = getComputedStyle(alvo.closest('.card') ?? document.body).backgroundColor;
  let clone = alvo.cloneNode(true);
  if (alvo.tagName === 'TR') {
    const larguras = [...alvo.children].map((td) => td.getBoundingClientRect().width);
    [...clone.children].forEach((td, i) => { td.style.width = `${larguras[i]}px`; });
    const tabela = document.createElement('table');
    tabela.style.borderCollapse = 'separate';
    tabela.style.borderSpacing = '0';
    tabela.style.tableLayout = 'fixed';
    const corpo = document.createElement('tbody');
    corpo.appendChild(clone);
    tabela.appendChild(corpo);
    clone = tabela;
  }
  Object.assign(clone.style, {
    width: `${alvo.offsetWidth}px`, position: 'fixed', top: '-9999px', left: '-9999px',
    opacity: '0.92', background: fundo, boxShadow: '0 12px 28px rgba(0,0,0,.22)',
    transform: 'rotate(1deg)', pointerEvents: 'none', borderRadius: '6px',
  });
  document.body.appendChild(clone);
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setDragImage(clone, 24, 24);
  return clone;
}

export function useListaArrastavel({ ids, onReordenar, aoSoltar, seletorFantasma = '[data-arrasto]' }) {
  const [dragId, setDragId] = useState(null);
  const idsRef = useRef(ids);          // sempre a ordem mais recente (para persistir no fim)
  const antes = useRef(null);          // snapshot para reverter se o arrasto for cancelado
  const soltou = useRef(false);
  const ghostRef = useRef(null);       // clone usado como imagem de arraste (o "fantasma")
  const containerRef = useRef(null);
  const posRef = useRef({});
  useEffect(() => { idsRef.current = ids; }, [ids]);

  const onDragStart = (id) => (e) => {
    antes.current = ids;
    soltou.current = false;
    // O FANTASMA é a linha inteira (semitransparente, com sombra e leve inclinação) seguindo o
    // cursor — não a alça, que é um traço de 9px e não diz o que está sendo movido. O clone fica
    // fora da tela só para o navegador tirar o snapshot do `setDragImage`.
    ghostRef.current = fantasmaDeArraste(e, seletorFantasma);
    // O snapshot do fantasma é tirado quando o `dragstart` TERMINA — se o React re-renderizar nesse
    // meio (aplicando o esmaecido), o Chrome descarta a imagem custom e volta ao retângulo padrão.
    // Por isso o estado só entra no próximo tick.
    setTimeout(() => setDragId(id), 0);
  };

  const onDragOver = (id) => (e) => {
    e.preventDefault();
    if (!dragId || dragId === id) return;
    // Metade da linha decide ANTES ou DEPOIS. Trocar de lugar só por passar por cima faz a lista
    // oscilar quando o cursor para em cima da fronteira.
    const r = e.currentTarget.getBoundingClientRect();
    const acima = e.clientY < r.top + r.height / 2;
    const sem = idsRef.current.filter((x) => x !== dragId);
    let at = sem.indexOf(id);
    if (at < 0) return;
    if (!acima) at += 1;
    const nova = [...sem.slice(0, at), dragId, ...sem.slice(at)];
    const igual = nova.length === idsRef.current.length && nova.every((x, i) => x === idsRef.current[i]);
    if (!igual) onReordenar(nova);
  };

  const onDrop = (e) => { e.preventDefault(); soltou.current = true; };

  const onDragEnd = () => {
    if (ghostRef.current) { ghostRef.current.remove(); ghostRef.current = null; }
    if (soltou.current) aoSoltar?.(idsRef.current);
    else if (antes.current) onReordenar(antes.current);   // cancelou (Esc, soltou fora) → reverte
    setDragId(null);
  };

  // FLIP: quando a ordem muda, os itens que cederam lugar DESLIZAM até a posição nova em vez de
  // pular. Mede antes/depois e anima o delta por `transform`. O item arrastado não anima — ele já
  // acompanha o cursor pelo fantasma. Respeita quem prefere menos movimento.
  const chave = ids.join('');
  useLayoutEffect(() => {
    const cont = containerRef.current;
    if (!cont) return;
    const reduz = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const anterior = posRef.current;
    const atual = {};
    cont.querySelectorAll('[data-arrasto]').forEach((el) => {
      const id = el.getAttribute('data-arrasto');
      const top = el.getBoundingClientRect().top;
      atual[id] = top;
      const de = anterior[id];
      if (reduz || id === dragId || de == null || de === top) return;
      el.style.transition = 'none';
      el.style.transform = `translateY(${de - top}px)`;
      el.getBoundingClientRect();   // força o reflow com o delta aplicado
      el.style.transition = '';     // devolve a transição para a classe
      el.style.transform = '';      // e anima de volta para a posição real
    });
    posRef.current = atual;
  }, [chave, dragId]);

  return {
    dragId,
    containerRef,
    // Só a ALÇA arrasta: a linha inteira arrastável sequestraria o clique dos seletores dentro dela.
    alcaProps: (id) => ({ draggable: true, onDragStart: onDragStart(id), onDragEnd }),
    // A LINHA é o alvo de soltar, e é ela que o FLIP mede.
    itemProps: (id) => ({ 'data-arrasto': id, onDragOver: onDragOver(id), onDrop }),
  };
}
