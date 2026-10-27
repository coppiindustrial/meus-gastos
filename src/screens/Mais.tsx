import { Link } from 'react-router-dom';
import { Icon, type IconName } from '../components/Icon';
import { TabHead } from '../components/Layout';

interface Item {
  label: string;
  icon: IconName;
  to?: string;
  /** Fase do PLANO.md em que a tela chega. */
  fase?: number;
}

const ITENS: Item[] = [
  { label: 'Importar fatura', icon: 'upload', fase: 3 },
  { label: 'Revisar pendências', icon: 'flag', fase: 3 },
  { label: 'Gastos fixos', icon: 'refresh', fase: 5 },
  { label: 'Categorias e grupos', icon: 'grid', fase: 1 },
  { label: 'Regras de classificação', icon: 'lines', fase: 3 },
  { label: 'Cartões', icon: 'folder', fase: 1 },
  { label: 'Evolução mensal', icon: 'chart', fase: 4 },
];

export function Mais() {
  return (
    <main className="screen">
      <TabHead title="Mais" />
      <div className="list-group">
        {ITENS.map((it) =>
          it.to ? (
            <Link key={it.label} to={it.to} className="list-item">
              <Icon name={it.icon} />
              <span className="grow">{it.label}</span>
              <Icon name="next" size={18} />
            </Link>
          ) : (
            <div key={it.label} className="list-item" aria-disabled="true" style={{ opacity: 0.45 }}>
              <Icon name={it.icon} />
              <span className="grow">{it.label}</span>
              <span className="tiny muted">fase {it.fase}</span>
            </div>
          ),
        )}
      </div>
      <div className="list-group">
        <Link to="/mais/conta" className="list-item">
          <Icon name="cloud" />
          <span className="grow">Conta e backup</span>
          <Icon name="next" size={18} />
        </Link>
      </div>
    </main>
  );
}
