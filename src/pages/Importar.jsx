import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import CabecalhoPagina from '../components/CabecalhoPagina.jsx';
import AbasPilula from '../components/AbasPilula.jsx';
import Checkbox from '../components/Checkbox.jsx';
import { PageLoading } from '../components/Spinner.jsx';
import { FaixaProvider, Trilho } from '../components/filtros/FaixaFiltros.jsx';
import { SegUnico } from '../components/filtros/Segmentos.jsx';
import ImportarArquivos from '../components/ImportarArquivos.jsx';
import ImportarFatura from './ImportarFatura.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { useConfirmacao } from '../context/ConfirmContext.jsx';
import { carregarSituacao, desfazerImportacao } from '../api/importacoes.js';
import { mesesDoAno } from '../lib/importacoes.js';
import { formatBRL } from '../lib/dinheiro.js';
import { competenciaCurta, formatDate, formatDateTime, nomeCompetencia, todayISO } from '../lib/format.js';
import { varCor } from '../lib/varCor.js';

// A TELA IMPORTAR (28/10/2026, o mockup "Importar · por mês, histórico e importadores"): o lugar único de
// tudo o que se importa. "Por mês" = uma linha por mês do ano, uma coluna por FONTE (cada cartão e o extrato),
// e em cada célula QUANDO aquilo entrou — ou o que falta (as contas em `lib/importacoes.js`). A célula que
// falta abre o importador certo, já com o cartão e o mês. "Histórico" = cada importação (migration 007),
// com o "Desfazer". O "Importar arquivos" do cabeçalho aceita as faturas e o extrato de uma vez.

const TOM = {
  ok: { background: varCor('#e7f6ee', 'fundo'), color: varCor('#15803d', 'texto') },
  planilha: { background: varCor('#eceef1', 'fundo'), color: varCor('#4b5563', 'texto') },
  parcial: { background: varCor('#e6effc', 'fundo'), color: varCor('#2563c4', 'texto') },
  falta: { background: varCor('#fdf3d9', 'fundo'), color: varCor('#9a6f00', 'texto') },
};
const CHIP = 'inline-flex items-center gap-1 rounded-[4px] px-1.5 py-0.5 text-[11.5px] font-semibold tabular-nums whitespace-nowrap';
const Ico = ({ d }) => (
  <svg viewBox="0 0 24 24" className="h-3 w-3 shrink-0" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d}</svg>
);
const CHECK = <Ico d={<polyline points="20 6 9 17 4 12" />} />;
const RELOGIO = <Ico d={<><circle cx="12" cy="12" r="9" /><polyline points="12 7 12 12 15.5 14" /></>} />;
const ddmm = (iso) => (iso ? formatDate(iso.slice(0, 10)).slice(0, 5) : '');
const ABAS = [{ key: 'mes', label: 'Por mês' }, { key: 'hist', label: 'Histórico' }];

// Uma célula da tabela. `onAgir`: o que o clique faz (importar), quando há algo a fazer.
function Celula({ cel, tipo, onAgir }) {
  const sub = (t) => <span className="mt-0.5 block text-[11px] text-gray-400">{t}</span>;
  let corpo;
  if (cel.estado === 'ok') {
    corpo = (
      <>
        {cel.planilha
          ? <span className={CHIP} style={TOM.planilha}>{CHECK}planilha</span>
          : <span className={CHIP} style={TOM.ok} title={cel.data ? `Importado em ${formatDateTime(cel.data)}` : undefined}>{CHECK}{cel.data ? ddmm(cel.data) : 'ok'}</span>}
        {sub(tipo === 'fatura' ? `${cel.qtd} compras · ${formatBRL(cel.total)}` : 'mês inteiro')}
      </>
    );
  } else if (cel.estado === 'parcial') {
    corpo = (
      <>
        <span className={CHIP} style={TOM.parcial}>{CHECK}até {ddmm(cel.ate)}</span>
        {sub(cel.pendente ? 'o resto do mês não entrou' : `${cel.data ? `importado em ${ddmm(cel.data)} · ` : ''}faltam ${cel.faltamDias} dias`)}
      </>
    );
  } else if (cel.estado === 'falta') {
    corpo = (
      <>
        <span className={CHIP} style={TOM.falta}>{RELOGIO}falta importar</span>
        {sub(tipo === 'fatura' ? `venceu ${ddmm(cel.vence)}` : 'o mês acabou')}
      </>
    );
  } else if (cel.estado === 'andamento') {
    corpo = <span className="text-[11.5px] text-gray-400">mês em andamento</span>;
  } else if (cel.estado === 'futuro') {
    corpo = <span className="text-[11.5px] text-gray-400">{cel.vence ? `vence ${ddmm(cel.vence)}` : ''}</span>;
  } else {
    corpo = <span className="text-gray-300">—</span>;
  }
  const acao = onAgir && ['falta', 'parcial', 'andamento'].includes(cel.estado);
  return (
    <td className={`group/cel border-b border-gray-100 px-3 py-2 align-middle ${cel.estado === 'falta' ? 'bg-hx-fdf8ea' : ''}`}>
      <div className="flex items-center gap-2">
        <div className="min-w-0">{corpo}</div>
        {acao && (
          <button type="button" onClick={onAgir}
            className={`ml-auto shrink-0 rounded-[5px] border border-gray-200 bg-white px-2 py-0.5 text-[11.5px] font-medium text-gray-700 transition hover:bg-gray-50 ${
              cel.estado === 'falta' ? '' : 'opacity-0 group-hover/cel:opacity-100 focus:opacity-100'}`}>
            Importar
          </button>
        )}
      </div>
    </td>
  );
}

// O que uma linha do histórico foi, em palavras.
function descrever(i) {
  if (i.tipo === 'fatura') {
    return {
      oque: `Fatura ${i.cartao?.nome ?? '(cartão excluído)'}${i.fatura?.vencimento ? ` · venc. ${ddmm(i.fatura.vencimento)}` : ''}`,
      periodo: i.competencia ? nomeCompetencia(i.competencia).toLowerCase() : '—',
    };
  }
  if (i.tipo === 'extrato') return { oque: 'Extrato da conta', periodo: i.periodo_de ? `${formatDate(i.periodo_de)} a ${formatDate(i.periodo_ate)}` : '—' };
  return { oque: 'Histórico da planilha', periodo: i.periodo_de ? `${competenciaCurta(i.periodo_de.slice(0, 7))} a ${competenciaCurta(i.periodo_ate.slice(0, 7))}` : '—' };
}

export default function Importar() {
  const toast = useToast();
  const confirmar = useConfirmacao();
  const navigate = useNavigate();
  const hoje = todayISO();
  const anoAtual = Number(hoje.slice(0, 4));
  const [dados, setDados] = useState(null);
  const [aba, setAba] = useState('mes');
  const [ano, setAno] = useState(anoAtual);
  const [soFalta, setSoFalta] = useState(false);
  const [fatura, setFatura] = useState(null); // { inicial } do importador da fatura aberto
  const [arquivos, setArquivos] = useState(false);
  const [desfazendo, setDesfazendo] = useState(null);

  const carregar = useCallback(async () => {
    try { setDados(await carregarSituacao()); } catch (err) { toast.error(err.message); setDados((d) => d ?? { cartoes: [], faturas: [], importacoes: null, extratos: null }); }
  }, [toast]);
  useEffect(() => { carregar(); }, [carregar]);

  const tabela = useMemo(() => (dados ? mesesDoAno({ ano, hoje, ...dados }) : null), [dados, ano, hoje]);
  const opcoesAno = useMemo(() => {
    const s = new Set([anoAtual]);
    (dados?.faturas ?? []).forEach((f) => s.add(Number(f.competencia.slice(0, 4))));
    (dados?.importacoes ?? []).forEach((i) => s.add(Number(i.criado_em.slice(0, 4))));
    return [...s].sort((a, b) => b - a).map((a) => ({ value: a, label: String(a) }));
  }, [dados, anoAtual]);

  const linhas = tabela ? tabela.linhas.filter((l) => !soFalta || Object.values(l.celulas).some((c) => c.pendente || c.estado === 'parcial')) : [];
  const historico = (dados?.importacoes ?? []).filter((i) => i.criado_em.startsWith(`${ano}-`));
  const ultimoExtrato = (dados?.importacoes ?? []).find((i) => i.tipo === 'extrato');

  const agir = (col, linha) => {
    if (col.tipo === 'extrato') { navigate('/extrato'); return; }
    const cel = linha.celulas[col.key];
    setFatura({ inicial: { cartaoId: col.cartao.id, vencimento: cel.vence ?? '' } });
  };

  const desfazer = async (i) => {
    const d = descrever(i);
    const ok = await confirmar({
      titulo: `Desfazer: ${d.oque}?`,
      texto: i.tipo === 'fatura'
        ? `A fatura e os ${i.linhas} lançamentos dela são apagados.`
        : `Os ${i.desfazer?.apagar?.length ?? 0} lançamentos que este extrato criou são apagados${i.desfazer?.restaurar?.length ? `, e os ${i.desfazer.restaurar.length} fixos que ele corrigiu voltam ao valor de antes` : ''}.`,
      confirmar: 'Desfazer',
      perigo: true,
    });
    if (!ok) return;
    setDesfazendo(i.id);
    try { await desfazerImportacao(i); toast.success('Importação desfeita.'); await carregar(); } catch (err) { toast.error(err.message); }
    setDesfazendo(null);
  };

  const acaoHistorico = (i) => {
    if (i.tipo === 'fatura') {
      return i.fatura_id
        ? <button type="button" className="btn-secondary !px-2.5 !py-1 !text-[12px]" disabled={desfazendo === i.id} onClick={() => desfazer(i)}>Desfazer</button>
        : <span className="text-[11.5px] text-gray-400" title="A fatura foi substituída por outra importação ou excluída em Faturas">substituída ou excluída</span>;
    }
    if (i.tipo === 'extrato') {
      return i.desfazer && i.id === ultimoExtrato?.id
        ? <button type="button" className="btn-secondary !px-2.5 !py-1 !text-[12px]" disabled={desfazendo === i.id} onClick={() => desfazer(i)}>Desfazer</button>
        : null;
    }
    return <Link to="/cadastros/importar" className="text-[12px] text-gray-500 underline hover:text-gray-800">abrir</Link>;
  };

  const depois = async (extrato) => {
    setArquivos(false);
    await carregar();
    if (extrato) navigate('/extrato', { state: { arquivo: extrato } });
  };

  return (
    <div>
      <CabecalhoPagina titulo="Importar"
        acessorio={<span className="hidden text-[12.5px] text-gray-500 sm:inline">o que entrou em cada mês, de cada fonte</span>}
        acoes={(
          <>
            <Link to="/cadastros/importar" className="btn-secondary hidden sm:inline-flex">Histórico da planilha</Link>
            <button type="button" className="btn-primary" onClick={() => setArquivos(true)} disabled={!dados}>Importar arquivos</button>
          </>
        )} />

      {!dados ? <PageLoading /> : (
        <div className="mt-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2.5">
            <AbasPilula abas={ABAS} valor={aba} onChange={setAba} variante="claro" altura={31} folga={3} />
            <FaixaProvider>
              <Trilho>
                <SegUnico id="ano" rotulo="Ano" opcoes={opcoesAno} value={ano} onChange={setAno} padrao={anoAtual} mostraPadrao largura={150} />
              </Trilho>
            </FaixaProvider>
            {aba === 'mes' && (
              <label className="inline-flex cursor-pointer items-center gap-2 text-[12.5px] text-gray-600">
                <Checkbox checked={soFalta} onChange={() => setSoFalta((v) => !v)} size="sm" />Só o que falta
              </label>
            )}
            {aba === 'mes' && tabela.faltam > 0 && (
              <span className={`${CHIP} ml-auto`} style={TOM.falta}>{RELOGIO}{tabela.faltam} {tabela.faltam === 1 ? 'importação falta' : 'importações faltam'} em {ano}</span>
            )}
          </div>

          {aba === 'mes' ? (
            <div className="card overflow-x-auto">
              {dados.extratos === null && (
                <p className="border-b border-gray-100 bg-hx-fdf8ea px-4 py-2 text-[12px] text-hx-9a6f00">
                  A coluna do extrato e o histórico precisam da migration <code>007_importacoes.sql</code> (Supabase → SQL Editor).
                </p>
              )}
              <table className="w-full min-w-[640px] text-[12.5px]">
                <thead className="bg-hx-f9fafb">
                  <tr>
                    <th className="table-th w-[150px]">Mês</th>
                    {tabela.colunas.map((c) => (
                      <th key={c.key} className="table-th">
                        <span className="block">{c.tipo === 'fatura' ? `Fatura ${c.cartao.nome}` : 'Extrato da conta'}</span>
                        <span className="block text-[10.5px] font-normal normal-case tracking-normal text-gray-400">
                          {c.tipo === 'fatura' ? `vence dia ${c.cartao.dia_vencimento}${c.cartao.ativo ? '' : ' · inativo'}` : 'Nubank · CSV'}
                        </span>
                      </th>
                    ))}
                    <th className="table-th">Situação</th>
                  </tr>
                </thead>
                <tbody>
                  {linhas.map((l) => (
                    <tr key={l.comp} className={l.atual ? 'bg-hx-f9fafb' : ''}>
                      <td className="border-b border-gray-100 px-3 py-2 font-semibold text-gray-800">
                        {nomeCompetencia(l.comp).replace(/ de \d+$/, '')}
                        {l.atual && <span className={`${CHIP} ml-2 !py-0 !text-[10px]`} style={TOM.falta}>mês atual</span>}
                      </td>
                      {tabela.colunas.map((c) => <Celula key={c.key} cel={l.celulas[c.key]} tipo={c.tipo} onAgir={() => agir(c, l)} />)}
                      <td className="border-b border-gray-100 px-3 py-2 text-[12px]">
                        {l.faltam > 0 ? <span className="font-semibold text-hx-9a6f00">{l.faltam === 1 ? 'Falta 1' : `Faltam ${l.faltam}`}</span>
                          : l.futuro || Object.values(l.celulas).every((x) => x.estado === 'na') ? <span className="text-gray-300">—</span>
                            : <span className="text-green-700">Completo</span>}
                      </td>
                    </tr>
                  ))}
                  {linhas.length === 0 && (
                    <tr><td colSpan={tabela.colunas.length + 2} className="px-4 py-6 text-center text-[12.5px] text-gray-500">Nada falta em {ano}.</td></tr>
                  )}
                </tbody>
              </table>
              <div className="flex flex-wrap gap-x-5 gap-y-1.5 border-t border-gray-100 px-4 py-2.5 text-[11.5px] text-gray-500">
                <span className="inline-flex items-center gap-1.5"><span className={CHIP} style={TOM.ok}>{CHECK}04/10</span>importado em</span>
                <span className="inline-flex items-center gap-1.5"><span className={CHIP} style={TOM.planilha}>{CHECK}planilha</span>veio do histórico</span>
                <span className="inline-flex items-center gap-1.5"><span className={CHIP} style={TOM.parcial}>{CHECK}até 20/10</span>o extrato vai até esse dia</span>
                <span className="inline-flex items-center gap-1.5"><span className={CHIP} style={TOM.falta}>{RELOGIO}falta</span>a fatura venceu (ou o mês acabou) e não entrou</span>
                <span className="inline-flex items-center gap-1.5"><span className="text-gray-300">—</span>a fonte ainda não existia</span>
              </div>
            </div>
          ) : (
            <div className="card overflow-x-auto">
              {dados.importacoes === null ? (
                <p className="px-4 py-6 text-[12.5px] text-gray-600">
                  O histórico precisa da migration <code>007_importacoes.sql</code>: cole no Supabase → SQL Editor e rode. Ela também
                  preenche o que você já importou.
                </p>
              ) : (
                <table className="w-full min-w-[760px] text-[12.5px]">
                  <thead className="bg-hx-f9fafb">
                    <tr>
                      <th className="table-th">Quando</th><th className="table-th">O quê</th><th className="table-th">Arquivo</th>
                      <th className="table-th">Período</th><th className="table-th">Resultado</th><th className="table-th" />
                    </tr>
                  </thead>
                  <tbody>
                    {historico.map((i) => {
                      const d = descrever(i);
                      return (
                        <tr key={i.id} className="hover:bg-hx-f9fafb">
                          <td className="whitespace-nowrap border-b border-gray-100 px-3 py-2 text-gray-500">{formatDateTime(i.criado_em)}</td>
                          <td className="whitespace-nowrap border-b border-gray-100 px-3 py-2 font-medium text-gray-800">{d.oque}</td>
                          <td className="max-w-[220px] truncate border-b border-gray-100 px-3 py-2 text-gray-500" title={i.arquivo}>{i.arquivo || '—'}</td>
                          <td className="whitespace-nowrap border-b border-gray-100 px-3 py-2 text-gray-700">{d.periodo}</td>
                          <td className="border-b border-gray-100 px-3 py-2 text-gray-500">
                            {i.resumo}{i.tipo === 'fatura' && i.total_centavos ? ` · ${formatBRL(i.total_centavos)}` : ''}
                          </td>
                          <td className="whitespace-nowrap border-b border-gray-100 px-3 py-2 text-right">{acaoHistorico(i)}</td>
                        </tr>
                      );
                    })}
                    {historico.length === 0 && (
                      <tr><td colSpan={6} className="px-4 py-6 text-center text-gray-500">Nenhuma importação em {ano}.</td></tr>
                    )}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>
      )}

      {fatura && (
        <ImportarFatura cartoes={dados.cartoes} inicial={fatura.inicial} onFechar={() => setFatura(null)}
          onImportada={() => { setFatura(null); carregar(); }} />
      )}
      {arquivos && <ImportarArquivos cartoes={dados.cartoes} onFechar={() => setArquivos(false)} onFeito={depois} />}
    </div>
  );
}
