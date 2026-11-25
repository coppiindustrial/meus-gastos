import { exigir, supabase } from './supabase.js';

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
