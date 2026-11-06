import { useMemo, useRef, useState } from 'react';
import Modal from '../Modal.jsx';
import Tooltip from '../Tooltip.jsx';
import AbasPilula from '../AbasPilula.jsx';
import BalaoGrafico, { useBalao } from '../graficos/BalaoGrafico.jsx';
import { COR_ENTRADAS } from '../graficos/Graficos.jsx';
import { COR_FALTOU, MiniCurva } from '../graficos/GraficosVisao.jsx';
import { BotaoAcao, Etiqueta } from '../Comuns.jsx';
import { IconExpandirTudo, IconLapis, IconMais, IconMaximize, IconMinimize, IconSetaOrdenacao } from '../icons.jsx';
import useLinhasAnimadas, { atributosLinha } from '../../lib/useLinhasAnimadas.js';
import { formatBRL } from '../../lib/dinheiro.js';
import { competenciaCurta, formatDate, nomeCompetencia } from '../../lib/format.js';
import { lsGet, lsSet } from '../../lib/storage.js';
import {
  impostoGarantia, linhaMesAMes, nomeTipoInvestimento, ordenarCarteira, proximaOrdemCarteira, rotuloLiquidez, rotuloRende,
} from '../../lib/investimentos.js';
import { COR_CDI, cdiFechado } from './GraficoPatrimonio.jsx';
import { IcoDesce, IcoSobe } from './ModaisPatrimonio.jsx';

// A TABELA DOS INVESTIMENTOS (05/11/2026, opção A do mockup "Patrimônio · a tabela", com a B como segunda vista):
//   · CARTEIRA (A): a planilha agrupada das Categorias — a conta é o grupo (recolhe animado, `useLinhasAnimadas`), os
//     títulos embaixo com a liquidez, o vencimento (pílula âmbar até 12 meses e a barrinha do prazo), o aplicado, o que
//     vale hoje, o que rendeu, o % do ano e a curva dos 12 meses. A linha acende no hover, o balão lê o "Rendeu" e a
//     curva, e "+ aporte · − resgate · ✎" aparecem no fim da linha. A seta do cabeçalho ordena DENTRO de cada conta.
//   · MÊS A MÊS (B): a Grupo × mês da Visão geral — o que cada título rendeu em cada mês (R$ ou %), o tom mais forte é
//     o melhor mês da linha, o hover é a CRUZ (célula com contorno, linha e coluna acesas) e o balão traz o CDI.
// No canto, o grupo de ícones do DRE: ⇕ expandir / recolher tudo, ⬇ CSV, ⤢ ampliar. A vista, as contas recolhidas e a
// ordem ficam lembradas no navegador (só a preferência, nunca valor).

export const CORES_CONTA = ['var(--serie-gastos)', 'var(--origem-fixo)', 'var(--serie-sobrou)', 'var(--serie-entradas)', 'var(--origem-manual)', 'var(--origem-cartao)'];
const MESES_CURTOS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const reais = (c) => `R$ ${Math.round(c / 100).toLocaleString('pt-BR')}`;
const inteiro = (c) => Math.round(c / 100).toLocaleString('pt-BR');
const pctTexto = (f, casas = 2) => (f === null || f === undefined ? '—' : `${f >= 0 ? '' : '−'}${Math.abs(f * 100).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas })}%`);
const sinal = (c) => (c > 0 ? '+' : c < 0 ? '−' : '');
const BTN = 'flex h-7 w-[30px] items-center justify-center text-gray-600 transition-colors hover:bg-gray-50 active:bg-gray-200';
const lerJson = (k, padrao) => { try { const v = JSON.parse(lsGet(k) ?? 'null'); return v ?? padrao; } catch { return padrao; } };

const IcoBaixar = () => (
  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 4v10M7.5 9.5 12 14l4.5-4.5" /><path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
  </svg>
);
const IcoAmpliar = () => (
  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
    <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
  </svg>
);
// As ações da linha com o NOME escrito (↑ Aplicar · ↓ Resgatar): antes eram "+", "−" e outro "+" (o do investimento novo).
const ACAO_TEXTO = 'inline-flex h-7 items-center gap-1 rounded-[6px] border border-gray-300 bg-white px-2 text-[12px] font-semibold text-gray-600 transition-colors hover:bg-gray-50 hover:text-gray-900';
const IconChevron = ({ aberto }) => (
  <svg viewBox="0 0 24 24" className={`h-3 w-3 shrink-0 text-gray-400 transition-transform duration-150 ${aberto ? 'rotate-90' : ''}`} fill="none"
    stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M9 6l6 6-6 6" />
  </svg>
);

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

// O vencimento: perto (até 12 meses) ou vencido em âmbar; senão mm/aaaa — e a barrinha do tempo que já passou.
function Vence({ x }) {
  const v = x.venc;
  if (!v) return null;
  const mesAno = `${x.inv.vencimento.slice(5, 7)}/${x.inv.vencimento.slice(0, 4)}`;
  return (
    <span className="inline-flex flex-col items-start" title={`Vence em ${formatDate(x.inv.vencimento)}`}>
      {v.vencido ? <Etiqueta tom="ambar">venceu {formatDate(x.inv.vencimento)}</Etiqueta>
        : v.perto ? <Etiqueta tom="ambar">{v.dias <= 45 ? `em ${v.dias} ${v.dias === 1 ? 'dia' : 'dias'}` : `em ${v.meses} meses`}</Etiqueta>
          : <span className="text-[12.5px] tabular-nums text-gray-700">{mesAno}</span>}
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
  { id: 'rendeu', rotulo: 'Rendeu' },
  { id: 'ano', rotulo: 'Em ', desk: true },
  { id: 'curva', rotulo: '12 meses', semOrdem: true, desk: true },
];

function TabelaCarteira({ todas, visiveis, recolhidas, alternar, ordem, onOrdenar, total, ano, movel, acoes, cdi }) {
  const caixaRef = useRef(null);
  const desenhadas = useLinhasAnimadas(todas, visiveis, caixaRef);
  const balao = useBalao(280, 170);
  const [sobLinha, setSobLinha] = useState(null);
  const desk = (c) => (c.desk && movel ? 'hidden' : '');
  const th0 = 'sticky top-0 z-20 whitespace-nowrap border-b border-gray-200 bg-hx-f9fafb px-3 py-2 text-[10.5px] font-semibold uppercase tracking-wide';
  const aceso = (id) => (sobLinha === id ? 'gm-acesa' : '');

  const cabecalho = (c) => {
    const ordenada = ordem?.col === c.id;
    return (
      <th key={c.id} aria-sort={ordenada ? (ordem.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
        className={`group/th ${th0} ${c.alinha === 'left' ? 'text-left' : 'text-right'} ${ordenada ? 'text-gray-800' : 'text-gray-500'} ${desk(c)}`}
        style={c.id === 'nome' && !movel ? { width: 280, minWidth: 240 } : undefined}>
        <span className={`inline-flex items-center gap-1 ${c.alinha === 'left' ? '' : 'flex-row-reverse'}`}>
          <span>{c.id === 'ano' ? `Em ${ano}` : c.rotulo}</span>
          {!c.semOrdem && !movel && (
            <button type="button" onClick={() => onOrdenar(c.id)} aria-label={`Ordenar por ${c.rotulo.toLowerCase()}`}
              title={ordenada ? 'Clique para inverter (a 3ª vez volta à ordem de cadastro)' : `Ordenar por ${c.rotulo.toLowerCase()}`}
              className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-[4px] transition-[opacity,background-color] duration-150 hover:bg-gray-200 ${
                ordenada ? 'text-gray-800 opacity-100' : 'text-gray-400 opacity-0 group-hover/th:opacity-100'}`}>
              <IconSetaOrdenacao className="h-3.5 w-3.5" descendente={ordenada && ordem.dir === 'desc'} />
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
    balao.aoMover({ id, col: 'curva', i })(e);
  };
  const info = (() => {
    const a = balao.ativo;
    if (!a) return null;
    const l = todas.find((t) => t.id === a.id);
    if (!l) return null;
    const item = l.tipo === 'inv' ? l.x : l.g;
    const nome = l.tipo === 'inv' ? l.x.inv.nome : l.g.conta.nome;
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
    const rende = l.tipo === 'inv' ? rotuloRende(l.x.inv) : '';
    return {
      titulo: nome,
      itens: [
        { rotulo: 'Aplicado (do seu bolso)', valor: formatBRL(item.aplicado) },
        { rotulo: `Vale hoje${item.data ? ` (foto de ${formatDate(item.data)})` : ''}`, valor: formatBRL(item.vale) },
        { rotulo: l.tipo === 'inv' ? 'Rendeu desde o cadastro' : l.g.soConta ? 'Rendeu desde a primeira foto' : 'Rendeu (os investimentos)', valor: `${formatBRL(item.rendeu)} · ${pctTexto(item.pct, 1)}`, cor: COR_ENTRADAS },
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

  const rendeuCel = (id, item) => (
    <td onMouseMove={balao.aoMover({ id, col: 'rendeu' })} className={`border-b border-gray-100 px-3 py-2 text-right tabular-nums ${aceso(id)}`}>
      <span className={item.rendeu < 0 ? 'text-hx-c0393d' : 'text-green-700'}>{sinal(item.rendeu)}{reais(Math.abs(item.rendeu))}</span>
      <span className="block text-[11.5px] text-gray-500">{pctTexto(item.pct, 1)}</span>
    </td>
  );
  const curvaCel = (id, item, cor) => (
    <td className={`border-b border-gray-100 px-3 py-2 ${movel ? 'hidden' : ''} ${aceso(id)}`}>
      {item.curva.length > 1 ? (
        <span className="ml-auto block w-[92px] cursor-crosshair" onMouseMove={sobCurva(id, item.curva)}>
          <MiniCurva valores={item.curva.map((p) => p.valor)} cor={cor} largura={92} altura={24} />
        </span>
      ) : <span className="block text-right text-[11.5px] text-gray-400">{item.curva.length ? '1 mês' : '—'}</span>}
    </td>
  );

  return (
    <div ref={caixaRef} onMouseLeave={() => { balao.aoSair(); setSobLinha(null); }}>
      <table className="w-full border-separate border-spacing-0 text-[13px]" style={{ minWidth: movel ? 0 : 960 }}>
        <thead><tr>{COLUNAS_A.map(cabecalho)}{!movel && <th className={`${th0} w-[210px]`} aria-label="Ações" />}</tr></thead>
        <tbody>
          {desenhadas.map(({ linha: l, estado }) => {
            const attrs = atributosLinha(l.id, estado);
            if (l.tipo === 'grupo') {
              const g = l.g;
              const aberto = !recolhidas.has(g.conta.id);
              const temFilhos = g.itens.length > 0;
              return (
                <tr key={l.id} {...attrs} className="group/linha" onMouseEnter={() => setSobLinha(l.id)}>
                  <td className={`h-10 border-b border-gray-100 bg-hx-f9fafb px-3 ${aceso(l.id)}`}>
                    <button type="button" onClick={() => temFilhos && alternar(g.conta.id)} aria-expanded={temFilhos ? aberto : undefined}
                      className={`flex max-w-[300px] items-center gap-2 text-left ${temFilhos ? '' : 'cursor-default'}`}>
                      {temFilhos ? <IconChevron aberto={aberto} /> : <span className="w-3" />}
                      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: g.cor }} />
                      <span className={`truncate font-semibold ${g.conta.ativa === false ? 'text-gray-400' : 'text-gray-800'}`}>{g.conta.nome}</span>
                      <span className={`shrink-0 text-[11.5px] font-normal text-gray-400 ${movel ? 'hidden' : ''}`}>
                        {g.soConta ? 'nenhum investimento' : `${g.itens.length} ${g.itens.length === 1 ? 'investimento' : 'investimentos'}`}
                      </span>
                    </button>
                  </td>
                  <td className={`border-b border-gray-100 bg-hx-f9fafb ${movel ? 'hidden' : ''} ${aceso(l.id)}`}>
                    {g.soConta && !movel && acoes?.podeInvestir && (
                      <button type="button" onClick={() => acoes.novoInvestimento(g.conta)} className="px-3 text-[12px] font-medium text-gray-500 underline-offset-2 hover:text-gray-800 hover:underline">
                        Adicionar investimento
                      </button>
                    )}
                  </td>
                  <td className={`border-b border-gray-100 bg-hx-f9fafb px-3 text-right font-semibold tabular-nums text-gray-700 ${movel ? 'hidden' : ''} ${aceso(l.id)}`}>{reais(g.aplicado)}</td>
                  <td className={`border-b border-gray-100 bg-hx-f9fafb px-3 text-right font-semibold tabular-nums text-gray-900 ${aceso(l.id)}`}>{reais(g.vale)}</td>
                  <td onMouseMove={balao.aoMover({ id: l.id, col: 'rendeu' })} className={`border-b border-gray-100 bg-hx-f9fafb px-3 text-right font-semibold tabular-nums ${aceso(l.id)}`}>
                    <span className={g.rendeu < 0 ? 'text-hx-c0393d' : 'text-green-700'}>{sinal(g.rendeu)}{reais(Math.abs(g.rendeu))}</span>
                  </td>
                  <td className={`border-b border-gray-100 bg-hx-f9fafb px-3 text-right tabular-nums text-gray-600 ${movel ? 'hidden' : ''} ${aceso(l.id)}`}>{pctTexto(g.pctAno, 1)}</td>
                  {curvaCel(l.id, g, g.cor)}
                  {!movel && (
                    <td className={`border-b border-gray-100 bg-hx-f9fafb px-2 ${aceso(l.id)}`}>
                      {acoes && (
                        <span className="flex justify-end gap-0.5 opacity-0 transition-opacity group-hover/linha:opacity-100 focus-within:opacity-100">
                          {acoes.podeInvestir && !g.soConta && (
                            <button type="button" onClick={() => acoes.novoInvestimento(g.conta)} className={ACAO_TEXTO} title={`Adicionar investimento em ${g.conta.nome}`}>
                              <IconMais className="h-[10px] w-[10px]" />investimento
                            </button>
                          )}
                          <BotaoAcao titulo={`Editar ${g.conta.nome}`} onClick={() => acoes.editarConta(g.conta)}><IconLapis className="h-[15px] w-[15px]" /></BotaoAcao>
                        </span>
                      )}
                    </td>
                  )}
                </tr>
              );
            }
            const x = l.x;
            const encerrado = x.inv.ativo === false;
            const sub = [nomeTipoInvestimento(x.inv.tipo), rotuloRende(x.inv), x.inv.emissor].filter(Boolean).join(' · ');
            return (
              <tr key={l.id} {...attrs} className="group/linha" onMouseEnter={() => setSobLinha(l.id)}>
                <td className={`border-b border-gray-100 py-2 pl-[38px] pr-3 ${aceso(l.id)}`}>
                  {acoes ? (
                    <button type="button" onClick={() => acoes.ficha(x.inv)} className="block max-w-[262px] text-left">
                      <span className={`flex items-center gap-1.5 font-medium ${encerrado ? 'text-gray-400' : 'text-gray-800'}`}>
                        <span className="truncate hover:underline">{x.inv.nome}</span>{encerrado && <Etiqueta>encerrado</Etiqueta>}
                      </span>
                      <span className="block truncate text-[11.5px] text-gray-500">{sub}</span>
                    </button>
                  ) : (
                    <span className="block max-w-[220px]">
                      <span className="block truncate font-medium text-gray-800">{x.inv.nome}</span>
                      <span className="block truncate text-[11.5px] text-gray-500">{sub}</span>
                    </span>
                  )}
                </td>
                <td className={`border-b border-gray-100 px-3 py-2 ${movel ? 'hidden' : ''} ${aceso(l.id)}`}><Resgate x={x} /></td>
                <td className={`border-b border-gray-100 px-3 py-2 text-right tabular-nums text-gray-600 ${movel ? 'hidden' : ''} ${aceso(l.id)}`}>{reais(x.aplicado)}</td>
                <td className={`border-b border-gray-100 px-3 py-2 text-right font-semibold tabular-nums text-gray-900 ${aceso(l.id)}`}>{reais(x.vale)}</td>
                {rendeuCel(l.id, x)}
                <td className={`border-b border-gray-100 px-3 py-2 text-right tabular-nums text-gray-600 ${movel ? 'hidden' : ''} ${aceso(l.id)}`}>{pctTexto(x.pctAno, 1)}</td>
                {curvaCel(l.id, x, l.g.cor)}
                {!movel && (
                  <td className={`border-b border-gray-100 px-2 py-2 ${aceso(l.id)}`}>
                    {acoes && (
                      <span className="flex justify-end gap-0.5 opacity-0 transition-opacity group-hover/linha:opacity-100 focus-within:opacity-100">
                        {!encerrado && <button type="button" className={ACAO_TEXTO} onClick={() => acoes.movimento({ inv: x.inv, tipo: 'aporte' })} title={`Aplicar em ${x.inv.nome}`}><IcoSobe />Aplicar</button>}
                        {!encerrado && <button type="button" className={ACAO_TEXTO} onClick={() => acoes.movimento({ inv: x.inv, tipo: 'resgate' })} title={`Resgatar de ${x.inv.nome}`}><IcoDesce />Resgatar</button>}
                        <BotaoAcao titulo="A ficha: as aplicações e o histórico" onClick={() => acoes.ficha(x.inv)}><IconLapis className="h-[15px] w-[15px]" /></BotaoAcao>
                      </span>
                    )}
                  </td>
                )}
              </tr>
            );
          })}
          <tr data-segue="" className="font-semibold">
            <td className="h-10 border-t border-gray-200 bg-hx-f9fafb px-3 text-gray-800">Total</td>
            <td className={`border-t border-gray-200 bg-hx-f9fafb ${movel ? 'hidden' : ''}`} />
            <td className={`border-t border-gray-200 bg-hx-f9fafb px-3 text-right tabular-nums text-gray-700 ${movel ? 'hidden' : ''}`}>{reais(total.aplicado)}</td>
            <td className="border-t border-gray-200 bg-hx-f9fafb px-3 text-right tabular-nums text-gray-900">{reais(total.vale)}</td>
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
    </div>
  );
}

// ------------------------------------------------------------ B: o mês a mês
function TabelaMesAMes({ todas, visiveis, recolhidas, alternar, meses, comps, cdi, pct }) {
  const caixaRef = useRef(null);
  const desenhadas = useLinhasAnimadas(todas, visiveis, caixaRef);
  const balao = useBalao(270, 160);
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
  const sob = (linha, col) => ({ onMouseMove: balao.aoMover({ linha, col }) });
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
    <div ref={caixaRef} onMouseLeave={balao.aoSair}>
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
                      {temFilhos ? <IconChevron aberto={aberto} /> : <span className="w-3" />}
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
// `grupos`: o `carteira` (com `cor` por conta). `total`: { aplicado, vale, rendeu, pctAno }. `acoes`: { movimento,
// novoInvestimento, editarInvestimento, editarConta } (sem elas — o celular —, a tabela só mostra).
export default function BlocoInvestimentos({
  grupos, total, meses, comps, cdi, ano, movel, acoes, onExportar, encerrados, onEncerrados, qtdEncerrados, aviso,
}) {
  const [vista, setVistaEstado] = useState(() => (lsGet('patrimonio_vista') === 'mes' ? 'mes' : 'carteira'));
  const [modo, setModo] = useState('rs');
  const [recolhidas, setRecolhidasEstado] = useState(() => new Set(lerJson('patrimonio_recolhidas', [])));
  const [ordem, setOrdemEstado] = useState(() => lerJson('patrimonio_ordem', null));
  const [ampliado, setAmpliado] = useState(false);
  const [cheio, setCheio] = useState(false);
  const setVista = (v) => { setVistaEstado(v); lsSet('patrimonio_vista', v); };
  const setRecolhidas = (fn) => setRecolhidasEstado((s) => { const n = fn(s); lsSet('patrimonio_recolhidas', JSON.stringify([...n])); return n; });
  const onOrdenar = (col) => setOrdemEstado((o) => { const n = proximaOrdemCarteira(o, col); lsSet('patrimonio_ordem', JSON.stringify(n)); return n; });
  const alternar = (id) => setRecolhidas((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const comFilhos = grupos.filter((g) => g.itens.length);
  const tudoAberto = comFilhos.every((g) => !recolhidas.has(g.conta.id));
  const verVista = movel ? 'carteira' : vista;

  const ordenados = useMemo(() => ordenarCarteira(grupos, ordem), [grupos, ordem]);
  const todas = useMemo(() => ordenados.flatMap((g) => [
    { id: `g:${g.conta.id}`, tipo: 'grupo', g },
    ...g.itens.map((x) => ({ id: `i:${x.inv.id}`, tipo: 'inv', g, x })),
  ]), [ordenados]);
  const visiveis = useMemo(() => todas.filter((l) => l.tipo === 'grupo' || !recolhidas.has(l.g.conta.id)), [todas, recolhidas]);
  const qtd = grupos.reduce((s, g) => s + g.itens.length, 0);
  const comum = { todas, visiveis, recolhidas, alternar };
  const corpo = (ampl) => (verVista === 'mes'
    ? <TabelaMesAMes key={ampl ? 'b-a' : 'b'} {...comum} meses={meses} comps={comps} cdi={cdi} pct={modo === 'pct'} />
    : <TabelaCarteira key={ampl ? 'a-a' : 'a'} {...comum} ordem={ordem} onOrdenar={onOrdenar} total={total} ano={ano} movel={movel} acoes={acoes} cdi={cdi} />);

  const icones = (classe = BTN) => (
    <span className="inline-flex shrink-0 overflow-hidden rounded-md border border-gray-300 bg-white [&>*+*]:border-l [&>*+*]:border-gray-200">
      {comFilhos.length > 0 && (
        <Tooltip label={tudoAberto ? 'Recolher tudo' : 'Expandir tudo'}>
          <button type="button" aria-label={tudoAberto ? 'Recolher tudo' : 'Expandir tudo'} className={classe}
            onClick={() => setRecolhidas(() => (tudoAberto ? new Set(comFilhos.map((g) => g.conta.id)) : new Set()))}>
            <IconExpandirTudo fechar={tudoAberto} />
          </button>
        </Tooltip>
      )}
      {!ampliado && (
        <Tooltip label="Exportar CSV">
          <button type="button" aria-label="Exportar CSV" onClick={() => onExportar(verVista, modo)} className={classe}><IcoBaixar /></button>
        </Tooltip>
      )}
      {!ampliado && (
        <Tooltip label="Ampliar">
          <button type="button" aria-label="Ampliar" onClick={() => setAmpliado(true)} className={classe}><IcoAmpliar /></button>
        </Tooltip>
      )}
    </span>
  );
  const trocas = (
    <>
      <AbasPilula abas={[{ key: 'carteira', label: 'Carteira' }, { key: 'mes', label: 'Mês a mês' }]} valor={vista} onChange={setVista} variante="claro" altura={30} folga={2} />
      {vista === 'mes' && <AbasPilula abas={[{ key: 'rs', label: 'R$' }, { key: 'pct', label: '%' }]} valor={modo} onChange={setModo} variante="claro" altura={30} folga={2} />}
    </>
  );
  const legenda = verVista === 'mes'
    ? `o que rendeu em cada mês ${modo === 'pct' ? 'em %' : 'em reais'} · o tom mais forte é o melhor mês de cada linha`
    : `${qtd} ${qtd === 1 ? 'investimento' : 'investimentos'} em ${grupos.length} ${grupos.length === 1 ? 'lugar' : 'lugares'}`;
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
        {!movel && icones()}
      </div>
      {aviso}
      <div className="min-h-0 overflow-x-auto">{corpo(false)}</div>
      {rodape && <div className="border-t border-gray-100 px-4 py-2">{rodape}</div>}
      {ampliado && (
        <Modal open onClose={() => setAmpliado(false)} title="Investimentos" subtitulo={`${formatBRL(total.vale)} · ${legenda}`}
          acoes={(
            <>
              <button type="button" className="btn-secondary !h-[30px] !px-3 !text-[12.5px]" onClick={() => onExportar(verVista, modo)}>Exportar CSV</button>
              <Tooltip label={cheio ? 'Sair da tela cheia' : 'Tela cheia'}>
                <button type="button" onClick={() => setCheio((c) => !c)} aria-label={cheio ? 'Sair da tela cheia' : 'Tela cheia'}
                  className="inline-flex h-[30px] w-[30px] items-center justify-center rounded-md text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-800">
                  {cheio ? <IconMinimize className="h-3.5 w-3.5" /> : <IconMaximize className="h-3.5 w-3.5" />}
                </button>
              </Tooltip>
            </>
          )}
          alturaCheia animarTamanho padding="p-0" maxWidth={cheio ? 'max-w-[96vw]' : 'max-w-[min(1280px,95vw)]'} altura={cheio ? 'h-[94vh]' : 'h-[90vh]'}>
          <div className="flex h-full flex-col">
            <div className="flex shrink-0 flex-wrap items-center gap-2.5 px-5 pb-3 pt-4">
              {trocas}
              {comFilhos.length > 0 && icones(`${BTN} !h-[30px]`)}
              <span className="flex-1" />
              {rodape}
            </div>
            <div className="min-h-0 flex-1 overflow-auto border-t border-gray-100 [scrollbar-gutter:stable]">{corpo(true)}</div>
          </div>
        </Modal>
      )}
    </section>
  );
}
