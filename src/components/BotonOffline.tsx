/**
 * Ícono para guardar/quitar un tema de la escucha sin conexión (cifrada,
 * en el celular — ver lib/offline.ts). Mismo patrón visual que
 * BotonCorazon: botón con borde, ícono que cambia de relleno según el
 * estado. Disponible para CUALQUIER usuario (a diferencia del botón de
 * bajar de verdad, que es solo DJ).
 */
export default function BotonOffline({
  guardado,
  cargando,
  onClick,
}: {
  guardado: boolean;
  cargando: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        // Mismo motivo que en BotonCorazon: vive adentro de filas que ya
        // tienen su propio click (reproducir).
        e.stopPropagation();
        e.preventDefault();
        onClick();
      }}
      disabled={cargando}
      aria-pressed={guardado}
      aria-label={guardado ? "Quitar de escuchar sin conexión" : "Guardar para escuchar sin conexión"}
      title={guardado ? "Guardado para escuchar sin conexión" : "Guardar para escuchar sin conexión"}
      className={`shrink-0 p-2 flex items-center justify-center rounded-lg border transition-colors appearance-none bg-transparent cursor-pointer disabled:opacity-50 ${
        guardado ? "border-accent-lime text-ink" : "border-border text-muted hover:border-ink"
      }`}
    >
      {cargando ? (
        <span className="text-xs px-0.5">…</span>
      ) : (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M7 17a4.5 4.5 0 0 1-.6-8.96A5.5 5.5 0 0 1 17.3 9.2 4 4 0 0 1 17 17H7Z"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinejoin="round"
            fill={guardado ? "currentColor" : "none"}
            fillOpacity={guardado ? 0.18 : 1}
          />
          {guardado ? (
            <path d="m9.5 13 2 2 3.5-3.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
          ) : (
            <path d="M12 10.5v5M9.8 13.3l2.2 2.2 2.2-2.2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
          )}
        </svg>
      )}
    </button>
  );
}
