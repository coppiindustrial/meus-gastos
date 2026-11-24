// AS TAXAS DE CADA DIA (06/11/2026, o mockup "Valor pelo CDI"): as séries do SGS do Banco Central, públicas e abertas ao
// navegador (CORS), sem nada pessoal na consulta — o CDI de cada dia útil (série 12, % ao dia), a Selic de cada dia útil
// (série 11, % ao dia) e o IPCA de cada mês (série 433, % ao mês). O dia mais novo é o de ontem (o Banco Central publica
// no dia útil seguinte). Devolve { cdi: [['AAAA-MM-DD', fração]], selic: [...], ipca: { 'AAAA-MM': fração } } desde
// `desde` ('AAAA-MM-DD'), ou null sem rede (a tela segue com o valor da última foto, sem estimar).
// A leitura (e o 304 sem conteúdo que a API às vezes repete) mora em `sgs.js`.
import { lerSgs } from './sgs.js';

async function serie(n, desde) {
  const lista = await lerSgs(n, desde);
  return lista
    .map((x) => [String(x.data).split('/').reverse().join('-'), Number(String(x.valor).replace(',', '.')) / 100])
    .filter(([d, v]) => /^\d{4}-\d{2}-\d{2}$/.test(d) && Number.isFinite(v));
}

export async function taxasDiarias(desde) {
  try {
    const [cdi, selic, ipca] = await Promise.all([
      serie(12, desde),
      serie(11, desde).catch(() => []),
      serie(433, `${desde.slice(0, 7)}-01`).catch(() => []),
    ]);
    return { cdi, selic, ipca: Object.fromEntries(ipca.map(([d, v]) => [d.slice(0, 7), v])) };
  } catch {
    return null;
  }
}
