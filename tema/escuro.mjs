// O MODO ESCURO troca a PALETA, não as classes (paleta "grafite neutro", escolhida por mockup em
// 25/09/2026). Cada cor que o app usa vira uma variável CSS com a cor de hoje como FALLBACK:
//
//   bg-gray-100  →  background-color: rgb(var(--tf-gray-100, 243 244 246) / var(--tw-bg-opacity))
//
// Sem o `data-tema="escuro"` no <html> nenhuma variável existe e vale o fallback — o claro é exatamente o
// de sempre, por construção. Com ele, o bloco gerado aqui define as variáveis com a versão escura.
//
// TRÊS FAMÍLIAS, porque a mesma cor faz trabalhos diferentes: `bg-white` é SUPERFÍCIE (vira o
// grafite do fundo) e `text-white` é texto sobre um preenchimento colorido (fica branco); o
// `#2563eb` de um anel de seleção clareia, o de um botão cheio fica. Por isso cada utilitário lê a
// sua família: `--tf-*` (fundo: bg, gradiente), `--tt-*` (texto: text, fill, stroke, decoração,
// placeholder) e `--tb-*` (borda: border, ring, divide, outline, sombra).
//
// OS HEX FIXOS (`bg-[#f4f5f7]`) viram o token `bg-hx-f4f5f7` pelo `npm run tema` (scripts/tema.mjs),
// que também lista em `tema/cores.json` quais existem — o config só gera o que a lista tem. Um hex
// escrito à mão depois continua funcionando no claro e fica sem versão escura até o script rodar.
//
// A VERSÃO ESCURA de cada cor sai de uma regra em OKLCH (a luminosidade perceptual), com as cores do
// mockup cravadas por cima (`FIXAS`). A regra, por família:
//   - neutro, fundo: o claro vira escuro na escala do grafite (branco → #1f2023, a superfície);
//   - neutro, texto e borda: a escala se inverte (o texto forte fica claro);
//   - colorido, fundo claro (os tons 50–200): a mesma cor, translúcida sobre o grafite;
//   - colorido, texto: clareia até ler bem sobre o grafite (contraste ≥ 4,5:1);
//   - colorido, borda clara: escurece para um tom médio da mesma cor;
//   - colorido cheio (botões, pontos, barras): fica como está.
import colors from 'tailwindcss/colors.js';

// ------------------------------------------------------------------ conversões (sRGB ↔ OKLab)
const lin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const gam = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
const hexParaRgb = (h) => { const n = parseInt(h, 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const rgbParaHex = (rgb) => rgb.map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('');

function oklch(hex) {
  const [r, g, b] = hexParaRgb(hex).map((v) => lin(v / 255));
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s;
  return { L, C: Math.hypot(A, B), h: Math.atan2(B, A) };
}

function rgbDeOklch({ L, C, h }) {
  const A = C * Math.cos(h); const B = C * Math.sin(h);
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.2914855480 * B) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s,
  ];
}

// Fora do gamut sRGB, tira croma até caber (preserva luminosidade e matiz).
function paraHex(cor) {
  let c = { ...cor, L: Math.min(1, Math.max(0, cor.L)) };
  for (let i = 0; i < 40; i++) {
    const rgb = rgbDeOklch(c);
    if (rgb.every((v) => v >= -0.0005 && v <= 1.0005)) return rgbParaHex(rgb.map((v) => gam(Math.min(1, Math.max(0, v))) * 255));
    c = { ...c, C: c.C * 0.9 };
  }
  return rgbParaHex(rgbDeOklch({ ...c, C: 0 }).map((v) => gam(Math.min(1, Math.max(0, v))) * 255));
}

const lumRel = (hex) => { const [r, g, b] = hexParaRgb(hex).map((v) => lin(v / 255)); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
export const contraste = (a, b) => { const [x, y] = [lumRel(a), lumRel(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

// ------------------------------------------------------------------ a paleta grafite
// O FUNDO É O DO TICKTICK (opção A do mockup do Dashboard, 25/09/2026): neutro PURO, sem o
// azulado do grafite de antes. Os tons neutros escuros desceram JUNTOS, com o mesmo deslocamento em
// OKLCH (o `L` que separa `#1f2023` de `#1c1c1c`), e perderam o croma — é isso que mantém a
// hierarquia página < cartão < menu < linha de grupo. Os tons de COR cravados (o azul do mês em
// preenchimento, o laranja do reaberto, o âmbar do ajuste) desceram o mesmo `L` e guardaram a cor.
// Os textos e as bordas fortes perderam o tom frio do grafite e ficaram cinza puro com a MESMA
// luminosidade (a pedido: "deixa os textos puros também"). Antes: página `161719`, cartão
// `1f2023`, menu `26272b`, borda `323439`.
export const SUPERFICIE = '1c1c1c';

// O escuro liga por ATRIBUTO no <html>, e não por uma classe: o Tailwind só emite regra de classe que
// ele acha no código, e a classe `dark` seria posta só em tempo de execução — o bloco inteiro sumia
// do CSS (medido: zero ocorrências no build).
export const SELETOR_ESCURO = "html[data-tema='escuro']";

// A escala cinza é CRAVADA (é ela que desenha quase toda a tela), uma por família. Os números saem do
// mockup aprovado: branco → superfície, gray-50 → cabeçalho da grade, gray-100 → linha de grupo…
// No FUNDO os tons 700–900 continuam ESCUROS (preenchimentos com texto branco em cima, como o botão
// grafite e a pílula ativa), só mais claros que a superfície — invertê-los apagaria o texto branco.
const CINZA = {
  fundo: { 50: '232323', 100: '272727', 200: '303030', 300: '3b3b3b', 400: '535353', 500: '5b5b5b', 600: '505050', 700: '484848', 800: '3e3e3e', 900: '343434', 950: '2a2a2a' },
  texto: { 50: '232323', 100: '2c2c2c', 200: '383838', 300: '565656', 400: '848484', 500: '9e9e9e', 600: 'b4b4b4', 700: 'd4d4d4', 800: 'ececec', 900: 'f4f4f4', 950: 'fafafa' },
  borda: { 50: '272727', 100: '2b2b2b', 200: '303030', 300: '424242', 400: '5f5f5f', 500: '737373', 600: '8d8d8d', 700: 'a9a9a9', 800: 'cbcbcb', 900: 'e1e1e1', 950: 'f1f1f1' },
};

// As cores do mockup aprovado, cravadas por cima da regra (a chave é o hex CLARO).
const FIXAS = {
  fundo: {
    ffffff: SUPERFICIE, f9fafb: '232323', f3f4f6: '272727', eef2f7: '2b2b2b', fafafa: '191919',
    eff6ff: '1d2636', fff7ed: '30241d', fffbeb: '30291c', f4f5f7: '2e2e2e', eceef1: '272727',
    fafbfc: '232323', f0f1f3: '282828', e7e9ef: '2e2e2e', f5f6f8: '272727', f6f7f8: '272727',
    e5e7eb: '323232', e2e4e8: '373737', f0f0f0: '131313', f7f8fa: '181818', fbfcfe: '202020',
    // O ponto do status "Parado" da Engenharia (o slate-300): pela regra ele viraria o cinza da
    // borda e sumiria sobre o cartão; no escuro é um cinza médio, como o do "Não iniciado".
    cbd5e1: '727272',
  },
  texto: {
    '20262f': 'eeeeee', '1f2937': 'ececec', '374151': 'd4d4d4', '4b5563': 'bcbcbc', '6b7280': 'aaaaaa',
    '9ca3af': '848484', '1d4ed8': '9ec0ff', b45309: 'f3ae6f', '2563eb': '6aa7ff', '6b727d': 'a0a0a0',
    '5a616d': 'adadad', '3b4350': 'c7c7c7', '2a3140': 'e1e1e1', '8a919c': '939393', '2b2b2b': 'e4e4e4',
    '98a0ab': '8f8f8f', '4a5261': 'b8b8b8', '5a5d61': 'acacac',
    // O número grande das quatro caixas da esteira do Ritmo (`RitmoModulo`): quase branco com um fio
    // da cor da caixa, como no mockup — pela regra ele sairia um azul/verde/roxo médio.
    '2c2c2a': 'e8e8e8', '042c53': 'd9eafd', '04342c': 'd0f0e8', '26215c': 'e4e6fd',
  },
  borda: {
    bfdbfe: '2a4777', fed7aa: '664021', eef0f2: '282828', e5e7eb: '303030', d1d5db: '424242', e8eaee: '323232',
    e6e8ec: '2e2e2e', '2563eb': '5b9bff', d97706: 'f5a524', fde68a: '66501b', fcd34d: '755c1b',
  },
};

// Os tokens de SIGNIFICADO: [claro, escuro]. O claro é sempre a cor que a peça já tinha.
//   · `elevado`: menus, cartões, popovers e avisos que abrem POR CIMA da tela;
//   · `realce`: a peça LEVANTADA sobre um trilho (a pílula ativa, a aba escolhida). No claro ela é
//     branca sobre um trilho cinza; pela paleta ela ficaria MAIS ESCURA que o trilho no escuro;
//   · `alterna-*` e `bola-*`: o interruptor. Pela paleta o trilho ligado (gray-800) e o desligado
//     (gray-300) viram dois cinzas quase iguais, e a bola branca vira a superfície — ligado e
//     desligado deixariam de se distinguir. No escuro o ligado é claro com a bola escura.
const SEMANTICOS = {
  fundo: {
    // `elevado` subiu de `232323` para `262626` (25/09/2026, a opção B de um mockup,
    // https://claude.ai/artifact/Mws1La4hRiCAvF3TqCoLvP), junto com a borda (`373737` → `4a4a4a`) e a
    // sombra própria do escuro (`.sombra-popover`, em `index.css`): o popover se confundia com a
    // tabela e com os cards, e a sombra do claro some sobre o grafite.
    elevado: ['ffffff', '262626'],
    realce: ['ffffff', '383838'],
    'alterna-on': ['1f2937', 'e9e9e9'],
    'alterna-on-hover': ['111827', 'f5f5f5'],
    'alterna-off': ['d1d5db', '424242'],
    'alterna-off-hover': ['9ca3af', '5a5a5a'],
    'bola-on': ['ffffff', SUPERFICIE],
    'bola-off': ['ffffff', 'c7c7c7'],
    // `escurece`: a película de hover que escurece o que está embaixo (`group-hover:bg-escurece/[.055]`).
    // No claro é o gray-900; pela paleta ele viraria um grafite que some sobre o fundo escuro, então
    // no escuro ela CLAREIA — o mesmo papel do `bg-black/5`, que já clareia.
    escurece: ['111827', 'ffffff'],
    // `pagina`: o fundo da PÁGINA, atrás do conteúdo (o `body`). No claro é o branco de sempre; no
    // escuro é o `131313` do Dashboard e das fichas, um degrau ABAIXO da superfície — sem ele o
    // Kanban, a Fila e as outras telas de trabalho ficavam com página, cabeçalho, sidebar e cartões na
    // mesma cor (opção 1 do mockup de 25/09/2026). Cabeçalho e sidebar continuam na superfície.
    pagina: ['ffffff', '131313'],
    // OS CARDS DOS QUADROS e a TRILHA de conclusão (a opção E1 de um mockup, 25/09/2026,
    // https://claude.ai/artifact/QfbiiRDP5bnumCagVefMXM). Na superfície `1c1c1c` sobre a página
    // `131313` o card quase sumia, e na trilha a cápsula (`272727`), as barras (`303030`) e os C/A
    // desligados (borda `424242`) eram três cinzas vizinhos — "apagada", nas palavras do usuário.
    //   · `cartao`: o card do Kanban de Custos e do Painel da Engenharia, um degrau acima;
    //   · `trilha`: a cápsula da trilha, MAIS ESCURA que o card — um trilho afundado, onde as peças
    //     aparecem;
    //   · `etapa`: o que ainda não aconteceu na trilha — a barra desligada e o C/A por marcar.
    cartao: ['ffffff', '222222'],
    trilha: ['f5f6f8', '181818'],
    etapa: ['e5e7eb', '3d3d3d'],
    // AS PÍLULAS SÓLIDAS dos status encerrados — Conferido (Custos) e Finalizado (Custos e
    // Engenharia) —, a opção B de um mockup (25/09/2026, https://claude.ai/artifact/1SzonR8bvt4q4XoTtsytPQ).
    // Cor cheia é "fica como está" pela regra, e o teal-600/green-700 com letra branca gritava entre
    // as pílulas tintadas; o ponto era `bg-white`, que no escuro vira a superfície — um ponto PRETO.
    // Continuam sólidas (é o que diz "encerrado" no claro), num tom mais fechado, com o ponto claro.
    conferido: ['0d9488', '115e59'],
    finalizado: ['15803d', '166534'],
    'ponto-conferido': ['ffffff', '5eead4'],
    'ponto-finalizado': ['ffffff', '86efac'],
    // A ÁREA DAS PARCELAS da conta no editor de regra do DRE (a opção O1a de um mockup, 25/09/2026,
    // página "Ordenar a conta" de https://claude.ai/artifact/WwW87dsrAzLbWTw1D8U2dp): uma prancheta
    // com malha de pontos onde as etiquetas se arrastam, que se tinge de azul durante o arrasto. A
    // ETIQUETA fica um tom ACIMA da área no escuro — pela paleta as duas seriam a mesma superfície.
    // Os pontos vão por `var(--tf-ponto-area)` num `radial-gradient` inline (`EditorRegra.jsx`).
    'area-conta': ['ffffff', '1c1c1c'],
    'area-conta-arrasto': ['f5f9ff', '1b202a'],
    // Os pontos da malha ficaram mais fracos em 26/09/2026, a pedido: atrás das etiquetas eles
    // competiam com elas. Claro `d6d9de` → `e4e6ea` (a reserva em `EditorRegra.jsx` anda junto),
    // escuro `363636` → `2a2a2a`.
    'ponto-area': ['e4e6ea', '2a2a2a'],
    'ponto-area-arrasto': ['a8c7fa', '3a5a8c'],
    etiqueta: ['ffffff', '292929'],
    'etiqueta-x': ['f3f4f6', '3a3a3a'],
    'etiqueta-x-ativo': ['e5e7eb', '474747'],
    // O DIA ESCOLHIDO NO CALENDÁRIO (`CalendarioData`, `CalendarioIntervalo`), da mesma rodada. Pela
    // paleta ele era o gray-800 → `3e3e3e`, quase o fundo do popover ("apagado"), e a bolinha de hoje
    // dentro dele era `bg-white` → a superfície: preta. No escuro ele se INVERTE, como o botão principal:
    // claro com o número escuro; a bolinha acompanha, e o meio do período fica num cinza visível.
    'dia-sel': ['1f2937', 'e9e9e9'],
    'dia-meio': ['f3f4f6', '333333'],
    // A CAIXINHA MARCADA dos menus e filtros (`CaixaMarcada`, o `Box` do filtro de Atividade e o
    // checkbox/radio nativo via `accent-caixa`), a pedido do usuário em 01/10/2026 (mockup no chat).
    // Pela paleta o gray-800 dava um grafite quase igual ao popover, e a marcada parecia VAZADA. No
    // escuro ela se INVERTE, como o `dia-sel` e o botão principal: clara com o check escuro.
    caixa: ['1f2937', 'e9e9e9'],
    // A PÍLULA ATIVA da variante grafite do `AbasPilula` (seletor de empresas, painel de contatos, as
    // séries dos gráficos do Comercial), a opção A de um mockup no chat (01/10/2026). Pela paleta o
    // gray-800 dava `3e3e3e` sobre o trilho `272727` — um degrau, e a aba ativa parecia apagada. No
    // escuro ela se INVERTE, como o botão principal: clara com o texto escuro.
    pilula: ['1f2937', 'e9e9e9'],
    'ponto-hoje': ['1f2937', 'e9e9e9'],
    'ponto-hoje-sel': ['ffffff', '131313'],
    // A BOLINHA DOS MARCADORES DA TIMELINE (`NoBolinha`, a opção A de um mockup no chat, 25/09/2026).
    // Era `bg-white` → a superfície: um miolo PRETO dentro de um anel claro. No escuro fica cinza-claro,
    // como a bolinha branca do claro; o anel que fura o trilho vai por `varCor` (`Timeline.jsx`).
    'no-marco': ['ffffff', 'cfcfcf'],
    // A FAIXA DE SETOR DO SINO (`NotificacoesPanel`, a opção C de quatro mockups, mesma rodada). O chip
    // ativo era branco com um anel `#e5e7eb` CRU — no escuro, um contorno claro estourado — e a faixa
    // ficava quase no tom do painel. No escuro o ativo se INVERTE (claro com letra escura, como o
    // `dia-sel` e o botão principal) e a faixa AFUNDA, um degrau abaixo do painel.
    'seg-sel': ['ffffff', 'e9e9e9'],
    'faixa-seg': ['f3f4f6', '161616'],
    // A NOTA INTERNA DA TIMELINE (`CardNota`, a opção S1 de um mockup no chat, 25/09/2026 — só o escuro;
    // o claro é o branco e os slate de sempre). Pela regra, os três slate do texto (700 título, 600
    // corpo, 500 data) batiam no piso de contraste e saíam no MESMO azulado, e o cartão `bg-white` era a
    // superfície do contato. Agora o cartão tem um toque de ardósia e o texto uma escada: título claro,
    // corpo no meio, data apagada.
    nota: ['ffffff', '1b1e24'],
    // A DIVISÓRIA DE MENU (`h-px`, ex-`bg-gray-100`): pela paleta ela dava `272727` sobre o popover
    // `bg-elevado` `262626` — sumia (o "Selecionar tudo" do filtro de Atividade perdeu a régua). Vale
    // para toda divisória dentro de menu ou popover.
    divisoria: ['f3f4f6', '3a3a3a'],
    // O HOVER DENTRO DE UM CAMPO (o botão do país do `CampoTelefone`, sobre `bg-[Field]`): o gray-50
    // do claro dava `232323` no escuro, MAIS ESCURO que o campo nativo. Aqui ele clareia um degrau.
    'campo-hover': ['f9fafb', '444444'],
    // AS RAIAS DOS WIDGETS DE ACOMPANHAMENTO (Custos e Engenharia no Dashboard, a opção B de um mockup
    // no chat, 26/09/2026). Raia, rótulo e cartão eram a MESMA superfície `1c1c1c` — o cartão só se lia
    // pela borda. Agora o trilho dos cartões AFUNDA (`raia`) e o cartão sobe (`bg-cartao`, o do Kanban);
    // o rótulo do status fica na superfície. No claro, o branco de sempre.
    raia: ['ffffff', '161616'],
    // A CAIXA DE TEXTO DOS FORMULÁRIOS (o `MarkdownEditor` clássico: registrar contato, registro do
    // cliente, nota interna — mockup no chat, 26/09/2026). A caixa passou a `bg-[Field]`, o cinza
    // nativo dos outros campos, e as peças da barra de formatação precisaram subir junto: pela paleta
    // o hover (gray-100) e o tracinho (gray-200) ficavam MAIS ESCUROS que o campo.
    'campo-botao-hover': ['f3f4f6', '4a4a4a'],
    'campo-sep': ['e5e7eb', '555555'],
    // O CHIP DE FILTRO ATIVO da faixa de filtros (`SegmentoFiltro`, a opção G1 de um mockup no chat,
    // 26/09/2026). Pela paleta o trilho (`hx-f6f7f8` → `272727`) e o chip ATIVO (gray-200 → `303030`)
    // ficavam a um degrau só, e o filtro ligado quase não se via. O trilho FICA como era (o usuário
    // gostava dele — a F1, que o afundava, foi desfeita) e o ativo sobe: `464646` com texto branco.
    'chip-ativo': ['e5e7eb', '464646'],
    'chip-ativo-hover': ['d1d5db', '505050'],
    // HOJE NO CALENDÁRIO DA FILA (prancha 25 de https://claude.ai/artifact/Vt8tsv8Tc3Xk8vybEpeZS2,
    // 08/10/2026): o número de hoje num círculo AZUL, o do Google Agenda — o usuário não quis o índigo
    // da marca. No escuro o azul clareia (o tom do Google no escuro) e o número fica escuro.
    hoje: ['1a73e8', '8ab4f8'],
    // O FERIADO NO CALENDÁRIO DA FILA (prancha 27, opção B, 09/10/2026): uma etiqueta verde-clara no
    // dia, o jeito do Google Agenda. Era o nome em vermelho, que lia como alerta (no calendário,
    // vermelho é o "venceu há N dias"). Fundo, texto e borda nos três grupos.
    feriado: ['e6f4ea', '1f3326'],
    'feriado-hover': ['d2ecd9', '284232'], // a etiqueta acende no hover e com o card aberto
  },
  texto: {
    'chip-ativo': ['1f2937', 'ffffff'],
    'chip-x': ['6b7280', 'd4d4d4'],
    // O número dentro do círculo de hoje (ver `hoje` no fundo) e o rótulo azul ao lado dele ("Qui"),
    // que também pinta o "Hoje" da Agenda.
    hoje: ['ffffff', '131313'],
    'hoje-rotulo': ['1a73e8', '8ab4f8'],
    feriado: ['137333', '81c995'],
    'campo-placeholder': ['9ca3af', '9e9e9e'],
    'nota-titulo': ['334155', 'e2e8f0'],
    'nota-corpo': ['475569', 'bcc5d3'],
    'nota-meta': ['64748b', '7d889b'],
    'seg-sel': ['111827', '131313'],
    'seg-sel-n': ['9ca3af', '5a5a5a'],
    'dia-sel': ['ffffff', '131313'],
    // A caixinha marcada (ver `caixa` no fundo): `caixa` é a do `accent-caixa` do input nativo — o
    // `accentColor` sai da família do texto —, e `caixa-check` é o check/traço desenhado por cima.
    caixa: ['1f2937', 'e9e9e9'],
    'caixa-check': ['ffffff', '131313'],
    // O texto da pílula ativa (ver `pilula` no fundo) e a contagem dentro dela (`qtdSolta`).
    pilula: ['ffffff', '131313'],
    'pilula-qtd': ['d1d5db', '5a5a5a'],
    etapa: ['9ca3af', 'b4b4b4'],
    conferido: ['ffffff', 'e0faf6'],
    finalizado: ['ffffff', 'e3fbe9'],
  },
  borda: {
    elevado: ['e5e7eb', '4a4a4a'],
    cartao: ['d1d5db', '383838'],
    trilha: ['eef0f2', '2c2c2c'],
    etapa: ['d1d5db', '5f5f5f'],
    'area-conta': ['e5e7eb', '333333'],
    'area-conta-arrasto': ['93c5fd', '44679f'],
    etiqueta: ['d1d5db', '474747'],
    // O anel de 1px do chip ativo da faixa de setor: no escuro some dentro da pílula clara.
    'seg-sel': ['e5e7eb', 'e9e9e9'],
    caixa: ['1f2937', 'e9e9e9'],
    nota: ['cbd5e1', '3a414e'],
    feriado: ['ceead6', '2c4a35'],
    'feriado-hover': ['a3d3b0', '3f6b4c'],
    // O cartão das raias de acompanhamento (a borda do claro é o gray-200, e não o `d1d5db` do
    // `cartao` do Kanban) e o ANEL "cor do cartão" dos selos e do recuo do avatar dentro dele: o
    // `ring-white` dá a superfície `1c1c1c` no escuro, um contorno mais escuro que o cartão `222222`.
    'cartao-raia': ['e5e7eb', '353535'],
    'anel-cartao': ['ffffff', '222222'],
    // A linha acima da barra de formatação do `MarkdownEditor` clássico, sobre o campo `bg-[Field]`.
    'campo-divisoria': ['f3f4f6', '4a4a4a'],
  },
};

// ------------------------------------------------------------------ a regra
const NEUTRO = 0.025; // croma abaixo disso é cinza

const interp = (x, pontos) => {
  // pontos: [[claroL, escuroL], ...] em ordem decrescente de claroL
  if (x >= pontos[0][0]) return pontos[0][1];
  for (let i = 1; i < pontos.length; i++) {
    const [x0, y0] = pontos[i - 1]; const [x1, y1] = pontos[i];
    if (x >= x1) return y0 + ((x - x0) * (y1 - y0)) / (x1 - x0);
  }
  return pontos.at(-1)[1];
};
// As curvas de luminosidade dos neutros, tiradas das escalas cravadas acima.
const curva = (familia) => {
  const pts = Object.entries(colors.gray).filter(([k]) => CINZA[familia][k])
    .map(([k, h]) => [oklch(h.slice(1)).L, oklch(CINZA[familia][k]).L]);
  if (familia !== 'texto') pts.unshift([1, oklch(SUPERFICIE).L]);
  return pts.sort((a, b) => b[0] - a[0]);
};
const CURVAS = { fundo: curva('fundo'), texto: curva('texto'), borda: curva('borda') };

// CINZA × TOM DE COR CLARO — os dois têm pouco croma, e o croma sozinho não os separa: o gray-400
// (`#9ca3af`, 0,019) tem MAIS cor que o rosado `#fdf6f6` (0,0075). O que separa é o MATIZ: os cinzas
// do app são FRIOS (o gray do Tailwind, matiz 250–270°), e os tons de propósito ou têm outro matiz
// (rosado, verde, creme, âmbar) ou são azuis muito claros e mais saturados (o `eff6ff` do mês em
// preenchimento do DRE, o `f7faff` do destino do arrasto). Cinza vira neutro PURO no escuro (o fundo
// do TickTick não tem tom azulado); tom guarda a cor. `CINZAS_QUENTES` são os bege que o código usa
// COMO cinza (a caixa "Na fila" do Ritmo, que ele chama de CINZA).
const CINZAS_QUENTES = new Set(['f1efe8', 'b4b2a9', '5f5e5a', '2c2c2a']);
function ehCinza(hex, c) {
  if (c.C < 0.005 || CINZAS_QUENTES.has(hex)) return true;
  const matiz = ((c.h * 180) / Math.PI + 360) % 360;
  if (matiz < 200 || matiz > 300) return false;
  return c.L < 0.9 || c.C < (c.L > 0.97 ? 0.006 : 0.0125);
}

function escurecer(hex, familia) {
  const fixa = FIXAS[familia][hex];
  if (fixa) return fixa;
  const c = oklch(hex);
  if (c.C < NEUTRO) return paraHex({ ...c, L: interp(c.L, CURVAS[familia]), C: ehCinza(hex, c) ? 0 : c.C });

  const sup = oklch(SUPERFICIE);
  if (familia === 'fundo') {
    if (c.L >= 0.82) {
      // tom claro de cor (fundo de pílula, de aviso): a cor translúcida sobre o grafite
      const peso = Math.min(0.2, 0.1 + (1 - c.L) * 0.6);
      return paraHex({ L: sup.L + 0.04 + (1 - c.L) * 0.35, C: Math.max(0.03, Math.min(0.07, c.C * 1.1 + peso * 0.1)), h: c.h });
    }
    return paraHex({ ...c, L: Math.max(c.L, 0.45) }); // preenchimento cheio: fica
  }
  if (familia === 'texto') {
    if (c.L >= 0.72) return hex; // já é claro (texto sobre preenchimento escuro)
    let L = Math.max(0.74, c.L);
    let out = paraHex({ L, C: Math.min(c.C, 0.16), h: c.h });
    while (contraste(out, SUPERFICIE) < 4.8 && L < 0.95) { L += 0.02; out = paraHex({ L, C: Math.min(c.C, 0.16), h: c.h }); }
    return out;
  }
  // borda
  if (c.L >= 0.78) return paraHex({ L: 0.3 + (1 - c.L) * 0.9, C: Math.min(0.1, c.C * 1.4), h: c.h });
  return paraHex({ ...c, L: Math.max(c.L, 0.62) });
}

// ------------------------------------------------------------------ o que o config usa
const FAMILIA_DO_UTIL = {
  fundo: ['backgroundColor', 'gradientColorStops'],
  texto: ['textColor', 'fill', 'stroke', 'textDecorationColor', 'placeholderColor', 'caretColor', 'accentColor'],
  borda: ['borderColor', 'ringColor', 'divideColor', 'outlineColor', 'ringOffsetColor', 'boxShadowColor'],
};
const PREFIXO = { fundo: 'tf', texto: 'tt', borda: 'tb' };
const rgbTexto = (hex) => hexParaRgb(hex).join(' ');
const valor = (familia, nome, hexClaro) => `rgb(var(--${PREFIXO[familia]}-${nome}, ${rgbTexto(hexClaro)}) / <alpha-value>)`;

// `cores`: o que `scripts/tema.mjs` achou no código ({ paletas: [...], hex: { fundo, texto, borda } }).
// `extras`: as paletas próprias do config (brand, ink), temadas junto.
export function temaEscuro(cores, extras = {}) {
  const paletas = { ...Object.fromEntries(cores.paletas.filter((p) => colors[p] && typeof colors[p] === 'object').map((p) => [p, colors[p]])), ...extras };
  const theme = {};
  const vars = {};
  for (const [familia, utils] of Object.entries(FAMILIA_DO_UTIL)) {
    const escala = {};
    for (const [nome, tons] of Object.entries(paletas)) {
      escala[nome] = {};
      for (const [tom, h] of Object.entries(tons)) {
        const claro = h.slice(1).toLowerCase();
        escala[nome][tom] = valor(familia, `${nome}-${tom}`, claro);
        const esc = nome === 'gray' ? CINZA[familia][tom] : escurecer(claro, familia);
        vars[`--${PREFIXO[familia]}-${nome}-${tom}`] = rgbTexto(esc);
      }
    }
    // O branco: superfície no fundo e na borda (o anel de avatar "cor do fundo"); no texto fica branco.
    if (familia !== 'texto') {
      escala.white = valor(familia, 'white', 'ffffff');
      vars[`--${PREFIXO[familia]}-white`] = rgbTexto(SUPERFICIE);
    }
    // Tokens de SIGNIFICADO, sem cor de origem: `bg-elevado` é a superfície de menus, cartões,
    // popovers e modais. No claro é o branco de sempre; no escuro fica um tom ACIMA da superfície
    // (o menu do mockup), senão um menu aberto sobre a grade tem a mesma cor dela e só a borda o
    // separa.
    for (const [nome, [claro, esc]] of Object.entries(SEMANTICOS[familia] ?? {})) {
      escala[nome] = valor(familia, nome, claro);
      vars[`--${PREFIXO[familia]}-${nome}`] = rgbTexto(esc);
    }
    // O preto do FUNDO é o escurecedor de hover (`hover:bg-black/5`): no escuro ele clareia. O véu
    // dos modais não é preto: é `bg-veu`, que continua escuro nos dois temas.
    if (familia === 'fundo') {
      escala.black = valor('fundo', 'black', '000000');
      vars['--tf-black'] = '255 255 255';
      escala.veu = 'rgb(0 0 0 / <alpha-value>)';
    }
    const hx = {};
    for (const h of cores.hex[familia] ?? []) {
      hx[h] = valor(familia, `hx-${h}`, h);
      vars[`--${PREFIXO[familia]}-hx-${h}`] = rgbTexto(escurecer(h, familia));
    }
    escala.hx = hx;
    for (const u of utils) theme[u] = escala;
  }
  // A BORDA SEM COR (`border`, `divide-y`) vem do preflight, que lê `borderColor.DEFAULT` — o
  // `#e5e7eb` cru do Tailwind, claro no escuro. Aponta para a variável do gray-200 (o `theme()` do
  // preflight troca o `<alpha-value>` por 1), e no claro o valor é o mesmo. Só no `borderColor`: a
  // escala é compartilhada com o `ringColor`, e um `DEFAULT` lá trocaria a cor do `ring` sem cor.
  theme.borderColor = { ...theme.borderColor, DEFAULT: valor('borda', 'gray-200', 'e5e7eb') };
  const plugin = ({ addBase }) => {
    // Só na TELA: impresso, o app é sempre claro (o relatório comercial, o CSV não importam aqui).
    addBase({ '@media screen': { [SELETOR_ESCURO]: { ...vars, colorScheme: 'dark' } } });
  };
  return { theme, plugin };
}
