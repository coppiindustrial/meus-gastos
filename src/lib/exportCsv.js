// Exporta uma lista de objetos para um arquivo CSV que o Excel abre direto.
// Separador `;` (padrão pt-BR do Excel) e BOM UTF-8 para os acentos aparecerem.
//
// AS COLUNAS DECLARAM O TIPO, e é isso que separa este helper de um `String(v)`. Enquanto ele
// escrevia o valor cru, o Excel ficava livre para adivinhar o tipo de cada célula — e adivinhava
// errado nas quatro classes que este app exporta:
//
//   · a data saía `2026-08-31T03:00:00.000Z` (o `Date` serializado em JSON pelo `pg`);
//   · o telefone `+5549999953099` virava `5,55E+12`, porque o Excel o leu como NÚMERO;
//   · o valor saía `1138751.06`, com ponto decimal, numa planilha em pt-BR;
//   · e o nº do orçamento PERDIA OS ZEROS À ESQUERDA — `0005902026` virava `5902026`, e o
//     `cod_cliente` `004350` virava `4350`. É a mesma classe do incidente de 24/08/2026 que
//     desligou a base do histórico, agora na SAÍDA em vez da entrada.
//
// Antes disso, metade das telas pré-formatava à mão (`formatBRL`, `formatDate`) e a outra metade
// exportava cru: os dois grupos erravam por motivos OPOSTOS — um mandava um número que o Excel lia
// torto, o outro mandava `R$ 1.138.751,06`, que é TEXTO e não soma. O tipo por coluna é o que faz as
// 16 exportações convergirem para uma decisão só.
//
// `columns` aceita DUAS formas, e a segunda é a que o `UltimosContatosAmpliado` já escrevia (e que
// quebrava, porque o helper desestruturava `[, label]` sobre um objeto):
//
//   ['chave', 'Rótulo']                        → texto cru, exatamente como sempre
//   ['chave', 'Rótulo', 'tipo']                → o mesmo, com formato
//   { key, label, tipo, map }                  → `map(linha)` para coluna derivada
//
// SÃO QUATRO TIPOS e não cinco: um `datahora` chegou a existir e saiu por não ter consumidor —
// `agrupado_em`, `pausado_em`, `finalizado_em` e `created_at` são timestamps, mas o app inteiro os
// trata como DIA (as telas usam `formatDate` e os catálogos do "Filtro" os declaram `tipo: data`),
// e a exportação tem de concordar com a tela que a gerou.
export function exportCsv(filename, rows, columns) {
  const sep = ';';
  const esc = (v) => {
    if (v === null || v === undefined) return '';
    let s = String(v);
    if (s.includes('"')) s = s.replace(/"/g, '""');
    if (s.includes(sep) || s.includes('"') || s.includes('\n')) s = `"${s}"`;
    return s;
  };

  const vazio = (v) => v === null || v === undefined || v === '';

  // DATA PURA. O corte dos 10 primeiros caracteres é o mesmo do `formatDate`, e para uma coluna DATE
  // ele é o CERTO: o `pg` devolve `2026-08-31` e o JSON o serializa como `2026-08-31T03:00:00.000Z`
  // (meia-noite em Brasília), então `new Date(...)` e um `toLocaleDateString` devolveriam o dia
  // ANTERIOR em parte do fuso. Nos timestamps (`agrupado_em`, `created_at`) ele mostra o dia em
  // UTC, que é o MESMO desvio que a tela tem — e concordar com a tela é o que se quer aqui.
  const fData = (v) => {
    if (vazio(v)) return '';
    const m = String(v).slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) return `${m[3]}/${m[2]}/${m[1]}`;
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('pt-BR');
  };

  // NÚMERO em pt-BR, e SEM o `R$`: o símbolo é justamente o que faz parte dos Excel tratarem a
  // célula como texto, e o cabeçalho da coluna já diz "Valor Orçado". Uma coluna de dinheiro que não
  // SOMA é uma captura de tela em outro formato — a regra que o `relatorioXlsx.js` já declara.
  //
  // O `Number(v)` é obrigatório: o `pg` devolve `numeric` como STRING, então o valor chega aqui como
  // `"1138751.06"` e não como número.
  const fNum = (v, casas) => {
    if (vazio(v)) return '';
    const n = Number(v);
    if (Number.isNaN(n)) return '';
    return n.toLocaleString('pt-BR', {
      minimumFractionDigits: casas ?? 0, maximumFractionDigits: casas ?? 2,
    });
  };

  // O QUE O EXCEL NÃO PODE TOCAR: nº de orçamento (zeros à esquerda), código de cliente e telefone.
  // O `="..."` é o único jeito num CSV — aspas sozinhas não impedem a conversão. O custo é conhecido
  // e assumido: em leitores que não sejam o Excel a célula aparece como fórmula.
  //
  // A fuga dupla acontece de graça: este ramo devolve `="0005902026"`, o `esc` lá em cima vê as
  // aspas, dobra-as e cita a célula inteira — `"=""0005902026"""`, que é a forma correta.
  const fCodigo = (v) => (vazio(v) ? '' : `="${String(v).replace(/"/g, '""')}"`);

  const FMT = {
    data: fData,
    dinheiro: (v) => fNum(v, 2),
    numero: (v) => fNum(v),
    codigo: fCodigo,
  };

  const cols = columns.map((c) => (Array.isArray(c)
    ? { key: c[0], label: c[1], tipo: c[2] }
    : c));

  const valor = (col, linha) => {
    const bruto = col.map ? col.map(linha) : linha[col.key];
    const fmt = FMT[col.tipo];
    return fmt ? fmt(bruto) : bruto;
  };

  const header = cols.map((c) => esc(c.label)).join(sep);
  const lines = rows.map((r) => cols.map((c) => esc(valor(c, r))).join(sep));
  const csv = '﻿' + [header, ...lines].join('\r\n');

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const stamp = new Date().toISOString().slice(0, 10);
  // O `.csv` que já venha no nome não vira um segundo: uma das chamadas passa
  // `contatos-${nome}.csv` e o arquivo saía `contatos-x.csv_2026-08-31.csv`.
  const base = String(filename).replace(/\.csv$/i, '');
  const a = document.createElement('a');
  a.href = url;
  a.download = `${base}_${stamp}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
