// As contas da tela CARTÕES (opção A do mockup "Cartões · overhaul", 30/10/2026), puras e testadas: o que cada
// cartão conta no bloco dele — a última fatura, a próxima (e se já entrou), as parcelas que ainda vêm (da view
// `parcelas_futuras`), a média por fatura e as faturas dos últimos 12 meses.
import { addMeses, competenciaDe } from './format.js';
import { vencimentoNoMes } from './importacoes.js';

// Como a fatura do cartão entra no app.
export const FORMATOS = [
  { value: 'nubank', label: 'Importa o CSV do Nubank' },
  { value: 'xp', label: 'Importa o CSV da XP' },
  { value: 'manual', label: 'Lançamento manual' },
];
export const rotuloFormato = (f, modelo = null) => (f === 'modelo' ? `Importa pelo modelo ${modelo?.nome ?? '(excluído)'}` : FORMATOS.find((x) => x.value === f)?.label ?? f);

// OS MODELOS DO USUÁRIO no "Como a fatura entra" (migration 011): cada um vira a opção 'modelo:<id>', entre os prontos
// e o manual. `valorDoFormato`/`formatoDoValor` vão e voltam entre o cartão ({ formato, modelo_id }) e a opção.
// O "Ensinar um formato novo" (o que abre o `AssistenteModelo`) não é uma opção: é a AÇÃO no pé da lista
// (`ENSINAR_FORMATO`, o `acao` do `SelectSimples`), depois de uma linha — como o "+ Criar categoria" (03/11/2026).
export const ENSINAR_FORMATO = 'Ensinar um formato novo';
export function opcoesFormato(modelos = []) {
  const deFatura = (modelos ?? []).filter((m) => m.tipo === 'fatura' && !m.pronto);
  return [
    ...FORMATOS.filter((f) => f.value !== 'manual'),
    ...deFatura.map((m) => ({ value: `modelo:${m.id}`, label: `Importa pelo modelo ${m.nome}` })),
    FORMATOS.find((f) => f.value === 'manual'),
  ];
}
export const valorDoFormato = (c) => (c.formato === 'modelo' && c.modelo_id ? `modelo:${c.modelo_id}` : c.formato === 'modelo' ? 'manual' : c.formato);
export const formatoDoValor = (v) => (String(v).startsWith('modelo:') ? { formato: 'modelo', modelo_id: v.slice(7) } : { formato: v, modelo_id: null });

// LIGAR O CARTÃO AO MODELO (03/11/2026): a fatura que entra por um modelo SEU num cartão de "lançamento manual" deixa o
// cartão nesse modelo (o formato ensinado no próprio importador saía solto, e o "Importar arquivos" não achava o
// cartão). Cartão de formato pronto (Nubank, XP) ou já ligado a um modelo não muda. Devolve o id do modelo, ou null.
export const modeloParaLigar = (cartao, modelo) => (cartao && modelo?.id && !modelo.pronto && valorDoFormato(cartao) === 'manual' ? modelo.id : null);

const dia = (iso) => { const [y, m, d] = iso.slice(0, 10).split('-').map(Number); return Date.UTC(y, m - 1, d) / 86400000; };
export const diasAte = (de, ate) => Math.round(dia(ate) - dia(de));

// O próximo vencimento a partir de hoje (o de hoje conta).
export function proximoVencimento(diaVenc, hoje) {
  const comp = competenciaDe(hoje);
  const neste = vencimentoNoMes(comp, diaVenc);
  return neste >= hoje.slice(0, 10) ? neste : vencimentoNoMes(addMeses(comp, 1), diaVenc);
}

// `faturas`: [{ cartao_id, vencimento, competencia ('AAAA-MM'), total_centavos, qtd }]; `parcelas`: as linhas da view
// ({ cartao_id, competencia, valor_centavos, lancamento_id }). Devolve { [cartaoId]: resumo }.
export function resumoDosCartoes({ cartoes, faturas, parcelas, hoje }) {
  const compHoje = competenciaDe(hoje);
  const meses = Array.from({ length: 12 }, (_, i) => addMeses(compHoje, i - 11));
  const out = {};
  cartoes.forEach((c) => {
    const fs = faturas.filter((f) => f.cartao_id === c.id).sort((a, b) => b.vencimento.localeCompare(a.vencimento));
    const ultima = fs.find((f) => f.vencimento.slice(0, 10) <= hoje.slice(0, 10)) ?? fs[fs.length - 1] ?? null;
    const doAno = fs.filter((f) => meses.includes(f.competencia));
    const ps = parcelas.filter((p) => p.cartao_id === c.id);
    let proxima = null;
    if (c.ativo) {
      const venc = proximoVencimento(c.dia_vencimento, hoje);
      proxima = { vencimento: venc, dias: diasAte(hoje, venc), importada: fs.some((f) => f.vencimento.slice(0, 10) === venc) };
    }
    out[c.id] = {
      ultima: ultima && { vencimento: ultima.vencimento.slice(0, 10), competencia: ultima.competencia, total: Number(ultima.total_centavos ?? 0), qtd: ultima.qtd ?? 0 },
      proxima,
      parcelas: ps.length ? {
        total: ps.reduce((s, p) => s + Number(p.valor_centavos), 0),
        ate: ps.reduce((m, p) => (p.competencia > m ? p.competencia : m), ps[0].competencia),
        compras: new Set(ps.map((p) => p.lancamento_id)).size,
      } : null,
      media: doAno.length ? Math.round(doAno.reduce((s, f) => s + Number(f.total_centavos ?? 0), 0) / doAno.length) : null,
      serie: meses.map((comp) => {
        const doMes = fs.filter((f) => f.competencia === comp);
        return { comp, total: doMes.reduce((s, f) => s + Number(f.total_centavos ?? 0), 0), qtd: doMes.reduce((s, f) => s + (f.qtd ?? 0), 0), vencimento: doMes[0]?.vencimento.slice(0, 10) ?? null };
      }),
      grafico: graficoDoCartao(fs, ps, compHoje),
      faturas: fs.length,
    };
  });
  return out;
}

// O GRÁFICO DO BLOCO (03/11/2026, opção D do mockup "Cartões · gráfico das faturas"): as faturas e, depois da mais
// recente (a que a view `parcelas_futuras` usa), as PARCELAS JÁ COMPRADAS que vêm, mês a mês, até 6 meses. São 12
// colunas (com o número "13,4k" em cada uma, mais não cabe num bloco): as faturas são as 12 − futuras mais recentes;
// sem parcelas, as 12 de sempre, até hoje.
// Coluna: { comp, tipo: 'fatura' | 'parcelas', total, qtd (compras), vencimento }.
const mesesEntre = (a, b) => (Number(b.slice(0, 4)) - Number(a.slice(0, 4))) * 12 + Number(b.slice(5, 7)) - Number(a.slice(5, 7));
const MAX_FUTURAS = 6;
const COLUNAS_GRAFICO = 12;
function graficoDoCartao(fs, ps, compHoje) {
  const porMes = new Map();
  ps.forEach((p) => {
    const x = porMes.get(p.competencia) ?? { total: 0, compras: new Set() };
    x.total += Number(p.valor_centavos);
    x.compras.add(p.lancamento_id);
    porMes.set(p.competencia, x);
  });
  const fim = ps.length && fs.length ? fs[0].competencia : compHoje;
  const ultimaParcela = [...porMes.keys()].filter((k) => k > fim).sort().pop();
  const nFut = ultimaParcela ? Math.min(MAX_FUTURAS, mesesEntre(fim, ultimaParcela)) : 0;
  const nPass = COLUNAS_GRAFICO - nFut;
  const fatura = (comp) => {
    const doMes = fs.filter((f) => f.competencia === comp);
    return { comp, tipo: 'fatura', total: doMes.reduce((s, f) => s + Number(f.total_centavos ?? 0), 0), qtd: doMes.reduce((s, f) => s + (f.qtd ?? 0), 0), vencimento: doMes[0]?.vencimento.slice(0, 10) ?? null };
  };
  const parcelas = (comp) => ({ comp, tipo: 'parcelas', total: porMes.get(comp)?.total ?? 0, qtd: porMes.get(comp)?.compras.size ?? 0, vencimento: null });
  return [
    ...Array.from({ length: nPass }, (_, i) => fatura(addMeses(fim, i - (nPass - 1)))),
    ...Array.from({ length: nFut }, (_, i) => parcelas(addMeses(fim, i + 1))),
  ];
}

// O CADASTRO EM POP-UP (como o dos fixos e o das categorias): só o que mudou em cada cartão.
const CAMPOS = ['nome', 'dia_vencimento', 'formato', 'ativo', 'modelo_id'];
export function diferencaCartao(l) {
  const campos = { nome: l.nome.trim(), dia_vencimento: Number(l.dia_vencimento), formato: l.formato, ativo: l.ativo, modelo_id: l.formato === 'modelo' ? l.modelo_id ?? null : null };
  if (l.novo) return campos;
  // o modelo só conta no formato 'modelo' (num formato pronto, um `modelo_id` antigo no banco não importa)
  const conta = (k) => k !== 'modelo_id' || l.formato === 'modelo';
  return Object.fromEntries(CAMPOS.filter((k) => conta(k) && campos[k] !== (l.orig[k] ?? (k === 'modelo_id' ? null : undefined))).map((k) => [k, campos[k]]));
}

// O primeiro problema que impede salvar, ou null.
export function validarCartoes(linhas) {
  const ficam = linhas.filter((l) => !l.excluir && !(l.novo && !l.nome.trim()));
  for (const l of ficam) {
    if (!l.nome.trim()) return { id: l.id, campo: 'nome', motivo: 'um cartão está sem nome' };
    const d = Number(l.dia_vencimento);
    if (!(Number.isInteger(d) && d >= 1 && d <= 31)) return { id: l.id, campo: 'dia', motivo: `o vencimento de ${l.nome.trim()} precisa ser um dia de 1 a 31` };
    if (ficam.some((x) => x !== l && x.nome.trim().toLowerCase() === l.nome.trim().toLowerCase())) return { id: l.id, campo: 'nome', motivo: `o cartão "${l.nome.trim()}" aparece duas vezes` };
  }
  return null;
}
