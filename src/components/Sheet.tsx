import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useKeyboardInset } from '../lib/hooks';
import { Icon } from './Icon';

interface Props {
  open: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  children: ReactNode;
  hideClose?: boolean;
}

// Trava a rolagem da página enquanto houver alguma janela aberta. Com janela em cima de
// janela (ex.: confirmação por cima de um menu), só destrava quando a última fecha.
let openSheets = 0;

function lockScroll(): void {
  openSheets += 1;
  document.body.style.overflow = 'hidden';
}

function unlockScroll(): void {
  openSheets = Math.max(0, openSheets - 1);
  if (openSheets === 0) document.body.style.overflow = '';
}

export function Sheet({ open, onClose, title, subtitle, children, hideClose }: Props) {
  const { inset, viewportHeight } = useKeyboardInset(open);
  const sheetRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    lockScroll();
    return unlockScroll;
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // Quando um campo recebe foco, espera o teclado subir e mostra o campo.
  useEffect(() => {
    const el = sheetRef.current;
    if (!open || !el) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onFocus = (e: FocusEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target || !target.matches('input, textarea, select')) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => target.scrollIntoView({ block: 'nearest' }), 320);
    };
    el.addEventListener('focusin', onFocus);
    return () => {
      if (timer) clearTimeout(timer);
      el.removeEventListener('focusin', onFocus);
    };
  }, [open]);

  if (!open) return null;
  const keyboardOpen = inset > 0;
  return createPortal(
    <div className="sheet-backdrop" style={{ paddingBottom: inset }} onClick={onClose}>
      <div
        ref={sheetRef}
        className={`sheet ${keyboardOpen ? 'kb-open' : ''}`}
        style={keyboardOpen ? { maxHeight: Math.max(200, viewportHeight - 16) } : undefined}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sheet-handle" aria-hidden="true" />
        {(title || !hideClose) && (
          <div className="row between">
            <div className="col">
              {title && <span className="sheet-title">{title}</span>}
              {subtitle && <span className="small muted">{subtitle}</span>}
            </div>
            {!hideClose && (
              <button type="button" className="icon-btn ghost" aria-label="Fechar" onClick={onClose}>
                <Icon name="x" />
              </button>
            )}
          </div>
        )}
        {children}
      </div>
    </div>,
    document.body,
  );
}
