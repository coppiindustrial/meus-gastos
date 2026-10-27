import { cloneElement, isValidElement, useLayoutEffect, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

// 4px de distância do gatilho (era 8), no molde do `sideOffset` do shadcn. `OVERLAP` é o quanto a
// caixa avança sobre a seta, para não aparecer costura entre as duas.
const GAP = 4;
const OVERLAP = 3;

// O lado "virado" de cada eixo. Função e não expressão solta porque ela aparece em DOIS lugares — o
// estado inicial e o reset do `abrir` — e divergir entre eles faria o balão nascer de um lado e
// reabrir do outro.
const ladoVirado = (placement) => placement === 'top' || placement === 'right';

// Tooltip customizado (fundo grafite, cantos arredondados, seta) via portal — escapa de
// overflow/zoom de ancestrais, mesmo padrão do calendário de data (ver CLAUDE.md).
// Anexa ref/handlers direto no filho (cloneElement) em vez de embrulhar num <span>, para
// não interferir em botões cujo próprio tamanho/posição definem o layout do pai (ex.: w-[44px]).
//
// align="center" (padrão): dica curta de botão de ícone, largura livre, seta centralizada.
// align="start": texto truncado com "..." — caixa quebra linha (maxWidth), ancorada à
// esquerda do elemento, com a seta recolhida um pouco pra dentro (não na borda).
// placement: 'bottom' (padrão) mostra o balão abaixo do gatilho; 'top' mostra acima; 'left' e
// 'right' o mostram AO LADO, na mesma linha do gatilho. Em todos os casos ele vira para o lado
// oposto se faltar espaço (não sai da tela).
//
// O modo LATERAL nasceu da dica de campo dos cards de quadro: ali o gatilho é um ícone de 14px numa
// `LinhaPropriedade` de 23px, empilhada com outras iguais — um balão ABAIXO cobre a linha seguinte,
// enquanto ao lado ele sai para a coluna, que é onde há espaço. É o mesmo desenho girado 90°: o
// `top`/`bottom` + `translateY(-100%)` vira `left`/`right` + `translateX(-100%)`, e a centralização
// de -50% migra do eixo X para o Y. Reaproveitar em vez de duplicar é o que mantém UMA guarda contra
// o laço infinito do flip (ver o comentário do `useLayoutEffect`).
//
// CUIDADO: `align="start"` NÃO serve no lateral, e o sintoma é o balão nunca abrir. Aquele modo tem
// um gate de truncamento (logo abaixo, no `abrir`) e um ícone nunca trunca. Dica de ícone usa o
// `align="center"` padrão — que é `whitespace-nowrap`, uma linha —, então o texto tem de ser curto.
//
// `sempre` (19/10/2026): o balão de TEXTO LONGO que não é de truncamento — a explicação de uma linha do
// "Por que mudou", o título de uma seção — quer a caixa do `align="start"` (quebra linha, ancorada à
// esquerda) SEM o gate de truncamento. Sem esta opção ele só abria quando a tela era estreita o bastante
// para cortar o nome, e na tela larga nunca aparecia.
export default function Tooltip({ label, children, delay = 300, align = 'center', maxWidth = 280, placement = 'bottom', sempre = false }) {
  const lateral = placement === 'left' || placement === 'right';
  const [rect, setRect] = useState(null);
  const [shift, setShift] = useState(0);
  // `flip` = mostrar do lado OPOSTO ao natural do eixo: ACIMA no vertical, à DIREITA no lateral. Um
  // estado só, com sentido dependente do eixo, e é deliberado — um segundo estado obrigaria a
  // duplicar a guarda anti-laço do `useLayoutEffect`, que é justamente a que já custou uma tela
  // branca. Quem editar isto sem ler vai supor "acima".
  const [flip, setFlip] = useState(ladoVirado(placement));
  const ref = useRef(null);
  const boxRef = useRef(null);
  const timer = useRef(null);

  const abrir = () => {
    timer.current = setTimeout(() => {
      const el = ref.current;
      if (!el) return;
      // align="start" é usado em texto truncado (truncate/line-clamp) — só mostra o
      // balão se o conteúdo realmente estiver cortado, não sempre. Um trecho que trunca POR DENTRO
      // do gatilho (o nome do cliente no título do card compacto do Kanban, um `inline-block`
      // truncado dentro de um `line-clamp`) não mexe no `scrollWidth` de fora: ele se marca com
      // `data-trunca` e conta também.
      const cortado = (x) => x.scrollWidth > x.clientWidth || x.scrollHeight > x.clientHeight;
      if (align === 'start' && !sempre && !cortado(el) && ![...el.querySelectorAll('[data-trunca]')].some(cortado)) return;
      const r = el.getBoundingClientRect();
      setShift(0);
      setFlip(ladoVirado(placement));
      setRect(r);
    }, delay);
  };
  const fechar = () => {
    clearTimeout(timer.current);
    setRect(null);
  };

  useEffect(() => () => clearTimeout(timer.current), []);

  // Fecha em QUALQUER mousedown na página enquanto está aberto — não só no clique do próprio
  // gatilho. Um Tooltip pode envolver um elemento pequeno dentro de algo bem maior e clicável (o
  // título truncado de um card, com o card inteiro abrindo a ficha no clique): se o cursor não
  // estiver exatamente sobre o elemento envolvido, o clique nunca alcança o `onClick` que o
  // `cloneElement` anexaria nele, e o balão ficava preso por cima do que abriu.
  // Captura (terceiro argumento `true`): fecha mesmo que algo no caminho chame `stopPropagation`
  // na fase de bolha — mesma razão do `SegmentoFiltro.jsx` ao fechar menu no clique fora.
  useEffect(() => {
    if (!rect) return undefined;
    const onDown = () => fechar();
    document.addEventListener('mousedown', onDown, true);
    return () => document.removeEventListener('mousedown', onDown, true);
  }, [rect]);

  // Empurra a caixa (não a seta) pra dentro da tela: horizontal sempre; vertical vira
  // "acima do gatilho" quando não há espaço embaixo (ex.: botão perto do fim da tela).
  useLayoutEffect(() => {
    if (!rect || !boxRef.current) return;
    const b = boxRef.current.getBoundingClientRect();
    const margin = 8;
    // MODO LATERAL: os dois trabalhos deste efeito trocam de eixo. O `shift` (que empurra a caixa,
    // nunca a seta) passa a ser VERTICAL, porque ali a caixa é centrada no gatilho pela vertical e
    // quem estoura é o topo ou o rodapé; e o flip passa a ser esquerda/direita. Ele sai por `return`
    // para o bloco vertical abaixo continuar valendo byte a byte para os ~60 usos de hoje.
    if (lateral) {
      // O empurrão é limitado a "o que ainda encosta na seta": ela não leva o `shift`, então
      // deslocar a caixa mais que a metade da altura dela menos o raio da seta a deixaria pendurada
      // fora do balão, apontando o vazio. O custo é a caixa poder encostar na borda num caso
      // extremo, que é melhor que uma seta órfã.
      const teto = Math.max(0, b.height / 2 - 8);
      const empurrar = (d) => setShift(Math.max(-teto, Math.min(teto, d)));
      if (b.top < margin) empurrar(margin - b.top);
      else if (b.bottom > window.innerHeight - margin) empurrar(window.innerHeight - margin - b.bottom);
      // A MESMA guarda do eixo vertical, e pela mesma razão: só vira se o outro lado tiver MAIS
      // espaço. Sem ela, uma caixa mais larga que qualquer um dos dois lados (um label longo, que
      // aqui é `whitespace-nowrap`) não caberia em lugar nenhum e o flip oscilaria para sempre.
      const espacoDireita = window.innerWidth - rect.right;
      const espacoEsquerda = rect.left;
      if (!flip && b.left < margin && espacoDireita > espacoEsquerda) setFlip(true);
      else if (flip && b.right > window.innerWidth - margin && espacoEsquerda > espacoDireita) setFlip(false);
      return;
    }
    if (b.left < margin) setShift(margin - b.left);
    else if (b.right > window.innerWidth - margin) setShift(window.innerWidth - margin - b.right);
    // Vira para o lado oposto se estourar a tela — MAS só se o outro lado tiver mais espaço.
    // Sem essa checagem, um gatilho muito alto (ex.: a alça de resize do SidePanel, h-full) não
    // cabe em nenhum lado e o flip oscilava true/false infinitamente → "Maximum update depth" →
    // tela branca. Comparar o espaço garante que o flip nunca volta atrás.
    const espacoAbaixo = window.innerHeight - rect.bottom;
    const espacoAcima = rect.top;
    if (!flip && b.bottom > window.innerHeight - margin && espacoAcima > espacoAbaixo) setFlip(true);
    else if (flip && b.top < margin && espacoAbaixo > espacoAcima) setFlip(false);
  }, [rect, flip, lateral]);

  if (!label || !isValidElement(children)) return children;

  const trigger = cloneElement(children, {
    ref,
    onMouseEnter: (e) => { children.props.onMouseEnter?.(e); abrir(); },
    onMouseLeave: (e) => { children.props.onMouseLeave?.(e); fechar(); },
    onFocus: (e) => { children.props.onFocus?.(e); abrir(); },
  });

  let arrowTop, boxTop, vTransform = '';
  if (rect && !lateral) {
    if (flip) {
      arrowTop = rect.top - GAP;
      boxTop = rect.top - GAP - OVERLAP;
      vTransform = ' translateY(-100%)';
    } else {
      arrowTop = rect.bottom + GAP;
      boxTop = rect.bottom + GAP + OVERLAP;
    }
  }
  let left = align === 'start' ? rect?.left : rect?.left + rect?.width / 2;
  let arrowLeft = align === 'start' ? rect?.left + 16 : rect?.left + rect?.width / 2;
  let boxTransform = (align === 'start' ? `translateX(${shift}px)` : `translateX(calc(-50% + ${shift}px))`) + vTransform;
  let setaTransform = `translateX(-50%)${vTransform}`;

  // O lateral SOBRESCREVE, nunca altera o cálculo acima: com placement vertical `lateral` é false e
  // este bloco não roda, então as strings de estilo dos usos de hoje saem idênticas.
  //
  // O `align` não participa daqui — ele decide o alinhamento HORIZONTAL, e no lateral é o horizontal
  // que ancora. O que sobra dele é o que lhe é próprio: o gate de truncamento e o `maxWidth`.
  if (rect && lateral) {
    // Arredondado, e o MESMO valor nas duas camadas: o gatilho é um ícone de 14px numa linha de 23
    // na base de 87,5%, então o meio cai fracionário quase sempre — e numa seta de 10px o navegador
    // antialiasa a ponta, que lê como borrada (a armadilha do meio pixel do CLAUDE.md, no eixo Y).
    // Valores diferentes na seta e na caixa tirariam a ponta do lugar.
    const meio = Math.round(rect.top + rect.height / 2);
    arrowTop = meio;
    boxTop = meio;
    arrowLeft = flip ? rect.right + GAP : rect.left - GAP;
    left = flip ? rect.right + GAP + OVERLAP : rect.left - GAP - OVERLAP;
    setaTransform = flip ? 'translateY(-50%)' : 'translate(-100%, -50%)';
    boxTransform = flip
      ? `translateY(calc(-50% + ${shift}px))`
      : `translate(-100%, calc(-50% + ${shift}px))`;
  }

  const animar = lateral
    ? (flip ? 'animate-tooltip-direita' : 'animate-tooltip-esquerda')
    : (flip ? 'animate-tooltip-cima' : 'animate-tooltip-baixo');
  // A origem do zoom é a borda COLADA no gatilho, que é o que `origin-top`/`origin-bottom` fazem no
  // vertical.
  const origem = lateral
    ? (flip ? 'origin-left' : 'origin-right')
    : (flip ? 'origin-bottom' : 'origin-top');

  return (
    <>
      {trigger}
      {rect && createPortal(
        <>
          {/* Três camadas, e cada uma tem um motivo: a de fora POSICIONA (e o transform dela é o do
              posicionamento), a do meio ANIMA a entrada, e a de dentro desenha. Juntar animação e
              posicionamento no mesmo elemento faz um sobrescrever o outro — o balão saltaria para o
              canto da tela no primeiro quadro. A seta acompanha o mesmo movimento da caixa: animada
              só na de dentro, ela ficaria parada enquanto o balão desliza. */}
          <div className="fixed z-[80] pointer-events-none" style={{ top: arrowTop, left: arrowLeft, transform: setaTransform }}>
            {/* px arbitrário, não `h-2.5`: as escalas do Tailwind são em rem e encolhem com o
                `font-size: 87.5%` do app — `h-2.5` daria 8,75px, e a seta ficaria menor que a do
                mockup aprovado. Mesma razão do padding e da fonte da caixa abaixo. */}
            <div className={animar}>
              <div className="h-[10px] w-[10px] rotate-45 rounded-[2px] bg-gray-800" />
            </div>
          </div>
          <div ref={boxRef} className="fixed z-[80] pointer-events-none" style={{ top: boxTop, left, transform: boxTransform }}>
            <div className={`${animar} ${origem}`}>
              <div className={`rounded-md bg-gray-800 px-[12px] py-[6px] text-[12px] font-medium text-white shadow-lg ${
                align === 'start' ? 'leading-snug' : 'whitespace-nowrap'}`}
                style={align === 'start' ? { maxWidth } : undefined}>
                {label}
              </div>
            </div>
          </div>
        </>,
        document.body
      )}
    </>
  );
}
