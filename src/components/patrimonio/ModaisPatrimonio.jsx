import { Fragment, useMemo, useRef, useState } from 'react';
import Modal from '../Modal.jsx';
import CampoData from '../CampoData.jsx';
import SelectSimples from '../SelectSimples.jsx';
import SelectBusca from '../SelectBusca.jsx';
import Toggle from '../Toggle.jsx';
import AbasPilula from '../AbasPilula.jsx';
import Tooltip from '../Tooltip.jsx';
import { CirculoMais, IconAplicar, IconColar, IconDepositos, IconLapis, IconResgatar } from '../icons.jsx';
import { BotaoEditar, BotaoExcluir, Campo, Etiqueta, RodapeForm } from '../Comuns.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { useConfirmacao } from '../../context/ConfirmContext.jsx';
import { atualizarMovimento, excluirConta, excluirMovimento, salvarConta } from '../../api/patrimonio.js';
import { atualizarInvestimento, atualizarValor, criarInvestimento, excluirValor, lancarMovimento, registrarValores, salvarDepositos } from '../../api/investimentos.js';
import { aliquotaIR, diasEntre as diasEntreIR, ehIsento, lerDepositos, planoDosDepositos } from '../../lib/impostoInvestimento.js';
import {
  TIPOS_INVESTIMENTO, nomeTipoInvestimento, padraoDoTipo, pendentesDeValor, rendimentoForaDoNormal, rotuloLiquidez, rotuloPrazo, rotuloRende,
} from '../../lib/investimentos.js';
import { andaSozinho, fatorDoAporte, movimentosForaDosValores, rotuloPeloIndice, valoresComOMovimento } from '../../lib/valorEstimado.js';
import { calcularValor, formatBRL, parseValor } from '../../lib/dinheiro.js';
import { addMeses, formatDate, nomeCompetencia, todayISO } from '../../lib/format.js';

// OS POP-UPS DOS INVESTIMENTOS (06/11/2026, o mockup "Patrimônio do zero"): os dois gestos do dia a dia — APLICAR /
// RESGATAR (o investimento, a data e o valor; o novo investimento nasce ali mesmo) e ATUALIZAR VALORES (quanto cada um
// vale hoje, com o aviso do rendimento fora do normal, que lança a aplicação esquecida) —, a FICHA do investimento (as
// aplicações e quando cada uma vence, o histórico para corrigir) e o LUGAR (o banco ou a corretora). O cadastro em
// tabela mora em `ModalCadastroInvestimentos.jsx`.

const vazio = (t) => !String(t ?? '').trim();
const ler = (t) => (vazio(t) ? null : calcularValor(t));
const doisCampos = 'grid gap-3 sm:grid-cols-2';
const campoValor = (c) => (Number(c) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
const ultimoDiaDoMes = (comp) => { const [y, m] = comp.split('-').map(Number); return `${comp}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, '0')}`; };
const diasEntre = (a, b) => Math.round((Date.UTC(+b.slice(0, 4), +b.slice(5, 7) - 1, +b.slice(8, 10)) - Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10))) / 86400000);

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
      toast.success(conta?.id ? 'Instituição atualizada.' : 'Instituição criada.');
      onSalvo();
    } catch (err) { setErro(/duplicate|unique/i.test(err.message) ? 'Já existe uma instituição com esse nome.' : err.message); setSalvando(false); }
  };
  const excluir = async () => {
    if (!await confirmar({
      titulo: `Excluir "${conta.nome}"?`, perigo: true, confirmar: 'Excluir',
      texto: qtdInvestimentos ? `Os ${qtdInvestimentos} investimento(s) dela, com os valores e as aplicações, também são apagados. Não se desfaz.` : 'Não se desfaz.',
    })) return;
    try { await excluirConta(conta.id); toast.success('Instituição excluída.'); onSalvo(); } catch (err) { toast.error(err.message); }
  };
  return (
    <Modal open onClose={onFechar} title={conta?.id ? 'Editar instituição' : 'Nova instituição'} subtitulo="o banco ou a corretora onde estão os investimentos" maxWidth="max-w-md">
      <form onSubmit={enviar} className="space-y-4">
        <Campo rotulo="Nome" erro={erro}>
          <input className="input" autoFocus value={nome} placeholder="Ex.: Nubank, XP, Inter" onChange={(e) => { setNome(e.target.value); setErro(''); }} />
        </Campo>
        {conta?.id && <Toggle checked={ativa} onChange={setAtiva} rotulo="Ativo (desligue quando não tiver mais nada lá)" />}
        <div className="mt-5 flex items-center gap-2">
          {conta?.id && <button type="button" className="text-[13px] font-medium text-hx-c0393d hover:underline" onClick={excluir}>Excluir instituição</button>}
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
export function ModalMovimento({ inicial, grupos, contas, valores = [], taxas = null, onFechar, onSalvo, z }) {
  const toast = useToast();
  const hoje = todayISO();
  const [tipo, setTipo] = useState(inicial?.tipo ?? 'aporte');
  const [alvo, setAlvo] = useState(inicial?.inv ? inicial.inv.id : '');
  const [novo, setNovo] = useState(null); // { nome, conta_id, tipo } — o investimento que nasce agora
  const [data, setData] = useState(hoje);
  const [valor, setValor] = useState('');
  const [descricao, setDescricao] = useState('');
  const [tudo, setTudo] = useState(false);
  const [jaIncluem, setJaIncluem] = useState(false); // os valores de depois da data já têm este movimento
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);
  const ativas = contas.filter((c) => c.ativa);

  const opcoes = useMemo(() => grupos.flatMap((g) => g.itens.filter((x) => x.inv.ativo !== false).map((x) => ({
    value: x.inv.id, label: [x.inv.nome, rotuloRende(x.inv)].filter(Boolean).join(' · '), grupo: { nome: g.conta.nome, cor: g.cor },
  }))), [grupos]);
  // o investimento que acabou de nascer pelo cadastro pode ainda não estar na carteira (a tela recarrega): vale o `inicial`
  const x = useMemo(() => grupos.flatMap((g) => g.itens).find((i) => i.inv.id === alvo)
    ?? (inicial?.inv && inicial.inv.id === alvo ? { inv: inicial.inv, vale: 0, aplicado: 0, semValor: true } : null), [alvo, grupos, inicial]);
  const v = ler(valor);
  const aplicando = tipo === 'aporte';
  const depois = x && v ? x.aplicado + (aplicando ? v : -v) : null;
  const prazo = (novo ? null : x?.inv.liquidez === 'por_aplicacao' ? Number(x.inv.prazo_meses) : null);
  // OS VALORES DE DEPOIS DA DATA (06/11/2026): com a data antes de valores já registrados, eles não têm este movimento —
  // ao salvar, passam a ter (a aplicação crescida pela taxa até cada um). "Eles já incluem" deixa como estão. O valor do
  // MESMO DIA também (07/11/2026: ele conta como já tendo os movimentos do dia — sem a pergunta, a aplicação de hoje sumia
  // do valor), menos no "Resgatar tudo", que grava o 0 nesse dia.
  const depoisDaData = !novo && x ? valores.filter((f) => f.investimento_id === x.inv.id && !f.estimado && (f.data > data || (f.data === data && (aplicando || !tudo)))) : [];
  const noDia = depoisDaData[0]?.data === data;

  const enviar = async (e) => {
    e.preventDefault();
    if (!novo && !x) { setErro('Escolha o investimento.'); return; }
    if (novo && (!novo.nome.trim() || !novo.conta_id)) { setErro('Dê o nome e a instituição do investimento novo.'); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) { setErro('Informe a data.'); return; }
    if (v === null || !(v > 0)) { setErro('Informe o valor.'); return; }
    if (!novo && !aplicando && x.semValor) { setErro(`${x.inv.nome} ainda não tem dinheiro para resgatar.`); return; }
    setSalvando(true);
    try {
      if (novo) {
        const p = padraoDoTipo(novo.tipo);
        await criarInvestimento({ conta_id: novo.conta_id, nome: novo.nome, tipo: novo.tipo, indexador: p.indexador || null, taxa: p.taxa ? Number(p.taxa) : null, liquidez: p.liquidez },
          { valor_centavos: v, data, comoAporte: true });
        toast.success(`${novo.nome.trim()} cadastrado com a aplicação de ${formatBRL(v)}.`);
      } else {
        await lancarMovimento({ conta_id: x.inv.conta_id, investimento_id: x.inv.id, data, tipo, valor_centavos: v, descricao }, { encerrar: !aplicando && tudo });
        // sem valor ainda: a aplicação é também o valor dele nesse dia (o mesmo que o "Cadastrar e aplicar" faz)
        if (aplicando && x.semValor) await registrarValores(data, [{ investimento_id: x.inv.id, valor_centavos: v }]);
        if (depoisDaData.length && !jaIncluem) {
          for (const f of valoresComOMovimento({ mov: { data, tipo, valor_centavos: v }, fotos: depoisDaData, inv: x.inv, taxas })) await atualizarValor(f.id, { data: f.data, valor_centavos: f.valor_centavos });
        }
        toast.success(`${aplicando ? 'Aplicação' : 'Resgate'} de ${formatBRL(v)} ${aplicando ? 'em' : 'de'} ${x.inv.nome}${!aplicando && tudo ? ' · encerrado' : ''}.`);
      }
      onSalvo();
    } catch (err) { setErro(err.message); setSalvando(false); }
  };

  return (
    <Modal open onClose={onFechar} title={aplicando ? 'Aplicar' : 'Resgatar'} subtitulo={aplicando ? 'dinheiro que entrou num investimento' : 'dinheiro que saiu de um investimento'} maxWidth="max-w-md" z={z}>
      <form onSubmit={enviar} className="space-y-4">
        <AbasPilula abas={[{ key: 'aporte', label: 'Aplicar' }, { key: 'resgate', label: 'Resgatar' }]} valor={tipo}
          onChange={(t) => { setTipo(t); setErro(''); setTudo(false); if (t === 'resgate') setNovo(null); }} variante="claro" cheia altura={32} folga={2} />
        {novo ? (
          <div className="space-y-3 rounded-md border border-gray-200 p-3">
            <div className="flex items-center"><span className="text-[12.5px] font-semibold text-gray-700">Investimento novo</span>
              <button type="button" className="ml-auto text-[12px] text-gray-500 hover:text-gray-800 hover:underline" onClick={() => setNovo(null)}>escolher um que já existe</button></div>
            <input className="input" autoFocus value={novo.nome} placeholder="Nome (ex.: CDB 2 anos)" onChange={(e) => setNovo({ ...novo, nome: e.target.value })} />
            <div className={doisCampos}>
              <SelectSimples value={novo.conta_id} onChange={(c) => setNovo({ ...novo, conta_id: c })} opcoes={ativas.map((c) => ({ value: c.id, label: c.nome }))} placeholder="Instituição" />
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
        {depoisDaData.length > 0 && v > 0 && (
          <div className="space-y-1.5 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[12.5px] text-amber-900">
            <p>{depoisDaData.length === 1 ? `O valor de ${formatDate(depoisDaData[0].data)} (${formatBRL(depoisDaData[0].valor_centavos)}) é ${noDia ? 'do mesmo dia' : 'de depois desta data'}` : `Os ${depoisDaData.length} valores ${noDia ? 'desde' : 'de depois de'} ${formatDate(data)} são ${noDia ? 'do mesmo dia ou de depois' : 'de depois desta data'}`}:
              {jaIncluem ? ' ficam como estão.' : ` passa${depoisDaData.length === 1 ? '' : 'm'} a incluir ${aplicando ? 'esta aplicação' : 'este resgate'}${andaSozinho(x.inv) && taxas ? ` (com o rendimento ${rotuloPeloIndice(x.inv)} até lá)` : ''}.`}</p>
            <label className="flex cursor-pointer items-center gap-2"><input type="checkbox" checked={jaIncluem} onChange={(e) => setJaIncluem(e.target.checked)} />
              {depoisDaData.length === 1 ? 'Ele já inclui' : 'Eles já incluem'} {aplicando ? 'esta aplicação' : 'este resgate'}</label>
          </div>
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
// O que ele é, os QUATRO NÚMEROS (com o LÍQUIDO ≈) e as abas — o mockup "Ficha do investimento" (06/11/2026, as opções
// A): o hover num número ACENDE A COLUNA dele na lista dos depósitos (e o cabeçalho da coluna acende o número), e a
// linha de baixo do número vira a conta; a lista ganha a altura da ficha; as QUEDAS DO IR têm ABA PRÓPRIA (o resumo, a
// escada do imposto e as quedas por mês — antes ficavam embaixo da lista, que encolhia); EDITAR NO CADASTRO e COLAR OS
// DEPÓSITOS são os ÍCONES do cabeçalho (o grupo do DRE, ao lado do ✕), e o rodapé fica com Resgatar e Aplicar (as moedas
// − e +). Abas: DEPÓSITOS E IR, QUEDAS DO IR, VENCIMENTOS (no "prazo por aplicação") e o HISTÓRICO (os valores e os
// movimentos, com o ✕ para corrigir). Sem dinheiro ainda (`semValor`, o cadastrado sem os valores): o convite para
// aplicar (dinheiro novo) ou colar os depósitos (o que já estava aplicado).
const TOM_ALIQ = { 0.225: 'vermelho', 0.2: 'ambar', 0.175: 'cinza', 0.15: 'verde' };
const pctA = (a) => `${(a * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
const MES3 = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const utcDe = (iso) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
const ICONE_CAB = 'flex h-8 w-[34px] items-center justify-center text-gray-600 transition-colors hover:bg-gray-50 hover:text-gray-900 active:bg-gray-200';

// AS QUEDAS DO IR: se não resgatar nada, o IR de hoje cai em cada data em que um depósito muda de faixa. A escada é o IR
// de hoje menos cada queda (sem o rendimento que ainda vem, que soma IR de novo — a nota diz), e embaixo as quedas por mês.
function QuedasDoIR({ imp, hoje }) {
  const qs = imp.quedas;
  const eco = qs.reduce((s, q) => s + q.menos, 0);
  const ir = imp.ir ?? 0;
  const fim = qs[qs.length - 1].data;
  const W = 640; const H = 136; const E = 8; const D = 96; const TOP = 24; const BOT = 24;
  const t0 = utcDe(hoje); const t1 = Math.max(utcDe(fim) + 12 * 86400000, t0 + 30 * 86400000);
  const X = (iso) => E + ((utcDe(iso) - t0) / (t1 - t0)) * (W - E - D);
  const pad = Math.max(1, eco * 0.18);
  const Y = (v) => TOP + ((ir + pad - v) / (eco + 2 * pad)) * (H - TOP - BOT);
  let v = ir;
  const pts = [[X(hoje), Y(v)]];
  const marcas = [];
  qs.forEach((q) => { const x = X(q.data); pts.push([x, Y(v)]); v -= q.menos; pts.push([x, Y(v)]); marcas.push({ x, y: Y(v), q }); });
  pts.push([W - D, Y(v)]);
  const linha = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  const area = `${linha} L${W - D} ${H - BOT} L${E} ${H - BOT} Z`;
  // os meses embaixo: um a cada `passo` quando não cabem (cada rótulo pede ~44px)
  const meses = [];
  for (let y = +hoje.slice(0, 4), m = +hoje.slice(5, 7) + 1; ; m += 1) {
    if (m > 12) { m = 1; y += 1; }
    const iso = `${y}-${String(m).padStart(2, '0')}-01`;
    if (utcDe(iso) > t1) break;
    meses.push(iso);
  }
  const passo = Math.max(1, Math.ceil((meses.length * 44) / (W - E - D)));
  const porMes = [];
  qs.forEach((q) => { const m = q.data.slice(0, 7); let g = porMes[porMes.length - 1]; if (!g || g.m !== m) porMes.push(g = { m, qs: [] }); g.qs.push(q); });
  const verde = { stroke: 'var(--serie-entradas)' };
  return (
    <div className="space-y-3">
      <p className="text-[13px] text-gray-600">
        Sem resgatar nada, o IR de hoje (<b className="font-semibold text-gray-800">{formatBRL(ir)}</b>) cai{' '}
        <b className="font-semibold text-green-700">{formatBRL(eco)}</b> em {qs.length} {qs.length === 1 ? 'queda' : 'quedas'}, até {formatDate(fim)}.
        <span className="text-gray-400"> O rendimento que ainda vem soma IR de novo, um pouco.</span>
      </p>
      <div className="rounded-md border border-gray-200 px-3 pb-1 pt-2">
        <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-label={`O IR de hoje cai de ${formatBRL(ir)} para ${formatBRL(ir - eco)} até ${formatDate(fim)}`}>
          <line x1={E} x2={W - D} y1={H - BOT} y2={H - BOT} className="stroke-current text-gray-200" />
          <path d={area} style={{ fill: 'var(--serie-entradas)', fillOpacity: 0.1 }} />
          <path d={linha} fill="none" strokeWidth="2" strokeLinejoin="round" style={verde} />
          {marcas.map((p, i) => (
            <circle key={i} cx={p.x} cy={p.y} r="3" strokeWidth="2" className="fill-current text-white" style={verde}>
              <title>{`${formatDate(p.q.data)}: o aporte de ${formatDate(p.q.deposito)} passa de ${pctA(p.q.de)} para ${pctA(p.q.para)} · −${formatBRL(p.q.menos)}`}</title>
            </circle>
          ))}
          <text x={E + 2} y={Y(ir) - 8} className="fill-current text-gray-800 text-[12px] font-semibold tabular-nums">{formatBRL(ir)}</text>
          <text x={W - D + 8} y={Y(ir - eco) + 4} className="fill-current text-gray-800 text-[12px] font-semibold tabular-nums">{formatBRL(ir - eco)}</text>
          <text x={E} y={H - 7} className="fill-current text-gray-400 text-[11px]">hoje</text>
          {meses.map((m, i) => (meses.length - 1 - i) % passo === 0 && X(m) > E + 34 && (
            <text key={m} x={X(m)} y={H - 7} textAnchor="middle" className="fill-current text-gray-400 text-[11px]">{MES3[+m.slice(5, 7) - 1]}/{m.slice(2, 4)}</text>
          ))}
        </svg>
      </div>
      {porMes.map((g) => (
        <div key={g.m} className="overflow-hidden rounded-md border border-gray-200">
          <div className="flex justify-between bg-hx-f9fafb px-3 py-1.5 text-[12px] font-semibold text-gray-600">
            <span>{nomeCompetencia(g.m)}</span>
            <span className="tabular-nums text-green-700">−{formatBRL(g.qs.reduce((s, q) => s + q.menos, 0))}</span>
          </div>
          <ul className="divide-y divide-dashed divide-gray-200">
            {g.qs.map((q, i) => (
              <li key={i} className="grid grid-cols-[88px_minmax(0,1fr)_auto] items-center gap-3 px-3 py-1.5 text-[12.5px]">
                <b className="font-semibold tabular-nums text-gray-800">{formatDate(q.data)}</b>
                <span className="min-w-0 text-gray-600">o aporte de {formatDate(q.deposito)} ({formatBRL(q.vale)}) passa de{' '}
                  <Etiqueta tom={TOM_ALIQ[q.de] ?? 'cinza'}>{pctA(q.de)}</Etiqueta> para <Etiqueta tom={TOM_ALIQ[q.para] ?? 'cinza'}>{pctA(q.para)}</Etiqueta></span>
                <span className="whitespace-nowrap font-semibold tabular-nums text-green-700">−{formatBRL(q.menos)}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

export function FichaInvestimento({ x, lugar, valores, movimentos, depositos = [], comDepositos, taxas = null, movel, onFechar, onAplicar, onCadastro, onMudou }) {
  const toast = useToast();
  const confirmar = useConfirmacao();
  const hoje = todayISO();
  const imp = x.imposto;
  const temDep = !x.semValor && !!imp && !imp.semEstimativa;
  const temQuedas = temDep && !imp.semDatas && !imp.isento && imp.quedas.length > 0;
  const [aba, setAba] = useState(temDep ? 'depositos' : x.prazos ? 'aplicacoes' : 'historico');
  const [colando, setColando] = useState(false);
  const [editando, setEditando] = useState(null); // a linha do histórico aberta no ✎
  // OS MOVIMENTOS QUE OS VALORES NÃO TÊM (06/11/2026): lançados depois de um valor e com a data antes dele
  const fora = movimentosForaDosValores({ valores, movimentos });
  const [acertando, setAcertando] = useState(false);
  const acertar = async (f, somar) => {
    setAcertando(true);
    try {
      // "Já estava": grava o mesmo valor (o `atualizado_em` muda e o aviso some); "Somar": o valor com o movimento
      const novos = somar ? valoresComOMovimento({ mov: f.mov, fotos: f.fotos, inv: x.inv, taxas }) : f.fotos.map((v) => ({ id: v.id, data: v.data, valor_centavos: Number(v.valor_centavos) }));
      for (const n of novos) await atualizarValor(n.id, { data: n.data, valor_centavos: n.valor_centavos });
      toast.success(somar ? 'Os valores de depois passaram a incluir o movimento.' : 'Pronto: os valores ficam como estão.');
      onMudou();
    } catch (err) { toast.error(err.message); }
    setAcertando(false);
  };
  const [foco, setFoco] = useState(null); // a coluna acesa pelo número (ou pelo cabeçalho dela)
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
  const abas = [
    ...(temDep ? [{ key: 'depositos', label: 'Aportes e IR', qtd: imp.semDatas ? undefined : imp.lotes.length }] : []),
    ...(temQuedas ? [{ key: 'quedas', label: 'Quedas do IR', qtd: imp.quedas.length }] : []),
    ...(x.prazos ? [{ key: 'aplicacoes', label: 'Vencimentos' }] : []),
    { key: 'historico', label: 'Histórico' },
  ];
  const ir = imp ? (imp.ir ?? 0) + (imp.iof ?? 0) : 0;
  const podeColar = comDepositos && !imp?.semEstimativa;
  const lotes = temDep && !imp.semDatas ? imp.lotes : [];
  const soma = (k) => lotes.reduce((s, l) => s + (l[k] ?? 0), 0);
  const naLista = aba === 'depositos' && lotes.length > 0;

  // os quatro números: o valor, a linha de sempre e, no hover, a conta (e a coluna da lista que ele soma)
  const numeros = [
    { k: 'depositado', rotulo: 'Aplicado', valor: formatBRL(x.aplicado), cor: 'text-gray-800',
      sub: 'o que foi depositado', conta: lotes.length ? `= o depositado ≈ dos ${lotes.length}` : '= o cadastro + aplicações − resgates' },
    { k: 'vale', rotulo: 'Vale hoje', valor: x.semValor ? '—' : formatBRL(x.vale), cor: 'text-gray-900',
      sub: x.estimado ? `≈ ${rotuloPeloIndice(inv)} até hoje · foto real de ${formatDate(x.estimado.base.data).slice(0, 5)}` : x.data ? `bruto · foto de ${formatDate(x.data)}` : 'sem valor ainda',
      conta: x.estimado ? `= a foto real + o que rendeu ${rotuloPeloIndice(inv)} de cada dia` : lotes.length ? `= a soma dos ${lotes.length} aportes` : 'o último valor registrado' },
    { k: 'ganho', rotulo: 'Rendeu', valor: formatBRL(x.rendeu), cor: x.rendeu < 0 ? 'text-hx-c0393d' : 'text-green-700',
      sub: x.pct !== null ? `${(x.pct * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}% sobre o aplicado` : '', conta: '= vale hoje − aplicado' },
    { k: 'ir', rotulo: 'Líquido ≈', valor: x.semValor || imp?.semEstimativa || imp?.semDatas ? '—' : formatBRL(imp?.liquido ?? x.vale), cor: 'text-gray-900',
      sub: !imp || imp.semEstimativa ? 'sem estimativa' : imp.semDatas ? 'faltam as datas dos aportes' : imp.isento ? 'isento de IR' : `IR ≈ ${formatBRL(ir)} se resgatar hoje`,
      conta: imp?.isento ? 'isento: o líquido é o bruto' : '= vale hoje − o IR ≈ de cada aporte' },
  ];
  const acesa = (k) => (naLista && foco === k ? 'gm-acesa' : '');
  const th = 'border-b border-gray-200 bg-hx-f9fafb px-2.5 py-1.5 text-right text-[10.5px] font-semibold uppercase tracking-wide text-gray-500';
  const td = 'border-b border-gray-100 px-2.5 py-1.5 text-right tabular-nums';
  const cab = (k, txt, esq) => (
    <th className={`${th} ${esq ? 'text-left' : ''} ${acesa(k)} ${foco === k && naLista ? '!text-gray-800' : ''}`} onMouseEnter={() => setFoco(k)} onMouseLeave={() => setFoco(null)}>{txt}</th>
  );
  const acoesCab = !movel && (
    <div className="inline-flex overflow-hidden rounded-md border border-gray-300 bg-white">
      <Tooltip label="Editar no cadastro">
        <button type="button" aria-label="Editar no cadastro" onClick={onCadastro} className={ICONE_CAB}><IconLapis className="h-3.5 w-3.5" /></button>
      </Tooltip>
      {podeColar && (
        <Tooltip label={depositos.length ? `Os aportes de antes do app (${depositos.length})` : 'Os aportes de antes do app (digitar ou colar do banco)'}>
          <button type="button" aria-label="Os aportes de antes do app" onClick={() => setColando(true)} className={`${ICONE_CAB} border-l border-gray-200`}><IconDepositos /></button>
        </Tooltip>
      )}
    </div>
  );
  return (
    <Modal open onClose={onFechar} title={inv.nome} maxWidth="max-w-[900px]" acoes={acoesCab}
      subtitulo={[lugar, nomeTipoInvestimento(inv.tipo), rotuloRende(inv), rotuloLiquidez(inv) + (inv.liquidez === 'por_aplicacao' ? (inv.ao_vencer === 'volta' ? ' · volta ao vencer' : ' · reaplica sozinho') : '')].filter(Boolean).join(' · ')}>
      <div className="space-y-4">
        {!movel && fora.map((f) => {
          const novos = valoresComOMovimento({ mov: f.mov, fotos: f.fotos, inv: x.inv, taxas });
          const aplic = f.mov.tipo !== 'resgate';
          const semTaxas = andaSozinho(x.inv) && !taxas; // o CDI ainda não chegou: somar agora perderia o rendimento
          return (
            <div key={f.mov.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5 text-[12.5px] text-amber-900">
              <span className="min-w-0 flex-1">
                <b className="font-semibold">{aplic ? 'A aplicação' : 'O resgate'} de {formatDate(f.mov.data)} ({formatBRL(f.mov.valor_centavos)})</b> foi lançad{aplic ? 'a' : 'o'} depois
                {f.fotos.length === 1 ? ` do valor de ${formatDate(f.fotos[0].data)} (${formatBRL(f.fotos[0].valor_centavos)})` : ` dos ${f.fotos.length} valores de depois dele`}, que não {f.fotos.length === 1 ? 'a tem' : 'a têm'}.
                {novos.length === 1 && !semTaxas && ` Somada${andaSozinho(x.inv) ? ` com o rendimento ${rotuloPeloIndice(x.inv)}` : ''}, ele fica ${formatBRL(novos[0].valor_centavos)}.`}
              </span>
              <span className="flex gap-2">
                <button type="button" className="btn-secondary !h-8 !text-[12.5px]" disabled={acertando} onClick={() => acertar(f, false)}>Já estava incluíd{aplic ? 'a' : 'o'}</button>
                <button type="button" className="btn-primary !h-8 !text-[12.5px]" disabled={acertando || semTaxas} onClick={() => acertar(f, true)} title={semTaxas ? 'Esperando o CDI do Banco Central (para somar com o rendimento)' : undefined}>{semTaxas ? 'Carregando o CDI…' : 'Somar aos valores de depois'}</button>
              </span>
            </div>
          );
        })}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {numeros.map((n) => (
            <div key={n.k} onMouseEnter={() => setFoco(n.k)} onMouseLeave={() => setFoco(null)}
              className={`rounded-md border px-3 py-2 transition-[background-color,border-color,box-shadow] duration-150 ${foco === n.k ? 'border-gray-300 bg-hx-f9fafb shadow-sm' : 'border-gray-200'}`}>
              <div className="text-[11px] font-medium uppercase tracking-wide text-gray-500">{n.rotulo}</div>
              <div className={`text-[17px] font-semibold tabular-nums ${n.cor}`}>{n.valor}</div>
              <div className="min-h-[18px] truncate text-[11.5px] text-gray-400">{foco === n.k ? <span className="text-gray-600">{n.conta}</span> : n.sub}</div>
            </div>
          ))}
        </div>

        {x.semValor ? (
          <div className="rounded-md border border-dashed border-gray-300 px-4 py-5 text-center">
            <p className="text-[13.5px] font-semibold text-gray-800">Ainda sem dinheiro</p>
            <p className="mx-auto mt-1 max-w-[520px] text-[12.5px] leading-relaxed text-gray-600">
              O dinheiro entra como aporte, com data: pelo Aplicar, se é dinheiro novo, ou pela lista de aportes do banco, se já estava aplicado.
            </p>
            {!movel && (
              <div className="mt-3 flex flex-wrap justify-center gap-2">
                {podeColar && <button type="button" className="btn-secondary" onClick={() => setColando(true)}><IconDepositos />Já estava aplicado: os aportes</button>}
                <button type="button" className="btn-primary" onClick={() => onAplicar('aporte')}><IconAplicar />Aplicar</button>
              </div>
            )}
          </div>
        ) : (
          <>
            {abas.length > 1 && <AbasPilula abas={abas} valor={aba} onChange={setAba} variante="claro" altura={30} folga={2} qtdSolta />}

            {aba === 'depositos' && imp?.semDatas && (
              <div className="rounded-md border border-dashed border-gray-300 px-4 py-5 text-center">
                <p className="text-[13.5px] font-semibold text-gray-800">Faltam as datas dos aportes</p>
                <p className="mx-auto mt-1 max-w-[520px] text-[12.5px] leading-relaxed text-gray-600">
                  O IR de cada aporte depende da idade dele (22,5% até 180 dias … 15% depois de 720). Informe a data e o valor de cada aporte
                  (digitando, ou colando a lista do banco) e o app calcula o imposto e o líquido de cada um, e quando cada alíquota cai.
                </p>
                {!movel && podeColar && <button type="button" className="btn-primary mt-3" onClick={() => setColando(true)}><IconDepositos />Informar os aportes</button>}
                {!comDepositos && <p className="mt-2 text-[12px] text-amber-700">Falta aplicar a migration 016 (os aportes).</p>}
              </div>
            )}
            {aba === 'depositos' && lotes.length > 0 && (
              <div className="space-y-2">
                {/* A LISTA COM A ALTURA DA FICHA: o que sobra de 90% da tela depois do cabeçalho, dos números, das abas e do rodapé */}
                <div className="max-h-[calc(90vh-340px)] min-h-[200px] overflow-auto rounded-md border border-gray-200">
                  <table className="w-full border-separate border-spacing-0 text-[12.5px]">
                    <thead className="sticky top-0 z-[1]"><tr>
                      {cab('data', 'Aporte', true)}{cab('vale', 'Vale hoje')}{cab('depositado', 'Aportado ≈')}{cab('ganho', 'Rendeu ≈')}
                      {cab('aliquota', 'Alíquota', true)}{cab('cai', 'Quando cai', true)}{cab('ir', 'IR ≈')}
                    </tr></thead>
                    <tbody>
                      {lotes.map((l, i) => (
                        <tr key={i} className="hover:bg-hx-f9fafb">
                          <td className={`${td} text-left text-gray-700 ${acesa('data')}`}>{formatDate(l.data)}{l.dataAproximada && <span className="ml-1 text-gray-400" title="Sem a data da aplicação">≈</span>}
                            <span className="block text-[11px] text-gray-400">{l.dias} {l.dias === 1 ? 'dia' : 'dias'}{l.origem === 'aporte' ? ' · pelo app' : ''}</span></td>
                          <td className={`${td} font-medium text-gray-900 ${acesa('vale')}`}>{formatBRL(l.vale)}</td>
                          <td className={`${td} text-gray-600 ${acesa('depositado')}`}>{formatBRL(l.depositado)}</td>
                          <td className={`${td} text-green-700 ${acesa('ganho')}`}>{formatBRL(l.ganho)}</td>
                          <td className={`${td} text-left ${acesa('aliquota')}`}>{imp.isento ? <Etiqueta tom="verde">isento</Etiqueta> : <Etiqueta tom={TOM_ALIQ[l.aliquota] ?? 'cinza'}>{pctA(l.aliquota)}</Etiqueta>}</td>
                          <td className={`${td} text-left text-gray-600 ${acesa('cai')}`}>{imp.isento ? '—' : l.proxima ? <><b className="font-semibold text-gray-800">{formatDate(l.proxima.data)}</b> → {pctA(l.proxima.aliquota)}</> : <span className="text-gray-400">já na menor</span>}</td>
                          <td className={`${td} text-gray-800 ${acesa('ir')}`}>{formatBRL(l.ir + l.iof)}{l.iof > 0 && <span className="block text-[10.5px] text-gray-400">com IOF</span>}</td>
                        </tr>
                      ))}
                    </tbody>
                    {lotes.length > 1 && (
                      <tfoot className="sticky bottom-0 z-[1]"><tr className="font-semibold">
                        <td className={`border-t border-gray-200 bg-hx-f9fafb px-2.5 py-1.5 text-left text-gray-800 ${acesa('data')}`}>{lotes.length} aportes</td>
                        <td className={`border-t border-gray-200 bg-hx-f9fafb px-2.5 py-1.5 text-right tabular-nums text-gray-900 ${acesa('vale')}`}>{formatBRL(soma('vale'))}</td>
                        <td className={`border-t border-gray-200 bg-hx-f9fafb px-2.5 py-1.5 text-right tabular-nums text-gray-700 ${acesa('depositado')}`}>{formatBRL(soma('depositado'))}</td>
                        <td className={`border-t border-gray-200 bg-hx-f9fafb px-2.5 py-1.5 text-right tabular-nums text-green-700 ${acesa('ganho')}`}>{formatBRL(soma('ganho'))}</td>
                        <td colSpan={2} className={`border-t border-gray-200 bg-hx-f9fafb px-2.5 py-1.5 text-left text-[12px] font-normal text-gray-500 ${acesa('aliquota')}`}>
                          {imp.isento ? 'isento' : imp.ganho > 0 ? `${pctA(imp.aliquotaMedia)} na média` : ''}</td>
                        <td className={`border-t border-gray-200 bg-hx-f9fafb px-2.5 py-1.5 text-right tabular-nums text-gray-900 ${acesa('ir')}`}>{formatBRL(soma('ir') + soma('iof'))}</td>
                      </tr></tfoot>
                    )}
                  </table>
                </div>
                <p className="text-xs text-gray-500">
                  ≈ estimado: o rendimento de cada aporte sai do CDI desde a data dele, ajustado ao que o investimento vale e ao que foi aplicado.
                  {lotes.some((l) => l.dataAproximada) && ' Sem a data das aplicações antigas, a idade conta do cadastro: cole a lista de aportes do banco para o IR de cada um.'}
                </p>
              </div>
            )}
            {aba === 'quedas' && temQuedas && <QuedasDoIR imp={imp} hoje={hoje} />}
            {aba === 'aplicacoes' && x.prazos && (
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
                      {l.vence ? <>{l.vencida ? 'venceu' : 'vence'} <b className="font-semibold text-gray-800">{formatDate(l.vence)}</b>{l.renovacoes > 0 && <span className="block text-[11px] text-gray-400">reaplicou {l.renovacoes}×</span>}{l.propria && <span className="block text-[11px] text-gray-400">digitado</span>}</>
                        : <span className="text-[12px] text-gray-400">{l.inicial ? 'sem a data da aplicação' : '—'}</span>}
                    </span>
                  </div>
                ))}
                {x.prazos.prazo ? <p className="text-xs text-gray-500">{`Cada aplicação fica ${rotuloPrazo(x.prazos.prazo)}; ${inv.ao_vencer === 'volta' ? 'ao vencer, o dinheiro volta para a conta (lance o resgate).' : 'ao vencer, reaplica sozinha por mais um prazo, sem virar resgate.'}`} O vencimento digitado num aporte (na tabela) vale como está.</p>
                  : <p className="text-xs text-gray-500">O vencimento de cada aporte: o digitado na tabela (a célula Resgate da linha dele), ou o do investimento.</p>}
              </div>
            )}
            {aba === 'historico' && (
              linhas.length === 0 ? <p className="text-sm text-gray-500">Nada registrado ainda.</p> : (
                <ul className="max-h-[calc(90vh-340px)] min-h-[160px] divide-y divide-gray-100 overflow-auto rounded-md border border-gray-200">
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
                      {!movel && <BotaoEditar titulo={h.tipo === 'foto' ? 'Editar este valor' : `Editar est${h.tipo === 'aporte' ? 'a aplicação' : 'e resgate'}`} onClick={() => setEditando(h)} />}
                      {!movel && <BotaoExcluir titulo="Excluir" onClick={() => apagar(h)} />}
                    </li>
                  ))}
                </ul>
              )
            )}
          </>
        )}
        {!movel && inv.ativo !== false && !x.semValor && (
          <div className="flex items-center justify-end gap-2 border-t border-gray-100 pt-3">
            <button type="button" className="btn-secondary" onClick={() => onAplicar('resgate')}><IconResgatar />Resgatar</button>
            <button type="button" className="btn-primary" onClick={() => onAplicar('aporte')}><IconAplicar />Aplicar</button>
          </div>
        )}
      </div>
      {editando && <ModalEditarRegistro h={editando} valores={valores} onFechar={() => setEditando(null)} onSalvo={() => { setEditando(null); onMudou(); }} />}
      {colando && <ModalDepositos inv={inv} semValor={x.semValor} vale={x.vale} dataVale={x.data} depositos={depositos} taxas={taxas} onFechar={() => setColando(false)} onSalvo={() => { setColando(false); onMudou(); }} />}
    </Modal>
  );
}

// ------------------------------------------------------------ editar uma linha do histórico
// EDITAR UMA APLICAÇÃO, UM RESGATE OU UM VALOR (06/11/2026, a pedido: antes só se excluía). A data, o valor e — no
// movimento — o tipo e a observação. A APLICAÇÃO FEITA JUNTO COM A PRIMEIRA FOTO (o "Cadastrar e aplicar": a foto e a
// aplicação no mesmo dia e com o mesmo valor) leva a foto junto, para os dois continuarem iguais.
export function ModalEditarRegistro({ h, valores = [], onFechar, onSalvo }) {
  const toast = useToast();
  const hoje = todayISO();
  const foto = h.tipo === 'foto';
  const [data, setData] = useState(h.data);
  const [tipo, setTipo] = useState(foto ? 'foto' : h.tipo);
  const [valor, setValor] = useState(campoValor(h.valor_centavos));
  const [descricao, setDescricao] = useState(h.descricao ?? '');
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);
  // a foto que nasceu junto com esta aplicação (o mesmo dia e o mesmo valor)
  const gemea = !foto && h.tipo === 'aporte' ? valores.find((f) => f.data === h.data && Number(f.valor_centavos) === Number(h.valor_centavos)) : null;
  const enviar = async (e) => {
    e.preventDefault();
    const v = calcularValor(valor);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) { setErro('Informe a data.'); return; }
    if (v === null || !(foto ? v >= 0 : v > 0)) { setErro('Informe o valor.'); return; }
    setSalvando(true);
    try {
      if (foto) await atualizarValor(h.id, { data, valor_centavos: v });
      else {
        await atualizarMovimento(h.id, { data, valor_centavos: v, tipo, descricao: descricao.trim() });
        if (gemea && tipo === 'aporte') await atualizarValor(gemea.id, { data, valor_centavos: v });
      }
      toast.success(foto ? 'Valor corrigido.' : `${tipo === 'aporte' ? 'Aplicação' : 'Resgate'} corrigid${tipo === 'aporte' ? 'a' : 'o'}${gemea && tipo === 'aporte' ? ' (e o valor do mesmo dia)' : ''}.`);
      onSalvo();
    } catch (err) {
      setErro(/duplicate|unique/i.test(err.message) ? 'Já existe um valor nessa data: mude a data ou exclua o outro.' : err.message);
      setSalvando(false);
    }
  };
  return (
    <Modal open onClose={onFechar} title={foto ? 'Editar o valor' : `Editar ${h.tipo === 'aporte' ? 'a aplicação' : 'o resgate'}`} subtitulo={`de ${formatDate(h.data)} · ${formatBRL(h.valor_centavos)}`} maxWidth="max-w-md" z="z-[70]">
      <form onSubmit={enviar} className="space-y-4">
        {!foto && (
          <AbasPilula abas={[{ key: 'aporte', label: 'Aplicação' }, { key: 'resgate', label: 'Resgate' }]} valor={tipo} onChange={(x) => { setTipo(x); setErro(''); }} variante="claro" cheia altura={32} folga={2} />
        )}
        <div className={doisCampos}>
          <Campo rotulo="Data"><CampoData value={data} onChange={(x) => { setData(x); setErro(''); }} max={hoje} /></Campo>
          <Campo rotulo={foto ? 'Valia' : 'Valor'}>
            <input className="input text-right tabular-nums" inputMode="decimal" autoFocus value={valor} onChange={(e) => { setValor(e.target.value); setErro(''); }} />
          </Campo>
        </div>
        {!foto && (
          <Campo rotulo="Observação (opcional)"><input className="input" value={descricao} onChange={(e) => setDescricao(e.target.value)} /></Campo>
        )}
        {gemea && tipo === 'aporte' && <p className="rounded-md bg-hx-f9fafb px-3 py-2 text-[12.5px] text-gray-600">É a aplicação do dia em que o investimento começou: o valor desse dia muda junto.</p>}
        {erro && <p className="text-sm font-medium text-hx-dc2626">{erro}</p>}
        <RodapeForm onCancelar={onFechar} salvando={salvando} rotulo="Salvar" />
      </form>
    </Modal>
  );
}

// ------------------------------------------------------------ os depósitos de antes do app
// O DINHEIRO QUE JÁ ESTAVA APLICADO (06/11/2026, o mockup aprovado "Depósitos de antes", opções A): uma TABELA de depósitos,
// a data e o valor de cada um, DIGITADA — Enter desce, "Adicionar depósito" acrescenta, ✕ tira, e o IR de hoje de cada
// um aparece na linha. "Colar do banco" é um ATALHO: a tela "Detalhes dos depósitos" colada como texto (`lerDepositos`)
// PREENCHE a mesma tabela, que dá para corrigir antes de salvar. Em cima, o que os valores são: "o que foi depositado"
// (o padrão ao digitar: a referência de cada um é a própria data) ou "o que vale hoje" (o que o banco mostra numa data;
// colar passa a ele sozinho). Embaixo, o "valor aplicado" (a soma, no depositado; o do banco, no "vale hoje") e, no
// investimento sem valor ainda, o "vale hoje" (vazio: a estimativa pelo CDI). A conta é `planoDosDepositos` (testada).
// Salvar substitui a lista anterior.
let seqDep = 0;
const linhaDep = (data = '', valor = '') => { seqDep += 1; return { k: `d${seqDep}`, data, valor }; };

export function ModalDepositos({ inv, semValor = false, vale, dataVale, depositos = [], taxas = null, onFechar, onSalvo }) {
  const toast = useToast();
  const hoje = todayISO();
  const caixaRef = useRef(null);
  const colados = depositos.length > 0 && depositos.some((d) => d.referencia !== d.data);
  const [modo, setModo] = useState(colados ? 'hoje' : 'depositado');
  const [referencia, setReferencia] = useState(depositos[0]?.referencia && colados ? depositos[0].referencia : (dataVale && dataVale <= hoje ? dataVale : hoje));
  const [linhas, setLinhas] = useState(() => (depositos.length ? depositos.map((d) => linhaDep(d.data, campoValor(d.valor_centavos))) : [linhaDep()]));
  const [aplicado, setAplicado] = useState(inv.aplicado_inicial_centavos !== null && inv.aplicado_inicial_centavos !== undefined ? campoValor(inv.aplicado_inicial_centavos) : '');
  const [valeHoje, setValeHoje] = useState('');
  const [colar, setColar] = useState(false);
  const [texto, setTexto] = useState('');
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);

  const muda = (k, campo, v) => { setLinhas((ls) => ls.map((l) => (l.k === k ? { ...l, [campo]: v } : l))); setErro(''); };
  const tirar = (k) => setLinhas((ls) => (ls.length > 1 ? ls.filter((l) => l.k !== k) : [linhaDep()]));
  const focar = (sel) => setTimeout(() => caixaRef.current?.querySelector(sel)?.focus(), 30);
  const adicionar = () => { const l = linhaDep(); setLinhas((ls) => [...ls, l]); focar(`[data-dep="${l.k}"][data-col="data"] input`); };
  // Enter desce na mesma coluna; no fim da tabela, uma linha nova
  const aoTeclar = (e) => {
    if (e.key !== 'Enter') return;
    const cel = e.target.closest('[data-col]');
    if (!cel) return;
    e.preventDefault();
    const col = cel.dataset.col;
    const todas = [...caixaRef.current.querySelectorAll(`[data-col="${col}"]`)];
    const prox = todas[todas.indexOf(cel) + 1];
    if (prox) (prox.querySelector('input') ?? prox).focus();
    else adicionar();
  };
  // colar do banco: o texto PREENCHE a tabela (o que já estava digitado fica, as linhas vazias saem)
  const preencher = (t) => {
    const { itens } = lerDepositos(t, parseValor);
    if (!itens.length) { setErro('Nada lido no texto colado: ele precisa ter a data e o valor de cada aporte.'); return; }
    setLinhas((ls) => [...ls.filter((l) => l.data || String(l.valor).trim()), ...itens.map((i) => linhaDep(i.data, campoValor(i.valor_centavos)))]);
    setModo('hoje');
    setTexto(''); setColar(false);
    toast.success(`${itens.length} ${itens.length === 1 ? 'aporte' : 'aportes'} na tabela: confira e salve.`);
  };

  const lidas = linhas.map((l) => ({ ...l, v: String(l.valor).trim() ? calcularValor(l.valor) : null }));
  const soma = lidas.reduce((s, l) => s + (l.v > 0 ? l.v : 0), 0);
  const n = lidas.filter((l) => l.data && l.v > 0).length;
  // no depositado e sem valor ainda: o "vale hoje" estimado pela taxa de cada dia desde cada depósito
  const estimativa = useMemo(() => {
    if (modo !== 'depositado' || !semValor || !taxas || !andaSozinho(inv)) return null;
    let s = 0;
    for (const l of lidas) {
      if (!(l.data && l.v > 0)) continue;
      const f = fatorDoAporte(inv, l.data, hoje, taxas); // como o banco mostra hoje
      if (f === null) return null;
      s += l.v * f;
    }
    return s > 0 ? s : null;
  }, [modo, semValor, taxas, inv, lidas, hoje]);
  const bate = modo === 'hoje' && !semValor && vale > 0 && Math.abs(soma - vale) <= Math.max(100, vale * 0.005);

  const salvar = async (apagar = false) => {
    const plano = apagar ? { itens: [] } : planoDosDepositos({ modo, linhas, referencia, hoje, semValor, aplicadoTexto: aplicado, aplicadoAntes: inv.aplicado_inicial_centavos, valeTexto: valeHoje, estimativa, lerValor: calcularValor });
    if (plano.erro) { setErro(plano.erro); return; }
    if (!apagar && !plano.itens.length) { setErro('Informe ao menos um aporte (a data e o valor).'); return; }
    setSalvando(true);
    try {
      await salvarDepositos(inv.id, referencia, plano.itens);
      if (plano.aplicado !== undefined) await atualizarInvestimento(inv.id, { aplicado_inicial_centavos: plano.aplicado });
      if (plano.foto) await registrarValores(plano.foto.data, [{ investimento_id: inv.id, valor_centavos: plano.foto.valor }]);
      toast.success(apagar ? 'A lista de aportes foi apagada.' : `${plano.itens.length} ${plano.itens.length === 1 ? 'aporte' : 'aportes'} de ${inv.nome} salvos${plano.foto ? ` · vale ${formatBRL(plano.foto.valor)}` : ''}.`);
      onSalvo();
    } catch (err) {
      toast.error(/depositos_investimento|schema cache|does not exist/i.test(err.message) ? 'Falta aplicar a migration 016 (os aportes).' : err.message);
      setSalvando(false);
    }
  };
  const th = 'border-b border-gray-200 bg-hx-f9fafb px-2 py-1.5 text-left text-[10.5px] font-semibold uppercase tracking-wide text-gray-500';
  return (
    <Modal open onClose={onFechar} title={semValor ? 'O que já estava aplicado' : 'Os aportes de antes do app'} subtitulo={`${inv.nome} · a data e o valor de cada aporte`} maxWidth="max-w-[760px]" z="z-[70]">
      <div className="space-y-3" ref={caixaRef}>
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="text-[12.5px] font-semibold text-gray-700">Os valores são</span>
          <AbasPilula abas={[{ key: 'depositado', label: 'o que foi depositado' }, { key: 'hoje', label: 'o que vale hoje' }]} valor={modo} onChange={(m) => { setModo(m); setErro(''); }} variante="claro" altura={30} folga={2} />
          {modo === 'hoje' && <span className="flex items-center gap-2 text-[12.5px] text-gray-600">em <span className="w-[150px]"><CampoData value={referencia} onChange={setReferencia} max={hoje} compacto /></span></span>}
        </div>
        <div className="max-h-[42vh] overflow-auto rounded-md border border-gray-200" onKeyDown={aoTeclar}>
          <table className="w-full border-separate border-spacing-0 text-[12.5px]">
            <thead className="sticky top-0 z-[1]"><tr>
              <th className={`${th} w-[170px]`}>Data do aporte</th><th className={`${th} w-[170px] text-right`}>{modo === 'hoje' ? 'Vale hoje' : 'Valor aportado'}</th><th className={th}>IR hoje</th><th className={`${th} w-9`} />
            </tr></thead>
            <tbody>
              {lidas.map((l) => {
                const a = l.data ? aliquotaIR(Math.max(0, diasEntreIR(l.data, hoje))) : null;
                return (
                  <tr key={l.k}>
                    <td className="border-b border-gray-100 px-2 py-1" data-dep={l.k} data-col="data"><CampoData value={l.data} onChange={(v) => muda(l.k, 'data', v)} max={hoje} compacto /></td>
                    <td className="border-b border-gray-100 px-2 py-1">
                      <input data-col="valor" className={`input !h-8 text-right text-[12.5px] tabular-nums ${String(l.valor).trim() && !(l.v > 0) ? '!border-hx-e5484d' : ''}`} inputMode="decimal" placeholder="0,00"
                        value={l.valor} onChange={(e) => muda(l.k, 'valor', e.target.value)} aria-label="Valor do aporte" />
                    </td>
                    <td className="border-b border-gray-100 px-2 py-1">
                      {a !== null && (ehIsento(inv.tipo) ? <Etiqueta tom="verde">isento</Etiqueta> : <Etiqueta tom={TOM_ALIQ[a] ?? 'cinza'}>{pctA(a)}</Etiqueta>)}
                      {l.data && <span className="ml-1.5 text-[11.5px] text-gray-400">há {diasEntreIR(l.data, hoje)} dias</span>}
                    </td>
                    <td className="border-b border-gray-100 px-1 py-1 text-center">
                      <button type="button" tabIndex={-1} onClick={() => tirar(l.k)} aria-label="Tirar este aporte"
                        className="inline-flex h-7 w-7 items-center justify-center rounded-[4px] text-gray-400 transition-colors hover:bg-hx-fdeaea hover:text-hx-c0393d">✕</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <button type="button" onClick={adicionar} className="inline-flex items-center gap-2 rounded-[5px] px-2 py-1.5 text-[12.5px] font-medium text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900">
          <CirculoMais />Adicionar aporte
        </button>

        {colar ? (
          <div className="space-y-1.5 rounded-md border border-dashed border-gray-300 p-3">
            <span className="label">Cole aqui a tela "Detalhes dos depósitos" do banco</span>
            <textarea className="input !h-[120px] w-full resize-y py-2 font-mono text-[12.5px] leading-relaxed" autoFocus value={texto} onChange={(e) => { setTexto(e.target.value); setErro(''); }}
              onPaste={(e) => { const tx = e.clipboardData?.getData('text'); if (tx) { e.preventDefault(); setTexto(tx); preencher(tx); } }}
              placeholder={'Feito em 05 SET 2026  R$ 4.165,28\nFeito em 04 SET 2026  R$ 17.204,90\n…'} />
            <p className="text-xs text-gray-500">Aceita "05 SET 2026", "05/09/2026" ou "2026-09-05" e o valor com ou sem R$. Ao ler, a tabela se preenche e "o que vale hoje" fica marcado.
</p>
            <span className="flex items-center gap-3">
              <button type="button" className="btn-secondary !h-8 !text-[12.5px]" disabled={!texto.trim()} onClick={() => preencher(texto)}>Preencher a tabela</button>
              <button type="button" className="text-[12px] text-gray-500 hover:text-gray-800 hover:underline" onClick={() => { setColar(false); setTexto(''); }}>fechar</button>
            </span>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2.5 rounded-md border border-dashed border-gray-300 px-3 py-2.5 text-[12.5px] text-gray-600">
            <b className="font-semibold text-gray-800">Tem a lista no banco?</b><span>Cole a tela "Detalhes dos depósitos" e a tabela se preenche.</span>
            <button type="button" className="btn-secondary ml-auto !h-8 !text-[12.5px]" onClick={() => setColar(true)}><IconColar />Colar do banco</button>
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <Campo rotulo={modo === 'hoje' ? 'Valor aplicado (o do banco)' : 'Valor aplicado'}>
            {modo === 'hoje' ? (
              <input className="input text-right tabular-nums" inputMode="decimal" value={aplicado} placeholder="0,00" onChange={(e) => { setAplicado(e.target.value); setErro(''); }}
                title='O "valor aplicado" que o app do banco mostra: o total depositado, sem o rendimento' />
            ) : <span className="input flex items-center justify-end tabular-nums text-gray-600" title="A soma dos aportes">{formatBRL(soma)}</span>}
          </Campo>
          {semValor && modo === 'depositado' && (
            <Campo rotulo="Vale hoje (como o banco mostra)">
              <input className="input text-right tabular-nums" inputMode="decimal" value={valeHoje} onChange={(e) => { setValeHoje(e.target.value); setErro(''); }}
                placeholder={estimativa ? `≈ ${campoValor(Math.round(estimativa))} ${rotuloPeloIndice(inv)}` : campoValor(soma)} />
            </Campo>
          )}
        </div>
        {n > 0 && (
          <p className={`rounded-md px-3 py-2 text-[12.5px] ${modo === 'hoje' && !semValor && !bate ? 'bg-amber-50 text-amber-800' : 'bg-hx-f0fdf4 text-hx-166534'}`}>
            {modo === 'hoje' && !semValor && !bate
              ? `${n} ${n === 1 ? 'aporte soma' : 'aportes somam'} ${formatBRL(soma)} e ${inv.nome} vale ${formatBRL(vale)}: confira se a lista está completa.`
              : `✓ ${n} ${n === 1 ? 'aporte' : 'aportes'}: ${formatBRL(soma)} ${modo === 'hoje' ? `valendo em ${formatDate(referencia)}` : 'aportados'}. O IR de cada um sai da idade dele.`}
          </p>
        )}
        {erro && <p className="text-sm font-medium text-hx-dc2626">{erro}</p>}
        <div className="flex flex-wrap items-center gap-2 border-t border-gray-100 pt-3">
          {depositos.length > 0 && <button type="button" className="text-[13px] font-medium text-hx-c0393d hover:underline" onClick={() => salvar(true)} disabled={salvando}>Apagar a lista ({depositos.length})</button>}
          <span className="flex-1 text-xs text-gray-500">{depositos.length ? `Substitui os ${depositos.length} aportes de antes.` : 'Os aportes feitos depois, pelo Aplicar, continuam à parte.'}</span>
          <button type="button" className="btn-secondary" onClick={onFechar}>Cancelar</button>
          <button type="button" className="btn-primary" disabled={salvando || !n} onClick={() => salvar()}>{salvando ? 'Salvando…' : `Salvar ${n === 1 ? 'o aporte' : `os ${n || ''} aportes`}`}</button>
        </div>
      </div>
    </Modal>
  );
}

// ------------------------------------------------------------ como o dinheiro entrou?
// Depois de cadastrar investimentos NOVOS (o cadastro não pede mais os valores, 06/11/2026, a opção A do mockup "Ficha do
// investimento"): para cada um, o dinheiro entra como depósito — "É dinheiro novo" abre o Aplicar (a data e o valor) e
// "Já estava aplicado" o Colar os depósitos do banco. `feitos`: os que já receberam o dinheiro nesta vez.
export function ModalComoEntrou({ criados, feitos, onAplicar, onColar, onFechar }) {
  const um = criados.length === 1;
  const falta = criados.filter((c) => !feitos.has(c.inv.id)).length;
  return (
    <Modal open onClose={onFechar} title="Como o dinheiro entrou?" maxWidth="max-w-[640px]"
      subtitulo={um ? `${criados[0].inv.nome} está cadastrado` : `${criados.length} investimentos cadastrados`}>
      <div className="space-y-3">
        {criados.map(({ inv, lugar }) => {
          const feito = feitos.has(inv.id);
          return (
            <div key={inv.id} className="rounded-md border border-gray-200 px-3 py-2.5">
              {!um && <div className="mb-2 flex items-baseline gap-2"><b className="text-[13px] font-semibold text-gray-800">{inv.nome}</b><span className="text-[12px] text-gray-400">{lugar}</span>
                {feito && <span className="ml-auto"><Etiqueta tom="verde">o dinheiro entrou</Etiqueta></span>}</div>}
              {feito && um ? <p className="text-[13px] text-hx-166534">✓ O dinheiro entrou.</p> : !feito && (
                <div className="grid gap-2 sm:grid-cols-2">
                  <button type="button" onClick={() => onAplicar(inv)}
                    className="flex items-start gap-2.5 rounded-md border border-gray-300 bg-hx-f9fafb px-3 py-2.5 text-left transition-colors hover:border-gray-400 hover:bg-gray-50">
                    <span className="mt-0.5 text-gray-600"><IconAplicar className="h-[18px] w-[18px]" /></span>
                    <span><b className="block text-[13px] font-semibold text-gray-800">É dinheiro novo</b>
                      <span className="block text-[12px] text-gray-500">Aplicar: a data e o valor. Entra como um aporte exato.</span></span>
                  </button>
                  <button type="button" onClick={() => onColar(inv)}
                    className="flex items-start gap-2.5 rounded-md border border-gray-300 bg-hx-f9fafb px-3 py-2.5 text-left transition-colors hover:border-gray-400 hover:bg-gray-50">
                    <span className="mt-0.5 text-gray-600"><IconDepositos className="h-[18px] w-[18px]" /></span>
                    <span><b className="block text-[13px] font-semibold text-gray-800">Já estava aplicado</b>
                      <span className="block text-[12px] text-gray-500">A data e o valor de cada aporte (digitando, ou colando a lista do banco).</span></span>
                  </button>
                </div>
              )}
            </div>
          );
        })}
        <p className="text-xs text-gray-500">Sem nenhum aporte, o investimento fica na carteira como "sem valor", e o "Atualizar valores" não o cobra. O dinheiro pode entrar depois, pela ficha dele.</p>
        <div className="flex justify-end border-t border-gray-100 pt-3">
          <button type="button" className={falta ? 'btn-secondary' : 'btn-primary'} onClick={onFechar}>{falta ? 'Depois' : 'Pronto'}</button>
        </div>
      </div>
    </Modal>
  );
}

// ------------------------------------------------------------ atualizar valores
// Uma linha por investimento ativo (agrupados por lugar): o valor de antes, as aplicações − resgates desde ele, o
// valor de hoje e o "Rendeu" na hora. O RENDIMENTO FORA DO NORMAL para o tipo (`rendimentoForaDoNormal`) vira o aviso
// "Foi uma aplicação de R$ X?": aceitar lança a aplicação junto com o salvar (e o rendimento se acerta). Enter num
// campo vazio repete o valor de antes ("igual ao anterior") e desce. OS QUE ANDAM SOZINHOS pela taxa (06/11/2026, a opção C
// do mockup "Valor pelo CDI"): o campo vazio mostra a ESTIMATIVA da data (a foto estimada — `estimados`) e o Enter a usa;
// eles pedem a conferência a cada 3 meses (`pendentesDeValor`), e o "Rendeu" conta desde a última foto REAL, então a
// aplicação esquecida aparece no aviso de sempre. `valores`: só as fotos reais.
export function ModalAtualizarValores({ grupos, valores, movimentos, estimados = [], onFechar, onSalvo }) {
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
    // a estimativa da data: a foto estimada mais nova até ela (depois da última real)
    const est = estimados.filter((e) => e.investimento_id === x.inv.id && e.data <= data && (!antes || e.data > antes.data))
      .reduce((m, e) => (!m || e.data > m.data ? e : m), null);
    return { antes, liq, n: ms.length, novo, rendeu, fora, ex, est };
  };
  const campoDe = (c) => (Number(c) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
  const pedem = useMemo(() => new Set(pendentesDeValor({ investimentos: linhas.flatMap((l) => l.itens.map((x) => x.inv)), valores, hoje }).map((i) => i.id)), [linhas, valores, hoje]);
  const muda = (id, t) => { setCampos((c) => ({ ...c, [id]: t })); setErro(''); };
  const aoTeclar = (x) => (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    if (vazio(campos[x.inv.id])) { const c = calc(x); if (c.est) muda(x.inv.id, campoDe(c.est.valor_centavos)); else if (c.antes) muda(x.inv.id, campoDe(c.antes.valor_centavos)); }
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
          <p className="min-w-[240px] flex-1 pb-2 text-xs text-gray-500">O que ficar em branco não muda. Enter num campo vazio usa o valor estimado (os que andam pelo CDI) ou repete o de antes. Os do CDI pedem a conferência a cada 3 meses. Aceita conta: =20000+14000.</p>
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
                            <span className="block text-[11.5px] text-gray-400">{nomeTipoInvestimento(x.inv.tipo)}
                              {andaSozinho(x.inv) && (pedem.has(x.inv.id)
                                ? <span className="font-semibold text-amber-700"> · conferir: a última foto real tem mais de 3 meses</span>
                                : <span> · anda sozinho {rotuloPeloIndice(x.inv)}</span>)}</span></td>
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
                            <input data-valor-hoje="" onKeyDown={aoTeclar(x)} className="input !h-8 !w-36 text-right tabular-nums" inputMode="decimal" placeholder={c.est ? `≈ ${campoDe(c.est.valor_centavos)}` : 'igual ao anterior'}
                              title={c.est ? `Estimado ${rotuloPeloIndice(x.inv)} desde a foto real. Enter usa a estimativa; corrija se o banco mostrar outro número.` : undefined}
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
