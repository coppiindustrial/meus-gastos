// FASE 2 — converte a planilha antiga ("Gastos total.xlsx") num JSON que a tela "Importar histórico"
// grava no Supabase. Roda uma vez, no PC:
//
//   node scripts/migrar-planilha.mjs "C:\Users\MayCo\OneDrive\CONTAS\Gastos\Gastos total.xlsx"
//
// Saída: dados/planilha.json (pasta fora do git — são dados financeiros e o repositório é público).
//
// O script não fala com o banco: ele só lê a planilha e devolve nomes (de categoria, de cartão). Quem
// troca nome por id é a tela, com a pessoa logada (o RLS exige). Lê os valores JÁ CALCULADOS das
// fórmulas (a coluna Tipo das faturas é uma fórmula de regras).
import ExcelJS from 'exceljs';
import { mkdirSync, writeFileSync } from 'node:fs';
import { lerParcela } from '../src/lib/parcela.js';

const arquivo = process.argv[2];
if (!arquivo) {
  console.error('Uso: node scripts/migrar-planilha.mjs "caminho/Gastos total.xlsx"');
  process.exit(1);
}

// Nomes da planilha que mudaram na estrutura do app (lib/sugestoes.js). O resto é igual.
const CATEGORIA = {
  'Academia/Whey': 'Academia / Whey',
  Mercadolivre: 'Mercado Livre',
  'Gasolina/Outros': 'Gasolina',
  // descrições dos gastos fixos
  'Condomínio/gás/água': 'Condomínio',
  Empregada: 'Diarista / Empregada',
  'Personal/everton': 'Personal',
};
const categoria = (nome) => {
  const n = String(nome ?? '').trim();
  if (!n || /revisar/i.test(n)) return null;
  return CATEGORIA[n] ?? n;
};

const valor = (c) => {
  const v = c.value;
  if (v && typeof v === 'object') {
    if ('result' in v) return v.result;
    if (v instanceof Date) return v.toISOString().slice(0, 10);
    if (v.richText) return v.richText.map((t) => t.text).join('');
  }
  return v;
};
const centavos = (v) => Math.round(Number(v) * 100);
const dataISO = (v) => (v instanceof Date ? v.toISOString().slice(0, 10) : String(v ?? '').slice(0, 10));
const comp = (iso) => iso.slice(0, 7);

const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(arquivo);
const linhas = (aba, colunas) => {
  const out = [];
  wb.getWorksheet(aba).eachRow((r, i) => {
    if (i === 1) return;
    const o = {};
    colunas.forEach((c, k) => { o[c] = valor(r.getCell(k + 1)); });
    // A coluna de parcela é lida como TEXTO exibido ("06/dez"), que é o que a planilha mostra.
    if (colunas.includes('parcela')) o.parcela = r.getCell(colunas.indexOf('parcela') + 1).text;
    out.push(o);
  });
  return out;
};

// ------------------------------------------------------------ Regras (a ordem da planilha é a prioridade)
const vistas = new Set();
const regras = [];
linhas('Regras', ['palavra', 'tipo']).forEach((r, i) => {
  const palavra = String(r.palavra ?? '').trim();
  const chave = palavra.toUpperCase();
  if (!palavra || vistas.has(chave)) return; // "AMAZON" aparece duas vezes: vale a primeira
  vistas.add(chave);
  regras.push({ palavra_chave: palavra, categoria: categoria(r.tipo), prioridade: i + 1 });
});

// ------------------------------------------------------------ Faturas (uma por arquivo importado)
// "Nubank_2026-08-13_convertida.csv" → Nubank, vence 13/08/2026; "Fatura2026-05-10.csv" → XP, 10/05/2026.
function faturaDoArquivo(nome) {
  let m = nome.match(/^Nubank_(\d{4}-\d{2}-\d{2})/i);
  if (m) return { cartao: 'Nubank', vencimento: m[1] };
  m = nome.match(/^Fatura(\d{4}-\d{2}-\d{2})/i);
  if (m) return { cartao: 'XP', vencimento: m[1] };
  throw new Error(`Não sei de qual cartão é o arquivo "${nome}"`);
}
const faturas = new Map();
linhas('Faturas cartão', ['arquivo', 'data', 'estabelecimento', 'portador', 'valor', 'parcela', 'tipo'])
  .filter((r) => r.estabelecimento && r.arquivo)
  .forEach((r) => {
    if (!faturas.has(r.arquivo)) {
      const { cartao, vencimento } = faturaDoArquivo(r.arquivo);
      faturas.set(r.arquivo, { arquivo: r.arquivo, cartao, vencimento, competencia: comp(vencimento), lancamentos: [] });
    }
    const p = lerParcela(r.parcela);
    const cat = categoria(r.tipo);
    faturas.get(r.arquivo).lancamentos.push({
      data: dataISO(r.data),
      estabelecimento: String(r.estabelecimento).trim(),
      valor_centavos: centavos(r.valor),
      parcela_atual: p?.atual ?? null,
      parcela_total: p?.total ?? null,
      portador: String(r.portador ?? '').trim() || null,
      categoria: cat,
      revisar: !cat,
    });
  });

// ------------------------------------------------------------ Fixos, manuais e entradas
const outros = [];
linhas('Gastos fixos', ['mes', 'descricao', 'valor']).filter((r) => r.descricao).forEach((r) => {
  const data = dataISO(r.mes);
  outros.push({ tipo: 'saida', origem: 'fixo', data, competencia: comp(data), descricao: String(r.descricao).trim(), valor_centavos: centavos(r.valor), categoria: categoria(r.descricao) });
});
linhas('Gastos manuais', ['data', 'descricao', 'tipo', 'valor']).filter((r) => r.descricao).forEach((r) => {
  const data = dataISO(r.data);
  outros.push({ tipo: 'saida', origem: 'manual', data, competencia: comp(data), descricao: String(r.descricao).trim(), valor_centavos: centavos(r.valor), categoria: categoria(r.tipo) });
});
const ignoradas = [];
linhas('Entradas', ['mes', 'descricao', 'valor']).filter((r) => r.descricao).forEach((r) => {
  const data = dataISO(r.mes);
  const linha = { tipo: 'entrada', origem: 'entrada', data, competencia: comp(data), descricao: String(r.descricao).trim(), valor_centavos: centavos(r.valor), categoria: categoria(r.descricao) };
  if (linha.valor_centavos > 0) outros.push(linha); else ignoradas.push(`${data} ${linha.descricao} (valor zero)`);
});

// ------------------------------------------------------------ Conferência (os totais que o app tem de reproduzir)
const soma = (arr) => arr.reduce((s, l) => s + l.valor_centavos, 0);
const listaFaturas = [...faturas.values()].sort((a, b) => a.vencimento.localeCompare(b.vencimento) || a.cartao.localeCompare(b.cartao));
const conferencia = {
  porFatura: Object.fromEntries(listaFaturas.map((f) => [f.arquivo, { linhas: f.lancamentos.length, total: soma(f.lancamentos) }])),
  fixos: { linhas: outros.filter((l) => l.origem === 'fixo').length, total: soma(outros.filter((l) => l.origem === 'fixo')) },
  manuais: { linhas: outros.filter((l) => l.origem === 'manual').length, total: soma(outros.filter((l) => l.origem === 'manual')) },
  entradas: { linhas: outros.filter((l) => l.origem === 'entrada').length, total: soma(outros.filter((l) => l.origem === 'entrada')) },
};

const saida = {
  formato: 'meus-gastos/planilha@1',
  arquivo: arquivo.split(/[\\/]/).pop(),
  geradoEm: new Date().toISOString(),
  regras,
  faturas: listaFaturas,
  lancamentos: outros,
  ignoradas,
  conferencia,
};
mkdirSync(new URL('../dados/', import.meta.url), { recursive: true });
writeFileSync(new URL('../dados/planilha.json', import.meta.url), JSON.stringify(saida, null, 1));

// Resumo SEM valores (não se imprime dado financeiro).
const nCartao = listaFaturas.reduce((s, f) => s + f.lancamentos.length, 0);
console.log(`Regras: ${regras.length} · Faturas: ${listaFaturas.length} (${nCartao} lançamentos de cartão)`);
console.log(`Fixos: ${conferencia.fixos.linhas} · Manuais: ${conferencia.manuais.linhas} · Entradas: ${conferencia.entradas.linhas}`);
console.log(`Sem categoria (vão para Revisar): ${listaFaturas.flatMap((f) => f.lancamentos).filter((l) => l.revisar).length}`);
console.log(`Parcelas lidas: ${listaFaturas.flatMap((f) => f.lancamentos).filter((l) => l.parcela_total).length}`);
if (ignoradas.length) console.log(`Ignoradas: ${ignoradas.join('; ')}`);
console.log('Gerado: dados/planilha.json');
