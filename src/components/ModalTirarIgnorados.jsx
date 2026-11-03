import { useEffect, useMemo, useRef, useState } from 'react';
import Modal from './Modal.jsx';
import Checkbox from './Checkbox.jsx';
import Spinner from './Spinner.jsx';
import { Etiqueta } from './Comuns.jsx';
import { buscarPorIds } from '../api/lancamentos.js';
import { listarCartoes } from '../api/cadastros.js';
import { tirarDoApp } from '../api/regras.js';
import { ehFixo } from '../lib/regras.js';
import { ORIGENS } from '../lib/planilha.js';
import { formatBRL } from '../lib/dinheiro.js';
import { formatDate } from '../lib/format.js';
import { useToast } from '../context/ToastContext.jsx';

// TIRAR DO APP O QUE A REGRA DE IGNORAR PEGA (03/11/2026): a regra que vira "Ignorar" só decide as próximas
// importações, e o que já entrou (a compra da fatura, o Pix do extrato) continuava nos lançamentos. Aqui aparece cada
// um — data, nome, valor e de onde veio —, todos marcados menos o FIXO DO MÊS (o extrato o criou como o fixo: tirá-lo
// faz o mês voltar a mostrá-lo "a lançar"). "Tirar" apaga os marcados e refaz o total das faturas; não há desfazer.
//
// `grupos`: [{ regra: { id, palavra_chave }, lancs: [{ id }] }] (de `ignoradosNoApp`). `onFeito()`: depois de tirar.
const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

function deOnde(l, cartaoPorId) {
  const base = l.origem === 'cartao' ? ['Cartão', cartaoPorId.get(l.cartao_id)?.nome].filter(Boolean).join(' · ')
    : l.importado_de === 'extrato' ? 'Extrato' : ORIGENS[l.origem] ?? l.origem;
  return l.importado_de === 'planilha' ? `${base} · planilha` : base;
}

export default function ModalTirarIgnorados({ grupos, onFechar, onFeito }) {
  const toast = useToast();
  const [linhas, setLinhas] = useState(null);
  const [cartaoPorId, setCartaoPorId] = useState(new Map());
  const [marcados, setMarcados] = useState(() => new Set());
  const [tirando, setTirando] = useState(false);
  const fecharRef = useRef(onFechar);
  fecharRef.current = onFechar;
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
  const total = escolhidos.reduce((s, l) => s + Number(l.valor_centavos), 0);
  const nomes = grupos.map((g) => `"${g.regra.palavra_chave}"`);

  const tirar = async () => {
    if (!escolhidos.length || tirando) return;
    setTirando(true);
    try {
      await tirarDoApp(escolhidos);
      toast.success(`${plural(escolhidos.length, 'lançamento tirado', 'lançamentos tirados')} do app.`);
      onFeito?.();
      onFechar();
    } catch (err) { toast.error(err.message); setTirando(false); }
  };

  const th = 'sticky top-0 z-10 h-8 border-b border-gray-200 bg-hx-f9fafb px-2 text-left text-[10.5px] font-semibold uppercase tracking-wide text-gray-500';
  const td = 'border-b border-gray-100 px-2 py-1.5';
  return (
    <Modal open onClose={tirando ? () => {} : onFechar} title="Tirar do app o que a regra ignora" maxWidth="max-w-[760px]" padding="p-0"
      subtitulo={`${nomes.slice(0, 3).join(', ')}${nomes.length > 3 ? '…' : ''} — a regra vale para as próximas importações; estes já tinham entrado`}>
      {!linhas ? <div className="flex justify-center py-12"><Spinner className="h-5 w-5" /></div> : (
        <>
          <div className="max-h-[56vh] overflow-auto">
            <table className="w-full border-separate border-spacing-0 text-[12.5px]">
              <thead>
                <tr>
                  <th className={`${th} w-9 text-center`}>
                    <Checkbox size="sm" checked={todos} indeterminate={marcados.size > 0 && !todos}
                      onChange={() => setMarcados(todos ? new Set() : new Set(linhas.map((l) => l.id)))} title="Marcar todos" />
                  </th>
                  <th className={`${th} w-[92px]`}>Data</th>
                  <th className={th}>Lançamento</th>
                  <th className={th}>De onde</th>
                  <th className={`${th} text-right`}>Valor</th>
                </tr>
              </thead>
              <tbody>
                {linhas.map((l) => (
                  <tr key={l.id} className={marcados.has(l.id) ? 'bg-blue-50' : 'hover:bg-hx-f9fafb'}>
                    <td className={`${td} text-center`}><Checkbox size="sm" checked={marcados.has(l.id)} onChange={() => alternar(l.id)} title={`Marcar ${l.descricao}`} /></td>
                    <td className={`${td} tabular-nums text-gray-600`}>{formatDate(l.data)}</td>
                    <td className={td}>
                      <span className="block truncate text-gray-800">{l.descricao || l.estabelecimento}</span>
                      {grupos.length > 1 && <span className="block truncate font-mono text-[11px] text-gray-400">regra {regraDe.get(l.id)?.palavra_chave}</span>}
                    </td>
                    <td className={`${td} whitespace-nowrap text-gray-500`}>
                      {deOnde(l, cartaoPorId)}
                      {ehFixo(l) && <span className="ml-1.5" title="O extrato o lançou como o fixo do mês: tirado, o mês volta a mostrar o fixo a lançar."><Etiqueta tom="ambar">fixo do mês</Etiqueta></span>}
                    </td>
                    <td className={`${td} text-right tabular-nums text-gray-800`}>{formatBRL(Number(l.valor_centavos))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-gray-200 bg-hx-f9fafb px-5 py-3">
            <span className="text-[12.5px] text-gray-500">
              {escolhidos.length ? `${plural(escolhidos.length, 'lançamento sai', 'lançamentos saem')} (${formatBRL(total)}) e o total das faturas é refeito. Não dá para desfazer.` : 'Nada marcado.'}
            </span>
            <span className="flex-1" />
            <button type="button" className="btn-secondary" onClick={onFechar} disabled={tirando}>Agora não</button>
            <button type="button" className="btn-danger" onClick={tirar} disabled={!escolhidos.length || tirando}>
              {tirando ? 'Tirando…' : `Tirar ${escolhidos.length || ''} do app`.replace('  ', ' ')}
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}
