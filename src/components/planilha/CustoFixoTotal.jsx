import { useState } from 'react';
import BalaoGrafico, { useBalao } from '../graficos/BalaoGrafico.jsx';
import Tooltip from '../Tooltip.jsx';
import { IconExpandirTudo } from '../icons.jsx';
import { formatBRL, valorParaCampo } from '../../lib/dinheiro.js';
import { competenciaCurta, nomeCompetencia } from '../../lib/format.js';
import { lsGet, lsSet } from '../../lib/storage.js';

// O CUSTO FIXO TOTAL (18/11/2026, a opção B do mockup "Média do custo fixo"): a faixa embaixo das duas tabelas dos Gastos
// fixos — os fixos lançados à mão + as categorias fixas, mês a mês, e a MÉDIA do custo fixo (a soma das médias).
// As mesmas larguras da `MatrizFixos` (os meses um embaixo do outro). Cada célula: o que já se sabe (o lançado; nas
// categorias, o que caiu e as parcelas que já estão numa fatura) e, de hoje em diante, o que ainda falta ("+N" embaixo; só
// o que falta = tracejado). Na Variação %, o % do que já se sabe sobre o mês anterior, até o mês de hoje.
// POR GRUPO (23/11/2026, a opção B do mockup "Custo fixo por grupo", a pedido: "aparecer o somatório das categorias, se não
// fica difícil de analisar"): uma linha por GRUPO da categoria (Casa, Carro…), com a barra da cor e quanto ele pesa na média
// do custo fixo; a seta abre as duas partes dele, "Fixos à mão" e "Categorias fixas" (só as que ele tem). ⇕ abre ou
// recolhe todos; os abertos ficam lembrados no navegador (`custo_fixo_abertos`, só os ids dos grupos).
// `custo`: o de `custoFixoDoAno`. `hoje`: 'AAAA-MM'. `modo`: 'valor' | 'variacao'.

const LARG = 280;
const LS_ABERTOS = 'custo_fixo_abertos';
const curto = (v) => Math.round(v / 100).toLocaleString('pt-BR');
const fmt = (v) => valorParaCampo(v).replace(/\B(?=(\d{3})+,)/g, '.');
const pct = (atual, antes) => (antes ? Math.round(((atual - antes) / antes) * 100) : null);
const lerAbertos = () => { try { return new Set(JSON.parse(lsGet(LS_ABERTOS) ?? '[]')); } catch { return new Set(); } };

export default function CustoFixoTotal({ custo, hoje, modo = 'valor' }) {
  const balao = useBalao(LARG, 160);
  const [abertos, setAbertosEstado] = useState(lerAbertos);
  const setAbertos = (s) => { setAbertosEstado(s); lsSet(LS_ABERTOS, JSON.stringify([...s])); };
  const { comps, linhas, grupos = [] } = custo;
  const colHoje = comps.indexOf(hoje);
  const variacao = modo === 'variacao';
  const passa = (chave) => ({ onMouseMove: balao.aoMover(chave), onMouseLeave: balao.aoSair });
  const [mao, cats, total] = linhas;
  const todosAbertos = grupos.length > 0 && grupos.every((g) => abertos.has(g.id));
  const alternar = (id) => { const s = new Set(abertos); if (s.has(id)) s.delete(id); else s.add(id); setAbertos(s); };

  // o que cada célula soma, por parte: o grupo (`gi`) ou o total (-1)
  const partesDe = (gi) => (gi < 0 ? { mao, cats, total } : { mao: grupos[gi].mao, cats: grupos[gi].cats, total: grupos[gi].total });

  const balaoDe = (chave) => {
    const [tipo, a, b] = chave.split(':');
    const gi = Number(a);
    const p = partesDe(gi);
    const nome = gi < 0 ? 'Custo fixo' : grupos[gi].nome;
    const cor = gi < 0 ? undefined : grupos[gi].cor;
    if (tipo === 'm') {
      return {
        titulo: `${nome} · média ${comps[0].slice(0, 4)}`,
        itens: [
          ...(p.mao ? [{ rotulo: 'Fixos à mão', valor: formatBRL(p.mao.media), cor: 'var(--origem-fixo)' }] : []),
          ...(p.cats ? [{ rotulo: 'Categorias fixas', valor: formatBRL(p.cats.media) }] : []),
          { rotulo: 'Por mês', valor: formatBRL(p.total.media), cor },
          ...(gi >= 0 && total.media ? [{ rotulo: 'Do custo fixo', valor: `${Math.round((p.total.media / total.media) * 100)}%` }] : []),
        ],
        nota: gi < 0
          ? 'Fixo à mão: a média dos meses lançados. Categoria que vem todo mês: a média dos meses fechados; a anual (IPTU, IPVA…): o ano ÷ 12. O total é a soma das médias.'
          : 'A soma das médias dos fixos e das categorias do grupo.',
      };
    }
    const k = Number(b);
    const valor = (parte) => formatBRL(parte.celulas[k].conhecido + parte.celulas[k].falta);
    const falta = p.total.celulas[k].falta;
    return {
      titulo: `${nome} · ${nomeCompetencia(comps[k])}`,
      itens: [
        ...(p.mao ? [{ rotulo: 'Fixos à mão', valor: valor(p.mao), cor: 'var(--origem-fixo)' }] : []),
        ...(p.cats ? [{ rotulo: 'Categorias fixas', valor: valor(p.cats) }] : []),
        { rotulo: 'Total', valor: valor(p.total), cor },
      ],
      nota: falta ? `${formatBRL(falta)} ainda é previsto (o sugerido dos fixos e o previsto das categorias).` : undefined,
    };
  };
  const conteudo = balao.ativo ? balaoDe(balao.ativo) : null;

  const celula = (parte, i) => {
    const { conhecido, falta } = parte.celulas[i];
    if (variacao) {
      if (i > colHoje && colHoje >= 0) return null;
      if (!conhecido) return null;
      const v = i ? pct(conhecido, parte.celulas[i - 1].conhecido) : null;
      if (v === null) return <span className="text-gray-300">—</span>;
      return <span className={v > 0 ? 'text-hx-b91c1c' : v < 0 ? 'text-hx-15803d' : 'text-gray-400'}>{v > 0 ? '+' : ''}{v}%</span>;
    }
    if (!conhecido && !falta) return <span className="text-gray-300">—</span>;
    if (!conhecido) return <span className="inline-block rounded-[4px] border border-dashed border-gray-300 px-[5px] italic leading-[16px] text-gray-400">{curto(falta)}</span>;
    return (
      <span className="flex flex-col items-end leading-[1.15]">
        <span>{curto(conhecido)}</span>
        {falta > 0 && <span className="text-[10.5px] font-normal italic text-gray-400">+{curto(falta)}</span>}
      </span>
    );
  };

  const th = 'h-[30px] border-b border-r border-gray-300 bg-hx-f9fafb px-2 text-right text-[11px] font-semibold uppercase tracking-wide text-gray-500';
  // uma linha da faixa: `tipo` 'grupo' | 'parte' | 'total'
  const linha = ({ chave, gi, parte, tipo, nome }) => {
    const ehTotal = tipo === 'total';
    const ehParte = tipo === 'parte';
    const fundo = ehTotal ? 'bg-hx-f9fafb' : 'bg-white';
    const texto = ehTotal ? 'text-gray-900' : ehParte ? 'text-gray-500' : 'text-gray-800';
    return (
      <tr key={chave} className={ehTotal ? 'font-semibold' : ehParte ? 'text-[12px]' : 'font-medium'}>
        <td className={`sticky left-0 z-10 border-r border-gray-300 text-left ${ehParte ? 'h-[28px] pl-[34px] pr-3' : 'h-[34px] px-3'} ${ehTotal ? '' : 'border-b border-b-gray-100'} ${texto} ${fundo}`}
          style={ehTotal ? { boxShadow: 'inset 3px 0 0 var(--origem-fixo)' } : tipo === 'grupo' ? { boxShadow: `inset 3px 0 0 ${grupos[gi].cor}` } : undefined}>
          {nome}
        </td>
        {comps.map((c, i) => (
          <td key={c} {...passa(`c:${gi}:${i}`)}
            className={`cursor-help border-r border-gray-100 px-2 text-right tabular-nums ${ehParte ? 'h-[28px]' : 'h-[34px]'} ${ehTotal ? '' : 'border-b'} ${texto} ${fundo}`}>
            {celula(parte, i)}
          </td>
        ))}
        <td {...passa(`m:${gi}`)}
          className={`cursor-help bg-hx-f9fafb px-2 text-right tabular-nums ${ehParte ? 'h-[28px]' : 'h-[34px]'} ${ehTotal ? 'font-bold' : `border-b border-gray-100 ${texto}`}`}
          style={ehTotal ? { color: 'var(--origem-fixo)' } : undefined}>
          {parte.media ? fmt(parte.media) : '—'}
        </td>
      </tr>
    );
  };

  // o nome do grupo: a seta, o nome e quanto ele pesa na média (a barrinha na cor e o %)
  const nomeDoGrupo = (g) => {
    const parte = total.media ? g.total.media / total.media : 0;
    const aberto = abertos.has(g.id);
    return (
      <button type="button" onClick={() => alternar(g.id)} aria-expanded={aberto}
        className="flex w-full min-w-0 items-center gap-1.5 text-left">
        <svg viewBox="0 0 12 12" className={`h-[12px] w-[12px] shrink-0 text-gray-400 transition-transform duration-200 ${aberto ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4.5 2.5L8 6l-3.5 3.5" /></svg>
        <span className="truncate">{g.nome}</span>
        <span className="ml-auto flex shrink-0 items-center gap-1.5 pl-2" title={`${Math.round(parte * 100)}% da média do custo fixo`}>
          <span className="h-[6px] rounded-full" style={{ width: Math.max(2, Math.round(parte * 36)), background: g.cor }} />
          <span className="w-[28px] text-right text-[11px] font-normal tabular-nums text-gray-500">{Math.round(parte * 100)}%</span>
        </span>
      </button>
    );
  };

  return (
    <div className="mt-5">
      <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1">
        <b className="text-[13px] font-semibold text-gray-900">Custo fixo total</b>
        <span className="text-[12px] text-gray-500">os fixos lançados à mão + as categorias fixas, por grupo, mês a mês, e a média do custo fixo</span>
        <span className="flex-1" />
        {grupos.length > 0 && (
          <Tooltip label={todosAbertos ? 'Recolher todos' : 'Abrir todos (à mão e categorias)'}>
            <button type="button" aria-label={todosAbertos ? 'Recolher todos' : 'Abrir todos'}
              onClick={() => setAbertos(todosAbertos ? new Set() : new Set(grupos.map((g) => g.id)))}
              className="flex h-8 w-8 items-center justify-center rounded-md border border-gray-300 bg-white text-gray-600 transition-colors hover:bg-gray-50 active:bg-gray-200">
              <IconExpandirTudo fechar={todosAbertos} />
            </button>
          </Tooltip>
        )}
      </div>
      <div className="overflow-auto rounded-lg border border-gray-300 bg-white" style={{ scrollPaddingLeft: 210 }}>
        <table className="w-full min-w-[1080px] table-fixed border-separate border-spacing-0 text-[12.5px]">
          <colgroup><col style={{ width: 210 }} />{comps.map((c) => <col key={c} />)}<col style={{ width: 84 }} /></colgroup>
          <thead>
            <tr>
              <th className={`${th} sticky left-0 z-20 text-left`}>Custo fixo</th>
              {comps.map((c, i) => (
                <th key={c} className={`${th} ${i === colHoje ? '!bg-hx-eef2f7 text-gray-800' : ''}`}
                  style={i === colHoje ? { boxShadow: 'inset 0 -2px 0 var(--grade-sel)' } : undefined}>
                  {competenciaCurta(c).slice(0, 3)}
                </th>
              ))}
              <th {...passa('m:-1')} className={`${th} !border-r-0 cursor-help`}>Média</th>
            </tr>
          </thead>
          <tbody>
            {grupos.length > 0
              ? grupos.flatMap((g, gi) => [
                linha({ chave: g.id, gi, parte: g.total, tipo: 'grupo', nome: nomeDoGrupo(g) }),
                ...(abertos.has(g.id) ? [
                  g.mao && linha({ chave: `${g.id}-mao`, gi, parte: g.mao, tipo: 'parte', nome: 'Fixos à mão' }),
                  g.cats && linha({ chave: `${g.id}-cats`, gi, parte: g.cats, tipo: 'parte', nome: 'Categorias fixas' }),
                ].filter(Boolean) : []),
              ])
              : [mao, cats].map((l) => linha({ chave: l.chave, gi: -1, parte: l, tipo: 'parte', nome: l.nome }))}
            {linha({ chave: 'total', gi: -1, parte: total, tipo: 'total', nome: total.nome })}
          </tbody>
        </table>
      </div>
      {conteudo && <BalaoGrafico pos={balao.pos} largura={LARG} {...conteudo} />}
    </div>
  );
}
