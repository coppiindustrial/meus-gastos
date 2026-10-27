import { createContext, useContext, useMemo, useState } from 'react';
import useEscape from '../../lib/useEscape.js';

// A FAIXA DE FILTROS do Gestor Coppi (copiada de `components/filtros/FaixaFiltros.jsx` de lá): os
// filtros de uma tela deixam de ser caixas soltas e vivem num TRILHO cinza único, separados por
// divisores. Filtro sem seleção fica quieto (só texto); com seleção vira chip aceso com um ✕ que
// limpa só aquele filtro.
//
// O contexto existe para a regra "apenas UM menu aberto por vez": cada segmento pergunta ao provedor
// se é a vez dele. O provedor é separado do trilho porque uma barra pode ter dois trilhos (filtros à
// esquerda, controles à direita) e a regra vale entre eles.
const CtxFaixa = createContext(null);

export function useFaixa() {
  const ctx = useContext(CtxFaixa);
  if (!ctx) throw new Error('SegmentoFiltro precisa estar dentro de <FaixaProvider>');
  return ctx;
}

export function FaixaProvider({ children }) {
  const [aberto, setAberto] = useState(null); // id do segmento com o menu aberto
  useEscape(!!aberto, () => setAberto(null));
  const ctx = useMemo(() => ({
    aberto,
    alternar: (id) => setAberto((a) => (a === id ? null : id)),
    fechar: () => setAberto(null),
  }), [aberto]);
  return <CtxFaixa.Provider value={ctx}>{children}</CtxFaixa.Provider>;
}

// A casca cinza que agrupa os segmentos. ALTURA FIXA de 31px (chip de 25 + 3px de padding de cada
// lado), a mesma da `BuscaFaixa` ao lado; o raio 6 menos o padding 3 dá o raio 3 do chip, e os cantos
// ficam concêntricos. `border` e não `ring`: a sombra do ring não encaixa no pixel físico e borra.
export function Trilho({ children, className = '' }) {
  return (
    <span className={`inline-flex h-[31px] items-center rounded-[6px] border border-gray-300 bg-hx-f6f7f8 p-[3px] ${className}`}>
      {children}
    </span>
  );
}

// Provedor + trilho juntos, para quem tem um trilho só na tela.
export default function FaixaFiltros({ children, className = '' }) {
  return <FaixaProvider><Trilho className={className}>{children}</Trilho></FaixaProvider>;
}

// Divisor entre segmentos. Largura INTEIRA (1px): com fração, cada divisor cobria um número diferente
// de pixels físicos e eles pareciam de espessuras diferentes.
export function DivisorFaixa() {
  return <span aria-hidden="true" className="mx-[2px] h-[15px] w-px shrink-0 bg-gray-300" />;
}

// O "Limpar" de todos os filtros, ao lado do trilho. Só aparece com algum filtro ativo.
export function LimparFiltros({ ativo, onClick }) {
  if (!ativo) return null;
  return (
    <button type="button" onClick={onClick}
      className="h-[31px] shrink-0 rounded-md px-2 text-[12px] font-medium text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-800">
      Limpar
    </button>
  );
}
