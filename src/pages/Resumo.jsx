import { useState } from 'react';
import CabecalhoPagina from '../components/CabecalhoPagina.jsx';
import ListaVazia from '../components/ListaVazia.jsx';
import Tooltip from '../components/Tooltip.jsx';
import { addMeses, competenciaAtual, nomeCompetencia } from '../lib/format.js';

// Resumo do mês (tela inicial). O painel completo chega na fase 4; por ora, o seletor de mês.
const BOTAO_MES = 'flex h-[30px] w-[30px] items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 transition hover:bg-gray-50 hover:text-gray-800 active:bg-gray-100';

function Seta({ volta }) {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d={volta ? 'M15 6l-6 6 6 6' : 'M9 6l6 6-6 6'} />
    </svg>
  );
}

export default function Resumo() {
  const [comp, setComp] = useState(competenciaAtual());
  return (
    <div>
      <CabecalhoPagina
        titulo="Resumo do mês"
        acoes={(
          <div className="flex items-center gap-2">
            <Tooltip label="Mês anterior">
              <button type="button" className={BOTAO_MES} onClick={() => setComp(addMeses(comp, -1))} aria-label="Mês anterior"><Seta volta /></button>
            </Tooltip>
            <span className="min-w-[140px] text-center text-[13.5px] font-semibold text-gray-800">{nomeCompetencia(comp)}</span>
            <Tooltip label="Próximo mês">
              <button type="button" className={BOTAO_MES} onClick={() => setComp(addMeses(comp, 1))} aria-label="Próximo mês"><Seta /></button>
            </Tooltip>
          </div>
        )}
      />
      <div className="mt-6">
        <ListaVazia>
          Nenhum lançamento em {nomeCompetencia(comp).toLowerCase()}. O resumo (entradas, gastos, saldo, categorias e
          parcelas comprometidas) aparece aqui a partir da fase 4.
        </ListaVazia>
      </div>
    </div>
  );
}
