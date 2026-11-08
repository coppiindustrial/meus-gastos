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
import { CORES_INSTITUICAO } from '../components/patrimonio/TabelaCarteira.jsx';
import useCarteira from '../components/patrimonio/useCarteira.js';
import AvisoSemTaxas from '../components/patrimonio/AvisoSemTaxas.jsx';
import { varCor } from '../lib/varCor.js';
import { diasEntre, nomeDoTipo } from '../lib/carteira.js';
import { brlCurto, formatBRL } from '../lib/dinheiro.js';
import { competenciaCurta, formatDate, nomeCompetencia } from '../lib/format.js';

// O PATRIMÔNIO É O PAINEL (só de ler; a carteira do zero, 07/11/2026): os quatro números, quanto é seu e quanto rendeu mês
// a mês (o fim de cada mês é a mesma conta da carteira: cada aporte pelo CDI de cada dia), ONDE ESTÁ o dinheiro (por
// instituição, tipo ou resgate) e os PRÓXIMOS VENCIMENTOS. Cadastrar, lançar e resgatar ficam em /investimentos.

const COR_LIQUIDEZ = varCor('#ca8a04', 'texto');
const pctTexto = (f, casas = 2) => (f === null || f === undefined || !Number.isFinite(f) ? '—' : `${(f * 100).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas })}%`);
const doCdi = (p, c) => (p !== null && p !== undefined && c > 0 ? `${Math.round((p / c) * 100)}% do CDI` : null);

function OndeEsta({ itens: todos, total }) {
  const [por, setPor] = useState('lugar');
  const balao = useBalao(250, 150);
  const itens = useMemo(() => {
    const m = new Map();
    todos.forEach((t) => {
      const k = por === 'tipo' ? t.inv.tipo : por === 'resgate' ? t.inv.resgate : t.inv.instituicao.trim();
      const nome = por === 'tipo' ? nomeDoTipo(t.inv.tipo) : por === 'resgate' ? (t.inv.resgate === 'diaria' ? 'A qualquer hora' : 'Só no vencimento') : t.inv.instituicao.trim();
      const cor = por === 'lugar' ? t.cor : por === 'resgate' ? (t.inv.resgate === 'diaria' ? 'var(--serie-gastos)' : 'var(--serie-sobrou)') : 'var(--serie-gastos)';
      const it = m.get(k) ?? { id: k, nome, cor, valor: 0, dentro: new Map() };
      it.valor += t.pos.vale;
      it.dentro.set(t.inv.id, { nome: t.inv.nome, cor: t.cor, valor: (it.dentro.get(t.inv.id)?.valor ?? 0) + t.pos.vale });
      m.set(k, it);
    });
    return [...m.values()].sort((a, b) => b.valor - a.valor);
  }, [todos, por]);
  const max = Math.max(1, ...itens.map((i) => i.valor));
  const ativo = itens.find((i) => i.id === balao.ativo);
  return (
    <section className="card flex flex-col p-5">
      <div className="mb-3 flex flex-wrap items-baseline gap-3">
        <span className="text-[13px] font-semibold text-gray-800">Onde está o dinheiro</span>
        <span className="text-[11px] text-gray-400">{formatBRL(total)}</span>
        <div className="ml-auto self-center">
          <AbasPilula abas={[{ key: 'lugar', label: 'Instituição' }, { key: 'tipo', label: 'Tipo' }, { key: 'resgate', label: 'Resgate' }]} valor={por} onChange={setPor} variante="claro" altura={30} folga={2} />
        </div>
      </div>
      {itens.length === 0 ? <p className="py-6 text-center text-sm text-gray-400">Nenhum aporte ainda.</p> : (
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
          itens={[...ativo.dentro.values()].sort((a, b) => b.valor - a.valor).slice(0, 5).map((t) => ({ rotulo: t.nome, valor: formatBRL(t.valor), cor: t.cor }))}
          nota={ativo.dentro.size > 5 ? `+ ${ativo.dentro.size - 5} outros` : undefined} />
      )}
    </section>
  );
}

// OS PRÓXIMOS VENCIMENTOS: cada aporte com vencimento, do mais perto ao mais longe (até 8) — a data, o investimento, o
// quanto vale hoje e em quantos dias.
function ProximosVencimentos({ itens, hoje, onVer }) {
  const lista = itens.filter((t) => t.ap.vencimento && t.ap.vencimento >= hoje).sort((a, b) => (a.ap.vencimento < b.ap.vencimento ? -1 : 1)).slice(0, 8);
  return (
    <section className="card flex flex-col p-5">
      <div className="mb-3 flex items-baseline gap-3">
        <span className="text-[13px] font-semibold text-gray-800">Próximos vencimentos</span>
        <span className="text-[11px] text-gray-400">cada aporte com data; no dia, o dinheiro volta para a conta</span>
      </div>
      {lista.length === 0 ? <p className="py-6 text-center text-sm text-gray-400">Nenhum aporte com vencimento.</p> : (
        <ul className="divide-y divide-gray-100">
          {lista.map((t) => {
            const n = diasEntre(hoje, t.ap.vencimento);
            return (
              <li key={t.ap.id} className="grid grid-cols-[86px_minmax(0,1fr)_auto_auto] items-center gap-3 py-2 text-[12.5px]">
                <span className="tabular-nums font-medium text-gray-800">{formatDate(t.ap.vencimento)}</span>
                <span className="min-w-0 truncate text-gray-700"><span className="mr-2 inline-block h-2 w-2 rounded-full align-middle" style={{ background: t.cor }} />{t.inv.nome}<span className="ml-1.5 text-gray-400">{t.inv.instituicao}</span></span>
                <span className="whitespace-nowrap text-right tabular-nums text-gray-900">{formatBRL(t.pos.vale)}</span>
                <span className={`whitespace-nowrap rounded-full px-2 py-px text-[11px] font-semibold ${n <= 45 ? 'bg-amber-50 text-amber-700' : 'bg-gray-100 text-gray-600'}`}>
                  {n === 0 ? 'hoje' : n <= 60 ? `em ${n} ${n === 1 ? 'dia' : 'dias'}` : `em ${Math.round(n / 30.4)} meses`}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      <button type="button" onClick={onVer} className="mt-3 self-start text-[12.5px] font-medium text-gray-600 underline-offset-2 hover:text-gray-900 hover:underline">Ver os investimentos →</button>
    </section>
  );
}

export default function Patrimonio() {
  const navigate = useNavigate();
  const d = useCarteira();
  const ir = () => navigate('/investimentos');
  if (d.carregando) return (<div><CabecalhoPagina titulo="Patrimônio" /><PageLoading /></div>);

  const { carteira, meses, cdiMes } = d;
  const cores = Object.fromEntries(carteira.grupos.map((g, i) => [g.instituicao, CORES_INSTITUICAO[i % CORES_INSTITUICAO.length]]));
  const abertos = carteira.grupos.flatMap((g) => g.investimentos.flatMap((x) => x.aportes.map((item) => ({ ...item, cor: cores[g.instituicao] }))));
  if (d.semMigration || !abertos.length) {
    return (
      <div>
        <CabecalhoPagina titulo="Patrimônio" acoes={<button type="button" className="btn-primary" onClick={ir}>Ver os investimentos</button>} />
        <div className="mt-6 max-w-2xl">
          <ListaVazia>
            {d.semMigration ? 'Falta aplicar a migration 020 (a carteira do zero) no SQL Editor do Supabase.'
              : 'O painel aparece com o primeiro aporte. Na tela Investimentos, cadastre os investimentos e lance os aportes; o app separa o que você aplicou do que rendeu.'}
          </ListaVazia>
        </div>
      </div>
    );
  }

  const t = carteira.total;
  const atual = meses[meses.length - 1];
  const anterior = meses.length > 1 ? meses[meses.length - 2] : null;
  const grafico = meses.slice(-12);
  const fechado = [...meses].reverse().find((m) => m.competencia < d.hoje.slice(0, 7) && m.pct !== null) ?? null;
  const ref = fechado ?? atual;
  const liquidez = abertos.filter((x) => x.inv.resgate === 'diaria').reduce((s, x) => s + x.pos.vale, 0);
  const novo = atual && anterior ? atual.aportes - atual.resgates : 0;

  return (
    <div>
      <CabecalhoPagina titulo="Patrimônio" acoes={<button type="button" className="btn-secondary" onClick={ir}>Ver os investimentos</button>} />
      {d.semTaxas && <AvisoSemTaxas onTentar={d.tentarTaxas} className="mt-4" />}
      <div className="mt-4 grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
        <CartaoKpi compacto icone="patrimonio" cor="var(--serie-gastos)" rotulo="Patrimônio" valor={formatBRL(t.vale)} valorCurto={brlCurto(t.vale)}
          sub={`≈ ${brlCurto(t.liquido)} líquido · IR ≈ ${brlCurto(t.ir)}`}
          titulo={anterior && Math.abs(novo) > 0 ? `Neste mês entraram ${formatBRL(atual.aportes)} e saíram ${formatBRL(atual.resgates)}.` : undefined}
          serie={grafico.map((m) => ({ competencia: m.competencia, valor: m.total }))} />
        <CartaoKpi compacto icone="entradas" cor={COR_ENTRADAS} rotulo={`Rendeu em ${competenciaCurta(ref.competencia)}${ref === atual ? ' (até hoje)' : ''}`}
          valor={formatBRL(ref.rendeu)} valorCurto={brlCurto(ref.rendeu)} corValor={ref.rendeu < 0 ? 'text-hx-c0393d' : 'text-green-700'}
          sub={[pctTexto(ref.pct), doCdi(ref.pct, cdiFechado(cdiMes, ref.competencia))].filter(Boolean).join(' · ')}
          serie={grafico.map((m) => ({ competencia: m.competencia, valor: m.rendeu }))}
          nota={(i) => pctTexto(grafico[i]?.pct)} />
        <CartaoKpi compacto icone="tendencia" cor={COR_ENTRADAS} rotulo="Rendeu até hoje" valor={formatBRL(t.rendeu)} valorCurto={brlCurto(t.rendeu)}
          corValor={t.rendeu < 0 ? 'text-hx-c0393d' : 'text-green-700'}
          sub={`${pctTexto(t.aplicado ? t.rendeu / t.aplicado : null, 1)} sobre o aplicado · bruto`}
          titulo="Vale hoje − aplicado: também o que o dinheiro de antes do app já tinha rendido."
          serie={grafico.map((m) => ({ competencia: m.competencia, valor: m.rendimentoAcum }))} />
        <CartaoKpi compacto icone="liquidez" cor={COR_LIQUIDEZ} rotulo="Resgate a qualquer hora" valor={formatBRL(liquidez)} valorCurto={brlCurto(liquidez)}
          sub={t.vale ? `${Math.round((liquidez / t.vale) * 100)}% do patrimônio` : '—'} />
      </div>
      <div className="mt-4">
        {grafico.length >= 2 ? <GraficoPatrimonio meses={grafico} cdi={cdiMes} comMovimentos /> : (
          <section className="card p-5">
            <span className="text-[13px] font-semibold text-gray-800">Quanto é seu e quanto rendeu</span>
            <p className="mt-2 text-[13px] text-gray-500">O gráfico começa no 2º mês: no fim de {nomeCompetencia(d.hoje.slice(0, 7)).toLowerCase()} ele já mostra o mês a mês.</p>
          </section>
        )}
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <OndeEsta itens={abertos} total={t.vale} />
        <ProximosVencimentos itens={abertos} hoje={d.hoje} onVer={ir} />
      </div>
    </div>
  );
}
