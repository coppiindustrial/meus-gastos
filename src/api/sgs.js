// A LEITURA DE UMA SÉRIE DO SGS DO BANCO CENTRAL (pública e aberta ao navegador; nada pessoal na consulta), a de todas as
// telas: o CDI de cada dia (`taxas.js`), o CDI do mês (`cdi.js`) e os Indicadores (`indicadores.js`).
//
// O 304 SEM CONTEÚDO (24/11/2026): a API às vezes GUARDA para um endereço a resposta "304" vazia e a repete a quem pedir o
// MESMO endereço — mesmo com `cache: 'no-store'` —, enquanto o mesmo pedido com outra data final responde 200 com os dados
// (testado no CDI diário: dataFinal de hoje dava 304 três vezes seguidas; a de amanhã, 200). Sem a série, a carteira ficava
// no valor de partida (o "Nu Limite Garantido" rendia zero mês a mês no Patrimônio). Então cada tentativa muda a DATA
// FINAL — hoje, amanhã, depois — e a data final no futuro não muda o que volta (não há dado de amanhã).
// (Sem o `dataFinal`, em 06/11/2026, era o mesmo 304: por isso ele vai sempre.)
const SGS = (n) => `https://api.bcb.gov.br/dados/serie/bcdata.sgs.${n}/dados`;
const br = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
const espera = (ms) => new Promise((ok) => setTimeout(ok, ms));
// o dia de hoje (no fuso do aparelho) mais `n` dias, 'DD/MM/AAAA'
const diaBR = (n) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
};
const ESPERAS = [0, 300, 1000, 3000];

// A lista crua da série `n` ([{ data: 'DD/MM/AAAA', valor: '0,05' }]) desde `desde` ('AAAA-MM-DD'). Lança depois da
// última tentativa.
export async function lerSgs(n, desde) {
  let erro = null;
  for (let k = 0; k < ESPERAS.length; k += 1) {
    if (ESPERAS[k]) await espera(ESPERAS[k]);
    try {
      const r = await fetch(`${SGS(n)}?formato=json&dataInicial=${br(desde)}&dataFinal=${diaBR(k)}`);
      if (!r.ok) throw new Error(`SGS ${n}: ${r.status}`);
      const lista = await r.json();
      if (!Array.isArray(lista)) throw new Error(`SGS ${n}: resposta sem a lista`);
      return lista;
    } catch (e) {
      erro = e;
    }
  }
  throw erro;
}
