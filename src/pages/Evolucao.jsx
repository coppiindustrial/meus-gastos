import { useCallback, useEffect, useMemo, useState } from 'react';
import CabecalhoPagina from '../components/CabecalhoPagina.jsx';
import ListaVazia from '../components/ListaVazia.jsx';
import { PageLoading } from '../components/Spinner.jsx';
import { BarrasMensais, COR_ENTRADAS, COR_GASTOS, Legenda } from '../components/graficos/Graficos.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { listarResumoMensal } from '../api/resumo.js';
import { totaisPorMes } from '../lib/resumo.js';
import { formatBRL } from '../lib/dinheiro.js';
import { addMeses, nomeCompetencia } from '../lib/format.js';
import { exportCsv } from '../lib/exportCsv.js';

// EVOLUÇÃO MENSAL: entradas × gastos mês a mês, em gráfico e em TABELA (a tabela também é a vista
// acessível do gráfico). Todos os meses do primeiro ao último com lançamento, sem buracos.
export default function Evolucao() {
  const toast = useToast();
  const [linhas, setLinhas] = useState(null);

  const carregar = useCallback(async () => {
    try { setLinhas(await listarResumoMensal()); } catch (err) { toast.error(err.message); setLinhas([]); }
  }, [toast]);
  useEffect(() => { carregar(); }, [carregar]);

  const meses = useMemo(() => {
    const porMes = totaisPorMes(linhas ?? []);
    const chaves = Object.keys(porMes).sort();
    if (!chaves.length) return [];
    const lista = [];
    let acumulado = 0;
    for (let c = chaves[0]; c <= chaves[chaves.length - 1]; c = addMeses(c, 1)) {
      const t = porMes[c] ?? { entradas: 0, gastos: 0, cartao: 0, fixo: 0, manual: 0, saldo: 0 };
      acumulado += t.saldo;
      lista.push({ competencia: c, ...t, acumulado });
    }
    return lista;
  }, [linhas]);

  const exportar = () => exportCsv('evolucao-mensal', meses, [
    { key: 'competencia', label: 'Mês' },
    { key: 'entradas', label: 'Entradas', tipo: 'dinheiro', map: (m) => m.entradas / 100 },
    { key: 'cartao', label: 'Cartão', tipo: 'dinheiro', map: (m) => m.cartao / 100 },
    { key: 'fixo', label: 'Fixos', tipo: 'dinheiro', map: (m) => m.fixo / 100 },
    { key: 'manual', label: 'Avulsos', tipo: 'dinheiro', map: (m) => m.manual / 100 },
    { key: 'gastos', label: 'Gastos', tipo: 'dinheiro', map: (m) => m.gastos / 100 },
    { key: 'saldo', label: 'Saldo', tipo: 'dinheiro', map: (m) => m.saldo / 100 },
    { key: 'acumulado', label: 'Acumulado', tipo: 'dinheiro', map: (m) => m.acumulado / 100 },
  ]);

  const total = meses.reduce((s, m) => ({ entradas: s.entradas + m.entradas, gastos: s.gastos + m.gastos }), { entradas: 0, gastos: 0 });

  return (
    <div>
      <CabecalhoPagina titulo="Evolução mensal"
        acoes={meses.length > 0 && <button type="button" className="btn-secondary" onClick={exportar}>Exportar CSV</button>} />
      {!linhas ? <PageLoading /> : meses.length === 0 ? <div className="mt-6"><ListaVazia>Nenhum lançamento ainda.</ListaVazia></div> : (
        <>
          <section className="card mt-4 p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-gray-800">Entradas × gastos</h2>
              <Legenda itens={[{ rotulo: 'Entradas', cor: COR_ENTRADAS }, { rotulo: 'Gastos', cor: COR_GASTOS }]} />
            </div>
            <BarrasMensais meses={meses} altura={220} />
          </section>

          <div className="card mt-4 overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-gray-200 bg-gray-50">
                <tr>
                  <th className="table-th">Mês</th>
                  <th className="table-th text-right">Entradas</th>
                  <th className="table-th hidden text-right md:table-cell">Cartão</th>
                  <th className="table-th hidden text-right md:table-cell">Fixos</th>
                  <th className="table-th hidden text-right md:table-cell">Avulsos</th>
                  <th className="table-th text-right">Gastos</th>
                  <th className="table-th text-right">Saldo</th>
                  <th className="table-th hidden text-right sm:table-cell">Acumulado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {[...meses].reverse().map((m) => (
                  <tr key={m.competencia} className="hover:bg-gray-50">
                    <td className="table-td">{nomeCompetencia(m.competencia)}</td>
                    <td className="table-td text-right tabular-nums text-green-700">{formatBRL(m.entradas)}</td>
                    <td className="table-td hidden text-right tabular-nums md:table-cell">{formatBRL(m.cartao)}</td>
                    <td className="table-td hidden text-right tabular-nums md:table-cell">{formatBRL(m.fixo)}</td>
                    <td className="table-td hidden text-right tabular-nums md:table-cell">{formatBRL(m.manual)}</td>
                    <td className="table-td text-right tabular-nums">{formatBRL(m.gastos)}</td>
                    <td className={`table-td text-right tabular-nums ${m.saldo < 0 ? 'text-hx-c0393d' : ''}`}>{formatBRL(m.saldo)}</td>
                    <td className="table-td hidden text-right tabular-nums sm:table-cell">{formatBRL(m.acumulado)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t border-gray-200 bg-gray-50 font-semibold">
                <tr>
                  <td className="table-td">Total</td>
                  <td className="table-td text-right tabular-nums">{formatBRL(total.entradas)}</td>
                  <td className="table-td hidden md:table-cell" colSpan={3} />
                  <td className="table-td text-right tabular-nums">{formatBRL(total.gastos)}</td>
                  <td className="table-td text-right tabular-nums">{formatBRL(total.entradas - total.gastos)}</td>
                  <td className="table-td hidden sm:table-cell" />
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
