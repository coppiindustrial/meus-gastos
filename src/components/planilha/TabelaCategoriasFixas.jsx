import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import BalaoGrafico, { useBalao } from '../graficos/BalaoGrafico.jsx';
import ModalCategoriaFixa from './ModalCategoriaFixa.jsx';
import { formatBRL, valorParaCampo } from '../../lib/dinheiro.js';
import { competenciaCurta, formatDate, nomeCompetencia } from '../../lib/format.js';

// AS CATEGORIAS FIXAS (16/11/2026, o mockup "Fixos por categoria", as recomendadas; migration 033): embaixo da grade dos
// fixos lançados à mão, as categorias marcadas como gasto fixo, agrupadas como nas Categorias (a barra na cor do grupo),
// uma coluna por mês — as mesmas larguras da `MatrizFixos`, para os meses ficarem um embaixo do outro. NÃO SE LANÇA: cada
// célula soma o que caiu na categoria no mês (o ponto da origem: cartão ou avulso/boleto), a parcela que já está numa
// fatura (hachurada) e, de hoje em diante, o PREVISTO que ainda falta (tracejado; some quando o real entra). O balão diz as
// compras; clicar abre o mês nos Lançamentos, só com a categoria. As contas em `lib/categoriasFixas.js`.
//
// `tabela`: a de `tabelaCategoriasFixas`. `onEscolher`: abre o "Escolher categorias". `semMigracao`: falta a 033.
// `marcadas`: quantas categorias estão marcadas (com os filtros da tela, a tabela pode vir vazia mesmo havendo).
// `modo`: 'valor' | 'variacao' — o Valor | Variação % da tela vale também aqui (18/11/2026: só a grade de cima trocava).
// Na variação, cada mês com gasto é o % sobre o que caiu no mês anterior (o real, sem o previsto nem as parcelas que vêm);
// sem o mês anterior, "—"; o mês sem gasto fica vazio.
// A ÚLTIMA COLUNA É A MÉDIA (18/11/2026, a opção B do mockup "Média do custo fixo"; antes era o "No ano", que foi para o
// balão): a que vem todo mês pelos meses fechados com gasto, a anual pelo ano ÷ 12 (`mediaDaCategoria`); a do grupo e a
// do Total, a soma das médias.

const ORIGEM = { cartao: ['cartão', 'var(--origem-cartao)'], manual: ['avulso / boleto', 'var(--origem-manual)'], fixo: ['fixo', 'var(--origem-fixo)'] };
const fmt = (v) => valorParaCampo(v);
const LARG = 290;
const pct = (atual, antes) => (antes ? Math.round(((atual - antes) / antes) * 100) : null);
// a célula da variação: o % sobre o mês anterior, vermelho subindo e verde descendo (como na grade de cima)
function Variacao({ atual, antes }) {
  if (!atual) return null;
  const v = pct(atual, antes);
  if (v === null) return <span className="text-gray-300">—</span>;
  return <span className={v > 0 ? 'text-hx-b91c1c' : v < 0 ? 'text-hx-15803d' : 'text-gray-400'}>{v > 0 ? '+' : ''}{v}%</span>;
}

// A origem que mais pesou no mês (o ponto da célula).
const origemDe = (itens) => {
  const por = new Map();
  itens.forEach((l) => por.set(l.origem, (por.get(l.origem) ?? 0) + Math.abs(Number(l.valor_centavos))));
  return [...por].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'manual';
};

function Celula({ cel }) {
  if (!cel.total) return null;
  const tracejado = 'inline-block rounded-[4px] border border-dashed border-gray-300 px-[5px] italic leading-[16px] text-gray-400';
  const hachura = 'grade-hachura inline-block rounded-[4px] px-[5px] leading-[16px] text-gray-500';
  let principal;
  let resto = 0;
  if (cel.real) {
    principal = (
      <span className="text-gray-800">
        <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full align-[2px]" style={{ background: ORIGEM[origemDe(cel.itens)]?.[1] ?? ORIGEM.manual[1] }} />
        {fmt(cel.real)}
      </span>
    );
    resto = cel.parc + cel.prev;
  } else if (cel.parc) {
    principal = <span className={hachura}>{fmt(cel.parc)}</span>;
    resto = cel.prev;
  } else principal = <span className={tracejado}>{fmt(cel.prev)}</span>;
  return (
    <span className="flex flex-col items-end leading-[1.15]">
      {principal}
      {resto > 0 && <span className="text-[10.5px] italic text-gray-400">+{fmt(resto)}</span>}
      {cel.parcela > 0 && !resto && <span className="text-[10px] text-gray-400">{cel.parcela}/{cel.de}</span>}
    </span>
  );
}

// O NOME DA CATEGORIA ABRE O POP-UP DELA (19/11/2026, a opção B do mockup "Categoria fixa · pop-up"; migration 034,
// `parcelavel`): o `ModalCategoriaFixa`, no desenho do "Editar gasto fixo" — pelo histórico ou parcelado em N vezes, os
// últimos 12 meses e "Tirar dos gastos fixos". O NOME É O DOS FIXOS DE CIMA (`MatrizFixos`): o ponto da cor do grupo, o
// sublinhado cinza e o lápis no hover; o botão direito e o Shift+F2 (com o nome em foco) também abrem. A parcelada mostra
// qual parcela é embaixo do valor (3/8) e não prevê nada depois da última. `onRecarregar`: a tela relê depois de salvar.
export default function TabelaCategoriasFixas({ tabela, hoje, onEscolher, semMigracao, marcadas = 0, modo = 'valor', parcelavel = false, onRecarregar }) {
  const navigate = useNavigate();
  const balao = useBalao(LARG, 200);
  const [aberta, setAberta] = useState(null); // { item, cor, grupo }
  const { comps, grupos, totais } = tabela;
  const colHoje = comps.indexOf(hoje);
  const passa = (chave) => ({ onMouseMove: balao.aoMover(chave), onMouseLeave: balao.aoSair });
  const nCats = grupos.reduce((s, g) => s + g.categorias.length, 0);
  const variacao = modo === 'variacao';
  // o que caiu de fato em cada mês (a base da variação): por grupo e no total
  const realDoGrupo = (g, i) => g.categorias.reduce((t, c) => t + c.celulas[i].real, 0);
  const realTotal = (i) => grupos.reduce((t, g) => t + realDoGrupo(g, i), 0);

  // O conteúdo do balão de uma célula: as compras do mês, a parcela que vem e o que falta do previsto.
  const balaoDe = (chave) => {
    const [tipo, gi, ci, i] = chave.split(':').map((x, k) => (k ? Number(x) : x));
    if (tipo === 'g') {
      const g = grupos[gi];
      return { titulo: `${g.nome} · ${nomeCompetencia(comps[i])}`, itens: g.categorias.filter((c) => c.celulas[i].total).map((c) => ({ rotulo: c.cat.nome, valor: formatBRL(c.celulas[i].total) })) };
    }
    if (tipo === 'm') {
      const ano = comps[0].slice(0, 4);
      if (gi < 0) return { titulo: `Média das categorias · ${ano}`, itens: [{ rotulo: 'Por mês', valor: formatBRL(tabela.media) }, { rotulo: `No ano (com o previsto)`, valor: formatBRL(tabela.ano) }], nota: 'A soma das médias de cada categoria.' };
      if (ci < 0) {
        const g = grupos[gi];
        return { titulo: `${g.nome} · média`, itens: g.categorias.map((c) => ({ rotulo: c.cat.nome, valor: formatBRL(c.media) })), nota: 'A soma das médias das categorias do grupo.' };
      }
      const c = grupos[gi].categorias[ci];
      return {
        titulo: `${c.cat.nome} · média`,
        itens: [{ rotulo: 'Por mês', valor: formatBRL(c.media) }, { rotulo: `No ano (${ano}, com o previsto)`, valor: formatBRL(c.ano) }],
        nota: c.perfil.tipo === 'parcelado' && c.regra.startsWith('parcela')
          ? `Parcelado em ${c.perfil.n}×: a média é a parcela (a média das que caíram).`
          : c.regra === 'ano ÷ 12'
          ? 'Não vem todo mês: o ano inteiro (o que veio e o previsto) dividido por 12 — o quanto separar por mês.'
          : c.regra === 'previsto'
            ? 'Vem todo mês, mas o ano ainda não tem mês fechado: vale o previsto.'
            : `Vem todo mês: a média dos meses fechados com gasto (${c.regra}; o mês em andamento não entra).`,
      };
    }
    if (tipo === 'n') {
      const c = grupos[gi].categorias[ci];
      return {
        titulo: `${c.cat.nome} · ${grupos[gi].nome}`,
        itens: [{ rotulo: `No ano (${comps[0].slice(0, 4)})`, valor: formatBRL(c.ano) }],
        nota: (c.perfil.tipo === 'parcelado'
          ? `Parcelado (${c.como}): o previsto só nos meses das parcelas, de ${formatBRL(c.perfil.valor)}.`
          : c.perfil.tipo === 'mensal'
            ? `Vem todo mês: o previsto é a média dos últimos meses (${formatBRL(c.perfil.valor)}).`
            : c.perfil.tipo === 'sazonal'
              ? `Vem em alguns meses (${c.como}): o previsto de cada mês é o que caiu no mesmo mês do ano anterior.`
              : 'Nada nos últimos 12 meses: sem previsto.')
          + (parcelavel ? ' Clique no nome para dizer como é pago (parcelado ou pelo histórico).' : ''),
      };
    }
    const c = grupos[gi].categorias[ci];
    const cel = c.celulas[i];
    const itens = [
      ...cel.itens.map((l) => ({
        rotulo: `${formatDate(l.data)} · ${l.descricao}${l.parcela_total ? ` ${l.parcela_atual}/${l.parcela_total}` : ''}`,
        valor: formatBRL(Number(l.valor_centavos)), cor: ORIGEM[l.origem]?.[1],
      })),
      ...cel.parcelas.map((p) => ({ rotulo: `${p.descricao} ${p.parcela}/${p.parcela_total} · na fatura`, valor: formatBRL(Number(p.valor_centavos)) })),
      ...(cel.prev ? [{ rotulo: cel.real || cel.parc ? 'Falta (previsto)' : 'Previsto', valor: formatBRL(cel.prev) }] : []),
    ];
    return {
      titulo: `${c.cat.nome} · ${nomeCompetencia(cel.comp)}`,
      itens: itens.length > 8 ? [...itens.slice(0, 7), { rotulo: `mais ${itens.length - 7}…`, valor: '' }] : itens,
      nota: cel.prev
        ? `Previsto ${formatBRL(cel.previsto)}: ${c.perfil.tipo === 'parcelado' ? `a parcela ${cel.parcela}/${cel.de}` : c.perfil.tipo === 'mensal' ? 'a média dos últimos meses' : 'o que caiu no mesmo mês do ano anterior'}. Some quando o gasto entra.`
        : cel.itens.length ? 'Clique para abrir nos Lançamentos.' : undefined,
    };
  };
  const conteudo = balao.ativo ? balaoDe(balao.ativo) : null;

  const th = 'h-[33px] border-b border-r border-gray-300 bg-hx-f9fafb px-2 text-right text-[11px] font-semibold uppercase tracking-wide text-gray-500';
  const td = 'h-[38px] border-b border-r border-gray-100 px-2 text-right tabular-nums';

  return (
    <div className="mt-5">
      <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1">
        <b className="text-[13px] font-semibold text-gray-900">Categorias fixas</b>
        <span className="text-[12px] text-gray-500">o que caiu nelas, venha do cartão, de boleto ou de onde for · não se lança</span>
        <span className="flex-1" />
        <button type="button" className="btn-secondary !h-8 !px-3 !text-[12.5px]" onClick={onEscolher} disabled={semMigracao}
          title={semMigracao ? 'Aplique a migration 033 no SQL Editor do Supabase' : 'Marcar ou desmarcar as categorias que são gasto fixo'}>
          Escolher categorias
        </button>
      </div>

      {semMigracao || !nCats ? (
        <div className="rounded-lg border border-dashed border-gray-300 bg-white px-5 py-6 text-[12.5px] leading-[1.5] text-gray-500">
          {semMigracao
            ? <>Para marcar categorias como gasto fixo, aplique a migration 033 (<code>supabase/migrations/033_categoria_gasto_fixo.sql</code>) no SQL Editor do Supabase.</>
            : marcadas ? 'Nenhuma categoria fixa com esses filtros.'
            : <>Nenhuma categoria marcada como gasto fixo. Marque o Streaming, o IPTU, o seguro do carro… em <b className="font-semibold text-gray-700">Escolher categorias</b> (ou na chave "Gasto fixo" do cadastro das Categorias): tudo o que cair nelas, de onde vier, aparece aqui mês a mês, com o previsto dos meses que ainda não chegaram.</>}
        </div>
      ) : (
        <>
          <div className="overflow-auto rounded-t-lg border border-gray-300 bg-white" style={{ scrollPaddingLeft: 210 }}>
            <table className="w-full min-w-[1080px] table-fixed border-separate border-spacing-0 text-[12.5px]">
              <colgroup><col style={{ width: 210 }} />{comps.map((c) => <col key={c} />)}<col style={{ width: 84 }} /></colgroup>
              <thead>
                <tr>
                  <th className={`${th} sticky left-0 z-20 text-left`}>Categoria</th>
                  {comps.map((c, i) => (
                    <th key={c} className={`${th} ${i === colHoje ? '!bg-hx-eef2f7 text-gray-800' : ''}`}
                      style={i === colHoje ? { boxShadow: 'inset 0 -2px 0 var(--grade-sel)' } : undefined}>
                      {competenciaCurta(c).slice(0, 3)}
                    </th>
                  ))}
                  <th {...passa('m:-1:-1:0')} className={`${th} !border-r-0 cursor-help`}>Média</th>
                </tr>
              </thead>
              <tbody>
                {grupos.map((g, gi) => [
                  <tr key={g.id}>
                    <td className="sticky left-0 z-10 h-8 border-b border-r border-gray-300 bg-hx-f6f7f8 px-3 text-left font-semibold text-gray-800"
                      style={{ boxShadow: `inset 3px 0 0 ${g.cor}` }}>
                      <span className="block truncate">{g.nome}</span>
                    </td>
                    {g.totais.map((v, i) => (
                      <td key={comps[i]} {...(v ? passa(`g:${gi}:0:${i}`) : {})}
                        className="h-8 border-b border-r border-gray-100 bg-hx-f6f7f8 px-2 text-right font-semibold tabular-nums text-gray-700">
                        {variacao ? <Variacao atual={realDoGrupo(g, i)} antes={i ? realDoGrupo(g, i - 1) : 0} /> : v ? fmt(v) : ''}
                      </td>
                    ))}
                    <td {...(g.media ? passa(`m:${gi}:-1:0`) : {})} className="h-8 cursor-help border-b border-gray-100 bg-hx-f6f7f8 px-2 text-right font-semibold tabular-nums text-gray-700">{g.media ? fmt(g.media) : ''}</td>
                  </tr>,
                  ...g.categorias.map((c, ci) => (
                    <tr key={c.cat.id}>
                      <td {...passa(`n:${gi}:${ci}:0`)} className="sticky left-0 z-10 h-[38px] border-b border-r border-gray-300 bg-white py-0.5 pl-[18px] pr-1 text-left">
                        {(() => {
                          const abrir = () => { balao.aoSair(); setAberta({ item: c, cor: g.cor, grupo: g.nome }); };
                          const miolo = (
                            <>
                              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: g.cor ?? '#9ca3af' }} />
                              <span className="flex min-w-0 flex-col leading-[1.25]">
                                {/* o pb + -mb dá lugar ao sublinhado: o `truncate` corta o que passa da caixa, e ele (3px abaixo da letra) sumia em
                                    alguns nomes, conforme a linha caía na fração de pixel (23/11/2026) */}
                                <span className="-mb-[3px] truncate pb-[3px] text-gray-900 decoration-gray-400 underline-offset-[3px] group-hover/nome:underline">{c.cat.nome}</span>
                                <small className="truncate text-[10.5px] text-gray-400">{c.como}</small>
                              </span>
                            </>
                          );
                          return parcelavel ? (
                            <button type="button" onClick={abrir} onMouseDown={(e) => e.stopPropagation()}
                              onContextMenu={(e) => { e.preventDefault(); abrir(); }}
                              onKeyDown={(e) => { if (e.shiftKey && e.key === 'F2') { e.preventDefault(); abrir(); } }}
                              className="group/nome flex w-full min-w-0 items-center gap-2 rounded-[4px] px-1.5 py-[3px] text-left transition-colors duration-[120ms] hover:bg-gray-200/70 active:bg-gray-200">
                              {miolo}
                              <svg viewBox="0 0 24 24" className="ml-auto h-3.5 w-3.5 shrink-0 text-gray-500 opacity-0 transition-opacity group-hover/nome:opacity-100" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <path d="M4 20h4L19 9l-4-4L4 16v4z" />
                              </svg>
                            </button>
                          ) : <span className="flex min-w-0 items-center gap-2 px-1.5 py-[3px]">{miolo}</span>;
                        })()}
                      </td>
                      {c.celulas.map((cel, i) => (
                        <td key={cel.comp} {...(cel.total ? passa(`c:${gi}:${ci}:${i}`) : {})}
                          onClick={() => { if (cel.itens.length) navigate(`/lancamentos?mes=${cel.comp}&cat=${c.cat.id}`); }}
                          className={`${td} ${cel.itens.length ? 'cursor-pointer hover:bg-gray-50' : ''}`}>
                          {variacao ? <Variacao atual={cel.real} antes={i ? c.celulas[i - 1].real : 0} /> : <Celula cel={cel} />}
                        </td>
                      ))}
                      <td {...(c.media ? passa(`m:${gi}:${ci}:0`) : {})} className={`${td} !border-r-0 cursor-help bg-hx-f9fafb py-1`}>
                        {c.media ? (
                          <span className="flex flex-col items-end leading-[1.2]">
                            <span className="text-gray-700">{fmt(c.media)}</span>
                            <small className="whitespace-nowrap text-[10px] text-gray-400">{c.regra}</small>
                          </span>
                        ) : <span className="text-gray-300">—</span>}
                      </td>
                    </tr>
                  )),
                ])}
                <tr>
                  <td className="sticky left-0 z-10 h-8 border-r border-gray-300 bg-hx-f9fafb px-3 text-left font-semibold text-gray-800">Total</td>
                  {totais.map((v, i) => (
                    <td key={comps[i]} className="h-8 border-r border-gray-100 bg-hx-f9fafb px-2 text-right font-semibold tabular-nums text-gray-800">{variacao ? <Variacao atual={realTotal(i)} antes={i ? realTotal(i - 1) : 0} /> : v ? fmt(v) : ''}</td>
                  ))}
                  <td {...passa('m:-1:-1:0')} className="h-8 cursor-help bg-hx-f9fafb px-2 text-right font-semibold tabular-nums text-gray-800">{fmt(tabela.media)}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-b-lg border border-t-0 border-gray-300 bg-hx-f9fafb px-3 py-2 text-[11.5px] text-gray-600">
            {variacao && <span className="inline-flex items-center gap-1.5"><b className="font-semibold text-gray-700">%</b>sobre o que caiu no mês anterior</span>}
            <span className="inline-flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full" style={{ background: ORIGEM.cartao[1] }} />cartão</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full" style={{ background: ORIGEM.manual[1] }} />avulso / boleto</span>
            <span className="inline-flex items-center gap-1.5"><span className="rounded-[3px] border border-dashed border-gray-300 px-1 text-[10.5px] italic text-gray-400">94,80</span>previsto (some quando o gasto entra)</span>
            <span className="inline-flex items-center gap-1.5"><span className="grade-hachura rounded-[3px] px-1 text-[10.5px] text-gray-500">412,30</span>parcela que já está numa fatura</span>
            <span className="inline-flex items-center gap-1.5"><span className="text-[10.5px] italic text-gray-400">+59,90</span>o que ainda falta no mês</span>
            <span className="ml-auto text-gray-400">{nCats === 1 ? '1 categoria' : `${nCats} categorias`} · fixos lançados à mão ficam só na grade de cima</span>
          </div>
        </>
      )}
      {conteudo && !aberta && <BalaoGrafico pos={balao.pos} largura={LARG} {...conteudo} />}
      {aberta && (
        <ModalCategoriaFixa item={aberta.item} cor={aberta.cor} grupo={aberta.grupo} hoje={hoje} onFechar={() => setAberta(null)}
          onSalvo={() => { setAberta(null); onRecarregar?.(); }} />
      )}
    </div>
  );
}
