import { formatDate } from '../../lib/format.js';

// A TELA VAZIA DOS INVESTIMENTOS (06/11/2026, opção A do mockup "Investimentos · a tela vazia"): antes era um aviso solto
// num fundo grande. Agora, os TRÊS PASSOS do começo — os lugares (os que já existem, com a saída "Começar do zero"), os
// investimentos (o passo atual, com o botão) e o primeiro "Atualizar valores" — e, embaixo, a PRÉVIA da carteira como vai
// ficar: as colunas de verdade, esmaecidas e marcadas "exemplo" (os valores não são de ninguém). No celular, só os passos.

const CorPilula = ({ cor, children }) => (
  <span className="inline-flex h-[20px] items-center whitespace-nowrap rounded-full px-2 text-[11px] font-semibold"
    style={{ background: `color-mix(in srgb, ${cor} 14%, transparent)`, color: cor }}>{children}</span>
);

function Passo({ n, estado, titulo, rotulo, children }) {
  const atual = estado === 'atual';
  const feito = estado === 'feito';
  return (
    <div className={`card flex min-w-0 flex-col gap-2 px-4 py-3.5 ${atual ? '!border-gray-400 shadow-[0_0_0_3px_rgba(156,163,175,.18)]' : ''} ${estado === 'depois' ? 'opacity-80' : ''}`}>
      <span className="flex items-center gap-2 text-[10.5px] font-bold uppercase tracking-[0.06em] text-gray-400">
        <span className={`flex h-[22px] w-[22px] items-center justify-center rounded-full text-[11.5px] tracking-normal ${
          feito ? 'bg-hx-dcfce7 text-hx-166534' : atual ? 'bg-gray-800 text-white inverte-no-escuro' : 'bg-gray-100 text-gray-500'}`}>{feito ? '✓' : n}</span>
        {rotulo}
      </span>
      <span className="text-[14.5px] font-semibold text-gray-800">{titulo}</span>
      {children}
    </div>
  );
}

// A prévia: três investimentos de EXEMPLO em dois lugares, no desenho da carteira (o Resgate, o Aplicado, o Vale hoje,
// o Rendeu e o % do ano).
const EXEMPLO = [
  { lugar: 'Banco A', itens: [
    { nome: 'CDB 2 anos', sub: 'CDB · 102% do CDI', resgate: ['a cada 2 anos', 'var(--serie-sobrou)'], resgateSub: 'próxima 03/2027 · reaplica', aplicado: 'R$ 44.000', vale: 'R$ 48.300', rendeu: '+R$ 4.300', pct: '+9,8%', ano: '9,1%' },
    { nome: 'Caixinha', sub: 'RDB · 100% do CDI', resgate: ['diária', 'var(--serie-gastos)'], aplicado: 'R$ 21.500', vale: 'R$ 22.140', rendeu: '+R$ 640', pct: '+3,0%', ano: '8,8%' },
  ] },
  { lugar: 'Corretora B', itens: [
    { nome: 'Tesouro IPCA+ 2035', sub: 'Tesouro · IPCA + 6,8%', resgate: ['diária', 'var(--serie-gastos)'], resgateSub: 'vence 05/2035', aplicado: 'R$ 18.000', vale: 'R$ 19.580', rendeu: '+R$ 1.580', pct: '+8,8%', ano: '10,2%' },
  ] },
];
function Previa() {
  const th = 'border-b border-gray-200 bg-hx-f9fafb px-3 py-2 text-[10.5px] font-semibold uppercase tracking-wide text-gray-500';
  const td = 'border-b border-gray-100 px-3 py-2';
  return (
    <div className="card relative mt-4 overflow-hidden !p-0" aria-hidden="true">
      <span className="absolute right-3 top-2 z-10 rounded-full border border-gray-200 bg-white px-2.5 py-0.5 text-[10.5px] font-bold uppercase tracking-[0.06em] text-gray-400">
        exemplo · assim fica a carteira
      </span>
      <div className="pointer-events-none select-none overflow-hidden opacity-50 saturate-[.7]">
        <table className="w-full min-w-[760px] border-separate border-spacing-0 text-[13px] tabular-nums">
          <thead><tr>
            <th className={`${th} text-left`}>Investimento</th><th className={`${th} text-left`}>Resgate</th>
            <th className={`${th} text-right`}>Aplicado</th><th className={`${th} text-right`}>Vale hoje</th><th className={`${th} text-right`}>Rendeu</th><th className={`${th} text-right`}>Em 2026</th>
          </tr></thead>
          <tbody>
            {EXEMPLO.map((g) => [
              <tr key={g.lugar}><td colSpan={6} className="border-b border-gray-100 bg-hx-f9fafb px-3 py-2 text-[12.5px] font-semibold text-gray-800">
                {g.lugar}<span className="ml-1.5 font-normal text-gray-400">{g.itens.length} {g.itens.length === 1 ? 'investimento' : 'investimentos'}</span></td></tr>,
              ...g.itens.map((x) => (
                <tr key={x.nome}>
                  <td className={`${td} pl-[38px]`}><span className="block font-medium text-gray-800">{x.nome}</span><span className="block text-[11.5px] text-gray-500">{x.sub}</span></td>
                  <td className={td}><CorPilula cor={x.resgate[1]}>{x.resgate[0]}</CorPilula>{x.resgateSub && <span className="block text-[11.5px] text-gray-500">{x.resgateSub}</span>}</td>
                  <td className={`${td} text-right text-gray-600`}>{x.aplicado}</td>
                  <td className={`${td} text-right font-semibold text-gray-900`}>{x.vale}</td>
                  <td className={`${td} text-right`}><span className="text-green-700">{x.rendeu}</span><span className="block text-[11.5px] text-gray-500">{x.pct}</span></td>
                  <td className={`${td} text-right text-gray-600`}>{x.ano}</td>
                </tr>
              )),
            ])}
          </tbody>
        </table>
      </div>
      {/* o fim some no fundo do cartão */}
      <span className="pointer-events-none absolute inset-x-0 bottom-0 h-16" style={{ background: 'linear-gradient(transparent, rgb(var(--tf-white, 255 255 255)))' }} />
    </div>
  );
}

// `contas`: os lugares que existem; `saldos`: as fotos antigas deles (as datas vão no passo 1).
export default function CarteiraVazia({ contas, saldos, movel, podeCadastrar, onMontar, onComecarDoZero }) {
  const temLugar = contas.length > 0;
  const datas = [...new Set(saldos.map((s) => s.data))].sort().map(formatDate);
  const datasTexto = datas.length > 1 ? `${datas.slice(0, -1).join(', ')} e ${datas[datas.length - 1]}` : datas[0];
  const botao = (rotulo) => !movel && (
    <span><button type="button" className="btn-primary !h-8 !text-[12.5px]" onClick={onMontar} disabled={!podeCadastrar}>{rotulo}</button></span>
  );
  return (
    <div className="mt-4">
      <div className="grid gap-3 md:grid-cols-3">
        <Passo n={1} estado={temLugar ? 'feito' : 'atual'} rotulo="Passo 1 · onde" titulo="As instituições">
          <span className="text-[12.5px] leading-relaxed text-gray-600">O banco ou a corretora de cada investimento.{temLugar ? ` Você já tem ${contas.length === 1 ? 'um' : contas.length}:` : ' No cadastro, comece pela "Nova instituição" (Nubank, XP…).'}</span>
          {temLugar && (
            <span className="flex flex-wrap gap-1.5">
              {contas.map((c) => <span key={c.id} className="rounded-full bg-gray-100 px-2.5 py-0.5 text-[12px] font-semibold text-gray-600">{c.nome}</span>)}
            </span>
          )}
          {temLugar && datas.length > 0 && (
            <span className="text-[12px] leading-relaxed text-gray-500">
              São as contas de antes, com as fotos de {datasTexto}.
              {!movel && <> <button type="button" className="font-semibold text-gray-800 underline-offset-2 hover:underline" onClick={onComecarDoZero}>Começar do zero</button> as apaga.</>}
            </span>
          )}
          {!temLugar && botao('Montar a carteira')}
        </Passo>
        <Passo n={2} estado={temLugar ? 'atual' : 'depois'} rotulo="Passo 2 · o quê" titulo="Os investimentos">
          <span className="text-[12.5px] leading-relaxed text-gray-600">Uma linha por investimento: o nome e o tipo (o resto o tipo já preenche). O dinheiro entra depois: Aplicar, se é novo, ou colar os aportes do banco, se já estava aplicado.</span>
          {temLugar && botao('Montar a carteira')}
        </Passo>
        <Passo n={3} estado="depois" rotulo="Passo 3 · todo mês" titulo="Atualizar valores">
          <span className="text-[12.5px] leading-relaxed text-gray-600">No fim de cada mês, quanto cada um vale. A diferença é o rendimento, e o painel do Patrimônio se preenche.</span>
        </Passo>
      </div>
      {!movel && <Previa />}
    </div>
  );
}
