import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import CabecalhoPagina from '../components/CabecalhoPagina.jsx';
import AbasPilula from '../components/AbasPilula.jsx';
import ListaVazia from '../components/ListaVazia.jsx';
import { PageLoading } from '../components/Spinner.jsx';
import { CartaoKpi } from '../components/graficos/CartoesResumo.jsx';
import { COR_ENTRADAS } from '../components/graficos/Graficos.jsx';
import BalaoGrafico, { useBalao } from '../components/graficos/BalaoGrafico.jsx';
import GraficoPatrimonio, { cdiFechado } from '../components/patrimonio/GraficoPatrimonio.jsx';
import useDadosPatrimonio from '../components/patrimonio/useDadosPatrimonio.js';
import { useNoCelular } from '../lib/celular.js';
import { varCor } from '../lib/varCor.js';
import { nomeTipoInvestimento } from '../lib/investimentos.js';
import { variacao } from '../lib/visaoGeral.js';
import { brlCurto, formatBRL } from '../lib/dinheiro.js';
import { competenciaCurta, formatDate, nomeCompetencia } from '../lib/format.js';

// O PATRIMÔNIO É O PAINEL (06/11/2026, a separação pedida: "os gráficos num dashboard dos investimentos e a tabela onde
// eles são adicionados à parte", como a Visão geral e os Lançamentos). Aqui só se LÊ: os quatro números (CartaoKpi da
// Visão geral), quanto é seu e quanto rendeu (e o % de cada mês contra o CDI), ONDE ESTÁ o dinheiro (por lugar, tipo ou
// quando sai) e os PRÓXIMOS VENCIMENTOS (os com data e cada aplicação do "cada aplicação vence", com o reaplica). Cadastrar,
// aplicar, resgatar e atualizar ficam em /investimentos (`pages/Investimentos.jsx`); os dados, em `useDadosPatrimonio`.

const COR_LIQUIDEZ = varCor('#ca8a04', 'texto');
const pctTexto = (f, casas = 2) => (f === null || f === undefined ? '—' : `${(f * 100).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas })}%`);
const doCdi = (p, c) => (p !== null && p !== undefined && c > 0 ? `${Math.round((p / c) * 100)}% do CDI` : null);
const RESGATES = { diaria: 'Diária (quando quiser)', vencimento: 'No vencimento', por_aplicacao: 'Cada aplicação tem prazo', dias: 'Em alguns dias (D+N)', carencia: 'Com carência' };

// ONDE ESTÁ O DINHEIRO: barras deitadas na cor do lugar (ou neutras no tipo e no resgate), o valor e o %; o hover acende a
// linha e o balão lista o que está dentro.
function OndeEsta({ grupos, total }) {
  const [por, setPor] = useState('lugar');
  const balao = useBalao(250, 150);
  const itens = useMemo(() => {
    const todos = grupos.flatMap((g) => g.itens.filter((x) => x.inv.ativo !== false && x.vale > 0).map((x) => ({ x, g })));
    const juntar = (chave, nome, cor) => {
      const m = new Map();
      todos.forEach((t) => {
        const k = chave(t);
        const it = m.get(k) ?? { id: k, nome: nome(t), cor: cor(t), valor: 0, dentro: [] };
        it.valor += t.x.vale; it.dentro.push(t);
        m.set(k, it);
      });
      return [...m.values()].sort((a, b) => b.valor - a.valor);
    };
    if (por === 'tipo') return juntar((t) => t.x.inv.tipo, (t) => nomeTipoInvestimento(t.x.inv.tipo), () => 'var(--serie-gastos)');
    if (por === 'resgate') return juntar((t) => (t.x.diaria ? 'diaria' : t.x.inv.liquidez), (t) => RESGATES[t.x.diaria ? 'diaria' : t.x.inv.liquidez] ?? t.x.inv.liquidez, (t) => (t.x.diaria ? 'var(--serie-gastos)' : 'var(--serie-sobrou)'));
    return juntar((t) => t.g.conta.id, (t) => t.g.conta.nome, (t) => t.g.cor);
  }, [grupos, por]);
  const max = Math.max(1, ...itens.map((i) => i.valor));
  const ativo = itens.find((i) => i.id === balao.ativo);
  return (
    <section className="card flex flex-col p-5">
      <div className="mb-3 flex flex-wrap items-baseline gap-3">
        <span className="text-[13px] font-semibold text-gray-800">Onde está o dinheiro</span>
        <span className="text-[11px] text-gray-400">{formatBRL(total)}</span>
        <div className="ml-auto self-center">
          <AbasPilula abas={[{ key: 'lugar', label: 'Lugar' }, { key: 'tipo', label: 'Tipo' }, { key: 'resgate', label: 'Resgate' }]} valor={por} onChange={setPor} variante="claro" altura={30} folga={2} />
        </div>
      </div>
      {itens.length === 0 ? <p className="py-6 text-center text-sm text-gray-400">Nenhum investimento com valor.</p> : (
        <ul className="space-y-0.5" onMouseLeave={balao.aoSair}>
          {itens.map((it) => (
            <li key={it.id} onMouseMove={balao.aoMover(it.id)}
              className={`grid grid-cols-[minmax(0,1.1fr)_minmax(0,1.4fr)_auto_40px] items-center gap-3 rounded-[7px] px-2 py-[7px] transition-[background-color,opacity] duration-150 ${
                balao.ativo === it.id ? 'bg-gray-100' : 'hover:bg-gray-50'} ${balao.esmaecido(it.id) ? 'opacity-50' : ''}`}>
              <span className="flex min-w-0 items-center gap-2 text-[12.5px] text-gray-800"><span className="h-2 w-2 shrink-0 rounded-full" style={{ background: it.cor }} /><span className="truncate">{it.nome}</span></span>
              <span className="h-2.5 overflow-hidden rounded-full bg-gray-100">
                <span className="block h-full rounded-full transition-[width] duration-300 ease-out" style={{ width: `${(it.valor / max) * 100}%`, background: `linear-gradient(90deg, color-mix(in srgb, ${it.cor} 50%, transparent), ${it.cor})` }} />
              </span>
              <span className="whitespace-nowrap text-right text-[12.5px] font-medium tabular-nums text-gray-900">{formatBRL(it.valor)}</span>
              <span className="text-right text-[11.5px] tabular-nums text-gray-500">{total ? Math.round((it.valor / total) * 100) : 0}%</span>
            </li>
          ))}
        </ul>
      )}
      {ativo && (
        <BalaoGrafico pos={balao.pos} largura={250} titulo={ativo.nome}
          itens={[...ativo.dentro].sort((a, b) => b.x.vale - a.x.vale).slice(0, 5).map((t) => ({ rotulo: t.x.inv.nome, valor: formatBRL(t.x.vale), cor: t.g.cor }))}
          nota={ativo.dentro.length > 5 ? `+ ${ativo.dentro.length - 5} outros` : undefined} />
      )}
    </section>
  );
}

// OS PRÓXIMOS VENCIMENTOS: os títulos com data e cada aplicação do "cada aplicação vence" — a data, o quê, quanto e o que
// acontece (vence · reaplica · volta para a conta). Até 8, os mais perto primeiro.
function ProximosVencimentos({ grupos, onVer }) {
  const lista = useMemo(() => grupos.flatMap((g) => g.itens.filter((x) => x.inv.ativo !== false).flatMap((x) => {
    if (x.prazos) return x.prazos.lotes.filter((l) => l.vence && !l.vencida).map((l) => ({ data: l.vence, nome: x.inv.nome, lugar: g.conta.nome, cor: g.cor, valor: l.valor, oque: x.inv.ao_vencer === 'volta' ? 'volta' : 'reaplica' }));
    if (x.venc && !x.venc.vencido) return [{ data: x.inv.vencimento, nome: x.inv.nome, lugar: g.conta.nome, cor: g.cor, valor: x.vale, oque: 'vence', perto: x.venc.perto }];
    return [];
  })).sort((a, b) => (a.data < b.data ? -1 : 1)).slice(0, 8), [grupos]);
  const tom = { reaplica: { t: 'reaplica', c: 'var(--serie-sobrou)' }, volta: { t: 'volta para a conta', c: 'var(--origem-fixo)' }, vence: { t: 'vence', c: 'var(--serie-gastos)' } };
  return (
    <section className="card flex flex-col p-5">
      <div className="mb-3 flex items-baseline gap-3">
        <span className="text-[13px] font-semibold text-gray-800">Próximos vencimentos</span>
        <span className="text-[11px] text-gray-400">os títulos com data e cada aplicação com prazo</span>
      </div>
      {lista.length === 0 ? <p className="py-6 text-center text-sm text-gray-400">Nenhum vencimento cadastrado.</p> : (
        <ul className="divide-y divide-gray-100">
          {lista.map((v, i) => (
            <li key={i} className="grid grid-cols-[86px_minmax(0,1fr)_auto_auto] items-center gap-3 py-2 text-[12.5px]">
              <span className="tabular-nums font-medium text-gray-800">{formatDate(v.data)}</span>
              <span className="min-w-0 truncate text-gray-700"><span className="mr-2 inline-block h-2 w-2 rounded-full align-middle" style={{ background: v.cor }} />{v.nome}<span className="ml-1.5 text-gray-400">{v.lugar}</span></span>
              <span className="whitespace-nowrap text-right tabular-nums text-gray-900">{formatBRL(v.valor)}</span>
              <span className="whitespace-nowrap rounded-full px-2 py-px text-[11px] font-semibold" style={{ background: `color-mix(in srgb, ${tom[v.oque].c} 14%, transparent)`, color: tom[v.oque].c }}>{tom[v.oque].t}</span>
            </li>
          ))}
        </ul>
      )}
      <button type="button" onClick={onVer} className="mt-3 self-start text-[12.5px] font-medium text-gray-600 underline-offset-2 hover:text-gray-900 hover:underline">Ver os investimentos →</button>
    </section>
  );
}

export default function Patrimonio() {
  const navigate = useNavigate();
  const movel = useNoCelular();
  const d = useDadosPatrimonio();
  if (!d.contas) return (<div><CabecalhoPagina titulo="Patrimônio" /><PageLoading /></div>);

  const { meses, cdi, comMovimentos, hoje, ano } = d;
  const atual = meses[meses.length - 1];
  const anterior = meses.length > 1 ? meses[meses.length - 2] : null;
  const ref = comMovimentos ? [...meses].reverse().find((m) => m.rendeu !== null) ?? null : null;
  const fechados = d.doAno.filter((m) => m.competencia < hoje && m.pct !== null && cdi?.[m.competencia] !== undefined);
  const cdiAno = fechados.length ? fechados.reduce((f, m) => f * (1 + cdi[m.competencia]), 1) - 1 : null;
  const pctAnoFechado = fechados.length ? fechados.reduce((f, m) => f * (1 + m.pct), 1) - 1 : null;
  const grafico = meses.slice(-12);
  // o começo curto: com o primeiro mês neste ano, os números dizem "desde" em vez de "em 2026"
  const desde = meses[0] && meses[0].competencia.startsWith(ano) ? competenciaCurta(meses[0].competencia) : null;
  const liquidas = d.grupos.flatMap((g) => g.itens.filter((x) => x.diaria).map((x) => `i:${x.inv.id}`));
  const liquidez = (m) => liquidas.reduce((s, id) => s + (m?.porSerie[id]?.presente ? m.porSerie[id].saldo : 0), 0);
  const ativos = d.investimentos.filter((i) => i.ativo !== false).length;
  const ir = () => navigate('/investimentos');

  if (!ativos && !meses.length) {
    return (
      <div>
        <CabecalhoPagina titulo="Patrimônio" acoes={<button type="button" className="btn-primary" onClick={ir}>Montar a carteira</button>} />
        <div className="mt-6 max-w-2xl">
          <ListaVazia>
            O painel do patrimônio aparece quando houver investimentos. Cadastre onde você investe e o que tem em cada lugar na tela
            Investimentos; depois, atualize os valores uma vez por mês e o app separa o que você aplicou do que rendeu.
          </ListaVazia>
        </div>
      </div>
    );
  }

  return (
    <div>
      <CabecalhoPagina titulo="Patrimônio" acoes={<button type="button" className="btn-secondary" onClick={ir}>Ver os investimentos</button>} />
      {d.pendentes.length > 0 && !movel && (
        <button type="button" onClick={ir}
          className="mt-4 flex w-full flex-wrap items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-left text-[13px] text-amber-800 transition-colors hover:bg-amber-100">
          <b className="font-semibold">{d.pendentes.length} {d.pendentes.length === 1 ? 'investimento' : 'investimentos'} sem o valor do fim do mês passado.</b>
          <span>Atualize os valores na tela Investimentos para o rendimento do mês aparecer.</span>
          <span className="ml-auto font-semibold">Atualizar →</span>
        </button>
      )}
      <div className="mt-4 grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
        <CartaoKpi compacto icone="patrimonio" cor="var(--serie-gastos)" rotulo="Patrimônio" valor={formatBRL(atual?.total ?? 0)} valorCurto={brlCurto(atual?.total ?? 0)}
          variacao={anterior ? variacao(atual.total, anterior.total) : null} tituloVariacao="sobre o mês anterior"
          sub={anterior ? `${atual.total - anterior.total >= 0 ? '+' : '−'}${brlCurto(Math.abs(atual.total - anterior.total))} no mês` : desde ? `desde ${desde}` : '—'}
          serie={grafico.map((m) => ({ competencia: m.competencia, valor: m.total }))} />
        <CartaoKpi compacto icone="entradas" cor={COR_ENTRADAS} rotulo={ref ? `Rendeu em ${competenciaCurta(ref.competencia)}` : 'Rendeu no mês'}
          valor={ref ? formatBRL(ref.rendeu) : '—'} valorCurto={ref ? brlCurto(ref.rendeu) : '—'} corValor={ref?.rendeu < 0 ? 'text-hx-c0393d' : 'text-green-700'}
          sub={ref ? [pctTexto(ref.pct), doCdi(ref.pct, cdiFechado(cdi, ref.competencia))].filter(Boolean).join(' · ') : 'no 2º valor de cada investimento'}
          serie={comMovimentos ? grafico.map((m) => ({ competencia: m.competencia, valor: m.rendeu ?? 0 })) : []}
          nota={(i) => (grafico[i]?.pct !== null && grafico[i]?.pct !== undefined ? pctTexto(grafico[i].pct) : 'sem duas fotos')} />
        <CartaoKpi compacto icone="tendencia" cor={COR_ENTRADAS} rotulo={desde ? `Rendeu desde ${desde}` : `Rendeu em ${ano}`}
          valor={d.totalAno.rendeu !== null ? formatBRL(d.totalAno.rendeu) : '—'} valorCurto={d.totalAno.rendeu !== null ? brlCurto(d.totalAno.rendeu) : '—'}
          corValor={d.totalAno.rendeu < 0 ? 'text-hx-c0393d' : 'text-green-700'}
          sub={d.totalAno.rendeu !== null ? [pctTexto(d.totalAno.pct), cdiAno ? doCdi(pctAnoFechado, cdiAno) : null, `${d.totalAno.meses} ${d.totalAno.meses === 1 ? 'mês' : 'meses'}`].filter(Boolean).join(' · ') : 'no 2º valor de cada investimento'}
          serie={d.doAno.map((m, i) => ({ competencia: m.competencia, valor: d.doAno.slice(0, i + 1).reduce((s, x) => s + (x.rendeu ?? 0), 0) }))} />
        <CartaoKpi compacto icone="liquidez" cor={COR_LIQUIDEZ} rotulo="Liquidez diária" valor={formatBRL(liquidez(atual))} valorCurto={brlCurto(liquidez(atual))}
          sub={atual?.total ? `${Math.round((liquidez(atual) / atual.total) * 100)}% do patrimônio · resgata quando quiser` : '—'}
          serie={grafico.map((m) => ({ competencia: m.competencia, valor: liquidez(m) }))} />
      </div>
      <div className="mt-4">
        {grafico.length >= 2 ? <GraficoPatrimonio meses={grafico} cdi={cdi} comMovimentos={comMovimentos} /> : (
          <section className="card p-5">
            <span className="text-[13px] font-semibold text-gray-800">Quanto é seu e quanto rendeu</span>
            <p className="mt-2 text-[13px] text-gray-500">O gráfico começa no 2º mês: atualize os valores no fim de {nomeCompetencia(hoje).toLowerCase()} e ele mostra o mês a mês.</p>
          </section>
        )}
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <OndeEsta grupos={d.grupos} total={d.total.vale} />
        <ProximosVencimentos grupos={d.grupos} onVer={ir} />
      </div>
    </div>
  );
}
