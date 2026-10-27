// A variação em %, numa pílula verde (bom) ou vermelha (ruim). `sobeBom`: para entrada e saldo subir é
// bom; para gasto, não.
export default function Variacao({ v, sobeBom, titulo = 'Contra o mês anterior' }) {
  if (v === null || v === undefined) return null;
  const bom = sobeBom ? v >= 0 : v <= 0;
  return (
    <span className={`inline-flex shrink-0 items-center gap-0.5 rounded-full px-[7px] py-[2px] text-[11px] font-semibold tabular-nums ${
      v === 0 ? 'bg-gray-100 text-gray-600' : bom ? 'bg-hx-dcfce7 text-hx-166534' : 'bg-hx-fee2e2 text-hx-991b1b'}`}
      title={titulo}>
      {v > 0 ? '▲' : v < 0 ? '▼' : ''} {Math.abs(v).toLocaleString('pt-BR')}%
    </span>
  );
}
