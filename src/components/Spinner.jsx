export default function Spinner({ className = '' }) {
  return (
    <span
      role="status"
      aria-label="Carregando"
      className={`inline-block h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent ${className}`}
    />
  );
}

export function PageLoading({ label = 'Carregando…' }) {
  return (
    <div className="flex items-center justify-center gap-3 py-16 text-gray-500">
      <Spinner /> <span>{label}</span>
    </div>
  );
}
