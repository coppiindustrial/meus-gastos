import { useEffect } from 'react';

// TRAVA A ROLAGEM DA PÁGINA ATRÁS de tudo o que cobre a tela com véu — o `Modal` e o `SidePanel`
// (05/10/2026). Quem rola a tela é o DOCUMENTO (`Layout.jsx`), então sem a trava a roda do mouse
// sobre o véu, ou no fim de uma lista dentro do modal (as empresas do "Novo contato"), passava
// adiante e rolava a tabela de trás. Antes só a tela ampliada dos widgets travava.
//
// UM CONTADOR DE MÓDULO, e não um "antes" por componente: overlays se empilham (o cadastro de
// contato sobre o modal do envio, um modal sobre a ficha lateral). Com cada um guardando e
// restaurando o próprio estado, fechar fora de ordem deixava a página travada para sempre ou
// destravada com um modal ainda aberto. Aqui o primeiro trava e só o último destrava.
//
// O `paddingRight` compensa a barra de rolagem que some: sem ele a página atrás ALARGA ~15px, e o
// grid do dashboard remede e refaz o layout inteiro por baixo do véu (medido: 1269 → 1284px).
let abertos = 0;
let antes = null;

function travar() {
  abertos += 1;
  if (abertos > 1) return;
  const barra = window.innerWidth - document.documentElement.clientWidth;
  antes = { overflow: document.body.style.overflow, padding: document.body.style.paddingRight };
  document.body.style.overflow = 'hidden';
  if (barra > 0) document.body.style.paddingRight = `${barra}px`;
}

function destravar() {
  abertos = Math.max(0, abertos - 1);
  if (abertos > 0 || !antes) return;
  document.body.style.overflow = antes.overflow;
  document.body.style.paddingRight = antes.padding;
  antes = null;
}

export default function useTravarRolagem(ativo) {
  useEffect(() => {
    if (!ativo) return undefined;
    travar();
    return destravar;
  }, [ativo]);
}
