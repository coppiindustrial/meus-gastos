// Lê a coluna "Parcela" das faturas: "3 de 10", "3/10" ou "-" (à vista).
//
// A planilha antiga tem parcelas que o EXCEL CONVERTEU EM DATA ao abrir o CSV: "6/12" virou o dia
// 6 de dezembro, que aparece como "06/dez" (texto) ou como o número de série da data ("46363,0").
// As duas formas voltam a ser "6 de 12": o dia é a parcela e o mês é o total.
// Devolve { atual, total } ou null (à vista, vazio ou ilegível).

const MESES = { jan: 1, fev: 2, mar: 3, abr: 4, mai: 5, jun: 6, jul: 7, ago: 8, set: 9, out: 10, nov: 11, dez: 12 };

const valida = (atual, total) =>
  (Number.isInteger(atual) && Number.isInteger(total) && total >= 2 && atual >= 1 && atual <= total ? { atual, total } : null);

// Número de série de data do Excel (dias desde 30/12/1899) → { dia, mes }.
function serialParaDiaMes(serial) {
  const d = new Date(Date.UTC(1899, 11, 30) + serial * 86400000);
  return { dia: d.getUTCDate(), mes: d.getUTCMonth() + 1 };
}

export function lerParcela(texto) {
  const t = String(texto ?? '').trim().toLowerCase();
  if (!t || t === '-') return null;
  let m = t.match(/^(\d{1,2})\s*(?:de|\/)\s*(\d{1,2})$/);
  if (m) return valida(Number(m[1]), Number(m[2]));
  m = t.match(/^(\d{1,2})\/([a-zç]{3})/);
  if (m && MESES[m[2]]) return valida(Number(m[1]), MESES[m[2]]);
  m = t.match(/^(\d{5})(?:[.,]0+)?$/);
  if (m) {
    const { dia, mes } = serialParaDiaMes(Number(m[1]));
    return valida(dia, mes);
  }
  return null;
}
