import { IconGrip } from './icons.jsx';

// AS PEÇAS DOS CADASTROS AGRUPADOS (o dos investimentos e o das categorias — 23/11/2026, a pedido: "o mais próximo
// possível" um do outro): a seta da faixa e a alça ⠿ de arrastar. Nasceram no `ModalCadastroCarteira` (09/11/2026).

// a seta da faixa (a da carteira): caixa de 20px e ícone de 12 (a diferença par, sem meio pixel)
export const Seta = ({ aberto, onClick, rotulo, disabled = false }) => (
  <button type="button" onClick={onClick} aria-expanded={aberto} aria-label={rotulo} title={rotulo} disabled={disabled}
    className="group/seta flex h-[20px] w-[20px] shrink-0 items-center justify-center rounded-[4px] transition-colors hover:bg-gray-200 disabled:opacity-40">
    <svg viewBox="0 0 24 24" className={`h-[12px] w-[12px] shrink-0 text-gray-500 transition-[transform,color] duration-150 group-hover/seta:text-gray-800 ${aberto ? 'rotate-90' : ''}`} fill="none"
      stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
  </button>
);

// a alça ⠿: aparece no hover da linha (`group/linha`; o ícone de 9 × 14 numa caixa de 17 × 24). Sem `props` (a lista
// filtrada não arrasta), fica só o lugar dela, para nada andar.
export const Alca = ({ props, rotulo }) => (props ? (
  <span {...props} title={rotulo}
    className="flex h-[24px] w-[17px] shrink-0 cursor-grab items-center justify-center rounded-[4px] text-gray-400 opacity-0 transition-[opacity,color,background-color] hover:bg-gray-200 hover:text-gray-700 focus-visible:opacity-100 active:cursor-grabbing group-hover/linha:opacity-100">
    <IconGrip />
  </span>
) : <span className="h-[24px] w-[17px] shrink-0" aria-hidden="true" />);
