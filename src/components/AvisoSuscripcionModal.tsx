import { Link } from "react-router-dom";

/**
 * Modal "necesitás una suscripción activa" — el mismo para reproducir,
 * bajar o armar playlists desde cualquier página; cambia solo el texto.
 * `mensaje` null = cerrado.
 */
export default function AvisoSuscripcionModal({
  mensaje,
  onCerrar,
}: {
  mensaje: string | null;
  onCerrar: () => void;
}) {
  if (!mensaje) return null;
  return (
    <div className="fixed inset-0 bg-overlay flex items-center justify-center z-50 px-4">
      <div className="bg-card rounded-2xl p-6 max-w-sm w-full flex flex-col gap-4 text-center items-center">
        <span className="text-3xl" aria-hidden="true">
          🔒
        </span>
        <h2 className="font-display font-bold text-lg m-0">Necesitás una suscripción activa</h2>
        <p className="text-sm text-body leading-relaxed m-0">{mensaje}</p>
        <Link
          to="/suscripcion"
          onClick={onCerrar}
          className="text-sm font-semibold bg-accent text-white px-6 py-3 rounded-full no-underline w-full"
        >
          Suscribirme
        </Link>
        <button
          type="button"
          onClick={onCerrar}
          className="text-sm font-semibold text-muted hover:text-ink appearance-none bg-transparent border-none cursor-pointer"
        >
          Ahora no
        </button>
      </div>
    </div>
  );
}
