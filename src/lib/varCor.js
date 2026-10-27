// UMA COR DO TEMA fora das classes — num `style`, num atributo de SVG, num `color-mix` —, com a mesma
// regra dos tokens `bg-hx-*` (ver `tema/escuro.mjs`): no claro é o próprio hex; com o escuro ligado,
// a versão escura da FAMÍLIA pedida. A família é o trabalho da cor ali: 'fundo' (superfícies e
// preenchimentos), 'texto' (texto e ícones) ou 'borda' (linhas, anéis, contornos).
//
// O `npm run tema` acha as chamadas no código pelo texto — `varCor('#e5e7eb', 'borda')` — e só assim
// a versão escura entra no CSS: o hex tem de ser LITERAL na chamada, nunca uma variável.
const PREFIXO = { fundo: 'tf', texto: 'tt', borda: 'tb' };

export function varCor(hex, familia = 'texto') {
  let h = hex.replace('#', '').toLowerCase();
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h, 16);
  return `rgb(var(--${PREFIXO[familia]}-hx-${h}, ${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}))`;
}
