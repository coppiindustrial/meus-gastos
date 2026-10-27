import { parseValor } from './dinheiro.js';
import { lerParcela } from './parcela.js';

// LEITURA DO CSV DA FATURA. Dois formatos, reconhecidos pelo CABEÇALHO (não pelo nome do arquivo):
//
//   nubank — o arquivo como o Nubank exporta:   date,title,amount
//            2026-07-06,Amazon - Parcela 9/12,"208,25"   (a parcela vem no fim do título)
//            2026-07-06,Pagamento recebido,"- 2.998,73"  (pagamento da fatura anterior: negativo)
//
//   padrao — o da XP (e das faturas do Nubank que você converteu para a planilha):
//            Data;Estabelecimento;Portador;Valor;Parcela
//            08/04/2026;ZARA;FULANO;R$ 229,00;-
//
// Devolve { formato, linhas, ignoradas }. `linhas` são só os GASTOS (valor positivo); pagamentos,
// estornos e créditos (valor negativo) vão para `ignoradas`, para a tela mostrar o que ficou de fora.

// Quebra uma linha de CSV respeitando aspas ("53,90" tem vírgula dentro).
function dividir(linha, sep) {
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

const dataBR = (s) => {
  const m = String(s).trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
};
const dataISO = (s) => (/^\d{4}-\d{2}-\d{2}$/.test(String(s).trim()) ? String(s).trim() : null);

// "Amazon - Parcela 9/12" → { nome: 'Amazon', parcela: { atual: 9, total: 12 } }
function separarParcela(titulo) {
  const m = titulo.match(/^(.*?)\s*-\s*Parcela\s+(\d+)\s*\/\s*(\d+)\s*$/i);
  if (!m) return { nome: titulo, parcela: null };
  return { nome: m[1].trim(), parcela: lerParcela(`${m[2]}/${m[3]}`) };
}

export function lerFatura(texto) {
  const linhasBrutas = String(texto).replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim() !== '');
  if (linhasBrutas.length === 0) throw new Error('O arquivo está vazio.');
  const cab = linhasBrutas[0].toLowerCase().replace(/\s/g, '');

  let formato;
  let ler;
  if (cab.startsWith('date,title,amount')) {
    formato = 'nubank';
    ler = (l) => {
      const [data, titulo, valor] = dividir(l, ',');
      const { nome, parcela } = separarParcela(titulo ?? '');
      return { data: dataISO(data), estabelecimento: nome, valor_centavos: parseValor(valor), parcela, portador: null };
    };
  } else if (cab.startsWith('data;estabelecimento;portador;valor;parcela')) {
    formato = 'padrao';
    ler = (l) => {
      const [data, estab, portador, valor, parcela] = dividir(l, ';');
      return { data: dataBR(data), estabelecimento: estab ?? '', valor_centavos: parseValor(valor), parcela: lerParcela(parcela), portador: portador || null };
    };
  } else {
    throw new Error('Formato de CSV não reconhecido. Use o arquivo exportado pelo Nubank (date,title,amount) ou o da XP (Data;Estabelecimento;Portador;Valor;Parcela).');
  }

  const linhas = [];
  const ignoradas = [];
  linhasBrutas.slice(1).forEach((bruta, i) => {
    const l = ler(bruta);
    if (!l.data || l.valor_centavos === null || !l.estabelecimento) {
      throw new Error(`Linha ${i + 2} ilegível: "${bruta.slice(0, 80)}"`);
    }
    const linha = {
      data: l.data,
      estabelecimento: l.estabelecimento,
      valor_centavos: l.valor_centavos,
      parcela_atual: l.parcela?.atual ?? null,
      parcela_total: l.parcela?.total ?? null,
      portador: l.portador,
    };
    if (linha.valor_centavos > 0) linhas.push(linha); else ignoradas.push(linha);
  });
  return { formato, linhas, ignoradas };
}

// Pelo nome do arquivo: "Nubank_2026-08-13…" → Nubank, vence 13/08/2026; "Fatura2026-05-10…" → XP.
export function pistaDoArquivo(nome) {
  let m = String(nome).match(/^nubank_(\d{4}-\d{2}-\d{2})/i);
  if (m) return { cartao: 'nubank', vencimento: m[1] };
  m = String(nome).match(/^fatura(\d{4}-\d{2}-\d{2})/i);
  if (m) return { cartao: 'xp', vencimento: m[1] };
  return { cartao: null, vencimento: null };
}

// Sem pista no nome: o vencimento é o próximo dia `diaVencimento` DEPOIS da compra mais recente
// (a fatura fecha alguns dias antes de vencer). Mês curto: o dia vira o último do mês.
export function vencimentoProvavel(linhas, diaVencimento) {
  if (!linhas.length || !diaVencimento) return null;
  const ultima = linhas.reduce((m, l) => (l.data > m ? l.data : m), linhas[0].data);
  let [y, mes] = ultima.split('-').map(Number);
  const dia = Number(ultima.slice(8, 10));
  const p2 = (n) => String(n).padStart(2, '0');
  const noMes = (ano, m) => Math.min(diaVencimento, new Date(Date.UTC(ano, m, 0)).getUTCDate());
  if (dia >= noMes(y, mes)) { mes += 1; if (mes > 12) { mes = 1; y += 1; } }
  return `${y}-${p2(mes)}-${p2(noMes(y, mes))}`;
}
