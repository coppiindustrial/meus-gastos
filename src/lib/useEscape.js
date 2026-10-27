import { useEffect, useRef } from 'react';

// A PILHA DE ESCAPE do app: a tecla fecha só a camada de CIMA.
//
// Antes disto cada camada escutava a tecla por conta própria, e a ordem saía errada de um jeito que
// nenhum z-index consertava: `Modal` e `SidePanel` registravam os dois em `window`, na fase de
// bolha, e entre listeners do MESMO alvo quem manda é a ORDEM DE INSCRIÇÃO. O painel abre primeiro,
// então o handler dele era o primeiro da fila — um Escape fechava o painel e o modal que estava por
// cima dele de uma vez. `stopPropagation` nem serviria: entre listeners do mesmo alvo, só
// `stopImmediatePropagation` corta. E nenhum z-index era lido em ponto nenhum do caminho do teclado;
// os `z-[60]`/`z-[65]`/`z-[70]` sempre foram só visuais.
//
// O `SidePanel` já tinha metade da solução — um `Set` de módulo comparando `nivel` —, mas ela era
// local demais: só conhecia `SidePanel`s (o `Modal` nunca se inscrevia nela) e dois painéis de mesmo
// nível EMPATAVAM e fechavam juntos, porque o empate não desempatava. O app convivia com isso por
// meio de sete `onClose` escritos como `() => { if (!algoAberto) onClose(); }`, todos protegendo
// modal de modal e nenhum protegendo painel de modal.
//
// ORDEM DE INSCRIÇÃO, E NÃO NÍVEL. Quem abriu por último está por cima — sempre verdade neste app —,
// e isso resolve de graça o empate que a comparação por `nivel` não resolvia. O `nivel` do
// `SidePanel` continua existindo, fazendo o que sempre deveria ter feito sozinho: escolher o
// z-index.
//
// LIMITE CONHECIDO: duas camadas que MONTEM abertas no mesmo commit se inscrevem na ordem de efeito
// do React, que é filho-antes-do-pai — invertida. Não é alcançável pelos fluxos de hoje (a camada de
// cima sempre abre por uma ação posterior), e o conserto, se um dia doer, é uma linha de desempate.
const pilha = [];

// UM listener para o app inteiro, em `window` e na fase de BOLHA — nunca em captura.
//
// A bolha é o que deixa o ELEMENTO responder primeiro, e isso é obrigatório: os Escapes que cancelam
// EDIÇÃO (um comentário, um item de checklist, um cargo) rodam no próprio campo e param a
// propagação, então nunca chegam aqui. Em captura a pilha atropelaria todo campo do app — o Escape
// cancelaria a edição E fecharia a ficha atrás dela.
//
// Ele nunca é removido, de propósito: é UM listener, e desligá-lo quando a pilha esvazia só
// acrescentaria um estado a manter em sincronia.
let ligado = false;
function ligar() {
  if (ligado) return;
  window.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || !pilha.length) return;
    pilha[pilha.length - 1].fechar();
  });
  ligado = true;
}

// `ativo` é o gate de inscrição, e não a montagem: o `SidePanel` NUNCA desmonta — ele só translada
// com `translate-x-full` —, então inscrever no mount o deixaria na pilha para sempre.
export default function useEscape(ativo, aoFechar) {
  // O callback vai num ref, e o efeito depende SÓ de `ativo`. Sem isso, um `onClose` inline
  // (que é como quase todos os chamadores escrevem) re-inscreveria a camada a cada render e a
  // jogaria para o TOPO da pilha — que é exatamente o defeito de hoje, reencenado aqui dentro.
  const ref = useRef(aoFechar);
  useEffect(() => { ref.current = aoFechar; });

  useEffect(() => {
    if (!ativo) return undefined;
    ligar();
    const eu = { fechar: () => ref.current?.() };
    pilha.push(eu);
    return () => {
      const i = pilha.indexOf(eu);
      if (i >= 0) pilha.splice(i, 1);
    };
  }, [ativo]);
}
