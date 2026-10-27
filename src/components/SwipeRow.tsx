import { useEffect, useRef, useState, type ReactNode } from 'react';

const OPEN = 88; // largura do botão "Excluir"

/**
 * Linha que dá para arrastar para a esquerda e mostrar "Excluir" (como no Hevy).
 * Só apaga ao tocar no botão. A rolagem vertical da tela continua normal.
 */
export function SwipeRow({ onDelete, label = 'Excluir', className = '', children }: { onDelete: () => void; label?: string; className?: string; children: ReactNode }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const openRef = useRef(false);
  openRef.current = open;

  useEffect(() => {
    const row = rowRef.current;
    if (!row) return;
    let startX = 0;
    let startY = 0;
    let dx = 0;
    let tracking = false;
    let active = false;
    let justDragged = false;

    const setX = (x: number, animate: boolean) => {
      row.style.transition = animate ? '' : 'none';
      row.style.transform = x ? `translateX(${x}px)` : '';
    };
    const down = (e: PointerEvent) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      tracking = true;
      active = false;
      startX = e.clientX;
      startY = e.clientY;
      dx = 0;
    };
    const move = (e: PointerEvent) => {
      if (!tracking) return;
      const mx = e.clientX - startX;
      const my = e.clientY - startY;
      if (!active) {
        // Movimento mais vertical: é rolagem da tela, não arrasto.
        if (Math.abs(my) > 8 && Math.abs(my) > Math.abs(mx)) {
          tracking = false;
          return;
        }
        if (Math.abs(mx) < 8) return;
        active = true;
        wrapRef.current?.classList.add('dragging');
        try {
          row.setPointerCapture(e.pointerId);
        } catch {
          // sem captura
        }
        (document.activeElement as HTMLElement | null)?.blur?.();
      }
      const base = openRef.current ? -OPEN : 0;
      let x = base + mx;
      if (x > 0) x = 0;
      if (x < -OPEN) x = -OPEN + (x + OPEN) * 0.25; // resistência depois do botão
      dx = x;
      setX(x, false);
    };
    const up = () => {
      if (!tracking) return;
      tracking = false;
      if (!active) return;
      justDragged = true;
      setTimeout(() => (justDragged = false), 250);
      const willOpen = dx < -OPEN / 2;
      setOpen(willOpen);
      setX(willOpen ? -OPEN : 0, true);
      // Some o botão só depois que a linha terminar de voltar.
      setTimeout(() => wrapRef.current?.classList.remove('dragging'), 380);
    };
    // Depois de arrastar, o toque não conta como clique (não marca série sem querer).
    // Com o botão aberto, tocar na linha só fecha.
    const click = (e: MouseEvent) => {
      if (!justDragged && !openRef.current) return;
      e.preventDefault();
      e.stopPropagation();
      if (!justDragged) {
        setOpen(false);
        setX(0, true);
        wrapRef.current?.classList.add('dragging');
        setTimeout(() => wrapRef.current?.classList.remove('dragging'), 380);
      }
    };
    row.addEventListener('pointerdown', down);
    row.addEventListener('pointermove', move);
    row.addEventListener('pointerup', up);
    row.addEventListener('pointercancel', up);
    row.addEventListener('click', click, true);
    return () => {
      row.removeEventListener('pointerdown', down);
      row.removeEventListener('pointermove', move);
      row.removeEventListener('pointerup', up);
      row.removeEventListener('pointercancel', up);
      row.removeEventListener('click', click, true);
    };
  }, []);

  // Tocar fora fecha o botão.
  useEffect(() => {
    if (!open) return;
    const outside = (e: PointerEvent) => {
      if (wrapRef.current?.contains(e.target as Node)) return;
      setOpen(false);
      if (rowRef.current) rowRef.current.style.transform = '';
      wrapRef.current?.classList.add('dragging');
      setTimeout(() => wrapRef.current?.classList.remove('dragging'), 380);
    };
    document.addEventListener('pointerdown', outside, true);
    return () => document.removeEventListener('pointerdown', outside, true);
  }, [open]);

  return (
    <div ref={wrapRef} className={`swipe-wrap ${className} ${open ? 'open' : ''}`}>
      <button
        type="button"
        className="swipe-del"
        tabIndex={open ? 0 : -1}
        aria-hidden={!open}
        onClick={() => {
          setOpen(false);
          if (rowRef.current) rowRef.current.style.transform = '';
          onDelete();
        }}
      >
        {label}
      </button>
      <div ref={rowRef} className="swipe-row">
        {children}
      </div>
    </div>
  );
}
