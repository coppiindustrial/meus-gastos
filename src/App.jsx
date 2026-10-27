import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './context/AuthContext.jsx';
import { nuvemConfigurada } from './api/supabase.js';
import Layout from './components/Layout.jsx';
import { PageLoading } from './components/Spinner.jsx';
import { TELAS } from './lib/navegacao.js';
import Login from './pages/Login.jsx';
import Resumo from './pages/Resumo.jsx';
import EmBreve from './pages/EmBreve.jsx';
import Lancamentos from './pages/Lancamentos.jsx';
import Categorias from './pages/Categorias.jsx';
import Cartoes from './pages/Cartoes.jsx';
import ImportarHistorico from './pages/ImportarHistorico.jsx';
import Faturas from './pages/Faturas.jsx';
import Pendencias from './pages/Pendencias.jsx';
import Regras from './pages/Regras.jsx';
import Evolucao from './pages/Evolucao.jsx';

function Protected({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <PageLoading />;
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />;
  return <Layout>{children}</Layout>;
}

export default function App() {
  const { user, loading } = useAuth();
  if (!nuvemConfigurada) {
    return (
      <div className="p-10 text-center text-sm text-gray-600">
        Supabase não configurado: defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY no <code>.env.local</code>.
      </div>
    );
  }
  return (
    <Routes>
      <Route path="/login" element={user && !loading ? <Navigate to="/" replace /> : <Login />} />
      <Route path="/" element={<Protected><Resumo /></Protected>} />
      <Route path="/lancamentos" element={<Protected><Lancamentos /></Protected>} />
      <Route path="/cadastros/categorias" element={<Protected><Categorias /></Protected>} />
      <Route path="/cadastros/cartoes" element={<Protected><Cartoes /></Protected>} />
      <Route path="/cadastros/importar" element={<Protected><ImportarHistorico /></Protected>} />
      <Route path="/faturas" element={<Protected><Faturas /></Protected>} />
      <Route path="/pendencias" element={<Protected><Pendencias /></Protected>} />
      <Route path="/cadastros/regras" element={<Protected><Regras /></Protected>} />
      <Route path="/evolucao" element={<Protected><Evolucao /></Protected>} />
      {/* As telas que ainda não existem: cada uma ganha a sua rota quando a fase dela chegar. */}
      {TELAS.filter((t) => t.fase).map((t) => (
        <Route key={t.to} path={t.to} element={<Protected><EmBreve titulo={t.label} fase={t.fase} /></Protected>} />
      ))}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
