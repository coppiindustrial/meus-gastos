import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { varCor } from '../../lib/varCor.js';
import posicionarPopover from '../../lib/posicionarPopover.js';
import useEscape from '../../lib/useEscape.js';
import { brlCurto, formatBRL } from '../../lib/dinheiro.js';
import { nomeCompetencia } from '../../lib/format.js';

// O AVISO "AGORA" DA VISÃO GERAL (a opção A do mockup): a linha do widget "Alertas" do Dashboard do
// Gestor (`components/dashboard/Alertas.jsx`) — o título, um divisor e as pendências como PÍLULAS no tom
// do que pedem. Alerta é ESTADO: recalculado a cada carga, some sozinho quando resolvido.
//
// Os tons são os de lá, e cada um quer dizer uma coisa só: vermelho (GRAVE) = algo errado a revisar;
// âmbar (MEDIO) = falta fazer (fixo a lançar); cinza (ESTADO) = só para saber (parcelas do mês que vem).
// A pílula dos fixos abre o menu de lá, com os fixos por mês e "Lançar" em cada um; a de revisar leva às
// Pendências. Sempre do mês ATUAL (não depende dos filtros da tela).
//
// `pendentes`: { comp: [{ rec, sugerido }] } (de `pendentesPorMes`, até o mês atual). `onLancar(rec, comp,
// valor)`: lança um fixo pelo menu (a página recarrega depois).

export const GRAVE = { bg: varCor('#fdeaea', 'fundo'), cor: varCor('#c0393d', 'texto') };
export const MEDIO = { bg: varCor('#fdf3d9', 'fundo'), cor: varCor('#9a6f00', 'texto') };
export const ESTADO = { bg: varCor('#eceef1', 'fundo'), cor: varCor('#4b5563', 'texto') };
const OK = { bg: varCor('#e7f6ee', 'fundo'), cor: varCor('#15803d', 'texto') };

const plural = (n, um, muitos) => `${n} ${n === 1 ? um : muitos}`;
const mesDe = (comp) => nomeCompetencia(comp).replace(/ de \d+$/, '');
const PILULA = 'inline-flex shrink-0 items-center gap-1 rounded-[4px] px-1.5 py-0.5 text-[11.5px] font-medium transition hover:brightness-95 active:brightness-90';
const LARG_MENU = 340;

const Ico = ({ children }) => (
  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
);
const IcoCalendario = () => <Ico><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></Ico>;
const IcoCheck = () => <Ico><polyline points="20 6 9 17 4 12" /></Ico>;
const IcoSeta = () => (
  <svg viewBox="0 0 24 24" className="h-3 w-3 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="9 6 15 12 9 18" /></svg>
);
const IcoAbre = () => (
  <svg viewBox="0 0 24 24" className="h-3 w-3 opacity-75" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9" /></svg>
);

export default function AvisoAgora({ hoje, pendentes, revisar, parcelasProx, onLancar }) {
  const navigate = useNavigate();
  const meses = Object.keys(pendentes).sort().reverse(); // o mês atual primeiro
  const nFixos = meses.reduce((s, c) => s + pendentes[c].length, 0);
  const proximo = parcelasProx ? mesDe(parcelasProx.competencia).toLowerCase() : null;
  const tom = revisar ? GRAVE : nFixos ? MEDIO : null;

  return (
    <div className="flex min-h-[58px] items-center px-5">
      <span className="shrink-0 text-[13px] font-semibold text-gray-800">Agora</span>
      <span className="mx-2.5 h-[18px] w-px shrink-0 bg-gray-200" />
      <div className="-ml-2.5 flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1 rounded-[10px] px-2.5 py-1">
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-[7px]" style={{ background: (tom ?? OK).bg, color: (tom ?? OK).cor }}>
          {tom ? <IcoCalendario /> : <IcoCheck />}
        </span>
        <span className="shrink-0 text-[12px] font-medium text-gray-800">{mesDe(hoje)}</span>
        {!tom && <span className="text-[12px] text-gray-500">em dia — nada a lançar ou revisar</span>}
        {nFixos > 0 && (
          <MenuFixos meses={meses} pendentes={pendentes} hoje={hoje} onLancar={onLancar} onAbrir={() => navigate('/fixos')}>
            <span className={PILULA} style={{ background: MEDIO.bg, color: MEDIO.cor }}>
              {plural(nFixos, 'fixo a lançar', 'fixos a lançar')}{meses.some((c) => c !== hoje) ? ' (inclui meses anteriores)' : ''}<IcoAbre />
            </span>
          </MenuFixos>
        )}
        {revisar > 0 && (
          <button type="button" onClick={() => navigate('/pendencias')} className={PILULA} style={{ background: GRAVE.bg, color: GRAVE.cor }}
            title="Lançamentos sem categoria ou marcados para revisar. Clique para revisar.">
            {plural(revisar, 'lançamento a revisar', 'lançamentos a revisar')}
          </button>
        )}
        {parcelasProx && (
          <span className={`${PILULA} cursor-default hover:brightness-100`} style={{ background: ESTADO.bg, color: ESTADO.cor }}
            title={`Parcelas de compras no cartão que já caem na fatura de ${proximo}: ${formatBRL(parcelasProx.total)}.`}>
            {brlCurto(parcelasProx.total)} em parcelas de {proximo}
          </span>
        )}
      </div>
    </div>
  );
}

// O menu da pílula dos fixos (o `MenuAlerta` do Gestor): os pendentes por mês — o atual primeiro, os de
// trás como "ficou para trás" — com o valor sugerido e "Lançar" em cada um; no rodapé, a tela dos fixos.
function MenuFixos({ meses, pendentes, hoje, onLancar, onAbrir, children }) {
  const [pos, setPos] = useState(null);
  const [lancando, setLancando] = useState(new Set());
  const alvo = useRef(null);
  const menuRef = useRef(null);
  useEscape(!!pos, () => setPos(null));
  useEffect(() => {
    if (!pos) return undefined;
    const fora = (ev) => {
      if (alvo.current?.contains(ev.target) || menuRef.current?.contains(ev.target)) return;
      setPos(null);
    };
    const sair = () => setPos(null);
    document.addEventListener('mousedown', fora);
    window.addEventListener('scroll', sair, true);
    window.addEventListener('resize', sair);
    return () => {
      document.removeEventListener('mousedown', fora);
      window.removeEventListener('scroll', sair, true);
      window.removeEventListener('resize', sair);
    };
  }, [pos]);

  const nLinhas = meses.reduce((s, c) => s + pendentes[c].length + 1, 0);
  const lancar = async (rec, comp, valor) => {
    const k = `${rec.id}|${comp}`;
    setLancando((s) => new Set([...s, k]));
    try { await onLancar(rec, comp, valor); } finally { setLancando((s) => { const x = new Set(s); x.delete(k); return x; }); }
  };

  return (
    <span ref={alvo} className="inline-flex shrink-0">
      <button type="button" className="inline-flex" aria-haspopup="menu" aria-expanded={!!pos}
        onClick={(ev) => setPos(pos ? null : posicionarPopover(ev.currentTarget, { largura: LARG_MENU, altura: 60 + nLinhas * 30, alinhar: 'esquerda', gap: 6 }))}>
        {children}
      </button>
      {pos && createPortal(
        <div role="menu" ref={menuRef} style={{ position: 'fixed', ...pos, width: LARG_MENU }}
          className="z-[80] animate-pop-in overflow-hidden rounded-[4px] border border-elevado bg-elevado py-1 shadow-[0_14px_34px_rgba(20,28,44,.15),0_3px_8px_rgba(20,28,44,.06)] sombra-popover">
          <div className="max-h-[360px] overflow-y-auto scrollbar-thin">
            {meses.map((comp) => (
              <div key={comp} className="pt-1 first:pt-0">
                <div className="px-2.5 pb-0.5 pt-1 text-[9.5px] font-semibold uppercase tracking-[0.05em] text-gray-400">
                  {mesDe(comp)}{comp === hoje ? ' · mês atual' : ' · ficou para trás'}
                </div>
                {pendentes[comp].map(({ rec, sugerido }) => {
                  const ocupado = lancando.has(`${rec.id}|${comp}`);
                  return (
                    <div key={rec.id} role="menuitem" className="flex items-center gap-2 rounded-[2px] py-1 pl-5 pr-2.5 text-[12px] text-gray-700 transition hover:bg-hx-f4f5f7">
                      <span className="min-w-0 flex-1 truncate">{rec.descricao}</span>
                      <span className="shrink-0 text-[11.5px] tabular-nums text-gray-500">{formatBRL(sugerido)}</span>
                      <button type="button" disabled={ocupado || !(sugerido > 0)} onClick={() => lancar(rec, comp, sugerido)}
                        title={sugerido > 0 ? `Lançar ${formatBRL(sugerido)} em ${mesDe(comp).toLowerCase()} (o valor sugerido)` : 'Sem valor sugerido: lance na tela dos fixos'}
                        className={`${PILULA} disabled:opacity-50`} style={{ background: MEDIO.bg, color: MEDIO.cor }}>
                        {ocupado ? 'Lançando…' : 'Lançar'}
                      </button>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
          <button type="button" role="menuitem" onClick={() => { setPos(null); onAbrir(); }}
            className="mt-1 flex w-full items-center gap-1 border-t border-gray-100 px-2.5 pb-1 pt-2 text-left text-[11.5px] text-gray-500 transition hover:text-gray-800">
            Abrir os Gastos fixos (lá dá para marcar "não teve") <IcoSeta />
          </button>
        </div>,
        document.body,
      )}
    </span>
  );
}
