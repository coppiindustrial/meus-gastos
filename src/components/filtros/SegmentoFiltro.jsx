import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useFaixa } from './FaixaFiltros.jsx';
import { IconSeta } from '../icons.jsx';
import posicionarPopover from '../../lib/posicionarPopover.js';
import useEscape from '../../lib/useEscape.js';

// Um segmento do trilho (copiado do Gestor): o gatilho e o menu que ele abre.
//   sem seleção → transparente, texto gray-600, hover gray-200
//   com seleção → chip `chip-ativo`, texto escuro semibold, e um ✕ embutido que limpa só este filtro
// O ✕ é botão IRMÃO do rótulo (botão dentro de botão é HTML inválido). O menu é portado ao body: a
// barra fica sobre uma tabela com rolagem, que recortaria um menu `absolute`.
//
// Props: `id` (identidade no trilho), `rotulo` (nome do filtro quieto), `valor` (texto com seleção —
// é ele que acende o chip), `textoQuieto` (texto no lugar do rótulo sem acender: o mês padrão),
// `onLimpar` (sem ela não há ✕), `largura`/`alturaMenu` do menu, `children` (corpo do menu, ou
// função que recebe `{ fechar }`).
export default function SegmentoFiltro({
  id, rotulo, valor, textoQuieto, icone, largura = 220, onLimpar, alturaMenu = 320, larguraValor = 168, children,
}) {
  const { aberto, alternar, fechar } = useFaixa();
  const [pos, setPos] = useState(null);
  const btnRef = useRef(null);
  const menuRef = useRef(null);
  const estaAberto = aberto === id;
  const ativo = !!valor;

  useEffect(() => {
    if (!estaAberto) { setPos(null); return; }
    setPos(posicionarPopover(btnRef.current, { largura, altura: alturaMenu, alinhar: 'esquerda', gap: 6 }));
  }, [estaAberto, largura, alturaMenu]);

  useEffect(() => {
    if (!estaAberto) return undefined;
    const onDown = (e) => {
      if (btnRef.current?.contains(e.target) || menuRef.current?.contains(e.target)) return;
      fechar();
    };
    // O menu é `fixed`: rolar a página o descolaria do gatilho. Rolar dentro do próprio menu, não.
    const onScroll = (e) => { if (!menuRef.current?.contains(e.target)) fechar(); };
    document.addEventListener('mousedown', onDown);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', fechar);
    return () => {
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', fechar);
    };
  }, [estaAberto, fechar]);

  useEscape(estaAberto, fechar);

  return (
    <>
      {/* O wrapper pinta o estado: rótulo e ✕ dividem a mesma superfície. Com o cursor sobre o ✕ o chip
          volta ao tom de repouso e só o quadrado do ✕ escurece — o clique ali limpa, não abre. */}
      <span className={`relative inline-flex shrink-0 items-center rounded-[3px] transition-colors duration-[120ms] ${
        ativo ? 'bg-chip-ativo hover:bg-chip-ativo-hover [&:has(.limpar-filtro:hover)]:bg-chip-ativo' : 'hover:bg-gray-200'}`}>
        <button ref={btnRef} type="button" onClick={() => alternar(id)} aria-expanded={estaAberto} aria-haspopup="menu"
          className={`inline-flex items-center gap-[5px] rounded-[3px] pb-[3px] pt-[4px] text-[12px] transition-colors ${
            ativo ? `pl-[9px] font-semibold text-chip-ativo ${onLimpar ? 'pr-1' : 'pr-[9px]'}` : `px-[9px] font-medium ${textoQuieto ? 'text-gray-800' : 'text-gray-600'}`}`}>
          {icone}
          <span className="truncate" style={{ maxWidth: larguraValor }}>{ativo ? valor : (textoQuieto || rotulo)}</span>
          <IconSeta className={`opacity-60 transition-transform duration-200 ease-out ${estaAberto ? 'rotate-180' : ''}`} />
        </button>
        {ativo && onLimpar && (
          <button type="button" onClick={() => { onLimpar(); fechar(); }} aria-label={`Limpar filtro de ${rotulo}`}
            className="limpar-filtro mr-[3px] inline-flex h-[20px] w-[20px] items-center justify-center rounded-[2px] text-chip-x transition-colors duration-[120ms] hover:bg-chip-ativo-hover hover:text-gray-900 active:bg-gray-400">
            <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        )}
      </span>

      {estaAberto && pos && createPortal(
        <div ref={menuRef} role="menu" style={{ position: 'fixed', ...pos, width: largura }}
          className="z-[56] animate-pop-in rounded-[4px] border border-elevado bg-elevado p-1.5 shadow-[0_14px_34px_rgba(20,28,44,.15),0_3px_8px_rgba(20,28,44,.06)] sombra-popover">
          {typeof children === 'function' ? children({ fechar }) : children}
        </div>,
        document.body,
      )}
    </>
  );
}

// Título de subgrupo dentro de um menu (os grupos de categoria). `cor`: a bolinha do grupo.
export function GrupoMenu({ titulo, cor, primeiro = false, children }) {
  return (
    <>
      {!primeiro && <div className="mx-1 mt-1 h-px bg-divisoria" />}
      <div className={`flex items-center gap-1.5 px-[9px] pb-1 text-[10px] font-semibold uppercase tracking-wide text-gray-500 ${primeiro ? 'pt-1' : 'pt-1.5'}`}>
        {cor && <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: cor }} />}
        {titulo}
      </div>
      {children}
    </>
  );
}

// Caixinha PREENCHIDA do idioma de menu (grafite com check branco). Decorativa: quem trata o clique é a
// linha que a contém — um `<input>` dentro de um botão dispararia o clique duas vezes.
export function CaixaMarcada({ marcada }) {
  return (
    <span aria-hidden="true"
      className={`inline-flex h-[15px] w-[15px] shrink-0 items-center justify-center rounded-[4px] transition-colors ${
        marcada ? 'bg-caixa text-caixa-check' : 'border border-gray-400 bg-white'}`}>
      {marcada && (
        <svg viewBox="0 0 24 24" className="h-[11px] w-[11px]" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      )}
    </span>
  );
}

// Linha de opção do menu. `multi`: caixa de marcar na frente (e sem o check à direita, que diria o
// mesmo duas vezes). O que separa a selecionada do hover é o peso da fonte e a marca, não o fundo.
export function OpcaoMenu({ selecionada, onClick, children, descricao, multi = false }) {
  return (
    <button type="button" role={multi ? 'menuitemcheckbox' : 'menuitem'} aria-checked={multi ? selecionada : undefined}
      onClick={onClick}
      className={`flex w-full items-center gap-2 rounded-[2px] px-[11px] py-[8px] text-left text-[12.5px] transition-colors duration-[120ms] ${
        selecionada ? 'bg-gray-100 font-semibold text-gray-900 hover:bg-gray-200' : 'text-gray-700 hover:bg-gray-100'}`}>
      {multi && <CaixaMarcada marcada={selecionada} />}
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="flex min-w-0 items-center [&>*]:min-w-0">
          {typeof children === 'string' ? <span className="truncate">{children}</span> : children}
        </span>
        {descricao && <span className="mt-px block truncate text-[10.5px] font-normal text-gray-400">{descricao}</span>}
      </span>
      {selecionada && !multi && (
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0 text-gray-800" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      )}
    </button>
  );
}
