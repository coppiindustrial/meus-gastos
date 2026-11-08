import { useCallback, useEffect, useMemo, useState } from 'react';
import GridPersonalizavel from '../components/dashboard/GridPersonalizavel.jsx';
import CardAutoAltura from '../components/dashboard/CardAutoAltura.jsx';
import { CartaoKpi } from '../components/graficos/CartoesResumo.jsx';
import AbasPilula from '../components/AbasPilula.jsx';
import { ColunasMes, GraficoLinhas } from '../components/indicadores/GraficosIndicadores.jsx';
import useCarteira from '../components/patrimonio/useCarteira.js';
import { carregarIndicadores } from '../api/indicadores.js';
import {
  carteiraContraIndices, degraus, focusPorAno, juroReal, porMes, ultimo, variacaoEm, variacaoNoDia,
} from '../lib/indicadores.js';
import { competenciaAtual, competenciaCurta, formatDate, todayISO } from '../lib/format.js';
import { lsGet, lsSet } from '../lib/storage.js';
import { useNoCelular } from '../lib/celular.js';

// OS INDICADORES (06/11/2026, o mockup aprovado "Indicadores e importações", opção A): uma tela própria em Análises, ao lado
// do Patrimônio e dos Investimentos — o Patrimônio é o SEU dinheiro; aqui, o do MERCADO. O painel em GRID da Visão geral
// (`GridPersonalizavel`: arrastar, redimensionar, ligar e desligar blocos): os cinco números (Selic meta, CDI, IPCA de 12
// meses, dólar e euro PTAX), "Selic, IPCA e o juro real" (a Selic em degraus, o IPCA de 12 meses e a área entre os dois), o
// que o mercado espera (a Focus), o dólar e o euro (30 dias | 12 meses), o IPCA de cada mês e "Sua carteira × CDI × IPCA"
// (a ponte com o Patrimônio: o rendimento de cada mês fechado contra o CDI e acima da inflação). Os dados: `api/indicadores.js`
// (o Banco Central, público); as contas: `lib/indicadores.js` (testada). A taxa do Tesouro IPCA+ ficou de fora (opção A).

const COR = { selic: 'var(--origem-cartao)', ipca: 'var(--origem-fixo)', usd: 'var(--serie-entradas)', eur: 'var(--serie-sobrou)' };
const pct = (v, c = 2) => (v === null || v === undefined ? '—' : `${v.toLocaleString('pt-BR', { minimumFractionDigits: c, maximumFractionDigits: c })}%`);
const fracPct = (f, c = 1) => (f === null || f === undefined ? '—' : `${f >= 0 ? '+' : '−'}${Math.abs(f * 100).toLocaleString('pt-BR', { minimumFractionDigits: c, maximumFractionDigits: c })}%`);
const reais = (v, c = 4) => (v === null || v === undefined ? '—' : `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: c, maximumFractionDigits: c })}`);

const CATALOGO = [
  { id: 'ind_kpis', titulo: 'Os números de hoje', area: 'ind_numeros', x: 0, y: 0, w: 12, h: 4, alturaMedida: true, minPx: 300 },
  { id: 'ind_selic', titulo: 'Selic, IPCA e o juro real', area: 'ind_graficos', x: 0, y: 4, w: 8, h: 11, minH: 7, minPx: 420 },
  { id: 'ind_focus', titulo: 'O que o mercado espera', area: 'ind_graficos', x: 8, y: 4, w: 4, h: 11, minH: 6, minPx: 300 },
  { id: 'ind_moedas', titulo: 'Dólar e euro', area: 'ind_graficos', x: 0, y: 15, w: 6, h: 10, minH: 6, minPx: 360 },
  { id: 'ind_ipca', titulo: 'IPCA de cada mês', area: 'ind_graficos', x: 6, y: 15, w: 6, h: 10, minH: 6, minPx: 360 },
  { id: 'ind_carteira', titulo: 'Sua carteira × CDI × IPCA', area: 'ind_tabelas', x: 0, y: 25, w: 12, h: 8, minH: 5, minPx: 420 },
];
const BLOCOS_MOVEL = [['ind_kpis', null], ['ind_selic', 290], ['ind_focus', null], ['ind_moedas', 280], ['ind_ipca', 260], ['ind_carteira', null]];

function Bloco({ titulo, sub, extra, children }) {
  return (
    <section className="card flex h-full flex-col overflow-hidden p-5">
      <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="text-[13px] font-semibold text-gray-800">{titulo}</span>
        {sub && <span className="text-[11px] text-gray-400">{sub}</span>}
        {extra && <span className="ml-auto">{extra}</span>}
      </div>
      <div className="min-h-0 flex-1">{children}</div>
    </section>
  );
}
const Legenda = ({ itens }) => (
  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 border-t border-gray-100 pt-2 text-[12px] text-gray-600">
    {itens.map(([rotulo, cor, forma]) => (
      <span key={rotulo} className="inline-flex items-center gap-1.5">
        <span className={forma === 'area' ? 'h-2.5 w-3.5 rounded-[2px]' : 'h-[3px] w-3.5 rounded-full'} style={{ background: cor, opacity: forma === 'area' ? 0.25 : 1 }} />{rotulo}
      </span>
    ))}
  </div>
);

export default function Indicadores() {
  const movel = useNoCelular();
  const hoje = todayISO();
  const mesAtual = competenciaAtual();
  const [dados, setDados] = useState(null);
  const [carregando, setCarregando] = useState(false);
  const carregar = useCallback(async () => {
    setCarregando(true);
    setDados(await carregarIndicadores(todayISO()));
    setCarregando(false);
  }, []);
  useEffect(() => { carregar(); }, [carregar]);
  const pat = useCarteira(); // a carteira do zero: o mês a mês dos aportes e o CDI de cada mês
  const [moeda, setMoedaEstado] = useState(() => (lsGet('indicadores_moeda') === '30d' ? '30d' : '12m'));
  const setMoeda = (v) => { setMoedaEstado(v); lsSet('indicadores_moeda', v); };

  const d = dados ?? {};
  const selicHoje = ultimo(d.selic);
  const mudancas = useMemo(() => degraus(d.selic), [d.selic]);
  const ultimaMudanca = mudancas.length > 1 ? mudancas[mudancas.length - 1] : null;
  const antesDela = mudancas.length > 1 ? mudancas[mudancas.length - 2] : null;
  const cdiHoje = ultimo(d.cdi);
  const ipca12 = ultimo(d.ipca12);
  const ipcaMes = ultimo(d.ipca);
  const usd = ultimo(d.usd); const eur = ultimo(d.eur);
  const real = juroReal(selicHoje?.[1] ?? null, ipca12?.[1] ?? null);
  const anoHoje = Number(hoje.slice(0, 4));
  const anosFocus = [anoHoje, anoHoje + 1, anoHoje + 2];
  const focus = useMemo(() => focusPorAno(d.expectativas, anosFocus), [d.expectativas]); // eslint-disable-line react-hooks/exhaustive-deps
  const corte30 = useMemo(() => { const t = new Date(Date.UTC(+hoje.slice(0, 4), +hoje.slice(5, 7) - 1, +hoje.slice(8, 10)) - 31 * 86400000); return t.toISOString().slice(0, 10); }, [hoje]);
  const filtrarMoeda = (s) => (moeda === '30d' ? (s ?? []).filter((p) => p[0] >= corte30) : s ?? []);
  const carteira = useMemo(() => carteiraContraIndices(pat.meses, pat.cdiMes, d.ipca, mesAtual), [pat.meses, pat.cdiMes, d.ipca, mesAtual]);

  const kpis = (
    <div className="card !border-0 !bg-transparent !shadow-none">
      <CardAutoAltura id="ind_kpis">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-[repeat(auto-fit,minmax(180px,1fr))]">
          <CartaoKpi compacto icone="juros" cor={COR.selic} rotulo="Selic (meta)" valor={pct(selicHoje?.[1])}
            sub={ultimaMudanca ? `desde ${formatDate(ultimaMudanca.data).slice(0, 5)} · ${ultimaMudanca.valor > antesDela.valor ? '+' : '−'}${pct(Math.abs(ultimaMudanca.valor - antesDela.valor))} no último Copom` : 'o Banco Central'}
            serie={porMes(d.selic).slice(-12)} formatar={(v) => pct(v)} />
          <CartaoKpi compacto icone="tendencia" cor={COR.selic} rotulo="CDI" valor={pct(cdiHoje?.[1])}
            sub={cdiHoje ? `ao ano · ${formatDate(cdiHoje[0]).slice(0, 5)}` : '—'} serie={porMes(d.cdi)} formatar={(v) => pct(v)} />
          <CartaoKpi compacto icone="inflacao" cor={COR.ipca} rotulo="IPCA 12 meses" valor={pct(ipca12?.[1])}
            sub={ipcaMes ? `até ${competenciaCurta(ipcaMes[0].slice(0, 7))} · no mês ${pct(ipcaMes[1])}` : '—'}
            serie={porMes(d.ipca12).slice(-12)} formatar={(v) => pct(v)} />
          <CartaoKpi compacto icone="dolar" cor={COR.usd} rotulo="Dólar (PTAX)" valor={reais(usd?.[1])}
            sub={usd ? `${formatDate(usd[0]).slice(0, 5)} · ${fracPct(variacaoNoDia(d.usd), 2)} no dia · ${fracPct(variacaoEm(d.usd, 12))} em 12 meses` : '—'}
            serie={porMes(d.usd).slice(-12)} formatar={(v) => reais(v)} />
          <CartaoKpi compacto icone="euro" cor={COR.eur} rotulo="Euro (PTAX)" valor={reais(eur?.[1])}
            sub={eur ? `${formatDate(eur[0]).slice(0, 5)} · ${fracPct(variacaoNoDia(d.eur), 2)} no dia · ${fracPct(variacaoEm(d.eur, 12))} em 12 meses` : '—'}
            serie={porMes(d.eur).slice(-12)} formatar={(v) => reais(v)} />
        </div>
      </CardAutoAltura>
    </div>
  );

  const renderWidget = (id) => {
    switch (id) {
      case 'ind_kpis': return kpis;
      case 'ind_selic':
        return (
          <Bloco titulo="Selic, IPCA e o juro real" sub={real !== null ? `juro real hoje ≈ ${fracPct(real, 1).replace('+', '')} ao ano` : null}>
            <div className="flex h-full flex-col">
              <div className="min-h-0 flex-1">
                <GraficoLinhas mensal={false} area={['selic', 'ipca']} formatar={(v) => pct(v)} formatarEixo={(v) => `${v.toLocaleString('pt-BR')}%`} series={[
                  { key: 'selic', rotulo: 'Selic meta', cor: COR.selic, degrau: true, pontos: mudancas.map((m) => [m.data, m.valor]) },
                  { key: 'ipca', rotulo: 'IPCA em 12 meses', cor: COR.ipca, pontos: (d.ipca12 ?? []).map(([dt, v]) => [`${dt.slice(0, 7)}-15`, v]) },
                ]} />
              </div>
              <Legenda itens={[['Selic meta', COR.selic], ['IPCA em 12 meses', COR.ipca], ['juro real (a Selic acima da inflação)', COR.selic, 'area']]} />
            </div>
          </Bloco>
        );
      case 'ind_focus':
        return (
          <Bloco titulo="O que o mercado espera" sub={focus.IPCA ? `Focus de ${formatDate(focus.IPCA.data)}` : null}>
            {!d.expectativas ? <p className="text-[12.5px] text-gray-400">A pesquisa Focus não respondeu agora.</p> : (
              <div className="overflow-auto">
                <table className="w-full text-[13px] tabular-nums">
                  <thead><tr className="text-[10.5px] uppercase tracking-wide text-gray-400">
                    <th className="pb-1.5 text-left font-semibold" />{anosFocus.map((a) => <th key={a} className="pb-1.5 text-right font-semibold">{a}</th>)}
                  </tr></thead>
                  <tbody>
                    {[['IPCA', 'IPCA', (v) => pct(v)], ['Selic', 'Selic no fim do ano', (v) => pct(v)], ['Câmbio', 'Dólar no fim do ano', (v) => reais(v, 2)]].map(([k, rotulo, f]) => (
                      <tr key={k} className="border-t border-gray-100">
                        <td className="py-1.5 text-gray-700">{rotulo}</td>
                        {(focus[k]?.valores ?? anosFocus.map(() => null)).map((v, i) => <td key={i} className="py-1.5 text-right text-gray-900">{v === null ? '—' : f(v)}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="mt-2 text-[11.5px] text-gray-400">A mediana da pesquisa Focus do Banco Central com o mercado, toda semana.</p>
              </div>
            )}
          </Bloco>
        );
      case 'ind_moedas':
        return (
          <Bloco titulo="Dólar e euro" sub="PTAX de venda"
            extra={<AbasPilula abas={[{ key: '30d', label: '30 dias' }, { key: '12m', label: '12 meses' }]} valor={moeda} onChange={setMoeda} variante="claro" altura={26} folga={2} />}>
            <div className="flex h-full flex-col">
              <div className="min-h-0 flex-1">
                <GraficoLinhas formatar={(v) => reais(v)} formatarEixo={(v) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} series={[
                  { key: 'usd', rotulo: 'Dólar', cor: COR.usd, pontos: filtrarMoeda(d.usd) },
                  { key: 'eur', rotulo: 'Euro', cor: COR.eur, pontos: filtrarMoeda(d.eur) },
                ]} />
              </div>
              <Legenda itens={[['Dólar', COR.usd], ['Euro', COR.eur]]} />
            </div>
          </Bloco>
        );
      case 'ind_ipca':
        return (
          <Bloco titulo="IPCA de cada mês" sub={d.ipca?.length ? `${competenciaCurta(d.ipca[Math.max(0, d.ipca.length - 22)][0].slice(0, 7))} a ${competenciaCurta(d.ipca[d.ipca.length - 1][0].slice(0, 7))}` : null}>
            <div className="flex h-full flex-col">
              <div className="min-h-0 flex-1">
                <ColunasMes pontos={(d.ipca ?? []).slice(-22).map(([dt, v]) => [dt.slice(0, 7), v])} cor={COR.ipca} corNegativo={COR.usd}
                  formatar={(v, longo) => (longo ? pct(v) : `${v.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}`)} destacarDesde={`${anoHoje}-01`} />
              </div>
              <Legenda itens={[['inflação no mês', COR.ipca], ['deflação', COR.usd]]} />
            </div>
          </Bloco>
        );
      case 'ind_carteira':
        return (
          <Bloco titulo="Sua carteira × CDI × IPCA" sub="o rendimento de cada mês fechado">
            {carteira.length === 0 ? (
              <p className="rounded-md border border-dashed border-gray-300 px-4 py-5 text-center text-[12.5px] text-gray-500">
                Aparece a partir do 1º mês fechado da carteira com rendimento: o quanto ela rendeu contra o CDI e acima da inflação.
                {pat.meses?.length ? ` A sua começou em ${competenciaCurta(pat.meses[0].competencia)}.` : ''}
              </p>
            ) : (
              <div className="overflow-auto">
                <table className="w-full text-[13px] tabular-nums">
                  <thead><tr className="text-[10.5px] uppercase tracking-wide text-gray-400">
                    {['Mês', 'Carteira', 'CDI', '% do CDI', 'IPCA', 'Acima da inflação'].map((c, i) => <th key={c} className={`pb-1.5 font-semibold ${i ? 'text-right' : 'text-left'}`}>{c}</th>)}
                  </tr></thead>
                  <tbody>
                    {carteira.slice(-12).reverse().map((m) => (
                      <tr key={m.competencia} className="border-t border-gray-100">
                        <td className="py-1.5 text-gray-700">{competenciaCurta(m.competencia)}</td>
                        <td className="py-1.5 text-right text-gray-900">{fracPct(m.carteira, 2)}</td>
                        <td className="py-1.5 text-right text-gray-600">{m.cdi === null ? '—' : fracPct(m.cdi, 2)}</td>
                        <td className={`py-1.5 text-right ${m.doCdi !== null && m.doCdi < 1 ? 'text-amber-700' : 'text-green-700'}`}>{m.doCdi === null ? '—' : `${Math.round(m.doCdi * 100)}%`}</td>
                        <td className="py-1.5 text-right text-gray-600">{m.ipca === null ? '—' : fracPct(m.ipca, 2)}</td>
                        <td className={`py-1.5 text-right ${m.real !== null && m.real < 0 ? 'text-hx-c0393d' : 'text-green-700'}`}>{m.real === null ? '—' : fracPct(m.real, 2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Bloco>
        );
      default: return null;
    }
  };

  const acessorio = <span className="hidden text-sm text-gray-500 sm:inline">Banco Central{usd ? ` · até ${formatDate(usd[0])}` : ''}</span>;
  if (movel) {
    return (
      <div className="flex flex-col gap-3">
        {!dados ? <div className="py-16 text-center text-[13px] text-gray-400">Carregando…</div> : BLOCOS_MOVEL.map(([id, altura]) => (
          <div key={id} style={altura ? { height: altura } : undefined} className={altura ? 'flex flex-col [&>*]:min-h-0 [&>*]:flex-1' : ''}>{renderWidget(id)}</div>
        ))}
      </div>
    );
  }
  return (
    <GridPersonalizavel escopo="indicadores_v1" titulo="Indicadores" acessorio={acessorio}
      catalogo={CATALOGO} permitidos={CATALOGO} renderWidget={renderWidget} pronto={!!dados} onAtualizar={carregar} atualizando={carregando} />
  );
}
