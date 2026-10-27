import { useMemo, useState } from 'react';
import SelectBusca, { opcoesCategoria } from './SelectBusca.jsx';
import ModalCategoria from './ModalCategoria.jsx';

// SELETOR DE CATEGORIA com "+ Criar categoria" no pé da lista: a categoria que falta é criada sem sair
// da tela (o nome vem do que foi digitado na busca) e já fica escolhida.
//
// `categorias`: as do cadastro (com `grupo`). `tipo`: 'saida' | 'entrada' (filtra e define os grupos do
// formulário). `extras`: opções antes das categorias ([{ value, label }], ex.: "Sem categoria").
// `incluirInativas`: para filtros (a categoria desativada continua achável). `onCriada(categoria)`:
// avisa quem chamou para recarregar a lista dele — até lá, a nova fica guardada aqui e já aparece.
export default function SeletorCategoria({
  value, onChange, categorias, tipo, extras = [], incluirInativas = false, onCriada, className, placeholder = 'Categoria…', criar = true,
}) {
  const [novas, setNovas] = useState([]);
  const [criando, setCriando] = useState(null); // nome inicial do formulário, ou null

  const todas = useMemo(() => {
    const ids = new Set(categorias.map((c) => c.id));
    return [...categorias, ...novas.filter((c) => !ids.has(c.id))];
  }, [categorias, novas]);

  const opcoes = useMemo(() => [
    ...extras,
    ...opcoesCategoria(todas, { tipo, atual: value, incluirInativas }),
  ], [extras, todas, tipo, value, incluirInativas]);

  return (
    <>
      <SelectBusca className={className} value={value} onChange={onChange} opcoes={opcoes} placeholder={placeholder}
        buscaPlaceholder="Buscar categoria ou grupo"
        acao={criar ? { rotulo: (q) => (q ? `Criar categoria "${q}"` : 'Criar categoria nova'), onClick: (q) => setCriando(q) } : undefined} />
      {criando !== null && (
        <ModalCategoria tipo={tipo} nomeInicial={criando} onFechar={() => setCriando(null)}
          onSalvo={(cat) => {
            setCriando(null);
            setNovas((n) => [...n, cat]);
            onChange(cat.id);
            onCriada?.(cat);
          }} />
      )}
    </>
  );
}
