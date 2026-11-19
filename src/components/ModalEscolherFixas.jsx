import { useEffect, useMemo, useState } from 'react';
import Modal from './Modal.jsx';
import Toggle from './Toggle.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { useConfirmacao } from '../context/ConfirmContext.jsx';
import { marcarGastoFixo } from '../api/cadastros.js';
import { listarResumoMensal } from '../api/resumo.js';
import { comoVemDoResumo } from '../lib/categoriasFixas.js';
import { competenciaAtual } from '../lib/format.js';

// "ESCOLHER CATEGORIAS" (16/11/2026, o mockup "Fixos por categoria", a 1ª recomendada): o atalho dos Gastos fixos para a
// chave "Gasto fixo" do cadastro das Categorias — os grupos de gasto como cabeçalho (a chave do grupo marca todas as dele;
// pela metade quando só algumas), as categorias ativas embaixo e, ao lado, como cada uma vem pelo histórico (`comoVem`).
// "Salvar (N)" grava só o que mudou (migration 033).

const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

export default function ModalEscolherFixas({ categorias, onFechar, onSalvo }) {
  const toast = useToast();
  const confirmar = useConfirmacao();
  const [marcadas, setMarcadas] = useState(() => new Set(categorias.filter((c) => c.gasto_fixo).map((c) => c.id)));
  const [resumo, setResumo] = useState(null);
  const [salvando, setSalvando] = useState(false);
  useEffect(() => { listarResumoMensal().then(setResumo).catch(() => setResumo(false)); }, []); // false: não leu (o "como vem" fica em branco)

  const hoje = competenciaAtual();
  const como = useMemo(() => comoVemDoResumo(resumo || [], hoje, categorias), [resumo, hoje, categorias]);
  const grupos = useMemo(() => {
    const gs = [];
    categorias.filter((c) => c.grupo?.tipo === 'saida' && c.ativa !== false).forEach((c) => {
      let g = gs.find((x) => x.id === c.grupo.id);
      if (!g) { g = { id: c.grupo.id, nome: c.grupo.nome, cor: c.grupo.cor, cats: [] }; gs.push(g); }
      g.cats.push(c);
    });
    return gs;
  }, [categorias]);

  const liga = categorias.filter((c) => marcadas.has(c.id) && !c.gasto_fixo).map((c) => c.id);
  const desliga = categorias.filter((c) => !marcadas.has(c.id) && c.gasto_fixo).map((c) => c.id);
  const nAlt = liga.length + desliga.length;
  const alternar = (ids, on) => setMarcadas((s) => { const n = new Set(s); ids.forEach((id) => (on ? n.add(id) : n.delete(id))); return n; });

  const fechar = async () => {
    if (nAlt && !(await confirmar({ titulo: 'Descartar as alterações?', texto: `${plural(nAlt, 'alteração ainda não foi salva', 'alterações ainda não foram salvas')}.`, confirmar: 'Descartar', perigo: true }))) return;
    onFechar();
  };
  const salvar = async () => {
    setSalvando(true);
    try {
      if (liga.length) await marcarGastoFixo(liga, true);
      if (desliga.length) await marcarGastoFixo(desliga, false);
      toast.success(nAlt === 1 ? 'Alteração salva.' : `${nAlt} alterações salvas.`);
      onSalvo();
    } catch (err) { toast.error(err.message); setSalvando(false); }
  };

  const th = 'sticky top-0 z-10 h-8 border-b border-gray-200 bg-hx-f9fafb px-3 text-left text-[10.5px] font-semibold uppercase tracking-wide text-gray-500';
  return (
    <Modal open onClose={fechar} title="Categorias que são gasto fixo" maxWidth="max-w-[760px]" padding="p-0"
      subtitulo="Tudo o que cair nelas, do cartão, de boleto ou de onde for, conta como fixo: nos Gastos fixos e no Já comprometido">
      <div className="max-h-[calc(90vh-170px)] min-h-[240px] overflow-auto border-t border-gray-100">
        <table className="w-full table-fixed border-separate border-spacing-0 text-[12.5px]">
          <colgroup><col /><col style={{ width: 150 }} /><col style={{ width: 250 }} /></colgroup>
          <thead><tr><th className={th}>Categoria</th><th className={th}>Gasto fixo</th><th className={th}>Como vem (pelo histórico)</th></tr></thead>
          <tbody>
            {grupos.map((g) => {
              const on = g.cats.filter((c) => marcadas.has(c.id)).length;
              const todos = on === g.cats.length;
              return [
                <tr key={g.id}>
                  <td className="h-10 border-b border-gray-100 bg-hx-f6f7f8 px-3 font-semibold text-gray-900" style={{ boxShadow: `inset 3px 0 0 ${g.cor}` }}>{g.nome}</td>
                  <td className="h-10 border-b border-gray-100 bg-hx-f6f7f8 px-3">
                    <span className="flex items-center gap-2 text-[11.5px] text-gray-500">
                      <Toggle compacto checked={todos} misto={on > 0 && !todos} rotulo={`O grupo ${g.nome} é gasto fixo`} onChange={() => alternar(g.cats.map((c) => c.id), !todos)} />
                      {todos ? 'o grupo inteiro' : on ? `${on} de ${g.cats.length}` : ''}
                    </span>
                  </td>
                  <td className="h-10 border-b border-gray-100 bg-hx-f6f7f8" />
                </tr>,
                ...g.cats.map((c) => {
                  const m = marcadas.has(c.id);
                  return (
                    <tr key={c.id} className={m ? 'bg-hx-fffbeb' : ''}>
                      <td className="h-9 border-b border-gray-100 pl-8 pr-3 text-gray-800">
                        <span className="flex items-center gap-2">
                          <span className="truncate">{c.nome}</span>
                          {m !== !!c.gasto_fixo && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-hx-f59e0b" title="Ainda não salvo" />}
                        </span>
                      </td>
                      <td className="h-9 border-b border-gray-100 px-3"><Toggle compacto checked={m} rotulo={`${c.nome} é gasto fixo`} onChange={(v) => alternar([c.id], v)} /></td>
                      <td className={`h-9 truncate border-b border-gray-100 px-3 text-[11.5px] ${m ? 'text-hx-92400e' : 'text-gray-400'}`}>
                        {resumo === null ? '…' : resumo === false ? '—' : como.get(c.id) ?? 'sem gasto'}
                      </td>
                    </tr>
                  );
                }),
              ];
            })}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-gray-200 bg-hx-f9fafb px-4 py-3">
        <span className="text-[12px] text-gray-500">
          {nAlt ? <><b className="font-semibold text-hx-92400e">{plural(nAlt, 'alteração', 'alterações')}</b> · ainda não salvo</>
            : `${plural(marcadas.size, 'categoria marcada', 'categorias marcadas')} · o previsto sai do histórico`}
        </span>
        <span className="flex-1" />
        <button type="button" className="btn-secondary" onClick={fechar} disabled={salvando}>Cancelar</button>
        <button type="button" className="btn-primary" onClick={salvar} disabled={salvando || !nAlt}>
          {salvando ? 'Salvando…' : nAlt ? `Salvar (${nAlt})` : 'Salvar'}
        </button>
      </div>
    </Modal>
  );
}
