import { useState } from 'react';
import CabecalhoPagina from '../components/CabecalhoPagina.jsx';
import ListaVazia from '../components/ListaVazia.jsx';
import { SeletorMes } from '../components/Comuns.jsx';
import { competenciaAtual, nomeCompetencia } from '../lib/format.js';

// Resumo do mês (tela inicial). O painel completo chega na fase 4; por ora, o seletor de mês.
export default function Resumo() {
  const [comp, setComp] = useState(competenciaAtual());
  return (
    <div>
      <CabecalhoPagina titulo="Resumo do mês" acoes={<SeletorMes comp={comp} onChange={setComp} />} />
      <div className="mt-6">
        <ListaVazia>
          Nenhum lançamento em {nomeCompetencia(comp).toLowerCase()}. O resumo (entradas, gastos, saldo, categorias e
          parcelas comprometidas) aparece aqui a partir da fase 4.
        </ListaVazia>
      </div>
    </div>
  );
}
