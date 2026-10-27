import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import Spinner from '../components/Spinner.jsx';
import Checkbox from '../components/Checkbox.jsx';
import { lsGet, lsSet, lsRemove, LOGIN_EMAIL_KEY } from '../lib/storage.js';
import { useTituloAba } from '../lib/useTituloAba.js';
import { CartaoAuth, PainelMarca, CampoFlutuante, IconOlhoSenha, BOTAO_AUTH } from '../components/auth/AuthUI.jsx';
import pkg from '../../package.json';

// Tela de login — o desenho do Gestor Coppi (handoff 3a). O `noValidate` no <form> desliga a bolha
// nativa do navegador e deixa o `CampoErro` grafite no comando da validação.
//
// "Criar conta" existe para o PRIMEIRO acesso. Depois dele, o cadastro é desligado no Supabase
// (Authentication → Sign In / Providers → Allow new users to sign up), e tentar de novo dá erro.
export default function Login() {
  useTituloAba('Entrar');
  const { login, criarConta } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [modo, setModo] = useState('entrar'); // 'entrar' | 'criar'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [verSenha, setVerSenha] = useState(false);
  const [lembrar, setLembrar] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [erros, setErros] = useState({});
  const criando = modo === 'criar';

  useEffect(() => {
    const salvo = lsGet(LOGIN_EMAIL_KEY);
    if (salvo) { setEmail(salvo); setLembrar(true); }
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    const novosErros = { email: !email.trim(), password: !password || (criando && password.length < 8) };
    setErros(novosErros);
    if (Object.values(novosErros).some(Boolean)) return;
    setLoading(true);
    try {
      if (criando) {
        const r = await criarConta(email, password);
        if (r.precisaConfirmar) {
          toast.info('Conta criada. Confirme pelo link enviado ao seu e-mail e depois entre.');
          setModo('entrar');
          return;
        }
      } else {
        await login(email, password);
      }
      // Só grava DEPOIS do sucesso: guardar um e-mail errado faria a próxima visita abrir com ele.
      if (lembrar) lsSet(LOGIN_EMAIL_KEY, email); else lsRemove(LOGIN_EMAIL_KEY);
      navigate('/');
    } catch (err) {
      setError(err.message || 'Falha no login.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <CartaoAuth>
      <PainelMarca>
        <div className="relative flex flex-1 flex-col justify-center" style={{ transform: 'translateY(-34px)' }}>
          <h1 className="font-extrabold leading-[1.15] tracking-[-0.01em] text-white" style={{ fontSize: 35 }}>
            Finanças<br />pessoais
          </h1>
          <p className="mt-[16px] max-w-[320px] text-[15px] font-medium leading-[1.6]" style={{ color: 'rgba(255,255,255,.72)' }}>
            Gastos, faturas de cartão, entradas e patrimônio num só lugar.
          </p>
        </div>
      </PainelMarca>

      <div className="flex flex-1 flex-col justify-center px-8 py-10 sm:px-12">
        {/* Marca compacta no celular, onde o painel não existe. */}
        <div className="mb-7 text-center md:hidden">
          <img src={`${import.meta.env.BASE_URL}icon.svg`} alt="" className="mx-auto mb-3 h-14 w-14 rounded-[12px]" />
          <div className="text-[15px] font-bold text-hx-1b1e3a">Meus Gastos</div>
        </div>

        <div className="mx-auto w-full max-w-[320px]">
          <h2 className="text-[24px] font-extrabold leading-[1.2] tracking-[-0.01em] text-hx-1b1e3a">
            {criando ? 'Criar conta' : 'Entrar'}
          </h2>
          <p className="mt-2 text-[13px] font-medium text-hx-6b7089">
            {criando ? 'Primeiro acesso: defina seu e-mail e uma senha.' : 'Acesse sua conta para continuar.'}
          </p>

          <form onSubmit={submit} noValidate>
            <div className="mb-5 mt-8 flex flex-col gap-[27px]">
              <CampoFlutuante id="email" label="E-mail" tipo="email" autoFocus autoComplete="username"
                valor={email} erro={erros.email}
                onChange={(e) => { setEmail(e.target.value); setErros((er) => ({ ...er, email: false })); }} />
              <CampoFlutuante id="senha" label="Senha" tipo={verSenha ? 'text' : 'password'}
                autoComplete={criando ? 'new-password' : 'current-password'}
                valor={password} erro={erros.password}
                textoErro={criando && password ? 'Use pelo menos 8 caracteres' : undefined}
                onChange={(e) => { setPassword(e.target.value); setErros((er) => ({ ...er, password: false })); }}
                acessorio={(
                  <button type="button" onClick={() => setVerSenha((v) => !v)}
                    aria-label={verSenha ? 'Ocultar senha' : 'Mostrar senha'}
                    title={verSenha ? 'Ocultar senha' : 'Mostrar senha'}
                    className="absolute right-0 top-[7px] text-hx-6b7089 transition-colors hover:text-hx-2b2f52">
                    <IconOlhoSenha oculta={!verSenha} />
                  </button>
                )} />
            </div>

            <div className="mb-6 flex items-center justify-between gap-3">
              {/* O rótulo é IRMÃO da caixa: o `Checkbox` já é um <label> com <input> dentro. */}
              <span className="flex items-center gap-2">
                <Checkbox size="sm" checked={lembrar} onChange={(e) => setLembrar(e.target.checked)} title="Lembrar meu e-mail" />
                <button type="button" onClick={() => setLembrar((v) => !v)}
                  className="whitespace-nowrap text-[12.25px] font-medium text-hx-2b2f52">
                  Lembrar-me
                </button>
              </span>
            </div>

            {error && <div className="mb-4 text-[13px] font-medium text-hx-dc2626">{error}</div>}

            <button type="submit" disabled={loading} className={BOTAO_AUTH}
              style={{ boxShadow: '0 10px 22px -10px rgba(36,40,80,.55)' }}>
              {loading && <Spinner className="h-[17px] w-[17px]" />} {criando ? 'Criar conta' : 'Entrar'}
            </button>
          </form>

          <div className="mt-5 text-center">
            <button type="button" onClick={() => { setModo(criando ? 'entrar' : 'criar'); setError(''); setErros({}); }}
              className="text-[12.25px] font-medium text-hx-414d8c hover:underline">
              {criando ? 'Já tenho conta: entrar' : 'Primeiro acesso? Criar conta'}
            </button>
          </div>

          <div className="mt-[22px] text-center text-[11px] font-semibold tracking-[.05em] text-hx-9aa0b8">v{pkg.version}</div>
        </div>
      </div>
    </CartaoAuth>
  );
}
