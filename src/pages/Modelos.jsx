import { useCallback, useEffect, useState } from 'react';
import CabecalhoPagina from '../components/CabecalhoPagina.jsx';
import { PageLoading } from '../components/Spinner.jsx';
import { Etiqueta } from '../components/Comuns.jsx';
import Tooltip from '../components/Tooltip.jsx';
import AssistenteModelo from '../components/AssistenteModelo.jsx';
import { IconMais } from '../components/icons.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { useConfirmacao } from '../context/ConfirmContext.jsx';
import { excluirModelo, listarModelos, renomearModelo } from '../api/modelos.js';
import { listarCartoes } from '../api/cadastros.js';
import { MODELOS_PRONTOS } from '../lib/modeloCsv.js';

// MODELOS DE IMPORTAÇÃO (03/11/2026, fase 7.3 do importador configurável): os formatos de CSV que o app sabe ler — os
// PRONTOS (Nubank, XP; no código, não se mexem) e os que você ensinou no `AssistenteModelo`. De cada um: o que ele lê
// (as colunas, a parcela, o vencimento), se reconhece o arquivo sozinho pelo cabeçalho e os cartões que o usam.
// Clicar no nome renomeia; "Ensinar de novo" refaz o modelo com um arquivo novo (as colunas ficam se o cabeçalho é
// o mesmo); "Excluir" devolve os cartões dele ao lançamento manual. "+ Ensinar um formato" cria um sem cartão.

const PAPEL = { data: 'Data', estabelecimento: 'Estabelecimento', valor: 'Valor', parcela: 'Parcela', portador: 'Portador' };
const VENC = { nome: 'pelo nome do arquivo', dia: 'pelo dia do cartão', perguntar: 'perguntando' };
const SEP = { ';': ';', ',': ',', '\t': 'tab' };

function oQueLe(cfg) {
  const cols = Object.entries(cfg.colunas ?? {}).filter(([, j]) => j != null).sort((a, b) => a[1] - b[1]).map(([k]) => PAPEL[k]);
  const parcela = { nenhuma: 'sem parcela', texto: 'parcela no texto', coluna: 'parcela na coluna' }[cfg.parcela];
  return `${cols.join(' · ')} — ${parcela}, gasto ${cfg.gasto}, data ${cfg.data}, separador ${SEP[cfg.separador] ?? cfg.separador}`;
}

export default function Modelos() {
  const toast = useToast();
  const confirmar = useConfirmacao();
  const [modelos, setModelos] = useState(undefined); // null = sem a migration 011
  const [cartoes, setCartoes] = useState([]);
  const [renomeando, setRenomeando] = useState(null); // { id, nome }
  const [assistente, setAssistente] = useState(null); // { modelo? }

  const carregar = useCallback(async () => {
    try {
      const [ms, cs] = await Promise.all([listarModelos(), listarCartoes()]);
      setModelos(ms);
      setCartoes(cs);
    } catch (err) { toast.error(err.message); setModelos([]); }
  }, [toast]);
  useEffect(() => { carregar(); }, [carregar]);

  const usam = (m) => cartoes.filter((c) => (m.pronto ? c.formato === m.id : c.formato === 'modelo' && c.modelo_id === m.id));

  const renomear = async () => {
    const { id, nome } = renomeando;
    setRenomeando(null);
    if (!nome.trim() || nome.trim() === modelos.find((m) => m.id === id)?.nome) return;
    try { await renomearModelo(id, nome); toast.success('Modelo renomeado.'); carregar(); } catch (err) {
      toast.error(/duplicate|unique/i.test(err.message) ? 'Já existe um modelo com esse nome.' : err.message);
    }
  };
  const excluir = async (m) => {
    const cs = usam(m);
    const ok = await confirmar({
      titulo: `Excluir o modelo "${m.nome}"?`,
      texto: cs.length ? `${cs.map((c) => c.nome).join(', ')} ${cs.length === 1 ? 'usa' : 'usam'} este modelo e ${cs.length === 1 ? 'volta' : 'voltam'} ao lançamento manual. As faturas já importadas ficam.` : 'Nenhum cartão o usa. As faturas já importadas por ele ficam.',
      confirmar: 'Excluir', perigo: true,
    });
    if (!ok) return;
    try { await excluirModelo(m.id); toast.success('Modelo excluído.'); carregar(); } catch (err) { toast.error(err.message); }
  };

  const linhas = [...MODELOS_PRONTOS, ...(modelos ?? [])];
  const td = 'border-b border-gray-100 px-3 py-2.5 align-top';
  return (
    <div>
      <CabecalhoPagina titulo="Modelos de importação" acoes={(
        <button type="button" className="btn-primary" onClick={() => setAssistente({})} disabled={modelos === null}>
          <IconMais className="h-[11px] w-[11px]" />Ensinar um formato
        </button>
      )} />
      {modelos === undefined ? <PageLoading /> : (
        <div className="mt-6 space-y-3">
          {modelos === null && (
            <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-[12.5px] text-amber-800">
              Falta aplicar a migration 011 no Supabase (SQL Editor) para guardar os formatos que você ensina. Os prontos já funcionam.
            </p>
          )}
          <div className="card overflow-x-auto">
            <table className="w-full min-w-[760px] text-[13px]">
              <thead className="bg-hx-f9fafb">
                <tr>
                  <th className="table-th">Modelo</th><th className="table-th">O que ele lê</th><th className="table-th">Reconhece sozinho</th>
                  <th className="table-th">Usado em</th><th className="table-th" />
                </tr>
              </thead>
              <tbody>
                {linhas.map((m) => {
                  const cs = usam(m);
                  return (
                    <tr key={m.id} className="transition-colors hover:bg-hx-f9fafb">
                      <td className={td}>
                        {renomeando?.id === m.id ? (
                          <input className="input !h-8 text-[13px]" autoFocus value={renomeando.nome} onChange={(e) => setRenomeando({ ...renomeando, nome: e.target.value })}
                            onBlur={renomear} onKeyDown={(e) => { if (e.key === 'Enter') renomear(); if (e.key === 'Escape') setRenomeando(null); }} />
                        ) : (
                          <span className="flex items-center gap-2">
                            {m.pronto
                              ? <span className="font-medium text-gray-900">{m.nome.replace(' (pronto)', '')}</span>
                              : <button type="button" className="font-medium text-gray-900 hover:underline" title="Renomear" onClick={() => setRenomeando({ id: m.id, nome: m.nome })}>{m.nome}</button>}
                            {m.pronto && <Etiqueta>pronto</Etiqueta>}
                          </span>
                        )}
                        <span className="mt-0.5 block text-[11.5px] text-gray-500">fatura de cartão · vencimento {VENC[m.config.vencimento] ?? '—'}</span>
                      </td>
                      <td className={`${td} max-w-[360px] text-[12px] text-gray-600`}>{oQueLe(m.config)}</td>
                      <td className={td}>
                        {m.cabecalho
                          ? <code className="block max-w-[240px] truncate rounded bg-hx-f6f7f8 px-1.5 py-0.5 text-[11px] text-gray-600" title={m.cabecalho}>{m.cabecalho}</code>
                          : <span className="text-[12px] text-gray-400">não — pela célula do cartão ou “Ler com o modelo…”</span>}
                      </td>
                      <td className={`${td} text-[12.5px] text-gray-700`}>{cs.length ? cs.map((c) => c.nome).join(', ') : <span className="text-gray-400">nenhum cartão</span>}</td>
                      <td className={`${td} whitespace-nowrap text-right`}>
                        {!m.pronto && (
                          <span className="inline-flex gap-1">
                            <Tooltip label="Refazer com um arquivo novo"><button type="button" className="btn-secondary !h-8 !px-2.5 !text-[12.5px]" onClick={() => setAssistente({ modelo: m })}>Ensinar de novo</button></Tooltip>
                            <button type="button" className="btn-secondary !h-8 !px-2.5 !text-[12.5px] hover:!text-hx-c0393d" onClick={() => excluir(m)}>Excluir</button>
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="text-[12px] text-gray-500">
            Um CSV de banco novo: ensine o formato aqui, no cadastro do cartão ("Como a fatura entra") ou no próprio importador, quando ele não reconhecer o arquivo.
          </p>
        </div>
      )}
      {assistente && (
        <AssistenteModelo modelo={assistente.modelo ?? null} cartao={null} onFechar={() => setAssistente(null)}
          onSalvo={() => { setAssistente(null); carregar(); }} />
      )}
    </div>
  );
}
