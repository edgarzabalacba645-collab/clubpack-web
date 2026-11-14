/**
 * Botón redondo de play/pausa de una fila o tarjeta — con candado si el
 * usuario no puede escuchar ese tema y "…" mientras se pide la URL. La
 * lógica (qué pasa al tocar) la pone quien lo usa; esto es solo el
 * dibujo, igual en todas las páginas.
 */
export default function BotonReproducir({
  puede,
  sonando,
  cargando,
  onClick,
  titulo,
  tamano = "md",
}: {
  puede: boolean;
  sonando: boolean;
  cargando: boolean;
  onClick: () => void;
  titulo: string;
  tamano?: "md" | "sm";
}) {
  const etiqueta = !puede
    ? "Necesitás una suscripción activa para escuchar esto"
    : sonando
      ? `Pausar ${titulo}`
      : `Reproducir ${titulo}`;
  const dim = tamano === "sm" ? "w-8 h-8" : "w-9 h-9";
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      aria-label={etiqueta}
      title={!puede ? etiqueta : undefined}
      className={`shrink-0 ${dim} rounded-full flex items-center justify-center appearance-none border-none cursor-pointer ${
        puede ? "bg-ink text-cream" : "bg-black/10 dark:bg-white/15 text-muted"
      }`}
    >
      {cargando ? (
        <span className="text-xs">…</span>
      ) : !puede ? (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M12 2a4 4 0 0 0-4 4v3H7a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-9a1 1 0 0 0-1-1h-1V6a4 4 0 0 0-4-4Zm-2 7V6a2 2 0 1 1 4 0v3Z" />
        </svg>
      ) : sonando ? (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <rect x="5" y="4" width="5" height="16" />
          <rect x="14" y="4" width="5" height="16" />
        </svg>
      ) : (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M6 4 L20 12 L6 20 Z" />
        </svg>
      )}
    </button>
  );
}
