import { useEffect, useMemo, useRef, useState } from 'react';
import Modal from '../Modal.jsx';
import SelectSimples from '../SelectSimples.jsx';
import Toggle from '../Toggle.jsx';
import Tooltip from '../Tooltip.jsx';
import { Trilho as TrilhoFaixa } from '../filtros/FaixaFiltros.jsx';
import { CirculoMais, IconExpandirTudo, IconGrip } from '../icons.jsx';
import { CORES_INSTITUICAO } from './TabelaCarteira.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { useConfirmacao } from '../../context/ConfirmContext.jsx';
import { atualizarInvestimento, criarInvestimento, excluirInvestimento, marcarNaoReaplicar } from '../../api/carteira.js';
import useLinhasAnimadas, { atributosLinha } from '../../lib/useLinhasAnimadas.js';
import { useListaArrastavel } from '../../lib/useListaArrastavel.js';
import { lsGet, lsSet } from '../../lib/storage.js';
import {
  INDEXADORES, TIPOS, arrastoDoCadastro, dadosDoCadastro, diferencaDoCadastro, instituicoesEmOrdem, investimentosEmOrdem, linhaDoCadastro,
  linhaNovaDoCadastro, linhaVaziaDoCadastro, ordensDoCadastro, validarCadastro, vencidosAntesDeReaplicar,
} from '../../lib/carteira.js';

// O CADASTRO DOS INVESTIMENTOS (07/11/2026, a carteira do zero): a TABELA DE FORMULÁRIO dos fixos e dos cartões — todos de
// uma vez, agrupados pela INSTITUIÇÃO (o cabeçalho do grupo é um campo: mudar o nome muda o de todos dele), cada célula um
// campo. O que o investimento É: o nome, o tipo, a taxa, o resgate (a qualquer hora ou só no vencimento) e o prazo que
// SUGERE o vencimento do aporte. Nada de dinheiro: ele entra pelos aportes. "Salvar alterações (N)" grava a diferença
// (`diferencaDoCadastro`, `validarCadastro` — lib/carteira.js). O investimento com aportes não se exclui (desative). Enter
// desce na mesma coluna. `aportesPorInv`: quantos aportes cada um tem.
// NO VENCIMENTO (08/11/2026, migration 022): o dinheiro VOLTA PARA A CONTA (o aporte encerra) ou o banco REAPLICA SOZINHO
// (no dia, o app grava o aporte novo — `reaplicacoesDevidas`, em useCarteira). "Reaplica" pede o prazo: é o do aporte
// novo. Passar a reaplicar vale para os PRÓXIMOS vencimentos: o que já tinha vencido antes de hoje fica como voltou para a
// conta (`vencidosAntesDeReaplicar` → `nao_reaplicar`). `com022`: sem a migration, a coluna fica apagada.
// O FIM DE SEMANA (08/11/2026, migration 023) e o ÍNDICE (migration 025): `com023` e `com025` apagam o que falta.
// A HIERARQUIA E O MOVIMENTO (09/11/2026, a opção A do mockup "Cadastro dos investimentos", a pedido: "não tem muita
// hierarquia… não consigo alterar a ordem, nem um chevron para ampliar/retrair"):
//   · a INSTITUIÇÃO é a FAIXA da carteira (`bg-hx-f3f4f6`, a barra da cor dela — a mesma da carteira —, 14px semibold), com
//     a SETA que recolhe (animado, `useLinhasAnimadas`; lembrado em `cadastro_inv_fechadas`, pelo nome), o ⇕ no cabeçalho
//     do pop-up e o "+ investimento" no hover; o INVESTIMENTO recuado embaixo;
//   · a ALÇA ⠿ (no hover) ARRASTA a instituição (com os investimentos dela) ou o investimento — soltar sob outra faixa
//     muda a instituição dele (`useListaArrastavel` + `arrastoDoCadastro`). A ordem grava na `ordem` dos investimentos
//     (`ordensDoCadastro`: mexeu, renumera 1, 2, 3…) e vale na carteira e no painel (`instituicoesEmOrdem`);
//   · os CAMPOS QUIETOS (`.quieto` no index.css): só o texto até o hover da linha ou o foco;
//   · as colunas em GRUPOS (o que é · quanto rende · quando o dinheiro sai · hoje) e os dois interruptores do "Vence em"
//     viram PÍLULAS ("−1 dia", "fds → seg.").

// O id da linha nova leva a hora: o contador volta a 0 quando o Vite recarrega o arquivo, e o pop-up aberto guardava as
// linhas de antes — duas com o mesmo id, e digitar numa mudava as duas.
let seq = 0;
const novoId = (p) => { seq += 1; return `${p}-${Date.now().toString(36)}-${seq}`; };
const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
const PRAZOS = [{ value: '', label: 'sem sugestão' }, ...[3, 6, 12, 18, 24, 36, 48, 60].map((m) => ({ value: String(m), label: m % 12 === 0 ? `${m / 12} ${m === 12 ? 'ano' : 'anos'}` : `${m} meses` }))];
const RESGATES = [{ value: 'diaria', label: 'a qualquer hora' }, { value: 'vencimento', label: 'só no vencimento' }];
const NO_VENCIMENTO = [{ value: 'conta', label: 'volta para a conta' }, { value: 'reaplica', label: 'reaplica sozinho' }];
const CHAVE_FECHADAS = 'cadastro_inv_fechadas';
const lerFechadas = () => { try { return new Set(JSON.parse(lsGet(CHAVE_FECHADAS) ?? '[]')); } catch { return new Set(); } };

// a seta da faixa (a da carteira): caixa de 20px e ícone de 12 (a diferença par, sem meio pixel)
const Seta = ({ aberto, onClick, rotulo }) => (
  <button type="button" onClick={onClick} aria-expanded={aberto} aria-label={rotulo}
    className="group/seta flex h-[20px] w-[20px] shrink-0 items-center justify-center rounded-[4px] transition-colors hover:bg-gray-200">
    <svg viewBox="0 0 24 24" className={`h-[12px] w-[12px] shrink-0 text-gray-500 transition-[transform,color] duration-150 group-hover/seta:text-gray-800 ${aberto ? 'rotate-90' : ''}`} fill="none"
      stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
  </button>
);
// a alça ⠿: aparece no hover da linha (o ícone de 9 × 14 numa caixa de 17 × 24)
const Alca = ({ props, rotulo }) => (
  <span {...props} title={rotulo}
    className="flex h-[24px] w-[17px] shrink-0 cursor-grab items-center justify-center rounded-[4px] text-gray-400 opacity-0 transition-[opacity,color,background-color] hover:bg-gray-200 hover:text-gray-700 focus-visible:opacity-100 active:cursor-grabbing group-hover/linha:opacity-100">
    <IconGrip />
  </span>
);
// a pílula liga/desliga do "Vence em": tracejada desligada, cheia ligada
const Pilula = ({ ligado, onChange, disabled, dica, children }) => (
  <Tooltip label={dica}>
    <button type="button" aria-pressed={ligado} disabled={disabled} onClick={() => onChange(!ligado)}
      className={`inline-flex h-[22px] items-center whitespace-nowrap rounded-full border px-2 text-[11.5px] transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
        ligado ? 'border-gray-500 bg-gray-100 font-semibold text-gray-800' : 'border-dashed border-gray-300 text-gray-400 hover:border-gray-400 hover:text-gray-600'}`}>
      {children}
    </button>
  </Tooltip>
);

export default function ModalCadastroCarteira({ cadastro, aportes = [], aportesPorInv = {}, hoje, com022 = true, com023 = true, com025 = true, onFechar, onSalvo }) {
  const toast = useToast();
  const confirmar = useConfirmacao();
  // os grupos: cada instituição na ordem da carteira, com o nome editável (`orig` = o de antes); cada linha que já
  // existia aponta para o grupo do nome dela
  const [inicio] = useState(() => {
    const nomes = instituicoesEmOrdem(cadastro);
    const gs = nomes.map((nome) => ({ id: novoId('g'), nome, orig: nome }));
    const ls = nomes.flatMap((nome) => investimentosEmOrdem(cadastro, nome).map((i) => ({ ...linhaDoCadastro(i), grupo: gs.find((g) => g.orig === nome).id })));
    const guardadas = lerFechadas();
    return { gs, ls, fechadas: new Set(gs.filter((g) => guardadas.has(g.orig)).map((g) => g.id)) };
  });
  const [grupos, setGrupos] = useState(inicio.gs);
  const [linhas, setLinhas] = useState(inicio.ls);
  const [fechadas, setFechadas] = useState(inicio.fechadas);
  const [erro, setErro] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const caixaRef = useRef(null);
  const nomeDoGrupo = (id) => grupos.find((g) => g.id === id)?.nome ?? '';
  const comInstituicao = (l) => ({ ...l, instituicao: nomeDoGrupo(l.grupo) || l.instituicao });
  // a cor de cada instituição: a da carteira (pela posição)
  const cor = (gid) => CORES_INSTITUICAO[Math.max(0, grupos.findIndex((g) => g.id === gid)) % CORES_INSTITUICAO.length];

  useEffect(() => {
    lsSet(CHAVE_FECHADAS, JSON.stringify(grupos.filter((g) => fechadas.has(g.id)).map((g) => g.orig || g.nome.trim()).filter(Boolean)));
  }, [fechadas]); // eslint-disable-line react-hooks/exhaustive-deps
  const abrirGrupo = (gid) => setFechadas((s) => { if (!s.has(gid)) return s; const n = new Set(s); n.delete(gid); return n; });
  const alternar = (gid) => setFechadas((s) => { const n = new Set(s); if (n.has(gid)) n.delete(gid); else n.add(gid); return n; });
  const tudoAberto = grupos.every((g) => !fechadas.has(g.id));

  const focar = (sel) => setTimeout(() => caixaRef.current?.querySelector(sel)?.focus(), 40);
  const adicionar = (grupoId) => {
    const id = novoId('novo');
    abrirGrupo(grupoId);
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

  // as linhas da tela, na ordem: a faixa de cada instituição, os investimentos dela e o "Adicionar investimento"
  const itens = useMemo(() => [...grupos.flatMap((g) => {
    const ls = linhas.filter((l) => l.grupo === g.id);
    return [
      { id: `g:${g.id}`, tipo: 'grupo', g, n: ls.filter((l) => !linhaVaziaDoCadastro(l)).length },
      ...ls.map((l) => ({ id: `i:${l.id}`, tipo: 'inv', g, l })),
      { id: `a:${g.id}`, tipo: 'add', g },
    ];
  }), { id: 'fim', tipo: 'fim' }], [grupos, linhas]);
  const abertas = useMemo(() => itens.filter((x) => !((x.tipo === 'inv' || x.tipo === 'add') && fechadas.has(x.g.id))), [itens, fechadas]);
  const desenhadas = useLinhasAnimadas(itens, abertas, caixaRef);

  // O ARRASTO: a lista que o hook move é a das faixas e dos investimentos; o `arrastoDoCadastro` diz o que ficou
  const idsArrasto = itens.filter((x) => x.tipo === 'grupo' || x.tipo === 'inv').map((x) => x.id);
  const arrastado = useRef(null);
  const arrasto = useListaArrastavel({
    ids: idsArrasto,
    onReordenar: (ids) => {
      if (!arrastado.current) return;
      const r = arrastoDoCadastro(ids, arrastado.current, idsArrasto);
      if (!r) return;
      setGrupos((gs) => r.grupos.map((id) => gs.find((g) => g.id === id)).filter(Boolean));
      setLinhas((ls) => r.linhas.map(({ id, grupo }) => { const l = ls.find((x) => x.id === id); return l && (l.grupo === grupo ? l : { ...l, grupo }); }).filter(Boolean));
    },
  });
  const alca = (id) => {
    const p = arrasto.alcaProps(id);
    return { ...p, onDragStart: (e) => { arrastado.current = id; p.onDragStart(e); } };
  };

  const conta = (l) => !(l.novo && (l.excluir || linhaVaziaDoCadastro(l)));
  // a ORDEM que vai ser gravada: a da tela (os novos vazios ficam de fora)
  const ordens = useMemo(() => ordensDoCadastro(
    grupos.flatMap((g) => linhas.filter((l) => l.grupo === g.id && conta(l)).map((l) => l.id)), cadastro,
  ), [grupos, linhas, cadastro]); // eslint-disable-line react-hooks/exhaustive-deps
  const mudouOrdem = (l) => !l.novo && !l.excluir && ordens.has(l.id);
  const mudadas = linhas.map(comInstituicao).filter((l) => conta(l) && (l.novo || l.excluir || Object.keys(diferencaDoCadastro(l)).length || mudouOrdem(l)));
  const nAlt = mudadas.length;

  const fechar = async () => {
    if (nAlt && !(await confirmar({ titulo: 'Descartar as alterações?', texto: `${plural(nAlt, 'alteração ainda não foi salva', 'alterações ainda não foram salvas')}.`, confirmar: 'Descartar', perigo: true }))) return;
    onFechar();
  };

  const salvar = async () => {
    const todas = linhas.map(comInstituicao);
    const semNome = grupos.find((g) => !g.nome.trim() && todas.some((l) => l.grupo === g.id && conta(l) && !l.excluir));
    if (semNome) { setErro({ id: semNome.id, campo: 'grupo' }); abrirGrupo(semNome.id); toast.error('Não salvou — falta o nome de uma instituição.'); return; }
    const problema = validarCadastro(todas);
    if (problema) {
      setErro(problema);
      const g = linhas.find((l) => l.id === problema.id)?.grupo;
      if (g) abrirGrupo(g);
      toast.error(`Não salvou — ${problema.motivo}.`);
      return;
    }
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
      for (const l of mudadas.filter((x) => !x.excluir)) {
        if (l.novo) await criarInvestimento({ ...dadosDoCadastro(l), ordem: ordens.get(l.id) });
        else {
          const dif = { ...diferencaDoCadastro(l), ...(ordens.has(l.id) ? { ordem: ordens.get(l.id) } : {}) };
          if (Object.keys(dif).length) await atualizarInvestimento(l.id, dif);
        }
      }
      const reaplica = passamAReaplicar.length ? ` Os próximos vencimentos de ${passamAReaplicar.map((l) => `"${l.nome.trim()}"`).join(', ')} o app reaplica sozinho.` : '';
      toast.success(`${nAlt === 1 ? 'Alteração salva.' : `${nAlt} alterações salvas.`}${reaplica}`);
    } catch (err) {
      toast.error(/indexador/i.test(err.message) ? 'Falta aplicar a migration 025 (o índice do investimento).'
        : /vence_dia_util/i.test(err.message) ? 'Falta aplicar a migration 023 (o vencimento no fim de semana).'
        : /no_vencimento|nao_reaplicar/i.test(err.message) ? 'Falta aplicar a migration 022 (o que acontece no vencimento).'
        : /inv_cadastro|schema cache|does not exist/i.test(err.message) ? 'Falta aplicar a migration 020 (a carteira do zero).' : err.message);
    }
    setSalvando(false);
    onSalvo(); // parte pode ter gravado: a tela recarrega com o que ficou no banco
  };

  // Enter desce na mesma coluna (pulando os campos dos grupos recolhidos)
  const aoTeclar = (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const col = e.currentTarget.dataset.cadCol;
    const todos = [...caixaRef.current.querySelectorAll(`[data-cad-col="${col}"]`)].filter((el) => el.offsetParent);
    todos[todos.indexOf(e.currentTarget) + 1]?.focus();
  };
  const ver = (id, campo) => (erro?.id === id && erro.campo === campo ? '!border-hx-e5484d' : '');
  const th = 'h-8 border-b border-gray-200 bg-hx-f9fafb px-2 text-left text-[10.5px] font-semibold uppercase tracking-wide text-gray-500';
  // a linha de cima do cabeçalho: os GRUPOS de colunas, com o traço embaixo
  const thGrupo = (rotulo, n) => (
    <th colSpan={n} className="bg-hx-f9fafb px-2 pb-0 pt-2.5 text-left align-bottom">
      <span className="block border-b border-gray-300 pb-1 text-[10px] font-semibold uppercase tracking-[0.07em] text-gray-600">{rotulo}</span>
    </th>
  );
  const td = 'border-b border-gray-100 px-1.5 py-1.5 align-middle';
  const inp = 'input !h-8 text-[12.5px]';
  const ativos = linhas.filter((l) => !l.excluir && l.ativo && !linhaVaziaDoCadastro(l)).length;
  const linhaCls = (id, extra = '') => `group/linha transition-[opacity,transform] duration-200 ease-out ${arrasto.dragId === id ? '!opacity-40' : ''} ${extra}`;

  const desenhar = ({ linha: x, estado }) => {
    const attrs = atributosLinha(x.id, estado);
    if (x.tipo === 'grupo') {
      const { g } = x;
      const aberto = !fechadas.has(g.id);
      return (
        <tr key={x.id} {...arrasto.itemProps(x.id)} {...attrs} className={linhaCls(x.id)}>
          <td colSpan={8} className="relative h-[46px] border-b border-gray-200 bg-hx-f3f4f6 py-0 pl-1.5 pr-3">
            <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-0 w-[3px]" style={{ background: cor(g.id) }} />
            <span className="flex items-center gap-1">
              <Alca props={alca(x.id)} rotulo="Arraste para mudar a ordem das instituições" />
              <Seta aberto={aberto} onClick={() => alternar(g.id)} rotulo={aberto ? `Recolher ${g.nome || 'a instituição'}` : `Abrir ${g.nome || 'a instituição'}`} />
              <input data-cad-grupo={g.id} className={`input !h-8 !w-[280px] !px-2 text-[14px] font-semibold ${ver(g.id, 'grupo')}`}
                value={g.nome} placeholder="Instituição (ex.: Nubank, XP)" onChange={(e) => mudaGrupo(g.id, e.target.value)} aria-label="Nome da instituição" />
              {!g.orig && <span className="shrink-0 rounded-[4px] bg-hx-dcfce7 px-1.5 py-0.5 text-[11px] font-semibold text-hx-166534">nova instituição</span>}
              <span className="shrink-0 whitespace-nowrap pl-1 text-[11.5px] text-gray-500">{plural(x.n, 'investimento', 'investimentos')}</span>
              <span className="flex-1" />
              <button type="button" onClick={() => adicionar(g.id)}
                className="inline-flex shrink-0 items-center gap-2 rounded-[5px] px-2 py-1 text-[12px] font-medium text-gray-600 opacity-0 transition-[opacity,color,background-color] hover:bg-gray-200 hover:text-gray-900 focus-visible:opacity-100 group-hover/linha:opacity-100">
                <CirculoMais />investimento
              </button>
            </span>
          </td>
        </tr>
      );
    }
    if (x.tipo === 'add') {
      return (
        <tr key={x.id} {...attrs} className="transition-[opacity,transform] duration-200 ease-out">
          <td colSpan={8} className="border-b border-gray-100 py-1 pl-[66px] pr-2">
            <button type="button" onClick={() => adicionar(x.g.id)}
              className="inline-flex items-center gap-2 rounded-[5px] px-2 py-1.5 text-[12.5px] font-medium text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900">
              <CirculoMais />Adicionar investimento{x.g.nome.trim() ? ` em ${x.g.nome.trim()}` : ''}
            </button>
          </td>
        </tr>
      );
    }
    if (x.tipo === 'fim') {
      return (
        <tr key={x.id} {...attrs} className="transition-[opacity,transform] duration-200 ease-out">
          <td colSpan={8} className="px-2 py-2.5">
            <button type="button" onClick={novaInstituicao}
              className="inline-flex items-center gap-2 rounded-[5px] px-2 py-1.5 text-[12.5px] font-semibold text-gray-700 transition-colors hover:bg-gray-100 hover:text-gray-900">
              <CirculoMais borda="text-gray-500" />Nova instituição
            </button>
            <span className="ml-2 text-[12px] text-gray-400">o banco ou a corretora (Nubank, XP, Inter…)</span>
          </td>
        </tr>
      );
    }
    const { l } = x;
    const mudou = l.novo ? !linhaVaziaDoCadastro(l) : !l.excluir && (Object.keys(diferencaDoCadastro(comInstituicao(l))).length > 0 || mudouOrdem(l));
    const n = aportesPorInv[l.id] ?? 0;
    return (
      <tr key={x.id} {...arrasto.itemProps(x.id)} {...attrs}
        className={linhaCls(x.id, `hover:bg-hx-f9fafb ${l.excluir ? 'opacity-50' : !l.ativo ? 'opacity-70' : ''}`)}>
        <td className={`${td} pl-[44px]`} style={mudou ? { boxShadow: 'inset 3px 0 0 #f59e0b' } : undefined}>
          <span className="flex items-center gap-1">
            <Alca props={alca(x.id)} rotulo="Arraste para mudar a ordem (ou solte em outra instituição)" />
            <input data-cad-linha={l.id} data-cad-col="nome" onKeyDown={aoTeclar} className={`${inp} !px-2 text-[13px] font-medium ${l.excluir ? 'line-through' : ''} ${ver(l.id, 'nome')}`}
              disabled={l.excluir} value={l.nome} placeholder="Ex.: RDB Planejado, CDB 2 anos" onChange={(e) => muda(l.id, 'nome', e.target.value)} />
            {l.novo && !linhaVaziaDoCadastro(l) && <span className="shrink-0 rounded-[4px] bg-hx-dcfce7 px-1.5 py-0.5 text-[11px] font-semibold text-hx-166534">novo</span>}
          </span>
        </td>
        <td className={td}><SelectSimples value={l.tipo} onChange={(v) => muda(l.id, 'tipo', v)} opcoes={TIPOS} disabled={l.excluir} compacto /></td>
        <td className={td}>
          <span className="flex items-center gap-1">
            <div className="w-[112px] shrink-0">
              {com025 ? <SelectSimples value={l.indexador ?? 'cdi'} onChange={(v) => muda(l.id, 'indexador', v)} opcoes={INDEXADORES} disabled={l.excluir} compacto />
                : <Tooltip label="Falta aplicar a migration 025 (o índice do investimento)"><span className="flex h-8 items-center px-3 text-[12.5px] text-gray-400">% do CDI</span></Tooltip>}
            </div>
            <input data-cad-col="taxa" onKeyDown={aoTeclar} className={`${inp} !w-[72px] text-right tabular-nums ${ver(l.id, 'taxa')}`} inputMode="decimal"
              value={l.taxa} placeholder={l.indexador === 'ipca' ? '6,5' : l.indexador === 'pre' ? '12' : '100'} disabled={l.excluir} onChange={(e) => muda(l.id, 'taxa', e.target.value)} aria-label={`Taxa de ${l.nome || 'investimento'}`} />
            <span className="whitespace-nowrap text-[12px] text-gray-500">{l.indexador === 'cdi' || !l.indexador ? '%' : '% a.a.'}</span>
          </span>
        </td>
        <td className={td}><SelectSimples value={l.resgate} onChange={(v) => muda(l.id, 'resgate', v)} opcoes={RESGATES} disabled={l.excluir} compacto /></td>
        <td className={td}>
          <div className="flex h-8 items-center gap-1.5">
            <div className="w-[124px] shrink-0">
              <SelectSimples value={l.prazo_meses} onChange={(v) => muda(l.id, 'prazo_meses', v)} opcoes={PRAZOS} disabled={l.excluir} compacto className={ver(l.id, 'prazo_meses')} />
            </div>
            {l.prazo_meses && (
              <Pilula ligado={!!l.vence_dia_antes} onChange={(v) => muda(l.id, 'vence_dia_antes', v)} disabled={l.excluir}
                dica="Vence um dia antes de completar o prazo, como o RDB do Nubank: aplicado em 03/06 com 6 meses, vence em 02/12.">−1 dia</Pilula>
            )}
            {l.prazo_meses && (
              <Pilula ligado={!!l.vence_dia_util} onChange={(v) => muda(l.id, 'vence_dia_util', v)} disabled={l.excluir || !com023}
                dica={com023 ? 'Ligado: o vencimento que cai no sábado ou no domingo vai para a segunda (como a XP). Desligado: vence no dia (como o Nubank).' : 'Falta aplicar a migration 023 (o vencimento no fim de semana)'}>fds → seg.</Pilula>
            )}
          </div>
        </td>
        <td className={td}>
          {com022 ? <SelectSimples value={l.no_vencimento} onChange={(v) => muda(l.id, 'no_vencimento', v)} opcoes={NO_VENCIMENTO} disabled={l.excluir} compacto />
            : <Tooltip label="Falta aplicar a migration 022 (o que acontece no vencimento)"><span className="flex h-8 items-center px-3 text-[12.5px] text-gray-400">volta para a conta</span></Tooltip>}
        </td>
        <td className={`${td} pr-3 text-right tabular-nums text-gray-500`}>{l.novo ? '—' : n}</td>
        <td className={`${td} text-right`}>
          <span className="inline-flex items-center gap-0.5">
            {!l.novo && (
              <Tooltip label={l.ativo ? 'Ativo (desligue quando não usar mais)' : 'Desativado'}>
                <span className="inline-flex h-8 items-center px-1"><Toggle compacto checked={l.ativo} onChange={(v) => muda(l.id, 'ativo', v)} disabled={l.excluir} rotulo="Ativo" /></span>
              </Tooltip>
            )}
            <Tooltip label={n ? 'Tem aportes: exclua os aportes antes, ou desative' : l.excluir ? 'Não excluir' : 'Excluir (ao salvar)'}>
              <button type="button" disabled={n > 0} aria-label={l.excluir ? 'Não excluir' : 'Excluir'}
                onClick={() => (l.novo ? setLinhas((ls2) => ls2.filter((y) => y.id !== l.id)) : muda(l.id, 'excluir', !l.excluir))}
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
  };

  // o ⇕ no cabeçalho do pop-up, no trilho do DRE
  const acoes = grupos.length > 0 && (
    <TrilhoFaixa className="mr-1 shrink-0">
      <Tooltip label={tudoAberto ? 'Recolher tudo' : 'Expandir tudo'}>
        <button type="button" aria-label={tudoAberto ? 'Recolher tudo' : 'Expandir tudo'}
          onClick={() => setFechadas(tudoAberto ? new Set(grupos.map((g) => g.id)) : new Set())}
          className="inline-flex h-[24px] w-[28px] shrink-0 items-center justify-center rounded-[4px] text-gray-600 transition-colors hover:bg-gray-200 hover:text-gray-900">
          <IconExpandirTudo fechar={tudoAberto} />
        </button>
      </Tooltip>
    </TrilhoFaixa>
  );

  return (
    <Modal open onClose={fechar} title="Cadastro dos investimentos" maxWidth="max-w-[1480px]" padding="p-0" acoes={acoes}
      subtitulo={`${plural(ativos, 'ativo', 'ativos')} em ${plural(grupos.length, 'instituição', 'instituições')} · o que cada um é; o dinheiro entra pelos aportes`}>
      <div ref={caixaRef} className="max-h-[66vh] overflow-auto [scrollbar-gutter:stable]">
        <table className="quieto w-full min-w-[1360px] table-fixed border-separate border-spacing-0 text-[12.5px]">
          <colgroup>
            <col /><col style={{ width: 124 }} /><col style={{ width: 236 }} /><col style={{ width: 160 }} />
            <col style={{ width: 290 }} /><col style={{ width: 176 }} /><col style={{ width: 72 }} /><col style={{ width: 84 }} />
          </colgroup>
          <thead className="sticky top-0 z-10">
            <tr>{thGrupo('O que é', 2)}{thGrupo('Quanto rende', 1)}{thGrupo('Quando o dinheiro sai', 3)}{thGrupo('Hoje', 2)}</tr>
            <tr>
              <th className={`${th} pl-[74px]`}>Nome</th><th className={`${th} pl-[19px]`}>Tipo</th>
              <th className={`${th} pl-[19px]`}><Tooltip label="O índice e a taxa: 102,5% do CDI · IPCA + 6,5% ao ano · prefixado a 12% ao ano. LCI e LCA (o Tipo) são isentas de IR em qualquer índice."><span className="cursor-help">Rende</span></Tooltip></th>
              <th className={`${th} pl-[19px]`}>Resgate</th>
              <th className={`${th} pl-[19px]`}><Tooltip label={'O prazo que sugere o vencimento de cada aporte novo. As pílulas ajustam a data: "−1 dia" (vence um dia antes de completar) e "fds → seg." (o fim de semana vai para a segunda).'}><span className="cursor-help">Vence em</span></Tooltip></th>
              <th className={`${th} pl-[19px]`}><Tooltip label={'Volta para a conta: o aporte encerra no dia. Reaplica sozinho: no dia, o app lança o aporte novo com o valor menos o IR (o IR recomeça) e o prazo de "Vence em".'}><span className="cursor-help">No vencimento</span></Tooltip></th>
              <th className={`${th} pr-3 text-right`}>Aportes</th><th className={`${th} text-right`}>Ativo</th>
            </tr>
          </thead>
          <tbody ref={arrasto.containerRef}>
            {desenhadas.map(desenhar)}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-gray-200 bg-hx-f9fafb px-4 py-3">
        <span className="text-[12px] text-gray-500">
          {nAlt ? <><b className="font-semibold text-hx-92400e">{plural(nAlt, 'alteração', 'alterações')}</b> · ainda não salvo</>
            : 'Enter desce na mesma coluna · arraste pela ⠿ para mudar a ordem (vale na carteira) · mudar a taxa muda a conta de todos os aportes'}
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
