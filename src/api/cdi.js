// O CDI DO MÊS (05/11/2026, a comparação do Patrimônio): a série 4391 do SGS do Banco Central — "CDI acumulado no
// mês", em % ao mês — é pública e aberta ao navegador (CORS). Nada pessoal vai na consulta. Devolve
// { 'AAAA-MM': fração } (1,07% → 0.0107) desde `desde` ('AAAA-MM'); o mês corrente vem PARCIAL (o que já correu
// dele). Sem rede ou com a API fora, devolve null e a tela segue sem a comparação.
const SERIE = 'https://api.bcb.gov.br/dados/serie/bcdata.sgs.4391/dados';
// SEMPRE COM A DATA FINAL (06/11/2026): sem o `dataFinal`, a API do Banco Central passou a responder 304 SEM CONTEÚDO (o
// navegador não tem o que reaproveitar e a resposta vira erro) — as taxas sumiam, o valor parava de andar pelo CDI e o
// "Somar aos valores de depois" somou sem o rendimento. Com o `dataFinal` (hoje), ela responde 200 com os dados.
const hojeBR = () => { const d = new Date(); return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`; };

export async function cdiMensal(desde) {
  try {
    const [y, m] = desde.split('-');
    const r = await fetch(`${SERIE}?formato=json&dataInicial=01/${m}/${y}&dataFinal=${hojeBR()}`);
    if (!r.ok) return null;
    const lista = await r.json();
    const out = {};
    lista.forEach((x) => {
      const [, mm, yy] = String(x.data).split('/');
      const v = Number(String(x.valor).replace(',', '.'));
      if (yy && mm && Number.isFinite(v)) out[`${yy}-${mm}`] = v / 100;
    });
    return out;
  } catch {
    return null;
  }
}
