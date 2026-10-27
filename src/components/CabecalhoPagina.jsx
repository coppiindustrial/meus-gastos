import { useTituloAba } from '../lib/useTituloAba.js';

// Cabeçalho de página em FAIXA — o desenho que o Dashboard estreou e que agora vale para as demais
// abas: nome da página à esquerda, ações à direita, faixa branca de ponta a ponta com linha e uma
// sombra discreta embaixo. Antes cada tela abria com um `<h1>` solto no respiro da página, e o topo
// do app começava de um jeito diferente em cada aba.
//
// A altura (60px) e a cor da borda (#eef0f2) são as MESMAS do topo da sidebar (Layout.jsx) — é o que
// faz as duas linhas se encontrarem em vez de correrem desencontradas por 1 ou 2px.
//
// `-mx-6 -mt-6` é o miolo da coisa: nega o `p-6` do container de páginas (Layout.jsx:458) para a
// faixa sangrar até as bordas e encostar no topo. Por isso a faixa TEM DE SER O PRIMEIRO FILHO do
// elemento raiz da página — em qualquer outra posição o `-mt-6` come o espaço do irmão de cima.
//
// Props:
//   titulo    — o nome da página.
//   acessorio — o que fica colado no título (a contagem, nas telas que já a punham ali). Alinhado
//               por `items-baseline`, para o número assentar na linha de base do título.
//   acoes     — o que fica à direita (botões e, em algumas telas, a contagem que sempre morou ali).
//
// A contagem ficou onde já estava em cada tela, de propósito: umas a tratam como informação sobre a
// página (colada no título), outras como parte do bloco de ações. Uniformizar isso é outra decisão,
// não esta.
//
// Não é `sticky`: rola junto com a página, como no Dashboard. Fixá-la exigiria acertar z-index com a
// barra de seleção em massa, o painel lateral e o cabeçalho de tabela — sem ganho pedido.
//
// `shrink-0` não é enfeite: nas telas de ALTURA TRAVADA (o Kanban de Custos e os Painéis da
// Engenharia, com `h-[calc(100vh-3rem-1px)]` e colunas que rolam por dentro) a faixa é filha de um
// `flex flex-col`, e ali um item de altura fixa AINDA encolhe quando a soma dos filhos passa do
// container — a faixa apareceria achatada com muitos filtros abertos. Nas telas de fluxo normal a
// classe é inerte (em container de bloco não existe `shrink`).
//
// ELE TAMBÉM NOMEIA A ABA do navegador. Sai daqui, e não de uma tabela de rota → nome em outro
// arquivo, por dois motivos: dezenove telas passam a ter o título certo sem tocar em nenhuma delas,
// e o nome da aba não pode divergir do que está escrito na faixa — se divergisse, seriam duas
// verdades sobre a mesma tela, e a segunda envelheceria calada. As cinco telas sem esta faixa
// (Dashboard, as duas fichas e as duas de autenticação) chamam o `useTituloAba` direto.
export default function CabecalhoPagina({ titulo, acessorio, acoes }) {
  // `titulo` é ReactNode; só string vira nome de aba, e o hook ignora o resto sozinho.
  useTituloAba(titulo);
  return (
    <div className="-mx-6 -mt-6 flex h-[60px] shrink-0 items-center justify-between gap-3 border-b border-hx-eef0f2 bg-white px-6 shadow-[0_1px_3px_rgba(16,24,40,0.06)]">
      <div className="flex min-w-0 items-baseline gap-3">
        <h1 className="truncate text-xl font-semibold text-gray-800">{titulo}</h1>
        {acessorio}
      </div>
      {acoes && <div className="flex shrink-0 items-center gap-2">{acoes}</div>}
    </div>
  );
}
