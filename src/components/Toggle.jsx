// O INTERRUPTOR DO GESTOR (`components/ajustes/Ajustes.jsx`, o "Custos V/F/C" e o "Centavos" da faixa do DRE):
// trilho e bola em px inteiros, a bola ganha sombra no hover. As cores moram no index.css (`.alterna`), com a
// versão escura de lá: no escuro o ligado é o trilho CLARO com a bola escura.
// `compacto`: 32 × 18 (o da faixa de filtros). `rotulo`: o nome acessível quando não há texto ligado a ele.
export default function Toggle({ checked, onChange, disabled, compacto = false, rotulo }) {
  const caixa = compacto ? 'h-[18px] w-[32px]' : 'h-[21px] w-[38px]';
  const bola = compacto ? 'h-[14px] w-[14px]' : 'h-[17px] w-[17px]';
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={rotulo} disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`alterna group relative inline-flex ${caixa} shrink-0 items-center rounded-full p-[2px] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-800 focus-visible:ring-offset-2 ${
        checked ? 'on' : ''} ${disabled ? 'opacity-50' : ''}`}>
      <span className={`alterna-bola inline-block ${bola} transform rounded-full transition ${disabled ? '' : 'group-hover:shadow-[0_2px_4px_rgba(16,20,28,0.32)]'} ${
        checked ? 'translate-x-full' : 'translate-x-0'}`} />
    </button>
  );
}
