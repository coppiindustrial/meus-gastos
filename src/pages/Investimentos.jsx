import { useRef, useState } from 'react';
import CabecalhoPagina from '../components/CabecalhoPagina.jsx';
import Tooltip from '../components/Tooltip.jsx';
import MenuContexto from '../components/MenuContexto.jsx';
import { PageLoading } from '../components/Spinner.jsx';
import { IconLapis, IconSeta } from '../components/icons.jsx';
import BlocoInvestimentos from '../components/patrimonio/TabelaInvestimentos.jsx';
import ModalCadastroInvestimentos from '../components/patrimonio/ModalCadastroInvestimentos.jsx';
import { FichaInvestimento, ModalAtualizarValores, ModalLugar, ModalMovimento } from '../components/patrimonio/ModaisPatrimonio.jsx';
import useDadosPatrimonio from '../components/patrimonio/useDadosPatrimonio.js';
import { useNoCelular } from '../lib/celular.js';
import { useToast } from '../context/ToastContext.jsx';
import { useConfirmacao } from '../context/ConfirmContext.jsx';
import { apagarPatrimonio } from '../api/patrimonio.js';
import { linhaMesAMes, mesesDaGrade, nomeTipoInvestimento, rotuloLiquidez, rotuloRende } from '../lib/investimentos.js';
import { exportCsv } from '../lib/exportCsv.js';
import { formatBRL } from '../lib/dinheiro.js';
import { competenciaCurta } from '../lib/format.js';

// OS INVESTIMENTOS (06/11/2026, o mockup "Patrimônio do zero" e a separação pedida: o painel fica em /patrimonio, como a
// Visão geral; aqui, a TABELA, como os Lançamentos). Três gestos só, sempre com o mesmo nome:
//   · CADASTRAR — o ✎ do grupo do DRE abre a tabela de cadastro (`ModalCadastroInvestimentos`), como nos fixos;
//   · APLICAR / RESGATAR — o ⇅ do grupo e o "↑ Aplicar · ↓ Resgatar" de cada linha (`ModalMovimento`);
//   · ATUALIZAR VALORES — o botão de destaque, âmbar com o número quando o mês virou e falta o valor
//     (`pendentesDeValor`; o mesmo número no menu).
// O nome (ou o ✎) da linha abre a FICHA: as aplicações e quando cada uma vence, o histórico. No ▾: novo lugar, CSV, os
// encerrados e "Começar do zero". No celular, só a tabela (ler).
const ICONE = 'flex h-9 items-center justify-center text-gray-600 transition-colors hover:bg-gray-50 active:bg-gray-200';
const IcoTroca = () => (
  <svg viewBox="0 0 24 24" className="h-[15px] w-[15px]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M7 17V5M3 9l4-4 4 4M17 7v12M13 15l4 4 4-4" />
  </svg>
);

export default function Investimentos() {
  const toast = useToast();
  const confirmar = useConfirmacao();
  const movel = useNoCelular();
  const [encerrados, setEncerrados] = useState(false);
  const d = useDadosPatrimonio({ encerrados });
  const [cadastro, setCadastro] = useState(null); // { foco? }
  const [mov, setMov] = useState(null); // { inv?, tipo }
  const [ficha, setFicha] = useState(null); // o id do investimento
  const [atualizar, setAtualizar] = useState(false);
  const [lugar, setLugar] = useState(null); // { conta? }
  const [mais, setMais] = useState(null);
  const maisAberto = useRef(false);

  if (!d.contas) return (<div><CabecalhoPagina titulo="Investimentos" /><PageLoading /></div>);
  const ativos = d.investimentos.filter((i) => i.ativo !== false);
  const qtdEncerrados = d.investimentos.length - ativos.length;
  const valesHoje = Object.fromEntries(d.grupos.flatMap((g) => g.itens.map((x) => [x.inv.id, x.vale])));
  const comps = mesesDaGrade(d.meses, d.hoje);
  const recarregar = () => d.carregar();
  const fichaX = ficha ? d.grupos.flatMap((g) => g.itens.map((x) => ({ x, g }))).find((y) => y.x.inv.id === ficha) : null;

  const acoes = movel ? null : {
    podeInvestir: d.comInvestimentos,
    movimento: (x) => setMov(x),
    novoInvestimento: (conta) => setCadastro({ foco: conta.id }),
    ficha: (inv) => setFicha(inv.id),
    editarConta: (conta) => setLugar({ conta }),
  };

  const exportar = (vista, modo) => {
    if (vista === 'mes') {
      const linhas = d.grupos.flatMap((g) => [
        { nome: g.conta.nome, nivel: 'lugar', l: linhaMesAMes(d.meses, comps, (m) => m.porConta[g.conta.id]) },
        ...g.itens.map((x) => ({ nome: x.inv.nome, nivel: g.conta.nome, l: linhaMesAMes(d.meses, comps, (m) => m.porSerie[`i:${x.inv.id}`]) })),
      ]);
      exportCsv(`rendimento-mes-a-mes-${modo === 'pct' ? 'pct' : 'reais'}`, linhas, [
        { key: 'nome', label: 'Investimento' }, { key: 'nivel', label: 'Lugar' },
        ...comps.map((c) => ({ key: c, label: competenciaCurta(c), tipo: modo === 'pct' ? 'numero' : 'dinheiro', map: (r) => (r.l.porMes[c] ? (modo === 'pct' ? (r.l.porMes[c].pct ?? 0) * 100 : r.l.porMes[c].rendeu / 100) : null) })),
        { key: 'total', label: modo === 'pct' ? 'No período (%)' : 'Total', tipo: modo === 'pct' ? 'numero' : 'dinheiro', map: (r) => (r.l.total === null ? null : modo === 'pct' ? r.l.pct * 100 : r.l.total / 100) },
      ]);
      return;
    }
    const linhas = d.grupos.flatMap((g) => g.itens.map((x) => ({ g, x })));
    exportCsv('investimentos', linhas, [
      { key: 'lugar', label: 'Lugar', map: (r) => r.g.conta.nome },
      { key: 'nome', label: 'Investimento', map: (r) => r.x.inv.nome },
      { key: 'tipo', label: 'Tipo', map: (r) => nomeTipoInvestimento(r.x.inv.tipo) },
      { key: 'rende', label: 'Rende', map: (r) => rotuloRende(r.x.inv) },
      { key: 'resgate', label: 'Resgate', map: (r) => rotuloLiquidez(r.x.inv) },
      { key: 'vencimento', label: 'Vencimento', tipo: 'data', map: (r) => r.x.prazos?.proximo?.vence ?? r.x.inv.vencimento ?? '' },
      { key: 'aplicado', label: 'Aplicado', tipo: 'dinheiro', map: (r) => r.x.aplicado / 100 },
      { key: 'vale', label: 'Vale hoje', tipo: 'dinheiro', map: (r) => r.x.vale / 100 },
      { key: 'rendeu', label: 'Rendeu', tipo: 'dinheiro', map: (r) => r.x.rendeu / 100 },
      { key: 'pct', label: 'Rendeu (%)', tipo: 'numero', map: (r) => (r.x.pct === null ? null : r.x.pct * 100) },
    ]);
  };
  const comecarDoZero = async () => {
    const n = d.investimentos.length;
    const ok = await confirmar({
      titulo: 'Começar do zero?', perigo: true, confirmar: 'Apagar tudo',
      texto: `Apaga os ${d.contas.length} lugar(es), ${n} investimento(s) e todos os valores, aplicações, resgates e fotos antigas do Patrimônio. Não se desfaz. Os lançamentos, as faturas e o resto do app não mudam.`,
    });
    if (!ok) return;
    try { await apagarPatrimonio(); toast.success('Patrimônio apagado. Comece pelo "Montar a carteira".'); recarregar(); } catch (err) { toast.error(err.message); }
  };
  const abrirMais = (el) => {
    const r = el.getBoundingClientRect();
    setMais({ x: r.right - 260, y: r.bottom + 4, titulo: 'Mais ações', itens: [
      { rotulo: 'Novo lugar', sub: 'o banco ou a corretora (Nubank, XP…)', onEscolher: () => setLugar({}) },
      { rotulo: 'Exportar a carteira (CSV)', sub: 'cada investimento, aplicado, vale e rendeu', desabilitado: !ativos.length, motivo: !ativos.length ? 'nada cadastrado' : undefined, onEscolher: () => exportar('carteira') },
      { rotulo: encerrados ? 'Esconder os encerrados' : 'Mostrar os encerrados', sub: 'os que você resgatou inteiros', desabilitado: !qtdEncerrados, motivo: !qtdEncerrados ? 'nenhum encerrado' : undefined, onEscolher: () => setEncerrados((e) => !e) },
      { sep: true },
      { rotulo: 'Começar do zero', sub: 'apaga lugares, investimentos e valores', perigo: true, desabilitado: !d.contas.length, onEscolher: comecarDoZero },
    ] });
  };

  const vazio = ativos.length === 0;
  const destaque = vazio ? (
    <button type="button" className="btn-primary" onClick={() => setCadastro({})} disabled={!d.comInvestimentos}>Montar a carteira</button>
  ) : d.pendentes.length ? (
    <Tooltip label={`${d.pendentes.length} ${d.pendentes.length === 1 ? 'investimento' : 'investimentos'} sem o valor do fim do mês passado`}>
      <button type="button" onClick={() => setAtualizar(true)}
        className="inline-flex h-9 items-center gap-2 rounded-md border border-amber-400 bg-amber-50 px-3.5 text-[13px] font-semibold text-amber-800 transition-colors hover:bg-amber-100">
        Atualizar valores <span className="rounded-full bg-amber-600 px-1.5 text-[11px] font-bold leading-[18px] text-white">{d.pendentes.length}</span>
      </button>
    </Tooltip>
  ) : (
    <button type="button" className="btn-primary" onClick={() => setAtualizar(true)}>Atualizar valores</button>
  );

  return (
    <div>
      <CabecalhoPagina titulo="Investimentos"
        acessorio={!vazio && <span className="text-sm text-gray-500">{ativos.length} em {d.grupos.filter((g) => g.itens.length).length} {d.grupos.filter((g) => g.itens.length).length === 1 ? 'lugar' : 'lugares'} · {formatBRL(d.total.vale)}</span>}
        acoes={<>
          {/* O GRUPO DO DRE: ✎ o cadastro · ⇅ aplicar ou resgatar · ▾ mais ações (o nome no tooltip), e o destaque ao lado. */}
          <div className="inline-flex overflow-hidden rounded-md border border-gray-300 bg-white">
            <Tooltip label="Cadastro dos investimentos">
              <button type="button" aria-label="Cadastro dos investimentos" onClick={() => setCadastro({})} disabled={!d.comInvestimentos} className={`${ICONE} w-[38px] disabled:opacity-40`}>
                <IconLapis className="h-3.5 w-3.5" />
              </button>
            </Tooltip>
            <Tooltip label="Aplicar ou resgatar">
              <button type="button" aria-label="Aplicar ou resgatar" onClick={() => setMov({ tipo: 'aporte' })} disabled={vazio || !d.comMovimentos}
                className={`${ICONE} w-[38px] border-l border-gray-200 disabled:opacity-40`}><IcoTroca /></button>
            </Tooltip>
            <Tooltip label="Mais ações">
              <button type="button" aria-label="Mais ações" aria-haspopup="menu" aria-expanded={!!mais}
                onMouseDown={() => { maisAberto.current = !!mais; }}
                onClick={(e) => { if (maisAberto.current || mais) { maisAberto.current = false; setMais(null); } else abrirMais(e.currentTarget); }}
                className={`${ICONE} w-[28px] border-l border-gray-200 ${mais ? 'bg-gray-100' : ''}`}>
                <IconSeta className={`transition-transform duration-200 ease-out ${mais ? 'rotate-180' : ''}`} />
              </button>
            </Tooltip>
          </div>
          {destaque}
        </>} />

      {!d.comInvestimentos && (
        <p className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-800">Falta aplicar a migration 014 (investimentos).</p>
      )}
      {d.sem015 && (
        <p className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-800">
          Falta aplicar a migration 015 (o prazo de cada aplicação e o "saldo em conta"). Até lá, "cada aplicação vence" e "Saldo em conta" não salvam.
        </p>
      )}

      {vazio ? (
        <div className="card mt-4 max-w-3xl px-6 py-6">
          <h2 className="text-[15px] font-semibold text-gray-800">Monte a carteira</h2>
          <p className="mt-1 text-[13.5px] leading-relaxed text-gray-600">
            Com o app do banco aberto ao lado, cadastre <b className="font-semibold text-gray-800">onde</b> você investe (Nubank, XP…) e <b className="font-semibold text-gray-800">o que</b> tem em cada lugar:
            uma linha por investimento, com o nome, o tipo e quanto vale hoje. O "valor aplicado" (o que saiu do seu bolso) é opcional.
            Depois, é só aplicar e resgatar quando acontecer, e atualizar os valores uma vez por mês.
          </p>
          {!movel && <p className="mt-3 text-[12.5px] text-gray-500">Comece pelo <b className="font-semibold text-gray-700">Montar a carteira</b>, no alto. {d.contas.length > 0 && 'Para apagar o que já existe (os lugares e as fotos antigas), use o ▾ → Começar do zero.'}</p>}
        </div>
      ) : (
        <div className="mt-4">
          <BlocoInvestimentos grupos={d.grupos.filter((g) => g.itens.length || !g.soConta || g.conta.ativa)} total={d.total} meses={d.meses} comps={comps} cdi={d.cdi} ano={d.ano}
            movel={movel} acoes={acoes} onExportar={exportar} encerrados={encerrados} onEncerrados={() => setEncerrados((e) => !e)} qtdEncerrados={qtdEncerrados} />
          <p className="mt-2 text-xs text-gray-500">
            {movel ? 'Aplicar, resgatar e atualizar ficam no computador.'
              : 'Rendeu = vale hoje − aplicado (o "valor aplicado" do cadastro, ou o primeiro valor, + aplicações − resgates). Clique no nome para a ficha: as aplicações, quando cada uma vence e o histórico.'}
          </p>
        </div>
      )}

      <MenuContexto menu={mais} onFechar={() => setMais(null)} />
      {cadastro && (
        <ModalCadastroInvestimentos contas={d.contas} investimentos={d.investimentos} valesHoje={valesHoje} focoLugar={cadastro.foco}
          onFechar={() => setCadastro(null)} onSalvo={() => { setCadastro(null); recarregar(); }} />
      )}
      {atualizar && (
        <ModalAtualizarValores grupos={d.grupos} valores={d.valores} movimentos={d.movimentos}
          onFechar={() => setAtualizar(false)} onSalvo={() => { setAtualizar(false); recarregar(); }} />
      )}
      {fichaX && (
        <FichaInvestimento x={fichaX.x} lugar={fichaX.g.conta.nome} movel={movel}
          valores={d.valores.filter((v) => v.investimento_id === ficha)} movimentos={d.movimentos.filter((m) => m.investimento_id === ficha)}
          onFechar={() => setFicha(null)} onMudou={recarregar}
          onAplicar={(tipo) => setMov({ inv: fichaX.x.inv, tipo })} onCadastro={() => { setFicha(null); setCadastro({}); }} />
      )}
      {mov && (
        <ModalMovimento inicial={mov} grupos={d.grupos} contas={d.contas} z="z-[65]"
          onFechar={() => setMov(null)} onSalvo={() => { setMov(null); recarregar(); }} />
      )}
      {lugar && (
        <ModalLugar conta={lugar.conta} qtdInvestimentos={lugar.conta ? d.investimentos.filter((i) => i.conta_id === lugar.conta.id).length : 0}
          onFechar={() => setLugar(null)} onSalvo={() => { setLugar(null); recarregar(); }} />
      )}
    </div>
  );
}
