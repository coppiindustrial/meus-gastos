import { useEffect, useRef } from 'react';

// OS ATALHOS GLOBAIS DE TECLADO (copiado do Gestor, `lib/useAtalhosGlobais.js`, só com o Ctrl+K — 04/11/2026). Um
// listener só para o app, montado no Layout. Ctrl+K (Cmd+K no Mac) abre ou fecha a busca rápida; vale até com o
// cursor num campo (nenhum campo do app usa a combinação). Em CAPTURA, para não depender de um campo deixar o
// evento subir; pela tecla FÍSICA (`e.code`).
export default function useAtalhosGlobais({ alternarBusca }) {
  const ref = useRef(alternarBusca);
  ref.current = alternarBusca;

  useEffect(() => {
    const aoTeclar = (e) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.code === 'KeyK') {
        e.preventDefault();
        ref.current();
      }
    };
    window.addEventListener('keydown', aoTeclar, true);
    return () => window.removeEventListener('keydown', aoTeclar, true);
  }, []);
}
