import { EmptyState, TabHead } from '../components/Layout';

/** Contas, saldos e evolução do patrimônio (fase 6). */
export function Patrimonio() {
  return (
    <main className="screen">
      <TabHead title="Patrimônio" />
      <EmptyState title="Em construção" text="Contas, saldos e a evolução do seu patrimônio chegam na fase 6." />
    </main>
  );
}
