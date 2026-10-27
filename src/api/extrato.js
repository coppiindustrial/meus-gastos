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
    .select('id, recorrencia_id, competencia, id_externo, valor_centavos').not('recorrencia_id', 'is', null));
  return linhas.map((l) => ({ ...l, competencia: l.competencia.slice(0, 7) }));
}

// Grava o plano: só as ações que mexem no banco (ignorar e "já importada" não fazem nada).
export async function gravarExtrato(plano, aoAvancar) {
  const acoes = plano.filter((p) => ['fixo_novo', 'fixo_corrigir', 'avulso'].includes(p.acao));
  let n = 0;
  for (const p of acoes) {
    const l = p.linha;
    const comum = {
      data: l.data,
      valor_centavos: -l.valor_centavos, // no extrato o gasto é negativo; aqui é sempre positivo
      id_externo: l.id_externo,
      importado_de: ORIGEM_EXTRATO,
    };
    if (p.acao === 'fixo_corrigir') {
      // O fixo lançado à mão passa a ter o valor e a data reais do pagamento.
      await exigir(supabase.from('lancamentos').update(comum).eq('id', p.existente.id));
    } else {
      const fixo = p.acao === 'fixo_novo';
      await exigir(supabase.from('lancamentos').insert({
        ...comum,
        tipo: 'saida',
        origem: fixo ? 'fixo' : 'manual',
        competencia: competenciaParaBanco(competenciaDe(l.data)),
        descricao: fixo ? p.recorrencia.descricao : l.nome,
        estabelecimento: l.contraparte,
        categoria_id: p.categoriaId,
        recorrencia_id: fixo ? p.recorrencia.id : null,
        revisar: !p.categoriaId,
      }));
    }
    n += 1;
    aoAvancar?.(n, acoes.length);
  }
  return acoes.length;
}
