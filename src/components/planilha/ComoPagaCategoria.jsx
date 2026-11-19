import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CampoMes } from '../CampoData.jsx';
import Toggle from '../Toggle.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { salvarParcelamento } from '../../api/cadastros.js';
import { formatBRL } from '../../lib/dinheiro.js';
import { addMeses, competenciaCurta } from '../../lib/format.js';
import { cicloAtual, parcelamentoDa, perfilDaCategoria, sugestaoDeParcelamento } from '../../lib/categoriasFixas.js';

// "COMO PAGA" (19/11/2026, a opção B do mockup "Parcelamento da categoria fixa"; migration 034): o balão que abre no nome da
// categoria na tabela "Categorias fixas". Pelo histórico (o padrão: o app acha sozinho) ou PARCELADO: em quantas vezes, o
// mês da 1ª parcela e se renova todo ano. Com o parcelado, o previsto fica só nos meses das parcelas e a média é a parcela.
// Ao abrir sem parcelamento, a sugestão é a última sequência de meses seguidos com gasto (`sugestaoDeParcelamento`).
// Portado ao body e preso à âncora; fecha no Esc, no clique fora ou rolando a tela. O calendário do `CampoMes` vai para o
// body também, mas na árvore do React é filho do balão — por isso o "dentro" é marcado no mousedown do próprio balão (o
// evento sintético sobe pelo portal), não pelo `contains` do DOM.
// `item`: a categoria da tabela ({ cat, serie }). `ancora`: o retângulo do nome. `onSalvo`: a tela recarrega.

const LARG = 360;

export default function ComoPagaCategoria({ item, ancora, hoje, onFechar, onSalvo }) {
  const toast = useToast();
  const { cat, serie } = item;
  const atual = parcelamentoDa(cat);
  const sug = useMemo(() => atual ?? sugestaoDeParcelamento(serie, hoje) ?? { n: 12, inicio: hoje }, [atual, serie, hoje]);
  const [modo, setModo] = useState(atual ? 'parcelado' : 'historico');
  const [vezes, setVezes] = useState(String(sug.n));
  const [inicio, setInicio] = useState(sug.inicio);
  const [renova, setRenova] = useState(atual ? atual.renova : true);
  const [salvando, setSalvando] = useState(false);
  const caixa = useRef(null);
  const dentro = useRef(false);
  const [pos, setPos] = useState(null);

  const n = Number(vezes);
  const valido = Number.isInteger(n) && n >= 1 && n <= 60 && /^\d{4}-\d{2}$/.test(inicio);
  const podeRenovar = valido && n <= 12;

  // a conta do que fica: a parcela, o ciclo de agora, quanto já caiu e a renovação
  const conta = useMemo(() => {
    if (modo !== 'parcelado' || !valido) return null;
    const pf = perfilDaCategoria(serie, hoje, { fixo_parcelas: n, fixo_inicio: `${inicio}-01`, fixo_renova: renova && n <= 12 });
    const ciclo = cicloAtual(pf, hoje);
    let pagas = 0; let pago = 0;
    for (let c = ciclo.de; c <= ciclo.ate && c <= hoje; c = addMeses(c, 1)) {
      const v = serie.get(c) ?? 0;
      if (v > 0) { pagas += 1; pago += v; }
    }
    return { pf, ciclo, pagas, pago };
  }, [modo, valido, serie, hoje, n, inicio, renova]);

  useLayoutEffect(() => {
    const alt = caixa.current?.offsetHeight ?? 320;
    const left = Math.max(8, Math.min(ancora.left, window.innerWidth - LARG - 8));
    const embaixo = ancora.bottom + 6;
    const top = embaixo + alt > window.innerHeight - 8 ? Math.max(8, ancora.top - alt - 6) : embaixo;
    setPos({ left, top });
  }, [ancora, modo, conta !== null]);

  useEffect(() => {
    const fora = () => { if (!dentro.current) onFechar(); dentro.current = false; };
    const tecla = (e) => { if (e.key === 'Escape') onFechar(); };
    const rolou = (e) => { if (!caixa.current?.contains(e.target) && !dentro.current) onFechar(); };
    document.addEventListener('mousedown', fora);
    document.addEventListener('keydown', tecla);
    window.addEventListener('scroll', rolou, true);
    window.addEventListener('resize', onFechar);
    return () => {
      document.removeEventListener('mousedown', fora);
      document.removeEventListener('keydown', tecla);
      window.removeEventListener('scroll', rolou, true);
      window.removeEventListener('resize', onFechar);
    };
  }, [onFechar]);

  const salvar = async () => {
    setSalvando(true);
    try {
      await salvarParcelamento(cat.id, modo === 'parcelado' ? { parcelas: n, inicio, renova: renova && n <= 12 } : null);
      toast.success(modo === 'parcelado' ? `${cat.nome}: parcelado em ${n}×` : `${cat.nome}: pelo histórico`);
      onSalvo();
    } catch (err) {
      toast.error(err.message);
      setSalvando(false);
    }
  };

  const seg = (on) => `h-[30px] px-3 text-[12.5px] transition-colors ${on ? 'bg-hx-fffbeb font-medium text-hx-92400e' : 'text-gray-500 hover:bg-gray-50'}`;
  const linha = 'flex items-baseline justify-between gap-3';

  return createPortal(
    <div ref={caixa} role="dialog" aria-label={`Como ${cat.nome} é pago`} onMouseDownCapture={() => { dentro.current = true; }}
      className="fixed z-[60] flex flex-col rounded-[10px] border border-gray-300 bg-white text-[12.5px] shadow-xl"
      style={{ width: LARG, left: pos?.left ?? -9999, top: pos?.top ?? -9999 }}>
      <div className="flex flex-col gap-0.5 px-4 pb-2.5 pt-3.5">
        <b className="text-[13px] font-semibold text-gray-900">Como {cat.nome} é pago</b>
        <span className="text-[11.5px] text-gray-500">o app olha o histórico; parcelado, ele sabe quando acaba</span>
      </div>
      <div className="flex flex-col gap-3 px-4 pb-3">
        <span className="inline-flex self-start overflow-hidden rounded-md border border-gray-300">
          <button type="button" className={seg(modo === 'historico')} aria-pressed={modo === 'historico'} onClick={() => setModo('historico')}>Pelo histórico</button>
          <button type="button" className={`${seg(modo === 'parcelado')} border-l border-gray-300`} aria-pressed={modo === 'parcelado'} onClick={() => setModo('parcelado')}>Parcelado</button>
        </span>

        {modo === 'historico' ? (
          <p className="m-0 text-[12px] leading-[1.5] text-gray-500">
            O previsto sai do que caiu nos últimos 12 meses: o que vem todo mês repete a média; o resto, o mesmo mês do ano anterior.
          </p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2.5">
              <label className="flex flex-col gap-1 text-[11.5px] text-gray-500">
                Vezes
                <input className="input !h-8 tabular-nums" inputMode="numeric" value={vezes} aria-invalid={!valido}
                  onChange={(e) => setVezes(e.target.value.replace(/\D/g, '').slice(0, 2))} />
              </label>
              <div className="flex flex-col gap-1 text-[11.5px] text-gray-500">
                1ª parcela
                <CampoMes compacto value={inicio} onChange={(c) => c && setInicio(c)} />
              </div>
            </div>
            <span className="flex items-center gap-2 text-gray-700" title={podeRenovar ? undefined : 'Renovar só com até 12 parcelas (cada ciclo cabe num ano)'}>
              <Toggle compacto checked={renova && podeRenovar} disabled={!podeRenovar} onChange={setRenova} rotulo="Renova todo ano" />
              Renova todo ano, no mesmo mês
            </span>
            {conta && (
              <div className="flex flex-col gap-1 rounded-lg border border-gray-200 bg-hx-f9fafb px-3 py-2.5 tabular-nums">
                <span className={linha}><span className="text-gray-500">Parcelas</span><span className="text-gray-800">{competenciaCurta(conta.ciclo.de)} a {competenciaCurta(conta.ciclo.ate)} · {conta.pagas} de {n} {conta.pagas === 1 ? 'paga' : 'pagas'}</span></span>
                <span className={linha}><span className="text-gray-500">Total pago</span><span className="text-gray-800">{formatBRL(conta.pago)}</span></span>
                <span className={linha}><span className="text-gray-500">Parcela (a média)</span><b className="font-semibold" style={{ color: 'var(--origem-fixo)' }}>{formatBRL(conta.pf.valor)}</b></span>
                <span className={linha}><span className="text-gray-500">Depois</span>
                  <span className="text-right text-gray-800">{conta.pf.renova
                    ? `renova em ${competenciaCurta(addMeses(conta.ciclo.de, 12))} · ${n}× de ~${formatBRL(conta.pf.valor)}`
                    : `nada previsto depois de ${competenciaCurta(conta.ciclo.ate)}`}</span>
                </span>
              </div>
            )}
            {!valido && <span className="text-[11.5px] text-hx-b91c1c">De 1 a 60 vezes.</span>}
          </>
        )}
      </div>
      <div className="flex justify-end gap-2 border-t border-gray-200 px-4 py-2.5">
        <button type="button" className="btn-secondary !h-8 !px-3" onClick={onFechar}>Cancelar</button>
        <button type="button" className="btn-primary !h-8 !px-3" onClick={salvar} disabled={salvando || (modo === 'parcelado' && !valido)}>Salvar</button>
      </div>
    </div>,
    document.body,
  );
}
