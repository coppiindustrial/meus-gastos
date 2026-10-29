import { useMemo, useState } from 'react';
import Modal from '../Modal.jsx';
import Tooltip from '../Tooltip.jsx';
import AbasPilula from '../AbasPilula.jsx';
import { BuscaFaixa } from '../filtros/Segmentos.jsx';
import BalaoGrafico, { useBalao } from './BalaoGrafico.jsx';
import Variacao from './Variacao.jsx';
import { MiniCurva, VoltarGrupos } from './GraficosVisao.jsx';
import { IconMaximize, IconMinimize } from '../icons.jsx';
import { variacao } from '../../lib/visaoGeral.js';
import { formatBRL } from '../../lib/dinheiro.js';
import { exportCsv } from '../../lib/exportCsv.js';

// O "GASTOS POR GRUPO" AMPLIADO (29/10/2026, opção A do mockup): a mesma lista do bloco no PAINEL do Gestor (o do
// Entradas × gastos — 1280px e 90% da altura, tela cheia 96vw × 94vh, CSV). Antes era um modal de 1024px com a
// lista presa a 70% da altura (~14 linhas) e o nome cortado em 176px. Aqui o nome tem até 320px, a linha 30px
// (~20 por tela), um cabeçalho quieto com as colunas (média/mês a mais), a busca e o TOTAL preso embaixo. Em
// "Categorias", o grupo aparece em cinza depois do nome (é ele que encolhe primeiro); o balão diz o nome inteiro.
//
// `grupos`: o `gruposPorMes`. `comps`: os meses com dado (a curva). `anterior`: Map "g:<id>" / "c:<grupo>:<cat>" →
// total um ano antes (sem ele, sem a coluna da variação). `total`: os gastos do período (a base do %).

const BTN_ICONE = 'inline-flex h-[28px] w-[28px] items-center justify-center rounded-[4px] text-gray-400 transition hover:bg-gray-100 hover:text-gray-600';
const ABAS = [{ key: 'grupos', label: 'Grupos' }, { key: 'categorias', label: 'Categorias' }];
const semAcento = (s) => String(s || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
const pct = (f) => `${f * 100}%`;

export default function AmpliadoGrupos({ onClose, grupos, total, meses, comps = [], anterior = null }) {
  const balao = useBalao(250, 170);
  const [cheio, setCheio] = useState(false);
  const [modo, setModo] = useState('grupos');
  const [aberto, setAberto] = useState(null);
  const [busca, setBusca] = useState('');
  const grupo = grupos.find((g) => g.id === aberto);
  const categorias = useMemo(() => grupos
    .flatMap((g) => g.categorias.map((c) => ({ ...c, id: `${g.id}:${c.id}`, chave: `c:${g.id}:${c.id}`, cor: g.cor, grupo: g })))
    .sort((a, b) => b.total - a.total), [grupos]);

  let todos;
  if (grupo) todos = grupo.categorias.map((c) => ({ ...c, chave: `c:${grupo.id}:${c.id}`, cor: grupo.cor, grupo }));
  else if (modo === 'categorias') todos = categorias;
  else todos = grupos.map((g) => ({ ...g, chave: `g:${g.id}` }));
  // A busca acha pelo nome, pelo grupo e, na lista de grupos, pelas categorias de dentro.
  const termo = semAcento(busca.trim());
  const lista = termo
    ? todos.filter((it) => semAcento(it.nome).includes(termo) || semAcento(it.grupo?.nome).includes(termo)
      || it.categorias?.some((c) => semAcento(c.nome).includes(termo)))
    : todos;
  // A escala da barra é a da lista inteira: buscar não estica as barras que sobram.
  const max = Math.max(1, ...todos.map((it) => it.total));
  const antes = (it) => anterior?.get(it.chave) ?? 0;
  const soma = (f) => lista.reduce((s, it) => s + f(it), 0);
  const totLista = soma((it) => it.total);
  // O "um ano antes" do total: sem busca, o do grupo (ou o de todos), que conta também a categoria que só existiu
  // no ano anterior; com busca, a soma das linhas que sobraram.
  const antesTotal = termo ? soma(antes)
    : grupo ? antes({ chave: `g:${grupo.id}` }) : grupos.reduce((s, g) => s + antes({ chave: `g:${g.id}` }), 0);
  const varTotal = anterior ? variacao(totLista, antesTotal) : null;
  const pctDe = (v) => (total ? Math.round((v / total) * 100) : 0);
  const comTendencia = comps.length > 1;
  const comVariacao = !!anterior;
  const colunas = `minmax(0,320px) minmax(60px,1fr) 7.5rem 2.75rem 6.75rem${comTendencia ? ' 96px' : ''}${comVariacao ? ' 5.5rem' : ''}`;
  const deCategoria = !!grupo || modo === 'categorias';
  const nome = deCategoria ? ['categoria', 'categorias'] : ['grupo', 'grupos'];
  const nCats = grupos.reduce((s, g) => s + g.categorias.length, 0);

  const ativo = lista.find((it) => it.id === balao.ativo);
  let nota;
  if (ativo) {
    const v = antes(ativo) ? variacao(ativo.total, antes(ativo)) : null;
    const vs = v === null ? '' : ` · ${v > 0 ? '+' : ''}${v}% sobre o ano anterior`;
    const parte = `${pctDe(ativo.total)}% dos gastos · média ${formatBRL(ativo.media)}/mês${vs}`;
    nota = ativo.categorias ? `${parte}. Clique para abrir as categorias.` : `${parte} · ${ativo.qtd} lançamento(s).`;
  }

  const exportar = () => exportCsv(`gastos-por-${deCategoria ? 'categoria' : 'grupo'}-${comps[0] ?? ''}-${comps[comps.length - 1] ?? ''}`, lista, [
    ...(deCategoria ? [{ key: 'grupo', label: 'Grupo', map: (it) => it.grupo.nome }, { key: 'nome', label: 'Categoria' }] : [{ key: 'nome', label: 'Grupo' }]),
    { key: 'total', label: 'Total', tipo: 'dinheiro', map: (it) => it.total / 100 },
    { key: 'pct', label: '% dos gastos', map: (it) => pctDe(it.total) },
    { key: 'media', label: 'Média por mês', tipo: 'dinheiro', map: (it) => it.media / 100 },
    { key: 'qtd', label: 'Lançamentos' },
    ...(anterior ? [
      { key: 'anterior', label: 'Um ano antes', tipo: 'dinheiro', map: (it) => antes(it) / 100 },
      { key: 'variacao', label: 'Variação %', map: (it) => (antes(it) ? variacao(it.total, antes(it)) : '') },
    ] : []),
  ]);

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
  const subtitulo = `${formatBRL(total)} · ${meses} · ${nCats} ${nCats === 1 ? 'categoria' : 'categorias'} em ${grupos.length} ${grupos.length === 1 ? 'grupo' : 'grupos'}`;
  const TH = 'text-[10.5px] font-semibold uppercase tracking-[0.05em] text-gray-500';

  return (
    <Modal open onClose={onClose} title="Gastos por grupo" subtitulo={subtitulo} acoes={acoes} alturaCheia animarTamanho padding="p-0"
      maxWidth={cheio ? 'max-w-[96vw]' : 'max-w-[min(1280px,95vw)]'} altura={cheio ? 'h-[94vh]' : 'h-[90vh]'}>
      <div className="flex min-h-full flex-col">
        {/* A barra e o cabeçalho das colunas ficam presos em cima enquanto a lista rola. */}
        <div className="sticky top-0 z-10 bg-white">
          <div className="flex flex-wrap items-center gap-2.5 px-5 pb-3 pt-4">
            {grupo ? <div className="flex min-w-0"><VoltarGrupos grupo={grupo} onVoltar={() => { setAberto(null); setBusca(''); }} /></div> : (
              <AbasPilula abas={ABAS} valor={modo} onChange={(m) => { setModo(m); setAberto(null); }} variante="claro" altura={30} folga={2} />
            )}
            <BuscaFaixa className="w-[240px]" placeholder={grupo ? `Buscar em ${grupo.nome}` : 'Buscar categoria ou grupo'}
              value={busca} onChange={(e) => setBusca(e.target.value)} />
            <span className="ml-auto hidden text-[11.5px] text-gray-400 md:inline">
              {[comTendencia && `a curva = ${comps.length} meses`, comVariacao && 'vs. o mesmo período do ano anterior'].filter(Boolean).join(' · ')}
            </span>
          </div>
          <div style={{ gridTemplateColumns: colunas }} className={`grid h-[30px] items-center gap-3.5 border-b border-gray-100 px-5 ${TH}`}>
            <span>{deCategoria ? 'Categoria' : 'Grupo'}</span>
            <span>Proporção</span>
            <span className="text-right">Total</span>
            <span className="text-right">%</span>
            <span className="text-right">Média/mês</span>
            {comTendencia && <span>Tendência</span>}
            {comVariacao && <span className="whitespace-nowrap text-right">vs. ano ant.</span>}
          </div>
        </div>

        <div className="flex-1 px-3 py-1">
          {lista.length === 0 ? (
            <p className="py-10 text-center text-sm text-gray-400">{termo ? `Nada com “${busca.trim()}”.` : 'Nenhum gasto no período.'}</p>
          ) : (
            <ul onMouseLeave={balao.aoSair}>
              {lista.map((it) => {
                const v = antes(it) ? variacao(it.total, antes(it)) : null;
                return (
                  <li key={it.id}>
                    <button type="button" onMouseMove={balao.aoMover(it.id)}
                      onClick={() => { if (it.categorias) { setAberto(it.id); setBusca(''); } }}
                      style={{ gridTemplateColumns: colunas }}
                      className={`grid h-[30px] w-full items-center gap-3.5 rounded-[6px] px-2 text-left transition-[background-color,opacity] duration-150 ${
                        balao.ativo === it.id ? 'bg-gray-100' : 'hover:bg-gray-50'} ${balao.esmaecido(it.id) ? 'opacity-50' : ''} ${it.categorias ? 'cursor-pointer' : 'cursor-default'}`}>
                      <span className="flex min-w-0 items-center gap-2 text-[12.5px] text-gray-800">
                        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: it.cor }} />
                        <span className="truncate">{it.nome}</span>
                        {/* o grupo em cinza: encolhe antes do nome (flex-shrink bem maior) */}
                        {modo === 'categorias' && !grupo && <span className="min-w-0 shrink-[100] truncate text-[11.5px] text-gray-400">{it.grupo.nome}</span>}
                      </span>
                      <span className="h-2 overflow-hidden rounded-full bg-gray-100">
                        <span className="block h-full rounded-full transition-[width] duration-300 ease-out"
                          style={{ width: pct(it.total / max), background: `linear-gradient(90deg, color-mix(in srgb, ${it.cor} 50%, transparent), ${it.cor})` }} />
                      </span>
                      <span className="whitespace-nowrap text-right text-[12.5px] font-medium tabular-nums text-gray-900">{formatBRL(it.total)}</span>
                      <span className="text-right text-[11.5px] tabular-nums text-gray-500">{pctDe(it.total)}%</span>
                      <span className="whitespace-nowrap text-right text-[11.5px] tabular-nums text-gray-500">{formatBRL(it.media)}</span>
                      {comTendencia && <MiniCurva valores={comps.map((c) => it.meses?.[c] ?? 0)} cor={it.cor} largura={96} altura={20} />}
                      {comVariacao && <span className="flex justify-end"><Variacao v={v} sobeBom={false} titulo="Contra o mesmo período do ano anterior" /></span>}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {lista.length > 0 && (
          <div style={{ gridTemplateColumns: colunas }}
            className="sticky bottom-0 grid h-[40px] items-center gap-3.5 border-t border-gray-200 bg-hx-f9fafb px-5 text-[12.5px]">
            <span className="flex min-w-0 items-baseline gap-2">
              <span className="font-semibold text-gray-800">Total</span>
              <span className="truncate text-[11.5px] text-gray-400">
                {termo ? `${lista.length} de ${todos.length} ${nome[1]}` : `${lista.length} ${lista.length === 1 ? nome[0] : nome[1]}`}
              </span>
            </span>
            <span />
            <span className="whitespace-nowrap text-right font-semibold tabular-nums text-gray-900">{formatBRL(totLista)}</span>
            <span className="text-right text-[11.5px] tabular-nums text-gray-500">{pctDe(totLista)}%</span>
            <span className="whitespace-nowrap text-right text-[11.5px] tabular-nums text-gray-500">{formatBRL(soma((it) => it.media))}</span>
            {comTendencia && <span />}
            {comVariacao && <span className="flex justify-end"><Variacao v={varTotal} sobeBom={false} titulo="Contra o mesmo período do ano anterior" /></span>}
          </div>
        )}
      </div>

      {ativo && (
        <BalaoGrafico pos={balao.pos} largura={250} titulo={`${ativo.grupo && !grupo ? `${ativo.grupo.nome} · ` : ''}${ativo.nome} · ${meses}`}
          itens={ativo.categorias
            ? [...ativo.categorias.slice(0, 3).map((c) => ({ rotulo: c.nome, valor: formatBRL(c.total) })),
              ...(ativo.categorias.length > 3 ? [{ rotulo: `+ ${ativo.categorias.length - 3} categorias`, valor: formatBRL(ativo.categorias.slice(3).reduce((s, c) => s + c.total, 0)) }] : [])]
            : [{ rotulo: 'Gastos', valor: formatBRL(ativo.total), cor: ativo.cor }]}
          nota={nota} />
      )}
    </Modal>
  );
}
