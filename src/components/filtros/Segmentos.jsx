import { useMemo, useState } from 'react';
import SegmentoFiltro, { GrupoMenu, OpcaoMenu } from './SegmentoFiltro.jsx';
import SearchInput from '../SearchInput.jsx';
import Tooltip from '../Tooltip.jsx';
import { addMeses, competenciaAtual, competenciaCurta, nomeCompetencia } from '../../lib/format.js';

// Os segmentos que uma tela monta dentro do `Trilho` (copiados do Gestor, `Segmentos.jsx`). Cada um é
// um invólucro fino: a regra do filtro (o que é multi, de onde saem as opções) fica na PÁGINA.

// Sem acento: "agua" acha "Água".
const semAcento = (s) => String(s || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

const CampoBusca = ({ placeholder, value, onChange }) => (
  <div className="mx-[2px] mb-1.5 mt-[2px]">
    <SearchInput size="sm" autoFocus placeholder={placeholder}
      className="[&_input]:h-[30px] [&_input]:py-0 [&_input]:text-[12.25px]"
      value={value} onChange={(e) => onChange(e.target.value)} />
  </div>
);

// A busca da barra: o `SearchInput` de sempre, com a altura (31px), o raio (6px) e a borda do trilho.
export function BuscaFaixa({ className = 'w-[220px]', ...props }) {
  return (
    <SearchInput className={`${className} [&_input]:h-[31px] [&_input]:rounded-[6px] [&_input]:border-gray-300 [&_input]:py-0`} {...props} />
  );
}

// ---------------------------------------------------------------- Escolha única
// `padrao`: o valor de "sem filtro". Fora dele o chip acende e ganha ✕ (que volta ao padrão).
// `mostraPadrao`: no padrão, o segmento DIZ o valor (ex.: o mês atual) mas continua quieto.
export function SegUnico({ id, rotulo, opcoes, value, onChange, padrao, largura = 190, mostraPadrao = false }) {
  const atual = opcoes.find((o) => o.value === value);
  const noPadrao = padrao !== undefined && value === padrao;
  const texto = atual?.chip ?? atual?.label ?? '';
  return (
    <SegmentoFiltro id={id} rotulo={rotulo} valor={noPadrao ? '' : texto}
      textoQuieto={noPadrao && mostraPadrao ? texto : undefined} largura={largura}
      onLimpar={padrao !== undefined && !noPadrao ? () => onChange(padrao) : undefined}>
      {({ fechar }) => (
        <div className="max-h-[300px] overflow-y-auto overflow-x-hidden scrollbar-thin">
          {opcoes.map((o) => (
            <OpcaoMenu key={o.value} selecionada={o.value === value} descricao={o.descricao}
              onClick={() => { onChange(o.value); fechar(); }}>
              {o.label}
            </OpcaoMenu>
          ))}
        </div>
      )}
    </SegmentoFiltro>
  );
}

// ---------------------------------------------------------------- Várias opções
// `opcoes`: [{ value, label, cor? }] ou, agrupadas, [{ titulo, cor?, itens: [...] }]. `value` é array.
// `busca` (placeholder) liga o campo de busca; a ação em massa marca o que está À VISTA (buscar
// "casa" e marcar pega só as encontradas), e vira "Limpar seleção" quando tudo à vista já está marcado.
// `plural`: o nome no chip com várias marcadas ("3 categorias").
export function SegMulti({ id, rotulo, plural = `${rotulo.toLowerCase()}s`, opcoes, value, onChange, largura = 240, busca = '' }) {
  const [q, setQ] = useState('');
  const agrupado = opcoes.length > 0 && !!opcoes[0].itens;
  const todas = useMemo(() => (agrupado ? opcoes.flatMap((g) => g.itens) : opcoes), [opcoes, agrupado]);
  const buscando = !!q.trim();
  const filtradas = useMemo(() => {
    const t = semAcento(q).trim();
    if (!t) return todas;
    return todas.filter((o) => semAcento(`${o.label} ${o.grupo ?? ''}`).includes(t));
  }, [todas, q]);

  const marcadas = todas.filter((o) => value.includes(o.value));
  const valor = marcadas.length === 1 ? marcadas[0].label : (marcadas.length ? `${marcadas.length} ${plural}` : '');
  const alternar = (v) => onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);
  const visiveis = filtradas.map((o) => o.value);
  const todasMarcadas = visiveis.length > 0 && visiveis.every((v) => value.includes(v));
  const acaoMassa = () => (todasMarcadas
    ? onChange(value.filter((v) => !visiveis.includes(v)))
    : onChange([...new Set([...value, ...visiveis])]));

  const linha = (o) => (
    <OpcaoMenu key={o.value} multi selecionada={value.includes(o.value)} onClick={() => alternar(o.value)}>
      <span className="flex items-center gap-2">
        {o.cor && <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: o.cor }} />}
        <span className="min-w-0 break-words">{o.label}</span>
      </span>
    </OpcaoMenu>
  );

  return (
    <SegmentoFiltro id={id} rotulo={rotulo} valor={valor} largura={largura} alturaMenu={busca ? 400 : 320}
      onLimpar={() => onChange([])}>
      {busca && <CampoBusca placeholder={busca} value={q} onChange={setQ} />}
      {busca && filtradas.length > 0 && (
        <button type="button" onClick={acaoMassa}
          className="mx-[2px] mb-1 flex w-[calc(100%-4px)] items-center justify-between gap-2 rounded-[2px] bg-hx-f4f5f7 px-[7px] py-[5px] text-[11.5px] font-medium text-gray-600 transition-colors hover:bg-gray-200 active:bg-gray-300">
          <span>{todasMarcadas ? 'Limpar seleção' : (buscando ? `Marcar as ${visiveis.length} encontradas` : 'Marcar todas')}</span>
          <span className="tabular-nums text-gray-400">{visiveis.length}</span>
        </button>
      )}
      <div className="max-h-[320px] overflow-y-auto overflow-x-hidden scrollbar-thin">
        {filtradas.length === 0 ? (
          <p className="px-[9px] py-2 text-[12px] text-gray-400">Nada com esse nome.</p>
        ) : (agrupado && !buscando)
          ? opcoes.map((g, i) => (
            <GrupoMenu key={g.titulo} titulo={g.titulo} cor={g.cor} primeiro={i === 0}>{g.itens.map(linha)}</GrupoMenu>
          ))
          : filtradas.map(linha)}
      </div>
    </SegmentoFiltro>
  );
}

// ---------------------------------------------------------------- Mês (competência)
// O mês da tela dentro do trilho: ‹ e › andam um mês, e o menu lista os meses do ano (por ano). No mês
// ATUAL o segmento fica quieto mas diz o mês; em outro, acende com o ✕ que volta ao atual.
const BTN_SETA = 'inline-flex h-[25px] w-[22px] shrink-0 items-center justify-center rounded-[3px] text-gray-500 transition-colors hover:bg-gray-200 hover:text-gray-800 active:bg-gray-300';
const Seta = ({ volta }) => (
  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={volta ? 'M15 6l-6 6 6 6' : 'M9 6l6 6-6 6'} />
  </svg>
);
const MESES_CURTOS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

// O miolo do menu é um componente próprio para o ANO nascer do mês escolhido a cada abertura (o corpo do
// segmento só monta com o menu aberto).
function MenuMeses({ value, onChange, fechar, hoje }) {
  const [ano, setAno] = useState(() => Number(value.slice(0, 4)));
  return (
    <div className="p-1">
      <div className="mb-1.5 flex items-center justify-between">
        <button type="button" className={BTN_SETA} onClick={() => setAno((a) => a - 1)} aria-label="Ano anterior"><Seta volta /></button>
        <span className="text-[12.5px] font-semibold text-gray-800">{ano}</span>
        <button type="button" className={BTN_SETA} onClick={() => setAno((a) => a + 1)} aria-label="Próximo ano"><Seta /></button>
      </div>
      <div className="grid grid-cols-4 gap-1">
        {MESES_CURTOS.map((m, i) => {
          const c = `${ano}-${String(i + 1).padStart(2, '0')}`;
          const sel = c === value;
          return (
            <button key={c} type="button" onClick={() => { onChange(c); fechar(); }}
              className={`rounded-[3px] py-[7px] text-[12px] transition-colors ${sel ? 'bg-gray-800 font-semibold text-white'
                : c === hoje ? 'font-semibold text-gray-900 ring-1 ring-inset ring-gray-300 hover:bg-gray-100' : 'text-gray-700 hover:bg-gray-100'}`}>
              {m}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function SegMes({ value, onChange, id = 'mes' }) {
  const hoje = competenciaAtual();
  const noPadrao = value === hoje;
  const texto = nomeCompetencia(value).replace(' de ', '/').replace(/\/(\d{2})(\d{2})$/, '/$2');
  return (
    <span className="inline-flex items-center">
      <Tooltip label={`Mês anterior (${competenciaCurta(addMeses(value, -1))})`}>
        <button type="button" className={BTN_SETA} onClick={() => onChange(addMeses(value, -1))} aria-label="Mês anterior"><Seta volta /></button>
      </Tooltip>
      <SegmentoFiltro id={id} rotulo="Mês" valor={noPadrao ? '' : texto} textoQuieto={noPadrao ? texto : undefined}
        largura={232} alturaMenu={200} onLimpar={noPadrao ? undefined : () => onChange(hoje)}>
        {({ fechar }) => <MenuMeses value={value} onChange={onChange} fechar={fechar} hoje={hoje} />}
      </SegmentoFiltro>
      <Tooltip label={`Próximo mês (${competenciaCurta(addMeses(value, 1))})`}>
        <button type="button" className={BTN_SETA} onClick={() => onChange(addMeses(value, 1))} aria-label="Próximo mês"><Seta /></button>
      </Tooltip>
    </span>
  );
}
