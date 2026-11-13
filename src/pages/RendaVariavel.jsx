import { useRef, useState } from 'react';
import CabecalhoPagina from '../components/CabecalhoPagina.jsx';
import Tooltip from '../components/Tooltip.jsx';
import MenuContexto from '../components/MenuContexto.jsx';
import ListaVazia from '../components/ListaVazia.jsx';
import AbasPilula from '../components/AbasPilula.jsx';
import { PageLoading } from '../components/Spinner.jsx';
import { IconLapis, IconMais, IconSeta } from '../components/icons.jsx';
import TabelaRendaVariavel from '../components/rendaVariavel/TabelaRendaVariavel.jsx';
import ListaOperacoes from '../components/rendaVariavel/ListaOperacoes.jsx';
import ModalOperacao from '../components/rendaVariavel/ModalOperacao.jsx';
import ModalCadastroAtivos from '../components/rendaVariavel/ModalCadastroAtivos.jsx';
import useRendaVariavel from '../components/rendaVariavel/useRendaVariavel.js';
import { useNoCelular } from '../lib/celular.js';
import { useToast } from '../context/ToastContext.jsx';
import { useConfirmacao } from '../context/ConfirmContext.jsx';
import { excluirOperacao } from '../api/rendaVariavel.js';
import { exportCsv } from '../lib/exportCsv.js';
import { formatBRL } from '../lib/dinheiro.js';
import { formatDate } from '../lib/format.js';
import { lsGet, lsSet } from '../lib/storage.js';
import { nomeDoTipo } from '../lib/rendaVariavel.js';

// A RENDA VARIÁVEL (13/11/2026, o mockup "Renda variável", tabela A; migration 027): a Micron direto nos EUA, os FIIs e as
// ações da B3. O cabeçalho é o de Investimentos — o grupo do DRE (✎ o cadastro dos ativos · ▾ mais ações) e o destaque
// "+ Lançar operação". Duas abas (a pílula que desliza): CARTEIRA (a tabela agrupada) e OPERAÇÕES (a lista). Os PROVENTOS se
// lançam aqui (o tipo Provento do pop-up), mas a análise deles mora no Patrimônio. A cotação vem da função `cotacoes` do
// Supabase (a brapi e a Finnhub); ao abrir, se a última tiver mais de 20 minutos, a tela pede uma nova. No celular, só ler.

const ICONE = 'flex h-9 items-center justify-center text-gray-600 transition-colors hover:bg-gray-50 active:bg-gray-200';
const ABAS = [{ key: 'carteira', label: 'Carteira' }, { key: 'operacoes', label: 'Operações' }];

export default function RendaVariavel() {
  const toast = useToast();
  const confirmar = useConfirmacao();
  const movel = useNoCelular();
  const d = useRendaVariavel();
  const [aba, setAbaEstado] = useState(() => (lsGet('rv_aba') === 'operacoes' ? 'operacoes' : 'carteira'));
  const setAba = (v) => { lsSet('rv_aba', v); setAbaEstado(v); };
  const [cadastro, setCadastro] = useState(null); // { tipoInicial? }
  const [operacao, setOperacao] = useState(null); // { ativo?, tipo?, op? }
  const [mais, setMais] = useState(null);
  const maisAberto = useRef(false);

  if (d.carregando) return (<div><CabecalhoPagina titulo="Renda variável" /><PageLoading /></div>);
  if (d.semMigration) {
    return (
      <div>
        <CabecalhoPagina titulo="Renda variável" />
        <p className="mt-4 max-w-2xl rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-800">
          Falta aplicar a <b className="font-semibold">migration 027</b> (a renda variável): no Supabase, SQL Editor, cole o arquivo
          <code className="mx-1">supabase/migrations/027_renda_variavel.sql</code> e clique em Run. Depois, recarregue esta tela.
        </p>
      </div>
    );
  }
  const { carteira } = d;
  const vazio = !d.ativos.length;
  const nAtivos = carteira.grupos.reduce((s, g) => s + g.posicoes.length, 0);

  const acoes = movel ? null : {
    operar: (ativo, tipo) => setOperacao({ ativo, tipo }),
    editar: (ativo, op) => setOperacao({ ativo, op }),
    novoAtivo: (classe) => setCadastro({ tipoInicial: classe === 'fii' ? 'fii' : classe === 'b3' ? 'acao_br' : 'acao_eua' }),
    excluir: async (ativo, op) => {
      const nome = { compra: 'a compra', venda: 'a venda', provento: 'o provento', desdobramento: 'o desdobramento', grupamento: 'o grupamento' }[op.tipo];
      const ok = await confirmar({ titulo: `Excluir ${nome}?`, perigo: true, confirmar: 'Excluir', texto: `${nome[0].toUpperCase()}${nome.slice(1)} de ${ativo.ticker} em ${formatDate(op.data)} sai, e a posição é refeita sem ela. Não se desfaz.` });
      if (!ok) return;
      try { await excluirOperacao(op.id); toast.success('Operação excluída.'); d.carregar(); } catch (err) { toast.error(err.message); }
    },
  };

  const exportar = () => {
    const linhas = carteira.grupos.flatMap((g) => g.posicoes.map((p) => ({ g, p })));
    exportCsv('renda-variavel', linhas, [
      { key: 'classe', label: 'Classe', map: (r) => r.g.classe.nome },
      { key: 'ticker', label: 'Ticker', map: (r) => r.p.ativo.ticker },
      { key: 'nome', label: 'Nome', map: (r) => r.p.ativo.nome },
      { key: 'tipo', label: 'Tipo', map: (r) => nomeDoTipo(r.p.ativo.tipo) },
      { key: 'moeda', label: 'Moeda', map: (r) => r.p.ativo.moeda },
      { key: 'qtd', label: 'Quantidade', map: (r) => r.p.quantidade },
      { key: 'pm', label: 'Preço médio (moeda)', map: (r) => r.p.precoMedio ?? '' },
      { key: 'cot', label: 'Cotação (moeda)', map: (r) => r.p.preco ?? '' },
      { key: 'custo', label: 'Custo em R$', tipo: 'dinheiro', map: (r) => Math.round(r.p.custoReais) / 100 },
      { key: 'valor', label: 'Posição em R$', tipo: 'dinheiro', map: (r) => Math.round(r.p.valorReais) / 100 },
      { key: 'res', label: 'Resultado em R$', tipo: 'dinheiro', map: (r) => Math.round(r.p.resultado) / 100 },
      { key: 'prov', label: 'Proventos 12m em R$', tipo: 'dinheiro', map: (r) => Math.round(r.p.proventos12) / 100 },
    ]);
  };
  const abrirMais = (el) => {
    const r = el.getBoundingClientRect();
    setMais({ x: r.right - 280, y: r.bottom + 4, titulo: 'Mais ações', itens: [
      { rotulo: d.atualizando ? 'Atualizando as cotações…' : 'Atualizar as cotações agora', sub: d.erroFuncao ? `a função não respondeu: ${d.erroFuncao}` : 'o agendamento lê a cada 15 min no pregão', desabilitado: d.atualizando || vazio, onEscolher: () => d.releer(true) },
      { rotulo: 'Exportar a carteira (CSV)', sub: 'cada ativo: quantidade, preço médio, posição, resultado', desabilitado: !nAtivos, motivo: !nAtivos ? 'nenhum ativo' : undefined, onEscolher: exportar },
    ] });
  };
  const inicio = <AbasPilula abas={ABAS} valor={aba} onChange={setAba} variante="claro" altura={31} folga={3} />;

  return (
    <div>
      <CabecalhoPagina titulo="Renda variável"
        acessorio={!vazio && <span className="text-sm text-gray-500">{nAtivos} {nAtivos === 1 ? 'ativo' : 'ativos'} · {formatBRL(carteira.total.valor)}</span>}
        acoes={!movel && <>
          <div className="inline-flex overflow-hidden rounded-md border border-gray-300 bg-white">
            <Tooltip label="Cadastro dos ativos">
              <button type="button" aria-label="Cadastro dos ativos" onClick={() => setCadastro({})} className={`${ICONE} w-[38px]`}><IconLapis className="h-3.5 w-3.5" /></button>
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
          {vazio
            ? <button type="button" className="btn-primary" onClick={() => setCadastro({ tipoInicial: 'acao_eua' })}>Cadastrar ativos</button>
            : <button type="button" className="btn-primary" onClick={() => setOperacao({})}><IconMais className="h-[11px] w-[11px]" />Lançar operação</button>}
        </>} />

      {!d.temDolar && <p className="mt-4 max-w-2xl rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[12.5px] text-amber-800">Sem o dólar de hoje (a cotação e a PTAX não responderam): o exterior fica sem o valor em reais até ele chegar.</p>}
      {vazio ? (
        <div className="mt-6 max-w-2xl">
          <ListaVazia>
            Comece pelo cadastro: o ticker de cada ativo (MU, HGLG11) e o tipo, que decide o mercado e a moeda. Depois, "Lançar operação":
            a compra com a quantidade, o preço e, no exterior, o dólar do dia. A cotação chega sozinha a cada 15 minutos no pregão.
          </ListaVazia>
        </div>
      ) : (
        <>
          <section className="card mt-4 flex flex-col overflow-hidden !p-0">
            {aba === 'carteira'
              ? <TabelaRendaVariavel carteira={carteira} hoje={d.hoje} dolar={d.dolar} movel={movel} acoes={acoes} inicio={inicio} />
              : <ListaOperacoes ativos={d.ativos} operacoes={d.operacoes} hoje={d.hoje} movel={movel} acoes={acoes} inicio={inicio} />}
          </section>
          {movel && <p className="mt-2 text-xs text-gray-500">Lançar, editar e o cadastro ficam no computador.</p>}
        </>
      )}

      <MenuContexto menu={mais} onFechar={() => setMais(null)} />
      {cadastro && (
        <ModalCadastroAtivos ativos={d.ativos} operacoes={d.operacoes} tipoInicial={cadastro.tipoInicial}
          onFechar={() => setCadastro(null)} onSalvo={() => { setCadastro(null); d.carregar().then(() => d.releer(false)); }} />
      )}
      {operacao && (
        <ModalOperacao inicial={operacao} ativos={d.ativos} operacoes={d.operacoes} cotacoes={d.cotacoes} ptax={d.ptax} dolar={d.dolar} hoje={d.hoje}
          onCadastro={() => { setOperacao(null); setCadastro({ tipoInicial: 'acao_eua' }); }}
          onFechar={() => setOperacao(null)} onSalvo={() => { setOperacao(null); d.carregar(); }} />
      )}
    </div>
  );
}
