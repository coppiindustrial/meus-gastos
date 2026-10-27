import { useEffect, useLayoutEffect, useRef, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { withTransition } from '../lib/nav';
import { Icon, type IconName } from './Icon';
import { LiquidTabs } from './liquidTabs';
import { tick } from '../lib/touch';

// O "+" abre o formulário de lançamento (tela sem abas).
const TABS: { to: string; label: string; icon: IconName }[] = [
  { to: '/', label: 'Resumo', icon: 'home' },
  { to: '/lancamentos', label: 'Lançamentos', icon: 'list' },
  { to: '/lancar', label: 'Lançar', icon: 'plus' },
  { to: '/patrimonio', label: 'Patrimônio', icon: 'chart' },
  { to: '/mais', label: 'Mais', icon: 'more' },
];

function isTabActive(t: (typeof TABS)[number], pathname: string): boolean {
  if (t.to === '/') return pathname === '/';
  return pathname.startsWith(t.to);
}

export function TabBar({ pathname }: { pathname: string }) {
  const navigate = useNavigate();
  const activeIndex = Math.max(
    0,
    TABS.findIndex((t) => isTabActive(t, pathname)),
  );
  const activeRef = useRef(activeIndex);
  activeRef.current = activeIndex;
  const rowRef = useRef<HTMLDivElement>(null);
  const pillRef = useRef<HTMLSpanElement>(null);
  const lensRef = useRef<HTMLSpanElement>(null);
  const tabRefs = useRef<(HTMLAnchorElement | null)[]>([]);
  const engine = useRef<LiquidTabs | null>(null);
  const drag = useRef<{ id: number; left: number; x0: number; x: number; moved: boolean; near: number } | null>(null);

  useLayoutEffect(() => {
    const row = rowRef.current;
    if (!row || !pillRef.current || !lensRef.current) return;
    const eng = new LiquidTabs(row, pillRef.current, lensRef.current, () => tabRefs.current.filter((t): t is HTMLAnchorElement => !!t), TABS.length);
    engine.current = eng;
    eng.snap(activeRef.current);
    const ro = new ResizeObserver(() => {
      if (!drag.current) eng.snap(activeRef.current);
    });
    ro.observe(row);
    return () => {
      ro.disconnect();
      eng.destroy();
      engine.current = null;
    };
  }, []);

  // A aba mudou por outro caminho (link, voltar): a bolha vai até ela.
  useEffect(() => {
    if (!drag.current) engine.current?.settle(activeIndex);
  }, [activeIndex]);

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const eng = engine.current;
    if (!eng) return;
    const r = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - r.left;
    drag.current = { id: e.pointerId, left: r.left, x0: x, x, moved: false, near: eng.nearest(x) };
    eng.press(x);
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    const eng = engine.current;
    if (!d || !eng || d.id !== e.pointerId) return;
    const x = e.clientX - d.left;
    d.x = x;
    if (Math.abs(x - d.x0) > 6) d.moved = true;
    eng.move(x);
    const n = eng.nearest(x);
    if (n !== d.near) {
      d.near = n;
      tick();
    }
  };

  // Soltar: assenta na aba onde o dedo saiu e troca de tela.
  const finish = (e: ReactPointerEvent<HTMLDivElement>, commit: boolean) => {
    const d = drag.current;
    const eng = engine.current;
    if (!d || !eng || d.id !== e.pointerId) return;
    drag.current = null;
    const target = commit ? eng.nearest(d.x) : activeRef.current;
    eng.release(target);
    if (target !== activeRef.current) withTransition('tab', () => navigate(TABS[target].to));
    // Se a tela não trocar, a bolha volta para a aba atual.
    setTimeout(() => {
      if (!drag.current && activeRef.current !== target) engine.current?.settle(activeRef.current);
    }, 800);
  };

  return (
    <nav className="tabbar" aria-label="Navegação principal">
      <div className="tabbar-inner">
        <div
          className="tabs-row"
          ref={rowRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={(e) => finish(e, true)}
          onPointerCancel={(e) => finish(e, false)}
        >
          <span className="tab-pill" ref={pillRef} aria-hidden="true" />
          {TABS.map((t, k) => (
            <NavLink
              key={t.to}
              ref={(el) => {
                tabRefs.current[k] = el;
              }}
              to={t.to}
              className={() => 'tab'}
              aria-current={isTabActive(t, pathname) ? 'page' : undefined}
              draggable={false}
            >
              <Icon name={t.icon} size={22} stroke={1.9} />
              <span>{t.label}</span>
            </NavLink>
          ))}
          <span className="tab-lens" ref={lensRef} aria-hidden="true" />
        </div>
      </div>
    </nav>
  );
}

export function isTabRoute(pathname: string): boolean {
  return ['/', '/lancamentos', '/patrimonio', '/mais'].includes(pathname);
}

/** Botão redondo de vidro para voltar: volta no histórico ou vai para um endereço padrão. */
export function BackButton({ to }: { to?: string; label?: string }) {
  const navigate = useNavigate();
  return (
    <button
      type="button"
      className="glass circle"
      aria-label="Voltar"
      onClick={() => {
        withTransition('back', () => {
          if (window.history.state && window.history.state.idx > 0) navigate(-1);
          else navigate(to ?? '/');
        });
      }}
    >
      <Icon name="arrowLeft" size={22} />
    </button>
  );
}

export function TopBar({ left, title, right }: { left?: ReactNode; title?: ReactNode; right?: ReactNode }) {
  return (
    <div className="topbar">
      <div>{left}</div>
      {title ? <div className="topbar-title">{title}</div> : <div />}
      <div>{right}</div>
    </div>
  );
}

/**
 * Tela enquanto os dados vêm do banco do celular. Nas telas internas já mostra o voltar (nunca fica
 * tudo preto); o data-loading avisa a troca de tela animada para esperar o conteúdo de verdade.
 */
export function LoadingScreen({ tabs = false, back }: { tabs?: boolean; back?: string }) {
  return (
    <main className={tabs ? 'screen' : 'screen no-tabs'} data-loading="">
      {!tabs && <TopBar left={<BackButton to={back} />} />}
    </main>
  );
}

/** Cabeçalho das abas: título à esquerda e botões de vidro à direita. */
export function TabHead({ title, children }: { title: ReactNode; children?: ReactNode }) {
  return (
    <header className="tab-head">
      <h1 className="h1">{title}</h1>
      {children && <div className="actions">{children}</div>}
    </header>
  );
}

export function EmptyState({
  title,
  text,
  action,
}: {
  title: string;
  text?: string;
  action?: { label: string; to?: string; onClick?: () => void };
}) {
  return (
    <div className="empty">
      <span className="title">{title}</span>
      {text && <span className="small" style={{ lineHeight: 1.5 }}>{text}</span>}
      {action &&
        (action.to ? (
          <Link className="btn primary" to={action.to}>
            {action.label}
          </Link>
        ) : (
          <button type="button" className="btn primary" onClick={action.onClick}>
            {action.label}
          </button>
        ))}
    </div>
  );
}
