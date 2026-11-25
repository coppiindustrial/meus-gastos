import { buscarTudo, exigir, supabase } from './supabase.js';

// O ACOMPANHAMENTO DAS AÇÕES (25/11/2026, migration 037): a lista do que a pessoa acompanha fora da carteira e o que ela
// escondeu da carteira (`rv_acompanhamento`). Sem a migration, `listarAcompanhamento` devolve null: a tela mostra a carteira
// inteira e o pop-up pede a migration. Os preços não ficam aqui: `lerAoVivo` em `api/rendaVariavel.js`.

const semTabela = (err) => /rv_acompanhamento|rv_eventos|schema cache|does not exist/i.test(err?.message ?? '');

export async function listarAcompanhamento() {
  try {
    return await exigir(supabase.from('rv_acompanhamento').select('*').order('ordem').order('ticker'));
  } catch (err) {
    if (semTabela(err)) return null;
    throw err;
  }
}

// grava o plano do pop-up (`planoDoAcompanhamento`): apaga, atualiza e cria
export async function gravarAcompanhamento({ criar, atualizar, apagar }) {
  if (apagar.length) await exigir(supabase.from('rv_acompanhamento').delete().in('id', apagar));
  for (const a of atualizar) await exigir(supabase.from('rv_acompanhamento').update(a.mudancas).eq('id', a.id));
  if (criar.length) await exigir(supabase.from('rv_acompanhamento').insert(criar));
}

// OS PRÓXIMOS EVENTOS dos ativos cadastrados (os do gráfico do ativo, migration 031): os resultados e as datas-ex de hoje
// em diante. Sem a 031, null.
export async function proximosEventos(hoje) {
  try {
    return await exigir(supabase.from('rv_eventos').select('ativo_id, tipo, data, valor, estimado, hora, ano, trimestre, atualizado_em')
      .in('tipo', ['dividendo', 'resultado']).gte('data', hoje).or('hora.is.null,hora.neq.periodo').order('data').limit(40));
  } catch (err) {
    if (semTabela(err)) return null;
    throw err;
  }
}

// O AMPLIADO DOS RESULTADOS (25/11/2026): todos os resultados guardados dos ativos cadastrados (os divulgados e os que vêm;
// as contas em `resultadosDivulgados`/`resultadosQueVem`). Sem a 031, null.
export async function listarResultados() {
  try {
    return await buscarTudo(() => supabase.from('rv_eventos').select('ativo_id, tipo, data, valor, estimado, receita, receita_estimada, hora, ano, trimestre, atualizado_em')
      .eq('tipo', 'resultado').order('data').order('ativo_id'));
  } catch (err) {
    if (semTabela(err)) return null;
    throw err;
  }
}
// os fechamentos de VÁRIOS ativos desde uma data (a reação da ação a cada resultado): { ativo_id: [[data, preco], …] }
export async function fechamentosDesde(ids, desde) {
  if (!ids.length) return {};
  const linhas = await buscarTudo(() => supabase.from('rv_fechamentos').select('ativo_id, data, preco')
    .in('ativo_id', ids).gte('data', desde).order('ativo_id').order('data'));
  const m = {};
  for (const l of linhas) (m[l.ativo_id] ??= []).push([l.data, Number(l.preco)]);
  return m;
}
