import { Fragment, useMemo, useRef, useState } from 'react';
import Modal from '../Modal.jsx';
import CampoData from '../CampoData.jsx';
import SelectSimples from '../SelectSimples.jsx';
import SelectBusca from '../SelectBusca.jsx';
import Toggle from '../Toggle.jsx';
import AbasPilula from '../AbasPilula.jsx';
import { BotaoExcluir, Campo, Etiqueta, RodapeForm } from '../Comuns.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { useConfirmacao } from '../../context/ConfirmContext.jsx';
import { excluirConta, excluirMovimento, salvarConta } from '../../api/patrimonio.js';
import { criarInvestimento, excluirValor, lancarMovimento, registrarValores } from '../../api/investimentos.js';
import {
  TIPOS_INVESTIMENTO, nomeTipoInvestimento, padraoDoTipo, rendimentoForaDoNormal, rotuloLiquidez, rotuloPrazo, rotuloRende,
} from '../../lib/investimentos.js';
import { calcularValor, formatBRL } from '../../lib/dinheiro.js';
import { addMeses, formatDate, todayISO } from '../../lib/format.js';

// OS POP-UPS DOS INVESTIMENTOS (06/11/2026, o mockup "Patrimônio do zero"): os dois gestos do dia a dia — APLICAR /
// RESGATAR (o investimento, a data e o valor; o novo investimento nasce ali mesmo) e ATUALIZAR VALORES (quanto cada um
// vale hoje, com o aviso do rendimento fora do normal, que lança a aplicação esquecida) —, a FICHA do investimento (as
// aplicações e quando cada uma vence, o histórico para corrigir) e o LUGAR (o banco ou a corretora). O cadastro em
// tabela mora em `ModalCadastroInvestimentos.jsx`.

const vazio = (t) => !String(t ?? '').trim();
const ler = (t) => (vazio(t) ? null : calcularValor(t));
const doisCampos = 'grid gap-3 sm:grid-cols-2';
const ultimoDiaDoMes = (comp) => { const [y, m] = comp.split('-').map(Number); return `${comp}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, '0')}`; };
const diasEntre = (a, b) => Math.round((Date.UTC(+b.slice(0, 4), +b.slice(5, 7) - 1, +b.slice(8, 10)) - Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10))) / 86400000);
const IcoSobe = () => <svg viewBox="0 0 24 24" className="h-[13px] w-[13px]" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 19V5M6 11l6-6 6 6" /></svg>;
const IcoDesce = () => <svg viewBox="0 0 24 24" className="h-[13px] w-[13px]" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 5v14M6 13l6 6 6-6" /></svg>;
export { IcoSobe, IcoDesce };

// ------------------------------------------------------------ o lugar (a conta: o banco ou a corretora)
export function ModalLugar({ conta, qtdInvestimentos = 0, onFechar, onSalvo }) {
  const toast = useToast();
  const confirmar = useConfirmacao();
  const [nome, setNome] = useState(conta?.nome ?? '');
  const [ativa, setAtiva] = useState(conta?.ativa !== false);
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);
  const enviar = async (e) => {
    e.preventDefault();
    if (!nome.trim()) { setErro('Informe o nome (ex.: Nubank, XP).'); return; }
    setSalvando(true);
    try {
      await salvarConta(conta?.id ? { ...conta, nome, ativa } : { nome, tipo: 'investimento', instituicao: '', ativa: true });
      toast.success(conta?.id ? 'Lugar atualizado.' : 'Lugar criado.');
      onSalvo();
    } catch (err) { setErro(/duplicate|unique/i.test(err.message) ? 'Já existe um lugar com esse nome.' : err.message); setSalvando(false); }
  };
  const excluir = async () => {
    if (!await confirmar({
      titulo: `Excluir "${conta.nome}"?`, perigo: true, confirmar: 'Excluir',
      texto: qtdInvestimentos ? `Os ${qtdInvestimentos} investimento(s) dele, com os valores e as aplicações, também são apagados. Não se desfaz.` : 'Não se desfaz.',
    })) return;
    try { await excluirConta(conta.id); toast.success('Lugar excluído.'); onSalvo(); } catch (err) { toast.error(err.message); }
  };
  return (
    <Modal open onClose={onFechar} title={conta?.id ? 'Editar lugar' : 'Novo lugar'} subtitulo="o banco ou a corretora onde estão os investimentos" maxWidth="max-w-md">
      <form onSubmit={enviar} className="space-y-4">
        <Campo rotulo="Nome" erro={erro}>
          <input className="input" autoFocus value={nome} placeholder="Ex.: Nubank, XP, Inter" onChange={(e) => { setNome(e.target.value); setErro(''); }} />
        </Campo>
        {conta?.id && <Toggle checked={ativa} onChange={setAtiva} rotulo="Ativo (desligue quando não tiver mais nada lá)" />}
        <div className="mt-5 flex items-center gap-2">
          {conta?.id && <button type="button" className="text-[13px] font-medium text-hx-c0393d hover:underline" onClick={excluir}>Excluir lugar</button>}
          <span className="flex-1" />
          <button type="button" className="btn-secondary" onClick={onFechar}>Cancelar</button>
          <button type="submit" className="btn-primary" disabled={salvando}>{salvando ? 'Salvando…' : 'Salvar'}</button>
        </div>
      </form>
    </Modal>
  );
}

// ------------------------------------------------------------ aplicar / resgatar
// `inicial`: { inv?, tipo }. `grupos`: a carteira (a lista por lugar, o "fica com R$ X aplicados", o vale de hoje para o
// "Resgatar tudo"). O NOVO INVESTIMENTO nasce aqui (só aplicando): nome, onde e tipo; o valor é o da própria aplicação.
export function ModalMovimento({ inicial, grupos, contas, onFechar, onSalvo, z }) {
  const toast = useToast();
  const hoje = todayISO();
  const [tipo, setTipo] = useState(inicial?.tipo ?? 'aporte');
  const [alvo, setAlvo] = useState(inicial?.inv ? inicial.inv.id : '');
  const [novo, setNovo] = useState(null); // { nome, conta_id, tipo } — o investimento que nasce agora
  const [data, setData] = useState(hoje);
  const [valor, setValor] = useState('');
  const [descricao, setDescricao] = useState('');
  const [tudo, setTudo] = useState(false);
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);
  const ativas = contas.filter((c) => c.ativa);

  const opcoes = useMemo(() => grupos.flatMap((g) => g.itens.filter((x) => x.inv.ativo !== false).map((x) => ({
    value: x.inv.id, label: [x.inv.nome, rotuloRende(x.inv)].filter(Boolean).join(' · '), grupo: { nome: g.conta.nome, cor: g.cor },
  }))), [grupos]);
  const x = useMemo(() => grupos.flatMap((g) => g.itens).find((i) => i.inv.id === alvo) ?? null, [alvo, grupos]);
  const v = ler(valor);
  const aplicando = tipo === 'aporte';
  const depois = x && v ? x.aplicado + (aplicando ? v : -v) : null;
  const prazo = (novo ? null : x?.inv.liquidez === 'por_aplicacao' ? Number(x.inv.prazo_meses) : null);

  const enviar = async (e) => {
    e.preventDefault();
    if (!novo && !x) { setErro('Escolha o investimento.'); return; }
    if (novo && (!novo.nome.trim() || !novo.conta_id)) { setErro('Dê o nome e o lugar do investimento novo.'); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) { setErro('Informe a data.'); return; }
    if (v === null || !(v > 0)) { setErro('Informe o valor.'); return; }
    setSalvando(true);
    try {
      if (novo) {
        const p = padraoDoTipo(novo.tipo);
        await criarInvestimento({ conta_id: novo.conta_id, nome: novo.nome, tipo: novo.tipo, indexador: p.indexador || null, taxa: p.taxa ? Number(p.taxa) : null, liquidez: p.liquidez },
          { valor_centavos: v, data, comoAporte: true });
        toast.success(`${novo.nome.trim()} cadastrado com a aplicação de ${formatBRL(v)}.`);
      } else {
        await lancarMovimento({ conta_id: x.inv.conta_id, investimento_id: x.inv.id, data, tipo, valor_centavos: v, descricao }, { encerrar: !aplicando && tudo });
        toast.success(`${aplicando ? 'Aplicação' : 'Resgate'} de ${formatBRL(v)} ${aplicando ? 'em' : 'de'} ${x.inv.nome}${!aplicando && tudo ? ' · encerrado' : ''}.`);
      }
      onSalvo();
    } catch (err) { setErro(err.message); setSalvando(false); }
  };

  return (
    <Modal open onClose={onFechar} title={aplicando ? 'Aplicar' : 'Resgatar'} subtitulo={aplicando ? 'dinheiro que entrou num investimento' : 'dinheiro que saiu de um investimento'} maxWidth="max-w-md" z={z}>
      <form onSubmit={enviar} className="space-y-4">
        <AbasPilula abas={[{ key: 'aporte', label: '↑ Aplicar' }, { key: 'resgate', label: '↓ Resgatar' }]} valor={tipo}
          onChange={(t) => { setTipo(t); setErro(''); setTudo(false); if (t === 'resgate') setNovo(null); }} variante="claro" cheia altura={32} folga={2} />
        {novo ? (
          <div className="space-y-3 rounded-md border border-gray-200 p-3">
            <div className="flex items-center"><span className="text-[12.5px] font-semibold text-gray-700">Investimento novo</span>
              <button type="button" className="ml-auto text-[12px] text-gray-500 hover:text-gray-800 hover:underline" onClick={() => setNovo(null)}>escolher um que já existe</button></div>
            <input className="input" autoFocus value={novo.nome} placeholder="Nome (ex.: CDB 2 anos)" onChange={(e) => setNovo({ ...novo, nome: e.target.value })} />
            <div className={doisCampos}>
              <SelectSimples value={novo.conta_id} onChange={(c) => setNovo({ ...novo, conta_id: c })} opcoes={ativas.map((c) => ({ value: c.id, label: c.nome }))} placeholder="Onde está" />
              <SelectSimples value={novo.tipo} onChange={(t) => setNovo({ ...novo, tipo: t })} opcoes={TIPOS_INVESTIMENTO.map((t) => ({ value: t.value, label: t.label }))} />
            </div>
            <p className="text-xs text-gray-500">O "rende" e o prazo vêm pelo tipo; ajuste depois no cadastro (✎).</p>
          </div>
        ) : (
          <Campo rotulo="Investimento">
            <SelectBusca value={alvo} onChange={(a) => { setAlvo(a); setErro(''); setTudo(false); }} opcoes={opcoes} placeholder="Escolha o investimento" buscaPlaceholder="Buscar investimento"
              acao={aplicando ? { rotulo: () => 'Novo investimento', onClick: (q) => setNovo({ nome: q, conta_id: ativas.length === 1 ? ativas[0].id : '', tipo: 'cdb' }) } : undefined} />
          </Campo>
        )}
        <div className={doisCampos}>
          <Campo rotulo="Data"><CampoData value={data} onChange={setData} max={hoje} /></Campo>
          <Campo rotulo="Valor">
            <input className="input text-right tabular-nums" inputMode="decimal" value={valor} placeholder="0,00" autoFocus={!!inicial?.inv}
              onChange={(e) => { setValor(e.target.value); setTudo(false); setErro(''); }} />
          </Campo>
        </div>
        {!aplicando && x && (
          tudo ? (
            <span className="flex items-center gap-2 text-[12.5px]"><Etiqueta tom="ambar">resgatou tudo · encerra o investimento</Etiqueta>
              <button type="button" className="text-gray-500 hover:text-gray-800" onClick={() => setTudo(false)} aria-label="Não encerrar">✕</button></span>
          ) : (
            <button type="button" className="btn-secondary !h-8 !text-[12.5px]" onClick={() => { setValor((x.vale / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })); setTudo(true); }}>
              Resgatar tudo · {formatBRL(x.vale)}
            </button>
          )
        )}
        {!novo && (
          <Campo rotulo="Observação (opcional)">
            <input className="input" value={descricao} placeholder={aplicando ? 'Ex.: 13º, sobra de outubro' : 'Ex.: compra do carro'} onChange={(e) => setDescricao(e.target.value)} />
          </Campo>
        )}
        {depois !== null && (
          <p className="rounded-md bg-hx-f9fafb px-3 py-2 text-[12.5px] text-gray-600">
            Depois {aplicando ? 'desta aplicação' : 'deste resgate'}, {x.inv.nome} fica com <b className="font-semibold text-gray-800">{formatBRL(Math.max(0, depois))}</b> aplicados.
            {aplicando && prazo ? ` Esta aplicação fica ${rotuloPrazo(prazo)} e ${x.inv.ao_vencer === 'volta' ? 'volta para a conta' : 'reaplica sozinha'} ao vencer.` : ''}
          </p>
        )}
        {erro && <p className="text-sm font-medium text-hx-dc2626">{erro}</p>}
        <RodapeForm onCancelar={onFechar} salvando={salvando} rotulo={novo ? 'Cadastrar e aplicar' : aplicando ? 'Aplicar' : 'Resgatar'} />
      </form>
    </Modal>
  );
}

// ------------------------------------------------------------ a ficha do investimento
// O que ele é, os números, as APLICAÇÕES (no "cada aplicação vence": quando cada uma vence, a barrinha do prazo e
// "reaplica") e o HISTÓRICO (os valores e os movimentos, com o ✕ para corrigir).
export function FichaInvestimento({ x, lugar, valores, movimentos, movel, onFechar, onAplicar, onCadastro, onMudou }) {
  const toast = useToast();
  const confirmar = useConfirmacao();
  const [aba, setAba] = useState(x.prazos ? 'aplicacoes' : 'historico');
  const inv = x.inv;
  const linhas = [
    ...valores.map((f) => ({ ...f, tipo: 'foto' })),
    ...movimentos.map((m) => ({ ...m })),
  ].sort((a, b) => b.data.localeCompare(a.data) || (a.tipo === 'foto' ? -1 : 1));
  const apagar = async (h) => {
    const foto = h.tipo === 'foto';
    if (!await confirmar({ titulo: foto ? 'Excluir este valor?' : `Excluir est${h.tipo === 'aporte' ? 'a aplicação' : 'e resgate'}?`, texto: `${formatBRL(h.valor_centavos)} em ${formatDate(h.data)}.`, confirmar: 'Excluir', perigo: true })) return;
    try { await (foto ? excluirValor(h.id) : excluirMovimento(h.id)); toast.success('Excluído.'); onMudou(); } catch (err) { toast.error(err.message); }
  };
  const num = 'text-[17px] font-semibold tabular-nums';
  return (
    <Modal open onClose={onFechar} title={inv.nome} maxWidth="max-w-[760px]"
      subtitulo={[lugar, nomeTipoInvestimento(inv.tipo), rotuloRende(inv), rotuloLiquidez(inv) + (inv.liquidez === 'por_aplicacao' ? (inv.ao_vencer === 'volta' ? ' · volta ao vencer' : ' · reaplica sozinho') : '')].filter(Boolean).join(' · ')}>
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-3 rounded-md border border-gray-200 px-4 py-3">
          <div><div className="text-[11px] font-medium uppercase tracking-wide text-gray-500">Aplicado</div><div className={`${num} text-gray-800`}>{formatBRL(x.aplicado)}</div></div>
          <div><div className="text-[11px] font-medium uppercase tracking-wide text-gray-500">Vale hoje</div><div className={`${num} text-gray-900`}>{formatBRL(x.vale)}</div>
            {x.data && <div className="text-[11.5px] text-gray-400">foto de {formatDate(x.data)}</div>}</div>
          <div><div className="text-[11px] font-medium uppercase tracking-wide text-gray-500">Rendeu</div>
            <div className={`${num} ${x.rendeu < 0 ? 'text-hx-c0393d' : 'text-green-700'}`}>{formatBRL(x.rendeu)}</div>
            {x.pct !== null && <div className="text-[11.5px] text-gray-400">{(x.pct * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}% sobre o aplicado</div>}</div>
        </div>
        {x.prazos && <AbasPilula abas={[{ key: 'aplicacoes', label: 'Aplicações e vencimentos' }, { key: 'historico', label: 'Histórico' }]} valor={aba} onChange={setAba} variante="claro" altura={30} folga={2} />}
        {aba === 'aplicacoes' && x.prazos ? (
          <div className="space-y-1.5">
            {x.prazos.lotes.length === 0 && <p className="text-sm text-gray-500">Nada aplicado.</p>}
            {x.prazos.lotes.map((l, i) => (
              <div key={i} className="grid grid-cols-[96px_1fr_110px_150px] items-center gap-3 rounded-md border border-gray-200 px-3 py-2 text-[13px]">
                <span className="tabular-nums text-gray-600">{l.data ? formatDate(l.data) : <span className="text-gray-400">sem data</span>}</span>
                <span className="h-1.5 overflow-hidden rounded-full bg-gray-100" title={l.frac !== null ? `${Math.round(l.frac * 100)}% do prazo já passou` : undefined}>
                  {l.frac !== null && <span className="block h-full rounded-full" style={{ width: `${Math.max(3, l.frac * 100)}%`, background: 'var(--serie-sobrou)' }} />}
                </span>
                <span className="text-right tabular-nums text-gray-800">{formatBRL(l.valor)}</span>
                <span className="text-right text-gray-600">
                  {l.vence ? <>{l.vencida ? 'venceu' : 'vence'} <b className="font-semibold text-gray-800">{formatDate(l.vence)}</b>{l.renovacoes > 0 && <span className="block text-[11px] text-gray-400">reaplicou {l.renovacoes}×</span>}</>
                    : <span className="text-[12px] text-gray-400">{l.inicial ? 'sem a data da aplicação' : '—'}</span>}
                </span>
              </div>
            ))}
            <p className="text-xs text-gray-500">
              {x.prazos.lotes.some((l) => l.inicial && !l.data)
                ? 'O que já estava aplicado no cadastro entra como uma aplicação sem data. Com a "data da aplicação" no cadastro (✎), o app sabe quando ela vence.'
                : `Cada aplicação fica ${rotuloPrazo(x.prazos.prazo)}; ${inv.ao_vencer === 'volta' ? 'ao vencer, o dinheiro volta para a conta (lance o resgate).' : 'ao vencer, reaplica sozinha por mais um prazo, sem virar resgate.'}`}
            </p>
          </div>
        ) : (
          linhas.length === 0 ? <p className="text-sm text-gray-500">Nada registrado ainda.</p> : (
            <ul className="max-h-[300px] divide-y divide-gray-100 overflow-auto rounded-md border border-gray-200">
              {linhas.map((h) => (
                <li key={`${h.tipo}${h.id}`} className="flex items-center gap-3 px-3 py-1 text-sm">
                  <span className="w-[84px] shrink-0 tabular-nums text-gray-500">{formatDate(h.data)}</span>
                  <span className="w-[88px] shrink-0">
                    {h.tipo === 'foto' ? <Etiqueta>valor</Etiqueta> : <Etiqueta tom={h.tipo === 'aporte' ? 'verde' : 'ambar'}>{h.tipo === 'aporte' ? 'aplicação' : 'resgate'}</Etiqueta>}
                  </span>
                  <span className="min-w-0 flex-1 truncate tabular-nums text-gray-800">
                    {h.tipo === 'resgate' ? '− ' : h.tipo === 'aporte' ? '+ ' : ''}{formatBRL(h.valor_centavos)}
                    {h.tipo !== 'foto' && h.descricao && <span className="ml-2 text-xs text-gray-400">{h.descricao}</span>}
                  </span>
                  {!movel && <BotaoExcluir titulo="Excluir" onClick={() => apagar(h)} />}
                </li>
              ))}
            </ul>
          )
        )}
        {!movel && (
          <div className="flex flex-wrap items-center gap-2 border-t border-gray-100 pt-3">
            <button type="button" className="text-[13px] font-medium text-gray-600 hover:text-gray-900 hover:underline" onClick={onCadastro}>Editar no cadastro</button>
            <span className="flex-1" />
            {inv.ativo !== false && <button type="button" className="btn-secondary" onClick={() => onAplicar('resgate')}><IcoDesce />Resgatar</button>}
            {inv.ativo !== false && <button type="button" className="btn-primary" onClick={() => onAplicar('aporte')}><IcoSobe />Aplicar</button>}
          </div>
        )}
      </div>
    </Modal>
  );
}

// ------------------------------------------------------------ atualizar valores
// Uma linha por investimento ativo (agrupados por lugar): o valor de antes, as aplicações − resgates desde ele, o
// valor de hoje e o "Rendeu" na hora. O RENDIMENTO FORA DO NORMAL para o tipo (`rendimentoForaDoNormal`) vira o aviso
// "Foi uma aplicação de R$ X?": aceitar lança a aplicação junto com o salvar (e o rendimento se acerta). Enter num
// campo vazio repete o valor de antes ("igual ao anterior") e desce.
export function ModalAtualizarValores({ grupos, valores, movimentos, onFechar, onSalvo }) {
  const toast = useToast();
  const hoje = todayISO();
  const caixaRef = useRef(null);
  const linhas = useMemo(() => grupos.map((g) => ({ g, itens: g.itens.filter((x) => x.inv.ativo !== false) })).filter((l) => l.itens.length), [grupos]);
  const [data, setData] = useState(() => {
    const fimAnterior = ultimoDiaDoMes(addMeses(hoje.slice(0, 7), -1));
    const jaTem = valores.some((f) => f.data >= fimAnterior);
    return Number(hoje.slice(8, 10)) <= 5 && !jaTem ? fimAnterior : hoje;
  });
  const [campos, setCampos] = useState({});
  const [extras, setExtras] = useState({}); // { invId: { tipo, valor } } — a aplicação ou o resgate aceito no aviso
  const [outro, setOutro] = useState({}); // { invId: texto } — "outro valor…" aberto
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);

  const calc = (x) => {
    const fs = valores.filter((f) => f.investimento_id === x.inv.id && f.data < data);
    const antes = fs.reduce((m, f) => (!m || f.data > m.data ? f : m), null);
    const ms = movimentos.filter((m) => m.investimento_id === x.inv.id && m.data > (antes?.data ?? '0000-00-00') && m.data <= data);
    const ex = extras[x.inv.id];
    const liq = ms.reduce((s, m) => s + (m.tipo === 'resgate' ? -1 : 1) * Number(m.valor_centavos), 0) + (ex ? (ex.tipo === 'resgate' ? -ex.valor : ex.valor) : 0);
    const novo = ler(campos[x.inv.id]);
    const a = antes ? Number(antes.valor_centavos) : null;
    const rendeu = novo !== null && a !== null ? novo - a - liq : null;
    const fora = !ex && a !== null && novo !== null ? rendimentoForaDoNormal({ tipo: x.inv.tipo, antes: a, novo, liquido: liq, dias: Math.max(1, diasEntre(antes.data, data)) }) : null;
    return { antes, liq, n: ms.length, novo, rendeu, fora, ex };
  };
  const muda = (id, t) => { setCampos((c) => ({ ...c, [id]: t })); setErro(''); };
  const aoTeclar = (x) => (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    if (vazio(campos[x.inv.id])) { const c = calc(x); if (c.antes) muda(x.inv.id, (Number(c.antes.valor_centavos) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })); }
    const todos = [...caixaRef.current.querySelectorAll('[data-valor-hoje]')];
    todos[todos.indexOf(e.currentTarget) + 1]?.focus();
  };

  const enviar = async (e) => {
    e.preventDefault();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) { setErro('Informe a data.'); return; }
    const itens = [];
    for (const l of linhas) for (const x of l.itens) {
      if (vazio(campos[x.inv.id])) continue;
      const v = ler(campos[x.inv.id]);
      if (v === null || v < 0) { setErro(`Valor inválido em ${x.inv.nome}.`); return; }
      itens.push({ investimento_id: x.inv.id, valor_centavos: v });
    }
    if (!itens.length) { setErro('Preencha ao menos um valor.'); return; }
    setSalvando(true);
    try {
      const todos = linhas.flatMap((l) => l.itens);
      for (const [id, ex] of Object.entries(extras)) {
        const x = todos.find((i) => i.inv.id === id);
        if (x) await lancarMovimento({ conta_id: x.inv.conta_id, investimento_id: id, data, tipo: ex.tipo, valor_centavos: ex.valor, descricao: 'lançado ao atualizar os valores' });
      }
      await registrarValores(data, itens);
      const nEx = Object.keys(extras).length;
      toast.success(`${itens.length} valor(es) de ${formatDate(data)}${nEx ? ` e ${nEx} ${nEx === 1 ? 'movimento' : 'movimentos'}` : ''}.`);
      onSalvo();
    } catch (err) { toast.error(err.message); setSalvando(false); }
  };

  const preenchidos = linhas.reduce((s, l) => s + l.itens.filter((x) => !vazio(campos[x.inv.id])).length, 0);
  const total = linhas.reduce((s, l) => s + l.itens.length, 0);
  const th = 'sticky top-0 z-10 border-b border-gray-200 bg-hx-f9fafb px-3 py-2 text-right text-[10.5px] font-semibold uppercase tracking-wide text-gray-500';
  return (
    <Modal open onClose={onFechar} title="Atualizar valores" subtitulo="quanto cada investimento vale nesta data — o que o app do banco mostra" maxWidth="max-w-4xl">
      <form onSubmit={enviar} className="space-y-4">
        <div className="flex flex-wrap items-end gap-4">
          <Campo rotulo="Data dos valores" className="w-[200px]"><CampoData value={data} onChange={setData} max={hoje} /></Campo>
          <p className="min-w-[240px] flex-1 pb-2 text-xs text-gray-500">O que ficar em branco não muda. Enter num campo vazio repete o valor de antes. Aceita conta: =20000+14000.</p>
        </div>
        <div ref={caixaRef} className="max-h-[56vh] overflow-auto rounded-md border border-gray-200">
          <table className="w-full border-separate border-spacing-0 text-[13px]">
            <thead><tr>
              <th className={`${th} text-left`}>Investimento</th><th className={th}>Antes</th><th className={th}>Aplicações no período</th><th className={th}>Vale hoje</th><th className={th}>Rendeu</th>
            </tr></thead>
            <tbody>
              {linhas.map((l) => (
                <Fragment key={l.g.conta.id}>
                  <tr><td colSpan={5} className="border-b border-gray-100 bg-hx-f9fafb px-3 py-1.5 text-[12.5px] font-semibold text-gray-700">
                    <span className="mr-2 inline-block h-2 w-2 rounded-full align-middle" style={{ background: l.g.cor }} />{l.g.conta.nome}
                  </td></tr>
                  {l.itens.map((x) => {
                    const c = calc(x);
                    const pct = c.rendeu !== null && c.antes ? c.rendeu / (Number(c.antes.valor_centavos) + c.liq / 2) : null;
                    return (
                      <Fragment key={x.inv.id}>
                        <tr className="align-top">
                          <td className="border-b border-gray-100 py-2 pl-7 pr-3"><span className="block max-w-[260px] truncate font-medium text-gray-800">{x.inv.nome}</span>
                            <span className="block text-[11.5px] text-gray-400">{nomeTipoInvestimento(x.inv.tipo)}</span></td>
                          <td className="border-b border-gray-100 px-3 py-2 text-right tabular-nums text-gray-600">
                            {c.antes ? <>{formatBRL(c.antes.valor_centavos)}<span className="block text-[11.5px] text-gray-400">{formatDate(c.antes.data)}</span></> : <span className="text-gray-400">—</span>}
                          </td>
                          <td className="border-b border-gray-100 px-3 py-2 text-right tabular-nums">
                            {c.liq ? <span className={c.liq > 0 ? 'text-green-700' : 'text-amber-700'}>{c.liq > 0 ? '+' : '−'}{formatBRL(Math.abs(c.liq))}</span> : <span className="text-gray-400">—</span>}
                            {c.ex && (
                              <span className="mt-0.5 flex items-center justify-end gap-1 text-[11.5px] text-gray-500">
                                {c.ex.tipo === 'aporte' ? 'aplicação' : 'resgate'} ao salvar
                                <button type="button" className="hover:text-gray-800" aria-label="Desfazer" onClick={() => setExtras((s) => { const n = { ...s }; delete n[x.inv.id]; return n; })}>✕</button>
                              </span>
                            )}
                          </td>
                          <td className="border-b border-gray-100 px-3 py-1.5 text-right">
                            <input data-valor-hoje="" onKeyDown={aoTeclar(x)} className="input !h-8 !w-36 text-right tabular-nums" inputMode="decimal" placeholder="igual ao anterior"
                              value={campos[x.inv.id] ?? ''} onChange={(e) => muda(x.inv.id, e.target.value)} aria-label={`Valor de hoje de ${x.inv.nome}`} />
                          </td>
                          <td className={`whitespace-nowrap border-b border-gray-100 px-3 py-2 text-right tabular-nums ${c.rendeu === null ? 'text-gray-400' : c.fora ? 'text-hx-c0393d' : c.rendeu < 0 ? 'text-hx-c0393d' : 'text-green-700'}`}>
                            {c.rendeu === null ? '—' : formatBRL(c.rendeu)}
                            {pct !== null && <span className="block text-[11.5px] text-gray-400">{(pct * 100).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%{c.fora ? ' · fora do normal' : ''}</span>}
                          </td>
                        </tr>
                        {c.fora && (
                          <tr><td colSpan={5} className="border-b border-gray-100 px-3 pb-2 pt-0">
                            <div className="flex flex-wrap items-center gap-2 rounded-md bg-amber-50 px-3 py-2 text-[12.5px] text-amber-800">
                              <span>Um {nomeTipoInvestimento(x.inv.tipo)} não {c.fora.tipo === 'aporte' ? 'rende' : 'perde'} {(Math.abs(c.fora.pct) * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}% nesse tempo. <b className="font-semibold">Foi {c.fora.tipo === 'aporte' ? 'uma aplicação' : 'um resgate'}?</b></span>
                              <button type="button" className="btn-secondary !h-7 !px-2.5 !text-[12px]" onClick={() => setExtras((s) => ({ ...s, [x.inv.id]: { tipo: c.fora.tipo, valor: c.fora.valor } }))}>
                                Foi {c.fora.tipo === 'aporte' ? 'uma aplicação' : 'um resgate'} de {formatBRL(c.fora.valor)}
                              </button>
                              {outro[x.inv.id] === undefined ? (
                                <button type="button" className="text-[12px] underline-offset-2 hover:underline" onClick={() => setOutro((o) => ({ ...o, [x.inv.id]: '' }))}>outro valor…</button>
                              ) : (
                                <span className="flex items-center gap-1.5">
                                  <input className="input !h-7 !w-28 text-right text-[12px] tabular-nums" autoFocus inputMode="decimal" value={outro[x.inv.id]} placeholder="0,00"
                                    onChange={(e) => setOutro((o) => ({ ...o, [x.inv.id]: e.target.value }))} />
                                  <button type="button" className="btn-secondary !h-7 !px-2.5 !text-[12px]" onClick={() => { const v = ler(outro[x.inv.id]); if (v > 0) setExtras((s) => ({ ...s, [x.inv.id]: { tipo: c.fora.tipo, valor: v } })); }}>usar</button>
                                </span>
                              )}
                              <span className="ml-auto text-[11.5px] text-amber-700">ou corrija o valor</span>
                            </div>
                          </td></tr>
                        )}
                      </Fragment>
                    );
                  })}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
        {erro && <p className="text-sm font-medium text-hx-dc2626">{erro}</p>}
        <div className="mt-5 flex items-center gap-2">
          <span className="text-[12px] text-gray-500">{preenchidos} de {total} preenchidos</span>
          <span className="flex-1" />
          <button type="button" className="btn-secondary" onClick={onFechar}>Cancelar</button>
          <button type="submit" className="btn-primary" disabled={salvando}>{salvando ? 'Salvando…' : 'Salvar os valores'}</button>
        </div>
      </form>
    </Modal>
  );
}
