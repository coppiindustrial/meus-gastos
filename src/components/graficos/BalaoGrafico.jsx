import { useState } from 'react';
import { createPortal } from 'react-dom';

// Balão de leitura dos gráficos do Dashboard (linha e barras): card branco com a data por extenso
// em cima e uma ou mais linhas "rótulo · valor". Vive fora dos gráficos para os dois lerem igual.
//
// Posicionamento: ancorado no CURSOR, deslocado para baixo-direita (molde do Google Analytics) —
// assim ele desliza junto com o mouse e não cobre o próprio dado. Vira para o outro lado quando
// não cabe. Portado ao body para escapar de overflow/transform de ancestrais.
export const LARG_BALAO = 200;
export const ALT_BALAO = 78;
const OFF = 16;    // deslocamento diagonal a partir do cursor
const MARGEM = 8;  // respiro mínimo das bordas da tela

// Posição do balão a partir do evento de mouse. Exportada para os gráficos calcularem no onMouseMove.
export function posicaoBalao(e, largura = LARG_BALAO, altura = ALT_BALAO) {
  const larguraTela = document.documentElement.clientWidth;
  const alturaTela = document.documentElement.clientHeight;
  let left = e.clientX + OFF;
  if (left + largura + MARGEM > larguraTela) left = e.clientX - largura - OFF;
  let top = e.clientY + OFF;
  if (top + altura + MARGEM > alturaTela) top = e.clientY - altura - OFF;
  return {
    left: Math.max(MARGEM, Math.min(left, larguraTela - largura - MARGEM)),
    top: Math.max(MARGEM, Math.min(top, alturaTela - altura - MARGEM)),
  };
}

// Estado de hover de um gráfico: qual item está sob o cursor e onde desenhar o balão. Sai daqui
// porque cinco gráficos do painel de contatos precisam exatamente do mesmo par.
//
// `ativo` é uma CHAVE livre (índice, id, lado da barra) — quem usa decide. `esmaecido(chave)` dá o
// realce no molde do Google Analytics, que o widget da agenda já usa: o item apontado mantém a cor
// cheia e os outros recuam, em vez de o apontado ganhar uma caixa de fundo atrás.
//
//
// `largura` e `altura` viajam até aqui porque é o `aoMover` quem chama o `posicaoBalao` — e é ele
// que decide para que lado o balão vira perto da borda. Com a medida errada a decisão sai errada: um
// balão de quatro linhas medido como se tivesse duas (os 78px do padrão) vira para cima achando que
// cabe e sai pelo RODAPÉ da janela. Medido no gráfico por ano, antes de passar a altura: com o
// cursor a 740px numa janela de 860, o balão terminava 19px fora da tela.
export function useBalao(largura = LARG_BALAO, altura = ALT_BALAO) {
  const [ativo, setAtivo] = useState(null);
  const [pos, setPos] = useState(null);
  return {
    ativo,
    pos,
    aoMover: (chave) => (e) => { setAtivo(chave); setPos(posicaoBalao(e, largura, altura)); },
    aoSair: () => { setAtivo(null); setPos(null); },
    esmaecido: (chave) => ativo !== null && ativo !== chave,
  };
}

// `itens`: [{ rotulo, valor, cor? }] — a cor vira um quadradinho antes do rótulo (legenda).
// `children`: linha extra opcional (ex.: a variação "vs. anterior" do gráfico de linha).
// `nota`: a frase que EXPLICA a conta, embaixo de tudo, separada por uma divisória.
// `largura`: o padrão serve a rótulo curto com número curto; quem tem rótulo longo E dinheiro por
// extenso passa a sua (ver `GraficoOrcamentosCliente`) — e tem de passar a MESMA ao `useBalao`.
//
// A NOTA VIROU PROP porque já existiam TRÊS cópias dela, duas delas divergentes sem ninguém ter
// decidido: o `ResumoCliente` embrulhava em `text-gray-400 leading-[14px]`, o `GraficoNoTempo` em
// `text-gray-500 leading-[1.4]`, e o `KpisComercial` passava a frase CRUA como filho — sem classe
// nenhuma, herdando o corpo padrão do navegador, que é o defeito que apareceu na tela.
//
// Ela é SEPARADA de `children` de propósito: nem todo filho é nota. O `GraficoSerie` passa a linha
// de variação "vs. anterior", que é um DADO a mais e não leva divisória nem o cinza de rodapé.
export default function BalaoGrafico({ pos, titulo, itens = [], children, nota, largura = LARG_BALAO }) {
  if (!pos) return null;
  return createPortal(
    // `...pos` e não `left: pos.left, top: pos.top`: o balão nasceu ancorado no CURSOR (o `useBalao`
    // sempre entrega esse par), mas a legenda da grade de "Fechados no tempo" o ancora num BOTÃO
    // parado, pelo `posicionarPopover` — que devolve `bottom`/`right` quando o cartão vira para cima
    // ou para a esquerda. Lendo só `left`/`top`, esses dois casos chegavam aqui como `undefined` e o
    // cartão ia parar no canto da janela. Espalhar aceita as duas formas sem mudar a antiga.
    <div style={{ position: 'fixed', ...pos, width: largura }}
      className="z-[80] pointer-events-none rounded-lg border border-elevado bg-elevado px-3 py-2.5 shadow-lg sombra-popover">
      <div className="text-[11px] text-gray-500 mb-1.5">{titulo}</div>
      {itens.map((it) => (
        // `items-start` + `min-w-0` no rótulo + `nowrap` no VALOR: as três coisas juntas, e nenhuma é
        // enfeite. Sem o `nowrap` o número quebra no meio; sem o `min-w-0` o rótulo não cede largura
        // (o mínimo de um item flex é o conteúdo dele) e o número é EMPURRADO PARA FORA da caixa —
        // foi o que aconteceu com "Valor orçado (cadastro)" ao lado de "R$ 10.177.367,87". Quem tem
        // de ceder é o rótulo, que quebra em duas linhas; o número, nunca. E é por ele quebrar que o
        // alinhamento vai para o topo: centralizado, o número flutuaria no meio de duas linhas.
        <div key={it.rotulo} className="flex items-start justify-between gap-3">
          <span className="flex min-w-0 items-start gap-1.5 text-[12px] text-gray-700">
            {it.cor && <span className="mt-[5px] h-2 w-2 shrink-0 rounded-[2px]" style={{ background: it.cor }} />}
            {it.rotulo}
          </span>
          {/* Mesmo tamanho do rótulo ao lado: em 15px contra 12px o número gritava dentro de uma
              caixa de 200px. A hierarquia fica por peso e cor (bold + gray-900), não por corpo. */}
          <span className="shrink-0 whitespace-nowrap text-[12px] font-bold text-gray-900 tabular-nums">{it.valor}</span>
        </div>
      ))}
      {children}
      {/* CONDICIONAL, nunca incondicional: a `<div>` sempre presente desenha a divisória de 1px
          sobre o vazio nos cartões que não têm explicação. */}
      {nota && (
        <div className="mt-1.5 border-t border-gray-100 pt-1.5 text-[10.5px] leading-[14px] text-gray-400">
          {nota}
        </div>
      )}
    </div>,
    document.body,
  );
}
