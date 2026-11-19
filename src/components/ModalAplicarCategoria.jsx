import { useEffect, useMemo, useRef, useState } from 'react';
import Modal from './Modal.jsx';
import Checkbox from './Checkbox.jsx';
import Spinner from './Spinner.jsx';
import { Bolinha, Etiqueta } from './Comuns.jsx';
import { deOnde } from './ModalTirarIgnorados.jsx';
import { buscarPorIds } from '../api/lancamentos.js';
import { listarCartoes } from '../api/cadastros.js';
import { classificarLancamentos } from '../api/regras.js';
import { ehFixo } from '../lib/regras.js';
import { formatBRL } from '../lib/dinheiro.js';
import { formatDate } from '../lib/format.js';
import { useToast } from '../context/ToastContext.jsx';

// APLICAR A CATEGORIA DA REGRA NO QUE JÁ ENTROU (19/11/2026): mudar a categoria de uma regra só decide as próximas
// importações, e os lançamentos que ela já tinha classificado ficavam com a categoria velha. Aqui aparece cada um —
// data, nome, de onde, a categoria de agora → a da regra e o valor —, todos marcados menos o FIXO DO MÊS (o extrato o
// lançou com a categoria do fixo). "Aplicar em N" grava a categoria (e tira de Revisar); não há desfazer.
//
// `grupos`: [{ regra: { id, palavra_chave, categoria_id }, lancs: [{ id }] }] (de `categoriaParaAplicar`).
// `categorias`: a lista do cadastro (o nome e a cor). `onFeito()`: depois de gravar.
const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

function Cat({ c }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      <Bolinha cor={c?.grupo?.cor} />
      <span className="truncate">{c?.nome ?? 'sem categoria'}</span>
    </span>
  );
}

export default function ModalAplicarCategoria({ grupos, categorias, onFechar, onFeito }) {
  const toast = useToast();
  const [linhas, setLinhas] = useState(null);
  const [cartaoPorId, setCartaoPorId] = useState(new Map());
  const [marcados, setMarcados] = useState(() => new Set());
  const [gravando, setGravando] = useState(false);
  const fecharRef = useRef(onFechar);
  fecharRef.current = onFechar;
  const catPorId = useMemo(() => new Map(categorias.map((c) => [c.id, c])), [categorias]);
  const regraDe = useMemo(() => new Map(grupos.flatMap((g) => g.lancs.map((l) => [l.id, g.regra]))), [grupos]);

  useEffect(() => {
    const ids = grupos.flatMap((g) => g.lancs.map((l) => l.id));
    (async () => {
      try {
        const partes = [];
        for (let i = 0; i < ids.length; i += 100) partes.push(...await buscarPorIds(ids.slice(i, i + 100)));
        const cartoes = await listarCartoes().catch(() => []);
        partes.sort((a, b) => String(b.data).localeCompare(String(a.data)));
        setCartaoPorId(new Map(cartoes.map((c) => [c.id, c])));
        setLinhas(partes);
        setMarcados(new Set(partes.filter((l) => !ehFixo(l)).map((l) => l.id)));
      } catch (err) { toast.error(err.message); fecharRef.current(); }
    })();
  }, [grupos, toast]);

  const alternar = (id) => setMarcados((m) => { const n = new Set(m); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const todos = linhas && linhas.length > 0 && marcados.size === linhas.length;
  const escolhidos = (linhas ?? []).filter((l) => marcados.has(l.id));
  const nomes = grupos.map((g) => `"${g.regra.palavra_chave}"`);
  const uma = grupos.length === 1 ? catPorId.get(grupos[0].regra.categoria_id) : null;

  const aplicar = async () => {
    if (!escolhidos.length || gravando) return;
    setGravando(true);
    try {
      const porCat = new Map();
      escolhidos.forEach((l) => {
        const cat = regraDe.get(l.id)?.categoria_id;
        if (cat) porCat.set(cat, [...(porCat.get(cat) ?? []), l.id]);
      });
      for (const [cat, ids] of porCat) await classificarLancamentos(ids, cat);
      toast.success(`${plural(escolhidos.length, 'lançamento passou', 'lançamentos passaram')} para a categoria da regra.`);
      onFeito?.();
      onFechar();
    } catch (err) { toast.error(err.message); setGravando(false); }
  };

  const th = 'sticky top-0 z-10 h-8 border-b border-gray-200 bg-hx-f9fafb px-2 text-left text-[10.5px] font-semibold uppercase tracking-wide text-gray-500';
  const td = 'border-b border-gray-100 px-2 py-1.5';
  return (
    <Modal open onClose={gravando ? () => {} : onFechar} maxWidth="max-w-[880px]" padding="p-0"
      title={uma ? `Passar para ${uma.nome} o que a regra já pegou?` : 'Aplicar a categoria da regra no que já entrou?'}
      subtitulo={`${nomes.slice(0, 3).join(', ')}${nomes.length > 3 ? '…' : ''} — a regra vale para as próximas importações; estes já tinham entrado com outra categoria`}>
      {!linhas ? <div className="flex justify-center py-12"><Spinner className="h-5 w-5" /></div> : (
        <>
          <div className="max-h-[56vh] overflow-auto">
            <table className="w-full table-fixed border-separate border-spacing-0 text-[12.5px]">
              <colgroup>
                <col style={{ width: 36 }} /><col style={{ width: 88 }} /><col /><col style={{ width: 150 }} />
                <col style={{ width: 290 }} /><col style={{ width: 100 }} />
              </colgroup>
              <thead>
                <tr>
                  <th className={`${th} text-center`}>
                    <Checkbox size="sm" checked={todos} indeterminate={marcados.size > 0 && !todos}
                      onChange={() => setMarcados(todos ? new Set() : new Set(linhas.map((l) => l.id)))} title="Marcar todos" />
                  </th>
                  <th className={th}>Data</th>
                  <th className={th}>Lançamento</th>
                  <th className={th}>De onde</th>
                  <th className={th}>Categoria de agora → da regra</th>
                  <th className={`${th} text-right`}>Valor</th>
                </tr>
              </thead>
              <tbody>
                {linhas.map((l) => (
                  <tr key={l.id} className={marcados.has(l.id) ? 'bg-blue-50' : 'hover:bg-hx-f9fafb'}>
                    <td className={`${td} text-center`}><Checkbox size="sm" checked={marcados.has(l.id)} onChange={() => alternar(l.id)} title={`Marcar ${l.descricao}`} /></td>
                    <td className={`${td} tabular-nums text-gray-600`}>{formatDate(l.data)}</td>
                    <td className={td}>
                      <span className="block truncate text-gray-800" title={l.estabelecimento}>{l.descricao || l.estabelecimento}</span>
                      {grupos.length > 1 && <span className="block truncate font-mono text-[11px] text-gray-400">regra {regraDe.get(l.id)?.palavra_chave}</span>}
                    </td>
                    <td className={`${td} truncate text-gray-500`}>
                      {deOnde(l, cartaoPorId)}
                      {ehFixo(l) && <span className="ml-1.5" title="O extrato o lançou como o fixo do mês, com a categoria do fixo."><Etiqueta tom="ambar">fixo do mês</Etiqueta></span>}
                    </td>
                    <td className={td}>
                      <span className="flex min-w-0 items-center gap-1.5 text-gray-700">
                        <span className="min-w-0 text-gray-500"><Cat c={catPorId.get(l.categoria_id)} /></span>
                        <span className="shrink-0 text-gray-400">→</span>
                        <span className={`min-w-0 ${marcados.has(l.id) ? 'font-semibold text-gray-800' : ''}`}><Cat c={catPorId.get(regraDe.get(l.id)?.categoria_id)} /></span>
                      </span>
                    </td>
                    <td className={`${td} text-right tabular-nums text-gray-800`}>{formatBRL(Number(l.valor_centavos))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-gray-200 bg-hx-f9fafb px-5 py-3">
            <span className="text-[12.5px] text-gray-500">
              {escolhidos.length ? `${plural(escolhidos.length, 'lançamento muda', 'lançamentos mudam')} de categoria. O que ficar desmarcado continua como está.` : 'Nada marcado.'}
            </span>
            <span className="flex-1" />
            <button type="button" className="btn-secondary" onClick={onFechar} disabled={gravando}>Agora não</button>
            <button type="button" className="btn-primary" onClick={aplicar} disabled={!escolhidos.length || gravando}>
              {gravando ? 'Aplicando…' : escolhidos.length ? `Aplicar em ${escolhidos.length}` : 'Aplicar'}
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}
