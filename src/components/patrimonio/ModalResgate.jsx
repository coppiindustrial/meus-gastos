import { useState } from 'react';
import Modal from '../Modal.jsx';
import CampoData from '../CampoData.jsx';
import Toggle from '../Toggle.jsx';
import { Campo } from '../Comuns.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { criarResgate } from '../../api/carteira.js';
import { calcularValor, formatBRL } from '../../lib/dinheiro.js';
import { formatDate } from '../../lib/format.js';
import { lerResgate, posicaoDoAporte } from '../../lib/carteira.js';

// RESGATAR DE UM APORTE (07/11/2026, a carteira do zero): a data e o valor, ou "Tudo". O resgate sai DAQUELE aporte: o que
// ele tinha de aplicado e de rendimento diminui na mesma proporção (como o banco), e o resto continua rendendo. "Tudo" (ou
// o valor inteiro) encerra o aporte. `item`: { ap, inv, resgates } da carteira.
export default function ModalResgate({ item, cal, hoje, onFechar, onSalvo }) {
  const toast = useToast();
  const { ap, inv, resgates } = item;
  const [data, setData] = useState(hoje);
  const [valor, setValor] = useState('');
  const [tudo, setTudo] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [tentou, setTentou] = useState(false);

  // o que o aporte vale no dia do resgate (com os resgates de antes)
  const pos = data ? posicaoDoAporte(ap, inv, resgates.filter((r) => r.data <= data), cal, data) : null;
  const vale = pos?.encerrado ? 0 : pos?.vale ?? 0;
  const centavos = calcularValor(valor);
  const r = lerResgate({ aporte: ap.id, data, valor: centavos, tudo }, pos?.partida.data ?? ap.data, vale, hoje);
  const erro = valor.trim() && !tudo && centavos === null ? 'O valor não é um número.' : pos?.encerrado ? 'Nesse dia o aporte já tinha saído.' : r.erro;
  const fica = !erro && r.dados && !r.dados.tudo ? vale - r.dados.valor_centavos : 0;
  const ficaAplicado = !erro && r.dados && !r.dados.tudo && vale ? Math.round(pos.aplicado * (fica / vale)) : 0;

  const salvar = async (e) => {
    e?.preventDefault();
    setTentou(true);
    if (erro || !r.dados) return;
    setSalvando(true);
    try {
      await criarResgate(r.dados);
      toast.success(r.dados.tudo ? 'Resgatou tudo: o aporte foi para os encerrados.' : `Resgate de ${formatBRL(r.dados.valor_centavos)} lançado.`);
      onSalvo();
    } catch (err) { toast.error(err.message); setSalvando(false); }
  };

  const desde = ap.origem === 'antigo' ? ap.aplicado_em ?? ap.data : ap.data;
  return (
    <Modal open onClose={onFechar} title="Resgatar" maxWidth="max-w-md" subtitulo={`${inv.nome} · o aporte de ${formatDate(desde)}`}>
      <form onSubmit={salvar} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Campo rotulo="Data do resgate"><CampoData value={data} onChange={setData} max={hoje} min={ap.data} /></Campo>
          <Campo rotulo="Valor (R$)">
            <input className="input text-right tabular-nums" inputMode="decimal" autoFocus placeholder="0,00" value={tudo ? '' : valor} disabled={tudo}
              onChange={(e) => setValor(e.target.value)} />
          </Campo>
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-[13px] text-gray-700">
          <Toggle compacto checked={tudo} onChange={setTudo} rotulo="Resgatar tudo" />
          Tudo{vale ? ` (${formatBRL(vale)} em ${formatDate(data)})` : ''}
        </label>
        <div className={`rounded-md border px-3 py-2.5 text-[12.5px] ${erro && tentou ? 'border-red-200 bg-red-50 text-red-700' : 'border-gray-200 bg-hx-f9fafb text-gray-600'}`} aria-live="polite">
          {erro ? (tentou ? erro : <span className="text-gray-500">Nesse dia o aporte vale {formatBRL(vale)}. Digite quanto saiu, ou marque "Tudo".</span>)
            : r.dados.tudo ? <span>O aporte sai inteiro ({formatBRL(vale)}) e vai para os encerrados.</span>
              : (
                <div className="space-y-1">
                  <div className="flex justify-between gap-3"><span>Vale em {formatDate(data)}</span><span className="tabular-nums">{formatBRL(vale)}</span></div>
                  <div className="flex justify-between gap-3"><span>Fica rendendo</span><b className="tabular-nums text-gray-900">{formatBRL(fica)}</b></div>
                  <div className="flex justify-between gap-3"><span>O aplicado passa a</span><span className="tabular-nums">{formatBRL(ficaAplicado)}</span></div>
                </div>
              )}
        </div>
        <div className="flex items-center gap-2">
          <span className="flex-1" />
          <button type="button" className="btn-secondary" onClick={onFechar}>Cancelar</button>
          <button type="submit" className="btn-primary" disabled={salvando || (tentou && !!erro)}>{salvando ? 'Salvando…' : 'Resgatar'}</button>
        </div>
      </form>
    </Modal>
  );
}
