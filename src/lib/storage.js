// Acesso seguro ao localStorage (preferências de tela: tema, largura da barra lateral, filtros).
// Em modo privado/quota excedida o navegador pode lançar — os helpers engolem o erro e a preferência
// simplesmente não persiste.
//
// Diferente do Gestor, não há namespace por usuário: o app tem um usuário só. O prefixo `mg:` evita
// colisão com outros apps servidos no mesmo domínio (o GitHub Pages da conta).
//
// NUNCA guarde aqui dado financeiro (valores, lançamentos): só preferência de tela.

const PREFIXO = 'mg:';

// O e-mail do "Lembrar-me" da tela de login. Só o e-mail, nunca a senha.
export const LOGIN_EMAIL_KEY = 'login_email';

export function lsGet(key) {
  try { return localStorage.getItem(PREFIXO + key); } catch { return null; }
}

export function lsSet(key, value) {
  try { localStorage.setItem(PREFIXO + key, value); } catch { /* ignora */ }
}

export function lsRemove(key) {
  try { localStorage.removeItem(PREFIXO + key); } catch { /* ignora */ }
}
