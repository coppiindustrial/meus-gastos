import { useState } from 'react';
import { useDialogs } from '../components/Dialogs';
import { Icon } from '../components/Icon';
import { getClient } from '../lib/supabase';
import { initSync, syncNow } from '../lib/sync';

/** Mensagens do Supabase em português. */
export function mensagemErroAuth(message: string): string {
  if (message.includes('Invalid login')) return 'E-mail ou senha incorretos.';
  if (message.includes('Email not confirmed')) return 'Confirme seu e-mail pelo link que o Supabase enviou e tente de novo.';
  if (/signups? not allowed|signup is disabled/i.test(message)) return 'A criação de contas está desativada neste app.';
  if (/fetch|network/i.test(message)) return 'Sem conexão com a nuvem. Verifique a internet.';
  return message;
}

/** Tela de entrada: aparece quando a nuvem está configurada e ninguém está logado. */
export function Login() {
  const { toast } = useDialogs();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const auth = async (mode: 'login' | 'signup') => {
    const sb = getClient();
    if (!sb) return;
    if (!email.trim() || password.length < 8) {
      setError('Informe o e-mail e uma senha com pelo menos 8 caracteres.');
      return;
    }
    setBusy(true);
    setError(null);
    const { data, error: err } =
      mode === 'login'
        ? await sb.auth.signInWithPassword({ email: email.trim(), password })
        : await sb.auth.signUp({ email: email.trim(), password });
    setBusy(false);
    if (err) {
      setError(mensagemErroAuth(err.message));
      return;
    }
    if (mode === 'signup' && !data.session) {
      toast('Conta criada. Confirme pelo e-mail e depois entre.');
      return;
    }
    setPassword('');
    await initSync();
    void syncNow();
  };

  return (
    <main className="screen no-tabs">
      <div className="col" style={{ alignItems: 'center', textAlign: 'center', gap: 10, marginTop: 40 }}>
        <div className="letter big on" style={{ width: 72, height: 72, borderRadius: 20 }}>
          <Icon name="lock" size={34} stroke={2.25} />
        </div>
        <h1 className="display" style={{ fontSize: 40 }}>
          Meus Gastos
        </h1>
        <p className="muted">Entre para ver suas finanças.</p>
      </div>
      <form
        className="col"
        style={{ gap: 16 }}
        onSubmit={(e) => {
          e.preventDefault();
          void auth('login');
        }}
      >
        <label className="field">
          <span className="label">E-mail</span>
          <input className="input" type="email" autoComplete="email" value={email} placeholder="voce@email.com" onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="field">
          <span className="label">Senha</span>
          <input className="input" type="password" autoComplete="current-password" value={password} placeholder="Sua senha" onChange={(e) => setPassword(e.target.value)} />
        </label>
        {error && (
          <p role="alert" style={{ color: 'var(--danger)', fontWeight: 700 }}>
            {error}
          </p>
        )}
        <button type="submit" className="btn big primary block" disabled={busy}>
          Entrar
        </button>
      </form>
      <button type="button" className="text-btn muted" disabled={busy} onClick={() => void auth('signup')}>
        Primeiro acesso? Criar conta
      </button>
    </main>
  );
}
