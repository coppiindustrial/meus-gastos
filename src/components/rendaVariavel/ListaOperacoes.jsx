import { useMemo, useState } from 'react';
import Tooltip from '../Tooltip.jsx';
import ListaVazia from '../ListaVazia.jsx';
import { FaixaProvider, Trilho, DivisorFaixa, LimparFiltros } from '../filtros/FaixaFiltros.jsx';
import { SegMulti } from '../filtros/Segmentos.jsx';
import { Etiqueta } from '../Comuns.jsx';
import { IconLapis, IconLixeira } from '../icons.jsx';
import { formatBRL } from '../../lib/dinheiro.js';
import { formatDate } from '../../lib/format.js';
import { NOME_PROVENTO, emDolar, precoDaOperacao } from '../../lib/rendaVariavel.js';

// A ABA OPERAÇÕES (13/11/2026): todas as operações, a mais nova em cima, com a faixa de filtros do app (o ativo e o tipo).
// Cada linha: a data, o ativo, o tipo (a etiqueta), a quantidade, o preço, o dólar e o total em reais (no exterior, pelo dólar
// da operação). Editar e excluir no hover, como na carteira.

const TIPOS = [{ value: 'compra', label: 'Compra' }, { value: 'venda', label: 'Venda' }, { value: 'provento', label: 'Provento' }, { value: 'desdobramento', label: 'Desdobramento e grupamento' }];
const TOM = { compra: 'cinza', venda: 'ambar', provento: 'verde', desdobramento: 'cinza', grupamento: 'cinza' };
const ACAO = 'grid h-[30px] w-[30px] shrink-0 place-items-center rounded-[7px] border border-gray-300 bg-white text-gray-600 transition-colors hover:bg-gray-50 hover:text-gray-900 active:bg-gray-200';

export default function ListaOperacoes({ ativos, operacoes, hoje, movel, acoes, inicio }) {
  const [filtroAtivos, setFiltroAtivos] = useState([]);
  const [filtroTipos, setFiltroTipos] = useState([]);
  const porId = useMemo(() => Object.fromEntries(ativos.map((a) => [a.id, a])), [ativos]);
  const linhas = useMemo(() => operacoes
    .filter((o) => (!filtroAtivos.length || filtroAtivos.includes(o.ativo_id)) && (!filtroTipos.length || filtroTipos.includes(o.tipo === 'grupamento' ? 'desdobramento' : o.tipo)))
    .sort((a, b) => (a.data < b.data ? 1 : a.data > b.data ? -1 : String(b.criado_em).localeCompare(String(a.criado_em)))), [operacoes, filtroAtivos, filtroTipos]);
  const opcoesAtivo = ativos.map((a) => ({ value: a.id, label: a.ticker }));
  const th = 'sticky top-0 z-20 whitespace-nowrap border-b border-gray-200 bg-hx-f9fafb px-3 py-2 text-[10.5px] font-semibold uppercase tracking-wide text-gray-500';
  const num = 'px-3 text-right tabular-nums';
  const moeda = (usd, v) => `${usd ? 'US$' : 'R$'} ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <>
      <div className="flex shrink-0 flex-wrap items-center gap-2.5 px-4 pb-2.5 pt-3">
        {inicio}
        <FaixaProvider>
          <Trilho>
            <SegMulti id="ativo" rotulo="Ativo" opcoes={opcoesAtivo} value={filtroAtivos} onChange={setFiltroAtivos} largura={200} />
            <DivisorFaixa />
            <SegMulti id="tipo" rotulo="Tipo" opcoes={TIPOS} value={filtroTipos} onChange={setFiltroTipos} largura={230} />
          </Trilho>
          <LimparFiltros ativo={filtroAtivos.length > 0 || filtroTipos.length > 0} onClick={() => { setFiltroAtivos([]); setFiltroTipos([]); }} />
        </FaixaProvider>
        <span className="flex-1" />
        <span className="text-[11.5px] text-gray-400">{linhas.length} {linhas.length === 1 ? 'operação' : 'operações'}</span>
      </div>
      {!linhas.length ? (
        <div className="px-4 pb-4"><ListaVazia>{operacoes.length ? 'Nenhuma operação com esses filtros.' : 'Nenhuma operação ainda. "+ Lançar operação" registra a primeira compra.'}</ListaVazia></div>
      ) : (
        <div className="min-h-0 overflow-x-auto">
          <table className="w-full min-w-[880px] border-separate border-spacing-0 text-[13px]">
            <thead><tr>
              <th className={`${th} text-left`}>Data</th><th className={`${th} text-left`}>Ativo</th><th className={`${th} text-left`}>Tipo</th>
              <th className={`${th} text-right`}>Qtd</th><th className={`${th} text-right`}>Preço</th><th className={`${th} text-right`}>Dólar</th><th className={`${th} text-right`}>Total em R$</th>
              {!movel && <th className={th} aria-label="Ações" style={{ width: 84 }} />}
            </tr></thead>
            <tbody>
              {linhas.map((o) => {
                const a = porId[o.ativo_id]; if (!a) return null;
                const usd = emDolar(a);
                const p = precoDaOperacao(o);
                const fx = usd ? Number(o.dolar ?? 0) : 1;
                const total = o.tipo === 'provento' ? (Number(o.valor_centavos) - Number(o.retido_centavos ?? 0)) * fx
                  : o.valor_centavos ? (Number(o.valor_centavos) + (o.tipo === 'venda' ? -1 : 1) * Number(o.taxas_centavos ?? 0)) * fx : null;
                const td = 'h-[38px] border-b border-gray-100 py-1 text-[12.5px] transition-colors group-hover/linha:bg-[var(--gm-realce)]';
                const rotulo = o.tipo === 'provento' ? (NOME_PROVENTO[o.provento] ?? 'Provento') : o.tipo === 'desdobramento' || o.tipo === 'grupamento' ? `${o.tipo === 'grupamento' ? 'Grupamento' : 'Desdobramento'} · 1 para ${Number(o.fator).toLocaleString('pt-BR', { maximumFractionDigits: 4 })}` : o.tipo === 'compra' ? 'Compra' : 'Venda';
                return (
                  <tr key={o.id} className="group/linha">
                    <td className={`${td} px-3 tabular-nums text-gray-700`}>{formatDate(o.data)}</td>
                    <td className={`${td} px-3`}><b className="font-semibold text-gray-900">{a.ticker}</b>{a.nome ? <span className="ml-1.5 text-gray-500">{a.nome}</span> : null}</td>
                    <td className={`${td} px-3`}><span className="inline-flex items-center gap-1.5"><Etiqueta tom={TOM[o.tipo]}>{rotulo}</Etiqueta>{o.tipo === 'provento' && o.data > hoje && <Etiqueta tom="ambar">a receber</Etiqueta>}</span></td>
                    <td className={`${td} ${num} text-gray-700`}>{o.quantidade ? Number(o.quantidade).toLocaleString('pt-BR', { maximumFractionDigits: 6 }) : '—'}</td>
                    <td className={`${td} ${num} text-gray-700`}>{p !== null ? moeda(usd, p) : '—'}</td>
                    <td className={`${td} ${num} text-gray-500`}>{usd && o.dolar ? Number(o.dolar).toLocaleString('pt-BR', { minimumFractionDigits: 4 }) : '—'}</td>
                    <td className={`${td} ${num} ${o.tipo === 'provento' ? 'text-green-700' : 'text-gray-800'}`}>{total === null ? '—' : `${o.tipo === 'provento' || o.tipo === 'venda' ? '+' : ''}${formatBRL(Math.round(total))}`}</td>
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
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
