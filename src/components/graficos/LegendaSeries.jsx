import { useState } from 'react';

// A LEGENDA COMO CONTROLE, copiada do Gestor (`components/dashboard/LegendaSeries.jsx`): passar o mouse
// numa série ACENDE ela (as outras recuam para 18%), clicar a FIXA — várias podem ficar fixas, e só
// elas aparecem cheias. Clicar de novo solta. Quem desenha o gráfico pergunta a opacidade de cada
// série ao `opSerie`.
export function useDestaqueSeries() {
  const [hover, setHover] = useState(null);
  const [fixas, setFixas] = useState([]);
  const alternar = (k) => setFixas((f) => (f.includes(k) ? f.filter((x) => x !== k) : [...f, k]));
  const opSerie = (k) => {
    if (fixas.length) return fixas.includes(k) ? 1 : 0.18;
    return hover && hover !== k ? 0.18 : 1;
  };
  return { hover, setHover, fixas, alternar, opSerie };
}

// `series`: [{ key, rotulo, cor, forma? }] — forma 'linha' (traço), 'tracejado' (traço tracejado) ou
// quadradinho (padrão).
export default function LegendaSeries({ series, ctrl, className = '' }) {
  return (
    <div className={`flex flex-wrap items-center gap-x-1 gap-y-1 ${className}`} onMouseLeave={() => ctrl.setHover(null)}>
      {series.map((s) => {
        const fixa = ctrl.fixas.includes(s.key);
        return (
          <button key={s.key} type="button" aria-pressed={fixa}
            onMouseEnter={() => ctrl.setHover(s.key)} onClick={() => ctrl.alternar(s.key)}
            className={`inline-flex items-center gap-1.5 rounded-[4px] px-1.5 py-0.5 text-[11.5px] leading-[16px] transition-colors ${
              fixa ? 'bg-gray-100 font-semibold text-gray-800' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-800'}`}
            style={{ opacity: ctrl.opSerie(s.key) < 1 ? 0.55 : 1 }}>
            {s.forma === 'linha' ? <span className="h-[2px] w-3 shrink-0 rounded" style={{ background: s.cor }} />
              : s.forma === 'tracejado' ? <span className="w-3 shrink-0 border-t-2 border-dashed" style={{ borderColor: s.cor }} />
                : <span className="h-2 w-2 shrink-0 rounded-[2px]" style={{ background: s.cor }} />}
            {s.rotulo}
            {fixa && <span aria-hidden="true" className="text-gray-400">✕</span>}
          </button>
        );
      })}
    </div>
  );
}
