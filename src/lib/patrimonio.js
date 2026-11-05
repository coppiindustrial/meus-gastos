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

// ------------------------------------------------------------ o RENDIMENTO (05/11/2026, fase A do plano "Patrimônio e
// rentabilidade"; migration 013, `movimentos_investimento`)
//
// Entre duas fotos de uma conta, rendeu = saldo de agora − saldo de antes − (aportes − resgates) feitos DEPOIS da foto
// de antes e ATÉ a de agora. O mês M usa a última foto até o fim de M e a última até o fim de M − 1; sem foto nova no
// mês, não há rendimento a dizer (null), e a primeira foto da conta só abre a conta (o valor dela conta como aportado).
// O % do mês = rendeu ÷ (saldo de antes + metade do líquido aportado — o aporte do meio do mês rendeu só metade); o do
// ANO encadeia os meses (cada mês sobre o anterior). APORTADO acumulado = a primeira foto + os aportes − os resgates
// depois dela, até a foto do mês; o resto do patrimônio é o RENDIMENTO acumulado. Valores em centavos.
const liquido = (movs, contaId, de, ate) => {
  let aportes = 0;
  let resgates = 0;
  movs.forEach((m) => {
    if (m.conta_id !== contaId || m.data <= de || m.data > ate) return;
    if (m.tipo === 'resgate') resgates += Number(m.valor_centavos); else aportes += Number(m.valor_centavos);
  });
  return { aportes, resgates, liquido: aportes - resgates };
};

// Mês a mês, do mês da primeira foto até `ate`: [{ competencia, total, aportes, resgates, rendeu, base, pct,
// aportado, rendimentoAcum, porConta: { id: { saldo, data, antes, aportes, resgates, rendeu, base, pct } } }].
// `rendeu`/`pct` null quando nenhuma conta tem duas fotos para comparar naquele mês.
export function rendimentoPorMes(saldos, movimentos = [], ate) {
  if (!saldos.length) return [];
  const datas = saldos.map((s) => s.data).sort();
  const fim = ate ?? competenciaDe(datas[datas.length - 1]);
  const primeira = {};
  saldos.forEach((s) => { if (!primeira[s.conta_id] || s.data < primeira[s.conta_id].data) primeira[s.conta_id] = s; });
  const lista = [];
  for (let c = competenciaDe(datas[0]); c <= fim; c = addMeses(c, 1)) {
    const agora = ultimoSaldoAte(saldos, fimDoMes(c));
    const antes = ultimoSaldoAte(saldos, fimDoMes(addMeses(c, -1)));
    const porConta = {};
    let total = 0; let aportes = 0; let resgates = 0; let rendeu = null; let base = 0; let aportado = 0;
    Object.values(agora).forEach((s1) => {
      const id = s1.conta_id;
      const v1 = Number(s1.valor_centavos);
      total += v1;
      const p = primeira[id];
      const ap = Number(p.valor_centavos) + liquido(movimentos, id, p.data, s1.data).liquido;
      aportado += ap;
      const s0 = antes[id];
      const linha = { saldo: v1, data: s1.data, antes: s0 ? Number(s0.valor_centavos) : null, aportes: 0, resgates: 0, rendeu: null, base: null, pct: null };
      if (s0 && s1.data > s0.data) {
        const mv = liquido(movimentos, id, s0.data, s1.data);
        linha.aportes = mv.aportes; linha.resgates = mv.resgates;
        linha.rendeu = v1 - Number(s0.valor_centavos) - mv.liquido;
        linha.base = Number(s0.valor_centavos) + mv.liquido / 2;
        linha.pct = linha.base > 0 ? linha.rendeu / linha.base : null;
        aportes += mv.aportes; resgates += mv.resgates;
        rendeu = (rendeu ?? 0) + linha.rendeu;
        base += linha.base;
      }
      porConta[id] = linha;
    });
    lista.push({
      competencia: c, total, aportes, resgates, rendeu, base, pct: rendeu !== null && base > 0 ? rendeu / base : null,
      aportado, rendimentoAcum: total - aportado, porConta,
    });
  }
  return lista;
}

// O ANO (ou qualquer recorte de meses de `rendimentoPorMes`): o que rendeu somado, o % encadeado e o líquido aportado.
export function rendimentoDoPeriodo(meses) {
  let rendeu = 0; let fator = 1; let aportes = 0; let resgates = 0; let comDado = 0;
  meses.forEach((m) => {
    aportes += m.aportes; resgates += m.resgates;
    if (m.rendeu === null) return;
    rendeu += m.rendeu; comDado += 1;
    if (m.pct !== null) fator *= 1 + m.pct;
  });
  return { rendeu: comDado ? rendeu : null, pct: comDado ? fator - 1 : null, aportes, resgates, liquido: aportes - resgates, meses: comDado };
}

// Os movimentos de investimento de um extrato (as linhas que o plano deixou de fora como 'investimento'): a
// aplicação (débito, valor negativo) é APORTE; o resgate (crédito) é RESGATE. `contaId`: a conta que os recebe.
export function movimentosDoExtrato(plano, contaId) {
  return plano.filter((p) => p.acao === 'ignorar' && p.motivo === 'investimento' && p.linha.valor_centavos)
    .map(({ linha: l }) => ({
      conta_id: contaId, data: l.data, tipo: l.valor_centavos < 0 ? 'aporte' : 'resgate',
      valor_centavos: Math.abs(l.valor_centavos), descricao: l.descricao_original ?? l.nome ?? '', origem: 'extrato', id_externo: l.id_externo,
    }));
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
