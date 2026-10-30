// CLASSIFICAÇÃO POR REGRAS — o mesmo que a fórmula da planilha fazia:
//   INDEX(Regras[Tipo]; MATCH(TRUE; ISNUMBER(SEARCH(Regras[Palavra-chave]; Estabelecimento)); 0))
// ou seja: a PRIMEIRA regra (na ordem de prioridade) cuja palavra-chave aparece em qualquer parte do
// nome do estabelecimento, sem diferenciar maiúscula/minúscula.
//
// O SEARCH do Excel aceita CURINGAS, e 42 regras da planilha dependem deles ("Dl*Uberrides"):
//   *  qualquer sequência de caracteres     ?  um caractere qualquer     ~*  ~?  o próprio * ou ?

export function padraoDe(palavra) {
  let re = '';
  const s = String(palavra);
  for (let i = 0; i < s.length; i += 1) {
    const ch = s[i];
    if (ch === '~' && (s[i + 1] === '*' || s[i + 1] === '?')) { re += `\\${s[i + 1]}`; i += 1; }
    else if (ch === '*') re += '.*';
    else if (ch === '?') re += '.';
    else re += ch.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(re, 'i');
}

// Prepara as regras uma vez (ordena e compila); devolve a função que classifica um nome.
// `regras`: [{ palavra_chave, categoria_id, prioridade }]
export function criarClassificador(regras) {
  const lista = [...regras]
    .sort((a, b) => a.prioridade - b.prioridade)
    .map((r) => ({ ...r, re: padraoDe(r.palavra_chave) }));
  return (estabelecimento) => lista.find((r) => r.re.test(String(estabelecimento ?? ''))) ?? null;
}

// Uma regra só (para "quais pendências esta palavra pega?").
export const regraPega = (palavra, estabelecimento) => padraoDe(palavra).test(String(estabelecimento ?? ''));
