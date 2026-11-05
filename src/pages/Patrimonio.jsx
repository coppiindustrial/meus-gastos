import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import CabecalhoPagina from '../components/CabecalhoPagina.jsx';
import ListaVazia from '../components/ListaVazia.jsx';
import Tooltip from '../components/Tooltip.jsx';
import MenuContexto from '../components/MenuContexto.jsx';
import { PageLoading } from '../components/Spinner.jsx';
import { IconSeta } from '../components/icons.jsx';
import { CartaoKpi } from '../components/graficos/CartoesResumo.jsx';
import { COR_ENTRADAS } from '../components/graficos/Graficos.jsx';
import GraficoPatrimonio, { cdiFechado } from '../components/patrimonio/GraficoPatrimonio.jsx';
import BlocoInvestimentos, { CORES_CONTA } from '../components/patrimonio/TabelaInvestimentos.jsx';
import { ModalConta, ModalInvestimento, ModalMovimento, ModalRegistrar } from '../components/patrimonio/ModaisPatrimonio.jsx';
import { useNoCelular } from '../lib/celular.js';
import { varCor } from '../lib/varCor.js';
import { useToast } from '../context/ToastContext.jsx';
import { listarContas, listarMovimentos, listarSaldos } from '../api/patrimonio.js';
import { listarInvestimentos } from '../api/investimentos.js';
import { cdiMensal } from '../api/cdi.js';
import { rendimentoDasSeries, rendimentoDoPeriodo, seriesDoPatrimonio } from '../lib/patrimonio.js';
import { carteira, linhaMesAMes, mesesDaGrade, nomeTipoInvestimento, rotuloLiquidez, rotuloRende } from '../lib/investimentos.js';
import { variacao } from '../lib/visaoGeral.js';
import { exportCsv } from '../lib/exportCsv.js';
import { brlCurto, formatBRL } from '../lib/dinheiro.js';
import { competenciaAtual, competenciaCurta, todayISO } from '../lib/format.js';

// PATRIMÔNIO E RENDIMENTO (fase 8 do plano "Patrimônio e rentabilidade"): as contas e, dentro delas, os INVESTIMENTOS
// (migration 014, 05/11/2026 — o desenho aprovado "Investimentos no Patrimônio" e a opção A do mockup "Patrimônio · a
// tabela", com a B como segunda vista). Cada título tem o valor de cada data (a foto) e os aportes e resgates dele; o
// rendimento é a diferença (`rendimentoDasSeries` em lib/patrimonio.js; a carteira em lib/investimentos.js, as duas
// testadas). A conta sem investimento cadastrado segue pelas fotos dela (as de antes ficam como histórico).
//   · Os números: o patrimônio, o que rendeu no último mês com duas fotos, o do ano e a liquidez diária (o
//     CartaoKpi da Visão geral, com a curva dos meses).
//   · O gráfico: quanto do patrimônio é aportado e quanto rendeu; o % de cada mês contra o CDI (Banco Central).
//   · A tabela: a carteira agrupada por conta (ou o mês a mês). O "+ aporte" da linha, o ✎ do título e o da conta.
// Sem a migration 014, a tela segue só com as contas e avisa; sem a 013, também sem o rendimento.

const COR_LIQUIDEZ = varCor('#ca8a04', 'texto');
const pctTexto = (f, casas = 2) => (f === null || f === undefined ? '—' : `${(f * 100).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas })}%`);
const doCdi = (p, c) => (p !== null && p !== undefined && c > 0 ? `${Math.round((p / c) * 100)}% do CDI` : null);
const ICONE = 'flex h-9 items-center justify-center text-gray-600 transition-colors hover:bg-gray-50 active:bg-gray-200';

export default function Patrimonio() {
  const toast = useToast();
  const movel = useNoCelular();
  const [contas, setContas] = useState(null);
  const [saldos, setSaldos] = useState([]);
  const [movimentos, setMovimentos] = useState([]); // null = falta a migration 013
  const [dadosInv, setDadosInv] = useState(null); // null = falta a migration 014
  const [cdi, setCdi] = useState(null);
  const [encerrados, setEncerrados] = useState(false);
  // os pop-ups (podem empilhar: o aporte por cima do "Registrar o mês", o investimento novo por cima do aporte)
  const [registrar, setRegistrar] = useState(false);
  const [mov, setMov] = useState(null); // { inv?, conta?, tipo }
  const [invModal, setInvModal] = useState(null); // { inv?, conta?, aoCriar? }
  const [contaModal, setContaModal] = useState(null); // { conta? }
  const [mais, setMais] = useState(null);
  const maisAberto = useRef(false);

  const carregar = useCallback(async () => {
    try {
      const [c, s, m, i] = await Promise.all([listarContas(), listarSaldos(), listarMovimentos(), listarInvestimentos()]);
      setContas(c); setSaldos(s); setMovimentos(m); setDadosInv(i);
    } catch (err) { toast.error(err.message); setContas([]); }
  }, [toast]);
  useEffect(() => { carregar(); }, [carregar]);

  const hoje = competenciaAtual();
  const hojeISO = todayISO();
  const anoAtual = hoje.slice(0, 4);
  const comMovimentos = movimentos !== null;
  const comInvestimentos = dadosInv !== null;
  const investimentos = dadosInv?.investimentos ?? [];
  const valores = dadosInv?.valores ?? [];
  const meses = useMemo(() => rendimentoDasSeries(seriesDoPatrimonio({ saldos, movimentos: movimentos ?? [], investimentos, valores }), hoje),
    [saldos, movimentos, investimentos, valores, hoje]);
  const primeiroMes = meses[0]?.competencia;
  useEffect(() => { if (primeiroMes) cdiMensal(primeiroMes).then(setCdi); }, [primeiroMes]);

  const grupos = useMemo(() => (contas ? carteira({ contas, investimentos, meses, hoje: hojeISO, ano: anoAtual, encerrados })
    .map((g, i) => ({ ...g, cor: CORES_CONTA[i % CORES_CONTA.length] })) : []), [contas, investimentos, meses, hojeISO, anoAtual, encerrados]);
  const qtdEncerrados = grupos.reduce((s, g) => s + g.encerradosOcultos, 0) || (encerrados ? investimentos.filter((i) => i.ativo === false).length : 0);
  const comps = useMemo(() => mesesDaGrade(meses, hoje), [meses, hoje]);

  const atual = meses[meses.length - 1];
  const anterior = meses.length > 1 ? meses[meses.length - 2] : null;
  // O MÊS DE REFERÊNCIA: o último com duas fotos para comparar (no começo do mês, o atual ainda não tem a sua).
  const ref = comMovimentos ? [...meses].reverse().find((m) => m.rendeu !== null) ?? null : null;
  const doAno = meses.filter((m) => m.competencia.startsWith(anoAtual));
  const ano = comMovimentos ? rendimentoDoPeriodo(doAno) : { rendeu: null, pct: null, meses: 0 };
  const fechados = doAno.filter((m) => m.competencia < hoje && m.pct !== null && cdi?.[m.competencia] !== undefined);
  const cdiAno = fechados.length ? fechados.reduce((f, m) => f * (1 + cdi[m.competencia]), 1) - 1 : null;
  const pctAnoFechado = fechados.length ? fechados.reduce((f, m) => f * (1 + m.pct), 1) - 1 : null;
  const grafico = meses.slice(-12);
  const total = useMemo(() => ({
    aplicado: grupos.reduce((s, g) => s + g.aplicado, 0), vale: grupos.reduce((s, g) => s + g.vale, 0),
    rendeu: grupos.reduce((s, g) => s + g.rendeu, 0), pctAno: ano.pct,
  }), [grupos, ano.pct]);
  // A LIQUIDEZ DIÁRIA: os títulos que se resgatam quando quiser e as contas correntes sem investimento.
  const liquidas = useMemo(() => grupos.flatMap((g) => (g.soConta ? (g.conta.tipo === 'corrente' ? [`c:${g.conta.id}`] : []) : g.itens.filter((x) => x.diaria).map((x) => `i:${x.inv.id}`))), [grupos]);
  const liquidez = (m) => liquidas.reduce((s, id) => s + (m?.porSerie[id]?.presente ? m.porSerie[id].saldo : 0), 0);
  const aportadoAno = (movimentos ?? []).filter((m) => m.data.startsWith(anoAtual))
    .reduce((s, m) => ({ ...s, [m.tipo]: s[m.tipo] + Number(m.valor_centavos) }), { aporte: 0, resgate: 0 });

  const fechar = () => { setRegistrar(false); setMov(null); setInvModal(null); setContaModal(null); };
  const acoes = movel ? null : {
    podeInvestir: comInvestimentos,
    movimento: comMovimentos ? (x) => setMov(x) : () => toast.error('Falta aplicar a migration 013 (aportes e resgates).'),
    novoInvestimento: comInvestimentos ? (conta) => setInvModal({ conta }) : () => toast.error('Falta aplicar a migration 014 (investimentos).'),
    editarInvestimento: (inv) => setInvModal({ inv }),
    editarConta: (conta) => setContaModal({ conta }),
  };

  const exportar = (vista, modo) => {
    if (vista === 'mes') {
      const linhas = grupos.flatMap((g) => [
        { nome: g.conta.nome, nivel: 'conta', l: linhaMesAMes(meses, comps, (m) => m.porConta[g.conta.id]) },
        ...g.itens.map((x) => ({ nome: x.inv.nome, nivel: g.conta.nome, l: linhaMesAMes(meses, comps, (m) => m.porSerie[`i:${x.inv.id}`]) })),
      ]);
      exportCsv(`rendimento-mes-a-mes-${modo === 'pct' ? 'pct' : 'reais'}`, linhas, [
        { key: 'nome', label: 'Investimento' },
        { key: 'nivel', label: 'Conta' },
        ...comps.map((c) => ({ key: c, label: competenciaCurta(c), tipo: modo === 'pct' ? 'numero' : 'dinheiro', map: (r) => (r.l.porMes[c] ? (modo === 'pct' ? (r.l.porMes[c].pct ?? 0) * 100 : r.l.porMes[c].rendeu / 100) : null) })),
        { key: 'total', label: modo === 'pct' ? 'No período (%)' : 'Total', tipo: modo === 'pct' ? 'numero' : 'dinheiro', map: (r) => (r.l.total === null ? null : modo === 'pct' ? r.l.pct * 100 : r.l.total / 100) },
      ]);
      return;
    }
    const linhas = grupos.flatMap((g) => (g.soConta ? [{ g, x: null }] : g.itens.map((x) => ({ g, x }))));
    exportCsv('investimentos', linhas, [
      { key: 'conta', label: 'Conta', map: (r) => r.g.conta.nome },
      { key: 'nome', label: 'Investimento', map: (r) => r.x?.inv.nome ?? '(a conta inteira)' },
      { key: 'tipo', label: 'Tipo', map: (r) => (r.x ? nomeTipoInvestimento(r.x.inv.tipo) : '') },
      { key: 'rende', label: 'Rende', map: (r) => (r.x ? rotuloRende(r.x.inv) : '') },
      { key: 'liquidez', label: 'Liquidez', map: (r) => (r.x ? rotuloLiquidez(r.x.inv) : '') },
      { key: 'vencimento', label: 'Vencimento', tipo: 'data', map: (r) => r.x?.inv.vencimento ?? '' },
      { key: 'emissor', label: 'Emissor', map: (r) => r.x?.inv.emissor ?? '' },
      { key: 'aplicado', label: 'Aplicado', tipo: 'dinheiro', map: (r) => (r.x ?? r.g).aplicado / 100 },
      { key: 'vale', label: 'Vale hoje', tipo: 'dinheiro', map: (r) => (r.x ?? r.g).vale / 100 },
      { key: 'rendeu', label: 'Rendeu', tipo: 'dinheiro', map: (r) => (r.x ?? r.g).rendeu / 100 },
      { key: 'pct', label: 'Rendeu (%)', tipo: 'numero', map: (r) => ((r.x ?? r.g).pct === null ? null : (r.x ?? r.g).pct * 100) },
      { key: 'ano', label: `Em ${anoAtual} (%)`, tipo: 'numero', map: (r) => ((r.x ?? r.g).pctAno === null ? null : (r.x ?? r.g).pctAno * 100) },
    ]);
  };
  const abrirMais = (el) => {
    const r = el.getBoundingClientRect();
    setMais({ x: r.right - 250, y: r.bottom + 4, titulo: 'Mais ações', itens: [
      { rotulo: 'Nova conta', sub: 'corrente, corretora, reserva…', onEscolher: () => setContaModal({}) },
      { rotulo: 'Exportar a carteira (CSV)', sub: 'cada investimento, aplicado, vale e rendeu', desabilitado: !grupos.length, onEscolher: () => exportar('carteira') },
    ] });
  };

  if (!contas) return (<div><CabecalhoPagina titulo="Patrimônio" /><PageLoading /></div>);
  const temAtiva = contas.some((c) => c.ativa);
  const qtdInv = investimentos.filter((i) => i.ativo !== false).length;

  const kpis = (
    <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
      <CartaoKpi compacto icone="patrimonio" cor="var(--serie-gastos)" rotulo="Patrimônio" valor={formatBRL(atual?.total ?? 0)} valorCurto={brlCurto(atual?.total ?? 0)}
        variacao={anterior ? variacao(atual.total, anterior.total) : null} tituloVariacao="sobre o mês anterior"
        sub={anterior ? `${atual.total - anterior.total >= 0 ? '+' : '−'}${brlCurto(Math.abs(atual.total - anterior.total))} no mês` : 'o primeiro mês registrado'}
        serie={grafico.map((m) => ({ competencia: m.competencia, valor: m.total }))} />
      <CartaoKpi compacto icone="entradas" cor={COR_ENTRADAS} rotulo={ref ? `Rendeu em ${competenciaCurta(ref.competencia)}` : 'Rendeu no mês'}
        valor={ref ? formatBRL(ref.rendeu) : '—'} valorCurto={ref ? brlCurto(ref.rendeu) : '—'} corValor={ref?.rendeu < 0 ? 'text-hx-c0393d' : 'text-green-700'}
        sub={ref ? [pctTexto(ref.pct), doCdi(ref.pct, cdiFechado(cdi, ref.competencia))].filter(Boolean).join(' · ') : comMovimentos ? 'precisa de duas fotos' : 'precisa da migration 013'}
        serie={comMovimentos ? grafico.map((m) => ({ competencia: m.competencia, valor: m.rendeu ?? 0 })) : []}
        nota={(i) => (grafico[i]?.pct !== null && grafico[i]?.pct !== undefined ? pctTexto(grafico[i].pct) : 'sem duas fotos')} />
      <CartaoKpi compacto icone="tendencia" cor={COR_ENTRADAS} rotulo={`Rendeu em ${anoAtual}`}
        valor={ano.rendeu !== null ? formatBRL(ano.rendeu) : '—'} valorCurto={ano.rendeu !== null ? brlCurto(ano.rendeu) : '—'} corValor={ano.rendeu < 0 ? 'text-hx-c0393d' : 'text-green-700'}
        sub={ano.rendeu !== null ? [pctTexto(ano.pct), cdiAno ? doCdi(pctAnoFechado, cdiAno) : null, `${ano.meses} ${ano.meses === 1 ? 'mês' : 'meses'}`].filter(Boolean).join(' · ') : comMovimentos ? 'nenhum mês com duas fotos' : 'precisa da migration 013'}
        serie={doAno.map((m, i) => ({ competencia: m.competencia, valor: doAno.slice(0, i + 1).reduce((s, x) => s + (x.rendeu ?? 0), 0) }))} />
      {qtdInv > 0 ? (
        <CartaoKpi compacto icone="liquidez" cor={COR_LIQUIDEZ} rotulo="Liquidez diária" valor={formatBRL(liquidez(atual))} valorCurto={brlCurto(liquidez(atual))}
          sub={atual?.total ? `${Math.round((liquidez(atual) / atual.total) * 100)}% do patrimônio · resgata quando quiser` : '—'}
          serie={grafico.map((m) => ({ competencia: m.competencia, valor: liquidez(m) }))} />
      ) : (
        <CartaoKpi compacto icone="saldo" cor={COR_LIQUIDEZ} rotulo={`Aportado em ${anoAtual}`}
          valor={comMovimentos ? formatBRL(aportadoAno.aporte - aportadoAno.resgate) : '—'} valorCurto={comMovimentos ? brlCurto(aportadoAno.aporte - aportadoAno.resgate) : '—'}
          sub={comMovimentos ? `${brlCurto(aportadoAno.aporte)} aportados · ${brlCurto(aportadoAno.resgate)} resgatados` : 'precisa da migration 013'} />
      )}
    </div>
  );

  const aviso = !comInvestimentos ? (
    <p className="mx-4 mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-800">
      Falta aplicar a migration 014 (investimentos). Até lá a tabela mostra só as contas, e "Novo investimento" e "+ Aporte" ficam desligados.
    </p>
  ) : qtdInv === 0 && !movel ? (
    <p className="mx-4 mb-3 rounded-md border border-gray-200 bg-hx-f9fafb px-3 py-2 text-[13px] text-gray-600">
      Cadastre os investimentos de cada conta (o CDB, a LCI, o Tesouro…) com quanto cada um vale hoje: a partir daí o rendimento é por
      investimento. As fotos antigas das contas ficam como histórico.{' '}
      <button type="button" className="font-semibold text-gray-800 underline underline-offset-2" onClick={() => setInvModal({})}>Cadastrar o primeiro</button>
    </p>
  ) : null;

  return (
    <div>
      <CabecalhoPagina titulo="Patrimônio"
        acessorio={qtdInv > 0 && <span className="text-sm text-gray-500">{qtdInv} {qtdInv === 1 ? 'investimento' : 'investimentos'}</span>}
        acoes={<>
          {/* O GRUPO DO DRE (a caixa de ícones) e os gestos do dia a dia ao lado: o aporte e o registro do mês. */}
          <div className="inline-flex overflow-hidden rounded-md border border-gray-300 bg-white">
            <Tooltip label="Mais ações">
              <button type="button" aria-label="Mais ações" aria-haspopup="menu" aria-expanded={!!mais}
                onMouseDown={() => { maisAberto.current = !!mais; }}
                onClick={(e) => { if (maisAberto.current || mais) { maisAberto.current = false; setMais(null); } else abrirMais(e.currentTarget); }}
                className={`${ICONE} w-[30px] ${mais ? 'bg-gray-100' : ''}`}>
                <IconSeta className={`transition-transform duration-200 ease-out ${mais ? 'rotate-180' : ''}`} />
              </button>
            </Tooltip>
          </div>
          {comInvestimentos && contas.length > 0 && <button type="button" className="btn-secondary" onClick={() => setInvModal({})}>Novo investimento</button>}
          {comMovimentos && comInvestimentos && contas.length > 0 && <button type="button" className="btn-secondary" onClick={() => setMov({ tipo: 'aporte' })}>+ Aporte</button>}
          <button type="button" className="btn-primary" onClick={() => (temAtiva ? setRegistrar(true) : setContaModal({}))}>
            {temAtiva ? 'Registrar o mês' : 'Nova conta'}
          </button>
        </>} />

      {contas.length === 0 ? (
        <div className="mt-6 max-w-2xl">
          <ListaVazia>
            Cadastre as contas que formam o seu patrimônio (conta corrente, corretora, reserva…) e, dentro delas, os
            investimentos. Depois, todo mês, registre quanto cada um vale: o app separa o que você aportou do que rendeu.
          </ListaVazia>
        </div>
      ) : (
        <>
          {!comMovimentos && (
            <p className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-800">
              Falta aplicar a migration 013 (aportes e resgates). Até lá a tela mostra só os saldos: o rendimento precisa deles.
            </p>
          )}
          <div className="mt-4">{kpis}</div>
          {grafico.length > 0 && <div className="mt-4"><GraficoPatrimonio meses={grafico} cdi={cdi} comMovimentos={comMovimentos} /></div>}
          <div className="mt-4">
            <BlocoInvestimentos grupos={grupos} total={total} meses={meses} comps={comps} cdi={cdi} ano={anoAtual} movel={movel} acoes={acoes}
              onExportar={exportar} encerrados={encerrados} onEncerrados={() => setEncerrados((e) => !e)} qtdEncerrados={qtdEncerrados} aviso={aviso} />
          </div>
          <p className="mt-2 text-xs text-gray-500">
            {movel ? 'Registrar, aportar e corrigir ficam no computador.'
              : 'Rendeu = vale hoje − aplicado (o que saiu do seu bolso: o valor do cadastro, ou o "aplicado até hoje", + aportes − resgates). O % do mês é sobre o valor anterior mais metade do aportado no mês. Clique no nome para editar e ver o histórico.'}
          </p>
        </>
      )}

      <MenuContexto menu={mais} onFechar={() => setMais(null)} />
      {contaModal && (
        <ModalConta conta={contaModal.conta} comMovimentos={comMovimentos}
          temInvestimentos={!!contaModal.conta && investimentos.some((i) => i.conta_id === contaModal.conta.id)}
          saldos={contaModal.conta ? saldos.filter((s) => s.conta_id === contaModal.conta.id) : []}
          movimentos={contaModal.conta ? (movimentos ?? []).filter((m) => m.conta_id === contaModal.conta.id && !m.investimento_id) : []}
          onFechar={() => setContaModal(null)} onSalvo={() => { setContaModal(null); carregar(); }} onMudou={carregar} />
      )}
      {registrar && (
        <ModalRegistrar grupos={grupos.map((g) => ({ ...g, itens: g.itens.filter((x) => x.inv.ativo !== false) }))} saldos={saldos} valores={valores} movimentos={movimentos ?? []}
          onFechar={() => setRegistrar(false)} onSalvo={() => { fechar(); carregar(); }}
          onMovimento={comMovimentos ? (x) => setMov(x) : undefined} />
      )}
      {mov && (
        <ModalMovimento inicial={mov} grupos={grupos} contas={contas} z="z-[65]"
          onFechar={() => setMov(null)} onSalvo={() => { setMov(null); carregar(); }}
          onNovoInvestimento={comInvestimentos ? (aoCriar) => setInvModal({ conta: mov.conta, aoCriar }) : undefined} />
      )}
      {invModal && (
        <ModalInvestimento inv={invModal.inv} contaInicial={invModal.conta} contas={contas} z="z-[70]"
          valores={invModal.inv ? valores.filter((v) => v.investimento_id === invModal.inv.id) : []}
          movimentos={invModal.inv ? (movimentos ?? []).filter((m) => m.investimento_id === invModal.inv.id) : []}
          onFechar={() => setInvModal(null)} onMudou={carregar}
          onSalvo={(salvo) => { const cb = invModal.aoCriar; setInvModal(null); carregar().then(() => { if (salvo && cb) cb(salvo); }); }} />
      )}
    </div>
  );
}
