import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useVoltarFecha } from '../../lib/celular.js';

// A GAVETA (lado `esquerda`) e a FOLHA de baixo (lado `baixo`) do celular — COPIADO do Gestor
// (`pages/movel/PainelMovel.jsx` de lá), com a física do "Meu treino": entra com mola, segue o dedo e fecha
// arrastando — solto longe o bastante (110px) ou com um puxão rápido (> 0,6 px/ms depois de 30px), sai e fecha;
// senão volta para o lugar. O fundo clareia conforme o painel sai. Fica MONTADO na saída (220ms) para ela animar.
// O voltar do aparelho fecha só o painel de cima (`useVoltarFecha`); o Esc fica com quem abre (`useEscape`).
// Tudo em CSS (`index.css`, bloco "o app no celular") e Pointer Events, sem biblioteca.
const SAIDA_MS = 220;

let abertos = 0; // trava a rolagem da página com qualquer painel aberto (painel sobre painel)

// `z`: a camada. O padrão (z-50) fica acima do topo; a folha que abre POR CIMA de uma tela cheia (o `Modal` do
// celular, z-[60]) passa a sua.
export default function PainelMovel({ aberto, onFechar, lado = 'baixo', rotulo, className = '', z = 'z-50', children }) {
  const [montado, setMontado] = useState(aberto);
  const [fechando, setFechando] = useState(false);
  const [arrasto, setArrasto] = useState(0);
  const pegada = useRef(null);
  const vertical = lado === 'baixo';
  useVoltarFecha(aberto, onFechar);

  useEffect(() => {
    if (aberto) {
      setMontado(true); setFechando(false); setArrasto(0);
      return undefined;
    }
    if (!montado) return undefined;
    setFechando(true);
    const t = setTimeout(() => { setMontado(false); setFechando(false); setArrasto(0); }, SAIDA_MS);
    return () => clearTimeout(t);
  }, [aberto]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!montado) return undefined;
    abertos += 1;
    document.body.style.overflow = 'hidden';
    return () => {
      abertos = Math.max(0, abertos - 1);
      if (abertos === 0) document.body.style.overflow = '';
    };
  }, [montado]);

  if (!montado) return null;

  // O deslocamento NO SENTIDO DE FECHAR é positivo: para baixo na folha, para a esquerda na gaveta. No sentido
  // contrário há resistência (÷4), como um elástico.
  const medir = (e, g = pegada.current) => (vertical ? e.clientY - g.y : g.x - e.clientX);
  const aoDescer = (e) => {
    pegada.current = { x: e.clientX, y: e.clientY, t: performance.now(), id: e.pointerId, ativo: false };
  };
  const aoMover = (e) => {
    const g = pegada.current;
    if (!g || g.id !== e.pointerId) return;
    const d = medir(e);
    if (!g.ativo) {
      // Na gaveta, só vira arrasto se o gesto for mais horizontal que vertical (senão é rolagem).
      const outro = vertical ? Math.abs(e.clientX - g.x) : Math.abs(e.clientY - g.y);
      if (Math.abs(d) < 6 || (!vertical && outro > Math.abs(d))) {
        if (!vertical && outro > 10) pegada.current = null;
        return;
      }
      g.ativo = true;
      try { e.currentTarget.setPointerCapture?.(e.pointerId); } catch { /* ponteiro já solto: segue sem captura */ }
    }
    setArrasto(d > 0 ? d : d / 4);
  };
  const aoSoltar = (e) => {
    const g = pegada.current;
    pegada.current = null;
    if (!g || !g.ativo) return;
    const d = medir(e, g);
    const vel = d / Math.max(1, performance.now() - g.t);
    if (d > 110 || (d > 30 && vel > 0.6)) onFechar();
    else setArrasto(0);
  };
  const aoCancelar = () => { pegada.current = null; setArrasto(0); };

  const arrastando = !!pegada.current?.ativo;
  const escurece = fechando ? 0 : Math.max(0, 1 - Math.max(0, arrasto) / 400);
  const fora = vertical ? 'translateY(100%)' : 'translateX(-100%)';
  const transform = fechando ? fora
    : arrasto ? (vertical ? `translateY(${arrasto}px)` : `translateX(${-arrasto}px)`) : undefined;
  const gestos = { onPointerDown: aoDescer, onPointerMove: aoMover, onPointerUp: aoSoltar, onPointerCancel: aoCancelar };

  return createPortal(
    <div className={`fixed inset-0 ${z}`}>
      <div className="painel-movel-veu absolute inset-0" style={{ '--escurece': escurece }} onClick={onFechar} aria-hidden="true" />
      <div role="dialog" aria-modal="true" aria-label={rotulo}
        className={`painel-movel ${vertical ? 'painel-movel-baixo' : 'painel-movel-esquerda'} ${arrastando ? 'arrastando' : ''} ${className}`}
        style={transform ? { transform } : undefined}
        {...(vertical ? {} : gestos)}>
        {vertical && (
          // A ALÇA (e a faixa em volta dela) é a área de arrastar da folha — o resto rola e toca normal.
          <div className="flex touch-none justify-center pb-3 pt-1" {...gestos}>
            <div className="h-[5px] w-[40px] rounded-full bg-gray-300" aria-hidden="true" />
          </div>
        )}
        {children}
      </div>
    </div>,
    document.body,
  );
}
