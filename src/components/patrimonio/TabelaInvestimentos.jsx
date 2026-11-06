import { useEffect, useMemo, useRef, useState } from 'react';
import Tooltip from '../Tooltip.jsx';
import AbasPilula from '../AbasPilula.jsx';
import Toggle from '../Toggle.jsx';
import BalaoGrafico, { useBalao } from '../graficos/BalaoGrafico.jsx';
import { COR_ENTRADAS } from '../graficos/Graficos.jsx';
import { COR_FALTOU, MiniCurva } from '../graficos/GraficosVisao.jsx';
import { Etiqueta } from '../Comuns.jsx';
import { CirculoMais, IconAplicar, IconExpandirTudo, IconFicha, IconLapis, IconLixeira, IconResgatar, IconSetaOrdenacao } from '../icons.jsx';
import EditorInvestimento from './EditorInvestimento.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import useLinhasAnimadas, { atributosLinha } from '../../lib/useLinhasAnimadas.js';
import { formatBRL } from '../../lib/dinheiro.js';
import { competenciaCurta, formatDate, mascaraData, nomeCompetencia } from '../../lib/format.js';
import { ehPopup, lerCelula, modoDaCelula, moverAtiva, proximaEditavel, textoDaCelula } from '../../lib/carteiraEditavel.js';
import { lsGet, lsSet } from '../../lib/storage.js';
import {
  impostoGarantia, linhaMesAMes, nomeTipoInvestimento, ordenarCarteira, proximaOrdemCarteira, rotuloLiquidez, rotuloRende,
} from '../../lib/investimentos.js';
import { rotuloPeloIndice } from '../../lib/valorEstimado.js';
import { COR_CDI, cdiFechado } from './GraficoPatrimonio.jsx';

// A TABELA DOS INVESTIMENTOS (05/11/2026, opção A do mockup "Patrimônio · a tabela", com a B como segunda vista):
//   · CARTEIRA (A): a instituição é o grupo (recolhe animado, `useLinhasAnimadas`), os investimentos embaixo e, dentro de
//     cada um, os APORTES — a liquidez, o vencimento, o aplicado, o que vale hoje, o líquido, o que rendeu, o % do ano e a
//     curva dos 12 meses. É uma PLANILHA (06/11/2026, a opção A do mockup "Carteira editável"): a célula ativa e o teclado
//     dos Lançamentos, cada célula grava sozinha, e as linhas "+ aporte", "+ investimento" e "+ instituição" acrescentam
//     ali mesmo. A seta do cabeçalho ordena DENTRO de cada instituição.
//   · MÊS A MÊS (B): a Grupo × mês da Visão geral — o que cada título rendeu em cada mês (R$ ou %), o tom mais forte é
//     o melhor mês da linha, o hover é a CRUZ (célula com contorno, linha e coluna acesas) e o balão traz o CDI.
// No canto, o ⇕ expandir / recolher tudo (06/11/2026: o ⬇ CSV e o ⤢ ampliar saíram, a pedido — o CSV está no ▾ da tela e o
// ampliado não acrescentava nada a esta tabela). A vista, as contas recolhidas e a ordem ficam lembradas no navegador
// (só a preferência, nunca valor).

export const CORES_CONTA = ['var(--serie-gastos)', 'var(--origem-fixo)', 'var(--serie-sobrou)', 'var(--serie-entradas)', 'var(--origem-manual)', 'var(--origem-cartao)'];
const MESES_CURTOS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const reais = (c) => `R$ ${Math.round(c / 100).toLocaleString('pt-BR')}`;
const inteiro = (c) => Math.round(c / 100).toLocaleString('pt-BR');
// OS CENTAVOS (06/11/2026, a pedido): o interruptor do cabeçalho troca o formato das duas tabelas — ligado, todo valor com
// os centavos ("R$ 115.404,08"; no mês a mês, "1.234,56"); desligado, em reais redondos. Lembrado em `patrimonio_centavos`.
const comCentavos = (c) => (Number(c) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const formatos = (centavos) => (centavos ? { reais: (c) => `R$ ${comCentavos(c)}`, inteiro: comCentavos } : { reais, inteiro });
const pctTexto = (f, casas = 2) => (f === null || f === undefined ? '—' : `${f >= 0 ? '' : '−'}${Math.abs(f * 100).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas })}%`);
const sinal = (c) => (c > 0 ? '+' : c < 0 ? '−' : '');
const BTN = 'flex h-7 w-[30px] items-center justify-center text-gray-600 transition-colors hover:bg-gray-50 active:bg-gray-200';
// O BALÃO SAI quando o cursor passa a uma célula SEM balão (06/11/2026: ele ficava preso — o da linha do investimento
// seguia aceso sobre os depósitos, que não têm balão — e só saía ao deixar a tabela). Todo `aoMover` vai pelo `mover`, que
// MARCA o evento; a caixa da tabela, no fim da bolha, fecha o balão quando ninguém marcou.
const comMarca = (balao) => (chave) => (e) => { e.nativeEvent.comBalao = true; balao.aoMover(chave)(e); };
const fecharFora = (balao) => (e) => { if (!e.nativeEvent.comBalao && balao.ativo) balao.aoSair(); };
const lerJson = (k, padrao) => { try { const v = JSON.parse(lsGet(k) ?? 'null'); return v ?? padrao; } catch { return padrao; } };

// AS AÇÕES DA LINHA (06/11/2026, a opção A do mockup "Ficha do investimento"): todas no MESMO quadrado do ✎ — 30px, a
// mesma borda e o fundo mais escuro (o `bg-white`, que no escuro é o mais fundo), o nome no tooltip. No lugar:
// + investimento novo · ✎ o lugar; no investimento: aplicar (moedas +) · resgatar (moedas −) · ✎ a ficha. Antes eram
// três desenhos ("+ investimento" e "↑ Aplicar" escritos, o ✎ só ícone). O ícone vai numa caixa de PX INTEIROS com
// `grid place-items-center`: o "+" fica no centro óptico (nunca o caractere "+", que não centra).
const ACAO_ICONE = 'grid h-[30px] w-[30px] shrink-0 place-items-center rounded-[7px] border border-gray-300 bg-white text-gray-600 transition-colors hover:bg-gray-50 hover:text-gray-900 active:bg-gray-200';
const BotaoLinha = ({ titulo, onClick, children }) => (
  <Tooltip label={titulo}>
    <button type="button" onClick={onClick} aria-label={titulo} className={ACAO_ICONE}>{children}</button>
  </Tooltip>
);
const IconChevron = ({ aberto }) => (
  <svg viewBox="0 0 24 24" className={`h-[12px] w-[12px] shrink-0 text-gray-500 transition-[transform,color] duration-150 group-hover/seta:text-gray-800 ${aberto ? 'rotate-90' : ''}`} fill="none"
    stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M9 6l6 6-6 6" />
  </svg>
);
// A SETA DE ABRIR com o QUADRADO no hover (o do Gestor, 06/11/2026, a pedido): 20px, o fundo cinza e a seta mais forte —
// separa o clique dela (abre ou fecha) do clique no nome (a ficha). TUDO EM PX INTEIROS (o quadrado de 20, a seta de 12,
// a margem de −4): com o `h-3`/`h-5` do rem de 14px eram 10,5 e 17,5 px, e a seta de traço fino saía borrada, meio
// pixel fora do lugar. A margem negativa a deixa ocupando só os 12px da seta.
const QUADRADO_SETA = 'group/seta -m-[4px] inline-flex h-[20px] w-[20px] shrink-0 items-center justify-center rounded-[4px] transition-colors hover:bg-gray-200';
const SetaAbre = ({ aberto }) => <span className={QUADRADO_SETA}><IconChevron aberto={aberto} /></span>;

// A pílula da liquidez: azul (a cor dos gastos, que lê como "dinheiro à mão") na diária; cinza nas outras.
function PilulaLiquidez({ x }) {
  const texto = rotuloLiquidez(x.inv);
  return x.diaria ? (
    <span className="inline-flex h-[20px] items-center whitespace-nowrap rounded-full px-2 text-[11px] font-semibold"
      style={{ background: 'color-mix(in srgb, var(--serie-gastos) 13%, transparent)', color: 'var(--serie-gastos)' }}>{texto}</span>
  ) : <span className="inline-flex h-[20px] items-center whitespace-nowrap rounded-full bg-gray-100 px-2 text-[11px] font-semibold text-gray-600">{texto}</span>;
}

// A COLUNA RESGATE (06/11/2026, "Patrimônio do zero": liquidez e vencimento eram duas colunas que se repetiam): a pílula
// de quando o dinheiro sai (diária em azul) e, embaixo, o vencimento — perto (até 12 meses) ou vencido em âmbar — ou, no
// "cada aplicação vence", a próxima aplicação que vence e se ela reaplica.
function Resgate({ x }) {
  const p = x.prazos?.proximo;
  return (
    <span className="inline-flex flex-col items-start gap-0.5">
      {x.inv.liquidez === 'por_aplicacao' ? (
        <span className="inline-flex h-[20px] items-center whitespace-nowrap rounded-full px-2 text-[11px] font-semibold"
          style={{ background: 'color-mix(in srgb, var(--serie-sobrou) 15%, transparent)', color: 'var(--serie-sobrou)' }}>{rotuloLiquidez(x.inv)}</span>
      ) : <PilulaLiquidez x={x} />}
      {x.inv.liquidez === 'por_aplicacao'
        ? <span className="text-[11.5px] text-gray-500">{p ? <>próxima {p.vence.slice(5, 7)}/{p.vence.slice(0, 4)} · {x.inv.ao_vencer === 'volta' ? 'volta' : 'reaplica'}</> : 'sem a data das aplicações'}</span>
        : <Vence x={x} />}
    </span>
  );
}

// O vencimento: perto (até 12 meses) ou vencido em âmbar, com a data (06/11/2026, a pedido: "vai de 03/09 até 02/09"); senão
// a data inteira — e a barrinha do tempo que já passou.
const dataCurtaV = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(2, 4)}`;
function Vence({ x }) {
  const v = x.venc;
  if (!v) return null;
  return (
    <span className="inline-flex flex-col items-start" title={`Vence em ${formatDate(v.data)}`}>
      {v.vencido ? <Etiqueta tom="ambar">venceu {formatDate(v.data)}</Etiqueta>
        : v.perto ? <Etiqueta tom="ambar">{v.dias <= 45 ? `em ${v.dias} ${v.dias === 1 ? 'dia' : 'dias'}` : `em ${v.meses} meses`} · {dataCurtaV(v.data)}</Etiqueta>
          : <span className="text-[12.5px] tabular-nums text-gray-700">vence {formatDate(v.data)}</span>}
      {v.frac !== null && (
        <span className="mt-1 block h-1 w-[84px] overflow-hidden rounded-full bg-gray-100" aria-hidden="true">
          <span className="block h-full rounded-full" style={{ width: `${Math.max(4, v.frac * 100)}%`, background: 'var(--origem-fixo)' }} />
        </span>
      )}
    </span>
  );
}

// ------------------------------------------------------------ A: a carteira
const COLUNAS_A = [
  { id: 'nome', rotulo: 'Investimento', alinha: 'left' },
  { id: 'resgate', rotulo: 'Resgate', alinha: 'left', desk: true },
  { id: 'aplicado', rotulo: 'Aplicado', desk: true },
  { id: 'vale', rotulo: 'Vale hoje' },
  { id: 'liquido', rotulo: 'Líquido ≈' },
  { id: 'rendeu', rotulo: 'Rendeu' },
  { id: 'ano', rotulo: 'Em ', desk: true },
  { id: 'curva', rotulo: '12 meses', semOrdem: true, desk: true },
];

// OS APORTES DENTRO DO INVESTIMENTO (06/11/2026, o mockup "Depósitos em cascata"; "aporte" no lugar de "depósito", a
// pedido): todo investimento com dinheiro abre nos aportes dele, do mais novo ao mais antigo — o aplicado, o que vale, o
// líquido e o rendimento (≈), a ALÍQUOTA de hoje na coluna Resgate e quando ela cai (`estimarImposto`).
const TOM_ALIQUOTA = { 0.225: 'vermelho', 0.2: 'ambar', 0.175: 'cinza', 0.15: 'verde' };
const pctAliq = (a) => `${(a * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
const dataCurta = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(2, 4)}`;
export const temAportes = (x) => !!x.imposto && x.imposto.lotes.length > 0;

// A HIERARQUIA (06/11/2026, a pedido: "tudo se mistura"): três níveis que se leem de longe —
//   · a INSTITUIÇÃO é uma FAIXA: o fundo cinza, a barra da cor dela à esquerda, o nome em 14px e os totais em negrito;
//   · o INVESTIMENTO, recuado, em duas linhas: o nome e, embaixo, o tipo e a taxa;
//   · o APORTE, recuado de novo, numa linha só, menor e mais claro, pendurado no investimento por um TRILHO (a linha que
//     desce da seta dele).
// Os recuos em px INTEIROS: o nome da instituição em 32; a seta do investimento em 30 (o centro em 40, onde desce o
// trilho) e o nome dele em 56; o texto do aporte em 80. As linhas de acrescentar começam no recuo do nível delas.
const RECUO_APORTE = 80;
const Trilho = ({ ultimo }) => (
  <>
    <span aria-hidden="true" className={`pointer-events-none absolute left-[40px] top-0 w-px bg-gray-300 ${ultimo ? 'h-1/2' : 'bottom-0'}`} />
    <span aria-hidden="true" className="pointer-events-none absolute left-[40px] top-1/2 h-px w-[30px] bg-gray-300" />
  </>
);
const IconX = () => (
  <svg viewBox="0 0 24 24" className="h-[14px] w-[14px]" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
);
const Kbd = ({ children }) => (
  <kbd className="rounded-[4px] border border-b-2 border-gray-300 bg-white px-1 font-mono text-[10.5px] leading-[16px] text-gray-600">{children}</kbd>
);

// O CAMPO DENTRO DA CÉLULA (a carteira editável): o texto começa onde o da célula começa (`recuo`); Enter, Tab, as setas
// de cima e de baixo e Esc dizem para onde ir (`onFim(como, texto)`); sair do campo grava. A data ganha as barras sozinha.
function EditorCelula({ ed, onTexto, onFim, alinha, recuo = 12 }) {
  const ref = useRef(null);
  const feito = useRef(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    if (ed.digitado) el.setSelectionRange(el.value.length, el.value.length); else el.select();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const fim = (como, texto) => { if (feito.current) return; feito.current = true; onFim(como, texto); };
  const teclas = (e) => {
    const como = { Enter: 'enter', Escape: 'esc', ArrowUp: 'cima', ArrowDown: 'baixo' }[e.key] ?? (e.key === 'Tab' ? (e.shiftKey ? 'tabAntes' : 'tab') : null);
    if (!como) return;
    e.preventDefault();
    e.stopPropagation();
    fim(como, e.currentTarget.value);
  };
  return (
    <input ref={ref} value={ed.texto} onKeyDown={teclas} onBlur={(e) => fim('blur', e.target.value)} onMouseDown={(e) => e.stopPropagation()}
      onChange={(e) => onTexto(ed.modo === 'data' || ed.modo === 'vencimento' ? mascaraData(e.target.value) : e.target.value)}
      inputMode={ed.modo === 'valor' ? 'decimal' : ed.modo === 'data' || ed.modo === 'vencimento' ? 'numeric' : undefined}
      placeholder={ed.modo === 'data' ? 'dd/mm/aaaa' : ed.modo === 'vencimento' ? 'vence em dd/mm/aaaa (vazio: a regra)' : ed.modo === 'valor' ? '0,00' : 'o nome'} aria-label="Editar a célula"
      className={`absolute inset-0 z-20 h-full w-full border-0 bg-white pr-3 text-[13px] text-gray-900 outline-none placeholder:text-gray-400 ${alinha === 'right' ? 'text-right tabular-nums' : ''}`}
      style={{ paddingLeft: recuo, boxShadow: 'inset 0 0 0 2px var(--grade-sel)' }} />
  );
}

function TabelaCarteira({
  todas, visiveis, recolhidas, alternar, ordem, onOrdenar, total, ano, movel, acoes, edicao, hoje, cdi, centavos = false,
  abertosInv = new Set(), alternarInv = () => {}, abrirInv = () => {},
}) {
  const toast = useToast();
  const { reais } = formatos(centavos); // com ou sem os centavos (o interruptor do cabeçalho)
  const caixaRef = useRef(null);
  const desenhadas = useLinhasAnimadas(todas, visiveis, caixaRef);
  const balao = useBalao(280, 170);
  const mover = comMarca(balao);
  const [sobLinha, setSobLinha] = useState(null);
  const desk = (c) => (c.desk && movel ? 'hidden' : '');
  const th0 = 'sticky top-0 z-20 whitespace-nowrap border-b border-gray-200 bg-hx-f9fafb px-3 py-2 text-[10.5px] font-semibold uppercase tracking-wide';
  const aceso = (id) => (sobLinha === id ? 'gm-acesa' : '');

  // ------------------------------------------------ A PLANILHA (06/11/2026, a opção A do mockup "Carteira editável")
  // A célula ativa e o teclado, como a grade dos Lançamentos: clicar seleciona, clicar de novo (ou Enter, ou digitar)
  // edita, Enter grava e desce, Tab vai à próxima que se edita, Esc desiste, Ctrl+Z desfaz, Delete exclui o aporte. O
  // nome, a taxa e o resgate do investimento abrem num pop-up (`EditorInvestimento`); o resto é um campo na célula. Cada
  // célula grava sozinha (`edicao`, de useEdicaoCarteira.js); as calculadas só se selecionam.
  const editavel = !!edicao && !movel;
  const [ativa, setAtiva] = useState(null); // { id, col }
  const [editor, setEditorEstado] = useState(null); // { id, col, modo, texto, digitado }
  const editorRef = useRef(null);
  const setEditor = (e) => { editorRef.current = e; setEditorEstado(e); };
  const [pop, setPopEstado] = useState(null); // { id, col, modo, nome, ancora }
  const popRef = useRef(null);
  const setPop = (p) => { popRef.current = p; setPopEstado(p); };
  const [rascunhos, setRascunhos] = useState({}); // a linha "+ aporte" de cada investimento: { [invId]: { data, valor } }
  const [otimista, setOtimista] = useState({}); // o que foi digitado, até a tela reler: { 'id|col': texto }
  const porId = useMemo(() => new Map(todas.map((l) => [l.id, l])), [todas]);
  const chave = (id, col) => `${id}|${col}`;
  const focar = () => caixaRef.current?.focus({ preventScroll: true });
  const celulaEl = (id, col) => caixaRef.current?.querySelector(`[data-cel="${chave(id, col)}"]`);
  const rascunhoDe = (l) => ({ data: hoje, valor: '', ...(rascunhos[l.x.inv.id] ?? {}) });
  // O RASCUNHO VAZIO NÃO FICA (06/11/2026, a pedido: o clique sem querer na linha deixava a data e o campo presos): sem
  // valor e com a data de hoje, ele não se guarda — sair da linha a devolve ao "Novo aporte". Esc, Delete e o ✕ desistem.
  const vazioRasc = (r) => !r || (!String(r.valor ?? '').trim() && (!r.data || r.data === hoje) && !r.venc);
  const guardarRasc = (invId, r) => setRascunhos((s) => { const n = { ...s }; if (vazioRasc(r)) delete n[invId]; else n[invId] = r; return n; });
  const desistir = (l) => {
    setRascunhos((s) => { const n = { ...s }; delete n[l.x.inv.id]; return n; });
    if (editorRef.current?.id === l.id) setEditor(null);
    setAtiva(null);
    focar();
  };
  const comOtimista = (k, txt) => setOtimista((o) => ({ ...o, [k]: txt }));
  const semOtimista = (k) => setOtimista((o) => { const n = { ...o }; delete n[k]; return n; });

  // a célula ativa à vista (a página rola o necessário)
  useEffect(() => { if (ativa) celulaEl(ativa.id, ativa.col)?.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }, [ativa]); // eslint-disable-line react-hooks/exhaustive-deps

  const iniciar = (l, col, digitado) => {
    const modo = editavel ? modoDaCelula(l, col) : null;
    if (!modo) return;
    if (ehPopup(modo)) {
      if (modo === 'resgate' && digitado !== undefined) return; // o resgate é uma lista: digitar não abre
      setPop({ id: l.id, col, modo, nome: digitado, ancora: celulaEl(l.id, col) });
      return;
    }
    const texto = digitado !== undefined ? (modo === 'data' ? mascaraData(digitado) : digitado) : textoDaCelula(l, col, l.tipo === 'novoAporte' ? rascunhoDe(l) : null);
    setEditor({ id: l.id, col, modo, texto, digitado: digitado !== undefined });
  };

  const andar = (como, de) => {
    if (como === 'enter' || como === 'baixo') setAtiva(moverAtiva(visiveis, de, 1, 0));
    else if (como === 'cima') setAtiva(moverAtiva(visiveis, de, -1, 0));
    else if (como === 'tab') setAtiva(proximaEditavel(visiveis, de, 1));
    else if (como === 'tabAntes') setAtiva(proximaEditavel(visiveis, de, -1));
  };

  // grava a célula (em segundo plano: a tela já andou) e mostra o que foi digitado até a releitura
  const gravar = async (l, col, modo, texto) => {
    const r = lerCelula(modo, texto, hoje);
    if (!r.ok) { toast.error(r.erro); return; }
    const k = chave(l.id, col);
    comOtimista(k, modo === 'data' ? formatDate(r.valor) : modo === 'vencimento' ? (r.valor ? `vence ${dataCurta(r.valor)}` : 'a regra…') : modo === 'valor' ? formatBRL(r.valor) : r.valor);
    if (l.tipo === 'grupo') await edicao.renomearInstituicao(l.g.conta, r.valor);
    else if (l.tipo === 'inv') { await edicao.valeHoje(l.x, r.valor); focar(); }
    else if (l.tipo === 'lote') await edicao.mudarAporte(l, col === 'nome' ? 'data' : col === 'resgate' ? 'vencimento' : 'valor', r.valor);
    semOtimista(k);
  };

  // A LINHA "+ APORTE": um rascunho só na tela até ter a data (hoje, se não mudar) e o valor; com os dois, vira o aporte. O
  // vencimento (o Tab depois da data) é opcional: vazio, a regra do investimento.
  const irValor = (l, rasc) => { setAtiva({ id: l.id, col: 'aplicado' }); setEditor({ id: l.id, col: 'aplicado', modo: 'valor', texto: rasc.valor, digitado: true }); };
  const fimRascunho = async (l, col, como, texto) => {
    const invId = l.x.inv.id;
    const rasc = rascunhoDe(l);
    if (col === 'nome') {
      if (String(texto).trim()) {
        const r = lerCelula('data', texto, hoje);
        if (!r.ok) { toast.error(r.erro); focar(); return; }
        rasc.data = r.valor;
      }
      guardarRasc(invId, rasc);
      if (como === 'enter') { irValor(l, rasc); return; }
      if (como === 'tab') { setAtiva({ id: l.id, col: 'resgate' }); setEditor({ id: l.id, col: 'resgate', modo: 'vencimento', texto: textoDaCelula(l, 'resgate', rasc), digitado: false }); return; }
      andar(como, { id: l.id, col });
      if (como !== 'blur') focar();
      return;
    }
    if (col === 'resgate') { // o vencimento do aporte novo (vazio: a regra do investimento)
      const r = lerCelula('vencimento', texto, hoje);
      if (!r.ok) { toast.error(r.erro); focar(); return; }
      rasc.venc = r.valor;
      guardarRasc(invId, rasc);
      if (como === 'enter' || como === 'tab') { irValor(l, rasc); return; }
      if (como === 'tabAntes') { setAtiva({ id: l.id, col: 'nome' }); setEditor({ id: l.id, col: 'nome', modo: 'data', texto: textoDaCelula(l, 'nome', rasc), digitado: false }); return; }
      andar(como, { id: l.id, col });
      if (como !== 'blur') focar();
      return;
    }
    rasc.valor = texto;
    guardarRasc(invId, rasc);
    if (como === 'tabAntes') { setAtiva({ id: l.id, col: 'resgate' }); setEditor({ id: l.id, col: 'resgate', modo: 'vencimento', texto: textoDaCelula(l, 'resgate', rasc), digitado: false }); return; }
    if (como !== 'enter') { andar(como, { id: l.id, col }); if (como !== 'blur') focar(); return; }
    focar();
    if (!String(texto).trim()) return;
    const r = lerCelula('valor', texto, hoje);
    if (!r.ok || !(r.valor > 0)) { toast.error(r.ok ? 'O aporte precisa de um valor.' : r.erro); return; }
    const k = chave(l.id, 'aplicado');
    comOtimista(k, formatBRL(r.valor));
    const res = await edicao.novoAporte(l.x, rasc.data, r.valor, rasc.venc ?? null);
    semOtimista(k);
    if (res.ok) setRascunhos((s) => { const n = { ...s }; delete n[invId]; return n; });
    focar();
  };

  const fimEditor = (como, texto) => {
    const ed = editorRef.current;
    if (!ed) return;
    setEditor(null);
    const l = porId.get(ed.id);
    if (como === 'esc' && l?.tipo === 'novoAporte') { desistir(l); return; } // Esc na linha "+ aporte": desiste dele
    if (como === 'esc' || !l) { focar(); return; }
    if (l.tipo === 'novoAporte') { fimRascunho(l, ed.col, como, texto); return; }
    if (l.tipo === 'novaInst') {
      focar();
      if (como === 'blur' || !String(texto).trim()) return;
      const r = lerCelula('texto', texto, hoje);
      edicao.novaInstituicao(r.valor).then((res) => { if (res.ok && res.valor) { setAtiva({ id: `ni:${res.valor}`, col: 'nome' }); focar(); } });
      return;
    }
    if (texto !== textoDaCelula(l, ed.col)) gravar(l, ed.col, ed.modo, texto);
    andar(como, { id: l.id, col: ed.col });
    if (como !== 'blur') focar();
  };

  const fimPop = (p, mudancas) => {
    if (popRef.current !== p) return;
    setPop(null);
    focar();
    if (!mudancas) return;
    const l = porId.get(p.id);
    if (!l) return;
    if (l.tipo === 'novoInv') {
      edicao.novoInvestimento(mudancas).then((res) => {
        if (!res.ok || !res.valor) return;
        abrirInv(res.valor);
        setAtiva({ id: `na:${res.valor}`, col: 'aplicado' });
        focar();
      });
      return;
    }
    edicao.mudarInvestimento(l.x.inv, mudancas);
  };

  const excluir = (l) => { edicao.excluirAporte(l).then(() => focar()); };

  const teclas = (e) => {
    if (!editavel || e.target !== e.currentTarget) return;
    const ctrl = e.ctrlKey || e.metaKey;
    if (ctrl && (e.key === 'z' || e.key === 'Z')) { e.preventDefault(); edicao.desfazer(); return; }
    const setas = { ArrowDown: [1, 0], ArrowUp: [-1, 0], ArrowRight: [0, 1], ArrowLeft: [0, -1] };
    if (!ativa) {
      if (setas[e.key] || e.key === 'Enter') { e.preventDefault(); setAtiva(moverAtiva(visiveis, null, 0, 0)); }
      return;
    }
    const l = porId.get(ativa.id);
    if (setas[e.key]) { e.preventDefault(); setAtiva(moverAtiva(visiveis, ativa, ...setas[e.key])); return; }
    if (e.key === 'Tab') { e.preventDefault(); setAtiva(proximaEditavel(visiveis, ativa, e.shiftKey ? -1 : 1)); return; }
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); if (l?.tipo === 'novoAporte') desistir(l); else setAtiva(null); return; }
    if (!l) return;
    if (e.key === 'Enter' || e.key === 'F2') { e.preventDefault(); iniciar(l, ativa.col); return; }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (l.tipo === 'lote' && l.lo.fonte && l.lo.fonte.tipo !== 'inicial') { e.preventDefault(); excluir(l); }
      else if (l.tipo === 'novoAporte') { e.preventDefault(); desistir(l); }
      return;
    }
    if (e.key.length === 1 && !ctrl && !e.altKey && modoDaCelula(l, ativa.col)) { e.preventDefault(); iniciar(l, ativa.col, e.key); }
  };

  // clicar: seleciona; clicar de novo na mesma (ou duas vezes) edita. Nas linhas de acrescentar, o clique já começa — no
  // "+ aporte", pelo valor (a data já é hoje). Com o pop-up aberto, o clique só o fecha (gravando).
  const ADICIONAR = ['novoAporte', 'novoInv', 'novaInst'];
  const clicar = (l, col) => (e) => {
    if (!editavel || e.button !== 0) return;
    if (e.target.closest('button, a, input, label')) return;
    if (popRef.current) return;
    e.preventDefault();
    if (editorRef.current) fimEditor('blur', editorRef.current.texto);
    const mesma = ativa && ativa.id === l.id && ativa.col === col;
    if (ADICIONAR.includes(l.tipo)) {
      const naLinha = ativa && ativa.id === l.id;
      const c = l.tipo === 'novoAporte' ? (naLinha && (col === 'nome' || col === 'resgate') ? col : 'aplicado') : 'nome';
      setAtiva({ id: l.id, col: c });
      focar();
      iniciar(l, c);
      return;
    }
    setAtiva({ id: l.id, col });
    focar();
    if (mesma || e.detail >= 2) iniciar(l, col);
  };

  // a célula: o lugar do clique, o contorno da ativa (azul na que edita, cinza na calculada) e o campo, quando edita
  const cel = (l, col, cls, conteudo, extra = {}) => {
    const modo = editavel ? modoDaCelula(l, col) : null;
    const eAtiva = editavel && ativa?.id === l.id && ativa.col === col;
    const k = chave(l.id, col);
    const ed = editor && editor.id === l.id && editor.col === col ? editor : null;
    const contorno = eAtiva && !ed ? (modo ? 'shadow-[inset_0_0_0_2px_var(--grade-sel)]' : 'shadow-[inset_0_0_0_2px_var(--contorno-celula)]')
      : modo ? 'hover:shadow-[inset_0_0_0_1px_var(--grade-sel)]' : '';
    return (
      <td key={col} data-cel={k} onMouseDown={editavel ? clicar(l, col) : undefined} {...extra}
        className={`relative ${cls} ${modo ? 'cursor-cell' : ''} ${contorno}`}>
        {otimista[k] !== undefined ? <span className="text-gray-400">{otimista[k]}</span> : conteudo}
        {ed && <EditorCelula ed={ed} onTexto={(t) => setEditor({ ...ed, texto: t })} onFim={fimEditor} alinha={col === 'nome' || col === 'resgate' ? 'left' : 'right'}
          recuo={col !== 'nome' ? 12 : l.tipo === 'lote' || l.tipo === 'novoAporte' ? RECUO_APORTE : 32} />}
      </td>
    );
  };

  const cabecalho = (c) => {
    const ordenada = ordem?.col === c.id;
    return (
      <th key={c.id} aria-sort={ordenada ? (ordem.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
        className={`group/th ${th0} ${c.alinha === 'left' ? 'text-left' : 'text-right'} ${ordenada ? 'text-gray-800' : 'text-gray-500'} ${desk(c)}`}
        // LARGURAS FIXAS no Investimento e no Resgate (06/11/2026): com a largura pelo conteúdo, abrir os aportes (o "cai
        // para 20% em 10/04/2027" é mais largo que a pílula do título) alargava a coluna e a tabela toda andava para o lado
        style={movel ? undefined : c.id === 'nome' ? { width: 290, minWidth: 250 } : c.id === 'resgate' ? { width: 210, minWidth: 210 } : undefined}>
        <span className={`inline-flex items-center gap-1 ${c.alinha === 'left' ? '' : 'flex-row-reverse'}`}>
          <span>{c.id === 'ano' ? `Em ${ano}` : c.rotulo}</span>
          {!c.semOrdem && !movel && (
            <button type="button" onClick={() => onOrdenar(c.id)} aria-label={`Ordenar por ${c.rotulo.toLowerCase()}`}
              title={ordenada ? 'Clique para inverter (a 3ª vez volta à ordem de cadastro)' : `Ordenar por ${c.rotulo.toLowerCase()}`}
              className={`inline-flex h-[20px] w-[20px] shrink-0 items-center justify-center rounded-[4px] transition-[opacity,background-color] duration-150 hover:bg-gray-200 ${
                ordenada ? 'text-gray-800 opacity-100' : 'text-gray-400 opacity-0 group-hover/th:opacity-100'}`}>
              <IconSetaOrdenacao className="h-[14px] w-[14px]" descendente={ordenada && ordem.dir === 'desc'} />
            </button>
          )}
        </span>
      </th>
    );
  };

  // O balão: o "Rendeu" (a conta inteira do título) e a curva (o mês sob o cursor).
  const sobCurva = (id, curva) => (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const i = Math.max(0, Math.min(curva.length - 1, Math.round(((e.clientX - r.left) / r.width) * (curva.length - 1))));
    mover({ id, col: 'curva', i })(e);
  };
  const info = (() => {
    const a = balao.ativo;
    if (!a) return null;
    const l = porId.get(a.id);
    if (!l || (l.tipo !== 'inv' && l.tipo !== 'grupo')) return null;
    const item = l.tipo === 'inv' ? l.x : l.g;
    const nome = l.tipo === 'inv' ? l.x.inv.nome : l.g.conta.nome;
    if (a.col === 'liquido') {
      const imp = l.tipo === 'inv' ? l.x.imposto : null;
      if (imp?.semEstimativa) return { titulo: nome, itens: [{ rotulo: 'Vale hoje (bruto)', valor: formatBRL(item.vale) }], nota: 'Fundo: o come-cotas e o IR dele não são estimados.' };
      if (imp?.semDatas) return { titulo: nome, itens: [{ rotulo: 'Vale hoje (bruto)', valor: formatBRL(item.vale) }, { rotulo: 'Rendeu', valor: formatBRL(imp.ganho), cor: COR_ENTRADAS }], nota: 'Faltam as datas dos aportes: sem elas não dá para saber a alíquota de cada um. Abra o investimento e ponha a data de cada aporte (ou informe os aportes na ficha).' };
      if (l.tipo === 'grupo' && item.incompleto) return { titulo: `${nome} · se resgatar hoje`, itens: [{ rotulo: 'Vale hoje (bruto)', valor: formatBRL(item.vale) }, { rotulo: 'IR ≈ (dos que têm as datas)', valor: formatBRL(item.ir) }], nota: 'Parcial: algum investimento daqui está sem as datas dos aportes (ou é fundo) e entra pelo bruto.' };
      const ir = l.tipo === 'inv' ? (imp?.ir ?? 0) : item.ir;
      const iof = l.tipo === 'inv' ? (imp?.iof ?? 0) : 0;
      const q = imp?.proximaQueda;
      return {
        titulo: `${nome} · se resgatar hoje`,
        itens: [
          { rotulo: 'Vale hoje (bruto)', valor: formatBRL(item.vale) },
          { rotulo: imp?.isento ? 'IR (isento)' : `IR ≈${imp && imp.ganho > 0 ? ` (${pctAliq(imp.aliquotaMedia)} do rendimento)` : ''}`, valor: formatBRL(ir) },
          ...(iof > 0 ? [{ rotulo: 'IOF ≈ (menos de 30 dias)', valor: formatBRL(iof) }] : []),
          { rotulo: 'Líquido ≈', valor: formatBRL(l.tipo === 'inv' ? imp?.liquido ?? item.vale : item.liquido), cor: COR_ENTRADAS },
        ],
        nota: [
          q ? `Em ${formatDate(q.data)} o aporte de ${formatDate(q.deposito)} cai de ${pctAliq(q.de)} para ${pctAliq(q.para)} (−${formatBRL(q.menos)})` : null,
          'Estimado pelo CDI desde a data de cada aporte',
        ].filter(Boolean).join(' · '),
      };
    }
    // O VALOR QUE ANDOU SOZINHO (06/11/2026, a opção A do mockup "Valor pelo CDI"): a foto real e o que rendeu pela taxa de cada dia
    if (a.col === 'vale' && l.tipo === 'inv' && l.x.estimado) {
      const e = l.x.estimado;
      const rendeuEst = e.valor_centavos - e.base.valor - (e.liquido ?? 0);
      return {
        titulo: `${nome} · vale hoje ≈`,
        itens: [
          { rotulo: `Foto real (o banco) em ${formatDate(e.base.data)}`, valor: formatBRL(e.base.valor) },
          ...(e.liquido ? [{ rotulo: 'Aportes − resgates depois', valor: `${e.liquido > 0 ? '+' : '−'}${formatBRL(Math.abs(e.liquido))}` }] : []),
          { rotulo: `${e.dias} ${e.dias === 1 ? 'dia útil' : 'dias úteis'} · ${rotuloRende(l.x.inv)}`, valor: `${rendeuEst >= 0 ? '+' : '−'}${formatBRL(Math.abs(rendeuEst))}`, cor: COR_ENTRADAS },
          { rotulo: 'Vale hoje ≈ (com o rendimento de hoje)', valor: formatBRL(e.valor_centavos) },
        ],
        nota: `A taxa de cada dia vem do Banco Central; quando ela muda, a nova vale sobre o que já rendeu.${e.projetados ? ` O Banco Central publica a taxa no dia seguinte: ${e.projetados === 1 ? 'hoje vai' : `os últimos ${e.projetados} dias vão`} com a de ${formatDate(e.ate)}.` : ''} Para conferir com o banco, digite o valor dele nesta célula.`,
      };
    }
    if (a.col === 'curva') {
      const p = item.curva[a.i];
      if (!p) return null;
      const c = cdiFechado(cdi, p.competencia);
      return {
        titulo: `${nome} · ${nomeCompetencia(p.competencia).toLowerCase()}`,
        itens: [
          { rotulo: 'Valia no fim do mês', valor: formatBRL(p.valor) },
          ...(p.rendeu !== null && p.rendeu !== undefined ? [{ rotulo: 'Rendeu no mês', valor: `${formatBRL(p.rendeu)} · ${pctTexto(p.pct)}`, cor: COR_ENTRADAS }] : []),
          ...(c !== undefined && p.pct !== null && p.pct !== undefined ? [{ rotulo: 'CDI do mês', valor: pctTexto(c), cor: COR_CDI }] : []),
        ],
        nota: 'Passe ao longo da curva para os outros meses',
      };
    }
    const um = l.tipo === 'inv' ? l.x.ultimoMes : null;
    const cU = um ? cdiFechado(cdi, um.competencia) : undefined;
    const liq = l.tipo === 'inv' ? (l.x.imposto && !l.x.imposto.isento ? l.x.imposto.liquido : null) : l.g.soConta ? null : l.g.liquido;
    const depoisDoIR = liq === null || liq === undefined ? null : liq - item.aplicado;
    const rende = l.tipo === 'inv' ? rotuloRende(l.x.inv) : '';
    return {
      titulo: nome,
      itens: [
        { rotulo: 'Aplicado (do seu bolso)', valor: formatBRL(item.aplicado) },
        { rotulo: l.tipo === 'inv' && l.x.estimado ? `Vale hoje ≈ (${rotuloPeloIndice(l.x.inv)}, com o de hoje)` : `Vale hoje${item.data ? ` (foto de ${formatDate(item.data)})` : ''}`, valor: formatBRL(item.vale) },
        { rotulo: l.tipo === 'inv' ? 'Rendeu desde o cadastro (bruto)' : l.g.soConta ? 'Rendeu desde a primeira foto' : 'Rendeu (os investimentos, bruto)', valor: `${formatBRL(item.rendeu)} · ${pctTexto(item.pct, 1)}`, cor: COR_ENTRADAS },
        // DEPOIS DO IR (06/11/2026, a pedido): o líquido − o aplicado, se resgatasse hoje (o fundo e o sem as datas não estimam)
        ...(depoisDoIR !== null ? [{ rotulo: `Depois do IR ≈${l.tipo === 'grupo' && l.g.incompleto ? ' (parcial)' : ''}`, valor: `${formatBRL(depoisDoIR)} · ${pctTexto(item.aplicado > 0 ? depoisDoIR / item.aplicado : null, 1)}`, cor: COR_ENTRADAS }] : []),
        ...(um ? [{ rotulo: `Em ${competenciaCurta(um.competencia)}`, valor: `${formatBRL(um.rendeu)} · ${pctTexto(um.pct)}`, cor: COR_ENTRADAS }] : []),
        ...(rende ? [{ rotulo: 'Contratado', valor: rende }] : []),
      ],
      nota: [
        um && cU && um.pct !== null ? `${Math.round((um.pct / cU) * 100)}% do CDI em ${competenciaCurta(um.competencia)}` : null,
        l.tipo === 'inv' ? impostoGarantia(l.x.inv.tipo) : null,
        item.vale !== item.foto && l.tipo === 'inv' ? 'O valor inclui o que entrou depois da última foto' : null,
      ].filter(Boolean).join(' · ') || undefined,
    };
  })();

  const subLiquido = (imp) => (!imp ? null : imp.semEstimativa ? 'sem estimativa' : imp.semDatas ? 'faltam as datas' : imp.isento ? 'isento' : `IR ≈ ${reais((imp.ir ?? 0) + (imp.iof ?? 0))}`);
  const curvaTd = (l, item, cor, cls) => cel(l, 'curva', `${cls} ${movel ? 'hidden' : ''}`, item.curva.length > 1 ? (
    <span className="ml-auto block w-[92px] cursor-crosshair" onMouseMove={sobCurva(l.id, item.curva)}>
      <MiniCurva valores={item.curva.map((p) => p.valor)} cor={cor} largura={92} altura={24} />
    </span>
  ) : <span className="block text-right text-[11.5px] text-gray-400">{item.curva.length ? '1 mês' : '—'}</span>);
  const acoesTd = (cls, filhos) => (!movel && (
    <td className={cls}>
      {filhos && <span className="flex justify-end gap-1 opacity-0 transition-opacity group-hover/linha:opacity-100 focus-within:opacity-100">{filhos}</span>}
    </td>
  ));
  const vazioTds = (l, cols, cls) => cols.map((c) => cel(l, c, `${cls} ${['resgate', 'aplicado', 'ano', 'curva'].includes(c) && movel ? 'hidden' : ''}`, null));

  // as linhas de acrescentar: o "+" e o rótulo, no recuo do nível delas (o "+ aporte" com o trilho e, ativo, os campos)
  const linhaAcrescentar = (l, attrs) => {
    const ativoAqui = ativa?.id === l.id || (editor && editor.id === l.id);
    const base = 'h-[34px] border-b border-gray-100 py-0 text-[12.5px]';
    const rotulo = (texto, recuo) => (
      <span className="flex items-center gap-2 font-medium text-gray-500 transition-colors group-hover/add:text-gray-800" style={{ paddingLeft: recuo }}>
        <CirculoMais borda="text-gray-400" />{texto}
      </span>
    );
    if (l.tipo === 'novoAporte') {
      const r = rascunhoDe(l);
      const comRascunho = ativoAqui || !vazioRasc(rascunhos[l.x.inv.id]);
      return (
        <tr key={l.id} {...attrs} className="group/add">
          {cel(l, 'nome', `${base} pr-3`, (
            <>
              <Trilho ultimo />
              {comRascunho ? (
                <span className="flex items-center gap-2" style={{ paddingLeft: RECUO_APORTE }}>
                  <span className={`tabular-nums ${rascunhos[l.x.inv.id]?.data ? 'text-gray-800' : 'text-gray-500'}`}>{formatDate(r.data)}</span>
                  {r.data === hoje && <span className="text-[11.5px] text-gray-400">hoje</span>}
                </span>
              ) : rotulo('Novo aporte', RECUO_APORTE - 4)}
            </>
          ), { style: { paddingLeft: 0 } })}
          {cel(l, 'resgate', `${base} px-3 ${movel ? 'hidden' : ''}`, comRascunho ? (
            r.venc ? <span className="text-[11.5px] text-gray-700">vence {dataCurta(r.venc)}</span>
              : <span className="text-[11.5px] text-gray-400">vence em… <span className="text-gray-300">(Tab · vazio, a regra)</span></span>
          ) : null)}
          {cel(l, 'aplicado', `${base} px-3 text-right tabular-nums ${movel ? 'hidden' : ''}`, comRascunho ? (
            r.valor ? <span className="text-gray-800">{r.valor}</span> : <span className="text-gray-400">valor</span>
          ) : null)}
          {vazioTds(l, ['vale', 'liquido', 'rendeu', 'ano', 'curva'], base)}
          {/* o ✕ no fim da linha, À VISTA enquanto o rascunho aparece (as ações das outras linhas são de hover) */}
          {!movel && (
            <td className={`${base} px-2`}>
              {comRascunho && (
                <span className="flex justify-end">
                  <BotaoLinha titulo="Desistir deste aporte (Esc)" onClick={() => desistir(l)}><IconX /></BotaoLinha>
                </span>
              )}
            </td>
          )}
        </tr>
      );
    }
    const inst = l.tipo === 'novaInst';
    return (
      <tr key={l.id} {...attrs} className="group/add">
        {cel(l, 'nome', `${base} pr-3 ${inst ? 'border-t border-gray-200' : 'border-b-gray-200'}`,
          rotulo(inst ? 'Nova instituição' : `Novo investimento em ${l.g.conta.nome}`, inst ? 10 : 32), { style: { paddingLeft: 0 } })}
        {vazioTds(l, ['resgate', 'aplicado', 'vale', 'liquido', 'rendeu', 'ano', 'curva'], `${base} ${inst ? 'border-t border-gray-200' : 'border-b-gray-200'}`)}
        {acoesTd(`${base} ${inst ? 'border-t border-gray-200' : 'border-b-gray-200'}`)}
      </tr>
    );
  };

  // abre quando tem aportes, ou (editável) para o primeiro: a linha "+ aporte" (o encerrado não recebe)
  const temCorpo = (l) => temAportes(l.x) || (editavel && l.x.inv.ativo !== false);

  return (
    <div ref={caixaRef} tabIndex={editavel ? 0 : undefined} onKeyDown={teclas} onMouseMove={fecharFora(balao)}
      onMouseLeave={() => { balao.aoSair(); setSobLinha(null); }} className="outline-none" aria-label={editavel ? 'Carteira: a planilha dos investimentos' : undefined}>
      <table className="w-full border-separate border-spacing-0 text-[13px]" style={{ minWidth: movel ? 0 : 980 }}>
        <thead><tr>{COLUNAS_A.map(cabecalho)}{!movel && <th className={`${th0} w-[112px]`} aria-label="Ações" />}</tr></thead>
        <tbody>
          {desenhadas.map(({ linha: l, estado }) => {
            const attrs = atributosLinha(l.id, estado);
            if (ADICIONAR.includes(l.tipo)) return linhaAcrescentar(l, attrs);
            if (l.tipo === 'grupo') {
              const g = l.g;
              const aberto = !recolhidas.has(g.conta.id);
              const temFilhos = g.itens.length > 0 || editavel;
              const faixa = 'border-b border-gray-200 bg-hx-f3f4f6';
              const qtd = g.soConta ? 'nenhum investimento' : `${g.itens.length} ${g.itens.length === 1 ? 'investimento' : 'investimentos'}`;
              return (
                <tr key={l.id} {...attrs} className="group/linha" onMouseEnter={() => setSobLinha(l.id)}>
                  {cel(l, 'nome', `h-[46px] ${faixa} pl-3 pr-3 ${aceso(l.id)} ${!editavel && temFilhos ? 'cursor-pointer' : ''}`, (
                    <>
                      <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-0 w-[3px]" style={{ background: g.cor }} />
                      <span className="flex max-w-[270px] items-center gap-2">
                        {temFilhos ? (
                          <button type="button" onClick={() => alternar(g.conta.id)} aria-expanded={aberto} aria-label={aberto ? `Recolher ${g.conta.nome}` : `Abrir ${g.conta.nome}`}
                            className="shrink-0"><SetaAbre aberto={aberto} /></button>
                        ) : <span className="w-[12px] shrink-0" />}
                        <span className={`truncate text-[14px] font-semibold ${g.conta.ativa === false ? 'text-gray-400' : 'text-gray-900'}`}>{g.conta.nome}</span>
                        <span className={`shrink-0 text-[11.5px] font-normal text-gray-500 ${movel ? 'hidden' : ''}`}>{qtd}</span>
                      </span>
                    </>
                  ), !editavel && temFilhos ? { onClick: () => alternar(g.conta.id) } : {})}
                  {cel(l, 'resgate', `${faixa} ${movel ? 'hidden' : ''} ${aceso(l.id)}`, null)}
                  {cel(l, 'aplicado', `${faixa} px-3 text-right font-semibold tabular-nums text-gray-700 ${movel ? 'hidden' : ''} ${aceso(l.id)}`, reais(g.aplicado))}
                  {cel(l, 'vale', `${faixa} px-3 text-right text-[13.5px] font-semibold tabular-nums text-gray-900 ${aceso(l.id)}`, reais(g.vale))}
                  {cel(l, 'liquido', `${faixa} px-3 text-right font-semibold tabular-nums text-gray-900 ${aceso(l.id)}`, (
                    <>{reais(g.liquido)}{(g.incompleto || g.ir > 0) && <span className="block text-[11.5px] font-normal text-gray-500">{g.incompleto ? 'parcial' : `IR ≈ ${reais(g.ir)}`}</span>}</>
                  ), { onMouseMove: mover({ id: l.id, col: 'liquido' }) })}
                  {cel(l, 'rendeu', `${faixa} px-3 text-right font-semibold tabular-nums ${aceso(l.id)}`, (
                    <span className={g.rendeu < 0 ? 'text-hx-c0393d' : 'text-green-700'}>{sinal(g.rendeu)}{reais(Math.abs(g.rendeu))}</span>
                  ), { onMouseMove: mover({ id: l.id, col: 'rendeu' }) })}
                  {cel(l, 'ano', `${faixa} px-3 text-right tabular-nums text-gray-600 ${movel ? 'hidden' : ''} ${aceso(l.id)}`, pctTexto(g.pctAno, 1))}
                  {curvaTd(l, g, g.cor, `${faixa} px-3 ${aceso(l.id)}`)}
                  {acoesTd(`${faixa} px-2 ${aceso(l.id)}`, acoes && (
                    <BotaoLinha titulo={`Editar ${g.conta.nome}: o nome, se recebe o extrato, encerrar`} onClick={() => acoes.editarConta(g.conta)}><IconLapis className="h-[14px] w-[14px]" /></BotaoLinha>
                  ))}
                </tr>
              );
            }
            if (l.tipo === 'lote') {
              const lo = l.lo;
              const imp = l.x.imposto;
              const f = lo.fonte;
              const td = `h-[34px] border-b border-gray-100 py-0 text-[12.5px] ${aceso(l.id)}`;
              const vence = l.vence;
              const exato = f?.exato && lo.inteiro;
              return (
                <tr key={l.id} {...attrs} className="group/linha" onMouseEnter={() => setSobLinha(l.id)}>
                  {cel(l, 'nome', `${td} pr-3`, (
                    <>
                      <Trilho ultimo={l.ultimo} />
                      <span className="flex items-baseline gap-2 whitespace-nowrap" style={{ paddingLeft: RECUO_APORTE }}>
                        <span className="tabular-nums text-gray-700">{formatDate(lo.data)}</span>
                        {lo.dataAproximada && <span className="text-gray-400" title="Sem a data da aplicação: a idade conta da data do cadastro">≈</span>}
                        <span className="text-[11.5px] text-gray-400">{lo.dias} {lo.dias === 1 ? 'dia' : 'dias'}</span>
                      </span>
                    </>
                  ), { style: { paddingLeft: 0 } })}
                  {cel(l, 'resgate', `${td} px-3 ${movel ? 'hidden' : ''}`, (
                    <span className="flex items-center gap-1.5 whitespace-nowrap">
                      {imp.semEstimativa ? <span className="text-[11.5px] text-gray-400">IR do fundo</span>
                        : imp.isento ? <Etiqueta tom="verde">isento</Etiqueta>
                          : <Etiqueta tom={TOM_ALIQUOTA[lo.aliquota] ?? 'cinza'}>IR {pctAliq(lo.aliquota)}</Etiqueta>}
                      <span className="text-[11.5px] text-gray-500">
                        {vence ? <span className={l.vencePropria ? 'text-gray-700' : ''} title={l.vencePropria ? 'O vencimento digitado neste aporte' : 'Pela regra do investimento: digite a data para mudar'}>vence {dataCurta(vence)}</span> : !imp.isento && !imp.semEstimativa ? (lo.proxima ? `→ ${pctAliq(lo.proxima.aliquota)} em ${dataCurta(lo.proxima.data)}` : 'já na menor') : ''}
                      </span>
                    </span>
                  ))}
                  {cel(l, 'aplicado', `${td} px-3 text-right tabular-nums ${movel ? 'hidden' : ''}`, exato
                    ? <span className="text-gray-800">{reais(f.valor)}</span>
                    : <span className="text-gray-500" title={lo.inteiro ? 'Estimado: o banco mostrou quanto ele valia, não quanto foi aportado' : 'Parte dele já foi resgatada'}>≈ {reais(lo.depositado)}</span>)}
                  {cel(l, 'vale', `${td} px-3 text-right tabular-nums text-gray-600`, reais(lo.vale))}
                  {cel(l, 'liquido', `${td} px-3 text-right tabular-nums text-gray-600`, reais(lo.liquido))}
                  {cel(l, 'rendeu', `${td} px-3 text-right tabular-nums text-green-700`, `${sinal(lo.ganho)}${reais(Math.abs(lo.ganho))}`)}
                  {cel(l, 'ano', `${td} ${movel ? 'hidden' : ''}`, null)}
                  {cel(l, 'curva', `${td} ${movel ? 'hidden' : ''}`, null)}
                  {acoesTd(`${td} px-2`, editavel && f && f.tipo !== 'inicial' && (
                    <BotaoLinha titulo={`Excluir o aporte de ${formatDate(f.data)}`} onClick={() => excluir(l)}><IconLixeira className="h-[14px] w-[14px]" /></BotaoLinha>
                  ))}
                </tr>
              );
            }
            const x = l.x;
            const encerrado = x.inv.ativo === false;
            const comCorpo = temCorpo(l);
            const aberto = abertosInv.has(x.inv.id);
            const sub = [nomeTipoInvestimento(x.inv.tipo), rotuloRende(x.inv), x.inv.emissor].filter(Boolean).join(' · ');
            const td = `border-b border-gray-100 py-2 ${aceso(l.id)}`;
            const qtdAportes = x.imposto?.lotes.length ?? 0;
            return (
              <tr key={l.id} {...attrs} className="group/linha" onMouseEnter={() => setSobLinha(l.id)}>
                {cel(l, 'nome', `${td} pl-[30px] pr-3`, (
                  <>
                    {comCorpo && aberto && <span aria-hidden="true" className="pointer-events-none absolute bottom-0 left-[40px] top-[30px] w-px bg-gray-300" />}
                    <span className="flex items-start gap-1.5">
                      {comCorpo ? (
                        <button type="button" onClick={() => alternarInv(x.inv.id)} aria-expanded={aberto}
                          title={aberto ? 'Fechar os aportes' : qtdAportes ? `Abrir os ${qtdAportes === 1 ? 'aportes' : `${qtdAportes} aportes`}` : 'Abrir para o primeiro aporte'}
                          className="group/seta mt-px flex h-[20px] w-[20px] shrink-0 items-center justify-center rounded-[4px] transition-colors hover:bg-gray-200"><IconChevron aberto={aberto} /></button>
                      ) : <span className="w-[20px] shrink-0" />}
                      <span className="block min-w-0 max-w-[222px]">
                        <span className={`flex items-center gap-1.5 text-[13px] font-medium ${encerrado ? 'text-gray-400' : 'text-gray-800'}`}>
                          <span className="truncate">{x.inv.nome}</span>{encerrado && <Etiqueta>encerrado</Etiqueta>}
                          {/* cadastrado sem dinheiro ainda: entra pela linha "+ aporte" (abra o investimento) */}
                          {x.semValor && !encerrado && <span title="Ainda sem dinheiro: abra e digite o primeiro aporte"><Etiqueta tom="ambar">sem valor</Etiqueta></span>}
                        </span>
                        <span className="block truncate text-[11.5px] text-gray-500">{sub}</span>
                      </span>
                    </span>
                  </>
                ))}
                {cel(l, 'resgate', `${td} px-3 ${movel ? 'hidden' : ''}`, <Resgate x={x} />)}
                {cel(l, 'aplicado', `${td} px-3 text-right tabular-nums text-gray-700 ${movel ? 'hidden' : ''}`, reais(x.aplicado))}
                {cel(l, 'vale', `${td} px-3 text-right font-semibold tabular-nums text-gray-900`, (
                  <>
                    {x.semValor ? <span className="font-normal text-gray-400">—</span> : reais(x.vale)}
                    {x.estimado && <span className="block whitespace-nowrap text-[11.5px] font-normal text-gray-500">≈ {rotuloPeloIndice(x.inv)} até hoje</span>}
                  </>
                ), { onMouseMove: x.estimado ? mover({ id: l.id, col: 'vale' }) : undefined })}
                {cel(l, 'liquido', `${td} px-3 text-right font-semibold tabular-nums text-gray-900`, (() => {
                  const v = x.imposto && x.imposto.liquido === null && !x.imposto.isento ? null : x.imposto?.liquido ?? x.vale;
                  const s = subLiquido(x.imposto);
                  return <>{v === null ? <span className="text-gray-400">—</span> : reais(v)}{s && <span className="block text-[11.5px] font-normal text-gray-500">{s}</span>}</>;
                })(), { onMouseMove: mover({ id: l.id, col: 'liquido' }) })}
                {cel(l, 'rendeu', `${td} px-3 text-right tabular-nums`, (
                  <>
                    <span className={x.rendeu < 0 ? 'text-hx-c0393d' : 'text-green-700'}>{sinal(x.rendeu)}{reais(Math.abs(x.rendeu))}</span>
                    <span className="block text-[11.5px] text-gray-500">{pctTexto(x.pct, 1)}</span>
                  </>
                ), { onMouseMove: mover({ id: l.id, col: 'rendeu' }) })}
                {cel(l, 'ano', `${td} px-3 text-right tabular-nums text-gray-600 ${movel ? 'hidden' : ''}`, pctTexto(x.pctAno, 1))}
                {curvaTd(l, x, l.g.cor, `${td} px-3`)}
                {acoesTd(`${td} px-2`, acoes && (
                  <>
                    {!encerrado && editavel && (
                      <BotaoLinha titulo={`Aportar em ${x.inv.nome} (a linha "+ aporte")`} onClick={() => {
                        abrirInv(x.inv.id);
                        const alvo = { id: `na:${x.inv.id}`, tipo: 'novoAporte', g: l.g, x };
                        setAtiva({ id: alvo.id, col: 'aplicado' });
                        setTimeout(() => { focar(); iniciar(alvo, 'aplicado'); }, 260);
                      }}><IconAplicar /></BotaoLinha>
                    )}
                    {!encerrado && !x.semValor && <BotaoLinha titulo={`Resgatar de ${x.inv.nome}`} onClick={() => acoes.movimento({ inv: x.inv, tipo: 'resgate' })}><IconResgatar /></BotaoLinha>}
                    <BotaoLinha titulo={`A ficha de ${x.inv.nome}: os aportes, o IR, as quedas e o histórico`} onClick={() => acoes.ficha(x.inv)}><IconFicha className="h-[15px] w-[15px]" strokeWidth={2} /></BotaoLinha>
                  </>
                ))}
              </tr>
            );
          })}
          <tr data-segue="" className="font-semibold">
            <td className="h-10 border-t border-gray-200 bg-hx-f9fafb px-3 text-gray-800">Total</td>
            <td className={`border-t border-gray-200 bg-hx-f9fafb ${movel ? 'hidden' : ''}`} />
            <td className={`border-t border-gray-200 bg-hx-f9fafb px-3 text-right tabular-nums text-gray-700 ${movel ? 'hidden' : ''}`}>{reais(total.aplicado)}</td>
            <td className="border-t border-gray-200 bg-hx-f9fafb px-3 text-right tabular-nums text-gray-900">{reais(total.vale)}</td>
            <td className="border-t border-gray-200 bg-hx-f9fafb px-3 text-right tabular-nums text-gray-900">{reais(total.liquido ?? total.vale)}{(total.incompleto || total.ir > 0) && <span className="block text-[11.5px] font-normal text-gray-500">{total.incompleto ? 'parcial' : `IR ≈ ${reais(total.ir)}`}</span>}</td>
            <td className="border-t border-gray-200 bg-hx-f9fafb px-3 text-right tabular-nums">
              <span className={total.rendeu < 0 ? 'text-hx-c0393d' : 'text-green-700'}>{sinal(total.rendeu)}{reais(Math.abs(total.rendeu))}</span>
              <span className="block text-[11.5px] font-normal text-gray-500">{pctTexto(total.aplicado > 0 ? total.rendeu / total.aplicado : null, 1)}</span>
            </td>
            <td className={`border-t border-gray-200 bg-hx-f9fafb px-3 text-right tabular-nums text-gray-600 ${movel ? 'hidden' : ''}`}>{pctTexto(total.pctAno, 1)}</td>
            <td className={`border-t border-gray-200 bg-hx-f9fafb ${movel ? 'hidden' : ''}`} />
            {!movel && <td className="border-t border-gray-200 bg-hx-f9fafb" />}
          </tr>
        </tbody>
      </table>
      {info && <BalaoGrafico pos={balao.pos} largura={280} titulo={info.titulo} itens={info.itens} nota={info.nota} />}
      {pop && (() => {
        const l = porId.get(pop.id);
        if (!l) return null;
        return (
          <EditorInvestimento key={chave(pop.id, pop.col)} modo={pop.modo} inv={l.x?.inv} contaId={l.g?.conta.id} nomeInicial={pop.nome} ancora={pop.ancora}
            onSalvar={(m) => fimPop(pop, m)} onCancelar={() => fimPop(pop, null)} />
        );
      })()}
    </div>
  );
}

// ------------------------------------------------------------ B: o mês a mês
function TabelaMesAMes({ todas, visiveis, recolhidas, alternar, meses, comps, cdi, pct, centavos = false }) {
  const { inteiro } = formatos(centavos);
  const caixaRef = useRef(null);
  const desenhadas = useLinhasAnimadas(todas, visiveis, caixaRef);
  const balao = useBalao(270, 160);
  const mover = comMarca(balao);
  const linhas = useMemo(() => {
    const m = new Map();
    todas.forEach((l) => {
      m.set(l.id, l.tipo === 'grupo'
        ? linhaMesAMes(meses, comps, (x) => x.porConta[l.g.conta.id])
        : linhaMesAMes(meses, comps, (x) => x.porSerie[`i:${l.x.inv.id}`]));
    });
    m.set('total', linhaMesAMes(meses, comps, (x) => ({ ...x, saldo: x.total })));
    return m;
  }, [todas, meses, comps]);

  const ativo = balao.ativo;
  const naLinha = (id) => ativo?.linha === id;
  const naColuna = (c) => ativo?.col === c;
  const classe = (id, c) => `${naLinha(id) || naColuna(c) ? 'gm-acesa' : ''} ${naLinha(id) && naColuna(c) ? 'shadow-[inset_0_0_0_1.5px_var(--contorno-celula)]' : ''}`;
  const sob = (linha, col) => ({ onMouseMove: mover({ linha, col }) });
  const valorDe = (v) => (pct ? v.pct : v.rendeu);
  const texto = (v) => (v === null || v === undefined ? '' : pct ? (v * 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : inteiro(v));
  const fundo = (v, max) => {
    if (v === null || v === undefined || v === 0) return undefined;
    if (v < 0) return { backgroundColor: `color-mix(in srgb, ${COR_FALTOU} 16%, transparent)` };
    return { backgroundColor: `color-mix(in srgb, ${COR_ENTRADAS} ${Math.round(5 + 26 * (v / max) ** 2)}%, transparent)` };
  };
  const nomeDe = (id) => {
    if (id === 'total') return 'Total';
    const l = todas.find((t) => t.id === id);
    return l ? (l.tipo === 'grupo' ? l.g.conta.nome : l.x.inv.nome) : '';
  };

  const info = ativo && (() => {
    const lin = linhas.get(ativo.linha);
    if (!lin) return null;
    const nome = nomeDe(ativo.linha);
    if (comps.includes(ativo.col)) {
      const v = lin.porMes[ativo.col];
      const titulo = `${nome} · ${nomeCompetencia(ativo.col).toLowerCase()}`;
      if (!v) return { titulo, itens: [{ rotulo: 'Sem duas fotos para comparar', valor: '—' }] };
      const c = cdiFechado(cdi, ativo.col);
      return {
        titulo,
        itens: [
          { rotulo: 'Rendeu', valor: `${formatBRL(v.rendeu)} · ${pctTexto(v.pct)}`, cor: COR_ENTRADAS },
          ...(c !== undefined ? [{ rotulo: 'CDI do mês', valor: pctTexto(c), cor: COR_CDI }] : []),
          ...(v.aportes || v.resgates ? [{ rotulo: 'Aportes − resgates', valor: formatBRL(v.aportes - v.resgates) }] : []),
          ...(v.saldo !== undefined ? [{ rotulo: 'Valia no fim do mês', valor: formatBRL(v.saldo) }] : []),
        ],
        nota: c && v.pct !== null ? `${Math.round((v.pct / c) * 100)}% do CDI` : ativo.col >= comps[comps.length - 1] ? 'O CDI do mês em andamento ainda não fechou.' : undefined,
      };
    }
    const melhor = comps.filter((c) => lin.porMes[c]).sort((a, b) => lin.porMes[b].rendeu - lin.porMes[a].rendeu)[0];
    return {
      titulo: `${nome} · ${comps.length} ${comps.length === 1 ? 'mês' : 'meses'}`,
      itens: [
        { rotulo: 'Rendeu no período', valor: lin.total === null ? '—' : `${formatBRL(lin.total)} · ${pctTexto(lin.pct)}`, cor: COR_ENTRADAS },
        { rotulo: 'Média por mês', valor: lin.media === null ? '—' : `${formatBRL(lin.media)} · ${pctTexto(lin.mediaPct)}` },
        ...(melhor ? [{ rotulo: 'O melhor mês', valor: `${competenciaCurta(melhor)} · ${formatBRL(lin.porMes[melhor].rendeu)}` }] : []),
      ],
      nota: lin.meses < comps.length ? `${lin.meses} ${lin.meses === 1 ? 'mês' : 'meses'} com duas fotos para comparar` : undefined,
    };
  })();

  const th0 = 'sticky top-0 z-20 border-b border-r border-gray-100 bg-hx-f9fafb py-2 text-[10.5px] font-semibold uppercase tracking-wide';
  const celulas = (id, lin, forte) => {
    const vals = comps.map((c) => (lin.porMes[c] ? valorDe(lin.porMes[c]) : null));
    const max = Math.max(1e-9, ...vals.filter((v) => v !== null && v > 0));
    return comps.map((c, k) => (
      <td key={c} {...sob(id, c)} style={fundo(vals[k], max)}
        className={`border-b border-r border-gray-100 px-2 text-right tabular-nums transition-[box-shadow] duration-100 ${forte ? 'font-semibold text-gray-800' : 'text-gray-600'} ${classe(id, c)}`}>
        {vals[k] === null ? <span className="text-gray-300">—</span> : texto(vals[k])}
      </td>
    ));
  };
  const totais = (id, lin, forte) => (
    <>
      <td {...sob(id, 'total')} className={`border-b border-r border-gray-100 bg-hx-f9fafb px-2 text-right tabular-nums ${forte ? 'font-semibold text-gray-900' : 'text-gray-700'} ${classe(id, 'total')}`}>
        {lin.total === null ? '—' : pct ? texto(lin.pct) : inteiro(lin.total)}
      </td>
      <td {...sob(id, 'media')} className={`border-b border-gray-100 px-3 text-right tabular-nums ${forte ? 'text-gray-700' : 'text-gray-500'} ${classe(id, 'media')}`}>
        {lin.media === null ? '—' : pct ? texto(lin.mediaPct) : inteiro(lin.media)}
      </td>
    </>
  );

  return (
    <div ref={caixaRef} onMouseMove={fecharFora(balao)} onMouseLeave={balao.aoSair}>
      <table className="w-full border-separate border-spacing-0 text-[12.5px]" style={{ minWidth: 320 + comps.length * 74 }}>
        <thead>
          <tr>
            <th className={`${th0} left-0 z-30 border-r-gray-200 px-3 text-left text-gray-500`} style={{ width: 260, minWidth: 260 }}>Investimento</th>
            {comps.map((c) => (
              <th key={c} className={`${th0} px-2 text-right ${naColuna(c) ? 'text-gray-900' : 'text-gray-500'}`}>{MESES_CURTOS[Number(c.slice(5)) - 1]}</th>
            ))}
            <th className={`${th0} px-2 text-right ${naColuna('total') ? 'text-gray-900' : 'text-gray-500'}`}>{pct ? 'No período' : 'Total'}</th>
            <th className={`${th0} border-r-0 px-3 text-right ${naColuna('media') ? 'text-gray-900' : 'text-gray-500'}`}>Média</th>
          </tr>
        </thead>
        <tbody>
          {desenhadas.map(({ linha: l, estado }) => {
            const attrs = atributosLinha(l.id, estado);
            const lin = linhas.get(l.id);
            const grupo = l.tipo === 'grupo';
            const temFilhos = grupo && l.g.itens.length > 0;
            const aberto = grupo && !recolhidas.has(l.g.conta.id);
            return (
              <tr key={l.id} {...attrs} className="bg-white">
                <td {...sob(l.id, 'nome')} className={`sticky left-0 z-10 h-8 border-b border-r border-gray-200 bg-white ${grupo ? 'px-3' : 'py-0 pl-[38px] pr-3'} ${naLinha(l.id) ? 'gm-acesa' : ''}`}>
                  {grupo ? (
                    <button type="button" onClick={() => temFilhos && alternar(l.g.conta.id)} aria-expanded={temFilhos ? aberto : undefined}
                      className={`flex max-w-[230px] items-center gap-2 text-left ${temFilhos ? '' : 'cursor-default'}`}>
                      {temFilhos ? <SetaAbre aberto={aberto} /> : <span className="w-[12px] shrink-0" />}
                      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: l.g.cor }} />
                      <span className="truncate font-semibold text-gray-800">{l.g.conta.nome}</span>
                    </button>
                  ) : <span className="block max-w-[210px] truncate text-gray-600">{l.x.inv.nome}</span>}
                </td>
                {celulas(l.id, lin, grupo)}
                {totais(l.id, lin, grupo)}
              </tr>
            );
          })}
          <tr data-segue="" className="bg-hx-f9fafb font-semibold">
            <td {...sob('total', 'nome')} className={`sticky left-0 z-10 h-8 border-r border-gray-200 bg-hx-f9fafb px-3 text-gray-800 ${naLinha('total') ? 'gm-acesa' : ''}`}>Total</td>
            {comps.map((c) => {
              const v = linhas.get('total').porMes[c];
              return (
                <td key={c} {...sob('total', c)} className={`border-r border-gray-100 px-2 text-right tabular-nums text-gray-900 ${classe('total', c)}`}>
                  {v ? texto(valorDe(v)) : '—'}
                </td>
              );
            })}
            <td {...sob('total', 'total')} className={`border-r border-gray-100 px-2 text-right tabular-nums text-gray-900 ${classe('total', 'total')}`}>
              {(() => { const t = linhas.get('total'); return t.total === null ? '—' : pct ? texto(t.pct) : inteiro(t.total); })()}
            </td>
            <td {...sob('total', 'media')} className={`px-3 text-right tabular-nums text-gray-700 ${classe('total', 'media')}`}>
              {(() => { const t = linhas.get('total'); return t.media === null ? '—' : pct ? texto(t.mediaPct) : inteiro(t.media); })()}
            </td>
          </tr>
        </tbody>
      </table>
      {info && <BalaoGrafico pos={balao.pos} largura={270} titulo={info.titulo} itens={info.itens} nota={info.nota} />}
    </div>
  );
}

// ------------------------------------------------------------ o bloco
// `grupos`: o `carteira` (com `cor` por conta). `total`: { aplicado, vale, rendeu, pctAno }. `acoes`: { podeInvestir,
// movimento, ficha, editarConta } e `edicao` (as gravações da planilha — useEdicaoCarteira.js): sem elas — o celular —,
// a tabela só mostra.
export default function BlocoInvestimentos({
  grupos, total, meses, comps, cdi, ano, hoje, movel, acoes, edicao, encerrados, onEncerrados, qtdEncerrados, aviso,
}) {
  const [vista, setVistaEstado] = useState(() => (lsGet('patrimonio_vista') === 'mes' ? 'mes' : 'carteira'));
  const [modo, setModo] = useState('rs');
  const [centavos, setCentavosEstado] = useState(() => lsGet('patrimonio_centavos') === '1');
  const setCentavos = (v) => { setCentavosEstado(v); lsSet('patrimonio_centavos', v ? '1' : '0'); };
  const [recolhidas, setRecolhidasEstado] = useState(() => new Set(lerJson('patrimonio_recolhidas', [])));
  const [ordem, setOrdemEstado] = useState(() => lerJson('patrimonio_ordem', null));
  // os investimentos com os depósitos abertos (lembrado no navegador)
  const [abertosInv, setAbertosInvEstado] = useState(() => new Set(lerJson('patrimonio_depositos_abertos', [])));
  const alternarInv = (id) => setAbertosInvEstado((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); lsSet('patrimonio_depositos_abertos', JSON.stringify([...n])); return n; });
  const abrirInv = (id) => setAbertosInvEstado((s) => { if (s.has(id)) return s; const n = new Set(s); n.add(id); lsSet('patrimonio_depositos_abertos', JSON.stringify([...n])); return n; });
  const editavel = !!edicao && !movel;
  const setVista = (v) => { setVistaEstado(v); lsSet('patrimonio_vista', v); };
  const setRecolhidas = (fn) => setRecolhidasEstado((s) => { const n = fn(s); lsSet('patrimonio_recolhidas', JSON.stringify([...n])); return n; });
  const onOrdenar = (col) => setOrdemEstado((o) => { const n = proximaOrdemCarteira(o, col); lsSet('patrimonio_ordem', JSON.stringify(n)); return n; });
  const alternar = (id) => setRecolhidas((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const comFilhos = grupos.filter((g) => g.itens.length);
  const tudoAberto = comFilhos.every((g) => !recolhidas.has(g.conta.id));
  const verVista = movel ? 'carteira' : vista;

  const ordenados = useMemo(() => ordenarCarteira(grupos, ordem), [grupos, ordem]);
  // AS LINHAS: a instituição, os investimentos dela e, dentro de cada um, os aportes (o id pela ORIGEM do aporte — o
  // movimento, o de antes do app, o do cadastro —, que sobrevive à releitura: a célula ativa fica onde estava). Editável,
  // "+ aporte" no fim dos aportes de cada um, "+ investimento" no fim de cada instituição e "+ instituição" no fim de tudo.
  const podeInvestir = !!acoes?.podeInvestir;
  const todas = useMemo(() => {
    const linhas = [];
    ordenados.forEach((g) => {
      linhas.push({ id: `g:${g.conta.id}`, tipo: 'grupo', g });
      g.itens.forEach((x) => {
        linhas.push({ id: `i:${x.inv.id}`, tipo: 'inv', g, x });
        const lotes = temAportes(x) ? x.imposto.lotes : [];
        const comNovo = editavel && x.inv.ativo !== false;
        const vencDe = (lo) => {
          const p = lo.fonte && x.prazos?.lotes?.find((q) => q.ref && q.ref.tipo === lo.fonte.tipo && (q.ref.id ?? null) === (lo.fonte.id ?? null));
          return p ? { vence: p.vence, propria: !!p.propria } : { vence: x.inv.vencimento || null, propria: false };
        };
        lotes.forEach((lo, k) => linhas.push({
          id: `l:${x.inv.id}:${lo.fonte ? `${lo.fonte.tipo}:${lo.fonte.id ?? 'ini'}` : k}`, tipo: 'lote', g, x, lo, ultimo: !comNovo && k === lotes.length - 1,
          vence: vencDe(lo).vence, vencePropria: vencDe(lo).propria,
        }));
        if (comNovo) linhas.push({ id: `na:${x.inv.id}`, tipo: 'novoAporte', g, x });
      });
      if (editavel && podeInvestir) linhas.push({ id: `ni:${g.conta.id}`, tipo: 'novoInv', g });
    });
    if (editavel) linhas.push({ id: 'nq', tipo: 'novaInst' });
    return linhas;
  }, [ordenados, editavel, podeInvestir]);
  const visiveis = useMemo(() => todas.filter((l) => {
    if (l.tipo === 'grupo' || l.tipo === 'novaInst') return true;
    if (recolhidas.has(l.g.conta.id)) return false;
    if (l.tipo === 'inv' || l.tipo === 'novoInv') return true;
    return abertosInv.has(l.x.inv.id); // o aporte e o "+ aporte"
  }), [todas, recolhidas, abertosInv]);
  const soB = (l) => l.tipo === 'grupo' || l.tipo === 'inv';
  const todasB = useMemo(() => todas.filter(soB), [todas]);
  const visiveisB = useMemo(() => visiveis.filter(soB), [visiveis]);
  const qtd = grupos.reduce((s, g) => s + g.itens.length, 0);
  const comum = { todas, visiveis, recolhidas, alternar };
  const corpo = verVista === 'mes'
    ? <TabelaMesAMes key="b" {...comum} todas={todasB} visiveis={visiveisB} meses={meses} comps={comps} cdi={cdi} pct={modo === 'pct'} centavos={centavos} />
    : <TabelaCarteira key="a" {...comum} ordem={ordem} onOrdenar={onOrdenar} total={total} ano={ano} hoje={hoje} movel={movel} acoes={acoes} edicao={edicao} cdi={cdi} centavos={centavos}
      abertosInv={abertosInv} alternarInv={alternarInv} abrirInv={abrirInv} />;

  const icones = comFilhos.length > 0 && (
    <span className="inline-flex shrink-0 overflow-hidden rounded-md border border-gray-300 bg-white">
      <Tooltip label={tudoAberto ? 'Recolher tudo' : 'Expandir tudo'}>
        <button type="button" aria-label={tudoAberto ? 'Recolher tudo' : 'Expandir tudo'} className={BTN}
          onClick={() => setRecolhidas(() => (tudoAberto ? new Set(comFilhos.map((g) => g.conta.id)) : new Set()))}>
          <IconExpandirTudo fechar={tudoAberto} />
        </button>
      </Tooltip>
    </span>
  );
  const trocas = (
    <>
      {(verVista === 'carteira' || modo === 'rs') && (
        <span className="flex h-[30px] items-center gap-2 px-1">
          <button type="button" tabIndex={-1} aria-hidden="true" onClick={() => setCentavos(!centavos)}
            className="whitespace-nowrap text-[12px] font-medium text-gray-600">Centavos</button>
          <Toggle compacto rotulo="Mostrar os centavos nos valores" checked={centavos} onChange={setCentavos} />
        </span>
      )}
      <AbasPilula abas={[{ key: 'carteira', label: 'Carteira' }, { key: 'mes', label: 'Mês a mês' }]} valor={vista} onChange={setVista} variante="claro" altura={30} folga={2} />
      {vista === 'mes' && <AbasPilula abas={[{ key: 'rs', label: 'R$' }, { key: 'pct', label: '%' }]} valor={modo} onChange={setModo} variante="claro" altura={30} folga={2} />}
    </>
  );
  const legenda = verVista === 'mes'
    ? `o que rendeu em cada mês ${modo === 'pct' ? 'em %' : 'em reais'} · o tom mais forte é o melhor mês de cada linha`
    : `${qtd} ${qtd === 1 ? 'investimento' : 'investimentos'} em ${grupos.length} ${grupos.length === 1 ? 'instituição' : 'instituições'}`;
  const rodape = qtdEncerrados > 0 && verVista === 'carteira' && (
    <button type="button" onClick={onEncerrados} className="text-[12px] font-medium text-gray-500 underline-offset-2 hover:text-gray-800 hover:underline">
      {encerrados ? 'Esconder os encerrados' : `Mostrar ${qtdEncerrados === 1 ? 'o encerrado' : `os ${qtdEncerrados} encerrados`}`}
    </button>
  );

  return (
    <section className="card flex flex-col overflow-hidden !p-0">
      <div className="flex shrink-0 flex-wrap items-center gap-2.5 px-4 pb-2.5 pt-3">
        <span className="text-[13px] font-semibold text-gray-800">Investimentos</span>
        <span className="text-[11px] text-gray-400">{legenda}</span>
        <span className="flex-1" />
        {!movel && trocas}
        {!movel && icones}
      </div>
      {aviso}
      <div className="min-h-0 overflow-x-auto">{corpo}</div>
      {/* O RODAPÉ DA PLANILHA: as teclas e se está gravando (cada célula grava sozinha) */}
      {editavel && verVista === 'carteira' ? (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-gray-100 bg-hx-fafbfc px-4 py-2 text-[11.5px] text-gray-500">
          <span className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
            <Kbd>Enter</Kbd> edita e grava · <Kbd>Tab</Kbd> a próxima · <Kbd>Esc</Kbd> desiste · <Kbd>Ctrl Z</Kbd> desfaz · <Kbd>Delete</Kbd> exclui o aporte
          </span>
          {rodape}
          <span className="flex-1" />
          <span className={edicao.gravando ? 'font-medium text-gray-700' : ''}>{edicao.gravando ? 'Gravando…' : 'cada célula grava sozinha'}</span>
        </div>
      ) : rodape && <div className="border-t border-gray-100 px-4 py-2">{rodape}</div>}
    </section>
  );
}
