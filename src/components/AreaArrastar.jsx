import { useRef, useState } from 'react';

// A ÁREA DE ARRASTAR da Importação do Gestor (`pages/Importacao.jsx`): borda tracejada de 2px, o ícone do
// documento, "Arraste … ou clique para selecionar" e os formatos embaixo. A caixa inteira é clicável e acende
// ao arrastar. `onArquivos(File[])`; `multiplo`: aceita vários; `compacta`: mais baixa (quando já há
// arquivos escolhidos embaixo dela).

const IconeArquivo = ({ className }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
    <path d="M14 3v4a1 1 0 0 0 1 1h4" />
    <path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2z" />
    <path d="M9 9h1M9 13h6M9 17h6" />
  </svg>
);

export default function AreaArrastar({ onArquivos, multiplo = false, titulo = 'Arraste o arquivo aqui ou', formatos = '.csv', compacta = false, desabilitada = false, accept = '.csv,text/csv' }) {
  const inputRef = useRef(null);
  const [arrastando, setArrastando] = useState(false);
  // Copia a lista: a FileList do input é "viva" e se esvazia quando o valor dele é limpo logo depois.
  const soltar = (lista) => { if (!desabilitada && lista?.length) onArquivos([...lista]); };
  return (
    <div role="button" tabIndex={0} aria-disabled={desabilitada}
      onClick={() => !desabilitada && inputRef.current?.click()}
      onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && !desabilitada) { e.preventDefault(); inputRef.current?.click(); } }}
      onDragOver={(e) => { e.preventDefault(); setArrastando(true); }}
      onDragLeave={(e) => { e.preventDefault(); setArrastando(false); }}
      onDrop={(e) => { e.preventDefault(); setArrastando(false); soltar(e.dataTransfer.files); }}
      className={`rounded-xl border-2 border-dashed text-center transition focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 ${compacta ? 'px-5 py-4' : 'px-6 py-9'} ${
        desabilitada ? 'cursor-wait border-gray-200 opacity-60'
          : arrastando ? 'cursor-copy border-brand-500 bg-brand-50' : 'cursor-pointer border-gray-300 hover:border-brand-400 hover:bg-gray-50'}`}>
      <div className={`flex items-center justify-center gap-2 ${compacta ? 'flex-row' : 'flex-col'}`}>
        <IconeArquivo className={`${compacta ? 'h-6 w-6' : 'h-10 w-10'} text-gray-300`} />
        <div>
          <div className="text-sm text-gray-700">
            {titulo} <span className="font-medium text-brand-600">clique para selecionar</span>
          </div>
          <div className="mt-0.5 text-xs text-gray-400">{formatos}</div>
        </div>
      </div>
      <input ref={inputRef} type="file" accept={accept} multiple={multiplo} className="hidden"
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => { soltar(e.target.files); e.target.value = ''; }} />
    </div>
  );
}
