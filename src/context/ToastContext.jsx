import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

const ToastCtx = createContext(null);

let idSeq = 0;

// Quanto cada toast fica na tela. Os três antigos seguem nos 4s de sempre — o suficiente para ler
// "Registro salvo.". O de NOTIFICAÇÃO precisa do dobro: são duas linhas e uma decisão (clicar ou
// não), e 4s não dão para as duas coisas.
const MS_SIMPLES = 4000;
const MS_NOTIFICACAO = 8000;
// A saída animada tem de terminar antes do desmonte, senão o card some de um quadro para o outro.
// Casa com o `flutuante-out` do tailwind.config.js (0.13s) — mesmo par do Modal.
const MS_SAIDA = 130;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  // Os timers vivem fora do estado: pausar no hover é limpar e reagendar, e guardá-los no estado
  // faria cada pausa re-renderizar a árvore inteira abaixo do provider.
  const timers = useRef(new Map());

  const limpar = useCallback((id) => {
    const t = timers.current.get(id);
    if (t) { clearTimeout(t.saida); clearTimeout(t.vida); timers.current.delete(id); }
  }, []);

  const remove = useCallback((id) => {
    limpar(id);
    setToasts((t) => t.filter((x) => x.id !== id));
  }, [limpar]);

  // Saída em DOIS tempos: marca `saindo` (o que troca a classe de animação) e só desmonta depois
  // que ela roda. Sem isso o `flutuante-out` nunca chegaria a ser visto.
  //
  // Vale SÓ para o toast de notificação. Os três simples continuam sumindo secos, como sempre
  // sumiram: são 196 pontos de chamada, e mudar como eles aparecem é outra decisão — esta peça é
  // aditiva de propósito.
  // O cartão de notificação que está na tela (há no máximo um). Os ouvintes de foco da janela moram
  // no efeito de baixo e precisam saber qual cronômetro retomar ou pausar sem depender do estado.
  const notifAtual = useRef(null);

  const fecharAnimado = useCallback((id) => {
    if (notifAtual.current === id) notifAtual.current = null;
    limpar(id);
    setToasts((t) => t.map((x) => (x.id === id ? { ...x, saindo: true } : x)));
    const saida = setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), MS_SAIDA);
    timers.current.set(id, { saida });
  }, [limpar]);

  const agendar = useCallback((id, ms, aoVencer) => {
    limpar(id);
    timers.current.set(id, { vida: setTimeout(() => aoVencer(id), ms) });
  }, [limpar]);

  const push = useCallback((message, type = 'success') => {
    const id = ++idSeq;
    setToasts((t) => [...t, { id, message, type }]);
    agendar(id, MS_SIMPLES, remove);
    return id;
  }, [agendar, remove]);

  // O toast RICO — hoje só a notificação que chega usa. Difere dos três simples em tudo o que
  // importa: é um cartão branco (a regra do CLAUDE.md é "menu se ESCOLHE, cartão se LÊ", e isto se
  // lê), tem título e descrição separados, avatar, clique que navega e um ✕ próprio.
  //
  // UM POR VEZ: a notificação que chega enquanto a anterior ainda está na tela SUBSTITUI, somando
  // no `extra`. Sem esse teto, uma rajada empilharia cards até cobrir o canto da tela — o defeito
  // que os três simples ainda têm e que aqui não pode acontecer, porque quem dispara não é uma
  // ação da pessoa, é o mundo.
  //
  // O CRONÔMETRO SÓ ANDA COM A JANELA EM FOCO. "Aba visível" não quer dizer "alguém olhando": com o
  // Gestor aberto noutro monitor, ou atrás do Excel sem estar coberto por inteiro, o navegador
  // considera a aba visível, o sino bate, o cartão aparece, dura 8s e some sem ninguém ter visto —
  // foi assim que um dia inteiro de "passou o custo para você" passou em branco. Sem foco o cartão
  // fica esperando no canto; os 8s começam quando a pessoa volta para a janela.
  const iniciarVida = useCallback((id) => {
    if (document.hasFocus()) agendar(id, MS_NOTIFICACAO, fecharAnimado);
    else limpar(id);
  }, [agendar, fecharAnimado, limpar]);

  const notificacao = useCallback((dados) => {
    const id = ++idSeq;
    setToasts((t) => {
      const anterior = t.find((x) => x.type === 'notificacao' && !x.saindo);
      if (anterior) limpar(anterior.id);
      const extra = (dados.extra || 0) + (anterior ? 1 + (anterior.extra || 0) : 0);
      return [...t.filter((x) => x.type !== 'notificacao'), { ...dados, extra, id, type: 'notificacao' }];
    });
    notifAtual.current = id;
    iniciarVida(id);
    return id;
  }, [iniciarVida, limpar]);

  // Sair da janela PAUSA o cartão, e voltar recomeça os 8s inteiros: quem saiu no segundo 6 não viu
  // o cartão por 6 segundos, viu por um instante antes de trocar de programa.
  useEffect(() => {
    const aoFocar = () => { if (notifAtual.current != null) agendar(notifAtual.current, MS_NOTIFICACAO, fecharAnimado); };
    const aoDesfocar = () => { if (notifAtual.current != null) limpar(notifAtual.current); };
    window.addEventListener('focus', aoFocar);
    window.addEventListener('blur', aoDesfocar);
    return () => {
      window.removeEventListener('focus', aoFocar);
      window.removeEventListener('blur', aoDesfocar);
    };
  }, [agendar, fecharAnimado, limpar]);

  useEffect(() => {
    const mapa = timers.current;
    return () => {
      mapa.forEach((t) => { clearTimeout(t.saida); clearTimeout(t.vida); });
      mapa.clear();
    };
  }, []);

  // Memorizado: telas põem o `toast` nas dependências do `useCallback` que carrega os dados, e um
  // objeto novo a cada aviso recarregaria a tela (e, num erro de carga, em laço).
  const toast = useMemo(() => ({
    success: (m) => push(m, 'success'),
    error: (m) => push(m, 'error'),
    info: (m) => push(m, 'info'),
    notificacao,
  }), [push, notificacao]);

  const styles = {
    success: 'bg-green-600',
    error: 'bg-red-600',
    info: 'bg-brand-600',
  };

  return (
    <ToastCtx.Provider value={toast}>
      {children}
      {/* `items-end`: o cartão de notificação é mais largo que os simples, e sem isto os dois
          formatos ficariam centrados entre si em vez de alinhados pela borda direita. */}
      <div className="fixed bottom-4 right-4 z-[70] flex flex-col items-end gap-2">
        {toasts.map((t) => (t.type === 'notificacao' ? (
          <ToastNotificacao key={t.id} t={t}
            onFechar={() => fecharAnimado(t.id)}
            onPausar={() => limpar(t.id)}
            onRetomar={() => iniciarVida(t.id)} />
        ) : (
          <div
            key={t.id}
            role="status"
            className={`${styles[t.type]} text-white px-4 py-2 rounded-md shadow-lg text-sm max-w-sm cursor-pointer`}
            onClick={() => remove(t.id)}
          >
            {t.message}
          </div>
        )))}
      </div>
    </ToastCtx.Provider>
  );
}

// O cartão da notificação. Fica AQUI e não num arquivo próprio porque não tem vida fora do
// provider: quem o monta é o `toasts.map`, e ele não recebe nada além do que o `notificacao()`
// guardou.
function ToastNotificacao({ t, onFechar, onPausar, onRetomar }) {
  const clicavel = typeof t.onClick === 'function';
  return (
    <div
      role="status"
      // 12px de texto e cartão branco: é o vocabulário do `PopoverAjuda` e dos avisos da ficha. Os
      // três toasts simples continuam em 14px e fundo sólido — mexer neles é outra decisão.
      className={`w-[330px] rounded-xl border border-elevado bg-elevado p-3 text-left shadow-[0_10px_28px_rgba(20,28,44,.14),0_2px_6px_rgba(20,28,44,.06)] sombra-popover ${
        t.saindo ? 'animate-flutuante-out' : 'animate-flutuante-in'} motion-reduce:animate-none`}
      // Pausa no hover: sem isto o card foge do cursor de quem ia justamente clicar nele.
      onMouseEnter={onPausar}
      onMouseLeave={onRetomar}
    >
      <div className="flex items-start gap-2.5">
        {t.avatar}
        <button type="button" disabled={!clicavel}
          onClick={() => { if (clicavel) { onFechar(); t.onClick(); } }}
          className={`min-w-0 flex-1 text-left ${clicavel ? 'cursor-pointer' : 'cursor-default'}`}>
          <div className="truncate text-[12px] leading-[17px] text-gray-900">{t.titulo}</div>
          {t.descricao && (
            <div className="truncate text-[11.5px] leading-[16px] text-gray-500">{t.descricao}</div>
          )}
          {t.extra > 0 && (
            <div className="mt-0.5 text-[11px] leading-[15px] text-gray-400">
              +{t.extra} {t.extra === 1 ? 'outra' : 'outras'}
            </div>
          )}
        </button>
        {/* `active:` dois tons além do hover, só cor — a regra do retorno de clique do app. */}
        <button type="button" onClick={onFechar} aria-label="Fechar aviso"
          className="-mr-1 -mt-1 shrink-0 rounded p-1 leading-none text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 active:bg-gray-200">
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
        </button>
      </div>
    </div>
  );
}

export function useToast() {
  return useContext(ToastCtx);
}
