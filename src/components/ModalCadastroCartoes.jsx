import { useState } from 'react';
import Modal from './Modal.jsx';
import SelectSimples from './SelectSimples.jsx';
import Toggle from './Toggle.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { useConfirmacao } from '../context/ConfirmContext.jsx';
import { excluirCartao, salvarCartao } from '../api/cadastros.js';
import { diferencaCartao, FORMATOS, validarCartoes } from '../lib/cartoes.js';

// O CADASTRO DOS CARTÕES EM POP-UP (30/10/2026, opção A do mockup "Cartões · overhaul"): a tabela de formulário do
// cadastro dos fixos e do das categorias — cada célula é um campo, "+ cartão" acrescenta, a lixeira marca para sair,
// e "Salvar alterações (N)" grava só a diferença (`diferencaCartao`). Cartão com lançamentos não se exclui: desativa.
// `uso`: { cartaoId: nº de lançamentos }.

const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
let seq = 0;
const daLinha = (c) => ({ id: c.id, novo: false, excluir: false, orig: c, nome: c.nome, dia_vencimento: String(c.dia_vencimento), formato: c.formato, ativo: c.ativo });

export default function ModalCadastroCartoes({ cartoes, uso = {}, onFechar, onSalvo }) {
  const toast = useToast();
  const confirmar = useConfirmacao();
  const [linhas, setLinhas] = useState(() => cartoes.map(daLinha));
  const [erro, setErro] = useState(null);
  const [salvando, setSalvando] = useState(false);

  const muda = (id, campo, v) => { setLinhas((ls) => ls.map((l) => (l.id === id ? { ...l, [campo]: v } : l))); setErro(null); };
  const conta = (l) => !(l.novo && (l.excluir || !l.nome.trim()));
  const mudadas = linhas.filter((l) => conta(l) && (l.novo || l.excluir || Object.keys(diferencaCartao(l)).length));
  const nAlt = mudadas.length;

  const novo = () => {
    seq += 1;
    const id = `novo-${seq}`;
    setLinhas((ls) => [...ls, { id, novo: true, excluir: false, orig: null, nome: '', dia_vencimento: '10', formato: 'manual', ativo: true }]);
    setTimeout(() => document.querySelector(`[data-cartao="${id}"]`)?.focus(), 30);
  };

  const fechar = async () => {
    if (nAlt && !(await confirmar({ titulo: 'Descartar as alterações?', texto: `${plural(nAlt, 'alteração ainda não foi salva', 'alterações ainda não foram salvas')}.`, confirmar: 'Descartar', perigo: true }))) return;
    onFechar();
  };

  const salvar = async () => {
    const problema = validarCartoes(linhas);
    if (problema) { setErro(problema); toast.error(`Não salvou — ${problema.motivo}.`); return; }
    const sai = mudadas.filter((l) => l.excluir && !l.novo);
    if (sai.length && !(await confirmar({ titulo: 'Salvar estas alterações?', texto: `Exclui ${sai.map((l) => `"${l.orig.nome}"`).join(', ')}. Não se desfaz.`, confirmar: 'Salvar', perigo: true }))) return;
    setSalvando(true);
    try {
      for (const l of sai) await excluirCartao(l.id);
      for (const l of mudadas.filter((x) => !x.excluir)) {
        await salvarCartao({ ...(l.novo ? {} : { id: l.id }), nome: l.nome, dia_vencimento: l.dia_vencimento, formato: l.formato, ativo: l.ativo });
      }
      toast.success(nAlt === 1 ? 'Alteração salva.' : `${nAlt} alterações salvas.`);
    } catch (err) {
      toast.error(/duplicate|unique/i.test(err.message) ? 'Já existe um cartão com esse nome.' : err.message);
    }
    setSalvando(false);
    onSalvo(); // parte pode ter gravado: a tela recarrega com o que ficou no banco
  };

  const borda = (id, campo) => (erro?.id === id && erro.campo === campo ? '!border-hx-e5484d' : '');
  const th = 'h-8 border-b border-gray-200 bg-hx-f9fafb px-2 text-left text-[10.5px] font-semibold uppercase tracking-wide text-gray-500';
  const td = 'border-b border-gray-100 px-2 py-1.5';

  return (
    <Modal open onClose={fechar} title="Cadastro dos cartões" maxWidth="max-w-[880px]" padding="p-0"
      subtitulo={`${plural(linhas.filter((l) => !l.excluir && l.ativo).length, 'ativo', 'ativos')} · as faturas já importadas não mudam`}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] table-fixed border-separate border-spacing-0 text-[12.5px]">
          <colgroup><col /><col style={{ width: 96 }} /><col style={{ width: 250 }} /><col style={{ width: 70 }} /><col style={{ width: 120 }} /><col style={{ width: 48 }} /></colgroup>
          <thead><tr>
            <th className={th}>Cartão</th><th className={`${th} text-right`}>Vence dia</th><th className={th}>Como a fatura entra</th>
            <th className={th}>Ativo</th><th className={`${th} text-right`}>Lançamentos</th><th className={th} />
          </tr></thead>
          <tbody>
            {linhas.map((l) => {
              const n = uso[l.id] ?? 0;
              const mudou = l.novo || (!l.excluir && Object.keys(diferencaCartao(l)).length > 0);
              return (
                <tr key={l.id} className={l.excluir ? 'opacity-50' : ''}>
                  <td className={td} style={mudou ? { boxShadow: 'inset 3px 0 0 #f59e0b' } : undefined}>
                    <span className="flex items-center gap-2">
                      <input data-cartao={l.id} className={`input !h-8 text-[12.5px] font-semibold ${l.excluir ? 'line-through' : ''} ${borda(l.id, 'nome')}`} disabled={l.excluir}
                        value={l.nome} placeholder="Nome do cartão" onChange={(e) => muda(l.id, 'nome', e.target.value)} />
                      {l.novo && <span className="shrink-0 rounded-[4px] bg-hx-dcfce7 px-1.5 py-0.5 text-[11px] font-semibold text-hx-166534">novo</span>}
                    </span>
                  </td>
                  <td className={td}>
                    <input className={`input !h-8 text-right text-[12.5px] tabular-nums ${borda(l.id, 'dia')}`} inputMode="numeric" disabled={l.excluir}
                      value={l.dia_vencimento} onChange={(e) => muda(l.id, 'dia_vencimento', e.target.value.replace(/\D/g, '').slice(0, 2))} />
                  </td>
                  <td className={td}><SelectSimples value={l.formato} onChange={(v) => muda(l.id, 'formato', v)} opcoes={FORMATOS} disabled={l.excluir} className="!h-8 text-[12.5px]" /></td>
                  <td className={td}><Toggle compacto checked={l.ativo} disabled={l.excluir} onChange={(v) => muda(l.id, 'ativo', v)} rotulo={`${l.nome || 'Cartão'} ativo`} /></td>
                  <td className={`${td} text-right tabular-nums text-gray-500`}>{l.novo ? '—' : n || <span className="text-gray-300">0</span>}</td>
                  <td className={`${td} text-right`}>
                    <button type="button" disabled={!l.excluir && n > 0}
                      title={l.excluir ? 'Não excluir' : n > 0 ? `Tem ${plural(n, 'lançamento', 'lançamentos')}: desative em vez de excluir` : 'Excluir (ao salvar)'}
                      onClick={() => (l.novo ? setLinhas((ls) => ls.filter((x) => x.id !== l.id)) : muda(l.id, 'excluir', !l.excluir))}
                      className={`inline-flex h-7 w-7 items-center justify-center rounded-[4px] transition-colors disabled:cursor-not-allowed disabled:opacity-30 ${
                        l.excluir ? 'bg-hx-fdeaea text-hx-c0393d' : 'text-gray-400 enabled:hover:bg-hx-fdeaea enabled:hover:text-hx-c0393d'}`}>
                      <svg viewBox="0 0 24 24" className="h-[14px] w-[14px]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        {l.excluir ? <><path d="M9 14L4 9l5-5" /><path d="M4 9h11a5 5 0 0 1 0 10h-3" /></> : <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />}
                      </svg>
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="px-4 py-2.5">
        <button type="button" onClick={novo} className="text-[12.5px] font-medium text-gray-600 hover:text-gray-900">+ cartão</button>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-gray-200 bg-hx-f9fafb px-4 py-3">
        <span className="text-[12px] text-gray-500">
          {nAlt ? <><b className="font-semibold text-hx-92400e">{plural(nAlt, 'alteração', 'alterações')}</b> · ainda não salvo</> : 'Cartão com lançamentos não se exclui: desative-o.'}
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
