import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import { TEMAS, useTema } from '../../lib/tema.js';
import useEscape from '../../lib/useEscape.js';
import useContadores from '../../lib/useContadores.js';
import { TELAS, SOLTOS } from '../../lib/navegacao.js';
import {
  ContextoMovel, ContextoTopo, avisarVersao, segurarTopoNaRotacao, travarZoom, usarVersaoCompleta,
} from '../../lib/celular.js';
import PainelMovel from './PainelMovel.jsx';
import PaletaBusca from '../busca/PaletaBusca.jsx';
import ErrorBoundary from '../ErrorBoundary.jsx';

// O CASCO DO APP NO CELULAR (04/11/2026, opção A do mockup "Meus Gastos no celular" — SÓ PARA VER), COPIADO do
// `LayoutMovel` do Gestor: topo fixo com o ☰, o nome da tela, a lupa da busca rápida e o avatar; a GAVETA lateral
// com as telas de leitura; e a folha do usuário (tema, versão completa, sair). Gaveta e folha com mola e arrastar para
// fechar (`PainelMovel`), o fio do topo só depois de rolar, e o voltar do aparelho fechando o painel de cima.
//
// As telas da gaveta são as de LER: lançar, importar, cadastrar e classificar ficam no computador (as rotas continuam
// abrindo, com o desenho de lá, para quem chegar por um link). Trocar de tela pela gaveta SUBSTITUI a entrada do
// histórico: com o painel aberto, a entrada de cima é a dele, e empilhar a tela nova deixaria um "voltar" morto.
const ICONES = {
  '/': <><rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" /></>,
  '/lancamentos': <path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01" />,
  '/fixos': <><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M4 10h16M9 3v4M15 3v4" /></>,
  '/cadastros/cartoes': <><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20" /></>,
  '/patrimonio': <path d="M3 21h18M5 21V10l7-5 7 5v11M9 21v-6h6v6" />,
};
export const SECOES_MOVEL = [
  { to: '/', label: 'Visão geral' },
  { to: '/lancamentos', label: 'Lançamentos' },
  { to: '/fixos', label: 'Gastos fixos', contador: 'fixos', dica: 'a lançar' },
  { to: '/cadastros/cartoes', label: 'Cartões' },
  { to: '/patrimonio', label: 'Patrimônio' },
];
const Icone = ({ para }) => (
  <svg viewBox="0 0 24 24" className="h-[20px] w-[20px] shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{ICONES[para]}</svg>
);
const ICONE_APP = `${import.meta.env.BASE_URL}icon.svg`;
const iniciais = (nome) =>
  (String(nome || '').trim().split(/[\s._-]+/).filter(Boolean).map((p) => p[0]).slice(0, 2).join('') || '?').toUpperCase();

export default function LayoutMovel({ children }) {
  const { user, nome, logout } = useAuth();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const contadores = useContadores(Boolean(user));
  const [gaveta, setGaveta] = useState(false);
  const [folha, setFolha] = useState(false);
  const [busca, setBusca] = useState(false);
  const [rolou, setRolou] = useState(false);
  const [slotTopo, setSlotTopo] = useState(null); // a segunda linha do topo (`useSlotTopo`)
  const atual = SECOES_MOVEL.find((s) => (s.to === '/' ? pathname === '/' : pathname.startsWith(s.to)));
  const titulo = atual?.label ?? [...SOLTOS, ...TELAS].find((t) => t.to !== '/' && pathname.startsWith(t.to))?.label ?? 'Meus Gastos';

  // Trocar de tela fecha a gaveta e a folha.
  useEffect(() => { setGaveta(false); setFolha(false); }, [pathname]);
  useEscape(gaveta, () => setGaveta(false));
  useEscape(folha, () => setFolha(false));

  // `html.app-movel` liga as regras de toque do celular (index.css) só enquanto este casco existe; o zoom fica
  // travado no mesmo intervalo e volta ao sair para a versão completa.
  useEffect(() => {
    document.documentElement.classList.add('app-movel');
    const destravar = travarZoom();
    const soltarTopo = segurarTopoNaRotacao();
    return () => { document.documentElement.classList.remove('app-movel'); destravar(); soltarTopo(); };
  }, []);

  // O FIO DO TOPO só aparece depois de rolar: parado no topo, o cabeçalho se funde com a tela.
  useEffect(() => {
    const aoRolar = () => setRolou(window.scrollY > 4);
    aoRolar();
    window.addEventListener('scroll', aoRolar, { passive: true });
    return () => window.removeEventListener('scroll', aoRolar);
  }, []);
  // A tela nova começa do alto (o documento é quem rola).
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);

  const irPara = (s) => {
    if (s.to === atual?.to) { setGaveta(false); return; }
    navigate(s.to, { replace: true });
  };
  const versaoCompleta = () => { usarVersaoCompleta(true); avisarVersao(); };

  const Numero = ({ n, dica }) => (n > 0 ? (
    <span className="ml-auto inline-grid h-[20px] min-w-[20px] place-items-center rounded-full bg-hx-fdf3d9 px-1.5 text-[11.5px] font-semibold text-hx-9a6f00"
      title={`${n} ${dica}`}>{n}</span>
  ) : null);

  return (
    <div className="fundo-movel flex min-h-[100dvh] flex-col bg-gray-50">
      <header style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
        className={`fundo-movel sticky top-0 z-30 shrink-0 border-b bg-white transition-[border-color,box-shadow] duration-200 ${
          rolou ? 'border-gray-200 shadow-sm' : 'border-transparent'}`}>
        {/* A margem segura das laterais (o iPhone deitado): o fundo vai até a borda, só o conteúdo recua. */}
        <div className="flex h-[56px] items-center gap-0.5"
          style={{ paddingLeft: 'calc(env(safe-area-inset-left, 0px) + 4px)', paddingRight: 'calc(env(safe-area-inset-right, 0px) + 4px)' }}>
          <button type="button" onClick={() => setGaveta(true)} aria-label="Abrir o menu" aria-expanded={gaveta}
            className="toque toque-icone relative flex h-[44px] w-[44px] items-center justify-center rounded-lg text-gray-700">
            <svg viewBox="0 0 24 24" className="h-[22px] w-[22px]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M4 7h16M4 12h16M4 17h16" />
            </svg>
            {contadores.fixos > 0 && <span className="absolute right-[9px] top-[10px] h-[7px] w-[7px] rounded-full bg-hx-f59e0b" aria-hidden="true" />}
          </button>
          <h1 className="min-w-0 flex-1 truncate pl-1 text-[16px] font-bold text-gray-900">{titulo}</h1>
          <button type="button" onClick={() => setBusca(true)} aria-label="Buscar"
            className="toque toque-icone flex h-[44px] w-[44px] items-center justify-center rounded-lg text-gray-600">
            <svg viewBox="0 0 24 24" className="h-[20px] w-[20px]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" />
            </svg>
          </button>
          <button type="button" onClick={() => setFolha(true)} aria-label="Menu do usuário" aria-expanded={folha}
            className="toque toque-icone flex h-[44px] w-[44px] items-center justify-center rounded-lg">
            <span className="flex h-[32px] w-[32px] items-center justify-center rounded-[9px] text-[12px] font-bold text-white"
              style={{ background: 'linear-gradient(135deg,#414d8c,rgba(65,77,140,.75))' }}>{iniciais(nome)}</span>
          </button>
        </div>
        {/* A segunda linha do topo, para a tela que precisar (`useSlotTopo`): vazia, não ocupa nada. */}
        <div ref={setSlotTopo} />
      </header>

      <main className="min-w-0 flex-1 pb-6 pt-3"
        style={{ paddingLeft: 'calc(env(safe-area-inset-left, 0px) + 12px)', paddingRight: 'calc(env(safe-area-inset-right, 0px) + 12px)' }}>
        <ContextoMovel.Provider value>
          <ContextoTopo.Provider value={slotTopo}>
            <ErrorBoundary key={pathname}>{children}</ErrorBoundary>
          </ContextoTopo.Provider>
        </ContextoMovel.Provider>
      </main>

      <PainelMovel aberto={gaveta} onFechar={() => setGaveta(false)} lado="esquerda" rotulo="Menu"
        className="flex w-[280px] max-w-[85vw] flex-col gap-[2px] bg-white px-[10px] pb-4 pt-3 shadow-xl">
        <div className="mb-2 flex items-center gap-[10px] px-2">
          <img src={ICONE_APP} alt="" className="h-[32px] w-[32px] rounded-[8px]" />
          <div className="min-w-0">
            <div className="text-[15px] font-bold text-gray-900">Meus Gastos</div>
            <div className="text-[11.5px] text-gray-500">Finanças pessoais</div>
          </div>
        </div>
        <nav aria-label="Telas" className="flex flex-col gap-[2px]">
          {SECOES_MOVEL.map((s) => {
            const on = atual?.to === s.to;
            return (
              <button key={s.to} type="button" onClick={() => irPara(s)} aria-current={on ? 'page' : undefined}
                className={`toque flex h-[48px] items-center gap-3 rounded-lg px-3 text-left text-[15px] font-semibold ${
                  on ? 'bg-hx-f0f1f3 text-hx-20262f' : 'text-gray-700 active:bg-gray-100'}`}>
                <Icone para={s.to} />{s.label}
                <Numero n={contadores[s.contador]} dica={s.dica} />
              </button>
            );
          })}
        </nav>
        <div className="mx-1 my-2 border-t border-gray-200" />
        <button type="button" onClick={versaoCompleta}
          className="toque flex h-[48px] items-center rounded-lg px-3 text-left text-[14px] font-medium text-gray-600 active:bg-gray-100">
          Ver versão completa
        </button>
        <button type="button" onClick={() => { void logout(); }}
          className="toque flex h-[48px] items-center rounded-lg px-3 text-left text-[14px] font-medium text-red-700 active:bg-gray-100">
          Sair
        </button>
        <p className="mt-auto px-3 text-[11.5px] leading-snug text-gray-400">
          No celular o app é só para ver. Lançar, importar e cadastrar ficam no computador.
        </p>
      </PainelMovel>

      <PainelMovel aberto={folha} onFechar={() => setFolha(false)} lado="baixo" rotulo="Menu do usuário"
        className="flex flex-col gap-[2px] bg-white px-3 pt-2 shadow-xl">
        <div className="mb-1 flex items-center gap-3 border-b border-gray-200 px-2 pb-3">
          <span className="flex h-[40px] w-[40px] items-center justify-center rounded-[10px] text-[14px] font-bold text-white"
            style={{ background: 'linear-gradient(135deg,#414d8c,rgba(65,77,140,.75))' }}>{iniciais(nome)}</span>
          <div className="min-w-0">
            <div className="truncate text-[15px] font-semibold text-gray-900">{nome}</div>
            <div className="truncate text-[12.5px] text-gray-500">{user?.email}</div>
          </div>
        </div>
        <SeletorTema />
        <button type="button" onClick={versaoCompleta}
          className="toque flex h-[52px] items-center rounded-lg px-2 text-left text-[15px] font-medium text-gray-700 active:bg-gray-100">
          Ver versão completa<span className="ml-auto text-[12.5px] text-gray-500">telas do computador</span>
        </button>
        <button type="button" onClick={() => { void logout(); }}
          className="toque flex h-[52px] items-center rounded-lg px-2 text-left text-[15px] font-medium text-red-700 active:bg-gray-100">
          Sair
        </button>
      </PainelMovel>

      <PaletaBusca aberto={busca} onFechar={() => setBusca(false)} />
    </div>
  );
}

// O tema: os três do app (`lib/tema.js`), lado a lado — o submenu por hover do computador não serve ao toque.
function SeletorTema() {
  const [tema, setTema] = useTema();
  return (
    <div className="flex h-[52px] items-center gap-2 px-2 text-[15px] font-medium text-gray-700">
      Tema
      <div className="ml-auto flex gap-[6px]">
        {TEMAS.map((t) => (
          <button key={t.key} type="button" onClick={() => setTema(t.key)} aria-pressed={tema === t.key}
            className={`toque h-[34px] rounded-[7px] border px-[10px] text-[13px] ${tema === t.key
              ? 'border-gray-400 bg-hx-f0f1f3 font-semibold text-hx-20262f'
              : 'border-gray-300 text-gray-700 active:bg-gray-100'}`}>
            {t.label}
          </button>
        ))}
      </div>
    </div>
  );
}
