import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import CabecalhoPagina from '../components/CabecalhoPagina.jsx';
import ListaVazia from '../components/ListaVazia.jsx';
import { PageLoading } from '../components/Spinner.jsx';
import { SeletorMes } from '../components/Comuns.jsx';
import { BarrasHorizontais, BarrasMensais, COR_ENTRADAS, COR_GASTOS, ColunasMes, Legenda } from '../components/graficos/Graficos.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { contarPendencias, listarParcelasFuturas, listarResumoMensal } from '../api/resumo.js';
import { listarCategorias } from '../api/cadastros.js';
import { comprometidoPorMes, gastosPorGrupo, mediaAnterior, mesesAte, totaisPorMes } from '../lib/resumo.js';
import { brlCurto, formatBRL } from '../lib/dinheiro.js';
import { addMeses, competenciaAtual, competenciaCurta, nomeCompetencia } from '../lib/format.js';
import { lsGet, lsSet } from '../lib/storage.js';
import { listarLancamentosDeFixos, listarRecorrencias } from '../api/fixos.js';
import { situacaoDoMes } from '../lib/fixos.js';

// RESUMO DO MÊS (tela inicial) — o Dashboard da planilha. As somas vêm da view `resumo_mensal` e as
// parcelas da `parcelas_futuras` (migration 003); aqui só se escolhe o recorte.
const LS_MES = 'resumo_mes';
const ORIGENS = [['cartao', 'Cartão'], ['fixo', 'Fixos'], ['manual', 'Avulsos']];

function Cartao({ titulo, acoes, children, className = '' }) {
  return (
    <section className={`card p-4 ${className}`}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-gray-800">{titulo}</h2>
        {acoes}
      </div>
      {children}
    </section>
  );
}

function Kpi({ rotulo, centavos, cor, sub }) {
  return (
    <div className="card min-w-0 px-4 py-3">
      <div className="truncate text-[11px] font-medium uppercase tracking-wide text-gray-500">{rotulo}</div>
      <div className={`mt-1 whitespace-nowrap text-lg font-semibold tabular-nums sm:text-xl ${cor ?? 'text-gray-800'}`}>
        <span className="sm:hidden">{brlCurto(centavos)}</span><span className="hidden sm:inline">{formatBRL(centavos)}</span>
      </div>
      {sub && <div className="mt-0.5 truncate text-xs text-gray-500">{sub}</div>}
    </div>
  );
}

export default function Resumo() {
  const toast = useToast();
  const [linhas, setLinhas] = useState(null);
  const [parcelas, setParcelas] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [pendencias, setPendencias] = useState(0);
  const [fixos, setFixos] = useState({ recs: [], lancs: [] });
  const [comp, setCompEstado] = useState(() => lsGet(LS_MES));
  const [grupoAberto, setGrupoAberto] = useState(null);
  const setComp = (c) => { setCompEstado(c); lsSet(LS_MES, c); setGrupoAberto(null); };

  const carregar = useCallback(async () => {
    try {
      const [r, p, c, n, rec, lf] = await Promise.all([
        listarResumoMensal(), listarParcelasFuturas(), listarCategorias(), contarPendencias(), listarRecorrencias(), listarLancamentosDeFixos(),
      ]);
      setLinhas(r); setParcelas(p); setCategorias(c); setPendencias(n); setFixos({ recs: rec, lancs: lf });
    } catch (err) { toast.error(err.message); setLinhas([]); }
  }, [toast]);
  useEffect(() => { carregar(); }, [carregar]);

  const porMes = useMemo(() => totaisPorMes(linhas ?? []), [linhas]);

  // Sem mês escolhido: o atual; se ele ainda não tem lançamento, o último mês que tem (até hoje).
  useEffect(() => {
    if (comp || !linhas) return;
    const hoje = competenciaAtual();
    const comDado = Object.keys(porMes).filter((c) => c <= hoje).sort();
    setCompEstado(porMes[hoje] || !comDado.length ? hoje : comDado[comDado.length - 1]);
  }, [comp, linhas, porMes]);

  if (!linhas || !comp) return (<div><CabecalhoPagina titulo="Resumo do mês" /><PageLoading /></div>);

  const t = porMes[comp] ?? { entradas: 0, gastos: 0, cartao: 0, fixo: 0, manual: 0, saldo: 0 };
  const media = mediaAnterior(porMes, comp, 3);
  const variacao = media && media.media ? Math.round(((t.gastos - media.media) / media.media) * 100) : null;
  const grupos = gastosPorGrupo(linhas, comp, categorias);
  const comprometido = comprometidoPorMes(parcelas, comp).slice(0, 12);
  const proximo = comprometido.find((c) => c.competencia === addMeses(comp, 1));
  const meses12 = mesesAte(comp, 12).map((c) => ({ competencia: c, ...(porMes[c] ?? { entradas: 0, gastos: 0 }) }));
  const vazio = !porMes[comp];
  const fixosPendentes = situacaoDoMes(fixos.recs, fixos.lancs.filter((l) => l.competencia === comp), {}, comp).filter((s) => !s.lancamento);

  return (
    <div>
      <CabecalhoPagina titulo="Resumo do mês" acoes={<SeletorMes comp={comp} onChange={setComp} />} />

      {pendencias > 0 && (
        <div className="mt-4 rounded-md border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
          {pendencias} lançamento(s) importado(s) sem categoria. <Link to="/pendencias" className="font-semibold underline">Revisar pendências</Link>
        </div>
      )}
      {fixosPendentes.length > 0 && (
        <div className="mt-4 rounded-md border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
          {fixosPendentes.length} gasto(s) fixo(s) de {nomeCompetencia(comp).toLowerCase()} ainda não lançado(s): {fixosPendentes.map((s) => s.rec.descricao).join(', ')}.{' '}
          <Link to="/fixos" onClick={() => lsSet('fixos_mes', comp)} className="font-semibold underline">Lançar</Link>
        </div>
      )}

      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi rotulo="Entradas" centavos={t.entradas} cor="text-green-700" />
        <Kpi rotulo="Gastos" centavos={t.gastos}
          sub={variacao === null ? 'sem meses anteriores' : `${variacao > 0 ? '+' : ''}${variacao}% vs média de ${media.meses} ${media.meses === 1 ? 'mês' : 'meses'} (${brlCurto(media.media)})`} />
        <Kpi rotulo="Saldo" centavos={t.saldo} cor={t.saldo < 0 ? 'text-hx-c0393d' : 'text-gray-800'} />
        <Kpi rotulo={`Parcelas em ${competenciaCurta(addMeses(comp, 1))}`} centavos={proximo?.total ?? 0}
          sub={proximo ? `${proximo.qtd} parcela(s) já na fatura` : 'nada comprometido'} />
      </div>

      {vazio ? (
        <div className="mt-4"><ListaVazia>Nenhum lançamento em {nomeCompetencia(comp).toLowerCase()}.</ListaVazia></div>
      ) : (
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <Cartao titulo="Gastos por grupo" acoes={<span className="text-xs text-gray-500">clique para ver as categorias</span>}>
            {grupos.length ? <BarrasHorizontais itens={grupos} total={t.gastos} aberto={grupoAberto} onAbrir={setGrupoAberto} />
              : <p className="text-sm text-gray-500">Nenhum gasto no mês.</p>}
          </Cartao>

          <div className="space-y-4">
            <Cartao titulo="Gastos por origem">
              <ul className="space-y-1.5">
                {ORIGENS.map(([chave, rotulo]) => (
                  <li key={chave} className="flex items-center justify-between gap-3 text-[13px]">
                    <span className="text-gray-700">{rotulo}</span>
                    <span className="tabular-nums text-gray-800">
                      {formatBRL(t[chave])}
                      <span className="ml-2 inline-block w-9 text-right text-[11.5px] text-gray-500">{t.gastos ? Math.round((t[chave] / t.gastos) * 100) : 0}%</span>
                    </span>
                  </li>
                ))}
              </ul>
            </Cartao>
            <Cartao titulo="Parcelas já comprometidas" acoes={<span className="text-xs text-gray-500">das últimas faturas</span>}>
              {comprometido.length ? <ColunasMes meses={comprometido} rotulo="Parcelas" />
                : <p className="text-sm text-gray-500">Nenhuma parcela depois de {nomeCompetencia(comp).toLowerCase()}.</p>}
            </Cartao>
          </div>
        </div>
      )}

      <Cartao className="mt-4" titulo="Últimos 12 meses"
        acoes={<Legenda itens={[{ rotulo: 'Entradas', cor: COR_ENTRADAS }, { rotulo: 'Gastos', cor: COR_GASTOS }]} />}>
        <BarrasMensais meses={meses12} selecionado={comp} onSelecionar={setComp} />
        <p className="mt-2 text-right text-xs"><Link to="/evolucao" className="text-gray-500 underline hover:text-gray-800">Ver a evolução em tabela</Link></p>
      </Cartao>
    </div>
  );
}
