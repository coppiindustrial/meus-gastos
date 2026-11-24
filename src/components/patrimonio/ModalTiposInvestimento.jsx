import { useState } from 'react';
import Modal from '../Modal.jsx';
import SelectSimples from '../SelectSimples.jsx';
import Tooltip from '../Tooltip.jsx';
import { CirculoMais } from '../icons.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { useConfirmacao } from '../../context/ConfirmContext.jsx';
import { atualizarTipo, criarTipo, excluirTipo } from '../../api/carteira.js';
import { TIPOS, ehIsento, nomeDoTipo, regraDosImpostos, semIOF } from '../../lib/carteira.js';

// OS TIPOS DE INVESTIMENTO (24/11/2026, o mockup "Tipos de investimento": a opção A, o cadastro dos tipos, com a escolha da
// C — o IR e o IOF numa LISTA, dois cliques, nunca um botão que muda num clique sem querer). Migration 036, `inv_tipos`.
//   · PRONTOS (CDB, RDB, LCI, LCA, Outro): só leitura, com o cadeado; os impostos são os da lei (`ehIsento`/`semIOF`).
//   · SEUS TIPOS: o nome (campo quieto), o IR (tabela regressiva ou isento) e o IOF (nos 30 primeiros dias ou não paga),
//     com a regra em palavras embaixo do nome; "Adicionar tipo"; a lixeira só no tipo sem investimento (a FK recusa).
// Nada muda até "Salvar alterações (N)"; mudar os impostos de um tipo EM USO pergunta antes (a conta dos investimentos dele
// é refeita). `cadastro`: para contar quantos investimentos usam cada tipo. Abre pelo "Novo tipo" do cabeçalho do cadastro
// dos investimentos (24/11/2026, a pedido: antes era a ação no pé da lista do campo Tipo).

const IR = [{ value: 'sim', label: 'Tabela regressiva', cor: '#f0a33a' }, { value: 'nao', label: 'Isento', cor: '#2fb36b' }];
const IOF = [{ value: 'sim', label: 'Nos 30 primeiros dias', cor: '#f0a33a' }, { value: 'nao', label: 'Não paga', cor: '#2fb36b' }];
const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
let seq = 0;
const daLinha = (t) => ({ id: t.id, novo: false, excluir: false, orig: t, nome: t.nome, paga_ir: !!t.paga_ir, paga_iof: !!t.paga_iof });
const mudou = (l) => !l.novo && !l.excluir && (l.nome.trim() !== l.orig.nome || l.paga_ir !== !!l.orig.paga_ir || l.paga_iof !== !!l.orig.paga_iof);
const conta = (l) => !(l.novo && (l.excluir || !l.nome.trim()));

export default function ModalTiposInvestimento({ tipos = [], cadastro = [], onFechar, onSalvo }) {
  const toast = useToast();
  const confirmar = useConfirmacao();
  // abre só com os tipos que existem: a linha nova é do "Adicionar tipo" (24/11/2026, a pedido — abrir já com uma em branco
  // não agradou)
  const [linhas, setLinhas] = useState(() => tipos.map(daLinha));
  const [erro, setErro] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const uso = (id) => cadastro.filter((i) => i.tipo_id === id);
  const usoPronto = (v) => cadastro.filter((i) => i.tipo === v && !i.tipo_id).length;
  const muda = (id, campo, v) => { setLinhas((ls) => ls.map((l) => (l.id === id ? { ...l, [campo]: v } : l))); setErro(null); };
  const alteradas = linhas.filter((l) => conta(l) && (l.novo || l.excluir || mudou(l)));
  const nAlt = alteradas.length;

  const adicionar = () => {
    seq += 1;
    const id = `novo-${Date.now().toString(36)}-${seq}`;
    setLinhas((ls) => [...ls, { id, novo: true, excluir: false, orig: null, nome: '', paga_ir: true, paga_iof: true }]);
    setTimeout(() => document.querySelector(`[data-tipo="${id}"]`)?.focus(), 40);
  };

  const fechar = async () => {
    if (nAlt && !(await confirmar({ titulo: 'Descartar as alterações?', texto: `${plural(nAlt, 'alteração ainda não foi salva', 'alterações ainda não foram salvas')}.`, confirmar: 'Descartar', perigo: true }))) return;
    onFechar();
  };

  const salvar = async () => {
    // o nome: preenchido e sem repetir (nem o de um pronto)
    const chave = (s) => s.trim().toLocaleLowerCase('pt-BR');
    const ficam = linhas.filter((l) => !l.excluir && conta(l));
    const prontos = TIPOS.map((t) => chave(nomeDoTipo(t.value)));
    for (const l of ficam) {
      if (!l.nome.trim()) { setErro(l.id); toast.error('Não salvou — falta o nome de um tipo.'); return; }
      if (prontos.includes(chave(l.nome)) || ficam.some((x) => x !== l && chave(x.nome) === chave(l.nome))) {
        setErro(l.id); toast.error(`Não salvou — o tipo "${l.nome.trim()}" já existe.`); return;
      }
    }
    // mudar os impostos de um tipo em uso refaz a conta dos investimentos dele: pergunta antes
    const emUso = alteradas.filter((l) => !l.novo && !l.excluir && uso(l.id).length && (l.paga_ir !== !!l.orig.paga_ir || l.paga_iof !== !!l.orig.paga_iof));
    if (emUso.length && !(await confirmar({
      titulo: 'Mudar os impostos?', confirmar: 'Salvar',
      texto: emUso.map((l) => `${l.nome.trim()}: ${uso(l.id).map((i) => i.nome).join(', ')}`).join('; ')
        + '. A conta do IR e do IOF desses investimentos é refeita com a escolha nova.',
    }))) return;
    setSalvando(true);
    try {
      for (const l of alteradas) {
        if (l.excluir) await excluirTipo(l.id);
        else if (l.novo) await criarTipo({ nome: l.nome.trim(), paga_ir: l.paga_ir, paga_iof: l.paga_iof });
        else await atualizarTipo(l.id, { nome: l.nome.trim(), paga_ir: l.paga_ir, paga_iof: l.paga_iof });
      }
      toast.success(nAlt === 1 ? 'Alteração salva.' : `${nAlt} alterações salvas.`);
      onSalvo();
    } catch (err) {
      toast.error(/foreign key|violates/i.test(err.message) ? 'Um tipo em uso não sai: troque o tipo dos investimentos dele antes.'
        : /duplicate|unique/i.test(err.message) ? 'Já existe um tipo com esse nome.'
          : /inv_tipos|schema cache|does not exist/i.test(err.message) ? 'Falta aplicar a migration 036 (os tipos de investimento).' : err.message);
    }
    setSalvando(false);
  };

  const th = 'h-8 border-b border-gray-200 bg-hx-f9fafb px-2 text-left text-[10.5px] font-semibold uppercase tracking-wide text-gray-500';
  const td = 'border-b border-gray-100 px-2 py-1.5 align-middle';
  const faixa = 'h-[34px] border-b border-gray-200 bg-hx-f3f4f6 px-3 text-[12px] font-semibold text-gray-800';
  const Selo = ({ paga, sim, nao }) => (
    <span className="inline-flex items-center gap-2 px-2 text-[12.5px] text-gray-700">
      <i className="h-2.5 w-2.5 rounded-full" style={{ background: paga ? '#f0a33a' : '#2fb36b' }} />{paga ? sim : nao}
    </span>
  );
  const Lixo = ({ marcado, bloqueado, titulo, onClick }) => (
    <Tooltip label={titulo}>
      <button type="button" disabled={bloqueado} aria-label={titulo} onClick={onClick}
        className={`inline-flex h-7 w-7 items-center justify-center rounded-[4px] transition-colors disabled:cursor-not-allowed disabled:opacity-30 ${marcado ? 'bg-hx-fdeaea text-hx-c0393d' : 'text-gray-400 enabled:hover:bg-hx-fdeaea enabled:hover:text-hx-c0393d'}`}>
        <svg viewBox="0 0 24 24" className="h-[14px] w-[14px]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          {marcado ? <><path d="M9 14L4 9l5-5" /><path d="M4 9h11a5 5 0 0 1 0 10h-3" /></> : <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />}
        </svg>
      </button>
    </Tooltip>
  );

  return (
    <Modal open onClose={fechar} title="Tipos de investimento" maxWidth="max-w-[920px]" padding="p-0"
      subtitulo="o tipo decide os impostos: o IR (de 22,5% a 15% pela idade, ou isento) e o IOF dos 30 primeiros dias">
      <div className="max-h-[66vh] overflow-auto [scrollbar-gutter:stable]">
        <table className="quieto w-full min-w-[820px] table-fixed border-separate border-spacing-0 text-[12.5px]">
          <colgroup><col /><col style={{ width: 210 }} /><col style={{ width: 210 }} /><col style={{ width: 80 }} /><col style={{ width: 48 }} /></colgroup>
          <thead className="sticky top-0 z-10"><tr>
            <th className={`${th} pl-[22px]`}>Tipo</th><th className={`${th} pl-[18px]`}>Imposto de renda</th><th className={`${th} pl-[18px]`}>IOF</th>
            <th className={`${th} text-right`}>Em uso</th><th className={th} />
          </tr></thead>
          <tbody>
            <tr><td colSpan={5} className={faixa}>
              <span className="inline-flex items-center gap-2">
                <svg viewBox="0 0 24 24" className="h-[12px] w-[12px] text-gray-500" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
                Prontos <span className="font-normal text-gray-500">· pela lei; não mudam</span>
              </span>
            </td></tr>
            {TIPOS.map((t) => {
              const ir = !ehIsento(t.value); const iof = !semIOF(t.value); const n = usoPronto(t.value);
              return (
                <tr key={t.value}>
                  <td className={`${td} pl-[22px]`}>
                    <span className="block font-semibold text-gray-900">{nomeDoTipo(t.value)}</span>
                    <span className="block text-[11.5px] text-gray-500">{regraDosImpostos(ir, iof)}</span>
                  </td>
                  <td className={td}><Selo paga={ir} sim="Tabela regressiva" nao="Isento" /></td>
                  <td className={td}><Selo paga={iof} sim="Nos 30 primeiros dias" nao="Não paga" /></td>
                  <td className={`${td} text-right tabular-nums text-gray-500`}>{n || '—'}</td>
                  <td className={td} />
                </tr>
              );
            })}
            <tr><td colSpan={5} className={`${faixa} border-t`}>Seus tipos <span className="font-normal text-gray-500">· para o que ainda não existe (CRA, CRI, Tesouro…)</span></td></tr>
            {linhas.map((l) => {
              const n = l.novo ? 0 : uso(l.id).length;
              const alterou = l.novo ? !!l.nome.trim() : mudou(l);
              return (
                <tr key={l.id} className={l.excluir ? 'opacity-50' : ''}>
                  <td className={`${td} pl-[14px]`} style={alterou ? { boxShadow: 'inset 3px 0 0 #f59e0b' } : undefined}>
                    <span className="flex items-center gap-2">
                      <input data-tipo={l.id} className={`input !h-8 !px-2 text-[13px] font-semibold ${l.excluir ? 'line-through' : ''} ${erro === l.id ? '!border-hx-e5484d' : ''}`}
                        disabled={l.excluir} value={l.nome} placeholder="Nome do tipo (ex.: CRA, Tesouro Selic)" aria-label="Nome do tipo" onChange={(e) => muda(l.id, 'nome', e.target.value)} />
                      {l.novo && l.nome.trim() && <span className="shrink-0 rounded-[4px] bg-hx-dcfce7 px-1.5 py-0.5 text-[11px] font-semibold text-hx-166534">novo</span>}
                    </span>
                    <span className="block pl-2 text-[11.5px] text-gray-500">{regraDosImpostos(l.paga_ir, l.paga_iof)}</span>
                  </td>
                  <td className={td}><SelectSimples value={l.paga_ir ? 'sim' : 'nao'} onChange={(v) => muda(l.id, 'paga_ir', v === 'sim')} opcoes={IR} disabled={l.excluir} compacto /></td>
                  <td className={td}><SelectSimples value={l.paga_iof ? 'sim' : 'nao'} onChange={(v) => muda(l.id, 'paga_iof', v === 'sim')} opcoes={IOF} disabled={l.excluir} compacto /></td>
                  <td className={`${td} text-right tabular-nums text-gray-500`}>{n || '—'}</td>
                  <td className={`${td} text-right`}>
                    <Lixo marcado={l.excluir} bloqueado={n > 0 && !l.excluir}
                      titulo={n ? `Em uso em ${plural(n, 'investimento', 'investimentos')}: troque o tipo deles antes` : l.excluir ? 'Não excluir' : 'Excluir (ao salvar)'}
                      onClick={() => (l.novo ? setLinhas((ls) => ls.filter((x) => x.id !== l.id)) : muda(l.id, 'excluir', !l.excluir))} />
                  </td>
                </tr>
              );
            })}
            <tr><td colSpan={5} className="px-2 py-1.5">
              <button type="button" onClick={adicionar}
                className="inline-flex items-center gap-2 rounded-[5px] px-2 py-1.5 text-[12.5px] font-medium text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900">
                <CirculoMais />Adicionar tipo
              </button>
            </td></tr>
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-gray-200 bg-hx-f9fafb px-4 py-3">
        <span className="text-[12px] text-gray-500">
          {nAlt ? <><b className="font-semibold text-hx-92400e">{plural(nAlt, 'alteração', 'alterações')}</b> · ainda não salvo</>
            : 'Nada muda até salvar; mudar os impostos de um tipo em uso pergunta antes'}
        </span>
        <span className="flex-1" />
        <button type="button" className="btn-secondary" onClick={fechar} disabled={salvando}>Cancelar</button>
        <button type="button" className="btn-primary" onClick={salvar} disabled={salvando || !nAlt}>
          {salvando ? 'Salvando…' : nAlt ? `Salvar alterações (${nAlt})` : 'Salvar alterações'}
        </button>
      </div>
    </Modal>
  );
}
