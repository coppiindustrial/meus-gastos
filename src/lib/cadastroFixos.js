import { acharCategoria } from './planilha.js';
import { parseValor, valorParaCampo } from './dinheiro.js';
import { competenciaCurta } from './format.js';

// O CADASTRO DOS GASTOS FIXOS EM LISTA (a vista "Cadastro" da tela): uma linha por recorrência e uma
// coluna por campo do modal. Aqui ficam as contas puras (testadas em test/cadastroFixos.test.js): o que
// cada coluna mostra, o texto que vai para o Excel e o que um texto digitado ou colado vira.

// `campo`: a coluna da tabela `recorrencias`. "Último lançado" é só leitura (vem dos lançamentos).
export const COLUNAS_FIXO = [
  { id: 'ativa', rotulo: 'Ativo', campo: 'ativa' },
  { id: 'descricao', rotulo: 'Descrição', campo: 'descricao' },
  { id: 'categoria', rotulo: 'Categoria', campo: 'categoria_id' },
  { id: 'dia', rotulo: 'Dia', campo: 'dia_do_mes', direita: true },
  { id: 'valor', rotulo: 'Valor padrão', campo: 'valor_padrao_centavos', direita: true },
  { id: 'ultimo', rotulo: 'Último lançado', direita: true },
  { id: 'inicio', rotulo: 'Começa', campo: 'inicio' },
  { id: 'fim', rotulo: 'Termina', campo: 'fim' },
];
export const editavel = (c) => !!COLUNAS_FIXO[c]?.campo;

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const p2 = (n) => String(n).padStart(2, '0');
const norm = (s) => String(s ?? '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();
const ano4 = (a) => (String(a).length === 2 ? 2000 + Number(a) : Number(a));
const mesValido = (y, m) => (m >= 1 && m <= 12 && y >= 1990 && y <= 2100 ? `${y}-${p2(m)}` : null);

// Um MÊS digitado ou colado → 'AAAA-MM' (ou null): "10/2026", "10/26", "2026-10", "01/10/2026",
// "out/26", "outubro de 2026".
export function lerMes(texto) {
  const t = norm(texto);
  let m;
  if ((m = t.match(/^(\d{1,2})[/.-](\d{2}|\d{4})$/))) return mesValido(ano4(m[2]), Number(m[1]));
  if ((m = t.match(/^(\d{4})-(\d{1,2})(?:-\d{1,2})?$/))) return mesValido(Number(m[1]), Number(m[2]));
  if ((m = t.match(/^\d{1,2}[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/))) return mesValido(ano4(m[2]), Number(m[1]));
  if ((m = t.match(/^([a-z]{3})[a-z]*\.?(?:\s*de\s*|[\s/.-]*)(\d{2}|\d{4})$/))) {
    const i = MESES.indexOf(m[1]);
    return i >= 0 ? mesValido(ano4(m[2]), i + 1) : null;
  }
  return null;
}

// O texto da célula — o que se copia para o Excel e o que o campo mostra ao começar a editar.
// `ultimos`: { recorrencia_id: { valor_centavos, competencia } }.
export function textoFixo(rec, c, { categorias = [], ultimos = {} } = {}) {
  switch (COLUNAS_FIXO[c]?.id) {
    case 'ativa': return rec.ativa ? 'sim' : 'não';
    case 'descricao': return rec.descricao ?? '';
    case 'categoria': return (rec.categoria ?? categorias.find((x) => x.id === rec.categoria_id))?.nome ?? '';
    case 'dia': return String(rec.dia_do_mes ?? '');
    case 'valor': return valorParaCampo(rec.valor_padrao_centavos);
    case 'ultimo': return ultimos[rec.id] ? valorParaCampo(ultimos[rec.id].valor_centavos) : '';
    case 'inicio': return rec.inicio ? `${rec.inicio.slice(5, 7)}/${rec.inicio.slice(0, 4)}` : '';
    case 'fim': return rec.fim ? `${rec.fim.slice(5, 7)}/${rec.fim.slice(0, 4)}` : '';
    default: return '';
  }
}

// O mês curto da vigência, para a célula: "out/26" (ou "sem fim").
export const mesCurto = (data) => (data ? competenciaCurta(String(data).slice(0, 7)) : 'sem fim');

// O que um texto vira na coluna `c` da linha `rec`: { campo, valor } ou { motivo }. Na linha NOVA
// (`rec` null) só a descrição cria.
export function interpretarFixo(c, texto, { rec = null, categorias = [] } = {}) {
  const col = COLUNAS_FIXO[c];
  if (!col?.campo) return { motivo: `${col?.rotulo ?? 'Esta coluna'} não se edita aqui` };
  const t = String(texto ?? '').trim();
  switch (col.id) {
    case 'ativa': {
      const n = norm(t);
      if (/^(s|sim|1|x|v|ativo|true|verdadeiro)$/.test(n)) return { campo: 'ativa', valor: true };
      if (/^(n|nao|0|inativo|false|falso|)$/.test(n)) return { campo: 'ativa', valor: false };
      return { motivo: `"${t}" não é sim nem não` };
    }
    case 'descricao':
      return t ? { campo: 'descricao', valor: t } : { motivo: 'a descrição não pode ficar vazia' };
    case 'categoria': {
      if (!t) return { campo: 'categoria_id', valor: null };
      const cat = acharCategoria(t, categorias, 'saida');
      return cat ? { campo: 'categoria_id', valor: cat.id } : { motivo: `não há categoria de gasto "${t}"` };
    }
    case 'dia': {
      const d = Number(t);
      return Number.isInteger(d) && d >= 1 && d <= 31 ? { campo: 'dia_do_mes', valor: d } : { motivo: 'o dia vai de 1 a 31' };
    }
    case 'valor': {
      const v = parseValor(t);
      return v !== null && v >= 0 ? { campo: 'valor_padrao_centavos', valor: v } : { motivo: `"${t}" não é um valor` };
    }
    case 'inicio': {
      const m = lerMes(t);
      if (!m) return { motivo: `"${t}" não é um mês (use 10/2026)` };
      if (rec?.fim && `${m}-01` > rec.fim) return { motivo: 'o início ficaria depois do fim' };
      return { campo: 'inicio', valor: `${m}-01` };
    }
    case 'fim': {
      if (!t) return { campo: 'fim', valor: null };
      const m = lerMes(t);
      if (!m) return { motivo: `"${t}" não é um mês (use 10/2026)` };
      if (rec?.inicio && `${m}-01` < rec.inicio) return { motivo: 'o fim ficaria antes do início' };
      return { campo: 'fim', valor: `${m}-01` };
    }
    default: return { motivo: 'coluna desconhecida' };
  }
}

// "Usar o último lançado como padrão": as recorrências da lista cujo último valor lançado difere do padrão.
export function padroesDoUltimo(recs, ultimos) {
  return recs
    .filter((r) => ultimos[r.id] && ultimos[r.id].valor_centavos !== Number(r.valor_padrao_centavos))
    .map((r) => ({ id: r.id, antes: Number(r.valor_padrao_centavos), depois: ultimos[r.id].valor_centavos }));
}
