import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import useEscape from '../lib/useEscape.js';
import { useAuth } from '../context/AuthContext.jsx';
import { SbChevron, SbPanel, SbPanelR, SbLogout, SbTema, SbSol, SbMonitor, SbCheck } from './sidebarIcons.jsx';
import { DASHBOARD, GRUPOS } from '../lib/navegacao.js';
import { TEMAS, useTema } from '../lib/tema.js';
import Tooltip from './Tooltip.jsx';
import ErrorBoundary from './ErrorBoundary.jsx';
import { lsGet, lsSet } from '../lib/storage.js';

// A BARRA LATERAL do Gestor Coppi (components/Layout.jsx de lá), sem o que este app não tem: sino,
// buscador, atalhos de teclado e troca de senha. Ganhou o modo CELULAR: abaixo de `md` (768px) a
// barra some e vira um menu que abre por cima, pelo botão ☰ da faixa do topo.

const LS_COLLAPSED = 'sidebar_recolhida';
const LS_GROUPS = 'sidebar_grupos';
const LS_WIDTH = 'sidebar_largura';
const DEFAULT_W = 274; // largura padrão do design
const MIN_W = 240;     // largura mínima ao arrastar
const MAX_W = 300;     // largura máxima ao arrastar
const clampW = (n) => Math.min(MAX_W, Math.max(MIN_W, n || DEFAULT_W));
const ICONE_APP = `${import.meta.env.BASE_URL}icon.svg`;

// Iniciais (até 2) para o avatar do rodapé.
const iniciais = (nome) =>
  (String(nome || '').trim().split(/[\s._-]+/).filter(Boolean).map((p) => p[0]).slice(0, 2).join('') || '?').toUpperCase();

// O TEMA NO MENU DO USUÁRIO: uma linha igual às vizinhas ("Tema · Escuro ›") que abre as três opções
// num SUBMENU ao lado, que cresce para CIMA a partir da base da linha (o menu mora no rodapé).
const ICONE_TEMA = { claro: SbSol, escuro: SbTema, sistema: SbMonitor };
const ESPERA_FECHAR = 120; // ms: o cursor em diagonal até o submenu passa um instante fora dele
const ITEM_MENU_USUARIO = 'w-full flex items-center gap-2.5 px-3 py-2.5 rounded-[10px] text-[13.5px] text-hx-3b4350 hover:bg-black/[.06] transition';
const SOMBRA_MENU = '0 14px 34px rgba(20,28,44,.15), 0 3px 8px rgba(20,28,44,.06)';

function MenuTema({ tema, onEscolher }) {
  const [aberto, setAberto] = useState(false);
  const linhaRef = useRef(null);
  const itensRef = useRef([]);
  const tempo = useRef(null);
  useEffect(() => () => clearTimeout(tempo.current), []);
  const fechar = (foco = false) => {
    clearTimeout(tempo.current);
    setAberto(false);
    if (foco) linhaRef.current?.focus();
  };
  useEscape(aberto, () => fechar(true));
  const abrir = (foco = false) => {
    clearTimeout(tempo.current);
    setAberto(true);
    if (foco) setTimeout(() => itensRef.current[Math.max(0, TEMAS.findIndex((t) => t.key === tema))]?.focus(), 0);
  };
  const atual = TEMAS.find((t) => t.key === tema) ?? TEMAS[0];
  const Icone = ICONE_TEMA[atual.key];
  const teclaLinha = (e) => {
    if (e.key === 'ArrowRight' || e.key === 'Enter' || e.key === ' ') { e.preventDefault(); abrir(true); }
  };
  const teclaItem = (e, i) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const n = TEMAS.length;
      itensRef.current[(i + (e.key === 'ArrowDown' ? 1 : n - 1)) % n]?.focus();
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      fechar(true);
    }
  };
  return (
    <div className="relative" onMouseEnter={() => abrir()}
      onMouseLeave={() => { clearTimeout(tempo.current); tempo.current = setTimeout(() => setAberto(false), ESPERA_FECHAR); }}>
      <button ref={linhaRef} type="button" aria-haspopup="menu" aria-expanded={aberto}
        onClick={() => (aberto ? fechar() : abrir())} onKeyDown={teclaLinha}
        className={`${ITEM_MENU_USUARIO} ${aberto ? 'bg-black/[.06]' : ''}`}>
        <Icone className="h-[18px] w-[18px] shrink-0 text-hx-6b727d" />
        Tema
        <span className="ml-auto text-[12.5px] text-hx-98a0ab">{atual.label}</span>
        <SbChevron className="h-[15px] w-[15px] shrink-0 text-hx-98a0ab" />
      </button>
      {aberto && (
        // No celular o menu ocupa a largura da barra: o submenu abre POR CIMA da linha, não ao lado.
        <div className="absolute bottom-full right-0 z-10 pb-1.5 md:bottom-[-6.25px] md:left-full md:right-auto md:pb-0 md:pl-[12px]">
          <div role="menu" aria-label="Tema" style={{ boxShadow: SOMBRA_MENU }}
            className="w-[168px] origin-bottom-left animate-pop-in rounded-[14px] border border-hx-e8eaee bg-elevado p-1.5">
            {TEMAS.map((t, i) => {
              const I = ICONE_TEMA[t.key];
              const escolhido = t.key === tema;
              return (
                <button key={t.key} ref={(el) => { itensRef.current[i] = el; }} type="button"
                  role="menuitemradio" aria-checked={escolhido}
                  onClick={() => onEscolher(t.key)} onKeyDown={(e) => teclaItem(e, i)}
                  className={`${ITEM_MENU_USUARIO} outline-none focus-visible:bg-black/[.06]`}>
                  <I className="h-[18px] w-[18px] shrink-0 text-hx-6b727d" />
                  {t.label}
                  {escolhido && <SbCheck className="ml-auto h-4 w-4 shrink-0 text-hx-3b4350" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// Pílula cinza neutra no ativo (não usa a cor de marca).
const leafBase = 'flex items-center gap-2.5 h-[37px] my-[2px] rounded-[9px] pr-2 text-[13px] whitespace-nowrap transition-colors';
const leafState = (isActive) => isActive
  ? 'bg-hx-f0f1f3 text-hx-20262f font-semibold'
  : 'text-hx-6b727d font-medium hover:bg-hx-f3f4f6 hover:text-hx-2a3140';
const childClass = ({ isActive }) => `${leafBase} pl-10 ${leafState(isActive)}`;
const flyoutLinkClass = ({ isActive }) =>
  `block rounded-lg px-[14px] py-[10px] text-[13px] transition-colors ${
    isActive ? 'bg-hx-f0f1f3 text-hx-20262f font-semibold' : 'text-hx-5a616d font-medium hover:bg-hx-f3f4f6 hover:text-hx-20262f'
  }`;
const chevAtivo = <SbChevron className="h-[15px] w-[15px] shrink-0 text-hx-9aa1ac" />;

// Etiqueta das telas que ainda não existem (a fase do PLANO.md em que chegam).
const Fase = ({ n }) => <span className="ml-1 shrink-0 text-[10.5px] font-medium text-hx-aab0ba">fase {n}</span>;

function Marca() {
  return (
    <Link to="/" aria-label="Meus Gastos, página inicial" className="flex flex-1 min-w-0 items-center gap-2.5 rounded-[9px]">
      <div className="h-9 w-9 rounded-[9px] overflow-hidden shrink-0 flex items-center justify-center">
        <img src={ICONE_APP} alt="" className="h-full w-full object-contain" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[13.5px] font-bold text-hx-20262f leading-[1.15] tracking-[-0.01em] truncate">Meus Gastos</div>
        <div className="text-[10.5px] font-medium text-hx-9aa1ac leading-tight truncate">Finanças pessoais</div>
      </div>
    </Link>
  );
}

export default function Layout({ children }) {
  const { user, nome, logout } = useAuth();
  const [tema, setTema] = useTema();
  const { pathname } = useLocation();

  const [collapsedPref, setCollapsed] = useState(() => lsGet(LS_COLLAPSED) === 'true');
  const [openGroups, setOpenGroups] = useState(() => {
    try { return JSON.parse(lsGet(LS_GROUPS)) || {}; } catch { return {}; }
  });
  const [largura, setLargura] = useState(() => clampW(Number(lsGet(LS_WIDTH))));
  const [arrastando, setArrastando] = useState(false);
  const [flyout, setFlyout] = useState(null); // grupo com flyout aberto (menu recolhido)
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [menuMovel, setMenuMovel] = useState(false); // a barra aberta por cima, no celular
  const userMenuRef = useRef(null);

  // No celular a barra é sempre a expandida: recolhida não cabe o texto, e o espaço é da tela.
  const collapsed = collapsedPref && !menuMovel;

  // Trocar de tela fecha o menu do celular.
  useEffect(() => { setMenuMovel(false); setUserMenuOpen(false); }, [pathname]);
  useEscape(menuMovel, () => setMenuMovel(false));

  // Fecha o menu do usuário ao clicar fora ou apertar Escape.
  useEscape(userMenuOpen, () => setUserMenuOpen(false));
  useEffect(() => {
    if (!userMenuOpen) return undefined;
    const onDown = (e) => { if (userMenuRef.current && !userMenuRef.current.contains(e.target)) setUserMenuOpen(false); };
    document.addEventListener('mousedown', onDown);
    return () => { document.removeEventListener('mousedown', onDown); };
  }, [userMenuOpen]);

  // Arrasta a borda direita para ajustar a largura (entre MIN_W e MAX_W).
  const iniciarArraste = (e) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = largura;
    let ultima = startW;
    setArrastando(true);
    document.body.style.userSelect = 'none';
    const onMove = (ev) => { ultima = clampW(startW + (ev.clientX - startX)); setLargura(ultima); };
    const onUp = () => {
      setArrastando(false);
      document.body.style.userSelect = '';
      lsSet(LS_WIDTH, String(ultima));
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };
  const resetLargura = () => { setLargura(DEFAULT_W); lsSet(LS_WIDTH, String(DEFAULT_W)); };

  const toggleCollapsed = () => setCollapsed((c) => {
    const n = !c; lsSet(LS_COLLAPSED, String(n)); if (n) setFlyout(null); return n;
  });
  const isOpen = (label) => openGroups[label] !== false; // default aberto
  const toggleGroup = (label) => setOpenGroups((g) => {
    const n = { ...g, [label]: g[label] === false ? true : false };
    lsSet(LS_GROUPS, JSON.stringify(n));
    return n;
  });

  const itemActive = (it) => (it.to === '/' ? pathname === '/' : pathname.startsWith(it.to));
  const groupActive = (grp) => grp.items.some(itemActive);

  const Avatar = ({ size = 'h-[34px] w-[34px]' }) => (
    <div className={`${size} rounded-[9px] shrink-0 flex items-center justify-center text-white text-[12px] font-bold`}
      style={{ background: 'linear-gradient(135deg,#414d8c,rgba(65,77,140,.75))' }}>
      {iniciais(nome)}
    </div>
  );

  return (
    <div className="min-h-screen md:flex">
      {/* Faixa do topo no CELULAR: ☰ e a marca. Some a partir de `md`, onde a barra lateral aparece. */}
      <header className="sticky top-0 z-30 flex h-[56px] items-center gap-2 border-b border-hx-eef0f2 bg-white px-3 md:hidden">
        <button type="button" onClick={() => setMenuMovel(true)} aria-label="Abrir menu"
          className="flex h-9 w-9 items-center justify-center rounded-lg text-hx-6b727d hover:bg-hx-e7e9ef hover:text-hx-20262f">
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
        </button>
        <Marca />
      </header>

      {/* Véu do menu do celular. */}
      {menuMovel && (
        <div className="fixed inset-0 z-40 bg-veu/40 animate-backdrop-in md:hidden" onClick={() => setMenuMovel(false)} aria-hidden="true" />
      )}

      <aside
        className={`${menuMovel ? 'fixed left-0 top-0 z-50 flex shadow-2xl animate-pop-in' : 'hidden'} md:flex shrink-0 md:self-start md:sticky md:top-0 md:z-30 h-[100dvh] md:h-screen bg-white text-hx-20262f flex-col md:relative border-r border-hx-e8eaee ${arrastando ? '' : 'transition-all duration-200'}`}
        style={{ width: collapsed ? 70 : (menuMovel ? Math.min(largura, 300) : largura) }}>
        {/* Alça de redimensionamento (só quando expandida, no computador) */}
        {!collapsed && !menuMovel && (
          <Tooltip label="Arraste para ajustar a largura (duplo clique para o padrão)">
            <div onMouseDown={iniciarArraste} onDoubleClick={resetLargura}
              className="absolute top-0 right-0 z-20 h-full w-1.5 cursor-col-resize" />
          </Tooltip>
        )}

        {/* Cabeçalho da marca (60px) */}
        {collapsed ? (
          <>
            <div className="flex items-center justify-center h-[60px] border-b border-hx-eef0f2">
              <Tooltip label="Página inicial"><Link to="/" aria-label="Página inicial" className="rounded-[9px]">
                <div className="h-9 w-9 rounded-[9px] overflow-hidden flex items-center justify-center">
                  <img src={ICONE_APP} alt="" className="h-full w-full object-contain" />
                </div>
              </Link></Tooltip>
            </div>
            <div className="flex flex-col items-center gap-[3px] pt-2 pb-2.5">
              <Tooltip label="Expandir menu"><button onClick={toggleCollapsed}
                className="flex items-center justify-center w-9 h-[34px] rounded-lg text-hx-8a919c hover:bg-hx-e7e9ef hover:text-hx-20262f transition">
                <SbPanelR className="h-5 w-5" />
              </button></Tooltip>
            </div>
            <div className="h-px bg-hx-eef0f2 mx-3.5" />
          </>
        ) : (
          <div className="flex items-center gap-2.5 px-3 h-[60px] border-b border-hx-eef0f2 overflow-hidden">
            <Marca />
            <Tooltip label={menuMovel ? 'Fechar menu' : 'Recolher menu'}><button
              onClick={menuMovel ? () => setMenuMovel(false) : toggleCollapsed}
              className="flex items-center justify-center w-[30px] h-[30px] rounded-lg text-hx-8a919c hover:bg-hx-e7e9ef hover:text-hx-20262f transition shrink-0">
              <SbPanel className="h-[18px] w-[18px]" />
            </button></Tooltip>
          </div>
        )}

        {/* Navegação */}
        <nav className={`flex-1 min-h-0 ${collapsed ? 'overflow-visible px-0 py-2' : 'overflow-y-auto overflow-x-hidden sidebar-scroll px-2 py-2'}`}>
          {collapsed ? (
            <>
              <Tooltip label={DASHBOARD.label}><NavLink to={DASHBOARD.to} end
                className={({ isActive }) => `flex items-center justify-center h-[42px] w-[42px] mx-auto my-[2.25px] rounded-[10px] transition ${
                  isActive ? 'bg-hx-f0f1f3 text-hx-20262f' : 'text-hx-6b727d hover:bg-hx-f3f4f6 hover:text-hx-2a3140'
                }`}>
                <DASHBOARD.icon className="h-[19px] w-[19px]" />
              </NavLink></Tooltip>
              {GRUPOS.map((grp) => (
                <div key={grp.label} className="group relative"
                  onMouseEnter={() => setFlyout(grp.label)} onMouseLeave={() => setFlyout(null)}
                  onFocus={() => setFlyout(grp.label)}>
                  <div
                    className={`flex items-center justify-center h-[42px] w-[42px] mx-auto my-[2.25px] rounded-[10px] transition ${
                      groupActive(grp) ? 'bg-hx-f0f1f3 text-hx-20262f' : 'text-hx-6b727d group-hover:bg-hx-f3f4f6 group-hover:text-hx-2a3140'
                    }`}>
                    <grp.icon className="h-[19px] w-[19px]" />
                  </div>
                  <div className={`${flyout === grp.label ? 'visible opacity-100' : 'invisible opacity-0'}
                                  absolute left-[62px] top-0 z-50 transition-opacity duration-150`}>
                    <div className="min-w-[236px] rounded-[14px] bg-elevado border border-hx-e8eaee pt-[14px] px-3 pb-3"
                      style={{ boxShadow: SOMBRA_MENU }}>
                      <div className="flex items-center gap-[11px] px-[14px] py-[13px] bg-hx-f4f5f7 border-b border-hx-e6e8ec -mx-3 -mt-[14px] mb-2 rounded-t-[13px]">
                        <grp.icon className="h-[18px] w-[18px] text-hx-3b4350 shrink-0" />
                        <span className="text-[12.5px] font-semibold text-hx-20262f whitespace-nowrap">{grp.label}</span>
                      </div>
                      <div className="space-y-0.5">
                        {grp.items.map((it) => (
                          <NavLink key={it.to} to={it.to} className={flyoutLinkClass} onClick={() => setFlyout(null)}>
                            <span className="flex items-center">
                              <span className="flex-1">{it.label}</span>
                              {it.fase && <Fase n={it.fase} />}
                            </span>
                          </NavLink>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </>
          ) : (
            <>
              <NavLink to={DASHBOARD.to} end
                className={({ isActive }) => `flex items-center gap-2.5 h-[37px] my-[2px] rounded-[9px] pl-3 pr-2 text-[12.5px] whitespace-nowrap transition-colors ${
                  isActive ? 'bg-hx-f0f1f3 text-hx-20262f font-semibold' : 'text-hx-6b727d font-medium hover:bg-hx-f3f4f6 hover:text-hx-2a3140'
                }`}>
                {({ isActive }) => (
                  <>
                    <DASHBOARD.icon className="h-[18px] w-[18px] shrink-0" />
                    <span className="flex-1 min-w-0 truncate text-left">{DASHBOARD.label}</span>
                    {isActive && chevAtivo}
                  </>
                )}
              </NavLink>
              {GRUPOS.map((grp) => (
                <div key={grp.label}>
                  <button onClick={() => toggleGroup(grp.label)}
                    className="w-full flex items-center gap-2.5 h-[37px] my-[2px] rounded-[9px] pl-3 pr-2 text-[12.5px] font-semibold text-hx-3b4350 hover:text-hx-20262f hover:bg-hx-f3f4f6 transition-colors whitespace-nowrap">
                    <grp.icon className="h-[18px] w-[18px] shrink-0" />
                    <span className="flex-1 text-left min-w-0 truncate">{grp.label}</span>
                    <SbChevron className={`h-[15px] w-[15px] shrink-0 text-hx-aab0ba transition-transform ${isOpen(grp.label) ? 'rotate-90' : ''}`} />
                  </button>
                  {/* Recolhe/expande com transição suave de altura (grid 0fr↔1fr). */}
                  <div className={`grid transition-[grid-template-rows] duration-200 ease-out ${isOpen(grp.label) ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
                    <div className="overflow-hidden">
                      {grp.items.map((it) => (
                        <NavLink key={it.to} to={it.to} className={childClass}>
                          {({ isActive }) => (
                            <>
                              <span className="flex-1 min-w-0 truncate">{it.label}</span>
                              {it.fase && <Fase n={it.fase} />}
                              {isActive && chevAtivo}
                            </>
                          )}
                        </NavLink>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </>
          )}
        </nav>

        {/* Rodapé / usuário (card) — clicar abre o menu (Tema / Sair) */}
        <div ref={userMenuRef} className="relative mx-2.5 mt-1.5 mb-2.5">
          {userMenuOpen && (
            <div className={`absolute z-50 ${collapsed ? 'left-full bottom-0 ml-2 w-[210px]' : 'bottom-full left-0 right-0 mb-2'}
              rounded-[14px] bg-elevado border border-hx-e8eaee p-1.5`}
              style={{ boxShadow: SOMBRA_MENU }}>
              <MenuTema tema={tema} onEscolher={(v) => { setTema(v); setUserMenuOpen(false); }} />
              <div className="h-px bg-hx-eef0f2 mx-2 my-0.5" />
              <button onClick={() => { void logout(); }}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-[10px] text-[13.5px] font-medium text-hx-d64545 hover:bg-hx-fdf2f2 transition">
                <SbLogout className="h-[18px] w-[18px] shrink-0" />
                Sair
              </button>
            </div>
          )}
          {collapsed ? (
            <Tooltip label={user?.email || ''}><button onClick={() => setUserMenuOpen((o) => !o)}
              className="w-full flex items-center justify-center p-2 rounded-[11px] border border-hx-eef0f2 hover:bg-hx-f5f6f8 transition">
              <Avatar />
            </button></Tooltip>
          ) : (
            <button onClick={() => setUserMenuOpen((o) => !o)}
              className="w-full flex items-center gap-2.5 px-2.5 py-3 rounded-[11px] border border-hx-eef0f2 hover:bg-hx-f5f6f8 transition text-left">
              <Avatar />
              <div className="flex-1 min-w-0">
                <div className="text-[12.5px] font-semibold text-hx-2a3140 leading-tight truncate">{nome}</div>
                <div className="text-[10.5px] font-medium text-hx-98a0ab leading-tight truncate">{user?.email}</div>
              </div>
              <SbChevron className={`h-[15px] w-[15px] shrink-0 text-hx-98a0ab transition-transform ${userMenuOpen ? '-rotate-90' : 'rotate-90'}`} />
            </button>
          )}
        </div>
      </aside>

      {/* `overflow-x-clip` e NÃO `overflow-x-hidden` (o `hidden` daria ao <main> uma barra de rolagem
          vertical própria). Quem rola é o documento. */}
      <main className="flex-1 min-w-0 overflow-x-clip flex flex-col">
        <div className="p-6 w-full flex-1"><ErrorBoundary key={pathname}>{children}</ErrorBoundary></div>
      </main>
    </div>
  );
}
