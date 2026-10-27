import { varCor } from '../lib/varCor.js';
// Checkbox customizado (estilo HubSpot, aprovado por mockup — 20px): caixa quadrada com
// cantos levemente arredondados; vazio tem borda cinza-aço (#808790), marcado/indeterminado
// troca para grafite (#374151). SEM preenchimento sólido — marcado/indeterminado é só o
// ícone (check/traço) grosso e reto por cima do fundo branco. Hover NÃO mexe na borda:
// escurece o interior da caixa (fundo cinza) em TODOS os estados (inclusive já marcado).
// `align-middle` evita o deslize vertical de ~0.75px que ocorreria ao trocar o baseline do
// inline-flex quando o ícone entra. Input nativo escondido mantém teclado/acessibilidade;
// `indeterminate` é setado via ref no input (só existe em JS).
// `size`: 'md' (17.5px, padrão) é o das tabelas, onde a caixa fica sozinha na coluna;
// 'sm' (16px) para caixa ao lado de rótulo em texto pequeno.
//
// ATENÇÃO ao escolher: o `md` era 19.5px e desceu para 17.5 — ficou a 1,5px do `sm`, ou seja, os
// dois tamanhos hoje são quase o mesmo. Continuam separados porque servem contextos diferentes
// (coluna própria × ao lado de rótulo); se um dia precisar mexer de novo, provavelmente é caso de
// fundir os dois em vez de afastá-los mais.
const TAMANHOS = {
  md: { caixa: 'h-[17.5px] w-[17.5px]', icone: 'h-[14.5px] w-[14.5px]' },
  sm: { caixa: 'h-[16px] w-[16px]', icone: 'h-[13px] w-[13px]' },
};

export default function Checkbox({ checked, indeterminate, onChange, title, size = 'md', className = '' }) {
  const setRef = (el) => { if (el) el.indeterminate = !checked && !!indeterminate; };
  const marcado = !!checked;
  const meio = !marcado && !!indeterminate;
  const ativo = marcado || meio;
  const t = TAMANHOS[size] || TAMANHOS.md;

  return (
    <label title={title}
      className={`relative inline-flex ${t.caixa} shrink-0 cursor-pointer items-center justify-center rounded-[4px] border bg-white align-middle transition-colors hover:bg-hx-e5e7eb ${
        ativo ? 'border-hx-374151' : 'border-hx-808790'} ${className}`}>
      <input ref={setRef} type="checkbox" checked={marcado} onChange={onChange} className="sr-only" />
      {marcado && (
        <svg viewBox="0 0 24 24" className={t.icone} fill="none" stroke={varCor('#374151', 'texto')} strokeWidth="5.25" strokeLinecap="butt" strokeLinejoin="miter">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      )}
      {meio && (
        <svg viewBox="0 0 24 24" className={t.icone} fill="none" stroke={varCor('#374151', 'texto')} strokeWidth="5.25" strokeLinecap="butt" strokeLinejoin="miter">
          <line x1="3" y1="12" x2="21" y2="12" />
        </svg>
      )}
    </label>
  );
}
