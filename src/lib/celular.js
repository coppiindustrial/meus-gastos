import { createContext, useContext, useEffect, useRef, useState } from 'react';

// O APP NO CELULAR (04/11/2026, opção A do mockup "Meus Gastos no celular": SÓ PARA VER) — COPIADO do Gestor
// (`lib/celular.js` de lá; docs/claude/celular.md daquele repositório). Diferente de lá, não há rotas `/m`: o
// `Layout` troca a barra lateral pelo casco do celular (`components/movel/LayoutMovel.jsx`) e as telas que mudam
// de desenho leem `useNoCelular()`. É o LAYOUT que decide, não a largura: uma janela estreita do computador
// continua a do computador.

// "Celular" é tela estreita E toque grosso: uma janela de computador estreita e um tablet deitado ficam de fora.
const CONSULTA = '(max-width: 767px) and (pointer: coarse)';
export function ehCelular() {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia(CONSULTA).matches;
}

// "Ver versão completa" vale para a SESSÃO do navegador (fechou o app, volta ao celular): um desvio pontual,
// não uma preferência — por isso `sessionStorage`, e não o `lsGet`.
const CHAVE = 'mg_versao_completa';
export function usarVersaoCompleta(sim) {
  try {
    if (sim) sessionStorage.setItem(CHAVE, '1');
    else sessionStorage.removeItem(CHAVE);
  } catch { /* navegação privada sem storage: segue sem lembrar */ }
}
export function querVersaoCompleta() {
  try { return sessionStorage.getItem(CHAVE) === '1'; } catch { return false; }
}

// O Layout decide: celular e sem a versão completa. Acompanha a rotação e a troca (a consulta muda ao girar).
export function useCelular() {
  const [cel, setCel] = useState(() => ehCelular() && !querVersaoCompleta());
  useEffect(() => {
    const mq = window.matchMedia?.(CONSULTA);
    if (!mq) return undefined;
    const aoMudar = () => setCel(mq.matches && !querVersaoCompleta());
    mq.addEventListener?.('change', aoMudar);
    window.addEventListener('mg:versao', aoMudar);
    return () => { mq.removeEventListener?.('change', aoMudar); window.removeEventListener('mg:versao', aoMudar); };
  }, []);
  return cel;
}
export const avisarVersao = () => window.dispatchEvent(new Event('mg:versao'));

// "ESTOU NO CELULAR": o `LayoutMovel` liga o contexto, e quem muda de desenho lê `useNoCelular()` (o `Modal` em tela
// cheia, o `CabecalhoPagina`, as telas). O contexto passa pelos portais do React.
export const ContextoMovel = createContext(false);
export const useNoCelular = () => useContext(ContextoMovel);

// A SEGUNDA LINHA DO TOPO: o `LayoutMovel` dá o nó, e a tela que precisa de uma linha presa no topo (o mês dos
// Lançamentos) a põe ali por portal.
export const ContextoTopo = createContext(null);
export const useSlotTopo = () => useContext(ContextoTopo);

// SEM ZOOM NO CELULAR ("fixo, como um app normal", a regra do Gestor): a meta `viewport` travada, o
// `touch-action: pan-x pan-y` de `html.app-movel` (index.css) e os gestos do Safari barrados. SEM `minimum-scale=1`:
// no Gestor ele dava um "estilingue" ao girar de deitado para em pé. Devolve a função que destrava.
const META_TRAVADA = 'width=device-width, initial-scale=1.0, viewport-fit=cover, maximum-scale=1, user-scalable=no';
export function travarZoom() {
  const meta = document.querySelector('meta[name="viewport"]');
  const antes = meta?.getAttribute('content');
  if (meta) meta.setAttribute('content', META_TRAVADA);
  const barrar = (e) => e.preventDefault();
  const gestos = ['gesturestart', 'gesturechange', 'gestureend'];
  gestos.forEach((g) => document.addEventListener(g, barrar, { passive: false }));
  return () => {
    if (meta && antes != null) meta.setAttribute('content', antes);
    gestos.forEach((g) => document.removeEventListener(g, barrar));
  };
}

// O TOPO NÃO SE PERDE AO GIRAR (a regra do Gestor): quem estava no alto antes do giro volta ao alto; um toque cancela.
export function segurarTopoNaRotacao() {
  let ultima = { t: 0, y: window.scrollY };
  let anterior = ultima;
  const anotar = () => { anterior = ultima; ultima = { t: performance.now(), y: window.scrollY }; };
  let timers = [];
  const cancelar = () => { timers.forEach(clearTimeout); timers = []; };
  const aoGirar = () => {
    const antes = performance.now() - ultima.t > 150 ? ultima : anterior;
    if (antes.y > 8) return;
    cancelar();
    const voltar = () => { if (window.scrollY > 0) window.scrollTo(0, 0); };
    requestAnimationFrame(voltar);
    timers = [120, 450, 900].map((ms) => setTimeout(voltar, ms));
  };
  const mq = window.matchMedia?.('(orientation: portrait)');
  window.addEventListener('scroll', anotar, { passive: true });
  window.addEventListener('orientationchange', aoGirar);
  mq?.addEventListener?.('change', aoGirar);
  window.addEventListener('touchstart', cancelar, { passive: true });
  return () => {
    cancelar();
    window.removeEventListener('scroll', anotar);
    window.removeEventListener('orientationchange', aoGirar);
    mq?.removeEventListener?.('change', aoGirar);
    window.removeEventListener('touchstart', cancelar);
  };
}

// APERTAR O VIDRO (o voltar das telas cheias): grava o ponto do toque (`--x`, `--y`, de onde nasce o brilho do
// `.vidro-mt`) e marca `.pressed` por pelo menos 150ms — num toque rápido o `:active` some antes de se ver.
export function apertarVidro(e) {
  const el = e.currentTarget;
  const r = el.getBoundingClientRect();
  el.style.setProperty('--x', `${e.clientX - r.left}px`);
  el.style.setProperty('--y', `${e.clientY - r.top}px`);
  el.classList.add('pressed');
  const inicio = performance.now();
  const soltar = () => {
    window.removeEventListener('pointerup', soltar);
    window.removeEventListener('pointercancel', soltar);
    setTimeout(() => el.classList.remove('pressed'), Math.max(0, 150 - (performance.now() - inicio)));
  };
  window.addEventListener('pointerup', soltar);
  window.addEventListener('pointercancel', soltar);
}

// A TELA CHEIA SAI DESLIZANDO para a direita, e fica montada esse tempo para a saída existir.
export const SAIDA_TELA_MS = 260;

// O "VOLTAR" DO CELULAR FECHA O PAINEL ABERTO (a gaveta, a folha, a tela cheia), em vez de sair da tela: ao abrir, o
// painel empilha uma entrada no histórico (mesma URL); o voltar a consome e o painel fecha. Fechado por dentro, a
// entrada sai com `history.back()`. A PROFUNDIDADE fica no estado da entrada (`painelMovel: 1, 2…`): com dois
// painéis abertos, o voltar fecha só o de cima. O `history.back()` do fechar ESPERA UM INSTANTE e uma montagem
// nesse intervalo reaproveita a entrada — senão o modo estrito do React (monta, desmonta, monta) abria e fechava.
let voltaPendente = null; // { prof, t }
export function useVoltarFecha(ativo, fechar) {
  const fecharRef = useRef(fechar);
  fecharRef.current = fechar;
  useEffect(() => {
    if (!ativo) return undefined;
    let prof;
    if (voltaPendente && window.history.state?.painelMovel === voltaPendente.prof) {
      clearTimeout(voltaPendente.t);
      prof = voltaPendente.prof;
      voltaPendente = null;
    } else {
      prof = (window.history.state?.painelMovel || 0) + 1;
      window.history.pushState({ ...window.history.state, painelMovel: prof }, '');
    }
    let saiuPeloVoltar = false;
    const aoVoltar = () => {
      if ((window.history.state?.painelMovel || 0) >= prof) return;
      saiuPeloVoltar = true;
      fecharRef.current();
    };
    window.addEventListener('popstate', aoVoltar);
    return () => {
      window.removeEventListener('popstate', aoVoltar);
      if (saiuPeloVoltar) return;
      const t = setTimeout(() => {
        voltaPendente = null;
        if (window.history.state?.painelMovel === prof) window.history.back();
      }, 0);
      voltaPendente = { prof, t };
    };
  }, [ativo]);
}
