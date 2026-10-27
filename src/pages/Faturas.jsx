import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import CabecalhoPagina from '../components/CabecalhoPagina.jsx';
import ListaVazia from '../components/ListaVazia.jsx';
import { PageLoading } from '../components/Spinner.jsx';
import { BotaoExcluir, Etiqueta } from '../components/Comuns.jsx';
import ImportarFatura from './ImportarFatura.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { useConfirmacao } from '../context/ConfirmContext.jsx';
import { excluirFatura, listarFaturas } from '../api/faturas.js';
import { listarCartoes } from '../api/cadastros.js';
import { formatBRL } from '../lib/dinheiro.js';
import { competenciaCurta, formatDate, formatDateTime } from '../lib/format.js';
import { lsSet } from '../lib/storage.js';

// As faturas importadas (do CSV ou da planilha) e o botão de importar uma nova.
export default function Faturas() {
  const toast = useToast();
  const confirmar = useConfirmacao();
  const [faturas, setFaturas] = useState(null);
  const [cartoes, setCartoes] = useState([]);
  const [importando, setImportando] = useState(false);
  const [aviso, setAviso] = useState(null); // pendências da última importação

  const carregar = useCallback(async () => {
    try {
      const [f, c] = await Promise.all([listarFaturas(), listarCartoes()]);
      setFaturas(f);
      setCartoes(c);
    } catch (err) { toast.error(err.message); setFaturas([]); }
  }, [toast]);
  useEffect(() => { carregar(); }, [carregar]);

  const apagar = async (f) => {
    const ok = await confirmar({
      titulo: `Excluir a fatura ${f.cartao?.nome} de ${formatDate(f.vencimento)}?`,
      texto: `Os ${f.qtd} lançamentos dela também são apagados.`,
      confirmar: 'Excluir',
      perigo: true,
    });
    if (!ok) return;
    try { await excluirFatura(f.id); toast.success('Fatura excluída.'); carregar(); } catch (err) { toast.error(err.message); }
  };

  return (
    <div>
      <CabecalhoPagina titulo="Faturas"
        acoes={<button type="button" className="btn-primary" onClick={() => setImportando(true)}>Importar fatura</button>} />

      {aviso?.revisar > 0 && (
        <div className="mt-4 max-w-4xl rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {aviso.revisar} lançamento(s) da fatura ficaram sem categoria.{' '}
          <Link to="/pendencias" className="font-semibold underline">Revisar pendências</Link>
        </div>
      )}

      <div className="mt-4 max-w-4xl">
        {!faturas ? <PageLoading /> : faturas.length === 0 ? <ListaVazia>Nenhuma fatura importada.</ListaVazia> : (
          <div className="card overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-gray-200 bg-gray-50">
                <tr>
                  <th className="table-th">Cartão</th>
                  <th className="table-th">Vencimento</th>
                  <th className="table-th hidden sm:table-cell">Conta em</th>
                  <th className="table-th text-right">Compras</th>
                  <th className="table-th text-right">Total</th>
                  <th className="table-th hidden md:table-cell">Origem</th>
                  <th className="table-th w-[52px]" aria-label="Ações" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {faturas.map((f) => (
                  <tr key={f.id} className="group/linha hover:bg-gray-50">
                    <td className="table-td font-medium text-gray-800">{f.cartao?.nome}</td>
                    <td className="table-td">{formatDate(f.vencimento)}</td>
                    <td className="table-td hidden sm:table-cell">
                      {/* Abre os lançamentos do mês em que a fatura conta. */}
                      <Link to="/lancamentos" onClick={() => lsSet('lancamentos_mes', f.competencia)} className="hover:underline">
                        {competenciaCurta(f.competencia)}
                      </Link>
                    </td>
                    <td className="table-td text-right tabular-nums">{f.qtd}</td>
                    <td className="table-td text-right tabular-nums">{formatBRL(f.total_centavos)}</td>
                    <td className="table-td hidden md:table-cell">
                      {f.importado_de === 'planilha'
                        ? <Etiqueta>Planilha</Etiqueta>
                        : <span className="text-gray-500" title={f.arquivo}>CSV · {formatDateTime(f.importada_em)}</span>}
                    </td>
                    <td className="table-td">
                      <span className="opacity-0 transition-opacity group-hover/linha:opacity-100 focus-within:opacity-100">
                        <BotaoExcluir titulo="Excluir fatura" onClick={() => apagar(f)} />
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {importando && (
        <ImportarFatura cartoes={cartoes} onFechar={() => setImportando(false)}
          onImportada={(r) => { setImportando(false); setAviso(r); carregar(); }} />
      )}
    </div>
  );
}
