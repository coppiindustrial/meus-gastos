import { useEffect, useRef, useState } from 'react';
import { IconSeta } from './icons.jsx';

// Dropdown de opções simples no padrão grafite do app — o <select> nativo renderiza a lista
// com o azul do sistema operacional, que destoa de todos os outros seletores (SelectResp,
// SelectCanal, FiltroDropdown). Mesmo desenho deles: botão com borda, popover com o item
// selecionado em #eceef1 e um check à direita.
//
// `opcoes`: [{ value, label }]. Navegação por teclado (↑/↓ move, Enter escolhe, Esc fecha).
// `rotulo` (opcional) é o texto do BOTÃO quando não é o da opção escolhida: a posição no grupo, no
// painel da estrutura do DRE, lista as linhas e diz no botão "5ª de 9 · depois de X".

const IconCheck = ({ className = 'h-4 w-4' }) => (
  <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
);

const dropItem = (on, ativo) =>
  `w-full flex items-center gap-2 rounded-[2px] px-2.5 py-1.5 text-sm text-left transition ${
    on ? 'bg-hx-eceef1 text-gray-900 font-medium' : (ativo ? 'bg-hx-f4f5f7 text-gray-700' : 'text-gray-600 hover:bg-hx-f4f5f7')}`;

export default function SelectSimples({ value, onChange, opcoes, disabled = false, className = '', placeholder = 'Selecione…', rotulo }) {
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const ref = useRef(null);
  const listRef = useRef(null);

  const idxDe = (v) => Math.max(0, opcoes.findIndex((o) => String(o.value) === String(v ?? '')));

  useEffect(() => {
    if (!open) return;
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);

  useEffect(() => {
    if (open) listRef.current?.children[activeIdx]?.scrollIntoView({ block: 'nearest' });
  }, [activeIdx, open]);

  const sel = opcoes.find((o) => String(o.value) === String(value ?? ''));

  const escolher = (v) => { onChange(v); setOpen(false); };
  const onKeyDown = (e) => {
    if (disabled) return;
    if (!open && (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault(); setActiveIdx(idxDe(value)); setOpen(true); return;
    }
    if (!open) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx((i) => Math.min(i + 1, opcoes.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIdx((i) => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); escolher(opcoes[activeIdx]?.value ?? ''); }
    else if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); }
  };

  return (
    <div className={`relative ${className}`} ref={ref}>
      <button type="button" disabled={disabled} onKeyDown={onKeyDown}
        onClick={() => { if (disabled) return; setActiveIdx(idxDe(value)); setOpen((o) => !o); }}
        className={`input flex items-center justify-between gap-2 text-left ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}>
        <span className={`truncate ${sel || rotulo ? 'text-gray-800' : 'text-gray-400'}`}>{rotulo ?? (sel ? sel.label : placeholder)}</span>
        {/* A seta GIRA ao abrir e a lista entra com o "animate-pop-in" dos popovers (08/10/2026, a
            pedido): o mesmo gesto dos segmentos da faixa e do menu de ações — 200ms, ease-out. */}
        <IconSeta className={`text-gray-400 transition-transform duration-200 ease-out motion-reduce:transition-none ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div ref={listRef} className="absolute z-30 mt-1 w-full max-h-64 animate-pop-in overflow-y-auto scrollbar-thin rounded-[4px] border border-elevado bg-elevado p-1 shadow-lg sombra-popover motion-reduce:animate-none">
          {opcoes.map((o, i) => {
            const on = String(o.value) === String(value ?? '');
            return (
              <button key={o.value ?? `op-${i}`} type="button" onClick={() => escolher(o.value)}
                onMouseEnter={() => setActiveIdx(i)} className={dropItem(on, i === activeIdx)}>
                <span className="flex-1 truncate">{o.label}</span>
                {on && <IconCheck className="h-4 w-4 shrink-0 text-gray-700" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
