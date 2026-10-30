import { useMemo, useRef, useState } from 'react';
import Modal from './Modal.jsx';
import SelectSimples from './SelectSimples.jsx';
import Toggle from './Toggle.jsx';
import { IconGrip } from './icons.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { useConfirmacao } from '../context/ConfirmContext.jsx';
import { atualizarCategoria, atualizarGrupo, excluirCategoria, excluirGrupo, juntarCategoria, salvarCategoria, salvarGrupo } from '../api/cadastros.js';
import { alteracoes, diferencaCategoria, diferencaGrupo, ficamNoGrupo, reorganizar, totalAlteracoes, validar } from '../lib/cadastroCategorias.js';
import { CORES_GRUPO } from '../lib/sugestoes.js';
import { useListaArrastavel } from '../lib/useListaArrastavel.js';

// O CADASTRO DAS CATEGORIAS NUM POP-UP (29/10/2026, opção A do mockup "Categorias · gerir mais fácil"), no jeito do
// cadastro dos fixos (`ModalCadastroFixos`): os grupos como linhas de cabeçalho e as categorias embaixo, numa tabela
// de FORMULÁRIO. Renomeia, troca o grupo (move), a cor e o tipo do grupo, ativa; a alça ⠿ arrasta — dentro do grupo
// muda a ordem, para baixo de outro cabeçalho move; ↑ ↓ ordenam os grupos. Acrescenta ("+ categoria", "Novo grupo"),
// marca para excluir, e "Salvar alterações (N)" grava só a diferença (as contas em `lib/cadastroCategorias.js`).
// MARCANDO categorias, a barra de baixo vira a de ação: Mover para, Juntar em uma (os lançamentos, fixos e regras
// das outras passam para a que fica — feito ao salvar, com confirmação) e Desativar. Excluir uma categoria com
// lançamentos não dá: o caminho é juntar (ou desativar).
//
// `qtd`: { categoria_id: lançamentos (todo o histórico) }. `regras`: { categoria_id: regras }.

const TIPOS = [{ value: 'saida', label: 'Gasto' }, { value: 'entrada', label: 'Entrada' }];
const semAcento = (s) => String(s || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
let seq = 0;
const novoId = () => `novo-${(seq += 1)}`;

// `pos`: a posição ao abrir (a ordem só conta como alteração na lista que a pessoa mexeu — `ordens`).
const doGrupo = (g, pos) => ({ id: g.id, pos, novo: false, excluir: false, orig: g, nome: g.nome, tipo: g.tipo, cor: g.cor });
const daCategoria = (c, pos) => ({ id: c.id, pos, novo: false, excluir: false, juntarEm: null, orig: c, nome: c.nome, grupo_id: c.grupo_id, ativa: c.ativa });

export default function ModalCadastroCategorias({ grupos: gruposBanco, categorias, qtd = {}, regras = {}, onFechar, onSalvo }) {
  const toast = useToast();
  const confirmar = useConfirmacao();
  const [grupos, setGrupos] = useState(() => gruposBanco.map(doGrupo));
  const [cats, setCats] = useState(() => {
    // na ordem dos grupos (a lista já vem por grupo e ordem)
    const ordemG = new Map(gruposBanco.map((g, i) => [g.id, i]));
    return [...categorias].sort((a, b) => (ordemG.get(a.grupo_id) ?? 0) - (ordemG.get(b.grupo_id) ?? 0)).map(daCategoria);
  });
  const [busca, setBusca] = useState('');
  const [soAtivas, setSoAtivas] = useState(false);
  const [marcadas, setMarcadas] = useState(() => new Set());
  const [juntando, setJuntando] = useState(null); // o id da que fica, enquanto escolhe
  const [corAberta, setCorAberta] = useState(null);
  const [erro, setErro] = useState(null); // { id, campo }
  const [salvando, setSalvando] = useState(false);
  const corpoRef = useRef(null);

  const nomeDe = (id) => cats.find((c) => c.id === id)?.nome || 'a categoria';
  const t = semAcento(busca).trim();
  const filtrando = !!t || soAtivas;
  // As linhas da tabela: cada grupo e as categorias dele (filtradas). Buscando, o grupo cujo nome casa vem inteiro.
  const linhas = useMemo(() => grupos.flatMap((g) => {
    const doG = cats.filter((c) => c.grupo_id === g.id);
    const grupoCasa = t && semAcento(g.nome).includes(t);
    const itens = doG.filter((c) => (!soAtivas || c.ativa || c.novo) && (!t || grupoCasa || c.novo || semAcento(c.nome).includes(t)));
    if (t && !grupoCasa && !itens.length && !g.novo) return [];
    return [{ id: `g:${g.id}`, grupo: g, n: ficamNoGrupo(cats, g.id).length }, ...itens.map((c) => ({ id: `c:${c.id}`, cat: c, grupo: g }))];
  }), [grupos, cats, t, soAtivas]);

  const arrasto = useListaArrastavel({
    ids: linhas.map((x) => x.id),
    onReordenar: (ids) => setCats((cs) => reorganizar(ids, cs)),
  });

  const alt = alteracoes(grupos, cats);
  const nAlt = totalAlteracoes(alt);
  const mudaGrupo = (id, campo, v) => { setGrupos((gs) => gs.map((g) => (g.id === id ? { ...g, [campo]: v } : g))); setErro(null); };
  const mudaCat = (id, campo, v) => { setCats((cs) => cs.map((c) => (c.id === id ? { ...c, [campo]: v } : c))); setErro(null); };
  // Mover para outro grupo: vai para o FIM dele (é o que se espera de "mover para").
  const moverPara = (ids, grupoId) => setCats((cs) => {
    const vao = cs.filter((c) => ids.includes(c.id)).map((c) => ({ ...c, grupo_id: grupoId }));
    const ficam = cs.filter((c) => !ids.includes(c.id));
    const ultimo = ficam.map((c) => c.grupo_id).lastIndexOf(grupoId);
    const at = ultimo < 0 ? ficam.length : ultimo + 1;
    return [...ficam.slice(0, at), ...vao, ...ficam.slice(at)];
  });
  const subirGrupo = (id, passo) => setGrupos((gs) => {
    const i = gs.findIndex((g) => g.id === id);
    const j = i + passo;
    if (j < 0 || j >= gs.length) return gs;
    const n = [...gs];
    [n[i], n[j]] = [n[j], n[i]];
    return n;
  });
  const focar = (id) => setTimeout(() => {
    const el = corpoRef.current?.querySelector(`[data-nome="${id}"]`);
    el?.focus();
    el?.scrollIntoView({ block: 'nearest' });
  }, 30);
  const novaCategoria = (grupoId) => {
    const c = { id: novoId(), novo: true, excluir: false, juntarEm: null, orig: null, nome: '', grupo_id: grupoId, ativa: true };
    setCats((cs) => {
      const ultimo = cs.map((x) => x.grupo_id).lastIndexOf(grupoId);
      return [...cs.slice(0, ultimo + 1), c, ...cs.slice(ultimo + 1)];
    });
    setBusca(''); setSoAtivas(false);
    focar(c.id);
  };
  const novoGrupo = () => {
    const usadas = new Set(grupos.map((g) => g.cor));
    const g = { id: novoId(), novo: true, excluir: false, orig: null, nome: '', tipo: 'saida', cor: CORES_GRUPO.find((c) => !usadas.has(c)) ?? CORES_GRUPO[0] };
    setGrupos((gs) => [...gs, g]);
    setBusca(''); setSoAtivas(false);
    focar(g.id);
  };
  const alternarMarca = (id) => setMarcadas((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const listaMarcadas = cats.filter((c) => marcadas.has(c.id));
  const desmarcar = () => { setMarcadas(new Set()); setJuntando(null); };

  const juntar = () => {
    const fica = juntando;
    setCats((cs) => cs.map((c) => (marcadas.has(c.id) && c.id !== fica ? { ...c, juntarEm: fica } : c)));
    desmarcar();
  };

  const fechar = async () => {
    if (nAlt && !(await confirmar({ titulo: 'Descartar as alterações?', texto: `${plural(nAlt, 'alteração ainda não foi salva', 'alterações ainda não foram salvas')}.`, confirmar: 'Descartar', perigo: true }))) return;
    onFechar();
  };

  const salvar = async () => {
    const problema = validar(grupos, cats);
    if (problema) { setErro(problema); toast.error(`Não salvou — ${problema.motivo}.`); return; }
    const { gruposNovos, gruposMudados, gruposExcluir, catsNovas, catsMudadas, catsJuntar, catsExcluir, ordens } = alt;
    if (catsJuntar.length || catsExcluir.length || gruposExcluir.length) {
      const partes = [
        ...catsJuntar.map((c) => `"${c.nome}" junta em "${nomeDe(c.juntarEm)}"${qtd[c.id] ? ` (${plural(qtd[c.id], 'lançamento passa', 'lançamentos passam')})` : ''}`),
        ...catsExcluir.map((c) => `exclui "${c.nome}"${regras[c.id] ? (regras[c.id] === 1 ? ' e a regra dela' : ` e as ${regras[c.id]} regras dela`) : ''}`),
        ...gruposExcluir.map((g) => `exclui o grupo "${g.nome}"`),
      ];
      if (!(await confirmar({ titulo: 'Salvar estas alterações?', texto: `${partes.join('; ')}. Juntar e excluir não se desfazem.`, confirmar: 'Salvar', perigo: true }))) return;
    }
    setSalvando(true);
    try {
      // 1) os grupos novos (os ids deles só existem agora) e os mudados
      const real = new Map();
      for (const g of gruposNovos) real.set(g.id, (await salvarGrupo({ ...diferencaGrupo(g, ordens.grupo.get(g.id)) })).id);
      const idReal = (id) => real.get(id) ?? id;
      for (const g of gruposMudados) await atualizarGrupo(g.id, diferencaGrupo(g, ordens.grupo.get(g.id)));
      // 2) as categorias: novas, mudadas, juntadas (move tudo e apaga) e excluídas
      for (const c of catsNovas) await salvarCategoria(diferencaCategoria(c, ordens.categoria.get(c.id), idReal(c.grupo_id)));
      for (const c of catsMudadas) await atualizarCategoria(c.id, diferencaCategoria(c, ordens.categoria.get(c.id), idReal(c.grupo_id)));
      for (const c of catsJuntar) await juntarCategoria(c.id, c.juntarEm);
      for (const c of catsExcluir) await excluirCategoria(c.id);
      // 3) por último, os grupos que saem (já vazios)
      for (const g of gruposExcluir) await excluirGrupo(g.id);
      toast.success(nAlt === 1 ? 'Alteração salva.' : `${nAlt} alterações salvas.`);
      onSalvo();
    } catch (err) {
      toast.error(/duplicate|unique/i.test(err.message) ? 'Já existe uma categoria ou grupo com esse nome.' : err.message);
      setSalvando(false);
      onSalvo(); // parte pode ter gravado: fecha e a tela recarrega com o que ficou no banco
    }
  };

  const borda = (id, campo) => (erro?.id === id && erro.campo === campo ? '!border-hx-e5484d' : '');
  const th = 'sticky top-0 z-10 h-8 border-b border-gray-200 bg-hx-f9fafb px-2 text-left text-[10.5px] font-semibold uppercase tracking-wide text-gray-500';
  const td = 'border-b border-gray-100 px-2 py-1.5';
  const opcoesGrupo = grupos.filter((g) => !g.excluir).map((g) => ({ value: g.id, label: g.nome || '(grupo novo)' }));
  const visiveisN = cats.filter((c) => !c.excluir && !c.juntarEm).length;

  const acoes = (
    <input className="input !h-8 w-[220px] text-[12.5px]" placeholder="Buscar categoria ou grupo" value={busca} onChange={(e) => setBusca(e.target.value)} />
  );

  return (
    <Modal open onClose={fechar} title="Cadastro das categorias" maxWidth="max-w-[min(1280px,96vw)]" padding="p-0" acoes={acoes}
      subtitulo={`${plural(grupos.filter((g) => !g.excluir).length, 'grupo', 'grupos')} · ${plural(visiveisN, 'categoria', 'categorias')} · arraste ⠿ para ordenar ou mover de grupo`}>
      <div className="flex items-center gap-4 px-4 py-2.5">
        <label className="inline-flex cursor-pointer items-center gap-2 text-[12.5px] text-gray-600">
          <Toggle compacto checked={soAtivas} onChange={setSoAtivas} rotulo="Só as ativas" /> Só as ativas
        </label>
        {filtrando && <span className="text-[11.5px] text-gray-400">Com busca ou filtro, a alça não arrasta (a lista está parcial).</span>}
        <span className="flex-1" />
        <button type="button" className="btn-secondary !h-8 !px-3 !text-[12.5px]" onClick={novoGrupo}>+ Novo grupo</button>
      </div>
      <div ref={corpoRef} className="max-h-[calc(90vh-190px)] min-h-[240px] overflow-auto border-t border-gray-100 [scrollbar-gutter:stable]">
        <table className="w-full min-w-[900px] table-fixed border-separate border-spacing-0 text-[12.5px]">
          <colgroup>
            <col style={{ width: 34 }} /><col style={{ width: 30 }} /><col /><col style={{ width: 200 }} />
            <col style={{ width: 104 }} /><col style={{ width: 70 }} /><col style={{ width: 60 }} /><col style={{ width: 120 }} />
          </colgroup>
          <thead>
            <tr>
              <th className={th} aria-label="Marcar" /><th className={th} aria-label="Ordem" /><th className={th}>Nome</th><th className={th}>Grupo / tipo</th>
              <th className={`${th} text-right`} title="Lançamentos em todo o histórico">Lançamentos</th><th className={`${th} text-right`}>Regras</th>
              <th className={th}>Ativa</th><th className={th} />
            </tr>
          </thead>
          <tbody ref={arrasto.containerRef}>
            {linhas.map((x) => {
              if (!x.cat) {
                const g = x.grupo;
                const i = grupos.indexOf(g);
                const mudou = g.novo || (!g.excluir && Object.keys(diferencaGrupo(g, alt.ordens.grupo.get(g.id))).length > 0);
                return [
                  <tr key={x.id} {...arrasto.itemProps(x.id)} className={`transition-[opacity,transform] duration-200 ease-out ${g.excluir ? 'opacity-45' : ''}`}>
                    <td className={`${td} bg-hx-f6f7f8`} style={mudou && !g.excluir ? { boxShadow: 'inset 3px 0 0 #f59e0b' } : undefined} />
                    <td className={`${td} bg-hx-f6f7f8 !px-0`}>
                      <span className="flex flex-col items-center leading-none">
                        <button type="button" disabled={i === 0} onClick={() => subirGrupo(g.id, -1)} title="Subir o grupo"
                          className="h-3.5 w-5 text-[10px] text-gray-400 hover:text-gray-700 disabled:opacity-30">▲</button>
                        <button type="button" disabled={i === grupos.length - 1} onClick={() => subirGrupo(g.id, 1)} title="Descer o grupo"
                          className="h-3.5 w-5 text-[10px] text-gray-400 hover:text-gray-700 disabled:opacity-30">▼</button>
                      </span>
                    </td>
                    <td className={`${td} bg-hx-f6f7f8`}>
                      <span className="flex items-center gap-2">
                        <button type="button" onClick={() => setCorAberta(corAberta === g.id ? null : g.id)} disabled={g.excluir} title="Cor do grupo"
                          className="h-5 w-5 shrink-0 rounded-[5px] ring-1 ring-black/10 transition-transform hover:scale-110" style={{ background: g.cor }} />
                        <input data-nome={g.id} className={`input !h-8 font-semibold text-[12.5px] ${g.excluir ? 'line-through' : ''} ${borda(g.id, 'nome')}`} disabled={g.excluir}
                          value={g.nome} placeholder="Nome do grupo" onChange={(e) => mudaGrupo(g.id, 'nome', e.target.value)} />
                      </span>
                    </td>
                    <td className={`${td} bg-hx-f6f7f8`}>
                      <SelectSimples value={g.tipo} onChange={(v) => mudaGrupo(g.id, 'tipo', v)} opcoes={TIPOS} disabled={g.excluir} className="!h-8 text-[12.5px]" />
                    </td>
                    <td className={`${td} bg-hx-f6f7f8 text-right text-[11.5px] text-gray-400`} colSpan={3}>{plural(x.n, 'categoria', 'categorias')}</td>
                    <td className={`${td} bg-hx-f6f7f8`}>
                      <span className="flex items-center justify-end gap-1">
                        <button type="button" onClick={() => novaCategoria(g.id)} disabled={g.excluir}
                          className="inline-flex h-7 items-center gap-1 rounded-[4px] px-1.5 text-[11.5px] font-medium text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-800">+ categoria</button>
                        <BotaoLixo marcado={g.excluir} bloqueado={x.n > 0 && !g.excluir} titulo={x.n > 0 ? 'Só sai o grupo vazio: mova as categorias antes' : g.excluir ? 'Não excluir' : 'Excluir o grupo (ao salvar)'}
                          onClick={() => (g.novo ? setGrupos((gs) => gs.filter((y) => y.id !== g.id)) : mudaGrupo(g.id, 'excluir', !g.excluir))} />
                      </span>
                    </td>
                  </tr>,
                  corAberta === g.id && (
                    <tr key={`${x.id}:cor`}>
                      <td colSpan={8} className="border-b border-gray-100 bg-hx-f9fafb px-4 py-2">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="mr-1 text-[11.5px] text-gray-500">Cor de {g.nome || 'o grupo novo'}:</span>
                          {CORES_GRUPO.map((cor) => (
                            <button key={cor} type="button" aria-label={`Cor ${cor}`} onClick={() => { mudaGrupo(g.id, 'cor', cor); setCorAberta(null); }}
                              className={`h-6 w-6 rounded-md transition ${g.cor === cor ? 'ring-2 ring-gray-800 ring-offset-2' : 'hover:scale-110'}`} style={{ background: cor }} />
                          ))}
                        </span>
                      </td>
                    </tr>
                  ),
                ];
              }
              const c = x.cat;
              const sai = c.excluir || !!c.juntarEm;
              const n = qtd[c.id] ?? 0;
              const mudou = c.novo || (!sai && Object.keys(diferencaCategoria(c, alt.ordens.categoria.get(c.id))).length > 0);
              return (
                // A classe de transição é obrigatória para o FLIP do arraste (os vizinhos deslizam).
                <tr key={x.id} {...arrasto.itemProps(x.id)}
                  className={`transition-[opacity,transform] duration-200 ease-out ${sai ? 'opacity-50' : ''} ${marcadas.has(c.id) ? 'bg-blue-50' : ''} ${
                    arrasto.dragId === x.id ? '!opacity-40' : ''}`}>
                  <td className={`${td} text-center`} style={mudou && !sai ? { boxShadow: 'inset 3px 0 0 #f59e0b' } : undefined}>
                    {!c.novo && !sai && (
                      <input type="checkbox" checked={marcadas.has(c.id)} onChange={() => alternarMarca(c.id)} aria-label={`Marcar ${c.nome}`} className="h-3.5 w-3.5 cursor-pointer accent-gray-800" />
                    )}
                  </td>
                  <td className={`${td} !px-0`}>
                    {!filtrando && !sai ? (
                      <span {...arrasto.alcaProps(x.id)} title="Arraste para mudar a ordem ou o grupo"
                        className="mx-auto flex h-8 w-5 cursor-grab items-center justify-center rounded-[4px] text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 active:cursor-grabbing">
                        <IconGrip />
                      </span>
                    ) : <span className="mx-auto flex h-8 w-5 items-center justify-center text-gray-200"><IconGrip /></span>}
                  </td>
                  <td className={`${td} pl-9`}>
                    <span className="flex items-center gap-2">
                      <input data-nome={c.id} className={`input !h-8 text-[12.5px] ${sai ? 'line-through' : ''} ${!c.ativa && !sai ? 'text-gray-400' : ''} ${borda(c.id, 'nome')}`}
                        disabled={sai} value={c.nome} placeholder="Nome da categoria" onChange={(e) => mudaCat(c.id, 'nome', e.target.value)} />
                      {c.juntarEm && <span className="shrink-0 whitespace-nowrap rounded-[4px] bg-hx-fef3c7 px-1.5 py-0.5 text-[11px] font-semibold text-hx-92400e">junta em {nomeDe(c.juntarEm)}</span>}
                      {c.novo && <span className="shrink-0 rounded-[4px] bg-hx-dcfce7 px-1.5 py-0.5 text-[11px] font-semibold text-hx-166534">nova</span>}
                    </span>
                  </td>
                  <td className={td}>
                    {sai ? <span className="px-2 text-gray-400">—</span>
                      : <SelectSimples value={c.grupo_id} onChange={(v) => moverPara([c.id], v)} opcoes={opcoesGrupo} className="!h-8 text-[12.5px]" />}
                  </td>
                  <td className={`${td} text-right tabular-nums text-gray-600`}>{n || <span className="text-gray-300">—</span>}</td>
                  <td className={`${td} text-right tabular-nums text-gray-500`}>{regras[c.id] || <span className="text-gray-300">—</span>}</td>
                  <td className={td}><Toggle compacto checked={c.ativa} disabled={sai} onChange={(v) => mudaCat(c.id, 'ativa', v)} rotulo={`${c.nome} ativa`} /></td>
                  <td className={`${td} text-right`}>
                    <BotaoLixo marcado={sai} bloqueado={!sai && n > 0}
                      titulo={sai ? 'Não excluir / não juntar' : n > 0 ? `Tem ${plural(n, 'lançamento', 'lançamentos')}: marque e junte com outra, ou desative` : 'Excluir (ao salvar)'}
                      onClick={() => {
                        if (c.novo) setCats((cs) => cs.filter((y) => y.id !== c.id));
                        else if (sai) setCats((cs) => cs.map((y) => (y.id === c.id ? { ...y, excluir: false, juntarEm: null } : y)));
                        else mudaCat(c.id, 'excluir', true);
                      }} />
                  </td>
                </tr>
              );
            })}
            {linhas.length === 0 && <tr><td colSpan={8} className="px-4 py-8 text-center text-sm text-gray-400">Nada com “{busca.trim()}”.</td></tr>}
          </tbody>
        </table>
      </div>

      {/* O RODAPÉ: com categorias marcadas, a barra de AÇÃO (mover, juntar, desativar); sem, o resumo e o salvar. */}
      {listaMarcadas.length ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-blue-200 bg-blue-50 px-4 py-3">
          <span className="min-w-0 text-[12.5px] text-gray-700">
            <b className="font-semibold">{plural(listaMarcadas.length, 'marcada', 'marcadas')}</b>
            <span className="ml-1.5 text-gray-500">{listaMarcadas.slice(0, 3).map((c) => c.nome).join(' · ')}{listaMarcadas.length > 3 ? ` +${listaMarcadas.length - 3}` : ''}</span>
          </span>
          <span className="flex-1" />
          {juntando ? (
            <>
              <span className="text-[12.5px] text-gray-600">Fica:</span>
              <SelectSimples value={juntando} onChange={setJuntando} opcoes={listaMarcadas.map((c) => ({ value: c.id, label: c.nome }))} className="!h-8 w-[220px] text-[12.5px]" />
              <button type="button" className="btn-primary !h-8 !px-3 !text-[12.5px]" onClick={juntar}>Juntar {listaMarcadas.length}</button>
              <button type="button" className="btn-secondary !h-8 !px-3 !text-[12.5px]" onClick={() => setJuntando(null)}>Voltar</button>
            </>
          ) : (
            <>
              <SelectSimples value="" onChange={(v) => { moverPara([...marcadas], v); desmarcar(); }} opcoes={opcoesGrupo} placeholder="Mover para…" className="!h-8 w-[180px] text-[12.5px]" />
              <button type="button" className="btn-secondary !h-8 !px-3 !text-[12.5px]" disabled={listaMarcadas.length < 2}
                title={listaMarcadas.length < 2 ? 'Marque duas ou mais' : 'Os lançamentos, fixos e regras das outras passam para a que fica'}
                onClick={() => setJuntando([...listaMarcadas].sort((a, b) => (qtd[b.id] ?? 0) - (qtd[a.id] ?? 0))[0].id)}>Juntar em uma…</button>
              <button type="button" className="btn-secondary !h-8 !px-3 !text-[12.5px]"
                onClick={() => { const ativar = listaMarcadas.every((c) => !c.ativa); setCats((cs) => cs.map((c) => (marcadas.has(c.id) ? { ...c, ativa: ativar } : c))); desmarcar(); }}>
                {listaMarcadas.every((c) => !c.ativa) ? 'Ativar' : 'Desativar'}
              </button>
              <button type="button" onClick={desmarcar} className="text-[12px] text-gray-500 underline underline-offset-2 hover:text-gray-800">Desmarcar</button>
            </>
          )}
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-gray-200 bg-hx-f9fafb px-4 py-3">
          <span className="text-[12px] text-gray-500">
            {nAlt ? <><b className="font-semibold text-hx-92400e">{plural(nAlt, 'alteração', 'alterações')}</b> · ainda não salvo</>
              : 'Marque categorias para mover, juntar ou desativar várias de uma vez.'}
          </span>
          <span className="flex-1" />
          <button type="button" className="btn-secondary" onClick={fechar} disabled={salvando}>Cancelar</button>
          <button type="button" className="btn-primary" onClick={salvar} disabled={salvando || !nAlt}>
            {salvando ? 'Salvando…' : nAlt ? `Salvar alterações (${nAlt})` : 'Salvar alterações'}
          </button>
        </div>
      )}
    </Modal>
  );
}

const Ico = ({ children }) => (
  <svg viewBox="0 0 24 24" className="h-[14px] w-[14px]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
);
function BotaoLixo({ marcado, bloqueado, titulo, onClick }) {
  return (
    <button type="button" onClick={onClick} disabled={bloqueado} title={titulo} aria-label={titulo}
      className={`inline-flex h-7 w-7 items-center justify-center rounded-[4px] transition-colors duration-[120ms] disabled:cursor-not-allowed disabled:opacity-30 ${
        marcado ? 'bg-hx-fdeaea text-hx-c0393d' : 'text-gray-400 enabled:hover:bg-hx-fdeaea enabled:hover:text-hx-c0393d'}`}>
      {marcado ? <Ico><path d="M9 14L4 9l5-5" /><path d="M4 9h11a5 5 0 0 1 0 10h-3" /></Ico> : <Ico><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></Ico>}
    </button>
  );
}
