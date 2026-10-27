// A MINIATURA de cada bloco da Visão geral no quadro "Widgets" (o `PersonalizarModal`), no molde das do
// Gestor: um desenho mínimo do que o bloco mostra — só o título não dizia o que é cada um. Cinzas e as
// duas cores das séries, sem número nenhum.
const G = 'currentColor';
const ENT = 'var(--serie-entradas)';
const GAS = 'var(--serie-gastos)';

const Caixa = ({ children }) => (
  <svg viewBox="0 0 120 64" className="block h-auto w-full rounded-[6px] bg-hx-f6f7f8 text-gray-300" aria-hidden="true">{children}</svg>
);

export default function MiniaturaWidget({ id }) {
  switch (id) {
    case 'vg_kpis':
      return (
        <Caixa>
          {[0, 1, 2, 3, 4].map((i) => (
            <g key={i} transform={`translate(${6 + i * 22.5} 14)`}>
              <rect width="20" height="36" rx="3" fill="#fff" stroke={G} />
              <rect x="3" y="5" width="9" height="3" rx="1" fill={G} />
              <rect x="3" y="12" width="13" height="5" rx="1" fill={i === 0 ? ENT : '#9ca3af'} />
              <path d={`M2 31 L7 ${27 - i} L12 29 L18 ${24 + i}`} fill="none" stroke={i === 1 ? GAS : i === 0 ? ENT : '#9ca3af'} strokeWidth="1.3" />
            </g>
          ))}
        </Caixa>
      );
    case 'vg_agora':
      return (
        <Caixa>
          <rect x="6" y="24" width="108" height="16" rx="3" fill="#fff" stroke={G} />
          <rect x="11" y="30" width="22" height="4" rx="1" fill="#6b7280" />
          <rect x="40" y="30" width="26" height="4" rx="1" fill={G} />
          <rect x="72" y="30" width="34" height="4" rx="1" fill={G} />
        </Caixa>
      );
    case 'vg_meses':
      return (
        <Caixa>
          <line x1="8" y1="54" x2="112" y2="54" stroke={G} />
          {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
            <g key={i}>
              <rect x={11 + i * 12.5} y={54 - (18 + (i % 3) * 7)} width="4.5" height={18 + (i % 3) * 7} rx="1" fill={ENT} />
              <rect x={16 + i * 12.5} y={54 - (13 + ((i + 1) % 4) * 5)} width="4.5" height={13 + ((i + 1) % 4) * 5} rx="1" fill={GAS} />
            </g>
          ))}
          <polyline points="13,38 26,30 38,40 51,33 63,36 76,28 88,34 101,31" fill="none" stroke="#374151" strokeWidth="1.3" />
        </Caixa>
      );
    case 'vg_origem':
      return (
        <Caixa>
          <circle cx="34" cy="32" r="17" fill="none" stroke={GAS} strokeWidth="8" strokeDasharray="72 107" transform="rotate(-90 34 32)" />
          <circle cx="34" cy="32" r="17" fill="none" stroke="#7aa7e6" strokeWidth="8" strokeDasharray="25 107" strokeDashoffset="-73" transform="rotate(-90 34 32)" />
          <circle cx="34" cy="32" r="17" fill="none" stroke="#b7cff2" strokeWidth="8" strokeDasharray="8 107" strokeDashoffset="-99" transform="rotate(-90 34 32)" />
          {[0, 1, 2].map((i) => <rect key={i} x="64" y={20 + i * 10} width={44 - i * 8} height="4" rx="1" fill={G} />)}
        </Caixa>
      );
    case 'vg_grupos':
      return (
        <Caixa>
          {[0, 1, 2, 3, 4].map((i) => (
            <g key={i}>
              <rect x="8" y={10 + i * 10} width="18" height="4" rx="1" fill={G} />
              <rect x="30" y={10 + i * 10} width={80 - i * 14} height="4" rx="1" fill={GAS} />
            </g>
          ))}
        </Caixa>
      );
    case 'vg_tabela':
      return (
        <Caixa>
          <rect x="6" y="8" width="108" height="48" rx="3" fill="#fff" stroke={G} />
          {[0, 1, 2, 3].map((r) => [0, 1, 2, 3, 4, 5].map((c) => (
            <rect key={`${r}${c}`} x={30 + c * 13.5} y={14 + r * 10} width="11" height="6" rx="1"
              fill={GAS} fillOpacity={0.12 + (((r * 3 + c * 5) % 7) / 7) * 0.5} />
          )))}
          {[0, 1, 2, 3].map((r) => <rect key={r} x="11" y={15 + r * 10} width="15" height="4" rx="1" fill="#9ca3af" />)}
        </Caixa>
      );
    default:
      return <Caixa><rect x="10" y="10" width="100" height="44" rx="4" fill="#fff" stroke={G} /></Caixa>;
  }
}
