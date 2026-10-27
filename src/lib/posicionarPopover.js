// Posição de um popover PORTADO ao body (position: fixed), calculada a partir do botão que o
// abre. Portar ao body é obrigatório quando o gatilho vive dentro de algo que recorta ou
// transforma: a tabela de Contatos tem overflow-x-auto, e cada item do grid do Dashboard tem
// `transform` (que vira containing block e faz o `fixed` deixar de ser relativo ao viewport).
//
// `alinhar` diz de que lado o popover encosta no gatilho, e ele VIRA para o outro quando não
// cabe na tela:
//  - 'direita' (padrão): ancora pela direita do gatilho, abrindo para a esquerda. É o certo para
//    o lápis de uma tabela, que fica à direita da célula e não deve cobrir as colunas seguintes.
//  - 'esquerda': ancora pela esquerda, abrindo para a direita. É o certo para um filtro no
//    cabeçalho de um card — ancorado pela direita, o menu saía do card e cobria a sidebar.
// Vertical vira pra cima quando não há espaço abaixo.
//
// `gap` é a distância até o gatilho. O padrão 3,5 é EXATAMENTE o respiro dos dropdowns que ficam
// no fluxo com `mt-1` (0,25rem × 14px da fonte base de 87.5%) — a maioria do app. Antes era 6, e
// a diferença aparecia ao comparar dois filtros lado a lado na mesma barra.
const MARGEM = 12;

// A POSIÇÃO CAI EM PIXEL INTEIRO DA TELA (25/09/2026). O retângulo do gatilho vem em fração (a linha da
// grade do DRE termina em 697,75) e o `gap` é 3,5: o popover caía entre dois pixels físicos, e com a
// tela a 150% as bordas de 1px de dentro dele borravam ou sumiam no hover (visto no cartão da célula,
// aberto em cima dos indicadores). O arredondamento é pelo `devicePixelRatio`, não pelo pixel CSS.
const noPixel = (v) => {
  const dpr = window.devicePixelRatio || 1;
  return Math.round(v * dpr) / dpr;
};

export default function posicionarPopover(btn, { largura, altura, alinhar = 'direita', gap = 3.5 }) {
  const r = btn.getBoundingClientRect();
  const espacoAbaixo = window.innerHeight - r.bottom;
  const acima = espacoAbaixo < altura + 8 && r.top > espacoAbaixo;
  const vertical = acima ? { bottom: noPixel(window.innerHeight - r.top + gap) } : { top: noPixel(r.bottom + gap) };
  const larguraTela = document.documentElement.clientWidth;
  const paraEsquerda = { right: noPixel(Math.max(MARGEM, larguraTela - r.right)) };
  const paraDireita = { left: noPixel(Math.max(MARGEM, Math.min(r.left, larguraTela - largura - MARGEM))) };
  const horizontal = alinhar === 'esquerda'
    // Cabe abrindo para a direita? (borda direita do popover = r.left + largura)
    ? (r.left + largura <= larguraTela - MARGEM ? paraDireita : paraEsquerda)
    // Cabe abrindo para a esquerda? (borda esquerda do popover = r.right - largura)
    : (r.right - largura >= MARGEM ? paraEsquerda : paraDireita);
  return { ...vertical, ...horizontal };
}
