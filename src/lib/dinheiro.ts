// Valores sempre em centavos inteiros (nunca float): 1234,56 → 123456.

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

/** 123456 → "R$ 1.234,56" */
export function formatBRL(centavos: number | null | undefined): string {
  if (centavos === null || centavos === undefined || Number.isNaN(centavos)) return '—';
  return BRL.format(centavos / 100);
}

/** Valor resumido para cartões e gráficos: "R$ 850", "R$ 12,3 mil", "R$ 1,2 mi". */
export function brlCurto(centavos: number | null | undefined): string {
  if (centavos === null || centavos === undefined || Number.isNaN(centavos)) return '—';
  const reais = centavos / 100;
  const abs = Math.abs(reais);
  const sinal = reais < 0 ? '-' : '';
  const fmt = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
  if (abs >= 1_000_000) return `${sinal}R$ ${fmt(abs / 1_000_000)} mi`;
  if (abs >= 1_000) return `${sinal}R$ ${fmt(abs / 1_000)} mil`;
  return `${sinal}R$ ${Math.round(abs).toLocaleString('pt-BR')}`;
}

/**
 * Lê um valor digitado ou vindo de CSV e devolve centavos.
 * Aceita "1.234,56", "1234,56", "1234.56", "R$ 59,90", "-2.998,73". Devolve null se não for número.
 */
export function parseValor(texto: string): number | null {
  let t = texto.trim().replace(/R\$\s?/i, '').replace(/\s/g, '');
  if (t === '') return null;
  const negativo = t.startsWith('-') || (t.startsWith('(') && t.endsWith(')'));
  t = t.replace(/^[-(]|\)$/g, '');
  const ultimaVirgula = t.lastIndexOf(',');
  const ultimoPonto = t.lastIndexOf('.');
  if (ultimaVirgula > ultimoPonto) {
    // vírgula é o decimal (padrão brasileiro): pontos são milhar
    t = t.replace(/\./g, '').replace(',', '.');
  } else if (ultimoPonto > ultimaVirgula && ultimaVirgula >= 0) {
    // ponto é o decimal e vírgula é milhar (padrão americano)
    t = t.replace(/,/g, '');
  } else if (ultimoPonto >= 0 && /^\d{1,3}(\.\d{3})+$/.test(t)) {
    // só pontos em grupos de 3 ("1.234"): milhar
    t = t.replace(/\./g, '');
  }
  if (!/^\d+(\.\d+)?$/.test(t)) return null;
  const centavos = Math.round(Number(t) * 100);
  return negativo ? -centavos : centavos;
}

/** Centavos → texto para editar num campo: 123456 → "1234,56". */
export function valorParaCampo(centavos: number | null | undefined): string {
  if (centavos === null || centavos === undefined) return '';
  return (centavos / 100).toFixed(2).replace('.', ',');
}
