// Controle segmentado: trilho fixo sempre visível, com um botão que DESLIZA para a opção
// escolhida. Substitui os grupos de botões colados com borda, que não se liam como um conjunto.
//
// opcoes: [{ valor, rotulo }] · value · onChange(valor)
//
// A posição do botão é ARITMÉTICA (colunas de largura igual + translateX de N × 100%), não medida
// no DOM. Medir `offsetLeft`/`offsetWidth` é o caminho óbvio e é frágil: erra enquanto a fonte
// variável não carregou e quando o componente nasce dentro de algo escondido (modal, aba fechada),
// onde toda medida é zero. Assim vale já no primeiro render. O custo é todas as opções ficarem com
// a mesma largura — irrelevante para rótulos curtos, que é o caso deste controle.
export default function SegmentedFiltro({ opcoes, value, onChange, className = '', ariaLabel }) {
  const i = Math.max(0, opcoes.findIndex((o) => o.valor === value));
  return (
    // `rounded-md` e não um raio próprio: este controle divide a barra de filtros com o
    // FiltroPeriodo e afins, e um raio maior fazia ele parecer de outra família. O raio da pílula
    // interna é o externo menos o padding (5,25 − 3 ≈ 2,25), para os cantos ficarem concêntricos.
    <span role="radiogroup" aria-label={ariaLabel}
      className={`relative inline-grid p-[3px] rounded-md bg-gray-100 border border-gray-200 ${className}`}
      style={{ gridTemplateColumns: `repeat(${opcoes.length}, minmax(0, 1fr))` }}>
      {/* `left`/`top`/`bottom` em 3px acompanham o padding do trilho, para o botão não encostar
          nas bordas. A largura desconta esse padding dos dois lados. */}
      <span aria-hidden="true"
        className="pointer-events-none absolute top-[3px] bottom-[3px] left-[3px] rounded-[2.5px] bg-gray-800 transition-transform duration-200 ease-out motion-reduce:transition-none"
        style={{ width: `calc((100% - 6px) / ${opcoes.length})`, transform: `translateX(${i * 100}%)` }} />
      {/* `font-medium` em TODOS, e não só no selecionado: com o peso variando, o rótulo mais longo
          engordava ao ser escolhido e o trilho inteiro mudava de largura (~3px), empurrando os
          controles vizinhos da barra. A distinção fica por cor — branco sobre grafite já é
          contraste de sobra, sem precisar do peso.
          O retorno de clique NÃO pode ser `active:bg-*`: o segmento é transparente — quem pinta é
          a pílula que desliza por baixo, e um fundo próprio a cobriria. `brightness` é o idioma
          que o app já usa onde a superfície não é sólida (ver AvisosFicha). */}
      {opcoes.map((o) => (
        <button key={o.valor} type="button" role="radio" aria-checked={o.valor === value}
          onClick={() => onChange(o.valor)}
          className={`relative px-3.5 py-[4px] text-sm font-medium whitespace-nowrap transition-colors duration-150 active:brightness-90 ${
            o.valor === value ? 'text-white' : 'text-gray-600 hover:text-gray-800'}`}>
          {o.rotulo}
        </button>
      ))}
    </span>
  );
}
