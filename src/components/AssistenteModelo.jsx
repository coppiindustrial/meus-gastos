import { useEffect, useMemo, useState } from 'react';
import Modal from './Modal.jsx';
import AreaArrastar from './AreaArrastar.jsx';
import SelectSimples from './SelectSimples.jsx';
import Checkbox from './Checkbox.jsx';
import Spinner from './Spinner.jsx';
import { Bolinha } from './Comuns.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { salvarModelo } from '../api/modelos.js';
import { classificarLinhas, listarRegrasParaClassificar } from '../api/faturas.js';
import { listarCategorias } from '../api/cadastros.js';
import {
  FORMATOS_DATA, PAPEIS, assinatura, comPapel, decodificar, detectarFormato, dividir, lerComModelo, lerDataNoFormato, linhasDoTexto,
  papelDaColuna, problemaDoModelo, sugerirColunas,
} from '../lib/modeloCsv.js';
import { vencimentoDoArquivo } from '../lib/lerFatura.js';
import { formatBRL, parseValor } from '../lib/dinheiro.js';
import { formatDate } from '../lib/format.js';

// O ASSISTENTE DO MODELO DE IMPORTAÇÃO (03/11/2026, fase 7.2 do importador configurável — o mockup "Importador
// configurável de CSV", aprovado): ensinar o CSV de um banco novo, uma vez, em três passos —
//   1 · O ARQUIVO: um CSV de exemplo; o app acha o separador, a codificação, a linha do cabeçalho e o rodapé (dá para
//       trocar) e mostra o arquivo como ele é;
//   2 · AS COLUNAS: o seletor em cima de cada coluna (já sugerido pelo nome e pelo conteúdo), o formato da data, o
//       sinal do gasto e onde vem a parcela; o rodapé diz o que ainda impede de ler;
//   3 · CONFERIR E SALVAR: como cada compra vai entrar (com a categoria das regras), o vencimento de cada arquivo,
//       o "reconhecer sozinho pelo cabeçalho" e o nome. Salva em `modelos_importacao` (migration 011).
// As contas são de `lib/modeloCsv.js` (testada). `cartao`: { nome, dia_vencimento } (o nome do modelo e o vencimento
// do exemplo). `onSalvo(modelo)`: a linha gravada.

const SEPARADORES = [{ value: ';', label: '; (ponto e vírgula)' }, { value: ',', label: ', (vírgula)' }, { value: '\t', label: 'Tabulação' }];
const CODIFICACOES = [{ value: 'auto', label: 'Automática' }, { value: 'utf-8', label: 'UTF-8' }, { value: 'windows-1252', label: 'Windows-1252 (Excel)' }];
const ATE = (n, de = 0) => Array.from({ length: n }, (_, i) => ({ value: String(i + de), label: String(i + de) }));
const GASTOS = [{ value: 'positivo', label: 'O gasto vem positivo' }, { value: 'negativo', label: 'O gasto vem negativo' }];
const PARCELAS = [{ value: 'nenhuma', label: 'Não tem parcela' }, { value: 'texto', label: 'No texto: "(Parcela 3 de 10)"' }, { value: 'coluna', label: 'Numa coluna: "3/10"' }];
const VENCIMENTOS = [
  { value: 'nome', rotulo: 'Pelo nome do arquivo', sub: 'uma data no nome, como Banco_2026-10-15.csv' },
  { value: 'dia', rotulo: 'O dia do vencimento do cartão depois da última compra', sub: null },
  { value: 'perguntar', rotulo: 'Perguntar ao importar', sub: null },
];
const TH = 'text-[10.5px] font-semibold uppercase tracking-[0.05em] text-gray-500';
const plural = (n, um, varios) => `${n.toLocaleString('pt-BR')} ${n === 1 ? um : varios}`;

function Passos({ passo }) {
  const nomes = ['O arquivo', 'As colunas', 'Conferir e salvar'];
  return (
    <ol className="flex items-center gap-1.5 text-[12.5px]">
      {nomes.map((n, i) => {
        const k = i + 1;
        const feito = k < passo;
        return (
          <li key={n} className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 ${k === passo ? 'bg-gray-100 font-semibold text-gray-900' : 'text-gray-500'}`}>
            <span className={`grid h-[18px] w-[18px] place-items-center rounded-full text-[11px] ${k === passo ? 'text-white' : feito ? 'bg-green-50 text-green-700' : 'border border-gray-300'}`}
              style={k === passo ? { background: 'var(--serie-gastos)' } : undefined}>{feito ? '✓' : k}</span>
            {n}
          </li>
        );
      })}
    </ol>
  );
}

const Rotulo = ({ children, sub }) => (
  <div className="mb-1.5 flex items-baseline gap-2"><span className={TH}>{children}</span>{sub && <span className="text-[11.5px] text-gray-400">{sub}</span>}</div>
);

export default function AssistenteModelo({ cartao, onFechar, onSalvo }) {
  const toast = useToast();
  const [passo, setPasso] = useState(1);
  const [arquivo, setArquivo] = useState(null); // { nome, bytes }
  const [codificacao, setCodificacao] = useState('auto');
  const [formato, setFormato] = useState(null); // { separador, linhaCabecalho, ignorarNoFim }
  const [config, setConfig] = useState(null);
  const [sugeridoPara, setSugeridoPara] = useState('');
  const [nome, setNome] = useState(`${cartao?.nome?.trim() || 'Banco'} · fatura`);
  const [reconhecer, setReconhecer] = useState(true);
  const [apoio, setApoio] = useState(null); // { regras, categorias } do passo 3
  const [salvando, setSalvando] = useState(false);

  const texto = useMemo(() => (arquivo ? decodificar(arquivo.bytes, codificacao) : ''), [arquivo, codificacao]);
  const todas = useMemo(() => linhasDoTexto(texto), [texto]);

  const escolher = async (f) => {
    if (!f) return;
    const bytes = new Uint8Array(await f.arrayBuffer());
    const t = decodificar(bytes, 'auto');
    if (!linhasDoTexto(t).length) { toast.error('O arquivo está vazio.'); return; }
    const d = detectarFormato(t);
    setArquivo({ nome: f.name, bytes, tamanho: f.size });
    setCodificacao('auto');
    setFormato({ separador: d.separador, linhaCabecalho: d.linhaCabecalho, ignorarNoFim: d.ignorarNoFim });
    setConfig(null);
  };

  // Do passo 1 para o 2: as colunas sugeridas (de novo só se o arquivo ou o passo 1 mudou).
  const chave = JSON.stringify([arquivo?.nome, arquivo?.tamanho, codificacao, formato]);
  const irPara2 = () => {
    if (chave !== sugeridoPara || !config) { setConfig(sugerirColunas(texto, formato)); setSugeridoPara(chave); }
    setPasso(2);
  };
  // O modelo em vigor: as colunas e opções (passo 2) sobre o separador, o cabeçalho e o rodapé (passo 1).
  const cfg = useMemo(() => (config ? { ...config, ...formato } : null), [config, formato]);
  const problema = useMemo(() => (cfg ? problemaDoModelo(texto, cfg) : null), [texto, cfg]);
  const lido = useMemo(() => (cfg && !problema ? lerComModelo(texto, cfg) : null), [texto, cfg, problema]);

  // O passo 3 classifica com as regras (como a importação da fatura) e mostra o nome da categoria.
  useEffect(() => {
    if (passo !== 3 || apoio) return;
    Promise.all([listarRegrasParaClassificar(), listarCategorias()])
      .then(([regras, categorias]) => setApoio({ regras, categorias }))
      .catch((err) => { toast.error(err.message); setApoio({ regras: [], categorias: [] }); });
  }, [passo, apoio, toast]);
  const conferido = useMemo(() => {
    if (!lido || !apoio) return null;
    const ls = classificarLinhas(lido.linhas, apoio.regras);
    const entram = ls.filter((l) => !l.ignorar);
    return { entram, total: entram.reduce((s, l) => s + l.valor_centavos, 0), porRegra: ls.length - entram.length, semRegra: entram.filter((l) => !l.categoria_id).length };
  }, [lido, apoio]);
  const catPorId = useMemo(() => new Map((apoio?.categorias ?? []).map((c) => [c.id, c])), [apoio]);
  const venc = lido && cfg ? vencimentoDoArquivo(cfg, arquivo?.nome, lido.linhas, cartao?.dia_vencimento) : null;
  const cabecalho = formato ? todas[formato.linhaCabecalho - 1] ?? '' : '';

  const salvar = async () => {
    if (!nome.trim()) { toast.error('Dê um nome ao modelo.'); return; }
    setSalvando(true);
    try {
      const modelo = await salvarModelo({ nome, tipo: 'fatura', cabecalho: reconhecer ? assinatura(cabecalho) : null, config: cfg });
      toast.success(`Modelo "${modelo.nome}" salvo.`);
      onSalvo?.(modelo);
    } catch (err) {
      toast.error(/modelos_importacao/.test(err.message) ? 'Falta aplicar a migration 011 no Supabase (SQL Editor) para guardar modelos.'
        : /duplicate|unique/i.test(err.message) ? 'Já existe um modelo com esse nome.' : err.message);
      setSalvando(false);
    }
  };

  // ------------------------------------------------------------ os passos

  const passo1 = (
    <div className="flex min-h-0 flex-1 gap-5">
      <div className="flex w-[300px] shrink-0 flex-col gap-3.5">
        <AreaArrastar onArquivos={(fs) => escolher(fs[0])} compacta={!!arquivo}
          titulo={arquivo ? 'Trocar o arquivo: arraste outro ou' : 'Arraste um CSV de exemplo ou'} formatos=".csv como o banco exporta" />
        {arquivo && formato && (
          <>
            <div className="rounded-md border border-gray-200 bg-hx-f9fafb px-3 py-2 text-[12.5px]">
              <div className="truncate font-mono font-semibold text-gray-800" title={arquivo.nome}>{arquivo.nome}</div>
              <div className="text-gray-500">{plural(todas.length, 'linha', 'linhas')} · {plural(dividir(cabecalho, formato.separador).length, 'coluna', 'colunas')}</div>
            </div>
            <div className={TH}>O que o app percebeu</div>
            <label className="block text-[12.5px] text-gray-600">Separador das colunas
              <SelectSimples compacto className="mt-1" value={formato.separador} onChange={(v) => setFormato({ ...formato, separador: v })} opcoes={SEPARADORES} />
            </label>
            <label className="block text-[12.5px] text-gray-600">Codificação do texto
              <SelectSimples compacto className="mt-1" value={codificacao} onChange={setCodificacao} opcoes={CODIFICACOES} />
            </label>
            <div className="grid grid-cols-2 gap-2.5">
              <label className="block text-[12.5px] text-gray-600">Cabeçalho na linha
                <SelectSimples compacto className="mt-1" value={String(formato.linhaCabecalho)} onChange={(v) => setFormato({ ...formato, linhaCabecalho: Number(v) })} opcoes={ATE(Math.min(15, todas.length), 1)} />
              </label>
              <label className="block text-[12.5px] text-gray-600">Ignorar no fim
                <SelectSimples compacto className="mt-1" value={String(formato.ignorarNoFim)} onChange={(v) => setFormato({ ...formato, ignorarNoFim: Number(v) })} opcoes={ATE(6)} />
              </label>
            </div>
            <p className="text-[11.5px] leading-relaxed text-gray-500">Errou? Troque aqui e o arquivo ao lado se refaz.</p>
          </>
        )}
      </div>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <Rotulo sub="as primeiras linhas, sem mexer em nada">O arquivo como ele é</Rotulo>
        {!arquivo ? (
          <div className="flex flex-1 items-center justify-center rounded-md border border-dashed border-gray-300 text-[12.5px] text-gray-400">
            Escolha um CSV de fatura como o banco exporta (o de qualquer mês serve).
          </div>
        ) : (
          <div className="min-h-0 flex-1 overflow-auto rounded-md border border-gray-200 font-mono text-[12px]">
            {[...todas.slice(0, 12).map((l, i) => ({ l, n: i + 1 })), ...(formato.ignorarNoFim ? [{ sep: true }, ...todas.slice(-formato.ignorarNoFim).map((l, i) => ({ l, n: todas.length - formato.ignorarNoFim + i + 1 }))] : [])]
              .map((x, k) => (x.sep ? <div key="sep" className="px-3 py-1 text-gray-400">…</div> : (
                <div key={k} className={`grid grid-cols-[38px_minmax(0,1fr)] border-b border-gray-100 ${x.n === formato.linhaCabecalho ? 'bg-hx-eef2f7' : ''}`}>
                  <span className="border-r border-gray-100 px-2 py-1.5 text-right text-gray-400">{x.n}</span>
                  <span className={`truncate px-2.5 py-1.5 ${x.n === formato.linhaCabecalho ? 'font-semibold text-gray-900' : x.n > todas.length - formato.ignorarNoFim || x.n < formato.linhaCabecalho ? 'text-gray-400 line-through' : 'text-gray-700'}`}>{x.l}</span>
                </div>
              )))}
          </div>
        )}
        {arquivo && <p className="mt-2 text-[12px] text-gray-500">A linha {formato.linhaCabecalho} é o cabeçalho (destacada).{formato.ignorarNoFim ? ` As ${formato.ignorarNoFim} últimas ficam de fora.` : ''}{formato.linhaCabecalho > 1 ? ' As de antes dele também.' : ''}</p>}
      </div>
    </div>
  );

  const passo2 = cfg && (() => {
    const nomes = dividir(cabecalho, cfg.separador);
    const dados = todas.slice(cfg.linhaCabecalho, todas.length - cfg.ignorarNoFim).slice(0, 14).map((l) => dividir(l, cfg.separador));
    const sinal = cfg.gasto === 'negativo' ? -1 : 1;
    const deFora = (cs) => { const v = parseValor(cs[cfg.colunas.valor] ?? ''); return cfg.colunas.valor != null && v !== null && v * sinal <= 0; };
    const datasOk = cfg.colunas.data == null ? 0 : dados.filter((cs) => lerDataNoFormato(cs[cfg.colunas.data], cfg.data)).length;
    return (
      <div className="flex min-h-0 flex-1 gap-5">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <Rotulo sub="o app já sugeriu pelo nome e pelo conteúdo">Diga o que é cada coluna</Rotulo>
          <div className="min-h-0 flex-1 overflow-auto rounded-md border border-gray-200 text-[12.5px]">
            <table className="w-full border-separate border-spacing-0">
              <thead className="sticky top-0 z-10 bg-hx-f9fafb">
                <tr>
                  {nomes.map((n, j) => {
                    const papel = papelDaColuna(cfg.colunas, j);
                    return (
                      <th key={j} className="min-w-[130px] border-b border-r border-gray-200 px-2 py-2 text-left align-top font-normal last:border-r-0">
                        <div className="mb-1.5 truncate text-[11px] text-gray-500" title={n}>{n || `coluna ${j + 1}`}</div>
                        <SelectSimples compacto value={papel} onChange={(v) => setConfig(comPapel(cfg, j, v))} opcoes={PAPEIS} />
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {dados.map((cs, i) => (
                  <tr key={i} className={deFora(cs) ? 'bg-hx-fdf2f2' : 'hover:bg-hx-f9fafb'}>
                    {nomes.map((_, j) => {
                      const papel = papelDaColuna(cfg.colunas, j);
                      return (
                        <td key={j} className={`max-w-[260px] truncate border-b border-r border-gray-100 px-2 py-1.5 last:border-r-0 ${
                          !papel ? 'text-gray-400' : deFora(cs) ? 'text-hx-c0393d' : 'text-gray-800'} ${papel === 'estabelecimento' ? 'font-mono text-[12px]' : ''} ${papel === 'valor' ? 'text-right tabular-nums' : ''}`}
                          title={cs[j]}>{cs[j]}</td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11.5px] text-gray-500">
            <span>colunas em cinza: ignoradas (não entram)</span>
            <span className="text-hx-c0393d">linhas em vermelho: ficam de fora (o outro sinal — pagamento, estorno)</span>
          </div>
        </div>
        <aside className="flex w-[290px] shrink-0 flex-col gap-4">
          <div>
            <Rotulo>A data</Rotulo>
            <SelectSimples compacto value={cfg.data} onChange={(v) => setConfig({ ...config, data: v })} opcoes={FORMATOS_DATA.map((f) => ({ value: f, label: f }))} />
            {cfg.colunas.data != null && <p className={`mt-1 text-[11.5px] ${datasOk === dados.length ? 'text-green-700' : 'text-hx-c0393d'}`}>{datasOk === dados.length ? `✓ as ${dados.length} datas da amostra leram` : `${dados.length - datasOk} de ${dados.length} datas não leram nesse formato`}</p>}
          </div>
          <div>
            <Rotulo>O valor</Rotulo>
            <SelectSimples compacto value={cfg.gasto} onChange={(v) => setConfig({ ...config, gasto: v })} opcoes={GASTOS} />
            <p className="mt-1 text-[11.5px] text-gray-500">O do outro sinal (pagamento da fatura, estorno) fica de fora.</p>
          </div>
          <div>
            <Rotulo>A parcela</Rotulo>
            <SelectSimples compacto value={cfg.parcela} onChange={(v) => setConfig({ ...config, parcela: v })} opcoes={PARCELAS} />
            {cfg.parcela === 'coluna' && cfg.colunas.parcela == null && <p className="mt-1 text-[11.5px] text-hx-c0393d">Dê o papel "Parcela" a uma coluna.</p>}
            {cfg.parcela === 'texto' && <p className="mt-1 text-[11.5px] text-gray-500">O texto da parcela sai do nome do estabelecimento.</p>}
          </div>
          <p className="text-[11.5px] leading-relaxed text-gray-500">O portador (o cartão adicional) só quando o banco manda uma coluna para ele.</p>
        </aside>
      </div>
    );
  })();

  const passo3 = cfg && (
    <div className="flex min-h-0 flex-1 gap-5">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2.5">
        {!conferido ? <div className="flex flex-1 items-center justify-center"><Spinner className="h-5 w-5" /></div> : (
          <>
            <div className="flex flex-wrap gap-2 text-[12px]">
              <span className="rounded-full bg-hx-eef2f7 px-2.5 py-1 font-semibold text-gray-800">{plural(conferido.entram.length, 'compra', 'compras')} · {formatBRL(conferido.total)}</span>
              {lido.ignoradas.length > 0 && <span className="rounded-full bg-hx-fdf2f2 px-2.5 py-1 text-hx-c0393d">{plural(lido.ignoradas.length, 'fica de fora', 'ficam de fora')} · o outro sinal</span>}
              {conferido.porRegra > 0 && <span className="rounded-full bg-gray-100 px-2.5 py-1 text-gray-600">{plural(conferido.porRegra, 'ignorada', 'ignoradas')} por regra</span>}
              {conferido.semRegra > 0 && <span className="rounded-full bg-hx-fef3c7 px-2.5 py-1 text-hx-92400e">{conferido.semRegra} sem regra · vão para Revisar</span>}
            </div>
            <Rotulo>Como vai entrar no app</Rotulo>
            <div className="min-h-0 flex-1 overflow-auto rounded-md border border-gray-200 text-[12.5px]">
              <table className="w-full border-separate border-spacing-0">
                <thead className="sticky top-0 z-10 bg-hx-f9fafb">
                  <tr>{['Data', 'Estabelecimento', 'Parcela', 'Categoria', 'Valor'].map((h, i) => <th key={h} className={`${TH} border-b border-gray-200 px-2 py-2 ${i === 4 ? 'text-right' : 'text-left'}`}>{h}</th>)}</tr>
                </thead>
                <tbody>
                  {conferido.entram.slice(0, 300).map((l, i) => {
                    const c = catPorId.get(l.categoria_id);
                    return (
                      <tr key={i} className="hover:bg-hx-f9fafb">
                        <td className="border-b border-gray-100 px-2 py-1.5 tabular-nums text-gray-600">{formatDate(l.data).slice(0, 5)}</td>
                        <td className="max-w-[320px] truncate border-b border-gray-100 px-2 py-1.5 font-mono text-[12px] text-gray-800" title={l.estabelecimento}>{l.estabelecimento}</td>
                        <td className="border-b border-gray-100 px-2 py-1.5 tabular-nums text-gray-500">{l.parcela_total ? `${l.parcela_atual}/${l.parcela_total}` : '—'}</td>
                        <td className="border-b border-gray-100 px-2 py-1.5">
                          {c ? <span className="flex items-center gap-1.5 text-gray-700"><Bolinha cor={c.grupo?.cor} />{c.nome}</span> : <span className="text-hx-92400e">a revisar</span>}
                        </td>
                        <td className="border-b border-gray-100 px-2 py-1.5 text-right tabular-nums text-gray-900">{formatBRL(l.valor_centavos)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
      <aside className="flex w-[310px] shrink-0 flex-col gap-4">
        <div>
          <Rotulo>O vencimento de cada arquivo</Rotulo>
          <div className="space-y-2">
            {VENCIMENTOS.map((v) => (
              <label key={v.value} className="flex cursor-pointer items-start gap-2 text-[12.5px] text-gray-800">
                <input type="radio" name="vencimento" className="mt-0.5" checked={cfg.vencimento === v.value} onChange={() => setConfig({ ...config, vencimento: v.value })} />
                <span>{v.value === 'dia' ? `O dia ${cartao?.dia_vencimento ?? '—'} depois da última compra` : v.rotulo}
                  {v.sub && <span className="block text-[11.5px] text-gray-500">{v.sub}</span>}
                  {cfg.vencimento === v.value && venc && (
                    <span className={`block text-[11.5px] ${venc.vencimento ? 'text-green-700' : 'text-gray-500'}`}>
                      {venc.vencimento ? `este arquivo: vence ${formatDate(venc.vencimento)}${v.value === 'nome' && venc.como === 'dia' ? ' (o nome não tem data: pelo dia)' : ''}` : 'a importação vai perguntar'}
                    </span>
                  )}
                </span>
              </label>
            ))}
          </div>
        </div>
        <div>
          <Rotulo>Reconhecer sozinho</Rotulo>
          <label className="flex cursor-pointer items-start gap-2 text-[12.5px] text-gray-800">
            <Checkbox size="sm" checked={reconhecer} onChange={() => setReconhecer(!reconhecer)} title="Reconhecer pelo cabeçalho" />
            <span>Pelo cabeçalho, no "Importar arquivos"</span>
          </label>
          <code className="mt-1.5 block truncate rounded bg-hx-f6f7f8 px-2 py-1.5 text-[11px] text-gray-600" title={cabecalho}>{cabecalho}</code>
        </div>
        <label className="block">
          <Rotulo>O nome do modelo</Rotulo>
          <input className="input !h-9 text-[13px]" value={nome} onChange={(e) => setNome(e.target.value)} />
        </label>
        <p className="text-[11.5px] leading-relaxed text-gray-500">As categorias saem das suas regras de classificação, como nas outras faturas. O mesmo modelo serve a outros cartões do mesmo banco.</p>
      </aside>
    </div>
  );

  const rodape = (
    <div className="flex items-center gap-2.5 border-t border-gray-200 bg-hx-f9fafb px-5 py-3">
      {passo > 1 && <button type="button" className="btn-secondary" onClick={() => setPasso(passo - 1)}>← Voltar</button>}
      <span className="min-w-0 flex-1 truncate text-[12.5px]">
        {passo === 1 && <span className="text-gray-500">Nada é gravado até o passo 3.</span>}
        {passo === 2 && (problema ? <span className="text-hx-c0393d">{problema}</span> : lido && <span className="text-green-700">✓ {plural(lido.linhas.length, 'gasto lido', 'gastos lidos')} sem erro{lido.ignoradas.length ? ` · ${lido.ignoradas.length} de fora` : ''}</span>)}
      </span>
      {passo === 1 && <button type="button" className="btn-primary" onClick={irPara2} disabled={!arquivo}>Próximo: as colunas →</button>}
      {passo === 2 && <button type="button" className="btn-primary" onClick={() => setPasso(3)} disabled={!!problema}>Próximo: conferir →</button>}
      {passo === 3 && <button type="button" className="btn-primary" onClick={salvar} disabled={salvando || !conferido}>{salvando ? 'Salvando…' : 'Salvar o modelo'}</button>}
    </div>
  );

  return (
    <Modal open onClose={salvando ? () => {} : onFechar} title="Ensinar um formato de CSV" alturaCheia padding="p-0"
      subtitulo={`${cartao?.nome ? `para o cartão ${cartao.nome} · ` : ''}uma vez só: os próximos arquivos entram sozinhos`}
      acoes={<Passos passo={passo} />} maxWidth="max-w-[min(1120px,95vw)]" altura="h-[86vh]">
      <div className="flex h-full min-h-0 flex-col">
        <div className="flex min-h-0 flex-1 flex-col px-5 py-4">
          {passo === 1 && passo1}
          {passo === 2 && passo2}
          {passo === 3 && passo3}
        </div>
        {rodape}
      </div>
    </Modal>
  );
}
