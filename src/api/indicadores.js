// OS INDICADORES DO MERCADO (06/11/2026, o mockup aprovado "Indicadores e importações", opção A): tudo PÚBLICO e aberto ao
// navegador (CORS), sem nada pessoal na consulta. As séries do SGS do Banco Central — a Selic meta (432, % ao ano), o CDI
// (4389, % ao ano), o IPCA do mês (433) e o de 12 meses (13522), o dólar (1) e o euro (21619) PTAX de venda (R$) — e a
// pesquisa FOCUS do Banco Central (o Olinda: as medianas anuais do mercado para o IPCA, a Selic e o câmbio). A taxa do
// Tesouro IPCA+ de hoje fica de fora (opção A do mockup): o site do Tesouro não deixa o navegador ler.
// Cada parte que falhar volta null (o bloco dela avisa) e a tela segue com as outras.
const SGS = (n) => `https://api.bcb.gov.br/dados/serie/bcdata.sgs.${n}/dados`;
const br = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
// SEMPRE COM A DATA FINAL (06/11/2026): sem o `dataFinal`, a API do Banco Central passou a responder 304 SEM CONTEÚDO (o
// navegador não tem o que reaproveitar e a resposta vira erro) — as taxas sumiam, o valor parava de andar pelo CDI e o
// "Somar aos valores de depois" somou sem o rendimento. Com o `dataFinal` (hoje), ela responde 200 com os dados.
const hojeBR = () => { const d = new Date(); return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`; };
const menosDias = (iso, n) => new Date(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) - n * 86400000).toISOString().slice(0, 10);

// [['AAAA-MM-DD', número]] desde `desde` (a Selic meta vem com datas FUTURAS — vale até a próxima reunião —: corta em `ate`)
async function serie(n, desde, ate) {
  const r = await fetch(`${SGS(n)}?formato=json&dataInicial=${br(desde)}&dataFinal=${hojeBR()}`);
  if (!r.ok) throw new Error(`SGS ${n}: ${r.status}`);
  const lista = await r.json();
  return lista
    .map((x) => [String(x.data).split('/').reverse().join('-'), Number(String(x.valor).replace(',', '.'))])
    .filter(([d, v]) => /^\d{4}-\d{2}-\d{2}$/.test(d) && Number.isFinite(v) && (!ate || d <= ate));
}

// As medianas da Focus (as anuais, a base de cálculo 0 = todas as instituições), as mais novas primeiro.
async function focus() {
  const filtro = "(Indicador eq 'IPCA' or Indicador eq 'Selic' or Indicador eq 'Câmbio') and baseCalculo eq 0";
  const url = 'https://olinda.bcb.gov.br/olinda/servico/Expectativas/versao/v1/odata/ExpectativasMercadoAnuais'
    + `?$top=90&$filter=${encodeURIComponent(filtro)}&$orderby=${encodeURIComponent('Data desc')}&$format=json&$select=Indicador,Data,DataReferencia,Mediana`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Focus: ${r.status}`);
  return (await r.json()).value ?? [];
}

export async function carregarIndicadores(hoje) {
  const desde = `${Number(hoje.slice(0, 4)) - 2}-01-01`; // dois anos e o corrente: os gráficos da Selic e do IPCA
  const umAno = menosDias(hoje, 400); // 12 meses e um pouco: o dólar e o euro (e a variação em 12 meses)
  const pega = (p) => p.catch(() => null);
  const [selic, cdi, ipca, ipca12, usd, eur, expectativas] = await Promise.all([
    pega(serie(432, desde, hoje)), pega(serie(4389, menosDias(hoje, 60), hoje)), pega(serie(433, desde)), pega(serie(13522, desde)),
    pega(serie(1, umAno, hoje)), pega(serie(21619, umAno, hoje)), pega(focus()),
  ]);
  return { selic, cdi, ipca, ipca12, usd, eur, expectativas };
}
