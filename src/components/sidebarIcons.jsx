// Ícones locais da sidebar (redesign) — paths do design handoff
// (design_handoff_sidebar/Sidebar.dc.html, objeto ICONS). viewBox 24, stroke 2, round.
// Ficam aqui — e não em icons.jsx — para não afetar as outras telas que usam os ícones antigos.

const base = (paths) => function Ico({ className = 'h-5 w-5', ...props }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true" {...props}>
      {paths}
    </svg>
  );
};

// Dashboard — grid de 4 retângulos
export const SbDashboard = base(<>
  <rect x="3" y="3" width="8" height="8" rx="1.6" />
  <rect x="13" y="3" width="8" height="5" rx="1.6" />
  <rect x="13" y="10" width="8" height="11" rx="1.6" />
  <rect x="3" y="13" width="8" height="8" rx="1.6" />
</>);

// Gestor de Orçamentos — documentos sobrepostos / "copiar"
export const SbDoc = base(<>
  <path d="M9 8h5l4 4v7a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2z" />
  <path d="M14 8v4h4" />
  <path d="M15 5.5V5a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h.5" />
</>);

// Gestor do Comercial — gráfico de linha ↗
export const SbChart = base(<>
  <polyline points="3 17 9 11 13 15 21 6" />
  <polyline points="15 6 21 6 21 12" />
</>);

// Gestor de Custos — carteira
export const SbCoins = base(<>
  <path d="M3 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2" />
  <rect x="3" y="7" width="18" height="13" rx="2" />
  <path d="M16 12.5h3.5v3H16a1.5 1.5 0 0 1 0-3z" />
</>);

// Gestor Eng. de Aplicação — planta / blueprint
export const SbCompass = base(<>
  <rect x="3" y="4" width="18" height="16" rx="2" />
  <path d="M3 9h6v11M15 4v5h6M9 14h6v6" />
</>);

// Administração — engrenagem/pessoa (círculo + ombros + ponto)
export const SbShield = base(<>
  <circle cx="12" cy="8" r="3" />
  <path d="M6 20a6 6 0 0 1 12 0" />
  <circle cx="18.5" cy="15" r="0.7" fill="currentColor" stroke="none" />
</>);

// Contatos — agenda (caderno com pessoa e lombada)
export const SbContatos = base(<>
  <rect x="5" y="3" width="15" height="18" rx="2" />
  <path d="M5 8H3M5 12H3M5 16H3" />
  <circle cx="12.5" cy="10" r="2" />
  <path d="M9 16a3.5 3.5 0 0 1 7 0" />
</>);

// Financeiro (DRE) — demonstrativo: folha com linhas de valores e um total sublinhado
export const SbFinanceiro = base(<>
  <rect x="4" y="3" width="16" height="18" rx="2" />
  <path d="M8 8h8M8 12h8" />
  <path d="M8 16.5h8" strokeWidth="2.6" />
</>);

// Chevron apontando à direita (gira 90° via CSS quando aberto)
export const SbChevron = base(<polyline points="9.5 6 15 12 9.5 18" />);

// Sino (notificações)
export const SbBell = base(<>
  <path d="M6 9a6 6 0 0 1 12 0c0 5 2 6.5 2 6.5H4S6 14 6 9z" />
  <path d="M10.3 20a1.9 1.9 0 0 0 3.4 0" />
</>);

// Lupa do buscador global (Ctrl+K) e teclado dos "Atalhos de teclado" do menu do usuário.
export const SbBusca = base(<>
  <circle cx="11" cy="11" r="7" />
  <path d="M20 20l-3.5-3.5" />
</>);
export const SbTeclado = base(<>
  <rect x="2.5" y="6" width="19" height="12" rx="2" />
  <path d="M6.5 10h.01M10 10h.01M13.5 10h.01M17 10h.01M8 14h8" />
</>);

// Botão recolher (expandida) — "painel" com seta para dentro
export const SbPanel = base(<>
  <rect x="3" y="4" width="18" height="16" rx="2.5" />
  <line x1="9" y1="4" x2="9" y2="20" />
  <path d="M14.5 9l-2.2 3 2.2 3" />
</>);

// Botão expandir (recolhida) — mesmo painel, seta para fora
export const SbPanelR = base(<>
  <rect x="3" y="4" width="18" height="16" rx="2.5" />
  <line x1="9" y1="4" x2="9" y2="20" />
  <path d="M12.3 9l2.2 3-2.2 3" />
</>);

// Sair (logout) — porta com seta saindo
export const SbLogout = base(<>
  <path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4" />
  <path d="M9 8l-4 4 4 4" />
  <line x1="5" y1="12" x2="15" y2="12" />
</>);

// Tema escuro — lua com brilho (a opção B de seis desenhos, 25/09/2026; antes era a meia-lua fina)
export const SbTema = base(<>
  <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
  <path d="M19 3v4M21 5h-4" />
</>);

// Os três temas do submenu (a lua do Escuro é o SbTema): sol, monitor e o ✓ do escolhido
export const SbSol = base(<>
  <circle cx="12" cy="12" r="4" />
  <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" />
</>);
export const SbMonitor = base(<>
  <rect x="3" y="4" width="18" height="12" rx="2" />
  <path d="M8 20h8M12 16v4" />
</>);
export const SbCheck = base(<polyline points="5 12.5 10 17.5 19 7" />);

// Trocar senha — cadeado
export const SbLock = base(<>
  <rect x="4" y="10" width="16" height="10" rx="2" />
  <path d="M8 10V7a4 4 0 0 1 8 0v3" />
</>);
