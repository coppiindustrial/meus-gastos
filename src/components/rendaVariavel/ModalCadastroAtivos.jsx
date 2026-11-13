import { useRef, useState } from 'react';
import Modal from '../Modal.jsx';
import SelectSimples from '../SelectSimples.jsx';
import Toggle from '../Toggle.jsx';
import Tooltip from '../Tooltip.jsx';
import CampoTicker from './CampoTicker.jsx';
import { CirculoMais, IconLixeira } from '../icons.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { useConfirmacao } from '../../context/ConfirmContext.jsx';
import { atualizarAtivo, consultarTicker, criarAtivo, excluirAtivo } from '../../api/rendaVariavel.js';
import { TIPOS } from '../../lib/rendaVariavel.js';

// O CADASTRO DOS ATIVOS (13/11/2026, a renda variável): a tabela de formulário dos cadastros — cada célula um campo (o
// ticker, o tipo, o nome, a corretora, ativo), "Adicionar ativo" na última linha e "Salvar alterações (N)", que grava só a
// diferença. O tipo decide o mercado e a moeda (a ação dos EUA é em dólar). Ao sair do ticker, a função das cotações o
// CONFERE na fonte (a brapi ou a Finnhub) e preenche o nome vazio; "não achou" fica em âmbar (dá para salvar assim mesmo).
// O TICKER SE PROCURA PELO NOME (`CampoTicker`, 13/11/2026): escrevendo "nvidia", a lista traz NVDA; escolher preenche o
// ticker, o tipo e o nome.
// O ativo com operações não se exclui: desativa (some da lista do "Lançar operação", fica no histórico).

const OPCOES_TIPO = [
  { value: 'acao_eua', label: 'Ação dos EUA', grupo: { nome: 'Exterior · US$' } },
  { value: 'etf_eua', label: 'ETF dos EUA', grupo: { nome: 'Exterior · US$' } },
  { value: 'fii', label: 'FII', grupo: { nome: 'B3 · R$' } },
  { value: 'acao_br', label: 'Ação da B3', grupo: { nome: 'B3 · R$' } },
  { value: 'bdr', label: 'BDR', grupo: { nome: 'B3 · R$' } },
  { value: 'etf_br', label: 'ETF da B3', grupo: { nome: 'B3 · R$' } },
];
let seq = 0;
const novaLinha = (tipo = 'acao_eua') => ({ chave: `n${++seq}`, novo: true, ticker: '', tipo, nome: '', corretora: '', ativo: true });

// `inicial`: { ticker, tipo, nome } — a linha nova já preenchida (o "Cadastrar" da ação de fora no painel do gráfico)
export default function ModalCadastroAtivos({ ativos, operacoes, tipoInicial, inicial = null, onFechar, onSalvo }) {
  const toast = useToast();
  const confirmar = useConfirmacao();
  const comOps = new Set(operacoes.map((o) => o.ativo_id));
  const [linhas, setLinhas] = useState(() => {
    const ls = ativos.map((a) => ({ chave: a.id, id: a.id, ticker: a.ticker, tipo: a.tipo, nome: a.nome, corretora: a.corretora, ativo: a.ativo !== false, original: a }));
    if (inicial) return [...ls, { ...novaLinha(inicial.tipo), ticker: inicial.ticker, nome: inicial.nome ?? '' }];
    return tipoInicial || !ls.length ? [...ls, novaLinha(tipoInicial)] : ls;
  });
  const [conferencia, setConferencia] = useState({}); // chave → 'lendo' | 'ok' | 'nao'
  const [salvando, setSalvando] = useState(false);
  const mudar = (chave, campo, valor) => setLinhas((ls) => ls.map((l) => (l.chave === chave ? { ...l, [campo]: valor } : l)));

  // escolher na lista da busca: o ticker, o tipo (o palpite da busca) e o nome; já conferido
  const escolhidos = useRef({});
  const escolher = (chave, it) => {
    escolhidos.current[chave] = it.ticker;
    setLinhas((ls) => ls.map((l) => (l.chave === chave ? { ...l, ticker: it.ticker, tipo: it.tipo, nome: it.nome || l.nome } : l)));
    setConferencia((c) => ({ ...c, [chave]: 'ok' }));
  };
  const conferir = async (l) => {
    const ticker = l.ticker.trim().toUpperCase();
    if (!ticker || escolhidos.current[l.chave] === ticker) return; // o escolhido na lista já veio da fonte
    setConferencia((c) => ({ ...c, [l.chave]: 'lendo' }));
    const r = await consultarTicker(ticker, TIPOS[l.tipo].mercado);
    if (r?.erro) { setConferencia((c) => ({ ...c, [l.chave]: undefined })); return; } // sem a função: não confere
    setConferencia((c) => ({ ...c, [l.chave]: r?.naoAchou ? 'nao' : 'ok' }));
    if (r?.nome) setLinhas((ls) => ls.map((x) => (x.chave === l.chave && !x.nome.trim() ? { ...x, nome: r.nome } : x)));
  };

  // a diferença para o banco
  const dadosDe = (l) => ({ ticker: l.ticker.trim().toUpperCase(), tipo: l.tipo, mercado: TIPOS[l.tipo].mercado, moeda: TIPOS[l.tipo].moeda, nome: l.nome.trim(), corretora: l.corretora.trim(), ativo: l.ativo });
  const mudou = (l) => {
    if (l.excluir) return true;
    if (l.novo) return !!l.ticker.trim();
    const d = dadosDe(l); const o = l.original;
    return d.ticker !== o.ticker || d.tipo !== o.tipo || d.nome !== (o.nome ?? '') || d.corretora !== (o.corretora ?? '') || d.ativo !== (o.ativo !== false);
  };
  const alteradas = linhas.filter(mudou);
  const repetidos = (() => {
    const vistos = new Map(); const rep = new Set();
    linhas.filter((l) => !l.excluir && l.ticker.trim()).forEach((l) => { const k = `${TIPOS[l.tipo].mercado}:${l.ticker.trim().toUpperCase()}`; if (vistos.has(k)) { rep.add(l.chave); rep.add(vistos.get(k)); } else vistos.set(k, l.chave); });
    return rep;
  })();
  const vazios = linhas.filter((l) => !l.novo && !l.excluir && !l.ticker.trim());
  const erro = repetidos.size ? 'Há um ticker repetido no mesmo mercado.' : vazios.length ? 'Um ativo ficou sem o ticker.' : null;

  const salvar = async () => {
    if (erro || !alteradas.length) return;
    const saem = alteradas.filter((l) => l.excluir && !l.novo);
    if (saem.length) {
      const ok = await confirmar({ titulo: saem.length === 1 ? 'Excluir o ativo?' : `Excluir ${saem.length} ativos?`, perigo: true, confirmar: 'Excluir', texto: `${saem.map((l) => l.ticker).join(', ')} sai do cadastro, com as cotações guardadas. Não se desfaz.` });
      if (!ok) return;
    }
    setSalvando(true);
    try {
      for (const l of alteradas) {
        if (l.excluir) { if (!l.novo) await excluirAtivo(l.id); continue; }
        if (l.novo) await criarAtivo({ ...dadosDe(l), ordem: 0 });
        else await atualizarAtivo(l.id, dadosDe(l));
      }
      toast.success(alteradas.length === 1 ? 'Cadastro salvo.' : `${alteradas.length} alterações salvas.`);
      onSalvo();
    } catch (err) {
      toast.error(/duplicate|unique/i.test(err.message) ? 'Esse ticker já está cadastrado nesse mercado.' : err.message);
      setSalvando(false);
    }
  };
  const fechar = async () => {
    if (alteradas.length && !(await confirmar({ titulo: 'Descartar as alterações?', confirmar: 'Descartar', texto: `${alteradas.length} ${alteradas.length === 1 ? 'alteração não foi salva' : 'alterações não foram salvas'}.` }))) return;
    onFechar();
  };

  const th = 'whitespace-nowrap border-b border-gray-200 bg-hx-f9fafb px-2 py-2 text-left text-[10.5px] font-semibold uppercase tracking-wide text-gray-500';
  return (
    <Modal open onClose={fechar} title="Cadastro dos ativos" maxWidth="max-w-5xl" subtitulo="O ticker (MU, HGLG11) ou o nome da empresa, e escolha na lista. O tipo decide o mercado e a moeda.">
      <div className="overflow-x-auto rounded-md border border-gray-200">
        <table className="w-full min-w-[820px] border-separate border-spacing-0 text-[13px]">
          <colgroup><col style={{ width: 130 }} /><col style={{ width: 170 }} /><col /><col style={{ width: 170 }} /><col style={{ width: 74 }} /><col style={{ width: 52 }} /></colgroup>
          <thead><tr><th className={th}>Ticker</th><th className={th}>Tipo</th><th className={th}>Nome</th><th className={th}>Corretora</th><th className={th}>Ativo</th><th className={th} aria-label="Excluir" /></tr></thead>
          <tbody>
            {linhas.map((l) => {
              const c = conferencia[l.chave];
              const td = `border-b border-gray-100 px-2 py-1.5 align-top ${l.excluir ? 'opacity-40' : ''}`;
              return (
                <tr key={l.chave}>
                  <td className={td}>
                    <CampoTicker value={l.ticker} erro={repetidos.has(l.chave)} disabled={l.excluir} autoFocus={l.novo && l === linhas[linhas.length - 1] && !!tipoInicial}
                      onChange={(v) => { mudar(l.chave, 'ticker', v); setConferencia((x) => ({ ...x, [l.chave]: undefined })); }}
                      onEscolher={(it) => escolher(l.chave, it)} onBlur={() => conferir(l)} />
                    {c === 'lendo' && <span className="mt-0.5 block text-[11px] text-gray-400">conferindo…</span>}
                    {c === 'ok' && <span className="mt-0.5 block text-[11px] text-green-700">achou na fonte</span>}
                    {c === 'nao' && <span className="mt-0.5 block text-[11px] leading-[14px] text-amber-700">não achou: escreva o nome e escolha na lista</span>}
                  </td>
                  <td className={td}><SelectSimples compacto value={l.tipo} onChange={(v) => { mudar(l.chave, 'tipo', v); setConferencia((x) => ({ ...x, [l.chave]: undefined })); }} opcoes={OPCOES_TIPO} disabled={l.excluir} /></td>
                  <td className={td}><input className="input !h-8 !py-1" value={l.nome} placeholder="o nome sai da fonte" disabled={l.excluir} onChange={(e) => mudar(l.chave, 'nome', e.target.value)} /></td>
                  <td className={td}><input className="input !h-8 !py-1" value={l.corretora} placeholder="opcional" disabled={l.excluir} onChange={(e) => mudar(l.chave, 'corretora', e.target.value)} /></td>
                  <td className={`${td} pt-[9px]`}><Toggle compacto checked={l.ativo} onChange={(v) => mudar(l.chave, 'ativo', v)} rotulo={`${l.ticker || 'O ativo'} ativo`} disabled={l.excluir} /></td>
                  <td className={`${td} pt-[5px]`}>
                    {l.novo || !comOps.has(l.id) ? (
                      <Tooltip label={l.excluir ? 'Não excluir' : 'Excluir'}>
                        <button type="button" aria-label={l.excluir ? 'Não excluir' : 'Excluir'} onClick={() => (l.novo ? setLinhas((ls) => ls.filter((x) => x.chave !== l.chave)) : mudar(l.chave, 'excluir', !l.excluir))}
                          className={`grid h-[28px] w-[28px] place-items-center rounded-[6px] text-gray-400 transition-colors hover:bg-gray-100 hover:text-hx-c0393d ${l.excluir ? '!text-hx-c0393d' : ''}`}><IconLixeira className="h-[14px] w-[14px]" /></button>
                      </Tooltip>
                    ) : <Tooltip label="Tem operações: desative em vez de excluir"><span className="grid h-[28px] w-[28px] place-items-center text-gray-300"><IconLixeira className="h-[14px] w-[14px]" /></span></Tooltip>}
                  </td>
                </tr>
              );
            })}
            <tr className="group/add">
              <td colSpan={6} className="h-[38px] cursor-pointer px-3 text-[12.5px]" onClick={() => setLinhas((ls) => [...ls, novaLinha(ls[ls.length - 1]?.tipo)])}>
                <span className="flex items-center gap-2 font-medium text-gray-500 transition-colors group-hover/add:text-gray-800"><CirculoMais borda="text-gray-400" />Adicionar ativo</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div className="mt-4 flex items-center gap-2">
        {erro && <span className="text-[12.5px] font-medium text-hx-dc2626">{erro}</span>}
        <span className="flex-1" />
        <button type="button" className="btn-secondary" onClick={fechar}>Cancelar</button>
        <button type="button" className="btn-primary" disabled={salvando || !!erro || !alteradas.length} onClick={salvar}>
          {salvando ? 'Salvando…' : alteradas.length ? `Salvar alterações (${alteradas.length})` : 'Salvar alterações'}
        </button>
      </div>
    </Modal>
  );
}
