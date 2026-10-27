import { useLayoutEffect, useRef } from 'react';

// Abas com SUPERFÍCIE DESLIZANTE — o desenho que nasceu no seletor de empresas do ContatoModal
// ("Resultados / Selecionadas") e agora serve também as sub-abas da Ficha do Cliente.
//
// A superfície fica ATRÁS do texto (`z-0` contra o `z-10` dos botões), e os botões não têm fundo
// próprio: é isso que permite ela escorregar de uma aba para a outra em vez de acender e apagar. A
// alternativa — pintar o botão ativo — não tem como animar, porque não há um objeto único que se
// mova.
//
// A medição é `useLayoutEffect` e não `useEffect`: ele roda ANTES da primeira pintura, então a
// montagem já nasce com a superfície no lugar certo. Com `useEffect` ela apareceria em `left: 0`
// por um quadro e deslizaria até a aba ativa toda vez que a tela montasse. E a primeira medição é SEM
// animação (o `montado`): só o layout effect não bastava, porque medir ANIMANDO na montagem também
// fazia a pílula deslizar a partir de `left: 0`. Com `cheia` nada disso roda: a posição é CSS puro
// (ver `posCheia`), que é o único jeito de ela não se descolar quando o layout em volta muda.
//
// A CASCA é a MESMA nas duas variantes: `border-gray-300` sobre `#f6f7f8`, que é literalmente o
// `Trilho` da faixa de filtros. O grafite já foi `bg-gray-100` sem contorno, e sem borda o controle
// não tinha onde terminar — dentro de um modal cheio de campos brancos, um fundo cinza-claro solto
// lê como um vão, não como um seletor. Com a casca compartilhada, a variante governa só a PÍLULA:
//   · `grafite` (padrão) — pílula grafite e texto branco. É o do seletor de empresas, dentro
//     de um modal, onde o contraste alto ajuda a achar o controle. No escuro ela se inverte (clara
//     com o texto escuro), pelos tokens `pilula`/`pilula-qtd` de `tema/escuro.mjs`.
//   · `claro` — pílula BRANCA com a mesma borda do trilho. É o da Ficha do Cliente, onde as abas
//     ocupam a largura toda da coluna: em largura cheia o grafite vira o elemento mais escuro da
//     tela e passa a competir com o conteúdo. Aqui ele fica na mesma família do filtro logo abaixo.
//
// `cheia` faz o grupo ocupar 100% da largura e os botões dividirem o espaço em partes iguais —
// senão cada aba mede o próprio texto e "Visão geral" fica maior que "Atividades".
//
// `folga` é o vão entre o trilho e a pílula — o padding do trilho e o inset da superfície, que TÊM
// de ser o mesmo número (o botão é filho de fluxo e cai no content box; a pílula é absoluta e cai no
// padding box, e é a coincidência dos dois que faz uma cobrir o outro exatamente).
//
// Ela é prop porque a folga certa depende do TAMANHO do controle, e os quatro usos não são iguais:
// a pílula mede `altura − 2 bordas − 2 × folga`, contra uma linha de texto de 18,75px. Com a folga
// padrão de 3, um trilho de 38px dá pílula de 30 (5,6px sobrando de cada lado, confortável) e um de
// 30 dá pílula de 22 — 1,6px por lado, que é o que faz a caixa parecer apertada em volta da palavra.
// Os dois toggles de 30px passam `folga={2}` e ficam com 24; o de 38 e o do seletor de empresas
// (grafite, SEM `altura`, onde é justamente o padding que dá altura ao trilho) não mudam.
//
// `qtdSolta` escreve a contagem SEM parênteses, depois do rótulo e num cinza mais claro ("Valores 1"
// em vez de "Valores (1)"): dois caracteres a menos por aba, e o número deixa de disputar com o
// rótulo. Nasceu nas abas do histórico do DRE, que não cabiam no painel estreito. Sem a prop, nada muda.
//
// `abas`: [{ key, label, qtd?, aria? }] · `valor`: a key ativa · `onChange(key)`. `aria` é o nome
// acessível da aba quando o `label` é só um ícone (a troca Lista | Calendário da Fila).
export default function AbasPilula({
  abas, valor, onChange, className = '', variante = 'grafite', cheia = false, altura, folga = 3, qtdSolta = false,
}) {
  const btnRefs = useRef({});
  const indRef = useRef(null);
  const trackRef = useRef(null);
  // A última largura MEDIDA do trilho e o instante da última troca de aba — os dois existem só para
  // as guardas do `ResizeObserver` lá embaixo, que é onde a animação de deslize morreu uma vez.
  const larguraTrilho = useRef(0);
  const trocaEm = useRef(0);
  // A primeira medição é SEM animação (ver o efeito). Existe porque ela era `medir(true)`: a pílula
  // nascia em `left: 0` e DESLIZAVA até a aba ativa a cada montagem — no painel da estrutura do DRE,
  // que remonta a cada linha escolhida, isso era a "piscada" de todo clique (26/09/2026).
  const montado = useRef(false);
  const claro = variante === 'claro';

  // `assinatura` e não `abas` nas dependências: quem chama monta o array no JSX, então ele é novo a
  // cada render do pai e a medição rodaria à toa. O contador entra nela porque um rótulo que muda de
  // largura precisa re-medir — senão a superfície fica curta ou sobra.
  const assinatura = abas.map((a) => `${a.key}:${a.qtd ?? ''}`).join('|');

  // A ENTRELINHA TEM DE SER ÍMPAR, e é isso que centra o texto na vertical.
  //
  // A altura ÚTIL (a da pílula e a do botão) é `altura − 2 bordas − 2 × folga`. Dentro do botão o
  // que se desloca é a CAIXA DE TEXTO, que mede 15px em 12,5px de corpo — um número ÍMPAR. A folga
  // que sobra é repartida como meia-entrelinha, e quando ela cai em meio pixel o navegador arredonda
  // para lados diferentes: com entrelinha 24 e caixa 15, `(24 − 15) / 2 = 4,5` vira **4 em cima e 5
  // embaixo**, e o rótulo senta alto. É a mesma classe do círculo do interruptor de `ajustes/` —
  // simetria de layout certa, pintura assimétrica, e `getBoundingClientRect` não acusa.
  //
  // Com a entrelinha ÍMPAR a meia-entrelinha fecha em número inteiro e as duas folgas ficam iguais.
  // A altura da pílula NÃO muda — o controle continua do mesmo tamanho. Medido nas três geometrias
  // reais do app, com a transição desarmada (ver a armadilha da aba oculta na verificação):
  //
  //   30 / 2  (os 13 usos)         útil 24 · hoje 24 → −0,5px   · ímpar 25 → 0
  //   31 / 2  (RelatorioComercial) útil 25 · hoje 25 →     0    · ímpar 25 → 0   (já caía em ímpar)
  //   38 / 3  (ClienteFicha)       útil 30 · hoje 30 → −0,5px   · ímpar 31 → 0
  //
  // O comentário que havia aqui afirmava "4/4 com esta conta"; não valia mais — medido, era 4/5.
  // Só vale COM `altura`: sem ela quem dá a altura é o `py-[5px]` e não há entrelinha declarada.
  const util = altura ? altura - 2 * folga - 2 : 0;
  const entrelinha = util % 2 === 0 ? util + 1 : util;
  // COM `cheia` A PÍLULA É POSICIONADA SÓ POR CSS, sem medir nada (26/09/2026). Os botões são
  // `flex-1`, então têm todos a mesma largura: a pílula mede `1/n` do trilho (descontadas a folga e as
  // `n − 1` frestas do `gap-0.5`) e anda `índice × (100% + fresta)` — no `translateX` o `100%` é a
  // largura dela mesma. Assim ela NUNCA se descola do layout: medida em JS, ela ficava para trás
  // quando o trilho mudava de largura logo depois de montar — no painel da estrutura do DRE, a grade
  // dos campos trocava de duas para três colunas depois de a pílula (filha) já ter se medido, e ela
  // aparecia FORA do controle, deslizando para dentro. A transição só anda quando o índice muda.
  const idx = Math.max(0, abas.findIndex((a) => a.key === valor));
  const posCheia = cheia ? {
    left: folga,
    width: `calc((100% - ${2 * folga}px - ${abas.length - 1} * 0.125rem) / ${abas.length})`,
    transform: `translateX(calc(${idx} * (100% + 0.125rem)))`,
  } : null;

  useLayoutEffect(() => {
    const track = trackRef.current;
    const ind = indRef.current;
    if (!track || !ind || cheia) return;

    // `getBoundingClientRect` e não `offsetWidth`/`offsetLeft`: os dois arredondam para INTEIRO, e
    // com `flex-1` a largura real é fracionária (medido: botão de 205,71px virando 206). O erro
    // acumula e a superfície estoura a caixa.
    //
    // E o `-bordaEsq`: o `left: 0` da pílula é relativo ao PADDING box do trilho (por dentro da
    // borda), enquanto o rect é medido do border box. Sem descontar, ela nasce deslocada pela
    // espessura da borda. O defeito apareceu primeiro na variante clara, que era a única com borda;
    // hoje as DUAS têm, e é por isso que o desconto vem do `getComputedStyle` e não de um número
    // escrito à mão — ele vale para qualquer casca.
    const medir = (animar) => {
      const btn = btnRefs.current[valor];
      if (!btn) return;
      const rb = btn.getBoundingClientRect();
      const rt = track.getBoundingClientRect();
      const bordaEsq = parseFloat(getComputedStyle(track).borderLeftWidth) || 0;
      if (!animar) ind.style.transition = 'none';
      ind.style.width = `${rb.width}px`;
      ind.style.transform = `translateX(${rb.left - rt.left - bordaEsq}px)`;
      if (!animar) {
        ind.getBoundingClientRect();   // força o reflow com a posição nova já aplicada
        ind.style.transition = '';     // devolve a transição para a folha de estilo
      }
    };

    // Na MONTAGEM a pílula nasce no lugar (`medir(false)`) e não abre a janela de troca do
    // `ResizeObserver`; dali em diante toda troca desliza, como sempre.
    const animar = montado.current;
    montado.current = true;
    if (animar) trocaEm.current = Date.now();
    medir(animar);
    larguraTrilho.current = track.getBoundingClientRect().width;

    // O trilho MUDA DE LARGURA sem a aba mudar, e era esse o defeito original: a coluna do meio tem
    // `overflow-y-auto`, então trocar de aba muda a altura do conteúdo, a barra de rolagem aparece e
    // a coluna estreita — com a pílula ainda medida para a largura anterior, sobrando para fora.
    // Recolher a sidebar e redimensionar a janela fazem o mesmo.
    //
    // DUAS GUARDAS, e as duas custaram a animação de deslize uma vez:
    //
    // 1. LARGURA INALTERADA NÃO FAZ NADA. O `ResizeObserver` entrega uma notificação assim que
    //    observa um elemento — e como `valor` está nas dependências, ele é re-observado a CADA troca
    //    de aba, sempre dentro dos 320ms do deslize que acabou de começar. Sem esta guarda, essa
    //    entrega inicial chamava `medir(false)`, que zera a transição, e a pílula SALTAVA em vez de
    //    escorregar. Era o defeito de "sumiu a animação".
    // 2. MUDANÇA DENTRO DA JANELA DE UMA TROCA RE-MEDE **ANIMANDO**. Quando a barra de rolagem de
    //    fato aparece, o alvo mudou no meio do voo — e aí o certo é RETARGETAR a transição (o
    //    navegador interpola do ponto onde está), não matá-la. Fora dessa janela — arrastar a janela,
    //    recolher a sidebar — segue sem animar, que é o comportamento correto: a superfície acompanha
    //    o layout, não desliza atrás dele.
    const ro = new ResizeObserver(() => {
      const w = track.getBoundingClientRect().width;
      if (Math.abs(w - larguraTrilho.current) < 0.5) return;
      larguraTrilho.current = w;
      medir(Date.now() - trocaEm.current < 400);
    });
    ro.observe(track);
    return () => ro.disconnect();
  }, [valor, assinatura, cheia, altura, folga]);

  return (
    // O padding vai INLINE, e não como `p-[Npx]`: valor arbitrário do Tailwind não aceita variável.
    <div ref={trackRef} style={{ padding: folga, ...(altura ? { height: altura } : null) }}
      className={`relative inline-flex gap-0.5 rounded-[7px] border border-gray-300 bg-hx-f6f7f8 ${
        cheia ? 'flex w-full' : ''} ${className}`}>
      {/* Grafite, não preto puro — o mesmo tom que o `Tooltip` do app já usa. No claro a borda é a
          MESMA do trilho de filtros, para os dois lerem como a mesma família. */}
      <span ref={indRef} aria-hidden="true" style={{ top: folga, bottom: folga, ...posCheia }}
        className={`absolute left-0 z-0 rounded-[5px] transition-all duration-[320ms] ease-[cubic-bezier(.65,0,.35,1)] will-change-transform ${
          claro ? 'border border-gray-300 bg-realce' : 'bg-pilula'}`} />
      {abas.map((a) => (
        <button key={a.key} type="button" ref={(el) => { btnRefs.current[a.key] = el; }}
          onClick={() => onChange(a.key)} aria-pressed={valor === a.key} aria-label={a.aria || undefined} title={a.aria || undefined}
          // A ENTRELINHA sai da altura útil do trilho, arredondada para ÍMPAR (ver o bloco acima) —
          // é ela que centra o TEXTO. Com `altura` o botão não tem padding vertical, e a entrelinha
          // herdada (18,75px numa caixa de 24) deixava os glifos acima do centro. O `flex
          // items-center` abaixo centra a CAIXA da linha; sem a entrelinha certa ele sozinho não
          // resolve, porque o desencontro é a meia-entrelinha da fonte.
          style={altura ? { lineHeight: `${entrelinha}px` } : undefined}
          // `flex items-center justify-center` quando há `altura`: ali o botão fica SEM padding
          // vertical (a altura vem do trilho), e sem alinhamento próprio quem centrava era só o
          // comportamento do UA — o texto encostava para cima. Sem `altura` quem centra é o
          // `py-[5px]`, e nada muda.
          className={`relative z-10 whitespace-nowrap rounded-[5px] px-[11px] transition-colors ${
            cheia ? 'flex-1' : ''} ${altura ? 'flex items-center justify-center text-[12.5px]' : 'py-[5px] text-[11.5px]'} ${
            valor === a.key
              ? (claro ? 'font-semibold text-gray-900' : 'font-semibold text-pilula')
              : 'font-medium text-gray-500 hover:text-gray-700'}`}>
          {a.qtd == null ? a.label
            : qtdSolta ? <>{a.label}<span className={`ml-1 font-medium tabular-nums ${valor === a.key && !claro ? 'text-pilula-qtd' : 'text-gray-400'}`}>{a.qtd}</span></>
              : `${a.label} (${a.qtd})`}
        </button>
      ))}
    </div>
  );
}
