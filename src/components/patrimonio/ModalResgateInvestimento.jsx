import { useMemo, useState } from 'react';
import Modal from '../Modal.jsx';
import CampoData from '../CampoData.jsx';
import AbasPilula from '../AbasPilula.jsx';
import Checkbox from '../Checkbox.jsx';
import { Campo } from '../Comuns.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { criarResgates } from '../../api/carteira.js';
import { calcularValor, formatBRL } from '../../lib/dinheiro.js';
import { formatDate } from '../../lib/format.js';
import { aliquotaIOF, dataDoDeposito, ehIsento, fimDoIOF, planoDoResgate, resgatesDoPlano, rotuloTaxa } from '../../lib/carteira.js';

// RESGATAR PELO INVESTIMENTO (16/11/2026, a opção A do mockup "Resgatar pelo investimento"): o "Resgatar" da linha do
// investimento (o "pai"). A data e o valor que SAI do investimento (bruto, o que se grava — como no resgate de um aporte),
// repartido entre os aportes por `planoDoResgate`: DO MAIS ANTIGO para o mais novo, como o Nubank (o mais antigo já não tem
// IOF e tem o IR mais baixo), ou EU ESCOLHO: marcar os aportes que podem pagar, e o valor se reparte entre os marcados na
// mesma ordem. A tabela mostra cada aporte (a ordem em que sai, a idade e a alíquota, o IOF de quem tem menos de 30 dias,
// quanto vale, quanto sai — "tudo" quando sai inteiro —, o rendimento junto, o IOF, o IR e quanto chega) e os totais.
// Grava um resgate em cada aporte alcançado, numa requisição só, ligados pelo `lote` (migration 032).
// `x`: o investimento da carteira ({ inv, aportes }); `itens`: os { ap, resgates } dele (também os já encerrados).
const MODOS = [{ key: 'antigo', label: 'Do mais antigo' }, { key: 'escolho', label: 'Eu escolho' }];
const pctTexto = (a) => `${(a * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;

export default function ModalResgateInvestimento({ x, itens, cal, hoje, onFechar, onSalvo }) {
  const toast = useToast();
  const { inv } = x;
  const [data, setData] = useState(hoje);
  const [valor, setValor] = useState('');
  const [modo, setModo] = useState('antigo');
  const [escolhidos, setEscolhidos] = useState(() => new Set());
  const [salvando, setSalvando] = useState(false);
  const centavos = calcularValor(valor);
  const marcados = modo === 'escolho' ? escolhidos : null;
  const plano = useMemo(() => planoDoResgate({ itens, inv, cal, data, valor: centavos, marcados, hoje }), [itens, inv, cal, data, centavos, marcados, hoje]);
  const usados = plano.linhas.filter((l) => l.sai > 0);
  const tot = usados.reduce((t, l) => ({ rend: t.rend + l.imp.rendimento, iof: t.iof + l.imp.iof, ir: t.ir + l.imp.ir, chega: t.chega + l.imp.chega }), { rend: 0, iof: 0, ir: 0, chega: 0 });
  const valeTudo = plano.linhas.reduce((t, l) => t + l.pos.vale, 0);
  const erro = valor.trim() && centavos === null ? 'O valor não é um número.' : plano.erro;
  const mostrarErro = erro && (valor.trim() || erro !== 'Falta o valor que sai do investimento.');
  const isento = ehIsento(inv.tipo);
  const comIOF = usados.filter((l) => l.imp.iof > 0);
  const alternar = (id) => setEscolhidos((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const nMarcados = plano.linhas.filter((l) => l.marcado).length;
  const todos = plano.linhas.length > 0 && nMarcados === plano.linhas.length;
  const alternarTodos = () => setEscolhidos(todos ? new Set() : new Set(plano.linhas.map((l) => l.ap.id)));

  const salvar = async (e) => {
    e?.preventDefault();
    if (erro || !usados.length) return;
    setSalvando(true);
    try {
      const lote = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : null;
      const r = await criarResgates(resgatesDoPlano(plano, data, lote));
      toast.success(`Resgate de ${formatBRL(plano.total)} lançado em ${usados.length} ${usados.length === 1 ? 'aporte' : 'aportes'}${r.semLote ? ' (sem a migration 032: cada pedaço se exclui sozinho)' : ''}.`);
      onSalvo();
    } catch (err) { toast.error(err.message); setSalvando(false); }
  };

  const th = 'sticky top-0 z-10 whitespace-nowrap border-b border-gray-200 bg-hx-f9fafb px-2 py-1.5 text-[10.5px] font-semibold uppercase tracking-wide text-gray-500';
  const td = 'h-[36px] whitespace-nowrap border-b border-gray-100 px-2 text-right tabular-nums';
  const escolho = modo === 'escolho';
  return (
    <Modal open onClose={onFechar} title={`Resgatar de ${inv.nome}`} maxWidth="max-w-[min(900px,95vw)]"
      subtitulo={`${inv.instituicao} · ${rotuloTaxa(inv.taxa, inv.indexador)} · ${plano.linhas.length} ${plano.linhas.length === 1 ? 'aporte' : 'aportes'} · vale ${formatBRL(valeTudo)} em ${formatDate(data)}`}>
      <form onSubmit={salvar} className="space-y-3.5">
        <div className="grid grid-cols-2 gap-3">
          <Campo rotulo="Data do resgate"><CampoData value={data} onChange={setData} max={hoje} /></Campo>
          <Campo rotulo="Valor que sai do investimento (R$)">
            <div className="relative">
              <input className="input pr-[92px] text-right tabular-nums" inputMode="decimal" autoFocus placeholder="0,00" value={valor} onChange={(e) => setValor(e.target.value)} />
              {plano.disponivel > 0 && (
                <button type="button" onClick={() => setValor((plano.disponivel / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 }))}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-[4px] px-1.5 py-0.5 text-[11px] font-medium text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-800">
                  {escolho ? 'os marcados' : 'tudo'}
                </button>
              )}
            </div>
          </Campo>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="text-[12.25px] font-medium text-gray-700">De onde sai</span>
          <AbasPilula abas={MODOS} valor={modo} onChange={setModo} variante="claro" altura={30} folga={2} />
          <span className="text-[11.5px] text-gray-500">{escolho
            ? (nMarcados ? `${nMarcados} ${nMarcados === 1 ? 'marcado' : 'marcados'} · ${formatBRL(plano.disponivel)}: o valor se reparte entre eles, do mais antigo para o mais novo` : 'marque os aportes de onde o dinheiro pode sair')
            : 'como o Nubank: o mais antigo já não tem IOF e tem o IR mais baixo'}</span>
        </div>

        <div className="max-h-[min(330px,40vh)] overflow-auto rounded-md border border-gray-200 [scrollbar-gutter:stable]">
          <table className="w-full border-separate border-spacing-0 text-[12.5px]">
            <thead><tr>
              {escolho && <th className={`${th} w-[34px] text-left`}><Checkbox size="sm" checked={todos} indeterminate={nMarcados > 0} onChange={alternarTodos} title={todos ? 'Desmarcar todos' : 'Marcar todos'} /></th>}
              <th className={`${th} w-[34px] text-left`}>#</th>
              <th className={`${th} text-left`}>Aporte</th>
              <th className={`${th} text-right`}>Idade</th>
              <th className={`${th} text-right`}>Vale no dia</th>
              <th className={`${th} text-right`}>Sai</th>
              <th className={`${th} text-right`}>Rendimento junto</th>
              <th className={`${th} text-right`}>IOF</th>
              <th className={`${th} text-right`}>IR</th>
              <th className={`${th} text-right`}>Chega</th>
            </tr></thead>
            <tbody>
              {plano.linhas.map((l) => {
                const usado = l.sai > 0;
                const ordem = usado ? usados.indexOf(l) + 1 : null;
                const idade = l.pos.idade;
                const iofDia = idade !== null && idade < 30 ? aliquotaIOF(idade) : 0;
                const cor = !usado ? 'text-gray-400' : 'text-gray-700';
                const fundo = usado && !l.tudo ? 'bg-amber-50' : '';
                return (
                  <tr key={l.ap.id} className={`transition-colors hover:bg-[var(--gm-realce)] ${fundo}`}>
                    {escolho && <td className={`${td} text-left`}><Checkbox size="sm" checked={l.marcado} onChange={() => alternar(l.ap.id)} title={l.marcado ? 'Não tirar deste aporte' : 'Pode tirar deste aporte'} /></td>}
                    <td className={`${td} text-left`}>{ordem && <span className="inline-grid h-[18px] min-w-[18px] place-items-center rounded-full bg-gray-200 px-1 text-[10.5px] font-bold text-gray-600">{ordem}</span>}</td>
                    <td className={`${td} text-left ${cor}`}>
                      {formatDate(dataDoDeposito(l.ap))}
                      {l.ap.origem === 'antigo' && <span className="ml-1 text-[11px] text-gray-400">já aplicado</span>}
                      {iofDia > 0 && <span className="ml-1.5 inline-flex h-[18px] items-center rounded-[6px] bg-amber-50 px-1.5 text-[10.5px] font-semibold text-amber-700">IOF {pctTexto(iofDia)}</span>}
                    </td>
                    <td className={`${td} ${cor}`}>
                      {idade === null ? '—' : `${idade} d`}
                      {!isento && <span className="ml-1.5 inline-flex h-[18px] items-center rounded-[6px] bg-gray-100 px-1.5 text-[10.5px] font-semibold text-gray-600">{pctTexto(l.pos.aliquota ?? 0)}</span>}
                    </td>
                    <td className={`${td} ${cor}`}>{formatBRL(l.pos.vale)}</td>
                    <td className={`${td} ${usado ? 'text-gray-900' : 'text-gray-300'}`}>{usado ? <>{l.tudo && <b className="font-semibold">tudo · </b>}{formatBRL(l.sai)}</> : '—'}</td>
                    <td className={`${td} ${cor}`}>{usado ? formatBRL(l.imp.rendimento) : '—'}</td>
                    <td className={`${td} ${usado && l.imp.iof ? 'text-amber-700' : cor}`}>{usado && l.imp.iof ? `− ${formatBRL(l.imp.iof)}` : '—'}</td>
                    <td className={`${td} ${cor}`}>{usado ? (isento ? 'isento' : `− ${formatBRL(l.imp.ir)}`) : '—'}</td>
                    <td className={`${td} ${usado ? 'font-semibold text-gray-900' : cor}`}>{usado ? formatBRL(l.imp.chega) : '—'}</td>
                  </tr>
                );
              })}
              <tr className="font-semibold text-gray-800">
                {escolho && <td className="h-[36px] border-t border-gray-200 bg-hx-f9fafb" />}
                <td className="border-t border-gray-200 bg-hx-f9fafb" />
                <td className="whitespace-nowrap border-t border-gray-200 bg-hx-f9fafb px-2 text-left">{usados.length ? `${usados.length} ${usados.length === 1 ? 'aporte' : 'aportes'}` : 'Total'}</td>
                <td className="border-t border-gray-200 bg-hx-f9fafb" />
                <td className="border-t border-gray-200 bg-hx-f9fafb" />
                <td className="whitespace-nowrap border-t border-gray-200 bg-hx-f9fafb px-2 text-right tabular-nums">{usados.length ? formatBRL(usados.reduce((t, l) => t + l.sai, 0)) : '—'}</td>
                <td className="whitespace-nowrap border-t border-gray-200 bg-hx-f9fafb px-2 text-right tabular-nums">{usados.length ? formatBRL(tot.rend) : '—'}</td>
                <td className="whitespace-nowrap border-t border-gray-200 bg-hx-f9fafb px-2 text-right tabular-nums">{tot.iof ? `− ${formatBRL(tot.iof)}` : '—'}</td>
                <td className="whitespace-nowrap border-t border-gray-200 bg-hx-f9fafb px-2 text-right tabular-nums">{!usados.length ? '—' : isento ? 'isento' : `− ${formatBRL(tot.ir)}`}</td>
                <td className="whitespace-nowrap border-t border-gray-200 bg-hx-f9fafb px-2 text-right tabular-nums">{usados.length ? formatBRL(tot.chega) : '—'}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {mostrarErro ? (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[12.5px] text-red-700">{erro}</div>
        ) : !erro && (
          <>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[['Sai do investimento', plano.total], ['IOF + IR', tot.iof + tot.ir], ['Chega na conta ≈', tot.chega], ['Fica rendendo', valeTudo - plano.total]].map(([r, v]) => (
                <div key={r} className="rounded-md border border-gray-200 bg-hx-f9fafb px-2.5 py-1.5">
                  <span className="block text-[11px] text-gray-500">{r}</span>
                  <b className="text-[15px] font-semibold tabular-nums text-gray-900">{formatBRL(v)}</b>
                </div>
              ))}
            </div>
            {comIOF.length > 0 ? (
              <div className="rounded-md bg-amber-50 px-3 py-2 text-[12.5px] text-amber-800">
                {comIOF.length === 1 ? 'Um aporte com menos de 30 dias entrou' : `${comIOF.length} aportes com menos de 30 dias entraram`} no resgate e {comIOF.length === 1 ? 'paga' : 'pagam'} IOF ({formatBRL(tot.iof)}).{' '}
                {escolho ? 'Desmarque-o, ou espere o IOF zerar' : 'Do mais antigo, ele só entra quando os outros não bastam. Espere o IOF zerar'} em <b>{formatDate(fimDoIOF(dataDoDeposito(comIOF[0].ap)))}</b> para não pagar.
              </div>
            ) : (
              <p className="text-[12px] text-gray-500">Confira depois no banco: na lista de depósitos, os que diminuíram devem ser estes. Se o banco tirou de outros, use "Eu escolho" e acerte.</p>
            )}
          </>
        )}

        <div className="flex items-center gap-2">
          <span className="flex-1 text-[11.5px] text-gray-400">o valor aceita conta (10000+5000)</span>
          <button type="button" className="btn-secondary" onClick={onFechar}>Cancelar</button>
          <button type="submit" className="btn-primary" disabled={salvando || !!erro}>
            {salvando ? 'Salvando…' : `Resgatar ${plano.total ? formatBRL(plano.total) : ''}${usados.length ? ` de ${usados.length} ${usados.length === 1 ? 'aporte' : 'aportes'}` : ''}`}
          </button>
        </div>
      </form>
    </Modal>
  );
}
