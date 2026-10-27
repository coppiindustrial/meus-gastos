import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import CabecalhoPagina from '../components/CabecalhoPagina.jsx';
import Modal from '../components/Modal.jsx';
import SelectBusca, { opcoesCategoria as opcoesDeCategorias } from '../components/SelectBusca.jsx';
import Checkbox from '../components/Checkbox.jsx';
import ListaVazia from '../components/ListaVazia.jsx';
import { PageLoading } from '../components/Spinner.jsx';
import { Campo } from '../components/Comuns.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { listarCategorias } from '../api/cadastros.js';
import { classificarLancamentos, criarRegraEAplicar, listarPendencias } from '../api/regras.js';
import { regraPega } from '../lib/classificar.js';
import { formatBRL } from '../lib/dinheiro.js';
import { formatDate } from '../lib/format.js';

// REVISAR PENDÊNCIAS: os lançamentos importados (fatura ou extrato) que nenhuma regra classificou ("⚠️ Revisar" da
// planilha), agrupados pelo estabelecimento. Classificar um grupo pode criar a regra junto — e a
// regra nova já resolve as outras pendências que ela pegar (e as próximas faturas).

const nomeDe = (p) => p.estabelecimento || p.descricao;

function ModalClassificar({ grupo, pendencias, categorias, onFechar, onFeito }) {
  const toast = useToast();
  const [categoriaId, setCategoriaId] = useState('');
  const [criarRegra, setCriarRegra] = useState(true);
  const [palavra, setPalavra] = useState(grupo.nome);
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);
  const opcoes = opcoesDeCategorias(categorias, { tipo: 'saida' });
  // Quantas pendências a palavra pega (pode ser mais que o grupo: "UBER" pega todos os Uber).
  const pega = useMemo(() => (palavra.trim() ? pendencias.filter((p) => regraPega(palavra.trim(), nomeDe(p))).length : 0), [palavra, pendencias]);
  const pegaOGrupo = palavra.trim() && regraPega(palavra.trim(), grupo.nome);

  const salvar = async (e) => {
    e.preventDefault();
    if (!categoriaId) { setErro('Escolha a categoria.'); return; }
    if (criarRegra && !pegaOGrupo) { setErro('A palavra-chave precisa aparecer no nome do estabelecimento.'); return; }
    setSalvando(true);
    try {
      if (criarRegra) {
        const n = await criarRegraEAplicar(palavra.trim(), categoriaId, pendencias);
        toast.success(`Regra criada: ${n} lançamento(s) classificados.`);
      } else {
        await classificarLancamentos(grupo.itens.map((p) => p.id), categoriaId);
        toast.success(`${grupo.itens.length} lançamento(s) classificados.`);
      }
      onFeito();
    } catch (err) {
      setErro(/duplicate|unique/i.test(err.message) ? 'Já existe uma regra com essa palavra-chave.' : err.message);
      setSalvando(false);
    }
  };

  return (
    <Modal open onClose={onFechar} title="Classificar" maxWidth="max-w-md">
      <form onSubmit={salvar} className="space-y-4 text-sm">
        <p className="text-gray-700"><strong>{grupo.nome}</strong> · {grupo.itens.length} lançamento(s) · {formatBRL(grupo.total)}</p>
        <Campo rotulo="Categoria">
          <SelectBusca value={categoriaId} onChange={(v) => { setCategoriaId(v); setErro(''); }} opcoes={opcoes} buscaPlaceholder="Buscar categoria ou grupo" />
        </Campo>
        <span className="flex items-center gap-2">
          <Checkbox checked={criarRegra} onChange={(e) => setCriarRegra(e.target.checked)} title="Criar regra" />
          <button type="button" className="text-gray-700" onClick={() => setCriarRegra((v) => !v)}>Criar regra para as próximas faturas</button>
        </span>
        {criarRegra && (
          <Campo rotulo="Palavra-chave">
            <input className="input" value={palavra} onChange={(e) => { setPalavra(e.target.value); setErro(''); }} />
            <p className="mt-1 text-xs text-gray-500">
              Basta aparecer em qualquer parte do nome (sem diferenciar maiúsculas). <code>*</code> vale qualquer coisa.
              {palavra.trim() && <> Pega <strong>{pega}</strong> pendência(s) agora.</>}
            </p>
          </Campo>
        )}
        {erro && <p className="font-medium text-hx-dc2626">{erro}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={onFechar}>Cancelar</button>
          <button type="submit" className="btn-primary" disabled={salvando}>{salvando ? 'Salvando…' : 'Classificar'}</button>
        </div>
      </form>
    </Modal>
  );
}

export default function Pendencias() {
  const toast = useToast();
  const [pendencias, setPendencias] = useState(null);
  const [categorias, setCategorias] = useState([]);
  const [grupoAberto, setGrupoAberto] = useState(null);

  const carregar = useCallback(async () => {
    try {
      const [p, c] = await Promise.all([listarPendencias(), listarCategorias()]);
      setPendencias(p);
      setCategorias(c);
    } catch (err) { toast.error(err.message); setPendencias([]); }
  }, [toast]);
  useEffect(() => { carregar(); }, [carregar]);

  // Um grupo por estabelecimento (sem diferenciar maiúsculas), os com mais lançamentos primeiro.
  const grupos = useMemo(() => {
    const m = new Map();
    (pendencias ?? []).forEach((p) => {
      const k = nomeDe(p).trim().toLowerCase();
      if (!m.has(k)) m.set(k, { chave: k, nome: nomeDe(p).trim(), itens: [], total: 0 });
      const g = m.get(k);
      g.itens.push(p);
      g.total += p.valor_centavos;
    });
    return [...m.values()].sort((a, b) => b.itens.length - a.itens.length || a.nome.localeCompare(b.nome, 'pt-BR'));
  }, [pendencias]);

  return (
    <div>
      <CabecalhoPagina titulo="Revisar pendências"
        acessorio={pendencias?.length > 0 && <span className="text-sm text-gray-500">{pendencias.length} lançamento(s)</span>} />
      <div className="mt-6 max-w-4xl">
        {!pendencias ? <PageLoading /> : grupos.length === 0 ? (
          <ListaVazia>Nada para revisar: todos os lançamentos importados têm categoria.</ListaVazia>
        ) : (
          <div className="card divide-y divide-gray-100">
            {grupos.map((g) => (
              <div key={g.chave} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-gray-800">{g.nome}</div>
                  <div className="truncate text-xs text-gray-500">
                    {g.itens.length} lançamento(s) · {g.itens.slice(0, 3).map((p) => `${formatDate(p.data).slice(0, 5)} ${p.cartao?.nome ?? ''}`).join(', ')}
                    {g.itens.length > 3 && '…'}
                  </div>
                </div>
                <span className="text-sm tabular-nums text-gray-800">{formatBRL(g.total)}</span>
                <button type="button" className="btn-secondary !py-1.5" onClick={() => setGrupoAberto(g)}>Classificar</button>
              </div>
            ))}
          </div>
        )}
        <p className="mt-3 text-xs text-gray-500">
          As regras ficam em <Link to="/cadastros/regras" className="underline">Cadastros → Regras de classificação</Link>.
        </p>
      </div>
      {grupoAberto && (
        <ModalClassificar grupo={grupoAberto} pendencias={pendencias} categorias={categorias}
          onFechar={() => setGrupoAberto(null)} onFeito={() => { setGrupoAberto(null); carregar(); }} />
      )}
    </div>
  );
}
