import { lerData } from './planilha.js';
import { calcularValor } from './dinheiro.js';

// A CARTEIRA EDITÁVEL (06/11/2026, a opção A do mockup "Carteira editável": a planilha, como os Lançamentos). As contas
// puras (test/carteiraEditavel.test.js): que célula de que linha se edita e como, o andar da célula ativa (setas, Tab),
// o que se digitou e o que cada edição de um APORTE grava — o aporte pode ser um movimento feito pelo app, um aporte de
// antes do app (`depositos_investimento`) ou o que o cadastro tem aplicado sem data (`lo.fonte`, de estimarImposto).

// As colunas da carteira, na ordem da tela: o andar passa por todas (a calculada também se seleciona); só algumas editam.
export const COLUNAS_CARTEIRA = ['nome', 'resgate', 'aplicado', 'vale', 'liquido', 'rendeu', 'ano', 'curva'];

// Como a célula se edita: 'texto' (um nome), 'data', 'valor', 'vencimento' (a data do aporte que vence: vazia, a regra do
// investimento), 'rende' (o pop-up do nome, do tipo e da taxa), 'resgate' (o pop-up da liquidez e do prazo) e 'novoInv'
// (o pop-up do investimento novo) — ou null (calculada: só se lê).
// As linhas: 'grupo' (a instituição), 'inv', 'lote' (o aporte), 'novoAporte', 'novoInv' e 'novaInst' (as de acrescentar).
export function modoDaCelula(l, col) {
  if (!l) return null;
  switch (l.tipo) {
    case 'grupo': return col === 'nome' ? 'texto' : null;
    case 'inv': {
      if (col === 'nome') return 'rende';
      if (l.x.inv.ativo === false) return null; // o encerrado: só o nome (e o tipo, a taxa)
      if (col === 'resgate') return 'resgate';
      if (col === 'vale') return 'valor';
      return null;
    }
    case 'lote': {
      const f = l.lo.fonte;
      if (!f) return null;
      if (col === 'nome') return 'data';
      if (col === 'aplicado') return 'valor';
      if (col === 'resgate') return f.tipo === 'inicial' ? null : 'vencimento'; // o do cadastro não tem onde guardar
      return null;
    }
    case 'novoAporte': return col === 'nome' ? 'data' : col === 'aplicado' ? 'valor' : col === 'resgate' ? 'vencimento' : null;
    case 'novoInv': return col === 'nome' ? 'novoInv' : null;
    case 'novaInst': return col === 'nome' ? 'texto' : null;
    default: return null;
  }
}
// O que abre num pop-up (e não num campo dentro da célula).
export const ehPopup = (modo) => modo === 'rende' || modo === 'resgate' || modo === 'novoInv';

// O andar com as setas: `linhas` = as que estão à vista (com as de acrescentar), na ordem da tela; `ativa` = { id, col }.
// Sem célula ativa (ou com a linha dela sumida), começa na primeira.
export function moverAtiva(linhas, ativa, dl, dc, colunas = COLUNAS_CARTEIRA) {
  if (!linhas.length) return null;
  const r = ativa ? linhas.findIndex((l) => l.id === ativa.id) : -1;
  const c = ativa ? Math.max(0, colunas.indexOf(ativa.col)) : 0;
  if (r < 0) return { id: linhas[0].id, col: colunas[c] };
  const r2 = Math.max(0, Math.min(linhas.length - 1, r + dl));
  const c2 = Math.max(0, Math.min(colunas.length - 1, c + dc));
  return { id: linhas[r2].id, col: colunas[c2] };
}

// O Tab: a próxima célula QUE SE EDITA à direita, passando à linha de baixo (`dir` −1, o Shift+Tab: à esquerda e acima).
// Sem outra, fica onde está.
export function proximaEditavel(linhas, ativa, dir = 1, colunas = COLUNAS_CARTEIRA) {
  const n = colunas.length;
  const pos = (id, col) => linhas.findIndex((l) => l.id === id) * n + colunas.indexOf(col);
  const aqui = ativa ? pos(ativa.id, ativa.col) : -1;
  const todas = linhas.flatMap((l) => colunas.filter((c) => modoDaCelula(l, c)).map((c) => ({ id: l.id, col: c })));
  const achou = dir > 0 ? todas.find((t) => pos(t.id, t.col) > aqui) : [...todas].reverse().find((t) => pos(t.id, t.col) < aqui);
  return achou ?? ativa;
}

const br = (iso) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '');
export const campoValor = (c) => (c === null || c === undefined ? '' : (Number(c) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));

// O texto com que o campo abre (Enter ou duplo clique; digitar abre com a tecla). `rascunho`: o da linha "+ aporte".
export function textoDaCelula(l, col, rascunho = null) {
  if (!l) return '';
  if (l.tipo === 'grupo') return l.g.conta.nome;
  if (l.tipo === 'inv') return col === 'vale' && !l.x.semValor ? campoValor(l.x.vale) : '';
  if (l.tipo === 'lote') {
    const f = l.lo.fonte;
    if (col === 'nome') return br(f?.data ?? l.lo.data);
    if (col === 'resgate') return br(l.vence ?? ''); // o que aparece: o digitado, ou o da regra
    return f?.exato ? campoValor(f.valor) : campoValor(l.lo.depositado);
  }
  if (l.tipo === 'novoAporte') return col === 'nome' ? br(rascunho?.data) : col === 'resgate' ? br(rascunho?.venc ?? '') : (rascunho?.valor ?? '');
  return '';
}

// O que se digitou: { ok: true, valor } ou { ok: false, erro }. A data sem o ano é do ano de `hoje` e não passa de hoje;
// o valor aceita conta ("=4.800+200", como no Excel) e é em centavos.
export function lerCelula(modo, texto, hoje) {
  const t = String(texto ?? '').trim();
  if (modo === 'texto') return t ? { ok: true, valor: t } : { ok: false, erro: 'O nome não pode ficar vazio.' };
  if (modo === 'data') {
    const d = lerData(t, hoje.slice(0, 4));
    if (!d) return { ok: false, erro: 'Data inválida: digite dd/mm/aaaa.' };
    if (d > hoje) return { ok: false, erro: 'A data não pode ser depois de hoje.' };
    return { ok: true, valor: d };
  }
  // o vencimento: vazio volta à regra (null); sem o ano, o próximo dia com aquele dia e mês (vencimento é para a frente)
  if (modo === 'vencimento') {
    if (!t) return { ok: true, valor: null };
    let d = lerData(t, hoje.slice(0, 4));
    if (!d) return { ok: false, erro: 'Data inválida: digite dd/mm/aaaa.' };
    if (/^\d{1,2}[/.-]\d{1,2}$/.test(t) && d < hoje) d = `${Number(d.slice(0, 4)) + 1}${d.slice(4)}`;
    return { ok: true, valor: d };
  }
  if (modo === 'valor') {
    const v = t ? calcularValor(t) : null;
    if (v === null || !Number.isFinite(v)) return { ok: false, erro: 'Valor inválido.' };
    if (v < 0) return { ok: false, erro: 'O valor não pode ser negativo.' };
    return { ok: true, valor: Math.round(v) };
  }
  return { ok: false, erro: '' };
}

// O QUE A EDIÇÃO DE UM APORTE GRAVA, pela origem dele (`lo.fonte`):
//   · 'mov' (feito pelo app): o movimento — e o valor do mesmo dia e do mesmo valor (a foto que o "Cadastrar e aplicar"
//     gravou junto) vai junto, como no ✎ do histórico da ficha;
//   · 'dep' (de antes do app): a data — e a referência, quando o valor é o depositado —; o valor digitado é o
//     DEPOSITADO, então o aporte colado como "o que vale hoje" passa a ser "o que foi depositado" (a referência = a data);
//   · 'inicial' (o que o cadastro tem aplicado sem data): a data da aplicação, ou o valor aplicado (mais o que já tem data).
// Devolve { alvo: 'mov' | 'dep' | 'inv', id, mudancas, antes, gemea? } — `antes` desfaz.
export function planoDoAporte({ lo, inv, campo, valor, fotos = [] }) {
  const f = lo.fonte;
  // o vencimento (018): só a coluna dele, no aporte do app ou no de antes do app
  if (campo === 'vencimento') return { alvo: f.tipo, id: f.id, mudancas: { vencimento: valor }, antes: { vencimento: f.vencimento ?? null } };
  if (f.tipo === 'mov') {
    const mudancas = campo === 'data' ? { data: valor } : { valor_centavos: valor };
    const g = fotos.find((v) => !v.estimado && v.data === f.data && Number(v.valor_centavos) === f.valor) ?? null;
    const gemea = g && {
      id: g.id,
      antes: { data: g.data, valor_centavos: Number(g.valor_centavos) },
      mudancas: { data: campo === 'data' ? valor : g.data, valor_centavos: campo === 'valor' ? valor : Number(g.valor_centavos) },
    };
    return { alvo: 'mov', id: f.id, mudancas, antes: { data: f.data, valor_centavos: f.valor }, gemea };
  }
  if (f.tipo === 'dep') {
    const depositado = f.referencia === f.data;
    const mudancas = campo === 'data' ? (depositado ? { data: valor, referencia: valor } : { data: valor }) : { valor_centavos: valor, referencia: f.data };
    return { alvo: 'dep', id: f.id, mudancas, antes: { data: f.data, valor_centavos: f.valor, referencia: f.referencia } };
  }
  const mudancas = campo === 'data' ? { aplicado_em: valor } : { aplicado_inicial_centavos: valor + (f.base ?? 0) };
  return {
    alvo: 'inv', id: inv.id, mudancas,
    antes: campo === 'data' ? { aplicado_em: inv.aplicado_em ?? null } : { aplicado_inicial_centavos: inv.aplicado_inicial_centavos ?? null },
  };
}

// O APORTE NOVO (a linha "+ aporte"): o movimento; sem valor ainda, ele é também o primeiro valor (como o "Cadastrar e
// aplicar"); com valores registrados DEPOIS da data, eles podem passar a incluí-lo (`depois`: a tela pergunta). Antes do
// último aporte de antes do app (os digitados ou colados), não entra: ficaria fora da conta dos aportes (`erro`).
export function planoDoNovoAporte({ inv, data, valores = [], depositos = [] }) {
  const deps = depositos.filter((d) => d.investimento_id === inv.id);
  const corte = deps.reduce((m, d) => (d.referencia > m ? d.referencia : m), '');
  if (deps.length && data <= corte) {
    return { erro: `Até ${br(corte)} os aportes de ${inv.nome} são os de antes do app: um de ${br(data)} entra pela ficha, em "Informar os aportes".` };
  }
  const fotos = valores.filter((v) => v.investimento_id === inv.id && !v.estimado);
  return { foto: fotos.length === 0, depois: fotos.filter((f) => f.data > data).sort((a, b) => (a.data < b.data ? -1 : 1)) };
}
