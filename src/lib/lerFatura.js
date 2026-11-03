import { MODELOS_PRONTOS, lerComModelo, linhasDoTexto, reconhecerModelo } from './modeloCsv.js';

// LEITURA DO CSV DA FATURA. Dois formatos prontos, reconhecidos pelo CABEÇALHO (não pelo nome do arquivo):
//
//   nubank — o arquivo como o Nubank exporta:   date,title,amount
//            2026-07-06,Amazon - Parcela 9/12,"208,25"   (a parcela vem no fim do título)
//            2026-07-06,Pagamento recebido,"- 2.998,73"  (pagamento da fatura anterior: negativo)
//
//   padrao — o da XP (e das faturas do Nubank que você converteu para a planilha):
//            Data;Estabelecimento;Portador;Valor;Parcela
//            08/04/2026;ZARA;FULANO;R$ 229,00;-
//
// Desde 03/11/2026 os dois são MODELOS (`MODELOS_PRONTOS` em `lib/modeloCsv.js`): a leitura é a mesma dos modelos que
// o usuário ensina (fase 1 do importador configurável). Devolve { formato, linhas, ignoradas }. `linhas` são só os
// GASTOS (valor positivo); pagamentos, estornos e créditos (valor negativo) vão para `ignoradas`, para a tela mostrar
// o que ficou de fora.
export function lerFatura(texto) {
  if (!linhasDoTexto(texto).length) throw new Error('O arquivo está vazio.');
  const modelo = reconhecerModelo(texto, MODELOS_PRONTOS);
  if (!modelo) {
    throw new Error('Formato de CSV não reconhecido. Use o arquivo exportado pelo Nubank (date,title,amount) ou o da XP (Data;Estabelecimento;Portador;Valor;Parcela).');
  }
  return { formato: modelo.id === 'nubank' ? 'nubank' : 'padrao', ...lerComModelo(texto, modelo.config) };
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
