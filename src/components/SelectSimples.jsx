import SelectBusca from './SelectBusca.jsx';

// Dropdown de opções simples (cartão, mês, origem, tipo de conta). Era a cópia do SelectSimples do
// Gestor, com a lista `absolute` — dentro de um cartão com `overflow-hidden` ou no fim de um modal ela
// era recortada, e a letra era pequena. Hoje é o `SelectBusca` sem o campo de busca: a mesma lista
// portada, o mesmo tamanho de letra e o mesmo teclado em todos os seletores do app.
//
// `opcoes`: [{ value, label }].
export default function SelectSimples({ value, onChange, opcoes, disabled = false, className = '', placeholder = 'Selecione…' }) {
  return <SelectBusca semBusca value={value} onChange={onChange} opcoes={opcoes} disabled={disabled} className={className} placeholder={placeholder} />;
}
