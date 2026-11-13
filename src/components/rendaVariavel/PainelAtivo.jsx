import { useCallback, useEffect, useMemo, useState } from 'react';
import Modal from '../Modal.jsx';
import AbasPilula from '../AbasPilula.jsx';
import Toggle from '../Toggle.jsx';
import Tooltip from '../Tooltip.jsx';
import { Trilho, DivisorFaixa } from '../filtros/FaixaFiltros.jsx';
import LegendaSeries, { useDestaqueSeries } from '../graficos/LegendaSeries.jsx';
import { IconMaximize, IconMinimize } from '../icons.jsx';
import GraficoAtivo, { COR_EVENTO, COR_MARCA, LETRA_EVENTO } from './GraficoAtivo.jsx';
import WidgetTradingView from './WidgetTradingView.jsx';
import SeletorAtivo, { lembrarVista } from './SeletorAtivo.jsx';
import { acaoDeFora, atualizarEventos, buscarHistorico, eventosDoAtivo, fechamentosDoAtivo, intradiaDoAtivo, mensalDoAtivo } from '../../api/rendaVariavel.js';
import { dolarDiario } from '../../api/indicadores.js';
import { useNoCelular } from '../../lib/celular.js';
import { formatBRL } from '../../lib/dinheiro.js';
import { formatDate } from '../../lib/format.js';
import { lsGet, lsSet } from '../../lib/storage.js';
import { CLASSES, TIPOS, classeDoTipo, nomeDoTipo, posicaoDoAtivo, precoDaOperacao } from '../../lib/rendaVariavel.js';
import {
  PERIODOS, cotasAntesDe, desdobramentosSemOperacao, desempenho, dolarEm, eventosNoPeriodo, historicoDoPrecoMedio, historicoQueFalta,
  inicioDoPeriodo, marcasNoPeriodo, paraDesenho, precoMedioEm, proximoResultado, resumoDosDividendos, ultimosResultados, velasDeFechamentos,
} from '../../lib/graficoAtivo.js';

// O PAINEL DO ATIVO (13/11/2026, os mockups "O gráfico do ativo" e "Desempenho, volume, dividendos e resultados", a opção B):
// abre pelo ticker, pelo ícone do gráfico e pela curvinha do mês na carteira da Renda variável. É o painel dos ampliados
// (1280px, 90% da altura, tela cheia), com duas abas:
//   · MEU GRÁFICO (`GraficoAtivo`): em cima, a FAIXA DE DESEMPENHO, que É o período (1 dia · 1 semana · 1 mês · 3 · 6 meses ·
//     1 ano · 5 anos · Desde o início: cada célula diz quanto o ativo andou e, clicada, troca o gráfico); o preço em linha ou
//     velas, com AS SUAS compras e vendas em cima da curva e o PREÇO MÉDIO em degraus; embaixo, os EVENTOS da empresa (D o
//     dividendo na data-ex, cheio quando você tinha cotas; E o resultado; S o desdobramento) e o VOLUME. "Em R$" converte o
//     exterior pelo dólar de cada dia (a PTAX). Ao lado: a posição, o dia, o próximo resultado, os últimos, os dividendos e
//     as 52 semanas; e o aviso do desdobramento da empresa que você não lançou.
//   · AVANÇADO (`WidgetTradingView`): o gráfico do TradingView, com indicadores e ferramentas de desenho.
// O HISTÓRICO: os fechamentos guardados em `rv_fechamentos`; na PRIMEIRA vez (quase nada guardado) ou quando faltam os últimos
// dias, o painel pede à função `cotacoes` que traga do Yahoo (`buscarHistorico`, que traz os eventos junto) — uma vez por
// ativo por sessão: se o Yahoo recusar, segue com o que há e o rodapé avisa. OS EVENTOS (`rv_eventos`, migration 031) são
// relidos uma vez por dia (`atualizarEventos`). O 1 dia (de 5 em 5 minutos) e o "Desde o início" (um ponto por mês desde a
// estreia) a função busca na hora, sem guardar.
// O TÍTULO É O SELETOR (13/11/2026, a opção B do mockup "Ver o gráfico de qualquer ação"): "MU · Micron ▾" abre o
// `SeletorAtivo` (a carteira, as vistas há pouco e a busca pelo nome); escolher troca o conteúdo sem fechar o painel (o
// período, a forma e as marcas ficam: são lembrados). A AÇÃO FORA DO CADASTRO vem inteira da função na hora (`acaoDeFora`:
// os fechamentos, os eventos e a cotação, sem gravar) e o lado troca "Sua posição" por "Cadastrar".

const PEDIDOS = new Set(); // os ativos cujo histórico já foi pedido nesta sessão
const EVENTOS_PEDIDOS = new Set(); // e os eventos
const DIA_MS = 86400000;
const HORA_BR = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
const MES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const BTN_ICONE = 'inline-flex h-[28px] w-[28px] items-center justify-center rounded-[4px] text-gray-400 transition hover:bg-gray-100 hover:text-gray-600';
const num = (v, casas = 2) => Number(v).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
const pct = (f, casas = 2) => (f === null || f === undefined || !Number.isFinite(f) ? '—' : `${f > 0 ? '+' : f < 0 ? '−' : ''}${num(Math.abs(f * 100), casas)}%`);
// o "Desde o início" chega a milhares por cento: "+81,6 mil%"
const pctFaixa = (f) => (f === null || f === undefined || !Number.isFinite(f) ? '—' : Math.abs(f) >= 100 ? `${f > 0 ? '+' : '−'}${num(Math.abs(f * 100) / 1000, 1)} mil%` : pct(f));
const corDe = (v) => (v < 0 ? 'text-hx-c0393d' : v > 0 ? 'text-green-700' : 'text-gray-500');
const volumeCurto = (v) => (v >= 1e9 ? `${num(v / 1e9, 1)} bi` : v >= 1e6 ? `${num(v / 1e6, 1)} mi` : v >= 1e3 ? `${num(v / 1e3, 1)} mil` : String(v));
const ler = (k, padrao, validos) => { const v = lsGet(k); return validos.includes(v) ? v : padrao; };
const QUANDO = { amc: 'depois do fechamento', bmo: 'antes da abertura', dmh: 'durante o pregão' };
const nomeTri = (e) => (e.trimestre && e.ano ? `${e.trimestre}º tri fiscal ${e.ano}` : '');
const casasDiv = (v) => (Number(v) < 0.1 ? 4 : 3);

function ConteudoAtivo({ posicao, operacoes, ptax, dolar, hoje, onOperar, pronto = null, deFora = false, onCadastrar = null }) {
  const p = posicao;
  const { ativo } = p;
  const usd = !!p.usd;
  const movel = useNoCelular();
  const classe = CLASSES.find((c) => c.id === classeDoTipo(ativo.tipo));
  const cor = classe?.cor ?? 'var(--serie-gastos)';
  const [aba, setAbaEstado] = useState(() => (movel ? 'meu' : ler('rv_grafico_aba', 'meu', ['meu', 'tv'])));
  const setAba = (v) => { setAbaEstado(v); lsSet('rv_grafico_aba', v); };
  const [per, setPerEstado] = useState(() => ler('rv_grafico_periodo', '1A', PERIODOS.map((x) => x.key)));
  const setPer = (v) => { setPerEstado(v); lsSet('rv_grafico_periodo', v); };
  const [tipo, setTipoEstado] = useState(() => ler('rv_grafico_tipo', 'linha', ['linha', 'velas']));
  const setTipo = (v) => { setTipoEstado(v); lsSet('rv_grafico_tipo', v); };
  const lerLiga = (k) => lsGet(k) !== '0';
  const [verOps, setVerOps] = useState(true);
  const [verPm, setVerPm] = useState(true);
  const [verEv, setVerEvEstado] = useState(() => lerLiga('rv_grafico_eventos'));
  const setVerEv = (v) => { setVerEvEstado(v); lsSet('rv_grafico_eventos', v ? '1' : '0'); };
  const [verVol, setVerVolEstado] = useState(() => lerLiga('rv_grafico_volume'));
  const setVerVol = (v) => { setVerVolEstado(v); lsSet('rv_grafico_volume', v ? '1' : '0'); };
  const [brl, setBrl] = useState(false);
  const ctrl = useDestaqueSeries();
  const intradia = per === '1D';
  const doInicio = per === 'tudo';
  const emReais = usd && brl && !doInicio; // o dólar de antes de 10 anos o Banco Central não dá numa leitura

  // ---- o histórico guardado (e o pedido ao Yahoo, se faltar) e os eventos (relidos uma vez por dia)
  // a ação de fora do cadastro já chega com tudo (`pronto`): nada a ler nem a pedir
  const [hist, setHist] = useState(() => (pronto ? { velas: true, linhas: pronto.linhas } : null));
  const [eventos, setEventos] = useState(() => (pronto ? pronto.eventos : undefined)); // undefined: lendo; null: sem a migration 031
  const alvoApi = deFora ? { ticker: ativo.ticker, mercado: ativo.mercado } : ativo.id;
  const [buscando, setBuscando] = useState(false);
  const [aviso, setAviso] = useState(null);
  useEffect(() => {
    if (pronto) return undefined;
    let vivo = true;
    (async () => {
      let pediuHistorico = false;
      try {
        const r = await fechamentosDoAtivo(ativo.id);
        if (!vivo) return;
        setHist(r);
        const falta = historicoQueFalta(r.linhas, hoje);
        if (falta && !PEDIDOS.has(ativo.id)) {
          PEDIDOS.add(ativo.id);
          pediuHistorico = true;
          setBuscando(true);
          const b = await buscarHistorico(ativo.id, falta === 'inteiro' ? '10y' : '3mo');
          if (!vivo) return;
          if (b?.erro) setAviso(`O histórico não veio (${b.erro}); o gráfico mostra o que já estava guardado.`);
          else {
            if (b?.erroEventos) setAviso(`Os dividendos e resultados não vieram (${b.erroEventos}).`);
            const r2 = await fechamentosDoAtivo(ativo.id);
            if (vivo) setHist(r2);
          }
        }
      } catch (err) {
        if (vivo) setAviso(err?.message ?? 'O histórico não carregou.');
      } finally {
        if (vivo) setBuscando(false);
      }
      try {
        let ev = await eventosDoAtivo(ativo.id);
        if (!vivo) return;
        setEventos(ev);
        const novo = (ev ?? []).reduce((m, e) => (e.atualizado_em > m ? e.atualizado_em : m), '');
        const velhos = ev !== null && (!novo || Date.now() - new Date(novo).getTime() > DIA_MS);
        if (velhos && !pediuHistorico && !EVENTOS_PEDIDOS.has(ativo.id)) {
          EVENTOS_PEDIDOS.add(ativo.id);
          const r = await atualizarEventos(ativo.id);
          if (!vivo || r?.erro || r?.erroEventos) return;
          ev = await eventosDoAtivo(ativo.id);
          if (vivo) setEventos(ev);
        }
      } catch {
        if (vivo) setEventos(null);
      }
    })();
    return () => { vivo = false; };
  }, [ativo.id, hoje]);

  // ---- o 1 dia (o pregão de hoje, relido a cada 2 minutos) e o "Desde o início" (os meses desde a estreia)
  const [intra, setIntra] = useState(null);
  useEffect(() => {
    if (!intradia) return undefined;
    let vivo = true;
    const lerIntra = () => intradiaDoAtivo(alvoApi).then((r) => { if (vivo) setIntra(r); });
    lerIntra();
    const t = setInterval(() => { if (document.visibilityState === 'visible') lerIntra(); }, 120000);
    return () => { vivo = false; clearInterval(t); };
  }, [intradia, ativo.id]);
  const [mensal, setMensal] = useState(null);
  useEffect(() => {
    if (!doInicio || mensal) return undefined;
    let vivo = true;
    mensalDoAtivo(alvoApi).then((r) => { if (vivo) setMensal(r?.erro ? { erro: r.erro } : { velas: velasDeFechamentos(r?.pontos) }); });
    return () => { vivo = false; };
  }, [doInicio, ativo.id, mensal]);

  // ---- o dólar de cada dia (o "Em R$" do exterior): a PTAX da tela, ou desde o começo do período
  const velas = useMemo(() => velasDeFechamentos(hist?.linhas), [hist]);
  const de = inicioDoPeriodo(per, hoje);
  const recorte = useMemo(() => (doInicio ? mensal?.velas ?? [] : de ? velas.filter((x) => x.d >= de) : velas), [velas, de, doInicio, mensal]);
  const [ptaxLonga, setPtaxLonga] = useState(null);
  const precisaDesde = emReais && recorte.length ? recorte[0].d : null;
  useEffect(() => {
    if (!precisaDesde || (ptax?.length && ptax[0][0] <= precisaDesde) || (ptaxLonga?.length && ptaxLonga[0][0] <= precisaDesde)) return undefined;
    let vivo = true;
    dolarDiario(precisaDesde).then((s) => { if (vivo && s?.length) setPtaxLonga(s); });
    return () => { vivo = false; };
  }, [precisaDesde, ptax, ptaxLonga]);
  const serieDolar = ptaxLonga?.length && (!ptax?.length || ptaxLonga[0][0] < ptax[0][0]) ? ptaxLonga : ptax;
  const fatorDe = (d) => (!emReais ? 1 : d >= hoje && dolar ? dolar : dolarEm(serieDolar, d) ?? dolar ?? 0);

  // ---- o que vai ao desenho
  const { pontos, grupo } = useMemo(() => {
    if (intradia) {
      const k = emReais ? dolar ?? 0 : 1;
      const pts = (intra?.pontos ?? []).map((x) => ({ t: x.t, o: (x.o ?? x.c) * k, h: (x.h ?? x.c) * k, l: (x.l ?? x.c) * k, c: x.c * k, v: x.v ?? null }));
      return { pontos: pts, grupo: 'intra' };
    }
    if (doInicio) return { pontos: recorte.map((x) => ({ ...x, d0: x.d })), grupo: 'mes' };
    const r = paraDesenho(recorte, tipo);
    if (!emReais) return r;
    return { ...r, pontos: r.pontos.map((x) => { const k = fatorDe(x.d); return { ...x, o: x.o * k, h: x.h * k, l: x.l * k, c: x.c * k }; }) };
  }, [intradia, intra, doInicio, recorte, tipo, emReais, dolar, serieDolar]);
  const sessao = intradia && intra?.inicio && intra?.fim ? { inicio: intra.inicio, fim: intra.fim } : null;
  const anterior = intradia && intra?.anterior ? intra.anterior * (emReais ? dolar ?? 0 : 1) : null;

  const minhas = useMemo(() => operacoes.filter((o) => o.ativo_id === ativo.id), [operacoes, ativo.id]);
  const degraus = useMemo(() => historicoDoPrecoMedio(ativo, minhas), [ativo, minhas]);
  const pmDe = verPm && !intradia && degraus.length ? (x) => precoMedioEm(degraus, x.d, usd ? emReais : true) : null;
  const marcas = verOps && !intradia ? marcasNoPeriodo(minhas.filter((o) => o.data <= hoje && (o.tipo === 'compra' || o.tipo === 'venda')), pontos) : [];
  const evs = useMemo(() => (verEv && !intradia ? eventosNoPeriodo(eventos, pontos).map((m) => ({ ...m, cheio: m.ev.tipo === 'dividendo' && cotasAntesDe(degraus, m.ev.data) > 0 })) : []), [verEv, intradia, eventos, pontos, degraus]);
  const proximo = verEv && !intradia ? proximoResultado(eventos, hoje) : null;

  // ---- os números de cima e a faixa de desempenho (na moeda do ativo)
  const sigla = emReais || !usd ? 'R$' : 'US$';
  const siglaAtivo = usd ? 'US$' : 'R$';
  const moeda = (v, casas = 2) => (v === null || v === undefined || !Number.isFinite(v) ? '—' : `${sigla} ${num(v, casas)}`);
  const c = p.cotacao;
  const precoAgora = (p.preco ?? 0) * (emReais ? dolar ?? 0 : 1);
  const antes = c?.fechamento_anterior ? Number(c.fechamento_anterior) * (emReais ? dolar ?? 0 : 1) : null;
  const variacaoDia = p.variacaoDia ?? (antes ? precoAgora / antes - 1 : null);
  const estreia = (eventos ?? []).find((e) => e.tipo === 'estreia')?.valor ?? mensal?.velas?.[0]?.c ?? null;
  const faixa = useMemo(() => desempenho({ velas, preco: p.preco, anterior: c?.fechamento_anterior ? Number(c.fechamento_anterior) : null, estreia: estreia ? Number(estreia) : null, hoje }),
    [velas, p.preco, c?.fechamento_anterior, estreia, hoje]);

  // ---- o balão de cada ponto e o de cada evento
  const balaoDe = (pt, j, ops, evsDoPonto) => {
    const titulo = grupo === 'intra' ? `hoje, ${HORA_BR.format(new Date(pt.t * 1000))}`
      : grupo === 'semana' ? `semana de ${formatDate(pt.d0)}`
        : grupo === 'mes' ? `${MES[Number(pt.d.slice(5, 7)) - 1]}/${pt.d.slice(0, 4)}` : formatDate(pt.d);
    const ref = j ? pontos[j - 1].c : grupo === 'intra' ? anterior : null;
    const itens = [{ rotulo: 'Fechamento', valor: moeda(pt.c), cor }];
    if (ref) itens.push({ rotulo: grupo === 'semana' ? 'Na semana' : grupo === 'mes' ? 'No mês' : grupo === 'intra' ? 'Desde o anterior' : 'No dia', valor: pct(pt.c / ref - 1) });
    if (tipo === 'velas' && !doInicio) {
      itens.push({ rotulo: 'Abertura', valor: moeda(pt.o) });
      itens.push({ rotulo: 'Máxima · mínima', valor: `${num(pt.h)} · ${num(pt.l)}` });
    }
    if (verVol && pt.v) itens.push({ rotulo: grupo === 'semana' ? 'Volume na semana' : grupo === 'mes' ? 'Volume no mês' : 'Volume', valor: volumeCurto(pt.v) });
    if (emReais && grupo !== 'intra') itens.push({ rotulo: 'Dólar do dia (PTAX)', valor: `R$ ${num(fatorDe(pt.d), 4)}` });
    const pm = pmDe ? pmDe(pt) : null;
    if (pm) itens.push({ rotulo: 'Seu preço médio', valor: `${moeda(pm)} · ${pct(pt.c / pm - 1, 1)}` });
    const linhas = [...ops.map((o) => ({ k: o.id, t: textoDaOperacao(o, { usd, emReais, sigla }) })), ...evsDoPonto.map((e) => ({ k: `${e.tipo}${e.data}`, t: textoDoEvento(e, siglaAtivo) }))];
    const extra = linhas.length ? (
      <div className="mt-1.5 space-y-0.5 border-t border-gray-100 pt-1.5 text-[11.5px] leading-[16px] text-gray-600">{linhas.map((l) => <div key={l.k}>{l.t}</div>)}</div>
    ) : null;
    return { titulo, itens, extra };
  };
  const balaoDoEvento = (ev) => {
    if (ev.tipo === 'dividendo') {
      const cotas = cotasAntesDe(degraus, ev.data);
      const bruto = cotas * Number(ev.valor);
      const itens = [{ rotulo: 'Por ação', valor: `${siglaAtivo} ${num(ev.valor, casasDiv(ev.valor))}`, cor: COR_EVENTO.dividendo }];
      if (cotas > 0) {
        itens.push({ rotulo: 'Você tinha', valor: `${cotas.toLocaleString('pt-BR', { maximumFractionDigits: 6 })} ${cotas === 1 ? 'cota' : 'cotas'}` });
        itens.push(usd ? { rotulo: 'Bruto · líquido (−30% nos EUA)', valor: `US$ ${num(bruto)} · ${num(bruto * 0.7)}` } : { rotulo: 'Bruto', valor: `R$ ${num(bruto)}` });
      }
      return { titulo: `Dividendo · data-ex ${formatDate(ev.data)}`, itens, nota: `Recebe quem tem a ação no fim do pregão anterior à data-ex. ${cotas > 0 ? 'Cheio: você tinha cotas.' : 'Vazio: você não tinha cotas nesse dia.'}` };
    }
    if (ev.tipo === 'desdobramento') {
      const fator = Number(ev.valor);
      const lancado = !desdobramentosSemOperacao([ev], minhas).length;
      return {
        titulo: `${fator < 1 ? 'Grupamento' : 'Desdobramento'} · ${formatDate(ev.data)}`,
        itens: [{ rotulo: 'Cada cota virou', valor: fator < 1 ? `1/${num(1 / fator, 0)}` : num(fator, fator % 1 ? 2 : 0), cor: COR_EVENTO.desdobramento }],
        nota: minhas.some((o) => o.tipo === 'compra' && o.data < ev.data) ? (lancado ? 'Lançado nas suas operações.' : 'Ainda não lançado nas suas operações: a sua quantidade de cotas fica errada.') : 'O preço de antes já vem dividido pelo fator (o Yahoo ajusta o histórico).',
      };
    }
    // o resultado (o próximo, ou um que passou)
    const quando = QUANDO[ev.hora] ? `, ${QUANDO[ev.hora]}` : '';
    if (ev.proximo || ev.valor === null || ev.valor === undefined) {
      return {
        titulo: `${ev.proximo ? 'Próximo resultado' : 'Resultado'} · ${formatDate(ev.data)}${quando}`,
        itens: [
          ...(nomeTri(ev) ? [{ rotulo: 'Trimestre', valor: nomeTri(ev) }] : []),
          ...(ev.estimado ? [{ rotulo: 'Lucro por ação esperado', valor: `US$ ${num(ev.estimado)}`, cor: COR_EVENTO.resultado }] : []),
          ...(ev.receita_estimada ? [{ rotulo: 'Receita esperada', valor: `US$ ${num(ev.receita_estimada / 1e9, 1)} bi` }] : []),
        ],
        nota: 'O calendário da Finnhub. Passado o dia, o número divulgado chega e a marca fica no gráfico.',
      };
    }
    const itens = [
      ...(nomeTri(ev) ? [{ rotulo: 'Trimestre', valor: nomeTri(ev) }] : []),
      { rotulo: 'Lucro por ação', valor: `US$ ${num(ev.valor)}`, cor: COR_EVENTO.resultado },
      ...(ev.estimado ? [{ rotulo: 'Esperado', valor: `US$ ${num(ev.estimado)}` }, { rotulo: 'Surpresa', valor: pct(ev.valor / ev.estimado - 1, 1) }] : []),
      ...(ev.receita ? [{ rotulo: 'Receita', valor: `US$ ${num(ev.receita / 1e9, 1)} bi` }] : []),
    ];
    // a reação: no pregão seguinte (divulgado depois do fechamento) ou no mesmo (antes da abertura)
    const i = velas.findIndex((x) => x.d >= ev.data);
    const k0 = ev.hora === 'amc' ? i : i - 1;
    if (i >= 0 && k0 >= 0 && k0 + 1 < velas.length) itens.push({ rotulo: ev.hora === 'amc' ? 'No pregão seguinte' : 'No dia', valor: pct(velas[k0 + 1].c / velas[k0].c - 1) });
    return { titulo: `Resultado · ${formatDate(ev.data)}${quando}`, itens };
  };

  // ---- ao lado
  const ano = useMemo(() => {
    const desde = inicioDoPeriodo('1A', hoje);
    const v = velas.filter((x) => x.d >= desde);
    if (!v.length) return null;
    return v.reduce((m, x) => ({ min: Math.min(m.min, x.l), max: Math.max(m.max, x.h) }), { min: Infinity, max: -Infinity });
  }, [velas, hoje]);
  const volume = [...velas].reverse().find((x) => x.v)?.v ?? null;
  const k = emReais ? dolar ?? 0 : 1;
  const posPct = (v) => (ano ? Math.max(0, Math.min(100, ((v - ano.min) / (ano.max - ano.min || 1)) * 100)) : 0);
  const proxRes = proximoResultado(eventos, hoje);
  const ultimos = ultimosResultados(eventos);
  const divs = resumoDosDividendos(eventos, hoje, p.preco);
  const semLancar = desdobramentosSemOperacao(eventos, minhas);

  const tem = (t) => evs.some((m) => m.ev.tipo === t);
  const series = [
    { key: 'preco', rotulo: emReais ? 'Preço em reais' : usd ? 'Preço em dólar' : 'Preço', cor, forma: 'linha' },
    ...(verOps && !intradia ? [
      ...(minhas.some((o) => o.tipo === 'compra') ? [{ key: 'compra', rotulo: 'Compra', cor: COR_MARCA.compra }] : []),
      ...(minhas.some((o) => o.tipo === 'venda') ? [{ key: 'venda', rotulo: 'Venda', cor: COR_MARCA.venda }] : []),
    ] : []),
    ...(pmDe ? [{ key: 'pm', rotulo: 'Preço médio', cor: 'var(--origem-manual)', forma: 'tracejado' }] : []),
    ...(tem('dividendo') ? [{ key: 'dividendo', rotulo: `${LETRA_EVENTO.dividendo} · dividendo (data-ex)`, cor: COR_EVENTO.dividendo }] : []),
    ...(tem('resultado') || proximo ? [{ key: 'resultado', rotulo: `${LETRA_EVENTO.resultado} · resultado`, cor: COR_EVENTO.resultado }] : []),
    ...(tem('desdobramento') ? [{ key: 'desdobramento', rotulo: `${LETRA_EVENTO.desdobramento} · desdobramento`, cor: COR_EVENTO.desdobramento }] : []),
    ...(verVol && pontos.some((x) => x.v) ? [{ key: 'volume', rotulo: 'Volume', cor: 'color-mix(in srgb, var(--serie-entradas) 55%, transparent)' }] : []),
  ];

  const vazio = !intradia && !pontos.length;
  const carregandoTudo = !hist || (buscando && !velas.length) || (doInicio && !mensal);
  const interruptor = (rotulo, aria, valor, mudar) => (
    <span className="flex h-[24px] items-center gap-2 px-2">
      <button type="button" tabIndex={-1} aria-hidden="true" onClick={() => mudar(!valor)} className="whitespace-nowrap text-[12px] font-medium text-gray-600">{rotulo}</button>
      <Toggle compacto rotulo={aria} checked={valor} onChange={mudar} />
    </span>
  );
  const rodape = aviso ?? (eventos === null ? 'Sem a migration 031, o gráfico fica sem os dividendos e resultados.'
    : intradia ? 'De 5 em 5 minutos, buscado na hora (não fica guardado).'
      : doInicio ? `Um ponto por mês desde a estreia na bolsa, buscado na hora${usd && brl ? ' (em dólar: a PTAX de décadas não vem numa leitura)' : ''}.`
        : grupo === 'semana' ? 'Velas semanais: no período longo, uma vela por semana.' : grupo === 'mes' ? 'Velas mensais: no período longo, uma vela por mês.' : 'O fechamento e o volume de cada dia.');

  return (
      <div className="flex h-full min-h-0 flex-col">
        {/* o preço e a troca de aba */}
        <div className="flex shrink-0 flex-wrap items-center gap-x-3.5 gap-y-1.5 px-5 pb-1 pt-4">
          <span className="text-[24px] font-semibold tabular-nums tracking-[-0.02em] text-gray-900">{moeda(precoAgora)}</span>
          {variacaoDia !== null && <span className={`text-[13px] font-semibold tabular-nums ${corDe(variacaoDia)}`}>{antes ? `${precoAgora - antes >= 0 ? '+' : '−'}${num(Math.abs(precoAgora - antes))} ` : ''}({pct(variacaoDia)}) hoje</span>}
          {c?.cotado_em && <span className="text-[12px] text-gray-500">cotação de {formatDate(c.cotado_em.slice(0, 10))} {HORA_BR.format(new Date(c.cotado_em))}{usd && !emReais && dolar ? ` · em reais, ${formatBRL(Math.round(p.preco * dolar * 100))}` : ''}</span>}
          <span className="flex-1" />
          {!movel && <AbasPilula abas={[{ key: 'meu', label: 'Meu gráfico' }, { key: 'tv', label: 'Avançado' }]} valor={aba} onChange={setAba} altura={30} folga={2} />}
        </div>

        {aba === 'tv' ? (
          <div className="flex min-h-0 flex-1 flex-col px-5 pb-4 pt-3"><WidgetTradingView ativo={ativo} /></div>
        ) : (
          <>
            {/* A FAIXA DE DESEMPENHO É O PERÍODO: cada célula, quanto andou nele; clicada, troca o gráfico */}
            <div className="mx-5 mt-2.5 grid shrink-0 grid-cols-4 overflow-hidden rounded-[8px] border border-gray-200 bg-white sm:grid-cols-8" role="group" aria-label="O período do gráfico">
              {PERIODOS.map((x, i) => {
                const v = faixa[x.key];
                const sel = per === x.key;
                return (
                  <button key={x.key} type="button" aria-pressed={sel} onClick={() => setPer(x.key)}
                    className={`relative flex min-w-0 flex-col items-center gap-px px-1 pb-2 pt-1.5 transition-colors ${i % 4 ? 'border-l border-gray-100' : ''} ${i >= 4 ? 'border-t border-gray-100 sm:border-t-0' : ''} ${i === 4 ? 'sm:border-l' : ''} ${sel ? 'bg-gray-100' : 'hover:bg-gray-50'}`}>
                    <span className={`whitespace-nowrap text-[11.5px] ${sel ? 'font-semibold text-gray-900' : 'text-gray-600'}`}>{x.rotulo}</span>
                    <span className={`whitespace-nowrap text-[12.5px] font-semibold tabular-nums ${v === null || v === undefined ? 'text-gray-400' : corDe(v)}`}>{pctFaixa(v)}</span>
                    {sel && <span aria-hidden="true" className="absolute inset-x-0 bottom-0 h-[2px]" style={{ background: cor }} />}
                  </button>
                );
              })}
            </div>
            {/* as marcas e a forma */}
            <div className="flex shrink-0 flex-wrap items-center gap-2 px-5 pb-1 pt-2.5">
              {!movel && (
                <Trilho className="shrink-0">
                  {interruptor('Minhas operações', 'Mostrar as minhas operações no gráfico', verOps, setVerOps)}
                  <DivisorFaixa />
                  {interruptor('Preço médio', 'Mostrar o preço médio no gráfico', verPm, setVerPm)}
                  {eventos !== null && (<><DivisorFaixa />{interruptor('Dividendos e resultados', 'Mostrar os dividendos, os resultados e os desdobramentos', verEv, setVerEv)}</>)}
                  <DivisorFaixa />
                  {interruptor('Volume', 'Mostrar o volume de cada dia', verVol, setVerVol)}
                  {usd && (<><DivisorFaixa />{interruptor('Em R$', 'Mostrar o preço em reais, pelo dólar de cada dia', brl, setBrl)}</>)}
                </Trilho>
              )}
              <span className="flex-1" />
              <AbasPilula abas={[{ key: 'linha', label: 'Linha' }, { key: 'velas', label: 'Velas' }]} valor={tipo} onChange={setTipo} variante="claro" altura={30} folga={2} />
            </div>

            <div className={`mt-2 grid min-h-0 flex-1 grid-cols-1 overflow-auto border-t border-gray-100 ${movel ? '' : 'lg:grid-cols-[minmax(0,1fr)_256px] lg:overflow-visible'}`}>
              <div className="flex min-h-0 min-w-0 flex-col pr-1.5 pt-2.5">
                <div className={`relative min-h-[300px] ${movel ? 'h-[360px]' : 'h-[380px] lg:h-auto lg:flex-1'}`}>
                  {carregandoTudo || (intradia && !intra) ? (
                    <div className="flex h-full items-center justify-center text-[12.5px] text-gray-400">{buscando ? 'Buscando o histórico do ativo… (só na primeira vez)' : 'Carregando…'}</div>
                  ) : intradia && (intra?.erro || !pontos.length) ? (
                    <div className="flex h-full items-center justify-center px-6 text-center text-[12.5px] text-gray-400">{intra?.erro ? `O pregão de hoje não veio (${intra.erro}).` : 'Ainda sem negócios hoje.'}</div>
                  ) : doInicio && mensal?.erro ? (
                    <div className="flex h-full items-center justify-center px-6 text-center text-[12.5px] text-gray-400">Os meses desde a estreia não vieram ({mensal.erro}).</div>
                  ) : vazio ? (
                    <div className="flex h-full items-center justify-center px-6 text-center text-[12.5px] text-gray-400">Sem preços neste período{aviso ? '' : ' ainda'}. {velas.length ? 'Tente um período maior.' : ''}</div>
                  ) : (
                    <GraficoAtivo pontos={pontos} tipo={doInicio ? 'linha' : tipo} per={per} sessao={sessao} anterior={anterior} pmDe={pmDe} marcas={marcas}
                      eventos={evs} proximo={proximo} comEventos={verEv && eventos !== null && !intradia} volume={verVol}
                      op={ctrl.opSerie} cor={cor} balaoDe={balaoDe} balaoDoEvento={balaoDoEvento} />
                  )}
                </div>
                {!carregandoTudo && !vazio && <LegendaSeries series={series} ctrl={ctrl} className="mx-4 mb-2 mt-1" />}
              </div>
              <aside className={`flex flex-col gap-4 bg-white px-4 py-3 text-[12px] tabular-nums ${movel ? 'border-t border-gray-100' : 'border-t border-gray-100 lg:overflow-auto lg:border-l lg:border-t-0'}`}>
                {semLancar.length > 0 && (
                  <div className="rounded-[6px] border border-amber-200 bg-amber-50 px-3 py-2 text-[11.5px] leading-[16px] text-amber-800">
                    {semLancar.map((e) => <p key={e.data} className="m-0">A empresa {Number(e.valor) < 1 ? 'grupou' : 'desdobrou'} as ações em {formatDate(e.data)} (cada cota virou {Number(e.valor) < 1 ? `1/${num(1 / Number(e.valor), 0)}` : num(e.valor, Number(e.valor) % 1 ? 2 : 0)}) e isso não está lançado: a sua quantidade de cotas fica errada.</p>)}
                    {onOperar && <button type="button" className="mt-1 font-semibold underline decoration-dotted underline-offset-2 hover:text-amber-900" onClick={() => onOperar(ativo, 'desdob')}>Lançar o desdobramento</button>}
                  </div>
                )}
                {deFora ? (
                  <div className="flex flex-col gap-1.5 rounded-[6px] border border-gray-200 bg-hx-f9fafb px-3 py-2.5 text-[12px] leading-[17px] text-gray-600">
                    <span><b className="font-semibold text-gray-900">{ativo.ticker}</b> não está no seu cadastro: o gráfico vem na hora, sem guardar.</span>
                    {onCadastrar && (
                      <span className="flex flex-wrap gap-1.5">
                        <button type="button" className="btn-secondary !h-[28px] !px-2.5 !text-[12px]" onClick={() => onCadastrar(ativo, false)}>Cadastrar</button>
                        <button type="button" className="btn-secondary !h-[28px] !px-2.5 !text-[12px]" onClick={() => onCadastrar(ativo, true)}>Cadastrar e lançar uma compra</button>
                      </span>
                    )}
                  </div>
                ) : <Bloco titulo="Sua posição">
                  {p.quantidade > 0 ? (<>
                    <Linha r="Cotas" v={<b className="font-semibold text-gray-900">{p.quantidade.toLocaleString('pt-BR', { maximumFractionDigits: 6 })}</b>} />
                    <Linha r="Preço médio" v={usd && !emReais ? `US$ ${num(p.precoMedio)}` : formatBRL(Math.round((usd ? p.custoMedioReais : p.precoMedio) * 100))} />
                    <Linha r="Vale hoje" v={<b className="font-semibold text-gray-900">{formatBRL(Math.round(p.valorReais))}</b>} />
                    {usd && <Linha r="Em dólar" v={`US$ ${num(p.valorMoeda / 100)}`} />}
                    <Linha r="Resultado" v={<span className={corDe(p.resultado)}>{p.resultado >= 0 ? '+' : '−'}{formatBRL(Math.round(Math.abs(p.resultado)))} · {pct(p.resPct, 1)}</span>} />
                  </>) : <p className="text-gray-400">Nenhuma cota agora.{onOperar && <> <button type="button" className="font-medium text-gray-600 underline decoration-dotted underline-offset-2 hover:text-gray-900" onClick={() => onOperar(ativo, 'compra')}>Lançar uma compra</button></>}</p>}
                </Bloco>}
                <Bloco titulo="Hoje">
                  <Linha r="Abertura" v={c?.abertura ? num(Number(c.abertura) * k) : '—'} />
                  <Linha r="Máxima" v={c?.maxima ? num(Number(c.maxima) * k) : '—'} />
                  <Linha r="Mínima" v={c?.minima ? num(Number(c.minima) * k) : '—'} />
                  <Linha r="Fechamento anterior" v={antes ? num(antes) : '—'} />
                  {volume ? <Linha r="Volume" v={volumeCurto(volume)} /> : null}
                </Bloco>
                {proxRes && (
                  <div>
                    <h5 className="mb-1 flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-wide text-gray-400"><Letra tipo="resultado" />Próximo resultado</h5>
                    <div className="flex flex-col gap-px rounded-[6px] border border-gray-200 bg-hx-f9fafb px-2.5 py-2">
                      <b className="font-semibold text-gray-900">{formatDate(proxRes.data)}{QUANDO[proxRes.hora] ? ` · ${QUANDO[proxRes.hora]}` : ''}</b>
                      {proxRes.estimado && <span className="text-gray-700">esperado US$ {num(proxRes.estimado)} por ação</span>}
                      <span className="text-[11px] text-gray-500">{[proxRes.receita_estimada ? `receita esperada US$ ${num(proxRes.receita_estimada / 1e9, 1)} bi` : '', nomeTri(proxRes)].filter(Boolean).join(' · ')}</span>
                      <span className="text-[11px] text-gray-500">em {Math.round((Date.parse(`${proxRes.data}T12:00:00Z`) - Date.parse(`${hoje}T12:00:00Z`)) / DIA_MS)} dias</span>
                    </div>
                  </div>
                )}
                {ultimos.length > 0 && (
                  <div>
                    <h5 className="mb-1 text-[10.5px] font-semibold uppercase tracking-wide text-gray-400">Últimos resultados</h5>
                    <table className="w-full border-collapse text-[11.5px]">
                      <thead><tr className="text-[10px] uppercase tracking-wide text-gray-400">
                        <th className="pb-1 text-left font-semibold">Tri</th><th className="pb-1 text-right font-semibold">Esperado</th><th className="pb-1 text-right font-semibold">Saiu</th><th className="pb-1 text-right font-semibold">Surpresa</th>
                      </tr></thead>
                      <tbody>
                        {ultimos.map((r) => (
                          <tr key={`${r.ano}-${r.trimestre}-${r.data}`} className="border-t border-gray-100">
                            <td className="py-0.5 text-gray-700">{r.trimestre && r.ano ? `${r.trimestre}ºT${String(r.ano).slice(2)}` : formatDate(r.data)}</td>
                            <td className="py-0.5 text-right text-gray-700">{r.estimado ? num(r.estimado) : '—'}</td>
                            <td className="py-0.5 text-right text-gray-900">{num(r.valor)}</td>
                            <td className={`py-0.5 text-right ${r.estimado ? corDe(r.valor - r.estimado) : 'text-gray-400'}`}>{r.estimado ? pct(r.valor / r.estimado - 1, 1) : '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <p className="mt-1 text-[11px] text-gray-400">lucro por ação, em US$ (Finnhub)</p>
                  </div>
                )}
                {divs && (
                  <div>
                    <h5 className="mb-1 flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-wide text-gray-400"><Letra tipo="dividendo" />Dividendos</h5>
                    <dl className="grid grid-cols-[auto_1fr] gap-x-2.5 gap-y-0.5">
                      <Linha r="Último" v={`${siglaAtivo} ${num(divs.ultimo.valor, casasDiv(divs.ultimo.valor))} · ${formatDate(divs.ultimo.data).slice(0, 5)}`} />
                      <Linha r="Em 12 meses" v={`${siglaAtivo} ${num(divs.em12, casasDiv(divs.em12))} por ação`} />
                      {divs.rendimento !== null && <Linha r="Rendimento" v={`${num(divs.rendimento * 100, 2)}% ao ano`} />}
                      {p.proventos12 > 0 && <Linha r="Você recebeu (12m)" v={<span className="text-green-700">{formatBRL(Math.round(p.proventos12))}</span>} />}
                    </dl>
                  </div>
                )}
                {ano && (
                  <Bloco titulo="52 semanas">
                    <div className="relative mb-1 mt-2 h-[6px] rounded-full bg-gray-200">
                      {p.precoMedio && <Tooltip label="O seu preço médio"><span className="absolute -top-[3px] h-[12px] border-l-2 border-dashed border-gray-400" style={{ left: `${posPct(p.precoMedio)}%` }} /></Tooltip>}
                      <span className="absolute -top-[4px] h-[14px] w-[2px] rounded-[1px] bg-gray-800" style={{ left: `calc(${posPct(p.preco ?? 0)}% - 1px)` }} />
                    </div>
                    <div className="flex justify-between text-[11px] text-gray-500"><span>{num(ano.min * k)}</span><span>{num(ano.max * k)}</span></div>
                    <p className="mt-1 text-[11px] leading-[15px] text-gray-400">a barra é o preço de hoje{p.precoMedio ? '; o tracejado, o seu preço médio' : ''}</p>
                  </Bloco>
                )}
              </aside>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1 border-t border-gray-100 bg-hx-fafbfc px-5 py-2 text-[11.5px] text-gray-500">
              <span>{rodape}</span>
              <span className="flex-1" />
              <span>Fonte: <b className="font-semibold text-gray-700">Yahoo Finance</b> (o histórico, os dividendos){c?.fonte ? <> e <b className="font-semibold text-gray-700">{c.fonte === 'finnhub' ? 'Finnhub' : 'brapi'}</b> (a cotação{usd ? ', os resultados' : ''})</> : ''}</span>
            </div>
          </>
        )}
      </div>
  );
}

// A AÇÃO FORA DO CADASTRO: lê tudo na função e monta a posição vazia (a cotação de agora; sem ela, o último fechamento)
function ConteudoDeFora({ alvo, dolar, hoje, ptax, onCadastrar, aoCarregar }) {
  const [dados, setDados] = useState(null);
  useEffect(() => {
    let vivo = true;
    acaoDeFora(alvo.ticker, alvo.mercado).then((r) => { if (vivo) setDados(r ?? { erro: 'sem resposta' }); });
    return () => { vivo = false; };
  }, [alvo.ticker, alvo.mercado]);
  const nome = alvo.nome || dados?.nome || ''; // o da busca (o nome completo do Yahoo) vale sobre o da cotação
  useEffect(() => { if (dados && !dados.erro && nome) aoCarregar?.(nome); }, [dados, nome, aoCarregar]);
  if (!dados) return <div className="flex h-full items-center justify-center text-[12.5px] text-gray-400">Buscando {alvo.ticker} no Yahoo… (fora do cadastro, vem na hora)</div>;
  if (dados.erro || !dados.fechamentos?.length) return <div className="flex h-full items-center justify-center px-6 text-center text-[12.5px] text-gray-400">{alvo.ticker} não veio ({dados.erro ?? 'sem histórico'}).</div>;
  const tipo = TIPOS[alvo.tipo] ? alvo.tipo : alvo.mercado === 'EUA' ? 'acao_eua' : 'acao_br';
  const ativo = { id: `fora:${alvo.mercado}:${alvo.ticker}`, ticker: alvo.ticker, nome, tipo, mercado: TIPOS[tipo].mercado, moeda: TIPOS[tipo].moeda, corretora: '' };
  const f = dados.fechamentos;
  const ult = f[f.length - 1]; const ant = f[f.length - 2];
  const cotacao = dados.cotacao?.preco ? dados.cotacao : {
    preco: ult.preco, fechamento_anterior: ant?.preco ?? null, variacao_dia: ant ? ult.preco / ant.preco - 1 : null,
    abertura: ult.abertura, maxima: ult.maxima, minima: ult.minima, cotado_em: `${ult.data}T21:00:00Z`, fonte: 'yahoo',
  };
  const posicao = posicaoDoAtivo(ativo, [], { cotacao, dolar, hoje });
  return <ConteudoAtivo posicao={posicao} operacoes={[]} ptax={ptax} dolar={dolar} hoje={hoje} pronto={{ linhas: f, eventos: dados.eventos ?? [] }} deFora onCadastrar={onCadastrar} />;
}

// O PAINEL: `alvo` = { ativoId } (cadastrado) | { ticker, mercado, nome, tipo } (de fora) | null (escolher); `abrirSeletor`:
// abre já com o seletor (o "Ver o gráfico de uma ação…" do ▾). `posicoes`: a carteira (os cadastrados, para o seletor).
export default function PainelAtivo({ alvo: alvoInicial, posicoes, operacoes, ptax, dolar, hoje, onClose, onOperar, onCadastrar, abrirSeletor = false }) {
  const movel = useNoCelular();
  const [alvo, setAlvo] = useState(alvoInicial ?? null);
  const [seletor, setSeletor] = useState(abrirSeletor || !alvoInicial);
  const [cheio, setCheio] = useState(false);
  const [nomeDeFora, setNomeDeFora] = useState('');
  const [ancora, setAncora] = useState(null); // o botão do título (estado, não ref: o seletor que abre junto precisa dele já no 1º quadro)
  const posicao = alvo?.ativoId ? posicoes.find((x) => x.ativo.id === alvo.ativoId) : null;
  const ativo = posicao?.ativo ?? (alvo && !alvo.ativoId ? { ticker: alvo.ticker, nome: nomeDeFora || alvo.nome, tipo: alvo.tipo, mercado: alvo.mercado, corretora: '' } : null);
  const cor = ativo ? CLASSES.find((c) => c.id === classeDoTipo(ativo.tipo))?.cor : null;
  const fecharSeletor = useCallback(() => setSeletor(false), []);
  const escolher = (it) => {
    setSeletor(false);
    if (it.ativoId) setAlvo({ ativoId: it.ativoId });
    else { lembrarVista(it); setNomeDeFora(''); setAlvo({ ticker: it.ticker, mercado: it.mercado, nome: it.nome, tipo: it.tipo }); }
  };
  const chave = alvo ? (alvo.ativoId ?? `${alvo.mercado}:${alvo.ticker}`) : 'nada';
  const titulo = (
    <button ref={setAncora} type="button" onClick={() => setSeletor((x) => !x)} aria-expanded={seletor} aria-haspopup="dialog"
      className="-ml-1.5 inline-flex max-w-full items-center gap-2 rounded-[6px] px-1.5 py-0.5 text-left transition-colors hover:bg-gray-100 aria-expanded:bg-gray-100">
      {cor && <span aria-hidden="true" className="h-[18px] w-[3px] shrink-0 rounded-[2px]" style={{ background: cor }} />}
      <span className="truncate">{ativo ? <><b className="font-semibold text-gray-900">{ativo.ticker}</b>{ativo.nome ? <span className="font-medium text-gray-600"> · {ativo.nome}</span> : null}</> : <span className="text-gray-500">Escolha uma ação</span>}</span>
      <svg viewBox="0 0 24 14" width="10" height="6" fill="currentColor" aria-hidden="true" className={`shrink-0 text-gray-500 transition-transform duration-200 ease-out ${seletor ? 'rotate-180' : ''}`}><path d="M1.5 2h21L12 12.5z" /></svg>
    </button>
  );
  const subtitulo = ativo ? `${nomeDoTipo(ativo.tipo)} · ${ativo.mercado === 'EUA' ? 'EUA' : 'B3'}${ativo.corretora ? ` · ${ativo.corretora}` : ''}${posicao ? '' : ' · fora do cadastro'} · clique no nome para trocar` : 'Procure pelo ticker ou pelo nome da empresa';
  const acoes = (
    <Tooltip label={cheio ? 'Sair da tela cheia' : 'Tela cheia'}>
      <button type="button" onClick={() => setCheio((x) => !x)} aria-label={cheio ? 'Sair da tela cheia' : 'Tela cheia'} className={BTN_ICONE}>
        {cheio ? <IconMinimize className="h-3.5 w-3.5" /> : <IconMaximize className="h-3.5 w-3.5" />}
      </button>
    </Tooltip>
  );
  return (
    <Modal open onClose={onClose} title={titulo} rotulo={ativo ? `O gráfico de ${ativo.ticker}` : 'O gráfico de uma ação'} subtitulo={subtitulo}
      acoes={acoes} alturaCheia animarTamanho padding="p-0" fecharNoBackdrop={!seletor}
      maxWidth={cheio ? 'max-w-[96vw]' : 'max-w-[min(1280px,95vw)]'} altura={cheio ? 'h-[94vh]' : 'h-[90vh]'}>
      {posicao ? (
        <ConteudoAtivo key={chave} posicao={posicao} operacoes={operacoes} ptax={ptax} dolar={dolar} hoje={hoje} onOperar={onOperar} />
      ) : alvo && !alvo.ativoId ? (
        <ConteudoDeFora key={chave} alvo={alvo} dolar={dolar} hoje={hoje} ptax={ptax} aoCarregar={setNomeDeFora}
          onCadastrar={movel ? null : onCadastrar} />
      ) : (
        <div className="flex h-full items-center justify-center px-6 text-center text-[12.5px] text-gray-400">Procure uma ação pelo ticker ou pelo nome da empresa: a da carteira ou qualquer uma das bolsas dos EUA e da B3.</div>
      )}
      {seletor && ancora && (
        <SeletorAtivo ancora={ancora} posicoes={posicoes} atual={ativo} onEscolher={escolher}
          onFechar={() => { fecharSeletor(); if (!alvo) onClose(); }} />
      )}
    </Modal>
  );
}

const Bloco = ({ titulo, children }) => (
  <div>
    <h5 className="mb-1 text-[10.5px] font-semibold uppercase tracking-wide text-gray-400">{titulo}</h5>
    <dl className="grid grid-cols-[auto_1fr] gap-x-2.5 gap-y-0.5">{children}</dl>
  </div>
);
const Linha = ({ r, v }) => (<><dt className="text-gray-500">{r}</dt><dd className="m-0 text-right text-gray-700">{v}</dd></>);
// a letra do evento num círculo de 14 × 14 px, desenhada em SVG: no HTML a letra sentava pela linha de base da caixa de texto
// (a meia-entrelinha) e ficava baixa; aqui a linha de base vai onde a maiúscula fica no centro — 10,5 MEDIDO com a Inter
// Variable em negrito a 9px (o `measureText` da letra: o meio dela em 7,0, o centro do círculo)
const Letra = ({ tipo }) => (
  <svg aria-hidden="true" width="14" height="14" viewBox="0 0 14 14" className="inline-block shrink-0 align-[-2px]">
    <circle cx="7" cy="7" r="7" style={{ fill: COR_EVENTO[tipo] }} />
    <text x="7" y="10.5" textAnchor="middle" fontSize="9" fontWeight="700" fill="#fff">{LETRA_EVENTO[tipo]}</text>
  </svg>
);

// a frase de uma operação no balão do gráfico
function textoDaOperacao(o, { usd, emReais, sigla }) {
  const q = Number(o.quantidade ?? 0).toLocaleString('pt-BR', { maximumFractionDigits: 6 });
  const cotas = Number(o.quantidade) === 1 ? 'cota' : 'cotas';
  const preco = precoDaOperacao(o);
  const k = usd && emReais ? Number(o.dolar ?? 0) : 1;
  const valor = (v) => `${sigla} ${num(v)}`;
  if (o.tipo === 'compra') return <>▲ <b className="font-semibold text-gray-800">Compra</b> de {q} {cotas} a {valor(preco * k)}</>;
  return <>▼ <b className="font-semibold text-gray-800">Venda</b> de {q} {cotas} a {valor(preco * k)}</>;
}
// a frase de um evento no balão do dia
function textoDoEvento(e, sigla) {
  if (e.tipo === 'dividendo') return <><Letra tipo="dividendo" /> <b className="font-semibold text-gray-800">Data-ex</b> do dividendo de {sigla} {num(e.valor, casasDiv(e.valor))} por ação</>;
  if (e.tipo === 'desdobramento') return <><Letra tipo="desdobramento" /> <b className="font-semibold text-gray-800">{Number(e.valor) < 1 ? 'Grupamento' : 'Desdobramento'}</b> · cada cota virou {num(e.valor, Number(e.valor) % 1 ? 2 : 0)}</>;
  return <><Letra tipo="resultado" /> <b className="font-semibold text-gray-800">Resultado</b>{e.valor !== null && e.valor !== undefined ? `: US$ ${num(e.valor)} por ação${e.estimado ? ` (${pct(e.valor / e.estimado - 1, 1)} do esperado)` : ''}` : ''}</>;
}
