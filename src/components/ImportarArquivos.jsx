import { useEffect, useState } from 'react';
import Modal from './Modal.jsx';
import AreaArrastar from './AreaArrastar.jsx';
import Spinner from './Spinner.jsx';
import { useToast } from '../context/ToastContext.jsx';
import {
  classificarLinhas, faturaExistente, hashDoTexto, importarFatura, listarRegrasParaClassificar,
} from '../api/faturas.js';
import { registrarImportacao } from '../api/importacoes.js';
import { lerFaturaComModelos } from '../lib/lerFatura.js';
import { decodificar } from '../lib/modeloCsv.js';
import { listarModelos } from '../api/modelos.js';
import AssistenteModelo from './AssistenteModelo.jsx';
import { lerExtrato } from '../lib/lerExtrato.js';
import { periodoDasLinhas } from '../lib/importacoes.js';
import { formatBRL } from '../lib/dinheiro.js';
import { competenciaDe, formatDate, formatDateTime } from '../lib/format.js';
import { varCor } from '../lib/varCor.js';

// "IMPORTAR ARQUIVOS" (a tela Importar, 28/10/2026): solta os arquivos do mês de uma vez — faturas e o
// extrato — e cada um é reconhecido pelo CABEÇALHO (o formato) e pelo NOME (cartão e vencimento, como no
// importador da fatura). As faturas entram daqui mesmo; a já importada é PULADA (ou substituída, se pedir).
// O extrato não grava aqui: ele abre a prévia de sempre (o pop-up `ImportarExtrato`, com as regras), depois das faturas.
// `onFeito(arquivoDoExtrato | null)`.
// OS MODELOS (03/11/2026, fase 7.3): a fatura é lida pelo primeiro modelo que reconhece o cabeçalho (os ensinados,
// depois Nubank e XP — `lerFaturaComModelos`), do texto dos BYTES (UTF-8 ou Windows-1252). O arquivo que ninguém
// reconhece (nem como extrato) ganha "Ensinar este formato": o assistente já com ele, e salvo, a linha se refaz.

const TOM_OK = { background: varCor('#e7f6ee', 'fundo'), color: varCor('#15803d', 'texto') };
const TOM_AVISO = { background: varCor('#fdf3d9', 'fundo'), color: varCor('#9a6f00', 'texto') };
const TOM_ERRO = { background: varCor('#fdeaea', 'fundo'), color: varCor('#c0393d', 'texto') };
const CHIP = 'inline-flex items-center rounded-[4px] px-1.5 py-0.5 text-[11.5px] font-semibold whitespace-nowrap';

async function reconhecer(arquivo, cartoes, regras, modelos) {
  const texto = decodificar(new Uint8Array(await arquivo.arrayBuffer()));
  try {
    const r = lerFaturaComModelos(texto, arquivo.name, { modelos, cartoes });
    const { cartao, vencimento } = r;
    const linhas = classificarLinhas(r.linhas, regras).filter((l) => !l.ignorar);
    const existente = cartao && vencimento ? await faturaExistente(cartao.id, vencimento) : null;
    return {
      tipo: 'fatura', nome: arquivo.name, cartao, vencimento, linhas, existente, modelo: r.modelo,
      hash: await hashDoTexto(texto),
      total: linhas.reduce((s, l) => s + l.valor_centavos, 0),
      semRegra: linhas.filter((l) => !l.categoria_id).length,
      acao: !cartao || !vencimento ? 'nada' : existente ? 'pular' : 'importar',
    };
  } catch {
    try {
      const linhas = lerExtrato(texto);
      return { tipo: 'extrato', nome: arquivo.name, arquivo, qtd: linhas.length, ...periodoDasLinhas(linhas), acao: 'abrir' };
    } catch {
      return { tipo: 'erro', nome: arquivo.name, arquivo, acao: 'nada' };
    }
  }
}

export default function ImportarArquivos({ cartoes, onFechar, onFeito }) {
  const toast = useToast();
  const [regras, setRegras] = useState(null);
  const [itens, setItens] = useState([]);
  const [lendo, setLendo] = useState(false);
  const [gravando, setGravando] = useState('');
  const [modelos, setModelos] = useState([]);
  const [ensinando, setEnsinando] = useState(null); // o item do arquivo desconhecido

  useEffect(() => {
    listarRegrasParaClassificar().then(setRegras).catch((err) => toast.error(err.message));
    listarModelos().then((m) => setModelos(m ?? [])).catch(() => {});
  }, [toast]);

  // Ensinado o formato: a linha do arquivo se refaz com o modelo novo (no mesmo lugar da lista).
  const reler = async (item, ms) => {
    const novo = await reconhecer(item.arquivo, cartoes, regras, ms);
    setItens((xs) => xs.map((i) => (i.nome === item.nome ? novo : i)));
  };

  const adicionar = async (lista) => {
    const novos = [...lista].filter((f) => !itens.some((i) => i.nome === f.name));
    if (!novos.length || !regras) return;
    setLendo(true);
    try {
      const lidos = await Promise.all(novos.map((f) => reconhecer(f, cartoes, regras, modelos)));
      setItens((atual) => {
        const todos = [...atual, ...lidos];
        // Um extrato por vez: o primeiro abre a prévia, os outros ficam de fora.
        let jaTem = false;
        return todos.map((i) => {
          if (i.tipo !== 'extrato') return i;
          const fica = !jaTem;
          jaTem = true;
          return { ...i, acao: fica ? 'abrir' : 'nada', outroExtrato: !fica };
        });
      });
    } catch (err) { toast.error(err.message); } finally { setLendo(false); }
  };

  const alternar = (nome) => setItens((xs) => xs.map((i) => (i.nome === nome ? { ...i, acao: i.acao === 'pular' ? 'substituir' : 'pular' } : i)));
  const tirar = (nome) => setItens((xs) => xs.filter((i) => i.nome !== nome));

  const aGravar = itens.filter((i) => i.tipo === 'fatura' && (i.acao === 'importar' || i.acao === 'substituir'));
  const extrato = itens.find((i) => i.tipo === 'extrato' && i.acao === 'abrir');
  const rotuloBotao = aGravar.length
    ? `Importar ${aGravar.length} ${aGravar.length === 1 ? 'fatura' : 'faturas'}${extrato ? ' e abrir o extrato' : ''}`
    : extrato ? 'Abrir o extrato' : 'Importar';

  const importar = async () => {
    let feitas = 0;
    try {
      for (const f of aGravar) {
        setGravando(`${f.cartao.nome} ${formatDate(f.vencimento)}…`);
        const faturaId = await importarFatura({
          cartaoId: f.cartao.id, vencimento: f.vencimento, arquivo: f.nome, hash: f.hash, linhas: f.linhas,
          substituirId: f.acao === 'substituir' ? f.existente?.id : undefined,
        });
        await registrarImportacao({
          tipo: 'fatura', cartao_id: f.cartao.id, fatura_id: faturaId, competencia: competenciaDe(f.vencimento), arquivo: f.nome,
          linhas: f.linhas.length, total_centavos: f.total,
          resumo: [`${f.linhas.length} compras`, f.semRegra && `${f.semRegra} sem regra`, f.acao === 'substituir' && 'substituiu a anterior'].filter(Boolean).join(' · '),
        });
        feitas += 1;
      }
      if (feitas) toast.success(`${feitas} ${feitas === 1 ? 'fatura importada' : 'faturas importadas'}.`);
      onFeito(extrato?.arquivo ?? null);
    } catch (err) {
      toast.error(`${feitas ? `${feitas} entraram; ` : ''}parou em ${gravando || 'uma fatura'}: ${err.message}`);
      setGravando('');
      onFeito(null);
    }
  };

  const conteudo = (i) => {
    if (i.tipo === 'fatura') return `${i.linhas.length} compras · ${formatBRL(i.total)}`;
    if (i.tipo === 'extrato') return `${formatDate(i.de)} a ${formatDate(i.ate)} · ${i.qtd} mov.`;
    return '—';
  };
  const reconhecido = (i) => {
    if (i.tipo === 'fatura') {
      const pelo = i.modelo && !i.modelo.pronto ? ` (modelo ${i.modelo.nome})` : '';
      return i.cartao ? `Fatura ${i.cartao.nome}${i.vencimento ? ` · venc. ${formatDate(i.vencimento)}` : ''}${pelo}` : `Fatura (cartão não reconhecido)${pelo}`;
    }
    if (i.tipo === 'extrato') return 'Extrato da conta';
    return 'Formato não reconhecido';
  };
  const destino = (i) => {
    if (i.tipo === 'erro') {
      return (
        <>
          <span className={CHIP} style={TOM_ERRO}>fica de fora</span>
          <button type="button" onClick={() => setEnsinando(i)} disabled={Boolean(gravando)}
            className="mt-0.5 block text-[11px] text-gray-500 underline hover:text-gray-800">Ensinar este formato</button>
        </>
      );
    }
    if (i.tipo === 'extrato') {
      return i.outroExtrato
        ? <span className={CHIP} style={TOM_AVISO}>um extrato por vez</span>
        : <><span className={CHIP} style={TOM_OK}>abre a prévia</span><span className="mt-0.5 block text-[11px] text-gray-400">com as regras, depois das faturas</span></>;
    }
    if (i.acao === 'nada') return <><span className={CHIP} style={TOM_AVISO}>fica de fora</span><span className="mt-0.5 block text-[11px] text-gray-400">sem cartão ou vencimento: use o “Importar” da célula</span></>;
    if (i.existente) {
      return (
        <>
          <span className={CHIP} style={TOM_AVISO}>
            já importada{i.existente.importado_de === 'planilha' ? ' (planilha)' : ` em ${formatDateTime(i.existente.importada_em).slice(0, 5)}`}
          </span>
          <button type="button" onClick={() => alternar(i.nome)} className="mt-0.5 block text-[11px] text-gray-500 underline hover:text-gray-800">
            {i.acao === 'substituir' ? 'vai substituir · pular' : 'vai pular · substituir'}
          </button>
        </>
      );
    }
    return <><span className={CHIP} style={TOM_OK}>entra</span>{i.semRegra > 0 && <span className="mt-0.5 block text-[11px] text-gray-400">{i.semRegra} sem regra vão para Revisar pendências</span>}</>;
  };

  return (
    <Modal open onClose={gravando ? () => {} : onFechar} title="Importar arquivos" maxWidth="max-w-3xl"
      subtitulo="faturas e extrato de uma vez — cada arquivo é reconhecido pelo nome e pelo cabeçalho">
      <div className="space-y-3 text-[12.5px] text-gray-700">
        <AreaArrastar multiplo onArquivos={adicionar} compacta={itens.length > 0} desabilitada={!regras || lendo}
          titulo={itens.length ? 'Solte mais arquivos aqui ou' : 'Arraste os arquivos do mês aqui ou'}
          formatos={`.csv — faturas do Nubank, da XP${modelos.length ? ` e dos formatos ensinados (${modelos.map((m) => m.nome).join(', ')})` : ''}, extrato da conta do Nubank · vários de uma vez`} />
        {(lendo || !regras) && <p className="-mt-1 flex items-center gap-2 text-[12px] text-gray-500"><Spinner className="h-3.5 w-3.5" />{regras ? 'Lendo os arquivos…' : 'Carregando as regras…'}</p>}

        {itens.length > 0 && (
          <div className="overflow-x-auto rounded-md border border-gray-200">
            <table className="w-full min-w-[620px]">
              <thead className="bg-hx-f9fafb">
                <tr><th className="table-th">Arquivo</th><th className="table-th">Reconhecido como</th><th className="table-th">Conteúdo</th><th className="table-th">O que acontece</th><th className="table-th" /></tr>
              </thead>
              <tbody>
                {itens.map((i) => (
                  <tr key={i.nome} className="align-top">
                    <td className="max-w-[200px] truncate border-b border-gray-100 px-3 py-2 text-gray-600" title={i.nome}>{i.nome}</td>
                    <td className="border-b border-gray-100 px-3 py-2 font-medium text-gray-800">{reconhecido(i)}</td>
                    <td className="whitespace-nowrap border-b border-gray-100 px-3 py-2 text-gray-500">{conteudo(i)}</td>
                    <td className="border-b border-gray-100 px-3 py-2">{destino(i)}</td>
                    <td className="border-b border-gray-100 px-2 py-2 text-right">
                      <button type="button" onClick={() => tirar(i.nome)} aria-label={`Tirar ${i.nome}`} disabled={Boolean(gravando)}
                        className="rounded-[4px] px-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700">×</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex items-center justify-end gap-2 pt-1">
          <span className="mr-auto text-[12px] text-gray-500">
            {gravando ? `Gravando ${gravando}` : itens.length ? `${aGravar.length + (extrato ? 1 : 0)} de ${itens.length} ${itens.length === 1 ? 'arquivo entra' : 'arquivos entram'}` : ''}
          </span>
          <button type="button" className="btn-secondary" onClick={onFechar} disabled={Boolean(gravando)}>Cancelar</button>
          <button type="button" className="btn-primary" onClick={importar} disabled={Boolean(gravando) || lendo || (!aGravar.length && !extrato)}>
            {gravando ? <><Spinner className="h-4 w-4" /> Importando…</> : rotuloBotao}
          </button>
        </div>
      </div>
      {ensinando && (
        <AssistenteModelo arquivoInicial={ensinando.arquivo} cartao={null} onFechar={() => setEnsinando(null)}
          onSalvo={(m) => { const ms = [...modelos, m]; setModelos(ms); const item = ensinando; setEnsinando(null); reler(item, ms).catch((err) => toast.error(err.message)); }} />
      )}
    </Modal>
  );
}
