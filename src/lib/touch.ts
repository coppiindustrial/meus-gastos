// Toque: efeito de vidro que cresce e volta, e vibração leve (como no Hevy).

const HAPTICS_KEY = 'mg.haptics';

export function hapticsEnabled(): boolean {
  try {
    return localStorage.getItem(HAPTICS_KEY) !== 'off';
  } catch {
    return true;
  }
}

export function setHapticsEnabled(on: boolean): void {
  try {
    localStorage.setItem(HAPTICS_KEY, on ? 'on' : 'off');
  } catch {
    // sem armazenamento: fica ligado
  }
  // No iPhone, interruptor desligado = película sem efeito (não vibra).
  const sw = document.getElementById('mt-haptic-switch') as HTMLInputElement | null;
  if (sw) sw.disabled = !on;
}

const PRESSABLE = '.glass, .pill-primary, .tap-head';
const VIBRATE_ON = [
  '.glass',
  '.pill-primary',
  '.btn',
  '.tab',
  '.set-check',
  '.check-circle',
  '.set-type',
  '.seg > a',
  '.cal-day',
  '.list-item',
  '.action-item',
  '.folder-head',
  '.unit-toggle',
  '.import-chip',
  '.ex-chip',
].join(', ');

const canVibrate = () => typeof navigator.vibrate === 'function';
const isTouchIOS = () => !canVibrate() && 'ontouchstart' in window;

/** Vibração curtinha no Android. No iPhone ela vem do toque no interruptor escondido (veja abaixo). */
function vibrateAndroid(): void {
  if (!hapticsEnabled() || !canVibrate()) return;
  // Antes do primeiro toque de verdade o navegador bloqueia (e reclama no console).
  const activation = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation;
  if (activation && !activation.hasBeenActive) return;
  try {
    navigator.vibrate(8);
  } catch {
    // aparelho sem vibração
  }
}

/** "Tique" ao pegar um item com toque longo. Só no Android: o iPhone não deixa vibrar fora de um toque comum. */
export function tick(): void {
  vibrateAndroid();
}

const SWITCH_ID = 'mt-haptic-switch';

/**
 * iPhone: desde o iOS 26.5 o Safari só vibra quando o próprio dedo aciona um interruptor
 * (<input type="checkbox" switch>). Cada botão ganha, por dentro, uma película invisível
 * (<label>) ligada a um interruptor escondido: o toque cai nela, o iPhone vibra e o clique
 * continua subindo para o botão normalmente. A película fica sempre no lugar (não aparece
 * nem some durante o toque), para não atrapalhar o clique.
 */
function installIOSHaptics(): void {
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.setAttribute('switch', '');
  input.id = SWITCH_ID;
  input.tabIndex = -1;
  input.disabled = !hapticsEnabled();
  input.setAttribute('aria-hidden', 'true');
  input.style.cssText = 'position:fixed;left:0;top:0;width:1px;height:1px;opacity:0;pointer-events:none;';
  document.body.appendChild(input);

  // Só em botões "simples": nada de película sobre campos ou sobre outros botões dentro dele.
  const attach = (el: Element) => {
    if (el.tagName === 'LABEL' || el.querySelector(':scope > .hap-film')) return;
    if (el.querySelector('button, a, input, select, textarea, label:not(.hap-film)')) return;
    const film = document.createElement('label');
    film.className = 'hap-film';
    film.htmlFor = SWITCH_ID;
    film.setAttribute('aria-hidden', 'true');
    el.appendChild(film);
  };
  const scan = (root: ParentNode) => {
    if (root instanceof Element && root.matches(VIBRATE_ON)) attach(root);
    root.querySelectorAll(VIBRATE_ON).forEach(attach);
  };
  scan(document.body);
  let queued = false;
  new MutationObserver(() => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      scan(document.body);
    });
  }).observe(document.body, { childList: true, subtree: true });
}

/** Liga o efeito de pressionar (visível até em toque rápido) e a vibração nos botões. */
export function installTouchFeedback(): void {
  // No iPhone, o Safari só mostra :active se houver um ouvinte de toque.
  document.addEventListener('touchstart', () => undefined, { passive: true });

  document.addEventListener(
    'pointerdown',
    (e) => {
      const el = (e.target as Element | null)?.closest?.(PRESSABLE) as HTMLElement | null;
      if (!el) return;
      const r = el.getBoundingClientRect();
      el.style.setProperty('--x', `${e.clientX - r.left}px`);
      el.style.setProperty('--y', `${e.clientY - r.top}px`);
      el.classList.add('pressed');
      const started = performance.now();
      const release = () => {
        window.removeEventListener('pointerup', release);
        window.removeEventListener('pointercancel', release);
        // Segura o efeito um pouquinho para aparecer mesmo num toque rápido.
        setTimeout(() => el.classList.remove('pressed'), Math.max(0, 150 - (performance.now() - started)));
      };
      window.addEventListener('pointerup', release);
      window.addEventListener('pointercancel', release);
    },
    { passive: true },
  );

  if (isTouchIOS()) {
    installIOSHaptics();
  } else {
    document.addEventListener(
      'click',
      (e) => {
        if (!e.isTrusted) return;
        const el = (e.target as Element | null)?.closest?.(VIBRATE_ON) as HTMLElement | null;
        if (el && !(el as HTMLButtonElement).disabled) vibrateAndroid();
      },
      true,
    );
  }
}
