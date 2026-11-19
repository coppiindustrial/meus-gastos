import { useMemo, useState } from 'react';
import Modal from '../Modal.jsx';
import Checkbox from '../Checkbox.jsx';
import { CampoMes } from '../CampoData.jsx';
import { Bolinha, Campo } from '../Comuns.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { useConfirmacao } from '../../context/ConfirmContext.jsx';
import { marcarGastoFixo, salvarParcelamento } from '../../api/cadastros.js';
import { formatBRL } from '../../lib/dinheiro.js';
import { addMeses, competenciaCurta, nomeCompetencia } from '../../lib/format.js';
import { cicloAtual, comoVem, parcelamentoDa, perfilDaCategoria, sugestaoDeParcelamento, ultimos12Meses } from '../../lib/categoriasFixas.js';

// O POP-UP DA CATEGORIA FIXA (19/11/2026, a opção B do mockup "Categoria fixa · pop-up", a pedido: "na tabela de cima clicar
// abre um pop-up, quero deixar semelhante"): o mesmo `Modal` e os mesmos campos do "Editar gasto fixo" — no lugar do balão
// laranja preso ao nome que havia (`ComoPagaCategoria`, de 19/11/2026, saiu). Pelo histórico (o padrão: o app acha sozinho)
// ou PARCELADO (migration 034): em quantas vezes, o mês da 1ª parcela e se renova todo ano. A FAIXA DOS ÚLTIMOS 12 MESES
// (`ultimos12Meses`, testada) mostra o que caiu e, no parcelado, acende as parcelas do rascunho: dá para ver se bate antes
// de salvar. Ao abrir sem parcelamento, a sugestão é a última sequência de meses seguidos com gasto. No pé, "Tirar dos
// gastos fixos" desmarca a categoria (com confirmação). `item`: a categoria da tabela ({ cat, serie }); `cor`: a do grupo;
// `grupo`: o nome dele. `onSalvo`: a tela recarrega.

// o número curto da faixa (em reais, sem centavos; "1,2k" acima de mil)
const curto = (c) => {
  const r = Math.round(c / 100);
  return r >= 1000 ? `${(r / 1000).toFixed(1).replace('.', ',')}k` : String(r);
};

const LEGENDA = {
  parcela: 'parcela que caiu',
  prevista: 'parcela que vem',
  faltou: 'parcela sem gasto',
  fora: 'fora das parcelas',
  gasto: 'caiu no mês',
  vazio: 'sem gasto',
};

function Caixinha({ estado, cor, children, className = '' }) {
  const base = `flex items-center justify-center rounded-[3px] tabular-nums ${className}`;
  if (estado === 'parcela') return <i className={`${base} not-italic text-gray-900`} style={{ background: `color-mix(in srgb, ${cor} 30%, transparent)` }}>{children}</i>;
  if (estado === 'prevista') return <i className={`${base} border border-dashed border-gray-400 italic text-gray-500`}>{children}</i>;
  if (estado === 'faltou') return <i className={`${base} grade-hachura border border-dashed border-gray-400 not-italic text-gray-400`}>{children}</i>;
  if (estado === 'vazio') return <i className={`${base} grade-hachura not-italic text-gray-400`}>{children}</i>;
  return <i className={`${base} bg-gray-200 not-italic text-gray-700`}>{children}</i>;
}

export default function ModalCategoriaFixa({ item, cor, grupo, hoje, onFechar, onSalvo }) {
  const toast = useToast();
  const confirmar = useConfirmacao();
  const { cat, serie } = item;
  const atual = parcelamentoDa(cat);
  const sug = useMemo(() => atual ?? sugestaoDeParcelamento(serie, hoje) ?? { n: 12, inicio: hoje }, [atual, serie, hoje]);
  const [modo, setModo] = useState(atual ? 'parcelado' : 'historico');
  const [vezes, setVezes] = useState(String(sug.n));
  const [inicio, setInicio] = useState(sug.inicio);
  const [renova, setRenova] = useState(atual ? atual.renova : true);
  const [salvando, setSalvando] = useState(false);

  const n = Number(vezes);
  const valido = Number.isInteger(n) && n >= 1 && n <= 60 && /^\d{4}-\d{2}$/.test(inicio);
  const podeRenovar = valido && n <= 12;
  const parcelado = modo === 'parcelado';
  const rascunho = parcelado && valido ? { n, inicio, renova: renova && podeRenovar } : null;

  const meses = useMemo(() => ultimos12Meses(serie, hoje, rascunho), [serie, hoje, rascunho?.n, rascunho?.inicio, rascunho?.renova]); // eslint-disable-line react-hooks/exhaustive-deps
  const estados = [...new Set(meses.map((m) => m.estado))];
  const historico = useMemo(() => perfilDaCategoria(serie, hoje), [serie, hoje]);

  // a conta do que fica: a parcela, o ciclo de agora, quanto já caiu nele e a renovação
  const conta = useMemo(() => {
    if (!rascunho) return null;
    const pf = perfilDaCategoria(serie, hoje, { fixo_parcelas: rascunho.n, fixo_inicio: `${rascunho.inicio}-01`, fixo_renova: rascunho.renova });
    const ciclo = cicloAtual(pf, hoje);
    let pagas = 0; let pago = 0;
    for (let c = ciclo.de; c <= ciclo.ate && c <= hoje; c = addMeses(c, 1)) {
      const v = serie.get(c) ?? 0;
      if (v > 0) { pagas += 1; pago += v; }
    }
    return { pf, ciclo, pagas, pago };
  }, [rascunho?.n, rascunho?.inicio, rascunho?.renova, serie, hoje]); // eslint-disable-line react-hooks/exhaustive-deps

  const salvar = async (e) => {
    e.preventDefault();
    if (parcelado && !valido) return;
    setSalvando(true);
    try {
      await salvarParcelamento(cat.id, parcelado ? { parcelas: n, inicio, renova: renova && podeRenovar } : null);
      toast.success(parcelado ? `${cat.nome}: parcelado em ${n}×.` : `${cat.nome}: pelo histórico.`);
      onSalvo();
    } catch (err) { toast.error(err.message); setSalvando(false); }
  };

  const tirar = async () => {
    const ok = await confirmar({
      titulo: `Tirar ${cat.nome} dos gastos fixos?`,
      texto: 'Ela sai da tabela das categorias fixas e do custo fixo. Os lançamentos não mudam; dá para marcar de novo em "Escolher categorias".',
      confirmar: 'Tirar',
    });
    if (!ok) return;
    setSalvando(true);
    try {
      await marcarGastoFixo([cat.id], false);
      toast.success(`${cat.nome} saiu dos gastos fixos.`);
      onSalvo();
    } catch (err) { toast.error(err.message); setSalvando(false); }
  };

  const seg = (on) => `h-8 px-3.5 text-[13px] transition-colors ${on ? 'bg-gray-100 font-medium text-gray-900' : 'text-gray-500 hover:bg-gray-50'}`;
  const linha = 'flex items-baseline justify-between gap-4';

  return (
    <Modal open onClose={onFechar} title="Editar categoria fixa" maxWidth="max-w-lg">
      <form onSubmit={salvar} className="space-y-4">
        <Campo rotulo="Categoria">
          <span className="flex h-[38px] items-center gap-2 rounded-md border border-dashed border-gray-300 px-3 text-gray-700">
            <Bolinha cor={cor} className="h-2 w-2" />
            <span className="truncate">{cat.nome}</span>
            {grupo && <span className="truncate text-gray-400">· {grupo}</span>}
          </span>
        </Campo>

        <Campo rotulo="O que caiu nos últimos 12 meses">
          <div className="grid grid-cols-12 gap-[3px]">
            {meses.map((m) => (
              <span key={m.comp} className="flex min-w-0 flex-col items-center gap-[3px] text-[10.5px] text-gray-400"
                title={`${nomeCompetencia(m.comp)}: ${m.valor ? formatBRL(m.valor) : 'sem gasto'}${m.parcela ? ` · parcela ${m.parcela}/${rascunho.n}` : ''}`}>
                <Caixinha estado={m.estado} cor={cor} className="h-[26px] w-full text-[10px]">{m.valor ? curto(m.valor) : ''}</Caixinha>
                {competenciaCurta(m.comp).slice(0, 3)}
              </span>
            ))}
          </div>
          <span className="mt-2 flex flex-wrap gap-x-3.5 gap-y-1 text-[11.5px] text-gray-500">
            {Object.keys(LEGENDA).filter((k) => estados.includes(k)).map((k) => (
              <span key={k} className="inline-flex items-center gap-1.5"><Caixinha estado={k} cor={cor} className="h-2.5 w-2.5" />{LEGENDA[k]}</span>
            ))}
          </span>
        </Campo>

        <Campo rotulo="Como é pago">
          <span className="inline-flex overflow-hidden rounded-md border border-gray-300">
            <button type="button" className={seg(!parcelado)} aria-pressed={!parcelado} onClick={() => setModo('historico')}>Pelo histórico</button>
            <button type="button" className={`${seg(parcelado)} border-l border-gray-300`} aria-pressed={parcelado} onClick={() => setModo('parcelado')}>Parcelado</button>
          </span>
        </Campo>

        {!parcelado ? (
          <p className="text-xs leading-[1.5] text-gray-500">
            {historico.tipo === 'mensal'
              ? `Vem todo mês: o previsto é a média dos últimos meses (${formatBRL(historico.valor)}).`
              : historico.tipo === 'sazonal'
                ? `Vem em alguns meses (${comoVem(historico)}): o previsto de cada mês é o que caiu no mesmo mês do ano anterior.`
                : 'Nada nos últimos 12 meses: sem previsto.'}
            {' '}Se é parcelado, escolha “Parcelado”: o previsto fica só nos meses das parcelas.
          </p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Campo rotulo="Vezes" erro={!valido ? 'De 1 a 60 vezes.' : undefined}>
                <input className="input tabular-nums" inputMode="numeric" value={vezes} aria-invalid={!valido}
                  onChange={(e) => setVezes(e.target.value.replace(/\D/g, '').slice(0, 2))} />
              </Campo>
              <Campo rotulo="1ª parcela">
                <CampoMes value={inicio} onChange={(c) => c && setInicio(c)} />
              </Campo>
            </div>
            <span className="flex items-center gap-2" title={podeRenovar ? undefined : 'Renovar só com até 12 parcelas (cada ciclo cabe num ano)'}>
              <Checkbox checked={renova && podeRenovar} onChange={(e) => podeRenovar && setRenova(e.target.checked)} title="Renova todo ano" />
              <button type="button" className={`text-sm ${podeRenovar ? 'text-gray-700' : 'cursor-default text-gray-400'}`} onClick={() => podeRenovar && setRenova(!renova)}>
                Renova todo ano, no mesmo mês
              </button>
            </span>
            {conta && (
              <div className="grid grid-cols-1 gap-1.5 border-t border-gray-200 pt-3 text-[13px] tabular-nums">
                <span className={linha}><span className="text-gray-500">Parcela</span>
                  <span className="text-right text-gray-700"><b className="font-semibold text-gray-900">{formatBRL(conta.pf.valor)}</b> · {conta.pagas} de {n} {conta.pagas === 1 ? 'paga' : 'pagas'} · {formatBRL(conta.pago)}</span></span>
                <span className={linha}><span className="text-gray-500">Parcelas</span>
                  <span className="text-right text-gray-700">{competenciaCurta(conta.ciclo.de)} a {competenciaCurta(conta.ciclo.ate)}</span></span>
                <span className={linha}><span className="text-gray-500">Depois</span>
                  <span className="text-right text-gray-700">{conta.pf.renova
                    ? `renova em ${competenciaCurta(addMeses(conta.ciclo.de, 12))} · ${n}× de ~${formatBRL(conta.pf.valor)}`
                    : `nada previsto depois de ${competenciaCurta(conta.ciclo.ate)}`}</span></span>
              </div>
            )}
          </>
        )}

        <div className="mt-5 flex items-center gap-2">
          <button type="button" className="text-[13px] text-gray-500 underline decoration-gray-300 underline-offset-[3px] hover:text-gray-800" onClick={tirar} disabled={salvando}>
            Tirar dos gastos fixos
          </button>
          <span className="flex-1" />
          <button type="button" className="btn-secondary" onClick={onFechar}>Cancelar</button>
          <button type="submit" className="btn-primary" disabled={salvando || (parcelado && !valido)}>{salvando ? 'Salvando…' : 'Salvar'}</button>
        </div>
      </form>
    </Modal>
  );
}
