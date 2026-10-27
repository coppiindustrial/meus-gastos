// Escala LINEAR em números redondos, para eixos de gráfico.
//
// A irmã logarítmica (`escalaLog`) vive dentro de `components/dashboard/GraficoEsfriando.jsx`, que
// é onde ela nasceu; esta nasce aqui para as duas convergirem quando alguém precisar das duas no
// mesmo lugar.
//
// O passo sai de 1/2/5 × 10ⁿ, com **piso de 1**: as séries do dashboard são CONTAGENS, e uma marca
// em "2,5 envios" não existe no mundo. O teto é o menor múltiplo do passo que cobre o máximo — é
// isso que faz a curva parar de encostar no topo e ganhar uma referência de leitura.
const REDONDOS = [1, 2, 5, 10];

export function escalaLinear(max, alvoMarcas = 4) {
  const m = Math.max(1, Math.ceil(max || 0));
  const bruto = m / alvoMarcas;
  const base = 10 ** Math.floor(Math.log10(bruto));
  const passo = Math.max(1, Math.round((REDONDOS.find((r) => r * base >= bruto) ?? 10) * base));
  const teto = Math.ceil(m / passo) * passo;
  const marcas = [];
  for (let v = 0; v <= teto; v += passo) marcas.push(v);
  // Fração de 0 (base) a 1 (teto). Quem desenha decide como isso vira posição na tela — o gráfico
  // de série, por exemplo, ainda reserva um respiro acima e abaixo.
  return { teto, marcas, fracao: (v) => v / teto };
}
