import { useEffect, useMemo, useRef, useState } from 'react';
import Modal from '../Modal.jsx';
import SelectSimples from '../SelectSimples.jsx';
import Toggle from '../Toggle.jsx';
import Tooltip from '../Tooltip.jsx';
import CampoTicker from './CampoTicker.jsx';
import { DivisorFaixa, Trilho as TrilhoFaixa } from '../filtros/FaixaFiltros.jsx';
import { CirculoMais, IconExpandirTudo, IconLixeira } from '../icons.jsx';
import { Alca, Seta } from '../PecasCadastro.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { useConfirmacao } from '../../context/ConfirmContext.jsx';
import { atualizarAtivo, consultarTicker, criarAtivo, excluirAtivo } from '../../api/rendaVariavel.js';
import useLinhasAnimadas, { atributosLinha } from '../../lib/useLinhasAnimadas.js';
import { useListaArrastavel } from '../../lib/useListaArrastavel.js';
import { arrastoAgrupado } from '../../lib/arrastoAgrupado.js';
import { semAcento } from '../../lib/buscaLancamentos.js';
import { lsGet, lsSet } from '../../lib/storage.js';
import { CLASSES, TIPOS, classeDoTipo, ordensDosAtivos } from '../../lib/rendaVariavel.js';

// O CADASTRO DOS ATIVOS (13/11/2026, a renda variável): a tabela de formulário dos cadastros — cada célula um campo (o
// ticker, o nome, o tipo, a corretora, ativo) e "Salvar alterações (N)", que grava só a diferença. O tipo decide o mercado e
// a moeda (a ação dos EUA é em dólar). Ao sair do ticker, a função das cotações o CONFERE na fonte (a brapi ou a Finnhub) e
// preenche o nome vazio; "não achou" fica em âmbar (dá para salvar assim mesmo).
// O TICKER SE PROCURA PELO NOME (`CampoTicker`, 13/11/2026): escrevendo "nvidia", a lista traz NVDA; escolher preenche o
// ticker, o tipo e o nome.
// O ativo com operações não se exclui: desativa (some da lista do "Lançar operação", fica no histórico).
//
// AGRUPADO PELA CLASSE (24/11/2026, a opção A do mockup "Cadastro dos ativos · organizar", a pedido: com muitos ativos a
// lista só, com "Ação dos EUA · Exterior · US$" em toda linha, ficava difícil de administrar), no jeito do cadastro dos
// investimentos: a CLASSE é a faixa (Exterior · FIIs · Ações da B3, a barra da cor da carteira, a seta que recolhe animado —
// `cadastro_rv_fechadas` —, "N ativos · EUA · US$"), o tipo na linha é curto ("Ação", "ETF": a faixa diz o resto) e mudar o
// tipo para outra classe leva a linha para a faixa dela. Os CAMPOS QUIETOS (`.quieto`), a coluna EM USO (as operações), a
// ALÇA ⠿ que reordena DENTRO da classe (`arrastoAgrupado`; soltar noutra classe não vale — a classe é o tipo) e grava a
// `ordem` (`ordensDosAtivos`). O cabeçalho num trilho só: a busca (ticker, nome, corretora) | Só os ativos | ⇕ | Novo ativo.
// Com busca ou "Só os ativos" a lista é parcial e a alça não arrasta.

const OPCOES_TIPO = [
  { value: 'acao_eua', label: 'Ação', grupo: { nome: 'Exterior · US$' } },
  { value: 'etf_eua', label: 'ETF', grupo: { nome: 'Exterior · US$' } },
  { value: 'fii', label: 'FII', grupo: { nome: 'FIIs · R$' } },
  { value: 'acao_br', label: 'Ação', grupo: { nome: 'B3 · R$' } },
  { value: 'bdr', label: 'BDR', grupo: { nome: 'B3 · R$' } },
  { value: 'etf_br', label: 'ETF', grupo: { nome: 'B3 · R$' } },
];
const TIPO_DA_CLASSE = { ext: 'acao_eua', fii: 'fii', b3: 'acao_br' };
const PRIMEIRO = { ext: 'o primeiro ativo do exterior', fii: 'o primeiro FII', b3: 'a primeira ação da B3' };
const CHAVE_FECHADAS = 'cadastro_rv_fechadas';
const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
let seq = 0;
const novaLinha = (tipo = 'acao_eua') => ({ chave: `n${++seq}`, novo: true, ticker: '', tipo, nome: '', corretora: '', ativo: true });
const lerFechadas = () => { try { return new Set(JSON.parse(lsGet(CHAVE_FECHADAS) || '[]')); } catch { return new Set(); } };

// `inicial`: { ticker, tipo, nome } — a linha nova já preenchida (o "Cadastrar" da ação de fora no painel do gráfico)
export default function ModalCadastroAtivos({ ativos, operacoes, tipoInicial, inicial = null, onFechar, onSalvo }) {
  const toast = useToast();
  const confirmar = useConfirmacao();
  const opsPorAtivo = useMemo(() => {
    const m = {};
    operacoes.forEach((o) => { m[o.ativo_id] = (m[o.ativo_id] ?? 0) + 1; });
    return m;
  }, [operacoes]);
  const [linhas, setLinhas] = useState(() => {
    // a ordem da tela já agrupada pela classe; o `pos` é o lugar dela aqui (ver `ordensDosAtivos`)
    const ls = CLASSES.flatMap((c) => ativos.filter((a) => classeDoTipo(a.tipo) === c.id))
      .map((a, pos) => ({ chave: a.id, id: a.id, ticker: a.ticker, tipo: a.tipo, nome: a.nome ?? '', corretora: a.corretora ?? '', ativo: a.ativo !== false, original: a, pos }));
    if (inicial) return [...ls, { ...novaLinha(inicial.tipo), ticker: inicial.ticker, nome: inicial.nome ?? '' }];
    return tipoInicial || !ls.length ? [...ls, novaLinha(tipoInicial)] : ls;
  });
  const [foco, setFoco] = useState(() => (tipoInicial && !inicial ? 'ultima' : null));
  const [conferencia, setConferencia] = useState({}); // chave → 'lendo' | 'ok' | 'nao'
  const [salvando, setSalvando] = useState(false);
  const [busca, setBusca] = useState('');
  const [soAtivos, setSoAtivos] = useState(false);
  const [fechadas, setFechadasEstado] = useState(lerFechadas);
  const setFechadas = (f) => setFechadasEstado((antes) => { const n = typeof f === 'function' ? f(antes) : f; lsSet(CHAVE_FECHADAS, JSON.stringify([...n])); return n; });
  const caixaRef = useRef(null);
  const mudar = (chave, campo, valor) => setLinhas((ls) => ls.map((l) => (l.chave === chave ? { ...l, [campo]: valor } : l)));

  // a linha nova que o "Adicionar…" (ou o tipo inicial) criou ganha o foco no ticker
  const ultimaChave = linhas[linhas.length - 1]?.chave;
  const chaveFoco = foco === 'ultima' ? ultimaChave : foco;
  useEffect(() => { if (foco) { const t = setTimeout(() => setFoco(null), 300); return () => clearTimeout(t); } return undefined; }, [foco]);
  const adicionar = (classe) => {
    const nova = novaLinha(TIPO_DA_CLASSE[classe]);
    setLinhas((ls) => [...ls, nova]);
    setFechadas((s) => { if (!s.has(classe)) return s; const n = new Set(s); n.delete(classe); return n; });
    setFoco(nova.chave);
  };
  const novoAtivo = () => { setBusca(''); setSoAtivos(false); adicionar('ext'); };

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

  // a ordem da TELA: as classes na ordem, e dentro de cada uma a ordem das linhas
  const naTela = useMemo(() => CLASSES.flatMap((c) => linhas.filter((l) => classeDoTipo(l.tipo) === c.id)), [linhas]);
  const ordens = useMemo(() => ordensDosAtivos(naTela.map((l) => ({ ...l, id: l.chave, orig: l.original }))), [naTela]);

  // a diferença para o banco
  const dadosDe = (l) => ({ ticker: l.ticker.trim().toUpperCase(), tipo: l.tipo, mercado: TIPOS[l.tipo].mercado, moeda: TIPOS[l.tipo].moeda, nome: l.nome.trim(), corretora: l.corretora.trim(), ativo: l.ativo });
  const mudouDados = (l) => {
    const d = dadosDe(l); const o = l.original;
    return d.ticker !== o.ticker || d.tipo !== o.tipo || d.nome !== (o.nome ?? '') || d.corretora !== (o.corretora ?? '') || d.ativo !== (o.ativo !== false);
  };
  const mudou = (l) => {
    if (l.excluir) return !l.novo;
    if (l.novo) return !!l.ticker.trim();
    return mudouDados(l) || ordens.has(l.chave);
  };
  const alteradas = naTela.filter(mudou);
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
        if (l.excluir) { await excluirAtivo(l.id); continue; }
        const ordem = ordens.has(l.chave) ? { ordem: ordens.get(l.chave) } : {};
        if (l.novo) await criarAtivo({ ...dadosDe(l), ordem: ordens.get(l.chave) ?? 0 });
        else await atualizarAtivo(l.id, { ...(mudouDados(l) ? dadosDe(l) : {}), ...ordem });
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

  // AS LINHAS DA TELA: a faixa de cada classe, os ativos dela e o "Adicionar em …". Buscando, tudo aberto.
  const t = semAcento(busca).trim();
  const filtrando = !!t || soAtivos;
  const casa = (l) => l.novo || ((!soAtivos || l.ativo) && (!t || semAcento(`${l.ticker} ${l.nome} ${l.corretora}`).includes(t)));
  const itens = useMemo(() => CLASSES.flatMap((c) => {
    const doG = linhas.filter((l) => classeDoTipo(l.tipo) === c.id);
    const vistos = doG.filter(casa);
    if (filtrando && !vistos.length) return [];
    return [
      { id: `g:${c.id}`, tipo: 'grupo', c, n: doG.filter((l) => !l.excluir && (!l.novo || l.ticker.trim())).length },
      ...vistos.map((l) => ({ id: `i:${l.chave}`, tipo: 'ativo', c, l })),
      ...(t ? [] : [{ id: `a:${c.id}`, tipo: 'add', c, vazio: !doG.length }]),
    ];
  }), [linhas, t, soAtivos]); // eslint-disable-line react-hooks/exhaustive-deps
  const abertas = useMemo(() => itens.filter((x) => t || x.tipo === 'grupo' || !fechadas.has(x.c.id)), [itens, fechadas, t]);
  const desenhadas = useLinhasAnimadas(itens, abertas, caixaRef);
  const tudoAberto = CLASSES.every((c) => !fechadas.has(c.id));
  const alternar = (id) => setFechadas((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  // O ARRASTO: só o ativo tem a alça, e só dentro da classe dele (a classe é o tipo)
  const idsArrasto = itens.filter((x) => x.tipo === 'grupo' || x.tipo === 'ativo').map((x) => x.id);
  const arrastado = useRef(null);
  const arrasto = useListaArrastavel({
    ids: idsArrasto,
    onReordenar: (ids) => {
      if (!arrastado.current || filtrando) return;
      const r = arrastoAgrupado(ids, arrastado.current, idsArrasto);
      if (!r) return;
      const porChave = new Map(linhas.map((l) => [l.chave, l]));
      if (r.linhas.some(({ id, grupo }) => classeDoTipo(porChave.get(id)?.tipo) !== grupo)) return; // noutra classe: não vale
      const ordem = r.linhas.map(({ id }) => porChave.get(id)).filter(Boolean);
      setLinhas([...ordem, ...linhas.filter((l) => !ordem.includes(l))]);
    },
  });
  const alca = (id) => {
    if (filtrando) return null;
    const p = arrasto.alcaProps(id);
    return { ...p, onDragStart: (e) => { arrastado.current = id; p.onDragStart(e); } };
  };

  const th = 'h-8 border-b border-gray-200 bg-hx-f9fafb px-2 text-left text-[10.5px] font-semibold uppercase tracking-wide text-gray-500';
  const thGrupo = (rotulo, n) => (
    <th colSpan={n} className="bg-hx-f9fafb px-2 pb-0 pt-2.5 text-left align-bottom">
      <span className="block h-[17px] border-b border-gray-300 pb-1 text-[10px] font-semibold uppercase tracking-[0.07em] text-gray-600">{rotulo}</span>
    </th>
  );
  const linhaCls = (id, extra = '') => `group/linha transition-[opacity,transform] duration-200 ease-out ${arrasto.dragId === id ? '!opacity-40' : ''} ${extra}`;
  const COLUNAS = 7;

  const desenhar = ({ linha: x, estado }) => {
    const attrs = atributosLinha(x.id, estado);
    if (x.tipo === 'grupo') {
      const { c } = x;
      const aberto = !!t || !fechadas.has(c.id);
      return (
        <tr key={x.id} {...arrasto.itemProps(x.id)} {...attrs} className={linhaCls(x.id)}>
          <td colSpan={COLUNAS} className="relative h-[42px] cursor-pointer border-b border-gray-200 bg-hx-f3f4f6 py-0 pl-2.5 pr-3" onClick={() => !t && alternar(c.id)}>
            <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-0 w-[3px]" style={{ background: c.cor }} />
            <span className="flex items-center gap-2">
              <Seta aberto={aberto} disabled={!!t} onClick={(e) => { e.stopPropagation(); alternar(c.id); }} rotulo={aberto ? `Recolher ${c.nome}` : `Abrir ${c.nome}`} />
              <span className="text-[14px] font-semibold text-gray-900">{c.nome}</span>
              <span className="whitespace-nowrap text-[12px] text-gray-500">{x.n ? plural(x.n, 'ativo', 'ativos') : 'nenhum ativo'} · {c.mercado} · {c.moeda === 'USD' ? 'US$' : 'R$'}</span>
            </span>
          </td>
        </tr>
      );
    }
    if (x.tipo === 'add') {
      return (
        <tr key={x.id} {...attrs} className="transition-[opacity,transform] duration-200 ease-out">
          <td colSpan={COLUNAS} className="border-b border-gray-100 py-1 pl-[34px] pr-2">
            <button type="button" onClick={() => { setBusca(''); setSoAtivos(false); adicionar(x.c.id); }}
              className="inline-flex items-center gap-2 rounded-[5px] px-2 py-1.5 text-[12.5px] font-medium text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900">
              <CirculoMais />{x.vazio ? `Adicionar ${PRIMEIRO[x.c.id]}` : `Adicionar em ${x.c.nome}`}
            </button>
          </td>
        </tr>
      );
    }
    const { l } = x;
    const c = conferencia[l.chave];
    const nOps = l.novo ? 0 : opsPorAtivo[l.id] ?? 0;
    const alterada = mudou(l) && !l.excluir;
    const td = 'border-b border-gray-100 px-1.5 py-1 align-middle';
    return (
      <tr key={x.id} {...arrasto.itemProps(x.id)} {...attrs} className={linhaCls(x.id, `hover:bg-hx-f9fafb ${l.excluir ? 'opacity-40' : !l.ativo ? 'opacity-70' : ''}`)}>
        <td className={`${td} pl-[12px]`} style={alterada ? { boxShadow: 'inset 3px 0 0 #f59e0b' } : undefined}>
          <span className="flex items-start gap-1">
            <span className="pt-1"><Alca props={alca(x.id)} rotulo="Arraste para mudar a ordem (dentro da classe)" /></span>
            <span className="block min-w-0 flex-1">
              <CampoTicker value={l.ticker} erro={repetidos.has(l.chave)} disabled={l.excluir} autoFocus={chaveFoco === l.chave}
                onChange={(v) => { mudar(l.chave, 'ticker', v); setConferencia((y) => ({ ...y, [l.chave]: undefined })); }}
                onEscolher={(it) => escolher(l.chave, it)} onBlur={() => conferir(l)} />
              {c === 'lendo' && <span className="block px-2 pb-0.5 text-[11px] text-gray-400">conferindo…</span>}
              {c === 'ok' && <span className="block px-2 pb-0.5 text-[11px] text-green-700">achou na fonte</span>}
              {c === 'nao' && <span className="block px-2 pb-0.5 text-[11px] leading-[14px] text-amber-700">não achou: escreva o nome e escolha na lista</span>}
            </span>
          </span>
        </td>
        <td className={td}><input className="input !h-8 !py-1 text-[12.5px]" value={l.nome} placeholder="o nome sai da fonte" disabled={l.excluir} onChange={(e) => mudar(l.chave, 'nome', e.target.value)} aria-label={`Nome de ${l.ticker || 'o ativo'}`} /></td>
        <td className={td}><SelectSimples compacto grupoNoBotao={false} value={l.tipo} onChange={(v) => { mudar(l.chave, 'tipo', v); setConferencia((y) => ({ ...y, [l.chave]: undefined })); }} opcoes={OPCOES_TIPO} disabled={l.excluir} /></td>
        <td className={td}><input className="input !h-8 !py-1 text-[12.5px]" value={l.corretora} placeholder="opcional" disabled={l.excluir} onChange={(e) => mudar(l.chave, 'corretora', e.target.value)} aria-label={`Corretora de ${l.ticker || 'o ativo'}`} /></td>
        <td className={`${td} px-2.5 text-[12px] text-gray-500`}>{l.novo ? '—' : nOps ? plural(nOps, 'operação', 'operações') : 'sem operação'}</td>
        <td className={td}><span className="flex h-8 items-center"><Toggle compacto checked={l.ativo} onChange={(v) => mudar(l.chave, 'ativo', v)} rotulo={`${l.ticker || 'O ativo'} ativo`} disabled={l.excluir} /></span></td>
        <td className={`${td} text-right`}>
          {l.novo || !nOps ? (
            <Tooltip label={l.excluir ? 'Não excluir' : 'Excluir (ao salvar)'}>
              <button type="button" aria-label={l.excluir ? 'Não excluir' : 'Excluir'} onClick={() => (l.novo ? setLinhas((ls) => ls.filter((y) => y.chave !== l.chave)) : mudar(l.chave, 'excluir', !l.excluir))}
                className={`inline-grid h-[28px] w-[28px] place-items-center rounded-[6px] transition-[opacity,color,background-color] hover:bg-hx-fdeaea hover:text-hx-c0393d focus-visible:opacity-100 ${l.excluir ? 'bg-hx-fdeaea text-hx-c0393d' : 'text-gray-400 opacity-0 group-hover/linha:opacity-100'}`}>
                <IconLixeira className="h-[14px] w-[14px]" />
              </button>
            </Tooltip>
          ) : <Tooltip label="Tem operações: desative em vez de excluir"><span className="inline-grid h-[28px] w-[28px] place-items-center text-gray-300 opacity-0 group-hover/linha:opacity-100"><IconLixeira className="h-[14px] w-[14px]" /></span></Tooltip>}
        </td>
      </tr>
    );
  };

  // O CABEÇALHO NUM TRILHO SÓ, o do cadastro das categorias: a busca | Só os ativos | ⇕ | Novo ativo
  const SEG = 'inline-flex h-[25px] shrink-0 items-center gap-2 whitespace-nowrap rounded-[3px] px-2 text-[12.5px] transition-colors hover:bg-gray-200';
  const acoes = (
    <TrilhoFaixa className="mr-1 shrink-0">
      <label className={`${SEG} w-[230px] cursor-text text-gray-400 hover:bg-transparent`}>
        <svg viewBox="0 0 14 14" className="h-[14px] w-[14px] shrink-0" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
          <circle cx="6" cy="6" r="4.25" /><path d="M9.2 9.2L12 12" />
        </svg>
        <input className="min-w-0 flex-1 bg-transparent text-[12.5px] text-gray-800 outline-none placeholder:text-gray-400" placeholder="Buscar ticker, nome, corretora"
          aria-label="Buscar ativo" value={busca} onChange={(e) => setBusca(e.target.value)} />
        {busca && (
          <button type="button" onClick={() => setBusca('')} aria-label="Limpar a busca" className="shrink-0 rounded-[3px] p-0.5 text-gray-400 hover:bg-gray-200 hover:text-gray-700">
            <svg viewBox="0 0 14 14" className="h-[10px] w-[10px]" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M3.5 3.5l7 7M10.5 3.5l-7 7" /></svg>
          </button>
        )}
      </label>
      <DivisorFaixa />
      <label className={`${SEG} cursor-pointer text-gray-600 hover:text-gray-900`}>
        <Toggle compacto checked={soAtivos} onChange={setSoAtivos} rotulo="Só os ativos" />Só os ativos
      </label>
      <DivisorFaixa />
      <Tooltip label={t ? 'Buscando, tudo fica aberto' : tudoAberto ? 'Recolher tudo' : 'Expandir tudo'}>
        <button type="button" aria-label={tudoAberto ? 'Recolher tudo' : 'Expandir tudo'} disabled={!!t}
          onClick={() => setFechadas(tudoAberto ? new Set(CLASSES.map((c) => c.id)) : new Set())}
          className={`${SEG} w-[30px] justify-center !px-0 text-gray-600 hover:text-gray-900 disabled:opacity-40 disabled:hover:bg-transparent`}>
          <IconExpandirTudo fechar={tudoAberto} />
        </button>
      </Tooltip>
      <DivisorFaixa />
      <Tooltip label="Uma linha nova no Exterior: escreva o ticker ou o nome e escolha na lista — o tipo leva a linha para a classe dela">
        <button type="button" onClick={novoAtivo} className={`${SEG} font-semibold text-gray-800 hover:text-gray-900`}>
          <CirculoMais borda="text-gray-500" />Novo ativo
        </button>
      </Tooltip>
    </TrilhoFaixa>
  );

  const nAtivos = linhas.filter((l) => !l.novo && !l.excluir).length;
  return (
    <Modal open onClose={fechar} title="Cadastro dos ativos" maxWidth="max-w-[1120px]" padding="p-0" acoes={acoes}
      subtitulo={`${plural(nAtivos, 'ativo', 'ativos')} · o tipo decide o mercado e a moeda`}>
      <div ref={caixaRef} className="max-h-[66vh] overflow-auto [scrollbar-gutter:stable]">
        <table className="quieto w-full min-w-[900px] table-fixed border-separate border-spacing-0 text-[12.5px]">
          <colgroup>
            <col style={{ width: 190 }} /><col /><col style={{ width: 130 }} /><col style={{ width: 170 }} />
            <col style={{ width: 120 }} /><col style={{ width: 60 }} /><col style={{ width: 44 }} />
          </colgroup>
          <thead className="sticky top-0 z-10">
            <tr>{thGrupo('O ativo', 3)}{thGrupo('Onde e uso', 2)}<th colSpan={2} className="bg-hx-f9fafb" /></tr>
            <tr>
              <th className={`${th} pl-[44px]`}>Ticker</th><th className={`${th} pl-[16px]`}>Nome</th><th className={`${th} pl-[17px]`}>Tipo</th>
              <th className={`${th} pl-[17px]`}>Corretora</th><th className={`${th} pl-2.5`}>Em uso</th><th className={th}>Ativo</th><th className={th} aria-label="Excluir" />
            </tr>
          </thead>
          <tbody ref={arrasto.containerRef}>
            {desenhadas.map(desenhar)}
            {!itens.length && <tr><td colSpan={COLUNAS} className="px-4 py-8 text-center text-sm text-gray-400">Nada com “{busca.trim()}”.</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-gray-200 bg-hx-f9fafb px-4 py-3">
        <span className="text-[12px] text-gray-500">
          {erro ? <b className="font-medium text-hx-dc2626">{erro}</b>
            : alteradas.length ? <><b className="font-semibold text-hx-92400e">{plural(alteradas.length, 'alteração', 'alterações')}</b> · ainda não salvo</>
              : filtrando ? 'Com a busca ou "Só os ativos" a lista está parcial: a alça ⠿ não arrasta.'
                : 'O ticker ou o nome da empresa, e escolha na lista · arraste pela ⠿ para mudar a ordem (vale na carteira)'}
        </span>
        <span className="flex-1" />
        <button type="button" className="btn-secondary" onClick={fechar} disabled={salvando}>Cancelar</button>
        <button type="button" className="btn-primary" disabled={salvando || !!erro || !alteradas.length} onClick={salvar}>
          {salvando ? 'Salvando…' : alteradas.length ? `Salvar alterações (${alteradas.length})` : 'Salvar alterações'}
        </button>
      </div>
    </Modal>
  );
}
