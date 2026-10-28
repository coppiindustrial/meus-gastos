import { useState } from 'react';
import CabecalhoCalendario, { DIAS, isoOf, parseISO, buildGrid } from './calendario/CabecalhoCalendario.jsx';

// COPIADO DO GESTOR COPPI (`components/CalendarioData.jsx`, 28/10/2026), sem os feriados (lá vêm do servidor).
//
// Seletor de DATA ÚNICA (mesmo visual compacto/grafite do CalendarioIntervalo, porém
// sem DE→ATÉ). Clicar num dia chama onSelect(iso) e fecha (o pai fecha o popover).
// Rodapé: "Limpar" (onClear) e "Hoje" (seleciona a data de hoje).
//
// O cabeçalho (setas, título e o seletor de mês/ano por trás dele) e os helpers de data moram em
// `calendario/CabecalhoCalendario.jsx`, compartilhados com o CalendarioIntervalo — eram ~40 linhas
// duplicadas byte a byte entre os dois arquivos.
//
// `min` / `max` (AAAA-MM-DD, opcionais): os dias fora da faixa saem HACHURADOS e não aceitam clique
// (01/10/2026, a pedido). Antes cada tela barrava do seu jeito DEPOIS do clique — um aviso, ou nada
// (o `CampoData` só ignorava o clique) —, e as regras das Configurações ("bloquear próxima data
// retroativa", "bloquear data de envio futura") pareciam não funcionar. O "Hoje" também se apaga
// quando hoje está fora da faixa.
//
// HACHURA, e não só cinza (a opção C de um mockup): a primeira versão apagava o bloqueado com
// `opacity-40`, e ele ficou com quase o mesmo cinza dos dias do MÊS VIZINHO — num calendário "só até
// hoje", o resto do mês se confundia com o mês seguinte. As listras são o desenho da hachura do DRE
// (`HACHURA` em `components/dre/LinhaDre.jsx`), e o dia bloqueado tem cantos RETOS para as listras
// de dias vizinhos formarem uma faixa só. Recusadas: esconder os dias do mês vizinho (A), riscar o
// número (B) e um fundo escuro (D).
const HACHURA_BLOQUEADO = 'repeating-linear-gradient(135deg, rgba(75, 85, 99, .22) 0 1.5px, transparent 1.5px 6px)';

export default function CalendarioData({ value = '', onSelect, onClear, min, max }) {
  const base = value ? parseISO(value) : new Date();
  const [cursor, setCursor] = useState({ ano: base.getFullYear(), mes: base.getMonth() });

  const grid = buildGrid(cursor.ano, cursor.mes);
  const hoje = isoOf(new Date());
  const bloqueado = (iso) => (min && iso < min) || (max && iso > max);
  const hojeBloqueado = bloqueado(hoje);
  const irHoje = () => {
    if (hojeBloqueado) return;
    const t = new Date(); setCursor({ ano: t.getFullYear(), mes: t.getMonth() }); onSelect(isoOf(t));
  };

  return (
    <div className="w-[226px] p-[11px]">
      <CabecalhoCalendario cursor={cursor} setCursor={setCursor}>
        <div className="grid grid-cols-7 gap-y-0.5 text-center">
          {DIAS.map((d, i) => <div key={i} className="text-[9px] text-gray-400 py-px font-semibold">{d}</div>)}
          {grid.map((c) => {
            const isSel = value && c.iso === value;
            const ehHoje = c.iso === hoje;
            const fora = bloqueado(c.iso);
            // Fora da faixa: cantos retos (a hachura corre contínua pela linha), sem hover — é o que
            // diz "não dá" antes do clique. Os demais têm o `rounded-md` do realce.
            let cls = `relative text-[12px] py-[5px] transition ${fora ? '' : 'rounded-md '}`;
            // `dia-sel`: gray-800 com branco no claro; no escuro se inverte (ver `tema/escuro.mjs`).
            if (fora) cls += 'text-gray-400 cursor-not-allowed';
            else if (isSel) cls += 'bg-dia-sel text-dia-sel font-semibold';
            else if (ehHoje) cls += 'text-gray-900 font-semibold hover:bg-gray-100';
            else if (c.out) cls += 'text-gray-300 hover:bg-gray-100';
            else cls += 'text-gray-700 hover:bg-gray-100';
            return (
              <button key={c.iso} type="button" disabled={!!fora} onClick={() => !fora && onSelect(c.iso)} className={cls}
                style={fora ? { backgroundImage: HACHURA_BLOQUEADO } : undefined}>
                {c.dia}
                {ehHoje && <span className={`absolute left-1/2 -translate-x-1/2 bottom-px w-[3px] h-[3px] rounded-full ${isSel ? 'bg-ponto-hoje-sel' : 'bg-ponto-hoje'}`} />}
              </button>
            );
          })}
        </div>
      </CabecalhoCalendario>

      <div className="flex items-center justify-between mt-2 pt-1.5 border-t border-gray-100">
        <button type="button" onClick={() => onClear && onClear()} className="text-[12px] text-gray-500 hover:text-gray-700">Limpar</button>
        <button type="button" onClick={irHoje} disabled={!!hojeBloqueado}
          className={`text-[12px] font-semibold ${hojeBloqueado ? 'cursor-not-allowed text-gray-400 opacity-40' : 'text-gray-800 hover:text-gray-900'}`}>Hoje</button>
      </div>
    </div>
  );
}
