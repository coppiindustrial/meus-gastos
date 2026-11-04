import { useMemo, useRef, useState } from 'react';
import Modal from '../Modal.jsx';
import Tooltip from '../Tooltip.jsx';
import AbasPilula from '../AbasPilula.jsx';
import { BuscaFaixa } from '../filtros/Segmentos.jsx';
import BalaoGrafico, { useBalao } from './BalaoGrafico.jsx';
import { COR_GASTOS } from './Graficos.jsx';
import { IconExpandirTudo, IconMaximize, IconMinimize } from '../icons.jsx';
import { formatBRL } from '../../lib/dinheiro.js';
import { competenciaCurta, nomeCompetencia } from '../../lib/format.js';
import useLinhasAnimadas, { atributosLinha } from '../../lib/useLinhasAnimadas.js';
import MarcaDesde, { IconRelogio, LEGENDA_DESDE } from './MarcaDesde.jsx';

// GRUPO × MÊS (a tabela da Visão geral; 02/11/2026, opção A do mockup "cor do saldo e Grupo × mês interativo"): o
// "Gastos por tipo" da planilha aberto por mês. Cada grupo abre nas categorias (a animação do DRE). A cor de fundo
// é a intensidade NA LINHA (o mês mais caro do grupo é o tom mais forte, do azul dos gastos).
// O HOVER É A CRUZ: a célula sob o cursor ganha contorno e a LINHA e a COLUNA dela acendem; o balão do app lê a
// célula (o valor, a parte do mês, contra a média, os lançamentos) — e também os TOTAIS: o da coluna Total conta o
// grupo no período, o da linha Total os maiores grupos do mês. Clicar num mês abre os Lançamentos dele.
// No canto, o grupo de ícones do DRE: ⇕ expandir / recolher tudo, ⬇ CSV e ⤢ o AMPLIADO (o painel grande do app,
// com busca e "Valores | % do mês").

const MESES_CURTOS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const reais = (c) => Math.round(c / 100).toLocaleString('pt-BR');
const pctDe = (v, de) => (de ? Math.round((v / de) * 100) : 0);
const semAcento = (s) => String(s ?? '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
const BTN = 'flex h-7 w-[30px] items-center justify-center text-gray-600 transition-colors hover:bg-gray-50 active:bg-gray-200';
const IcoBaixar = () => (
  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 4v10M7.5 9.5 12 14l4.5-4.5" /><path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
  </svg>
);
const IcoAmpliar = () => (
  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
    <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
  </svg>
);
const IconChevron = ({ aberto }) => (
  <svg viewBox="0 0 24 24" className={`h-3 w-3 shrink-0 text-gray-400 transition-transform duration-150 ${aberto ? 'rotate-90' : ''}`} fill="none"
    stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M9 6l6 6-6 6" />
  </svg>
);

// O que o balão diz de uma célula. `alvo`: { tipo: 'mes' | 'total' | 'totalMes' | 'totalGeral', item?, comp? }.
function leitura(alvo, { grupos, porMes, total, periodo, comps }) {
  const { tipo, item, comp } = alvo;
  if (tipo === 'mes') {
    const v = item.meses[comp] ?? 0;
    const titulo = `${item.nome} · ${nomeCompetencia(comp).toLowerCase()}`;
    if (!v) return { titulo, itens: [{ rotulo: 'Nada neste mês', valor: '—' }] };
    const dif = v - (item.media ?? 0);
    return {
      titulo,
      itens: [
        { rotulo: 'No mês', valor: formatBRL(v), cor: item.cor },
        { rotulo: 'Do total do mês', valor: `${pctDe(v, porMes[comp])}%` },
        ...(item.media ? [{ rotulo: 'Contra a média', valor: `${dif >= 0 ? '+' : '−'} ${formatBRL(Math.abs(dif))} (${dif >= 0 ? '+' : '−'}${Math.abs(pctDe(dif, item.media))}%)` }] : []),
        ...(item.qtdMeses?.[comp] ? [{ rotulo: 'Lançamentos', valor: String(item.qtdMeses[comp]) }] : []),
      ],
      nota: `Clique para ver os lançamentos de ${nomeCompetencia(comp).toLowerCase()}${item.categorias ? ' · › abre as categorias' : ''}`,
    };
  }
  if (tipo === 'total') {
    const maisCaro = comps.reduce((m, c) => ((item.meses[c] ?? 0) > (item.meses[m] ?? 0) ? c : m), comps[0]);
    return {
      titulo: `${item.nome} · ${periodo}`,
      itens: [
        { rotulo: 'No período', valor: `${formatBRL(item.total)} · ${pctDe(item.total, total)}% dos gastos`, cor: item.cor },
        // `desde`: o mês ('AAAA-MM') de um fixo que começou depois, ou 'parcial' no GRUPO que tem um deles (a média dele é
        // a soma das categorias) — 'parcial' não é mês: formatá-lo como um derrubava a tela (02/11/2026).
        { rotulo: 'Média por mês', valor: `${formatBRL(item.media)}${item.desde === 'parcial' ? ' · soma das categorias' : item.desde ? ` · desde ${competenciaCurta(item.desde)}` : ''}` },
        ...(item.meses[maisCaro] ? [{ rotulo: 'O mês mais caro', valor: `${competenciaCurta(maisCaro)} · ${formatBRL(item.meses[maisCaro])}` }] : []),
        { rotulo: 'Lançamentos', valor: String(item.qtd) },
      ],
      nota: item.categorias ? '› abre as categorias' : undefined,
    };
  }
  // a linha "Total de gastos": os maiores grupos do mês (ou do período)
  const doMes = tipo === 'totalMes';
  const valor = (g) => (doMes ? g.meses[comp] ?? 0 : g.total);
  const base = doMes ? porMes[comp] ?? 0 : total;
  const top = [...grupos].filter((g) => valor(g) > 0).sort((a, b) => valor(b) - valor(a));
  const maisCaroMes = comps.reduce((m, c) => ((porMes[c] ?? 0) > (porMes[m] ?? 0) ? c : m), comps[0]);
  return {
    titulo: `Total de gastos · ${doMes ? nomeCompetencia(comp).toLowerCase() : periodo}`,
    itens: [
      ...top.slice(0, 3).map((g) => ({ rotulo: g.nome, valor: `${formatBRL(valor(g))} · ${pctDe(valor(g), base)}%`, cor: g.cor })),
      ...(top.length > 3 ? [{ rotulo: `+ ${top.length - 3} grupos`, valor: formatBRL(top.slice(3).reduce((s, g) => s + valor(g), 0)) }] : []),
    ],
    nota: doMes
      ? `${formatBRL(base)}${comp === maisCaroMes && base ? ' · o mês mais caro do período' : ''} · clique para ver os lançamentos`
      : `${formatBRL(base)} · média ${formatBRL(grupos.reduce((s, g) => s + g.media, 0))}/mês`,
  };
}

// A TABELA (do bloco e do ampliado). `pct`: cada célula como parte do mês. `filtro`: o termo da busca (o grupo que
// casa vem inteiro; a categoria que casa abre o grupo dela). `abertos`/`setAbertos` vêm de fora (o botão ⇕ é de quem
// a contém).
export function TabelaGrupoMes({ grupos, comps, total, porMes, periodo, onMes, abertos, setAbertos, pct = false, filtro = '' }) {
  const caixaRef = useRef(null);
  const balao = useBalao(270, 150);
  const t = semAcento(filtro.trim());
  const vistos = useMemo(() => (t ? grupos.map((g) => {
    const casa = semAcento(g.nome).includes(t);
    const cats = casa ? g.categorias : g.categorias.filter((c) => semAcento(c.nome).includes(t));
    return casa || cats.length ? { ...g, categorias: cats, abreSozinho: !casa } : null;
  }).filter(Boolean) : grupos), [grupos, t]);
  const todas = useMemo(() => vistos.flatMap((g) => [
    { id: `g:${g.id}`, tipo: 'grupo', g },
    ...g.categorias.map((c) => ({ id: `c:${g.id}:${c.id}`, tipo: 'cat', g, c })),
  ]), [vistos]);
  const aberto = (g) => abertos.has(g.id) || !!g.abreSozinho;
  const visiveis = useMemo(() => todas.filter((x) => x.tipo === 'grupo' || aberto(x.g)), [todas, abertos]); // eslint-disable-line react-hooks/exhaustive-deps
  const desenhadas = useLinhasAnimadas(todas, visiveis, caixaRef);
  const alternar = (id) => setAbertos((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const ativo = balao.ativo;
  const ctx = { grupos, porMes, total, periodo, comps };
  const sob = (linha, col) => ({ onMouseMove: balao.aoMover({ linha, col }) });
  const naLinha = (linha) => ativo?.linha === linha;
  const naColuna = (col) => ativo?.col === col;
  const fundo = (v, max) => (v ? { backgroundColor: `color-mix(in srgb, ${COR_GASTOS} ${Math.round(4 + 24 * (v / max) ** 2)}%, transparent)` } : undefined);
  const classeCelula = (linha, col) => `${naLinha(linha) || naColuna(col) ? 'gm-acesa' : ''} ${naLinha(linha) && naColuna(col) ? 'shadow-[inset_0_0_0_1.5px_var(--contorno-celula)]' : ''}`;
  const numero = (v, base) => (pct ? `${pctDe(v, base)}%` : reais(v));

  const celulas = (x, item, forte) => {
    const max = Math.max(1, ...comps.map((c) => item.meses[c] ?? 0));
    return comps.map((c) => {
      const v = item.meses[c] ?? 0;
      return (
        <td key={c} {...sob(x.id, c)} onClick={() => v && onMes?.(c)}
          className={`border-b border-r border-gray-100 px-2 text-right tabular-nums transition-[box-shadow] duration-100 ${v ? 'cursor-pointer' : ''} ${forte ? 'text-gray-800' : 'text-gray-600'} ${classeCelula(x.id, c)}`}
          style={fundo(v, max)}>
          {v ? numero(v, porMes[c]) : <span className="text-gray-300">—</span>}
        </td>
      );
    });
  };
  const th0 = 'sticky top-0 z-20 border-b border-r border-gray-100 bg-hx-f9fafb py-2 text-[10.5px] font-semibold uppercase tracking-wide';
  const th = `${th0} px-2 text-right`;
  const balaoInfo = ativo && (() => {
    const linhaObj = todas.find((x) => x.id === ativo.linha);
    if (ativo.linha === 'total') return leitura({ tipo: comps.includes(ativo.col) ? 'totalMes' : 'totalGeral', comp: ativo.col }, ctx);
    if (!linhaObj) return null;
    const item = linhaObj.tipo === 'grupo' ? linhaObj.g : { ...linhaObj.c, cor: linhaObj.g.cor };
    // o nome, o Total e a Média contam o item no período; só as colunas dos MESES leem um mês
    if (!comps.includes(ativo.col)) return leitura({ tipo: 'total', item }, ctx);
    return leitura({ tipo: 'mes', item, comp: ativo.col }, ctx);
  })();

  return (
    <div ref={caixaRef} onMouseLeave={balao.aoSair}>
      <table className="w-full border-separate border-spacing-0 text-[12.5px]" style={{ minWidth: 300 + comps.length * 74 }}>
        <thead>
          <tr>
            {/* LARGURA FIXA (04/11/2026): cabe o grupo (até 200px) e a categoria (recuo de 38 + até 180) — com a largura
                pelo conteúdo, abrir um grupo alargava a coluna e TODAS as outras andavam 24px de uma vez */}
            <th className={`${th0} left-0 z-30 border-r-gray-200 px-3 text-left text-gray-500`} style={{ width: 236, minWidth: 236 }}>Grupo</th>
            {comps.map((c) => (
              <th key={c} className={`${th} ${naColuna(c) ? 'text-gray-900' : 'text-gray-500'}`}>
                {comps.length > 12 ? competenciaCurta(c) : MESES_CURTOS[Number(c.slice(5)) - 1]}
              </th>
            ))}
            <th className={`${th} ${naColuna('total') ? 'text-gray-900' : 'text-gray-500'}`}>Total</th>
            <th className={`${th} border-r-0 px-3 ${naColuna('media') ? 'text-gray-900' : 'text-gray-500'}`}>{pct ? '% total' : <>Média<span className="inline-block w-4" aria-hidden="true" /></>}</th>
          </tr>
        </thead>
        <tbody>
          {desenhadas.map(({ linha: x, estado }) => {
            const attrs = atributosLinha(x.id, estado);
            const item = x.tipo === 'grupo' ? x.g : x.c;
            const grupo = x.tipo === 'grupo';
            return (
              <tr key={x.id} {...attrs} className="bg-white">
                <td {...sob(x.id, 'nome')} className={`sticky left-0 z-10 h-8 border-b border-r border-gray-200 bg-white ${grupo ? 'px-3' : 'py-0 pl-[38px] pr-3'} ${naLinha(x.id) ? 'gm-acesa' : ''}`}>
                  {grupo ? (
                    <button type="button" onClick={() => alternar(x.g.id)} aria-expanded={aberto(x.g)} className="flex max-w-[200px] items-center gap-2 text-left">
                      <IconChevron aberto={aberto(x.g)} />
                      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: x.g.cor }} />
                      <span className="truncate font-semibold text-gray-800">{x.g.nome}</span>
                    </button>
                  ) : <span className="block max-w-[180px] truncate text-gray-600">{x.c.nome}</span>}
                </td>
                {celulas(x, item, grupo)}
                <td {...sob(x.id, 'total')}
                  className={`border-b border-r border-gray-100 bg-hx-f9fafb px-2 text-right tabular-nums ${grupo ? 'font-semibold text-gray-900' : 'text-gray-700'} ${classeCelula(x.id, 'total')}`}>
                  {pct ? `${pctDe(item.total, total)}%` : reais(item.total)}
                </td>
                <td {...sob(x.id, 'media')} className={`border-b border-gray-100 px-3 text-right tabular-nums ${grupo ? 'text-gray-600' : 'text-gray-500'} ${classeCelula(x.id, 'media')}`}>
                  {pct ? `${pctDe(item.total, total)}%` : (
                    <>{reais(item.media)}<MarcaDesde desde={item.desde} meses={item.mesesMedia} /></>
                  )}
                </td>
              </tr>
            );
          })}
          <tr data-segue="" className="bg-hx-f9fafb font-semibold">
            <td className={`sticky left-0 z-10 h-8 border-r border-gray-200 bg-hx-f9fafb px-3 text-gray-800 ${naLinha('total') ? 'gm-acesa' : ''}`}>Total de gastos</td>
            {comps.map((c) => (
              <td key={c} {...sob('total', c)} onClick={() => porMes[c] && onMes?.(c)}
                className={`border-r border-gray-100 px-2 text-right tabular-nums text-gray-900 ${porMes[c] ? 'cursor-pointer' : ''} ${classeCelula('total', c)}`}>
                {porMes[c] ? (pct ? '100%' : reais(porMes[c])) : '—'}
              </td>
            ))}
            <td {...sob('total', 'total')} className={`border-r border-gray-100 px-2 text-right tabular-nums text-gray-900 ${classeCelula('total', 'total')}`}>{pct ? '100%' : reais(total)}</td>
            <td />
          </tr>
        </tbody>
      </table>
      {balaoInfo && <BalaoGrafico pos={balao.pos} largura={270} titulo={balaoInfo.titulo} itens={balaoInfo.itens} nota={balaoInfo.nota} />}
    </div>
  );
}

// O botão ⇕ de expandir / recolher tudo (no bloco e no ampliado).
function BotaoTudo({ grupos, abertos, setAbertos, classe = BTN }) {
  const tudo = grupos.length > 0 && grupos.every((g) => abertos.has(g.id));
  return (
    <Tooltip label={tudo ? 'Recolher tudo' : 'Expandir tudo'}>
      <button type="button" aria-label={tudo ? 'Recolher tudo' : 'Expandir tudo'} onClick={() => setAbertos(tudo ? new Set() : new Set(grupos.map((g) => g.id)))} className={classe}>
        <IconExpandirTudo fechar={tudo} />
      </button>
    </Tooltip>
  );
}

// O PAINEL AMPLIADO (o do Entradas × gastos e do Gastos por grupo: 1280px/90vh, tela cheia, CSV), com a busca e
// "Valores | % do mês".
function AmpliadoGrupoMes({ onClose, onExportar, ...props }) {
  const [cheio, setCheio] = useState(false);
  const [abertos, setAbertos] = useState(new Set());
  const [modo, setModo] = useState('valores');
  const [busca, setBusca] = useState('');
  const acoes = (
    <>
      <button type="button" className="btn-secondary !h-[30px] !px-3 !text-[12.5px]" onClick={onExportar}>Exportar CSV</button>
      <Tooltip label={cheio ? 'Sair da tela cheia' : 'Tela cheia'}>
        <button type="button" onClick={() => setCheio((c) => !c)} aria-label={cheio ? 'Sair da tela cheia' : 'Tela cheia'}
          className="inline-flex h-[30px] w-[30px] items-center justify-center rounded-md text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-800">
          {cheio ? <IconMinimize className="h-3.5 w-3.5" /> : <IconMaximize className="h-3.5 w-3.5" />}
        </button>
      </Tooltip>
    </>
  );
  return (
    <Modal open onClose={onClose} title="Grupo × mês" subtitulo={`${formatBRL(props.total)} · ${props.periodo} · ${props.grupos.length} ${props.grupos.length === 1 ? 'grupo' : 'grupos'}`}
      acoes={acoes} alturaCheia animarTamanho padding="p-0" maxWidth={cheio ? 'max-w-[96vw]' : 'max-w-[min(1280px,95vw)]'} altura={cheio ? 'h-[94vh]' : 'h-[90vh]'}>
      <div className="flex h-full flex-col">
        <div className="flex shrink-0 flex-wrap items-center gap-2.5 px-5 pb-3 pt-4">
          <AbasPilula abas={[{ key: 'valores', label: 'Valores' }, { key: 'pct', label: '% do mês' }]} valor={modo} onChange={setModo} variante="claro" altura={30} folga={2} />
          <BuscaFaixa className="w-[240px]" placeholder="Buscar grupo ou categoria" value={busca} onChange={(e) => setBusca(e.target.value)} />
          <span className="inline-flex overflow-hidden rounded-md border border-gray-300 bg-white">
            <BotaoTudo grupos={props.grupos} abertos={abertos} setAbertos={setAbertos} classe={`${BTN} !h-[30px]`} />
          </span>
          <span className="ml-auto hidden items-center gap-1 text-[11.5px] text-gray-400 md:inline-flex">{modo === 'pct' ? 'cada célula = a parte do mês' : <>em reais · o tom mais forte é o mês mais caro de cada linha · <IconRelogio /> {LEGENDA_DESDE}</>}</span>
        </div>
        <div className="min-h-0 flex-1 overflow-auto border-t border-gray-100 [scrollbar-gutter:stable]">
          <TabelaGrupoMes {...props} abertos={abertos} setAbertos={setAbertos} pct={modo === 'pct'} filtro={busca} />
        </div>
      </div>
    </Modal>
  );
}

// O BLOCO da Visão geral: o título, os ícones do canto e a tabela que rola por dentro.
export default function BlocoGrupoMes({ onExportar, ...props }) {
  const [abertos, setAbertos] = useState(new Set());
  const [ampliado, setAmpliado] = useState(false);
  return (
    <section className="card flex flex-col overflow-hidden !p-0">
      <div className="flex shrink-0 items-center gap-2 px-4 pb-2.5 pt-3">
        <h2 className="m-0 text-[10.5px] font-bold uppercase tracking-[0.06em] text-gray-500">
          Grupo × mês <span className="font-medium normal-case tracking-normal text-gray-400">· em reais · o tom mais forte é o mês mais caro de cada linha · <IconRelogio className="inline h-[10px] w-[10px] align-[-1px]" /> {LEGENDA_DESDE}</span>
        </h2>
        <span className="flex-1" />
        {/* O GRUPO DO DRE: os ícones numa caixa só, o nome no tooltip. */}
        <span className="inline-flex shrink-0 overflow-hidden rounded-md border border-gray-300 bg-white [&>*+*]:border-l [&>*+*]:border-gray-200">
          <BotaoTudo grupos={props.grupos} abertos={abertos} setAbertos={setAbertos} />
          <Tooltip label="Exportar CSV">
            <button type="button" aria-label="Exportar CSV" onClick={onExportar} className={BTN}><IcoBaixar /></button>
          </Tooltip>
          <Tooltip label="Ampliar">
            <button type="button" aria-label="Ampliar" onClick={() => setAmpliado(true)} className={BTN}><IcoAmpliar /></button>
          </Tooltip>
        </span>
      </div>
      {/* `scrollbar-gutter: stable`: abrir um grupo que passa da altura do bloco não cria a barra e encolhe a tabela */}
      <div className="min-h-0 flex-1 overflow-auto [scrollbar-gutter:stable]">
        <TabelaGrupoMes {...props} abertos={abertos} setAbertos={setAbertos} />
      </div>
      {ampliado && <AmpliadoGrupoMes {...props} onExportar={onExportar} onClose={() => setAmpliado(false)} />}
    </section>
  );
}

