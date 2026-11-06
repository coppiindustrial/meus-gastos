// SEM O BANCO CENTRAL (06/11/2026: a API dele respondeu 502 por horas, e o valor de quem rende pelo CDI parou sem aviso — o
// aporte novo aparecia com "R$ 0,00" de rendimento): a faixa âmbar diz por quê e o que acontece, com o "Tentar agora". O app
// tenta de novo sozinho a cada minuto (`useDadosPatrimonio`).
export default function AvisoSemTaxas({ onTentar, className = '' }) {
  return (
    <div className={`flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[12.5px] text-amber-800 ${className}`}>
      <span className="min-w-0 flex-1">
        <b className="font-semibold">O Banco Central não está respondendo agora.</b> Os investimentos que rendem pelo CDI ficam no último
        valor registrado, sem o rendimento dos dias depois dele, até as taxas voltarem — o app tenta de novo a cada minuto.
      </span>
      <button type="button" onClick={onTentar}
        className="shrink-0 rounded-md border border-amber-400 bg-white px-2.5 py-1 text-[12px] font-semibold text-amber-800 transition-colors hover:bg-amber-100">
        Tentar agora
      </button>
    </div>
  );
}
