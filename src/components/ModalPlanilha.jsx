import { useEffect, useState } from 'react';
import Modal from './Modal.jsx';
import AreaArrastar from './AreaArrastar.jsx';
import Spinner from './Spinner.jsx';
import { Etiqueta } from './Comuns.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { useConfirmacao } from '../context/ConfirmContext.jsx';
import { desfazerImportacao, lerDaPlanilha } from '../api/importacao.js';
import { avisarMudanca } from '../api/importacoes.js';
import { resumirPlanilha } from '../lib/importacoes.js';
import { formatBRL } from '../lib/dinheiro.js';
import { competenciaCurta, formatDateTime } from '../lib/format.js';

// O HISTÓRICO DA PLANILHA NUM POP-UP (29/10/2026, opção A do mockup): ela foi importada UMA vez, no começo, e não
// precisa mais de tela própria (a "Cadastros → Importar histórico" saiu). Aberto pela linha dela na aba Histórico
// da tela Importar, ele conta o que é e o que entrou — os números, por origem (nas cores da Visão geral) e mês a
// mês —, tudo do banco. "Conferir com o arquivo…" compara com o `dados/planilha.json` (fatura a fatura); "Desfazer
// a importação" apaga só o que tem a marca da planilha. `imp`: a linha do histórico.

const ORIGENS = [
  ['cartao', 'Cartão', 'var(--origem-cartao)'],
  ['fixo', 'Fixos', 'var(--origem-fixo)'],
  ['manual', 'Avulsos', 'var(--origem-manual)'],
  ['entrada', 'Entradas', 'var(--serie-entradas)'],
];
const plural = (n, um, varios) => `${n.toLocaleString('pt-BR')} ${n === 1 ? um : varios}`;
const TH = 'whitespace-nowrap border-b border-gray-200 bg-hx-f9fafb px-3 py-2 text-left text-[10.5px] font-semibold uppercase tracking-wide text-gray-500';
const TD = 'whitespace-nowrap border-b border-gray-100 px-3 py-1.5 tabular-nums';

// A conferência: o que o arquivo diz × o que está no banco, fatura a fatura e os três grupos sem fatura.
function Conferencia({ esperado, obtido }) {
  const vazio = { linhas: 0, total: 0 };
  const linhas = [
    ...Object.keys(esperado.porFatura).map((arq) => ({ rotulo: arq.replace(/_convertida\.csv$|\.csv$/i, ''), esperado: esperado.porFatura[arq], obtido: obtido.porFatura[arq] ?? vazio })),
    { rotulo: 'Gastos fixos', esperado: esperado.fixos, obtido: obtido.fixos },
    { rotulo: 'Gastos avulsos', esperado: esperado.manuais, obtido: obtido.manuais },
    { rotulo: 'Entradas', esperado: esperado.entradas, obtido: obtido.entradas },
  ];
  const ok = (l) => l.esperado.linhas === l.obtido.linhas && l.esperado.total === l.obtido.total;
  const tudo = linhas.every(ok);
  return (
    <div className="overflow-hidden rounded-md border border-gray-200">
      <div className="flex items-center gap-2 border-b border-gray-200 px-3 py-2">
        <span className="flex-1 text-[12.5px] font-semibold text-gray-800">Planilha × app</span>
        {tudo ? <Etiqueta tom="verde">Tudo confere</Etiqueta> : <Etiqueta tom="vermelho">Há diferenças</Etiqueta>}
      </div>
      <div className="max-h-[260px] overflow-auto">
        <table className="w-full text-[12.5px]">
          <thead><tr><th className={TH}>Origem</th><th className={`${TH} text-right`}>Planilha</th><th className={`${TH} text-right`}>App</th><th className={TH} /></tr></thead>
          <tbody>
            {linhas.map((l) => (
              <tr key={l.rotulo}>
                <td className={`${TD} text-gray-800`}>{l.rotulo}</td>
                <td className={`${TD} text-right text-gray-500`}>{l.esperado.linhas} · {formatBRL(l.esperado.total)}</td>
                <td className={`${TD} text-right text-gray-700`}>{l.obtido.linhas} · {formatBRL(l.obtido.total)}</td>
                <td className={`${TD} text-center`}>{ok(l) ? <span className="text-green-700">✓</span> : <span className="text-hx-c0393d">✗</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function ModalPlanilha({ imp, onFechar, onDesfeito }) {
  const toast = useToast();
  const confirmar = useConfirmacao();
  const [r, setR] = useState(null);
  const [conferindo, setConferindo] = useState(false);
  const [esperado, setEsperado] = useState(null); // a `conferencia` do planilha.json escolhido
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    lerDaPlanilha()
      .then(({ linhas, faturas, regras }) => setR({ ...resumirPlanilha(linhas, faturas), regras }))
      .catch((err) => { toast.error(err.message); onFechar(); });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const lerArquivo = async (arquivos) => {
    try {
      const json = JSON.parse(await arquivos[0].text());
      if (!json?.conferencia?.porFatura) throw new Error('Este arquivo não é o planilha.json gerado pelo script da planilha.');
      setEsperado(json.conferencia);
    } catch (err) { toast.error(err instanceof SyntaxError ? 'O arquivo não é um JSON válido.' : err.message); }
  };

  const desfazer = async () => {
    const ok = await confirmar({
      titulo: 'Desfazer a importação da planilha?',
      texto: `Apaga os ${r.qtd} lançamentos, as ${r.faturas} faturas e as ${r.regras} regras que vieram dela. O que você lançou ou importou pelo app fica.\nDepois de desfeita, ela não se importa de novo pelo app.`,
      confirmar: 'Desfazer a importação',
      perigo: true,
    });
    if (!ok) return;
    setOcupado(true);
    try {
      await desfazerImportacao();
      avisarMudanca();
      toast.success('Importação da planilha desfeita.');
      onDesfeito();
    } catch (err) { toast.error(err.message); setOcupado(false); }
  };

  const tile = (rotulo, valor, sub) => (
    <div className="min-w-0 rounded-md border border-gray-200 px-3 py-2.5">
      <div className="text-[11px] text-gray-500">{rotulo}</div>
      <div className="truncate text-[19px] font-bold tabular-nums text-gray-900">{valor}</div>
      {sub && <div className="truncate text-[11px] text-gray-400">{sub}</div>}
    </div>
  );
  const sec = (t) => <div className="text-[10.5px] font-semibold uppercase tracking-wide text-gray-500">{t}</div>;

  return (
    <Modal open onClose={ocupado ? () => {} : onFechar} title="Histórico da planilha" maxWidth="max-w-[820px]"
      subtitulo={`importado em ${formatDateTime(imp.criado_em)}${imp.arquivo ? ` · ${imp.arquivo}` : ''}`} padding="p-0">
      {!r ? <div className="flex justify-center py-12"><Spinner className="h-5 w-5" /></div> : (
        <>
          <div className="max-h-[66vh] space-y-3.5 overflow-auto px-5 py-4">
            <div className="flex items-start gap-2.5 rounded-md border border-gray-200 bg-hx-f9fafb px-3 py-2.5 text-[12.5px] leading-[1.5] text-gray-600">
              <span aria-hidden="true" className="mt-[3px] grid h-[14px] w-[14px] shrink-0 place-items-center rounded-full border border-current text-[9px] font-bold leading-none text-gray-400">i</span>
              <span>
                A planilha antiga (<b className="font-semibold text-gray-800">{imp.arquivo || 'Gastos total.xlsx'}</b>) trazida para o app de uma vez,
                no começo: as faturas que ela tinha, os fixos, os avulsos, as entradas e as regras de classificação. Daqui em diante
                tudo entra pelos importadores — ela não se importa de novo.
              </span>
            </div>

            {r.qtd === 0 ? (
              <p className="py-4 text-center text-[12.5px] text-gray-500">Nada da planilha está no banco (a importação foi desfeita).</p>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                  {tile('Lançamentos', r.qtd.toLocaleString('pt-BR'), r.de && `${competenciaCurta(r.de)} a ${competenciaCurta(r.ate)}`)}
                  {tile('Faturas', r.faturas, Object.entries(r.cartoes).map(([n, q]) => `${n} ${q}`).join(' · '))}
                  {tile('Regras', r.regras.toLocaleString('pt-BR'), 'de classificação')}
                  {tile('Gastos', formatBRL(r.gastos), `entradas ${formatBRL(r.entradas)}`)}
                </div>

                {sec('O que entrou, por origem')}
                <div className="grid grid-cols-2 gap-x-4 gap-y-2.5 sm:grid-cols-4">
                  {ORIGENS.map(([k, rotulo, cor]) => (
                    <div key={k} className="min-w-0">
                      <div className="flex items-center gap-1.5 text-[12px] text-gray-500"><span className="h-2 w-2 rounded-[2px]" style={{ background: cor }} />{rotulo}</div>
                      <div className="text-[15px] font-semibold tabular-nums text-gray-900">{r.porOrigem[k].qtd.toLocaleString('pt-BR')}</div>
                      <div className="text-[11.5px] tabular-nums text-gray-400">{formatBRL(r.porOrigem[k].total)}</div>
                    </div>
                  ))}
                </div>

                {sec('Mês a mês')}
                <div className="overflow-x-auto rounded-md border border-gray-200">
                  <table className="w-full text-[12.5px]">
                    <thead>
                      <tr><th className={TH}>Mês</th>{ORIGENS.map(([k, rotulo]) => <th key={k} className={`${TH} text-right`}>{rotulo}</th>)}<th className={`${TH} text-right`}>Lanç.</th></tr>
                    </thead>
                    <tbody>
                      {r.porMes.map((m) => (
                        <tr key={m.comp} className="hover:bg-hx-f9fafb">
                          <td className={`${TD} text-gray-800`}>{competenciaCurta(m.comp)}</td>
                          <td className={`${TD} text-right text-gray-700`}>{m.cartao ? formatBRL(m.cartao) : '—'}</td>
                          <td className={`${TD} text-right text-gray-700`}>{m.fixo ? formatBRL(m.fixo) : '—'}</td>
                          <td className={`${TD} text-right text-gray-700`}>{m.manual ? formatBRL(m.manual) : '—'}</td>
                          <td className={`${TD} text-right text-green-700`}>{m.entrada ? formatBRL(m.entrada) : '—'}</td>
                          <td className={`${TD} text-right text-gray-400`}>{m.qtd}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {conferindo && (
                  <>
                    {sec('Conferir com o arquivo')}
                    {esperado
                      ? <Conferencia esperado={esperado} obtido={r.conferencia} />
                      : <AreaArrastar onArquivos={lerArquivo} accept="application/json,.json" titulo="Arraste o planilha.json aqui ou"
                          formatos="o dados/planilha.json gerado pelo script da planilha — compara fatura a fatura com o que está no banco" />}
                  </>
                )}
              </>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-gray-200 bg-hx-f9fafb px-5 py-3">
            {r.qtd > 0 && (
              <>
                <button type="button" onClick={desfazer} disabled={ocupado}
                  className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-hx-c0393d transition-colors hover:underline disabled:opacity-50">
                  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></svg>
                  {ocupado ? 'Desfazendo…' : 'Desfazer a importação'}
                </button>
                {!conferindo && (
                  <button type="button" onClick={() => setConferindo(true)} className="text-[12.5px] text-gray-500 underline underline-offset-[3px] hover:text-gray-800">
                    Conferir com o arquivo…
                  </button>
                )}
              </>
            )}
            <span className="flex-1" />
            <span className="hidden text-[11.5px] text-gray-400 sm:inline">{plural(r.qtd, 'lançamento', 'lançamentos')} · {plural(r.faturas, 'fatura', 'faturas')}</span>
            <button type="button" className="btn-secondary" onClick={onFechar} disabled={ocupado}>Fechar</button>
          </div>
        </>
      )}
    </Modal>
  );
}
