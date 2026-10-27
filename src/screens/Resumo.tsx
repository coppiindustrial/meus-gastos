import { useState } from 'react';
import { EmptyState, TabHead } from '../components/Layout';
import { Icon } from '../components/Icon';
import { addMeses, capitalizar, competenciaAtual, nomeCompetencia } from '../lib/format';

/** Resumo do mês (tela inicial). O painel completo chega na fase 4. */
export function Resumo() {
  const [comp, setComp] = useState(competenciaAtual());
  return (
    <main className="screen">
      <TabHead title="Resumo" />
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <button type="button" className="glass circle" aria-label="Mês anterior" onClick={() => setComp(addMeses(comp, -1))}>
          <Icon name="arrowLeft" size={20} />
        </button>
        <span style={{ fontWeight: 700 }}>{capitalizar(nomeCompetencia(comp))}</span>
        <button type="button" className="glass circle" aria-label="Próximo mês" onClick={() => setComp(addMeses(comp, 1))}>
          <Icon name="next" size={20} />
        </button>
      </div>
      <EmptyState
        title="Nenhum lançamento ainda"
        text="O resumo do mês aparece aqui: entradas, gastos, saldo, categorias e parcelas comprometidas."
        action={{ label: 'Lançar gasto', to: '/lancar' }}
      />
    </main>
  );
}
