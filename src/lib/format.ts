const WEEKDAYS_SHORT = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const WEEKDAYS_LONG = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
const MONTHS = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
];

export function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** Data local no formato AAAA-MM-DD. */
export function toISODate(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function todayISO(): string {
  return toISODate(new Date());
}

/** Converte AAAA-MM-DD em Date local (meio-dia, evita problemas de fuso). */
export function fromISODate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d, 12, 0, 0);
}

export function addDays(iso: string, days: number): string {
  const d = fromISODate(iso);
  d.setDate(d.getDate() + days);
  return toISODate(d);
}

export function weekdayShort(iso: string): string {
  return WEEKDAYS_SHORT[fromISODate(iso).getDay()];
}

export function weekdayLong(iso: string): string {
  return WEEKDAYS_LONG[fromISODate(iso).getDay()];
}

export function monthName(monthIndex: number): string {
  return MONTHS[monthIndex];
}

/** 27/09 */
export function dayMonth(iso: string): string {
  const d = fromISODate(iso);
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}`;
}

/** 27/09/2026 */
export function fullDate(iso: string): string {
  const d = fromISODate(iso);
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`;
}

/** Domingo, 27 de setembro */
export function longDate(iso: string): string {
  const d = fromISODate(iso);
  const wd = WEEKDAYS_LONG[d.getDay()];
  return `${wd.charAt(0).toUpperCase()}${wd.slice(1)}, ${d.getDate()} de ${MONTHS[d.getMonth()]}`;
}

/** Hoje, ontem ou "quarta, 23/09". */
export function relativeDay(iso: string): string {
  const today = todayISO();
  if (iso === today) return 'hoje';
  if (iso === addDays(today, -1)) return 'ontem';
  return `${weekdayLong(iso)}, ${dayMonth(iso)}`;
}

// ------------------------------------------------------------ Competência (mês de referência, AAAA-MM)

/** Competência de uma data AAAA-MM-DD. */
export function competenciaDe(iso: string): string {
  return iso.slice(0, 7);
}

export function competenciaAtual(): string {
  return competenciaDe(todayISO());
}

/** Soma (ou subtrai) meses de uma competência: addMeses('2026-11', 2) = '2027-01'. */
export function addMeses(comp: string, meses: number): string {
  const [y, m] = comp.split('-').map(Number);
  const total = y * 12 + (m - 1) + meses;
  return `${Math.floor(total / 12)}-${pad2((total % 12) + 1)}`;
}

/** "outubro de 2026" */
export function nomeCompetencia(comp: string): string {
  const [y, m] = comp.split('-').map(Number);
  return `${MONTHS[m - 1]} de ${y}`;
}

/** "out/26" */
export function competenciaCurta(comp: string): string {
  const [y, m] = comp.split('-').map(Number);
  return `${MONTHS[m - 1].slice(0, 3)}/${String(y).slice(2)}`;
}

/** 42,5 */
export function num(n: number | null | undefined, maxDecimals = 1): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '';
  return n.toLocaleString('pt-BR', { maximumFractionDigits: maxDecimals });
}

/** "outubro de 2026" → "Outubro de 2026" */
export function capitalizar(texto: string): string {
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

export function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}
