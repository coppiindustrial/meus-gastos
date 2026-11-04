import { useEffect, useState } from 'react';
import PainelMovel from './PainelMovel.jsx';

// OS FILTROS NO CELULAR (04/11/2026), COPIADOS da folha do Comercial do Gestor (`pages/movel/FiltrosMovel.jsx`): a
// folha de baixo (`PainelMovel`) no lugar da faixa de segmentos do computador — pílulas para o que é curto, uma linha
// que abre a sua lista (com busca quando passa de 8) para o que é longo. O que se escolhe é um RASCUNHO: só vale no
// "Ver resultados".
//
// Genérico, por CAMPOS (cada tela diz os seus):
//   { tipo: 'pilulas', campo, rotulo, opcoes, multi?, minimo? }  — pílulas que quebram linha (os anos)
//   { tipo: 'meses', campo, rotulo }                              — a grade de 12 meses (números 1–12) e os trimestres
//   { tipo: 'unico', campo, rotulo, opcoes }                      — pílulas na própria linha (Tipo: Todos/Gastos/Entradas)
//   { tipo: 'lista', campo, rotulo, opcoes, plural? }             — a linha que abre a lista de marcar (origem, categoria)
// `valor` é o objeto com os campos; `vazio`, o do "Limpar"; `mais`: o índice a partir do qual vem "MAIS FILTROS".
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const TRIMESTRES = [['1º tri', [1, 2, 3]], ['2º tri', [4, 5, 6]], ['3º tri', [7, 8, 9]], ['4º tri', [10, 11, 12]]];
const mesmos = (a, b) => a.length === b.length && a.every((x) => b.includes(x));

export default function FiltrosMovel({ aberto, onFechar, valor, vazio, onAplicar, campos, mais = 0, titulo = 'Filtros' }) {
  const [rascunho, setRascunho] = useState(valor);
  const [lista, setLista] = useState(null); // o campo da lista aberta
  useEffect(() => { if (aberto) { setRascunho(valor); setLista(null); } }, [aberto]); // eslint-disable-line react-hooks/exhaustive-deps

  const definir = (campo, v) => setRascunho((r) => ({ ...r, [campo]: v }));
  const alternar = (campo, v, minimo = 0) => setRascunho((r) => {
    const atual = r[campo];
    const novo = atual.includes(v) ? atual.filter((x) => x !== v) : [...atual, v];
    return novo.length < minimo ? r : { ...r, [campo]: novo };
  });
  const aplicar = () => { onAplicar(rascunho); onFechar(); };
  const aberta = lista && campos.find((c) => c.campo === lista);

  const resumo = (c) => {
    const vals = rascunho[c.campo];
    if (!vals.length) return 'todas';
    return vals.length === 1 ? (c.opcoes.find((o) => o.value === vals[0])?.label ?? '1') : `${vals.length} ${c.plural ?? 'marcadas'}`;
  };

  const desenhar = (c) => {
    if (c.tipo === 'pilulas') {
      return (
        <Grupo key={c.campo} rotulo={c.rotulo}>
          {c.opcoes.map((o) => {
            const on = c.multi ? rascunho[c.campo].includes(o.value) : rascunho[c.campo] === o.value;
            return <Pilula key={o.value} on={on} onClick={() => (c.multi ? alternar(c.campo, o.value, c.minimo) : definir(c.campo, o.value))}>{o.label}</Pilula>;
          })}
        </Grupo>
      );
    }
    if (c.tipo === 'meses') {
      const ms = rascunho[c.campo];
      return (
        <Grupo key={c.campo} rotulo={c.rotulo}>
          <Pilula on={!ms.length} onClick={() => definir(c.campo, [])}>Ano todo</Pilula>
          {TRIMESTRES.map(([r, l]) => <Pilula key={r} on={mesmos(ms, l)} onClick={() => definir(c.campo, mesmos(ms, l) ? [] : l)}>{r}</Pilula>)}
          <div className="mt-[2px] grid w-full grid-cols-4 gap-[6px]">
            {MESES.map((m, i) => {
              const on = ms.includes(i + 1);
              return (
                <button key={m} type="button" onClick={() => alternar(c.campo, i + 1)} aria-pressed={on}
                  className={`toque h-[42px] rounded-[10px] border text-[14px] ${on
                    ? 'inverte-no-escuro border-transparent bg-gray-800 font-semibold text-white'
                    : 'border-gray-300 text-gray-700 active:bg-gray-100'}`}>{m}</button>
              );
            })}
          </div>
        </Grupo>
      );
    }
    if (c.tipo === 'unico') {
      return (
        <div key={c.campo} className="flex min-h-[50px] items-center gap-2 border-b border-gray-100 px-[2px] text-[15px] text-gray-900">
          {c.rotulo}
          <div className="ml-auto flex gap-[6px]">
            {c.opcoes.map((o) => <Pilula key={o.value} on={rascunho[c.campo] === o.value} onClick={() => definir(c.campo, o.value)}>{o.label}</Pilula>)}
          </div>
        </div>
      );
    }
    return <LinhaFiltro key={c.campo} rotulo={c.rotulo} valor={resumo(c)} ativo={!!rascunho[c.campo].length} onClick={() => setLista(c.campo)} />;
  };

  return (
    <PainelMovel aberto={aberto} onFechar={onFechar} lado="baixo" rotulo={titulo}
      className="flex flex-col bg-white px-4 pt-2 shadow-xl">
      {aberta ? (
        <ListaFiltro titulo={aberta.rotulo} opcoes={aberta.opcoes} marcados={rascunho[aberta.campo]}
          onAlternar={(v) => alternar(aberta.campo, v)} onTodos={() => definir(aberta.campo, [])}
          onVoltar={() => setLista(null)} />
      ) : (
        <>
          <div className="mb-1 flex items-center">
            <span className="text-[17px] font-bold text-gray-900">{titulo}</span>
            <button type="button" onClick={() => setRascunho({ ...vazio })}
              className="toque ml-auto h-[40px] rounded-lg px-2 text-[14px] font-semibold text-gray-700">Limpar</button>
          </div>
          {campos.slice(0, mais || campos.length).map(desenhar)}
          {mais > 0 && mais < campos.length && (
            <>
              <div className="mb-1 mt-4 px-[2px] text-[11px] font-bold tracking-[.04em] text-gray-500">MAIS FILTROS</div>
              {campos.slice(mais).map(desenhar)}
            </>
          )}
          <button type="button" onClick={aplicar}
            className="toque mt-4 h-[48px] shrink-0 rounded-[10px] inverte-no-escuro bg-gray-800 text-[15px] font-semibold text-white active:bg-gray-900">
            Ver resultados
          </button>
        </>
      )}
    </PainelMovel>
  );
}

function Grupo({ rotulo, children }) {
  return (
    <>
      <div className="mb-[6px] mt-3 px-[2px] text-[11px] font-bold tracking-[.04em] text-gray-500">{rotulo.toUpperCase()}</div>
      <div className="flex flex-wrap gap-[6px]">{children}</div>
    </>
  );
}

export function Pilula({ on, onClick, children }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={on}
      className={`toque h-[34px] rounded-full border px-3 text-[13px] ${on
        ? 'inverte-no-escuro border-transparent bg-gray-800 font-semibold text-white'
        : 'border-gray-300 text-gray-700 active:bg-gray-100'}`}>
      {children}
    </button>
  );
}

function LinhaFiltro({ rotulo, valor, ativo, onClick }) {
  return (
    <button type="button" onClick={onClick}
      className="toque flex min-h-[50px] items-center border-b border-gray-100 px-[2px] text-left text-[15px] text-gray-900 active:bg-gray-50">
      {rotulo}
      <span className={`ml-auto flex min-w-0 items-center gap-[6px] pl-3 text-[13.5px] ${ativo ? 'font-semibold text-gray-900' : 'text-gray-500'}`}>
        <span className="truncate">{valor}</span>
        <svg viewBox="0 0 24 24" className="h-[14px] w-[14px] shrink-0 text-gray-400" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><polyline points="9 6 15 12 9 18" /></svg>
      </span>
    </button>
  );
}

// A lista de um filtro, dentro da mesma folha: ‹ volta para o resumo. Com mais de 8 opções ganha busca (em 16px: o
// iPhone dá zoom num campo de letra menor). `opcoes`: [{ value, label, sub?, cor? }].
function ListaFiltro({ titulo, opcoes, marcados, onAlternar, onTodos, onVoltar }) {
  const [busca, setBusca] = useState('');
  const semAcento = (s) => String(s ?? '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
  const termo = semAcento(busca.trim());
  const vistas = termo ? opcoes.filter((o) => semAcento(`${o.label} ${o.sub ?? ''}`).includes(termo)) : opcoes;
  return (
    <>
      <div className="mb-2 flex items-center gap-1">
        <button type="button" onClick={onVoltar} aria-label="Voltar"
          className="toque toque-icone -ml-2 flex h-[44px] w-[44px] items-center justify-center rounded-lg text-gray-700">
          <svg viewBox="0 0 24 24" className="h-[20px] w-[20px]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><polyline points="15 6 9 12 15 18" /></svg>
        </button>
        <span className="text-[17px] font-bold text-gray-900">{titulo}</span>
        <button type="button" onClick={onTodos} className="toque ml-auto h-[40px] rounded-lg px-2 text-[14px] font-semibold text-gray-700">Todas</button>
      </div>
      {opcoes.length > 8 && (
        <input type="search" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar"
          aria-label={`Buscar ${titulo.toLowerCase()}`}
          className="mb-2 h-[44px] rounded-lg border border-gray-300 bg-white px-3 text-[16px] text-gray-900" />
      )}
      <div className="flex max-h-[52dvh] flex-col overflow-y-auto overscroll-contain">
        {vistas.map((o) => {
          const on = marcados.includes(o.value);
          return (
            <button key={o.value} type="button" onClick={() => onAlternar(o.value)} aria-pressed={on}
              className="toque flex min-h-[48px] items-center gap-3 border-b border-gray-100 px-[2px] text-left text-[15px] text-gray-900 active:bg-gray-50">
              <span className={`flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-[6px] border ${on ? 'inverte-no-escuro border-transparent bg-gray-800 text-white' : 'border-gray-300'}`}>
                {on && <svg viewBox="0 0 24 24" className="h-[14px] w-[14px]" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12" /></svg>}
              </span>
              {o.cor && <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: o.cor }} />}
              <span className="min-w-0 flex-1 truncate">{o.label}{o.sub && <span className="text-[12.5px] text-gray-400"> · {o.sub}</span>}</span>
            </button>
          );
        })}
        {!vistas.length && <div className="py-6 text-center text-[13.5px] text-gray-500">Nada encontrado.</div>}
      </div>
    </>
  );
}
