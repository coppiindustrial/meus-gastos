import { Fragment, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import CabecalhoPagina from '../components/CabecalhoPagina.jsx';
import ListaVazia from '../components/ListaVazia.jsx';
import { PageLoading } from '../components/Spinner.jsx';
import AbasPilula from '../components/AbasPilula.jsx';
import GridPersonalizavel from '../components/dashboard/GridPersonalizavel.jsx';
import CardAutoAltura from '../components/dashboard/CardAutoAltura.jsx';
import { DivisorFaixa, FaixaProvider, LimparFiltros, Trilho } from '../components/filtros/FaixaFiltros.jsx';
import { SegMulti, SegUnico } from '../components/filtros/Segmentos.jsx';
import { CartaoKpi } from '../components/graficos/CartoesResumo.jsx';
import { COR_ENTRADAS } from '../components/graficos/Graficos.jsx';
import { RoscaOrigem } from '../components/graficos/GraficosVisao.jsx';
import LegendaSeries, { useDestaqueSeries } from '../components/graficos/LegendaSeries.jsx';
import { COR_APORTADO, COR_CDI, CascataPatrimonio, ColunasPct, ColunasRendeu } from '../components/patrimonio/GraficoPatrimonio.jsx';
import {
  AgoraPatrimonio, BlocoIR, BlocoLiquidez, BlocoVencimentos, EntrouSaiu, TabelaInvestimentos, TituloBloco,
} from '../components/patrimonio/BlocosPatrimonio.jsx';
import { CORES_INSTITUICAO } from '../components/patrimonio/TabelaCarteira.jsx';
import useCarteira from '../components/patrimonio/useCarteira.js';
import AvisoSemTaxas from '../components/patrimonio/AvisoSemTaxas.jsx';
import { IconOlho } from '../components/icons.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { marcarVencimentoVisto } from '../api/carteira.js';
import { listarCartoes } from '../api/cadastros.js';
import { listarParcelasFuturas, listarResumoMensal } from '../api/resumo.js';
import { mesAMes, montarCarteira, nomeDoTipo, rotuloTaxa } from '../lib/carteira.js';
import {
  escadaDeLiquidez, filtrarCarteira, parcelasComprometidas, irPorAliquota, linhaDoTempoVencimentos, noPeriodo, opcoesDePeriodo, porInvestimento, proximasQuedas,
  textoDoPeriodo, vencimentos,
} from '../lib/patrimonio.js';
import { brlCurto, formatBRL } from '../lib/dinheiro.js';
import { competenciaCurta, nomeCompetencia } from '../lib/format.js';
import { lsGet, lsSet } from '../lib/storage.js';
import { animarIcone, useMascararValores } from '../lib/ocultarValores.js';
import { useNoCelular } from '../lib/celular.js';
import { varCor } from '../lib/varCor.js';

// O PATRIMÔNIO (09/11/2026, o mockup "Patrimônio · o grid de widgets", a pedido: "igual à Visão geral"): só de ler — os
// números, os gráficos de meses, onde está o dinheiro, o IR, os VENCIMENTOS (os próximos e o histórico, com o "para
// avaliar"), quando o dinheiro fica livre e cada investimento. Copia a Visão geral no lugar de cada coisa: o cabeçalho com
// o 👁 · ↻ · Personalizar, a FAIXA DE FILTROS embaixo dele (período, instituição, tipo e investimento; o Comparar à
// direita), o "Agora" e o GRID PERSONALIZÁVEL (arrastar, redimensionar, ligar/desligar; escopo `patrimonio_v1`). As contas
// são de `lib/patrimonio.js` e `lib/carteira.js`; cadastrar, lançar e resgatar ficam em /investimentos.
//   · O FILTRO de instituição, tipo e investimento recorta a carteira inteira (refaz a carteira e o mês a mês só com os
//     investimentos que passam); o PERÍODO vale para os gráficos de meses; o COMPARAR escolhe a régua do "Quanto rendeu
//     em cada mês" (o CDI, o IPCA ou nada).
//   · O PASSADO: os depósitos lançados como "já estava aplicado" com a data do depósito aparecem desde o depósito, pela
//     conta do índice de trás para frente (`mesAMes`).

const LS_OCULTAR = 'patrimonio_ocultar';
const LS_COMPARAR = 'patrimonio_comparar';
const LS_FORMA = 'patrimonio_rendeu_forma';
const LS_EVOLUCAO = 'patrimonio_evolucao_modo';
const OPCOES_COMPARAR = [
  { value: 'cdi', label: 'CDI', chip: 'Comparar: CDI' },
  { value: 'ipca', label: 'IPCA (a inflação)', chip: 'Comparar: IPCA' },
  { value: 'nada', label: 'Sem comparação', chip: 'Sem comparação' },
];
const PALETA = ['var(--serie-gastos)', 'var(--origem-fixo)', 'var(--serie-sobrou)', 'var(--serie-entradas)', 'var(--origem-manual)', 'var(--origem-cartao)'];
const COR_LIQUIDEZ = varCor('#ca8a04', 'texto');
const COR_PARCELAS = varCor('#ea580c', 'texto');
const pct = (f, casas = 2) => (f === null || f === undefined || !Number.isFinite(f) ? '—' : `${(f * 100).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas })}%`);

// O CATÁLOGO DO GRID (12 colunas; uma linha = 22px + 16 de vão, como a Visão geral): o "Agora" e os números com a altura
// MEDIDA; os gráficos com o piso de largura (`minPx`).
const CATALOGO = [
  { id: 'pt_agora', titulo: 'Agora', area: 'pt_numeros', x: 0, y: 0, w: 12, h: 2, alturaMedida: true, minPx: 300 },
  { id: 'pt_kpis', titulo: 'Os números', area: 'pt_numeros', x: 0, y: 2, w: 12, h: 4, alturaMedida: true, minPx: 300 },
  { id: 'pt_evolucao', titulo: 'Evolução do patrimônio', area: 'pt_graficos', x: 0, y: 6, w: 8, h: 10, minH: 7, minPx: 420 },
  { id: 'pt_onde', titulo: 'Onde está o dinheiro', area: 'pt_graficos', x: 8, y: 6, w: 4, h: 10, minH: 7, minPx: 300 },
  { id: 'pt_rendeu', titulo: 'Quanto rendeu em cada mês', area: 'pt_graficos', x: 0, y: 16, w: 8, h: 10, minH: 7, minPx: 420 },
  { id: 'pt_ir', titulo: 'O IR e quando ele cai', area: 'pt_graficos', x: 8, y: 16, w: 4, h: 10, minH: 6, minPx: 300 },
  { id: 'pt_vencimentos', titulo: 'Vencimentos', area: 'pt_listas', x: 0, y: 26, w: 12, h: 15, minH: 9, minPx: 560 },
  { id: 'pt_entrou', titulo: 'O dinheiro que entrou e saiu', area: 'pt_graficos', x: 0, y: 41, w: 6, h: 9, minH: 6, minPx: 360 },
  { id: 'pt_livre', titulo: 'Quando o dinheiro fica livre', area: 'pt_graficos', x: 6, y: 41, w: 6, h: 9, minH: 6, minPx: 320 },
  { id: 'pt_investimentos', titulo: 'Cada investimento', area: 'pt_listas', x: 0, y: 50, w: 12, h: 11, minH: 6, minPx: 560 },
];
// NO CELULAR (só de ler, como a Visão geral): sem o grid, os blocos numa ordem fixa, cada um na altura que serve à tela
// estreita (`null` = a do conteúdo).
const BLOCOS_MOVEL = [
  ['pt_agora', null], ['pt_kpis', null], ['pt_evolucao', 300], ['pt_rendeu', 300], ['pt_onde', 360], ['pt_vencimentos', 560],
  ['pt_ir', null], ['pt_livre', null], ['pt_entrou', 280],
];

export default function Patrimonio() {
  const navigate = useNavigate();
  const toast = useToast();
  const d = useCarteira();
  const movel = useNoCelular();
  const [per, setPer] = useState('tudo');
  const [insts, setInsts] = useState([]);
  const [tipos, setTipos] = useState([]);
  const [invs, setInvs] = useState([]);
  const [comparar, setCompararEstado] = useState(() => (OPCOES_COMPARAR.some((o) => o.value === lsGet(LS_COMPARAR)) ? lsGet(LS_COMPARAR) : 'cdi'));
  const setComparar = (v) => { setCompararEstado(v); lsSet(LS_COMPARAR, v); };
  const [forma, setFormaEstado] = useState(() => (lsGet(LS_FORMA) === 'pct' ? 'pct' : 'reais'));
  const setForma = (v) => { setFormaEstado(v); lsSet(LS_FORMA, v); };
  // A EVOLUÇÃO EM CASCATA: por mês (só os com aporte, os parados num degrau) ou por ano
  const [modoEvo, setModoEvoEstado] = useState(() => (lsGet(LS_EVOLUCAO) === 'ano' ? 'ano' : 'mes'));
  const setModoEvo = (v) => { setModoEvoEstado(v); lsSet(LS_EVOLUCAO, v); };
  const [ondePor, setOndePor] = useState('inst');
  const [vencAba, setVencAba] = useState('prox');
  // O OLHO (o da Visão geral): fechado, todo valor vira "•••"; para mostrar de novo os blocos remontam (`versao`).
  const [oculto, setOcultoEstado] = useState(() => lsGet(LS_OCULTAR) === 'sim');
  const [versao, setVersao] = useState(0);
  const alternarOculto = () => setOcultoEstado((o) => { lsSet(LS_OCULTAR, o ? '' : 'sim'); if (o) setVersao((v) => v + 1); return !o; });
  useMascararValores(oculto);
  const ctrlEvo = useDestaqueSeries();
  const ctrlRendeu = useDestaqueSeries();
  const ctrlEntrou = useDestaqueSeries();
  const ir = () => navigate('/investimentos');
  const hoje = d.hoje;
  const hojeComp = hoje.slice(0, 7);

  // O FILTRO: a carteira e o mês a mês refeitos só com os investimentos que passam (sem filtro, os do `useCarteira`)
  const filtro = useMemo(() => filtrarCarteira(d, { insts, tipos, invs }), [d, insts, tipos, invs]);
  const carteira = useMemo(() => (filtro.filtrado ? montarCarteira({ ...filtro, cdi: d.cdi ?? [], ipca: d.ipca, hoje }) : d.carteira), [filtro, d.carteira, d.cdi, d.ipca, hoje]);
  const meses = useMemo(() => (filtro.filtrado ? mesAMes({ ...filtro, cdi: d.cdi ?? [], ipca: d.ipca, hoje }) : d.meses), [filtro, d.meses, d.cdi, d.ipca, hoje]);
  const mesesP = useMemo(() => noPeriodo(meses, per), [meses, per]);
  const textoPer = textoDoPeriodo(mesesP);
  const venc = useMemo(() => vencimentos({ itens: carteira.itens, cdi: d.cdi ?? [], ipca: d.ipca, hoje }), [carteira, d.cdi, d.ipca, hoje]);
  const linha = useMemo(() => linhaDoTempoVencimentos(venc, hoje), [venc, hoje]);
  const abertos = useMemo(() => carteira.itens.filter((x) => !x.pos.encerrado), [carteira]);
  const quedas = useMemo(() => proximasQuedas(abertos, hoje), [abertos, hoje]);
  // a cor de cada instituição: a da carteira inteira (não muda com o filtro)
  const cores = useMemo(() => Object.fromEntries(d.carteira.grupos.map((g, i) => [g.instituicao, CORES_INSTITUICAO[i % CORES_INSTITUICAO.length]])), [d.carteira]);
  const comVisto = d.aportes.some((a) => 'vencimento_visto' in a);

  // JÁ COMPROMETIDO EM PARCELAS (09/11/2026, o mockup "Parcelas no resumo", opção A): as parcelas de cartão que ainda vão
  // cair nas faturas e o peso delas na renda média. Não é da carteira: os filtros da tela não mexem nele. Falhou a leitura,
  // o cartão não aparece.
  const [dadosParc, setDadosParc] = useState(null);
  useEffect(() => {
    let vivo = true;
    Promise.all([listarParcelasFuturas(), listarCartoes(), listarResumoMensal()])
      .then(([parcelas, cartoes, resumo]) => { if (vivo) setDadosParc({ parcelas, cartoes, resumo }); })
      .catch(() => {});
    return () => { vivo = false; };
  }, []);
  const parc = useMemo(() => (dadosParc ? parcelasComprometidas({ ...dadosParc, hoje: hojeComp }) : null), [dadosParc, hojeComp]);

  if (d.carregando) return (<div><CabecalhoPagina titulo="Patrimônio" /><PageLoading /></div>);
  if (d.semMigration || !d.aportes.length) {
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
  const fechados = meses.filter((m) => m.competencia < hojeComp && m.pct !== null);
  const ult = fechados[fechados.length - 1] ?? null;
  const doze = fechados.slice(-12);
  const rend12 = doze.reduce((s, m) => s + m.rendeu, 0);
  const degraus = escadaDeLiquidez(abertos, venc.proximos);
  const livre = degraus[0]?.valor ?? 0;
  const em30 = (degraus[1]?.valor ?? 0) - livre;
  const indice = comparar === 'cdi' ? d.cdiMes : comparar === 'ipca' ? d.ipca : null;
  const refRotulo = comparar === 'ipca' ? 'IPCA' : 'CDI';
  const ultimos = meses.slice(-12);
  const nInv = carteira.grupos.reduce((s, g) => s + g.investimentos.length, 0);
  const qtdInv = `${nInv} ${nInv === 1 ? 'investimento' : 'investimentos'}`;

  // OS FILTROS (a faixa da Visão geral): as opções saem da carteira inteira
  const opcoesInst = [...new Set(d.cadastro.map((i) => i.instituicao.trim()))].sort((a, b) => a.localeCompare(b, 'pt-BR')).map((n) => ({ value: n, label: n, cor: cores[n] }));
  const opcoesTipo = [...new Set(d.cadastro.map((i) => i.tipo))].map((tp) => ({ value: tp, label: nomeDoTipo(tp) }));
  const opcoesInv = opcoesInst.map((g) => ({ titulo: g.label, cor: g.cor, itens: d.cadastro.filter((i) => i.instituicao.trim() === g.value).map((i) => ({ value: i.id, label: i.nome, grupo: g.label })) }));
  const filtrando = per !== 'tudo' || insts.length > 0 || tipos.length > 0 || invs.length > 0;
  const limpar = () => { setPer('tudo'); setInsts([]); setTipos([]); setInvs([]); };
  const alternar = (lista, set) => (k) => set(lista.includes(k) ? lista.filter((x) => x !== k) : [...lista, k]);
  const marcarVisto = async (id) => {
    try { await marcarVencimentoVisto([id]); toast.success('Marcado como visto.'); d.carregar(); } catch (err) {
      toast.error(/vencimento_visto/i.test(err.message) ? 'Falta aplicar a migration 026 (o vencimento visto).' : err.message);
    }
  };

  // ONDE ESTÁ O DINHEIRO: a rosca da Visão geral, por instituição, tipo, taxa ou resgate; clicar na instituição ou no
  // tipo filtra a tela
  const grupos = new Map();
  abertos.forEach((x) => {
    const k = ondePor === 'tipo' ? x.inv.tipo : ondePor === 'taxa' ? rotuloTaxa(x.inv.taxa, x.inv.indexador) : ondePor === 'resgate' ? x.inv.resgate : x.inv.instituicao.trim();
    const rot = ondePor === 'tipo' ? nomeDoTipo(k) : ondePor === 'resgate' ? (k === 'diaria' ? 'A qualquer hora' : 'Só no vencimento') : k;
    grupos.set(k, { key: k, rotulo: rot, valor: (grupos.get(k)?.valor ?? 0) + x.pos.vale });
  });
  const itensOnde = [...grupos.values()].sort((a, b) => b.valor - a.valor).map((g, i) => ({ ...g, cor: ondePor === 'inst' ? cores[g.key] : PALETA[i % PALETA.length] }));

  const kpis = (
    <div className="card !border-0 !bg-transparent !shadow-none">
      <CardAutoAltura id="pt_kpis">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-[repeat(auto-fit,minmax(200px,1fr))]">
          <CartaoKpi compacto icone="patrimonio" cor="var(--serie-gastos)" rotulo="Patrimônio" valor={formatBRL(t.vale)} valorCurto={brlCurto(t.vale)}
            sub={`≈ ${brlCurto(t.liquido)} líquido · IR ≈ ${brlCurto(t.ir)}${t.iof ? ` · IOF ≈ ${brlCurto(t.iof)}` : ''}`} serie={ultimos.map((m) => ({ competencia: m.competencia, valor: m.total }))} />
          <CartaoKpi compacto icone="entradas" cor={COR_ENTRADAS} rotulo={ult ? `Rendeu em ${competenciaCurta(ult.competencia)}` : 'Rendeu no mês'}
            valor={ult ? formatBRL(ult.rendeu) : '—'} valorCurto={ult ? brlCurto(ult.rendeu) : '—'} corValor={ult && ult.rendeu < 0 ? 'text-hx-c0393d' : 'text-green-700'}
            sub={ult ? [`${pct(ult.pct)} no mês`, d.cdiMes?.[ult.competencia] ? `${Math.round((ult.pct / d.cdiMes[ult.competencia]) * 100)}% do CDI` : null].filter(Boolean).join(' · ') : 'no fim do 1º mês fechado'}
            serie={doze.map((m) => ({ competencia: m.competencia, valor: m.rendeu }))} nota={(i) => pct(doze[i]?.pct)} />
          <CartaoKpi compacto icone="tendencia" cor={COR_ENTRADAS} rotulo={doze.length >= 12 ? 'Rendeu em 12 meses' : `Rendeu em ${doze.length} ${doze.length === 1 ? 'mês' : 'meses'}`}
            valor={formatBRL(rend12)} valorCurto={brlCurto(rend12)} corValor="text-green-700"
            sub={`${doze.length ? `${competenciaCurta(doze[0].competencia)} a ${competenciaCurta(doze[doze.length - 1].competencia)} · ` : ''}até hoje ${brlCurto(t.rendeu)}`}
            titulo="Os meses fechados. Até hoje: vale hoje − aplicado (também o que o dinheiro de antes do app já tinha rendido)."
            serie={ultimos.map((m) => ({ competencia: m.competencia, valor: m.rendimentoAcum }))} />
          <CartaoKpi compacto icone="liquidez" cor={COR_LIQUIDEZ} rotulo="Livre hoje" valor={formatBRL(livre)} valorCurto={brlCurto(livre)}
            sub={`${t.vale ? Math.round((livre / t.vale) * 100) : 0}% do patrimônio${em30 > 0 ? ` · + ${brlCurto(em30)} em 30 dias` : ''}`}
            titulo="O que tem resgate a qualquer hora. Em 30 dias: o que vence e volta para a conta." />
          {parc && (
            // no celular (2 por linha) o quinto ocupa a linha toda
            <div className="col-span-2 grid sm:col-span-1">
            <CartaoKpi compacto icone="parcelas" cor={COR_PARCELAS} rotulo="Já comprometido em parcelas" valor={formatBRL(parc.total)} valorCurto={brlCurto(parc.total)}
              corValor={parc.total ? 'text-hx-ea580c' : 'text-gray-900'} forma="barras" onClicar={() => navigate('/cartoes')}
              sub={!parc.total ? 'nenhuma parcela por vir' : [
                parc.pctRenda !== null ? `${Math.round(parc.pctRenda * 100)}% de um mês de renda` : null,
                `até ${competenciaCurta(parc.ate)}`,
              ].filter(Boolean).join(' · ')}
              titulo={parc.total ? [
                `${parc.compras} ${parc.compras === 1 ? 'compra' : 'compras'} parceladas no cartão, ${parc.parcelas} ${parc.parcelas === 1 ? 'parcela' : 'parcelas'} por vir.`,
                parc.porCartao.map((c) => `${c.nome}: ${formatBRL(c.valor)}`).join(' · '),
                parc.renda ? `A renda média dos 12 meses: ${formatBRL(parc.renda)} por mês.` : null,
                'Clique para ver os cartões.',
              ].filter(Boolean).join('\n') : 'Clique para ver os cartões.'}
              serie={parc.meses.map((m) => ({ competencia: m.competencia, valor: m.valor }))}
              itensBalao={(i) => {
                const m = parc.meses[i];
                return [{ rotulo: 'Parcelas', valor: formatBRL(m.valor), cor: COR_PARCELAS }, ...(m.porCartao.length > 1 ? m.porCartao.map((c) => ({ rotulo: c.nome, valor: formatBRL(c.valor) })) : [])];
              }}
              nota={(i) => [
                parc.meses[i].porCartao.length === 1 ? parc.meses[i].porCartao[0].nome : null,
                parc.renda ? `${Math.round((parc.meses[i].valor / parc.renda) * 100)}% da renda média` : null,
              ].filter(Boolean).join(' · ')} />
            </div>
          )}
        </div>
      </CardAutoAltura>
    </div>
  );

  const renderWidget = (id) => {
    switch (id) {
      case 'pt_agora':
        return (
          <div className="card">
            <CardAutoAltura id="pt_agora">
              <AgoraPatrimonio historico={venc.historico} proximos={venc.proximos} quedas={quedas}
                onHistorico={() => setVencAba('hist')} onProximos={() => setVencAba('prox')} />
            </CardAutoAltura>
          </div>
        );
      case 'pt_kpis': return kpis;
      case 'pt_evolucao':
        return (
          <section className="card flex flex-col overflow-hidden p-5">
            <TituloBloco titulo="Evolução do patrimônio"
              sub={`${modoEvo === 'ano' ? 'quanto entrou e quanto rendeu em cada ano' : 'cada aporte sobe um degrau; entre eles, o que rendeu nos meses parados'} · ${textoPer}`}
              extra={<AbasPilula abas={[{ key: 'mes', label: 'Mês' }, { key: 'ano', label: 'Ano' }]} valor={modoEvo} onChange={setModoEvo} variante="claro" altura={30} folga={2} />} />
            <div className="min-h-0 flex-1">{mesesP.length ? <CascataPatrimonio meses={mesesP} modo={modoEvo} ctrl={ctrlEvo} auto /> : <p className="py-6 text-center text-sm text-gray-400">Nada no período.</p>}</div>
            <LegendaSeries ctrl={ctrlEvo} series={[
              { key: 'entrou', rotulo: 'Entrou (aportes)', cor: 'var(--serie-gastos)' },
              { key: 'rendeu', rotulo: 'Rendeu', cor: COR_ENTRADAS },
              ...(mesesP.some((m) => m.resgates > 0) ? [{ key: 'saiu', rotulo: 'Saiu (resgates e vencimentos)', cor: 'var(--origem-fixo)' }] : []),
              { key: 'aportado', rotulo: 'Aportado (no fim)', cor: COR_APORTADO },
            ]} />
          </section>
        );
      case 'pt_rendeu':
        return (
          <section className="card flex flex-col overflow-hidden p-5">
            <TituloBloco titulo="Quanto rendeu em cada mês"
              sub={forma === 'pct' ? `o % do mês${indice ? ` contra o ${refRotulo}` : ''} · ${textoPer}` : `em reais${indice ? `, contra o que o ${refRotulo} daria no mesmo dinheiro` : ''} · ${textoPer}`}
              extra={<AbasPilula abas={[{ key: 'reais', label: 'Em reais' }, { key: 'pct', label: '% do mês' }]} valor={forma} onChange={setForma} variante="claro" altura={30} folga={2} />} />
            <div className="min-h-0 flex-1">
              {forma === 'pct' ? <ColunasPct meses={mesesP} indice={indice ?? null} refRotulo={refRotulo} ctrl={ctrlRendeu} auto />
                : <ColunasRendeu meses={mesesP} indice={indice} refRotulo={refRotulo} ctrl={ctrlRendeu} auto />}
            </div>
            <LegendaSeries ctrl={ctrlRendeu} series={[
              { key: 'rendeu', rotulo: forma === 'pct' ? 'Rendeu no mês (%)' : 'Rendeu no mês', cor: COR_ENTRADAS },
              ...(indice ? [{ key: 'ref', rotulo: forma === 'pct' ? `${refRotulo} do mês` : `O que o ${refRotulo} daria`, cor: COR_CDI, forma: 'tracejado' }] : []),
            ]} />
          </section>
        );
      case 'pt_onde':
        return (
          <section className="card flex flex-col overflow-hidden">
            <div className="flex flex-wrap items-center gap-2 px-4 pt-4">
              <span className="text-[13px] font-semibold text-gray-800">Onde está o dinheiro</span>
              <div className="ml-auto">
                <AbasPilula abas={[{ key: 'inst', label: 'Instituição' }, { key: 'tipo', label: 'Tipo' }, { key: 'taxa', label: 'Taxa' }, { key: 'resgate', label: 'Resgate' }]}
                  valor={ondePor} onChange={setOndePor} variante="claro" altura={28} folga={2} />
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-auto px-4 pb-3 pt-2">
              <RoscaOrigem itens={itensOnde} rotulo="Onde está o dinheiro"
                marcadas={ondePor === 'inst' ? insts : ondePor === 'tipo' ? tipos : []}
                onClicar={ondePor === 'inst' ? alternar(insts, setInsts) : ondePor === 'tipo' ? alternar(tipos, setTipos) : undefined}
                dica={ondePor === 'tipo' ? 'Clique para filtrar a tela por este tipo' : 'Clique para filtrar a tela por esta instituição'} />
            </div>
          </section>
        );
      case 'pt_ir': return <BlocoIR grupos={irPorAliquota(abertos)} quedas={quedas} total={t.vale} irTotal={t.ir} iofTotal={t.iof} />;
      case 'pt_vencimentos':
        return <BlocoVencimentos venc={venc} linha={linha} aba={vencAba} onAba={setVencAba} cores={cores} comVisto={comVisto} onVisto={marcarVisto} onInvestimentos={movel ? undefined : ir} />;
      case 'pt_entrou':
        return (
          <section className="card flex flex-col overflow-hidden p-5">
            <TituloBloco titulo="O dinheiro que entrou e saiu" sub={`os aportes de cada mês e o que saiu (resgates e vencimentos) · ${textoPer}`} />
            <div className="min-h-0 flex-1"><EntrouSaiu meses={mesesP} ctrl={ctrlEntrou} /></div>
            <LegendaSeries ctrl={ctrlEntrou} series={[{ key: 'entrou', rotulo: 'Entrou (aportes)', cor: 'var(--serie-gastos)' }, { key: 'saiu', rotulo: 'Saiu (resgates e vencimentos)', cor: 'var(--origem-fixo)' }]} />
          </section>
        );
      case 'pt_livre': return <BlocoLiquidez degraus={degraus} />;
      case 'pt_investimentos': return <TabelaInvestimentos linhas={porInvestimento(abertos, venc.proximos, hoje)} cores={cores} onInvestimentos={ir} />;
      default: return null;
    }
  };

  const filtros = (
    <FaixaProvider>
      <div className="flex flex-wrap items-center gap-2">
        <Trilho>
          <SegUnico id="periodo" rotulo="Período" opcoes={opcoesDePeriodo(meses)} value={per} onChange={setPer} padrao="tudo" mostraPadrao largura={210} />
          <DivisorFaixa />
          <SegMulti id="instituicao" rotulo="Instituição" plural="instituições" opcoes={opcoesInst} value={insts} onChange={setInsts} largura={220} />
          <DivisorFaixa />
          <SegMulti id="tipo" rotulo="Tipo" opcoes={opcoesTipo} value={tipos} onChange={setTipos} largura={180} />
          <DivisorFaixa />
          <SegMulti id="investimento" rotulo="Investimento" opcoes={opcoesInv} value={invs} onChange={setInvs} largura={300} busca="Buscar investimento" />
        </Trilho>
        <LimparFiltros ativo={filtrando} onClick={limpar} />
        <span className="flex-1" />
        <Trilho>
          <SegUnico id="comparar" rotulo="Comparar" opcoes={OPCOES_COMPARAR} value={comparar} onChange={setComparar} padrao="cdi" mostraPadrao largura={210} />
        </Trilho>
      </div>
      {d.semTaxas && <AvisoSemTaxas onTentar={d.tentarTaxas} className="mt-3" />}
    </FaixaProvider>
  );

  if (movel) {
    return (
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate text-[13px] text-gray-500">{qtdInv} · {textoPer}</span>
          <button type="button" onClick={(e) => { animarIcone(e.currentTarget); alternarOculto(); }} aria-pressed={oculto}
            aria-label={oculto ? 'Mostrar os valores' : 'Ocultar os valores'}
            className="toque toque-icone flex h-[36px] w-[40px] shrink-0 items-center justify-center rounded-[10px] border border-gray-300 bg-white text-gray-600 aria-pressed:text-gray-900">
            <IconOlho fechado={oculto} className="h-[18px] w-[18px]" />
          </button>
        </div>
        {d.semTaxas && <AvisoSemTaxas onTentar={d.tentarTaxas} />}
        {BLOCOS_MOVEL.map(([id, altura]) => (
          <div key={`${id}-${versao}`} style={altura ? { height: altura } : undefined} className={altura ? 'flex flex-col [&>*]:min-h-0 [&>*]:flex-1' : ''}>
            {renderWidget(id)}
          </div>
        ))}
      </div>
    );
  }

  return (
    <GridPersonalizavel escopo="patrimonio_v1" titulo="Patrimônio"
      acessorio={<span className="hidden text-sm text-gray-500 sm:inline">{qtdInv} em {carteira.grupos.length} {carteira.grupos.length === 1 ? 'instituição' : 'instituições'} · {nomeCompetencia(hojeComp).toLowerCase()}</span>}
      catalogo={CATALOGO} permitidos={CATALOGO} renderWidget={(id) => <Fragment key={`${id}-${versao}`}>{renderWidget(id)}</Fragment>} abaixo={filtros}
      pronto onAtualizar={d.carregar} oculto={oculto} onOcultar={alternarOculto} />
  );
}
