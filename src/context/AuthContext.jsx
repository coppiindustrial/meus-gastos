import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { mensagemErro, supabase } from '../api/supabase.js';

// Sessão do Supabase. O `user` é o do Supabase Auth (`id`, `email`, `user_metadata`); a sessão fica
// guardada pelo próprio supabase-js e é renovada sozinha.
const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(Boolean(supabase));

  useEffect(() => {
    if (!supabase) return undefined;
    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_evento, sessao) => setUser(sessao?.user ?? null));
    return () => sub.subscription.unsubscribe();
  }, []);

  const login = useCallback(async (email, senha) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: senha });
    if (error) throw new Error(mensagemErro(error));
    return data.user;
  }, []);

  // Só existe para o primeiro acesso: depois de criar a conta, o cadastro é desligado no Supabase.
  const criarConta = useCallback(async (email, senha) => {
    const { data, error } = await supabase.auth.signUp({ email: email.trim(), password: senha });
    if (error) throw new Error(mensagemErro(error));
    return { user: data.user, precisaConfirmar: !data.session };
  }, []);

  const logout = useCallback(async () => {
    await supabase?.auth.signOut();
  }, []);

  const valor = useMemo(() => ({
    user,
    loading,
    login,
    criarConta,
    logout,
    // Nome para o rodapé da barra lateral: o do cadastro, ou a parte do e-mail antes do @.
    nome: user?.user_metadata?.name || (user?.email ? user.email.split('@')[0] : ''),
  }), [user, loading, login, criarConta, logout]);

  return <AuthCtx.Provider value={valor}>{children}</AuthCtx.Provider>;
}

export function useAuth() {
  return useContext(AuthCtx);
}
