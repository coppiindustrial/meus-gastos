import { useMemo, useState } from 'react';
import Modal from '../Modal.jsx';
import Tooltip from '../Tooltip.jsx';
import AbasPilula from '../AbasPilula.jsx';
import LegendaSeries from './LegendaSeries.jsx';
import { IconMaximize, IconMinimize } from '../icons.jsx';
import { compsDoHistorico, resumoPeriodo, variacao } from '../../lib/visaoGeral.js';
import { formatBRL } from '../../lib/dinheiro.js';
import { addMeses, competenciaCurta, nomeCompetencia } from '../../lib/format.js';
import { exportCsv } from '../../lib/exportCsv.js';

// A AMPLIAÇÃO DO "ENTRADAS × GASTOS" (28/10/2026), que SUBSTITUIU a tela "Evolução mensal": o mesmo
// gráfico repetido com uma tabela não precisava de tela própria. É o `PainelAmpliado` do Gestor —
// 1280px com teto de 95vw e 90% da altura, e o botão de tela cheia (96vw × 94vh) — com a tabela COMPLETA
// (as colunas da Evolução: cartão, fixos, avulsos e acumulado, mais o ano anterior) e a linha de Total.
// "Todo o histórico" é o que a Evolução mostrava: do primeiro ao último mês com lançamento; o padrão
// continua sendo o período dos filtros da tela.
//
// `linhas`: as da `resumo_mensal` já filtradas por tipo/origem/categoria. `comps`: o período da tela.
// `desenhar(porMes, anterior, { rotulosAte })`: o gráfico na forma escolhida (quem sabe das formas é a tela).

const ABAS_PERIODO = [{ key: 'tela', label: 'Período da tela' }, { key: 'tudo', label: 'Todo o histórico' }];
const BTN_ICONE = 'inline-flex h-[28px] w-[28px] items-center justify-center rounded-[4px] text-gray-400 transition hover:bg-gray-100 hover:text-gray-600';
const TH = 'whitespace-nowrap border-b border-gray-200 px-2.5 py-2 text-[10.5px] font-semibold uppercase tracking-wide text-gray-500';
const TD = 'whitespace-nowrap border-b border-gray-100 px-2.5 py-1.5 tabular-nums';
const TF = 'whitespace-nowrap border-t border-gray-200 bg-hx-f9fafb px-2.5 py-2 font-semibold tabular-nums';

export default function AmpliadoEntradasGastos({ onClose, linhas, comps, textoPer, comparar, forma, seletorForma, series, ctrl, onMes, desenhar }) {
  const [quais, setQuais] = useState('tela');
  const [cheio, setCheio] = useState(false);
  const historico = useMemo(() => compsDoHistorico(linhas), [linhas]);
  const usados = quais === 'tudo' ? historico : comps;
  const r = useMemo(() => resumoPeriodo(linhas, usados), [linhas, usados]);
  // O "um ano antes" sai do histórico inteiro, então vale nos dois modos.
  const gastosDe = useMemo(() => Object.fromEntries(resumoPeriodo(linhas, historico).porMes.map((m) => [m.competencia, m.gastos])), [linhas, historico]);
  const anterior = comparar ? Object.fromEntries(usados.map((c) => [c, gastosDe[addMeses(c, -12)] ?? 0])) : null;

  let acum = 0;
  const linhasTab = r.porMes.filter((m) => m.temDado).map((m) => {
    acum += m.saldo;
    const ant = anterior?.[m.competencia] ?? 0;
    return { ...m, acumulado: acum, anterior: ant, variacao: anterior ? variacao(m.gastos, ant) : null };
  });
  const soma = (k) => linhasTab.reduce((s, m) => s + m[k], 0);
  const totAnt = soma('anterior');
  const varTotal = anterior && totAnt ? variacao(soma('gastos'), totAnt) : null;
  const pctVar = (v) => (v === null ? '—' : `${v > 0 ? '+' : ''}${v}%`);
  const subtitulo = `${quais === 'tudo' ? (historico.length ? `${competenciaCurta(historico[0])} a ${competenciaCurta(historico[historico.length - 1])}` : 'todo o histórico') : textoPer} · ${linhasTab.length} ${linhasTab.length === 1 ? 'mês' : 'meses'} com lançamento`;

  const exportar = () => exportCsv(`entradas-gastos-${quais === 'tudo' ? 'historico' : `${comps[0]}-${comps[comps.length - 1]}`}`, linhasTab, [
    { key: 'competencia', label: 'Mês' },
    { key: 'entradas', label: 'Entradas', tipo: 'dinheiro', map: (m) => m.entradas / 100 },
    { key: 'cartao', label: 'Cartão', tipo: 'dinheiro', map: (m) => m.cartao / 100 },
    { key: 'fixo', label: 'Fixos', tipo: 'dinheiro', map: (m) => m.fixo / 100 },
    { key: 'manual', label: 'Avulsos', tipo: 'dinheiro', map: (m) => m.manual / 100 },
    { key: 'gastos', label: 'Gastos', tipo: 'dinheiro', map: (m) => m.gastos / 100 },
    { key: 'saldo', label: 'Saldo', tipo: 'dinheiro', map: (m) => m.saldo / 100 },
    { key: 'acumulado', label: 'Acumulado', tipo: 'dinheiro', map: (m) => m.acumulado / 100 },
    ...(anterior ? [
      { key: 'anterior', label: 'Gastos um ano antes', tipo: 'dinheiro', map: (m) => m.anterior / 100 },
      { key: 'variacao', label: 'Variação %', map: (m) => m.variacao ?? '' },
    ] : []),
    { key: 'qtd', label: 'Lançamentos' },
  ]);

  const acoes = (
    <>
      <button type="button" className="btn-secondary !h-[30px] !px-3 !text-[12.5px]" onClick={exportar} disabled={!linhasTab.length}>Exportar CSV</button>
      <Tooltip label={cheio ? 'Sair da tela cheia' : 'Tela cheia'}>
        <button type="button" onClick={() => setCheio((c) => !c)} aria-label={cheio ? 'Sair da tela cheia' : 'Tela cheia'} className={BTN_ICONE}>
          {cheio ? <IconMinimize className="h-3.5 w-3.5" /> : <IconMaximize className="h-3.5 w-3.5" />}
        </button>
      </Tooltip>
    </>
  );

  return (
    <Modal open onClose={onClose} title="Entradas × gastos" subtitulo={subtitulo} acoes={acoes} alturaCheia animarTamanho
      maxWidth={cheio ? 'max-w-[96vw]' : 'max-w-[min(1280px,95vw)]'} altura={cheio ? 'h-[94vh]' : 'h-[90vh]'}>
      <div className="mb-1 flex flex-wrap items-center gap-2">
        {seletorForma}
        <AbasPilula abas={ABAS_PERIODO} valor={quais} onChange={setQuais} variante="claro" altura={30} folga={2} />
      </div>
      <div style={{ height: cheio ? 'max(340px, 46vh)' : 340 }}>{desenhar(r.porMes, anterior, { rotulosAte: 24 })}</div>
      {forma !== 'saldo' && <LegendaSeries series={series} ctrl={ctrl} />}

      <div className="mt-4 overflow-x-auto rounded-md border border-gray-200">
        <table className="w-full text-[12.5px]">
          <thead className="bg-hx-f9fafb">
            <tr>
              <th className={`${TH} text-left`}>Mês</th>
              {['Entradas', 'Cartão', 'Fixos', 'Avulsos', 'Gastos', 'Saldo', 'Acumulado', ...(anterior ? ['Um ano antes', 'Variação'] : []), 'Lanç.'].map((h) => (
                <th key={h} className={`${TH} text-right`} title={h === 'Lanç.' ? 'Lançamentos' : h === 'Um ano antes' ? 'Gastos no mesmo mês um ano antes' : undefined}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {linhasTab.map((m) => (
              <tr key={m.competencia} className="cursor-pointer hover:bg-hx-f9fafb" onClick={() => onMes(m.competencia)} title="Abrir os lançamentos do mês">
                <td className={`${TD} text-gray-800`}>{nomeCompetencia(m.competencia)}</td>
                <td className={`${TD} text-right text-green-700`}>{formatBRL(m.entradas)}</td>
                <td className={`${TD} text-right text-gray-500`}>{formatBRL(m.cartao)}</td>
                <td className={`${TD} text-right text-gray-500`}>{formatBRL(m.fixo)}</td>
                <td className={`${TD} text-right text-gray-500`}>{formatBRL(m.manual)}</td>
                <td className={`${TD} text-right font-semibold text-gray-900`}>{formatBRL(m.gastos)}</td>
                <td className={`${TD} text-right ${m.saldo < 0 ? 'text-hx-c0393d' : 'text-gray-700'}`}>{formatBRL(m.saldo)}</td>
                <td className={`${TD} text-right ${m.acumulado < 0 ? 'text-hx-c0393d' : 'text-gray-700'}`}>{formatBRL(m.acumulado)}</td>
                {anterior && <td className={`${TD} text-right text-gray-500`}>{m.anterior ? formatBRL(m.anterior) : '—'}</td>}
                {anterior && <td className={`${TD} text-right text-gray-500`}>{pctVar(m.variacao)}</td>}
                <td className={`${TD} text-right text-gray-500`}>{m.qtd}</td>
              </tr>
            ))}
          </tbody>
          {linhasTab.length > 0 && (
            <tfoot>
              <tr>
                <td className={`${TF} text-gray-800`}>Total · {linhasTab.length} {linhasTab.length === 1 ? 'mês' : 'meses'}</td>
                <td className={`${TF} text-right text-green-700`}>{formatBRL(soma('entradas'))}</td>
                <td className={`${TF} text-right text-gray-700`}>{formatBRL(soma('cartao'))}</td>
                <td className={`${TF} text-right text-gray-700`}>{formatBRL(soma('fixo'))}</td>
                <td className={`${TF} text-right text-gray-700`}>{formatBRL(soma('manual'))}</td>
                <td className={`${TF} text-right text-gray-900`}>{formatBRL(soma('gastos'))}</td>
                <td className={`${TF} text-right ${soma('saldo') < 0 ? 'text-hx-c0393d' : 'text-gray-800'}`}>{formatBRL(soma('saldo'))}</td>
                <td className={`${TF} text-right text-gray-400`}>—</td>
                {anterior && <td className={`${TF} text-right text-gray-700`}>{totAnt ? formatBRL(totAnt) : '—'}</td>}
                {anterior && <td className={`${TF} text-right text-gray-700`}>{pctVar(varTotal)}</td>}
                <td className={`${TF} text-right text-gray-700`}>{soma('qtd')}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </Modal>
  );
}
