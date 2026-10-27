import { competenciaCurta, competenciaDe } from './format.js';

// GASTOS FIXOS: cada recorrência (luz, internet, condomínio…) vira, todo mês em que está vigente, uma
// SUGESTÃO de lançamento. Funções puras (testadas em test/fixos.test.js). Competência em 'AAAA-MM'.

const p2 = (n) => String(n).padStart(2, '0');

// A recorrência vale neste mês? (ativa, já começou e ainda não terminou)
export function vigente(rec, comp) {
  if (!rec.ativa) return false;
  if (rec.inicio && competenciaDe(rec.inicio) > comp) return false;
  if (rec.fim && competenciaDe(rec.fim) < comp) return false;
  return true;
}

// A data do lançamento no mês: o dia da recorrência, ou o último dia se o mês for mais curto.
export function dataNoMes(comp, dia) {
  const [y, m] = comp.split('-').map(Number);
  const ultimo = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${comp}-${p2(Math.min(Math.max(1, dia || 1), ultimo))}`;
}

// A situação de cada recorrência no mês:
//   { rec, lancamento }        → já lançado (o lançamento daquela recorrência na competência)
//   { rec, sugerido, base }    → pendente: o valor sugerido é o do ÚLTIMO lançamento dela (a conta de luz
//                                de mês passado diz mais que um valor padrão parado), senão o padrão.
// `lancamentosDoMes`: os lançamentos da competência que têm `recorrencia_id`.
// `ultimos`: { recorrencia_id: { valor_centavos, competencia } } — o mais recente ANTES do mês.
export function situacaoDoMes(recorrencias, lancamentosDoMes, ultimos, comp) {
  const lancado = new Map(lancamentosDoMes.map((l) => [l.recorrencia_id, l]));
  return recorrencias
    .filter((r) => lancado.has(r.id) || vigente(r, comp))
    .map((rec) => {
      const lancamento = lancado.get(rec.id);
      if (lancamento) return { rec, lancamento };
      const ultimo = ultimos[rec.id];
      return ultimo
        ? { rec, sugerido: ultimo.valor_centavos, base: `valor de ${competenciaCurta(ultimo.competencia)}` }
        : { rec, sugerido: rec.valor_padrao_centavos, base: 'valor padrão' };
    })
    .sort((a, b) => (a.rec.dia_do_mes - b.rec.dia_do_mes) || a.rec.descricao.localeCompare(b.rec.descricao, 'pt-BR'));
}

// O último lançamento de cada recorrência ANTES de `comp` (a lista vem do banco, de qualquer ordem).
export function ultimosPorRecorrencia(lancamentos, comp) {
  const m = {};
  lancamentos.filter((l) => l.recorrencia_id && l.competencia < comp).forEach((l) => {
    const atual = m[l.recorrencia_id];
    if (!atual || l.competencia > atual.competencia) m[l.recorrencia_id] = { valor_centavos: Number(l.valor_centavos), competencia: l.competencia };
  });
  return m;
}

// A partir dos fixos já lançados (o histórico da planilha), uma recorrência por descrição: categoria e
// valor do mês mais recente, início no primeiro mês, dia 1 (a planilha lançava fixo no dia 1).
// `lancamentos`: os de origem 'fixo' sem recorrência.
export function recorrenciasDoHistorico(lancamentos) {
  const por = new Map();
  lancamentos.forEach((l) => {
    const k = l.descricao.trim().toLowerCase();
    const g = por.get(k) ?? { descricao: l.descricao.trim(), itens: [] };
    g.itens.push(l);
    por.set(k, g);
  });
  return [...por.values()].map(({ descricao, itens }) => {
    const ordenados = [...itens].sort((a, b) => a.competencia.localeCompare(b.competencia));
    const ultimo = ordenados[ordenados.length - 1];
    return {
      descricao,
      categoria_id: ultimo.categoria_id,
      valor_padrao_centavos: Number(ultimo.valor_centavos),
      dia_do_mes: Number(ultimo.data.slice(8, 10)) || 1,
      inicio: `${ordenados[0].competencia}-01`,
      ativa: true,
      ids: itens.map((l) => l.id),
      meses: ordenados.length,
    };
  }).sort((a, b) => a.descricao.localeCompare(b.descricao, 'pt-BR'));
}

// A MATRIZ DO ANO (a tela de Gastos fixos, "fixo × mês"): para cada recorrência, uma célula por mês.
//   'lancado'  → { lancamento, valor, antes }: `antes` é o valor lançado no mês anterior (ou null);
//   'pendente' → vigente, sem lançamento, até o mês atual: { sugerido, base } (como no `situacaoDoMes`);
//   'futuro'   → vigente, depois do mês atual: { sugerido, base };
//   'fora'     → fora da vigência (inativa, antes do início ou depois do fim).
// Um lançamento existente vale mesmo fora da vigência (a recorrência pode ter sido encerrada depois).
// Entram as recorrências vigentes em algum mês do ano ou com lançamento nele, na ordem do dia.
// `media`: a média dos meses lançados no ano; `totais`: { comp: soma do lançado }.
export function matrizDoAno(recorrencias, lancamentos, ano, hoje) {
  const comps = Array.from({ length: 12 }, (_, i) => `${ano}-${p2(i + 1)}`);
  const lanc = new Map(lancamentos.filter((l) => l.recorrencia_id).map((l) => [`${l.recorrencia_id}|${l.competencia}`, l]));
  const ultimosPorMes = Object.fromEntries(comps.map((c) => [c, ultimosPorRecorrencia(lancamentos, c)]));
  const totais = Object.fromEntries(comps.map((c) => [c, 0]));
  const linhas = recorrencias.map((rec) => {
    const celulas = comps.map((comp, i) => {
      const l = lanc.get(`${rec.id}|${comp}`);
      if (l) {
        const valor = Number(l.valor_centavos);
        totais[comp] += valor;
        const ant = lanc.get(`${rec.id}|${i ? comps[i - 1] : `${ano - 1}-12`}`);
        return { comp, estado: 'lancado', lancamento: l, valor, antes: ant ? Number(ant.valor_centavos) : null };
      }
      if (!vigente(rec, comp)) return { comp, estado: 'fora' };
      const u = ultimosPorMes[comp][rec.id];
      const sug = u ? { sugerido: u.valor_centavos, base: `valor de ${competenciaCurta(u.competencia)}` } : { sugerido: rec.valor_padrao_centavos, base: 'valor padrão' };
      return { comp, estado: comp <= hoje ? 'pendente' : 'futuro', ...sug };
    });
    const lancadas = celulas.filter((c) => c.estado === 'lancado');
    return {
      rec,
      celulas,
      total: lancadas.reduce((s, c) => s + c.valor, 0),
      media: lancadas.length ? Math.round(lancadas.reduce((s, c) => s + c.valor, 0) / lancadas.length) : null,
    };
  })
    .filter((x) => x.celulas.some((c) => c.estado !== 'fora'))
    .sort((a, b) => (a.rec.dia_do_mes - b.rec.dia_do_mes) || a.rec.descricao.localeCompare(b.rec.descricao, 'pt-BR'));
  return { comps, linhas, totais };
}
