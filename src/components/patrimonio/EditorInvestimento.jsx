import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import SelectSimples from '../SelectSimples.jsx';
import CampoData from '../CampoData.jsx';
import Toggle from '../Toggle.jsx';
import useEscape from '../../lib/useEscape.js';
import {
  AO_VENCER, INDEXADORES, LIQUIDEZ, TIPOS_INVESTIMENTO, dadosDaLinha, diferencaInvestimento, impostoGarantia, linhaDoInvestimento,
  linhaNova, padraoDoTipo, validarCadastro,
} from '../../lib/investimentos.js';

// O POP-UP DA CÉLULA da carteira editável (06/11/2026, a opção A do mockup "Carteira editável"): o que não cabe num campo
// dentro da célula. Três jeitos, os campos do CADASTRO EM TABELA (o mesmo `linhaDoInvestimento` / `diferencaInvestimento`):
//   · 'rende' (a célula do nome): o nome, o tipo, como rende (o indexador e a taxa) e o emissor;
//   · 'resgate' (a célula do resgate): quando o dinheiro sai — a liquidez e o que ela pede (o vencimento, o D+N, a carência,
//     o prazo de cada aplicação e se reaplica);
//   · 'novoInv' (a linha "+ investimento"): tudo isso, para o investimento que nasce.
// Enter (num campo) grava, Esc desiste, clicar fora grava. Fica preso à célula (`ancora`) quando a tela rola.
const MESES_PRAZO = [6, 12, 18, 24, 36, 48, 60].map((m) => ({ value: String(m), label: m % 12 === 0 ? `${m / 12} ${m === 12 ? 'ano' : 'anos'}` : `${m} meses` }));
const LARGURA = 380;
const inp = 'input !h-8 text-[12.5px]';

function Linha({ rotulo, children }) {
  return (
    <div className="grid grid-cols-[84px_minmax(0,1fr)] items-center gap-2">
      <span className="text-[11.5px] font-medium text-gray-500">{rotulo}</span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export default function EditorInvestimento({ modo, inv, contaId, nomeInicial, ancora, onSalvar, onCancelar }) {
  const novo = modo === 'novoInv';
  const [l, setL] = useState(() => {
    const base = novo ? linhaNova('novo', contaId) : linhaDoInvestimento(inv);
    return nomeInicial !== undefined && nomeInicial !== null ? { ...base, nome: nomeInicial } : base;
  });
  const lRef = useRef(l);
  const [erro, setErro] = useState('');
  const [pos, setPos] = useState(null);
  const caixa = useRef(null);
  const nomeRef = useRef(null);
  const feito = useRef(false);

  // o campo muda a linha na hora (o Enter grava o que está no ref, sem esperar o render)
  const muda = (campo, v) => {
    const a = lRef.current;
    const n = { ...a, [campo]: v };
    // o investimento NOVO que troca de tipo leva o padrão do tipo novo, se o "rende" e o prazo ainda eram os do anterior
    if (campo === 'tipo' && novo) {
      const antes = padraoDoTipo(a.tipo);
      if (a.indexador === antes.indexador && a.taxa === antes.taxa && a.liquidez === antes.liquidez) Object.assign(n, padraoDoTipo(v));
    }
    lRef.current = n;
    setL(n);
    setErro('');
  };

  const salvar = () => {
    if (feito.current) return;
    const atual = lRef.current;
    if (novo && !atual.nome.trim()) { onCancelar(); feito.current = true; return; } // sem nome: não nasce
    const problema = validarCadastro([atual]);
    if (problema) { setErro(problema.motivo.charAt(0).toUpperCase() + problema.motivo.slice(1) + '.'); return; }
    feito.current = true;
    if (novo) onSalvar(dadosDaLinha(atual));
    else onSalvar(diferencaInvestimento(atual));
  };
  const cancelar = () => { if (feito.current) return; feito.current = true; onCancelar(); };
  const salvarRef = useRef(salvar);
  salvarRef.current = salvar;
  useEscape(true, cancelar);

  // a posição: embaixo da célula (em cima, se não couber), dentro da janela; segue a célula quando a tela rola
  useLayoutEffect(() => {
    const medir = () => {
      if (!ancora?.isConnected) return;
      const r = ancora.getBoundingClientRect();
      const h = caixa.current?.offsetHeight ?? 260;
      const left = Math.max(8, Math.min(r.left, window.innerWidth - LARGURA - 8));
      const top = r.bottom + 4 + h > window.innerHeight - 8 && r.top - h - 4 > 8 ? r.top - h - 4 : r.bottom + 4;
      setPos({ left, top });
    };
    medir();
    window.addEventListener('scroll', medir, true);
    window.addEventListener('resize', medir);
    return () => { window.removeEventListener('scroll', medir, true); window.removeEventListener('resize', medir); };
  }, [ancora, l.liquidez, modo]);

  // o foco no primeiro campo: o nome (com o cursor no fim, se veio da tecla digitada; senão, tudo selecionado)
  useEffect(() => {
    const t = setTimeout(() => {
      const el = nomeRef.current ?? caixa.current?.querySelector('button, input');
      el?.focus();
      if (el === nomeRef.current && el) { if (nomeInicial) el.setSelectionRange(el.value.length, el.value.length); else el.select(); }
    }, 0);
    return () => clearTimeout(t);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // clicar fora grava (as listas e o calendário dos campos vão ao body, com a `sombra-popover`: não são "fora"). O ouvinte
  // entra no TIQUE SEGUINTE: no duplo clique que abre o pop-up, o React 18 roda este efeito ainda dentro do mousedown, e o
  // mesmo clique chegava ao `document` como um clique fora — o pop-up abria e fechava na hora.
  useEffect(() => {
    const fora = (e) => {
      if (caixa.current?.contains(e.target) || e.target.closest?.('.sombra-popover')) return;
      salvarRef.current();
    };
    const t = setTimeout(() => document.addEventListener('mousedown', fora), 0);
    return () => { clearTimeout(t); document.removeEventListener('mousedown', fora); };
  }, []);

  const teclas = (e) => {
    if (e.key === 'Enter' && e.target.tagName === 'INPUT') { e.preventDefault(); e.stopPropagation(); salvar(); }
  };

  const comNome = modo === 'rende' || novo;
  const comResgate = modo === 'resgate' || novo;
  const imposto = impostoGarantia(l.tipo);
  const titulo = novo ? 'Investimento novo' : modo === 'resgate' ? `Quando o dinheiro de ${inv.nome} sai` : inv.nome;

  return createPortal(
    <div ref={caixa} role="dialog" aria-label={titulo} onKeyDown={teclas} onMouseDown={(e) => e.stopPropagation()}
      style={{ position: 'fixed', width: LARGURA, left: pos?.left ?? -9999, top: pos?.top ?? 0 }}
      className="sombra-popover z-[55] animate-pop-in rounded-md border border-elevado bg-elevado shadow-lg">
      <div className="border-b border-gray-100 px-3.5 py-2.5">
        <p className="truncate text-[12.5px] font-semibold text-gray-800">{titulo}</p>
        {novo && <p className="text-[11.5px] text-gray-500">o que ele é · o dinheiro entra depois, na linha "+ aporte"</p>}
      </div>
      <div className="space-y-2 px-3.5 py-3">
        {comNome && (
          <>
            <Linha rotulo="Nome">
              <input ref={nomeRef} className={inp} value={l.nome} placeholder="Ex.: CDB 2 anos, Caixinha" onChange={(e) => muda('nome', e.target.value)} />
            </Linha>
            <Linha rotulo="Tipo">
              <SelectSimples value={l.tipo} onChange={(v) => muda('tipo', v)} opcoes={TIPOS_INVESTIMENTO.map((t) => ({ value: t.value, label: t.label }))} compacto />
              {imposto && <span className="mt-0.5 block truncate px-0.5 text-[10.5px] text-gray-400">{imposto}</span>}
            </Linha>
            <Linha rotulo="Rende">
              <div className="flex gap-1.5">
                <SelectSimples value={l.indexador} onChange={(v) => muda('indexador', v)} opcoes={INDEXADORES} compacto className="min-w-0 flex-1" />
                {l.indexador && (
                  <input className={`${inp} !w-[72px] text-right tabular-nums`} inputMode="decimal" value={l.taxa} aria-label="Taxa"
                    placeholder={l.indexador === 'cdi_pct' ? '100' : '6,5'} onChange={(e) => muda('taxa', e.target.value)} />
                )}
              </div>
            </Linha>
            {!novo && (
              <Linha rotulo="Emissor">
                <input className={inp} value={l.emissor} placeholder="opcional (o banco que emite)" onChange={(e) => muda('emissor', e.target.value)} />
              </Linha>
            )}
          </>
        )}
        {comResgate && (
          <>
            {novo && <div className="!my-3 border-t border-gray-100" />}
            <Linha rotulo="Resgate">
              <SelectSimples value={l.liquidez} onChange={(v) => muda('liquidez', v)} opcoes={LIQUIDEZ} compacto />
            </Linha>
            {l.liquidez === 'por_aplicacao' && (
              <>
                <Linha rotulo="Cada aporte">
                  <div className="flex gap-1.5">
                    <SelectSimples value={l.prazo_meses} onChange={(v) => muda('prazo_meses', v)} opcoes={MESES_PRAZO} placeholder="prazo" compacto className="min-w-0 flex-1" />
                    <SelectSimples value={l.ao_vencer} onChange={(v) => muda('ao_vencer', v)} opcoes={AO_VENCER} compacto className="min-w-0 flex-1" />
                  </div>
                </Linha>
                <Linha rotulo="">
                  <label className="flex cursor-pointer items-center gap-2 text-[11.5px] text-gray-500" title="Como o RDB do Nubank: aplicado em 03/06 com 6 meses, vence em 02/12">
                    <Toggle compacto checked={!!l.vence_dia_anterior} onChange={(v) => muda('vence_dia_anterior', v)} rotulo="Vence um dia antes de completar o prazo" />
                    vence um dia antes
                  </label>
                </Linha>
              </>
            )}
            {l.liquidez === 'dias' && (
              <Linha rotulo="Cai em">
                <span className="flex items-center gap-1.5 text-[12px] text-gray-500">D+
                  <input className={`${inp} !w-16 text-right tabular-nums`} inputMode="numeric" value={l.liquidez_dias} placeholder="30"
                    onChange={(e) => muda('liquidez_dias', e.target.value.replace(/\D/g, '').slice(0, 4))} /> dias
                </span>
              </Linha>
            )}
            {l.liquidez === 'carencia' && (
              <Linha rotulo="Carência até"><CampoData value={l.carencia_ate} onChange={(v) => muda('carencia_ate', v)} compacto vazio="dd/mm/aaaa" /></Linha>
            )}
            {(l.liquidez === 'vencimento' || l.liquidez === 'diaria') && (
              <Linha rotulo="Vence em">
                <CampoData value={l.vencimento} onChange={(v) => muda('vencimento', v)} compacto vazio={l.liquidez === 'diaria' ? 'sem vencimento' : 'dd/mm/aaaa'} />
              </Linha>
            )}
          </>
        )}
        {erro && <p className="text-[12px] font-medium text-hx-dc2626">{erro}</p>}
      </div>
      <div className="flex items-center gap-2 border-t border-gray-100 bg-hx-fafbfc px-3.5 py-2">
        <span className="text-[11px] text-gray-400"><kbd className="font-sans">Enter</kbd> grava · <kbd className="font-sans">Esc</kbd> desiste</span>
        <span className="flex-1" />
        <button type="button" className="btn-secondary !py-1 text-[12.5px]" onClick={cancelar}>Cancelar</button>
        <button type="button" className="btn-primary !py-1 text-[12.5px]" onClick={salvar}>{novo ? 'Criar' : 'Salvar'}</button>
      </div>
    </div>,
    document.body,
  );
}
