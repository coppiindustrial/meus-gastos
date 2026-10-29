import { addMeses, competenciaDe } from './format.js';

// A TELA IMPORTAR (28/10/2026): o que entrou em cada mês, de cada FONTE — uma coluna por cartão (a fatura do
// mês) e uma do extrato da conta. Funções puras, testadas em test/importacoes.test.js. Datas 'AAAA-MM-DD',
// competência 'AAAA-MM'; nada passa por `new Date('AAAA-MM-DD')` (as contas de dia são em UTC, por número).
//
// Uma fonte DEVE o mês quando ele já pode ser importado: a fatura, a partir do vencimento (competência =
// mês do vencimento); o extrato, quando o mês acabou. Antes disso a célula é "futuro" (fatura) ou "em
// andamento" (extrato) e não conta como pendência. Antes da primeira importação da fonte, "—" (ela ainda não
// existia aqui), e o mesmo para o cartão inativo depois da última fatura dele.

const p2 = (n) => String(n).padStart(2, '0');
const diaN = (iso) => { const [y, m, d] = iso.split('-').map(Number); return Date.UTC(y, m - 1, d) / 864e5; };
const isoDe = (n) => { const d = new Date(n * 864e5); return `${d.getUTCFullYear()}-${p2(d.getUTCMonth() + 1)}-${p2(d.getUTCDate())}`; };
const ultimoDia = (comp) => { const [y, m] = comp.split('-').map(Number); return new Date(Date.UTC(y, m, 0)).getUTCDate(); };

// O vencimento da fatura de um cartão naquele mês (dia 31 num mês de 30 cai no último dia).
export const vencimentoNoMes = (comp, dia) => `${comp}-${p2(Math.min(dia, ultimoDia(comp)))}`;

// OS PERÍODOS DO EXTRATO, juntos: os intervalos [de, até] das importações, unidos quando se tocam ou ficam
// a até `folga` dias um do outro (o CSV vai da primeira à última MOVIMENTAÇÃO, e um fim de semana sem
// movimento não é buraco).
const FOLGA = 3;
export function unirPeriodos(periodos) {
  const ps = periodos.filter((p) => p.periodo_de && p.periodo_ate)
    .map((p) => ({ de: diaN(p.periodo_de.slice(0, 10)), ate: diaN(p.periodo_ate.slice(0, 10)) }))
    .sort((a, b) => a.de - b.de);
  const out = [];
  ps.forEach((p) => {
    const u = out[out.length - 1];
    if (u && p.de <= u.ate + FOLGA + 1) u.ate = Math.max(u.ate, p.ate);
    else out.push({ ...p });
  });
  return out;
}

// A célula do extrato num mês. `unidos`: os períodos de `unirPeriodos`; `importacoes`: as do extrato (para a
// data em que o mês entrou); `primeiro`: o primeiro mês com extrato.
function celulaExtrato(comp, hoje, unidos, importacoes, primeiro) {
  const ini = diaN(`${comp}-01`);
  const fim = diaN(`${comp}-${p2(ultimoDia(comp))}`);
  const mesHoje = competenciaDe(hoje);
  if (comp > mesHoje) return { estado: 'futuro' };
  const toca = unidos.filter((u) => u.de <= fim && u.ate >= ini);
  if (!toca.length) {
    if (!primeiro || comp < primeiro) return { estado: 'na' };
    return comp === mesHoje ? { estado: 'andamento' } : { estado: 'falta', pendente: true };
  }
  // A data em que o mês entrou: a importação mais recente que tem algum dia dele.
  const quando = importacoes
    .filter((i) => i.periodo_de && i.periodo_ate && diaN(i.periodo_de.slice(0, 10)) <= fim && diaN(i.periodo_ate.slice(0, 10)) >= ini)
    .map((i) => i.criado_em).sort().pop() ?? null;
  const cobre = toca.find((u) => u.de <= ini + FOLGA && u.ate >= fim - FOLGA);
  if (cobre && comp !== mesHoje) return { estado: 'ok', data: quando, inteiro: true };
  const ate = isoDe(Math.min(fim, Math.max(...toca.map((u) => u.ate))));
  if (comp === mesHoje) return { estado: 'parcial', ate, data: quando, faltamDias: Math.max(0, diaN(hoje) - diaN(ate)) };
  return { estado: 'parcial', ate, data: quando, pendente: true };
}

// A célula da fatura de um cartão num mês. `fats`: as faturas DESTE cartão (competência 'AAAA-MM').
function celulaFatura(comp, hoje, cartao, fats) {
  const f = fats.find((x) => x.competencia === comp);
  if (f) {
    return {
      estado: 'ok', data: f.importado_de === 'planilha' ? null : (f.importada_em ?? null), planilha: f.importado_de === 'planilha',
      qtd: f.qtd ?? 0, total: f.total_centavos ?? 0, faturaId: f.id, vencimento: f.vencimento,
    };
  }
  const comps = fats.map((x) => x.competencia).sort();
  if (!comps.length || comp < comps[0]) return { estado: 'na' };
  if (!cartao.ativo && comp > comps[comps.length - 1]) return { estado: 'na' };
  const vence = vencimentoNoMes(comp, cartao.dia_vencimento);
  return vence <= hoje ? { estado: 'falta', vence, pendente: true } : { estado: 'futuro', vence };
}

// A TABELA DO ANO: as colunas (um cartão por coluna, na ordem do nome, + o extrato) e uma linha por mês, do
// mais recente ao mais antigo. `extratos` null = a tabela `importacoes` ainda não existe (migration 007):
// a coluna do extrato some. Cada linha diz quantas fontes estão pendentes (`faltam`).
export function mesesDoAno({ ano, hoje, cartoes, faturas, extratos }) {
  const porCartao = new Map(cartoes.map((c) => [c.id, faturas.filter((f) => f.cartao_id === c.id)]));
  const doAno = (c) => porCartao.get(c.id).some((f) => f.competencia.startsWith(`${ano}-`));
  const colunas = [...cartoes]
    .filter((c) => (c.ativo && porCartao.get(c.id).length) || doAno(c))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
    .map((c) => ({ key: c.id, tipo: 'fatura', cartao: c }));
  if (extratos) colunas.push({ key: 'extrato', tipo: 'extrato' });
  const unidos = extratos ? unirPeriodos(extratos) : [];
  const primeiro = unidos.length ? competenciaDe(isoDe(unidos[0].de)) : null;
  const linhas = Array.from({ length: 12 }, (_, i) => `${ano}-${p2(12 - i)}`).map((comp) => {
    const celulas = Object.fromEntries(colunas.map((col) => [col.key, col.tipo === 'fatura'
      ? celulaFatura(comp, hoje, col.cartao, porCartao.get(col.key))
      : celulaExtrato(comp, hoje, unidos, extratos, primeiro)]));
    const faltam = Object.values(celulas).filter((c) => c.pendente).length;
    return { comp, atual: comp === competenciaDe(hoje), futuro: comp > competenciaDe(hoje), celulas, faltam };
  });
  return { colunas, linhas, faltam: linhas.reduce((s, l) => s + l.faltam, 0) };
}

// O número do menu: as pendências do ano corrente e do mês anterior a ele (em janeiro, a fatura de
// dezembro ainda pode estar faltando).
export function pendenciasAgora({ hoje, cartoes, faturas, extratos }) {
  const ano = Number(hoje.slice(0, 4));
  const esteAno = mesesDoAno({ ano, hoje, cartoes, faturas, extratos }).faltam;
  const antes = addMeses(competenciaDe(hoje), -1);
  if (!antes.startsWith(`${ano - 1}-`)) return esteAno;
  const linha = mesesDoAno({ ano: ano - 1, hoje, cartoes, faturas, extratos }).linhas.find((l) => l.comp === antes);
  return esteAno + (linha?.faltam ?? 0);
}

// O período de um extrato lido (da primeira à última movimentação do arquivo).
export function periodoDasLinhas(linhas) {
  const ds = linhas.map((l) => l.data).sort();
  return ds.length ? { de: ds[0], ate: ds[ds.length - 1] } : { de: null, ate: null };
}

// O QUE ENTROU DA PLANILHA (o pop-up do histórico da planilha, 29/10/2026): os lançamentos que ela trouxe
// (`importado_de = 'planilha'`), somados por origem e por mês, e a CONFERÊNCIA do banco no formato que o
// `planilha.json` traz (por fatura, pelo nome do arquivo, e os três grupos sem fatura). `faturas`: as faturas
// dela, com o cartão — para "Nubank 8 · XP 4".
export function resumirPlanilha(linhas, faturas = []) {
  const vazio = () => ({ qtd: 0, total: 0 });
  const porOrigem = { cartao: vazio(), fixo: vazio(), manual: vazio(), entrada: vazio() };
  const meses = new Map();
  const conf = { porFatura: {}, fixos: { linhas: 0, total: 0 }, manuais: { linhas: 0, total: 0 }, entradas: { linhas: 0, total: 0 } };
  linhas.forEach((l) => {
    const v = Number(l.valor_centavos) || 0;
    const origem = l.tipo === 'entrada' ? 'entrada' : (porOrigem[l.origem] ? l.origem : 'manual');
    porOrigem[origem].qtd += 1;
    porOrigem[origem].total += v;
    const comp = String(l.competencia).slice(0, 7);
    const m = meses.get(comp) ?? { comp, cartao: 0, fixo: 0, manual: 0, entrada: 0, qtd: 0 };
    m[origem] += v;
    m.qtd += 1;
    meses.set(comp, m);
    const alvo = l.origem === 'cartao' ? (conf.porFatura[l.fatura?.arquivo] ||= { linhas: 0, total: 0 })
      : l.origem === 'fixo' ? conf.fixos : l.origem === 'manual' ? conf.manuais : conf.entradas;
    alvo.linhas += 1;
    alvo.total += v;
  });
  const porMes = [...meses.values()].sort((a, b) => a.comp.localeCompare(b.comp));
  const cartoes = {};
  faturas.forEach((f) => { const n = f.cartao?.nome ?? 'Cartão'; cartoes[n] = (cartoes[n] ?? 0) + 1; });
  return {
    qtd: linhas.length,
    porOrigem,
    porMes,
    de: porMes[0]?.comp ?? null,
    ate: porMes[porMes.length - 1]?.comp ?? null,
    gastos: porOrigem.cartao.total + porOrigem.fixo.total + porOrigem.manual.total,
    entradas: porOrigem.entrada.total,
    faturas: faturas.length,
    cartoes,
    conferencia: conf,
  };
}
