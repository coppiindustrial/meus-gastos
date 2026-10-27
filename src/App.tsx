import { useEffect } from 'react';
import { HashRouter, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { type NavDir, withTransition } from './lib/nav';
import { DialogProvider } from './components/Dialogs';
import { ErrorBoundary } from './components/ErrorBoundary';
import { isTabRoute, LoadingScreen, TabBar } from './components/Layout';
import { requestPersistentStorage } from './lib/db';
import { getCloudConfig } from './lib/supabase';
import { initSync, useSyncState } from './lib/sync';
import { Conta } from './screens/Conta';
import { Lancamentos } from './screens/Lancamentos';
import { Lancar } from './screens/Lancar';
import { Login } from './screens/Login';
import { Mais } from './screens/Mais';
import { Patrimonio } from './screens/Patrimonio';
import { Resumo } from './screens/Resumo';

// O app já volta ao topo a cada troca de tela; sem isto o Safari restaurava a rolagem antiga
// no meio da animação de voltar.
if ('scrollRestoration' in window.history) window.history.scrollRestoration = 'manual';

function Shell() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  // Todos os links internos trocam de tela com animação (deslizar ou fade nas abas).
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.('a[href^="#/"]') as HTMLAnchorElement | null;
      if (!a || a.target) return;
      // Soltar o dedo depois de deslizar uma linha (ou tocar nela aberta) não abre o link dela.
      if (a.closest('.swipe-wrap.dragging, .swipe-wrap.open, [data-drag-lock]')) return;
      const to = a.getAttribute('href')!.slice(1);
      e.preventDefault();
      e.stopPropagation();
      if (to === (window.location.hash.slice(1) || '/')) return;
      const dir = (a.dataset.nav as NavDir | undefined) ?? (a.closest('.tabbar') ? 'tab' : 'forward');
      withTransition(dir, () => navigate(to, { replace: a.dataset.replace !== undefined }));
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, [navigate]);
  // Cabeçalhos fixos: a linha fina embaixo deles só aparece depois de rolar a tela.
  useEffect(() => {
    const root = document.documentElement;
    const onScroll = () => root.classList.toggle('rolou', window.scrollY > 4);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const tabs = isTabRoute(pathname);
  return (
    <>
      {/* A chave pelo endereço faz a tela de erro sumir ao trocar de tela. */}
      <ErrorBoundary key={pathname}>
        <Routes>
          <Route path="/" element={<Resumo />} />
          <Route path="/lancamentos" element={<Lancamentos />} />
          <Route path="/lancar" element={<Lancar />} />
          <Route path="/patrimonio" element={<Patrimonio />} />
          <Route path="/mais" element={<Mais />} />
          <Route path="/mais/conta" element={<Conta />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </ErrorBoundary>
      {tabs && <TabBar pathname={pathname} />}
    </>
  );
}

/**
 * Com a nuvem configurada, o app só abre depois do login (os dados são financeiros).
 * Uma vez logado, a sessão fica guardada e o app abre mesmo sem internet.
 */
function Portao() {
  const sync = useSyncState();
  const temNuvem = getCloudConfig() !== null;
  if (temNuvem && sync.status === 'off') return <LoadingScreen tabs />;
  if (temNuvem && sync.status === 'signedout') return <Login />;
  return <Shell />;
}

export function App() {
  useEffect(() => {
    void requestPersistentStorage();
    void initSync();
  }, []);
  return (
    <HashRouter>
      <DialogProvider>
        <Portao />
      </DialogProvider>
    </HashRouter>
  );
}
