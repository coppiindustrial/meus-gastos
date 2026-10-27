// Caixa de "não há nada aqui" das colunas de quadro (Kanban de Custos e Painel da Engenharia).
// Antes cada tela tinha a sua: o Kanban com traço de 1,5px e fonte de 13px, o Painel com traço de
// 1px, fonte de 10,5px e sem fundo. Ficou o traço e a fonte do Painel com o fundo do Kanban.
//
// O texto vem por `children` porque cada coluna diz uma coisa ("Fila vazia", "Nenhum registro",
// "Nenhum com esse filtro"…).
export default function ListaVazia({ children }) {
  return (
    <div className="rounded-xl border border-dashed border-gray-300 bg-hx-fafbfc px-3 py-6 text-center text-xs text-gray-400">
      {children}
    </div>
  );
}
