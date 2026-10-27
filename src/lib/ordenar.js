// Comparador das tabelas (do Gestor Coppi): vazios sempre no fim, números como número, texto em
// pt-BR com ordem natural ("Item 2" antes de "Item 10") e sem diferenciar acento/maiúscula.

// Campos cujo VALOR não é o que ordena: `{ campo: (valor) => chave }`. Vazio por enquanto.
export const CHAVES_POR_CAMPO = {};

export function cmpValor(av, bv, dir = 'asc') {
  const an = av === null || av === undefined || av === '';
  const bn = bv === null || bv === undefined || bv === '';
  if (an && bn) return 0;
  if (an) return 1;
  if (bn) return -1;
  let r;
  if (typeof av === 'number' && typeof bv === 'number') r = av - bv;
  else r = String(av).localeCompare(String(bv), 'pt-BR', { numeric: true, sensitivity: 'base' });
  return dir === 'asc' ? r : -r;
}
