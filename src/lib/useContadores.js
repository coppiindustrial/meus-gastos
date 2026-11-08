import { useEffect, useState } from 'react';
import { carregarSituacao, EVENTO_IMPORTACOES } from '../api/importacoes.js';
import { EVENTO_DADOS } from '../api/supabase.js';
import { contarPendencias } from '../api/resumo.js';
import { listarLancamentosDeFixos, listarPulados, listarRecorrencias } from '../api/fixos.js';
import { pendenciasAgora } from './importacoes.js';
import { matrizDoAno, pendentesPorMes } from './fixos.js';
import { todayISO } from './format.js';

// OS NÚMEROS DO MENU (`contador` em lib/navegacao.js), o que ainda pede a pessoa depois de importar:
//   importar → o que falta importar no ano (e no mês anterior a ele), a mesma conta da tela Importar;
//   revisar  → os lançamentos sem categoria ou marcados "Revisar" (a tela Revisar pendências);
//   fixos    → os fixos a lançar do ano até hoje (a linha "A lançar" da grade dos Fixos, o aviso da Visão geral).
// Refaz quando uma importação entra ou sai (`avisarMudanca`) e depois de qualquer gravação no banco
// (`EVENTO_DADOS`, do fetch do supabase), esperando a rajada acabar: digitar na grade grava campo a campo.
// Cada conta falha sozinha: sem número, e só — o menu não pode cair por isso.
const ESPERA = 800; // ms

export default function useContadores(ativo) {
  const [contadores, setContadores] = useState({});
  useEffect(() => {
    if (!ativo) return undefined;
    let vivo = true;
    let tempo = null;
    const por = (chave) => (n) => { if (vivo) setContadores((c) => ({ ...c, [chave]: n })); };
    const contar = () => {
      const hoje = todayISO();
      carregarSituacao().then((d) => pendenciasAgora({ hoje, ...d })).then(por('importar')).catch(() => {});
      contarPendencias().then(por('revisar')).catch(() => {});
      Promise.all([listarRecorrencias(), listarLancamentosDeFixos(), listarPulados()])
        .then(([recs, lancs, pulados]) => Object.values(pendentesPorMes(matrizDoAno(recs, lancs, Number(hoje.slice(0, 4)), hoje, pulados ?? [])))
          .reduce((s, l) => s + l.length, 0))
        .then(por('fixos')).catch(() => {});
    };
    const depois = () => { clearTimeout(tempo); tempo = setTimeout(contar, ESPERA); };
    contar();
    window.addEventListener(EVENTO_IMPORTACOES, contar);
    window.addEventListener(EVENTO_DADOS, depois);
    return () => {
      vivo = false;
      clearTimeout(tempo);
      window.removeEventListener(EVENTO_IMPORTACOES, contar);
      window.removeEventListener(EVENTO_DADOS, depois);
    };
  }, [ativo]);
  return contadores;
}
