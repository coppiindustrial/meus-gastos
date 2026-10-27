import { useEffect, useRef, useState } from 'react';
import Modal from '../components/Modal.jsx';
import SelectSimples from '../components/SelectSimples.jsx';
import Spinner from '../components/Spinner.jsx';
import { Campo } from '../components/Comuns.jsx';
import { useToast } from '../context/ToastContext.jsx';
import {
  classificarLinhas, faturaExistente, hashDoTexto, importarFatura, listarRegrasParaClassificar,
} from '../api/faturas.js';
import { lerFatura, pistaDoArquivo, vencimentoProvavel } from '../lib/lerFatura.js';
import { formatBRL } from '../lib/dinheiro.js';
import { competenciaDe, formatDate, formatDateTime, nomeCompetencia } from '../lib/format.js';

// IMPORTAR FATURA: escolher o CSV → prévia (cartão, vencimento, linhas, classificação) → gravar.
// O cartão e o vencimento vêm do nome do arquivo quando ele segue o padrão (Nubank_AAAA-MM-DD,
// FaturaAAAA-MM-DD); senão, o cartão pelo formato e o vencimento pela última compra. Os dois ficam
// editáveis. Se já existe fatura do mesmo cartão e vencimento, só entra SUBSTITUINDO a anterior.
export default function ImportarFatura({ cartoes, onFechar, onImportada }) {
  const toast = useToast();
  const inputRef = useRef(null);
  const [lido, setLido] = useState(null); // { arquivo, texto, formato, linhas, ignoradas, hash }
  const [cartaoId, setCartaoId] = useState('');
  const [vencimento, setVencimento] = useState('');
  const [existente, setExistente] = useState(null);
  const [regras, setRegras] = useState(null);
  const [gravando, setGravando] = useState(false);
  const [andamento, setAndamento] = useState('');
  const [erro, setErro] = useState('');

  useEffect(() => {
    listarRegrasParaClassificar().then(setRegras).catch((err) => toast.error(err.message));
  }, [toast]);

  const ativos = cartoes.filter((c) => c.ativo);
  const cartao = cartoes.find((c) => c.id === cartaoId);

  const escolher = async (arquivo) => {
    if (!arquivo) return;
    setErro('');
    try {
      const texto = await arquivo.text();
      const r = lerFatura(texto);
      const pista = pistaDoArquivo(arquivo.name);
      // Cartão: pelo nome do arquivo; senão o único cartão com esse formato de importação.
      const porFormato = ativos.filter((c) => c.formato === (r.formato === 'nubank' ? 'nubank' : 'xp'));
      const c = ativos.find((x) => x.formato === pista.cartao) ?? (porFormato.length === 1 ? porFormato[0] : null);
      setCartaoId(c?.id ?? '');
      setVencimento(pista.vencimento ?? vencimentoProvavel(r.linhas, c?.dia_vencimento) ?? '');
      setLido({ arquivo: arquivo.name, texto, ...r, hash: await hashDoTexto(texto) });
    } catch (err) {
      setLido(null);
      setErro(err.message);
    } finally {
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  // Já existe fatura deste cartão neste vencimento?
  useEffect(() => {
    setExistente(null);
    if (!cartaoId || !/^\d{4}-\d{2}-\d{2}$/.test(vencimento)) return;
    let vivo = true;
    faturaExistente(cartaoId, vencimento).then((f) => { if (vivo) setExistente(f); }).catch(() => {});
    return () => { vivo = false; };
  }, [cartaoId, vencimento]);

  const classificadas = lido && regras ? classificarLinhas(lido.linhas, regras) : null;
  const semCategoria = classificadas?.filter((l) => !l.categoria_id).length ?? 0;
  const total = lido?.linhas.reduce((s, l) => s + l.valor_centavos, 0) ?? 0;
  const pronto = lido && classificadas && cartaoId && /^\d{4}-\d{2}-\d{2}$/.test(vencimento);

  const gravar = async () => {
    setGravando(true);
    try {
      await importarFatura({
        cartaoId, vencimento, arquivo: lido.arquivo, hash: lido.hash, linhas: classificadas, substituirId: existente?.id,
      }, (n) => setAndamento(`${n} de ${classificadas.length}`));
      toast.success(`Fatura importada: ${classificadas.length} lançamentos${semCategoria ? `, ${semCategoria} para revisar` : ''}.`);
      onImportada({ revisar: semCategoria });
    } catch (err) {
      toast.error(err.message);
      setGravando(false);
    }
  };

  return (
    <Modal open onClose={onFechar} title="Importar fatura" maxWidth="max-w-xl">
      <div className="space-y-4 text-sm text-gray-700">
        {!lido ? (
          <div>
            <p>
              Escolha o CSV da fatura <strong>como o banco exporta</strong>: Nubank (<code>date,title,amount</code>) ou XP
              (<code>Data;Estabelecimento;Portador;Valor;Parcela</code>). Não abra no Excel antes: ele estraga as parcelas.
            </p>
            <button type="button" className="btn-primary mt-4" onClick={() => inputRef.current?.click()} disabled={!regras}>
              {regras ? 'Escolher arquivo CSV' : 'Carregando regras…'}
            </button>
            {erro && <p className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-red-700">{erro}</p>}
          </div>
        ) : (
          <>
            <div className="flex items-baseline justify-between gap-2">
              <span className="truncate font-medium text-gray-800">{lido.arquivo}</span>
              <button type="button" className="shrink-0 text-xs font-medium text-gray-500 hover:text-gray-800" onClick={() => inputRef.current?.click()}>Trocar arquivo</button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Campo rotulo="Cartão">
                <SelectSimples value={cartaoId} onChange={setCartaoId} opcoes={ativos.map((c) => ({ value: c.id, label: c.nome }))} />
              </Campo>
              <Campo rotulo="Vencimento">
                <input className="input" type="date" value={vencimento} onChange={(e) => setVencimento(e.target.value)} />
              </Campo>
            </div>
            {vencimento && <p className="-mt-2 text-xs text-gray-500">Os lançamentos contam em <strong>{nomeCompetencia(competenciaDe(vencimento)).toLowerCase()}</strong>.</p>}
            {cartao && !cartao.ativo && <p className="text-amber-700">Este cartão está inativo.</p>}

            <ul className="grid grid-cols-2 gap-x-4 gap-y-1 rounded-md bg-gray-50 px-3 py-2.5">
              <li><strong>{lido.linhas.length}</strong> compras · {formatBRL(total)}</li>
              <li><strong>{lido.linhas.filter((l) => l.parcela_total).length}</strong> parceladas</li>
              <li><strong>{lido.linhas.length - semCategoria}</strong> classificadas pelas regras</li>
              <li className={semCategoria ? 'text-amber-700' : ''}><strong>{semCategoria}</strong> para revisar</li>
              {lido.ignoradas.length > 0 && (
                <li className="col-span-2 text-gray-500">
                  Fora da fatura (pagamentos e estornos): {lido.ignoradas.map((l) => `${l.estabelecimento} ${formatBRL(-l.valor_centavos)}`).join('; ')}
                </li>
              )}
            </ul>

            {existente && (
              <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2.5 text-amber-800">
                Já existe a fatura do {cartao?.nome} com vencimento {formatDate(vencimento)}: {existente.qtd} lançamentos,{' '}
                {formatBRL(existente.total_centavos)}, {existente.importado_de === 'planilha' ? 'vinda da planilha' : `importada em ${formatDateTime(existente.importada_em)}`}.
                {' '}Importar <strong>substitui</strong> a anterior (e as categorias que você tiver mudado nela).
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-1">
              {gravando && andamento && <span className="mr-auto text-xs text-gray-500">Gravando… {andamento}</span>}
              <button type="button" className="btn-secondary" onClick={onFechar}>Cancelar</button>
              <button type="button" className={existente ? 'btn-danger' : 'btn-primary'} onClick={gravar} disabled={!pronto || gravando}>
                {gravando ? <><Spinner className="h-4 w-4" /> Importando…</> : existente ? 'Substituir fatura' : 'Importar'}
              </button>
            </div>
          </>
        )}
      </div>
      <input ref={inputRef} type="file" accept=".csv,text/csv" hidden onChange={(e) => escolher(e.target.files?.[0])} />
    </Modal>
  );
}
