import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { Sheet } from './Sheet';

interface ConfirmOptions {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

interface PromptOptions {
  title: string;
  label?: string;
  initial?: string;
  placeholder?: string;
  confirmLabel?: string;
  inputMode?: 'text' | 'numeric' | 'decimal';
}

interface ToastOptions {
  /** Botão no aviso (ex.: "Desfazer"). */
  action?: { label: string; onClick: () => void };
  ms?: number;
}

interface Dialogs {
  confirm: (opts: ConfirmOptions) => Promise<boolean>;
  prompt: (opts: PromptOptions) => Promise<string | null>;
  toast: (message: string, opts?: ToastOptions) => void;
}

const Ctx = createContext<Dialogs | null>(null);

export function useDialogs(): Dialogs {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('DialogProvider ausente');
  return ctx;
}

export function DialogProvider({ children }: { children: ReactNode }) {
  const [confirmState, setConfirmState] = useState<ConfirmOptions | null>(null);
  const [promptState, setPromptState] = useState<PromptOptions | null>(null);
  const [promptValue, setPromptValue] = useState('');
  const [toastMsg, setToastMsg] = useState<{ message: string; action?: ToastOptions['action'] } | null>(null);
  const resolver = useRef<((v: unknown) => void) | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const confirm = useCallback((opts: ConfirmOptions) => {
    setConfirmState(opts);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve as (v: unknown) => void;
    });
  }, []);

  const prompt = useCallback((opts: PromptOptions) => {
    setPromptState(opts);
    setPromptValue(opts.initial ?? '');
    return new Promise<string | null>((resolve) => {
      resolver.current = resolve as (v: unknown) => void;
    });
  }, []);

  const toast = useCallback((message: string, opts?: ToastOptions) => {
    setToastMsg({ message, action: opts?.action });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastMsg(null), opts?.ms ?? (opts?.action ? 4000 : 2200));
  }, []);

  const closeConfirm = (value: boolean) => {
    setConfirmState(null);
    resolver.current?.(value);
    resolver.current = null;
  };

  const closePrompt = (value: string | null) => {
    setPromptState(null);
    resolver.current?.(value);
    resolver.current = null;
  };

  return (
    <Ctx.Provider value={{ confirm, prompt, toast }}>
      {children}
      <Sheet open={!!confirmState} onClose={() => closeConfirm(false)} title={confirmState?.title} hideClose>
        {confirmState?.message && <p className="muted" style={{ lineHeight: 1.5 }}>{confirmState.message}</p>}
        <div className="stack">
          <button
            type="button"
            className={`btn big block ${confirmState?.danger ? 'danger' : 'primary'}`}
            onClick={() => closeConfirm(true)}
          >
            {confirmState?.confirmLabel ?? 'Confirmar'}
          </button>
          <button type="button" className="btn big block soft" onClick={() => closeConfirm(false)}>
            {confirmState?.cancelLabel ?? 'Cancelar'}
          </button>
        </div>
      </Sheet>
      <Sheet open={!!promptState} onClose={() => closePrompt(null)} title={promptState?.title}>
        <form
          className="stack"
          onSubmit={(e) => {
            e.preventDefault();
            closePrompt(promptValue);
          }}
        >
          <label className="field">
            {promptState?.label && <span className="label">{promptState.label}</span>}
            <input
              className="input"
              autoFocus
              value={promptValue}
              placeholder={promptState?.placeholder}
              inputMode={promptState?.inputMode}
              autoComplete="off"
              autoCapitalize="sentences"
              enterKeyHint="done"
              onChange={(e) => setPromptValue(e.target.value)}
            />
          </label>
          <button type="submit" className="btn big block primary">
            {promptState?.confirmLabel ?? 'Salvar'}
          </button>
        </form>
      </Sheet>
      {toastMsg && (
        <div className={`toast ${toastMsg.action ? 'with-action' : ''}`} role="status">
          <span>{toastMsg.message}</span>
          {toastMsg.action && (
            <button
              type="button"
              className="toast-action"
              onClick={() => {
                const act = toastMsg.action;
                setToastMsg(null);
                if (toastTimer.current) clearTimeout(toastTimer.current);
                act?.onClick();
              }}
            >
              {toastMsg.action.label}
            </button>
          )}
        </div>
      )}
    </Ctx.Provider>
  );
}
