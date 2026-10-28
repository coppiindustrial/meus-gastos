import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import CalendarioData from './CalendarioData.jsx';
import CalendarioMes from './CalendarioMes.jsx';
import { IconSeta } from './icons.jsx';
import posicionarPopover from '../lib/posicionarPopover.js';
import useEscape from '../lib/useEscape.js';
import { nomeCompetencia } from '../lib/format.js';

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
  const escolher = (iso) => {
    if ((max && iso > max) || (min && iso < min)) return; // o calendário já não deixa; guarda dupla
    onChange(iso); cal.fechar();
  };
  return (
    <Campo cal={cal} texto={fmtBR(value)} vazio={vazio} disabled={disabled} compacto={compacto} className={className}>
      <CalendarioData value={value} min={min} max={max} onSelect={escolher} onClear={() => { onChange(''); cal.fechar(); }} />
    </Campo>
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
