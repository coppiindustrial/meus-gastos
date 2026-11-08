import { useRef, useState } from 'react';
import CabecalhoPagina from '../components/CabecalhoPagina.jsx';
import Tooltip from '../components/Tooltip.jsx';
import MenuContexto from '../components/MenuContexto.jsx';
import ListaVazia from '../components/ListaVazia.jsx';
import { PageLoading } from '../components/Spinner.jsx';
import { IconLapis, IconSeta } from '../components/icons.jsx';
import TabelaCarteira from '../components/patrimonio/TabelaCarteira.jsx';
import ModalAporte from '../components/patrimonio/ModalAporte.jsx';
import ModalResgate from '../components/patrimonio/ModalResgate.jsx';
import ModalCadastroCarteira from '../components/patrimonio/ModalCadastroCarteira.jsx';
import AvisoSemTaxas from '../components/patrimonio/AvisoSemTaxas.jsx';
import useCarteira from '../components/patrimonio/useCarteira.js';
import { useNoCelular } from '../lib/celular.js';
import { useToast } from '../context/ToastContext.jsx';
import { useConfirmacao } from '../context/ConfirmContext.jsx';
import { excluirAporte, marcarNaoReaplicar } from '../api/carteira.js';
import { noVencimento, nomeDoTipo, rotuloTaxa } from '../lib/carteira.js';
import { exportCsv } from '../lib/exportCsv.js';
import { formatBRL } from '../lib/dinheiro.js';
import { formatDate } from '../lib/format.js';

// OS INVESTIMENTOS (07/11/2026, a carteira do zero: o mockup "Carteira por aportes", tabela A). Dois cadastros e uma
// conta só: o ✎ abre o CADASTRO dos investimentos (o que cada um é: nome, instituição, tipo, taxa, resgate); "Lançar
// aporte" é o gesto do dia a dia (dinheiro novo, ou o que já estava aplicado: o total do banco e quanto já rendeu); na
// linha de cada aporte, RESGATAR, EDITAR e EXCLUIR. O valor de hoje de cada aporte é a conta pelo CDI de cada dia
// (`lib/carteira.js`); o painel do Patrimônio lê os mesmos dados (`useCarteira`). No celular, só ler.
// O VENCIMENTO (08/11/2026, migration 022): o "Reaplicar" do encerrado abre o aporte novo já com o LÍQUIDO do dia (o
// valor menos o IR, como o automático do investimento que reaplica sozinho); excluir um aporte REAPLICADO marca o de antes
// como "voltou para a conta" (`nao_reaplicar`), senão o app o reaplicaria de novo na próxima vez que abrisse.
const ICONE = 'flex h-9 items-center justify-center text-gray-600 transition-colors hover:bg-gray-50 active:bg-gray-200';

export default function Investimentos() {
  const toast = useToast();
  const confirmar = useConfirmacao();
  const movel = useNoCelular();
  const d = useCarteira();
  const [cadastro, setCadastro] = useState(false);
  const [aporte, setAporte] = useState(null); // { investimento_id?, aporte?, reaplicar? }
  const [resgate, setResgate] = useState(null); // o item da carteira
  const [encerrados, setEncerrados] = useState(false);
  const [mais, setMais] = useState(null);
  const maisAberto = useRef(false);

  if (d.carregando) return (<div><CabecalhoPagina titulo="Investimentos" /><PageLoading /></div>);
  if (d.semMigration) {
    return (
      <div>
        <CabecalhoPagina titulo="Investimentos" />
        <p className="mt-4 max-w-2xl rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-800">
          Falta aplicar a <b className="font-semibold">migration 020</b> (a carteira do zero): no Supabase, SQL Editor, cole o arquivo
          <code className="mx-1">supabase/migrations/020_carteira_do_zero.sql</code> e clique em Run. Depois, recarregue esta tela.
        </p>
      </div>
    );
  }
  const { carteira } = d;
  const recarregar = () => d.carregar();
  const aportesPorInv = d.aportes.reduce((m, a) => ({ ...m, [a.investimento_id]: (m[a.investimento_id] ?? 0) + 1 }), {});
  const com022 = d.cadastro.some((i) => 'no_vencimento' in i);
  const qtdInv = carteira.grupos.reduce((s, g) => s + g.investimentos.length, 0);
  const qtdAportes = carteira.grupos.reduce((s, g) => s + g.investimentos.reduce((t, x) => t + x.aportes.length, 0), 0);
  const t = carteira.total;

  const acoes = movel ? null : {
    aportar: (inv) => setAporte({ investimento_id: inv.id }),
    editar: (item) => setAporte({ aporte: item.ap }),
    resgatar: (item) => setResgate(item),
    reaplicar: (item) => {
      const v = noVencimento(item.inv, item.pos);
      setAporte({ investimento_id: item.inv.id, reaplicar: { de: com022 ? item.ap.id : null, data: v.data, valor: v.liquido, venc: v } });
    },
    excluir: async (item) => {
      const { ap, inv, resgates } = item;
      const data = ap.origem === 'antigo' ? ap.aplicado_em ?? ap.data : ap.data;
      const deAntes = ap.reaplicado_de ? d.aportes.find((a) => a.id === ap.reaplicado_de) : null;
      const ok = await confirmar({
        titulo: 'Excluir o aporte?', perigo: true, confirmar: 'Excluir',
        texto: `O aporte de ${formatDate(data)} em ${inv.nome} (${formatBRL(Number(ap.valor_centavos))}) sai da carteira${resgates.length ? `, com ${resgates.length === 1 ? 'o resgate' : `os ${resgates.length} resgates`} dele` : ''}. Os outros aportes não mudam.`
          + (deAntes ? ` Ele é a reaplicação do vencimento de ${formatDate(ap.data)}: aquele aporte fica como "voltou para a conta", e o app não o reaplica de novo.` : '')
          + ' Não se desfaz.',
      });
      if (!ok) return;
      try {
        if (deAntes) await marcarNaoReaplicar([deAntes.id]);
        await excluirAporte(ap.id);
        toast.success('Aporte excluído.');
        recarregar();
      } catch (err) { toast.error(err.message); }
    },
  };

  const exportar = () => {
    const linhas = carteira.grupos.flatMap((g) => g.investimentos.flatMap((x) => x.aportes.map((item) => ({ g, x, item }))));
    exportCsv('carteira', linhas, [
      { key: 'inst', label: 'Instituição', map: (r) => r.g.instituicao },
      { key: 'inv', label: 'Investimento', map: (r) => r.x.inv.nome },
      { key: 'tipo', label: 'Tipo', map: (r) => nomeDoTipo(r.x.inv.tipo) },
      { key: 'taxa', label: 'Rende', map: (r) => rotuloTaxa(r.x.inv.taxa) },
      { key: 'origem', label: 'Aporte', map: (r) => (r.item.ap.origem === 'antigo' ? 'já estava aplicado' : 'dinheiro novo') },
      { key: 'data', label: 'Data do aporte', tipo: 'data', map: (r) => (r.item.ap.origem === 'antigo' ? r.item.ap.aplicado_em ?? '' : r.item.ap.data) },
      { key: 'venc', label: 'Vencimento', tipo: 'data', map: (r) => r.item.ap.vencimento ?? '' },
      { key: 'aplicado', label: 'Aplicado', tipo: 'dinheiro', map: (r) => r.item.pos.aplicado / 100 },
      { key: 'vale', label: 'Vale hoje', tipo: 'dinheiro', map: (r) => r.item.pos.vale / 100 },
      { key: 'rendeu', label: 'Rendeu', tipo: 'dinheiro', map: (r) => r.item.pos.rendeu / 100 },
      { key: 'ir', label: 'IR ≈', tipo: 'dinheiro', map: (r) => (r.item.pos.ir + r.item.pos.iof) / 100 },
      { key: 'liq', label: 'Líquido ≈', tipo: 'dinheiro', map: (r) => r.item.pos.liquido / 100 },
    ]);
  };
  const abrirMais = (el) => {
    const r = el.getBoundingClientRect();
    setMais({ x: r.right - 260, y: r.bottom + 4, titulo: 'Mais ações', itens: [
      { rotulo: 'Exportar a carteira (CSV)', sub: 'cada aporte: aplicado, vale hoje, rendeu, IR', desabilitado: !qtdAportes, motivo: !qtdAportes ? 'nenhum aporte' : undefined, onEscolher: exportar },
      { rotulo: encerrados ? 'Esconder os encerrados' : 'Mostrar os encerrados', sub: 'os que venceram ou foram resgatados inteiros', desabilitado: !carteira.encerrados.length, motivo: !carteira.encerrados.length ? 'nenhum encerrado' : undefined, onEscolher: () => setEncerrados((e) => !e) },
    ] });
  };

  const vazio = !d.cadastro.length;
  return (
    <div>
      <CabecalhoPagina titulo="Investimentos"
        acessorio={!vazio && <span className="text-sm text-gray-500">{qtdInv} em {carteira.grupos.length} {carteira.grupos.length === 1 ? 'instituição' : 'instituições'} · {formatBRL(t.vale)}</span>}
        acoes={!movel && <>
          {/* O GRUPO DO DRE: ✎ o cadastro · ▾ mais ações (o nome no tooltip), e o gesto do dia a dia ao lado */}
          <div className="inline-flex overflow-hidden rounded-md border border-gray-300 bg-white">
            <Tooltip label="Cadastro dos investimentos">
              <button type="button" aria-label="Cadastro dos investimentos" onClick={() => setCadastro(true)} className={`${ICONE} w-[38px]`}><IconLapis className="h-3.5 w-3.5" /></button>
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
            ? <button type="button" className="btn-primary" onClick={() => setCadastro(true)}>Cadastrar investimentos</button>
            : <button type="button" className="btn-primary" onClick={() => setAporte({})}>Lançar aporte</button>}
        </>} />

      {d.semTaxas && <AvisoSemTaxas onTentar={d.tentarTaxas} className="mt-4" />}

      {vazio ? (
        <div className="mt-6 max-w-2xl">
          <ListaVazia>
            Comece pelo cadastro: o nome de cada investimento, a instituição, o tipo e a taxa (em % do CDI). Depois, "Lançar aporte":
            o dinheiro novo com a data, o valor e o vencimento; o que já estava aplicado, com o total que o banco mostra hoje e quanto ele já rendeu.
          </ListaVazia>
        </div>
      ) : (
        <>
          {/* SEM OS CARTÕES DE RESUMO (08/11/2026, a pedido): o vale hoje, o aplicado, o rendeu e o líquido moram no
              Patrimônio, que é onde se analisa; aqui é a tabela de lançar (o Total dela fecha a conta) */}
          <div className="mt-4">
            <TabelaCarteira carteira={carteira} hoje={d.hoje} movel={movel} acoes={acoes} mostrarEncerrados={encerrados} onEncerrados={() => setEncerrados((e) => !e)} />
          </div>
          {movel && <p className="mt-2 text-xs text-gray-500">Lançar, resgatar e editar ficam no computador.</p>}
        </>
      )}

      <MenuContexto menu={mais} onFechar={() => setMais(null)} />
      {cadastro && (
        <ModalCadastroCarteira cadastro={d.cadastro} aportes={d.aportes} aportesPorInv={aportesPorInv} hoje={d.hoje} com022={com022 || !d.cadastro.length}
          onFechar={() => setCadastro(false)} onSalvo={() => { setCadastro(false); recarregar(); }} />
      )}
      {aporte && (
        <ModalAporte inicial={aporte} cadastro={d.cadastro} cal={carteira.cal} hoje={d.hoje}
          resgates={aporte.aporte ? d.resgates.filter((r) => r.aporte_id === aporte.aporte.id) : []}
          onCadastro={() => { setAporte(null); setCadastro(true); }}
          onFechar={() => setAporte(null)} onSalvo={(ficar) => { if (!ficar) setAporte(null); recarregar(); }} />
      )}
      {resgate && (
        <ModalResgate item={resgate} cal={carteira.cal} hoje={d.hoje} onFechar={() => setResgate(null)} onSalvo={() => { setResgate(null); recarregar(); }} />
      )}
    </div>
  );
}
