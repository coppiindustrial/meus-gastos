import { BackButton, EmptyState, TopBar } from '../components/Layout';

/** Formulário rápido de gasto ou entrada (fase 1). */
export function Lancar() {
  return (
    <main className="screen no-tabs">
      <TopBar left={<BackButton to="/" />} title="Lançar" />
      <EmptyState title="Em construção" text="O formulário rápido de gasto e entrada chega na fase 1." />
    </main>
  );
}
