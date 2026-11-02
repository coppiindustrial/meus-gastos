import { mesesAte } from './resumo.js';
import { mediaDaCategoria } from './visaoGeral.js';

// O USO DE CADA CATEGORIA, para a tela de Categorias (a "planilha agrupada"), sobre as linhas da view
// `resumo_mensal` (mês × tipo × origem × categoria, já somadas no banco). Função pura, testada em
// test/usoCategorias.test.js. Competência 'AAAA-MM'; valores em centavos.
//
// Para cada categoria: `noMes` (o total no mês escolhido), `qtd` e `soma` dos 12 meses até ele,
// `media` por mês e `ultimo` (o mês mais recente com lançamento, em qualquer época).
// A MÉDIA divide pelos meses que têm ALGUM lançamento no app (mês sem dado nenhum é mês antes do
// histórico, não mês sem gasto), sem o mês EM ANDAMENTO (`emAndamento`, o atual) quando há outros —
// a regra de `mediaPorMes` em lib/visaoGeral.js. A categoria de GASTO FIXO só divide a partir do 1º mês em que
// aparece (`mediaDaCategoria`, 02/11/2026): o condomínio de quem se mudou em maio não divide desde janeiro.
export function usoPorCategoria(linhas, comp, n = 12, emAndamento) {
  const janela = new Set(mesesAte(comp, n));
  let comDado = new Set(linhas.filter((l) => janela.has(l.competencia)).map((l) => l.competencia));
  if (comDado.size > 1 && comDado.has(emAndamento)) comDado = new Set([...comDado].filter((x) => x !== emAndamento));
  const uso = new Map();
  linhas.forEach((l) => {
    if (!l.categoria_id) return;
    const u = uso.get(l.categoria_id) ?? { noMes: 0, qtd: 0, soma: 0, media: 0, ultimo: null, somaMedia: 0, fixo: 0, meses: {} };
    const v = Number(l.total_centavos);
    if (l.competencia === comp) u.noMes += v;
    if (janela.has(l.competencia)) { u.qtd += Number(l.qtd); u.soma += v; }
    if (comDado.has(l.competencia)) {
      u.somaMedia += v;
      if (l.origem === 'fixo') u.fixo += v;
      u.meses[l.competencia] = (u.meses[l.competencia] ?? 0) + v;
    }
    if (!u.ultimo || l.competencia > u.ultimo) u.ultimo = l.competencia;
    uso.set(l.categoria_id, u);
  });
  const daMedia = [...comDado].sort();
  uso.forEach((u) => {
    const m = daMedia.length ? mediaDaCategoria({ total: u.somaMedia, fixo: u.fixo, meses: u.meses }, daMedia) : { media: 0, desde: null };
    u.media = m.media;
    if (m.desde) u.desde = m.desde;
    delete u.somaMedia; delete u.fixo; delete u.meses;
  });
  return { uso, meses: comDado.size };
}
