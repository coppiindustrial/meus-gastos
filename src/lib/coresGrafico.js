import { varCor } from './varCor.js';
// As três cores de CHROME dos gráficos: grade, eixo e trilho de barra.
//
// POR QUE EXISTE: não havia token nenhum — cada gráfico escrevia o hex à mão, e foi assim que os
// TRILHOS DE BARRA acabaram com três valores diferentes para exatamente a mesma função (`#eff0f3`
// em `analiseCliente`, `#f1f2f4` em outros quatro arquivos e `#eceef1` no `ClienteAnosAmpliado`).
// Ninguém decidiu isso; foi divergindo. Com um módulo, o próximo gráfico não inventa o quarto.
//
// AS CORES SAEM DA TABELA, e é o que o pedido dizia: a grade era `#f1f2f4`, mais clara que qualquer
// borda de tabela do app, e por isso lia como "apagada".
//
// A HIERARQUIA É O PONTO: eixo mais forte que grade. Em seis gráficos o eixo do zero já era
// `#e5e7eb` enquanto a grade era `#f1f2f4` — subir só a grade igualaria os dois e a linha do zero
// desapareceria dentro da grade. Por isso a grade assume o `#e5e7eb` e o eixo sobe um degrau.
//
// Isto é chrome, NÃO cor de dado. As paletas de série (`CINZAS` em `analiseCliente.jsx`,
// `COR_FAIXA` do Esfriando, a `ESCALA` do calendário) ficam de fora de propósito: mexer nelas
// mudaria a leitura do gráfico, não a moldura dele.

/** Linhas de grade e referências tracejadas. É o `border-gray-200` das linhas de tabela. */
// A GUIA VERTICAL TRACEJADA que segue o cursor — a peça que amarra o balão ao gráfico: sem ela o
// cartão diz "jul/26" e nada na tela mostra a qual coluna aquilo se refere.
//
// Ela mora AQUI, e não em `comercial/comum.js` onde nasceu, porque os dois dashboards a usam e
// `dashboard/` importar de `comercial/` seria acoplamento na direção errada — o `GraficoSerie` já
// tinha uma cópia escrita à mão, e o Ritmo seria a terceira. O `comum.js` reexporta, então os
// chamadores do comercial não mudam uma linha.
//
// SEM `z-index` de propósito: quem decide a camada é a ORDEM NO DOM. A guia é a PENÚLTIMA da
// caixa — acima das barras, abaixo do ponto do cursor —, e um `z-index` aqui a poria acima do
// ponto também.
export const CLASSE_GUIA = 'pointer-events-none absolute bottom-0 top-0 w-px border-l border-dashed border-gray-300';

// O TEXTO DE UM RÓTULO DE VALOR escrito sobre o quadro — o número que vai em cima (ou dentro) de
// uma barra, não o do eixo. Ele é quase-preto e NUNCA a cor da própria série: pintado da cor dela
// fica ilegível quando pousa sobre outra barra, e repete em 9px uma informação que a barra já dá em
// 40px de altura. A cor identifica a SÉRIE; o rótulo só precisa ser lido, e quem diz de quem ele é
// é a POSIÇÃO.
//
// **NÃO PONHA HALO BRANCO ATRÁS DELE.** Um `text-shadow` de quatro camadas em #fff foi tentado e o
// efeito na tela foi o oposto do pretendido: em 9px o brilho engole os traços finos do glifo e o
// número escuro se lê como CLARO, dentro de uma mancha luminosa.
//
// Nasceu em `comercial/vagas.jsx` e subiu para cá quando o "No tempo" da Ficha do Cliente passou a
// escrever os valores: `cliente/` importar de `comercial/` seria acoplamento na direção errada — é
// a mesma razão que trouxe a `CLASSE_GUIA` acima. O `vagas.jsx` reexporta, então os chamadores do
// comercial não mudam uma linha.
export const COR_ROTULO = varCor('#1f2937', 'texto');

export const GRADE = varCor('#e5e7eb', 'borda');

/** Eixo base (a linha do zero). É o `border-gray-300` da moldura e da base do cabeçalho. */
export const EIXO = varCor('#d1d5db', 'borda');

/** Fundo de barra — o trecho não preenchido. Unifica os três valores que existiam. */
export const TRILHO = varCor('#eceef1', 'fundo');

// ── TEXTO ────────────────────────────────────────────────────────────────────────────────────
// Mesma categoria das três acima: moldura do gráfico, não dado. Entraram porque as cores de texto
// repetiam o mesmo defeito — 15 cópias literais da classe do título, e um `#b6bac0` que era o ÚNICO
// uso daquele hex em todo o `src`.
//
// TODAS as cores de texto de gráfico reprovavam no contraste mínimo sobre branco (4,5:1 para texto
// pequeno; com 9,5–10,5px nem a tolerância de texto grande valia): título e rótulo em `#9ca3af`
// davam 2,54:1, o eixo Y do Pareto em `#b6bac0` dava 1,95:1, e a dica em `#c9ccd1`, ~1,6:1.

/** Título do bloco (maiúsculo, 10,5px). `gray-700` — 10,31:1. */
export const TITULO = varCor('#374151', 'texto');

/**
 * SUBTÍTULO — o cabeçalho de coluna e o micro-rótulo DENTRO do bloco ("ANO · FECHOU · CONVERSÃO",
 * "INTERVALO MÉDIO", o rótulo de um KPI). `gray-600` — 7,56:1.
 *
 * Ele tem um degrau SÓ DELE, entre o título e o eixo, e isso é a decisão: um cabeçalho de coluna
 * nomeia o que a coluna contém, então não pode ser mais apagado que os NÚMEROS do eixo — que era
 * exatamente o estado anterior (subtítulo em 2,54:1 contra eixo em 4,83:1, hierarquia invertida).
 *
 * A escala fecha em quatro degraus, sem empate: título 10,31 ≥ subtítulo 7,56 ≥ eixo 4,83 > dica
 * 2,54. Na maioria dos pontos ele entra como a CLASSE `text-gray-600` (mesmo hex), porque ali o
 * elemento já é estilizado por Tailwind e misturar `style` com `className` só esconde a cor.
 */
export const SUBTITULO = varCor('#4b5563', 'texto');

/** Números ao redor do gráfico. `gray-500` — 4,83:1, e é a cor do cabeçalho de tabela do app. */
export const ROTULO_EIXO = varCor('#6b7280', 'texto');

/**
 * Rótulo de eixo com ÊNFASE. Existe por um caso real: no `GraficoEsfriando` a marca do início da
 * zona de risco é mais escura que os vizinhos de propósito. Sem um token próprio, a padronização
 * teria apagado essa distinção como se fosse ruído.
 */
export const ROTULO_EIXO_FORTE = varCor('#374151', 'texto');

/** A dica ao lado do título. Um degrau ABAIXO do rótulo de eixo — ela nomeia, não informa. */
export const DICA = varCor('#9ca3af', 'texto');

// ── ANO ──────────────────────────────────────────────────────────────────────────────────────
// Esta é cor de DADO, e não de moldura — entrou aqui mesmo assim porque é a única regra de cor
// que dois módulos precisam: nasceu no Dashboard Comercial (`comercial/comum.js`, que reexporta) e
// o DRE passou a usá-la na comparação entre anos. `dre/` importar de `comercial/` seria acoplamento
// na direção errada, o motivo que já trouxe a `CLASSE_GUIA` para cá.
//
// A COR DE UM ANO É UMA RAMPA DE RECÊNCIA, e não uma paleta categórica: ano tem ORDEM, e a
// leitura que interessa é qual é o mais novo — ele vai cheio e os anteriores clareiam. É o mesmo
// idioma do `corFaixa` de `lib/faixasValor.js`.
//
// ELA É PARAMETRIZADA PELA COR BASE, e não presa ao índigo como a primeira versão (`corAno`), que
// saiu quando o modo de comparação foi removido. O "Orçado × confirmado" a trouxe de volta com
// DUAS rampas ao mesmo tempo: o vermelho do orçado e o verde do confirmado continuam dizendo o
// DESFECHO, e o ano entra por cima disso como clareamento — se a cor dissesse só o ano, as duas
// séries de um mesmo ano ficariam indistinguíveis.
//
// `i` é a posição na lista ORDENADA por ano crescente, então o último é sempre o cheio. O piso de
// 34% existe para o ano mais antigo não sumir no branco quando são muitos.
export const tomAno = (cor, i, n) => (n <= 1
  ? cor
  : `color-mix(in srgb, ${cor} ${Math.round(34 + (i / (n - 1)) * 66)}%, ${varCor('#ffffff', 'fundo')})`);

// O TOM CLARO DE UM PAR — o degrau MAIS CLARO da mesma rampa acima (os mesmos 34%), para quando a
// série se parte em duas metades e a cor precisa dizer o CONJUNTO enquanto o tom diz o SPLIT. É o
// caso do "Clientes por ano": índigo para quem orçou, verde para quem fechou, cheio para os novos e
// claro para os de carteira.
//
// A prova de que a regra é a certa, e não um piso escolhido a esmo: aplicada ao `COR_MARCA`
// (#5b57e0) ela devolve #c7c6f4, contra o #c7c5f2 que estava escrito À MÃO em três lugares daquele
// widget — um nível de diferença no verde e dois no azul, imperceptível. Ou seja, alguém já tinha
// chegado neste tom a olho; aqui ele passa a sair de uma conta, e o verde claro nasce da mesma.
export const tomClaro = (cor) => `color-mix(in srgb, ${cor} 34%, ${varCor('#ffffff', 'fundo')})`;
