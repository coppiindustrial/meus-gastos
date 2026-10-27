// Datas (do Gestor Coppi) e competência. Dinheiro fica em `dinheiro.js` (em centavos).

const MESES = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
];
const p2 = (x) => String(x).padStart(2, '0');

// Formata uma data ISO (YYYY-MM-DD ou timestamp) para DD/MM/AAAA.
export function formatDate(value) {
  if (!value) return '—';
  const s = String(value).slice(0, 10);
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('pt-BR');
}

// Data E HORA, no fuso LOCAL (DD/MM/AAAA HH:MM). Para timestamps (`criado_em`, `importada_em`):
// o `formatDate` recorta a string e mostraria o dia em UTC.
export function formatDateTime(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }).replace(',', '');
}

// Coluna DATE: os 10 primeiros caracteres, sem passar pelo fuso. Nunca `new Date('AAAA-MM-DD')`,
// que lê como UTC e devolve o dia anterior no Brasil.
export const diaDeData = (v) => (v ? String(v).slice(0, 10) : '');

// Data de hoje no formato YYYY-MM-DD (para inputs date).
export function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
}

// ------------------------------------------------------------ Competência (mês de referência)
// No front a competência é 'AAAA-MM'; no banco é `date` no dia 1 ('AAAA-MM-01').

export const competenciaDe = (iso) => String(iso).slice(0, 7);
export const competenciaAtual = () => competenciaDe(todayISO());
export const competenciaParaBanco = (comp) => `${comp}-01`;

// addMeses('2026-11', 2) = '2027-01'
export function addMeses(comp, meses) {
  const [y, m] = comp.split('-').map(Number);
  const total = y * 12 + (m - 1) + meses;
  return `${Math.floor(total / 12)}-${p2((total % 12) + 1)}`;
}

// "Outubro de 2026"
export function nomeCompetencia(comp) {
  const [y, m] = comp.split('-').map(Number);
  const nome = MESES[m - 1];
  return `${nome.charAt(0).toUpperCase()}${nome.slice(1)} de ${y}`;
}

// "out/26"
export function competenciaCurta(comp) {
  const [y, m] = comp.split('-').map(Number);
  return `${MESES[m - 1].slice(0, 3)}/${String(y).slice(2)}`;
}
