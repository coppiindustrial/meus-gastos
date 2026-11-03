import { useEffect, useRef, useState } from 'react';
import Modal from '../components/Modal.jsx';
import AreaArrastar from '../components/AreaArrastar.jsx';
import CampoData from '../components/CampoData.jsx';
import SelectSimples from '../components/SelectSimples.jsx';
import Spinner from '../components/Spinner.jsx';
import { Campo } from '../components/Comuns.jsx';
import { useToast } from '../context/ToastContext.jsx';
import {
  acrescentarCreditos, classificarLinhas, faturaExistente, hashDoTexto, importarFatura, listarRegrasParaClassificar,
} from '../api/faturas.js';
import { registrarImportacao } from '../api/importacoes.js';
import { creditosQueFaltam, lerFaturaComModelos, semSaldoAnterior, separarCreditos } from '../lib/lerFatura.js';
import { decodificar } from '../lib/modeloCsv.js';
import { ligarCartaoAoModelo, listarModelos } from '../api/modelos.js';
import { modeloParaLigar } from '../lib/cartoes.js';
import AssistenteModelo from '../components/AssistenteModelo.jsx';
import { formatBRL } from '../lib/dinheiro.js';
import { competenciaDe, formatDate, formatDateTime, nomeCompetencia } from '../lib/format.js';

// IMPORTAR FATURA: escolher o CSV → prévia (cartão, vencimento, linhas, classificação) → gravar.
// O cartão e o vencimento vêm do nome do arquivo quando ele segue o padrão (Nubank_AAAA-MM-DD,
// FaturaAAAA-MM-DD); senão, o cartão pelo formato e o vencimento pela última compra. Os dois ficam
// editáveis. Se já existe fatura do mesmo cartão e vencimento, só entra SUBSTITUINDO a anterior.
// `inicial` ({ cartaoId, vencimento }): aberto pela célula "falta importar" da tela Importar — vale quando
// o nome do arquivo não diz outra coisa. Cada importação vai para o histórico (`registrarImportacao`).
// OS CRÉDITOS (03/11/2026, migration 012): o estorno e o crédito do cartão entram com o valor NEGATIVO e abatem do total
// (`separarCreditos`; só o pagamento fica de fora). Fatura que já existe sem eles: "Acrescentar só os créditos que
// faltam" grava só esses, sem substituir (`creditosQueFaltam`, `acrescentarCreditos`).
// OS MODELOS (03/11/2026, fase 7.3 do importador configurável): o arquivo é lido pelo primeiro modelo que reconhece o
// cabeçalho — os que você ensinou, depois Nubank e XP (`lerFaturaComModelos`, testada), e o texto sai dos BYTES
// (UTF-8 ou o Windows-1252 do Excel). Nenhum reconhece: "Ensinar este formato" abre o `AssistenteModelo` já com o
// arquivo, e o modelo salvo lê o mesmo arquivo na hora; ou "Ler com o modelo…" escolhe um dos ensinados (o que não
// reconhece pelo cabeçalho só entra assim, ou pela célula do cartão dele). A fatura que entra por um modelo seu num
// cartão de LANÇAMENTO MANUAL liga o cartão ao modelo (`modeloParaLigar`; a prévia avisa): os próximos arquivos, também
// no "Importar arquivos", já acham o cartão.
export default function ImportarFatura({ cartoes, onFechar, onImportada, inicial = null }) {
  const toast = useToast();
  const inputRef = useRef(null);
  const [lido, setLido] = useState(null); // { arquivo, texto, formato, linhas, ignoradas, hash }
  const [cartaoId, setCartaoId] = useState(inicial?.cartaoId ?? '');
  const [vencimento, setVencimento] = useState(inicial?.vencimento ?? '');
  const [existente, setExistente] = useState(null);
  const [regras, setRegras] = useState(null);
  const [gravando, setGravando] = useState(false);
  const [andamento, setAndamento] = useState('');
  const [erro, setErro] = useState('');
  const [modelos, setModelos] = useState([]);
  const [desconhecido, setDesconhecido] = useState(null); // o File que nenhum modelo reconheceu
  const [ensinando, setEnsinando] = useState(false);

  useEffect(() => {
    listarRegrasParaClassificar().then(setRegras).catch((err) => toast.error(err.message));
    listarModelos().then((m) => setModelos(m ?? [])).catch(() => {});
  }, [toast]);

  const ativos = cartoes.filter((c) => c.ativo);
  const cartao = cartoes.find((c) => c.id === cartaoId);

  const escolher = async (arquivo, comModelos = modelos, modeloId = null) => {
    if (!arquivo) return;
    setErro('');
    setDesconhecido(null);
    try {
      const texto = decodificar(new Uint8Array(await arquivo.arrayBuffer()));
      const r = lerFaturaComModelos(texto, arquivo.name, { modelos: comModelos, cartoes, inicial, modeloId });
      setCartaoId(r.cartao?.id ?? '');
      setVencimento(r.vencimento ?? '');
      setLido({ arquivo: arquivo.name, texto, formato: r.formato, modelo: r.modelo, linhas: r.linhas, ignoradas: r.ignoradas, hash: await hashDoTexto(texto) });
    } catch (err) {
      setLido(null);
      setErro(err.message);
      if (err.naoReconhecido) setDesconhecido(arquivo);
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

  // As que uma regra de ignorar pega não entram (nem na conta do total). Os créditos são classificados como as compras.
  const { creditos: creditosLidos, pagamentos } = separarCreditos(lido?.ignoradas);
  const { compras: comprasLidas, anteriores } = semSaldoAnterior(lido?.linhas);
  const todas = lido && regras ? classificarLinhas([...comprasLidas, ...creditosLidos], regras) : null;
  const classificadas = todas?.filter((l) => !l.ignorar) ?? null;
  const compras = classificadas?.filter((l) => l.valor_centavos > 0) ?? [];
  const creditos = classificadas?.filter((l) => l.valor_centavos < 0) ?? [];
  const faltam = existente ? creditosQueFaltam(creditos, existente.creditos ?? []) : creditos;
  const ignoradasPorRegra = todas?.filter((l) => l.ignorar) ?? [];
  const semCategoria = classificadas?.filter((l) => !l.categoria_id).length ?? 0;
  const soma = (ls) => ls.reduce((s, l) => s + l.valor_centavos, 0);
  const total = soma(classificadas ?? []);
  const pronto = lido && classificadas && cartaoId && /^\d{4}-\d{2}-\d{2}$/.test(vencimento);
  const ligar = lido ? modeloParaLigar(cartao, lido.modelo) : null;

  // Só os créditos que faltam na fatura que já existe (nada é substituído).
  const gravarCreditos = async () => {
    setGravando(true);
    try {
      await acrescentarCreditos({ faturaId: existente.id, cartaoId, vencimento, linhas: faltam });
      toast.success(`${faltam.length} ${faltam.length === 1 ? 'crédito acrescentado' : 'créditos acrescentados'}: a fatura passa a ${formatBRL(Number(existente.total_centavos) + soma(faltam))}.`);
      onImportada({ revisar: faltam.filter((l) => !l.categoria_id).length });
    } catch (err) {
      toast.error(err.message);
      setGravando(false);
    }
  };

  const gravar = async () => {
    setGravando(true);
    try {
      const faturaId = await importarFatura({
        cartaoId, vencimento, arquivo: lido.arquivo, hash: lido.hash, linhas: compras, substituirId: existente?.id,
      }, (n) => setAndamento(`${n} de ${compras.length}`));
      // os créditos num passo à parte: sem a migration 012 o banco os recusa, e a fatura não pode ficar pela metade
      if (creditos.length) {
        try { await acrescentarCreditos({ faturaId, cartaoId, vencimento, linhas: creditos }); } catch (err) { toast.error(`A fatura entrou sem os créditos: ${err.message}`); }
      }
      await registrarImportacao({
        tipo: 'fatura', cartao_id: cartaoId, fatura_id: faturaId, competencia: competenciaDe(vencimento), arquivo: lido.arquivo,
        linhas: classificadas.length, total_centavos: total,
        resumo: [`${compras.length} compras`, creditos.length && `${creditos.length} ${creditos.length === 1 ? 'crédito' : 'créditos'}`, semCategoria && `${semCategoria} sem regra`, existente && 'substituiu a anterior'].filter(Boolean).join(' · '),
      });
      let ligou = false;
      if (ligar) {
        try { await ligarCartaoAoModelo(cartaoId, ligar); ligou = true; } catch (err) {
          toast.error(`A fatura entrou, mas o ${cartao.nome} não ficou ligado ao modelo: ${err.message}`);
        }
      }
      toast.success(`Fatura importada: ${classificadas.length} lançamentos${semCategoria ? `, ${semCategoria} para revisar` : ''}.${ligou ? ` O ${cartao.nome} passa a ler pelo modelo ${lido.modelo.nome}.` : ''}`);
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
              Escolha o CSV da fatura <strong>como o banco exporta</strong>: Nubank (<code>date,title,amount</code>), XP
              (<code>Data;Estabelecimento;Portador;Valor;Parcela</code>){modelos.length ? ` ou um dos formatos que você ensinou (${modelos.map((m) => m.nome).join(', ')})` : ''}.
              Não abra no Excel antes: ele estraga as parcelas.
            </p>
            <div className="mt-4">
              <AreaArrastar onArquivos={(fs) => escolher(fs[0])} desabilitada={!regras}
                titulo={regras ? 'Arraste a fatura aqui ou' : 'Carregando as regras…'}
                formatos=".csv como o banco exporta — Nubank, XP ou um formato ensinado" />
            </div>
            {erro && (
              <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-red-700">
                {erro}
                {desconhecido && (
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-gray-700">
                    <span>É de outro banco?</span>
                    <button type="button" className="btn-secondary !py-1 !text-[12.5px]" onClick={() => setEnsinando(true)}>Ensinar este formato</button>
                    {modelos.length > 0 && (
                      <>
                        <span>ou</span>
                        <SelectSimples compacto className="w-56" value="" placeholder="Ler com o modelo…" onChange={(id) => escolher(desconhecido, modelos, id)}
                          opcoes={modelos.map((m) => ({ value: m.id, label: m.nome }))} />
                      </>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          <>
            <div className="flex items-baseline justify-between gap-2">
              <span className="min-w-0 truncate font-medium text-gray-800">{lido.arquivo}
                {lido.modelo && !lido.modelo.pronto && <span className="ml-2 text-xs font-normal text-gray-500">lido pelo modelo {lido.modelo.nome}</span>}
              </span>
              <button type="button" className="shrink-0 text-xs font-medium text-gray-500 hover:text-gray-800" onClick={() => inputRef.current?.click()}>Trocar arquivo</button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Campo rotulo="Cartão">
                <SelectSimples value={cartaoId} onChange={setCartaoId} opcoes={ativos.map((c) => ({ value: c.id, label: c.nome }))} />
              </Campo>
              <Campo rotulo="Vencimento">
                <CampoData value={vencimento} onChange={setVencimento} />
              </Campo>
            </div>
            {vencimento && <p className="-mt-2 text-xs text-gray-500">Os lançamentos contam em <strong>{nomeCompetencia(competenciaDe(vencimento)).toLowerCase()}</strong>.</p>}
            {cartao && !cartao.ativo && <p className="text-amber-700">Este cartão está inativo.</p>}

            <ul className="grid grid-cols-2 gap-x-4 gap-y-1 rounded-md bg-gray-50 px-3 py-2.5">
              <li><strong>{compras.length}</strong> compras · {formatBRL(soma(compras))}</li>
              <li><strong>{compras.filter((l) => l.parcela_total).length}</strong> parceladas</li>
              <li><strong>{(classificadas?.length ?? 0) - semCategoria}</strong> classificadas pelas regras</li>
              <li className={semCategoria ? 'text-amber-700' : ''}><strong>{semCategoria}</strong> para revisar</li>
              {ignoradasPorRegra.length > 0 && (
                <li className="col-span-2 text-gray-500">Ignoradas por regra: {ignoradasPorRegra.map((l) => `${l.estabelecimento} ${formatBRL(l.valor_centavos)}`).join('; ')}</li>
              )}
              {creditos.length > 0 && (
                <li className="col-span-2">
                  <strong>{creditos.length}</strong> {creditos.length === 1 ? 'crédito ou estorno abate' : 'créditos e estornos abatem'} {formatBRL(-soma(creditos))}:{' '}
                  <span className="text-gray-500">{creditos.map((l) => `${l.estabelecimento} ${formatBRL(l.valor_centavos)}`).join('; ')}</span>
                </li>
              )}
              <li className="col-span-2 border-t border-gray-200 pt-1"><strong>Total da fatura: {formatBRL(total)}</strong></li>
              {pagamentos.length + anteriores.length > 0 && (
                <li className="col-span-2 text-gray-500">
                  Fora da fatura ({[pagamentos.length && 'pagamento', anteriores.length && 'a fatura anterior, já contada no mês dela'].filter(Boolean).join('; ')}):{' '}
                  {[...pagamentos.map((l) => `${l.estabelecimento} ${formatBRL(-l.valor_centavos)}`), ...anteriores.map((l) => `${l.estabelecimento} ${formatBRL(l.valor_centavos)}`)].join('; ')}
                </li>
              )}
            </ul>

            {ligar && (
              <p className="-mt-1 text-xs text-gray-600">
                Ao importar, o <strong>{cartao.nome}</strong> passa a ler a fatura pelo modelo <strong>{lido.modelo.nome}</strong>: os
                próximos arquivos dele entram sozinhos (troca-se no cadastro do cartão).
              </p>
            )}
            {existente && (
              <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2.5 text-amber-800">
                Já existe a fatura do {cartao?.nome} com vencimento {formatDate(vencimento)}: {existente.qtd} lançamentos,{' '}
                {formatBRL(existente.total_centavos)}, {existente.importado_de === 'planilha' ? 'vinda da planilha' : `importada em ${formatDateTime(existente.importada_em)}`}.
                {' '}Importar <strong>substitui</strong> a anterior (e as categorias que você tiver mudado nela).
                {faltam.length > 0 && <> Ou acrescente só {faltam.length === 1 ? 'o crédito que falta' : `os ${faltam.length} créditos que faltam`}: a fatura passa a <strong>{formatBRL(Number(existente.total_centavos) + soma(faltam))}</strong>, e nada mais muda.</>}
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-1">
              {gravando && andamento && <span className="mr-auto text-xs text-gray-500">Gravando… {andamento}</span>}
              <button type="button" className="btn-secondary" onClick={onFechar}>Cancelar</button>
              {existente && faltam.length > 0 && (
                <button type="button" className="btn-primary" onClick={gravarCreditos} disabled={!pronto || gravando}>
                  Acrescentar só os créditos ({formatBRL(soma(faltam))})
                </button>
              )}
              <button type="button" className={existente ? 'btn-danger' : 'btn-primary'} onClick={gravar} disabled={!pronto || gravando}>
                {gravando ? <><Spinner className="h-4 w-4" /> Importando…</> : existente ? 'Substituir fatura' : 'Importar'}
              </button>
            </div>
          </>
        )}
      </div>
      <input ref={inputRef} type="file" accept=".csv,text/csv" hidden onChange={(e) => escolher(e.target.files?.[0])} />
      {ensinando && desconhecido && (
        <AssistenteModelo arquivoInicial={desconhecido} cartao={cartoes.find((c) => c.id === inicial?.cartaoId) ?? null}
          onFechar={() => setEnsinando(false)}
          onSalvo={(m) => { const ms = [...modelos, m]; setModelos(ms); setEnsinando(false); escolher(desconhecido, ms, m.id); }} />
      )}
    </Modal>
  );
}
