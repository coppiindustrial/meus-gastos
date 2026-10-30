import { useCallback, useEffect, useMemo, useState } from 'react';
import Modal from '../components/Modal.jsx';
import SeletorCategoria from '../components/SeletorCategoria.jsx';
import Spinner from '../components/Spinner.jsx';
import AreaArrastar from '../components/AreaArrastar.jsx';
import { Etiqueta } from '../components/Comuns.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { listarCategorias } from '../api/cadastros.js';
import { listarRegrasParaClassificar } from '../api/faturas.js';
import { listarRecorrencias } from '../api/fixos.js';
import { salvarRegra } from '../api/regras.js';
import { fixosLancados, gravarExtrato, idsJaImportados } from '../api/extrato.js';
import { registrarImportacao } from '../api/importacoes.js';
import { periodoDasLinhas } from '../lib/importacoes.js';
import { lerExtrato } from '../lib/lerExtrato.js';
import { planejarExtrato } from '../lib/planoExtrato.js';
import { criarClassificador } from '../lib/classificar.js';
import { formatBRL } from '../lib/dinheiro.js';
import { formatDate } from '../lib/format.js';

// IMPORTAR O EXTRATO DA CONTA (Nubank), num POP-UP como o da fatura (29/10/2026: antes era a tela /extrato, que
// abria fora do Importar). Escolher o CSV → a prévia mostra o destino de cada movimentação (lib/planoExtrato.js) →
// o que ainda não tem regra pode ser classificado ali mesmo, criando a regra (ou uma regra de IGNORAR, para as
// transferências entre as suas contas) → importar. Com a prévia, o pop-up cresce para o painel dos ampliados
// (1100px, 90% da altura) e o rodapé com o "Importar" fica preso embaixo.
// Decisões (2026-10-27): entradas continuam à mão; pagamento de fatura e investimentos ficam de fora;
// o pagamento de um gasto fixo vira o fixo do mês com o valor real. Cada importação vai para o histórico, com o
// que desfazê-la. `arquivo`: o File já escolhido no "Importar arquivos" (abre direto na prévia).
const IGNORAR = '__ignorar';
const EXTRAS_IGNORAR = [{ value: IGNORAR, label: 'Ignorar sempre (não é gasto)' }];

const ROTULO = {
  ignorar: (p) => <Etiqueta>Fora: {p.motivo}</Etiqueta>,
  ja: () => <Etiqueta>Já importada</Etiqueta>,
  fixo_novo: (p) => <Etiqueta tom="verde">Fixo: {p.recorrencia.descricao}</Etiqueta>,
  fixo_corrigir: (p) => <Etiqueta tom="verde">Corrige o fixo {p.recorrencia.descricao}</Etiqueta>,
  avulso: (p, nomeCat) => (p.categoriaId ? <Etiqueta>{nomeCat(p.categoriaId)}</Etiqueta> : <Etiqueta tom="ambar">Sem regra</Etiqueta>),
};

// Uma linha por contraparte sem regra: escolher a categoria (ou Ignorar) cria a regra na hora.
function SemRegra({ grupo, categorias, onCriar, onCategoriaCriada }) {
  const [categoria, setCategoria] = useState('');
  const [palavra, setPalavra] = useState(grupo.contraparte);
  const [salvando, setSalvando] = useState(false);
  const criar = async () => {
    setSalvando(true);
    await onCriar(palavra.trim(), categoria);
    setSalvando(false);
  };
  return (
    <li className="flex flex-wrap items-center gap-2 px-4 py-2.5">
      <span className="min-w-[10rem] flex-1">
        <span className="block truncate text-sm text-gray-800">{grupo.contraparte}</span>
        <span className="block text-xs text-gray-500">{grupo.n} movimentação(ões) · {formatBRL(grupo.total)}</span>
      </span>
      <input className="input !w-44 !py-1.5" value={palavra} onChange={(e) => setPalavra(e.target.value)} aria-label="Palavra-chave da regra" />
      <SeletorCategoria className="w-64" value={categoria} onChange={setCategoria} categorias={categorias} tipo="saida"
        extras={EXTRAS_IGNORAR} onCriada={onCategoriaCriada} />
      <button type="button" className="btn-secondary !py-1.5" disabled={!categoria || !palavra.trim() || salvando} onClick={criar}>
        {salvando ? 'Criando…' : 'Criar regra'}
      </button>
    </li>
  );
}

export default function ImportarExtrato({ arquivo: arquivoInicial = null, onFechar, onImportado }) {
  const toast = useToast();
  const [base, setBase] = useState(null); // { categorias, regras, recorrencias, fixos }
  const [arquivo, setArquivo] = useState(null); // { nome, linhas }
  const [ja, setJa] = useState(new Set());
  const [erro, setErro] = useState('');
  const [gravando, setGravando] = useState(false);
  const [andamento, setAndamento] = useState('');

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
      setArquivo({ nome: f.name, linhas });
    } catch (err) { setArquivo(null); setErro(err.message); }
  };
  // Veio do "Importar arquivos" com o arquivo na mão: abre direto a prévia dele.
  useEffect(() => { if (arquivoInicial) escolher(arquivoInicial); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const plano = useMemo(() => {
    if (!arquivo || !base) return null;
    return planejarExtrato(arquivo.linhas, {
      classificar: criarClassificador(base.regras), recorrencias: base.recorrencias, fixosLancados: base.fixos, jaImportados: ja,
    });
  }, [arquivo, base, ja]);

  const nomeCat = useCallback((id) => base?.categorias.find((c) => c.id === id)?.nome ?? '—', [base]);

  // As contrapartes que ficariam sem categoria, agrupadas.
  const semRegra = useMemo(() => {
    const m = new Map();
    (plano ?? []).filter((p) => p.acao === 'avulso' && !p.categoriaId).forEach((p) => {
      const g = m.get(p.linha.contraparte) ?? { contraparte: p.linha.contraparte, n: 0, total: 0 };
      g.n += 1; g.total += -p.linha.valor_centavos;
      m.set(p.linha.contraparte, g);
    });
    return [...m.values()];
  }, [plano]);

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
  const aGravar = [...conta('fixo_novo'), ...conta('fixo_corrigir'), ...conta('avulso')];
  const totalGravar = aGravar.reduce((s, p) => s + -p.linha.valor_centavos, 0);

  const importar = async () => {
    setGravando(true);
    try {
      const { n, apagar, restaurar } = await gravarExtrato(plano, (i, total) => setAndamento(`${i} de ${total}`));
      const revisar = plano.filter((p) => p.acao === 'avulso' && !p.categoriaId).length;
      const per = periodoDasLinhas(arquivo.linhas);
      const fixos = conta('fixo_novo').length + conta('fixo_corrigir').length;
      await registrarImportacao({
        tipo: 'extrato', arquivo: arquivo.nome, periodo_de: per.de, periodo_ate: per.ate, linhas: n, total_centavos: totalGravar,
        resumo: [`${arquivo.linhas.length} movimentações → ${conta('avulso').length} avulsos`, fixos && `${fixos} fixos`,
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
            Exporte o extrato da conta no app do Nubank (CSV) e escolha o arquivo. Ficam de fora as entradas (você as lança à
            mão), o pagamento da fatura do cartão, os investimentos (RDB, dinheiro guardado) e o que uma regra mandar ignorar.
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
            <span><strong>{aGravar.length}</strong> a importar · {formatBRL(totalGravar)}</span>
            <span><strong>{conta('fixo_novo').length + conta('fixo_corrigir').length}</strong> como gasto fixo</span>
            <span><strong>{conta('ignorar').length}</strong> fora</span>
            {conta('ja').length > 0 && <span><strong>{conta('ja').length}</strong> já importadas</span>}
            <span className="flex-1" />
            <button type="button" onClick={() => setArquivo(null)} disabled={gravando} className="text-[12px] text-gray-500 underline underline-offset-2 hover:text-gray-800">Escolher outro arquivo</button>
          </div>

          <div className="flex-1 space-y-4 px-5 py-4">
            {semRegra.length > 0 && (
              <section className="overflow-hidden rounded-md border border-gray-200">
                <header className="border-b border-gray-200 bg-hx-f9fafb px-4 py-2.5">
                  <h2 className="text-sm font-semibold text-gray-800">Sem regra ({semRegra.length})</h2>
                  <p className="text-xs text-gray-500">
                    Escolha a categoria e crie a regra: vale para os próximos extratos. Transferência entre contas suas: “Ignorar sempre”.
                    O que ficar sem regra entra assim mesmo e vai para Revisar pendências.
                  </p>
                </header>
                <ul className="divide-y divide-gray-100">
                  {semRegra.map((g) => <SemRegra key={g.contraparte} grupo={g} categorias={base.categorias} onCriar={criarRegra} onCategoriaCriada={carregarBase} />)}
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
