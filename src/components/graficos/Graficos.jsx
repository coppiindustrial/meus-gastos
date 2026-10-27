import BalaoGrafico, { useBalao } from './BalaoGrafico.jsx';
import { escalaLinear } from '../../lib/escala.js';
import { EIXO, GRADE } from '../../lib/coresGrafico.js';
import { brlCurto, formatBRL } from '../../lib/dinheiro.js';
import { competenciaCurta, nomeCompetencia } from '../../lib/format.js';

// Gráficos do Resumo e da Evolução, no chrome do Gestor (GraficoSerie): tudo em <div> posicionada por
// %, eixo Y numa calha à DIREITA, grade tracejada recessiva, balão (BalaoGrafico) no hover.
// Marcas finas: barras com o topo arredondado (4px) apoiadas na linha de base, 2px entre barras.

export const COR_GASTOS = 'var(--serie-gastos)';
export const COR_ENTRADAS = 'var(--serie-entradas)';
const CALHA = 44; // largura da calha do eixo Y (rótulos "R$ 20 mil")

// Rótulo de mês um sim, um não no celular quando são muitos (12 rótulos "set/26" não cabem em 375px);
// o último sempre aparece. Escondido com `invisible`, para a coluna continuar ocupando o lugar.
const pulaNoCelular = (i, n) => (n > 6 && (n - 1 - i) % 2 === 1 ? 'max-sm:invisible' : '');

export function Legenda({ itens }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-600">
      {itens.map((it) => (
        <span key={it.rotulo} className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: it.cor }} />{it.rotulo}
        </span>
      ))}
    </div>
  );
}

// Grade + calha do eixo Y (em reais, a partir de centavos).
function Grade({ esc, children }) {
  const topo = (v) => `${100 - esc.fracao(v) * 100}%`;
  return (
    <div className="relative h-full" style={{ paddingRight: CALHA }}>
      <div className="absolute inset-y-0 left-0" style={{ right: CALHA }}>
        {esc.marcas.map((v) => (
          <div key={v} className={`absolute left-0 right-0 ${v === 0 ? 'border-t' : 'border-t border-dashed'}`}
            style={{ top: topo(v), borderColor: v === 0 ? EIXO : GRADE }} />
        ))}
        {children}
      </div>
      {esc.marcas.map((v) => (
        <div key={v} className="absolute right-0 -translate-y-1/2 text-[10px] leading-none text-gray-500 tabular-nums" style={{ top: topo(v) }}>
          {brlCurto(v * 100)}
        </div>
      ))}
    </div>
  );
}

// ENTRADAS × GASTOS POR MÊS: duas barras por mês. `selecionado` destaca um mês; clicar escolhe.
export function BarrasMensais({ meses, selecionado, onSelecionar, altura = 180 }) {
  const balao = useBalao(210, 96);
  const max = Math.max(1, ...meses.flatMap((m) => [m.entradas, m.gastos])) / 100;
  const esc = escalaLinear(max);
  const alto = (c) => `${esc.fracao(c / 100) * 100}%`;
  const ativo = meses.find((m) => m.competencia === balao.ativo);
  return (
    <div>
      <div style={{ height: altura }}>
        <Grade esc={esc}>
          <div className="absolute inset-0 flex" onMouseLeave={balao.aoSair}>
            {meses.map((m) => {
              const sel = m.competencia === selecionado;
              const apagado = (selecionado && !sel && !balao.ativo) || balao.esmaecido(m.competencia);
              return (
                // `min-w-0` + a largura das barras num miolo INTERNO: padding em % num item flex é
                // relativo à largura do GRÁFICO, não da coluna, e fazia as colunas transbordarem.
                <button key={m.competencia} type="button" onMouseMove={balao.aoMover(m.competencia)}
                  onClick={() => onSelecionar?.(m.competencia)} aria-label={`${nomeCompetencia(m.competencia)}: entradas ${formatBRL(m.entradas)}, gastos ${formatBRL(m.gastos)}`}
                  className={`relative flex h-full min-w-0 flex-1 justify-center transition-opacity ${apagado ? 'opacity-45' : ''} ${onSelecionar ? 'cursor-pointer' : 'cursor-default'}`}>
                  <span className="flex h-full w-[64%] items-end justify-center gap-[2px]">
                    <span className="w-1/2 max-w-[18px] rounded-t-[4px]" style={{ height: alto(m.entradas), background: COR_ENTRADAS }} />
                    <span className="w-1/2 max-w-[18px] rounded-t-[4px]" style={{ height: alto(m.gastos), background: COR_GASTOS }} />
                  </span>
                </button>
              );
            })}
          </div>
        </Grade>
      </div>
      <div className="mt-1 flex" style={{ paddingRight: CALHA }}>
        {meses.map((m, i) => (
          <div key={m.competencia} className={`flex min-w-0 flex-1 justify-center whitespace-nowrap text-[10.5px] ${m.competencia === selecionado ? 'font-semibold text-gray-800' : `text-gray-500 ${pulaNoCelular(i, meses.length)}`}`}>
            {competenciaCurta(m.competencia)}
          </div>
        ))}
      </div>
      {ativo && (
        <BalaoGrafico pos={balao.pos} largura={210} titulo={nomeCompetencia(ativo.competencia)} itens={[
          { rotulo: 'Entradas', valor: formatBRL(ativo.entradas), cor: COR_ENTRADAS },
          { rotulo: 'Gastos', valor: formatBRL(ativo.gastos), cor: COR_GASTOS },
          { rotulo: 'Saldo', valor: formatBRL(ativo.entradas - ativo.gastos) },
        ]} />
      )}
    </div>
  );
}

// UMA SÉRIE POR MÊS (parcelas comprometidas), com o valor escrito em cima de cada barra (são poucas).
export function ColunasMes({ meses, cor = COR_GASTOS, rotulo, altura = 150 }) {
  const balao = useBalao(200, 70);
  const max = Math.max(1, ...meses.map((m) => m.total)) / 100;
  const esc = escalaLinear(max);
  const ativo = meses.find((m) => m.competencia === balao.ativo);
  return (
    <div>
      <div style={{ height: altura }}>
        <Grade esc={esc}>
          <div className="absolute inset-0 flex" onMouseLeave={balao.aoSair}>
            {meses.map((m) => (
              <div key={m.competencia} onMouseMove={balao.aoMover(m.competencia)}
                className={`relative flex h-full min-w-0 flex-1 flex-col items-center justify-end transition-opacity ${balao.esmaecido(m.competencia) ? 'opacity-45' : ''}`}>
                {/* O valor só em tela larga: no celular as colunas são estreitas demais (fica no balão). */}
                <span className="mb-0.5 hidden whitespace-nowrap text-[10px] font-medium text-gray-700 tabular-nums sm:block">{brlCurto(m.total)}</span>
                <span className="w-[56%] max-w-[28px] rounded-t-[4px]" style={{ height: `${esc.fracao(m.total / 100) * 100}%`, background: cor }} />
              </div>
            ))}
          </div>
        </Grade>
      </div>
      <div className="mt-1 flex" style={{ paddingRight: CALHA }}>
        {meses.map((m, i) => <div key={m.competencia} className={`flex min-w-0 flex-1 justify-center whitespace-nowrap text-[10.5px] text-gray-500 ${pulaNoCelular(i, meses.length)}`}>{competenciaCurta(m.competencia)}</div>)}
      </div>
      {ativo && (
        <BalaoGrafico pos={balao.pos} titulo={nomeCompetencia(ativo.competencia)} itens={[{ rotulo, valor: formatBRL(ativo.total), cor }]}
          nota={`${ativo.qtd} parcela(s)`} />
      )}
    </div>
  );
}

// BARRAS HORIZONTAIS (gastos por grupo): nome, barra na cor do grupo, valor e % do total. A cor é a
// identidade do grupo (a mesma bolinha das outras telas); o nome está sempre escrito ao lado.
export function BarrasHorizontais({ itens, total, aberto, onAbrir }) {
  const max = Math.max(1, ...itens.map((i) => i.total));
  return (
    <ul className="space-y-1">
      {itens.map((it) => (
        <li key={it.id}>
          <button type="button" onClick={() => onAbrir?.(aberto === it.id ? null : it.id)}
            className="grid w-full grid-cols-[minmax(0,9rem)_1fr_auto] items-center gap-3 rounded-md px-2 py-1.5 text-left hover:bg-gray-50">
            <span className="truncate text-[13px] text-gray-700">{it.nome}</span>
            <span className="h-2.5 rounded-[4px] bg-gray-100">
              <span className="block h-full rounded-[4px]" style={{ width: `${(it.total / max) * 100}%`, background: it.cor }} />
            </span>
            <span className="whitespace-nowrap text-right text-[13px] tabular-nums text-gray-800">
              {formatBRL(it.total)} <span className="ml-1 inline-block w-9 text-[11.5px] text-gray-500">{total ? Math.round((it.total / total) * 100) : 0}%</span>
            </span>
          </button>
          {aberto === it.id && it.categorias && (
            <ul className="mb-1 ml-2 border-l border-gray-200 pl-3">
              {it.categorias.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-3 py-0.5 text-[12.5px] text-gray-600">
                  <span className="truncate">{c.nome} <span className="text-gray-400">· {c.qtd}</span></span>
                  <span className="tabular-nums">{formatBRL(c.total)}</span>
                </li>
              ))}
            </ul>
          )}
        </li>
      ))}
    </ul>
  );
}
