// Valores sempre em CENTAVOS inteiros (nunca float): R$ 1.234,56 → 123456.
// A direção (gasto ou entrada) vem do `tipo` do lançamento, não do sinal.

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

// 123456 → "R$ 1.234,56"
export function formatBRL(centavos) {
  if (centavos === null || centavos === undefined || centavos === '') return '—';
  const n = Number(centavos);
  if (Number.isNaN(n)) return '—';
  return BRL.format(n / 100);
}

// Valor abreviado para indicadores e eixos: "R$ 850", "R$ 12,3 mil", "R$ 1,2 mi".
export function brlCurto(centavos) {
  if (centavos === null || centavos === undefined || centavos === '') return '—';
  const reais = Number(centavos) / 100;
  if (Number.isNaN(reais)) return '—';
  const abs = Math.abs(reais);
  const sinal = reais < 0 ? '-' : '';
  const fmt = (n) => n.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
  if (abs >= 1e6) return `${sinal}R$ ${fmt(abs / 1e6)} mi`;
  if (abs >= 1e3) return `${sinal}R$ ${fmt(abs / 1e3)} mil`;
  return `${sinal}R$ ${Math.round(abs).toLocaleString('pt-BR')}`;
}

// Lê um valor digitado ou vindo de CSV e devolve centavos (ou null se não for número).
// Aceita "1.234,56", "1234,56", "1234.56", "R$ 59,90", "-2.998,73", "1,234.56".
export function parseValor(texto) {
  let t = String(texto ?? '').trim().replace(/R\$\s?/i, '').replace(/\s/g, '');
  if (t === '') return null;
  const negativo = t.startsWith('-') || (t.startsWith('(') && t.endsWith(')'));
  t = t.replace(/^[-(]|\)$/g, '');
  const virgula = t.lastIndexOf(',');
  const ponto = t.lastIndexOf('.');
  if (virgula > ponto) {
    // vírgula é o decimal (padrão brasileiro): pontos são milhar
    t = t.replace(/\./g, '').replace(',', '.');
  } else if (ponto > virgula && virgula >= 0) {
    // ponto é o decimal e vírgula é milhar (padrão americano)
    t = t.replace(/,/g, '');
  } else if (ponto >= 0 && /^\d{1,3}(\.\d{3})+$/.test(t)) {
    // só pontos em grupos de 3 ("1.234"): milhar
    t = t.replace(/\./g, '');
  }
  if (!/^\d+(\.\d+)?$/.test(t)) return null;
  const centavos = Math.round(Number(t) * 100);
  return negativo ? -centavos : centavos;
}

// CONTAS NO VALOR, como no Excel (30/10/2026, a pedido): "=846,43+192,39", "=1.200/3", "=(100+50)*2". Também sem o
// "=" quando há uma conta entre números ("100+50"). Cada número é lido como `parseValor` (vírgula decimal), a conta
// é feita uma vez e arredondada para centavos no fim. Devolve CENTAVOS, ou null se o texto não é uma conta válida.
// Só números, + − * / (x e × também multiplicam) e parênteses: nada de `eval`.
export function calcularValor(texto) {
  let t = String(texto ?? '').trim().replace(/R\$\s?/gi, '');
  const comIgual = t.startsWith('=');
  if (comIgual) t = t.slice(1);
  t = t.replace(/\s/g, '').replace(/[x×]/gi, '*').replace(/÷/g, '/').replace(/−/g, '-');
  if (!comIgual && !/[\d)][+\-*/][\d(]/.test(t)) return parseValor(t);
  const tokens = t.match(/\d[\d.,]*|[+\-*/()]/g);
  if (!tokens || tokens.join('') !== t) return null;
  let i = 0;
  const fator = () => {
    const k = tokens[i++];
    if (k === '-') { const v = fator(); return v === null ? null : -v; }
    if (k === '+') return fator();
    if (k === '(') { const v = soma(); return tokens[i++] === ')' ? v : null; }
    const c = parseValor(k);
    return c === null ? null : c / 100;
  };
  const termo = () => {
    let v = fator();
    while (v !== null && (tokens[i] === '*' || tokens[i] === '/')) {
      const op = tokens[i++];
      const d = fator();
      if (d === null || (op === '/' && d === 0)) return null;
      v = op === '*' ? v * d : v / d;
    }
    return v;
  };
  function soma() {
    let v = termo();
    while (v !== null && (tokens[i] === '+' || tokens[i] === '-')) {
      const op = tokens[i++];
      const d = termo();
      if (d === null) return null;
      v = op === '+' ? v + d : v - d;
    }
    return v;
  }
  const v = soma();
  if (v === null || i !== tokens.length || !Number.isFinite(v)) return null;
  return Math.round(v * 100);
}

// Centavos → texto para editar num campo: 123456 → "1234,56".
export function valorParaCampo(centavos) {
  if (centavos === null || centavos === undefined) return '';
  return (Number(centavos) / 100).toFixed(2).replace('.', ',');
}
