import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import useEscape from '../lib/useEscape.js';

// O MENU DE BOTÃO DIREITO, copiado do DRE do Gestor (`components/dre/MenuContexto.jsx`): título no topo,
// separadores entre os grupos, o ATALHO à direita e seta nos submenus. As regras de item são as de lá:
//   · o que não se aplica AGORA fica em cinza, com o motivo embaixo (item que some sem explicação é
//     pior que um que diz por que não serve);
//   · ação que perde algo (Excluir) vai em vermelho, e a confirmação é de quem a executa.
//
// ITEM: `{ rotulo, icone, atalho, sub, desabilitado, motivo, perigo, filhos, onEscolher }` ou `{ sep: true }`.
// TECLADO: ↑/↓ andam pulando separadores e desabilitados, → abre o submenu e ← o fecha, Enter escolhe,
// Tab e Esc fecham. FECHA no clique fora, na rolagem, no resize e quando a janela perde o foco: ele é
// posicionado por coordenada no instante em que abre.
const MARGEM = 8;
const ativavel = (it) => it && !it.sep && !it.desabilitado;

const IcoSubmenu = () => (
  <svg viewBox="0 0 24 24" className="ml-2 mt-[2px] h-3 w-3 shrink-0 text-gray-400" fill="none" stroke="currentColor"
    strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M9 6l6 6-6 6" />
  </svg>
);

function Itens({ itens, ativo, onHover, onEscolher, refs, subAberto }) {
  const comIcone = itens.some((it) => !it.sep && it.icone);
  return itens.map((it, i) => {
    if (it.sep) return <div key={i} role="separator" className="-mx-1 my-1 h-px bg-divisoria" />;
    return (
      <button key={i} type="button" tabIndex={-1} role="menuitem"
        ref={refs ? (el) => { refs.current[i] = el; } : undefined}
        aria-disabled={it.desabilitado || undefined}
        aria-haspopup={it.filhos ? 'menu' : undefined}
        aria-expanded={it.filhos ? subAberto === i : undefined}
        onMouseEnter={() => onHover(i)}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => onEscolher(i)}
        className={`flex w-full items-start gap-2.5 rounded-[2px] px-2.5 py-[7px] text-left text-[12.5px] leading-[1.35] outline-none
          ${ativo === i ? 'bg-hx-f4f5f7' : ''}
          ${it.desabilitado ? 'cursor-default text-gray-400' : it.perigo ? 'text-hx-b91c1c' : 'text-gray-700'}`}>
        {comIcone && (
          <span className={`mt-px flex h-[14px] w-[14px] shrink-0 items-center justify-center
            ${it.desabilitado ? 'text-gray-300' : it.perigo ? 'text-hx-dc2626' : 'text-gray-400'}`}>
            {it.icone}
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="block">{it.rotulo}</span>
          {(it.motivo || it.sub) && <span className="block text-[11px] leading-[1.35] text-gray-400">{it.motivo || it.sub}</span>}
        </span>
        {it.atalho && <span className="ml-3 mt-px shrink-0 text-[11px] text-gray-400">{it.atalho}</span>}
        {it.filhos && <IcoSubmenu />}
      </button>
    );
  });
}

// O próximo item escolhível na direção `passo`, dando a volta na lista.
function proximo(lista, atual, passo) {
  const n = lista.length;
  if (!n) return -1;
  let i = atual;
  for (let k = 0; k < n; k++) {
    i = (i + passo + n) % n;
    if (ativavel(lista[i])) return i;
  }
  return atual;
}

// `menu`: `{ x, y, titulo, itens }` ou null. `x`/`y` são coordenadas de JANELA (o cursor).
export default function MenuContexto({ menu, onFechar }) {
  const painelRef = useRef(null);
  const subRef = useRef(null);
  const itemRefs = useRef([]);
  const [pos, setPos] = useState(null);
  const [ativo, setAtivo] = useState(-1);
  const [sub, setSub] = useState(null); // { i, ativo, pos }
  const aberto = !!menu;
  const itens = menu?.itens ?? [];
  const fecharRef = useRef(onFechar);
  fecharRef.current = onFechar;

  useLayoutEffect(() => { setAtivo(-1); setSub(null); setPos(null); itemRefs.current = []; }, [menu]);

  // Mede o painel já desenhado (invisível) e vira para caber na janela. `offsetWidth`, e não o rect:
  // no 1º quadro do `animate-pop-in` o painel está em `scale(0.97)`.
  useLayoutEffect(() => {
    if (!menu || pos) return;
    const el = painelRef.current;
    if (!el) return;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    let left = menu.x;
    if (left + w > window.innerWidth - MARGEM) left = menu.x - w;
    left = Math.max(MARGEM, Math.min(left, window.innerWidth - MARGEM - w));
    let top = menu.y;
    if (top + h > window.innerHeight - MARGEM) top = Math.max(MARGEM, menu.y - h);
    setPos({ left, top });
  }, [menu, pos]);

  useLayoutEffect(() => {
    if (!sub || sub.pos) return;
    const el = subRef.current;
    const anc = itemRefs.current[sub.i];
    if (!el || !anc) return;
    const a = anc.getBoundingClientRect();
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    let left = a.right + 2;
    if (left + w > window.innerWidth - MARGEM) left = Math.max(MARGEM, a.left - w - 2);
    let top = a.top - 5;
    if (top + h > window.innerHeight - MARGEM) top = Math.max(MARGEM, window.innerHeight - MARGEM - h);
    setSub((s) => (s && s.i === sub.i ? { ...s, pos: { left, top } } : s));
  }, [sub]);

  const posicionado = !!pos;
  useEffect(() => {
    if (aberto && posicionado) painelRef.current?.focus({ preventScroll: true });
  }, [aberto, posicionado]);

  useEffect(() => {
    if (!aberto) return undefined;
    const antes = document.activeElement;
    const dentro = (t) => t instanceof Node && (painelRef.current?.contains(t) || subRef.current?.contains(t));
    const clique = (e) => { if (!dentro(e.target)) fecharRef.current(); };
    const rolar = (e) => { if (!dentro(e.target)) fecharRef.current(); };
    const fechar = () => fecharRef.current();
    document.addEventListener('mousedown', clique);
    window.addEventListener('scroll', rolar, true);
    window.addEventListener('resize', fechar);
    window.addEventListener('blur', fechar);
    return () => {
      document.removeEventListener('mousedown', clique);
      window.removeEventListener('scroll', rolar, true);
      window.removeEventListener('resize', fechar);
      window.removeEventListener('blur', fechar);
      // O foco volta para onde estava (a grade), se ninguém o levou para outro lugar.
      if (antes instanceof HTMLElement && (document.activeElement === document.body || document.activeElement == null)) {
        antes.focus({ preventScroll: true });
      }
    };
  }, [aberto]);

  useEscape(aberto, () => { if (sub) setSub(null); else onFechar(); });

  if (!menu) return null;

  const abrirSub = (i, focar = false) => {
    const it = itens[i];
    if (!it?.filhos || it.desabilitado) return;
    if (sub?.i === i) { if (focar) setSub((s) => ({ ...s, ativo: s.ativo >= 0 ? s.ativo : proximo(it.filhos, -1, 1) })); return; }
    setSub({ i, ativo: focar ? proximo(it.filhos, -1, 1) : -1, pos: null });
  };

  const escolherEm = (lista, i) => {
    const it = lista[i];
    if (!ativavel(it)) return;
    if (it.filhos) { abrirSub(i, true); return; }
    onFechar();
    it.onEscolher?.();
  };

  const teclar = (e) => {
    const k = e.key;
    if (k === 'Tab') { e.preventDefault(); onFechar(); return; }
    const noSub = sub && sub.ativo >= 0;
    const lista = noSub ? itens[sub.i].filhos : itens;
    const atual = noSub ? sub.ativo : ativo;
    const mover = (n) => (noSub ? setSub((s) => ({ ...s, ativo: n })) : setAtivo(n));
    if (k === 'ArrowDown' || k === 'ArrowUp') { e.preventDefault(); mover(proximo(lista, atual, k === 'ArrowDown' ? 1 : -1)); }
    else if (k === 'ArrowRight' && !noSub) { e.preventDefault(); abrirSub(atual, true); }
    else if (k === 'ArrowLeft' && noSub) { e.preventDefault(); setSub(null); }
    else if (k === 'Enter' || k === ' ') { e.preventDefault(); escolherEm(lista, atual); }
  };

  return createPortal(
    <>
      <div ref={painelRef} role="menu" tabIndex={-1} onKeyDown={teclar} aria-label={menu.titulo || 'Ações'}
        style={{ position: 'fixed', left: pos?.left ?? 0, top: pos?.top ?? 0, visibility: pos ? 'visible' : 'hidden' }}
        className="z-[65] w-max min-w-[240px] max-w-[340px] animate-pop-in rounded-[4px] border border-elevado bg-elevado p-1 shadow-lg sombra-popover outline-none">
        {menu.titulo && (
          <div className="truncate px-2.5 pb-1 pt-1.5 text-[10.5px] font-semibold uppercase tracking-[0.04em] text-gray-400">{menu.titulo}</div>
        )}
        <Itens itens={itens} ativo={ativo} refs={itemRefs} subAberto={sub?.i}
          onHover={(i) => { setAtivo(i); if (itens[i]?.filhos && !itens[i].desabilitado) abrirSub(i); else setSub(null); }}
          onEscolher={(i) => escolherEm(itens, i)} />
      </div>
      {sub && itens[sub.i]?.filhos && (
        <div ref={subRef} role="menu" aria-label={itens[sub.i].rotulo}
          style={{ position: 'fixed', left: sub.pos?.left ?? 0, top: sub.pos?.top ?? 0, visibility: sub.pos ? 'visible' : 'hidden' }}
          className="z-[65] max-h-[60vh] w-max min-w-[190px] max-w-[320px] overflow-y-auto rounded-[4px] border border-elevado bg-elevado p-1 shadow-lg sombra-popover scrollbar-thin">
          <Itens itens={itens[sub.i].filhos} ativo={sub.ativo}
            onHover={(i) => setSub((s) => ({ ...s, ativo: i }))}
            onEscolher={(i) => escolherEm(itens[sub.i].filhos, i)} />
        </div>
      )}
    </>,
    document.body,
  );
}
