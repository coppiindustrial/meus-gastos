import { parseValor } from './dinheiro.js';

// LEITURA DO EXTRATO DA CONTA (CSV do Nubank: `Data,Valor,Identificador,Descrição`).
//   02/09/2026,-149.90,<uuid>,Pagamento de boleto efetuado - EMPRESA X
//   04/09/2026,-360.00,<uuid>,Transferência enviada pelo Pix - FULANO - •••.123.456-•• - BANCO (0001) …
// Cada linha vira { data, valor_centavos (com sinal), id_externo, descricao_original, tipo, contraparte, nome }:
//   `contraparte` é quem recebeu/enviou (o que vai para o estabelecimento e para as regras) e `nome` o texto
//   curto da tela ("Pix · FULANO", "Boleto · EMPRESA X").

function dividir(linha) {
  const campos = [];
  let atual = '';
  let aspas = false;
  for (let i = 0; i < linha.length; i += 1) {
    const ch = linha[i];
    if (ch === '"') {
      if (aspas && linha[i + 1] === '"') { atual += '"'; i += 1; } else aspas = !aspas;
    } else if (ch === ',' && !aspas) { campos.push(atual); atual = ''; } else atual += ch;
  }
  campos.push(atual);
  return campos.map((c) => c.trim());
}

const TIPOS = [
  { tipo: 'pix_enviado', re: /^Transfer[êe]ncia enviada pelo Pix\s*-\s*(.*)$/i, rotulo: 'Pix' },
  { tipo: 'pix_recebido', re: /^Transfer[êe]ncia recebida pelo Pix\s*-\s*(.*)$/i, rotulo: 'Pix recebido' },
  { tipo: 'boleto', re: /^Pagamento de boleto efetuado\s*-\s*(.*)$/i, rotulo: 'Boleto' },
  { tipo: 'debito', re: /^Compra no d[ée]bito\s*-\s*(.*)$/i, rotulo: 'Débito' },
];

// "FULANO - •••.123.456-•• - BANCO (0001) Agência…" → "FULANO" (o resto é documento e banco).
const soONome = (s) => s.split(/\s+-\s+(?=[•*\d])/)[0].trim();

export function lerExtrato(texto) {
  const linhas = String(texto).replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim() !== '');
  if (!linhas.length) throw new Error('O arquivo está vazio.');
  if (!linhas[0].toLowerCase().replace(/\s/g, '').startsWith('data,valor,identificador,descri')) {
    throw new Error('Formato não reconhecido. Use o CSV do extrato da conta do Nubank (Data,Valor,Identificador,Descrição).');
  }
  return linhas.slice(1).map((bruta, i) => {
    const [data, valor, id, ...resto] = dividir(bruta);
    const descricao = resto.join(',').trim();
    const m = data.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    const centavos = parseValor(valor);
    if (!m || centavos === null || !id) throw new Error(`Linha ${i + 2} ilegível: "${bruta.slice(0, 60)}…"`);
    const achado = TIPOS.map((t) => ({ t, x: descricao.match(t.re) })).find((r) => r.x);
    const contraparte = achado ? soONome(achado.x[1]) : descricao;
    return {
      data: `${m[3]}-${m[2]}-${m[1]}`,
      valor_centavos: centavos,
      id_externo: id,
      descricao_original: descricao,
      tipo: achado?.t.tipo ?? 'outro',
      contraparte,
      nome: achado ? `${achado.t.rotulo} · ${contraparte}` : descricao,
    };
  });
}

// O que nunca é gasto, em qualquer extrato do Nubank: pagamento da fatura (já está no cartão) e o
// dinheiro indo e voltando dos investimentos da própria conta.
const SEMPRE_IGNORAR = [
  [/^Pagamento de fatura/i, 'pagamento da fatura do cartão'],
  [/\bRDB\b/i, 'investimento'],
  [/Dinheiro guardado|resgate planejado/i, 'investimento'],
];

// Por que a linha fica de fora (ou null se é um gasto a importar). `regraIgnorar(linha)` diz se alguma
// regra de ignorar pega a linha (as transferências para as suas próprias contas).
export const MOTIVO_ENTRADA = 'entrada (lançada à mão)';
export function motivoIgnorar(linha, regraIgnorar) {
  // Primeiro os de sempre: o resgate de um investimento é crédito, mas não é "entrada".
  const fixo = SEMPRE_IGNORAR.find(([re]) => re.test(linha.descricao_original));
  if (fixo) return fixo[1];
  if (linha.valor_centavos > 0) return MOTIVO_ENTRADA;
  if (regraIgnorar?.(linha)) return 'regra de ignorar';
  return null;
}
