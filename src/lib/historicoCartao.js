// O HISTÓRICO DO CARTÃO (03/11/2026, mockup "Cartões · o ampliado do cartão"): as contas puras e testadas do painel
// que o ⤢ do bloco abre — a linha do tempo (todas as faturas do período e as parcelas que vêm), o ano × ano, a
// tabela e o "por categoria" (de onde o cartão foi gasto e onde mais se comprou).
import { addMeses, competenciaDe } from './format.js';

const mesesEntre = (a, b) => (Number(b.slice(0, 4)) - Number(a.slice(0, 4))) * 12 + Number(b.slice(5, 7)) - Number(a.slice(5, 7));
export const PERIODOS = [{ value: '12', label: '12 meses' }, { value: '24', label: '24 meses' }, { value: 'tudo', label: 'Todo o histórico' }];

// As faturas do cartão somadas por competência: Map 'AAAA-MM' → { total, qtd, vencimento }.
function porCompetencia(faturas) {
  const m = new Map();
  faturas.forEach((f) => {
    const x = m.get(f.competencia) ?? { total: 0, qtd: 0, vencimento: null };
    x.total += Number(f.total_centavos ?? 0);
    x.qtd += f.qtd ?? 0;
    x.vencimento = x.vencimento ?? f.vencimento?.slice(0, 10) ?? null;
    m.set(f.competencia, x);
  });
  return m;
}
function parcelasPorMes(parcelas) {
  const m = new Map();
  parcelas.forEach((p) => {
    const x = m.get(p.competencia) ?? { total: 0, compras: new Set() };
    x.total += Number(p.valor_centavos);
    x.compras.add(p.lancamento_id);
    m.set(p.competencia, x);
  });
  return m;
}

// LINHA DO TEMPO: os meses do período até a fatura mais recente (mês sem fatura = coluna vazia) e, depois dela, TODAS
// as parcelas que vêm. `faturas`/`parcelas`: só as do cartão. `periodo`: '12' | '24' | 'tudo'.
// Devolve { colunas: [{ comp, tipo, total, qtd, vencimento }], anos: [{ ano, n }], resumo, linhas (a tabela) }.
export function linhaDoTempo({ faturas, parcelas, periodo = '12', hoje }) {
  const fs = porCompetencia(faturas);
  const ps = parcelasPorMes(parcelas);
  const comps = [...fs.keys()].sort();
  const fim = comps[comps.length - 1] ?? competenciaDe(hoje);
  const inicio = periodo === 'tudo' ? (comps[0] ?? fim) : addMeses(fim, -(Number(periodo) - 1));
  const nPass = mesesEntre(inicio, fim) + 1;
  const ultimaParcela = [...ps.keys()].filter((k) => k > fim).sort().pop();
  const nFut = ultimaParcela ? mesesEntre(fim, ultimaParcela) : 0;
  const colunas = [
    ...Array.from({ length: nPass }, (_, i) => {
      const comp = addMeses(inicio, i);
      const f = fs.get(comp);
      return { comp, tipo: 'fatura', total: f?.total ?? 0, qtd: f?.qtd ?? 0, vencimento: f?.vencimento ?? null };
    }),
    ...Array.from({ length: nFut }, (_, i) => {
      const comp = addMeses(fim, i + 1);
      const p = ps.get(comp);
      return { comp, tipo: 'parcelas', total: p?.total ?? 0, qtd: p?.compras.size ?? 0, vencimento: null };
    }),
  ];
  const anos = [];
  colunas.forEach((c) => {
    const ano = c.comp.slice(0, 4);
    if (anos[anos.length - 1]?.ano === ano) anos[anos.length - 1].n += 1;
    else anos.push({ ano, n: 1 });
  });
  const comFatura = colunas.filter((c) => c.tipo === 'fatura' && c.total);
  const total = comFatura.reduce((s, c) => s + c.total, 0);
  const media = comFatura.length ? Math.round(total / comFatura.length) : null;
  const maior = comFatura.reduce((m, c) => (!m || c.total > m.total ? c : m), null);
  const futuras = colunas.filter((c) => c.tipo === 'parcelas');
  return {
    colunas,
    anos,
    resumo: {
      total, faturas: comFatura.length, compras: comFatura.reduce((s, c) => s + c.qtd, 0), media,
      maior: maior && { comp: maior.comp, total: maior.total },
      parcelas: futuras.length ? { total: futuras.reduce((s, c) => s + c.total, 0), ate: futuras[futuras.length - 1].comp } : null,
    },
    // A TABELA: as faturas do período, a mais nova em cima, com a diferença para a média.
    linhas: [...comFatura].reverse().map((c) => ({ ...c, difMedia: media == null ? null : c.total - media })),
  };
}

// Os anos com fatura (do mais novo ao mais velho) — a lista do ano × ano.
export function anosComFatura(faturas) {
  return [...new Set(faturas.map((f) => f.competencia.slice(0, 4)))].sort().reverse();
}

// ANO × ANO: os 12 meses de dois anos lado a lado (`b` é o mais novo; os meses dele depois da última fatura levam as
// parcelas que vêm, hachuradas). O resumo de cada ano, e a comparação NO MESMO PERÍODO (até o último mês com fatura
// de `b`, como nas outras telas): { meses: [{ mes, a, b, bFutura }], anos: { [ano]: resumo }, mesmoPeriodo }.
export function anoContraAno({ faturas, parcelas, a, b }) {
  const fs = porCompetencia(faturas);
  const ps = parcelasPorMes(parcelas);
  const ultima = [...fs.keys()].sort().pop() ?? '';
  const valor = (ano, m) => fs.get(`${ano}-${String(m).padStart(2, '0')}`)?.total ?? 0;
  const meses = Array.from({ length: 12 }, (_, i) => {
    const comp = `${b}-${String(i + 1).padStart(2, '0')}`;
    const futura = comp > ultima ? ps.get(comp)?.total ?? 0 : 0;
    return { mes: i + 1, a: valor(a, i + 1), b: valor(b, i + 1), bFutura: futura };
  });
  const resumo = (chave) => {
    const vs = meses.map((m) => ({ mes: m.mes, total: m[chave] })).filter((m) => m.total);
    const total = vs.reduce((s, m) => s + m.total, 0);
    const maior = vs.reduce((x, m) => (!x || m.total > x.total ? m : x), null);
    return { total, faturas: vs.length, media: vs.length ? Math.round(total / vs.length) : null, maior };
  };
  const ateMes = meses.reduce((x, m) => (m.b ? m.mes : x), 0);
  const somaAte = (chave) => meses.filter((m) => m.mes <= ateMes).reduce((s, m) => s + m[chave], 0);
  const antes = somaAte('a');
  const agora = somaAte('b');
  return {
    meses,
    anos: { [a]: resumo('a'), [b]: resumo('b') },
    mesmoPeriodo: ateMes ? { ateMes, a: antes, b: agora, variacao: antes ? (agora - antes) / antes : null } : null,
  };
}

// AS COMPRAS DE UMA LOJA (03/11/2026, a pedido: "o Claude não foi 10×"). Uma linha da fatura não é uma compra:
//   · as PARCELAS da mesma compra (mesmo valor e nº de parcelas, a mesma compra de origem — o mês da FATURA menos as
//     parcelas já pagas) contam UMA vez ("Dell 5×" era uma compra em 12x, parcelas 8 a 12 no período). É a
//     competência, não a data: o Nubank anda a data um mês por parcela, a XP repete a da compra em todas;
//   · o IOF da compra internacional vem numa linha à parte, do MESMO DIA, com 2,5–7% de outra (R$ 550,00 + R$ 19,25):
//     entra no valor da compra, não conta como outra.
// `linhas`: as da loja ({ id, data, competencia, valor_centavos, parcela_atual, parcela_total }). Devolve as compras, a mais nova em
// cima: [{ data, total, iof, parcelas: { de, ate, total } | null, linhas }].
const IOF_MIN = 0.025;
const IOF_MAX = 0.07;
export function comprasDaLoja(linhas) {
  const grupos = new Map();
  linhas.forEach((l) => {
    const v = Number(l.valor_centavos);
    const k = l.parcela_total
      ? `p|${l.parcela_total}|${v}|${addMeses(String(l.competencia ?? l.data).slice(0, 7), -((l.parcela_atual ?? 1) - 1))}`
      : `a|${l.id ?? Math.random()}`;
    const g = grupos.get(k) ?? { data: l.data, total: 0, iof: 0, parcelas: null, linhas: 0, _valor: v };
    g.total += v;
    g.linhas += 1;
    if (String(l.data) < String(g.data)) g.data = l.data;
    if (l.parcela_total) {
      const p = g.parcelas ?? { de: l.parcela_atual, ate: l.parcela_atual, total: l.parcela_total };
      g.parcelas = { de: Math.min(p.de, l.parcela_atual), ate: Math.max(p.ate, l.parcela_atual), total: l.parcela_total };
    }
    grupos.set(k, g);
  });
  // O IOF: a avulsa pequena vai para a maior do mesmo dia (cada compra recebe um IOF só).
  const avulsas = [...grupos.entries()].filter(([k]) => k.startsWith('a|')).map(([k, g]) => ({ k, g }))
    .sort((x, y) => y.g._valor - x.g._valor);
  const comIof = new Set();
  [...avulsas].reverse().forEach(({ k, g }) => {
    const dona = avulsas.find((x) => x.k !== k && !comIof.has(x.k) && x.g.data === g.data && grupos.has(x.k)
      && g._valor >= x.g._valor * IOF_MIN && g._valor <= x.g._valor * IOF_MAX);
    if (!dona || !grupos.has(k)) return;
    dona.g.total += g._valor;
    dona.g.iof += g._valor;
    dona.g.linhas += 1;
    comIof.add(dona.k);
    grupos.delete(k);
  });
  return [...grupos.values()].map(({ _valor, ...g }) => g).sort((x, y) => String(y.data).localeCompare(String(x.data)));
}

// POR CATEGORIA: de onde o cartão foi gasto no período e ONDE mais se comprou. `lancamentos`: [{ id, data,
// categoria_id, estabelecimento, descricao, valor_centavos, parcela_atual, parcela_total }]; `categorias`: as do
// cadastro (com `grupo`). Devolve { total, categorias: [{ id, nome, cor, total, qtd }], lojas: [{ chave, nome, vezes
// (COMPRAS, não linhas — `comprasDaLoja`), total, ticket, ultima, categoriaId, parcelada, iof, compras }] }.
const chaveLoja = (s) => String(s ?? '').trim().replace(/\s+/g, ' ').toLocaleUpperCase('pt-BR');
export function porCategoria(lancamentos, categorias, maxLojas = Infinity) {
  const catPorId = new Map(categorias.map((c) => [c.id, c]));
  const cats = new Map();
  const lojas = new Map();
  let total = 0;
  lancamentos.forEach((l) => {
    const v = Number(l.valor_centavos);
    total += v;
    const id = l.categoria_id ?? 'sem';
    const c = cats.get(id) ?? { id, nome: catPorId.get(l.categoria_id)?.nome ?? 'Sem categoria', cor: catPorId.get(l.categoria_id)?.grupo?.cor ?? null, total: 0, qtd: 0 };
    c.total += v; c.qtd += 1;
    cats.set(id, c);
    const nome = (l.estabelecimento || l.descricao || '').trim();
    if (!nome) return;
    const k = chaveLoja(nome);
    const x = lojas.get(k) ?? { chave: k, nome, linhas: [], porCat: new Map() };
    x.linhas.push(l);
    x.porCat.set(id, (x.porCat.get(id) ?? 0) + v);
    lojas.set(k, x);
  });
  const desc = (p, q) => q.total - p.total;
  const lista = [...lojas.values()].map(({ chave, nome, linhas, porCat }) => {
    const compras = comprasDaLoja(linhas);
    const soma = compras.reduce((s, c) => s + c.total, 0);
    const [categoriaId] = [...porCat.entries()].sort((a, b) => b[1] - a[1])[0];
    return {
      chave, nome, vezes: compras.length, total: soma, ticket: Math.round(soma / compras.length), ultima: compras[0]?.data ?? null,
      categoriaId: categoriaId === 'sem' ? null : categoriaId, parcelada: compras.some((c) => c.parcelas), iof: compras.reduce((s, c) => s + c.iof, 0), compras,
    };
  });
  return { total, categorias: [...cats.values()].sort(desc), lojas: lista.sort(desc).slice(0, maxLojas) };
}
