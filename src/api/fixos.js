import { buscarTudo, exigir, supabase } from './supabase.js';
import { competenciaParaBanco } from '../lib/format.js';
import { dataNoMes } from '../lib/fixos.js';

// Gastos fixos (tabela `recorrencias`) e os lançamentos que elas geram (origem 'fixo', com `recorrencia_id`).
const mes = (linhas) => linhas.map((l) => ({ ...l, competencia: l.competencia.slice(0, 7) }));

export function listarRecorrencias() {
  return exigir(supabase.from('recorrencias')
    .select('*, categoria:categorias(id, nome, grupo:grupos(nome, cor))')
    .order('ativa', { ascending: false }).order('dia_do_mes').order('descricao'));
}

export function salvarRecorrencia(r) {
  const dados = {
    descricao: r.descricao.trim(),
    categoria_id: r.categoria_id || null,
    valor_padrao_centavos: r.valor_padrao_centavos,
    dia_do_mes: Number(r.dia_do_mes),
    inicio: r.inicio,
    fim: r.fim || null,
    ativa: r.ativa,
  };
  return exigir(r.id
    ? supabase.from('recorrencias').update(dados).eq('id', r.id).select().single()
    : supabase.from('recorrencias').insert(dados).select().single());
}

// Excluir a recorrência mantém os lançamentos que ela gerou (a FK é `on delete set null`).
export function excluirRecorrencia(id) {
  return exigir(supabase.from('recorrencias').delete().eq('id', id));
}

// Todos os lançamentos ligados a alguma recorrência (para a situação do mês e o último valor de cada uma).
export async function listarLancamentosDeFixos() {
  return mes(await buscarTudo(() => supabase.from('lancamentos')
    .select('id, recorrencia_id, competencia, data, valor_centavos')
    .not('recorrencia_id', 'is', null)
    .order('competencia').order('id')));
}

// Lança o fixo do mês. O índice único da migration 004 recusa o segundo lançamento da mesma
// recorrência no mesmo mês (clique duplo, duas abas).
export function lancarFixo(rec, comp, valorCentavos) {
  return exigir(supabase.from('lancamentos').insert({
    tipo: 'saida',
    origem: 'fixo',
    data: dataNoMes(comp, rec.dia_do_mes),
    competencia: competenciaParaBanco(comp),
    descricao: rec.descricao,
    valor_centavos: valorCentavos,
    categoria_id: rec.categoria_id,
    recorrencia_id: rec.id,
    revisar: false,
  }).select().single());
}

// Os fixos já lançados que ainda não têm recorrência (o histórico da planilha).
export async function listarFixosSemRecorrencia() {
  return mes(await buscarTudo(() => supabase.from('lancamentos')
    .select('id, descricao, competencia, data, valor_centavos, categoria_id')
    .eq('origem', 'fixo').is('recorrencia_id', null)
    .order('competencia').order('id')));
}

// Cria as recorrências sugeridas pelo histórico e LIGA a elas os lançamentos de onde vieram — assim
// os meses passados já aparecem como "lançado".
export async function criarRecorrenciasDoHistorico(sugeridas) {
  for (const s of sugeridas) {
    const { ids, meses: _m, ...dados } = s;
    const rec = await salvarRecorrencia(dados);
    for (let i = 0; i < ids.length; i += 100) {
      await exigir(supabase.from('lancamentos').update({ recorrencia_id: rec.id }).in('id', ids.slice(i, i + 100)));
    }
  }
}
