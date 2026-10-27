import { IconSetaOrdenacao } from './icons.jsx';

// Cabeçalho de coluna clicável para ordenação — usado por 12 telas (81 colunas).
//
// A seta aparece SÓ na coluna ordenada, em grafite. Nas demais o espaço dela é reservado mas fica
// invisível até o cursor entrar no `<th>`, quando surge apagada — é o que ensina que a coluna é
// clicável sem encher a fileira de símbolos permanentes. Como o espaço existe nos dois estados,
// nada desloca quando ela acende.
//
// Antes eram glifos de texto: `▲`/`▼` em `brand-600` na ativa e `↕` cinza nas inativas. O
// triângulo cheio azul, em 9px, virava um borrão de cor no meio de um cabeçalho todo cinza — e
// era o único azul da fileira, o que dava a ele um peso que a informação não tem.
//
// A DIVISÓRIA vertical entre colunas não está aqui: mora em `.table-th` (index.css), porque a
// mesma fileira mistura colunas ordenáveis e cruas — só neste componente, as cruas ficariam sem
// linha no meio do cabeçalho. O hover de FUNDO, sim, é daqui: ele sinaliza "dá para clicar", e
// numa coluna que não ordena prometeria uma interação que não existe.
export default function SortableTh({ label, field, sort, className = '' }) {
  const active = sort.sortKey === field;
  return (
    <th
      scope="col"
      onClick={() => sort.toggle(field)}
      className={`table-th group/th cursor-pointer select-none transition-colors hover:bg-gray-100 active:bg-gray-300 ${
        active ? 'text-gray-900' : 'hover:text-gray-700'} ${className}`}
      aria-sort={active ? (sort.sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      <span className={`inline-flex items-center gap-1 ${className.includes('text-right') ? 'justify-end w-full' : ''}`}>
        {label}
        <span className={`shrink-0 transition-opacity duration-150 ${
          active ? 'text-gray-900' : 'text-gray-400 opacity-0 group-hover/th:opacity-100'}`}>
          <IconSetaOrdenacao className="h-3.5 w-3.5" descendente={active && sort.sortDir === 'desc'} />
        </span>
      </span>
    </th>
  );
}
