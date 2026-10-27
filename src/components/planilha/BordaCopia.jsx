import { varCor } from '../../lib/varCor.js';

// A BORDA QUE ANDA em volta do que foi copiado (Ctrl+C), como no Excel e na grade do DRE do Gestor
// (`BordaCopia` de lá): até quatro faixas de 2px, só nos lados que são borda do bloco, com um tracejado
// azul e branco que corre no sentido do relógio (`.dre-formiga-*`, em index.css). Cinza com a grade sem
// foco. `ox`/`oy` são a posição da célula dentro do bloco, para o tracejado seguir contínuo de uma
// célula para a outra. Quem desenha é a célula (que precisa ser `relative`).
export function bordaDaCopia(copia, r, c) {
  if (!copia || r < copia.r0 || r > copia.r1 || c < copia.c0 || c > copia.c1) return null;
  return {
    topo: r === copia.r0, base: r === copia.r1, esquerda: c === copia.c0, direita: c === copia.c1,
    ox: copia.ox[c - copia.c0] ?? 0, oy: (r - copia.r0) * copia.alt,
  };
}

export default function BordaCopia({ borda, foco }) {
  if (!borda) return null;
  const vars = {
    '--dre-cor': foco ? 'var(--grade-sel)' : varCor('#9ca3af', 'borda'),
    '--dre-ox': `${borda.ox}px`,
    '--dre-oy': `${borda.oy}px`,
  };
  return (
    <span className="pointer-events-none absolute inset-0 z-[5]" style={vars} aria-hidden="true">
      {borda.topo && <span className="dre-formiga-x absolute inset-x-0 top-0 h-[2px]" />}
      {borda.base && <span className="dre-formiga-x dre-formiga-volta absolute inset-x-0 bottom-0 h-[2px]" />}
      {borda.esquerda && <span className={`dre-formiga-y dre-formiga-volta absolute left-0 top-0 w-[2px] ${borda.base ? 'bottom-0' : '-bottom-px'}`} />}
      {borda.direita && <span className={`dre-formiga-y absolute right-0 top-0 w-[2px] ${borda.base ? 'bottom-0' : '-bottom-px'}`} />}
    </span>
  );
}

// O retângulo copiado com as medidas da tela: a largura de cada coluna (pelos títulos) e a altura da
// linha. `primeira` é o índice do título da primeira coluna de dados (pula a do número/nome da linha).
export function medirCopia(caixa, f, primeira) {
  const ths = [...(caixa?.querySelectorAll('thead th') ?? [])];
  const ox = [];
  for (let c = f.c0, t = 0; c <= f.c1; c++) { ox.push(t); t += ths[c + primeira]?.getBoundingClientRect().width ?? 100; }
  const alt = caixa?.querySelector('tbody tr')?.getBoundingClientRect().height ?? 32;
  return { ...f, ox, alt };
}
