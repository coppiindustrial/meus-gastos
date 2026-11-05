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
// rentabilidade"; migration 013, `movimentos_investimento`) — e, desde a fase B (migration 014), POR INVESTIMENTO
//
// Tudo é uma SÉRIE: as fotos de um valor no tempo e os aportes e resgates dela. A série é a CONTA (as fotos de
// `saldos`) ou o INVESTIMENTO (as de `valores_investimento`). Entre duas fotos, rendeu = foto de agora − foto de antes
// − (aportes − resgates) feitos DEPOIS da de antes e ATÉ a de agora. O mês M usa a última foto até o fim de M e a
// última até o fim de M − 1 (no mês em que a série abre, a primeira foto); sem foto nova no mês, não há rendimento a
// dizer (null), e a primeira foto só ABRE a série (o valor dela conta como aportado — ou o `aplicadoInicial`, o
// "aplicado até hoje" do cadastro do título).
// O % do mês = rendeu ÷ (foto de antes + metade do líquido aportado — o aporte do meio do mês rendeu só metade); o do
// ANO encadeia os meses. APORTADO acumulado = o início + os aportes − os resgates depois da primeira foto; o resto do
// patrimônio é o RENDIMENTO acumulado. Valores em centavos.
// O APORTE DEPOIS DA ÚLTIMA FOTO (o do dia 10, antes de registrar o mês) já entra no valor e no aportado: o valor do
// mês é a foto + o líquido aportado depois dela. O rendimento não muda — ele só compara fotos.
// A CONTA QUE GANHOU INVESTIMENTOS (`fim`): as fotos dela valem até a primeira foto de um título dela; dali em diante
// a conta é a soma dos títulos. No mês da troca ela ainda dá o rendimento entre as fotos dela, mas não entra no total.
const liquido = (movs, de, ate) => {
  let aportes = 0;
  let resgates = 0;
  movs.forEach((m) => {
    if (m.data <= de || m.data > ate) return;
    if (m.tipo === 'resgate') resgates += Number(m.valor_centavos); else aportes += Number(m.valor_centavos);
  });
  return { aportes, resgates, liquido: aportes - resgates };
};
const ultimaAte = (fotos, ate) => {
  let r = null;
  for (const f of fotos) { if (f.data > ate) break; r = f; }
  return r;
};
const porData = (a, b) => (a.data < b.data ? -1 : a.data > b.data ? 1 : 0);

// `series`: [{ id, conta_id, fotos: [{ data, valor_centavos }], movimentos: [{ data, tipo, valor_centavos }], fim?,
// aplicadoInicial? }]. Mês a mês, do mês da primeira foto até `ate`: [{ competencia, total, aportes, resgates, rendeu,
// base, pct, aportado, rendimentoAcum, porConta: { conta_id: {…} }, porSerie: { id: { saldo, foto, data, antes,
// aportes, resgates, rendeu, base, pct, aportado, presente } } }]. `rendeu`/`pct` null quando nada tem duas fotos.
export function rendimentoDasSeries(series, ate) {
  const comFoto = series.filter((s) => s.fotos.length).map((s) => ({ ...s, fotos: [...s.fotos].sort(porData) }));
  if (!comFoto.length) return [];
  const inicio = comFoto.map((s) => s.fotos[0].data).sort()[0];
  const fim = ate ?? competenciaDe(comFoto.map((s) => s.fotos[s.fotos.length - 1].data).sort().pop());
  const lista = [];
  for (let c = competenciaDe(inicio); c <= fim; c = addMeses(c, 1)) {
    const fimMes = fimDoMes(c);
    const fimAntes = fimDoMes(addMeses(c, -1));
    const porSerie = {};
    const porConta = {};
    let total = 0; let aportes = 0; let resgates = 0; let rendeu = null; let base = 0; let aportado = 0;
    comFoto.forEach((s) => {
      if (s.fim && s.fim <= fimAntes) return; // a conta já virou a soma dos investimentos
      const lim = s.fim && s.fim < fimMes ? s.fim : fimMes;
      const s1 = ultimaAte(s.fotos, lim);
      if (!s1) return;
      const presente = !s.fim || fimMes < s.fim;
      const p = s.fotos[0];
      const v1 = Number(s1.valor_centavos);
      const valor = v1 + liquido(s.movimentos, s1.data, lim).liquido;
      const ap = (s.aplicadoInicial ?? Number(p.valor_centavos)) + liquido(s.movimentos, p.data, lim).liquido;
      // a foto de antes: a última até o fim do mês passado — no MÊS EM QUE A SÉRIE ABRE, a primeira (o título cadastrado
      // no dia 5 e registrado de novo no dia 30 rendeu nesses dias)
      const s0 = ultimaAte(s.fotos, fimAntes) ?? (p !== s1 ? p : null);
      const linha = {
        saldo: valor, foto: v1, data: s1.data, antes: s0 ? Number(s0.valor_centavos) : null,
        aportes: 0, resgates: 0, rendeu: null, base: null, pct: null, aportado: ap, presente,
      };
      if (s0 && s1.data > s0.data) {
        const mv = liquido(s.movimentos, s0.data, s1.data);
        linha.aportes = mv.aportes; linha.resgates = mv.resgates;
        linha.rendeu = v1 - Number(s0.valor_centavos) - mv.liquido;
        linha.base = Number(s0.valor_centavos) + mv.liquido / 2;
        linha.pct = linha.base > 0 ? linha.rendeu / linha.base : null;
        aportes += mv.aportes; resgates += mv.resgates;
        rendeu = (rendeu ?? 0) + linha.rendeu;
        base += linha.base;
      }
      porSerie[s.id] = linha;
      const pc = porConta[s.conta_id] ?? (porConta[s.conta_id] = { saldo: 0, aportado: 0, data: null, aportes: 0, resgates: 0, rendeu: null, base: 0, pct: null });
      if (presente) {
        total += valor; aportado += ap;
        pc.saldo += valor; pc.aportado += ap;
        if (!pc.data || s1.data > pc.data) pc.data = s1.data;
      }
      if (linha.rendeu !== null) {
        pc.rendeu = (pc.rendeu ?? 0) + linha.rendeu; pc.base += linha.base;
        pc.aportes += linha.aportes; pc.resgates += linha.resgates;
      }
    });
    Object.values(porConta).forEach((pc) => { pc.pct = pc.rendeu !== null && pc.base > 0 ? pc.rendeu / pc.base : null; });
    lista.push({
      competencia: c, total, aportes, resgates, rendeu, base, pct: rendeu !== null && base > 0 ? rendeu / base : null,
      aportado, rendimentoAcum: total - aportado, porConta, porSerie,
    });
  }
  return lista;
}

// As séries do Patrimônio: uma por CONTA com fotos (até a primeira foto de um título dela, se houver) e uma por
// INVESTIMENTO. O movimento de um título conta na conta dele (o do título, não o `conta_id` gravado) — e, na série da
// conta, só os de até a troca (o aporte de antes do cadastro, que a foto da conta já tinha).
export function seriesDoPatrimonio({ saldos = [], movimentos = [], investimentos = [], valores = [] }) {
  const invs = new Map(investimentos.map((i) => [i.id, i]));
  const fotosInv = new Map();
  valores.forEach((v) => {
    if (!invs.has(v.investimento_id)) return;
    if (!fotosInv.has(v.investimento_id)) fotosInv.set(v.investimento_id, []);
    fotosInv.get(v.investimento_id).push(v);
  });
  const troca = {};
  fotosInv.forEach((fs, id) => {
    const conta = invs.get(id).conta_id;
    const d = fs.reduce((m, f) => (f.data < m ? f.data : m), fs[0].data);
    if (!troca[conta] || d < troca[conta]) troca[conta] = d;
  });
  const contaDe = (m) => (m.investimento_id && invs.has(m.investimento_id) ? invs.get(m.investimento_id).conta_id : m.conta_id);
  const contas = [...new Set(saldos.map((s) => s.conta_id))];
  const series = contas.map((id) => {
    const fim = troca[id];
    return {
      id: `c:${id}`, conta_id: id, fim,
      fotos: saldos.filter((s) => s.conta_id === id && (!fim || s.data <= fim)),
      movimentos: movimentos.filter((m) => contaDe(m) === id && (!fim || m.data <= fim)),
    };
  });
  fotosInv.forEach((fs, id) => {
    const inv = invs.get(id);
    series.push({
      id: `i:${id}`, conta_id: inv.conta_id, fotos: fs,
      movimentos: movimentos.filter((m) => m.investimento_id === id),
      aplicadoInicial: inv.aplicado_inicial_centavos === null || inv.aplicado_inicial_centavos === undefined ? undefined : Number(inv.aplicado_inicial_centavos),
    });
  });
  return series;
}

// Só as contas (o modelo da fase A, antes dos investimentos): as fotos de `saldos` e os movimentos de cada conta.
export function rendimentoPorMes(saldos, movimentos = [], ate) {
  return rendimentoDasSeries(seriesDoPatrimonio({ saldos, movimentos }), ate);
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
