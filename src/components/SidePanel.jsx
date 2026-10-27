import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { lsGet, lsSet } from '../lib/storage.js';
import useEscape from '../lib/useEscape.js';
import useTravarRolagem from '../lib/travarRolagem.js';
import Tooltip from './Tooltip.jsx';

// Painel lateral que desliza da direita. Fecha com Escape ou clique no backdrop.
// `largura` = largura da COLUNA PRINCIPAL (ficha), ajustável arrastando a borda esquerda entre
// minWidth/maxWidth e persistida. É ela que tem o mínimo — nunca fica cramped.
// sideWidth: largura da coluna lateral opcional (ex.: discussão/comentários de 510px) quando
// VISÍVEL; 0 quando recolhida. O painel = ficha + sideWidth, então recolher a lateral encolhe o
// painel em sideWidth px SEM mexer na largura da ficha (ela "acompanha", fica igual).
// portal: renderiza no document.body (evita que o `fixed` se ancore num ancestral com
// overflow/scroll — Engenharia usa; Custos NÃO, pois depende do zoom do wrapper ancestral).
// nivel: camada de z-INDEX, e só. Ele já foi TAMBÉM a chave de prioridade do Escape, num `Set`
// de módulo daqui — que só conhecia `SidePanel`s (o `Modal` nunca se inscrevia nele) e ainda
// EMPATAVA entre dois painéis do mesmo nível, fechando os dois. Hoje quem responde pela tecla é a
// pilha compartilhada de `lib/useEscape.js`, por ordem de abertura.
// nivel: 1 (padrão) = backdrop z-40 / painel z-50. 2 = backdrop z-[52] /
// painel z-[54] — para um SidePanel ANINHADO dentro de outro (ex.: "Ver grupo"/"Ver todos" abertos
// de dentro do painel da Fila): fica ACIMA do painel principal (z-50), então o backdrop escurece
// por cima dele, e ainda ABAIXO dos modais (z-[60]) e do menu de ações (z-[56]).
// flutuante: variante "cartão flutuante" (12px de margem nos 3 lados + cantos de 12px), em vez de
// colado nas bordas. Opt-in — os painéis de DETALHE (Ficha, CustoDetalhe, ProjetoDetalhe,
// Notificações) continuam colados, ocupando a tela toda; só os painéis de LISTA curta (Ver grupo,
// Ver todos, as raias do dashboard) é que ganham o ar de "ilha" sobre o conteúdo.
// centralizado: variante JANELA NO MEIO DA TELA (01/10/2026, pedida para as "Revisões no ERP", que
// têm duas colunas e uma tabela larga): a largura da tela com 24px de margem em volta, até 1.720px
// (desde 19/10/2026; antes, 90% até 1.600px), e entra com fade + leve zoom em vez de deslizar. Sem alça de redimensionar — a largura acompanha a
// tela —, então minWidth/maxWidth/storageKey/sideWidth não valem nela.

export default function SidePanel({ open, onClose, children, minWidth = 420, maxWidth = 620, storageKey = 'painel_largura', sideWidth = 0, portal = false, nivel = 1, flutuante = false, centralizado = false }) {
  const zBackdrop = nivel >= 2 ? 'z-[52]' : 'z-40';
  const zPainel = nivel >= 2 ? 'z-[54]' : 'z-50';
  const clampW = (n) => Math.min(maxWidth, Math.max(minWidth, n || Math.round((minWidth + maxWidth) / 2)));
  const ref = useRef(null);
  const [largura, setLargura] = useState(() => clampW(Number(lsGet(storageKey))));
  const [arrastando, setArrastando] = useState(false);

  // `open` e não a montagem: este painel NUNCA desmonta, só translada — inscrever no mount o
  // deixaria na pilha para sempre.
  useEscape(open, onClose);
  // A página atrás do véu não rola com o painel aberto (05/10/2026) — mesma chave `open`, pelo
  // mesmo motivo. O contador é o do `Modal`: um modal aberto por cima não destrava ao fechar.
  useTravarRolagem(open);

  // Arrasta a borda esquerda. Cresce ao arrastar para a esquerda; divide pelo zoom
  // efetivo do wrapper (hoje 1; medido dinamicamente) para o movimento ser 1:1.
  const iniciarArraste = (e) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = largura;
    const el = ref.current;
    const zoom = el ? el.getBoundingClientRect().width / el.offsetWidth : 1;
    let ultima = startW;
    setArrastando(true);
    document.body.style.userSelect = 'none';
    const onMove = (ev) => { ultima = clampW(startW - (ev.clientX - startX) / zoom); setLargura(ultima); };
    const onUp = () => {
      setArrastando(false);
      document.body.style.userSelect = '';
      lsSet(storageKey, String(ultima));
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  const conteudo = (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 ${zBackdrop} bg-veu/30 transition-opacity duration-300 ${open ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={onClose}
      />
      {/* Painel. A sombra é condicional ao `open`: fechado, ele só sai de vista por translate, e o
          borrão do shadow-2xl (blur 50, spread -12) transbordava ~13px de volta PARA DENTRO da
          tela, aparecendo como um vulto escuro na lateral. `pointer-events-none` fechado protege a
          alça de redimensionamento abaixo, que fica encostada na borda direita da janela.
          Nada de invisible/hidden aqui: cortaria a animação de saída.
          `flutuante`: px arbitrário (`top-[12px]`) e não `top-3`, porque a margem tem de valer 12px
          de verdade — os `-3`/`-4` do Tailwind são em rem, e encolhem com o `font-size: 87.5%` do
          app. `overflow-hidden` entra junto: sem ele, o cabeçalho e a lista (que têm cantos retos)
          vazavam por cima do arredondado do cartão. A borda `gray-300` é o mesmo cinza da linha do
          cabeçalho e dos cards da lista — flutuando sobre conteúdo, sem contorno o cartão dependia
          só da sombra pra se separar do que está atrás.
          FECHADO, o `flutuante` precisa de `calc(100% + 12px)` e NÃO de `translate-x-full`: o
          `full` desloca exatamente a largura do painel, o que basta quando ele está em `right-0`,
          mas com a margem de 12px ele para 12px antes de sair da tela — e sobrava uma fatia do
          painel (borda e canto arredondado) sempre visível encostada na borda direita. */}
      {centralizado ? (
        // `inset-x-0 mx-auto` com a largura fixa centraliza sem `translate`, que fica livre para o zoom
        // de entrada. Margens em px pelo mesmo motivo do `flutuante` (o rem do app é 87,5%).
        // A LARGURA (19/10/2026, a pedido, em dois tempos): era 90% até 1.600px e sobrava tela dos dois
        // lados; foi à tela inteira menos 24px de cada lado ("ocupar mais espaço") e ficou larga demais
        // numa tela de 1.900px. Agora: a tela menos 24px de cada lado, até 1.720px.
        <div
          ref={ref}
          style={{ width: 'min(calc(100% - 48px), 1720px)' }}
          className={`fixed ${zPainel} inset-x-0 mx-auto top-[24px] bottom-[24px] bg-white flex flex-col rounded-[12px] border border-gray-300 overflow-hidden transition duration-200 ${
            open ? 'opacity-100 scale-100 shadow-2xl' : 'opacity-0 scale-[0.98] pointer-events-none'}`}
        >
          {children}
        </div>
      ) : (
        <div
          ref={ref}
          style={{ width: clampW(largura) + sideWidth, maxWidth: `max(95vw, ${minWidth + sideWidth}px)` }}
          className={`fixed ${zPainel} bg-white flex flex-col transform ${arrastando ? '' : 'transition-transform duration-300'} ${
            flutuante ? 'top-[12px] bottom-[12px] right-[12px] rounded-[12px] border border-gray-300 overflow-hidden' : 'inset-y-0 right-0'} ${
            open ? 'translate-x-0 shadow-2xl'
              : `pointer-events-none ${flutuante ? 'translate-x-[calc(100%+12px)]' : 'translate-x-full'}`}`}
        >
          {/* Alça de redimensionamento (borda esquerda) */}
          <Tooltip label="Arraste para ajustar a largura (duplo clique para o máximo)">
            <div onMouseDown={iniciarArraste} onDoubleClick={() => { setLargura(maxWidth); lsSet(storageKey, String(maxWidth)); }}
              className="absolute top-0 left-0 z-10 h-full w-1.5 cursor-col-resize hover:bg-brand-400/50" />
          </Tooltip>
          {children}
        </div>
      )}
    </>
  );

  return portal && typeof document !== 'undefined' ? createPortal(conteudo, document.body) : conteudo;
}
