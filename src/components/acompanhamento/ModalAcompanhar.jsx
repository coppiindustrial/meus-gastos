import { useMemo, useState } from 'react';
import Modal from '../Modal.jsx';
import Toggle from '../Toggle.jsx';
import Tooltip from '../Tooltip.jsx';
import CampoTicker from '../rendaVariavel/CampoTicker.jsx';
import { DivisorFaixa, Trilho as TrilhoFaixa } from '../filtros/FaixaFiltros.jsx';
import { IconLixeira } from '../icons.jsx';
import { Alca } from '../PecasCadastro.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { useConfirmacao } from '../../context/ConfirmContext.jsx';
import { gravarAcompanhamento } from '../../api/acompanhamento.js';
import { useListaArrastavel } from '../../lib/useListaArrastavel.js';
import { CLASSES, TIPOS, nomeDoTipo } from '../../lib/rendaVariavel.js';
import { chaveDe, planoDoAcompanhamento } from '../../lib/acompanhamento.js';

// O QUE ACOMPANHAR (25/11/2026, o mockup "Acompanhamento das ações", o pop-up do ✎): a tabela de formulário dos cadastros em
// dois grupos. DA CARTEIRA: os ativos do cadastro entram sozinhos; o interruptor "Aparece" só esconde da tela (a carteira não
// muda; sai pelo cadastro dos ativos). SÓ ACOMPANHANDO: as ações de fora, procuradas pelo nome na MESMA busca do cadastro dos
// ativos (`CampoTicker`, o Yahoo); a alça ⠿ ordena e a lixeira tira. "Salvar alterações (N)" grava só a diferença
// (`planoDoAcompanhamento`, testada). Sem a migration 037, só explica.

const COR_CLASSE = Object.fromEntries(CLASSES.map((c) => [c.id, c]));
const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

export default function ModalAcompanhar({ lista, semMigration, onFechar, onSalvo }) {
  const toast = useToast();
  const confirmar = useConfirmacao();
  const [itens, setItens] = useState(() => lista.map((i) => ({ ...i })));
  const [busca, setBusca] = useState('');
  const [soAparece, setSoAparece] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const plano = useMemo(() => planoDoAcompanhamento(lista, itens), [lista, itens]);
  const nMudancas = plano.criar.length + plano.atualizar.length + plano.apagar.length;
  const mudar = (chave, campo, valor) => setItens((ls) => ls.map((i) => (i.chave === chave ? { ...i, [campo]: valor } : i)));
  const alterada = (i) => {
    const a = lista.find((x) => x.chave === i.chave);
    return !a || a.aparece !== i.aparece || !!i.tirar;
  };

  // escolher na busca: acompanha (o que já está na lista volta a aparecer)
  const escolher = (it) => {
    const chave = chaveDe(it.mercado, it.ticker);
    const ja = itens.find((i) => i.chave === chave);
    setBusca('');
    if (ja) {
      if (!ja.aparece || ja.tirar) { setItens((ls) => ls.map((i) => (i.chave === chave ? { ...i, aparece: true, tirar: false } : i))); return; }
      toast.info(`${it.ticker} já está ${ja.deCarteira ? 'na carteira' : 'na lista'}.`);
      return;
    }
    const tipo = TIPOS[it.tipo] ? it.tipo : it.mercado === 'EUA' ? 'acao_eua' : 'acao_br';
    setItens((ls) => [...ls, { chave, ticker: it.ticker, mercado: it.mercado, nome: it.nome ?? '', tipo, classe: TIPOS[tipo].classe, deCarteira: false, ativoId: null, aparece: true, linhaId: null, ordem: 0 }]);
  };

  const cart = itens.filter((i) => i.deCarteira && (!soAparece || i.aparece));
  const fora = itens.filter((i) => !i.deCarteira && (!soAparece || i.aparece));
  const idsFora = fora.map((i) => i.chave);
  const arrasto = useListaArrastavel({
    ids: idsFora,
    onReordenar: (ids) => {
      if (soAparece) return;
      const porChave = new Map(itens.map((i) => [i.chave, i]));
      setItens([...itens.filter((i) => i.deCarteira), ...ids.map((k) => porChave.get(k)).filter(Boolean)]);
    },
  });

  const salvar = async () => {
    setSalvando(true);
    try {
      await gravarAcompanhamento(plano);
      toast.success('A lista do acompanhamento foi salva.');
      onSalvo();
    } catch (err) {
      toast.error(err.message);
      setSalvando(false);
    }
  };
  const fechar = async () => {
    if (nMudancas && !(await confirmar({ titulo: 'Descartar as alterações?', confirmar: 'Descartar', texto: `${plural(nMudancas, 'alteração não foi salva', 'alterações não foram salvas')}.` }))) return;
    onFechar();
  };

  const th = 'h-8 border-b border-gray-200 bg-hx-f9fafb px-2 text-left text-[10.5px] font-semibold uppercase tracking-wide text-gray-500';
  const td = 'border-b border-gray-100 px-2 py-1 align-middle';
  const faixa = (nome, sub, cor) => (
    <tr>
      <td colSpan={6} className="relative h-[40px] border-b border-gray-200 bg-hx-f3f4f6 py-0 pl-3.5 pr-3">
        <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-0 w-[3px]" style={{ background: cor }} />
        <span className="text-[14px] font-semibold text-gray-900">{nome}</span>
        <span className="ml-2 text-[12px] text-gray-500">{sub}</span>
      </td>
    </tr>
  );
  const linha = (i, { arrastavel }) => {
    const c = COR_CLASSE[i.classe];
    return (
      <tr key={i.chave} {...(arrastavel ? arrasto.itemProps(i.chave) : {})}
        className={`group/linha hover:bg-hx-f9fafb ${arrasto.dragId === i.chave ? '!opacity-40' : ''} ${i.tirar ? 'opacity-40' : !i.aparece ? 'opacity-60' : ''}`}>
        <td className={`${td} pl-[12px]`} style={alterada(i) ? { boxShadow: 'inset 3px 0 0 #f59e0b' } : undefined}>
          <span className="flex items-center gap-1.5">
            {arrastavel ? <Alca props={soAparece ? null : arrasto.alcaProps(i.chave)} rotulo="Arraste para mudar a ordem" /> : <span className="w-[16px]" />}
            <span className="font-semibold text-gray-900">{i.ticker}</span>
          </span>
        </td>
        <td className={`${td} truncate text-gray-700`}>{i.nome || '—'}</td>
        <td className={`${td} text-gray-600`}>
          <span className="inline-flex items-center gap-1.5"><span className="h-[7px] w-[7px] rounded-full" style={{ background: c?.cor }} />{c?.nome} · {nomeDoTipo(i.tipo)}</span>
        </td>
        <td className={`${td} text-[12px] text-gray-500`}>{i.deCarteira ? 'Carteira' : i.linhaId ? 'Só acompanhando' : 'novo'}</td>
        <td className={td}><span className="flex h-8 items-center"><Toggle compacto checked={i.aparece && !i.tirar} disabled={i.tirar} onChange={(v) => mudar(i.chave, 'aparece', v)} rotulo={`${i.ticker} aparece na tela`} /></span></td>
        <td className={`${td} text-right`}>
          {!i.deCarteira && (
            <Tooltip label={i.tirar ? 'Não tirar' : 'Tirar da lista (ao salvar)'}>
              <button type="button" aria-label={i.tirar ? 'Não tirar' : `Tirar ${i.ticker}`}
                onClick={() => (i.linhaId ? mudar(i.chave, 'tirar', !i.tirar) : setItens((ls) => ls.filter((x) => x.chave !== i.chave)))}
                className={`inline-grid h-[28px] w-[28px] place-items-center rounded-[6px] transition-[opacity,color,background-color] hover:bg-hx-fdeaea hover:text-hx-c0393d focus-visible:opacity-100 ${i.tirar ? 'bg-hx-fdeaea text-hx-c0393d' : 'text-gray-400 opacity-0 group-hover/linha:opacity-100'}`}>
                <IconLixeira className="h-[14px] w-[14px]" />
              </button>
            </Tooltip>
          )}
        </td>
      </tr>
    );
  };

  const SEG = 'inline-flex h-[25px] shrink-0 items-center gap-2 whitespace-nowrap rounded-[3px] px-2 text-[12.5px] transition-colors hover:bg-gray-200';
  const acoes = semMigration ? null : (
    <TrilhoFaixa className="mr-1 shrink-0">
      <span className="w-[300px] [&_input]:!h-[25px] [&_input]:!border-0 [&_input]:!bg-transparent [&_input]:!shadow-none">
        <CampoTicker value={busca} onChange={setBusca} onEscolher={escolher} placeholder="Acompanhar: o ticker ou o nome da empresa" />
      </span>
      <DivisorFaixa />
      <label className={`${SEG} cursor-pointer text-gray-600 hover:text-gray-900`}>
        <Toggle compacto checked={soAparece} onChange={setSoAparece} rotulo="Só os que aparecem" />Só os que aparecem
      </label>
    </TrilhoFaixa>
  );
  const nVisiveis = itens.filter((i) => i.aparece && !i.tirar).length;

  return (
    <Modal open onClose={fechar} title="O que acompanhar" maxWidth="max-w-[1040px]" padding="p-0" acoes={acoes}
      subtitulo={semMigration ? 'falta a migration 037' : `${plural(nVisiveis, 'aparece', 'aparecem')} na tela · os da carteira entram sozinhos`}>
      {semMigration ? (
        <div className="space-y-2 px-5 py-6 text-[13px] text-gray-600">
          <p>Para acompanhar ações fora da carteira e esconder as da carteira, falta a <b>migration 037</b>.</p>
          <p className="text-gray-500">Supabase → SQL Editor → cole <code>supabase/migrations/037_acompanhamento.sql</code> → Run. Até lá, a tela mostra a carteira inteira.</p>
        </div>
      ) : (
        <div className="max-h-[62vh] overflow-auto [scrollbar-gutter:stable]">
          <table className="w-full min-w-[820px] table-fixed border-separate border-spacing-0 text-[12.5px]">
            <colgroup><col style={{ width: 150 }} /><col /><col style={{ width: 190 }} /><col style={{ width: 150 }} /><col style={{ width: 90 }} /><col style={{ width: 48 }} /></colgroup>
            <thead className="sticky top-0 z-10">
              <tr><th className={`${th} pl-[34px]`}>Ticker</th><th className={th}>Nome</th><th className={th}>Classe</th><th className={th}>De onde</th><th className={th}>Aparece</th><th className={th} aria-label="Tirar" /></tr>
            </thead>
            <tbody ref={arrasto.containerRef}>
              {faixa('Da carteira', `${plural(itens.filter((i) => i.deCarteira).length, 'ativo', 'ativos')} · entram sozinhos; o cadastro dos ativos tira`, 'var(--serie-gastos)')}
              {cart.map((i) => linha(i, { arrastavel: false }))}
              {!cart.length && <tr><td colSpan={6} className="px-4 py-4 text-[12.5px] text-gray-400">{soAparece ? 'Nenhum da carteira aparece.' : 'Nenhum ativo no cadastro.'}</td></tr>}
              {faixa('Só acompanhando', `${plural(itens.filter((i) => !i.deCarteira && !i.tirar).length, 'ativo', 'ativos')} · não estão na carteira`, '#9ca3af')}
              {fora.map((i) => linha(i, { arrastavel: true }))}
              {!fora.length && <tr><td colSpan={6} className="px-4 py-4 text-[12.5px] text-gray-400">Procure em cima, pelo ticker ou pelo nome ("itaú", "nvidia"), e escolha na lista.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-gray-200 bg-hx-f9fafb px-4 py-3">
        <span className="text-[12px] text-gray-500">
          {nMudancas ? <><b className="font-semibold text-hx-92400e">{plural(nMudancas, 'alteração', 'alterações')}</b> · ainda não salvo</>
            : semMigration ? '' : 'Desligar só esconde da tela · arraste pela ⠿ para mudar a ordem dos acompanhados'}
        </span>
        <span className="flex-1" />
        <button type="button" className="btn-secondary" onClick={fechar} disabled={salvando}>Cancelar</button>
        <button type="button" className="btn-primary" disabled={salvando || semMigration || !nMudancas} onClick={salvar}>
          {salvando ? 'Salvando…' : nMudancas ? `Salvar alterações (${nMudancas})` : 'Salvar alterações'}
        </button>
      </div>
    </Modal>
  );
}
