import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { buscarAtivos } from '../../api/rendaVariavel.js';
import { nomeDoTipo } from '../../lib/rendaVariavel.js';

// O TICKER QUE SE PROCURA PELO NOME (13/11/2026, a pedido: "é difícil achar as ações a não ser que já saiba as siglas"): o
// campo do ticker do cadastro dos ativos. Escrevendo (2 letras ou mais, 300 ms depois da última), a função `cotacoes` procura
// na busca do Yahoo pelo nome OU pelo ticker ("nvidia" → NVDA, "maxi renda" → MXRF11) e a lista abre embaixo, portada ao body
// (como a do `SelectBusca`): o ticker, o nome, o tipo e a bolsa. ↑ ↓ e Enter escolhem, Esc fecha; escolher preenche o ticker,
// o tipo e o nome (`onEscolher`). Sem escolher, o que foi escrito fica como o ticker (o de antes: conferido ao sair).

export default function CampoTicker({ value, onChange, onEscolher, onBlur, disabled, autoFocus, erro = false }) {
  const ref = useRef(null);
  const [aberto, setAberto] = useState(false);
  const [itens, setItens] = useState([]);
  const [estado, setEstado] = useState('quieto'); // 'quieto' | 'buscando' | 'pronto' | 'erro'
  const [ativo, setAtivo] = useState(0);
  const [pos, setPos] = useState(null);
  const digitou = useRef(false);

  // a busca, 300 ms depois da última letra; a resposta velha (de uma letra antes) é ignorada
  useEffect(() => {
    if (!digitou.current) return undefined;
    const q = value.trim();
    if (q.length < 2) { setItens([]); setEstado('quieto'); return undefined; }
    let vivo = true;
    setEstado('buscando');
    const t = setTimeout(async () => {
      const r = await buscarAtivos(q);
      if (!vivo) return;
      if (r?.erro) { setItens([]); setEstado('erro'); return; }
      setItens(r?.itens ?? []);
      setAtivo(0);
      setEstado('pronto');
    }, 300);
    return () => { vivo = false; clearTimeout(t); };
  }, [value]);

  // a lista vai embaixo do campo (por cima do pop-up), refeita ao rolar e ao mudar a janela
  useLayoutEffect(() => {
    if (!aberto) return undefined;
    const medir = () => { const r = ref.current?.getBoundingClientRect(); if (r) setPos({ left: r.left, top: r.bottom + 4, largura: Math.max(380, r.width) }); };
    medir();
    window.addEventListener('resize', medir);
    window.addEventListener('scroll', medir, true);
    return () => { window.removeEventListener('resize', medir); window.removeEventListener('scroll', medir, true); };
  }, [aberto]);

  const escolher = (it) => { onEscolher(it); setAberto(false); digitou.current = false; setItens([]); setEstado('quieto'); };
  const tecla = (e) => {
    if (!aberto || !itens.length) { if (e.key === 'Escape') setAberto(false); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setAtivo((a) => Math.min(itens.length - 1, a + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setAtivo((a) => Math.max(0, a - 1)); }
    else if (e.key === 'Enter') { e.preventDefault(); escolher(itens[ativo]); }
    else if (e.key === 'Escape') { e.stopPropagation(); setAberto(false); }
  };
  const mostrar = aberto && value.trim().length >= 2 && estado !== 'quieto';

  return (
    <>
      <input ref={ref} className={`input !h-8 !py-1 font-semibold uppercase placeholder:font-normal placeholder:normal-case ${erro ? '!border-red-400' : ''}`}
        value={value} placeholder="MU ou o nome (micron)" disabled={disabled} autoFocus={autoFocus} autoComplete="off" spellCheck={false}
        role="combobox" aria-expanded={mostrar} aria-autocomplete="list"
        onChange={(e) => { digitou.current = true; setAberto(true); onChange(e.target.value.toUpperCase()); }}
        onKeyDown={tecla} onBlur={() => { setAberto(false); onBlur?.(); }} />
      {mostrar && pos && createPortal(
        <div role="listbox" style={{ position: 'fixed', left: pos.left, top: pos.top, width: pos.largura }}
          className="z-[75] animate-pop-in rounded-[4px] border border-elevado bg-elevado p-1.5 shadow-[0_14px_34px_rgba(20,28,44,.15),0_3px_8px_rgba(20,28,44,.06)] sombra-popover">
          {estado === 'buscando' && !itens.length && <p className="px-3 py-2 text-[12.5px] text-gray-400">Procurando…</p>}
          {estado === 'erro' && <p className="px-3 py-2 text-[12.5px] text-gray-400">A busca não respondeu agora; escreva o ticker.</p>}
          {estado === 'pronto' && !itens.length && <p className="px-3 py-2 text-[12.5px] text-gray-400">Nada com esse nome nas bolsas dos EUA nem na B3.</p>}
          {itens.map((it, i) => (
            <button key={`${it.mercado}:${it.ticker}`} type="button" role="option" aria-selected={i === ativo}
              onMouseDown={(e) => e.preventDefault()} onMouseEnter={() => setAtivo(i)} onClick={() => escolher(it)}
              className={`flex w-full items-baseline gap-2.5 rounded-[3px] px-2.5 py-1.5 text-left transition-colors ${i === ativo ? 'bg-gray-100' : ''}`}>
              <span className="w-[64px] shrink-0 text-[13px] font-semibold text-gray-900">{it.ticker}</span>
              <span className="min-w-0 flex-1 truncate text-[12.5px] text-gray-700">{it.nome || '—'}</span>
              <span className="shrink-0 whitespace-nowrap text-[11px] text-gray-400">{nomeDoTipo(it.tipo)} · {it.bolsa}</span>
            </button>
          ))}
          {estado === 'pronto' && itens.length > 0 && <p className="mt-1 border-t border-gray-100 px-2.5 pb-0.5 pt-1.5 text-[11px] text-gray-400">A busca do Yahoo · o tipo é um palpite: confira ao lado</p>}
        </div>,
        document.body,
      )}
    </>
  );
}
