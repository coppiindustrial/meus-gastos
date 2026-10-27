import { createClient } from '@supabase/supabase-js';

// A conexão com o Supabase. URL e chave PUBLISHABLE vêm do build (`.env.local` em dev, `deploy.yml` em
// produção) — a chave é pública por design; quem protege os dados é o login + o RLS das tabelas.
const url = import.meta.env.VITE_SUPABASE_URL;
const chave = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const nuvemConfigurada = Boolean(url && chave);

export const supabase = nuvemConfigurada
  ? createClient(url, chave, { auth: { persistSession: true, autoRefreshToken: true, storageKey: 'mg:auth' } })
  : null;

// Mensagens do Supabase em português. Só o que a pessoa pode resolver vira texto próprio; o resto
// passa adiante como veio.
export function mensagemErro(err) {
  const m = String(err?.message || err || '');
  if (m.includes('Invalid login')) return 'E-mail ou senha incorretos.';
  if (m.includes('Email not confirmed')) return 'Confirme seu e-mail pelo link que o Supabase enviou e tente de novo.';
  if (/signups? not allowed|signup is disabled/i.test(m)) return 'A criação de contas está desativada.';
  if (/already registered/i.test(m)) return 'Já existe uma conta com esse e-mail.';
  if (/password should be at least/i.test(m)) return 'A senha precisa ter pelo menos 8 caracteres.';
  if (/failed to fetch|network/i.test(m)) return 'Sem conexão com o servidor. Verifique a internet.';
  return m || 'Algo deu errado.';
}

// Para as chamadas de dados: devolve `data` ou lança com a mensagem em português.
export async function exigir(promessa) {
  const { data, error } = await promessa;
  if (error) throw new Error(mensagemErro(error));
  return data;
}
