import CabecalhoPagina from '../components/CabecalhoPagina.jsx';
import ListaVazia from '../components/ListaVazia.jsx';

// Tela provisória das que ainda não existem: o nome e a fase do PLANO.md em que ela chega.
export default function EmBreve({ titulo, fase }) {
  return (
    <div>
      <CabecalhoPagina titulo={titulo} />
      <div className="mt-6">
        <ListaVazia>Esta tela chega na fase {fase} do plano.</ListaVazia>
      </div>
    </div>
  );
}
