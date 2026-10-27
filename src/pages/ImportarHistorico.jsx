import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import CabecalhoPagina from '../components/CabecalhoPagina.jsx';
import Spinner, { PageLoading } from '../components/Spinner.jsx';
import { Etiqueta } from '../components/Comuns.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { useConfirmacao } from '../context/ConfirmContext.jsx';
import { listarCartoes, listarCategorias } from '../api/cadastros.js';
import { conferirImportado, desfazerImportacao, importarPlanilha, prepararImportacao } from '../api/importacao.js';
import { formatBRL } from '../lib/dinheiro.js';
import { formatDate } from '../lib/format.js';

// FASE 2 — traz o histórico da planilha antiga. O JSON é gerado no PC por
// `node scripts/migrar-planilha.mjs "…\Gastos total.xlsx"` (sai em dados/planilha.json).
// Depois de importar, a CONFERÊNCIA compara linha a linha os totais do arquivo com o que ficou no banco.

const COMANDO = 'node scripts/migrar-planilha.mjs "C:\\Users\\MayCo\\OneDrive\\CONTAS\\Gastos\\Gastos total.xlsx"';

// Linhas da conferência: cada fatura (pelo nome do arquivo) e os três grupos sem fatura.
function linhasConferencia(esperado, obtido) {
  const vazio = { linhas: 0, total: 0 };
  const faturas = Object.keys(esperado.porFatura).map((arq) => ({
    rotulo: arq.replace(/_convertida\.csv$|\.csv$/i, ''),
    esperado: esperado.porFatura[arq],
    obtido: obtido?.porFatura?.[arq] ?? vazio,
  }));
  return [
    ...faturas,
    { rotulo: 'Gastos fixos', esperado: esperado.fixos, obtido: obtido?.fixos ?? vazio },
    { rotulo: 'Gastos manuais', esperado: esperado.manuais, obtido: obtido?.manuais ?? vazio },
    { rotulo: 'Entradas', esperado: esperado.entradas, obtido: obtido?.entradas ?? vazio },
  ];
}

function TabelaConferencia({ esperado, obtido }) {
  const linhas = linhasConferencia(esperado, obtido);
  const ok = (l) => l.esperado.linhas === l.obtido.linhas && l.esperado.total === l.obtido.total;
  const tudoOk = obtido && linhas.every(ok);
  return (
    <div className="card mt-4 overflow-x-auto">
      <div className="flex items-center gap-2 border-b border-gray-200 px-4 py-2.5">
        <h2 className="flex-1 text-sm font-semibold text-gray-800">Conferência: planilha × app</h2>
        {obtido && (tudoOk ? <Etiqueta tom="verde">Tudo confere</Etiqueta> : <Etiqueta tom="vermelho">Há diferenças</Etiqueta>)}
      </div>
      <table className="w-full">
        <thead className="border-b border-gray-200 bg-gray-50">
          <tr>
            <th className="table-th">Origem</th>
            <th className="table-th text-right">Linhas planilha</th>
            <th className="table-th text-right">Total planilha</th>
            <th className="table-th text-right">Linhas app</th>
            <th className="table-th text-right">Total app</th>
            <th className="table-th w-10" aria-label="Situação" />
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {linhas.map((l) => (
            <tr key={l.rotulo}>
              <td className="table-td">{l.rotulo}</td>
              <td className="table-td text-right tabular-nums">{l.esperado.linhas}</td>
              <td className="table-td text-right tabular-nums">{formatBRL(l.esperado.total)}</td>
              <td className="table-td text-right tabular-nums">{obtido ? l.obtido.linhas : '—'}</td>
              <td className="table-td text-right tabular-nums">{obtido ? formatBRL(l.obtido.total) : '—'}</td>
              <td className="table-td text-center">{obtido && (ok(l) ? <span className="text-green-700">✓</span> : <span className="text-hx-c0393d">✗</span>)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function ImportarHistorico() {
  const toast = useToast();
  const confirmar = useConfirmacao();
  const inputRef = useRef(null);
  const [importado, setImportado] = useState(null); // o que já está no banco (conferirImportado)
  const [dados, setDados] = useState(null);         // o JSON escolhido
  const [prep, setPrep] = useState(null);
  const [andamento, setAndamento] = useState('');
  const [ocupado, setOcupado] = useState(false);

  const recarregar = useCallback(async () => {
    try { setImportado(await conferirImportado()); } catch (err) { toast.error(err.message); setImportado({ quantidade: 0 }); }
  }, [toast]);
  useEffect(() => { recarregar(); }, [recarregar]);

  const escolherArquivo = async (arquivo) => {
    if (!arquivo) return;
    try {
      const json = JSON.parse(await arquivo.text());
      const [categorias, cartoes] = await Promise.all([listarCategorias(), listarCartoes()]);
      setPrep(prepararImportacao(json, categorias, cartoes));
      setDados(json);
    } catch (err) {
      toast.error(err instanceof SyntaxError ? 'O arquivo não é um JSON válido.' : err.message);
    } finally {
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const importar = async () => {
    setOcupado(true);
    try {
      await importarPlanilha(dados, prep, setAndamento);
      toast.success('Histórico importado.');
      await recarregar();
    } catch (err) {
      toast.error(`A importação parou: ${err.message} Use "Desfazer importação" e tente de novo.`);
      await recarregar();
    } finally { setOcupado(false); setAndamento(''); }
  };

  const desfazer = async () => {
    const ok = await confirmar({
      titulo: 'Desfazer a importação da planilha?',
      texto: `Apaga os ${importado.quantidade} lançamentos, as faturas e as regras que vieram da planilha. O que você lançou no app fica.`,
      confirmar: 'Desfazer importação',
      perigo: true,
    });
    if (!ok) return;
    setOcupado(true);
    try { await desfazerImportacao(); toast.success('Importação desfeita.'); await recarregar(); } catch (err) { toast.error(err.message); }
    setOcupado(false);
  };

  if (!importado) return (<div><CabecalhoPagina titulo="Importar histórico" /><PageLoading /></div>);

  const jaImportado = importado.quantidade > 0;
  const bloqueado = prep && (prep.categoriasFaltando.length > 0 || prep.cartoesFaltando.length > 0);

  return (
    <div>
      <CabecalhoPagina titulo="Importar histórico"
        acoes={jaImportado && <button type="button" className="btn-secondary !text-hx-c0393d" onClick={desfazer} disabled={ocupado}>Desfazer importação</button>} />

      {jaImportado ? (
        <div className="mt-6 max-w-4xl">
          <p className="text-sm text-gray-600">
            A planilha já foi importada: {importado.quantidade} lançamentos e {importado.regras} regras.
            {!dados && ' Para conferir os totais, escolha de novo o arquivo dados/planilha.json.'}
          </p>
          {!dados && <button type="button" className="btn-secondary mt-3" onClick={() => inputRef.current?.click()}>Escolher planilha.json para conferir</button>}
          {dados && <TabelaConferencia esperado={dados.conferencia} obtido={importado} />}
        </div>
      ) : (
        <div className="mt-6 max-w-4xl space-y-4">
          <div className="card p-5 text-sm text-gray-700">
            <h2 className="text-base font-semibold text-gray-800">Como importar</h2>
            <ol className="mt-2 list-decimal space-y-1.5 pl-5">
              <li>
                Antes, crie as <Link className="font-medium underline" to="/cadastros/categorias">categorias</Link> e
                os <Link className="font-medium underline" to="/cadastros/cartoes">cartões</Link> sugeridos (a importação
                liga cada linha a eles pelo nome).
              </li>
              <li>
                No PC, na pasta do projeto, rode:
                <code className="mt-1 block overflow-x-auto rounded bg-gray-100 px-2 py-1 text-[12px] text-gray-800">{COMANDO}</code>
                Ele gera <code>dados/planilha.json</code> (fica fora do git).
              </li>
              <li>Escolha esse arquivo abaixo, confira a prévia e importe.</li>
            </ol>
            <button type="button" className="btn-primary mt-4" onClick={() => inputRef.current?.click()} disabled={ocupado}>Escolher planilha.json</button>
          </div>

          {dados && prep && (
            <div className="card p-5 text-sm text-gray-700">
              <h2 className="text-base font-semibold text-gray-800">Prévia — {dados.arquivo}</h2>
              <p className="mt-1 text-xs text-gray-500">Gerado em {formatDate(dados.geradoEm)}</p>
              <ul className="mt-3 grid gap-x-6 gap-y-1 sm:grid-cols-2">
                <li>{dados.faturas.length} faturas, {prep.totalCartao} lançamentos de cartão</li>
                <li>{dados.conferencia.fixos.linhas} gastos fixos</li>
                <li>{dados.conferencia.manuais.linhas} gastos manuais</li>
                <li>{dados.conferencia.entradas.linhas} entradas</li>
                <li>{dados.regras.length} regras de classificação</li>
                {dados.ignoradas.length > 0 && <li className="text-gray-500">Ignoradas: {dados.ignoradas.join('; ')}</li>}
              </ul>
              {prep.cartoesFaltando.length > 0 && (
                <p className="mt-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-amber-800">
                  Cadastre antes os cartões: <strong>{prep.cartoesFaltando.join(', ')}</strong>.
                </p>
              )}
              {prep.categoriasFaltando.length > 0 && (
                <p className="mt-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-amber-800">
                  Estas categorias da planilha não existem no app (crie ou renomeie antes):{' '}
                  <strong>{prep.categoriasFaltando.join(', ')}</strong>.
                </p>
              )}
              <div className="mt-4 flex items-center gap-3">
                <button type="button" className="btn-primary" onClick={importar} disabled={ocupado || bloqueado}>
                  {ocupado ? <><Spinner className="h-4 w-4" /> Importando…</> : 'Importar'}
                </button>
                {andamento && <span className="text-sm text-gray-500">{andamento}</span>}
              </div>
            </div>
          )}
          {dados && <TabelaConferencia esperado={dados.conferencia} obtido={null} />}
        </div>
      )}
      <input ref={inputRef} type="file" accept="application/json,.json" hidden onChange={(e) => escolherArquivo(e.target.files?.[0])} />
    </div>
  );
}
