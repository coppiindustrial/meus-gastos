import { addMeses, competenciaDe } from './format.js';

// PATRIMÔNIO: cada conta tem "fotos" do saldo em datas (tabela `saldos`). O patrimônio num mês é a soma,
// conta a conta, da foto MAIS RECENTE até o fim daquele mês — o saldo vale até a próxima foto. Conta
// sem nenhuma foto até o mês não entra. Funções puras (test/patrimonio.test.js); valores em centavos.

// A foto mais recente de cada conta até a data (inclusive): { conta_id: saldo }.
export function ultimoSaldoAte(saldos, ate = '9999-12-31') {
  const m = {};
  saldos.filter((s) => s.data <= ate).forEach((s) => {
    const atual = m[s.conta_id];
    if (!atual || s.data > atual.data) m[s.conta_id] = s;
  });
  return m;
}

const fimDoMes = (comp) => {
  const [y, mes] = comp.split('-').map(Number);
  return `${comp}-${String(new Date(Date.UTC(y, mes, 0)).getUTCDate()).padStart(2, '0')}`;
};

// Total de uma lista de fotos (uma por conta), separado por tipo de conta.
export function somar(fotos, contas) {
  const tipo = new Map(contas.map((c) => [c.id, c.tipo]));
  const porTipo = {};
  let total = 0;
  Object.values(fotos).forEach((s) => {
    const v = Number(s.valor_centavos);
    total += v;
    const t = tipo.get(s.conta_id) ?? 'outro';
    porTipo[t] = (porTipo[t] ?? 0) + v;
  });
  return { total, porTipo };
}

// Patrimônio mês a mês, do mês da primeira foto até `ate` (padrão: o mês da última foto).
// [{ competencia, total, porTipo, contas }] — `contas` = quantas contas entraram na soma.
export function evolucao(saldos, contas, ate) {
  if (!saldos.length) return [];
  const datas = saldos.map((s) => s.data).sort();
  const fim = ate ?? competenciaDe(datas[datas.length - 1]);
  const lista = [];
  for (let c = competenciaDe(datas[0]); c <= fim; c = addMeses(c, 1)) {
    const fotos = ultimoSaldoAte(saldos, fimDoMes(c));
    lista.push({ competencia: c, ...somar(fotos, contas), contas: Object.keys(fotos).length });
  }
  return lista;
}
