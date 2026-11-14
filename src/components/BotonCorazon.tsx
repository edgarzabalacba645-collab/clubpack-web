/**
 * Corazón de favorito con el conteo del grupo al lado. `activo` = este
 * usuario lo marcó. Dos variantes: "fila" (botón con borde, para listas)
 * y "portada" (pastilla flotante semitransparente, para ir encima de una
 * carátula).
 */
export default function BotonCorazon({
  activo,
  cantidad,
  onClick,
  variante = "fila",
  disabled,
}: {
  activo: boolean;
  cantidad: number;
  onClick: () => void;
  variante?: "fila" | "portada";
  disabled?: boolean;
}) {
  const base =
    "inline-flex items-center gap-1 appearance-none cursor-pointer transition-colors disabled:opacity-60 disabled:cursor-default";
  const clase =
    variante === "portada"
      ? `${base} h-7 px-2 rounded-full border-none text-xs font-semibold shadow ${
          activo ? "bg-white text-accent-pink" : "bg-ink-fixed/55 text-white hover:bg-ink-fixed/75"
        }`
      : `${base} h-9 px-2.5 rounded-lg border text-xs font-semibold bg-transparent ${
          activo
            ? "border-accent-pink text-accent-pink"
            : "border-border text-muted hover:border-accent-pink hover:text-accent-pink"
        }`;
  return (
    <button
      type="button"
      onClick={(e) => {
        // Los corazones viven adentro de tarjetas/filas que ya tienen su
        // propio click (reproducir) — que no se dispare el de afuera.
        e.stopPropagation();
        e.preventDefault();
        onClick();
      }}
      disabled={disabled}
      aria-pressed={activo}
      aria-label={activo ? "Quitar de favoritos" : "Marcar como favorito"}
      title={activo ? "Quitar de favoritos" : "Marcar como favorito"}
      className={clase}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
        <path
          d="M12 21s-6.7-4.3-9.3-8.1C.6 9.8 1.6 5.6 5 4.3c2.1-.8 4.4 0 5.7 1.7l1.3 1.7 1.3-1.7c1.3-1.7 3.6-2.5 5.7-1.7 3.4 1.3 4.4 5.5 2.3 8.6C18.7 16.7 12 21 12 21Z"
          fill={activo ? "currentColor" : "none"}
          stroke="currentColor"
          strokeWidth="1.9"
          strokeLinejoin="round"
        />
      </svg>
      <span className="tabular-nums leading-none">{cantidad}</span>
    </button>
  );
}
