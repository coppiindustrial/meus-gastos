import SelectBusca from './SelectBusca.jsx';

// Dropdown de opções simples (cartão, mês, origem, tipo de conta). Era a cópia do SelectSimples do
// Gestor, com a lista `absolute` — dentro de um cartão com `overflow-hidden` ou no fim de um modal ela
// era recortada, e a letra era pequena. Hoje é o `SelectBusca` sem o campo de busca: a mesma lista
// portada, o mesmo tamanho de letra e o mesmo teclado em todos os seletores do app.
//
// `opcoes`: [{ value, label }].
// `grupoNoBotao` (padrão true): false tira o "· grupo" do botão (o campo Tipo dos investimentos: "CRA", não "CRA · Seus tipos").
export default function SelectSimples({ value, onChange, opcoes, disabled = false, className = '', placeholder = 'Selecione…', compacto = false, acao, grupoNoBotao }) {
  return <SelectBusca semBusca value={value} onChange={onChange} opcoes={opcoes} disabled={disabled} className={className} placeholder={placeholder} compacto={compacto} acao={acao} grupoNoBotao={grupoNoBotao} />;
}
