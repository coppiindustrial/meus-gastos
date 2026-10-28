import { useState } from 'react';
import { ANOS_POR_PAGINA, CELULA, GATILHO, MESES, MESES_CURTOS, SETA, inicioPagina } from './calendario/CabecalhoCalendario.jsx';
import { IconSeta } from './icons.jsx';

// O SELETOR DE MÊS (para vigência, competência): o MESMO desenho do calendário do Gestor (`CalendarioData`
// e o painel de mês do `CabecalhoCalendario`) — 226px, as setas, o gatilho do ano e as células de lá —,
// só que a grade são os 12 meses e o clique escolhe o mês. O ano abre a página de 12 anos, como lá.
//
// `value`/`onSelect`: 'AAAA-MM'. `min`/`max` ('AAAA-MM', opcionais): fora da faixa sai HACHURADO, como os
// dias barrados do `CalendarioData`. Rodapé: "Limpar" (só com `onClear`) e "Este mês".
const HACHURA_BLOQUEADO = 'repeating-linear-gradient(135deg, rgba(75, 85, 99, .22) 0 1.5px, transparent 1.5px 6px)';
const p2 = (n) => String(n).padStart(2, '0');

export default function CalendarioMes({ value = '', onSelect, onClear, min, max, rotuloLimpar = 'Limpar' }) {
  const agora = new Date();
  const esteMes = `${agora.getFullYear()}-${p2(agora.getMonth() + 1)}`;
  const [ano, setAno] = useState(() => (value ? Number(value.slice(0, 4)) : agora.getFullYear()));
  const [painelAno, setPainelAno] = useState(false);
  const [paginaAno, setPaginaAno] = useState(() => inicioPagina(ano));
  const bloqueado = (comp) => (min && comp < min) || (max && comp > max);

  const passo = (d) => (painelAno ? setPaginaAno((p) => p + d * ANOS_POR_PAGINA) : setAno((a) => a + d));
  const abrirAno = () => { setPaginaAno(inicioPagina(ano)); setPainelAno((x) => !x); };
  const anos = Array.from({ length: ANOS_POR_PAGINA }, (_, i) => paginaAno + i);

  return (
    <div className="w-[226px] p-[11px]"
      onKeyDown={(e) => { if (e.key === 'Escape' && painelAno) { e.stopPropagation(); setPainelAno(false); } }}>
      <div className="mb-1 flex items-center justify-between">
        <button type="button" onClick={() => passo(-1)} aria-label="Anterior" className={SETA}>‹</button>
        <button type="button" onClick={abrirAno} aria-expanded={painelAno} aria-haspopup="true"
          className={`${GATILHO} tabular-nums ${painelAno ? 'bg-gray-200' : ''}`}>
          {ano}
          <IconSeta className={`opacity-60 transition-transform duration-200 ease-out ${painelAno ? 'rotate-180' : ''}`} />
        </button>
        <button type="button" onClick={() => passo(1)} aria-label="Próximo" className={SETA}>›</button>
      </div>

      {painelAno ? (
        <div className="grid grid-cols-3 gap-1">
          {anos.map((a) => (
            <button key={a} type="button" onClick={() => { setAno(a); setPainelAno(false); }}
              className={`${CELULA} tabular-nums ${a === ano ? 'bg-dia-sel font-semibold text-dia-sel' : 'text-gray-700 hover:bg-gray-100'}`}>
              {a}
            </button>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-1">
          {MESES_CURTOS.map((m, i) => {
            const comp = `${ano}-${p2(i + 1)}`;
            const sel = comp === value;
            const fora = bloqueado(comp);
            const atual = comp === esteMes;
            let cls = `${CELULA} relative `;
            if (fora) cls += 'text-gray-400 cursor-not-allowed rounded-none';
            else if (sel) cls += 'bg-dia-sel text-dia-sel font-semibold';
            else if (atual) cls += 'text-gray-900 font-semibold hover:bg-gray-100';
            else cls += 'text-gray-700 hover:bg-gray-100';
            return (
              <button key={m} type="button" disabled={!!fora} onClick={() => !fora && onSelect(comp)} className={cls}
                title={`${MESES[i]} de ${ano}`} style={fora ? { backgroundImage: HACHURA_BLOQUEADO } : undefined}>
                {m}
                {atual && <span className={`absolute bottom-px left-1/2 h-[3px] w-[3px] -translate-x-1/2 rounded-full ${sel ? 'bg-ponto-hoje-sel' : 'bg-ponto-hoje'}`} />}
              </button>
            );
          })}
        </div>
      )}

      <div className="mt-2 flex items-center justify-between border-t border-gray-100 pt-1.5">
        {onClear
          ? <button type="button" onClick={onClear} className="text-[12px] text-gray-500 hover:text-gray-700">{rotuloLimpar}</button>
          : <span />}
        <button type="button" disabled={!!bloqueado(esteMes)} onClick={() => { setAno(agora.getFullYear()); onSelect(esteMes); }}
          className={`text-[12px] font-semibold ${bloqueado(esteMes) ? 'cursor-not-allowed text-gray-400 opacity-40' : 'text-gray-800 hover:text-gray-900'}`}>
          Este mês
        </button>
      </div>
    </div>
  );
}
