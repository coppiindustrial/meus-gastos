import { forwardRef, useCallback, useRef, useState } from 'react';

// Campo de busca padrão do app: lupa à esquerda + input com fundo cinza claro
// (o "efeito do Painel"). Repassa as props do <input> (value/defaultValue,
// onChange, onKeyDown, onBlur, placeholder, etc.). A largura vem por `className`
// no wrapper; o input é w-full.
//   size="md" (padrão) | "sm" (compacto, p/ barras de filtro densas)
// `forwardRef` para a ref chegar no INPUT, não no wrapper: quem precisa dela quer dar `focus()`
// (o GrupoModal devolve o cursor ao campo depois de adicionar um orçamento). Sem isso a ref não
// chegava a lugar nenhum e o foco falhava em silêncio.
//
// O × de limpar aparece assim que há texto. Ele NÃO pode depender de `props.value`: dos 18
// consumidores, a Fila passa `defaultValue` (não controlado), e nela o × simplesmente nunca
// apareceria. Por isso a visibilidade acompanha o valor REAL do campo.
const SearchInput = forwardRef(function SearchInput({ size = 'md', className = '', onChange, ...props }, ref) {
  const sm = size === 'sm';
  const interno = useRef(null);
  const [temTexto, setTemTexto] = useState(!!(props.value ?? props.defaultValue));

  // Uma ref para dois donos: a de fora (GrupoModal) e a de dentro (o ×). Sem isto, aceitar a ref
  // externa cegaria o componente para o próprio input.
  const setRef = useCallback((el) => {
    interno.current = el;
    if (typeof ref === 'function') ref(el);
    else if (ref) ref.current = el;
  }, [ref]);

  const limpar = () => {
    const el = interno.current;
    if (!el) return;
    // `el.value = ''` direto não basta: o React guarda o último valor no nó e ignora a mudança.
    // Pelo setter nativo + evento de `input`, tanto o consumidor controlado quanto o não
    // controlado enxergam a limpeza pelo caminho normal do `onChange`.
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
    if (setter) setter.call(el, '');
    else el.value = '';
    el.dispatchEvent(new Event('input', { bubbles: true }));
    setTemTexto(false);
    el.focus(); // quem apaga quase sempre vai digitar de novo
  };

  // O padding direito só abre quando há texto: fixo, deixaria um vão à direita em todo campo
  // vazio do app.
  const campo = sm
    ? `pl-8 ${temTexto ? 'pr-7' : 'pr-3'} py-1.5 text-xs`
    : `pl-9 ${temTexto ? 'pr-8' : 'pr-3'} py-2 text-sm`;
  const iconPos = sm ? 'left-2 h-3.5 w-3.5' : 'left-2.5 h-4 w-4';

  return (
    <div className={`relative ${className}`}>
      <svg viewBox="0 0 24 24" className={`pointer-events-none absolute top-1/2 -translate-y-1/2 text-gray-400 ${iconPos}`}
        fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
      </svg>
      <input ref={setRef} {...props}
        onChange={(e) => { setTemTexto(!!e.target.value); onChange?.(e); }}
        className={`w-full rounded-md border border-gray-200 bg-gray-50 ${campo} text-gray-700 placeholder:text-gray-400 focus:outline-none focus:border-gray-800 focus:ring-1 focus:ring-gray-800`} />
      {temTexto && (
        // Mesmo glifo do X fundido dos filtros (strokeWidth 2.25, duas linhas) — é o × canônico do
        // app. `type="button"` porque vários destes campos vivem dentro de <form>.
        <button type="button" onClick={limpar} aria-label="Limpar busca" title="Limpar busca"
          className={`absolute top-1/2 -translate-y-1/2 inline-flex items-center justify-center rounded text-gray-400 hover:bg-gray-200 hover:text-gray-600 active:bg-gray-400 transition ${
            sm ? 'right-1.5 h-4 w-4' : 'right-2 h-5 w-5'}`}>
          <svg viewBox="0 0 24 24" className={sm ? 'h-3 w-3' : 'h-3.5 w-3.5'} fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      )}
    </div>
  );
});

export default SearchInput;
