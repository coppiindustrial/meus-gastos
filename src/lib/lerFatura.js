import { MODELOS_PRONTOS, lerComModelo, linhasDoTexto, reconhecerModelo, vencimentoDoNome } from './modeloCsv.js';

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

// O VENCIMENTO DE UM ARQUIVO pelo que o modelo diz (`config.vencimento`, fase 7 do importador configurável):
// 'nome' = a data no nome do arquivo (sem ela, cai para a do dia); 'dia' = o dia do cartão depois da última compra;
// 'perguntar' = nenhum (a tela pede). Devolve { vencimento, como }.
export function vencimentoDoArquivo(config, nomeArquivo, linhas, diaVencimento) {
  if (config.vencimento === 'perguntar') return { vencimento: null, como: 'perguntar' };
  const doNome = config.vencimento === 'nome' ? vencimentoDoNome(nomeArquivo) : null;
  if (doNome) return { vencimento: doNome, como: 'nome' };
  const doDia = vencimentoProvavel(linhas, diaVencimento);
  return { vencimento: doDia, como: doDia ? 'dia' : 'perguntar' };
}

// A FATURA PELOS MODELOS (fase 7.3 do importador configurável): o que os dois importadores (o de uma fatura e o
// "Importar arquivos") fazem com um arquivo. O MODELO é o primeiro que reconhece o cabeçalho — os do usuário antes
// dos prontos. O CARTÃO: num pronto, pelo nome do arquivo, senão a célula que abriu o importador (`inicial`), senão o
// único cartão daquele formato; num modelo do usuário, a célula, senão o único cartão ligado a ele. O VENCIMENTO: num
// pronto, o do nome ou o da célula ou o dia do cartão; num do usuário, o que o modelo diz (`vencimentoDoArquivo`),
// com o da célula valendo sobre o palpite do dia. Nenhum modelo reconhece: erro com `naoReconhecido` (a tela oferece
// "Ensinar este formato"). Devolve { modelo, formato, linhas, ignoradas, cartao, vencimento }.
export const NAO_RECONHECIDO = 'Formato de CSV não reconhecido: não é o do Nubank, nem o da XP, nem um dos formatos que você ensinou.';
export function lerFaturaComModelos(texto, nomeArquivo, { modelos = [], cartoes = [], inicial = null } = {}) {
  if (!linhasDoTexto(texto).length) throw new Error('O arquivo está vazio.');
  const modelo = reconhecerModelo(texto, [...modelos.filter((m) => m.tipo !== 'extrato' && !m.pronto), ...MODELOS_PRONTOS]);
  if (!modelo) throw Object.assign(new Error(NAO_RECONHECIDO), { naoReconhecido: true });
  const r = lerComModelo(texto, modelo.config);
  const ativos = cartoes.filter((c) => c.ativo);
  const daCelula = inicial?.cartaoId ? ativos.find((x) => x.id === inicial.cartaoId) ?? null : null;
  let cartao;
  let vencimento;
  if (modelo.pronto) {
    const pista = pistaDoArquivo(nomeArquivo);
    const porFormato = ativos.filter((c) => c.formato === modelo.id);
    const celula = pista.cartao ? null : daCelula;
    cartao = ativos.find((x) => x.formato === pista.cartao) ?? celula ?? (porFormato.length === 1 ? porFormato[0] : null);
    vencimento = pista.vencimento ?? (celula ? inicial.vencimento : null) ?? vencimentoProvavel(r.linhas, cartao?.dia_vencimento) ?? null;
  } else {
    const doModelo = ativos.filter((c) => c.formato === 'modelo' && c.modelo_id === modelo.id);
    cartao = daCelula ?? (doModelo.length === 1 ? doModelo[0] : null);
    const v = vencimentoDoArquivo(modelo.config, nomeArquivo, r.linhas, cartao?.dia_vencimento);
    vencimento = (v.como === 'nome' ? v.vencimento : (daCelula && inicial.vencimento) || v.vencimento) ?? null;
  }
  return { modelo, formato: modelo.pronto ? (modelo.id === 'nubank' ? 'nubank' : 'padrao') : 'modelo', ...r, cartao, vencimento };
}
