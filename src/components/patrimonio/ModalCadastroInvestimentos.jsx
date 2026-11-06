import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import Modal from '../Modal.jsx';
import SelectSimples from '../SelectSimples.jsx';
import CampoData from '../CampoData.jsx';
import Toggle from '../Toggle.jsx';
import { IconMais } from '../icons.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { useConfirmacao } from '../../context/ConfirmContext.jsx';
import { salvarConta } from '../../api/patrimonio.js';
import { atualizarInvestimento, criarInvestimento, excluirInvestimento } from '../../api/investimentos.js';
import {
  AO_VENCER, INDEXADORES, LIQUIDEZ, TIPOS_INVESTIMENTO, dadosDaLinha, diferencaInvestimento, impostoGarantia, linhaDoInvestimento, linhaNova,
  linhaVazia, padraoDoTipo, validarCadastro,
} from '../../lib/investimentos.js';
import { calcularValor, formatBRL } from '../../lib/dinheiro.js';
import { todayISO } from '../../lib/format.js';

// O CADASTRO DOS INVESTIMENTOS (06/11/2026, o mockup "Patrimônio do zero"): a TABELA DE FORMULÁRIO dos cadastros do app
// (a dos fixos, a dos cartões) — todos os investimentos de uma vez, agrupados por ONDE estão (as `contas`), cada célula
// um campo, "Adicionar investimento" no fim de cada lugar e "Novo lugar" no fim de tudo. Só nome, tipo e o valor de hoje
// são obrigatórios; o tipo já preenche o "rende" e o prazo (`padraoDoTipo`). O "Valor hoje" só se digita na linha nova
// (é a primeira foto); depois ele muda pelo "Atualizar valores". "Salvar alterações (N)" grava a diferença
// (`diferencaInvestimento`, `validarCadastro` — lib/investimentos.js, testadas). Enter desce na mesma coluna.
// `focoLugar`: a conta em que já abre uma linha nova (o "Adicionar investimento" da tela).

let seq = 0;
const novoId = (p) => { seq += 1; return `${p}-${seq}`; };
const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
const MESES_PRAZO = [6, 12, 18, 24, 36, 48, 60].map((m) => ({ value: String(m), label: m % 12 === 0 ? `${m / 12} ${m === 12 ? 'ano' : 'anos'}` : `${m} meses` }));
const lerValor = (t) => calcularValor(t);

export default function ModalCadastroInvestimentos({ contas, investimentos, valesHoje = {}, focoLugar, onFechar, onSalvo }) {
  const toast = useToast();
  const confirmar = useConfirmacao();
  const hoje = todayISO();
  // os lugares: as contas ativas e as que têm investimento
  const [lugares, setLugares] = useState(() => contas
    .filter((c) => c.ativa || investimentos.some((i) => i.conta_id === c.id))
    .map((c) => ({ id: c.id, nome: c.nome, orig: c.nome, novo: false })));
  const [linhas, setLinhas] = useState(() => investimentos.map((i) => linhaDoInvestimento(i, valesHoje[i.id] ?? null)));
  const [detalhe, setDetalhe] = useState(null); // a linha com o "⋯" aberto
  const [erro, setErro] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const caixaRef = useRef(null);

  const focar = (sel) => setTimeout(() => caixaRef.current?.querySelector(sel)?.focus(), 40);
  const adicionar = (contaId) => {
    const id = novoId('novo');
    setLinhas((ls) => [...ls, linhaNova(id, contaId)]);
    focar(`[data-cad-linha="${id}"][data-cad-col="nome"]`);
  };
  const novoLugar = () => {
    const id = novoId('lugar');
    setLugares((ls) => [...ls, { id, nome: '', orig: '', novo: true }]);
    focar(`[data-cad-lugar="${id}"]`);
  };
  // Abrir: no lugar pedido (ou no primeiro, ou num novo, se não há nenhum), uma linha nova já com o cursor.
  const abriu = useRef(false); // o efeito roda duas vezes no modo estrito do React: a linha nova entra uma vez só
  useEffect(() => {
    if (abriu.current) return;
    abriu.current = true;
    if (focoLugar) adicionar(focoLugar);
    else if (!lugares.length) novoLugar();
    else if (!investimentos.length) adicionar(lugares[0].id); // a carteira vazia já abre com uma linha para digitar
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const muda = (id, campo, v) => {
    setLinhas((ls) => ls.map((l) => {
      if (l.id !== id) return l;
      const n = { ...l, [campo]: v };
      // a linha NOVA que troca de tipo leva o padrão do tipo novo, se o "rende" e o prazo ainda eram os do anterior
      if (campo === 'tipo' && l.novo) {
        const antes = padraoDoTipo(l.tipo);
        if (l.indexador === antes.indexador && l.taxa === antes.taxa && l.liquidez === antes.liquidez) Object.assign(n, padraoDoTipo(v));
      }
      return n;
    }));
    setErro(null);
  };
  const mudaLugar = (id, nome) => { setLugares((ls) => ls.map((l) => (l.id === id ? { ...l, nome } : l))); setErro(null); };

  const conta = (l) => !(l.novo && (l.excluir || linhaVazia(l)));
  const mudadas = linhas.filter((l) => conta(l) && (l.novo || l.excluir || Object.keys(diferencaInvestimento(l, lerValor)).length));
  const lugaresMudados = lugares.filter((l) => l.nome.trim() && (l.novo || l.nome.trim() !== l.orig));
  const nAlt = mudadas.length + lugaresMudados.length;

  const fechar = async () => {
    if (nAlt && !(await confirmar({ titulo: 'Descartar as alterações?', texto: `${plural(nAlt, 'alteração ainda não foi salva', 'alterações ainda não foram salvas')}.`, confirmar: 'Descartar', perigo: true }))) return;
    onFechar();
  };

  const salvar = async () => {
    const semNome = lugares.find((l) => l.novo && !l.nome.trim() && linhas.some((x) => x.conta_id === l.id && conta(x) && !x.excluir));
    if (semNome) { setErro({ id: semNome.id, campo: 'lugar' }); toast.error('Não salvou — falta o nome de um lugar.'); return; }
    const problema = validarCadastro(linhas, lerValor);
    if (problema) { setErro(problema); toast.error(`Não salvou — ${problema.motivo}.`); return; }
    const sai = mudadas.filter((l) => l.excluir && !l.novo);
    if (sai.length && !(await confirmar({
      titulo: 'Salvar estas alterações?', perigo: true, confirmar: 'Salvar',
      texto: `Exclui ${sai.map((l) => `"${l.orig.nome}"`).join(', ')} com os valores e as aplicações registrados. Não se desfaz. Se só venceu ou foi resgatado, prefira desligar "Ativo".`,
    }))) return;
    setSalvando(true);
    try {
      const ids = {};
      for (const l of lugaresMudados) {
        const salvo = await salvarConta(l.novo ? { nome: l.nome, tipo: 'investimento', instituicao: '', ativa: true } : { ...contas.find((c) => c.id === l.id), nome: l.nome });
        ids[l.id] = salvo.id;
      }
      const real = (id) => ids[id] ?? id;
      for (const l of sai) await excluirInvestimento(l.id);
      for (const l of mudadas.filter((x) => !x.excluir)) {
        if (l.novo) {
          await criarInvestimento({ ...dadosDaLinha(l, lerValor), conta_id: real(l.conta_id) }, { valor_centavos: lerValor(l.vale), data: hoje });
        } else {
          await atualizarInvestimento(l.id, diferencaInvestimento(l, lerValor));
        }
      }
      toast.success(nAlt === 1 ? 'Alteração salva.' : `${nAlt} alterações salvas.`);
    } catch (err) {
      toast.error(/duplicate|unique/i.test(err.message) ? 'Já existe um lugar com esse nome.' : err.message);
    }
    setSalvando(false);
    onSalvo(); // parte pode ter gravado: a tela recarrega com o que ficou no banco
  };

  // Enter desce na mesma coluna (como numa planilha)
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
  const porLugar = useMemo(() => lugares.map((g) => ({ g, ls: linhas.filter((l) => l.conta_id === g.id) })), [lugares, linhas]);
  const ativos = linhas.filter((l) => !l.excluir && l.ativo && !linhaVazia(l)).length;

  const celulaPrazo = (l) => (
    <div className="flex flex-col gap-1">
      <SelectSimples value={l.liquidez} onChange={(v) => muda(l.id, 'liquidez', v)} opcoes={LIQUIDEZ} disabled={l.excluir} compacto className={ver(l.id, 'prazo')} />
      {l.liquidez === 'por_aplicacao' && (
        <div className="grid grid-cols-2 gap-1">
          <SelectSimples value={l.prazo_meses} onChange={(v) => muda(l.id, 'prazo_meses', v)} opcoes={MESES_PRAZO} placeholder="prazo" disabled={l.excluir} compacto />
          <SelectSimples value={l.ao_vencer} onChange={(v) => muda(l.id, 'ao_vencer', v)} opcoes={AO_VENCER} disabled={l.excluir} compacto />
        </div>
      )}
      {l.liquidez === 'dias' && (
        <span className="flex items-center gap-1.5 text-[12px] text-gray-500">D+
          <input className={`${inp} !w-16 text-right tabular-nums`} inputMode="numeric" value={l.liquidez_dias} disabled={l.excluir}
            onChange={(e) => muda(l.id, 'liquidez_dias', e.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="30" /> dias</span>
      )}
      {l.liquidez === 'carencia' && <CampoData value={l.carencia_ate} onChange={(v) => muda(l.id, 'carencia_ate', v)} compacto vazio="carência até" disabled={l.excluir} />}
      {(l.liquidez === 'vencimento' || l.liquidez === 'diaria') && (
        <CampoData value={l.vencimento} onChange={(v) => muda(l.id, 'vencimento', v)} compacto vazio={l.liquidez === 'diaria' ? 'sem vencimento' : 'vence em'} disabled={l.excluir} />
      )}
    </div>
  );

  return (
    <Modal open onClose={fechar} title="Cadastro dos investimentos" maxWidth="max-w-[1180px]" padding="p-0"
      subtitulo={`${plural(ativos, 'ativo', 'ativos')} · o valor de hoje dos que já existem muda pelo "Atualizar valores"`}>
      <div ref={caixaRef} className="max-h-[66vh] overflow-auto [scrollbar-gutter:stable]">
        <table className="w-full min-w-[1040px] table-fixed border-separate border-spacing-0 text-[12.5px]">
          <colgroup>
            <col /><col style={{ width: 150 }} /><col style={{ width: 190 }} /><col style={{ width: 250 }} />
            <col style={{ width: 124 }} /><col style={{ width: 124 }} /><col style={{ width: 76 }} />
          </colgroup>
          <thead className="sticky top-0 z-10"><tr>
            <th className={th}>Nome</th><th className={th}>Tipo</th><th className={th}>Rende</th><th className={th}>Prazo · resgate</th>
            <th className={`${th} text-right`}>Valor aplicado</th><th className={`${th} text-right`}>Valor hoje</th><th className={th} />
          </tr></thead>
          <tbody>
            {porLugar.map(({ g, ls }) => (
              <Fragment key={g.id}>
                <tr>
                  <td colSpan={7} className="border-b border-gray-200 bg-hx-f9fafb px-2 py-1.5">
                    <span className="flex items-center gap-2">
                      <input data-cad-lugar={g.id} className={`input !h-7 !w-[260px] !bg-transparent text-[12.5px] font-semibold ${ver(g.id, 'lugar')}`}
                        value={g.nome} placeholder="Onde está (ex.: Nubank, XP)" onChange={(e) => mudaLugar(g.id, e.target.value)} aria-label="Nome do lugar" />
                      {g.novo && <span className="shrink-0 rounded-[4px] bg-hx-dcfce7 px-1.5 py-0.5 text-[11px] font-semibold text-hx-166534">novo lugar</span>}
                      <span className="text-[11.5px] font-normal text-gray-400">{plural(ls.filter((l) => !linhaVazia(l)).length, 'investimento', 'investimentos')}</span>
                    </span>
                  </td>
                </tr>
                {ls.map((l) => {
                  const mudou = l.novo ? !linhaVazia(l) : !l.excluir && Object.keys(diferencaInvestimento(l, lerValor)).length > 0;
                  const aberto = detalhe === l.id;
                  const imposto = impostoGarantia(l.tipo);
                  return (
                    <Fragment key={l.id}>
                      <tr className={l.excluir ? 'opacity-50' : !l.ativo ? 'opacity-70' : ''}>
                        <td className={td} style={mudou ? { boxShadow: 'inset 3px 0 0 #f59e0b' } : undefined}>
                          <span className="flex items-center gap-1.5">
                            <input data-cad-linha={l.id} data-cad-col="nome" onKeyDown={aoTeclar} className={`${inp} font-semibold ${l.excluir ? 'line-through' : ''} ${ver(l.id, 'nome')}`}
                              disabled={l.excluir} value={l.nome} placeholder="Ex.: CDB 2 anos, Caixinha" onChange={(e) => muda(l.id, 'nome', e.target.value)} />
                            {l.novo && !linhaVazia(l) && <span className="shrink-0 rounded-[4px] bg-hx-dcfce7 px-1.5 py-0.5 text-[11px] font-semibold text-hx-166534">novo</span>}
                            {!l.ativo && <span className="shrink-0 rounded-[4px] bg-gray-100 px-1.5 py-0.5 text-[11px] font-semibold text-gray-500">encerrado</span>}
                          </span>
                        </td>
                        <td className={td}>
                          <SelectSimples value={l.tipo} onChange={(v) => muda(l.id, 'tipo', v)} opcoes={TIPOS_INVESTIMENTO.map((t) => ({ value: t.value, label: t.label }))} disabled={l.excluir} compacto />
                          {imposto && <span className="mt-0.5 block truncate px-1 text-[10.5px] text-gray-400">{imposto}</span>}
                        </td>
                        <td className={td}>
                          <div className="flex gap-1">
                            <SelectSimples value={l.indexador} onChange={(v) => muda(l.id, 'indexador', v)} opcoes={INDEXADORES} disabled={l.excluir} compacto className="min-w-0 flex-1" />
                            {l.indexador && (
                              <input data-cad-col="taxa" onKeyDown={aoTeclar} className={`${inp} !w-[58px] text-right tabular-nums ${ver(l.id, 'taxa')}`} inputMode="decimal"
                                value={l.taxa} placeholder={l.indexador === 'cdi_pct' ? '100' : '6,5'} disabled={l.excluir} onChange={(e) => muda(l.id, 'taxa', e.target.value)}
                                aria-label={`Taxa de ${l.nome || 'investimento'}`} />
                            )}
                          </div>
                        </td>
                        <td className={td}>{celulaPrazo(l)}</td>
                        <td className={td}>
                          <input data-cad-col="aplicado" onKeyDown={aoTeclar} className={`${inp} text-right tabular-nums ${ver(l.id, 'aplicado')}`} inputMode="decimal"
                            value={l.aplicado} placeholder="—" disabled={l.excluir} onChange={(e) => muda(l.id, 'aplicado', e.target.value)}
                            title='O "valor aplicado" do app do banco. Vazio: o rendimento conta a partir do cadastro.' aria-label={`Valor aplicado de ${l.nome || 'investimento'}`} />
                        </td>
                        <td className={td}>
                          {l.novo ? (
                            <input data-cad-col="vale" onKeyDown={aoTeclar} className={`${inp} text-right tabular-nums ${ver(l.id, 'vale')}`} inputMode="decimal"
                              value={l.vale} placeholder="0,00" onChange={(e) => muda(l.id, 'vale', e.target.value)} aria-label={`Valor hoje de ${l.nome || 'investimento'}`} />
                          ) : (
                            <span className="flex h-8 items-center justify-end px-2 tabular-nums text-gray-500" title='Muda pelo "Atualizar valores"'>{valesHoje[l.id] !== undefined ? formatBRL(valesHoje[l.id]) : '—'}</span>
                          )}
                        </td>
                        <td className={`${td} text-right`}>
                          <span className="inline-flex gap-0.5">
                            <button type="button" onClick={() => setDetalhe(aberto ? null : l.id)} title="Emissor, observação, ativo" aria-expanded={aberto}
                              className={`inline-flex h-8 w-7 items-center justify-center rounded-[4px] text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-800 ${aberto ? 'bg-gray-100' : ''}`}>⋯</button>
                            <button type="button" title={l.excluir ? 'Não excluir' : 'Excluir (ao salvar)'}
                              onClick={() => (l.novo ? setLinhas((ls2) => ls2.filter((x) => x.id !== l.id)) : muda(l.id, 'excluir', !l.excluir))}
                              className={`inline-flex h-8 w-7 items-center justify-center rounded-[4px] transition-colors ${l.excluir ? 'bg-hx-fdeaea text-hx-c0393d' : 'text-gray-400 hover:bg-hx-fdeaea hover:text-hx-c0393d'}`}>
                              <svg viewBox="0 0 24 24" className="h-[14px] w-[14px]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                {l.excluir ? <><path d="M9 14L4 9l5-5" /><path d="M4 9h11a5 5 0 0 1 0 10h-3" /></> : <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />}
                              </svg>
                            </button>
                          </span>
                        </td>
                      </tr>
                      {aberto && (
                        <tr>
                          <td colSpan={7} className="border-b border-gray-100 bg-hx-f9fafb px-3 py-2">
                            <div className="flex flex-wrap items-center gap-3">
                              <label className="flex items-center gap-2 text-[12px] text-gray-600">Emissor
                                <input className={`${inp} !w-[220px]`} value={l.emissor} placeholder="o banco que emitiu, se não for o lugar" onChange={(e) => muda(l.id, 'emissor', e.target.value)} /></label>
                              <label className="flex min-w-[240px] flex-1 items-center gap-2 text-[12px] text-gray-600">Observação
                                <input className={inp} value={l.observacao} placeholder="ex.: reserva de emergência" onChange={(e) => muda(l.id, 'observacao', e.target.value)} /></label>
                              {!l.novo && <Toggle compacto checked={l.ativo} onChange={(v) => muda(l.id, 'ativo', v)} rotulo="Ativo (desligue quando vencer ou for resgatado inteiro)" />}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
                <tr>
                  <td colSpan={7} className="px-2 py-1">
                    <button type="button" onClick={() => adicionar(g.id)}
                      className="inline-flex items-center gap-2 rounded-[5px] px-2 py-1.5 text-[12.5px] font-medium text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900">
                      <span className="flex h-4 w-4 items-center justify-center rounded-full border border-dashed border-gray-400"><IconMais className="h-2 w-2" /></span>
                      Adicionar investimento{g.nome.trim() ? ` em ${g.nome.trim()}` : ''}
                    </button>
                  </td>
                </tr>
              </Fragment>
            ))}
            <tr>
              <td colSpan={7} className="border-t border-gray-200 px-2 py-2">
                <button type="button" onClick={novoLugar}
                  className="inline-flex items-center gap-2 rounded-[5px] px-2 py-1.5 text-[12.5px] font-semibold text-gray-700 transition-colors hover:bg-gray-100 hover:text-gray-900">
                  <span className="flex h-4 w-4 items-center justify-center rounded-full border border-dashed border-gray-500"><IconMais className="h-2 w-2" /></span>
                  Novo lugar
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
            : 'Enter desce na mesma coluna · "Valor aplicado" vazio: o rendimento conta de hoje · aceita conta: =20000+14000'}
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
