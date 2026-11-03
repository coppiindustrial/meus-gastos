import { parseValor } from './dinheiro.js';
import { lerParcela } from './parcela.js';

// O MODELO DE IMPORTAÇÃO (03/11/2026, fase 1 do importador configurável — mockup "Importador configurável de CSV"): o
// formato de um CSV de banco como DADO, não como código. Um modelo diz como ler o arquivo e o resultado é o MESMO da
// leitura de antes ({ linhas, ignoradas }, as linhas no formato que `importarFatura` grava). Nubank e XP são os
// MODELOS PRONTOS (`MODELOS_PRONTOS`); os do usuário moram na tabela `modelos_importacao` (migration 011), ensinados no
// assistente (fase 2), que parte das sugestões de `detectarFormato` e `sugerirColunas`. Tudo puro e testado.
//
// `config`:
//   separador       ';' | ',' | '\t'
//   linhaCabecalho  a linha do cabeçalho (1 = a primeira)
//   ignorarNoFim    quantas linhas do fim ficam de fora (o total, uma linha de rodapé)
//   colunas         { data, estabelecimento, valor, parcela?, portador? } → o índice da coluna (0 = a primeira) ou null
//   data            'aaaa-mm-dd' | 'dd/mm/aaaa' | 'dd/mm/aa' | 'dd-mm-aaaa' | 'mm/dd/aaaa'
//   gasto           'positivo' | 'negativo' — o sinal do GASTO no arquivo (o do outro sinal é pagamento/estorno: fica de fora)
//   parcela         'nenhuma' | 'coluna' ("3/10", "3 de 10", "-") | 'texto' (no fim da descrição: "- Parcela 9/12", "(Parcela 3 de 10)")
//   vencimento      'nome' (uma data no nome do arquivo) | 'dia' (o dia do cartão depois da última compra) | 'perguntar'

// ------------------------------------------------------------ ler o texto

// Quebra uma linha de CSV respeitando aspas ("53,90" tem vírgula dentro; "" é uma aspa).
export function dividir(linha, sep) {
  const campos = [];
  let atual = '';
  let aspas = false;
  for (let i = 0; i < linha.length; i += 1) {
    const ch = linha[i];
    if (ch === '"') {
      if (aspas && linha[i + 1] === '"') { atual += '"'; i += 1; } else aspas = !aspas;
    } else if (ch === sep && !aspas) {
      campos.push(atual);
      atual = '';
    } else atual += ch;
  }
  campos.push(atual);
  return campos.map((c) => c.trim());
}

export const linhasDoTexto = (texto) => String(texto ?? '').replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim() !== '');

// A ASSINATURA de um cabeçalho (o que reconhece o arquivo): minúsculas, sem acento, sem espaço e sem aspas.
export const assinatura = (linha) => String(linha ?? '').replace(/^﻿/, '').normalize('NFD').replace(/\p{Diacritic}/gu, '')
  .toLowerCase().replace(/["\s]/g, '');

// O texto do arquivo a partir dos bytes: UTF-8 quando ele lê limpo; senão Windows-1252 (o CSV que o Excel salva).
export function decodificar(bytes, codificacao = 'auto') {
  if (codificacao !== 'auto') return new TextDecoder(codificacao).decode(bytes);
  const utf8 = new TextDecoder('utf-8').decode(bytes);
  return utf8.includes('�') ? new TextDecoder('windows-1252').decode(bytes) : utf8;
}

// ------------------------------------------------------------ os campos

const p2 = (n) => String(n).padStart(2, '0');
function dataValida(a, m, d) {
  if (!(m >= 1 && m <= 12 && d >= 1 && d <= 31)) return null;
  const dt = new Date(Date.UTC(a, m - 1, d));
  return dt.getUTCMonth() === m - 1 ? `${a}-${p2(m)}-${p2(d)}` : null;
}
export const FORMATOS_DATA = ['aaaa-mm-dd', 'dd/mm/aaaa', 'dd/mm/aa', 'dd-mm-aaaa', 'mm/dd/aaaa'];
export function lerDataNoFormato(texto, formato) {
  const t = String(texto ?? '').trim().slice(0, 10).trim();
  let m;
  switch (formato) {
    case 'aaaa-mm-dd': m = t.match(/^(\d{4})-(\d{2})-(\d{2})$/); return m ? dataValida(+m[1], +m[2], +m[3]) : null;
    case 'dd/mm/aaaa': m = t.match(/^(\d{2})\/(\d{2})\/(\d{4})$/); return m ? dataValida(+m[3], +m[2], +m[1]) : null;
    case 'dd/mm/aa': m = t.match(/^(\d{2})\/(\d{2})\/(\d{2})$/); return m ? dataValida(2000 + +m[3], +m[2], +m[1]) : null;
    case 'dd-mm-aaaa': m = t.match(/^(\d{2})-(\d{2})-(\d{4})$/); return m ? dataValida(+m[3], +m[2], +m[1]) : null;
    case 'mm/dd/aaaa': m = t.match(/^(\d{2})\/(\d{2})\/(\d{4})$/); return m ? dataValida(+m[3], +m[1], +m[2]) : null;
    default: return null;
  }
}

// A PARCELA NO TEXTO: "Amazon - Parcela 9/12", "LOJA MOVEIS (Parcela 3 de 10)", "LOJA PARC 03/10" → o nome sem ela.
const PARCELA_NO_TEXTO = /^(.*?)[\s\-–(]*\b(?:parcela|parc\.?)\s*(\d{1,2})\s*(?:\/|de)\s*(\d{1,2})\s*\)?\s*$/i;
export function separarParcela(texto) {
  const m = String(texto ?? '').match(PARCELA_NO_TEXTO);
  const parcela = m ? lerParcela(`${m[2]}/${m[3]}`) : null;
  return parcela ? { nome: m[1].trim(), parcela } : { nome: String(texto ?? '').trim(), parcela: null };
}

// ------------------------------------------------------------ ler com um modelo

// Lê o CSV com o `config` de um modelo. Devolve { linhas, ignoradas } — os GASTOS em `linhas`; o que veio com o outro
// sinal (pagamento, estorno, crédito) em `ignoradas`, para a tela mostrar. Linha ilegível dá erro com o número dela.
export function lerComModelo(texto, config) {
  const todas = linhasDoTexto(texto);
  if (!todas.length) throw new Error('O arquivo está vazio.');
  const ini = Math.max(1, config.linhaCabecalho ?? 1);
  const fim = todas.length - Math.max(0, config.ignorarNoFim ?? 0);
  const c = config.colunas ?? {};
  const sinal = config.gasto === 'negativo' ? -1 : 1;
  const linhas = [];
  const ignoradas = [];
  for (let i = ini; i < fim; i += 1) {
    const campos = dividir(todas[i], config.separador ?? ';');
    const bruto = (k) => (c[k] == null ? '' : campos[c[k]] ?? '');
    let estabelecimento = bruto('estabelecimento');
    let parcela = null;
    if (config.parcela === 'coluna') parcela = lerParcela(bruto('parcela'));
    else if (config.parcela === 'texto') ({ nome: estabelecimento, parcela } = separarParcela(estabelecimento));
    const valor = parseValor(bruto('valor'));
    const l = {
      data: lerDataNoFormato(bruto('data'), config.data),
      estabelecimento,
      valor_centavos: valor == null ? null : valor * sinal,
      parcela_atual: parcela?.atual ?? null,
      parcela_total: parcela?.total ?? null,
      portador: bruto('portador') || null,
    };
    if (!l.data || l.valor_centavos === null || !l.estabelecimento) throw new Error(`Linha ${i + 1} ilegível: "${todas[i].slice(0, 80)}"`);
    if (l.valor_centavos > 0) linhas.push(l); else ignoradas.push(l);
  }
  return { linhas, ignoradas };
}

// O modelo que reconhece o arquivo: o primeiro cuja assinatura do cabeçalho é o começo da linha do cabeçalho dele.
export function reconhecerModelo(texto, modelos) {
  const todas = linhasDoTexto(texto);
  return modelos.find((m) => m.cabecalho && assinatura(todas[(m.config?.linhaCabecalho ?? 1) - 1]).startsWith(m.cabecalho)) ?? null;
}

// O vencimento pela data no NOME do arquivo ("Inter_2026-10-15.csv", "fatura 15-10-2026.csv"), ou null.
export function vencimentoDoNome(nome) {
  const s = String(nome ?? '');
  let m = s.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (m) return dataValida(+m[1], +m[2], +m[3]);
  m = s.match(/(\d{2})[-_.](\d{2})[-_.](\d{4})/);
  return m ? dataValida(+m[3], +m[2], +m[1]) : null;
}

// ------------------------------------------------------------ os modelos prontos

export const MODELOS_PRONTOS = [
  {
    id: 'nubank', nome: 'Nubank (pronto)', tipo: 'fatura', pronto: true, cabecalho: 'date,title,amount',
    config: { separador: ',', linhaCabecalho: 1, ignorarNoFim: 0, colunas: { data: 0, estabelecimento: 1, valor: 2, parcela: null, portador: null },
      data: 'aaaa-mm-dd', gasto: 'positivo', parcela: 'texto', vencimento: 'nome' },
  },
  {
    id: 'xp', nome: 'XP (pronto)', tipo: 'fatura', pronto: true, cabecalho: 'data;estabelecimento;portador;valor;parcela',
    config: { separador: ';', linhaCabecalho: 1, ignorarNoFim: 0, colunas: { data: 0, estabelecimento: 1, portador: 2, valor: 3, parcela: 4 },
      data: 'dd/mm/aaaa', gasto: 'positivo', parcela: 'coluna', vencimento: 'nome' },
  },
];

// ------------------------------------------------------------ o que o assistente sugere (fase 2)

const SEPARADORES = [';', ',', '\t'];
// O separador (o que divide as primeiras linhas no MESMO número de colunas, e o maior), a linha do cabeçalho (a
// primeira com esse número de colunas e sem número/data em nenhuma) e as linhas do fim que não seguem o padrão.
export function detectarFormato(texto) {
  const todas = linhasDoTexto(texto);
  const amostra = todas.slice(0, 30);
  let melhor = { separador: ';', colunas: 1, nota: -1 };
  SEPARADORES.forEach((sep) => {
    const ns = amostra.map((l) => dividir(l, sep).length);
    const freq = new Map();
    ns.forEach((n) => freq.set(n, (freq.get(n) ?? 0) + 1));
    const [colunas, vezes] = [...freq.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0] ?? [1, 0];
    const nota = colunas > 1 ? vezes * 10 + colunas : -1;
    if (nota > melhor.nota) melhor = { separador: sep, colunas, nota };
  });
  const { separador, colunas } = melhor;
  const pareceDado = (cel) => /\d{2}[/-]\d{2}[/-]\d{2,4}|\d{4}-\d{2}-\d{2}|^-?\s*(R\$)?\s*[\d.,]+$/.test(cel);
  const iCab = todas.findIndex((l) => { const cs = dividir(l, separador); return cs.length === colunas && cs.every((x) => x && !pareceDado(x)); });
  let ignorarNoFim = 0;
  for (let i = todas.length - 1; i > iCab && dividir(todas[i], separador).length !== colunas; i -= 1) ignorarNoFim += 1;
  return { separador, colunas, linhaCabecalho: iCab >= 0 ? iCab + 1 : 1, ignorarNoFim, total: todas.length };
}

const semAcento = (s) => String(s ?? '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
const PELO_NOME = [
  ['data', /\b(data|date|dt)\b/],
  ['valor', /\b(valor|amount|value|montante|total)\b/],
  ['parcela', /\b(parcela|parcelas|installments?)\b/],
  ['portador', /\b(portador|titular|cartao|card)\b/],
  ['estabelecimento', /\b(estabelecimento|descricao|historico|title|lancamento|loja|merchant|description)\b/],
];
// O que cada coluna parece ser, pelo NOME do cabeçalho e, onde ele não diz, pelo CONTEÚDO (a data e o valor). E o
// formato da data, o sinal do gasto e onde vem a parcela. Devolve o `config` sugerido (o assistente mostra e deixa trocar).
export function sugerirColunas(texto, { separador, linhaCabecalho = 1, ignorarNoFim = 0 }) {
  const todas = linhasDoTexto(texto);
  const cab = dividir(todas[linhaCabecalho - 1] ?? '', separador).map(semAcento);
  const dados = todas.slice(linhaCabecalho, todas.length - ignorarNoFim).slice(0, 50).map((l) => dividir(l, separador));
  const colunas = { data: null, estabelecimento: null, valor: null, parcela: null, portador: null };
  // pelo nome (a primeira coluna que casa com cada papel; "data lançamento" é data, não descrição)
  PELO_NOME.forEach(([papel, re]) => {
    const i = cab.findIndex((n, j) => re.test(n) && !Object.values(colunas).includes(j));
    if (i >= 0 && colunas[papel] == null) colunas[papel] = i;
  });
  const coluna = (j) => dados.map((cs) => cs[j] ?? '').filter(Boolean);
  const formatoDe = (j) => FORMATOS_DATA.find((f) => { const vs = coluna(j); return vs.length && vs.every((v) => lerDataNoFormato(v, f)); }) ?? null;
  const livres = () => cab.map((_, j) => j).filter((j) => !Object.values(colunas).includes(j));
  if (colunas.data == null) colunas.data = livres().find((j) => formatoDe(j)) ?? null;
  if (colunas.valor == null) colunas.valor = livres().find((j) => { const vs = coluna(j); return vs.length && vs.every((v) => parseValor(v) !== null); }) ?? null;
  if (colunas.estabelecimento == null) {
    const textos = livres().map((j) => [j, coluna(j).reduce((s, v) => s + v.length, 0)]).sort((a, b) => b[1] - a[1]);
    colunas.estabelecimento = textos[0]?.[0] ?? null;
  }
  const valores = colunas.valor == null ? [] : coluna(colunas.valor).map(parseValor).filter((v) => v !== null);
  const negativos = valores.filter((v) => v < 0).length;
  const comParcelaNoTexto = colunas.estabelecimento == null ? 0 : coluna(colunas.estabelecimento).filter((t) => separarParcela(t).parcela).length;
  return {
    separador, linhaCabecalho, ignorarNoFim, colunas,
    data: colunas.data == null ? 'dd/mm/aaaa' : formatoDe(colunas.data) ?? 'dd/mm/aaaa',
    gasto: negativos > valores.length / 2 ? 'negativo' : 'positivo',
    parcela: colunas.parcela != null ? 'coluna' : comParcelaNoTexto ? 'texto' : 'nenhuma',
    vencimento: 'dia',
  };
}
