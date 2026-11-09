import { CartaoKpi } from './CartoesResumo.jsx';
import { brlCurto, formatBRL } from '../../lib/dinheiro.js';
import { competenciaCurta, nomeCompetencia } from '../../lib/format.js';

// O QUE A RENDA JÁ TEM COMPROMETIDO (09/11/2026, a opção A do mockup "Comprometido na Visão geral"): dois números na fileira
// da Visão geral, no desenho dos outros (o número, uma linha embaixo e a curva com a área). Não seguem os filtros da tela: são
// sempre os de hoje. As cores são as das origens do app: o fixo em laranja, o cartão em azul.
//   · CUSTO FIXO (`custo` = `custoFixo` de lib/visaoGeral.js): o que os gastos fixos levam por mês — o próximo mês pela média
//     dos últimos lançamentos de cada fixo —, quantos são e quanto é da renda média; a curva, o que custaram nos meses fechados.
//   · PARCELAS QUE VÊM (`parc` = `parcelasComprometidas`): o total das parcelas de cartão que ainda vão cair nas faturas, quanto
//     é de um mês de renda e até quando; a curva desce mês a mês até a última, e o balão separa por cartão.
const COR_FIXO = 'var(--origem-fixo)';
const COR_CARTAO = 'var(--origem-cartao)';
const pct = (f) => `${Math.round(f * 100)}%`;
const porMes = (v) => (<>{v}<span className="text-[12px] font-medium tracking-normal text-gray-400"> /mês</span></>);

export function CartaoCustoFixo({ custo, onClicar }) {
  const mes = nomeCompetencia(custo.competencia).replace(/ de \d+$/, '').toLowerCase();
  return (
    <CartaoKpi compacto icone="fixo" cor={COR_FIXO} rotulo="Custo fixo" valor={porMes(formatBRL(custo.valor))} valorCurto={porMes(brlCurto(custo.valor))}
      onClicar={onClicar}
      sub={!custo.qtd ? 'nenhum gasto fixo' : [`${custo.qtd} ${custo.qtd === 1 ? 'fixo' : 'fixos'}`, custo.pctRenda !== null ? `${pct(custo.pctRenda)} da renda` : null].filter(Boolean).join(' · ')}
      titulo={[
        `O de ${mes}: cada fixo pela média dos últimos lançamentos dele (o novo, pelo valor padrão).`,
        custo.hoje.qtd ? `Este mês: ${formatBRL(custo.hoje.valor)} (o lançado e o que falta lançar).` : null,
        custo.renda ? `A renda média dos 12 meses: ${formatBRL(custo.renda)} por mês.` : null,
        onClicar ? 'Clique para ver os gastos fixos.' : null,
      ].filter(Boolean).join('\n')}
      serie={custo.historico} />
  );
}

export function CartaoParcelas({ parc, onClicar }) {
  return (
    <CartaoKpi compacto icone="parcelas" cor={COR_CARTAO} rotulo="Parcelas que vêm" valor={formatBRL(parc.total)} valorCurto={brlCurto(parc.total)}
      onClicar={onClicar}
      sub={!parc.total ? 'nenhuma parcela por vir' : [
        parc.pctRenda !== null ? `${pct(parc.pctRenda)} de um mês de renda` : null,
        `até ${competenciaCurta(parc.ate)}`,
      ].filter(Boolean).join(' · ')}
      titulo={parc.total ? [
        `${parc.compras} ${parc.compras === 1 ? 'compra parcelada' : 'compras parceladas'} no cartão, ${parc.parcelas} ${parc.parcelas === 1 ? 'parcela' : 'parcelas'} por vir.`,
        parc.porCartao.map((c) => `${c.nome}: ${formatBRL(c.valor)}`).join(' · '),
        parc.renda ? `A renda média dos 12 meses: ${formatBRL(parc.renda)} por mês.` : null,
        onClicar ? 'Clique para ver os cartões.' : null,
      ].filter(Boolean).join('\n') : undefined}
      serie={parc.meses.map((m) => ({ competencia: m.competencia, valor: m.valor }))}
      itensBalao={(i) => {
        const m = parc.meses[i];
        return [{ rotulo: 'Parcelas', valor: formatBRL(m.valor), cor: COR_CARTAO }, ...(m.porCartao.length > 1 ? m.porCartao.map((c) => ({ rotulo: c.nome, valor: formatBRL(c.valor) })) : [])];
      }}
      nota={(i) => [
        parc.meses[i].porCartao.length === 1 ? parc.meses[i].porCartao[0].nome : null,
        parc.renda ? `${pct(parc.meses[i].valor / parc.renda)} da renda média` : null,
      ].filter(Boolean).join(' · ')} />
  );
}
