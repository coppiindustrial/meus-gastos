import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import CabecalhoPagina from '../components/CabecalhoPagina.jsx';
import AbasPilula from '../components/AbasPilula.jsx';
import Toggle from '../components/Toggle.jsx';
import Tooltip from '../components/Tooltip.jsx';
import MenuContexto from '../components/MenuContexto.jsx';
import { IconAbrir, IconSeta } from '../components/icons.jsx';
import { PageLoading } from '../components/Spinner.jsx';
import { DivisorFaixa, FaixaProvider, Trilho } from '../components/filtros/FaixaFiltros.jsx';
import { SegUnico } from '../components/filtros/Segmentos.jsx';
import ImportarArquivos from '../components/ImportarArquivos.jsx';
import ModalPlanilha from '../components/ModalPlanilha.jsx';
import ImportarFatura from './ImportarFatura.jsx';
import ImportarExtrato from './ImportarExtrato.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { useConfirmacao } from '../context/ConfirmContext.jsx';
import { carregarSituacao, desfazerImportacao, idsDoExtratoAntigo } from '../api/importacoes.js';
import { mesesDoAno } from '../lib/importacoes.js';
import { formatBRL } from '../lib/dinheiro.js';
import { competenciaCurta, formatDate, formatDateTime, nomeCompetencia, todayISO } from '../lib/format.js';
import posicionarPopover from '../lib/posicionarPopover.js';
import useEscape from '../lib/useEscape.js';
import { lsSet } from '../lib/storage.js';

// A TELA IMPORTAR: o lugar único de tudo o que se importa. "Por mês" = uma linha por mês do ano, uma coluna por
// FONTE (cada cartão e o extrato) e em cada célula QUANDO aquilo entrou ou o que falta (as contas em
// `lib/importacoes.js`). "Histórico" = cada importação (migration 007), com o "Desfazer".
//
// O DESENHO É O DA GRADE DO DRE (29/10/2026, opção A do mockup "Importar · tabela, legenda e botão"): cada célula
// em UMA linha (ponto de cor + data + o número curto) e o resto num cartão que abre no hover; a linha sob o cursor
// acende e a célula ganha contorno; o importar é um ÍCONE ↓ no canto da célula (sempre à vista onde falta, só no
// hover nas outras). A LEGENDA fica EM CIMA, como a do DRE: as marcas destacam aquele tipo de célula. O cabeçalho
// é o grupo de ícones do DRE (importar arquivos · ▾ o que falta, por mês). O HISTÓRICO DA PLANILHA não tem mais
// tela nem botão: ela foi importada uma vez, e a linha dela na aba Histórico abre o pop-up (`ModalPlanilha`).

const COR = { ok: '#22a06b', pl: '#9ca3af', parcial: '#4b8fe2', falta: '#e8a317' };
const Ico = ({ children, className = 'h-3.5 w-3.5' }) => (
  <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
);
// O desenho ocupa de y=4 a y=20 (centro 12, o do quadro): antes ia até 21 e, no botão de 24px, o ícone parecia fora do centro.
const IcoImportar = (p) => <Ico {...p}><path d="M12 4v10M7.5 9.5 12 14l4.5-4.5" /><path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" /></Ico>;
const IcoPlanilha = (p) => <Ico {...p}><rect x="3" y="3" width="18" height="18" rx="2" /><line x1="3" y1="9" x2="21" y2="9" /><line x1="3" y1="15" x2="21" y2="15" /><line x1="9" y1="3" x2="9" y2="21" /></Ico>;
const IcoCartao = (p) => <Ico {...p}><rect x="2" y="5" width="20" height="14" rx="2" /><line x1="2" y1="10" x2="22" y2="10" /></Ico>;
const IcoBanco = (p) => <Ico {...p}><path d="M3 10l9-6 9 6" /><line x1="5" y1="10" x2="5" y2="18" /><line x1="10" y1="10" x2="10" y2="18" /><line x1="14" y1="10" x2="14" y2="18" /><line x1="19" y1="10" x2="19" y2="18" /><line x1="3" y1="21" x2="21" y2="21" /></Ico>;
const ddmm = (iso) => (iso ? formatDate(iso.slice(0, 10)).slice(0, 5) : '');
const mesNome = (comp) => nomeCompetencia(comp).replace(/ de \d+$/, '');
const ABAS = [{ key: 'mes', label: 'Por mês' }, { key: 'hist', label: 'Histórico' }];

// O TIPO de uma célula, para a legenda (o que a marca destaca).
const tipoDe = (cel) => (cel.estado === 'ok' ? (cel.planilha ? 'pl' : 'ok') : cel.estado === 'parcial' ? 'parcial' : cel.estado === 'falta' ? 'falta' : cel.estado === 'na' ? 'na' : 'outro');
const MARCAS = [
  { id: 'ok', rotulo: 'Importado', explica: 'Entrou por aqui: a data é o dia em que foi importado.' },
  { id: 'pl', rotulo: 'Da planilha', explica: 'Veio do histórico da planilha (fase 2).' },
  { id: 'parcial', rotulo: 'Em parte', explica: 'O extrato vai até o dia mostrado; o resto do mês ainda não entrou.' },
  { id: 'falta', rotulo: 'Falta importar', explica: 'A fatura já venceu (ou o mês do extrato acabou) e não entrou.' },
  { id: 'na', rotulo: 'Não existia', explica: 'A fonte ainda não era usada aqui naquele mês (ou o cartão foi desativado).' },
];
const Ponto = ({ tipo }) => (tipo === 'na'
  ? <span className="w-3 shrink-0 text-center text-gray-300">—</span>
  : tipo === 'parcial'
    ? <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: `linear-gradient(90deg, ${COR.parcial} 50%, transparent 50%)`, boxShadow: `inset 0 0 0 1px ${COR.parcial}` }} />
    : <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: COR[tipo] }} />);

// O que o cartão do hover conta sobre uma célula.
function detalhe(cel, col, comp) {
  const fonte = col.tipo === 'fatura' ? `Fatura ${col.cartao.nome}` : 'Extrato da conta';
  const titulo = `${fonte} · ${nomeCompetencia(comp).toLowerCase()}`;
  if (cel.estado === 'ok') {
    return {
      titulo,
      linhas: col.tipo === 'fatura'
        ? [`${cel.qtd} compras · ${formatBRL(cel.total)}`, cel.planilha ? 'Veio do histórico da planilha.' : `Importada em ${formatDateTime(cel.data)}.`, cel.vencimento && `Vencimento ${formatDate(cel.vencimento)}.`]
        : ['O mês inteiro entrou.', cel.data && `Importado em ${formatDateTime(cel.data)}.`],
    };
  }
  if (cel.estado === 'parcial') return { titulo, linhas: [`Entrou até ${formatDate(cel.ate)}.`, cel.pendente ? 'O mês acabou: falta o resto.' : `Faltam ${cel.faltamDias} dias até hoje.`], acao: true };
  if (cel.estado === 'falta') return { titulo, linhas: [col.tipo === 'fatura' ? `Venceu em ${formatDate(cel.vence)} e ainda não entrou.` : 'O mês acabou e o extrato dele não entrou.'], acao: true };
  if (cel.estado === 'andamento') return { titulo, linhas: ['O mês ainda não acabou.'], acao: true };
  if (cel.estado === 'futuro') return { titulo, linhas: [cel.vence ? `Vence em ${formatDate(cel.vence)}.` : 'Mês que ainda não chegou.'] };
  return { titulo, linhas: ['A fonte ainda não existia aqui neste mês.'] };
}

// Uma célula: uma linha só. `apagada`: fora do destaque da legenda.
function Celula({ cel, col, comp, apagada, onAgir, onAbrir, onDica }) {
  const tipo = tipoDe(cel);
  const acao = ['falta', 'parcial', 'andamento'].includes(cel.estado);
  let texto;
  let curto = null;
  if (cel.estado === 'ok') {
    texto = cel.planilha ? <span className="text-gray-500">planilha</span> : <span className="font-medium tabular-nums text-gray-800">{ddmm(cel.data)}</span>;
    curto = col.tipo === 'fatura' ? `${cel.qtd} compras` : 'mês inteiro';
  } else if (cel.estado === 'parcial') {
    texto = <span className="font-medium tabular-nums text-gray-800">até {ddmm(cel.ate)}</span>;
    curto = cel.pendente ? 'faltou o resto' : `faltam ${cel.faltamDias} dias`;
  } else if (cel.estado === 'falta') {
    texto = <span className="font-semibold text-hx-9a6f00">Falta</span>;
    curto = col.tipo === 'fatura' ? `venceu ${ddmm(cel.vence)}` : 'o mês acabou';
  } else if (cel.estado === 'andamento') {
    texto = <span className="text-gray-400">em andamento</span>;
  } else if (cel.estado === 'futuro') {
    texto = <span className="text-gray-400">{cel.vence ? `vence ${ddmm(cel.vence)}` : ''}</span>;
  }
  return (
    <td className={`group/cel relative h-[38px] border-b border-r border-gray-100 px-3 transition-[opacity,box-shadow] duration-100 last:border-r-0 hover:shadow-[inset_0_0_0_1.5px_var(--contorno-celula)] ${
      cel.estado === 'falta' ? 'bg-hx-fdf8ea' : ''} ${apagada ? 'opacity-30' : ''}`}
      onMouseEnter={(e) => onDica(e.currentTarget, detalhe(cel, col, comp))} onMouseLeave={() => onDica(null)}>
      <div className="flex items-center gap-2 whitespace-nowrap text-[12.5px]">
        {tipo !== 'outro' && <Ponto tipo={tipo} />}
        {tipo === 'na' ? null : texto}
        {curto && <span className="truncate text-[11.5px] text-gray-400">{curto}</span>}
        {/* O QUE ENTROU: o ↗ abre os lançamentos do mês (era o link da tela Faturas, que saiu em 29/10/2026). */}
        {cel.estado === 'ok' && (
          <span className="ml-auto shrink-0">
            <Tooltip label="Ver os lançamentos do mês">
              <button type="button" onClick={onAbrir} aria-label="Ver os lançamentos do mês"
                className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-[5px] border border-gray-200 bg-white text-gray-600 opacity-0 transition hover:bg-gray-50 focus:opacity-100 group-hover/cel:opacity-100">
                <IconAbrir className="h-3 w-3" />
              </button>
            </Tooltip>
          </span>
        )}
        {acao && (
          <span className="ml-auto shrink-0">
          <Tooltip label={col.tipo === 'fatura' ? `Importar a fatura ${col.cartao.nome}` : 'Importar o extrato'}>
            <button type="button" onClick={onAgir} aria-label="Importar"
              className={`botao-celula inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-[5px] border transition duration-150 ${
                cel.estado === 'falta' ? '' : 'opacity-0 focus:opacity-100 group-hover/cel:opacity-100'}`}>
              <IcoImportar className="block h-3.5 w-3.5" />
            </button>
          </Tooltip>
          </span>
        )}
      </div>
    </td>
  );
}

// A Situação: "2 de 3" com a barrinha (das fontes que DEVEM o mês).
function Situacao({ linha }) {
  const devidas = Object.values(linha.celulas).filter((c) => c.estado === 'ok' || c.pendente).length;
  const ok = Object.values(linha.celulas).filter((c) => c.estado === 'ok').length;
  if (!devidas) return <span className="text-gray-300">—</span>;
  const cheio = ok === devidas;
  return (
    <span className="inline-flex items-center gap-2 text-[12px]">
      <span className="h-[5px] w-[42px] overflow-hidden rounded-full bg-gray-100">
        <span className="block h-full rounded-full" style={{ width: `${(ok / devidas) * 100}%`, background: cheio ? COR.ok : COR.falta }} />
      </span>
      <span className={cheio ? 'text-green-700' : 'font-semibold text-hx-9a6f00'}>{ok} de {devidas}</span>
    </span>
  );
}

// O cartão do hover (portado ao body, ao lado da célula).
function Dica({ dica }) {
  if (!dica) return null;
  return createPortal(
    <div style={{ position: 'fixed', ...dica.pos, width: 260 }}
      className="pointer-events-none z-[70] animate-pop-in rounded-lg border border-elevado bg-elevado px-3 py-2.5 shadow-lg sombra-popover">
      <div className="text-[12px] font-semibold text-gray-800">{dica.info.titulo}</div>
      {dica.info.linhas.filter(Boolean).map((l) => <div key={l} className="mt-0.5 text-[12px] text-gray-600">{l}</div>)}
      {dica.info.acao && <div className="mt-1.5 border-t border-gray-100 pt-1.5 text-[11px] text-gray-400">O ↓ da célula abre o importador certo.</div>}
    </div>,
    document.body,
  );
}

// A LEGENDA EM CIMA (a do DRE): marcas clicáveis com a contagem; "Legenda" explica cada uma.
function Legenda({ conta, destaque, onDestaque }) {
  const [pos, setPos] = useState(null);
  const btn = useRef(null);
  useEscape(!!pos, () => setPos(null));
  useEffect(() => {
    if (!pos) return undefined;
    const fora = (e) => { if (!btn.current?.contains(e.target)) setPos(null); };
    document.addEventListener('mousedown', fora);
    return () => document.removeEventListener('mousedown', fora);
  }, [pos]);
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-gray-600">
      {MARCAS.map((m) => (
        <button key={m.id} type="button" onClick={() => onDestaque(m.id)} aria-pressed={destaque === m.id} title={`${m.explica} Clique para destacar.`}
          className={`-mx-1 inline-flex items-center gap-1.5 whitespace-nowrap rounded-[3px] px-1 py-[1px] transition-colors duration-[120ms] ${
            destaque === m.id ? 'bg-gray-200 text-gray-900' : 'hover:bg-gray-100 hover:text-gray-800 active:bg-gray-200'}`}>
          <Ponto tipo={m.id} />{m.rotulo}
          {m.id !== 'na' && <span className="text-gray-400">· {conta[m.id] ?? 0}</span>}
        </button>
      ))}
      {destaque && <button type="button" onClick={() => onDestaque(destaque)} className="text-[11.5px] text-gray-400 underline hover:text-gray-700">tirar o destaque</button>}
      <button ref={btn} type="button" aria-expanded={!!pos}
        onClick={() => setPos(pos ? null : posicionarPopover(btn.current, { largura: 340, altura: 260, alinhar: 'direita' }))}
        className={`ml-auto inline-flex h-[22px] items-center gap-1.5 whitespace-nowrap rounded-[4px] px-2 text-[11.5px] transition-colors ${
          pos ? 'bg-gray-100 text-gray-800' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-800'}`}>
        <span aria-hidden="true" className="grid h-[13px] w-[13px] place-items-center rounded-full border border-current text-[8.5px] font-bold leading-none">i</span>
        Legenda
      </button>
      {pos && createPortal(
        <div style={{ position: 'fixed', width: 340, ...pos }} className="z-[56] animate-pop-in rounded-[4px] border border-elevado bg-elevado px-3.5 py-3 text-[12px] leading-[1.45] text-gray-600 shadow-lg sombra-popover">
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400">Células</div>
          {MARCAS.map((m) => (
            <div key={m.id} className="flex items-start gap-2 py-[3px]"><span className="mt-[5px] flex w-3 justify-center"><Ponto tipo={m.id} /></span><span><b className="font-medium text-gray-800">{m.rotulo}</b> — {m.explica}</span></div>
          ))}
          <div className="mt-2 border-t border-gray-100 pt-2">A fatura DEVE o mês a partir do vencimento; o extrato, quando o mês acaba. O ↓ de cada célula abre o importador já com o cartão e o mês.</div>
        </div>,
        document.body,
      )}
    </div>
  );
}

// O que uma linha do histórico foi, em palavras.
function descrever(i) {
  if (i.tipo === 'fatura') {
    return {
      oque: `Fatura ${i.cartao?.nome ?? '(cartão excluído)'}${i.fatura?.vencimento ? ` · venc. ${ddmm(i.fatura.vencimento)}` : ''}`,
      periodo: i.competencia ? nomeCompetencia(i.competencia).toLowerCase() : '—',
    };
  }
  if (i.tipo === 'extrato') return { oque: 'Extrato da conta', periodo: i.periodo_de ? `${formatDate(i.periodo_de)} a ${formatDate(i.periodo_ate)}` : '—' };
  return { oque: 'Histórico da planilha', periodo: i.periodo_de ? `${competenciaCurta(i.periodo_de.slice(0, 7))} a ${competenciaCurta(i.periodo_ate.slice(0, 7))}` : '—' };
}

export default function Importar() {
  const toast = useToast();
  const confirmar = useConfirmacao();
  const navigate = useNavigate();
  const hoje = todayISO();
  const anoAtual = Number(hoje.slice(0, 4));
  const [dados, setDados] = useState(null);
  const [aba, setAba] = useState('mes');
  const [ano, setAno] = useState(anoAtual);
  const [soFalta, setSoFalta] = useState(false);
  const [destaque, setDestaque] = useState(null);
  const [dica, setDica] = useState(null);
  const [fatura, setFatura] = useState(null); // { inicial } do importador da fatura aberto
  const [arquivos, setArquivos] = useState(false);
  const [extrato, setExtrato] = useState(null); // { arquivo } do importador do extrato aberto (o arquivo é opcional)
  const [desfazendo, setDesfazendo] = useState(null);
  const [menu, setMenu] = useState(null);
  const [planilha, setPlanilha] = useState(null); // a linha do histórico da planilha aberta no pop-up
  const menuAbertoNoClique = useRef(false);

  const carregar = useCallback(async () => {
    try { setDados(await carregarSituacao()); } catch (err) { toast.error(err.message); setDados((d) => d ?? { cartoes: [], faturas: [], importacoes: null, extratos: null }); }
  }, [toast]);
  useEffect(() => { carregar(); }, [carregar]);

  const tabela = useMemo(() => (dados ? mesesDoAno({ ano, hoje, ...dados }) : null), [dados, ano, hoje]);
  // O que falta AGORA (o menu do ▾): sempre do ano corrente, qualquer que seja o ano da tela.
  const agora = useMemo(() => (dados ? mesesDoAno({ ano: anoAtual, hoje, ...dados }) : null), [dados, anoAtual, hoje]);
  const opcoesAno = useMemo(() => {
    const s = new Set([anoAtual]);
    (dados?.faturas ?? []).forEach((f) => s.add(Number(f.competencia.slice(0, 4))));
    (dados?.importacoes ?? []).forEach((i) => s.add(Number(i.criado_em.slice(0, 4))));
    return [...s].sort((a, b) => b - a).map((a) => ({ value: a, label: String(a), chip: `Ano: ${a}` }));
  }, [dados, anoAtual]);

  const conta = useMemo(() => {
    const c = {};
    (tabela?.linhas ?? []).forEach((l) => Object.values(l.celulas).forEach((x) => { const t = tipoDe(x); c[t] = (c[t] ?? 0) + 1; }));
    return c;
  }, [tabela]);
  const linhas = tabela ? tabela.linhas.filter((l) => !soFalta || Object.values(l.celulas).some((c) => c.pendente || c.estado === 'parcial')) : [];
  const historico = (dados?.importacoes ?? []).filter((i) => i.criado_em.startsWith(`${ano}-`));

  const agir = (col, cel) => {
    if (col.tipo === 'extrato') { setExtrato({}); return; }
    setFatura({ inicial: { cartaoId: col.cartao.id, vencimento: cel.vence ?? '' } });
  };
  const mostrarDica = useCallback((el, info) => {
    if (!el) { setDica(null); return; }
    setDica({ pos: posicionarPopover(el, { largura: 260, altura: 110, alinhar: 'esquerda', gap: 6 }), info });
  }, []);

  // O MENU DO ▾ (a opção B do mockup da tabela): o que falta, por mês, e "Importar arquivos…".
  const abrirMenu = (el) => {
    const r = el.getBoundingClientRect();
    const itens = [];
    (agora?.linhas ?? []).filter((l) => l.faltam > 0).forEach((l) => {
      itens.push({ grupo: `${mesNome(l.comp)} · falta` });
      agora.colunas.forEach((col) => {
        const cel = l.celulas[col.key];
        if (!cel.pendente) return;
        itens.push({
          rotulo: col.tipo === 'fatura' ? `Fatura ${col.cartao.nome}` : 'Extrato da conta',
          icone: col.tipo === 'fatura' ? <IcoCartao /> : <IcoBanco />,
          atalho: col.tipo === 'fatura' ? `venceu ${ddmm(cel.vence)}` : (cel.estado === 'parcial' ? `até ${ddmm(cel.ate)}` : 'o mês acabou'),
          onEscolher: () => agir(col, cel),
        });
      });
    });
    if (!itens.length) itens.push({ grupo: 'Nada falta importar' });
    itens.push({ sep: true });
    itens.push({ rotulo: agora?.faltam > 1 ? `Importar os ${agora.faltam} de uma vez…` : 'Importar arquivos…', icone: <IcoImportar />, sub: 'faturas e extrato juntos, arrastando os CSVs', onEscolher: () => setArquivos(true) });
    setMenu({ x: r.right - 280, y: r.bottom + 4, titulo: agora?.faltam ? `${agora.faltam} ${agora.faltam === 1 ? 'importação falta' : 'importações faltam'}` : 'Importar', itens });
  };

  // EXCLUIR uma importação. O extrato: qualquer um (antes só o último), para importar de novo o mês; o antigo (sem
  // o `desfazer`) conta antes quantos lançamentos vão sair, para a confirmação dizer.
  const desfazer = async (i) => {
    const d = descrever(i);
    let n = i.desfazer?.apagar?.length ?? 0;
    if (i.tipo === 'extrato' && !i.desfazer) {
      setDesfazendo(i.id);
      try { n = (await idsDoExtratoAntigo(i)).length; } catch (err) { toast.error(err.message); setDesfazendo(null); return; }
      setDesfazendo(null);
    }
    const restaura = i.desfazer?.restaurar?.length ?? 0;
    const ok = await confirmar({
      titulo: i.tipo === 'fatura' ? `Excluir a ${d.oque.replace(/^F/, 'f')}?` : `Excluir: ${d.oque}?`,
      texto: i.tipo === 'fatura'
        ? `A fatura e os ${i.linhas} lançamentos dela são apagados.`
        : `Os ${n} lançamentos que este extrato criou são apagados${restaura ? `, e os ${restaura} fixos que ele corrigiu voltam ao valor de antes` : ''}.${
          i.desfazer ? '' : ' Os fixos lançados à mão que ele corrigiu ficam como estão.'} Depois, é só importar o extrato de novo.`,
      confirmar: 'Excluir',
      perigo: true,
    });
    if (!ok) return;
    setDesfazendo(i.id);
    try { await desfazerImportacao(i); toast.success(i.tipo === 'fatura' ? 'Fatura excluída.' : 'Extrato excluído: pode importar de novo.'); await carregar(); } catch (err) { toast.error(err.message); }
    setDesfazendo(null);
  };

  const acaoHistorico = (i) => {
    if (i.tipo === 'fatura') {
      return i.fatura_id
        ? <button type="button" className="btn-secondary !px-2.5 !py-1 !text-[12px]" disabled={desfazendo === i.id} onClick={() => desfazer(i)} title="Apaga a fatura e os lançamentos dela">Excluir</button>
        : <span className="text-[11.5px] text-gray-400" title="A fatura foi substituída por outra importação ou excluída">substituída ou excluída</span>;
    }
    if (i.tipo === 'extrato') {
      return <button type="button" className="btn-secondary !px-2.5 !py-1 !text-[12px]" disabled={desfazendo === i.id} onClick={() => desfazer(i)} title="Apaga os lançamentos que este extrato criou (para importar de novo)">Excluir</button>;
    }
    return (
      <button type="button" onClick={() => setPlanilha(i)}
        className="inline-flex items-center gap-1 rounded-[5px] border border-gray-200 bg-white px-2.5 py-1 text-[12px] font-medium text-gray-700 transition-colors hover:bg-gray-50">
        Ver <IconSeta className="-rotate-90" />
      </button>
    );
  };

  const depois = async (extrato) => {
    setArquivos(false);
    await carregar();
    if (extrato) setExtrato({ arquivo: extrato });
  };

  const ICONE = 'flex h-9 items-center justify-center text-gray-600 transition-colors hover:bg-gray-50 active:bg-gray-200';

  return (
    <div>
      <CabecalhoPagina titulo="Importar"
        acessorio={<span className="hidden text-[12.5px] text-gray-500 sm:inline">o que entrou em cada mês, de cada fonte</span>}
        acoes={(
          // O GRUPO DO DRE: os ícones numa caixa só (o nome no tooltip), e o ▾ com o que falta importar.
          <div className="inline-flex overflow-hidden rounded-md border border-gray-300 bg-white">
            <Tooltip label="Importar arquivos (faturas e extrato)">
              <button type="button" aria-label="Importar arquivos" onClick={() => setArquivos(true)} disabled={!dados} className={`${ICONE} w-[38px]`}>
                <IcoImportar />
              </button>
            </Tooltip>
            <Tooltip label={agora?.faltam ? `${agora.faltam} a importar` : 'Opções de importação'}>
              <button type="button" aria-label="Opções de importação" aria-haspopup="menu" aria-expanded={!!menu} disabled={!dados}
                onMouseDown={() => { menuAbertoNoClique.current = !!menu; }}
                onClick={(e) => { if (menuAbertoNoClique.current || menu) { menuAbertoNoClique.current = false; setMenu(null); } else abrirMenu(e.currentTarget); }}
                className={`${ICONE} relative w-[28px] border-l border-gray-200 ${menu ? 'bg-gray-100' : ''}`}>
                <IconSeta className={`transition-transform duration-200 ease-out ${menu ? 'rotate-180' : ''}`} />
                {agora?.faltam > 0 && <span className="absolute right-[4px] top-[6px] h-[6px] w-[6px] rounded-full bg-hx-f59e0b" />}
              </button>
            </Tooltip>
          </div>
        )} />

      {!dados ? <PageLoading /> : (
        <div className="mt-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2.5">
            <AbasPilula abas={ABAS} valor={aba} onChange={setAba} variante="claro" altura={31} folga={3} />
            <FaixaProvider>
              <Trilho>
                <SegUnico id="ano" rotulo="Ano" opcoes={opcoesAno} value={ano} onChange={setAno} padrao={anoAtual} mostraPadrao largura={150} />
                {aba === 'mes' && (
                  <>
                    <DivisorFaixa />
                    {/* A CHAVE DO DRE ("Custos V/F/C", "Centavos"): o rótulo clicável e o interruptor compacto. */}
                    <div className="flex h-[25px] items-center gap-2 px-2">
                      <button type="button" tabIndex={-1} aria-hidden="true" onClick={() => setSoFalta((v) => !v)}
                        className="whitespace-nowrap text-[12px] font-medium text-gray-600">Só o que falta</button>
                      <Toggle compacto rotulo="Mostrar só os meses em que falta importar" checked={soFalta} onChange={setSoFalta} />
                    </div>
                  </>
                )}
              </Trilho>
            </FaixaProvider>
          </div>

          {aba === 'mes' ? (
            <>
              <Legenda conta={conta} destaque={destaque} onDestaque={(d) => setDestaque((x) => (x === d ? null : d))} />
              <div className="card overflow-x-auto">
                {dados.extratos === null && (
                  <p className="border-b border-gray-100 bg-hx-fdf8ea px-4 py-2 text-[12px] text-hx-9a6f00">
                    A coluna do extrato e o histórico precisam da migration <code>007_importacoes.sql</code> (Supabase → SQL Editor).
                  </p>
                )}
                <table className="w-full min-w-[640px] border-separate border-spacing-0 text-[12.5px]">
                  <thead className="bg-hx-f9fafb">
                    <tr>
                      <th className="table-th w-[150px] border-b border-r border-gray-100">Mês</th>
                      {tabela.colunas.map((c) => (
                        <th key={c.key} className="table-th border-b border-r border-gray-100">
                          <span className="inline-flex items-center gap-1.5">{c.tipo === 'fatura' ? <IcoCartao className="h-3 w-3" /> : <IcoBanco className="h-3 w-3" />}{c.tipo === 'fatura' ? `Fatura ${c.cartao.nome}` : 'Extrato da conta'}</span>
                          <span className="block text-[10.5px] font-normal normal-case tracking-normal text-gray-400">
                            {c.tipo === 'fatura' ? `vence dia ${c.cartao.dia_vencimento}${c.cartao.ativo ? '' : ' · inativo'}` : 'Nubank · CSV'}
                          </span>
                        </th>
                      ))}
                      <th className="table-th w-[120px] border-b border-gray-100">Situação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {linhas.map((l) => (
                      <tr key={l.comp} className="group/linha transition-colors hover:bg-hx-f9fafb">
                        <td className="h-[38px] border-b border-r border-gray-100 px-3 font-semibold text-gray-800" style={l.atual ? { boxShadow: 'inset 2px 0 0 #e8a317' } : undefined}>
                          {mesNome(l.comp)}
                          {l.atual && <span className="ml-2 rounded-[4px] bg-hx-fdf3d9 px-1.5 py-px text-[10px] font-semibold text-hx-9a6f00">atual</span>}
                        </td>
                        {tabela.colunas.map((c) => {
                          const cel = l.celulas[c.key];
                          return (
                            <Celula key={c.key} cel={cel} col={c} comp={l.comp} apagada={destaque && tipoDe(cel) !== destaque}
                              onAgir={() => { setDica(null); agir(c, cel); }} onAbrir={() => { setDica(null); lsSet('lancamentos_mes', l.comp); navigate('/lancamentos'); }} onDica={mostrarDica} />
                          );
                        })}
                        <td className="h-[38px] border-b border-gray-100 px-3"><Situacao linha={l} /></td>
                      </tr>
                    ))}
                    {linhas.length === 0 && (
                      <tr><td colSpan={tabela.colunas.length + 2} className="px-4 py-6 text-center text-[12.5px] text-gray-500">Nada falta em {ano}.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <div className="card overflow-x-auto">
              {dados.importacoes === null ? (
                <p className="px-4 py-6 text-[12.5px] text-gray-600">
                  O histórico precisa da migration <code>007_importacoes.sql</code>: cole no Supabase → SQL Editor e rode. Ela também
                  preenche o que você já importou.
                </p>
              ) : (
                <table className="w-full min-w-[760px] text-[12.5px]">
                  <thead className="bg-hx-f9fafb">
                    <tr>
                      <th className="table-th">Quando</th><th className="table-th">O quê</th><th className="table-th">Arquivo</th>
                      <th className="table-th">Período</th><th className="table-th">Resultado</th><th className="table-th" />
                    </tr>
                  </thead>
                  <tbody>
                    {historico.map((i) => {
                      const d = descrever(i);
                      return (
                        <tr key={i.id} className="transition-colors hover:bg-hx-f9fafb">
                          <td className="whitespace-nowrap border-b border-gray-100 px-3 py-2 text-gray-500">{formatDateTime(i.criado_em)}</td>
                          <td className="whitespace-nowrap border-b border-gray-100 px-3 py-2 font-medium text-gray-800">
                            <span className="inline-flex items-center gap-2">{i.tipo === 'fatura' ? <IcoCartao /> : i.tipo === 'extrato' ? <IcoBanco /> : <IcoPlanilha />}{d.oque}</span>
                          </td>
                          <td className="max-w-[220px] truncate border-b border-gray-100 px-3 py-2 text-gray-500" title={i.arquivo}>{i.arquivo || '—'}</td>
                          <td className="whitespace-nowrap border-b border-gray-100 px-3 py-2 text-gray-700">{d.periodo}</td>
                          <td className="border-b border-gray-100 px-3 py-2 text-gray-500">
                            {i.resumo}{i.tipo === 'fatura' && i.total_centavos ? ` · ${formatBRL(i.total_centavos)}` : ''}
                          </td>
                          <td className="whitespace-nowrap border-b border-gray-100 px-3 py-2 text-right">{acaoHistorico(i)}</td>
                        </tr>
                      );
                    })}
                    {historico.length === 0 && (
                      <tr><td colSpan={6} className="px-4 py-6 text-center text-gray-500">Nenhuma importação em {ano}.</td></tr>
                    )}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>
      )}

      <Dica dica={dica} />
      {planilha && <ModalPlanilha imp={planilha} onMudou={carregar} onFechar={() => setPlanilha(null)} onDesfeito={() => { setPlanilha(null); carregar(); }} />}
      <MenuContexto menu={menu} onFechar={() => setMenu(null)} />
      {fatura && (
        <ImportarFatura cartoes={dados.cartoes} inicial={fatura.inicial} onFechar={() => setFatura(null)}
          onImportada={() => { setFatura(null); carregar(); }} />
      )}
      {arquivos && <ImportarArquivos cartoes={dados.cartoes} onFechar={() => setArquivos(false)} onFeito={depois} />}
      {extrato && <ImportarExtrato arquivo={extrato.arquivo} onFechar={() => setExtrato(null)} onImportado={() => { setExtrato(null); carregar(); }} />}
    </div>
  );
}
