import { useMemo, useRef, useState } from 'react';
import Tooltip from '../Tooltip.jsx';
import Toggle from '../Toggle.jsx';
import { DivisorFaixa, Trilho as TrilhoFaixa } from '../filtros/FaixaFiltros.jsx';
import BalaoGrafico, { useBalao } from '../graficos/BalaoGrafico.jsx';
import { COR_ENTRADAS } from '../graficos/Graficos.jsx';
import { Etiqueta } from '../Comuns.jsx';
import { CirculoMais, IconAplicar, IconExpandirTudo, IconLapis, IconLixeira, IconResgatar } from '../icons.jsx';
import useLinhasAnimadas, { atributosLinha } from '../../lib/useLinhasAnimadas.js';
import { formatBRL } from '../../lib/dinheiro.js';
import { formatDate } from '../../lib/format.js';
import { lsGet, lsSet } from '../../lib/storage.js';
import { diasEntre, ehIsento, fimDeSemana, nomeDoTipo, proximaQueda, rotuloTaxa } from '../../lib/carteira.js';

// A CARTEIRA (07/11/2026, a tabela A do mockup "Carteira por aportes"): a INSTITUIÇÃO é a faixa (a barra da cor dela, o
// nome e os totais), o INVESTIMENTO recuado em duas linhas (o nome; o tipo, a taxa e quantos aportes) e os APORTES
// recuados de novo, pendurados num TRILHO que desce da seta do investimento. Cada número de aporte é a conta da
// `lib/carteira.js` — o balão do "Vale hoje" mostra a conta inteira. Instituições e investimentos recolhem animados
// (`useLinhasAnimadas`), lembrados em `carteira_fechadas`; os CENTAVOS no trilho do cabeçalho (`carteira_centavos`).
// As ações da linha no mesmo quadrado de 30px: no investimento, APORTAR (as moedas +); no aporte, RESGATAR (as moedas −),
// EDITAR e EXCLUIR. No celular, só ler.
// O VENCIMENTO (08/11/2026, migration 022): o investimento que REAPLICA diz isso na linha dele e embaixo do vencimento de
// cada aporte; o aporte que o app reaplicou sozinho tem "reaplicado" e a marca âmbar "conferir" (abre o ✎) até a pessoa
// salvar; o encerrado que virou outro diz "reaplicado" no lugar de "voltou" e não tem mais o botão Reaplicar.

export const CORES_INSTITUICAO = ['var(--serie-gastos)', 'var(--origem-fixo)', 'var(--serie-sobrou)', 'var(--serie-entradas)', 'var(--origem-manual)', 'var(--origem-cartao)'];
const comCentavos = (c) => (Number(c) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const formatos = (centavos) => (centavos ? (c) => `R$ ${comCentavos(c)}` : (c) => `R$ ${Math.round(c / 100).toLocaleString('pt-BR')}`);
const sinal = (c) => (c > 0 ? '+' : c < 0 ? '−' : '');
const pctTexto = (f, casas = 1) => (f === null || f === undefined || !Number.isFinite(f) ? '—' : `${(f * 100).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas })}%`);
const pctAliq = (a) => `${(a * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
const TOM_ALIQUOTA = { 0.225: 'vermelho', 0.2: 'ambar', 0.175: 'cinza', 0.15: 'verde' };
const dataCurta = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(2, 4)}`;
const lerSet = (k) => { try { return new Set(JSON.parse(lsGet(k) ?? '[]')); } catch { return new Set(); } };
const DIA_SEMANA = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
const semana = (iso) => DIA_SEMANA[new Date(`${iso}T12:00:00Z`).getUTCDay()];

const ACAO_ICONE = 'grid h-[30px] w-[30px] shrink-0 place-items-center rounded-[7px] border border-gray-300 bg-white text-gray-600 transition-colors hover:bg-gray-50 hover:text-gray-900 active:bg-gray-200';
const BotaoLinha = ({ titulo, onClick, children, perigo = false }) => (
  <Tooltip label={titulo}>
    <button type="button" onClick={onClick} aria-label={titulo} className={`${ACAO_ICONE} ${perigo ? 'hover:!text-hx-c0393d' : ''}`}>{children}</button>
  </Tooltip>
);
const IconChevron = ({ aberto }) => (
  <svg viewBox="0 0 24 24" className={`h-[12px] w-[12px] shrink-0 text-gray-500 transition-[transform,color] duration-150 group-hover/seta:text-gray-800 ${aberto ? 'rotate-90' : ''}`} fill="none"
    stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
);
const Seta = ({ aberto, onClick, rotulo }) => (
  <button type="button" onClick={onClick} aria-expanded={aberto} aria-label={rotulo}
    className="group/seta flex h-[20px] w-[20px] shrink-0 items-center justify-center rounded-[4px] transition-colors hover:bg-gray-200"><IconChevron aberto={aberto} /></button>
);
// o TRILHO do aporte: a linha que desce da seta do investimento (centro em 40px) e o braço até o texto
const RECUO_APORTE = 80;
const Trilho = ({ ultimo }) => (
  <>
    <span aria-hidden="true" className={`pointer-events-none absolute left-[40px] top-0 w-px bg-gray-300 ${ultimo ? 'h-1/2' : 'bottom-0'}`} />
    <span aria-hidden="true" className="pointer-events-none absolute left-[40px] top-1/2 h-px w-[30px] bg-gray-300" />
  </>
);

// O vencimento: até 45 dias, a pílula âmbar com quantos faltam; depois, a data.
function Vence({ data, hoje }) {
  if (!data) return <span className="text-[12px] text-gray-400">—</span>;
  const n = diasEntre(hoje, data);
  if (n <= 45) return <Etiqueta tom="ambar">{n <= 0 ? 'vence hoje' : `em ${n} ${n === 1 ? 'dia' : 'dias'}`} · {dataCurta(data)}</Etiqueta>;
  return <span className="text-[12.5px] tabular-nums text-gray-700">{formatDate(data)}</span>;
}

const COLUNAS = [
  { id: 'nome', rotulo: 'Investimento · aporte', esq: true },
  { id: 'vence', rotulo: 'Vence', esq: true, desk: true },
  { id: 'aplicado', rotulo: 'Aplicado', desk: true },
  { id: 'vale', rotulo: 'Vale hoje' },
  { id: 'rendeu', rotulo: 'Rendeu' },
  { id: 'ir', rotulo: 'IR ≈', desk: true },
  { id: 'liquido', rotulo: 'Líquido ≈', desk: true },
];

export default function TabelaCarteira({ carteira, hoje, movel, acoes, mostrarEncerrados, onEncerrados }) {
  const reais0 = formatos(false);
  const [centavos, setCentavosEstado] = useState(() => lsGet('carteira_centavos') === '1');
  const setCentavos = (v) => { lsSet('carteira_centavos', v ? '1' : '0'); setCentavosEstado(v); };
  const reais = formatos(centavos);
  const [fechadas, setFechadasEstado] = useState(() => lerSet('carteira_fechadas'));
  const setFechadas = (f) => setFechadasEstado((antes) => { const n = f(antes); lsSet('carteira_fechadas', JSON.stringify([...n])); return n; });
  const alternar = (id) => setFechadas((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const [sobLinha, setSobLinha] = useState(null);
  const balao = useBalao(300, 190);
  const caixaRef = useRef(null);

  const { grupos, total, encerrados } = carteira;
  const cor = useMemo(() => Object.fromEntries(grupos.map((g, i) => [g.instituicao, CORES_INSTITUICAO[i % CORES_INSTITUICAO.length]])), [grupos]);

  // as linhas, na ordem, com quem as contém (para recolher)
  const todas = useMemo(() => {
    const out = [];
    grupos.forEach((g) => {
      out.push({ id: `g:${g.instituicao}`, tipo: 'grupo', g });
      g.investimentos.forEach((x) => {
        out.push({ id: `i:${x.inv.id}`, tipo: 'inv', g, x, pai: `g:${g.instituicao}` });
        const comNovo = !!acoes && x.inv.ativo !== false;
        x.aportes.forEach((item, k) => out.push({ id: `a:${item.ap.id}`, tipo: 'aporte', g, x, item, pai: `g:${g.instituicao}`, avo: `i:${x.inv.id}`, ultimo: !comNovo && k === x.aportes.length - 1 }));
        if (comNovo) out.push({ id: `n:${x.inv.id}`, tipo: 'novo', g, x, pai: `g:${g.instituicao}`, avo: `i:${x.inv.id}` });
      });
    });
    if (mostrarEncerrados && encerrados.length) {
      out.push({ id: 'enc', tipo: 'encCab' });
      encerrados.forEach((item) => out.push({ id: `e:${item.ap.id}`, tipo: 'enc', item }));
    }
    return out;
  }, [grupos, encerrados, mostrarEncerrados, acoes]);
  const visiveis = useMemo(() => todas.filter((l) => (!l.pai || !fechadas.has(l.pai)) && (!l.avo || !fechadas.has(l.avo))), [todas, fechadas]);
  const desenhadas = useLinhasAnimadas(todas, visiveis, caixaRef);
  const recolhiveis = todas.filter((l) => l.tipo === 'grupo' || l.tipo === 'inv').map((l) => l.id);
  const tudoFechado = recolhiveis.length > 0 && grupos.every((g) => fechadas.has(`g:${g.instituicao}`));

  const th0 = 'sticky top-0 z-20 whitespace-nowrap border-b border-gray-200 bg-hx-f9fafb px-3 py-2 text-[10.5px] font-semibold uppercase tracking-wide text-gray-500';
  const desk = (c) => (c.desk && movel ? 'hidden' : '');
  const aceso = (id) => (sobLinha === id ? 'gm-acesa' : '');

  // o BALÃO: a conta do "Vale hoje" de um aporte, ou o IR dele
  const info = (() => {
    const a = balao.ativo;
    if (!a) return null;
    const l = todas.find((x) => x.id === a.id);
    if (!l || l.tipo !== 'aporte') return null;
    const { ap, inv, pos, resgates } = l.item;
    const titulo = `${inv.nome} · ${formatDate(ap.origem === 'antigo' ? ap.aplicado_em ?? ap.data : ap.data)}`;
    if (a.col === 'ir') {
      if (ehIsento(inv.tipo)) return { titulo, itens: [{ rotulo: 'Rendeu', valor: formatBRL(pos.rendeu) }, { rotulo: 'IR', valor: 'isento' }], nota: `${nomeDoTipo(inv.tipo)} é isenta de IR para pessoa física.` };
      const q = pos.semData ? null : proximaQueda(ap.origem === 'antigo' ? ap.aplicado_em : ap.data, hoje);
      return {
        titulo: `${titulo} · se resgatasse hoje`,
        itens: [
          { rotulo: 'Rendeu', valor: formatBRL(pos.rendeu), cor: COR_ENTRADAS },
          ...(pos.iof ? [{ rotulo: `IOF (${pos.idade} ${pos.idade === 1 ? 'dia' : 'dias'}: menos de 30)`, valor: formatBRL(pos.iof) }] : []),
          { rotulo: `IR ${pctAliq(pos.aliquota)}${pos.semData ? ' (pelo maior)' : ` (${pos.idade} dias)`}`, valor: formatBRL(pos.ir) },
          { rotulo: 'Líquido ≈', valor: formatBRL(pos.liquido) },
        ],
        nota: pos.semData ? 'Sem a data do depósito o IR vai pelo maior (22,5%): o líquido nunca fica a mais. Ponha a data no ✎ do aporte para acertar.'
          : q ? `Em ${formatDate(q.data)} a alíquota cai para ${pctAliq(q.para)}.` : 'Já na menor alíquota (15%).',
      };
    }
    const c = pos.conta;
    const base = c && c.f ? Math.round(pos.exato.vale / c.f) : pos.vale;
    const depoisDeResgate = c && c.de !== pos.partida.data;
    const itens = [];
    if (depoisDeResgate) itens.push({ rotulo: `Em ${formatDate(c.de)}, depois do resgate`, valor: formatBRL(base) });
    else if (ap.origem === 'antigo') {
      itens.push({ rotulo: `O banco em ${formatDate(ap.data)}`, valor: formatBRL(Number(ap.valor_centavos)) });
      itens.push({ rotulo: 'Já tinha rendido', valor: formatBRL(Number(ap.rendeu_antes_centavos)) });
    } else {
      const fds = !ap.reaplicado_de && fimDeSemana(ap.data);
      itens.push({ rotulo: ap.reaplicado_de ? `Reaplicado em ${formatDate(ap.data)} (o vencimento, sem o IR)` : `Aplicado em ${formatDate(ap.data)}${fds ? ` (${semana(ap.data)}: rende a partir do dia útil seguinte)` : ''}`, valor: formatBRL(Number(ap.valor_centavos)) });
    }
    if (c) itens.push({ rotulo: `${c.dias} ${c.dias === 1 ? 'dia útil' : 'dias úteis'} de CDI a ${rotuloTaxa(inv.taxa).replace(' do CDI', '')}`, valor: `× ${c.f.toLocaleString('pt-BR', { minimumFractionDigits: 6, maximumFractionDigits: 6 })}` });
    itens.push({ rotulo: 'Vale hoje', valor: formatBRL(pos.vale), cor: COR_ENTRADAS });
    const notas = [];
    if (resgates.length) notas.push(`Resgates: ${resgates.map((r) => `${r.tudo ? 'tudo' : formatBRL(r.valor_centavos)} em ${formatDate(r.data)}`).join(', ')}.`);
    if (c && !c.dias && ap.origem === 'antigo') notas.push(`Lido no banco hoje (${semana(ap.data)}): o número já tem o CDI dos dias úteis antes dele.`);
    if (c?.proj) notas.push(`O Banco Central publica o CDI no dia útil seguinte: ${c.proj === 1 ? 'o último dia útil foi' : `os últimos ${c.proj} dias úteis foram`} com a taxa do último publicado.`);
    else notas.push('O CDI de cada dia vem do Banco Central.');
    return { titulo, itens, nota: notas.join(' ') };
  })();
  const mover = (id, col) => (e) => balao.aoMover({ id, col })(e);

  const acoesTd = (cls, filhos) => (!movel && (
    <td className={cls}>{filhos && <span className="flex justify-end gap-1 opacity-0 transition-opacity group-hover/linha:opacity-100 focus-within:opacity-100">{filhos}</span>}</td>
  ));
  const numTd = 'px-3 text-right tabular-nums';
  const ir = (t) => (t.ir > 0 ? reais(t.ir) : <span className="font-normal text-gray-400">—</span>);

  const linha = ({ linha: l, estado }) => {
    const attrs = atributosLinha(l.id, estado);
    if (l.tipo === 'grupo') {
      const { g } = l;
      const aberto = !fechadas.has(l.id);
      const faixa = `border-b border-gray-200 bg-hx-f3f4f6 ${aceso(l.id)}`;
      const n = g.investimentos.length;
      return (
        <tr key={l.id} {...attrs} className="group/linha" onMouseEnter={() => setSobLinha(l.id)}>
          <td className={`relative h-[46px] cursor-pointer pl-3 pr-3 ${faixa}`} onClick={() => alternar(l.id)}>
            <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-0 w-[3px]" style={{ background: cor[g.instituicao] }} />
            <span className="flex items-center gap-2">
              <Seta aberto={aberto} onClick={(e) => { e.stopPropagation(); alternar(l.id); }} rotulo={aberto ? `Recolher ${g.instituicao}` : `Abrir ${g.instituicao}`} />
              <span className="truncate text-[14px] font-semibold text-gray-900">{g.instituicao}</span>
              {!movel && <span className="shrink-0 text-[11.5px] font-normal text-gray-500">{n} {n === 1 ? 'investimento' : 'investimentos'}</span>}
            </span>
          </td>
          <td className={`${faixa} ${movel ? 'hidden' : ''}`} />
          <td className={`${faixa} ${numTd} font-semibold text-gray-700 ${movel ? 'hidden' : ''}`}>{reais(g.totais.aplicado)}</td>
          <td className={`${faixa} ${numTd} text-[13.5px] font-semibold text-gray-900`}>{reais(g.totais.vale)}</td>
          <td className={`${faixa} ${numTd} font-semibold`}><span className={g.totais.rendeu < 0 ? 'text-hx-c0393d' : 'text-green-700'}>{sinal(g.totais.rendeu)}{reais(Math.abs(g.totais.rendeu))}</span></td>
          <td className={`${faixa} ${numTd} font-semibold text-gray-700 ${movel ? 'hidden' : ''}`}>{ir(g.totais)}</td>
          <td className={`${faixa} ${numTd} font-semibold text-gray-900 ${movel ? 'hidden' : ''}`}>{reais(g.totais.liquido)}</td>
          {acoesTd(faixa)}
        </tr>
      );
    }
    if (l.tipo === 'inv') {
      const { x } = l;
      const aberto = !fechadas.has(l.id);
      const temCorpo = x.aportes.length > 0 || !!acoes;
      const td = `border-b border-gray-100 py-2 ${aceso(l.id)}`;
      const n = x.aportes.length;
      return (
        <tr key={l.id} {...attrs} className="group/linha" onMouseEnter={() => setSobLinha(l.id)}>
          <td className={`relative pl-[30px] pr-3 ${td}`}>
            {temCorpo && aberto && <span aria-hidden="true" className="pointer-events-none absolute bottom-0 left-[40px] top-[30px] w-px bg-gray-300" />}
            <span className="flex items-start gap-1.5">
              {temCorpo ? <span className="mt-px"><Seta aberto={aberto} onClick={() => alternar(l.id)} rotulo={aberto ? `Fechar os aportes de ${x.inv.nome}` : `Abrir os aportes de ${x.inv.nome}`} /></span> : <span className="w-[20px] shrink-0" />}
              <span className="block min-w-0 max-w-[260px]">
                <span className={`flex items-center gap-1.5 text-[13px] font-medium ${x.inv.ativo === false ? 'text-gray-400' : 'text-gray-800'}`}>
                  <span className="truncate">{x.inv.nome}</span>
                  {!n && <span className="shrink-0 whitespace-nowrap"><Etiqueta tom="ambar">sem aporte</Etiqueta></span>}
                </span>
                <span className="block truncate text-[11.5px] text-gray-500">{nomeDoTipo(x.inv.tipo)} · {rotuloTaxa(x.inv.taxa)}{n ? ` · ${n} ${n === 1 ? 'aporte' : 'aportes'}` : ''}{x.inv.no_vencimento === 'reaplica' ? ' · reaplica no vencimento' : ''}</span>
              </span>
            </span>
          </td>
          <td className={`px-3 ${td} ${movel ? 'hidden' : ''}`}>
            {x.inv.resgate === 'diaria' ? (
              <span className="inline-flex h-[20px] items-center whitespace-nowrap rounded-full px-2 text-[11px] font-semibold"
                style={{ background: 'color-mix(in srgb, var(--serie-gastos) 13%, transparent)', color: 'var(--serie-gastos)' }}>resgate diário</span>
            ) : x.proximoVencimento ? (
              <span className="flex flex-col items-start gap-0.5"><span className="text-[11px] text-gray-400">o próximo</span><Vence data={x.proximoVencimento} hoje={hoje} /></span>
            ) : <span className="inline-flex h-[20px] items-center rounded-full bg-gray-100 px-2 text-[11px] font-semibold text-gray-600">no vencimento</span>}
          </td>
          <td className={`${td} ${numTd} text-gray-700 ${movel ? 'hidden' : ''}`}>{n ? reais(x.totais.aplicado) : '—'}</td>
          <td className={`${td} ${numTd} font-semibold text-gray-900`}>{n ? reais(x.totais.vale) : <span className="font-normal text-gray-400">—</span>}</td>
          <td className={`${td} ${numTd}`}>
            {n ? (<><span className={x.totais.rendeu < 0 ? 'text-hx-c0393d' : 'text-green-700'}>{sinal(x.totais.rendeu)}{reais(Math.abs(x.totais.rendeu))}</span>
              <span className="block text-[11.5px] text-gray-500">{pctTexto(x.totais.aplicado ? x.totais.rendeu / x.totais.aplicado : null)}</span></>) : null}
          </td>
          <td className={`${td} ${numTd} text-gray-700 ${movel ? 'hidden' : ''}`}>{n ? (ehIsento(x.inv.tipo) ? <span className="text-gray-400">isento</span> : ir(x.totais)) : null}</td>
          <td className={`${td} ${numTd} font-semibold text-gray-900 ${movel ? 'hidden' : ''}`}>{n ? reais(x.totais.liquido) : null}</td>
          {acoesTd(`${td} px-2`, acoes && x.inv.ativo !== false && (
            <BotaoLinha titulo={`Aportar em ${x.inv.nome}`} onClick={() => acoes.aportar(x.inv)}><IconAplicar /></BotaoLinha>
          ))}
        </tr>
      );
    }
    if (l.tipo === 'aporte') {
      const { ap, inv, pos, resgates } = l.item;
      const td = `h-[38px] border-b border-gray-100 py-1 text-[12.5px] ${aceso(l.id)}`;
      const antigo = ap.origem === 'antigo';
      const data = antigo ? ap.aplicado_em ?? ap.data : ap.data;
      const queda = !pos.semData && !ehIsento(inv.tipo) ? proximaQueda(data, hoje) : null;
      return (
        <tr key={l.id} {...attrs} className="group/linha" onMouseEnter={() => setSobLinha(l.id)}>
          <td className={`relative pr-3 ${td}`}>
            <Trilho ultimo={l.ultimo} />
            <span className="flex flex-wrap items-baseline gap-x-2" style={{ paddingLeft: movel ? 56 : RECUO_APORTE }}>
              <span className="tabular-nums text-gray-700">{antigo && !ap.aplicado_em ? `saldo de ${formatDate(ap.data)}` : formatDate(data)}</span>
              <span className="text-[11.5px] text-gray-400">
                {antigo ? `já estava aplicado${ap.aplicado_em ? ` · banco em ${formatDate(ap.data).slice(0, 5)}` : ''}` : `${pos.idade} ${pos.idade === 1 ? 'dia' : 'dias'}${ap.reaplicado_de ? ' · reaplicado' : ''}`}
              </span>
              {ap.conferir && (acoes ? (
                <Tooltip label="O app lançou sozinho no vencimento: confira o valor com o banco e salve">
                  <button type="button" onClick={() => acoes.editar(l.item)} className="self-center"><Etiqueta tom="ambar">conferir</Etiqueta></button>
                </Tooltip>
              ) : <span className="self-center"><Etiqueta tom="ambar">conferir</Etiqueta></span>)}
            </span>
          </td>
          <td className={`px-3 ${td} ${movel ? 'hidden' : ''}`}>
            <Vence data={ap.vencimento} hoje={hoje} />
            {ap.vencimento && inv.no_vencimento === 'reaplica' && !ap.nao_reaplicar && <span className="block text-[11px] text-gray-400">reaplica sozinho</span>}
          </td>
          <td className={`${td} ${numTd} text-gray-700 ${movel ? 'hidden' : ''}`}>
            {reais(pos.aplicado)}
            {resgates.length > 0 && <span className="block text-[11px] text-gray-400">resgatou {reais0(resgates.reduce((s, r) => s + Number(r.valor_centavos ?? 0), 0))}</span>}
          </td>
          <td className={`${td} ${numTd} cursor-help text-gray-800`} onMouseMove={mover(l.id, 'vale')} onMouseLeave={balao.aoSair}>
            <span className="underline decoration-gray-300 decoration-dotted underline-offset-[3px]">{reais(pos.vale)}</span>
          </td>
          <td className={`${td} ${numTd} text-green-700`}>{sinal(pos.rendeu)}{reais(Math.abs(pos.rendeu))}</td>
          <td className={`${td} ${numTd} text-gray-600 ${movel ? 'hidden' : ''}`} onMouseMove={mover(l.id, 'ir')} onMouseLeave={balao.aoSair}>
            {ehIsento(inv.tipo) ? <span className="text-gray-400">isento</span> : (
              <span className="inline-flex items-center justify-end gap-1.5">
                <Etiqueta tom={pos.semData ? 'ambar' : TOM_ALIQUOTA[pos.aliquota] ?? 'cinza'}>{pctAliq(pos.aliquota)}{pos.iof ? ' + IOF' : ''}</Etiqueta>
                {reais(pos.ir + pos.iof)}
              </span>
            )}
            {pos.semData ? <span className="block text-[11px] text-gray-400">sem a data do depósito</span>
              : queda && <span className="block text-[11px] text-gray-400">→ {pctAliq(queda.para)} em {dataCurta(queda.data)}</span>}
          </td>
          <td className={`${td} ${numTd} text-gray-700 ${movel ? 'hidden' : ''}`}>{reais(pos.liquido)}</td>
          {acoesTd(`${td} px-2`, acoes && (
            <>
              <BotaoLinha titulo="Resgatar deste aporte" onClick={() => acoes.resgatar(l.item)}><IconResgatar /></BotaoLinha>
              <BotaoLinha titulo="Editar o aporte" onClick={() => acoes.editar(l.item)}><IconLapis className="h-[14px] w-[14px]" /></BotaoLinha>
              <BotaoLinha titulo="Excluir o aporte" perigo onClick={() => acoes.excluir(l.item)}><IconLixeira className="h-[14px] w-[14px]" /></BotaoLinha>
            </>
          ))}
        </tr>
      );
    }
    if (l.tipo === 'novo') {
      return (
        <tr key={l.id} {...attrs} className="group/add">
          <td colSpan={8} className="relative h-[34px] cursor-pointer border-b border-gray-100 py-0 pr-3 text-[12.5px]" onClick={() => acoes.aportar(l.x.inv)}>
            <Trilho ultimo />
            <span className="flex items-center gap-2 font-medium text-gray-500 transition-colors group-hover/add:text-gray-800" style={{ paddingLeft: RECUO_APORTE - 4 }}>
              <CirculoMais borda="text-gray-400" />aporte em {l.x.inv.nome}
            </span>
          </td>
        </tr>
      );
    }
    if (l.tipo === 'encCab') {
      return (
        <tr key={l.id} {...attrs}>
          <td colSpan={8} className="h-[38px] border-b border-gray-200 bg-hx-f9fafb px-3 text-[12px] font-semibold text-gray-600">
            Encerrados <span className="font-normal text-gray-400">· venceram (o dinheiro voltou para a conta ou virou um aporte novo) ou foram resgatados inteiros</span>
          </td>
        </tr>
      );
    }
    // um encerrado
    const { ap, inv, pos, seguinte } = l.item;
    const e = pos.encerrado;
    const td = `h-[38px] border-b border-gray-100 py-1 text-[12.5px] text-gray-500 ${aceso(l.id)}`;
    return (
      <tr key={l.id} {...attrs} className="group/linha" onMouseEnter={() => setSobLinha(l.id)}>
        <td className={`px-3 ${td}`}><span className="text-gray-700">{inv.nome}</span> · {formatDate(ap.origem === 'antigo' ? ap.aplicado_em ?? ap.data : ap.data)}</td>
        <td className={`px-3 ${td} ${movel ? 'hidden' : ''}`}><Etiqueta>{e.motivo === 'vencimento' ? 'venceu' : 'resgatado'} {dataCurta(e.data)}</Etiqueta></td>
        <td className={`${td} ${numTd} ${movel ? 'hidden' : ''}`}>{reais(e.aplicado)}</td>
        <td className={`${td} ${numTd}`}>{reais(e.valor)}<span className="block text-[11px] text-gray-400">{seguinte ? 'reaplicado' : 'voltou'}</span></td>
        <td className={`${td} ${numTd}`}>{sinal(e.valor - e.aplicado)}{reais(Math.abs(e.valor - e.aplicado))}</td>
        <td className={`${td} ${movel ? 'hidden' : ''}`} />
        <td className={`${td} ${movel ? 'hidden' : ''}`} />
        {acoesTd(`${td} px-2`, acoes && (
          <>
            {e.motivo === 'vencimento' && !seguinte && <BotaoLinha titulo="Reaplicar (um aporte novo com o valor do dia menos o IR)" onClick={() => acoes.reaplicar(l.item)}><IconAplicar /></BotaoLinha>}
            <BotaoLinha titulo="Excluir o aporte (some do histórico)" perigo onClick={() => acoes.excluir(l.item)}><IconLixeira className="h-[14px] w-[14px]" /></BotaoLinha>
          </>
        ))}
      </tr>
    );
  };

  const qtdInv = grupos.reduce((s, g) => s + g.investimentos.length, 0);
  return (
    <section className="card flex flex-col overflow-hidden !p-0">
      <div className="flex shrink-0 flex-wrap items-center gap-2.5 px-4 pb-2.5 pt-3">
        <span className="text-[11.5px] text-gray-400">{qtdInv} {qtdInv === 1 ? 'investimento' : 'investimentos'} em {grupos.length} {grupos.length === 1 ? 'instituição' : 'instituições'} · o valor de hoje é a conta de cada aporte pelo CDI de cada dia</span>
        <span className="flex-1" />
        {!movel && (
          <TrilhoFaixa className="shrink-0">
            <span className="flex h-[24px] items-center gap-2 px-2">
              <button type="button" tabIndex={-1} aria-hidden="true" onClick={() => setCentavos(!centavos)} className="whitespace-nowrap text-[12px] font-medium text-gray-600">Centavos</button>
              <Toggle compacto rotulo="Mostrar os centavos nos valores" checked={centavos} onChange={setCentavos} />
            </span>
            {recolhiveis.length > 0 && <DivisorFaixa />}
            {recolhiveis.length > 0 && (
              <Tooltip label={tudoFechado ? 'Expandir tudo' : 'Recolher tudo'}>
                <button type="button" aria-label={tudoFechado ? 'Expandir tudo' : 'Recolher tudo'}
                  className="inline-flex h-[24px] w-[28px] shrink-0 items-center justify-center rounded-[4px] text-gray-600 transition-colors hover:bg-gray-200 hover:text-gray-900"
                  onClick={() => setFechadas(() => (tudoFechado ? new Set() : new Set(recolhiveis)))}>
                  <IconExpandirTudo fechar={!tudoFechado} />
                </button>
              </Tooltip>
            )}
          </TrilhoFaixa>
        )}
      </div>
      <div ref={caixaRef} className="min-h-0 overflow-x-auto" onMouseLeave={() => { balao.aoSair(); setSobLinha(null); }}>
        <table className="w-full border-separate border-spacing-0 text-[13px]" style={{ minWidth: movel ? 0 : 1000 }}>
          <thead><tr>
            {COLUNAS.map((c) => (
              <th key={c.id} className={`${th0} ${c.esq ? 'text-left' : 'text-right'} ${desk(c)}`}
                style={movel ? undefined : c.id === 'nome' ? { width: 320, minWidth: 280 } : c.id === 'vence' ? { width: 170, minWidth: 150 } : undefined}>{c.rotulo}</th>
            ))}
            {!movel && <th className={`${th0} w-[112px]`} aria-label="Ações" />}
          </tr></thead>
          <tbody>
            {desenhadas.map(linha)}
            <tr data-segue="" className="font-semibold">
              <td className="h-10 border-t border-gray-200 bg-hx-f9fafb px-3 text-gray-800">Total</td>
              <td className={`border-t border-gray-200 bg-hx-f9fafb ${movel ? 'hidden' : ''}`} />
              <td className={`border-t border-gray-200 bg-hx-f9fafb ${numTd} text-gray-700 ${movel ? 'hidden' : ''}`}>{reais(total.aplicado)}</td>
              <td className={`border-t border-gray-200 bg-hx-f9fafb ${numTd} text-gray-900`}>{reais(total.vale)}</td>
              <td className={`border-t border-gray-200 bg-hx-f9fafb ${numTd}`}>
                <span className={total.rendeu < 0 ? 'text-hx-c0393d' : 'text-green-700'}>{sinal(total.rendeu)}{reais(Math.abs(total.rendeu))}</span>
                <span className="block text-[11.5px] font-normal text-gray-500">{pctTexto(total.aplicado ? total.rendeu / total.aplicado : null)}</span>
              </td>
              <td className={`border-t border-gray-200 bg-hx-f9fafb ${numTd} text-gray-700 ${movel ? 'hidden' : ''}`}>{reais(total.ir)}</td>
              <td className={`border-t border-gray-200 bg-hx-f9fafb ${numTd} text-gray-900 ${movel ? 'hidden' : ''}`}>{reais(total.liquido)}</td>
              {!movel && <td className="border-t border-gray-200 bg-hx-f9fafb" />}
            </tr>
          </tbody>
        </table>
      </div>
      {(encerrados.length > 0 || !movel) && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-gray-100 bg-hx-fafbfc px-4 py-2 text-[11.5px] text-gray-500">
          {!movel && <span>Passe o mouse no <b className="font-semibold text-gray-700">Vale hoje</b> de um aporte para ver a conta, e no <b className="font-semibold text-gray-700">IR</b> para ver a alíquota.</span>}
          <span className="flex-1" />
          {encerrados.length > 0 && (
            <button type="button" onClick={onEncerrados} className="text-[12px] font-medium text-gray-500 underline-offset-2 hover:text-gray-800 hover:underline">
              {mostrarEncerrados ? 'Esconder os encerrados' : `Mostrar ${encerrados.length === 1 ? 'o encerrado' : `os ${encerrados.length} encerrados`}`}
            </button>
          )}
        </div>
      )}
      {info && <BalaoGrafico pos={balao.pos} largura={300} titulo={info.titulo} itens={info.itens} nota={info.nota} />}
    </section>
  );
}
