import { exigir, supabase } from './supabase.js';
import { competenciaDe, competenciaParaBanco } from '../lib/format.js';

// Extrato da conta corrente: o que já foi importado e a gravação do plano (lib/planoExtrato.js).
export const ORIGEM_EXTRATO = 'extrato';

// Quais destes identificadores do banco já estão gravados (em lotes de 100: vão na URL).
export async function idsJaImportados(ids) {
  const achados = new Set();
  for (let i = 0; i < ids.length; i += 100) {
    const linhas = await exigir(supabase.from('lancamentos').select('id_externo').in('id_externo', ids.slice(i, i + 100)));
    linhas.forEach((l) => achados.add(l.id_externo));
  }
  return achados;
}

// Os fixos já lançados (com recorrência), no formato que o plano espera.
export async function fixosLancados() {
  const linhas = await exigir(supabase.from('lancamentos')
    .select('id, recorrencia_id, competencia, data, id_externo, valor_centavos, importado_de').not('recorrencia_id', 'is', null));
  return linhas.map((l) => ({ ...l, competencia: l.competencia.slice(0, 7) }));
}

// As entradas lançadas À MÃO (sem identificador do banco) neste período, para o plano não trazer de novo a mesma
// entrada do extrato.
export function entradasManuais(de, ate) {
  return exigir(supabase.from('lancamentos').select('id, data, valor_centavos')
    .eq('tipo', 'entrada').is('id_externo', null).gte('data', de).lte('data', ate));
}

// Grava o plano: só as ações que mexem no banco (ignorar e "já importada" não fazem nada). Devolve
// { n, apagar, restaurar }: os ids criados e, dos fixos corrigidos, como eles eram — o "Desfazer" do histórico.
export async function gravarExtrato(plano, aoAvancar) {
  const acoes = plano.filter((p) => ['fixo_novo', 'fixo_corrigir', 'avulso', 'entrada'].includes(p.acao));
  const apagar = [];
  const restaurar = [];
  let n = 0;
  for (const p of acoes) {
    const l = p.linha;
    const comum = {
      data: l.data,
      valor_centavos: -l.valor_centavos, // no extrato o gasto é negativo; aqui é sempre positivo
      id_externo: l.id_externo,
      importado_de: ORIGEM_EXTRATO,
    };
    if (p.acao === 'entrada') {
      // O crédito vira uma ENTRADA (valor positivo como veio); sem categoria de entrada, fica sem — não vai para
      // Revisar pendências, que classifica gastos.
      const criado = await exigir(supabase.from('lancamentos').insert({
        data: l.data, valor_centavos: l.valor_centavos, id_externo: l.id_externo, importado_de: ORIGEM_EXTRATO,
        tipo: 'entrada', origem: 'entrada', competencia: competenciaParaBanco(competenciaDe(l.data)),
        descricao: l.nome, estabelecimento: l.contraparte, categoria_id: p.categoriaId, revisar: false,
      }).select('id').single());
      apagar.push(criado.id);
    } else if (p.acao === 'fixo_corrigir') {
      // O fixo lançado à mão passa a ter o valor e a data reais do pagamento.
      const e = p.existente;
      restaurar.push({ id: e.id, data: e.data, valor_centavos: e.valor_centavos, id_externo: e.id_externo ?? null, importado_de: e.importado_de ?? null });
      await exigir(supabase.from('lancamentos').update(comum).eq('id', e.id));
    } else {
      const fixo = p.acao === 'fixo_novo';
      const criado = await exigir(supabase.from('lancamentos').insert({
        ...comum,
        tipo: 'saida',
        origem: fixo ? 'fixo' : 'manual',
        competencia: competenciaParaBanco(competenciaDe(l.data)),
        descricao: fixo ? p.recorrencia.descricao : l.nome,
        estabelecimento: l.contraparte,
        categoria_id: p.categoriaId,
        recorrencia_id: fixo ? p.recorrencia.id : null,
        revisar: !p.categoriaId,
      }).select('id').single());
      apagar.push(criado.id);
    }
    n += 1;
    aoAvancar?.(n, acoes.length);
  }
  return { n: acoes.length, apagar, restaurar };
}
