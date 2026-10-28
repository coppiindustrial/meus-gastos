import { useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ResponsiveGridLayout, useContainerWidth, getCompactor } from 'react-grid-layout';
import { CtxAltura } from './CardAutoAltura.jsx';
import CabecalhoPagina from '../CabecalhoPagina.jsx';
import { lsGet, lsRemove, lsSet } from '../../lib/storage.js';
import Modal from '../Modal.jsx';
import { PageLoading } from '../Spinner.jsx';
import Checkbox from '../Checkbox.jsx';
import Tooltip from '../Tooltip.jsx';
import MiniaturaWidget from './MiniaturaWidget.jsx';
import { IconAtualizar } from '../icons.jsx';
import { useConfirmacao } from '../../context/ConfirmContext.jsx';

// O GRID PERSONALIZÁVEL — copiado do Gestor Coppi (`components/dashboard/GridPersonalizavel.jsx`, o
// do Dashboard Comercial), com as armadilhas que o histórico de lá já pagou: arrastar, redimensionar,
// minimizar, ligar/desligar widget, separadores de seção, disposição à parte para tela compacta.
//
// O QUE MUDOU NA CÓPIA: (1) a gravação. Lá o layout vai para o servidor, por usuário; aqui é
// PREFERÊNCIA DE TELA e mora no navegador (`lsGet`/`lsSet`, a regra do app). O `api` logo abaixo
// imita as quatro rotas de lá sobre o localStorage — por isso o resto do arquivo segue igual ao do
// Gestor e uma correção de lá se traz sem tradução. (2) O cabeçalho é o `CabecalhoPagina` do app.
// (3) "Atualizar" chama `onAtualizar` da página (aqui não há o `useAutoRefresh` do Gestor).

// ---- Geometria ------------------------------------------------------------------------------
// DIFERENÇA DA CÓPIA (Meus Gastos, 27/10/2026): a linha tem METADE da altura da do Gestor (22 + 16 de vão
// = 38px, contra 60 + 16 = 76), para o bloco poder crescer e encolher em passos menores. Os `h` do
// catálogo dobraram, e a mesma altura em px continua a mesma: `38h - 16`.
// Altura de UMA linha do grid, em px. `76h - 16` é a altura de um item de h linhas (60 + 16 de
// margem, menos a margem que sobra na última).
export const LINHA_PX = 22;
export const MARGEM = [16, 16];
// Limiar medido na largura do CONTAINER (já sem a sidebar de ~274px), não na viewport.
export const LARGURA_LG = 700;
export const BREAKPOINTS = { lg: LARGURA_LG, xs: 0 };
export const COLUNAS = { lg: 12, xs: 1 };
// A PARTIR DE QUE LARGURA O GRID USA A DISPOSIÇÃO "NORMAL" (16/09/2026). Abaixo disso — notebook de
// 13", ou monitor grande com a janela pequena — vale a disposição COMPACTA, guardada à parte no
// servidor (`?tamanho=compacto`). A volta tem 20px de folga (`LARGURA_COMPACTO_ENTRA`): a barra de
// rolagem do `<main>` aparece e some conforme a altura do conteúdo, e sem a folga uma janela bem no
// limite trocaria de disposição a cada vez que ela aparecesse.
export const LARGURA_NORMAL = 1200;
const LARGURA_COMPACTO_ENTRA = 1180;
export const PADDING_GRID = [0, 0];
// Widget minimizado = só o header.
// Duas linhas de 22 (60px): a barra do bloco minimizado cabe inteira.
export const H_COLAPSADO = 2;

// AS ROTAS DO GESTOR SOBRE O LOCALSTORAGE: a rota inteira (com o `?dashboard=` e o `&tamanho=`) é a
// chave. `config` guarda { widgets, separadores }; `layout` guarda a lista de itens do PUT.
const lerLs = (k) => { try { return JSON.parse(lsGet(k) || 'null'); } catch { return null; } };
// LINHAS ANTIGAS: `ESCOPO_ANTIGO` diz de que escopo a disposição salva vinha quando a linha tinha o dobro
// da altura. Sem nada salvo no novo, ela é lida de lá com `y` e `h` dobrados (o mesmo tamanho em px).
// Cada escopo novo diz de qual veio e como a disposição salva lá se converte (lida UMA vez: a primeira
// gravação já vai para o novo). `visao_v3` (28/10/2026): o aviso "Agora" (`vg_agora`) passou para o
// TOPO da Visão geral — quem já tinha a disposição personalizada a mantém, com o aviso subindo.
const dobrar = (itens) => itens?.map((i) => ({ ...i, y: i.y * 2, h: i.h * 2, h_aberto: i.h_aberto != null ? i.h_aberto * 2 : i.h_aberto }));
const aoTopo = (id) => (itens) => {
  const alvo = itens?.find((i) => i.widget_id === id);
  if (!alvo) return itens;
  return itens.map((i) => (i === alvo ? { ...i, x: 0, y: 0 } : i.y < alvo.y ? { ...i, y: i.y + alvo.h } : i));
};
const ESCOPO_ANTIGO = { visao_v2: { de: 'visao', converter: dobrar }, visao_v3: { de: 'visao_v2', converter: aoTopo('vg_agora') } };
const api = {
  get: async (rota) => {
    const atual = lerLs(rota);
    if (atual != null) return atual;
    const m = rota.match(/dashboard=([^&]+)/);
    const antigo = m && ESCOPO_ANTIGO[m[1]];
    if (!antigo) return null;
    const velho = await api.get(rota.replace(`dashboard=${m[1]}`, `dashboard=${antigo.de}`));
    return rota.startsWith('/dashboard/layout') && velho ? antigo.converter(velho) : velho;
  },
  put: async (rota, corpo) => {
    const valor = rota.startsWith('/dashboard/layout') ? corpo.itens : corpo;
    lsSet(rota, JSON.stringify(valor));
    return valor;
  },
  del: async (rota) => { lsRemove(rota); },
};

// O RGL NÃO recompacta layout recebido por prop — só o que ele mesmo gera. Sem isto, um widget
// removido deixa o buraco e os de baixo não sobem.
const compactadorVertical = getCompactor('vertical');

// Igualdade do layout pelo que realmente importa (o que é persistido). O `onLayoutChange` do RGL
// dispara a cada sincronização e devolve SEMPRE um array novo; guardar esse array sem comparar
// troca a identidade do estado, o que devolve um `layouts` novo ao RGL, que dispara de novo — o
// dashboard fica renderizando dezenas de vezes por segundo (a tela "treme" e trava).
const mesmoLayout = (a, b) => {
  if (!a || !b || a.length !== b.length) return false;
  const porId = new Map(a.map((it) => [it.i, it]));
  return b.every((it) => {
    const o = porId.get(it.i);
    return o && o.x === it.x && o.y === it.y && o.w === it.w && o.h === it.h;
  });
};

// ACOMODAR O LAYOUT NA LARGURA ATUAL (16/09/2026). Cada `minPx` do catálogo vira colunas pela largura
// VIVA, e numa tela menor o item precisa de mais colunas do que tinha quando o layout foi salvo. O
// grid alargava o item no lugar e deixava o compactador do RGL empurrar o vizinho para baixo — e a
// coluna que sobrava ficava vazia: medido com o container em 950px, 38 das 42 linhas de grid tinham
// buraco. Aqui cada item, na ordem de leitura, fica onde estava se couber; se não couber, vai para a
// primeira vaga livre a partir da sua linha — na coluna de origem só na PRÓPRIA linha; descendo, a
// vaga mais à esquerda, senão o item carregaria para baixo um recuo que não tem mais motivo (medido:
// o "Orçado × confirmado" descia para x=4 e deixava 4 colunas vazias à esquerda); e, se algo mudou
// de lugar, cada item se estende até o
// vizinho da direita (ou a borda), para a sobra não virar buraco.
//
// NUM LAYOUT QUE JÁ CABE, NADA MUDA — e a função devolve o MESMO array. É essa identidade que deixa o
// `useMemo` estável e preserva a disposição que o usuário montou na largura em que a montou.
export function acomodar(itens, minWDe, cols = 12) {
  const colide = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  const ordem = [...itens].sort((a, b) => a.y - b.y || a.x - b.x);
  const postos = [];
  let mexeu = false;
  for (const it of ordem) {
    const w = Math.min(cols, Math.max(it.w, minWDe(it) || 1));
    const x0 = Math.max(0, Math.min(it.x, cols - w));
    const naLinha = [x0];
    const descendo = [];
    for (let k = 0; k <= cols - w; k += 1) {
      descendo.push(k);
      if (k !== x0) naLinha.push(k);
    }
    let lugar = null;
    for (let y = it.y; !lugar; y += 1) {
      for (const x of (y === it.y ? naLinha : descendo)) {
        const cand = { ...it, x, y, w };
        if (!postos.some((p) => colide(cand, p))) { lugar = cand; break; }
      }
    }
    if (lugar.x !== it.x || lugar.y !== it.y || lugar.w !== it.w) mexeu = true;
    postos.push(lugar);
  }
  if (!mexeu) return itens;
  for (const p of postos) {
    const aDireita = postos.filter((o) => o !== p && o.x >= p.x + p.w && o.y < p.y + p.h && p.y < o.y + o.h);
    p.w = Math.min(cols, ...aDireita.map((o) => o.x)) - p.x;
  }
  return postos;
}

// Só o que é persistido. O RGL devolve os itens com `minW`, `maxH`, `moved`… — guardar isso no
// estado faria um teto de altura de uma largura antiga sobreviver à troca de tela.
const soPosicao = (l) => l.map(({ i, x, y, w, h }) => ({ i, x, y, w, h }));

// ---- Separador ------------------------------------------------------------------------------
// Item de grid sem conteúdo, que existe só para OCUPAR ESPAÇO: o grid compacta para cima, então
// remover um widget faz o de baixo subir. Pondo um separador no vão, ele fica onde está.
// Numerado (`sep-1`, `sep-2`…) porque com id fixo só daria para guardar um vão.
export const ehSeparador = (id) => /^sep-\d+$/.test(id);
export const SEP_DEF = { w: 12, h: 2, minH: 2 };
// Id do item fantasma enquanto o botão "Separador" está sendo arrastado para dentro do grid.
const SEP_DROP = '__sep-novo__';
const proximoSeparador = (ids) => {
  const usados = ids.filter(ehSeparador).map((id) => Number(id.slice(4)));
  return `sep-${Math.max(0, ...usados) + 1}`;
};

// Layout de fábrica: a posição que o catálogo declara para quem nunca arrastou.
export function layoutPadrao(ids, catalogo) {
  return ids.map((id) => {
    if (ehSeparador(id)) return { i: id, x: 0, y: 0, ...SEP_DEF };
    const w = catalogo.find((x) => x.id === id);
    return { i: id, x: w?.x ?? 0, y: w?.y ?? 0, w: w?.w ?? 12, h: w?.h ?? 6 };
  });
}

// Grade de widgets: o desenho fala do que o botão organiza, não da ação de editar.
const IconGrade = ({ className = 'h-4 w-4' }) => (
  <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" />
    <rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" />
  </svg>
);

const IconArrastar = ({ className = 'h-4 w-4' }) => (
  <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
    <circle cx="9" cy="6" r="1.6" /><circle cx="15" cy="6" r="1.6" />
    <circle cx="9" cy="12" r="1.6" /><circle cx="15" cy="12" r="1.6" />
    <circle cx="9" cy="18" r="1.6" /><circle cx="15" cy="18" r="1.6" />
  </svg>
);
const IconMinimizar = ({ className = 'h-4 w-4' }) => (
  <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M6 12h12" /></svg>
);
const IconExpandir = ({ className = 'h-4 w-4' }) => (
  <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>
);
const IconRemover = ({ className = 'h-4 w-4' }) => (
  <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
);

// Sem nome é só um vão com uma linha tênue; com nome vira RÓTULO DE SEÇÃO (texto à esquerda, o
// filete seguindo até a borda) — é o que permite dividir o dashboard em blocos.
export function Separador({ nome }) {
  return (
    <div className="card h-full flex items-center gap-3 bg-transparent border-0 shadow-none">
      {nome && (
        <span className="shrink-0 text-[11.5px] font-semibold uppercase tracking-wide text-gray-500">{nome}</span>
      )}
      <div className="flex-1 border-t border-gray-300/70" />
    </div>
  );
}

// Casca de cada item do grid. A barra `.dash-drag` é o ÚNICO ponto de arraste (o kanban de Custos
// usa drag HTML5 nativo lá dentro — sem o handle, arrastar um card moveria o widget). Ela aparece
// no modo edição e, fora dele, só quando o widget está minimizado — senão não haveria como reabrir
// sem voltar à edição.
//
// `crescer` é para o item de ALTURA MEDIDA — ver o wrapper de conteúdo lá embaixo.
function ItemGrid({ id, titulo, edicao, colapsado, onToggleColapso, onRemover, separador, nome, onRenomear, crescer, onFalta, pilha = false, children }) {
  const mostraBarra = edicao || colapsado;

  // A BARRA DE ARRASTAR FAZ PARTE DA ALTURA DO ITEM, e por isso entra na medição. Ela é IRMÃ do
  // conteúdo dentro da mesma altura, então enquanto ela está na tela o card perde o que ela
  // ocupa (~32,5px medidos) — e como o `h` do item saía SÓ do conteúdo do card, entrar em
  // "Personalizar" já bastava para o texto estourar o card e pousar no widget de baixo, sem
  // arrastar nada. Medida e nunca constante, que é a mesma regra do `CardAutoAltura`: ela muda
  // com o `py` do separador e com os botões que a edição acrescenta.
  const barraRef = useRef(null);
  const [cromo, setCromo] = useState(0);
  useLayoutEffect(() => {
    const h = barraRef.current ? barraRef.current.getBoundingClientRect().height : 0;
    setCromo((v) => (Math.abs(v - h) < 0.5 ? v : h));
  }, [mostraBarra, edicao, separador]);

  // Reusa o canal do `CtxAltura` em vez de abrir um segundo contexto: o widget reporta a altura
  // do PRÓPRIO box e quem soma o cromo do item é quem o desenha. A dependência em `cromo` não é
  // detalhe — é ela que faz o `CardAutoAltura` re-reportar quando a barra aparece, porque a
  // grade dele NÃO muda de tamanho nessa hora e o `ResizeObserver` sozinho não dispararia.
  const reportarFora = useContext(CtxAltura);
  const reportar = useCallback((idW, px) => reportarFora?.(idW, px + cromo), [reportarFora, cromo]);

  // O CONTEÚDO QUE NÃO CABE NO CARD vira altura a mais para o item (16/09/2026). A altura dos cards
  // comuns é a do grid, fixa; quando a tela estreita faz o conteúdo quebrar em mais linhas (as duas
  // colunas do "Chance de fechar pela idade" empilhando, a frase do rodapé em três linhas), ele saía
  // pelo fundo do card e pousava no de baixo — "cresce para baixo e o fundo não acompanha". Aqui o
  // card é medido depois de cada render e quando muda de tamanho: se o conteúdo passa do fundo, o
  // grid recebe a altura de que ele precisa. O grid SÓ SOBE esse número dentro de uma mesma largura
  // (ver `faltas`), então não há vai e volta. Não vale para o item de altura medida, que já cresce.
  // DIFERENÇA DA CÓPIA (Meus Gastos, 27/10/2026): só pede a mesma altura UMA vez. O efeito roda a cada
  // render, e no react-grid-layout 2.2.3 a altura a mais nem sempre chega ao desenho; o card continuava
  // transbordando e repetia o pedido a cada render — com a barra da edição, virava "Maximum update
  // depth". Os blocos da Visão geral rolam por dentro e não transbordam; isto é a rede de segurança.
  const conteudoRef = useRef(null);
  const ultimaFalta = useRef(null);
  useLayoutEffect(() => {
    if (!onFalta || crescer || colapsado) return undefined;
    const card = conteudoRef.current?.firstElementChild;
    if (!card) return undefined;
    const medir = () => {
      if (card.scrollHeight - card.clientHeight <= 1) return;
      const px = card.scrollHeight + cromo;
      if (ultimaFalta.current !== null && Math.abs(ultimaFalta.current - px) < 1) return;
      ultimaFalta.current = px;
      onFalta(id, px);
    };
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(card);
    for (const filho of card.children) ro.observe(filho);
    return () => ro.disconnect();
  });

  return (
    <div className={`h-full min-h-0 flex flex-col ${edicao ? 'rounded-lg ring-2 ring-gray-400 ring-offset-2 ring-offset-white' : ''}`}>
      {mostraBarra && (
        <div ref={barraRef} className={`dash-drag shrink-0 flex items-center gap-2 rounded-t-lg border border-b-0 border-gray-200 bg-gray-50 px-3 ${separador ? 'py-1' : 'py-1.5'} ${edicao ? 'cursor-move' : ''}`}>
          {edicao && <IconArrastar className="h-4 w-4 text-gray-400 shrink-0" />}
          {separador && edicao ? (
            // onMouseDown parado: sem isso o handle de arraste engole o clique e o campo nunca
            // recebe foco.
            <input
              defaultValue={nome || ''}
              onMouseDown={(e) => e.stopPropagation()}
              onBlur={(e) => onRenomear?.(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
              placeholder="Nome da seção (opcional)"
              maxLength={40}
              className="flex-1 min-w-0 rounded-md border border-gray-300 bg-white px-2 py-0.5 text-[12px] text-gray-700 placeholder:text-gray-400 focus:outline-none focus:border-gray-500"
            />
          ) : (
            <span className="flex-1 min-w-0 truncate text-[12.5px] font-medium text-gray-700">{titulo}</span>
          )}
          <div className="shrink-0 flex items-center gap-1">
            <Tooltip label={colapsado ? 'Expandir' : 'Minimizar'}>
              <button type="button" onMouseDown={(e) => e.stopPropagation()} onClick={onToggleColapso}
                className="shrink-0 h-6 w-6 inline-flex items-center justify-center rounded-md border border-gray-200 bg-white text-gray-500 hover:bg-gray-100 transition">
                {colapsado ? <IconExpandir /> : <IconMinimizar />}
              </button>
            </Tooltip>
            {/* Remover só na EDIÇÃO (não quando a barra aparece por estar minimizado): ali existe
                o Cancelar, que devolve inclusive a lista de widgets. */}
            {edicao && (
              <Tooltip label="Remover do dashboard">
                <button type="button" onMouseDown={(e) => e.stopPropagation()} onClick={onRemover}
                  aria-label="Remover do dashboard"
                  className="shrink-0 h-6 w-6 inline-flex items-center justify-center rounded-md border border-gray-200 bg-white text-gray-500 hover:bg-red-50 hover:border-red-200 hover:text-red-600 transition">
                  <IconRemover />
                </button>
              </Tooltip>
            )}
          </div>
        </div>
      )}
      {!colapsado && !(separador && edicao) && (
        // `flex flex-col` + `[&>.card]:flex-1 min-h-0` é o que faz o widget RECEBER a altura do
        // item: sem isso o card para na altura natural do conteúdo e sobra buraco ao
        // redimensionar. Conteúdo inerte na edição: evita clique nos filtros e conflito com o
        // drag nativo dos kanbans internos.
        //
        // O ITEM DE ALTURA MEDIDA É O CONTRÁRIO: ali o card CRESCE com o conteúdo (`shrink-0`) e
        // a altura do item vira só um PISO (`min-h-full`). É o único remédio possível para o
        // resize: o RGL v2 congela a altura enquanto se arrasta — `calcGridItemPosition` usa o
        // `resizePositionRef` e IGNORA o `h` das props, e na alça leste (`resizeEast`) a altura
        // repassada é a do INÍCIO do gesto. Ou seja, a medida nova do `CardAutoAltura` não vale
        // nada até o `onResizeStop`, e nenhuma medição conserta isso. Deixando o card crescer, o
        // que passa da vaga é a CAIXA BRANCA com borda e sombra — e não texto solto pousado no
        // widget de baixo, que era a queixa. Ele flutua por cima porque a lib já dá
        // `z-index: 1` ao `.react-grid-item.resizing` contra o `auto` dos vizinhos.
        //
        // Em regime permanente o conteúdo é IGUAL à altura do item, então não muda um pixel.
        //
        // NA PILHA (coluna única) o card ROLA NA HORIZONTAL: ali ele pode ficar mais estreito que o
        // `minPx` do gráfico (324px numa janela de 640), e o conteúdo vazava pela lateral. A rolagem
        // não atrapalha o `onFalta`: o `scrollHeight` de um card rolável continua contando o que passa
        // do fundo.
        <div ref={conteudoRef} className={`flex-1 min-h-0 flex flex-col ${crescer ? '[&>.card]:min-h-full [&>.card]:shrink-0' : '[&>.card]:flex-1 [&>.card]:min-h-0'} ${mostraBarra ? '[&>.card]:rounded-t-none' : ''} ${pilha ? '[&>.card]:overflow-x-auto' : ''} ${edicao ? 'pointer-events-none select-none' : ''}`}>
          <CtxAltura.Provider value={reportar}>{children}</CtxAltura.Provider>
        </div>
      )}
    </div>
  );
}

// Barra flutuante do modo edição — mesmo molde do `EdicaoMassaBar` da Fila/Pausados.
function BarraEdicao({ estreito, compacto, onWidgets, onSeparador, onRestaurar, onCancelar, onConcluir }) {
  const btn = 'inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-semibold text-gray-800 hover:bg-gray-100 transition';
  return createPortal(
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 animate-barra-in motion-reduce:animate-none flex items-center gap-1 rounded-xl border border-gray-300 bg-elevado py-2 pl-4 pr-2.5 shadow-[0_12px_32px_-8px_rgba(0,0,0,0.28),0_4px_12px_-4px_rgba(0,0,0,0.12)] sombra-popover">
      <span className="text-sm font-semibold text-gray-800 whitespace-nowrap">
        Editando a tela
        {estreito && <span className="ml-1.5 font-normal text-[12px] text-gray-400">(tela estreita: sem arraste)</span>}
        {!estreito && compacto && (
          <Tooltip label="Esta disposição vale só para telas menores. A da tela grande não muda.">
            <span className="ml-1.5 font-normal text-[12px] text-gray-400">· tela compacta</span>
          </Tooltip>
        )}
      </span>
      <span className="mx-2 h-[22px] w-px bg-gray-200" />
      <button type="button" onClick={onWidgets} className={btn}>
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></svg>
        Widgets
      </button>
      <Tooltip label="Arraste para o painel — ou clique para inserir no topo">
        <button type="button" onClick={onSeparador} className={`${btn} cursor-grab active:cursor-grabbing`}
          draggable
          onDragStart={(e) => {
            // O Firefox só inicia o arraste com algum dado no dataTransfer.
            e.dataTransfer.setData('text/plain', 'separador');
            e.dataTransfer.effectAllowed = 'copy';
          }}>
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12h16" /><path d="M8 6h8" /><path d="M8 18h8" /></svg>
          Separador
        </button>
      </Tooltip>
      <button type="button" onClick={onRestaurar} className={btn}>
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" /></svg>
        Restaurar padrão
      </button>
      <span className="mx-2 h-[22px] w-px bg-gray-200" />
      {/* Cancelar devolve o dashboard ao estado de quando a edição começou — as mudanças são
          gravadas ao longo da edição, então desfazer é restaurar o retrato tirado na entrada. */}
      <button type="button" onClick={onCancelar} className={`${btn} !font-medium text-gray-600`}>
        Cancelar
      </button>
      {/* `inverte-no-escuro`: é o botão principal da barra, e no escuro fica claro com a letra escura,
          como o `btn-primary` — pela paleta o gray-800 virava um grafite quase igual à barra. */}
      <button type="button" onClick={onConcluir}
        className="inverte-no-escuro inline-flex items-center gap-1.5 rounded-lg bg-gray-800 px-3 py-1.5 text-sm font-semibold text-white hover:bg-gray-900 transition">
        Concluir
      </button>
    </div>,
    document.body,
  );
}

// Rótulo de cada área do catálogo no modal (o `area` cru é minúsculo e abreviado).
const AREA_LABEL = {
  vg_numeros: 'Números',
  vg_graficos: 'Gráficos',
  vg_tabelas: 'Tabelas',
};

// Modal "Widgets": liga/desliga numa GRADE de cards com miniatura — só o título não dizia o que é
// cada bloco. Só lista o que a permissão do usuário deixa ver.
//
// EXPORTADO porque o RELATÓRIO faz a mesma pergunta sobre o mesmo catálogo — "quais blocos entram" —
// e escrever um segundo quadro seria duplicar as miniaturas e o agrupamento por área. O que muda
// entre os dois é só a PALAVRA: no grid os blocos se posicionam depois, no relatório eles saem na
// ordem do catálogo. Daí `titulo` e `ajuda` serem props, com o default preservando o dashboard.
export function PersonalizarModal({
  open, onClose, permitidos, ativos, onSalvar,
  titulo = 'Widgets do dashboard', ajuda,
}) {
  const [lista, setLista] = useState([]);
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (open) setLista(ativos); }, [open, ativos]);

  const grupos = useMemo(() => {
    const por = new Map();
    for (const w of permitidos) {
      if (!por.has(w.area)) por.set(w.area, []);
      por.get(w.area).push(w);
    }
    return [...por.entries()].map(([area, widgets]) => ({ area, widgets }));
  }, [permitidos]);

  const toggle = (id) => setLista((l) => (l.includes(id) ? l.filter((x) => x !== id) : [...l, id]));
  const salvar = async () => {
    setSaving(true);
    try { await onSalvar(lista); onClose(); } finally { setSaving(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title={titulo} maxWidth="max-w-2xl">
      <div className="space-y-4">
        <p className="text-sm text-gray-600">
          {ajuda || (<>Escolha os widgets que aparecem. A posição e o tamanho de cada um você ajusta
          arrastando na própria tela. Fica salvo neste navegador.</>)}
        </p>
        {/* O RÓTULO DA ÁREA É UMA FAIXA, e ela não é um desenho novo: é o `Separador` do próprio
            grid, classe por classe (o texto à esquerda e o filete correndo até a borda). Com isso o
            rótulo de seção do DASHBOARD e o do QUADRO passam a ser a mesma peça — antes o quadro
            tinha um vocabulário só dele.
            Ele já foi uma COLUNA de 96px à esquerda dos cartões. A faixa devolve esses 96px à
            grade, e quem cresce é a miniatura, que é justamente o que o cartão existe para mostrar.
            O condicional FICA: com uma área só não há o que separar, e a faixa seria um título
            sobre o nada. */}
        <div className="space-y-4">
          {grupos.map(({ area, widgets }) => (
            <div key={area}>
              {grupos.length > 1 && (
                <div className="mb-2 flex items-center gap-2">
                  <span className="shrink-0 text-[11.5px] font-semibold uppercase tracking-wide text-gray-500">
                    {AREA_LABEL[area] || area}
                  </span>
                  <span className="flex-1 border-t border-gray-200" />
                </div>
              )}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                {widgets.map((w) => {
                  const on = lista.includes(w.id);
                  return (
                    <button key={w.id} type="button" onClick={() => toggle(w.id)} aria-pressed={on}
                      className={`relative text-left rounded-[9px] border-[1.5px] p-2.5 transition
                        hover:border-gray-400 hover:shadow-sm ${
                        on ? 'border-gray-800 bg-hx-eceef1' : 'border-gray-200 bg-white opacity-60 hover:opacity-95 hover:bg-gray-50'}`}>
                      <MiniaturaWidget id={w.id} />
                      <span aria-hidden className="absolute top-4 right-4 rounded-[4px] ring-2 ring-white pointer-events-none">
                        <Checkbox size="sm" checked={on} onChange={() => {}} />
                      </span>
                      <div className="mt-2 text-[12px] leading-snug text-gray-800">{w.titulo}</div>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        <div className="flex justify-end gap-2">
          <button className="btn-secondary" onClick={onClose} disabled={saving}>Cancelar</button>
          <button className="btn-primary" onClick={salvar} disabled={saving}>Salvar</button>
        </div>
      </div>
    </Modal>
  );
}

// As duas ações do dashboard num TRILHO só, no idioma da faixa de filtros do app: fundo cinza,
// anel fino, e dentro dele o que é secundário fica quieto e o primário em grafite.
//
// Duas formas, a mesma peça:
//   cabeçalho  — com os rótulos escritos, que é onde a ação é descoberta;
//   `flutuante` — sobre os widgets depois que o cabeçalho rola para fora, só com os ícones (a
//                 palavra ali ocupa largura sobre o conteúdo sem dizer mais que o desenho).
//
// "Atualizar" não recebe `onClick` de fora: ele dispara o evento que TODO widget já ouve pelo
// `useAutoRefresh`. Não há estado central no dashboard — cada widget busca por conta própria —, e
// passar um refresh por props atravessaria dezenas de componentes para resolver um clique.
// O ícone gira enquanto houver busca em voo (contador do próprio hook), não por um tempo fixo.
export function TrilhoAcoes({ onPersonalizar, onAtualizar, atualizando = false, flutuante = false }) {
  const btn = `inline-flex items-center gap-1.5 rounded-[6px] transition-colors duration-[120ms] ${
    // 36px e não `h-9`: `h-9` é 2,25rem, que sobre a raiz de 87,5% dá 31,5 — ímpar, e num
    // `devicePixelRatio` de 1,5 cai em 47,25 pixels físicos, fora da grade. O número tem de ser
    // PAR pela mesma conta: 36 × 1,5 = 54, inteiro.
    flutuante ? 'h-[36px] w-[36px] justify-center' : 'px-3 py-1.5 text-sm font-medium'}`;
  return (
    <span className={`inline-flex items-center gap-[2px] rounded-[9px] p-[3px] ring-1 ring-inset ring-gray-300 ${
      flutuante ? 'bg-elevado shadow-[0_12px_32px_-8px_rgba(0,0,0,0.28),0_4px_12px_-4px_rgba(0,0,0,0.12)] sombra-popover' : 'bg-hx-f6f7f8'}`}>
      {/* Atualizar é SEMPRE só o ícone, inclusive no cabeçalho: a seta circular é universal, e a
          palavra ao lado do "Personalizar" fazia a faixa ter dois rótulos disputando a mesma
          atenção. Quadrado nos dois estados (28 no cabeçalho, 36 flutuando), ambos pares.
          Os dois tamanhos divergem de propósito: no cabeçalho o botão divide a faixa de 60px com o
          título, e flutuando ele é o único alvo sobre os widgets — ali 32px pediam mira. */}
      <Tooltip label={atualizando ? 'Atualizando…' : 'Recarregar os números'}>
        <button type="button" onClick={onAtualizar} aria-label="Atualizar os números"
          className={`inline-flex items-center justify-center rounded-[6px] transition-colors duration-[120ms] text-gray-600 hover:bg-gray-200 active:bg-gray-300 ${
            flutuante ? 'h-[36px] w-[36px]' : 'h-[28px] w-[28px]'}`}>
          {/* `animate-spin` só enquanto carrega, e `motion-reduce` para quem pediu menos animação:
              é a mesma regra do Spinner do app. */}
          <IconAtualizar className={`${flutuante ? 'h-[17px] w-[17px]' : 'h-[15px] w-[15px]'} ${atualizando ? 'animate-spin motion-reduce:animate-none' : ''}`} />
        </button>
      </Tooltip>
      <Tooltip label="Mover, redimensionar e escolher os widgets">
        <button type="button" onClick={onPersonalizar} aria-label="Personalizar o dashboard"
          // `inverte-no-escuro`: no modo escuro vira claro com texto escuro, como o `.btn-primary`
          // (regra no `index.css`) — no cabeçalho e no flutuante.
          className={`${btn} inverte-no-escuro bg-gray-800 font-semibold text-white hover:bg-gray-700 active:bg-gray-900`}>
          <IconGrade className={flutuante ? 'h-[19px] w-[19px]' : 'h-4 w-4'} />
          {!flutuante && 'Personalizar'}
        </button>
      </Tooltip>
    </span>
  );
}

// ---------------------------------------------------------------------------------------------
// O componente. Ele é dono do estado do grid (layout, colapso, edição) e da persistência; quem
// chama é dono do CONTEÚDO (o catálogo e o `renderWidget`).
//
// Props:
//   escopo       — 'principal' | 'comercial'. Viaja como `?dashboard=` e separa o que é salvo.
//   titulo       — o `<h1>` da faixa branca do topo.
//   catalogo     — [{ id, titulo, tabs, area, x, y, w, h, minH, minW, minPx, alturaFixa }]
//                  `minPx` é piso de largura em PIXELS, convertido para coluna com a largura viva;
//                  `alturaFixa` é o número de linhas de um conteúdo de altura exata e conhecida;
//                  `alturaMedida` liga a medição do `CardAutoAltura` para o conteúdo que reflui.
//   permitidos   — o subconjunto do catálogo que a permissão do usuário deixa ver.
//   renderWidget — (id, colunas) => nó. Separadores são tratados aqui dentro. `colunas` é a
//                  largura do item em colunas do grid, já grampeada ao breakpoint — use-a para
//                  decidir o que cabe, e nunca um limiar em pixels: 3 colunas valem 297px numa
//                  tela e 416 noutra.
//   ajustarItem  — (item, def) => item | null. Gancho de exceção de altura, aplicado POR CIMA do
//                  item já montado (com `minW`/`minPx` já resolvidos): devolve só o que quer
//                  sobrescrever, ou `null` para não mexer em nada.
//   ocultar      — (id) => bool. Esconde um widget sem tirá-lo da config. HOJE SEM CONSUMIDOR, e com
//                  uma armadilha: o RGL só entrega ao `onDragStop` os itens VISÍVEIS, então o
//                  primeiro arrasto com um item oculto salva o layout sem ele, o PUT apaga a linha e
//                  ele volta no FIM. Foi o que tirou o Alertas daqui. Antes de reusar, faça o
//                  `agendarSalvar` mesclar os ocultos no payload.
//   pronto       — enquanto false, o grid não desenha item nenhum (esperando os dados chegarem).
//   abaixo       — nó renderizado entre a faixa do título e o grid (a faixa de filtros global).
export default function GridPersonalizavel({
  escopo = 'principal', titulo, acessorio, catalogo, permitidos, renderWidget, acoes,
  ajustarItem, ocultar, pronto = true, abaixo = null, onAtualizar, atualizando = false,
}) {
  const confirmar = useConfirmacao();
  const [config, setConfig] = useState(null);
  const [personalizar, setPersonalizar] = useState(false);
  const [edicao, setEdicao] = useState(false);
  const [layout, setLayout] = useState(null);
  const [colapso, setColapso] = useState({});
  // `measureBeforeMount`: sem ele a primeira renderização usa a largura de fábrica da lib (1280) e
  // o layout NORMAL seria carregado e desenhado por um quadro numa tela que é compacta.
  const { width, containerRef, mounted } = useContainerWidth({ measureBeforeMount: true });

  // QUAL DISPOSIÇÃO VALE AGORA — ver `LARGURA_NORMAL`. A folga fica num ref: a decisão depende de
  // onde se estava, e isso não é estado de render (não precisa disparar nada sozinho).
  const tamAnterior = useRef(null);
  let tamanho = tamAnterior.current;
  if (mounted) {
    if (tamanho === 'compacto') tamanho = width >= LARGURA_NORMAL ? 'normal' : 'compacto';
    else if (tamanho === 'normal') tamanho = width < LARGURA_COMPACTO_ENTRA ? 'compacto' : 'normal';
    else tamanho = width < LARGURA_NORMAL ? 'compacto' : 'normal';
    tamAnterior.current = tamanho;
  }
  // De qual disposição o `layout` em memória veio: 'normal', 'compacto' (salva) ou 'derivado'
  // (a compacta ainda não foi salva e o que está na tela sai da normal, acomodada).
  const [origem, setOrigem] = useState(null);
  const [layoutTam, setLayoutTam] = useState(null);

  // A ALTURA QUE O CONTEÚDO PEDIU além da do grid (ver o `onFalta` do `ItemGrid`). Vale para UMA
  // largura: mudou a largura, zera, e cada card é medido de novo. Dentro da mesma largura o valor só
  // SOBE — é o que impede o vai e volta (o card cresce, o conteúdo cabe, a medida some, ele encolhe…).
  const chaveLargura = `${tamanho}:${Math.round(width)}`;
  const [faltas, setFaltas] = useState({ chave: null, px: {} });
  const reportarFalta = useCallback((idW, px) => {
    setFaltas((f) => {
      const base = f.chave === chaveLargura ? f.px : {};
      if ((base[idW] ?? 0) >= px - 0.5) return f.chave === chaveLargura ? f : { chave: chaveLargura, px: base };
      return { chave: chaveLargura, px: { ...base, [idW]: px } };
    });
  }, [chaveLargura]);

  // AS ALTURAS MEDIDAS dos cards que declaram `alturaMedida` — ver `CardAutoAltura.jsx`.
  // A guarda do meio pixel é obrigatória: o `ResizeObserver` entrega uma notificação assim que
  // observa, e sem ela essa entrega inicial vira um `setState` a cada render.
  const [alturas, setAlturas] = useState({});
  const reportarAltura = useCallback((id, px) => {
    setAlturas((a) => (Math.abs((a[id] ?? -1) - px) < 0.5 ? a : { ...a, [id]: px }));
  }, []);
  // Breakpoint derivado da largura medida (e não do onBreakpointChange, que só dispara em
  // MUDANÇAS — abrir a página já estreita deixaria o estado preso no valor inicial).
  const bp = width >= LARGURA_LG ? 'lg' : 'xs';

  // A LARGURA DE UMA COLUNA, pela fórmula do próprio RGL. É ela que permite ao catálogo declarar
  // medidas em PIXELS e o grid convertê-las para a unidade que o RGL entende.
  //
  // Sem isso, um piso declarado em colunas não quer dizer nada: medido, `w=6` vale 326px numa tela
  // de 700 e 936px numa de 1920 — o mesmo número entregando coisas incomparáveis. Como ela deriva
  // da `width` medida, os pisos acompanham o redimensionamento da JANELA sozinhos.
  const colPx = useMemo(() => {
    const cols = COLUNAS[bp] || COLUNAS.lg;
    return Math.max(1, (width - MARGEM[0] * (cols + 1) - PADDING_GRID[0] * 2) / cols);
  }, [width, bp]);

  // Largura em PIXELS de um item de `w` colunas, e o inverso: quantas colunas um piso em pixels
  // pede. O `+ MARGEM[0]` dos dois lados é o vão que existe ENTRE colunas e some na conta.
  const larguraDe = useCallback((w) => w * colPx + (w - 1) * MARGEM[0], [colPx]);
  const colunasPara = useCallback((px) => Math.min(
    COLUNAS[bp] || COLUNAS.lg,
    Math.max(1, Math.ceil((px + MARGEM[0]) / (colPx + MARGEM[0]))),
  ), [colPx, bp]);
  const timerSalvar = useRef(null);
  const snapshot = useRef(null);
  const sentinelaRef = useRef(null);
  const [cabecalhoFora, setCabecalhoFora] = useState(false);

  const qs = `?dashboard=${escopo}`;
  // As rotas de LAYOUT levam o tamanho; as de CONFIG (quais widgets) são uma só para os dois.
  const qsLayout = `${qs}${tamanho === 'compacto' ? '&tamanho=compacto' : ''}`;

  useEffect(() => {
    const el = sentinelaRef.current;
    if (!el) return undefined;
    const io = new IntersectionObserver(([e]) => setCabecalhoFora(!e.isIntersecting));
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => { api.get(`/dashboard/config${qs}`).then(setConfig).catch(() => {}); }, [qs]);

  const ativos = useMemo(() => {
    const base = Array.isArray(config?.widgets) ? config.widgets : permitidos.map((w) => w.id);
    // Separadores não estão no catálogo (não são conteúdo) — passam direto, sem checar permissão.
    return base.filter((id) => ehSeparador(id) || permitidos.some((w) => w.id === id));
  }, [config, permitidos]);
  const ativosRef = useRef(ativos);
  useEffect(() => { ativosRef.current = ativos; }, [ativos]);

  // Layout salvo → estado. Widget ligado sem linha salva entra no fim; linha salva de widget que
  // saiu (desligado ou sem permissão) é ignorada.
  //
  // NA TELA COMPACTA, a disposição salva dela vale; sem nenhuma, vale a NORMAL — que o `itensLayout`
  // acomoda na largura — e nada é gravado até o usuário mexer ali.
  const seqCarga = useRef(0);
  const carregarLayout = useCallback(async (idsAtivos, tam) => {
    const seq = ++seqCarga.current;
    const ler = async (sufixo) => {
      try { return (await api.get(`/dashboard/layout${qs}${sufixo}`)) || []; } catch { return []; }
    };
    let salvos = await ler('');
    let orig = 'normal';
    if (tam === 'compacto') {
      const comp = await ler('&tamanho=compacto');
      if (comp.length) { salvos = comp; orig = 'compacto'; } else orig = 'derivado';
    }
    if (seq !== seqCarga.current) return;
    setOrigem(orig);
    setLayoutTam(tam);
    const porId = Object.fromEntries((salvos || []).map((s) => [s.widget_id, s]));
    const colapsados = {};
    let maxY = 0;
    const itens = idsAtivos.map((id) => {
      const s = porId[id];
      const def = catalogo.find((w) => w.id === id);
      if (s) {
        if (s.colapsado) colapsados[id] = s.h_aberto ?? def?.h ?? 6;
        maxY = Math.max(maxY, s.y + s.h);
        return { i: id, x: s.x, y: s.y, w: s.w, h: s.h };
      }
      return null;
    });
    // Nenhuma linha salva = primeiro acesso: vale a disposição do catálogo.
    if (!itens.some(Boolean)) {
      setColapso({});
      setLayout(layoutPadrao(idsAtivos, catalogo));
      return;
    }
    const novos = [];
    idsAtivos.forEach((id, idx) => {
      if (itens[idx]) return;
      const def = ehSeparador(id) ? SEP_DEF : catalogo.find((w) => w.id === id);
      novos.push({ i: id, x: def?.x ?? 0, y: maxY, w: def?.w ?? 12, h: def?.h ?? 6 });
      maxY += def?.h ?? 6;
    });
    setColapso(colapsados);
    setLayout([...itens.filter(Boolean), ...novos]);
  }, [qs, catalogo]);

  // Depende da lista POR VALOR: `ativos` sai de um useMemo sobre `config`, e um `setConfig` que
  // devolve a mesma lista dispararia outra busca, cada uma sobrescrevendo o layout em memória.
  const chaveAtivos = ativos.join(',');
  useEffect(() => {
    if (!mounted || !tamanho) return;
    if (!config && layout && layoutTam === tamanho) return;
    carregarLayout(ativos, tamanho);
  }, [chaveAtivos, carregarLayout, tamanho, mounted]); // eslint-disable-line react-hooks/exhaustive-deps

  // Trocar de disposição no meio da edição encerra a edição: o retrato do Cancelar é da outra.
  useEffect(() => {
    if (edicao && snapshot.current && snapshot.current.tam !== tamanho) {
      snapshot.current = null;
      setEdicao(false);
    }
  }, [tamanho]); // eslint-disable-line react-hooks/exhaustive-deps

  // Grava o layout inteiro com debounce (um PUT por gesto, não por frame).
  // `mexeu` é o que o Cancelar consulta: sem mudança nenhuma não há o que regravar.
  const mexeu = useRef(false);
  const agendarSalvar = useCallback((itens, colapsados) => {
    mexeu.current = true;
    if (timerSalvar.current) clearTimeout(timerSalvar.current);
    timerSalvar.current = setTimeout(() => {
      const payload = itens.map((i) => ({
        widget_id: i.i, x: i.x, y: i.y, w: i.w, h: i.h,
        colapsado: colapsados[i.i] !== undefined,
        h_aberto: colapsados[i.i],
      }));
      api.put(`/dashboard/layout${qsLayout}`, { itens: payload }).catch(() => {});
      if (qsLayout.includes('tamanho=compacto')) setOrigem('compacto');
    }, 800);
  }, [qsLayout]);
  useEffect(() => () => timerSalvar.current && clearTimeout(timerSalvar.current), []);

  // Os nomes das seções viajam SEMPRE junto: o PUT grava o config inteiro, então mandar só
  // `widgets` apagaria os nomes (e vice-versa).
  const salvarConfig = async (widgets, separadores) => {
    const r = await api.put(`/dashboard/config${qs}`, {
      widgets,
      separadores: separadores ?? config?.separadores ?? {},
    });
    setConfig(r);
  };

  const renomearSeparador = (id, nome) =>
    salvarConfig(ativosRef.current, { ...(config?.separadores || {}), [id]: nome }).catch(() => {});

  const removerWidget = (id) => salvarConfig(ativos.filter((x) => x !== id)).catch(() => {});

  // Cria o separador COM POSIÇÃO: grava o layout (já com a linha nova) ANTES do config, senão o
  // `carregarLayout` o trataria como item novo e o mandaria para o fim.
  const criarSeparador = async (montarLayout) => {
    const id = proximoSeparador(ativosRef.current);
    const novoLayout = montarLayout(id);
    const lista = [...ativosRef.current, id];
    ativosRef.current = lista;
    setLayout(novoLayout);
    mexeu.current = true;
    try {
      if (timerSalvar.current) clearTimeout(timerSalvar.current);
      await api.put(`/dashboard/layout${qsLayout}`, {
        itens: novoLayout.map((i) => ({
          widget_id: i.i, x: i.x, y: i.y, w: i.w, h: i.h,
          colapsado: colapso[i.i] !== undefined, h_aberto: colapso[i.i],
        })),
      });
      await salvarConfig(lista);
    } catch { /* silencioso: o dashboard segue com o estado local */ }
  };

  const inserirSeparadorEm = (y) => criarSeparador((id) => [
    ...(layout || []).map((it) => (it.y >= y ? { ...it, y: it.y + SEP_DEF.h } : it)),
    { i: id, x: 0, y, ...SEP_DEF },
  ]);

  const soltarSeparador = (layoutSolto) => {
    if (!layoutSolto?.some((it) => it.i === SEP_DROP)) return;
    criarSeparador((id) => layoutSolto.map((it) => (
      it.i === SEP_DROP ? { i: id, x: it.x, y: it.y, ...SEP_DEF } : { i: it.i, x: it.x, y: it.y, w: it.w, h: it.h }
    )));
  };

  const alternarColapso = (id) => {
    setLayout((atual) => {
      const prox = (atual || []).map((it) => {
        if (it.i !== id) return it;
        return { ...it, h: colapso[id] !== undefined ? colapso[id] : H_COLAPSADO };
      });
      const novoColapso = { ...colapso };
      if (colapso[id] !== undefined) delete novoColapso[id];
      else novoColapso[id] = (atual || []).find((it) => it.i === id)?.h ?? 6;
      setColapso(novoColapso);
      agendarSalvar(prox, novoColapso);
      return prox;
    });
  };

  const abrirEdicao = () => {
    snapshot.current = { layout, colapso, widgets: ativos, tam: tamanho, origem };
    mexeu.current = false;
    setEdicao(true);
  };

  // Cancelar precisa GRAVAR de novo: as mudanças já foram persistidas ao longo da edição (cada
  // arraste salva com debounce), então desfazer é regravar o retrato.
  const cancelarEdicao = async () => {
    const snap = snapshot.current;
    setEdicao(false);
    if (!snap) return;
    if (timerSalvar.current) clearTimeout(timerSalvar.current);
    setLayout(snap.layout);
    setColapso(snap.colapso);
    try {
      const mudouWidgets = snap.widgets.length !== ativos.length || snap.widgets.some((id, i) => id !== ativos[i]);
      if (mudouWidgets) await salvarConfig(snap.widgets);
      // Só regrava se algo mudou. Antes regravava SEMPRE, e numa tela menor isso gravava a
      // disposição já alargada por cima da salva — sem o usuário ter mexido em nada.
      if (!mexeu.current) return;
      // A compacta que ainda não existia volta a não existir.
      if (snap.origem === 'derivado') {
        await api.del(`/dashboard/layout${qsLayout}`);
        setOrigem('derivado');
        return;
      }
      if (snap.layout) {
        await api.put(`/dashboard/layout${qsLayout}`, {
          itens: snap.layout.map((i) => ({
            widget_id: i.i, x: i.x, y: i.y, w: i.w, h: i.h,
            colapsado: snap.colapso[i.i] !== undefined,
            h_aberto: snap.colapso[i.i],
          })),
        });
      }
    } catch { /* silencioso: o estado em memória já voltou ao retrato */ }
  };

  const restaurarPadrao = async () => {
    // NA TELA COMPACTA, restaurar é descartar só a disposição compacta: ela volta a sair da normal.
    // A lista de widgets e a disposição da tela grande ficam como estão.
    if (tamanho === 'compacto') {
      if (!await confirmar({
        titulo: 'Restaurar a disposição desta tela?',
        texto: 'A disposição da tela compacta será descartada e voltará a seguir a da tela grande, reorganizada para caber.',
        confirmar: 'Restaurar',
      })) return;
      if (timerSalvar.current) clearTimeout(timerSalvar.current);
      try {
        await api.del(`/dashboard/layout${qsLayout}`);
        mexeu.current = true;
        await carregarLayout(ativos, tamanho);
      } catch { /* silencioso */ }
      return;
    }
    if (!await confirmar({
      titulo: 'Restaurar o dashboard padrão?',
      texto: 'Sua disposição atual será descartada.',
      confirmar: 'Restaurar',
    })) return;
    if (timerSalvar.current) clearTimeout(timerSalvar.current);
    mexeu.current = true;
    try {
      await api.del(`/dashboard/layout${qsLayout}`);
      const r = await api.put(`/dashboard/config${qs}`, { widgets: permitidos.map((w) => w.id) });
      setConfig(r);
      setColapso({});
      setLayout(layoutPadrao(permitidos.map((w) => w.id), catalogo));
    } catch { /* silencioso: o dashboard segue com o layout em memória */ }
  };

  const visiveis = useMemo(() => {
    if (!pronto || !layout) return [];
    const comLinha = new Set(layout.map((it) => it.i));
    return ativos.filter((id) => !ocultar?.(id) && comLinha.has(id));
  }, [pronto, layout, ativos, ocultar]);

  // `useMemo`: o RGL sincroniza o estado interno quando o `layouts` muda e, com um array novo a
  // cada render, isso vira trabalho a cada ciclo (e realimenta o `onLayoutChange`).
  const itensLayout = useMemo(() => {
    const montados = (layout || []).filter((it) => visiveis.includes(it.i)).map((it) => {
      const def = ehSeparador(it.i) ? SEP_DEF : catalogo.find((w) => w.id === it.i);
      if (colapso[it.i] !== undefined) return { ...it, minH: H_COLAPSADO };
      // O PISO DE LARGURA vem em PIXELS (`minPx`) e vira coluna aqui — ver a nota do `colPx`. O
      // `minW` do catálogo continua valendo para quem quiser cravar em coluna, e **os dois passam
      // a ser repassados ao RGL**: até aqui o `minW` estava documentado no contrato e era ignorado,
      // então dava para arrastar qualquer widget até uma coluna.
      const minW = def?.minPx ? colunasPara(def.minPx) : def?.minW;
      // O `minW` vai ao RGL E é aplicado à largura JÁ SALVA. O RGL só respeita o `minW` durante o
      // ARRASTO: um layout gravado antes do piso existir (ou gravado num viewport largo, onde a
      // mesma coluna vale mais pixels) continuaria estreito para sempre. Medido na página: com o
      // piso em 200px, dois cards estavam salvos com 149px e o RGL não os corrigia.
      const comMinW = minW
        ? { minW: Math.min(minW, COLUNAS[bp] || COLUNAS.lg), w: Math.max(it.w, minW) }
        : null;

      // O GANCHO DAS EXCEÇÕES roda POR CIMA do item já montado, e não no lugar dele. Ele já foi um
      // `return` antecipado logo no começo — o que fazia quem o usasse perder tudo o que vem
      // abaixo, `minPx`/`minW` inclusive, e ter de reimplementar o piso de largura à mão (o
      // `lembrete` do dashboard principal crava um `minW: 5` justamente por isso). Recebendo o item
      // pronto, ele sobrescreve só o que quer: o `lembrete` continua idêntico (não tem `minPx`,
      // então não havia o que preservar) e o Dashboard Comercial passa a poder mexer só na ALTURA
      // dos painéis de barras sem abrir mão do `minPx` que eles declaram.
      const comAjuste = (item) => ajustarItem?.(item, def) || item;

      // `alturaMedida`: a altura sai do CONTEÚDO, medido pelo `CardAutoAltura` — ver a nota de lá
      // sobre por que medir e não prever. Vale para o conteúdo que REFLUI (a `GradeNumeros` dos
      // cards de KPI reparte os números em mais linhas ao estreitar), e é o OPOSTO do que os
      // gráficos precisam: aqueles não podem refluir e ganham piso de largura (`minPx`).
      //
      // Enquanto a medida não chega vale o `h` salvo, e não há flash: a primeira medição acontece
      // no efeito do mesmo commit. Os 2px somados são a borda do `.card`, que fica FORA do
      // elemento medido (o padding fica dentro, de propósito).
      const medida = () => {
        const px = alturas[it.i];
        if (px == null) return { ...it, ...comMinW, resizeHandles: ['e'] };
        const alt = Math.max(1, Math.ceil((px + 2 + MARGEM[1]) / (LINHA_PX + MARGEM[1])));
        return { ...it, ...comMinW, h: alt, minH: alt, maxH: alt, resizeHandles: ['e'] };
      };
      if (def?.alturaMedida) return comAjuste(medida());
      // `alturaFixa`: o conteúdo tem altura EXATA e conhecida (as linhas de Custos e da
      // Engenharia), e qualquer outro valor gera sobra ou rolagem. Trava h/minH/maxH e deixa só a
      // alça leste — a largura continua do usuário.
      // A conta só vale na largura para a qual foi feita: numa coluna estreita o cabeçalho quebra
      // em duas linhas e as raias passavam 23px do fundo (medido a 640px). O `comFalta` cobre isso.
      if (def?.alturaFixa) {
        return comFalta(comAjuste({ ...it, ...comMinW, h: def.alturaFixa, minH: def.alturaFixa, maxH: def.alturaFixa, resizeHandles: ['e'] }));
      }
      // Nos demais, o minH é piso para quem encolher daqui pra frente — não licença para esticar
      // (e persistir) um widget que o usuário já deixou menor.
      const base = comAjuste({ ...it, ...comMinW, minH: Math.min(def?.minH ?? 6, it.h) });
      return comFalta(base);
    });
    // A ALTURA QUE FALTOU (`faltas`) sobe o item só nesta largura — ver o `onFalta` do `ItemGrid`.
    // Vem DEPOIS do gancho, que crava teto nos painéis de barras: aqui o teto acompanha.
    function comFalta(item) {
      const px = faltas.chave === chaveLargura ? faltas.px[item.i] : undefined;
      if (px == null) return item;
      const alt = Math.ceil((px + 2 + MARGEM[1]) / (LINHA_PX + MARGEM[1]));
      if (alt <= item.h) return item;
      return { ...item, h: alt, minH: Math.max(item.minH ?? 1, alt), maxH: item.maxH != null ? Math.max(item.maxH, alt) : undefined };
    }
    // OS CARDS DE ALTURA MEDIDA QUE DIVIDEM UMA LINHA FICAM DA MESMA ALTURA — a maior entre eles.
    // Numa tela estreita cada um reflui de um jeito (o "Interno × exterior" pedia 4 linhas contra 3
    // dos vizinhos) e o degrau abria um vão de várias linhas ao lado do card de baixo. Iguais, a
    // linha fecha reta, que é também o que se espera ver numa faixa de números.
    const cols = COLUNAS[bp] || COLUNAS.lg;
    if (cols > 1) {
      const medidosPorLinha = new Map();
      for (const it of montados) {
        const def = catalogo.find((w) => w.id === it.i);
        if (!def?.alturaMedida || colapso[it.i] !== undefined || alturas[it.i] == null) continue;
        medidosPorLinha.set(it.y, Math.max(medidosPorLinha.get(it.y) ?? 0, it.h));
      }
      for (let k = 0; k < montados.length; k += 1) {
        const it = montados[k];
        const alvo = medidosPorLinha.get(it.y);
        const def = catalogo.find((w) => w.id === it.i);
        if (alvo == null || !def?.alturaMedida || colapso[it.i] !== undefined || it.h >= alvo) continue;
        montados[k] = { ...it, h: alvo, minH: alvo, maxH: alvo };
      }
    }
    // Na coluna única não há o que acomodar (e o grid nem é desenhado — ver a pilha lá embaixo).
    const acomodados = cols > 1 ? acomodar(montados, (it) => it.minW) : montados;
    return compactadorVertical.compact(acomodados, COLUNAS.lg);
  }, [layout, visiveis, colapso, catalogo, ajustarItem, colunasPara, larguraDe, bp, alturas, faltas, chaveLargura]);

  // Só o `lg` é fornecido: o `xs` (1 coluna) fica por conta do RGL — fornecê-lo fazia o grid
  // empilhar tudo mesmo em telas largas.
  const layouts = useMemo(() => ({ lg: itensLayout }), [itensLayout]);

  // A LARGURA DE CADA ITEM EM COLUNAS, para o `renderWidget` repassar a quem precisa decidir o
  // que cabe. Coluna e não PIXEL: quantos pixels valem 3 colunas depende da tela (medido — 297px
  // num container de 1268 contra 416 num de 1740), então um limiar em pixels nunca separa "3
  // blocos" de "4 blocos". O caso que pediu isto é o eixo X do Dashboard Comercial, que abrevia o
  // ano a partir de 3 colunas.
  //
  // GRAMPEADO AO BREAKPOINT, e isso não é detalhe: como só o `lg` é fornecido (ver acima), num
  // `xs` de 1 coluna o item continuaria dizendo `w: 5` enquanto ocupa a tela inteira — e o widget
  // se acharia largo justamente onde há menos espaço.
  const colunasDe = useMemo(() => {
    const teto = COLUNAS[bp] || COLUNAS.lg;
    const m = {};
    for (const it of itensLayout) m[it.i] = Math.min(it.w, teto);
    return m;
  }, [itensLayout, bp]);
  const arrastavel = edicao && bp === 'lg';
  // O RGL guarda estas props em `useMemo`/efeitos internos: passar objeto literal no JSX faz a
  // dependência mudar a CADA render e o grid re-sincronizar em laço ("Maximum update depth", que
  // era o dashboard "tremendo" no carregamento).
  const dragConfig = useMemo(() => ({ enabled: arrastavel, handle: '.dash-drag' }), [arrastavel]);
  const resizeConfig = useMemo(() => ({ enabled: arrastavel }), [arrastavel]);
  const dropConfig = useMemo(() => ({ enabled: arrastavel, defaultItem: { w: 12, h: SEP_DEF.h } }), [arrastavel]);
  const droppingItem = useMemo(() => ({ i: SEP_DROP, w: 12, h: SEP_DEF.h }), []);

  // O QUE O RGL CALCULA SÓ VIRA ESTADO DURANTE UM GESTO DO USUÁRIO (16/09/2026). Antes todo
  // `onLayoutChange` era aceito — inclusive os que o RGL dispara sozinho ao sincronizar, ao
  // compactar e ao trocar de breakpoint. Dois defeitos saíam daí: (1) encolher a janela até a coluna
  // única e voltar deixava o grid num laço, com o layout de uma coluna aceito como o de doze, o piso
  // de largura realargando e o RGL compactando de novo — medido, 69 mudanças de posição em 2 segundos
  // e os cards todos à esquerda; (2) numa tela menor, o layout alargado virava estado e a próxima
  // gravação (minimizar, Cancelar) o persistia por cima do salvo. Fora do gesto, o grid recebe sempre
  // o layout salvo + a acomodação, recalculada a cada render.
  const gesto = useRef(false);
  const aoComecar = useCallback(() => { gesto.current = true; }, []);
  const aoMudarLayout = useCallback((l) => {
    if (!gesto.current || bp !== 'lg' || l.some((it) => it.i === SEP_DROP)) return;
    setLayout((prev) => (mesmoLayout(prev, l) ? prev : soPosicao(l)));
  }, [bp]);
  const aoParar = useCallback((l) => {
    gesto.current = false;
    if (bp !== 'lg') return;
    const limpo = soPosicao(l);
    setLayout((prev) => (mesmoLayout(prev, limpo) ? prev : limpo));
    agendarSalvar(limpo, colapso);
  }, [bp, agendarSalvar, colapso]);
  const soltarRef = useRef(soltarSeparador);
  soltarRef.current = soltarSeparador;
  const aoSoltar = useCallback((l) => soltarRef.current(l), []);

  const linhasMalha = itensLayout.reduce((max, it) => Math.max(max, it.y + it.h), 0) + 4;
  const vaos = useMemo(() => {
    if (!arrastavel || !itensLayout.length) return [];
    const fim = itensLayout.reduce((max, it) => Math.max(max, it.y + it.h), 0);
    const candidatos = [...new Set([...itensLayout.map((it) => it.y), fim])].filter((y) => y > 0).sort((a, b) => a - b);
    return candidatos.filter((y) => itensLayout.every((it) => it.y >= y || it.y + it.h <= y));
  }, [itensLayout, arrastavel]);

  return (
    <div className="space-y-4 pb-10">
      <CabecalhoPagina titulo={titulo} acessorio={acessorio}
        acoes={!edicao && (
          <>
            {acoes}
            <TrilhoAcoes onPersonalizar={abrirEdicao} onAtualizar={onAtualizar} atualizando={atualizando} />
          </>
        )} />
      <div ref={sentinelaRef} className="h-px" aria-hidden="true" />

      {abaixo}

      {/* Gêmeo flutuante do trilho do topo, para quem já rolou a página. */}
      {!edicao && cabecalhoFora && (
        <div className="fixed bottom-6 right-6 z-30 animate-flutuante-in motion-reduce:animate-none">
          <TrilhoAcoes flutuante onPersonalizar={abrirEdicao} onAtualizar={onAtualizar} atualizando={atualizando} />
        </div>
      )}

      {edicao && <BarraEdicao estreito={bp !== 'lg'} compacto={tamanho === 'compacto'} onWidgets={() => setPersonalizar(true)}
        onSeparador={() => inserirSeparadorEm(0)} onRestaurar={restaurarPadrao}
        onCancelar={cancelarEdicao} onConcluir={() => setEdicao(false)} />}

      {/* Container SEMPRE montado (mesmo carregando): é o que o `useContainerWidth` mede.

          O `minHeight` do modo de edição RESERVA a altura da malha, e não é cosmético: a malha é
          `absolute`, então não empurra ninguém em fluxo — ela vira *scrollable overflow*. Como ela
          desenha 4 linhas a mais que o grid, sobravam ~264px transbordando, e o primeiro ancestral
          rolável é o `<main>` do Layout: entrar em Personalizar abria uma SEGUNDA barra de rolagem. */}
      <div ref={containerRef} className={`relative ${edicao ? 'dash-edicao' : ''}`}
        style={edicao && bp === 'lg'
          ? { minHeight: linhasMalha * LINHA_PX + (linhasMalha - 1) * MARGEM[1] }
          : undefined}>
        {/* Malha de células no modo edição: mesma métrica do RGL (12 colunas, LINHA_PX, MARGEM),
            então os blocos coincidem com o encaixe real. Fica ATRÁS dos widgets (que são opacos),
            o que deixa visível só o espaço livre — inclusive abaixo do último. */}
        {edicao && bp === 'lg' && (
          <div aria-hidden className="absolute inset-x-0 top-0 pointer-events-none z-0 grid grid-cols-12"
            style={{ gap: `${MARGEM[1]}px ${MARGEM[0]}px`, gridAutoRows: `${LINHA_PX}px` }}>
            {Array.from({ length: 12 * linhasMalha }).map((_, i) => (
              <div key={i} className="rounded-md bg-hx-e4e6ea" />
            ))}
          </div>
        )}
        {/* Faixas de inserção nos vãos: invisíveis em repouso, no hover viram um filete tracejado
            com "+ Separador". Ficam ACIMA do grid (z-20) mas ocupam só a calha entre as linhas. */}
        {vaos.map((y) => (
          <button key={`vao-${y}`} type="button" onClick={() => inserirSeparadorEm(y)}
            title="Inserir separador aqui"
            className="group absolute left-0 right-0 z-20 flex items-center justify-center"
            style={{ top: y * (LINHA_PX + MARGEM[1]) - MARGEM[1], height: MARGEM[1] }}>
            <span className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 border-t border-dashed border-gray-400 opacity-0 group-hover:opacity-100 transition" />
            <span className="relative rounded-full border border-gray-300 bg-white px-2 py-[1px] text-[10px] font-bold uppercase tracking-wide text-gray-500 opacity-0 group-hover:opacity-100 transition whitespace-nowrap shadow-sm">
              + Separador
            </span>
          </button>
        ))}
        {!pronto ? <PageLoading /> : visiveis.length === 0 ? (
          <div className="card p-8 text-center text-gray-500 text-sm">
            Nenhum bloco ativo. Clique em <strong>Personalizar</strong> para montar a sua visão geral.
          </div>
        ) : mounted && layout && bp !== 'lg' ? (
          // A COLUNA ÚNICA É UMA PILHA SIMPLES, e não o RGL de uma coluna (16/09/2026). O RGL
          // mantinha ali o `h` da tela larga, e o card que ficava mais alto por empilhar o próprio
          // conteúdo saía pelo fundo. Aqui cada card tem a altura do layout, sobe o que faltar
          // (`faltas`) e segue a ordem de leitura. Arrastar já não existia neste tamanho.
          <CtxAltura.Provider value={reportarAltura}>
            <div className="relative z-10 flex flex-col" style={{ gap: MARGEM[1] }}>
              {[...itensLayout].sort((a, b) => a.y - b.y || a.x - b.x).map((it) => {
                const def = catalogo.find((w) => w.id === it.i);
                return (
                  <div key={it.i} style={{ height: it.h * (LINHA_PX + MARGEM[1]) - MARGEM[1] }}>
                    <ItemGrid
                      id={it.i}
                      onFalta={reportarFalta}
                      titulo={ehSeparador(it.i) ? (config?.separadores?.[it.i] || 'Separador') : (def?.titulo || it.i)}
                      edicao={edicao}
                      colapsado={colapso[it.i] !== undefined}
                      onToggleColapso={() => alternarColapso(it.i)}
                      onRemover={() => removerWidget(it.i)}
                      separador={ehSeparador(it.i)}
                      nome={config?.separadores?.[it.i]}
                      onRenomear={(v) => renomearSeparador(it.i, v)}
                      crescer={!!def?.alturaMedida}
                      pilha
                    >
                      {ehSeparador(it.i) ? <Separador nome={config?.separadores?.[it.i]} /> : renderWidget(it.i, colunasDe[it.i])}
                    </ItemGrid>
                  </div>
                );
              })}
            </div>
          </CtxAltura.Provider>
        ) : mounted && layout && (
          // O provider do reporte de altura envolve o grid inteiro: quem mede é o conteúdo de cada
          // card, e quem converte px em linha é o `itensLayout` aqui em cima.
          <CtxAltura.Provider value={reportarAltura}>
          <ResponsiveGridLayout
            className="relative z-10"
            width={width}
            breakpoints={BREAKPOINTS}
            cols={COLUNAS}
            layouts={layouts}
            rowHeight={LINHA_PX}
            margin={MARGEM}
            containerPadding={PADDING_GRID}
            // Configs MEMOIZADAS (ver os useMemo acima): o RGL as usa como dependência dos
            // próprios efeitos, então objeto literal aqui = dependência nova a cada render = laço.
            dragConfig={dragConfig}
            resizeConfig={resizeConfig}
            dropConfig={dropConfig}
            droppingItem={droppingItem}
            onDrop={aoSoltar}
            onLayoutChange={aoMudarLayout}
            onDragStart={aoComecar}
            onResizeStart={aoComecar}
            onDragStop={aoParar}
            onResizeStop={aoParar}
          >
            {visiveis.map((id) => {
              const def = catalogo.find((w) => w.id === id);
              return (
              // `dash-cresce` dá `z-index` fixo ao item de altura medida — ver a regra no
              // `index.css`. O RGL mescla a `className` do filho na do `.react-grid-item`.
              <div key={id} className={def?.alturaMedida ? 'dash-cresce' : undefined}>
                <ItemGrid
                  id={id}
                  onFalta={reportarFalta}
                  titulo={ehSeparador(id) ? (config?.separadores?.[id] || 'Separador') : (def?.titulo || id)}
                  edicao={edicao}
                  colapsado={colapso[id] !== undefined}
                  onToggleColapso={() => alternarColapso(id)}
                  onRemover={() => removerWidget(id)}
                  separador={ehSeparador(id)}
                  nome={config?.separadores?.[id]}
                  onRenomear={(v) => renomearSeparador(id, v)}
                  crescer={!!def?.alturaMedida}
                >
                  {/* O segundo argumento é a largura em COLUNAS — ver `colunasDe`. Quem não precisa
                      dele simplesmente o ignora, que é o caso dos 14 widgets do dashboard principal. */}
                  {ehSeparador(id) ? <Separador nome={config?.separadores?.[id]} /> : renderWidget(id, colunasDe[id])}
                </ItemGrid>
              </div>
              );
            })}
          </ResponsiveGridLayout>
          </CtxAltura.Provider>
        )}
      </div>
      <PersonalizarModal open={personalizar} onClose={() => setPersonalizar(false)}
        permitidos={permitidos} ativos={ativos}
        onSalvar={(lista) => salvarConfig(lista)} />
    </div>
  );
}
