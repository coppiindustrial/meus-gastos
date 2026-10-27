import {
  createContext, useCallback, useContext, useEffect, useRef, useState,
} from 'react';
import Modal from '../components/Modal.jsx';

// O DIÁLOGO DE CONFIRMAÇÃO do app, no lugar do `window.confirm` do navegador.
//
// O nativo funciona, mas é a única superfície do sistema que não fala a língua do app: sem título,
// sem hierarquia de texto, sem o vermelho do destrutivo, com botões do sistema operacional e com
// "localhost:5173 diz" no cabeçalho. São 40 chamadas em 20 arquivos, e a troca acontece por FASES —
// esta peça entra primeiro, com um ponto de uso só, para o padrão nascer exercitado.
//
// A DIFERENÇA QUE GOVERNA TUDO: `window.confirm` é SÍNCRONO e trava a thread — o código depois dele
// já roda com a resposta na mão. Aqui a resposta vem por PROMESSA, então todo handler que confirma
// precisa ser `async` e dar `await`. Converter um handler síncrono sem isso não quebra o build: ele
// segue em frente com uma Promise (que é sempre truthy) e a ação acontece SEM confirmação nenhuma.
// É o erro silencioso a vigiar em cada fase.
//
// Molde do `ToastContext`: provedor no `main.jsx`, hook para quem usa. E construído sobre o
// `Modal.jsx` que já existe — animação de entrada/saída, Escape, backdrop e trava de rolagem vêm de
// graça, e um segundo sistema de sobreposição é exatamente o que não se quer.

const ConfirmCtx = createContext(null);

// Acima do `z-[60]` padrão do Modal: este diálogo confirma ações DE DENTRO de outros modais
// (`GrupoModal`, `ChecklistPadraoModal`, `CustoDetalhe`), e no mesmo nível o desempate viraria ordem
// de montagem no DOM — a mesma armadilha que o `SidePanel` documenta com o seu `nivel`.
const Z = 'z-[70]';

export function ConfirmProvider({ children }) {
  const [pedido, setPedido] = useState(null);
  // A promessa fica FORA do estado: guardá-la ali faria cada render carregar um objeto que ninguém
  // lê, e o `resolve` precisa sobreviver ao fechamento para responder depois da animação.
  const resolver = useRef(null);
  const btnRef = useRef(null);

  const responder = useCallback((valor) => {
    setPedido(null);
    if (resolver.current) { resolver.current(valor); resolver.current = null; }
  }, []);

  const confirmar = useCallback((opts) => new Promise((resolve) => {
    // Um pedido por vez: se algo pedir confirmação com outra no ar, a anterior responde `false` —
    // ficar pendente para sempre travaria o handler que a espera.
    if (resolver.current) resolver.current(false);
    resolver.current = resolve;
    setPedido(typeof opts === 'string' ? { texto: opts } : (opts || {}));
  }), []);

  // FOCO no botão de ação assim que abre, e `Enter` confirma de qualquer lugar do diálogo: é o que o
  // nativo faz, e quem confirma dez coisas seguidas não deveria ter de pegar o mouse.
  useEffect(() => {
    if (!pedido) return undefined;
    const t = setTimeout(() => btnRef.current?.focus(), 30);
    const tecla = (e) => { if (e.key === 'Enter') { e.preventDefault(); responder(true); } };
    document.addEventListener('keydown', tecla);
    return () => { clearTimeout(t); document.removeEventListener('keydown', tecla); };
  }, [pedido, responder]);

  return (
    <ConfirmCtx.Provider value={confirmar}>
      {children}
      {/* O Escape e o clique fora respondem NÃO — a saída conservadora é sempre não fazer a ação. */}
      <Modal open={!!pedido} onClose={() => responder(false)} z={Z} fecharNoBackdrop
        maxWidth="max-w-[380px]" title={pedido?.titulo || 'Confirmar'}
        padding="p-0" paddingCabecalho="px-4 pt-3 pb-0">
        {pedido && (
          <>
            {/* `whitespace-pre-line`: as mensagens de hoje separam a pergunta da consequência com
                `\n\n`, e é assim que elas continuam legíveis ao serem convertidas sem reescrita. */}
            <p className="whitespace-pre-line px-4 pb-4 pt-2 text-[12.5px] leading-[1.55] text-gray-600">
              {pedido.texto}
            </p>
            <div className="flex justify-end gap-2 border-t border-gray-100 bg-hx-fafbfc px-4 py-2.5">
              <button type="button" className="btn-secondary !py-1" onClick={() => responder(false)}>
                {pedido.cancelar || 'Cancelar'}
              </button>
              {/* O rótulo é o VERBO da ação ("Excluir", "Desfazer vínculo"), não "OK": num diálogo
                  que se lê em dois segundos, o botão é a última chance de dizer o que vai acontecer.
                  `perigo` pinta de vermelho, e só onde há perda de dado. */}
              <button ref={btnRef} type="button" onClick={() => responder(true)}
                className={`${pedido.perigo ? 'btn-danger' : 'btn-primary'} !py-1`}>
                {pedido.confirmar || 'Confirmar'}
              </button>
            </div>
          </>
        )}
      </Modal>
    </ConfirmCtx.Provider>
  );
}

// Devolve `confirmar(opts) => Promise<boolean>`. Aceita uma string solta para o caso simples.
//
//   const confirmar = useConfirmacao();
//   if (!await confirmar({ titulo: 'Excluir?', texto: '…', confirmar: 'Excluir', perigo: true })) return;
//
// Fora do provedor devolve uma função que resolve `false` em vez de estourar: um componente montado
// isolado (um harness de teste, por exemplo) não deveria quebrar por causa de um diálogo.
// A recusa é uma CONSTANTE de módulo, e não uma arrow criada na hora: o `confirmar` entra em
// dependências de `useCallback`/`useMemo` (a `alternarAtivo` de Contatos é uma), e uma função nova
// a cada render refaria o fecho — que na tela de Contatos remonta as células da tabela inteira.
const RECUSA = () => Promise.resolve(false);

export function useConfirmacao() {
  const ctx = useContext(ConfirmCtx);
  return ctx || RECUSA;
}
