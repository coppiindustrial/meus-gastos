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
export const rotuloFormato = (f) => FORMATOS.find((x) => x.value === f)?.label ?? f;

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
      faturas: fs.length,
    };
  });
  return out;
}

// O CADASTRO EM POP-UP (como o dos fixos e o das categorias): só o que mudou em cada cartão.
const CAMPOS = ['nome', 'dia_vencimento', 'formato', 'ativo'];
export function diferencaCartao(l) {
  const campos = { nome: l.nome.trim(), dia_vencimento: Number(l.dia_vencimento), formato: l.formato, ativo: l.ativo };
  if (l.novo) return campos;
  return Object.fromEntries(CAMPOS.filter((k) => campos[k] !== l.orig[k]).map((k) => [k, campos[k]]));
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
