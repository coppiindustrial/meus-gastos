// O FILTRO DE PERÍODO (06/11/2026, opção B do mockup "O filtro de período"): um segmento só no lugar do Ano + Meses, na
// Visão geral e em Categorias e grupos. Primeiro o TIPO de período, depois o ano, depois a escolha. Funções puras
// (test/periodoFiltro.test.js). A lógica de antes continua: vários anos somam (Ctrl+clique no ano), vários meses
// (Ctrl+clique) e o intervalo (Shift+clique).
//
// `per`: { modo, anos: [AAAA…], meses: [1..12] (no 'mes'), tri: 1-4, sem: 1-2, ate: 1-12 (no 'acum' e no '12m') }.
//   · 'ano'  — o ano todo (o padrão das duas telas);
//   · 'mes'  — um ou vários meses do(s) ano(s);
//   · 'tri' / 'sem' — o trimestre / o semestre;
//   · 'acum' — de janeiro até o mês `ate`;
//   · '12m'  — os 12 meses que TERMINAM em `ate` do ano mais recente marcado (atravessa o ano).
export const MODOS_PERIODO = [
  { id: 'mes', rotulo: 'Mês', dica: 'um ou vários meses' },
  { id: 'tri', rotulo: 'Trimestre', dica: '1º a 4º' },
  { id: 'sem', rotulo: 'Semestre', dica: '1º ou 2º' },
  { id: 'acum', rotulo: 'Acumulado', dica: 'de janeiro até o mês' },
  { id: 'ano', rotulo: 'Ano', dica: 'o ano todo' },
  { id: '12m', rotulo: '12 meses', dica: 'os 12 até o mês' },
];
const CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const LONGOS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const p2 = (n) => String(n).padStart(2, '0');
const faixa = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

// O padrão: o ano todo do ano de `hoje` ('AAAA-MM-DD' ou 'AAAA-MM'); o trimestre, o semestre e o "até" já no mês de hoje.
export function periodoPadrao(hoje) {
  const ano = Number(hoje.slice(0, 4));
  const mes = Number(hoje.slice(5, 7));
  return { modo: 'ano', anos: [ano], meses: [], tri: Math.ceil(mes / 3), sem: mes <= 6 ? 1 : 2, ate: mes };
}
export const ehPadrao = (per, hoje) => per.modo === 'ano' && per.anos.length === 1 && per.anos[0] === Number(hoje.slice(0, 4));

// Os meses (1..12) de cada ano do período; [] = o ano todo. No '12m', null (atravessa o ano: use `compsDoPeriodo`).
export function mesesDoPeriodo(per) {
  switch (per.modo) {
    case 'mes': return [...per.meses].sort((a, b) => a - b);
    case 'tri': return faixa((per.tri - 1) * 3 + 1, per.tri * 3);
    case 'sem': return faixa((per.sem - 1) * 6 + 1, per.sem * 6);
    case 'acum': return faixa(1, per.ate);
    case '12m': return null;
    default: return [];
  }
}

// As competências do período, em ordem: ['AAAA-MM', …].
export function compsDoPeriodo(per) {
  const anos = [...per.anos].sort((a, b) => a - b);
  if (per.modo === '12m') {
    const fim = anos[anos.length - 1] * 12 + (per.ate - 1);
    return faixa(fim - 11, fim).map((t) => `${Math.floor(t / 12)}-${p2((t % 12) + 1)}`);
  }
  const ms = mesesDoPeriodo(per);
  const lista = ms.length ? ms : faixa(1, 12);
  return anos.flatMap((a) => lista.map((m) => `${a}-${p2(m)}`));
}

const anosTexto = (anos) => {
  const a = [...anos].sort((x, y) => x - y);
  return a.length > 1 ? `${a.slice(0, -1).join(', ')} e ${a[a.length - 1]}` : String(a[0]);
};
// O período em palavras (os títulos dos gráficos, o rodapé do filtro): "2026", "2025 e 2026", "novembro de 2026",
// "jan a mar de 2026", "jul, set e nov de 2026", "1º tri de 2026", "2º semestre de 2026", "jan a out de 2026",
// "nov/25 a out/26".
export function textoDoPeriodo(per) {
  const anos = anosTexto(per.anos);
  if (per.modo === 'ano') return anos;
  if (per.modo === 'tri') return `${per.tri}º tri de ${anos}`;
  if (per.modo === 'sem') return `${per.sem}º semestre de ${anos}`;
  if (per.modo === 'acum') return per.ate === 1 ? `janeiro de ${anos}` : `jan a ${CURTOS[per.ate - 1]} de ${anos}`;
  if (per.modo === '12m') {
    const c = compsDoPeriodo(per);
    const curto = (x) => `${CURTOS[Number(x.slice(5)) - 1]}/${x.slice(2, 4)}`;
    return `${curto(c[0])} a ${curto(c[c.length - 1])}`;
  }
  const m = mesesDoPeriodo(per);
  if (!m.length) return anos;
  if (m.length === 1) return `${LONGOS[m[0] - 1]} de ${anos}`;
  const seguidos = m.every((v, i) => i === 0 || v === m[i - 1] + 1);
  if (seguidos) return `${CURTOS[m[0] - 1]} a ${CURTOS[m[m.length - 1] - 1]} de ${anos}`;
  return `${m.slice(0, -1).map((v) => CURTOS[v - 1]).join(', ')} e ${CURTOS[m[m.length - 1] - 1]} de ${anos}`;
}

// Escolher um MÊS na grade do modo 'mes': clique = só ele; Shift = o intervalo desde o último clicado; Ctrl = liga/desliga.
export function escolherMes(meses, m, { shift = false, ctrl = false, ultimo = null } = {}) {
  if (shift && ultimo) return [...new Set([...meses, ...faixa(Math.min(ultimo, m), Math.max(ultimo, m))])].sort((a, b) => a - b);
  if (ctrl) { const n = meses.includes(m) ? meses.filter((x) => x !== m) : [...meses, m]; return n.length ? n.sort((a, b) => a - b) : [m]; }
  return [m];
}
// Escolher um ANO: clique = só ele; Ctrl = soma mais um (nunca fica sem nenhum).
export function escolherAno(anos, a, { ctrl = false } = {}) {
  if (!ctrl) return [a];
  const n = anos.includes(a) ? anos.filter((x) => x !== a) : [...anos, a];
  return n.length ? n.sort((x, y) => x - y) : anos;
}
// O período a partir do ano e dos meses de antes (a folha de filtros do celular ainda escolhe assim).
export const periodoDeAnosMeses = (per, anos, meses) => ({ ...per, modo: meses.length ? 'mes' : 'ano', anos, meses });
