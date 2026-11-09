import { CartaoKpi } from './CartoesResumo.jsx';
import { brlCurto, formatBRL } from '../../lib/dinheiro.js';
import { competenciaCurta } from '../../lib/format.js';
import { varCor } from '../../lib/varCor.js';

// JÁ COMPROMETIDO EM PARCELAS (09/11/2026, o mockup "Parcelas no resumo", opção A; no Patrimônio e na Visão geral, a pedido):
// o total das parcelas de cartão que ainda vão cair nas faturas, quanto isso é de um mês de renda e até quando; embaixo, uma
// barra hachurada por mês, com o balão por cartão. `parc` = `parcelasComprometidas` (lib/patrimonio.js). Não segue os
// filtros da tela (é sempre o de hoje, de todos os cartões).
export const COR_PARCELAS = varCor('#ea580c', 'texto');

export default function CartaoParcelas({ parc, onClicar }) {
  const pctDe = (v) => Math.round((v / parc.renda) * 100);
  return (
    <CartaoKpi compacto icone="parcelas" cor={COR_PARCELAS} rotulo="Já comprometido em parcelas" valor={formatBRL(parc.total)} valorCurto={brlCurto(parc.total)}
      corValor={parc.total ? 'text-hx-ea580c' : 'text-gray-900'} forma="barras" onClicar={onClicar}
      sub={!parc.total ? 'nenhuma parcela por vir' : [
        parc.pctRenda !== null ? `${Math.round(parc.pctRenda * 100)}% de um mês de renda` : null,
        `até ${competenciaCurta(parc.ate)}`,
      ].filter(Boolean).join(' · ')}
      titulo={parc.total ? [
        `${parc.compras} ${parc.compras === 1 ? 'compra' : 'compras'} parceladas no cartão, ${parc.parcelas} ${parc.parcelas === 1 ? 'parcela' : 'parcelas'} por vir.`,
        parc.porCartao.map((c) => `${c.nome}: ${formatBRL(c.valor)}`).join(' · '),
        parc.renda ? `A renda média dos 12 meses: ${formatBRL(parc.renda)} por mês.` : null,
        onClicar ? 'Clique para ver os cartões.' : null,
      ].filter(Boolean).join('\n') : undefined}
      serie={parc.meses.map((m) => ({ competencia: m.competencia, valor: m.valor }))}
      itensBalao={(i) => {
        const m = parc.meses[i];
        return [{ rotulo: 'Parcelas', valor: formatBRL(m.valor), cor: COR_PARCELAS }, ...(m.porCartao.length > 1 ? m.porCartao.map((c) => ({ rotulo: c.nome, valor: formatBRL(c.valor) })) : [])];
      }}
      nota={(i) => [
        parc.meses[i].porCartao.length === 1 ? parc.meses[i].porCartao[0].nome : null,
        parc.renda ? `${pctDe(parc.meses[i].valor)}% da renda média` : null,
      ].filter(Boolean).join(' · ')} />
  );
}
