import { useEffect, useMemo, useState } from 'react';
import Modal from '../Modal.jsx';
import CampoData from '../CampoData.jsx';
import SelectBusca from '../SelectBusca.jsx';
import SegmentedFiltro from '../SegmentedFiltro.jsx';
import Toggle from '../Toggle.jsx';
import { Campo } from '../Comuns.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { useConfirmacao } from '../../context/ConfirmContext.jsx';
import { atualizarAporte, criarAporte, excluirResgate } from '../../api/carteira.js';
import { taxasDiarias } from '../../api/taxas.js';
import { calcularValor, formatBRL, valorParaCampo } from '../../lib/dinheiro.js';
import { formatDate } from '../../lib/format.js';
import { aliquotaIOF, aliquotaIR, calendario, fimDoIOF, diaUtilAntes, diasEntre, fimDeSemana, lerAporte, maisDias, posicaoDoAporte, rendeuDoDeposito, rotuloTaxa, sugerirVencimento } from '../../lib/carteira.js';

// LANÇAR UM APORTE (07/11/2026, o mockup "Carteira por aportes"): um pop-up só, com duas abas.
//   · DINHEIRO NOVO — o investimento, a data, o valor e o vencimento. Ponto final.
//   · JÁ ESTAVA APLICADO — o que você tinha antes do app: quanto tem hoje no banco (o "Valor Bruto"), o dia em que você
//     olhou e a data do DEPÓSITO (o IR vai pela idade dele). O QUANTO JÁ RENDEU O APP CALCULA (08/11/2026, a pedido):
//     pelo CDI desde o depósito (`rendeuDoDeposito`) — o "Rendimento bruto" do banco soma também o que saiu nos saques
//     e não serve quando houve saque. O campo segue a conta até a pessoa digitar nele; aí, a dica oferece a conta ("usar").
// O vencimento vem SUGERIDO pelo prazo do cadastro (só enquanto você não mexe nele) e vale o que estiver no campo. Os
// valores aceitam conta (100+50). `inicial`: { investimento_id?, modo?, aporte? (editar), reaplicar?: { de, data, valor,
// venc } }. Editando, o pop-up lista os resgates do aporte (com o ✕ de cada um).
// O VENCIMENTO (08/11/2026, migration 022): o "Reaplicar" vem com o LÍQUIDO do dia (`venc`: o valor, o IR) e grava o
// `reaplicado_de`; o aporte que o app reaplicou sozinho abre com a nota do que ele fez, e salvar tira o "conferir".
// O dinheiro novo de sábado ou domingo só rende a partir do dia útil seguinte (a prévia diz).
// RENDE DESDE O DIA ÚTIL ANTERIOR (08/11/2026, a pedido; migration 024): o banco que conta um dia a mais (o RDB Planejado
// do Nubank) — no dinheiro novo, o aporte começa no dia útil antes da data; no já estava aplicado, a conta do quanto já
// rendeu começa nele. O IR segue pela data do aporte.

const MODOS = [{ valor: 'novo', rotulo: 'Dinheiro novo' }, { valor: 'antigo', rotulo: 'Já estava aplicado' }];
const pctAliq = (a) => `${(a * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;

// O que o vencimento devolveu: o valor do dia, o IR (e o IOF) e o líquido que entra como o aporte novo
function NotaVencimento({ venc }) {
  return (
    <div className="space-y-1 rounded-md border border-gray-200 bg-hx-f9fafb px-3 py-2.5 text-[12.5px] text-gray-600">
      <div className="flex justify-between gap-3"><span>Venceu em {formatDate(venc.data)} valendo</span><span className="tabular-nums">{formatBRL(venc.valor)}</span></div>
      {venc.iof > 0 && <div className="flex justify-between gap-3"><span>IOF ({venc.idade} dias)</span><span className="tabular-nums">− {formatBRL(venc.iof)}</span></div>}
      <div className="flex justify-between gap-3"><span>IR {venc.aliquota ? pctAliq(venc.aliquota) : '(isento)'}{venc.idade !== null && venc.aliquota ? ` (${venc.idade} dias)` : ''}</span><span className="tabular-nums">− {formatBRL(venc.ir)}</span></div>
      <div className="flex justify-between gap-3 border-t border-gray-200 pt-1"><span>O aporte novo (o IR dele recomeça)</span><b className="tabular-nums text-gray-900">{formatBRL(venc.liquido)}</b></div>
    </div>
  );
}

function formInicial(inicial, cadastro, hoje) {
  const ap = inicial.aporte;
  if (ap) {
    return {
      modo: ap.origem, investimento_id: ap.investimento_id, data: ap.origem === 'novo' ? ap.data : hoje, valor: ap.origem === 'novo' ? valorParaCampo(ap.valor_centavos) : '',
      vencimento: ap.vencimento ?? '', venceAuto: false, lido: ap.origem === 'antigo' ? ap.data : hoje,
      total: ap.origem === 'antigo' ? valorParaCampo(ap.valor_centavos) : '', rendeu: ap.origem === 'antigo' ? valorParaCampo(ap.rendeu_antes_centavos) : '',
      aplicado_em: ap.aplicado_em ?? '', rendeuAuto: false, diaAntes: !!ap.rende_dia_antes,
    };
  }
  const investimento_id = inicial.investimento_id ?? (cadastro.length === 1 ? cadastro[0].id : '');
  const inv = cadastro.find((i) => i.id === investimento_id);
  const data = inicial.reaplicar?.data ?? hoje;
  return {
    modo: inicial.modo ?? 'novo', investimento_id, data, valor: inicial.reaplicar ? valorParaCampo(inicial.reaplicar.valor) : '',
    vencimento: inv ? sugerirVencimento(data, inv) ?? '' : '', venceAuto: true,
    lido: hoje, total: '', rendeu: '', aplicado_em: '', rendeuAuto: true, diaAntes: false,
  };
}

export default function ModalAporte({ inicial = {}, cadastro, resgates = [], cal, hoje, onFechar, onSalvo, onCadastro }) {
  const toast = useToast();
  const confirmar = useConfirmacao();
  const editando = !!inicial.aporte;
  const ativos = useMemo(() => cadastro.filter((i) => i.ativo !== false || i.id === inicial.aporte?.investimento_id), [cadastro, inicial.aporte]);
  const [f, setF] = useState(() => formInicial(inicial, ativos, hoje));
  const [salvando, setSalvando] = useState(false);
  const [tentou, setTentou] = useState(false);
  const inv = cadastro.find((i) => i.id === f.investimento_id);

  // o vencimento acompanha a sugestão até a pessoa mexer nele
  const sugestao = (g, investimentoId) => {
    const i = cadastro.find((x) => x.id === investimentoId);
    const base = g.modo === 'novo' ? g.data : g.aplicado_em;
    return i && base ? sugerirVencimento(base, i) ?? '' : '';
  };
  const mudar = (campo, v) => setF((g) => {
    const n = { ...g, [campo]: v };
    if (campo === 'vencimento') n.venceAuto = false;
    if (campo === 'rendeu') n.rendeuAuto = false;
    if (n.venceAuto && ['data', 'aplicado_em', 'investimento_id', 'modo'].includes(campo)) n.vencimento = sugestao(n, n.investimento_id);
    return n;
  });

  // A CONTA DO QUANTO JÁ RENDEU (o já estava aplicado): pelo CDI desde o depósito, na taxa do investimento. O CDI da tela
  // vem de dois anos para cá; o depósito mais antigo busca o dele (cal [] = o Banco Central não respondeu).
  const precisaCdi = f.modo === 'antigo' && !!f.aplicado_em && (!cal?.length || f.aplicado_em < cal[0][0]);
  const [calDep, setCalDep] = useState(null); // { de, cal }
  useEffect(() => {
    if (!precisaCdi) return undefined;
    let vivo = true;
    const de = f.aplicado_em;
    taxasDiarias(maisDias(de, -7)).then((t) => { if (vivo) setCalDep({ de, cal: t?.cdi?.length ? calendario(t.cdi, hoje, t.ipca) : [] }); });
    return () => { vivo = false; };
  }, [precisaCdi, f.aplicado_em, hoje]);
  const buscandoCdi = precisaCdi && calDep?.de !== f.aplicado_em;
  const calConta = precisaCdi ? (buscandoCdi ? null : calDep.cal) : cal;
  const totalLido = calcularValor(f.total);
  const conta = f.modo === 'antigo' && inv ? rendeuDoDeposito({ total: totalLido, deposito: f.aplicado_em, lido: f.lido, taxa: inv.taxa, indexador: inv.indexador ?? 'cdi', diaAntes: f.diaAntes }, calConta) : null;
  const rendeuAuto = f.rendeuAuto && !!conta;
  const campoRendeu = rendeuAuto ? valorParaCampo(conta.rendeu) : f.rendeu;

  const lido = {
    modo: f.modo, investimento_id: f.investimento_id, data: f.data, valor: calcularValor(f.valor), vencimento: f.vencimento,
    lido: f.lido, total: totalLido, rendeu: campoRendeu.trim() ? calcularValor(campoRendeu) : 0, aplicado_em: f.aplicado_em, diaAntes: f.diaAntes,
  };
  const r = lerAporte(lido, hoje);
  const errosDeTexto = (f.modo === 'novo' && f.valor.trim() && lido.valor === null) ? 'O valor não é um número.'
    : (f.modo === 'antigo' && f.total.trim() && lido.total === null) ? 'O total não é um número.'
      : (f.modo === 'antigo' && campoRendeu.trim() && lido.rendeu === null) ? 'O rendimento não é um número.' : null;

  // a dica embaixo do Quanto já rendeu: a conta, o que falta para ela, ou (digitado diferente) a conta para usar
  const dicaRendeu = (() => {
    if (rendeuAuto) return conta.rendeu === 0 ? 'ainda não rendeu (depositado no dia em que você olhou)' : 'pela conta do CDI desde o depósito; sem saques, a "Valorização" do banco também vale';
    if (conta) {
      return lido.rendeu === conta.rendeu ? 'igual à conta do CDI desde o depósito' : (
        <>pela conta: {formatBRL(conta.rendeu)} · <button type="button" className="font-medium text-brand-600 hover:underline" onClick={() => setF((g) => ({ ...g, rendeuAuto: true, rendeu: valorParaCampo(conta.rendeu) }))}>usar</button></>
      );
    }
    if (!f.aplicado_em) return 'com a data do depósito, o app calcula';
    if (buscandoCdi) return 'buscando o CDI desde o depósito…';
    if (!inv) return 'escolha o investimento (a taxa entra na conta)';
    if (!(totalLido > 0)) return 'com o valor de hoje, o app calcula';
    return 'sem o CDI do Banco Central agora: digite o que rendeu';
  })();
  const erro = errosDeTexto ?? r.erro;

  // A PRÉVIA: o aplicado, de quando rende, o IR de hoje e (no aporte de antes de hoje) quanto ele vale hoje pela conta
  const previa = (() => {
    if (!inv || !r.dados) return null;
    const d = r.dados;
    const aplicado = d.valor_centavos - d.rendeu_antes_centavos;
    const ap = { ...d, id: 'previa' };
    const desde = d.origem === 'novo' ? d.data : d.aplicado_em;
    const ini = d.origem === 'novo' && d.rende_dia_antes ? diaUtilAntes(d.data, cal ?? []) : d.data;
    // só com o CDI desde o começo do aporte (o da tela vem de dois anos para cá, ou do aporte mais antigo)
    const pos = cal?.length && cal[0][0] <= ini ? posicaoDoAporte(ap, inv, editando ? resgates : [], cal, hoje) : null;
    return { aplicado, pos, desde, ini, antes: ini < d.data, fds: d.origem === 'novo' && ini === d.data && fimDeSemana(ini) };
  })();

  // O IMPOSTO DA PRÉVIA (09/11/2026): o IR e, nos 29 primeiros dias, o IOF do dia (de 96% a 3% do rendimento) e quando zera
  const idadeHoje = previa?.desde ? Math.max(0, diasEntre(previa.desde, hoje)) : null;
  const isentoPrevia = !!inv && ['lci', 'lca'].includes(inv.tipo);
  const pctTxt = (a) => `${(a * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
  const iofAte = previa?.desde && idadeHoje < 30 ? fimDoIOF(previa.desde) : null;
  const textoImposto = (() => {
    if (!previa) return '';
    const ir = isentoPrevia ? 'isenta de IR' : previa.desde ? `IR ${pctTxt(aliquotaIR(idadeHoje))}` : `IR 22,5% (sem a data do ${f.modo === 'novo' ? 'aporte' : 'depósito'})`;
    if (!iofAte) return ir;
    const iof = idadeHoje === 0 ? 'IOF de 96% a 3% nos 29 primeiros dias' : `IOF ${pctTxt(aliquotaIOF(idadeHoje))}`;
    return isentoPrevia ? `${ir} · ${iof}` : `${iof} + ${ir} do rendimento`;
  })();

  const salvar = async (e) => {
    e?.preventDefault();
    setTentou(true);
    if (erro || !r.dados) return;
    setSalvando(true);
    try {
      const dados = {
        ...r.dados,
        ...(inicial.reaplicar?.de ? { reaplicado_de: inicial.reaplicar.de } : {}),
        ...(editando && inicial.aporte.conferir ? { conferir: false } : {}),
        ...(editando && inicial.aporte.rende_dia_antes && !r.dados.rende_dia_antes ? { rende_dia_antes: false } : {}),
      };
      if (editando) await atualizarAporte(inicial.aporte.id, dados); else await criarAporte(dados);
      toast.success(editando ? 'Aporte atualizado.' : `Aporte lançado em ${inv.nome}.`);
      onSalvo();
    } catch (err) {
      toast.error(/rende_dia_antes/i.test(err.message) ? 'Falta aplicar a migration 024 (o "rende desde o dia útil anterior").'
        : /inv_aportes|schema cache|does not exist/i.test(err.message) ? 'Falta aplicar a migration 020 (a carteira do zero).' : err.message);
      setSalvando(false);
    }
  };
  const tirarResgate = async (rg) => {
    const ok = await confirmar({ titulo: 'Excluir o resgate?', texto: `O resgate de ${rg.tudo ? 'tudo' : formatBRL(rg.valor_centavos)} em ${formatDate(rg.data)} sai, e o dinheiro volta a render neste aporte.`, confirmar: 'Excluir', perigo: true });
    if (!ok) return;
    try { await excluirResgate(rg.id); toast.success('Resgate excluído.'); onSalvo(true); } catch (err) { toast.error(err.message); }
  };

  const opcoes = ativos.map((i) => ({ value: i.id, label: `${i.nome} · ${rotuloTaxa(i.taxa, i.indexador)}`, grupo: { nome: i.instituicao } }));
  const titulo = editando ? 'Editar aporte' : inicial.reaplicar ? 'Reaplicar' : 'Lançar aporte';
  return (
    <Modal open onClose={onFechar} title={titulo} maxWidth="max-w-lg"
      subtitulo={editando ? `${inv?.nome ?? ''} · ${f.modo === 'novo' ? 'dinheiro novo' : 'já estava aplicado'}` : 'o dinheiro que entrou; o valor de hoje o app calcula pelo CDI de cada dia'}>
      <form onSubmit={salvar} className="space-y-4">
        {!editando && !inicial.reaplicar && <SegmentedFiltro opcoes={MODOS} value={f.modo} onChange={(v) => mudar('modo', v)} ariaLabel="De onde veio o dinheiro" />}
        {inicial.reaplicar?.venc && <NotaVencimento venc={inicial.reaplicar.venc} />}
        {editando && inicial.aporte.conferir && (
          <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5 text-[12.5px] text-amber-800">
            O app lançou este aporte sozinho no vencimento de {formatDate(inicial.aporte.data)} (o investimento reaplica): o valor do dia
            menos o IR, e o vencimento pelo prazo do cadastro. Confira com o banco, corrija se precisar e salve — a marca "conferir" sai.
          </div>
        )}
        <Campo rotulo="Investimento">
          {ativos.length ? (
            <SelectBusca value={f.investimento_id} onChange={(v) => mudar('investimento_id', v)} opcoes={opcoes} placeholder="Escolha o investimento"
              acao={onCadastro ? { rotulo: () => 'Cadastrar investimento', onClick: () => onCadastro() } : undefined} />
          ) : (
            <button type="button" className="btn-secondary w-full" onClick={onCadastro}>Cadastrar o primeiro investimento</button>
          )}
        </Campo>

        {f.modo === 'novo' ? (
          <div className="grid grid-cols-2 gap-3">
            <Campo rotulo="Data do aporte"><CampoData value={f.data} onChange={(v) => mudar('data', v)} max={hoje} /></Campo>
            <Campo rotulo="Valor (R$)">
              <input className="input text-right tabular-nums" inputMode="decimal" autoFocus={!!f.investimento_id && !editando} placeholder="0,00" value={f.valor} onChange={(e) => mudar('valor', e.target.value)} />
            </Campo>
          </div>
        ) : (
          <>
            {/* na ordem da tela do depósito no banco: o Valor Bruto (e quando você olhou), o Depósito — e o que rendeu, a conta */}
            <div className="grid grid-cols-2 gap-3">
              <Campo rotulo="Quanto tem hoje no banco">
                <input className="input text-right tabular-nums" inputMode="decimal" autoFocus={!!f.investimento_id && !editando} placeholder="0,00" value={f.total} onChange={(e) => mudar('total', e.target.value)} />
                <p className="mt-1 text-[11.5px] text-gray-400">o "Valor Bruto" (num depósito de hoje, o que você depositou)</p>
              </Campo>
              <Campo rotulo="Em que dia você olhou"><CampoData value={f.lido} onChange={(v) => mudar('lido', v)} max={hoje} /></Campo>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Campo rotulo="Data do depósito">
                <CampoData value={f.aplicado_em} onChange={(v) => mudar('aplicado_em', v)} max={f.lido || hoje} />
                <p className="mt-1 text-[11.5px] text-gray-400">{f.aplicado_em ? 'o "Depósito"; o IR vai pela idade dele' : 'o "Depósito"; sem ela, o IR vai pelo maior (22,5%)'}</p>
              </Campo>
              <Campo rotulo="Quanto já rendeu">
                <input className="input text-right tabular-nums" inputMode="decimal" placeholder="0,00" value={campoRendeu} onChange={(e) => mudar('rendeu', e.target.value)} />
                <p className="mt-1 text-[11.5px] text-gray-400">{dicaRendeu}</p>
              </Campo>
            </div>
          </>
        )}
        {!inicial.reaplicar && !inicial.aporte?.reaplicado_de && (
          <label className="-mt-1 flex cursor-pointer items-start gap-2.5 text-[12.5px] text-gray-700">
            <span className="pt-0.5"><Toggle compacto checked={f.diaAntes} onChange={(v) => mudar('diaAntes', v)} rotulo="Rende desde o dia útil anterior" /></span>
            <span>
              Rende desde o dia útil anterior
              <span className="block text-[11.5px] text-gray-400">ligue se o banco contou um dia a mais (o RDB Planejado do Nubank conta desde o dia útil antes da aplicação)</span>
            </span>
          </label>
        )}

        <Campo rotulo="Vencimento">
          <CampoData value={f.vencimento} onChange={(v) => mudar('vencimento', v)} vazio="sem vencimento" min={f.modo === 'novo' ? f.data : f.lido} />
          <p className="mt-1 text-[11.5px] text-gray-400">
            {/* a dica: o sugerido, o digitado, ou o que fazer com o campo vazio (o "já estava aplicado" sem a data do aporte não tem de onde sugerir) */}
            {f.vencimento
              ? (inv?.prazo_meses && f.venceAuto ? `sugerido pelo cadastro (${inv.prazo_meses % 12 === 0 ? `${inv.prazo_meses / 12} ${inv.prazo_meses === 12 ? 'ano' : 'anos'}` : `${inv.prazo_meses} meses`}${inv.vence_dia_antes ? ', um dia antes' : ''}${inv.vence_dia_util ? ', fim de semana na segunda' : ''}); mude se o banco disser outra data` : 'a data que o banco mostra')
              : inv?.prazo_meses && f.modo === 'antigo' ? 'digite o que o banco mostra (ou a data do depósito, para o app sugerir); vazio = sem vencimento'
                : 'vazio = sem vencimento (resgata quando quiser)'}
          </p>
        </Campo>

        <div className={`rounded-md border px-3 py-2.5 text-[12.5px] ${erro && tentou ? 'border-red-200 bg-red-50 text-red-700' : 'border-gray-200 bg-hx-f9fafb text-gray-600'}`} aria-live="polite">
          {erro ? (tentou ? erro : <span className="text-gray-500">{f.modo === 'novo' ? 'Escolha o investimento e digite a data e o valor.' : 'No banco, a tela do depósito mostra o Valor Bruto e a data do Depósito.'}</span>) : previa && (
            <div className="space-y-1">
              <div className="flex justify-between gap-3"><span>{f.modo === 'novo' ? 'Aplicado' : `Aplicado = ${formatBRL(r.dados.valor_centavos)} − ${formatBRL(r.dados.rendeu_antes_centavos)}`}</span><b className="tabular-nums text-gray-900">{formatBRL(previa.aplicado)}</b></div>
              {rendeuAuto && (
                <div className="flex justify-between gap-3"><span>Rendeu desde o depósito</span>
                  <span>+{((conta.f - 1) * 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}% · {rotuloTaxa(inv.taxa, inv.indexador)} de {formatDate(conta.ini)} a {formatDate(f.lido)}</span></div>
              )}
              <div className="flex justify-between gap-3"><span>Rende</span><span>{rotuloTaxa(inv.taxa, inv.indexador)} desde {formatDate(previa.ini)}{previa.antes ? ' (o dia útil antes do aporte)' : previa.fds ? ' (fim de semana: a partir do dia útil seguinte)' : ''}</span></div>
              {previa.pos && previa.ini < hoje && <div className="flex justify-between gap-3"><span>Vale hoje, pela conta</span><b className="tabular-nums text-gray-900">{formatBRL(previa.pos.vale)}</b></div>}
              <div className="flex justify-between gap-3"><span>Imposto se resgatasse hoje</span><span className="text-right">{textoImposto}</span></div>
              {iofAte && <div className="flex justify-between gap-3"><span>O IOF zera em</span><span>{formatDate(iofAte)} (o 30º dia)</span></div>}
            </div>
          )}
        </div>

        {editando && resgates.length > 0 && (
          <div>
            <div className="mb-1 text-[12px] font-semibold text-gray-600">Resgates deste aporte</div>
            <ul className="divide-y divide-gray-100 rounded-md border border-gray-200">
              {resgates.map((rg) => (
                <li key={rg.id} className="flex items-center gap-3 px-3 py-1.5 text-[12.5px]">
                  <span className="tabular-nums text-gray-700">{formatDate(rg.data)}</span>
                  <span className="flex-1 tabular-nums text-gray-900">{rg.tudo ? 'tudo' : formatBRL(rg.valor_centavos)}</span>
                  <button type="button" onClick={() => tirarResgate(rg)} className="rounded px-1.5 text-gray-400 hover:bg-hx-fdeaea hover:text-hx-c0393d" aria-label="Excluir o resgate">✕</button>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex items-center gap-2">
          <span className="flex-1 text-[11.5px] text-gray-400">Enter lança · os valores aceitam conta (100+50)</span>
          <button type="button" className="btn-secondary" onClick={onFechar}>Cancelar</button>
          <button type="submit" className="btn-primary" disabled={salvando || (tentou && !!erro)}>{salvando ? 'Salvando…' : editando ? 'Salvar' : 'Lançar o aporte'}</button>
        </div>
      </form>
    </Modal>
  );
}
