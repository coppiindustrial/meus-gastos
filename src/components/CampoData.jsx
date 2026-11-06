import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import CalendarioData from './CalendarioData.jsx';
import CalendarioMes from './CalendarioMes.jsx';
import { IconSeta } from './icons.jsx';
import posicionarPopover from '../lib/posicionarPopover.js';
import useEscape from '../lib/useEscape.js';
import { mascaraData, nomeCompetencia } from '../lib/format.js';
import { lerData } from '../lib/planilha.js';

// O CAMPO DE DATA DO GESTOR COPPI (`components/CampoData.jsx`, copiado em 28/10/2026): o botão com cara de
// `.input` e o calendário do app por baixo — o <input type="date"> nativo destoa do resto. E o `CampoMes`,
// o mesmo campo para escolher um MÊS (o `CalendarioMes`).
//
// DIFERENÇA DA CÓPIA: o calendário é PORTADO ao body (posição fixa, por `posicionarPopover`), em vez do
// `absolute` de lá. Aqui ele vive dentro de modais e de tabelas que rolam, que o recortariam (a regra
// dos seletores do app). Por isso o clique fora testa as DUAS refs (o campo e o calendário), a rolagem
// fora dele o fecha (a posição fixa ficaria para trás) e o Escape entra na pilha do app (`useEscape`).
//
// `value`/`onChange`: 'AAAA-MM-DD' (CampoData) ou 'AAAA-MM' (CampoMes); '' = vazio. `min`/`max` no mesmo
// formato. `compacto`: a altura de campo de tabela (32px). `vazio`: o texto sem valor. `limpavel`: mostra o
// "Limpar" (no CampoData sempre há).
//
// ESCREVER OU ESCOLHER (06/11/2026, a pedido): o CampoData é um TEXTO — digita-se "11042027" (as barras entram
// sozinhas: `mascaraData`), "11/4/27" ou "11/04" (o ano de agora; a régua é a `lerData` da grade dos Lançamentos) —, e
// clicar nele ou na seta abre o calendário. Vale ao completar a data, no Enter ou ao sair do campo; o que não for data
// (ou ficar fora do min/max) volta ao valor de antes; apagar tudo limpa.

const fmtBR = (iso) => { if (!iso) return ''; const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}`; };
const fmtMes = (comp) => (comp ? nomeCompetencia(comp).toLowerCase() : '');

function useCalendario() {
  const [pos, setPos] = useState(null);
  const ref = useRef(null);
  const popRef = useRef(null);
  const fechar = () => setPos(null);
  useEscape(!!pos, fechar);
  useEffect(() => {
    if (!pos) return undefined;
    const fora = (e) => { if (!ref.current?.contains(e.target) && !popRef.current?.contains(e.target)) fechar(); };
    const rolou = (e) => { if (!popRef.current?.contains(e.target)) fechar(); };
    document.addEventListener('mousedown', fora);
    window.addEventListener('scroll', rolou, true);
    window.addEventListener('resize', fechar);
    return () => {
      document.removeEventListener('mousedown', fora);
      window.removeEventListener('scroll', rolou, true);
      window.removeEventListener('resize', fechar);
    };
  }, [pos]);
  const alternar = () => setPos((p) => (p ? null : posicionarPopover(ref.current, { largura: 226, altura: 300, alinhar: 'esquerda', gap: 4 })));
  return { pos, ref, popRef, fechar, alternar };
}

function Campo({ cal, texto, vazio, disabled, compacto, children, className = '' }) {
  return (
    <div ref={cal.ref} className={`relative ${className}`}>
      <button type="button" disabled={disabled} onClick={cal.alternar} aria-expanded={!!cal.pos} aria-haspopup="dialog"
        className={`input flex items-center justify-between gap-2 text-left disabled:cursor-not-allowed disabled:bg-gray-100 ${compacto ? '!h-8 text-[12.5px]' : ''}`}>
        <span className={`truncate ${texto ? 'text-gray-800' : 'text-gray-400'}`}>{texto || vazio}</span>
        <IconSeta className={`text-gray-400 transition-transform duration-200 ease-out ${cal.pos ? 'rotate-180' : ''}`} />
      </button>
      {cal.pos && createPortal(
        <div ref={cal.popRef} style={{ position: 'fixed', ...cal.pos }}
          className="z-[80] animate-pop-in rounded-md border border-elevado bg-elevado shadow-lg sombra-popover">
          {children}
        </div>,
        document.body,
      )}
    </div>
  );
}

export default function CampoData({ value, onChange, disabled, min, max, compacto = false, vazio = 'dd/mm/aaaa', className }) {
  const cal = useCalendario();
  const [texto, setTexto] = useState(fmtBR(value));
  useEffect(() => { setTexto(fmtBR(value)); }, [value]);
  const vale = (iso) => iso && !(max && iso > max) && !(min && iso < min);
  const escolher = (iso) => {
    if (!vale(iso)) return; // o calendário já não deixa; guarda dupla
    onChange(iso); setTexto(fmtBR(iso)); cal.fechar();
  };
  const ano = (value || new Date().toISOString()).slice(0, 4);
  const confirmar = () => {
    if (!texto.trim()) { if (value) onChange(''); return; }
    const iso = lerData(texto, ano);
    if (vale(iso)) { if (iso !== value) onChange(iso); setTexto(fmtBR(iso)); } else setTexto(fmtBR(value));
  };
  const digitar = (e) => {
    const t = mascaraData(e.target.value);
    setTexto(t);
    if (t.length === 10) { const iso = lerData(t, ano); if (vale(iso) && iso !== value) onChange(iso); }
  };
  return (
    <div ref={cal.ref} className={`relative ${className ?? ''}`}>
      <div className={`input flex items-center gap-1 !py-0 !pr-1.5 focus-within:border-gray-800 focus-within:ring-1 focus-within:ring-gray-800 ${disabled ? 'cursor-not-allowed bg-gray-100' : ''} ${compacto ? '!h-8 text-[12.5px]' : ''}`}>
        <input type="text" inputMode="numeric" autoComplete="off" disabled={disabled} value={texto} placeholder={vazio} maxLength={10}
          onChange={digitar} onBlur={confirmar} onClick={() => { if (!cal.pos) cal.alternar(); }}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); confirmar(); cal.fechar(); } }}
          className={`min-w-0 flex-1 bg-transparent text-gray-800 outline-none placeholder:text-gray-400 disabled:cursor-not-allowed ${compacto ? 'h-full py-0' : 'py-2'}`} />
        <button type="button" tabIndex={-1} disabled={disabled} onClick={cal.alternar} aria-label="Abrir o calendário" aria-expanded={!!cal.pos} aria-haspopup="dialog"
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[4px] text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 disabled:cursor-not-allowed">
          <IconSeta className={`transition-transform duration-200 ease-out ${cal.pos ? 'rotate-180' : ''}`} />
        </button>
      </div>
      {cal.pos && createPortal(
        <div ref={cal.popRef} style={{ position: 'fixed', ...cal.pos }}
          className="z-[80] animate-pop-in rounded-md border border-elevado bg-elevado shadow-lg sombra-popover">
          <CalendarioData value={value} min={min} max={max} onSelect={escolher} onClear={() => { onChange(''); setTexto(''); cal.fechar(); }} />
        </div>,
        document.body,
      )}
    </div>
  );
}

export function CampoMes({ value, onChange, disabled, min, max, compacto = false, vazio = 'mês', limpavel = false, rotuloLimpar, className }) {
  const cal = useCalendario();
  return (
    <Campo cal={cal} texto={fmtMes(value)} vazio={vazio} disabled={disabled} compacto={compacto} className={className}>
      <CalendarioMes value={value} min={min} max={max} rotuloLimpar={rotuloLimpar}
        onSelect={(comp) => { onChange(comp); cal.fechar(); }}
        onClear={limpavel ? () => { onChange(''); cal.fechar(); } : undefined} />
    </Campo>
  );
}
