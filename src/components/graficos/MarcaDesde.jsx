import { competenciaCurta } from '../../lib/format.js';
import { varCor } from '../../lib/varCor.js';

// A MÉDIA DO GASTO FIXO QUE COMEÇOU DEPOIS (04/11/2026, opção A do mockup "média · desde"): um RELÓGIO pequeno DEPOIS do
// número, num espaço FIXO que toda linha reserva (com ou sem ele) — o "desde abr/26" escrito ao lado empurrava só as
// linhas que o tinham, e a coluna das médias perdia o alinhamento. O texto mora no hover (`title`) e no balão de quem
// usa. Vale no ampliado do Gastos por grupo, no Grupo × mês e na tela Categorias.
// `desde`: 'AAAA-MM' (o 1º mês do gasto fixo no período), 'parcial' ou null (sem marca); `meses`: quantos meses contam.
export const COR_DESDE = varCor('#ca8a04', 'texto');
export const LEGENDA_DESDE = 'média desde o 1º mês (gasto fixo)';

export default function MarcaDesde({ desde, meses }) {
  const com = desde && desde !== 'parcial';
  return (
    <span className="inline-flex w-4 shrink-0 justify-end align-[-1px]" aria-hidden={com ? undefined : 'true'}
      title={com ? `Gasto fixo: a média conta desde ${competenciaCurta(desde)}${meses ? ` (${meses} ${meses === 1 ? 'mês' : 'meses'})` : ''}` : undefined}>
      {com && <IconRelogio />}
    </span>
  );
}

export function IconRelogio({ className = 'h-[11px] w-[11px]' }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke={COR_DESDE} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" role="img" aria-label="média desde o 1º mês">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}
