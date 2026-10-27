import { Icon, type IconName } from './Icon';
import { Sheet } from './Sheet';

export interface Action {
  icon: IconName;
  label: string;
  danger?: boolean;
  hidden?: boolean;
  onClick: () => void;
}

/** Menu de opções no estilo do iPhone: grupo arredondado com ícone à esquerda. */
export function ActionMenu({
  open,
  onClose,
  title,
  actions,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  actions: Action[];
}) {
  const visible = actions.filter((a) => !a.hidden);
  const normal = visible.filter((a) => !a.danger);
  const danger = visible.filter((a) => a.danger);
  const item = (a: Action) => (
    <button
      key={a.label}
      type="button"
      className={`action-item ${a.danger ? 'danger' : ''}`}
      onClick={() => {
        onClose();
        // Deixa a janela começar a fechar antes de abrir a confirmação.
        setTimeout(a.onClick, 120);
      }}
    >
      <Icon name={a.icon} size={24} stroke={1.8} />
      <span>{a.label}</span>
    </button>
  );
  return (
    <Sheet open={open} onClose={onClose} title={title}>
      {normal.length > 0 && <div className="action-menu">{normal.map(item)}</div>}
      {danger.length > 0 && <div className="action-menu">{danger.map(item)}</div>}
    </Sheet>
  );
}
