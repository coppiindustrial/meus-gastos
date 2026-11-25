import { varCor } from '../../lib/varCor.js';

// A MINIATURA de cada bloco no quadro "Widgets" (o `PersonalizarModal`) da Visão geral, do Patrimônio e dos Indicadores, no
// molde das do Gestor: um desenho mínimo do que o bloco mostra — só o título não dizia o que é cada um. Cinzas e as cores
// das séries, sem número nenhum.
// AS CORES SEGUEM O TEMA (09/11/2026): o "papel" dos cartões e os cinzas vão por `varCor` — com `#fff` fixo, no escuro as
// miniaturas sem desenho próprio (Saldo do mês, Já comprometido…) eram um retângulo branco.
const G = 'currentColor';
const ENT = 'var(--serie-entradas)';
const GAS = 'var(--serie-gastos)';
const SOBROU = 'var(--serie-sobrou)';
const PAPEL = varCor('#ffffff', 'fundo');
const CINZA = varCor('#9ca3af', 'texto');
const MEDIO = varCor('#6b7280', 'texto');
const ESCURO = varCor('#374151', 'texto');
const VERMELHO = varCor('#c0393d', 'texto');
const VERDE = varCor('#15803d', 'texto');
const AMBAR = varCor('#ca8a04', 'texto');

const Caixa = ({ children }) => (
  <svg viewBox="0 0 120 64" className="block h-auto w-full rounded-[6px] bg-hx-f6f7f8 text-gray-300" aria-hidden="true">{children}</svg>
);

// O PATRIMÔNIO e os INDICADORES reaproveitam as de desenho igual: os números, o "Agora", as colunas, a rosca, as barras
// deitadas e a tabela.
const IGUAL_A = {
  pt_kpis: 'vg_kpis', pt_agora: 'vg_agora', pt_evolucao: 'vg_meses', pt_rendeu: 'vg_meses', pt_entrou: 'vg_saldo',
  pt_onde: 'vg_origem', pt_ir: 'vg_grupos', pt_livre: 'vg_grupos', pt_vencimentos: 'vg_meses', pt_investimentos: 'vg_tabela',
  ind_kpis: 'vg_kpis',
  // o ACOMPANHAMENTO (25/11/2026): os índices são os números; a tabela de cotações, a tabela
  ac_indices: 'vg_kpis', ac_tabela: 'vg_tabela',
};

export default function MiniaturaWidget({ id: idPedido }) {
  const id = IGUAL_A[idPedido] ?? idPedido;
  switch (id) {
    case 'vg_kpis':
      return (
        <Caixa>
          {[0, 1, 2, 3, 4].map((i) => (
            <g key={i} transform={`translate(${6 + i * 22.5} 14)`}>
              <rect width="20" height="36" rx="3" fill={PAPEL} stroke={G} />
              <rect x="3" y="5" width="9" height="3" rx="1" fill={G} />
              <rect x="3" y="12" width="13" height="5" rx="1" fill={i === 0 ? ENT : CINZA} />
              <path d={`M2 31 L7 ${27 - i} L12 29 L18 ${24 + i}`} fill="none" stroke={i === 1 ? GAS : i === 0 ? ENT : CINZA} strokeWidth="1.3" />
            </g>
          ))}
        </Caixa>
      );
    case 'vg_agora':
      return (
        <Caixa>
          <rect x="6" y="24" width="108" height="16" rx="3" fill={PAPEL} stroke={G} />
          <rect x="11" y="30" width="22" height="4" rx="1" fill={MEDIO} />
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
          <polyline points="13,38 26,30 38,40 51,33 63,36 76,28 88,34 101,31" fill="none" stroke={ESCURO} strokeWidth="1.3" />
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
    // o SALDO DO MÊS: barras para cima (sobrou) e para baixo (faltou) e a linha do acumulado
    case 'vg_saldo': {
      const v = [10, 14, -6, 12, 8, -9, 15, 11];
      return (
        <Caixa>
          <line x1="8" y1="34" x2="112" y2="34" stroke={G} />
          {v.map((x, i) => (
            <rect key={i} x={12 + i * 12.5} y={x > 0 ? 34 - x : 34} width="7" height={Math.abs(x)} rx="1" fill={x > 0 ? SOBROU : VERMELHO} />
          ))}
          <polyline points="15,28 28,22 40,25 53,19 65,16 78,20 90,12 103,9" fill="none" stroke={ESCURO} strokeWidth="1.3" />
        </Caixa>
      );
    }
    // GASTOS POR ORIGEM, MÊS A MÊS: colunas empilhadas cartão / fixos / avulsos
    case 'vg_origem_mes': {
      const meses = [[20, 9, 4], [24, 9, 6], [18, 10, 3], [27, 9, 5], [22, 10, 7], [30, 9, 4], [25, 10, 6], [21, 9, 3]];
      return (
        <Caixa>
          <line x1="8" y1="56" x2="112" y2="56" stroke={G} />
          {meses.map(([c, f, a], i) => (
            <g key={i}>
              <rect x={12 + i * 12.5} y={56 - c} width="8" height={c} rx="1" fill="var(--origem-cartao)" />
              <rect x={12 + i * 12.5} y={56 - c - f - 1} width="8" height={f} rx="1" fill="var(--origem-fixo)" />
              <rect x={12 + i * 12.5} y={56 - c - f - a - 2} width="8" height={a} rx="1" fill="var(--origem-manual)" />
            </g>
          ))}
        </Caixa>
      );
    }
    // JÁ COMPROMETIDO: barras deitadas por mês, os fixos cheios e as parcelas mais claras, e a média tracejada
    case 'vg_comprometido':
      return (
        <Caixa>
          {[44, 40, 36, 33, 28].map((p, i) => (
            <g key={i}>
              <rect x="8" y={10 + i * 10} width="12" height="4" rx="1" fill={G} />
              <rect x="24" y={9 + i * 10} width="30" height="6" rx="1" fill="var(--origem-fixo)" />
              <rect x="55" y={9 + i * 10} width={p} height="6" rx="1" fill={GAS} fillOpacity=".3" stroke={GAS} strokeWidth=".8" />
            </g>
          ))}
          <line x1="96" y1="5" x2="96" y2="58" stroke={ESCURO} strokeWidth="1" strokeDasharray="2.5 2" />
        </Caixa>
      );
    // FORA DO NORMAL: duas colunas, o que subiu (vermelho) e o que caiu (verde)
    case 'vg_fora':
      return (
        <Caixa>
          {[0, 1, 2, 3].map((i) => (
            <g key={i}>
              <rect x="8" y={13 + i * 11} width="14" height="4" rx="1" fill={G} />
              <rect x="25" y={12 + i * 11} width={28 - i * 6} height="6" rx="1" fill={VERMELHO} />
              <rect x="64" y={13 + i * 11} width="14" height="4" rx="1" fill={G} />
              <rect x="81" y={12 + i * 11} width={24 - i * 5} height="6" rx="1" fill={VERDE} />
            </g>
          ))}
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
          <rect x="6" y="8" width="108" height="48" rx="3" fill={PAPEL} stroke={G} />
          {[0, 1, 2, 3].map((r) => [0, 1, 2, 3, 4, 5].map((c) => (
            <rect key={`${r}${c}`} x={30 + c * 13.5} y={14 + r * 10} width="11" height="6" rx="1"
              fill={GAS} fillOpacity={0.12 + (((r * 3 + c * 5) % 7) / 7) * 0.5} />
          )))}
          {[0, 1, 2, 3].map((r) => <rect key={r} x="11" y={15 + r * 10} width="15" height="4" rx="1" fill={CINZA} />)}
        </Caixa>
      );
    // OS INDICADORES: a Selic em degraus, o IPCA e a área entre os dois
    case 'ind_selic':
      return (
        <Caixa>
          <line x1="8" y1="56" x2="112" y2="56" stroke={G} />
          <path d="M8 22 H30 V16 H58 V12 H86 V18 H112 L112 40 L86 42 L58 34 L30 38 L8 30 Z" fill={GAS} fillOpacity=".14" />
          <path d="M8 22 H30 V16 H58 V12 H86 V18 H112" fill="none" stroke={GAS} strokeWidth="1.5" />
          <polyline points="8,30 30,38 58,34 86,42 112,40" fill="none" stroke={AMBAR} strokeWidth="1.5" />
        </Caixa>
      );
    // O QUE O MERCADO ESPERA: três linhas (IPCA, Selic, dólar) com o valor de três anos
    case 'ind_focus':
      return (
        <Caixa>
          {[0, 1, 2].map((r) => (
            <g key={r}>
              <rect x="8" y={15 + r * 14} width="18" height="4" rx="1" fill={G} />
              {[0, 1, 2].map((c) => (
                <rect key={c} x={40 + c * 25} y={13 + r * 14} width="20" height="8" rx="2" fill={PAPEL} stroke={G} />
              ))}
            </g>
          ))}
        </Caixa>
      );
    // DÓLAR E EURO: duas linhas
    case 'ind_moedas':
      return (
        <Caixa>
          <line x1="8" y1="56" x2="112" y2="56" stroke={G} />
          <polyline points="8,26 22,22 36,27 50,20 64,24 78,17 92,21 112,14" fill="none" stroke={GAS} strokeWidth="1.5" />
          <polyline points="8,40 22,37 36,42 50,35 64,38 78,33 92,36 112,30" fill="none" stroke={ENT} strokeWidth="1.5" />
        </Caixa>
      );
    // IPCA DE CADA MÊS: colunas, uma abaixo de zero
    case 'ind_ipca': {
      const v = [9, 14, 6, 11, -4, 8, 12, 5, 10];
      return (
        <Caixa>
          <line x1="8" y1="44" x2="112" y2="44" stroke={G} />
          {v.map((x, i) => (
            <rect key={i} x={11 + i * 11.3} y={x > 0 ? 44 - x * 2 : 44} width="7" height={Math.abs(x) * 2} rx="1" fill={x > 0 ? AMBAR : VERDE} />
          ))}
        </Caixa>
      );
    }
    // SUA CARTEIRA × CDI × IPCA: as colunas do rendimento e as duas réguas
    case 'ind_carteira':
      return (
        <Caixa>
          <line x1="8" y1="56" x2="112" y2="56" stroke={G} />
          {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
            <rect key={i} x={11 + i * 12.5} y={56 - (22 + (i % 3) * 4)} width="7" height={22 + (i % 3) * 4} rx="1" fill={ENT} />
          ))}
          <polyline points="14,32 27,31 39,30 52,30 64,29 77,29 89,28 102,28" fill="none" stroke={ESCURO} strokeWidth="1.3" strokeDasharray="3 2" />
          <polyline points="14,46 27,44 39,47 52,45 64,43 77,46 89,44 102,45" fill="none" stroke={AMBAR} strokeWidth="1.3" />
        </Caixa>
      );
    // O MAPA DE CALOR (o seu e o do mercado): quadrados verdes, vermelhos e cinzas
    case 'ac_mapa':
    case 'ac_mercado':
      return (
        <Caixa>
          {[[6, 6, 46, 30, VERDE, 0.85], [54, 6, 30, 30, VERMELHO, 0.75], [86, 6, 28, 16, MEDIO, 0.5], [86, 24, 28, 12, VERDE, 0.5],
            [6, 38, 30, 20, VERMELHO, 0.5], [38, 38, 26, 20, VERDE, 0.6], [66, 38, 22, 20, MEDIO, 0.45], [90, 38, 24, 20, VERMELHO, 0.85]].map(([x, y, w, h, c, o], i) => (
            <rect key={i} x={x} y={y} width={w} height={h} rx="1.5" fill={c} fillOpacity={id === 'ac_mercado' ? o * 0.7 : o} />
          ))}
        </Caixa>
      );
    // AS ALTAS E AS BAIXAS: barras verdes em cima, vermelhas embaixo
    case 'ac_altas':
      return (
        <Caixa>
          {[44, 34, 26].map((w, i) => <g key={`a${i}`}><rect x="8" y={8 + i * 8} width="14" height="4" rx="1" fill={CINZA} /><rect x="26" y={8 + i * 8} width={w} height="4" rx="1" fill={VERDE} /></g>)}
          {[38, 28, 20].map((w, i) => <g key={`b${i}`}><rect x="8" y={36 + i * 8} width="14" height="4" rx="1" fill={CINZA} /><rect x="26" y={36 + i * 8} width={w} height="4" rx="1" fill={VERMELHO} /></g>)}
        </Caixa>
      );
    // O DIA DE CADA UM: curvas pequenas lado a lado
    case 'ac_dia':
      return (
        <Caixa>
          {[0, 1, 2, 3, 4, 5].map((i) => {
            const x = 6 + (i % 3) * 37; const y = 6 + Math.floor(i / 3) * 28;
            const sobe = i % 2 === 0;
            return (
              <g key={i}>
                <rect x={x} y={y} width="33" height="24" rx="2" fill={PAPEL} stroke={G} />
                <polyline points={sobe ? `${x + 3},${y + 18} ${x + 10},${y + 14} ${x + 17},${y + 16} ${x + 24},${y + 9} ${x + 30},${y + 7}` : `${x + 3},${y + 7} ${x + 10},${y + 11} ${x + 17},${y + 9} ${x + 24},${y + 16} ${x + 30},${y + 18}`}
                  fill="none" stroke={sobe ? VERDE : VERMELHO} strokeWidth="1.3" />
              </g>
            );
          })}
        </Caixa>
      );
    // O DESEMPENHO COMPARADO: linhas partindo do mesmo ponto
    case 'ac_comparado':
      return (
        <Caixa>
          <line x1="8" y1="34" x2="112" y2="34" stroke={G} strokeDasharray="2 2" />
          <polyline points="8,34 30,30 52,26 74,22 96,16 112,12" fill="none" stroke={ESCURO} strokeWidth="1.8" />
          <polyline points="8,34 30,28 52,30 74,20 96,18 112,8" fill="none" stroke={GAS} strokeWidth="1.3" />
          <polyline points="8,34 30,38 52,42 74,40 96,46 112,50" fill="none" stroke={AMBAR} strokeWidth="1.3" />
          <polyline points="8,34 30,33 52,31 74,32 96,29 112,28" fill="none" stroke={CINZA} strokeWidth="1.2" strokeDasharray="3 2" />
        </Caixa>
      );
    // OS PRÓXIMOS EVENTOS: a marca E ou D e a linha do texto
    case 'ac_eventos':
      return (
        <Caixa>
          {[0, 1, 2, 3].map((i) => (
            <g key={i}>
              <rect x="10" y={9 + i * 12} width="12" height="4" rx="1" fill={CINZA} />
              <rect x="26" y={7 + i * 12} width="8" height="8" rx="1.5" fill={i % 2 ? AMBAR : SOBROU} />
              <rect x="38" y={9 + i * 12} width={[60, 48, 54, 40][i]} height="4" rx="1" fill={MEDIO} />
            </g>
          ))}
        </Caixa>
      );
    // A FITA DE COTAÇÕES: uma faixa com os nomes e as setas
    case 'ac_fita':
      return (
        <Caixa>
          <rect x="4" y="24" width="112" height="16" rx="2" fill={PAPEL} stroke={G} />
          {[0, 1, 2, 3].map((i) => <g key={i}><rect x={10 + i * 27} y="30" width="12" height="4" rx="1" fill={ESCURO} /><rect x={24 + i * 27} y="30" width="7" height="4" rx="1" fill={i % 2 ? VERMELHO : VERDE} /></g>)}
        </Caixa>
      );
    // AS NOTÍCIAS: manchetes empilhadas
    case 'ac_noticias':
      return (
        <Caixa>
          {[0, 1, 2].map((i) => <g key={i}><rect x="8" y={8 + i * 17} width={[96, 80, 90][i]} height="5" rx="1" fill={ESCURO} /><rect x="8" y={16 + i * 17} width={[60, 70, 50][i]} height="3" rx="1" fill={CINZA} /></g>)}
        </Caixa>
      );
    // O CALENDÁRIO ECONÔMICO: a grade dos dias
    case 'ac_calendario':
      return (
        <Caixa>
          {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => <rect key={i} x={8 + (i % 4) * 27} y={10 + Math.floor(i / 4) * 24} width="23" height="20" rx="2" fill={PAPEL} stroke={G} />)}
          <rect x="11" y="14" width="10" height="3" rx="1" fill={AMBAR} /><rect x="65" y="38" width="12" height="3" rx="1" fill={AMBAR} />
        </Caixa>
      );
    default:
      return <Caixa><rect x="10" y="10" width="100" height="44" rx="4" fill={PAPEL} stroke={G} /></Caixa>;
  }
}
