import { Fragment, useMemo, useState } from 'react';
import Tooltip from '../Tooltip.jsx';
import ListaVazia from '../ListaVazia.jsx';
import { FaixaProvider, Trilho, DivisorFaixa, LimparFiltros } from '../filtros/FaixaFiltros.jsx';
import { SegMulti, SegUnico } from '../filtros/Segmentos.jsx';
import { IconLapis, IconLixeira } from '../icons.jsx';
import { CORES_INSTITUICAO } from './TabelaCarteira.jsx';
import { formatBRL } from '../../lib/dinheiro.js';
import { formatDate } from '../../lib/format.js';
import { dataDoDeposito, instituicoesEmOrdem, movimentosDaCarteira, pagaIOF, pagaIR, totaisDosMovimentos } from '../../lib/carteira.js';

// AS MOVIMENTAÇÕES DA RENDA FIXA (16/11/2026, a opção A do mockup "Histórico da renda fixa", com as recomendadas): a aba ao
// lado da Carteira. Tudo o que entrou e saiu, do mais novo para o mais antigo e separado por mês (a faixa do mês com o que
// entrou e o que saiu): os aportes, o "já estava aplicado" (na data do depósito), os resgates (o pedido repartido numa
// linha só, a seta abre a parte de cada aporte), os vencimentos que voltaram para a conta e as reaplicações (o IR que saiu).
// Cada linha: o que entrou, o que saiu, o IR e o IOF, o que chegou na conta e o que FICOU no investimento no fim do dia.
// No hover, EDITAR (o aporte abre o "Editar aporte"; o resgate, o pop-up dele preenchido) e EXCLUIR. Contas em
// `movimentosDaCarteira` (lib/carteira.js, testada).
const TIPOS = [{ value: 'entrou', label: 'Aportes' }, { value: 'resgate', label: 'Resgates' }, { value: 'vencimento', label: 'Vencimentos' }];
const GRUPO = { aporte: 'entrou', antigo: 'entrou', resgate: 'resgate', venceu: 'vencimento', reaplicado: 'vencimento' };
const ROTULO = { aporte: 'Aporte', antigo: 'Já estava aplicado', resgate: 'Resgate', venceu: 'Venceu', reaplicado: 'Reaplicado' };
const TOM = {
  aporte: 'bg-gray-100 text-[var(--serie-gastos)]', antigo: 'bg-gray-100 text-gray-600', resgate: 'bg-amber-50 text-amber-700',
  venceu: 'bg-green-50 text-green-700', reaplicado: 'bg-gray-100 text-[var(--serie-sobrou)]',
};
const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const nomeDoMes = (c) => `${MESES[Number(c.slice(5, 7)) - 1]} de ${c.slice(0, 4)}`;
const ACAO = 'grid h-[30px] w-[30px] shrink-0 place-items-center rounded-[7px] border border-gray-300 bg-white text-gray-600 transition-colors hover:bg-gray-50 hover:text-gray-900 active:bg-gray-200';
const LARGURAS = [92, 150, null, 128, 128, 112, 132, 150, 84];

function detalhe(m) {
  const { ap } = m;
  if (m.tipo === 'aporte') return `dinheiro novo${ap.vencimento ? ` · vence ${formatDate(ap.vencimento)}` : ''}`;
  if (m.tipo === 'antigo') return ap.aplicado_em ? `anotado em ${formatDate(ap.data)}, com ${formatBRL(Number(ap.valor_centavos))}` : 'sem a data do depósito: no dia em que você anotou';
  if (m.tipo === 'reaplicado') return `venceu o aporte de ${m.de ? formatDate(dataDoDeposito(m.de)) : '—'} · reaplicou ${formatBRL(m.reaplicou)}`;
  if (m.tipo === 'venceu') return `aporte de ${formatDate(dataDoDeposito(ap))} · voltou para a conta`;
  const p = m.partes[0];
  return `do aporte de ${formatDate(dataDoDeposito(p.ap))}${p.r.tudo ? ' · tudo' : ''}`;
}

export default function ListaMovimentos({ carteira, cadastro, movel, acoes, inicio }) {
  const [filtroInv, setFiltroInv] = useState([]);
  const [filtroTipo, setFiltroTipo] = useState([]);
  const [ano, setAno] = useState('tudo');
  const [abertos, setAbertos] = useState(() => new Set());
  const todos = useMemo(() => movimentosDaCarteira(carteira), [carteira]);
  const cor = useMemo(() => {
    const ordem = [...carteira.grupos.map((g) => g.instituicao), ...instituicoesEmOrdem(cadastro)];
    const unicas = ordem.filter((n, i) => ordem.indexOf(n) === i);
    return Object.fromEntries(unicas.map((n, i) => [n, CORES_INSTITUICAO[i % CORES_INSTITUICAO.length]]));
  }, [carteira, cadastro]);
  const porAporte = useMemo(() => new Map(carteira.itens.map((x) => [x.ap.id, x])), [carteira]);

  const linhas = useMemo(() => todos.filter((m) => (!filtroInv.length || filtroInv.includes(m.inv.id))
    && (!filtroTipo.length || filtroTipo.includes(GRUPO[m.tipo])) && (ano === 'tudo' || m.data.slice(0, 4) === ano)), [todos, filtroInv, filtroTipo, ano]);
  const tot = totaisDosMovimentos(linhas);
  const anos = [...new Set(todos.map((m) => m.data.slice(0, 4)))].sort().reverse();
  const opcoesInv = useMemo(() => {
    const comMov = new Set(todos.map((m) => m.inv.id));
    return instituicoesEmOrdem(cadastro).map((nome) => ({
      titulo: nome, cor: cor[nome],
      itens: cadastro.filter((i) => i.instituicao.trim() === nome && comMov.has(i.id)).map((i) => ({ value: i.id, label: i.nome, grupo: nome })),
    })).filter((g) => g.itens.length);
  }, [cadastro, todos, cor]);
  const filtrando = filtroInv.length > 0 || filtroTipo.length > 0 || ano !== 'tudo';

  // os meses, com o que entrou e saiu em cada um (pelos filtros)
  const meses = useMemo(() => {
    const out = [];
    linhas.forEach((m) => {
      const c = m.data.slice(0, 7);
      if (!out.length || out[out.length - 1].c !== c) out.push({ c, itens: [] });
      out[out.length - 1].itens.push(m);
    });
    return out;
  }, [linhas]);

  const th = 'sticky top-0 z-20 whitespace-nowrap border-b border-gray-200 bg-hx-f9fafb px-3 py-2 text-[10.5px] font-semibold uppercase tracking-wide text-gray-500';
  const td = 'h-[40px] whitespace-nowrap border-b border-gray-100 px-3 text-[12.5px] transition-colors group-hover/linha:bg-[var(--gm-realce)]';
  const num = 'text-right tabular-nums';
  const alternar = (id) => setAbertos((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const colunas = movel ? LARGURAS.slice(0, -1) : LARGURAS;

  return (
    <section className="card flex flex-col overflow-hidden !p-0">
      <div className="flex shrink-0 flex-wrap items-center gap-2.5 px-4 pb-2.5 pt-3">
        {inicio}
        <FaixaProvider>
          <Trilho>
            <SegMulti id="inv" rotulo="Investimento" opcoes={opcoesInv} value={filtroInv} onChange={setFiltroInv} largura={260} busca="Buscar investimento" />
            <DivisorFaixa />
            <SegMulti id="tipo" rotulo="Movimento" opcoes={TIPOS} value={filtroTipo} onChange={setFiltroTipo} largura={200} />
            <DivisorFaixa />
            <SegUnico id="ano" rotulo="Período" padrao="tudo" mostraPadrao value={ano} onChange={setAno} largura={180}
              opcoes={[{ value: 'tudo', label: 'Todo o histórico' }, ...anos.map((a) => ({ value: a, label: a }))]} />
          </Trilho>
          <LimparFiltros ativo={filtrando} onClick={() => { setFiltroInv([]); setFiltroTipo([]); setAno('tudo'); }} />
        </FaixaProvider>
        <span className="flex-1" />
        <span className="text-[11.5px] text-gray-400">do mais novo para o mais antigo</span>
      </div>
      {linhas.length > 0 && (
        <div className="grid grid-cols-2 gap-2 px-4 pb-3 sm:grid-cols-4">
          {[['Entrou', tot.entrou, 'text-green-700', '+'], ['Saiu', tot.saiu, 'text-gray-900', ''], ['IR e IOF', tot.impostos, 'text-gray-900', ''], ['Chegou na conta', tot.chega, 'text-gray-900', '']].map(([r, v, c, s]) => (
            <div key={r} className="rounded-md border border-gray-200 bg-hx-f9fafb px-2.5 py-1.5">
              <span className="block text-[11px] text-gray-500">{r}</span>
              <b className={`text-[15px] font-semibold tabular-nums ${c}`}>{v ? `${s}${formatBRL(v)}` : '—'}</b>
            </div>
          ))}
        </div>
      )}
      {!linhas.length ? (
        <div className="px-4 pb-4"><ListaVazia>{todos.length ? 'Nenhuma movimentação com esses filtros.' : 'Nenhuma movimentação ainda. "Lançar aporte" registra a primeira.'}</ListaVazia></div>
      ) : (
        <div className="min-h-0 overflow-x-auto">
          <table className="w-full min-w-[1180px] table-fixed border-separate border-spacing-0">
            <colgroup>{colunas.map((w, i) => <col key={i} style={w ? { width: w } : undefined} />)}</colgroup>
            <thead><tr>
              <th className={`${th} text-left`}>Data</th><th className={`${th} text-left`}>Movimento</th><th className={`${th} text-left`}>Investimento</th>
              <th className={`${th} text-right`}>Entrou</th><th className={`${th} text-right`}>Saiu</th><th className={`${th} text-right`}>IR + IOF</th>
              <th className={`${th} text-right`}>Na conta</th><th className={`${th} text-right`}>Ficou no investimento</th>
              {!movel && <th className={th} aria-label="Ações" />}
            </tr></thead>
            <tbody>
              {meses.map(({ c, itens }) => {
                const t = totaisDosMovimentos(itens);
                return (
                  <Fragment key={c}>
                    <tr>
                      <td colSpan={3} className="h-[34px] border-b border-gray-200 bg-hx-f3f4f6 px-3 text-[12px] font-semibold text-gray-800">
                        {nomeDoMes(c)}<span className="ml-2 font-normal text-gray-500">{itens.length} {itens.length === 1 ? 'movimento' : 'movimentos'}</span>
                      </td>
                      <td className={`h-[34px] border-b border-gray-200 bg-hx-f3f4f6 px-3 text-[12px] font-semibold text-green-700 ${num}`}>{t.entrou ? `+${formatBRL(t.entrou)}` : ''}</td>
                      <td className={`h-[34px] border-b border-gray-200 bg-hx-f3f4f6 px-3 text-[12px] font-semibold text-amber-700 ${num}`}>{t.saiu ? `− ${formatBRL(t.saiu)}` : ''}</td>
                      <td colSpan={movel ? 3 : 4} className="h-[34px] border-b border-gray-200 bg-hx-f3f4f6" />
                    </tr>
                    {itens.map((m) => {
                      const grupoInst = m.inv.instituicao.trim();
                      const varios = m.partes && m.partes.length > 1;
                      const aberto = abertos.has(m.id);
                      const isento = m.saiu > 0 && !m.ir && !m.iof && !pagaIR(m.inv) && !pagaIOF(m.inv);
                      const item = porAporte.get(m.ap.id);
                      const ehAporte = m.tipo === 'aporte' || m.tipo === 'antigo' || m.tipo === 'reaplicado';
                      return (
                        <Fragment key={m.id}>
                          <tr className="group/linha">
                            <td className={`${td} tabular-nums text-gray-700`}>{formatDate(m.data)}</td>
                            <td className={td}><span className={`inline-flex h-[20px] items-center gap-1.5 rounded-[6px] px-1.5 text-[11px] font-semibold ${TOM[m.tipo]}`}><i className="h-[6px] w-[6px] rounded-full bg-current" />{ROTULO[m.tipo]}</span></td>
                            <td className={`${td} overflow-hidden`}>
                              <span className="flex min-w-0 items-center gap-2">
                                <span className="h-[16px] w-[3px] shrink-0 rounded-[2px]" style={{ background: cor[grupoInst] ?? 'var(--origem-manual)' }} />
                                <Tooltip label={grupoInst}><span className="shrink-0 font-medium text-gray-800">{m.inv.nome}</span></Tooltip>
                                {varios ? (
                                  <button type="button" onClick={() => alternar(m.id)} aria-expanded={aberto}
                                    className="inline-flex shrink-0 items-center gap-1 text-[11.5px] text-gray-500 transition-colors hover:text-gray-900">
                                    <svg viewBox="0 0 24 24" className={`h-[11px] w-[11px] transition-transform ${aberto ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6" /></svg>
                                    {m.partes.length} aportes
                                  </button>
                                ) : <span className="truncate text-[11.5px] text-gray-400">{detalhe(m)}</span>}
                                {item?.ap.conferir && <span className="inline-flex h-[18px] shrink-0 items-center rounded-[6px] bg-amber-50 px-1.5 text-[10.5px] font-semibold text-amber-700">conferir</span>}
                              </span>
                            </td>
                            <td className={`${td} ${num} text-green-700`}>{m.entrou ? `+${formatBRL(m.entrou)}` : ''}</td>
                            <td className={`${td} ${num} text-amber-700`}>{m.saiu ? `− ${formatBRL(m.saiu)}` : ''}</td>
                            <td className={`${td} ${num} ${m.tipo === 'reaplicado' ? 'text-gray-500' : 'text-gray-700'}`}>
                              {isento ? <span className="text-gray-400">isento</span> : m.ir + m.iof ? <Tooltip label={m.iof ? `IR ${formatBRL(m.ir)} · IOF ${formatBRL(m.iof)}` : `IR ${formatBRL(m.ir)}`}><span>− {formatBRL(m.ir + m.iof)}</span></Tooltip> : ''}
                            </td>
                            <td className={`${td} ${num} font-semibold text-gray-900`}>{m.chega !== null && m.saiu ? formatBRL(m.chega) : ''}</td>
                            <td className={`${td} ${num} ${m.ficou ? 'text-gray-700' : 'text-gray-400'}`}>{m.ficou ? formatBRL(m.ficou) : 'zerado'}</td>
                            {!movel && (
                              <td className={`${td} px-2`}>
                                {acoes && m.tipo !== 'venceu' && item && (
                                  <span className="flex justify-end gap-1 opacity-0 transition-opacity group-hover/linha:opacity-100 focus-within:opacity-100">
                                    <Tooltip label={ehAporte ? 'Editar o aporte' : 'Editar o resgate'}>
                                      <button type="button" aria-label={ehAporte ? 'Editar o aporte' : 'Editar o resgate'} className={ACAO}
                                        onClick={() => (ehAporte ? acoes.editar(item) : acoes.editarResgate(m))}><IconLapis className="h-[14px] w-[14px]" /></button>
                                    </Tooltip>
                                    <Tooltip label={ehAporte ? 'Excluir o aporte' : 'Excluir o resgate'}>
                                      <button type="button" aria-label={ehAporte ? 'Excluir o aporte' : 'Excluir o resgate'} className={`${ACAO} hover:!text-hx-c0393d`}
                                        onClick={() => (ehAporte ? acoes.excluir(item) : acoes.excluirResgate(m))}><IconLixeira className="h-[14px] w-[14px]" /></button>
                                    </Tooltip>
                                  </span>
                                )}
                              </td>
                            )}
                          </tr>
                          {varios && aberto && m.partes.map((p) => (
                            <tr key={`${m.id}-${p.r.id}`} className="group/linha">
                              <td className={`${td} h-[32px] bg-hx-fafbfc`} /><td className={`${td} h-[32px] bg-hx-fafbfc`} />
                              <td className={`${td} h-[32px] bg-hx-fafbfc text-[12px] text-gray-500`}>
                                <span className="ml-[3px] mr-2 inline-block h-px w-[18px] bg-gray-300 align-middle" />
                                do aporte de {formatDate(dataDoDeposito(p.ap))}{p.r.tudo ? <b className="ml-1 font-semibold text-gray-600">· tudo</b> : ''}
                              </td>
                              <td className={`${td} h-[32px] bg-hx-fafbfc`} />
                              <td className={`${td} h-[32px] bg-hx-fafbfc text-[12px] text-gray-500 ${num}`}>− {formatBRL(p.sai)}</td>
                              <td className={`${td} h-[32px] bg-hx-fafbfc text-[12px] text-gray-500 ${num}`}>{p.imp && p.imp.ir + p.imp.iof ? `− ${formatBRL(p.imp.ir + p.imp.iof)}` : ''}</td>
                              <td className={`${td} h-[32px] bg-hx-fafbfc text-[12px] text-gray-500 ${num}`}>{p.imp ? formatBRL(p.imp.chega) : ''}</td>
                              <td className={`${td} h-[32px] bg-hx-fafbfc`} />
                              {!movel && <td className={`${td} h-[32px] bg-hx-fafbfc`} />}
                            </tr>
                          ))}
                        </Fragment>
                      );
                    })}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-gray-100 px-4 py-2 text-[11.5px] text-gray-500">
        <span>"Ficou no investimento" é o valor dele no fim do dia do movimento, pela conta do CDI de cada dia. O IR e o IOF são os da conta do app: confira com o banco.</span>
      </div>
    </section>
  );
}
