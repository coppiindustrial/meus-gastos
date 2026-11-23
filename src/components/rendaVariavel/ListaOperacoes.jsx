import { Fragment, useMemo, useState } from 'react';
import Tooltip from '../Tooltip.jsx';
import ListaVazia from '../ListaVazia.jsx';
import { FaixaProvider, Trilho, DivisorFaixa, LimparFiltros } from '../filtros/FaixaFiltros.jsx';
import { SegMulti, SegUnico } from '../filtros/Segmentos.jsx';
import { IconLapis, IconLixeira } from '../icons.jsx';
import { formatBRL } from '../../lib/dinheiro.js';
import { formatDate } from '../../lib/format.js';
import { NOME_PROVENTO, emDolar, operacoesComDinheiro, precoDaOperacao, totaisDasOperacoes } from '../../lib/rendaVariavel.js';

// A ABA OPERAÇÕES (13/11/2026) NO JEITO DAS MOVIMENTAÇÕES DA RENDA FIXA (23/11/2026, a opção A do mockup "Operações por mês"):
// a faixa de filtros (o ativo, o tipo e o PERÍODO — todo o histórico ou um ano), os QUATRO NÚMEROS do que está filtrado
// (comprado, vendido, proventos líquidos, lucro nas vendas) e a lista da mais nova para a mais antiga SEPARADA POR MÊS (a
// faixa do mês com o que saiu e o que entrou). Cada linha: a data, a operação (a etiqueta), o ativo, a quantidade, o preço, o
// dólar, o que SAIU da conta (a compra) e o que ENTROU (a venda, o provento) — em reais, no exterior pelo dólar da operação; o
// lucro da venda no balão. O provento anunciado (data futura) aparece com "a receber" e não soma. Editar e excluir no hover.
// Contas em `operacoesComDinheiro` / `totaisDasOperacoes` (lib/rendaVariavel.js, testadas).

const TIPOS = [{ value: 'compra', label: 'Compra' }, { value: 'venda', label: 'Venda' }, { value: 'provento', label: 'Provento' }, { value: 'desdobramento', label: 'Desdobramento e grupamento' }];
// as etiquetas no desenho das das Movimentações (o ponto da cor e o fundo claro)
const TOM = {
  compra: 'bg-gray-100 text-[var(--serie-gastos)]', venda: 'bg-amber-50 text-amber-700', provento: 'bg-green-50 text-green-700',
  desdobramento: 'bg-gray-100 text-gray-600', grupamento: 'bg-gray-100 text-gray-600',
};
const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const nomeDoMes = (c) => `${MESES[Number(c.slice(5, 7)) - 1]} de ${c.slice(0, 4)}`;
const ACAO = 'grid h-[30px] w-[30px] shrink-0 place-items-center rounded-[7px] border border-gray-300 bg-white text-gray-600 transition-colors hover:bg-gray-50 hover:text-gray-900 active:bg-gray-200';
const LARGURAS = [96, 168, null, 84, 120, 84, 136, 136, 84];
const brl = (v) => formatBRL(Math.round(v));

export default function ListaOperacoes({ ativos, operacoes, hoje, dolar = null, movel, acoes, inicio }) {
  const [filtroAtivos, setFiltroAtivos] = useState([]);
  const [filtroTipos, setFiltroTipos] = useState([]);
  const [ano, setAno] = useState('tudo');
  const todas = useMemo(() => operacoesComDinheiro(ativos, operacoes, { dolar, hoje }), [ativos, operacoes, dolar, hoje]);
  const linhas = useMemo(() => todas.filter(({ op }) => (!filtroAtivos.length || filtroAtivos.includes(op.ativo_id))
    && (!filtroTipos.length || filtroTipos.includes(op.tipo === 'grupamento' ? 'desdobramento' : op.tipo))
    && (ano === 'tudo' || op.data.slice(0, 4) === ano)), [todas, filtroAtivos, filtroTipos, ano]);
  const tot = totaisDasOperacoes(linhas);
  const anos = [...new Set(todas.map((x) => x.op.data.slice(0, 4)))].sort().reverse();
  const opcoesAtivo = ativos.filter((a) => todas.some((x) => x.ativo.id === a.id)).map((a) => ({ value: a.id, label: a.ticker }));
  const filtrando = filtroAtivos.length > 0 || filtroTipos.length > 0 || ano !== 'tudo';
  // os meses, na ordem da lista
  const meses = useMemo(() => {
    const out = [];
    linhas.forEach((x) => {
      const c = x.op.data.slice(0, 7);
      if (!out.length || out[out.length - 1].c !== c) out.push({ c, itens: [] });
      out[out.length - 1].itens.push(x);
    });
    return out;
  }, [linhas]);

  const th = 'sticky top-0 z-20 whitespace-nowrap border-b border-gray-200 bg-hx-f9fafb px-3 py-2 text-[10.5px] font-semibold uppercase tracking-wide text-gray-500';
  const td = 'h-[40px] whitespace-nowrap border-b border-gray-100 px-3 text-[12.5px] transition-colors group-hover/linha:bg-[var(--gm-realce)]';
  const num = 'text-right tabular-nums';
  const faixa = 'h-[34px] border-b border-gray-200 bg-hx-f3f4f6 px-3 text-[12px] font-semibold';
  const moeda = (usd, v) => `${usd ? 'US$' : 'R$'} ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const colunas = movel ? LARGURAS.slice(0, -1) : LARGURAS;
  const numeros = [
    ['Comprado · saiu da conta', tot.comprado ? `− ${brl(tot.comprado)}` : '—', 'text-amber-700'],
    ['Vendido · entrou na conta', tot.vendido ? `+${brl(tot.vendido)}` : '—', 'text-green-700'],
    ['Proventos · líquidos', tot.proventos ? `+${brl(tot.proventos)}` : '—', 'text-green-700'],
    ['Lucro nas vendas', tot.vendido ? `${tot.lucro >= 0 ? '+' : '− '}${brl(Math.abs(tot.lucro))}` : '—', tot.lucro >= 0 ? 'text-green-700' : 'text-red-700'],
  ];

  return (
    <>
      <div className="flex shrink-0 flex-wrap items-center gap-2.5 px-4 pb-2.5 pt-3">
        {inicio}
        <FaixaProvider>
          <Trilho>
            <SegMulti id="ativo" rotulo="Ativo" opcoes={opcoesAtivo} value={filtroAtivos} onChange={setFiltroAtivos} largura={200} />
            <DivisorFaixa />
            <SegMulti id="tipo" rotulo="Tipo" opcoes={TIPOS} value={filtroTipos} onChange={setFiltroTipos} largura={230} />
            <DivisorFaixa />
            <SegUnico id="ano" rotulo="Período" padrao="tudo" mostraPadrao value={ano} onChange={setAno} largura={180}
              opcoes={[{ value: 'tudo', label: 'Todo o histórico' }, ...anos.map((a) => ({ value: a, label: a }))]} />
          </Trilho>
          <LimparFiltros ativo={filtrando} onClick={() => { setFiltroAtivos([]); setFiltroTipos([]); setAno('tudo'); }} />
        </FaixaProvider>
        <span className="flex-1" />
        <span className="text-[11.5px] text-gray-400">{linhas.length} {linhas.length === 1 ? 'operação' : 'operações'} · da mais nova para a mais antiga</span>
      </div>
      {linhas.length > 0 && (
        <div className="grid grid-cols-2 gap-2 px-4 pb-3 sm:grid-cols-4">
          {numeros.map(([r, v, c]) => (
            <div key={r} className="rounded-md border border-gray-200 bg-hx-f9fafb px-2.5 py-1.5">
              <span className="block text-[11px] text-gray-500">{r}</span>
              <b className={`text-[15px] font-semibold tabular-nums ${v === '—' ? 'text-gray-400' : c}`}>{v}</b>
            </div>
          ))}
        </div>
      )}
      {!linhas.length ? (
        <div className="px-4 pb-4"><ListaVazia>{operacoes.length ? 'Nenhuma operação com esses filtros.' : 'Nenhuma operação ainda. "+ Lançar operação" registra a primeira compra.'}</ListaVazia></div>
      ) : (
        <div className="min-h-0 overflow-x-auto">
          <table className="w-full min-w-[1080px] table-fixed border-separate border-spacing-0">
            <colgroup>{colunas.map((w, i) => <col key={i} style={w ? { width: w } : undefined} />)}</colgroup>
            <thead><tr>
              <th className={`${th} text-left`}>Data</th><th className={`${th} text-left`}>Operação</th><th className={`${th} text-left`}>Ativo</th>
              <th className={`${th} text-right`}>Qtd</th><th className={`${th} text-right`}>Preço</th><th className={`${th} text-right`}>Dólar</th>
              <th className={`${th} text-right`}>Saiu da conta</th><th className={`${th} text-right`}>Entrou na conta</th>
              {!movel && <th className={th} aria-label="Ações" />}
            </tr></thead>
            <tbody>
              {meses.map(({ c, itens }) => {
                const t = totaisDasOperacoes(itens);
                return (
                  <Fragment key={c}>
                    <tr>
                      <td colSpan={6} className={`${faixa} text-gray-800`}>
                        {nomeDoMes(c)}<span className="ml-2 font-normal text-gray-500">{itens.length} {itens.length === 1 ? 'operação' : 'operações'}</span>
                      </td>
                      <td className={`${faixa} ${num} text-amber-700`}>{t.saiu ? `− ${brl(t.saiu)}` : ''}</td>
                      <td className={`${faixa} ${num} text-green-700`}>{t.entrou ? `+${brl(t.entrou)}` : ''}</td>
                      {!movel && <td className={faixa} />}
                    </tr>
                    {itens.map(({ op: o, ativo: a, saiu, entrou, lucro, aReceber }) => {
                      const usd = emDolar(a);
                      const p = precoDaOperacao(o);
                      const desd = o.tipo === 'desdobramento' || o.tipo === 'grupamento';
                      const rotulo = o.tipo === 'provento' ? (NOME_PROVENTO[o.provento] ?? 'Provento')
                        : desd ? `${o.tipo === 'grupamento' ? 'Grupamento' : 'Desdobramento'} · 1 para ${Number(o.fator).toLocaleString('pt-BR', { maximumFractionDigits: 4 })}`
                          : o.tipo === 'compra' ? 'Compra' : 'Venda';
                      return (
                        <tr key={o.id} className="group/linha">
                          <td className={`${td} tabular-nums text-gray-700`}>{formatDate(o.data)}</td>
                          <td className={`${td} overflow-hidden`}>
                            <span className="inline-flex items-center gap-1.5">
                              <span className={`inline-flex h-[20px] items-center gap-1.5 rounded-[6px] px-1.5 text-[11px] font-semibold ${TOM[o.tipo]}`}><i className="h-[6px] w-[6px] rounded-full bg-current" />{rotulo}</span>
                              {aReceber && <span className="inline-flex h-[20px] items-center rounded-[6px] bg-amber-50 px-1.5 text-[11px] font-semibold text-amber-700">a receber</span>}
                            </span>
                          </td>
                          <td className={`${td} overflow-hidden`}>
                            <span className="flex min-w-0 items-center gap-1.5">
                              <b className="shrink-0 font-semibold text-gray-900">{a.ticker}</b>
                              {a.nome ? <span className="truncate text-gray-500">{a.nome}</span> : null}
                            </span>
                          </td>
                          <td className={`${td} ${num} text-gray-700`}>{o.quantidade ? Number(o.quantidade).toLocaleString('pt-BR', { maximumFractionDigits: 6 }) : '—'}</td>
                          <td className={`${td} ${num} text-gray-700`}>{p !== null ? moeda(usd, p) : '—'}</td>
                          <td className={`${td} ${num} text-gray-500`}>{usd && o.dolar ? Number(o.dolar).toLocaleString('pt-BR', { minimumFractionDigits: 4 }) : '—'}</td>
                          <td className={`${td} ${num} text-amber-700`}>{saiu ? `− ${brl(saiu)}` : ''}</td>
                          <td className={`${td} ${num} ${aReceber ? 'text-gray-400' : 'text-green-700'}`}>
                            {entrou ? (lucro !== null
                              ? <Tooltip label={`Lucro da venda, pelo custo médio: ${lucro >= 0 ? '' : '− '}${brl(Math.abs(lucro))}`}><span className="cursor-help underline decoration-gray-300 decoration-dotted underline-offset-[3px]">+{brl(entrou)}</span></Tooltip>
                              : `+${brl(entrou)}`) : ''}
                          </td>
                          {!movel && (
                            <td className={`${td} px-2`}>
                              {acoes && (
                                <span className="flex justify-end gap-1 opacity-0 transition-opacity group-hover/linha:opacity-100 focus-within:opacity-100">
                                  <Tooltip label="Editar a operação"><button type="button" aria-label="Editar a operação" className={ACAO} onClick={() => acoes.editar(a, o)}><IconLapis className="h-[14px] w-[14px]" /></button></Tooltip>
                                  <Tooltip label="Excluir a operação"><button type="button" aria-label="Excluir a operação" className={`${ACAO} hover:!text-hx-c0393d`} onClick={() => acoes.excluir(a, o)}><IconLixeira className="h-[14px] w-[14px]" /></button></Tooltip>
                                </span>
                              )}
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
