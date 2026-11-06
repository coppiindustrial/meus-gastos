import { useEffect, useMemo, useState } from 'react';
import Modal from './Modal.jsx';
import AbasPilula from './AbasPilula.jsx';
import { Etiqueta } from './Comuns.jsx';
import { lancamentosDaImportacao } from '../api/importacoes.js';
import { formatBRL } from '../lib/dinheiro.js';
import { formatDate, formatDateTime, nomeCompetencia } from '../lib/format.js';

// O "VER" DE UMA IMPORTAÇÃO (06/11/2026, o mockup aprovado "Indicadores e importações", opção A): o pop-up da linha do
// Histórico, como o da planilha (`ModalPlanilha`). Os NÚMEROS (a fatura: compras, total, sem categoria e a maior
// categoria; o extrato: o resumo, os lançamentos que ele criou, os fixos que corrigiu e o sem categoria), a LISTA do que
// entrou (`lancamentosDaImportacao`) com a categoria — o sem categoria em âmbar — e no pé: excluir (o mesmo do Histórico),
// revisar as pendências e abrir o mês nos Lançamentos.
// `imp`: a linha do Histórico; `oque`: o nome dela (o `descrever` da tela); `onExcluir`, `onAbrirMes(competencia)`,
// `onPendencias`: o que a tela faz.
export default function ModalImportacao({ imp, oque, onFechar, onExcluir, onAbrirMes, onPendencias }) {
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState('');
  const [aba, setAba] = useState('criados');
  useEffect(() => {
    let vivo = true;
    lancamentosDaImportacao(imp).then((d) => { if (vivo) setDados(d); }).catch((err) => { if (vivo) setErro(err.message); });
    return () => { vivo = false; };
  }, [imp]);
  const fatura = imp.tipo === 'fatura';
  const lista = dados ? (aba === 'corrigidos' ? dados.corrigidos : dados.criados) : [];
  const criados = dados?.criados ?? [];
  const semCat = criados.filter((l) => !l.categoria_id && l.tipo === 'saida').length;
  const total = criados.reduce((s, l) => s + (l.tipo === 'entrada' ? -1 : 1) * Number(l.valor_centavos), 0);
  const maior = useMemo(() => {
    const m = new Map();
    criados.filter((l) => l.categoria_id && l.tipo === 'saida').forEach((l) => m.set(l.categoria?.nome ?? '?', (m.get(l.categoria?.nome ?? '?') ?? 0) + Number(l.valor_centavos)));
    return [...m.entries()].sort((a, b) => b[1] - a[1])[0] ?? null;
  }, [criados]);
  // o mês para abrir nos Lançamentos: o da fatura, ou o que mais aparece no que o extrato criou
  const mes = useMemo(() => {
    if (fatura) return imp.competencia;
    const c = new Map();
    criados.forEach((l) => { const k = String(l.competencia ?? l.data).slice(0, 7); c.set(k, (c.get(k) ?? 0) + 1); });
    return [...c.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? imp.periodo_de?.slice(0, 7) ?? null;
  }, [fatura, imp, criados]);
  const num = (rotulo, valor, sub, cor = 'text-gray-900') => (
    <div className="rounded-md border border-gray-200 px-3 py-2">
      <div className="text-[11px] font-medium uppercase tracking-wide text-gray-500">{rotulo}</div>
      <div className={`text-[17px] font-semibold tabular-nums ${cor}`}>{valor}</div>
      <div className="truncate text-[11.5px] text-gray-400">{sub}</div>
    </div>
  );
  const th = 'sticky top-0 z-[1] border-b border-gray-200 bg-hx-f9fafb px-2.5 py-1.5 text-left text-[10.5px] font-semibold uppercase tracking-wide text-gray-500';
  const td = 'border-b border-gray-100 px-2.5 py-1.5';
  return (
    <Modal open onClose={onFechar} title={oque} maxWidth="max-w-[880px]"
      subtitulo={`importado em ${formatDateTime(imp.criado_em)}${imp.arquivo ? ` · ${imp.arquivo}` : ''}`}>
      <div className="space-y-3">
        {erro && <p className="text-sm font-medium text-hx-dc2626">{erro}</p>}
        {!dados && !erro && <p className="py-10 text-center text-[13px] text-gray-400">Carregando…</p>}
        {dados && (
          <>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {fatura ? (
                <>
                  {num('Compras', criados.filter((l) => Number(l.valor_centavos) > 0).length, mes ? nomeCompetencia(mes).toLowerCase() : '—')}
                  {num('Total da fatura', formatBRL(total), criados.some((l) => Number(l.valor_centavos) < 0) ? 'com os estornos' : `${criados.length} lançamentos`)}
                  {num('Sem categoria', semCat, semCat ? 'em Revisar pendências' : 'todas classificadas', semCat ? 'text-amber-700' : 'text-gray-900')}
                  {num('Maior categoria', maior ? maior[0] : '—', maior && total > 0 ? `${formatBRL(maior[1])} · ${Math.round((maior[1] / total) * 100)}%` : '')}
                </>
              ) : (
                <>
                  {num('Entraram', imp.linhas || '—', imp.periodo_de ? `${formatDate(imp.periodo_de)} a ${formatDate(imp.periodo_ate)}` : '')}
                  {num('Ainda no app', criados.length, `${criados.filter((l) => l.recorrencia_id).length} fixos · ${criados.filter((l) => l.tipo === 'entrada').length} entradas${imp.linhas > criados.length + dados.corrigidos.length ? ' · o resto foi excluído depois' : ''}`)}
                  {num('Fixos corrigidos', dados.corrigidos.length, dados.corrigidos.length ? 'o valor real do mês' : 'nenhum')}
                  {num('Sem categoria', semCat, semCat ? 'em Revisar pendências' : 'todos classificados', semCat ? 'text-amber-700' : 'text-gray-900')}
                </>
              )}
            </div>
            {!fatura && imp.resumo && <p className="text-[12.5px] text-gray-500">{imp.resumo}</p>}
            {!fatura && dados.corrigidos.length > 0 && (
              <AbasPilula abas={[{ key: 'criados', label: 'Criados', qtd: criados.length }, { key: 'corrigidos', label: 'Fixos corrigidos', qtd: dados.corrigidos.length }]}
                valor={aba} onChange={setAba} variante="claro" altura={30} folga={2} qtdSolta />
            )}
            {lista.length === 0 ? (
              <p className="rounded-md border border-dashed border-gray-300 px-3 py-6 text-center text-[12.5px] text-gray-400">
                {fatura && !imp.fatura_id ? 'A fatura foi substituída por outra importação ou excluída.' : 'Nada desta importação ficou no app.'}
              </p>
            ) : (
              <div className="max-h-[50vh] overflow-auto rounded-md border border-gray-200">
                <table className="w-full border-separate border-spacing-0 text-[12.5px]">
                  <thead><tr><th className={th}>Data</th><th className={th}>Descrição</th><th className={th}>Categoria</th><th className={`${th} text-right`}>Valor</th></tr></thead>
                  <tbody>
                    {lista.map((l) => {
                      const v = Number(l.valor_centavos);
                      return (
                        <tr key={l.id} className="hover:bg-hx-f9fafb">
                          <td className={`${td} whitespace-nowrap tabular-nums text-gray-600`}>{formatDate(l.data)}</td>
                          <td className={`${td} max-w-[340px] truncate text-gray-800`} title={l.descricao || l.estabelecimento}>{l.descricao || l.estabelecimento || '—'}
                            {l.parcela_total > 1 && <span className="ml-1.5 text-[11px] text-gray-400">{l.parcela_atual}/{l.parcela_total}</span>}</td>
                          <td className={td}>{l.categoria?.nome ? <Etiqueta>{l.categoria.nome}</Etiqueta> : l.tipo === 'saida' ? <Etiqueta tom="ambar">sem categoria</Etiqueta> : <span className="text-gray-400">—</span>}</td>
                          <td className={`${td} whitespace-nowrap text-right tabular-nums ${l.tipo === 'entrada' ? 'text-green-700' : v < 0 ? 'text-green-700' : 'text-gray-900'}`}>
                            {l.tipo === 'entrada' ? '+ ' : ''}{formatBRL(v)}{v < 0 && <span className="ml-1 text-[11px] text-gray-400">estorno</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
        <div className="flex flex-wrap items-center gap-2 border-t border-gray-100 pt-3">
          {onExcluir && <button type="button" className="text-[13px] font-medium text-hx-c0393d hover:underline" onClick={onExcluir}>Excluir {fatura ? 'a fatura' : 'o extrato'}</button>}
          <span className="flex-1" />
          {semCat > 0 && <button type="button" className="btn-secondary" onClick={onPendencias}>Revisar pendências ({semCat})</button>}
          {mes && <button type="button" className="btn-primary" onClick={() => onAbrirMes(mes)}>Abrir {nomeCompetencia(mes).replace(/ de \d+$/, '').toLowerCase()} nos Lançamentos</button>}
        </div>
      </div>
    </Modal>
  );
}
