import { EmptyState, TabHead } from '../components/Layout';

/** Lista de lançamentos do mês (fase 1). */
export function Lancamentos() {
  return (
    <main className="screen">
      <TabHead title="Lançamentos" />
      <EmptyState title="Em construção" text="A lista do mês, com busca e filtros, chega na fase 1." />
    </main>
  );
}
