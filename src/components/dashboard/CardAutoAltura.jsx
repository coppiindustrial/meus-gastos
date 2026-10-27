import { createContext, useContext, useLayoutEffect, useRef } from 'react';

// A ALTURA DO CARD SAI DO CONTEÚDO, MEDIDA — não prevista.
//
// Ela já foi uma FÓRMULA: o catálogo declarava quantos KPIs o card tinha e uma conta refazia em JS a
// aritmética do `auto-fit` do CSS. Conferida no navegador ela batia com o CSS exatamente — o ponto de
// quebra, a altura do item, tudo — e mesmo assim entregou um box vazio a mais na tela, porque prever
// depende de DUAS coisas: as constantes espelharem o CSS **e** a largura chegar já medida à função.
// Uma delas bastou falhar (e elas divergem sozinhas: o "Resultado" usa piso 112 e o catálogo dizia
// 104). A regra que fica: quando o navegador já sabe calcular, MEDIR.
//
// **O CARD SEMPRE SOBRA UM PEDAÇO, e isso é estrutural.** A linha do grid mede 60px e o vão 16, então
// as alturas possíveis são 76·h − 16: 136, 212, 288, 364… Conteúdo que cruza uma fronteira por 9px
// pula para a altura seguinte e deixa até 75px vazios — medido na página, o "Resultado" com 297,3px
// de conteúdo caía em 364 e sobravam 66,7. Nenhuma constante conserta isso; quem conserta é a caixa
// PREENCHER o que sobrou.
//
// **E é aí que preencher briga com medir**: se o miolo estica, a altura medida vira a do CARD, que
// sai dessa mesma medida — o gato correndo atrás do rabo. A saída é medir as PARTES em vez do todo:
// a grade de números nunca estica (é `display:grid` alinhada ao topo), e todo o resto — paddings,
// bordas, o cabeçalho e a margem dele — é lido em tempo de execução com `getComputedStyle`. Nada de
// constante espelhando CSS, que foi o erro da primeira versão.
//
// O QUE ELE REPORTA É A ALTURA DO BOX DELE, não a do item do grid. Quem soma o cromo do item —
// hoje a barra de arrastar, que aparece na edição e no minimizado — é o `ItemGrid`, que embrulha
// o `reportar` com a altura medida da própria barra. Sem isso, entrar em "Personalizar" fazia o
// conteúdo estourar o card: a barra come ~32,5px que o `h` do item nunca previu.
export const CtxAltura = createContext(null);

const px = (v) => parseFloat(v) || 0;

// Soma o que envolve o conteúdo num elemento: padding e borda, os dois lidos do estilo aplicado.
function molduraY(el) {
  const cs = getComputedStyle(el);
  return px(cs.paddingTop) + px(cs.paddingBottom) + px(cs.borderTopWidth) + px(cs.borderBottomWidth);
}

// Envolve o conteúdo do card e reporta a altura NATURAL dele ao `GridPersonalizavel`.
//
// `esticar` faz o miolo ocupar o card inteiro (é o que faz a sobra desaparecer). Com ele ligado, a
// altura natural é reconstruída a partir da grade — marcada com `data-kpi-grade` — mais as molduras
// de cada nível e o cabeçalho, todos medidos. Sem ele, basta a própria caixa, que já é natural.
export default function CardAutoAltura({ id, className = '', esticar = false, children }) {
  const ref = useRef(null);
  const reportar = useContext(CtxAltura);

  // `useLayoutEffect` e não `useEffect`, que roda DEPOIS do paint. Enquanto o delta entre a
  // altura salva e a medida era de poucos pixels o quadro extra não aparecia; com a barra de
  // arrastar entrando na conta ele virou uma LINHA INTEIRA de grid (76px), e o salto passou a
  // ser visível ao entrar em "Personalizar".
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !reportar) return undefined;

    const medir = () => {
      if (!esticar) { reportar(id, el.getBoundingClientRect().height); return; }
      const grade = el.querySelector('[data-kpi-grade]');
      if (!grade) return;
      const caixa = grade.parentElement;            // a caixa rotulada, que é quem estica
      const cabecalho = grade.previousElementSibling;
      const alturaCabecalho = cabecalho
        ? cabecalho.getBoundingClientRect().height + px(getComputedStyle(cabecalho).marginBottom)
        : 0;
      reportar(id, grade.getBoundingClientRect().height + alturaCabecalho
        + molduraY(caixa) + molduraY(el));
    };

    medir();
    // Observa a GRADE e não a caixa: esticada, a caixa muda de altura junto com o card e realimentaria
    // a medição. A grade só muda quando o conteúdo reflui, que é exatamente o gatilho que interessa.
    const alvo = (esticar && ref.current.querySelector('[data-kpi-grade]')) || el;
    const ro = new ResizeObserver(medir);
    ro.observe(alvo);
    return () => ro.disconnect();
    // `children` FORA das dependências, e isto é obrigatório junto com o `useLayoutEffect`: ele
    // muda de identidade a CADA render do pai, então o efeito re-rodava sempre. Sendo assíncrono
    // isso era só desperdício; síncrono, virou `setState` dentro da fase de layout a cada render —
    // e a página inteira caiu com "Maximum update depth exceeded". Ele também nunca foi necessário:
    // quem avisa que o conteúdo mudou de TAMANHO é o `ResizeObserver` na grade, e mudança que não
    // altera o tamanho não muda a altura do card.
  }, [id, reportar, esticar]);

  return <div ref={ref} className={className}>{children}</div>;
}
