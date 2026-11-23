// O ARRASTO NUMA LISTA AGRUPADA (os cadastros dos investimentos e das categorias): a tabela tem os CABEÇALHOS dos grupos
// (`g:<id>`) e os itens deles embaixo (qualquer outro prefixo de 2 letras: `i:`, `c:`). Era o `arrastoDoCadastro` de
// lib/carteira.js (09/11/2026); saiu para cá em 23/11/2026, quando o das categorias ganhou o mesmo movimento.
//
// `ids`: a lista da tela como o `useListaArrastavel` devolve (com o arrastado no lugar novo); `arrastado`: o id que se
// move; `antes`: a lista de antes. Devolve { grupos: [id do grupo], linhas: [{ id, grupo }] } na ordem nova, ou null
// quando nada vale (o item acima do primeiro grupo).
// O ITEM fica no grupo do cabeçalho acima dele (é assim que ele muda de grupo). O GRUPO leva os itens dele junto; o hook
// só move o cabeçalho, então o lugar dele é decidido pelo bloco em que ele caiu: descendo, depois desse bloco; subindo,
// antes dele (acima de tudo = o primeiro).
const semPrefixo = (x) => x.slice(2);
function itensPorGrupo(lista) {
  let g = null;
  const out = [];
  lista.forEach((x) => { if (x.startsWith('g:')) g = semPrefixo(x); else out.push({ id: semPrefixo(x), grupo: g }); });
  return out;
}

// SEM VAIVÉM (23/11/2026): o navegador manda o `dragover` sem parar enquanto o cursor está parado, e a regra de antes
// ("subindo, antes do bloco") fazia o grupo ir e voltar em cima da faixa de baixo dele. Agora:
//   · os itens do PRÓPRIO grupo não contam (passar por cima deles não move nada);
//   · caiu na FRONTEIRA entre dois blocos (antes de uma faixa, ou no fim) → depois do bloco de cima;
//   · caiu DENTRO de um bloco: descendo → depois dele; subindo → antes dele, menos quando é o grupo logo acima e o cursor
//     ainda não chegou à faixa dele (fica onde está).
export function arrastoAgrupado(ids, arrastado, antes) {
  const gruposAntes = antes.filter((x) => x.startsWith('g:'));
  if (arrastado.startsWith('g:')) {
    const proprios = new Set();
    const ini = antes.indexOf(arrastado);
    for (let k = ini + 1; k < antes.length && !antes[k].startsWith('g:'); k += 1) proprios.add(antes[k]);
    const lista = ids.filter((x) => !proprios.has(x));
    const pos = lista.indexOf(arrastado);
    let dono = null;
    for (let k = pos - 1; k >= 0; k -= 1) if (lista[k].startsWith('g:')) { dono = lista[k]; break; }
    const outros = gruposAntes.filter((g) => g !== arrastado);
    const iDono = gruposAntes.indexOf(dono);
    const iArr = gruposAntes.indexOf(arrastado);
    const fronteira = pos + 1 >= lista.length || lista[pos + 1].startsWith('g:');
    let at = 0;
    if (dono) {
      if (fronteira || iDono > iArr) at = outros.indexOf(dono) + 1;
      else if (iDono === iArr - 1 && lista[pos - 1] !== dono) return null; // ainda dentro do bloco de cima: fica
      else at = outros.indexOf(dono);
    }
    const grupos = [...outros.slice(0, at), arrastado, ...outros.slice(at)];
    return { grupos: grupos.map(semPrefixo), linhas: itensPorGrupo(antes) };
  }
  if (!ids[0]?.startsWith('g:')) return null;
  return { grupos: ids.filter((x) => x.startsWith('g:')).map(semPrefixo), linhas: itensPorGrupo(ids) };
}
