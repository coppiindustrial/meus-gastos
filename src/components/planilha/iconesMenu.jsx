// Os ícones do menu de botão direito da grade (14px, traço de 2px, a cor vem do item).
const Ico = ({ children }) => (
  <svg viewBox="0 0 24 24" className="h-[14px] w-[14px]" fill="none" stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
);

export const IcoCopiar = () => <Ico><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V5a1 1 0 0 1 1-1h10" /></Ico>;
export const IcoColar = () => <Ico><rect x="6" y="5" width="12" height="16" rx="2" /><path d="M9 5V3h6v2" /></Ico>;
export const IcoPreencher = () => <Ico><path d="M12 4v13M6 12l6 6 6-6M5 21h14" /></Ico>;
export const IcoLimpar = () => <Ico><path d="M7 7l10 10M17 7L7 17" /></Ico>;
export const IcoEtiqueta = () => <Ico><path d="M3 12V4h8l10 10-8 8z" /><circle cx="7.5" cy="8.5" r="1.2" /></Ico>;
export const IcoRevisado = () => <Ico><path d="M5 12l5 5 9-10" /></Ico>;
export const IcoAbrir = () => <Ico><rect x="4" y="4" width="16" height="16" rx="2" /><path d="M8 9h8M8 13h8M8 17h5" /></Ico>;
export const IcoAcima = () => <Ico><path d="M4 15h16M4 20h16M12 3v8M8 7h8" /></Ico>;
export const IcoAbaixo = () => <Ico><path d="M4 4h16M4 9h16M12 13v8M8 17h8" /></Ico>;
export const IcoLixeira = () => <Ico><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></Ico>;
export const IcoDesfazer = () => <Ico><path d="M9 14L4 9l5-5" /><path d="M4 9h11a5 5 0 0 1 0 10h-3" /></Ico>;
export const IcoRefazer = () => <Ico><path d="M15 14l5-5-5-5" /><path d="M20 9H9a5 5 0 0 0 0 10h3" /></Ico>;
export const IcoNaoTeve = () => <Ico><circle cx="12" cy="12" r="8" /><path d="M6.5 6.5l11 11" /></Ico>;
export const IcoAtivar = () => <Ico><rect x="3" y="7" width="18" height="10" rx="5" /><circle cx="16" cy="12" r="2.5" /></Ico>;
