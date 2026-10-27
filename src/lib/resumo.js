import { addMeses } from './format.js';

// AS CONTAS DO RESUMO, sobre as linhas da view `resumo_mensal` (uma por mês × tipo × origem ×
// categoria, já somadas no banco). Funções puras: recebem as linhas, devolvem números — testadas
// em test/resumo.test.js. Competência em 'AAAA-MM'; valores em centavos.

const vazioMes = () => ({ entradas: 0, gastos: 0, cartao: 0, fixo: 0, manual: 0 });

// { 'AAAA-MM': { entradas, gastos, cartao, fixo, manual, saldo } }
export function totaisPorMes(linhas) {
  const m = {};
  linhas.forEach((l) => {
    const t = (m[l.competencia] ||= vazioMes());
    const v = Number(l.total_centavos);
    if (l.tipo === 'entrada') t.entradas += v;
    else {
      t.gastos += v;
      if (t[l.origem] !== undefined) t[l.origem] += v;
    }
  });
  Object.values(m).forEach((t) => { t.saldo = t.entradas - t.gastos; });
  return m;
}

// Os meses de `ate` para trás (inclusive), do mais antigo para o mais novo.
export function mesesAte(ate, quantos) {
  return Array.from({ length: quantos }, (_, i) => addMeses(ate, i - quantos + 1));
}

// Média dos `n` meses ANTERIORES a `comp` que têm algum lançamento (mês vazio não puxa a média para
// baixo: é mês sem dado, não mês sem gasto). Devolve null sem meses para comparar.
export function mediaAnterior(porMes, comp, n = 3, campo = 'gastos') {
  const anteriores = Object.keys(porMes).filter((c) => c < comp).sort().slice(-n);
  if (!anteriores.length) return null;
  return { media: Math.round(anteriores.reduce((s, c) => s + porMes[c][campo], 0) / anteriores.length), meses: anteriores.length };
}

// Gastos do mês por grupo e, dentro de cada grupo, por categoria — do maior para o menor.
// `categorias`: as do cadastro (com `grupo`); o que não tem categoria vira "Sem categoria".
export function gastosPorGrupo(linhas, comp, categorias) {
  const cat = new Map(categorias.map((c) => [c.id, c]));
  const grupos = new Map();
  linhas.filter((l) => l.competencia === comp && l.tipo === 'saida').forEach((l) => {
    const c = cat.get(l.categoria_id);
    const gid = c?.grupo?.id ?? 'sem';
    if (!grupos.has(gid)) grupos.set(gid, { id: gid, nome: c?.grupo?.nome ?? 'Sem categoria', cor: c?.grupo?.cor ?? '#9ca3af', total: 0, categorias: new Map() });
    const g = grupos.get(gid);
    const v = Number(l.total_centavos);
    g.total += v;
    const cid = c?.id ?? 'sem';
    const atual = g.categorias.get(cid) ?? { id: cid, nome: c?.nome ?? 'Sem categoria', total: 0, qtd: 0 };
    atual.total += v;
    atual.qtd += Number(l.qtd);
    g.categorias.set(cid, atual);
  });
  return [...grupos.values()]
    .map((g) => ({ ...g, categorias: [...g.categorias.values()].sort((a, b) => b.total - a.total) }))
    .sort((a, b) => b.total - a.total);
}

// Parcelas futuras somadas por mês: [{ competencia, total, qtd }] a partir de `desde` (exclusive).
export function comprometidoPorMes(parcelas, desde) {
  const m = {};
  parcelas.filter((p) => p.competencia > desde).forEach((p) => {
    const t = (m[p.competencia] ||= { competencia: p.competencia, total: 0, qtd: 0 });
    t.total += Number(p.valor_centavos);
    t.qtd += 1;
  });
  return Object.values(m).sort((a, b) => a.competencia.localeCompare(b.competencia));
}
