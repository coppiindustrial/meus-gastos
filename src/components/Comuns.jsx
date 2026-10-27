import Tooltip from './Tooltip.jsx';
import { IconLapis, IconLixeira } from './icons.jsx';
import { addMeses, nomeCompetencia } from '../lib/format.js';

// Peças pequenas repetidas nas telas deste app (as grandes vêm do Gestor, cada uma no seu arquivo).

// Botão de ação de linha (32px, o `.btn-acao` do Gestor), com tooltip.
export function BotaoAcao({ titulo, onClick, perigo = false, disabled = false, children }) {
  return (
    <Tooltip label={titulo}>
      <button type="button" onClick={onClick} disabled={disabled} aria-label={titulo}
        className={`btn-acao text-gray-500 disabled:opacity-40 ${perigo ? 'hover:text-hx-c0393d' : 'hover:text-gray-800'}`}>
        {children}
      </button>
    </Tooltip>
  );
}

export const BotaoEditar = ({ onClick, titulo = 'Editar' }) => (
  <BotaoAcao titulo={titulo} onClick={onClick}><IconLapis className="h-[15px] w-[15px]" /></BotaoAcao>
);

export const BotaoExcluir = ({ onClick, titulo = 'Excluir', disabled }) => (
  <BotaoAcao titulo={titulo} onClick={onClick} perigo disabled={disabled}><IconLixeira className="h-[15px] w-[15px]" /></BotaoAcao>
);

// Campo de formulário: rótulo em cima, controle embaixo, e a mensagem de erro (se houver).
export function Campo({ rotulo, erro, children, className = '' }) {
  return (
    <div className={className}>
      <span className="label">{rotulo}</span>
      {children}
      {erro && <p className="mt-1 text-xs font-medium text-hx-dc2626">{erro}</p>}
    </div>
  );
}

// Bolinha da cor do grupo.
export const Bolinha = ({ cor, className = 'h-2.5 w-2.5' }) => (
  <span className={`inline-block shrink-0 rounded-full ${className}`} style={{ background: cor || '#9ca3af' }} />
);

// Etiqueta pequena (Inativo, Gasto/Entrada…).
export function Etiqueta({ children, tom = 'cinza' }) {
  const tons = {
    cinza: 'bg-gray-100 text-gray-600',
    verde: 'bg-green-50 text-green-700',
    vermelho: 'bg-red-50 text-red-700',
    ambar: 'bg-amber-50 text-amber-700',
  };
  return <span className={`inline-flex h-[20px] items-center rounded-[6px] px-1.5 text-[11px] font-semibold ${tons[tom]}`}>{children}</span>;
}

// ‹ Outubro de 2026 › — o mês de referência das telas.
const BOTAO_MES = 'flex h-[30px] w-[30px] items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 transition hover:bg-gray-50 hover:text-gray-800 active:bg-gray-100';

function Seta({ volta }) {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d={volta ? 'M15 6l-6 6 6 6' : 'M9 6l6 6-6 6'} />
    </svg>
  );
}

export function SeletorMes({ comp, onChange }) {
  return (
    <div className="flex items-center gap-1.5 sm:gap-2">
      <Tooltip label="Mês anterior">
        <button type="button" className={BOTAO_MES} onClick={() => onChange(addMeses(comp, -1))} aria-label="Mês anterior"><Seta volta /></button>
      </Tooltip>
      <span className="min-w-[124px] text-center text-[13.5px] font-semibold text-gray-800 sm:min-w-[140px]">{nomeCompetencia(comp)}</span>
      <Tooltip label="Próximo mês">
        <button type="button" className={BOTAO_MES} onClick={() => onChange(addMeses(comp, 1))} aria-label="Próximo mês"><Seta /></button>
      </Tooltip>
    </div>
  );
}

// Rodapé padrão dos formulários em modal: Cancelar · Salvar.
export function RodapeForm({ onCancelar, salvando, rotulo = 'Salvar' }) {
  return (
    <div className="mt-5 flex justify-end gap-2">
      <button type="button" className="btn-secondary" onClick={onCancelar}>Cancelar</button>
      <button type="submit" className="btn-primary" disabled={salvando}>{salvando ? 'Salvando…' : rotulo}</button>
    </div>
  );
}
