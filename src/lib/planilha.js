import { parseValor, valorParaCampo } from './dinheiro.js';
import { formatDate } from './format.js';

// A GRADE DE LANÇAMENTOS como planilha (a tabela D do mockup, no jeito da grade do DRE do Gestor):
// as contas que não dependem da tela — ler o que se digita ou cola em cada coluna, planejar onde um
// bloco colado do Excel cai, preencher para baixo, copiar como o Excel lê e somar a seleção. Funções
// puras, testadas em test/planilha.test.js. Quem grava é a página.
//
// Uma CÉLULA é { r, c }: `r` é o índice da linha NA TELA (as filtradas, na ordem mostrada) e `c` o da
// coluna em `COLUNAS`. Uma FAIXA é { r0, r1, c0, c1 }, sempre com r0 ≤ r1 e c0 ≤ c1.

export const COLUNAS = [
  { id: 'data', nome: 'Data', campo: 'data' },
  { id: 'descricao', nome: 'Descrição', campo: 'descricao' },
  { id: 'categoria', nome: 'Categoria', campo: 'categoria_id' },
  { id: 'origem', nome: 'Origem', campo: null },
  { id: 'valor', nome: 'Valor', campo: 'valor_centavos' },
  { id: 'obs', nome: 'Observação', campo: 'obs' },
];
export const colunaEditavel = (c) => !!COLUNAS[c]?.campo;

export const ORIGENS = { cartao: 'Cartão', fixo: 'Fixo', manual: 'Avulso', entrada: 'Entrada' };

// "Cartão · Nubank · 3/10"
export function textoOrigem(l) {
  const partes = [ORIGENS[l.origem]];
  if (l.cartao) partes.push(l.cartao.nome);
  if (l.parcela_total) partes.push(`${l.parcela_atual}/${l.parcela_total}`);
  return partes.join(' · ');
}

const norm = (s) => String(s ?? '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();
const p2 = (n) => String(n).padStart(2, '0');

// Uma faixa a partir de dois cantos (a célula ativa e o outro).
export function faixaDe(a, b = a) {
  return { r0: Math.min(a.r, b.r), r1: Math.max(a.r, b.r), c0: Math.min(a.c, b.c), c1: Math.max(a.c, b.c) };
}
export const naFaixa = (f, r, c) => !!f && r >= f.r0 && r <= f.r1 && c >= f.c0 && c <= f.c1;

// ------------------------------------------------------------ ler o que se digita

// "27/10", "27/10/26", "27/10/2026", "27-10-2026" ou "2026-10-27" → 'AAAA-MM-DD' (null se não for data).
// Sem o ano, vale o `anoBase` (o da linha, ou o do mês da tela).
export function lerData(texto, anoBase) {
  const t = String(texto ?? '').trim();
  let d; let m; let a;
  let x = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (x) [, a, m, d] = x.map(Number);
  else {
    x = t.match(/^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2}|\d{4}))?$/);
    if (!x) return null;
    d = Number(x[1]); m = Number(x[2]);
    a = x[3] ? Number(x[3]) : Number(anoBase);
    if (x[3] && x[3].length === 2) a += 2000;
  }
  if (!a || m < 1 || m > 12 || d < 1) return null;
  const dias = new Date(Date.UTC(a, m, 0)).getUTCDate();
  if (d > dias) return null;
  return `${a}-${p2(m)}-${p2(d)}`;
}

// A categoria pelo NOME (sem acento, sem diferenciar maiúscula), entre as do tipo da linha — a
// inativa também vale: quem cola o histórico usa os nomes antigos.
export function acharCategoria(texto, categorias, tipo) {
  const t = norm(texto);
  return categorias.find((c) => c.grupo?.tipo === tipo && norm(c.nome) === t) ?? null;
}

// O que um texto vira numa coluna. Devolve { campo, valor } ou { motivo } (por que não serve).
// `entrada` (só no valor): o texto começa com "+", o que numa linha NOVA faz dela uma entrada.
export function interpretar(c, texto, { tipo = 'saida', categorias = [], anoBase } = {}) {
  const col = COLUNAS[c];
  const t = String(texto ?? '').trim();
  if (!col?.campo) return { motivo: `${col?.nome ?? 'Esta coluna'} não se edita na grade.` };
  if (col.id === 'data') {
    const iso = lerData(t, anoBase);
    return iso ? { campo: 'data', valor: iso } : { motivo: `"${t}" não é uma data.` };
  }
  if (col.id === 'valor') {
    const centavos = parseValor(t.replace(/^\+/, ''));
    if (!centavos) return { motivo: `"${t}" não é um valor.` };
    return { campo: 'valor_centavos', valor: Math.abs(centavos), entrada: t.startsWith('+') };
  }
  if (col.id === 'categoria') {
    if (!t || t === '—' || norm(t) === 'sem categoria') return { campo: 'categoria_id', valor: null };
    const cat = acharCategoria(t, categorias, tipo);
    return cat ? { campo: 'categoria_id', valor: cat.id }
      : { motivo: `"${t}" não é uma categoria de ${tipo === 'entrada' ? 'entrada' : 'gasto'}.` };
  }
  return { campo: col.campo, valor: t };
}

// ------------------------------------------------------------ copiar e colar

// O texto que o Excel copia vira uma matriz: linhas por quebra, colunas por tabulação. A última quebra
// (o Excel termina o bloco com uma) não vira linha vazia.
export function lerBloco(texto) {
  const linhas = String(texto ?? '').replace(/\r\n?/g, '\n').split('\n');
  if (linhas.length > 1 && linhas[linhas.length - 1] === '') linhas.pop();
  return linhas.map((l) => l.split('\t').map((x) => x.trim().replace(/^"(.*)"$/s, '$1').trim()));
}

// O que uma célula mostra, em texto que o Excel lê de volta (o valor sem "R$", com vírgula decimal).
export function textoCelula(l, c) {
  switch (COLUNAS[c].id) {
    case 'data': return l.data ? formatDate(l.data) : '';
    case 'descricao': return l.descricao ?? '';
    case 'categoria': return l.categoria?.nome ?? '';
    case 'origem': return textoOrigem(l);
    case 'valor': return l.valor_centavos ? `${l.tipo === 'entrada' ? '+' : ''}${valorParaCampo(l.valor_centavos)}` : '';
    default: return l.obs ?? '';
  }
}

// O bloco da faixa como o Excel copia (tabulação e quebra). Tabulação ou quebra DENTRO de uma célula
// viram espaço, senão desmontariam o bloco.
export function textoDaFaixa(linhas, f) {
  const out = [];
  for (let r = f.r0; r <= f.r1; r++) {
    const cols = [];
    for (let c = f.c0; c <= f.c1; c++) cols.push(textoCelula(linhas[r], c).replace(/[\t\n\r]+/g, ' '));
    out.push(cols.join('\t'));
  }
  return out.join('\n');
}

// ONDE CADA CÉLULA DO BLOCO CAI, a partir de `inicio` (o canto de cima à esquerda da seleção, como no
// Excel). A linha i do bloco cai na i-ésima linha da tela a partir dali; passando da última, vira
// LINHA NOVA (r ≥ linhas.length). Célula em branco no bloco não muda nada.
// Devolve:
//   · mudancas: [{ r, campo, valor }] — o que gravar (r pode ser de linha nova);
//   · entradas: Set de r das linhas NOVAS cujo valor veio com "+";
//   · fora: [{ r, c, motivo }] — as células dentro do alcance que ficaram de fora, com a frase;
//   · alcance: a faixa onde o bloco caiu (cortada na última coluna da grade);
//   · foraDaGrade: quantas células passaram da última coluna.
export function planejarColagem({ matriz, linhas, inicio, categorias, anoBase }) {
  const mudancas = [];
  const fora = [];
  const entradas = new Set();
  let foraDaGrade = 0;
  const largura = Math.max(1, ...matriz.map((cols) => cols.length));
  matriz.forEach((cols, i) => {
    const r = inicio.r + i;
    const linha = linhas[r];
    // O tipo de uma linha nova sai do próprio bloco: valor com "+" é entrada.
    const cValor = COLUNAS.findIndex((x) => x.id === 'valor');
    const textoValor = cols[cValor - inicio.c];
    const novaEntrada = !linha && String(textoValor ?? '').trim().startsWith('+');
    if (novaEntrada) entradas.add(r);
    const tipo = linha?.tipo ?? (novaEntrada ? 'entrada' : 'saida');
    const ano = linha?.data ? Number(linha.data.slice(0, 4)) : anoBase;
    cols.forEach((texto, j) => {
      const c = inicio.c + j;
      if (c >= COLUNAS.length) { if (texto) foraDaGrade += 1; return; }
      if (!texto) return;
      const res = interpretar(c, texto, { tipo, categorias, anoBase: ano });
      if (res.motivo) fora.push({ r, c, motivo: res.motivo });
      else mudancas.push({ r, campo: res.campo, valor: res.valor });
    });
  });
  const alcance = {
    r0: inicio.r, r1: inicio.r + matriz.length - 1,
    c0: inicio.c, c1: Math.min(COLUNAS.length - 1, inicio.c + largura - 1),
  };
  return { mudancas, fora, entradas, alcance, foraDaGrade };
}

// PREENCHER PARA BAIXO (Ctrl+D): a primeira linha da faixa repete nas de baixo, coluna a coluna. A
// categoria só passa entre linhas do mesmo tipo (gasto não recebe categoria de entrada).
export function preencherAbaixo(linhas, f) {
  const mudancas = [];
  const fora = [];
  if (f.r1 <= f.r0) return { mudancas, fora };
  const topo = linhas[f.r0];
  for (let c = f.c0; c <= f.c1; c++) {
    const col = COLUNAS[c];
    if (!col.campo) continue;
    for (let r = f.r0 + 1; r <= f.r1; r++) {
      const l = linhas[r];
      if (col.id === 'categoria' && topo.categoria_id && l.tipo !== topo.tipo) {
        fora.push({ r, c, motivo: 'A categoria é de outro tipo (gasto × entrada).' });
        continue;
      }
      if (col.id === 'valor' && !topo.valor_centavos) continue;
      if (l[col.campo] !== topo[col.campo]) mudancas.push({ r, campo: col.campo, valor: topo[col.campo] ?? null });
    }
  }
  return { mudancas, fora };
}

// LIMPAR (Delete): descrição, categoria e observação esvaziam; data e valor não ficam vazios.
export function limparFaixa(linhas, f) {
  const mudancas = [];
  let presos = 0;
  for (let r = f.r0; r <= f.r1; r++) {
    for (let c = f.c0; c <= f.c1; c++) {
      const col = COLUNAS[c];
      if (!col.campo) continue;
      if (col.id === 'data' || col.id === 'valor') { presos += 1; continue; }
      const vazio = col.id === 'categoria' ? null : '';
      if ((linhas[r][col.campo] ?? vazio) !== vazio) mudancas.push({ r, campo: col.campo, valor: vazio });
    }
  }
  return { mudancas, presos };
}

// A BARRA SOB A GRADE, como a do Excel: quantas células e, nas de valor, a soma e a média. Gasto e
// entrada não se somam um com o outro: com os dois na seleção, a barra diz cada total.
export function resumoSelecao(linhas, f) {
  const celulas = (f.r1 - f.r0 + 1) * (f.c1 - f.c0 + 1);
  const cValor = COLUNAS.findIndex((x) => x.id === 'valor');
  const t = { gastos: 0, entradas: 0, nGastos: 0, nEntradas: 0 };
  if (cValor >= f.c0 && cValor <= f.c1) {
    for (let r = f.r0; r <= f.r1; r++) {
      const l = linhas[r];
      if (!l?.valor_centavos) continue;
      if (l.tipo === 'entrada') { t.entradas += l.valor_centavos; t.nEntradas += 1; }
      else { t.gastos += l.valor_centavos; t.nGastos += 1; }
    }
  }
  return { celulas, ...t };
}
