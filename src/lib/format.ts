/**
 * Título sugerido a partir del nombre del archivo — usado tanto en la
 * carga individual como en la masiva, para que las dos se comporten
 * igual. Saca la extensión, cambia guiones bajos por espacios y, si
 * viene de un rip de CD completo ("01 - Nombre", "01. Nombre"), saca el
 * número de pista inicial — pero solo cuando hay separador claro
 * después del número, porque si no puede ser parte real del título
 * (ej. "2step", "138 bpm").
 */
export function tituloDesdeNombreArchivo(nombre: string): string {
  const sinExtension = nombre.replace(/\.[^/.]+$/, "");
  let titulo = sinExtension.replace(/_+/g, " ").trim();
  titulo = titulo.replace(/^\d{1,3}(?:[-._)]|\s)+/, "").trim();
  return titulo;
}

export function formatearDuracion(seg: number | null): string {
  if (seg == null) return "—";
  const m = Math.floor(seg / 60);
  const s = seg % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function formatearBpm(bpm: number | null): string {
  if (bpm == null) return "—";
  return bpm % 1 === 0 ? `${bpm}` : bpm.toFixed(1);
}

/**
 * Mensajes de red crudos (fetch/TypeError) no son útiles para mostrarle a
 * un DJ cualquiera — acá se cambian por algo legible. Todo lo demás (un
 * error de Postgres/RLS, por ejemplo) se muestra tal cual.
 */
export function mensajeErrorAmigable(error: unknown): string {
  // Los errores de supabase-js (PostgrestError, AuthError) son objetos
  // planos con .message, no instancias de Error — por eso se chequea la
  // propiedad directamente en vez de usar `instanceof Error`.
  let texto = "Ocurrió un error inesperado.";
  if (error instanceof Error) {
    texto = error.message;
  } else if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof (error as { message: unknown }).message === "string"
  ) {
    texto = (error as { message: string }).message;
  } else if (typeof error === "string") {
    texto = error;
  }

  const esDeRed = /failed to fetch|networkerror|load failed|network request failed/i.test(texto);
  return esDeRed
    ? "No se pudo conectar con el servidor. Revisá tu conexión e intentá de nuevo."
    : texto;
}

/** Fecha corta en es-AR, p. ej. "4 nov 2026". */
export function formatearFecha(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("es-AR", { day: "numeric", month: "short", year: "numeric" });
}

/** Etiqueta legible para perfiles.estado_suscripcion. */
export function rotuloEstadoSuscripcion(estado?: string | null): string {
  switch (estado) {
    case "activo":
      return "Activa";
    case "vencido":
      return "Vencida";
    case "cancelado":
      return "Cancelada";
    case "pendiente":
      return "Pendiente de activación";
    default:
      return "—";
  }
}

/** Monto con el símbolo de moneda, p. ej. "$ 3.500,00 ARS". */
export function formatearMonto(monto: number | null, moneda = "ARS"): string {
  if (monto == null) return "—";
  try {
    return new Intl.NumberFormat("es-AR", { style: "currency", currency: moneda }).format(monto);
  } catch {
    return `${monto.toFixed(2)} ${moneda}`;
  }
}

/** Las 24 tonalidades en notación Camelot, en el orden habitual de la rueda. */
export const CAMELOT_KEYS: string[] = Array.from({ length: 12 }, (_, i) => i + 1).flatMap((n) => [
  `${n}A`,
  `${n}B`,
]);
