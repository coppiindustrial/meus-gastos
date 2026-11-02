import { useCallback, useEffect, useMemo, useState } from 'react';
import Modal from '../components/Modal.jsx';
import SeletorCategoria from '../components/SeletorCategoria.jsx';
import Spinner from '../components/Spinner.jsx';
import AreaArrastar from '../components/AreaArrastar.jsx';
import { Etiqueta } from '../components/Comuns.jsx';
import Toggle from '../components/Toggle.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { listarCategorias } from '../api/cadastros.js';
import { listarRegrasParaClassificar } from '../api/faturas.js';
import { listarRecorrencias } from '../api/fixos.js';
import { salvarRegra } from '../api/regras.js';
import { entradasManuais, fixosLancados, gravarExtrato, idsJaImportados } from '../api/extrato.js';
import { registrarImportacao } from '../api/importacoes.js';
import { periodoDasLinhas } from '../lib/importacoes.js';
import { lerExtrato } from '../lib/lerExtrato.js';
import { planejarExtrato } from '../lib/planoExtrato.js';
import { criarClassificador } from '../lib/classificar.js';
import { formatBRL } from '../lib/dinheiro.js';
import { formatDate } from '../lib/format.js';
import { lsGet, lsSet } from '../lib/storage.js';

// IMPORTAR O EXTRATO DA CONTA (Nubank), num POP-UP como o da fatura (29/10/2026: antes era a tela /extrato, que
// abria fora do Importar). Escolher o CSV → a prévia mostra o destino de cada movimentação (lib/planoExtrato.js) →
// o que ainda não tem regra pode ser classificado ali mesmo, criando a regra (ou uma regra de IGNORAR, para as
// transferências entre as suas contas) → importar. Com a prévia, o pop-up cresce para o painel dos ampliados
// (1100px, 90% da altura) e o rodapé com o "Importar" fica preso embaixo.
// Decisões (2026-10-27): entradas continuam à mão — a não ser que a pessoa ligue "Trazer as entradas" (30/10/2026, a
// preferência fica lembrada; a que já foi lançada à mão não entra de novo); pagamento de fatura e investimentos ficam de fora;
// o pagamento de um gasto fixo vira o fixo do mês com o valor real. Cada importação vai para o histórico, com o
// que desfazê-la. `arquivo`: o File já escolhido no "Importar arquivos" (abre direto na prévia).
const IGNORAR = '__ignorar';
// TIRAR A ESCOLHA (02/11/2026, a pedido): a primeira opção volta a linha a "sem categoria" — antes, escolhida uma
// categoria (ou o Ignorar), só fechando a prévia e escolhendo o arquivo de novo. O '-' só existe na lista.
const NENHUMA = '-';
const EXTRAS_IGNORAR = [
  { value: NENHUMA, label: 'Nenhuma (não criar regra)' },
  { value: IGNORAR, label: 'Ignorar sempre (não é gasto, ou você já lança à mão)' },
];

const LS_ENTRADAS = 'extrato_entradas';
// A data a N dias (para procurar as entradas lançadas à mão um pouco antes e depois do período do arquivo).
const maisDias = (iso, n) => { const [y, m, d] = iso.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); };

const ROTULO = {
  entrada: (p, nomeCat) => <Etiqueta tom="verde">Entrada{p.categoriaId ? ` · ${nomeCat(p.categoriaId)}` : ''}</Etiqueta>,
  ignorar: (p) => <Etiqueta>Fora: {p.motivo}</Etiqueta>,
  ja: () => <Etiqueta>Já importada</Etiqueta>,
  fixo_novo: (p) => <Etiqueta tom="verde">Fixo: {p.recorrencia.descricao}</Etiqueta>,
  fixo_corrigir: (p) => <Etiqueta tom="verde">Corrige o fixo {p.recorrencia.descricao}</Etiqueta>,
  avulso: (p, nomeCat) => (p.categoriaId
    ? <Etiqueta>{nomeCat(p.categoriaId)}{p.soAgora ? ' · só desta vez' : ''}</Etiqueta>
    : <Etiqueta tom="ambar">Sem regra</Etiqueta>),
};

// Uma linha por contraparte sem regra: escolher a categoria (ou Ignorar) cria a regra na hora — ou vale SÓ DESTA VEZ
// (02/11/2026, a pedido: o Pix de um amigo, a compra de um celular — o que não se repete não merece regra, que
// classificaria todo Pix futuro para a mesma pessoa). `escolhida`: a escolha "só desta vez" já feita (com o Desfazer).
function SemRegra({ grupo, categorias, onCriar, onCategoriaCriada, escolhida, nomeCat, onSoAgora }) {
  const [categoria, setCategoria] = useState('');
  const [palavra, setPalavra] = useState(grupo.contraparte);
  const [salvando, setSalvando] = useState(false);
  const criar = async () => {
    setSalvando(true);
    await onCriar(palavra.trim(), categoria);
    setSalvando(false);
  };
  const cabeca = (
    <span className="min-w-[10rem] flex-1">
      <span className="block truncate text-sm text-gray-800">{grupo.contraparte}</span>
      <span className="block text-xs text-gray-500">{grupo.n} movimentação(ões) · {formatBRL(grupo.total)}</span>
    </span>
  );
  if (escolhida) {
    return (
      <li className="flex flex-wrap items-center gap-2 bg-hx-f9fafb px-4 py-2.5">
        {cabeca}
        <span className="text-[12.5px] text-gray-600">
          Só desta vez: <b className="font-semibold text-gray-800">{escolhida === IGNORAR ? 'fica de fora' : nomeCat(escolhida)}</b>
          <span className="ml-1 text-gray-400">· sem regra</span>
        </span>
        <button type="button" className="text-[12px] text-gray-500 underline underline-offset-2 hover:text-gray-800" onClick={() => onSoAgora(null)}>Desfazer</button>
      </li>
    );
  }
  return (
    <li className="flex flex-wrap items-center gap-2 px-4 py-2.5">
      {cabeca}
      <input className="input !w-44 !py-1.5" value={palavra} onChange={(e) => setPalavra(e.target.value)} aria-label="Palavra-chave da regra" />
      <SeletorCategoria className="w-64" value={categoria} onChange={(v) => setCategoria(v === NENHUMA ? '' : v)} categorias={categorias} tipo="saida"
        extras={EXTRAS_IGNORAR} onCriada={onCategoriaCriada} />
      <button type="button" className="btn-secondary !py-1.5" disabled={!categoria || !palavra.trim() || salvando} onClick={criar}>
        {salvando ? 'Criando…' : 'Criar regra'}
      </button>
      <button type="button" className="btn-secondary !py-1.5" disabled={!categoria || salvando} onClick={() => onSoAgora(categoria)}
        title="Usa a categoria só nesta importação, sem criar regra (o próximo Pix para esta pessoa volta a perguntar)">
        Só desta vez
      </button>
    </li>
  );
}

export default function ImportarExtrato({ arquivo: arquivoInicial = null, onFechar, onImportado }) {
  const toast = useToast();
  const [base, setBase] = useState(null); // { categorias, regras, recorrencias, fixos }
  const [arquivo, setArquivo] = useState(null); // { nome, linhas }
  const [ja, setJa] = useState(new Set());
  const [manuais, setManuais] = useState([]);
  const [comEntradas, setComEntradasEstado] = useState(() => lsGet(LS_ENTRADAS) === 'sim');
  const setComEntradas = (v) => { setComEntradasEstado(v); lsSet(LS_ENTRADAS, v ? 'sim' : ''); };
  const [erro, setErro] = useState('');
  const [gravando, setGravando] = useState(false);
  const [andamento, setAndamento] = useState('');
  const [soAgora, setSoAgora] = useState({}); // { contraparte: categoriaId | IGNORAR } — as escolhas "só desta vez"

  const carregarBase = useCallback(async () => {
    const [categorias, regras, recorrencias, fixos] = await Promise.all([listarCategorias(), listarRegrasParaClassificar(), listarRecorrencias(), fixosLancados()]);
    setBase({ categorias, regras, recorrencias, fixos });
  }, []);
  useEffect(() => { carregarBase().catch((err) => toast.error(err.message)); }, [carregarBase, toast]);

  const escolher = async (f) => {
    if (!f) return;
    setErro('');
    try {
      const linhas = lerExtrato(await f.text());
      setJa(await idsJaImportados(linhas.map((l) => l.id_externo)));
      const per = periodoDasLinhas(linhas);
      setManuais(per.de ? await entradasManuais(maisDias(per.de, -3), maisDias(per.ate, 3)) : []);
      setArquivo({ nome: f.name, linhas });
      setSoAgora({}); // o "só desta vez" é deste arquivo
    } catch (err) { setArquivo(null); setErro(err.message); }
  };
  // Veio do "Importar arquivos" com o arquivo na mão: abre direto a prévia dele.
  useEffect(() => { if (arquivoInicial) escolher(arquivoInicial); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const planoBase = useMemo(() => {
    if (!arquivo || !base) return null;
    return planejarExtrato(arquivo.linhas, {
      classificar: criarClassificador(base.regras), recorrencias: base.recorrencias, fixosLancados: base.fixos, jaImportados: ja,
      entradas: comEntradas, entradasManuais: manuais, ehEntrada: (id) => base.categorias.find((c) => c.id === id)?.grupo?.tipo === 'entrada',
    });
  }, [arquivo, base, ja, comEntradas, manuais]);
  // O plano com as escolhas "só desta vez": a linha sem regra ganha a categoria (ou fica de fora) só nesta importação.
  const plano = useMemo(() => planoBase && planoBase.map((p) => {
    const e = p.acao === 'avulso' && !p.categoriaId ? soAgora[p.linha.contraparte] : null;
    if (!e) return p;
    return e === IGNORAR ? { ...p, acao: 'ignorar', motivo: 'de fora só desta vez' } : { ...p, categoriaId: e, soAgora: true };
  }), [planoBase, soAgora]);

  const nomeCat = useCallback((id) => base?.categorias.find((c) => c.id === id)?.nome ?? '—', [base]);

  // As contrapartes que ficariam sem categoria, agrupadas.
  const semRegra = useMemo(() => {
    const m = new Map();
    (planoBase ?? []).filter((p) => p.acao === 'avulso' && !p.categoriaId).forEach((p) => {
      const g = m.get(p.linha.contraparte) ?? { contraparte: p.linha.contraparte, n: 0, total: 0 };
      g.n += 1; g.total += -p.linha.valor_centavos;
      m.set(p.linha.contraparte, g);
    });
    return [...m.values()];
  }, [planoBase]);

  const criarRegra = async (palavra, categoria) => {
    try {
      await salvarRegra({ palavra_chave: palavra, categoria_id: categoria, ignorar: categoria === IGNORAR });
      toast.success(categoria === IGNORAR ? `"${palavra}" será ignorado.` : `Regra "${palavra}" criada.`);
      await carregarBase(); // a prévia se refaz com a regra nova
    } catch (err) {
      toast.error(/duplicate|unique/i.test(err.message) ? 'Já existe uma regra com essa palavra-chave.' : err.message);
    }
  };

  const conta = (acao) => (plano ?? []).filter((p) => p.acao === acao);
  const gastos = [...conta('fixo_novo'), ...conta('fixo_corrigir'), ...conta('avulso')];
  const aGravar = [...gastos, ...conta('entrada')];
  const totalGravar = gastos.reduce((s, p) => s + -p.linha.valor_centavos, 0);
  const totalEntradas = conta('entrada').reduce((s, p) => s + p.linha.valor_centavos, 0);
  const nCreditos = (arquivo?.linhas ?? []).filter((l) => l.valor_centavos > 0).length;

  const importar = async () => {
    setGravando(true);
    try {
      const { n, apagar, restaurar } = await gravarExtrato(plano, (i, total) => setAndamento(`${i} de ${total}`));
      const revisar = plano.filter((p) => p.acao === 'avulso' && !p.categoriaId).length;
      const per = periodoDasLinhas(arquivo.linhas);
      const fixos = conta('fixo_novo').length + conta('fixo_corrigir').length;
      await registrarImportacao({
        tipo: 'extrato', arquivo: arquivo.nome, periodo_de: per.de, periodo_ate: per.ate, linhas: n, total_centavos: totalGravar,
        resumo: [`${arquivo.linhas.length} movimentações → ${conta('avulso').length} avulsos`, fixos && `${fixos} fixos`, conta('entrada').length && `${conta('entrada').length} entradas`,
          `${conta('ignorar').length + conta('ja').length} de fora`, revisar && `${revisar} sem regra`].filter(Boolean).join(' · '),
        desfazer: { apagar, restaurar },
      });
      toast.success(`${n} movimentação(ões) importadas.${revisar ? ` ${revisar} ficaram sem categoria: veja em Revisar pendências.` : ''}`);
      onImportado();
    } catch (err) {
      toast.error(/duplicate|unique/i.test(err.message) ? 'Parte deste extrato já tinha sido importada. Escolha o arquivo de novo para ver o que falta.' : err.message);
      setGravando(false); setAndamento('');
    }
  };

  const comPrevia = !!(arquivo && plano);
  return (
    <Modal open onClose={gravando ? () => {} : onFechar} title="Importar extrato da conta" alturaCheia={comPrevia} animarTamanho
      maxWidth={comPrevia ? 'max-w-[min(1100px,95vw)]' : 'max-w-xl'} altura="h-[90vh]" padding={comPrevia ? 'p-0' : 'p-5'}
      subtitulo={comPrevia ? `${arquivo.nome} · ${arquivo.linhas.length} movimentações` : 'o CSV do extrato do Nubank'}>
      {!comPrevia ? (
        <div className="space-y-4 text-sm text-gray-700">
          <p>
            Exporte o extrato da conta no app do Nubank (CSV) e escolha o arquivo. Ficam de fora o pagamento da fatura do cartão,
            os investimentos (RDB, dinheiro guardado) e o que uma regra mandar ignorar. As entradas também, a não ser que você
            ligue “Trazer as entradas” na prévia (a que já foi lançada à mão não entra de novo).
            Pagamento de gasto fixo vira o fixo do mês com o valor real.
          </p>
          {arquivo && !base ? <p className="flex items-center gap-2 text-gray-500"><Spinner className="h-4 w-4" /> Lendo as regras…</p> : (
            <AreaArrastar onArquivos={(fs) => escolher(fs[0])} desabilitada={!base}
              titulo={base ? 'Arraste o extrato aqui ou' : 'Carregando as regras…'} formatos=".csv do extrato da conta do Nubank (Data,Valor,Identificador,Descrição)" />
          )}
          {erro && <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-red-700">{erro}</p>}
        </div>
      ) : (
        <div className="flex min-h-full flex-col">
          <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1 border-b border-gray-100 px-5 py-3 text-sm text-gray-700">
            <span><strong>{gastos.length}</strong> gastos a importar · {formatBRL(totalGravar)}</span>
            {comEntradas && <span className="text-green-700"><strong>{conta('entrada').length}</strong> entradas · {formatBRL(totalEntradas)}</span>}
            <span><strong>{conta('fixo_novo').length + conta('fixo_corrigir').length}</strong> como gasto fixo</span>
            <span><strong>{conta('ignorar').length}</strong> fora</span>
            {conta('ja').length > 0 && <span><strong>{conta('ja').length}</strong> já importadas</span>}
            <span className="flex-1" />
            {nCreditos > 0 && (
              <label className="inline-flex cursor-pointer items-center gap-2 text-[12.5px] text-gray-700" title="Os créditos do extrato (Pix recebido, salário…) entram como entradas. A que você já lançou à mão (mesmo valor, até 3 dias) fica de fora.">
                <Toggle compacto checked={comEntradas} onChange={setComEntradas} rotulo="Trazer as entradas" disabled={gravando} /> Trazer as entradas ({nCreditos})
              </label>
            )}
            <button type="button" onClick={() => setArquivo(null)} disabled={gravando} className="text-[12px] text-gray-500 underline underline-offset-2 hover:text-gray-800">Escolher outro arquivo</button>
          </div>

          <div className="flex-1 space-y-4 px-5 py-4">
            {semRegra.length > 0 && (
              <section className="overflow-hidden rounded-md border border-gray-200">
                <header className="border-b border-gray-200 bg-hx-f9fafb px-4 py-2.5">
                  <h2 className="text-sm font-semibold text-gray-800">Sem regra ({semRegra.length})</h2>
                  <p className="text-xs text-gray-500">
                    Escolha a categoria e crie a regra: vale para os próximos extratos. O que não se repete (o Pix de um amigo, uma compra única): “Só desta vez”, sem regra. Transferência entre contas suas, ou um pagamento que você já lança à mão (a empregada no gasto fixo): “Ignorar sempre”.
                    O que ficar sem regra entra assim mesmo e vai para Revisar pendências.
                  </p>
                </header>
                <ul className="divide-y divide-gray-100">
                  {semRegra.map((g) => <SemRegra key={g.contraparte} grupo={g} categorias={base.categorias} onCriar={criarRegra} onCategoriaCriada={carregarBase}
                    escolhida={soAgora[g.contraparte]} nomeCat={nomeCat}
                    onSoAgora={(cat) => setSoAgora((x) => { const n = { ...x }; if (cat) n[g.contraparte] = cat; else delete n[g.contraparte]; return n; })} />)}
                </ul>
              </section>
            )}

            <div className="overflow-x-auto rounded-md border border-gray-200">
              <table className="w-full">
                <thead className="border-b border-gray-200 bg-gray-50">
                  <tr>
                    <th className="table-th w-[100px]">Data</th>
                    <th className="table-th">Movimentação</th>
                    <th className="table-th text-right">Valor</th>
                    <th className="table-th">Destino</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {plano.map((p) => (
                    <tr key={p.linha.id_externo} className={p.acao === 'ignorar' || p.acao === 'ja' ? 'text-gray-400' : ''}>
                      <td className="table-td">{formatDate(p.linha.data)}</td>
                      <td className="table-td max-w-[420px] truncate" title={p.linha.descricao_original}>{p.linha.nome}</td>
                      <td className="table-td text-right tabular-nums">{formatBRL(p.linha.valor_centavos)}</td>
                      <td className="table-td">
                        {ROTULO[p.acao](p, nomeCat)}
                        {p.acao === 'fixo_corrigir' && <span className="ml-2 text-xs text-gray-500">era {formatBRL(p.existente.valor_centavos)}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* o rodapé preso embaixo enquanto a prévia rola */}
          <div className="sticky bottom-0 flex items-center justify-end gap-3 border-t border-gray-200 bg-hx-f9fafb px-5 py-3">
            {andamento && <span className="text-sm text-gray-500">Gravando… {andamento}</span>}
            <button type="button" className="btn-secondary" onClick={onFechar} disabled={gravando}>Cancelar</button>
            <button type="button" className="btn-primary" onClick={importar} disabled={gravando || aGravar.length === 0}>
              {gravando ? <><Spinner className="h-4 w-4" /> Importando…</> : `Importar ${aGravar.length}`}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
