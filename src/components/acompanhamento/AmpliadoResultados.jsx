import { useEffect, useMemo, useState } from 'react';
import Modal from '../Modal.jsx';
import Tooltip from '../Tooltip.jsx';
import AbasPilula from '../AbasPilula.jsx';
import { BuscaFaixa } from '../filtros/Segmentos.jsx';
import BalaoGrafico, { useBalao } from '../graficos/BalaoGrafico.jsx';
import { IconMaximize, IconMinimize } from '../icons.jsx';
import { fechamentosDesde, listarResultados } from '../../api/acompanhamento.js';
import { resultadosDivulgados, resultadosQueVem, resumoDosResultados } from '../../lib/acompanhamento.js';
import { semAcento } from '../../lib/buscaLancamentos.js';
import { exportCsv } from '../../lib/exportCsv.js';
import { corTexto, pctTxt } from './BlocosAcompanhamento.jsx';

// OS RESULTADOS DAS EMPRESAS (25/11/2026, a opção A do mockup "Resultados divulgados · ampliado", a pedido: "quero ter como
// avaliar"): o ⤢ dos Próximos eventos abre o painel dos ampliados (1280px/90vh, tela cheia, CSV). DIVULGADOS: o lucro por
// ação (LPA) esperado × o divulgado, a SURPRESA (a barra para os dois lados e a pílula), a receita, COMO A AÇÃO REAGIU no
// pregão seguinte e quanto andou desde então (a curvinha) — e em cima quantas bateram, a surpresa média, a reação média
// (com quem bateu e mesmo assim caiu) e o próximo. PRÓXIMOS: o calendário, com o esperado e, da mesma empresa, como foi a
// última. As contas em `lib/acompanhamento.js` (testadas). O LPA e a receita são da Finnhub; os preços, os fechamentos
// guardados. Só os ativos cadastrados (os eventos chegam com o gráfico de cada um).

const BTN_ICONE = 'inline-flex h-[28px] w-[28px] items-center justify-center rounded-[4px] text-gray-400 transition hover:bg-gray-100 hover:text-gray-600';
const ABAS = [{ key: 'divulgados', label: 'Divulgados' }, { key: 'proximos', label: 'Próximos' }];
const PERIODOS = [{ key: '12', label: '12 meses' }, { key: '24', label: '24 meses' }, { key: 'tudo', label: 'Tudo' }];
const num = (v, c = 2) => Number(v).toLocaleString('pt-BR', { minimumFractionDigits: c, maximumFractionDigits: c });
const dm = (d) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
const dma = (d) => `${dm(d)}/${d.slice(2, 4)}`;
const menosMeses = (hoje, n) => { const d = new Date(Date.UTC(+hoje.slice(0, 4), +hoje.slice(5, 7) - 1 - n, +hoje.slice(8, 10))); return d.toISOString().slice(0, 10); };
const diasAte = (d, hoje) => Math.round((Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)) - Date.UTC(+hoje.slice(0, 4), +hoje.slice(5, 7) - 1, +hoje.slice(8, 10))) / 86400000);
const HORA = { bmo: 'antes da abertura', amc: 'depois do fechamento', dmh: 'durante o pregão', periodo: 'fim do trimestre' };
const grande = (v) => {
  const x = Number(v);
  if (!Number.isFinite(x) || !x) return '—';
  return x >= 1e9 ? `${num(x / 1e9, 1)} bi` : x >= 1e6 ? `${num(x / 1e6, 0)} mi` : num(x, 0);
};
const tri = (e) => (e.trimestre && e.ano ? `T${e.trimestre} · ${e.ano}` : '—');

// a surpresa: a barra para os dois lados (até ±12%) e a pílula — verde bateu, laranja abaixo
function Surpresa({ p }) {
  if (p === null) return <span className="text-gray-400">—</span>;
  const bate = p >= 0;
  const w = Math.max(2, Math.min(48, (Math.abs(p) / 0.12) * 48));
  return (
    <span className="flex items-center gap-2">
      <span className="relative h-[14px] w-[96px] shrink-0">
        <span className="absolute inset-y-0 left-[48px] w-px bg-gray-300" />
        <span className={`absolute top-[3px] h-[8px] rounded-[2px] ${bate ? 'bg-green-600' : 'bg-orange-500'}`} style={{ left: bate ? 48 : 48 - w, width: w }} />
      </span>
      <span className={`inline-flex h-[20px] items-center rounded-full px-[7px] text-[11px] font-semibold tabular-nums ${bate ? 'bg-hx-dcfce7 text-hx-166534' : 'bg-orange-100 text-orange-800'}`}>
        {bate ? '▲' : '▼'} {pctTxt(Math.abs(p), 1).replace(/^[+−]/, '')}
      </span>
    </span>
  );
}
// a curvinha do "desde então" (o tracejado é o fechamento de antes)
function Curvinha({ pontos, p }) {
  if (!pontos || pontos.length < 2) return <span className="inline-block w-[84px]" />;
  const lo = Math.min(0, ...pontos); const hi = Math.max(0, ...pontos); const sp = hi - lo || 1;
  const y = (v) => 2 + (1 - (v - lo) / sp) * 20;
  const pts = pontos.map((v, i) => `${((i / (pontos.length - 1)) * 100).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  return (
    <svg viewBox="0 0 100 24" preserveAspectRatio="none" className="h-[22px] w-[84px] shrink-0" aria-hidden="true">
      <line x1="0" x2="100" y1={y(0)} y2={y(0)} className="text-gray-300" stroke="currentColor" strokeDasharray="2 3" vectorEffect="non-scaling-stroke" />
      <polyline points={pts} fill="none" className={p >= 0 ? 'text-green-600' : 'text-hx-c0393d'} stroke="currentColor" strokeWidth="1.6" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
function Cartao({ titulo, children, sub }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-[10px] border border-gray-200 px-3.5 py-3">
      <span className="text-[11.5px] font-semibold text-gray-500">{titulo}</span>
      {children}
      {sub && <span className="truncate text-[11.5px] text-gray-500" title={typeof sub === 'string' ? sub : undefined}>{sub}</span>}
    </div>
  );
}

export default function AmpliadoResultados({ itens, hoje, onClose, onAbrir }) {
  const [cheio, setCheio] = useState(false);
  const [aba, setAba] = useState('divulgados');
  const [periodo, setPeriodo] = useState('12');
  const [busca, setBusca] = useState('');
  const [dados, setDados] = useState(undefined); // undefined lendo · null sem a 031 · { eventos, fechamentos }
  const [erro, setErro] = useState(null);
  const balao = useBalao(290, 190);
  const porAtivo = useMemo(() => new Map(itens.filter((i) => i.ativoId).map((i) => [i.ativoId, i])), [itens]);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const ev = await listarResultados();
        if (!vivo) return;
        if (ev === null) { setDados(null); return; }
        const meus = ev.filter((e) => porAtivo.has(e.ativo_id));
        const passados = meus.filter((e) => e.valor !== null && e.data <= hoje);
        const desde = passados.length ? passados[0].data : hoje;
        const ini = new Date(Date.UTC(+desde.slice(0, 4), +desde.slice(5, 7) - 1, +desde.slice(8, 10) - 10)).toISOString().slice(0, 10);
        const fech = await fechamentosDesde([...new Set(passados.map((e) => e.ativo_id))], ini);
        if (vivo) setDados({ eventos: meus, fechamentos: fech });
      } catch (err) {
        if (vivo) setErro(err.message);
      }
    })();
    return () => { vivo = false; };
  }, [porAtivo, hoje]);

  const todos = useMemo(() => (dados ? resultadosDivulgados(dados.eventos, dados.fechamentos, hoje) : []), [dados, hoje]);
  const termo = semAcento(busca).trim();
  const casa = (e) => { const i = porAtivo.get(e.ativo_id); return !termo || semAcento(`${i?.ticker} ${i?.nome}`).includes(termo); };
  const corte = periodo === 'tudo' ? '' : menosMeses(hoje, Number(periodo));
  const divulgados = todos.filter((d) => d.data >= corte && casa(d));
  const proximos = useMemo(() => (dados ? resultadosQueVem(dados.eventos, todos, hoje) : []), [dados, todos, hoje]).filter(casa);
  const r = resumoDosResultados(divulgados);
  const tk = (e) => porAtivo.get(e.ativo_id)?.ticker ?? '?';
  const moeda = (e) => (porAtivo.get(e.ativo_id)?.mercado === 'EUA' ? 'US$' : 'R$');
  const lista = aba === 'divulgados' ? divulgados : proximos;

  const exportar = () => {
    if (aba === 'divulgados') {
      exportCsv(`resultados-divulgados-${hoje}`, divulgados, [
        { key: 'data', label: 'Divulgou' }, { key: 'hora', label: 'Quando', map: (e) => HORA[e.hora] ?? '' },
        { key: 'ticker', label: 'Empresa', map: tk }, { key: 'tri', label: 'Trimestre fiscal', map: tri },
        { key: 'estimado', label: 'LPA esperado', map: (e) => e.estimado ?? '' }, { key: 'valor', label: 'LPA divulgado' },
        { key: 'surpresa', label: 'Surpresa %', map: (e) => (e.surpresa === null ? '' : Math.round(e.surpresa * 1000) / 10) },
        { key: 'receita_estimada', label: 'Receita esperada', map: (e) => e.receita_estimada ?? '' }, { key: 'receita', label: 'Receita divulgada', map: (e) => e.receita ?? '' },
        { key: 'reacao', label: 'Pregão seguinte %', map: (e) => (e.reacao === null ? '' : Math.round(e.reacao * 1000) / 10) },
        { key: 'desde', label: 'Desde então %', map: (e) => (e.desde === null ? '' : Math.round(e.desde * 1000) / 10) },
      ]);
    } else {
      exportCsv(`resultados-proximos-${hoje}`, proximos, [
        { key: 'data', label: 'Divulga' }, { key: 'hora', label: 'Quando', map: (e) => HORA[e.hora] ?? '' },
        { key: 'ticker', label: 'Empresa', map: tk }, { key: 'tri', label: 'Trimestre fiscal', map: tri },
        { key: 'estimado', label: 'LPA esperado', map: (e) => e.estimado ?? '' }, { key: 'receita_estimada', label: 'Receita esperada', map: (e) => e.receita_estimada ?? '' },
      ]);
    }
  };

  const acoes = (
    <>
      <button type="button" className="btn-secondary !h-[30px] !px-3 !text-[12.5px]" onClick={exportar} disabled={!lista.length}>Exportar CSV</button>
      <Tooltip label={cheio ? 'Sair da tela cheia' : 'Tela cheia'}>
        <button type="button" onClick={() => setCheio((c) => !c)} aria-label={cheio ? 'Sair da tela cheia' : 'Tela cheia'} className={BTN_ICONE}>
          {cheio ? <IconMinimize className="h-3.5 w-3.5" /> : <IconMaximize className="h-3.5 w-3.5" />}
        </button>
      </Tooltip>
    </>
  );

  // o balão da linha divulgada
  const ativo = aba === 'divulgados' && divulgados.find((d) => `${d.ativo_id}${d.data}` === balao.ativo);
  let balaoItens = []; let nota = null;
  if (ativo) {
    const m = moeda(ativo);
    balaoItens = [
      { rotulo: 'LPA esperado', valor: ativo.estimado === null ? '—' : `${m} ${num(ativo.estimado)}` },
      { rotulo: 'LPA divulgado', valor: `${m} ${num(ativo.valor)}${ativo.surpresa === null ? '' : ` · ${pctTxt(ativo.surpresa, 1)}`}` },
      ...(ativo.receita ? [{ rotulo: 'Receita', valor: `${m} ${grande(ativo.receita)}${ativo.surpresaReceita === null ? '' : ` · ${pctTxt(ativo.surpresaReceita, 1)}`}` }] : []),
      ...(ativo.antes ? [{ rotulo: `Fechou ${dm(ativo.antes[0])} → ${dm(ativo.depois[0])}`, valor: `${num(ativo.antes[1])} → ${num(ativo.depois[1])}` }] : []),
    ];
    const bate = ativo.surpresa !== null && ativo.surpresa >= 0;
    nota = ativo.semData ? 'Trimestre de antes do app: a data é o fim do trimestre, não a da divulgação, então não há a reação da ação.'
      : ativo.reacao === null ? 'Sem os fechamentos em volta da data: a reação aparece quando o histórico da ação estiver guardado.'
        : ativo.surpresa === null ? 'Sem o esperado: dá para ver só a reação.'
          : bate && ativo.reacao < 0 ? `Bateu o esperado e a ação caiu ${pctTxt(Math.abs(ativo.reacao), 1).replace(/^[+−]/, '')}: o mercado já esperava mais.`
            : !bate && ativo.reacao > 0 ? 'Ficou abaixo do esperado e a ação subiu: o mercado temia pior.'
              : bate ? 'Bateu o esperado e a ação subiu.' : 'Ficou abaixo do esperado e a ação caiu.';
    nota = `${nota} Clique para abrir o gráfico.`;
  }

  const TH = 'h-[38px] whitespace-nowrap border-b border-gray-200 bg-white px-2 text-left align-bottom pb-2 text-[10.5px] font-semibold uppercase tracking-[0.05em] text-gray-500';
  const td = 'border-b border-gray-100 px-2 py-1.5 align-middle';
  const prox = proximos[0];

  return (
    <Modal open onClose={onClose} title="Resultados das empresas" acoes={acoes} alturaCheia animarTamanho padding="p-0"
      subtitulo="o lucro por ação (LPA) que os analistas esperavam × o que a empresa divulgou, e como a ação reagiu"
      maxWidth={cheio ? 'max-w-[96vw]' : 'max-w-[min(1280px,95vw)]'} altura={cheio ? 'h-[94vh]' : 'h-[90vh]'}>
      <div className="flex min-h-full flex-col">
        <div className="sticky top-0 z-10 bg-white">
          <div className="flex flex-wrap items-center gap-2.5 px-5 pb-3 pt-4">
            <AbasPilula abas={ABAS.map((a) => (a.key === 'proximos' && proximos.length ? { ...a, label: `Próximos (${proximos.length})` } : a))}
              valor={aba} onChange={setAba} variante="claro" altura={30} folga={2} />
            {aba === 'divulgados' && <AbasPilula abas={PERIODOS} valor={periodo} onChange={setPeriodo} variante="claro" altura={30} folga={2} />}
            <BuscaFaixa className="w-[220px]" placeholder="Buscar empresa" value={busca} onChange={(e) => setBusca(e.target.value)} />
          </div>
          {aba === 'divulgados' && dados && (
            <div className="grid grid-cols-2 gap-3 px-5 pb-3 lg:grid-cols-4">
              <Cartao titulo="Bateram o esperado" sub={r.abaixo.length ? `${r.abaixo.length} ficaram abaixo: ${r.abaixo.map(tk).filter((v, k, a) => a.indexOf(v) === k).join(', ')}` : r.n ? 'nenhuma ficou abaixo' : null}>
                <span className="text-[20px] font-semibold tabular-nums text-gray-900">{r.n ? `${r.bateram} de ${r.n}` : '—'}</span>
                {r.n > 0 && <span className="flex h-[6px] overflow-hidden rounded-full bg-orange-200"><span className="bg-green-600" style={{ width: `${(r.bateram / r.n) * 100}%` }} /></span>}
              </Cartao>
              <Cartao titulo="Surpresa mediana no LPA" sub={r.maior && r.pior ? `maior: ${tk(r.maior)} ${pctTxt(r.maior.surpresa, 1)} · pior: ${tk(r.pior)} ${pctTxt(r.pior.surpresa, 1)}` : null}>
                <span className={`text-[20px] font-semibold tabular-nums ${corTexto(r.surpresaMediana)}`}>{pctTxt(r.surpresaMediana, 1)}</span>
              </Cartao>
              <Cartao titulo="A ação no pregão seguinte"
                sub={r.nReacao ? [`na média · subiu em ${r.subiram}, caiu em ${r.cairam}`, r.bateuECaiu.length ? `bateu e caiu: ${r.bateuECaiu.map(tk).join(', ')}` : null].filter(Boolean).join(' · ') : 'sem os fechamentos em volta das datas'}>
                <span className={`text-[20px] font-semibold tabular-nums ${corTexto(r.reacaoMedia)}`}>{pctTxt(r.reacaoMedia, 1)}</span>
              </Cartao>
              <Cartao titulo="O próximo" sub={prox ? [prox.estimado !== null ? `esperado ${moeda(prox)} ${num(prox.estimado)}` : null, prox.anterior?.surpresa != null ? `da última vez ${prox.anterior.surpresa >= 0 ? 'bateu' : 'ficou abaixo'} (${pctTxt(prox.anterior.surpresa, 1)})` : null].filter(Boolean).join(' · ') : null}>
                <span className="text-[20px] font-semibold text-gray-900">
                  {prox ? <>{tk(prox)} <span className="text-[13px] font-medium text-gray-500">em {diasAte(prox.data, hoje)} dias · {dm(prox.data)}</span></> : '—'}
                </span>
              </Cartao>
            </div>
          )}
        </div>

        <div className="flex-1 px-5 pb-2">
          {erro ? <p className="py-10 text-center text-sm text-hx-c0393d">{erro}</p>
            : dados === undefined ? <p className="py-10 text-center text-sm text-gray-400">Lendo os resultados…</p>
              : dados === null ? <p className="py-10 text-center text-sm text-gray-400">Os resultados pedem a migration 031 (a do gráfico do ativo).</p>
                : !lista.length ? (
                  <p className="py-10 text-center text-sm leading-relaxed text-gray-400">
                    {termo ? `Nada com “${busca.trim()}”.` : aba === 'divulgados' ? 'Nenhum resultado divulgado no período.' : 'Nenhum resultado marcado à frente.'}
                    <br />Os resultados de cada ação chegam com o gráfico dela (o calendário e as surpresas da Finnhub; só as dos EUA).
                  </p>
                ) : aba === 'divulgados' ? (
                  <table className="w-full min-w-[1160px] table-fixed border-separate border-spacing-0 text-[12.5px]">
                    <colgroup>
                      <col style={{ width: 132 }} /><col style={{ width: 180 }} /><col style={{ width: 80 }} /><col style={{ width: 104 }} /><col style={{ width: 96 }} />
                      <col style={{ width: 180 }} /><col style={{ width: 176 }} /><col style={{ width: 124 }} /><col style={{ minWidth: 156 }} />
                    </colgroup>
                    <thead>
                      <tr>
                        <th className={TH}>Divulgou</th><th className={TH}>Empresa</th><th className={TH}>Trimestre</th>
                        <th className={`${TH} text-right`}>LPA esperado</th><th className={`${TH} text-right`}>LPA real</th>
                        <th className={`${TH} pl-3`}>Surpresa</th><th className={TH}>Receita esperada → real</th>
                        <th className={`${TH} text-right`}>Pregão seguinte</th><th className={`${TH} text-right`}>Desde então</th>
                      </tr>
                    </thead>
                    <tbody>
                      {divulgados.map((e) => {
                        const i = porAtivo.get(e.ativo_id);
                        const k = `${e.ativo_id}${e.data}`;
                        const m = moeda(e);
                        return (
                          <tr key={k} onClick={() => onAbrir(i)} onMouseMove={balao.aoMover(k)} onMouseLeave={balao.aoSair}
                            className="cursor-pointer transition-colors hover:bg-hx-f9fafb">
                            <td className={td}>
                              <span className="block tabular-nums text-gray-800">{dma(e.data)}</span>
                              <span className="block whitespace-nowrap text-[11px] text-gray-400">{HORA[e.hora] ?? '—'}</span>
                            </td>
                            <td className={td}>
                              <span className="block font-semibold text-gray-900">{i.ticker}</span>
                              <span className="block truncate text-[11px] text-gray-500">{i.nome || '—'}</span>
                            </td>
                            <td className={`${td} text-gray-600`}>{tri(e)}</td>
                            <td className={`${td} text-right tabular-nums text-gray-500`}>{e.estimado === null ? '—' : `${m} ${num(e.estimado)}`}</td>
                            <td className={`${td} text-right font-semibold tabular-nums text-gray-900`}>{m} {num(e.valor)}</td>
                            <td className={`${td} pl-3`}><Surpresa p={e.surpresa} /></td>
                            <td className={td}>
                              {e.receita || e.receita_estimada ? (
                                <>
                                  <span className="block tabular-nums text-gray-700">{grande(e.receita_estimada)} → {grande(e.receita)}</span>
                                  {e.surpresaReceita !== null && <span className={`block text-[11px] ${e.surpresaReceita >= 0 ? 'text-green-700' : 'text-orange-700'}`}>receita {pctTxt(e.surpresaReceita, 1)}</span>}
                                </>
                              ) : <span className="text-gray-400">—</span>}
                            </td>
                            <td className={`${td} text-right font-semibold tabular-nums ${corTexto(e.reacao)}`}>{pctTxt(e.reacao, 1)}</td>
                            <td className={td}>
                              <span className="flex items-center justify-end gap-2.5">
                                <Curvinha pontos={e.curva} p={e.desde} />
                                <span className={`w-[52px] text-right tabular-nums ${corTexto(e.desde)}`}>{pctTxt(e.desde, 1)}</span>
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                ) : (
                  <table className="w-full min-w-[1000px] table-fixed border-separate border-spacing-0 text-[12.5px]">
                    <colgroup>
                      <col style={{ width: 120 }} /><col style={{ width: 220 }} /><col style={{ width: 96 }} /><col style={{ width: 170 }} />
                      <col style={{ width: 120 }} /><col style={{ width: 140 }} /><col />
                    </colgroup>
                    <thead>
                      <tr>
                        <th className={TH}>Divulga</th><th className={TH}>Empresa</th><th className={TH}>Trimestre</th><th className={TH}>Quando</th>
                        <th className={`${TH} text-right`}>LPA esperado</th><th className={`${TH} text-right`}>Receita esperada</th><th className={`${TH} pl-6`}>Da última vez</th>
                      </tr>
                    </thead>
                    <tbody>
                      {proximos.map((e) => {
                        const i = porAtivo.get(e.ativo_id);
                        const a = e.anterior;
                        return (
                          <tr key={`${e.ativo_id}${e.data}`} onClick={() => onAbrir(i)} className="cursor-pointer transition-colors hover:bg-hx-f9fafb">
                            <td className={td}>
                              <span className="block tabular-nums text-gray-800">{dma(e.data)}</span>
                              <span className="block text-[11px] text-gray-400">em {diasAte(e.data, hoje)} dias</span>
                            </td>
                            <td className={td}>
                              <span className="block font-semibold text-gray-900">{i.ticker}</span>
                              <span className="block truncate text-[11px] text-gray-500">{i.nome || '—'}</span>
                            </td>
                            <td className={`${td} text-gray-600`}>{tri(e)}</td>
                            <td className={`${td} text-gray-600`}>{HORA[e.hora] ?? 'a data do calendário'}</td>
                            <td className={`${td} text-right font-semibold tabular-nums text-gray-900`}>{e.estimado === null ? '—' : `${moeda(e)} ${num(e.estimado)}`}</td>
                            <td className={`${td} text-right tabular-nums text-gray-600`}>{e.receita_estimada ? `${moeda(e)} ${grande(e.receita_estimada)}` : '—'}</td>
                            <td className={`${td} pl-6`}>
                              {a ? (
                                <span className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5">
                                  <span className="text-[11.5px] text-gray-500">{tri(a)}</span>
                                  <Surpresa p={a.surpresa} />
                                  {a.reacao !== null && <span className={`text-[11.5px] ${corTexto(a.reacao)}`}>ação {pctTxt(a.reacao, 1)} no pregão seguinte</span>}
                                </span>
                              ) : <span className="text-gray-400">—</span>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
        </div>

        <div className="sticky bottom-0 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-gray-100 bg-white px-5 py-2.5 text-[11.5px] text-gray-500">
          <span className="inline-flex items-center gap-1.5"><span className="h-[8px] w-[10px] rounded-[2px] bg-green-600" />bateu o esperado</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-[8px] w-[10px] rounded-[2px] bg-orange-500" />ficou abaixo</span>
          <span>Pregão seguinte: antes da abertura, o fechamento do dia contra o da véspera; depois do fechamento, o do dia seguinte contra o do dia</span>
          <span className="flex-1" />
          <span>LPA e receita: Finnhub · preços: os fechamentos guardados</span>
        </div>
      </div>
      {ativo && <BalaoGrafico pos={balao.pos} largura={290} titulo={`${tk(ativo)} · ${tri(ativo)} (trimestre fiscal)`} itens={balaoItens} nota={nota} />}
    </Modal>
  );
}
