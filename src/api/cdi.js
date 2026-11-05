// O CDI DO MÊS (05/11/2026, a comparação do Patrimônio): a série 4391 do SGS do Banco Central — "CDI acumulado no
// mês", em % ao mês — é pública e aberta ao navegador (CORS). Nada pessoal vai na consulta. Devolve
// { 'AAAA-MM': fração } (1,07% → 0.0107) desde `desde` ('AAAA-MM'); o mês corrente vem PARCIAL (o que já correu
// dele). Sem rede ou com a API fora, devolve null e a tela segue sem a comparação.
const SERIE = 'https://api.bcb.gov.br/dados/serie/bcdata.sgs.4391/dados';

export async function cdiMensal(desde) {
  try {
    const [y, m] = desde.split('-');
    const r = await fetch(`${SERIE}?formato=json&dataInicial=01/${m}/${y}`);
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
