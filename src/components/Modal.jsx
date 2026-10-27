import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import useEscape from '../lib/useEscape.js';
import useTravarRolagem from '../lib/travarRolagem.js';
import Tooltip from './Tooltip.jsx';

// Quanto o modal fica no ar depois de fechado, só para a animação de saída acontecer. Tem de bater
// com a duração do `modal-out`/`backdrop-out` (tailwind.config.js): mais curto aqui corta a
// animação no meio, mais longo deixa uma caixa invisível segurando o clique.
const SAIDA_MS = 130;

// X do fechar: o mesmo traço da ficha "Visualizar" (FilaPainel), no lugar do "×" tipográfico.
const IconX = ({ className = 'h-[15px] w-[15px]' }) => (
  <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

// `aside`: conteúdo renderizado FORA da caixa branca, ao lado dela (irmão num flex), com
// espaço entre os dois — usado pelo painel de contatos do Novo envio. Fica de fora do card
// de propósito: é apoio à decisão, não campo do formulário.
//
// `alturaCheia`: variante "tela ampliada" (widgets do Dashboard) — a caixa tem altura fixa (prop
// `altura`) e o corpo rola por dentro (em vez de o backdrop inteiro rolar). Sem isso o cabeçalho e o rodapé de paginação subiriam junto com o conteúdo.
// `fecharNoBackdrop`: clique fora fecha. Opt-in porque nos formulários isso descartaria digitação.
// `subtitulo` e `acoes`: linha de apoio abaixo do título e botões à esquerda do ×.
// `z`: camada. O padrão z-[60] fica acima do painel lateral (z-50); a tela ampliada usa um valor
// MENOR (z-[35]) justamente para a ficha lateral poder abrir por cima dela.
// `padding` / `paddingCabecalho`: respiro interno — a tela ampliada pede mais que um formulário.
// `animarTamanho`: anima a troca de `maxWidth`/`altura` em vez de saltar. Opt-in porque só a tela
// ampliada muda de tamanho em uso (1º → 2º nível); nos formulários não haveria o que animar.
export default function Modal({
  open, onClose, title, children, maxWidth = 'max-w-lg', aside,
  alturaCheia = false, fecharNoBackdrop = false, subtitulo = null, acoes = null,
  z = 'z-[60]', altura = 'h-full', padding = 'p-5', paddingCabecalho = 'px-5 py-3',
  animarTamanho = false,
}) {
  // O modal continua MONTADO por mais `SAIDA_MS` depois de fechado — é o que dá tempo de a saída
  // acontecer. Antes era `if (!open) return null` seco: a caixa sumia do DOM no mesmo quadro do
  // clique e não havia o que animar.
  const [visivel, setVisivel] = useState(open);
  const [saindo, setSaindo] = useState(false);
  useEffect(() => {
    if (open) { setVisivel(true); setSaindo(false); return undefined; }
    if (!visivel) return undefined;
    setSaindo(true);
    const t = setTimeout(() => { setVisivel(false); setSaindo(false); }, SAIDA_MS);
    return () => clearTimeout(t);
  }, [open, visivel]);

  // O Escape fecha só a camada de CIMA, e quem decide isso é a pilha compartilhada — não este
  // componente. Ele já teve listener próprio em `window`, e como o `SidePanel` tinha outro no
  // mesmo alvo, um Escape fechava os dois: entre listeners do mesmo alvo quem manda é a ordem de
  // inscrição, e o painel sempre abre primeiro. Ver `lib/useEscape.js`.
  useEscape(open, onClose);

  // A página atrás não rola enquanto o modal está aberto — em TODAS as variantes desde 05/10/2026
  // (antes só a tela ampliada travava, e a rolagem dos formulários vazava para a tabela de trás).
  // Contador compartilhado com o `SidePanel`: ver `lib/travarRolagem.js`.
  useTravarRolagem(open);

  if (!visivel) return null;

  // Portal para o body: escapa o `transform` de um SidePanel ancestral (que prenderia o
  // `fixed`) e o z-[60] padrão mantém o modal acima do painel lateral (z-50). Toasts em z-[70].
  return createPortal(
    <div
      // `motion-reduce:animate-none` nas duas pontas: quem pede menos movimento no sistema continua
      // com o fechamento seco de antes (a caixa some sem percurso), e a espera de 130ms passa a ser
      // só um atraso invisível.
      className={`fixed inset-0 ${z} flex justify-center bg-veu/40 p-4 motion-reduce:animate-none ${
        saindo ? 'animate-backdrop-out' : 'animate-backdrop-in'} ${
        alturaCheia ? 'items-center overflow-hidden' : 'items-start overflow-y-auto overscroll-contain'}`}
      // Enquanto sai, a caixa não recebe mais clique: ela ainda está na tela, e um clique no
      // backdrop durante a saída chamaria `onClose` de novo.
      style={saindo ? { pointerEvents: 'none' } : undefined}
      onMouseDown={fecharNoBackdrop && !saindo ? (e) => { if (e.target === e.currentTarget) onClose(); } : undefined}
    >
      {/* Wrapper flex: em tela larga o aside fica ao LADO da caixa; abaixo de xl ele desce
          para baixo (flex-col), para não espremer nem cortar em notebook pequeno.
          O wrapper fica `w-full` SEMPRE (centralizando por justify-center no xl): se ele
          virasse w-auto, o `w-full` da caixa perderia a referência e o modal encolheria
          para a largura do conteúdo — o max-w viraria teto inalcançável. */}
      <div className={`flex w-full flex-col items-center gap-3.5 xl:flex-row xl:justify-center ${
        alturaCheia ? 'my-0 h-full xl:items-center' : 'my-8 xl:items-start'}`}>
        {/* As duas pontas de `maxWidth`/`altura` são comprimentos calculáveis
            (min(1280px,95vw) → 96vw; 84vh → 94vh), então `max-width`/`height` interpolam de
            verdade — não é preciso medir nada em JS. */}
        <div className={`card w-full ${maxWidth} motion-reduce:animate-none ${
          saindo ? 'animate-modal-out' : 'animate-modal-in'} ${alturaCheia ? `${altura} flex flex-col min-h-0` : ''} ${
          animarTamanho ? 'transition-[max-width,height] duration-300 ease-out motion-reduce:transition-none' : ''}`}
          role="dialog" aria-modal="true" aria-label={title}>
          {/* `border-gray-100` e não `gray-200`: é a MESMA divisória do painel de contatos ao lado
              (PainelContatos.jsx, cabeçalho e rodapé). Lado a lado, a do modal era visivelmente mais
              escura que as duas do painel — três linhas com o mesmo papel em dois tons. */}
          <div className={`shrink-0 flex items-center justify-between gap-3 border-b border-gray-100 ${paddingCabecalho}`}>
            <div className="min-w-0">
              <h3 className="text-base font-semibold text-gray-800 truncate">{title}</h3>
              {subtitulo && <p className="text-xs text-gray-500 mt-0.5 truncate">{subtitulo}</p>}
            </div>
            <div className="shrink-0 flex items-center gap-2">
              {acoes}
              {/* Mesmo chrome do fechar da ficha "Visualizar": quadradinho arredondado que acende
                  no hover (FilaPainel.jsx:231). */}
              <Tooltip label="Fechar">
                {/* Caixa de PX INTEIROS (28 × 28, X de 16): o `p-1.5` (5,25px) deixava o hover fora do centro. */}
                <button onClick={onClose} aria-label="Fechar"
                  className="-mr-[6px] inline-flex h-[28px] w-[28px] items-center justify-center rounded-[4px] text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition">
                  <IconX className="h-[16px] w-[16px]" />
                </button>
              </Tooltip>
            </div>
          </div>
          <div className={`${alturaCheia ? 'flex-1 min-h-0 overflow-y-auto scrollbar-thin ' : ''}${padding}`}>{children}</div>
        </div>
        {aside}
      </div>
    </div>,
    document.body,
  );
}
