import { useMemo, useRef, useState } from 'react';
import Modal from './Modal.jsx';
import SeletorCategoria from './SeletorCategoria.jsx';
import { CampoMes } from './CampoData.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { useConfirmacao } from '../context/ConfirmContext.jsx';
import { atualizarRecorrencia, excluirRecorrencia, salvarRecorrencia } from '../api/fixos.js';
import { formatBRL, parseValor, valorParaCampo } from '../lib/dinheiro.js';
import { competenciaAtual, competenciaCurta } from '../lib/format.js';
import { useListaArrastavel } from '../lib/useListaArrastavel.js';
import { IconGrip } from './icons.jsx';

// O CADASTRO DOS GASTOS FIXOS NUM POP-UP (a opção A do mockup, aberto pelo ✎ do cabeçalho): todos os fixos
// numa tabela de FORMULÁRIO — cada célula é um campo de verdade, sem jeito de planilha. Mexe-se em vários
// (o valor padrão de todos, o dia, a categoria, a vigência), acrescenta ou marca para excluir, e
// "Salvar alterações (N)" grava tudo junto; Cancelar (ou fechar) descarta, com confirmação se houver
// mudança. Ao lado do padrão, o último valor lançado com ≠ quando difere — clicar o usa como padrão.
// Mudar o padrão não mexe no que já foi lançado: vale para as próximas sugestões.
// A ORDEM (29/10/2026): a alça ⠿ na primeira coluna arrasta a linha (o `useListaArrastavel` do Gestor — o fantasma
// da linha e os vizinhos deslizando); a ordem nova entra nas alterações e vale para a grade e os menus de lançar.
// Precisa da coluna `ordem` (migration 008): sem ela, a alça não aparece. Com busca, não arrasta (a lista é parcial).
//
// `recs`: as recorrências (todas). `ultimos`: { recorrencia_id: { valor_centavos, competencia } }.

const SEM_CATEGORIA = [{ value: '', label: 'Sem categoria' }];
const semAcento = (s) => String(s || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
const mes = (data) => (data ? String(data).slice(0, 7) : '');

const daRec = (r) => ({
  id: r.id, novo: false, orig: r, excluir: false,
  ativa: r.ativa, descricao: r.descricao, categoria_id: r.categoria_id ?? '', dia: String(r.dia_do_mes),
  valor: valorParaCampo(r.valor_padrao_centavos), inicio: mes(r.inicio), fim: mes(r.fim),
});
let seq = 0;
const nova = () => ({
  id: `novo-${(seq += 1)}`, novo: true, orig: null, excluir: false,
  ativa: true, descricao: '', categoria_id: '', dia: '1', valor: '', inicio: competenciaAtual(), fim: '',
});

// Os campos da linha como vão para o banco (ou { erro }).
function paraBanco(l) {
  const valor = parseValor(l.valor || '0');
  const dia = Number(l.dia);
  if (!l.descricao.trim()) return { erro: 'descricao', motivo: 'a descrição está vazia' };
  if (!(Number.isInteger(dia) && dia >= 1 && dia <= 31)) return { erro: 'dia', motivo: 'o dia vai de 1 a 31' };
  if (valor === null || valor < 0) return { erro: 'valor', motivo: `"${l.valor}" não é um valor` };
  if (!/^\d{4}-\d{2}$/.test(l.inicio)) return { erro: 'inicio', motivo: 'falta o mês de início' };
  if (l.fim && l.fim < l.inicio) return { erro: 'fim', motivo: 'o fim é antes do início' };
  return {
    campos: {
      ativa: l.ativa, descricao: l.descricao.trim(), categoria_id: l.categoria_id || null, dia_do_mes: dia,
      valor_padrao_centavos: valor, inicio: `${l.inicio}-01`, fim: l.fim ? `${l.fim}-01` : null,
    },
  };
}

// Só o que mudou em relação ao banco (vazio = linha intacta). `ordem`: a posição da linha (null = sem a coluna).
function diferenca(l, ordem = null) {
  const r = paraBanco(l);
  const campos = r.campos && ordem != null ? { ...r.campos, ordem } : r.campos;
  if (!campos || l.novo) return campos ?? null;
  const o = l.orig;
  const antes = { ativa: o.ativa, descricao: o.descricao, categoria_id: o.categoria_id ?? null, dia_do_mes: o.dia_do_mes,
    valor_padrao_centavos: Number(o.valor_padrao_centavos), inicio: `${mes(o.inicio)}-01`, fim: o.fim ? `${mes(o.fim)}-01` : null, ordem: o.ordem ?? null };
  return Object.fromEntries(Object.entries(campos).filter(([k, v]) => antes[k] !== v));
}
const mudou = (l, ordem = null) => {
  if (l.excluir || l.novo) return true;
  const d = paraBanco(l).campos ? diferenca(l, ordem) : { invalido: true };
  return Object.keys(d).length > 0;
};

export default function ModalCadastroFixos({ recs, categorias, ultimos, onFechar, onSalvo, onCategoriaCriada }) {
  const toast = useToast();
  const confirmar = useConfirmacao();
  const [linhas, setLinhas] = useState(() => recs.map(daRec));
  const [busca, setBusca] = useState('');
  const [erros, setErros] = useState({}); // { id: campo }
  const [salvando, setSalvando] = useState(false);
  const corpoRef = useRef(null);
  const temOrdem = recs.some((r) => 'ordem' in r);
  // A posição de cada linha (só as que ficam): é a `ordem` que vai para o banco.
  const posicao = new Map(linhas.filter((l) => !l.excluir).map((l, i) => [l.id, i]));
  const ordemDe = (l) => (temOrdem ? posicao.get(l.id) ?? null : null);
  const arrasto = useListaArrastavel({
    ids: linhas.map((l) => l.id),
    onReordenar: (ids) => setLinhas((ls) => ids.map((id) => ls.find((l) => l.id === id)).filter(Boolean)),
  });
  const podeArrastar = temOrdem && !busca.trim();

  const mudar = (id, campo, valor) => {
    setLinhas((ls) => ls.map((l) => (l.id === id ? { ...l, [campo]: valor } : l)));
    setErros((e) => (e[id] === campo ? { ...e, [id]: undefined } : e));
  };
  const visiveis = useMemo(() => {
    const t = semAcento(busca).trim();
    if (!t) return linhas;
    const nomeCat = (id) => categorias.find((c) => c.id === id)?.nome ?? '';
    return linhas.filter((l) => l.novo || semAcento(`${l.descricao} ${nomeCat(l.categoria_id)}`).includes(t));
  }, [linhas, busca, categorias]);

  const alteradas = linhas.filter((l) => mudou(l, ordemDe(l))).filter((l) => !(l.novo && l.excluir) && !(l.novo && !l.descricao.trim()));
  const ativos = linhas.filter((l) => l.ativa && !l.excluir);
  const somaAtivos = ativos.reduce((s, l) => s + (parseValor(l.valor || '0') ?? 0), 0);
  const ultimoDe = (l) => (l.novo ? null : ultimos[l.id]);

  const usarUltimo = (lista) => setLinhas((ls) => ls.map((l) => (lista.some((x) => x.id === l.id) ? { ...l, valor: valorParaCampo(ultimos[l.id].valor_centavos) } : l)));
  const adicionar = () => {
    const l = nova();
    setLinhas((ls) => [...ls, l]);
    setBusca('');
    setTimeout(() => {
      const el = corpoRef.current?.querySelector(`[data-desc="${l.id}"]`);
      el?.focus();
      el?.scrollIntoView({ block: 'nearest' });
    }, 30);
  };

  const fechar = async () => {
    if (alteradas.length && !(await confirmar({ titulo: 'Descartar as alterações?', texto: `${plural(alteradas.length, 'gasto fixo foi alterado', 'gastos fixos foram alterados')} e ainda não foi salvo.`, confirmar: 'Descartar', perigo: true }))) return;
    onFechar();
  };

  const salvar = async () => {
    const novosErros = {};
    let primeiro = null;
    alteradas.filter((l) => !l.excluir).forEach((l) => {
      const r = paraBanco(l);
      if (r.erro) { novosErros[l.id] = r.erro; primeiro ??= `${l.descricao || 'Linha nova'}: ${r.motivo}`; }
    });
    setErros(novosErros);
    if (primeiro) { toast.error(`Não salvou — ${primeiro}.`); return; }
    const excluir = alteradas.filter((l) => l.excluir && !l.novo);
    if (excluir.length && !(await confirmar({
      titulo: excluir.length === 1 ? `Excluir o gasto fixo "${excluir[0].descricao}"?` : `Excluir ${excluir.length} gastos fixos?`,
      texto: 'Os lançamentos que eles já geraram continuam. Se só parou de pagar, prefira desativar ou pôr o "termina".',
      confirmar: 'Salvar e excluir', perigo: true,
    }))) return;
    setSalvando(true);
    try {
      for (const l of excluir) await excluirRecorrencia(l.id);
      for (const l of alteradas.filter((x) => x.novo && !x.excluir)) await salvarRecorrencia({ ...paraBanco(l).campos, ordem: ordemDe(l) });
      for (const l of alteradas.filter((x) => !x.novo && !x.excluir)) {
        const d = diferenca(l, ordemDe(l));
        if (Object.keys(d).length) await atualizarRecorrencia(l.id, d);
      }
      toast.success(alteradas.length === 1 ? 'Gasto fixo salvo.' : `${alteradas.length} gastos fixos salvos.`);
      onSalvo();
    } catch (err) {
      toast.error(err.message);
      setSalvando(false);
    }
  };

  const borda = (l, campo) => (erros[l.id] === campo ? '!border-hx-e5484d' : '');
  const th = 'sticky top-0 z-10 h-8 border-b border-gray-200 bg-hx-f9fafb px-2 text-left text-[10.5px] font-semibold uppercase tracking-wide text-gray-500';

  return (
    <Modal open onClose={fechar} title="Cadastro dos gastos fixos" maxWidth="max-w-[1200px]" padding="p-0"
      subtitulo={`${plural(linhas.filter((l) => !l.excluir).length, 'fixo', 'fixos')} · ${plural(ativos.length, 'ativo', 'ativos')} · padrão dos ativos ${formatBRL(somaAtivos)}/mês`}
      acoes={<input className="input !h-8 w-[200px] text-[12.5px]" placeholder="Buscar" value={busca} onChange={(e) => setBusca(e.target.value)} />}>
      <div ref={corpoRef} className="max-h-[62vh] overflow-auto">
        {/* `table-fixed`: as larguras são as do colgroup (o campo de mês nativo, sozinho, pede mais do que precisa
            e espremia a descrição). A descrição fica com o resto. */}
        <table className="w-full min-w-[980px] table-fixed border-separate border-spacing-0 text-[12.5px]">
          <colgroup>
            <col style={{ width: 28 }} /><col style={{ width: 50 }} /><col /><col style={{ width: 200 }} /><col style={{ width: 64 }} />
            <col style={{ width: 180 }} /><col style={{ width: 156 }} /><col style={{ width: 156 }} /><col style={{ width: 44 }} />
          </colgroup>
          <thead>
            <tr>
              <th className={th} aria-label="Ordem" /><th className={th}>Ativo</th><th className={th}>Descrição</th><th className={th}>Categoria</th>
              <th className={`${th} text-right`}>Dia</th><th className={`${th} text-right`}>Valor padrão</th>
              <th className={th}>Começa</th><th className={th}>Termina</th><th className={th} />
            </tr>
          </thead>
          <tbody ref={arrasto.containerRef}>
            {visiveis.map((l) => {
              const u = ultimoDe(l);
              const valorAtual = parseValor(l.valor || '0');
              const difere = u && u.valor_centavos !== valorAtual;
              const alterada = mudou(l, ordemDe(l)) && !l.excluir;
              return (
                // A classe de transição é obrigatória para o FLIP do arraste (os vizinhos deslizam).
                <tr key={l.id} {...arrasto.itemProps(l.id)}
                  className={`transition-[opacity,transform] duration-200 ease-out ${l.excluir ? 'opacity-45' : ''} ${!l.ativa && !l.excluir ? 'text-gray-400' : ''} ${
                    arrasto.dragId === l.id ? '!opacity-40' : ''}`}>
                  <td className="border-b border-gray-100 py-1.5 pl-2" style={alterada ? { boxShadow: 'inset 3px 0 0 #f59e0b' } : undefined}>
                    {podeArrastar ? (
                      <span {...arrasto.alcaProps(l.id)} title="Arraste para mudar a ordem"
                        className="flex h-8 w-5 cursor-grab items-center justify-center rounded-[4px] text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 active:cursor-grabbing">
                        <IconGrip />
                      </span>
                    ) : (
                      <span className="flex h-8 w-5 items-center justify-center text-gray-200" title={temOrdem ? 'Limpe a busca para arrastar' : 'A ordem precisa da migration 008'}>
                        <IconGrip />
                      </span>
                    )}
                  </td>
                  <td className="border-b border-gray-100 py-1.5 pl-1 pr-2">
                    <button type="button" role="switch" aria-checked={l.ativa} disabled={l.excluir} onClick={() => mudar(l.id, 'ativa', !l.ativa)}
                      title={l.ativa ? 'Ativo: aparece para lançar todo mês' : 'Inativo'}
                      className={`relative inline-flex h-[16px] w-[28px] items-center rounded-full transition-colors duration-150 ${l.ativa ? 'bg-hx-16a34a' : 'bg-gray-300'}`}>
                      <span className={`absolute h-[12px] w-[12px] rounded-full bg-white shadow-sm transition-[left] duration-150 ${l.ativa ? 'left-[14px]' : 'left-[2px]'}`} />
                    </button>
                  </td>
                  <td className="border-b border-gray-100 px-2 py-1.5">
                    <input data-desc={l.id} className={`input !h-8 text-[12.5px] ${l.excluir ? 'line-through' : ''} ${borda(l, 'descricao')}`} disabled={l.excluir}
                      value={l.descricao} placeholder="Ex.: Luz" onChange={(e) => mudar(l.id, 'descricao', e.target.value)} />
                  </td>
                  <td className="border-b border-gray-100 px-2 py-1.5">
                    {l.excluir ? <span className="px-2 text-gray-400">—</span> : (
                      <SeletorCategoria value={l.categoria_id} onChange={(v) => mudar(l.id, 'categoria_id', v)} categorias={categorias} tipo="saida"
                        extras={SEM_CATEGORIA} placeholder="Sem categoria" className="!h-8 text-[12.5px]" onCriada={onCategoriaCriada} />
                    )}
                  </td>
                  <td className="border-b border-gray-100 px-2 py-1.5">
                    <input className={`input !h-8 text-right text-[12.5px] tabular-nums ${borda(l, 'dia')}`} inputMode="numeric" disabled={l.excluir}
                      value={l.dia} onChange={(e) => mudar(l.id, 'dia', e.target.value.replace(/\D/g, '').slice(0, 2))} />
                  </td>
                  <td className="border-b border-gray-100 px-2 py-1.5">
                    <div className="flex items-center justify-end gap-1.5">
                      {difere && !l.excluir && (
                        <button type="button" onClick={() => usarUltimo([l])}
                          title={`Último lançado: ${formatBRL(u.valor_centavos)} em ${competenciaCurta(u.competencia)}. Clique para usar como padrão.`}
                          className="inline-flex h-[22px] shrink-0 items-center whitespace-nowrap rounded-[4px] bg-hx-fef3c7 px-1.5 text-[11px] font-semibold tabular-nums text-hx-92400e transition-[filter] hover:brightness-95">
                          ≠ {valorParaCampo(u.valor_centavos)}
                        </button>
                      )}
                      <input className={`input !h-8 w-[92px] shrink-0 text-right text-[12.5px] tabular-nums ${borda(l, 'valor')}`} inputMode="decimal" disabled={l.excluir}
                        value={l.valor} placeholder="0,00" onChange={(e) => mudar(l.id, 'valor', e.target.value)} />
                    </div>
                  </td>
                  <td className="border-b border-gray-100 px-2 py-1.5">
                    <CampoMes compacto value={l.inicio} disabled={l.excluir} max={l.fim || undefined}
                      onChange={(v) => mudar(l.id, 'inicio', v)} />
                  </td>
                  <td className="border-b border-gray-100 px-2 py-1.5">
                    <CampoMes compacto value={l.fim} disabled={l.excluir} min={l.inicio || undefined} vazio="sem fim" limpavel rotuloLimpar="Sem fim"
                      onChange={(v) => mudar(l.id, 'fim', v)} />
                  </td>
                  <td className="border-b border-gray-100 px-1 py-1.5 text-center">
                    <button type="button" onClick={() => (l.novo && !l.descricao ? setLinhas((ls) => ls.filter((x) => x.id !== l.id)) : mudar(l.id, 'excluir', !l.excluir))}
                      title={l.excluir ? 'Não excluir' : 'Excluir (ao salvar)'}
                      className={`inline-flex h-7 w-7 items-center justify-center rounded-[4px] transition-colors duration-[120ms] ${
                        l.excluir ? 'bg-hx-fdeaea text-hx-c0393d' : 'text-gray-400 hover:bg-hx-fdeaea hover:text-hx-c0393d'}`}>
                      {l.excluir ? <IcoVoltar /> : <IcoLixeira />}
                    </button>
                  </td>
                </tr>
              );
            })}
            <tr>
              <td colSpan={9} className="px-4 py-2">
                <button type="button" onClick={adicionar}
                  className="inline-flex items-center gap-2 rounded-[5px] px-2 py-1.5 text-[12.5px] font-medium text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900">
                  <span className="flex h-4 w-4 items-center justify-center rounded-full border border-dashed border-gray-400 text-[11px] leading-none">+</span>
                  Adicionar gasto fixo
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-gray-200 bg-hx-f9fafb px-4 py-3">
        <span className="text-[12px] text-gray-500">
          {alteradas.length
            ? <><b className="font-semibold text-hx-92400e">{plural(alteradas.length, 'alterado', 'alterados')}</b> · ainda não salvo</>
            : 'Mudar o padrão não mexe no que já foi lançado: vale para as próximas sugestões.'}
        </span>
        <span className="flex-1" />
        <button type="button" className="btn-secondary" onClick={fechar} disabled={salvando}>Cancelar</button>
        <button type="button" className="btn-primary" onClick={salvar} disabled={salvando || !alteradas.length}>
          {salvando ? 'Salvando…' : alteradas.length ? `Salvar alterações (${alteradas.length})` : 'Salvar alterações'}
        </button>
      </div>
    </Modal>
  );
}

const Ico = ({ children }) => (
  <svg viewBox="0 0 24 24" className="h-[14px] w-[14px]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
);
const IcoLixeira = () => <Ico><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></Ico>;
const IcoVoltar = () => <Ico><path d="M9 14L4 9l5-5" /><path d="M4 9h11a5 5 0 0 1 0 10h-3" /></Ico>;
