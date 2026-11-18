import BalaoGrafico, { useBalao } from '../graficos/BalaoGrafico.jsx';
import { formatBRL, valorParaCampo } from '../../lib/dinheiro.js';
import { competenciaCurta, nomeCompetencia } from '../../lib/format.js';

// O CUSTO FIXO TOTAL (18/11/2026, a opção B do mockup "Média do custo fixo"): a faixa embaixo das duas tabelas dos Gastos
// fixos — os fixos lançados à mão + as categorias fixas, mês a mês, e a MÉDIA do custo fixo (a soma das médias das duas).
// As mesmas larguras da `MatrizFixos` (os meses um embaixo do outro). Cada célula: o que já se sabe (o lançado; nas
// categorias, o que caiu e as parcelas que já estão numa fatura) e, de hoje em diante, o que ainda falta ("+N" embaixo; só
// o que falta = tracejado). Na Variação %, o % do que já se sabe sobre o mês anterior, até o mês de hoje.
// `custo`: o de `custoFixoDoAno`. `hoje`: 'AAAA-MM'. `modo`: 'valor' | 'variacao'.

const LARG = 280;
const curto = (v) => Math.round(v / 100).toLocaleString('pt-BR');
const fmt = (v) => valorParaCampo(v).replace(/\B(?=(\d{3})+,)/g, '.');
const pct = (atual, antes) => (antes ? Math.round(((atual - antes) / antes) * 100) : null);

export default function CustoFixoTotal({ custo, hoje, modo = 'valor' }) {
  const balao = useBalao(LARG, 160);
  const { comps, linhas } = custo;
  const colHoje = comps.indexOf(hoje);
  const variacao = modo === 'variacao';
  const passa = (chave) => ({ onMouseMove: balao.aoMover(chave), onMouseLeave: balao.aoSair });
  const [mao, cats, total] = linhas;

  const balaoDe = (chave) => {
    const [tipo, i] = chave.split(':');
    if (tipo === 'm') {
      return {
        titulo: `Custo fixo médio · ${comps[0].slice(0, 4)}`,
        itens: [
          { rotulo: 'Fixos à mão', valor: formatBRL(mao.media), cor: 'var(--origem-fixo)' },
          { rotulo: 'Categorias fixas', valor: formatBRL(cats.media) },
          { rotulo: 'Por mês', valor: formatBRL(total.media) },
        ],
        nota: 'Fixo à mão: a média dos meses lançados. Categoria que vem todo mês: a média dos meses fechados; a anual (IPTU, IPVA…): o ano ÷ 12. O total é a soma das médias.',
      };
    }
    const k = Number(i);
    const linha = (l) => formatBRL(l.celulas[k].conhecido + l.celulas[k].falta);
    const falta = total.celulas[k].falta;
    return {
      titulo: `Custo fixo · ${nomeCompetencia(comps[k])}`,
      itens: [
        { rotulo: 'Fixos à mão', valor: linha(mao), cor: 'var(--origem-fixo)' },
        { rotulo: 'Categorias fixas', valor: linha(cats) },
        { rotulo: 'Total', valor: linha(total) },
      ],
      nota: falta ? `${formatBRL(falta)} ainda é previsto (o sugerido dos fixos e o previsto das categorias).` : undefined,
    };
  };
  const conteudo = balao.ativo ? balaoDe(balao.ativo) : null;

  const celula = (l, i) => {
    const { conhecido, falta } = l.celulas[i];
    if (variacao) {
      if (i > colHoje && colHoje >= 0) return null;
      if (!conhecido) return null;
      const v = i ? pct(conhecido, l.celulas[i - 1].conhecido) : null;
      if (v === null) return <span className="text-gray-300">—</span>;
      return <span className={v > 0 ? 'text-hx-b91c1c' : v < 0 ? 'text-hx-15803d' : 'text-gray-400'}>{v > 0 ? '+' : ''}{v}%</span>;
    }
    if (!conhecido && !falta) return <span className="text-gray-300">—</span>;
    if (!conhecido) return <span className="inline-block rounded-[4px] border border-dashed border-gray-300 px-[5px] italic leading-[16px] text-gray-400">{curto(falta)}</span>;
    return (
      <span className="flex flex-col items-end leading-[1.15]">
        <span>{curto(conhecido)}</span>
        {falta > 0 && <span className="text-[10.5px] font-normal italic text-gray-400">+{curto(falta)}</span>}
      </span>
    );
  };

  const th = 'h-[30px] border-b border-r border-gray-300 bg-hx-f9fafb px-2 text-right text-[11px] font-semibold uppercase tracking-wide text-gray-500';

  return (
    <div className="mt-5">
      <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1">
        <b className="text-[13px] font-semibold text-gray-900">Custo fixo total</b>
        <span className="text-[12px] text-gray-500">os fixos lançados à mão + as categorias fixas, mês a mês, e a média do custo fixo</span>
      </div>
      <div className="overflow-auto rounded-lg border border-gray-300 bg-white" style={{ scrollPaddingLeft: 210 }}>
        <table className="w-full min-w-[1080px] table-fixed border-separate border-spacing-0 text-[12.5px]">
          <colgroup><col style={{ width: 210 }} />{comps.map((c) => <col key={c} />)}<col style={{ width: 84 }} /></colgroup>
          <thead>
            <tr>
              <th className={`${th} sticky left-0 z-20 text-left`}>Custo fixo</th>
              {comps.map((c, i) => (
                <th key={c} className={`${th} ${i === colHoje ? '!bg-hx-eef2f7 text-gray-800' : ''}`}
                  style={i === colHoje ? { boxShadow: 'inset 0 -2px 0 var(--grade-sel)' } : undefined}>
                  {competenciaCurta(c).slice(0, 3)}
                </th>
              ))}
              <th {...passa('m:0')} className={`${th} !border-r-0 cursor-help`}>Média</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => {
              const ehTotal = l.chave === 'total';
              const fundo = ehTotal ? 'bg-hx-f9fafb' : 'bg-white';
              return (
                <tr key={l.chave} className={ehTotal ? 'font-semibold' : ''}>
                  <td className={`sticky left-0 z-10 h-[34px] border-r border-gray-300 px-3 text-left ${ehTotal ? 'text-gray-900' : 'border-b border-b-gray-100 text-gray-700'} ${fundo}`}
                    style={ehTotal ? { boxShadow: 'inset 3px 0 0 var(--origem-fixo)' } : undefined}>
                    {l.nome}
                  </td>
                  {comps.map((c, i) => (
                    <td key={c} {...passa(`c:${i}`)}
                      className={`h-[34px] cursor-help border-r border-gray-100 px-2 text-right tabular-nums ${ehTotal ? 'text-gray-900' : 'border-b text-gray-700'} ${fundo}`}>
                      {celula(l, i)}
                    </td>
                  ))}
                  <td {...passa('m:0')}
                    className={`h-[34px] cursor-help bg-hx-f9fafb px-2 text-right tabular-nums ${ehTotal ? 'font-bold' : 'border-b border-gray-100 text-gray-700'}`}
                    style={ehTotal ? { color: 'var(--origem-fixo)' } : undefined}>
                    {l.media ? fmt(l.media) : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {conteudo && <BalaoGrafico pos={balao.pos} largura={LARG} {...conteudo} />}
    </div>
  );
}
