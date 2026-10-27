// Copia texto para a área de transferência (do Gestor, `lib/copiar.js`). Devolve `true` se conseguiu.
//
// O caminho de sempre é o `navigator.clipboard`, que só existe em contexto seguro (o GitHub Pages é
// https, e o localhost também conta). O `execCommand` fica como reserva: é o único que funciona quando
// a API falta ou o navegador nega a permissão.
export async function copiarTexto(texto) {
  const valor = String(texto ?? '');
  if (!valor) return false;
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(valor);
      return true;
    }
  } catch {
    // permissão negada: cai na reserva abaixo
  }
  // `fixed` + `opacity: 0`, e nunca `display: none`: um elemento sem caixa não pode ser selecionado.
  const ta = document.createElement('textarea');
  ta.value = valor;
  ta.setAttribute('readonly', '');
  ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;pointer-events:none';
  document.body.appendChild(ta);
  ta.select();
  let ok = false;
  try { ok = document.execCommand('copy'); } catch { ok = false; }
  ta.remove();
  return ok;
}
