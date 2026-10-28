import { useEffect, useState } from 'react';
import { carregarSituacao, EVENTO_IMPORTACOES } from '../api/importacoes.js';
import { pendenciasAgora } from './importacoes.js';
import { todayISO } from './format.js';

// OS NÚMEROS DO MENU (`contador` em lib/navegacao.js). Hoje um só: `importar`, o que falta importar no ano
// (e no mês anterior a ele) — a mesma conta da tela Importar. Refaz quando uma importação entra ou sai
// (o evento de `avisarMudanca`). Falhar aqui não pode derrubar o menu: sem número, e só.
export default function useContadores(ativo) {
  const [contadores, setContadores] = useState({});
  useEffect(() => {
    if (!ativo) return undefined;
    let vivo = true;
    const contar = () => {
      carregarSituacao()
        .then((d) => { if (vivo) setContadores({ importar: pendenciasAgora({ hoje: todayISO(), ...d }) }); })
        .catch(() => {});
    };
    contar();
    window.addEventListener(EVENTO_IMPORTACOES, contar);
    return () => { vivo = false; window.removeEventListener(EVENTO_IMPORTACOES, contar); };
  }, [ativo]);
  return contadores;
}
