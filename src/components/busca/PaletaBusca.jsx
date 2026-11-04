import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate } from 'react-router-dom';
import useEscape from '../../lib/useEscape.js';
import useTravarRolagem from '../../lib/travarRolagem.js';
import { lsGet, lsSet } from '../../lib/storage.js';
import useIndiceBusca from '../../lib/useIndiceBusca.js';
import { listarCategorias } from '../../api/cadastros.js';
import { casaPalavras, palavras, resultadosBusca, semAcento } from '../../lib/buscaLancamentos.js';
import { formatBRL } from '../../lib/dinheiro.js';
import { competenciaCurta } from '../../lib/format.js';
import { GRUPOS, SOLTOS } from '../../lib/navegacao.js';

// A BUSCA RÁPIDA (Ctrl+K ou a lupa da barra lateral — 04/11/2026, opção D do mockup "Lançamentos · procurar em todos
// os meses"), COPIADA do buscador global do Gestor (`components/busca/PaletaBusca.jsx` de lá). Uma janela no alto da
// tela: o campo, e embaixo as seções.
//
//   · VAZIO: os lançamentos abertos por aqui ("Abertos recentemente": no navegador só o id e o mês) e as telas.
//   · COM TEXTO: as telas que casam, os LANÇAMENTOS do histórico inteiro (os 8 mais novos e "Ver os N nos
//     Lançamentos") e as CATEGORIAS (abrem os Lançamentos com ela, no histórico inteiro). Diferente do Gestor, a busca
//     é LOCAL: o índice de `useIndiceBusca` (todos os lançamentos, lidos uma vez), na régua de `casaPalavras`.
//
// Abrir um lançamento leva aos Lançamentos no mês dele, com a linha acesa (?mes=&id=). Teclado: ↑/↓ andam, Enter
// abre, Esc fecha (pilha do `useEscape`). Os itens são LINKS de verdade: Ctrl+clique abre em outra aba.

const LS_RECENTES = 'busca_recentes';
const MAX_RECENTES = 6;
const MAX_LANCAMENTOS = 8;

const svg = (children) => function Icone({ className = 'h-[15px] w-[15px]' }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.9"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
  );
};
const IconLupa = svg(<><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></>);
const IconLancamento = svg(<><path d="M8 6h12M8 12h12M8 18h12" /><path d="M4 6h.01M4 12h.01M4 18h.01" /></>);
const IconTodos = svg(<><path d="M4 6h16M4 12h16M4 18h10" /><path d="M17 16l3 2-3 2" /></>);
const IconTela = svg(<><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 9h18" /></>);

// O REALCE do que foi digitado: cada palavra, sem acento, no COMEÇO de uma palavra do texto — a mesma régua de
// `casaPalavras`, para o sublinhado bater com o motivo de o item ter vindo. Dígitos casam em qualquer ponto.
const CLASSES = { a: 'aáàâãäå', e: 'eéèêë', i: 'iíìîï', o: 'oóòôõö', u: 'uúùûü', c: 'cç', n: 'nñ', y: 'yý' };
function realcar(texto, tokens) {
  const s = String(texto ?? '');
  if (!s || !tokens.length) return s;
  const partes = tokens.map((t) => {
    const corpo = [...t].map((ch) => (CLASSES[ch] ? `[${CLASSES[ch]}]` : ch)).join('');
    return /^[0-9]+$/.test(t) ? `(${corpo})` : `((?<![\\p{L}\\p{N}])${corpo})`;
  });
  const re = new RegExp(partes.join('|'), 'giu');
  const out = [];
  let ultimo = 0;
  for (const m of s.matchAll(re)) {
    if (m.index > ultimo) out.push(s.slice(ultimo, m.index));
    out.push(<mark key={m.index} className="bg-transparent font-semibold text-gray-900 underline decoration-blue-500 decoration-2 underline-offset-2">{m[0]}</mark>);
    ultimo = m.index + m[0].length;
  }
  if (ultimo < s.length) out.push(s.slice(ultimo));
  return out;
}

function lerRecentes() {
  try { const l = JSON.parse(lsGet(LS_RECENTES) || '[]'); return Array.isArray(l) ? l : []; } catch { return []; }
}

const Tecla = ({ children }) => (
  <kbd className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-[4px] border border-b-2 border-gray-300 bg-gray-50 px-1 font-sans text-[10.5px] font-medium text-gray-500">{children}</kbd>
);

// As telas do menu, numa lista corrida (o nome e, em cinza, o grupo).
const TELAS = [
  ...SOLTOS.map((t) => ({ id: t.to, nome: t.label, to: t.to, icon: t.icon })),
  ...GRUPOS.flatMap((g) => g.items.map((t) => ({ id: t.to, nome: t.label, modulo: g.label, to: t.to, icon: g.icon }))),
];

const Bolinha = ({ cor }) => <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: cor || '#9ca3af' }} />;
const valorTexto = (l) => (
  <span className={`tabular-nums ${l.tipo === 'entrada' ? 'font-semibold text-green-700' : 'text-gray-700'}`}>
    {l.tipo === 'entrada' ? '+ ' : ''}{formatBRL(l.valor_centavos)}
  </span>
);

export default function PaletaBusca({ aberto, onFechar }) {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const [recentes, setRecentes] = useState(lerRecentes);
  const [categorias, setCategorias] = useState(null);
  const inputRef = useRef(null);
  const listaRef = useRef(null);
  const indice = useIndiceBusca(aberto);

  useEscape(aberto, onFechar);
  useTravarRolagem(aberto);

  // Cada abertura começa limpa, com o campo focado e os recentes relidos.
  useEffect(() => {
    if (!aberto) return;
    setQ(''); setSel(0); setRecentes(lerRecentes());
    requestAnimationFrame(() => inputRef.current?.focus());
    if (!categorias) listarCategorias().then(setCategorias).catch(() => setCategorias([]));
  }, [aberto]);

  const tokens = useMemo(() => palavras(q), [q]);
  const qLimpo = q.trim();
  const buscavel = tokens.length > 0 && qLimpo.length >= 2;
  const achados = useMemo(() => (buscavel && indice ? resultadosBusca(indice, qLimpo, MAX_LANCAMENTOS) : null), [buscavel, indice, qLimpo]);

  // AS SEÇÕES, na ordem da tela: [{ titulo, direita?, itens: [{ key, icone, titulo, direita, to, recente }] }].
  const secoes = useMemo(() => {
    const tela = (t) => ({
      key: `tela-${t.id}`, icone: <t.icon className="h-[13px] w-[13px]" />, to: t.to,
      titulo: <>{realcar(t.nome, tokens)}{t.modulo && <span className="text-gray-400"> · {realcar(t.modulo, tokens)}</span>}</>,
    });
    const lancamento = (l) => ({
      key: `lanc-${l.id}`, icone: <IconLancamento className="h-[13px] w-[13px]" />, to: `/lancamentos?mes=${l.competencia}&id=${l.id}`,
      recente: { id: l.id, competencia: l.competencia },
      titulo: <>{realcar(l.descricao || '—', tokens)}
        <span className="text-gray-400"> · {l.categoria ? realcar(l.categoria.nome, tokens) : 'Sem categoria'}
          {l.cartao && <> · {realcar(l.cartao.nome, tokens)}</>}
          {l.parcela_total ? ` ${l.parcela_atual}/${l.parcela_total}` : ''}</span></>,
      direita: <><span className="text-gray-400">{competenciaCurta(l.competencia)}</span><span className="mx-1.5 text-gray-300">·</span>{valorTexto(l)}</>,
    });
    if (!qLimpo) {
      const lista = [];
      // Os RECENTES guardam só o id e o mês (o navegador não guarda dado financeiro); a linha sai do índice, e o que
      // foi excluído some sozinho.
      const porId = new Map((indice ?? []).map((l) => [l.id, l]));
      const abertos = recentes.map((r) => porId.get(r.id)).filter(Boolean);
      if (abertos.length) lista.push({ titulo: 'Abertos recentemente', itens: abertos.map(lancamento) });
      lista.push({ titulo: 'Telas', itens: TELAS.map(tela) });
      return lista;
    }
    const lista = [];
    const telasQ = tokens.length ? TELAS.filter((t) => casaPalavras(`${t.nome} ${t.modulo ?? ''}`, tokens)) : [];
    if (telasQ.length) lista.push({ titulo: 'Telas', itens: telasQ.map(tela) });
    if (achados?.total) {
      const itens = achados.itens.map(lancamento);
      if (achados.total > achados.itens.length) {
        itens.push({
          key: 'todos', icone: <IconTodos className="h-[13px] w-[13px]" />, to: `/lancamentos?periodo=tudo&busca=${encodeURIComponent(qLimpo)}`,
          titulo: <span className="text-gray-600">Ver os {achados.total.toLocaleString('pt-BR')} nos Lançamentos <span className="text-gray-400">· todo o histórico</span></span>,
        });
      }
      const soma = [achados.gastos > 0 && formatBRL(achados.gastos), achados.entradas > 0 && `+ ${formatBRL(achados.entradas)}`].filter(Boolean).join(' · ');
      lista.push({ titulo: 'Lançamentos', direita: `${achados.total.toLocaleString('pt-BR')} ${achados.total === 1 ? 'achado' : 'achados'}${soma ? ` · ${soma}` : ''}`, itens });
    }
    const catsQ = (categorias ?? []).filter((c) => casaPalavras(`${c.nome} ${c.grupo?.nome ?? ''}`, tokens))
      .sort((a, b) => semAcento(a.nome).localeCompare(semAcento(b.nome)));
    if (catsQ.length) {
      lista.push({
        titulo: 'Categorias',
        itens: catsQ.slice(0, 6).map((c) => ({
          key: `cat-${c.id}`, icone: <Bolinha cor={c.grupo?.cor} />, to: `/lancamentos?periodo=tudo&cat=${c.id}`,
          titulo: <>{realcar(c.nome, tokens)}<span className="text-gray-400"> · {realcar(c.grupo?.nome ?? '', tokens)}</span></>,
          direita: <span className="text-gray-400">os lançamentos dela</span>,
        })),
      });
    }
    return lista;
  }, [qLimpo, tokens, recentes, achados, categorias, indice]);

  const itens = useMemo(() => secoes.flatMap((s) => s.itens), [secoes]);
  useEffect(() => { setSel(0); }, [qLimpo]);
  useEffect(() => {
    listaRef.current?.querySelector(`[data-indice="${sel}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [sel]);

  const lembrar = (item) => {
    if (!item.recente) return;
    const novo = [{ ...item.recente, em: Date.now() }, ...lerRecentes().filter((r) => r.id !== item.recente.id)].slice(0, MAX_RECENTES);
    lsSet(LS_RECENTES, JSON.stringify(novo));
  };
  const abrir = (item, novaAba = false) => {
    if (!item) return;
    lembrar(item);
    if (novaAba) { window.open(`${import.meta.env.BASE_URL.replace(/\/$/, '')}${item.to}`, '_blank', 'noopener'); return; }
    onFechar();
    navigate(item.to);
  };

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSel((i) => Math.min(i + 1, itens.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSel((i) => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); abrir(itens[sel], e.ctrlKey || e.metaKey); }
  };

  if (!aberto) return null;
  let indiceItem = -1;
  const lendo = buscavel && !indice;
  const semNada = buscavel && indice && itens.length === 0;

  return createPortal(
    <div className="fixed inset-0 z-[60] flex justify-center bg-veu/40 px-4 pt-[12vh] animate-backdrop-in motion-reduce:animate-none"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onFechar(); }}>
      <div role="dialog" aria-modal="true" aria-label="Buscar"
        className="flex max-h-[70vh] w-full max-w-[680px] flex-col self-start overflow-hidden rounded-lg border border-elevado bg-elevado shadow-xl sombra-popover animate-modal-in motion-reduce:animate-none">
        <div className="flex items-center gap-2.5 border-b border-gray-200 px-4 py-2.5">
          <IconLupa className={`h-[16px] w-[16px] shrink-0 ${lendo ? 'animate-pulse text-gray-500' : 'text-gray-400'}`} />
          <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKeyDown}
            placeholder="Buscar lançamento (loja, descrição, valor), categoria ou tela…" aria-label="Buscar"
            role="combobox" aria-expanded="true" aria-controls="paleta-busca-lista"
            className="min-w-0 flex-1 border-0 bg-transparent p-0 text-[13.5px] text-gray-900 outline-none placeholder:text-gray-400 focus:ring-0" />
          <Tecla>Esc</Tecla>
        </div>
        <div id="paleta-busca-lista" ref={listaRef} role="listbox" className="min-h-0 flex-1 overflow-y-auto overscroll-contain py-1 scrollbar-thin">
          {secoes.map((s) => (
            <Fragment key={s.titulo}>
              <div className="flex items-baseline gap-2 px-4 pb-1 pt-2.5 text-[10px] font-semibold uppercase tracking-[.05em] text-gray-400">
                <span>{s.titulo}</span>
                {s.direita && <span className="ml-auto font-medium normal-case tracking-normal tabular-nums">{s.direita}</span>}
              </div>
              {s.itens.map((it) => {
                indiceItem += 1;
                const i = indiceItem;
                const ativo = i === sel;
                return (
                  <Link key={it.key} to={it.to} role="option" aria-selected={ativo} data-indice={i}
                    onMouseMove={() => { if (!ativo) setSel(i); }}
                    onClick={(e) => {
                      if (e.ctrlKey || e.metaKey || e.shiftKey) { lembrar(it); return; }
                      e.preventDefault(); abrir(it);
                    }}
                    onAuxClick={() => lembrar(it)}
                    className={`flex items-center gap-2.5 px-4 py-[6px] text-[12px] text-gray-700 ${ativo ? 'bg-hx-f4f5f7' : ''}`}>
                    <span className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-[5px] bg-gray-100 text-gray-500">{it.icone}</span>
                    <span className="min-w-0 flex-1 truncate">{it.titulo}</span>
                    {it.direita && <span className="shrink-0 text-[11.5px]">{it.direita}</span>}
                  </Link>
                );
              })}
            </Fragment>
          ))}
          {lendo && <p className="px-4 py-6 text-center text-[12px] text-gray-500">Lendo os lançamentos…</p>}
          {semNada && <p className="px-4 py-6 text-center text-[12px] text-gray-500">Nada encontrado para “{qLimpo}”.</p>}
          {qLimpo && !buscavel && !itens.length && (
            <p className="px-4 py-6 text-center text-[12px] text-gray-500">Digite ao menos 2 letras.</p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-gray-200 px-4 py-2 text-[10.5px] text-gray-500">
          <span className="inline-flex items-center gap-1"><Tecla>↑</Tecla><Tecla>↓</Tecla> navegar</span>
          <span className="inline-flex items-center gap-1"><Tecla>Enter</Tecla> abrir (o mês, com a linha acesa)</span>
          <span className="inline-flex items-center gap-1"><Tecla>Ctrl</Tecla>+<Tecla>Enter</Tecla> abrir em outra aba</span>
        </div>
      </div>
    </div>,
    document.body,
  );
}
