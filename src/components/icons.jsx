// Ícones SVG inline (sem dependência externa). Herdam a cor via currentColor.
// Uso: <IconHome className="h-5 w-5" />
const base = (paths) => function Icon({ className = 'h-5 w-5', ...props }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"
      strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true" {...props}>
      {paths}
    </svg>
  );
};

// --- Grupos pai (Tabler outline, minimalista/curvado) ---
export const IconOrcamentos = base(<><path d="M15 3v4a1 1 0 0 0 1 1h4" /><path d="M18 17h-7a2 2 0 0 1 -2 -2v-10a2 2 0 0 1 2 -2h4l5 5v7a2 2 0 0 1 -2 2" /><path d="M16 17v2a2 2 0 0 1 -2 2h-7a2 2 0 0 1 -2 -2v-10a2 2 0 0 1 2 -2h2" /></>);
export const IconComercial = base(<><path d="M4 19l16 0" /><path d="M4 15l4 -6l4 2l4 -5l4 4" /></>);
export const IconAdmin = base(<><path d="M19.875 6.27a2.225 2.225 0 0 1 1.125 1.948v7.284c0 .809 -.443 1.555 -1.158 1.948l-6.75 4.27a2.269 2.269 0 0 1 -2.184 0l-6.75 -4.27a2.225 2.225 0 0 1 -1.158 -1.948v-7.285c0 -.809 .443 -1.554 1.158 -1.947l6.75 -3.98a2.33 2.33 0 0 1 2.25 0l6.75 3.98h-.033" /><path d="M9 12a3 3 0 1 0 6 0a3 3 0 1 0 -6 0" /></>);
export const IconCustos = base(<><path d="M17 8v-3a1 1 0 0 0 -1 -1h-10a2 2 0 0 0 0 4h12a1 1 0 0 1 1 1v3m0 4v3a1 1 0 0 1 -1 1h-12a2 2 0 0 1 -2 -2v-12" /><path d="M20 12v4h-4a2 2 0 0 1 0 -4h4" /></>);
// Engenharia de Aplicação: régua + lápis (projeto/desenho técnico).
export const IconEngenharia = base(<><path d="M3 21v-4l13 -13l4 4l-13 13h-4" /><path d="M14.5 6.5l3 3" /><path d="M6 18l-1.5 -1.5" /><path d="M9 15l-1.5 -1.5" /><path d="M12 12l-1.5 -1.5" /></>);

// --- Folhas ---
export const IconHome = base(<><path d="M3 11l9-7 9 7" /><path d="M5 10v10h14V10" /><path d="M10 20v-6h4v6" /></>);
export const IconDashboard = base(<><path d="M4 6a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2l0 -12" /><path d="M4 9h8" /><path d="M12 15h8" /><path d="M12 4v16" /></>);
export const IconLista = base(<><path d="M8 6h12M8 12h12M8 18h12" /><circle cx="4" cy="6" r="1" /><circle cx="4" cy="12" r="1" /><circle cx="4" cy="18" r="1" /></>);
export const IconEnvio = base(<><path d="M22 2 11 13" /><path d="M22 2l-7 20-4-9-9-4 20-7Z" /></>);
// O "voltou da pausa" — o mesmo desenho do aviso da Ficha (OrcamentoDetalhe, LegendaAvisos).
export const IconHistorico = base(<><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" /><path d="M12 7v5l3 3" /></>);
export const IconFicha = base(<><path d="M14 3v5h5" /><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-5Z" /><path d="M9 13h4" /><path d="M9 17h6" /></>);
export const IconGrafico = base(<><path d="M3 3v18h18" /><rect x="7" y="11" width="3" height="6" /><rect x="12" y="7" width="3" height="10" /><rect x="17" y="13" width="3" height="4" /></>);
export const IconUpload = base(<><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" /><path d="M12 15V3" /><path d="M8 7l4-4 4 4" /></>);
export const IconEtiqueta = base(<><path d="M3 12V5a2 2 0 0 1 2-2h7l9 9-9 9-9-9Z" /><circle cx="7.5" cy="7.5" r="1.3" /></>);
export const IconUsuarios = base(<><circle cx="9" cy="8" r="3" /><path d="M3 20c0-3 3-5 6-5s6 2 6 5" /><path d="M16 6a3 3 0 0 1 0 6" /><path d="M21 20c0-2.2-1.5-3.8-3.5-4.5" /></>);
export const IconAuditoria = base(<><path d="M3 3v5h5" /><path d="M3.5 8A9 9 0 1 1 4 14" /><path d="M12 8v4l3 2" /></>);
export const IconConfig = base(<><circle cx="12" cy="12" r="3" /><path d="M19 12a7 7 0 0 0-.1-1l2-1.5-2-3.5-2.4 1a7 7 0 0 0-1.7-1l-.4-2.5h-4l-.4 2.5a7 7 0 0 0-1.7 1l-2.4-1-2 3.5L4.1 11a7 7 0 0 0 0 2l-2 1.5 2 3.5 2.4-1a7 7 0 0 0 1.7 1l.4 2.5h4l.4-2.5a7 7 0 0 0 1.7-1l2.4 1 2-3.5-2-1.5a7 7 0 0 0 .1-1Z" /></>);

// Engrenagem do gatilho de "personalizar colunas" — desenho fornecido (setting_com_buraco.svg).
//
// Duas mudanças sobre o arquivo original, e as duas são obrigatórias:
//   `fill="currentColor"` no lugar do `#000000` do editor — com o preto cravado o ícone ignoraria a
//     cor do botão e não acompanharia o hover do trilho;
//   `fillRule="evenodd"` PRESERVADO — é ele que vaza o furo central; sem ele a engrenagem vira um
//     disco cheio, porque o contorno de dentro é parte do mesmo `path`.
//
// É o único ícone PREENCHIDO da barra (os outros são de traço). Divergência deliberada: em 15px o
// preenchimento é justamente o que faz esta engrenagem sobreviver, enquanto a de traço (`IconConfig`)
// fechava os vãos entre os dentes e virava um borrão.
export function IconEngrenagem({ className = 'h-4 w-4' }) {
  return (
    <svg viewBox="0 0 512 512" className={className} fill="currentColor" fillRule="evenodd" aria-hidden="true">
      <path d="M 164 33 L 141 44 L 139 46 L 129 51 L 109 65 L 99 76 L 96 85 L 96 96 L 102 114 L 102 122 L 103 123 L 102 135 L 97 151 L 87 166 L 77 175 L 63 183 L 53 186 L 49 186 L 48 187 L 42 187 L 30 193 L 23 201 L 20 209 L 20 213 L 18 219 L 18 225 L 17 226 L 17 234 L 16 235 L 16 277 L 17 278 L 17 286 L 18 287 L 18 293 L 20 300 L 24 307 L 32 314 L 42 318 L 48 318 L 49 319 L 57 320 L 72 327 L 81 334 L 89 343 L 97 357 L 100 367 L 100 371 L 101 372 L 101 388 L 100 389 L 99 397 L 93 412 L 93 424 L 94 425 L 94 428 L 99 437 L 104 442 L 120 454 L 141 467 L 169 480 L 175 482 L 179 482 L 180 483 L 188 483 L 195 481 L 202 477 L 207 472 L 210 467 L 220 457 L 227 452 L 240 446 L 243 446 L 248 444 L 257 444 L 259 443 L 260 444 L 269 444 L 270 445 L 277 446 L 292 453 L 300 459 L 313 474 L 319 478 L 325 480 L 329 480 L 330 481 L 335 481 L 351 476 L 371 466 L 386 457 L 405 443 L 415 432 L 418 424 L 418 411 L 412 394 L 411 377 L 412 376 L 413 366 L 416 360 L 416 358 L 425 343 L 434 334 L 446 326 L 448 326 L 456 322 L 473 319 L 479 316 L 487 308 L 492 295 L 493 283 L 494 282 L 494 274 L 495 273 L 495 234 L 494 233 L 493 219 L 492 218 L 492 213 L 490 206 L 485 198 L 479 193 L 470 189 L 465 189 L 464 188 L 457 187 L 444 181 L 438 177 L 426 165 L 417 149 L 414 139 L 414 133 L 413 132 L 414 115 L 419 100 L 419 87 L 417 81 L 414 76 L 402 65 L 382 51 L 372 46 L 370 44 L 356 37 L 354 37 L 349 34 L 347 34 L 336 29 L 331 29 L 330 28 L 320 29 L 311 33 L 293 51 L 287 55 L 274 61 L 271 61 L 266 63 L 257 63 L 255 64 L 254 63 L 245 63 L 244 62 L 237 61 L 222 54 L 200 33 L 194 30 L 181 28 L 180 29 L 175 29 L 169 32 Z M 244 176 L 255 176 L 256 175 L 257 176 L 267 176 L 268 177 L 280 179 L 297 187 L 303 191 L 315 202 L 324 214 L 332 231 L 334 243 L 335 244 L 335 267 L 334 268 L 334 272 L 330 285 L 322 300 L 309 315 L 297 324 L 280 332 L 268 334 L 267 335 L 244 335 L 243 334 L 235 333 L 226 330 L 208 320 L 196 309 L 187 297 L 181 285 L 176 267 L 176 244 L 177 243 L 179 231 L 187 214 L 191 208 L 202 196 L 214 187 L 231 179 L 243 177 Z" />
    </svg>
  );
}

// Seta circular de ATUALIZAR. O desenho já existia solto no botão "Restaurar padrão" da barra de
// edição do Dashboard; virou peça nomeada quando o botão de atualizar passou a usá-lo também —
// dois lugares desenhando a mesma seta à mão é como elas divergem.
// Traço 2 e não 1,5: ele é usado em 15-17px, e nesse tamanho linha fina desaparece.
export function IconAtualizar({ className = 'h-[15px] w-[15px]' }) {
  return (
    <svg viewBox="0 0 24 24" className={`shrink-0 ${className}`} fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" />
    </svg>
  );
}

// Controles deslizantes — o gatilho de "personalizar colunas" no trilho de filtros.
// Substituiu uma ENGRENAGEM, e o motivo é o mesmo que já derrubou o glifo `▾` e o `ⓘ`: engrenagem
// é um desenho de muitos elementos pequenos, e em 14px os vãos entre os dentes fecham — vira um
// borrão redondo. Aqui são quatro elementos grandes (duas linhas e dois botões), com traço 1,9 e
// os botões preenchidos de BRANCO para o vão aparecer mesmo quando a linha passa por trás.
// Tamanho em PX e não `h-3.5`: a raiz do app é 87,5%, então classe em rem daria 12,25 — fracionário,
// e num `devicePixelRatio` de 1,5 isso assenta fora da grade de pixels.
export function IconAjustes({ className = 'h-[14px] w-[14px]' }) {
  return (
    <svg viewBox="0 0 24 24" className={`shrink-0 ${className}`} fill="none" stroke="currentColor"
      strokeWidth="1.9" strokeLinecap="round" aria-hidden="true">
      <path d="M3 8h18M3 16h18" />
      <circle cx="9" cy="8" r="2.6" fill="#fff" />
      <circle cx="16" cy="16" r="2.6" fill="#fff" />
    </svg>
  );
}

// Chevron SIMPLES — o gatilho de "isto abre". Aponta para baixo em repouso e gira (`rotate-180` ou
// `-rotate-90`, conforme a tela) quando aberto.
//
// Estava definido em QUATRO arquivos com o mesmo desenho — `ficha/CardColapsavel.jsx`,
// `ficha/InfoErpCard.jsx`, `ficha/AcoesOverflowMenu.jsx` e `pages/EngPainel.jsx` (este último
// escrito como `path d="M6 9l6 6 6-6"`, que é a mesma geometria com outra notação). O painel de
// notificações seria a quinta. Traço 2, e não o 1,5 do `base` acima: em 14px o fino desaparece — é
// a mesma razão dos ícones dos cards.
export function IconChevronDown({ className = 'h-3.5 w-3.5' }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

// Chevron DUPLO — "expandir todos" / "recolher todos" das listas com linha expansível.
// As duas setas se AFASTAM para abrir e se APROXIMAM para fechar, então o par se lê sem legenda: o
// botão perdeu o texto ao entrar no trilho da paginação, e é o desenho que precisa dizer o estado.
// São dois traços só, pelo mesmo motivo do `IconSeta` e do `IconAjustes`: em 14px, ícone de muitos
// elementos fecha os vãos. `fechar` inverte o desenho, sem rotação — girar 180° levaria a seta de
// cima para baixo e vice-versa, o que é o mesmo desenho, não o oposto dele.
export function IconExpandirTudo({ className = 'h-[14px] w-[14px]', fechar = false }) {
  return (
    <svg viewBox="0 0 24 24" className={`shrink-0 ${className}`} fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {fechar ? (
        <><polyline points="6 5 12 10 18 5" /><polyline points="6 19 12 14 18 19" /></>
      ) : (
        <><polyline points="6 9 12 4 18 9" /><polyline points="6 15 12 20 18 15" /></>
      )}
    </svg>
  );
}

// Tabela vista de cima (moldura + duas divisórias): é o gatilho de "personalizar colunas".
// NÃO é o `IconConfig`: aquela engrenagem tem um contorno de 12 dentes desenhado para 20px, e nos
// 15px do trilho de filtros os vãos entre os dentes fecham — vira um borrão redondo. Aqui os vãos
// são de 5,5 unidades no viewBox de 24, ou seja ~3,4px quando o ícone mede 15, e o desenho continua
// legível. Traço 1,9 em vez do 1,5 do `base`, pelo mesmo motivo: em ícone pequeno, linha fina some.
export function IconTabela({ className = 'h-4 w-4' }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.9"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
      <path d="M10 4.5v15" /><path d="M15.5 4.5v15" />
    </svg>
  );
}

// --- Controles da barra ---
export const IconChevron = base(<path d="M9 6l6 6-6 6" />);          // gira via rotate quando aberto
export const IconRecolher = base(<><path d="M15 6l-6 6 6 6" /><path d="M20 6v12" /></>);  // « + barra
export const IconExpandir = base(<><path d="M9 6l6 6-6 6" /><path d="M4 6v12" /></>);     // » + barra
export const IconChevronsRight = base(<><path d="M7 7l5 5-5 5" /><path d="M14 7l5 5-5 5" /></>);   // >> deslocado p/ centro visual
export const IconChevronsLeft  = base(<><path d="M17 7l-5 5 5 5" /><path d="M10 7l-5 5 5 5" /></>); // <<
export const IconSair = base(<><path d="M15 12H4" /><path d="M9 7l-5 5 5 5" /><path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4" /></>);
export const IconSino = base(<><path d="M10 5a2 2 0 1 1 4 0a7 7 0 0 1 4 6v3a4 4 0 0 0 2 3h-16a4 4 0 0 0 2 -3v-3a7 7 0 0 1 4 -6" /><path d="M9 17v1a3 3 0 0 0 6 0v-1" /></>);
// Ampliar/maximizar (setas para fora do quadro). Não confundir com o IconExpandir acima, que é
// o chevron » de abrir painel.
export const IconMaximize = base(<><polyline points="15 3 21 3 21 9" /><polyline points="9 21 3 21 3 15" /><path d="M21 3l-7 7" /><path d="M3 21l7-7" /></>);
// Par do IconMaximize: setas para DENTRO (recolher a tela expandida). Os cantos apontam para o
// centro — invertidos, o desenho sai torto.
export const IconMinimize = base(<><polyline points="4 14 10 14 10 20" /><polyline points="20 10 14 10 14 4" /><path d="M14 10l7-7" /><path d="M3 21l7-7" /></>);
// Abrir em outra tela (seta saindo do quadro) — botão que abre a tela ampliada de um widget.
// Não confundir com o IconMaximize, que expande DENTRO dela.
export const IconAbrir = base(<><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><polyline points="15 3 21 3 21 9" /><path d="M10 14L21 3" /></>);

// Etapas de liberação do widget de Custos. `strokeWidth 2` (e não o 1.5 do `base`) porque eles são
// desenhados em 16px, onde o traço fino some — vêm com o svg escrito à mão por isso.
export function IconCirculoTracejado({ className = 'h-4 w-4' }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="9" strokeDasharray="2.5 2.5" />
    </svg>
  );
}
export function IconCirculoCheck({ className = 'h-4 w-4' }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="9" /><path d="M8.5 12.5l2.5 2.5 4.5-5.5" />
    </svg>
  );
}

// Seta de ORDENAÇÃO de coluna: haste fina + ponta, girada 180° quando é descendente.
// Substituiu os glifos de texto ▲/▼/↕ do cabeçalho: em 9px o triângulo cheio, ainda por cima
// azul, virava um borrão colorido no meio de um cabeçalho que é todo cinza. Mora aqui porque
// `SortableTh` (12 telas) e o cabeçalho próprio do Contatos usam a MESMA seta — duas cópias
// divergiriam na primeira vez que alguém acertasse o traço de um lado só.
// strokeWidth 2 (o `base` acima usa 1.5): em 14px o traço fino sumia.
export function IconSetaOrdenacao({ className = 'h-3.5 w-3.5', descendente = false }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true"
      style={descendente ? { transform: 'rotate(180deg)' } : undefined}>
      <path d="M12 19V5M6 11l6-6 6 6" />
    </svg>
  );
}

// Seta dos gatilhos de DROPDOWN (filtros, selects, menus de ação). Substituiu o glifo `▾`, que é
// um triângulo cheio de ~3px na fonte: em 12,5px de texto ele quase desaparecia ao lado do rótulo,
// e aumentar a fonte só engordava a mancha. Aqui a forma é desenhada — base longa e altura baixa
// (9×5,2), a proporção escolhida em mockup —, então lê como seta mesmo pequena.
// Sem `stroke`: é preenchida, para manter a silhueta do glifo que estava no lugar dela.
// Tamanho FIXO: quem chama passa só cor/opacidade (`text-gray-400`, `opacity-60`), que é o que
// varia de um gatilho para outro. Uma seta só no app inteiro é o ponto — eram 31 cópias do glifo.
export function IconSeta({ className = '' }) {
  return (
    <svg viewBox="0 0 24 14" className={`h-[5.2px] w-[9px] shrink-0 ${className}`}
      fill="currentColor" aria-hidden="true">
      <path d="M1.5 2h21L12 12.5z" />
    </svg>
  );
}

// Alça de ARRASTAR (grip) — 6 quadradinhos em duas colunas. Mora aqui porque o app tem três listas
// reordenáveis por arraste (as colunas da tabela, os cards da ficha, os critérios de ordenação do
// Kanban) e a alça delas tem de ser a MESMA marca: é ela que ensina "isto se arrasta", e uma
// textura diferente em cada tela desfaz o aprendizado. Eram quatro cópias locais, em dois desenhos.
// Preenchida e sem `stroke`, pela mesma razão do `IconSeta`: em 9×14 um contorno não sobrevive.
export function IconGrip({ className = '' }) {
  return (
    <svg width="9" height="14" viewBox="0 0 12 18" fill="currentColor" aria-hidden="true"
      className={`shrink-0 ${className}`}>
      <rect x="2" y="1" width="3" height="3" /><rect x="7" y="1" width="3" height="3" />
      <rect x="2" y="7" width="3" height="3" /><rect x="7" y="7" width="3" height="3" />
      <rect x="2" y="13" width="3" height="3" /><rect x="7" y="13" width="3" height="3" />
    </svg>
  );
}

// Disco de INFORMAÇÃO dos avisos de campo. Substitui o glifo `ⓘ`, que tem o mesmo defeito do `▾`
// que o `IconSeta` resolveu: sendo caractere da fonte, ele não acompanha o tamanho do texto ao
// redor, traz peso e alinhamento próprios e sai deformado.
// PREENCHIDO, e não vazado: em 14px um contorno com o "i" dentro deixa menos de 1px de tinta em
// cada traço, e o antialiasing come os dois — a mancha cheia se sustenta em qualquer tamanho (foi a
// comparação feita em mockup, lado a lado, antes de escolher).
// 14px é o tamanho ao lado de um texto de 10,5px; quem chamar em outro contexto sobrescreve pelo
// `className`, junto da cor.
// Em PX e não `h-3.5`: a raiz do app é 87,5%, então as classes em rem encolhem — `h-3.5` (0,875rem)
// renderiza 12,25px, e era exatamente o "pequeno demais" que se queria resolver aqui.
export function IconInfo({ className = 'h-[14px] w-[14px]' }) {
  return (
    <svg viewBox="0 0 24 24" className={`shrink-0 ${className}`} fill="currentColor" aria-hidden="true">
      <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 4.4a1.3 1.3 0 1 1 0 2.6 1.3 1.3 0 0 1 0-2.6zM13.3 17h-2.6v-6.6h2.6V17z" />
    </svg>
  );
}

// Os dois IRMÃOS do `IconInfo`, e existem pelo mesmo motivo dele — só que o defeito que substituem é
// pior. Os avisos de campo do formulário de envio vinham marcados com os EMOJI `⚠️` e `⏸️`, e emoji
// não é glifo de texto: vem colorido de fábrica e ignora o `currentColor` do cartão, então um aviso
// âmbar carregava um triângulo amarelo-emoji e um violeta carregava um botão de pausa azul, cada
// sistema operacional desenhando o seu. Como SVG eles herdam a cor do próprio aviso.
//
// Mesma geometria do `IconInfo` (viewBox 24, preenchido, 14px, `shrink-0`), de propósito: os três
// aparecem EMPILHADOS na mesma coluna de 14px do formulário, e um contorno no meio de dois discos
// cheios denunciaria que vieram de lugares diferentes.
export function IconAlerta({ className = 'h-[14px] w-[14px]' }) {
  return (
    <svg viewBox="0 0 24 24" className={`shrink-0 ${className}`} fill="currentColor" aria-hidden="true">
      <path d="M12 2.6c.5 0 .95.27 1.19.7l9 15.8c.24.42.24.93 0 1.35a1.36 1.36 0 0 1-1.19.68H3c-.49 0-.94-.26-1.19-.68a1.36 1.36 0 0 1 0-1.35l9-15.8c.24-.43.7-.7 1.19-.7zm-1.3 6.1v5.5h2.6V8.7h-2.6zm0 7.2v2.5h2.6v-2.5h-2.6z" />
    </svg>
  );
}

export function IconPausa({ className = 'h-[14px] w-[14px]' }) {
  return (
    <svg viewBox="0 0 24 24" className={`shrink-0 ${className}`} fill="currentColor" aria-hidden="true">
      <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM10.6 8h-1.7v8h1.7V8zm4.5 0h-1.7v8h1.7V8z" />
    </svg>
  );
}

// Bandeira de PRIORIDADE da Engenharia — ondulada e cheia, preenchida com a cor da prioridade
// (`prioridadeEngFlag`, em lib/engenharia.js).
//
// Mora aqui pela mesma razão do `IconGrip` e do `IconSeta`: a bandeira aparece no card do Painel,
// no card do widget do dashboard, no dropdown da ficha e no do modal de edição — e estava
// DESENHADA TRÊS VEZES, de três jeitos. O modal usava uma flâmula angular (`M4 21V4h11l-2 4 2 4H4`,
// com stroke), o widget uma terceira variante, e só o card e a ficha compartilhavam o traçado.
// Como o mesmo dado aparece nos quatro lugares, ter três desenhos fazia a prioridade parecer coisas
// diferentes conforme a tela.
//
// Preenchida e sem `stroke`: em 14px um contorno some, e a bandeira precisa ler como uma mancha de
// cor — é a COR que carrega a prioridade, não a forma.
export function IconBandeira({ cor = 'currentColor', className = 'h-[14px] w-[14px]' }) {
  return (
    <svg viewBox="0 0 24 24" className={`shrink-0 ${className}`} fill={cor} stroke="none" aria-hidden="true">
      <path d="M5 3a1 1 0 0 0-1 1v17a1 1 0 0 0 2 0v-6.2c2.5-1.2 5-.2 7.5.8 2.6 1 5.3 2 8.1.6a1 1 0 0 0 .5-.9V5.2a1 1 0 0 0-1.5-.9c-2.3 1.1-4.6.3-7.1-.7C11 2.6 8 1.5 5 3z" />
    </svg>
  );
}

// O CLIENTE. Dois volumes de alturas diferentes — lê como CONJUNTO de prédios, e não um só, que é
// o que um cliente é nesta base: 134 razões sociais se repetem em vários códigos (a BRF tem 28
// unidades), e a ficha do cliente inteira é construída em cima disso.
//
// Mora aqui pela mesma razão do `IconBandeira` logo acima: era uma MALETA (o `briefcase` do
// Feather) desenhada TRÊS vezes, byte a byte igual, com três nomes diferentes — `IconCliente`
// (ficha/ClienteCard), `IconPredio` (pages/Clientes, que já se chamava prédio e desenhava maleta) e
// `IconBriefcase` (eng/EntradaForm). Cinco pontos de render, uma fonte só agora.
//
// Escrito à mão e não por `base`/`baseCard`: a `base` usa traço 1,5 e os três chamadores já usavam
// 2 — nos 16px dos dropdowns de busca da tela de Clientes o traço fino apaga as janelas; e o default
// da `baseCard` é 14px, que não é nenhum dos tamanhos daqui.
export function IconEmpresa({ className = 'h-[18px] w-[18px]', ...props }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true" {...props}>
      <path d="M4 21V3.5h9V21" />
      <path d="M13 21V9h7v12" />
      <path d="M2.5 21h19" />
      <path d="M7 7h3M7 11h3M7 15h3M16 13h1.5M16 17h1.5" />
    </svg>
  );
}

// DOCUMENTO DE CANTO DOBRADO — o que significa "orçamento" na Ficha do Orçamento: o selo do card
// "Encontre qualquer orçamento", cada linha dos resultados da busca e cada card de "Consultados
// recentemente" já abriam com ele, em `bg-brand-50`/`text-brand-600`. O `ClienteCard` da mesma tela
// passou a abrir assim também, e é por isso que o desenho subiu para cá: enquanto ele fosse uma
// função local de `pages/Ficha.jsx`, o cabeçalho e o card podiam divergir — e divergiram, na
// primeira tentativa, que usou o `IconFicha` (parecido, com duas linhas de texto dentro e traço 1,5).
//
// Escrito à mão e não por `base`, pela mesma razão do `IconEmpresa` logo acima: a `base` usa traço
// 1,5 e todos os chamadores usam 2 — nos 16/17px em que ele aparece o traço fino apaga a dobra.
//
// Ele ainda tem CÓPIAS LOCAIS em `Controle.jsx`, `GrupoModal.jsx`, `FilaPainel.jsx` e `Grupos.jsx`,
// já em dois desenhos diferentes. Consolidá-las é limpeza à parte; quem for fazer, o destino é aqui.
export function IconDocumento({ className = 'h-[17px] w-[17px]', ...props }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true" {...props}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  );
}

// CRACHÁ — o botão "Cargos" da tela de Contatos, que abre a lista de cargos sugeridos no cadastro.
// É onde o cargo de alguém aparece no mundo real, e por isso ganhou de uma etiqueta (que diria
// "rótulo", certo mas genérico) e de duas pessoas (que diria "gente", quando o que a lista
// administra são os TÍTULOS — e esse desenho já é o "Atribuir responsáveis" do card de Custos).
//
// Escrito à mão e não por `base`, pela mesma razão do `IconEmpresa` logo acima: a `base` usa traço
// 1,5 e o alvo aqui é de 14px, onde ele renderiza 0,875px e as duas linhas do lado direito quase
// desaparecem. Com 1,7 elas sobrevivem sem engrossar o retângulo.
export function IconCracha({ className = 'h-4 w-4', ...props }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"
      strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true" {...props}>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <circle cx="8.5" cy="11" r="2" />
      <path d="M5.5 16c.5-1.3 1.6-2 3-2s2.5.7 3 2" />
      <path d="M14.5 10h4M14.5 14h2.5" />
    </svg>
  );
}

// --- Ícones dos CARDS de quadro (Painel da Engenharia e Kanban de Custos) ---
// Traço 2 e não o 1,5 do `base` acima: é o que os dois handoffs especificam, e num alvo de 14px o
// traço fino desaparece. Vivem aqui, e não dentro de um dos cards, porque os DOIS os usam — a
// alternativa é a divergência de sempre (foi assim que a bandeira virou três desenhos diferentes).
const baseCard = (paths) => function IconCard({ className = 'h-[14px] w-[14px]', ...props }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true" {...props}>
      {paths}
    </svg>
  );
};

export const IconUser = baseCard(<><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></>);
export const IconCal = baseCard(<><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></>);
// Calendário com CHECK — a data de TÉRMINO no card do Kanban de Custos, irmã da data limite logo
// acima dela. Nasceu porque o card passou a ter DUAS datas e a de término usava um círculo com
// check (`IconCirculoCheck`): ele diz "cumprida", mas não diz DATA, e a linha não se lia como par
// da de cima. Aqui o calendário carrega o "é uma data" e o check, o "já aconteceu".
//
// O corpo é um `path` com o canto inferior direito ABERTO, e não o `rect` do `IconCal`: em 14px o
// check precisa daquele canto para não empilhar traço sobre traço. Os dois anéis e a linha do
// cabeçalho são idênticos aos do irmão, que é o que mantém a silhueta reconhecível.
//
// Não confundir com o `IconCirculoCheck` (que segue sendo "etapa cumprida" no CustosLiberacao) nem
// com o `IconCheckDuplo` (reservado ao botão "Finalizar" da Engenharia).
export const IconCalCheck = baseCard(<>
  <path d="M21 12V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h7" />
  <line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" />
  <line x1="3" y1="10" x2="21" y2="10" />
  <polyline points="16 19 18 21 22 17" />
</>);
export const IconComentario = baseCard(<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />);
// COM QUEM ESTÁ — a posse do custo. É o "você está aqui" dos mapas: um anel com o miolo cheio,
// que responde ONDE a coisa está e não QUEM é a pessoa.
//
// Deliberadamente NÃO é um bonequinho: o `IconUsuarios2` (duas silhuetas) já quer dizer
// "responsáveis" no mesmo card, e dois desenhos de pessoa em linhas vizinhas se leriam como a mesma
// coisa — que é exatamente a confusão que a posse existe para desfazer. Em 14px o anel de duas
// partes fica legível, enquanto uma silhueta com seta viraria borrão.
export const IconPosse = baseCard(<>
  <circle cx="12" cy="12" r="8.5" />
  <circle cx="12" cy="12" r="3.2" fill="currentColor" stroke="none" />
</>);
// RELÓGIO — o selo de "ordem fixa" no cabeçalho das colunas que se ordenam sozinhas por DATA: a
// "Concluído"/"Finalizado" do Kanban de Custos e a "Concluídos" do Painel da Engenharia. Ele mora
// aqui, e não dentro de uma das duas telas, porque as DUAS o usam — é a regra que a bandeira de
// prioridade ensinou depois de virar três desenhos diferentes. Não confundir com o relógio de
// `dashboard/Alertas.jsx`, que é OUTRO desenho (ponteiros por `polyline`) e continua local.
export const IconRelogio = baseCard(<><circle cx="12" cy="12" r="9" /><path d="M12 8v4l2.5 1.5" /></>);
// GLOBO — o PAÍS de um projeto do Exterior: a linha "País de destino" do card do Painel da
// Engenharia e o rodapé do cartão do widget "Acompanhamento da Engenharia". Morava local no
// `CardProjeto` e subiu quando o widget trocou a pílula índigo por globo + nome. As cópias
// `IcoGlobo` das fichas ficam onde estão: são outro tamanho e outro traço (1,7).
export const IconGlobo = baseCard(<><circle cx="12" cy="12" r="9" /><path d="M3 12h18" /><path d="M12 3a15 15 0 0 1 0 18a15 15 0 0 1 0-18z" /></>);
export const IconCheck = baseCard(<polyline points="20 6 9 17 4 12" />);
// Check duplo — botão "Finalizar" (Painel da Engenharia), que substitui "Concluir" quando o card já
// está Concluído. Os dois traços são o MESMO desenho de `IconCheck`, encolhido e repetido com 6px
// de deslocamento em x — nasce parecido de propósito: a relação entre os dois botões é "esta
// confirmação, mais uma". O de trás entra com `strokeOpacity` reduzido para não competir com o da
// frente, que é o que carrega a cor do botão.
export const IconCheckDuplo = baseCard(<>
  <polyline points="1 12 6 17 14 6" strokeOpacity="0.55" />
  <polyline points="7 12 12 17 20 6" />
</>);
// COPIAR — o PRIMEIRO ícone de clipboard do app. Dois retângulos sobrepostos: o da frente é a
// cópia e o de trás é o original, com o canto inferior direito ABERTO (só as duas arestas que
// aparecem por baixo). Desenhar o de trás fechado empilharia traço sobre traço nos 13px de uso e
// viraria uma mancha — é a mesma aritmética que tirou as janelas do `IconEmpresaMais`.
export const IconCopiar = baseCard(<><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></>);
export const IconLapis = baseCard(<><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></>);
export const IconUsuarios2 = baseCard(<><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></>);

// "Atribuir a alguém" (pessoa com +) — o mesmo desenho do ClickUp que serviu de referência.
// `viewBox` deslocado 0,5 em x: o desenho é assimétrico (a pessoa à esquerda, o "+" à direita), e a
// tinta vai de 2,05 a 22,95 — centro em 12,5 contra os 12 do viewBox. Medido com `getBBox()` mais
// metade do traço. Deslocar a janela devolve o desenho ao centro sem redesenhá-lo.
// Traço 1,9 (e não os 2 do `baseCard`): ele é usado em alvos de 22 a 26px, e a diferença é o que
// impede o "+" de engrossar demais ao lado do círculo da cabeça.
export function IconPessoaMais({ className = 'h-[14px] w-[14px]' }) {
  return (
    <svg viewBox="0.5 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.9"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="9" cy="7" r="3.2" /><path d="M3 20c0-3.1 2.7-5 6-5 1 0 2 .2 2.8.5" />
      <path d="M16 17h6M19 14v6" />
    </svg>
  );
}
// "Vincular unidade" (empresa com +) — o PAR do `IconPessoaMais` acima, e por isso construído em
// cima dele: mesmo "+" (`M16 17h6M19 14v6`), mesmo traço 1,9, mesmo chão na altura do pé do "+".
// Os dois vivem lado a lado na Ficha do Cliente — o botão redondo do card de Contatos e o do card
// "Outras unidades", que são o mesmo botão de 26px classe por classe —, e é a simetria dos desenhos
// que faz o par se ler como um sistema: adicionar PESSOA, vincular EMPRESA.
//
// Não é o `IconPessoaMais` porque aqui é empresa vinculada a empresa (a decisão vinha do
// `ClienteFicha.jsx`, onde este ícone era um "+" pelado), e não é o elo de corrente porque ele já é
// "Agrupar / Gerenciar grupo" em quatro telas — reusá-lo daria dois significados ao mesmo símbolo.
//
// DOIS VOLUMES de alturas diferentes, como no `IconEmpresa`: é o que faz o desenho ler como
// *unidades* no plural, que é o conceito (a BRF tem 28). Um retângulo só, com um "+" ao lado, leria
// como "adicionar caixa".
//
// E SEM as janelas do `IconEmpresa`, por aritmética: elas têm 2 unidades de comprimento, o que nos
// 14px daqui dá 1,17px contra um traço de 1,10px — vira um ponto. O `IconEmpresa` só as sustenta
// porque vive a 16-18px e com traço 2.
//
// `viewBox` SEM deslocamento, ao contrário do irmão — e isso foi medido, não presumido. O desenho é
// igualmente assimétrico (o prédio à esquerda, o "+" à direita), mas aqui o chão de 11,5 unidades
// puxa a tinta para a esquerda o bastante para equilibrar o "+" sozinho: ela vai de 1,05 a 22,95 em
// x (centro 12,0) e de 3,05 a 20,95 em y (centro 12,0), contra os 12/12 do viewBox — `getBBox()`
// mais metade do traço. É por causa desse equilíbrio que a torre sobe até y=4 e não y=5: um volume
// mais baixo joga o centro vertical para 12,5 e o ícone assenta meio pixel abaixo do irmão.
//
// Default 14px, e o número PAR é medido: a caixa de conteúdo do botão redondo tem 24px (26 menos as
// duas bordas), então 14 deixa 5px INTEIROS de cada lado. Com 13 sobram 11, o `justify-center`
// reparte 5,5 por lado, e o traço cai entre dois pixels — nesta máquina o efeito dobra, porque com
// `devicePixelRatio` 1,5 os 5,5px viram 8,25 pixels FÍSICOS.
export function IconEmpresaMais({ className = 'h-[14px] w-[14px]' }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.9"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 20V4h5v16" /><path d="M8 20v-8h4.5v8" /><path d="M2 20h11.5" />
      <path d="M16 17h6M19 14v6" />
    </svg>
  );
}

// "+" de adicionar, para quando ele é o CONTEÚDO INTEIRO de um alvo redondo (o botão de atribuir
// responsável da Lista de Controle e o do card do Painel da Engenharia).
//
// Existe porque o CARACTERE "+" não centraliza num círculo, e isso é medido: na Inter a 11px a
// tinta dele vai de 6px acima do baseline a ZERO abaixo (`actualBoundingBoxAscent` 6,
// `descent` 0) — ele é assimétrico, e o centro da tinta cai 1,0px ABAIXO do centro da caixa de
// linha. Num alvo de 19px isso é 5% de desalinho, e aparece.
//
// `leading-none` NÃO resolve: o desvio vem da assimetria da tinta, não do `line-height` — refazendo
// a conta com a caixa em 11px dá exatamente o mesmo 1px. Compensar com `-mt-px` corrigiria só nesta
// fonte e neste tamanho. O SVG centraliza pela GEOMETRIA e não depende de nenhuma métrica.
//
// É a mesma decisão que tirou o glifo `▾` de 30 lugares em favor do `IconSeta`.
//
// 11px com traço 2,2 casa a tinta com a do glifo que ele substitui: a cruz vai de 5 a 19 no viewBox
// de 24, então 14/24 × 11 = 6,42, mais 1,0 do traço = **7,43px** — contra os 7,28 de largura do "+"
// de texto. A 12px daria 8,1 e o botão pareceria ter ganhado um "+" maior, que não é o pedido.
// A tinta é QUADRADA (7,43 × 7,43) enquanto a do glifo era achatada (7,28 × 6) — e isso é correção,
// não efeito colateral: um "+" simétrico é o que se espera; o da fonte não era.
export function IconMais({ className = 'h-[11px] w-[11px]' }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2.2"
      strokeLinecap="round" aria-hidden="true">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export const IconLixeira = baseCard(<><path d="M3 6h18" /><path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /></>);

// "Mais ações" — DEITADO e CHEIO. Em pé ele competia com o grip (que também é uma coluna de
// pontos); e preenchido pela mesma razão do `IconSeta` e do `IconGrip`: num alvo de 14px um
// contorno de 2px sobre um círculo de raio 1,4 vira quase só borda, e o ponto some.
export function IconTresPontos({ className = 'h-[14px] w-[14px]' }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" stroke="none" aria-hidden="true">
      <circle cx="5" cy="12" r="1.9" /><circle cx="12" cy="12" r="1.9" /><circle cx="19" cy="12" r="1.9" />
    </svg>
  );
}

// Desativar / reativar um CONTATO — o olho cortado e o olho aberto.
//
// Eram locais em `pages/Contatos.jsx` e subiram quando a Ficha do Contato ganhou a mesma ação no
// chevron do cabeçalho: dois ícones do MESMO ato em dois arquivos é como eles divergem no primeiro
// ajuste. O traço é 1.8 (e não o 2 do resto do arquivo) porque foi assim que nasceram, e mudá-lo
// aqui mudaria a coluna de ações da lista sem ninguém ter pedido.
// O papel da nota (o mesmo glifo do nó "Nota interna" da Timeline) com um "+": o "Adicionar nota"
// do menu da Ficha do Contato. Traço 1,8 e 14px, os mesmos dos vizinhos daquele menu.
export const IconNotaMais = ({ className = 'h-4 w-4' }) => (
  <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><path d="M12 12v6M9 15h6" /></svg>
);
export const IconDesativar = ({ className = 'h-4 w-4' }) => (
  <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M9.9 4.24A9.1 9.1 0 0 1 12 4c7 0 10 8 10 8a18 18 0 0 1-2.16 3.19M6.6 6.6A18 18 0 0 0 2 12s3 8 10 8a9 9 0 0 0 5.4-1.6" /><path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" /><path d="M2 2l20 20" /></svg>
);
export const IconReativar = ({ className = 'h-4 w-4' }) => (
  <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3-8 10-8 10 8 10 8-3 8-10 8-10-8-10-8z" /><circle cx="12" cy="12" r="3" /></svg>
);
