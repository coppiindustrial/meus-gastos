// O TEMA da tela: Claro · Escuro · Sistema (o "Sistema" acompanha o Windows). A preferência fica
// no navegador (`lsGet`) e o escuro liga por um atributo no <html> (`data-tema="escuro"`), que é o
// que o bloco de variáveis de `tema/escuro.mjs` espera. Copiado do Gestor Coppi.
import { useCallback, useEffect, useState } from 'react';
import { lsGet, lsSet } from './storage.js';

export const TEMAS = [
  { key: 'claro', label: 'Claro' },
  { key: 'escuro', label: 'Escuro' },
  { key: 'sistema', label: 'Sistema' },
];
const CHAVE = 'tema';
const EVENTO = 'mg:tema';
const midia = () => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null);

export function lerTema() {
  const v = lsGet(CHAVE);
  return TEMAS.some((t) => t.key === v) ? v : 'claro';
}

// A preferência lida é a de QUEM está logado: o `lsGet` tira o prefixo do JWT. Sem token (a tela de
// login) ela cai no padrão, e a tela é clara.
export function aplicarTema() {
  const pref = lerTema();
  const escuro = pref === 'escuro' || (pref === 'sistema' && !!midia()?.matches);
  const html = document.documentElement;
  if (escuro) html.setAttribute('data-tema', 'escuro');
  else html.removeAttribute('data-tema');
}

// ANTES do primeiro render (main.jsx): sem isso quem usa o escuro veria a tela clara piscar até o
// `/auth/me` responder.
export function iniciarTema() {
  aplicarTema();
  // "Sistema": o Windows trocou de claro para escuro com a tela aberta. A lista fica GUARDADA num
  // módulo: um `matchMedia` sem referência pode ser coletado, e o ouvinte vai junto em silêncio.
  mqlSistema = midia();
  mqlSistema?.addEventListener?.('change', () => aplicarTema());
  // E ao VOLTAR para a janela: é o gesto natural depois de trocar o tema no Windows, e cobre o
  // navegador que não dispara o `change` (o de testes não dispara — medido: zero eventos).
  window.addEventListener('focus', () => aplicarTema());
}
let mqlSistema = null;

// O seletor do menu do usuário. O evento avisa as outras instâncias (hoje só há uma).
export function useTema() {
  const [pref, setPrefEstado] = useState(lerTema);
  useEffect(() => {
    const aoMudar = () => setPrefEstado(lerTema());
    window.addEventListener(EVENTO, aoMudar);
    return () => window.removeEventListener(EVENTO, aoMudar);
  }, []);
  const setPref = useCallback((v) => {
    lsSet(CHAVE, v);
    aplicarTema();
    setPrefEstado(v);
    window.dispatchEvent(new Event(EVENTO));
  }, []);
  return [pref, setPref];
}
