import { mesesAte } from './resumo.js';

// O USO DE CADA CATEGORIA, para a tela de Categorias (a "planilha agrupada"), sobre as linhas da view
// `resumo_mensal` (mês × tipo × origem × categoria, já somadas no banco). Função pura, testada em
// test/usoCategorias.test.js. Competência 'AAAA-MM'; valores em centavos.
//
// Para cada categoria: `noMes` (o total no mês escolhido), `qtd` e `soma` dos 12 meses até ele,
// `media` por mês e `ultimo` (o mês mais recente com lançamento, em qualquer época).
// A MÉDIA divide pelos meses que têm ALGUM lançamento no app (a mesma regra do `mediaAnterior`): mês
// sem dado nenhum é mês antes do histórico, não mês sem gasto.
export function usoPorCategoria(linhas, comp, n = 12) {
  const janela = new Set(mesesAte(comp, n));
  const comDado = new Set(linhas.filter((l) => janela.has(l.competencia)).map((l) => l.competencia));
  const uso = new Map();
  linhas.forEach((l) => {
    if (!l.categoria_id) return;
    const u = uso.get(l.categoria_id) ?? { noMes: 0, qtd: 0, soma: 0, media: 0, ultimo: null };
    const v = Number(l.total_centavos);
    if (l.competencia === comp) u.noMes += v;
    if (janela.has(l.competencia)) { u.qtd += Number(l.qtd); u.soma += v; }
    if (!u.ultimo || l.competencia > u.ultimo) u.ultimo = l.competencia;
    uso.set(l.categoria_id, u);
  });
  uso.forEach((u) => { u.media = comDado.size ? Math.round(u.soma / comDado.size) : 0; });
  return { uso, meses: comDado.size };
}
