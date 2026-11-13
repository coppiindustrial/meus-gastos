import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { buscarAtivos } from '../../api/rendaVariavel.js';
import { CLASSES, classeDoTipo, nomeDoTipo } from '../../lib/rendaVariavel.js';
import { lsGet, lsSet } from '../../lib/storage.js';

// O SELETOR DE AÇÃO DO PAINEL (13/11/2026, a opção B do mockup "Ver o gráfico de qualquer ação": o título do painel é o
// seletor). Abre embaixo do título ("MU · Micron ▾") e pelo "Ver o gráfico de uma ação…" do ▾ da Renda variável. Em cima, NA
// SUA CARTEIRA (os ativos cadastrados, com o dia); sem nada escrito, as VISTAS HÁ POUCO (as 5 últimas de fora do cadastro,
// guardadas no navegador — só o ticker, o mercado, o nome e o tipo); escrevendo, OUTRAS AÇÕES pela busca do Yahoo (a mesma
// do cadastro: "nvidia" → NVDA). ↑ ↓ e Enter escolhem, Esc fecha. `onEscolher({ ticker, mercado, nome, tipo, ativoId? })`.

const CHAVE_VISTAS = 'rv_vistas';
const MAX_VISTAS = 5;
export function lerVistas() {
  try { const v = JSON.parse(lsGet(CHAVE_VISTAS) ?? '[]'); return Array.isArray(v) ? v.slice(0, MAX_VISTAS) : []; } catch { return []; }
}
// guarda a ação de fora do cadastro aberta agora no topo das vistas
export function lembrarVista(it) {
  const novo = { ticker: it.ticker, mercado: it.mercado, nome: it.nome ?? '', tipo: it.tipo };
  const resto = lerVistas().filter((x) => !(x.ticker === it.ticker && x.mercado === it.mercado));
  lsSet(CHAVE_VISTAS, JSON.stringify([novo, ...resto].slice(0, MAX_VISTAS)));
}
const pct = (f) => (f === null || f === undefined || !Number.isFinite(f) ? '' : `${f > 0 ? '+' : f < 0 ? '−' : ''}${Math.abs(f * 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`);
const bolsaDe = (it) => it.bolsa ?? (it.mercado === 'EUA' ? 'EUA' : 'B3');
const casa = (it, t) => !t || it.ticker.toLowerCase().includes(t) || (it.nome ?? '').toLowerCase().includes(t);

export default function SeletorAtivo({ ancora, posicoes, atual, onEscolher, onFechar }) {
  const caixaRef = useRef(null);
  const inputRef = useRef(null);
  const [q, setQ] = useState('');
  const [busca, setBusca] = useState({ estado: 'quieto', itens: [] });
  const [ativo, setAtivo] = useState(0);
  const [pos, setPos] = useState(null);

  // embaixo do título, refeito ao rolar e ao mudar a janela
  useLayoutEffect(() => {
    const medir = () => { const r = ancora?.getBoundingClientRect(); if (r) setPos({ left: Math.max(8, Math.min(r.left, window.innerWidth - 468)), top: r.bottom + 6 }); };
    medir();
    window.addEventListener('resize', medir);
    window.addEventListener('scroll', medir, true);
    return () => { window.removeEventListener('resize', medir); window.removeEventListener('scroll', medir, true); };
  }, [ancora]);
  useEffect(() => { inputRef.current?.focus(); }, []);
  // fora da caixa (e fora do título, que alterna sozinho), fecha
  useEffect(() => {
    const fora = (e) => { if (!caixaRef.current?.contains(e.target) && !ancora?.contains(e.target)) onFechar(); };
    document.addEventListener('mousedown', fora);
    return () => document.removeEventListener('mousedown', fora);
  }, [ancora, onFechar]);

  // a busca, 300 ms depois da última letra
  useEffect(() => {
    const t = q.trim();
    if (t.length < 2) { setBusca({ estado: 'quieto', itens: [] }); return undefined; }
    let vivo = true;
    setBusca((b) => ({ ...b, estado: 'buscando' }));
    const tm = setTimeout(async () => {
      const r = await buscarAtivos(t);
      if (vivo) setBusca(r?.erro ? { estado: 'erro', itens: [] } : { estado: 'pronto', itens: r?.itens ?? [] });
    }, 300);
    return () => { vivo = false; clearTimeout(tm); };
  }, [q]);

  const t = q.trim().toLowerCase();
  const cadastrados = posicoes.map((p) => ({ ticker: p.ativo.ticker, mercado: p.ativo.mercado, nome: p.ativo.nome, tipo: p.ativo.tipo, ativoId: p.ativo.id, dia: p.variacaoDia }));
  const doCadastro = (it) => cadastrados.find((c) => c.ticker === it.ticker && c.mercado === it.mercado);
  const secoes = [];
  const naCarteira = cadastrados.filter((c) => casa(c, t));
  if (naCarteira.length) secoes.push({ titulo: 'Na sua carteira', cor: 'var(--serie-gastos)', itens: naCarteira });
  if (!t) {
    const vistas = lerVistas().filter((v) => !doCadastro(v));
    if (vistas.length) secoes.push({ titulo: 'Vistas há pouco', cor: 'var(--origem-manual)', itens: vistas });
  } else {
    const outras = busca.itens.filter((it) => !doCadastro(it));
    if (outras.length) secoes.push({ titulo: 'Outras ações', cor: 'var(--serie-sobrou)', itens: outras });
  }
  const lista = secoes.flatMap((s) => s.itens);
  useEffect(() => { setAtivo(0); }, [q, busca.itens.length]);

  const tecla = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setAtivo((a) => Math.min(lista.length - 1, a + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setAtivo((a) => Math.max(0, a - 1)); }
    else if (e.key === 'Enter' && lista[ativo]) { e.preventDefault(); onEscolher(lista[ativo]); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onFechar(); }
  };
  const ehAtual = (it) => atual && it.ticker === atual.ticker && it.mercado === atual.mercado;
  let i = -1;

  if (!pos) return null;
  return createPortal(
    <div ref={caixaRef} role="dialog" aria-label="Escolher a ação" style={{ position: 'fixed', left: pos.left, top: pos.top, width: 460, maxWidth: 'calc(100vw - 16px)' }}
      className="z-[75] animate-pop-in rounded-[6px] border border-elevado bg-elevado p-2.5 shadow-[0_14px_34px_rgba(20,28,44,.15),0_3px_8px_rgba(20,28,44,.06)] sombra-popover">
      <label className="flex h-[34px] items-center gap-2 rounded-[6px] border border-gray-300 bg-white px-2.5 transition-[border-color,box-shadow] focus-within:border-gray-800 focus-within:ring-1 focus-within:ring-gray-800">
        <svg viewBox="0 0 24 24" className="h-[14px] w-[14px] shrink-0 text-gray-400" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
        <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={tecla} autoComplete="off" spellCheck={false}
          placeholder="Ticker ou nome da empresa (nvidia, petrobras…)" aria-label="Procurar uma ação"
          className="min-w-0 flex-1 border-0 bg-transparent text-[13px] text-gray-800 outline-none placeholder:text-gray-400" />
        <kbd className="rounded-[4px] border border-gray-200 px-1.5 text-[10.5px] leading-[17px] text-gray-400">Esc</kbd>
      </label>
      <div role="listbox" className="mt-2 max-h-[320px] overflow-y-auto scrollbar-thin">
        {secoes.map((s) => (
          <div key={s.titulo} className="mb-1">
            <div className="flex items-center gap-1.5 px-2 pb-1 pt-1.5 text-[10.5px] font-bold uppercase tracking-[0.06em] text-gray-500">
              <span className="h-2 w-2 rounded-full" style={{ background: s.cor }} />{s.titulo}
            </div>
            {s.itens.map((it) => {
              i += 1;
              const k = i;
              const cor = CLASSES.find((c) => c.id === classeDoTipo(it.tipo))?.cor;
              return (
                <button key={`${s.titulo}:${it.mercado}:${it.ticker}`} type="button" role="option" aria-selected={k === ativo}
                  onMouseEnter={() => setAtivo(k)} onClick={() => onEscolher(it)}
                  className={`grid w-full grid-cols-[72px_minmax(0,1fr)_auto] items-baseline gap-2.5 rounded-[3px] px-2 py-1.5 text-left transition-colors ${k === ativo ? 'bg-gray-100' : ''}`}>
                  <span className="flex items-center gap-1.5 text-[13px] font-semibold text-gray-900"><span aria-hidden="true" className="h-[10px] w-[3px] shrink-0 rounded-[1px]" style={{ background: cor }} />{it.ticker}</span>
                  <span className="truncate text-[12.5px] text-gray-700">{it.nome || '—'}{ehAtual(it) ? <span className="text-gray-400"> · aberta</span> : null}</span>
                  <span className="whitespace-nowrap text-[11px] text-gray-400">
                    {nomeDoTipo(it.tipo)} · {bolsaDe(it)}
                    {it.dia !== undefined && it.dia !== null && <b className={`ml-1 font-semibold ${it.dia < 0 ? 'text-hx-c0393d' : 'text-green-700'}`}>{pct(it.dia)}</b>}
                  </span>
                </button>
              );
            })}
          </div>
        ))}
        {t.length === 1 && !naCarteira.length && <p className="px-2 py-2 text-[12.5px] text-gray-400">Escreva mais uma letra…</p>}
        {t.length >= 2 && busca.estado === 'buscando' && !busca.itens.length && <p className="px-2 py-2 text-[12.5px] text-gray-400">Procurando…</p>}
        {t.length >= 2 && busca.estado === 'erro' && <p className="px-2 py-2 text-[12.5px] text-gray-400">A busca não respondeu agora.</p>}
        {t.length >= 2 && busca.estado === 'pronto' && !lista.length && <p className="px-2 py-2 text-[12.5px] text-gray-400">Nada com esse nome nas bolsas dos EUA nem na B3.</p>}
      </div>
      <div className="mt-1.5 flex flex-wrap gap-x-3 border-t border-gray-100 px-2 pt-1.5 text-[11px] text-gray-400">
        <span>↑ ↓ para escolher · Enter abre</span><span>a busca do Yahoo: EUA e B3</span>
      </div>
    </div>,
    document.body,
  );
}
