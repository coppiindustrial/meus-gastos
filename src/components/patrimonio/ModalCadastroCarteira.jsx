import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import Modal from '../Modal.jsx';
import SelectSimples from '../SelectSimples.jsx';
import Toggle from '../Toggle.jsx';
import Tooltip from '../Tooltip.jsx';
import { CirculoMais } from '../icons.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { useConfirmacao } from '../../context/ConfirmContext.jsx';
import { atualizarInvestimento, criarInvestimento, excluirInvestimento, marcarNaoReaplicar } from '../../api/carteira.js';
import {
  TIPOS, dadosDoCadastro, diferencaDoCadastro, linhaDoCadastro, linhaNovaDoCadastro, linhaVaziaDoCadastro, validarCadastro,
  vencidosAntesDeReaplicar,
} from '../../lib/carteira.js';

// O CADASTRO DOS INVESTIMENTOS (07/11/2026, a carteira do zero): a TABELA DE FORMULÁRIO dos fixos e dos cartões — todos de
// uma vez, agrupados pela INSTITUIÇÃO (o cabeçalho do grupo é um campo: mudar o nome muda o de todos dele), cada célula um
// campo. O que o investimento É: o nome, o tipo, a taxa em % do CDI, o resgate (a qualquer hora ou só no vencimento) e o
// prazo que SUGERE o vencimento do aporte. Nada de dinheiro: ele entra pelos aportes. "Salvar alterações (N)" grava a
// diferença (`diferencaDoCadastro`, `validarCadastro` — lib/carteira.js). O investimento com aportes não se exclui
// (desative). Enter desce na mesma coluna. `aportesPorInv`: quantos aportes cada um tem.
// NO VENCIMENTO (08/11/2026, migration 022): o dinheiro VOLTA PARA A CONTA (o aporte encerra) ou o banco REAPLICA SOZINHO
// (no dia, o app grava o aporte novo — `reaplicacoesDevidas`, em useCarteira). "Reaplica" pede o prazo: é o do aporte
// novo. Passar a reaplicar vale para os PRÓXIMOS vencimentos: o que já tinha vencido antes de hoje fica como voltou para a
// conta (`vencidosAntesDeReaplicar` → `nao_reaplicar`; o "Reaplicar" da linha do encerrado continua lá). `com022`: sem a
// migration, a coluna fica apagada.
// O FIM DE SEMANA (08/11/2026, migration 023): ao lado do "um dia antes", "fim de semana → seg." — a XP passa o vencimento
// do sábado ou do domingo para a segunda; o Nubank vence no dia. Só muda a sugestão do vencimento. `com023`: sem a
// migration, o interruptor fica apagado.

// O id da linha nova leva a hora: o contador volta a 0 quando o Vite recarrega o arquivo, e o pop-up aberto guardava as
// linhas de antes — duas com o mesmo id, e digitar numa mudava as duas.
let seq = 0;
const novoId = (p) => { seq += 1; return `${p}-${Date.now().toString(36)}-${seq}`; };
const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
const PRAZOS = [{ value: '', label: 'sem sugestão' }, ...[3, 6, 12, 18, 24, 36, 48, 60].map((m) => ({ value: String(m), label: m % 12 === 0 ? `${m / 12} ${m === 12 ? 'ano' : 'anos'}` : `${m} meses` }))];
const RESGATES = [{ value: 'diaria', label: 'a qualquer hora' }, { value: 'vencimento', label: 'só no vencimento' }];
const NO_VENCIMENTO = [{ value: 'conta', label: 'volta para a conta' }, { value: 'reaplica', label: 'reaplica sozinho' }];

export default function ModalCadastroCarteira({ cadastro, aportes = [], aportesPorInv = {}, hoje, com022 = true, com023 = true, onFechar, onSalvo }) {
  const toast = useToast();
  const confirmar = useConfirmacao();
  // os grupos: cada instituição, com o nome editável (`orig` = o de antes)
  // cada linha que já existia aponta para o grupo do nome dela
  const [inicio] = useState(() => {
    const gs = [...new Set(cadastro.map((i) => i.instituicao.trim()))].sort((a, b) => a.localeCompare(b, 'pt-BR'))
      .map((nome) => ({ id: novoId('g'), nome, orig: nome }));
    return { gs, ls: cadastro.map((i) => ({ ...linhaDoCadastro(i), grupo: gs.find((g) => g.orig === i.instituicao.trim())?.id ?? null })) };
  });
  const [grupos, setGrupos] = useState(inicio.gs);
  const [linhas, setLinhas] = useState(inicio.ls);
  const [erro, setErro] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const caixaRef = useRef(null);
  const nomeDoGrupo = (id) => grupos.find((g) => g.id === id)?.nome ?? '';
  const comInstituicao = (l) => ({ ...l, instituicao: nomeDoGrupo(l.grupo) || l.instituicao });

  const focar = (sel) => setTimeout(() => caixaRef.current?.querySelector(sel)?.focus(), 40);
  const adicionar = (grupoId) => {
    const id = novoId('novo');
    setLinhas((ls) => [...ls, { ...linhaNovaDoCadastro(id, nomeDoGrupo(grupoId)), grupo: grupoId }]);
    focar(`[data-cad-linha="${id}"][data-cad-col="nome"]`);
  };
  const novaInstituicao = () => {
    const g = { id: novoId('g'), nome: '', orig: '' };
    setGrupos((gs) => [...gs, g]);
    const id = novoId('novo');
    setLinhas((ls) => [...ls, { ...linhaNovaDoCadastro(id, ''), grupo: g.id }]);
    focar(`[data-cad-grupo="${g.id}"]`);
  };
  const abriu = useRef(false);
  useEffect(() => {
    if (abriu.current) return;
    abriu.current = true;
    if (!cadastro.length) novaInstituicao(); // a carteira vazia já abre pronta para digitar
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const muda = (id, campo, v) => { setLinhas((ls) => ls.map((l) => (l.id === id ? { ...l, [campo]: v } : l))); setErro(null); };
  const mudaGrupo = (id, nome) => { setGrupos((gs) => gs.map((g) => (g.id === id ? { ...g, nome } : g))); setErro(null); };

  const conta = (l) => !(l.novo && (l.excluir || linhaVaziaDoCadastro(l)));
  const mudadas = linhas.map(comInstituicao).filter((l) => conta(l) && (l.novo || l.excluir || Object.keys(diferencaDoCadastro(l)).length));
  const nAlt = mudadas.length;

  const fechar = async () => {
    if (nAlt && !(await confirmar({ titulo: 'Descartar as alterações?', texto: `${plural(nAlt, 'alteração ainda não foi salva', 'alterações ainda não foram salvas')}.`, confirmar: 'Descartar', perigo: true }))) return;
    onFechar();
  };

  const salvar = async () => {
    const todas = linhas.map(comInstituicao);
    const semNome = grupos.find((g) => !g.nome.trim() && todas.some((l) => l.grupo === g.id && conta(l) && !l.excluir));
    if (semNome) { setErro({ id: semNome.id, campo: 'grupo' }); toast.error('Não salvou — falta o nome de uma instituição.'); return; }
    const problema = validarCadastro(todas);
    if (problema) { setErro(problema); toast.error(`Não salvou — ${problema.motivo}.`); return; }
    const sai = mudadas.filter((l) => l.excluir && !l.novo);
    if (sai.length && !(await confirmar({
      titulo: 'Salvar estas alterações?', perigo: true, confirmar: 'Salvar',
      texto: `Exclui ${sai.map((l) => `"${l.orig.nome}"`).join(', ')}. Não se desfaz.`,
    }))) return;
    setSalvando(true);
    // os que passam a reaplicar: o que já venceu antes de hoje fica como voltou para a conta (marcado ANTES de mudar o
    // cadastro, senão a tela que recarrega no meio o reaplicaria)
    const passamAReaplicar = mudadas.filter((l) => !l.novo && !l.excluir && diferencaDoCadastro(l).no_vencimento === 'reaplica');
    try {
      for (const l of sai) await excluirInvestimento(l.id);
      for (const l of passamAReaplicar) await marcarNaoReaplicar(vencidosAntesDeReaplicar(aportes, l.id, hoje));
      let ordem = Math.max(0, ...cadastro.map((i) => i.ordem ?? 0));
      for (const l of mudadas.filter((x) => !x.excluir)) {
        if (l.novo) { ordem += 1; await criarInvestimento({ ...dadosDoCadastro(l), ordem }); } else await atualizarInvestimento(l.id, diferencaDoCadastro(l));
      }
      const reaplica = passamAReaplicar.length ? ` Os próximos vencimentos de ${passamAReaplicar.map((l) => `"${l.nome.trim()}"`).join(', ')} o app reaplica sozinho.` : '';
      toast.success(`${nAlt === 1 ? 'Alteração salva.' : `${nAlt} alterações salvas.`}${reaplica}`);
    } catch (err) {
      toast.error(/vence_dia_util/i.test(err.message) ? 'Falta aplicar a migration 023 (o vencimento no fim de semana).'
        : /no_vencimento|nao_reaplicar/i.test(err.message) ? 'Falta aplicar a migration 022 (o que acontece no vencimento).'
        : /inv_cadastro|schema cache|does not exist/i.test(err.message) ? 'Falta aplicar a migration 020 (a carteira do zero).' : err.message);
    }
    setSalvando(false);
    onSalvo(); // parte pode ter gravado: a tela recarrega com o que ficou no banco
  };

  const aoTeclar = (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const col = e.currentTarget.dataset.cadCol;
    const todos = [...caixaRef.current.querySelectorAll(`[data-cad-col="${col}"]`)];
    todos[todos.indexOf(e.currentTarget) + 1]?.focus();
  };
  const ver = (id, campo) => (erro?.id === id && erro.campo === campo ? '!border-hx-e5484d' : '');
  const th = 'h-8 border-b border-gray-200 bg-hx-f9fafb px-2 text-left text-[10.5px] font-semibold uppercase tracking-wide text-gray-500';
  const td = 'border-b border-gray-100 px-1.5 py-1.5 align-top';
  const inp = 'input !h-8 text-[12.5px]';
  const porGrupo = useMemo(() => grupos.map((g) => ({ g, ls: linhas.filter((l) => l.grupo === g.id) })), [grupos, linhas]);
  const ativos = linhas.filter((l) => !l.excluir && l.ativo && !linhaVaziaDoCadastro(l)).length;

  return (
    <Modal open onClose={fechar} title="Cadastro dos investimentos" maxWidth="max-w-[1440px]" padding="p-0"
      subtitulo={`${plural(ativos, 'ativo', 'ativos')} · o que cada um é; o dinheiro entra pelos aportes`}>
      <div ref={caixaRef} className="max-h-[66vh] overflow-auto [scrollbar-gutter:stable]">
        <table className="w-full min-w-[1300px] table-fixed border-separate border-spacing-0 text-[12.5px]">
          <colgroup>
            <col /><col style={{ width: 124 }} /><col style={{ width: 124 }} /><col style={{ width: 160 }} />
            <col style={{ width: 392 }} /><col style={{ width: 176 }} /><col style={{ width: 64 }} /><col style={{ width: 70 }} />
          </colgroup>
          <thead className="sticky top-0 z-10"><tr>
            <th className={th}>Nome</th><th className={th}>Tipo</th><th className={th}>Rende (% do CDI)</th><th className={th}>Resgate</th>
            <th className={th}>Vence em</th>
            <th className={th}><Tooltip label={'Volta para a conta: o aporte encerra no dia. Reaplica sozinho: no dia, o app lança o aporte novo com o valor menos o IR (o IR recomeça) e o prazo de "Vence em".'}><span className="cursor-help">No vencimento</span></Tooltip></th>
            <th className={`${th} text-right`}>Aportes</th><th className={th} />
          </tr></thead>
          <tbody>
            {porGrupo.map(({ g, ls }) => (
              <Fragment key={g.id}>
                <tr>
                  <td colSpan={8} className="border-b border-gray-200 bg-hx-f9fafb px-2 py-1.5">
                    <span className="flex items-center gap-2">
                      <input data-cad-grupo={g.id} className={`input !h-7 !w-[260px] !bg-transparent text-[12.5px] font-semibold ${ver(g.id, 'grupo')}`}
                        value={g.nome} placeholder="Instituição (ex.: Nubank, XP)" onChange={(e) => mudaGrupo(g.id, e.target.value)} aria-label="Nome da instituição" />
                      {!g.orig && <span className="shrink-0 rounded-[4px] bg-hx-dcfce7 px-1.5 py-0.5 text-[11px] font-semibold text-hx-166534">nova instituição</span>}
                      <span className="text-[11.5px] font-normal text-gray-400">{plural(ls.filter((l) => !linhaVaziaDoCadastro(l)).length, 'investimento', 'investimentos')}</span>
                    </span>
                  </td>
                </tr>
                {ls.map((l) => {
                  const mudou = l.novo ? !linhaVaziaDoCadastro(l) : !l.excluir && Object.keys(diferencaDoCadastro(comInstituicao(l))).length > 0;
                  const n = aportesPorInv[l.id] ?? 0;
                  return (
                    <tr key={l.id} className={l.excluir ? 'opacity-50' : !l.ativo ? 'opacity-70' : ''}>
                      <td className={td} style={mudou ? { boxShadow: 'inset 3px 0 0 #f59e0b' } : undefined}>
                        <span className="flex items-center gap-1.5">
                          <input data-cad-linha={l.id} data-cad-col="nome" onKeyDown={aoTeclar} className={`${inp} font-semibold ${l.excluir ? 'line-through' : ''} ${ver(l.id, 'nome')}`}
                            disabled={l.excluir} value={l.nome} placeholder="Ex.: RDB Planejado, CDB 2 anos" onChange={(e) => muda(l.id, 'nome', e.target.value)} />
                          {l.novo && !linhaVaziaDoCadastro(l) && <span className="shrink-0 rounded-[4px] bg-hx-dcfce7 px-1.5 py-0.5 text-[11px] font-semibold text-hx-166534">novo</span>}
                        </span>
                      </td>
                      <td className={td}><SelectSimples value={l.tipo} onChange={(v) => muda(l.id, 'tipo', v)} opcoes={TIPOS} disabled={l.excluir} compacto /></td>
                      <td className={td}>
                        <span className="flex items-center gap-1.5">
                          <input data-cad-col="taxa" onKeyDown={aoTeclar} className={`${inp} !w-[84px] text-right tabular-nums ${ver(l.id, 'taxa')}`} inputMode="decimal"
                            value={l.taxa} placeholder="100" disabled={l.excluir} onChange={(e) => muda(l.id, 'taxa', e.target.value)} aria-label={`Taxa de ${l.nome || 'investimento'}`} />
                          <span className="whitespace-nowrap text-[12px] text-gray-500">%</span>
                        </span>
                      </td>
                      <td className={td}><SelectSimples value={l.resgate} onChange={(v) => muda(l.id, 'resgate', v)} opcoes={RESGATES} disabled={l.excluir} compacto /></td>
                      <td className={td}>
                        {/* o "um dia antes" AO LADO do prazo (embaixo, as linhas com prazo ficavam mais altas que as outras) */}
                        <div className="flex h-8 items-center gap-2.5">
                          <div className="w-[124px] shrink-0">
                            <SelectSimples value={l.prazo_meses} onChange={(v) => muda(l.id, 'prazo_meses', v)} opcoes={PRAZOS} disabled={l.excluir} compacto className={ver(l.id, 'prazo_meses')} />
                          </div>
                          {l.prazo_meses && (
                            <label className="flex cursor-pointer items-center gap-1.5 whitespace-nowrap text-[11.5px] text-gray-500" title="Como o RDB do Nubank: aplicado em 03/06 com 6 meses, vence em 02/12">
                              <Toggle compacto checked={!!l.vence_dia_antes} onChange={(v) => muda(l.id, 'vence_dia_antes', v)} disabled={l.excluir} rotulo="Vence um dia antes de completar o prazo" />
                              um dia antes
                            </label>
                          )}
                          {l.prazo_meses && (
                            <Tooltip label={com023 ? 'Ligado: o vencimento que cai no sábado ou no domingo vai para a segunda (como a XP). Desligado: vence no dia (como o Nubank).' : 'Falta aplicar a migration 023 (o vencimento no fim de semana)'}>
                              <label className={`flex items-center gap-1.5 whitespace-nowrap text-[11.5px] text-gray-500 ${com023 ? 'cursor-pointer' : 'opacity-50'}`}>
                                <Toggle compacto checked={!!l.vence_dia_util} onChange={(v) => muda(l.id, 'vence_dia_util', v)} disabled={l.excluir || !com023} rotulo="O vencimento no fim de semana vai para a segunda" />
                                fim de semana → seg.
                              </label>
                            </Tooltip>
                          )}
                        </div>
                      </td>
                      <td className={td}>
                        {com022 ? <SelectSimples value={l.no_vencimento} onChange={(v) => muda(l.id, 'no_vencimento', v)} opcoes={NO_VENCIMENTO} disabled={l.excluir} compacto />
                          : <Tooltip label="Falta aplicar a migration 022 (o que acontece no vencimento)"><span className="flex h-8 items-center px-2 text-[12px] text-gray-400">volta para a conta</span></Tooltip>}
                      </td>
                      <td className={`${td} pt-3 text-right tabular-nums text-gray-500`}>{l.novo ? '—' : n}</td>
                      <td className={`${td} text-right`}>
                        <span className="inline-flex items-center gap-0.5">
                          {!l.novo && (
                            <Tooltip label={l.ativo ? 'Ativo (desligue quando não usar mais)' : 'Desativado'}>
                              <span className="inline-flex h-8 items-center px-1"><Toggle compacto checked={l.ativo} onChange={(v) => muda(l.id, 'ativo', v)} disabled={l.excluir} rotulo="Ativo" /></span>
                            </Tooltip>
                          )}
                          <Tooltip label={n ? 'Tem aportes: exclua os aportes antes, ou desative' : l.excluir ? 'Não excluir' : 'Excluir (ao salvar)'}>
                            <button type="button" disabled={n > 0} aria-label={l.excluir ? 'Não excluir' : 'Excluir'}
                              onClick={() => (l.novo ? setLinhas((ls2) => ls2.filter((x) => x.id !== l.id)) : muda(l.id, 'excluir', !l.excluir))}
                              className={`inline-flex h-8 w-7 items-center justify-center rounded-[4px] transition-colors disabled:opacity-30 ${l.excluir ? 'bg-hx-fdeaea text-hx-c0393d' : 'text-gray-400 hover:bg-hx-fdeaea hover:text-hx-c0393d'}`}>
                              <svg viewBox="0 0 24 24" className="h-[14px] w-[14px]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                {l.excluir ? <><path d="M9 14L4 9l5-5" /><path d="M4 9h11a5 5 0 0 1 0 10h-3" /></> : <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />}
                              </svg>
                            </button>
                          </Tooltip>
                        </span>
                      </td>
                    </tr>
                  );
                })}
                <tr>
                  <td colSpan={8} className="px-2 py-1">
                    <button type="button" onClick={() => adicionar(g.id)}
                      className="inline-flex items-center gap-2 rounded-[5px] px-2 py-1.5 text-[12.5px] font-medium text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900">
                      <CirculoMais />Adicionar investimento{g.nome.trim() ? ` em ${g.nome.trim()}` : ''}
                    </button>
                  </td>
                </tr>
              </Fragment>
            ))}
            <tr>
              <td colSpan={8} className="border-t border-gray-200 px-2 py-2">
                <button type="button" onClick={novaInstituicao}
                  className="inline-flex items-center gap-2 rounded-[5px] px-2 py-1.5 text-[12.5px] font-semibold text-gray-700 transition-colors hover:bg-gray-100 hover:text-gray-900">
                  <CirculoMais borda="text-gray-500" />Nova instituição
                </button>
                <span className="ml-2 text-[12px] text-gray-400">o banco ou a corretora (Nubank, XP, Inter…)</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-gray-200 bg-hx-f9fafb px-4 py-3">
        <span className="text-[12px] text-gray-500">
          {nAlt ? <><b className="font-semibold text-hx-92400e">{plural(nAlt, 'alteração', 'alterações')}</b> · ainda não salvo</>
            : 'Enter desce na mesma coluna · mudar a taxa muda a conta de todos os aportes do investimento'}
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
