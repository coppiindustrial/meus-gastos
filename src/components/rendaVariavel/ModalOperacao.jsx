import { useMemo, useState } from 'react';
import Modal from '../Modal.jsx';
import CampoData from '../CampoData.jsx';
import SelectSimples from '../SelectSimples.jsx';
import AbasPilula from '../AbasPilula.jsx';
import { Campo } from '../Comuns.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { atualizarOperacao, criarOperacao } from '../../api/rendaVariavel.js';
import { formatBRL } from '../../lib/dinheiro.js';
import { formatDate } from '../../lib/format.js';
import { emDolar, nomeDoTipo, posicaoDoAtivo, precoDaOperacao, previaDaOperacao, totalDaOperacao, ultimoAte } from '../../lib/rendaVariavel.js';

// LANÇAR UMA OPERAÇÃO (13/11/2026, o mockup "Renda variável"): no desenho do "Lançar aporte". As abas do tipo — COMPRA,
// VENDA, PROVENTO e DESDOBRAMENTO (ou o grupamento) —, o ativo (o cadastro; "+ Cadastrar ativo" no pé da lista), a data e
// os campos de cada um. No EXTERIOR entra o dólar do dia: a PTAX daquele dia vem sugerida (a de antes, no fim de semana), e
// dá para trocar pelo da corretora. A PRÉVIA mostra o que muda: o total, a quantidade, o preço médio na moeda e o custo médio
// em reais; na venda, o lucro pelo custo médio; no provento, o que chega na conta. `inicial` = { ativo?, tipo?, op? (editar) }.

const TIPOS_OP = [{ key: 'compra', label: 'Compra' }, { key: 'venda', label: 'Venda' }, { key: 'provento', label: 'Provento' }, { key: 'desdob', label: 'Desdobramento' }];
const PROVENTOS = [{ value: 'rendimento', label: 'Rendimento (FII)' }, { value: 'dividendo', label: 'Dividendo' }, { value: 'jcp', label: 'JCP' }];
// "1.234,56" → 1234.56 · "104.35" → 104.35 · "10" → 10; vazio ou inválido → null
export function lerNumero(t) {
  const s = String(t ?? '').trim().replace(/\s/g, '');
  if (!s) return null;
  const n = Number(s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s);
  return Number.isFinite(n) ? n : null;
}
const paraCampo = (n, casas = 2) => (n === null || n === undefined ? '' : Number(n).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: Math.max(casas, 6), useGrouping: false }));
const moeda = (usd, v) => `${usd ? 'US$' : 'R$'} ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const quatro = (v) => Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 4, maximumFractionDigits: 4 });

export default function ModalOperacao({ inicial = {}, ativos, operacoes, cotacoes, ptax, dolar, hoje, onCadastro, onFechar, onSalvo }) {
  const toast = useToast();
  const editando = inicial.op ?? null;
  const tipoInicial = editando ? (editando.tipo === 'grupamento' ? 'desdob' : editando.tipo === 'desdobramento' ? 'desdob' : editando.tipo) : inicial.tipo ?? 'compra';
  const [tipo, setTipo] = useState(tipoInicial);
  const [ativoId, setAtivoId] = useState(editando?.ativo_id ?? inicial.ativo?.id ?? (ativos.length === 1 ? ativos[0].id : ''));
  const [data, setData] = useState(editando?.data ?? hoje);
  const [qtd, setQtd] = useState(editando?.quantidade ? paraCampo(editando.quantidade, 0) : '');
  const [preco, setPreco] = useState(editando && precoDaOperacao(editando) !== null ? paraCampo(precoDaOperacao(editando)) : '');
  const [taxas, setTaxas] = useState(editando?.taxas_centavos ? paraCampo(editando.taxas_centavos / 100) : '');
  const [dolarTxt, setDolarTxt] = useState(editando?.dolar ? paraCampo(editando.dolar, 4) : '');
  const [provento, setProvento] = useState(editando?.provento ?? '');
  const [bruto, setBruto] = useState(editando?.tipo === 'provento' ? paraCampo(editando.valor_centavos / 100) : '');
  const [retido, setRetido] = useState(editando?.tipo === 'provento' && editando.retido_centavos ? paraCampo(editando.retido_centavos / 100) : '');
  const [grupamento, setGrupamento] = useState(editando?.tipo === 'grupamento');
  const [fatorTxt, setFatorTxt] = useState(editando?.fator ? paraCampo(editando.tipo === 'grupamento' ? 1 / Number(editando.fator) : editando.fator, 0) : '');
  const [salvando, setSalvando] = useState(false);
  const [tentou, setTentou] = useState(false);

  const ativo = ativos.find((a) => a.id === ativoId) ?? null;
  const usd = emDolar(ativo);
  const outras = useMemo(() => operacoes.filter((o) => o.id !== editando?.id), [operacoes, editando]);
  const ptaxDoDia = data ? ultimoAte(ptax, data) : null;
  const dolarOp = usd ? lerNumero(dolarTxt) ?? ptaxDoDia : null;
  const provPadrao = ativo?.tipo === 'fii' ? 'rendimento' : 'dividendo';
  const tipoProv = provento || provPadrao;

  // a operação como a tabela guarda, e o que falta
  const q = lerNumero(qtd); const pr = lerNumero(preco); const tx = lerNumero(taxas) ?? 0;
  const br = lerNumero(bruto); const rt = lerNumero(retido) ?? 0; const fatorN = lerNumero(fatorTxt);
  let dados = null; let erro = null;
  if (!ativo) erro = 'Escolha o ativo.';
  else if (!data) erro = 'Escolha a data.';
  else if (usd && !dolarOp && tipo !== 'desdob') erro = 'Falta o dólar do dia.';
  else if (tipo === 'compra' || tipo === 'venda') {
    if (!q || q <= 0) erro = 'Digite a quantidade.';
    else if (!pr || pr <= 0) erro = 'Digite o preço por cota.';
    else dados = { ativo_id: ativo.id, tipo, data, quantidade: q, valor_centavos: totalDaOperacao(q, pr), taxas_centavos: Math.round(tx * 100), dolar: usd ? dolarOp : null, provento: null, fator: null, retido_centavos: 0 };
  } else if (tipo === 'provento') {
    if (!br || br <= 0) erro = 'Digite o valor bruto.';
    else if (rt >= br) erro = 'O retido precisa ser menor que o bruto.';
    else dados = { ativo_id: ativo.id, tipo: 'provento', data, quantidade: null, valor_centavos: Math.round(br * 100), retido_centavos: Math.round(rt * 100), taxas_centavos: 0, dolar: usd ? dolarOp : null, provento: tipoProv, fator: null };
  } else if (!fatorN || fatorN <= 1) erro = grupamento ? 'Quantas cotas viram uma? (mais que 1)' : 'Cada cota vira quantas? (mais que 1)';
  else dados = { ativo_id: ativo.id, tipo: grupamento ? 'grupamento' : 'desdobramento', data, fator: grupamento ? 1 / fatorN : fatorN, quantidade: null, valor_centavos: null, taxas_centavos: 0, retido_centavos: 0, dolar: null, provento: null };

  const ctx = { cotacao: cotacoes.find((c) => c.ativo_id === ativo?.id) ?? null, dolar, hoje };
  const previa = ativo && dados ? previaDaOperacao(ativo, outras, dados, ctx) : null;
  const posAntes = previa?.antes ?? (ativo ? posicaoDoAtivo(ativo, outras, ctx) : null);
  if (!erro && tipo === 'venda' && previa?.excede) erro = `Você tem ${posAntes.quantidade.toLocaleString('pt-BR', { maximumFractionDigits: 6 })} cotas: não dá para vender mais que isso.`;
  if (!erro && tipo === 'desdob' && posAntes && !posAntes.quantidade) erro = 'Sem cotas nesse ativo, não há o que desdobrar.';

  const salvar = async (e) => {
    e?.preventDefault();
    setTentou(true);
    if (erro || !dados) return;
    setSalvando(true);
    try {
      if (editando) await atualizarOperacao(editando.id, dados); else await criarOperacao(dados);
      const nome = { compra: 'A compra', venda: 'A venda', provento: 'O provento', desdob: grupamento ? 'O grupamento' : 'O desdobramento' }[tipo];
      const fem = tipo === 'compra' || tipo === 'venda';
      toast.success(`${nome} de ${ativo.ticker} foi ${editando ? (fem ? 'salva' : 'salvo') : (fem ? 'lançada' : 'lançado')}.`);
      onSalvo();
    } catch (err) { toast.error(err.message); setSalvando(false); }
  };

  const opcoesAtivo = ativos.filter((a) => a.ativo !== false || a.id === ativoId).map((a) => ({ value: a.id, label: `${a.ticker}${a.nome ? ` · ${a.nome}` : ''}`, grupo: { nome: a.moeda === 'USD' ? 'Exterior' : a.tipo === 'fii' ? 'FIIs' : 'Ações da B3' } }));
  const linha = (rotulo, valor, forte = false) => (
    <div className="flex justify-between gap-3"><span>{rotulo}</span><span className={`tabular-nums ${forte ? 'font-semibold text-gray-900' : ''}`}>{valor}</span></div>
  );
  const un = (t) => <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[11.5px] text-gray-400">{t}</span>;
  const campoNum = (valor, set, unidade, ph = '0,00', auto = false) => (
    <span className="relative block">
      <input className="input pr-12 text-right tabular-nums" inputMode="decimal" placeholder={ph} value={valor} autoFocus={auto} onChange={(e) => set(e.target.value)} />
      {un(unidade)}
    </span>
  );
  const sigla = usd ? 'US$' : 'R$';

  return (
    <Modal open onClose={onFechar} title={editando ? 'Editar a operação' : 'Lançar operação'} maxWidth="max-w-lg"
      subtitulo={ativo ? `${ativo.ticker}${ativo.nome ? ` · ${ativo.nome}` : ''} · ${nomeDoTipo(ativo.tipo)} · ${usd ? 'em dólar' : 'em reais'}` : 'Escolha o ativo'}>
      <form onSubmit={salvar} className="space-y-4">
        <AbasPilula abas={TIPOS_OP} valor={tipo} onChange={(t) => { setTipo(t); setTentou(false); }} variante="claro" altura={31} folga={3} />
        <div className="grid grid-cols-2 gap-3">
          <Campo rotulo="Ativo" className="col-span-2">
            <SelectSimples value={ativoId} onChange={setAtivoId} opcoes={opcoesAtivo} placeholder="Escolha o ativo"
              acao={onCadastro ? { rotulo: () => '+ Cadastrar ativo', onClick: () => onCadastro() } : undefined} />
            {posAntes && <p className="mt-1 text-[11.5px] text-gray-500">Você tem {posAntes.quantidade.toLocaleString('pt-BR', { maximumFractionDigits: 6 })} {posAntes.quantidade === 1 ? 'cota' : 'cotas'}{posAntes.precoMedio ? ` · preço médio ${moeda(usd, posAntes.precoMedio)}` : ''}</p>}
          </Campo>
          <Campo rotulo={tipo === 'provento' ? 'Pago em' : 'Data'}><CampoData value={data} onChange={setData} /></Campo>
          {(tipo === 'compra' || tipo === 'venda') && <Campo rotulo="Quantidade">{campoNum(qtd, setQtd, 'cotas', '0', !editando)}</Campo>}
          {(tipo === 'compra' || tipo === 'venda') && <Campo rotulo="Preço por cota">{campoNum(preco, setPreco, sigla)}</Campo>}
          {(tipo === 'compra' || tipo === 'venda') && <Campo rotulo="Taxas">{campoNum(taxas, setTaxas, sigla)}</Campo>}
          {tipo === 'provento' && <Campo rotulo="Tipo"><SelectSimples value={tipoProv} onChange={setProvento} opcoes={PROVENTOS} /></Campo>}
          {tipo === 'provento' && <Campo rotulo="Valor bruto">{campoNum(bruto, setBruto, sigla, '0,00', !editando)}</Campo>}
          {tipo === 'provento' && (
            <Campo rotulo={usd ? 'Retido nos EUA' : 'Retido na fonte'}>
              {campoNum(retido, setRetido, sigla)}
              {usd && br > 0 && !retido && <button type="button" className="mt-1 text-[11.5px] font-medium text-gray-500 underline-offset-2 hover:text-gray-800 hover:underline" onClick={() => setRetido(paraCampo(Math.round(br * 30) / 100))}>usar 30% ({moeda(true, Math.round(br * 30) / 100)})</button>}
            </Campo>
          )}
          {tipo === 'desdob' && (
            <Campo rotulo="Proporção">
              <span className="relative block">
                <input className="input pl-[74px] text-right tabular-nums" inputMode="decimal" placeholder="4" autoFocus={!editando} value={fatorTxt} onChange={(e) => setFatorTxt(e.target.value)} />
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[12.25px] text-gray-500">{grupamento ? 'viram 1:' : '1 vira:'}</span>
              </span>
              <button type="button" className="mt-1 text-[11.5px] font-medium text-gray-500 underline-offset-2 hover:text-gray-800 hover:underline" onClick={() => setGrupamento((g) => !g)}>
                {grupamento ? 'é um desdobramento (1 vira N)' : 'é um grupamento (N viram 1)'}
              </button>
            </Campo>
          )}
          {usd && tipo !== 'desdob' && (
            <Campo rotulo="Dólar do dia" className="col-span-2">
              <span className="relative block">
                <input className="input pr-28 text-right tabular-nums" inputMode="decimal" placeholder={ptaxDoDia ? quatro(ptaxDoDia) : '0,0000'} value={dolarTxt} onChange={(e) => setDolarTxt(e.target.value)} />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[11.5px] text-gray-400">R$ por US$</span>
              </span>
              <p className="mt-1 text-[11.5px] text-gray-500">
                {ptaxDoDia ? <>Vazio, vale a PTAX de {formatDate(data)}{ptax.some(([d]) => d === data) ? '' : ' (a do dia útil antes)'}: {quatro(ptaxDoDia)}. Troque pelo da corretora, se ela mostrar.</> : 'Sem a PTAX desse dia: digite o dólar da corretora.'}
              </p>
            </Campo>
          )}
        </div>

        <div className={`rounded-md border px-3 py-2.5 text-[12.5px] ${erro && tentou ? 'border-red-200 bg-red-50 text-red-700' : 'border-gray-200 bg-hx-f9fafb text-gray-600'}`} aria-live="polite">
          {erro ? (tentou ? erro : <span className="text-gray-500">{erro}</span>) : (
            <div className="space-y-1">
              {(tipo === 'compra' || tipo === 'venda') && (<>
                {linha(tipo === 'compra' ? 'Total' : 'Recebe', usd ? `${moeda(true, (dados.valor_centavos + (tipo === 'compra' ? 1 : -1) * dados.taxas_centavos) / 100)} · ${formatBRL(Math.round((dados.valor_centavos + (tipo === 'compra' ? 1 : -1) * dados.taxas_centavos) * dolarOp))}` : formatBRL(dados.valor_centavos + (tipo === 'compra' ? 1 : -1) * dados.taxas_centavos), true)}
                {linha('Você passa a ter', `${posAntes.quantidade.toLocaleString('pt-BR', { maximumFractionDigits: 6 })} → ${previa.depois.quantidade.toLocaleString('pt-BR', { maximumFractionDigits: 6 })} cotas`)}
                {tipo === 'compra' && previa.depois.precoMedio && linha('Preço médio', `${posAntes.precoMedio ? `${moeda(usd, posAntes.precoMedio)} → ` : ''}${moeda(usd, previa.depois.precoMedio)}`, true)}
                {tipo === 'compra' && usd && previa.depois.custoMedioReais && linha('Custo médio em reais', `${posAntes.custoMedioReais ? `${moeda(false, posAntes.custoMedioReais)} → ` : ''}${moeda(false, previa.depois.custoMedioReais)}`)}
                {tipo === 'venda' && previa.venda && (<>
                  {linha('O custo dessas cotas', formatBRL(Math.round(previa.venda.custo)))}
                  <div className="flex justify-between gap-3"><span>O lucro, pelo custo médio</span><b className={`tabular-nums ${previa.venda.lucro < 0 ? 'text-hx-c0393d' : 'text-green-700'}`}>{previa.venda.lucro < 0 ? '−' : '+'}{formatBRL(Math.abs(Math.round(previa.venda.lucro)))}</b></div>
                  {previa.depois.quantidade > 0 && linha('O preço médio', `não muda · ${moeda(usd, previa.depois.precoMedio)}`)}
                </>)}
                {usd && <p className="border-t border-gray-200 pt-1 text-[11px] text-gray-500">{tipo === 'compra' ? 'O custo em reais vai pelo dólar de cada compra: é a conta do IR do exterior.' : 'O IR desta venda entra na fase seguinte (a apuração anual do exterior).'}</p>}
              </>)}
              {tipo === 'provento' && (<>
                {linha('Chega na conta', usd ? `${moeda(true, (dados.valor_centavos - dados.retido_centavos) / 100)} · ${formatBRL(Math.round((dados.valor_centavos - dados.retido_centavos) * dolarOp))}` : formatBRL(dados.valor_centavos - dados.retido_centavos), true)}
                {posAntes?.quantidade > 0 && linha('Por cota', moeda(usd, dados.valor_centavos / 100 / posAntes.quantidade))}
                {data > hoje && <p className="text-[11.5px] text-amber-700">Com a data depois de hoje, ele entra como anunciado, a receber.</p>}
                {usd && dados.retido_centavos > 0 && <p className="border-t border-gray-200 pt-1 text-[11px] text-gray-500">O retido fica guardado: na declaração, ele abate do imposto daqui.</p>}
              </>)}
              {tipo === 'desdob' && (<>
                {linha('Quantidade', `${posAntes.quantidade.toLocaleString('pt-BR', { maximumFractionDigits: 6 })} → ${previa.depois.quantidade.toLocaleString('pt-BR', { maximumFractionDigits: 6 })} cotas`, true)}
                {linha('Preço médio', `${moeda(usd, posAntes.precoMedio)} → ${moeda(usd, previa.depois.precoMedio)}`)}
                {linha('O que você aplicou', `não muda · ${formatBRL(Math.round(posAntes.custoReais))}`)}
              </>)}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="flex-1" />
          <button type="button" className="btn-secondary" onClick={onFechar}>Cancelar</button>
          <button type="submit" className="btn-primary" disabled={salvando || (tentou && !!erro)}>
            {salvando ? 'Salvando…' : editando ? 'Salvar' : { compra: 'Lançar a compra', venda: 'Lançar a venda', provento: 'Lançar o provento', desdob: grupamento ? 'Lançar o grupamento' : 'Lançar o desdobramento' }[tipo]}
          </button>
        </div>
      </form>
    </Modal>
  );
}
