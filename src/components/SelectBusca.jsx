import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import SearchInput from './SearchInput.jsx';
import { IconSeta } from './icons.jsx';
import posicionarPopover from '../lib/posicionarPopover.js';
import useEscape from '../lib/useEscape.js';

// SELECT COM BUSCA E GRUPOS, no molde do `SeletorPessoa` do Gestor Coppi:
//   · a lista é PORTADA ao body (não é recortada por cartão com `overflow-hidden` — o defeito da
//     tela do extrato, onde a lista abria dentro do cartão e sumia);
//   · busca com o cursor já dentro, sem acento ("agua" acha "Água") e também pelo nome do grupo;
//   · opções agrupadas (cabeçalho com a cor do grupo), na ordem em que chegam;
//   · teclado: ↑/↓ andam, Enter escolhe, Esc fecha.
//
// `opcoes`: [{ value, label, grupo?: { nome, cor }, cor? }]. As sem `grupo` aparecem antes de todos os
// grupos (ex.: "Sem categoria", "Ignorar sempre").
// `semBusca`: lista curta (cartão, mês, tipo) — sem o campo de busca, e com a largura do próprio campo.
// É o que o `SelectSimples` usa: os seletores do app têm uma implementação só.
// `acao`: { rotulo(q), onClick(q) } — um botão fixo no pé da lista ("+ Criar categoria"), que recebe o
// texto da busca. A lista fecha antes de chamar.
const norm = (s) => String(s ?? '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();
const LARGURA_MIN = 320;
const ALTURA = 400;

export default function SelectBusca({
  value, onChange, opcoes, placeholder = 'Selecione…', buscaPlaceholder = 'Buscar…', className = '', disabled = false, semBusca = false, acao,
}) {
  const [aberto, setAberto] = useState(false);
  const [pos, setPos] = useState(null);
  const [largura, setLargura] = useState(LARGURA_MIN);
  const [q, setQ] = useState('');
  const [ativo, setAtivo] = useState(0);
  const btnRef = useRef(null);
  const menuRef = useRef(null);
  const listaRef = useRef(null);

  const sel = opcoes.find((o) => String(o.value) === String(value ?? ''));

  // O que aparece: filtrado pela busca, e na ordem de exibição (soltas primeiro, depois por grupo).
  const visiveis = useMemo(() => {
    const t = norm(q);
    const pega = (o) => !t || norm(o.label).includes(t) || norm(o.grupo?.nome).includes(t);
    const soltas = opcoes.filter((o) => !o.grupo && pega(o));
    const grupos = [];
    opcoes.filter((o) => o.grupo && pega(o)).forEach((o) => {
      let g = grupos.find((x) => x.nome === o.grupo.nome);
      if (!g) { g = { nome: o.grupo.nome, cor: o.grupo.cor, itens: [] }; grupos.push(g); }
      g.itens.push(o);
    });
    return { soltas, grupos, lista: [...soltas, ...grupos.flatMap((g) => g.itens)] };
  }, [opcoes, q]);

  useEffect(() => { setAtivo(0); }, [q]);
  useEffect(() => {
    if (aberto) listaRef.current?.querySelector(`[data-i="${ativo}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [ativo, aberto]);

  useEscape(aberto, () => setAberto(false));
  useEffect(() => {
    if (!aberto) return undefined;
    const fora = (e) => {
      if (btnRef.current?.contains(e.target) || menuRef.current?.contains(e.target)) return;
      setAberto(false);
    };
    const fechar = () => setAberto(false);
    // A lista é `fixed`: rolar a PÁGINA (ou o modal) a descolaria do gatilho, então fecha. Rolar dentro
    // da própria lista, não.
    const aoRolar = (e) => { if (!menuRef.current?.contains(e.target)) setAberto(false); };
    document.addEventListener('mousedown', fora);
    window.addEventListener('resize', fechar);
    window.addEventListener('scroll', aoRolar, true);
    return () => {
      document.removeEventListener('mousedown', fora);
      window.removeEventListener('resize', fechar);
      window.removeEventListener('scroll', aoRolar, true);
    };
  }, [aberto]);

  const abrir = () => {
    if (disabled) return;
    if (aberto) { setAberto(false); return; }
    const larguraCampo = btnRef.current.getBoundingClientRect().width;
    const w = semBusca ? Math.max(180, larguraCampo) : Math.max(LARGURA_MIN, larguraCampo);
    setLargura(w);
    setPos(posicionarPopover(btnRef.current, { largura: w, altura: ALTURA, alinhar: 'esquerda', gap: 4 }));
    setQ('');
    setAtivo(Math.max(0, visiveis.lista.findIndex((o) => String(o.value) === String(value ?? ''))));
    setAberto(true);
    // Sem campo de busca, o foco vai para a própria lista (é quem recebe as setas e o Enter).
    if (semBusca) setTimeout(() => menuRef.current?.focus(), 0);
  };

  const escolher = (o) => { setAberto(false); onChange(o.value); btnRef.current?.focus(); };

  const teclas = (e) => {
    const n = visiveis.lista.length;
    if (e.key === 'ArrowDown') { e.preventDefault(); setAtivo((i) => Math.min(i + 1, n - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setAtivo((i) => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); if (visiveis.lista[ativo]) escolher(visiveis.lista[ativo]); }
  };

  let i = -1; // índice corrido (para o teclado), atravessando os grupos
  const linha = (o) => {
    i += 1;
    const idx = i;
    const marcado = String(o.value) === String(value ?? '');
    return (
      <button key={`${o.value}`} type="button" role="option" aria-selected={marcado} data-i={idx}
        onMouseEnter={() => setAtivo(idx)} onClick={() => escolher(o)}
        className={`flex w-full items-center gap-2.5 rounded-[3px] px-3 py-2 text-left text-[13.5px] transition-colors ${
          idx === ativo ? 'bg-gray-100 text-gray-900' : 'text-gray-700'} ${marcado ? 'font-semibold' : ''}`}>
        {o.cor && <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: o.cor }} />}
        <span className="min-w-0 flex-1 truncate">{o.label}</span>
        {marcado && (
          <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 text-gray-800" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
        )}
      </button>
    );
  };

  return (
    <div className={className}>
      <button ref={btnRef} type="button" onClick={abrir} disabled={disabled} aria-haspopup="listbox" aria-expanded={aberto}
        className={`input flex items-center justify-between gap-2 text-left ${disabled ? 'cursor-not-allowed opacity-50' : ''}`}>
        <span className={`flex min-w-0 items-center gap-2 ${sel ? 'text-gray-800' : 'text-gray-400'}`}>
          {sel?.grupo?.cor && <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: sel.grupo.cor }} />}
          <span className="truncate">{sel ? sel.label : placeholder}</span>
          {sel?.grupo && <span className="hidden shrink-0 text-gray-400 sm:inline">· {sel.grupo.nome}</span>}
        </span>
        <IconSeta className={`shrink-0 text-gray-400 transition-transform duration-200 ${aberto ? 'rotate-180' : ''}`} />
      </button>

      {aberto && pos && createPortal(
        <div ref={menuRef} role="listbox" tabIndex={-1} style={{ position: 'fixed', ...pos, width: largura }} onKeyDown={teclas}
          className="z-[75] animate-pop-in rounded-[4px] border border-elevado bg-elevado p-2.5 outline-none shadow-[0_14px_34px_rgba(20,28,44,.15),0_3px_8px_rgba(20,28,44,.06)] sombra-popover">
          {!semBusca && <SearchInput autoFocus placeholder={buscaPlaceholder} value={q} onChange={(e) => setQ(e.target.value)} />}
          <div ref={listaRef} className={`${semBusca ? '' : 'mt-2 '}max-h-[320px] overflow-y-auto overflow-x-hidden scrollbar-thin`}>
            {visiveis.lista.length === 0 && <p className="px-3 py-2 text-[13px] text-gray-400">Nada com esse nome{acao ? ' — crie abaixo.' : '.'}</p>}
            {visiveis.soltas.map(linha)}
            {visiveis.soltas.length > 0 && visiveis.grupos.length > 0 && <div className="my-1.5 h-px bg-gray-100" />}
            {visiveis.grupos.map((g) => (
              <div key={g.nome} className="mb-1">
                <div className="flex items-center gap-2 px-3 pb-1 pt-2 text-[11px] font-bold uppercase tracking-[0.06em] text-gray-500">
                  <span className="h-2 w-2 rounded-full" style={{ background: g.cor }} />{g.nome}
                </div>
                {g.itens.map(linha)}
              </div>
            ))}
          </div>
          {acao && (
            <div className="mt-1.5 border-t border-gray-100 pt-1.5">
              <button type="button" onClick={() => { setAberto(false); acao.onClick(q.trim()); }}
                className="flex w-full items-center gap-2.5 rounded-[3px] px-3 py-2 text-left text-[13.5px] font-medium text-gray-800 transition-colors hover:bg-gray-100">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-dashed border-gray-400 text-gray-500">+</span>
                <span className="min-w-0 flex-1 truncate">{acao.rotulo(q.trim())}</span>
              </button>
            </div>
          )}
        </div>,
        document.body,
      )}
    </div>
  );
}

// As categorias no formato do SelectBusca: agrupadas pelo grupo (na ordem do cadastro) e em ordem
// alfabética dentro dele. `tipo` ('saida' | 'entrada') filtra; inativas só entram se forem a atual.
export function opcoesCategoria(categorias, { tipo, atual, incluirInativas = false } = {}) {
  return categorias
    .filter((c) => (!tipo || c.grupo.tipo === tipo) && (incluirInativas || c.ativa || c.id === atual))
    .sort((a, b) => (a.grupo.tipo === b.grupo.tipo ? 0 : a.grupo.tipo === 'saida' ? -1 : 1)
      || (a.grupo.ordem ?? 0) - (b.grupo.ordem ?? 0)
      || a.grupo.nome.localeCompare(b.grupo.nome, 'pt-BR')
      || a.nome.localeCompare(b.nome, 'pt-BR'))
    .map((c) => ({ value: c.id, label: c.nome, grupo: { nome: c.grupo.nome, cor: c.grupo.cor } }));
}
