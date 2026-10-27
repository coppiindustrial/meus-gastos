/**
 * Bolha do menu de abas no estilo do iOS 26 (versão "Suave 2", velocidade "Mais rápida", escolhidas no protótipo):
 * ao encostar, a pílula vira uma lente de vidro um pouco maior; dá para arrastar o dedo pelo menu
 * (a lente segue, estica de leve e amplia o ícone embaixo); ao soltar, assenta na aba com uma mola.
 * Tudo com molas em JS (requestAnimationFrame), sem re-renderizar o React.
 */

const LENS = { w: 1.14, h: 1.28, mag: 0.14, stretch: 0.06, pillFade: 0.6 };

// Velocidade escolhida no protótipo ("Mais rápida", 1,6×): acelera todas as molas na mesma proporção,
// sem mudar o quanto elas balançam (rigidez × 1,6², amortecimento × 1,6).
const SPEED = 1.6;
const spring = (k: number, c: number) => ({ k: k * SPEED * SPEED, c: c * SPEED });
const FOLLOW = spring(900, 48); // seguindo o dedo: rápido e sem balançar
const SETTLE = spring(420, 38); // assentando na aba: quase sem quique
const LENS_SPRING = spring(700, 44); // a lente aparece rápido, até num toque curto
const SIZE = spring(520, 30); // largura e altura da bolha
// Num toque rápido a lente fica acesa pelo menos este tempo e só murcha quando a bolha chega na aba.
const MIN_LENS_MS = 320 / SPEED;

interface State {
  x: number;
  vx: number;
  w: number;
  vw: number;
  h: number;
  vh: number;
  L: number;
  vL: number;
  tx: number;
  tw: number;
  th: number;
  tL: number;
  k: number;
  c: number;
}

function step(p: number, v: number, target: number, k: number, c: number, dt: number): [number, number] {
  const a = -k * (p - target) - c * v;
  const nv = v + a * dt;
  return [p + nv * dt, nv];
}

export class LiquidTabs {
  private s: State = { x: 0, vx: 0, w: 0, vw: 0, h: 0, vh: 0, L: 0, vL: 0, tx: 0, tw: 0, th: 0, tL: 0, ...SETTLE };
  private raf: number | null = null;
  private last = 0;
  private held = false;
  private pressedAt = 0;
  private deflateAt: number | null = null;
  private readonly reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

  constructor(
    private readonly row: HTMLElement,
    private readonly pill: HTMLElement,
    private readonly lens: HTMLElement,
    private readonly tabs: () => HTMLElement[],
    private readonly count: number,
  ) {}

  private geo() {
    const slot = (this.row.clientWidth - 10) / this.count;
    return { slot, h: this.row.clientHeight - 10, center: (i: number) => 5 + slot * (i + 0.5) };
  }

  nearest(x: number): number {
    const { slot } = this.geo();
    if (!slot) return 0;
    return Math.max(0, Math.min(this.count - 1, Math.floor((x - 5) / slot)));
  }

  /** Coloca a bolha na aba, sem animação (início, mudança de tamanho da tela). */
  snap(i: number): void {
    const g = this.geo();
    Object.assign(this.s, { x: g.center(i), tx: g.center(i), w: g.slot, tw: g.slot, h: g.h, th: g.h, L: 0, tL: 0, vx: 0, vw: 0, vh: 0, vL: 0 });
    this.draw();
  }

  /** Dedo encostou: vira lente e vai para baixo do dedo. */
  press(x: number): void {
    this.held = true;
    this.pressedAt = performance.now();
    this.deflateAt = null;
    const g = this.geo();
    this.s.tw = g.slot * LENS.w;
    this.s.th = g.h * LENS.h;
    this.s.tL = 1;
    this.move(x);
  }

  move(x: number): void {
    const g = this.geo();
    Object.assign(this.s, FOLLOW);
    this.s.tx = Math.max(g.center(0) - g.slot * 0.35, Math.min(g.center(this.count - 1) + g.slot * 0.35, x));
    this.kick();
  }

  /** Dedo saiu: a bolha vai (ainda como lente) até a aba e só então volta a ser pílula. */
  release(i: number): void {
    this.held = false;
    const g = this.geo();
    Object.assign(this.s, SETTLE);
    this.s.tx = g.center(i);
    this.deflateAt = Math.max(performance.now(), this.pressedAt + MIN_LENS_MS);
    this.kick();
  }

  /** Vai até a aba (ex.: a tela mudou por outro caminho). Se a lente estiver acesa, ela murcha ao chegar. */
  settle(i: number): void {
    const g = this.geo();
    Object.assign(this.s, SETTLE);
    this.s.tx = g.center(i);
    if (!this.held && this.deflateAt === null) this.rest();
    this.kick();
  }

  private rest(): void {
    const g = this.geo();
    this.s.tw = g.slot;
    this.s.th = g.h;
    this.s.tL = 0;
  }

  destroy(): void {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = null;
  }

  private kick(): void {
    if (this.reduce) {
      if (!this.held) {
        this.deflateAt = null;
        this.rest();
      }
      Object.assign(this.s, { x: this.s.tx, w: this.s.tw, h: this.s.th, L: this.s.tL, vx: 0 });
      this.draw();
      return;
    }
    if (this.raf) return;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  private frame = (now: number): void => {
    const s = this.s;
    const dt = Math.min(1 / 30, Math.max(1 / 240, (now - this.last) / 1000));
    this.last = now;
    // Passos pequenos (até 1/240 s): as molas continuam estáveis mesmo se o aparelho pular quadros.
    for (let rem = dt; rem > 1e-6; rem -= 1 / 240) {
      const h = Math.min(rem, 1 / 240);
      [s.x, s.vx] = step(s.x, s.vx, s.tx, s.k, s.c, h);
      [s.w, s.vw] = step(s.w, s.vw, s.tw, SIZE.k, SIZE.c, h);
      [s.h, s.vh] = step(s.h, s.vh, s.th, SIZE.k, SIZE.c, h);
      [s.L, s.vL] = step(s.L, s.vL, s.tL, LENS_SPRING.k, LENS_SPRING.c, h);
    }
    if (this.deflateAt !== null && now >= this.deflateAt && Math.abs(s.x - s.tx) < 4) {
      this.deflateAt = null;
      this.rest();
    }
    const still =
      Math.abs(s.x - s.tx) < 0.3 &&
      Math.abs(s.vx) < 4 &&
      Math.abs(s.w - s.tw) < 0.3 &&
      Math.abs(s.h - s.th) < 0.3 &&
      Math.abs(s.L - s.tL) < 0.004 &&
      Math.abs(s.vL) < 0.02;
    if (still && !this.held && this.deflateAt === null) {
      Object.assign(s, { x: s.tx, w: s.tw, h: s.th, L: s.tL, vx: 0, vw: 0, vh: 0, vL: 0 });
      this.raf = null;
      this.draw();
      return;
    }
    this.draw();
    this.raf = requestAnimationFrame(this.frame);
  };

  private draw(): void {
    const s = this.s;
    const g = this.geo();
    if (!g.slot) return;
    const stretch = Math.min(Math.abs(s.vx) / (1800 * SPEED), LENS.stretch); // estica de leve com a velocidade
    const w = s.w * (1 + stretch);
    const h = s.h * (1 - stretch * 0.35);
    const x = s.x - w / 2;
    const y = 5 + (g.h - h) / 2;
    const lensAmount = Math.max(0, Math.min(1, s.L));
    for (const el of [this.pill, this.lens]) {
      el.style.width = `${w}px`;
      el.style.height = `${h}px`;
      el.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    }
    this.lens.style.opacity = String(lensAmount);
    this.pill.style.opacity = String(1 - lensAmount * LENS.pillFade);
    const on = this.nearest(s.x);
    this.tabs().forEach((t, i) => {
      const d = Math.abs(s.x - g.center(i)) / g.slot;
      const m = 1 + LENS.mag * lensAmount * Math.max(0, 1 - d); // "lupa" no ícone embaixo da lente
      t.style.transform = m > 1.002 ? `scale(${m.toFixed(3)})` : '';
      if (i === on) t.dataset.on = '';
      else delete t.dataset.on;
    });
  }
}
